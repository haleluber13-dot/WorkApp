/* Selfie → face record: find the face, level the eyes, crop at high
   resolution, colour-correct (white balance, exposure, side-light shadows),
   sample skin and hair colour, and build per-vertex UVs + face-space points. */

import { detectFaces } from "./detect.js";
import { FACE_OVAL, RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW, LIPS } from "./canonical.js";

const TEX_MAX = 1024;   // final texture
const WORK_MAX = 1536;  // analysis crop
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// sRGB <-> linear lookup
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const L2S = (v) => { v = clamp(v, 0, 1); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
const hex = (r, g, b) => "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
export function hexToRgb(h) { const n = parseInt(String(h || "#000000").slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
const P = (pts, i) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];

/* ------------------------------------------------------------------ finding faces */

/** Faces on the photo, largest first. Looks closer (tiles) when nothing is found at full size. */
export async function findFaces(src, { onStatus } = {}) {
  let faces = await detectFaces(src);
  if (faces.length) return { faces, zoomed: false };
  onStatus?.("Looking closer…");
  for (const n of [2, 3]) {
    const found = [];
    const tw = src.width / (n - (n - 1) * 0.3), th = src.height / (n - (n - 1) * 0.3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = Math.round(i * tw * 0.7), y0 = Math.round(j * th * 0.7);
      const w = Math.min(Math.round(tw), src.width - x0), h = Math.min(Math.round(th), src.height - y0);
      const k = Math.min(3, 1024 / Math.max(w, h));
      const c = canvas(Math.round(w * k), Math.round(h * k));
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
      for (const f of await detectFaces(c)) {
        for (let q = 0; q < f.pts.length; q += 3) { f.pts[q] = f.pts[q] / k + x0; f.pts[q + 1] = f.pts[q + 1] / k + y0; f.pts[q + 2] /= k; }
        f.box = { x0: f.box.x0 / k + x0, y0: f.box.y0 / k + y0, x1: f.box.x1 / k + x0, y1: f.box.y1 / k + y0 };
        f.size /= k;
        found.push(f);
      }
    }
    // merge duplicates from overlapping tiles (keep the one most inside its tile = largest)
    found.sort((a, b) => b.size - a.size);
    const out = [];
    for (const f of found) {
      const [nx, ny] = P(f.pts, 1);
      if (!out.some((o) => { const [ox, oy] = P(o.pts, 1); return Math.hypot(nx - ox, ny - oy) < 0.35 * Math.max(o.size, f.size); })) out.push(f);
    }
    if (out.length) return { faces: out, zoomed: true };
  }
  return { faces: [], zoomed: true };
}

/** Quick pose / quality checks on a detected face (in photo pixels). */
export function checkFace(f, src) {
  const warnings = [];
  const eyeR = P(f.pts, 468), eyeL = P(f.pts, 473);
  const roll = Math.atan2(eyeL[1] - eyeR[1], eyeL[0] - eyeR[0]);
  const ipd = Math.hypot(eyeL[0] - eyeR[0], eyeL[1] - eyeR[1]);
  // yaw: nose tip relative to the face sides
  const a = P(f.pts, 234), b = P(f.pts, 454), nose = P(f.pts, 1);
  const cx = Math.cos(-roll), sx = Math.sin(-roll);
  const rx = (p) => p[0] * cx - p[1] * sx;
  const yaw = (rx(nose) - (rx(a) + rx(b)) / 2) / Math.max(1, Math.abs(rx(b) - rx(a)) / 2);
  // pitch: nose tip height between the eyes and the chin
  const ry = (p) => p[0] * sx + p[1] * cx;
  const eyeY = (ry(eyeR) + ry(eyeL)) / 2, chinY = ry(P(f.pts, 152));
  const pitch = (ry(nose) - eyeY) / Math.max(1, chinY - eyeY);
  if (ipd < 24) return { ok: false, tooSmall: true, roll, yaw, pitch, ipd, warnings: ["Your face is too small in this photo. Take a selfie closer to the camera, so your face fills most of the picture."] };
  if (ipd < 55) warnings.push("Your face is quite small in this photo — a closer selfie gives a sharper result.");
  if (Math.abs(yaw) > 0.28) warnings.push("Your head is turned to the side. For the best result look straight at the camera.");
  if (pitch < 0.28 || pitch > 0.62) warnings.push(pitch < 0.28 ? "Your head is tilted back — keep it level with the camera." : "Your head is tilted down — keep it level with the camera.");
  if (Math.abs(roll) > (4 * Math.PI) / 180) warnings.push(`Your head was tilted ${Math.round(Math.abs(roll) * 180 / Math.PI)}° — we straightened it.`);
  // over/under exposure of the face box
  try {
    const g = src.getContext("2d", { willReadFrequently: true });
    const bx = Math.max(0, Math.round(f.box.x0)), by = Math.max(0, Math.round(f.box.y0));
    const bw = Math.max(1, Math.min(src.width - bx, Math.round(f.box.x1 - f.box.x0))), bh = Math.max(1, Math.min(src.height - by, Math.round(f.box.y1 - f.box.y0)));
    const d = g.getImageData(bx, by, bw, bh).data;
    let s = 0, n = 0, clip = 0;
    for (let i = 0; i < d.length; i += 16) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += l; n++; if (l > 250) clip++; }
    if (s / n < 45) warnings.push("The photo is quite dark. Even, bright light (facing a window) works best.");
    else if (clip / n > 0.12) warnings.push("Parts of your face are washed out by bright light. Softer light works better.");
  } catch { /* tainted canvas: skip */ }
  return { ok: true, roll, yaw, pitch, ipd, warnings };
}

/* ------------------------------------------------------------------ masks */

function polyMask(w, h, polys, { blur = 0, scale = 1, cx = 0, cy = 0 } = {}) {
  const c = canvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  if (blur) g.filter = `blur(${blur}px)`;
  g.fillStyle = "#fff";
  for (const pts of polys) {
    g.beginPath();
    pts.forEach(([x, y], i) => { x = cx + (x - cx) * scale; y = cy + (y - cy) * scale; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fill();
  }
  const d = g.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}

/* separable box-ish gaussian (3 box passes) on a small float grid with weights */
function blurGrid(v, w, h, r) {
  const tmp = new Float32Array(v.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += v[y * w + xx]; n++; } }
      tmp[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
      v[y * w + x] = s / n;
    }
  }
  return v;
}

function sampleGrid(v, gw, gh, fx, fy) {
  fx = clamp(fx, 0, gw - 1.001); fy = clamp(fy, 0, gh - 1.001);
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
  const a = v[y0 * gw + x0], b = v[y0 * gw + x0 + 1], c = v[(y0 + 1) * gw + x0], d = v[(y0 + 1) * gw + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function median(arr) { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[s.length >> 1]; }
function pct(arr, p) { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

/* ------------------------------------------------------------------ the face record */

/**
 * Build the face record from the photo and one detected face.
 * Returns { face, crop (corrected texture canvas), lm (crop landmarks), hairAuto, info }.
 */
export async function buildFace(src, det, { onStatus } = {}) {
  const t0 = performance.now();
  const pts0 = det.pts;
  const eyeR = P(pts0, 468), eyeL = P(pts0, 473);
  const roll = Math.atan2(eyeL[1] - eyeR[1], eyeL[0] - eyeR[0]);
  const top = P(pts0, 10), chin = P(pts0, 152);
  const faceH = Math.hypot(chin[0] - top[0], chin[1] - top[1]);
  // crop: square around the face with room for the hair, eyes level
  const cx = (top[0] + chin[0]) / 2, cy = (top[1] + chin[1]) / 2 - faceH * 0.06;
  const side = faceH * 1.75;
  const R = Math.round(clamp(side * 1.1, 640, WORK_MAX));
  const k = R / side;
  const crop = canvas(R, R);
  const g = crop.getContext("2d", { willReadFrequently: true });
  // edge colour under the photo (photo edges), then the rotated photo
  g.fillStyle = "#808080"; g.fillRect(0, 0, R, R);
  g.imageSmoothingQuality = "high";
  g.save();
  g.translate(R / 2, R / 2); g.rotate(-roll); g.scale(k, k); g.translate(-cx, -cy);
  g.drawImage(src, 0, 0);
  g.restore();
  const toCrop = (x, y, z) => {
    const dx = x - cx, dy = y - cy, c = Math.cos(-roll), s = Math.sin(-roll);
    return [R / 2 + (dx * c - dy * s) * k, R / 2 + (dx * s + dy * c) * k, z * k];
  };
  // re-detect on the levelled, enlarged crop for precise landmarks
  onStatus?.("Mapping your face…");
  let lm = null;
  try {
    const again = await detectFaces(crop);
    const near = again.find((f) => { const n = P(f.pts, 1), e = toCrop(...P(pts0, 1)); return Math.hypot(n[0] - e[0], n[1] - e[1]) < R * 0.12; });
    if (near) lm = near.pts;
  } catch { /* use the first pass */ }
  if (!lm) {
    lm = new Float32Array(pts0.length);
    for (let i = 0; i < pts0.length; i += 3) { const q = toCrop(pts0[i], pts0[i + 1], pts0[i + 2]); lm[i] = q[0]; lm[i + 1] = q[1]; lm[i + 2] = q[2]; }
  }
  const L = (i) => [lm[i * 3], lm[i * 3 + 1]];

  // ---------------------------------------------------------------- masks
  const ovalPoly = FACE_OVAL.map(L);
  const feat = [RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW, LIPS].map((ids) => ids.map(L));
  const ovalM = polyMask(R, R, [ovalPoly]);
  const featM = polyMask(R, R, feat, { blur: R / 120 });
  // centre of the face and its size in crop px
  const eR = L(468), eL = L(473);
  const ec = [(eR[0] + eL[0]) / 2, (eR[1] + eL[1]) / 2];
  const ipd = Math.hypot(eL[0] - eR[0], eL[1] - eR[1]);
  const midX = [168, 6, 1, 152, 10].reduce((s, i) => s + L(i)[0], 0) / 5;

  const img = g.getImageData(0, 0, R, R);
  const d = img.data;
  const N = R * R;
  const lin = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { lin[i * 3] = S2L[d[i * 4]]; lin[i * 3 + 1] = S2L[d[i * 4 + 1]]; lin[i * 3 + 2] = S2L[d[i * 4 + 2]]; }
  const skinW = new Float32Array(N);
  for (let i = 0; i < N; i++) skinW[i] = ovalM[i] * (1 - featM[i]);

  // ---------------------------------------------------------------- white balance
  // reference 1: the whites of the eyes (outside the iris), brightest third
  const gains = [1, 1, 1];
  {
    const eyesM = polyMask(R, R, [RIGHT_EYE.map(L), LEFT_EYE.map(L)]);
    const irisR = Math.max(2, (Math.hypot(...[0, 1].map((j) => lm[469 * 3 + j] - lm[468 * 3 + j])) + Math.hypot(...[0, 1].map((j) => lm[474 * 3 + j] - lm[473 * 3 + j]))) / 2) * 1.15;
    const cand = [];
    const y0 = Math.max(0, Math.floor(Math.min(eR[1], eL[1]) - ipd * 0.3)), y1 = Math.min(R, Math.ceil(Math.max(eR[1], eL[1]) + ipd * 0.3));
    for (let y = y0; y < y1; y++) for (let x = 0; x < R; x++) {
      const i = y * R + x;
      if (eyesM[i] < 0.9) continue;
      if (Math.hypot(x - eR[0], y - eR[1]) < irisR || Math.hypot(x - eL[0], y - eL[1]) < irisR) continue;
      cand.push(i);
    }
    if (cand.length > 30) {
      const lum = cand.map((i) => lin[i * 3] * 0.2126 + lin[i * 3 + 1] * 0.7152 + lin[i * 3 + 2] * 0.0722);
      const thr = pct(lum, 0.66);
      let r = 0, gg = 0, b = 0, n = 0;
      cand.forEach((i, j) => { if (lum[j] >= thr) { r += lin[i * 3]; gg += lin[i * 3 + 1]; b += lin[i * 3 + 2]; n++; } });
      if (n && gg > 0) {
        const m = (r + gg + b) / 3;
        // sclera is slightly warm in reality: aim for a faintly warm white, half strength
        const tgt = [m * 1.04, m, m * 0.94];
        // only trust clearly bright eye whites (not shadowed, not skin-tinted)
        const sk = median(Array.from({ length: Math.min(4000, N) }, (_, j) => { const i = ((j * 7919) % N); return skinW[i] > 0.9 ? lin[i * 3 + 1] : NaN; }).filter((v) => v === v));
        if (gg / n > sk * 1.25) for (const [c, v] of [[0, r], [1, gg], [2, b]]) gains[c] *= Math.pow(clamp(tgt[c] / Math.max(1e-4, v), 0.8, 1.25), 0.35);
      }
    }
    // reference 2: gray world over the whole photo, weak
    try {
      const sg = canvas(64, 64).getContext("2d", { willReadFrequently: true });
      sg.drawImage(src, 0, 0, 64, 64);
      const sd = sg.getImageData(0, 0, 64, 64).data;
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < sd.length; i += 4) { r += S2L[sd[i]]; gg += S2L[sd[i + 1]]; b += S2L[sd[i + 2]]; }
      const m = (r + gg + b) / 3;
      if (m > 0) for (const [c, v] of [[0, r], [1, gg], [2, b]]) gains[c] *= Math.pow(clamp(m / Math.max(1e-4, v), 0.8, 1.25), 0.2);
    } catch { /* ignore */ }
    const gm = (gains[0] + gains[1] + gains[2]) / 3;
    for (let c = 0; c < 3; c++) gains[c] = clamp(gains[c] / gm, 0.94, 1.06);
  }

  // ---------------------------------------------------------------- illumination field (for exposure + shadows)
  const G = 48, cell = R / G;
  const gl = new Float32Array(G * G), gw = new Float32Array(G * G);
  for (let y = 0; y < R; y++) {
    const gy = Math.min(G - 1, (y / cell) | 0);
    for (let x = 0; x < R; x++) {
      const i = y * R + x, w = skinW[i];
      if (w <= 0.01) continue;
      const l = (lin[i * 3] * gains[0]) * 0.2126 + (lin[i * 3 + 1] * gains[1]) * 0.7152 + (lin[i * 3 + 2] * gains[2]) * 0.0722;
      const gi = gy * G + Math.min(G - 1, (x / cell) | 0);
      gl[gi] += Math.log(Math.max(1e-4, l)) * w; gw[gi] += w;
    }
  }
  const gwB = blurGrid(Float32Array.from(gw), G, G, 2);
  const glB = blurGrid(Float32Array.from(gl), G, G, 2);
  const field = new Float32Array(G * G); // log luminance, normalized convolution
  let meanLog = 0, wsum = 0;
  for (let i = 0; i < G * G; i++) { if (gw[i] > 0) { meanLog += gl[i]; wsum += gw[i]; } }
  meanLog /= Math.max(1e-6, wsum);
  for (let i = 0; i < G * G; i++) field[i] = gwB[i] > 1e-3 ? glB[i] / gwB[i] : meanLog;
  // symmetric target: average with the mirror image across the face midline, pulled toward the mean
  const target = new Float32Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const px = (gx + 0.5) * cell, mx = 2 * midX - px;
    const mir = sampleGrid(field, G, G, mx / cell - 0.5, gy);
    const here = field[gy * G + gx];
    const sym = (here + mir) / 2;
    // pull toward the mean: some everywhere, more toward the silhouette (the 3D light shades the sides)
    const py = (gy + 0.5) * cell;
    const rr = Math.hypot((px - ec[0]) / (1.15 * ipd), (py - ec[1] - 0.45 * ipd) / (1.55 * ipd));
    const pull = 0.3 + 0.38 * sstep(0.45, 1.0, rr);
    target[gy * G + gx] = lerp(sym, meanLog, pull) - here; // log ratio
  }

  // exposure: bring the bright skin to a sane level (only fixes clearly bad exposure)
  const skinLum = [];
  for (let i = 0; i < N; i += 7) if (skinW[i] > 0.9) skinLum.push(lin[i * 3] * 0.2126 + lin[i * 3 + 1] * 0.7152 + lin[i * 3 + 2] * 0.0722);
  const p95 = pct(skinLum, 0.95) || 0.5;
  let expo = 1;
  if (p95 > 0.82) expo = Math.max(0.8, 0.82 / p95);
  else if (p95 < 0.22) expo = Math.min(1.45, 0.24 / Math.max(0.01, p95));

  const skinRef = (() => {
    const a = [[], [], []];
    for (let i = 0; i < N; i += 5) if (skinW[i] > 0.95) for (let c = 0; c < 3; c++) a[c].push(lin[i * 3 + c] * gains[c]);
    return a.map(median);
  })();
  // apply: gains + exposure everywhere, shadow equalization inside the (blurred) oval
  const ovalSoft = polyMask(R, R, [ovalPoly], { blur: ipd * 0.25, scale: 1.05, cx: ec[0], cy: ec[1] + ipd * 0.4 });
  const SHADOW = 0.7;
  for (let y = 0; y < R; y++) {
    const fy = y / cell - 0.5;
    for (let x = 0; x < R; x++) {
      const i = y * R + x;
      let m = expo;
      const o = ovalSoft[i];
      let r = lin[i * 3] * gains[0], gr = lin[i * 3 + 1] * gains[1], b = lin[i * 3 + 2] * gains[2];
      if (o > 0.002) {
        m *= Math.exp(clamp(sampleGrid(target, G, G, x / cell - 0.5, fy), -0.45, 0.55) * SHADOW * o);
        // tame specular highlights: compress luminance well above the local skin level, restore skin chroma
        const loc = Math.exp(sampleGrid(field, G, G, x / cell - 0.5, fy));
        const l = r * 0.2126 + gr * 0.7152 + b * 0.0722;
        const ratio = l / Math.max(1e-4, loc);
        if (ratio > 1.15) {
          const nl = loc * (1.15 + (ratio - 1.15) * 0.3);
          const k2 = nl / l, t = clamp((ratio - 1.15) / 0.8, 0, 1) * o * (1 - featM[i] * 0.7);
          // toward the skin colour at the new luminance
          const sl = skinRef[0] * 0.2126 + skinRef[1] * 0.7152 + skinRef[2] * 0.0722 || 1;
          r = lerp(r, lerp(r * k2, skinRef[0] * nl / sl, 0.5), t);
          gr = lerp(gr, lerp(gr * k2, skinRef[1] * nl / sl, 0.5), t);
          b = lerp(b, lerp(b * k2, skinRef[2] * nl / sl, 0.5), t);
        }
      }
      lin[i * 3] = r * m; lin[i * 3 + 1] = gr * m; lin[i * 3 + 2] = b * m;
    }
  }

  // ---------------------------------------------------------------- skin tone
  // trimmed median over the inner skin (cheeks, forehead, chin; no eyes/brows/lips, not the silhouette)
  const inner = polyMask(R, R, [ovalPoly], { scale: 0.8, cx: ec[0], cy: ec[1] + ipd * 0.35 });
  const sr = [], sgc = [], sb = [];
  for (let i = 0; i < N; i += 3) {
    if (inner[i] < 0.99 || featM[i] > 0.02) continue;
    sr.push(lin[i * 3]); sgc.push(lin[i * 3 + 1]); sb.push(lin[i * 3 + 2]);
  }
  let skinLin = [median(sr), median(sgc), median(sb)];
  {
    const lum = sr.map((r, j) => r * 0.2126 + sgc[j] * 0.7152 + sb[j] * 0.0722);
    const lo = pct(lum, 0.25), hi = pct(lum, 0.75);
    const keep = lum.map((l) => l >= lo && l <= hi);
    const f = (a) => median(a.filter((_, j) => keep[j]));
    if (keep.some(Boolean)) skinLin = [f(sr), f(sgc), f(sb)];
  }
  const skinRGB = skinLin.map(L2S);
  const skinTone = hex(...skinRGB);

  // ---------------------------------------------------------------- hair colour (band above / beside the face)
  const hairInfo = sampleHair(lin, R, lm, ec, ipd, skinLin);
  if (typeof window !== "undefined" && window.__faceDebug) window.__dbgCrop = crop.toDataURL("image/jpeg", 0.8);

  // ---------------------------------------------------------------- texture: photo inside the oval, skin outside
  // colour blends toward the skin tone over the outer ~12% of the oval (hides background at the silhouette)
  const ovalIn = polyMask(R, R, [ovalPoly], { blur: ipd * 0.16, scale: 0.94, cx: ec[0], cy: ec[1] + ipd * 0.35 });
  const out = g.createImageData(R, R), od = out.data;
  for (let i = 0; i < N; i++) {
    const t = sstep(0.02, 0.98, ovalIn[i]);
    for (let c = 0; c < 3; c++) od[i * 4 + c] = L2S(lerp(skinLin[c], lin[i * 3 + c], t));
    od[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  // final texture: a tight square around the oval (most of the pixels on the face)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of ovalPoly) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  const tSide = Math.max(bx1 - bx0, by1 - by0) * 1.1;
  const tx0 = (bx0 + bx1) / 2 - tSide / 2, ty0 = (by0 + by1) / 2 - tSide / 2;
  const T = Math.round(clamp(tSide, 256, TEX_MAX));
  const tex = canvas(T, T);
  const tg = tex.getContext("2d");
  tg.fillStyle = skinTone; tg.fillRect(0, 0, T, T);
  tg.imageSmoothingQuality = "high";
  tg.drawImage(crop, tx0, ty0, tSide, tSide, 0, 0, T, T);

  // ---------------------------------------------------------------- geometry
  const iz = (lm[468 * 3 + 2] + lm[473 * 3 + 2]) / 2;
  const points = new Array(468 * 3), uv = new Array(468 * 2);
  for (let i = 0; i < 468; i++) {
    const x = lm[i * 3], y = lm[i * 3 + 1], z = lm[i * 3 + 2];
    points[i * 3] = +((x - ec[0]) / ipd).toFixed(5);
    points[i * 3 + 1] = +(-(y - ec[1]) / ipd).toFixed(5);
    points[i * 3 + 2] = +(-(z - iz) / ipd).toFixed(5);
    uv[i * 2] = +((x - tx0) / tSide).toFixed(5);
    uv[i * 2 + 1] = +(1 - (y - ty0) / tSide).toFixed(5);
  }
  const { TRIANGLES } = await import("./canonical.js");
  const face = {
    version: 1,
    image: tex.toDataURL("image/jpeg", 0.9),
    uv, points,
    indices: Array.from(TRIANGLES),
    oval: FACE_OVAL.slice(),
    skinTone,
    hairColor: hairInfo.color,
    hair: hairInfo.style,
    hairline: hairInfo.hairline,   // extra (optional): hairline height above the eyes, face units
  };
  return {
    face, crop: tex, work: crop, lm, hairAuto: hairInfo,
    info: { ms: Math.round(performance.now() - t0), R, T, ipd: Math.round(ipd), gains: gains.map((v) => +v.toFixed(3)), expo: +expo.toFixed(3) },
  };
}

/* hair: scan up from the middle of the forehead for where skin stops (the
   hairline) and sample the hair colour there; look beside the cheeks for longer hair. */
function sampleHair(lin, R, lm, ec, ipd, skinLin) {
  const L = (i) => [lm[i * 3], lm[i * 3 + 1]];
  const feat = (r, g, b) => { const l = r * 0.2126 + g * 0.7152 + b * 0.0722, s = r + g + b + 1e-5; return [Math.log(l + 0.004), r / s, g / s]; };
  const px = (x, y) => { const i = Math.round(y) * R + Math.round(x); return [lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]]; };
  const inb = (x, y) => x >= 0 && y >= 0 && x < R - 0.5 && y < R - 0.5;
  const toFace = (y) => +(-(y - ec[1]) / ipd).toFixed(3);
  const [fx] = L(151);
  // skin model from the forehead (between the brows and mid-forehead)
  const fore = [];
  for (let y = L(9)[1]; y > L(151)[1]; y -= 2) for (let dx = -0.35; dx <= 0.35; dx += 0.05) { const x = fx + dx * ipd; if (inb(x, y)) fore.push(feat(...px(x, y))); }
  const mean = [0, 1, 2].map((c) => fore.reduce((s, f) => s + f[c], 0) / Math.max(1, fore.length));
  const sd = [0, 1, 2].map((c) => Math.sqrt(fore.reduce((s, f) => s + (f[c] - mean[c]) ** 2, 0) / Math.max(1, fore.length)));
  sd[0] = Math.max(sd[0], 0.12); sd[1] = Math.max(sd[1], 0.012); sd[2] = Math.max(sd[2], 0.008);
  const isSkin = (p) => {
    const f = feat(...p);
    const zl = (f[0] - mean[0]) / sd[0];
    const zc = Math.hypot((f[1] - mean[1]) / sd[1], (f[2] - mean[2]) / sd[2]);
    if (zl > 0 && zl < 3 && zc < 3.5) return true;   // brighter than the forehead: highlight on skin
    return zl > -3.2 && zc < 4;
  };
  const cheek = feat(...skinLin);
  const bangs = mean[0] - cheek[0] < -0.8;
  if (typeof window !== "undefined") window.__hairDbg = { mean, sd, cheek };

  let hairY = null;
  const rows = [];
  if (bangs) hairY = L(151)[1];
  else {
    const top10 = L(10)[1];
    for (let y = L(151)[1]; y > Math.max(1, top10 - ipd * 0.8); y -= Math.max(1, ipd * 0.02)) {
      let n = 0, ns = 0;
      for (let dx = -0.45; dx <= 0.45; dx += 0.05) {
        const x = fx + dx * ipd;
        if (!inb(x, y)) continue;
        n++; if (!isSkin(px(x, y))) ns++;
      }
      rows.push({ y, f: n ? ns / n : 0 });
    }
    for (let i = 0; i < rows.length - 3; i++) if (rows[i].f > 0.55 && rows[i + 1].f > 0.55 && rows[i + 2].f > 0.5) { hairY = rows[i].y; break; }
  }
  if (typeof window !== "undefined") window.__hairRows = rows.map((r) => [toFace(r.y), +r.f.toFixed(2)]);
  if (hairY === null) return { color: null, style: "none", hairline: null, bangs };
  // colour: non-skin pixels above the hairline; a slightly bright percentile (the 3D light adds its own shading)
  const samp = [];
  for (let y = hairY - ipd * 0.08; y > hairY - ipd * 0.6; y -= 2) for (let dx = -0.4; dx <= 0.4; dx += 0.04) {
    const x = fx + dx * ipd;
    if (!inb(x, y)) continue;
    const p = px(x, y);
    if (!isSkin(p)) samp.push(p);
  }
  if (samp.length < 10) return { color: null, style: "none", hairline: null, bangs };
  let col = [0, 1, 2].map((c) => median(samp.map((p) => p[c])));
  const near = samp.filter((p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) < Math.max(0.03, (col[0] + col[1] + col[2]) * 0.5));
  const use = near.length > 8 ? near : samp;
  const lum = use.map((p) => p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722);
  const lo = pct(lum, 0.55), hi = pct(lum, 0.9);
  const band = use.filter((_, j) => lum[j] >= lo && lum[j] <= hi);
  col = [0, 1, 2].map((c) => median((band.length ? band : use).map((p) => p[c])));
  const hairDist = (p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) / Math.max(0.03, (col[0] + col[1] + col[2]) / 3);
  // length: hair-coloured pixels beside the cheeks (outside the face, between the eyes and the mouth)
  let sideN = 0, sideH = 0;
  for (const id of [234, 93, 132, 454, 323, 361]) {
    const [ox, oy] = L(id);
    const dir = Math.sign(ox - ec[0]);
    for (let t = 0.12; t <= 0.4; t += 0.04) {
      const x = ox + dir * t * ipd;
      if (!inb(x, oy)) continue;
      sideN++;
      const p = px(x, oy);
      if (!isSkin(p) && hairDist(p) < 1.0) sideH++;
    }
  }
  const sideHair = sideN ? sideH / sideN : 0;
  return { color: hex(...col.map(L2S)), style: sideHair > 0.18 ? "medium" : "short", hairline: toFace(hairY), sideHair, bangs };
}

/** Draw the landmark mesh of a detected face over a photo (for confirmation). */
export function drawMesh(g, pts, triangles, { color = "rgba(255,255,255,0.55)", width = 1 } = {}) {
  g.save();
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round";
  g.beginPath();
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    g.moveTo(pts[a], pts[a + 1]); g.lineTo(pts[b], pts[b + 1]); g.lineTo(pts[c], pts[c + 1]); g.closePath();
  }
  g.stroke();
  g.restore();
}
