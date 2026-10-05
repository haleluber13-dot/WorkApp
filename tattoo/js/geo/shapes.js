/* Geometric maker — shape catalog and geometry.
   Every shape is built in its own local frame centred on (0, 0), filling the
   box [-w/2, w/2] × [-h/2, h/2]. Geometry is plain polylines so outlines,
   offsets, vertex dots, clipping and hit testing all share one code path:
     regions  closed polygons that make the fillable area (rule evenodd/nonzero)
     lines    extra strokes drawn with the outline (open or closed)
     verts    corner points (for "dots at vertices")
     dots     filled dots that are part of the drawing ([x, y, r])
     solids   polygons always filled with ink (e.g. divider diamond) */

import { pointInPoly, distToSegment } from "./delaunay.js";

const TAU = Math.PI * 2;
const R3 = Math.sqrt(3);
const PHI = (1 + Math.sqrt(5)) / 2;

/* label, group, default size, params, default style */
export const SHAPES = {
  circle:    { label: "Circle", group: "Basic", w: 520, h: 520 },
  ring:      { label: "Ring", group: "Basic", w: 520, h: 520, params: [{ key: "thick", label: "Ring width", min: 0.04, max: 0.9, step: 0.01, def: 0.16 }], fill: "ink" },
  half:      { label: "Half circle", group: "Basic", w: 560, h: 280 },
  arch:      { label: "Arch", group: "Basic", w: 420, h: 600 },
  crescent:  { label: "Crescent moon", group: "Basic", w: 460, h: 460, params: [{ key: "phase", label: "Thickness", min: 0.12, max: 0.9, step: 0.01, def: 0.42 }], fill: "ink" },
  heart:     { label: "Heart", group: "Basic", w: 500, h: 460 },
  triangle:  { label: "Triangle", group: "Polygons", w: 600, h: 520 },
  triangleDown: { label: "Triangle down", group: "Polygons", w: 600, h: 520 },
  square:    { label: "Square", group: "Polygons", w: 480, h: 480, params: [{ key: "round", label: "Round corners", min: 0, max: 0.5, step: 0.01, def: 0 }] },
  diamond:   { label: "Diamond", group: "Polygons", w: 420, h: 600 },
  rhombus:   { label: "Rhombus", group: "Polygons", w: 600, h: 340, params: [{ key: "skew", label: "Slant", min: -0.7, max: 0.7, step: 0.01, def: 0.35 }] },
  pentagon:  { label: "Pentagon", group: "Polygons", w: 520, h: 496 },
  hexagon:   { label: "Hexagon", group: "Polygons", w: 451, h: 520 },
  octagon:   { label: "Octagon", group: "Polygons", w: 500, h: 500 },
  ngon:      { label: "Polygon (N sides)", group: "Polygons", w: 520, h: 520, params: [{ key: "sides", label: "Sides", min: 3, max: 12, step: 1, def: 7 }] },
  star:      { label: "Star", group: "Polygons", w: 540, h: 520, params: [{ key: "points", label: "Points", min: 3, max: 16, step: 1, def: 5 }, { key: "inner", label: "Inner radius", min: 0.12, max: 0.92, step: 0.01, def: 0.45 }] },
  mountain:  { label: "Mountain", group: "Symbols", w: 640, h: 400, params: [{ key: "peaks", label: "Peaks", min: 1, max: 3, step: 1, def: 2 }, { key: "snow", label: "Snow line", type: "bool", def: true }] },
  arrow:     { label: "Arrow", group: "Symbols", w: 720, h: 130, fill: "ink", line: 0, params: [{ key: "feathers", label: "Feathers", min: 0, max: 5, step: 1, def: 3 }] },
  divider:   { label: "Line / divider", group: "Symbols", w: 620, h: 40, fill: "none", lineOnly: true, params: [{ key: "style", label: "Style", type: "select", def: "diamond", choices: [["plain", "Plain"], ["dots", "Dot ends"], ["diamond", "Diamond"], ["dotted", "Dotted"], ["triple", "Three dots"]] }] },
  dotted:    { label: "Dotted circle", group: "Symbols", w: 560, h: 560, fill: "none", line: 0, params: [{ key: "count", label: "Dots", min: 6, max: 90, step: 1, def: 36 }, { key: "dot", label: "Dot size", min: 0.003, max: 0.04, step: 0.001, def: 0.011 }] },
  nested:    { label: "Nested shapes", group: "Symbols", w: 560, h: 560, fill: "none", params: [{ key: "base", label: "Shape", type: "select", def: "circle", choices: [["circle", "Circle"], ["triangle", "Triangle"], ["square", "Square"], ["diamond", "Diamond"], ["hexagon", "Hexagon"]] }, { key: "copies", label: "Copies", min: 2, max: 12, step: 1, def: 4 }, { key: "spacing", label: "Spacing", min: 0.02, max: 0.3, step: 0.005, def: 0.1 }] },
  seed:      { label: "Seed of life", group: "Sacred geometry", w: 560, h: 560, fill: "none", lineW: 3 },
  flower:    { label: "Flower of life", group: "Sacred geometry", w: 600, h: 600, fill: "none", lineW: 3 },
  metatron:  { label: "Metatron's cube", group: "Sacred geometry", w: 600, h: 600, fill: "none", lineW: 2.5 },
  sriyantra: { label: "Sri yantra", group: "Sacred geometry", w: 600, h: 600, fill: "none", lineW: 3 },
  spiral:    { label: "Golden spiral", group: "Sacred geometry", w: 660, h: 408, fill: "none", lineW: 3 },
  image:     { label: "Photo", group: null, w: 600, h: 600, fill: "photo", line: 0 },
};
export const SHAPE_GROUPS = ["Basic", "Polygons", "Symbols", "Sacred geometry"];

export function defaultParams(type) {
  const p = {};
  for (const d of SHAPES[type]?.params || []) p[d.key] = d.def;
  return p;
}

/* ---------------------------------------------------------- primitives */
function ellipse(rx, ry, cx = 0, cy = 0, n) {
  n = n || Math.max(48, Math.min(240, Math.round((rx + ry) * 0.6)));
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function arc(cx, cy, rx, ry, a0, a1, n) {
  n = n || Math.max(8, Math.round(Math.abs(a1 - a0) / TAU * Math.max(48, (rx + ry) * 0.6)));
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function regular(n, start = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = start + (i / n) * TAU; pts.push([Math.cos(a), Math.sin(a)]); }
  return pts;
}
/* normalise unit-space polygons so their joint bbox is [-1,1]² */
function normalize(polys, keepAspect = false) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let sx = 2 / (x1 - x0 || 1), sy = 2 / (y1 - y0 || 1);
  if (keepAspect) sx = sy = Math.min(sx, sy);
  return { f: (pt) => [(pt[0] - cx) * sx, (pt[1] - cy) * sy], sx, sy };
}
const scalePts = (pts, rx, ry) => pts.map(([x, y]) => [x * rx, y * ry]);

function unitPolygon(type, p) {
  switch (type) {
    case "triangle": return [[0, -1], [1, 1], [-1, 1]];
    case "triangleDown": return [[-1, -1], [1, -1], [0, 1]];
    case "diamond": return [[0, -1], [1, 0], [0, 1], [-1, 0]];
    case "pentagon": return regular(5);
    case "hexagon": return regular(6);
    case "octagon": return regular(8, -Math.PI / 2 + Math.PI / 8);
    case "ngon": { const n = Math.round(p.sides || 7); return regular(n, n % 2 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / n); }
    case "square": return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    case "rhombus": { const s = p.skew ?? 0.35; return [[-1 + Math.max(0, s), -1], [1 + Math.min(0, s), -1], [1 - Math.max(0, s), 1], [-1 - Math.min(0, s), 1]]; }
    case "star": {
      const n = Math.round(p.points || 5), inner = p.inner ?? 0.45, pts = [];
      for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * TAU, r = i % 2 ? inner : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return pts;
    }
  }
  return null;
}
function fitUnit(pts) { const { f } = normalize([pts]); return pts.map(f); }

function roundedRect(rx, ry, r) {
  r = Math.min(r, rx, ry);
  if (r < 0.5) return [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]];
  const pts = [];
  const corners = [[rx - r, -ry + r, -Math.PI / 2], [rx - r, ry - r, 0], [-rx + r, ry - r, Math.PI / 2], [-rx + r, -ry + r, Math.PI]];
  for (const [cx, cy, a0] of corners) pts.push(...arc(cx, cy, r, r, a0, a0 + Math.PI / 2, 10));
  return pts;
}

function heartUnit() {
  const pts = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * TAU;
    pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return fitUnit(pts);
}

function crescentUnit(phase) {
  // outer unit circle minus a same-size circle shifted right by d
  const d = 2 * (1 - phase) * 0.92 + 0.08;
  const y = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
  const b = Math.atan2(y, d / 2);
  const outer = arc(0, 0, 1, 1, b, TAU - b, 120);
  const inner = arc(d, 0, 1, 1, Math.PI + b, Math.PI - b, 90);
  const pts = outer.concat(inner.slice(1, -1));
  // keep the crescent centred in its box
  return { pts: pts.map(([x, yy]) => [x, yy]), tips: [[d / 2, -y], [d / 2, y]] };
}

function mountainUnit(peaks, snow) {
  const tents = peaks <= 1 ? [[0, 1, 1]] : peaks === 2 ? [[-0.2, 1, 0.8], [0.45, 0.64, 0.55]] : [[-0.05, 1, 0.62], [-0.62, 0.58, 0.38], [0.55, 0.7, 0.45]];
  const hAt = (x) => { let m = 0; for (const [c, h, w] of tents) m = Math.max(m, h * (1 - Math.abs(x - c) / w)); return m; };
  const xs = new Set([-1, 1]);
  for (const [c, h, w] of tents) { xs.add(c); xs.add(Math.max(-1, c - w)); xs.add(Math.min(1, c + w)); }
  // intersections between tents (valleys)
  for (const a of tents) for (const b of tents) if (a !== b) {
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      // h_a(1 - sa(x-ca)/wa) = h_b(1 - sb(x-cb)/wb)
      const ka = -sa * a[1] / a[2], kb = -sb * b[1] / b[2];
      const ca = a[1] + sa * a[1] * a[0] / a[2], cb = b[1] + sb * b[1] * b[0] / b[2];
      if (Math.abs(ka - kb) > 1e-9) { const x = (cb - ca) / (ka - kb); if (x > -1 && x < 1) xs.add(x); }
    }
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const top = sorted.map((x) => [x, 1 - 2 * hAt(x)]);
  const poly = [...top, [1, 1], [-1, 1]];
  const lines = [], verts = [];
  for (const [c, h, w] of tents) {
    if (hAt(c) > h + 1e-6) continue;
    verts.push([c, 1 - 2 * h]);
    if (!snow) continue;
    const hs = h * 0.68, half = w * (1 - hs / h);
    const n = 4, z = [];
    for (let i = 0; i <= n; i++) {
      const x = c - half + (2 * half * i) / n;
      const dip = i % 2 ? 0.1 * h : 0;
      z.push([x, 1 - 2 * (hs - dip)]);
    }
    // only keep the bits that sit on this peak's face
    const ok = z.every(([x, y]) => 1 - 2 * hAt(x) <= y + 1e-6);
    if (ok) lines.push({ pts: z, closed: false });
  }
  verts.push([-1, 1], [1, 1]);
  return { poly, lines, verts };
}

function spiralUnit() {
  // golden rectangle φ×1 with nested squares and the quarter-arc spiral
  let x = 0, y = 0, w = PHI, h = 1;
  const lines = [], spiral = [];
  for (let i = 0; i < 9; i++) {
    const dir = i % 4;
    if (dir === 0) { // square on the left
      const s = h;
      lines.push([[x + s, y], [x + s, y + h]]);
      spiral.push(...arc(x + s, y + s, s, s, Math.PI, 1.5 * Math.PI, 24));
      x += s; w -= s;
    } else if (dir === 1) { // square on top
      const s = w;
      lines.push([[x, y + s], [x + w, y + s]]);
      spiral.push(...arc(x, y + s, s, s, 1.5 * Math.PI, 2 * Math.PI, 24));
      y += s; h -= s;
    } else if (dir === 2) { // square on the right
      const s = h;
      lines.push([[x + w - s, y], [x + w - s, y + h]]);
      spiral.push(...arc(x + w - s, y, s, s, 0, 0.5 * Math.PI, 24));
      w -= s;
    } else { // square at the bottom
      const s = w;
      lines.push([[x, y + h - s], [x + w, y + h - s]]);
      spiral.push(...arc(x + w, y + h - s, s, s, 0.5 * Math.PI, Math.PI, 24));
      h -= s;
    }
  }
  const map = ([px, py]) => [(px / PHI) * 2 - 1, py * 2 - 1];
  return {
    rect: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    lines: lines.map((l) => ({ pts: l.map(map), closed: false })).concat([{ pts: spiral.map(map), closed: false }]),
  };
}

function lattice(radius, step, angle0 = 0) {
  const out = [];
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
    const x = i * step + j * step / 2, y = j * step * R3 / 2;
    if (Math.hypot(x, y) <= radius + 1e-6) {
      const c = Math.cos(angle0), s = Math.sin(angle0);
      out.push([x * c - y * s, x * s + y * c]);
    }
  }
  return out;
}

/* ------------------------------------------------------------- builder */
const GEOM_CACHE = new Map();
export function shapeGeom(shape) {
  const key = shape.type + "|" + Math.round(shape.w * 10) + "|" + Math.round(shape.h * 10) + "|" + JSON.stringify(shape.p || {});
  let g = GEOM_CACHE.get(key);
  if (g) return g;
  g = buildGeom(shape.type, shape.w / 2, shape.h / 2, { ...defaultParams(shape.type), ...(shape.p || {}) });
  g.rule = g.rule || "evenodd";
  g.lines = g.lines || []; g.verts = g.verts || []; g.dots = g.dots || []; g.solids = g.solids || [];
  if (g.strokeRegions === undefined) g.strokeRegions = true;
  if (GEOM_CACHE.size > 300) GEOM_CACHE.clear();
  GEOM_CACHE.set(key, g);
  return g;
}

function buildGeom(type, rx, ry, p) {
  const S = (pts) => scalePts(pts, rx, ry);
  const poly = unitPolygon(type, p);
  if (poly) {
    const pts = S(fitUnit(poly));
    if (type === "square" && p.round > 0) {
      return { regions: [roundedRect(rx, ry, p.round * Math.min(rx, ry) * 2)], verts: p.round > 0.02 ? [] : pts };
    }
    return { regions: [pts], verts: pts };
  }
  switch (type) {
    case "image": return { regions: [[[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]]], verts: [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]] };
    case "circle": return { regions: [ellipse(rx, ry)] };
    case "ring": {
      const t = Math.min(0.95, p.thick ?? 0.16);
      return { regions: [ellipse(rx, ry), ellipse(rx * (1 - t), ry * (1 - t))] };
    }
    case "half": {
      // flat side at the bottom: semi-ellipse with radii rx, 2ry
      const pts = arc(0, ry, rx, 2 * ry, Math.PI, TAU, 120);
      return { regions: [pts], verts: [[-rx, ry], [rx, ry]] };
    }
    case "arch": {
      const a = Math.min(rx, ry * 2);
      const pts = arc(0, -ry + a, rx, a, Math.PI, TAU, 90);
      pts.push([rx, ry], [-rx, ry]);
      return { regions: [pts], verts: [[rx, ry], [-rx, ry]] };
    }
    case "heart": return { regions: [S(heartUnit())] };
    case "crescent": {
      const c = crescentUnit(p.phase ?? 0.42);
      return { regions: [S(c.pts)], verts: S(c.tips) };
    }
    case "mountain": {
      const m = mountainUnit(Math.round(p.peaks || 1), p.snow !== false);
      return { regions: [S(m.poly)], lines: m.lines.map((l) => ({ pts: S(l.pts), closed: false })), verts: S(m.verts) };
    }
    case "arrow": {
      const t = Math.max(1.5, ry * 0.075);
      const headL = Math.min(rx * 0.3, ry * 1.6), headW = ry * 0.62;
      const shaft = [[-rx * 0.94, -t], [rx - headL * 0.8, -t], [rx - headL * 0.8, t], [-rx * 0.94, t]];
      const head = [[rx - headL, -headW], [rx, 0], [rx - headL, headW], [rx - headL * 0.82, 0]];
      const regions = [shaft, head];
      const nf = Math.round(p.feathers ?? 3);
      const fw = Math.max(3, rx * 0.035), fl = Math.min(rx * 0.12, ry * 0.9);
      for (let i = 0; i < nf; i++) {
        const x0 = -rx * 0.94 + fl + i * fw * 1.9;
        regions.push([[x0, -t], [x0 + fw, -t], [x0 + fw - fl, -ry * 0.92], [x0 - fl, -ry * 0.92]]);
        regions.push([[x0, t], [x0 + fw, t], [x0 + fw - fl, ry * 0.92], [x0 - fl, ry * 0.92]]);
      }
      return { regions, rule: "nonzero", verts: [[rx, 0]] };
    }
    case "divider": {
      const st = p.style || "plain";
      const lines = [], dots = [], solids = [];
      const dr = Math.max(3, ry * 0.32);
      if (st === "dotted") {
        const n = Math.max(6, Math.round(rx / (dr * 1.6)));
        for (let i = 0; i <= n; i++) dots.push([-rx + (2 * rx * i) / n, 0, dr * 0.55]);
      } else if (st === "diamond") {
        const dw = Math.min(ry * 1.3, rx * 0.12), dh = ry;
        solids.push([[0, -dh], [dw, 0], [0, dh], [-dw, 0]]);
        lines.push({ pts: [[-rx, 0], [-dw * 1.6, 0]], closed: false }, { pts: [[dw * 1.6, 0], [rx, 0]], closed: false });
        dots.push([-rx, 0, dr * 0.6], [rx, 0, dr * 0.6]);
      } else if (st === "triple") {
        const g = dr * 2.6;
        lines.push({ pts: [[-rx, 0], [-g * 1.9, 0]], closed: false }, { pts: [[g * 1.9, 0], [rx, 0]], closed: false });
        dots.push([-g, 0, dr * 0.55], [0, 0, dr * 0.8], [g, 0, dr * 0.55]);
      } else {
        lines.push({ pts: [[-rx, 0], [rx, 0]], closed: false });
        if (st === "dots") dots.push([-rx, 0, dr], [rx, 0, dr]);
      }
      return { regions: [], lines, dots, solids, verts: [[-rx, 0], [rx, 0]] };
    }
    case "dotted": {
      const n = Math.round(p.count || 36), r = (p.dot ?? 0.011) * (rx + ry);
      const dots = [];
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * TAU; dots.push([Math.cos(a) * (rx - r), Math.sin(a) * (ry - r), r]); }
      return { regions: [ellipse(rx - r * 2.2, ry - r * 2.2)], strokeRegions: false, dots };
    }
    case "nested": {
      const base = p.base || "circle", n = Math.round(p.copies || 4), sp = p.spacing ?? 0.1;
      const unit = base === "circle" ? ellipse(1, 1, 0, 0, 160) : fitUnit(unitPolygon(base, {}));
      const outer = S(unit);
      const lines = [], verts = [...outer.filter(() => base !== "circle")];
      for (let i = 1; i < n; i++) {
        const k = 1 - i * sp;
        if (k <= 0.03) break;
        // keep the centroid of triangles steady by scaling about the incentre-ish
        const cy = base === "triangle" ? ry * 0.33 * (1 - k) : 0;
        const pts = outer.map(([x, y]) => [x * k, y * k + cy]);
        lines.push({ pts, closed: true });
        if (base !== "circle") verts.push(...pts);
      }
      return { regions: [outer], lines, verts };
    }
    case "seed": {
      const s = 0.5;
      const cs = [[0, 0], ...regular(6).map(([x, y]) => [x * s, y * s])];
      return {
        regions: [ellipse(rx, ry)],
        lines: cs.map(([x, y]) => ({ pts: ellipse(s * rx, s * ry, x * rx, y * ry, 120), closed: true })),
        verts: S(cs),
      };
    }
    case "flower": {
      const s = 1 / 3.15;
      const cs = lattice(2 * s, s, Math.PI / 2);
      const lines = cs.map(([x, y]) => ({ pts: ellipse(s * rx, s * ry, x * rx, y * ry, 96), closed: true }));
      lines.push({ pts: ellipse(rx * 3 * s, ry * 3 * s, 0, 0, 200), closed: true });
      return { regions: [ellipse(rx, ry)], lines, verts: S(cs) };
    }
    case "metatron": {
      const r = 1 / 5;
      const cs = [[0, 0], ...regular(6).map(([x, y]) => [x * 2 * r, y * 2 * r]), ...regular(6).map(([x, y]) => [x * 4 * r, y * 4 * r])];
      const lines = cs.map(([x, y]) => ({ pts: ellipse(r * rx, r * ry, x * rx, y * ry, 72), closed: true }));
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) lines.push({ pts: S([cs[i], cs[j]]), closed: false });
      return { regions: [ellipse(rx, ry)], strokeRegions: false, lines, verts: S(cs) };
    }
    case "sriyantra": {
      const R = 0.74;
      const half = (y) => Math.sqrt(Math.max(0, R * R - y * y));
      const ups = [[-R, 0.42], [-0.5, 0.56], [-0.32, 0.24], [-0.15, 0.13]];
      const downs = [[R, -0.44], [0.6, -0.58], [0.4, -0.2], [0.27, -0.36], [0.1, -0.06]];
      const lines = [];
      for (const [ay, by] of ups.concat(downs)) {
        const hw = half(by) * (Math.abs(ay) < 0.4 ? 0.82 : 1);
        lines.push({ pts: S([[0, ay], [hw, by], [-hw, by]]), closed: true });
      }
      lines.push({ pts: ellipse(rx * 0.8, ry * 0.8, 0, 0, 160), closed: true });
      // lotus petals
      const petals = 8, r1 = 0.8, r2 = 0.94;
      const pet = [];
      for (let i = 0; i < petals; i++) {
        const a0 = (i / petals) * TAU, a1 = ((i + 1) / petals) * TAU, am = (a0 + a1) / 2;
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, a = a0 + (a1 - a0) * t;
          const bulge = Math.sin(t * Math.PI);
          const rr = r1 + (r2 - r1) * Math.pow(bulge, 0.6);
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        void am;
        pet.push(...pts);
      }
      lines.push({ pts: S(pet), closed: true });
      return { regions: [ellipse(rx, ry)], lines, dots: [[0, 0, Math.max(3, (rx + ry) * 0.012)]], verts: [] };
    }
    case "spiral": {
      const sp = spiralUnit();
      return { regions: [S(sp.rect)], lines: sp.lines.map((l) => ({ pts: S(l.pts), closed: false })), verts: S(sp.rect) };
    }
  }
  return { regions: [ellipse(rx, ry)] };
}

/* ------------------------------------------------------- path building */
export function polysToPath(polys, closed = true, path = new Path2D()) {
  for (const pts of polys) {
    if (!pts || pts.length < 2) continue;
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    if (closed) path.closePath();
  }
  return path;
}

function filledAt(g, x, y) {
  if (g.rule === "nonzero") return g.regions.some((r) => pointInPoly(x, y, r));
  let c = 0; for (const r of g.regions) if (pointInPoly(x, y, r)) c++;
  return c % 2 === 1;
}

/* Offset closed region outlines by d (positive = away from the filled area). */
export function offsetRegions(g, d) {
  if (!d) return g.regions;
  return g.regions.map((poly) => offsetPoly(poly, d, g));
}
function offsetPoly(poly, d, g) {
  const n = poly.length;
  if (n < 3) return poly;
  // which side is filled? probe the middle of the longest edge
  let best = 0, bl = -1;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = i; } }
  const a = poly[best], b = poly[(best + 1) % n];
  const ex = (b[0] - a[0]) / bl, ey = (b[1] - a[1]) / bl;
  const eps = Math.max(0.5, bl * 0.01);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  // left normal (-ey, ex); outward is the side that is NOT filled
  const leftFilled = filledAt(g, mx - ey * eps, my + ex * eps);
  const sgn = leftFilled ? -1 : 1; // multiply left normal by sgn to point outward
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e2x = p2[0] - p1[0], e2y = p2[1] - p1[1];
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = -e1y * sgn, n1y = e1x * sgn, n2x = -e2y * sgn, n2y = e2x * sgn;
    let bx = n1x + n2x, by = n1y + n2y;
    const blen = Math.hypot(bx, by);
    if (blen < 1e-6) { bx = n1x; by = n1y; } else { bx /= blen; by /= blen; }
    const cos = bx * n1x + by * n1y;
    const k = d / Math.max(0.28, cos);
    out.push([p1[0] + bx * k, p1[1] + by * k]);
  }
  return out;
}

/* Is the local point on the shape? tol in local px. */
export function hitShape(shape, x, y, tol = 6) {
  const g = shapeGeom(shape);
  const rx = shape.w / 2, ry = shape.h / 2;
  if (x < -rx - tol - 30 || x > rx + tol + 30 || y < -ry - tol - 30 || y > ry + tol + 30) return false;
  if (g.regions.length && filledAt(g, x, y)) {
    // rings / outline-only shapes: the hole counts when it is small or the shape has no fill
    return true;
  }
  const near = (pts, closed) => {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (distToSegment(x, y, a[0], a[1], b[0], b[1]) <= tol) return true;
    }
    return false;
  };
  for (const r of g.regions) if (near(r, true)) return true;
  for (const l of g.lines) if (near(l.pts, l.closed)) return true;
  for (const [dx, dy, r] of g.dots) if (Math.hypot(x - dx, y - dy) <= r + tol) return true;
  for (const s of g.solids) if (pointInPoly(x, y, s) || near(s, true)) return true;
  // hollow shapes (rings, outline-only): accept clicks inside the outer bounds
  if ((shape.fill?.kind || "none") === "none" || shape.type === "ring" || shape.type === "dotted") {
    const outer = g.regions[0];
    if (outer && pointInPoly(x, y, outer)) return true;
  }
  return false;
}

/* Small inline SVG icon for a shape type, drawn from its real geometry. */
export function shapeIconSVG(type, size = 28) {
  const def = SHAPES[type];
  const ar = def.w / def.h;
  const w = ar >= 1 ? 22 : 22 * ar, h = ar >= 1 ? 22 / ar : 22;
  const shape = { type, w: Math.max(4, w), h: Math.max(type === "divider" ? 3 : 4, h), p: defaultParams(type) };
  if (type === "divider") { shape.w = 22; shape.h = 3; }
  if (type === "arrow") { shape.w = 24; shape.h = 7; }
  if (type === "dotted") shape.p = { count: 14, dot: 0.04 };
  if (type === "nested") shape.p = { base: "circle", copies: 3, spacing: 0.24 };
  const g = buildGeom(type, shape.w / 2, shape.h / 2, shape.p);
  const fmt = (pts, closed) => pts.length < 2 ? "" : "M" + pts.map((q) => `${(q[0] + 12).toFixed(1)} ${(q[1] + 12).toFixed(1)}`).join("L") + (closed ? "Z" : "");
  let body = "";
  const filled = def.fill === "ink" ? ' fill="currentColor" fill-opacity=".9"' : ' fill="none"';
  if (g.regions.length && g.strokeRegions !== false) body += `<path d="${g.regions.map((r) => fmt(r, true)).join("")}"${filled} fill-rule="${g.rule || "evenodd"}"/>`;
  if (g.lines?.length) body += `<path d="${g.lines.map((l) => fmt(l.pts, l.closed)).join("")}" fill="none" stroke-width="${type === "metatron" ? 0.5 : 0.9}"/>`;
  for (const [x, y, r] of g.dots || []) body += `<circle cx="${(x + 12).toFixed(1)}" cy="${(y + 12).toFixed(1)}" r="${Math.max(0.7, r).toFixed(1)}" fill="currentColor" stroke="none"/>`;
  for (const s of g.solids || []) body += `<path d="${fmt(s, true)}" fill="currentColor" stroke="none"/>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
}
