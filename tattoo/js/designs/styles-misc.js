// Symbols, compass, sun & moon, zodiac/constellations, abstract brush.
import {
  INK, f1, f2, smooth, polyD, circleD, arcPts, regularPoly, starPts, polar, TAU, makeRng, makeNoise, petalD, taperSmoothD,
  sampleSpline, add, sub, mul, norm, perp, mix, lerp, clamp, M, transformD, resample, dotsPath, inPolys,
} from "./core.js";
import { renderScene, sceneBBox, tfEls, compose, PALETTES } from "./render.js";
import { getMotif } from "./library.js";
import { crescentPts } from "./motifs.js";
import { textD } from "./fonts.js";
import { seedOpt, weightOpt, colorOpt, rangeOpt, boolOpt, selectOpt } from "./opts.js";

const C = 500;
const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d) => ({ t: "dark", d });
const BOX = [0, 0, 1000, 1000];
const sceneOut = (ctx, els, o, mode = "line", extra = {}) => { const scene = { box: BOX, els }; return { body: renderScene(ctx, scene, mode, { w: o.weight, color: o.color, bold: 1, ...extra }), bbox: sceneBBox(scene, o.weight * 2 + 10) }; };
const heartD = (x, y, s) => `M${f1(x)} ${f1(y - s * 0.35)}C${f1(x)} ${f1(y - s)} ${f1(x - s)} ${f1(y - s)} ${f1(x - s)} ${f1(y - s * 0.3)}C${f1(x - s)} ${f1(y + s * 0.25)} ${f1(x - s * 0.35)} ${f1(y + s * 0.55)} ${f1(x)} ${f1(y + s)}C${f1(x + s * 0.35)} ${f1(y + s * 0.55)} ${f1(x + s)} ${f1(y + s * 0.25)} ${f1(x + s)} ${f1(y - s * 0.3)}C${f1(x + s)} ${f1(y - s)} ${f1(x)} ${f1(y - s)} ${f1(x)} ${f1(y - s * 0.35)}Z`;
const sparkle = (x, y, r) => dark(smooth([[x, y - r, 1], [x + r * 0.15, y - r * 0.15], [x + r, y, 1], [x + r * 0.15, y + r * 0.15], [x, y + r, 1], [x - r * 0.15, y + r * 0.15], [x - r, y, 1], [x - r * 0.15, y - r * 0.15]], true));

// ======================================================================== ZODIAC
const So = (p) => smooth(p, false);
const GLYPHS = {
  aries: () => [So([[100, 172], [100, 96], [90, 56], [66, 40], [44, 50], [40, 72], [54, 84]]), So([[100, 96], [110, 56], [134, 40], [156, 50], [160, 72], [146, 84]])],
  taurus: () => [circleD(100, 128, 40), polyD(arcPts(100, 36, 58, 0.25, Math.PI - 0.25, 24), false)],
  gemini: () => [polyD([[78, 56], [78, 144]], false), polyD([[122, 56], [122, 144]], false), So([[46, 42], [100, 58], [154, 42]]), So([[46, 158], [100, 142], [154, 158]])],
  cancer: () => [circleD(64, 80, 18), So([[64, 62], [104, 52], [148, 62], [166, 84]]), circleD(136, 120, 18), So([[136, 138], [96, 148], [52, 138], [34, 116]])],
  leo: () => [circleD(70, 98, 22), So([[90, 92], [94, 58], [120, 40], [146, 56], [144, 96], [128, 140], [136, 164], [160, 160]])],
  virgo: () => [So([[36, 58], [42, 66], [42, 150]]), So([[42, 82], [56, 60], [72, 72], [72, 150]]), So([[72, 82], [86, 60], [102, 72], [102, 150]]), So([[102, 82], [116, 60], [132, 72], [130, 128], [116, 168]]), So([[130, 104], [156, 100], [160, 124], [140, 142], [108, 150]])],
  libra: () => [polyD([[36, 152], [164, 152]], false), So([[36, 122], [74, 122], [68, 98], [80, 74], [100, 66], [120, 74], [132, 98], [126, 122], [164, 122]])],
  scorpio: () => [So([[30, 58], [38, 66], [38, 150]]), So([[38, 82], [52, 60], [68, 72], [68, 150]]), So([[68, 82], [82, 60], [98, 72], [98, 150]]), So([[98, 82], [112, 60], [128, 72], [128, 140], [144, 158], [170, 146]]), polyD([[154, 138], [172, 145], [164, 162]], false)],
  sagittarius: () => [polyD([[48, 162], [156, 54]], false), polyD([[112, 54], [156, 54], [156, 98]], false), polyD([[68, 102], [112, 146]], false)],
  capricorn: () => [So([[34, 66], [48, 58], [60, 76], [64, 150]]), So([[64, 150], [78, 92], [98, 66], [116, 72], [122, 108], [122, 138], [138, 160], [158, 150], [156, 128], [136, 124], [122, 140], [110, 170], [92, 182]])],
  aquarius: () => [polyD([[36, 92], [57, 70], [79, 92], [100, 70], [121, 92], [143, 70], [164, 92]], false), polyD([[36, 132], [57, 110], [79, 132], [100, 110], [121, 132], [143, 110], [164, 132]], false)],
  pisces: () => [So(arcPts(-14, 100, 84, -0.9, 0.9, 14)), So(arcPts(214, 100, 84, Math.PI - 0.9, Math.PI + 0.9, 14)), polyD([[44, 100], [156, 100]], false)],
};
// [x, y, mag(0 dim,1 bright)], edges
const CONST = {
  aries: { s: [[36, 124, 1], [104, 92, 1], [138, 96, 0], [160, 114, 0]], e: [[0, 1], [1, 2], [2, 3]] },
  taurus: { s: [[106, 114, 1], [94, 100, 0], [84, 92, 0], [98, 88, 0], [168, 46, 1], [150, 24, 0], [64, 134, 0], [36, 152, 0], [40, 60, 0], [46, 54, 0], [34, 54, 0], [42, 48, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 1], [0, 4], [3, 5], [2, 6], [6, 7]] },
  gemini: { s: [[70, 28, 1], [66, 78, 0], [60, 128, 0], [50, 172, 0], [36, 92, 0], [112, 38, 1], [116, 88, 0], [122, 136, 0], [132, 174, 0], [150, 100, 0]], e: [[0, 1], [1, 2], [2, 3], [1, 4], [5, 6], [6, 7], [7, 8], [6, 9], [1, 6]] },
  cancer: { s: [[100, 100, 0], [100, 46, 0], [60, 162, 1], [152, 170, 1]], e: [[0, 1], [0, 2], [0, 3]] },
  leo: { s: [[58, 142, 1], [62, 110, 0], [78, 84, 0], [100, 80, 0], [110, 60, 0], [94, 42, 0], [132, 104, 0], [172, 122, 1], [140, 142, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 6], [6, 7], [7, 8], [8, 0]] },
  virgo: { s: [[112, 172, 1], [100, 122, 0], [70, 102, 0], [38, 80, 0], [122, 90, 0], [154, 60, 0], [132, 36, 0], [86, 142, 0]], e: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [4, 6], [1, 7]] },
  libra: { s: [[100, 38, 1], [58, 90, 1], [142, 100, 0], [80, 152, 0], [152, 162, 0]], e: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4]] },
  scorpio: { s: [[36, 38, 0], [50, 60, 0], [44, 82, 0], [80, 92, 1], [96, 112, 0], [104, 136, 0], [110, 160, 0], [128, 176, 0], [152, 174, 0], [164, 156, 0], [156, 138, 1]], e: [[0, 1], [2, 1], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]] },
  sagittarius: { s: [[62, 120, 0], [92, 108, 1], [102, 142, 0], [70, 152, 0], [112, 78, 0], [134, 108, 1], [30, 100, 0], [160, 98, 0], [166, 132, 0], [134, 142, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 2], [0, 6], [5, 7], [7, 8], [8, 9], [9, 2]] },
  capricorn: { s: [[38, 60, 1], [60, 80, 0], [110, 132, 0], [150, 112, 0], [172, 80, 1], [140, 90, 0], [100, 100, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] },
  aquarius: { s: [[36, 60, 1], [70, 80, 0], [100, 68, 1], [122, 100, 0], [110, 132, 0], [142, 152, 0], [90, 162, 0], [58, 132, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [6, 7]] },
  pisces: { s: [[100, 172, 1], [72, 120, 0], [48, 76, 0], [34, 52, 0], [46, 34, 0], [64, 46, 0], [130, 160, 0], [160, 142, 0], [176, 122, 0], [168, 104, 0], [150, 116, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2], [0, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 7]] },
  orion: { s: [[70, 40, 1], [130, 46, 0], [100, 22, 0], [88, 102, 0], [100, 98, 0], [112, 94, 0], [76, 160, 0], [132, 164, 1]], e: [[2, 0], [2, 1], [0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7]] },
  "big-dipper": { s: [[24, 62, 0], [64, 58, 0], [96, 72, 0], [122, 90, 1], [128, 130, 0], [180, 130, 0], [178, 92, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  cassiopeia: { s: [[28, 78, 1], [66, 122, 0], [100, 92, 1], [138, 122, 0], [174, 70, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  "little-dipper": { s: [[36, 40, 1], [66, 58, 0], [96, 70, 0], [118, 92, 0], [152, 92, 1], [160, 124, 0], [124, 124, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
};
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];

function zodiacEls(o, rng) {
  const els = [];
  const sign = o.sign;
  const hasGlyph = GLYPHS[sign] && (o.show === "glyph" || o.show === "both");
  const hasConst = CONST[sign] && (o.show === "constellation" || o.show === "both" || !GLYPHS[sign]);
  const frame = o.frame;
  if (frame === "circle") { els.push(line(circleD(C, C, 430), 0.8), line(circleD(C, C, 410), 0.4)); for (let i = 0; i < 72; i++) { const a = i * TAU / 72; els.push(line(polyD([polar(C, C, 410, a), polar(C, C, i % 6 ? 398 : 388, a)], false), 0.35)); } }
  else if (frame === "arch") els.push(line(polyD([[200, 900], ...arcPts(C, 400, 300, Math.PI, TAU, 40), [800, 900], [200, 900]], false), 0.8));
  else if (frame === "moon") els.push(line(polyD(crescentPts([C, C], 430, [C + 140, C - 90], 400, 60)), 0.8));
  if (hasConst) {
    const cs = CONST[sign];
    const sc = hasGlyph ? 2.4 : 3.6, ox = C - 100 * sc, oy = (hasGlyph ? 380 : C) - 100 * sc;
    const P = (p) => [ox + p[0] * sc, oy + p[1] * sc];
    for (const [a, b] of cs.e) {
      const A = P(cs.s[a]), B = P(cs.s[b]), u = norm(sub(B, A)), gap = 16;
      els.push(line(polyD([add(A, mul(u, gap)), sub(B, mul(u, gap))], false), 0.45));
    }
    for (const s of cs.s) { const p = P(s); els.push(s[2] ? sparkle(p[0], p[1], 22) : dark(circleD(p[0], p[1], 7))); }
  }
  if (hasGlyph) {
    const sc = hasConst ? 1.3 : 3.2, cy = hasConst ? 760 : C;
    for (const d of GLYPHS[sign]()) els.push(line(transformD(d, M.chain(M.t(C, cy), M.s(sc), M.t(-100, -100))), hasConst ? 1.1 : 1.6));
  }
  if (o.stars) for (let i = 0; i < 9; i++) { const a = rng() * TAU, r = 300 + rng() * 90; const p = polar(C, C, r, a); els.push(rng() < 0.4 ? sparkle(p[0], p[1], 10 + rng() * 10) : dark(circleD(p[0], p[1], 3 + rng() * 3))); }
  return els;
}

// ======================================================================== SYMBOLS
function symbolEls(o, rng) {
  const els = [];
  const s = o.symbol;
  if (s === "heartbeat") {
    const y = 500;
    const pts = [[60, y], [300, y], [330, y - 30], [360, y], [390, y], [420, y + 40], [460, y - 210], [500, y + 120], [530, y], [570, y], [600, y - 40], [640, y], [700, y]];
    els.push(line(polyD(pts, false), 1));
    if (o.accent) { els.push(line(heartD(790, y - 10, 70), 1)); els.push(line(polyD([[860, y], [940, y]], false), 1)); els.push(line(polyD([[700, y], [722, y]], false), 1)); }
    else els.push(line(polyD([[700, y], [940, y]], false), 1));
  } else if (s === "mountains") {
    const pts = [[80, 700], [300, 360, 1], [400, 500, 1], [540, 260, 1], [700, 520, 1], [780, 430, 1], [920, 700]];
    els.push(line(polyD(pts, false), 1));
    els.push(line(polyD([[470, 380], [500, 400], [540, 360], [580, 400], [610, 380]], false), 0.7));
    els.push(line(polyD([[60, 700], [940, 700]], false), 1));
    if (o.accent) els.push(line(circleD(770, 260, 50), 0.9));
  } else if (s === "waves") {
    for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 60; i++) { const x = 100 + i * 13.3; pts.push([x, 400 + k * 90 + Math.sin(i / 60 * TAU * 2 + k * 0.8) * 34]); } els.push(line(smooth(pts.filter((_, i) => i % 3 === 0), false), 1)); }
    if (o.accent) els.push(line(circleD(500, 250, 70), 0.9));
  } else if (s === "moon-phases") {
    const n = 7, r = 52, gap = 130;
    for (let i = 0; i < n; i++) {
      const x = C + (i - (n - 1) / 2) * gap, y = 500, f = i / (n - 1);
      if (i === (n - 1) / 2) { els.push(dark(circleD(x, y, r))); continue; }
      els.push(line(circleD(x, y, r), 0.6));
      const lit = Math.abs(f - 0.5) * 2;               // 1 at ends (new), 0 middle (full)
      if (lit > 0.95) continue;
      const k = (1 - lit) * 2 - 1;                       // -1 crescent .. 1 gibbous
      const side = f < 0.5 ? 1 : -1;
      const pts = [...arcPts(x, y, r, -Math.PI / 2, Math.PI / 2, 16).map((p) => [x + (p[0] - x) * side, p[1]])];
      for (let j = 16; j >= 0; j--) { const t = j / 16, yy = y - r + 2 * r * t, xx = Math.sqrt(Math.max(0, r * r - (yy - y) ** 2)); pts.push([x - side * xx * k, yy]); }
      els.push(dark(polyD(pts)));
    }
    if (o.accent) els.push(line(polyD([[C - 3.6 * gap, 600], [C + 3.6 * gap, 600]], false), 0.5));
  } else if (s === "arrow") {
    els.push(line(polyD([[80, 500], [900, 500]], false), 1));
    els.push(line(polyD([[860, 470], [920, 500], [860, 530]], false), 1));
    for (let i = 0; i < 4; i++) { const x = 100 + i * 30; els.push(line(polyD([[x, 500], [x - 40, 450]], false), 0.8), line(polyD([[x, 500], [x - 40, 550]], false), 0.8)); }
    if (o.accent) for (let i = 0; i < 3; i++) els.push(dark(circleD(400 + i * 60, 470 - i * 8, 6 - i * 1.5)));
  } else if (s === "infinity") {
    const pts = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120 * TAU, sn = Math.sin(t), cs = Math.cos(t); pts.push([C + 330 * cs / (1 + sn * sn), C + 330 * sn * cs / (1 + sn * sn)]); }
    els.push(line(polyD(pts, false), 1));
    if (o.accent) els.push(line(heartD(C + 230, C - 150, 40), 0.8));
  } else if (s === "semicolon") {
    els.push(...compose([{ m: getMotif("semicolon"), x: C, y: C, size: 520 }], BOX).els.map((e) => ({ ...e, t: "dark" })));
    if (o.accent) els.push(line(heartD(C + 150, C - 150, 40), 0.8));
  } else if (s === "mountain-circle") {
    els.push(line(circleD(C, C, 330), 1));
    els.push(line(polyD([[200, 620], [380, 380, 1], [450, 470, 1], [560, 300, 1], [700, 520, 1], [800, 620]], false), 1));
    els.push(line(polyD([[170, 620], [830, 620]], false), 1));
    for (let k = 0; k < 2; k++) { const pts = []; for (let i = 0; i <= 20; i++) pts.push([260 + i * 24, 680 + k * 40 + Math.sin(i * 0.9) * 8]); els.push(line(smooth(pts, false), 0.7)); }
    if (o.accent) els.push(line(circleD(690, 360, 34), 0.8));
  } else if (s === "sunrise") {
    els.push(line(polyD([[100, 620], [900, 620]], false), 1));
    els.push(line(polyD(arcPts(C, 620, 180, Math.PI, TAU, 40), false), 1));
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; els.push(line(polyD([polar(C, 620, 220, a), polar(C, 620, i % 2 ? 290 : 330, a)], false), 0.9)); }
    for (let k = 0; k < 2; k++) els.push(line(polyD([[260 + k * 60, 680 + k * 40], [740 - k * 60, 680 + k * 40]], false), 0.7));
  } else if (s === "paper-plane") {
    els.push(...compose([{ m: getMotif("paperplane"), x: 720, y: 330, size: 300, only: (e) => e.t !== "line" || e.w > 0.45 }], BOX).els);
    const path = sampleSpline([[100, 820], [300, 760], [380, 600], [260, 560], [300, 680], [480, 640], [600, 440]], false, 10);
    let d = "";
    const rs = resample(path, 26);
    for (let i = 0; i < rs.length - 1; i += 2) d += polyD([rs[i], rs[i + 1]], false);
    els.push(line(d, 0.8));
  } else if (s === "lotus-line") {
    els.push(...compose([{ m: getMotif("lotus"), x: C, y: C, size: 640 }], BOX).els.map((e) => (e.t === "part" ? { ...e, role: "white" } : e)));
  } else if (s === "wave-circle") {
    els.push(line(circleD(C, C, 300), 1));
    const pts = [[200, 560], [300, 520], [380, 420], [470, 380], [540, 420], [520, 480], [470, 470]];
    els.push(line(smooth(pts, false), 1));
    els.push(line(smooth([[470, 470], [520, 520], [640, 540], [800, 520]], false), 1));
    els.push(line(polyD([[210, 640], [790, 640]], false), 0.7));
  }
  return els;
}

// ======================================================================== COMPASS
function compassEls(o) {
  const els = [];
  const R = 330;
  const ornate = o.style === "ornate", globe = o.style === "globe";
  if (globe || o.map) {
    for (let k = 1; k < 6; k++) { const rx = R * Math.cos(k / 6 * Math.PI / 2 * 2 - Math.PI / 2 * 0) * 0 + R * (k / 6); els.push(line(polyD(arcPts(0, 0, 1, 0, TAU, 60).map((p) => [C + p[0] * R * Math.sin(k / 6 * Math.PI), C + p[1] * R])), 0.35)); }
    for (let k = -2; k <= 2; k++) { const y = C + k * R / 3, hw = Math.sqrt(R * R - (y - C) ** 2); els.push(line(polyD([[C - hw, y], [C + hw, y]], false), 0.35)); }
  }
  els.push(line(circleD(C, C, R + 40), 0.9), line(circleD(C, C, R + 26), 0.45));
  for (let i = 0; i < 72; i++) { const a = i * TAU / 72; els.push(line(polyD([polar(C, C, R + 26, a), polar(C, C, R + (i % 2 ? 16 : 6), a)], false), 0.35)); }
  if (ornate) { els.push(line(circleD(C, C, R + 70), 0.6)); for (let i = 0; i < 16; i++) { const a = i * TAU / 16; els.push(dark(circleD(...polar(C, C, R + 56, a + TAU / 32), 5))); } }
  const n = Math.round(Number(o.points));
  const rose = (r1, r2, k, rot0, wMul) => {
    const tips = regularPoly(C, C, r1, k, rot0), inn = regularPoly(C, C, r2, k, rot0 + Math.PI / k);
    for (let i = 0; i < k; i++) { els.push(part(polyD([[C, C], inn[(i + k - 1) % k], tips[i]]), "white")); els.push(dark(polyD([[C, C], tips[i], inn[i]]))); }
  };
  if (n >= 16) rose(R * 0.62, R * 0.1, 8, -Math.PI / 2 + Math.PI / 8);
  if (n >= 8) rose(R * 0.78, R * 0.14, 4, -Math.PI / 4);
  rose(R * 1.02, R * 0.16, 4, -Math.PI / 2);
  els.push(part(circleD(C, C, 16), "gold"), dark(circleD(C, C, 6)));
  if (o.letters) {
    const lab = [["N", 0], ["E", 1], ["S", 2], ["W", 3]];
    for (const [ch, k] of lab) {
      const a = -Math.PI / 2 + k * Math.PI / 2, p = polar(C, C, R + 110, a);
      const t = textD(ch, "western", 80, p[0], p[1] + 28);
      els.push(dark(t.d));
    }
  } else els.push(line(polyD([[C, C - R - 110], [C, C - R - 60]], false), 0.8));
  return els;
}

// ======================================================================== SUN & MOON
function sunMoonEls(o, rng) {
  const els = [];
  const v = o.variant, n = Math.round(o.rays);
  const shade = o.shading;
  const fillRole = shade === "solid" ? { fill: "solid" } : shade === "dots" ? { fill: "dots" } : {};
  if (v === "sun-moon") {
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i + 0.5) * Math.PI / n, long = i % 2 === 0;
      els.push(part(polyD([polar(C, C, 250, a - 0.06), polar(C, C, long ? 420 : 340, a), polar(C, C, 250, a + 0.06)]), "gold", long ? fillRole : {}));
    }
    els.push(part(circleD(C, C, 240), "gold"));
    els.push(part(polyD([...arcPts(C, C, 240, -Math.PI / 2, Math.PI / 2, 30), ...arcPts(C, C, 240, Math.PI / 2, Math.PI * 1.5, 30).map((p) => p)]) , "gold"));
    els.push(part(polyD(arcPts(C, C, 240, -Math.PI / 2, Math.PI / 2, 40)), "blue", fillRole));
    els.push(part(polyD(crescentPts([C + 80, C], 130, [C + 140, C - 40], 110, 40)), "white"));
    for (const [x, y, r] of [[C + 150, C - 140, 18], [C + 190, C + 100, 12], [C + 60, C + 170, 9]]) els.push(sparkle(x, y, r));
    els.push(line(polyD([[C, C - 240], [C, C + 240]], false), 0.8));
    for (let i = 0; i < 5; i++) { const a = Math.PI * 0.6 + i * 0.2; els.push(dark(circleD(...polar(C, C, 200, a), 4))); }
  } else if (v === "eclipse") {
    for (let i = 0; i < n * 2; i++) { const a = i * TAU / (n * 2); els.push(line(polyD([polar(C, C, 290, a), polar(C, C, i % 3 === 0 ? 450 : i % 3 === 1 ? 380 : 340, a)], false), i % 3 === 0 ? 0.8 : 0.45)); }
    els.push(part(circleD(C, C, 260), "main", { fill: "dots" }));
    els.push(dark(circleD(C + 20, C - 10, 236)));
    els.push(line(circleD(C, C, 285), 0.4));
  } else if (v === "phases") {
    els.push(part(circleD(C, C, 150), "gold", fillRole));
    for (let i = 0; i < n / 2; i++) { const a = i * TAU / (n / 2); els.push(line(polyD([polar(C, C, 175, a), polar(C, C, 215, a)], false), 0.7)); }
    const k = 7;
    for (let i = 0; i < k; i++) {
      const a = Math.PI * 1.1 + i * Math.PI * 0.8 / (k - 1), p = polar(C, C, 340, a), r = 42, f = i / (k - 1);
      els.push(line(circleD(p[0], p[1], r), 0.6));
      const lit = Math.abs(f - 0.5) * 2;
      if (lit > 0.95) continue;
      const kk = (1 - lit) * 2 - 1, side = f < 0.5 ? 1 : -1;
      const pts = [...arcPts(p[0], p[1], r, -Math.PI / 2, Math.PI / 2, 14).map((q) => [p[0] + (q[0] - p[0]) * side, q[1]])];
      for (let j = 14; j >= 0; j--) { const t = j / 14, yy = p[1] - r + 2 * r * t, xx = Math.sqrt(Math.max(0, r * r - (yy - p[1]) ** 2)); pts.push([p[0] - side * xx * kk, yy]); }
      els.push(dark(polyD(pts)));
    }
  } else if (v === "crescent-stars") {
    els.push(part(polyD(crescentPts([C, C], 300, [C + 120, C - 70], 270, 60)), "gold", fillRole));
    for (const [x, len, r] of [[C + 60, 140, 24], [C + 140, 220, 16], [C + 210, 120, 12]]) { els.push(line(polyD([[x, C - 260 + (x - C) * 0.3], [x, C - 260 + (x - C) * 0.3 + len]], false), 0.45)); els.push(sparkle(x, C - 260 + (x - C) * 0.3 + len + r, r)); }
    for (let i = 0; i < 6; i++) { const p = polar(C, C, 330, Math.PI * 0.7 + i * 0.12); els.push(dark(circleD(p[0], p[1], 6 - i * 0.6))); }
  } else {
    // geometric sun
    els.push(line(circleD(C, C, 120), 1), line(circleD(C, C, 100), 0.5), part(circleD(C, C, 70), "gold", fillRole));
    for (let i = 0; i < n; i++) { const a = i * TAU / n; els.push(line(polyD([polar(C, C, 140, a), polar(C, C, i % 2 ? 300 : 400, a)], false), i % 2 ? 0.5 : 0.9)); if (i % 2 === 0) els.push(dark(circleD(...polar(C, C, 420, a), 6))); }
    els.push(line(circleD(C, C, 330), 0.4));
    els.push(line(polyD(regularPoly(C, C, 200, 3)), 0.5), line(polyD(regularPoly(C, C, 200, 3, Math.PI / 2)), 0.5));
  }
  return els;
}

// ======================================================================== BRUSH
function brushStroke(pts, w, rng, { dry = true } = {}) {
  const shapes = [];
  shapes.push(taperSmoothD(pts, (t) => w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.6), { step: 6 }));
  if (dry) {
    // bristle streaks fraying the tail
    const sp = resample(sampleSpline(pts, false, 14), 4);
    const n = sp.length;
    for (let k = 0; k < 9; k++) {
      const off = (k / 8 - 0.5) * w * 1.3;
      const s0 = Math.floor(n * (0.55 + rng() * 0.3)), s1 = Math.min(n - 1, s0 + Math.floor(n * (0.12 + rng() * 0.25)));
      const seg = [];
      for (let i = s0; i <= s1; i++) { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)], nn = perp(norm(sub(b, a))); seg.push(add(sp[i], mul(nn, off))); }
      if (seg.length > 2) shapes.push(taperSmoothD(seg, (t) => (1.5 + rng() * 3) * (1 - t * 0.7), { step: 4, spline: false }));
    }
  }
  return shapes;
}
function brushShapes(o, rng) {
  const sh = [];
  const w = 40 * o.thickness;
  if (o.shape === "enso") {
    const a0 = -Math.PI * 0.35 + rng() * 0.3, span = TAU * (0.86 + rng() * 0.08);
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(polar(C, C, 330 + Math.sin(t * Math.PI * 2) * 12 + (rng() - 0.5) * 6, a0 + span * t)); }
    sh.push(...brushStroke(pts, w, rng));
  } else if (o.shape === "strokes") {
    for (let i = 0; i < 3; i++) { const y = 340 + i * 150 + (rng() - 0.5) * 50; sh.push(...brushStroke([[150 + rng() * 60, y + 30], [400, y - 10], [650, y + (rng() - 0.5) * 40], [860 - rng() * 60, y - 30]], w * (1 - i * 0.2), rng)); }
  } else if (o.shape === "heart") {
    const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30 * TAU * 0.96 + 0.1, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); pts.push([C + x * 20, C - y * 20]); }
    sh.push(...brushStroke(pts, w * 0.9, rng));
  } else if (o.shape === "cross") {
    sh.push(...brushStroke([[260, 230], [500, 480], [760, 770]], w, rng), ...brushStroke([[770, 230], [520, 470], [250, 760]], w, rng));
  } else {
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([140 + t * 720, 520 - Math.sin(t * Math.PI * 1.5) * 160 * (1 - t * 0.3)]); }
    sh.push(...brushStroke(pts, w, rng));
    const curl = []; for (let i = 0; i <= 14; i++) { const t = i / 14; curl.push(polar(650, 380, 90 * (1 - t * 0.7), -Math.PI / 2 + t * TAU * 0.85)); }
    sh.push(...brushStroke(curl, w * 0.6, rng, { dry: false }));
  }
  return sh;
}

export const MISC_STYLES = [
  {
    id: "minimal-symbols", name: "Minimal symbols", category: "Line",
    description: "Tiny meaningful line symbols: heartbeat, mountains, waves, moon phases, arrow, infinity, semicolon…",
    options: [selectOpt("symbol", "Symbol", ["heartbeat", "mountains", "waves", "moon-phases", "arrow", "infinity", "semicolon", "mountain-circle", "sunrise", "paper-plane", "wave-circle", "lotus-line"], "heartbeat"),
      boolOpt("accent", "Accent detail", true), weightOpt(3.2), colorOpt(), seedOpt()],
    gallery: ["heartbeat", "mountains", "waves", "moon-phases", "arrow", "infinity", "semicolon", "mountain-circle", "sunrise", "paper-plane", "wave-circle", "lotus-line"].map((s) => ({ symbol: s })),
    gen(o, ctx) { return sceneOut(ctx, symbolEls(o, makeRng("sy" + o.seed)), o, "line", { inner: true }); },
  },
  {
    id: "compass", name: "Compass & map", category: "Subjects",
    description: "Compass roses with 4/8/16 points, degree ring, cardinal letters and optional globe grid.",
    options: [selectOpt("points", "Points", [{ value: "4", label: "4" }, { value: "8", label: "8" }, { value: "16", label: "16" }], "16"), selectOpt("style", "Style", ["nautical", "minimal", "ornate", "globe"], "nautical"),
      boolOpt("letters", "Letters N E S W", true), boolOpt("map", "Map grid", false), weightOpt(3), colorOpt(), seedOpt()],
    gallery: [{}, { style: "minimal", points: "4", letters: false }, { style: "ornate", points: "8" }, { style: "globe" }],
    usesFonts: true,
    gen(o, ctx) { return sceneOut(ctx, compassEls(o), o, "line", { inner: true, bold: 1.2 }); },
  },
  {
    id: "sun-moon", name: "Sun & moon", category: "Subjects",
    description: "Celestial pieces: sun-moon split, eclipse, moon phases around a sun, crescent with hanging stars, geometric sun.",
    options: [selectOpt("variant", "Variant", ["sun-moon", "eclipse", "phases", "crescent-stars", "geometric-sun"], "sun-moon"), rangeOpt("rays", "Rays", 8, 36, 1, 16),
      selectOpt("shading", "Shading", ["none", "dots", "solid"], "dots"), weightOpt(3), colorOpt(), seedOpt()],
    gallery: ["sun-moon", "eclipse", "phases", "crescent-stars", "geometric-sun"].map((v) => ({ variant: v })),
    gen(o, ctx) { return sceneOut(ctx, sunMoonEls(o, makeRng("sm" + o.seed)), o, "line", { inner: true, bold: 1.2 }); },
  },
  {
    id: "zodiac", name: "Zodiac & constellations", category: "Subjects",
    description: "The 12 zodiac signs as glyphs and star constellations, plus Orion, Big & Little Dipper, Cassiopeia.",
    options: [selectOpt("sign", "Sign / constellation", [...SIGNS, "orion", "big-dipper", "little-dipper", "cassiopeia"], "leo"), selectOpt("show", "Show", ["both", "constellation", "glyph"], "both"),
      selectOpt("frame", "Frame", ["circle", "arch", "moon", "none"], "circle"), boolOpt("stars", "Scattered stars", true), weightOpt(3), colorOpt(), seedOpt()],
    gallery: [{ sign: "leo" }, { sign: "scorpio", frame: "none" }, { sign: "pisces", show: "glyph" }, { sign: "orion", frame: "moon" }, { sign: "gemini", frame: "arch" }, { sign: "big-dipper", frame: "none" }],
    gen(o, ctx) { return sceneOut(ctx, zodiacEls(o, makeRng("zd" + o.seed)), o, "line", { inner: true }); },
  },
  {
    id: "brush", name: "Abstract brush", category: "Bold",
    description: "Ensō circles and bold sumi-e brush strokes with dry-brush texture and rough edges.",
    options: [selectOpt("shape", "Shape", ["enso", "strokes", "heart", "cross", "wave"], "enso"), rangeOpt("thickness", "Thickness", 0.4, 2, 0.05, 1), rangeOpt("roughness", "Roughness", 0, 2, 0.05, 1),
      boolOpt("seal", "Red seal stamp", true), colorOpt(), seedOpt()],
    gallery: ["enso", "strokes", "heart", "cross", "wave"].map((s) => ({ shape: s })).concat([{ shape: "enso", seed: 7, thickness: 1.6 }]),
    gen(o, ctx) {
      const rng = makeRng("br" + o.seed);
      const shapes = brushShapes(o, rng);
      const id = ctx.uid("bf");
      ctx.defs.push(`<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="${(Math.abs(Math.round(rng() * 900)))}"/><feDisplacementMap in="SourceGraphic" scale="${f1(4 + o.roughness * 10)}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
      let body = `<g filter="url(#${id})"><path d="${shapes.join("")}" fill="${o.color}"/></g>`;
      if (o.seal) {
        const x = o.shape === "enso" ? 760 : 820, y = o.shape === "enso" ? 800 : 820;
        body += `<g filter="url(#${id})"><rect x="${x}" y="${y}" width="70" height="90" rx="6" fill="#b3241f"/></g>`;
        const t = textD("永", "sans", 50, x + 35, y + 62);
        body += `<path d="M${x + 18} ${y + 22}h34M${x + 35} ${y + 22}v50M${x + 20} ${y + 48}h30" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      }
      const scene = { box: BOX, els: shapes.map((d) => ({ d })) };
      const bb = sceneBBox(scene, 30);
      if (o.seal) { const x2 = Math.max(bb[0] + bb[2], 900), y2 = Math.max(bb[1] + bb[3], 920); bb[2] = x2 - bb[0]; bb[3] = y2 - bb[1]; }
      return { body, bbox: bb };
    },
  },
];
