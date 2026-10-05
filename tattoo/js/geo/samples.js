/* Geometric maker — built-in sample pictures, drawn procedurally so the
   templates never show an empty slot: a wolf, a lion, a lotus, mountains and
   a misty pine forest. Animals and the flower are drawn on a transparent
   background (already "cut out"); landscapes fill their rectangle. */

import { makeCanvas, ctx2d } from "./imgfx.js";
import { rng } from "./delaunay.js";

export const SAMPLES = [
  { id: "sample:wolf", name: "Wolf", kind: "animal" },
  { id: "sample:lion", name: "Lion", kind: "animal" },
  { id: "sample:lotus", name: "Lotus", kind: "flower" },
  { id: "sample:mountains", name: "Mountains", kind: "scene" },
  { id: "sample:forest", name: "Pine forest", kind: "scene" },
];

const cache = new Map();
export function sampleCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const f = { "sample:wolf": wolf, "sample:lion": lion, "sample:lotus": lotus, "sample:mountains": mountains, "sample:forest": forest }[id];
  const c = f ? f() : null;
  if (c) cache.set(id, c);
  return c;
}

/* ------------------------------------------------------------ helpers */
// smooth closed curve through points (Catmull-Rom → Bézier)
function smoothPath(g, pts, closed = true, t = 0.5) {
  const n = pts.length;
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  g.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3,
      p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3, p2[0], p2[1]);
  }
  if (closed) g.closePath();
}
const mirror = (right, cx = 500) => right.concat(right.slice(1, -1).reverse().map(([x, y]) => [2 * cx - x, y]));
function radial(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
}
function furStrokes(g, path, n, seed, dirAt, colAt, len = [10, 24], width = [1, 2.2]) {
  const R = rng(seed);
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const x = R() * 1000, y = R() * 1000;
    if (!g.isPointInPath(path, x, y)) continue;
    const a = dirAt(x, y) + (R() - 0.5) * 0.5;
    const l = len[0] + R() * (len[1] - len[0]);
    g.strokeStyle = colAt(x, y, R);
    g.lineWidth = width[0] + R() * (width[1] - width[0]);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

/* --------------------------------------------------------------- wolf */
function wolf() {
  const c = makeCanvas(1000, 1000), g = ctx2d(c);
  const head = mirror([
    [500, 262], [560, 250], [612, 222], [655, 150], [700, 58], [728, 120], [752, 205], [770, 282],
    [800, 340], [846, 392], [828, 430], [872, 478], [834, 512], [866, 560], [818, 590], [836, 636],
    [772, 664], [742, 712], [690, 760], [640, 812], [590, 858], [540, 890], [500, 898],
  ]);
  const path = new Path2D();
  smoothPath(path, head, true, 0.55);
  g.save();
  g.clip(path);
  // base fur
  const base = g.createLinearGradient(0, 80, 0, 900);
  base.addColorStop(0, "#3b3631"); base.addColorStop(0.45, "#6f675e"); base.addColorStop(1, "#8b8379");
  g.fillStyle = base; g.fillRect(0, 0, 1000, 1000);
  // light cheeks + ruff
  radial(g, 690, 600, 230, [[0, "rgba(236,231,222,.95)"], [0.6, "rgba(214,208,198,.55)"], [1, "rgba(214,208,198,0)"]]);
  radial(g, 310, 600, 230, [[0, "rgba(236,231,222,.95)"], [0.6, "rgba(214,208,198,.55)"], [1, "rgba(214,208,198,0)"]]);
  // pale muzzle
  g.save(); g.translate(500, 715); g.scale(1, 1.45);
  radial(g, 0, 0, 130, [[0, "rgba(246,242,235,1)"], [0.7, "rgba(238,233,225,.85)"], [1, "rgba(238,233,225,0)"]]);
  g.restore();
  // dark crown and brow
  radial(g, 500, 250, 260, [[0, "rgba(30,26,23,.75)"], [1, "rgba(30,26,23,0)"]]);
  // forehead blaze
  g.save(); g.translate(500, 440); g.scale(0.32, 1);
  radial(g, 0, 0, 170, [[0, "rgba(225,219,208,.75)"], [1, "rgba(225,219,208,0)"]]);
  g.restore();
  // eye masks
  for (const s of [-1, 1]) {
    g.save(); g.translate(500 + s * 112, 468); g.rotate(s * 0.35); g.scale(1.7, 0.85);
    radial(g, 0, 0, 62, [[0, "rgba(20,17,15,.85)"], [1, "rgba(20,17,15,0)"]]);
    g.restore();
  }
  // nose bridge shadow lines
  for (const s of [-1, 1]) {
    g.save(); g.translate(500 + s * 62, 600); g.scale(0.35, 1.3);
    radial(g, 0, 0, 80, [[0, "rgba(60,55,50,.45)"], [1, "rgba(60,55,50,0)"]]);
    g.restore();
  }
  // fur texture
  const dir = (x, y) => {
    if (y < 420) return Math.atan2(y - 520, x - 500) + Math.PI; // crown fur points up/out
    return Math.atan2(y - 560, x - 500) * 0.6 + Math.PI / 2 * 0.4 + (x > 500 ? 0 : 0);
  };
  const col = (x, y, R) => {
    const v = R();
    const light = v > 0.5;
    return light ? `rgba(245,240,232,${0.18 + R() * 0.25})` : `rgba(25,22,20,${0.16 + R() * 0.22})`;
  };
  furStrokes(g, path, 9000, 3, dir, col, [8, 22], [0.8, 2]);
  // ears
  for (const s of [-1, 1]) {
    const ear = new Path2D();
    const pts = [[500 + s * 118, 236], [500 + s * 190, 112], [500 + s * 236, 286]];
    ear.moveTo(...pts[0]); ear.quadraticCurveTo(500 + s * 160, 160, ...pts[1]); ear.quadraticCurveTo(500 + s * 222, 200, ...pts[2]); ear.closePath();
    const eg = g.createLinearGradient(0, 110, 0, 290);
    eg.addColorStop(0, "#2a2522"); eg.addColorStop(1, "#cfc6ba");
    g.fillStyle = eg; g.fill(ear);
    g.save(); g.clip(ear);
    furStrokes(g, ear, 1500, 9 + s, () => -Math.PI / 2 + s * 0.3, (x, y, R) => `rgba(250,246,240,${0.25 + R() * 0.3})`, [10, 26], [0.8, 1.6]);
    g.restore();
  }
  g.restore();
  // outline shading at the head edge
  g.save(); g.clip(path); g.lineWidth = 26; g.strokeStyle = "rgba(30,26,23,.35)"; g.filter = "blur(10px)"; g.stroke(path); g.filter = "none"; g.restore();
  // eyes
  for (const s of [-1, 1]) {
    g.save(); g.translate(500 + s * 108, 470); g.rotate(s * 0.3);
    const eye = new Path2D(); eye.moveTo(-44, 4); eye.quadraticCurveTo(0, -30, 44, -2); eye.quadraticCurveTo(0, 26, -44, 4); eye.closePath();
    const ig = g.createRadialGradient(0, 0, 2, 0, 0, 34);
    ig.addColorStop(0, "#f2c76a"); ig.addColorStop(0.6, "#c58a2c"); ig.addColorStop(1, "#5a3a12");
    g.fillStyle = ig; g.fill(eye);
    g.fillStyle = "#0b0908"; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(-6, -7, 4, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = "#0f0d0c"; g.stroke(eye);
    g.restore();
  }
  // nose
  const nose = new Path2D();
  nose.moveTo(500, 728); nose.bezierCurveTo(440, 724, 432, 676, 448, 662); nose.bezierCurveTo(470, 646, 530, 646, 552, 662);
  nose.bezierCurveTo(568, 676, 560, 724, 500, 728); nose.closePath();
  const ng = g.createLinearGradient(0, 650, 0, 730); ng.addColorStop(0, "#3a3532"); ng.addColorStop(1, "#0b0a09");
  g.fillStyle = ng; g.fill(nose);
  g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(500, 668, 26, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#050404";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(500 + s * 22, 700, 12, 7, s * 0.4, 0, Math.PI * 2); g.fill(); }
  // mouth
  g.strokeStyle = "#1c1917"; g.lineWidth = 6; g.lineCap = "round";
  g.beginPath(); g.moveTo(500, 728); g.lineTo(500, 770); g.quadraticCurveTo(470, 800, 432, 790); g.moveTo(500, 770); g.quadraticCurveTo(530, 800, 568, 790); g.stroke();
  return c;
}

/* --------------------------------------------------------------- lion */
function lion() {
  const c = makeCanvas(1000, 1000), g = ctx2d(c);
  const R = rng(11);
  // mane: jagged radial shape
  const mane = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const spike = i % 2 ? 0.86 : 1;
    const rr = 430 * spike * (0.94 + R() * 0.1) * (Math.sin(a) > 0.3 ? 1.02 : 1);
    mane.push([500 + Math.cos(a) * rr * 0.92, 520 + Math.sin(a) * rr]);
  }
  const maneP = new Path2D();
  smoothPath(maneP, mane, true, 0.7);
  g.save(); g.clip(maneP);
  radial(g, 500, 540, 470, [[0, "#c79a52"], [0.55, "#8e6430"], [1, "#3e2a14"]]);
  furStrokes(g, maneP, 12000, 4, (x, y) => Math.atan2(y - 540, x - 500), (x, y, r) => r() > 0.45 ? `rgba(245,214,150,${0.2 + r() * 0.3})` : `rgba(40,25,10,${0.2 + r() * 0.3})`, [20, 60], [1.2, 3]);
  g.restore();
  // face
  const face = mirror([[500, 250], [580, 258], [650, 300], [690, 380], [700, 470], [680, 560], [660, 640], [620, 730], [570, 800], [500, 822]]);
  const faceP = new Path2D();
  smoothPath(faceP, face, true, 0.6);
  // ears
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(500 + s * 175, 290, 62, 56, s * 0.4, 0, Math.PI * 2);
    g.fillStyle = "#a27238"; g.fill();
    g.beginPath(); g.ellipse(500 + s * 175, 296, 34, 30, s * 0.4, 0, Math.PI * 2);
    g.fillStyle = "#3b2612"; g.fill();
  }
  g.save(); g.clip(faceP);
  const fg = g.createLinearGradient(0, 250, 0, 820); fg.addColorStop(0, "#b8853f"); fg.addColorStop(0.5, "#d2a35c"); fg.addColorStop(1, "#e8cfa0");
  g.fillStyle = fg; g.fillRect(0, 0, 1000, 1000);
  radial(g, 500, 690, 150, [[0, "rgba(250,240,220,.95)"], [1, "rgba(250,240,220,0)"]]);
  for (const s of [-1, 1]) {
    g.save(); g.translate(500 + s * 105, 470); g.scale(1.6, 0.8);
    radial(g, 0, 0, 60, [[0, "rgba(60,35,12,.7)"], [1, "rgba(60,35,12,0)"]]);
    g.restore();
    g.save(); g.translate(500 + s * 58, 590); g.scale(0.4, 1.4);
    radial(g, 0, 0, 80, [[0, "rgba(110,70,30,.5)"], [1, "rgba(110,70,30,0)"]]);
    g.restore();
  }
  radial(g, 500, 330, 140, [[0, "rgba(120,80,35,.45)"], [1, "rgba(120,80,35,0)"]]);
  furStrokes(g, faceP, 5000, 8, (x, y) => (y < 520 ? -Math.PI / 2 + (x - 500) / 400 : Math.atan2(y - 600, x - 500)), (x, y, r) => r() > 0.5 ? `rgba(255,240,210,${0.15 + r() * 0.2})` : `rgba(70,40,15,${0.12 + r() * 0.2})`, [6, 16], [0.8, 1.6]);
  g.restore();
  g.save(); g.clip(faceP); g.lineWidth = 30; g.strokeStyle = "rgba(60,35,12,.4)"; g.filter = "blur(10px)"; g.stroke(faceP); g.filter = "none"; g.restore();
  // eyes
  for (const s of [-1, 1]) {
    g.save(); g.translate(500 + s * 100, 472); g.rotate(s * 0.18);
    const eye = new Path2D(); eye.moveTo(-40, 4); eye.quadraticCurveTo(0, -26, 40, 0); eye.quadraticCurveTo(0, 22, -40, 4); eye.closePath();
    const ig = g.createRadialGradient(0, 0, 2, 0, 0, 30); ig.addColorStop(0, "#f0c060"); ig.addColorStop(1, "#7a4c12");
    g.fillStyle = ig; g.fill(eye);
    g.fillStyle = "#0b0805"; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(-6, -6, 3.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = "#1a0f06"; g.stroke(eye);
    g.restore();
  }
  // nose
  const nose = new Path2D();
  nose.moveTo(440, 640); nose.lineTo(560, 640); nose.quadraticCurveTo(560, 668, 500, 700); nose.quadraticCurveTo(440, 668, 440, 640); nose.closePath();
  g.fillStyle = "#4a2a1a"; g.fill(nose);
  g.fillStyle = "rgba(255,220,200,.35)"; g.beginPath(); g.ellipse(500, 652, 30, 7, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#2a160a"; g.lineWidth = 6; g.lineCap = "round";
  g.beginPath(); g.moveTo(500, 700); g.lineTo(500, 735); g.quadraticCurveTo(465, 770, 420, 752); g.moveTo(500, 735); g.quadraticCurveTo(535, 770, 580, 752); g.stroke();
  g.fillStyle = "rgba(60,30,10,.6)";
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(500 + s * (40 + k * 18), 712 + (k % 2) * 12, 3.5, 0, Math.PI * 2); g.fill(); }
  return c;
}

/* -------------------------------------------------------------- lotus */
function lotus() {
  const c = makeCanvas(1000, 1000), g = ctx2d(c);
  const petal = (ang, len, wid, cx, cy, c0, c1) => {
    g.save(); g.translate(cx, cy); g.rotate(ang);
    const p = new Path2D();
    p.moveTo(0, 0); p.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.75, 0, -len); p.bezierCurveTo(-wid * 0.8, -len * 0.75, -wid, -len * 0.25, 0, 0); p.closePath();
    const gr = g.createLinearGradient(0, 0, 0, -len); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fill(p);
    g.save(); g.clip(p);
    g.strokeStyle = "rgba(120,40,70,.25)"; g.lineWidth = 2;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, -len * 0.05); g.quadraticCurveTo(k * wid * 0.25, -len * 0.5, k * wid * 0.1, -len * 0.95); g.stroke(); }
    g.restore();
    g.lineWidth = 3; g.strokeStyle = "rgba(110,35,60,.45)"; g.stroke(p);
    g.restore();
  };
  const cx = 500, cy = 700;
  // leaves / water pads
  g.save(); g.translate(500, 760); g.scale(1, 0.28);
  const lg = g.createRadialGradient(0, 0, 40, 0, 0, 430); lg.addColorStop(0, "#5f8a4a"); lg.addColorStop(1, "#22401c");
  g.fillStyle = lg; g.beginPath(); g.arc(0, 0, 430, 0.15, Math.PI * 2 - 0.15); g.lineTo(0, 0); g.closePath(); g.fill();
  g.restore();
  const back = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25];
  for (const a of back) petal(a, 380, 120, cx, cy, "#f2c4d4", "#d9688f");
  const mid = [-0.95, -0.48, 0, 0.48, 0.95];
  for (const a of mid) petal(a, 420, 125, cx, cy + 6, "#fbe3ea", "#e47a9e");
  const front = [-0.55, 0, 0.55];
  for (const a of front) petal(a, 330, 140, cx, cy + 20, "#fff4f7", "#ec9ab5");
  for (const a of [-1.45, 1.45]) petal(a, 300, 110, cx, cy + 28, "#f7d6e1", "#cf5f86");
  return c;
}

/* ---------------------------------------------------------- landscapes */
function ridge(R, w, y0, amp, rough, n = 9) {
  // midpoint displacement
  let pts = [[0, y0 + (R() - 0.5) * amp], [w, y0 + (R() - 0.5) * amp]];
  let a = amp;
  for (let k = 0; k < n; k++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      next.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + (R() - 0.5) * a], q);
    }
    pts = next; a *= rough;
  }
  return pts;
}
function mountains() {
  const W = 1000, H = 720;
  const c = makeCanvas(W, H), g = ctx2d(c);
  const R = rng(42);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#c9d6e2"); sky.addColorStop(0.55, "#eef0ee"); sky.addColorStop(1, "#f6f1e8");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  radial(g, 690, 250, 120, [[0, "rgba(255,255,255,1)"], [0.45, "rgba(255,250,235,.9)"], [1, "rgba(255,250,235,0)"]]);
  g.fillStyle = "#fffaf0"; g.beginPath(); g.arc(690, 250, 52, 0, Math.PI * 2); g.fill();
  const layers = [
    { y: 330, amp: 340, rough: 0.52, col: ["#8d9cab", "#b9c4cd"], snow: true },
    { y: 430, amp: 230, rough: 0.5, col: ["#5f6f7e", "#8e9aa5"], snow: true },
    { y: 520, amp: 150, rough: 0.55, col: ["#3a4652", "#5b6772"] },
    { y: 610, amp: 90, rough: 0.6, col: ["#1d242b", "#2f3740"], trees: true },
  ];
  for (const L of layers) {
    const pts = ridge(R, W, L.y, L.amp, L.rough);
    // sharpen a single main peak on the far layers
    const p = new Path2D();
    p.moveTo(0, H); for (const [x, y] of pts) p.lineTo(x, y); p.lineTo(W, H); p.closePath();
    const gr = g.createLinearGradient(0, L.y - L.amp / 2, 0, H);
    gr.addColorStop(0, L.col[1]); gr.addColorStop(1, L.col[0]);
    g.fillStyle = gr; g.fill(p);
    // light from the right: shade left-facing slopes
    g.save(); g.clip(p);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (y1 < y0) continue; // slope going down to the right → facing the sun
      g.fillStyle = "rgba(10,15,25,.10)";
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + 60, H); g.lineTo(x0 + 60, H); g.closePath(); g.fill();
    }
    if (L.snow) {
      let top = Infinity; for (const [, y] of pts) top = Math.min(top, y);
      const line = top + L.amp * 0.22;
      g.fillStyle = "rgba(255,255,255,.88)";
      g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= W; x += 18) g.lineTo(x, line + Math.sin(x * 0.05) * 10 + (R() - 0.5) * 22);
      g.lineTo(W, 0); g.closePath(); g.fill();
    }
    g.restore();
    // mist above the next layer
    const mist = g.createLinearGradient(0, L.y + 40, 0, L.y + 160);
    mist.addColorStop(0, "rgba(240,242,240,0)"); mist.addColorStop(1, "rgba(240,242,240,.35)");
    g.fillStyle = mist; g.fillRect(0, L.y + 40, W, 120);
    if (L.trees) {
      g.fillStyle = "#12171c";
      for (let x = -10; x < W + 20; x += 14 + R() * 26) {
        let y = H; for (const [px, py] of pts) if (Math.abs(px - x) < 6) y = py;
        const h = 40 + R() * 70;
        pine(g, x, y + 6, h, h * 0.3);
      }
    }
  }
  return c;
}
function pine(g, x, y, h, w) {
  g.beginPath();
  const tiers = 5;
  g.moveTo(x, y - h);
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers;
    g.lineTo(x + w * t, y - h + h * t * 0.92);
    g.lineTo(x + w * t * 0.45, y - h + h * t * 0.92);
  }
  g.lineTo(x + w * 0.08, y); g.lineTo(x - w * 0.08, y);
  for (let i = tiers; i >= 1; i--) {
    const t = i / tiers;
    g.lineTo(x - w * t * 0.45, y - h + h * t * 0.92);
    g.lineTo(x - w * t, y - h + h * t * 0.92);
  }
  g.closePath(); g.fill();
}
function forest() {
  const W = 1000, H = 760;
  const c = makeCanvas(W, H), g = ctx2d(c);
  const R = rng(7);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#dfe4e6"); sky.addColorStop(1, "#f4f2ee");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  radial(g, 300, 200, 90, [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]);
  g.fillStyle = "#fbfaf6"; g.beginPath(); g.arc(300, 200, 46, 0, Math.PI * 2); g.fill();
  const rows = [
    { base: 470, h: [120, 200], col: "#9aa5a8", gap: [18, 30] },
    { base: 560, h: [170, 280], col: "#66737a", gap: [20, 36] },
    { base: 660, h: [230, 380], col: "#333d43", gap: [26, 46] },
    { base: 780, h: [320, 520], col: "#12171b", gap: [60, 110] },
  ];
  for (const row of rows) {
    g.fillStyle = row.col;
    g.fillRect(0, row.base - 4, W, H);
    for (let x = -20; x < W + 40; x += row.gap[0] + R() * (row.gap[1] - row.gap[0])) {
      const h = row.h[0] + R() * (row.h[1] - row.h[0]);
      pine(g, x, row.base, h, h * 0.22);
    }
    const mist = g.createLinearGradient(0, row.base - 160, 0, row.base + 20);
    mist.addColorStop(0, "rgba(236,238,236,0)"); mist.addColorStop(1, "rgba(236,238,236,.55)");
    g.fillStyle = mist; g.fillRect(0, row.base - 160, W, 180);
  }
  return c;
}
