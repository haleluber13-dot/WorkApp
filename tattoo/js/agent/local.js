// Local (offline) assistant engine: a rule-based natural-language interpreter that
// turns what a tattoo fan types or says into calls on the `app` API.
//
//   const engine = createLocalEngine(app);
//   const { reply, chips } = await engine.handle("put a geometric wolf on my left forearm");
//
// Design notes
// - Every sentence is split into clauses ("put a rose on my chest and make it red").
//   Each clause is interpreted against a short conversation context (the tattoo
//   "it" refers to, last body part, last relative action for "more"/"again", and a
//   pending question waiting for an answer).
// - It never throws: anything unexpected becomes a friendly reply.

import { RegionResolver, escapeRe } from "./regions.js";
import {
  COLORS, COLOR_NAMES, NUMBER_WORDS, ORDINALS, SIZE_WORDS, OPTION_HINTS, SIZE_FMT, hexLum, shadeHex, HELP_TEXT,
} from "./lexicon.js";
import { SUBJECT_WORDS, SUBSTITUTES, STYLE_WORDS, LETTER_STYLES, fixTypos, addKnownWords, addTypoTargets } from "./vocab.js";

const VERBS = [
  "put", "place", "add", "give", "make", "move", "shift", "slide", "nudge", "bump", "rotate", "turn", "tilt", "spin",
  "flip", "mirror", "show", "zoom", "remove", "delete", "erase", "get rid", "switch", "change", "set", "undo", "redo",
  "duplicate", "copy", "clone", "scale", "resize", "enlarge", "shrink", "colou?r", "paint", "fade", "age", "darken",
  "lighten", "lower", "raise", "hide", "unhide", "cent(?:er|re)", "focus", "swap", "replace", "try", "draw", "write",
  "bring", "push", "pull", "drop", "increase", "decrease", "reduce", "use", "i want", "i'd like", "i would like",
  "can you", "could you", "let's", "lets", "do the same", "same", "ink", "tattoo", "go back", "reset", "clear", "view",
  "zoom", "take", "straighten", "a bit", "slightly", "bigger", "smaller", "higher", "more", "less", "fewer",
  "taller", "shorter", "darker", "lighter", "thinner", "thicker", "slimmer", "skinnier", "heavier", "female", "male",
  "a woman", "a man", "woman", "man", "much", "way", "really", "no", "nah", "actually", "now", "also", "and", "rotated", "flipped",
];
const VERB_RE = VERBS.join("|");
const SPLIT_RE = new RegExp(
  `\\s*(?:,\\s*(?:and\\s+then\\s+|and\\s+|then\\s+)?|\\s+(?:and\\s+then|and\\s+also|then|and|plus|after\\s+that|but\\s+also|but)\\s+)(?=(?:${VERB_RE})\\b)`,
);

const PLACE_VERB = /^(?:(?:can|could|would|will) you\s+|please\s+|i (?:want|need|would like|'d like|wanna)(?: to (?:get|have|see|try|put|add))?\s+|i'd love\s+|let's (?:do|try|put|add|get)\s+|lets (?:do|try|put|add|get)\s+|how about\s+|what about\s+|try\s+|give me\s+|show me\s+(?=an?\s)|get me\s+|make me\s+|draw(?: me)?\s+|design(?: me)?\s+|create\s+|generate\s+|ink(?: me)?\s+|tattoo\s+|put\s+|place\s+|add\s+|stick\s+|slap\s+|do\s+|get\s+|write\s+|i want\s+)+/;
const PRONOUN = /\b(?:it|that|this|them|those|these|that one|this one|the tattoo|the design|the piece)\b/;

const MOD_WORDS = /\b(?:bit|little|tad|touch|lot|much|bigger|smaller|larger|higher|lower|darker|lighter|thinner|thicker|wider|narrower|brighter|bolder|softer|faded|healed|old|older|fresh|transparent|opaque|visible|invisible|upside|sideways|straight|degrees|cm|inch|inches|percent|size|color|colour|ink|black|stencil|left|right|up|down|rotated|flipped|mirrored)\b/;
const DEFAULT_REGION_FALLBACKS = ["left_forearm_inner", "forearm"];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function lowerName(n) { n = String(n || "design"); return /[“"']/.test(n) ? n : n.toLowerCase(); }
// "on your chest" but "behind your ear" / "between your shoulder blades"
function onWhere(desc) { return /^(?:behind|between|under|along|down|across)\b/.test(desc) ? desc : `on ${desc}`; }
// Size words scale with the body part: geometric mean of the absolute word size and the part's own size.
function sizeForWord(cm, regionSize) {
  if (!regionSize) return cm;
  const rel = regionSize * ({ 2.5: 0.3, 3.5: 0.4, 5.5: 0.65, 8: 0.85, 9: 1, 14: 1.3, 16: 1.45, 25: 2 }[cm] || cm / 9);
  return Math.round(Math.sqrt(cm * rel) * 2) / 2;
}
const AMOUNT_PHRASES = /\b(?:a (?:tiny|little|wee|small) (?:bit|touch)|(?:tiny|little|wee) bit|a little|a bit)\b/g;
function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

/* ───────────────────────── text preparation ───────────────────────── */

export function prepText(raw) {
  const quotes = [];
  let s = String(raw || "").replace(/[“”«»„]/g, '"').replace(/[‘’`´]/g, "'");
  s = s.replace(/"([^"]{1,80})"/g, (_, q) => { quotes.push(q.trim()); return ` qq${quotes.length - 1}qq `; });
  s = s.replace(/(^|\s)'([^']{1,60})'(?=[\s.,!?]|$)/g, (_, a, q) => { quotes.push(q.trim()); return `${a} qq${quotes.length - 1}qq `; });
  const keep = new Set();
  for (const m of s.matchAll(/(?:^|[^.!?]\s)([A-Z][a-zA-Z']+)/g)) keep.add(m[1].toLowerCase());
  s = s.toLowerCase();
  s = fixTypos(s, keep);
  s = s.replace(/[–—]/g, " - ");
  // "forty five" → 45, "twenty-two" → 22
  s = s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, a, b) => String(NUMBER_WORDS[a] + NUMBER_WORDS[b]));
  // number words only when they quantify something (keep "the one on my chest")
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b(?=\s*(?:cm|mm|centimet|millimet|in\b|inch|inches|degrees?|deg\b|percent|%|times|x\b|more|less|fewer|petals?|points?|rings?|layers?|leaves|stars?|sides?|feet|foot|ft\b|years?|steps?)|\s+and a half)/g,
    (w) => String(NUMBER_WORDS[w]));
  s = s.replace(/\b(\d+) and a half\b/g, (_, n) => String(Number(n) + 0.5));
  s = s.replace(/\bhalf (?:a|an) (cm|centimet\w*|inch|in)\b/g, "0.5 $1");
  s = s.replace(/\b(?:a|one) (centimet(?:er|re)|cm)\b/g, "1 cm").replace(/\ban inch\b/g, "1 inch");
  s = s.replace(/\b(?:a couple(?: of)?)\s+(?=cm|centimet|inch|degrees|times|more|petals)/g, "2 ");
  s = s.replace(/(\d)\s*(cm|mm|in|inch|inches|deg|degrees|°|%|x)\b/g, "$1 $2");
  s = s.replace(/(\d)\s*°/g, "$1 degrees").replace(/\bdeg\b/g, "degrees");
  s = s.replace(/[!?]+/g, (m) => m[0] === "?" ? " ? " : " . ");
  s = s.replace(/\s+/g, " ").trim();
  return { text: s, quotes };
}

export function splitClauses(text) {
  const out = [];
  for (const part of text.split(/\s*(?:[.;]+\s+|[.;]+$|\n+)\s*/)) {
    if (!part.trim()) continue;
    for (const c of part.split(SPLIT_RE)) {
      if (!c || !c.trim()) continue;
      // "a compass on my left forearm and a rose on my right one" → two placements
      const m = /^(.*\b(?:on|behind|across|around|along|down|between|under)\b.*?)\s+(?:and|plus|&)\s+((?:an?|some|another|one more)\s+.*\b(?:on|behind|across|around|along|down|between|under)\b.*)$/.exec(c.trim());
      if (m) out.push(m[1].trim(), m[2].trim());
      else out.push(c.trim());
    }
  }
  return out;
}

function stripPolite(c) {
  let prev;
  do {
    prev = c;
    c = c.replace(/^(?:ok(?:ay)?|alright|right|hey|hi|yo|so|well|um+|uh+|hmm+|now|also|then|and|but|great|cool|nice|perfect|awesome|thanks|thank you|yes|yeah|yep|sure|please|pls|plz|actually|maybe|i think|i guess|hmm maybe|no wait|wait)\b[ ,]*/, "");
    c = c.replace(/^(?:(?:can|could|shall|should) we|let's|lets|how about we|what if we|we could|i'd like to|i want to|i wanna)\s+(?=(?:try|put|move|make|turn|rotate|see|look|go|do|switch|change|add|get|flip|mirror|copy)\b)/, "");
    c = c.replace(/^(?:(?:can|could|would|will) you(?: please)?|i want you to|go ahead and|please)\s+(?=(?:make|move|rotate|turn|flip|mirror|show|zoom|remove|delete|switch|change|undo|redo|duplicate|copy|resize|scale|color|colour|hide|fade|center|centre|set|take|tilt|shift|nudge|raise|lower|swap|replace|darken|lighten|straighten|erase|clear|reset|focus|write|spell|draw|put|add|place|get|give|create|design|generate|tattoo|ink|show me|try)\b)/, "");
  } while (c !== prev);
  c = c.replace(/\b(?:please|pls|plz|for me|thanks|thank you)\b/g, " ").replace(/\s+/g, " ").trim();
  c = c.replace(/[ ,]+$/, "");
  return c;
}

/* ───────────────────────── quantities ───────────────────────── */

function parseLength(c) {
  const m = /(-?\d+(?:\.\d+)?)\s*(cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|inch(?:es)?|in\b|''|"|ft|feet|foot)/.exec(c);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const u = m[2];
  if (/^mm|millim/.test(u)) v /= 10;
  else if (/^in|''|"/.test(u)) v *= 2.54;
  else if (/ft|feet|foot/.test(u)) v *= 30.48;
  return { cm: v, index: m.index, len: m[0].length, raw: m[0] };
}

function amountLevel(c) {
  if (/\b(?:a (?:tiny|little|wee) (?:bit|touch)|a (?:hair|smidge|touch|tad|nudge)|tiny bit|very slightly|just a (?:bit|little|touch|tad|hair))\b/.test(c)) return "tiny";
  if (/\b(?:a bit|a little|slightly|bit|little|somewhat|kinda|kind of|a tad|tad|touch)\b/.test(c)) return "small";
  if (/\b(?:a lot|lots|much|way|significantly|considerably|far|really|very|super|loads|heaps|a ton|massively)\b/.test(c)) return "large";
  return "normal";
}

function findColor(c) {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return { name: "#" + h, hex: "#" + h.toLowerCase(), index: hex.index, len: hex[0].length };
  }
  for (const name of COLOR_NAMES) {
    const m = new RegExp(`\\b${escapeRe(name)}(?:dish|ish)?\\b`).exec(c);
    if (m) return { name, hex: COLORS[name], index: m.index, len: m[0].length };
  }
  return null;
}

/* ───────────────────────── landmarks for relative moves ───────────────────────── */

const CHAINS = {
  arm: { shoulder: 4, deltoid: 4, armpit: 3.6, bicep: 3, biceps: 3, "upper arm": 3, tricep: 3, elbow: 2, forearm: 1, wrist: 0, hand: -1, palm: -1, knuckles: -1.5, thumb: -1.5, fingers: -2, finger: -2 },
  leg: { hip: 4, groin: 3.8, thigh: 3, knee: 2, calf: 1, shin: 1, ankle: 0, foot: -1, heel: -1, toes: -2 },
  torso: {
    head: 10, ear: 9.5, jaw: 9.2, chin: 9.2, face: 9.5, neck: 8.5, throat: 8.5, collarbone: 7.5, clavicle: 7.5,
    shoulder: 7.5, shoulders: 7.5, armpit: 6.8, chest: 6.5, heart: 6.5, pecs: 6.5, "shoulder blade": 6.5, sternum: 6,
    ribs: 5.5, stomach: 4.5, belly: 4.5, "belly button": 4.2, navel: 4.2, "lower back": 4, waist: 4, hip: 3.5, hips: 3.5, pelvis: 3.2, butt: 3,
  },
};
const CONCEPT_CHAIN = {
  forearm: ["arm", 1], upper_arm: ["arm", 3], elbow: ["arm", 2], wrist: ["arm", 0], hand: ["arm", -1], shoulder: ["arm", 4],
  thigh: ["leg", 3], knee: ["leg", 2], calf: ["leg", 1], ankle: ["leg", 0], foot: ["leg", -1], hip: ["leg", 4], glute: ["torso", 3],
  behind_ear: ["torso", 9.5], neck_back: ["torso", 8.5], neck: ["torso", 8.5], throat: ["torso", 8.5], collarbone: ["torso", 7.5],
  shoulder_blade: ["torso", 6.5], chest: ["torso", 6.5], sternum: ["torso", 6], ribs: ["torso", 5.5], stomach: ["torso", 4.5],
  upper_back: ["torso", 6.5], spine: ["torso", 5.5], lower_back: ["torso", 4], head: ["torso", 10], face: ["torso", 9.5],
};
const LANDMARK_RE = /\b(?:(?:closer|nearer|close|next)\s+to|towards?|near|by|up to|down to|in the direction of|away from|further from|farther from)\s+(?:(?:my|the|his|her|your)\s+)?(belly button|upper arm|shoulder blade|lower back|outside|outer edge|inside|middle|cent(?:er|re)|spine|side|edge|[a-z]+)/;

function landmarkMove(word, concept) {
  word = word.trim();
  if (/^(?:middle|cent(?:er|re)|spine|sternum|midline)$/.test(word)) return { center: 1 };
  if (/^(?:side|outside|outer edge|edge|armpit)$/.test(word) && !["forearm", "upper_arm", "wrist", "hand", "elbow"].includes(concept)) return { center: -1 };
  const [chain, level] = CONCEPT_CHAIN[concept] || ["torso", 6];
  const words = [word, word.replace(/s$/, "")];
  for (const w of words) if (CHAINS[chain][w] != null) {
    const d = CHAINS[chain][w] - level;
    return d === 0 ? null : { up: Math.sign(d) };
  }
  // limb tattoo, torso landmark: limbs hang from the torso; above-waist landmarks are "up".
  for (const w of words) if (CHAINS.torso[w] != null) {
    if (chain === "arm") return { up: 1 };
    if (chain === "leg") return { up: CHAINS.torso[w] >= 3 ? 1 : -1 };
  }
  for (const w of words) {
    if (CHAINS.arm[w] != null && chain === "torso") return { center: -1 };
    if (CHAINS.leg[w] != null && chain !== "leg") return { up: -1 };
  }
  return null;
}

/* ───────────────────────── engine ───────────────────────── */

export function createLocalEngine(app, { random = Math.random } = {}) {
  const ctx = {
    currentId: null,       // tattoo "it" refers to (when app has no selection)
    lastRegion: null,
    lastSide: null,
    lastRelative: null,    // { kind, clause } for "more", "again", "even more"
    pending: null,         // { kind: "where" | "what" | "style", ... }
    designs: new Map(),    // designId → { prompt, styleId, opts, name }
    lastDesignId: null,
    lastView: "front",
    regionRot: {},         // region id → rotation the app gives a fresh tattoo there (limb axis)
    lastPatch: null,       // last relative move/rotate patch, for "no, the other way"
  };
  let resolver = null, resolverKey = "";

  /* app helpers */
  function R() {
    let list = [];
    try { list = app.listRegions() || []; } catch {}
    const key = list.map((r) => r.id).join(",");
    if (!resolver || key !== resolverKey) {
      resolver = new RegionResolver(list); resolverKey = key;
      const ws = [];
      for (const r of list) for (const a of [r.label, ...(r.aliases || [])]) ws.push(...String(a || "").toLowerCase().split(/[^a-z]+/));
      addKnownWords(ws);
    }
    return resolver;
  }
  const state = () => { try { return app.getState() || {}; } catch { return {}; } };
  const tattoos = () => state().tattoos || [];
  const tattooById = (id) => tattoos().find((t) => t.id === id) || null;
  const units = () => { try { return app.getSetting && app.getSetting("place.units") === "in" ? "in" : "cm"; } catch { return "cm"; } };
  const fmtSize = (cm) => SIZE_FMT(cm, units());
  const fmtLen = (cm) => (units() === "in" ? `${Math.round(cm / 2.54 * 4) / 4}″` : `${round1(cm)} cm`);
  function styles() { try { return app.listStyles() || []; } catch { return []; } }

  function current() {
    const st = state();
    const list = st.tattoos || [];
    if (st.selectedId && list.some((t) => t.id === st.selectedId)) return list.find((t) => t.id === st.selectedId);
    if (ctx.currentId && list.some((t) => t.id === ctx.currentId)) return list.find((t) => t.id === ctx.currentId);
    return list[list.length - 1] || null;
  }

  function designInfo(designId) {
    const st = state();
    const d = (st.designs || []).find((x) => x.id === designId);
    const mine = ctx.designs.get(designId);
    const info = {
      id: designId,
      name: (mine && mine.name) || (d && d.name) || "tattoo",
      style: (mine && mine.styleId) || (d && d.style) || null,
      prompt: mine && mine.prompt,
      opts: cleanOpts((mine && mine.opts) || (d && d.params) || {}),
    };
    info.friendly = friendlyName(info);
    return info;
  }
  function tattooName(t) {
    if (!t) return "tattoo";
    return designInfo(t.designId).friendly;
  }

  /** Generator opts, unwrapping {styleId, opts:{…}} envelopes (app.createDesign nests them). */
  function cleanOpts(o) {
    let v = o || {};
    for (let i = 0; i < 4 && v && typeof v === "object" && v.opts && typeof v.opts === "object" && ("styleId" in v || Object.keys(v).length <= 2); i++) v = v.opts;
    const out = { ...(v || {}) };
    delete out.styleId; delete out.opts;
    return out;
  }

  /** "Animals koi" → "koi", "Skull sugar" → "sugar skull", "Floral rose" → "rose". */
  function friendlyName(info) {
    const raw = String(info.name || "design");
    if (/["“]/.test(raw)) return raw.replace(/^"([^"]*)"/, "“$1”");
    const st = styles().find((x) => x.id === info.style);
    const base = st ? st.name.replace(/\s*\(.*?\)/g, "").replace(/\s*\/.*$/, "").replace(/^Lettering:\s*/i, "").trim() : "";
    let extra = base && raw.toLowerCase().startsWith(base.toLowerCase()) ? raw.slice(base.length).trim() : "";
    const lc = raw.toLowerCase();
    if (!st || !extra) return lc;
    extra = extra.toLowerCase();
    const o = info.opts || {};
    switch (st.id) {
      case "animals": return o.render && !/^(?:line|color)$/.test(o.render) ? `${o.render} ${extra}` : extra;
      case "floral": return o.arrangement && o.arrangement !== "single" ? `${extra} ${o.arrangement}` : extra;
      case "minimal-symbols": case "compass": case "feather-dreamcatcher": case "sun-moon": return extra.replace(/^sun moon$/, "sun & moon");
      case "skull": return extra === "classic" ? "skull" : extra === "roses" ? "skull with roses" : extra === "crossbones" ? "skull and crossbones" : extra === "dagger" ? "skull with dagger" : `${extra} skull`;
      case "zodiac": return `${extra} ${o.show === "glyph" ? "zodiac sign" : "constellation"}`;
      case "armband": return `${extra} armband`;
      case "brush": return extra === "enso" ? "ensō brush circle" : `brush-stroke ${extra}`;
      case "tribal": case "polynesian": case "maori": return `${base.toLowerCase()} ${extra}`.replace(/ centerpiece$/, " piece");
      default: return lc;
    }
  }
  function where(t) { return R().describe(t.region); }

  function remember(t) {
    if (!t) return;
    ctx.currentId = t.id;
    ctx.lastRegion = t.region;
    const info = R().get(t.region);
    if (info && info.side !== "center") ctx.lastSide = info.side;
    try { app.selectTattoo && app.selectTattoo(t.id); } catch {}
  }

  async function makeDesign({ prompt, styleId, opts, name }) {
    const args = {};
    if (styleId) args.styleId = styleId;
    if (opts && Object.keys(opts).length) args.opts = opts;
    if (prompt) args.prompt = prompt;
    if (name) args.name = name;
    const d = await app.createDesign(args);
    if (!d || !d.id) throw new Error("no design");
    const params = d.params || {};
    const o = cleanOpts(params);
    ctx.designs.set(d.id, {
      prompt: prompt || (ctx.designs.get(ctx.lastDesignId) || {}).prompt || d.name,
      styleId: d.style || params.styleId || styleId || null,
      opts: Object.keys(o).length ? o : { ...(opts || {}) },
      name: d.name || name || prompt || "design",
    });
    ctx.lastDesignId = d.id;
    return d;
  }

  function defaultRegion() {
    const r = R();
    let id = null;
    try { id = app.getSetting && app.getSetting("designs.defaultRegion"); } catch {}
    if (id && r.has(id)) return id;
    for (const f of DEFAULT_REGION_FALLBACKS) {
      if (r.has(f)) return f;
      const p = r.pick(f, { side: "left" });
      if (p) return p;
    }
    return r.list[0] ? r.list[0].id : null;
  }

  function regionOccupied(regionId) { return tattoos().some((t) => t.region === regionId); }

  const WRAP_CM = { upper_arm: 28, forearm: 24, wrist: 16, elbow: 26, ankle: 22, calf: 34, knee: 36, thigh: 46, neck: 34, neck_back: 34, throat: 34, finger: 6, thumb: 6 };
  function isBand(design) {
    const info = designInfo(design.id);
    const o = info.opts || {};
    return info.style === "armband" || /\b(?:armband|band|half-sleeve-band|lace-band|border)\b/.test(String(o.form || "")) || /\b(?:armband|band)\b/.test(info.friendly);
  }
  /** A mirrored copy should face the other way too (pairs of swallows face each other) — but text must stay
      readable. app.duplicateTattoo({mirror:true}) now does this itself, so nothing is left to do here. */
  async function mirrorArt(dup) { return dup; }
  // eslint-disable-next-line no-unused-vars
  async function mirrorArtLegacy(dup, designId) {
    const info = designInfo(designId || dup.designId);
    if (/^lettering/.test(info.style || "") || (info.opts && info.opts.text && !/traditional|neo/.test(info.style || ""))) return dup;
    try { return (await app.updateTattoo(dup.id, { flip: !dup.flip }, { checkpoint: false })) || dup; } catch { return dup; }
  }

  /** Rotation the app gives a fresh tattoo on this body part (design "up" along the limb). */
  async function regionDefaultRot(t) {
    if (!t) return 0;
    if (ctx.regionRot[t.region] != null) return ctx.regionRot[t.region];
    try {
      // Probe without touching the undo history: snap to the region, read the angle, put it back.
      const keep = { position: t.position, normal: t.normal, rotation: t.rotation };
      const probe = await app.updateTattoo(t.id, { region: t.region }, { checkpoint: false });
      const rot = probe && Number.isFinite(probe.rotation) ? probe.rotation : 0;
      await app.updateTattoo(t.id, keep, { checkpoint: false });
      ctx.regionRot[t.region] = rot;
      return rot;
    } catch { return 0; }
  }

  /* ── design vocabulary ── */
  let vocab = null;
  function V() {
    if (vocab) return vocab;
    const map = new Map(); // phrase → subject id
    for (const [id, ws] of Object.entries(SUBJECT_WORDS)) for (const w of ws) map.set(w, id);
    let subs = [];
    try { subs = (app.listSubjects && app.listSubjects()) || []; } catch {}
    for (const sj of subs) {
      if (!sj || !sj.id) continue;
      if (!map.has(sj.id)) map.set(String(sj.id).toLowerCase(), sj.id);
      if (sj.name && !map.has(String(sj.name).toLowerCase())) map.set(String(sj.name).toLowerCase(), sj.id);
    }
    const phrases = [...map.keys()].sort((a, b) => b.length - a.length);
    const subIds = new Set([...map.values()]);
    addKnownWords([...map.keys()].flatMap((k) => k.split(" ")).concat(Object.keys(SUBSTITUTES)).concat(COLOR_NAMES.flatMap((c) => c.split(" "))));
    addTypoTargets([...map.keys()].filter((k) => !k.includes(" ")));
    vocab = { map, phrases, subIds, re: phrases.map((p) => [p, new RegExp(`\\b${escapeRe(p)}(?:s|es)?\\b`)]) };
    return vocab;
  }
  /** Known motifs named in the text, in order of appearance. */
  function findSubjects(text) {
    const out = [];
    let t = " " + text + " ";
    for (const [p, re] of V().re) {
      const m = re.exec(t);
      if (!m) continue;
      out.push({ id: V().map.get(p), word: p, index: m.index - 1 });
      t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length); // don't double count "koi fish"/"fish"
    }
    return out.sort((a, b) => a.index - b.index);
  }
  function findSubstitute(text) {
    for (const [w, id] of Object.entries(SUBSTITUTES).sort((a, b) => b[0].length - a[0].length)) {
      const m = new RegExp(`\\b${escapeRe(w.replace(/_/g, " "))}(?:s|es)?\\b`).exec(text);
      if (m) return { word: m[0], id, index: m.index };
    }
    return null;
  }
  /** Lettering in a clause: quotes, "that says X", "the name X", "write X", "X in gothic letters". */
  function extractLettering(c, quotes, raw) {
    const STOP = "(?=\\s+(?:on|onto|across|along|behind|in|under|down|around|at|over|inside|above|below|between|for|with|using|and)\\b|\\s*$)";
    let m, v = null;
    if ((m = /qq(\d+)qq/.exec(c))) return { text: quotes[+m[1]], span: m[0] };
    const pats = [
      new RegExp(`\\b(?:that|which)?\\s*(?:says|say|saying|reads|reading|spells|spelling|with the (?:words?|text|name)|with (?:the )?text)\\s+(.+?)${STOP}`),
      new RegExp(`\\b(?:names?|initials?|the words?|the date|date)\\s+(?!in\\b|on\\b|tattoo)(.+?)${STOP}`),
      new RegExp(`^(?:write|spell|letter|ink|tattoo)\\s+(?:the\\s+)?(?:words?\\s+|name\\s+)?(.+?)${STOP}`),
      /^(?:(?:put|place|add|get|ink|tattoo|write|do|give me|i want|i'd like|i would like|can i get|how about|what about)\s+)?(?:(?:a|an|the|my)\s+)?(.+?)\s+in\s+(?:(?:a|an|some|nice|pretty|bold|big|small|thin|fine|elegant|fancy|old|cool|capital|block)\s+)*(?:[a-z]+\s+)?(?:letters|lettering|font|script|cursive|calligraphy|writing|handwriting|typewriter|gothic|caps|chicano)\b/,
    ];
    for (const re of pats) {
      m = re.exec(c);
      if (!m) continue;
      v = m[1].replace(/^(?:a|an|the|my)\s+/, "").replace(/[\s,.]+$/, "").trim();
      if (!v || v.length > 40 || /^(?:it|that|this|one|lettering|letters|text|font|style|tattoo)$/.test(v)) { v = null; continue; }
      if (re === pats[3] && (findSubjects(v).length || R().find(v, {}) || STYLE_WORDS.test(v) || /\b(?:make|it|move|put|add|change)\b/.test(v))) { v = null; continue; }
      break;
    }
    if (!v && /[a-z]/.test(String(raw)) && /^(?:put|place|add|get|ink|tattoo|do|i want|i'd like|give me|can i get)\b/.test(c)) {
      // a capitalised word that isn't a motif or body part: "put Mom on my wrist", "add Leo on my chest"
      const caps = [...String(raw).matchAll(/(?:^|[^.!?\s]\s+)((?:[A-Z][a-zA-ZÀ-ÿ'’]+)(?:\s+[A-Z][a-zA-ZÀ-ÿ'’]+)*)/g)].map((x) => x[1])
        .filter((w) => !/^(?:I|I'm|I'd|Can|Could|Please|Put|Add|Make|My|The|A|An|Hey|Hi|Ok|Okay|Left|Right)$/.test(w) && !findSubjects(w.toLowerCase()).length && !R().find(w.toLowerCase(), {}) && !STYLE_WORDS.test(w.toLowerCase()) && !findColor(w.toLowerCase()));
      if (caps.length && c.includes(caps[0].toLowerCase())) { v = caps[0].toLowerCase(); m = [caps[0].toLowerCase()]; }
    }
    if (!v) return null;
    // original capitalisation from what the user typed
    const words = v.split(/\s+/).map(escapeRe).join("[\\s,.'’-]+");
    const orig = new RegExp(`\\b${words}\\b`, "i").exec(raw);
    return { text: orig ? orig[0] : v, span: m[0], value: v };
  }
  function letteringStyleFor(c) {
    const ids = new Set(styles().map((x) => x.id));
    for (const [id, re] of LETTER_STYLES) if (re.test(c) && ids.has(id)) return id;
    return null;
  }
  /** Does this clause ask for a (new) design, and what? */
  function designIntent(c, quotes, raw) {
    const subs = findSubjects(c);
    const sub = subs.length ? null : findSubstitute(c);
    const sm = STYLE_WORDS.exec(c);
    const letter = extractLettering(c, quotes, raw);
    return { subs, sub, style: sm ? sm[0] : null, letter, any: !!(subs.length || sub || sm || letter) };
  }
  // Commands that act on an existing tattoo ("make the rose red", "move the skull down", "zoom in on the dragon").
  const EDIT_START = /^(?:make|change|turn|switch|swap|replace|redo|convert|recolou?r|colou?r|paint|move|shift|slide|nudge|bump|push|pull|drag|rotate|spin|tilt|flip|mirror|remove|delete|erase|get rid of|hide|unhide|show|zoom|focus|resize|scale|enlarge|shrink|copy|duplicate|clone|fade|age|darken|lighten|center|centre|straighten|lower|raise|bring|take|undo|redo|reset)\b/;
  function isNewDesignRequest(c, intent) {
    if (!intent.any) return false;
    if (/^(?:make|draw|design|create|show)\s+(?:me\s+)?(?:an?|some|another)\b/.test(c)) return true;
    if (/^(?:put|place|add|stick|slap|ink|tattoo|get|give)\s+(?:me\s+)?(?:an?|some|another|one more|two|\d)\b/.test(c)) return true;
    if (intent.letter && !EDIT_START.test(c) && (R().find(c, {}) || /qq\d+qq/.test(c) || /^(?:write|spell)\b/.test(c))) return true;
    if (tattoos().length && /\b(?:to|onto|with|in|inside|on)\s+(?:it|that|this|them|the design|the tattoo)\b/.test(c) && !/\b(?:next to|beside|near|by|under|above|below|over|around)\s+(?:it|that|this|them)\b/.test(c)) return false;
    if (EDIT_START.test(c)) return false;
    if (/^(?:more|less|fewer|thinner|thicker|bolder|no|without|with|add more)\b/.test(c)) return false;
    // "the rose smaller", "my wolf tattoo": a reference to something already on the body
    for (const sj of intent.subs) {
      const before = c.slice(0, sj.index);
      if (/\b(?:the|my|that|this|those|these|your)\s+(?:\w+\s+)?$/.test(before) && tattoos().some((t) => tattooMatchesSubject(t, sj))) {
        if (!/^(?:put|place|add|i want|i'd like|give me|get)\b/.test(c)) return false;
      }
    }
    if (/^(?:what|which|why|how|is|are|does|do|can i|should)\b/.test(c) && /\?$|^(?:what|which|why|how)\b/.test(c) && !/\b(?:about|if)\b/.test(c)) return false;
    // style word alone is a restyle request when something is already there ("watercolor please")
    if (!intent.subs.length && !intent.sub && !intent.letter && tattoos().length && !R().find(c, {}) && !/^(?:an?|some)\s/.test(c) && !/^(?:put|place|add|i want|i'd like|give me|get me|do|try|how about|what about)\b/.test(c)) return false;
    return true;
  }
  function tattooMatchesSubject(t, sj) {
    const info = designInfo(t.designId);
    const o = info.opts || {};
    const vals = [o.subject, o.flower, o.symbol, o.variant, o.scene, o.sign, o.pattern, o.shape, o.form].filter((v) => v != null).map(String);
    if (vals.some((v) => v === sj.id || v.replace(/-/g, "").includes(sj.id) || sj.id.includes(v.replace(/-/g, "")))) return true;
    return new RegExp(`\\b${escapeRe(sj.word.replace(/s$/, ""))}`).test(`${info.friendly} ${String(info.name).toLowerCase()}`);
  }

  /** Find a body part in a clause; returns the match and the clause without it. */
  function findRegion(c, { preferFree = false } = {}) {
    const cur = current();
    const curInfo = cur && R().get(cur.region);
    const m = R().find(c, { defaultSide: ctx.lastSide || "left", otherSideOf: curInfo ? curInfo.side : ctx.lastSide });
    if (!m) return null;
    if (preferFree && !m.sideExplicit && regionOccupied(m.regionId)) {
      const other = R().mirrorOf(m.regionId);
      if (other && !regionOccupied(other)) m.regionId = other;
    }
    const rest = (c.slice(0, m.start) + " " + c.slice(m.end)).replace(/\s+/g, " ").trim();
    return { ...m, rest };
  }

  /* ── target selection: "the one on my chest", "the rose", "the first one", "them all" ── */
  function resolveTarget(c) {
    const list = tattoos();
    const out = { ids: null, rest: c, explicit: false, all: false };
    if (!list.length) return out;
    let m;
    if ((m = /\b(?:all of them|them all|all (?:my |the |of my |of the )?(?:tattoos|designs|pieces|ones)|every(?: one|one| tattoo)|both(?: of them)?|all(?=\s*$))\b/.exec(c))) {
      out.ids = list.map((t) => t.id); out.all = true; out.explicit = true;
      out.rest = (c.slice(0, m.index) + c.slice(m.index + m[0].length)).trim();
      return out;
    }
    if ((m = /\b(?:the|my)\s+(left|right)(?:[- ]side)?\s+(?:one|tattoo|design|piece)\b|\bthe (?:one|tattoo|design|piece) on the (left|right)(?: side)?\b(?!\s+(?:side of|of|arm|forearm|wrist|hand|leg|thigh|calf|ankle|foot|shoulder|ear|hip|chest|ribs?|neck))/.exec(c))) {
      const side = m[1] || m[2];
      const hits = list.filter((t) => (R().get(t.region) || {}).side === side);
      if (hits.length) {
        out.ids = [hits[hits.length - 1].id]; out.explicit = true;
        out.rest = (c.slice(0, m.index) + " " + c.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
        return out;
      }
      out.missing = `your ${side} side`; out.explicit = true;
      return out;
    }
    if ((m = /\bthe (?:one|tattoo|design|piece|thing)s?\s+(?:that's\s+|that is\s+|i put\s+|i have\s+)?(?:on|at|behind|near|by|in|over|across|along)\s+/.exec(c))) {
      const after = c.slice(m.index);
      const r = R().find(after, {});
      if (r) {
        const hits = tattoosAt(r);
        if (hits.length) {
          out.ids = [hits[hits.length - 1].id]; out.explicit = true;
          out.rest = (c.slice(0, m.index) + " " + after.slice(r.end)).replace(/\s+/g, " ").trim();
          return out;
        }
        out.missing = R().describe(r.regionId); out.explicit = true;
        out.rest = (c.slice(0, m.index) + " " + after.slice(r.end)).replace(/\s+/g, " ").trim();
        return out;
      }
    }
    if ((m = /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th|last|latest|newest|most recent|previous|oldest|earliest)\s+(?:one|tattoo|design|piece)\b/.exec(c))) {
      let i = ORDINALS[m[1]];
      i = i < 0 ? list.length + i : i;
      if (list[i]) {
        out.ids = [list[i].id]; out.explicit = true;
        out.rest = (c.slice(0, m.index) + c.slice(m.index + m[0].length)).trim();
        return out;
      }
    }
    // "my chest tattoo", "the forearm one"
    if ((m = /\b(?:my|the)\s+((?:left\s+|right\s+)?(?:inner\s+|outer\s+)?[a-z]+(?:\s+[a-z]+)?)\s+(?:tattoo|one|piece|design)\b/.exec(c))) {
      const r = R().find(m[1], {});
      if (r) {
        const hits = tattoosAt(r);
        if (hits.length) {
          out.ids = [hits[hits.length - 1].id]; out.explicit = true;
          out.rest = (c.slice(0, m.index) + c.slice(m.index + m[0].length)).trim();
          return out;
        }
      }
    }
    // "the rose", "the wolf tattoo"
    const re = /\b(?:the|that|my)\s+([a-z]{3,})(?:\s+(?:tattoo|one|design|piece))?\b/g;
    while ((m = re.exec(c))) {
      const w = m[1];
      if (/^(?:one|tattoo|design|piece|thing|back|front|side|left|right|other|same|lines?|petals?|size|color|colour|style|skin|body|view|camera|ink|opacity|middle|center|centre|top|bottom|wrist|elbow|shoulder|neck|spine|edge)$/.test(w)) continue;
      const hits = list.filter((t) => new RegExp(`\\b${escapeRe(w.replace(/s$/, ""))}`).test(tattooName(t)));
      if (hits.length) {
        out.ids = [hits[hits.length - 1].id]; out.explicit = true;
        out.rest = (c.slice(0, m.index) + c.slice(m.index + m[0].length)).trim();
        return out;
      }
    }
    return out;
  }

  function tattoosAt(r) {
    const list = tattoos();
    let hits = list.filter((t) => t.region === r.regionId);
    if (!hits.length) hits = list.filter((t) => R().matchesConcept(t.region, r.concept) && (!r.sideExplicit || (R().get(t.region) || {}).side === r.side));
    if (!hits.length && !r.sideExplicit) hits = list.filter((t) => R().matchesConcept(t.region, r.concept));
    return hits;
  }

  /* ───────────────────────── main entry ───────────────────────── */

  async function handle(input) {
    const raw = String(input || "").trim();
    if (!raw) return { reply: "I'm listening — what would you like to try?", chips: starterChips() };
    const { text, quotes } = prepText(raw);
    const clauses = splitClauses(text);
    const results = [];
    for (let i = 0; i < clauses.length; i++) {
      let r;
      try {
        r = await runClause(clauses[i], quotes, raw, i, clauses.length);
      } catch (e) {
        console.warn("[assistant] clause failed", clauses[i], e);
        r = { say: friendlyError(e), info: true };
      }
      if (r) results.push(r);
      if (r && r.stop) break;
    }
    return compose(results);
  }

  function friendlyError(e) {
    const msg = e && e.message ? String(e.message) : "";
    if (/loading/i.test(msg)) return "The design engine is still loading — give it a second and try again.";
    if (/region/i.test(msg)) return "I couldn't find that spot on the body.";
    if (/design/i.test(msg)) return "I couldn't make that design — try describing it another way?";
    return "Hmm, that didn't work. Could you try saying it another way?";
  }

  function compose(results) {
    if (!results.length) return { reply: "Sorry, I didn't catch that. " + quickTip(), chips: starterChips() };
    const done = results.filter((r) => r.done);
    const info = results.filter((r) => !r.done);
    let reply = "";
    if (done.length) {
      const parts = done.map((r) => r.done);
      let body = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
      reply = (done[0].lead === false ? cap(body) : "Done — " + body) + ".";
    }
    const seen = new Set();
    for (const r of info) { if (seen.has(r.say)) continue; seen.add(r.say); reply += (reply ? " " : "") + r.say; }
    const last = results[results.length - 1];
    if (last.follow && !info.some((r) => r.ask)) reply += " " + last.follow;
    const chips = (last.chips || results.reduce((a, r) => r.chips || a, null)) || followChips(last.kind);
    return { reply: reply.trim(), chips, actions: results.map((r) => r.kind).filter(Boolean), image: results.find((r) => r.image)?.image };
  }

  function quickTip() {
    return pick([
      "Try “put a small rose on my left wrist” or “make it bigger”.",
      "You can say things like “add a mandala on my upper back”.",
      "Try “show me the back” or “undo”.",
    ], random);
  }

  function starterChips() {
    return ["Geometric wolf on my left forearm", "Small rose behind my right ear", "Show me the back", "What can you do?"];
  }
  function followChips(kind) {
    const has = tattoos().length > 0;
    switch (kind) {
      case "place": case "copy": return ["Bigger", "Smaller", "Rotate 15°", "Mirror to other side", "Change style"];
      case "size": return ["Bigger", "Smaller", "A bit higher", "Make it red"];
      case "move": return ["A bit higher", "A bit lower", "Bigger", "Show it to me"];
      case "rotate": case "flip": return ["Rotate 15°", "Straighten it", "Flip it", "Bigger"];
      case "ink": case "age": case "opacity": return ["Black ink", "Make it look healed", "Fresh ink", "Bigger"];
      case "body": case "skin": return ["Female body", "Male body", "Taller", "Darker skin", "Lighter skin"];
      case "camera": {
        const v = ctx.lastView || "";
        const list = ["Show me the front", "Show me the back", "Show me the left side"].filter((x) => !x.endsWith(" " + v) && !x.endsWith(v + " side"));
        return has ? [...list, "Zoom in on it"] : [...list, "Rose on my chest"];
      }
      case "remove": return has ? ["Undo", "Remove all", "Show me the front"] : ["Undo", "Mandala on my upper back", "Rose on my chest"];
      case "design": return ["More detail", "Simpler", "Thinner lines", "Another variation", "Bigger"];
      case "mirror": return ["Bigger", "Show me the front", "Undo"];
      default: return has ? ["Bigger", "Smaller", "Make it red", "Show me the back"] : starterChips();
    }
  }
  function regionChips() {
    return ["Left forearm", "Chest", "Upper back", "Behind my right ear", "Right shoulder"];
  }

  /* ───────────────────────── clause interpreter ───────────────────────── */

  const SMALLTALK_WORDS = new Set(("yeah yes yep yup ya ok okay alright cool nice great perfect awesome sweet wow lovely beautiful amazing good love " +
    "it i that's thats that is looks look looking it's its sick dope fire thanks thank you so much thx ty cheers really very super nice " +
    "gorgeous stunning brilliant excellent fantastic wonderful neat rad lit right exactly fine all done just like this").split(" "));
  const POSITIVE = /\b(?:cool|nice|great|perfect|awesome|sweet|wow|lovely|beautiful|amazing|good|love|sick|dope|fire|thanks|thank|thx|ty|cheers|gorgeous|stunning|brilliant|excellent|fantastic|wonderful|neat|rad|lit|exactly|fine|done)\b/;
  function isSmallTalk(c) {
    const ws = c.replace(/[^a-z' ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    return ws.length > 0 && ws.length <= 9 && ws.every((w) => SMALLTALK_WORDS.has(w)) && POSITIVE.test(c);
  }

  async function runClause(clause0, quotes, raw, index, total) {
    const c0 = clause0.trim().replace(/[ ,.]+$/, "");
    if (isSmallTalk(c0)) {
      if (/\b(?:done|that's it|thats it|all done)\b/.test(c0) && !POSITIVE.test(c0.replace(/\b(?:done|fine)\b/g, "")))
        return { say: "Great — your design is saved automatically. Come back anytime!", info: true, kind: "chat" };
      return { say: pick(["Glad you like it! Anything else — another piece, or tweak this one?", "Looks great on you! Want to try another design?", "Nice! Want to see it from another angle?"], random), info: true, kind: "chat" };
    }
    if (/^(?:hi|hello|hey|hiya|heya|yo|good (?:morning|afternoon|evening)|sup|howdy|hi there|hey there)(?: there)?(?: (?:claude|assistant|buddy|friend))?$/.test(c0))
      return { say: "Hi! Tell me what you'd like inked and where — for example “a small rose behind my right ear”.", info: true, chips: starterChips(), kind: "hello" };
    // "no, the other way" → reverse the last move/rotation
    if (/^(?:(?:no|nah|nope|wrong way|oops)[ ,]*)?(?:the |go the |turn it the |move it the |rotate it the )?(?:other|opposite) (?:way|direction)(?: please)?$|^(?:no|nah)[ ,]+(?:the )?wrong (?:way|direction)$|^wrong (?:way|direction)$/.test(c0)) {
      const t = current(), lp = ctx.lastPatch;
      if (!t || !lp) return { say: "Which way should it go — up, down, left or right?", info: true, ask: true, chips: ["A bit higher", "A bit lower", "Rotate 15°", "Rotate -15°"] };
      const patch = {};
      if (lp.rotateBy) patch.rotateBy = -2 * lp.rotateBy;
      if (lp.moveCm) patch.moveCm = { right: -2 * (lp.moveCm.right || 0), up: -2 * (lp.moveCm.up || 0) };
      await app.updateTattoo(t.id, patch);
      ctx.lastPatch = { rotateBy: patch.rotateBy ? -lp.rotateBy : 0, moveCm: patch.moveCm ? { right: -(lp.moveCm.right || 0), up: -(lp.moveCm.up || 0) } : null };
      return { done: lp.rotateBy ? `rotated it ${Math.abs(Math.round(lp.rotateBy))}° the other way instead` : "moved it the other way instead", kind: lp.rotateBy ? "rotate" : "move" };
    }
    // "too big, go back" / "nah undo that"
    if (/^(?:(?:no|nah|nope|hmm|ugh|eh|too (?:big|small|much|far|high|low|dark|light)|that's (?:worse|too much|wrong)|thats (?:worse|too much|wrong)|i don't like (?:it|that)|i dont like (?:it|that))[ ,]+)+(?:go back|undo(?: that| it)?|revert(?: it| that)?|change it back|put it back|back)$/.test(c0)) {
      await app.undo();
      return { done: "undid that", kind: "undo", chips: ["Redo", "Smaller", "Bigger"] };
    }
    let c = stripPolite(clause0);
    if (!c) return null;

    // Answering a pending question?
    if (ctx.pending) {
      const p = ctx.pending;
      ctx.pending = null;
      if (p.kind === "where") {
        const reg = findRegion(c, { preferFree: true });
        if (reg && reg.rest.replace(/\b(?:on|my|the|please|there|it|put it|i want it|maybe|how about|what about|let's do|lets do|go with)\b/g, "").trim().length < 3) {
          return placeNew({ ...p.spec, regionId: reg.regionId, regionMatch: reg, both: p.spec.both || /\b(?:each|both)\b/.test(c) });
        }
      } else if (p.kind === "what") {
        if (!isCommandLike(c)) {
          const spec = parsePlacementSpec(c, quotes, raw);
          if (spec.prompt || spec.lettering) return placeNew({ ...spec, regionId: spec.regionId || p.regionId });
        }
      } else if (p.kind === "unknown") {
        if (/^(?:yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|go for it|fine|that works|please|try it|alright)\b/.test(c0) || /^(?:try it|do it|go ahead)\b/.test(c)) return placeNew(p.spec);
        const it = designIntent(c, quotes, raw);
        if (it.subs.length || it.sub || it.letter) {
          const spec = parsePlacementSpec(c.replace(/\binstead\b/, " "), quotes, raw);
          return placeNew({ ...spec, regionId: spec.regionId || p.spec.regionId });
        }
      }
    }

    // ── help
    if (/^(?:help|\?|what can you do|what do you do|how does this work|how do i\b.*|what can i (?:say|ask)|commands|options|tips?)\b/.test(c) || /\bwhat can you do\b/.test(c))
      return { say: HELP_TEXT, info: true, chips: starterChips(), kind: "help" };

    // ── undo / redo
    let m;
    if (/^(?:(?:oops|never ?mind|nevermind|no|nah|wait|actually|sorry)[ ,]+)+(?:undo(?: that| it)?|go back|revert(?: it| that)?|put it back|bring it back|cancel that|take (?:that|it) back)$/.test(c0)) {
      await app.undo();
      return { done: "undid that", kind: "undo", chips: ["Redo", "Undo", "Show me the front"] };
    }
    if ((m = /^(?:undo|go back|revert|take (?:that|it) back|oops|never ?mind|nevermind|cancel that|put it back|back)\b(?:\s+(?:that|it|this|the last (?:one|change|thing)))?(?:\s+(\d+|twice|two|three)\s*(?:times|steps|changes)?)?\s*$/.exec(c)) || /^undo\b/.test(c)) {
      const n = m && m[1] ? (m[1] === "twice" || m[1] === "two" ? 2 : m[1] === "three" ? 3 : parseInt(m[1], 10)) : (/\btwice\b/.test(c) ? 2 : 1);
      for (let i = 0; i < clamp(n, 1, 20); i++) await app.undo();
      return { done: n > 1 ? `undid the last ${n} changes` : "undid that", kind: "undo", chips: ["Redo", "Undo", "Show me the front"] };
    }
    if (/^(?:redo|re-do|do (?:it|that) again|bring it back)\b/.test(c) && !/\bbigger|smaller|higher|lower\b/.test(c)) {
      await app.redo();
      return { done: "redid it", kind: "redo", chips: ["Undo", "Bigger", "Show me the front"] };
    }

    // ── "again", "more", "even more" → repeat the last relative action
    if (/^(?:again|once more|more|even more|a bit more|a little more|do (?:it|that) again|same again|keep going|further|more please)$/.test(c) && ctx.lastRelative) {
      return runClause(ctx.lastRelative, quotes, raw, index, total);
    }
    if (/^(?:less|a bit less|a little less|too much|that's too much|not so much|back a bit)$/.test(c) && ctx.lastRelative) {
      const inv = invertRelative(ctx.lastRelative);
      if (inv) return runClause(inv, quotes, raw, index, total);
    }

    // ── questions about what's there
    if (/^(?:what|which)\s+(?:tattoos|designs)\b|\bhow many tattoos\b|^list\b|^(?:what's|what is) on (?:me|my body)\b|^what do i have\b/.test(c)) return listTattoos();
    if (/^(?:what'?s|what is|how)\s+(?:the\s+)?(?:biggest|largest|max(?:imum)?|smallest|min(?:imum)?)\b|^how (?:big|small) can (?:it|i|you)\b/.test(c)) {
      const t = current();
      const rs = t && (R().get(t.region) || { r: {} }).r.sizeCm;
      const small = /smallest|min|small can/.test(c);
      if (!t) return { say: "There's no tattoo yet — want me to add one?", info: true, kind: "info" };
      return { say: small ? `Fine lines blur when they're too tiny — around ${fmtSize(Math.max(1.5, (rs || 6) * 0.3))} is about the smallest that still heals cleanly ${onWhere(where(t))}. It's ${fmtSize(t.sizeCm)} now.`
        : `${cap(onWhere(where(t)))}, up to about ${fmtSize((rs || 10) * 1.8)} still sits well (it wraps further around as it grows). It's ${fmtSize(t.sizeCm)} now — want me to go bigger?`, info: true, kind: "info", chips: small ? ["Smaller", "Make it 2 cm"] : ["Bigger", `Make it ${Math.round((rs || 10) * 1.6)} cm`] };
    }
    if (/^(?:how big|what size|how large)\b/.test(c)) {
      const t = current();
      if (!t) return { say: "There's no tattoo yet — want me to add one?", info: true, kind: "info" };
      return { say: `Your ${tattooName(t)} is ${fmtSize(t.sizeCm)} wide, ${onWhere(where(t))}.`, info: true, kind: "info" };
    }
    if (/^where(?:'s| is)\s+(?:it|the)\b/.test(c)) {
      const t = current();
      if (!t) return { say: "There's no tattoo yet.", info: true };
      try { app.focus(t.id); } catch {}
      return { say: `It's ${onWhere(where(t))} — I've zoomed in on it.`, info: true, kind: "camera" };
    }

    // ── remove all except one
    if ((m = /^(?:clear|remove|delete|erase|wipe|get rid of|take off)\s+(?:all|everything|every tattoo|all (?:the |my |of the |of my )?(?:tattoos|designs|ones)|all of them|them all|the rest)\s+(?:except|but|apart from|other than|besides|aside from|save)\s+(.+)$/.exec(c)) && tattoos().length) {
      const keep = resolveTarget(m[1]);
      let keepIds = keep.ids;
      if (!keepIds) { const reg = findRegion(m[1]); if (reg) keepIds = tattoosAt(reg).map((t) => t.id); }
      if (!keepIds || !keepIds.length) return { say: `I'm not sure which one to keep — ${listShort()}.`, info: true, kind: "info" };
      const gone = tattoos().filter((t) => !keepIds.includes(t.id));
      for (const t of gone) await app.removeTattoo(t.id);
      remember(tattooById(keepIds[0]));
      return { done: `removed ${gone.length} tattoo${gone.length === 1 ? "" : "s"} and kept your ${tattooName(tattooById(keepIds[0]))}`, kind: "remove", follow: gone.length > 1 ? `Say “undo” ${gone.length} times to bring them back.` : "Say “undo” to bring it back." };
    }
    // ── clear all
    if (/^(?:clear|remove|delete|erase|wipe|get rid of)\s+(?:all|everything|every tattoo|all (?:the |my |of the |of my )?(?:tattoos|designs|ink)|them all|it all|the whole thing)\b|^(?:start over|start again|clean slate|blank canvas|reset (?:everything|all|the tattoos)|clear(?: it)?(?: all)?)$/.test(c)) {
      const n = tattoos().length;
      if (!n) return { say: "There's nothing on the body yet.", info: true, kind: "remove" };
      await app.clearTattoos();
      ctx.currentId = null;
      return { done: `removed all ${n} tattoo${n > 1 ? "s" : ""} (say “undo” to bring them back)`, kind: "remove" };
    }

    // ── tabs / sketch
    if (/\b(?:open|go to|show)\b.*\b(?:sketch(?:pad| pad)?|drawing pad|draw(?:ing)? (?:tab|mode))\b|^(?:let me|i want to|i'd like to) (?:draw|sketch)\b|^sketch\b/.test(c)) {
      const t = current();
      const edit = /\b(?:edit|this|it|that|trace|over)\b/.test(c) && t;
      try { app.openSketch(edit ? t.designId : undefined); } catch { try { app.showTab("sketch"); } catch {} }
      return { say: edit ? "Opened the sketch pad with this design so you can draw over it." : "Opened the sketch pad — draw your own design and I'll help you place it.", info: true, kind: "tab" };
    }
    if (/\b(?:open|go to|show(?: me)?|browse)\s+(?:the\s+)?(?:design library|designs?(?: tab| library)?|library|gallery|styles)\b/.test(c) && !/\bon (?:my|the)\b/.test(c)) {
      try { app.showTab("designs"); } catch {}
      return { say: "Here's the design library.", info: true, kind: "tab" };
    }
    if (/\b(?:studio|3d view|the body)\b/.test(c) && /\b(?:go (?:back )?to|open|show)\b/.test(c) && !/\b(?:back|front|side)\b/.test(c.replace(/go back/, ""))) {
      try { app.showTab("studio"); } catch {}
      return { say: "Back to the 3D studio.", info: true, kind: "tab" };
    }

    // ── screenshot
    if (/\b(?:screenshot|screen shot|snapshot|take a (?:photo|picture|pic)|save (?:a |an )?(?:image|picture|photo)|capture)\b/.test(c)) {
      try {
        const url = await app.screenshot({ width: 900, height: 1200 });
        return { say: "Here's a snapshot — tap it to save.", info: true, image: url, kind: "shot" };
      } catch { return { say: "I couldn't take a snapshot right now.", info: true }; }
    }

    // ── a new design: "a koi fish on my calf", "small semicolon on my wrist", "Maria in gothic letters on my chest"
    const intent = designIntent(c, quotes, raw);
    if (isNewDesignRequest(c, intent)) {
      const r = await requestDesign(c, quotes, raw);
      if (r) return r;
    }
    // "move the dragon up" when there's no dragon
    if (tattoos().length && EDIT_START.test(c) && intent.subs.length && !/^(?:make|draw|create)\s+(?:me\s+)?(?:an?|some)\b/.test(c)) {
      const sj = intent.subs[0];
      if (/\b(?:the|my|that|this)\s+(?:\w+\s+)?$/.test(c.slice(0, sj.index)) && !tattoos().some((t) => tattooMatchesSubject(t, sj))
        && !/\b(?:it|that|this)\s+(?:in)?to\b|\binstead\b|\b(?:make|change|turn|swap|switch)\s+(?:it|that|this)\b/.test(c)) {
        return { say: `I don't see a ${sj.word} on the body — ${listShort()}.`, info: true, kind: "info", chips: tattoos().slice(-3).map((t) => `Zoom in on the ${tattooName(t).replace(/^“.*”\s*/, "lettering ")}`) };
      }
    }

    // ── scene & app settings: background, lighting, turntable, units, theme
    const set = await trySettings(c);
    if (set) return set;

    // ── camera
    const cam = await tryCamera(c);
    if (cam) return cam;

    // ── body & skin
    const body = await tryBody(c);
    if (body) return body;

    // ── remove
    if (/^(?:remove|delete|erase|get rid of|take off|take away|laser(?: off)?|ditch|lose|drop|kill|scrap|bin|trash)\b/.test(c) || /\b(?:remove|delete|erase|get rid of)\s+(?:it|that|this|the)\b/.test(c)) {
      if (!optionMentioned(c)) return tryRemove(c);
    }

    // ── mirror to other side
    if (/\b(?:other|opposite) (?:side|arm|leg|wrist|ear|shoulder|forearm|hand|ankle|calf|thigh|one|hip|rib|ribs|foot|collarbone|shoulder blade)\b|\b(?:both (?:sides|arms|legs|wrists|ears|shoulders|forearms|hands|ankles|calves|thighs|hips|feet))\b|\bmatching\b|\bsymmetric(?:al)?(?:ly)?\b|\bmirror (?:it |that |this )?(?:to|on|onto) the other\b|\bpair(?:ed)?\b/.test(c)
      && !/\b(?:move|shift|put it|switch it|swap it|transfer)\b/.test(c)) {
      return tryMirror(c);
    }

    // ── copy to a region / another one
    if (/\b(?:copy|duplicate|clone|repeat)\b|\b(?:another|one more|a second|second one|same one|the same)\b(?!\s+(?:style|color|colour|size))/.test(c)) {
      const reg = findRegion(c, { preferFree: true });
      const t = current();
      if (t && (reg || /\b(?:copy|duplicate|clone)\b/.test(c)) && !hasNewSubject(c, reg)) return copyTo(t, reg, c);
    }

    // ── lettering via quotes or "write …"
    const hasQuote = /qq\d+qq/.test(c);
    const writeVerb = /^(?:write|letter|spell|script)\b/.test(c);

    // ── placement of a new design
    const placeStart = /^(?:(?:can|could|would|will) you\s+|i (?:want|need|would like|'d like|wanna)|i'd love|let's|lets|how about|what about|try|give me|show me an?\b|get me|make me|draw|design|create|generate|ink|tattoo|put|place|add|stick|slap|do an?\b|get an?\b|write|letter|spell)/.test(c);
    const moveToRegion = (/^(?:move|put|place|shift|switch|transfer|relocate|bring|stick|slide)\s+(?:it|that|this|them|the tattoo|the design|the (?:[a-z]+ )?(?:one|tattoo))\b/.test(c)
        || /^(?:what if|how about|what about|try)\s+(?:it|we put it|i put it|putting it|moving it)\s*(?:was|were|is|went|goes)?\s*(?:on|onto|to|at|behind)\b/.test(c) || /^(?:try it|put it there)\s+(?:on|at|behind)\b/.test(c))
      && !LANDMARK_RE.test(c) && !hasDirection((findRegion(c) || { rest: c }).rest);
    if (moveToRegion) {
      const tgt = resolveTarget(c);
      const reg = findRegion(tgt.rest);
      if (reg) {
        const t = (tgt.ids && tattooById(tgt.ids[0])) || current();
        if (t) {
          const restNoRegion = reg.rest;
          // "move it to my chest and make it bigger" handled by split; extra mods in same clause:
          await app.updateTattoo(t.id, { region: reg.regionId });
          const nt = tattooById(t.id) || t;
          remember(nt);
          const extra = await applyModifications(nt.id, restNoRegion.replace(/^(?:move|put|place|shift|switch|transfer|relocate|bring|stick|slide)\s+(?:it|that|this|them)\b/, ""), quotes, { quiet: true });
          return { done: `moved your ${tattooName(nt)} to ${R().describe(reg.regionId)}${extra.parts.length ? ", " + extra.parts.join(", ") : ""}`, kind: "move", follow: "Look good there?" };
        }
      }
    }
    const bareWithRegion = /^(?:an?|some|two|three|\d+)\s+\S/.test(c) && !isCommandLike(c) && !!findRegion(c);
    if ((placeStart || hasQuote || writeVerb || bareWithRegion) && !PRONOUN_ONLY(c)
      && !(tattoos().length && /\b(?:to|onto|around|with|in|inside|on)\s+(?:it|that|this|them|the design|the tattoo)\b/.test(c) && !/qq\d+qq/.test(c))) {
      const spec0 = parsePlacementSpec(c, quotes, raw);
      // "put it on a banner", "add sparkles to it" → a tweak of the current design, handled below
      const tweak = tattoos().length && !spec0.lettering && !spec0.subject && spec0.prompt
        && (PRONOUN.test(c) || (!spec0.regionId && /^(?:add|put|give it|give)\b/.test(c) && OPTION_HINTS.some((h) => h.say.test(c))));
      const spec = tweak ? { prompt: "", lettering: null, regionId: null } : spec0;
      if (spec.prompt && !spec.lettering && !spec.subject && !STYLE_WORDS.test(spec.genPrompt || "") && !/^(?:something|anything|one|a tattoo|a design|tattoo|design)$/.test(spec.prompt)) {
        // a thing I can't draw: say so instead of inventing a random design (unless the engine reads it as lettering)
        const u = await unknownReply(spec);
        if (u) return u;
      }
      if (spec.prompt || spec.lettering) {
        if (!spec.regionId) {
          // No spot named: use the last spot if we have one, else ask (with chips).
          if (tattoos().length === 0 && !ctx.lastRegion) {
            ctx.pending = { kind: "where", spec };
            return { say: `Love it — where should the ${spec.lettering ? "lettering" : spec.prompt} go?`, info: true, ask: true, chips: regionChips(), kind: "ask", stop: true };
          }
          spec.regionId = pickFreeNear(ctx.lastRegion) || defaultRegion();
          spec.guessedRegion = true;
        }
        return placeNew(spec);
      }
      if (spec.regionId && !spec.prompt) {
        // "put one on my chest" / "add something on my back"
        if (/\b(?:something|anything|a tattoo|a design|one)\b/.test(c) || !current()) {
          ctx.pending = { kind: "what", regionId: spec.regionId };
          return { say: `Sure — what design would you like on ${R().describe(spec.regionId)}?`, info: true, ask: true, chips: ["A rose", "A geometric wolf", "A mandala", "A snake", "Lettering"], kind: "ask", stop: true };
        }
        const t = current();
        await app.updateTattoo(t.id, { region: spec.regionId });
        remember(tattooById(t.id) || t);
        return { done: `moved your ${tattooName(t)} to ${R().describe(spec.regionId)}`, kind: "move", follow: "Look good there?" };
      }
    }

    // ── "too big", "too far left", "it's too dark" → the opposite tweak
    if (tattoos().length && (m = /^(?:(?:it's|its|it is|that's|thats|that is|way|a bit|a little|kinda|bit|now it's|now its)\s+)*too\s+(big|large|huge|small|tiny|little|high|low|dark|light|faint|bright|faded|far (?:up|down|left|right)|(?:much )?to the (?:left|right)|left|right|thick|thin|bold|crooked|tilted|rotated|close to (?:my|the) \w+)\b(.*)$/.exec(c))) {
      const w = m[1];
      const inv = /big|large|huge/.test(w) ? "make it smaller" : /small|tiny|little/.test(w) ? "make it bigger" : /high|far up/.test(w) ? "move it down" : /low|far down/.test(w) ? "move it up"
        : /dark|bold|thick/.test(w) ? (/thick|bold/.test(w) && /line/.test(m[2]) ? "thinner lines" : "make it lighter") : /light|faint|faded|thin/.test(w) ? (/thin/.test(w) && /line/.test(m[2]) ? "thicker lines" : "make it darker")
        : /left/.test(w) ? "move it right" : /right/.test(w) ? "move it left" : /crooked|tilted|rotated/.test(w) ? "straighten it" : /close to/.test(w) ? `move it away from ${w.replace(/^close to /, "")}` : null;
      if (inv) return runClause(inv + (/\b(?:a bit|a little|slightly|bit)\b/.test(c) ? " a bit" : ""), quotes, raw, index, total);
    }
    if (tattoos().length && /\b(?:all the way around|wrap(?:s|ped|ping)? (?:it )?(?:all the way |fully |completely )?around|full wrap|go around (?:my|the) (?:whole )?\w+|360)\b/.test(c) && !/\b(?:arm ?band|band|bracelet|anklet|cuff)\b/.test(c)) {
      return { say: "I can't stretch a design all the way around a limb yet — it wraps as far as its size allows. I can make it bigger so it wraps further, or swap it for an armband design that's made to go around.", info: true, chips: ["Make it bigger", "Swap it for a polynesian armband", "Swap it for a tribal armband"], kind: "info" };
    }

    // ── modifications on an existing tattoo
    if (tattoos().length) {
      const tgt = resolveTarget(c);
      if (tgt.missing) return { say: `I don't see a tattoo on ${tgt.missing}.`, info: true, kind: "info" };
      const ids = tgt.ids || (current() ? [current().id] : []);
      if (ids.length) {
        const res = await applyModifications(ids, tgt.rest, quotes, { all: tgt.all });
        if (res.parts.length) {
          if (res.relative) ctx.lastRelative = clause0;
          const subj = tgt.explicit && !tgt.all ? `your ${tattooName(tattooById(ids[0]))}: ` : tgt.all ? "all of them: " : "";
          return { done: subj + res.parts.join(", "), kind: res.kind, follow: res.follow, chips: res.chips };
        }
        if (res.say) return { say: res.say, info: true, chips: res.chips, kind: res.kind, ask: res.ask };
        if (tgt.explicit && !tgt.rest.replace(/\b(?:make|change|do|set|the|it|to|a|an)\b/g, "").trim()) {
          remember(tattooById(ids[0]));
          try { app.focus(ids[0]); } catch {}
          return { say: `Got it — your ${tattooName(tattooById(ids[0]))} ${onWhere(where(tattooById(ids[0])))}. What should I change?`, info: true, chips: ["Bigger", "Smaller", "Make it red", "Remove it"], kind: "select" };
        }
      }
    }

    // ── a change request but nothing on the body yet
    if (!tattoos().length && (isCommandLike(c) || OPTION_HINTS.some((h) => h.say.test(c)) && /\b(?:more|less|fewer|thinner|thicker)\b/.test(c)) && !findRegion(c))
      return { say: "There's no tattoo on the body yet — tell me what you'd like and where, e.g. “a rose on my wrist”.", info: true, chips: starterChips(), kind: "info", stop: true };

    // ── a bare body part: move "it" there, or ask what to put there
    const reg = findRegion(c, { preferFree: true });
    if (reg && reg.rest.replace(/\b(?:on|my|the|to|there|please|onto|at|it|in|a|an)\b/g, "").trim().length < 2) {
      const t = current();
      if (t && /^(?:on|onto|to|at)\b/.test(c)) {
        await app.updateTattoo(t.id, { region: reg.regionId });
        remember(tattooById(t.id) || t);
        return { done: `moved your ${tattooName(t)} to ${R().describe(reg.regionId)}`, kind: "move" };
      }
      ctx.pending = { kind: "what", regionId: reg.regionId };
      return { say: `What design should go on ${R().describe(reg.regionId)}?`, info: true, ask: true, chips: ["A rose", "A geometric wolf", "A mandala", "A snake", "Lettering"], kind: "ask", stop: true };
    }

    // ── "a unicorn on my calf" with a subject I don't know → say so instead of inventing
    if (!isCommandLike(c) && c.split(" ").length <= 10 && !/\?\s*$|^(?:why|how|when|who|what|is|are|do|does|can|should)\b/.test(c)
      && (/^(?:an?|some)\s+\S/.test(c) || placeStart) && (findRegion(c) || placeStart) && !PRONOUN_ONLY(c) && !PRONOUN.test(c)) {
      const spec = parsePlacementSpec(c, quotes, raw);
      if (spec.prompt && spec.prompt.length >= 3) {
        if (!spec.regionId) { spec.regionId = pickFreeNear(ctx.lastRegion) || defaultRegion(); spec.guessedRegion = true; }
        const u = await unknownReply(spec);
        if (u) return u;
        return placeNew(spec);
      }
    }

    // ── give up gracefully
    if (/\?\s*$|^(?:why|how|when|who|is|are|does|should)\b/.test(c))
      return { say: "Good question! I'm best at placing and tweaking tattoos — try “put a small rose on my wrist” or ask “what can you do?”.", info: true, chips: starterChips(), kind: "unknown" };
    return { say: "Sorry, I didn't quite get that. " + quickTip(), info: true, chips: tattoos().length ? followChips() : starterChips(), kind: "unknown" };
  }

  async function requestDesign(c, quotes, raw) {
    const spec = parsePlacementSpec(c, quotes, raw);
    if (!spec.prompt && !spec.lettering && !spec.genPrompt) return null;
    if (!spec.regionId && !spec.relTo) {
      if (/\binstead\b/.test(c) && current()) return null; // "a lion instead" → swap the design (below)
      if (tattoos().length === 0 && !ctx.lastRegion) {
        ctx.pending = { kind: "where", spec };
        const what = spec.lettering ? `“${spec.lettering}” lettering` : (spec.subject && spec.prompt.length > 40 ? spec.subject.word : spec.prompt);
        return { say: `Love it — where should the ${what} go?`, info: true, ask: true, chips: regionChips(), kind: "ask", stop: true };
      }
      spec.regionId = pickFreeNear(ctx.lastRegion) || defaultRegion();
      spec.guessedRegion = true;
    }
    return placeNew(spec);
  }

  async function unknownReply(spec) {
    const plan = await planDesign(spec.genPrompt || spec.prompt);
    if (plan && /^lettering/.test(plan.styleId) && plan.opts && plan.opts.text) return null; // "Emma in script" etc.
    ctx.pending = { kind: "unknown", spec };
    return { say: `I don't have “${spec.prompt}” in my built-in design library. I can do motifs like a rose, wolf, koi, snake, dragon, mandala or lettering — or you can draw your own in the Sketch tab (with Claude enabled in Settings I can draw new designs too). Want me to try my closest match anyway?`,
      info: true, ask: true, chips: ["Yes, try it", "A rose instead", "Open the sketch pad"], kind: "ask", stop: true };
  }

  function listShort() {
    const list = tattoos();
    if (!list.length) return "there are no tattoos yet";
    const items = list.slice(-4).map((t) => `${/^“/.test(tattooName(t)) ? "" : "a "}${tattooName(t)} ${onWhere(where(t))}`);
    return "you have " + (items.length > 1 ? items.slice(0, -1).join(", ") + " and " + items[items.length - 1] : items[0]);
  }

  function hasDirection(c) {
    return /\b(?:up|down|higher|lower|left|right|over|upward|downward|a bit|slightly|\d+(?:\.\d+)? ?(?:cm|mm|in|inch|inches))\b/.test(c);
  }

  function PRONOUN_ONLY(c) {
    // "put it bigger" style clauses are modifications, not placements
    return (/^(?:put|place|add|make|get|give)\s+(?:it|that|this|them)\b/.test(c) && !/\b(?:on|onto|behind|across|to)\b/.test(c))
      || /^(?:write|spell|letter|ink|tattoo|draw)\s+(?:it|that|this|them)\b/.test(c);
  }

  function isCommandLike(c) {
    return /^(?:make|move|rotate|turn|flip|mirror|show|zoom|remove|delete|switch|change|undo|redo|scale|resize|hide|fade|center|centre|set|take|tilt|shift|nudge|raise|lower|swap|darken|lighten|straighten|erase|clear|reset|focus|bigger|smaller|higher|up|down|left|right)\b/.test(c)
      || /\b(?:bigger|smaller|larger|higher|lower|rotate|degrees|thinner|thicker|darker|lighter|opacity|healed|faded|fresh)\b/.test(c);
  }

  function invertRelative(clause) {
    const swaps = [["bigger", "smaller"], ["larger", "smaller"], ["higher", "lower"], ["up", "down"], ["left", "right"], ["thicker", "thinner"], ["more", "fewer"], ["darker", "lighter"], ["clockwise", "counterclockwise"]];
    let out = clause, changed = false;
    for (const [a, b] of swaps) {
      if (new RegExp(`\\b${a}\\b`).test(out)) { out = out.replace(new RegExp(`\\b${a}\\b`, "g"), b); changed = true; break; }
      if (new RegExp(`\\b${b}\\b`).test(out)) { out = out.replace(new RegExp(`\\b${b}\\b`, "g"), a); changed = true; break; }
    }
    return changed ? out.replace(/\b(?:a lot|much|way)\b/, "a bit") : null;
  }

  function hasNewSubject(c, reg) {
    let s = reg ? reg.rest : c;
    s = s.replace(/\b(?:copy|duplicate|clone|repeat|another|one more|a second|second|same|the|one|it|that|this|of|on|to|onto|put|add|place|make|give|me|please|and|a|an|too|also|as well|there|here|version|thing|things|but|exact|exactly|design|tattoo|piece|now|ok|okay|want|i|do|can|you|again|just|like)\b/g, " ");
    return s.replace(/\s+/g, " ").trim().length > 2;
  }

  function optionMentioned(c) {
    if (!/\b(?:shading|shade|shadows?|dots?|stipple|frame|border|background|color|colour|outline|fill|text|lettering|leaves|thorns?|stars?)\b/.test(c)) return false;
    if (/\b(?:the (?:one|tattoo)|it|that|this)\b/.test(c) && !/\b(?:shading|dots?|frame|border|color|colour|outline|fill|text|leaves|thorns?|stars?)\b/.test(c)) return false;
    return true;
  }

  function pickFreeNear(regionId) {
    if (!regionId) return null;
    if (!regionOccupied(regionId)) return regionId;
    const m = R().mirrorOf(regionId);
    if (m && !regionOccupied(m)) return m;
    return null;
  }

  /* ───────────────────────── placement ───────────────────────── */

  function parsePlacementSpec(c, quotes, raw) {
    const spec = { clause: c, prompt: "", genPrompt: "", regionId: null, sizeCm: null, color: null, ink: null, lettering: null, letterStyle: null, rotation: null, offsetCm: null, age: null, styleId: null, both: false, subject: null, substitute: null };
    let s = " " + c + " ";

    // lettering: quotes, "that says X", "the name X", "write X", "X in gothic letters"
    const lt = extractLettering(c, quotes, raw);
    if (lt) {
      spec.lettering = lt.text;
      spec.letterStyle = letteringStyleFor(lt.value ? c.replace(lt.value, " ") : c.replace(lt.span, " "));
      s = s.replace(lt.span, " ").replace(/qq\d+qq/g, " ");
    }

    // "a small heart next to it / above the rose"
    const rel = /\b(next to|beside|by|near|around|under(?:neath)?|below|above|over|on top of|to the (?:left|right) of)\s+(it|that|this|the \w+(?: one| tattoo)?)\b/.exec(s);
    if (rel && tattoos().length) {
      const tgt = /^(?:it|that|this)$/.test(rel[2]) ? { ids: [current() && current().id] } : resolveTarget(rel[2]);
      const ref = tgt.ids && tattooById(tgt.ids[0]);
      if (ref) {
        spec.relTo = { id: ref.id, dir: /under|below/.test(rel[1]) ? "down" : /above|over|top/.test(rel[1]) ? "up" : /left/.test(rel[1]) ? "left" : "right" };
        s = s.replace(rel[0], " ");
      }
    }

    // landmark ("near the wrist") → offset after we know the region
    let landmark = null;
    const lm = LANDMARK_RE.exec(s);
    if (lm) { landmark = { word: lm[1], away: /away|further|farther/.test(lm[0]) }; s = s.replace(lm[0], " "); }

    // one on each side / on both wrists
    if (/\b(?:each|both|either)\s+(?:side|sides|arm|arms|wrist|wrists|forearms?|shoulders?|ankles?|calf|calves|legs?|thighs?|hips?|hands?|feet|foot|ears?|collar ?bones?|ribs?|pecs?|chest|shoulder blades?|biceps?|elbows?|knees?|shins?|butt cheeks?|cheeks?)\b|\bon both\b|\b(?:matching pair|a pair of|two matching|one on each)\b/.test(s)) spec.both = true;

    // body part
    const reg = findRegion(s.trim(), { preferFree: !spec.both });
    if (reg) { spec.regionId = reg.regionId; spec.regionMatch = reg; s = " " + reg.rest + " "; }
    // "my whole back", "a full back piece", "full chest piece" → big piece on the main area
    const full = /\b(?:whole|full|entire)\s+(back|chest|stomach|thigh|calf|forearm)\b|\b(back|chest) ?piece\b/.exec(c);
    if (full) {
      const area = full[1] || full[2];
      const id = area === "back" ? "upper_back" : null;
      if (id && R().has(id)) spec.regionId = id;
      const rs = (R().get(spec.regionId) || { r: {} }).r.sizeCm;
      if (rs) spec.fullSize = Math.round(rs * (area === "back" ? 1.5 : 1.35));
    }
    if (spec.both && spec.regionId && !R().mirrorOf(spec.regionId)) spec.both = false;
    if (spec.both && spec.regionId && R().get(spec.regionId).side === "right") spec.regionId = R().mirrorOf(spec.regionId) || spec.regionId;

    // explicit size
    const len = parseLength(s);
    if (len) { spec.sizeCm = clamp(len.cm, 1, 60); s = s.slice(0, len.index) + " " + s.slice(len.index + len.len); }
    let g = s; // generator prompt keeps style hints like "small", "minimal"
    s = s.replace(/\b(?:about|around|roughly|approx(?:imately)?|maybe|like|wide|across|big|tall|long|in size|sized?)\b(?=\s*$|\s)/g, (w) => /big/.test(w) && !len ? w : " ");
    if (!spec.sizeCm) {
      for (const [re, cm] of SIZE_WORDS) {
        const mm = re.exec(s.replace(AMOUNT_PHRASES, " "));
        if (mm && !(cm === 25 && /\b(?:full|whole)\s+(?:back|sleeve|chest|leg|arm)\b/.test(c) && !reg)) { spec.sizeCm = cm; spec.sizeWord = true; s = s.replace(mm[0], " "); break; }
      }
    }
    s = s.replace(/\b(?:sized?|size|style|styled|version)\b/g, " ");

    // ink / color
    const blackSubject = /\bblack (?:cat|panther|widow|rose|wolf|crow|raven|bird|heart|snake|dragon|butterfly|moth|swallow|star|sun|moon)\b/;
    if (/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black(?:work)? ink|in black|all black|black)\b/.test(s) && !blackSubject.test(s) && !/\bblack ?work\b/.test(s)) {
      spec.ink = "black"; s = s.replace(/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black ink|in black|all black)\b/, " ");
      g = g.replace(/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black ink|in black|all black)\b/, " ");
    }
    if (/\b(?:stencil|outline only|just the outline|line ?art only)\b/.test(s)) { spec.ink = "stencil"; s = s.replace(/\b(?:stencil|outline only|just the outline|line ?art only)\b/, " "); g = g.replace(/\bstencil\b/, " "); }
    if (/\b(?:full colou?r|in colou?r|colou?rful|multicolou?r(?:ed)?|rainbow)\b/.test(s)) { spec.ink = "original"; }
    const col = findColor(s);
    if (col && !/\b(?:rose|orange|lime|peach|plum|cherry|olive|gold|amber|wine|coral|lavender|lilac|mint|sage)\b(?=\s*$|\s+(?:on|behind|across))/.test(s.slice(col.index).trim())) {
      if (!/\b(?:watercolou?r|traditional|neo|old school)\b/.test(s) || /\b(?:in|with)\s+\S+\s*(?:ink)?\b/.test(s.slice(Math.max(0, col.index - 6)))) {
        spec.ink = "color"; spec.color = col.hex; spec.colorName = col.name;
      }
      s = s.replace(/\b(?:in|with)\s+(?=\S+\s*(?:ink)?\b)/, " ").replace(/\bink\b/, " ");
    }

    // age
    if (/\b(?:healed|settled)\b/.test(s)) { spec.age = 0.35; s = s.replace(/\b(?:healed|settled)\b/, " "); g = g.replace(/\b(?:healed|settled)\b/, " "); }
    else if (/\b(?:old|faded|aged|worn)\b/.test(s) && /\b(?:looking|look|that looks|faded|worn)\b/.test(s) && !/\bold[\s-]?school\b/.test(s)) { spec.age = 0.75; s = s.replace(/\b(?:old|faded|aged|worn)(?:[- ]looking)?\b/, " "); g = g.replace(/\b(?:old|faded|aged|worn)(?:[- ]looking)?\b/, " "); }

    // rotation hints
    const rot = /\b(?:rotated|tilted|turned|at an angle of|angled)\s+(-?\d+)\s*(?:degrees)?/.exec(s);
    if (rot) { spec.rotation = parseInt(rot[1], 10); s = s.replace(rot[0], " "); g = g.replace(rot[0], " "); }
    else if (/\bupside[- ]down\b/.test(s)) { spec.rotation = 180; s = s.replace(/\bupside[- ]down\b/, " "); g = g.replace(/\bupside[- ]down\b/, " "); }
    else if (/\bsideways\b/.test(s)) { spec.rotation = 90; s = s.replace(/\bsideways\b/, " "); g = g.replace(/\bsideways\b/, " "); }

    // generator prompt: drop the command words, keep the description intact ("flower of life", "one line cat")
    g = g.replace(/^\s*(?:yo|hey|so|ok(?:ay)?|um+|uh+|hmm+)\b[ ,]*/, " ");
    g = g.replace(/^\s*(?:(?:can|could|may) i (?:get|have|see|try)|i(?:'d| would)? (?:love|like|want|need) (?:to (?:get|have|see|try) )?|i wanna (?:get |have |see )?|how about|what about|maybe|let's (?:do|try|get)|lets (?:do|try|get))\s+/, " ");
    g = g.trim().replace(PLACE_VERB, " ").replace(/^\s*(?:me\s+)?/, " ");
    g = g.replace(/\b(?:(?:can|could|would|will) you|please|pls|i want|i'd like|i would like|i need|let's|lets|for me|tattoo(?:ed)? of|design of|tattoo|tattoos|each|both|either|one on|matching pair of|a pair of|instead|there|here|now|then|also|too|as well|my mom's|my moms|my mum's|my dad's|my)\b/g, " ");
    g = g.replace(/\b(?:on|onto|at|to)\s*$/, " ").replace(/\s+/g, " ").trim().replace(/^(?:an?|some|the)\s+/, "");
    for (const [re] of SIZE_WORDS) if (!/minimal|dainty|delicate|tiny|small|little|micro/.test(String(re))) g = g.replace(re, " ");
    g = g.replace(/\s+/g, " ").trim();

    // display prompt: also drop filler words
    s = s.replace(PLACE_VERB, " ");
    s = s.replace(/^\s*(?:(?:can|could|would|will) you|please|i (?:want|need|would like|'d like)|let's|how about|what about)\s+/, " ");
    s = s.replace(/\b(?:(?:can|could|would|will) you|please|i want|i'd like|i would like|i need|let's|lets|get me|give me|show me|make me|for me|me|put|place|add|ink|draw|create|design|generate|tattoo(?:ed)?|tattoos|design|piece|image|picture|drawing|one|some|something like|something|anything|whatever|kind of|sort of|type of|style of|maybe|really|very|nice|cool|pretty|cute|beautiful|awesome|on|onto|to|at|in|of|there|here|it|that|this|my|the|with|for|please|real|thing|just|also|too|as well|now|then|ok|okay|go|do|get|have|and|stick|slap|write|lettering|text|word|words|says?|saying|reading|spell|each|both|either|instead|mom's|moms|dad's)\b/g, " ");
    s = s.replace(/\b(?:a|an)\b/g, " ").replace(/[^a-z0-9'&\- ]/g, " ").replace(/\s+/g, " ").trim();
    if (spec.ink === "color" && spec.colorName && !new RegExp(`\\b${escapeRe(spec.colorName)}\\b`).test(s) && s) s = `${spec.colorName} ${s}`;
    if (/^(?:same|same design|that|it|same one|one|another)$/.test(s)) { s = ""; g = ""; }

    // subjects the generators don't draw → closest one, and say so
    const subs = findSubjects(g);
    if (subs.length) spec.subject = subs[0];
    else {
      const sub = findSubstitute(g);
      if (sub) {
        spec.substitute = sub;
        g = g.replace(new RegExp(`\\b${escapeRe(sub.word)}\\b`), sub.id);
        spec.subject = { id: sub.id, word: sub.id, index: sub.index };
      }
    }
    spec.prompt = s;
    spec.genPrompt = g || s;
    spec.landmark = landmark;
    return spec;
  }

  let lastStyleMatch = "";
  function findStyle(text) {
    lastStyleMatch = "";
    if (!text) return null;
    const list = styles();
    let best = null, bestLen = 0;
    for (const st of list) {
      const names = [st.id, st.name, ...(st.aliases || [])].filter(Boolean).map((n) => String(n).toLowerCase().replace(/[_-]+/g, " ").replace(/\s*\(.*?\)/g, "").replace(/\s*\/.*$/, "").replace(/^lettering:\s*/, ""));
      for (const n of names) {
        const n2 = n.replace(/\s*style$/, "").trim();
        if (n2.length < 3) continue;
        const re = new RegExp(`\\b${escapeRe(n2).replace(/ /g, "[ -]?")}(?:s)?\\b`);
        const mm = re.exec(text);
        if (mm && n2.length > bestLen) { best = st; bestLen = n2.length; lastStyleMatch = mm[0]; }
      }
    }
    // everyday names for styles
    const EXTRA = [["fineline", /\bfine[\s-]?line\b/], ["minimal-line", /\b(?:one|single|continuous)[\s-]line\b|\bline[\s-]?art\b/], ["traditional", /\bold[\s-]?school\b|\bamerican traditional\b/],
      ["neo-traditional", /\bneo[\s-]?trad/], ["trash-polka", /\btrash[\s-]?polka\b/], ["sacred-geometry", /\bsacred geometry\b/], ["brush", /\bbrush ?strokes?\b|\bens[oō]\b/],
      ["sketch", /\b(?:sketchy|hatching|pencil|illustrative)\b/], ["dotwork", /\bdot[\s-]?work|\bstippl/], ["blackwork", /\bblack[\s-]?work\b/], ["watercolor", /\bwater[\s-]?colou?r\b/],
      ["floral", /\bbotanical\b/], ["maori", /\bkoru\b/], ["japanese", /\birezumi\b/], ["skull", /\bsugar skull\b/], ["zodiac", /\bconstellation\b/]];
    if (!best) for (const [id, re] of EXTRA) { const mm = re.exec(text); if (mm && list.some((x) => x.id === id)) { lastStyleMatch = mm[0]; return list.find((x) => x.id === id); } }
    return best;
  }

  function letteringStyle(prefer) {
    const list = styles();
    const st = (prefer && list.find((s) => s.id === prefer && (s.options || []).some((o) => o.type === "text")))
      || list.find((s) => s.id === "lettering-script")
      || list.find((s) => /letter|script|text|word|calligraph|font/i.test(`${s.id} ${s.name} ${s.category || ""}`) && (s.options || []).some((o) => o.type === "text"))
      || list.find((s) => (s.options || []).some((o) => o.type === "text" && /text|word|name|letter/i.test(o.key + o.label)));
    if (!st) return null;
    const opt = st.options.find((o) => o.type === "text");
    return { style: st, key: opt.key };
  }

  // The design engine's own prompt parser (pure function) — used to fine-tune options.
  let designsMod = null, designsModTried = false;
  async function designEngine() {
    if (designsModTried) return designsMod;
    designsModTried = true;
    try { designsMod = await import("../designs/index.js"); } catch { designsMod = null; }
    return designsMod;
  }

  /** prompt → { styleId, opts } like app.createDesign would, plus option choices named in the prompt ("ghost doodle", "greek key"). */
  async function planDesign(prompt) {
    const mod = await designEngine();
    if (!mod || !mod.designFromPrompt) return null;
    let g;
    try { g = mod.designFromPrompt(prompt); } catch { return null; }
    if (!g || !g.styleId) return null;
    const st = styles().find((x) => x.id === g.styleId);
    if (!st) return null;
    const opts = { ...(g.opts || {}) };
    const text = " " + prompt.toLowerCase().replace(/[^a-z0-9 ]+/g, " ") + " ";
    for (const o of st.options || []) {
      if (o.type !== "select" || !o.choices || /^(?:seed|color|colors|weight|font|ink|palette)$/.test(o.key)) continue;
      let best = null, bestLen = 0;
      for (const ch of o.choices) {
        const v = String(ch.value);
        if (/^(?:none|auto|mixed|both|full|default|line|single|solid|color|black|straight)$/.test(v)) continue;
        const names = [v.replace(/[-_]/g, " "), v.replace(/^doodle-/, ""), String(ch.label || "").toLowerCase()].map((n) => n.replace(/[^a-z0-9 ]+/g, " ").trim()).filter((n) => n.length >= 3);
        for (const n of names) if (n.length > bestLen && text.includes(" " + n + " ")) { best = ch.value; bestLen = n.length; }
      }
      if (best == null || opts[o.key] === best) continue;
      // keep the engine's own subject when the prompt names it too ("koi fish" → koi)
      if (o.key === "subject" && opts.subject && text.includes(" " + String(opts.subject).replace(/[-_]/g, " ") + " ") && bestLen <= String(opts.subject).length) continue;
      opts[o.key] = best;
    }
    if (g.styleId === "floral" && !/\b(?:bouquet|wreath|ring|circle|crescent|half moon|arc|branch|sprig|vine|band|garland|bunch|flowers|roses|peonies|daisies|sunflowers|lotuses|botanical|floral)\b/.test(text)
      && (st.options || []).some((o) => o.key === "arrangement" && (o.choices || []).some((ch) => ch.value === "single"))) opts.arrangement = "single";
    return { styleId: g.styleId, opts };
  }

  async function placeNew(spec) {
    let design;
    if (spec.lettering) {
      const ls = letteringStyle(spec.letterStyle);
      const word = spec.lettering;
      if (ls) design = await makeDesign({ styleId: ls.style.id, opts: { [ls.key]: word }, prompt: `"${word}" ${ls.style.name.replace(/^Lettering:\s*/i, "")} lettering`, name: undefined });
      else design = await makeDesign({ prompt: `lettering "${word}"`, name: `“${word}” lettering` });
    } else {
      const plan = await planDesign(spec.genPrompt || spec.prompt);
      design = plan ? await makeDesign({ prompt: spec.genPrompt || spec.prompt, styleId: plan.styleId, opts: plan.opts })
        : await makeDesign({ prompt: spec.genPrompt || spec.prompt });
    }
    const ref = spec.relTo && !spec.regionId ? tattooById(spec.relTo.id) : null;
    const regionId = spec.regionId || (ref && ref.region) || defaultRegion();
    const args = { designId: design.id, region: regionId };
    if (spec.sizeCm) args.sizeCm = spec.sizeWord ? sizeForWord(spec.sizeCm, (R().get(regionId) || { r: {} }).r.sizeCm) : spec.sizeCm;
    if (spec.fullSize && (!spec.sizeCm || spec.sizeWord)) args.sizeCm = spec.fullSize;
    // the spine "region" is only a few cm wide; a piece running down it needs more length than that
    if (!args.sizeCm && R().conceptOf(regionId) === "spine" && !spec.lettering) args.sizeCm = 11;
    // bands meant to go around a limb: size them to its circumference so they wrap
    let wrapped = false;
    const girth = WRAP_CM[R().conceptOf(regionId)];
    if (girth && !(spec.sizeCm && !spec.sizeWord) && isBand(design) && /\b(?:around|band|armband|wrap\w*|bracelet|anklet|cuff|ring|encircl\w*)\b/.test(spec.clause || "")) {
      args.sizeCm = girth; wrapped = true;
    }
    if (spec.rotation != null) args.rotation = spec.rotation;
    if (spec.ink) args.ink = spec.ink;
    if (spec.color) args.color = spec.color;
    if (spec.landmark) {
      const lm = landmarkMove(spec.landmark.word, R().conceptOf(regionId));
      if (lm && lm.up) args.offsetCm = { right: 0, up: lm.up * (spec.landmark.away ? -1 : 1) * 2.5 };
    }
    if (ref) {
      // right beside the reference tattoo, in its own frame
      const mine = args.sizeCm || Math.min(ref.sizeCm, ((R().get(regionId) || { r: {} }).r.sizeCm || ref.sizeCm) * 0.7);
      args.sizeCm = args.sizeCm || Math.round(mine * 2) / 2;
      const gap = ref.sizeCm / 2 + args.sizeCm / 2 + 0.5;
      const d = spec.relTo.dir;
      Object.assign(args, { position: ref.position, normal: ref.normal, rotation: args.rotation ?? ref.rotation, offsetCm: { right: d === "right" ? gap : d === "left" ? -gap : 0, up: d === "up" ? gap : d === "down" ? -gap : 0 } });
      delete args.region;
    }
    const t = await app.placeTattoo(args);
    if (!t || !t.id) throw new Error("placement failed");
    if (spec.rotation == null && !args.offsetCm) ctx.regionRot[t.region] = t.rotation;
    if (spec.age != null) { try { await app.updateTattoo(t.id, { age: spec.age }); } catch {} }
    remember(t);
    let pair = null;
    if (spec.both) {
      try { pair = await app.duplicateTattoo(t.id, { mirror: true }); } catch {}
      if (pair) pair = await mirrorArt(pair, design.id);
      if (pair) remember(pair);
    }
    const info = designInfo(design.id);
    const name = info.friendly;
    const size = t.sizeCm || spec.sizeCm;
    let desc;
    if (pair) {
      const w1 = onWhere(R().describe(t.region || regionId));
      const both = /\b(?:left|right)\b/.test(w1) ? w1.replace(/\b(?:left|right)\b/, "left and right") : `${w1} and ${onWhere(R().describe(pair.region))}`;
      desc = `a pair of ${size ? fmtSize(size) + " " : ""}${name}${/^“/.test(name) ? "" : "s"} ${both}`.replace(/(ss|sh|ch|x)s /, "$1es ").replace(/([^aeiou])ys /, "$1ies ");
    } else desc = `${size ? fmtSize(size) + " " : ""}${name} ${wrapped ? `wrapped around ${R().describe(t.region || regionId).replace(/\b(?:inner|outer|front|back) /, "").replace(/ \((?:inner|outer)\)/, "")}` : onWhere(R().describe(t.region || regionId))}`;
    // be honest about what was actually drawn
    const notes = [];
    if (spec.substitute) notes.push(`I don't have a ${spec.substitute.word.replace(/s$/, "")} design yet, so I used a ${spec.substitute.id === "cat" ? "cat" : spec.substitute.id} — the closest one I have.`);
    else if (spec.subject && !spec.lettering && tattooMatchesSubject(t, spec.subject)) {
      const others = findSubjects(spec.genPrompt || "").filter((x) => x.id !== spec.subject.id && !tattooMatchesSubject(t, x));
      if (others.length && !/\b(?:sun and moon|moon and sun|sun & moon)\b/.test(spec.genPrompt)) notes.push(`Each design has one main motif, so this is the ${spec.subject.word} — want me to add ${others.map((x) => (/[^s]s$/.test(x.word) ? `some ${x.word}` : `a ${x.word}`)).join(" and ")} next to it as a separate piece?`);
    }
    else if (spec.subject && !spec.lettering && !tattooMatchesSubject(t, spec.subject)) {
      const st = styles().find((x) => x.id === info.style);
      notes.push(`${st ? st.name.replace(/\s*\(.*?\)/g, "") : "That style"} designs don't include a ${spec.subject.word}, so this is a ${name} — say “${spec.subject.word} in fine line” (or another style) if you'd rather have the ${spec.subject.word}.`);
    }
    const follow = notes.length ? notes.join(" ") : spec.guessedRegion
      ? "I put it there for now — tell me another spot if you'd like."
      : pick(["Want it bigger or rotated?", "Want to try a different size or angle?", "How does that look? I can move, resize or recolor it.", pair ? "Want them bigger?" : (R().get(t.region) || {}).side === "center" ? "Want to see it from another angle?" : "Want it mirrored on the other side too?"], random);
    return { done: desc, kind: "place", follow, ask: false };
  }

  async function copyTo(t, reg, c) {
    let regionId = reg ? reg.regionId : null;
    if (!regionId) {
      const dup = await app.duplicateTattoo(t.id, { mirror: false });
      remember(dup);
      return { done: `made a copy of your ${tattooName(t)} next to it`, kind: "copy", follow: "Want me to move it somewhere?" };
    }
    const args = { designId: t.designId, region: regionId };
    if (t.ink) args.ink = t.ink;
    if (t.color) args.color = t.color;
    // keep the size if it suits the new spot, otherwise let the app fit it to the body part
    const target = (R().get(regionId) || { r: {} }).r.sizeCm;
    let resized = false;
    const len = parseLength(c);
    if (len) args.sizeCm = clamp(len.cm, 1, 60);
    else if (!target || (t.sizeCm <= target * 1.5 && t.sizeCm >= target * 0.4)) args.sizeCm = t.sizeCm;
    else resized = true;
    // keep any extra twist the user gave it relative to its body part
    const delta = (t.rotation || 0) - (await regionDefaultRot(t));
    const n = await app.placeTattoo(args);
    const extra = {};
    if (Math.abs(delta) > 2) extra.rotation = (n.rotation || 0) + delta;
    if (t.age) extra.age = t.age;
    if (t.opacity != null && t.opacity < 1) extra.opacity = t.opacity;
    if (t.flip) extra.flip = true;
    let res = n;
    if (Object.keys(extra).length) { try { res = await app.updateTattoo(n.id, extra, { checkpoint: false }) || n; } catch {} }
    remember(res);
    return { done: `added the same ${tattooName(t)} ${onWhere(R().describe(n.region || regionId))}${resized ? ` (sized to fit: ${fmtSize(res.sizeCm || n.sizeCm)})` : ""}`, kind: "copy", follow: "Want it a different size there?" };
  }

  async function tryMirror(c) {
    const tgt = resolveTarget(c.replace(/\b(?:other|opposite) (?:side|one)\b/, ""));
    const t = (tgt.ids && tattooById(tgt.ids[0])) || current();
    if (!t) return { say: "There's no tattoo to mirror yet — want me to add one first?", info: true, chips: starterChips() };
    const info = R().get(t.region);
    if (info && info.side === "center") {
      const dup = await app.duplicateTattoo(t.id, { mirror: true });
      remember(dup);
      return { done: `added a mirrored copy of your ${tattooName(t)}`, kind: "mirror" };
    }
    const twin = R().mirrorOf(t.region);
    const already = tattoos().find((x) => x.id !== t.id && x.designId === t.designId && (x.region === twin || Math.hypot(x.position[0] + t.position[0], x.position[1] - t.position[1], x.position[2] - t.position[2]) < 0.04));
    if (already) {
      remember(already);
      return { say: `There's already a matching ${tattooName(t)} ${onWhere(where(already))}.`, info: true, kind: "mirror", chips: ["Bigger", "Show me the front", "Remove the matching one"] };
    }
    let dup = await app.duplicateTattoo(t.id, { mirror: true });
    dup = await mirrorArt(dup, t.designId);
    remember(dup);
    return { done: `added a matching ${tattooName(t)} ${onWhere(R().describe(dup.region || R().mirrorOf(t.region)))}`, kind: "mirror", follow: "They look great as a pair!" };
  }

  async function tryRemove(c) {
    const tgt = resolveTarget(c);
    if (tgt.missing) return { say: `I don't see a tattoo on ${tgt.missing}.`, info: true, kind: "remove" };
    let ids = tgt.ids;
    if (!ids) {
      const reg = findRegion(c);
      if (reg) {
        const hits = tattoosAt(reg);
        if (!hits.length) return { say: `There's no tattoo on ${R().describe(reg.regionId)}.`, info: true, kind: "remove" };
        ids = [hits[hits.length - 1].id];
      }
    }
    if (!ids) { const t = current(); ids = t ? [t.id] : []; }
    if (!ids.length) return { say: "There's nothing to remove yet.", info: true, kind: "remove" };
    const names = ids.map((id) => { const t = tattooById(id); return t ? `${tattooName(t)} ${onWhere(where(t))}` : "tattoo"; });
    for (const id of ids) await app.removeTattoo(id);
    if (ids.includes(ctx.currentId)) ctx.currentId = null;
    return { done: ids.length > 1 ? `removed ${ids.length} tattoos` : `removed the ${names[0]}`, kind: "remove", follow: "Say “undo” if you change your mind." };
  }

  function listTattoos() {
    const list = tattoos();
    if (!list.length) return { say: "No tattoos yet — tell me what you'd like and where!", info: true, chips: starterChips(), kind: "info" };
    const lines = list.map((t, i) => `${i + 1}. ${cap(tattooName(t))} — ${fmtSize(t.sizeCm)} ${onWhere(where(t))}`);
    return { say: `You have ${list.length} tattoo${list.length > 1 ? "s" : ""}:\n${lines.join("\n")}`, info: true, kind: "info" };
  }

  /* ───────────────────────── camera ───────────────────────── */

  // app.getState().view may be the UI tab, so remember the camera side ourselves.
  async function view(v) { ctx.lastView = v; await app.viewFrom(v); }

  async function tryCamera(c) {
    let m;
    const camVerb = /\b(?:show(?: me)?|view|see|look(?: at)?|let me see|turn (?:around|the (?:body|camera|view|model))|rotate (?:the )?(?:view|camera|body|model)|spin (?:the )?(?:body|model|view|around)|camera|zoom|close[- ]?up|focus|from (?:the )?(?:back|behind|front|side|above|top|left|right)|switch (?:the )?view)\b/;
    if (/^(?:turn|spin) (?:it |me |the body |the model |him |her )?around\b|^turn around\b/.test(c)) {
      const v = ctx.lastView === "back" ? "front" : "back";
      await view(v);
      return { done: `turned the view to the ${v}`, kind: "camera", lead: false };
    }
    if (!camVerb.test(c)) return null;
    // "show it as a stencil", "show it again", "let me see it in red" are about the tattoo, not the camera
    if (/\b(?:stencil|black|gr[ae]y|colou?rs?|ink|healed|faded|fresh|old|bigger|smaller|opacity|transparent|flipped|hidden|again|instead)\b/.test(c) && !/\b(?:from|view|side|back|front|top|above|behind|profile|zoom|close[- ]?up|up close|closer)\b/.test(c)) return null;
    if (findColor(c) && !/\b(?:from|view|side|zoom|close)\b/.test(c)) return null;
    // "show me the left side", "left profile", "from the right"
    let sv;
    if ((sv = /^(?:(?:show(?: me)?|let me see|view|see|look at|turn (?:it|me|the body|the model|him|her) to|switch to|go to|camera(?: to)?|from)\s+)?(?:it\s+)?(?:from\s+)?(?:(?:the|my|his|her)\s+)?(left|right)(?:\s+(?:side|profile|view))+(?:\s+view)?(?:\s+(?:of|on)\s+(?:me|the body|it))?$|^(?:show(?: me)?|view|see)\s+(?:it\s+)?from\s+(?:the|my)\s+(left|right)$/.exec(c))) {
      const v = sv[1] || sv[2];
      await view(v);
      return { done: `here's your ${v} side`, kind: "camera", lead: false };
    }
    if (/\b(?:reset|whole body|full body|entire body|zoom out|all of me|everything)\b/.test(c)) {
      await view("front");
      return { done: "showing the whole body", kind: "camera", lead: false };
    }
    const viewWord = (/\b(?:back|behind|rear|backside)\b/.test(c) && !/\b(?:back of (?:my |the )?(?:neck|hand|arm|leg|knee|thigh|calf|ear)|lower back|upper back tattoo)\b/.test(c)) ? "back"
      : /\b(?:front|face me|facing me)\b/.test(c) ? "front"
      : /\b(?:top|above|overhead|bird'?s[- ]eye)\b/.test(c) ? "top"
      : /\b(?:left side|my left|from the left|left profile)\b/.test(c) ? "left"
      : /\b(?:right side|my right|from the right|right profile)\b/.test(c) ? "right"
      : /\b(?:side|profile)\b/.test(c) ? (current() && (R().get(current().region) || {}).side === "right" ? "right" : "left")
      : null;
    // "zoom in on it", "show me the tattoo"
    if (/\b(?:zoom|close[- ]?up|up close|closer|focus|show(?: me)?|let me see|see|look at)\b/.test(c) && /\b(?:it|that|this|the tattoo|the design|the one|my tattoo)\b/.test(c) && !viewWord) {
      const tgt = resolveTarget(c);
      const t = (tgt.ids && tattooById(tgt.ids[0])) || current();
      if (t) {
        if (t.visible === false) { await app.updateTattoo(t.id, { visible: true }); }
        await app.focus(t.id);
        return { done: `zoomed in on your ${tattooName(t)}`, kind: "camera", lead: false };
      }
    }
    // "show me the dragon up close", "zoom in on the rose"
    if (/\b(?:zoom|close[- ]?up|up close|closer look|focus|let me see|show me|look at|see)\b/.test(c) && !viewWord) {
      const tgt = resolveTarget(c);
      if (tgt.explicit && tgt.ids && tgt.ids.length === 1) {
        const t = tattooById(tgt.ids[0]);
        if (t.visible === false) await app.updateTattoo(t.id, { visible: true });
        await app.focus(t.id); remember(t);
        return { done: `zoomed in on your ${tattooName(t)}`, kind: "camera", lead: false };
      }
    }
    // "zoom on my arm", "show me my left shoulder"
    const reg = findRegion(c);
    if (reg && /\b(?:zoom|close[- ]?up|focus|show(?: me)?|let me see|look at|view)\b/.test(c)) {
      if (viewWord === "back" && /^(?:upper_back|lower_back|spine)$/.test(reg.concept) && !/\bzoom|close|focus\b/.test(c)) {
        await view("back");
        return { done: "here's the back", kind: "camera", lead: false };
      }
      const tgt = resolveTarget(c);
      if (tgt.explicit && tgt.ids) { await app.focus(tgt.ids[0]); return { done: `zoomed in on your ${tattooName(tattooById(tgt.ids[0]))}`, kind: "camera", lead: false }; }
      await app.focus(reg.regionId);
      return { done: `zoomed in on ${R().describe(reg.regionId)}`, kind: "camera", lead: false };
    }
    if (viewWord) {
      await view(viewWord);
      return { done: viewWord === "top" ? "showing the view from above" : `here's the ${viewWord === "left" || viewWord === "right" ? viewWord + " side" : viewWord}`, kind: "camera", lead: false };
    }
    if (/\bzoom in\b/.test(c)) {
      const t = current();
      if (t) { await app.focus(t.id); return { done: `zoomed in on your ${tattooName(t)}`, kind: "camera", lead: false }; }
    }
    return null;
  }

  /* ───────────────────────── scene settings ───────────────────────── */

  function settingDef(key) {
    try { return (app.listSettings() || []).find((d) => d.key === key) || null; } catch { return null; }
  }
  function setChoice(key, value, label) {
    const def = settingDef(key);
    if (!def) return null;
    if (def.choices && !def.choices.some((ch) => ch.value === value)) return null;
    app.setSetting(key, value);
    const ch = def.choices && def.choices.find((x) => x.value === value);
    return { label: label || (ch ? String(ch.label).toLowerCase() : String(value)) };
  }
  async function trySettings(c) {
    let m, r;
    // background
    if (/\b(?:background|backdrop|bg|back ground)\b/.test(c) && !/\b(?:tattoo|design|lettering)\b.*\bbackground\b/.test(c)) {
      const def = settingDef("scene.background");
      if (def) {
        const want = /\bwhite\b/.test(c) ? "white" : /\bblack\b/.test(c) ? "black" : /\b(?:light|lighter|bright|brighter|grey|gray|pale)\b/.test(c) ? (/\b(?:grey|gray)\b/.test(c) && !/\blight\b/.test(c) ? "charcoal" : "light")
          : /\b(?:blue|navy|midnight|night)\b/.test(c) ? "midnight" : /\b(?:warm|shop|brown|cozy)\b/.test(c) ? "warm" : /\b(?:charcoal|dark|darker|studio|default|normal)\b/.test(c) ? "charcoal" : /\b(?:auto|match)\b/.test(c) ? "auto" : null;
        if (!want) return { say: "Which background? I have " + def.choices.map((x) => String(x.label).toLowerCase()).join(", ") + ".", info: true, ask: true, chips: def.choices.slice(0, 5).map((x) => `${x.label} background`), kind: "settings" };
        if ((r = setChoice("scene.background", want))) return { done: `switched the background to ${r.label}`, kind: "settings", lead: true };
      }
    }
    // lighting
    if (/\b(?:lighting|lights|light setup|daylight|sunlight|sun light|natural light|outdoor light|studio light|rim light|back ?light|flat light|shop light|lamp)\b|\b(?:dramatic|moody|softer|soft|natural|warm|flat)\s+light\b/.test(c) && !/\bskin\b/.test(c)) {
      const want = /\b(?:dramatic|moody|dark|contrast)\b/.test(c) ? "dramatic" : /\b(?:daylight|sun ?light|natural|outdoor|outside|day)\b/.test(c) ? "daylight"
        : /\b(?:shop|warm|parlou?r|studio of a tattoo)\b/.test(c) ? "shop" : /\b(?:rim|back ?light|edge)\b/.test(c) ? "rim" : /\b(?:flat|even|linework)\b/.test(c) ? "flat" : /\b(?:studio|soft|softer|default|normal)\b/.test(c) ? "studio" : null;
      const def = settingDef("scene.lighting");
      if (def && !want) return { say: "Which lighting? " + def.choices.map((x) => String(x.label).toLowerCase()).join(", ") + ".", info: true, ask: true, chips: def.choices.slice(0, 5).map((x) => `${x.label} lighting`), kind: "settings" };
      if (want && (r = setChoice("scene.lighting", want))) return { done: `switched to ${r.label} lighting`, kind: "settings" };
    }
    // turntable
    if (/\b(?:stop (?:the )?(?:spinning|rotating|turntable|turning)|turntable off|stop it spinning|hold still|stop moving)\b/.test(c)) {
      if (setChoice("scene.autoRotate", false)) return { done: "stopped the turntable", kind: "settings" };
    }
    if (/\bturntable\b|\bauto[- ]?rotat\w*|\b(?:spin|rotate|turn)\s+(?:the\s+)?(?:body|model|figure|whole thing|me)(?:\s+(?:around|round|slowly|continuously|automatically|360))*\s*$|\bkeep (?:spinning|rotating|turning)\b|\bspin (?:it )?(?:slowly|continuously)\b/.test(c)) {
      if (setChoice("scene.autoRotate", !/\boff\b/.test(c))) return { done: /\boff\b/.test(c) ? "turned the turntable off" : "the body is spinning on a turntable now (say “stop spinning” to stop)", kind: "settings" };
    }
    // units
    if ((m = /^(?:please\s+)?(?:use|switch to|change (?:the )?units? to|set (?:the )?units? to|show (?:sizes |measurements |everything )?in|units?(?: in| to)?|measure in|i (?:use|prefer|think in|work in)|in)\s+(inches|inch|imperial|freedom units|cm|centimet(?:er|re)s?|metric)\b/.exec(c)) || (m = /\b(inches|imperial|metric|centimet(?:er|re)s?)\s+(?:please|instead|units?)\s*$/.exec(c))) {
      const v = /inch|imperial|freedom/.test(m[1]) ? "in" : "cm";
      if (setChoice("place.units", v)) return { done: `sizes are in ${v === "in" ? "inches" : "centimeters"} now`, kind: "settings" };
    }
    // theme
    if ((m = /\b(light|dark|night)\s+(?:mode|theme)\b|\b(?:theme|mode)\s+(?:to\s+)?(light|dark)\b|\b(?:match|follow)\s+(?:my\s+)?(?:device|system|phone)(?:\s+theme)?\b/.exec(c))) {
      const v = m[1] ? (m[1] === "night" ? "dark" : m[1]) : m[2] || "system";
      if (setChoice("ui.theme", v)) return { done: v === "system" ? "the app now follows your device's theme" : `switched the app to ${v} mode`, kind: "settings" };
    }
    // shadows / floor
    if ((m = /\b(?:turn off|disable|hide|no|remove|without|lose)\s+(?:the\s+)?(shadows?|floor)\b|\b(shadows?|floor)\s+off\b/.exec(c))) {
      const k = /shadow/.test(m[1] || m[2]) ? "scene.shadows" : "scene.floor";
      if (setChoice(k, false)) return { done: `turned the ${k === "scene.shadows" ? "shadows" : "floor"} off`, kind: "settings" };
    }
    if ((m = /\b(?:turn on|enable|show|bring back|add)\s+(?:the\s+)?(shadows?|floor)\b|\b(shadows?|floor)\s+on\b/.exec(c)) && !findRegion(c)) {
      const k = /shadow/.test(m[1] || m[2]) ? "scene.shadows" : "scene.floor";
      if (setChoice(k, true)) return { done: `turned the ${k === "scene.shadows" ? "shadows" : "floor"} on`, kind: "settings" };
    }
    return null;
  }

  /* ───────────────────────── body & skin ───────────────────────── */

  async function tryBody(c) {
    const st = state();
    const body = st.body || {};
    const lvl = amountLevel(c);
    const step = lvl === "tiny" ? 0.07 : lvl === "small" ? 0.12 : lvl === "large" ? 0.35 : 0.2;
    const bodyCtx = /\b(?:me|my body|the body|body|model|figure|person|him|her|myself|build|physique|i'?m|i am|guy|girl|man|woman|avatar|mannequin)\b/.test(c);
    let m;

    // skin
    if (/\b(?:skin|complexion|skin ?tone|tan(?:ned)?|pale(?:r)?|paler|fairer)\b/.test(c) && !/\btattoo\b/.test(c)) {
      return adjustSkin(c, lvl);
    }
    // sex
    if ((m = /\b(female|woman|women|girl|lady|feminine|she|male|man|men|guy|boy|masculine|dude|he)\b/.exec(c))) {
      const female = /^(?:female|woman|women|girl|lady|feminine|she)$/.test(m[1]);
      const explicitBody = /\b(?:body|model|figure|version|mannequin|avatar)\b/.test(c)
        || /^(?:switch|change|swap|go|turn|make|use|try|show|give me|i'?m|i am)\b/.test(c) && !/\b(?:face|portrait|head|silhouette|tattoo of|design of|drawing of)\b/.test(c) && !/\bput|place|add\b/.test(c)
        || /^(?:an?\s+)?(?:female|male|woman|man)(?:\s+(?:body|please))?$/.test(c);
      if (explicitBody) {
        await app.setBody({ sex: female ? "female" : "male" });
        return { done: `switched to a ${female ? "female" : "male"} body`, kind: "body", follow: "Your tattoos stay where they were." };
      }
    }
    // height
    if ((m = /\b(\d)\s*(?:'|ft|foot|feet)\s*(\d{1,2})?\s*(?:"|in|inches)?\b/.exec(c)) && /\b(?:tall|height|make me|i'?m|i am)\b/.test(c)) {
      const cm = Math.round(parseInt(m[1], 10) * 30.48 + (m[2] ? parseInt(m[2], 10) * 2.54 : 0));
      await app.setBody({ heightCm: clamp(cm, 140, 210) });
      return { done: `set the height to ${clamp(cm, 140, 210)} cm`, kind: "body" };
    }
    if ((m = /\b(1\d\d|2[01]\d)\s*(?:cm)?\s*(?:tall)?\b/.exec(c)) && /\b(?:tall|height|cm tall|make me|i'?m|i am)\b/.test(c)) {
      const cm = clamp(parseInt(m[1], 10), 140, 210);
      await app.setBody({ heightCm: cm });
      return { done: `set the height to ${cm} cm`, kind: "body" };
    }
    if (/\b(?:taller|shorter|less tall)\b/.test(c) && (bodyCtx || !/\b(?:it|tattoo|design|lines?)\b/.test(c))) {
      const d = (lvl === "tiny" ? 3 : lvl === "small" ? 5 : lvl === "large" ? 15 : 8) * (/\bshorter|less tall\b/.test(c) ? -1 : 1);
      const h = clamp((body.heightCm || 178) + d, 140, 210);
      await app.setBody({ heightCm: h });
      return { done: `made the body ${d > 0 ? "taller" : "shorter"} (${h} cm)`, kind: "body" };
    }
    // build / muscle
    const thinWords = /\b(?:skinnier|skinny|slimmer|slim|leaner|lean|thinner|thin|lighter build|lose weight|less fat|petite)\b/;
    const heavyWords = /\b(?:heavier|fatter|chubbier|chubby|curvier|curvy|plus[- ]size|bigger build|gain weight|thicker|thick|stockier|stocky|bulkier)\b/;
    if ((thinWords.test(c) || heavyWords.test(c)) && (bodyCtx || /^(?:skinnier|slimmer|leaner|heavier|fatter|chubbier|curvier|stockier)\b/.test(c)) && !/\b(?:lines?|it|tattoo|design|font|text|petals?)\b/.test(c.replace(/\bmake it (?:look )?(?:like )?me\b/, ""))) {
      const d = thinWords.test(c) ? -step : step;
      const v = round1(clamp((body.build ?? 0.5) + d, 0, 1) * 100) / 100;
      await app.setBody({ build: v });
      return { done: `made the body ${d < 0 ? "slimmer" : "heavier"}`, kind: "body" };
    }
    if (/\b(?:more muscular|muscular|buff|buffer|ripped|jacked|athletic|stronger|more muscle|muscles|fitter|toned|less muscular|less muscle|softer|weaker|less athletic)\b/.test(c) && (bodyCtx || /^(?:more|less|make|muscular|buff|ripped)/.test(c)) && !/\b(?:lines?|tattoo|design)\b/.test(c)) {
      const d = /\b(?:less|softer|weaker)\b/.test(c) ? -step : step;
      const v = Math.round(clamp((body.muscle ?? 0.5) + d, 0, 1) * 100) / 100;
      await app.setBody({ muscle: v });
      return { done: `made the body ${d < 0 ? "less muscular" : "more muscular"}`, kind: "body" };
    }
    if ((m = /\b(broader|wider|narrower|bigger|smaller)\s+shoulders\b|\bshoulders?\s+(broader|wider|narrower|bigger|smaller)\b/.exec(c))) {
      const w = m[1] || m[2];
      const d = /narrow|smaller/.test(w) ? -step : step;
      await app.setBody({ shoulders: Math.round(clamp((body.shoulders ?? 0.5) + d, 0, 1) * 100) / 100 });
      return { done: `made the shoulders ${d < 0 ? "narrower" : "broader"}`, kind: "body" };
    }
    if ((m = /\b(wider|narrower|bigger|smaller|curvier)\s+hips\b|\bhips\s+(wider|narrower|bigger|smaller)\b/.exec(c))) {
      const w = m[1] || m[2];
      const d = /narrow|smaller/.test(w) ? -step : step;
      await app.setBody({ hips: Math.round(clamp((body.hips ?? 0.5) + d, 0, 1) * 100) / 100 });
      return { done: `made the hips ${d < 0 ? "narrower" : "wider"}`, kind: "body" };
    }
    if ((m = /\b(bigger|larger|smaller|flatter|fuller)\s+(?:chest|bust|breasts|boobs|pecs)\b|\b(?:chest|bust|breasts|boobs|pecs)\s+(bigger|larger|smaller|flatter|fuller)\b/.exec(c)) && !/\b(?:tattoo|it|on my)\b/.test(c)) {
      const w = m[1] || m[2];
      const d = /smaller|flatter/.test(w) ? -step : step;
      await app.setBody({ chest: Math.round(clamp((body.chest ?? 0.5) + d, 0, 1) * 100) / 100 });
      return { done: `made the ${body.sex === "female" ? "bust" : "chest"} ${d < 0 ? "smaller" : "bigger"}`, kind: "body" };
    }
    if (/\blonger legs\b|\blegs? longer\b|\bshorter legs\b|\blegs? shorter\b/.test(c)) {
      const d = /shorter/.test(c) ? -step : step;
      await app.setBody({ legLength: Math.round(clamp((body.legLength ?? 0.5) + d, 0, 1) * 100) / 100 });
      return { done: `made the legs ${d < 0 ? "shorter" : "longer"}`, kind: "body" };
    }
    if (/\b(?:arms?|hands?)\s+(?:up|out|higher|raised|wider|away)\b|\b(?:raise|lift|spread)\s+(?:my |the )?arms?\b|\bt[- ]?pose\b/.test(c)) {
      const v = /t[- ]?pose/.test(c) ? 90 : clamp((body.armPose ?? 30) + (lvl === "large" ? 40 : 25), 5, 90);
      await app.setBody({ armPose: v });
      return { done: "raised the arms", kind: "body" };
    }
    if (/\b(?:arms?|hands?)\s+(?:down|lower|closer|in|by (?:my |the )?sides?)\b|\blower (?:my |the )?arms?\b|\bdrop (?:my |the )?arms?\b/.test(c)) {
      const v = clamp((body.armPose ?? 30) - (lvl === "large" ? 30 : 15), 5, 90);
      await app.setBody({ armPose: v });
      return { done: "lowered the arms", kind: "body" };
    }
    return null;
  }

  async function adjustSkin(c, lvl) {
    let defs = [];
    try { defs = app.listSettings() || []; } catch {}
    const def = defs.find((d) => /skin/i.test(d.key) && /tone|color|colour/i.test(d.key + " " + d.label)) || defs.find((d) => /skin/i.test(d.key + d.label) && d.type === "color");
    if (!def) return { say: "I can't change the skin tone in this version.", info: true };
    let cur;
    try { cur = app.getSetting(def.key); } catch {}
    if (cur == null) cur = def.default;
    const darker = /\b(?:darker|deeper|tanned|tan|browner|more tan)\b/.test(c) && !/\b(?:lighter|paler|fairer)\b/.test(c);
    const lighter = /\b(?:lighter|paler|pale|fairer|fair|whiter|less tan)\b/.test(c);
    const steps = lvl === "large" ? 2 : 1;
    const swatches = (def.swatches || def.choices || []).map((s) => (typeof s === "string" ? { value: s } : s)).filter((s) => s && s.value != null);
    // named tone? ("olive skin", "deep skin tone")
    if (swatches.length) {
      for (const s of [...swatches].sort((a, b) => String(b.label || "").length - String(a.label || "").length)) {
        if (s.label && new RegExp(`\\b${escapeRe(String(s.label).toLowerCase())}\\b`).test(c) && !(darker || lighter) ) {
          app.setSetting(def.key, s.value);
          return { done: `changed the skin tone to ${String(s.label).toLowerCase()}`, kind: "skin" };
        }
      }
    }
    if (!darker && !lighter) return { say: "Want the skin darker or lighter?", info: true, ask: true, chips: ["Darker skin", "Lighter skin"], kind: "skin" };
    if (def.type === "color" && swatches.length) {
      const sorted = [...swatches].sort((a, b) => hexLum(b.value) - hexLum(a.value)); // light → dark
      let idx = sorted.findIndex((s) => String(s.value).toLowerCase() === String(cur).toLowerCase());
      if (idx < 0) { const L = hexLum(cur); idx = sorted.reduce((bi, s, i) => Math.abs(hexLum(s.value) - L) < Math.abs(hexLum(sorted[bi].value) - L) ? i : bi, 0); }
      const ni = clamp(idx + (darker ? steps : -steps), 0, sorted.length - 1);
      if (ni === idx) return { say: `That's already the ${darker ? "darkest" : "lightest"} skin tone I have.`, info: true, kind: "skin" };
      app.setSetting(def.key, sorted[ni].value);
      return { done: `made the skin ${darker ? "darker" : "lighter"}${sorted[ni].label ? ` (${String(sorted[ni].label).toLowerCase()})` : ""}`, kind: "skin" };
    }
    if (def.type === "color") {
      app.setSetting(def.key, shadeHex(cur, darker ? -0.15 * steps : 0.15 * steps));
      return { done: `made the skin ${darker ? "darker" : "lighter"}`, kind: "skin" };
    }
    if (def.type === "range") {
      const span = (def.max - def.min) || 1;
      // assume higher = darker unless the label says otherwise
      const dir = /light|pale|fair/i.test(def.label || "") ? -1 : 1;
      app.setSetting(def.key, clamp(Number(cur) + dir * (darker ? 1 : -1) * span * 0.15 * steps, def.min, def.max));
      return { done: `made the skin ${darker ? "darker" : "lighter"}`, kind: "skin" };
    }
    if (def.type === "select" && def.choices && def.choices.length) {
      const i = def.choices.findIndex((ch) => ch.value === cur);
      const ni = clamp(i + (darker ? steps : -steps), 0, def.choices.length - 1);
      app.setSetting(def.key, def.choices[ni].value);
      return { done: `made the skin ${darker ? "darker" : "lighter"}`, kind: "skin" };
    }
    return { say: "I can't change the skin tone in this version.", info: true };
  }

  /* ───────────────────────── modifications ───────────────────────── */

  async function applyModifications(idsIn, c, quotes, { all = false, quiet = false } = {}) {
    const ids = Array.isArray(idsIn) ? idsIn : [idsIn];
    const parts = [];
    let kind = null, relative = false, follow = null, chips = null, say = null, ask = false;
    const t0 = tattooById(ids[0]);
    if (!t0) return { parts };
    const lvl = amountLevel(c);
    let m;
    const patchFor = []; // list of [patchFn(t) → patch, description]

    // ---- design regeneration: thinner lines, more petals, another variation, style / subject change
    const designRes = await tryDesignChange(ids, c);
    if (designRes) {
      if (designRes.say) return { parts, say: designRes.say, chips: designRes.chips, kind: designRes.kind || "design", ask: designRes.ask };
      parts.push(designRes.done); kind = "design"; relative = designRes.relative;
      c = designRes.rest ?? c;
      follow = designRes.follow;
    }

    // ---- size
    let sizePatch = null, sizeDesc = null, sizeAbs = false;
    const len = parseLength(c);
    const cs = c.replace(AMOUNT_PHRASES, " ");
    const sizeVerb = /\b(?:bigger|larger|enlarge|scale (?:it )?up|increase|grow|biggger|huger|wider|smaller|shrink|scale (?:it )?down|reduce|decrease|tinier|littler|narrower|size|big|large|small|tiny|huge|twice|double|half|halve|times|x\b|wide|across|%|percent)\b/;
    const moveish = /\b(?:move|shift|slide|nudge|bump|push|pull|up|down|higher|lower|raise|left|right|closer|toward|towards|away|over)\b/.test(c);
    const rotish = /\b(?:rotate|turn|tilt|spin|degrees|angle)\b/.test(c);
    if ((sizeVerb.test(cs) || (len && !moveish && !rotish)) && !/\b(?:lines?|petals?|points?|rings?|font|text size|shoulders|hips|chest|bust)\b/.test(c) && !(moveish && !/\b(?:bigger|larger|smaller|size|wide|big|tiny|huge)\b/.test(c))) {
      const up = /\b(?:bigger|larger|enlarge|scale (?:it )?up|increase|grow|huger|wider|double|twice)\b/.test(c);
      const down = /\b(?:smaller|shrink|scale (?:it )?down|reduce|decrease|tinier|littler|narrower|half|halve)\b/.test(c);
      if ((m = /\b(\d+(?:\.\d+)?)\s*(?:times|x)\b/.exec(c)) && !len) {
        const f = parseFloat(m[1]); sizePatch = { scaleBy: down && f > 1 ? 1 / f : f };
        sizeDesc = `${down ? "shrank" : "scaled"} it ${f}×`;
      } else if (/\b(?:twice as (?:big|large)|double(?: the size)?|twice the size|2x)\b/.test(c)) { sizePatch = { scaleBy: 2 }; sizeDesc = "doubled the size"; }
      else if (/\b(?:half (?:the size|as big)|halve)\b/.test(c)) { sizePatch = { scaleBy: 0.5 }; sizeDesc = "halved the size"; }
      else if ((m = /(\d+(?:\.\d+)?)\s*(?:%|percent)/.exec(c))) {
        const p = parseFloat(m[1]) / 100;
        const f = up ? 1 + p : down ? 1 - p : p;
        sizePatch = { scaleBy: clamp(f, 0.1, 5) }; sizeDesc = `${f >= 1 ? "enlarged" : "shrank"} it by ${Math.round(Math.abs(f - 1) * 100)}%`;
      } else if (len && (up || down)) {
        const d = len.cm * (down ? -1 : 1);
        sizePatch = (t) => ({ sizeCm: clamp(t.sizeCm + d, 1, 60) }); sizeDesc = `made it ${Math.abs(round1(len.cm))} cm ${down ? "smaller" : "bigger"}`;
      } else if (len) {
        sizePatch = { sizeCm: clamp(len.cm, 1, 60) }; sizeDesc = `resized it to ${fmtSize(len.cm)}`; sizeAbs = true;
        c = c.slice(0, len.index) + " " + c.slice(len.index + len.len);
      } else if (up || down) {
        const f = { tiny: 1.06, small: 1.12, normal: 1.25, large: 1.6 }[lvl];
        sizePatch = { scaleBy: up ? f : 1 / f };
        sizeDesc = `made it ${lvl === "small" || lvl === "tiny" ? "a bit " : lvl === "large" ? "a lot " : ""}${up ? "bigger" : "smaller"}`;
        relative = true;
      } else {
        for (const [re, cm] of SIZE_WORDS) if (re.test(cs)) {
          const v = sizeForWord(cm, (R().get(t0.region) || { r: {} }).r.sizeCm);
          sizePatch = { sizeCm: v }; sizeDesc = `made it ${re.exec(cs)[0]} (${fmtSize(v)})`; sizeAbs = true; break;
        }
      }
      if (sizePatch) {
        patchFor.push([sizePatch, sizeDesc]); kind = kind || "size";
        if (!follow) follow = pick(["How's that size?", "Better?", "Want it even bigger or smaller?"], random);
      }
    }

    // ---- rotation
    if (/\b(?:rotate|rotated|rotation|turn|spin|tilt|tilted|angle|angled|twist|upside[- ]down|sideways|straighten|straight|level|upright|clockwise|counter[- ]?clockwise|anti[- ]?clockwise|degrees|follows?|following|align\w*|parallel|line it up|lined up|horizontal(?:ly)?|vertical(?:ly)?|lengthwise|perpendicular)\b/.test(c) && !/\bturn (?:it )?(?:red|blue|black|green|into|to)\b/.test(c)) {
      let patch = null, desc = null;
      const deg = /(-?\d+(?:\.\d+)?)\s*(?:degrees)?/.exec(c.replace(/\b\d+(?:\.\d+)?\s*(?:cm|mm|inch(?:es)?|in)\b/g, ""));
      const ccw = /\b(?:counter[- ]?clockwise|anti[- ]?clockwise|ccw|to the left|left)\b/.test(c);
      const along = /\b(?:follows?|following|along|in line with|line(?:s)? up with|align(?:ed|s)?(?: it)? (?:with|to)|parallel (?:to|with)|with the (?:direction|line) of|run(?:s|ning)? (?:along|down|up))\s+(?:my |the |your )?(?:arm|forearm|leg|limb|calf|thigh|shin|spine|body|bone|muscle|it|finger|neck)s?\b|\b(?:vertical(?:ly)?|lengthwise|up and down|along it)\b/.test(c);
      const across = /\b(?:across|perpendicular|horizontal(?:ly)?|crosswise|sideways across)\b/.test(c) && !along;
      if (along || across || /\b(?:straighten|straight|reset (?:the )?(?:rotation|angle)|no rotation|not rotated|untilt)\b/.test(c)) {
        const base = await regionDefaultRot(t0);
        patch = { rotation: across ? base + 90 : base };
        desc = along ? "lined it up with your " + (/\b(leg|calf|thigh|shin|spine|body|neck|finger)\b/.exec(c) || ["", "arm"])[1] : across ? "turned it to run across" : "straightened it";
      }
      else if (/\b(?:upright|level|no tilt)\b/.test(c)) { patch = { rotation: 0 }; desc = "set it upright"; }
      else if (/\bupside[- ]down\b/.test(c)) { patch = { rotateBy: 180 }; desc = "turned it upside down"; }
      else if (/\bsideways\b/.test(c)) { patch = { rotateBy: ccw ? -90 : 90 }; desc = "turned it sideways"; }
      else if (deg && /\b(?:to|at)\s+-?\d/.test(c)) { patch = { rotation: parseFloat(deg[1]) * (ccw ? -1 : 1) }; desc = `set the angle to ${Math.round(parseFloat(deg[1]))}°`; }
      else if (deg) { const d = parseFloat(deg[1]) * (ccw ? -1 : 1); patch = { rotateBy: d }; desc = `rotated it ${Math.abs(Math.round(d))}°${ccw ? " counter-clockwise" : ""}`; relative = true; }
      else { const d = ({ tiny: 5, small: 10, normal: 15, large: 45 })[lvl] * (ccw ? -1 : 1); patch = { rotateBy: d }; desc = `${/tilt/.test(c) ? "tilted" : "rotated"} it ${Math.abs(d)}°${ccw ? " the other way" : ""}`; relative = true; }
      patchFor.push([patch, desc]); kind = kind || "rotate";
    }

    // ---- flip / mirror in place
    if (/\b(?:face|facing|look|looking|point|pointing)\s+(?:the\s+)?(?:other|opposite) (?:way|direction|side)\b|\b(?:face|facing|look|looking|point|pointing)\s+(?:to\s+the\s+|towards?\s+(?:the\s+)?)?(?:left|right|inward|outward|in|out)\b/.test(c)) {
      patchFor.push([(t) => ({ flip: !t.flip }), "flipped it so it faces the other way"]); kind = kind || "flip";
    } else if (/\b(?:flip|mirror|reverse|flipped|mirrored)\b/.test(c) && !/\bother\b/.test(c)) {
      if (/\b(?:vertical(?:ly)?|upside)\b/.test(c)) patchFor.push([(t) => ({ flip: !t.flip, rotateBy: 180 }), "flipped it vertically"]);
      else if (/\b(?:unflip|back|original|normal)\b/.test(c)) patchFor.push([{ flip: false }, "un-flipped it"]);
      else patchFor.push([(t) => ({ flip: !t.flip }), "flipped it"]);
      kind = kind || "flip";
    }

    // ---- movement
    const mv = parseMove(c.replace(/\bupside[- ]down\b|\b(?:turn|rotate|spin|tilt)\w*\s+(?:it|that|this|them)?\s*(?:to the )?(?:left|right)\b/g, " "), t0, lvl);
    if (mv) {
      if (mv.say) { say = mv.say; }
      else { patchFor.push([mv.patch, mv.desc]); kind = kind || "move"; relative = true; }
    }

    // ---- ink / color
    let inkPatch = null, inkDesc = null;
    const col = findColor(c);
    if (/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black(?:work)?(?: ink)?|all black|blackout)\b/.test(c) && !/\bnot black\b/.test(c) && !findStyle(c.replace(/\bblack\b/, ""))?.id?.includes?.("black")) {
      inkPatch = { ink: "black" }; inkDesc = "switched it to black ink";
    } else if (/\b(?:stencil|outline only|just the outline|transfer)\b/.test(c)) { inkPatch = { ink: "stencil" }; inkDesc = "showing it as a stencil"; }
    else if (/\b(?:original colou?rs?|full colou?r|in colou?r|colou?rful|multicolou?r(?:ed)?|its colou?rs?|normal colou?rs?|default colou?rs?|remove the colou?r tint|back to (?:the )?(?:original|normal))\b/.test(c)) { inkPatch = { ink: "original" }; inkDesc = "back to its original colors"; }
    else if (col && !/\b(?:skin|background)\b/.test(c) && (await paletteFor(ids, t0, col))) {
      parts.push(`switched the watercolor palette to ${col.name}`); kind = kind || "design";
    } else if (col && !/\b(?:skin|background)\b/.test(c)) {
      inkPatch = { ink: "color", color: col.hex }; inkDesc = `made it ${col.name.startsWith("#") ? col.name : col.name}`;
    } else if (/\b(?:darker|deeper|bolder|richer|more saturated|stronger|more solid|more opaque|less transparent|more visible)\b/.test(c) && !/\blines?\b/.test(c)
      && (t0.opacity ?? 1) >= 0.99 && !(t0.age > 0.02) && t0.ink !== "color") {
      say = t0.ink === "black" ? "It's already solid black at full strength — I can make the lines thicker instead." : "It's already at full strength — want it in solid black ink, or with thicker lines?";
      chips = t0.ink === "black" ? ["Thicker lines", "Bigger"] : ["Black ink", "Thicker lines"];
    } else if (/\b(?:darker|deeper|bolder|richer|more saturated|stronger|more solid|more opaque|less transparent|more visible)\b/.test(c) && !/\blines?\b/.test(c)) {
      patchFor.push([(t) => ({ opacity: clamp((t.opacity ?? 1) + 0.25, 0.1, 1), age: Math.max(0, (t.age || 0) - 0.25), ...(t.ink === "color" && t.color ? { color: shadeHex(t.color, -0.2) } : {}) }), "made it darker"]);
      kind = kind || "ink"; relative = true;
    } else if (/\b(?:lighter|fainter|softer|subtler|more subtle|more transparent|see[- ]through|less opaque|less visible|paler|translucent)\b/.test(c) && !/\blines?\b/.test(c)) {
      patchFor.push([(t) => ({ opacity: clamp((t.opacity ?? 1) - 0.2, 0.15, 1) }), "made it lighter"]);
      kind = kind || "opacity"; relative = true;
    }
    // "in color" on a design that's already showing its own (black line) colors → redraw it in color if the style can
    if (inkPatch && inkPatch.ink === "original" && /\b(?:in colou?r|full colou?r|colou?rful|colou?red|add colou?rs?|with colou?rs?)\b/.test(c)) {
      const info = designInfo(t0.designId);
      const st = styles().find((x) => x.id === info.style);
      const opt = st && (st.options || []).find((o) => o.type === "select" && /^(?:render|ink|palette|lines)$/.test(o.key) && (o.choices || []).some((ch) => ch.value === "color"));
      if (opt && (info.opts || {})[opt.key] !== "color") {
        const d = await regen(info, { ...(info.opts || {}), [opt.key]: "color" });
        for (const id of ids) await app.updateTattoo(id, { designId: d.id, ink: "original" });
        parts.push("redrew it in full color"); kind = kind || "design";
        inkPatch = null;
      } else if (t0.ink === "original" && !opt) {
        say = say || `This ${st ? st.name.replace(/\s*\(.*?\)/g, "").toLowerCase() : ""} design is line work only — I can tint it a single ink color (e.g. “make it red”) or switch to a colorful style like watercolor or traditional.`;
        chips = ["Make it watercolor", "Make it traditional", "Make it red"];
        inkPatch = null;
      }
    }
    if (inkPatch) { patchFor.push([inkPatch, inkDesc]); kind = kind || "ink"; }
    if ((m = /\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:more\s+)?(?:transparent|see[- ]through|translucent|faded out)\b/.exec(c))) {
      const v = clamp(1 - parseFloat(m[1]) / 100, 0.05, 1);
      patchFor.push([{ opacity: v }, `made it ${Math.round(parseFloat(m[1]))}% transparent`]);
      kind = kind || "opacity";
      // drop the generic "lighter" patch added above for "transparent"
      for (let i = patchFor.length - 2; i >= 0; i--) if (patchFor[i][1] === "made it lighter") patchFor.splice(i, 1);
    } else if ((m = /\bopacity(?: to| at| of)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?|\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s*opa(?:city|que)\b/.exec(c))) {
      let v = parseFloat(m[1] || m[3]);
      if (v > 1) v /= 100;
      patchFor.push([{ opacity: clamp(v, 0.05, 1) }, `set the opacity to ${Math.round(clamp(v, 0.05, 1) * 100)}%`]);
      kind = kind || "opacity";
    }

    // ---- age
    if ((m = /\b(\d+)\s*years?\s*old\b|\bafter\s+(\d+)\s*years?\b|\bin\s+(\d+)\s*years?\b/.exec(c))) {
      const y = parseInt(m[1] || m[2] || m[3], 10);
      const a = clamp(y / 20, 0.05, 1);
      patchFor.push([{ age: a }, `aged it about ${y} year${y === 1 ? "" : "s"}`]);
      kind = kind || "age";
    } else if (/\b(?:healed|settled|healed up)\b/.test(c)) { patchFor.push([{ age: 0.3 }, "made it look healed"]); kind = kind || "age"; }
    else if (/\b(?:old|older|aged|vintage|faded|fade|worn|weathered|blurry|blown out|decades)\b/.test(c) && !/\bold (?:school|skool)\b/.test(c)) {
      const more = /\b(?:more|older|further)\b/.test(c);
      patchFor.push([more ? (t) => ({ age: clamp((t.age || 0) + 0.25, 0, 1) }) : { age: lvl === "small" || lvl === "tiny" ? 0.45 : lvl === "large" ? 0.95 : 0.75 }, more ? "aged it a bit more" : "made it look old and faded"]);
      kind = kind || "age";
    } else if (/\b(?:fresh|new|brand new|just done|freshly|crisp|sharp|un-?aged|younger|less faded)\b/.test(c) && !/\b(?:new design|new one|another|variation)\b/.test(c)) {
      patchFor.push([{ age: 0 }, "made it look fresh"]); kind = kind || "age";
    }

    // ---- visibility
    if (/\b(?:hide|hidden|invisible|turn off|disable)\b/.test(c)) { patchFor.push([{ visible: false }, "hid it"]); kind = kind || "visibility"; }
    else if (/\b(?:unhide|show it again|make it visible|bring it back|turn (?:it )?on)\b/.test(c)) { patchFor.push([{ visible: true }, "made it visible again"]); kind = kind || "visibility"; }

    // ---- reset / center
    if (/^(?:cent(?:er|re) it|re-?cent(?:er|re)|put it in the (?:middle|cent(?:er|re))|reset (?:the )?position)\b/.test(c.trim())) {
      patchFor.push([(t) => ({ region: t.region }), "re-centered it"]); kind = kind || "move";
    }

    // ---- apply
    if (patchFor.length) {
      for (const id of ids) {
        const t = tattooById(id);
        if (!t) continue;
        let patch = {};
        for (const [p] of patchFor) Object.assign(patch, typeof p === "function" ? p({ ...t, ...patch }) : p);
        // moveCm is body-aligned in the app (up = along the body part toward the head, right = viewer's right)
        const res = await app.updateTattoo(id, patch);
        if (res && res.id) remember(res);
        if (patch.rotateBy || patch.moveCm) ctx.lastPatch = { rotateBy: patch.rotateBy || 0, moveCm: patch.moveCm || null };
      }
      for (const [, d] of patchFor) parts.push(d);
      const t = tattooById(ids[ids.length - 1]);
      if (sizePatch && t && !all && !sizeAbs) parts[parts.indexOf(sizeDesc)] = `${sizeDesc} (now ${fmtSize(t.sizeCm)})`;
      if (all) for (let i = 0; i < parts.length; i++) parts[i] = parts[i].replace(/\bit\b/g, "them");
    }
    if (!parts.length && !say && /^(?:make|change|set|do|turn)\b/.test(c.trim()) && !quiet) {
      return { parts, say: "What should I change — size, position, angle, color or style?", chips: ["Bigger", "Smaller", "Rotate 15°", "Make it red", "Change style"], kind: "ask", ask: true };
    }
    return { parts, kind, relative, follow, chips, say };
  }

  function parseMove(c, t, lvl) {
    const len = parseLength(c);
    const base = { tiny: 0.5, small: 1, normal: 2, large: 4 }[lvl];
    const amt = len && !/\b(?:wide|big|bigger|smaller|size)\b/.test(c) ? Math.abs(len.cm) : base;
    const concept = R().conceptOf(t.region);
    let up = 0, right = 0, desc = [];
    const lm = LANDMARK_RE.exec(c);
    if (lm && /\b(?:move|shift|slide|nudge|bump|push|pull|bring|closer|nearer|towards?|away|further|farther|put it|place it|lower|higher|up|down)\b/.test(c)) {
      const dir = landmarkMove(lm[1], concept);
      const away = /away|further|farther/.test(lm[0]);
      if (!dir) return { say: `It's already about as close to your ${lm[1]} as I can tell — want me to move it up or down instead?` };
      if (dir.up) { up = dir.up * amt * (away ? -1 : 1); desc.push(`${away ? "away from" : "closer to"} your ${lm[1]}`); }
      else if (dir.center) {
        const h = horizontalToCenter(t, dir.center * (away ? -1 : 1));
        if (h == null) return { say: Math.abs((t.position || [0])[0]) < 0.015 ? "It's already right in the middle." : "From that angle I can't tell which way the center is — try “move it left” or “right”." };
        right = h * amt; desc.push(`${(dir.center > 0) !== away ? "toward the center" : "toward the side"}`);
      }
    } else {
      if (!/\b(?:move|shift|slide|nudge|bump|push|pull|bring|up|down|higher|lower|raise|left|right|upward|downward|upwards|downwards|over)\b/.test(c)) return null;
      if (/\b(?:higher|up|upward|upwards|raise|raised|further up)\b/.test(c)) { up += amt; desc.push(`${len ? fmtLen(amt) + " " : ""}${/higher/.test(c) ? "higher" : "up"}`); }
      if (/\b(?:lower|down|downward|downwards|further down)\b/.test(c)) { up -= amt; desc.push(`${len ? fmtLen(amt) + " " : ""}${/lower/.test(c) ? "lower" : "down"}`); }
      const personal = /\b(?:to|towards?) (?:my|his|her) (left|right)\b|\bmy (left|right)\b/.exec(c);
      if (personal) {
        const which = personal[1] || personal[2];
        const s = personSideSign(t);
        if (s == null) right += (which === "right" ? 1 : -1) * amt;
        else right += (which === "left" ? 1 : -1) * s * amt;
        desc.push(`toward your ${which}`);
      } else if (/\b(?:left|right)\b/.test(c) && /\b(?:move|shift|slide|nudge|bump|push|over|to the|a bit|slightly|little|more|left|right)\b/.test(c)) {
        if (/\bleft\b/.test(c)) { right -= amt; desc.push(`${len ? fmtLen(amt) + " " : ""}left`); }
        if (/\bright\b/.test(c)) { right += amt; desc.push(`${len ? fmtLen(amt) + " " : ""}right`); }
      }
      if (!up && !right) return null;
    }
    const patch = { moveCm: { right: Math.round(right * 100) / 100, up: Math.round(up * 100) / 100 } };
    return { patch, desc: `moved it ${desc.join(" and ")}` };
  }

  // +1 if the tattoo's "right" (viewer's right) points to the person's left (+X).
  function personSideSign(t) {
    const n = t.normal || [0, 0, 1];
    const rx = n[2]; // right = cross(Y, n) = (nz, 0, -nx)
    const len = Math.hypot(n[2], n[0]) || 1;
    if (Math.abs(rx / len) < 0.35) return null;
    return Math.sign(rx);
  }
  function horizontalToCenter(t, toward = 1) {
    const x = t.position ? t.position[0] : 0;
    if (Math.abs(x) < 0.015) return null;
    const s = personSideSign(t);
    if (s == null) return null;
    // desired world direction: -sign(x) along X (toward the midline)
    return -Math.sign(x) * s * toward;
  }

  /* ── design regeneration ── */
  async function tryDesignChange(ids, c) {
    const t = tattooById(ids[0]);
    const info = designInfo(t.designId);
    const styleList = styles();
    const style = styleList.find((s) => s.id === info.style) || null;
    let m;

    // explicit new subject: "make it a lion instead", "change it to a snake", "swap the wolf for a fox"
    if ((m = /\b(?:make|change|turn|swap|switch|replace)\s+(?:it|that|this|the design|the tattoo|the \w+)\s+(?:in)?to\s+(?:an?\s+)?(.+)$|\b(?:make|change)\s+(?:it|that|this)\s+(?:an?\s+)(.+)$|\b(?:swap|replace)\s+(?:it|that|this|the \w+)\s+(?:for|with)\s+(?:an?\s+)?(.+)$|^(?:(?:how about|what about|try)\s+)?an?\s+(.+?)\s+instead$/.exec(c))) {
      let subj = (m[1] || m[2] || m[3] || m[4] || "").replace(/\binstead\b/, "").trim();
      if (subj && !MOD_WORDS.test(subj) && !findColor(subj) && !SIZE_WORDS.some(([re]) => re.test(subj)) && !/^(?:bigger|smaller|darker|lighter|black|stencil|healed|old|fresh|faded|thinner|thicker)\b/.test(subj)) {
        const st = findStyle(subj);
        const subjNoStyle = st ? subj.replace(lastStyleMatch, " ").replace(/\b(?:style|font|lettering|letters|letter|type|look|version|one|instead)\b/g, " ").trim() : subj;
        if (st && !subjNoStyle) return restyle(ids, st, info);
        const sj = findSubjects(subj)[0] || (findSubstitute(subj) && { id: findSubstitute(subj).id, word: findSubstitute(subj).word });
        let d;
        const subjOpt = style && !st && sj && (style.options || []).find((o) => o.key === "subject" && (o.choices || []).some((ch) => ch.value === sj.id));
        if (subjOpt) d = await makeDesign({ styleId: style.id, opts: { ...(info.opts || {}), subject: sj.id }, prompt: `${style.name.toLowerCase()} ${subj}` });
        else {
          // keep the current style only if it can draw subjects at all (a mandala can't be "a rose")
          const keepStyle = style && !sj ? !/^lettering/.test(style.id) : style && (style.options || []).some((o) => o.key === "subject");
          const prompt = st ? subj : `${keepStyle ? style.name.toLowerCase().replace(/\s*\(.*?\)/g, "") + " " : ""}${sj && findSubstitute(subj) && !findSubjects(subj).length ? subj.replace(findSubstitute(subj).word, sj.id) : subj}`;
          const plan = await planDesign(prompt);
          d = plan ? await makeDesign({ prompt, styleId: st ? st.id : plan.styleId, opts: st ? undefined : plan.opts }) : await makeDesign({ prompt, styleId: st ? st.id : undefined });
        }
        for (const id of ids) await app.updateTattoo(id, { designId: d.id });
        const nn = designInfo(d.id);
        const ok = !sj || tattooMatchesSubject(tattooById(ids[0]), sj);
        return { done: `swapped it for a ${nn.friendly}`, rest: "", follow: ok ? (findSubstitute(subj) && !findSubjects(subj).length ? `I don't have a ${findSubstitute(subj).word} design, so that's the closest match.` : "Better?") : `I couldn't draw a ${sj.word} in that style, sorry — try “${sj.word} in fine line”.` };
      }
    }

    // style change: "make it geometric", "in watercolor style", "change the style to mandala"
    const st = findStyle(c);
    if (st && (/\b(?:style|make it|make them|change|switch|turn it|try|in|as an?|redo)\b/.test(c)) && st.id !== info.style) {
      return restyle(ids, st, info, c);
    }
    if (/\b(?:change|switch|different|another|other)\s+(?:the\s+)?style\b|\bchange style\b/.test(c)) {
      const opts = styleList.filter((s) => s.id !== info.style).slice(0, 6);
      return { say: "Sure — which style?", chips: opts.map((s) => `Make it ${s.name.toLowerCase()}`), kind: "ask", ask: true };
    }

    // variation / reroll
    if (/\b(?:another (?:version|variation|one like (?:it|this)|take|design)|new (?:version|variation|design)|different (?:version|variation|one|design)|variation|regenerate|re-?roll|shuffle|randomi[sz]e|redo (?:it|the design)|try again|surprise me|something else)\b/.test(c)) {
      const opts = { ...(info.opts || {}) };
      const seedOpt = style && (style.options || []).find((o) => o.type === "seed" || /seed/i.test(o.key));
      opts[seedOpt ? seedOpt.key : "seed"] = Math.floor(random() * 1e6);
      const d = await regen(info, opts);
      for (const id of ids) await app.updateTattoo(id, { designId: d.id });
      return { done: "made a new variation of the design", rest: "", follow: "Like this one better? Say “another” for more, or “undo” to go back." };
    }

    // option tweaks: "thinner lines", "more petals", "more detail", "8 petals", "no shading"
    if (!style || !(style.options || []).length) {
      if (OPTION_HINTS.some((h) => h.say.test(c)) && /\b(?:more|less|fewer|thinner|thicker|bolder|finer|simpler|detailed|busier|cleaner|add|remove|no|without|with)\b/.test(c) && !/\b(?:bigger|smaller|higher|lower)\b/.test(c)) {
        return { say: "This design can't be tweaked that way, but I can make a new variation, change its style, or resize it.", chips: ["Another variation", "Change style", "Bigger"], kind: "design" };
      }
      return null;
    }
    let hintNoOpt = null, hintSame = null;
    for (const hint of OPTION_HINTS) {
      const hm = hint.say.exec(c);
      if (!hm) continue;
      let opt = null;
      for (const k of hint.keys) {
        opt = style.options.find((o) => (o.key + " " + o.label).toLowerCase().includes(k) && o.type !== "seed" && o.type !== "text");
        if (opt) break;
      }
      if (!opt) { hintNoOpt = hintNoOpt || hm[0]; continue; }
      hintSame = hm[0];
      const curVal = info.opts && info.opts[opt.key] != null ? info.opts[opt.key] : opt.default;
      let next = curVal, desc = null;
      const inc = /\b(?:more|thicker|bolder|heavier|bigger|larger|wider|increase|add|denser|busier|detailed|complex|intricate|curvier|longer|fatter|stronger|with)\b/.test(c);
      const dec = /\b(?:less|fewer|thinner|finer|lighter|smaller|narrower|decrease|reduce|simpler|simple|cleaner|minimal|delicate|remove|no|without|shorter|weaker|sparser)\b/.test(c);
      const numM = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${hm[0].replace(/s$/, "")}s?)`).exec(c);
      const optName = hm[0].replace(/^(?:linework|line ?work|line weight|thicker|thinner|bolder|finer|heavier|chunkier|skinnier lines)$/, "lines");
      if (opt.type === "range") {
        const span = (opt.max - opt.min) || 1;
        const stepUnit = opt.step || span / 100;
        if (numM) next = parseFloat(numM[1]);
        else if (inc || dec) {
          const mult = { tiny: 0.08, small: 0.12, normal: 0.22, large: 0.4 }[amountLevel(c)];
          let delta = Math.max(stepUnit, span * mult);
          if (opt.step && opt.step >= 1) delta = Math.max(1, Math.round(delta));
          next = Number(curVal) + (inc ? delta : -delta);
        } else continue;
        next = clamp(Math.round(next / stepUnit) * stepUnit, opt.min, opt.max);
        next = Math.round(next * 1000) / 1000;
        if (next === Number(curVal)) return { say: numM ? `It already has ${next} ${optName}.` : `That's already as ${inc ? "high" : "low"} as ${optName} go for this style.`, kind: "design" };
        desc = numM ? `set ${optName} to ${next}` : `${/line/.test(optName) ? (inc ? "made the lines thicker" : "made the lines thinner") : `${inc ? "more" : /petal|point|ring|layer|leaf|leaves|star|dot|side/.test(optName) ? "fewer" : "less"} ${optName}`}`;
      } else if (opt.type === "bool") {
        next = /\b(?:lower ?case|small letters|no|without|remove|turn off|less|fewer|disable)\b/.test(c) ? false : !(dec && !inc);
        if (next === !!curVal) continue;
        desc = /upper|caps/i.test(opt.key) ? (next ? "switched it to capital letters" : "switched it to lowercase") : `${next ? "added" : "removed"} ${optName}`;
      } else if (opt.type === "select" && opt.choices && opt.choices.length) {
        const byLabel = opt.choices.find((ch) => new RegExp(`\\b${escapeRe(String(ch.label || ch.value).toLowerCase())}\\b`).test(c));
        if (byLabel) next = byLabel.value;
        else {
          const i = opt.choices.findIndex((ch) => ch.value === curVal);
          const n = opt.choices.length;
          next = inc || dec ? opt.choices[clamp(i + (dec ? -1 : 1), 0, n - 1)].value : opt.choices[(i + 1 + n) % n].value; // "change the font" cycles
        }
        if (next === curVal) continue;
        {
          const ch = opt.choices.find((x) => x.value === next);
          const lab = String((ch && ch.label) || next).toLowerCase().replace(/[-_]/g, " ");
          desc = /^(?:none|no|off)$/.test(String(next)) ? `removed the ${String(opt.label || optName).toLowerCase()}` : `set the ${String(opt.label || optName).toLowerCase()} to ${lab}`;
        }
      } else continue;
      const opts = { ...(info.opts || {}), [opt.key]: next };
      const d = await regen(info, opts);
      for (const id of ids) await app.updateTattoo(id, { designId: d.id });
      const rest = c.replace(hm[0], " ").replace(/\b(?:more|less|fewer|thinner|thicker|bolder|finer|simpler|make|the|it)\b/g, " ");
      return { done: desc, relative: true, rest: /\b(?:bigger|smaller|red|blue|black|higher|lower|rotate)\b/.test(rest) ? rest : "", follow: "Better?" };
    }
    const addVerb = /\b(?:add|more|less|fewer|no|without|remove|with|give it|put)\b/.test(c) && !/\b(?:bigger|smaller|higher|lower|darker|lighter)\b/.test(c);
    if (hintSame && addVerb) return { say: `It's already set up that way — want a new variation instead?`, chips: ["Another variation", "Change style", "Bigger"], kind: "design" };
    const noun = /complex|detail|intricate|busier|busy|simpler|simple|minimal|cleaner/.test(hintNoOpt || "") ? "a detail level" : /^(?:curv|swirl|flow)/.test(hintNoOpt || "") ? "curves" : hintNoOpt;
    if (hintNoOpt && (addVerb || /^(?:more|less)\b/.test(c.trim())) && !/\b(?:lines?|line ?work|outlines?)\b/.test(hintNoOpt)) return { say: `The ${style.name.replace(/\s*\(.*?\)/g, "").toLowerCase()} design doesn't have ${noun} I can change — I can make a new variation, switch the style, or add another small design next to it.`, chips: ["Another variation", "Change style", "Add a small star next to it"], kind: "design" };
    return null;
  }

  // Designs with their own multi-color palettes (watercolor): change the palette, keep the colors alive.
  const PALETTE_OF = { red: "red", crimson: "red", scarlet: "red", cherry: "red", maroon: "red", burgundy: "red", blue: "blue", "light blue": "blue", "sky blue": "blue", navy: "ocean", "dark blue": "ocean", cobalt: "blue", "royal blue": "blue",
    teal: "teal", turquoise: "teal", cyan: "teal", aqua: "teal", green: "green", emerald: "green", "dark green": "green", mint: "green", purple: "purple", violet: "purple", lavender: "purple", lilac: "purple", indigo: "purple", plum: "purple",
    pink: "pink", "hot pink": "pink", magenta: "pink", fuchsia: "pink", orange: "orange", coral: "orange", peach: "orange", yellow: "autumn", gold: "autumn", golden: "autumn", amber: "autumn", black: "black", grey: "black", gray: "black" };
  async function paletteFor(ids, t, col) {
    const info = designInfo(t.designId);
    const st = styles().find((x) => x.id === info.style);
    const opt = st && st.id === "watercolor" && (st.options || []).find((o) => o.key === "colors" && o.type === "select");
    const want = opt && PALETTE_OF[col.name];
    if (!want || !(opt.choices || []).some((ch) => ch.value === want)) return false;
    const d = await regen(info, { ...(info.opts || {}), colors: want });
    for (const id of ids) await app.updateTattoo(id, { designId: d.id, ink: "original" });
    return true;
  }

  async function regen(info, opts) {
    const styleId = info.style;
    const d = await makeDesign({ styleId: styleId || undefined, opts, prompt: styleId ? undefined : info.prompt || info.name, name: info.name && info.name !== "tattoo" ? info.name : undefined });
    const entry = ctx.designs.get(d.id);
    if (entry) { entry.opts = { ...(entry.opts || {}), ...opts }; entry.prompt = info.prompt || entry.prompt; }
    return d;
  }

  async function restyle(ids, st, info) {
    const o = info.opts || {};
    const opts = {};
    const optOf = (k) => (st.options || []).find((x) => x.key === k);
    const has = (k, v) => { const op = optOf(k); return op && (!op.choices || op.choices.some((ch) => ch.value === v)); };
    const subj = o.subject || o.flower;
    if (subj && has("subject", subj)) opts.subject = subj;
    if (subj && has("flower", subj)) opts.flower = subj;
    const textOpt = (st.options || []).find((x) => x.type === "text");
    if (o.text && textOpt) opts[textOpt.key] = o.text;
    let what = info.friendly.replace(/^“[^”]*”\s*/, "");
    for (const x of styles()) what = what.replace(new RegExp(`\\b${escapeRe(x.name.toLowerCase().replace(/\s*\(.*?\)/g, "").replace(/\s*\/.*$/, ""))}\\b`, "g"), " ");
    what = what.replace(/\b(?:style|lettering)\b/g, " ").replace(/\s+/g, " ").trim();
    const sname = st.name.replace(/\s*\(.*?\)/g, "").replace(/\s*\/.*$/, "").replace(/^Lettering:\s*(.*)$/i, "$1 lettering").toLowerCase();
    const prompt = `${sname} ${o.text ? `"${o.text}"` : what}`.trim();
    const d = await makeDesign({ styleId: st.id, prompt, opts });
    for (const id of ids) await app.updateTattoo(id, { designId: d.id });
    const nn = designInfo(d.id);
    const lost = subj && !opts.subject && !opts.flower && !/^lettering/.test(st.id) && !tattooMatchesSubject(tattooById(ids[0]), { id: String(subj), word: String(subj) });
    return { done: `redid it in ${sname}${/lettering$/.test(sname) ? "" : " style"} (${nn.friendly})`, rest: "", follow: lost ? `${st.name.replace(/\s*\(.*?\)/g, "")} designs don't come with a ${subj}, so the motif changed — say “undo” to go back.` : "What do you think?" };
  }

  return {
    handle,
    context: ctx,
    reset() { ctx.currentId = null; ctx.pending = null; ctx.lastRelative = null; },
  };
}
