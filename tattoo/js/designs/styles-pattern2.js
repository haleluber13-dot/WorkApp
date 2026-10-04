// Tribal, Maori koru, Celtic knotwork and Japanese waves/clouds.
import {
  INK, f1, f2, smooth, polyD, circleD, arcPts, regularPoly, polar, TAU, makeRng, petalD, taperSmoothD, taperPts,
  sampleSpline, add, sub, mul, norm, perp, mix, lerp, clamp, M, transformD, resample, inPolys, dist, polyLength,
} from "./core.js";
import { renderScene, PALETTES, sceneBBox, tfEls, compose } from "./render.js";
import { getMotif } from "./library.js";
import { seedOpt, weightOpt, colorOpt, rangeOpt, boolOpt, selectOpt } from "./opts.js";

const C = 500;
const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d) => ({ t: "dark", d });
const mirrorD = (d, cx = C) => transformD(d, M.fx(cx));
const bboxOfDs = (ds, pad) => sceneBBox({ box: [0, 0, 1000, 1000], els: ds.map((d) => ({ d })) }, pad);

// Solid shapes separated by thin skin gaps (later shapes cut into earlier ones)
function gapSolid(ctx, shapes, { color = INK, gap = 6, box = [-200, -200, 1400, 1400] } = {}) {
  const id = ctx.uid("gs");
  let mk = "";
  for (const s of shapes) {
    const d = typeof s === "string" ? s : s.d;
    const neg = typeof s === "object" && s.neg;
    mk += `<path d="${d}" fill="${neg ? "#000" : "#fff"}" stroke="#000" stroke-width="${f2(neg ? 0.01 : gap * 2)}" paint-order="stroke" stroke-linejoin="round"${typeof s === "object" && s.rule ? ` fill-rule="${s.rule}"` : ""}/>`;
  }
  const [x, y, w, h] = box;
  ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">${mk}</mask>`);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" mask="url(#${id})"/>`;
}

// ======================================================================== TRIBAL
function blade(spine, maxW, { sharpStart = true, power = 0.6 } = {}) {
  return taperSmoothD(spine, (t) => maxW * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), power)), 0.85) + (sharpStart ? 0 : maxW * 0.3 * (1 - t)) + 0.4, { step: 4, every: 2 });
}
function curlSpine(start, ang, L, curl, n = 12) {
  const pts = [start];
  let p = start, a = ang;
  for (let i = 1; i <= n; i++) { const t = i / n; a += curl * t * t * 3 / n * 2.2; p = polar(p[0], p[1], L / n, a); pts.push(p); }
  return pts;
}
function tribalShapes(o) {
  const rng = makeRng("tb" + o.seed);
  const th = o.thickness;
  const shapes = [];
  const form = o.form;
  const curlAmt = o.curl;
  if (form === "centerpiece" || form === "flame" || form === "wings") {
    const half = [];
    const k = Math.round(o.blades);
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0.5 : i / (k - 1);
      let start, ang, L, curl;
      if (form === "centerpiece") { start = [C - 16, lerp(300, 720, t) + (rng() - 0.5) * 30]; ang = Math.PI + lerp(0.55, -0.55, t) + (rng() - 0.5) * 0.2; L = lerp(260, 380, Math.sin(t * Math.PI)) + rng() * 60; curl = (t < 0.5 ? 1 : -1) * curlAmt * (0.8 + rng() * 0.5); }
      else if (form === "flame") { start = [C - 10 - t * 60, 860 - t * 120]; ang = -Math.PI / 2 - 0.25 - t * 0.7 - rng() * 0.1; L = lerp(560, 300, t) + rng() * 60; curl = -curlAmt * (0.7 + rng() * 0.6); }
      else { start = [C - 30, 420 + t * 160]; ang = Math.PI + 0.35 - t * 0.6; L = lerp(460, 300, t) + rng() * 40; curl = curlAmt * (0.6 + 0.6 * (1 - t)); }
      const sp = curlSpine(start, ang, L, curl);
      half.push(blade(sp, (22 + rng() * 14) * th));
      // hook blade from the outer side
      if (rng() < 0.85) {
        const j = 4 + Math.floor(rng() * 4), base = sp[j], dir = Math.atan2(sp[j + 1][1] - base[1], sp[j + 1][0] - base[0]);
        const hs = curlSpine(base, dir - Math.sign(curl || 1) * (0.9 + rng() * 0.4), L * (0.35 + rng() * 0.15), -curl * 1.2, 8);
        half.push(blade(hs, (12 + rng() * 8) * th));
      }
      // small thorn
      if (rng() < 0.5) {
        const j = 2 + Math.floor(rng() * 3), base = sp[j];
        const hs = curlSpine(base, ang + Math.sign(curl || 1) * 1.2, L * 0.18, curl, 5);
        half.push(blade(hs, 7 * th));
      }
    }
    // central spine (shared, drawn last so it overlaps)
    const spineD = form === "flame" ? blade([[C, 900], [C, 650], [C, 380], [C, 160]], 30 * th, { power: 0.8 }) : blade([[C, 140], [C, 360], [C, 620], [C, 880]], 34 * th, { power: 1 });
    for (const d of half) shapes.push(d, mirrorD(d));
    shapes.push(spineD);
    if (form === "centerpiece") shapes.push(polyD([[C, 420], [C + 40 * th, 500], [C, 580], [C - 40 * th, 500]]));
  } else if (form === "sun") {
    const n = Math.round(o.blades) * 2 + 4;
    const sg = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n;
      const sp = curlSpine(polar(C, C, 120, a), a, 300 + (i % 2) * 60, sg * curlAmt * 0.9);
      shapes.push(blade(sp, (24 + (i % 2) * 8) * th));
    }
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * TAU / n;
      shapes.push(blade(curlSpine(polar(C, C, 112, a), a, 150, -sg * curlAmt), 12 * th));
    }
    shapes.push(circleD(C, C, 105));
    shapes.push({ d: circleD(C, C, 52), neg: true });
    shapes.push(circleD(C, C, 30));
  } else {
    // armband: interlocking wave-crest blades along x
    const W = 2000, n = Math.max(3, Math.round(o.blades) + 1), cw = W / n, H = 360, cy = 180;
    for (let i = 0; i < n; i++) {
      const x0 = i * cw;
      const up = curlSpine([x0 + cw * 0.02, cy + 40], -1.0, cw * 1.05, 2.3 * curlAmt + 0.4, 16);
      const dn = curlSpine([x0 + cw * 0.52, cy - 40], 1.0, cw * 1.05, -(2.3 * curlAmt + 0.4), 16);
      shapes.push(blade(up, 34 * th), blade(dn, 34 * th));
      const hu = up[6], hd = dn[6];
      shapes.push(blade(curlSpine(hu, -1.9, cw * 0.32, -1.8 * curlAmt, 7), 12 * th));
      shapes.push(blade(curlSpine(hd, 1.9, cw * 0.32, 1.8 * curlAmt, 7), 12 * th));
    }
    shapes.push(`M0 ${cy - H / 2 - 14}H${W}V${cy - H / 2 + 2}H0Z`, `M0 ${cy + H / 2 - 2}H${W}V${cy + H / 2 + 14}H0Z`);
  }
  return shapes;
}

// ======================================================================== MAORI KORU
function koruD(c, R, a0, sg, w, turns = 1.15) {
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) { const t = i / N, a = a0 + sg * t * turns * TAU, r = R * (1 - t * 0.8); pts.push(polar(c[0], c[1], r, a)); }
  const end = pts[pts.length - 1];
  const body = taperSmoothD(pts, (t) => w * (1 - t * 0.45), { step: 3, every: 2, spline: false });
  return { body, bulb: circleD(end[0], end[1], w * 1.25), start: pts[0], startAng: a0 + sg * Math.PI / 2 };
}
function maoriShapes(o) {
  const rng = makeRng("mr" + o.seed);
  const shapes = [];
  const w0 = 14 * o.thickness;
  if (o.form === "circle") {
    shapes.push({ d: circleD(C, C, 470) + circleD(C, C, 430), rule: "evenodd" });
    const n = Math.round(o.spirals);
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n, c = polar(C, C, 285, a);
      const k = koruD(c, 120, a + Math.PI, i % 2 ? 1 : -1, w0);
      shapes.push(k.body, k.bulb);
    }
    const k = koruD([C, C], 150, -Math.PI / 2, 1, w0 * 1.2, 1.4);
    shapes.push(k.body, k.bulb);
    // pakati ticks (negative) on the border
    for (let i = 0; i < 90; i++) { const a = i * TAU / 90; shapes.push({ d: polyD([polar(C, C, 436, a), polar(C, C, 464, a + 0.02), polar(C, C, 464, a + 0.035), polar(C, C, 436, a + 0.015)]), neg: true }); }
  } else if (o.form === "band") {
    const W = 2000, n = Math.round(o.spirals) + 2, cw = W / n, cy = 200, H = 300;
    const wave = [];
    for (let i = 0; i <= n * 8; i++) { const x = i / 8 * cw; wave.push([x, cy + Math.sin(i / 8 * Math.PI) * 60]); }
    shapes.push(taperSmoothD(wave, () => w0 * 0.8, { step: 6, spline: false }));
    for (let i = 0; i < n; i++) {
      const sy = i % 2 ? 1 : -1, x = (i + 0.5) * cw;
      const k = koruD([x + cw * 0.12, cy + sy * 70], 85, sy > 0 ? -Math.PI / 2 : Math.PI / 2, sy, w0 * 0.9);
      shapes.push(k.body, k.bulb);
    }
    shapes.push(`M0 ${cy - H / 2 - 40}H${W}V${cy - H / 2 - 24}H0Z`, `M0 ${cy + H / 2 + 24}H${W}V${cy + H / 2 + 40}H0Z`);
    for (let i = 0; i < n * 6; i++) { const x = i * W / (n * 6); shapes.push({ d: polyD([[x, cy - H / 2 - 40], [x + 10, cy - H / 2 - 40], [x + 16, cy - H / 2 - 24], [x + 6, cy - H / 2 - 24]]), neg: true }); }
  } else {
    // fern cluster
    const stem = [[C, 940], [C - 20, 760], [C + 10, 580], [C - 10, 420]];
    shapes.push(taperSmoothD(stem, (t) => w0 * (1.6 - t * 0.6), { step: 5 }));
    const sp = sampleSpline(stem, false, 10);
    const n = Math.round(o.spirals);
    for (let i = 0; i < n; i++) {
      const t = 0.2 + 0.8 * i / Math.max(1, n - 1), p = sp[Math.floor(t * (sp.length - 1))];
      const sg = i % 2 ? 1 : -1, R = lerp(150, 90, t) + rng() * 30;
      const c = [p[0] + sg * R * 1.05, p[1] - R * 0.6];
      const k = koruD(c, R, sg > 0 ? Math.PI : 0, sg > 0 ? -1 : 1, w0 * lerp(1.1, 0.8, t));
      shapes.push(taperSmoothD([p, mix(p, k.start, 0.5), k.start], () => w0 * 0.8, { step: 5 }), k.body, k.bulb);
    }
    const top = koruD([sp[sp.length - 1][0] + 70, sp[sp.length - 1][1] - 40], 80, Math.PI, -1, w0 * 0.9, 1.3);
    shapes.push(top.body, top.bulb);
  }
  return shapes;
}

// ======================================================================== CELTIC KNOTS
// Plait on a grid (x+y odd crossing points) with optional breaks; returns closed node loops.
function plaitStrands(X, Y, breaks, { periodic = false } = {}) {
  const wrap = (x) => (periodic ? ((x % X) + X) % X : x);
  const inX = (x) => periodic || (x >= 1 && x <= X - 1);
  const inY = (y) => y >= 1 && y <= Y - 1;
  const isCross = (x, y) => (((x + y) % 2) + 2) % 2 === 1 && inX(x) && inY(y) && !breaks.has(wrap(x) + "," + y);
  const visited = new Set();
  const loops = [];
  for (let sy = 1; sy < Y; sy++) for (let sx = periodic ? 0 : 1; sx < X; sx++) {
    if (!isCross(sx, sy)) continue;
    for (const d0 of [[1, 1], [1, -1]]) {
      if (visited.has(`${sx},${sy},${d0[0] * d0[1]}`)) continue;
      const nodes = [];
      let px = sx, py = sy, dx = d0[0], dy = d0[1], guard = 0;
      nodes.push({ x: px, y: py, tx: dx, ty: dy, cross: true });
      visited.add(`${wrap(px)},${py},${dx * dy}`);
      while (guard++ < 5000) {
        const qx = px + dx, qy = py + dy;
        if (isCross(qx, qy)) {
          if (wrap(qx) === sx && qy === sy && dx * dy === d0[0] * d0[1]) break;
          nodes.push({ x: qx, y: qy, tx: dx, ty: dy, cross: true });
          visited.add(`${wrap(qx)},${qy},${dx * dy}`);
        } else {
          const brk = breaks.get(wrap(qx) + "," + qy);
          const wallY = !inY(qy), wallX = !inX(qx);
          if (wallY || (!wallX && brk === "h")) {
            nodes.push({ x: qx, y: wallY ? (qy < 1 ? 0.45 : Y - 0.45) : qy, tx: dx, ty: 0, cross: false });
            dy = -dy;
          } else {
            nodes.push({ x: wallX ? (qx < 1 ? 0.45 : X - 0.45) : qx, y: qy, tx: 0, ty: dy, cross: false });
            dx = -dx;
          }
        }
        px = qx; py = qy;
      }
      loops.push(nodes);
    }
  }
  return loops;
}
// Hermite-smooth a node loop into a dense polyline
function nodesToPolyline(nodes, mapPt, step = 4, period = 0) {
  const out = [];
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i], b = nodes[(i + 1) % n];
    let bx = period ? b.x + period * Math.round((a.x - b.x) / period) : b.x;
    const P0 = [a.x, a.y], P1 = [bx, b.y];
    const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
    const t0 = norm([a.tx, a.ty]), t1 = norm([b.tx, b.ty]);
    const k = L * 0.55;
    const c0 = [P0[0] + t0[0] * k, P0[1] + t0[1] * k], c1 = [P1[0] - t1[0] * k, P1[1] - t1[1] * k];
    const N = 10;
    for (let j = 0; j < N; j++) {
      const t = j / N, u = 1 - t;
      out.push(mapPt([u * u * u * P0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * P1[0], u * u * u * P0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * P1[1]]));
    }
  }
  return resample([...out, out[0]], step).slice(0, -1);
}
// Find crossings between closed polylines and decide over/under by checkerboard rule
function knotCrossings(strands, ribbonW) {
  const segs = [];
  strands.forEach((s, si) => { for (let i = 0; i < s.length; i++) segs.push({ si, i, a: s[i], b: s[(i + 1) % s.length] }); });
  const cell = Math.max(10, ribbonW);
  const grid = new Map();
  segs.forEach((sg, k) => {
    const x0 = Math.floor(Math.min(sg.a[0], sg.b[0]) / cell), x1 = Math.floor(Math.max(sg.a[0], sg.b[0]) / cell);
    const y0 = Math.floor(Math.min(sg.a[1], sg.b[1]) / cell), y1 = Math.floor(Math.max(sg.a[1], sg.b[1]) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = x + "," + y; (grid.get(key) || grid.set(key, []).get(key)).push(k); }
  });
  const found = [], seen = new Set();
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const A = segs[list[p]], B = segs[list[q]];
      const pk = list[p] < list[q] ? list[p] + "," + list[q] : list[q] + "," + list[p];
      if (seen.has(pk)) continue; seen.add(pk);
      if (A.si === B.si) { const L = strands[A.si].length; const dd = Math.abs(A.i - B.i); if (dd <= 1 || dd >= L - 1) continue; }
      const r = sub(A.b, A.a), s = sub(B.b, B.a), den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-9) continue;
      const qp = sub(B.a, A.a), t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      found.push({ A, B, t, u, X: add(A.a, mul(r, t)), cr: den });
    }
  }
  const polys = strands;
  for (const f of found) {
    const da = norm(sub(f.A.b, f.A.a)), db = norm(sub(f.B.b, f.B.a));
    const q = add(f.X, mul(norm(add(da, db)), ribbonW * 0.25));
    const shaded = inPolys(polys, q[0], q[1]);
    f.overA = (f.cr > 0) !== shaded;
  }
  return found;
}
function renderKnot(ctx, strands, { ribbon = 26, border = 4, color = INK, mode = "outline", box = [-200, -200, 1400, 1400] }) {
  const cr = knotCrossings(strands, ribbon);
  const id = ctx.uid("kn");
  const Wout = ribbon + border * 2, Win = ribbon;
  const outer = mode === "solid" ? "#000" : "#fff", inner = mode === "solid" ? "#fff" : "#000";
  let mk = "";
  const dAll = strands.map((s) => polyD(s, true)).join("");
  mk += `<path d="${dAll}" fill="none" stroke="${outer}" stroke-width="${f2(Wout)}" stroke-linejoin="round"/>`;
  mk += `<path d="${dAll}" fill="none" stroke="${inner}" stroke-width="${f2(Win)}" stroke-linejoin="round"/>`;
  if (mode === "double") mk += `<path d="${dAll}" fill="none" stroke="#fff" stroke-width="${f2(border * 0.7)}"/>`;
  // over pieces
  const win = ribbon * 1.15;
  let over = "", overIn = "";
  for (const f of cr) {
    const S = f.overA ? f.A : f.B, s = strands[S.si], L = s.length;
    let back = [], fwd = [];
    let acc = 0, i = S.i;
    back.push(s[(i + 1) % L]);
    while (acc < win && back.length < L / 3) { const p = s[(i + L) % L], q = back[back.length - 1]; acc += dist(p, q); back.push(p); i--; }
    acc = 0; i = S.i + 1;
    fwd = [];
    while (acc < win && fwd.length < L / 3) { const p = s[(i + 1) % L], q = s[i % L]; acc += dist(p, q); fwd.push(p); i++; }
    const piece = [...back.reverse(), ...fwd];
    over += polyD(piece, false);
    const e0 = piece[0], e1 = piece[piece.length - 1];
    const u0 = norm(sub(piece[0], piece[1])), u1 = norm(sub(e1, piece[piece.length - 2]));
    overIn += polyD([add(e0, mul(u0, 2.5)), ...piece, add(e1, mul(u1, 2.5))], false);
  }
  mk += `<path d="${over}" fill="none" stroke="${outer}" stroke-width="${f2(Wout)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
  mk += `<path d="${overIn}" fill="none" stroke="${inner}" stroke-width="${f2(Win)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
  if (mode === "double") mk += `<path d="${overIn}" fill="none" stroke="#fff" stroke-width="${f2(border * 0.7)}"/>`;
  const [x, y, w, h] = box;
  ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000"/>${mk}</mask>`);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" mask="url(#${id})"/>`;
}
function celticStrands(o) {
  const rng = makeRng("ck" + o.seed);
  const f = o.form;
  if (f === "triquetra" || f === "trinity") {
    const s = [];
    for (let i = 0; i < 240; i++) { const t = i / 240 * TAU; s.push([C + 130 * (Math.sin(t) + 2 * Math.sin(2 * t)) * 0.95, C + 130 * (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.95 + 20]); }
    const strands = [resample([...s, s[0]], 4).slice(0, -1)];
    if (f === "trinity") { const c = []; for (let i = 0; i < 200; i++) c.push(polar(C, C + 20, 215, i / 200 * TAU)); strands.push(resample([...c, c[0]], 4).slice(0, -1)); }
    return { strands, ribbon: 40 };
  }
  if (f === "quaternary") {
    const s = [];
    for (let i = 0; i < 400; i++) { const t = i / 400 * TAU; s.push([C + 105 * (Math.cos(-t) + 2 * Math.cos(3 * t)), C + 105 * (Math.sin(-t) + 2 * Math.sin(3 * t))]); }
    const strands = [resample([...s, s[0]], 4).slice(0, -1)];
    const c = []; for (let i = 0; i < 200; i++) c.push(polar(C, C, 190, i / 200 * TAU)); strands.push(resample([...c, c[0]], 4).slice(0, -1));
    return { strands: strands.map((st) => st.map((p) => [C + (p[0] - C) * 0.707 - (p[1] - C) * 0.707, C + (p[0] - C) * 0.707 + (p[1] - C) * 0.707])), ribbon: 26 };
  }
  if (f === "shield") {
    const X = 4, Y = 4, loops = plaitStrands(X, Y, new Map());
    const unit = 600 / X;
    const mapPt = (p) => { const x = (p[0] - X / 2) * unit, y = (p[1] - Y / 2) * unit; return [C + (x - y) * 0.707, C + (x + y) * 0.707]; };
    return { strands: loops.map((l) => nodesToPolyline(l, mapPt, 4)), ribbon: unit * 0.42 * o.ribbon };
  }
  // grid plaits: border band, square panel, ring
  let X, Y, breaks = new Map(), periodic = false;
  if (f === "border") { X = Math.round(o.size) * 2 + 4; Y = 4; for (let x = 3; x < X - 2; x += 4) { if ((x + 2) % 2 === 1) breaks.set(x + ",2", "h"); else breaks.set(x + 1 + ",2", "h"); } }
  else if (f === "ring") { X = Math.max(8, Math.round(o.size) * 2 + 8); X += X % 4 === 0 ? 0 : 4 - (X % 4); Y = 4; periodic = true; for (let x = 1; x < X; x += 4) breaks.set(x + ",2", "h"); }
  else {
    X = Y = Math.max(4, Math.round(o.size / 2) * 2 + 2);
    // symmetric breaks for a more interesting panel
    const cx = X / 2;
    for (let i = 0; i < Math.round(o.size / 2); i++) {
      const x = 1 + Math.floor(rng() * (X / 2 - 1)), y = 1 + Math.floor(rng() * (Y / 2 - 1));
      if (((x + y) & 1) !== 1) continue;
      const kind = rng() < 0.5 ? "h" : "v";
      for (const [px, py, kk] of [[x, y, kind], [X - x, y, kind], [x, Y - y, kind], [X - x, Y - y, kind]]) breaks.set(px + "," + py, kk);
    }
  }
  const loops = plaitStrands(X, Y, breaks, { periodic });
  let mapPt, unit;
  if (f === "ring") {
    const R = 400, w = 180;
    mapPt = (p) => polar(C, C, R - (p[1] / Y) * w, -Math.PI / 2 + p[0] / X * TAU);
    unit = w / Y;
  } else if (f === "border") { unit = 2000 / X; mapPt = (p) => [p[0] * unit, p[1] * unit]; }
  else { unit = 900 / X; mapPt = (p) => [50 + p[0] * unit, 50 + p[1] * unit]; }
  const strands = loops.filter((l) => l.length > 1).map((l) => nodesToPolyline(l, mapPt, Math.max(2, unit / 10), periodic ? X : 0));
  return { strands, ribbon: unit * 0.42 * o.ribbon };
}

// ======================================================================== JAPANESE
function seigaihaEls(x0, y0, w, h, r) {
  let d = "";
  const rowH = r * 0.5;
  for (let row = 0, y = y0 + h; y > y0 - r; row++, y -= rowH) {
    for (let x = x0 + (row % 2 ? r : 0) - r; x < x0 + w + r; x += r * 2) {
      for (const k of [1, 0.74, 0.5, 0.26]) d += polyD(arcPts(x, y, r * k, Math.PI, TAU, 16), false);
    }
  }
  return d;
}
function seigaihaFilled(x0, y0, w, h, r) {
  // full circles drawn from the top row down, so each lower row overlaps the one above
  const els = [];
  const rowH = r * 0.5;
  let row = 0;
  for (let y = y0 - r * 0.5; y <= y0 + h + r * 0.5; y += rowH, row++) {
    for (let x = x0 + (row % 2 ? r : 0) - r; x < x0 + w + r; x += r * 2) {
      els.push(part(circleD(x, y, r), "water"));
      for (const k of [0.74, 0.5, 0.26]) els.push(line(circleD(x, y, r * k), 0.55));
    }
  }
  return els;
}
function cloudEls(cx, cy, s, sg = 1) {
  const els = [];
  const bumps = [[-0.9, 0, 0.42], [-0.35, -0.32, 0.55], [0.3, -0.18, 0.48], [0.8, 0.06, 0.34]];
  const pts = [];
  pts.push([cx - 1.4 * s * sg, cy + 0.32 * s, 1]);
  for (const [bx, by, br] of bumps) {
    const c = [cx + bx * s * sg, cy + by * s];
    for (let k = 0; k <= 6; k++) pts.push(polar(c[0], c[1], br * s, Math.PI * (1 + k / 6)));
  }
  pts.push([cx + 1.25 * s * sg, cy + 0.32 * s, 1]);
  els.push(part(smooth(pts.map((p) => [sg < 0 && false ? p[0] : p[0], p[1], p[2]]), true), "white"));
  for (const [bx, by, br] of bumps) {
    const c = [cx + bx * s * sg, cy + by * s];
    const sp = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; sp.push(polar(c[0], c[1], br * s * 0.7 * (1 - t * 0.85), Math.PI * 1.1 + sg * t * TAU * 0.9)); }
    els.push(line(smooth(sp, false), 0.5));
  }
  els.push(line(polyD([[cx - 1.9 * s * sg, cy + 0.32 * s], [cx + 1.6 * s * sg, cy + 0.32 * s]], false), 0.6));
  els.push(line(polyD([[cx - 1.2 * s * sg, cy + 0.48 * s], [cx + 2.2 * s * sg, cy + 0.48 * s]], false), 0.45));
  return els;
}
function greatWaveEls(rng, x0, y0, s) {
  // a curling crest with claw-like foam, drawn in a 400×300 unit space
  const T = (p) => [x0 + p[0] * s, y0 + p[1] * s, p[2]];
  const els = [];
  const body = [[0, 300, 1], [30, 230], [80, 160], [150, 95], [230, 60], [300, 64], [350, 96], [356, 140], [330, 160], [300, 150], [284, 126], [262, 130], [262, 160], [290, 196], [340, 220], [400, 240], [400, 300, 1]];
  els.push(part(smooth(body.map(T), true), "water"));
  // foam claws
  const claws = [];
  const crest = [[170, 84], [230, 56], [292, 58], [342, 86], [360, 128], [344, 156]];
  const cp = sampleSpline(crest, false, 6);
  for (let i = 2; i < cp.length - 1; i += 3) {
    const p = cp[i], q = cp[i + 1], u = norm(sub(q, p)), n = perp(u);
    claws.push(part(smooth([T(add(p, mul(n, -6))), T(add(add(p, mul(u, 10)), mul(n, 14))), T([...add(add(p, mul(u, 22)), mul(n, 6)), 1]), T(add(add(p, mul(u, 12)), mul(n, 2)))], true), "white"));
  }
  els.push(part(smooth([[160, 92], [228, 62], [290, 62], [338, 90], [352, 130], [334, 150], [318, 128], [300, 116], [276, 108], [252, 112], [230, 100], [200, 104]].map(T), true), "white"));
  els.push(...claws);
  // inner curl
  els.push(part(smooth([[262, 130], [262, 160], [290, 196], [340, 220], [300, 214], [266, 190], [252, 160]].map(T), true), "white"));
  // flow lines
  for (let k = 0; k < 5; k++) els.push(line(smooth([[30 + k * 18, 290], [60 + k * 22, 220 - k * 10], [120 + k * 20, 150 - k * 12], [190 + k * 14, 110 - k * 8]].map(T), false), 0.5));
  for (let k = 0; k < 3; k++) els.push(line(smooth([[250 + k * 20, 290], [300 + k * 16, 250], [360 + k * 10, 245]].map(T), false), 0.45));
  return els;
}

// ======================================================================== STYLES
export const TRIBAL_STYLES = [
  {
    id: "tribal", name: "Tribal", category: "Bold",
    description: "Flowing mirrored blade-and-flame swirls in solid black, separated by crisp skin gaps.",
    options: [selectOpt("form", "Form", ["centerpiece", "sun", "flame", "wings", "armband"], "centerpiece"), rangeOpt("blades", "Blades", 2, 7, 1, 4),
      rangeOpt("curl", "Curl", 0, 2, 0.05, 1), rangeOpt("thickness", "Thickness", 0.5, 1.8, 0.05, 1), rangeOpt("gap", "Gap", 2, 14, 0.5, 6), colorOpt(), seedOpt()],
    gallery: [{ seed: 1 }, { seed: 2, blades: 5 }, { form: "sun", seed: 3 }, { form: "flame", seed: 4 }, { form: "wings", seed: 5 }, { form: "armband", seed: 6 }],
    gen(o, ctx) {
      const shapes = tribalShapes(o);
      const W = o.form === "armband" ? 2000 : 1000;
      return { body: gapSolid(ctx, shapes, { color: o.color, gap: o.gap, box: [-300, -300, W + 600, 1600] }), bbox: bboxOfDs(shapes.map((s) => (typeof s === "string" ? s : s.d)), 10) };
    },
  },
  {
    id: "maori", name: "Maori koru", category: "Bold",
    description: "Kirituhi-inspired koru spirals (unfurling fern fronds) with pakati notches — circle, band or fern cluster.",
    options: [selectOpt("form", "Form", ["circle", "cluster", "band"], "circle"), rangeOpt("spirals", "Spirals", 3, 10, 1, 6), rangeOpt("thickness", "Thickness", 0.5, 2, 0.05, 1.1), rangeOpt("gap", "Gap", 2, 12, 0.5, 5), colorOpt(), seedOpt()],
    gallery: [{ seed: 1 }, { form: "cluster", seed: 2 }, { form: "band", seed: 3 }, { spirals: 8, seed: 4 }],
    gen(o, ctx) {
      const shapes = maoriShapes(o);
      const W = o.form === "band" ? 2000 : 1000;
      return { body: gapSolid(ctx, shapes, { color: o.color, gap: o.gap, box: [-300, -300, W + 600, 1600] }), bbox: bboxOfDs(shapes.map((s) => (typeof s === "string" ? s : s.d)), 10) };
    },
  },
  {
    id: "celtic", name: "Celtic knot", category: "Bold",
    description: "True over-under interlaced knotwork: borders, square panels, rings, triquetra, trinity, quaternary and heart knots.",
    options: [selectOpt("form", "Knot", ["triquetra", "trinity", "ring", "border", "panel", "quaternary", "shield"], "trinity"), rangeOpt("size", "Grid size", 2, 10, 1, 5),
      rangeOpt("ribbon", "Ribbon width", 0.6, 1.5, 0.05, 1), selectOpt("mode", "Ribbon style", ["outline", "solid", "double"], "outline"), weightOpt(6, "Border weight"), colorOpt(), seedOpt()],
    gallery: [{ form: "triquetra" }, { form: "trinity" }, { form: "ring" }, { form: "panel", seed: 2 }, { form: "border", mode: "solid" }, { form: "quaternary" }, { form: "shield" }, { form: "panel", seed: 5, mode: "double" }],
    gen(o, ctx) {
      const { strands, ribbon } = celticStrands(o);
      const body = renderKnot(ctx, strands, { ribbon: ribbon * (o.form === "triquetra" || o.form === "trinity" || o.form === "quaternary" ? o.ribbon : 1), border: o.weight, color: o.color, mode: o.mode, box: [-200, -200, 2400, 1400] });
      const all = strands.flat();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of all) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const pad = ribbon + o.weight * 2 + 8;
      return { body, bbox: [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad] };
    },
  },
  {
    id: "japanese", name: "Japanese waves & clouds", category: "Color",
    description: "Irezumi-inspired crashing waves, seigaiha scale pattern, swirling clouds and a rising sun.",
    options: [selectOpt("scene", "Scene", ["great-wave", "wave-circle", "seigaiha", "clouds", "koi-waves"], "great-wave"), selectOpt("ink", "Ink", ["color", "black"], "color"),
      boolOpt("sun", "Rising sun", true), rangeOpt("complexity", "Complexity", 1, 3, 1, 2), weightOpt(4.5), seedOpt()],
    gallery: [{ scene: "great-wave" }, { scene: "wave-circle" }, { scene: "seigaiha", ink: "black" }, { scene: "clouds" }, { scene: "koi-waves" }, { scene: "great-wave", ink: "black", seed: 2 }],
    gen(o, ctx) {
      const rng = makeRng("jp" + o.seed);
      const els = [];
      let box = [0, 0, 1000, 1000];
      const sc = o.scene;
      if (sc === "great-wave" || sc === "wave-circle") {
        if (o.sun) els.push(part(circleD(C + 170, 250, 110), "main"));
        if (o.complexity > 1) els.push(...cloudEls(250, 220, 70, 1));
        els.push(...seigaihaFilled(60, 700, 880, 200, 70));
        els.push(...greatWaveEls(rng, 80, 330, 2.1));
        if (o.complexity > 2) els.push(...greatWaveEls(rng, 520, 560, 0.9));
        if (sc === "wave-circle") {
          const scene = { box, els };
          const id = ctx.uid("jc");
          ctx.defs.push(`<clipPath id="${id}"><circle cx="${C}" cy="${C}" r="430"/></clipPath>`);
          const body = renderScene(ctx, scene, o.ink === "color" ? "fill" : "line", { w: o.weight, palette: JP_PALETTE, bold: 1.4 });
          return { body: `<g clip-path="url(#${id})">${body}</g><circle cx="${C}" cy="${C}" r="430" fill="none" stroke="${INK}" stroke-width="${f2(o.weight * 2.2)}"/>`, bbox: [C - 445, C - 445, 890, 890] };
        }
      } else if (sc === "seigaiha") {
        els.push(...seigaihaFilled(80, 80, 840, 840, 70));
        const scene = { box, els };
        const id = ctx.uid("jc");
        ctx.defs.push(`<clipPath id="${id}"><circle cx="${C}" cy="${C}" r="420"/></clipPath>`);
        const body = renderScene(ctx, scene, o.ink === "color" ? "fill" : "line", { w: o.weight, palette: JP_PALETTE, bold: 1 });
        return { body: `<g clip-path="url(#${id})">${body}</g><circle cx="${C}" cy="${C}" r="420" fill="none" stroke="${INK}" stroke-width="${f2(o.weight * 2)}"/>`, bbox: [C - 435, C - 435, 870, 870] };
      } else if (sc === "clouds") {
        if (o.sun) els.push(part(circleD(C, 420, 170), "main"));
        els.push(...cloudEls(340, 560, 110, 1), ...cloudEls(660, 380, 90, -1));
        if (o.complexity > 1) els.push(...cloudEls(640, 700, 80, 1));
        if (o.complexity > 2) els.push(...cloudEls(260, 300, 60, -1));
      } else {
        els.push(...seigaihaFilled(60, 720, 880, 200, 60));
        els.push(...greatWaveEls(rng, 520, 520, 1.1));
        const koi = getMotif("koi");
        els.push(...compose([{ m: koi, x: 420, y: 470, size: 640, rot: -20 }], box).els);
        els.push(...greatWaveEls(rng, 40, 600, 1.0));
      }
      const scene = { box, els };
      const body = renderScene(ctx, scene, o.ink === "color" ? "fill" : "line", { w: o.weight, palette: JP_PALETTE, bold: 1.5 });
      return { body, bbox: sceneBBox(scene, o.weight * 3) };
    },
  },
];
const JP_PALETTE = { ...PALETTES.traditional, water: "#1f4f8f", white: "#f7f2e6", main: "#c8321f", light: "#f7f2e6" };
