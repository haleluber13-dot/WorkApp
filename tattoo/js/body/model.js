// Parametric human body as a list of smooth-blended SDF primitives.
// Built in canonical units: a 1.78 m tall figure (meters, Y up, feet at y=0,
// facing +Z, person's left = +X). The caller scales by heightCm/178.
import { SDFBuilder } from "./sdf.js";
import { add, sub, mul, norm, len, dot, cross, lerp, tilt, rad, frame, makeFrame } from "./vec.js";

export const DEFAULT_BODY = Object.freeze({
  sex: "male",
  heightCm: 178,
  build: 0.5,
  muscle: 0.5,
  shoulders: 0.5,
  chest: 0.5,
  hips: 0.5,
  legLength: 0.5,
  armPose: 30,
  detail: "medium",
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

export function normalizeParams(p = {}) {
  const d = DEFAULT_BODY;
  return {
    sex: p.sex === "female" ? "female" : "male",
    heightCm: clamp(num(p.heightCm, d.heightCm), 140, 210),
    build: clamp(num(p.build, d.build), 0, 1),
    muscle: clamp(num(p.muscle, d.muscle), 0, 1),
    shoulders: clamp(num(p.shoulders, d.shoulders), 0, 1),
    chest: clamp(num(p.chest, d.chest), 0, 1),
    hips: clamp(num(p.hips, d.hips), 0, 1),
    legLength: clamp(num(p.legLength, d.legLength), 0, 1),
    armPose: clamp(num(p.armPose, d.armPose), 5, 90),
    detail: p.detail === "low" || p.detail === "high" ? p.detail : "medium",
  };
}

const gauss = (y, c, w) => Math.exp(-((y - c) * (y - c)) / (2 * w * w));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// orthonormal axes with first axis along a, second as close as possible to hint
function axesAlong(a, hint) {
  a = norm(a);
  let b = sub(hint, mul(a, dot(hint, a)));
  b = norm(b);
  const c = cross(a, b);
  return [a, b, c];
}

export function buildModel(params) {
  const P = normalizeParams(params);
  const F = P.sex === "female" ? 1 : 0;
  const mf = (m, f) => m + (f - m) * F;
  const bd = P.build - 0.5, mu = P.muscle - 0.5, sh = P.shoulders - 0.5, ch = P.chest - 0.5, hp = P.hips - 0.5;

  // vertical proportions (legLength keeps total height constant)
  const LL = 1 + (P.legLength - 0.5) * 0.16;
  const ANK = 0.075, HIP0 = 0.92, TOP = 1.78;
  const hipY = ANK + (HIP0 - ANK) * LL;
  const TS = (TOP - hipY) / (TOP - HIP0);
  const ty = (y) => (y <= ANK ? y : y <= HIP0 ? ANK + (y - ANK) * LL : hipY + (y - HIP0) * TS);

  const g = 1 + bd * 0.26;                 // torso girth
  const lg = 1 + bd * 0.24 + mu * 0.07;    // limb girth
  const ms = 1 + mu * 0.5;                 // muscle volume
  const soft = clamp(1 - mu * 0.7 + bd * 0.6 + F * 0.25, 0.5, 1.8); // blend softness (definition)

  const B = new SDFBuilder();
  const skel = { params: P, F, sides: {} };
  const handPrims = { 1: [], [-1]: [] };

  // ---------------------------------------------------------------- torso
  const rowsM = [
    [0.85, 0.118, 0.066, 0.088, -0.010],
    [0.88, 0.150, 0.080, 0.100, -0.012],
    [0.92, 0.161, 0.085, 0.104, -0.014],
    [0.97, 0.156, 0.088, 0.098, -0.010],
    [1.02, 0.148, 0.092, 0.088, -0.004],
    [1.07, 0.140, 0.095, 0.080, 0.002],
    [1.11, 0.138, 0.094, 0.078, 0.004],
    [1.16, 0.146, 0.097, 0.084, 0.002],
    [1.21, 0.159, 0.103, 0.094, -0.002],
    [1.27, 0.165, 0.106, 0.100, -0.006],
    [1.33, 0.164, 0.102, 0.100, -0.008],
    [1.39, 0.147, 0.090, 0.092, -0.010],
    [1.43, 0.112, 0.075, 0.082, -0.012],
  ];
  const rowsF = [
    [0.85, 0.128, 0.068, 0.094, -0.012],
    [0.88, 0.160, 0.080, 0.113, -0.016],
    [0.92, 0.177, 0.084, 0.113, -0.018],
    [0.97, 0.168, 0.086, 0.100, -0.012],
    [1.02, 0.147, 0.087, 0.085, -0.004],
    [1.07, 0.129, 0.087, 0.075, 0.002],
    [1.12, 0.121, 0.085, 0.070, 0.004],
    [1.17, 0.127, 0.087, 0.075, 0.002],
    [1.22, 0.136, 0.092, 0.083, -0.002],
    [1.27, 0.143, 0.096, 0.089, -0.006],
    [1.33, 0.144, 0.093, 0.089, -0.008],
    [1.39, 0.129, 0.082, 0.082, -0.010],
    [1.43, 0.098, 0.068, 0.074, -0.012],
  ];
  const rows = rowsM.map((r, i) => {
    const f = rowsF[i];
    const y = r[0];
    let a = (r[1] + (f[1] - r[1]) * F) * g;
    let bf = (r[2] + (f[2] - r[2]) * F) * g;
    let bb = (r[3] + (f[3] - r[3]) * F) * g;
    const cz = r[4] + (f[4] - r[4]) * F;
    a += hp * 0.034 * gauss(y, 0.91, 0.06);
    a += bd * 0.012 * gauss(y, 1.06, 0.06);
    a += sh * 0.018 * sstep(1.17, 1.36, y);
    a += mu * 0.010 * gauss(y, 1.29, 0.07) - mu * 0.006 * gauss(y, 1.1, 0.05);
    bf += bd * 0.045 * gauss(y, 1.05, 0.07);
    bb += hp * 0.012 * gauss(y, 0.9, 0.05);
    return [ty(y), a, bf, bb, cz];
  });
  B.loftY(rows, 0, 128);
  const loftAt = (y) => { // approximate profile (canonical y before ty)
    for (let i = 0; i < rows.length - 1; i++) if (rows[i + 1][0] >= ty(y)) {
      const t = (ty(y) - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
      return rows[i].map((v, j) => v + (rows[i + 1][j] - v) * t);
    }
    return rows[rows.length - 1];
  };

  const sx = mf(0.183, 0.163) + sh * 0.03 + bd * 0.01 + mu * 0.006; // shoulder joint x
  const hx = mf(0.084, 0.088) + hp * 0.012;                         // hip joint x
  const yS = ty(1.445);

  // glutes
  for (const s of [1, -1]) {
    const gr = (1 + hp * 0.35 + F * 0.12) * (1 + bd * 0.2) * (1 + mu * 0.15);
    B.ell([s * 0.074 * (1 + hp * 0.2), ty(0.895), -0.066 - F * 0.006], I3,
      [0.078 * gr, 0.078 * gr, 0.1 * gr, 0.08 * gr, 0.05 * gr, 0.068 * gr], 0.03 * soft);
  }
  // crotch / pelvic floor bridge
  B.ell([0, ty(0.878), -0.006], I3, [0.06 * g, 0.06 * g, 0.04, 0.042, 0.065, 0.075], 0.03);
  // abdomen / belly
  B.ell([0, ty(1.07), 0.04 + bd * 0.02], I3, [0.1 * g, 0.1 * g, 0.12, 0.13, 0.06 + bd * 0.03, 0.05], 0.05);
  if (!F) {
    // rectus abdominis (subtle)
    B.ell([0, ty(1.12), 0.058], I3, [0.07, 0.07, 0.13, 0.12, 0.04 + mu * 0.006, 0.03], 0.03 * soft);
  }
  // lats (V taper)
  for (const s of [1, -1]) {
    const ay = norm([s * 0.25, 1, 0]);
    B.ell([s * (0.12 + sh * 0.01), ty(1.25), -0.03], [[ay[1], -ay[0], 0], ay, [0, 0, 1]],
      [0.04 * ms * g, 0.035 * ms * g, 0.13, 0.12, 0.045, 0.05], 0.04 * soft);
  }
  // scapulae / upper back
  for (const s of [1, -1]) {
    B.ell([s * 0.085, ty(1.355), -0.075], I3, [0.065, 0.06, 0.075, 0.08, 0.025, 0.025], 0.03);
  }
  // shoulder girdle mass
  B.ell([0, ty(1.41), -0.01], I3, [sx * 0.92, sx * 0.92, 0.065, 0.08, 0.09 * g, 0.095 * g], 0.045);
  // pecs / breasts
  for (const s of [1, -1]) {
    if (!F) {
      const ang = rad(18);
      const ax = [[s * Math.cos(ang), Math.sin(ang), 0], [-s * Math.sin(ang), Math.cos(ang), 0], [0, 0, 1]];
      const th = (0.026 + ch * 0.016 + mu * 0.012 + bd * 0.01);
      B.ell([s * 0.074, ty(1.318), 0.072], ax, [0.08 * (1 + mu * 0.1), 0.075, 0.06, 0.055, th, 0.03], 0.02 * soft);
    } else {
      // pectoral base (soft)
      B.ell([s * 0.07, ty(1.33), 0.062], I3, [0.065, 0.06, 0.05, 0.05, 0.025, 0.025], 0.03);
      const r = 0.048 + (P.chest) * 0.04 + bd * 0.012;
      const a0 = norm([s * 0.3, -0.12, 1]);
      const ax = axesAlong(a0, [0, 1, 0]);
      const c = add([s * 0.087, ty(1.268) - r * 0.15, 0.064], mul(a0, r * 0.05));
      // axes: [out-of-chest, up, side]
      B.ell(c, ax, [r * 0.82, r * 0.5, r * 0.82, r * 0.98, r * 0.95, r * 0.95], 0.028);
    }
  }
  // clavicles and trapezius
  for (const s of [1, -1]) {
    B.cone([s * 0.022, ty(1.452), 0.06], [s * (sx - 0.03), ty(1.474), 0.008], 0.0095, 0.011, 0.014);
    const n0 = [s * 0.03, ty(1.53), -0.035], a0 = [s * (sx - 0.025), ty(1.47), -0.015];
    const mid = add(lerp(n0, a0, 0.5), [0, -0.008, 0]);
    const ax = axesAlong(sub(a0, n0), [0, 1, 0]);
    const trap = 1 + mu * 0.4 + bd * 0.15;
    B.ell(mid, [ax[0], ax[1], ax[2]], [len(sub(a0, n0)) * 0.62, len(sub(a0, n0)) * 0.62, 0.034 * trap, 0.045, 0.055, 0.055], 0.035);
  }
  // upper-back trapezius diamond
  B.ell([0, ty(1.38), -0.075], I3, [0.09, 0.09, 0.13, 0.15, 0.03, 0.032 + mu * 0.006], 0.04);

  // ---------------------------------------------------------------- neck & head
  const nr = mf(0.06, 0.05) * (1 + bd * 0.15 + mu * 0.1);
  B.cone([0, ty(1.43), -0.03], [0, ty(1.6), -0.008], nr, nr * 0.9, 0.04);
  for (const s of [1, -1]) {
    // sternocleidomastoid (subtle)
    B.cone([s * 0.05, ty(1.62), -0.012], [s * 0.014, ty(1.462), 0.05], 0.011, 0.011, 0.03);
  }
  const hsz = mf(1, 0.955);
  // head origin: ear-canal level, centred over the neck
  const H0 = [0, ty(1.643), 0.004];
  const hp3 = (x, y, z) => [H0[0] + x * hsz, H0[1] + y * hsz, H0[2] + z * hsz];
  const hk = (k) => k * hsz;
  const R6 = (x, y1, y2, z1, z2) => [x, x, y1, y2, z1, z2].map(hk);
  // cranium
  B.ell(hp3(0, 0.045, -0.005), I3, R6(0.077, 0.092, 0.07, 0.095, 0.092), hk(0.03));
  // face, lower face, chin, jaw
  B.ell(hp3(0, -0.022, 0.035), I3, R6(mf(0.066, 0.063), 0.06, 0.065, 0.064, 0.05), hk(0.03));
  B.ell(hp3(0, -0.068, 0.03), I3, R6(mf(0.054, 0.05), 0.04, 0.04, 0.06, 0.045), hk(0.03));
  B.ell(hp3(0, -0.097, 0.077), I3, R6(mf(0.021, 0.017), 0.016, 0.016, 0.018, 0.016), hk(0.02));
  B.ell(hp3(0, -0.085, 0.025), I3, R6(0.045, 0.02, 0.02, 0.04, 0.04), hk(0.03));
  for (const s of [1, -1]) {
    B.cone(hp3(s * 0.052, -0.074, -0.004), hp3(s * 0.02, -0.103, 0.064), hk(mf(0.012, 0.01)), hk(0.012), hk(0.02)); // jaw line
    B.ell(hp3(s * 0.054, -0.004, 0.058), I3, R6(0.018, 0.012, 0.014, 0.016, 0.016), hk(0.022));                      // cheekbone
  }
  B.ell(hp3(0, 0.027, 0.078), I3, R6(0.05, 0.014, 0.014, mf(0.02, 0.017), 0.02), hk(0.022));                          // brow
  for (const s of [1, -1]) {
    B.ell(hp3(s * 0.032, 0.006, 0.099), I3, R6(0.016, 0.011, 0.011, 0.012, 0.012), hk(0.012), { sub: true });           // eye socket
    B.ell(hp3(s * 0.032, 0.005, 0.078), I3, R6(0.012, 0.0115, 0.0115, 0.012, 0.012), hk(0.004));                       // eyeball / lids
  }
  // nose
  B.cone(hp3(0, 0.012, 0.094), hp3(0, -0.026, 0.114), hk(0.0065), hk(0.0082), hk(0.008));
  B.ell(hp3(0, -0.029, 0.111), I3, R6(0.0092, 0.0085, 0.008, 0.009, 0.009), hk(0.006));
  for (const s of [1, -1]) B.ell(hp3(s * 0.011, -0.034, 0.103), I3, R6(0.0075, 0.006, 0.006, 0.0075, 0.0075), hk(0.006));
  // lips
  B.ell(hp3(0, -0.055, 0.094), I3, R6(0.02, 0.006, 0.0055, 0.0075, 0.007), hk(0.007));
  B.ell(hp3(0, -0.068, 0.092), I3, R6(0.017, 0.0055, 0.006, 0.0075, 0.007), hk(0.007));
  // ears
  for (const s of [1, -1]) {
    const ax = axesAlong([0, 1, -0.3], [s, 0, 0]);
    B.ell(hp3(s * 0.073, 0.004, -0.012), [ax[1], ax[0], ax[2]], [0.012, 0.006, 0.031, 0.026, 0.017, 0.015].map(hk), hk(0.006));
  }
  skel.head = { center: hp3(0, 0.02, 0.0), top: hp3(0, 0.135, 0), chin: hp3(0, -0.105, 0.08), scale: hsz };
  skel.neck = { base: [0, ty(1.43), -0.02], top: [0, ty(1.6), -0.01], r: nr };

  // ---------------------------------------------------------------- legs & feet
  for (const s of [1, -1]) {
    const Hj = [s * hx, hipY, 0.0];
    const K = [s * (hx + 0.004), ty(0.505), 0.008];
    const A = [s * (hx + 0.014), ANK, -0.012];
    const FT = frame(Hj, sub(K, Hj), [0, 0, 1], s), Lt = len(sub(K, Hj));
    const FS = frame(K, sub(A, K), [0, 0, 1], s), Ls = len(sub(A, K));
    const tf = mf(1, 1.07) * lg * (1 + hp * 0.08);
    const ramp = (k0, u0, u1) => ({ o: FT.p(u1), dir: mul(FT.d, -1), len: u1 - u0, k0 });
    const thighOpt = { ramp: ramp(0.012, 0.06, 0.22) };
    B.cone(FT.p(0.0, 0.016, -0.004), FT.p(Lt - 0.03), 0.085 * tf, 0.05 * lg, 0.05, thighOpt);
    const mq = ms * lg;
    B.ell(FT.p(0.19, 0.006, 0.026), FT.axes(), [0.19, 0.15, 0.058 * mq, 0.05 * mq, 0.052 * mq, 0.04], 0.03 * soft, thighOpt);   // quads
    B.ell(FT.p(0.2, 0.034, 0.0), FT.axes(), [0.17, 0.16, 0.04 * mq, 0.03, 0.045 * mq, 0.04], 0.03 * soft, thighOpt);          // vastus lateralis
    B.ell(FT.p(Lt - 0.095, -0.028, 0.022), FT.axes(), [0.06, 0.07, 0.025, 0.036 * mq, 0.035 * mq, 0.03], 0.025 * soft);         // vastus medialis
    B.ell(FT.p(0.19, 0.0, -0.028), FT.axes(), [0.17, 0.15, 0.05 * mq, 0.05 * mq, 0.03, 0.052 * mq], 0.03 * soft, thighOpt);    // hamstrings
    B.ell(FT.p(0.09, -0.032, -0.004), FT.axes(), [0.13, 0.08, 0.04, 0.048 * tf, 0.045, 0.045], 0.03 * soft, thighOpt);        // adductors
    if (F || hp > 0) {
      const w = F * 0.8 + Math.max(0, hp) * 0.6;
      B.ell(FT.p(0.06, 0.04, -0.012), FT.axes(), [0.1, 0.08, 0.035 + 0.025 * w, 0.03, 0.055, 0.06], 0.05, thighOpt);              // hip / outer thigh
    }
    // knee
    B.ell(K, FT.axes(), [0.05, 0.05, 0.044, 0.046, 0.042, 0.04].map((v) => v * lg), 0.03);
    B.ell(FT.p(Lt - 0.008, 0.0, 0.041), FT.axes(), [0.025, 0.025, 0.022, 0.022, 0.012, 0.012], 0.015);
    // shank
    const sg = lg * mf(1, 0.96);
    B.cone(FS.p(0.02), FS.p(Ls - 0.012), 0.045 * sg, 0.031 * (1 + bd * 0.1), 0.02);
    B.ell(FS.p(0.115, -0.017, -0.028), FS.axes(), [0.09, 0.06, 0.03, 0.035 * ms * sg, 0.03, 0.042 * ms * sg], 0.018 * soft);    // gastroc medial
    B.ell(FS.p(0.105, 0.018, -0.026), FS.axes(), [0.075, 0.055, 0.032 * ms * sg, 0.026, 0.03, 0.036 * ms * sg], 0.018 * soft);  // gastroc lateral
    B.ell(FS.p(0.2, 0.0, -0.016), FS.axes(), [0.13, 0.1, 0.038 * sg, 0.038 * sg, 0.025, 0.032 * sg], 0.025);                   // soleus
    B.ell(FS.p(0.15, 0.012, 0.018), FS.axes(), [0.14, 0.12, 0.02, 0.016, 0.018, 0.015], 0.02);                                 // tibialis
    B.cone(FS.p(Ls - 0.11, 0.0, -0.022), add(A, [0, -0.028, -0.042]), 0.012, 0.013, 0.015);                                    // achilles
    B.ell(add(A, mul(FS.l, -0.019)), I3, [0.0135, 0.0135, 0.016, 0.016, 0.014, 0.014], 0.01);                                 // medial malleolus
    B.ell(add(add(A, mul(FS.l, 0.021)), [0, -0.01, -0.008]), I3, [0.013, 0.013, 0.016, 0.016, 0.013, 0.013], 0.01);           // lateral malleolus

    // foot
    const fs = mf(1, 0.9);
    const toe = rad(7);
    const fw = [s * Math.sin(toe), 0, Math.cos(toe)], up = [0, 1, 0], lt = [s * Math.cos(toe), 0, -s * Math.sin(toe)];
    const FO = makeFrame([A[0], 0, A[2] + 0.004], fw, lt, up);
    const fp = (a, b, c) => FO.p(a * fs, b * fs, c * fs);
    const fax = [fw, lt, up];
    const fk = (v) => v * fs;
    B.ell(fp(-0.026, 0, 0.033), fax, [0.04, 0.037, 0.031, 0.031, 0.04, 0.038].map(fk), fk(0.012));                       // heel
    B.ell(fp(0.05, 0.004, 0.029), fax, [0.09, 0.07, 0.041, 0.035, 0.035, 0.034].map(fk), fk(0.014));                     // midfoot
    B.cone(A, fp(0.07, -0.004, 0.034), 0.034, fk(0.022), 0.02);                                                          // instep
    B.ell(fp(0.132, -0.002, 0.019), fax, [0.03, 0.04, 0.047, 0.044, 0.02, 0.022].map(fk), fk(0.012));                   // ball
    B.cone(fp(0.15, -0.026, 0.018), fp(0.2, -0.03, 0.014), fk(0.0135), fk(0.0125), fk(0.006));                          // big toe
    const tb = [-0.005, 0.012, 0.026, 0.038], ta = [0.193, 0.186, 0.176, 0.164], tr = [0.0092, 0.0087, 0.0082, 0.0077];
    for (let i = 0; i < 4; i++) B.cone(fp(0.145, tb[i] * 0.85, 0.015), fp(ta[i], tb[i] * 1.12, 0.01), fk(tr[i]), fk(tr[i] * 0.95), fk(0.004));

    skel.sides[s] = Object.assign(skel.sides[s] || {}, { hip: Hj, knee: K, ankle: A, FT, FS, FO, Lt, Ls, footScale: fs });
  }

  // ---------------------------------------------------------------- arms & hands
  const th = rad(P.armPose);
  for (const s of [1, -1]) {
    const S = [s * sx, yS, -0.008];
    const dU = norm([s * Math.sin(th), -Math.cos(th), 0.035]);
    const FU = frame(S, dU, [0, 0, 1], s);
    const Lu = mf(0.3, 0.285);
    const E = FU.p(Lu);
    let dF = tilt(FU.d, FU.l, rad(9));
    dF = tilt(dF, FU.f, rad(10));
    const FF = frame(E, dF, FU.f, s);
    const Lf = mf(0.255, 0.24);
    const W = FF.p(Lf);
    const FH = frame(W, tilt(FF.d, FF.f, rad(6)), FF.f, s);
    const ag = lg * mf(1, 0.88);
    const armRamp = { o: FU.p(0.2), dir: mul(FU.d, -1), len: 0.12, k0: 0.012 };
    const dm = ms * (1 + bd * 0.1);
    B.ell(FU.p(0.03, 0.006, 0.0), FU.axes(), [0.11, 0.06, 0.05 * dm, 0.035, 0.052 * dm, 0.055 * dm], 0.035 * soft, { ramp: { ...armRamp, k0: 0.02 } }); // deltoid
    B.cone(FU.p(0.0), FU.p(Lu), 0.045 * ag, 0.036 * ag, 0.03, { ramp: armRamp });                                     // humerus
    B.ell(FU.p(0.165, -0.003, 0.02), FU.axes(), [0.09, 0.08, 0.032 * ag, 0.03 * ag, 0.033 * ms * ag, 0.02], 0.016 * soft);   // biceps
    B.ell(FU.p(0.13, 0.0, -0.018), FU.axes(), [0.11, 0.09, 0.034 * ag, 0.03 * ag, 0.02, 0.036 * ms * ag], 0.018 * soft);      // triceps
    B.ell(FU.p(Lu - 0.004, 0, -0.022), I3, [0.016, 0.016, 0.016, 0.016, 0.016, 0.016], 0.012);                        // olecranon
    B.ell(FU.p(Lu - 0.006, -0.03, -0.004), I3, [0.014, 0.014, 0.014, 0.014, 0.014, 0.014], 0.012);                    // medial epicondyle
    // forearm
    B.cone(FF.p(0.0), FF.p(Lf - 0.01), 0.036 * ag, 0.023 * ag, 0.016);
    B.ell(FF.p(0.075, 0.0, 0.0), FF.axes(), [0.12, 0.06, 0.043 * ag * ms ** 0.5, 0.043 * ag * ms ** 0.5, 0.034 * ag, 0.032 * ag], 0.016 * soft);
    B.ell(FF.p(0.055, 0.024, 0.006), FF.axes(), [0.09, 0.05, 0.025 * ag, 0.02, 0.022 * ag, 0.02], 0.016 * soft);          // brachioradialis
    B.ell(FF.p(Lf - 0.008), FF.axes(), [0.03, 0.03, 0.029, 0.029, 0.018, 0.019].map((v) => v * ag), 0.012);           // wrist

    // hand (u along fingers, v toward thumb, w toward palm)
    const hs = mf(1, 0.9) * (1 + bd * 0.04);
    const hpnt = (u, v, w) => FH.p(u * hs, v * hs, w * hs);
    const hk2 = (k) => k * hs;
    const pushHand = (i) => handPrims[s].push(i);
    pushHand(B.cone(W, hpnt(0.03, 0, 0), 0.023 * ag, hk2(0.021), 0.01));
    pushHand(B.box(hpnt(0.054, -0.002, -0.001), FH.axes(), [0.029, 0.031, 0.0055].map(hk2), hk2(0.0095), hk2(0.012)));    // palm
    pushHand(B.ell(hpnt(0.03, 0.021, 0.008), FH.axes(), [0.03, 0.03, 0.018, 0.016, 0.014, 0.01].map(hk2), hk2(0.012)));  // thenar
    pushHand(B.ell(hpnt(0.045, -0.029, 0.006), FH.axes(), [0.035, 0.035, 0.012, 0.012, 0.011, 0.01].map(hk2), hk2(0.01))); // hypothenar
    const fingers = [];
    const mcpU = [0.088, 0.092, 0.088, 0.08], mcpV = [0.0285, 0.009, -0.011, -0.0285];
    const spread = [9, 2, -6, -14];
    const lens = [[0.042, 0.025, 0.02], [0.046, 0.029, 0.021], [0.043, 0.027, 0.02], [0.034, 0.019, 0.018]];
    const radii = [[0.0094, 0.0084, 0.0075, 0.0066], [0.0097, 0.0087, 0.0078, 0.0068], [0.009, 0.0081, 0.0073, 0.0064], [0.008, 0.0072, 0.0065, 0.0057]];
    const curl = [[8, 14, 8], [10, 16, 9], [12, 18, 10], [14, 20, 10]];
    const fg = mf(1, 0.92) * (1 + bd * 0.08);
    for (let f = 0; f < 4; f++) {
      let dir = tilt(FH.d, FH.l, rad(spread[f]));
      const side = norm(cross(FH.f, dir)); // not used for geometry, keeps frame orthogonal
      void side;
      let p = hpnt(mcpU[f], mcpV[f], 0.0);
      const joints = [p];
      let total = 0, cum = 0;
      for (let j = 0; j < 3; j++) {
        cum += curl[f][j];
        const fdir = tilt(dir, FH.f, rad(cum));
        const q = add(p, mul(fdir, lens[f][j] * hs));
        const start = j === 0 ? sub(p, mul(fdir, 0.012 * hs)) : p;
        const end = j === 2 ? add(q, mul(fdir, -0.003 * hs)) : q;
        pushHand(B.cone(start, end, radii[f][j] * hs * fg, radii[f][j + 1] * hs * fg, hk2(j === 0 ? 0.005 : 0.003)));
        p = q; joints.push(q); total += lens[f][j];
        if (j === 2) dir = fdir;
      }
      fingers.push({ joints, dir, len: total * hs });
    }
    // thumb
    const t1 = tilt(FH.d, FH.l, rad(40));
    const tdir = tilt(t1, FH.f, rad(32));
    const cmc = hpnt(0.026, 0.02, 0.008);
    const tl = [0.045, 0.032, 0.027], tr = [0.0125, 0.011, 0.0098, 0.0086];
    let tp = cmc, td = tdir;
    const tj = [tp];
    for (let j = 0; j < 3; j++) {
      if (j > 0) td = norm(add(td, add(mul(FH.f, 0.12), mul(FH.l, -0.1))));
      const q = add(tp, mul(td, tl[j] * hs));
      pushHand(B.cone(tp, j === 2 ? add(q, mul(td, -0.004 * hs)) : q, tr[j] * hs * fg, tr[j + 1] * hs * fg, hk2(j === 0 ? 0.01 : 0.004)));
      tp = q; tj.push(q);
    }
    Object.assign(skel.sides[s], { shoulder: S, elbow: E, wrist: W, FU, FF, FH, Lu, Lf, handScale: hs, fingers, thumb: { joints: tj, dir: td } });
  }

  B.floor(0.004);
  const sdf = B.build();

  // refinement boxes around the hands
  const refine = [];
  for (const s of [1, -1]) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const i of handPrims[s]) {
      const bb = sdf.bboxes[i];
      for (let j = 0; j < 3; j++) { b[j] = Math.min(b[j], bb[j]); b[j + 3] = Math.max(b[j + 3], bb[j + 3]); }
    }
    // refine mostly across the fingers (finger separation direction = hand frame l)
    const l = skel.sides[s].FH.l;
    const RF = globalThis.__RF ?? 0.5, RZ = globalThis.__RZ ?? 0.8;
    const fx = 1 - (1 - RF) * Math.min(1, Math.abs(l[0]) * 1.3), fy = 1 - (1 - RF) * Math.min(1, Math.abs(l[1]) * 1.3);
    refine.push({ min: [b[0] - 0.004, b[1] - 0.004, b[2] - 0.004], max: [b[3] + 0.004, b[4] + 0.004, b[5] + 0.004], factor: [fx, fy, RZ] });
  }
  skel.ty = ty;
  skel.loftAt = loftAt;
  skel.sx = sx; skel.hx = hx;
  return { sdf, skel, refine, params: P };
}
