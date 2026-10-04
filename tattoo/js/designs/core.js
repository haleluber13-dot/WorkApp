// InkForm 3D — design engine core: seeded RNG, geometry, SVG path helpers.
// Everything here is pure (no DOM) so generators also run in Node for testing.

export const INK = "#141414";

// ---------------------------------------------------------------- RNG
export function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return (seed >>> 0) ^ 0x9e3779b9;
  const s = String(seed ?? "ink");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = hashSeed(seed) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = () => next();
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  r.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  r.chance = (p) => next() < p;
  r.gauss = () => { let u = 0, v = 0; while (!u) u = next(); while (!v) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.fork = (salt) => makeRng(Math.floor(next() * 4294967296) ^ hashSeed(salt || 0));
  r.shuffle = (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return r;
}

// 2D value noise (seeded), smooth, range ~[0,1]
export function makeNoise(seed) {
  const rng = makeRng(seed);
  const P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = rng(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const v = (x, y) => G[P[(P[x & 255] + y) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    const u = sm(xf), w = sm(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  n.fbm = (x, y, oct = 3) => { let s = 0, amp = 0.5, f = 1, tot = 0; for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
  return n;
}

// ---------------------------------------------------------------- number / string helpers
export const f1 = (n) => { const r = Math.round(n * 10) / 10; return Object.is(r, -0) ? "0" : String(r); };
export const f2 = (n) => { const r = Math.round(n * 100) / 100; return Object.is(r, -0) ? "0" : String(r); };
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function num(v, d, lo = -Infinity, hi = Infinity) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
}

// ---------------------------------------------------------------- point helpers
export const pt = (x, y) => [x, y];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const perp = (a) => [-a[1], a[0]];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const polar = (cx, cy, r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
export const rot = (p, ang, c = [0, 0]) => { const s = Math.sin(ang), co = Math.cos(ang), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };

// Mirror helper: left-half points (top→bottom) → full closed outline (left then mirrored right, reversed).
// Points on the axis (x === cx) are not duplicated.
export function mirrorPts(half, cx = 100) {
  const right = [];
  for (let i = half.length - 1; i >= 0; i--) {
    const p = half[i];
    if (Math.abs(p[0] - cx) < 1e-6) continue;
    right.push([2 * cx - p[0], p[1], ...p.slice(2)]);
  }
  return [...half, ...right];
}
export const mirrorX = (pts, cx = 100) => pts.map((p) => [2 * cx - p[0], p[1], ...p.slice(2)]);

// ---------------------------------------------------------------- path building
const P2 = (p) => f1(p[0]) + " " + f1(p[1]);

export function polyD(pts, closed = true) {
  if (!pts.length) return "";
  let d = "M" + P2(pts[0]);
  for (let i = 1; i < pts.length; i++) d += "L" + P2(pts[i]);
  return closed ? d + "Z" : d;
}

// Catmull-Rom spline through points → cubic beziers. A point [x,y,1] (third element truthy) is a sharp corner.
export function smooth(pts, closed = true, tension = 1) {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return polyD(pts, false);
  const k = tension / 6;
  const get = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  let d = "M" + P2(pts[0]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += "C" + P2(c1) + " " + P2(c2) + " " + P2(p2);
  }
  return closed ? d + "Z" : d;
}

export function circleD(cx, cy, r) {
  const k = 0.5523 * r;
  return `M${f1(cx + r)} ${f1(cy)}C${f1(cx + r)} ${f1(cy + k)} ${f1(cx + k)} ${f1(cy + r)} ${f1(cx)} ${f1(cy + r)}C${f1(cx - k)} ${f1(cy + r)} ${f1(cx - r)} ${f1(cy + k)} ${f1(cx - r)} ${f1(cy)}C${f1(cx - r)} ${f1(cy - k)} ${f1(cx - k)} ${f1(cy - r)} ${f1(cx)} ${f1(cy - r)}C${f1(cx + k)} ${f1(cy - r)} ${f1(cx + r)} ${f1(cy - k)} ${f1(cx + r)} ${f1(cy)}Z`;
}
export function ellipseD(cx, cy, rx, ry, ang = 0) {
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push(rot([cx + rx * Math.cos(i * Math.PI / 2), cy + ry * Math.sin(i * Math.PI / 2)], ang, [cx, cy]));
  // 4-point closed Catmull-Rom with tension tuned to approximate an ellipse
  return smooth(pts, true, 1.65);
}
export function arcPts(cx, cy, r, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(polar(cx, cy, r, a0 + (a1 - a0) * i / n));
  return out;
}
export function arcD(cx, cy, r, a0, a1, n) {
  n = n || Math.max(4, Math.ceil(Math.abs(a1 - a0) / (TAU / 48)));
  return polyD(arcPts(cx, cy, r, a0, a1, n), false);
}
// Ring (annulus) – use with evenodd
export const ringD = (cx, cy, r1, r2) => circleD(cx, cy, r1) + circleD(cx, cy, r2);

export function regularPoly(cx, cy, r, n, rot0 = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(polar(cx, cy, r, rot0 + i * TAU / n));
  return out;
}
export function starPts(cx, cy, r1, r2, n, rot0 = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n * 2; i++) out.push(polar(cx, cy, i % 2 ? r2 : r1, rot0 + i * Math.PI / n));
  return out;
}

// Petal / leaf: from base to tip, max half-width w at fraction `at`, optionally bent (curve > 0 bends left)
export function petalPts(base, tip, w, { at = 0.45, curve = 0, tipRound = 0, baseW = 0, n = 6, sharpBase = true } = {}) {
  const dir = sub(tip, base), L = len(dir), u = norm(dir), nrm = perp(u);
  const left = [], right = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    // width profile: rises to max at `at`, falls to tip
    let wt = t < at ? Math.sin((t / at) * Math.PI / 2) : Math.cos(((t - at) / (1 - at)) * Math.PI / 2);
    wt = Math.pow(Math.max(wt, 0), 0.8);
    const ww = baseW * (1 - t) + w * wt + tipRound * w * t * t;
    const bend = curve * Math.sin(t * Math.PI) * L;
    const c = add(base, add(mul(u, L * t), mul(nrm, bend)));
    left.push(add(c, mul(nrm, ww)));
    right.push(sub(c, mul(nrm, ww)));
  }
  const tipP = add(tip, mul(nrm, curve * 0));
  const pts = [[base[0], base[1], sharpBase ? 1 : 0], ...left, tipRound ? tipP : [tipP[0], tipP[1], 1], ...right.reverse()];
  return pts;
}
export const petalD = (base, tip, w, o) => smooth(petalPts(base, tip, w, o));

// Sample a smooth curve through points (Catmull-Rom) → dense polyline
export function sampleSpline(pts, closed = false, perSeg = 12) {
  const n = pts.length, out = [];
  if (n < 2) return pts.slice();
  const get = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice(0, 2));
  return out;
}

export function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; }

// Resample polyline at even spacing
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1], b = pts[i], d = dist(a, b);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      a = mix(a, b, t); out.push(a); d = dist(a, b); acc = 0;
    }
    acc += d;
  }
  if (dist(out[out.length - 1], pts[pts.length - 1]) > step * 0.3) out.push(pts[pts.length - 1]);
  return out;
}

// Tapered stroke along a centerline → closed outline points.
// widthFn(t) gives half-width at t∈[0,1] (or numbers w0,w1 for linear taper).
export function taperPts(center, widthFn, { spline = true, perSeg = 8, step = 3, capStart = false, capEnd = false } = {}) {
  let c = spline ? sampleSpline(center, false, perSeg) : center.slice();
  c = resample(c, step);
  if (typeof widthFn === "number") { const w = widthFn; widthFn = () => w; }
  const L = polyLength(c);
  const left = [], right = [];
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    if (i > 0) acc += dist(c[i - 1], c[i]);
    const t = L ? acc / L : 0;
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    const nn = perp(norm(sub(b, a)));
    const w = Math.max(0, widthFn(t));
    left.push(add(c[i], mul(nn, w)));
    right.push(sub(c[i], mul(nn, w)));
  }
  const out = [...left];
  if (capEnd) { const e = c[c.length - 1], dir = norm(sub(c[c.length - 1], c[c.length - 2])), w = widthFn(1); out.push(add(e, mul(dir, w * 0.9))); }
  out.push(...right.reverse());
  if (capStart) { const s = c[0], dir = norm(sub(c[0], c[1])), w = widthFn(0); out.push(add(s, mul(dir, w * 0.9))); }
  return out;
}
export const taperD = (center, widthFn, o) => polyD(taperPts(center, widthFn, o), true);
// smoother output (fewer points, curve fitted) for tapered strokes
export function taperSmoothD(center, widthFn, o = {}) {
  const pts = taperPts(center, widthFn, o);
  const every = o.every || 2;
  const red = pts.filter((_, i) => i % every === 0);
  return smooth(red, true, 1);
}

// ---------------------------------------------------------------- path parsing / transform / sampling
const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

// Parse to absolute segments: [{c:'M'|'L'|'C'|'Q'|'Z', p:[...] }]
export function parsePath(d) {
  const toks = [];
  let m;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(d))) toks.push(m[1] || parseFloat(m[2]));
  const out = [];
  let i = 0, cmd = "M", x = 0, y = 0, sx = 0, sy = 0, lc = null;
  const nextNum = () => { const v = toks[i++]; return typeof v === "number" ? v : 0; };
  while (i < toks.length) {
    if (typeof toks[i] === "string") cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === "Z") { out.push({ c: "Z" }); x = sx; y = sy; lc = null; continue; }
    if (typeof toks[i] !== "number") { i++; continue; }
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") { x = ox + nextNum(); y = oy + nextNum(); sx = x; sy = y; out.push({ c: "M", p: [x, y] }); cmd = rel ? "l" : "L"; lc = null; }
    else if (C === "L") { x = ox + nextNum(); y = oy + nextNum(); out.push({ c: "L", p: [x, y] }); lc = null; }
    else if (C === "H") { x = (rel ? x : 0) + nextNum(); out.push({ c: "L", p: [x, y] }); lc = null; }
    else if (C === "V") { y = (rel ? y : 0) + nextNum(); out.push({ c: "L", p: [x, y] }); lc = null; }
    else if (C === "C") { const a = [ox + nextNum(), oy + nextNum(), ox + nextNum(), oy + nextNum(), ox + nextNum(), oy + nextNum()]; out.push({ c: "C", p: a }); lc = [a[2], a[3]]; x = a[4]; y = a[5]; }
    else if (C === "S") { const c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const a = [c1[0], c1[1], ox + nextNum(), oy + nextNum(), ox + nextNum(), oy + nextNum()]; out.push({ c: "C", p: a }); lc = [a[2], a[3]]; x = a[4]; y = a[5]; }
    else if (C === "Q") { const a = [ox + nextNum(), oy + nextNum(), ox + nextNum(), oy + nextNum()]; out.push({ c: "Q", p: a }); lc = null; x = a[2]; y = a[3]; }
    else if (C === "T") { const a = [x, y, ox + nextNum(), oy + nextNum()]; out.push({ c: "Q", p: a }); x = a[2]; y = a[3]; lc = null; }
    else if (C === "A") { nextNum(); nextNum(); nextNum(); nextNum(); nextNum(); x = ox + nextNum(); y = oy + nextNum(); out.push({ c: "L", p: [x, y] }); lc = null; }
    else i++;
  }
  return out;
}
export function segsToD(segs) {
  let d = "";
  for (const s of segs) {
    if (s.c === "Z") { d += "Z"; continue; }
    d += s.c;
    for (let k = 0; k < s.p.length; k += 2) d += (k ? " " : "") + f1(s.p[k]) + " " + f1(s.p[k + 1]);
  }
  return d;
}
// Affine m = [a,b,c,d,e,f] : x' = a x + c y + e ; y' = b x + d y + f
export function transformD(d, m) {
  const segs = parsePath(d);
  for (const s of segs) if (s.p) for (let k = 0; k < s.p.length; k += 2) {
    const x = s.p[k], y = s.p[k + 1];
    s.p[k] = m[0] * x + m[2] * y + m[4];
    s.p[k + 1] = m[1] * x + m[3] * y + m[5];
  }
  return segsToD(segs);
}
export const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]],
  t: (x, y) => [1, 0, 0, 1, x, y],
  s: (sx, sy = sx) => [sx, 0, 0, sy, 0, 0],
  r: (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0],
  // rotate around (cx,cy)
  rc: (a, cx, cy) => M.mul(M.t(cx, cy), M.mul(M.r(a), M.t(-cx, -cy))),
  // scale around (cx,cy)
  sc: (s, cx, cy, sy = s) => M.mul(M.t(cx, cy), M.mul(M.s(s, sy), M.t(-cx, -cy))),
  fx: (cx) => [-1, 0, 0, 1, 2 * cx, 0],
  chain: (...ms) => ms.reduce((A, B) => M.mul(A, B), M.id()),
};
export const applyM = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

// Sample path → array of polylines (subpaths). closed flag kept on each.
export function samplePath(d, step = 2) {
  const segs = typeof d === "string" ? parsePath(d) : d;
  const polys = [];
  let cur = null, x = 0, y = 0;
  const push = (px, py) => { cur.push([px, py]); };
  for (const s of segs) {
    if (s.c === "M") { if (cur && cur.length > 1) polys.push(cur); cur = [[s.p[0], s.p[1]]]; cur.closed = false; x = s.p[0]; y = s.p[1]; }
    else if (s.c === "L") { if (!cur) { cur = [[x, y]]; } push(s.p[0], s.p[1]); x = s.p[0]; y = s.p[1]; }
    else if (s.c === "C") {
      if (!cur) cur = [[x, y]];
      const [x1, y1, x2, y2, x3, y3] = s.p;
      const L = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.max(2, Math.ceil(L / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      x = x3; y = y3;
    } else if (s.c === "Q") {
      if (!cur) cur = [[x, y]];
      const [x1, y1, x2, y2] = s.p;
      const L = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(2, Math.ceil(L / step));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; push(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2); }
      x = x2; y = y2;
    } else if (s.c === "Z") {
      if (cur) { cur.closed = true; if (cur.length > 1) polys.push(cur); x = cur[0][0]; y = cur[0][1]; }
      cur = null;
    }
  }
  if (cur && cur.length > 1) polys.push(cur);
  return polys;
}

export function bboxOfPolys(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[0] > x1) x1 = q[0]; if (q[1] > y1) y1 = q[1]; }
  if (!Number.isFinite(x0)) return [0, 0, 0, 0];
  return [x0, y0, x1, y1];
}
export const bboxOfD = (d) => bboxOfPolys(samplePath(d, 4));

// even-odd point in polygons
export function inPolys(polys, x, y) {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
// nonzero winding test
export function inPolysNZ(polys, x, y) {
  let w = 0;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[j][0], yi = poly[j][1], xj = poly[i][0], yj = poly[i][1];
      if (yi <= y) { if (yj > y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) > 0) w++; }
      else if (yj <= y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) < 0) w--;
    }
  }
  return w !== 0;
}
export function distToPolys(polys, x, y) {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - x, ey = ay + t * dy - y, dd = ex * ex + ey * ey;
      if (dd < best) best = dd;
    }
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------- Delaunay (Bowyer–Watson), small point sets
export function delaunay(points) {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  const dx = maxX - minX, dy = maxY - minY, dm = Math.max(dx, dy) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const pts = points.concat([[mx - dm, my - dm], [mx, my + dm], [mx + dm, my - dm]]);
  const circ = (a, b, c) => {
    const A = pts[a], B = pts[b], C = pts[c];
    const D = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    const x = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / D;
    const y = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / D;
    return { x, y, r2: (A[0] - x) ** 2 + (A[1] - y) ** 2 };
  };
  let tris = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad = [], keep = [];
    for (const t of tris) ((p[0] - t.c.x) ** 2 + (p[1] - t.c.y) ** 2 < t.c.r2 ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (let k = 0; k < 3; k++) {
      const a = t.v[k], b = t.v[(k + 1) % 3], key = a < b ? a + "," + b : b + "," + a;
      edges.set(key, edges.has(key) ? null : [a, b]);
    }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push({ v: [e[0], e[1], i], c: circ(e[0], e[1], i) });
  }
  return tris.filter((t) => t.v[0] < n && t.v[1] < n && t.v[2] < n).map((t) => t.v);
}

// ---------------------------------------------------------------- SVG document
export function svgDoc(w, h, body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(w)} ${f1(h)}" width="${Math.round(w)}" height="${Math.round(h)}">` +
    (defs ? `<defs>${defs}</defs>` : "") + body + `</svg>`;
}

// Unique id generator per document
export function idGen(prefix = "i") { let n = 0; return (p = prefix) => `${p}${++n}`; }

// Dots as a single path with round caps (compact stipple). pts: [[x,y],...]
export function dotsPath(pts, r, color = INK) {
  if (!pts.length) return "";
  let d = "";
  for (const p of pts) d += "M" + f1(p[0]) + " " + f1(p[1]) + "h0";
  return `<path d="${d}" stroke="${color}" stroke-width="${f2(r * 2)}" stroke-linecap="round" fill="none"/>`;
}

// Wobble a polyline (hand-drawn feel)
export function wobble(pts, amp, noise, freq = 0.05, off = 0) {
  return pts.map((p) => [p[0] + (noise(p[0] * freq + off, p[1] * freq) - 0.5) * 2 * amp, p[1] + (noise(p[0] * freq + 37 + off, p[1] * freq + 11) - 0.5) * 2 * amp]);
}
