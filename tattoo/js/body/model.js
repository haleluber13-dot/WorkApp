// Parametric human body as a list of smooth-blended SDF primitives.
// Built in canonical units: a 1.78 m tall figure (meters, Y up, feet at y=0,
// facing +Z, person's left = +X). The caller scales by heightCm/178.
import { SDFBuilder } from "./sdf.js";
import { projectToSurface, surfaceNormal } from "./regions.js";
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

export function buildModel(params, opts = {}) {
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
  const sx = mf(0.183, 0.156) + sh * 0.03 + bd * 0.01 + mu * 0.006; // shoulder joint x
  const hx = mf(0.084, 0.088) + hp * 0.012;                       // hip joint x
  const yS = ty(1.445);
  // [y, half width, front half depth, back half depth, centre z]; y canonical (before ty)
  const rowsM = [
    [0.815, 0.06, 0.04, 0.05, -0.008],
    [0.85, 0.118, 0.068, 0.088, -0.010],
    [0.88, 0.148, 0.089, 0.104, -0.012],
    [0.92, 0.157, 0.092, 0.108, -0.014],
    [0.97, 0.149, 0.091, 0.102, -0.012],
    [1.02, 0.142, 0.096, 0.094, -0.004],
    [1.07, 0.138, 0.099, 0.088, 0.004],
    [1.11, 0.136, 0.099, 0.086, 0.005],
    [1.16, 0.144, 0.102, 0.090, 0.002],
    [1.21, 0.158, 0.108, 0.099, -0.003],
    [1.27, 0.169, 0.112, 0.105, -0.008],
    [1.33, 0.171, 0.107, 0.104, -0.012],
    [1.39, 0.164, 0.099, 0.099, -0.015],
    [1.43, 0, 0.088, 0.094, -0.018],
    [1.46, 0, 0.072, 0.086, -0.021],
    [1.49, 0, 0.052, 0.074, -0.023],
    [1.515, 0.068, 0.042, 0.060, -0.025],
  ];
  const rowsF = [
    [0.815, 0.065, 0.04, 0.052, -0.01],
    [0.85, 0.128, 0.070, 0.094, -0.012],
    [0.88, 0.162, 0.088, 0.114, -0.016],
    [0.92, 0.176, 0.091, 0.116, -0.018],
    [0.97, 0.166, 0.089, 0.104, -0.014],
    [1.02, 0.147, 0.090, 0.089, -0.004],
    [1.07, 0.131, 0.089, 0.080, 0.004],
    [1.12, 0.123, 0.087, 0.076, 0.005],
    [1.17, 0.128, 0.089, 0.080, 0.002],
    [1.22, 0.136, 0.094, 0.087, -0.003],
    [1.27, 0.145, 0.098, 0.093, -0.008],
    [1.33, 0.146, 0.095, 0.093, -0.012],
    [1.39, 0.138, 0.088, 0.088, -0.015],
    [1.43, 0, 0.078, 0.084, -0.018],
    [1.46, 0, 0.064, 0.077, -0.021],
    [1.49, 0, 0.047, 0.066, -0.023],
    [1.515, 0.058, 0.038, 0.054, -0.025],
  ];
  const topA = { 1.43: sx - 0.022, 1.46: sx - 0.034, 1.49: sx * 0.64 };
  const rows = rowsM.map((r, i) => {
    const f = rowsF[i];
    const y = r[0];
    let a = topA[y] !== undefined ? topA[y] : (r[1] + (f[1] - r[1]) * F) * g;
    let bf = (r[2] + (f[2] - r[2]) * F) * g;
    let bb = (r[3] + (f[3] - r[3]) * F) * g;
    const cz = r[4] + (f[4] - r[4]) * F;
    a += hp * 0.03 * gauss(y, 0.91, 0.06);
    a += bd * 0.012 * gauss(y, 1.06, 0.06);
    a += sh * 0.018 * sstep(1.17, 1.36, y) * (1 - sstep(1.39, 1.43, y));
    a += mu * 0.010 * gauss(y, 1.29, 0.07) - mu * 0.006 * gauss(y, 1.1, 0.05);
    bf += bd * 0.045 * gauss(y, 1.05, 0.07);
    bb += hp * 0.012 * gauss(y, 0.9, 0.05);
    return [ty(y), a, bf, bb, cz];
  });
  B.loftY(rows, 0, 160);
  const loftAt = (y) => { // approximate profile (canonical y before ty)
    for (let i = 0; i < rows.length - 1; i++) if (rows[i + 1][0] >= ty(y)) {
      const t = (ty(y) - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
      return rows[i].map((v, j) => v + (rows[i + 1][j] - v) * t);
    }
    return rows[rows.length - 1];
  };

  // glutes
  for (const s of [1, -1]) {
    const gr = (1 + hp * 0.35 + F * 0.1) * (1 + bd * 0.2) * (1 + mu * 0.15);
    B.ell([s * 0.074 * (1 + hp * 0.2), ty(0.885), -0.062 - F * 0.006], I3,
      [0.072 * gr, 0.064 * gr, 0.085 * gr, 0.075 * gr, 0.05 * gr, 0.064 * gr], 0.05 * soft);
  }
  // crotch / pelvic floor bridge
  B.ell([0, ty(0.872), -0.01], I3, [0.052 * g, 0.052 * g, 0.04, 0.045, 0.06, 0.07], 0.03);
  // pubic mound
  B.ell([0, ty(0.882), mf(0.048, 0.044)], I3, [0.05 * g, 0.05 * g, 0.05, 0.05, mf(0.036, 0.03), 0.05], 0.045);
  // abdomen / belly
  B.ell([0, ty(1.06), 0.042 + bd * 0.02], I3, [0.1 * g, 0.1 * g, 0.12, 0.12, mf(0.052, 0.042) + bd * 0.035, 0.05], 0.04);
  if (!F) {
    // rectus abdominis (subtle)
    B.ell([0, ty(1.12), 0.06], I3, [0.068, 0.068, 0.12, 0.12, 0.04 + mu * 0.006, 0.03], 0.035 * soft);
  }
  // lats (V taper)
  for (const s of [1, -1]) {
    const ay = norm([s * 0.25, 1, 0]);
    B.ell([s * (0.124 + sh * 0.01), ty(1.26), -0.03], [[ay[1], -ay[0], 0], ay, [0, 0, 1]],
      [0.048 * ms * g * mf(1, 0.75), 0.035 * ms * g, 0.12, 0.13, 0.045, 0.05], 0.045 * soft);
  }
  // scapulae
  for (const s of [1, -1]) {
    B.ell([s * 0.085, ty(1.36), -0.075], I3, [0.065, 0.06, 0.07, 0.08, 0.025, mf(0.022, 0.017)], 0.05);
  }
  // pecs / breasts
  for (const s of [1, -1]) {
    if (!F) {
      const ang = rad(20);
      const ax = [[s * Math.cos(ang), Math.sin(ang), 0], [-s * Math.sin(ang), Math.cos(ang), 0], [0, 0, 1]];
      // protrusion of the pec above the ribcage surface (thickness kept sane for the distance bound)
      const pr = clamp(0.009 + ch * 0.014 + mu * 0.01 + bd * 0.008, 0.0015, 0.022);
      const th = 0.022;
      const px = 0.072, L = loftAt(1.32);
      const pz = L[2] * Math.sqrt(1 - (px / L[1]) ** 2) + L[4];
      B.ell([s * px, ty(1.32), pz - th + pr], ax, [0.078 * (1 + mu * 0.1), 0.062, 0.065, 0.042, th, 0.03], 0.032 * soft);
    } else {
      const r = 0.044 + P.chest * 0.04 + bd * 0.012;
      const L = loftAt(1.255);
      const bx = 0.08;
      const pz = L[2] * Math.sqrt(Math.max(0.05, 1 - (bx / L[1]) ** 2)) + L[4];
      const a0 = norm([s * 0.22, -0.12, 1]);
      const ax = axesAlong(a0, [0, 1, 0]);
      // axes: [out of the chest, up, side]; teardrop: long soft upper slope, full lower pole
      const c = [s * bx, ty(1.255), pz - r * 0.3];
      B.ell(c, ax, [r * 0.98, r * 0.4, r * 1.4, r * 0.92, r * 1.0, r * 1.0], 0.05);
    }
  }
  // clavicles and trapezius
  const trap = (1 + mu * 0.4 + bd * 0.15) * mf(1, 0.7);
  for (const s of [1, -1]) {
    B.cone([s * 0.022, ty(1.452), 0.056], [s * (sx - 0.03), ty(1.476), 0.004], mf(0.0075, 0.0065), mf(0.009, 0.0075), 0.022);
    const n0 = [s * 0.03, ty(1.53), -0.035], a0 = [s * (sx - 0.03), ty(1.47), -0.018];
    const mid = add(lerp(n0, a0, 0.5), [0, -0.012, 0]);
    const ax = axesAlong(sub(a0, n0), [0, 1, 0]);
    const L = len(sub(a0, n0));
    B.ell(mid, ax, [L * 0.6, L * 0.6, 0.03 * trap, 0.04, 0.045, 0.045], 0.04);
  }

  // ---------------------------------------------------------------- neck & head
  const nr = mf(0.06, 0.045) * (1 + bd * 0.15 + mu * 0.1);
  B.cone([0, ty(1.43), -0.03], [0, ty(1.6), -0.008], nr, nr * 0.9, 0.05);
  for (const s of [1, -1]) {
    // sternocleidomastoid (subtle)
    B.cone([s * 0.05, ty(1.62), -0.012], [s * 0.014, ty(1.462), 0.05], mf(0.011, 0.0075), mf(0.011, 0.0075), mf(0.03, 0.034));
  }
  const hsz = mf(1, 0.955);
  // head origin: ear-canal level, centred over the neck
  const H0 = [0, ty(1.643), 0.004];
  const hp3 = (x, y, z) => [H0[0] + x * hsz, H0[1] + y * hsz, H0[2] + z * hsz];
  const hk = (k) => k * hsz;
  const R6 = (x, y1, y2, z1, z2) => [x, x, y1, y2, z1, z2].map(hk);
  // cranium
  B.ell(hp3(0, 0.045, 0.0), I3, R6(0.076, 0.092, 0.084, 0.098, 0.094), hk(0.03));
  // face, lower face, chin, jaw
  B.ell(hp3(0, -0.02, 0.022), I3, R6(mf(0.058, 0.055), 0.06, 0.052, 0.077, 0.05), hk(0.035));
  B.ell(hp3(0, -0.062, 0.02), I3, R6(mf(0.048, 0.037), 0.04, mf(0.04, 0.037), 0.072, 0.045), hk(0.035));
  B.ell(hp3(0, mf(-0.094, -0.091), 0.077), I3, R6(mf(0.021, 0.016), 0.016, mf(0.016, 0.014), 0.018, 0.016), hk(0.02));
  B.ell(hp3(0, -0.083, 0.025), I3, R6(mf(0.04, 0.03), 0.02, 0.02, 0.04, 0.04), hk(0.035));
  for (const s of [1, -1]) {
    B.cone(hp3(s * mf(0.047, 0.039), -0.07, -0.004), hp3(s * 0.019, mf(-0.099, -0.095), 0.064), hk(mf(0.011, 0.008)), hk(mf(0.011, 0.009)), hk(0.03)); // jaw line
    B.ell(hp3(s * 0.046, -0.004, 0.05), I3, R6(0.016, 0.01, 0.012, 0.018, 0.025), hk(0.03));                          // cheekbone
  }
  B.ell(hp3(0, 0.026, 0.082), I3, R6(0.046, 0.012, 0.012, mf(0.016, 0.013), 0.016), hk(0.03));                          // brow
  for (const s of [1, -1]) {
    B.ell(hp3(s * 0.031, 0.006, 0.103), I3, R6(0.015, 0.012, 0.012, 0.014, 0.014), hk(0.016), { sub: true });            // eye socket
    B.ell(hp3(s * 0.032, 0.005, 0.074), I3, R6(0.0115, 0.0105, 0.0105, 0.0115, 0.0115), hk(0.005));                   // eyeball / lids
  }
  // nose
  const nz = mf(1, 0.85);
  B.cone(hp3(0, 0.012, 0.093), hp3(0, -0.026, 0.093 + 0.02 * nz), hk(0.006 * nz), hk(0.008 * nz), hk(0.01));
  B.ell(hp3(0, -0.029, 0.093 + 0.018 * nz), I3, R6(0.0092, 0.0085, 0.008, 0.009, 0.009).map((v) => v * nz), hk(0.006));
  for (const s of [1, -1]) B.ell(hp3(s * 0.011 * nz, -0.033, 0.1), I3, R6(0.007, 0.0055, 0.0055, 0.007, 0.007).map((v) => v * nz), hk(0.008));
  // lips
  B.ell(hp3(0, -0.055, 0.092), I3, R6(mf(0.019, 0.018), mf(0.0055, 0.0065), 0.005, 0.0065, mf(0.007, 0.008)), hk(0.01));
  B.ell(hp3(0, -0.067, 0.09), I3, R6(mf(0.016, 0.016), mf(0.005, 0.0062), mf(0.0055, 0.0065), 0.0065, mf(0.007, 0.0085)), hk(0.01));
  // ears
  for (const s of [1, -1]) {
    const ax = axesAlong([0, 1, -0.3], [s, 0, 0]);
    B.ell(hp3(s * 0.073, 0.004, -0.012), [ax[1], ax[0], ax[2]], [0.012, 0.006, 0.031, 0.026, 0.017, 0.015].map(hk), hk(0.006));
  }
  skel.head = { center: hp3(0, 0.02, 0.0), top: hp3(0, 0.135, 0), chin: hp3(0, -0.105, 0.08), scale: hsz };
  skel.neck = { base: [0, ty(1.43), -0.02], top: [0, ty(1.6), -0.01], r: nr };

  // ---------------------------------------------------------------- legs & feet
  skel.parts = { leg: {}, arm: {} };
  for (const s of [1, -1]) {
    const legStart = B.items.length;
    const Hj = [s * hx, hipY, 0.0];
    const K = [s * (hx + 0.004), ty(0.505), 0.008];
    const A = [s * (hx + 0.014), ANK, -0.012];
    const FT = frame(Hj, sub(K, Hj), [0, 0, 1], s), Lt = len(sub(K, Hj));
    const FS = frame(K, sub(A, K), [0, 0, 1], s), Ls = len(sub(A, K));
    const tf = mf(1, 1.07) * lg * (1 + hp * 0.08);
    const ramp = (k0, u0, u1) => ({ o: FT.p(u1), dir: mul(FT.d, -1), len: u1 - u0, k0 });
    const thighOpt = { ramp: ramp(0.012, 0.06, 0.22) };
    B.cone(FT.p(0.065, 0.012, -0.004), FT.p(Lt - 0.03), 0.08 * tf, 0.053 * lg, 0.05, thighOpt);
    B.ell(FT.p(0.145, 0.008, 0.0), FT.axes(), [0.25, 0.13, 0.08 * tf, 0.077 * tf, 0.075 * tf, 0.072 * tf], 0.045, thighOpt); // thigh mass
    const mq = ms * lg;
    B.ell(FT.p(0.19, 0.006, 0.026), FT.axes(), [0.2, 0.16, 0.062 * mq, 0.055 * mq, 0.06 * mq, 0.04], 0.03 * soft, thighOpt);   // quads
    B.ell(FT.p(0.2, 0.034, 0.0), FT.axes(), [0.17, 0.16, 0.04 * mq, 0.03, 0.045 * mq, 0.04], 0.03 * soft, thighOpt);          // vastus lateralis
    B.ell(FT.p(Lt - 0.105, -0.022, 0.018), FT.axes(), [0.06, 0.08, 0.025, 0.03 * mq, 0.03 * mq, 0.03], 0.035 * soft);         // vastus medialis
    B.ell(FT.p(0.19, 0.0, -0.028), FT.axes(), [0.2, 0.15, 0.05 * mq, 0.05 * mq, 0.03, 0.052 * mq], 0.035 * soft, thighOpt);    // hamstrings
    B.ell(FT.p(0.09, -0.032, -0.004), FT.axes(), [0.13, 0.08, 0.04, 0.048 * tf, 0.045, 0.045], 0.03 * soft, thighOpt);        // adductors
    if (F || hp > 0) {
      const w = F * 0.8 + Math.max(0, hp) * 0.6;
      B.ell(FT.p(0.06, 0.04, -0.012), FT.axes(), [0.1, 0.08, 0.035 + 0.025 * w, 0.03, 0.055, 0.06], 0.05, thighOpt);              // hip / outer thigh
    }
    // knee
    B.ell(K, FT.axes(), [0.05, 0.05, 0.042, 0.043, 0.04, 0.038].map((v) => v * lg), 0.035);
    B.ell(FT.p(Lt - 0.008, 0.0, 0.041), FT.axes(), [0.025, 0.025, 0.022, 0.022, 0.012, 0.012], 0.015);
    // shank
    const sg = lg * mf(1, 0.96);
    B.cone(FS.p(0.02), FS.p(Ls - 0.012), 0.045 * sg, 0.031 * (1 + bd * 0.1), 0.02);
    B.ell(FS.p(0.13, -0.016, -0.028), FS.axes(), [0.09, 0.07, 0.03, 0.034 * ms * sg, 0.03, 0.046 * ms * sg], 0.03 * soft);    // gastroc medial
    B.ell(FS.p(0.115, 0.015, -0.027), FS.axes(), [0.075, 0.065, 0.027 * ms * sg, 0.026, 0.03, 0.04 * ms * sg], 0.03 * soft);  // gastroc lateral
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
    B.ell(fp(-0.022, 0, 0.032), fax, [0.04, 0.034, 0.028, 0.028, 0.03, 0.037].map(fk), fk(0.024));                      // heel
    B.ell(fp(0.05, 0.004, 0.029), fax, [0.09, 0.075, 0.041, 0.035, 0.035, 0.034].map(fk), fk(0.016));                    // midfoot
    B.cone(A, fp(0.07, -0.004, 0.034), 0.034, fk(0.022), 0.02);                                                          // instep
    B.ell(fp(0.132, -0.002, 0.019), fax, [0.03, 0.04, 0.047, 0.044, 0.02, 0.022].map(fk), fk(0.012));                   // ball
    B.cone(fp(0.148, -0.026, 0.017), fp(0.198, -0.03, 0.012), fk(0.0125), fk(0.0115), fk(0.007));                         // big toe
    const tb = [-0.005, 0.011, 0.025, 0.037], ta = [0.19, 0.183, 0.173, 0.161], tr = [0.0085, 0.008, 0.0076, 0.0072];
    for (let i = 0; i < 4; i++) B.cone(fp(0.145, tb[i] * 0.85, 0.015), fp(ta[i], tb[i] * 1.12, 0.01), fk(tr[i]), fk(tr[i] * 0.95), fk(0.004));

    skel.sides[s] = Object.assign(skel.sides[s] || {}, { hip: Hj, knee: K, ankle: A, FT, FS, FO, Lt, Ls, footScale: fs });
    skel.parts.leg[s] = [legStart, B.items.length];
  }

  // ---------------------------------------------------------------- arms & hands
  const th = rad(P.armPose);
  for (const s of [1, -1]) {
    const armStart = B.items.length;
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
    const dm = ms * (1 + bd * 0.1) * mf(1, 0.88);
    B.ell(FU.p(0.03, 0.006, 0.0), FU.axes(), [0.11, mf(0.06, 0.05), mf(0.055, 0.05) * dm, 0.035, 0.053 * dm, 0.055 * dm], 0.035 * soft, { ramp: { ...armRamp, k0: 0.02 } }); // deltoid
    B.cone(FU.p(0.0), FU.p(Lu), 0.049 * ag, 0.039 * ag, 0.03, { ramp: armRamp });                                     // humerus
    B.ell(FU.p(0.165, -0.003, 0.02), FU.axes(), [0.09, 0.08, 0.036 * ag, 0.033 * ag, 0.037 * ms * ag, 0.02], 0.018 * soft);   // biceps
    B.ell(FU.p(0.13, 0.0, -0.018), FU.axes(), [0.11, 0.09, 0.037 * ag, 0.033 * ag, 0.02, 0.04 * ms * ag], 0.02 * soft);      // triceps
    B.ell(FU.p(Lu - 0.004, 0, -0.022), I3, [0.016, 0.016, 0.016, 0.016, 0.016, 0.016], 0.012);                        // olecranon
        // forearm
    B.cone(FF.p(0.0), FF.p(Lf - 0.01), 0.036 * ag, 0.023 * ag, 0.016);
    B.ell(FF.p(0.075, 0.0, 0.0), FF.axes(), [0.12, 0.06, 0.047 * ag * ms ** 0.5, 0.046 * ag * ms ** 0.5, 0.037 * ag, 0.035 * ag], 0.018 * soft);
    B.ell(FF.p(0.055, 0.024, 0.006), FF.axes(), [0.09, 0.05, 0.025 * ag, 0.02, 0.022 * ag, 0.02], 0.016 * soft);          // brachioradialis
    B.ell(FF.p(Lf - 0.01), FF.axes(), [0.03, 0.03, 0.031, 0.031, 0.0195, 0.02].map((v) => v * ag), 0.014);           // wrist

    // hand (u along fingers, v toward thumb, w toward palm)
    const hs = mf(1, 0.9) * (1 + bd * 0.04);
    const hpnt = (u, v, w) => FH.p(u * hs, v * hs, w * hs);
    const hk2 = (k) => k * hs;
    const pushHand = (i) => handPrims[s].push(i);
    pushHand(B.cone(W, hpnt(0.03, 0, 0), 0.023 * ag, hk2(0.021), 0.01));
    pushHand(B.box(hpnt(0.057, -0.002, 0.0), FH.axes(), [0.024, 0.028, 0.003].map(hk2), hk2(0.0115), hk2(0.012)));      // palm
    pushHand(B.ell(hpnt(0.056, -0.002, -0.003), FH.axes(), [0.04, 0.04, 0.036, 0.036, 0.008, 0.0125].map(hk2), hk2(0.012))); // back of hand
    pushHand(B.ell(hpnt(0.026, -0.003, 0.0), FH.axes(), [0.022, 0.022, 0.034, 0.036, 0.016, 0.016].map(hk2), hk2(0.014)));   // heel of hand
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
      pushHand(B.ell(hpnt(mcpU[f] - 0.002, mcpV[f], -0.006), FH.axes(), [0.009, 0.009, 0.0085, 0.0085, 0.006, 0.0085].map((v) => v * hs * fg), hk2(0.008))); // knuckle
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
      if (f > 0) {
        // webbing between this finger and the previous one
        const a = fingers[f - 1].joints[0], b = joints[0];
        const m = add(lerp(a, b, 0.5), add(mul(FH.d, 0.004 * hs), mul(FH.f, 0.001)));
        pushHand(B.ell(m, FH.axes(), [0.009, 0.006, 0.011, 0.011, 0.0055, 0.0055].map((v) => v * hs), hk2(0.006)));
      }
    }
    // thumb
    const t1 = tilt(FH.d, FH.l, rad(27));
    const tdir = tilt(t1, FH.f, rad(28));
    const cmc = hpnt(0.026, 0.02, 0.008);
    const tl = [0.044, 0.031, 0.026], tr = [0.0115, 0.0099, 0.0089, 0.0074];
    let tp = cmc, td = tdir;
    const tj = [tp];
    for (let j = 0; j < 3; j++) {
      if (j > 0) td = norm(add(td, add(mul(FH.f, 0.12), mul(FH.l, -0.1))));
      const q = add(tp, mul(td, tl[j] * hs));
      pushHand(B.cone(tp, j === 2 ? add(q, mul(td, -0.004 * hs)) : q, tr[j] * hs * fg, tr[j + 1] * hs * fg, hk2(j === 0 ? 0.01 : 0.004)));
      tp = q; tj.push(q);
    }
    Object.assign(skel.sides[s], { shoulder: S, elbow: E, wrist: W, FU, FF, FH, Lu, Lf, handScale: hs, fingers, thumb: { joints: tj, dir: td } });
    skel.parts.arm[s] = [armStart, B.items.length];
  }

  // ---------------------------------------------------------------- surface grooves
  // placed relative to the actual surface of a snapshot of the field
  const snap = B.build();
  const groove = (pts, r, depths, k) => {
    // pts: interior points + outward dirs; chain of subtractive capsules
    const sp = pts.map(([o, d], i) => {
      const p = projectToSurface(snap, o, d);
      const n = surfaceNormal(snap, p);
      return add(p, mul(n, r - depths[i]));
    });
    B.chain(sp, r, k, { sub: true });
  };
  {
    const back = [0, 0, -1], front = [0, 0, 1];
    const ys = [1.0, 1.08, 1.16, 1.24, 1.32, 1.4, 1.46];
    const dsp = ys.map((y) => (0.0024 + Math.max(0, mu) * 0.003) * (y < 1.2 ? 1.5 : 1) * (y > 1.43 ? 0.3 : 1));
    groove(ys.map((y) => [[0, ty(y), 0], back]), 0.03, dsp, 0.028);
    // gluteal cleft
    groove([0.835, 0.865, 0.9, 0.94].map((y) => [[0, ty(y), -0.02], back]), 0.02, [0.004, 0.0035, 0.002, 0.0003], 0.02);
    if (!F) groove([1.24, 1.3, 1.37, 1.41].map((y) => [[0, ty(y), 0], front]), 0.03, [0.0006, 0.0018 + Math.max(0, mu) * 0.002, 0.0016, 0.0004], 0.028);
    // navel
    const nv = projectToSurface(snap, [0, ty(1.055), 0], front);
    B.ell(add(nv, [0, 0, 0.005]), I3, [0.009, 0.009, 0.011, 0.009, 0.009, 0.009], 0.009, { sub: true });
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
    const RF = opts.handFactor ?? 0.5, RZ = opts.handFactorZ ?? 1;
    const fx = 1 - (1 - RF) * Math.min(1, Math.abs(l[0]) * 1.3), fy = 1 - (1 - RF) * Math.min(1, Math.abs(l[1]) * 1.3);
    refine.push({ min: [b[0] - 0.004, b[1] - 0.004, b[2] - 0.004], max: [b[3] + 0.004, b[4] + 0.004, b[5] + 0.004], factor: [fx, fy, RZ] });
  }
  skel.ty = ty;
  skel.loftAt = loftAt;
  skel.sx = sx; skel.hx = hx;
  return { sdf, skel, refine, params: P };
}
