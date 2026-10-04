// Body-part resolver: maps everyday phrases ("my left arm", "behind my right ear",
// "back of my neck", "ribs") onto whatever region ids app.listRegions() exposes.
// It works from region ids, labels and aliases, so it does not depend on one exact
// naming scheme (left_forearm_inner, chest_l, behind_ear_r … all work).

// Concepts, most specific first. `say` = what users type, `has` = how a region's
// id/label/aliases reveal that it belongs to the concept.
// `mods` = default modifiers when the user names no inner/outer/front/back.
// `fallback` = concepts to try if the body has no region for this one.
export const CONCEPTS = [
  { key: "behind_ear", say: /\b(?:behind|back of)\s+(?:my\s+|the\s+|his\s+|her\s+)?(?:(?:left|right)\s+)?ears?\b|\bears?\b/, has: /\bear/, fallback: ["neck_back", "neck"] },
  { key: "neck_back", say: /\b(?:back of (?:my |the |his |her )?neck|nape(?: of (?:my |the )?neck)?|neck back)\b/, has: /\bnape|neck.*\b(?:back|rear)|\b(?:back|rear).*neck/, fallback: ["neck", "upper_back"] },
  { key: "throat", say: /\b(?:throat|front of (?:my |the )?neck)\b/, has: /\bthroat|neck.*front|front.*neck/, fallback: ["neck"] },
  { key: "neck", say: /\bneck\b/, has: /\bneck|nape|throat/, fallback: ["neck_back", "upper_back"] },
  { key: "collarbone", say: /\b(?:collar ?bones?|clavicles?)\b/, has: /collar|clavic/, fallback: ["chest"] },
  { key: "shoulder_blade", say: /\b(?:shoulder ?blades?|scapulae?|scapulas)\b/, has: /blade|scapul/, fallback: ["upper_back"] },
  { key: "shoulder", say: /\b(?:shoulders?|deltoids?|delts?)\b/, has: /shoulder|deltoid|\bdelt/, not: /blade|scapul/, fallback: ["upper_arm"] },
  { key: "upper_arm", say: /\b(?:upper arms?|biceps?|triceps?|guns)\b/, has: /upper.?arm|bicep|tricep/, fallback: ["shoulder", "forearm"] },
  { key: "elbow", say: /\b(?:elbows?|elbow ditch|ditch)\b/, has: /elbow|ditch/, fallback: ["forearm", "upper_arm"] },
  { key: "wrist", say: /\bwrists?\b/, has: /wrist/, mods: ["inner"], fallback: ["forearm"] },
  { key: "finger", say: /\b(?:(?:ring|index|middle|pinky|little|pointer) )?(?:fingers?|knuckles?)\b/, has: /finger|knuckle/, fallback: ["hand"] },
  { key: "thumb", say: /\bthumbs?\b/, has: /thumb/, fallback: ["finger", "hand"] },
  { key: "palm", say: /\bpalms?\b/, has: /palm/, fallback: ["hand"] },
  { key: "hand", say: /\bhands?\b/, has: /hand|finger|knuckle|palm|thumb/, mods: ["back"], fallback: ["wrist", "forearm"] },
  { key: "forearm", say: /\b(?:forearms?|lower arms?|arms?|sleeve)\b/, has: /forearm|lower.?arm/, mods: ["inner"], fallback: ["upper_arm", "wrist"] },
  { key: "sternum", say: /\b(?:sternum|breast ?bone|under ?boob|under ?bust|between (?:my |her |the )?(?:breasts|boobs|pecs))\b/, has: /sternum|underbust|under.?bust|breast.?bone/, fallback: ["chest", "stomach"] },
  { key: "chest", say: /\b(?:chest|pecs?|pectorals?|breasts?|boobs?|heart)\b/, has: /chest|\bpec|breast/, not: /sternum|underbust|bone/, fallback: ["sternum", "collarbone"] },
  { key: "stomach", say: /\b(?:stomach|belly|tummy|abs|abdomen|abdominals?|navel|belly button|midriff|torso)\b/, has: /stomach|belly|abdom|\babs\b|navel|tummy/, fallback: ["ribs", "chest"] },
  { key: "ribs", say: /\b(?:ribs?|rib ?cage|ribcage|flanks?|side of (?:my |the |his |her )?(?:torso|body|chest|stomach)|my side)\b/, has: /\brib|flank|\bside\b/, fallback: ["stomach", "chest"] },
  { key: "hip", say: /\b(?:hips?|pelvis|pelvic|hip ?bones?)\b/, has: /\bhip|pelvi/, fallback: ["thigh", "stomach"] },
  { key: "glute", say: /\b(?:butt|bum|glutes?|buttocks?|ass|booty)\b/, has: /glute|butt|buttock/, fallback: ["hip", "thigh"] },
  { key: "lower_back", say: /\b(?:lower back|small of (?:my |the )?back|tramp stamp|lumbar)\b/, has: /lower.?back|lumbar/, fallback: ["upper_back"] },
  { key: "spine", say: /\b(?:spine|spinal|along (?:my |the )?back|down (?:my |the )?back)\b/, has: /spine|spinal/, fallback: ["upper_back"] },
  { key: "upper_back", say: /\b(?:upper back|full back|whole back|back piece|backpiece|between (?:my |the )?shoulders|back)\b/, has: /upper.?back|\bback\b/, not: /lower|neck|nape|hand|thigh|calf|leg|knee|arm|ear|shoulder.?blade/, fallback: ["shoulder_blade", "spine"] },
  { key: "thigh", say: /\b(?:thighs?|quads?|upper legs?|legs?)\b/, has: /thigh|upper.?leg|quad/, mods: ["front"], fallback: ["calf"] },
  { key: "knee", say: /\b(?:knees?|kneecaps?)\b/, has: /knee/, fallback: ["thigh", "calf"] },
  { key: "calf", say: /\b(?:calf|calves|shins?|lower legs?)\b/, has: /calf|calves|shin|lower.?leg/, fallback: ["thigh"] },
  { key: "ankle", say: /\bankles?\b/, has: /ankle/, fallback: ["calf", "foot"] },
  { key: "foot", say: /\b(?:foot|feet|toes?|instep)\b/, has: /foot|feet|toe|instep/, fallback: ["ankle", "calf"] },
  { key: "head", say: /\b(?:head|scalp|skull|temple)\b/, has: /head|scalp|temple/, fallback: ["neck_back"] },
  { key: "face", say: /\b(?:face|cheek|forehead|jaw)\b/, has: /face|cheek|forehead|jaw/, fallback: ["neck"] },
];
const CONCEPT_BY_KEY = Object.fromEntries(CONCEPTS.map((c) => [c.key, c]));

// Per-concept phrases that only change which variant ("inner" etc.) is preferred.
const SAY_MODS = [
  ["inner", /\b(?:inner|inside|underside|under side|soft side)\b/],
  ["outer", /\b(?:outer|outside|top of)\b/],
  ["front", /\b(?:front|front of)\b/],
  ["back", /\b(?:back of|rear of|behind)\b/],
  ["upper", /\b(?:upper|top)\b/],
  ["lower", /\b(?:lower|bottom)\b/],
  ["side", /\b(?:side of|side)\b/],
];
const OPPOSITE = { inner: "outer", outer: "inner", front: "back", back: "front", upper: "lower", lower: "upper", side: "_" };
// Word that suggests a modifier, per concept: "arm" alone = outer forearm, "bicep" = inner upper arm.
const WORD_MODS = [
  [/\barms?\b|\bsleeve\b/, "forearm", ["outer"]],
  [/\bbiceps?\b/, "upper_arm", ["inner", "front"]],
  [/\btriceps?\b/, "upper_arm", ["outer", "back"]],
  [/\bshins?\b/, "calf", ["front"]],
  [/\bcalf|calves\b/, "calf", ["back"]],

  [/\bheart\b/, "chest", []],
];

function words(s) {
  return String(s || "").toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();
}

function regionSide(r) {
  if (r.side === "left" || r.side === "right" || r.side === "center") return r.side;
  const t = " " + words(r.id) + " ";
  if (/ (?:left|l|lt) /.test(t)) return "left";
  if (/ (?:right|r|rt) /.test(t)) return "right";
  const l = " " + words(r.label) + " ";
  if (/ left /.test(l)) return "left";
  if (/ right /.test(l)) return "right";
  return "center";
}

function regionMods(text) {
  const out = new Set();
  if (/\binner|inside|palm|underside/.test(text)) out.add("inner");
  if (/\bouter|outside/.test(text)) out.add("outer");
  if (/\bfront|anterior|shin\b|throat/.test(text)) out.add("front");
  if (/\bback\b|\brear|posterior|nape|behind/.test(text)) out.add("back");
  if (/\bupper|\btop\b/.test(text)) out.add("upper");
  if (/\blower|bottom/.test(text)) out.add("lower");
  if (/\bside\b/.test(text)) out.add("side");
  return out;
}

export class RegionResolver {
  constructor(regionList) {
    this.setRegions(regionList);
  }

  setRegions(list) {
    this.list = (list || []).filter((r) => r && r.id);
    this.byId = new Map();
    this.info = this.list.map((r) => {
      const text = words([r.id, r.label, ...(r.aliases || []), r.group || ""].join(" "));
      const textNoGroup = words([r.id, r.label, ...(r.aliases || [])].join(" "));
      const side = regionSide(r);
      const core = words([r.id, r.label].join(" "));
      const conceptsOf = (t) => CONCEPTS.filter((c) => c.has.test(t) && !(c.not && c.not.test(t))).map((c) => c.key);
      let concepts = conceptsOf(core);
      if (!concepts.length) concepts = conceptsOf(textNoGroup);
      const phrases = [r.label, ...(r.aliases || [])].filter(Boolean).map((p) => words(p)).filter((p) => p.length > 2);
      const base = words(textNoGroup.replace(/\b(?:left|right|l|r|lt|rt)\b/g, " "));
      const info = { r, id: r.id, side, text, concepts, phrases, mods: regionMods(core.replace(/\b(?:left|right)\b/g, "")), base };
      this.byId.set(r.id, info);
      return info;
    });
  }

  get(id) { return this.byId.get(id) || null; }
  has(id) { return this.byId.has(id); }

  /** "your left inner forearm" style phrase for replies. */
  describe(id, { possessive = true } = {}) {
    const info = this.get(id);
    if (!info) return possessive ? "your skin" : String(id || "").replace(/_/g, " ");
    let label = (info.r.label || info.id.replace(/_/g, " ")).trim();
    label = label.charAt(0).toLowerCase() + label.slice(1);
    label = label.replace(/\s*\((left|right|l|r)\)\s*$/i, (_, s) => "").trim();
    if ((info.side === "left" || info.side === "right") && !/\b(left|right)\b/i.test(label)) label = `${info.side} ${label}`;
    if (!possessive) return label;
    if (/^(the |your |my )/.test(label)) return label.replace(/^my /, "your ");
    return /^(behind|back of|between|under|side of|nape)/.test(label) ? label.replace(/\b(the|my) /, "your ").replace(/^(behind|back of|between|under|side of)\s+(?!your)/, "$1 your ") : `your ${label}`;
  }

  /** Same region on the other side of the body (or null). */
  mirrorOf(id) {
    const info = this.get(id);
    if (!info || info.side === "center") return null;
    const want = info.side === "left" ? "right" : "left";
    let best = null, bestScore = -1;
    for (const o of this.info) {
      if (o.side !== want) continue;
      const score = o.base === info.base ? 100 : overlap(o.base, info.base);
      if (score > bestScore) { best = o; bestScore = score; }
    }
    return best && bestScore > 0 ? best.id : null;
  }

  conceptOf(id) {
    const info = this.get(id);
    return info && info.concepts[0] || null;
  }

  /**
   * Find a body part in free text.
   * @returns {null | {regionId, concept, side, sideExplicit, start, end, text, mods}}
   * `start/end` = span to strip from the text (includes "on my", "behind the" …).
   */
  find(text, { defaultSide = "left", otherSideOf = null } = {}) {
    const t = text.toLowerCase();
    let best = null;
    const coreLen = (p) => p.replace(/\b(?:left|right|l|r)\b/g, "").replace(/\s+/g, " ").trim().length;

    // 1) Exact label / alias phrases (longest wins; ties kept) — honours the body module's own aliases.
    for (const info of this.info) {
      for (const p of info.phrases) {
        const re = new RegExp(`\\b${escapeRe(p)}\\b`);
        const m = re.exec(t);
        if (!m) continue;
        const len = coreLen(p);
        if (!best || len > best.len || (len === best.len && p.length > best.matchLen)) best = { len, info, index: m.index, matchLen: p.length, ties: [info] };
        else if (best && len === best.len && p.length === best.matchLen && !best.ties.includes(info)) best.ties.push(info);
      }
    }

    // 2) Concepts (ordered from specific to generic). First concept that appears wins,
    //    unless an alias match is longer.
    let conceptHit = null;
    for (const c of CONCEPTS) {
      const m = c.say.exec(t);
      if (m) { conceptHit = { c, index: m.index, len: m[0].length, word: m[0] }; break; }
    }

    let concept = null, spanStart, spanEnd;
    // An alias wins when it is more specific than the concept word; on a tie, only if it
    // agrees with the concept (e.g. "forearm" alias on both forearm regions → let scoring pick).
    let aliasCands = null;
    if (best && conceptHit && best.len === conceptHit.len) {
      const agree = best.ties.filter((i) => i.concepts.includes(conceptHit.c.key));
      if (agree.length) aliasCands = agree; else best = null;
    } else if (best && conceptHit && best.len < conceptHit.len) best = null;
    else if (best) aliasCands = best.ties;
    if (best) {
      concept = conceptHit && best.len === conceptHit.len ? conceptHit.c.key : best.info.concepts[0] || null;
      spanStart = best.index; spanEnd = best.index + best.matchLen;
    } else if (conceptHit) {
      concept = conceptHit.c.key;
      spanStart = conceptHit.index; spanEnd = conceptHit.index + conceptHit.len;
    } else {
      return null;
    }

    // Expand span left over modifiers / side / possessive / preposition, and right over "on the left side".
    const pre = t.slice(0, spanStart);
    const preRe = /(?:\b(?:on|onto|to|at|behind|across|along|over|around|in|into|under|underneath|below|above|near|down|up|from|for)\s+)?(?:\b(?:my|the|his|her|your|our|their|a|one)\s+)?(?:\b(?:other|same|opposite)\s+)?(?:\b(?:left|right)\s+)?(?:\b(?:inner|outer|inside|outside|upper|lower|front|back|top|bottom|middle|center|centre|side|soft|underside)\s+(?:of\s+)?(?:(?:my|the|his|her)\s+)?)*(?:\b(?:left|right)\s+)?$/;
    const pm = preRe.exec(pre);
    if (pm && pm[0].length) spanStart -= pm[0].length;
    const post = t.slice(spanEnd);
    const postRe = /^(?:\s+(?:on|of)\s+(?:the|my)\s+(left|right)(?:\s+side)?|\s+\((left|right)\)|\s+(left|right)\b(?!\s*(?:\d|by|a bit|slightly)))/;
    const qm = postRe.exec(post);
    if (qm) spanEnd += qm[0].length;
    const span = t.slice(spanStart, spanEnd);

    // Side
    let side = null, sideExplicit = false;
    const sm = /\b(left|right)\b/.exec(span);
    if (sm) { side = sm[1]; sideExplicit = true; }
    if (/\b(?:other|opposite)\b/.test(span) && otherSideOf) { side = otherSideOf === "left" ? "right" : "left"; sideExplicit = true; }
    if (!side && /\bheart\b/.test(span)) { side = "left"; sideExplicit = true; }

    // Modifiers the user asked for
    const mods = new Set();
    for (const [k, re] of SAY_MODS) if (re.test(span.replace(/\b(?:left|right)\b/g, ""))) mods.add(k);
    if (concept === "neck_back" || concept === "behind_ear") mods.delete("back");
    if (concept === "lower_back") mods.delete("lower");
    if (concept === "upper_back") { mods.delete("upper"); mods.delete("back"); }
    const conceptObj = CONCEPT_BY_KEY[concept];
    let softMods = conceptObj && conceptObj.mods ? conceptObj.mods.slice() : [];
    for (const [re, key, ms] of WORD_MODS) if (key === concept && re.test(span)) softMods = ms;

    // Alias hit on a specific region: honour it unless the user named the other side.
    let regionId = null;
    if (best && aliasCands) {
      let cands = aliasCands.map((info) => (side && info.side !== "center" && info.side !== side ? this.get(this.mirrorOf(info.id)) || info : info));
      cands = [...new Set(cands)];
      if (cands.length === 1) regionId = cands[0].id;
      else regionId = this.pick(concept, { side: side || defaultSide, sideExplicit: !!side, mods, softMods, only: cands });
    }
    if (!regionId) regionId = this.pick(concept, { side: side || defaultSide, sideExplicit, mods, softMods });
    if (!regionId) return null;
    const chosen = this.get(regionId);
    return {
      regionId, concept, side: chosen.side, sideExplicit, start: spanStart, end: spanEnd,
      text: span.trim(), mods: [...mods],
    };
  }

  /** Best region for a concept (following fallbacks), side and modifiers. */
  pick(concept, { side = "left", sideExplicit = false, mods = new Set(), softMods = [], only = null } = {}, seen = new Set()) {
    if (only) seen.add("__only");
    if (!only && (!concept || seen.has(concept))) return null;
    if (concept) seen.add(concept);
    const cands = only || this.info.filter((i) => i.concepts.includes(concept));
    if (!cands.length) {
      const c = CONCEPT_BY_KEY[concept];
      for (const f of (c && c.fallback) || []) {
        const id = this.pick(f, { side, sideExplicit, mods, softMods: [] }, seen);
        if (id) return id;
      }
      return null;
    }
    let best = null, bestScore = -Infinity;
    for (const i of cands) {
      let s = 0;
      // primary concept match beats secondary
      s += i.concepts[0] === concept ? 2 : 0;
      if (i.side === side) s += sideExplicit ? 20 : 3;
      else if (i.side === "center") s += sideExplicit ? 1 : 2;
      else s -= sideExplicit ? 20 : 0;
      for (const m of mods) {
        if (i.mods.has(m)) s += 6;
        if (i.mods.has(OPPOSITE[m])) s -= 5;
      }
      for (const m of softMods) {
        if (mods.has(OPPOSITE[m])) continue;
        if (i.mods.has(m)) s += 1.5;
      }
      // fewer extra qualifiers = more "default" region
      s -= i.mods.size * 0.1;
      if (s > bestScore) { best = i; bestScore = s; }
    }
    return best ? best.id : null;
  }

  /** Regions roughly matching a phrase (used for "the one on my chest"). */
  matchesConcept(regionId, concept) {
    const i = this.get(regionId);
    return !!i && i.concepts.includes(concept);
  }
}

function overlap(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  let n = 0;
  for (const w of b.split(" ")) if (A.has(w)) n++;
  return n;
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
