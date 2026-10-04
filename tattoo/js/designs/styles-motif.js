// Styles that restyle a subject motif (fine-line, dotwork, traditional, watercolor, …).
import {
  INK, f1, f2, smooth, polyD, circleD, ellipseD, arcPts, regularPoly, starPts, polar, TAU, DEG, makeRng, makeNoise,
  mirrorX, petalD, taperSmoothD, samplePath, add, sub, mul, norm, perp, mix, lerp, clamp, dotsPath, M, transformD, inPolys, resample, sampleSpline,
} from "./core.js";
import {
  compose, renderScene, drawMotif, tLine, tFill, tSolid, tDots, tGeo, tHatch, tWatercolor, tOutline, tSketchLines,
  PALETTES, WATERCOLORS, sceneBBox, partAt, motifGeo, tfEls,
} from "./render.js";
import { getMotif, SUBJECTS } from "./library.js";
import { leafEls, roseEls, crescentPts } from "./motifs.js";
import { smallFeather } from "./motifs-extra.js";
import { bannerEls, textEls } from "./lettering.js";
import { seedOpt, weightOpt, colorOpt, rangeOpt, boolOpt, textOpt, selectOpt, subjectOpt, ANIMAL_IDS, FLOWER_IDS } from "./opts.js";

const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d) => ({ t: "dark", d });
const CANVAS = [0, 0, 1000, 1000];
const pal = (name) => PALETTES[name] || PALETTES.traditional;

// a scene item for a subject
const subj = (o, x = 500, y = 500, size = 620, extra = {}) => ({ m: getMotif(o.subject, o.seed), x, y, size, ...extra });
const out = (body, scene, pad = 24, extra = {}) => ({ body, bbox: sceneBBox(scene, pad), ...extra });

// ---------------------------------------------------------------- accents
function sparkle(x, y, r) { return line(polyD([[x - r, y], [x + r, y]], false) + polyD([[x, y - r], [x, y + r]], false), 0.6); }
function sparkleStar(x, y, r) { return dark(smooth([[x, y - r, 1], [x + r * 0.16, y - r * 0.16], [x + r, y, 1], [x + r * 0.16, y + r * 0.16], [x, y + r, 1], [x - r * 0.16, y + r * 0.16], [x - r, y, 1], [x - r * 0.16, y - r * 0.16]], true)); }
function dotTrail(x, y, ang, n, r0, gap) { const els = []; for (let i = 0; i < n; i++) { const p = polar(x, y, i * gap, ang); els.push(dark(circleD(p[0], p[1], Math.max(1.2, r0 * (1 - i / (n + 1)))))); } return els; }
function sprig(base, ang, len, sg = 1, leaves = 5) {
  const els = [];
  const tip = polar(base[0], base[1], len, ang);
  const mid = add(mix(base, tip, 0.5), mul(perp(norm(sub(tip, base))), sg * len * 0.12));
  els.push(line(smooth([base, mid, tip], false), 0.7));
  const sp = sampleSpline([base, mid, tip], false, 10);
  for (let i = 1; i <= leaves; i++) {
    const k = Math.floor(i / (leaves + 1) * (sp.length - 1));
    const p = sp[k], u = norm(sub(sp[Math.min(sp.length - 1, k + 1)], p));
    const side = i % 2 ? 1 : -1;
    const L = len * (0.22 - i * 0.015);
    const dir = norm(add(u, mul(perp(u), side * 1.1)));
    els.push(...leafEls(p, add(p, mul(dir, L)), L * 0.3, { veins: 0, curve: side * 0.08 }));
  }
  els.push(...leafEls(tip, polar(tip[0], tip[1], len * 0.18, ang), len * 0.05, { veins: 0 }));
  return els;
}
function frameEls(kind, cx, cy, r) {
  if (kind === "circle") return [line(circleD(cx, cy, r), 0.8)];
  if (kind === "double-circle") return [line(circleD(cx, cy, r), 0.8), line(circleD(cx, cy, r * 0.94), 0.5)];
  if (kind === "arch") return [line(polyD([[cx - r * 0.7, cy + r], ...arcPts(cx, cy - r * 0.3, r * 0.7, Math.PI, TAU, 30), [cx + r * 0.7, cy + r], [cx - r * 0.7, cy + r]], false), 0.8)];
  if (kind === "diamond") return [line(polyD([[cx, cy - r * 1.1], [cx + r * 0.85, cy], [cx, cy + r * 1.1], [cx - r * 0.85, cy]]), 0.8)];
  if (kind === "hexagon") return [line(polyD(regularPoly(cx, cy, r, 6)), 0.8)];
  if (kind === "triangle") return [line(polyD(regularPoly(cx, cy + r * 0.2, r * 1.15, 3)), 0.8)];
  if (kind === "square") return [line(polyD([[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]]), 0.8)];
  return [];
}

// stipple a region: test(x,y)→bool, density(x,y)→0..1
function stipple(rng, bb, test, density, spacing = 5, jitter = 0.7) {
  const pts = [];
  for (let y = bb[1]; y <= bb[3]; y += spacing * 0.87) {
    const row = Math.round((y - bb[1]) / (spacing * 0.87));
    for (let x = bb[0] + (row % 2 ? spacing / 2 : 0); x <= bb[2]; x += spacing) {
      const px = x + (rng() - 0.5) * spacing * jitter, py = y + (rng() - 0.5) * spacing * jitter;
      if (!test(px, py)) continue;
      if (rng() < density(px, py)) pts.push([px, py]);
    }
  }
  return pts;
}
// occluder elements: the subject's silhouette (plus a gap) masks frames / backgrounds behind it
function occluderEls(scene, gap) {
  return scene.els.filter((e) => e.t === "part" || e.t === "dark").map((e) => ({ t: "part", d: e.d, role: "white", noStroke: true, gap, rule: e.rule }));
}

// ---------------------------------------------------------------- STYLES
export const MOTIF_STYLES = [
  {
    id: "fineline", name: "Fine-line", category: "Line",
    description: "Delicate single-needle linework with optional sparkles, dots, sprigs and frames.",
    gallery: [{"subject": "butterfly"}, {"subject": "rose", "accent": "botanical"}, {"subject": "moon", "frame": "circle", "accent": "dots"}, {"subject": "hummingbird", "accent": "orbit"}, {"subject": "lotus", "frame": "arch", "accent": "none"}, {"subject": "whale", "accent": "sparkles"}, {"subject": "eye", "accent": "dots"}, {"subject": "lavender", "accent": "none", "frame": "double-circle"}],
    options: [subjectOpt("butterfly"), weightOpt(2), boolOpt("detail", "Inner detail", true),
      selectOpt("accent", "Accents", ["none", "sparkles", "dots", "botanical", "orbit"], "sparkles"),
      selectOpt("frame", "Frame", ["none", "circle", "double-circle", "arch", "diamond", "hexagon"], "none"), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const rng = makeRng("fl" + o.seed + o.subject);
      const items = [];
      const R = 380;
      if (o.frame !== "none") items.push({ els: frameEls(o.frame, 500, 500, R + 40) });
      if (o.accent === "orbit") {
        items.push({ els: [line(circleD(500, 500, 330), 0.55)] });
        for (let i = 0; i < 3; i++) { const p = polar(500, 500, 330, -2.4 + i * 1.9 + rng() * 0.3); items.push({ els: [dark(circleD(p[0], p[1], 7 - i * 1.5))] }); }
      }
      if (o.accent === "botanical") {
        items.push({ els: sprig([480, 790], Math.PI * 0.86, 300, -1) }, { els: sprig([520, 790], Math.PI * 0.14, 300, 1) });
      }
      items.push(subj(o, 500, 500, o.accent === "botanical" ? 560 : 600));
      if (o.accent === "sparkles") {
        for (let i = 0; i < 5; i++) { const a = rng() * TAU, r = 330 + rng() * 60; const p = polar(500, 500, r, a); items.push({ els: [i % 2 ? sparkle(p[0], p[1], 10 + rng() * 14) : sparkleStar(p[0], p[1], 10 + rng() * 14)] }); }
      }
      if (o.accent === "dots") { items.push({ els: dotTrail(800, 230, 2.4, 5, 7, 24) }, { els: dotTrail(200, 770, -0.75, 5, 7, 24) }); }
      const scene = compose(items, CANVAS);
      return out(renderScene(ctx, scene, "line", { w: o.weight, color: o.color, inner: o.detail, bold: 1.15 }), scene, o.weight * 2 + 10);
    },
  },
  {
    id: "minimal-line", name: "Minimalist line art", category: "Line",
    description: "Continuous single-line silhouette with a trailing lead line and tiny accent.",
    gallery: [{"subject": "cat"}, {"subject": "dove", "accent": "sun"}, {"subject": "whale", "accent": "dot"}, {"subject": "swallow", "accent": "star"}, {"subject": "fox", "accent": "moon"}, {"subject": "rose", "accent": "none"}],
    options: [subjectOpt("cat"), weightOpt(2.4), boolOpt("lead", "Trailing line", true),
      selectOpt("accent", "Accent", ["none", "heart", "dot", "sun", "moon", "star"], "heart"), boolOpt("features", "Keep key features", true), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const item = subj(o, 500, 470, 560);
      const scene = compose([item], CANVAS);
      const g = motifGeo(scene);
      // lowest outline point
      let low = [500, 750];
      for (const p of g.solid) for (const poly of p.polys) for (const q of poly) if (q[1] > low[1] || low === null) low = q;
      const rng = makeRng("ml" + o.seed);
      const extra = [];
      const sg = rng() < 0.5 ? -1 : 1;
      if (o.lead) {
        const L = (x, y) => [low[0] + sg * x, low[1] + y];
        extra.push(line(smooth([L(-300, 48), L(-200, 20), L(-110, 34), L(-40, 8), low, L(60, 22), L(150, 46), L(250, 18), L(320, 40)], false), 1));
      }
      const ax = 500 + sg * -230, ay = 230;
      if (o.accent === "heart") extra.push(line(`M${ax} ${ay + 8}C${ax} ${ay - 12} ${ax - 26} ${ay - 12} ${ax - 26} ${ay + 4}C${ax - 26} ${ay + 18} ${ax - 8} ${ay + 28} ${ax} ${ay + 38}C${ax + 8} ${ay + 28} ${ax + 26} ${ay + 18} ${ax + 26} ${ay + 4}C${ax + 26} ${ay - 12} ${ax} ${ay - 12} ${ax} ${ay + 8}`, 1));
      else if (o.accent === "dot") extra.push(dark(circleD(ax, ay, 9)));
      else if (o.accent === "sun") { extra.push(line(circleD(ax, ay, 20), 1)); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; extra.push(line(polyD([polar(ax, ay, 30, a), polar(ax, ay, 42, a)], false), 1)); } }
      else if (o.accent === "moon") extra.push(line(polyD(crescentPts([ax, ay], 26, [ax + 12, ay - 8], 22, 20)), 1));
      else if (o.accent === "star") extra.push(sparkleStar(ax, ay, 22));
      const accentScene = { box: CANVAS, els: extra };
      let body = renderScene(ctx, scene, "outline", { w: o.weight, color: o.color, keepDark: o.features, inner: false });
      if (extra.length) body += renderScene(ctx, accentScene, "line", { w: o.weight, color: o.color, bold: 1 });
      return out(body, { box: CANVAS, els: [...scene.els, ...extra] }, o.weight * 2 + 10);
    },
  },
  {
    id: "geometric", name: "Geometric", category: "Geometric",
    description: "Low-poly faceted subject inside a geometric frame with construction lines and nodes.",
    gallery: [{"subject": "wolf"}, {"subject": "lion", "frame": "hexagon"}, {"subject": "deer", "frame": "triangle", "split": true}, {"subject": "fox", "frame": "diamond", "shading": "dots"}, {"subject": "eagle", "frame": "double"}, {"subject": "bear", "frame": "none", "facets": 4}, {"subject": "owl", "frame": "circle", "split": true}, {"subject": "koi", "frame": "hexagon", "shading": "none"}],
    options: [subjectOpt("wolf"), selectOpt("frame", "Frame", ["circle", "hexagon", "triangle", "diamond", "double", "none"], "circle"),
      rangeOpt("facets", "Facet density", 1, 5, 1, 3), selectOpt("shading", "Shading", ["tone", "dots", "none"], "tone"),
      boolOpt("split", "Half line / half geometric", false), weightOpt(2.4), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const rng = makeRng("geo" + o.seed);
      const item = subj(o, 500, 500, 560);
      const scene = compose([item], CANVAS);
      const frame = [];
      const fr = o.frame;
      if (fr === "circle" || fr === "double") {
        frame.push(line(circleD(500, 500, 400), 0.7));
        if (fr === "double") frame.push(line(polyD(regularPoly(500, 500, 400, 6)), 0.6), line(polyD(regularPoly(500, 500, 400, 6, Math.PI / 2)), 0.45));
        frame.push(line(circleD(500, 500, 430), 0.4));
      } else if (fr === "hexagon") { frame.push(line(polyD(regularPoly(500, 500, 420, 6)), 0.75), line(polyD(regularPoly(500, 500, 380, 6)), 0.45)); }
      else if (fr === "triangle") { frame.push(line(polyD(regularPoly(500, 560, 460, 3)), 0.75), line(polyD(regularPoly(500, 440, 360, 3, Math.PI / 2)), 0.45)); }
      else if (fr === "diamond") { frame.push(line(polyD([[500, 60], [880, 500], [500, 940], [120, 500]]), 0.75), line(polyD([[500, 120], [820, 500], [500, 880], [180, 500]]), 0.45)); }
      if (fr !== "none") {
        // construction lines & nodes
        const nodes = fr === "triangle" ? regularPoly(500, 560, 460, 3) : fr === "diamond" ? [[500, 60], [880, 500], [500, 940], [120, 500]] : regularPoly(500, 500, fr === "hexagon" ? 420 : 400, 6, -Math.PI / 2);
        for (let i = 0; i < nodes.length; i++) if (rng() < 0.7) frame.push(line(polyD([nodes[i], nodes[(i + 2) % nodes.length]], false), 0.35));
        for (const n of nodes) frame.push(dark(circleD(n[0], n[1], 9)));
        frame.push(line(polyD([[500, 30], [500, 120]], false), 0.4), line(polyD([[500, 880], [500, 970]], false), 0.4));
        frame.push(...occluderEls(scene, 26));
      }
      let body = "";
      if (frame.length) body += renderScene(ctx, { box: CANVAS, els: frame }, "line", { w: o.weight, color: o.color, bold: 1 });
      const cell = [44, 34, 26, 20, 15][o.facets - 1];
      if (o.split) {
        const cl = ctx.uid("cp"), cr = ctx.uid("cp");
        ctx.defs.push(`<clipPath id="${cl}"><rect x="-500" y="-500" width="1000" height="2000"/></clipPath><clipPath id="${cr}"><rect x="500" y="-500" width="1000" height="2000"/></clipPath>`);
        body += `<g clip-path="url(#${cl})">${renderScene(ctx, scene, "line", { w: o.weight, color: o.color, bold: 1.3 })}</g>`;
        body += `<g clip-path="url(#${cr})">${renderScene(ctx, scene, "geo", { w: o.weight, color: o.color, cell, seed: o.seed, shade: o.shading })}</g>`;
        body += `<path d="M500 ${f1(sceneBBox(scene)[1] - 10)}V${f1(sceneBBox(scene)[1] + sceneBBox(scene)[3] + 10)}" stroke="${o.color}" stroke-width="${f2(o.weight * 0.5)}" stroke-dasharray="${f2(o.weight * 2)} ${f2(o.weight * 3)}"/>`;
      } else body += renderScene(ctx, scene, "geo", { w: o.weight, color: o.color, cell, seed: o.seed, shade: o.shading });
      return out(body, { box: CANVAS, els: [...scene.els, ...frame] }, o.weight * 2 + 12);
    },
  },
  {
    id: "dotwork", name: "Dotwork", category: "Black & grey",
    description: "Stippled shading built from thousands of dots, with optional dot-gradient backdrop.",
    gallery: [{"subject": "rose"}, {"subject": "skull", "backdrop": "circle"}, {"subject": "lotus", "backdrop": "moon"}, {"subject": "owl", "backdrop": "triangle"}, {"subject": "butterfly", "backdrop": "halo"}, {"subject": "moon"}, {"subject": "hand", "density": 1.4}, {"subject": "wolf", "dot": 1}],
    options: [subjectOpt("rose"), rangeOpt("density", "Dot density", 0.3, 2, 0.05, 1), rangeOpt("dot", "Dot size", 0.6, 3, 0.1, 1.4),
      selectOpt("backdrop", "Backdrop", ["none", "circle", "moon", "triangle", "halo"], "none"), boolOpt("outline", "Outline", true), weightOpt(2.4), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const rng = makeRng("dw" + o.seed);
      const scene = compose([subj(o, 500, 500, o.backdrop === "none" ? 620 : 520)], CANVAS);
      let body = "";
      const extraEls = [];
      if (o.backdrop !== "none") {
        let test, dens, bb;
        const R = 400;
        if (o.backdrop === "circle" || o.backdrop === "halo") {
          bb = [100, 100, 900, 900];
          test = (x, y) => Math.hypot(x - 500, y - 500) < R && !partAt(scene, x, y);
          dens = o.backdrop === "circle" ? (x, y) => 0.08 + 0.75 * clamp((y - 100) / 800, 0, 1) ** 1.6 : (x, y) => { const r = Math.hypot(x - 500, y - 500) / R; return 0.85 * clamp((r - 0.55) / 0.45, 0, 1) ** 1.3; };
          if (o.backdrop === "circle") extraEls.push(line(circleD(500, 500, R), 0.6));
        } else if (o.backdrop === "moon") {
          const cp = crescentPts([500, 500], R, [610, 440], R * 0.92, 60);
          const poly = [cp];
          bb = [100, 100, 900, 900];
          test = (x, y) => inPolys(poly, x, y) && !partAt(scene, x, y);
          dens = (x, y) => 0.15 + 0.7 * clamp(1 - (x - 100) / 500, 0, 1);
          extraEls.push(line(polyD(cp), 0.6));
        } else {
          const tri = regularPoly(500, 560, 470, 3);
          bb = [60, 90, 940, 800];
          test = (x, y) => inPolys([tri], x, y) && !partAt(scene, x, y);
          dens = (x, y) => 0.05 + 0.8 * clamp((y - 330) / 470, 0, 1) ** 1.4;
          extraEls.push(line(polyD(tri), 0.6));
        }
        const pts = stipple(rng, bb, (x, y) => test(x, y) && !nearScene(scene, x, y, 14), (x, y) => dens(x, y) * o.density, 7 / Math.sqrt(o.density));
        body += dotsPath(pts, o.dot * 1.05, o.color);
        if (extraEls.length) body += renderScene(ctx, { box: CANVAS, els: [...extraEls, ...occluderEls(scene, 28)] }, "line", { w: o.weight, color: o.color, bold: 1 });
      }
      body += renderScene(ctx, scene, "dots", { w: o.weight, color: o.color, density: o.density, dot: o.dot, outline: o.outline, seed: o.seed, spacing: 4.6 / Math.sqrt(o.density) });
      return out(body, { box: CANVAS, els: [...scene.els, ...extraEls] }, o.weight * 2 + 12);
    },
  },
  {
    id: "blackwork", name: "Blackwork", category: "Bold",
    description: "Heavy solid black: subject as negative space in a bold shape, or a solid silhouette with cut-out detail.",
    gallery: [{"subject": "moon"}, {"subject": "wolf", "shape": "hexagon"}, {"subject": "rose", "shape": "diamond", "pattern": "stripes"}, {"subject": "swallow", "mode": "silhouette", "shape": "none"}, {"subject": "snake", "shape": "arch", "pattern": "half"}, {"subject": "dagger", "shape": "square", "pattern": "dots"}, {"subject": "butterfly", "mode": "silhouette", "shape": "circle"}, {"subject": "mountain", "shape": "circle"}],
    options: [subjectOpt("moon"), selectOpt("mode", "Mode", ["negative", "silhouette"], "negative"),
      selectOpt("shape", "Shape", ["circle", "diamond", "hexagon", "arch", "square", "none"], "circle"),
      selectOpt("pattern", "Fill", ["solid", "stripes", "dots", "half"], "solid"), boolOpt("border", "Border ring", true), weightOpt(3.2), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const neg = o.mode === "negative" && o.shape !== "none";
      const scene = compose([subj(o, 500, 500, neg ? 520 : 640)], CANVAS);
      let shapeD = "";
      const R = 400;
      if (o.shape === "circle") shapeD = circleD(500, 500, R);
      else if (o.shape === "diamond") shapeD = polyD([[500, 40], [920, 500], [500, 960], [80, 500]]);
      else if (o.shape === "hexagon") shapeD = polyD(regularPoly(500, 500, 440, 6));
      else if (o.shape === "arch") shapeD = polyD([[150, 900], ...arcPts(500, 400, 350, Math.PI, TAU, 40), [850, 900]]);
      else if (o.shape === "square") shapeD = polyD([[110, 110], [890, 110], [890, 890], [110, 890]]);
      const sw = o.weight;
      let body = "";
      if (!neg) {
        if (shapeD && o.border) body += `<path d="${shapeD}" fill="none" stroke="${o.color}" stroke-width="${f2(sw * 2.5)}"/>`;
        body += renderScene(ctx, scene, "solid", { w: sw, color: o.color });
        return out(body, { box: CANVAS, els: [...scene.els, ...(shapeD ? [part(shapeD)] : [])] }, sw * 3 + 10);
      }
      const id = ctx.uid("bw");
      let fillEl = "";
      if (o.pattern === "stripes") { const pid = ctx.uid("p"); ctx.defs.push(`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate(-45)"><rect width="22" height="22" fill="#000"/><rect width="13" height="22" fill="#fff"/></pattern>`); fillEl = `url(#${pid})`; }
      else if (o.pattern === "dots") { const pid = ctx.uid("p"); ctx.defs.push(`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="16" height="16"><circle cx="8" cy="8" r="5.2" fill="#fff"/></pattern>`); fillEl = `url(#${pid})`; }
      else fillEl = "#fff";
      let mk = `<path d="${shapeD}" fill="${fillEl}"/>`;
      if (o.pattern === "half") { const pid = ctx.uid("c"); ctx.defs.push(`<clipPath id="${pid}"><rect x="0" y="500" width="1000" height="600"/></clipPath>`); mk = `<path d="${shapeD}" fill="#fff" clip-path="url(#${pid})"/><path d="${shapeD}" fill="none" stroke="#fff" stroke-width="${f2(sw * 1.5)}"/>`; }
      // subject as negative space with inked details
      let sub = "";
      for (const e of scene.els) {
        if (e.t === "part") sub += `<path d="${e.d}"${e.rule ? ` fill-rule="${e.rule}"` : ""} fill="#000" stroke="#000" stroke-width="${f2(sw * 3.4)}" stroke-linejoin="round"/>`;
      }
      for (const e of scene.els) {
        if (e.t === "part") sub += `<path d="${e.d}"${e.rule ? ` fill-rule="${e.rule}"` : ""} fill="#000" stroke="#fff" stroke-width="${f2(sw)}" stroke-linejoin="round"/>`;
        else if (e.t === "line") sub += `<path d="${e.d}" fill="none" stroke="#fff" stroke-width="${f2(sw * (e.w ?? 0.7))}" stroke-linecap="round"/>`;
        else if (e.t === "dark") sub += `<path d="${e.d}" fill="#fff"/>`;
      }
      ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400">${mk}${sub}</mask>`);
      body += `<rect x="-200" y="-200" width="1400" height="1400" fill="${o.color}" mask="url(#${id})"/>`;
      if (o.border) {
        const s2 = o.shape === "circle" ? circleD(500, 500, R + sw * 6) : transformD(shapeD, M.sc(1.04, 500, 500));
        body += `<path d="${s2}" fill="none" stroke="${o.color}" stroke-width="${f2(sw * 1.4)}"/>`;
      }
      return out(body, { box: CANVAS, els: [part(transformD(shapeD, M.sc(1.05, 500, 500)))] }, sw * 3 + 6);
    },
  },
  {
    usesFonts: true, id: "traditional", name: "Traditional (old-school)", category: "Color",
    description: "Bold black outlines, flat red/green/yellow/blue fills, white highlights, optional banner.",
    gallery: [{"subject": "heart", "banner": true, "text": "MOM"}, {"subject": "swallow", "banner": true, "text": "TRUE LOVE"}, {"subject": "anchor", "combo": "roses"}, {"subject": "heart", "combo": "dagger"}, {"subject": "skull", "combo": "roses"}, {"subject": "rose"}, {"subject": "ship", "combo": "rays"}, {"subject": "sacredheart", "combo": "swallows"}, {"subject": "snake", "combo": "dagger"}, {"subject": "cherry", "palette": "muted"}, {"subject": "eagle", "banner": true, "text": "FREEDOM"}, {"subject": "star", "combo": "swallows"}],
    options: [subjectOpt("heart"), selectOpt("combo", "Combine with", ["none", "dagger", "roses", "flames", "rays", "swallows"], "none"),
      boolOpt("banner", "Banner", false), textOpt("text", "Banner text", "MOM"), selectOpt("palette", "Palette", ["traditional", "muted", "neo", "grey"], "traditional"),
      boolOpt("sparkles", "Sparkles & dots", true), weightOpt(7, "Outline weight"), seedOpt()],
    gen(o, ctx) {
      return traditionalScene(ctx, o, { palette: pal(o.palette), w: o.weight });
    },
  },
  {
    usesFonts: true, id: "neo-traditional", name: "Neo-traditional", category: "Color",
    description: "Richer jewel-tone palette, heavy outlines and an ornamental frame with flowers.",
    gallery: [{"subject": "wolf"}, {"subject": "fox", "frame": "oval", "flowers": "peonies"}, {"subject": "owl", "frame": "circle", "flowers": "daisies"}, {"subject": "lion", "flowers": "roses", "palette": "muted"}, {"subject": "deer", "frame": "oval"}, {"subject": "skull", "frame": "arch", "banner": true, "text": "Memento mori"}],
    options: [subjectOpt("wolf"), selectOpt("frame", "Ornamental frame", ["arch", "oval", "circle", "none"], "arch"),
      selectOpt("flowers", "Flowers", ["roses", "peonies", "daisies", "none"], "roses"), selectOpt("palette", "Palette", ["neo", "traditional", "muted"], "neo"),
      boolOpt("banner", "Banner", false), textOpt("text", "Banner text", ""), weightOpt(8, "Outline weight"), seedOpt()],
    gen(o, ctx) { return neoScene(ctx, o); },
  },
  {
    id: "watercolor", name: "Watercolor", category: "Color",
    description: "Soft colour splashes with blurred, bleeding edges behind crisp linework.",
    gallery: [{"subject": "butterfly"}, {"subject": "hummingbird", "colors": "pink"}, {"subject": "fox", "colors": "autumn"}, {"subject": "lotus", "colors": "purple"}, {"subject": "whale", "colors": "ocean"}, {"subject": "feather", "colors": "teal", "lines": "bold"}, {"subject": "rose", "colors": "red", "splatter": false}, {"subject": "jellyfish", "colors": "sunset"}],
    options: [subjectOpt("butterfly"), selectOpt("colors", "Colors", Object.keys(WATERCOLORS), "rainbow"), rangeOpt("spread", "Splash size", 0.4, 1.8, 0.05, 1),
      selectOpt("lines", "Linework", ["fine", "bold", "none"], "fine"), boolOpt("splatter", "Splatter", true), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const scene = compose([subj(o, 500, 500, 600)], CANVAS);
      let body = renderScene(ctx, scene, "watercolor", { colors: WATERCOLORS[o.colors] || WATERCOLORS.rainbow, seed: hashNum(o.seed), spread: o.spread, splatter: o.splatter, lines: "none" });
      if (o.lines !== "none") body += renderScene(ctx, scene, "line", { w: o.lines === "bold" ? 5 : 2.2, color: o.color, bold: o.lines === "bold" ? 1.5 : 1.15 });
      const bb = sceneBBox(scene, 60 + 90 * o.spread);
      return { body, bbox: bb };
    },
  },
  {
    usesFonts: true, id: "trash-polka", name: "Trash polka", category: "Bold",
    description: "Black realism-ish subject collaged with aggressive red brush strokes, splatter and type.",
    gallery: [{"subject": "skull"}, {"subject": "wolf", "render": "solid", "text": "WILD"}, {"subject": "eagle", "render": "line"}, {"subject": "rose", "render": "dots", "text": "LOVE"}, {"subject": "clock", "render": "hatch", "text": "TIME"}, {"subject": "hand", "render": "solid", "text": ""}],
    options: [subjectOpt("skull"), rangeOpt("red", "Red strokes", 1, 6, 1, 3), boolOpt("splatter", "Splatter", true),
      textOpt("text", "Text fragment", "CHAOS"), selectOpt("render", "Subject render", ["hatch", "solid", "line", "dots"], "hatch"), colorOpt("#c4161c", "Accent color"), seedOpt()],
    gen(o, ctx) {
      const rng = makeRng("tp" + o.seed + o.subject + o.text);
      const red = o.color;
      const scene = compose([subj(o, 500, 500, 600)], CANVAS);
      const rough = ctx.uid("rf");
      ctx.defs.push(`<filter id="${rough}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${hashNum(o.seed) % 999}"/><feDisplacementMap in="SourceGraphic" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>`);
      let back = "", front = "";
      for (let i = 0; i < o.red; i++) {
        const a = rng() * Math.PI, c = [500 + (rng() - 0.5) * 300, 500 + (rng() - 0.5) * 300], L = 380 + rng() * 300;
        const p0 = polar(c[0], c[1], -L / 2, a), p2 = polar(c[0], c[1], L / 2, a), p1 = add(c, mul(perp(norm(sub(p2, p0))), (rng() - 0.5) * 160));
        const w = 26 + rng() * 40;
        const d = taperSmoothD([p0, p1, p2], (t) => w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.05))), { step: 8 });
        back += `<path d="${d}" fill="${red}"/>`;
        // dry-brush bristle streaks
        for (let k = 0; k < 5; k++) { const off = (k - 2) * w * 0.35; const q0 = add(p2, mul(perp(norm(sub(p2, p0))), off)); const q1 = polar(q0[0], q0[1], 30 + rng() * 60, a); back += `<path d="M${f1(q0[0])} ${f1(q0[1])}L${f1(q1[0])} ${f1(q1[1])}" stroke="${red}" stroke-width="${f2(3 + rng() * 5)}" stroke-linecap="round"/>`; }
      }
      if (rng() < 0.8) { const r = 200 + rng() * 120; back += `<path d="${polyD(arcPts(500 + (rng() - 0.5) * 120, 480, r, 0.3, TAU - 0.2, 60), false)}" fill="none" stroke="${red}" stroke-width="${f2(18 + rng() * 14)}" stroke-linecap="round"/>`; }
      let splat = "";
      if (o.splatter) {
        for (let i = 0; i < 40; i++) {
          const a = rng() * TAU, r = 120 + rng() * 360, p = polar(500, 500, r, a), rr = rng() < 0.85 ? 2 + rng() * 6 : 8 + rng() * 14;
          splat += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(rr)}" fill="${rng() < 0.6 ? red : INK}"/>`;
        }
      }
      // fine geometric lines & marks
      let geo = "";
      for (let i = 0; i < 3; i++) { const y = 150 + rng() * 700, x0 = rng() * 300, x1 = 700 + rng() * 300; geo += `M${f1(x0)} ${f1(y)}L${f1(x1)} ${f1(y + (rng() - 0.5) * 300)}`; }
      front += `<path d="${geo}" stroke="${INK}" stroke-width="3" fill="none"/>`;
      for (let i = 0; i < 2; i++) { const x = 180 + rng() * 640, y = 140 + rng() * 720; front += `<path d="M${f1(x - 14)} ${f1(y)}H${f1(x + 14)}M${f1(x)} ${f1(y - 14)}V${f1(y + 14)}" stroke="${INK}" stroke-width="4"/><circle cx="${f1(x)}" cy="${f1(y)}" r="9" fill="none" stroke="${INK}" stroke-width="3"/>`; }
      let subjBody = "";
      if (o.render === "hatch") subjBody = renderScene(ctx, scene, "hatch", { w: 3.4, seed: o.seed, spacing: 6 });
      else if (o.render === "dots") subjBody = renderScene(ctx, scene, "dots", { w: 3.4, seed: o.seed });
      else if (o.render === "line") subjBody = renderScene(ctx, scene, "line", { w: 4.5 });
      else subjBody = renderScene(ctx, scene, "solid", { w: 3.4 });
      let txt = "";
      if (o.text) {
        const t = textEls(o.text.toUpperCase(), { font: "typewriter", size: 64, cx: 500 + (rng() - 0.5) * 300, cy: 860 - rng() * 60, layout: "straight", tracking: 0.15 });
        const ang = (rng() - 0.5) * 16;
        txt = `<g transform="rotate(${f1(ang)} 500 840)">${t.els.map((e) => `<path d="${e.d}" fill="${INK}"/>`).join("")}</g>`;
      }
      const body = `<g filter="url(#${rough})">${back}</g>${subjBody}<g filter="url(#${rough})">${splat}</g>${front}${txt}`;
      return { body, bbox: [40, 40, 920, 920] };
    },
  },
  {
    id: "sketch", name: "Sketch / hatching", category: "Black & grey",
    description: "Illustrative pen sketch: wobbly double contours and cross-hatched shading.",
    gallery: [{"subject": "eagle"}, {"subject": "wolf"}, {"subject": "rose", "angle": 40}, {"subject": "skull", "layers": 4}, {"subject": "lion", "sketchiness": 2}, {"subject": "owl", "guides": false}],
    options: [subjectOpt("eagle"), rangeOpt("density", "Hatch density", 0.5, 2, 0.05, 1), rangeOpt("angle", "Hatch angle", -80, 80, 1, -35),
      rangeOpt("sketchiness", "Sketchiness", 0, 3, 0.1, 1.3), rangeOpt("layers", "Hatch layers", 1, 4, 1, 3), boolOpt("guides", "Construction lines", true), weightOpt(2.4), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const scene = compose([subj(o, 500, 500, 620)], CANVAS);
      let body = "";
      if (o.guides) {
        const rng = makeRng("g" + o.seed);
        const bb = sceneBBox(scene);
        let d = "";
        d += circleD(500, 500, Math.max(bb[2], bb[3]) * 0.52);
        d += polyD([[bb[0] - 30, 500 + (rng() - 0.5) * 40], [bb[0] + bb[2] + 30, 500 + (rng() - 0.5) * 40]], false);
        d += polyD([[500 + (rng() - 0.5) * 30, bb[1] - 30], [500 + (rng() - 0.5) * 30, bb[1] + bb[3] + 30]], false);
        body += `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="${f2(o.weight * 0.35)}" opacity=".45"/>`;
      }
      body += renderScene(ctx, scene, "hatch", { w: o.weight, color: o.color, spacing: 6.5 / o.density, angle: o.angle, sketch: o.sketchiness, seed: o.seed, layers: o.layers, hw: 1 });
      return out(body, scene, 40);
    },
  },
  {
    usesFonts: true, id: "ignorant", name: "Ignorant style", category: "Line",
    description: "Deliberately naive, wobbly doodles with handwritten words — anti-perfect flash.",
    gallery: [{"subject": "doodle-smiley"}, {"subject": "doodle-ghost", "text": "boo"}, {"subject": "doodle-snake", "text": "no"}, {"subject": "doodle-heart", "text": "love u"}, {"subject": "doodle-house", "text": "home"}, {"subject": "doodle-alien", "text": "hi"}, {"subject": "cat", "text": "meow"}, {"subject": "dagger", "text": "stab"}],
    options: [selectOpt("subject", "Doodle", [...["smiley", "ghost", "flower", "snake", "heart", "house", "sun", "alien", "lightning"].map((v) => ({ value: "doodle-" + v, label: v[0].toUpperCase() + v.slice(1) + " (doodle)" })), ...SUBJECTS.map((s) => ({ value: s.id, label: s.name }))], "doodle-smiley"),
      rangeOpt("wobble", "Wobble", 0, 4, 0.1, 1.8), textOpt("text", "Scribbled text", "ok"), rangeOpt("extras", "Extra doodles", 0, 6, 1, 3), weightOpt(4.5), colorOpt(), seedOpt()],
    gen(o, ctx) { return ignorantScene(ctx, o); },
  },
  {
    id: "animals", name: "Animals", category: "Subjects",
    description: "Animal silhouettes and portraits — line, solid, low-poly geometric, dotwork or color.",
    gallery: [{"subject": "wolf"}, {"subject": "lion", "render": "silhouette"}, {"subject": "eagle", "render": "geometric"}, {"subject": "fox", "render": "dotwork"}, {"subject": "deer", "render": "hatch"}, {"subject": "koi", "render": "color"}, {"subject": "owl", "frame": "circle"}, {"subject": "dragon", "render": "color"}, {"subject": "butterfly", "render": "silhouette"}, {"subject": "bear", "render": "geometric", "frame": "hexagon"}, {"subject": "snake", "render": "color"}, {"subject": "phoenix", "render": "color"}],
    options: [subjectOpt("wolf", (s) => ANIMAL_IDS.includes(s.id), "subject", "Animal"), selectOpt("render", "Rendering", ["line", "silhouette", "geometric", "dotwork", "hatch", "color"], "line"),
      selectOpt("frame", "Frame", ["none", "circle", "triangle", "diamond", "hexagon"], "none"), weightOpt(3), colorOpt(), seedOpt()],
    gen(o, ctx) {
      const scene = compose([subj(o, 500, 500, o.frame === "none" ? 640 : 540)], CANVAS);
      const fr = o.frame !== "none" ? [...frameEls(o.frame, 500, 500, 380), ...occluderEls(scene, 24)] : [];
      let body = fr.length ? renderScene(ctx, { box: CANVAS, els: fr }, "line", { w: o.weight, color: o.color, bold: 1 }) : "";
      const mode = { line: "line", silhouette: "solid", geometric: "geo", dotwork: "dots", hatch: "hatch", color: "fill" }[o.render];
      body += renderScene(ctx, scene, mode, { w: mode === "fill" ? o.weight * 2 : o.weight, color: o.color, seed: o.seed, palette: PALETTES.traditional });
      return out(body, { box: CANVAS, els: [...scene.els, ...fr.filter((e) => !e.gap)] }, o.weight * 3 + 10);
    },
  },
  {
    id: "skull", name: "Skull", category: "Subjects",
    description: "Skulls: classic, sugar skull, with roses, crossbones, dagger or geometric.",
    gallery: [{"variant": "sugar"}, {"variant": "classic", "ink": "line"}, {"variant": "roses"}, {"variant": "crossbones", "ink": "dotwork"}, {"variant": "dagger"}, {"variant": "geometric", "ink": "line"}, {"variant": "classic", "ink": "solid"}],
    options: [selectOpt("variant", "Variant", ["classic", "sugar", "roses", "crossbones", "dagger", "geometric"], "sugar"),
      selectOpt("ink", "Ink", ["color", "line", "dotwork", "solid"], "color"), weightOpt(5), seedOpt()],
    gen(o, ctx) { return skullScene(ctx, o); },
  },
  {
    id: "floral", name: "Floral / botanical", category: "Subjects",
    description: "Roses, peonies, lotus, daisies and more as single blooms, bouquets, wreaths, crescents and vines.",
    gallery: [{"flower": "rose"}, {"flower": "peony", "ink": "color"}, {"flower": "mixed", "arrangement": "wreath"}, {"flower": "lotus", "arrangement": "single", "ink": "dotwork"}, {"flower": "daisy", "arrangement": "crescent"}, {"flower": "rose", "arrangement": "branch", "ink": "hatch"}, {"flower": "lavender", "arrangement": "single"}, {"flower": "sunflower", "arrangement": "vine", "ink": "color"}, {"flower": "peony", "arrangement": "single", "ink": "watercolor"}],
    options: [selectOpt("flower", "Flower", [...FLOWER_IDS, "mixed"], "rose"), selectOpt("arrangement", "Arrangement", ["single", "bouquet", "wreath", "crescent", "branch", "vine"], "bouquet"),
      selectOpt("ink", "Ink", ["line", "color", "dotwork", "hatch", "watercolor"], "line"), rangeOpt("density", "Leaf density", 1, 5, 1, 3), weightOpt(2.6), colorOpt(), seedOpt()],
    gen(o, ctx) { return floralScene(ctx, o); },
  },
  {
    id: "feather-dreamcatcher", name: "Feather & dreamcatcher", category: "Subjects",
    description: "Feathers (with birds breaking free), dreamcatchers, feather trios and arrows.",
    gallery: [{"variant": "feather-birds"}, {"variant": "dreamcatcher"}, {"variant": "three-feathers", "ink": "color"}, {"variant": "arrow-feather"}, {"variant": "feather", "ink": "watercolor"}, {"variant": "dreamcatcher", "ink": "dotwork"}],
    options: [selectOpt("variant", "Variant", ["feather-birds", "feather", "dreamcatcher", "three-feathers", "arrow-feather"], "feather-birds"),
      selectOpt("ink", "Ink", ["line", "dotwork", "color", "watercolor"], "line"), selectOpt("colors", "Watercolor palette", Object.keys(WATERCOLORS), "teal"), weightOpt(2.6), colorOpt(), seedOpt()],
    gen(o, ctx) { return featherScene(ctx, o); },
  },
];

export function hashNum(seed) { let h = 0; const s = String(seed); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 100000; }
function nearScene(scene, x, y, gap) { if (partAt(scene, x, y)) return true; for (const [dx, dy] of [[gap, 0], [-gap, 0], [0, gap], [0, -gap]]) if (partAt(scene, x + dx, y + dy)) return true; return false; }

// ---------------------------------------------------------------- traditional
function traditionalScene(ctx, o, { palette, w }) {
  const rng = makeRng("tr" + o.seed + o.subject + o.combo);
  const items = [];
  const hasBanner = o.banner && String(o.text || "").trim();
  const sy = hasBanner ? 470 : 500;
  if (o.combo === "rays") { const els = []; for (let i = 0; i < 24; i++) { const a = i * TAU / 24; els.push(line(polyD([polar(500, sy, 330, a), polar(500, sy, i % 2 ? 420 : 460, a)], false), 0.6)); } items.push({ els }); }
  if (o.combo === "flames") items.push({ m: getMotif("flame"), x: 500, y: sy - 170, size: 520 });
  if (o.combo === "dagger") items.push({ m: getMotif("dagger"), x: 500, y: sy, size: 820, rot: 28 });
  if (o.combo === "swallows") { items.push({ m: getMotif("swallow"), x: 210, y: sy - 220, size: 300 }, { m: getMotif("swallow"), x: 790, y: sy - 220, size: 300, flip: true }); }
  items.push(subj(o, 500, sy, o.combo === "none" ? 620 : 540));
  if (o.combo === "roses") { items.push({ m: getMotif("rose"), x: 250, y: sy + 230, size: 300, rot: -15 }, { m: getMotif("rose"), x: 750, y: sy + 230, size: 300, rot: 15 }); }
  if (hasBanner) {
    const b = bannerEls({ cx: 500, cy: sy + 260, width: 640, height: 120, curve: 50, role: "cream" });
    const t = textEls(o.text, { font: "western", size: 76, base: b.base.map((p) => [p[0], p[1] + 27]), fill: "solid", role: "dark" });
    items.push({ els: [...b.els, ...t.els] });
  }
  if (o.sparkles) {
    const els = [];
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 1.1 + (rng() - 0.5) * 0.4, p = polar(500, sy, 380 + rng() * 40, a); els.push(sparkleStar(p[0], p[1], 18 + rng() * 10)); }
    for (let i = 0; i < 5; i++) { const a = rng() * TAU, p = polar(500, sy, 360 + rng() * 70, a); els.push(dark(circleD(p[0], p[1], 5 + rng() * 4))); }
    items.push({ els });
  }
  const scene = compose(items, CANVAS);
  return out(renderScene(ctx, scene, "fill", { w, palette, bold: 1.7 }), scene, w * 2 + 8);
}

function neoScene(ctx, o) {
  const palette = pal(o.palette);
  const rng = makeRng("neo" + o.seed);
  const items = [];
  const cx = 500, cy = 470;
  if (o.frame !== "none") {
    const els = [];
    let outer, inner;
    if (o.frame === "arch") { outer = [[220, 820], ...arcPts(cx, 380, 280, Math.PI, TAU, 36), [780, 820]]; inner = [[256, 790], ...arcPts(cx, 380, 244, Math.PI, TAU, 36), [744, 790]]; }
    else if (o.frame === "oval") { outer = arcPts(cx, cy, 300, 0, TAU, 60).map((p) => [p[0] * 0.82 + cx * 0.18, p[1]]); inner = arcPts(cx, cy, 264, 0, TAU, 60).map((p) => [p[0] * 0.82 + cx * 0.18, p[1]]); }
    else { outer = arcPts(cx, cy, 310, 0, TAU, 60); inner = arcPts(cx, cy, 272, 0, TAU, 60); }
    els.push(part(polyD(outer) + polyD(inner.slice().reverse()), "gold", { rule: "evenodd" }));
    els.push(part(polyD(inner), "cream"));
    // jewel & filigree at top
    const top = o.frame === "arch" ? [cx, 100] : [cx, cy - (o.frame === "oval" ? 300 : 310)];
    for (const sg of [-1, 1]) {
      const sc = [[top[0] + sg * 20, top[1] + 4], [top[0] + sg * 70, top[1] - 30], [top[0] + sg * 120, top[1] - 10], [top[0] + sg * 110, top[1] + 24], [top[0] + sg * 86, top[1] + 10]];
      els.push(part(taperSmoothD(sc, (t) => 9 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) + 1.5, { step: 3 }), "gold"));
    }
    els.push(part(polyD([[top[0], top[1] - 40], [top[0] + 28, top[1]], [top[0], top[1] + 40], [top[0] - 28, top[1]]]), "main"));
    els.push(line(polyD([[top[0] - 28, top[1]], [top[0] + 28, top[1]]], false), 0.4), { t: "shine", d: polyD([[top[0] - 8, top[1] - 24], [top[0] - 2, top[1] - 26], [top[0] - 14, top[1] - 6]]) });
    items.push({ els });
  }
  items.push(subj(o, cx, cy - 10, 470));
  const fl = { roses: "rose", peonies: "peony", daisies: "daisy" }[o.flowers];
  if (fl) {
    for (const [x, y, s, r] of [[300, 740, 230, -20], [700, 740, 230, 20], [500, 800, 200, 0]]) {
      items.push({ els: leafEls([x, y], polar(x, y, 160, (x < 500 ? Math.PI + 0.3 : -0.3) + (rng() - 0.5) * 0.3), 34, { veins: 3, curve: 0.08 }) });
    }
    items.push({ m: getMotif(fl), x: 300, y: 740, size: 240, rot: -18 }, { m: getMotif(fl), x: 700, y: 740, size: 240, rot: 18 }, { m: getMotif(fl === "rose" ? "peony" : "rose"), x: 500, y: 790, size: 200 });
  }
  if (o.banner && String(o.text || "").trim()) {
    const b = bannerEls({ cx, cy: 880, width: 600, height: 110, curve: -40, role: "cream" });
    items.push({ els: [...b.els, ...textEls(o.text, { font: "scriptBold", size: 80, base: b.base.map((p) => [p[0], p[1] + 26]), role: "dark" }).els] });
  }
  const scene = compose(items, CANVAS);
  return out(renderScene(ctx, scene, "fill", { w: o.weight, palette, bold: 1.8 }), scene, o.weight * 2 + 8);
}

// ---------------------------------------------------------------- ignorant
function doodleEls(kind, cx, cy, s, rng) {
  const els = [];
  const C = (x, y, r) => circleD(cx + x * s, cy + y * s, r * s);
  const P = (pts, closed) => (closed ? smooth : (p) => smooth(p, false))(pts.map((p) => [cx + p[0] * s, cy + p[1] * s, p[2]]), closed);
  if (kind === "smiley") { els.push(part(C(0, 0, 1), "gold"), dark(C(-0.35, -0.25, 0.1)), dark(C(0.35, -0.25, 0.1)), line(P([[-0.5, 0.15], [0, 0.55], [0.5, 0.15]]), 1)); }
  else if (kind === "ghost") { els.push(part(P([[0, -1], [0.7, -0.6], [0.75, 0.5], [0.8, 1, 1], [0.45, 0.75], [0.15, 1, 1], [-0.15, 0.75], [-0.45, 1, 1], [-0.8, 1, 1], [-0.75, 0.5], [-0.7, -0.6]], true), "white"), dark(C(-0.25, -0.3, 0.12)), dark(C(0.25, -0.3, 0.12)), line(P([[-0.15, 0.1], [0, 0.25], [0.15, 0.1]]), 0.8)); }
  else if (kind === "flower") { for (let i = 0; i < 5; i++) { const p = polar(0, -0.2, 0.5, i * TAU / 5 - Math.PI / 2); els.push(part(C(p[0], p[1], 0.32), "pink")); } els.push(part(C(0, -0.2, 0.25), "gold"), line(P([[0, 0.1], [0.05, 0.6], [0, 1.1]]), 1), part(petalD([cx, cy + 0.7 * s], [cx + 0.45 * s, cy + 0.45 * s], 0.12 * s), "leaf")); }
  else if (kind === "snake") { els.push(part(taperSmoothD([[-0.9, 0.6], [-0.4, 0.9], [0.1, 0.4], [-0.2, -0.1], [0.3, -0.5], [0.8, -0.4]].map((p) => [cx + p[0] * s, cy + p[1] * s]), (t) => 0.06 * s + 0.1 * s * Math.sin(t * Math.PI * 0.9)), "leaf"), dark(C(0.72, -0.48, 0.05)), line(P([[0.88, -0.38], [1.05, -0.3]]), 0.6)); }
  else if (kind === "heart") { els.push(part(`M${cx} ${cy - 0.4 * s}C${cx} ${cy - 1 * s} ${cx - 1 * s} ${cy - 1 * s} ${cx - 1 * s} ${cy - 0.3 * s}C${cx - 1 * s} ${cy + 0.3 * s} ${cx - 0.3 * s} ${cy + 0.6 * s} ${cx} ${cy + 1 * s}C${cx + 0.3 * s} ${cy + 0.6 * s} ${cx + 1 * s} ${cy + 0.3 * s} ${cx + 1 * s} ${cy - 0.3 * s}C${cx + 1 * s} ${cy - 1 * s} ${cx} ${cy - 1 * s} ${cx} ${cy - 0.4 * s}Z`, "main"), line(P([[-1.3, 0.9], [1.3, -0.9]]), 0.9), line(P([[1.3, -0.9], [1.05, -0.95]]), 0.9), line(P([[1.3, -0.9], [1.2, -0.65]]), 0.9)); }
  else if (kind === "house") { els.push(part(polyD([[cx - 0.7 * s, cy - 0.1 * s], [cx + 0.7 * s, cy - 0.1 * s], [cx + 0.7 * s, cy + 0.9 * s], [cx - 0.7 * s, cy + 0.9 * s]]), "white"), part(polyD([[cx - 0.9 * s, cy], [cx, cy - 0.9 * s], [cx + 0.9 * s, cy]]), "main"), part(polyD([[cx - 0.15 * s, cy + 0.9 * s], [cx - 0.15 * s, cy + 0.4 * s], [cx + 0.2 * s, cy + 0.4 * s], [cx + 0.2 * s, cy + 0.9 * s]]), "brown"), line(P([[0.4, -0.5], [0.4, -0.95], [0.6, -0.95], [0.6, -0.3]]), 0.8)); }
  else if (kind === "sun") { els.push(part(C(0, 0, 0.6), "gold"), dark(C(-0.2, -0.1, 0.07)), dark(C(0.2, -0.1, 0.07)), line(P([[-0.2, 0.18], [0, 0.3], [0.2, 0.18]]), 0.7)); for (let i = 0; i < 9; i++) { const a = i * TAU / 9; els.push(line(polyD([polar(cx, cy, 0.78 * s, a), polar(cx, cy, 1.1 * s, a + 0.1)], false), 0.9)); } }
  else if (kind === "alien") { els.push(part(P([[0, -1], [0.75, -0.5], [0.55, 0.4], [0, 1], [-0.55, 0.4], [-0.75, -0.5]], true), "leaf"), dark(P([[-0.15, -0.15], [-0.6, -0.35], [-0.5, 0.05]], true)), dark(P([[0.15, -0.15], [0.6, -0.35], [0.5, 0.05]], true)), line(P([[-0.15, 0.55], [0.15, 0.55]]), 0.7)); }
  else if (kind === "lightning") els.push(part(polyD([[cx + 0.2 * s, cy - s], [cx - 0.5 * s, cy + 0.1 * s], [cx, cy + 0.1 * s], [cx - 0.3 * s, cy + s], [cx + 0.55 * s, cy - 0.2 * s], [cx + 0.05 * s, cy - 0.2 * s], [cx + 0.45 * s, cy - s]]), "gold"));
  else if (kind === "star") els.push(part(polyD(starPts(cx, cy, s, s * 0.45, 5)), "gold"));
  else if (kind === "x") els.push(line(polyD([[cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]], false), 0.9), line(polyD([[cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]], false), 0.9));
  else if (kind === "spiral") { const pts = []; for (let i = 0; i < 30; i++) { const t = i / 29; pts.push(polar(cx, cy, s * t, t * TAU * 2.2)); } els.push(line(smooth(pts, false), 0.8)); }
  else if (kind === "dots") for (let i = 0; i < 3; i++) els.push(dark(circleD(cx + (i - 1) * s * 0.5, cy + (rng() - 0.5) * s * 0.3, s * 0.12)));
  return els;
}
function ignorantScene(ctx, o) {
  const rng = makeRng("ig" + o.seed + o.subject + o.text);
  const items = [];
  if (String(o.subject).startsWith("doodle-")) items.push({ els: doodleEls(o.subject.slice(7), 500, 470, 230, rng) });
  else items.push({ m: getMotif(o.subject, o.seed), x: 500, y: 470, size: 470, rot: (rng() - 0.5) * 16 });
  const spots = [[200, 200], [800, 190], [170, 760], [830, 740], [150, 470], [850, 470]];
  const kinds = ["star", "x", "spiral", "dots", "heart", "lightning", "smiley", "flower"];
  for (let i = 0; i < o.extras; i++) { const [x, y] = spots[i % spots.length]; items.push({ els: doodleEls(kinds[Math.floor(rng() * kinds.length)], x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60, 50 + rng() * 25, rng) }); }
  if (String(o.text || "").trim()) {
    const t = textEls(o.text, { font: "marker", size: 120, cx: 500, cy: 840, layout: "straight", role: "dark" });
    items.push({ els: tfEls(t.els, M.rc((rng() - 0.5) * 0.15, 500, 840)) });
  }
  const scene = compose(items, CANVAS);
  const amp = o.wobble;
  // wobbly double contour drawn over a plain line rendering
  const id = ctx.uid("ig");
  let body = renderScene(ctx, scene, "line", { w: o.weight * 0.85, color: o.color, bold: 1, inner: true });
  if (amp > 0) {
    const noise = makeNoise("igw" + o.seed);
    let d = "";
    for (const e of scene.els) {
      if (e.t !== "part" || e.noStroke) continue;
      for (const poly of samplePath(e.d, 6)) {
        const pts = (poly.closed ? [...poly, poly[0]] : poly).map((p) => [p[0] + (noise(p[0] * 0.012, p[1] * 0.012) - 0.5) * amp * 9, p[1] + (noise(p[0] * 0.012 + 40, p[1] * 0.012) - 0.5) * amp * 9]);
        d += polyD(pts, false);
      }
    }
    body += `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="${f2(o.weight * 0.55)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out(body, scene, o.weight * 2 + amp * 6 + 10);
}

// ---------------------------------------------------------------- skull
function sugarSkullEls() {
  // decorations in skull motif coordinates (200 box)
  const els = [];
  for (const sg of [1, -1]) {
    const cx = sg > 0 ? 71 : 129, cy = 100;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; els.push(part(petalD([cx, cy], polar(cx, cy, 20, a), 6, { tipRound: 0.4 }), sg > 0 ? "pink" : "gem")); }
    els.push(part(circleD(cx, cy, 8), "gold"), dark(circleD(cx, cy, 4)));
  }
  // forehead flower
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; els.push(part(petalD([100, 56], polar(100, 56, 22, a), 7, { tipRound: 0.4 }), "main")); }
  els.push(part(circleD(100, 56, 7), "gold"));
  for (let i = 0; i < 7; i++) { const a = Math.PI + 0.25 + i * (Math.PI - 0.5) / 6; els.push(dark(circleD(...polar(100, 56, 32, a), 2.2))); }
  // cheek swirls
  for (const sg of [1, -1]) {
    const X = (pts) => sg > 0 ? pts : mirrorX(pts);
    els.push(line(smooth(X([[44, 128], [52, 120], [58, 126], [54, 132], [50, 128]]), false), 0.6));
    els.push(part(petalD(X([[48, 140]])[0], X([[38, 120]])[0], 4), "leaf"));
  }
  // nose heart
  els.push(part("M100 124C100 118 92 118 92 124C92 130 100 136 100 140C100 136 108 130 108 124C108 118 100 118 100 124Z", "main"));
  for (const x of [72, 128]) els.push(dark(circleD(x, 178, 2.2)));
  return els;
}
function skullScene(ctx, o) {
  const items = [];
  const skull = getMotif("skull");
  const v = o.variant;
  if (v === "crossbones") {
    const bone = (rot) => ({ els: tfEls([part(smooth([[30, 92], [40, 84], [50, 92], [150, 92], [160, 84], [170, 92], [168, 100], [170, 108], [160, 116], [150, 108], [50, 108], [40, 116], [30, 108], [32, 100]], true), "light")], M.chain(M.t(500, 640), M.r(rot), M.s(4), M.t(-100, -100))) });
    items.push(bone(0.6), bone(-0.6));
  }
  if (v === "dagger") items.push({ m: getMotif("dagger"), x: 500, y: 520, size: 900, rot: 0 });
  if (v === "roses") items.push({ m: getMotif("rose"), x: 290, y: 720, size: 330, rot: -20 }, { m: getMotif("rose"), x: 710, y: 720, size: 330, rot: 20 });
  const sk = { m: skull, x: 500, y: v === "crossbones" ? 450 : 470, size: v === "roses" || v === "crossbones" ? 520 : 600, roleMap: v === "sugar" ? { light: "white" } : null };
  items.push(sk);
  if (v === "sugar") items.push({ m: { box: skull.box, els: sugarSkullEls() }, x: sk.x, y: sk.y, size: sk.size });
  const scene = compose(items, CANVAS);
  let mode = { color: "fill", line: "line", dotwork: "dots", solid: "solid" }[o.ink];
  if (v === "geometric") mode = o.ink === "color" ? "geo" : mode === "line" ? "geo" : mode;
  const body = renderScene(ctx, scene, mode, { w: mode === "fill" ? o.weight * 1.4 : o.weight * 0.6, palette: v === "sugar" ? PALETTES.traditional : PALETTES.traditional, seed: o.seed, shade: "tone" });
  return out(body, scene, o.weight * 2 + 10);
}

// ---------------------------------------------------------------- floral
function floralScene(ctx, o) {
  const rng = makeRng("fl" + o.seed);
  const flowers = o.flower === "mixed" ? ["rose", "peony", "daisy", "lotus"] : [o.flower];
  const pickF = (i) => flowers[i % flowers.length];
  const items = [];
  const leafN = Math.round(o.density);
  const leaf = (p, ang, L, w = 0.3) => leafEls(p, polar(p[0], p[1], L, ang), L * w, { veins: L > 90 ? 4 : 2, curve: (rng() - 0.5) * 0.2 });
  const arr = o.arrangement;
  if (arr === "single") {
    const stemPts = [[500, 940], [490, 760], [505, 600], [500, 480]];
    items.push({ els: [part(taperSmoothD(stemPts, (t) => 7 - t * 2, { step: 6 }), "leaf")] });
    for (let i = 0; i < leafN; i++) { const t = 0.25 + i * 0.5 / leafN, y = lerp(900, 560, t), sg = i % 2 ? 1 : -1; items.push({ els: leaf([500, y], sg > 0 ? -0.5 : Math.PI + 0.5, 150 - i * 12) }); }
    if (pickF(0) === "lavender") items.push({ m: getMotif("lavender"), x: 500, y: 520, size: 700 });
    else items.push({ m: getMotif(pickF(0), o.seed), x: 500, y: 380, size: 420 });
  } else if (arr === "bouquet") {
    const main = pickF(0);
    const filler = main === "daisy" ? "lavender" : main === "lavender" ? "daisy" : "daisy";
    const tie = [500, 720];
    // leaves fanning behind the heads
    for (let i = 0; i < 4 + leafN * 2; i++) {
      const a = -Math.PI / 2 + (i / (3 + leafN * 2) - 0.5) * 2.6 + (rng() - 0.5) * 0.2;
      const p0 = polar(tie[0], tie[1], 120 + rng() * 60, a);
      items.push({ els: leaf(p0, a + (rng() - 0.5) * 0.3, 150 + rng() * 80, 0.27) });
    }
    // stems
    const stemEls = [];
    for (const dx of [-60, -25, 0, 25, 60]) stemEls.push(line(smooth([[500 + dx * 2.2, 470], [500 + dx * 0.6, 640], tie, [500 - dx * 0.5, 900]], false), 0.8));
    items.push({ els: stemEls });
    // filler blooms and buds at the back
    const fills = [[300, 360, 150, -30], [700, 360, 150, 30], [500, 230, 140, 0]];
    for (const [x, y, sz, r] of fills) items.push({ m: getMotif(o.flower === "mixed" ? flowers[(Math.floor(rng() * 4))] : filler, o.seed + x), x, y, size: sz, rot: r });
    // main heads, back to front
    const heads = [[390, 400, 250, -12], [620, 410, 240, 14], [500, 540, 280, 0]];
    heads.forEach(([x, y, sz, r], i) => items.push({ m: getMotif(o.flower === "mixed" ? flowers[i % flowers.length] : main, o.seed + i), x, y, size: sz, rot: r }));
    // ribbon tie
    items.push({ els: [part(smooth([[452, 700], [500, 690], [548, 700], [544, 740], [500, 732], [456, 740]], true), "main"), part(petalD([480, 728], [420, 830], 16, { curve: 0.1 }), "main"), part(petalD([520, 728], [585, 826], 16, { curve: -0.1 }), "main")] });
  } else if (arr === "wreath" || arr === "crescent") {
    const a0 = arr === "wreath" ? 0 : Math.PI * 0.15, a1 = arr === "wreath" ? TAU : Math.PI * 0.85 + Math.PI * 0.0;
    const R = 340;
    const n = arr === "wreath" ? 18 + leafN * 4 : 12 + leafN * 3;
    for (let i = 0; i < n; i++) {
      const t = i / n, a = arr === "wreath" ? a0 + t * TAU : Math.PI * 0.1 + t * Math.PI * 0.8 + Math.PI * 0.0;
      const aa = arr === "crescent" ? a + Math.PI * 0.0 : a;
      const p = polar(500, 500, R + (rng() - 0.5) * 30, aa + (arr === "crescent" ? 0 : 0));
      const dir = aa + Math.PI / 2 * (i % 2 ? 1 : -1) * 0.5 + Math.PI / 2;
      items.push({ els: leaf(p, dir + (rng() - 0.5) * 0.6, 90 + rng() * 40, 0.3) });
    }
    if (arr === "crescent") items.push({ els: [line(polyD(arcPts(500, 500, R, Math.PI * 0.1, Math.PI * 0.9, 40), false), 0.8)] });
    else items.push({ els: [line(circleD(500, 500, R), 0.8)] });
    const spots = arr === "wreath" ? [0.75, 0.25, 0.5, 0.0].map((k) => k * TAU + 0.3) : [Math.PI * 0.5, Math.PI * 0.25, Math.PI * 0.75];
    spots.forEach((a, i) => { const p = polar(500, 500, R, a); items.push({ m: getMotif(pickF(i), o.seed + i), x: p[0], y: p[1], size: i === 0 ? 240 : 180, rot: (rng() - 0.5) * 40 }); });
  } else if (arr === "branch") {
    const stem = [[140, 800], [330, 640], [520, 520], [720, 380], [880, 220]];
    items.push({ els: [part(taperSmoothD(stem, (t) => 8 * (1 - t) + 2, { step: 6 }), "brown")] });
    const sp = sampleSpline(stem, false, 10);
    for (let i = 4; i < sp.length - 2; i += Math.max(2, 7 - leafN)) { const p = sp[i], u = norm(sub(sp[i + 1], p)), a = Math.atan2(u[1], u[0]); items.push({ els: leaf(p, a + (i % 2 ? 0.9 : -0.9), 110 - i, 0.24) }); }
    [[0.35, 230], [0.62, 200], [0.9, 170]].forEach(([t, s], i) => { const p = sp[Math.floor(t * (sp.length - 1))]; items.push({ m: getMotif(pickF(i), o.seed + i), x: p[0], y: p[1] - s * 0.2, size: s, rot: (rng() - 0.5) * 40 }); });
  } else {
    // vine band (wide)
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push([60 + i * 55, 500 + Math.sin(i * 0.8) * 70]);
    items.push({ els: [line(smooth(pts, false), 1)] });
    const sp = sampleSpline(pts, false, 8);
    for (let i = 3; i < sp.length - 3; i += Math.max(3, 9 - leafN)) { const p = sp[i], u = norm(sub(sp[i + 1], p)), a = Math.atan2(u[1], u[0]); items.push({ els: leaf(p, a + (i % 2 ? 1 : -1) * 1, 90, 0.3) }); }
    [0.2, 0.5, 0.8].forEach((t, i) => { const p = sp[Math.floor(t * (sp.length - 1))]; items.push({ m: getMotif(pickF(i), o.seed + i), x: p[0], y: p[1], size: 170 }); });
  }
  const scene = compose(items, CANVAS);
  const mode = { line: "line", color: "fill", dotwork: "dots", hatch: "hatch", watercolor: "watercolor" }[o.ink];
  const body = renderScene(ctx, scene, mode, { w: mode === "fill" ? o.weight * 2 : o.weight, color: o.color, seed: hashNum(o.seed), palette: PALETTES.neo, colors: WATERCOLORS.pink, spread: 0.8, bold: mode === "line" ? 1.25 : 1.6 });
  return out(body, scene, mode === "watercolor" ? 120 : o.weight * 3 + 10);
}

// ---------------------------------------------------------------- feather & dreamcatcher
function birdEls(x, y, s, rot = 0) {
  const d = smooth([[x - s, y - s * 0.2], [x - s * 0.45, y - s * 0.5], [x, y, 1], [x + s * 0.45, y - s * 0.55], [x + s, y - s * 0.25], [x + s * 0.4, y - s * 0.3], [x, y + s * 0.18, 1], [x - s * 0.4, y - s * 0.25]], true);
  return [dark(rot ? transformD(d, M.rc(rot, x, y)) : d)];
}
function featherScene(ctx, o) {
  const rng = makeRng("fe" + o.seed);
  const items = [];
  const v = o.variant;
  if (v === "feather" || v === "feather-birds") {
    items.push({ m: getMotif("feather"), x: 470, y: 560, size: 720, rot: 28 });
    if (v === "feather-birds") {
      for (let i = 0; i < 7; i++) { const t = i / 6; items.push({ els: birdEls(560 + t * 300 + (rng() - 0.5) * 60, 330 - t * 230 + (rng() - 0.5) * 50, 18 + t * 26, (rng() - 0.5) * 0.4) }); }
    }
  } else if (v === "dreamcatcher") items.push({ m: getMotif("dreamcatcher"), x: 500, y: 500, size: 860 });
  else if (v === "three-feathers") {
    [[-24, 370, "blue"], [0, 500, "main"], [24, 630, "gem"]].forEach(([r, x, role]) => items.push({ m: getMotif("feather"), x, y: 520, size: 680, rot: r, roleMap: { blue: role, gem: role } }));
  } else {
    items.push({ m: getMotif("arrow"), x: 500, y: 520, size: 860, rot: -30 });
    items.push({ els: smallFeather([420, 600], [330, 860], 34, "blue") }, { els: smallFeather([450, 610], [440, 880], 30, "main") });
  }
  const scene = compose(items, CANVAS);
  const mode = { line: "line", dotwork: "dots", color: "fill", watercolor: "watercolor" }[o.ink];
  const body = renderScene(ctx, scene, mode, { w: mode === "fill" ? o.weight * 2 : o.weight, color: o.color, seed: hashNum(o.seed), palette: PALETTES.traditional, colors: WATERCOLORS[o.colors] || WATERCOLORS.teal, inner: true, bold: 1.25 });
  return out(body, scene, mode === "watercolor" ? 120 : o.weight * 3 + 10);
}
