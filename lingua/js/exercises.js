/* Builds a practice session (a list of exercises) for a unit from the course data. */
import { shuffle, sample, pick } from "./ui.js";
import { NO_SPACES } from "./langs.js";
import { store } from "./store.js";
import { sttSupported } from "./speech.js";

const splitWords = (s, code) => (NO_SPACES.has(code) ? Array.from(s.replace(/\s+/g, "")) : s.split(/\s+/).filter(Boolean));

/* Each exercise: { type, id (concept id for SRS), prompt..., answer..., options }  */
export function buildSession(course, unit, { count = 18, focusIds = null } = {}) {
  const typing = store.setting("typing"), speaking = store.setting("speaking") && sttSupported();
  const vocab = unit.vocab.filter((v) => course.text(v.id));
  const phrases = unit.phrases.filter((p) => course.text(p.id));
  const sentences = unit.sentences.filter((s) => course.text(s.id));
  const words = focusIds ? vocab.filter((v) => focusIds.includes(v.id)) : vocab;
  const ex = [];
  const T = (id) => course.text(id), B = (id) => course.baseText(id);

  const wordOpts = (v, n = 3) => course.distractors(v, n, unit);
  const optsT = (v) => shuffle([v, ...wordOpts(v)].map((x) => ({ id: x.id, text: T(x.id), sub: null })));
  const optsB = (v) => shuffle([v, ...wordOpts(v)].map((x) => ({ id: x.id, text: B(x.id) })));

  /* 1. vocabulary recognition both ways */
  for (const v of sample(words, Math.min(words.length, 6))) ex.push({ type: "pickT", id: v.id, prompt: B(v.id), answer: v.id, options: optsT(v), audio: T(v.id) });
  for (const v of sample(words, Math.min(words.length, 5))) ex.push({ type: "pickB", id: v.id, prompt: T(v.id), answer: v.id, options: optsB(v), audio: T(v.id) });
  /* 2. listening */
  for (const v of sample(words, Math.min(words.length, 3))) ex.push({ type: "listenPick", id: v.id, audio: T(v.id), answer: v.id, options: optsT(v), prompt: "" });
  /* 3. matching */
  if (words.length >= 5) { const ws = sample(words, 5); ex.push({ type: "match", ids: ws.map((w) => w.id), pairs: ws.map((w) => ({ id: w.id, a: T(w.id), b: B(w.id) })) }); }
  /* 4. typing */
  if (typing) {
    for (const v of sample(words, Math.min(words.length, 3))) ex.push({ type: "type", id: v.id, prompt: B(v.id), answer: T(v.id), audio: T(v.id), hint: v.pos });
    for (const p of sample(phrases, Math.min(phrases.length, 2))) ex.push({ type: "dictation", id: p.id, audio: T(p.id), answer: T(p.id), translation: B(p.id) });
  }
  /* 5. sentence building */
  if (!NO_SPACES.has(course.code) || true) {
    for (const s of sample(sentences, Math.min(sentences.length, 3))) {
      const tokens = splitWords(T(s.id), course.code);
      if (tokens.length < 3 || tokens.length > 16) continue;
      const extra = sample(vocab.filter((v) => !T(s.id).toLowerCase().includes(T(v.id).toLowerCase())).map((v) => splitWords(T(v.id), course.code)[0]).filter((w) => w && !tokens.includes(w)), tokens.length > 8 ? 0 : 2);
      ex.push({ type: "order", id: s.id, prompt: B(s.id), answer: T(s.id), tokens: shuffle([...tokens, ...extra]), audio: T(s.id), noSpaces: NO_SPACES.has(course.code) });
    }
  }
  /* 6. gap fill from phrases/sentences using unit vocabulary */
  for (const s of sample([...sentences, ...phrases], 4)) {
    const text = T(s.id); const toks = NO_SPACES.has(course.code) ? null : text.split(/(\s+)/);
    if (!toks) continue;
    const cands = toks.map((w, i) => ({ w, i })).filter(({ w }) => /\p{L}{3,}/u.test(w) && !/\s/.test(w));
    if (cands.length < 1) continue;
    const { w, i } = pick(cands);
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    const others = shuffle([...new Set(vocab.flatMap((v) => splitWords(T(v.id), course.code)).concat(sentences.flatMap((x) => splitWords(T(x.id), course.code))).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).filter((x) => x && x.toLowerCase() !== clean.toLowerCase() && Math.abs(x.length - clean.length) <= 4))]).slice(0, 3);
    if (others.length < 2) continue;
    const gapped = toks.map((x, k) => (k === i ? x.replace(clean, "____") : x)).join("");
    ex.push({ type: "gap", id: s.id, prompt: gapped, translation: B(s.id), answer: clean, options: shuffle([clean, ...others]), audio: text });
    if (ex.filter((e) => e.type === "gap").length >= 2) break;
  }
  /* 7. speaking */
  if (speaking) for (const p of sample([...phrases, ...sentences.slice(0, 4)], 2)) ex.push({ type: "speak", id: p.id, prompt: T(p.id), translation: B(p.id), answer: T(p.id), audio: T(p.id) });
  /* 8. full-sentence translation */
  if (typing) for (const s of sample(sentences, 1)) ex.push({ type: "translateSent", id: s.id, prompt: B(s.id), answer: T(s.id), audio: T(s.id) });

  /* interleave so types vary, cap length */
  const byType = {}; for (const e of ex) (byType[e.type] ||= []).push(e);
  const order = ["pickT", "listenPick", "match", "pickB", "type", "order", "gap", "dictation", "speak", "pickT", "translateSent"];
  const out = [];
  while (out.length < count && Object.values(byType).some((a) => a.length)) {
    for (const t of order) { if (byType[t]?.length) out.push(byType[t].shift()); if (out.length >= count) break; }
  }
  return out;
}

/* Quick review session built from due cards (concept ids or phrasebook) */
export function buildReviewExercises(course, cards) {
  return cards.map((c) => ({ type: "flash", id: c.id, front: c.t || course.text(c.id), back: c.b || course.baseText(c.id), audio: c.t || course.text(c.id) }));
}
