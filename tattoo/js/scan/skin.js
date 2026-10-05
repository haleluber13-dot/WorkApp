// Body scan — skin tone from the front photo (face, neck, forearms).
// Robust median in CIELAB of pixels well inside the cut-out, rejecting
// highlights, shadows and non-skin colours (hair, clothes). Worker-safe.
import { rgbToLab, labToRgb, rowOf } from "./silhouette.js";

const hex2 = (v) => v.toString(16).padStart(2, "0");
export const rgbHex = ([r, g, b]) => "#" + hex2(r) + hex2(g) + hex2(b);
export function hexLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

function med(a) { const s = Float32Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; }
function pct(a, p) { const s = Float32Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; }

/**
 * rgba/mask: measuring-size image + soft mask; S: silhouette; lm: landmarks.
 * → { hex, lab, confidence: 0..1, regions: {face, neck, arms} } or null
 */
export function sampleSkin(rgba, mask, S, lm) {
  const w = S.w;
  const regions = {};
  // spans: [[y, x0, x1], …] → robust Lab median of the skin-coloured pixels
  const region = (name, spans) => {
    const L = [], A = [], B = [];
    for (const [y, x0, x1] of spans) {
      for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x++) {
        const i = y * w + x;
        if (mask[i] < 250) continue;
        const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
        const C = Math.hypot(lab[1], lab[2]), hue = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
        if (C < 4 || hue < 5 || hue > 95 || lab[0] < 8) continue; // warm hue, some chroma, not black
        L.push(lab[0]); A.push(lab[1]); B.push(lab[2]);
      }
    }
    if (L.length < 20) return;
    const lo = pct(L, 0.25), hi = pct(L, 0.9); // drop shadows and highlights
    const keep = [];
    for (let i = 0; i < L.length; i++) if (L[i] >= lo && L[i] <= hi) keep.push(i);
    regions[name] = { lab: [med(keep.map((i) => L[i])), med(keep.map((i) => A[i])), med(keep.map((i) => B[i]))], n: keep.length };
  };
  const rows = (a, b) => { const o = []; for (let y = Math.max(0, Math.round(rowOf(S, a))); y <= Math.min(S.h - 1, Math.round(rowOf(S, b))); y++) o.push(y); return o; };
  const centralSpans = (ys, inset) => ys.map((y) => {
    const c = S.cx(y);
    const s = (S.runs[y] || []).find((q) => q[0] <= c && q[1] >= c);
    if (!s) return null;
    const m = (s[1] - s[0]) * inset;
    return [y, s[0] + m, s[1] - m];
  }).filter(Boolean);
  const head = lm.top - lm.chin;
  region("face", centralSpans(rows(lm.chin + head * 0.62, lm.chin + head * 0.12), 0.22));
  region("neck", centralSpans(rows(lm.chin - 0.003, lm.neck), 0.25));
  // forearms: the side runs between elbow and wrist height (middle half of each)
  const armSpans = [];
  for (const y of rows(lm.armpit - 0.13, lm.armpit - 0.24)) {
    const r = S.runs[y] || [], c = S.cx(y);
    for (const q of r) {
      if ((q[0] <= c && q[1] >= c) || q[1] - q[0] < 3) continue;
      const m = (q[1] - q[0]) * 0.25;
      armSpans.push([y, q[0] + m, q[1] - m]);
    }
  }
  region("arms", armSpans);
  const ref = regions.face || regions.neck || regions.arms;
  if (!ref) return null;
  // combine regions that agree with the face (sleeves / scarves don't)
  let sw = 0; const acc = [0, 0, 0];
  for (const [k, r] of Object.entries(regions)) {
    if (r !== ref && deltaE(r.lab, ref.lab) > 14) continue;
    const wgt = (k === "face" ? 2 : 1) * Math.min(1, r.n / 200);
    for (let c = 0; c < 3; c++) acc[c] += r.lab[c] * wgt;
    sw += wgt;
  }
  const raw = acc.map((v) => v / sw);
  const n = Object.values(regions).reduce((a, r) => a + r.n, 0);
  const wall = wallReference(rgba, w, S.h);
  const lab = normalizeByWall(raw, wall);
  return { hex: rgbHex(labToRgb(lab[0], lab[1], lab[2])), rawHex: rgbHex(labToRgb(raw[0], raw[1], raw[2])), lab, confidence: Math.min(1, n / 600), regions, wall };
}

const LINV = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const SRGB = (c) => { c = Math.max(0, c); return Math.min(255, Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255)); };

/** Median wall colour (linear RGB) from the side borders above the floor. */
export function wallReference(rgba, w, h) {
  const bw = Math.max(3, Math.round(w * 0.06));
  const ch = [[], [], []];
  for (let y = Math.round(h * 0.05); y < Math.round(h * 0.5); y += 2) {
    for (let x = 0; x < w; x++) {
      if (x >= bw && x < w - bw) { x = w - bw - 1; continue; }
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) ch[c].push(LINV(rgba[i + c]));
    }
  }
  return ch.map(med);
}

/**
 * Phones expose for the whole scene, so skin in a photo of a light wall comes
 * out darker (and tinted by the room light). A light, roughly neutral wall is a
 * usable reference: lift the exposure toward a light-grey wall and take out
 * half of its colour cast. Coloured or dark walls are left alone.
 */
export function normalizeByWall(lab, wall) {
  if (!wall) return lab;
  const Yw = 0.2126 * wall[0] + 0.7152 * wall[1] + 0.0722 * wall[2];
  const wl = rgbToLab(SRGB(wall[0]), SRGB(wall[1]), SRGB(wall[2]));
  if (wl[0] < 35 || Math.hypot(wl[1], wl[2]) > 20) return lab;
  const gain = Math.min(1.9, Math.max(1, 0.6 / Yw));
  const rgb = labToRgb(lab[0], lab[1], lab[2]).map(LINV);
  const out = rgb.map((v, c) => SRGB(v * gain * Math.sqrt(Yw / Math.max(1e-4, wall[c]))));
  return rgbToLab(out[0], out[1], out[2]);
}

/** Index of the nearest palette swatch (by ΔE). */
export function nearestSwatch(hex, swatches) {
  const p = hexLab(hex);
  let bi = 0, bd = Infinity;
  swatches.forEach((s, i) => { const d = deltaE(p, hexLab(s.value || s)); if (d < bd) { bd = d; bi = i; } });
  return bi;
}
