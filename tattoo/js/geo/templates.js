/* Geometric maker — one-tap templates. Photo slots use the built-in sample
   pictures until the user swaps in their own (slot: true marks them). */

import { newDoc, newShape } from "./model.js";

const photo = (id, look = "original", fx = {}, extra = {}) => ({ kind: "photo", photo: id, look, fx, ...extra });

export const TEMPLATES = [
  {
    id: "animal-triangle", name: "Animal in triangle",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("dotted", { x: 512, y: 560, w: 860, h: 860, p: { count: 64, dot: 0.006 } }),
        newShape("triangle", { x: 512, y: 548, w: 700, h: 606, slot: true, fill: photo("sample:wolf", "bw", { contrast: 0.6 }, { zoom: 1.3, py: 0.13 }), line: { w: 7, double: true, gap: 11, vdots: 10 } }),
        newShape("divider", { x: 512, y: 930, w: 560, h: 34, p: { style: "diamond" }, line: { w: 3 } }),
      );
      return d;
    },
  },
  {
    id: "mountains-circle", name: "Mountains in circle",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("circle", { x: 512, y: 512, w: 660, h: 660, slot: true, fill: photo("sample:mountains", "bw", { contrast: 0.65 }, { zoom: 1.3, py: -0.16 }), line: { w: 7, offset: 16, thin: 0.4 } }),
        newShape("dotted", { x: 512, y: 512, w: 820, h: 820, p: { count: 72, dot: 0.0045 } }),
        newShape("mountain", { x: 512, y: 512 - 330 - 52, w: 110, h: 64, fill: { kind: "ink" }, line: { w: 0 }, p: { peaks: 1, snow: false } }),
      );
      return d;
    },
  },
  {
    id: "half-animal", name: "Half geometric animal",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("circle", { x: 512, y: 512, w: 880, h: 880, line: { w: 3.5, style: "dotted" }, fill: { kind: "none" } }),
        newShape("image", { x: 512, y: 512, w: 740, h: 740, slot: true, name: "Half & half", fill: photo("sample:wolf", "half", { sideA: "bw", sideB: "wire", shade: 0.45, detail: 0.42, trans: 0.3, contrast: 0.6 }), line: { w: 0 } }),
      );
      return d;
    },
  },
  {
    id: "hexagon-trio", name: "Hexagon trio",
    build() {
      const d = newDoc("square");
      const w = 300, h = 346;
      const looks = [["sample:mountains", "bw"], ["sample:forest", "bw"], ["sample:wolf", "wire", { detail: 0.4, shade: 0.5 }]];
      const pos = [[512 - 158, 400], [512 + 158, 400], [512, 400 + 274]];
      pos.forEach(([x, y], i) => d.shapes.push(newShape("hexagon", {
        x, y, w, h, slot: true, fill: photo(looks[i][0], looks[i][1], looks[i][2] || {}, { zoom: i === 2 ? 1.25 : 1.05 }), line: { w: 6, vdots: 7 },
      })));
      return d;
    },
  },
  {
    id: "diamond-stack", name: "Diamond stack",
    build() {
      const d = newDoc("portrait");
      const cx = d.w / 2, cy = d.h / 2;
      d.shapes.push(
        newShape("divider", { x: cx, y: cy, w: 1060, h: 30, rot: 90, p: { style: "plain" }, line: { w: 3 } }),
        newShape("diamond", { x: cx, y: cy, w: 440, h: 620, slot: true, knock: true, knockGap: 14, fill: photo("sample:forest", "dots", { dotSize: 3.2 }, { zoom: 1.1 }), line: { w: 6, offset: 16, thin: 0.45 } }),
        newShape("diamond", { x: cx, y: cy - 410, w: 96, h: 136, knock: true, fill: { kind: "ink" }, line: { w: 0 } }),
        newShape("diamond", { x: cx, y: cy + 410, w: 96, h: 136, knock: true, fill: { kind: "none" }, line: { w: 5 } }),
        newShape("diamond", { x: cx, y: cy - 500, w: 44, h: 62, knock: true, fill: { kind: "none" }, line: { w: 4 } }),
        newShape("diamond", { x: cx, y: cy + 500, w: 44, h: 62, knock: true, fill: { kind: "ink" }, line: { w: 0 } }),
      );
      return d;
    },
  },
  {
    id: "moon-triangle", name: "Moon & triangle",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("dotted", { x: 512, y: 512, w: 840, h: 840, p: { count: 56, dot: 0.0055 } }),
        newShape("triangle", { x: 512, y: 590, w: 600, h: 520, fill: { kind: "pattern", pattern: "fade", pscale: 9, pweight: 2.4, pangle: 45 }, line: { w: 6, vdots: 9 } }),
        newShape("crescent", { x: 512, y: 330, w: 300, h: 300, rot: -28, knock: true, knockGap: 16, p: { phase: 0.36 }, fill: { kind: "ink" }, line: { w: 0 } }),
        newShape("star", { x: 700, y: 250, w: 46, h: 46, fill: { kind: "ink" }, line: { w: 0 }, p: { points: 4, inner: 0.3 } }),
        newShape("star", { x: 330, y: 220, w: 30, h: 30, fill: { kind: "ink" }, line: { w: 0 }, p: { points: 4, inner: 0.3 } }),
      );
      return d;
    },
  },
  {
    id: "flower-sacred", name: "Flower in sacred geometry",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("flower", { x: 512, y: 512, w: 900, h: 900, line: { w: 2.5 } }),
        newShape("circle", { x: 512, y: 512, w: 470, h: 470, slot: true, knock: true, knockGap: 12, fill: photo("sample:lotus", "line", { detail: 0.45 }, { zoom: 1.12, py: -0.06 }), line: { w: 6, double: true, gap: 9 } }),
      );
      return d;
    },
  },
  {
    id: "arrow-band", name: "Arrow band",
    build() {
      const d = newDoc("band");
      const cx = d.w / 2, cy = d.h / 2;
      d.shapes.push(
        newShape("arrow", { x: cx, y: cy, w: 1420, h: 150, p: { feathers: 4 } }),
        newShape("diamond", { x: cx, y: cy, w: 230, h: 320, slot: true, knock: true, knockGap: 14, fill: photo("sample:mountains", "bw", {}, { zoom: 1.2 }), line: { w: 5, vdots: 7 } }),
        newShape("triangle", { x: cx - 330, y: cy, w: 70, h: 62, knock: true, fill: { kind: "none" }, line: { w: 4 } }),
        newShape("triangleDown", { x: cx + 330, y: cy, w: 70, h: 62, knock: true, fill: { kind: "none" }, line: { w: 4 } }),
      );
      return d;
    },
  },
  {
    id: "concentric", name: "Concentric rings",
    build() {
      const d = newDoc("square");
      d.shapes.push(
        newShape("nested", { x: 512, y: 512, w: 860, h: 860, p: { base: "circle", copies: 5, spacing: 0.08 }, line: { w: 3 } }),
        newShape("dotted", { x: 512, y: 512, w: 960, h: 960, p: { count: 90, dot: 0.004 } }),
        newShape("circle", { x: 512, y: 512, w: 420, h: 420, slot: true, knock: true, knockGap: 12, fill: photo("sample:lion", "bw", { contrast: 0.6 }, { zoom: 1.1 }), line: { w: 6 } }),
      );
      return d;
    },
  },
];
