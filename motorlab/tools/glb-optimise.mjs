/* Shrink a glTF binary until it will ship in a web app.
 *
 * A production-quality model arrives with everything a renderer could possibly
 * want: tangents, a second UV set for lightmaps, 2K PNG textures. A learning
 * app that draws the thing at 600 pixels wants none of that. This strips the
 * attributes that are not used, re-encodes the images at a sane size, and
 * repacks the buffer without the holes that leaves behind.
 *
 *   node tools/glb-optimise.mjs <in.glb> <out.glb> [--drop=TANGENT,TEXCOORD_1]
 *                               [--tex=512] [--quality=0.82] [--keep-alpha]
 *
 * Images are decoded and resized by a headless browser, because there is no
 * image library in this environment.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const args = process.argv.slice(2);
const opt = {};
const pos = [];
for (const a of args) {
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); opt[k] = v ?? '1'; }
  else pos.push(a);
}
const [src, dst] = pos;
const drop = new Set((opt.drop ?? 'TANGENT,TEXCOORD_1').split(',').filter(Boolean));
const texMax = parseInt(opt.tex ?? '512', 10);
const quality = parseFloat(opt.quality ?? '0.82');

/* ---- read the container ------------------------------------------------ */
const raw = readFileSync(src);
if (raw.readUInt32LE(0) !== 0x46546c67) throw new Error(`${src} is not a GLB`);
let p = 12, json = null, bin = null;
while (p < raw.length) {
  const len = raw.readUInt32LE(p), type = raw.readUInt32LE(p + 4);
  const body = raw.subarray(p + 8, p + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
  else if (type === 0x004e4942) bin = body;
  p += 8 + len + ((-len) % 4 + 4) % 4;
}
const g = json;
const before = raw.length;

/* ---- 1. drop attributes nothing is going to use ------------------------ */
let dropped = 0;
for (const mesh of g.meshes ?? [])
  for (const prim of mesh.primitives ?? [])
    for (const name of Object.keys(prim.attributes))
      if (drop.has(name)) { delete prim.attributes[name]; dropped++; }

/* a second UV set is only dead weight if no material points at it */
const usesUV1 = JSON.stringify(g.materials ?? []).includes('"texCoord":1');
if (drop.has('TEXCOORD_1') && usesUV1)
  console.warn('  ! a material references TEXCOORD_1 — dropping it anyway may change shading');

/* ---- 2. re-encode the images ------------------------------------------- */
const newImages = [];
let texBefore = 0, texAfter = 0;
if (opt['keep-images']) {
  /* a second pass over an already-optimised file must not re-compress its
     textures: JPEG on JPEG loses a little every time */
  for (const img of g.images ?? []) {
    const bv = g.bufferViews[img.bufferView];
    const buf = Buffer.from(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    texBefore += buf.length; texAfter += buf.length;
    newImages.push({ buf, mime: img.mimeType ?? 'image/png' });
  }
} else {
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

for (const img of g.images ?? []) {
  const bv = g.bufferViews[img.bufferView];
  const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  texBefore += data.length;
  const mime = img.mimeType ?? 'image/png';
  const uri = `data:${mime};base64,${data.toString('base64')}`;
  const out = await page.evaluate(async ([u, max, q, keepAlpha]) => {
    const im = new Image(); im.src = u; await im.decode();
    const n = Math.min(max, Math.max(im.width, im.height));
    const w = Math.max(1, Math.round(im.width  * n / Math.max(im.width, im.height)));
    const h = Math.max(1, Math.round(im.height * n / Math.max(im.width, im.height)));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(im, 0, 0, w, h);
    /* keep PNG only where the alpha channel is actually doing something */
    let hasAlpha = false;
    if (keepAlpha) {
      const px = cx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { hasAlpha = true; break; }
    }
    return { url: c.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', q), w, h, hasAlpha };
  }, [uri, texMax, quality, true]);
  const buf = Buffer.from(out.url.split(',')[1], 'base64');
  texAfter += buf.length;
  newImages.push({ buf, mime: out.hasAlpha ? 'image/png' : 'image/jpeg', w: out.w, h: out.h });
}
await browser.close();
}

/* ---- 2b. quantise normals to signed bytes ------------------------------
 * A normal is a unit vector; twelve bytes to say which way a triangle faces is
 * eleven more than it needs. KHR_mesh_quantization is understood by every
 * current glTF loader, and this is the one quantisation that needs no node
 * transform to undo it. */
const quantised = new Map();
if (opt.qnormals) {
  for (const mesh of g.meshes ?? [])
    for (const prim of mesh.primitives ?? []) {
      const ai = prim.attributes.NORMAL;
      if (ai == null || quantised.has(ai)) continue;
      const acc = g.accessors[ai];
      if (acc.componentType !== 5126 || acc.type !== 'VEC3') continue;
      const bv = g.bufferViews[acc.bufferView];
      const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const src8 = Buffer.alloc(acc.count * 4);            // VEC3 byte, 4-byte aligned
      for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < 3; c++) {
          const v = bin.readFloatLE(start + (i * 3 + c) * 4);
          src8.writeInt8(Math.max(-127, Math.min(127, Math.round(v * 127))), i * 4 + c);
        }
      }
      quantised.set(ai, src8);
      acc.componentType = 5120;
      acc.normalized = true;
      acc.byteOffset = 0;
    }
  if (quantised.size) {
    g.extensionsUsed = [...new Set([...(g.extensionsUsed ?? []), 'KHR_mesh_quantization'])];
    g.extensionsRequired = [...new Set([...(g.extensionsRequired ?? []), 'KHR_mesh_quantization'])];
  }
}

/* ---- 2c. quantise texture coordinates to unsigned shorts ----------------
 * A UV is a number between nought and one; sixteen bits of it is a 65,536th of
 * a texture, which is finer than any texture here can resolve. Core glTF allows
 * normalised unsigned shorts for TEXCOORD directly, so unlike positions this
 * needs no extension and no transform to undo — but it cannot hold a UV that
 * runs outside nought to one, so a tiled set is left alone. */
let uvDone = 0, uvSkipped = 0;
if (opt.quv) {
  for (const mesh of g.meshes ?? [])
    for (const prim of mesh.primitives ?? [])
      for (const [name, ai] of Object.entries(prim.attributes)) {
        if (!name.startsWith('TEXCOORD_') || quantised.has(ai)) continue;
        const acc = g.accessors[ai];
        if (acc.componentType !== 5126 || acc.type !== 'VEC2') continue;
        if (!acc.min || !acc.max || acc.min.some(v => v < 0) || acc.max.some(v => v > 1)) { uvSkipped++; continue; }
        const bv = g.bufferViews[acc.bufferView];
        const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        const stride = bv.byteStride ?? 8;
        const out = Buffer.alloc(acc.count * 4);       // VEC2 short: already 4-byte aligned
        for (let i = 0; i < acc.count; i++)
          for (let c = 0; c < 2; c++) {
            const v = bin.readFloatLE(start + i * stride + c * 4);
            out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v * 65535))), i * 4 + c * 2);
          }
        quantised.set(ai, out);
        acc.componentType = 5123;
        acc.normalized = true;
        acc.byteOffset = 0;
        uvDone++;
      }
}

/* ---- 3. repack: keep only the bufferViews still referenced -------------- */
const chunks = [];
let offset = 0;
const remap = new Map();
const push = (buf, extra = {}) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  chunks.push(buf);
  const view = { buffer: 0, byteOffset: offset, byteLength: buf.length, ...extra };
  offset += buf.length;
  return view;
};

const views = [];
const keepAccessor = (ai) => {
  const acc = g.accessors[ai];
  if (acc.bufferView == null) return;
  if (quantised.has(ai)) {                       // already rewritten in place
    /* a VEC3 of bytes is padded to four so each element stays 4-byte aligned,
       which the spec requires — and the stride has to be declared or the
       loader reads them three bytes apart and the shading falls apart */
    const view = push(quantised.get(ai), { target: 34962, byteStride: 4 });
    views.push(view);
    acc.byteOffset = 0;
    acc.bufferView = views.length - 1;
    return;
  }
  if (remap.has(acc.bufferView + ':' + ai)) { acc.bufferView = remap.get(acc.bufferView + ':' + ai); return; }
  const old = g.bufferViews[acc.bufferView];
  const start = (old.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const CT = { 5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 };
  const NC = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };
  const stride = old.byteStride ?? CT[acc.componentType] * NC[acc.type];
  const len = acc.count * stride;
  const view = push(Buffer.from(bin.subarray(start, start + len)),
                    old.target ? { target: old.target } : {});
  if (old.byteStride) view.byteStride = old.byteStride;
  views.push(view);
  acc.byteOffset = 0;
  acc.bufferView = views.length - 1;
  remap.set(acc.bufferView + ':' + ai, acc.bufferView);
};

const used = new Set();
for (const mesh of g.meshes ?? [])
  for (const prim of mesh.primitives ?? []) {
    for (const ai of Object.values(prim.attributes)) used.add(ai);
    if (prim.indices != null) used.add(prim.indices);
    for (const t of prim.targets ?? []) for (const ai of Object.values(t)) used.add(ai);
  }
for (const s of g.skins ?? []) if (s.inverseBindMatrices != null) used.add(s.inverseBindMatrices);
for (const a of g.animations ?? [])
  for (const smp of a.samplers ?? []) { used.add(smp.input); used.add(smp.output); }

for (const ai of [...used].sort((a, b) => a - b)) keepAccessor(ai);

for (let i = 0; i < newImages.length; i++) {
  const { buf, mime } = newImages[i];
  views.push(push(buf));
  g.images[i] = { mimeType: mime, bufferView: views.length - 1 };
}

g.bufferViews = views;
const blob = Buffer.concat(chunks);
g.buffers = [{ byteLength: blob.length }];

/* ---- 4. write it back out ---------------------------------------------- */
let js = Buffer.from(JSON.stringify(g), 'utf8');
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
const binPad = (4 - (blob.length % 4)) % 4;
const binOut = binPad ? Buffer.concat([blob, Buffer.alloc(binPad)]) : blob;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(binOut.length, 0); cb.writeUInt32LE(0x004e4942, 4);
writeFileSync(dst, Buffer.concat([header, cj, js, cb, binOut]));

const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
console.log(`${basename(src)} -> ${basename(dst)}`);
console.log(`  attributes dropped : ${dropped} (${[...drop].join(', ')})`);
console.log(`  textures           : ${kb(texBefore)} -> ${kb(texAfter)}` +
            (opt['keep-images'] ? '  (passed through)' : `  (max ${texMax}px)`));
if (opt.quv) console.log(`  UVs quantised      : ${uvDone} (${uvSkipped} left alone — tiled)`);
console.log(`  total              : ${kb(before)} -> ${kb(readFileSync(dst).length)}`);
