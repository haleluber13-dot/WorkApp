// Photo studio — magnetic lasso: livewire shortest paths on an edge-cost map.
// The cost of stepping onto a pixel is low on strong edges, so the path between the last anchor and
// the pointer hugs the outline. Dijkstra runs only inside a window around the two points.

import { clamp, gradientMag, gaussBlur, lumaOf, percentile } from './util.js';

/** Edge-cost map (Float32, 0.03..1) + gradient magnitude, from RGBA. */
export function edgeCost(rgba, W, H) {
  const n = W * H;
  // colour-aware gradient: max of luminance gradient and chroma gradients
  const L = lumaOf(rgba, n);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { A[i] = (rgba[i * 4] - rgba[i * 4 + 1]) / 255; B[i] = (rgba[i * 4 + 2] - rgba[i * 4 + 1]) / 255; }
  gaussBlur(L, W, H, 0.9); gaussBlur(A, W, H, 1.2); gaussBlur(B, W, H, 1.2);
  const g = gradientMag(L, W, H), ga = gradientMag(A, W, H), gb = gradientMag(B, W, H);
  for (let i = 0; i < n; i++) g[i] = Math.max(g[i], 0.7 * ga[i], 0.7 * gb[i]);
  const ref = Math.max(1e-4, percentile(g, 0.97, 0, 4, 3));
  const cost = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, g[i] / ref);
    cost[i] = 0.03 + 0.97 * (1 - t) * (1 - t);
  }
  return { cost, grad: g, ref };
}

/** Move (x, y) to the strongest edge within radius r. */
export function snapToEdge(grad, W, H, x, y, r) {
  const cx = Math.round(x), cy = Math.round(y);
  let best = -1, bx = clamp(cx, 0, W - 1), by = clamp(cy, 0, H - 1);
  const R = Math.max(1, Math.round(r));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const xx = cx + dx, yy = cy + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 > R * R) continue;
    const v = grad[yy * W + xx] * (1 - 0.35 * d2 / (R * R)); // prefer closer edges
    if (v > best) { best = v; bx = xx; by = yy; }
  }
  return [bx, by];
}

// binary min-heap on (key: Float64 dist, value: node)
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) { const k = new Float64Array(this.k.length * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.v.length * 2); v.set(this.v); this.v = v; }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], topK = this.k[0];
    const lk = this.k[--this.n], lv = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lk) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = lk; this.v[i] = lv;
    this.lastKey = topK;
    return top;
  }
}

/**
 * Shortest path from (ax, ay) to (bx, by) on the cost map (8-connected), searching a window that
 * contains both points plus `margin`. Returns [[x,y], ...] from a to b (pixel centres).
 */
export function livewire(cost, W, H, ax, ay, bx, by, margin = 24) {
  ax = clamp(Math.round(ax), 0, W - 1); ay = clamp(Math.round(ay), 0, H - 1);
  bx = clamp(Math.round(bx), 0, W - 1); by = clamp(Math.round(by), 0, H - 1);
  const x0 = Math.max(0, Math.min(ax, bx) - margin), x1 = Math.min(W - 1, Math.max(ax, bx) + margin);
  const y0 = Math.max(0, Math.min(ay, by) - margin), y1 = Math.min(H - 1, Math.max(ay, by) + margin);
  const ww = x1 - x0 + 1, hh = y1 - y0 + 1, n = ww * hh;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const s = (ay - y0) * ww + (ax - x0), t = (by - y0) * ww + (bx - x0);
  const heap = new Heap(Math.min(n * 2, 1 << 16));
  dist[s] = 0; heap.push(0, s);
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], DL = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  while (heap.n) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === t) break;
    const x = i % ww, y = (i - x) / ww;
    const di = dist[i];
    for (let d = 0; d < 8; d++) {
      const xx = x + DX[d], yy = y + DY[d];
      if (xx < 0 || yy < 0 || xx >= ww || yy >= hh) continue;
      const j = yy * ww + xx;
      if (done[j]) continue;
      const nd = di + cost[(yy + y0) * W + xx + x0] * DL[d];
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  const path = [];
  for (let i = t; i >= 0; i = prev[i]) {
    const x = i % ww, y = (i - x) / ww;
    path.push([x + x0 + 0.5, y + y0 + 0.5]);
    if (i === s) break;
  }
  path.reverse();
  return path;
}

/** Light polyline smoothing (keeps endpoints): reduces the pixel staircase of livewire paths. */
export function smoothPath(pts, iters = 2) {
  if (pts.length < 3) return pts;
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q = [p[0]];
    for (let i = 1; i < p.length - 1; i++) q.push([(p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4]);
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
