// Body scan — measuring the parametric body model directly from its signed
// distance field (no meshing, so one candidate body costs a few ms).
//
// Everything here is in the model's canonical space (a 1.78 m figure, meters,
// Y up, feet on y = 0, facing +Z). Measurements are returned as fractions of
// the model's actual height (head top → soles), so they compare directly with
// photo measurements that are fractions of the person's pixel height.
//
// Worker-safe: no DOM, no three.js.
import { buildModel, normalizeParams } from "../body/model.js";

const GRID = 0.01;           // cross-section grid (m); edges are interpolated
const T_PLANE = 4, OP_UNION = 0;
const STRIDE = 40;

/** Build the SDF for these params plus helpers used by the measurers. */
export function prepareModel(params) {
  const P = normalizeParams({ ...params, detail: "low" });
  const { sdf, skel } = buildModel(P, { handFactor: 1, handFactorZ: 1 });
  const arm = new Uint8Array(sdf.n);
  for (const s of [1, -1]) { const [a, b] = skel.parts.arm[s]; for (let i = a; i < b; i++) arm[i] = 1; }
  const M = { sdf, skel, P, arm, rows: new Map() };
  M.top = findTop(M);
  return M;
}

// min over z of the field on the line (x, y, ·): negative ⇔ the column is inside
function colMin(M, x, y, z0 = -0.2, z1 = 0.22, dz = 0.006) {
  const { sdf } = M;
  const list = sdf.listFor(x - 0.001, y - 0.001, z0, x + 0.001, y + 0.001, z1, 0.01);
  let best = Infinity;
  for (let z = z0; z <= z1; z += dz) {
    const d = sdf.eval(list, list.length, x, y, z);
    if (d < best) best = d;
  }
  return best;
}

function findTop(M) {
  // the head top is on x = 0; bisection on the column test
  let lo = 1.6, hi = 1.95;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (colMin(M, 0, m, -0.15, 0.15, 0.004) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** Height (fraction of the body height) of the crotch: lowest point on the centre line that is inside. */
export function crotchFrac(M) {
  if (M.crotch != null) return M.crotch;
  // scan down from the pelvis until the centre column leaves the body, then bisect
  let yIn = 0.95, yOut = null;
  for (let y = 0.95; y > 0.55; y -= 0.01) {
    if (colMin(M, 0, y, -0.15, 0.15, 0.005) < 0) yIn = y; else { yOut = y; break; }
  }
  if (yOut == null) yOut = 0.55;
  for (let i = 0; i < 10; i++) {
    const m = (yIn + yOut) / 2;
    if (colMin(M, 0, m, -0.15, 0.15, 0.004) < 0) yIn = m; else yOut = m;
  }
  M.crotch = ((yIn + yOut) / 2) / M.top;
  return M.crotch;
}

/**
 * Cross-section of the field at canonical height y on a grid over x ≥ 0
 * (the body is left/right symmetric). arms=false leaves the arms out.
 */
export function slice(M, y, arms = true) {
  const key = (arms ? "a" : "n") + y.toFixed(5);
  const hit = M.rows.get(key);
  if (hit) return hit;
  const { sdf } = M;
  let list = sdf.listFor(-1, y - 1e-4, -1, 1, y + 1e-4, 1, 0.002);
  if (!arms) list = list.filter((i) => !M.arm[i]);
  let xmax = 0.05, zmin = -0.05, zmax = 0.05;
  for (const i of list) {
    const o = i * STRIDE;
    if (sdf.D[o] === T_PLANE || sdf.D[o + 1] !== OP_UNION) continue;
    const b = sdf.bboxes[i];
    if (b[1] > y + 0.03 || b[4] < y - 0.03) continue;
    if (b[3] > xmax) xmax = b[3];
    if (b[2] < zmin) zmin = b[2];
    if (b[5] > zmax) zmax = b[5];
  }
  xmax = Math.min(0.9, xmax + 0.025); zmin = Math.max(-0.45, zmin - 0.025); zmax = Math.min(0.45, zmax + 0.025);
  const nx = Math.ceil(xmax / GRID) + 1, nz = Math.ceil((zmax - zmin) / GRID) + 1;
  const F = new Float32Array(nx * nz);
  const L = list.length;
  for (let ix = 0; ix < nx; ix++) {
    const x = ix * GRID;
    for (let iz = 0; iz < nz; iz++) F[ix * nz + iz] = sdf.eval(list, L, x, y, zmin + iz * GRID);
  }
  const S = { y, nx, nz, zmin, F };
  M.rows.set(key, S);
  return S;
}

const cross = (a, b) => a / (a - b); // zero crossing fraction between samples a (inside) and b

/** Projection onto x (front view) of the slice: merged intervals on x ≥ 0. */
export function frontIntervals(S) {
  const { nx, nz, F } = S;
  const segs = [];
  for (let iz = 0; iz < nz; iz++) {
    let start = null;
    for (let ix = 0; ix < nx; ix++) {
      const v = F[ix * nz + iz];
      if (v < 0 && start === null) start = ix === 0 ? 0 : (ix - 1 + cross(F[(ix - 1) * nz + iz], v)) * GRID;
      if (start !== null && (v >= 0 || ix === nx - 1)) {
        const end = v >= 0 ? (ix - 1 + cross(F[(ix - 1) * nz + iz], v)) * GRID : ix * GRID;
        segs.push([start, end]);
        start = null;
      }
    }
  }
  segs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 1e-4) last[1] = Math.max(last[1], s[1]);
    else out.push(s.slice());
  }
  return out;
}

/** z extent of the slice over columns with x in [xa, xb]. */
export function depthOver(S, xa, xb) {
  const { nx, nz, F, zmin } = S;
  let lo = Infinity, hi = -Infinity;
  const i0 = Math.max(0, Math.floor(xa / GRID)), i1 = Math.min(nx - 1, Math.ceil(xb / GRID));
  for (let ix = i0; ix <= i1; ix++) {
    const o = ix * nz;
    let first = -1, last = -1;
    for (let iz = 0; iz < nz; iz++) if (F[o + iz] < 0) { if (first < 0) first = iz; last = iz; }
    if (first < 0) continue;
    const zA = first === 0 ? zmin : zmin + (first - cross(F[o + first], F[o + first - 1])) * GRID;
    const zB = last === nz - 1 ? zmin + last * GRID : zmin + (last + cross(F[o + last], F[o + last + 1])) * GRID;
    if (zA < lo) lo = zA;
    if (zB > hi) hi = zB;
  }
  return hi > lo ? { lo, hi, d: hi - lo } : { lo: 0, hi: 0, d: 0 };
}

/** Convex-hull perimeter of the slice (tape-measure circumference), full width (both sides). */
export function hullPerimeter(S, xMaxOnly = Infinity) {
  const { nx, nz, F, zmin } = S;
  const pts = [];
  const add = (x, z) => { if (x <= xMaxOnly) { pts.push([x, z]); pts.push([-x, z]); } };
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 1; ix < nx; ix++) {
      const a = F[(ix - 1) * nz + iz], b = F[ix * nz + iz];
      if ((a < 0) !== (b < 0)) add((ix - 1 + a / (a - b)) * GRID, zmin + iz * GRID);
    }
  }
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 1; iz < nz; iz++) {
      const a = F[ix * nz + iz - 1], b = F[ix * nz + iz];
      if ((a < 0) !== (b < 0)) add(ix * GRID, zmin + (iz - 1 + a / (a - b)) * GRID);
    }
  }
  if (pts.length < 3) return 0;
  const h = convexHull(pts);
  let p = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; p += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return p;
}

export function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

// ------------------------------------------------------------ row measures
// All return fractions of the model height (multiply by the person's height).

/** Width of the central run (front view) at fraction h. 0 if the centre is outside. */
export function centerWidth(M, h) {
  const S = slice(M, h * M.top, true);
  const iv = frontIntervals(S);
  const c = iv.find((s) => s[0] <= 1e-3);
  return c ? (2 * c[1]) / M.top : 0;
}

/** One leg's width (front view) at fraction h (half the central run if the legs touch). */
export function legWidth(M, h) {
  const S = slice(M, h * M.top, true);
  const iv = frontIntervals(S);
  const c = iv.find((s) => s[0] <= 1e-3);
  if (c) return c[1] / M.top;
  const l = iv[0];
  return l ? (l[1] - l[0]) / M.top : 0;
}

/** Torso depth (side view) at fraction h: z extent over the central run. Arms left out. */
export function centerDepth(M, h) {
  const S = slice(M, h * M.top, true);
  const iv = frontIntervals(S);
  const c = iv.find((s) => s[0] <= 1e-3);
  if (!c) return legDepth(M, h) ;
  const N = slice(M, h * M.top, false);
  return depthOver(N, 0, c[1]).d / M.top;
}

/** One leg's depth (side view) at fraction h. */
export function legDepth(M, h) {
  const S = slice(M, h * M.top, true);
  const iv = frontIntervals(S);
  const l = iv.find((s) => s[0] <= 1e-3) || iv[0];
  if (!l) return 0;
  const N = slice(M, h * M.top, false);
  return depthOver(N, l[0], l[1]).d / M.top;
}

/** Tape circumference of the torso (arms out) at fraction h. */
export function torsoCirc(M, h) {
  const N = slice(M, h * M.top, false);
  return hullPerimeter(N) / M.top;
}

/** Tape circumference of one thigh at fraction h. */
export function thighCirc(M, h) {
  const N = slice(M, h * M.top, false);
  const iv = frontIntervals(N);
  const l = iv.find((s) => s[0] > 1e-3);
  if (!l) return hullPerimeter(N) / 2 / M.top;
  // hull of the leg only (columns inside the leg interval)
  const { nx, nz, F, zmin } = N;
  const pts = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 1; ix < nx; ix++) {
    const a = F[(ix - 1) * nz + iz], b = F[ix * nz + iz];
    if ((a < 0) !== (b < 0)) { const x = (ix - 1 + a / (a - b)) * GRID; if (x >= l[0] - 0.005 && x <= l[1] + 0.005) pts.push([x, zmin + iz * GRID]); }
  }
  if (pts.length < 3) return 0;
  const hh = convexHull(pts);
  let p = 0;
  for (let i = 0; i < hh.length; i++) { const a = hh[i], b = hh[(i + 1) % hh.length]; p += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return p / M.top;
}

/**
 * Upper-arm thickness in the front view, perpendicular to the arm, at a
 * fraction t (0 shoulder … 1 elbow) along the upper arm. Fraction of height.
 */
export function upperArmWidth(M, t = 0.55) {
  const sd = M.skel.sides[1];
  const S0 = sd.shoulder, E = sd.elbow;
  const c = [S0[0] + (E[0] - S0[0]) * t, S0[1] + (E[1] - S0[1]) * t];
  let dx = E[0] - S0[0], dy = E[1] - S0[1];
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  const nxv = dy, nyv = -dx; // perpendicular in the image plane (pointing outward-ish)
  const inside = (s) => colMin(M, c[0] + nxv * s, c[1] + nyv * s, -0.12, 0.12, 0.004) < 0;
  // walk outward both ways until outside, then bisect; stop inward at the torso gap
  const edge = (sgn) => {
    let a = 0, b = null;
    for (let s = 0.004; s < 0.12; s += 0.004) { if (!inside(sgn * s)) { b = s; break; } a = s; }
    if (b == null) return a;
    for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (inside(sgn * m)) a = m; else b = m; }
    return (a + b) / 2;
  };
  return (edge(1) + edge(-1)) / M.top;
}

/** Arm abduction seen in the front view: angle of shoulder→elbow from vertical (deg). */
export function modelArmAngle(M) {
  const sd = M.skel.sides[1];
  const dx = sd.elbow[0] - sd.shoulder[0], dy = sd.shoulder[1] - sd.elbow[1];
  return Math.atan2(dx, dy) * 180 / Math.PI;
}

/** Canonical y fraction of anatomical levels of this model (for defaults / no-photo path). */
export function modelLevels(M) {
  const sk = M.skel, ty = sk.ty, T = M.top;
  return {
    shoulder: sk.sides[1].shoulder[1] / T,
    chest: ty(1.27) / T,
    waist: ty(1.1) / T,
    hip: ty(0.9) / T,
    crotch: crotchFrac(M),
    knee: sk.sides[1].knee[1] / T,
    ankle: sk.sides[1].ankle[1] / T,
  };
}

/**
 * Arm angle as the photo analysis sees it: centre line of the arm run in the
 * front view between hA − 0.015 and hA − 0.075 (hA: armpit fraction), vs vertical (deg).
 */
export function apparentArmAngle(M, hA) {
  const ys = [], xs = [];
  for (let k = 0; k <= 6; k++) {
    const h = hA - 0.015 - k * 0.01;
    const iv = frontIntervals(slice(M, h * M.top, true));
    const c = iv.find((s) => s[0] <= 1e-3);
    const arm = iv.filter((s) => s[0] > 1e-3 && (!c || s[0] > c[1] + 1e-3)).pop();
    if (!arm) continue;
    ys.push(h * M.top); xs.push((arm[0] + arm[1]) / 2);
  }
  if (ys.length < 3) return null;
  let my = 0, mx = 0;
  for (let i = 0; i < ys.length; i++) { my += ys[i]; mx += xs[i]; }
  my /= ys.length; mx /= ys.length;
  let sxy = 0, syy = 0;
  for (let i = 0; i < ys.length; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; }
  return Math.atan(Math.abs(sxy / syy)) * 180 / Math.PI;
}

/** Upper-arm thickness (front view, across the arm) at fraction h of the height (fraction). */
export function upperArmWidthAt(M, h) {
  const sd = M.skel.sides[1];
  const y = h * M.top, S0 = sd.shoulder, E = sd.elbow;
  const t = Math.min(0.95, Math.max(0.05, (S0[1] - y) / (S0[1] - E[1])));
  return upperArmWidth(M, t);
}
