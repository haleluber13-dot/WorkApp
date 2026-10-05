// Photo studio — "Tattoo look": turn the (adjusted) photo into tattoo-ready ink on a transparent background.
// White / near-white becomes transparent (bare skin). Every look works in global working-pixel coordinates
// (geo.k = output px per working px, geo.gx/gy = offset) so patterns match between preview and final output.

import { clamp, clamp01, smoothstep, gaussBlur, boxBlur, lumaOf, components, hash2, rng, percentile, gradientMag } from './util.js';

const INK = '#151515';
const STENCIL = '#3d2c8d';

// control: [key, label, min, max, default]  (all 0..100 unless noted); 'ink' adds the ink colour picker
export const LOOKS = [
  { id: 'photo', label: 'Photo', desc: 'The photo as it is', controls: [['white', 'Remove white', 0, 100, 0]] },
  { id: 'bw', label: 'Black & grey', desc: 'Tonal shading in one ink', ink: INK, controls: [['density', 'Ink density', 0, 100, 85], ['contrast', 'Contrast', -100, 100, 15], ['cut', 'Skin highlights', 0, 100, 25], ['soft', 'Smoothing', 0, 100, 10]] },
  { id: 'lineart', label: 'Line art', desc: 'Clean outlines from the edges', ink: INK, controls: [['detail', 'Detail', 0, 100, 55], ['weight', 'Line weight', 0, 100, 35], ['threshold', 'Sensitivity', 0, 100, 55], ['shape', 'Outline shape', 0, 100, 100], ['smooth', 'Clean up', 0, 100, 40], ['fill', 'Fill darks', 0, 100, 0]] },
  { id: 'stencil', label: 'Stencil', desc: 'Thermal stencil outline', ink: STENCIL, controls: [['detail', 'Detail', 0, 100, 45], ['weight', 'Line weight', 0, 100, 30], ['threshold', 'Sensitivity', 0, 100, 50], ['shape', 'Outline shape', 0, 100, 100], ['shadows', 'Shadow outlines', 0, 100, 30], ['smooth', 'Clean up', 0, 100, 55]] },
  { id: 'dotwork', label: 'Dotwork', desc: 'Stippled shading', ink: INK, controls: [['size', 'Dot size', 0, 100, 35], ['density', 'Density', 0, 100, 60], ['contrast', 'Contrast', -100, 100, 20], ['cut', 'Skin highlights', 0, 100, 20], ['outline', 'Outline', 0, 100, 0]] },
  { id: 'blackwork', label: 'Blackwork', desc: 'Bold solid black', ink: INK, controls: [['threshold', 'Threshold', 0, 100, 50], ['smooth', 'Smoothing', 0, 100, 40], ['specks', 'Remove specks', 0, 100, 40], ['mid', 'Mid-tone lines', 0, 100, 0]] },
  { id: 'sketch', label: 'Sketch', desc: 'Pencil hatching', ink: INK, controls: [['spacing', 'Line spacing', 0, 100, 35], ['dark', 'Darkness', 0, 100, 75], ['outline', 'Outline', 0, 100, 70], ['rough', 'Roughness', 0, 100, 40]] },
  { id: 'engraving', label: 'Engraving', desc: 'Line-screen shading', ink: INK, controls: [['spacing', 'Line spacing', 0, 100, 40], ['angle', 'Angle', 0, 180, 35], ['contrast', 'Contrast', -100, 100, 20], ['wave', 'Follow shape', 0, 100, 45]] },
  { id: 'posterize', label: 'Posterize', desc: 'Flat colour tones (neo-trad)', controls: [['tones', 'Tones', 2, 12, 5], ['smooth', 'Smoothing', 0, 100, 50], ['outline', 'Outline', 0, 100, 45], ['sat', 'Saturation', -100, 100, 20]] },
  { id: 'watercolor', label: 'Watercolor', desc: 'Soft colour washes on skin', controls: [['bleed', 'Bleed', 0, 100, 55], ['pigment', 'Pigment', 0, 100, 60], ['washes', 'Wash layers', 0, 100, 55], ['texture', 'Granulation', 0, 100, 50], ['outline', 'Outline', 0, 100, 30]] },
];

export function defaultLook(id = 'photo') {
  const L = LOOKS.find((l) => l.id === id) || LOOKS[0];
  const p = { id: L.id, strength: 100 };
  for (const c of L.controls) p[c[0]] = c[4];
  if (L.ink) p.ink = L.ink;
  return p;
}

export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0x151515;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ---------------- helpers ---------------- */

/** Edge-preserving smoothing of a single channel (self guided filter). */
function guidedSelf(I, w, h, r, eps) {
  const n = w * h, tmp = new Float32Array(n);
  const mI = boxBlur(Float32Array.from(I), w, h, r, tmp);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) II[i] = I[i] * I[i];
  boxBlur(II, w, h, r, tmp);
  const a = II, b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = II[i] - mI[i] * mI[i]; const ai = v / (v + eps); a[i] = ai; b[i] = mI[i] - ai * mI[i]; }
  boxBlur(a, w, h, r, tmp); boxBlur(b, w, h, r, tmp);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = a[i] * I[i] + b[i];
  return q;
}

function contrastCurve(t, c) {
  if (!c) return t;
  if (c > 0) { const e = 1 + c * 2; return t < 0.5 ? 0.5 * Math.pow(2 * t, e) : 1 - 0.5 * Math.pow(2 - 2 * t, e); }
  return 0.5 + (t - 0.5) * (1 + c * 0.7);
}

/** Remove connected ink blobs smaller than minArea (alpha map in place). */
function despeckle(A, w, h, minArea) {
  if (minArea < 2) return A;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = A[i] > 0.35 ? 1 : 0;
  const cc = components(on, w, h, true);
  // soft pixels inherit the label of an adjacent solid pixel: approximate by dilating the "remove" set
  const kill = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) { const l = cc.labels[i]; if (l && cc.sizes[l] < minArea) kill[i] = 1; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (kill[i]) { A[i] = 0; continue; }
    if (A[i] > 0 && A[i] <= 0.35) {
      let near = false, keep = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (kill[j]) near = true; else if (on[j]) keep = true;
      }
      if (near && !keep) A[i] = 0;
    }
  }
  return A;
}

/** Thicken a line alpha map by ~r px (soft dilation: blur, then re-threshold with AA). */
function thicken(A, w, h, r) {
  if (r <= 0.05) return A;
  const B = Float32Array.from(A);
  gaussBlur(B, w, h, r);
  const t = clamp(0.5 / (1 + r), 0.08, 0.45);
  for (let i = 0; i < A.length; i++) A[i] = Math.max(A[i], smoothstep(t * 0.5, t * 1.4, B[i]));
  return A;
}

/** DoG edge lines (dark side). L = luminance; C = optional chroma planes [a, b] for colour edges. */
function dogLines(L, w, h, sigma, sens, C = null) {
  sigma = Math.max(0.65, sigma);
  const G1 = Float32Array.from(L), G2 = Float32Array.from(L);
  gaussBlur(G1, w, h, sigma); gaussBlur(G2, w, h, sigma * 1.6);
  const eps = 0.0025 + (1 - sens) * 0.022;
  const A = new Float32Array(w * h);
  for (let i = 0; i < A.length; i++) { const d = G2[i] - G1[i]; A[i] = smoothstep(eps, eps * 2 + 0.004, d); }
  if (C) {
    // colour edges (both sides of a hue change are equally "dark"): use |DoG| on chroma, thinner
    for (const P of C) {
      const H1 = Float32Array.from(P), H2 = Float32Array.from(P);
      gaussBlur(H1, w, h, sigma); gaussBlur(H2, w, h, sigma * 1.6);
      const e2 = eps * 1.6;
      // keep only one side of the edge: where the luminance is lower than its surroundings or equal
      for (let i = 0; i < A.length; i++) {
        const d = H1[i] - H2[i];
        if (d > 0) { const a = smoothstep(e2, e2 * 2 + 0.006, d); if (a > A[i]) A[i] = a; }
      }
    }
  }
  return { A, G1 };
}

/** Chroma planes (opponent colours) for colour-aware edges. */
function chromaPlanes(rgba, n) {
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, bl = rgba[i * 4 + 2] / 255;
    a[i] = (r - g) * 0.5; b[i] = ((r + g) * 0.5 - bl) * 0.5;
  }
  return [a, b];
}

/** Stretch luminance to the 1st..99th percentile of the kept area (mask) — makes looks robust to exposure. */
function normalizeTones(L, n, mask) {
  const hist = new Uint32Array(256);
  let tot = 0;
  for (let i = 0; i < n; i += 2) { if (mask && mask[i] < 128) continue; hist[Math.min(255, (L[i] * 255) | 0)]++; tot++; }
  if (tot < 50) return L;
  const pct = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= q * tot) return v / 255; } return 1; };
  const lo = pct(0.01), hi = pct(0.995);
  if (hi - lo < 0.05) return L;
  const lo2 = Math.min(lo, 0.08), hi2 = Math.max(hi, 0.85); // don't over-stretch already good photos
  const nlo = lo - (lo - lo2) * 0.4, nhi = hi + (hi2 - hi) * 0.4;
  const out = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) out[i] = clamp01((L[i] - nlo) / (nhi - nlo));
  return out;
}

/** Otsu threshold of L inside the mask. */
function otsuL(L, n, mask) {
  const hist = new Float64Array(256);
  let tot = 0;
  for (let i = 0; i < n; i += 2) { if (mask && mask[i] < 128) continue; hist[Math.min(255, (L[i] * 255) | 0)]++; tot++; }
  if (!tot) return 0.5;
  let sumAll = 0; for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = tot - wB; if (!wF) break;
    sumB += t * hist[t];
    const v = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return thr / 255;
}

/* blue-noise ranks (32×32 void-and-cluster style) for evenly spread stipples */
let BLUE = null;
function blueNoise() {
  if (BLUE) return BLUE;
  const N = 32, n = N * N, rank = new Float32Array(n), on = new Uint8Array(n), E = new Float32Array(n);
  const r = rng(12345);
  const sig = 1.6, R = 6;
  const add = (i, s) => {
    const x = i % N, y = (i / N) | 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const j = ((y + dy + N) % N) * N + ((x + dx + N) % N);
      E[j] += s * Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig));
    }
  };
  for (let k = 0; k < n; k++) {
    // place the next point at the lowest-energy empty spot (tiny random tie-break)
    let bi = -1, be = 1e9;
    for (let i = 0; i < n; i++) if (!on[i]) { const e = E[i] + r() * 1e-3; if (e < be) { be = e; bi = i; } }
    on[bi] = 1; rank[bi] = (k + 0.5) / n; add(bi, 1);
  }
  return (BLUE = rank);
}

/** A line that traces the edge of the cut-out (inside half survives the mask). px = line width in output px. */
function shapeOutline(mask, w, h, px) {
  const n = w * h, f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = mask[i] / 255;
  gaussBlur(f, w, h, Math.max(0.6, px * 0.75));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = f[i]; out[i] = v <= 0.02 || v >= 0.98 ? 0 : smoothstep(0.15, 0.55, 1 - Math.abs(v - 0.5) * 2.1); }
  return out;
}

/* ---------------- main ---------------- */

/**
 * Render a look. rgba: adjusted pixels (Uint8ClampedArray, w×h). Returns a new Uint8ClampedArray RGBA (straight alpha).
 * geo = { k, gx, gy }.
 */
export function renderLook(rgba, w, h, look, geo = {}) {
  const k = geo.k || 1, gx = geo.gx || 0, gy = geo.gy || 0;
  const n = w * h;
  const id = look.id || 'photo';
  const out = new Uint8ClampedArray(n * 4);
  const ink = hexRgb(look.ink);
  const v = (key, d = 0) => (look[key] ?? d);
  const mask = geo.mask || null;
  const Lraw = lumaOf(rgba, n);
  const L = id === 'photo' || id === 'posterize' || id === 'watercolor' ? Lraw : normalizeTones(Lraw, n, mask);
  const C = id === 'lineart' || id === 'stencil' || id === 'posterize' || id === 'sketch' ? chromaPlanes(rgba, n) : null;
  let A = null; // single-ink alpha
  const S = clamp01((look.strength ?? 100) / 100);

  if (id === 'photo') {
    const wv = v('white') / 100;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      if (wv > 0) {
        const r = rgba[j] / 255, g = rgba[j + 1] / 255, b = rgba[j + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const t = smoothstep(1 - wv * 0.45, 1 - wv * 0.45 + 0.08, mn) * (1 - smoothstep(0.08, 0.25, mx - mn));
        out[j] = rgba[j]; out[j + 1] = rgba[j + 1]; out[j + 2] = rgba[j + 2]; out[j + 3] = rgba[j + 3] * (1 - t);
      } else { out[j] = rgba[j]; out[j + 1] = rgba[j + 1]; out[j + 2] = rgba[j + 2]; out[j + 3] = rgba[j + 3]; }
    }
    return out;
  }

  if (id === 'bw') {
    let Lw = L;
    if (v('soft') > 0) { Lw = guidedSelf(L, w, h, Math.max(1, Math.round((1 + v('soft') / 25) * k)), 0.002 + v('soft') / 100 * 0.01); }
    const dens = v('density') / 100, con = v('contrast') / 100, cut = v('cut') / 100 * 0.45;
    const lut = new Float32Array(1025);
    for (let q = 0; q <= 1024; q++) {
      let t = 1 - q / 1024;
      t = contrastCurve(t, con);
      t = clamp01((t - cut) / (1 - cut));
      lut[q] = Math.pow(t, 0.9) * dens;
    }
    A = new Float32Array(n);
    for (let i = 0; i < n; i++) { const l = Lw[i]; A[i] = lut[l <= 0 ? 0 : l >= 1 ? 1024 : (l * 1024) | 0]; }
  }

  else if (id === 'lineart' || id === 'stencil') {
    const sm = v('smooth') / 100;
    let Ls = L;
    if (sm > 0) Ls = guidedSelf(L, w, h, Math.max(1, Math.round((1 + sm * 3) * k)), 0.0008 + sm * 0.006);
    const sigma = (0.6 + (1 - v('detail') / 100) * 2.4) * k;
    const { A: lines, G1 } = dogLines(Ls, w, h, sigma, v('threshold') / 100, C);
    A = lines;
    // a little cleanup of tiny fragments, scaled with resolution
    despeckle(A, w, h, Math.round((4 + sm * 40) * k * k));
    if (id === 'stencil' && v('shadows') > 0) {
      // iso-contour of the dark areas (outline of shadows), like a stencil artist would trace
      const B = Float32Array.from(G1);
      gaussBlur(B, w, h, 2 * k);
      const thr = 0.18 + v('shadows') / 100 * 0.3;
      const g = gradientMag(B, w, h);
      for (let i = 0; i < n; i++) {
        const d = Math.abs(B[i] - thr) / (g[i] * 0.25 + 1e-4);
        const line = clamp01(1 - (d - 0.6 * k) / (0.8 * k));
        if (line > A[i]) A[i] = line;
      }
    }
    thicken(A, w, h, (v('weight') / 100) * 2.6 * k);
    if (mask && v('shape') > 0) {
      const lw = (1.2 + (v('weight') / 100) * 3.2) * k * 2;
      const O = shapeOutline(mask, w, h, lw), o = v('shape') / 100;
      for (let i = 0; i < n; i++) if (O[i] * o > A[i]) A[i] = O[i] * o;
    }
    if (id === 'lineart' && v('fill') > 0) {
      const ft = v('fill') / 100 * 0.45;
      for (let i = 0; i < n; i++) A[i] = Math.max(A[i], smoothstep(ft + 0.03, ft - 0.03, G1[i]));
    }
    if (id === 'stencil') for (let i = 0; i < n; i++) A[i] = smoothstep(0.25, 0.6, A[i]); // crisp single-ink lines
  }

  else if (id === 'dotwork') {
    const R = (0.55 + v('size') / 100 * 2.6);       // dot radius (working px)
    const sp = R * 2.15;                              // grid spacing (working px)
    const dens = 0.25 + v('density') / 100 * 1.1, con = v('contrast') / 100, cut = v('cut') / 100 * 0.5;
    const Lb = Float32Array.from(L);
    gaussBlur(Lb, w, h, sp * 0.45 * k);
    A = new Float32Array(n);
    // grid cells covering this buffer in global working coords
    const gx0 = Math.floor(gx / sp) - 1, gy0 = Math.floor(gy / sp) - 1;
    const gx1 = Math.ceil((gx + w / k) / sp) + 1, gy1 = Math.ceil((gy + h / k) / sp) + 1;
    const rp = R * k;
    const BN = blueNoise();
    for (let cy = gy0; cy <= gy1; cy++) for (let cx = gx0; cx <= gx1; cx++) {
      const jx = hash2(cx, cy, 11), jy = hash2(cx, cy, 23), pr = BN[(((cy % 32) + 32) % 32) * 32 + (((cx % 32) + 32) % 32)];
      const px = ((cx + 0.3 + jx * 0.4) * sp - gx) * k, py = ((cy + 0.3 + jy * 0.4) * sp - gy) * k;
      const ix = Math.round(px), iy = Math.round(py);
      if (ix < -rp - 2 || iy < -rp - 2 || ix > w + rp + 2 || iy > h + rp + 2) continue;
      const si = clamp(iy, 0, h - 1) * w + clamp(ix, 0, w - 1);
      if (mask && mask[si] < 8) continue;
      let t = 1 - Lb[si];
      t = contrastCurve(t, con);
      t = clamp01((t - cut) / (1 - cut));
      if (pr >= t * dens) continue;
      const rr = rp * (0.75 + 0.35 * t);
      const x0 = Math.max(0, Math.floor(px - rr - 1)), x1 = Math.min(w - 1, Math.ceil(px + rr + 1));
      const y0 = Math.max(0, Math.floor(py - rr - 1)), y1 = Math.min(h - 1, Math.ceil(py + rr + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        const a = clamp01(rr + 0.5 - d);
        const i = y * w + x;
        if (a > A[i]) A[i] = a;
      }
    }
    if (v('outline') > 0) {
      const { A: lines } = dogLines(L, w, h, 1.4 * k, 0.5);
      despeckle(lines, w, h, Math.round(20 * k * k));
      const o = v('outline') / 100;
      for (let i = 0; i < n; i++) A[i] = Math.max(A[i], lines[i] * o);
    }
  }

  else if (id === 'blackwork') {
    const sm = v('smooth') / 100;
    const Lb = sm > 0 ? guidedSelf(L, w, h, Math.max(1, Math.round((1 + sm * 5) * k)), 0.002 + sm * 0.02) : Float32Array.from(L);
    gaussBlur(Lb, w, h, (0.6 + sm * 2.2) * k);
    const T = clamp(otsuL(Lb, n, mask) + (v('threshold') - 50) / 100 * 0.6, 0.04, 0.96);
    const d = 0.025 / Math.max(0.6, k);
    A = new Float32Array(n);
    for (let i = 0; i < n; i++) A[i] = smoothstep(T + d, T - d, Lb[i]);
    despeckle(A, w, h, Math.round(v('specks') * 3 * k * k));
    // fill tiny holes too (symmetry with specks)
    if (v('specks') > 0) {
      const inv = new Float32Array(n);
      for (let i = 0; i < n; i++) inv[i] = 1 - A[i];
      despeckle(inv, w, h, Math.round(v('specks') * 3 * k * k));
      for (let i = 0; i < n; i++) A[i] = 1 - inv[i];
    }
    if (v('mid') > 0) {
      const T2 = Math.min(0.95, T + 0.12 + v('mid') / 100 * 0.25);
      const P = 4.2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = smoothstep(T2 + 0.03, T2 - 0.03, Lb[i]);
        if (m <= 0) continue;
        const gxx = gx + (x + 0.5) / k, gyy = gy + (y + 0.5) / k;
        const ph = ((gxx + gyy) / P) % 1;
        const dist = Math.abs(ph - 0.5) * P * k;
        const line = clamp01(0.75 * k - dist + 0.5);
        A[i] = Math.max(A[i], line * m);
      }
    }
  }

  else if (id === 'sketch') {
    const P = (3 + v('spacing') / 100 * 7);
    const dark = 0.4 + v('dark') / 100 * 0.6;
    const rough = v('rough') / 100;
    const Lb = Float32Array.from(L);
    gaussBlur(Lb, w, h, 1.2 * k);
    const TH = [0.82, 0.62, 0.42, 0.24], ANG = [0.785, -0.785, 0, 1.57];
    const CS = ANG.map(Math.cos), SN = ANG.map(Math.sin), SEG = TH.map((_, l) => 14 + l * 3);
    const ih = (a, b) => { let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    A = new Float32Array(n);
    const invP = 1 / P;
    for (let y = 0; y < h; y++) {
      const gyy = gy + (y + 0.5) / k;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = Lb[i];
        if (t > 0.86 || (mask && !mask[i])) continue;
        const gxx = gx + (x + 0.5) / k;
        let a = 0;
        for (let l = 0; l < 4; l++) {
          const th = TH[l];
          if (t > th) break;
          const m = t < th - 0.08 ? 1 : smoothstep(th, th - 0.08, t);
          const u = gxx * CS[l] + gyy * SN[l], vv = -gxx * SN[l] + gyy * CS[l];
          const seg = Math.floor(vv / SEG[l]);
          const wob = rough * 0.6 * Math.sin(vv * 0.21 + seg * 1.7 + l);
          let ph = (u + wob) * invP + ih(seg, l * 7 + 5);
          ph -= Math.floor(ph);
          const dist = Math.abs(ph - 0.5) * P;
          const press = 0.7 + 0.3 * ih(seg * 31 + l, Math.floor(u * invP));
          const line = clamp01((0.75 - dist) * k + 0.5) * press;
          if (line * m > a) a = line * m;
        }
        A[i] = a * dark;
      }
    }
    if (v('outline') > 0) {
      const { A: lines } = dogLines(L, w, h, 1.1 * k, 0.55, C);
      despeckle(lines, w, h, Math.round(12 * k * k));
      const o = v('outline') / 100;
      const O = mask ? shapeOutline(mask, w, h, 2.2 * k) : null;
      for (let i = 0; i < n; i++) {
        const gr = 0.75 + 0.25 * hash2((gx + i % w / k) | 0, (gy + (i / w) / k) | 0, 3);
        A[i] = Math.max(A[i], Math.max(lines[i], O ? O[i] * 0.9 : 0) * o * gr);
      }
    }
  }

  else if (id === 'engraving') {
    const P = 3.2 + v('spacing') / 100 * 7;
    const ang = (v('angle') * Math.PI) / 180, c = Math.cos(ang), s = Math.sin(ang);
    const con = v('contrast') / 100, wave = v('wave') / 100;
    const Lb = Float32Array.from(L);
    gaussBlur(Lb, w, h, 0.8 * k);
    const Lw = Float32Array.from(L);
    gaussBlur(Lw, w, h, 12 * k);
    A = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) continue;
      const gxx = gx + (x + 0.5) / k, gyy = gy + (y + 0.5) / k;
      let t = contrastCurve(1 - Lb[i], con);
      const ph = (gxx * c + gyy * s) / P + wave * Lw[i] * 6;
      const f = ph - Math.floor(ph);
      const dist = Math.abs(f - 0.5) * P;                 // working px from the line centre
      const half = t * P * 0.5;                            // line half-width grows with darkness
      A[i] = clamp01((half - dist) * k + 0.5) * smoothstep(0.02, 0.1, t);
    }
  }

  else if (id === 'posterize' || id === 'watercolor') {
    // colour planes
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i] = rgba[i * 4] / 255; G[i] = rgba[i * 4 + 1] / 255; B[i] = rgba[i * 4 + 2] / 255; }
    let sm;
    if (id === 'posterize') sm = v('smooth') / 100; else sm = v('bleed') / 100;
    const r = Math.max(1, Math.round((1 + sm * (id === 'watercolor' ? 9 : 5)) * k));
    const eps = id === 'watercolor' ? 0.004 + sm * 0.03 : 0.002 + sm * 0.012;
    let Rs = guidedSelf(R, w, h, r, eps), Gs = guidedSelf(G, w, h, r, eps), Bs = guidedSelf(B, w, h, r, eps);
    if (id === 'watercolor') { const sg = (0.5 + sm * 2.5) * k; gaussBlur(Rs, w, h, sg); gaussBlur(Gs, w, h, sg); gaussBlur(Bs, w, h, sg); }
    if (id === 'posterize') {
      const N = clamp(Math.round(v('tones', 5)), 2, 16);
      // k-means palette (deterministic, on a subsample)
      const samp = [];
      const step = Math.max(1, Math.floor(n / 9000));
      for (let i = 0; i < n; i += step) if (!mask || mask[i] > 127) samp.push(i);
      if (samp.length < N * 4) for (let i = 0; i < n; i += step) samp.push(i);
      const rnd = rng(4);
      const C = [];
      for (let q = 0; q < N; q++) { const i = samp[Math.floor((q + 0.5) / N * samp.length)] ; C.push([Rs[i], Gs[i], Bs[i]]); }
      // spread initial centres by luminance order
      const order = samp.slice().sort((a, b) => (Rs[a] + Gs[a] + Bs[a]) - (Rs[b] + Gs[b] + Bs[b]));
      for (let q = 0; q < N; q++) { const i = order[Math.floor((q + 0.5) / N * order.length)]; C[q] = [Rs[i], Gs[i], Bs[i]]; }
      void rnd;
      for (let it = 0; it < 8; it++) {
        const acc = C.map(() => [0, 0, 0, 0]);
        for (const i of samp) {
          let bk = 0, bd = 1e9;
          for (let q = 0; q < N; q++) { const d = (Rs[i] - C[q][0]) ** 2 + (Gs[i] - C[q][1]) ** 2 + (Bs[i] - C[q][2]) ** 2; if (d < bd) { bd = d; bk = q; } }
          acc[bk][0] += Rs[i]; acc[bk][1] += Gs[i]; acc[bk][2] += Bs[i]; acc[bk][3]++;
        }
        for (let q = 0; q < N; q++) if (acc[q][3]) C[q] = [acc[q][0] / acc[q][3], acc[q][1] / acc[q][3], acc[q][2] / acc[q][3]];
      }
      const satF = 1 + v('sat') / 100;
      for (const c of C) { const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; for (let q = 0; q < 3; q++) c[q] = clamp01(l + (c[q] - l) * satF); }
      const lab = new Uint8Array(n);
      const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N);
      for (let q = 0; q < N; q++) { CR[q] = C[q][0]; CG[q] = C[q][1]; CB[q] = C[q][2]; }
      for (let i = 0; i < n; i++) {
        const r = Rs[i], g = Gs[i], b = Bs[i];
        let bk = 0, bd = 1e9;
        for (let q = 0; q < N; q++) { const dr = r - CR[q], dg = g - CG[q], db = b - CB[q]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bk = q; } }
        lab[i] = bk;
      }
      // anti-aliased region boundaries: average the quantised colour over a tiny window
      const Qr = new Float32Array(n), Qg = new Float32Array(n), Qb = new Float32Array(n);
      for (let i = 0; i < n; i++) { const c = C[lab[i]]; Qr[i] = c[0]; Qg[i] = c[1]; Qb[i] = c[2]; }
      if (k >= 0.75) { gaussBlur(Qr, w, h, 0.6 * k); gaussBlur(Qg, w, h, 0.6 * k); gaussBlur(Qb, w, h, 0.6 * k); }
      // outlines: boundaries between palette regions with a big luminance step + DoG
      let lines = null;
      if (v('outline') > 0) {
        const Lq = new Float32Array(n);
        for (let i = 0; i < n; i++) Lq[i] = 0.299 * Rs[i] + 0.587 * Gs[i] + 0.114 * Bs[i];
        lines = dogLines(Lq, w, h, 1.2 * k, 0.55).A;
        despeckle(lines, w, h, Math.round(25 * k * k));
        thicken(lines, w, h, (v('outline') / 100) * 1.6 * k);
        if (mask) { const O = shapeOutline(mask, w, h, (1.5 + v('outline') / 100 * 3) * k * 2); for (let i = 0; i < n; i++) if (O[i] > lines[i]) lines[i] = O[i]; }
      }
      for (let i = 0; i < n; i++) {
        const qr = Qr[i], qg = Qg[i], qb = Qb[i];
        let aa = Math.max(1 - qr, 1 - qg, 1 - qb), rr = 0, gg = 0, bb = 0;
        if (aa > 1e-4) { rr = 1 - (1 - qr) / aa; gg = 1 - (1 - qg) / aa; bb = 1 - (1 - qb) / aa; } else aa = 0;
        aa *= smoothstep(0.02, 0.09, aa);
        if (lines && lines[i] > 0) {
          const o = lines[i];
          const na = aa + o * (1 - aa);
          rr = (rr * aa * (1 - o) + 0.07 * o) / (na || 1); gg = (gg * aa * (1 - o) + 0.07 * o) / (na || 1); bb = (bb * aa * (1 - o) + 0.07 * o) / (na || 1);
          aa = na;
        }
        const j = i * 4;
        out[j] = rr * 255; out[j + 1] = gg * 255; out[j + 2] = bb * 255; out[j + 3] = aa * 255 * (rgba[j + 3] / 255);
      }
    } else {
      // watercolour: pigment pooling at edges, paper texture, soft granulation
      const pig = 0.25 + v('pigment') / 100 * 0.85, tex = v('texture') / 100, washes = v('washes', 55) / 100;
      const nW = 3 + Math.round((1 - washes) * 5);
      const Lq = new Float32Array(n);
      for (let i = 0; i < n; i++) Lq[i] = 0.299 * Rs[i] + 0.587 * Gs[i] + 0.114 * Bs[i];
      const Lb2 = Float32Array.from(Lq);
      gaussBlur(Lb2, w, h, 3 * k);
      let lines = null;
      if (v('outline') > 0) {
        lines = dogLines(L, w, h, 1.3 * k, 0.45).A;
        despeckle(lines, w, h, Math.round(30 * k * k));
      }
      const o = v('outline') / 100;
      const ih = (a, b) => { let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ 77; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
      for (let y = 0; y < h; y++) {
        const ny = (gy + (y + 0.5) / k) / 3, yi = Math.floor(ny), fy = ny - yi;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          // paper: value noise via hash
          const nx = (gx + (x + 0.5) / k) / 3;
          const xi = Math.floor(nx), fx = nx - xi;
          const pn = (ih(xi, yi) * (1 - fx) + ih(xi + 1, yi) * fx) * (1 - fy) + (ih(xi, yi + 1) * (1 - fx) + ih(xi + 1, yi + 1) * fx) * fy;
          const edge = clamp01((Lq[i] - Lb2[i]) * -6);        // darker side of edges pools pigment
          const qr = Rs[i], qg = Gs[i], qb = Bs[i];
          let aa = Math.max(1 - qr, 1 - qg, 1 - qb), rr = 0, gg = 0, bb = 0;
          if (aa > 1e-4) { rr = 1 - (1 - qr) / aa; gg = 1 - (1 - qg) / aa; bb = 1 - (1 - qb) / aa; } else aa = 0;
          // layered washes: soft quantisation of the pigment amount
          if (washes > 0) { const q = aa * nW, fl = Math.floor(q), fr = q - fl; aa = (aa * (1 - washes) + ((fl + smoothstep(0.35, 0.65, fr)) / nW) * washes); }
          // granulation: pigment settles in the paper texture, more in the darker washes
          const gr = ih(Math.floor(nx * 3), Math.floor(ny * 3)) - 0.5;
          aa = clamp01(aa * pig * (1 + edge * 1.1) * (1 - tex * 0.45 * pn) * (1 + tex * 0.35 * gr));
          aa *= smoothstep(0.02, 0.08, aa);
          if (lines && lines[i] > 0) {
            const ol = lines[i] * o * 0.85;
            const na = aa + ol * (1 - aa);
            rr = (rr * aa * (1 - ol) + 0.12 * ol) / (na || 1); gg = (gg * aa * (1 - ol) + 0.12 * ol) / (na || 1); bb = (bb * aa * (1 - ol) + 0.14 * ol) / (na || 1);
            aa = na;
          }
          const j = i * 4;
          out[j] = rr * 255; out[j + 1] = gg * 255; out[j + 2] = bb * 255; out[j + 3] = aa * 255 * (rgba[j + 3] / 255);
        }
      }
    }
    if (S < 1) mixWithPhoto(out, rgba, n, S);
    return out;
  }

  // single-ink output
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    out[j] = ink[0]; out[j + 1] = ink[1]; out[j + 2] = ink[2];
    out[j + 3] = clamp01(A[i]) * rgba[j + 3];
  }
  if (S < 1) mixWithPhoto(out, rgba, n, S);
  return out;
}

/** Strength < 100%: blend the look with the photo (premultiplied lerp). */
function mixWithPhoto(out, rgba, n, s) {
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const la = out[j + 3] / 255 * s, pa = rgba[j + 3] / 255 * (1 - s);
    const a = la + pa;
    if (a <= 0) { out[j + 3] = 0; continue; }
    out[j] = (out[j] * la + rgba[j] * pa) / a;
    out[j + 1] = (out[j + 1] * la + rgba[j + 1] * pa) / a;
    out[j + 2] = (out[j + 2] * la + rgba[j + 2] * pa) / a;
    out[j + 3] = a * 255;
  }
}

export { percentile };

/**
 * Same as renderLook, but only processes the kept region (bounding box of mask > 0, plus a margin).
 * Pixels outside the region come back transparent — they are cut away anyway.
 */
export function renderLookROI(rgba, w, h, look, geo = {}) {
  const mask = geo.mask;
  if (!mask || look.id === 'photo') return renderLook(rgba, w, h, look, geo);
  const k = geo.k || 1;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) if (mask[o + x] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return new Uint8ClampedArray(w * h * 4);
  const m = Math.ceil(20 * k) + 2;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  if (rw * rh > w * h * 0.85) return renderLook(rgba, w, h, look, geo);
  const sub = new Uint8ClampedArray(rw * rh * 4), sm = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    sub.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * rw * 4);
    sm.set(mask.subarray((y0 + y) * w + x0, (y0 + y) * w + x1 + 1), y * rw);
  }
  const r = renderLook(sub, rw, rh, look, { ...geo, gx: (geo.gx || 0) + x0 / k, gy: (geo.gy || 0) + y0 / k, mask: sm });
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < rh; y++) out.set(r.subarray(y * rw * 4, (y + 1) * rw * 4), ((y0 + y) * w + x0) * 4);
  return out;
}
