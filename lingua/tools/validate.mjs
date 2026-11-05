#!/usr/bin/env node
/* Validates LinguaPath content files. Usage: node validate.mjs [packCode ...] */
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const content = path.join(here, "..", "js", "content");
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const HEB = /[֐-׿]/;
const POS = new Set(["noun", "verb", "adj", "adv", "pron", "prep", "conj", "num", "interj", "det", "phrase"]);
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

async function load(name) {
  try { return await import(pathToFileURL(path.join(content, name)).href); }
  catch (e) { err(`${name}: cannot load — ${e.message}`); return null; }
}
function bi(obj, where, requireHe = true) {
  if (!obj || typeof obj !== "object") return err(`${where}: missing {en,he}`);
  if (typeof obj.en !== "string" || !obj.en.trim()) err(`${where}: empty en`);
  if (requireHe) {
    if (typeof obj.he !== "string" || !obj.he.trim()) err(`${where}: empty he`);
    else if (!HEB.test(obj.he)) err(`${where}: he has no Hebrew letters: ${obj.he.slice(0, 40)}`);
  }
}

const ids = new Map(); // id -> unit
const units = [], readings = [];
for (const f of ["concepts-a.js", "concepts-b.js"]) {
  const m = await load(f);
  if (!m) continue;
  if (!Array.isArray(m.UNITS)) { err(`${f}: no UNITS export`); continue; }
  units.push(...m.UNITS.map((u) => ({ ...u, _f: f })));
  if (Array.isArray(m.READINGS)) readings.push(...m.READINGS.map((r) => ({ ...r, _f: f }))); else err(`${f}: no READINGS export`);
}
const addId = (id, where, pattern) => {
  if (typeof id !== "string" || !pattern.test(id)) err(`${where}: bad id "${id}"`);
  if (ids.has(id)) err(`${where}: duplicate id ${id} (also in ${ids.get(id)})`);
  ids.set(id, where);
};
const seenUnit = new Set(), enWords = new Map();
for (const u of units) {
  const w = `${u._f} unit ${u.id}`;
  if (!/^[abc][12]-\d\d$/.test(u.id || "")) err(`${w}: bad unit id`);
  if (seenUnit.has(u.id)) err(`${w}: duplicate unit`); seenUnit.add(u.id);
  if (!LEVELS.includes(u.level)) err(`${w}: bad level`);
  if (u.id && u.level && !u.id.startsWith(u.level.toLowerCase())) err(`${w}: id/level mismatch`);
  if (!u.emoji) warn(`${w}: no emoji`);
  bi(u.title, `${w}.title`); bi(u.grammarFocus, `${w}.grammarFocus`);
  bi(u.speaking, `${w}.speaking`); bi(u.writing, `${w}.writing`);
  if (!u.goals || !Array.isArray(u.goals.en) || !Array.isArray(u.goals.he) || u.goals.en.length !== u.goals.he.length || !u.goals.en.length) err(`${w}: goals`);
  if (!u.model) err(`${w}: model missing`); else { addId(u.model.id, `${w}.model`, new RegExp(`^m\\.${u.id}$`)); bi(u.model, `${w}.model`); }
  const vocab = u.vocab || [];
  if (vocab.length < 18) err(`${w}: only ${vocab.length} vocab`); else if (vocab.length > 36) warn(`${w}: ${vocab.length} vocab`);
  for (const v of vocab) {
    addId(v.id, `${w} vocab`, new RegExp(`^w\\.${u.id}\\.[a-z0-9-]+$`));
    bi(v, `${w}.${v.id}`);
    if (!POS.has(v.pos)) err(`${w}.${v.id}: bad pos "${v.pos}"`);
    const k = (v.en || "").toLowerCase().trim();
    if (enWords.has(k)) warn(`${w}.${v.id}: "${v.en}" already taught in ${enWords.get(k)}`); else enWords.set(k, u.id);
  }
  for (const [key, re, min] of [["phrases", "p", 8], ["sentences", "s", 8]]) {
    const arr = u[key] || [];
    if (arr.length < min) err(`${w}: only ${arr.length} ${key}`);
    arr.forEach((x, i) => { addId(x.id, `${w} ${key}[${i}]`, new RegExp(`^${re}\\.${u.id}\\.\\d+$`)); bi(x, `${w}.${x.id}`); });
  }
  const d = u.dialogue;
  if (!d || !Array.isArray(d.lines) || d.lines.length < 6) err(`${w}: dialogue needs ≥6 lines`);
  else {
    bi(d.title, `${w}.dialogue.title`);
    if (!d.roles || typeof d.roles !== "object") err(`${w}.dialogue.roles`);
    d.lines.forEach((l, i) => { addId(l.id, `${w} dialogue[${i}]`, new RegExp(`^d\\.${u.id}\\.\\d+$`)); bi(l, `${w}.${l.id}`); if (!l.who || !(d.roles || {})[l.who]) err(`${w}.${l.id}: who "${l.who}" not in roles`); });
  }
}
for (const r of readings) {
  const w = `${r._f} reading ${r.id}`;
  addId(r.id, w, /^r\.[abc][12]\.\d+$/);
  if (!LEVELS.includes(r.level)) err(`${w}: level`);
  bi(r.title, `${w}.title`); bi(r.text, `${w}.text`);
  const n = (r.text?.en || "").split(/\s+/).length;
  if (n < 50) err(`${w}: text only ${n} words`);
  if (!Array.isArray(r.questions) || r.questions.length < 2) err(`${w}: questions`);
  else r.questions.forEach((q, i) => {
    bi(q.q, `${w}.q[${i}]`);
    if (!q.options || !Array.isArray(q.options.en) || !Array.isArray(q.options.he) || q.options.en.length !== q.options.he.length || q.options.en.length < 2) err(`${w}.q[${i}]: options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.en?.length || 0)) err(`${w}.q[${i}]: answer index`);
  });
}
console.log(`concepts: ${units.length} units, ${[...ids.keys()].filter((i) => i.startsWith("w.")).length} words, ${readings.length} readings, ${ids.size} ids`);

/* ───── packs ───── */
const packs = process.argv.slice(2);
for (const code of packs) {
  const m = await load(`${code}.js`);
  if (!m || !m.default) { err(`${code}: no default export`); continue; }
  const p = m.default;
  const w = `pack ${code}`;
  for (const k of ["code", "name", "englishName", "stt", "dir"]) if (typeof p[k] !== "string") err(`${w}: missing ${k}`);
  if (p.code !== code) err(`${w}: code mismatch`);
  if (!Array.isArray(p.tts) || !p.tts.length) err(`${w}: tts`);
  if (!Array.isArray(p.pronouns) || p.pronouns.length < 3) err(`${w}: pronouns`);
  if (!Array.isArray(p.alphabet) || p.alphabet.length < 15) err(`${w}: alphabet (${p.alphabet?.length})`);
  else p.alphabet.forEach((a, i) => { if (!a.ch || !a.ex) err(`${w}.alphabet[${i}]`); bi(a, `${w}.alphabet[${i}]`); });
  if (!Array.isArray(p.tips) || p.tips.length < 3) err(`${w}: tips`); else p.tips.forEach((t, i) => bi(t, `${w}.tips[${i}]`));
  const t = p.t || {};
  let missing = [];
  for (const id of ids.keys()) if (typeof t[id] !== "string" || !t[id].trim()) missing.push(id);
  if (missing.length) err(`${w}: ${missing.length} ids missing in t, e.g. ${missing.slice(0, 15).join(", ")}`);
  for (const k of Object.keys(t)) if (!ids.has(k)) warn(`${w}: t has unknown id ${k}`);
  for (const u of units) {
    const g = p.grammar?.[u.id];
    if (!Array.isArray(g) || !g.length) { err(`${w}: no grammar for ${u.id}`); continue; }
    g.forEach((pt, i) => {
      bi(pt.title, `${w}.grammar.${u.id}[${i}].title`); bi(pt.body, `${w}.grammar.${u.id}[${i}].body`);
      if (!Array.isArray(pt.examples) || pt.examples.length < 2) err(`${w}.grammar.${u.id}[${i}]: examples`);
      else pt.examples.forEach((e, j) => { if (!e.t) err(`${w}.grammar.${u.id}[${i}].ex[${j}]: t`); bi(e, `${w}.grammar.${u.id}[${i}].ex[${j}]`); });
    });
  }
  const verbs = p.verbs || {};
  if (Object.keys(verbs).length < 12) err(`${w}: only ${Object.keys(verbs).length} verbs`);
  for (const [v, d] of Object.entries(verbs)) {
    bi(d, `${w}.verbs.${v}`);
    if (!d.forms || !d.forms.present) err(`${w}.verbs.${v}: forms.present`);
    for (const [tense, arr] of Object.entries(d.forms || {})) {
      if (!Array.isArray(arr) || arr.length !== p.pronouns.length) err(`${w}.verbs.${v}.${tense}: need ${p.pronouns.length} forms`);
      if (!p.tenses?.[tense]) err(`${w}: tenses.${tense} label missing`);
    }
  }
  for (const [k, v] of Object.entries(p.notes || {})) { if (!ids.has(k)) warn(`${w}.notes: unknown id ${k}`); bi(v, `${w}.notes.${k}`); }
  console.log(`${w}: ${Object.keys(t).length} translations, ${Object.keys(p.grammar || {}).length} grammar units, ${Object.keys(verbs).length} verbs`);
}

for (const x of warns) console.log("warn:", x);
for (const x of errors) console.log("ERROR:", x);
console.log(errors.length ? `${errors.length} errors` : "OK");
process.exit(errors.length ? 1 : 0);
