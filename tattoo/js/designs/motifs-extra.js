// Extra object & plant motifs.
import {
  polyD, circleD, ellipseD, arcPts, mirrorPts, mirrorX, petalD, taperSmoothD, starPts, regularPoly, polar, TAU,
  sampleSpline, add, sub, mul, norm, perp, mix, lerp, transformD, M,
} from "./core.js";
import { part, line, dark, shine, shade, mk, S, So, streak, leafEls, MOTIF_DEFS } from "./motifs.js";

const E = {};

export function smallFeather(base, tip, w, role = "main") {
  const L = Math.hypot(tip[0] - base[0], tip[1] - base[1]), u = norm(sub(tip, base)), n = perp(u);
  const els = [part(petalD(add(base, mul(u, L * 0.2)), tip, w, { at: 0.55, tipRound: 0.3 }), role)];
  els.push(line(So([base, tip]), 0.55));
  for (let i = 1; i < 6; i++) {
    const t = 0.3 + i * 0.11, c = add(base, mul(u, L * t));
    for (const sg of [1, -1]) els.push(line(So([c, add(add(c, mul(u, L * 0.08)), mul(n, sg * w * 0.85))]), 0.3));
  }
  return els;
}

E.dreamcatcher = () => {
  const els = [];
  const C = [100, 64], R = 50;
  // hanging strings + feathers
  for (const [x, L, role] of [[70, 74, "blue"], [100, 96, "main"], [130, 74, "blue"]]) {
    const top = [x, C[1] + Math.sqrt(Math.max(0, R * R - (x - 100) ** 2)) - 2];
    const end = [x, top[1] + L * 0.45];
    els.push(line(So([top, end]), 0.5));
    els.push(part(circleD(x, top[1] + L * 0.22, 4), "gold"));
    els.push(...smallFeather(end, [x + (x - 100) * 0.08, end[1] + L * 0.6], 8, role));
  }
  // web
  const N = 8;
  let ring = regularPoly(C[0], C[1], R - 4, N, -Math.PI / 2);
  let web = "";
  for (let k = 0; k < 4; k++) {
    const next = ring.map((p, i) => mix(mix(p, ring[(i + 1) % N], 0.5), C, 0.28));
    for (let i = 0; i < N; i++) web += polyD([ring[i], next[i], ring[(i + 1) % N]], false);
    ring = next;
  }
  els.push(line(web, 0.35));
  els.push(part(circleD(C[0], C[1], 5), "main"));
  els.push(part(circleD(C[0], C[1], R) + circleD(C[0], C[1], R - 6), "brown", { rule: "evenodd" }));
  for (let i = 0; i < 24; i++) { const a = i * TAU / 24; els.push(line(polyD([polar(C[0], C[1], R - 6, a), polar(C[0], C[1], R, a + 0.12)], false), 0.3)); }
  return mk(els, [36, 10, 128, 190]);
};

E.planet = () => {
  const els = [];
  const ringBack = S([[24, 118], [60, 92], [140, 74], [176, 82], [170, 96], [150, 92], [100, 96], [40, 114]]);
  els.push(part(ringBack, "gold"));
  els.push(part(circleD(100, 100, 52), "orange"));
  for (const y of [80, 96, 112]) els.push(line(So([[52, y - 6], [100, y + 4], [148, y - 6]].map((p) => [p[0], p[1]])), 0.35));
  els.push(part(S([[18, 112], [24, 124], [80, 124], [150, 104], [182, 86], [176, 76], [170, 90], [140, 104], [80, 116], [40, 118]]), "gold"));
  els.push(shade(S([[150, 80], [148, 110], [128, 140], [100, 152], [132, 128], [144, 104]])));
  els.push(shine(streak([[64, 78], [72, 64], [86, 56]], 2.6)));
  for (const [x, y, r] of [[38, 46, 8], [164, 150, 6], [150, 36, 4]]) els.push(part(polyD(starPts(x, y, r, r * 0.35, 4)), "gold"));
  return mk(els, [14, 30, 172, 140]);
};

E.paperplane = () => mk([
  part(polyD([[16, 96], [186, 30], [110, 168], [88, 124]]), "white"),
  part(polyD([[88, 124], [186, 30], [96, 152]]), "light"),
  shade(polyD([[88, 124], [96, 152], [104, 140]])),
  line(polyD([[88, 124], [186, 30]], false), 0.5),
  line(So([[60, 150], [40, 160], [20, 156], [8, 170]]), 0.4),
], [6, 24, 184, 152]);

E.cherry = () => {
  const els = [];
  els.push(line(So([[70, 130], [84, 80], [110, 40], [122, 26]]), 0.9));
  els.push(line(So([[132, 140], [128, 90], [118, 50], [122, 26]]), 0.9));
  els.push(...leafEls([122, 28], [168, 16], 14, { curve: -0.1, veins: 3 }));
  for (const [x, y] of [[66, 150], [134, 158]]) {
    els.push(part(S([[x, y - 22], [x + 14, y - 26], [x + 24, y - 10], [x + 18, y + 12], [x, y + 18], [x - 18, y + 12], [x - 24, y - 10], [x - 14, y - 26]]), "main"));
    els.push(shine(streak([[x - 14, y - 4], [x - 12, y - 14], [x - 4, y - 18]], 2.4)));
    els.push(shade(S([[x + 20, y - 8], [x + 16, y + 8], [x, y + 16], [x + 10, y + 4]])));
  }
  return mk(els, [36, 10, 140, 172]);
};

E.mushroom = () => mk([
  part(S([[86, 110, 1], [114, 110, 1], [118, 150], [124, 176], [100, 182], [76, 176], [82, 150]]), "cream"),
  line(So([[90, 140], [100, 146], [110, 140]]), 0.4),
  part(S([[20, 112, 1], [26, 76], [54, 40], [100, 24], [146, 40], [174, 76], [180, 112, 1], [140, 116], [100, 118], [60, 116]]), "main"),
  ...[[60, 68, 10], [100, 46, 9], [138, 66, 11], [96, 88, 7], [40, 96, 6], [162, 98, 6]].map(([x, y, r]) => part(ellipseD(x, y, r, r * 0.8), "white")),
  shade(S([[150, 50], [172, 80], [176, 108], [150, 112], [162, 86]])),
  line(So([[30, 190], [70, 182], [130, 182], [170, 190]]), 0.6),
], [16, 20, 168, 172]);

E.web = () => {
  const els = [];
  const C = [40, 40], N = 7;
  let d = "";
  const spokes = [];
  for (let i = 0; i < N; i++) { const a = -0.15 + i * (Math.PI / 2 + 0.3) / (N - 1); spokes.push(a); d += polyD([C, polar(C[0], C[1], 170, a)], false); }
  for (let r = 24; r < 170; r += 22) {
    for (let i = 0; i < N - 1; i++) {
      const p = polar(C[0], C[1], r, spokes[i]), q = polar(C[0], C[1], r, spokes[i + 1]), m = mix(mix(p, q, 0.5), C, 0.07);
      d += So([p, m, q]);
    }
  }
  els.push(line(d, 0.5));
  els.push(line(So([[146, 140], [146, 168]]), 0.4));
  els.push(dark(ellipseD(146, 176, 7, 9)), dark(circleD(146, 165, 4.5)));
  for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) els.push(line(So([[146, 172 + k * 2], [146 + sg * 12, 164 + k * 6], [146 + sg * 16, 176 + k * 7]]), 0.4));
  return mk(els, [10, 10, 190, 190]);
};

E.daisy = () => {
  const els = [];
  for (let i = 0; i < 18; i++) { const a = i * TAU / 18; els.push(part(petalD(polar(100, 100, 18, a), polar(100, 100, 86, a), 11, { at: 0.6, tipRound: 0.35 }), "white")); els.push(line(So([polar(100, 100, 30, a), polar(100, 100, 66, a)]), 0.3)); }
  els.push(part(circleD(100, 100, 24), "gold"));
  const dots = [];
  for (let i = 0; i < 40; i++) { const r = 3 * Math.sqrt(i), a = i * 2.4; if (r < 20) dots.push(circleD(...polar(100, 100, r, a), 1.2)); }
  els.push(dark(dots.join("")));
  return mk(els, [10, 10, 180, 180]);
};

E.laurel = () => {
  const els = [];
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mirrorX(pts);
    const stem = X(arcPts(100, 100, 74, Math.PI * 0.62, Math.PI * 1.38, 24));
    els.push(line(polyD(stem, false), 0.8));
    for (let i = 2; i < stem.length; i += 2) {
      const p = stem[i], q = stem[i - 1], u = norm(sub(p, q)), n = perp(u);
      for (const side of [1, -1]) {
        const tip = add(add(p, mul(u, 18)), mul(n, side * 12 * sg));
        els.push(part(petalD(p, tip, 5.5, { curve: side * 0.08 }), "leaf"));
      }
    }
  }
  return mk(els, [14, 14, 172, 172]);
};

E.lavender = () => {
  const els = [];
  for (const [x0, x1, top] of [[96, 70, 40], [100, 104, 20], [104, 134, 44]]) {
    els.push(line(So([[100, 190], [lerp(x0, x1, 0.4), 120], [x1, top + 50]]), 0.7));
    for (let k = 0; k < 9; k++) {
      const y = top + k * 6.5, x = x1 + (x1 - 100) * -0.05 * k;
      for (const sg of [1, -1]) els.push(part(ellipseD(x + sg * 4, y, 4.2, 6, sg * 0.5), "purple"));
    }
  }
  els.push(...leafEls([100, 186], [70, 150], 6, { veins: 0 }), ...leafEls([100, 186], [132, 156], 6, { veins: 0 }));
  return mk(els, [50, 12, 100, 180]);
};

E.sacredheart = () => {
  const els = [];
  // flames on top
  els.push(part(S([[86, 52], [80, 30], [92, 12, 1], [94, 30], [102, 22], [104, 2, 1], [114, 24], [112, 40], [122, 28, 1], [124, 46], [114, 58]]), "fire"));
  els.push(part(S([[92, 52], [92, 36], [100, 28, 1], [104, 40], [112, 40, 1], [110, 54]]), "fire2"));
  const H = MOTIF_DEFS.heart().els.map((e) => ({ ...e, d: transformD(e.d, M.chain(M.t(100, 120), M.s(0.78), M.t(-100, -100))) }));
  els.push(...H);
  // thorn band
  const band = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30; band.push([26 + t * 148, 108 + Math.sin(t * Math.PI * 2) * 4]); }
  els.push(line(So(band.filter((_, i) => i % 3 === 0)), 0.8));
  els.push(line(So(band.filter((_, i) => i % 3 === 0).map((p) => [p[0], p[1] + 6])), 0.8));
  for (let i = 0; i < 9; i++) { const x = 34 + i * 16; els.push(line(polyD([[x, 108], [x + (i % 2 ? 6 : -6), 98]], false), 0.6)); }
  // cross on top of flames? small dagger through: rays
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.35; els.push(line(polyD([polar(100, 108, 92, a), polar(100, 108, 102, a)], false), 0.5)); }
  return mk(els, [6, -6, 188, 190]);
};

E.candle = () => mk([
  part(S([[70, 70, 1], [130, 70, 1], [130, 176, 1], [70, 176, 1]]), "cream"),
  part(S([[70, 70], [84, 74], [90, 96], [96, 76], [130, 70, 1], [130, 78], [70, 80]]), "white"),
  line(So([[100, 70], [100, 60]]), 0.7),
  part(S([[100, 58], [90, 46], [92, 30], [100, 14, 1], [108, 30], [110, 46]]), "fire2"),
  part(S([[100, 56], [95, 46], [100, 32, 1], [105, 46]]), "white"),
  part(S([[52, 176, 1], [148, 176, 1], [156, 188, 1], [44, 188, 1]]), "gold"),
  shine(streak([[78, 96], [78, 130], [78, 166]], 2)),
], [40, 10, 120, 182]);

E.swords = () => {
  const one = MOTIF_DEFS.dagger().els;
  const a = one.map((e) => ({ ...e, d: transformD(e.d, M.rc(0.62, 100, 100)) }));
  const b = one.map((e) => ({ ...e, d: transformD(e.d, M.rc(-0.62, 100, 100)) }));
  return mk([...a, ...b], [6, 6, 188, 188]);
};

E.ship = () => {
  const els = [];
  els.push(line(So([[10, 168], [40, 160], [70, 168], [100, 160], [130, 168], [160, 160], [190, 168]]), 0.8));
  els.push(part(S([[30, 134, 1], [170, 134, 1], [156, 162], [44, 162]]), "brown"));
  for (let x = 54; x < 150; x += 20) els.push(part(circleD(x, 146, 3.2), "dark"));
  els.push(line(polyD([[100, 134], [100, 20]], false), 1), line(polyD([[60, 134], [60, 50]], false), 0.9), line(polyD([[140, 134], [140, 56]], false), 0.9));
  for (const [x, y0, h, w] of [[100, 28, 46, 30], [100, 80, 42, 34], [60, 58, 34, 22], [60, 96, 30, 26], [140, 64, 30, 22], [140, 98, 28, 24]]) {
    els.push(part(S([[x - w, y0, 1], [x + w, y0, 1], [x + w * 0.9, y0 + h * 0.6], [x + w * 1.05, y0 + h, 1], [x - w * 1.05, y0 + h, 1], [x - w * 0.9, y0 + h * 0.6]]), "cream"));
  }
  els.push(part(polyD([[100, 20], [124, 14], [100, 8]]), "main"));
  return mk(els, [6, 4, 188, 168]);
};

E.semicolon = () => mk([
  part(circleD(100, 56, 20), "dark"),
  part(S([[84, 120], [100, 108], [116, 116], [118, 136], [108, 160], [88, 184, 1], [98, 158], [96, 144], [84, 136]]), "dark"),
], [60, 30, 80, 160]);

E.music = () => mk([
  part(ellipseD(66, 152, 20, 14, -0.4), "dark"),
  part(ellipseD(146, 132, 20, 14, -0.4), "dark"),
  part(S([[80, 148, 1], [80, 50, 1], [164, 30, 1], [164, 128, 1], [158, 128, 1], [158, 60, 1], [86, 78, 1], [86, 148, 1]]), "dark"),
], [40, 24, 132, 150]);

E.cactus = () => mk([
  part(S([[86, 180, 1], [86, 40], [100, 24], [114, 40], [114, 180, 1]]), "leaf"),
  part(S([[86, 120], [60, 116], [52, 96], [52, 66], [60, 58], [68, 66], [68, 98], [86, 102]]), "leaf"),
  part(S([[114, 100], [136, 98], [144, 80], [144, 56], [136, 48], [128, 56], [128, 82], [114, 86]]), "leaf"),
  line(So([[100, 40], [100, 176]]), 0.4), line(So([[60, 70], [60, 100]]), 0.35), line(So([[136, 58], [136, 86]]), 0.35),
  part(S([[70, 180, 1], [130, 180, 1], [124, 196, 1], [76, 196, 1]]), "orange"),
  part(polyD(starPts(100, 24, 10, 4, 5)), "pink"),
], [40, 10, 120, 190]);

export const EXTRA_DEFS = E;
