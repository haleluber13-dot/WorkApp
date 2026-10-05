// Photo studio — small numeric helpers shared by the image algorithms.
// Everything here is pure (typed arrays in, typed arrays out) so it also runs in a Worker.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → [0,1). Stable per (x, y, seed). */
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ---------------- box / gaussian blur (single channel) ---------------- */

/** One horizontal box pass, radius r, clamped edges. src/dst may not alias. */
function boxH(src, dst, w, h, r) {
  const inv = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = src[row], last = src[row + w - 1];
    let acc = (r + 1) * first;
    for (let j = 0; j < r; j++) acc += src[row + (j < w ? j : w - 1)];
    for (let x = 0; x < w; x++) {
      const ri = x + r, li = x - r - 1;
      acc += (ri < w ? src[row + ri] : last) - (li >= 0 ? src[row + li] : first);
      dst[row + x] = acc * inv;
    }
  }
}

/** One vertical box pass (row-wise accumulation: cache friendly). */
function boxV(src, dst, w, h, r, acc) {
  const inv = 1 / (r + r + 1);
  const lastRow = (h - 1) * w;
  for (let x = 0; x < w; x++) acc[x] = (r + 1) * src[x];
  for (let j = 0; j < r; j++) {
    const row = (j < h ? j : h - 1) * w;
    for (let x = 0; x < w; x++) acc[x] += src[row + x];
  }
  for (let y = 0; y < h; y++) {
    const ri = y + r, li = y - r - 1;
    const addRow = ri < h ? ri * w : lastRow;
    const subRow = li >= 0 ? li * w : 0;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      acc[x] += src[addRow + x] - src[subRow + x];
      dst[o + x] = acc[x] * inv;
    }
  }
}

/** Box filter (mean over a (2r+1)² window), in place on `a` (Float32Array). */
export function boxBlur(a, w, h, r, tmp) {
  r = Math.round(r);
  if (r < 1) return a;
  const t = tmp || new Float32Array(w * h);
  boxH(a, t, w, h, Math.min(r, w));
  boxV(t, a, w, h, Math.min(r, h), new Float64Array(w));
  return a;
}

function boxesForGauss(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes.map((s) => Math.max(0, (s - 1) >> 1));
}

/** Approximate gaussian blur (3 box passes), in place. Returns `a`. Large sigmas run at half resolution. */
export function gaussBlur(a, w, h, sigma, tmp) {
  if (!(sigma > 0.35)) return a;
  if (sigma >= 3.5 && w >= 16 && h >= 16) {
    const hw = w >> 1, hh = h >> 1;
    const s = new Float32Array(hw * hh);
    for (let y = 0; y < hh; y++) {
      const r0 = 2 * y * w, r1 = r0 + w;
      for (let x = 0; x < hw; x++) s[y * hw + x] = (a[r0 + 2 * x] + a[r0 + 2 * x + 1] + a[r1 + 2 * x] + a[r1 + 2 * x + 1]) * 0.25;
    }
    gaussBlur(s, hw, hh, Math.sqrt(Math.max(0.1, sigma * sigma - 0.5)) / 2);
    // bilinear upsample back into a
    const sx = hw / w, sy = hh / h;
    for (let y = 0; y < h; y++) {
      let fy = (y + 0.5) * sy - 0.5; if (fy < 0) fy = 0;
      let y0 = fy | 0; if (y0 > hh - 1) y0 = hh - 1;
      const y1 = y0 < hh - 1 ? y0 + 1 : y0, ty = fy - y0;
      const o0 = y0 * hw, o1 = y1 * hw, o = y * w;
      for (let x = 0; x < w; x++) {
        let fx = (x + 0.5) * sx - 0.5; if (fx < 0) fx = 0;
        let x0 = fx | 0; if (x0 > hw - 1) x0 = hw - 1;
        const x1 = x0 < hw - 1 ? x0 + 1 : x0, tx = fx - x0;
        const top = s[o0 + x0] + (s[o0 + x1] - s[o0 + x0]) * tx, bot = s[o1 + x0] + (s[o1 + x1] - s[o1 + x0]) * tx;
        a[o + x] = top + (bot - top) * ty;
      }
    }
    return a;
  }
  const t = tmp || new Float32Array(w * h);
  const acc = new Float64Array(Math.max(w, h));
  for (const r of boxesForGauss(sigma, 3)) {
    if (r < 1) continue;
    boxH(a, t, w, h, Math.min(r, w - 1 || 1));
    boxV(t, a, w, h, Math.min(r, h - 1 || 1), acc);
  }
  return a;
}

/** Small exact 3x3 binomial blur, in place (for σ < ~0.8). */
export function blur3(a, w, h, tmp) {
  const t = tmp || new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const l = a[o + (x > 0 ? x - 1 : 0)], r = a[o + (x < w - 1 ? x + 1 : x)];
      t[o + x] = (l + 2 * a[o + x] + r) * 0.25;
    }
  }
  for (let y = 0; y < h; y++) {
    const o = y * w, up = (y > 0 ? y - 1 : 0) * w, dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) a[o + x] = (t[up + x] + 2 * t[o + x] + t[dn + x]) * 0.25;
  }
  return a;
}

/* ---------------- channel helpers ---------------- */

/** RGBA bytes → luminance Float32 0..1 (Rec.601 weights). */
export function lumaOf(rgba, n, out) {
  const L = out || new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = (rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114) / 255;
  return L;
}

export function planes(rgba, n) {
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = rgba[j] / 255; G[i] = rgba[j + 1] / 255; B[i] = rgba[j + 2] / 255; }
  return [R, G, B];
}

export function maskToFloat(m, out) {
  const f = out || new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) f[i] = m[i] / 255;
  return f;
}
export function floatToMask(f, out) {
  const m = out || new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) { const v = f[i]; m[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0; }
  return m;
}

/** Bilinear resample of a single-channel array (Float32 or Uint8). Returns Float32. */
export function resample(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    let fy = (y + 0.5) * sy - 0.5; if (fy < 0) fy = 0;
    let y0 = fy | 0; if (y0 > sh - 1) y0 = sh - 1;
    const y1 = y0 < sh - 1 ? y0 + 1 : y0, ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      let fx = (x + 0.5) * sx - 0.5; if (fx < 0) fx = 0;
      let x0 = fx | 0; if (x0 > sw - 1) x0 = sw - 1;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0, tx = fx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1], c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * dw + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Sobel gradient magnitude of a Float32 luminance image. */
export function gradientMag(L, w, h, out) {
  const g = out || new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w, o = y * w, dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0, xr = x < w - 1 ? x + 1 : x;
      const gx = L[up + xr] + 2 * L[o + xr] + L[dn + xr] - L[up + xl] - 2 * L[o + xl] - L[dn + xl];
      const gy = L[dn + xl] + 2 * L[dn + x] + L[dn + xr] - L[up + xl] - 2 * L[up + x] - L[up + xr];
      g[o + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return g;
}

/** Percentile of a Float32 array via a 1024-bin histogram over [lo,hi]. */
export function percentile(a, p, lo = 0, hi = 1, step = 1) {
  const bins = new Uint32Array(1024);
  let n = 0;
  const k = 1023 / (hi - lo);
  for (let i = 0; i < a.length; i += step) { let b = ((a[i] - lo) * k) | 0; if (b < 0) b = 0; else if (b > 1023) b = 1023; bins[b]++; n++; }
  const target = p * n;
  let acc = 0;
  for (let b = 0; b < 1024; b++) { acc += bins[b]; if (acc >= target) return lo + b / k; }
  return hi;
}

/* ---------------- distance transform (exact squared EDT, Felzenszwalb) ---------------- */

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let p = v[k];
    let s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
    while (s <= z[k]) {
      k--; p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

/** Euclidean distance (px) from every pixel to the nearest pixel where `on(i)` is true. */
export function distanceTo(onMask, w, h) {
  const INF = 1e10;
  const n = w * h, D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = onMask[i] ? 0 : INF;
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = D[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) D[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = D[o + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) D[o + x] = Math.sqrt(d[x]);
  }
  return D;
}

/* ---------------- connected components ---------------- */

/**
 * Label connected components of pixels where pred(i) is true.
 * Returns { labels: Int32Array (0 = none), sizes: number[] (index = label), touches: Uint8Array (touches border) }.
 */
export function components(on, w, h, eight = true) {
  const n = w * h;
  const labels = new Int32Array(n);
  const sizes = [0], touches = [0];
  const stack = new Int32Array(n);
  let next = 1;
  for (let s = 0; s < n; s++) {
    if (!on[s] || labels[s]) continue;
    const lab = next++;
    let sp = 0, size = 0, border = 0;
    stack[sp++] = s; labels[s] = lab;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = 1;
      const x0 = x > 0 ? -1 : 0, x1 = x < w - 1 ? 1 : 0, y0 = y > 0 ? -1 : 0, y1 = y < h - 1 ? 1 : 0;
      for (let dy = y0; dy <= y1; dy++) {
        for (let dx = x0; dx <= x1; dx++) {
          if (!eight && dx && dy) continue;
          const j = i + dy * w + dx;
          if (on[j] && !labels[j]) { labels[j] = lab; stack[sp++] = j; }
        }
      }
    }
    sizes.push(size); touches.push(border);
  }
  return { labels, sizes, touches: Uint8Array.from(touches), count: next - 1 };
}

/* ---------------- mask snapshots (run-length encoding) ---------------- */

/** Compress a Uint8 mask: runs of equal bytes → [value,len...] in a Uint8Array/Uint32 pair. */
export function rleEncode(m) {
  const vals = [], lens = [];
  let i = 0;
  const n = m.length;
  while (i < n) {
    const v = m[i];
    let j = i + 1;
    while (j < n && m[j] === v) j++;
    vals.push(v); lens.push(j - i);
    i = j;
  }
  return { n, vals: Uint8Array.from(vals), lens: Uint32Array.from(lens) };
}
export function rleDecode(r, out) {
  const m = out && out.length === r.n ? out : new Uint8Array(r.n);
  let p = 0;
  for (let k = 0; k < r.vals.length; k++) { m.fill(r.vals[k], p, p + r.lens[k]); p += r.lens[k]; }
  return m;
}
export const rleBytes = (r) => r.vals.length * 5 + 16;

/* ---------------- tiny 2D affine helpers: [a,b,c,d,e,f] like canvas ---------------- */
export const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ],
  inv: (m) => {
    const det = m[0] * m[3] - m[1] * m[2];
    const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
  },
  apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
  translate: (x, y) => [1, 0, 0, 1, x, y],
  scale: (sx, sy = sx) => [sx, 0, 0, sy, 0, 0],
  rotate: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; },
};
