// Photo studio — subject segmentation.
//   grabCut()        colour GMMs (k-means init) + graph cut (Boykov–Kolmogorov max-flow) on a small grid
//   findSubject()    saliency (border-contrast + centre prior + edge density) → rectangle + seed trimap
//   guidedUpsample() edge-aware refinement of a low-res mask on the full image (fast colour guided filter)
// Pure functions: run in a Worker (seg-worker.js) or on the main thread.

import { clamp, clamp01, rng, boxBlur, gaussBlur, components, resample } from './util.js';

export const T_BG = 0, T_FG = 1, T_PR_BG = 2, T_PR_FG = 3;

/* ======================= Boykov–Kolmogorov max-flow on an 8-connected grid ======================= */

const TERMINAL = -2, ORPHAN = -3, NONE = -1;

/**
 * W×H grid (caller pads it with a 1-px border of isolated nodes).
 * cap: Int32Array(W*H*8) residual capacity of arc (node i → neighbour in dir d) at index i*8+d.
 * tr:  Int32Array(W*H)   terminal residual: >0 source capacity, <0 sink capacity.
 * Returns Uint8Array: 1 = source (foreground) side.
 */
export function maxflowGrid(W, H, cap, tr) {
  const N = W * H;
  const OFF = new Int32Array([1, -1, W, -W, W + 1, -W - 1, W - 1, -W + 1]);
  const parent = new Int32Array(N).fill(NONE);
  const tree = new Uint8Array(N); // 1 = S, 2 = T
  const ts = new Int32Array(N), dist = new Int32Array(N);
  const q = new Int32Array(N + 1); let qh = 0, qt = 0; const QN = N + 1;
  const inQ = new Uint8Array(N);
  const push = (i) => { if (!inQ[i]) { inQ[i] = 1; q[qt] = i; qt = qt + 1 === QN ? 0 : qt + 1; } };
  const pop = () => {
    while (qh !== qt) {
      const i = q[qh]; qh = qh + 1 === QN ? 0 : qh + 1; inQ[i] = 0;
      if (parent[i] !== NONE) return i;
    }
    return -1;
  };
  const head = (a) => (a >> 3) + OFF[a & 7];
  const sis = (a) => (head(a) << 3) | ((a & 7) ^ 1);

  for (let i = 0; i < N; i++) {
    if (tr[i] > 0) { tree[i] = 1; parent[i] = TERMINAL; dist[i] = 1; push(i); }
    else if (tr[i] < 0) { tree[i] = 2; parent[i] = TERMINAL; dist[i] = 1; push(i); }
  }
  let TIME = 0;
  const orphans = [];
  let oh = 0;
  const orphan = (i) => { parent[i] = ORPHAN; orphans.push(i); };
  let cur = -1;

  for (;;) {
    let i = cur;
    if (i >= 0 && parent[i] === NONE) i = -1;
    if (i < 0) { i = pop(); if (i < 0) break; }
    let mid = -1;
    const base = i << 3;
    if (tree[i] === 1) {
      for (let d = 0; d < 8; d++) {
        const a = base | d;
        if (cap[a] <= 0) continue;
        const j = i + OFF[d];
        if (parent[j] === NONE) { tree[j] = 1; parent[j] = (j << 3) | (d ^ 1); ts[j] = ts[i]; dist[j] = dist[i] + 1; push(j); }
        else if (tree[j] === 2) { mid = a; break; }
        else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = (j << 3) | (d ^ 1); ts[j] = ts[i]; dist[j] = dist[i] + 1; }
      }
    } else {
      for (let d = 0; d < 8; d++) {
        const j = i + OFF[d];
        const s = (j << 3) | (d ^ 1);
        if (cap[s] <= 0) continue;
        if (parent[j] === NONE) { tree[j] = 2; parent[j] = s; ts[j] = ts[i]; dist[j] = dist[i] + 1; push(j); }
        else if (tree[j] === 1) { mid = s; break; }
        else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = s; ts[j] = ts[i]; dist[j] = dist[i] + 1; }
      }
    }
    TIME++;
    if (mid < 0) { cur = -1; continue; }
    cur = i;

    // ---- augment ----
    const u = mid >> 3, v = head(mid);
    let f = cap[mid];
    for (let k = u; ;) {
      const a = parent[k];
      if (a === TERMINAL) { if (tr[k] < f) f = tr[k]; break; }
      const c = cap[sis(a)]; if (c < f) f = c;
      k = head(a);
    }
    for (let k = v; ;) {
      const a = parent[k];
      if (a === TERMINAL) { if (-tr[k] < f) f = -tr[k]; break; }
      const c = cap[a]; if (c < f) f = c;
      k = head(a);
    }
    cap[mid] -= f; cap[sis(mid)] += f;
    for (let k = u; ;) {
      const a = parent[k];
      if (a === TERMINAL) { tr[k] -= f; if (tr[k] === 0) orphan(k); break; }
      const sa = sis(a);
      cap[a] += f; cap[sa] -= f;
      const nk = head(a);
      if (cap[sa] === 0) orphan(k);
      k = nk;
    }
    for (let k = v; ;) {
      const a = parent[k];
      if (a === TERMINAL) { tr[k] += f; if (tr[k] === 0) orphan(k); break; }
      cap[sis(a)] += f; cap[a] -= f;
      const nk = head(a);
      if (cap[a] === 0) orphan(k);
      k = nk;
    }

    // ---- adopt orphans ----
    while (oh < orphans.length) {
      const o = orphans[oh++];
      const tO = tree[o];
      let a0 = -1, dmin = 1e9;
      const ob = o << 3;
      for (let d = 0; d < 8; d++) {
        const a = ob | d;
        const j = o + OFF[d];
        if (tree[j] !== tO || parent[j] === NONE) continue;
        const res = tO === 1 ? cap[(j << 3) | (d ^ 1)] : cap[a];
        if (res <= 0) continue;
        // origin check
        let dd = 0, k = j;
        for (;;) {
          if (ts[k] === TIME) { dd += dist[k]; break; }
          const pa = parent[k]; dd++;
          if (pa === TERMINAL) { ts[k] = TIME; dist[k] = 1; break; }
          if (pa === ORPHAN || pa === NONE) { dd = 1e9; break; }
          k = head(pa);
        }
        if (dd < 1e9) {
          if (dd < dmin) { a0 = a; dmin = dd; }
          for (k = j; ts[k] !== TIME; k = head(parent[k])) { ts[k] = TIME; dist[k] = dd; dd--; }
        }
      }
      if (a0 >= 0) { parent[o] = a0; ts[o] = TIME; dist[o] = dmin + 1; continue; }
      // no valid parent: free the orphan, its children become orphans
      for (let d = 0; d < 8; d++) {
        const a = ob | d;
        const j = o + OFF[d];
        if (tree[j] !== tO) continue;
        const pj = parent[j];
        if (pj === NONE) continue;
        const res = tO === 1 ? cap[(j << 3) | (d ^ 1)] : cap[a];
        if (res > 0) push(j);
        if (pj !== TERMINAL && pj !== ORPHAN && head(pj) === o) orphan(j);
      }
      parent[o] = NONE;
    }
    orphans.length = 0; oh = 0;
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = parent[i] !== NONE && tree[i] === 1 ? 1 : 0;
  return out;
}

/* ======================= Gaussian mixture models ======================= */

class GMM {
  constructor(K) {
    this.K = K;
    this.w = new Float64Array(K);
    this.mean = new Float64Array(K * 3);
    this.inv = new Float64Array(K * 9);
    this.coef = new Float64Array(K); // w / sqrt(det)
    this.reset();
  }
  reset() {
    this.s = new Float64Array(this.K * 3);
    this.p = new Float64Array(this.K * 9);
    this.n = new Float64Array(this.K);
    this.total = 0;
  }
  add(k, r, g, b) {
    const s = this.s, p = this.p, o = k * 3, o9 = k * 9;
    s[o] += r; s[o + 1] += g; s[o + 2] += b;
    p[o9] += r * r; p[o9 + 1] += r * g; p[o9 + 2] += r * b;
    p[o9 + 4] += g * g; p[o9 + 5] += g * b; p[o9 + 8] += b * b;
    this.n[k]++; this.total++;
  }
  finish() {
    const K = this.K;
    for (let k = 0; k < K; k++) {
      const n = this.n[k];
      if (n < 2 || !this.total) { this.w[k] = 0; this.coef[k] = 0; continue; }
      this.w[k] = n / this.total;
      const o = k * 3, o9 = k * 9;
      const mr = this.s[o] / n, mg = this.s[o + 1] / n, mb = this.s[o + 2] / n;
      this.mean[o] = mr; this.mean[o + 1] = mg; this.mean[o + 2] = mb;
      const reg = 6; // variance floor (in 0..255 units²) keeps flat areas well-conditioned
      const c00 = this.p[o9] / n - mr * mr + reg, c01 = this.p[o9 + 1] / n - mr * mg, c02 = this.p[o9 + 2] / n - mr * mb;
      const c11 = this.p[o9 + 4] / n - mg * mg + reg, c12 = this.p[o9 + 5] / n - mg * mb, c22 = this.p[o9 + 8] / n - mb * mb + reg;
      const det = c00 * (c11 * c22 - c12 * c12) - c01 * (c01 * c22 - c12 * c02) + c02 * (c01 * c12 - c11 * c02);
      const id = 1 / det;
      const inv = this.inv;
      inv[o9] = (c11 * c22 - c12 * c12) * id;
      inv[o9 + 1] = inv[o9 + 3] = (c02 * c12 - c01 * c22) * id;
      inv[o9 + 2] = inv[o9 + 6] = (c01 * c12 - c02 * c11) * id;
      inv[o9 + 4] = (c00 * c22 - c02 * c02) * id;
      inv[o9 + 5] = inv[o9 + 7] = (c02 * c01 - c00 * c12) * id;
      inv[o9 + 8] = (c00 * c11 - c01 * c01) * id;
      this.coef[k] = this.w[k] / Math.sqrt(Math.max(det, 1e-9));
    }
  }
  comp(k, r, g, b) {
    if (!this.coef[k]) return 0;
    const o = k * 3, o9 = k * 9, inv = this.inv;
    const dr = r - this.mean[o], dg = g - this.mean[o + 1], db = b - this.mean[o + 2];
    const m = dr * (dr * inv[o9] + dg * inv[o9 + 1] + db * inv[o9 + 2])
      + dg * (dr * inv[o9 + 3] + dg * inv[o9 + 4] + db * inv[o9 + 5])
      + db * (dr * inv[o9 + 6] + dg * inv[o9 + 7] + db * inv[o9 + 8]);
    return this.coef[k] * Math.exp(-0.5 * m);
  }
  prob(r, g, b) { let s = 0; for (let k = 0; k < this.K; k++) s += this.comp(k, r, g, b); return s; }
  best(r, g, b) {
    let bk = 0, bv = -1;
    for (let k = 0; k < this.K; k++) { const v = this.comp(k, r, g, b); if (v > bv) { bv = v; bk = k; } }
    return bk;
  }
}

/** k-means (k-means++ seeding, deterministic) on index list → component label per listed pixel. */
function kmeansInit(px, idx, K, rand) {
  const n = idx.length;
  const lab = new Uint8Array(n);
  if (!n) return lab;
  const step = Math.max(1, Math.floor(n / 12000));
  const samp = [];
  for (let s = 0; s < n; s += step) samp.push(idx[s]);
  const C = new Float64Array(K * 3);
  let p = samp[Math.floor(rand() * samp.length)] * 3;
  C[0] = px[p]; C[1] = px[p + 1]; C[2] = px[p + 2];
  const d2 = new Float64Array(samp.length).fill(1e18);
  for (let k = 1; k < K; k++) {
    let sum = 0;
    for (let s = 0; s < samp.length; s++) {
      const q = samp[s] * 3, o = (k - 1) * 3;
      const dr = px[q] - C[o], dg = px[q + 1] - C[o + 1], db = px[q + 2] - C[o + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < d2[s]) d2[s] = d;
      sum += d2[s];
    }
    let t = rand() * sum, pick = 0;
    for (let s = 0; s < samp.length; s++) { t -= d2[s]; if (t <= 0) { pick = s; break; } }
    p = samp[pick] * 3;
    C[k * 3] = px[p]; C[k * 3 + 1] = px[p + 1]; C[k * 3 + 2] = px[p + 2];
  }
  const nearest = (q) => {
    let bk = 0, bd = 1e18;
    for (let k = 0; k < K; k++) {
      const dr = px[q] - C[k * 3], dg = px[q + 1] - C[k * 3 + 1], db = px[q + 2] - C[k * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bk = k; }
    }
    return bk;
  };
  for (let it = 0; it < 6; it++) {
    const acc = new Float64Array(K * 4);
    for (let s = 0; s < samp.length; s++) {
      const q = samp[s] * 3, k = nearest(q);
      acc[k * 4] += px[q]; acc[k * 4 + 1] += px[q + 1]; acc[k * 4 + 2] += px[q + 2]; acc[k * 4 + 3]++;
    }
    for (let k = 0; k < K; k++) if (acc[k * 4 + 3]) for (let c = 0; c < 3; c++) C[k * 3 + c] = acc[k * 4 + c] / acc[k * 4 + 3];
  }
  for (let s = 0; s < n; s++) lab[s] = nearest(idx[s] * 3);
  return lab;
}

/**
 * GrabCut.
 * rgba: Uint8ClampedArray (w*h*4), trimap: Uint8Array (T_* values).
 * Returns Uint8Array 0/1 foreground labels.
 */
export function grabCut(rgba, w, h, trimap, { iters = 4, K = 5, gamma = 50, seed = 7 } = {}) {
  const n = w * h;
  const px = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 4) { px[i * 3] = rgba[j]; px[i * 3 + 1] = rgba[j + 1]; px[i * 3 + 2] = rgba[j + 2]; }
  const fgSet = new Uint8Array(n);
  for (let i = 0; i < n; i++) fgSet[i] = trimap[i] === T_FG || trimap[i] === T_PR_FG ? 1 : 0;

  // ---- n-links (constant) on the padded grid ----
  const W = w + 2, H = h + 2, N = W * H;
  const DX = [1, -1, 0, 0, 1, -1, -1, 1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  let sum = 0, cnt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    for (const d of [0, 2, 4, 6]) {
      const xx = x + DX[d], yy = y + DY[d];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 3;
      const dr = px[i] - px[j], dg = px[i + 1] - px[j + 1], db = px[i + 2] - px[j + 2];
      sum += dr * dr + dg * dg + db * db; cnt++;
    }
  }
  const beta = cnt && sum ? 1 / (2 * sum / cnt) : 0;
  const SCALE = 60;
  const ncap = new Int32Array(N * 8);
  const SQ = Math.SQRT1_2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, node = ((y + 1) * W + x + 1) << 3;
    for (let d = 0; d < 8; d++) {
      const xx = x + DX[d], yy = y + DY[d];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 3;
      const dr = px[i] - px[j], dg = px[i + 1] - px[j + 1], db = px[i + 2] - px[j + 2];
      const wt = gamma * Math.exp(-beta * (dr * dr + dg * dg + db * db)) * (d >= 4 ? SQ : 1);
      ncap[node | d] = Math.round(wt * SCALE);
    }
  }

  // ---- GMM init with k-means ----
  const rand = rng(seed);
  const fgG = new GMM(K), bgG = new GMM(K);
  const comp = new Uint8Array(n);
  {
    const fi = [], bi = [];
    for (let i = 0; i < n; i++) (fgSet[i] ? fi : bi).push(i);
    if (!fi.length || !bi.length) return fgSet;
    const lf = kmeansInit(px, fi, K, rand), lb = kmeansInit(px, bi, K, rand);
    for (let s = 0; s < fi.length; s++) comp[fi[s]] = lf[s];
    for (let s = 0; s < bi.length; s++) comp[bi[s]] = lb[s];
  }
  const learn = () => {
    fgG.reset(); bgG.reset();
    for (let i = 0; i < n; i++) (fgSet[i] ? fgG : bgG).add(comp[i], px[i * 3], px[i * 3 + 1], px[i * 3 + 2]);
    fgG.finish(); bgG.finish();
  };
  learn();

  const HARD = 1 << 26;
  const cap = new Int32Array(N * 8), tr = new Int32Array(N);
  let label = fgSet;
  for (let it = 0; it < iters; it++) {
    if (it > 0) {
      for (let i = 0; i < n; i++) { const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2]; comp[i] = (fgSet[i] ? fgG : bgG).best(r, g, b); }
      learn();
    }
    cap.set(ncap);
    tr.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, node = (y + 1) * W + x + 1;
      const t = trimap[i];
      if (t === T_FG) tr[node] = HARD;
      else if (t === T_BG) tr[node] = -HARD;
      else {
        const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
        const pf = fgG.prob(r, g, b) + 1e-30, pb = bgG.prob(r, g, b) + 1e-30;
        // source cap = −log pB (cost of calling it background), sink cap = −log pF
        let v = Math.log(pf) - Math.log(pb);
        if (v > 40) v = 40; else if (v < -40) v = -40;
        tr[node] = Math.round(v * SCALE);
      }
    }
    const seg = maxflowGrid(W, H, cap, tr);
    let changed = 0;
    const next = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = trimap[i];
      const v = t === T_FG ? 1 : t === T_BG ? 0 : seg[(y + 1) * W + x + 1];
      next[i] = v;
      if (v !== fgSet[i]) changed++;
    }
    fgSet.set(next);
    label = fgSet;
    if (it > 0 && changed < n * 0.0005) break;
  }
  return label;
}

/* ======================= saliency: find the subject ======================= */

function toLab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  X = g3(X); Y = g3(Y); Z = g3(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/**
 * Saliency map (Float32 0..1) for a small RGBA image.
 * Combines: colour distance to the dominant border colours (background model), global colour rarity,
 * a centre prior, and edge density.
 */
export function saliency(rgba, w, h) {
  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = toLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); lab[i * 3] = c[0]; lab[i * 3 + 1] = c[1]; lab[i * 3 + 2] = c[2]; }
  // smooth the Lab image a bit (texture/noise robustness)
  for (let c = 0; c < 3; c++) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = lab[i * 3 + c];
    gaussBlur(a, w, h, Math.max(1, w / 120));
    for (let i = 0; i < n; i++) lab[i * 3 + c] = a[i];
  }
  // border samples → background prototypes. A side whose colours don't appear on the other sides
  // (e.g. a person's shirt cut off by the bottom edge) is not trusted as background.
  const bw = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const sides = [[], [], [], []]; // top, bottom, left, right
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (y < bw) sides[0].push(i); else if (y >= h - bw) sides[1].push(i); else if (x < bw) sides[2].push(i); else if (x >= w - bw) sides[3].push(i);
  }
  const protoOf = (idx, K, seed) => {
    if (!idx.length) return [];
    const lb = kmeansInit(lab, idx, K, rng(seed));
    const acc = new Float64Array(K * 4);
    for (let s = 0; s < idx.length; s++) { const k = lb[s], q = idx[s] * 3; acc[k * 4] += lab[q]; acc[k * 4 + 1] += lab[q + 1]; acc[k * 4 + 2] += lab[q + 2]; acc[k * 4 + 3]++; }
    const out = [];
    for (let k = 0; k < K; k++) if (acc[k * 4 + 3] > idx.length * 0.05) out.push([acc[k * 4] / acc[k * 4 + 3], acc[k * 4 + 1] / acc[k * 4 + 3], acc[k * 4 + 2] / acc[k * 4 + 3]]);
    return out;
  };
  const labDist = (q, p) => { const dl = (lab[q] - p[0]) * 0.7, da = lab[q + 1] - p[1], db = lab[q + 2] - p[2]; return Math.sqrt(dl * dl + da * da + db * db); };
  const sideProtos = sides.map((s, k) => protoOf(s, 3, 3 + k));
  const bidx = [];
  for (let sd = 0; sd < 4; sd++) {
    const others = sideProtos.filter((_, k) => k !== sd).flat();
    for (const i of sides[sd]) {
      let best = 1e9;
      for (const p of others) { const d = labDist(i * 3, p); if (d < best) best = d; }
      if (best < 14) bidx.push(i);
    }
  }
  if (bidx.length < 20) for (const s of sides) for (const i of s) bidx.push(i);
  const protos = protoOf(bidx, 4, 3);
  // distance to nearest background prototype
  const S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 1e9;
    for (const p of protos) { const d = labDist(i * 3, p); if (d < best) best = d; }
    S[i] = best;
  }
  // edge density (local gradient energy)
  const E = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lab[(i + 1) * 3] - lab[(i - 1) * 3], gy = lab[(i + w) * 3] - lab[(i - w) * 3];
    E[i] = Math.sqrt(gx * gx + gy * gy);
  }
  gaussBlur(E, w, h, Math.max(2, w / 25));
  let sMax = 1e-6, eMax = 1e-6;
  for (let i = 0; i < n; i++) { if (S[i] > sMax) sMax = S[i]; if (E[i] > eMax) eMax = E[i]; }
  // border edge density = background texture level; subtract it
  let eBorder = 0;
  for (const i of bidx) eBorder += E[i];
  eBorder /= bidx.length || 1;
  const out = new Float32Array(n);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const dx = (x - cx) / (w * 0.42), dy = (y - cy) / (h * 0.42);
    const centre = Math.exp(-(dx * dx + dy * dy));
    const s = S[i] / sMax;
    const e = clamp01((E[i] - eBorder) / (eMax - eBorder + 1e-6));
    out[i] = clamp01((0.75 * s + 0.25 * e) * (0.35 + 0.65 * centre));
  }
  gaussBlur(out, w, h, Math.max(1, w / 60));
  let m = 1e-6;
  for (let i = 0; i < n; i++) if (out[i] > m) m = out[i];
  for (let i = 0; i < n; i++) out[i] /= m;
  return out;
}

function otsu(a) {
  const hist = new Float64Array(256);
  for (let i = 0; i < a.length; i++) hist[Math.min(255, (a[i] * 255) | 0)]++;
  const total = a.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr / 255;
}

/**
 * Build a GrabCut trimap for "select subject" with no user input.
 * Returns { trimap, rect:{x,y,w,h} } for the (small) image.
 */
export function subjectTrimap(rgba, w, h) {
  const sal = saliency(rgba, w, h);
  const t = Math.max(0.18, Math.min(0.6, otsu(sal)));
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = sal[i] > t ? 1 : 0;
  const cc = components(on, w, h, true);
  // keep components that are big enough (relative to the largest), weighted by centrality
  let bestL = 0, bestS = 0;
  for (let l = 1; l <= cc.count; l++) if (cc.sizes[l] > bestS) { bestS = cc.sizes[l]; bestL = l; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  if (bestL) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = cc.labels[y * w + x];
      if (l && cc.sizes[l] >= bestS * 0.12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0 || (x1 - x0) * (y1 - y0) < w * h * 0.01) { x0 = w * 0.1; y0 = h * 0.1; x1 = w * 0.9; y1 = h * 0.9; }
  const padX = (x1 - x0) * 0.08 + w * 0.02, padY = (y1 - y0) * 0.08 + h * 0.02;
  x0 = Math.max(0, Math.floor(x0 - padX)); y0 = Math.max(0, Math.floor(y0 - padY));
  x1 = Math.min(w - 1, Math.ceil(x1 + padX)); y1 = Math.min(h - 1, Math.ceil(y1 + padY));
  // keep a thin definite-background frame even if the subject touches the edge
  // (unless it really fills that side: then the side stays "probable")
  const trimap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x < x0 || x > x1 || y < y0 || y > y1) trimap[i] = T_BG;
    else trimap[i] = sal[i] > t * 0.55 ? T_PR_FG : T_PR_BG;
  }
  return { trimap, rect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, saliency: sal };
}

/** Largest blob + blobs at least `rel`× its size; fills holes smaller than `holeFrac` of the image. */
export function cleanLabels(lab, w, h, { rel = 0.15, holeFrac = 0.002 } = {}) {
  const cc = components(lab, w, h, true);
  let best = 0;
  for (let l = 1; l <= cc.count; l++) if (cc.sizes[l] > best) best = cc.sizes[l];
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) { const l = cc.labels[i]; out[i] = l && cc.sizes[l] >= best * rel ? 1 : 0; }
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = out[i] ? 0 : 1;
  const hc = components(inv, w, h, false);
  const maxHole = w * h * holeFrac;
  for (let i = 0; i < out.length; i++) { const l = hc.labels[i]; if (l && !hc.touches[l] && hc.sizes[l] < maxHole) out[i] = 1; }
  return out;
}

/* ======================= fast colour guided filter ======================= */

/**
 * Edge-aware refinement of a soft mask p (Float32 0..1, size w×h) guided by the RGBA image.
 * r: window radius (px), eps: regularisation, s: subsampling factor (fast guided filter).
 * Returns Float32 0..1.
 */
export function guidedFilter(rgba, w, h, p, r, eps = 1e-4, s = 1) {
  s = Math.max(1, Math.round(s));
  const sw = Math.max(1, Math.round(w / s)), sh = Math.max(1, Math.round(h / s));
  const sn = sw * sh;
  // subsampled guide + input
  const Ir = new Float32Array(sn), Ig = new Float32Array(sn), Ib = new Float32Array(sn), P = new Float32Array(sn);
  if (s === 1) {
    for (let i = 0; i < sn; i++) { Ir[i] = rgba[i * 4] / 255; Ig[i] = rgba[i * 4 + 1] / 255; Ib[i] = rgba[i * 4 + 2] / 255; P[i] = p[i]; }
  } else {
    const cnt = new Float32Array(sn);
    for (let y = 0; y < h; y++) {
      const yy = Math.min(sh - 1, Math.floor(y * sh / h));
      for (let x = 0; x < w; x++) {
        const xx = Math.min(sw - 1, Math.floor(x * sw / w));
        const k = yy * sw + xx, i = y * w + x;
        Ir[k] += rgba[i * 4]; Ig[k] += rgba[i * 4 + 1]; Ib[k] += rgba[i * 4 + 2]; P[k] += p[i]; cnt[k]++;
      }
    }
    for (let k = 0; k < sn; k++) { const c = cnt[k] || 1; Ir[k] /= 255 * c; Ig[k] /= 255 * c; Ib[k] /= 255 * c; P[k] /= c; }
  }
  const rr = Math.max(1, Math.round(r / s));
  const tmp = new Float32Array(sn);
  const box = (a) => boxBlur(a, sw, sh, rr, tmp);
  const mul = (a, b) => { const o = new Float32Array(sn); for (let i = 0; i < sn; i++) o[i] = a[i] * b[i]; return o; };
  const mR = box(Float32Array.from(Ir)), mG = box(Float32Array.from(Ig)), mB = box(Float32Array.from(Ib)), mP = box(Float32Array.from(P));
  const cRP = box(mul(Ir, P)), cGP = box(mul(Ig, P)), cBP = box(mul(Ib, P));
  const vRR = box(mul(Ir, Ir)), vRG = box(mul(Ir, Ig)), vRB = box(mul(Ir, Ib)), vGG = box(mul(Ig, Ig)), vGB = box(mul(Ig, Ib)), vBB = box(mul(Ib, Ib));
  const aR = cRP, aG = cGP, aB = cBP, bb = mP; // reuse buffers for the outputs
  for (let i = 0; i < sn; i++) {
    const mr = mR[i], mg = mG[i], mb = mB[i], mp = mP[i];
    const covR = cRP[i] - mr * mp, covG = cGP[i] - mg * mp, covB = cBP[i] - mb * mp;
    const s00 = vRR[i] - mr * mr + eps, s01 = vRG[i] - mr * mg, s02 = vRB[i] - mr * mb;
    const s11 = vGG[i] - mg * mg + eps, s12 = vGB[i] - mg * mb, s22 = vBB[i] - mb * mb + eps;
    const i00 = s11 * s22 - s12 * s12, i01 = s02 * s12 - s01 * s22, i02 = s01 * s12 - s02 * s11;
    const i11 = s00 * s22 - s02 * s02, i12 = s02 * s01 - s00 * s12, i22 = s00 * s11 - s01 * s01;
    const det = s00 * i00 + s01 * i01 + s02 * i02;
    const id = 1 / det;
    const ar = (i00 * covR + i01 * covG + i02 * covB) * id;
    const ag = (i01 * covR + i11 * covG + i12 * covB) * id;
    const ab = (i02 * covR + i12 * covG + i22 * covB) * id;
    aR[i] = ar; aG[i] = ag; aB[i] = ab;
    bb[i] = mp - ar * mr - ag * mg - ab * mb;
  }
  box(aR); box(aG); box(aB); box(bb);
  const q = new Float32Array(w * h);
  if (s === 1) {
    for (let i = 0; i < w * h; i++) q[i] = clamp01(aR[i] * rgba[i * 4] / 255 + aG[i] * rgba[i * 4 + 1] / 255 + aB[i] * rgba[i * 4 + 2] / 255 + bb[i]);
  } else {
    const AR = resample(aR, sw, sh, w, h), AG = resample(aG, sw, sh, w, h), AB = resample(aB, sw, sh, w, h), BB = resample(bb, sw, sh, w, h);
    for (let i = 0; i < w * h; i++) q[i] = clamp01(AR[i] * rgba[i * 4] / 255 + AG[i] * rgba[i * 4 + 1] / 255 + AB[i] * rgba[i * 4 + 2] / 255 + BB[i]);
  }
  return q;
}

/**
 * Low-res binary/soft mask → full-res soft mask that follows the real edges.
 * small: Uint8/Float (sw×sh, 0..1 or 0..255 if `bytes`), rgba: full-res pixels.
 */
export function guidedUpsample(small, sw, sh, rgba, w, h, { bytes = false, radius, eps = 2e-4, sharpen = 1.6 } = {}) {
  let src = small;
  if (bytes) { src = new Float32Array(small.length); for (let i = 0; i < small.length; i++) src[i] = small[i] / 255; }
  const up = resample(src, sw, sh, w, h);
  const scale = w / sw;
  const r = radius || Math.max(2, Math.round(scale * 1.6 + 1));
  const s = Math.max(1, Math.min(4, Math.round(r / 3)));
  const q = guidedFilter(rgba, w, h, up, r, eps, s);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = clamp01((q[i] - 0.5) * sharpen + 0.5);
    out[i] = (v * 255 + 0.5) | 0;
  }
  return out;
}

/** Downscale RGBA by box-averaging to fit `maxSide`. Returns { data, w, h }. */
export function downscaleRGBA(rgba, w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  if (s >= 1) return { data: rgba, w, h, s: 1 };
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  const acc = new Float32Array(dw * dh * 4), cnt = new Float32Array(dw * dh);
  for (let y = 0; y < h; y++) {
    const yy = Math.min(dh - 1, Math.floor(y * dh / h));
    for (let x = 0; x < w; x++) {
      const xx = Math.min(dw - 1, Math.floor(x * dw / w));
      const k = yy * dw + xx, i = (y * w + x) * 4;
      acc[k * 4] += rgba[i]; acc[k * 4 + 1] += rgba[i + 1]; acc[k * 4 + 2] += rgba[i + 2]; acc[k * 4 + 3] += rgba[i + 3]; cnt[k]++;
    }
  }
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let k = 0; k < dw * dh; k++) { const c = cnt[k] || 1; for (let j = 0; j < 4; j++) out[k * 4 + j] = acc[k * 4 + j] / c; }
  return { data: out, w: dw, h: dh, s: dw / w };
}

/**
 * Full "smart select" job (what the worker runs).
 * job = { rgba, w, h, mode: 'auto'|'region', region?: Uint8Array(w*h) 0..255 (inside of box/loop),
 *         prior?: Uint8Array(w*h) existing mask (0..255) }
 * Returns { mask: Uint8Array(w*h) 0/255 labels at this (small) size, ms }.
 */
export function runSmartSelect(job) {
  const t0 = Date.now();
  const { rgba, w, h } = job;
  let trimap;
  if (job.mode === 'auto') {
    trimap = subjectTrimap(rgba, w, h).trimap;
  } else {
    trimap = new Uint8Array(w * h);
    const reg = job.region;
    // inside the user's region: probably foreground; a narrow ring just inside the edge stays "probably background"
    // so loose loops don't force background into the result.
    for (let i = 0; i < w * h; i++) trimap[i] = reg[i] > 127 ? T_PR_FG : T_BG;
    if (job.hint) { // optional saliency hint inside the region
      const sal = saliency(rgba, w, h);
      let mean = 0, c = 0;
      for (let i = 0; i < w * h; i++) if (reg[i] > 127) { mean += sal[i]; c++; }
      mean /= c || 1;
      for (let i = 0; i < w * h; i++) if (reg[i] > 127 && sal[i] < mean * 0.35) trimap[i] = T_PR_BG;
    }
  }
  let lab = grabCut(rgba, w, h, trimap, { iters: job.iters || 5 });
  if (job.mode === 'auto' || job.clean) lab = cleanLabels(lab, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = lab[i] ? 255 : 0;
  return { mask, ms: Date.now() - t0 };
}

export { clamp };
