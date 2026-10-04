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

const VERBS = [
  "put", "place", "add", "give", "make", "move", "shift", "slide", "nudge", "bump", "rotate", "turn", "tilt", "spin",
  "flip", "mirror", "show", "zoom", "remove", "delete", "erase", "get rid", "switch", "change", "set", "undo", "redo",
  "duplicate", "copy", "clone", "scale", "resize", "enlarge", "shrink", "colou?r", "paint", "fade", "age", "darken",
  "lighten", "lower", "raise", "hide", "unhide", "cent(?:er|re)", "focus", "swap", "replace", "try", "draw", "write",
  "bring", "push", "pull", "drop", "increase", "decrease", "reduce", "use", "i want", "i'd like", "i would like",
  "can you", "could you", "let's", "lets", "do the same", "same", "ink", "tattoo", "go back", "reset", "clear", "view",
  "zoom", "take", "straighten", "a bit", "slightly", "bigger", "smaller", "higher", "more", "less", "fewer",
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
  s = s.toLowerCase();
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
    for (const c of part.split(SPLIT_RE)) if (c && c.trim()) out.push(c.trim());
  }
  return out;
}

function stripPolite(c) {
  let prev;
  do {
    prev = c;
    c = c.replace(/^(?:ok(?:ay)?|alright|right|hey|hi|yo|so|well|um+|uh+|hmm+|now|also|then|and|but|great|cool|nice|perfect|awesome|thanks|thank you|yes|yeah|yep|sure|please|pls|plz|actually)\b[ ,]*/, "");
    c = c.replace(/^(?:(?:can|could|would|will) you(?: please)?|i want you to|go ahead and|please)\s+(?=(?:make|move|rotate|turn|flip|mirror|show|zoom|remove|delete|switch|change|undo|redo|duplicate|copy|resize|scale|color|colour|hide|fade|center|centre|set|take|tilt|shift|nudge|raise|lower|swap|replace|darken|lighten|straighten|erase|clear|reset|focus)\b)/, "");
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
  };
  let resolver = null, resolverKey = "";

  /* app helpers */
  function R() {
    let list = [];
    try { list = app.listRegions() || []; } catch {}
    const key = list.map((r) => r.id).join(",");
    if (!resolver || key !== resolverKey) { resolver = new RegionResolver(list); resolverKey = key; }
    return resolver;
  }
  const state = () => { try { return app.getState() || {}; } catch { return {}; } };
  const tattoos = () => state().tattoos || [];
  const tattooById = (id) => tattoos().find((t) => t.id === id) || null;
  const units = () => { try { return app.getSetting && app.getSetting("place.units") === "in" ? "in" : "cm"; } catch { return "cm"; } };
  const fmtSize = (cm) => SIZE_FMT(cm, units());
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
    return {
      id: designId,
      name: (mine && mine.name) || (d && d.name) || "tattoo",
      style: (mine && mine.styleId) || (d && d.style) || null,
      prompt: mine && mine.prompt,
      opts: (mine && mine.opts) || (d && d.params && (d.params.opts || d.params)) || {},
    };
  }
  function tattooName(t) {
    if (!t) return "tattoo";
    return lowerName(designInfo(t.designId).name);
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
    ctx.designs.set(d.id, {
      prompt: prompt || (ctx.designs.get(ctx.lastDesignId) || {}).prompt || d.name,
      styleId: d.style || params.styleId || styleId || null,
      opts: params.opts || (params.styleId ? {} : params) || opts || {},
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
    if ((m = /\b(?:all of them|them all|all (?:my |the |of my |of the )?(?:tattoos|designs|pieces|ones)|every(?: one|one| tattoo)|both(?: of them)?|all)\b/.exec(c))) {
      out.ids = list.map((t) => t.id); out.all = true; out.explicit = true;
      out.rest = (c.slice(0, m.index) + c.slice(m.index + m[0].length)).trim();
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

  async function runClause(clause0, quotes, raw, index, total) {
    if (/^(?:thanks?(?: you)?(?: so much)?|thx|ty|cheers|cool|nice|great|perfect|awesome|love it|i love it|looks (?:good|great|amazing|awesome)|beautiful|amazing|sweet|wow|ok|okay|good|lovely)(?: (?:thanks|thank you))?$/.test(clause0.trim()))
      return { say: pick(["Glad you like it! Anything else — another piece, or tweak this one?", "Looks great on you! Want to try another design?", "Nice! Want to see it from another angle?"], random), info: true, kind: "chat" };
    let c = stripPolite(clause0);
    if (!c) return null;

    // Answering a pending question?
    if (ctx.pending) {
      const p = ctx.pending;
      ctx.pending = null;
      if (p.kind === "where") {
        const reg = findRegion(c, { preferFree: true });
        if (reg && reg.rest.replace(/\b(?:on|my|the|please|there|it)\b/g, "").trim().length < 3) {
          return placeNew({ ...p.spec, regionId: reg.regionId, regionMatch: reg });
        }
      } else if (p.kind === "what") {
        if (!isCommandLike(c)) {
          const spec = parsePlacementSpec(c, quotes, raw);
          if (spec.prompt || spec.lettering) return placeNew({ ...spec, regionId: p.regionId });
        }
      }
    }

    // ── small talk & help
    if (/^(?:hi|hello|hey|hiya|yo|good (?:morning|afternoon|evening)|sup|howdy)\b/.test(clause0) && c.split(" ").length <= 2 && total === 1)
      return { say: "Hi! Tell me what you'd like inked and where — for example “a small rose behind my right ear”.", info: true, chips: starterChips(), kind: "hello" };
    if (/^(?:thanks?(?: you)?|thx|ty|cheers|cool|nice|great|perfect|awesome|love it|i love it|looks (?:good|great|amazing|awesome)|beautiful|amazing|sweet|wow|ok|okay|good|lovely)\b[ .!]*$/.test(clause0))
      return { say: pick(["Glad you like it! Anything else — another piece, or tweak this one?", "Looks great on you! Want to try another design?", "Nice! Want to see it from another angle?"], random), info: true, kind: "chat" };
    if (/^(?:help|\?|what can you do|what do you do|how does this work|how do i\b.*|what can i (?:say|ask)|commands|options|tips?)\b/.test(c) || /\bwhat can you do\b/.test(c))
      return { say: HELP_TEXT, info: true, chips: starterChips(), kind: "help" };

    // ── undo / redo
    let m;
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
    if ((placeStart || hasQuote || writeVerb || bareWithRegion) && !PRONOUN_ONLY(c)) {
      const spec = parsePlacementSpec(c, quotes, raw);
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

    // ── a bare subject ("a dragon", "koi fish in watercolor") → place it
    if (!isCommandLike(c) && c.split(" ").length <= 8 && !/\?\s*$|^(?:why|how|when|who|what|is|are|do|does|can|should)\b/.test(c)) {
      const spec = parsePlacementSpec(c, quotes, raw);
      if (spec.prompt && spec.prompt.length >= 3) {
        if (!spec.regionId) {
          spec.regionId = pickFreeNear(ctx.lastRegion) || defaultRegion();
          spec.guessedRegion = true;
        }
        return placeNew(spec);
      }
    }

    // ── give up gracefully
    if (/\?\s*$|^(?:why|how|when|who|is|are|does|should)\b/.test(c))
      return { say: "Good question! I'm best at placing and tweaking tattoos — try “put a small rose on my wrist” or ask “what can you do?”.", info: true, chips: starterChips(), kind: "unknown" };
    return { say: "Sorry, I didn't quite get that. " + quickTip(), info: true, chips: tattoos().length ? followChips() : starterChips(), kind: "unknown" };
  }

  function hasDirection(c) {
    return /\b(?:up|down|higher|lower|left|right|over|upward|downward|a bit|slightly|\d+(?:\.\d+)? ?(?:cm|mm|in|inch|inches))\b/.test(c);
  }

  function PRONOUN_ONLY(c) {
    // "put it bigger" style clauses are modifications, not placements
    return /^(?:put|place|add|make|get|give)\s+(?:it|that|this|them)\b/.test(c) && !/\b(?:on|onto|behind|across|to)\b/.test(c);
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
    s = s.replace(/\b(?:copy|duplicate|clone|repeat|another|one more|a second|second|same|the|one|it|that|this|of|on|to|onto|put|add|place|make|give|me|please|and|a|an|too|also|as well|there|here|version)\b/g, " ");
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
    const spec = { prompt: "", regionId: null, sizeCm: null, color: null, ink: null, lettering: null, rotation: null, offsetCm: null, age: null, styleId: null };
    let s = " " + c + " ";

    // quoted text → lettering
    const qm = /qq(\d+)qq/.exec(s);
    if (qm) { spec.lettering = quotes[+qm[1]]; s = s.replace(/qq\d+qq/g, " "); }
    else {
      const w = /\b(?:write|spell|letter(?:ing)?|script|text|word|words|name|saying|that says|says|reading)\s+(?:the\s+)?(?:word\s+|name\s+)?([a-z][\w' ]{0,28}?)(?=\s+(?:on|onto|behind|across|in|along|down|under|at)\b|\s*$)/.exec(s);
      if (w && /^(?:write|spell)/.test(w[0].trim())) {
        const orig = new RegExp(escapeRe(w[1].trim()), "i").exec(raw);
        spec.lettering = orig ? orig[0] : w[1].trim();
        s = s.replace(w[0], " ");
      }
    }

    // landmark ("near the wrist") → offset after we know the region
    let landmark = null;
    const lm = LANDMARK_RE.exec(s);
    if (lm) { landmark = { word: lm[1], away: /away|further|farther/.test(lm[0]) }; s = s.replace(lm[0], " "); }

    // body part
    const reg = findRegion(s.trim(), { preferFree: true });
    if (reg) { spec.regionId = reg.regionId; spec.regionMatch = reg; s = " " + reg.rest + " "; }

    // explicit size
    const len = parseLength(s);
    if (len) { spec.sizeCm = clamp(len.cm, 1, 60); s = s.slice(0, len.index) + " " + s.slice(len.index + len.len); }
    s = s.replace(/\b(?:about|around|roughly|approx(?:imately)?|maybe|like|wide|across|big|tall|long|in size|sized?)\b(?=\s*$|\s)/g, (w) => /big/.test(w) && !len ? w : " ");
    if (!spec.sizeCm) {
      for (const [re, cm] of SIZE_WORDS) {
        const mm = re.exec(s.replace(AMOUNT_PHRASES, " "));
        if (mm) { spec.sizeCm = cm; spec.sizeWord = true; s = s.replace(mm[0], " "); break; }
      }
    }
    s = s.replace(/\b(?:sized?|size|style|styled|version)\b/g, " ");

    // ink / color
    if (/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black(?:work)? ink|in black|all black|black)\b/.test(s) && !/\bblack (?:cat|panther|widow|rose|wolf|crow|raven|bird|heart|snake|dragon)\b/.test(s)) {
      spec.ink = "black"; s = s.replace(/\b(?:black and gr[ae]y|black ?& ?gr[ae]y|black ink|in black|all black)\b/, " ");
    }
    if (/\b(?:stencil|outline only|just the outline|line ?art only)\b/.test(s)) { spec.ink = "stencil"; s = s.replace(/\b(?:stencil|outline only|just the outline|line ?art only)\b/, " "); }
    if (/\b(?:full colou?r|in colou?r|colou?rful|multicolou?r(?:ed)?|rainbow)\b/.test(s)) { spec.ink = "original"; }
    const col = findColor(s);
    if (col && !/\b(?:rose|orange|lime|peach|plum|cherry|olive|gold|amber|wine|coral|lavender|lilac|mint|sage)\b(?=\s*$|\s+(?:on|behind|across))/.test(s.slice(col.index).trim())) {
      spec.ink = "color"; spec.color = col.hex; spec.colorName = col.name;
      // keep the color word in the prompt too ("red rose" is a nice design name), except "in red"/"red ink"
      s = s.replace(/\b(?:in|with)\s+(?=\S+\s*(?:ink)?\b)/, " ").replace(/\bink\b/, " ");
    }

    // age
    if (/\b(?:healed|settled)\b/.test(s)) { spec.age = 0.35; s = s.replace(/\b(?:healed|settled)\b/, " "); }
    else if (/\b(?:old|faded|aged|vintage|worn)\b(?=.*\b(?:look|looking|style)?\b)/.test(s) && /\b(?:looking|look|that looks|faded|worn)\b/.test(s)) { spec.age = 0.75; s = s.replace(/\b(?:old|faded|aged|worn)(?:[- ]looking)?\b/, " "); }

    // rotation hints
    const rot = /\b(?:rotated|tilted|turned|at an angle of|angled)\s+(-?\d+)\s*(?:degrees)?/.exec(s);
    if (rot) { spec.rotation = parseInt(rot[1], 10); s = s.replace(rot[0], " "); }
    else if (/\bupside[- ]down\b/.test(s)) { spec.rotation = 180; s = s.replace(/\bupside[- ]down\b/, " "); }
    else if (/\bsideways\b/.test(s)) { spec.rotation = 90; s = s.replace(/\bsideways\b/, " "); }

    // strip command words → what remains is the design prompt
    s = s.replace(PLACE_VERB, " ");
    s = s.replace(/^\s*(?:(?:can|could|would|will) you|please|i (?:want|need|would like|'d like)|let's|how about|what about)\s+/, " ");
    s = s.replace(/\b(?:(?:can|could|would|will) you|please|i want|i'd like|i would like|i need|let's|lets|get me|give me|show me|make me|for me|me|put|place|add|ink|draw|create|design|generate|tattoo(?:ed)?|tattoos|design|piece|image|picture|drawing|one|some|something like|something|anything|whatever|kind of|sort of|type of|style of|maybe|really|very|nice|cool|pretty|cute|beautiful|awesome|on|onto|to|at|in|of|there|here|it|that|this|my|the|with|for|please|real|thing|just|also|too|as well|now|then|ok|okay|go|do|get|have|and|stick|slap|write|lettering|text|word|words|says?|saying|reading|spell)\b/g, " ");
    s = s.replace(/\b(?:a|an)\b/g, " ").replace(/[^a-z0-9'&\- ]/g, " ").replace(/\s+/g, " ").trim();
    if (spec.ink === "color" && spec.colorName && !new RegExp(`\\b${escapeRe(spec.colorName)}\\b`).test(s) && s) s = `${spec.colorName} ${s}`;
    if (/^(?:same|same design|that|it|same one|one|another)$/.test(s)) s = "";
    spec.prompt = s;
    spec.landmark = landmark;

    // "in watercolor style" → keep in prompt (the generator reads styles from the prompt), but remember styleId too
    const st = findStyle(s);
    if (st) spec.styleId = st.id;
    return spec;
  }

  function findStyle(text) {
    if (!text) return null;
    const list = styles();
    let best = null, bestLen = 0;
    for (const st of list) {
      const names = [st.id, st.name, ...(st.aliases || [])].filter(Boolean).map((n) => String(n).toLowerCase().replace(/[_-]+/g, " "));
      for (const n of names) {
        const n2 = n.replace(/\s*style$/, "");
        if (n2.length < 3) continue;
        const re = new RegExp(`\\b${escapeRe(n2).replace(/ /g, "[ -]?")}(?:s)?\\b`);
        if (re.test(text) && n2.length > bestLen) { best = st; bestLen = n2.length; }
      }
    }
    return best;
  }

  function letteringStyle() {
    const list = styles();
    const st = list.find((s) => /letter|script|text|word|calligraph|font/i.test(`${s.id} ${s.name} ${s.category || ""}`) && (s.options || []).some((o) => o.type === "text"))
      || list.find((s) => (s.options || []).some((o) => o.type === "text" && /text|word|name|letter/i.test(o.key + o.label)));
    if (!st) return null;
    const opt = st.options.find((o) => o.type === "text");
    return { style: st, key: opt.key };
  }

  async function placeNew(spec) {
    let design;
    if (spec.lettering) {
      const ls = letteringStyle();
      const word = spec.lettering;
      if (ls) design = await makeDesign({ styleId: ls.style.id, opts: { [ls.key]: word }, prompt: `"${word}" lettering`, name: `“${word}” lettering` });
      else design = await makeDesign({ prompt: `lettering "${word}"`, name: `“${word}” lettering` });
    } else {
      design = await makeDesign({ prompt: spec.prompt, styleId: spec.styleId || undefined });
    }
    const regionId = spec.regionId || defaultRegion();
    const args = { designId: design.id, region: regionId };
    if (spec.sizeCm) args.sizeCm = spec.sizeWord ? sizeForWord(spec.sizeCm, (R().get(regionId) || { r: {} }).r.sizeCm) : spec.sizeCm;
    if (spec.rotation != null) args.rotation = spec.rotation;
    if (spec.ink) args.ink = spec.ink;
    if (spec.color) args.color = spec.color;
    if (spec.landmark) {
      const lm = landmarkMove(spec.landmark.word, R().conceptOf(regionId));
      if (lm && lm.up) args.offsetCm = { right: 0, up: lm.up * (spec.landmark.away ? -1 : 1) * 2.5 };
    }
    const t = await app.placeTattoo(args);
    if (!t || !t.id) throw new Error("placement failed");
    if (spec.age != null) { try { await app.updateTattoo(t.id, { age: spec.age }); } catch {} }
    remember(t);
    const name = lowerName(design.name || spec.prompt || "design");
    const size = t.sizeCm || spec.sizeCm;
    const desc = `${size ? fmtSize(size) + " " : ""}${name} ${onWhere(R().describe(t.region || regionId))}`;
    const follow = spec.guessedRegion
      ? "I put it there for now — tell me another spot if you'd like."
      : pick(["Want it bigger or rotated?", "Want to try a different size or angle?", "How does that look? I can move, resize or recolor it.", "Want it mirrored on the other side too?"], random);
    return { done: desc, kind: "place", follow };
  }

  async function copyTo(t, reg, c) {
    let regionId = reg ? reg.regionId : null;
    if (!regionId) {
      const dup = await app.duplicateTattoo(t.id, { mirror: false });
      remember(dup);
      return { done: `made a copy of your ${tattooName(t)} next to it`, kind: "copy", follow: "Want me to move it somewhere?" };
    }
    const args = { designId: t.designId, region: regionId, sizeCm: t.sizeCm, rotation: t.rotation || 0 };
    if (t.ink && t.ink !== "original") args.ink = t.ink;
    if (t.color) args.color = t.color;
    const len = parseLength(c);
    if (len) args.sizeCm = clamp(len.cm, 1, 60);
    const n = await app.placeTattoo(args);
    remember(n);
    return { done: `added the same ${tattooName(t)} ${onWhere(R().describe(n.region || regionId))}`, kind: "copy", follow: "Want it a different size there?" };
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
    const dup = await app.duplicateTattoo(t.id, { mirror: true });
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
    if (/\b(?:rotate|rotated|rotation|turn|spin|tilt|tilted|angle|angled|twist|upside[- ]down|sideways|straighten|straight|level|upright|clockwise|counter[- ]?clockwise|anti[- ]?clockwise|degrees)\b/.test(c) && !/\bturn (?:it )?(?:red|blue|black|green|into|to)\b/.test(c)) {
      let patch = null, desc = null;
      const deg = /(-?\d+(?:\.\d+)?)\s*(?:degrees)?/.exec(c.replace(/\b\d+(?:\.\d+)?\s*(?:cm|mm|inch(?:es)?|in)\b/g, ""));
      const ccw = /\b(?:counter[- ]?clockwise|anti[- ]?clockwise|ccw|to the left|left)\b/.test(c);
      if (/\b(?:straighten|straight|level|upright|reset (?:the )?(?:rotation|angle)|no rotation|not rotated|untilt)\b/.test(c)) { patch = { rotation: 0 }; desc = "straightened it"; }
      else if (/\bupside[- ]down\b/.test(c)) { patch = { rotateBy: 180 }; desc = "turned it upside down"; }
      else if (/\bsideways\b/.test(c)) { patch = { rotateBy: ccw ? -90 : 90 }; desc = "turned it sideways"; }
      else if (deg && /\b(?:to|at)\s+-?\d/.test(c)) { patch = { rotation: parseFloat(deg[1]) * (ccw ? -1 : 1) }; desc = `set the angle to ${Math.round(parseFloat(deg[1]))}°`; }
      else if (deg) { const d = parseFloat(deg[1]) * (ccw ? -1 : 1); patch = { rotateBy: d }; desc = `rotated it ${Math.abs(Math.round(d))}°${ccw ? " counter-clockwise" : ""}`; relative = true; }
      else { const d = ({ tiny: 5, small: 10, normal: 15, large: 45 })[lvl] * (ccw ? -1 : 1); patch = { rotateBy: d }; desc = `${/tilt/.test(c) ? "tilted" : "rotated"} it ${Math.abs(d)}°${ccw ? " the other way" : ""}`; relative = true; }
      patchFor.push([patch, desc]); kind = kind || "rotate";
    }

    // ---- flip / mirror in place
    if (/\b(?:flip|mirror|reverse|flipped|mirrored)\b/.test(c) && !/\bother\b/.test(c)) {
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
    else if (col && !/\b(?:skin|background)\b/.test(c)) {
      inkPatch = { ink: "color", color: col.hex }; inkDesc = `made it ${col.name.startsWith("#") ? col.name : col.name}`;
    } else if (/\b(?:darker|deeper|bolder|richer|more saturated|stronger|more solid|more opaque|less transparent|more visible)\b/.test(c) && !/\blines?\b/.test(c)) {
      patchFor.push([(t) => ({ opacity: clamp((t.opacity ?? 1) + 0.25, 0.1, 1), age: Math.max(0, (t.age || 0) - 0.25), ...(t.ink === "color" && t.color ? { color: shadeHex(t.color, -0.2) } : {}) }), "made it darker"]);
      kind = kind || "ink"; relative = true;
    } else if (/\b(?:lighter|fainter|softer|subtler|more subtle|more transparent|see[- ]through|less opaque|less visible|paler|translucent)\b/.test(c) && !/\blines?\b/.test(c)) {
      patchFor.push([(t) => ({ opacity: clamp((t.opacity ?? 1) - 0.2, 0.15, 1) }), "made it lighter"]);
      kind = kind || "opacity"; relative = true;
    }
    if (inkPatch) { patchFor.push([inkPatch, inkDesc]); kind = kind || "ink"; }
    if ((m = /\bopacity(?: to| at| of)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?|\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s*opa(?:city|que)\b/.exec(c))) {
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
        // merge scaleBy/rotateBy: compose
        const res = await app.updateTattoo(id, patch);
        if (res && res.id) remember(res);
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
      if (/\b(?:higher|up|upward|upwards|raise|raised|further up)\b/.test(c)) { up += amt; desc.push(`${len ? round1(amt) + " cm " : ""}${/higher/.test(c) ? "higher" : "up"}`); }
      if (/\b(?:lower|down|downward|downwards|further down)\b/.test(c)) { up -= amt; desc.push(`${len ? round1(amt) + " cm " : ""}${/lower/.test(c) ? "lower" : "down"}`); }
      const personal = /\b(?:to|towards?) (?:my|his|her) (left|right)\b|\bmy (left|right)\b/.exec(c);
      if (personal) {
        const which = personal[1] || personal[2];
        const s = personSideSign(t);
        if (s == null) right += (which === "right" ? 1 : -1) * amt;
        else right += (which === "left" ? 1 : -1) * s * amt;
        desc.push(`toward your ${which}`);
      } else if (/\b(?:left|right)\b/.test(c) && /\b(?:move|shift|slide|nudge|bump|push|over|to the|a bit|slightly|little|more|left|right)\b/.test(c)) {
        if (/\bleft\b/.test(c)) { right -= amt; desc.push(`${len ? round1(amt) + " cm " : ""}left`); }
        if (/\bright\b/.test(c)) { right += amt; desc.push(`${len ? round1(amt) + " cm " : ""}right`); }
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
        const subjNoStyle = st ? subj.replace(new RegExp(`\\b${escapeRe(st.name.toLowerCase())}\\b|\\b${escapeRe(String(st.id).replace(/[_-]/g, " "))}\\b|\\bstyle\\b`, "g"), "").trim() : subj;
        if (st && !subjNoStyle) return restyle(ids, st, info);
        const prompt = st ? subj : `${style ? style.name.toLowerCase() + " " : ""}${subj}`;
        const d = await makeDesign({ prompt, styleId: st ? st.id : undefined });
        for (const id of ids) await app.updateTattoo(id, { designId: d.id });
        return { done: `swapped it for a ${String(d.name || subj).toLowerCase()}`, rest: "" };
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
    for (const hint of OPTION_HINTS) {
      const hm = hint.say.exec(c);
      if (!hm) continue;
      let opt = null;
      for (const k of hint.keys) {
        opt = style.options.find((o) => (o.key + " " + o.label).toLowerCase().includes(k) && o.type !== "seed" && o.type !== "text");
        if (opt) break;
      }
      if (!opt) continue;
      const curVal = info.opts && info.opts[opt.key] != null ? info.opts[opt.key] : opt.default;
      let next = curVal, desc = null;
      const inc = /\b(?:more|thicker|bolder|heavier|bigger|larger|wider|increase|add|denser|busier|detailed|complex|intricate|curvier|longer|fatter|stronger|with)\b/.test(c);
      const dec = /\b(?:less|fewer|thinner|finer|lighter|smaller|narrower|decrease|reduce|simpler|simple|cleaner|minimal|delicate|remove|no|without|shorter|weaker|sparser)\b/.test(c);
      const numM = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${hm[0].replace(/s$/, "")}s?)`).exec(c);
      const optName = hm[0].replace(/^(?:linework|line ?work|line weight)$/, "lines");
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
        next = !(dec && !inc) ? (/\b(?:no|without|remove|turn off|less)\b/.test(c) ? false : true) : false;
        if (next === !!curVal) continue;
        desc = `${next ? "added" : "removed"} ${optName}`;
      } else if (opt.type === "select" && opt.choices && opt.choices.length) {
        const byLabel = opt.choices.find((ch) => new RegExp(`\\b${escapeRe(String(ch.label || ch.value).toLowerCase())}\\b`).test(c));
        if (byLabel) next = byLabel.value;
        else {
          const i = opt.choices.findIndex((ch) => ch.value === curVal);
          next = opt.choices[clamp(i + (dec ? -1 : 1), 0, opt.choices.length - 1)].value;
        }
        if (next === curVal) continue;
        desc = `changed the ${optName}`;
      } else continue;
      const opts = { ...(info.opts || {}), [opt.key]: next };
      const d = await regen(info, opts);
      for (const id of ids) await app.updateTattoo(id, { designId: d.id });
      const rest = c.replace(hm[0], " ").replace(/\b(?:more|less|fewer|thinner|thicker|bolder|finer|simpler|make|the|it)\b/g, " ");
      return { done: desc, relative: true, rest: /\b(?:bigger|smaller|red|blue|black|higher|lower|rotate)\b/.test(rest) ? rest : "", follow: "Better?" };
    }
    return null;
  }

  async function regen(info, opts) {
    const styleId = info.style;
    const d = await makeDesign({ styleId: styleId || undefined, opts, prompt: styleId ? undefined : info.prompt || info.name, name: info.name && info.name !== "tattoo" ? info.name : undefined });
    const entry = ctx.designs.get(d.id);
    if (entry) { entry.opts = { ...(entry.opts || {}), ...opts }; entry.prompt = info.prompt || entry.prompt; }
    return d;
  }

  async function restyle(ids, st, info) {
    const subject = (info.prompt || info.name || "").replace(new RegExp(`\\b(?:${styles().map((s) => escapeRe(s.name.toLowerCase())).join("|")})\\b`, "g"), "").replace(/\s+/g, " ").trim();
    const prompt = `${st.name.toLowerCase()} ${subject}`.trim();
    const d = await makeDesign({ styleId: st.id, prompt });
    for (const id of ids) await app.updateTattoo(id, { designId: d.id });
    return { done: `redid it in ${st.name.toLowerCase()} style`, rest: "", follow: "What do you think?" };
  }

  return {
    handle,
    context: ctx,
    reset() { ctx.currentId = null; ctx.pending = null; ctx.lastRelative = null; },
  };
}
