// Body scan — person cut-out and silhouette analysis.
//
//   segmentPerson(job)            plain-wall background model + person prior → GrabCut → soft mask
//   analyzeFront(mask, w, h)      landmarks (fractions of height), validation issues
//   analyzeSide(mask, w, h)       outline info for the profile photo
//   photoMeasures(front, side, lm) widths/depths at the landmark heights (fractions of height)
//
// Masks are Uint8Array 0..255 (soft edges); heights are fractions of the
// person's pixel height measured from the soles (0) to the head top (1).
// Worker-safe: no DOM.
import { grabCut, cleanLabels, guidedUpsample, subjectTrimap, T_BG, T_FG, T_PR_BG, T_PR_FG } from "../photo/segment.js";
import { components } from "../photo/util.js";

export const SEG_SIZE = 360;   // GrabCut working size (long side, px)
export const MASK_SIZE = 1100; // measuring mask (long side, px)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ colour
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const fxyz = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = fxyz((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = fxyz(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = fxyz((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const lin = [X * 3.2406 - Y * 1.5372 - Z * 0.4986, -X * 0.9689 + Y * 1.8758 + Z * 0.0415, X * 0.0557 - Y * 0.204 + Z * 1.057];
  return lin.map((c) => { c = Math.max(0, c); const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return clamp(Math.round(s * 255), 0, 255); });
}

function median(arr) {
  const a = Float32Array.from(arr).sort();
  return a.length ? a[a.length >> 1] : 0;
}

// ------------------------------------------------------------------ segmentation

/**
 * Per-pixel colour distance to a smooth background model estimated from the
 * left/right image borders (plain wall + floor; light falloff in x and y).
 */
export function backgroundDistance(rgba, w, h) {
  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [L, a, b] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = a; lab[i * 3 + 2] = b;
  }
  const bw = Math.max(3, Math.round(w * 0.06));
  // per-row medians of the border bands: Lab + linear RGB, then vertical median smoothing
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { lin[i * 3] = LIN[rgba[i * 4]]; lin[i * 3 + 1] = LIN[rgba[i * 4 + 1]]; lin[i * 3 + 2] = LIN[rgba[i * 4 + 2]]; }
  const side = (x0, x1) => {
    const out = new Float32Array(h * 6);
    const tmp = [[], [], [], [], [], []];
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 6; c++) tmp[c].length = 0;
      for (let x = x0; x < x1; x++) { const i = (y * w + x) * 3; for (let c = 0; c < 3; c++) { tmp[c].push(lab[i + c]); tmp[c + 3].push(lin[i + c]); } }
      for (let c = 0; c < 6; c++) out[y * 6 + c] = median(tmp[c]);
    }
    const sm = new Float32Array(h * 6), r = Math.max(2, Math.round(h * 0.012));
    for (let y = 0; y < h; y++) for (let c = 0; c < 6; c++) {
      const v = [];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v.push(out[k * 6 + c]);
      sm[y * 6 + c] = median(v);
    }
    return sm;
  };
  const left = side(0, bw), right = side(w - bw, w);
  // lens vignetting / a light in front makes the middle of the wall brighter
  // than its borders: a horizontal lightness profile from the rows above the
  // head and below the feet (bands at the very top and bottom of the photo)
  const band = Math.max(2, Math.round(h * 0.04));
  const profile = (y0, y1) => {
    const out = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1), v = [];
      for (let y = y0; y < y1; y++) v.push(lab[(y * w + x) * 3] - (left[y * 6] * (1 - t) + right[y * 6] * t));
      out[x] = clamp(median(v), -15, 15);
    }
    // heavy smoothing (a head or a foot in the band must not show up)
    const sm = new Float32Array(w), r = Math.max(3, Math.round(w * 0.12));
    for (let x = 0; x < w; x++) { const v = []; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k += 2) v.push(out[k]); sm[x] = median(v); }
    return sm;
  };
  const pTop = profile(0, band), pBot = profile(h - band, h);
  const Yof = (L) => { const f = (L + 16) / 116; return f > 0.2069 ? f * f * f : (L / 903.3); };
  const dist = new Float32Array(n);
  const shadow = new Uint8Array(n); // 1 = maybe a shadow on the wall/floor, 2 = surely
  const WL = 0.3; // shadows and light falloff change lightness more than colour
  for (let y = 0; y < h; y++) {
    const o = y * 6, ty = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1), i = y * w + x;
      const bg = (c) => left[o + c] * (1 - t) + right[o + c] * t;
      const Lb = bg(0) + pTop[x] * (1 - ty) + pBot[x] * ty;
      const dL = lab[i * 3] - Lb, da = lab[i * 3 + 1] - bg(1), db = lab[i * 3 + 2] - bg(2);
      dist[i] = Math.sqrt(WL * dL * dL + da * da + db * db);
      // a cast shadow keeps (roughly) the wall's chromaticity and is darker, but not black
      if (dL < -3) {
        const k = Yof(lab[i * 3]) / Math.max(1e-4, Yof(Lb));
        if (k > 0.2 && k < 0.92) {
          const R = lin[i * 3], G = lin[i * 3 + 1], B = lin[i * 3 + 2], Rb = bg(3), Gb = bg(4), Bb = bg(5);
          const s1 = R + G + B + 1e-4, s2 = Rb + Gb + Bb + 1e-4;
          const dc = Math.abs(R / s1 - Rb / s2) + Math.abs(G / s1 - Gb / s2) + Math.abs(B / s1 - Bb / s2);
          if (dc < 0.055 && k > 0.27) shadow[i] = 2;
          else if (dc < 0.085) shadow[i] = 1;
        }
      }
    }
  }
  // noise level from the border bands
  const bd = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x++) if (x < bw || x >= w - bw) bd.push(dist[y * w + x]);
  const m = median(bd);
  const mad = median(bd.map((v) => Math.abs(v - m))) * 1.4826;
  const thr = clamp(m + 5 * mad + 3, 6, 28);
  return { dist, thr, noise: m + mad, lab, shadow };
}

/**
 * job = { rgba, w, h (small, ≤ SEG_SIZE), guide?: {rgba, w, h} (measuring size),
 *         rect?: {x0,y0,x1,y1} in 0..1 (person box drawn by the user) }
 * → { mask (guide size if given, else small), w, h, plain, ms }
 */
export function segmentPerson(job) {
  const t0 = Date.now();
  const { rgba, w, h } = job;
  const n = w * h;
  const { dist, thr, noise, shadow } = backgroundDistance(rgba, w, h);
  const rect = job.rect ? {
    x0: Math.floor(job.rect.x0 * w), y0: Math.floor(job.rect.y0 * h),
    x1: Math.ceil(job.rect.x1 * w), y1: Math.ceil(job.rect.y1 * h),
  } : null;
  const inRect = (x, y) => !rect || (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1);
  let fg0 = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; fg0[i] = dist[i] > thr && !shadow[i] && inRect(x, y) ? 1 : 0; }
  fg0 = cleanLabels(fg0, w, h, { rel: 0.2, holeFrac: 0.004 });
  let cnt = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fg0[y * w + x]) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const frac = cnt / n;
  // plain background? (a busy room makes most of the picture "different")
  let plain = noise < 14 && frac > 0.02 && frac < 0.55 && !(x0 <= 1 && x1 >= w - 2);
  let trimap = new Uint8Array(n);
  if (plain) {
    const px = Math.round((x1 - x0) * 0.08) + 2, py = Math.round((y1 - y0) * 0.04) + 2;
    const bx0 = Math.max(0, x0 - px), bx1 = Math.min(w - 1, x1 + px), by0 = Math.max(0, y0 - py), by1 = Math.min(h - 1, y1 + py);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, d = dist[i];
      if (x < bx0 || x > bx1 || y < by0 || y > by1 || !inRect(x, y)) trimap[i] = T_BG;
      else if (d < thr * 0.45 || shadow[i] === 2) trimap[i] = T_BG;
      else if (shadow[i]) trimap[i] = T_PR_BG;
      else if (d > thr * 2.4 && fg0[i]) trimap[i] = T_FG;
      else trimap[i] = d > thr ? T_PR_FG : T_PR_BG;
    }
  } else {
    // busy background: saliency + a person-shaped prior box (centre, tall)
    trimap = subjectTrimap(rgba, w, h).trimap;
    const bx0 = rect ? rect.x0 : Math.round(w * 0.12), bx1 = rect ? rect.x1 : Math.round(w * 0.88);
    const by0 = rect ? rect.y0 : Math.round(h * 0.03), by1 = rect ? rect.y1 : Math.round(h * 0.98);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < bx0 || x > bx1 || y < by0 || y > by1) trimap[i] = T_BG;
      else if (trimap[i] === T_BG) trimap[i] = T_PR_BG;
    }
  }
  let lab = grabCut(rgba, w, h, trimap, { iters: plain ? 3 : 5 });
  lab = cleanLabels(lab, w, h, { rel: 0.25, holeFrac: 0.003 });
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = lab[i] ? 255 : 0;
  let ow = w, oh = h;
  if (job.guide) {
    mask = guidedUpsample(mask, w, h, job.guide.rgba, job.guide.w, job.guide.h, { bytes: true, sharpen: 1.8 });
    ow = job.guide.w; oh = job.guide.h;
    mask = keepMain(mask, ow, oh);
  }
  return { mask, w: ow, h: oh, plain, thr, ms: Date.now() - t0 };
}

/** Keep the largest blob of a soft mask (other blobs are zeroed). */
export function keepMain(mask, w, h) {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = mask[i] >= 128 ? 1 : 0;
  const cc = components(on, w, h, true);
  let best = 0, bl = 0;
  for (let l = 1; l <= cc.count; l++) if (cc.sizes[l] > best) { best = cc.sizes[l]; bl = l; }
  if (!bl) return mask;
  // dilate the main label by 2 px so its soft edge survives
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) if (cc.labels[i] === bl) keep[i] = 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    let ok = keep[i];
    for (let dy = -2; dy <= 2 && !ok; dy++) for (let dx = -2; dx <= 2 && !ok; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && keep[yy * w + xx]) ok = 1;
    }
    if (ok) out[i] = mask[i];
  }
  return out;
}

// ------------------------------------------------------------------ silhouette geometry

/**
 * Row structure of a soft mask: for each row the runs (≥ 50 %) with sub-pixel
 * edges. Returns a Sil object used by the analysers.
 */
export function silhouette(mask, w, h, cam = null, band = [0.55, 0.75]) {
  const runs = new Array(h);
  let top = -1, bot = -1, xmin = w, xmax = -1;
  for (let y = 0; y < h; y++) {
    const r = [];
    const o = y * w;
    let x = 0;
    while (x < w) {
      if (mask[o + x] >= 128) {
        const a = x > 0 ? mask[o + x - 1] : 0, b = mask[o + x];
        const l = x > 0 ? x - 0.5 + (128 - a) / Math.max(1, b - a) : 0;
        let e = x;
        while (e + 1 < w && mask[o + e + 1] >= 128) e++;
        const c = mask[o + e], d = e + 1 < w ? mask[o + e + 1] : 0;
        const rr = e + 1 < w ? e + 0.5 + (c - 128) / Math.max(1, c - d) : w;
        r.push([l, rr]);
        if (x < xmin) xmin = x;
        if (e > xmax) xmax = e;
        x = e + 1;
      } else x++;
    }
    // ignore 1-px specks
    runs[y] = r.filter((s) => s[1] - s[0] >= 1.2);
    if (runs[y].length) { if (top < 0) top = y; bot = y; }
  }
  if (top < 0) return null;
  // sub-pixel head top / soles from the column profile around the extreme rows
  const colMax = (y) => { let m = 0; const o = y * w; for (let x = 0; x < w; x++) if (mask[o + x] > m) m = mask[o + x]; return m; };
  const a0 = top > 0 ? colMax(top - 1) : 0, a1 = colMax(top);
  const topE = top - 0.5 + (128 - a0) / Math.max(1, a1 - a0);
  const b1 = colMax(bot), b2 = bot + 1 < h ? colMax(bot + 1) : 0;
  const botE = bot + 0.5 + (b1 - 128) / Math.max(1, b1 - b2);
  const S = { w, h, runs, top, bot, topE, botE, pxH: botE - topE, xmin, xmax, rawBotE: botE, persp: null };
  if (cam && cam.f > 0) perspectiveSoles(S, cam);
  // body centre line from the torso rows (widest run per row)
  const ys = [], xs = [];
  for (let hf = band[0]; hf <= band[1]; hf += 0.01) {
    const y = Math.round(rowOf(S, hf));
    const r = runs[y];
    if (!r || !r.length) continue;
    let best = r[0];
    for (const s of r) if (s[1] - s[0] > best[1] - best[0]) best = s;
    ys.push(y); xs.push((best[0] + best[1]) / 2);
  }
  const fit = lineFit(ys, xs);
  S.cx = (y) => fit.a + fit.b * y;
  S.tilt = Math.atan(fit.b) * 180 / Math.PI;
  return S;
}

/**
 * Lens perspective. With the phone held level at height c and distance D:
 *  - a floor point zt in front of the body plane (the toes) shows up lower
 *    than the heels by c·zt/D (in body-plane units) → move the soles up to
 *    the heel contact;
 *  - the round skull top bulges up by r·(1/cos α − 1) (α: view elevation);
 *  - outline points behind the body plane (the shoulder ridge) show up
 *    closer to the camera height: S.persp.toModel(h) undoes that, so the body
 *    model is measured at the matching true height.
 * cam = { f: focal length in mask px, cy: image row of the optical axis, zt: fraction of height }
 */
export function perspectiveSoles(S, cam) {
  const pxH0 = S.rawBotE - S.topE;
  if (pxH0 <= 0) return;
  const camFrac = clamp((S.rawBotE - cam.cy) / pxH0, 0, 1.15); // camera height / person height
  const HD = clamp(pxH0 / cam.f, 0.05, 1.6);                     // person height / distance
  const delta = clamp((cam.zt ?? 0.1) * camFrac * HD, 0, 0.07);
  const bot = S.rawBotE - (delta * pxH0) / (1 + delta);
  const tanA = (1 - camFrac) * HD;
  const bulge = clamp(0.05 * (Math.sqrt(1 + tanA * tanA) - 1), 0, 0.01); // head radius ≈ 5 % of height
  const H1 = bot - S.topE;
  S.topE += (bulge * H1) / (1 + bulge);
  S.botE = bot;
  S.pxH = S.botE - S.topE;
  // depth of the front outline behind the body plane (fraction of height), by height
  const zOf = (h) => (h > 0.72 && h < 0.9 ? -0.012 * Math.min(1, (h - 0.72) / 0.03, (0.9 - h) / 0.03) : 0);
  const toModel = (h) => h - (h - camFrac) * zOf(h) * HD;
  S.persp = { delta, bulge, camFrac, HD, dist: 1 / HD, toModel };
}

function lineFit(ys, xs) {
  const n = ys.length;
  if (n < 2) return { a: xs[0] || 0, b: 0 };
  let my = 0, mx = 0;
  for (let i = 0; i < n; i++) { my += ys[i]; mx += xs[i]; }
  my /= n; mx /= n;
  let sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; }
  const b = syy > 0 ? sxy / syy : 0;
  return { a: mx - b * my, b };
}

/** Row (float, pixel-centre coordinates) of height fraction hf. */
export const rowOf = (S, hf) => S.botE - hf * S.pxH - 0.5;
/** Height fraction of row y. */
export const fracOf = (S, y) => (S.botE - (y + 0.5)) / S.pxH;

function centralRun(S, y) {
  const r = S.runs[y];
  if (!r) return null;
  const c = S.cx(y);
  for (const s of r) if (s[0] <= c && s[1] >= c) return s;
  return null;
}

// interpolate a per-row measure between the two rows around fraction hf
function atFrac(S, hf, f) {
  const yf = rowOf(S, hf);
  const y0 = Math.floor(yf), t = yf - y0;
  const a = y0 >= 0 && y0 < S.h ? f(y0) : null, b = y0 + 1 >= 0 && y0 + 1 < S.h ? f(y0 + 1) : null;
  if (a == null) return b;
  if (b == null) return a;
  return a * (1 - t) + b * t;
}

/** Width (fraction of height) of the run through the body centre. */
export function centerWidthAt(S, hf) {
  return atFrac(S, hf, (y) => { const s = centralRun(S, y); return s ? s[1] - s[0] : 0; }) / S.pxH;
}

/** One leg's width (average of both legs; half the central run if the legs touch). */
export function legWidthAt(S, hf) {
  return atFrac(S, hf, (y) => {
    const s = centralRun(S, y);
    if (s) return (s[1] - s[0]) / 2;
    const c = S.cx(y), r = S.runs[y];
    let L = null, R = null;
    for (const q of r) {
      if (q[1] < c && (!L || q[1] > L[1])) L = q;
      if (q[0] > c && (!R || q[0] < R[0])) R = q;
    }
    const v = [L, R].filter(Boolean).map((q) => q[1] - q[0]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }) / S.pxH;
}

/** Side-view depth: width of the run through the body centre line (or the widest). */
export function depthAt(S, hf) {
  return atFrac(S, hf, (y) => {
    const r = S.runs[y];
    if (!r || !r.length) return 0;
    const s = centralRun(S, y);
    if (s) return s[1] - s[0];
    let best = r[0];
    for (const q of r) if (q[1] - q[0] > best[1] - best[0]) best = q;
    return best[1] - best[0];
  }) / S.pxH;
}

// ------------------------------------------------------------------ front analysis

const LM_ORDER = ["top", "chin", "neck", "shoulder", "armpit", "chest", "waist", "hip", "crotch", "thigh", "knee", "calf", "ankle", "sole"];
export const LANDMARKS = LM_ORDER;

/**
 * Landmarks from the front silhouette.
 * → { S, lm: {top:1, chin, neck, shoulder, armpit, chest, waist, hip, crotch, thigh, knee, calf, ankle, sole:0},
 *     armAngle (deg|null), upperArm (fraction), issues: [codes] }
 */
export function analyzeFront(mask, w, h, cam = null) {
  mask = keepMain(mask, w, h); // a stray blob (or a brush slip) must not become the head top
  const S = silhouette(mask, w, h, cam && { ...cam, zt: 0.105 });
  if (!S) return { S: null, lm: null, issues: ["no-person"] };
  const issues = [];
  if (S.top <= 1) issues.push("cut-head");
  if (S.bot >= h - 2) issues.push("cut-feet");
  if (S.xmin <= 0 || S.xmax >= w - 1) issues.push("touch-edge");
  if (S.pxH < h * 0.4) issues.push("too-small");
  if (Math.abs(S.tilt) > 6) issues.push("tilted");
  const bw = S.xmax - S.xmin + 1;
  if (S.pxH / bw < 0.9 || S.pxH / bw > 7) issues.push("not-person");
  const rowsBetween = (ha, hb) => { // rows from fraction ha down to hb (ha > hb)
    const y0 = Math.max(S.top, Math.round(rowOf(S, ha))), y1 = Math.min(S.bot, Math.round(rowOf(S, hb)));
    const out = []; for (let y = y0; y <= y1; y++) out.push(y); return out;
  };
  const cw = (y) => { const s = centralRun(S, y); return s ? (s[1] - s[0]) / S.pxH : 0; };
  const argBest = (ys, f, better) => { let by = ys[0], bv = f(ys[0]); for (const y of ys) { const v = f(y); if (better(v, bv)) { bv = v; by = y; } } return by; };

  // crotch: walk down the centre line until it leaves the body
  let crotch = null;
  {
    const ys = rowsBetween(0.6, 0.28);
    for (const y of ys) { if (!centralRun(S, y)) { crotch = fracOf(S, y - 0.5); break; } }
    if (crotch == null) { issues.push("legs-together"); crotch = 0.46; }
    else if (crotch < 0.38 || crotch > 0.56) issues.push("legs-together");
  }
  // neck & chin
  const neckY = argBest(rowsBetween(0.9, 0.79), (y) => cw(y) || 9, (a, b) => a < b);
  const neck = fracOf(S, neckY);
  const neckW = cw(neckY);
  const headW = Math.max(...rowsBetween(0.985, neck + 0.02).map(cw));
  let chin = neck + 0.03;
  for (const y of rowsBetween(0.97, neck).reverse()) if (cw(y) > neckW + 0.45 * (headW - neckW)) { chin = fracOf(S, y); break; }

  // armpits: going up from the elbows, where the gap between arm and torso closes
  const armRuns = (y, side) => {
    const s = centralRun(S, y);
    if (!s) return null;
    const r = S.runs[y].filter((q) => (side > 0 ? q[0] > s[1] : q[1] < s[0]));
    if (!r.length) return null;
    return side > 0 ? r.reduce((a, q) => (q[0] > a[0] ? q : a)) : r.reduce((a, q) => (q[1] < a[1] ? q : a));
  };
  const pits = [];
  for (const side of [-1, 1]) {
    let seen = false, pit = null;
    for (const y of rowsBetween(neck - 0.03, 0.6).reverse()) {
      const a = armRuns(y, side);
      if (a) seen = true;
      else if (seen) { pit = fracOf(S, y + 0.5); break; }
    }
    if (pit != null) pits.push({ side, h: pit });
  }
  let armpit;
  if (pits.length) armpit = pits.reduce((a, p) => a + p.h, 0) / pits.length;
  else { armpit = neck - 0.105; issues.push("arms-down"); }
  // shoulders: corner of the outer outline between the neck and the armpit
  const corners = [];
  const yN = Math.round(rowOf(S, neck)), yA = Math.round(rowOf(S, armpit));
  if (yA - yN > 4) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let y = yN; y <= yA; y++) { const s = centralRun(S, y); if (s) pts.push([side > 0 ? s[1] : s[0], y]); }
      if (pts.length < 4) continue;
      const [p0, p1] = [pts[0], pts[pts.length - 1]];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
      let best = -Infinity, by = null;
      for (const p of pts) {
        const d = ((p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx) / L * side; // outward
        if (d > best) { best = d; by = p[1]; }
      }
      if (by != null) corners.push(fracOf(S, by));
    }
  }
  const shoulder = corners.length ? corners.reduce((a, b) => a + b, 0) / corners.length : armpit + 0.06;
  const chest = armpit - 0.03;
  // waist: narrowest torso between hips and chest
  const wTop = chest - 0.05, wBot = Math.max(crotch + 0.1, chest - 0.2);
  const waistY = argBest(rowsBetween(wTop, wBot), (y) => cw(y) || 9, (a, b) => a < b);
  const waist = fracOf(S, waistY);
  // hips: widest below the waist — follow both outline edges and ignore a hand touching the hip
  const hipRows = rowsBetween(waist - 0.03, crotch + 0.005);
  const hipW = trackedWidths(S, waistY, hipRows);
  let hip = waist - 0.08, hipBest = -1;
  for (let i = 0; i < hipRows.length; i++) if (hipW.w[i] > hipBest) { hipBest = hipW.w[i]; hip = fracOf(S, hipRows[i]); }
  if (hipW.merged) issues.push("hands-touch");
  // legs
  const lw = (y) => legWidthAt(S, fracOf(S, y));
  const thigh = crotch - 0.025;
  const knee = fracOf(S, argBest(rowsBetween(Math.min(0.335, crotch - 0.09), 0.245), (y) => lw(y) || 9, (a, b) => a < b));
  const calf = fracOf(S, argBest(rowsBetween(knee - 0.04, 0.13), lw, (a, b) => a > b));
  const ankle = fracOf(S, argBest(rowsBetween(0.1, 0.03), (y) => lw(y) || 9, (a, b) => a < b));

  // arm angle (upper arm axis vs vertical) and upper-arm thickness
  let angles = [], arms = [];
  for (const side of [-1, 1]) {
    const ys = [], xs = [], ws = [];
    for (const y of rowsBetween(armpit - 0.015, armpit - 0.075)) {
      const a = armRuns(y, side);
      if (!a) continue;
      ys.push(y); xs.push((a[0] + a[1]) / 2); ws.push(a[1] - a[0]);
    }
    if (ys.length >= 6) {
      const f = lineFit(ys, xs);
      const ang = Math.atan(Math.abs(f.b)) * 180 / Math.PI;
      angles.push(ang);
      arms.push(median(ws) * Math.cos(ang * Math.PI / 180) / S.pxH);
    }
  }
  const armAngle = angles.length ? angles.reduce((a, b) => a + b, 0) / angles.length : null;
  const upperArm = arms.length ? arms.reduce((a, b) => a + b, 0) / arms.length : null;
  if (armAngle != null && armAngle < 8) issues.push("arms-down");
  const lm = { top: 1, chin, neck, shoulder, armpit, chest, waist, hip, crotch, thigh, knee, calf, ankle, sole: 0 };
  S.upperArm = upperArm;
  return { S, lm: sanitizeLandmarks(lm), armAngle, upperArm, issues: [...new Set(issues)] };
}

// widths along the hip rows from tracked outline edges: an edge that jumps
// outward (a hand or elbow touching the body) keeps its previous position
function trackedWidths(S, startY, rows) {
  let s0 = centralRun(S, startY);
  let L = s0 ? s0[0] : S.cx(startY) - 1, R = s0 ? s0[1] : S.cx(startY) + 1;
  const maxStep = Math.max(1.5, S.pxH * 0.005);
  let merged = false;
  const w = [];
  let lastY = startY;
  for (const y of rows) {
    const s = centralRun(S, y);
    const k = Math.max(1, Math.abs(y - lastY));
    lastY = y;
    if (s) {
      if (L - s[0] <= maxStep * k) L = s[0]; else merged = true;
      if (s[1] - R <= maxStep * k) R = s[1]; else merged = true;
    }
    w.push((R - L) / S.pxH);
  }
  return { w, merged };
}

/** Keep landmarks ordered (top → sole) with a small minimum spacing. */
export function sanitizeLandmarks(lm) {
  const out = { ...lm };
  out.top = 1; out.sole = 0;
  for (let i = 1; i < LM_ORDER.length - 1; i++) {
    const k = LM_ORDER[i], prev = out[LM_ORDER[i - 1]];
    if (!(out[k] < prev - 0.004)) out[k] = prev - 0.004;
  }
  for (let i = LM_ORDER.length - 2; i > 0; i--) {
    const k = LM_ORDER[i], next = out[LM_ORDER[i + 1]];
    if (!(out[k] > next + 0.004)) out[k] = next + 0.004;
  }
  return out;
}

/** Profile photo: silhouette + a few sanity checks. */
export function analyzeSide(mask, w, h, cam = null) {
  mask = keepMain(mask, w, h);
  const S = silhouette(mask, w, h, cam && { ...cam, zt: 0.07 }, [0.47, 0.7]); // below the raised arms
  if (!S) return { S: null, issues: ["no-person"] };
  const issues = [];
  if (S.top <= 1) issues.push("cut-head");
  if (S.bot >= h - 2) issues.push("cut-feet");
  if (S.xmin <= 0 || S.xmax >= w - 1) issues.push("touch-edge");
  if (S.pxH < h * 0.4) issues.push("too-small");
  if (Math.abs(S.tilt) > 14) issues.push("tilted"); // bust and seat shift the midline, so be lenient
  return { S, issues };
}

/**
 * Photo measurements (fractions of height) at the landmark heights — the same
 * definitions fit.measureAt() uses on the model.
 */
export function photoMeasures(F, Sd, lm) {
  const band = (c, d, k) => { const o = []; for (let i = 0; i < k; i++) o.push(c + d * (i - (k - 1) / 2)); return o; };
  const m = {
    shoulderW: centerWidthAt(F, lm.shoulder),
    chestW: centerWidthAt(F, lm.chest),
    waistW: Math.min(...band(lm.waist, 0.015, 3).map((h) => centerWidthAt(F, h))),
    hipW: hipWidth(F, lm),
    thighW: legWidthAt(F, lm.thigh),
    calfW: Math.max(...band(lm.calf, 0.02, 3).map((h) => legWidthAt(F, h))),
    crotch: lm.crotch,
  };
  if (F.upperArm) m.upperArm = F.upperArm;
  if (Sd) {
    const a = lm.crotch + 0.012, b = Math.max(a + 0.02, lm.hip + 0.03);
    const dAt = sideDepthFn(Sd, lm);
    m.chestD = dAt(lm.chest);
    m.waistD = Math.min(...band(lm.waist, 0.015, 3).map(dAt));
    m.hipD = dAt(lm.hip);
    m.buttD = Math.max(...[a, a + (b - a) / 3, a + 2 * (b - a) / 3, b].map(dAt));
    m.thighD = dAt(lm.thigh);
  }
  return m;
}

// side-view depth below the chest with the front/back outline tracked from the
// chest down, so a hand hanging in front of the hip or thigh doesn't count
export function sideDepthFn(Sd, lm) {
  const y0 = Math.round(rowOf(Sd, lm.chest)), y1 = Math.min(Sd.h - 1, Math.round(rowOf(Sd, lm.thigh - 0.03)));
  const rows = [];
  for (let y = y0 + 1; y <= y1; y++) rows.push(y);
  if (y0 < 0 || !rows.length) return (h) => depthAt(Sd, h);
  const tw = trackedWidths(Sd, y0, rows);
  return (h) => {
    const yf = rowOf(Sd, h);
    if (yf <= y0 || yf >= y1) return depthAt(Sd, h);
    const i = Math.min(rows.length - 1, Math.max(1, Math.ceil(yf) - rows[0]));
    const t = yf - rows[i - 1];
    return tw.w[i - 1] + (tw.w[i] - tw.w[i - 1]) * Math.min(1, Math.max(0, t));
  };
}

// hip width with hand-merge protection (max over the 3-row band)
function hipWidth(F, lm) {
  const wy = Math.round(rowOf(F, lm.waist));
  const hs = [lm.hip - 0.015, lm.hip, lm.hip + 0.015];
  const rows = [];
  for (let y = wy + 1; y <= Math.round(rowOf(F, hs[0])) + 1 && y < F.h; y++) rows.push(y);
  if (!rows.length) return centerWidthAt(F, lm.hip);
  const tw = trackedWidths(F, wy, rows);
  let best = 0;
  for (const h of hs) {
    const yf = rowOf(F, h);
    const i = rows.findIndex((y) => y >= yf);
    const v = i < 0 ? tw.w[tw.w.length - 1] : i === 0 ? tw.w[0] : tw.w[i - 1] + (tw.w[i] - tw.w[i - 1]) * (yf - rows[i - 1]);
    if (v > best) best = v;
  }
  return best;
}
