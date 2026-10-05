/* InkForm 3D — Geometric maker.
   A layered composition editor: geometric shapes (and free photos) on a
   canvas, each shape filled with ink, a pattern or a photo (with tattoo looks
   and geometric effects: low-poly, half & half, mosaic, shattered,
   wireframe), outlines, sacred-geometry overlays, templates, undo/redo,
   touch gestures. Output is a transparent, trimmed PNG canvas.

   mountGeoMaker(container, { onUse, onSave, onSketch, onExport, getDesigns,
                              getDesignCanvas, toast }) → { addPhoto, destroy } */

import { decodeImageFile, IMAGE_ACCEPT } from "../imageio.js";
import { SHAPES, SHAPE_GROUPS, shapeGeom, hitShape, shapeIconSVG } from "./shapes.js";
import { Renderer, INK } from "./render.js";
import { newDoc, newShape, fixDoc, ASPECTS, uid, shapeName } from "./model.js";
import { TEMPLATES } from "./templates.js";
import { SAMPLES, sampleCanvas } from "./samples.js";
import { removePlainBackground, fitCanvas, makeCanvas, ctx2d } from "./imgfx.js";
import { I } from "./icons.js";

const CSS_HREF = new URL("./geo.css", import.meta.url).href;
const DEG = Math.PI / 180;
const MAX_PHOTO = 1600;
const PREF_KEY = "inkform.geo.prefs";
const INKS = ["#141414", "#3b3b3b", "#6e6e6e", "#7a1f1f", "#c0392b", "#1f3a5f", "#2c5a3c", "#5b3a1e"];
const LOOKS = [
  ["original", "Original"], ["bw", "Black & grey"], ["line", "Line art"], ["dots", "Dotwork"],
  ["stencil", "Stencil"], ["posterize", "Posterize"], ["lowpoly", "Low-poly"],
  ["half", "Half & half"], ["mosaic", "Mosaic"], ["shatter", "Shattered"], ["wire", "Wireframe"],
];
const GEO_LOOKS = new Set(["lowpoly", "half", "mosaic", "shatter", "wire"]);
const EFFECTS = [
  ["original", "Plain photo", I.fxNone], ["lowpoly", "Low-poly", I.fxLow], ["half", "Half & half", I.fxHalf],
  ["mosaic", "Mosaic", I.fxMosaic], ["shatter", "Shattered", I.fxShatter], ["wire", "Wireframe", I.fxWire],
];
const PATTERNS = [["hatch", "Hatching"], ["cross", "Cross-hatch"], ["lines", "Lines"], ["grid", "Grid"], ["dots", "Dots"], ["stipple", "Stipple"], ["fade", "Fade dots"], ["echo", "Echo lines"]];
const TATTOO_LOOKS = [["design", "As designed"], ["bw", "Black & grey"], ["line", "Line art"], ["stencil", "Stencil"]];
const PREVIEWS = [["paper", "Paper"], ["skin", "Skin"], ["clear", "Clear"]];

function ensureCss() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  if (links.some((l) => l.href === CSS_HREF || (l.getAttribute("href") || "").includes("geo/geo.css"))) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = CSS_HREF;
  document.head.appendChild(l);
}
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const put = (node, ...kids) => node.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false && k !== ""));
const ibtn = (icon, label, onclick, extra = {}) => el("button", { type: "button", class: "gm-ibtn " + (extra.class || ""), title: label, "aria-label": label, onclick, ...extra.attrs }, el("span", { html: icon, class: "gm-ic" }));
const tbtn = (icon, label, onclick, cls = "") => el("button", { type: "button", class: "gm-btn " + cls, onclick, title: label }, el("span", { html: icon, class: "gm-ic" }), el("span", { class: "gm-bl" }, label));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };
const isTouch = () => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } };

/* -------------------------------------------------------------- storage */
const IDB_NAME = "inkform-geo";
function idbOpen() {
  return new Promise((res) => {
    try {
      if (!("indexedDB" in window)) return res(null);
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv"); if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
}
function idbReq(db, store, mode, fn) {
  return new Promise((res) => {
    try {
      const tx = db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r && "result" in r ? r.result : undefined);
      tx.onerror = () => res(undefined);
      tx.onabort = () => res(undefined);
    } catch { res(undefined); }
  });
}
const canvasBlob = (c, type = "image/png", q) => new Promise((res) => { try { c.toBlob((b) => res(b), type, q); } catch { res(null); } });

function hasAlpha(c) {
  const s = fitCanvas(c, 96);
  const d = ctx2d(s).getImageData(0, 0, s.width, s.height).data;
  let n = 0;
  for (let j = 3; j < d.length; j += 4) if (d[j] < 245) n++;
  return n > (d.length / 4) * 0.01;
}
function plainBorder(c) {
  const s = fitCanvas(c, 80);
  const w = s.width, h = s.height, d = ctx2d(s).getImageData(0, 0, w, h).data;
  const px = [];
  for (let x = 0; x < w; x++) px.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) px.push(y * w, y * w + w - 1);
  let r = 0, g = 0, b = 0;
  for (const i of px) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  r /= px.length; g /= px.length; b /= px.length;
  let dev = 0;
  for (const i of px) dev += Math.abs(d[i * 4] - r) + Math.abs(d[i * 4 + 1] - g) + Math.abs(d[i * 4 + 2] - b);
  return dev / px.length / 3 < 14;
}
function thumbOf(c, size = 128) {
  const k = Math.min(1, size / Math.max(c.width, c.height));
  const t = makeCanvas(c.width * k, c.height * k);
  const g = ctx2d(t); g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, t.width, t.height);
  try { return t.toDataURL("image/png"); } catch { return ""; }
}

/* ================================================================ maker */
class GeoMaker {
  constructor(container, opts) {
    ensureCss();
    this.c = container;
    this.o = opts || {};
    this.prefs = { preview: "paper", snap: true, ...readPrefs() };
    this.photos = new Map();
    this.tray = []; // ids of user/design photos shown in the tray
    this.doc = newDoc("square");
    this.name = "";
    this.sel = null;
    this.adjust = false;
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.hist = []; this.hi = -1;
    this.left = this.prefs.left || "shapes";
    this.right = "style";
    this.sheet = null;
    this.compact = false;
    this.pointers = new Map();
    this.drag = null; this.gesture = null; this.guides = [];
    this.comp = null; this.compDirty = true; this.compScale = 0;
    this.tplThumbs = new Map(); this.sampleThumbs = new Map();
    this.showDesigns = false;
    this.renderer = new Renderer((id) => {
      const ph = this.photo(id);
      if (!ph) return null;
      return { canvas: ph.useCut && ph.cut ? ph.cut : ph.src, ver: ph.ver, hasAlpha: ph.useCut ? true : ph.alpha };
    });
    this.build();
    this.commit(true);
    this.ready = this.restore().catch(() => {});
    this.api = {
      addPhoto: (f, n) => this.addPhoto(f, n),
      destroy: () => this.destroy(),
      applyTemplate: (id) => this.applyTemplate(id),
      getDoc: () => JSON.parse(JSON.stringify(this.doc)),
      exportCanvas: () => this.renderer.exportDoc(this.doc),
      undo: () => this.undo(), redo: () => this.redo(),
      select: (id) => this.select(id),
      maker: this,
    };
  }

  toast(msg) { try { this.o.toast ? this.o.toast(msg) : console.log(msg); } catch { /* ignore */ } }

  /* ------------------------------------------------------------ photos */
  photo(id) {
    if (!id) return null;
    let ph = this.photos.get(id);
    if (!ph && id.startsWith("sample:")) {
      const c = sampleCanvas(id);
      if (!c) return null;
      const meta = SAMPLES.find((s) => s.id === id);
      ph = { id, name: meta?.name || "Sample", kind: "sample", src: c, cut: null, useCut: false, tol: 0.16, ver: 1, alpha: meta?.kind !== "scene", thumb: "" };
      this.photos.set(id, ph);
    }
    return ph || null;
  }
  ingest(canvas, name, kind = "user", id) {
    const src = makeCanvas(1, 1);
    const fitted = fitCanvas(canvas, MAX_PHOTO);
    src.width = fitted.width; src.height = fitted.height;
    ctx2d(src).drawImage(fitted, 0, 0);
    const ph = { id: id || uid("p"), name: (name || "Photo").replace(/\.[a-z0-9]+$/i, "").slice(0, 40), kind, src, cut: null, useCut: false, tol: 0.12, ver: 1, alpha: hasAlpha(src), thumb: thumbOf(src) };
    this.photos.set(ph.id, ph);
    if (!this.tray.includes(ph.id)) this.tray.unshift(ph.id);
    this.savePhoto(ph);
    return ph;
  }
  setCut(ph, on, tol = ph.tol) {
    if (!ph || ph.kind === "sample") return;
    ph.tol = tol;
    if (on) {
      const c = removePlainBackground(ph.src, tol);
      if (c._kept < 0.02 || c._kept > 0.985) {
        this.toast(c._kept > 0.985 ? "No plain background found — try a higher tolerance" : "That removed everything — try a lower tolerance");
        if (c._kept < 0.02) { ph.useCut = false; ph.ver++; this.afterPhotoChange(ph); return; }
      }
      if (c._kept > 0.85 && c._kept <= 0.985) this.toast("Only a little background was removed — this works best on plain backdrops");
      ph.cut = c; ph.useCut = true;
    } else ph.useCut = false;
    ph.ver++;
    ph.thumb = thumbOf(ph.useCut && ph.cut ? ph.cut : ph.src);
    this.afterPhotoChange(ph);
    this.savePhoto(ph);
  }
  afterPhotoChange() { this.changed(); this.renderPhotos(); this.renderLayers(); this.scheduleSave(); }

  async addPhoto(input, name) {
    await this.ready;
    let canvas;
    if (!input) throw new Error("No picture");
    if (input instanceof HTMLCanvasElement) canvas = input;
    else if (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap) { canvas = makeCanvas(input.width, input.height); ctx2d(canvas).drawImage(input, 0, 0); }
    else if (input instanceof HTMLImageElement) { canvas = makeCanvas(input.naturalWidth, input.naturalHeight); ctx2d(canvas).drawImage(input, 0, 0); }
    else if (input instanceof Blob) {
      const f = input.type || input.name ? input : new File([input], name || "photo.png", { type: "image/png" });
      canvas = await decodeImageFile(f, { maxSide: MAX_PHOTO });
    } else throw new Error("That isn't a picture");
    const ph = this.ingest(canvas, name || input.name || "Photo", "user");
    this.autoUse([ph.id]);
    this.renderPhotos();
    return ph.id;
  }
  async addFiles(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    const ids = [], bad = [];
    this.busy(true, list.length > 1 ? `Opening ${list.length} photos…` : "Opening photo…");
    for (const f of list) {
      try { const c = await decodeImageFile(f, { maxSide: MAX_PHOTO }); ids.push(this.ingest(c, f.name, "user").id); }
      catch (e) { bad.push(e.message || "Couldn't open a photo"); }
    }
    this.busy(false);
    if (bad.length) this.toast(bad[0]);
    if (ids.length) {
      const placed = this.autoUse(ids);
      this.toast(placed ? (ids.length > 1 ? `${ids.length} photos added` : "Photo added") : (ids.length > 1 ? `${ids.length} photos added — tap one to use it` : "Photo added — tap it to use it"));
    }
    this.renderPhotos();
  }

  /* Put new photos where they're most likely wanted. Returns true if placed. */
  autoUse(ids) {
    const rest = [...ids];
    let last = null;
    const sel = this.selShape();
    if (sel && this.fillable(sel) && rest.length) { this.setPhoto(sel, rest.shift()); last = sel; }
    while (rest.length) {
      const slot = this.doc.shapes.find((s) => s.fill.kind === "photo" && (!s.fill.photo || s.fill.photo.startsWith("sample:")) && this.fillable(s));
      if (!slot) break;
      this.setPhoto(slot, rest.shift()); last = slot;
    }
    if (rest.length && !this.doc.shapes.length) last = this.placeImage(rest.shift(), false);
    if (last) { this.select(last.id, false); this.commit(); this.changed(true); return true; }
    return false;
  }
  fillable(s) { return !SHAPES[s.type]?.lineOnly && shapeGeom(s).regions.length > 0; }
  setPhoto(shape, id) {
    const ph = this.photo(id);
    if (!ph) return;
    const prev = shape.fill.photo ? this.photo(shape.fill.photo) : null;
    const wasSample = !shape.fill.photo || shape.fill.photo.startsWith("sample:");
    shape.fill.kind = "photo";
    shape.fill.photo = id;
    if (wasSample || prev?.id !== id) { shape.fill.px = 0; shape.fill.py = 0; shape.fill.zoom = 1; shape.fill.prot = 0; }
    // the sample was a cut-out animal/flower: cut the new photo too if it sits on a plain background
    if (prev && prev.alpha && !ph.alpha && !ph.useCut && ph.kind !== "sample" && plainBorder(ph.src)) {
      this.setCut(ph, true);
      if (ph.useCut) this.toast("Removed the plain background — turn it off under Style › Photo");
    }
    if (shape.type === "image") {
      const c = ph.src, m = Math.max(shape.w, shape.h);
      const k = m / Math.max(c.width, c.height);
      shape.w = Math.round(c.width * k); shape.h = Math.round(c.height * k);
    }
    if (!shape.slot) shape.slot = false;
  }
  placeImage(id, commit = true) {
    const ph = this.photo(id);
    if (!ph) return null;
    // a subject on a plain backdrop: cut it out so effects and outlines follow its shape
    if (!ph.alpha && !ph.useCut && !ph.triedCut && ph.kind !== "sample" && plainBorder(ph.src)) {
      ph.triedCut = true;
      this.setCut(ph, true);
      if (ph.useCut) this.toast("Removed the plain background — turn it off under Style › Photo");
    }
    const m = Math.min(this.doc.w, this.doc.h) * 0.7;
    const k = m / Math.max(ph.src.width, ph.src.height);
    const s = newShape("image", { x: this.doc.w / 2, y: this.doc.h / 2, w: Math.round(ph.src.width * k), h: Math.round(ph.src.height * k), fill: { kind: "photo", photo: id }, line: { w: 0 } });
    this.doc.shapes.push(s);
    if (!this.name) this.name = "Geometric " + ph.name.toLowerCase();
    if (commit) { this.select(s.id, false); this.commit(); this.changed(true); }
    return s;
  }
  usePhoto(id) {
    const sel = this.selShape();
    if (sel && this.fillable(sel)) {
      this.setPhoto(sel, id);
      this.commit(); this.changed(true);
      this.toast(`Photo placed in the ${shapeName(sel).toLowerCase()}`);
    } else {
      this.placeImage(id);
      this.toast("Photo placed — pick an effect or put it in a shape");
    }
    if (this.compact) this.setSheet(null);
  }
  removeFromTray(id) {
    this.tray = this.tray.filter((x) => x !== id);
    this.renderPhotos(); this.scheduleSave();
  }

  /* ------------------------------------------------------------- shapes */
  selShape() { return this.doc.shapes.find((s) => s.id === this.sel) || null; }
  select(id, rerender = true) {
    if (this.sel !== id) this.adjust = false;
    this.sel = id && this.doc.shapes.some((s) => s.id === id) ? id : null;
    if (!this.sel) this.adjust = false;
    if (rerender) { this.renderPanels(); this.draw(); }
  }
  addShape(type) {
    const def = SHAPES[type];
    const k = Math.min(1, (Math.min(this.doc.w, this.doc.h) * 0.62) / Math.max(def.w, def.h));
    const s = newShape(type, { x: this.doc.w / 2, y: this.doc.h / 2, w: Math.round(def.w * k), h: Math.round(def.h * k) });
    // offset a little when stacking several new shapes on the same spot
    const same = this.doc.shapes.filter((o) => Math.abs(o.x - s.x) < 2 && Math.abs(o.y - s.y) < 2 && o.type === type).length;
    s.x += same * 24; s.y += same * 24;
    this.doc.shapes.push(s);
    this.select(s.id, false);
    this.commit(); this.changed(true);
    if (this.compact) this.setSheet(null);
  }
  duplicate() {
    const s = this.selShape(); if (!s) return;
    const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.x += 28; c.y += 28;
    this.doc.shapes.splice(this.doc.shapes.indexOf(s) + 1, 0, c);
    this.select(c.id, false); this.commit(); this.changed(true);
  }
  remove() {
    const s = this.selShape(); if (!s) return;
    this.doc.shapes = this.doc.shapes.filter((x) => x !== s);
    this.select(null, false); this.commit(); this.changed(true);
  }
  order(dir) {
    const s = this.selShape(); if (!s) return;
    const a = this.doc.shapes, i = a.indexOf(s);
    const j = dir === "top" ? a.length - 1 : dir === "bottom" ? 0 : clamp(i + dir, 0, a.length - 1);
    if (i === j) return;
    a.splice(i, 1); a.splice(j, 0, s);
    this.commit(); this.changed(true);
  }
  align(axis) {
    const s = this.selShape(); if (!s) return;
    if (axis !== "v") s.x = this.doc.w / 2;
    if (axis !== "h") s.y = this.doc.h / 2;
    this.commit(); this.changed();
  }
  applyTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const doc = t.build();
    doc.look = this.doc.look;
    this.doc = fixDoc(doc);
    this.name = t.name;
    this.sel = null; this.adjust = false;
    // fill the main slot with the newest photo the user already added
    const userPh = this.tray.find((pid) => this.photos.get(pid)?.kind === "user");
    if (userPh) {
      const slot = this.doc.shapes.find((s) => s.slot);
      if (slot) { this.setPhoto(slot, userPh); this.sel = slot.id; }
    } else {
      const slot = this.doc.shapes.find((s) => s.slot);
      if (slot) this.sel = slot.id;
    }
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.commit(); this.changed(true);
    this.toast(userPh ? `${t.name} — your photo is in. Tap a shape, then a photo, to swap.` : `${t.name} — now add your photos to swap them in`);
    if (this.compact) this.setSheet(null);
  }
  setAspect(a) {
    const A = ASPECTS[a]; if (!A || this.doc.aspect === a) return;
    const dx = (A.w - this.doc.w) / 2, dy = (A.h - this.doc.h) / 2;
    for (const s of this.doc.shapes) { s.x += dx; s.y += dy; }
    this.doc.aspect = a; this.doc.w = A.w; this.doc.h = A.h;
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.commit(); this.changed(true);
  }
  setLook(l) {
    this.doc.look = l;
    this.commit(); this.changed(true);
  }
  clearAll() {
    if (!this.doc.shapes.length) return;
    this.doc.shapes = []; this.sel = null; this.name = "";
    this.commit(); this.changed(true);
    this.toast("Canvas cleared — Undo brings it back");
  }

  /* ------------------------------------------------------------ history */
  commit(initial = false) {
    const snap = JSON.stringify(this.doc);
    if (!initial && snap === this.hist[this.hi]) return;
    this.hist = this.hist.slice(0, this.hi + 1);
    this.hist.push(snap);
    if (this.hist.length > 80) this.hist.shift();
    this.hi = this.hist.length - 1;
    this.updateUndo();
    if (!initial) this.scheduleSave();
  }
  undo() { if (this.hi > 0) { this.hi--; this.loadSnap(); } }
  redo() { if (this.hi < this.hist.length - 1) { this.hi++; this.loadSnap(); } }
  loadSnap() {
    this.doc = fixDoc(JSON.parse(this.hist[this.hi]));
    if (!this.selShape()) { this.sel = null; this.adjust = false; }
    this.updateUndo(); this.changed(true); this.scheduleSave();
  }
  updateUndo() {
    if (!this.ui) return;
    for (const b of this.ui.undo) b.disabled = this.hi <= 0;
    for (const b of this.ui.redo) b.disabled = this.hi >= this.hist.length - 1;
  }

  /* --------------------------------------------------------- persistence */
  async restore() {
    this.db = await idbOpen();
    if (!this.db) return;
    const saved = await idbReq(this.db, "kv", "readonly", (s) => s.get("state"));
    if (!saved || !saved.doc) return;
    const recs = await idbReq(this.db, "photos", "readonly", (s) => s.getAll());
    for (const r of recs || []) {
      try {
        if (!r || !r.blob) continue;
        const bmp = await createImageBitmap(r.blob);
        const c = makeCanvas(bmp.width, bmp.height); ctx2d(c).drawImage(bmp, 0, 0); bmp.close?.();
        const ph = { id: r.id, name: r.name, kind: r.kind || "user", src: c, cut: null, useCut: false, tol: r.tol || 0.12, ver: 1, alpha: hasAlpha(c), thumb: "" };
        if (r.useCut) { ph.cut = removePlainBackground(c, ph.tol); ph.useCut = true; }
        ph.thumb = thumbOf(ph.useCut && ph.cut ? ph.cut : c);
        this.photos.set(ph.id, ph);
      } catch { /* skip broken photo */ }
    }
    this.tray = (saved.tray || []).filter((id) => this.photos.has(id));
    // only restore if nothing happened meanwhile
    if (this.hist.length <= 1 && !this.doc.shapes.length) {
      this.doc = fixDoc(saved.doc);
      this.name = saved.name || "";
      this.hist = [JSON.stringify(this.doc)]; this.hi = 0;
      this.updateUndo();
    }
    this.changed(true);
  }
  scheduleSave() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.saveNow(), 1200);
  }
  async saveNow() {
    if (!this.db) return;
    const used = new Set(this.tray);
    for (const s of this.doc.shapes) if (s.fill.photo && !s.fill.photo.startsWith("sample:")) used.add(s.fill.photo);
    await idbReq(this.db, "kv", "readwrite", (s) => s.put({ doc: this.doc, name: this.name, tray: this.tray }, "state"));
    const keys = await idbReq(this.db, "photos", "readonly", (s) => s.getAllKeys());
    for (const k of keys || []) if (!used.has(k) && !this.hist.some((h) => h.includes(k))) await idbReq(this.db, "photos", "readwrite", (s) => s.delete(k));
    for (const id of used) { const ph = this.photos.get(id); if (ph && !ph._saved) await this.savePhoto(ph); }
  }
  async savePhoto(ph) {
    if (!this.db || !ph || ph.kind === "sample") return;
    if (!ph._blob) ph._blob = await canvasBlob(ph.src, ph.alpha ? "image/png" : "image/jpeg", 0.92);
    if (!ph._blob) return;
    await idbReq(this.db, "photos", "readwrite", (s) => s.put({ id: ph.id, name: ph.name, kind: ph.kind, blob: ph._blob, useCut: ph.useCut, tol: ph.tol }, ph.id));
    ph._saved = true;
  }

  /* ---------------------------------------------------------------- UI */
  build() {
    const root = el("div", { class: "geomaker", tabindex: "0" });
    this.root = root;
    const ui = (this.ui = { undo: [], redo: [] });
    const undoB = () => { const b = ibtn(I.undo, "Undo (Ctrl+Z)", () => this.undo()); ui.undo.push(b); return b; };
    const redoB = () => { const b = ibtn(I.redo, "Redo (Ctrl+Y)", () => this.redo()); ui.redo.push(b); return b; };

    // ---- top bar
    ui.aspect = el("select", { class: "gm-select", "aria-label": "Canvas shape", onchange: (e) => this.setAspect(e.target.value) },
      Object.entries(ASPECTS).map(([k, a]) => el("option", { value: k }, a.label)));
    ui.look = el("select", { class: "gm-select gm-lookselect", "aria-label": "Tattoo look", onchange: (e) => this.setLook(e.target.value) },
      TATTOO_LOOKS.map(([k, l]) => el("option", { value: k }, l)));
    ui.moreBtn = ibtn(I.more, "More", (e) => { e.stopPropagation(); this.toggleMenu(); }, { class: "gm-only-compact" });
    ui.menu = el("div", { class: "gm-menu", hidden: true, role: "menu" });
    const top = el("header", { class: "gm-top" },
      el("div", { class: "gm-title" }, el("span", { html: I.effects, class: "gm-ic" }), el("b", {}, "Geometric maker")),
      el("label", { class: "gm-field gm-hide-compact" }, el("span", {}, "Canvas"), ui.aspect),
      el("div", { class: "gm-group" }, undoB(), redoB()),
      el("label", { class: "gm-field" }, el("span", { class: "gm-hide-compact" }, "Tattoo look"), ui.look),
      el("div", { class: "gm-spacer" }),
      el("div", { class: "gm-out gm-hide-compact" },
        tbtn(I.download, "Save image", () => this.output("export")),
        tbtn(I.sketch, "Edit in Sketch", () => this.output("sketch")),
        tbtn(I.save, "Save to designs", () => this.output("save"))),
      ui.moreBtn,
      el("button", { type: "button", class: "gm-btn gm-primary", onclick: () => this.output("use"), title: "Put on body" }, el("span", { html: I.body, class: "gm-ic" }), el("span", { class: "gm-bl" }, "Put on body")),
      ui.menu,
    );

    // ---- side panels
    ui.panes = {};
    const pane = (id) => (ui.panes[id] = el("div", { class: "gm-pane", "data-pane": id, role: "tabpanel" }));
    const tabs = (ids, side) => el("div", { class: "gm-tabs", role: "tablist" }, ids.map(([id, label, icon]) =>
      el("button", { type: "button", class: "gm-tab", "data-tab": id, role: "tab", onclick: () => this.setTab(side, id) }, el("span", { html: icon, class: "gm-ic" }), el("span", {}, label))));
    ui.left = el("aside", { class: "gm-side gm-left" }, tabs([["shapes", "Shapes", I.shapes], ["photos", "Photos", I.photo]], "left"), el("div", { class: "gm-sheethead" }), pane("shapes"), pane("photos"));
    ui.right = el("aside", { class: "gm-side gm-right" }, tabs([["style", "Style", I.style], ["effects", "Effects", I.effects], ["layers", "Layers", I.layers]], "right"), el("div", { class: "gm-sheethead" }), pane("style"), pane("effects"), pane("layers"));

    // ---- stage
    ui.cv = el("canvas", { class: "gm-canvas", "aria-label": "Design canvas" });
    ui.empty = el("div", { class: "gm-empty", hidden: true });
    ui.selbar = el("div", { class: "gm-selbar", hidden: true });
    ui.hint = el("div", { class: "gm-hint", hidden: true });
    ui.zoomLbl = el("button", { type: "button", class: "gm-zoomlbl", title: "Fit", onclick: () => this.fit() }, "100%");
    ui.busy = el("div", { class: "gm-busy", hidden: true }, el("span", { class: "gm-spin" }), el("span", { class: "gm-busytext" }, "Working…"));
    const zoom = el("div", { class: "gm-zoom" },
      ibtn(I.zoomOut, "Zoom out", () => this.zoomBy(1 / 1.25)), ui.zoomLbl, ibtn(I.zoomIn, "Zoom in", () => this.zoomBy(1.25)), ibtn(I.fit, "Fit to screen", () => this.fit()));
    ui.stage = el("main", { class: "gm-stage" }, ui.cv, ui.selbar, ui.empty, ui.hint, zoom, ui.busy);

    // ---- mobile tab bar
    ui.tabbar = el("nav", { class: "gm-tabbar", "aria-label": "Geometric maker tools" },
      [["shapes", "Shapes", I.shapes], ["photos", "Photos", I.photo], ["style", "Style", I.style], ["effects", "Effects", I.effects], ["layers", "Layers", I.layers]].map(([id, label, icon]) =>
        el("button", { type: "button", "data-sheet": id, onclick: () => this.setSheet(this.sheet === id ? null : id) }, el("span", { html: icon, class: "gm-ic" }), el("span", {}, label))));

    // ---- hidden file inputs
    ui.file = el("input", { type: "file", accept: IMAGE_ACCEPT, multiple: true, hidden: true, onchange: (e) => { this.addFiles(e.target.files); e.target.value = ""; } });
    ui.cam = el("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => { this.addFiles(e.target.files); e.target.value = ""; } });

    root.append(top, el("div", { class: "gm-main" }, ui.left, ui.stage, ui.right), ui.tabbar, ui.file, ui.cam);
    put(this.c, root);

    // events
    const cv = ui.cv;
    this._on = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._on.push([t, ev, fn, o]); };
    on(cv, "pointerdown", (e) => this.onDown(e));
    on(cv, "pointermove", (e) => this.onMove(e));
    on(cv, "pointerup", (e) => this.onUp(e));
    on(cv, "pointercancel", (e) => this.onUp(e, true));
    on(cv, "lostpointercapture", (e) => { if (this.pointers.has(e.pointerId)) this.onUp(e, true); });
    on(cv, "dblclick", (e) => this.onDbl(e));
    on(cv, "wheel", (e) => this.onWheel(e), { passive: false });
    on(document, "keydown", (e) => this.onKey(e));
    on(document, "pointerdown", (e) => { if (!ui.menu.hidden && !ui.menu.contains(e.target) && e.target !== ui.moreBtn) ui.menu.hidden = true; });
    on(root, "dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); root.classList.add("gm-dropping"); } });
    on(root, "dragleave", (e) => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove("gm-dropping"); });
    on(root, "drop", (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); root.classList.remove("gm-dropping"); this.addFiles(e.dataTransfer.files); } });
    this._themeObs = new MutationObserver(() => { this._colors = null; this.draw(); });
    this._themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    this._ro = new ResizeObserver(() => this.layout());
    this._ro.observe(root);

    this.renderPanels();
    this.renderShapes();
    this.layout();
    setTimeout(() => this.makeThumbs(), 60);
  }

  layout() {
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const compact = r.width <= 700;
    this.root.classList.toggle("gm-narrow", !compact && r.width < 1260);
    this.root.classList.toggle("gm-tight", !compact && r.width < 1000);
    if (compact !== this.compact) {
      this.compact = compact;
      this.root.classList.toggle("gm-compact", compact);
      if (!compact) this.sheet = null;
      this.syncTabs();
      this.renderSelbar();
    }
    this.draw();
  }
  setTab(side, id) {
    if (side === "left") { this.left = id; this.prefs.left = id; writePrefs(this.prefs); } else this.right = id;
    this.syncTabs();
  }
  setSheet(id) {
    this.sheet = id;
    if (id && ["shapes", "photos"].includes(id)) this.left = id;
    if (id && ["style", "effects", "layers"].includes(id)) this.right = id;
    this.syncTabs();
    this.renderSelbar();
    requestAnimationFrame(() => this.layout());
  }
  syncTabs() {
    const { ui } = this;
    for (const [id, p] of Object.entries(ui.panes)) {
      const active = this.compact ? this.sheet === id : (id === this.left || id === this.right);
      p.hidden = !active;
    }
    for (const b of this.root.querySelectorAll(".gm-tab")) {
      const on = b.dataset.tab === this.left || b.dataset.tab === this.right;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on));
    }
    for (const b of ui.tabbar.querySelectorAll("button")) b.classList.toggle("on", b.dataset.sheet === this.sheet);
    const names = { shapes: "Shapes & templates", photos: "Photos", style: "Style", effects: "Geometric effects", layers: "Layers & canvas" };
    for (const side of [ui.left, ui.right]) {
      const has = this.compact && this.sheet && side.querySelector(`[data-pane="${this.sheet}"]`);
      side.classList.toggle("gm-open", !!has);
      const head = side.querySelector(".gm-sheethead");
      put(head);
      if (has) head.append(el("b", {}, names[this.sheet]), ibtn(I.sheetDown, "Close", () => this.setSheet(null)));
    }
  }
  toggleMenu() {
    const m = this.ui.menu;
    if (!m.hidden) { m.hidden = true; return; }
    const item = (icon, label, fn) => el("button", { type: "button", role: "menuitem", class: "gm-mi", onclick: () => { m.hidden = true; fn(); } }, el("span", { html: icon, class: "gm-ic" }), label);
    put(m, 
      item(I.save, "Save to designs", () => this.output("save")),
      item(I.sketch, "Edit in Sketch", () => this.output("sketch")),
      item(I.download, "Save image", () => this.output("export")),
      el("div", { class: "gm-msep" }),
      el("div", { class: "gm-mlabel" }, "Canvas"),
      el("div", { class: "gm-mrow" }, Object.entries(ASPECTS).map(([k, a]) => el("button", { type: "button", class: "gm-chip" + (this.doc.aspect === k ? " on" : ""), onclick: () => { m.hidden = true; this.setAspect(k); } }, a.label))),
    );
    m.hidden = false;
  }
  busy(on, text) {
    this.ui.busy.hidden = !on;
    if (text) this.ui.busy.querySelector(".gm-busytext").textContent = text;
  }

  renderPanels() {
    this.renderStyle(); this.renderEffects(); this.renderLayers(); this.renderPhotos(); this.renderSelbar(); this.renderEmpty();
    this.ui.aspect.value = this.doc.aspect;
    this.ui.look.value = this.doc.look || "design";
    this.syncTabs();
  }

  /* ---------------------------------------------------------- controls */
  slider(label, value, { min, max, step = 1, fmt = (v) => v, live = true }, set) {
    const out = el("output", {}, fmt(value));
    const inp = el("input", { type: "range", min, max, step, value, "aria-label": label });
    inp.addEventListener("input", () => { const v = +inp.value; out.textContent = fmt(v); if (live) { set(v); this.changed(); } });
    inp.addEventListener("change", () => { const v = +inp.value; set(v); this.changed(); this.commit(); });
    return el("label", { class: "gm-slider" }, el("span", { class: "gm-sl" }, el("span", {}, label), out), inp);
  }
  seg(options, value, pick, cls = "") {
    return el("div", { class: "gm-seg " + cls, role: "group" }, options.map(([v, label, icon]) =>
      el("button", { type: "button", class: v === value ? "on" : "", "aria-pressed": String(v === value), title: label, onclick: () => pick(v) },
        icon ? el("span", { html: icon, class: "gm-ic" }) : null, el("span", {}, label))));
  }
  toggle(label, checked, set, disabled = false, note) {
    const inp = el("input", { type: "checkbox", disabled });
    inp.checked = !!checked;
    inp.addEventListener("change", () => set(inp.checked));
    return el("label", { class: "gm-switch" + (disabled ? " off" : "") }, inp, el("span", { class: "gm-sw" }), el("span", { class: "gm-swl" }, label, note ? el("small", {}, note) : null));
  }
  section(title, ...kids) {
    return el("section", { class: "gm-sec" }, el("h4", {}, title), ...kids);
  }

  /* ------------------------------------------------------- Shapes pane */
  renderShapes() {
    const P = this.ui.panes.shapes;
    const tpl = el("div", { class: "gm-tplrow" }, TEMPLATES.map((t) => this.tplCard(t)));
    const groups = SHAPE_GROUPS.map((g) => this.section(g, el("div", { class: "gm-shapegrid" },
      Object.entries(SHAPES).filter(([, d]) => d.group === g).map(([type, d]) =>
        el("button", { type: "button", class: "gm-shapebtn", title: "Add " + d.label.toLowerCase(), onclick: () => this.addShape(type) },
          el("span", { html: shapeIconSVG(type, 30) }), el("span", {}, d.label))))));
    put(P, this.section("Templates", el("p", { class: "gm-note" }, "One tap, then swap in your own photos."), tpl), ...groups);
  }
  tplCard(t) {
    const img = el("span", { class: "gm-tplimg" });
    const url = this.tplThumbs.get(t.id);
    if (url) img.append(el("img", { src: url, alt: "" }));
    return el("button", { type: "button", class: "gm-tpl", "data-tpl": t.id, onclick: () => this.applyTemplate(t.id) }, img, el("span", {}, t.name));
  }
  async makeThumbs() {
    const R = this.renderer;
    for (const s of SAMPLES) {
      if (this.destroyed) return;
      await new Promise((r) => setTimeout(r, 10));
      const ph = this.photo(s.id);
      if (ph) { this.sampleThumbs.set(s.id, thumbOf(ph.src, 140)); }
    }
    this.renderPhotos();
    for (const t of TEMPLATES) {
      if (this.destroyed) return;
      await new Promise((r) => setTimeout(r, 16));
      try {
        const doc = fixDoc(t.build());
        for (const s of doc.shapes) s.id = "tpl-" + t.id + "-" + s.id;
        const sc = 200 / Math.max(doc.w, doc.h);
        const c = R.render(doc, sc);
        const bg = makeCanvas(c.width, c.height), g = ctx2d(bg);
        g.fillStyle = "#fbfaf7"; g.fillRect(0, 0, bg.width, bg.height); g.drawImage(c, 0, 0);
        this.tplThumbs.set(t.id, bg.toDataURL("image/png"));
        for (const s of doc.shapes) { R.rasters.delete(s.id); R.rasters.delete(s.id + "#k"); }
        for (const card of this.root.querySelectorAll(`[data-tpl="${t.id}"] .gm-tplimg`)) put(card, el("img", { src: this.tplThumbs.get(t.id), alt: "" }));
      } catch (e) { console.warn("template thumb", t.id, e); }
    }
    this.renderPhotos();
  }

  /* ------------------------------------------------------- Photos pane */
  renderPhotos() {
    const P = this.ui.panes.photos;
    if (!P) return;
    const sel = this.selShape();
    const target = sel && this.fillable(sel) ? sel : null;
    const actions = el("div", { class: "gm-actions" },
      tbtn(I.photo, "Add photos", () => this.ui.file.click(), "gm-accentish"),
      isTouch() ? tbtn(I.camera, "Take photo", () => this.ui.cam.click()) : null,
      this.o.getDesigns ? tbtn(I.designs, "From my designs", () => { this.showDesigns = !this.showDesigns; this.renderPhotos(); }, this.showDesigns ? "on" : "") : null);
    const hint = el("p", { class: "gm-note" }, target ? `Tap a photo to put it in the selected ${shapeName(target).toLowerCase()}.` : "Tap a photo to place it on the canvas — or select a shape first to put it inside.");
    const used = sel?.fill?.photo;
    const tile = (id, url, name, removable) => el("div", { class: "gm-ptile" + (used === id ? " on" : "") },
      el("button", { type: "button", class: "gm-pimg", title: name, onclick: () => this.usePhoto(id) }, url ? el("img", { src: url, alt: name }) : el("span", { class: "gm-pload" })),
      el("span", { class: "gm-pname" }, name),
      removable ? el("button", { type: "button", class: "gm-px", title: "Remove from tray", "aria-label": "Remove " + name, onclick: () => this.removeFromTray(id), html: I.close }) : null);
    const mine = this.tray.map((id) => this.photos.get(id)).filter(Boolean);
    const kids = [this.section("Your photos", actions, hint,
      mine.length ? el("div", { class: "gm-pgrid" }, mine.map((ph) => tile(ph.id, ph.thumb, ph.name, true)))
        : el("div", { class: "gm-dropzone", onclick: () => this.ui.file.click() }, el("span", { html: I.photo, class: "gm-ic" }), el("span", {}, "Add photos of animals, flowers, landscapes… or drop them here")))];
    if (this.showDesigns && this.o.getDesigns) {
      let list = [];
      try { list = this.o.getDesigns() || []; } catch { list = []; }
      kids.push(this.section("My designs", list.length ? el("div", { class: "gm-pgrid" }, list.slice(0, 60).map((d) =>
        el("div", { class: "gm-ptile" }, el("button", { type: "button", class: "gm-pimg", title: d.name, onclick: () => this.useDesign(d) }, d.thumb ? el("img", { src: d.thumb, alt: d.name }) : null), el("span", { class: "gm-pname" }, d.name || "Design"))))
        : el("p", { class: "gm-note" }, "No saved designs yet.")));
    }
    kids.push(this.section("Samples", el("p", { class: "gm-note" }, "Built-in pictures to try the effects with."),
      el("div", { class: "gm-pgrid" }, SAMPLES.map((s) => tile(s.id, this.sampleThumbs.get(s.id), s.name, false)))));
    // background removal for the selected shape's photo
    const ph = used ? this.photo(used) : null;
    if (ph && ph.kind !== "sample") kids.splice(1, 0, this.section("Selected photo", this.bgControls(ph)));
    put(P, ...kids);
  }
  async useDesign(d) {
    try {
      this.busy(true, "Loading design…");
      const c = await this.o.getDesignCanvas(d.id);
      this.busy(false);
      if (!c) throw new Error("no canvas");
      const existing = [...this.photos.values()].find((p) => p.kind === "design" && p.designId === d.id);
      const ph = existing || this.ingest(c, d.name || "Design", "design");
      ph.designId = d.id;
      this.usePhoto(ph.id);
      this.renderPhotos();
    } catch (e) { this.busy(false); this.toast("Couldn't load that design"); }
  }
  bgControls(ph) {
    return el("div", { class: "gm-bg" },
      this.toggle("Remove plain background", ph.useCut, (on) => this.withBusy("Removing background…", () => this.setCut(ph, on)), false, "For animals & flowers shot on a simple backdrop"),
      ph.useCut ? this.slider("Tolerance", Math.round(ph.tol * 100), { min: 4, max: 45, step: 1, live: false, fmt: (v) => v + "%" }, (v) => this.withBusy("Removing background…", () => this.setCut(ph, true, v / 100))) : null);
  }
  withBusy(text, fn) {
    this.busy(true, text);
    setTimeout(() => { try { fn(); } finally { this.busy(false); } }, 30);
  }

  /* -------------------------------------------------------- Style pane */
  renderStyle() {
    const P = this.ui.panes.style;
    const sh = this.selShape();
    if (!sh) {
      put(P, el("div", { class: "gm-emptyp" },
        el("span", { html: I.style, class: "gm-ic gm-big" }),
        el("p", {}, this.doc.shapes.length ? "Tap a shape on the canvas to style it." : "Add a shape or pick a template to start."),
        el("div", { class: "gm-actions" }, tbtn(I.shapes, "Add a shape", () => this.compact ? this.setSheet("shapes") : this.setTab("left", "shapes")))));
      return;
    }
    const re = () => { this.renderStyle(); this.renderEffects(); this.renderSelbar(); };
    const set = (fn, rerender = false) => (v) => { fn(v); this.changed(); if (rerender) { this.commit(); re(); } };
    const def = SHAPES[sh.type];
    const kids = [];
    kids.push(el("div", { class: "gm-shead" }, el("span", { html: sh.type === "image" ? I.photo : shapeIconSVG(sh.type, 26) }), el("b", {}, shapeName(sh)),
      el("div", { class: "gm-spacer" }), ibtn(I.duplicate, "Duplicate (Ctrl+D)", () => this.duplicate()), ibtn(I.trash, "Delete", () => this.remove(), { class: "gm-danger" })));

    // ---- shape
    const shapeKids = [];
    for (const p of def.params || []) {
      const v = sh.p[p.key] ?? p.def;
      if (p.type === "select") shapeKids.push(el("div", { class: "gm-row" }, el("span", { class: "gm-rl" }, p.label), this.seg(p.choices, v, (x) => { sh.p[p.key] = x; this.commit(); this.changed(); re(); }, "gm-wrap")));
      else if (p.type === "bool") shapeKids.push(this.toggle(p.label, v, (x) => { sh.p[p.key] = x; this.changed(); this.commit(); }));
      else shapeKids.push(this.slider(p.label, v, { min: p.min, max: p.max, step: p.step, fmt: (x) => (p.step >= 1 ? x : Math.round(x * 100) + "%") }, (x) => { sh.p[p.key] = x; }));
    }
    const maxS = Math.max(this.doc.w, this.doc.h) * 1.6;
    shapeKids.push(
      this.slider("Size", Math.round(Math.max(sh.w, sh.h)), { min: 16, max: Math.round(maxS), step: 1 }, (v) => { const k = v / Math.max(sh.w, sh.h); sh.w = Math.max(4, sh.w * k); sh.h = Math.max(4, sh.h * k); }),
      el("div", { class: "gm-two" },
        this.slider("Width", Math.round(sh.w), { min: 8, max: Math.round(maxS), step: 1 }, (v) => { sh.w = v; }),
        this.slider("Height", Math.round(sh.h), { min: 4, max: Math.round(maxS), step: 1 }, (v) => { sh.h = v; })),
      this.slider("Rotation", Math.round(sh.rot || 0), { min: -180, max: 180, step: 1, fmt: (v) => v + "°" }, (v) => { sh.rot = v; }),
      el("div", { class: "gm-actions" },
        tbtn(I.centerH, "Center ↔", () => this.align("h")), tbtn(I.centerV, "Center ↕", () => this.align("v")),
        tbtn(I.forward, "Forward", () => this.order(1)), tbtn(I.backward, "Back", () => this.order(-1))));
    kids.push(this.section("Shape", ...shapeKids));

    // ---- fill
    if (this.fillable(sh)) {
      const f = sh.fill;
      const fk = [];
      const kinds = sh.type === "image" ? [["photo", "Photo"]] : [["none", "None"], ["ink", "Solid ink"], ["photo", "Photo"], ["pattern", "Pattern"]];
      if (sh.type !== "image") fk.push(this.seg(kinds, f.kind, (k) => {
        f.kind = k;
        if (k === "photo" && !f.photo) { const first = this.tray[0] || "sample:wolf"; this.setPhoto(sh, first); }
        this.commit(); this.changed(); re(); this.renderPhotos();
      }));
      if (f.kind === "photo") fk.push(...this.photoControls(sh, re));
      if (f.kind === "pattern") {
        fk.push(el("div", { class: "gm-chips" }, PATTERNS.map(([k, l]) => el("button", { type: "button", class: "gm-chip" + (f.pattern === k ? " on" : ""), onclick: () => { f.pattern = k; this.commit(); this.changed(); re(); } }, l))),
          this.slider("Spacing", f.pscale, { min: 3, max: 60, step: 0.5 }, (v) => { f.pscale = v; }),
          this.slider("Line / dot weight", f.pweight, { min: 0.5, max: 12, step: 0.1 }, (v) => { f.pweight = v; }),
          this.slider(f.pattern === "fade" ? "Fade direction" : "Angle", f.pangle, { min: -180, max: 180, step: 1, fmt: (v) => v + "°" }, (v) => { f.pangle = v; }));
      }
      kids.push(this.section("Fill", ...fk));
    }

    // ---- ink
    const inkRow = el("div", { class: "gm-swatches" }, INKS.map((c) => el("button", { type: "button", class: "gm-swatch" + (sh.ink === c ? " on" : ""), style: `--c:${c}`, title: c, "aria-label": "Ink " + c, onclick: () => { sh.ink = c; this.commit(); this.changed(); re(); } })),
      el("label", { class: "gm-swatch gm-custom", title: "Custom ink colour" }, el("input", { type: "color", value: sh.ink, onchange: (e) => { sh.ink = e.target.value; this.commit(); this.changed(); re(); } })));
    kids.push(this.section("Ink colour", inkRow, this.doc.look !== "design" ? el("p", { class: "gm-note" }, "The tattoo look is set to " + TATTOO_LOOKS.find((t) => t[0] === this.doc.look)[1].toLowerCase() + ", so everything shows in black.") : null));

    // ---- outline
    const L = sh.line;
    const ok = [this.slider("Line weight", L.w, { min: 0, max: 30, step: 0.5, fmt: (v) => (v ? v : "none") }, (v) => { L.w = v; })];
    ok.push(this.seg([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]], L.style || "solid", (v) => { L.style = v; this.commit(); this.changed(); re(); }));
    const g = shapeGeom(sh);
    if (g.regions.length && g.strokeRegions) {
      ok.push(this.toggle("Double line", L.double, (v) => { L.double = v; this.commit(); this.changed(); re(); }));
      if (L.double) ok.push(this.slider("Gap", L.gap, { min: 2, max: 80, step: 1 }, (v) => { L.gap = v; }));
      ok.push(this.slider("Offset outline", L.offset, { min: 0, max: 90, step: 1, fmt: (v) => (v ? v : "off") }, (v) => { L.offset = v; }));
      if (L.double || L.offset) ok.push(this.slider("Second line weight", Math.round((L.thin ?? 0.5) * 100), { min: 15, max: 150, step: 5, fmt: (v) => v + "%" }, (v) => { L.thin = v / 100; }));
    }
    if (g.verts.length) ok.push(this.slider("Dots at corners", L.vdots, { min: 0, max: 30, step: 0.5, fmt: (v) => (v ? v : "off") }, (v) => { L.vdots = v; }));
    kids.push(this.section("Outline", ...ok));

    // ---- layer
    kids.push(this.section("Layer",
      this.slider("Opacity", Math.round((sh.opacity ?? 1) * 100), { min: 5, max: 100, step: 1, fmt: (v) => v + "%" }, (v) => { sh.opacity = v / 100; }),
      this.toggle("Hide lines behind this shape", sh.knock, (v) => { sh.knock = v; this.commit(); this.changed(); re(); }, false, "Erases what's underneath, with a gap"),
      sh.knock ? this.slider("Gap around it", sh.knockGap ?? 10, { min: 0, max: 60, step: 1 }, (v) => { sh.knockGap = v; }) : null,
      this.toggle("Lock (can't be moved)", sh.locked, (v) => { sh.locked = v; this.commit(); this.renderLayers(); })));
    put(P, ...kids);
  }

  photoControls(sh, re) {
    const f = sh.fill;
    const out = [];
    const ph = this.photo(f.photo);
    // photo picker strip
    const strip = el("div", { class: "gm-strip" },
      el("button", { type: "button", class: "gm-stripadd", title: "Add photos", onclick: () => this.ui.file.click() }, el("span", { html: I.plus, class: "gm-ic" })),
      [...this.tray.map((id) => this.photos.get(id)).filter(Boolean), ...SAMPLES.map((s) => ({ id: s.id, name: s.name, thumb: this.sampleThumbs.get(s.id) }))].map((p) =>
        el("button", { type: "button", class: "gm-stripimg" + (p.id === f.photo ? " on" : ""), title: p.name, onclick: () => { this.setPhoto(sh, p.id); this.commit(); this.changed(); re(); this.renderPhotos(); } },
          p.thumb ? el("img", { src: p.thumb, alt: p.name }) : el("span", {}, p.name.slice(0, 2)))));
    out.push(strip);
    if (!ph) return out;
    out.push(el("div", { class: "gm-actions" },
      el("button", { type: "button", class: "gm-btn" + (this.adjust ? " on" : ""), onclick: () => this.setAdjust(!this.adjust) }, el("span", { html: I.hand, class: "gm-ic" }), el("span", {}, this.adjust ? "Done adjusting" : "Adjust photo")),
      tbtn(I.flip, "Flip", () => { f.flip = !f.flip; this.commit(); this.changed(); }),
      tbtn(I.reset, "Reset", () => { f.px = 0; f.py = 0; f.zoom = 1; f.prot = 0; f.flip = false; this.commit(); this.changed(); re(); })));
    out.push(
      this.slider("Photo zoom", Math.round((f.zoom || 1) * 100), { min: 20, max: 600, step: 1, fmt: (v) => v + "%" }, (v) => { f.zoom = v / 100; }),
      this.slider("Photo rotation", Math.round(f.prot || 0), { min: -180, max: 180, step: 1, fmt: (v) => v + "°" }, (v) => { f.prot = v; }));
    out.push(el("div", { class: "gm-rl" }, "Photo look"), el("div", { class: "gm-chips" }, LOOKS.map(([k, l]) =>
      el("button", { type: "button", class: "gm-chip" + (f.look === k ? " on" : "") + (GEO_LOOKS.has(k) ? " geo" : ""), onclick: () => this.withBusy("Applying " + l.toLowerCase() + "…", () => { f.look = k; this.commit(); this.changed(); re(); this.drawNow(); }) }, l))));
    const fx = f.fx;
    const fxs = (label, key, o) => this.slider(label, o.scale ? Math.round(fx[key] * o.scale) : fx[key], { ...o, live: false, min: o.min, max: o.max }, (v) => { fx[key] = o.scale ? v / o.scale : v; });
    if (f.look === "bw") out.push(fxs("Contrast", "contrast", { min: 0, max: 100, scale: 100, fmt: (v) => v + "%" }));
    if (f.look === "line" || f.look === "stencil") out.push(fxs("Detail", "detail", { min: 0, max: 100, scale: 100, fmt: (v) => v + "%" }));
    if (f.look === "dots") out.push(fxs("Dot size", "dotSize", { min: 2, max: 12, step: 0.5 }), fxs("Contrast", "contrast", { min: 0, max: 100, scale: 100, fmt: (v) => v + "%" }));
    if (f.look === "posterize") out.push(fxs("Tones", "levels", { min: 2, max: 7, step: 1 }));
    if (GEO_LOOKS.has(f.look)) out.push(el("div", { class: "gm-actions" }, tbtn(I.effects, "Effect settings", () => this.compact ? this.setSheet("effects") : this.setTab("right", "effects"), "gm-accentish")));
    if (ph.kind !== "sample") out.push(this.bgControls(ph));
    const alpha = ph.useCut || ph.alpha;
    out.push(this.toggle("Pop out of the shape", f.breakout, (v) => { f.breakout = v; this.commit(); this.changed(); re(); }, !alpha, alpha ? "The top of the subject overlaps the outline" : "Remove the background first"));
    if (f.breakout && alpha) out.push(this.slider("Pop-out line", Math.round((f.breakY ?? 0.15) * 100), { min: -100, max: 100, step: 1, fmt: (v) => v + "%" }, (v) => { f.breakY = v / 100; }));
    return out;
  }

  /* ------------------------------------------------------ Effects pane */
  renderEffects() {
    const P = this.ui.panes.effects;
    const sh = this.selShape();
    const target = sh && sh.fill.kind === "photo" && sh.fill.photo ? sh : null;
    const cur = target ? target.fill.look : null;
    const re = () => { this.renderEffects(); this.renderStyle(); };
    const kids = [];
    const cards = el("div", { class: "gm-fxgrid" }, EFFECTS.map(([k, label, icon]) =>
      el("button", { type: "button", class: "gm-fxcard" + ((cur === k || (k === "original" && cur && !GEO_LOOKS.has(cur))) ? " on" : ""), onclick: () => this.pickEffect(k) },
        el("span", { html: icon, class: "gm-ic" }), el("span", {}, label))));
    kids.push(this.section("Geometric effects", target ? null : el("p", { class: "gm-note" }, this.tray.length || this.doc.shapes.some((s) => s.fill.photo) ? "Select a shape with a photo — or tap an effect to apply it to your latest photo." : "Add a photo (or use a sample), then tap an effect."), cards));
    if (target && GEO_LOOKS.has(cur)) {
      const fx = target.fill.fx;
      const pct = { min: 0, max: 100, scale: 100, fmt: (v) => v + "%" };
      const S = (label, key, o) => this.slider(label, o.scale ? Math.round((fx[key] ?? 0) * o.scale) : fx[key], { step: 1, ...o, live: false }, (v) => { fx[key] = o.scale ? v / o.scale : v; });
      const SEG = (label, key, opts) => el("div", { class: "gm-row" }, el("span", { class: "gm-rl" }, label), this.seg(opts, fx[key], (v) => this.withBusy("Updating…", () => { fx[key] = v; this.commit(); this.changed(); re(); this.drawNow(); }), "gm-wrap"));
      const shuffle = el("div", { class: "gm-actions" }, tbtn(I.shuffle, "Shuffle shapes", () => this.withBusy("Updating…", () => { fx.seed = (fx.seed || 1) + 1; this.commit(); this.changed(); this.drawNow(); })));
      const p = [];
      if (cur === "lowpoly") {
        p.push(S("Detail", "detail", pct), SEG("Colour", "color", [["color", "Colour"], ["grey", "Black & grey"]]), SEG("Wire lines", "wire", [["none", "None"], ["light", "Light"], ["dark", "Ink"]]));
        if (fx.wire && fx.wire !== "none") p.push(S("Line weight", "lineW", { min: 0.5, max: 6, step: 0.1 }), S("Dots at corners", "vdots", { min: 0, max: 8, step: 0.5 }));
      } else if (cur === "half") {
        p.push(SEG("Realistic side", "sideA", [["photo", "Photo"], ["bw", "Black & grey"], ["line", "Line art"], ["dots", "Dotwork"]]),
          SEG("Geometric side", "sideB", [["wire", "Wireframe"], ["lowpoly", "Low-poly"], ["both", "Both"]]),
          S("Split angle", "angle", { min: -180, max: 180, fmt: (v) => v + "°" }),
          S("Split position", "pos", pct),
          S("Ragged edge", "trans", pct),
          S("Detail", "detail", pct));
        if (fx.sideB !== "lowpoly") p.push(S("Line weight", "lineW", { min: 0.5, max: 6, step: 0.1 }), S("Dots at corners", "vdots", { min: 0, max: 8, step: 0.5 }));
        if (fx.sideB === "wire") p.push(S("Shading", "shade", pct));
        if (fx.sideB !== "wire") p.push(SEG("Colour", "color", [["color", "Colour"], ["grey", "Black & grey"]]));
        p.push(el("div", { class: "gm-actions" }, tbtn(I.swap, "Swap sides", () => this.withBusy("Updating…", () => { fx.angle = ((fx.angle || 0) + 360) % 360 - 180; fx.pos = 1 - (fx.pos ?? 0.5); this.commit(); this.changed(); re(); this.drawNow(); }))));
      } else if (cur === "mosaic") {
        p.push(S("Cells", "detail", pct), S("Gap", "gap", { min: 0, max: 8, step: 0.25 }), SEG("Colour", "color", [["color", "Colour"], ["grey", "Black & grey"]]), SEG("Cell lines", "wire", [["none", "None"], ["light", "Light"], ["dark", "Ink"]]));
      } else if (cur === "shatter") {
        p.push(S("Pieces", "detail", pct), S("Spread", "spread", pct), S("Direction", "angle", { min: -180, max: 180, fmt: (v) => v + "°" }), S("Starts at", "pos", pct),
          SEG("Picture", "sideA", [["photo", "Photo"], ["bw", "Black & grey"], ["line", "Line art"], ["dots", "Dotwork"]]));
      } else if (cur === "wire") {
        p.push(S("Detail", "detail", pct), S("Line weight", "lineW", { min: 0.5, max: 6, step: 0.1 }), S("Dots at corners", "vdots", { min: 0, max: 8, step: 0.5 }), S("Shading", "shade", pct));
      }
      p.push(shuffle);
      kids.push(this.section(EFFECTS.find((e) => e[0] === cur)[1], ...p));
    }
    if (target) {
      const ph = this.photo(target.fill.photo);
      if (ph && ph.kind !== "sample") kids.push(this.section("Background", this.bgControls(ph)));
      else if (ph) kids.push(el("p", { class: "gm-note" }, "Using the sample “" + ph.name + "”. Add your own photo and it swaps in."));
    }
    put(P, ...kids);
  }
  pickEffect(k) {
    let sh = this.selShape();
    if (!sh || sh.fill.kind !== "photo" || !sh.fill.photo) {
      const pid = this.tray[0] || (sh?.fill?.photo) || [...this.doc.shapes].reverse().find((s) => s.fill.photo)?.fill.photo || "sample:wolf";
      const existing = [...this.doc.shapes].reverse().find((s) => s.fill.kind === "photo" && s.fill.photo === pid);
      sh = existing || this.placeImage(pid, false);
      this.select(sh.id, false);
    }
    this.withBusy("Applying effect…", () => {
      sh.fill.look = k;
      if (k === "half" && !sh.fill.fx.sideA) sh.fill.fx.sideA = "bw";
      this.commit(); this.changed(true); this.drawNow();
    });
  }
  setAdjust(on) {
    const sh = this.selShape();
    this.adjust = !!(on && sh && sh.fill.kind === "photo" && sh.fill.photo);
    this.renderStyle(); this.renderSelbar(); this.draw();
  }

  /* ------------------------------------------------------- Layers pane */
  renderLayers() {
    const P = this.ui.panes.layers;
    const list = [...this.doc.shapes].reverse();
    const rows = list.map((s) => {
      const thumb = s.fill.kind === "photo" && s.fill.photo ? (this.photo(s.fill.photo)?.thumb || this.sampleThumbs.get(s.fill.photo)) : null;
      return el("div", { class: "gm-layer" + (s.id === this.sel ? " on" : "") + (s.hidden ? " hid" : ""), onclick: (e) => { if (!e.target.closest(".gm-ibtn")) this.select(s.id); } },
        el("span", { class: "gm-lthumb", html: thumb ? "" : shapeIconSVG(s.type === "image" ? "square" : s.type, 24) }, thumb ? el("img", { src: thumb, alt: "" }) : null),
        el("span", { class: "gm-lname" }, shapeName(s), s.fill.kind === "photo" && s.fill.look !== "original" ? el("small", {}, LOOKS.find((l) => l[0] === s.fill.look)?.[1]) : null),
        s.locked ? el("span", { html: I.lock, class: "gm-ic gm-lock", title: "Locked" }) : null,
        ibtn(s.hidden ? I.eyeOff : I.eye, s.hidden ? "Show" : "Hide", () => { s.hidden = !s.hidden; this.commit(); this.changed(true); }),
        ibtn(I.up, "Bring forward", () => { this.sel = s.id; this.order(1); }),
        ibtn(I.down, "Send backward", () => { this.sel = s.id; this.order(-1); }));
    });
    put(P, 
      this.section("Layers", rows.length ? el("div", { class: "gm-layers" }, rows) : el("p", { class: "gm-note" }, "No shapes yet.")),
      this.section("Canvas",
        el("div", { class: "gm-row" }, el("span", { class: "gm-rl" }, "Shape"), this.seg(Object.entries(ASPECTS).map(([k, a]) => [k, a.label]), this.doc.aspect, (v) => this.setAspect(v), "gm-wrap")),
        el("div", { class: "gm-row" }, el("span", { class: "gm-rl" }, "Preview on"), this.seg(PREVIEWS, this.prefs.preview, (v) => { this.prefs.preview = v; writePrefs(this.prefs); this.renderLayers(); this.draw(); })),
        this.toggle("Snap to centre & guides", this.prefs.snap, (v) => { this.prefs.snap = v; writePrefs(this.prefs); }),
        el("div", { class: "gm-actions" }, tbtn(I.trash, "Clear canvas", () => this.clearAll(), "gm-danger"))));
  }

  /* ----------------------------------------------- stage UI bits */
  renderSelbar() {
    const b = this.ui.selbar, sh = this.selShape();
    b.hidden = !sh || (this.compact && !!this.sheet);
    if (!sh) { this.ui.hint.hidden = true; return; }
    const hasPhoto = sh.fill.kind === "photo" && sh.fill.photo;
    put(b, 
      hasPhoto ? el("button", { type: "button", class: "gm-sbtn" + (this.adjust ? " on" : ""), onclick: () => this.setAdjust(!this.adjust), title: "Move / zoom the photo inside the shape" }, el("span", { html: this.adjust ? I.check : I.hand, class: "gm-ic" }), el("span", {}, this.adjust ? "Done" : "Adjust photo")) : null,
      ibtn(I.duplicate, "Duplicate", () => this.duplicate()),
      ibtn(I.forward, "Bring forward", () => this.order(1)),
      ibtn(I.backward, "Send backward", () => this.order(-1)),
      ibtn(I.center, "Center on canvas", () => this.align("both")),
      ibtn(I.trash, "Delete", () => this.remove(), { class: "gm-danger" }));
    this.ui.hint.hidden = !this.adjust;
    this.ui.hint.textContent = isTouch() ? "Drag to move the photo · pinch to zoom & turn it" : "Drag to move the photo · scroll to zoom · Esc when done";
  }
  renderEmpty() {
    const E = this.ui.empty;
    const empty = !this.doc.shapes.length;
    E.hidden = !empty;
    if (!empty) return;
    put(E, el("div", { class: "gm-emptycard" },
      el("h3", {}, "Make a geometric tattoo"),
      el("p", {}, "Start from a template, then swap in your own photos — or build it shape by shape."),
      el("div", { class: "gm-tplrow gm-tplrow-empty" }, TEMPLATES.map((t) => this.tplCard(t))),
      el("div", { class: "gm-actions gm-center" },
        tbtn(I.shapes, "Add a shape", () => this.compact ? this.setSheet("shapes") : this.setTab("left", "shapes")),
        tbtn(I.photo, "Add photos", () => this.ui.file.click(), "gm-accentish"))));
  }

  /* ---------------------------------------------------------- output */
  output(kind) {
    if (!this.doc.shapes.some((s) => !s.hidden)) { this.toast("Add a shape or a template first"); return; }
    const cb = { use: this.o.onUse, save: this.o.onSave, sketch: this.o.onSketch, export: this.o.onExport }[kind];
    this.busy(true, "Rendering…");
    setTimeout(() => {
      let canvas = null;
      try { canvas = this.renderer.exportDoc(this.doc); } catch (e) { console.error(e); }
      this.busy(false);
      this.changed();
      if (!canvas) { this.toast("Nothing to export yet"); return; }
      const name = this.docName();
      if (typeof cb === "function") { try { cb(canvas, name); } catch (e) { console.error(e); this.toast("Something went wrong"); } }
      else this.toast("Not available here");
    }, 30);
  }
  docName() {
    if (this.name) return this.name;
    const ph = this.doc.shapes.map((s) => this.photo(s.fill.photo)).find((p) => p && p.kind !== "sample");
    return ph ? "Geometric " + ph.name.toLowerCase() : "Geometric design";
  }

  /* ---------------------------------------------------------- drawing */
  changed(structural = false) {
    this.compDirty = true;
    if (structural) { this.renderer.prune(this.doc); this.renderPanels(); }
    this.draw();
  }
  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.drawNow(); });
  }
  colors() {
    if (this._colors) return this._colors;
    // resolve the theme colours through a probe element (always rgb()), then shade the stage in JS
    const probe = el("div", { style: "position:absolute;width:0;height:0;visibility:hidden;background:var(--gm-bg);color:var(--gm-accent)" });
    this.root.appendChild(probe);
    const cs = getComputedStyle(probe);
    const parse = (c) => { const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c || ""); return m ? [+m[1], +m[2], +m[3]] : null; };
    const bg = parse(cs.backgroundColor) || [18, 18, 21];
    const accent = parse(cs.color);
    probe.remove();
    const light = (bg[0] + bg[1] + bg[2]) / 3 > 128;
    const k = light ? 0.9 : 0.86;
    this._colors = {
      stage: `rgb(${Math.round(bg[0] * k)},${Math.round(bg[1] * k)},${Math.round(bg[2] * k)})`,
      accent: accent ? `rgb(${accent.join(",")})` : "#e0455f",
    };
    return this._colors;
  }
  viewXf() {
    const cv = this.ui.cv;
    const W = cv.clientWidth, H = cv.clientHeight;
    const roomy = H > 420;
    const px = this.compact ? 14 : 40, pt = roomy ? (this.compact ? 62 : 64) : 12, pb = roomy ? (this.compact ? 52 : 40) : 12;
    const fs = Math.min((W - px * 2) / this.doc.w, (H - pt - pb) / this.doc.h);
    const vs = Math.max(0.02, fs * this.view.zoom);
    const ox = W / 2 - (this.doc.w * vs) / 2 + this.view.panX;
    const oy = pt + (H - pt - pb) / 2 - (this.doc.h * vs) / 2 + this.view.panY;
    return { W, H, vs, ox, oy, fs };
  }
  drawNow() {
    const cv = this.ui.cv;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    const X = this.viewXf();
    const col = this.colors();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.stage; g.fillRect(0, 0, W, H);
    // artboard
    const aw = this.doc.w * X.vs, ah = this.doc.h * X.vs;
    g.save();
    g.shadowColor = "rgba(0,0,0,.28)"; g.shadowBlur = 18; g.shadowOffsetY = 4;
    const pv = this.prefs.preview;
    g.fillStyle = pv === "skin" ? "#e2b597" : "#fbfaf7";
    g.fillRect(X.ox, X.oy, aw, ah);
    g.restore();
    if (pv === "clear") {
      g.save(); g.beginPath(); g.rect(X.ox, X.oy, aw, ah); g.clip();
      g.fillStyle = "#e9e7e3";
      const cs = 12;
      for (let y = 0; y < ah; y += cs) for (let x = ((y / cs) % 2) * cs; x < aw; x += cs * 2) g.fillRect(X.ox + x, X.oy + y, cs, cs);
      g.restore();
    } else if (pv === "skin") {
      const gr = g.createRadialGradient(X.ox + aw / 2, X.oy + ah * 0.4, 0, X.ox + aw / 2, X.oy + ah / 2, Math.max(aw, ah) * 0.75);
      gr.addColorStop(0, "rgba(255,230,210,.25)"); gr.addColorStop(1, "rgba(120,70,50,.18)");
      g.fillStyle = gr; g.fillRect(X.ox, X.oy, aw, ah);
    }
    // composite
    const steps = [0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];
    const need = X.vs * dpr;
    const rs = steps.find((s) => s >= need * 0.92) || 2;
    if (this.compDirty || rs !== this.compScale || !this.comp) {
      try { this.comp = this.renderer.render(this.doc, rs); } catch (e) { console.error("geo render", e); }
      this.compScale = rs; this.compDirty = false;
    }
    if (this.comp) {
      g.save();
      g.imageSmoothingQuality = "high";
      if (pv === "skin") g.globalCompositeOperation = "multiply";
      g.drawImage(this.comp, X.ox, X.oy, aw, ah);
      g.restore();
    }
    // artboard edge
    g.strokeStyle = "rgba(128,128,140,.35)"; g.lineWidth = 1;
    g.strokeRect(X.ox + 0.5, X.oy + 0.5, aw - 1, ah - 1);
    // guides
    if (this.guides.length) {
      g.save(); g.strokeStyle = col.accent; g.lineWidth = 1; g.setLineDash([5, 4]);
      for (const [axis, v] of this.guides) {
        g.beginPath();
        if (axis === "x") { const x = X.ox + v * X.vs; g.moveTo(x, X.oy - 20); g.lineTo(x, X.oy + ah + 20); }
        else { const y = X.oy + v * X.vs; g.moveTo(X.ox - 20, y); g.lineTo(X.ox + aw + 20, y); }
        g.stroke();
      }
      g.restore();
    }
    // selection
    const sh = this.selShape();
    if (sh && !sh.hidden) this.drawSelection(g, sh, X, col);
    this.ui.zoomLbl.textContent = Math.round(X.vs / X.fs * 100) + "%";
  }
  toScreen(sh, lx, ly, X) {
    const a = (sh.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
    return [X.ox + (sh.x + lx * c - ly * s) * X.vs, X.oy + (sh.y + lx * s + ly * c) * X.vs];
  }
  handles(sh, X) {
    const pad = 6 / X.vs;
    const hw = sh.w / 2 + pad, hh = Math.max(sh.h / 2 + pad, 10 / X.vs);
    const H = {
      nw: [-hw, -hh], ne: [hw, -hh], se: [hw, hh], sw: [-hw, hh],
      e: [hw, 0], w: [-hw, 0],
    };
    if (sh.h * X.vs > 26) { H.n = [0, -hh]; H.s = [0, hh]; }
    H.rot = [0, -hh - 30 / X.vs];
    const out = {};
    for (const [k, [lx, ly]] of Object.entries(H)) out[k] = this.toScreen(sh, lx, ly, X);
    return { out, hw, hh };
  }
  drawSelection(g, sh, X, col) {
    const { out, hw, hh } = this.handles(sh, X);
    g.save();
    if (this.adjust) {
      const fr = this.renderer.photoFrame(sh);
      if (fr) {
        // ghost of the photo outside the shape
        const ph = this.photo(sh.fill.photo);
        const src = ph.useCut && ph.cut ? ph.cut : ph.src;
        g.save();
        const a = (sh.rot || 0) * DEG;
        g.translate(X.ox + sh.x * X.vs, X.oy + sh.y * X.vs); g.rotate(a); g.scale(X.vs, X.vs);
        const outside = new Path2D(); outside.rect(-1e5, -1e5, 2e5, 2e5);
        for (const r of shapeGeom(sh).regions) { r.forEach(([x, y], i) => (i ? outside.lineTo(x, y) : outside.moveTo(x, y))); outside.closePath(); }
        g.clip(outside, "evenodd");
        const f = sh.fill;
        const k = Math.max(sh.w / src.width, sh.h / src.height) * (f.zoom || 1);
        g.translate((f.px || 0) * sh.w, (f.py || 0) * sh.h); g.rotate((f.prot || 0) * DEG); g.scale(k * (f.flip ? -1 : 1), k);
        g.globalAlpha = 0.35;
        g.drawImage(src, -src.width / 2, -src.height / 2);
        g.restore();
        g.strokeStyle = col.accent; g.lineWidth = 1.5; g.setLineDash([6, 4]);
        g.beginPath();
        fr.forEach(([x, y], i) => { const p = this.toScreen(sh, x, y, X); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
        g.closePath(); g.stroke();
        g.setLineDash([]);
        for (const [x, y] of fr) { const p = this.toScreen(sh, x, y, X); g.fillStyle = col.accent; g.beginPath(); g.arc(p[0], p[1], 4, 0, Math.PI * 2); g.fill(); }
      }
      g.restore();
      return;
    }
    g.strokeStyle = col.accent; g.lineWidth = 1.5; g.setLineDash(sh.locked ? [4, 4] : []);
    g.beginPath();
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([x, y], i) => { const p = this.toScreen(sh, x, y, X); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.closePath(); g.stroke();
    g.setLineDash([]);
    if (!sh.locked) {
      const top = this.toScreen(sh, 0, -hh, X);
      g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(out.rot[0], out.rot[1]); g.stroke();
      const r = isTouch() ? 8 : 6;
      for (const [k, [x, y]] of Object.entries(out)) {
        g.fillStyle = "#fff"; g.strokeStyle = col.accent; g.lineWidth = 2;
        g.beginPath();
        if (k === "rot") g.arc(x, y, r + 1, 0, Math.PI * 2);
        else if (k.length === 2) g.rect(x - r, y - r, r * 2, r * 2);
        else g.arc(x, y, r - 1, 0, Math.PI * 2);
        g.fill(); g.stroke();
      }
      if (this.drag?.mode === "rotate") {
        g.fillStyle = col.accent; g.font = "600 12px system-ui, sans-serif";
        g.fillText(Math.round(sh.rot) + "°", out.rot[0] + 14, out.rot[1] + 4);
      }
    }
    g.restore();
  }

  /* --------------------------------------------------------- pointers */
  pt(e) { const r = this.ui.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  toDoc([sx, sy], X = this.viewXf()) { return [(sx - X.ox) / X.vs, (sy - X.oy) / X.vs]; }
  toLocal(sh, [dx, dy]) {
    const a = -(sh.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
    const x = dx - sh.x, y = dy - sh.y;
    return [x * c - y * s, x * s + y * c];
  }
  hitAt(d, X, touch) {
    const tol = (touch ? 14 : 7) / X.vs;
    for (let i = this.doc.shapes.length - 1; i >= 0; i--) {
      const s = this.doc.shapes[i];
      if (s.hidden) continue;
      const [lx, ly] = this.toLocal(s, d);
      if (hitShape(s, lx, ly, tol)) return s;
    }
    return null;
  }
  hitHandle(sh, p, X, touch) {
    if (sh.locked || this.adjust) return null;
    const { out } = this.handles(sh, X);
    const R = touch ? 22 : 11;
    let best = null, bd = R;
    for (const [k, [x, y]] of Object.entries(out)) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  onDown(e) {
    if (e.button !== undefined && e.button > 1) return;
    this.root.focus({ preventScroll: true });
    try { this.ui.cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = this.pt(e);
    this.pointers.set(e.pointerId, p);
    const X = this.viewXf();
    const touch = e.pointerType === "touch";
    if (this.pointers.size === 2) { this.startGesture(X); return; }
    if (this.pointers.size > 2) return;
    const d = this.toDoc(p, X);
    const sh = this.selShape();
    if (e.button === 1) { this.drag = { mode: "pan", p0: p, pan0: { ...this.view }, moved: true }; return; }
    let drag = null;
    if (sh) {
      const h = this.hitHandle(sh, p, X, touch);
      if (h) drag = { mode: h === "rot" ? "rotate" : "scale", h, s0: JSON.parse(JSON.stringify(sh)), d0: d };
      else if (this.adjust) {
        const [lx, ly] = this.toLocal(sh, d);
        if (hitShape(sh, lx, ly, 20 / X.vs) || this.inFrame(sh, lx, ly)) drag = { mode: "photo", f0: { ...sh.fill }, d0: d };
      }
    }
    if (!drag) {
      const hit = this.hitAt(d, X, touch);
      if (hit) {
        if (hit.id !== this.sel) this.select(hit.id);
        drag = hit.locked ? { mode: "none" } : { mode: "move", s0: { x: hit.x, y: hit.y }, d0: d };
      } else drag = { mode: "pan", p0: p, pan0: { ...this.view } };
    }
    drag.p0 = drag.p0 || p; drag.moved = false;
    this.drag = drag;
  }
  inFrame(sh, lx, ly) {
    const fr = this.renderer.photoFrame(sh);
    if (!fr) return false;
    let inside = false;
    for (let i = 0, j = fr.length - 1; i < fr.length; j = i++) {
      const [xi, yi] = fr[i], [xj, yj] = fr[j];
      if (((yi > ly) !== (yj > ly)) && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  onMove(e) {
    if (!this.pointers.has(e.pointerId)) {
      // hover cursor
      if (e.pointerType === "mouse") this.updateCursor(this.pt(e));
      return;
    }
    const p = this.pt(e);
    this.pointers.set(e.pointerId, p);
    if (this.gesture) { this.moveGesture(); return; }
    const D = this.drag;
    if (!D) return;
    if (!D.moved && Math.hypot(p[0] - D.p0[0], p[1] - D.p0[1]) < 3) return;
    D.moved = true;
    const X = this.viewXf();
    const d = this.toDoc(p, X);
    const sh = this.selShape();
    if (D.mode === "pan") { this.view.panX = D.pan0.panX + p[0] - D.p0[0]; this.view.panY = D.pan0.panY + p[1] - D.p0[1]; this.draw(); return; }
    if (!sh || D.mode === "none") return;
    if (D.mode === "move") {
      let x = D.s0.x + d[0] - D.d0[0], y = D.s0.y + d[1] - D.d0[1];
      this.guides = [];
      if (this.prefs.snap && !e.altKey) {
        const T = 8 / X.vs;
        const xs = [this.doc.w / 2, ...this.doc.shapes.filter((s) => s !== sh && !s.hidden).map((s) => s.x)];
        const ys = [this.doc.h / 2, ...this.doc.shapes.filter((s) => s !== sh && !s.hidden).map((s) => s.y)];
        const bx = xs.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b), Infinity);
        const by = ys.reduce((b, v) => (Math.abs(v - y) < Math.abs(b - y) ? v : b), Infinity);
        if (Math.abs(bx - x) < T) { x = bx; this.guides.push(["x", bx]); }
        if (Math.abs(by - y) < T) { y = by; this.guides.push(["y", by]); }
      }
      sh.x = x; sh.y = y;
      this.compDirty = true; this.draw();
    } else if (D.mode === "rotate") {
      const a0 = Math.atan2(D.d0[1] - D.s0.y, D.d0[0] - D.s0.x), a1 = Math.atan2(d[1] - D.s0.y, d[0] - D.s0.x);
      let r = D.s0.rot + (a1 - a0) / DEG;
      r = ((r + 540) % 360) - 180;
      if (!e.shiftKey) { const sn = Math.round(r / 45) * 45; if (Math.abs(sn - r) < 4) r = sn; }
      sh.rot = Math.round(r * 10) / 10;
      this.compDirty = true; this.draw();
    } else if (D.mode === "scale") {
      const s0 = D.s0;
      const l0 = this.toLocal(s0, D.d0), l1 = this.toLocal(s0, d);
      if (D.h.length === 2) {
        const len0 = Math.hypot(l0[0], l0[1]) || 1;
        const k = Math.max(0.03, (l1[0] * l0[0] + l1[1] * l0[1]) / (len0 * len0));
        sh.w = Math.max(6, s0.w * k); sh.h = Math.max(3, s0.h * k);
      } else if (D.h === "e" || D.h === "w") sh.w = Math.max(6, Math.abs(l1[0]) * 2 - 12 / X.vs);
      else sh.h = Math.max(3, Math.abs(l1[1]) * 2 - 12 / X.vs);
      this.compDirty = true; this.draw();
    } else if (D.mode === "photo") {
      const f = sh.fill;
      const a = -(sh.rot || 0) * DEG;
      const dx = d[0] - D.d0[0], dy = d[1] - D.d0[1];
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      f.px = D.f0.px + lx / sh.w; f.py = D.f0.py + ly / sh.h;
      this.compDirty = true; this.draw();
    }
  }
  onUp(e, cancel = false) {
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      if (this.pointers.size < 2) {
        const g = this.gesture; this.gesture = null;
        if (g.kind !== "view") { this.commit(); this.renderStyle(); }
        // continue as a pan with the remaining finger? keep it simple: stop
        this.drag = null;
      }
      return;
    }
    const D = this.drag;
    this.drag = null;
    this.guides = [];
    if (!D) return;
    if (!D.moved && !cancel) {
      if (D.mode === "pan") { if (this.sel) { this.select(null); } }
    } else if (D.moved && ["move", "rotate", "scale", "photo"].includes(D.mode)) {
      this.commit();
      this.renderStyle();
    }
    this.draw();
  }
  updateCursor(p) {
    const X = this.viewXf();
    const sh = this.selShape();
    let c = "default";
    if (sh) {
      const h = this.hitHandle(sh, p, X, false);
      if (h === "rot") c = "grab"; else if (h) c = ["e", "w"].includes(h) ? "ew-resize" : ["n", "s"].includes(h) ? "ns-resize" : ["nw", "se"].includes(h) ? "nwse-resize" : "nesw-resize";
    }
    if (c === "default") {
      if (this.adjust) c = "move";
      else if (this.hitAt(this.toDoc(p, X), X, false)) c = "move";
    }
    this.ui.cv.style.cursor = c;
  }
  startGesture(X) {
    const [a, b] = [...this.pointers.values()];
    const sh = this.selShape();
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const base = { d0: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, a0: Math.atan2(b[1] - a[1], b[0] - a[0]), m0: mid };
    // undo a single-finger drag that just started
    if (this.drag?.moved && this.drag.s0 && sh && this.drag.mode === "move") { sh.x = this.drag.s0.x; sh.y = this.drag.s0.y; }
    this.drag = null;
    if (sh && this.adjust) { this.gesture = { kind: "photo", ...base, f0: { ...sh.fill } }; return; }
    const da = this.toDoc(a, X), db = this.toDoc(b, X);
    const inside = (d) => { const [lx, ly] = this.toLocal(sh, d); return hitShape(sh, lx, ly, 30 / X.vs); };
    if (sh && !sh.locked && (inside(da) || inside(db))) { this.gesture = { kind: "shape", ...base, s0: { x: sh.x, y: sh.y, w: sh.w, h: sh.h, rot: sh.rot || 0 }, vs: X.vs }; return; }
    this.gesture = { kind: "view", ...base, v0: { ...this.view }, X0: X };
  }
  moveGesture() {
    const G = this.gesture;
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const k = d / G.d0, da = (ang - G.a0) / DEG;
    const sh = this.selShape();
    if (G.kind === "view") {
      const X0 = G.X0;
      const z = clamp(G.v0.zoom * k, 0.2, 12);
      // keep the doc point under the first midpoint under the current midpoint
      const docPt = [(G.m0[0] - X0.ox) / X0.vs, (G.m0[1] - X0.oy) / X0.vs];
      this.view.zoom = z; this.view.panX = 0; this.view.panY = 0;
      const B = this.viewXf();
      this.view.panX = mid[0] - docPt[0] * B.vs - B.ox;
      this.view.panY = mid[1] - docPt[1] * B.vs - B.oy;
    } else if (G.kind === "shape" && sh) {
      sh.w = Math.max(6, G.s0.w * k); sh.h = Math.max(3, G.s0.h * k);
      let r = G.s0.rot + da; const sn = Math.round(r / 45) * 45; if (Math.abs(sn - r) < 3) r = sn;
      sh.rot = ((r + 540) % 360) - 180;
      sh.x = G.s0.x + (mid[0] - G.m0[0]) / G.vs; sh.y = G.s0.y + (mid[1] - G.m0[1]) / G.vs;
      this.compDirty = true;
    } else if (G.kind === "photo" && sh) {
      const f = sh.fill;
      f.zoom = clamp(G.f0.zoom * k, 0.1, 10);
      f.prot = G.f0.prot + da;
      const X = this.viewXf();
      const ddx = (mid[0] - G.m0[0]) / X.vs, ddy = (mid[1] - G.m0[1]) / X.vs;
      const ra = -(sh.rot || 0) * DEG;
      f.px = G.f0.px + (ddx * Math.cos(ra) - ddy * Math.sin(ra)) / sh.w;
      f.py = G.f0.py + (ddx * Math.sin(ra) + ddy * Math.cos(ra)) / sh.h;
      this.compDirty = true;
    }
    this.draw();
  }
  onDbl(e) {
    const X = this.viewXf();
    const hit = this.hitAt(this.toDoc(this.pt(e), X), X, false);
    if (hit && hit.fill.kind === "photo" && hit.fill.photo) { this.select(hit.id, false); this.setAdjust(!this.adjust); }
  }
  onWheel(e) {
    e.preventDefault();
    const p = this.pt(e);
    const sh = this.selShape();
    if (this.adjust && sh) {
      const f = sh.fill;
      f.zoom = clamp((f.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 0.1, 10);
      this.compDirty = true; this.draw();
      clearTimeout(this._wheelT); this._wheelT = setTimeout(() => { this.commit(); this.renderStyle(); }, 350);
      return;
    }
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0 && !e.shiftKey && e.deltaMode === 1 || !e.shiftKey && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50) {
      this.zoomAt(p, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      this.view.panX -= e.shiftKey ? e.deltaY : e.deltaX;
      this.view.panY -= e.shiftKey ? 0 : e.deltaY;
      this.draw();
    }
  }
  zoomAt(p, f) {
    const X = this.viewXf();
    const docPt = this.toDoc(p, X);
    this.view.zoom = clamp(this.view.zoom * f, 0.2, 12);
    const vs = X.fs * this.view.zoom;
    this.view.panX = 0; this.view.panY = 0;
    const B = this.viewXf();
    this.view.panX = p[0] - docPt[0] * vs - B.ox;
    this.view.panY = p[1] - docPt[1] * vs - B.oy;
    this.draw();
  }
  zoomBy(f) { const X = this.viewXf(); this.zoomAt([X.W / 2, X.H / 2], f); }
  fit() { this.view = { zoom: 1, panX: 0, panY: 0 }; this.draw(); }

  onKey(e) {
    if (this.destroyed || !this.root.isConnected || !this.root.offsetParent) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.type === "range" && (e.ctrlKey || e.metaKey))) return;
    // only when the maker (or the page body) has focus
    if (t && t !== document.body && !this.root.contains(t)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const sh = this.selShape();
    if (mod && (k === "z" || k === "Z")) { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && (k === "y" || k === "Y")) { e.preventDefault(); this.redo(); return; }
    if (mod && (k === "d" || k === "D")) { e.preventDefault(); this.duplicate(); return; }
    if (k === "Escape") { if (this.adjust) this.setAdjust(false); else if (sh) this.select(null); return; }
    if (!sh) return;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); this.remove(); return; }
    const step = e.shiftKey ? 10 : 1;
    const nud = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
    if (nud) {
      e.preventDefault();
      if (this.adjust) { sh.fill.px += nud[0] / sh.w; sh.fill.py += nud[1] / sh.h; }
      else if (!sh.locked) { sh.x += nud[0]; sh.y += nud[1]; }
      this.compDirty = true; this.draw();
      clearTimeout(this._nudgeT); this._nudgeT = setTimeout(() => this.commit(), 400);
      return;
    }
    if (k === "[" || k === "]") { sh.rot = (((sh.rot || 0) + (k === "]" ? 15 : -15)) + 540) % 360 - 180; this.commit(); this.changed(); this.renderStyle(); return; }
    if (k === "+" || k === "=" || k === "-") { const f = k === "-" ? 1 / 1.08 : 1.08; sh.w *= f; sh.h *= f; this.commit(); this.changed(); this.renderStyle(); }
  }

  destroy() {
    this.destroyed = true;
    for (const [t, ev, fn, o] of this._on || []) t.removeEventListener(ev, fn, o);
    this._ro?.disconnect(); this._themeObs?.disconnect();
    cancelAnimationFrame(this._raf);
    clearTimeout(this._saveT);
    if (this.db) { this.saveNow().finally(() => { try { this.db.close(); } catch { /* ignore */ } }); }
    this.root.remove();
  }
}

export function mountGeoMaker(container, opts = {}) {
  if (!container) throw new Error("mountGeoMaker: container required");
  const m = new GeoMaker(container, opts);
  return m.api;
}

export { INK };
