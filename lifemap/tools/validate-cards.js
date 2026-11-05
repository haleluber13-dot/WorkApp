#!/usr/bin/env node
// Validates lifemap/data/cards/*.js against data/CARDS_SCHEMA.md
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "data/topics.js"), "utf8"), ctx);
const { LIFEMAP_TOPICS, LIFEMAP_BANDS, LIFEMAP_LEVELS, LIFEMAP_TYPES } = ctx.window;

const only = process.argv.slice(2);
const cardsDir = path.join(root, "data/cards");
let errors = 0, warnings = 0, total = 0;
const err = (m) => { errors++; console.error("  ✖ " + m); };
const warn = (m) => { warnings++; console.warn("  ⚠ " + m); };

for (const topic of LIFEMAP_TOPICS) {
  if (only.length && !only.includes(topic.id)) continue;
  const file = path.join(cardsDir, topic.id + ".js");
  console.log(`\n${topic.id} (${topic.name})`);
  if (!fs.existsSync(file)) { err("missing file " + path.relative(root, file)); continue; }
  const c = { window: { LIFEMAP_CARDS: {} } };
  vm.createContext(c);
  try { vm.runInContext(fs.readFileSync(file, "utf8"), c, { filename: file }); }
  catch (e) { err("JS error: " + e.message); continue; }
  const cards = c.window.LIFEMAP_CARDS[topic.id];
  if (!Array.isArray(cards)) { err("file does not set window.LIFEMAP_CARDS[\"" + topic.id + "\"]"); continue; }
  const cell = {};
  const titles = new Set();
  cards.forEach((card, i) => {
    const where = `card #${i + 1} "${card.title || "?"}"`;
    if (!LIFEMAP_TYPES[card.type]) err(`${where}: bad type ${card.type}`);
    if (!LIFEMAP_LEVELS.some((l) => l.id === card.level)) err(`${where}: bad level ${card.level}`);
    const band = LIFEMAP_BANDS.find((b) => Array.isArray(card.ages) && b.ages[0] === card.ages[0] && b.ages[1] === card.ages[1]);
    if (!band) err(`${where}: ages must be exactly one band, got ${JSON.stringify(card.ages)}`);
    for (const f of ["title", "text", "tip"]) if (typeof card[f] !== "string" || !card[f].trim()) err(`${where}: missing ${f}`);
    if (!Array.isArray(card.skills) || !card.skills.length) err(`${where}: missing skills`);
    if (card.type === "question" && !card.answer) err(`${where}: question without answer`);
    if (["task", "experiment", "game"].includes(card.type) && (!Array.isArray(card.steps) || card.steps.length < 2)) err(`${where}: ${card.type} needs ≥2 steps`);
    if (card.steps && !Array.isArray(card.steps)) err(`${where}: steps must be array`);
    if (card.materials && !Array.isArray(card.materials)) err(`${where}: materials must be array`);
    if (card.title && titles.has(card.title)) err(`${where}: duplicate title (titles must be unique within a topic)`);
    titles.add(card.title);
    if (/[\u{1F300}-\u{1FAFF}]/u.test(card.text || "")) warn(`${where}: emoji inside text`);
    if (band) { const k = band.id + "/" + card.level; cell[k] = (cell[k] || 0) + 1; }
  });
  const rows = [];
  for (const b of LIFEMAP_BANDS) for (const l of LIFEMAP_LEVELS) {
    const n = cell[b.id + "/" + l.id] || 0;
    rows.push(`${b.label}/${l.id}=${n}`);
    if (n < 4) err(`only ${n} cards for ages ${b.label} level ${l.id} (need ≥4)`);
  }
  console.log("  " + cards.length + " cards · " + rows.join("  "));
  total += cards.length;
}
console.log(`\n${total} cards total, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
