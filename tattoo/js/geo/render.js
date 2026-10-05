/* Geometric maker — renderer.
   Each shape is rendered once into its own raster in its local frame (cached
   by everything except position/rotation/opacity), then the composition is
   just a few drawImage calls, so dragging stays smooth. Photo looks/effects
   are cached per photo + settings. */

import { shapeGeom, offsetRegions, polysToPath } from "./shapes.js";
import { processPhoto, makeCanvas, ctx2d, trimCanvas, hexToRgb } from "./imgfx.js";
import { rng } from "./delaunay.js";

export const INK = "#141414";
const DEG = Math.PI / 180;

/* What a shape actually looks like once the global "tattoo look" applies. */
export function effective(shape, docLook) {
  const f = shape.fill || {};
  let ink = shape.ink || INK, fillKind = f.kind || "none", look = f.look || "original";
  const fx = { ...(f.fx || {}) };
  let lineW = shape.line?.w || 0;
  if (docLook && docLook !== "design") {
    ink = INK;
    if (docLook === "bw") {
      if (look === "original") look = "bw";
      if (look === "lowpoly" || look === "mosaic") fx.color = "grey";
      if (look === "half") { if (!fx.sideA || fx.sideA === "photo") fx.sideA = "bw"; fx.color = "grey"; }
      if (look === "shatter" && (!fx.sideA || fx.sideA === "photo")) fx.sideA = "bw";
    } else {
      const ll = docLook === "stencil" ? "stencil" : "line";
      if (["original", "bw", "posterize", "dots"].includes(look)) look = ll;
      if (look === "lowpoly") { look = "wire"; fx.shade = 0; fx.vdots = fx.vdots ?? 2; }
      if (look === "wire") fx.shade = 0;
      if (look === "half") { fx.sideA = "line"; fx.sideB = "wire"; fx.shade = 0; }
      if (look === "mosaic") fx.linesOnly = true;
      if (look === "shatter") fx.sideA = "line";
      if (fillKind === "ink") { fillKind = "none"; if (lineW <= 0) lineW = 4; }
    }
  }
  return { ink, fillKind, look, fx, lineW };
}

function pathOf(geom, which = "regions") {
  const p = new Path2D();
  if (which === "regions") polysToPath(geom.regions, true, p);
  return p;
}

export class Renderer {
  /* getPhoto(id) → { canvas, ver, hasAlpha } | null */
  constructor(getPhoto) {
    this.getPhoto = getPhoto;
    this.fxCache = new Map();
    this.rasters = new Map();
  }

  processed(photoId, look, fx, ink) {
    const ph = this.getPhoto(photoId);
    if (!ph || !ph.canvas) return null;
    if (look === "original") return { canvas: ph.canvas, rect: { x: 0, y: 0, w: ph.canvas.width, h: ph.canvas.height }, hasAlpha: ph.hasAlpha };
    const key = `${photoId}|${ph.ver}|${look}|${JSON.stringify(fx || {})}|${ink}`;
    let r = this.fxCache.get(key);
    if (r) { this.fxCache.delete(key); this.fxCache.set(key, r); return r; }
    try { r = processPhoto(ph.canvas, look, fx, ink); }
    catch (e) { console.warn("geo effect failed", look, e); r = { canvas: ph.canvas, rect: { x: 0, y: 0, w: ph.canvas.width, h: ph.canvas.height } }; }
    r.hasAlpha = ph.hasAlpha || look !== "original";
    this.fxCache.set(key, r);
    while (this.fxCache.size > 28) this.fxCache.delete(this.fxCache.keys().next().value);
    return r;
  }

  /* Local corners of the photo inside a shape (for the adjust overlay). */
  photoFrame(shape) {
    const f = shape.fill;
    if (!f || f.kind !== "photo" || !f.photo) return null;
    const ph = this.getPhoto(f.photo);
    if (!ph || !ph.canvas) return null;
    const iw = ph.canvas.width, ih = ph.canvas.height;
    const k = Math.max(shape.w / iw, shape.h / ih) * (f.zoom || 1);
    const c = Math.cos((f.prot || 0) * DEG), s = Math.sin((f.prot || 0) * DEG);
    const ox = (f.px || 0) * shape.w, oy = (f.py || 0) * shape.h;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const x = u * iw * k / 2, y = v * ih * k / 2;
      return [ox + x * c - y * s, oy + x * s + y * c];
    });
  }

  shapeRaster(shape, scale, docLook) {
    const eff = effective(shape, docLook);
    const ph = eff.fillKind === "photo" && shape.fill.photo ? this.getPhoto(shape.fill.photo) : null;
    const key = JSON.stringify([shape.type, shape.w, shape.h, shape.p, shape.fill, shape.line, shape.ink, eff, scale, ph ? ph.ver : 0, ph ? !!ph.canvas : 0]);
    const hit = this.rasters.get(shape.id);
    if (hit && hit.key === key) return hit.r;
    const r = this._renderShape(shape, scale, eff, ph);
    this.rasters.set(shape.id, { key, r });
    return r;
  }

  _renderShape(shape, scale, eff, ph) {
    const geom = shapeGeom(shape);
    const L = shape.line || {};
    const rx = shape.w / 2, ry = shape.h / 2;
    const lw = eff.lineW;
    let m = 6;
    if (lw > 0) m = Math.max(m, lw * 2 + 2);
    if (lw > 0 && L.offset > 0) m = Math.max(m, (L.offset + lw) * 2.6);
    if (L.vdots > 0) m = Math.max(m, L.vdots + 3);
    for (const d of geom.dots) m = Math.max(m, d[2] + 3 + Math.max(0, Math.abs(d[0]) - rx), d[2] + 3 + Math.max(0, Math.abs(d[1]) - ry));
    let x0 = -rx - m, y0 = -ry - m, x1 = rx + m, y1 = ry + m;
    let res = null;
    if (eff.fillKind === "photo" && ph) {
      res = this.processed(shape.fill.photo, eff.look, eff.fx, eff.ink);
      if (res && shape.fill.breakout && res.hasAlpha) {
        const fr = this.photoFrame(shape);
        if (fr) for (const [x, y] of fr) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
    }
    let s = scale;
    const area = (x1 - x0) * (y1 - y0) * s * s;
    if (area > 5e6 * 4) s *= Math.sqrt((5e6 * 4) / area);
    const W = Math.ceil((x1 - x0) * s), H = Math.ceil((y1 - y0) * s);
    const c = makeCanvas(W, H), g = ctx2d(c);
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    const region = pathOf(geom);
    const rule = geom.rule;

    // ---- fill
    if (geom.regions.length) {
      if (eff.fillKind === "ink") { g.fillStyle = eff.ink; g.fill(region, rule); }
      else if (eff.fillKind === "pattern") {
        g.save(); g.clip(region, rule);
        drawPattern(g, shape, eff.ink, geom);
        g.restore();
      } else if (eff.fillKind === "photo") {
        g.save(); g.clip(region, rule);
        if (res) drawPhoto(g, shape, res);
        else drawPlaceholder(g, rx, ry);
        g.restore();
      }
    }
    // ---- outlines (into a layer when the subject breaks out of the frame)
    const breakout = eff.fillKind === "photo" && res && shape.fill.breakout && res.hasAlpha;
    let og = g, layer = null;
    if (breakout) { layer = makeCanvas(W, H); og = ctx2d(layer); og.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); }
    drawOutline(og, geom, shape, eff);
    og.fillStyle = eff.ink;
    for (const sp of geom.solids) { og.beginPath(); sp.forEach(([x, y], i) => (i ? og.lineTo(x, y) : og.moveTo(x, y))); og.closePath(); og.fill(); }
    if (geom.dots.length) {
      og.beginPath();
      for (const [x, y, r] of geom.dots) { og.moveTo(x + r, y); og.arc(x, y, r, 0, Math.PI * 2); }
      og.fill();
    }
    if (breakout) {
      const cut = (shape.fill.breakY ?? 0.15) * ry;
      // the subject hides the frame line where it crosses it (top part)
      og.save();
      og.globalCompositeOperation = "destination-out";
      og.beginPath(); og.rect(x0, y0, x1 - x0, cut - y0); og.clip();
      drawPhoto(og, shape, res);
      og.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(layer, 0, 0);
      g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
      // and pokes out of the frame above it
      g.save();
      g.beginPath(); g.rect(x0, y0, x1 - x0, cut - y0); g.clip();
      const outside = new Path2D(); outside.rect(x0, y0, x1 - x0, y1 - y0); polysToPath(geom.regions, true, outside);
      g.clip(outside, "evenodd");
      drawPhoto(g, shape, res);
      g.restore();
    }
    return { canvas: c, x0, y0, scale: s };
  }

  render(doc, scale, { look, skip } = {}) {
    const W = Math.max(1, Math.round(doc.w * scale)), H = Math.max(1, Math.round(doc.h * scale));
    const out = makeCanvas(W, H), g = ctx2d(out);
    const L = look ?? doc.look;
    for (const sh of doc.shapes) {
      if (sh.hidden || (skip && skip === sh.id)) continue;
      const r = this.shapeRaster(sh, scale, L);
      if (sh.knock) {
        const k = this.knockRaster(sh, scale, L);
        g.save();
        g.globalCompositeOperation = "destination-out";
        g.translate(sh.x * scale, sh.y * scale);
        g.rotate((sh.rot || 0) * DEG);
        g.scale(scale / k.scale, scale / k.scale);
        g.drawImage(k.canvas, k.x0 * k.scale, k.y0 * k.scale);
        g.restore();
      }
      g.save();
      g.globalAlpha = sh.opacity ?? 1;
      g.translate(sh.x * scale, sh.y * scale);
      g.rotate((sh.rot || 0) * DEG);
      g.scale(scale / r.scale, scale / r.scale);
      g.drawImage(r.canvas, r.x0 * r.scale, r.y0 * r.scale);
      g.restore();
    }
    if (L === "stencil") stencilize(out);
    return out;
  }

  /* Mask (dilated by knockGap) used to erase whatever lies below a shape. */
  knockRaster(sh, scale, docLook) {
    const eff = effective(sh, docLook);
    const ph = sh.type === "image" && sh.fill.photo ? this.getPhoto(sh.fill.photo) : null;
    const key = JSON.stringify(["k", sh.type, sh.w, sh.h, sh.p, sh.knockGap, eff.lineW, sh.line, scale, ph ? ph.ver : 0, sh.type === "image" ? sh.fill : 0]);
    const hit = this.rasters.get(sh.id + "#k");
    if (hit && hit.key === key) return hit.r;
    const geom = shapeGeom(sh);
    const gap = Math.max(0, sh.knockGap ?? 10);
    const rx = sh.w / 2, ry = sh.h / 2, m = gap + eff.lineW + 8;
    const x0 = -rx - m, y0 = -ry - m, x1 = rx + m, y1 = ry + m;
    let s = scale;
    const area = (x1 - x0) * (y1 - y0) * s * s;
    if (area > 8e6) s *= Math.sqrt(8e6 / area);
    const W = Math.ceil((x1 - x0) * s), H = Math.ceil((y1 - y0) * s);
    const base = makeCanvas(W, H), g = ctx2d(base);
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    g.fillStyle = "#000"; g.strokeStyle = "#000";
    if (ph && ph.hasAlpha && ph.canvas) {
      g.save(); g.clip(pathOf(geom));
      drawPhoto(g, sh, { canvas: ph.canvas, rect: { x: 0, y: 0, w: ph.canvas.width, h: ph.canvas.height } });
      g.restore();
    } else if (geom.regions.length) g.fill(pathOf(geom), geom.rule);
    if (eff.lineW > 0) {
      g.lineWidth = eff.lineW; g.lineJoin = "round";
      const p = new Path2D();
      if (geom.strokeRegions && !(ph && ph.hasAlpha)) polysToPath(geom.regions, true, p);
      for (const l of geom.lines) polysToPath([l.pts], l.closed, p);
      g.stroke(p);
    }
    for (const sp of geom.solids) { g.beginPath(); sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    for (const [x, y, r] of geom.dots) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    // dilate by drawing shifted copies
    const out = makeCanvas(W, H), og = ctx2d(out);
    const R = gap * s;
    og.drawImage(base, 0, 0);
    if (R > 0.5) {
      for (const f of [1, 0.6]) {
        const n = Math.max(8, Math.min(28, Math.round(R * f)));
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; og.drawImage(base, Math.cos(a) * R * f, Math.sin(a) * R * f); }
      }
    }
    const r = { canvas: out, x0, y0, scale: s };
    this.rasters.set(sh.id + "#k", { key, r });
    return r;
  }

  prune(doc) {
    const ids = new Set(doc.shapes.map((s) => s.id));
    for (const id of [...this.rasters.keys()]) if (!ids.has(id.split("#")[0])) this.rasters.delete(id);
  }

  /* Final artwork: transparent, trimmed, ≤ 2048 px. */
  exportDoc(doc) {
    const scale = Math.min(2, 2048 / Math.max(doc.w, doc.h));
    const full = this.render(doc, scale);
    const t = trimCanvas(full, 6);
    this.rasters.clear(); // export-scale rasters are big; free them
    if (!t) return null;
    if (Math.max(t.width, t.height) > 2048) {
      const k = 2048 / Math.max(t.width, t.height);
      const o = makeCanvas(t.width * k, t.height * k);
      const og = ctx2d(o); og.imageSmoothingQuality = "high"; og.drawImage(t, 0, 0, o.width, o.height);
      return o;
    }
    return t;
  }
}

function drawPhoto(g, shape, res) {
  const f = shape.fill, r = res.rect;
  const k0 = Math.max(shape.w / r.w, shape.h / r.h);
  const k = k0 * (f.zoom || 1);
  g.save();
  g.translate((f.px || 0) * shape.w, (f.py || 0) * shape.h);
  g.rotate((f.prot || 0) * DEG);
  g.scale(k * (f.flip ? -1 : 1), k);
  g.imageSmoothingQuality = "high";
  g.drawImage(res.canvas, -r.x - r.w / 2, -r.y - r.h / 2);
  g.restore();
}

function drawPlaceholder(g, rx, ry) {
  g.save();
  g.fillStyle = "rgba(128,128,140,.18)";
  g.fillRect(-rx, -ry, 2 * rx, 2 * ry);
  g.strokeStyle = "rgba(110,110,125,.45)";
  g.lineWidth = Math.max(2, (rx + ry) * 0.012);
  const s = Math.min(rx, ry) * 0.32;
  g.beginPath();
  g.rect(-s, -s * 0.75, 2 * s, 1.5 * s);
  g.moveTo(-s, s * 0.45); g.lineTo(-s * 0.3, -s * 0.15); g.lineTo(s * 0.2, s * 0.3); g.lineTo(s * 0.5, 0); g.lineTo(s, s * 0.45);
  g.stroke();
  g.beginPath(); g.arc(s * 0.45, -s * 0.35, s * 0.14, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function lineStyle(g, w, style, ink) {
  g.strokeStyle = ink; g.lineWidth = w;
  g.lineJoin = "miter"; g.miterLimit = 3.2; g.lineCap = "butt";
  if (style === "dashed") { g.setLineDash([w * 3.2 + 4, w * 2.2 + 4]); }
  else if (style === "dotted") { g.setLineDash([0.001, w * 2.3 + 2]); g.lineCap = "round"; g.lineJoin = "round"; }
  else g.setLineDash([]);
}

function drawOutline(g, geom, shape, eff) {
  const L = shape.line || {};
  const w = eff.lineW;
  const ink = eff.ink;
  if (w > 0) {
    g.save();
    lineStyle(g, w, L.style, ink);
    const p = new Path2D();
    if (geom.strokeRegions) polysToPath(geom.regions, true, p);
    for (const l of geom.lines) polysToPath([l.pts], l.closed, p);
    g.stroke(p);
    const thin = Math.max(1, w * (L.thin ?? 0.5));
    if (L.double && geom.regions.length && geom.strokeRegions) {
      const d = -((L.gap ?? 10) + w / 2 + thin / 2);
      lineStyle(g, thin, L.style, ink);
      g.stroke(polysToPath(offsetRegions(geom, d), true));
    }
    if (L.offset > 0 && geom.regions.length) {
      const d = L.offset + w / 2 + thin / 2;
      lineStyle(g, thin, L.style, ink);
      g.stroke(polysToPath(offsetRegions(geom, d), true));
    }
    g.restore();
  }
  if (L.vdots > 0 && geom.verts.length) {
    g.fillStyle = ink;
    g.beginPath();
    for (const [x, y] of geom.verts) { g.moveTo(x + L.vdots, y); g.arc(x, y, L.vdots, 0, Math.PI * 2); }
    g.fill();
  }
}

function drawPattern(g, shape, ink, geom) {
  const f = shape.fill;
  const kind = f.pattern || "hatch";
  const sp = Math.max(3, f.pscale ?? 14);
  const w = Math.max(0.6, f.pweight ?? 2);
  const ang = (f.pangle ?? 45) * DEG;
  const rx = shape.w / 2, ry = shape.h / 2;
  const R = Math.hypot(rx, ry) + sp;
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = w; g.lineCap = "butt"; g.setLineDash([]);
  const lines = (a) => {
    g.save(); g.rotate(a);
    g.beginPath();
    for (let y = -R; y <= R; y += sp) { g.moveTo(-R, y); g.lineTo(R, y); }
    g.stroke(); g.restore();
  };
  const rand = rng(Math.round(sp * 31 + w * 7 + shape.w));
  if (kind === "hatch") lines(ang);
  else if (kind === "cross") { lines(ang); lines(ang + Math.PI / 2); }
  else if (kind === "lines") lines(ang - Math.PI / 4);
  else if (kind === "grid") { lines(ang - Math.PI / 4); lines(ang + Math.PI / 4); }
  else if (kind === "dots") {
    g.save(); g.rotate(ang - Math.PI / 4);
    g.beginPath();
    const r = w * 1.1, dy = sp * Math.sqrt(3) / 2;
    let row = 0;
    for (let y = -R; y <= R; y += dy, row++) for (let x = -R + (row % 2) * sp / 2; x <= R; x += sp) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
    g.fill(); g.restore();
  } else if (kind === "stipple" || kind === "fade") {
    const n = Math.min(60000, Math.round((4 * rx * ry) / (sp * sp) * (kind === "fade" ? 2.4 : 1.3)));
    const dx = Math.cos(ang + Math.PI / 4), dy = Math.sin(ang + Math.PI / 4); // fade direction (default: dense at the bottom)
    const ext = Math.abs(dx) * rx + Math.abs(dy) * ry || 1;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (rand() * 2 - 1) * rx, y = (rand() * 2 - 1) * ry;
      if (kind === "fade") {
        const t = ((x * dx + y * dy) / ext + 1) / 2; // 0..1
        if (rand() > Math.pow(t, 1.6)) continue;
      }
      const r = w * (0.45 + rand() * 0.3);
      g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fill();
  } else if (kind === "echo") {
    const mn = Math.min(rx, ry);
    g.beginPath();
    for (let k = 1; ; k++) {
      const sc = 1 - (k * sp) / mn;
      if (sc <= 0.03) break;
      for (const poly of geom.regions) {
        poly.forEach(([x, y], i) => (i ? g.lineTo(x * sc, y * sc) : g.moveTo(x * sc, y * sc)));
        g.closePath();
      }
    }
    g.stroke();
  }
}

function stencilize(c) {
  const g = ctx2d(c);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  const [r, gg, b] = hexToRgb(INK);
  for (let j = 0; j < d.length; j += 4) {
    const a = d[j + 3];
    if (!a) continue;
    const l = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
    const v = (a / 255) * (1 - l);
    const t = Math.max(0, Math.min(1, (v - 0.28) / 0.2));
    d[j] = r; d[j + 1] = gg; d[j + 2] = b; d[j + 3] = Math.round(255 * t * t * (3 - 2 * t));
  }
  g.putImageData(im, 0, 0);
}
