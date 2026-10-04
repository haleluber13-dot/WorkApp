// Photo → tattoo stencil conversion (pure canvas/typed-array image processing).
// Modes:
//   "edges"     Canny-style: blur → Sobel → non-max suppression → hysteresis → AA line weight
//   "threshold" adaptive (local mean) threshold → smoothed, anti-aliased ink shapes
//   "scan"      clean up scanned / drawn line art: luminance → alpha (white becomes transparent)
// Optional "shadows" adds solid ink for the darkest areas; "cleanup" removes small specks.

export const STENCIL_DEFAULTS = { mode: 'edges', detail: 55, threshold: 50, weight: 3, shadows: 0, cleanup: 40, color: '#000000' };

function luminance(img) {
  const { width: w, height: h, data: d } = img;
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; p < L.length; i += 4, p++) {
    const a = d[i + 3] / 255;
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    L[p] = l * a + (1 - a); // composite over white
  }
  return L;
}

function normalize(L) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < L.length; i++) hist[Math.min(255, (L[i] * 255) | 0)]++;
  const lo = pct(hist, L.length, 0.01) / 255, hi = pct(hist, L.length, 0.99) / 255;
  const s = hi - lo > 0.05 ? 1 / (hi - lo) : 1;
  for (let i = 0; i < L.length; i++) L[i] = Math.max(0, Math.min(1, (L[i] - lo) * s));
}
function pct(hist, n, q) {
  let acc = 0; const t = n * q;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= t) return i; }
  return 255;
}

export function gaussian(src, w, h, sigma) {
  if (sigma < 0.3) return src.slice();
  const r = Math.ceil(sigma * 2.5);
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; a += src[row + xx] * k[i + r]; }
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; a += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = a;
    }
  }
  return out;
}

function canny(B, w, h, sensitivity, sigma) {
  const mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    const a = B[p - w - 1], b = B[p - w], c = B[p - w + 1], d = B[p - 1], f = B[p + 1], g = B[p + w - 1], hh = B[p + w], i = B[p + w + 1];
    const gx = -a - 2 * d - g + c + 2 * f + i;
    const gy = -a - 2 * b - c + g + 2 * hh + i;
    mag[p] = Math.hypot(gx, gy);
    let ang = Math.atan2(gy, gx) * 180 / Math.PI; if (ang < 0) ang += 180;
    dir[p] = ang < 22.5 || ang >= 157.5 ? 0 : ang < 67.5 ? 1 : ang < 112.5 ? 2 : 3;
  }
  const nms = new Float32Array(w * h);
  const vals = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x, m = mag[p];
    if (m < 0.02) continue;
    let q, r;
    switch (dir[p]) {
      case 0: q = mag[p - 1]; r = mag[p + 1]; break;
      case 1: q = mag[p - w - 1]; r = mag[p + w + 1]; break;
      case 2: q = mag[p - w]; r = mag[p + w]; break;
      default: q = mag[p - w + 1]; r = mag[p + w - 1];
    }
    if (m >= q && m >= r) { nms[p] = m; vals.push(m); }
  }
  if (!vals.length) return new Uint8Array(w * h);
  // Convert Sobel magnitude to an estimate of the edge's luminance step (contrast), which is
  // independent of resolution and blur: peak gradient of a blurred step = A / (σ·√(2π)), Sobel ≈ 8×.
  const se = Math.sqrt(sigma * sigma + 0.64);
  const toContrast = (se * 2.5066) / 8;
  const sens = sensitivity / 100;
  const highC = 0.035 + 0.42 * Math.pow(1 - sens, 1.6);
  const high = highC / toContrast;
  const low = high * 0.42;
  const out = new Uint8Array(w * h);
  const stack = [];
  for (let p = 0; p < nms.length; p++) {
    if (nms[p] >= high && !out[p]) {
      out[p] = 1; stack.push(p);
      while (stack.length) {
        const q = stack.pop();
        const qx = q % w, qy = (q / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!out[n] && nms[n] >= low) { out[n] = 1; stack.push(n); }
        }
      }
    }
  }
  return out;
}

function adaptive(B, w, h, threshold, scale) {
  // integral image for local mean
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) { rs += B[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + rs; }
  }
  const R = Math.max(4, Math.round(Math.max(w, h) / 22));
  const c = 0.22 - (threshold / 100) * 0.2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = s / ((x1 - x0) * (y1 - y0));
      const v = B[y * w + x];
      if (v < mean * (1 - c) && v < 0.92) out[y * w + x] = 1;
    }
  }
  return out;
}

function removeSpecks(bin, w, h, minSize) {
  if (minSize < 2) return;
  const seen = new Uint8Array(w * h);
  const comp = [];
  for (let p = 0; p < bin.length; p++) {
    if (!bin[p] || seen[p]) continue;
    comp.length = 0;
    const stack = [p]; seen[p] = 1;
    while (stack.length) {
      const q = stack.pop(); comp.push(q);
      const qx = q % w, qy = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (bin[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (comp.length < minSize) for (const q of comp) bin[q] = 0;
  }
}

// chamfer (3-4) distance transform to nearest set pixel, in px
function distance(bin, w, h) {
  const INF = 1e9;
  const D = new Float32Array(w * h);
  for (let p = 0; p < D.length; p++) D[p] = bin[p] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; let v = D[p];
    if (x > 0) v = Math.min(v, D[p - 1] + a);
    if (y > 0) { v = Math.min(v, D[p - w] + a); if (x > 0) v = Math.min(v, D[p - w - 1] + b); if (x < w - 1) v = Math.min(v, D[p - w + 1] + b); }
    D[p] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const p = y * w + x; let v = D[p];
    if (x < w - 1) v = Math.min(v, D[p + 1] + a);
    if (y < h - 1) { v = Math.min(v, D[p + w] + a); if (x < w - 1) v = Math.min(v, D[p + w + 1] + b); if (x > 0) v = Math.min(v, D[p + w - 1] + b); }
    D[p] = v;
  }
  return D;
}

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Convert an image source (canvas/image) into an ink stencil canvas of size (w, h).
 * `unit` = scale of 1 output px relative to the final document px (for preview consistency).
 */
export function photoToStencil(source, w, h, params = {}, unit = 1) {
  const P = { ...STENCIL_DEFAULTS, ...params };
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const L = luminance(img);
  const scale = Math.max(w, h) / 1024; // resolution-relative parameters
  let alpha = new Float32Array(w * h);

  if (P.mode === 'scan') {
    normalize(L);
    const t = 0.25 + (P.threshold / 100) * 0.6; // ink if darker than t
    const soft = 0.12;
    const B = gaussian(L, w, h, 0.5 * unit);
    for (let p = 0; p < L.length; p++) {
      const v = (t - B[p]) / soft + 0.5;
      alpha[p] = v <= 0 ? 0 : v >= 1 ? 1 : v;
    }
    if (P.cleanup > 0) {
      const bin = new Uint8Array(w * h);
      for (let p = 0; p < bin.length; p++) bin[p] = alpha[p] > 0.3 ? 1 : 0;
      const keep = bin.slice();
      removeSpecks(keep, w, h, Math.round(P.cleanup / 100 * 0.00012 * w * h));
      for (let p = 0; p < bin.length; p++) if (bin[p] && !keep[p]) alpha[p] = 0;
    }
  } else {
    normalize(L);
    const sigma = (0.6 + (1 - P.detail / 100) * 3.4) * scale;
    const B = gaussian(L, w, h, sigma);
    let bin;
    if (P.mode === 'threshold') bin = adaptive(B, w, h, P.threshold, scale);
    else bin = canny(B, w, h, P.threshold, sigma);
    if (P.shadows > 0) {
      const lv = (P.shadows / 100) * 0.55;
      const Bs = gaussian(L, w, h, sigma * 1.6 + 0.8 * scale);
      for (let p = 0; p < bin.length; p++) if (Bs[p] < lv) bin[p] = 1;
    }
    removeSpecks(bin, w, h, Math.round((P.cleanup / 100) * 0.00035 * w * h) + 1);
    if (P.mode === 'threshold') {
      // smooth contours, then anti-aliased edge
      const f = new Float32Array(w * h);
      for (let p = 0; p < f.length; p++) f[p] = bin[p];
      const s = gaussian(f, w, h, 1.1 * scale + 0.4);
      for (let p = 0; p < s.length; p++) { const v = (s[p] - 0.5) * 3 + 0.5; alpha[p] = v <= 0 ? 0 : v >= 1 ? 1 : v; }
      if (P.weight > 1.5) { // thicken outlines a little for bolder stencils
        const ext = (P.weight - 1.5) * 0.5 * unit;
        const D = distance(bin, w, h);
        for (let p = 0; p < D.length; p++) { const v = ext + 0.5 - D[p]; if (v > alpha[p]) alpha[p] = v >= 1 ? 1 : v <= 0 ? alpha[p] : v; }
      }
    } else {
      const D = distance(bin, w, h);
      const r = Math.max(0.5, (P.weight * unit) / 2);
      for (let p = 0; p < D.length; p++) { const v = r + 0.5 - D[p]; alpha[p] = v <= 0 ? 0 : v >= 1 ? 1 : v; }
      // slight smoothing to soften staircase edges
      alpha = gaussian(alpha, w, h, 0.55);
      for (let p = 0; p < alpha.length; p++) { const v = (alpha[p] - 0.5) * 1.6 + 0.5; alpha[p] = v <= 0 ? 0 : v >= 1 ? 1 : v; }
    }
  }
  const [r, gg, b] = hexRgb(P.color);
  const out = g.createImageData(w, h);
  const d = out.data;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.round(alpha[p] * 255); }
  g.putImageData(out, 0, 0);
  return c;
}
