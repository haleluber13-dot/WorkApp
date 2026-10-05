/* Reading pictures from the phone / computer.

   decodeImageFile(file) turns any picture a phone can hold into a canvas:
   JPEG, PNG, WEBP, GIF, BMP, AVIF, SVG and iPhone HEIC/HEIF photos (decoded
   with a bundled copy of libheif, loaded only when needed). Camera rotation
   (EXIF orientation) is applied and very large photos are scaled down so
   editing stays fast. */

export const IMAGE_ACCEPT = "image/*,.heic,.heif,.avif,.webp,.svg";

const HEIC_TYPES = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_EXT = /\.(heic|heif|hif)$/i;

let heicMod = null;
async function heicDecoder() {
  if (!heicMod) heicMod = import("../vendor/heic/heic-to.js");
  return heicMod;
}

async function looksHeic(file) {
  if (HEIC_TYPES.test(file.type || "") || HEIC_EXT.test(file.name || "")) return true;
  // some phones send HEIC without a type: check the "ftyp" brand
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const tag = String.fromCharCode(...head.slice(4, 8));
    const brand = String.fromCharCode(...head.slice(8, 12));
    return tag === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
  } catch { return false; }
}

function toCanvas(src, w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function loadImg(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("decode failed"));
    im.src = url;
  });
}

async function decodeBlob(blob, maxSide) {
  // createImageBitmap applies EXIF rotation ("from-image") and is fast
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const c = toCanvas(bmp, bmp.width, bmp.height, maxSide);
      bmp.close?.();
      return c;
    } catch { /* fall back to <img> (e.g. SVG) */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImg(url);
    const w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
    return toCanvas(im, w, h, maxSide);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/* Any picture file → canvas. Throws an Error with a friendly message. */
export async function decodeImageFile(file, { maxSide = 4096 } = {}) {
  if (!file) throw new Error("No file chosen");
  const name = file.name || "photo";
  if (file.type && !file.type.startsWith("image/") && !/\.(heic|heif|hif|avif|webp|svg|png|jpe?g|gif|bmp)$/i.test(name)) {
    throw new Error(`“${name}” isn't a picture`);
  }
  if (await looksHeic(file)) {
    try {
      const { heicTo } = await heicDecoder();
      const png = await heicTo({ blob: file, type: "image/png" });
      return await decodeBlob(png, maxSide);
    } catch (e) {
      // Safari can open HEIC natively; try that before giving up
      try { return await decodeBlob(file, maxSide); } catch {}
      throw new Error(`Couldn't open the iPhone photo “${name}”`);
    }
  }
  try {
    return await decodeBlob(file, maxSide);
  } catch {
    throw new Error(`Couldn't open “${name}” — try a JPG or PNG`);
  }
}

/* Several files at once (keeps the order, skips the ones that fail). */
export async function decodeImageFiles(files, opts) {
  const out = [], failed = [];
  for (const f of files) {
    try { out.push({ file: f, name: (f.name || "Photo").replace(/\.[^.]+$/, ""), canvas: await decodeImageFile(f, opts) }); }
    catch (e) { failed.push(e.message); }
  }
  return { images: out, failed };
}
