/* Progress, settings and per-language state, kept in localStorage. */
import { newCard, schedule, isDue, isMastered } from "./srs.js";

const KEY = "linguapath.v1";
const DEFAULTS = {
  settings: {
    ui: "en", known: "en", theme: "auto", rate: 1, autoAudio: true, sfx: true, goalMin: 15,
    typing: true, speaking: true, provider: "auto", libreUrl: "", libreKey: "", deeplKey: "", aiKey: "",
    onboarded: false, voices: {}, trAuto: true, bestStreak: 0,
  },
  current: null,
  langs: {},        // code -> language state
  days: {},         // "YYYY-MM-DD" -> { sec, xp }
  trHistory: [],
};
const LANG_DEFAULTS = () => ({ start: "A1", unitsDone: {}, unitProgress: {}, cards: {}, xp: 0, phrasebook: [], autoT: {}, readDone: {}, seen: {} });

let state;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || "null");
  state = raw ? { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } } : structuredClone(DEFAULTS);
} catch { state = structuredClone(DEFAULTS); }

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or private mode */ } }, 50);
}

export const store = {
  get s() { return state; },
  save,
  setting(k, v) { if (v === undefined) return state.settings[k]; state.settings[k] = v; save(); return v; },
  /* languages */
  get current() { return state.current; },
  setCurrent(code) { state.current = code; this.lang(code); save(); },
  lang(code = state.current) {
    if (!code) return null;
    if (!state.langs[code]) state.langs[code] = LANG_DEFAULTS();
    const L = state.langs[code];
    for (const [k, v] of Object.entries(LANG_DEFAULTS())) if (L[k] === undefined) L[k] = v;
    return L;
  },
  myLangs() { return Object.keys(state.langs); },
  removeLang(code) { delete state.langs[code]; if (state.current === code) state.current = this.myLangs()[0] || null; save(); },
  /* units */
  unitDone(code, id) { return !!this.lang(code).unitsDone[id]; },
  markUnit(code, id) { this.lang(code).unitsDone[id] = Date.now(); save(); },
  unitProg(code, id) { return this.lang(code).unitProgress[id] || {}; },
  setUnitProg(code, id, part, val = 1) {
    const L = this.lang(code); L.unitProgress[id] = L.unitProgress[id] || {};
    L.unitProgress[id][part] = Math.max(L.unitProgress[id][part] || 0, val); save();
  },
  /* spaced repetition cards */
  card(code, id) { return this.lang(code).cards[id]; },
  addCard(code, id, data) {
    const L = this.lang(code);
    if (!L.cards[id]) { L.cards[id] = newCard(data); save(); return true; }
    return false;
  },
  grade(code, id, g) {
    const L = this.lang(code);
    if (!L.cards[id]) L.cards[id] = newCard();
    L.cards[id] = schedule(L.cards[id], g); save();
  },
  dueCards(code, now = Date.now()) { return Object.entries(this.lang(code).cards).filter(([, c]) => isDue(c, now)).map(([id, c]) => ({ id, ...c })); },
  cardStats(code) {
    const cards = Object.values(this.lang(code).cards);
    return { total: cards.length, learned: cards.filter((c) => c.n > 0).length, mastered: cards.filter(isMastered).length, due: cards.filter((c) => isDue(c)).length };
  },
  /* phrasebook (from translator) */
  addPhrase(code, t, b) {
    const L = this.lang(code);
    if (L.phrasebook.some((p) => p.t === t)) return false;
    const id = `pb.${Date.now().toString(36)}`;
    L.phrasebook.push({ id, t, b, at: Date.now() });
    L.cards[id] = newCard({ t, b });
    save(); return true;
  },
  removePhrase(code, id) { const L = this.lang(code); L.phrasebook = L.phrasebook.filter((p) => p.id !== id); delete L.cards[id]; save(); },
  /* auto-course translation cache */
  autoT(code) { return this.lang(code).autoT; },
  setAutoT(code, map) { Object.assign(this.lang(code).autoT, map); save(); },
  /* time & xp */
  addSeconds(sec) { const d = (state.days[today()] ||= { sec: 0, xp: 0 }); d.sec += sec; save(); },
  addXP(n, code = state.current) {
    const d = (state.days[today()] ||= { sec: 0, xp: 0 }); d.xp += n;
    if (code) this.lang(code).xp += n;
    save();
  },
  todaySec() { return state.days[today()]?.sec || 0; },
  streak() {
    let n = 0; const d = new Date();
    if (!state.days[today(d)]?.sec) d.setDate(d.getDate() - 1);     // today not yet counted
    while (state.days[today(d)]?.sec > 0) { n++; d.setDate(d.getDate() - 1); }
    if (n > (state.settings.bestStreak || 0)) { state.settings.bestStreak = n; save(); }
    return n;
  },
  lastDays(n = 14) {
    const out = []; const d = new Date();
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push({ day: today(x), dow: x.getDay(), ...(state.days[today(x)] || { sec: 0, xp: 0 }) }); }
    return out;
  },
  totalSec() { return Object.values(state.days).reduce((a, b) => a + (b.sec || 0), 0); },
  /* translator history */
  pushHistory(h) { state.trHistory = [h, ...state.trHistory.filter((x) => !(x.src === h.src && x.to === h.to))].slice(0, 60); save(); },
  clearHistory() { state.trHistory = []; save(); },
  /* backup */
  exportJSON() { return JSON.stringify(state, null, 1); },
  importJSON(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || !raw.settings) throw new Error("not a LinguaPath backup");
    state = { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...raw.settings } };
    localStorage.setItem(KEY, JSON.stringify(state));
  },
  reset() { localStorage.removeItem(KEY); state = structuredClone(DEFAULTS); },
};

/* practice-time ticker: counts seconds while the tab is visible */
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  if (document.visibilityState === "visible" && now - last < 5000) store.addSeconds(Math.round((now - last) / 1000));
  last = now;
}, 2000);
