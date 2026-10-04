// Pattern styles: mandala, sacred geometry, armbands, Polynesian, ornamental (+ tribal, Maori, Celtic, Japanese in styles-pattern2.js).
import {
  INK, f1, f2, smooth, polyD, circleD, ellipseD, arcPts, regularPoly, starPts, polar, TAU, makeRng, petalD, petalPts,
  taperSmoothD, sampleSpline, add, sub, mul, norm, perp, mix, lerp, clamp, M, transformD, resample,
} from "./core.js";
import { renderScene, PALETTES, sceneBBox, tfEls } from "./render.js";
import { BAND_PATTERNS, bandMapper, renderBand } from "./bands.js";
import { seedOpt, weightOpt, colorOpt, rangeOpt, boolOpt, selectOpt } from "./opts.js";
import { TRIBAL_STYLES } from "./styles-pattern2.js";

const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d) => ({ t: "dark", d });
const C = 500;

// ======================================================================== MANDALA
const RING_TYPES = ["petals", "roundPetals", "doublePetals", "scallops", "teeth", "beads", "dots", "leaves", "lace", "spikes", "band", "zigzag", "drops", "checker", "circle"];

// petal outline points for radial rings: base spans [a-half, a+half] on r0
function petalRing(a, r0, r1, half, shape) {
  const w = r1 - r0;
  const P = (r, da) => polar(C, C, r, a + da);
  if (shape === "round") {
    // U-shaped petal: straight-ish sides and a semicircular cap
    const u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
    const hb = r0 * Math.sin(half) * 0.94;
    const hc = Math.min(w * 0.5, (r0 + w * 0.7) * Math.sin(half) * 0.86);
    const L = w - hc;
    const Q = (x, y) => [C + u[0] * (r0 + x) + v[0] * y, C + u[1] * (r0 + x) + v[1] * y];
    const pts = [[...Q(0, -hb), 1], Q(L * 0.55, -hc * 0.97)];
    for (let k = 0; k <= 6; k++) { const th = -Math.PI / 2 + Math.PI * k / 6; pts.push(Q(L + Math.cos(th) * hc, Math.sin(th) * hc)); }
    pts.push(Q(L * 0.55, hc * 0.97), [...Q(0, hb), 1]);
    return pts;
  }
  if (shape === "drop") return [[...P(r0, 0), 1], P(r0 + w * 0.35, -half * 0.5), P(r0 + w * 0.72, -half * 0.85), P(r1, -half * 0.3), P(r1, half * 0.3), P(r0 + w * 0.72, half * 0.85), P(r0 + w * 0.35, half * 0.5)];
  return [[...P(r0, -half * 0.96), 1], P(r0 + w * 0.3, -half * 0.86), P(r0 + w * 0.62, -half * 0.5), [...P(r1, 0), 1], P(r0 + w * 0.62, half * 0.5), P(r0 + w * 0.3, half * 0.86), [...P(r0, half * 0.96), 1]];
}

function ringEls(type, r0, r1, n, rng, fillMode, a0 = 0) {
  const els = [];
  const w = r1 - r0, step = TAU / n;
  const pickFill = (k) => {
    if (fillMode === "line") return null;
    if (fillMode === "bold") return k % 2 ? "solid" : null;
    if (fillMode === "dotwork") return k % 2 ? "dots" : null;
    return [null, "dots", "solid", "lines"][k % 4];
  };
  const fk = Math.floor(rng() * 4);
  const ang = (i) => a0 - Math.PI / 2 + i * step;
  switch (type) {
    case "circle": els.push(line(circleD(C, C, (r0 + r1) / 2), 0.7)); if (w > 8) els.push(line(circleD(C, C, r0 + 2), 0.4), line(circleD(C, C, r1 - 2), 0.4)); break;
    case "dots": {
      const k = n * (w > 18 ? 2 : 3), rr = Math.min(w * 0.32, (TAU * (r0 + r1) / 2 / k) * 0.3);
      els.push(dark(Array.from({ length: k }, (_, i) => circleD(...polar(C, C, (r0 + r1) / 2, ang(i * n / k)), rr)).join("")));
      break;
    }
    case "beads": {
      const k = n * 2, rr = Math.min(w * 0.42, (TAU * (r0 + r1) / 2 / k) * 0.42);
      for (let i = 0; i < k; i++) { const p = polar(C, C, (r0 + r1) / 2, ang(i / 2)); els.push(part(circleD(p[0], p[1], rr), "gold", { fill: pickFill(fk) })); els.push(dark(circleD(p[0], p[1], rr * 0.3))); }
      break;
    }
    case "petals": case "roundPetals": case "drops": case "doublePetals": {
      const layersP = type === "doublePetals" ? [["back", 0.5], ["front", 0]] : [["front", 0]];
      for (const [layer, off] of layersP) {
        const shape = type === "doublePetals" ? (layer === "back" ? "pointed" : "round") : type === "petals" ? "pointed" : type === "roundPetals" ? "round" : "drop";
        const rr1 = type === "doublePetals" && layer === "front" ? r0 + w * 0.78 : r1;
        for (let i = 0; i < n; i++) {
          const a = ang(i + off);
          const pts = petalRing(a, r0, rr1, step / 2, shape);
          els.push(part(smooth(pts, true), layer === "back" ? "second" : "main"));
          const inner = petalRing(a, r0 + (rr1 - r0) * 0.14, rr1 - (rr1 - r0) * 0.2, step / 2 * 0.55, shape);
          if (rr1 - r0 > 26) els.push(part(smooth(inner, true), "accent", { fill: pickFill(fk + (fillMode === "mixed" ? i % 2 : 0)) }));
          if (rr1 - r0 > 50 && shape !== "drop") els.push(line(polyD([polar(C, C, r0 + (rr1 - r0) * 0.22, a), polar(C, C, rr1 - (rr1 - r0) * 0.3, a)], false), 0.4));
        }
      }
      break;
    }
    case "scallops": {
      const k = n * (w < 30 ? 2 : 1);
      const st = TAU / k;
      let d = "";
      const pts = [];
      for (let i = 0; i < k; i++) {
        const a = ang(i * n / k);
        const arc = [];
        for (let j = 0; j <= 10; j++) { const t = j / 10; const aa = a - st / 2 + st * t; arc.push(polar(C, C, r0 + w * Math.sin(Math.PI * t) ** 0.7, aa)); }
        pts.push(...arc.slice(0, -1));
        els.push(dark(circleD(...polar(C, C, r0 + w * 0.42, a), Math.min(w * 0.14, 6))));
      }
      els.push(part(polyD(pts) + circleD(C, C, r0), "main", { rule: "evenodd" }));
      break;
    }
    case "teeth": {
      const k = n * 2;
      for (let i = 0; i < k; i++) {
        const a = ang(i * n / k), s2 = TAU / k / 2;
        els.push(part(polyD([polar(C, C, r0, a - s2), polar(C, C, r1, a), polar(C, C, r0, a + s2)]), "main", { fill: fillMode === "line" ? null : i % 2 ? "solid" : null }));
      }
      break;
    }
    case "leaves": {
      const k = n * 2;
      for (let i = 0; i < k; i++) {
        const a = ang(i * n / k), base = polar(C, C, (r0 + r1) / 2, a - TAU / k * 0.5), tip = polar(C, C, (r0 + r1) / 2 + w * 0.15, a + TAU / k * 0.5);
        els.push(part(petalD(base, tip, w * 0.32, { curve: 0.1 }), "leaf", { fill: pickFill(fk) }));
      }
      els.push(line(circleD(C, C, (r0 + r1) / 2 - w * 0.05), 0.4));
      break;
    }
    case "lace": {
      const k = n * 2;
      const st = TAU / k;
      for (let i = 0; i < k; i++) {
        const a = ang(i * n / k);
        const arc = [];
        for (let j = 0; j <= 10; j++) { const t = j / 10; arc.push(polar(C, C, r0 + w * 0.55 * Math.sin(Math.PI * t), a + st * (t - 0.5))); }
        els.push(line(polyD(arc, false), 0.55));
        const tip = polar(C, C, r0 + w * 0.8, a);
        els.push(dark(circleD(tip[0], tip[1], Math.min(4.5, w * 0.08))));
        els.push(line(polyD([polar(C, C, r0 + w * 0.55, a), polar(C, C, r0 + w * 0.72, a)], false), 0.4));
        els.push(dark(petalD(polar(C, C, r0 + w * 0.82, a + st / 2), polar(C, C, r1, a + st / 2), Math.min(w * 0.08, 6), { at: 0.65, tipRound: 0.6 })));
      }
      break;
    }
    case "spikes": {
      const k = n * 2;
      for (let i = 0; i < k; i++) {
        const a = ang(i * n / k), L = i % 2 ? w * 0.6 : w;
        els.push(dark(petalD(polar(C, C, r0, a), polar(C, C, r0 + L, a), Math.min(3.5, TAU * r0 / k * 0.1) + w * 0.015, { at: 0.2 })));
      }
      break;
    }
    case "band": {
      els.push(part(circleD(C, C, r1) + circleD(C, C, r0), "main", { rule: "evenodd", fill: fillMode === "line" ? null : "solid" }));
      if (fillMode !== "line") { const k = n * 2; for (let i = 0; i < k; i++) els.push({ t: "part", d: circleD(...polar(C, C, (r0 + r1) / 2, ang(i * n / k)), w * 0.18), role: "white", fill: null, sw: 0.5 }); }
      else { const k = n * 2; els.push(dark(Array.from({ length: k }, (_, i) => circleD(...polar(C, C, (r0 + r1) / 2, ang(i * n / k)), w * 0.16)).join(""))); }
      break;
    }
    case "zigzag": {
      const k = n * 2, pts = [];
      for (let i = 0; i <= k * 2; i++) pts.push(polar(C, C, i % 2 ? r1 - 2 : r0 + 2, ang(i * n / k / 2)));
      els.push(line(circleD(C, C, r0), 0.45), line(polyD(pts, false), 0.6), line(circleD(C, C, r1), 0.45));
      break;
    }
    case "checker": {
      const k = n * 2;
      for (let i = 0; i < k; i++) {
        const a0_ = ang(i * n / k), a1_ = ang((i + 1) * n / k);
        els.push(part(polyD([...arcPts(C, C, r1, a0_, a1_, 6), ...arcPts(C, C, r0, a1_, a0_, 6)]), "main", { fill: fillMode === "line" ? (i % 2 ? "dots" : null) : i % 2 ? "solid" : null }));
      }
      break;
    }
  }
  return els;
}

function centerEls(kind, r, n, rng, fillMode) {
  const els = [];
  if (kind === "flower") {
    const k = Math.max(5, Math.round(n / 2));
    for (let i = 0; i < k; i++) els.push(part(smooth(petalRing(-Math.PI / 2 + i * TAU / k, r * 0.3, r, Math.PI / k, "pointed"), true), "main"));
    els.push(part(circleD(C, C, r * 0.3), "gold", { fill: fillMode === "line" ? "dots" : "solid" }));
  } else if (kind === "star") {
    els.push(part(polyD(starPts(C, C, r, r * 0.5, Math.max(5, Math.round(n / 2)))), "main", { fill: fillMode === "line" ? null : "solid" }));
    els.push(part(circleD(C, C, r * 0.25), "gold"));
  } else if (kind === "seed") {
    const rr = r / 2;
    els.push(line(circleD(C, C, rr), 0.5));
    for (let i = 0; i < 6; i++) els.push(line(circleD(...polar(C, C, rr, i * TAU / 6), rr), 0.5));
    els.push(line(circleD(C, C, r), 0.6));
  } else {
    els.push(part(circleD(C, C, r), "main"), part(circleD(C, C, r * 0.62), "second", { fill: fillMode === "line" ? "dots" : null }), dark(circleD(C, C, r * 0.22)));
  }
  return els;
}

export function mandalaScene(o, { R = 470 } = {}) {
  const rng = makeRng("md" + o.seed);
  const n = Math.round(o.petals);
  const layers = Math.round(o.layers);
  const els = [];
  // choose the layer sequence
  const thick = ["petals", "petals", "roundPetals", "doublePetals", "doublePetals", "scallops", "leaves", "teeth", "checker", "drops", "band"];
  const thin = ["dots", "beads", "circle", "zigzag"];
  const seq = [];
  let last = "";
  for (let i = 0; i < layers; i++) {
    const outer = i === layers - 1;
    let pool = outer ? ["petals", "lace", "spikes", "roundPetals", "doublePetals"] : i % 2 === 0 ? thick : thin;
    if (o.detail < 2) pool = pool.filter((t) => !["checker", "zigzag", "beads"].includes(t));
    let t = pool[Math.floor(rng() * pool.length)];
    if (t === last) t = pool[(pool.indexOf(t) + 1) % pool.length];
    seq.push(t); last = t;
    if (i % 2 === 1 && rng() < 0.45 && i < layers - 1) { seq.push("circle"); }
  }
  const widths = seq.map((t) => (thin.includes(t) ? 14 + rng() * 10 : t === "lace" || t === "spikes" ? 70 + rng() * 30 : 46 + rng() * 40));
  const rc = 40 + rng() * 40;
  const total = widths.reduce((a, b) => a + b, 0);
  const k = (R - rc) / total;
  let r = rc;
  const centerKind = o.center === "auto" ? ["flower", "star", "seed", "dot"][Math.floor(rng() * 4)] : o.center;
  els.push(...centerEls(centerKind, rc, n, rng, o.fill));
  const ringList = [];
  seq.forEach((t, i) => {
    const w = widths[i] * k;
    const nn = r < 120 ? Math.max(4, Math.round(n / 2)) : r > 330 && (t === "dots" || t === "beads" || t === "spikes" || t === "teeth") ? n * 2 : n;
    const off = rng() < 0.5 ? 0.5 * TAU / nn : 0;
    ringList.push({ t, r0: r, r1: r + w, nn, off });
    r += w;
  });
  // draw outer rings first so inner layers overlap them (painter order)
  for (let i = ringList.length - 1; i >= 0; i--) {
    const g = ringList[i];
    els.unshift(...ringEls(g.t, g.r0, g.r1, g.nn, rng, o.fill, g.off));
  }
  return { box: [0, 0, 1000, 1000], els, outer: r };
}

// ======================================================================== SACRED GEOMETRY
function sacredEls(o) {
  const els = [];
  const p = o.pattern, R = 420;
  const lw = (w) => line("", w);
  const add2 = (d, w = 0.7) => els.push(line(d, w));
  const nodes = [];
  if (p === "flower-of-life" || p === "seed-of-life") {
    const rings = p === "seed-of-life" ? 1 : Math.round(o.rings);
    const r = p === "seed-of-life" ? R / 2 : R / (rings + 1);
    const centers = [];
    for (let q = -rings * 2; q <= rings * 2; q++) for (let s = -rings * 2; s <= rings * 2; s++) {
      const x = C + r * (q + s / 2), y = C + r * s * Math.sqrt(3) / 2;
      const dd = Math.hypot(x - C, y - C);
      if (dd <= r * rings + 0.1) centers.push([x, y]);
    }
    let d = "";
    for (const c of centers) d += circleD(c[0], c[1], r);
    els.push({ t: "line", d, w: 0.6, clip: p === "flower-of-life" ? R : 0 });
    if (p === "flower-of-life") {
      // partial outer petals clipped by the big circle
      let d2 = "";
      for (let q = -rings * 2 - 2; q <= rings * 2 + 2; q++) for (let s = -rings * 2 - 2; s <= rings * 2 + 2; s++) {
        const x = C + r * (q + s / 2), y = C + r * s * Math.sqrt(3) / 2, dd = Math.hypot(x - C, y - C);
        if (dd > r * rings + 0.1 && dd < r * (rings + 1.05)) d2 += circleD(x, y, r);
      }
      els.push({ t: "line", d: d2, w: 0.6, clip: r * (rings + 1) });
    }
    add2(circleD(C, C, p === "seed-of-life" ? R : r * (rings + 1)), 1);
    if (o.frame) add2(circleD(C, C, (p === "seed-of-life" ? R : r * (rings + 1)) + 18), 0.5);
    centers.forEach((c) => nodes.push(c));
  } else if (p === "metatron") {
    const r = R / 6;
    const pts = [[C, C], ...regularPoly(C, C, 2 * r, 6), ...regularPoly(C, C, 4 * r, 6)];
    let d = "";
    for (const c of pts) d += circleD(c[0], c[1], r);
    add2(d, 0.6);
    let l = "";
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) l += polyD([pts[i], pts[j]], false);
    add2(l, 0.45);
    if (o.frame) add2(circleD(C, C, 5 * r + 14), 0.8);
    pts.forEach((c) => nodes.push(c));
  } else if (p === "sri-yantra") {
    const r = 300;
    const T = (yb, ya, hw) => [[C - hw * r, C - yb * r], [C + hw * r, C - yb * r], [C, C - ya * r]];
    const tri = [
      [-0.62, 0.96, Math.sqrt(1 - 0.62 ** 2)], [-0.36, 0.62, 0.72], [-0.15, 0.36, 0.5], [-0.02, 0.19, 0.3],
      [0.62, -0.96, Math.sqrt(1 - 0.62 ** 2)], [0.42, -0.72, 0.8], [0.26, -0.45, 0.58], [0.1, -0.3, 0.42], [-0.02, -0.12, 0.17],
    ];
    let d = "";
    for (const [b, a, hw] of tri) d += polyD(T(b, a, hw));
    add2(d, 0.6);
    els.push(dark(circleD(C, C, 6)));
    add2(circleD(C, C, r), 0.8);
    // lotus petals 8 and 16
    for (const [n, r0, r1] of [[8, r, r * 1.2], [16, r * 1.22, r * 1.38]]) for (let i = 0; i < n; i++) els.push(part(petalD(polar(C, C, r0, i * TAU / n - Math.PI / 2), polar(C, C, r1, i * TAU / n - Math.PI / 2), r0 * Math.sin(Math.PI / n) * 1.05, { at: 0.4, tipRound: 0.3 }), "main"));
    for (const rr of [r * 1.42, r * 1.47, r * 1.52]) add2(circleD(C, C, rr), 0.5);
    // bhupura gate
    const s = r * 1.62, g = r * 0.22;
    const gate = [];
    for (let k = 0; k < 4; k++) {
      const m = M.rc(k * Math.PI / 2, C, C);
      gate.push(polyD([[C - s, C - s], [C - g, C - s], [C - g, C - s - g * 0.8], [C - g * 1.6, C - s - g * 0.8], [C - g * 1.6, C - s - g * 1.4], [C + g * 1.6, C - s - g * 1.4], [C + g * 1.6, C - s - g * 0.8], [C + g, C - s - g * 0.8], [C + g, C - s], [C + s, C - s]].map((p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]), false));
    }
    add2(gate.join(""), 0.8);
    add2(transformD(gate.join(""), M.sc(0.95, C, C)), 0.4);
  } else if (p === "merkaba") {
    const r = R;
    const up = regularPoly(C, C, r, 3), dn = regularPoly(C, C, r, 3, Math.PI / 2);
    add2(polyD(up) + polyD(dn), 0.9);
    const hex = regularPoly(C, C, r / Math.sqrt(3), 6, 0);
    add2(polyD(hex), 0.6);
    let l = "";
    for (const v of [...up, ...dn]) l += polyD([v, [C, C]], false);
    for (let i = 0; i < 3; i++) l += polyD([up[i], dn[(i + 1) % 3]], false);
    add2(l, 0.45);
    add2(circleD(C, C, r), 0.7);
    if (o.frame) add2(circleD(C, C, r + 18), 0.5);
    [...up, ...dn, [C, C]].forEach((c) => nodes.push(c));
  } else if (p === "vesica") {
    const r = R * 0.62;
    add2(circleD(C - r / 2, C, r) + circleD(C + r / 2, C, r), 0.8);
    add2(polyD([[C, C - r * 0.866], [C + r / 2, C], [C, C + r * 0.866], [C - r / 2, C]]), 0.5);
    add2(polyD([[C, C - r * 0.866], [C, C + r * 0.866]], false) + polyD([[C - r / 2, C], [C + r / 2, C]], false), 0.45);
    add2(circleD(C, C, r * 0.866 / 1), 0.45);
    if (o.frame) add2(circleD(C, C, r * 1.5 + 14), 0.6);
    nodes.push([C - r / 2, C], [C + r / 2, C], [C, C - r * 0.866], [C, C + r * 0.866]);
  } else if (p === "golden-spiral") {
    const phi = (1 + Math.sqrt(5)) / 2;
    let x = 140, y = 230, w = 720, h = w / phi;
    let d = polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    let sp = "";
    let dir = 0;
    for (let i = 0; i < 9; i++) {
      const s = Math.min(w, h);
      let sq, c, a0;
      if (dir === 0) { sq = [x, y, s, s]; c = [x + s, y + s]; a0 = Math.PI; x += s; w -= s; }
      else if (dir === 1) { sq = [x, y, s, s]; c = [x, y + s]; a0 = -Math.PI / 2; y += s; h -= s; }
      else if (dir === 2) { sq = [x + w - s, y, s, s]; c = [x + w - s, y]; a0 = 0; w -= s; }
      else { sq = [x, y + h - s, s, s]; c = [x + s, y + h - s]; a0 = Math.PI / 2; h -= s; }
      d += polyD([[sq[0], sq[1]], [sq[0] + sq[2], sq[1]], [sq[0] + sq[2], sq[1] + sq[3]], [sq[0], sq[1] + sq[3]]]);
      sp += polyD(arcPts(c[0], c[1], s, a0, a0 + Math.PI / 2, 16), false);
      dir = (dir + 1) % 4;
    }
    add2(d, 0.45);
    add2(sp, 1);
    nodes.push([140, 230], [860, 230], [140, 230 + 720 / phi], [860, 230 + 720 / phi]);
  }
  if (o.dots) for (const n of nodes) els.push(dark(circleD(n[0], n[1], 5.5)));
  return els;
}

// ======================================================================== ORNAMENTAL
function scrollEls(start, dir, len, curl, sg, w0, rng) {
  // filigree scroll: gentle S-curve that rolls into a spiral, tapered, ending in a dot
  const pts = [start];
  let p = start, a = dir;
  const N = 10;
  for (let i = 1; i <= N; i++) { const t = i / N; a += -sg * curl * 0.16 * Math.sin(t * Math.PI); p = polar(p[0], p[1], len * 0.62 / N, a); pts.push(p); }
  const R = len * 0.2 * (0.8 + 0.4 * curl / 1.5);
  const c = polar(p[0], p[1], R, a + sg * Math.PI / 2);
  const th0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
  const K = 22;
  for (let k = 1; k <= K; k++) { const t = k / K; pts.push(polar(c[0], c[1], R * (1 - 0.72 * t), th0 + sg * t * Math.PI * 1.7)); }
  const end = pts[pts.length - 1];
  const el = [part(taperSmoothD(pts, (t) => w0 * (0.25 + 0.75 * Math.sin(Math.min(1, t * 2.2 + 0.15) * Math.PI / 2)) * (1 - t * 0.6), { step: 3, capEnd: true }), "gold")];
  el.push({ t: "dark", d: circleD(end[0], end[1], w0 * 0.45) });
  // small leaf bud on the outside of the curve
  const mid = pts[Math.floor(N * 0.6)], nn = polar(0, 0, 1, a - sg * Math.PI / 2);
  el.push(part(petalD(mid, [mid[0] + nn[0] * len * 0.18 + Math.cos(a) * len * 0.08, mid[1] + nn[1] * len * 0.18 + Math.sin(a) * len * 0.08], w0 * 0.45), "leaf"));
  return el;
}
function ornamentalEls(o) {
  const rng = makeRng("or" + o.seed);
  const els = [];
  const form = o.form;
  const det = o.complexity;
  if (form === "chandelier" || form === "sternum") {
    // top half-mandala
    const sc = mandalaScene({ seed: o.seed, petals: o.symmetry, layers: 2 + det, fill: o.fill, center: "flower", detail: det }, { R: form === "sternum" ? 260 : 240 });
    const cy = form === "sternum" ? 360 : 330;
    els.push(...tfEls(sc.els, M.chain(M.t(C, cy), M.t(-C, -C))));
    // scrolls on both sides
    for (const sg of [-1, 1]) {
      const X = sg;
      if (form === "sternum") {
        els.push(...scrollEls([C + X * 230, cy + 40], sg < 0 ? Math.PI * 0.95 : Math.PI * 0.05, 300, 1.4, sg, 22, rng));
        els.push(...scrollEls([C + X * 200, cy + 150], sg < 0 ? Math.PI * 0.75 : Math.PI * 0.25, 240, 1.4, -sg, 18, rng));
      }
    }
    // hanging drops / bead chains
    const nChains = form === "sternum" ? 5 : 7;
    for (let i = 0; i < nChains; i++) {
      const t = nChains === 1 ? 0.5 : i / (nChains - 1);
      const a = Math.PI * (0.18 + 0.64 * t);
      const top = polar(C, cy, form === "sternum" ? 250 : 236, a);
      const L = (form === "sternum" ? 180 : 240) * (1 - Math.abs(t - 0.5) * 1.1) + 60;
      let y = top[1];
      for (let k = 0; k < 4 + det; k++) { y += L / (5 + det); els.push(dark(circleD(top[0], y, 4 + (k % 2) * 2))); }
      els.push(part(petalD([top[0], y + 54], [top[0], y + 8], 15, { at: 0.7 }), "gem"));
      els.push(part(petalD([top[0], y + 44], [top[0], y + 18], 6, { at: 0.7 }), "white", { fill: o.fill === "line" ? null : "solid" }));
      if (i < nChains - 1) {
        const t2 = (i + 1) / (nChains - 1), a2 = Math.PI * (0.18 + 0.64 * t2), top2 = polar(C, cy, form === "sternum" ? 250 : 236, a2);
        const sag = 60;
        const arc = [];
        for (let k = 0; k <= 10; k++) { const u = k / 10; arc.push([lerp(top[0], top2[0], u), lerp(top[1], top2[1], u) + Math.sin(Math.PI * u) * sag]); }
        els.push(line(polyD(arc, false), 0.5));
        for (let k = 1; k < 10; k += 2) els.push(dark(circleD(arc[k][0], arc[k][1], 2.6)));
      }
    }
  } else if (form === "lace-band") {
    const W = 1600, cy = 250;
    const n = 6;
    const cw = W / n, k = cw / 160;
    els.push(line(polyD([[0, cy - 60 * k], [W, cy - 60 * k]], false), 0.9), line(polyD([[0, cy - 48 * k], [W, cy - 48 * k]], false), 0.5));
    for (let i = 0; i < n; i++) {
      const x = i * cw + cw / 2;
      els.push(line(smooth([[x - cw / 2, cy - 48 * k], [x - cw * 0.35, cy + 20 * k], [x, cy + 50 * k], [x + cw * 0.35, cy + 20 * k], [x + cw / 2, cy - 48 * k]], false), 0.7));
      els.push(line(smooth([[x - cw * 0.35, cy - 48 * k], [x - cw * 0.2, cy], [x, cy + 18 * k], [x + cw * 0.2, cy], [x + cw * 0.35, cy - 48 * k]], false), 0.5));
      for (let q = 0; q < 3; q++) els.push(dark(circleD(x, cy + (70 + q * 20) * k, (6 - q * 1.5) * k)));
      els.push(part(petalD([x, cy + 160 * k], [x, cy + 122 * k], 10 * k, { at: 0.7 }), "gem"));
      for (let q = 0; q < 6; q++) { const a = q * TAU / 6; els.push(part(petalD([x, cy - 12 * k], polar(x, cy - 12 * k, 26 * k, a), 8 * k, { tipRound: 0.4 }), "main")); }
      els.push(part(circleD(x, cy - 12 * k, 6 * k), "gold"));
      els.push(dark(circleD(x - cw / 2, cy - 30 * k, 6 * k)));
      els.push(dark(circleD(x - cw / 2, cy + 6 * k, 4 * k)));
    }
    return { els, box: [0, 0, W, 700] };
  } else {
    // scroll frame around an empty oval
    const rx = 260, ry = 340;
    const ov = arcPts(C, C, 1, 0, TAU, 72).map((p) => [C + (p[0] - C) * rx, C + (p[1] - C) * ry]);
    els.push(line(polyD(ov), 0.9));
    els.push(line(polyD(ov.map((p) => [C + (p[0] - C) * 1.06, C + (p[1] - C) * 1.05])), 0.5));
    for (const sg of [-1, 1]) for (const sy of [-1, 1]) {
      els.push(...scrollEls([C + sg * 60, C + sy * (ry + 30)], sy < 0 ? (sg < 0 ? Math.PI * 1.1 : -0.1) : (sg < 0 ? Math.PI * 0.9 : 0.1), 280, 1.5, sg * sy * -1, 20, rng));
      els.push(...scrollEls([C + sg * (rx + 20), C + sy * 120], sy < 0 ? -Math.PI / 2 + sg * 0.3 : Math.PI / 2 - sg * 0.3, 200, 1.2, sg * sy, 15, rng));
    }
    for (const sy of [-1, 1]) {
      els.push(part(polyD([[C, C + sy * (ry + 70)], [C + 26, C + sy * (ry + 30)], [C, C + sy * (ry - 6)], [C - 26, C + sy * (ry + 30)]]), "main"));
      els.push(dark(circleD(C, C + sy * (ry + 92), 8)));
    }
  }
  return { els, box: [0, 0, 1000, 1000] };
}

// ======================================================================== POLYNESIAN helpers
function honuEls(cx, cy, s) {
  const els = [];
  const T = (p) => [cx + p[0] * s, cy + p[1] * s, p[2]];
  // flippers
  for (const sg of [-1, 1]) {
    els.push(part(petalD(T([sg * 0.45, -0.35]), T([sg * 1.15, -0.95]), 0.28 * s, { curve: sg * 0.12 }), "dark", { fill: "solid" }));
    els.push(part(petalD(T([sg * 0.42, 0.5]), T([sg * 0.9, 0.95]), 0.2 * s, { curve: -sg * 0.1 }), "dark", { fill: "solid" }));
  }
  els.push(part(circleD(cx, cy - 1.05 * s, 0.24 * s), "dark", { fill: "solid" }));
  els.push(part(polyD([T([-0.08, 0.85]), T([0, 1.15]), T([0.08, 0.85])]), "dark", { fill: "solid" }));
  // shell with patterned plates
  els.push(part(ellipseD(cx, cy, 0.62 * s, 0.86 * s), "dark", { fill: "solid" }));
  els.push({ t: "line", d: polyD(regularPoly(cx, cy, 0.3 * s, 6, 0)), w: 0.9, neg: true });
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; els.push({ t: "line", d: polyD([polar(cx, cy, 0.3 * s, a), [cx + Math.cos(a) * 0.6 * s, cy + Math.sin(a) * 0.84 * s]], false), w: 0.9, neg: true }); }
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; const p = [cx + Math.cos(a) * 0.45 * s, cy + Math.sin(a) * 0.62 * s]; els.push({ t: "line", d: circleD(p[0], p[1], 0.06 * s), w: 0.7, neg: true }); }
  return els;
}

// ======================================================================== STYLE DEFINITIONS
const bandRowsChoices = ["teeth", "waves", "spearheads", "enata", "turtle", "teethDouble", "dots", "checker", "meander", "chain", "barbed", "zigzag", "chevrons", "triangles", "scallops", "running", "mountains", "vine", "stripe", "lines"];
const POLY_ROWS = ["teeth", "waves", "spearheads", "enata", "turtle", "teethDouble"];

export const PATTERN_STYLES = [
  {
    id: "mandala", name: "Mandala", category: "Geometric",
    description: "Layered radial mandala: petals, scallops, beads, lace and dot borders. Endless variants by seed.",
    options: [rangeOpt("petals", "Petals / symmetry", 6, 24, 1, 12), rangeOpt("layers", "Layers", 2, 9, 1, 5),
      selectOpt("fill", "Fill style", ["mixed", "line", "bold", "dotwork"], "mixed"), selectOpt("center", "Center", ["auto", "flower", "star", "seed", "dot"], "auto"),
      selectOpt("form", "Form", ["full", "half", "drop"], "full"), rangeOpt("detail", "Detail", 1, 3, 1, 2), selectOpt("ink", "Ink", ["black", "color"], "black"), weightOpt(2.4), colorOpt(), seedOpt()],
    gallery: [{ seed: 1 }, { seed: 2, petals: 8, fill: "bold" }, { seed: 3, petals: 16, layers: 7, fill: "dotwork" }, { seed: 4, fill: "line", layers: 4 }, { seed: 5, ink: "color", petals: 10 }, { seed: 6, form: "drop", petals: 14 }],
    gen(o, ctx) {
      const sc = mandalaScene(o);
      if (o.form === "drop") {
        const orn = ornamentalEls({ form: "chandelier", seed: o.seed, symmetry: o.petals, complexity: o.layers > 5 ? 3 : 2, fill: o.fill });
        const scene = { box: [0, 0, 1000, 1000], els: orn.els };
        return { body: renderScene(ctx, scene, o.ink === "color" ? "fill" : "line", { w: o.weight, color: o.color, bold: 1.2, palette: PALETTES.neo }), bbox: sceneBBox(scene, o.weight * 2 + 8) };
      }
      let body = renderScene(ctx, sc, o.ink === "color" ? "fill" : "line", { w: o.ink === "color" ? o.weight * 1.4 : o.weight, color: o.color, bold: 1.25, palette: PALETTES.neo });
      if (o.form === "half") {
        const id = ctx.uid("hc");
        ctx.defs.push(`<clipPath id="${id}"><rect x="-10" y="-10" width="1020" height="${f1(C + 4)}"/></clipPath>`);
        body = `<g clip-path="url(#${id})">${body}</g><path d="M${f1(C - sc.outer)} ${C}H${f1(C + sc.outer)}" stroke="${o.color}" stroke-width="${f2(o.weight * 1.2)}"/>`;
        return { body, bbox: [C - sc.outer - 12, C - sc.outer - 12, sc.outer * 2 + 24, sc.outer + 24] };
      }
      return { body, bbox: [C - sc.outer - 12, C - sc.outer - 12, sc.outer * 2 + 24, sc.outer * 2 + 24] };
    },
  },
  {
    id: "sacred-geometry", name: "Sacred geometry", category: "Geometric",
    description: "Flower of life, seed of life, Metatron's cube, Sri Yantra, Merkaba, vesica piscis, golden spiral.",
    options: [selectOpt("pattern", "Pattern", ["flower-of-life", "seed-of-life", "metatron", "sri-yantra", "merkaba", "vesica", "golden-spiral"], "flower-of-life"),
      rangeOpt("rings", "Rings (flower of life)", 1, 4, 1, 2), boolOpt("frame", "Outer frame", true), boolOpt("dots", "Node dots", true), weightOpt(2.2), colorOpt(), seedOpt()],
    gallery: ["flower-of-life", "seed-of-life", "metatron", "sri-yantra", "merkaba", "vesica", "golden-spiral"].map((p) => ({ pattern: p })),
    gen(o, ctx) {
      const els = sacredEls(o);
      let body = "";
      const sw = o.weight;
      for (const e of els) {
        if (e.t === "line") {
          let clip = "";
          if (e.clip) { const id = ctx.uid("sg"); ctx.defs.push(`<clipPath id="${id}"><circle cx="${C}" cy="${C}" r="${f1(e.clip)}"/></clipPath>`); clip = ` clip-path="url(#${id})"`; }
          body += `<path d="${e.d}" fill="none" stroke="${o.color}" stroke-width="${f2(sw * (e.w ?? 0.7) * 1.4)}" stroke-linecap="round" stroke-linejoin="round"${clip}/>`;
        } else if (e.t === "dark") body += `<path d="${e.d}" fill="${o.color}"/>`;
        else body += `<path d="${e.d}" fill="none" stroke="${o.color}" stroke-width="${f2(sw)}"/>`;
      }
      const scene = { box: [0, 0, 1000, 1000], els };
      return { body, bbox: sceneBBox(scene, sw * 2 + 8) };
    },
  },
  {
    id: "armband", name: "Armband / bands", category: "Bold",
    description: "Repeating wrap-around band patterns (wide format): teeth, Greek key, chains, barbed wire, waves, vines…",
    aspect: "wide",
    options: [selectOpt("pattern", "Pattern", bandRowsChoices.map((v) => ({ value: v, label: BAND_PATTERNS[v].name })), "meander"),
      selectOpt("pattern2", "Second pattern", [{ value: "none", label: "None" }, ...bandRowsChoices.map((v) => ({ value: v, label: BAND_PATTERNS[v].name }))], "none"),
      rangeOpt("repeats", "Repeats", 4, 24, 1, 10), rangeOpt("height", "Band height", 0.08, 0.4, 0.01, 0.2), boolOpt("borders", "Border lines", true), weightOpt(5), colorOpt(), seedOpt()],
    gallery: [{ pattern: "meander" }, { pattern: "barbed", borders: false }, { pattern: "teeth", pattern2: "dots" }, { pattern: "chain", borders: false }, { pattern: "vine" }, { pattern: "waves", pattern2: "teeth", repeats: 14 }, { pattern: "running" }, { pattern: "checker", height: 0.12 }],
    gen(o, ctx) {
      const W = 2000, n = Math.round(o.repeats), cell = W / n;
      const H1 = W * o.height * 0.5;
      const rows = [o.pattern, ...(o.pattern2 !== "none" ? [o.pattern2] : [])];
      let y = 0, body = "";
      const sw = o.weight;
      const gap = H1 * 0.12;
      if (o.borders) { body += `<rect x="0" y="0" width="${W}" height="${f1(sw * 2.2)}" fill="${o.color}"/>`; y = sw * 2.2 + gap; }
      rows.forEach((pat, i) => {
        const H = i === 0 ? H1 : H1 * 0.55;
        if (i > 0) { body += `<rect x="0" y="${f1(y)}" width="${W}" height="${f1(sw * 0.9)}" fill="${o.color}"/>`; y += sw * 0.9 + gap; }
        body += renderBand(pat, { n: i === 0 ? n : n * 2, H, cell: i === 0 ? cell : cell / 2, mapper: bandMapper({ kind: "straight", x0: 0, y0: y }), color: o.color, lw: Math.max(sw, sw * H / 80) });
        y += H + gap;
      });
      if (o.borders) { body += `<rect x="0" y="${f1(y)}" width="${W}" height="${f1(sw * 2.2)}" fill="${o.color}"/>`; y += sw * 2.2; }
      return { body, bbox: [-4, -6, W + 8, y + 12] };
    },
  },
  {
    id: "polynesian", name: "Polynesian", category: "Bold",
    description: "Bands of shark teeth, ocean waves, spearheads, enata figures and turtle shell — armband or circular forms.",
    aspect: "wide",
    options: [selectOpt("form", "Form", ["armband", "circle", "half-sleeve-band"], "armband"), rangeOpt("rows", "Pattern rows", 2, 6, 1, 4),
      rangeOpt("repeats", "Repeats", 8, 32, 1, 16), boolOpt("turtle", "Turtle (honu) center", true), weightOpt(5), colorOpt(), seedOpt()],
    gallery: [{ seed: 1 }, { seed: 2, rows: 5 }, { form: "circle", seed: 3 }, { form: "circle", seed: 4, turtle: false, rows: 3 }, { form: "half-sleeve-band", seed: 5 }],
    gen(o, ctx) {
      const rng = makeRng("po" + o.seed);
      const rows = [];
      for (let i = 0; i < o.rows; i++) rows.push(POLY_ROWS[Math.floor(rng() * POLY_ROWS.length)]);
      if (!rows.includes("teeth")) rows[0] = "teeth";
      const sw = o.weight;
      let body = "";
      if (o.form === "circle") {
        const R = 470;
        let r = R;
        const ringW = (R - 150) / (rows.length);
        body += `<path d="${circleD(C, C, R) + circleD(C, C, R - sw * 2)}" fill="${o.color}" fill-rule="evenodd"/>`;
        r -= sw * 2 + 6;
        rows.forEach((pat, i) => {
          const H = ringW - 14;
          const L = TAU * (r - H / 2);
          const n = Math.max(6, Math.round((pat === "enata" ? L / (H * 0.9) : L / (H * 0.85))));
          body += renderBand(pat, { n, H, cell: L / n, mapper: bandMapper({ kind: "ring", L, R: r, cx: C, cy: C }), color: o.color, lw: sw, flip: false });
          r -= H + 6;
          body += `<path d="${circleD(C, C, r) + circleD(C, C, r - sw * 0.9)}" fill="${o.color}" fill-rule="evenodd"/>`;
          r -= sw + 6;
        });
        if (o.turtle) {
          const scene = { box: [0, 0, 1000, 1000], els: honuEls(C, C, r * 0.62).map((e) => (e.neg ? { ...e, t: "line" } : e)) };
          body += renderScene(ctx, { ...scene, els: scene.els.map((e) => (e.t === "line" ? { ...e, w: e.w } : e)) }, "solid", { w: sw, color: o.color, neg: true });
        } else {
          const k = 12;
          for (let i = 0; i < k; i++) { const a = i * TAU / k; body += `<path d="${polyD([polar(C, C, r * 0.9, a - 0.12), polar(C, C, r * 0.25, a), polar(C, C, r * 0.9, a + 0.12)])}" fill="${o.color}"/>`; }
          body += `<circle cx="${C}" cy="${C}" r="${f1(r * 0.2)}" fill="${o.color}"/>`;
        }
        return { body, bbox: [C - R - 6, C - R - 6, 2 * R + 12, 2 * R + 12] };
      }
      const W = 2000, n = Math.round(o.repeats);
      const H = o.form === "armband" ? 120 : 150;
      let y = 0;
      const bar = (h) => { body += `<rect x="0" y="${f1(y)}" width="${W}" height="${f1(h)}" fill="${o.color}"/>`; y += h; };
      bar(sw * 3); y += 8;
      const seq = o.form === "armband" ? [...rows, ...rows.slice(0, -1).reverse()] : rows;
      seq.forEach((pat, i) => {
        const cnt = pat === "enata" ? Math.round(n * 0.8) : pat === "spearheads" || pat === "turtle" ? Math.round(n * 1.2) : n;
        const cell = W / cnt;
        body += renderBand(pat, { n: cnt, H, cell, mapper: bandMapper({ kind: "straight", x0: 0, y0: y }), color: o.color, lw: sw, flip: o.form === "armband" && i >= rows.length });
        y += H + 8;
        if (i < seq.length - 1) { bar(sw * 1.2); y += 8; }
      });
      bar(sw * 3);
      return { body, bbox: [-4, -6, W + 8, y + 12] };
    },
  },
  {
    id: "ornamental", name: "Ornamental / filigree", category: "Subjects",
    description: "Chandelier drops, sternum pieces, lace bands and filigree scroll frames.",
    options: [selectOpt("form", "Form", ["chandelier", "sternum", "lace-band", "scroll-frame"], "chandelier"), rangeOpt("symmetry", "Symmetry", 6, 20, 1, 12),
      rangeOpt("complexity", "Complexity", 1, 3, 1, 2), selectOpt("fill", "Fill", ["mixed", "line", "bold", "dotwork"], "mixed"), selectOpt("ink", "Ink", ["black", "color"], "black"), weightOpt(2.4), colorOpt(), seedOpt()],
    gallery: [{ form: "chandelier" }, { form: "sternum", seed: 2 }, { form: "lace-band" }, { form: "scroll-frame" }, { form: "chandelier", ink: "color", seed: 3 }],
    gen(o, ctx) {
      const r = ornamentalEls(o);
      const scene = { box: r.box, els: r.els };
      return { body: renderScene(ctx, scene, o.ink === "color" ? "fill" : "line", { w: o.weight, color: o.color, bold: 1.2, palette: PALETTES.neo }), bbox: sceneBBox(scene, o.weight * 2 + 8) };
    },
  },
  ...TRIBAL_STYLES,
];
