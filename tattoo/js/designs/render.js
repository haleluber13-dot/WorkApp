// Motif treatments: turn a motif (layered paths) into styled SVG.
//
// Motif = { box:[x0,y0,w,h], els:[El] }  (els in painter's order)
// El = { t:"part", d, role, rule?, noStroke?, noFill? }  closed region (role picks a color)
//    | { t:"line", d, w? }      inner detail stroke (w = weight multiplier, default .7)
//    | { t:"dark", d, rule? }   always-solid ink region (eyes, pupils, nostrils)
//    | { t:"shine", d }         white highlight (color styles)
//    | { t:"shade", d }         shadow region (color / dotwork / hatch shading)

import {
  INK, f1, f2, samplePath, bboxOfPolys, inPolys, inPolysNZ, distToPolys, delaunay, makeNoise,
  makeRng, dotsPath, resample, wobble, clamp, polyD,
} from "./core.js";

export const PALETTES = {
  traditional: { grey: "#8d949c", orange: "#e8792b", cream: "#f6e7c8", main: "#c62a22", second: "#2f6f3a", leaf: "#2f7a3b", accent: "#f2b927", gold: "#f0b429", blue: "#1f5aa6", dark: INK, light: "#fbf3e4", skin: "#f3c9a0", metal: "#c9d3dc", sand: "#e7b65b", gem: "#5bb7d8", fire: "#e2481c", fire2: "#f6c431", brown: "#7b4a22", purple: "#6a3d8f", white: "#ffffff", water: "#2a78b8", pink: "#e86a7a" },
  neo: { grey: "#7d8790", orange: "#d4702e", cream: "#efdcbc", main: "#a3233a", second: "#24585a", leaf: "#3d6b3a", accent: "#d99a2b", gold: "#c9962e", blue: "#2c4f80", dark: INK, light: "#f4e6cf", skin: "#e8b48f", metal: "#9fb0bd", sand: "#d39a4a", gem: "#3e9aa8", fire: "#c8481f", fire2: "#e8a33a", brown: "#6b3e26", purple: "#5b3a73", white: "#fff8ee", water: "#2d6f8f", pink: "#d0607a" },
  muted: { grey: "#8e9296", orange: "#c27a45", cream: "#ece0c8", main: "#9c3b35", second: "#4f6b4a", leaf: "#5a7a4e", accent: "#c79a4a", gold: "#bf9346", blue: "#3f5f80", dark: INK, light: "#efe4d2", skin: "#dcb294", metal: "#a9b2b8", sand: "#c9a06a", gem: "#6aa0a8", fire: "#b8532e", fire2: "#d8a650", brown: "#6e4a32", purple: "#64506e", white: "#f6f1e8", water: "#4a7590", pink: "#c07a80" },
  grey: { grey: "#888888", orange: "#999999", cream: "#eeeeee", main: "#6b6b6b", second: "#8a8a8a", leaf: "#7a7a7a", accent: "#b0b0b0", gold: "#a0a0a0", blue: "#5a5a5a", dark: INK, light: "#ececec", skin: "#d8d8d8", metal: "#c8c8c8", sand: "#b8b8b8", gem: "#a8a8a8", fire: "#707070", fire2: "#b5b5b5", brown: "#555555", purple: "#606060", white: "#ffffff", water: "#7a7a7a", pink: "#9a9a9a" },
};

// how much "tone" each role carries when converted to black & grey (dots / hatching)
export const ROLE_TONE = { grey: 0.45, orange: 0.35, cream: 0.08, main: 0.42, second: 0.55, leaf: 0.5, accent: 0.22, gold: 0.25, blue: 0.55, dark: 1, light: 0.06, skin: 0.12, metal: 0.18, sand: 0.3, gem: 0.2, fire: 0.45, fire2: 0.2, brown: 0.6, purple: 0.6, white: 0.03, water: 0.4, pink: 0.3 };

// --------------------------------------------------------------- geometry cache
export function motifGeo(m) {
  if (m._geo) return m._geo;
  const parts = [];
  m.els.forEach((e, i) => {
    if (e.t === "part" || e.t === "dark" || e.t === "shade") {
      const polys = samplePath(e.d, Math.max(m.box[2], m.box[3]) / 110).filter((p) => p.length > 2);
      if (!polys.length) return;
      parts.push({ i, e, polys, bb: bboxOfPolys(polys), nz: e.rule !== "evenodd" });
    }
  });
  const solid = parts.filter((p) => p.e.t !== "shade");
  const bb = bboxOfPolys(solid.flatMap((p) => p.polys));
  m._geo = { parts, solid, bb };
  return m._geo;
}
const inside = (p, x, y) => x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && (p.nz ? inPolysNZ(p.polys, x, y) : inPolys(p.polys, x, y));

// topmost solid part at (x,y)
export function partAt(m, x, y) {
  const g = motifGeo(m);
  for (let k = g.solid.length - 1; k >= 0; k--) if (inside(g.solid[k], x, y)) return g.solid[k];
  return null;
}
// tone (0..1) at a point for black&grey treatments.
// Shading model: role base tone + rim darkening + a directional term that darkens the side of each
// part facing away from the light and lightens the side facing it (gives a rounded, 3D look).
export function toneAt(m, x, y, { light = [-0.55, -0.85], edge = 0.5, base = 1, falloff = 0, dir = 0.55 } = {}) {
  const g = motifGeo(m);
  if (!falloff) falloff = Math.max(g.bb[2] - g.bb[0], g.bb[3] - g.bb[1]) * 0.045;
  const p = partAt(m, x, y);
  if (!p) return -1;
  if (p.e.t === "dark") return 1;
  let t = (ROLE_TONE[p.e.role] ?? 0.4) * base;
  const dEdge = distToPolys(p.polys, x, y);
  t += edge * Math.exp(-dEdge / falloff) * 0.45;
  if (dir) {
    const sz = Math.max(g.bb[2] - g.bb[0], g.bb[3] - g.bb[1]);
    let sh = 0;
    for (const k of [0.04, 0.09, 0.16]) {
      const q = sz * k;
      if (!inside(p, x - light[0] * q, y - light[1] * q) || partAt(m, x - light[0] * q, y - light[1] * q) !== p) sh += 1;
      if (!inside(p, x + light[0] * q, y + light[1] * q)) sh -= 0.7;
    }
    t += dir * sh / 3 * (0.4 + t);
  }
  for (const s of g.parts) if (s.e.t === "shade" && s.i > p.i && inside(s, x, y)) { t += 0.4; break; }
  return clamp(t, 0, 1);
}

// --------------------------------------------------------------- placement
export function placeT(m, { x = 500, y = 500, size = 600, rot = 0, flip = false } = {}) {
  const [bx, by, bw, bh] = m.box;
  const s = size / Math.max(bw, bh);
  const cx = bx + bw / 2, cy = by + bh / 2;
  return { s, tf: `translate(${f1(x)} ${f1(y)})${rot ? ` rotate(${f1(rot)})` : ""} scale(${f2(flip ? -s : s)} ${f2(s)}) translate(${f1(-cx)} ${f1(-cy)})` };
}
const BIG = (m) => { const [bx, by, bw, bh] = m.box, p = Math.max(bw, bh); return `x="${f1(bx - p)}" y="${f1(by - p)}" width="${f1(bw + 2 * p)}" height="${f1(bh + 2 * p)}"`; };

const pathEl = (e, attrs) => `<path d="${e.d}"${e.rule ? ` fill-rule="${e.rule}"` : ""} ${attrs}/>`;

// --------------------------------------------------------------- treatments
// All treatments return an SVG fragment in motif coordinates. `s` = px per motif unit.

// Line art with occlusion (mask: fills black, strokes white)
export function tLine(ctx, m, s, { w = 3, color = INK, inner = true, bold = 1.6, solidDark = true, lineMul = 1, darkAsLine = false } = {}) {
  const sw = w / s, id = ctx.uid("ml");
  let mk = "";
  // heavier outer silhouette
  if (bold > 1) for (const e of m.els) if (e.t === "part" && !e.noStroke && !e.gap && !e.noBold) mk += pathEl(e, `fill="none" stroke="#fff" stroke-width="${f2(sw * bold)}"`);
  const pat = {};
  const patFill = (kind) => {
    if (pat[kind]) return pat[kind];
    const pid = ctx.uid("pf");
    if (kind === "dots") { const sp = 6.5 / s, r = 1.25 / s; ctx.defs.push(`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="${f2(sp)}" height="${f2(sp * 0.866)}"><rect width="${f2(sp)}" height="${f2(sp)}" fill="#000"/><circle cx="${f2(sp / 4)}" cy="${f2(sp * 0.216)}" r="${f2(r)}" fill="#fff"/><circle cx="${f2(sp * 0.75)}" cy="${f2(sp * 0.65)}" r="${f2(r)}" fill="#fff"/></pattern>`); }
    else if (kind === "lines") { const sp = 5.5 / s; ctx.defs.push(`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="${f2(sp)}" height="${f2(sp)}" patternTransform="rotate(45)"><rect width="${f2(sp)}" height="${f2(sp)}" fill="#000"/><rect width="${f2(sp * 0.32)}" height="${f2(sp)}" fill="#fff"/></pattern>`); }
    else if (kind === "grey") { pid; ctx.defs.push(`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="#555"/></pattern>`); }
    return (pat[kind] = pid);
  };
  for (const e of m.els) {
    if (e.t === "part") {
      const fill = e.noFill ? "none" : (e.fill === "solid" || e.fill === "ink") ? "#fff" : e.fill === "dots" || e.fill === "lines" || e.fill === "grey" ? `url(#${patFill(e.fill)})` : "#000";
      if (e.gap) mk += pathEl(e, `fill="#000" stroke="#000" stroke-width="${f2(e.gap * 2)}"`);
      else mk += pathEl(e, `fill="${fill}" stroke="${e.noStroke ? "none" : "#fff"}" stroke-width="${f2(sw * (e.sw ?? 1))}"`);
    } else if (e.t === "dark") {
      mk += (solidDark && !darkAsLine) ? pathEl(e, `fill="#fff" stroke="#fff" stroke-width="${f2(sw * 0.5)}"`) : pathEl(e, `fill="#000" stroke="#fff" stroke-width="${f2(sw * 0.8)}"`);
    } else if (e.t === "line" && inner) {
      mk += `<path d="${e.d}" fill="none" stroke="#fff" stroke-width="${f2(sw * (e.w ?? 0.7) * lineMul)}"/>`;
    }
  }
  ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${BIG(m)}><g stroke-linecap="round" stroke-linejoin="round">${mk}</g></mask>`);
  return `<rect ${BIG(m)} fill="${color}" mask="url(#${id})"/>`;
}

// Flat color fill + bold outline (traditional / neo-traditional)
export function tFill(ctx, m, s, { w = 5, palette = PALETTES.traditional, inner = true, shine = true, shade = 0.45, bold = 1.8, outline = INK, roleMap = null } = {}) {
  const sw = w / s;
  let out = "";
  if (bold > 1) {
    let g = "";
    for (const e of m.els) if (((e.t === "part" && !e.noStroke) || e.t === "dark") && !e.noBold) g += pathEl(e, `fill="${outline}" stroke="${outline}" stroke-width="${f2(sw * bold)}"`);
    out += `<g stroke-linejoin="round">${g}</g>`;
  }
  for (const e of m.els) {
    if (e.t === "part") {
      const role = roleMap?.[e.role] ?? e.role;
      const col = e.noFill ? "none" : e.fill === "solid" ? outline : (palette[role] ?? (role && role[0] === "#" ? role : palette.main));
      out += pathEl(e, `fill="${col}" stroke="${e.noStroke ? "none" : outline}" stroke-width="${f2(sw)}"`);
    } else if (e.t === "dark") out += pathEl(e, `fill="${outline}"`);
    else if (e.t === "line" && inner) out += `<path d="${e.d}" fill="none" stroke="${outline}" stroke-width="${f2(sw * (e.w ?? 0.7))}"/>`;
    else if (e.t === "shine" && shine) out += pathEl(e, `fill="#fff" opacity=".92"`);
    else if (e.t === "shade" && shade > 0) out += pathEl(e, `fill="${outline}" opacity="${f2(shade)}"`);
  }
  return `<g stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
}

// Solid silhouette with negative-space detail lines (blackwork)
export function tSolid(ctx, m, s, { w = 3, color = INK, neg = true, bold = 1 } = {}) {
  const sw = w / s, id = ctx.uid("ms");
  let mk = "";
  for (const e of m.els) {
    if (e.t === "part") mk += e.noFill ? pathEl(e, `fill="none" stroke="#fff" stroke-width="${f2(sw * 1.6)}"`) : (e.role === "white" || e.role === "light") && e.fill ? pathEl(e, `fill="#000" stroke="#fff" stroke-width="${f2(sw * 0.6)}"`) : pathEl(e, `fill="#fff" stroke="#fff" stroke-width="${f2(sw * bold)}"`);
    else if (e.t === "dark") mk += neg ? pathEl(e, `fill="#000"`) : "";
    else if (e.t === "line" && neg) mk += `<path d="${e.d}" fill="none" stroke="#000" stroke-width="${f2(sw * (e.w ?? 0.7))}"/>`;
    else if (e.t === "shine" && neg) mk += pathEl(e, `fill="#000"`);
  }
  ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${BIG(m)}><g stroke-linecap="round" stroke-linejoin="round">${mk}</g></mask>`);
  return `<rect ${BIG(m)} fill="${color}" mask="url(#${id})"/>`;
}

// Stippled dotwork shading + outline
export function tDots(ctx, m, s, { w = 2.4, color = INK, density = 1, dot = 1.3, spacing = 4.2, outline = true, seed = 1, edge = 0.55, inner = true } = {}) {
  const rng = makeRng("dots" + seed);
  const g = motifGeo(m);
  const [x0, y0, x1, y1] = g.bb;
  const step = spacing / s;
  const small = [], med = [], big = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const px = x + (rng() - 0.5) * step * 0.7 + ((Math.round(y / step) % 2) ? step / 2 : 0), py = y + (rng() - 0.5) * step * 0.7;
      const t = toneAt(m, px, py, { edge });
      if (t < 0) continue;
      const p = t >= 1 ? 0 : Math.pow(t, 1.6) * density * 1.15;
      if (rng() < p) (t > 0.62 ? big : t > 0.3 ? med : small).push([px, py]);
    }
  }
  const r = dot / s;
  let out = `<g>${dotsPath(small, r * 0.8, color)}${dotsPath(med, r, color)}${dotsPath(big, r * 1.2, color)}</g>`;
  // parts whose role is "dark" are solid ink in every black & grey treatment
  for (const e of m.els) if (e.t === "part" && e.role === "dark" && !e.noFill) out += pathEl(e, `fill="${color}"`);
  if (outline) out += tLine(ctx, m, s, { w, color, inner, bold: 1.5 });
  else for (const e of m.els) if (e.t === "dark") out += pathEl(e, `fill="${color}"`);
  return out;
}

// Hatching / cross-hatching (sketch look)
export function tHatch(ctx, m, s, { w = 2.2, color = INK, spacing = 5, angle = -35, sketch = 0, seed = 1, layers = 3, outline = true, hw = 1 } = {}) {
  const g = motifGeo(m);
  const noise = makeNoise("h" + seed);
  const rng = makeRng("hatch" + seed);
  const [x0, y0, x1, y1] = g.bb;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
  const sp = spacing / s;
  const thresholds = [0.22, 0.48, 0.68, 0.86];
  const angles = [angle, angle + 90, angle + 45, angle - 45];
  let d = "";
  const tcache = new Map();
  const qs = Math.max(1.2, (x1 - x0 + y1 - y0) / 260), kq = 0.6 / qs * 1.6;
  const T = (x, y) => { const k = Math.round(x * kq) + "," + Math.round(y * kq); let v = tcache.get(k); if (v === undefined) { v = toneAt(m, x, y, { edge: 0.22, base: 0.7 }); tcache.set(k, v); } return v; };
  for (let L = 0; L < Math.min(layers, 4); L++) {
    const a = angles[L] * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const spL = sp * (L === 0 ? 1 : 1.1);
    for (let o = -R; o <= R; o += spL) {
      const jitterO = sketch ? (rng() - 0.5) * spL * 0.5 : 0;
      let run = null;
      const flush = () => { if (run && run.length > 1) { let pts = run; if (sketch) pts = wobble(pts, sketch * 0.6 / s, noise, 0.027 * s, L * 13); d += polyD([pts[0], pts[pts.length - 1]].length === 2 && !sketch ? [pts[0], pts[pts.length - 1]] : pts, false); } run = null; };
      for (let q = -R; q <= R; q += qs) {
        const x = cx + vx * (o + jitterO) + ux * q, y = cy + vy * (o + jitterO) + uy * q;
        const t = T(x, y);
        const on = t >= thresholds[L] + (noise(x * 0.01 * s, y * 0.01 * s) - 0.5) * 0.06;
        if (on) { (run ||= []).push([x, y]); } else flush();
      }
      flush();
    }
  }
  let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f2((w * 0.42 * hw) / s)}" stroke-linecap="round" opacity=".9"/>`;
  if (outline) {
    if (sketch) out += tSketchLines(ctx, m, s, { w, color, seed, amp: sketch });
    else out += tLine(ctx, m, s, { w, color, bold: 1.4 });
  }
  return out;
}

// Hand-drawn double outline (no occlusion mask needed: drawn over hatch)
export function tSketchLines(ctx, m, s, { w = 2, color = INK, seed = 1, amp = 1.2, passes = 2 } = {}) {
  const noise = makeNoise("sk" + seed);
  let d = "";
  for (const e of m.els) {
    if (e.t !== "part" && e.t !== "line" && e.t !== "dark") continue;
    if (e.noStroke) continue;
    const polys = samplePath(e.d, 2.5 / s * 3);
    for (let pass = 0; pass < passes; pass++) {
      for (const poly of polys) {
        let pts = poly.closed ? [...poly, poly[0]] : poly;
        pts = wobble(pts, amp * (pass ? 1.3 : 0.7) / s * 3, noise, 0.015 * s, pass * 51 + 7);
        // slight overshoot at ends
        d += polyD(pts, false);
      }
    }
  }
  let dark = "";
  for (const e of m.els) if (e.t === "dark") dark += pathEl(e, `fill="${color}"`);
  return `<g><path d="${d}" fill="none" stroke="${color}" stroke-width="${f2((w * 0.75) / s)}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>${dark}</g>`;
}

// Low-poly geometric facets
export function tGeo(ctx, m, s, { w = 2.2, color = INK, cell = 26, seed = 1, shade = "tone", outline = true, keepDark = true } = {}) {
  const g = motifGeo(m);
  const rng = makeRng("geo" + seed);
  const pts = [];
  const cellU = cell / s * 3;
  // boundary points of every solid part (gives facets that follow features)
  for (const p of g.solid) {
    for (const poly of p.polys) {
      const rs = resample(poly.closed ? [...poly, poly[0]] : poly, Math.max(cellU * 0.55, 3));
      for (const q of rs) pts.push(q);
    }
  }
  const [x0, y0, x1, y1] = g.bb;
  for (let y = y0 + cellU / 2; y < y1; y += cellU) for (let x = x0 + cellU / 2; x < x1; x += cellU) {
    const px = x + (rng() - 0.5) * cellU * 0.8, py = y + (rng() - 0.5) * cellU * 0.8;
    if (partAt(m, px, py)) pts.push([px, py]);
  }
  // dedupe close points
  const uniq = [];
  const minD = Math.max(cellU * 0.3, 2);
  outer: for (const p of pts) { for (const q of uniq) if (Math.abs(q[0] - p[0]) < minD && Math.abs(q[1] - p[1]) < minD) continue outer; uniq.push(p); }
  const tris = delaunay(uniq);
  const edges = new Set();
  let ed = "", fills = { a: "", b: "", c: "" };
  for (const t of tris) {
    const A = uniq[t[0]], B = uniq[t[1]], C = uniq[t[2]];
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3;
    const part = partAt(m, cx, cy);
    if (!part) continue;
    for (const [i, j] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = i < j ? i + "," + j : j + "," + i;
      if (edges.has(k)) continue;
      edges.add(k);
      ed += "M" + f1(uniq[i][0]) + " " + f1(uniq[i][1]) + "L" + f1(uniq[j][0]) + " " + f1(uniq[j][1]);
    }
    if (shade !== "none") {
      // facet tone: role tone + pseudo-normal from triangle orientation
      const nrm = ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]));
      const tone = (ROLE_TONE[part.e.role] ?? 0.4) * 0.7 + (rng() - 0.5) * 0.35 + (cx - (x0 + x1) / 2) / (x1 - x0) * 0.25 + (nrm > 0 ? 0.05 : -0.05);
      const key = tone > 0.5 ? "c" : tone > 0.3 ? "b" : tone > 0.16 ? "a" : null;
      if (key) fills[key] += polyD([A, B, C]);
    }
  }
  let out = "";
  if (shade === "tone") out += `<path d="${fills.a}" fill="${color}" opacity=".16"/><path d="${fills.b}" fill="${color}" opacity=".34"/><path d="${fills.c}" fill="${color}" opacity=".56"/>`;
  else if (shade === "dots") {
    const id = ctx.uid("gp");
    const r = 0.9 / s, sp = 4.4 / s;
    ctx.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f2(sp)}" height="${f2(sp)}"><circle cx="${f2(sp / 2)}" cy="${f2(sp / 2)}" r="${f2(r)}" fill="${color}"/></pattern>`);
    ctx.defs.push(`<pattern id="${id}b" patternUnits="userSpaceOnUse" width="${f2(sp * 0.7)}" height="${f2(sp * 0.7)}"><circle cx="${f2(sp * 0.35)}" cy="${f2(sp * 0.35)}" r="${f2(r * 1.05)}" fill="${color}"/></pattern>`);
    out += `<path d="${fills.b}" fill="url(#${id})"/><path d="${fills.c}" fill="url(#${id}b)"/>`;
  }
  out += `<path d="${ed}" fill="none" stroke="${color}" stroke-width="${f2((w * 0.55) / s)}" stroke-linecap="round"/>`;
  if (outline) {
    let o = "";
    for (const p of g.solid) if (p.e.t === "part" && !p.e.noStroke) o += pathEl(p.e, `fill="none"`);
    out += `<g stroke="${color}" stroke-width="${f2(w / s)}" stroke-linejoin="round">${o}</g>`;
  }
  if (keepDark) for (const e of m.els) if (e.t === "dark") out += pathEl(e, `fill="${color}"`);
  return out;
}

// Watercolor wash behind linework
export const WATERCOLORS = {
  rainbow: ["#e94f6b", "#f6a63a", "#f3d64b", "#5cc28b", "#3ba3d9", "#7b5cd6"],
  blue: ["#2f7dd1", "#45b3e0", "#1d4fa0", "#7fd3e6"],
  teal: ["#1fa59a", "#56c8b5", "#2a7f9e", "#9be3cf"],
  purple: ["#7b4bc4", "#c065d6", "#4b3aa8", "#e59bdb"],
  pink: ["#e9548c", "#f590b0", "#c43d74", "#ffc0d0"],
  red: ["#d23a2f", "#f07b45", "#b5203a", "#f8b27a"],
  orange: ["#f07b2c", "#f6b73c", "#e2482a", "#ffd27f"],
  green: ["#3aa356", "#8fcf5a", "#22766c", "#c4e27a"],
  sunset: ["#f05a5a", "#f7a540", "#c04ac4", "#ffd166"],
  ocean: ["#1b6ca8", "#25b0c0", "#6ad3b5", "#2a3f9e"],
  autumn: ["#c8502a", "#e2a33c", "#8a3a2a", "#d9c36a"],
  pastel: ["#f4a6c0", "#a8d8f0", "#c8b6f2", "#b6e8c6"],
  black: ["#2a2a2a", "#555555", "#888888", "#3a3a3a"],
};
export function watercolorFilter(ctx, { seed = 1, scale = 30, blur = 6, freq = 0.012 } = {}) {
  const id = ctx.uid("wc");
  ctx.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed % 1000}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="${blur}"/></filter>`);
  return id;
}
export function tWatercolor(ctx, m, s, { colors = WATERCOLORS.rainbow, seed = 1, spread = 1, splatter = true, opacity = 0.75 } = {}) {
  const g = motifGeo(m);
  const rng = makeRng("wc" + seed);
  const f1d = watercolorFilter(ctx, { seed: seed * 7 + 1, scale: 36 / s * 3 * spread, blur: (7 / s) * 2 * spread, freq: 0.03 * s / 3 });
  const f2d = watercolorFilter(ctx, { seed: seed * 7 + 3, scale: 60 / s * 3 * spread, blur: (14 / s) * 2 * spread, freq: 0.02 * s / 3 });
  const [x0, y0, x1, y1] = g.bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2;
  let back = "", front = "";
  // big soft blobs behind the motif
  const nb = 5 + Math.round(spread * 3);
  for (let i = 0; i < nb; i++) {
    const a = rng() * Math.PI * 2, r = R * (0.15 + rng() * 0.55) * spread;
    const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r, br = R * (0.25 + rng() * 0.35) * spread;
    back += `<ellipse cx="${f1(bx)}" cy="${f1(by)}" rx="${f1(br * (0.8 + rng() * 0.6))}" ry="${f1(br * (0.6 + rng() * 0.5))}" transform="rotate(${f1(rng() * 180)} ${f1(bx)} ${f1(by)})" fill="${colors[i % colors.length]}" opacity="${f2(0.45 + rng() * 0.3)}"/>`;
  }
  // parts tinted
  let k = 0;
  for (const p of g.solid) {
    if (p.e.t !== "part") continue;
    const col = colors[(k++ + Math.floor(rng() * 2)) % colors.length];
    front += pathEl(p.e, `fill="${col}" opacity="${f2(opacity)}"`);
  }
  // splatter dots
  let spl = "";
  if (splatter) {
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = R * (0.9 + rng() * 0.5 * spread);
      const rr = (rng() < 0.8 ? 1 + rng() * 3 : 4 + rng() * 5) / s * 3;
      spl += `<circle cx="${f1(cx + Math.cos(a) * r)}" cy="${f1(cy + Math.sin(a) * r)}" r="${f2(rr)}" fill="${colors[i % colors.length]}" opacity=".7"/>`;
    }
    // a few drips / streaks
    for (let i = 0; i < 3; i++) {
      const sx = cx + (rng() - 0.5) * R * 1.2, sy = cy + R * (0.2 + rng() * 0.4), L = R * (0.3 + rng() * 0.5);
      spl += `<path d="M${f1(sx)} ${f1(sy)}L${f1(sx + (rng() - 0.5) * 8)} ${f1(sy + L)}" stroke="${colors[i % colors.length]}" stroke-width="${f2(4 / s * (1 + rng()))}" stroke-linecap="round" opacity=".55"/>`;
    }
  }
  return `<g filter="url(#${f2d})">${back}</g><g filter="url(#${f1d})">${front}</g><g filter="url(#${f1d})">${spl}</g>`;
}

// Single continuous line feel: outline of parts drawn with slight wobble & open ends, no occlusion fill
export function tContinuous(ctx, m, s, { w = 2.2, color = INK, inner = false } = {}) {
  return tLine(ctx, { ...m, els: m.els.filter((e) => e.t !== "shade" && e.t !== "shine"), _geo: m._geo }, s, { w, color, inner, bold: 1, darkAsLine: false });
}

// Outer silhouette only (union outline) – for minimal / single-line looks
export function tOutline(ctx, m, s, { w = 2.2, color = INK, keepDark = true, inner = false } = {}) {
  const sw = w / s, id = ctx.uid("mo");
  let mk = "";
  for (const e of m.els) if (e.t === "part" && !e.noStroke) mk += pathEl(e, `fill="none" stroke="#fff" stroke-width="${f2(sw * 2)}"`);
  for (const e of m.els) if (e.t === "part" && !e.noStroke) mk += pathEl(e, `fill="#000"`);
  if (inner) for (const e of m.els) if (e.t === "line" && (e.w ?? 0.7) >= 0.55) mk += `<path d="${e.d}" fill="none" stroke="#fff" stroke-width="${f2(sw * 0.8)}"/>`;
  if (keepDark) for (const e of m.els) if (e.t === "dark") mk += pathEl(e, `fill="#fff"`);
  ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${BIG(m)}><g stroke-linecap="round" stroke-linejoin="round">${mk}</g></mask>`);
  return `<rect ${BIG(m)} fill="${color}" mask="url(#${id})"/>`;
}

// Compose several motifs into one scene motif (canvas coordinates).
// items: { m, x, y, size, rot (deg), flip, roleMap, only?: el filter }
import { transformD as _tD, M as _M } from "./core.js";
export function compose(items, box) {
  const els = [];
  for (const it of items) {
    if (!it) continue;
    if (it.els) { els.push(...it.els); continue; }   // raw elements already in canvas coords
    const [bx, by, bw, bh] = it.m.box;
    const s = (it.size ?? 600) / Math.max(bw, bh);
    const mtx = _M.chain(_M.t(it.x ?? 500, it.y ?? 500), _M.r((it.rot || 0) * Math.PI / 180), _M.s(it.flip ? -s : s, s), _M.t(-(bx + bw / 2), -(by + bh / 2)));
    for (const e of it.m.els) {
      if (it.only && !it.only(e)) continue;
      const ne = { ...e, d: _tD(e.d, mtx) };
      if (it.roleMap && e.role && it.roleMap[e.role]) ne.role = it.roleMap[e.role];
      if (it.role && e.t === "part") ne.role = it.role;
      els.push(ne);
    }
  }
  return { box, els };
}
// transform raw elements
export function tfEls(els, mtx) { return els.map((e) => ({ ...e, d: _tD(e.d, mtx) })); }

// Render a whole scene (box = canvas) with a treatment
export function renderScene(ctx, scene, mode, o = {}) {
  const [bx, by, bw, bh] = scene.box;
  return drawMotif(ctx, scene, mode, { ...o, x: bx + bw / 2, y: by + bh / 2, size: Math.max(bw, bh) });
}

// Dispatcher
export function drawMotif(ctx, m, mode, o = {}) {
  const { s, tf } = placeT(m, o);
  let body = "";
  switch (mode) {
    case "fill": body = tFill(ctx, m, s, o); break;
    case "solid": body = tSolid(ctx, m, s, o); break;
    case "dots": body = tDots(ctx, m, s, o); break;
    case "hatch": body = tHatch(ctx, m, s, o); break;
    case "sketch": body = tHatch(ctx, m, s, { sketch: 1.3, ...o }); break;
    case "geo": body = tGeo(ctx, m, s, o); break;
    case "watercolor": body = tWatercolor(ctx, m, s, o) + (o.lines === "none" ? "" : tLine(ctx, m, s, { w: o.w ?? 2.4, color: o.color ?? INK, inner: o.inner ?? true })); break;
    case "continuous": body = tContinuous(ctx, m, s, o); break;
    case "outline": body = tOutline(ctx, m, s, o); break;
    default: body = tLine(ctx, m, s, o);
  }
  return `<g transform="${tf}">${body}</g>`;
}

// Bounding box of a scene/motif (canvas units) from its geometry
export function sceneBBox(m, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const step = Math.max(m.box[2], m.box[3]) / 150;
  for (const e of m.els) {
    for (const poly of samplePath(e.d, step)) for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  }
  if (!Number.isFinite(x0)) return m.box.slice();
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}
