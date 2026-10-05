// Photo studio — the "keep" mask: selection tools and refinements.
// A mask is a Uint8Array (w*h), 255 = keep, 0 = discard, values in between = soft edge.

import { clamp, clamp01, smoothstep, gaussBlur, blur3, distanceTo, components, maskToFloat, floatToMask, rng } from './util.js';

/* ---------------- polygon (lasso) coverage, anti-aliased via canvas ---------------- */

let _pc = null;
function scratch(w, h) {
  if (!_pc) _pc = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  if (_pc.width < w) _pc.width = w;
  if (_pc.height < h) _pc.height = h;
  return _pc;
}

/**
 * Anti-aliased coverage of a closed polygon (image coords) → { x, y, w, h, a: Uint8ClampedArray alpha } clipped to the image.
 * Returns null if empty.
 */
export function polygonCoverage(pts, W, H) {
  if (!pts || pts.length < 3) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1);
  x1 = Math.min(W, Math.ceil(x1) + 1); y1 = Math.min(H, Math.ceil(y1) + 1);
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return null;
  const c = scratch(bw, bh);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bw, bh);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - x0, pts[0][1] - y0);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - x0, pts[i][1] - y0);
  ctx.closePath();
  ctx.fill('nonzero');
  const d = ctx.getImageData(0, 0, bw, bh).data;
  const a = new Uint8ClampedArray(bw * bh);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return { x: x0, y: y0, w: bw, h: bh, a };
}

/** Combine a coverage patch into the mask. mode: 'add' | 'sub' | 'replace' | 'intersect'. Returns dirty rect. */
export function applyCoverage(mask, W, H, cov, mode) {
  if (mode === 'replace') mask.fill(0);
  if (mode === 'intersect') {
    // everything outside the patch goes away
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inside = x >= cov.x && x < cov.x + cov.w && y >= cov.y && y < cov.y + cov.h;
      const i = y * W + x;
      const a = inside ? cov.a[(y - cov.y) * cov.w + (x - cov.x)] : 0;
      mask[i] = (mask[i] * a + 127) / 255;
    }
    return { x: 0, y: 0, w: W, h: H };
  }
  for (let y = 0; y < cov.h; y++) {
    const row = (y + cov.y) * W + cov.x, cr = y * cov.w;
    for (let x = 0; x < cov.w; x++) {
      const a = cov.a[cr + x];
      if (!a) continue;
      const i = row + x;
      if (mode === 'sub') mask[i] = (mask[i] * (255 - a) + 127) / 255;
      else mask[i] = mask[i] + (((255 - mask[i]) * a + 127) / 255);
    }
  }
  return mode === 'replace' ? { x: 0, y: 0, w: W, h: H } : { x: cov.x, y: cov.y, w: cov.w, h: cov.h };
}

/** Merge a full-size soft selection (Uint8 0..255) into the mask. */
export function mergeMask(mask, sel, mode) {
  const n = mask.length;
  if (mode === 'replace') { mask.set(sel); return; }
  for (let i = 0; i < n; i++) {
    const a = sel[i];
    if (mode === 'sub') mask[i] = (mask[i] * (255 - a) + 127) / 255;
    else if (mode === 'intersect') mask[i] = (mask[i] * a + 127) / 255;
    else mask[i] = mask[i] + (((255 - mask[i]) * a + 127) / 255);
  }
}

/* ---------------- magic wand ---------------- */

/**
 * Select pixels similar to the colour at (sx, sy).
 * tol 0..100, contiguous: flood fill vs. global. Returns soft Uint8 selection.
 */
export function magicWand(rgba, W, H, sx, sy, tol = 30, contiguous = true) {
  sx = clamp(Math.round(sx), 0, W - 1); sy = clamp(Math.round(sy), 0, H - 1);
  // seed colour = mean of a 3×3 neighbourhood (noise robustness)
  let r = 0, g = 0, b = 0, c = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = clamp(sx + dx, 0, W - 1), y = clamp(sy + dy, 0, H - 1), i = (y * W + x) * 4;
    r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; c++;
  }
  r /= c; g /= c; b /= c;
  const T = 4 + tol * 1.6;           // full-in threshold (0..255 units)
  const T2 = T * 1.25 + 6;           // soft edge
  const n = W * H;
  const dist = (i) => {
    const dr = rgba[i * 4] - r, dg = rgba[i * 4 + 1] - g, db = rgba[i * 4 + 2] - b;
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.15 + Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) * 0.35;
  };
  const sel = new Float32Array(n);
  const val = (d) => (d <= T ? 1 : d >= T2 ? 0 : 1 - (d - T) / (T2 - T));
  if (!contiguous) {
    for (let i = 0; i < n; i++) sel[i] = val(dist(i));
  } else {
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const s0 = sy * W + sx;
    stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const i = stack[--sp];
      const v = val(dist(i));
      sel[i] = v;
      if (v < 1) continue; // soft pixels are the boundary: don't grow through them
      const x = i % W, y = (i - x) / W;
      if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < W - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && !seen[i - W]) { seen[i - W] = 1; stack[sp++] = i - W; }
      if (y < H - 1 && !seen[i + W]) { seen[i + W] = 1; stack[sp++] = i + W; }
    }
  }
  blur3(sel, W, H);
  return floatToMask(sel);
}

/* ---------------- remove a plain background colour (paper, wall) ---------------- */

/**
 * Model the background as a smooth colour field (handles uneven lighting on paper),
 * then keep only pixels that differ from it. tol 0..100. Returns soft keep-mask.
 */
export function removeBackground(rgba, W, H, { tol = 40, contiguous = false, sample = null } = {}) {
  const n = W * H;
  // 1) background prototypes: border colours (or a tapped sample)
  const protos = [];
  if (sample) protos.push(sample);
  else {
    const bw = Math.max(2, Math.round(Math.min(W, H) * 0.03));
    const pts = [];
    const r = rng(5);
    for (let k = 0; k < 4000; k++) {
      const side = (r() * 4) | 0, t = r();
      let x, y;
      if (side === 0) { x = t * W; y = r() * bw; } else if (side === 1) { x = t * W; y = H - 1 - r() * bw; }
      else if (side === 2) { x = r() * bw; y = t * H; } else { x = W - 1 - r() * bw; y = t * H; }
      const i = ((y | 0) * W + (x | 0)) * 4;
      pts.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
    // k-means k=3
    let C = [pts[0], pts[1333], pts[2666]].map((p) => p.slice());
    let cnt = [0, 0, 0];
    for (let it = 0; it < 8; it++) {
      const acc = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; cnt = [0, 0, 0];
      for (const p of pts) {
        let bk = 0, bd = 1e9;
        for (let k = 0; k < 3; k++) { const d = (p[0] - C[k][0]) ** 2 + (p[1] - C[k][1]) ** 2 + (p[2] - C[k][2]) ** 2; if (d < bd) { bd = d; bk = k; } }
        acc[bk][0] += p[0]; acc[bk][1] += p[1]; acc[bk][2] += p[2]; cnt[bk]++;
      }
      for (let k = 0; k < 3; k++) if (cnt[k]) C[k] = acc[k].map((v) => v / cnt[k]);
    }
    for (let k = 0; k < 3; k++) if (cnt[k] > pts.length * 0.2) protos.push(C[k]);
    if (!protos.length) protos.push(C[cnt.indexOf(Math.max(...cnt))]);
  }
  // chroma-tolerant distance (lighting changes mostly scale brightness)
  const near = (r, g, b) => {
    let best = 1e9;
    for (const p of protos) {
      const s1 = r + g + b + 1, s2 = p[0] + p[1] + p[2] + 1;
      const cr = (r / s1 - p[0] / s2) * 255 * 3, cg = (g / s1 - p[1] / s2) * 255 * 3;
      const dl = Math.abs(s1 - s2) / 3;
      const d = Math.sqrt(cr * cr + cg * cg) + dl * 0.35;
      if (d < best) best = d;
    }
    return best;
  };
  // 2) smooth background field on a coarse grid (robust per-cell median of background-like pixels)
  const G = 28;
  const gw = Math.max(4, Math.round(G * W / Math.max(W, H))), gh = Math.max(4, Math.round(G * H / Math.max(W, H)));
  const cellR = new Float32Array(gw * gh), cellG = new Float32Array(gw * gh), cellB = new Float32Array(gw * gh), ok = new Uint8Array(gw * gh);
  const step = Math.max(1, Math.floor(Math.min(W / gw, H / gh) / 12));
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const xa = Math.floor(cx * W / gw), xb = Math.floor((cx + 1) * W / gw), ya = Math.floor(cy * H / gh), yb = Math.floor((cy + 1) * H / gh);
    const L = [], cols = [];
    let total = 0;
    for (let y = ya; y < yb; y += step) for (let x = xa; x < xb; x += step) {
      const i = (y * W + x) * 4; total++;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (near(r, g, b) < 70) { L.push(r + g + b); cols.push(i); }
    }
    if (L.length > total * 0.25) {
      // take the bright side (ink and shadows are darker than paper): ~70th percentile
      const order = L.map((v, k) => k).sort((a, b) => L[a] - L[b]);
      const lo = Math.floor(order.length * 0.55), hi = Math.max(lo + 1, Math.floor(order.length * 0.85));
      let r = 0, g = 0, b = 0;
      for (let k = lo; k < hi; k++) { const i = cols[order[k]]; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
      const c = hi - lo;
      const k = cy * gw + cx;
      cellR[k] = r / c; cellG[k] = g / c; cellB[k] = b / c; ok[k] = 1;
    }
  }
  // fill missing cells from neighbours (diffusion)
  if (!ok.some((v) => v)) { const p = protos[0]; cellR.fill(p[0]); cellG.fill(p[1]); cellB.fill(p[2]); ok.fill(1); }
  for (let pass = 0; pass < gw + gh; pass++) {
    let missing = 0;
    const nk = ok.slice();
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const k = cy * gw + cx;
      if (ok[k]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const j = y * gw + x;
        if (ok[j]) { r += cellR[j]; g += cellG[j]; b += cellB[j]; c++; }
      }
      if (c) { cellR[k] = r / c; cellG[k] = g / c; cellB[k] = b / c; nk[k] = 1; } else missing++;
    }
    ok.set(nk);
    if (!missing) break;
  }
  gaussBlur(cellR, gw, gh, 0.8); gaussBlur(cellG, gw, gh, 0.8); gaussBlur(cellB, gw, gh, 0.8);
  // 3) per-pixel distance to the local background colour
  const T = 6 + tol * 0.9, T0 = T * 0.55;
  const keep = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    let fy = (y + 0.5) * gh / H - 0.5; fy = clamp(fy, 0, gh - 1);
    const y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      let fx = (x + 0.5) * gw / W - 0.5; fx = clamp(fx, 0, gw - 1);
      const x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const k00 = y0 * gw + x0, k01 = y0 * gw + x1, k10 = y1 * gw + x0, k11 = y1 * gw + x1;
      const bl = (A) => (A[k00] * (1 - tx) + A[k01] * tx) * (1 - ty) + (A[k10] * (1 - tx) + A[k11] * tx) * ty;
      const br = bl(cellR), bg = bl(cellG), bb = bl(cellB);
      const i = y * W + x, r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      // relative darkness (ink on paper) + chroma difference
      const lb = (br + bg + bb) / 3 + 1, lp = (r + g + b) / 3;
      const dark = Math.max(0, (lb - lp) / lb) * 255;
      const light = Math.max(0, (lp - lb) / lb) * 255 * 0.6;
      const s1 = r + g + b + 1, s2 = br + bg + bb + 1;
      const cr = (r / s1 - br / s2) * 255 * 3, cg = (g / s1 - bg / s2) * 255 * 3;
      const d = dark + light + Math.sqrt(cr * cr + cg * cg) * 0.9;
      keep[i] = smoothstep(T0, T, d);
    }
  }
  if (contiguous) {
    // only remove background that is connected to the image border
    const bgOn = new Uint8Array(n);
    for (let i = 0; i < n; i++) bgOn[i] = keep[i] < 0.5 ? 1 : 0;
    const cc = components(bgOn, W, H, false);
    for (let i = 0; i < n; i++) { const l = cc.labels[i]; if (l && !cc.touches[l]) keep[i] = 1; }
  }
  blur3(keep, W, H);
  return floatToMask(keep);
}

/* ---------------- brush ---------------- */

/**
 * Stamp one round dab into a stroke buffer (Float32, max-combined).
 * Options: hardness 0..1, flow 0..1, region (smart brush: Uint8 allowed flag per pixel or null).
 * Returns dirty rect.
 */
export function stampDab(buf, W, H, cx, cy, radius, hardness, flow, allow = null) {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  const inner = r * clamp(hardness, 0, 0.98);
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a;
      if (d >= r + 0.5) continue;
      if (d <= inner) a = 1;
      else if (hardness >= 0.98) a = clamp01(r + 0.5 - d);
      else { const t = (d - inner) / (r - inner + 0.5); a = 1 - smoothstep(0, 1, t); }
      const i = y * W + x;
      if (allow) a *= allow[i] / 255;
      a *= flow;
      if (a > buf[i]) buf[i] = a;
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Smart (edge-aware) brush region: flood from the centre inside the dab without crossing strong edges
 * or big colour changes. Returns a Uint8 "allow" map valid inside the dab's box (other pixels untouched/0).
 */
export function smartRegion(rgba, grad, gradRef, W, H, cx, cy, radius, allow, seedColor) {
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) allow.fill(0, y * W + x0, y * W + x1 + 1);
  const sx = clamp(Math.round(cx), 0, W - 1), sy = clamp(Math.round(cy), 0, H - 1);
  const s0 = sy * W + sx;
  const [sr, sg, sb] = seedColor || [rgba[s0 * 4], rgba[s0 * 4 + 1], rgba[s0 * 4 + 2]];
  const edgeT = Math.max(gradRef * 0.9, 0.35); // absolute floor: sensor noise is not an edge
  const colT = 55;
  const stack = [s0];
  allow[s0] = 255;
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i - x) / W;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      const jx = j % W, jy = (j - jx) / W;
      if (j < 0 || j >= W * H || jx < x0 || jx > x1 || jy < y0 || jy > y1 || Math.abs(jx - x) > 1) continue;
      if (allow[j]) continue;
      const dr = rgba[j * 4] - sr, dg = rgba[j * 4 + 1] - sg, db = rgba[j * 4 + 2] - sb;
      const cd = Math.sqrt(dr * dr + dg * dg + db * db);
      const g = grad[j];
      if (g > edgeT || cd > colT) { allow[j] = Math.round(255 * clamp01(1 - (cd - colT) / 25) * clamp01(1 - (g - edgeT) / edgeT)); if (allow[j] < 1) allow[j] = 1; continue; }
      allow[j] = 255;
      stack.push(j);
    }
  }
  // close pin-holes left by noisy pixels (≥3 of 4 neighbours fully allowed)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
      const i = y * W + x;
      if (allow[i] === 255) continue;
      const c = (allow[i - 1] === 255) + (allow[i + 1] === 255) + (allow[i - W] === 255) + (allow[i + W] === 255);
      if (c >= 3 && grad[i] < edgeT * 1.6) allow[i] = 255;
    }
  }
  return allow;
}

/* ---------------- refinements (non-destructive, applied on top of the base mask) ---------------- */

export const REFINE_DEFAULTS = { feather: 0, smooth: 0, shift: 0, specks: 0, holes: 0 };
export const refineIsIdentity = (p) => !p || (!p.feather && !p.smooth && !p.shift && !p.specks && !p.holes);

/** Area thresholds for the speck/hole sliders (0..100 → px², relative to image size). */
const areaFor = (v, n) => (v <= 0 ? 0 : Math.round(n * 0.0004 * Math.pow(v / 10, 2)));

/**
 * Apply refinements. `scale` = pixels per working-resolution pixel (radii scale with it).
 * feather 0..100 (gaussian, px ≈ v/4), smooth 0..100, shift −100..100 (→ ±25 px), specks/holes 0..100.
 */
export function refineMask(base, W, H, p, scale = 1) {
  if (refineIsIdentity(p)) return base;
  const n = W * H;
  let m = base;
  if (p.specks > 0 || p.holes > 0) {
    m = new Uint8Array(base);
    const nn = n / (scale * scale);
    if (p.specks > 0) {
      const on = new Uint8Array(n);
      for (let i = 0; i < n; i++) on[i] = m[i] > 24 ? 1 : 0;
      const cc = components(on, W, H, true);
      const minA = areaFor(p.specks, nn) * scale * scale;
      for (let i = 0; i < n; i++) { const l = cc.labels[i]; if (l && cc.sizes[l] < minA) m[i] = 0; }
    }
    if (p.holes > 0) {
      const on = new Uint8Array(n);
      for (let i = 0; i < n; i++) on[i] = m[i] < 232 ? 1 : 0;
      const cc = components(on, W, H, false);
      const maxA = p.holes >= 100 ? Infinity : areaFor(p.holes, nn) * scale * scale * 4;
      for (let i = 0; i < n; i++) { const l = cc.labels[i]; if (l && !cc.touches[l] && cc.sizes[l] < maxA) m[i] = 255; }
    }
  }
  let f = null;
  if (p.shift) {
    const px = (p.shift / 100) * 25 * scale;
    // signed distance from the 50% edge (exact EDT), shifted, then 1-px anti-aliasing
    const inside = new Uint8Array(n), outside = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const v = m[i] >= 128; inside[i] = v ? 1 : 0; outside[i] = v ? 0 : 1; }
    const dIn = distanceTo(inside, W, H);   // for outside pixels: distance to the shape
    const dOut = distanceTo(outside, W, H); // for inside pixels: distance to the outside
    f = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const sd = inside[i] ? -(dOut[i] - 0.5) : dIn[i] - 0.5; // <0 inside
      f[i] = clamp01(0.5 - (sd - px));
    }
  }
  if (p.smooth > 0) {
    if (!f) f = maskToFloat(m);
    const s = (0.6 + p.smooth / 100 * 7) * scale;
    gaussBlur(f, W, H, s);
    const k = Math.max(0.5 / s, 0.06);
    for (let i = 0; i < n; i++) f[i] = smoothstep(0.5 - k, 0.5 + k, f[i]);
  }
  if (p.feather > 0) {
    if (!f) f = maskToFloat(m);
    gaussBlur(f, W, H, (p.feather / 100) * 24 * scale);
  }
  return f ? floatToMask(f) : m;
}

/* ---------------- analysis ---------------- */

export function maskStats(m, W, H, thr = 8) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, sum = 0, full = true;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const v = m[o + x];
      sum += v;
      if (v < 250) full = false;
      if (v > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return { empty: x1 < 0, full, coverage: sum / (255 * W * H), bbox: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/**
 * Marching squares at the 50% level → array of closed polylines (Float32Array [x0,y0,x1,y1,...]) in pixel-centre coords.
 * `step` subsamples the grid for speed on big masks.
 */
export function maskContours(m, W, H, step = 1) {
  const w = Math.ceil(W / step) + 2, h = Math.ceil(H / step) + 2; // padded grid
  const v = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const sy = Math.min(H - 1, (y - 1) * step);
    for (let x = 1; x < w - 1; x++) v[y * w + x] = m[sy * W + Math.min(W - 1, (x - 1) * step)];
  }
  // edge ids: horizontal edge (x,y)-(x+1,y): 2*(y*w+x); vertical (x,y)-(x,y+1): 2*(y*w+x)+1
  const ptX = new Map(), ptY = new Map();
  const nextOf = new Map();
  const edgePt = (id) => {
    if (ptX.has(id)) return;
    const cell = id >> 1, x = cell % w, y = (cell - x) / w;
    let a, b, px, py;
    if (id & 1) { a = v[cell]; b = v[cell + w]; const t = (127.5 - a) / (b - a); px = x; py = y + t; }
    else { a = v[cell]; b = v[cell + 1]; const t = (127.5 - a) / (b - a); px = x + t; py = y; }
    ptX.set(id, (px - 1) * step + 0.5); ptY.set(id, (py - 1) * step + 0.5);
  };
  const seg = (e1, e2) => { edgePt(e1); edgePt(e2); nextOf.set(e1, e2); };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const tl = v[i] > 127 ? 1 : 0, tr = v[i + 1] > 127 ? 1 : 0, br = v[i + w + 1] > 127 ? 1 : 0, bl = v[i + w] > 127 ? 1 : 0;
      const c = tl * 8 + tr * 4 + br * 2 + bl;
      if (c === 0 || c === 15) continue;
      const top = 2 * i, bottom = 2 * (i + w), left = 2 * i + 1, right = 2 * (i + 1) + 1;
      // orientation: keep "inside" on the left of the walking direction → consistent chains
      switch (c) {
        case 1: seg(left, bottom); break;
        case 2: seg(bottom, right); break;
        case 3: seg(left, right); break;
        case 4: seg(right, top); break;
        case 5: seg(left, top); seg(right, bottom); break;
        case 6: seg(bottom, top); break;
        case 7: seg(left, top); break;
        case 8: seg(top, left); break;
        case 9: seg(top, bottom); break;
        case 10: seg(top, right); seg(bottom, left); break;
        case 11: seg(top, right); break;
        case 12: seg(right, left); break;
        case 13: seg(right, bottom); break;
        case 14: seg(bottom, left); break;
      }
    }
  }
  const out = [];
  const used = new Set();
  for (const start of nextOf.keys()) {
    if (used.has(start)) continue;
    const pts = [];
    let e = start, guard = 0;
    while (e !== undefined && !used.has(e) && guard++ < 1e7) {
      used.add(e);
      pts.push(ptX.get(e), ptY.get(e));
      e = nextOf.get(e);
    }
    if (pts.length >= 6) out.push(Float32Array.from(pts));
  }
  return out;
}
