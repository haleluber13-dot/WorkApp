// InkForm 3D — tattoo design engine (public API).
//
//   STYLES, STYLE_CATEGORIES, SUBJECTS
//   generateDesign(styleId, opts)        → { svg, width, height, name, params }   (sync)
//   generateDesignAsync(styleId, opts)   → same, after loading lettering fonts
//   designFromPrompt(text, seed)         → { styleId, opts }
//   renderSvgToCanvas(svg, size)         → Promise<HTMLCanvasElement>
//   thumbnail(styleId, opts, size)       → Promise<dataURL>
//   loadFonts()                          → Promise<string[]> (preload lettering fonts; call at startup)
//
// All SVG output is self-contained (no external refs; text converted to paths), transparent background.

import { INK, f1, f2, hashSeed } from "./core.js";
import { MOTIF_STYLES } from "./styles-motif.js";
import { PATTERN_STYLES } from "./styles-pattern.js";
import { MISC_STYLES } from "./styles-misc.js";
import { LETTERING_STYLES } from "./styles-lettering.js";
import { SUBJECTS as SUBJECT_LIST, SUBJECT_SYNONYMS } from "./library.js";
import { normalizeOpts } from "./opts.js";
import { loadFonts as _loadFonts, FONTS, fontReady } from "./fonts.js";
import { designFromPrompt as _fromPrompt } from "./prompt.js";

const ALL = [...MOTIF_STYLES, ...PATTERN_STYLES, ...MISC_STYLES, ...LETTERING_STYLES];
const ORDER = [
  "fineline", "minimal-line", "minimal-symbols", "ignorant",
  "geometric", "sacred-geometry", "mandala", "dotwork",
  "blackwork", "tribal", "polynesian", "maori", "celtic", "armband", "trash-polka", "brush",
  "traditional", "neo-traditional", "watercolor", "japanese",
  "sketch",
  "floral", "animals", "skull", "feather-dreamcatcher", "compass", "sun-moon", "zodiac", "ornamental",
  "lettering-script", "lettering-gothic", "lettering-chicano", "lettering-typewriter", "lettering-sans", "lettering-banner",
];
ALL.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 999) - (ORDER.indexOf(b.id) + 1 || 999));
const MAP = Object.fromEntries(ALL.map((s) => [s.id, s]));

// Public style list (no generator functions)
export const STYLES = ALL.map(({ id, name, category, description, options, aspect, gallery }) => ({ id, name, category, description, options, aspect: aspect || "square", presets: gallery || [] }));
export const SUBJECTS = SUBJECT_LIST;

const CAT_INFO = {
  "Line": "Fine-line, minimal and doodle styles",
  "Geometric": "Geometry, sacred geometry, mandalas",
  "Black & grey": "Dotwork, sketch and shading",
  "Bold": "Blackwork, tribal, Polynesian, Celtic, bands",
  "Color": "Traditional, neo-traditional, watercolor, Japanese",
  "Subjects": "Motif-focused styles",
  "Lettering": "Names, quotes, banners",
};
export const STYLE_CATEGORIES = Object.keys(CAT_INFO).map((id) => ({ id, name: id, description: CAT_INFO[id], styles: STYLES.filter((s) => s.category === id).map((s) => s.id) })).filter((c) => c.styles.length);

export const loadFonts = _loadFonts;

function compactPaths(svg, q = 1) {
  return svg.replace(/ d="([^"]*)"/g, (m, d) => ' d="' + d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => { const v = Math.round(parseFloat(n) / q) * q; return Object.is(v, -0) ? "0" : String(v); })
    .replace(/([MLCQZHVmlcqzhv]) /g, "$1").replace(/ -/g, "-") + '"');
}

function uidFactory(prefix) { let n = 0; return (p = "i") => `${prefix}${p}${(++n).toString(36)}`; }

function designName(style, o) {
  const base = style.name.replace(/\s*\(.*?\)/g, "").replace(/\s*\/.*$/, "").replace(/^Lettering:\s*/i, "");
  const sub = SUBJECT_LIST.find((s) => s.id === o.subject);
  if (style.category === "Lettering") return `"${String(o.text || "").slice(0, 24)}" ${base.toLowerCase()} lettering`;
  if (style.id === "mandala") return `${Math.round(o.petals)}-petal mandala`;
  const def = (k) => style.options.find((x) => x.key === k)?.default;
  const pretty = (v) => String(v).replace(/^doodle-/, "").replace(/-/g, " ");
  let extra = sub ? sub.name.toLowerCase() : "";
  if (!extra) for (const k of ["pattern", "variant", "symbol", "sign", "flower", "scene", "shape", "form"]) if (o[k] !== undefined) { extra = pretty(o[k]); break; }
  if (!extra && o.subject) extra = pretty(o.subject);
  if (style.id === "traditional" && o.banner && o.text) extra += ` with "${String(o.text).slice(0, 20)}" banner`;
  return extra ? `${base} ${extra}` : base;
}

// Wrap generator output into a final SVG document
function finalize(style, o, r, ctx) {
  let [x, y, w, h] = r.bbox || [0, 0, 1000, 1000];
  if (!(w > 1) || !(h > 1) || !Number.isFinite(x + y + w + h)) { x = 0; y = 0; w = 1000; h = 1000; }
  const S = 1024 / Math.max(w, h);
  const W = Math.max(16, Math.round(w * S)), H = Math.max(16, Math.round(h * S));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(x)} ${f1(y)} ${f1(w)} ${f1(h)}" width="${W}" height="${H}">` +
    (ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : "") + r.body + `</svg>`;
  // Compact large outputs: drop the decimal from path coordinates (canvas units ≈ px, so this is invisible)
  if (svg.length > 160000 && Math.max(w, h) >= 400) svg = compactPaths(svg);
  if (svg.length > 280000 && Math.max(w, h) >= 400) svg = compactPaths(svg, 2);
  return { svg, width: W, height: H };
}

export function generateDesign(styleId, opts = {}) {
  const style = MAP[styleId] || MAP[String(styleId || "").toLowerCase()] || MAP.fineline;
  const o = normalizeOpts(style, opts || {});
  const prefix = "k" + (hashSeed(style.id + JSON.stringify(o)) % 46656).toString(36) + "_";
  const ctx = { uid: uidFactory(prefix), defs: [] };
  let res;
  try {
    const r = style.gen(o, ctx);
    res = finalize(style, o, r, ctx);
  } catch (e) {
    console.warn("[designs] generator failed", style.id, e);
    const ctx2 = { uid: uidFactory(prefix + "f"), defs: [] };
    res = finalize(style, o, { body: `<circle cx="500" cy="500" r="300" fill="none" stroke="${INK}" stroke-width="8"/>`, bbox: [180, 180, 640, 640] }, ctx2);
    res.error = String(e?.message || e);
  }
  return { ...res, name: designName(style, o), params: { styleId: style.id, opts: o } };
}

export async function generateDesignAsync(styleId, opts = {}) {
  const style = MAP[styleId];
  const needs = style && (style.category === "Lettering" || style.usesFonts);
  if (needs) {
    const f = opts.font && FONTS[opts.font] ? [opts.font] : undefined;
    await _loadFonts(f || Object.keys(FONTS));
  } else if (opts && opts.text) await _loadFonts();
  return generateDesign(styleId, opts);
}

export function designFromPrompt(text, seed) {
  return _fromPrompt(text, seed, { STYLES, MAP, SUBJECTS: SUBJECT_LIST, SUBJECT_SYNONYMS });
}

// ---------------------------------------------------------------- browser rendering helpers
export function renderSvgToCanvas(svg, size = 1024) {
  return new Promise((resolve, reject) => {
    const m = /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/.exec(svg);
    const vw = m ? parseFloat(m[3]) : 1, vh = m ? parseFloat(m[4]) : 1;
    const sc = size / Math.max(vw, vh);
    const cw = Math.max(1, Math.round(vw * sc)), ch = Math.max(1, Math.round(vh * sc));
    // give the image an explicit pixel size so it rasterizes at full resolution
    const sized = svg.replace(/<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, `<svg$1 width="${cw}" height="${ch}"`);
    const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = cw; c.height = ch;
        c.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        resolve(c);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG failed to load as image")); };
    img.src = url;
  });
}

export async function thumbnail(styleId, opts = {}, size = 256) {
  const d = await generateDesignAsync(styleId, opts);
  const c = await renderSvgToCanvas(d.svg, size);
  return c.toDataURL("image/png");
}

export { FONTS, fontReady };
