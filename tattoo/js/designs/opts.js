// Option schema helpers shared by style definitions.
import { SUBJECTS } from "./library.js";

export const seedOpt = () => ({ key: "seed", label: "Seed", type: "seed", default: 1 });
export const weightOpt = (def = 3, label = "Line weight") => ({ key: "weight", label, type: "range", min: 0.5, max: 12, step: 0.1, default: def });
export const colorOpt = (def = "#141414", label = "Ink color") => ({ key: "color", label, type: "color", default: def });
export const rangeOpt = (key, label, min, max, step, def) => ({ key, label, type: "range", min, max, step, default: def });
export const boolOpt = (key, label, def) => ({ key, label, type: "bool", default: def });
export const textOpt = (key, label, def) => ({ key, label, type: "text", default: def });
export const selectOpt = (key, label, choices, def) => ({
  key, label, type: "select",
  choices: choices.map((c) => (typeof c === "string" ? { value: c, label: c[0].toUpperCase() + c.slice(1).replace(/-/g, " ") } : c)),
  default: def ?? (typeof choices[0] === "string" ? choices[0] : choices[0].value),
});
export const subjectOpt = (def = "rose", filter = null, key = "subject", label = "Subject") =>
  selectOpt(key, label, SUBJECTS.filter((s) => !filter || filter(s)).map((s) => ({ value: s.id, label: s.name })), def);

export const ANIMAL_IDS = ["wolf", "lion", "eagle", "fox", "bear", "deer", "owl", "cat", "dove", "swallow", "hummingbird", "butterfly", "bee", "snake", "koi", "dragon", "phoenix", "jellyfish", "whale", "spider"];
export const FLOWER_IDS = ["rose", "peony", "lotus", "sunflower", "daisy", "lavender"];

// Normalise an options object against a style's schema (fills defaults, clamps ranges, validates selects)
export function normalizeOpts(style, opts = {}) {
  const out = {};
  for (const o of style.options) {
    let v = opts[o.key];
    if (v === undefined || v === null || v === "") v = o.default;
    if (o.type === "range") {
      v = typeof v === "string" ? parseFloat(v) : v;
      if (!Number.isFinite(v)) v = o.default;
      v = Math.min(o.max, Math.max(o.min, v));
      if (o.step >= 1) v = Math.round(v);
      else if (o.step) v = Math.round(v / o.step) * o.step, v = +v.toFixed(4);
    } else if (o.type === "select") {
      if (!o.choices.some((c) => c.value === v)) {
        const lv = String(v).toLowerCase();
        const hit = o.choices.find((c) => String(c.value).toLowerCase() === lv || String(c.label).toLowerCase() === lv);
        v = hit ? hit.value : o.default;
      }
    } else if (o.type === "bool") v = v === true || v === "true" || v === 1 || v === "1" || v === "on";
    else if (o.type === "seed") { v = typeof v === "string" && /^-?\d+$/.test(v) ? parseInt(v, 10) : v; if (typeof v !== "number" && typeof v !== "string") v = o.default; }
    else if (o.type === "color") v = /^#[0-9a-f]{3,8}$/i.test(String(v)) ? v : o.default;
    else if (o.type === "text") v = String(v).replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").slice(0, 64);
    out[o.key] = v;
  }
  // pass through unknown keys (e.g. hidden extras) untouched
  for (const k of Object.keys(opts)) if (!(k in out)) out[k] = opts[k];
  return out;
}
