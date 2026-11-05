/* The course: language-neutral concept units (English + Hebrew) + a language pack or live translation. */
import { UNITS as UA, READINGS as RA } from "./content/concepts-a.js";
import { UNITS as UB, READINGS as RB } from "./content/concepts-b.js";
import { hasPack, isBase, lang as langInfo } from "./langs.js";
import { store } from "./store.js";
import { translateMany, setDictionary } from "./translate.js";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const UNITS = [...UA, ...UB];
export const READINGS = [...RA, ...RB];
export const unitById = (id) => UNITS.find((u) => u.id === id);
export const unitsOf = (level) => UNITS.filter((u) => u.level === level);
export const readingsOf = (level) => READINGS.filter((r) => r.level === level);
export const readingById = (id) => READINGS.find((r) => r.id === id);
export const unitIndex = (id) => UNITS.findIndex((u) => u.id === id);

/* id → concept { id, en, he, kind, unit, pos } */
export const CONCEPTS = new Map();
for (const u of UNITS) {
  for (const v of u.vocab) CONCEPTS.set(v.id, { ...v, kind: "word", unit: u.id });
  for (const p of u.phrases) CONCEPTS.set(p.id, { ...p, kind: "phrase", unit: u.id });
  for (const s of u.sentences) CONCEPTS.set(s.id, { ...s, kind: "sentence", unit: u.id });
  for (const l of u.dialogue.lines) CONCEPTS.set(l.id, { ...l, kind: "line", unit: u.id });
  CONCEPTS.set(u.model.id, { ...u.model, kind: "model", unit: u.id });
}
for (const r of READINGS) CONCEPTS.set(r.id, { id: r.id, en: r.text.en, he: r.text.he, kind: "reading", unit: null });

/* All ids that belong to a unit (for translation / progress) */
export function unitIds(u) {
  return [...u.vocab.map((v) => v.id), ...u.phrases.map((p) => p.id), ...u.sentences.map((s) => s.id), ...u.dialogue.lines.map((l) => l.id), u.model.id];
}

const packCache = {};
export async function loadPack(code) {
  if (!hasPack(code)) return null;
  if (!packCache[code]) packCache[code] = import(`./content/${code}.js`).then((m) => m.default).catch((e) => { console.warn("pack failed", code, e); packCache[code] = null; return null; });
  return packCache[code];
}

export class Course {
  constructor(code, base) {
    this.code = code; this.base = base === "he" ? "he" : "en";
    this.info = langInfo(code);
    this.pack = null;
    this.kind = hasPack(code) ? "pack" : isBase(code) ? "base" : "auto";
    this.dir = this.info.dir;
  }
  async load() {
    if (this.kind === "pack") { this.pack = await loadPack(this.code); if (!this.pack) this.kind = "auto"; }
    if (this.pack?.dir) this.dir = this.pack.dir;
    const entries = [];
    for (const u of UNITS) for (const v of u.vocab) { const t = this.text(v.id); if (t) entries.push([v[this.base], t]); }
    for (const u of UNITS) for (const p of u.phrases) { const t = this.text(p.id); if (t) entries.push([p[this.base], t]); }
    setDictionary({ base: this.base, target: this.code, entries });
    return this;
  }
  get name() { return this.pack?.name || this.info.native; }
  get ttsPrefs() { return this.pack?.tts || [this.info.tts]; }
  get stt() { return this.pack?.stt || this.info.tts; }
  get articles() { return this.pack?.articles || []; }
  get isMT() { return this.kind === "auto"; }
  /* target-language text for a concept id */
  text(id) {
    if (this.kind === "pack") return this.pack.t[id] || "";
    if (this.kind === "base") return CONCEPTS.get(id)?.[this.code] || "";
    return store.autoT(this.code)[id] || "";
  }
  /* learner's-language text for a concept id */
  baseText(id) { return CONCEPTS.get(id)?.[this.base] || ""; }
  note(id) { return this.pack?.notes?.[id] || null; }
  names(unitId) { return this.pack?.names?.[unitId] || unitById(unitId)?.dialogue.roles || {}; }
  grammar(unitId) { return this.pack?.grammar?.[unitId] || []; }
  get verbs() { return this.pack?.verbs || {}; }
  get tenses() { return this.pack?.tenses || {}; }
  get pronouns() { return this.pack?.pronouns || []; }
  get alphabet() { return this.pack?.alphabet || []; }
  get tips() { return this.pack?.tips || []; }
  /* does the unit have all its text available? */
  unitReady(u) { return unitIds(u).every((id) => this.text(id)); }
  readingReady(r) { return !!this.text(r.id); }
  /* For auto courses: translate what is missing, caching per language. */
  async ensureIds(ids, onProgress) {
    if (this.kind !== "auto") return true;
    const missing = {};
    for (const id of ids) if (!this.text(id)) { const c = CONCEPTS.get(id); if (c) missing[id] = c.en; }
    if (!Object.keys(missing).length) return true;
    const got = await translateMany(missing, "en", this.code, onProgress);
    store.setAutoT(this.code, got);
    return Object.keys(missing).every((id) => got[id]);
  }
  ensureUnit(u, onProgress) { return this.ensureIds(unitIds(u), onProgress); }
  ensureReading(r, onProgress) { return this.ensureIds([r.id], onProgress); }
  /* Vocabulary pool for distractors: same unit first, then same part of speech anywhere already translated */
  distractors(item, n, unit) {
    const same = unit.vocab.filter((v) => v.id !== item.id && this.text(v.id) && this.text(v.id) !== this.text(item.id));
    const pool = same.filter((v) => v.pos === item.pos);
    const out = [];
    for (const src of [pool, same, UNITS.flatMap((x) => x.vocab).filter((v) => v.unit !== unit.id && v.pos === item.pos && this.text(v.id))]) {
      for (const v of shuffleArr(src)) { if (out.length >= n) break; if (!out.some((o) => o.id === v.id) && v.id !== item.id && this.baseText(v.id) !== this.baseText(item.id)) out.push(v); }
      if (out.length >= n) break;
    }
    return out.slice(0, n);
  }
}
function shuffleArr(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/* Which units a learner at a given starting level should treat as already known */
export function startIndex(startLevel) { const i = UNITS.findIndex((u) => u.level === startLevel); return i < 0 ? 0 : i; }
export function nextUnit(code) {
  const L = store.lang(code);
  const from = startIndex(L.start);
  return UNITS.slice(from).find((u) => !store.unitDone(code, u.id)) || UNITS.find((u) => !store.unitDone(code, u.id)) || null;
}
export function unitUnlocked(code, u) {
  const i = unitIndex(u.id); const L = store.lang(code);
  if (i <= startIndex(L.start)) return true;
  return store.unitDone(code, UNITS[i - 1].id) || store.unitDone(code, u.id);
}
/* estimate CEFR level from completed units */
export function estimatedLevel(code) {
  const L = store.lang(code);
  let best = LEVELS.indexOf(L.start);
  for (const lvl of LEVELS) { const us = unitsOf(lvl); if (us.length && us.filter((u) => store.unitDone(code, u.id)).length >= Math.ceil(us.length / 2)) best = Math.max(best, LEVELS.indexOf(lvl) + (us.every((u) => store.unitDone(code, u.id)) ? 1 : 0)); }
  return LEVELS[Math.min(best, LEVELS.length - 1)];
}
