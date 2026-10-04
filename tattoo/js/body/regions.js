// Named tattoo placement regions: static metadata + per-build surface anchors.
// Worker-safe (no three.js).
import { add, sub, mul, norm, dot, cross } from "./vec.js";

// ---------------------------------------------------------------- metadata
// base: id without side prefix; sided: true → left_/right_ variants.
// aliases are side-less phrases; sided variants get "left …"/"right …" forms too.
const DEFS = [
  // head & neck
  { base: "neck_front", label: "Front of neck", group: "head-neck", size: 6, aliases: ["neck", "front of neck", "throat", "front neck", "neck front", "under chin"] },
  { base: "neck_back", label: "Back of neck", group: "head-neck", size: 6, aliases: ["back of the neck", "back of neck", "nape", "nape of neck", "neck back", "back neck", "rear neck"] },
  { base: "neck_side", sided: true, label: "Side of neck", group: "head-neck", size: 6, aliases: ["side of neck", "neck side", "side neck"] },
  { base: "behind_ear", sided: true, label: "Behind the ear", group: "head-neck", size: 3.5, aliases: ["behind ear", "behind the ear", "back of ear", "ear"] },
  // torso front
  { base: "collarbone", sided: true, label: "Collarbone", group: "torso-front", size: 10, aliases: ["collarbone", "collar bone", "clavicle", "collar"] },
  { base: "chest", sided: true, label: "Chest", group: "torso-front", size: 12, aliases: ["chest", "pec", "pecs", "pectoral", "breast", "chest piece", "upper chest", "heart"] },
  { base: "sternum", label: "Sternum", group: "torso-front", size: 10, aliases: ["sternum", "center chest", "middle of chest", "breastbone", "breast bone", "between the breasts", "underboob", "chest center", "mid chest"] },
  { base: "under_bust", label: "Under bust / lower chest", group: "torso-front", size: 14, aliases: ["under bust", "underbust", "under boob", "below chest", "lower chest", "under the chest", "under breast", "under breasts", "solar plexus"] },
  { base: "ribs", sided: true, label: "Ribs (side)", group: "torso-front", size: 13, aliases: ["ribs", "rib", "ribcage", "rib cage", "side", "side of torso", "flank", "side ribs", "rib side"] },
  { base: "stomach", label: "Stomach", group: "torso-front", size: 14, aliases: ["stomach", "belly", "abdomen", "abs", "tummy", "upper stomach", "navel", "belly button", "midriff"] },
  { base: "lower_abdomen", label: "Lower abdomen", group: "torso-front", size: 14, aliases: ["lower abdomen", "lower stomach", "lower belly", "below navel", "pelvis", "pelvic", "bikini line", "low abdomen"] },
  { base: "hip", sided: true, label: "Hip", group: "torso-front", size: 11, aliases: ["hip", "hips", "side of hip", "hip bone", "hipbone", "upper hip"] },
  // torso back
  { base: "upper_back", label: "Upper back", group: "torso-back", size: 22, aliases: ["upper back", "back", "back piece", "top of back", "shoulders back", "across the shoulders", "full back"] },
  { base: "between_shoulder_blades", label: "Between shoulder blades", group: "torso-back", size: 12, aliases: ["between shoulder blades", "between the shoulder blades", "between shoulders", "upper spine", "middle upper back"] },
  { base: "shoulder_blade", sided: true, label: "Shoulder blade", group: "torso-back", size: 14, aliases: ["shoulder blade", "scapula", "back shoulder", "shoulderblade"] },
  { base: "spine", label: "Spine", group: "torso-back", size: 6, aliases: ["spine", "along the spine", "down the spine", "spine tattoo", "backbone", "vertebrae"] },
  { base: "mid_back", label: "Mid back", group: "torso-back", size: 16, aliases: ["mid back", "middle back", "middle of back", "center back", "centre back"] },
  { base: "lower_back", label: "Lower back", group: "torso-back", size: 18, aliases: ["lower back", "low back", "small of back", "small of the back", "tramp stamp", "lumbar", "back of waist"] },
  { base: "buttock", sided: true, label: "Buttock", group: "torso-back", size: 12, aliases: ["buttock", "butt", "glute", "bum", "booty", "bottom", "cheek", "rear"] },
  // arms
  { base: "shoulder", sided: true, label: "Shoulder (deltoid)", group: "arms", size: 11, aliases: ["shoulder", "deltoid", "delt", "shoulder cap", "top of shoulder", "outer shoulder", "shoulder cap tattoo"] },
  { base: "upper_arm_outer", sided: true, label: "Upper arm (outer)", group: "arms", size: 10, aliases: ["upper arm", "outer upper arm", "outer arm", "upper arm outer", "arm", "sleeve", "half sleeve", "side of arm"] },
  { base: "upper_arm_inner", sided: true, label: "Upper arm (inner)", group: "arms", size: 9, aliases: ["inner upper arm", "inner arm", "inside of arm", "inside upper arm", "upper arm inner", "inner bicep"] },
  { base: "bicep", sided: true, label: "Bicep", group: "arms", size: 9, aliases: ["bicep", "biceps", "front of upper arm", "front upper arm", "guns"] },
  { base: "tricep", sided: true, label: "Tricep (back of arm)", group: "arms", size: 9, aliases: ["tricep", "triceps", "back of arm", "back of upper arm", "back upper arm", "rear arm"] },
  { base: "elbow", sided: true, label: "Elbow", group: "arms", size: 7, aliases: ["elbow", "point of elbow", "elbow point", "back of elbow"] },
  { base: "elbow_ditch", sided: true, label: "Inner elbow (ditch)", group: "arms", size: 6, aliases: ["inner elbow", "elbow ditch", "ditch", "elbow crease", "elbow pit", "inside of elbow", "crook of arm"] },
  { base: "forearm_outer", sided: true, label: "Forearm (outer)", group: "arms", size: 10, aliases: ["forearm", "outer forearm", "top of forearm", "back of forearm", "forearm outer", "lower arm", "sleeve"] },
  { base: "forearm_inner", sided: true, label: "Forearm (inner)", group: "arms", size: 10, aliases: ["inner forearm", "inside forearm", "inside of forearm", "forearm inner", "inner arm", "underside of forearm", "inner lower arm", "forearm"] },
  { base: "wrist_inner", sided: true, label: "Wrist (inner)", group: "arms", size: 4.5, aliases: ["wrist", "inner wrist", "inside of wrist", "wrist inner", "inside wrist"] },
  { base: "wrist_outer", sided: true, label: "Wrist (outer)", group: "arms", size: 4.5, aliases: ["outer wrist", "top of wrist", "back of wrist", "wrist outer", "wrist"] },
  // hands
  { base: "hand_back", sided: true, label: "Back of hand", group: "hands", size: 7, aliases: ["hand", "back of hand", "back of the hand", "top of hand", "hand back", "knuckles"] },
  { base: "palm", sided: true, label: "Palm", group: "hands", size: 6, aliases: ["palm", "palm of hand", "inside of hand", "hand palm"] },
  { base: "finger", sided: true, label: "Index finger", group: "hands", size: 1.6, aliases: ["finger", "fingers", "index finger", "pointer finger", "top of finger", "finger tattoo", "knuckle"] },
  { base: "thumb", sided: true, label: "Thumb", group: "hands", size: 2, aliases: ["thumb", "top of thumb", "thumb tattoo"] },
  // legs
  { base: "thigh_front", sided: true, label: "Thigh (front)", group: "legs", size: 14, aliases: ["thigh", "front of thigh", "front thigh", "thigh front", "upper leg", "quad", "quads", "leg"] },
  { base: "thigh_outer", sided: true, label: "Thigh (outer)", group: "legs", size: 14, aliases: ["outer thigh", "side of thigh", "side thigh", "thigh outer", "hip thigh", "thigh"] },
  { base: "thigh_inner", sided: true, label: "Thigh (inner)", group: "legs", size: 11, aliases: ["inner thigh", "inside of thigh", "inside thigh", "thigh inner"] },
  { base: "thigh_back", sided: true, label: "Thigh (back)", group: "legs", size: 13, aliases: ["back of thigh", "back thigh", "hamstring", "hamstrings", "thigh back", "rear thigh"] },
  { base: "knee", sided: true, label: "Knee", group: "legs", size: 8, aliases: ["knee", "kneecap", "knee cap", "front of knee", "patella"] },
  { base: "calf", sided: true, label: "Calf", group: "legs", size: 11, aliases: ["calf", "calves", "back of leg", "back of lower leg", "lower leg back", "calf muscle", "leg"] },
  { base: "shin", sided: true, label: "Shin", group: "legs", size: 9, aliases: ["shin", "front of lower leg", "lower leg", "shin bone", "front of leg", "shins"] },
  // feet
  { base: "ankle", sided: true, label: "Ankle", group: "feet", size: 5, aliases: ["ankle", "outer ankle", "ankle bone", "side of ankle"] },
  { base: "foot_top", sided: true, label: "Top of foot", group: "feet", size: 7, aliases: ["foot", "top of foot", "top of the foot", "instep", "foot top", "feet"] },
];

const SIDES = [["left", 1], ["right", -1]];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function sidedAliases(base, sideName) {
  const out = [];
  const short = sideName === "left" ? "l" : "r";
  for (const a of base) {
    out.push(`${sideName} ${a}`);
    out.push(`${short} ${a}`);
    const words = a.split(" ");
    if (words.length > 1 && !/^(of|the)$/.test(words[1])) out.push(`${words[0]} ${sideName} ${words.slice(1).join(" ")}`);
    if (/ of /.test(a)) out.push(a.replace(/ of (the )?/, ` of ${sideName} `).replace(/ of (left|right) /, ` of the ${sideName} `));
  }
  for (const a of base) out.push(a);
  return [...new Set(out)];
}

export const REGION_LIST = [];
for (const d of DEFS) {
  if (d.sided) {
    for (const [sn] of SIDES) {
      REGION_LIST.push(Object.freeze({
        id: `${sn}_${d.base}`, label: `${cap(sn)} ${d.label.charAt(0).toLowerCase()}${d.label.slice(1)}`,
        group: d.group, side: sn, sizeCm: d.size, aliases: Object.freeze(sidedAliases(d.aliases, sn)),
      }));
    }
  } else {
    REGION_LIST.push(Object.freeze({ id: d.base, label: d.label, group: d.group, side: "center", sizeCm: d.size, aliases: Object.freeze([...d.aliases]) }));
  }
}
Object.freeze(REGION_LIST);

// ---------------------------------------------------------------- anchors
// Each returns { o: interior point, dir: outward search direction, up: up hint } in canonical coords.
function anchorFor(base, sd, skel) {
  const ty = skel.ty;
  const Y = [0, 1, 0];
  const side = sd ? skel.sides[sd] : null;
  const s = sd || 0;
  const F = skel.F;
  switch (base) {
    case "neck_front": return { o: [0, ty(1.505), -0.015], dir: [0, 0, 1], up: Y };
    case "neck_back": return { o: [0, ty(1.53), -0.015], dir: [0, 0.1, -1], up: Y };
    case "neck_side": return { o: [0, ty(1.53), -0.015], dir: [s, 0, 0], up: Y };
    case "behind_ear": return { o: [s * 0.03, ty(1.64), -0.02], dir: norm([s * 0.6, -0.1, -0.8]), up: Y };
    case "collarbone": return { o: [s * 0.085, ty(1.45), 0.0], dir: norm([0, 0.35, 1]), up: Y };
    case "chest": return { o: [s * 0.075, ty(F ? 1.335 : 1.315), 0], dir: [0, 0, 1], up: Y };
    case "sternum": return { o: [0, ty(F ? 1.28 : 1.29), 0], dir: [0, 0, 1], up: Y };
    case "under_bust": return { o: [0, ty(1.2), 0], dir: [0, 0, 1], up: Y };
    case "ribs": return { o: [s * 0.04, ty(1.2), -0.005], dir: norm([s, 0, 0.12]), up: Y };
    case "stomach": return { o: [0, ty(1.1), 0], dir: [0, 0, 1], up: Y };
    case "lower_abdomen": return { o: [0, ty(0.99), 0], dir: [0, 0, 1], up: Y };
    case "hip": return { o: [s * 0.06, ty(0.96), 0], dir: norm([s, 0, 0.2]), up: Y };
    case "upper_back": return { o: [0, ty(1.4), 0], dir: [0, 0, -1], up: Y };
    case "between_shoulder_blades": return { o: [0, ty(1.335), 0], dir: [0, 0, -1], up: Y };
    case "shoulder_blade": return { o: [s * 0.095, ty(1.34), 0], dir: [0, 0, -1], up: Y };
    case "spine": return { o: [0, ty(1.26), 0], dir: [0, 0, -1], up: Y };
    case "mid_back": return { o: [0, ty(1.19), 0], dir: [0, 0, -1], up: Y };
    case "lower_back": return { o: [0, ty(1.01), 0], dir: [0, 0, -1], up: Y };
    case "buttock": return { o: [s * 0.075, ty(0.885), 0], dir: [0, 0, -1], up: Y };
  }
  if (!side) return null;
  const { FU, FF, FH, FT, FS, FO, Lu, Lf, Lt, handScale: hs, footScale: fs } = side;
  const upU = mul(FU.d, -1), upF = mul(FF.d, -1), upH = mul(FH.d, -1), upT = mul(FT.d, -1), upS = mul(FS.d, -1);
  switch (base) {
    case "shoulder": return { o: FU.p(0.035), dir: norm(add(FU.l, mul(FU.d, -0.35))), up: upU };
    case "upper_arm_outer": return { o: FU.p(0.15), dir: FU.l, up: upU };
    case "upper_arm_inner": return { o: FU.p(0.15), dir: mul(FU.l, -1), up: upU };
    case "bicep": return { o: FU.p(0.165), dir: FU.f, up: upU };
    case "tricep": return { o: FU.p(0.15), dir: mul(FU.f, -1), up: upU };
    case "elbow": return { o: FU.p(Lu - 0.005), dir: mul(FU.f, -1), up: upU };
    case "elbow_ditch": return { o: FU.p(Lu - 0.005), dir: FU.f, up: upU };
    case "forearm_outer": return { o: FF.p(Lf * 0.42), dir: norm(add(mul(FF.f, -1), mul(FF.l, 0.35))), up: upF };
    case "forearm_inner": return { o: FF.p(Lf * 0.42), dir: FF.f, up: upF };
    case "wrist_inner": return { o: FF.p(Lf - 0.022), dir: FF.f, up: upF };
    case "wrist_outer": return { o: FF.p(Lf - 0.022), dir: mul(FF.f, -1), up: upF };
    case "hand_back": return { o: FH.p(0.052 * hs), dir: mul(FH.f, -1), up: upH };
    case "palm": return { o: FH.p(0.05 * hs, -0.004 * hs), dir: FH.f, up: upH };
    case "finger": {
      const j = side.fingers[0].joints;
      return { o: lerpP(j[0], j[1], 0.5), dir: mul(FH.f, -1), up: norm(sub(j[0], j[1])) };
    }
    case "thumb": {
      const j = side.thumb.joints;
      const ax = norm(sub(j[2], j[1]));
      let dir = sub(mul(FH.f, -1), mul(ax, dot(mul(FH.f, -1), ax)));
      dir = norm(add(norm(dir), mul(FH.l, 0.6)));
      return { o: lerpP(j[1], j[2], 0.5), dir, up: mul(ax, -1) };
    }
    case "thigh_front": return { o: FT.p(0.2), dir: FT.f, up: upT };
    case "thigh_outer": return { o: FT.p(0.17), dir: FT.l, up: upT };
    case "thigh_inner": return { o: FT.p(0.15), dir: mul(FT.l, -1), up: upT };
    case "thigh_back": return { o: FT.p(0.2), dir: mul(FT.f, -1), up: upT };
    case "knee": return { o: FT.p(Lt - 0.005), dir: FT.f, up: upT };
    case "calf": return { o: FS.p(0.125), dir: mul(FS.f, -1), up: upS };
    case "shin": return { o: FS.p(0.17), dir: FS.f, up: upS };
    case "ankle": return { o: FS.p(side.Ls - 0.005), dir: norm(add(FS.l, mul(FS.f, -0.15))), up: [0, 1, 0] };
    case "foot_top": return { o: FO.p(0.06 * fs, 0, 0.03 * fs), dir: norm(add([0, 1, 0], mul(FO.d, 0.45))), up: mul(FO.d, -1) };
  }
  return null;
}

function lerpP(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// march from an interior point along dir to the zero level set
export function projectToSurface(sdf, o, dir) {
  const f = (t) => sdf.evalAll(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
  let t = 0, d = f(0);
  let guard = 0;
  while (d > 0 && guard++ < 200) { t -= 0.002; d = f(t); } // start outside: back up
  let tIn = t;
  guard = 0;
  while (d <= 0 && guard++ < 2000) {
    tIn = t;
    t += Math.min(Math.max(-d * 0.8, 0.0008), 0.008);
    d = f(t);
  }
  let a = tIn, b = t;
  for (let i = 0; i < 30; i++) { const m = (a + b) * 0.5; if (f(m) <= 0) a = m; else b = m; }
  const tt = (a + b) * 0.5;
  return [o[0] + dir[0] * tt, o[1] + dir[1] * tt, o[2] + dir[2] * tt];
}

export function surfaceNormal(sdf, p) {
  const g = [0, 0, 0, 0];
  sdf.grad(sdf.all, sdf.n, p[0], p[1], p[2], 0.0008, g);
  return norm([g[0], g[1], g[2]]);
}

export function computeRegions(sdf, skel) {
  const out = [];
  for (const info of REGION_LIST) {
    const def = DEFS.find((d) => (d.sided ? info.id === `${info.side}_${d.base}` : info.id === d.base));
    const sd = info.side === "left" ? 1 : info.side === "right" ? -1 : 0;
    const a = anchorFor(def.base, sd, skel);
    if (!a) continue;
    const dir = norm(a.dir);
    const position = projectToSurface(sdf, a.o, dir);
    const normal = surfaceNormal(sdf, position);
    let up = sub(a.up, mul(normal, dot(a.up, normal)));
    if (Math.hypot(...up) < 1e-4) up = sub([0, 1, 0], mul(normal, normal[1]));
    up = norm(up);
    void cross;
    out.push({
      id: info.id, label: info.label, group: info.group, side: info.side,
      position, normal, up, sizeCm: info.sizeCm, aliases: info.aliases.slice(),
    });
  }
  return out;
}

// nearest anchor to a point (optionally preferring anchors whose normal agrees)
export function nearestRegion(regions, point, normal) {
  let best = null, bd = Infinity;
  const p = Array.isArray(point) ? point : [point.x, point.y, point.z];
  const n = normal ? (Array.isArray(normal) ? normal : [normal.x, normal.y, normal.z]) : null;
  for (const r of regions || []) {
    const q = r.position;
    let d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (n) {
      const c = n[0] * r.normal[0] + n[1] * r.normal[1] + n[2] * r.normal[2];
      d *= 1 + Math.max(0, 0.5 - c) * 1.5;
    }
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}
