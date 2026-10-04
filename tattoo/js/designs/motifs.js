// Motif library: hand-tuned vector motifs in a 200×200 design box.
// Each motif is drawn as layered regions so every style can restyle it
// (see render.js for the element types).

import {
  smooth, polyD, circleD, ellipseD, arcPts, mirrorPts, mirrorX, petalD, petalPts, taperD, taperSmoothD, taperPts,
  starPts, regularPoly, polar, transformD, M, TAU, DEG, makeRng, sampleSpline, rot, add, sub, mul, norm, perp, mix, lerp, f1,
} from "./core.js";

const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d, o = {}) => ({ t: "dark", d, ...o });
const shine = (d) => ({ t: "shine", d });
const shade = (d) => ({ t: "shade", d });
const mk = (els, box = [0, 0, 200, 200]) => ({ box, els });
const S = (pts) => smooth(pts, true);
const So = (pts) => smooth(pts, false);
const tf = (els, m) => els.map((e) => ({ ...e, d: transformD(e.d, m) }));
// a tapered highlight stroke
const streak = (pts, w = 3.5) => taperSmoothD(pts, (t) => w * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) + 0.2);

// --------------------------------------------------------------- building blocks (also used by styles)
export function leafEls(base, tip, w, { role = "leaf", curve = 0.06, veins = 4, at = 0.42 } = {}) {
  const els = [part(petalD(base, tip, w, { curve, at }), role)];
  const u = norm(sub(tip, base)), n = perp(u), L = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
  const midPts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; midPts.push(add(add(base, mul(u, L * t * 0.92)), mul(n, curve * Math.sin(t * Math.PI) * L))); }
  els.push(line(So(midPts), 0.6));
  for (let i = 1; i <= veins; i++) {
    const t = 0.15 + (i - 0.5) / veins * 0.7;
    const c = add(add(base, mul(u, L * t)), mul(n, curve * Math.sin(t * Math.PI) * L));
    const wt = w * 0.62 * Math.sin(Math.min(1, t / at) * Math.PI / 2) * (t > at ? Math.cos((t - at) / (1 - at) * Math.PI / 2) ** 0.6 : 1);
    for (const sg of [1, -1]) els.push(line(So([c, add(add(c, mul(u, L * 0.08)), mul(n, sg * wt * 0.6)), add(add(c, mul(u, L * 0.14)), mul(n, sg * wt))]), 0.45));
  }
  return els;
}

// Top-view spiral rose (golden-angle petals, outer → inner)
function roseEls(cx = 100, cy = 100, r = 1, { petals = 19, role = "main" } = {}) {
  const els = [];
  const R = 74 * r, GA = 2.39996;
  for (let k = 0; k < petals; k++) {
    const t = k / petals;                       // 0 outer → 1 inner
    const Rk = R * (1 - t * 0.8) ** 0.9;
    const a = k * GA - Math.PI / 2;
    const span = lerp(1.55, 2.5, t);
    const r0 = Rk * lerp(0.35, 0.2, t);
    const ctr = [cx + Math.cos(a) * R * 0.04 * t, cy + Math.sin(a) * R * 0.04 * t];
    const P = (rr, aa) => polar(ctr[0], ctr[1], rr, aa);
    const pts = [
      [...P(r0, a - span * 0.42), 1],
      P(Rk * 0.86, a - span * 0.5),
      P(Rk * 0.99, a - span * 0.3),
      P(Rk * 1.03, a - span * 0.05),
      [...P(Rk * 1.07, a + span * 0.08), 1],
      P(Rk * 0.98, a + span * 0.3),
      P(Rk * 0.84, a + span * 0.5),
      [...P(r0, a + span * 0.42), 1],
    ];
    els.push(part(S(pts), role));
    // rolled petal edge
    if (k < petals * 0.6) els.push(line(So([P(Rk * 0.82, a - span * 0.36), P(Rk * 0.93, a - span * 0.1), P(Rk * 0.94, a + span * 0.12), P(Rk * 0.82, a + span * 0.34)]), 0.4));
    if (k < petals * 0.5) els.push(shade(S([P(r0 * 1.1, a - span * 0.3), P(Rk * 0.55, a - span * 0.25), P(Rk * 0.6, a), P(Rk * 0.55, a + span * 0.25), P(r0 * 1.1, a + span * 0.3)])));
  }
  // center bud spiral
  const sp = [];
  for (let i = 0; i <= 20; i++) { const tt = i / 20, aa = tt * Math.PI * 2.4, rr = (1 - tt) * R * 0.12 + 1; sp.push(polar(cx, cy, rr, aa)); }
  els.push(line(So(sp.filter((_, i) => i % 2 === 0)), 0.6));
  els.push(shine(streak([polar(cx, cy, R * 0.78, -2.7), polar(cx, cy, R * 0.83, -2.4), polar(cx, cy, R * 0.8, -2.1)], 2.2 * r)));
  return els;
}

function leafPair(cx, cy, ang, size, role = "leaf") {
  const base = [cx, cy];
  const tip = polar(cx, cy, size, ang);
  return leafEls(base, tip, size * 0.3, { role, curve: 0.08 });
}

// --------------------------------------------------------------- motif definitions
const D = {};

D.heart = () => mk([
  part("M100 62C100 38 80 22 58 24C34 26 18 46 20 70C22 100 58 126 100 172C142 126 178 100 180 70C182 46 166 26 142 24C120 22 100 38 100 62Z", "main"),
  shade(S([[176, 76], [168, 100], [140, 128], [100, 172], [130, 126], [160, 94], [170, 64, 1]])),
  shine(streak([[40, 74], [40, 56], [52, 42], [66, 38]], 4)),
  shine(circleD(48, 86, 3.5)),
], [10, 14, 180, 168]);

D.star = () => {
  const c = [100, 106], tips = regularPoly(100, 106, 94, 5), inn = regularPoly(100, 106, 38, 5, -Math.PI / 2 + Math.PI / 5);
  const els = [];
  for (let i = 0; i < 5; i++) {
    const prev = inn[(i + 4) % 5], next = inn[i];
    els.push(part(polyD([c, prev, tips[i]]), "main"));
    els.push(dark(polyD([c, tips[i], next])));
  }
  return mk(els, [4, 10, 192, 180]);
};

D.anchor = () => {
  const els = [];
  els.push(part(circleD(100, 30, 16) + circleD(100, 30, 8), "metal", { rule: "evenodd" }));
  // arms: arc band
  const outer = arcPts(100, 104, 66, 12 * DEG, 168 * DEG, 40), inner = arcPts(100, 104, 54, 12 * DEG, 168 * DEG, 40).reverse();
  els.push(part(polyD([...outer, ...inner]), "metal"));
  // flukes
  const fl = (sg) => {
    const ex = 100 + sg * 61, ey = 104 + 61 * Math.sin(12 * DEG);
    return part(S([[ex + sg * 4, ey + 10], [ex + sg * 15, ey + 2], [ex + sg * 16, ey - 26, 1], [ex - sg * 3, ey - 6], [ex - sg * 12, ey + 6, 1], [ex - sg * 2, ey + 8]]), "metal");
  };
  els.push(fl(-1), fl(1));
  // shank
  els.push(part(S([[93, 44, 1], [107, 44, 1], [108, 150], [110, 168, 1], [100, 180, 1], [90, 168, 1], [92, 150]]), "metal"));
  // stock
  els.push(part(S([[58, 56, 1], [142, 56, 1], [142, 68, 1], [58, 68, 1]]), "brown"));
  els.push(part(circleD(54, 62, 8), "brown"), part(circleD(146, 62, 8), "brown"));
  els.push(line(So([[70, 56], [70, 68]]), 0.4), line(So([[130, 56], [130, 68]]), 0.4));
  els.push(shine(streak([[96, 76], [96, 120], [96, 150]], 2)));
  els.push(shade(S([[146, 108], [160, 118], [148, 148], [120, 168], [108, 170], [134, 150]])));
  // rope
  const rope = [[54, 70], [84, 86], [118, 78], [126, 100], [84, 112], [74, 136], [112, 130], [140, 146], [150, 170]];
  els.push(part(taperSmoothD(rope, (t) => 5), "accent"));
  const rp = sampleSpline(rope, false, 10);
  for (let i = 3; i < rp.length - 2; i += 4) { const a = rp[i], b = rp[i + 1], u = norm(sub(b, a)), n = perp(u); els.push(line(polyD([add(a, mul(n, 4.5)), add(add(a, mul(u, 3)), mul(n, -4.5))], false), 0.4)); }
  return mk(els, [36, 10, 128, 176]);
};

D.dagger = () => {
  const els = [];
  // blade
  els.push(part(S([[86, 82, 1], [114, 82, 1], [113, 140], [106, 172], [100, 196, 1], [94, 172], [87, 140]]), "metal"));
  els.push(line(So([[100, 84], [100, 186]]), 0.5));
  els.push(shade(S([[100, 84, 1], [113, 84, 1], [112, 140], [106, 170], [100, 192, 1]])));
  els.push(shine(streak([[93, 90], [93, 130], [96, 168]], 1.8)));
  // guard
  els.push(part(S([[62, 70, 1], [100, 66], [138, 70, 1], [150, 62], [158, 70], [150, 82], [138, 80, 1], [100, 84], [62, 80, 1], [50, 82], [42, 70], [50, 62]]), "gold"));
  els.push(part(circleD(100, 75, 6), "main"));
  // grip
  els.push(part(S([[90, 66, 1], [92, 30, 1], [108, 30, 1], [110, 66, 1]]), "brown"));
  for (let y = 36; y < 64; y += 6) els.push(line(polyD([[91, y], [109, y + 4]], false), 0.45));
  // pommel
  els.push(part(S([[100, 6], [112, 14], [112, 24], [100, 32], [88, 24], [88, 14]]), "gold"));
  els.push(shine(circleD(96, 15, 2.2)));
  return mk(els, [40, 4, 120, 194]);
};

D.skull = () => {
  const half = [[100, 18], [70, 22], [44, 38], [30, 64], [30, 92], [38, 114], [48, 124], [46, 140], [56, 150], [62, 152], [64, 168], [74, 180], [100, 186]];
  const els = [];
  els.push(part(S(mirrorPts(half)), "light"));
  // eye sockets
  const eye = [[52, 96], [60, 84], [76, 82], [88, 90], [90, 104], [82, 116], [66, 118], [54, 110]];
  els.push(dark(S(eye)), dark(S(mirrorX(eye))));
  // nose
  els.push(dark(S([[100, 118], [108, 134], [104, 142], [100, 138], [96, 142], [92, 134]])));
  // teeth
  els.push(part(S([[66, 150, 1], [134, 150, 1], [134, 168, 1], [66, 168, 1]]), "light"));
  for (let x = 74; x < 134; x += 8.5) els.push(line(polyD([[x, 150], [x, 168]], false), 0.5));
  els.push(line(So([[66, 159], [100, 160], [134, 159]]), 0.55));
  // cheek & temple lines
  els.push(line(So([[46, 124], [56, 128], [66, 140]]), 0.5), line(So(mirrorX([[46, 124], [56, 128], [66, 140]])), 0.5));
  els.push(line(So([[38, 70], [46, 64], [50, 74]]), 0.45), line(So(mirrorX([[38, 70], [46, 64], [50, 74]])), 0.45));
  els.push(line(So([[100, 20], [96, 34], [102, 44], [98, 56]]), 0.4));
  els.push(shade(S([[30, 92], [36, 110], [48, 124], [42, 104], [40, 80]])), shade(S(mirrorX([[30, 92], [36, 110], [48, 124], [42, 104], [40, 80]]))));
  els.push(shine(streak([[56, 40], [72, 30], [90, 28]], 3)));
  return mk(els, [24, 14, 152, 176]);
};

D.rose = () => mk([
  ...leafEls([70, 140], [14, 178], 17, { curve: -0.08 }),
  ...leafEls([132, 142], [190, 168], 17, { curve: 0.08 }),
  ...leafEls([100, 150], [104, 196], 12, { curve: 0.05, veins: 3 }),
  ...roseEls(100, 92, 1),
], [8, 12, 184, 186]);

D.peony = (rng = makeRng(3)) => {
  const els = [];
  const cx = 100, cy = 104;
  const layer = (n, r0, r1, rot0, role, wide) => {
    for (let i = 0; i < n; i++) {
      const a = rot0 + i * TAU / n;
      const pts = [];
      const span = TAU / n * wide;
      const steps = 9;
      pts.push([...polar(cx, cy, r0, a - span * 0.35), 0]);
      for (let k = 0; k <= steps; k++) {
        const aa = a - span / 2 + span * k / steps;
        const rr = r1 * (0.92 + 0.08 * Math.cos((k / steps - 0.5) * Math.PI)) - (k % 2 ? 4 : 0) * (r1 / 80);
        pts.push(polar(cx, cy, rr, aa));
      }
      pts.push([...polar(cx, cy, r0, a + span * 0.35), 0]);
      els.push(part(S(pts), role));
      els.push(line(So([polar(cx, cy, r0 + 4, a), polar(cx, cy, r0 + (r1 - r0) * 0.55, a + 0.03)]), 0.4));
    }
  };
  layer(7, 30, 92, -Math.PI / 2, "pink", 1.25);
  layer(6, 20, 70, -Math.PI / 2 + 0.4, "pink", 1.3);
  layer(5, 10, 48, -Math.PI / 2 + 0.1, "pink", 1.35);
  // center ruffles
  els.push(part(circleD(cx, cy, 20), "pink"));
  els.push(line(So([[86, 100], [92, 92], [102, 90], [110, 96], [108, 106], [98, 108], [94, 102]]), 0.6));
  els.push(shade(circleD(cx, cy, 9)));
  return mk(els, [6, 10, 188, 188]);
};

D.lotus = () => {
  const els = [];
  const back = (sg) => part(S([[100, 150, 1], [100 + sg * 40, 120], [100 + sg * 82, 96], [100 + sg * 94, 92, 1], [100 + sg * 86, 120], [100 + sg * 56, 148]]), "pink");
  els.push(back(-1), back(1));
  const side = (sg) => part(S([[100, 152, 1], [100 + sg * 50, 126], [100 + sg * 70, 84], [100 + sg * 74, 60, 1], [100 + sg * 48, 82], [100 + sg * 20, 118]]), "pink");
  els.push(side(-1), side(1));
  const inner = (sg) => part(S([[100, 152, 1], [100 + sg * 34, 120], [100 + sg * 42, 70], [100 + sg * 36, 40, 1], [100 + sg * 16, 70], [100 + sg * 6, 120]]), "pink");
  els.push(inner(-1), inner(1));
  els.push(part(S([[100, 154, 1], [118, 120], [120, 72], [100, 24, 1], [80, 72], [82, 120]]), "pink"));
  els.push(line(So([[100, 148], [100, 50]]), 0.45));
  for (const sg of [-1, 1]) {
    els.push(line(So([[100 + sg * 8, 146], [100 + sg * 22, 110], [100 + sg * 30, 72]]), 0.4));
    els.push(line(So([[100 + sg * 22, 144], [100 + sg * 46, 118], [100 + sg * 62, 84]]), 0.4));
  }
  // water lines / base
  els.push(part(S([[40, 156], [100, 148], [160, 156], [150, 168], [100, 164], [50, 168]]), "leaf"));
  els.push(line(So([[30, 180], [60, 176], [90, 180]]), 0.6), line(So([[110, 182], [140, 178], [170, 182]]), 0.6));
  els.push(shine(streak([[92, 120], [90, 90], [94, 60]], 2.2)));
  return mk(els, [4, 20, 192, 166]);
};

D.sunflower = () => {
  const els = [];
  for (const [n, r1, off, role] of [[16, 92, 0, "gold"], [16, 78, Math.PI / 16, "accent"]]) {
    for (let i = 0; i < n; i++) {
      const a = off + i * TAU / n;
      els.push(part(petalD(polar(100, 100, 30, a), polar(100, 100, r1, a), 12, { at: 0.5 }), role));
      els.push(line(So([polar(100, 100, 40, a), polar(100, 100, r1 - 14, a)]), 0.35));
    }
  }
  els.push(part(circleD(100, 100, 36), "brown"));
  const seeds = [];
  for (let i = 0; i < 90; i++) { const r = 3.2 * Math.sqrt(i), a = i * 2.39996; if (r < 32) seeds.push(polar(100, 100, r, a)); }
  els.push(dark(seeds.map((p) => circleD(p[0], p[1], 1.6)).join("")));
  return mk(els, [6, 6, 188, 188]);
};

D.leaf = () => mk([...leafEls([60, 180], [150, 20], 40, { curve: 0.08, veins: 6 }), line(So([[60, 180], [50, 196]]), 0.9)], [20, 10, 160, 190]);

D.vine = () => {
  const els = [];
  const stem = [[20, 170], [60, 150], [90, 110], [110, 80], [150, 56], [184, 40]];
  els.push(part(taperSmoothD(stem, (t) => 4 * (1 - t) + 1.2), "leaf"));
  const sp = sampleSpline(stem, false, 12);
  for (let i = 6, k = 0; i < sp.length - 4; i += 8, k++) {
    const p = sp[i], q = sp[i + 1], u = norm(sub(q, p)), sg = k % 2 ? 1 : -1;
    const dir = norm(add(u, mul(perp(u), sg * 1.3)));
    els.push(...leafEls(p, add(p, mul(dir, 34 - k * 1.2)), 10, { curve: sg * 0.08, veins: 2 }));
  }
  // tendrils
  els.push(line(So([[100, 96], [110, 100], [116, 112], [108, 120], [102, 112], [108, 108]]), 0.5));
  els.push(line(So([[44, 158], [40, 172], [50, 180], [56, 172], [50, 168]]), 0.5));
  return mk(els, [10, 20, 182, 170]);
};

D.tree = (rng = makeRng(7)) => {
  const els = [];
  const segs = [], tips = [];
  const grow = (p, ang, L, w, depth) => {
    const end = polar(p[0], p[1], L, ang);
    const mid = add(mix(p, end, 0.5), mul(perp(norm(sub(end, p))), (rng() - 0.5) * L * 0.3));
    segs.push({ pts: [p, mid, end], w0: w, w1: w * 0.66 });
    if (depth <= 0) { tips.push(end); return; }
    const n = 2;
    for (let i = 0; i < n; i++) grow(end, ang + (i ? 1 : -1) * (0.42 + rng() * 0.25) + (rng() - 0.5) * 0.2, L * (0.72 + rng() * 0.1), w * 0.66, depth - 1);
  };
  grow([100, 120], -Math.PI / 2, 34, 9, 4);
  const root = (p, ang, L, w, depth) => {
    const end = polar(p[0], p[1], L, ang);
    segs.push({ pts: [p, add(mix(p, end, 0.5), mul(perp(norm(sub(end, p))), (rng() - 0.5) * L * 0.3)), end], w0: w, w1: w * 0.62 });
    if (depth <= 0) return;
    for (let i = 0; i < 2; i++) root(end, ang + (i ? 1 : -1) * (0.35 + rng() * 0.25), L * 0.7, w * 0.62, depth - 1);
  };
  root([100, 150], Math.PI / 2 + 0.75, 24, 6, 2);
  root([100, 150], Math.PI / 2 - 0.75, 24, 6, 2);
  // canopy blobs behind
  for (const t of tips) els.push(part(circleD(t[0], t[1], 11 + rng() * 5), "leaf", { noStroke: false }));
  els.push(part(taperSmoothD([[100, 156], [99, 138], [100, 120]], (t) => 9 - t * 3, { step: 4 }), "brown"));
  for (const b of segs) els.push(part(taperSmoothD(b.pts, (t) => lerp(b.w0, b.w1, t) / 2 + 0.5, { capEnd: true, step: 4 }), "brown"));
  els.push(line(So([[100, 160], [100, 128]]), 0.4));
  return mk(els, [0, 0, 200, 200]);
};

D.mountain = () => mk([
  part(S([[20, 160, 1], [74, 70, 1], [92, 96], [112, 60, 1], [150, 120], [160, 106, 1], [190, 160, 1]]), "blue"),
  part(S([[40, 160, 1], [112, 60, 1], [176, 160, 1]]), "metal"),
  part(S([[94, 88, 1], [112, 60, 1], [128, 86, 1], [120, 82], [114, 92, 1], [106, 84], [100, 92, 1]]), "white"),
  shade(S([[112, 60, 1], [176, 160, 1], [130, 160, 1], [124, 120], [116, 96]])),
  line(So([[112, 62], [110, 90], [100, 118], [96, 150]]), 0.45),
  line(So([[10, 172], [190, 172]]), 0.9),
  part(circleD(156, 44, 14), "accent"),
], [8, 24, 186, 152]);

D.wave = () => {
  const els = [];
  els.push(part(S([[10, 176, 1], [20, 140], [44, 102], [80, 66], [120, 46], [158, 50], [182, 70], [178, 92], [160, 96], [146, 84], [130, 84], [126, 102], [140, 120], [162, 124], [180, 140], [190, 176, 1]]), "water"));
  // foam claws along the crest
  const claws = [[158, 52], [176, 66], [182, 84], [168, 96], [150, 88]];
  els.push(part(S([[118, 50], [142, 44], [164, 50], [182, 68], [186, 88], [172, 98], [174, 86], [164, 92], [166, 80], [154, 86], [154, 74], [144, 78], [140, 66], [130, 70], [128, 58]]), "white"));
  els.push(part(S([[132, 84], [126, 102], [140, 120], [162, 124], [150, 112], [144, 98]]), "white"));
  for (let i = 0; i < 4; i++) els.push(line(So([[28 + i * 12, 170], [36 + i * 14, 130 - i * 6], [64 + i * 16, 96 - i * 8], [100 + i * 8, 76 - i * 6]]), 0.45));
  els.push(line(So([[100, 160], [120, 140], [146, 136], [170, 150]]), 0.4));
  els.push(part(circleD(66, 46, 14), "main"));
  return mk(els, [6, 28, 188, 152]);
};

export function crescentPts(c1, r1, c2, r2, n = 40) {
  const d = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d];
  const P = [c1[0] + a * u[0], c1[1] + a * u[1]];
  const I1 = [P[0] - h * u[1], P[1] + h * u[0]], I2 = [P[0] + h * u[1], P[1] - h * u[0]];
  const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const dirAway = Math.atan2(-u[1], -u[0]);
  // outer arc on circle 1 from I1 to I2 passing through dirAway
  let a1 = ang(c1, I1), a2 = ang(c1, I2);
  const norm2 = (x) => ((x % TAU) + TAU) % TAU;
  const span = norm2(a2 - a1), passes = norm2(dirAway - a1) < span;
  const outer = arcPts(c1[0], c1[1], r1, a1, passes ? a1 + span : a1 - (TAU - span), n);
  // inner arc on circle 2 from I2 back to I1 passing through direction towards c1
  let b1 = ang(c2, I2), b2 = ang(c2, I1);
  const span2 = norm2(b2 - b1), toward = Math.atan2(-u[1], -u[0]), passes2 = norm2(toward - b1) < span2;
  const inner = arcPts(c2[0], c2[1], r2, b1, passes2 ? b1 + span2 : b1 - (TAU - span2), n);
  return [[...outer[0], 1], ...outer.slice(1, -1), [...outer[outer.length - 1], 1], ...inner.slice(1, -1)];
}

D.moon = () => {
  const els = [part(polyD(crescentPts([96, 100], 80, [138, 84], 70, 48)), "gold")];
  els.push(shade(polyD(crescentPts([96, 100], 78, [112, 94], 74, 30))));
  els.push(shine(streak([[40, 80], [34, 100], [38, 124]], 3)));
  for (const [x, y, r] of [[150, 112, 12], [168, 154, 7], [128, 150, 5]]) els.push(part(polyD(starPts(x, y, r, r * 0.34, 4)), "gold"));
  return mk(els, [12, 18, 172, 164]);
};

D.sun = () => {
  const els = [];
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16 - Math.PI / 2, long = i % 2 === 0;
    const r1 = long ? 96 : 76;
    els.push(part(S([[...polar(100, 100, 46, a - 0.16), 1], polar(100, 100, (46 + r1) / 2, a - 0.07 + (long ? 0.05 : 0)), [...polar(100, 100, r1, a + (long ? 0.06 : 0)), 1], polar(100, 100, (46 + r1) / 2, a + 0.1), [...polar(100, 100, 46, a + 0.16), 1]]), long ? "fire" : "gold"));
  }
  els.push(part(circleD(100, 100, 50), "gold"));
  els.push(line(So(arcPts(100, 100, 40, 0.3, 1.4, 10)), 0.4));
  els.push(shine(streak([[68, 90], [72, 74], [84, 64]], 3)));
  return mk(els, [2, 2, 196, 196]);
};

D.eye = () => {
  const els = [];
  els.push(part(polyD([[100, 14], [188, 168], [12, 168]]) + polyD([[100, 36], [30, 158], [170, 158]]).replace(/^M/, "M"), "gold", { rule: "evenodd" }));
  els.push(part(S([[52, 116, 1], [76, 96], [100, 90], [124, 96], [148, 116, 1], [124, 134], [100, 140], [76, 134]]), "white"));
  els.push(part(circleD(100, 115, 20), "blue"));
  els.push(dark(circleD(100, 115, 9)));
  els.push(shine(circleD(94, 109, 3.5)));
  els.push(line(So([[58, 108], [80, 86], [100, 82], [120, 86], [142, 108]]), 0.6));
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.28;
    if (i === 5) continue;
    els.push(line(polyD([polar(100, 116, 100 + (Math.abs(i - 5) < 2 ? 4 : 0), a), polar(100, 116, i % 2 ? 118 : 128, a)], false), 0.6));
  }
  return mk(els, [2, -16, 196, 190]);
};

D.compass = () => {
  const els = [];
  els.push(part(circleD(100, 100, 86) + circleD(100, 100, 76), "gold", { rule: "evenodd" }));
  els.push(part(circleD(100, 100, 76), "light"));
  for (let i = 0; i < 32; i++) { const a = i * TAU / 32; els.push(line(polyD([polar(100, 100, 76, a), polar(100, 100, i % 4 ? 70 : 64, a)], false), 0.4)); }
  const rose = (r1, r2, n, rot0, role1) => {
    const tips = regularPoly(100, 100, r1, n, rot0), inn = regularPoly(100, 100, r2, n, rot0 + Math.PI / n);
    for (let i = 0; i < n; i++) {
      els.push(part(polyD([[100, 100], inn[(i + n - 1) % n], tips[i]]), role1));
      els.push(dark(polyD([[100, 100], tips[i], inn[i]])));
    }
  };
  rose(56, 14, 4, -Math.PI / 4, "light");
  rose(72, 14, 4, -Math.PI / 2, "light");
  els.push(part(circleD(100, 100, 6), "gold"));
  // N
  els.push(line(polyD([[95, 20], [95, 8], [105, 20], [105, 8]], false), 0.6));
  return mk(els, [10, 2, 180, 186]);
};

D.crown = () => {
  const els = [];
  els.push(part(S([[30, 150, 1], [24, 60, 1], [62, 104], [100, 40, 1], [138, 104], [176, 60, 1], [170, 150, 1]]), "gold"));
  els.push(part(S([[30, 140, 1], [170, 140, 1], [172, 168, 1], [28, 168, 1]]), "gold"));
  for (const [x, y] of [[24, 54], [100, 32], [176, 54]]) els.push(part(circleD(x, y, 9), "white"));
  els.push(part(circleD(100, 154, 7), "main"), part(ellipseD(66, 154, 8, 6), "blue"), part(ellipseD(134, 154, 8, 6), "blue"));
  els.push(part(polyD([[100, 96], [110, 112], [100, 128], [90, 112]]), "main"));
  els.push(shine(streak([[40, 128], [38, 100], [36, 82]], 2.2)));
  els.push(shade(S([[150, 140, 1], [170, 140, 1], [174, 72], [160, 92]])));
  return mk(els, [14, 20, 172, 156]);
};

D.key = () => {
  const els = [];
  // bow: quatrefoil ring
  const lobes = [];
  for (let i = 0; i < 4; i++) { const c = polar(100, 46, 18, i * TAU / 4 + Math.PI / 4); lobes.push(c); }
  const bowPts = [];
  for (let i = 0; i < 64; i++) { const a = i * TAU / 64; const r = 28 + 8 * Math.abs(Math.cos(2 * a)); bowPts.push(polar(100, 46, r, a)); }
  els.push(part(S(bowPts.filter((_, i) => i % 2 === 0)) + circleD(100, 46, 13), "gold", { rule: "evenodd" }));
  els.push(part(S([[94, 80, 1], [106, 80, 1], [106, 186, 1], [94, 186, 1]]), "gold"));
  els.push(part(S([[90, 86, 1], [110, 86, 1], [110, 94, 1], [90, 94, 1]]), "gold"));
  // bit
  els.push(part(polyD([[106, 150], [136, 150], [136, 158], [126, 158], [126, 166], [136, 166], [136, 182], [106, 182]]), "gold"));
  els.push(dark(circleD(100, 46, 4)));
  els.push(shine(streak([[97, 100], [97, 140], [97, 170]], 1.4)));
  return mk(els, [56, 6, 96, 186]);
};

D.hourglass = () => {
  const els = [];
  els.push(part(S([[50, 20, 1], [150, 20, 1], [150, 34, 1], [50, 34, 1]]), "brown"));
  els.push(part(S([[50, 166, 1], [150, 166, 1], [150, 180, 1], [50, 180, 1]]), "brown"));
  const glass = [[64, 34, 1], [66, 64], [92, 96], [92, 104], [66, 136], [64, 166, 1], [136, 166, 1], [134, 136], [108, 104], [108, 96], [134, 64], [136, 34, 1]];
  els.push(part(S(glass), "light"));
  els.push(part(S([[72, 70, 1], [128, 70, 1], [106, 96], [100, 100, 1], [94, 96]]), "sand"));
  els.push(part(S([[68, 166, 1], [74, 146], [100, 128, 1], [126, 146], [132, 166, 1]]), "sand"));
  els.push(line(polyD([[100, 100], [100, 146]], false), 0.4));
  for (const x of [54, 146]) els.push(part(S([[x - 4, 34, 1], [x + 4, 34, 1], [x + 4, 166, 1], [x - 4, 166, 1]]), "brown"));
  els.push(shine(streak([[74, 40], [76, 56], [86, 76]], 2)));
  return mk(els, [40, 14, 120, 172]);
};

D.diamond = () => {
  const els = [];
  els.push(part(polyD([[60, 40], [140, 40], [180, 80], [100, 180], [20, 80]]), "gem"));
  els.push(line(polyD([[20, 80], [180, 80]], false), 0.6));
  els.push(line(polyD([[60, 40], [80, 80], [100, 40], [120, 80], [140, 40]], false), 0.55));
  els.push(line(polyD([[20, 80], [80, 80], [100, 180], [120, 80], [180, 80]], false), 0.55));
  els.push(line(polyD([[60, 40], [40, 80]], false), 0.45), line(polyD([[140, 40], [160, 80]], false), 0.45));
  els.push(line(polyD([[40, 80], [100, 180], [160, 80]], false), 0.4));
  els.push(shade(polyD([[120, 80], [180, 80], [100, 180]])));
  els.push(shine(polyD([[64, 46], [74, 46], [62, 70]])));
  return mk(els, [16, 30, 168, 154]);
};

D.flame = () => mk([
  part(S([[100, 188], [58, 176], [36, 144], [40, 104], [56, 76, 1], [62, 104], [74, 110], [70, 76], [84, 40], [104, 10, 1], [100, 52], [118, 76], [126, 54, 1], [146, 86], [162, 120], [160, 156], [138, 180]]), "fire"),
  part(S([[100, 180], [74, 168], [64, 144], [72, 118, 1], [82, 134], [92, 110], [100, 78, 1], [106, 112], [118, 104, 1], [132, 130], [132, 160], [118, 176]]), "fire2"),
  part(S([[100, 172], [86, 162], [86, 146], [96, 128, 1], [102, 142], [110, 136, 1], [116, 154], [112, 168]]), "white"),
], [30, 6, 140, 186]);

D.lightning = () => mk([
  part(polyD([[118, 6], [52, 108], [94, 108], [70, 194], [150, 80], [106, 80], [140, 6]]), "gold"),
  shine(polyD([[120, 14], [72, 98], [80, 98], [124, 18]])),
  shade(polyD([[106, 80], [150, 80], [134, 102], [118, 92]])),
], [40, 4, 120, 192]);

D.clock = () => {
  const els = [];
  els.push(part(circleD(100, 26, 13) + circleD(100, 26, 7), "gold", { rule: "evenodd" }));
  els.push(part(S([[90, 34, 1], [110, 34, 1], [112, 46, 1], [88, 46, 1]]), "gold"));
  els.push(part(circleD(100, 116, 74), "gold"));
  els.push(part(circleD(100, 116, 62), "light"));
  for (let i = 0; i < 60; i++) { const a = i * TAU / 60; els.push(line(polyD([polar(100, 116, 62, a), polar(100, 116, i % 5 ? 58 : 52, a)], false), i % 5 ? 0.3 : 0.6)); }
  // roman-ish numerals as bars at 12, 3, 6, 9
  els.push(line(polyD([polar(100, 116, 30, -Math.PI / 2 - 0.0), [100, 116]], false), 1));
  els.push(line(polyD([[100, 116], polar(100, 116, 42, -Math.PI / 2 + 2.2)], false), 0.8));
  els.push(dark(circleD(100, 116, 5)));
  els.push(shine(streak([[52, 100], [56, 80], [70, 64]], 2.6)));
  return mk(els, [24, 12, 152, 180]);
};

D.infinity = () => {
  const center = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64 * TAU; const s = Math.sin(t), c = Math.cos(t); center.push([100 + 82 * c / (1 + s * s), 100 + 82 * s * c / (1 + s * s)]); }
  const left = center.slice(16, 49); // through left loop
  const els = [part(polyD(taperPts(center, 6, { spline: false, step: 2 })), "main")];
  // over-crossing piece
  const cross = center.slice(56).concat(center.slice(1, 9));
  els.push(part(polyD(taperPts(cross, 6, { spline: false, step: 2 })), "main"));
  return mk(els, [10, 54, 180, 92]);
};

D.cross = () => mk([
  part(S([[88, 12, 1], [112, 12, 1], [112, 56, 1], [152, 56, 1], [152, 80, 1], [112, 80, 1], [112, 188, 1], [88, 188, 1], [88, 80, 1], [48, 80, 1], [48, 56, 1], [88, 56, 1]]), "brown"),
  line(S([[94, 18, 1], [106, 18, 1], [106, 62, 1], [146, 62, 1], [146, 74, 1], [106, 74, 1], [106, 182, 1], [94, 182, 1], [94, 74, 1], [54, 74, 1], [54, 62, 1], [94, 62, 1]]), 0.4),
  shine(streak([[92, 90], [92, 140], [92, 176]], 1.6)),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => line(polyD([polar(100, 68, 58, i * TAU / 8 + 0.4), polar(100, 68, 74, i * TAU / 8 + 0.4)], false), 0.5)),
], [26, 6, 148, 188]);

D.hand = () => {
  // hamsa
  const half = [[100, 30], [90, 30], [86, 44], [86, 90], [82, 92], [80, 40], [74, 30], [64, 32], [62, 44], [62, 98], [58, 100], [50, 70], [40, 64], [32, 70], [34, 100], [42, 140], [62, 170], [100, 182]];
  const els = [part(S(mirrorPts(half.map((p) => [p[0], p[1]]))), "blue")];
  els.push(part(S([[60, 128, 1], [80, 112], [100, 108], [120, 112], [140, 128, 1], [120, 144], [100, 148], [80, 144]]), "white"));
  els.push(part(circleD(100, 128, 13), "gem"), dark(circleD(100, 128, 6)), shine(circleD(96, 124, 2.4)));
  els.push(line(So([[56, 152], [100, 168], [144, 152]]), 0.5));
  for (let i = 0; i < 7; i++) { const a = Math.PI * 0.15 + i * Math.PI * 0.7 / 6; els.push(dark(circleD(...polar(100, 128, 30, -a), 2.4))); }
  els.push(line(So([[86, 52], [86, 92]]), 0.35), line(So([[114, 52], [114, 92]]), 0.35));
  return mk(els, [22, 24, 156, 162]);
};

D.feather = () => {
  const els = [];
  const sp = sampleSpline([[100, 196], [98, 150], [100, 100], [106, 50], [116, 10]], false, 16);
  const N = sp.length;
  const vane = (side) => {
    const pts = [];
    for (let i = Math.floor(N * 0.22); i < N; i++) {
      const t = i / (N - 1);
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N - 1, i + 1)], n = perp(norm(sub(b, a)));
      let w = (side < 0 ? 34 : 28) * Math.sin(Math.PI * Math.min(1, (t - 0.18) / 0.82)) ** 0.7;
      // notches
      const notch = side < 0 ? [0.45, 0.68] : [0.56];
      for (const nt of notch) if (Math.abs(t - nt) < 0.035) w *= 0.45 + Math.abs(t - nt) / 0.035 * 0.55;
      pts.push(add(sp[i], mul(n, w * side)));
    }
    pts.push(sp[N - 1]);
    return [sp[Math.floor(N * 0.22)], ...pts];
  };
  for (const side of [-1, 1]) {
    const vp = vane(side);
    els.push(part(S(vp.filter((_, i) => i % 2 === 0 || i === vp.length - 1)), side < 0 ? "blue" : "gem"));
    for (let i = Math.floor(N * 0.26); i < N - 3; i += 3) {
      const t = i / (N - 1), j = Math.min(N - 1, i + 4);
      const k = Math.min(vp.length - 1, j - Math.floor(N * 0.22) + 1);
      els.push(line(So([sp[i], mix(sp[i], vp[k], 0.55), vp[k]]), 0.3));
    }
  }
  els.push(part(taperSmoothD(sp.filter((_, i) => i % 4 === 0).concat([sp[N - 1]]), (t) => 2.8 * (1 - t) + 0.6), "light"));
  return mk(els, [50, 6, 100, 192]);
};

D.arrow = () => {
  const els = [];
  els.push(part(S([[20, 97, 1], [168, 97, 1], [168, 103, 1], [20, 103, 1]]), "brown"));
  els.push(part(polyD([[196, 100], [160, 82], [168, 100], [160, 118]]), "metal"));
  for (const x of [20, 36]) {
    els.push(part(polyD([[x, 97], [x + 22, 97], [x + 12, 80], [x - 8, 80]]), "main"));
    els.push(part(polyD([[x, 103], [x + 22, 103], [x + 12, 120], [x - 8, 120]]), "main"));
  }
  els.push(line(polyD([[150, 100], [140, 100]], false), 0.4));
  return mk(els, [6, 76, 194, 48]);
};

D.butterfly = () => {
  const els = [];
  const upper = [[96, 90], [80, 60], [56, 34], [26, 24], [10, 36], [12, 62], [30, 88], [58, 102], [92, 102]];
  const lower = [[94, 104], [64, 108], [40, 124], [32, 150], [44, 172], [68, 170], [86, 144], [96, 116]];
  els.push(part(S(lower), "blue"), part(S(mirrorX(lower)), "blue"));
  els.push(part(S(upper), "blue"), part(S(mirrorX(upper)), "blue"));
  // wing patterns
  const spot = [[30, 44], [44, 40], [52, 52], [42, 64], [28, 60]];
  els.push(part(S(spot), "accent"), part(S(mirrorX(spot)), "accent"));
  const spot2 = [[48, 136], [60, 130], [64, 146], [54, 156], [44, 150]];
  els.push(part(S(spot2), "accent"), part(S(mirrorX(spot2)), "accent"));
  for (const sg of [1, -1]) {
    const X = (x) => sg > 0 ? x : 200 - x;
    els.push(line(So([[94, 94], [70, 70], [40, 44].map((v, i) => i ? v : v)].map((p) => [X(p[0]), p[1]])), 0.5));
    els.push(line(So([[94, 96], [60, 92], [26, 70]].map((p) => [X(p[0]), p[1]])), 0.45));
    els.push(line(So([[94, 108], [66, 130], [52, 162]].map((p) => [X(p[0]), p[1]])), 0.45));
    els.push(dark(S([[16, 40], [24, 28], [40, 26], [26, 36], [18, 52]].map((p) => [X(p[0]), p[1]]))));
    for (const [x, y] of [[20, 66], [34, 86], [40, 166], [60, 168]]) els.push(part(circleD(X(x), y, 3), "white"));
  }
  els.push(part(S([[100, 76], [106, 88], [105, 130], [100, 150], [95, 130], [94, 88]]), "dark"));
  els.push(dark(circleD(100, 72, 6)));
  els.push(line(So([[98, 68], [90, 48], [80, 34]]), 0.6), line(So([[102, 68], [110, 48], [120, 34]]), 0.6));
  els.push(dark(circleD(80, 34, 2.6)), dark(circleD(120, 34, 2.6)));
  return mk(els, [6, 20, 188, 158]);
};

D.swallow = () => {
  const els = [];
  // far wing (up and back)
  els.push(part(S([[96, 82], [112, 50], [140, 24], [182, 6, 1], [160, 34], [150, 52], [130, 80], [112, 96]]), "blue"));
  // tail (forked)
  els.push(part(S([[126, 118], [158, 136], [196, 168, 1], [166, 152], [180, 186, 1], [150, 156], [118, 132]]), "blue"));
  // body
  els.push(part(S([[30, 74], [44, 64], [62, 62], [90, 78], [118, 98], [134, 120], [120, 128], [90, 118], [60, 100], [42, 88]]), "blue"));
  // belly
  els.push(part(S([[44, 88], [62, 98], [92, 116], [120, 128], [94, 128], [66, 116], [48, 100]]), "light"));
  // throat
  els.push(part(S([[30, 76], [40, 72], [50, 82], [46, 92], [36, 86]]), "main"));
  // beak
  els.push(part(polyD([[30, 72], [12, 80], [32, 82]]), "dark"));
  els.push(dark(circleD(46, 72, 3.4)));
  els.push(shine(circleD(45, 71, 1.1)));
  // near wing (down and forward)
  els.push(part(S([[70, 92], [96, 100], [108, 112], [98, 132], [78, 160], [52, 190, 1], [58, 158], [62, 128]]), "blue"));
  for (let i = 0; i < 4; i++) els.push(line(So([[86 - i * 4, 108 + i * 4], [80 - i * 6, 130 + i * 8], [70 - i * 6, 150 + i * 9]]), 0.4));
  for (let i = 0; i < 3; i++) els.push(line(So([[120 + i * 8, 64 - i * 8], [140 + i * 10, 40 - i * 8]]), 0.4));
  els.push(shine(streak([[60, 66], [76, 70], [92, 80]], 2)));
  return mk(els, [8, 4, 190, 190]);
};

D.snake = () => {
  const els = [];
  const center = [[40, 186], [60, 176], [80, 186], [120, 176], [150, 150], [136, 120], [90, 110], [60, 90], [76, 60], [110, 52], [130, 38]];
  const w = (t) => 3 + 11 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55) - (t > 0.9 ? (t - 0.9) * 40 : 0);
  els.push(part(taperSmoothD(center, w, { step: 2.5 }), "leaf"));
  // belly bands
  const sp = sampleSpline(center, false, 14);
  for (let i = 6; i < sp.length - 6; i += 3) {
    const a = sp[i - 1], b = sp[i + 1], n = perp(norm(sub(b, a))), t = i / sp.length;
    const ww = w(t) * 0.95;
    els.push(line(So([add(sp[i], mul(n, ww)), add(add(sp[i], mul(norm(sub(b, a)), 1.5)), mul(n, 0)), add(sp[i], mul(n, -ww))]), 0.3));
  }
  // diamond markings
  for (let i = 10; i < sp.length - 10; i += 9) {
    const a = sp[i - 1], b = sp[i + 1], u = norm(sub(b, a)), n = perp(u), ww = w(i / sp.length) * 0.55;
    els.push(dark(polyD([add(sp[i], mul(u, -4)), add(sp[i], mul(n, ww)), add(sp[i], mul(u, 4)), add(sp[i], mul(n, -ww))])));
  }
  // head
  els.push(part(S([[124, 30], [140, 22], [162, 24], [176, 34], [170, 44], [150, 50], [130, 50]]), "leaf"));
  els.push(dark(circleD(152, 32, 3.2)));
  els.push(line(So([[174, 36], [184, 38], [192, 32]]), 0.5), line(So([[184, 38], [192, 44]]), 0.5));
  els.push(line(So([[136, 42], [156, 44], [170, 40]]), 0.4));
  return mk(els, [24, 16, 172, 182]);
};

export const MOTIF_DEFS = D;
export { roseEls, part, line, dark, shine, shade, mk, S, So, streak, tf };
