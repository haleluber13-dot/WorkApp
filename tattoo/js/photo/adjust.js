// Photo studio — "Adjust" engine (like Photos → Adjust): tone LUTs, local tone mapping (highlights / shadows /
// brilliance / definition), colour, detail (sharpen, noise reduction), effects (vignette, grain, fade),
// curves, levels, filters and Auto. CPU, works on any RGBA buffer; spatial radii scale with `k`.

import { clamp, clamp01, smoothstep, gaussBlur, boxBlur, lumaOf, rng, percentile } from './util.js';

/* ---------------- slider definitions ---------------- */

// [id, label, group, min, max]
export const ADJ = [
  ['exposure', 'Exposure', 'Light', -100, 100],
  ['brilliance', 'Brilliance', 'Light', -100, 100],
  ['highlights', 'Highlights', 'Light', -100, 100],
  ['shadows', 'Shadows', 'Light', -100, 100],
  ['contrast', 'Contrast', 'Light', -100, 100],
  ['brightness', 'Brightness', 'Light', -100, 100],
  ['blackPoint', 'Black Point', 'Light', -100, 100],
  ['saturation', 'Saturation', 'Color', -100, 100],
  ['vibrance', 'Vibrance', 'Color', -100, 100],
  ['warmth', 'Warmth', 'Color', -100, 100],
  ['tint', 'Tint', 'Color', -100, 100],
  ['hue', 'Hue', 'Color', -100, 100],
  ['sharpness', 'Sharpness', 'Detail', 0, 100],
  ['definition', 'Definition', 'Detail', -100, 100],
  ['noise', 'Noise Reduction', 'Detail', 0, 100],
  ['vignette', 'Vignette', 'Effects', -100, 100],
  ['grain', 'Grain', 'Effects', 0, 100],
  ['fade', 'Fade', 'Effects', -100, 100],
].map(([id, label, group, min, max]) => ({ id, label, group, min, max }));

export const IDENTITY_CURVE = () => [[0, 0], [1, 1]];
export function defaultAdjust() {
  const p = {};
  for (const a of ADJ) p[a.id] = 0;
  p.filter = 'original';
  p.filterAmount = 100;
  p.curves = { rgb: IDENTITY_CURVE(), r: IDENTITY_CURVE(), g: IDENTITY_CURVE(), b: IDENTITY_CURVE() };
  p.levels = { black: 0, gamma: 1, white: 255 };
  return p;
}
export const cloneAdjust = (p) => JSON.parse(JSON.stringify(p));
const curveIsId = (c) => c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1;
export function adjustIsIdentity(p) {
  for (const a of ADJ) if (p[a.id]) return false;
  if (p.filter !== 'original' && p.filterAmount > 0) return false;
  if (!curveIsId(p.curves.rgb) || !curveIsId(p.curves.r) || !curveIsId(p.curves.g) || !curveIsId(p.curves.b)) return false;
  const L = p.levels;
  return L.black === 0 && L.white === 255 && L.gamma === 1;
}

/* ---------------- filters (applied after the adjustments, with intensity) ---------------- */

export const FILTERS = [
  { id: 'original', label: 'Original' },
  { id: 'vivid', label: 'Vivid', p: { contrast: 18, saturation: 28, vibrance: 22 } },
  { id: 'vividWarm', label: 'Vivid Warm', p: { contrast: 18, saturation: 24, vibrance: 22, warmth: 30 } },
  { id: 'vividCool', label: 'Vivid Cool', p: { contrast: 18, saturation: 24, vibrance: 22, warmth: -30 } },
  { id: 'dramatic', label: 'Dramatic', p: { contrast: 42, saturation: -28, brightness: -12, blackPoint: 10 } },
  { id: 'dramaticWarm', label: 'Dramatic Warm', p: { contrast: 40, saturation: -18, brightness: -10, blackPoint: 8, warmth: 32 } },
  { id: 'dramaticCool', label: 'Dramatic Cool', p: { contrast: 40, saturation: -18, brightness: -10, blackPoint: 8, warmth: -32 } },
  { id: 'mono', label: 'Mono', mono: [1, 1, 1], p: { contrast: 6 } },
  { id: 'silvertone', label: 'Silvertone', mono: [0.97, 1, 1.05], p: { contrast: -8, brightness: 14, fade: 16 } },
  { id: 'noir', label: 'Noir', mono: [1, 1, 1], p: { contrast: 60, blackPoint: 26, brightness: -6 } },
  { id: 'sepia', label: 'Sepia', mono: [1.13, 0.98, 0.76], p: { fade: 8, contrast: 4 } },
  { id: 'fade', label: 'Fade', p: { fade: 46, saturation: -32, contrast: -14 } },
  { id: 'chrome', label: 'Chrome', p: { contrast: 26, saturation: 18, warmth: -8, fade: 6 } },
  { id: 'hcbw', label: 'High Contrast B&W', mono: [1, 1, 1], p: { contrast: 85, blackPoint: 14 } },
];

/* ---------------- curves ---------------- */

/** Monotone cubic (Fritsch–Carlson) through points [[x,y]...] in 0..1 → Float32Array(256). */
export function curveLUT(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0]);
  const lut = new Float32Array(256);
  if (P.length < 2 || curveIsId(P)) { for (let i = 0; i < 256; i++) lut[i] = i / 255; return lut; }
  const n = P.length;
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    let y;
    if (x <= xs[0]) y = ys[0];
    else if (x >= xs[n - 1]) y = ys[n - 1];
    else {
      let i = 0;
      while (i < n - 2 && x > xs[i + 1]) i++;
      const hseg = xs[i + 1] - xs[i], t = (x - xs[i]) / hseg;
      const t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hseg * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hseg * m[i + 1];
    }
    lut[v] = clamp01(y);
  }
  return lut;
}

/* ---------------- tone LUTs ---------------- */

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Per-channel LUTs (Float32 256 → 0..1) for the global (pointwise) part of the adjustments. */
export function buildLUTs(p, withCurves = true) {
  const v100 = (k) => (p[k] || 0) / 100;
  const br = v100('brilliance');
  const ev = v100('exposure') * 2 + br * 0.15;
  const G = Math.pow(2, ev);
  const w = v100('warmth'), t = v100('tint');
  let gr = 1 + 0.2 * w + 0.05 * t, gg = 1 - 0.1 * t, gb = 1 - 0.22 * w + 0.05 * t;
  const gl = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb;
  gr /= gl; gg /= gl; gb /= gl;
  const bp = v100('blackPoint') + (br < 0 ? 0 : 0);
  const bright = v100('brightness');
  const gamma = Math.pow(2, -bright * 0.85);
  const con = v100('contrast') + br * 0.08;
  const fade = v100('fade');
  const L = p.levels || { black: 0, gamma: 1, white: 255 };
  const lb = L.black, lw = Math.max(lb + 1, L.white), lg = Math.max(0.1, L.gamma);
  const cur = withCurves && p.curves ? {
    rgb: curveLUT(p.curves.rgb), r: curveLUT(p.curves.r), g: curveLUT(p.curves.g), b: curveLUT(p.curves.b),
  } : null;
  const knee = 0.82;
  const soft = (y) => (y < knee ? y : knee + (1 - knee) * (1 - Math.exp(-(y - knee) / (1 - knee))));
  const make = (gain, chCurve) => {
    const lut = new Float32Array(256);
    const Gc = G * gain;
    const tSoft = clamp01((Gc - 1) * 2);
    for (let v = 0; v < 256; v++) {
      let x = clamp01((v - lb) / (lw - lb));
      if (lg !== 1) x = Math.pow(x, 1 / lg);
      if (Gc !== 1) {
        const y = s2l(x) * Gc;
        const yy = tSoft > 0 ? Math.min(1, y) * (1 - tSoft) + soft(y) * tSoft : Math.min(1, y);
        x = l2s(clamp01(yy));
      }
      if (bp > 0) x = clamp01((x - bp * 0.2) / (1 - bp * 0.2));
      else if (bp < 0) x = -bp * 0.18 + x * (1 + bp * 0.18);
      if (gamma !== 1) x = Math.pow(x, gamma);
      if (con > 0) {
        const e = 1 + con * 1.7;
        const s = x < 0.5 ? 0.5 * Math.pow(2 * x, e) : 1 - 0.5 * Math.pow(2 - 2 * x, e);
        x = s;
      } else if (con < 0) x = 0.5 + (x - 0.5) * (1 + con * 0.62);
      if (fade > 0) x = fade * 0.2 + x * (1 - fade * 0.27);
      else if (fade < 0) x = Math.pow(x, 1 - fade * 0.35);
      if (cur) { x = cur.rgb[Math.round(clamp01(x) * 255)]; x = chCurve[Math.round(clamp01(x) * 255)]; }
      lut[v] = clamp01(x);
    }
    return lut;
  };
  const R = make(gr, cur && cur.r), Gt = make(gg, cur && cur.g), B = make(gb, cur && cur.b);
  const Lm = new Float32Array(256);
  for (let v = 0; v < 256; v++) Lm[v] = 0.299 * R[v] + 0.587 * Gt[v] + 0.114 * B[v];
  return { R, G: Gt, B, L: Lm };
}

/* ---------------- grain texture ---------------- */
let GRAIN = null;
function grainTile() {
  if (GRAIN) return GRAIN;
  const N = 256, a = new Float32Array(N * N), r = rng(99);
  for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1;
  const b = Float32Array.from(a);
  gaussBlur(b, N, N, 0.7);
  for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.45 + b[i] * 2.2;
  GRAIN = a;
  return a;
}

/* ---------------- source with caches ---------------- */

/**
 * Wrap pixels for processing. geo: { k: px per working px, gx, gy: offset (working px) of this buffer in the
 * full working image, GW, GH: full working size } — used so vignette/grain/patterns line up between
 * preview and full-resolution output.
 */
export function makeSource(rgba, w, h, geo = {}) {
  return { rgba, w, h, n: w * h, k: geo.k || 1, gx: geo.gx || 0, gy: geo.gy || 0, GW: geo.GW || w, GH: geo.GH || h, cache: {} };
}
function srcLuma(S) { return S.cache.L || (S.cache.L = lumaOf(S.rgba, S.n)); }
function baseBlur(S) {
  if (S.cache.base) return S.cache.base;
  const b = Float32Array.from(srcLuma(S));
  gaussBlur(b, S.w, S.h, Math.max(S.GW, S.GH) / 55 * S.k);
  return (S.cache.base = b);
}
function fineBlur(S) {
  if (S.cache.fine) return S.cache.fine;
  const b = Float32Array.from(srcLuma(S));
  gaussBlur(b, S.w, S.h, 1.1 * S.k);
  return (S.cache.fine = b);
}
/** Edge-preserving denoise (self-guided filter per channel). */
function denoised(S) {
  if (S.cache.den) return S.cache.den;
  const { w, h, n, rgba } = S;
  const out = new Uint8ClampedArray(rgba.length);
  const r = Math.max(1, Math.round(2 * S.k));
  const eps = 0.0035;
  const tmp = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    const I = new Float32Array(n);
    for (let i = 0; i < n; i++) I[i] = rgba[i * 4 + c] / 255;
    const mI = boxBlur(Float32Array.from(I), w, h, r, tmp);
    const II = new Float32Array(n);
    for (let i = 0; i < n; i++) II[i] = I[i] * I[i];
    boxBlur(II, w, h, r, tmp);
    const a = II, b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = II[i] - mI[i] * mI[i]; const ai = v / (v + eps); a[i] = ai; b[i] = mI[i] - ai * mI[i]; }
    boxBlur(a, w, h, r, tmp); boxBlur(b, w, h, r, tmp);
    for (let i = 0; i < n; i++) out[i * 4 + c] = (a[i] * I[i] + b[i]) * 255 + 0.5;
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = rgba[i * 4 + 3];
  return (S.cache.den = out);
}

/* ---------------- the pipeline ---------------- */

function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const lr = 0.213, lg = 0.715, lb = 0.072;
  return [
    lr + c * (1 - lr) + s * -lr, lg + c * -lg + s * -lg, lb + c * -lb + s * (1 - lb),
    lr + c * -lr + s * 0.143, lg + c * (1 - lg) + s * 0.14, lb + c * -lb + s * -0.283,
    lr + c * -lr + s * -(1 - lr), lg + c * -lg + s * lg, lb + c * (1 - lb) + s * lb,
  ];
}

/** Prepare everything that depends only on the parameters (cheap; reuse across frames). */
export function prepareAdjust(p) {
  const f = FILTERS.find((x) => x.id === p.filter) || FILTERS[0];
  const fl = f.p ? buildLUTs({ ...defaultAdjust(), ...f.p }, false) : null;
  return {
    p,
    luts: buildLUTs(p),
    filter: f.id === 'original' || !(p.filterAmount > 0) ? null : { f, luts: fl, amt: p.filterAmount / 100, sat: 1 + (f.p?.saturation || 0) / 100, vib: (f.p?.vibrance || 0) / 100, mono: f.mono || null },
    hue: p.hue ? hueMatrix(p.hue * 1.8) : null,
  };
}

/**
 * Run the adjustments: S (makeSource) → out RGBA bytes (alpha copied from source).
 * `prep` from prepareAdjust(p).
 */
export function applyAdjust(S, prep, out) {
  const { p, luts } = prep;
  const { rgba, n, w, h } = S;
  const v100 = (k) => (p[k] || 0) / 100;
  const br = v100('brilliance');
  let sh = v100('shadows'), hl = v100('highlights'), def = v100('definition');
  if (br > 0) { sh += br * 0.55; hl -= br * 0.45; def += br * 0.18; }
  else if (br < 0) { sh += br * 0.4; hl -= br * 0.3; }
  const local = sh !== 0 || hl !== 0 || def !== 0;
  const nr = v100('noise');
  const sharp = v100('sharpness');
  const sat = 1 + v100('saturation');
  const vib = v100('vibrance');
  const vig = v100('vignette');
  const grain = v100('grain');
  const LR = luts.R, LG = luts.G, LB = luts.B, LL = luts.L;
  const src = nr > 0 ? denoised(S) : null;
  const base = local ? baseBlur(S) : null;
  const Ls = sharp > 0 ? srcLuma(S) : null;
  const fine = sharp > 0 ? fineBlur(S) : null;
  const sharpAmt = sharp * 2.2;
  const hm = prep.hue;
  const fl = prep.filter;
  const gt = grain > 0 ? grainTile() : null;
  const gAmp = grain * 0.16;
  const k = S.k, cxG = S.GW / 2, cyG = S.GH / 2, rxG = S.GW / 2, ryG = S.GH / 2;
  const vigOn = vig !== 0;
  for (let y = 0; y < h; y++) {
    const gyy = S.gy + (y + 0.5) / k;
    const dyv = (gyy - cyG) / ryG;
    const grow = gt ? (((gyy | 0) & 255) << 8) : 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      let r0 = rgba[j], g0 = rgba[j + 1], b0 = rgba[j + 2];
      if (src) { r0 += (src[j] - r0) * nr; g0 += (src[j + 1] - g0) * nr; b0 += (src[j + 2] - b0) * nr; }
      let r = LR[r0 | 0], g = LG[g0 | 0], b = LB[b0 | 0];
      if (local) {
        const L = 0.299 * r + 0.587 * g + 0.114 * b;
        const Bm = LL[(base[i] * 255) | 0];
        let Ln = L;
        if (sh) {
          const wS = 1 - smoothstep(0.0, 0.62, Bm);
          Ln = sh > 0 ? Ln * (1 + sh * 2.2 * wS * wS) + sh * 0.035 * wS : Ln * (1 + sh * 0.75 * wS);
        }
        if (hl) {
          const wH = smoothstep(0.38, 0.98, Bm);
          Ln = hl < 0 ? Ln * (1 + hl * 0.5 * wH) : Ln + hl * 0.45 * wH * (1 - Ln);
        }
        if (def) Ln += def * 1.25 * (L - Bm) * (0.25 + 3 * L * (1 - L));
        const kk = (Ln + 0.012) / (L + 0.012);
        r *= kk; g *= kk; b *= kk;
        // soft highlight desaturation when pushed above 1
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (mx > 1) { const Lq = 0.299 * r + 0.587 * g + 0.114 * b; const t = Math.min(1, (mx - 1) / mx); r += (Lq - r) * t; g += (Lq - g) * t; b += (Lq - b) * t; }
      }
      if (fine) {
        const d = (Ls[i] - fine[i]) * sharpAmt;
        r += d; g += d; b += d;
      }
      if (hm) {
        const R = r, G2 = g, B2 = b;
        r = hm[0] * R + hm[1] * G2 + hm[2] * B2;
        g = hm[3] * R + hm[4] * G2 + hm[5] * B2;
        b = hm[6] * R + hm[7] * G2 + hm[8] * B2;
      }
      if (sat !== 1 || vib !== 0) {
        const L2 = 0.299 * r + 0.587 * g + 0.114 * b;
        let f = sat;
        if (vib) {
          const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
          const S2 = mx > 0.001 ? (mx - mn) / mx : 0;
          const skin = r > g && g > b && S2 > 0.1 && S2 < 0.6 ? 0.5 : 1;
          f *= 1 + vib * (vib > 0 ? (1 - S2) * (1 - S2) * 1.2 * skin : 1);
        }
        r = L2 + (r - L2) * f; g = L2 + (g - L2) * f; b = L2 + (b - L2) * f;
      }
      if (vigOn) {
        const dx = (S.gx + (x + 0.5) / k - cxG) / rxG;
        const rr = Math.sqrt(dx * dx + dyv * dyv);
        const m = smoothstep(0.35, 1.42, rr);
        if (vig > 0) { const f = 1 - vig * 0.8 * m; r *= f; g *= f; b *= f; }
        else { const f = -vig * 0.65 * m; r += (1 - r) * f; g += (1 - g) * f; b += (1 - b) * f; }
      }
      if (gt) {
        const L3 = 0.299 * r + 0.587 * g + 0.114 * b;
        const nz = gt[grow | (((S.gx + x / k) | 0) & 255)] * gAmp * (0.35 + 2.6 * clamp01(L3) * (1 - clamp01(L3)));
        r += nz; g += nz; b += nz;
      }
      if (fl) {
        const ri = r <= 0 ? 0 : r >= 1 ? 255 : (r * 255 + 0.5) | 0, gi = g <= 0 ? 0 : g >= 1 ? 255 : (g * 255 + 0.5) | 0, bi = b <= 0 ? 0 : b >= 1 ? 255 : (b * 255 + 0.5) | 0;
        let fr = fl.luts.R[ri], fg = fl.luts.G[gi], fb = fl.luts.B[bi];
        if (fl.mono) {
          const m = 0.3 * fr + 0.59 * fg + 0.11 * fb;
          fr = m * fl.mono[0]; fg = m * fl.mono[1]; fb = m * fl.mono[2];
        } else if (fl.sat !== 1 || fl.vib) {
          const L4 = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          const mx = fr > fg ? (fr > fb ? fr : fb) : (fg > fb ? fg : fb), mn = fr < fg ? (fr < fb ? fr : fb) : (fg < fb ? fg : fb);
          const S4 = mx > 0.001 ? (mx - mn) / mx : 0;
          const f = fl.sat * (1 + fl.vib * (1 - S4));
          fr = L4 + (fr - L4) * f; fg = L4 + (fg - L4) * f; fb = L4 + (fb - L4) * f;
        }
        const a = fl.amt;
        r += (fr - r) * a; g += (fg - g) * a; b += (fb - b) * a;
      }
      out[j] = r * 255 + 0.5; out[j + 1] = g * 255 + 0.5; out[j + 2] = b * 255 + 0.5; out[j + 3] = rgba[j + 3];
    }
  }
  return out;
}

/* ---------------- histogram & auto ---------------- */

export function histogram(rgba, n, mask = null, step = 2) {
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  for (let i = 0; i < n; i += step) {
    if (mask && mask[i] < 128) continue;
    const j = i * 4;
    r[rgba[j]]++; g[rgba[j + 1]]++; b[rgba[j + 2]]++;
    l[(rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114) | 0]++;
  }
  return { r, g, b, l };
}

/** Sensible starting values from the histogram of the source (optionally only where mask ≥ 50%). */
export function autoAdjust(rgba, n, mask = null) {
  const H = histogram(rgba, n, mask, 3);
  let total = 0;
  for (let v = 0; v < 256; v++) total += H.l[v];
  if (!total) return {};
  const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += H.l[v]; if (acc >= q * total) return v / 255; } return 1; };
  const p1 = pct(0.01), p5 = pct(0.05), p10 = pct(0.1), p50 = pct(0.5), p95 = pct(0.95), p99 = pct(0.99);
  let mr = 0, mg = 0, mb = 0, sat = 0, c = 0;
  let ca = 0;
  for (let i = 0; i < n; i += 7) {
    const j = i * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    mr += r; mg += g; mb += b; ca++; // colour cast: the whole photo (lighting is global)
    if (mask && mask[i] < 128) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0; c++;
  }
  mr /= ca; mg /= ca; mb /= ca; sat /= c || 1;
  const out = {};
  out.exposure = Math.round(clamp((0.47 - p50) * 120, -45, 45));
  out.blackPoint = p1 > 0.05 ? Math.round(clamp((p1 - 0.03) * 160, 0, 20)) : p1 < 0.004 ? -6 : 0;
  out.highlights = p99 > 0.96 ? -Math.round(clamp((p99 - 0.88) * 260, 0, 45)) : 0;
  out.shadows = p10 < 0.14 ? Math.round(clamp((0.16 - p10) * 220, 0, 40)) : 0;
  const spread = p95 - p5;
  out.contrast = spread < 0.65 ? Math.round(clamp((0.72 - spread) * 60, 0, 22)) : 0;
  out.brilliance = 12;
  out.vibrance = sat < 0.25 ? 22 : 10;
  const cast = (mb - mr) / Math.max(1, mr + mb);
  out.warmth = Math.abs(cast) > 0.05 ? Math.round(clamp(cast * 110, -15, 15)) : 0;
  out.definition = 8;
  return out;
}

export { percentile };
