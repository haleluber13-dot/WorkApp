/* Progress and settings, kept in localStorage. */

const KEY = "pianopath.v1";
const DEFAULTS = {
  done: {},          // lessonId -> timestamp
  exDone: {},        // "lessonId#i" -> {t, mistakes, tempo}
  days: {},          // "YYYY-MM-DD" -> seconds practiced
  best: {},          // trainer high scores
  settings: {
    names: "letters",    // letters | solfege
    labels: "c",         // all | c | none
    fingers: true,
    volume: 0.8,
    micSens: 1,
    theme: "auto",
    click: true,
    countIn: true,
    sound: "piano",
    speak: false,
    accompany: true,
    autoSpeed: false,
    onboarded: false,
    goalMin: 15,
    input: "touch",
    zoom: 1,
  },
};

let state;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || "null");
  state = raw ? { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } } : structuredClone(DEFAULTS);
} catch {
  state = structuredClone(DEFAULTS);
}

export const store = {
  get s() { return state; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } },
  setting(k, v) { if (v === undefined) return state.settings[k]; state.settings[k] = v; this.save(); return v; },
  isDone(id) { return !!state.done[id]; },
  markDone(id, on = true) { if (on) state.done[id] = Date.now(); else delete state.done[id]; this.save(); },
  exResult(key, r) {
    const prev = state.exDone[key];
    if (!prev || r.mistakes < prev.mistakes || r.tempo > prev.tempo) state.exDone[key] = { ...r, t: Date.now() };
    this.save();
  },
  exDone(key) { return state.exDone[key]; },
  addSeconds(sec) {
    const d = today();
    state.days[d] = (state.days[d] || 0) + sec;
    this.save();
  },
  best(k, v) {
    if (v === undefined) return state.best[k] || 0;
    if (v > (state.best[k] || 0)) { state.best[k] = v; this.save(); return true; }
    return false;
  },
  streak() {
    let n = 0;
    const d = new Date();
    if (!state.days[fmt(d)]) d.setDate(d.getDate() - 1);
    while (state.days[fmt(d)] >= 60) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  reset() { state = structuredClone(DEFAULTS); this.save(); },
  export() { return JSON.stringify(state); },
};

function fmt(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function today() { return fmt(new Date()); }
export function lastDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push({ date: fmt(x), sec: state.days[fmt(x)] || 0, dow: x.getDay() });
  }
  return out;
}

/* Practice-time tracking: count 10 s blocks in which something was played. */
let lastActivity = 0;
export function activity() { lastActivity = Date.now(); }
setInterval(() => {
  if (Date.now() - lastActivity < 30000 && document.visibilityState === "visible") store.addSeconds(10);
}, 10000);
