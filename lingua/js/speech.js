/* Text-to-speech and speech recognition through the Web Speech API, plus pronunciation scoring. */
import { lang as langInfo, ttsLocale } from "./langs.js";
import { store } from "./store.js";

const synth = window.speechSynthesis;
let voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
loadVoices();
synth?.addEventListener?.("voiceschanged", loadVoices);

/* Voices for a language code (ours or BCP-47), best first: local, same region, Google/Microsoft/Apple natural voices. */
export function voicesFor(code, prefs = []) {
  loadVoices();
  const want = [...prefs, ttsLocale(code), code].filter(Boolean).map((x) => x.toLowerCase());
  const base = (code.split("-")[0] || code).toLowerCase();
  const list = voices.filter((v) => {
    const l = v.lang.toLowerCase().replace("_", "-");
    return l === base || l.startsWith(base + "-") || (base === "zh" && l.startsWith("zh")) || (base === "no" && l.startsWith("nb")) || (base === "tl" && l.startsWith("fil")) || (base === "jw" && l.startsWith("jv"));
  });
  const score = (v) => {
    const l = v.lang.toLowerCase().replace("_", "-");
    let s = 0;
    const i = want.indexOf(l); if (i >= 0) s += 50 - i * 5;
    if (/natural|neural|premium|enhanced/i.test(v.name)) s += 20;
    if (/google|microsoft|apple|siri/i.test(v.name)) s += 8;
    if (v.localService) s += 3;
    if (/compact|espeak/i.test(v.name)) s -= 15;
    return s;
  };
  return list.sort((a, b) => score(b) - score(a));
}

let current = null;
/* speak(text, code, {rate, slow, prefs}) → Promise resolved when done */
export function speak(text, code, opts = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve(false);
    try { synth.cancel(); } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    const chosen = store.setting("voices")[code];
    const vs = voicesFor(code, opts.prefs);
    const v = (chosen && voices.find((x) => x.voiceURI === chosen)) || vs[0];
    if (v) u.voice = v;
    u.lang = v?.lang || ttsLocale(code);
    const base = store.setting("rate") || 1;
    u.rate = Math.max(0.5, Math.min(1.5, (opts.rate || 1) * base * (opts.slow ? 0.65 : 1)));
    u.pitch = 1;
    u.onend = () => { current = null; resolve(true); };
    u.onerror = () => { current = null; resolve(false); };
    current = u;
    synth.speak(u);
    /* Safari/Chrome sometimes never fire onend for long utterances */
    setTimeout(() => { if (current === u) { current = null; resolve(true); } }, 1500 + text.length * 120);
  });
}
export function stopSpeaking() { try { synth?.cancel(); } catch { /* ignore */ } current = null; }
export const canSpeak = (code) => !!synth && voicesFor(code).length > 0;
export const ttsSupported = () => !!synth;

/* ───── speech recognition ───── */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = () => !!SR;

/* listen(code, {onInterim}) → Promise<{text, alts, confidence}>; rejects with "denied" | "unsupported" | "nospeech" | "aborted" */
let rec = null;
export function listen(code, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("unsupported"));
    stopSpeaking();
    try { rec?.abort(); } catch { /* ignore */ }
    rec = new SR();
    rec.lang = opts.locale || ttsLocale(code);
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let finalText = "", alts = [], conf = 0, got = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += r[0].transcript; conf = r[0].confidence; alts = Array.from(r).map((a) => a.transcript); got = true; }
        else interim += r[0].transcript;
      }
      opts.onInterim?.(finalText + interim);
    };
    rec.onerror = (e) => {
      rec = null;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") reject(new Error("denied"));
      else if (e.error === "no-speech") reject(new Error("nospeech"));
      else if (e.error === "aborted") reject(new Error("aborted"));
      else reject(new Error(e.error || "error"));
    };
    rec.onend = () => { rec = null; if (got) resolve({ text: finalText.trim(), alts, confidence: conf }); else reject(new Error("nospeech")); };
    try { rec.start(); } catch (e) { rec = null; reject(e); }
  });
}
export function stopListening() { try { rec?.stop(); } catch { /* ignore */ } }
export function abortListening() { try { rec?.abort(); } catch { /* ignore */ } rec = null; }

/* ───── comparison ───── */
export function normalize(s, { keepAccents = false } = {}) {
  let x = (s || "").toLowerCase().trim()
    .replace(/[֑-ׇ]/g, "")                         // Hebrew niqqud
    .replace(/[.,!?;:¡¿"“”«»'’‘()\[\]{}\-–—…。！？،؟]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!keepAccents) x = x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae");
  return x;
}
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
/* similarity 0..1 of two utterances (accent-insensitive) */
export function similarity(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = levenshtein(x, y);
  return Math.max(0, 1 - d / Math.max(x.length, y.length));
}
/* best similarity across recognition alternatives */
export function bestMatch(result, target) {
  const cands = [result.text, ...(result.alts || [])].filter(Boolean);
  let best = 0, text = result.text;
  for (const c of cands) { const s = similarity(c, target); if (s > best) { best = s; text = c; } }
  return { score: best, text };
}
/* Grade a typed answer against accepted answers. Returns "correct" | "almost" | "wrong" */
export function gradeTyped(answer, accepted, { articles = [] } = {}) {
  const strip = (s) => {
    let x = normalize(s, { keepAccents: true });
    for (const a of articles) { const re = new RegExp(`^${a.toLowerCase()}\\s+`); if (re.test(x)) { x = x.replace(re, ""); break; } }
    return x;
  };
  const ans = strip(answer);
  if (!ans) return "wrong";
  const list = Array.isArray(accepted) ? accepted : [accepted];
  const variants = list.flatMap((s) => s.split(/\s*[\/|]\s*|\s*\(.*?\)\s*/).concat([s])).map(strip).filter(Boolean);
  if (variants.includes(ans)) return "correct";
  const ansNoAcc = normalize(ans);
  for (const v of variants) {
    const vNoAcc = normalize(v);
    if (ansNoAcc === vNoAcc) return "almost";
    if (vNoAcc.length >= 5 && levenshtein(ansNoAcc, vNoAcc) <= 1) return "almost";
  }
  return "wrong";
}
