/* Turns a design into the texture that is "inked" into the skin.

   designCanvas(design)   → rasterized artwork (cached per design)
   inkCanvas(base, look)  → processed ink: ink mode (design colors, black &
                            grey, single color, thermal stencil), saturation,
                            density, edge softness, aging (blur, fade, the
                            blue-green shift of old black ink), fresh redness,
                            white-background removal, and for the realistic
                            look a "multiply over white" version so the ink
                            picks up the skin's own lighting. */

const baseCache = new Map(); // designId:version:res → Promise<canvas>
export const PAD = 0.03;     // transparent margin around artwork (fraction)

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image failed to load"));
    im.src = src;
  });
}

export async function svgToImage(svg) {
  let s = String(svg);
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function svgSize(svg) {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  if (vb) return { w: +vb[1], h: +vb[2] };
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(svg), h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  return { w: w ? +w[1] : 1000, h: h ? +h[1] : 1000 };
}

/* Rasterize a design to a canvas whose longest side is `res` px (plus padding). */
export function designCanvas(design, res = 1024) {
  const key = `${design.id}:${design.version || 0}:${res}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const p = (async () => {
    let img, w, h;
    if (design.kind === "image" || design.image) {
      img = await loadImage(design.image);
      w = img.naturalWidth; h = img.naturalHeight;
    } else {
      const sz = svgSize(design.svg);
      w = sz.w; h = sz.h;
      // give the SVG an explicit pixel size so it rasterizes sharply
      const scale = res / Math.max(w, h);
      let s = design.svg.replace(/<svg([^>]*?)\s(width|height)\s*=\s*["'][^"']*["']/gi, "<svg$1").replace(/<svg([^>]*?)\s(width|height)\s*=\s*["'][^"']*["']/gi, "<svg$1");
      s = s.replace(/<svg/i, `<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}"`);
      img = await svgToImage(s);
    }
    const scale = res / Math.max(w, h);
    const cw = Math.max(8, Math.round(w * scale)), ch = Math.max(8, Math.round(h * scale));
    const px = Math.round(Math.max(cw, ch) * PAD);
    const c = document.createElement("canvas");
    c.width = cw + 2 * px; c.height = ch + 2 * px;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, px, px, cw, ch);
    c.isImage = design.kind === "image" || !!design.image;
    c.artW = cw; c.artH = ch; c.pad = px;
    return c;
  })();
  baseCache.set(key, p);
  p.catch(() => baseCache.delete(key));
  if (baseCache.size > 60) baseCache.delete(baseCache.keys().next().value);
  return p;
}
export function forgetDesign(id) {
  for (const k of [...baseCache.keys()]) if (k.startsWith(id + ":")) baseCache.delete(k);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hex = (c) => {
  const n = parseInt(String(c || "#141414").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const canFilter = (() => {
  try { const c = document.createElement("canvas").getContext("2d"); return "filter" in c; } catch { return false; }
})();

/* Blur fallback for browsers without ctx.filter (Safari): three box-blur passes
   on a downscaled copy approximate a gaussian. Draws `src` blurred into ctx. */
function drawBlurred(ctx, src, radius) {
  if (radius <= 0.05) { ctx.drawImage(src, 0, 0); return; }
  if (canFilter) { ctx.filter = `blur(${radius.toFixed(2)}px)`; ctx.drawImage(src, 0, 0); ctx.filter = "none"; return; }
  const k = Math.max(1, Math.min(4, radius / 2));
  const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const r = Math.max(1, Math.round(radius / k / 1.7));
  const im = g.getImageData(0, 0, w, h), d = im.data, tmp = new Float32Array(d.length);
  const pass = (from, to, horiz) => {
    const n = horiz ? w : h, m = horiz ? h : w;
    for (let j = 0; j < m; j++) {
      for (let ch = 0; ch < 4; ch++) {
        let acc = 0;
        const idx = (i) => 4 * (horiz ? j * w + i : i * w + j) + ch;
        for (let i = -r; i <= r; i++) acc += from[idx(Math.min(n - 1, Math.max(0, i)))];
        for (let i = 0; i < n; i++) {
          to[idx(i)] = acc / (2 * r + 1);
          acc += from[idx(Math.min(n - 1, i + r + 1))] - from[idx(Math.max(0, i - r))];
        }
      }
    }
  };
  for (let it = 0; it < 3; it++) { pass(d, tmp, true); pass(tmp, d, false); }
  g.putImageData(im, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, src.width, src.height);
}

/* look = { ink, color, age, opacity, blend: "skin"|"vivid", saturation, density, softness,
            freshGlow, removeWhite, whiteThreshold } */
export function inkCanvas(base, look) {
  const W = base.width, H = base.height;
  const k = W / 1024;
  const age = clamp01(look.age || 0);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  const blur = (look.softness || 0) * 0.6 * k + age * 3 * k;
  drawBlurred(ctx, base, blur);

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const mode = look.ink || "original";
  const [cr, cg, cb] = hex(mode === "color" ? look.color : "#141414");
  const sat = (look.saturation ?? 1) * (1 - age * 0.55);
  const density = (look.density ?? 0.92) * (1 - age * 0.3) * (look.opacity ?? 1);
  const thr = look.whiteThreshold ?? 0.86;
  const keyWhite = base.isImage && look.removeWhite !== false;
  // old black ink drifts toward a soft blue-green grey
  const oldR = 38, oldG = 58, oldB = 62;

  let dark = null;
  if (mode === "stencil") dark = new Float32Array(W * H);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3] / 255;
    if (a === 0) { if (dark) dark[p] = 0; continue; }
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (keyWhite) a *= clamp01((thr - lum) / 0.12 + 0.0);
    if (mode === "black" || mode === "color" || mode === "stencil") {
      // dilute ink: light tones become thinner ink, not lighter paint
      const ink = a * Math.pow(1 - lum, 0.85);
      if (dark) { dark[p] = ink; continue; }
      a = ink;
      r = cr; g = cg; b = cb;
      if (mode === "black" && age > 0) {
        r += (oldR - r) * age * 0.7; g += (oldG - g) * age * 0.7; b += (oldB - b) * age * 0.7;
      }
    } else {
      if (sat !== 1) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      }
      if (age > 0 && lum < 0.25) {
        const t = age * 0.6 * (1 - lum * 4);
        r += (oldR - r) * t; g += (oldG - g) * t; b += (oldB - b) * t;
      }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255 * clamp01(a * density);
  }

  if (dark) {
    // thermal stencil: purple outlines traced from edges of the ink mask
    const [sr, sg, sb] = [74, 44, 140];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x, i = p * 4;
        const xm = x > 0 ? p - 1 : p, xp = x < W - 1 ? p + 1 : p;
        const ym = y > 0 ? p - W : p, yp = y < H - 1 ? p + W : p;
        const gx = dark[xp] - dark[xm], gy = dark[yp] - dark[ym];
        const e = clamp01(Math.hypot(gx, gy) * 2.2) + (dark[p] > 0.55 && dark[p] < 0.9 ? 0.15 : 0);
        d[i] = sr; d[i + 1] = sg; d[i + 2] = sb; d[i + 3] = 255 * clamp01(e) * 0.85 * (look.opacity ?? 1);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // fresh tattoo: soft red irritation around the ink
  if (look.freshGlow && age < 0.2 && mode !== "stencil") {
    const glow = document.createElement("canvas");
    glow.width = W; glow.height = H;
    const g = glow.getContext("2d");
    drawBlurred(g, out, 7 * k);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = `rgba(205,52,52,${0.42 * (1 - age * 5)})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    g.drawImage(out, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(glow, 0, 0);
  }

  if (look.blend !== "vivid") {
    // multiply-ready: ink over white, fully opaque (white = no change to skin)
    const im2 = ctx.getImageData(0, 0, W, H), e = im2.data;
    for (let i = 0; i < e.length; i += 4) {
      const a = e[i + 3] / 255;
      e[i] = 255 + (e[i] - 255) * a; e[i + 1] = 255 + (e[i + 1] - 255) * a; e[i + 2] = 255 + (e[i + 2] - 255) * a; e[i + 3] = 255;
    }
    ctx.putImageData(im2, 0, 0);
  }
  // guarantee a clean border so clamped UVs outside the art stay invisible
  const border = look.blend !== "vivid" ? "#fff" : null;
  if (border) { ctx.fillStyle = border; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H); }
  else { ctx.clearRect(0, 0, W, 2); ctx.clearRect(0, H - 2, W, 2); ctx.clearRect(0, 0, 2, H); ctx.clearRect(W - 2, 0, 2, H); }
  return out;
}

/* Dashed selection frame drawn on the skin around the selected tattoo. */
export function selectionCanvas(accent = "#e0455f") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const m = 512 * PAD * 0.5;
  g.strokeStyle = accent; g.lineWidth = 5; g.setLineDash([18, 12]);
  g.strokeRect(m, m, 512 - 2 * m, 512 - 2 * m);
  g.setLineDash([]); g.fillStyle = accent;
  for (const [x, y] of [[m, m], [512 - m, m], [m, 512 - m], [512 - m, 512 - m]]) { g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); }
  return c;
}
