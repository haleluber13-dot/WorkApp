/* Geometric maker — document model and defaults. A document is plain JSON:
   { v, aspect, w, h, look, shapes: [Shape…] }  (shapes bottom → top). */

import { SHAPES, defaultParams } from "./shapes.js";
import { INK } from "./render.js";

export const ASPECTS = {
  square: { label: "Square", w: 1024, h: 1024 },
  portrait: { label: "Portrait", w: 864, h: 1152 },
  landscape: { label: "Landscape", w: 1152, h: 864 },
  band: { label: "Band 4:1", w: 1600, h: 400 },
};

let seq = 0;
export const uid = (p = "s") => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export function defaultFx() {
  return {
    detail: 0.45, color: "color", wire: "none", lineW: 1.4, vdots: 2.5, shade: 0.45,
    angle: 0, pos: 0.5, sideA: "bw", sideB: "wire", trans: 0.25,
    gap: 1.5, spread: 0.5, levels: 4, dotSize: 4, contrast: 0.5, seed: 1,
  };
}

export function newShape(type, over = {}) {
  const def = SHAPES[type] || SHAPES.circle;
  const s = {
    id: uid(), type, name: "", x: 512, y: 512, w: def.w, h: def.h, rot: 0,
    p: defaultParams(type),
    fill: {
      kind: def.fill || "none", photo: null, px: 0, py: 0, zoom: 1, prot: 0, flip: false,
      look: "original", fx: defaultFx(), breakout: false, breakY: 0.15,
      pattern: "hatch", pscale: 14, pweight: 2, pangle: 45,
    },
    line: { w: def.line ?? def.lineW ?? 6, style: "solid", double: false, gap: 10, thin: 0.5, offset: 0, vdots: 0 },
    ink: INK, opacity: 1, hidden: false, locked: false, knock: false, knockGap: 10,
  };
  return merge(s, over);
}

function merge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") merge(a[k], v);
    else a[k] = v;
  }
  return a;
}
export { merge };

export function newDoc(aspect = "square") {
  const A = ASPECTS[aspect] || ASPECTS.square;
  return { v: 1, aspect, w: A.w, h: A.h, look: "design", shapes: [] };
}

/* Normalise a doc loaded from storage / history (fills in new fields). */
export function fixDoc(d) {
  const doc = { ...newDoc(d?.aspect), ...(d || {}) };
  doc.shapes = (doc.shapes || []).filter((s) => s && SHAPES[s.type]).map((s) => {
    const base = newShape(s.type);
    return merge(base, JSON.parse(JSON.stringify(s)));
  });
  return doc;
}

export function shapeName(s) {
  return s.name || (s.type === "image" ? "Photo" : SHAPES[s.type]?.label || s.type);
}
