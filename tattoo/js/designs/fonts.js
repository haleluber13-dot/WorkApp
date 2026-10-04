// Lettering fonts: lazy loading via vendored opentype.js, text → SVG path conversion,
// arc layout, and a baked fallback (Dancing Script Bold glyphs) for when fonts aren't loaded yet.
import { FALLBACK_FONT } from "./fallback-font.js";
import { transformD, M, f1 } from "./core.js";

export const FONTS = {
  script: { family: "Ink Script", file: "great-vibes.woff", label: "Script — elegant" },
  scriptBold: { family: "Ink Script Bold", file: "dancing-script-700.woff", label: "Script — bold" },
  gothic: { family: "Ink Gothic", file: "unifrakturmaguntia.woff", label: "Gothic / blackletter" },
  chicano: { family: "Ink Chicano", file: "pirata-one.woff", label: "Chicano blackletter" },
  signpainter: { family: "Ink Signpainter", file: "mr-dafoe.woff", label: "Chicano script / signpainter" },
  typewriter: { family: "Ink Typewriter", file: "courier-prime.woff", label: "Typewriter" },
  sans: { family: "Ink Sans", file: "oswald-600.woff", label: "Bold sans" },
  western: { family: "Ink Western", file: "rye.woff", label: "Old-school western" },
  brush: { family: "Ink Brush", file: "kaushan-script.woff", label: "Brush script" },
  marker: { family: "Ink Marker", file: "caveat-brush.woff", label: "Handwritten marker" },
};
export const FONT_CHOICES = Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }));

const parsed = {};          // id → opentype Font
let otPromise = null;

async function getOpentype() {
  if (!otPromise) otPromise = import("../../vendor/opentype/opentype.min.mjs");
  return otPromise;
}
async function fetchBuffer(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.arrayBuffer();
  } catch (e) {
    if (typeof process !== "undefined" && process.versions?.node) {     // Node (tests)
      const fs = await import("node:fs");
      const b = fs.readFileSync(new URL(url));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    }
    throw e;
  }
}

const pending = {};
export function loadFont(id) {
  if (parsed[id]) return Promise.resolve(parsed[id]);
  const f = FONTS[id];
  if (!f) return Promise.resolve(null);
  return (pending[id] ||= (async () => {
    const ot = await getOpentype();
    const buf = await fetchBuffer(new URL(`../../fonts/${f.file}`, import.meta.url).href);
    const font = (ot.parse || ot.default?.parse)(buf);
    parsed[id] = font;
    return font;
  })().catch((e) => { delete pending[id]; throw e; }));
}

// Preload all lettering fonts (call once at startup). Resolves to the list of loaded ids.
export function loadFonts(ids = Object.keys(FONTS)) {
  return Promise.all(ids.map((id) => loadFont(id).then(() => id).catch((e) => { console.warn("[designs] font failed", id, e?.message || e); return null; })))
    .then((r) => r.filter(Boolean));
}
export const fontReady = (id) => !!parsed[id];

// ------------------------------------------------------------------ glyph layout
// Returns { glyphs:[{d, x, adv}], width, asc, desc, fallback } at font size `size`, baseline y = 0.
export function layoutText(text, fontId, size = 100, { tracking = 0 } = {}) {
  const font = parsed[fontId];
  const glyphs = [];
  let x = 0;
  text = String(text ?? "");
  if (font) {
    const scale = size / font.unitsPerEm;
    let prev = null;
    for (const ch of text) {
      let g = font.charToGlyph(ch);
      if ((!g || g.index === 0) && ch !== " ") g = font.charToGlyph(ch.normalize("NFD")[0] || "?");
      if (prev && g) { try { x += font.getKerningValue(prev, g) * scale; } catch { /* no kerning */ } }
      const adv = (g?.advanceWidth || font.unitsPerEm * 0.3) * scale;
      let d = "";
      if (g && ch !== " ") { try { d = g.getPath(0, 0, size).toPathData(1); } catch { d = ""; } }
      glyphs.push({ ch, d, x, adv });
      x += adv + tracking * size;
      prev = g;
    }
    return { glyphs, width: Math.max(0, x - tracking * size), asc: font.ascender * scale, desc: -font.descender * scale, capH: (font.tables?.os2?.sCapHeight || font.ascender * 0.7) * scale, fallback: false };
  }
  // fallback font
  const F = FALLBACK_FONT, s = size / F.upm;
  for (const ch0 of text) {
    let ch = ch0;
    if (!F.glyphs[ch]) ch = ch0.normalize("NFD")[0];
    const gl = F.glyphs[ch] || F.glyphs["?"];
    const adv = (ch0 === " " ? F.glyphs[" "]?.[0] ?? 250 : gl[0]) * s;
    const d = ch0 === " " ? "" : (s === 1 ? gl[1] : transformD(gl[1], M.s(s)));
    glyphs.push({ ch: ch0, d, x, adv });
    x += adv + tracking * size;
  }
  return { glyphs, width: Math.max(0, x - tracking * size), asc: F.asc * s, desc: -F.desc * s, capH: F.asc * s * 0.72, fallback: true };
}

// Straight text path, horizontally centered at cx with baseline at y.
export function textD(text, fontId, size, cx, y, o = {}) {
  const L = layoutText(text, fontId, size, o);
  const x0 = cx - L.width / 2;
  let d = "";
  for (const g of L.glyphs) if (g.d) d += transformD(g.d, M.t(x0 + g.x, y));
  return { d, width: L.width, asc: L.asc, desc: L.desc, capH: L.capH, fallback: L.fallback };
}

// Text along a circular arc. radius > 0: text on top of arc (center below), arc bends downward at the ends
// (smile when `down`). cx,cy = arc circle center; baseline radius R. Centered at angle `mid` (default -90°).
export function arcTextD(text, fontId, size, cx, cy, R, { inside = false, mid = -Math.PI / 2, tracking = 0 } = {}) {
  const L = layoutText(text, fontId, size, { tracking });
  let d = "";
  const total = L.width / R;
  for (const g of L.glyphs) {
    if (!g.d) continue;
    const gc = g.x + g.adv / 2 - L.width / 2;              // glyph center offset along baseline
    if (!inside) {
      const a = mid + gc / R;
      const m = M.chain(M.t(cx + R * Math.cos(a), cy + R * Math.sin(a)), M.r(a + Math.PI / 2), M.t(-g.adv / 2, 0));
      d += transformD(g.d, M.mul(m, M.t(0, 0)));
    } else {
      // reading left→right along the bottom of the circle (text upright, baseline on arc)
      const a = (mid === -Math.PI / 2 ? Math.PI / 2 : mid) - gc / R;
      const m = M.chain(M.t(cx + R * Math.cos(a), cy + R * Math.sin(a)), M.r(a - Math.PI / 2), M.t(-g.adv / 2, 0));
      d += transformD(g.d, m);
    }
  }
  return { d, width: L.width, angle: total, asc: L.asc, desc: L.desc, fallback: L.fallback };
}

// Text that follows an arbitrary polyline baseline (array of points, left → right), centered.
export function pathTextD(text, fontId, size, base, { tracking = 0, offset = 0 } = {}) {
  const L = layoutText(text, fontId, size, { tracking });
  const cum = [0];
  for (let i = 1; i < base.length; i++) cum.push(cum[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(total, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const p = [base[i - 1][0] + (base[i][0] - base[i - 1][0]) * t, base[i - 1][1] + (base[i][1] - base[i - 1][1]) * t];
    return { p, a: Math.atan2(base[i][1] - base[i - 1][1], base[i][0] - base[i - 1][0]) };
  };
  const start = total / 2 - L.width / 2 + offset;
  let d = "";
  for (const g of L.glyphs) {
    if (!g.d) continue;
    const { p, a } = at(start + g.x + g.adv / 2);
    d += transformD(g.d, M.chain(M.t(p[0], p[1]), M.r(a), M.t(-g.adv / 2, 0)));
  }
  return { d, width: L.width, asc: L.asc, desc: L.desc, fallback: L.fallback };
}
