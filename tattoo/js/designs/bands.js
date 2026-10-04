// Strip patterns for bands / rings. Patterns are generated in strip space (u along, v across, v=0 outer edge)
// and mapped either onto a straight band or a ring.
import { f1, f2, polyD, resample, sampleSpline, arcPts, polar, TAU, INK, lerp, clamp } from "./core.js";

// Each pattern: (n, H, o, rng) → { solid:[poly...], lines:[{pts, w}], holes:[poly] }  with u in [0, n*cell] where cell = o.cell
const circ = (cx, cy, r, k = 18) => { const o = []; for (let i = 0; i < k; i++) o.push([cx + r * Math.cos(i / k * TAU), cy + r * Math.sin(i / k * TAU)]); return o; };

export const BAND_PATTERNS = {
  teeth: { name: "Shark teeth", fn: (n, H, c) => ({ solid: Array.from({ length: n }, (_, i) => [[i * c, H], [i * c + c / 2, 0], [i * c + c, H]]) }) },
  teethDouble: { name: "Interlocking teeth", fn: (n, H, c) => ({
    solid: [
      ...Array.from({ length: n }, (_, i) => [[i * c + c * 0.04, H], [i * c + c / 2, H * 0.12], [i * c + c * 0.96, H]]),
      ...Array.from({ length: n }, (_, i) => [[i * c + c / 2 + c * 0.04, 0], [i * c + c, H * 0.88], [i * c + c * 1.46, 0]]),
    ] }) },
  spearheads: { name: "Spearheads", fn: (n, H, c) => ({ solid: Array.from({ length: n }, (_, i) => [[i * c + c * 0.05, H * 0.1], [i * c + c * 0.95, H * 0.5], [i * c + c * 0.05, H * 0.9], [i * c + c * 0.38, H * 0.5]]) }) },
  waves: { name: "Ocean waves", fn: (n, H, c) => ({ solid: Array.from({ length: n }, (_, i) => {
    const u = i * c;
    return sampleSpline([[u, H], [u + c * 0.25, H * 0.55], [u + c * 0.55, H * 0.12], [u + c * 0.85, H * 0.18], [u + c * 0.9, H * 0.45], [u + c * 0.72, H * 0.42], [u + c * 0.78, H * 0.62], [u + c, H]], false, 5);
  }) }) },
  enata: { name: "Enata figures", fn: (n, H, c) => {
    const solid = [], lines = [];
    for (let i = 0; i < n; i++) {
      const u = i * c + c / 2;
      solid.push(circ(u, H * 0.2, H * 0.12));
      lines.push({ pts: [[u, H * 0.3], [u, H * 0.62]], w: 1.4 });
      lines.push({ pts: [[u - c / 2, H * 0.32], [u - c * 0.25, H * 0.45], [u, H * 0.38], [u + c * 0.25, H * 0.45], [u + c / 2, H * 0.32]], w: 1.1 });
      lines.push({ pts: [[u - c * 0.28, H * 0.95], [u - c * 0.18, H * 0.66], [u, H * 0.6], [u + c * 0.18, H * 0.66], [u + c * 0.28, H * 0.95]], w: 1.1 });
    }
    return { solid, lines };
  } },
  turtle: { name: "Turtle shell", fn: (n, H, c) => {
    const solid = [];
    for (let i = 0; i < n; i++) {
      const u = i * c;
      solid.push([[u + c * 0.5, H * 0.08], [u + c * 0.92, H * 0.5], [u + c * 0.5, H * 0.92], [u + c * 0.08, H * 0.5]]);
    }
    const holes = Array.from({ length: n }, (_, i) => { const u = i * c; return [[u + c * 0.5, H * 0.3], [u + c * 0.72, H * 0.5], [u + c * 0.5, H * 0.7], [u + c * 0.28, H * 0.5]]; });
    return { solid, holes };
  } },
  dots: { name: "Dots", fn: (n, H, c) => ({ solid: Array.from({ length: n }, (_, i) => circ(i * c + c / 2, H / 2, Math.min(c, H) * 0.28)) }) },
  stripe: { name: "Solid stripe", fn: (n, H, c) => ({ solid: [[[0, H * 0.18], [n * c, H * 0.18], [n * c, H * 0.82], [0, H * 0.82]]] }) },
  lines: { name: "Fine lines", fn: (n, H, c) => ({ lines: [0.2, 0.5, 0.8].map((v) => ({ pts: [[0, H * v], [n * c, H * v]], w: 0.8 })) }) },
  zigzag: { name: "Zigzag", fn: (n, H, c) => ({ lines: [{ pts: Array.from({ length: n * 2 + 1 }, (_, i) => [i * c / 2, i % 2 ? H * 0.12 : H * 0.88]), w: 1 }] }) },
  chevrons: { name: "Chevrons", fn: (n, H, c) => ({ lines: Array.from({ length: n }, (_, i) => ({ pts: [[i * c + c * 0.2, H * 0.15], [i * c + c * 0.7, H * 0.5], [i * c + c * 0.2, H * 0.85]], w: 1 })) }) },
  triangles: { name: "Triangles", fn: (n, H, c) => ({ lines: Array.from({ length: n }, (_, i) => ({ pts: [[i * c + c * 0.08, H * 0.88], [i * c + c / 2, H * 0.12], [i * c + c * 0.92, H * 0.88], [i * c + c * 0.08, H * 0.88]], w: 0.9 })) }) },
  scallops: { name: "Scallops", fn: (n, H, c) => ({ lines: [{ pts: Array.from({ length: n }, (_, i) => arcPts(i * c + c / 2, H * 0.2, c / 2, Math.PI, 0, 10).map((p) => [p[0], H * 0.2 + (H * 0.2 - p[1]) * -1.2])).flat(), w: 1 }],
    solid: Array.from({ length: n }, (_, i) => circ(i * c + c / 2, H * 0.72, Math.min(c, H) * 0.08)) }) },
  meander: { name: "Greek key", fn: (n, H, c) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i * c, a = H * 0.12, b = H * 0.88, g = (b - a);
      pts.push([u, b], [u, a], [u + c * 0.75, a], [u + c * 0.75, a + g * 0.75], [u + c * 0.25, a + g * 0.75], [u + c * 0.25, a + g * 0.38], [u + c * 0.5, a + g * 0.38], [u + c * 0.5, a + g * 0.5]);
      pts.push(null);
      pts.push([u + c * 0.5, a + g * 0.5]);
      pts.push(null);
    }
    // the classic meander as one polyline per unit + bottom connector
    const lines = [];
    for (let i = 0; i < n; i++) {
      const u = i * c, a = H * 0.12, b = H * 0.88, g = (b - a);
      lines.push({ pts: [[u, b], [u, a], [u + c * 0.8, a], [u + c * 0.8, a + g * 0.8], [u + c * 0.2, a + g * 0.8], [u + c * 0.2, a + g * 0.4], [u + c * 0.55, a + g * 0.4]], w: 1 });
      lines.push({ pts: [[u, b], [u + c, b]], w: 1 });
    }
    return { lines };
  } },
  chain: { name: "Chain", fn: (n, H, c) => {
    const lines = [];
    for (let i = 0; i < n; i++) {
      const u = i * c;
      const ov = (cx, rx, ry) => { const o = []; for (let k = 0; k <= 24; k++) o.push([cx + rx * Math.cos(k / 24 * TAU), H / 2 + ry * Math.sin(k / 24 * TAU)]); return o; };
      lines.push({ pts: ov(u + c * 0.5, c * 0.42, H * 0.3), w: 1.2 });
      lines.push({ pts: [[u + c * 0.86, H / 2], [u + c * 1.14, H / 2]], w: 1.6 });
    }
    return { lines };
  } },
  barbed: { name: "Barbed wire", fn: (n, H, c) => {
    const lines = [];
    const L = n * c, N = Math.ceil(L / 4);
    for (const ph of [0, Math.PI]) lines.push({ pts: Array.from({ length: N + 1 }, (_, i) => { const u = i / N * L; return [u, H / 2 + Math.sin(u / c * TAU * 2 + ph) * H * 0.12]; }), w: 1 });
    for (let i = 0; i < n; i++) {
      const u = i * c + c / 2;
      lines.push({ pts: [[u - c * 0.14, H * 0.2], [u + c * 0.14, H * 0.8]], w: 0.9 });
      lines.push({ pts: [[u + c * 0.14, H * 0.2], [u - c * 0.14, H * 0.8]], w: 0.9 });
    }
    return { lines };
  } },
  checker: { name: "Checker", fn: (n, H, c) => ({ solid: Array.from({ length: n * 2 }, (_, i) => { const u = i * c / 2, top = i % 2 === 0; return [[u, top ? 0 : H / 2], [u + c / 2, top ? 0 : H / 2], [u + c / 2, top ? H / 2 : H], [u, top ? H / 2 : H]]; }) }) },
  running: { name: "Running spiral", fn: (n, H, c) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i * c;
      const spiral = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16, a = Math.PI + t * TAU * 0.9, r = (1 - t * 0.75) * H * 0.3; spiral.push([u + c * 0.55 + r * Math.cos(a), H * 0.5 + r * Math.sin(a)]); }
      pts.push(...sampleSpline([[u, H * 0.85], [u + c * 0.25, H * 0.85], spiral[0]], false, 4), ...spiral);
    }
    return { lines: [{ pts, w: 1.1 }, { pts: [[0, H * 0.96], [n * c, H * 0.96]], w: 0.9 }] };
  } },
  mountains: { name: "Mountains", fn: (n, H, c) => ({ lines: [{ pts: Array.from({ length: n * 2 + 1 }, (_, i) => [i * c / 2, i % 2 ? H * (0.1 + 0.25 * ((i * 7) % 3) / 2) : H * 0.9]), w: 1 }] }) },
  vine: { name: "Vine", fn: (n, H, c) => {
    const lines = [], solid = [];
    const N = n * 8;
    const pts = Array.from({ length: N + 1 }, (_, i) => { const u = i / N * n * c; return [u, H / 2 + Math.sin(u / c * TAU) * H * 0.18]; });
    lines.push({ pts, w: 1 });
    for (let i = 0; i < n * 2; i++) {
      const u = (i + 0.25) * c / 2, y = H / 2 + Math.sin(u / c * TAU) * H * 0.18, dir = i % 2 ? 1 : -1;
      const tip = [u + c * 0.18, y + dir * H * 0.32];
      const mid = [(u + tip[0]) / 2, (y + tip[1]) / 2], nx = -(tip[1] - y), ny = tip[0] - u, l = Math.hypot(nx, ny) || 1, w = c * 0.07;
      solid.push(sampleSpline([[u, y], [mid[0] + nx / l * w, mid[1] + ny / l * w], tip, [mid[0] - nx / l * w, mid[1] - ny / l * w]], true, 4));
    }
    return { lines, solid };
  } },
};

// Map strip coordinates onto a straight band or ring.
export function bandMapper({ kind = "straight", x0 = 0, y0 = 0, L = 1000, R = 400, cx = 500, cy = 500, a0 = -Math.PI / 2, span = TAU }) {
  if (kind === "ring") return { L, map: (p) => polar(cx, cy, R - p[1], a0 + p[0] / L * span), step: 6 };
  return { L, map: (p) => [x0 + p[0], y0 + p[1]], step: 1e9 };
}

// Render a pattern into SVG path strings (ink).
export function renderBand(pattern, { n, H, cell, mapper, color = INK, lw = 3, flip = false }) {
  const pat = (BAND_PATTERNS[pattern] || BAND_PATTERNS.teeth).fn(n, H, cell);
  const mp = (poly, closed) => {
    let pts = poly.map((p) => flip ? [p[0], H - p[1]] : p);
    if (mapper.step < 1e8) pts = resample(closed ? [...pts, pts[0]] : pts, mapper.step);
    return pts.map(mapper.map);
  };
  let solid = "", lines = "";
  for (const poly of pat.solid || []) solid += polyD(mp(poly, true), true);
  for (const poly of pat.holes || []) solid += polyD(mp(poly.slice().reverse(), true), true);
  const byW = {};
  for (const l of pat.lines || []) (byW[l.w] ||= []).push(polyD(mp(l.pts, false), false));
  let out = "";
  if (solid) out += `<path d="${solid}" fill="${color}" fill-rule="evenodd"/>`;
  for (const [w, ds] of Object.entries(byW)) out += `<path d="${ds.join("")}" fill="none" stroke="${color}" stroke-width="${f2(lw * w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return out;
}
