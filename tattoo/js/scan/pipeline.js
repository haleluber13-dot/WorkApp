// Body scan — main-thread pipeline: photo decoding, the worker (with a
// main-thread fallback), measurements in cm, thumbnails.
import { decodeImageFile } from "../imageio.js";
import { SEG_SIZE, MASK_SIZE, analyzeFront, analyzeSide, photoMeasures } from "./silhouette.js";
import { ellipsePerimeter } from "./fit.js";
import { sampleSkin } from "./skin.js";

// ------------------------------------------------------------------ worker
let worker = null, workerBroken = false, seq = 0;
const pending = new Map();

function getWorker() {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./scan-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, progress, result, error } = e.data || {};
      const job = pending.get(id);
      if (!job) return;
      if (progress != null) { job.onProgress?.(progress); return; }
      pending.delete(id);
      if (error) job.reject(new Error(error)); else job.resolve(result);
    };
    worker.onerror = (e) => {
      e?.preventDefault?.();
      workerBroken = true;
      try { worker.terminate(); } catch { /* ignore */ }
      worker = null;
      for (const [, job] of pending) job.fallback();
      pending.clear();
    };
  } catch { workerBroken = true; worker = null; }
  return worker;
}

async function runLocal(type, data, onProgress) {
  if (type === "segment") { const m = await import("./silhouette.js"); return m.segmentPerson(data); }
  const f = await import("./fit.js");
  if (type === "fitPhoto") return f.fitPhotoReport(data, { ...(data.opts || {}), onProgress });
  return f.fitTapeReport(data, { ...(data.opts || {}), onProgress });
}

/** Run a job in the worker (falls back to the main thread). */
export function runJob(type, data, { onProgress, transfer = [] } = {}) {
  const w = getWorker();
  if (!w) return runLocal(type, data, onProgress);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    let settled = false;
    const job = {
      onProgress,
      resolve: (v) => { if (!settled) { settled = true; resolve(v); } },
      reject: (e) => { if (!settled) { settled = true; reject(e); } },
      fallback: () => { if (!settled) { settled = true; runLocal(type, data, onProgress).then(resolve, reject); } },
    };
    pending.set(id, job);
    try { w.postMessage({ id, type, data }, transfer); }
    catch { pending.delete(id); job.fallback(); }
  });
}

/** Stop a running fit (the worker is restarted on the next job). */
export function cancelJobs() {
  if (worker) { try { worker.terminate(); } catch { /* ignore */ } worker = null; }
  for (const [, job] of pending) job.reject(new Error("cancelled"));
  pending.clear();
}

// ------------------------------------------------------------------ photos

function scaled(src, maxSide) {
  const sw = src.width, sh = src.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const pixels = (c) => c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;

/**
 * 35 mm-equivalent focal length from a JPEG's EXIF (FocalLengthIn35mmFilm), or null.
 * Used for the lens-perspective correction of the soles.
 */
export async function exifFocal35(file) {
  try {
    if (!file || typeof file.slice !== "function") return null;
    const dv = new DataView(await file.slice(0, 262144).arrayBuffer());
    if (dv.byteLength < 12 || dv.getUint16(0) !== 0xffd8) return null;
    let o = 2;
    while (o + 10 < dv.byteLength) {
      const marker = dv.getUint16(o), len = dv.getUint16(o + 2);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      if (marker === 0xffe1 && dv.getUint32(o + 4) === 0x45786966) { // "Exif"
        const t = o + 10, le = dv.getUint16(t) === 0x4949;
        const u16 = (p) => dv.getUint16(t + p, le), u32 = (p) => dv.getUint32(t + p, le);
        const find = (ifd, tag) => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; }
          return -1;
        };
        const ex = find(u32(4), 0x8769);
        if (ex < 0) return null;
        const f = find(u32(ex + 8), 0xa405);
        if (f < 0) return null;
        const v = u16(f + 8);
        return v >= 10 && v <= 300 ? v : null;
      }
      o += 2 + len;
    }
  } catch { /* not a JPEG / unreadable */ }
  return null;
}

/**
 * File / Blob / canvas → { canvas (display), big: {w,h,rgba} (measuring), small (cut-out),
 *   cam: { f (focal length in measuring px), cy (optical-axis row), focal35, exif } }
 */
export async function preparePhoto(src) {
  const canvas = src instanceof HTMLCanvasElement ? src : await decodeImageFile(src, { maxSide: 2048 });
  const focal35 = src instanceof HTMLCanvasElement ? null : await exifFocal35(src);
  const bigC = scaled(canvas, MASK_SIZE), smallC = scaled(bigC, SEG_SIZE);
  const F = focal35 || 26; // a typical phone main camera when the photo doesn't say
  return {
    canvas,
    big: { w: bigC.width, h: bigC.height, rgba: pixels(bigC) },
    small: { w: smallC.width, h: smallC.height, rgba: pixels(smallC) },
    cam: { f: (F / 43.27) * Math.hypot(bigC.width, bigC.height), cy: bigC.height / 2, focal35: F, exif: !!focal35 },
  };
}

/** Automatic cut-out → soft mask at the measuring size. rect (0..1) limits it to a box. */
export async function cutOut(photo, rect = null) {
  const { small, big } = photo;
  const data = {
    rgba: new Uint8ClampedArray(small.rgba), w: small.w, h: small.h,
    guide: { rgba: new Uint8ClampedArray(big.rgba), w: big.w, h: big.h }, rect,
  };
  return runJob("segment", data, { transfer: [data.rgba.buffer, data.guide.rgba.buffer] });
}

// ------------------------------------------------------------------ analysis

export { analyzeFront, analyzeSide };

/** Landmarks as true body heights for measuring the model (undoes lens perspective). */
export function modelLandmarks(front, lm) {
  const f = front?.S?.persp?.toModel;
  if (!f) return { ...lm };
  const out = {};
  for (const [k, v] of Object.entries(lm)) out[k] = f(v);
  return out;
}

/** Photo measurements in cm (+ the fractions used for fitting). */
export function measurementsCm(front, side, lm, heightCm) {
  const f = photoMeasures(front.S, side?.S || null, lm);
  const cm = (v) => (v == null ? null : Math.round(v * heightCm * 10) / 10);
  const out = {
    height: heightCm,
    shoulderWidth: cm(f.shoulderW), chestWidth: cm(f.chestW), waistWidth: cm(f.waistW), hipWidth: cm(f.hipW),
    thighWidth: cm(f.thighW), calfWidth: cm(f.calfW), upperArmWidth: front.upperArm ? cm(front.upperArm) : null,
    inseam: cm(lm.crotch), legRatio: Math.round(lm.crotch * 1000) / 1000,
  };
  if (side) Object.assign(out, { chestDepth: cm(f.chestD), waistDepth: cm(f.waistD), hipDepth: cm(f.hipD), buttDepth: cm(f.buttD), thighDepth: cm(f.thighD) });
  return { frac: f, cm: out };
}

/**
 * Tape-measure circumferences: the photo's width (and depth, when there is a
 * side photo) with the fitted body's cross-section shape factor.
 * circ: fit result's model circumferences (fractions); f: photo fractions.
 */
export function circumferences(f, circ, heightCm, hasSide) {
  const est = (key, w, d) => {
    const m = circ[key];
    if (!m || !m.c || !w) return null;
    const k = m.c / ellipsePerimeter(m.w, m.d);           // shape factor of the body there
    const depth = hasSide && d ? d : m.d * (w / m.w);     // no side photo: the body's depth, scaled
    return Math.round(k * ellipsePerimeter(w, depth) * heightCm * 10) / 10;
  };
  return {
    chest: est("chest", f.chestW, f.chestD),
    waist: est("waist", f.waistW, f.waistD),
    hips: est("hip", f.hipW, f.buttD),
    thigh: est("thigh", f.thighW, f.thighD),
  };
}

export { sampleSkin };

// ------------------------------------------------------------------ images out

/** Square head-and-shoulders crop of the front photo (dataURL JPEG). */
export function headThumb(photo, front, lm, size = 256) {
  const S = front.S, k = photo.canvas.width / S.w;
  const yTop = S.botE - lm.top * S.pxH, yCut = S.botE - lm.shoulder * S.pxH;
  const side = Math.max(20, (yCut - yTop) * 1.45);
  let cx = 0, n = 0;
  for (let y = Math.max(0, Math.round(yTop)); y < Math.min(S.h, Math.round(S.botE - lm.chin * S.pxH)); y++) { cx += S.cx(y); n++; }
  cx = n ? cx / n : S.cx(Math.round(yTop));
  const sx = (cx - side / 2) * k, sy = (yTop - side * 0.1) * k, ss = side * k;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#888"; g.fillRect(0, 0, size, size);
  g.imageSmoothingQuality = "high";
  g.drawImage(photo.canvas, sx, sy, ss, ss, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.86);
}

/** Photo scaled to ≤ maxSide as a JPEG data URL. */
export function photoURL(photo, maxSide = 800) {
  return scaled(photo.canvas, maxSide).toDataURL("image/jpeg", 0.82);
}
