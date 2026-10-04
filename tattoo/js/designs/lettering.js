// Lettering: banners/ribbons, text layouts (straight, arc, stacked), flourishes.
import { smooth, polyD, sampleSpline, circleD, f1, INK, clamp, lerp, transformD, M, starPts, makeRng } from "./core.js";
import { textD, arcTextD, pathTextD, layoutText, FONTS } from "./fonts.js";

const part = (d, role = "main", o = {}) => ({ t: "part", d, role, ...o });
const line = (d, w = 0.7) => ({ t: "line", d, w });
const dark = (d) => ({ t: "dark", d });
const shade = (d) => ({ t: "shade", d });

// Ribbon banner. Returns { els, base } — base = centerline polyline for text.
export function bannerEls({ cx = 500, cy = 500, width = 700, height = 120, curve = 60, style = "ribbon", role = "cream", tailRole = null, foldRole = "shade" }) {
  const N = 40, hw = width / 2, hh = height / 2;
  const yAt = (x) => cy - curve * (1 - (x / hw) ** 2);
  const base = [], top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const x = -hw + (2 * hw * i) / N;
    const dy = (2 * curve * x) / (hw * hw);           // derivative of yAt
    const nx = dy, ny = -1, l = Math.hypot(nx, ny);
    const y = yAt(x);
    base.push([cx + x, y]);
    top.push([cx + x + (nx / l) * hh, y + (ny / l) * hh]);
    bot.push([cx + x - (nx / l) * hh, y - (ny / l) * hh]);
  }
  const els = [];
  const tw = height * 1.15, drop = height * 0.55;
  for (const sg of [-1, 1]) {
    const e = sg < 0 ? 0 : N;
    const tp = top[e], bp = bot[e];
    const inX = sg * (hw - height * 0.35);
    const yIn = yAt(inX);
    // tail behind, shifted down
    const t1 = [cx + inX, yIn - hh + drop], t2 = [cx + inX, yIn + hh + drop];
    const o1 = [cx + sg * (hw + tw), yIn - hh + drop + curve * 0.25], o2 = [cx + sg * (hw + tw), yIn + hh + drop + curve * 0.25];
    const notch = [cx + sg * (hw + tw * 0.62), yIn + drop + curve * 0.25];
    if (style === "scroll") {
      // rolled scroll ends
      const rc = [bp[0] + sg * height * 0.05, bp[1] - hh * 0.2];
      els.push(part(smooth([[tp[0], tp[1]], [tp[0] + sg * height * 0.55, tp[1] + hh * 0.25], [rc[0] + sg * height * 0.55, rc[1] + hh * 0.9], [rc[0], rc[1] + hh * 1.2], [rc[0] - sg * height * 0.3, rc[1] + hh * 0.5], [bp[0], bp[1]]], true), tailRole || role));
      els.push(line(smooth([[rc[0], rc[1] + hh * 0.9], [rc[0] + sg * height * 0.25, rc[1] + hh * 0.4], [rc[0], rc[1]]], false), 0.5));
    } else {
      els.push(part(polyD([t1, o1, notch, o2, t2]), tailRole || role));
      // fold triangle connecting band end to tail
      els.push(part(polyD([[bp[0], bp[1]], t2, [cx + inX, yIn + hh]]), tailRole || role));
      els.push({ t: foldRole === "shade" ? "shade" : "part", d: polyD([[bp[0], bp[1]], t2, [cx + inX, yIn + hh]]), role: "dark" });
    }
  }
  els.push(part(polyD([...top, ...bot.slice().reverse()]), role));
  // subtle inner lines along the band edges
  els.push(line(smooth(top.filter((_, i) => i % 4 === 0).map((p, i, a) => [p[0], p[1] + hh * 0.18]), false), 0.3));
  return { els, base, top, bot };
}

// Text elements for a given layout. Returns { els, bbox:[x0,y0,x1,y1] }
export function textEls(text, { font = "script", size = 160, cx = 500, cy = 500, layout = "straight", arc = 0.5, tracking = 0, fill = "solid", role = "dark", shadow = 0, outline = false, base = null }) {
  const lines = String(text || "").split(/\n|\s\/\s|\|/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) lines.push(" ");
  const els = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const addBox = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  const pieces = [];
  if (base) {
    const r = pathTextD(lines.join(" "), font, size, base, { tracking });
    pieces.push(r.d);
    const xs = base.map((p) => p[0]), ys = base.map((p) => p[1]);
    addBox(Math.min(...xs), Math.min(...ys) - size, Math.max(...xs), Math.max(...ys) + size * 0.4);
  } else if (layout === "arc" || layout === "arc-down") {
    const L = layoutText(lines.join(" "), font, size, { tracking });
    const ang = clamp(0.6 + arc * 1.8, 0.4, 2.6);          // total arc angle (rad)
    const R = Math.max(size * 1.2, L.width / ang);
    if (layout === "arc") {
      const r = arcTextD(lines.join(" "), font, size, cx, cy + R, R, { tracking });
      pieces.push(r.d);
      const half = Math.min(Math.PI / 2, L.width / R / 2);
      addBox(cx - Math.sin(half) * (R + size), cy - size * 0.95, cx + Math.sin(half) * (R + size), cy + R * (1 - Math.cos(half)) + size * 0.3);
    } else {
      const r = arcTextD(lines.join(" "), font, size, cx, cy - R, R + 0, { inside: true, tracking });
      pieces.push(r.d);
      const half = Math.min(Math.PI / 2, L.width / R / 2);
      addBox(cx - Math.sin(half) * (R + size), cy - R * (1 - Math.cos(half)) - size * 0.95, cx + Math.sin(half) * (R + size), cy + size * 0.35);
    }
  } else if (layout === "wave") {
    const L = layoutText(lines.join(" "), font, size, { tracking });
    const w = L.width * 1.08, pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([cx - w / 2 + w * t, cy + Math.sin(t * Math.PI * 2) * size * 0.25 * (0.5 + arc)]); }
    pieces.push(pathTextD(lines.join(" "), font, size, pts, { tracking }).d);
    addBox(cx - w / 2, cy - size * 1.3, cx + w / 2, cy + size * 0.6);
  } else {
    const lh = size * 1.12;
    const n = lines.length;
    lines.forEach((ln, i) => {
      const s = i === 0 || n === 1 ? size : size * 0.8;
      const y = cy + (i - (n - 1) / 2) * lh + s * 0.32;
      const r = textD(ln, font, s, cx, y, { tracking });
      pieces.push(r.d);
      addBox(cx - r.width / 2, y - r.asc * 0.85, cx + r.width / 2, y + r.desc * 0.6);
    });
  }
  const d = pieces.join("");
  if (shadow) els.push(dark(transformD(d, M.t(shadow * 0.7, shadow))));
  if (outline) els.push({ t: "part", d, role: role === "dark" ? "white" : role, sw: 0.75 });
  else if (fill === "solid") els.push(role === "dark" ? dark(d) : { t: "part", d, role, fill: "ink", noStroke: true });
  else els.push({ t: "part", d, role: "white", fill, sw: 0.6 });
  if (!Number.isFinite(x0)) addBox(cx - 100, cy - 100, cx + 100, cy + 100);
  return { els, bbox: [x0, y0, x1, y1] };
}

// Decorative flourishes under/around a text box
export function flourishEls(kind, bbox, rng = makeRng(1)) {
  const [x0, y0, x1, y1] = bbox, cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
  const els = [];
  if (kind === "swash") {
    const y = y1 + h * 0.12;
    els.push(line(smooth([[x0 + w * 0.08, y + h * 0.02], [cx - w * 0.2, y + h * 0.12], [cx, y + h * 0.04], [cx + w * 0.12, y - h * 0.06], [cx + w * 0.06, y - h * 0.12], [cx - w * 0.02, y - h * 0.04], [cx + w * 0.2, y + h * 0.1], [x1 - w * 0.06, y]], false), 1));
  } else if (kind === "hearts") {
    for (const [x, y, s] of [[x1 + h * 0.15, y0 + h * 0.2, 0.22], [x0 - h * 0.15, y1 - h * 0.1, 0.16]]) {
      const S = h * s;
      els.push(dark(`M${f1(x)} ${f1(y + S * 0.3)}C${f1(x)} ${f1(y - S * 0.3)} ${f1(x - S)} ${f1(y - S * 0.3)} ${f1(x - S)} ${f1(y + S * 0.15)}C${f1(x - S)} ${f1(y + S * 0.6)} ${f1(x)} ${f1(y + S)} ${f1(x)} ${f1(y + S * 1.2)}C${f1(x)} ${f1(y + S)} ${f1(x + S)} ${f1(y + S * 0.6)} ${f1(x + S)} ${f1(y + S * 0.15)}C${f1(x + S)} ${f1(y - S * 0.3)} ${f1(x)} ${f1(y - S * 0.3)} ${f1(x)} ${f1(y + S * 0.3)}Z`));
    }
  } else if (kind === "stars") {
    for (let i = 0; i < 5; i++) {
      const x = lerp(x0, x1, rng()), y = rng() < 0.5 ? y0 - h * (0.1 + rng() * 0.25) : y1 + h * (0.05 + rng() * 0.25), r = h * (0.05 + rng() * 0.07);
      els.push(dark(polyD(starPts(x, y, r, r * 0.3, 4))));
    }
  } else if (kind === "lines") {
    const y = y1 + h * 0.15;
    els.push(line(polyD([[x0 + w * 0.1, y], [cx - h * 0.2, y]], false), 0.8), line(polyD([[cx + h * 0.2, y], [x1 - w * 0.1, y]], false), 0.8));
    els.push(dark(polyD([[cx, y - h * 0.08], [cx + h * 0.08, y], [cx, y + h * 0.08], [cx - h * 0.08, y]])));
  } else if (kind === "dots") {
    const y = y1 + h * 0.18;
    for (let i = -3; i <= 3; i++) els.push(dark(circleD(cx + i * h * 0.16, y, h * (0.035 - Math.abs(i) * 0.006))));
  }
  return els;
}
