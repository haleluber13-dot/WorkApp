/* Translation: a chain of free, keyless providers with graceful fallback, an optional DeepL / LibreTranslate
   key from settings, a persistent cache, and the course dictionary for offline lookups. */
import { store } from "./store.js";
import { LANGS } from "./langs.js";

const CACHE_KEY = "linguapath.trcache.v1";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { cache = {}; }
let cacheTimer;
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const keys = Object.keys(cache);
    if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 5000)) delete cache[k];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { cache = {}; }
  }, 200);
}
const ck = (q, from, to) => `${from}>${to}:${q}`;

const withTimeout = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/* code mapping per provider */
const gcode = (c) => (c === "auto" ? "auto" : c === "jw" ? "jv" : c === "he" ? "iw" : c);
const mmcode = (c) => ({ "zh-CN": "zh-CN", "zh-TW": "zh-TW", he: "he", jw: "jv" }[c] || c.split("-")[0]);
const lcode = (c) => (c === "zh-CN" ? "zh" : c === "zh-TW" ? "zt" : c === "jw" ? "jv" : c.split("-")[0]);

/* Google Translate's public web endpoint (no key). Returns { text, detected, alts } */
async function google(q, from, to) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${gcode(from)}&tl=${gcode(to)}&dt=t&dt=at&dj=1&q=${encodeURIComponent(q)}`;
  const r = await withTimeout(fetch(url));
  if (!r.ok) throw new Error(`google ${r.status}`);
  const j = await r.json();
  const text = (j.sentences || []).map((s) => s.trans || "").join("");
  if (!text) throw new Error("google empty");
  const alts = (j.alternative_translations?.[0]?.alternative || []).map((a) => a.word_postproc).filter((x) => x && x !== text).slice(0, 4);
  let detected = j.src;
  if (detected === "iw") detected = "he";
  return { text, detected, alts, provider: "Google" };
}
/* MyMemory (no key, ~5000 chars/day) */
async function mymemory(q, from, to) {
  if (from === "auto") throw new Error("mymemory needs source");
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${mmcode(from)}|${mmcode(to)}`;
  const r = await withTimeout(fetch(url));
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const j = await r.json();
  const text = j.responseData?.translatedText;
  if (!text || j.responseStatus !== 200 || /QUERY LENGTH LIMIT|MYMEMORY WARNING/i.test(text)) throw new Error("mymemory failed");
  return { text, detected: from, alts: [], provider: "MyMemory" };
}
/* Lingva (community Google front-end) */
async function lingva(q, from, to) {
  const url = `https://lingva.ml/api/v1/${gcode(from) === "iw" ? "he" : gcode(from)}/${gcode(to) === "iw" ? "he" : gcode(to)}/${encodeURIComponent(q)}`;
  const r = await withTimeout(fetch(url));
  if (!r.ok) throw new Error(`lingva ${r.status}`);
  const j = await r.json();
  if (!j.translation) throw new Error("lingva empty");
  return { text: j.translation, detected: j.info?.detectedSource || from, alts: [], provider: "Lingva" };
}
/* LibreTranslate (user-configured server) */
async function libre(q, from, to) {
  const base = (store.setting("libreUrl") || "").replace(/\/$/, "");
  if (!base) throw new Error("no libre");
  const body = { q, source: from === "auto" ? "auto" : lcode(from), target: lcode(to), format: "text", alternatives: 3 };
  const key = store.setting("libreKey"); if (key) body.api_key = key;
  const r = await withTimeout(fetch(`${base}/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  if (!r.ok) throw new Error(`libre ${r.status}`);
  const j = await r.json();
  if (!j.translatedText) throw new Error("libre empty");
  return { text: j.translatedText, detected: j.detectedLanguage?.language || from, alts: j.alternatives || [], provider: "LibreTranslate" };
}
/* DeepL (user key). Browser calls work for the free API with CORS. */
async function deepl(q, from, to) {
  const key = store.setting("deeplKey"); if (!key) throw new Error("no deepl");
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const dl = (c) => ({ "zh-CN": "ZH", "zh-TW": "ZH", pt: "PT-BR", en: "EN", no: "NB" }[c] || c.toUpperCase());
  const p = new URLSearchParams({ text: q, target_lang: dl(to) });
  if (from !== "auto") p.set("source_lang", dl(from).split("-")[0]);
  const r = await withTimeout(fetch(`https://${host}/v2/translate`, { method: "POST", headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p }));
  if (!r.ok) throw new Error(`deepl ${r.status}`);
  const j = await r.json();
  const tr = j.translations?.[0];
  if (!tr) throw new Error("deepl empty");
  return { text: tr.text, detected: (tr.detected_source_language || from).toLowerCase(), alts: [], provider: "DeepL" };
}

const CHAIN = { auto: [google, mymemory, lingva], google: [google, lingva, mymemory], mymemory: [mymemory, google, lingva], lingva: [lingva, google, mymemory] };

/* translate(text, from, to) → { text, detected, alts, provider, cached } */
export async function translate(text, from, to, { noCache = false } = {}) {
  const q = (text || "").trim();
  if (!q) return { text: "", detected: from, alts: [], provider: "" };
  if (from === to && from !== "auto") return { text: q, detected: from, alts: [], provider: "" };
  const key = ck(q, from, to);
  if (!noCache && cache[key]) return { ...cache[key], cached: true };
  const chain = [];
  if (store.setting("deeplKey")) chain.push(deepl);
  if (store.setting("libreUrl")) chain.push(libre);
  chain.push(...(CHAIN[store.setting("provider")] || CHAIN.auto));
  let lastErr;
  for (const fn of chain) {
    try {
      const res = await fn(q, from, to);
      cache[key] = { text: res.text, detected: res.detected, alts: res.alts || [], provider: res.provider };
      saveCache();
      return cache[key];
    } catch (e) { lastErr = e; }
  }
  const dict = dictionaryLookup(q, from, to);
  if (dict) return { text: dict, detected: from, alts: [], provider: "dictionary", offline: true };
  throw lastErr || new Error("translation failed");
}

/* Translate many strings at once (for building auto courses). Joins with newlines, falls back to one-by-one. */
export async function translateMany(items, from, to, onProgress) {
  const out = {}, todo = [];
  for (const [id, text] of Object.entries(items)) {
    const c = cache[ck(text.trim(), from, to)];
    if (c) out[id] = c.text; else todo.push([id, text]);
  }
  const BATCH = 25;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const joined = slice.map(([, t]) => t.replace(/\n+/g, " ")).join("\n");
    let ok = false;
    try {
      const res = await google(joined, from, to);
      const lines = res.text.split("\n").map((s) => s.trim()).filter((s, idx, arr) => s || idx < arr.length);
      if (lines.length === slice.length) {
        slice.forEach(([id, t], k) => { out[id] = lines[k]; cache[ck(t.trim(), from, to)] = { text: lines[k], detected: from, alts: [], provider: "Google" }; });
        ok = true;
      }
    } catch { /* fall through */ }
    if (!ok) {
      for (const [id, t] of slice) {
        try { out[id] = (await translate(t, from, to)).text; } catch { /* leave missing */ }
      }
    }
    saveCache();
    onProgress?.(Math.min(1, (i + BATCH) / Math.max(1, todo.length)));
  }
  return out;
}

/* ───── offline dictionary from the loaded course ───── */
let dictionary = null;   // { base: code, target: code, entries: [[baseText, targetText]] }
export function setDictionary(d) { dictionary = d; }
export function dictionaryLookup(q, from, to) {
  if (!dictionary) return null;
  const n = (s) => s.toLowerCase().trim().replace(/[.!?¡¿]/g, "");
  const x = n(q);
  const fwd = from === dictionary.base && to === dictionary.target;
  const rev = from === dictionary.target && to === dictionary.base;
  if (!fwd && !rev && from !== "auto") return null;
  for (const [b, t] of dictionary.entries) {
    if ((fwd || from === "auto") && n(b) === x) return t;
    if ((rev || from === "auto") && n(t) === x) return b;
  }
  const hits = dictionary.entries.filter(([b, t]) => n(b).includes(x) || n(t).includes(x)).slice(0, 5);
  return hits.length ? hits.map(([b, t]) => `${b} — ${t}`).join("\n") : null;
}

/* Guess a language from its script, for the "auto" source when the provider does not tell us. */
export function guessScript(text) {
  if (/[֐-׿]/.test(text)) return "he";
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[Ѐ-ӿ]/.test(text)) return "ru";
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[가-힯]/.test(text)) return "ko";
  if (/[一-鿿]/.test(text)) return "zh-CN";
  if (/[฀-๿]/.test(text)) return "th";
  if (/[Ͱ-Ͽ]/.test(text)) return "el";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  return null;
}
export const providerName = (p) => p || "";
export const knownCodes = new Set(LANGS.map((l) => l.code));
