// Animal & creature motifs (200×200 design box), plus a few extra objects.
import {
  smooth, polyD, circleD, ellipseD, arcPts, mirrorPts, mirrorX, petalD, petalPts, taperSmoothD, taperPts,
  starPts, regularPoly, polar, TAU, DEG, makeRng, sampleSpline, add, sub, mul, norm, perp, mix, lerp, transformD, M,
} from "./core.js";
import { part, line, dark, shine, shade, mk, S, So, streak, leafEls } from "./motifs.js";

const A = {};
const both = (fn) => [fn(1), fn(-1)];          // build left/right pairs
const mx = (pts) => mirrorX(pts);
const eyeAlmond = (cx, cy, w, h, tilt = 0.25) => [[cx - w, cy + tilt * w, 1], [cx - w * 0.2, cy - h], [cx + w * 0.7, cy - h * 0.6], [cx + w, cy - tilt * w * 0.3, 1], [cx + w * 0.1, cy + h * 0.8]];

A.wolf = () => {
  const half = [[100, 58], [86, 55], [72, 46], [60, 10, 1], [48, 34], [42, 60], [30, 80], [12, 100, 1], [32, 104], [18, 126, 1], [40, 128], [32, 148, 1], [56, 146], [70, 162], [82, 178], [100, 188]];
  const els = [part(S(mirrorPts(half)), "grey")];
  els.push(part(S(mirrorPts([[100, 116], [86, 112], [70, 116], [56, 126], [46, 142, 1], [60, 146], [72, 160], [84, 176], [100, 186]])), "cream", { noStroke: true }));
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(part(S(X([[61, 20, 1], [68, 44], [58, 52], [50, 44]])), "dark"));
    els.push(dark(S(X(eyeAlmond(74, 100, 12, 6, 0.3)))));
    els.push(line(So(X([[56, 90], [70, 86], [90, 92]])), 0.6));
    els.push(line(So(X([[36, 108], [52, 114], [62, 130]])), 0.5));
    els.push(line(So(X([[44, 132], [56, 136], [66, 150]])), 0.45));
    els.push(line(So(X([[90, 106], [91, 130], [92, 154]])), 0.5));
    els.push(line(So(X([[84, 62], [90, 76], [96, 82]])), 0.4));
  }
  els.push(line(So([[100, 64], [98, 80], [100, 94]]), 0.45));
  els.push(dark(S([[86, 160, 1], [100, 154], [114, 160, 1], [110, 171], [100, 176], [90, 171]])));
  els.push(line(So([[100, 176], [100, 182]]), 0.5), line(So([[90, 180], [100, 183], [110, 180]]), 0.5));
  els.push(shine(circleD(95, 161, 2)));
  return mk(els, [10, 6, 180, 186]);
};

A.fox = () => {
  const half = [[100, 64], [84, 60], [66, 50], [44, 8, 1], [36, 40], [36, 64], [24, 92], [6, 122, 1], [40, 128], [62, 150], [82, 172], [100, 184]];
  const els = [part(S(mirrorPts(half)), "orange")];
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(part(S(X([[46, 18, 1], [62, 50], [48, 60], [40, 44]])), "dark"));
    els.push(part(S(X([[8, 122, 1], [36, 112], [62, 116], [84, 136], [94, 160], [100, 182], [82, 172], [62, 150], [40, 128]])), "white"));
    els.push(dark(S(X(eyeAlmond(72, 104, 11, 6, 0.4)))));
    els.push(line(So(X([[30, 98], [48, 104], [58, 112]])), 0.45));
    els.push(line(So(X([[86, 70], [90, 92], [92, 112]])), 0.4));
  }
  els.push(dark(S([[90, 172, 1], [100, 168], [110, 172, 1], [106, 180], [100, 184], [94, 180]])));
  return mk(els, [4, 4, 192, 184]);
};

A.bear = () => {
  const half = [[100, 40], [76, 42], [54, 56], [42, 82], [40, 112], [50, 140], [70, 160], [100, 168]];
  const els = [];
  for (const sg of [1, -1]) {
    const cx = sg > 0 ? 56 : 144;
    els.push(part(circleD(cx, 50, 18), "brown"), part(circleD(cx, 52, 9), "dark"));
  }
  els.push(part(S(mirrorPts(half)), "brown"));
  els.push(part(ellipseD(100, 134, 30, 24), "sand"));
  els.push(dark(S([[88, 118, 1], [100, 114], [112, 118, 1], [108, 128], [100, 132], [92, 128]])));
  els.push(line(So([[100, 132], [100, 142]]), 0.5), line(So([[88, 144], [100, 142], [112, 144]]), 0.55));
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(dark(circleD(sg > 0 ? 76 : 124, 98, 5.5)));
    els.push(line(So(X([[66, 86], [76, 82], [86, 86]])), 0.5));
    els.push(line(So(X([[46, 122], [56, 134], [62, 146]])), 0.45));
  }
  els.push(shine(circleD(97, 119, 2)));
  return mk(els, [24, 28, 152, 144]);
};

A.lion = () => {
  const els = [];
  // mane: flame-like tufts around the head
  const mane = [], n = 18;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * TAU / n;
    mane.push([...polar(100, 104, 96, a + 0.08), 1]);
    mane.push(polar(100, 104, 80, a + TAU / n * 0.55));
    mane.push(polar(100, 104, 74, a + TAU / n * 0.85));
  }
  els.push(part(S(mane), "brown"));
  const inner = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + TAU / n / 2 + i * TAU / n; inner.push([...polar(100, 104, 80, a), 1]); inner.push(polar(100, 104, 68, a + TAU / n * 0.5)); }
  els.push(part(S(inner), "orange"));
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * TAU / n; els.push(line(So([polar(100, 104, 64, a + 0.15), polar(100, 104, 78, a + 0.05), polar(100, 104, 90, a + 0.06)]), 0.4)); }
  // ears
  for (const sg of [1, -1]) els.push(part(circleD(100 - sg * 34, 52, 12), "gold"), part(circleD(100 - sg * 34, 53, 6), "brown"));
  const face = [[100, 42], [78, 46], [62, 62], [56, 86], [58, 110], [66, 134], [78, 154], [90, 166], [100, 170]];
  els.push(part(S(mirrorPts(face)), "gold"));
  els.push(part(S(mirrorPts([[100, 124], [86, 126], [74, 138], [78, 154], [90, 162], [100, 164]])), "cream"));
  els.push(part(S(mirrorPts([[100, 70], [94, 78], [92, 110], [88, 118], [100, 120]])), "sand", { noStroke: true }));
  els.push(dark(S([[86, 118, 1], [100, 114], [114, 118, 1], [108, 128], [100, 132], [92, 128]])));
  els.push(line(So([[100, 132], [100, 140]]), 0.5), line(So([[86, 142], [100, 140], [114, 142]]), 0.55));
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(dark(S(X(eyeAlmond(78, 94, 10, 5.5, 0.35)))));
    els.push(line(So(X([[66, 86], [78, 80], [92, 86]])), 0.6));
    els.push(line(So(X([[92, 74], [92, 90], [88, 112]])), 0.4));
    for (const [x, y] of [[82, 138], [78, 132], [86, 146]]) els.push(dark(circleD(sg > 0 ? x : 200 - x, y, 1.4)));
  }
  els.push(shine(circleD(96, 119, 2)));
  return mk(els, [4, 8, 192, 192]);
};

function featherFan(pivot, a0, a1, n, len0, len1, w, role) {
  const els = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = lerp(a0, a1, t), L = lerp(len0, len1, t);
    const base = polar(pivot[0], pivot[1], L * 0.25, a);
    const tip = polar(pivot[0], pivot[1], L, a);
    els.push(part(petalD(base, tip, w, { at: 0.55, tipRound: 0.25 }), role));
    els.push(line(So([polar(pivot[0], pivot[1], L * 0.45, a), polar(pivot[0], pivot[1], L * 0.9, a)]), 0.3));
  }
  return els;
}

A.eagle = () => {
  const els = [];
  // tail
  els.push(...featherFan([100, 120], Math.PI / 2 + 0.45, Math.PI / 2 - 0.45, 5, 70, 70, 9, "cream"));
  for (const sg of [1, -1]) {
    const sh = [100 - sg * 18, 92];
    const base = sg > 0 ? Math.PI : 0;
    // primaries fan
    const fan = featherFan(sh, base + sg * 0.75, base - sg * 0.35, 7, 92, 64, 9, "brown");
    els.push(...fan);
    // coverts
    const cov = [];
    cov.push([...sh, 1]);
    for (let i = 0; i <= 8; i++) { const t = i / 8, a = lerp(base + sg * 0.85, base - sg * 0.45, t); cov.push(polar(sh[0], sh[1], 50 + 6 * Math.sin(t * Math.PI), a)); }
    cov.push([100 - sg * 12, 116]);
    els.push(part(S(cov), "brown"));
    for (let i = 1; i < 6; i++) { const a = lerp(base + sg * 0.7, base - sg * 0.3, i / 6); els.push(line(So([polar(sh[0], sh[1], 30, a), polar(sh[0], sh[1], 44, a + sg * 0.06)]), 0.35)); }
    els.push(line(So(arcPts(sh[0], sh[1], 34, base + sg * 0.7, base - sg * 0.35, 8)), 0.35));
  }
  // body
  els.push(part(S([[100, 72], [118, 86], [122, 116], [112, 140], [100, 148], [88, 140], [78, 116], [82, 86]]), "brown"));
  for (let r = 0; r < 4; r++) for (let k = -1; k <= 1; k++) els.push(line(So(arcPts(100 + k * 12 - (r % 2) * 6, 98 + r * 11, 6, 0.2, Math.PI - 0.2, 6)), 0.35));
  // legs + talons
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(part(S(X([[90, 136], [96, 140], [94, 156], [90, 162], [84, 158], [86, 146]])), "gold"));
    els.push(line(So(X([[86, 160], [80, 166], [78, 172]])), 0.7), line(So(X([[90, 162], [90, 170], [88, 176]])), 0.7));
  }
  // head
  els.push(part(S([[100, 34], [116, 40], [122, 56], [116, 74], [100, 80], [84, 74], [78, 56], [84, 40]]), "white"));
  els.push(part(S([[92, 62, 1], [108, 62, 1], [107, 74], [100, 88, 1], [96, 80], [93, 70]]), "gold"));
  els.push(line(So([[94, 72], [100, 74], [106, 72]]), 0.4));
  for (const sg of [1, -1]) {
    els.push(dark(circleD(100 - sg * 10, 54, 3.4)));
    els.push(line(So(sg > 0 ? [[82, 48], [90, 48], [98, 52]] : [[118, 48], [110, 48], [102, 52]]), 0.6));
  }
  return mk(els, [4, 26, 192, 166]);
};

A.deer = () => {
  const els = [];
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    const w = (t) => 4.2 * (1 - t) + 1.2;
    els.push(part(taperSmoothD(X([[90, 66], [74, 50], [54, 42], [36, 30], [24, 10]]), w, { capEnd: true, step: 2.5 }), "cream"));
    for (const tine of [[[74, 52], [68, 36], [70, 18]], [[54, 44], [48, 28], [50, 10]], [[38, 32], [32, 22], [34, 4]], [[84, 60], [94, 48], [96, 38]]]) {
      els.push(part(taperSmoothD(X(tine), (t) => 2.8 * (1 - t) + 0.8, { capEnd: true, step: 2 }), "cream"));
    }
    els.push(part(petalD(X([[80, 82]])[0], X([[38, 74]])[0], 13, { at: 0.5, curve: sg * -0.06 }), "brown"));
    els.push(part(petalD(X([[78, 82]])[0], X([[48, 76]])[0], 6, { at: 0.5, curve: sg * -0.06 }), "cream", { noStroke: true }));
  }
  const half = [[100, 62], [88, 62], [78, 70], [72, 90], [74, 112], [82, 140], [88, 164], [90, 178], [100, 184]];
  els.push(part(S(mirrorPts(half)), "brown"));
  els.push(part(S(mirrorPts([[100, 74], [92, 80], [90, 110], [94, 150], [100, 156]])), "cream", { noStroke: true }));
  els.push(dark(S([[88, 164, 1], [100, 160], [112, 164, 1], [110, 178], [100, 184], [90, 178]])));
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(dark(S(X(eyeAlmond(80, 104, 7, 4.5, 0.3)))));
    els.push(line(So(X([[78, 120], [84, 140], [88, 158]])), 0.4));
  }
  return mk(els, [14, 0, 172, 188]);
};

A.owl = () => {
  const els = [];
  // branch
  els.push(part(taperSmoothD([[20, 176], [70, 170], [130, 172], [184, 164]], (t) => 6 - 2 * t, { step: 4 }), "brown"));
  // body
  const half = [[100, 44], [80, 42], [62, 34], [56, 14, 1], [48, 40], [42, 66], [38, 100], [44, 136], [60, 160], [82, 172], [100, 174]];
  els.push(part(S(mirrorPts(half)), "brown"));
  // wings
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(part(S(X([[46, 90], [62, 104], [68, 134], [62, 164], [50, 156], [40, 128], [40, 104]])), "sand"));
    for (let i = 0; i < 4; i++) els.push(line(So(X([[48 + i * 2, 110 + i * 12], [56 + i * 2, 116 + i * 12], [64, 114 + i * 12]])), 0.35));
  }
  // belly with feather scallops
  els.push(part(S([[100, 104], [124, 112], [132, 140], [120, 166], [100, 172], [80, 166], [68, 140], [76, 112]]), "cream"));
  for (let r = 0; r < 4; r++) for (let k = -2; k <= 2; k++) { if (Math.abs(k) === 2 && (r === 0 || r === 3)) continue; els.push(line(So(arcPts(100 + k * 11 + (r % 2) * 5.5, 120 + r * 12, 5, 0.3, Math.PI - 0.3, 6)), 0.35)); }
  // facial discs and eyes
  for (const sg of [1, -1]) {
    const cx = 100 - sg * 22;
    els.push(part(circleD(cx, 74, 22), "cream"));
    els.push(part(circleD(cx, 74, 13), "gold"));
    els.push(dark(circleD(cx, 74, 7)));
    els.push(shine(circleD(cx - 2.5, 71, 2.2)));
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; els.push(line(polyD([polar(cx, 74, 15, a), polar(cx, 74, 20, a)], false), 0.3)); }
  }
  els.push(part(S([[94, 82, 1], [106, 82, 1], [100, 100, 1]]), "gold"));
  // talons
  for (const x of [84, 116]) els.push(line(So([[x - 6, 166], [x - 6, 176]]), 0.7), line(So([[x, 168], [x, 178]]), 0.7), line(So([[x + 6, 166], [x + 6, 176]]), 0.7));
  return mk(els, [18, 10, 168, 176]);
};

A.cat = () => {
  const els = [];
  // tail curling at bottom right
  els.push(part(taperSmoothD([[130, 176], [160, 170], [176, 150], [172, 126], [160, 118]], (t) => 7 - t * 3, { capEnd: true, step: 3 }), "dark"));
  const half = [[100, 34], [86, 34], [78, 30], [70, 8, 1], [64, 30], [62, 50], [70, 70], [78, 78], [64, 98], [54, 130], [50, 160], [58, 182], [100, 186]];
  els.push(part(S(mirrorPts(half)), "dark"));
  return mk(els, [36, 4, 148, 186]);
};

A.dove = () => {
  const els = [];
  // far wing
  els.push(part(S([[96, 82], [112, 52], [132, 24], [150, 8, 1], [150, 30], [144, 52], [128, 80], [112, 94]]), "white"));
  // tail
  els.push(part(S([[130, 108], [168, 112], [194, 120, 1], [186, 132], [194, 142, 1], [170, 140], [132, 126]]), "white"));
  for (let i = 0; i < 3; i++) els.push(line(So([[140, 116 + i * 6], [186, 122 + i * 8]]), 0.35));
  // body
  els.push(part(S([[30, 84], [42, 72], [60, 72], [92, 84], [128, 100], [140, 118], [120, 128], [80, 120], [52, 106], [38, 96]]), "white"));
  els.push(part(polyD([[30, 82], [16, 88], [32, 92]]), "gold"));
  els.push(dark(circleD(44, 82, 3)));
  // near wing with finger feathers
  const wing = [[72, 92], [86, 70], [104, 44], [126, 18], [146, 2, 1], [138, 22], [154, 14, 1], [142, 36], [158, 32, 1], [142, 52], [156, 52, 1], [136, 70], [148, 72, 1], [124, 88], [104, 104]];
  els.push(part(S(wing), "white"));
  for (let i = 0; i < 4; i++) els.push(line(So([[100 + i * 4, 90 - i * 6], [118 + i * 6, 70 - i * 10], [132 + i * 4, 50 - i * 12]]), 0.35));
  els.push(line(So([[80, 92], [96, 84], [116, 84]]), 0.4));
  // olive sprig in beak
  els.push(line(So([[18, 92], [10, 104], [6, 118]]), 0.7));
  for (const [b, t] of [[[14, 98], [-2, 98]], [[12, 104], [20, 116]], [[9, 112], [-4, 120]], [[7, 117], [12, 130]]]) els.push(part(petalD(b, t, 3.6), "leaf"));
  return mk(els, [-6, 0, 202, 190]);
};

A.koi = () => {
  const els = [];
  const center = [[132, 22], [118, 50], [100, 86], [94, 120], [104, 150], [124, 170]];
  const w = (t) => t < 0.12 ? 14 + 70 * t : t < 0.35 ? 22.4 : 22.4 * (1 - (t - 0.35) / 0.65 * 0.8);
  const sp = sampleSpline(center, false, 14);
  const at = (t) => sp[Math.min(sp.length - 1, Math.round(t * (sp.length - 1)))];
  const dirAt = (t) => norm(sub(at(Math.min(1, t + 0.02)), at(Math.max(0, t - 0.02))));
  // tail fins
  const e = sp[sp.length - 1], d = dirAt(0.98), n = perp(d);
  els.push(part(S([e, add(add(e, mul(d, 20)), mul(n, 26)), add(add(e, mul(d, 44)), mul(n, 30)), [...add(add(e, mul(d, 40)), mul(n, 12)), 1], add(add(e, mul(d, 30)), mul(n, 2)), [...add(add(e, mul(d, 46)), mul(n, -14)), 1], add(add(e, mul(d, 34)), mul(n, -26)), add(add(e, mul(d, 12)), mul(n, -16))]), "main"));
  for (let k = -2; k <= 2; k++) els.push(line(So([add(e, mul(d, 6)), add(add(e, mul(d, 22)), mul(n, k * 6)), add(add(e, mul(d, 36)), mul(n, k * 9))]), 0.3));
  // pectoral & ventral fins
  for (const [t, side, L] of [[0.22, 1, 30], [0.22, -1, 30], [0.62, 1, 18], [0.62, -1, 18]]) {
    const p = at(t), dd = dirAt(t), nn = perp(dd), ww = w(t);
    const b = add(p, mul(nn, side * ww * 0.8));
    const tip = add(add(b, mul(nn, side * L)), mul(dd, L * 0.7));
    els.push(part(petalD(b, tip, L * 0.3, { at: 0.6, tipRound: 0.4, curve: side * 0.1 }), "main"));
    els.push(line(So([b, mix(b, tip, 0.8)]), 0.3));
  }
  // dorsal fin
  const dorsal = [];
  for (let i = 0; i <= 8; i++) { const t = 0.3 + i / 8 * 0.35, p = at(t), nn = perp(dirAt(t)); dorsal.push(add(p, mul(nn, -(w(t) * 0.7 + (i > 0 && i < 8 ? 12 * Math.sin(i / 8 * Math.PI) : 0))))); }
  els.push(part(S(dorsal), "main"));
  // body
  els.push(part(taperSmoothD(center, w, { step: 2.5, capStart: true }), "white"));
  // color patches
  const patch = (t0, t1, s0, s1) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = lerp(t0, t1, i / 6); pts.push(add(at(t), mul(perp(dirAt(t)), w(t) * lerp(s0, s1, Math.sin(i / 6 * Math.PI))))); }
    for (let i = 6; i >= 0; i--) { const t = lerp(t0, t1, i / 6); pts.push(add(at(t), mul(perp(dirAt(t)), -w(t) * 0.25 * Math.sin(i / 6 * Math.PI)))); }
    return S(pts.filter((_, i) => i !== 7));
  };
  els.push(part(patch(0.05, 0.25, 0.3, 0.9), "main", { noStroke: true }));
  els.push(part(patch(0.38, 0.62, -0.2, -0.95), "main", { noStroke: true }));
  els.push(part(patch(0.7, 0.88, 0.1, 0.9), "main", { noStroke: true }));
  // scales
  for (let t = 0.3; t < 0.9; t += 0.06) {
    const p = at(t), dd = dirAt(t), nn = perp(dd), ww = w(t);
    for (let k = -1; k <= 1; k++) {
      const c = add(p, mul(nn, k * ww * 0.5 + ((Math.round(t / 0.06) % 2) ? ww * 0.25 : 0)));
      if (Math.abs(k * 0.5 + ((Math.round(t / 0.06) % 2) ? 0.25 : 0)) > 0.8) continue;
      const a = Math.atan2(dd[1], dd[0]);
      els.push(line(So(arcPts(c[0], c[1], ww * 0.22, a - 1.3, a + 1.3, 6)), 0.3));
    }
  }
  // head
  const h = at(0.06), hd = dirAt(0.06), hn = perp(hd);
  els.push(line(So([add(at(0.16), mul(hn, -18)), add(at(0.19), mul(hn, 0)), add(at(0.16), mul(hn, 18))]), 0.5));
  for (const sg of [1, -1]) {
    els.push(dark(circleD(...add(at(0.07), mul(hn, sg * 11)), 3.2)));
    const m0 = add(at(0.0), mul(hn, sg * 6));
    els.push(line(So([m0, add(add(m0, mul(hd, -10)), mul(hn, sg * 8)), add(add(m0, mul(hd, -14)), mul(hn, sg * 20))]), 0.45));
  }
  return mk(els, [44, 2, 150, 210]);
};

A.dragon = () => {
  const els = [];
  const center = [[60, 52], [92, 66], [124, 56], [154, 74], [150, 110], [110, 118], [64, 116], [40, 140], [60, 168], [104, 170], [140, 160], [170, 172], [190, 188]];
  const w = (t) => 2 + 9 * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI / 2);
  const sp = sampleSpline(center, false, 12);
  const at = (t) => sp[Math.min(sp.length - 1, Math.round(t * (sp.length - 1)))];
  const dirAt = (t) => norm(sub(at(Math.min(1, t + 0.01)), at(Math.max(0, t - 0.01))));
  // spikes along the back
  const spikes = [];
  for (let t = 0.04; t < 0.92; t += 0.035) {
    const p = at(t), d = dirAt(t), n = perp(d), ww = w(t);
    const b0 = add(p, mul(n, -ww * 0.9)), b1 = add(add(p, mul(d, 7)), mul(n, -ww * 0.9));
    const tip = add(add(p, mul(d, 1)), mul(n, -(ww + 6 + 3 * (1 - t))));
    spikes.push(polyD([b0, tip, b1]));
  }
  els.push(part(spikes.join(""), "main"));
  // legs with claws
  for (const [t, sg] of [[0.18, 1], [0.6, 1]]) {
    const p = at(t), d = dirAt(t), n = perp(d), ww = w(t);
    const hip = add(p, mul(n, ww * 0.6));
    const knee = add(add(hip, mul(n, 16)), mul(d, -6)), foot = add(add(knee, mul(n, 8)), mul(d, 10));
    els.push(part(taperSmoothD([hip, knee, foot], (q) => 4.5 - q * 1.5, { step: 2 }), "leaf"));
    for (let k = -1; k <= 1; k++) els.push(line(So([foot, add(add(foot, mul(d, 6)), mul(n, 4 + k * 3))]), 0.6));
  }
  els.push(part(taperSmoothD(center, w, { step: 2.5 }), "leaf"));
  // belly plates
  for (let t = 0.05; t < 0.9; t += 0.02) {
    const p = at(t), n = perp(dirAt(t)), ww = w(t);
    els.push(line(polyD([add(p, mul(n, ww * 0.25)), add(p, mul(n, ww * 0.95))], false), 0.25));
  }
  els.push(line(So(sp.filter((_, i) => i % 4 === 0).map((p, i, arr) => { const t = i / (arr.length - 1); return add(p, mul(perp(dirAt(t)), w(t) * 0.25)); })), 0.35));
  // head (facing left)
  const head = [[64, 46], [52, 38], [36, 40], [18, 44, 1], [14, 52], [26, 56], [16, 62, 1], [30, 64], [44, 66], [60, 64], [72, 58]];
  els.push(part(S(head), "leaf"));
  els.push(part(S([[18, 56], [28, 57], [40, 60], [28, 61]]), "main"));
  els.push(dark(S(eyeAlmond(44, 47, 5, 2.6, 0.2))));
  // horns, mane, whiskers
  els.push(part(taperSmoothD([[56, 40], [66, 26], [84, 18], [96, 20]], (t) => 3 * (1 - t) + 0.3, { capEnd: true }), "cream"));
  els.push(part(taperSmoothD([[50, 40], [56, 24], [70, 14]], (t) => 2.5 * (1 - t) + 0.3, { capEnd: true }), "cream"));
  els.push(line(So([[22, 50], [10, 42], [4, 28], [12, 20]]), 0.5));
  els.push(line(So([[24, 60], [14, 72], [16, 88], [8, 96]]), 0.5));
  for (let i = 0; i < 4; i++) els.push(part(petalD([64 + i * 4, 50 + i * 3], [86 + i * 8, 36 + i * 6], 4, { curve: 0.15 }), "main"));
  els.push(line(So([[22, 46], [34, 44], [44, 42]]), 0.4));
  return mk(els, [2, 10, 192, 182]);
};

A.phoenix = () => {
  const els = [];
  // tail plumes
  const plumes = [
    [[100, 112], [92, 140], [70, 160], [50, 168], [40, 184], [56, 194]],
    [[100, 112], [104, 146], [100, 172], [112, 192]],
    [[100, 112], [110, 140], [134, 158], [152, 166], [162, 182], [146, 192]],
  ];
  for (const p of plumes) {
    els.push(part(taperSmoothD(p, (t) => 2 + 7 * Math.sin(t * Math.PI) ** 0.8, { step: 3 }), "fire"));
    els.push(line(So(p.slice(0, -1)), 0.35));
  }
  for (const sg of [1, -1]) {
    // wings: flame feathers rising
    const X = (pts) => sg > 0 ? pts : mx(pts);
    const fe = [];
    for (let i = 0; i < 6; i++) {
      const base = [92 - i * 4, 84 - i * 2];
      const tip = [70 - i * 10, 46 - i * 6 + (i > 3 ? (i - 3) * 14 : 0)];
      fe.push(part(petalD(X([base])[0], X([tip])[0], 8 - i * 0.6, { curve: sg * 0.12, at: 0.5 }), i % 2 ? "fire2" : "fire"));
    }
    els.push(...fe.reverse());
    els.push(part(S(X([[96, 80], [80, 70], [62, 66], [48, 70], [60, 80], [76, 90], [92, 96]])), "gold"));
  }
  // body & head
  els.push(part(S([[100, 60], [110, 70], [112, 96], [106, 116], [100, 122], [94, 116], [88, 96], [90, 70]]), "fire"));
  els.push(part(S([[100, 40], [108, 46], [108, 58], [100, 64], [92, 58], [92, 46]]), "fire"));
  els.push(part(polyD([[96, 58], [104, 58], [100, 68]]), "gold"));
  els.push(dark(circleD(96, 50, 1.8)), dark(circleD(104, 50, 1.8)));
  // crest
  for (const [a, L] of [[-0.4, 18], [0, 22], [0.4, 18]]) els.push(part(petalD([100, 42], polar(100, 42, L, -Math.PI / 2 + a), 3, { curve: 0.1 }), "fire2"));
  return mk(els, [6, 14, 188, 184]);
};

A.hummingbird = () => {
  const els = [];
  els.push(part(S([[96, 100], [120, 70], [150, 40], [184, 22, 1], [170, 48], [150, 76], [124, 104]]), "gem"));
  els.push(part(S([[110, 120], [128, 140], [146, 168, 1], [130, 160], [134, 182, 1], [116, 152], [102, 130]]), "blue"));
  els.push(part(S([[52, 90], [66, 80], [86, 84], [110, 100], [122, 118], [112, 130], [88, 120], [66, 106], [54, 98]]), "leaf"));
  els.push(part(S([[56, 96], [70, 100], [74, 110], [64, 108]]), "main"));
  els.push(part(polyD([[54, 88], [6, 82], [54, 94]]), "dark"));
  els.push(dark(circleD(66, 88, 2.6)));
  els.push(part(S([[86, 96], [104, 82], [130, 58], [160, 40, 1], [146, 66], [124, 92], [104, 108]]), "gem"));
  for (let i = 0; i < 3; i++) els.push(line(So([[100 + i * 6, 94 - i * 4], [124 + i * 8, 72 - i * 8], [140 + i * 6, 56 - i * 6]]), 0.35));
  return mk(els, [4, 18, 184, 166]);
};

A.jellyfish = () => {
  const els = [];
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 13.3;
    const pts = [[x, 92], [x + (i % 2 ? 8 : -8), 120], [x + (i % 2 ? -6 : 6), 150], [x + (i % 2 ? 6 : -4), 184]];
    els.push(line(So(pts), i % 3 === 0 ? 0.9 : 0.5));
  }
  for (const sg of [-1, 1]) els.push(part(taperSmoothD([[100 + sg * 12, 92], [100 + sg * 18, 120], [100 + sg * 8, 150], [100 + sg * 16, 176]], (t) => 5 * (1 - t) + 1, { step: 3 }), "pink"));
  els.push(part(S([[38, 96], [42, 60], [70, 30], [100, 24], [130, 30], [158, 60], [162, 96], [150, 92], [138, 100], [124, 92], [112, 100], [100, 92], [88, 100], [76, 92], [62, 100], [50, 92]]), "purple"));
  els.push(line(So([[50, 84], [58, 56], [80, 38], [100, 34]]), 0.45));
  for (const [x, y, r] of [[80, 60, 4], [104, 50, 3], [124, 66, 5], [140, 80, 2.6], [64, 78, 2.6]]) els.push(part(circleD(x, y, r), "pink"));
  return mk(els, [30, 16, 140, 176]);
};

A.whale = () => {
  // whale tail diving
  const els = [];
  els.push(part(S([[100, 180], [96, 150], [92, 120], [80, 100], [52, 90], [20, 70], [8, 40, 1], [36, 52], [70, 60], [92, 72], [100, 84, 1], [108, 72], [130, 60], [164, 52], [192, 40, 1], [180, 70], [148, 90], [120, 100], [108, 120], [104, 150]]), "blue"));
  els.push(line(So([[100, 84], [100, 120], [100, 170]]), 0.4));
  for (const sg of [1, -1]) els.push(line(So(sg > 0 ? [[24, 60], [56, 72], [84, 82]] : [[176, 60], [144, 72], [116, 82]]), 0.4));
  els.push(line(So([[40, 186], [70, 180], [100, 186], [130, 180], [160, 186]]), 0.7));
  els.push(line(So([[60, 196], [86, 192], [112, 196], [138, 192]]), 0.5));
  for (const [x, y, r] of [[60, 160, 3], [146, 150, 2.4], [130, 168, 2]]) els.push(part(circleD(x, y, r), "water"));
  return mk(els, [4, 30, 192, 170]);
};

A.bee = () => {
  const els = [];
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    els.push(part(S(X([[96, 86], [70, 52], [36, 40], [22, 58], [40, 82], [80, 96]])), "white"));
    els.push(part(S(X([[96, 100], [64, 104], [42, 124], [54, 138], [80, 124]])), "white"));
    els.push(line(So(X([[94, 90], [64, 66], [36, 54]])), 0.35));
    els.push(line(So(X([[94, 60], [86, 40], [74, 30]])), 0.6));
  }
  els.push(part(S([[100, 88], [118, 100], [122, 130], [112, 160], [100, 176, 1], [88, 160], [78, 130], [82, 100]]), "gold"));
  els.push(dark(S([[80, 112], [100, 116], [120, 112], [122, 124], [100, 128], [78, 124]])));
  els.push(dark(S([[80, 138], [100, 142], [120, 138], [117, 150], [100, 154], [83, 150]])));
  els.push(part(circleD(100, 74, 16), "dark"));
  return mk(els, [16, 26, 168, 152]);
};

A.spider = () => {
  const els = [];
  for (let k = 0; k < 4; k++) for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mx(pts);
    const a = -0.9 + k * 0.6;
    const hip = [100 - 8, 96 + k * 5];
    const knee = [100 - 40, 70 + k * 22];
    const foot = [100 - 62, 92 + k * 26];
    els.push(part(taperSmoothD(X([hip, knee, foot]), (t) => 3 - t * 2, { step: 2 }), "dark"));
  }
  els.push(dark(ellipseD(100, 130, 22, 28)));
  els.push(dark(circleD(100, 92, 13)));
  els.push(part(S([[100, 116], [108, 124], [104, 136], [110, 146], [100, 142], [90, 146], [96, 136], [92, 124]]), "main"));
  return mk(els, [30, 60, 140, 120]);
};

export const ANIMAL_DEFS = A;
