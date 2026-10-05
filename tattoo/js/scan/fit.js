// Body scan — find BodyParams that reproduce measured widths/depths
// (analysis by synthesis on the body's signed distance field).
//
//   fitPhoto(target, opts)    target from silhouette.js (fractions of height)
//   fitTape(tape, opts)       tape measurements in cm (no-photo path)
//   modelReport(params, lm)   measurements of a body at the photo's landmark heights
//
// Both fits return { params, evals, ms, cost, model } and call opts.onProgress(0..1).
// Worker-safe (no DOM).
import * as BM from "./bodymeasure.js";

export const FIT_KEYS = ["build", "muscle", "shoulders", "chest", "hips", "legLength"];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ----------------------------------------------------------------- photo fit

/**
 * Measurements of a model at the photo's landmark heights (fractions of height).
 * lm = { shoulder, chest, waist, hip, thigh, calf, crotch } (h fractions), side: bool
 */
export function measureAt(M, lm, side = true) {
  const r = {};
  const band = (c, d, n) => { const o = []; for (let i = 0; i < n; i++) o.push(c + d * (i - (n - 1) / 2)); return o; };
  const minOf = (f, hs) => Math.min(...hs.map(f));
  const maxOf = (f, hs) => Math.max(...hs.map(f));
  r.shoulderW = BM.centerWidth(M, lm.shoulder);
  r.chestW = BM.centerWidth(M, lm.chest);
  r.waistW = minOf((h) => BM.centerWidth(M, h), band(lm.waist, 0.015, 3));
  r.hipW = maxOf((h) => BM.centerWidth(M, h), band(lm.hip, 0.015, 3));
  r.thighW = BM.legWidth(M, lm.thigh);
  r.calfW = maxOf((h) => BM.legWidth(M, h), band(lm.calf, 0.02, 3));
  r.crotch = BM.crotchFrac(M);
  if (lm.armpit) r.upperArm = BM.upperArmWidthAt(M, lm.armpit - 0.045);
  if (side) {
    r.chestD = BM.centerDepth(M, lm.chest);
    r.waistD = minOf((h) => BM.centerDepth(M, h), band(lm.waist, 0.015, 3));
    r.hipD = BM.centerDepth(M, lm.hip);
    r.buttD = maxOf((h) => BM.centerDepth(M, h), buttBand(lm));
    r.thighD = BM.legDepth(M, lm.thigh);
  }
  return r;
}

export function buttBand(lm) {
  const a = lm.crotch + 0.012, b = Math.max(a + 0.02, lm.hip + 0.03);
  return [a, a + (b - a) / 3, a + (2 * (b - a)) / 3, b];
}

// weights of the relative errors
const W_PHOTO = {
  shoulderW: 1.0, chestW: 1.0, waistW: 1.4, hipW: 1.4, thighW: 0.7, calfW: 0.5, upperArm: 0.3,
  chestD: 0.8, waistD: 1.2, hipD: 0.6, buttD: 1.0, thighD: 0.5,
};

function huber(r, c) {
  const a = Math.abs(r);
  return a <= c ? r : Math.sign(r) * Math.sqrt(2 * c * a - c * c);
}

function priorRes(p, prior, out) {
  for (const k of FIT_KEYS) {
    // male "chest" (pecs) hardly shows in an outline: keep it near the middle unless clearly needed
    const lam = k === "muscle" ? 9 : k === "chest" ? (p.sex === "male" ? 14 : 4) : 2.5;
    out.push(Math.sqrt(lam) * (p[k] - (prior[k] ?? 0.5)));
  }
  return out;
}

// expected build from BMI (weak hint when the weight is given)
export function buildFromBMI(heightCm, weightKg, sex) {
  if (!weightKg || !heightCm) return null;
  const bmi = weightKg / ((heightCm / 100) ** 2);
  const b0 = sex === "female" ? 21.5 : 22.5;
  return clamp01(0.5 + (bmi - b0) * 0.075);
}

/**
 * target = { sex, heightCm, weightKg?, armPose, lm:{…}, meas:{shoulderW,…, crotch} (fractions), side:bool }
 */
/**
 * armPose whose model shows the same apparent arm angle as the photo
 * (secant steps on the default body of this sex; clamped 15–45°).
 */
export function solveArmPose(sex, heightCm, photoAngle, armpit) {
  if (!(photoAngle > 0)) return 30;
  const clampA = (a) => Math.min(45, Math.max(15, a));
  const f = (a) => BM.apparentArmAngle(BM.prepareModel({ sex, heightCm, armPose: a }), armpit);
  let a0 = clampA(photoAngle), f0 = f(a0);
  if (f0 == null) return a0;
  let a1 = clampA(a0 - (f0 - photoAngle)), f1 = a1 === a0 ? f0 : f(a1);
  for (let i = 0; i < 2 && f1 != null && Math.abs(f1 - photoAngle) > 0.3 && Math.abs(f1 - f0) > 1e-3; i++) {
    const a2 = clampA(a1 + (photoAngle - f1) * (a1 - a0) / (f1 - f0));
    a0 = a1; f0 = f1; a1 = a2; f1 = f(a1);
  }
  return Math.round(a1 * 10) / 10;
}

export async function fitPhoto(target, opts = {}) {
  const t0 = now();
  const side = !!target.side;
  const armPose = target.armAngle != null ? solveArmPose(target.sex, target.heightCm, target.armAngle, target.lm.armpit) : (target.armPose ?? 30);
  const base = { sex: target.sex, heightCm: target.heightCm, armPose };
  const meas = target.meas;
  const keys = Object.keys(W_PHOTO).filter((k) => meas[k] > 0 && (side || !k.endsWith("D")));
  const bmiBuild = buildFromBMI(target.heightCm, target.weightKg, target.sex);
  const prior = { build: bmiBuild ?? 0.5 };
  const cache = new Map();
  let evals = 0;
  const modelOf = (p) => BM.prepareModel({ ...base, ...p });
  const res = (p) => {
    const key = FIT_KEYS.map((k) => p[k].toFixed(4)).join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    evals++;
    const M = modelOf(p);
    const m = measureAt(M, target.lm, side);
    const r = [];
    // Huber-style residuals: one badly measured spot (loose clothes, a hand in the
    // way) beyond ~4 % pulls linearly instead of quadratically
    for (const k of keys) r.push(huber(Math.sqrt(W_PHOTO[k]) * 100 * (m[k] - meas[k]) / meas[k], 4 * Math.sqrt(W_PHOTO[k])));
    r.push(Math.sqrt(6) * (m.crotch - meas.crotch) * 100); // % of height
    priorRes({ ...p, sex: base.sex }, prior, r);
    if (bmiBuild != null) r.push(Math.sqrt(6) * (p.build - bmiBuild));
    cache.set(key, r);
    return r;
  };
  const result = await solveLM(res, { build: 0.5, muscle: 0.5, shoulders: 0.5, chest: 0.5, hips: 0.5, legLength: initLegLength(base, meas.crotch) }, opts);
  const best = result.params;
  const M = modelOf(best);
  return { params: { ...base, ...best }, evals, ms: now() - t0, cost: result.cost, fitted: measureAt(M, target.lm, true), model: M };
}

// legLength mostly sets the crotch height: solve it first in 1-D
function initLegLength(base, crotch) {
  if (!(crotch > 0)) return 0.5;
  let lo = 0, hi = 1;
  const f = (L) => BM.crotchFrac(BM.prepareModel({ ...base, legLength: L }));
  const flo = f(lo), fhi = f(hi);
  if (crotch <= flo) return 0;
  if (crotch >= fhi) return 1;
  // crotch height is ~linear in legLength: two secant steps
  let L = (crotch - flo) / (fhi - flo);
  const fm = f(L);
  if (fm < crotch) { lo = L; } else { hi = L; }
  const flo2 = lo === 0 ? flo : fm, fhi2 = hi === 1 ? fhi : fm;
  L = lo + (hi - lo) * (crotch - flo2) / Math.max(1e-6, fhi2 - flo2);
  return clamp01(L);
}

// ----------------------------------------------------------------- tape fit

/** Model tape measurements (cm) for the no-photo path. */
export function tapeOf(M, heightCm) {
  const H = heightCm;
  const lv = BM.modelLevels(M);
  const hs = (a, b, n) => { const o = []; for (let i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; };
  const chest = Math.max(...hs(lv.chest - 0.02, lv.chest + 0.015, 3).map((h) => BM.torsoCirc(M, h)));
  const waist = Math.min(...hs(lv.waist - 0.03, lv.waist + 0.025, 4).map((h) => BM.torsoCirc(M, h)));
  const hip = Math.max(...hs(lv.hip - 0.035, lv.hip + 0.02, 4).map((h) => BM.torsoCirc(M, h)));
  // a tape across the back (shoulder tip to tip) reads ~12 % less than the silhouette across the deltoids
  const shoulder = BM.centerWidth(M, lv.shoulder - 0.005) * 0.875;
  return { chest: chest * H, waist: waist * H, hips: hip * H, shoulder: shoulder * H, inseam: lv.crotch * H };
}

/** tape = { sex, heightCm, weightKg?, chest, waist, hips, shoulder?, inseam? } (cm) */
export async function fitTape(tape, opts = {}) {
  const t0 = now();
  const base = { sex: tape.sex, heightCm: tape.heightCm, armPose: 30 };
  const bmiBuild = buildFromBMI(tape.heightCm, tape.weightKg, tape.sex);
  const cache = new Map();
  let evals = 0;
  const W = { chest: 1.2, waist: 1.5, hips: 1.4, shoulder: 0.8, inseam: 2 };
  const keys = Object.keys(W).filter((k) => tape[k] > 0);
  const res = (p) => {
    const key = FIT_KEYS.map((k) => p[k].toFixed(4)).join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    evals++;
    const M = BM.prepareModel({ ...base, ...p });
    const m = tapeOf(M, tape.heightCm);
    const r = [];
    for (const k of keys) r.push(Math.sqrt(W[k]) * 100 * (m[k] - tape[k]) / tape[k]);
    priorRes({ ...p, sex: base.sex }, {}, r);
    if (!tape.inseam) r.push(2 * (p.legLength - 0.5));
    if (bmiBuild != null) r.push(Math.sqrt(6) * (p.build - bmiBuild));
    cache.set(key, r);
    return r;
  };
  let legInit = 0.5;
  if (tape.inseam > 0) legInit = initLegLength(base, tape.inseam / tape.heightCm);
  const result = await solveLM(res, { build: bmiBuild ?? 0.5, muscle: 0.5, shoulders: 0.5, chest: 0.5, hips: 0.5, legLength: legInit }, opts);
  const M = BM.prepareModel({ ...base, ...result.params });
  return { params: { ...base, ...result.params }, evals, ms: now() - t0, cost: result.cost, tape: tapeOf(M, tape.heightCm), model: M };
}

// ----------------------------------------------------------------- report

/**
 * Circumference estimates (fractions of height) of a model at the photo's
 * landmark heights, plus its widths/depths there. Used to turn photo
 * widths/depths into tape-measure circumferences with the right shape factor.
 */
export function modelCircs(M, lm) {
  const band = (c, d, n) => { const o = []; for (let i = 0; i < n; i++) o.push(c + d * (i - (n - 1) / 2)); return o; };
  const wH = band(lm.waist, 0.015, 3), hH = band(lm.hip, 0.015, 3);
  const pickMin = (hs, f) => hs.reduce((a, h) => (f(h) < f(a) ? h : a), hs[0]);
  const pickMax = (hs, f) => hs.reduce((a, h) => (f(h) > f(a) ? h : a), hs[0]);
  const wh = pickMin(wH, (h) => BM.centerWidth(M, h));
  const hh = pickMax(hH, (h) => BM.centerWidth(M, h));
  return {
    chest: { c: BM.torsoCirc(M, lm.chest), w: BM.centerWidth(M, lm.chest), d: BM.centerDepth(M, lm.chest) },
    waist: { c: BM.torsoCirc(M, wh), w: BM.centerWidth(M, wh), d: BM.centerDepth(M, wh) },
    hip: { c: Math.max(...buttBand(lm).concat([hh]).map((h) => BM.torsoCirc(M, h))), w: BM.centerWidth(M, hh), d: Math.max(...buttBand(lm).map((h) => BM.centerDepth(M, h))) },
    thigh: { c: BM.thighCirc(M, lm.thigh), w: BM.legWidth(M, lm.thigh), d: BM.legDepth(M, lm.thigh) },
  };
}

export function ellipsePerimeter(w, d) {
  const a = w / 2, b = d / 2;
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// ----------------------------------------------------------------- optimizer

const sq = (r) => r.reduce((a, v) => a + v * v, 0);

/**
 * Box-constrained Levenberg–Marquardt on a residual function over FIT_KEYS
 * (values in 0..1). Finite-difference Jacobian; yields to the event loop so a
 * page stays responsive and progress can be shown.
 */
export async function solveLM(resFn, start, { maxEvals = 90, onProgress, signal, fixed = {}, h = 0.025 } = {}) {
  const keys = FIT_KEYS.filter((k) => !(k in fixed));
  const n = keys.length;
  const toP = (v) => { const p = { ...start, ...fixed }; keys.forEach((k, i) => { p[k] = clamp01(v[i]); }); return p; };
  let count = 0, lastYield = now();
  const R = async (v) => {
    if (signal?.aborted) throw new Error("cancelled");
    count++;
    const r = resFn(toP(v));
    if (now() - lastYield > 35) {
      onProgress?.(Math.min(0.98, count / maxEvals));
      await new Promise((ok) => setTimeout(ok, 0));
      lastYield = now();
    }
    return r;
  };
  let x = keys.map((k) => clamp01(start[k]));
  let r = await R(x), f = sq(r);
  let mu = 1e-2;
  while (count + n + 1 <= maxEvals) {
    // Jacobian (forward differences, stepping inward at the bounds)
    const J = [];
    for (let j = 0; j < n; j++) {
      const v = x.slice();
      const s = v[j] + h > 1 ? -h : h;
      v[j] += s;
      const rj = await R(v);
      J.push(rj.map((q, i) => (q - r[i]) / s));
    }
    // normal equations
    const A = [], g = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      A.push(new Array(n).fill(0));
      for (let i = 0; i < r.length; i++) g[a] += J[a][i] * r[i];
      for (let b = 0; b < n; b++) { let s = 0; for (let i = 0; i < r.length; i++) s += J[a][i] * J[b][i]; A[a][b] = s; }
    }
    // freeze parameters pinned at a bound that the gradient pushes outward
    const free = [];
    for (let j = 0; j < n; j++) if (!((x[j] <= 0 && g[j] > 0) || (x[j] >= 1 && g[j] < 0))) free.push(j);
    let accepted = false;
    for (let tries = 0; tries < 6 && count < maxEvals; tries++) {
      const m = free.length;
      const Am = free.map((a) => free.map((b) => A[a][b] + (a === b ? mu * (A[a][a] + 1e-3) : 0)));
      const d = solve(Am, free.map((a) => -g[a]));
      if (!d) { mu *= 4; continue; }
      const xn = x.slice();
      for (let k = 0; k < m; k++) xn[free[k]] = clamp01(x[free[k]] + d[k]);
      const stepLen = Math.max(...xn.map((v, i) => Math.abs(v - x[i])));
      if (stepLen < 2e-4) break;
      const rn = await R(xn), fn = sq(rn);
      if (fn < f) { x = xn; r = rn; const df = f - fn; f = fn; mu = Math.max(1e-5, mu / 3); accepted = df > 1e-4 * Math.max(1, f) || stepLen > 2e-3; accepted = accepted || true; break; }
      mu *= 4;
    }
    if (!accepted) break;
  }
  onProgress?.(1);
  const params = {};
  keys.forEach((k, i) => { params[k] = Math.round(x[i] * 1000) / 1000; });
  return { params: { ...fixed, ...params }, cost: f, evals: count };
}

// Gaussian elimination with partial pivoting
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

// ----------------------------------------------------------------- worker-friendly wrappers (plain data out)

/** Photo fit + model circumferences at the landmark heights (all fractions of height). */
export async function fitPhotoReport(target, opts = {}) {
  const r = await fitPhoto(target, opts);
  return { params: r.params, evals: r.evals, ms: r.ms, cost: r.cost, fitted: r.fitted, circ: modelCircs(r.model, target.lm), upperArm: BM.upperArmWidth(r.model) };
}

/** Tape fit (cm in, cm out). */
export async function fitTapeReport(tape, opts = {}) {
  const r = await fitTape(tape, opts);
  return { params: r.params, evals: r.evals, ms: r.ms, cost: r.cost, tape: r.tape };
}
