/* Geometric maker — photo processing.
   Tattoo looks (black & grey, line art, dotwork, stencil, posterize) and the
   geometric effects (low-poly, half & half, polygon mosaic, shattered,
   wireframe), plus "remove plain background". Everything is plain canvas /
   typed-array code; results are { canvas, rect } where rect is where the
   original picture sits inside the canvas (effects like "shattered" spill
   outside it). Ink looks are black ink with alpha = darkness, so they sit on
   skin like real ink and still read as grey on paper. */

import { Delaunay, rng, polyArea } from "./delaunay.js";

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export function ctx2d(c) {
  return c._gctx || (c._gctx = c.getContext("2d", { willReadFrequently: true }));
}
export function fitCanvas(src, maxSide) {
  const w = src.width, h = src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  if (k === 1 && src instanceof HTMLCanvasElement) return src;
  let cur = src, cw = w, ch = h;
  // step down by halves for a cleaner downscale
  while (w * k < cw / 2.2) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    const t = makeCanvas(nw, nh);
    const g = ctx2d(t); g.imageSmoothingQuality = "high"; g.drawImage(cur, 0, 0, nw, nh);
    cur = t; cw = nw; ch = nh;
  }
  const out = makeCanvas(w * k, h * k);
  const g = ctx2d(out); g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [17, 17, 17];
  let s = m[1]; if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const v = parseInt(s, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- blur */
function boxH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + (k < 0 ? 0 : k > w - 1 ? w - 1 : k)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      const add = x + r + 1, sub = x - r;
      acc += src[row + (add > w - 1 ? w - 1 : add)] - src[row + (sub < 0 ? 0 : sub)];
    }
  }
}
function boxV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[(k < 0 ? 0 : k > h - 1 ? h - 1 : k) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      const add = y + r + 1, sub = y - r;
      acc += src[(add > h - 1 ? h - 1 : add) * w + x] - src[(sub < 0 ? 0 : sub) * w + x];
    }
  }
}
export function gauss(src, w, h, sigma) {
  const out = Float32Array.from(src);
  if (sigma < 0.35) return out;
  // three box passes ≈ gaussian
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const tmp = new Float32Array(src.length);
  for (let i = 0; i < n; i++) {
    const r = ((i < m ? wl : wu) - 1) / 2;
    if (r < 1) continue;
    boxH(out, tmp, w, h, r); boxV(tmp, out, w, h, r);
  }
  return out;
}

/* ------------------------------------------------------------ analysis */
const AN = new WeakMap();
export function analyze(src) {
  let an = AN.get(src);
  if (an) return an;
  const work = fitCanvas(src, 1024);
  const W = work.width, H = work.height;
  const data = ctx2d(work).getImageData(0, 0, W, H).data;
  const N = W * H;
  const L = new Float32Array(N), A = new Float32Array(N), Lw = new Float32Array(N);
  let transparent = 0;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const a = data[j + 3] / 255;
    const l = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
    L[i] = l; A[i] = a; Lw[i] = l * a + (1 - a);
    if (a < 0.5) transparent++;
  }
  const hasAlpha = transparent > N * 0.01;
  // auto levels over the subject
  const hist = new Uint32Array(256); let cnt = 0;
  for (let i = 0; i < N; i++) if (A[i] > 0.5) { hist[Math.min(255, (L[i] * 255) | 0)]++; cnt++; }
  let lo = 0, hi = 1;
  if (cnt > 50) {
    let acc = 0;
    for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= cnt * 0.015) { lo = b / 255; break; } }
    acc = 0;
    for (let b = 255; b >= 0; b--) { acc += hist[b]; if (acc >= cnt * 0.015) { hi = b / 255; break; } }
    if (hi - lo < 0.2) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 0.1); hi = Math.min(1, mid + 0.1); }
  }
  const Ln = new Float32Array(N); // levelled luminance on white
  for (let i = 0; i < N; i++) { const l = clamp01((L[i] - lo) / (hi - lo)); Ln[i] = l * A[i] + (1 - A[i]); }
  // small analysis maps for point sampling
  const small = fitCanvas(work, 360);
  const sw = small.width, sh = small.height;
  const sd = ctx2d(small).getImageData(0, 0, sw, sh).data;
  const sL = new Float32Array(sw * sh), sA = new Float32Array(sw * sh);
  for (let i = 0, j = 0; i < sw * sh; i++, j += 4) {
    const a = sd[j + 3] / 255;
    sL[i] = ((0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255) * a + (1 - a);
    sA[i] = a;
  }
  const g = gauss(sL, sw, sh, 1.0);
  const E = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x;
    const gx = -g[i - sw - 1] - 2 * g[i - 1] - g[i + sw - 1] + g[i - sw + 1] + 2 * g[i + 1] + g[i + sw + 1];
    const gy = -g[i - sw - 1] - 2 * g[i - sw] - g[i - sw + 1] + g[i + sw - 1] + 2 * g[i + sw] + g[i + sw + 1];
    E[i] = Math.sqrt(gx * gx + gy * gy);
  }
  const sorted = Float32Array.from(E).sort();
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  for (let i = 0; i < E.length; i++) E[i] = Math.min(1, E[i] / (p95 || 1));
  const As = gauss(sA, sw, sh, 1.2);
  // content bounds (alpha)
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A[y * W + x] > 0.5) {
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (bx1 < 0) { bx0 = 0; by0 = 0; bx1 = W - 1; by1 = H - 1; }
  an = { work, W, H, data, L, A, Lw, Ln, hasAlpha, sw, sh, E, As, bounds: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
  AN.set(src, an);
  return an;
}

/* ------------------------------------------------------- point sampling */
export function samplePoints(an, n, seed = 1, { edge = 1, boundary = 1, base = 0.1 } = {}) {
  const { sw, sh, E, As, W, H, hasAlpha } = an;
  const k = W / sw;
  const R = rng(seed * 7919 + n);
  const cdf = new Float64Array(sw * sh);
  let tot = 0, areaPix = 0;
  for (let i = 0; i < sw * sh; i++) {
    const a = As[i], e = E[i];
    let wv;
    if (hasAlpha) {
      wv = a < 0.05 ? 0.01 : base + Math.pow(e, 0.8) * edge;
      if (a > 0.08 && a < 0.92) wv += 1.6 * boundary;
      if (a >= 0.05) areaPix++;
    } else { wv = base + Math.pow(e, 0.8) * edge; areaPix++; }
    tot += wv; cdf[i] = tot;
  }
  const area = Math.max(1, areaPix) * k * k;
  const dmin = 0.56 * Math.sqrt(area / n);
  const cs = dmin / Math.SQRT2;
  const gw = Math.ceil(W / cs) + 1, gh = Math.ceil(H / cs) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const d2 = dmin * dmin;
  const fits = (x, y) => {
    const gx = (x / cs) | 0, gy = (y / cs) | 0;
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++)
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const p = grid[yy * gw + xx];
        if (p >= 0) { const dx = pts[2 * p] - x, dy = pts[2 * p + 1] - y; if (dx * dx + dy * dy < d2) return false; }
      }
    return true;
  };
  const put = (x, y) => {
    const id = pts.length / 2; pts.push(x, y);
    const gi = ((y / cs) | 0) * gw + ((x / cs) | 0);
    if (grid[gi] === -1) grid[gi] = id;
  };
  // frame first so the triangulation always covers the picture
  const bs = Math.sqrt((W * H) / n) * (hasAlpha ? 2.6 : 1.25);
  const nx = Math.max(2, Math.round(W / bs)), ny = Math.max(2, Math.round(H / bs));
  for (let i = 0; i <= nx; i++) { const x = (i / nx) * W; put(x, 0); put(x, H); }
  for (let j = 1; j < ny; j++) { const y = (j / ny) * H; put(0, y); put(W, y); }
  let tries = 0, got = 0;
  while (got < n && tries < n * 30) {
    tries++;
    const u = R() * tot;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
    const x = ((lo % sw) + R()) * k, y = (((lo / sw) | 0) + R()) * k;
    if (x <= 1 || y <= 1 || x >= W - 1 || y >= H - 1) continue;
    if (!fits(x, y)) continue;
    put(x, y); got++;
  }
  return new Float64Array(pts);
}

/* Average colour/alpha of each triangle (scanline over pixel centres). */
function triangleStats(an, coords, tris) {
  const { W, H, data } = an;
  const nt = tris.length / 3;
  const out = new Float32Array(nt * 5); // r g b a(avg) count
  for (let t = 0; t < nt; t++) {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const P = [[coords[2 * a], coords[2 * a + 1]], [coords[2 * b], coords[2 * b + 1]], [coords[2 * c], coords[2 * c + 1]]];
    P.sort((p, q) => p[1] - q[1]);
    let r = 0, g = 0, bl = 0, al = 0, n = 0;
    const y0 = Math.max(0, Math.ceil(P[0][1] - 0.5)), y1 = Math.min(H - 1, Math.floor(P[2][1] - 0.5));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xa = edgeX(P[0], P[2], yc);
      const xb = yc < P[1][1] ? edgeX(P[0], P[1], yc) : edgeX(P[1], P[2], yc);
      let xl = Math.min(xa, xb), xr = Math.max(xa, xb);
      const x0 = Math.max(0, Math.ceil(xl - 0.5)), x1 = Math.min(W - 1, Math.floor(xr - 0.5));
      let j = (y * W + x0) * 4;
      for (let x = x0; x <= x1; x++, j += 4) {
        const aa = data[j + 3];
        r += data[j] * aa; g += data[j + 1] * aa; bl += data[j + 2] * aa; al += aa; n++;
      }
    }
    if (n === 0) { // tiny triangle: sample centroid
      const cx = Math.min(W - 1, Math.max(0, ((P[0][0] + P[1][0] + P[2][0]) / 3) | 0));
      const cy = Math.min(H - 1, Math.max(0, ((P[0][1] + P[1][1] + P[2][1]) / 3) | 0));
      const j = (cy * W + cx) * 4, aa = data[j + 3];
      r = data[j] * aa; g = data[j + 1] * aa; bl = data[j + 2] * aa; al = aa; n = 1;
    }
    const o = t * 5;
    if (al > 0) { out[o] = r / al; out[o + 1] = g / al; out[o + 2] = bl / al; }
    out[o + 3] = al / n / 255; out[o + 4] = n;
  }
  return out;
}
function edgeX(p, q, y) {
  if (Math.abs(q[1] - p[1]) < 1e-9) return p[0];
  return p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]);
}

function triangulate(an, n, seed, opts) {
  const coords = samplePoints(an, n, seed, opts);
  const d = new Delaunay(coords);
  const stats = triangleStats(an, coords, d.triangles);
  return { coords, d, stats, tris: d.triangles };
}

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
function facetColor(stats, t, grey, pop = 1.12) {
  const o = t * 5;
  let r = stats[o], g = stats[o + 1], b = stats[o + 2];
  if (grey) { const l = lum(r, g, b) * 255; r = g = b = l; }
  // a little extra contrast/saturation so facets read clearly
  const m = (r + g + b) / 3;
  r = m + (r - m) * pop; g = m + (g - m) * pop; b = m + (b - m) * pop;
  const c = (v) => Math.max(0, Math.min(255, Math.round((v - 128) * 1.06 + 128)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function triPath(g, coords, tris, t) {
  const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
  g.moveTo(coords[2 * a], coords[2 * a + 1]);
  g.lineTo(coords[2 * b], coords[2 * b + 1]);
  g.lineTo(coords[2 * c], coords[2 * c + 1]);
  g.closePath();
}

/* Convert an opaque-ish grey/colour canvas into ink: rgb = ink, alpha = darkness. */
export function toInk(canvas, ink, { gamma = 1, cut = 0 } = {}) {
  const g = ctx2d(canvas);
  const im = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = im.data;
  const [ir, ig, ib] = hexToRgb(ink);
  for (let j = 0; j < d.length; j += 4) {
    const a = d[j + 3] / 255;
    if (a === 0) continue;
    let dark = 1 - lum(d[j], d[j + 1], d[j + 2]);
    if (gamma !== 1) dark = Math.pow(dark, gamma);
    if (dark < cut) dark = 0;
    d[j] = ir; d[j + 1] = ig; d[j + 2] = ib; d[j + 3] = Math.round(255 * a * dark);
  }
  g.putImageData(im, 0, 0);
  return canvas;
}

function fromAlphaMap(W, H, M, ink) {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const im = g.createImageData(W, H);
  const d = im.data;
  const [ir, ig, ib] = hexToRgb(ink);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    const a = M[i];
    if (a <= 0.004) continue;
    d[j] = ir; d[j + 1] = ig; d[j + 2] = ib; d[j + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
  return c;
}
const whole = (c) => ({ canvas: c, rect: { x: 0, y: 0, w: c.width, h: c.height } });

/* ---------------------------------------------------------------- looks */
export function lookBW(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, Ln, A } = an;
  const M = new Float32Array(W * H);
  const con = 0.75 + (fx.contrast ?? 0.5) * 0.8;
  for (let i = 0; i < W * H; i++) {
    if (A[i] < 0.01) continue;
    let d = 1 - Ln[i];
    d = clamp01((d - 0.5) * con + 0.5);
    M[i] = Math.pow(d, 1.05);
  }
  return whole(fromAlphaMap(W, H, M, ink));
}

function lineMap(an, detail = 0.5) {
  const { W, H, Ln, A, hasAlpha } = an;
  const s = Math.max(W, H) / 760;
  const sig = 0.75 * s + 0.25;
  const g1 = gauss(Ln, W, H, sig), g2 = gauss(Ln, W, H, sig * 1.7);
  const D = new Float32Array(W * H);
  const hist = new Uint32Array(512); let cnt = 0;
  for (let i = 0; i < W * H; i++) {
    const v = g2[i] - g1[i]; // >0 on the dark side of an edge
    D[i] = v;
    if (v > 0.002) { hist[Math.min(511, (v * 2048) | 0)]++; cnt++; }
  }
  // adaptive threshold: keep roughly the strongest edges, more with detail
  let p = 0.03;
  if (cnt > 100) {
    const want = cnt * (0.93 - detail * 0.3);
    let acc = 0;
    for (let b = 0; b < 512; b++) { acc += hist[b]; if (acc >= want) { p = b / 2048; break; } }
  }
  const thr = Math.min(0.06, Math.max(0.006, p * (1.25 - detail * 0.6)));
  const M = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) M[i] = smooth(thr * 0.7, thr * 1.25, D[i]);
  if (hasAlpha) {
    const ga = gauss(A, W, H, 0.9 * s + 0.3);
    for (let i = 0; i < W * H; i++) {
      const v = 1 - Math.abs(ga[i] - 0.5) / 0.22;
      if (v > 0) M[i] = Math.max(M[i], smooth(0, 0.6, v));
    }
  }
  return M;
}
export function lookLine(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  return whole(fromAlphaMap(an.W, an.H, lineMap(an, fx.detail ?? 0.5), ink));
}

export function lookDots(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, Ln, A } = an;
  const cell = Math.max(2.2, (fx.dotSize ?? 4) * Math.max(W, H) / 1024);
  const gw = Math.max(2, Math.floor(W / cell)), gh = Math.max(2, Math.floor(H / cell));
  const sm = gauss(Ln, W, H, cell * 0.45);
  const D = new Float32Array(gw * gh);
  const con = 0.8 + (fx.contrast ?? 0.5) * 0.7;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const px = Math.min(W - 1, ((x + 0.5) * W / gw) | 0), py = Math.min(H - 1, ((y + 0.5) * H / gh) | 0);
    const i = py * W + px;
    let d = (1 - sm[i]) * (A[i] > 0.3 ? 1 : 0);
    d = clamp01((d - 0.5) * con + 0.5);
    d = Math.pow(d, 1.25);
    D[y * gw + x] = d < 0.06 ? 0 : d;
  }
  // Floyd–Steinberg (serpentine) → stipple
  const out = makeCanvas(W, H), g = ctx2d(out);
  g.fillStyle = ink;
  const R = rng(17);
  const rad = cell * 0.42;
  g.beginPath();
  for (let y = 0; y < gh; y++) {
    const ltr = y % 2 === 0;
    for (let k = 0; k < gw; k++) {
      const x = ltr ? k : gw - 1 - k, i = y * gw + x;
      const v = D[i], q = v > 0.5 + (R() - 0.5) * 0.35 ? 1 : 0, err = v - q;
      const dx = ltr ? 1 : -1;
      if (x + dx >= 0 && x + dx < gw) D[i + dx] += err * 7 / 16;
      if (y + 1 < gh) {
        if (x - dx >= 0 && x - dx < gw) D[i + gw - dx] += err * 3 / 16;
        D[i + gw] += err * 5 / 16;
        if (x + dx >= 0 && x + dx < gw) D[i + gw + dx] += err * 1 / 16;
      }
      if (q) {
        const cx = (x + 0.5) * W / gw + (R() - 0.5) * cell * 0.5;
        const cy = (y + 0.5) * H / gh + (R() - 0.5) * cell * 0.5;
        const r = rad * (0.8 + R() * 0.35);
        g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
  }
  g.fill();
  return whole(out);
}

function otsu(vals, mask) {
  const hist = new Float64Array(256); let n = 0;
  for (let i = 0; i < vals.length; i++) if (!mask || mask[i] > 0.5) { hist[Math.min(255, (vals[i] * 255) | 0)]++; n++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr / 255;
}

export function lookStencil(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, Ln, A } = an;
  const s = Math.max(W, H) / 760;
  const sm = gauss(Ln, W, H, 2.2 * s);
  const t1 = otsu(sm, A);
  const t2 = t1 * 0.55;
  const lv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) lv[i] = A[i] < 0.5 ? 0 : sm[i] < t2 ? 2 : sm[i] < t1 ? 1 : 0;
  const B = new Float32Array(W * H);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x;
    if (lv[i] !== lv[i + 1] || lv[i] !== lv[i + W]) { B[i] = 1; B[i + 1] = 1; B[i + W] = 1; }
  }
  const Bb = gauss(B, W, H, 0.7 * s);
  const L = lineMap(an, (fx.detail ?? 0.5) * 0.6);
  const M = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) M[i] = Math.max(smooth(0.22, 0.5, Bb[i]), L[i] > 0.55 ? 1 : 0);
  return whole(fromAlphaMap(W, H, M, ink));
}

export function lookPosterize(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, Ln, A } = an;
  const n = Math.max(2, Math.min(7, Math.round(fx.levels ?? 4)));
  const s = Math.max(W, H) / 760;
  const sm = gauss(Ln, W, H, 1.4 * s);
  const M = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (A[i] < 0.5) continue;
    const d = 1 - sm[i];
    M[i] = Math.round(d * (n - 1) + 0.15) / (n - 1);
  }
  const Mb = gauss(M, W, H, 0.6);
  return whole(fromAlphaMap(W, H, Mb, ink));
}

export function lookOriginal(src) {
  return { canvas: src, rect: { x: 0, y: 0, w: src.width, h: src.height } };
}

/* -------------------------------------------------------- geometric fx */
export const detailToPoints = {
  lowpoly: (d) => Math.round(160 + d * d * 3400),
  half: (d) => Math.round(160 + d * d * 2400),
  wire: (d) => Math.round(70 + d * d * 1100),
  mosaic: (d) => Math.round(90 + d * d * 2600),
  shatter: (d) => Math.round(60 + d * d * 700),
};

function strokeEdges(g, coords, tris, keep) {
  const nt = tris.length / 3;
  const seen = new Set();
  g.beginPath();
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + (k + 1) % 3];
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      g.moveTo(coords[2 * a], coords[2 * a + 1]);
      g.lineTo(coords[2 * b], coords[2 * b + 1]);
    }
  }
  g.stroke();
}
function vertexDots(g, coords, tris, keep, r) {
  if (r <= 0) return;
  const used = new Set();
  const nt = tris.length / 3;
  for (let t = 0; t < nt; t++) if (keep[t]) for (let k = 0; k < 3; k++) used.add(tris[3 * t + k]);
  g.beginPath();
  for (const p of used) {
    const x = coords[2 * p], y = coords[2 * p + 1];
    g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.fill();
}
function keepMask(stats, nt, an, minCov = 0.5) {
  const keep = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) keep[t] = !an.hasAlpha || stats[t * 5 + 3] >= minCov ? 1 : 0;
  return keep;
}
const lineScale = (an) => Math.max(an.W, an.H) / 1024;

function drawFacets(g, T, keep, grey, pop) {
  const { coords, tris, stats } = T;
  const nt = tris.length / 3;
  g.lineJoin = "round";
  g.lineWidth = 0.9;
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    const col = facetColor(stats, t, grey, pop);
    g.beginPath(); triPath(g, coords, tris, t);
    g.fillStyle = col; g.strokeStyle = col;
    g.fill(); g.stroke();
  }
}

function wireStyle(g, kind, ink, w) {
  g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round";
  if (kind === "light") { g.strokeStyle = "rgba(255,255,255,.55)"; g.fillStyle = "rgba(255,255,255,.75)"; }
  else { g.strokeStyle = ink; g.fillStyle = ink; }
}

export function fxLowPoly(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const T = triangulate(an, detailToPoints.lowpoly(fx.detail ?? 0.5), fx.seed ?? 1);
  const nt = T.tris.length / 3;
  const keep = keepMask(T.stats, nt, an);
  const grey = fx.color === "grey";
  const out = makeCanvas(an.W, an.H), g = ctx2d(out);
  drawFacets(g, T, keep, grey, 1.12);
  if (grey) toInk(out, ink, { gamma: 1.1 });
  if (fx.wire && fx.wire !== "none") {
    const ls = lineScale(an);
    wireStyle(g, fx.wire, ink, (fx.lineW ?? 1.2) * ls);
    strokeEdges(g, T.coords, T.tris, keep);
    vertexDots(g, T.coords, T.tris, keep, (fx.vdots ?? 0) * ls);
  }
  return whole(out);
}

export function fxWire(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const T = triangulate(an, detailToPoints.wire(fx.detail ?? 0.45), fx.seed ?? 1, { edge: 2.6, boundary: 1.0, base: 0.04 });
  const nt = T.tris.length / 3;
  const keep = keepMask(T.stats, nt, an);
  const out = makeCanvas(an.W, an.H), g = ctx2d(out);
  const ls = lineScale(an);
  const shade = fx.shade ?? 0.5;
  if (shade > 0) {
    const tmp = makeCanvas(an.W, an.H), tg = ctx2d(tmp);
    drawFacets(tg, T, keep, true, 1.15);
    toInk(tmp, ink, { gamma: 1.25 });
    g.globalAlpha = shade; g.drawImage(tmp, 0, 0); g.globalAlpha = 1;
  }
  wireStyle(g, "dark", ink, (fx.lineW ?? 1.6) * ls);
  strokeEdges(g, T.coords, T.tris, keep);
  vertexDots(g, T.coords, T.tris, keep, (fx.vdots ?? 3) * ls);
  return whole(out);
}

/* Side-A renderers for half & half / shattered. */
function sideImage(src, kind, fx, ink) {
  if (kind === "bw") return lookBW(src, fx, ink).canvas;
  if (kind === "line") return lookLine(src, fx, ink).canvas;
  if (kind === "dots") return lookDots(src, { ...fx, dotSize: fx.dotSize ?? 3.2 }, ink).canvas;
  return analyze(src).work;
}

export function fxHalf(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, bounds } = an;
  const T = triangulate(an, detailToPoints.half(fx.detail ?? 0.45), fx.seed ?? 1, { edge: 1.8, base: 0.06 });
  const { coords, tris, stats } = T;
  const nt = tris.length / 3;
  const ang = ((fx.angle ?? 0) * Math.PI) / 180;
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
  const ext = Math.abs(nx) * (bounds.x1 - bounds.x0) + Math.abs(ny) * (bounds.y1 - bounds.y0);
  const ox = cx + nx * ((fx.pos ?? 0.5) - 0.5) * ext, oy = cy + ny * ((fx.pos ?? 0.5) - 0.5) * ext;
  const R = rng((fx.seed ?? 1) * 31 + 5);
  const trans = (fx.trans ?? 0.2) * ext * 0.35;
  const geo = new Uint8Array(nt);
  const keep = keepMask(stats, nt, an);
  for (let t = 0; t < nt; t++) {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const mx = (coords[2 * a] + coords[2 * b] + coords[2 * c]) / 3, my = (coords[2 * a + 1] + coords[2 * b + 1] + coords[2 * c + 1]) / 3;
    const s = (mx - ox) * nx + (my - oy) * ny;
    geo[t] = s + (R() * 2 - 1) * trans > 0 ? 1 : 0;
  }
  const out = makeCanvas(W, H), g = ctx2d(out);
  // side A: the picture, everywhere except the geometric triangles
  const A = sideImage(src, fx.sideA || "photo", fx, ink);
  g.save();
  g.beginPath(); g.rect(0, 0, W, H);
  for (let t = 0; t < nt; t++) if (geo[t]) triPath(g, coords, tris, t);
  g.clip("evenodd");
  g.drawImage(A, 0, 0, W, H);
  g.restore();
  // side B: low-poly and/or wireframe
  const sideB = fx.sideB || "lowpoly";
  const gk = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) gk[t] = geo[t] && keep[t];
  const ls = lineScale(an);
  if (sideB === "lowpoly" || sideB === "both") {
    const tmp = makeCanvas(W, H), tg = ctx2d(tmp);
    const grey = fx.color === "grey" || (fx.sideA === "bw" && fx.color !== "color");
    drawFacets(tg, T, gk, grey, 1.12);
    if (grey) toInk(tmp, ink, { gamma: 1.1 });
    g.drawImage(tmp, 0, 0);
  } else if ((fx.shade ?? 0.45) > 0) {
    const tmp = makeCanvas(W, H), tg = ctx2d(tmp);
    drawFacets(tg, T, gk, true, 1.15);
    toInk(tmp, ink, { gamma: 1.25 });
    g.globalAlpha = fx.shade ?? 0.45; g.drawImage(tmp, 0, 0); g.globalAlpha = 1;
  }
  if (sideB === "wire" || sideB === "both") {
    wireStyle(g, sideB === "both" ? (fx.wire === "dark" ? "dark" : "light") : "dark", ink, (fx.lineW ?? 1.5) * ls);
    strokeEdges(g, coords, tris, gk);
    vertexDots(g, coords, tris, gk, (fx.vdots ?? 2.5) * ls);
  } else if (fx.wire && fx.wire !== "none") {
    wireStyle(g, fx.wire, ink, (fx.lineW ?? 1) * ls);
    strokeEdges(g, coords, tris, gk);
    vertexDots(g, coords, tris, gk, (fx.vdots ?? 0) * ls);
  }
  return whole(out);
}

/* Voronoi cells for the picture (frame points keep every cell bounded). */
function cellsFor(an, n, seed, opts) {
  const pts = samplePoints(an, n, seed, opts);
  const { W, H } = an;
  const m = pts.length / 2;
  const c = new Float64Array(pts.length + 8);
  c.set(pts);
  const F = Math.max(W, H) * 10;
  c.set([-F, -F, W + F, -F, W + F, H + F, -F, H + F], pts.length);
  // nudge the frame-of-picture points a hair inside so cells don't degenerate
  for (let i = 0; i < m; i++) { c[2 * i] = Math.min(W - 0.01, Math.max(0.01, c[2 * i])); c[2 * i + 1] = Math.min(H - 0.01, Math.max(0.01, c[2 * i + 1])); }
  const d = new Delaunay(c);
  const cells = d.voronoi(m, 0, 0, W, H);
  return { pts: c, cells };
}
function polyStats(an, poly) {
  // fan-triangulate the convex cell and reuse the triangle sampler
  const coords = [], tris = [];
  for (const p of poly) coords.push(p[0], p[1]);
  for (let i = 1; i < poly.length - 1; i++) tris.push(0, i, i + 1);
  const st = triangleStats(an, coords, tris);
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let t = 0; t < tris.length / 3; t++) {
    const o = t * 5, cnt = st[o + 4], w = cnt * st[o + 3];
    r += st[o] * w; g += st[o + 1] * w; b += st[o + 2] * w; a += st[o + 3] * cnt; n += cnt;
  }
  const wsum = a || 1;
  return { r: r / wsum, g: g / wsum, b: b / wsum, a: n ? a / n : 0 };
}
function insetConvex(poly, d) {
  if (d <= 0) return poly;
  const n = poly.length;
  let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    let nx = -dy / l, ny = dx / l;
    if (nx * (cx - p[0]) + ny * (cy - p[1]) < 0) { nx = -nx; ny = -ny; }
    lines.push([p[0] + nx * d, p[1] + ny * d, dx, dy]);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[(i + lines.length - 1) % lines.length], b = lines[i];
    const den = a[2] * b[3] - a[3] * b[2];
    if (Math.abs(den) < 1e-9) { out.push([b[0], b[1]]); continue; }
    const t = ((b[0] - a[0]) * b[3] - (b[1] - a[1]) * b[2]) / den;
    out.push([a[0] + a[2] * t, a[1] + a[3] * t]);
  }
  const A0 = polyArea(poly), A1 = polyArea(out);
  return out.length >= 3 && A0 * A1 > 0 && Math.abs(A1) < Math.abs(A0) && Math.abs(A1) > 2 ? out : null;
}
function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

export function fxMosaic(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H } = an;
  const { cells } = cellsFor(an, detailToPoints.mosaic(fx.detail ?? 0.5), fx.seed ?? 1, { edge: 0.8 });
  const out = makeCanvas(W, H), g = ctx2d(out);
  const grey = fx.color === "grey";
  const gap = (fx.gap ?? 1.5) * lineScale(an);
  const polys = [];
  for (const cell of cells) {
    if (!cell) continue;
    const st = polyStats(an, cell);
    if (an.hasAlpha && st.a < 0.5) continue;
    polys.push({ cell, st });
  }
  if (fx.linesOnly) {
    wireStyle(g, "dark", ink, (fx.lineW ?? 1.6) * lineScale(an));
    g.beginPath();
    for (const { cell } of polys) { cell.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); }
    g.stroke();
    return whole(out);
  }
  for (const { cell, st } of polys) {
    const p = gap > 0 ? insetConvex(cell, gap / 2) : cell;
    if (!p) continue;
    let r = st.r, gg = st.g, b = st.b;
    if (grey) { r = gg = b = lum(r, gg, b) * 255; }
    const col = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
    g.fillStyle = col; g.fill();
    if (gap <= 0) { g.strokeStyle = col; g.lineWidth = 0.8; g.stroke(); }
  }
  if (grey) toInk(out, ink, { gamma: 1.1 });
  if (fx.wire && fx.wire !== "none") {
    wireStyle(g, fx.wire, ink, (fx.lineW ?? 1.4) * lineScale(an));
    g.beginPath();
    for (const { cell } of polys) { cell.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); }
    g.stroke();
  }
  return whole(out);
}

export function fxShatter(src, fx = {}, ink = "#141414") {
  const an = analyze(src);
  const { W, H, bounds } = an;
  const spread = fx.spread ?? 0.5;
  const M = Math.round(Math.max(W, H) * (0.08 + spread * 0.45));
  const out = makeCanvas(W + 2 * M, H + 2 * M), g = ctx2d(out);
  const { cells } = cellsFor(an, detailToPoints.shatter(fx.detail ?? 0.5), (fx.seed ?? 1) + 3, { edge: 0.6 });
  const ang = ((fx.angle ?? 0) * Math.PI) / 180;
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
  const ext = Math.abs(nx) * (bounds.x1 - bounds.x0) + Math.abs(ny) * (bounds.y1 - bounds.y0) || 1;
  const ox = cx + nx * ((fx.pos ?? 0.45) - 0.5) * ext, oy = cy + ny * ((fx.pos ?? 0.45) - 0.5) * ext;
  const R = rng((fx.seed ?? 1) * 13 + 7);
  const A = sideImage(src, fx.sideA || "photo", fx, ink);
  const intact = [], broken = [];
  for (const cell of cells) {
    if (!cell) continue;
    const st = polyStats(an, cell);
    if (an.hasAlpha && st.a < 0.35) continue;
    let mx = 0, my = 0; for (const p of cell) { mx += p[0]; my += p[1]; } mx /= cell.length; my /= cell.length;
    const s = ((mx - ox) * nx + (my - oy) * ny) / ext;
    if (s + (R() - 0.5) * 0.12 <= 0) intact.push(cell); else broken.push({ cell, s: Math.max(0, s), mx, my });
  }
  g.save(); g.translate(M, M);
  // intact part in one clip so there are no seams
  g.save(); g.beginPath();
  for (const cell of intact) { cell.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); }
  g.clip(); g.drawImage(A, 0, 0, W, H); g.restore();
  const half = (bounds.x1 - bounds.x0 + bounds.y1 - bounds.y0) / 2;
  for (const { cell, s, mx, my } of broken) {
    const t = Math.min(1.4, s * 1.6);
    if (R() < Math.pow(Math.min(1, t), 1.6) * 0.45) continue; // some pieces fly away
    const d = spread * half * 0.9 * Math.pow(t, 1.35);
    const jx = (R() - 0.5) * d * 0.55, jy = (R() - 0.5) * d * 0.55;
    const dx = nx * d + jx - ny * (R() - 0.5) * d * 0.35, dy = ny * d + jy + nx * (R() - 0.5) * d * 0.35;
    const rot = (R() - 0.5) * 0.9 * Math.min(1, t) * spread;
    const sc = 1 - 0.35 * Math.min(1, t) * R();
    g.save();
    g.translate(mx + dx, my + dy); g.rotate(rot); g.scale(sc, sc); g.translate(-mx, -my);
    g.beginPath(); cell.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
    g.save(); g.clip(); g.drawImage(A, 0, 0, W, H); g.restore();
    if (fx.wire && fx.wire !== "none") { wireStyle(g, fx.wire, ink, (fx.lineW ?? 1.2) * lineScale(an) / sc); g.stroke(); }
    g.restore();
  }
  g.restore();
  return { canvas: out, rect: { x: M, y: M, w: W, h: H } };
}

/* ------------------------------------------------- background removal */
export function removePlainBackground(src, tol = 0.16) {
  const work = fitCanvas(src, 520);
  const w = work.width, h = work.height;
  const d = ctx2d(work).getImageData(0, 0, w, h).data;
  // border colours → up to 3 clusters
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { border.push(y * w, y * w + w - 1); }
  let cents = [[d[0], d[1], d[2]], [d[(w - 1) * 4], d[(w - 1) * 4 + 1], d[(w - 1) * 4 + 2]], [d[((h - 1) * w) * 4], d[((h - 1) * w) * 4 + 1], d[((h - 1) * w) * 4 + 2]]];
  const cdist = (r, g, b, c) => Math.sqrt(2 * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 + 3 * (b - c[2]) ** 2) / (3 * 255);
  for (let it = 0; it < 6; it++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (const i of border) {
      const j = i * 4; let best = 0, bd = 9;
      cents.forEach((c, k) => { const v = cdist(d[j], d[j + 1], d[j + 2], c); if (v < bd) { bd = v; best = k; } });
      const a = acc[best]; a[0] += d[j]; a[1] += d[j + 1]; a[2] += d[j + 2]; a[3]++;
    }
    cents = cents.map((c, k) => (acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : c));
    if (it === 5) cents = cents.filter((c, k) => acc[k][3] > border.length * 0.1);
  }
  const near = (j) => { let m = 9; for (const c of cents) m = Math.min(m, cdist(d[j], d[j + 1], d[j + 2], c)); return m; };
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (const i of border) if (!bg[i] && d[i * 4 + 3] > 10 && near(i * 4) < tol) { bg[i] = 1; stack.push(i); }
  for (const i of border) if (d[i * 4 + 3] <= 10) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0, j = i * 4;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const k of nb) {
      if (k < 0 || bg[k]) continue;
      const q = k * 4;
      if (d[q + 3] <= 10) { bg[k] = 1; stack.push(k); continue; }
      const dn = near(q);
      const step = cdist(d[q], d[q + 1], d[q + 2], [d[j], d[j + 1], d[j + 2]]);
      if (dn < tol || (step < tol * 0.22 && dn < tol * 2)) { bg[k] = 1; stack.push(k); }
    }
  }
  // drop small foreground specks
  const lab = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (bg[i] || lab[i] >= 0) continue;
    const id = sizes.length; let n = 0; const st = [i]; lab[i] = id;
    while (st.length) {
      const p = st.pop(); n++;
      const x = p % w, y = (p / w) | 0;
      for (const k of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
        if (k >= 0 && !bg[k] && lab[k] < 0) { lab[k] = id; st.push(k); }
    }
    sizes.push(n);
  }
  const big = Math.max(...sizes, 0);
  const F = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) F[i] = !bg[i] && sizes[lab[i]] >= Math.max(30, big * 0.02) ? 1 : 0;
  // fill holes fully enclosed by the subject (eyes etc.) are kept as they are; soften the edge
  const Fs = gauss(F, w, h, 0.9);
  for (let i = 0; i < w * h; i++) Fs[i] = smooth(0.35, 0.85, Fs[i]);
  // apply the mask to the full-resolution picture
  const mask = makeCanvas(w, h), mg = ctx2d(mask);
  const mi = mg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { mi.data[i * 4 + 3] = Math.round(Fs[i] * 255); }
  mg.putImageData(mi, 0, 0);
  const out = makeCanvas(src.width, src.height), og = ctx2d(out);
  og.drawImage(src, 0, 0);
  og.globalCompositeOperation = "destination-in";
  og.imageSmoothingQuality = "high";
  og.drawImage(mask, 0, 0, out.width, out.height);
  og.globalCompositeOperation = "source-over";
  const kept = F.reduce((a, b) => a + b, 0) / (w * h);
  out._kept = kept;
  return out;
}

/* ------------------------------------------------------------ dispatch */
export const LOOKS = {
  original: lookOriginal, bw: lookBW, line: lookLine, dots: lookDots, stencil: lookStencil,
  posterize: lookPosterize, lowpoly: fxLowPoly, half: fxHalf, mosaic: fxMosaic, shatter: fxShatter, wire: fxWire,
};
export function processPhoto(src, look, fx, ink) {
  const f = LOOKS[look] || lookOriginal;
  return f(src, fx || {}, ink || "#141414");
}

/* Trim transparent margins. */
export function trimCanvas(c, pad = 4, thr = 4) {
  const w = c.width, h = c.height;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > thr) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx2d(out).drawImage(c, -x0, -y0);
  return out;
}
