// InkForm 3D — Photo studio.
// Import photos → cut out exactly what to keep → pro adjustments → tattoo looks → crop → hand the result to the app.
//
//   const ps = new PhotoStudio(container, { onUse, onSave, onSketch, onExport, onGeo?, toast, settings })
//   ps.loadFiles(files) / ps.loadFile(file) / ps.loadImage(src|img|canvas) → Promise
//   ps.hasImage() ; ps.getResult() → HTMLCanvasElement|null ; ps.setSettings(s) ; ps.destroy()
//
// Everything is plain Canvas 2D + typed arrays; heavy segmentation runs in a module Worker with a main-thread fallback.

import { M, clamp, clamp01, rleEncode, rleDecode, rleBytes, resample } from './util.js';
import { polygonCoverage, applyCoverage, mergeMask, magicWand, removeBackground, stampDab, smartRegion, refineMask, refineIsIdentity, REFINE_DEFAULTS, maskStats, maskContours } from './mask.js';
import { edgeCost, snapToEdge, livewire, smoothPath } from './magnetic.js';
import { runSmartSelect, guidedFilter, guidedUpsample } from './segment.js';
import { makeSource, prepareAdjust, applyAdjust, defaultAdjust, adjustIsIdentity, histogram, autoAdjust } from './adjust.js';
import { renderLookROI, defaultLook } from './looks.js';
import { h, ibtn, btn } from './widgets.js';
import { icon } from './icons.js';
import { buildPanel, STEPS } from './panels.js';
import { decodeImageFile, IMAGE_ACCEPT } from '../imageio.js';

const CSS_HREF = new URL('./photo.css', import.meta.url).href;
const WORK_MAX = 1200;   // working (preview) resolution, long side
const DRAFT_MAX = 600;   // draft resolution while dragging sliders
const SRC_MAX = 3072;    // decoded source kept in memory
const OUT_MAX = 2048;    // output long side
const SEG_MAX = 360;     // GrabCut grid long side
const HIST_LIMIT = 60;
const HIST_BYTES = 48e6;
const TINT = [34, 10, 24];

function ensureCss() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === CSS_HREF || (l.getAttribute('href') || '').includes('photo/photo.css'))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_HREF;
  document.head.appendChild(l);
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const ctx2d = (c) => c._c || (c._c = c.getContext('2d', { willReadFrequently: true }));
const raf = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 16));
const isTouch = () => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
const nice = (fname) => {
  const base = String(fname || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  if (!base || /^(img|dsc|pxl|image|photo|screenshot|whatsapp|signal|mvimg|dcim)[\s\-_]*\d/i.test(base) || /^\d[\d\s\-]*$/.test(base)) return 'Photo tattoo';
  return base.slice(0, 48);
};
let DOC_ID = 1;
let MASK_VER = 1;
let RT_ID = 0;

export class PhotoStudio {
  constructor(container, opts = {}) {
    if (!container) throw new Error('PhotoStudio: container element required');
    ensureCss();
    this.container = container;
    this.opts = opts;
    this.settings = { skinColor: '#d09a74', theme: null, ...(opts.settings || {}) };
    this.docs = [];
    this.doc = null;
    this.rt = null;            // runtime buffers of the active photo
    this.st = null;            // edit state of the active photo
    this.step = 'cut';
    this.tool = 'smart';
    this.mode = 'add';
    this.toolOpts = {
      wand: { tol: 32, contiguous: true },
      brush: { size: 46, hardness: 70, opacity: 100, smart: false },
      magnetic: { width: 10 },
      bg: { tol: 40, contiguous: false },
    };
    this.viewMode = { cut: 'overlay', other: 'skin' };
    this.view = { z: 1, tx: 0, ty: 0 };
    this.phone = false;
    this.ants = null;
    this.antsPhase = 0;
    this.pointers = new Map();
    this.gesture = null;
    this.drafting = false;
    this.comparing = false;
    this._listeners = [];
    this._build();
    this._initWorker();
  }

  /* ════════════════════════════ public API ════════════════════════════ */

  hasImage() { return !!(this.doc && this.rt); }

  async loadFile(file) { return this.loadFiles([file]); }

  async loadFiles(files) {
    const list = [...(files || [])].filter(Boolean);
    if (!list.length) return;
    const fresh = list.map((f) => this._addDoc({ file: f, name: nice(f.name), fileName: f.name || '' }));
    this._renderTray();
    let first = null, lastErr = null;
    for (const d of fresh) {
      try { await this._activate(d); first = d; break; }
      catch (e) { lastErr = e; this._toast(`Couldn't open “${d.fileName || 'that picture'}”: ${e.message || 'unknown format'}`); this._removeDoc(d, true); }
    }
    if (!first) { if (lastErr) throw lastErr; return; }
    // thumbnails for the others, one at a time in the background
    this._thumbQueue(fresh.filter((d) => d !== first));
    if (fresh.length > 1) this._toast(`${fresh.length} photos added — tap one in the strip to edit it`);
  }

  async loadImage(src) {
    let c;
    if (src instanceof HTMLCanvasElement) { c = canvas(src.width, src.height); ctx2d(c).drawImage(src, 0, 0); }
    else {
      let img = src;
      if (typeof src === 'string') {
        img = new Image();
        if (!/^(data|blob):/i.test(src)) img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.src = src;
      }
      if (!img.complete || !img.naturalWidth) await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Couldn't load that image")); });
      if (img.decode) { try { await img.decode(); } catch { /* already decoded */ } }
      const w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
      const s = Math.min(1, SRC_MAX / Math.max(w, hh));
      c = canvas(Math.round(w * s), Math.round(hh * s));
      const cx = ctx2d(c); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, c.width, c.height);
    }
    const name = typeof src === 'string' && !/^data:/.test(src) ? nice(src.split(/[\/?#]/).filter(Boolean).pop()) : 'Photo tattoo';
    const d = this._addDoc({ canvas: c, name, fileName: '' });
    this._renderTray();
    await this._activate(d);
  }

  getResult() {
    if (!this.hasImage()) return null;
    try { return this._renderOutput(); } catch (e) { console.error(e); return null; }
  }

  setSettings(s = {}) {
    Object.assign(this.settings, s || {});
    this._themeDirty = true;
    this.requestDraw();
  }

  destroy() {
    this._destroyed = true;
    for (const [t, ev, fn, o] of this._listeners) t.removeEventListener(ev, fn, o);
    this._listeners = [];
    if (this._ro) this._ro.disconnect();
    if (this._mo) this._mo.disconnect();
    clearInterval(this._antsTimer);
    if (this.worker) { try { this.worker.terminate(); } catch { /* ignore */ } }
    if (this.rw) { try { this.rw.terminate(); } catch { /* ignore */ } }
    this.root.remove();
    this.docs = []; this.rt = null;
  }

  /* ════════════════════════════ DOM ════════════════════════════ */

  _on(t, ev, fn, o) { t.addEventListener(ev, fn, o); this._listeners.push([t, ev, fn, o]); }
  _toast(msg) { if (this.opts.toast) this.opts.toast(msg); else this._localToast(msg); }
  _localToast(msg) {
    const t = this.el.toast;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  }

  _build() {
    const root = h('div', { class: 'photostudio', tabindex: '-1', 'data-step': 'cut' });
    this.root = root;
    const el = this.el = {};
    // hidden inputs
    el.file = h('input', { type: 'file', accept: IMAGE_ACCEPT, multiple: true, hidden: true, 'aria-hidden': 'true' });
    el.cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'aria-hidden': 'true' });
    const onPick = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) this.loadFiles(f).catch((err) => this._toast(err.message || "Couldn't open that picture")); };
    el.file.addEventListener('change', onPick); el.cam.addEventListener('change', onPick);

    // empty state
    const touch = isTouch();
    el.empty = h('div', { class: 'ps-empty' },
      h('div', { class: 'ps-drop', role: 'button', tabindex: '0', 'aria-label': 'Add a photo' },
        h('div', { class: 'ps-drop-ic', html: icon('addPhoto') }),
        h('h2', { text: 'Add a photo' }),
        h('p', { class: 'ps-muted', text: touch ? 'Pick from your gallery or take one now. You can add several at once.' : 'Drop photos here, paste one, or choose files. You can add several at once.' }),
        h('div', { class: 'ps-drop-btns' },
          btn('photo', touch ? 'Choose photos' : 'Choose photos…', (e) => { e.stopPropagation(); el.file.click(); }, 'ps-accent'),
          touch ? btn('camera', 'Take photo', (e) => { e.stopPropagation(); el.cam.click(); }) : null)),
      h('ol', { class: 'ps-howto' },
        h('li', {}, h('b', { text: 'Cut out' }), h('span', { text: ' — outline or tap what you want to keep' })),
        h('li', {}, h('b', { text: 'Adjust' }), h('span', { text: ' — light, colour and filters like a pro photo app' })),
        h('li', {}, h('b', { text: 'Tattoo look' }), h('span', { text: ' — line art, stencil, dotwork, black & grey…' }))));
    el.empty.querySelector('.ps-drop').addEventListener('click', () => el.file.click());
    el.empty.querySelector('.ps-drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); } });

    // top bar: steps + history + more
    el.steps = h('div', { class: 'ps-steps', role: 'tablist', 'aria-label': 'Steps' });
    STEPS.forEach((s, i) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'ps-step', 'data-step': s.id, title: s.title, html: `<i>${i + 1}</i>${icon(s.icon)}<span class="l">${s.label}</span><span class="s">${s.short}</span>` });
      b.addEventListener('click', () => this.setStep(s.id));
      el.steps.append(b);
    });
    el.undo = ibtn('undo', 'Undo (Ctrl+Z)', () => this.undo());
    el.redo = ibtn('redo', 'Redo (Ctrl+Shift+Z)', () => this.redo());
    el.compare = ibtn('compare', 'Hold to compare with the original', null, 'ps-compare');
    const cmpOn = (e) => { e.preventDefault(); this.comparing = true; el.compare.classList.add('on'); this.requestDraw(); };
    const cmpOff = () => { if (!this.comparing) return; this.comparing = false; el.compare.classList.remove('on'); this.requestDraw(); };
    el.compare.addEventListener('pointerdown', cmpOn);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) el.compare.addEventListener(ev, cmpOff);
    el.compare.addEventListener('contextmenu', (e) => e.preventDefault());
    el.compare.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') cmpOn(e); });
    el.compare.addEventListener('keyup', cmpOff);
    el.moreBtn = ibtn('more', 'More', () => this._menu());
    el.top = h('header', { class: 'ps-top' }, el.steps, h('div', { class: 'ps-topacts' }, el.undo, el.redo, el.compare, el.moreBtn));

    // stage
    el.cv = h('canvas', { class: 'ps-canvas', 'aria-label': 'Photo canvas' });
    el.hint = h('div', { class: 'ps-hint', role: 'status', 'aria-live': 'polite' });
    el.busy = h('div', { class: 'ps-busy', hidden: true }, h('span', { class: 'ps-spin' }), h('span', { class: 'ps-busy-t' }));
    el.polyBar = h('div', { class: 'ps-floatbar', hidden: true },
      btn('undo', 'Point', () => this._polyBack(), '', 'Remove last point (Backspace)'),
      btn('close', 'Cancel', () => this._toolCancel(), '', 'Cancel (Esc)'),
      btn('check', 'Finish', () => this._polyFinish(), 'ps-accent', 'Close the shape (Enter)'));
    el.zoomChip = h('button', { type: 'button', class: 'ps-zoomchip', title: 'Fit to screen (0)', 'aria-label': 'Fit to screen', onclick: () => { this.fit(); } });
    el.tray = h('div', { class: 'ps-tray', 'aria-label': 'Photos', hidden: true });
    el.stage = h('div', { class: 'ps-stage' }, el.cv, el.hint, el.busy, el.polyBar, el.zoomChip, el.tray);

    // side panel / bottom sheet
    el.panel = h('aside', { class: 'ps-panel', 'aria-label': 'Tools' });
    el.body = h('div', { class: 'ps-body' }, el.stage, el.panel);
    el.toast = h('div', { class: 'ps-toast', role: 'status' });
    el.layer = h('div', { class: 'ps-layer' });
    root.append(el.top, el.body, el.empty, el.toast, el.layer, el.file, el.cam);
    this.container.append(root);
    this._bindStage();
    this._bindGlobal();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(root);
    this._mo = new MutationObserver(() => { this._themeDirty = true; this.requestDraw(); });
    this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    this._updateChrome();
  }

  _resize() {
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const phone = r.width <= 700;
    if (phone !== this.phone) { this.phone = phone; this.root.classList.toggle('is-phone', phone); this._rebuildPanel(); }
    const s = this.el.stage.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(s.width * dpr)), hh = Math.max(1, Math.round(s.height * dpr));
    const changed = this.el.cv.width !== w || this.el.cv.height !== hh;
    if (changed) { this.el.cv.width = w; this.el.cv.height = hh; }
    const first = !this._sized && s.width > 10;
    if (first || (changed && this._autoFit)) { this._sized = true; this.fit(); }
    this.requestDraw();
  }

  _updateChrome() {
    const has = this.hasImage();
    this.root.classList.toggle('has-image', has);
    this.root.dataset.step = this.step;
    this.el.empty.hidden = has;
    for (const b of this.el.steps.children) { const on = b.dataset.step === this.step; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    this.el.undo.disabled = !this.hist || this.hist.i <= 0;
    this.el.redo.disabled = !this.hist || this.hist.i >= this.hist.stack.length - 1;
    this._updateHint();
  }

  _rebuildPanel() {
    if (!this.el) return;
    const keep = this.el.panel.querySelector('.ps-scroll');
    const top = keep ? keep.scrollTop : 0;
    this.el.panel.replaceChildren(buildPanel(this, this.step, this.phone));
    const sc = this.el.panel.querySelector('.ps-scroll');
    if (sc && this._panelStepWas === this.step) sc.scrollTop = top;
    this._panelStepWas = this.step;
    this._updateChrome();
  }

  /* ════════════════════════════ documents (multi-photo) ════════════════════════════ */

  _addDoc({ file = null, canvas: c = null, name = 'Photo tattoo', fileName = '' }) {
    const d = { id: DOC_ID++, file, canvas: c, name, fileName, thumb: null, saved: null, edited: false };
    this.docs.push(d);
    return d;
  }

  async _activate(d) {
    if (this.doc === d && this.rt) return;
    this._toolCancel(true);
    this._saveDoc();
    const prev = this.doc;
    let src = d.canvas;
    if (!src) {
      const done = this.busy('Opening photo…');
      try { src = await decodeImageFile(d.file, { maxSide: SRC_MAX }); }
      finally { done(); }
    }
    if (prev && prev !== d && prev.file) prev.canvas = null; // file-backed photos are re-decoded when needed (memory)
    d.canvas = src;
    this.doc = d;
    if (!d.thumb) d.thumb = this._thumb(src);
    this._setupRuntime(src);
    if (d.saved) this._restoreDoc(d.saved);
    else {
      this.st = { refine: { ...REFINE_DEFAULTS }, adjust: defaultAdjust(), look: defaultLook('photo'), geom: this._defaultGeom(), onlySel: false };
      this.rt.mask.fill(255); this.rt.touched = false; this._maskChanged();
      this.hist = { stack: [], i: -1 };
      this._commit('Open', true);
      this.step = 'cut';
      this.tool = 'smart';
    }
    this.el.nameInput && (this.el.nameInput.value = d.name);
    this._autoFit = true;
    this._updateChrome();
    this._rebuildPanel();
    this._renderTray();
    this._resize();
    this.fit();
    this.requestRender();
  }

  _saveDoc() {
    if (!this.doc || !this.rt) return;
    this.doc.saved = {
      mask: rleEncode(this.rt.mask), touched: this.rt.touched, st: JSON.parse(JSON.stringify(this.st)),
      hist: this.hist, step: this.step, tool: this.tool,
    };
  }

  _restoreDoc(s) {
    rleDecode(s.mask, this.rt.mask);
    this.rt.touched = s.touched;
    this.st = JSON.parse(JSON.stringify(s.st));
    this.hist = s.hist;
    this.step = s.step || 'cut';
    this.tool = s.tool || 'smart';
    this._maskChanged();
  }

  _thumb(src) {
    const s = 112 / Math.max(src.width, src.height);
    const c = canvas(Math.round(src.width * s), Math.round(src.height * s));
    const x = ctx2d(c); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  async _thumbQueue(list) {
    for (const d of list) {
      if (this._destroyed || d.thumb || !this.docs.includes(d)) continue;
      try {
        const c = await decodeImageFile(d.file, { maxSide: 400 });
        d.thumb = this._thumb(c);
      } catch (e) {
        this._toast(`Skipped “${d.fileName || 'a picture'}”: ${e.message || "couldn't read it"}`);
        this._removeDoc(d, true);
      }
      this._renderTray();
    }
  }

  _renderTray() {
    const t = this.el.tray;
    t.replaceChildren();
    if (!this.docs.length) { t.hidden = true; return; }
    t.hidden = false;
    for (const d of this.docs) {
      const item = h('div', { class: 'ps-tray-it' + (d === this.doc ? ' on' : ''), title: d.fileName || d.name });
      const b = h('button', { type: 'button', class: 'ps-tray-th', 'aria-label': `Edit ${d.fileName || d.name}` });
      if (d.thumb) { const c = d.thumb; const im = canvas(c.width, c.height); ctx2d(im).drawImage(c, 0, 0); b.append(im); }
      else b.append(h('span', { class: 'ps-spin sm' }));
      b.addEventListener('click', () => { if (d !== this.doc) this._activate(d).catch((e) => this._toast(e.message || "Couldn't open that photo")); });
      const x = h('button', { type: 'button', class: 'ps-tray-x', title: 'Remove this photo', 'aria-label': `Remove ${d.fileName || d.name}`, html: icon('close') });
      x.addEventListener('click', (e) => { e.stopPropagation(); this._askRemove(d); });
      item.append(b, x);
      t.append(item);
    }
    const add = h('button', { type: 'button', class: 'ps-tray-add', title: 'Add photos', 'aria-label': 'Add photos', html: icon('plus') });
    add.addEventListener('click', () => this.el.file.click());
    t.append(add);
  }

  async _askRemove(d) {
    const edited = d === this.doc ? this.hist && this.hist.stack.length > 1 : d.saved && d.saved.hist && d.saved.hist.stack.length > 1;
    if (edited && !(await this.confirm('Remove this photo and its edits?', 'Remove'))) return;
    this._removeDoc(d);
  }

  _removeDoc(d, silent = false) {
    const i = this.docs.indexOf(d);
    if (i < 0) return;
    this.docs.splice(i, 1);
    if (d === this.doc) {
      this.doc = null; this.rt = null; this.st = null; this.hist = null; this.ants = null;
      const next = this.docs[Math.min(i, this.docs.length - 1)];
      if (next) this._activate(next).catch((e) => !silent && this._toast(e.message));
      else { this._updateChrome(); this._rebuildPanel(); this.requestDraw(); }
    }
    this._renderTray();
  }

  /* ════════════════════════════ runtime buffers ════════════════════════════ */

  _setupRuntime(src) {
    const s = Math.min(1, WORK_MAX / Math.max(src.width, src.height));
    const W = Math.max(1, Math.round(src.width * s)), H = Math.max(1, Math.round(src.height * s));
    const work = canvas(W, H);
    const wc = ctx2d(work); wc.imageSmoothingQuality = 'high'; wc.drawImage(src, 0, 0, W, H);
    const rgba = wc.getImageData(0, 0, W, H).data;
    const ds = Math.min(1, DRAFT_MAX / Math.max(W, H));
    const dw = Math.max(1, Math.round(W * ds)), dh = Math.max(1, Math.round(H * ds));
    const dcv = canvas(dw, dh);
    const dc = ctx2d(dcv); dc.imageSmoothingQuality = 'high'; dc.drawImage(work, 0, 0, dw, dh);
    const drgba = dc.getImageData(0, 0, dw, dh).data;
    const mkRes = (data, w, hh, k) => ({ w, h: hh, k, rgba: data, src: makeSource(data, w, hh, { k, GW: W, GH: H }), adjBuf: new Uint8ClampedArray(w * hh * 4), adj: data, adjKey: '', adjImgKey: null, look: null, lookKey: null, finalKey: null, mask: null, maskKey: null, cvAdj: canvas(w, hh), cvFinal: canvas(w, hh) });
    this.rt = {
      src, fs: src.width / W, W, H, work, rgba,
      full: mkRes(rgba, W, H, 1), draft: mkRes(drgba, dw, dh, dw / W),
      mask: new Uint8Array(W * H).fill(255), maskVer: 0, touched: false,
      refined: null, refinedKey: null,
      edge: null,
      cvOver: canvas(W, H), cvCut: canvas(W, H), cvMask: canvas(W, H), cvDim: null,
      imgOver: new ImageData(W, H), imgCut: new ImageData(W, H), imgMask: new ImageData(W, H),
      dispKey: {},
      rid: DOC_ID * 1000 + (++RT_ID),
    };
    this._inflight = null;
    if (this.rw) { try { this.rw.postMessage({ type: 'src', doc: this.rt.rid, rgba: rgba.slice(), w: W, h: H, GW: W, GH: H }); } catch { this.rw = null; } }
  }

  _defaultGeom() { return { rot: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'free' }; }

  _maskChanged() {
    const rt = this.rt;
    rt.maskVer = ++MASK_VER; // globally unique: a version number always means the same mask content
    rt.refinedKey = null;
    this._antsDirty = true;
  }

  refined() {
    const rt = this.rt;
    const key = rt.maskVer + '|' + JSON.stringify(this.st.refine);
    if (rt.refinedKey !== key) {
      rt.refined = refineIsIdentity(this.st.refine) ? rt.mask : refineMask(rt.mask, rt.W, rt.H, this.st.refine, 1);
      rt.refinedKey = key;
    }
    return rt.refined;
  }
  _maskKey() { return this.rt.maskVer + '|' + JSON.stringify(this.st.refine); }

  /* ════════════════════════════ geometry ════════════════════════════ */

  frameDims() { const { W, H } = this.rt; return this.st.geom.rot % 2 ? [H, W] : [W, H]; }
  geoMatrix() {
    const g = this.st.geom, { W, H } = this.rt;
    const [FW, FH] = this.frameDims();
    let m = M.translate(-W / 2, -H / 2);
    m = M.mul(M.rotate(g.rot * Math.PI / 2), m);
    m = M.mul(M.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1), m);
    m = M.mul(M.rotate(g.angle * Math.PI / 180), m);
    return M.mul(M.translate(FW / 2, FH / 2), m);
  }
  cropRect() { const [FW, FH] = this.frameDims(); const c = this.st.geom.crop; return { x: c.x * FW, y: c.y * FH, w: c.w * FW, h: c.h * FH }; }
  viewMatrix() { return [this.view.z, 0, 0, this.view.z, this.view.tx, this.view.ty]; }
  /** css px (relative to stage) → source (working) px */
  toSrc(x, y) { return M.apply(M.inv(M.mul(this.viewMatrix(), this.geoMatrix())), x, y); }
  toFrame(x, y) { return M.apply(M.inv(this.viewMatrix()), x, y); }
  srcToScreen(x, y) { return M.apply(M.mul(this.viewMatrix(), this.geoMatrix()), x, y); }

  fit() {
    if (!this.rt) return;
    const s = this.el.stage.getBoundingClientRect();
    if (!s.width) return;
    const padTop = this.phone ? 52 : 60, pad = this.phone ? 14 : 28, padBot = this.docs.length ? (this.phone ? 64 : 76) : pad;
    let box;
    if (this.step === 'crop') {
      const [FW, FH] = this.frameDims();
      const a = Math.abs(this.st.geom.angle) * Math.PI / 180;
      const bw = FW * Math.cos(a) + FH * Math.sin(a), bh = FW * Math.sin(a) + FH * Math.cos(a);
      box = { x: (FW - bw) / 2, y: (FH - bh) / 2, w: bw, h: bh };
    } else box = this.cropRect();
    const aw = s.width - pad * 2, ah = s.height - padTop - padBot;
    const z = Math.max(0.01, Math.min(aw / box.w, ah / box.h));
    this.view = { z, tx: pad + (aw - box.w * z) / 2 - box.x * z, ty: padTop + (ah - box.h * z) / 2 - box.y * z };
    this._fitZ = z;
    this._autoFit = true;
    this.requestDraw();
  }

  zoomAt(f, cx, cy) {
    const v = this.view;
    const nz = clamp(v.z * f, (this._fitZ || 1) * 0.25, 40);
    const k = nz / v.z;
    v.tx = cx - (cx - v.tx) * k; v.ty = cy - (cy - v.ty) * k; v.z = nz;
    this._autoFit = false;
    this.requestDraw();
  }

  /* ════════════════════════════ steps / tools ════════════════════════════ */

  setStep(id) {
    if (!STEPS.some((s) => s.id === id) || !this.hasImage()) return;
    this._toolCancel(true);
    const was = this.step;
    this.step = id;
    this._updateChrome();
    this._rebuildPanel();
    if (was === 'crop' || id === 'crop') this.fit();
    this.requestRender();
    this.root.focus({ preventScroll: true });
  }

  setTool(t) {
    this._toolCancel(true);
    this.tool = t;
    if (t === 'brush') this.mode = this.mode === 'sub' ? 'sub' : 'add';
    this._rebuildPanel();
    this._updateHint();
    this.requestDraw();
  }
  setMode(m) { this.mode = m; this._rebuildPanel(); this._updateHint(); }

  get displayMode() { return this.step === 'cut' ? this.viewMode.cut : this.viewMode.other; }
  setDisplayMode(m) { if (this.step === 'cut') this.viewMode.cut = m; else this.viewMode.other = m; this.requestRender(); this._rebuildPanel(); }

  _updateHint() {
    const el = this.el.hint;
    if (!this.hasImage()) { el.hidden = true; return; }
    let t = '';
    if (this.step === 'cut') {
      const sub = this.mode === 'sub';
      const T = {
        smart: sub ? 'Drag a box or loop around the part to remove' : 'Drag a box or loop around the subject — it snaps to the edges',
        lasso: sub ? 'Draw around the part to remove' : 'Draw around the outline of what you want to keep',
        polygon: 'Tap corner points — tap the first point or Finish to close',
        magnetic: 'Trace slowly along the edge — the line snaps to it',
        wand: sub ? 'Tap a colour to remove it' : 'Tap a colour area to select it',
        brush: sub ? 'Paint over what you don’t want' : 'Paint over what you want to keep',
        bg: 'Plain background removed — tap the background to pick its colour',
      };
      t = T[this.tool] || '';
      if (!this.rt.touched && this.tool !== 'bg') t = (this.tool === 'smart' ? '✦ Tap “Select subject”, or drag around it' : t);
    } else if (this.step === 'adjust') t = '';
    else if (this.step === 'look') t = '';
    else if (this.step === 'crop') t = 'Drag the corners to crop';
    el.textContent = t;
    el.hidden = !t;
  }

  /* ════════════════════════════ history ════════════════════════════ */

  _commit(label = '', initial = false) {
    if (!this.rt) return;
    const H = this.hist;
    const top = H.stack[H.i];
    const maskSnap = top && top.maskVer === this.rt.maskVer ? top.mask : rleEncode(this.rt.mask);
    H.stack.length = H.i + 1;
    H.stack.push({ label, mask: maskSnap, maskVer: this.rt.maskVer, touched: this.rt.touched, st: JSON.stringify(this.st) });
    // limits: count and memory
    let bytes = 0;
    for (const e of H.stack) bytes += rleBytes(e.mask);
    while (H.stack.length > HIST_LIMIT || (bytes > HIST_BYTES && H.stack.length > 2)) { const e = H.stack.shift(); bytes -= rleBytes(e.mask); }
    H.i = H.stack.length - 1;
    if (!initial && this.doc) this.doc.edited = true;
    this._updateChrome();
  }

  _restore(e) {
    rleDecode(e.mask, this.rt.mask);
    this.rt.touched = e.touched;
    const geomWas = JSON.stringify(this.st.geom);
    this.st = JSON.parse(e.st);
    this._maskChanged();
    this.rt.maskVer = e.maskVer; // keep snapshot identity for sharing
    this._rebuildPanel();
    if (geomWas !== JSON.stringify(this.st.geom)) this.fit();
    this.requestRender();
  }

  undo() {
    if (this.gesture && this.gesture.tool === 'polygon') { this._polyBack(); return; }
    this._toolCancel(true);
    const H = this.hist;
    if (!H || H.i <= 0) return;
    H.i--; this._restore(H.stack[H.i]);
    this._toast && this._flash('Undo' + (H.stack[H.i + 1].label ? ': ' + H.stack[H.i + 1].label : ''));
  }
  redo() {
    this._toolCancel(true);
    const H = this.hist;
    if (!H || H.i >= H.stack.length - 1) return;
    H.i++; this._restore(H.stack[H.i]);
    this._flash('Redo' + (H.stack[H.i].label ? ': ' + H.stack[H.i].label : ''));
  }
  _flash(msg) {
    const el = this.el.hint;
    el.textContent = msg; el.hidden = false;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this._updateHint(), 1100);
  }

  /** Update edit state from a panel control. live = still dragging (draft render), commit = add an undo step. */
  edit(fn, { commit = true, label = '', live = false } = {}) {
    if (!this.rt) return;
    fn(this.st);
    this.drafting = live;
    if (commit) { this.drafting = false; this._commit(label); }
    this.requestRender();
  }
  dragStart() { this.drafting = true; }

  async resetStep() {
    const step = this.step;
    const names = { cut: 'selection', adjust: 'adjustments', look: 'tattoo look', crop: 'crop' };
    if (!(await this.confirm(`Reset the ${names[step]}?`, 'Reset'))) return;
    if (step === 'cut') { this.rt.mask.fill(255); this.rt.touched = false; this.st.refine = { ...REFINE_DEFAULTS }; this._maskChanged(); }
    else if (step === 'adjust') { this.st.adjust = defaultAdjust(); this.st.onlySel = false; }
    else if (step === 'look') this.st.look = defaultLook('photo');
    else { this.st.geom = this._defaultGeom(); this.fit(); }
    this._commit('Reset ' + names[step]);
    this._rebuildPanel();
    this.requestRender();
  }

  async resetAll() {
    if (!(await this.confirm('Start over with this photo? All edits are cleared (you can still undo).', 'Start over'))) return;
    this.rt.mask.fill(255); this.rt.touched = false; this._maskChanged();
    this.st = { refine: { ...REFINE_DEFAULTS }, adjust: defaultAdjust(), look: defaultLook('photo'), geom: this._defaultGeom(), onlySel: false };
    this._commit('Start over');
    this.step = 'cut';
    this._updateChrome(); this._rebuildPanel(); this.fit(); this.requestRender();
  }

  /* ════════════════════════════ in-page dialogs ════════════════════════════ */

  confirm(msg, okLabel = 'OK') {
    return new Promise((resolve) => {
      const close = (v) => { wrap.remove(); resolve(v); this.root.focus({ preventScroll: true }); };
      const ok = h('button', { type: 'button', class: 'ps-btn ps-accent', html: `<span>${okLabel}</span>`, onclick: () => close(true) });
      const no = h('button', { type: 'button', class: 'ps-btn', html: '<span>Cancel</span>', onclick: () => close(false) });
      const wrap = h('div', { class: 'ps-modal', role: 'alertdialog', 'aria-modal': 'true' },
        h('div', { class: 'ps-dialog' }, h('p', { text: msg }), h('div', { class: 'ps-dialog-btns' }, no, ok)));
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(false); });
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } });
      this.el.layer.append(wrap);
      ok.focus();
    });
  }

  /** Small menu / sheet anchored to the top-right (desktop) or bottom (phone). items: [{icon,label,run,danger}] */
  sheet(title, items, extra = null) {
    const close = () => { wrap.remove(); };
    const list = h('div', { class: 'ps-menu-list' }, ...items.filter(Boolean).map((it) => {
      const b = h('button', { type: 'button', class: 'ps-menu-it' + (it.danger ? ' danger' : '') + (it.primary ? ' primary' : ''), html: icon(it.icon) + `<span>${it.label}</span>` + (it.sub ? `<small>${it.sub}</small>` : '') });
      b.addEventListener('click', () => { close(); it.run(); });
      return b;
    }));
    const card = h('div', { class: 'ps-menu' }, title ? h('div', { class: 'ps-menu-t', text: title }) : null, extra, list);
    const wrap = h('div', { class: 'ps-menu-wrap' + (this.phone ? ' sheet' : '') }, card);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    this.el.layer.append(wrap);
    const f = card.querySelector('input,button'); if (f) f.focus();
    return close;
  }

  _menu() {
    const has = this.hasImage();
    this.sheet(null, [
      { icon: 'addPhoto', label: 'Add photos…', run: () => this.el.file.click() },
      isTouch() ? { icon: 'camera', label: 'Take photo', run: () => this.el.cam.click() } : null,
      has ? { icon: 'reset', label: 'Start over with this photo', run: () => this.resetAll() } : null,
      has ? { icon: 'trash', label: 'Remove this photo', danger: true, run: () => this._askRemove(this.doc) } : null,
    ]);
  }

  /** Output actions. */
  outputItems() {
    const o = this.opts;
    return [
      o.onSave ? { id: 'save', icon: 'save', label: 'Save to designs', run: () => this.output('onSave') } : null,
      o.onSketch ? { id: 'sketch', icon: 'sketch', label: 'Edit in Sketch', run: () => this.output('onSketch') } : null,
      o.onGeo ? { id: 'geo', icon: 'geo', label: 'Use in Geometric maker', run: () => this.output('onGeo') } : null,
      o.onExport ? { id: 'export', icon: 'download', label: 'Save image', run: () => this.output('onExport') } : null,
    ].filter(Boolean);
  }
  get name() { return (this.doc && this.doc.name) || 'Photo tattoo'; }
  set name(v) { if (this.doc) this.doc.name = String(v || '').slice(0, 60) || 'Photo tattoo'; }
  get originalFileName() { return (this.doc && this.doc.fileName) || ''; }

  async output(cb) {
    const fn = this.opts[cb];
    if (!fn || !this.hasImage()) return;
    const done = this.busy('Preparing your tattoo…');
    await new Promise((r) => setTimeout(r, 30));
    let c = null;
    try { c = this._renderOutput(); } catch (e) { console.error(e); }
    done();
    if (!c) { this._toast('Nothing is kept yet — select part of the photo first'); return; }
    try { await fn(c, this.name); } catch (e) { console.error(e); this._toast(e.message || 'Something went wrong'); }
  }

  busy(msg) {
    const b = this.el.busy;
    b.querySelector('.ps-busy-t').textContent = msg;
    b.hidden = false;
    this._busyN = (this._busyN || 0) + 1;
    return () => { this._busyN--; if (this._busyN <= 0) { this._busyN = 0; b.hidden = true; } };
  }

  /* ════════════════════════════ rendering pipeline ════════════════════════════ */

  requestRender() { this._needRender = true; this.requestDraw(); }
  requestDraw() {
    if (this._rafPending || this._destroyed) return;
    this._rafPending = true;
    raf(() => { this._rafPending = false; this._frame(); });
  }

  _frame() {
    if (!this.root.isConnected) return;
    if (this._needRender && this.rt) {
      this._needRender = false;
      const t0 = performance.now();
      const rt = this.rt;
      let res = rt.full;
      if (this.drafting) res = rt.draft;
      else if (this.rw && !this._fullReady()) { this._requestFull(); res = rt.draft; }
      this._compute(res);
      this._showRes = res;
      this._lastRenderMs = performance.now() - t0;
      if (this.drafting) { clearTimeout(this._fullT); this._fullT = setTimeout(() => { if (!this.drafting) return; this.drafting = false; this.requestRender(); }, 450); }
      if (this._antsDirty && this.step === 'cut' && !this.gesture) this._computeAnts();
      if (this._histCb) this._histCb();
    }
    this._draw();
  }

  /* full-resolution renders in the render worker */
  _keys() {
    const adjKey = JSON.stringify(this.st.adjust);
    const look = this.st.look;
    const lookIdentity = look.id === 'photo' && !look.white && (look.strength ?? 100) >= 100;
    const usesMask = look.id !== 'photo';
    const lookKey = adjKey + '#' + JSON.stringify(look) + (usesMask ? '#' + this._maskKey() : '');
    return { adjKey, lookKey, lookIdentity, usesMask };
  }
  _fullReady() {
    const f = this.rt.full, k = this._keys();
    if (f.adjKey !== k.adjKey) return false;
    if (this.step === 'cut') return true;
    return f.lookKey === k.lookKey;
  }
  _requestFull() {
    const rt = this.rt, k = this._keys(), f = rt.full;
    const needLook = this.step !== 'cut';
    const jobKey = k.adjKey + '|' + (needLook ? k.lookKey : '');
    if (this._inflight === jobKey) return;
    // adjustments alone can be finished here when the photo is unadjusted
    if (f.adjKey !== k.adjKey && adjustIsIdentity(this.st.adjust)) { f.adj = f.rgba; f.adjKey = k.adjKey; }
    if (f.adjKey === k.adjKey && (!needLook || f.lookKey === k.lookKey)) return;
    if (needLook && f.adjKey === k.adjKey && k.lookIdentity) { f.look = f.adj; f.lookKey = k.lookKey; return; }
    this._inflight = jobKey;
    const id = (this._rjob = (this._rjob || 0) + 1);
    const msg = { type: 'render', id, doc: rt.rid, adjust: this.st.adjust, adjKey: k.adjKey, wantAdj: f.adjKey !== k.adjKey, look: needLook && !k.lookIdentity ? this.st.look : null, lookKey: k.lookKey };
    if (msg.look && k.usesMask) msg.mask = this._resMask(f).slice();
    try { this.rw.postMessage(msg); } catch { this.rw = null; this._inflight = null; }
  }
  _onRender(d) {
    this._inflight = null;
    const rt = this.rt;
    if (!rt || d.doc !== rt.rid) return;
    if (d.error) { this.rw = null; this.requestRender(); return; }
    const f = rt.full;
    if (d.adj || d.identity) { f.adj = d.identity ? f.rgba : d.adj; f.adjKey = d.adjKey; }
    if (d.look && f.adjKey === d.adjKey) { f.look = d.look; f.lookKey = d.lookKey; }
    this._needRender = true;
    this.requestDraw();
  }

  _resMask(res) {
    const key = this._maskKey();
    if (res.maskKey === key) return res.mask;
    const R = this.refined();
    if (res === this.rt.full) res.mask = R;
    else {
      const { W, H } = this.rt, m = new Uint8Array(res.w * res.h);
      for (let y = 0; y < res.h; y++) { const sy = Math.min(H - 1, Math.floor((y + 0.5) * H / res.h)); for (let x = 0; x < res.w; x++) m[y * res.w + x] = R[sy * W + Math.min(W - 1, Math.floor((x + 0.5) * W / res.w))]; }
      res.mask = m;
    }
    res.maskKey = key;
    return res.mask;
  }

  _ensureAdj(res) {
    const key = JSON.stringify(this.st.adjust);
    if (res.adjKey === key) return;
    if (adjustIsIdentity(this.st.adjust)) res.adj = res.rgba;
    else { applyAdjust(res.src, prepareAdjust(this.st.adjust), res.adjBuf); res.adj = res.adjBuf; }
    res.adjKey = key;
  }

  _ensureLook(res) {
    const lk = JSON.stringify(this.st.look);
    const usesMask = this.st.look.id !== 'photo';
    const key = res.adjKey + '#' + lk + (usesMask ? '#' + this._maskKey() : '');
    if (res.lookKey === key) return;
    res.look = this.st.look.id === 'photo' && !this.st.look.white && (this.st.look.strength ?? 100) >= 100 ? res.adj
      : renderLookROI(res.adj, res.w, res.h, this.st.look, { k: res.k, mask: usesMask ? this._resMask(res) : null });
    res.lookKey = key;
  }

  _compute(res) {
    const rt = this.rt;
    this._ensureAdj(res);
    if (res.adjImgKey !== res.adjKey) { ctx2d(res.cvAdj).putImageData(new ImageData(res.adj, res.w, res.h), 0, 0); res.adjImgKey = res.adjKey; }
    const mode = this.displayMode;
    if (this.step === 'cut') {
      const mk = this._maskKey();
      if (mode === 'overlay' && rt.dispKey.over !== mk) { this._paintOverlay(); rt.dispKey.over = mk; }
      if ((mode === 'checker' || mode === 'skin') && rt.dispKey.cut !== mk + res.adjKey) { this._paintCut(); rt.dispKey.cut = mk + res.adjKey; }
      if (mode === 'mask' && rt.dispKey.mask !== mk) { this._paintMaskView(); rt.dispKey.mask = mk; }
    } else {
      this._ensureLook(res);
      const m = this._resMask(res);
      const fk = res.lookKey + '|' + res.maskKey;
      if (res.finalKey !== fk) {
        const n = res.w * res.h, out = new Uint8ClampedArray(n * 4), L = res.look;
        for (let i = 0, j = 0; i < n; i++, j += 4) { out[j] = L[j]; out[j + 1] = L[j + 1]; out[j + 2] = L[j + 2]; out[j + 3] = L[j + 3] * m[i] / 255; }
        ctx2d(res.cvFinal).putImageData(new ImageData(out, res.w, res.h), 0, 0);
        res.finalKey = fk;
        res.finalData = out;
      }
    }
  }

  _paintOverlay(rect = null) {
    const rt = this.rt, m = this.gesture && this.gesture.liveMask ? rt.mask : this.refined(), d = rt.imgOver.data, W = rt.W;
    const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0, x1 = rect ? rect.x + rect.w : rt.W, y1 = rect ? rect.y + rect.h : rt.H;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, j = i * 4;
      d[j] = TINT[0]; d[j + 1] = TINT[1]; d[j + 2] = TINT[2]; d[j + 3] = (255 - m[i]) * 0.66;
    }
    ctx2d(rt.cvOver).putImageData(rt.imgOver, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  _paintCut(rect = null) {
    const rt = this.rt, res = rt.full, m = this.gesture && this.gesture.liveMask ? rt.mask : this.refined(), d = rt.imgCut.data, W = rt.W, a = res.adj;
    this._ensureAdj(res);
    const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0, x1 = rect ? rect.x + rect.w : rt.W, y1 = rect ? rect.y + rect.h : rt.H;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, j = i * 4;
      d[j] = a[j]; d[j + 1] = a[j + 1]; d[j + 2] = a[j + 2]; d[j + 3] = m[i];
    }
    ctx2d(rt.cvCut).putImageData(rt.imgCut, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  _paintMaskView(rect = null) {
    const rt = this.rt, m = this.gesture && this.gesture.liveMask ? rt.mask : this.refined(), d = rt.imgMask.data, W = rt.W;
    const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0, x1 = rect ? rect.x + rect.w : rt.W, y1 = rect ? rect.y + rect.h : rt.H;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x, j = i * 4; d[j] = d[j + 1] = d[j + 2] = m[i]; d[j + 3] = 255; }
    ctx2d(rt.cvMask).putImageData(rt.imgMask, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  /** Live update of the cut-step display in a dirty rect (brush strokes). */
  _paintDirty(rect) {
    const rt = this.rt;
    const r = { x: clamp(rect.x, 0, rt.W), y: clamp(rect.y, 0, rt.H) };
    r.w = clamp(rect.x + rect.w, 0, rt.W) - r.x; r.h = clamp(rect.y + rect.h, 0, rt.H) - r.y;
    if (r.w <= 0 || r.h <= 0) return;
    const mode = this.viewMode.cut;
    if (mode === 'overlay') this._paintOverlay(r);
    else if (mode === 'mask') this._paintMaskView(r);
    else this._paintCut(r);
    this.rt.dispKey = {};
    this.requestDraw();
  }

  _computeAnts() {
    this._antsDirty = false;
    const rt = this.rt;
    const R = this.refined();
    const st = maskStats(R, rt.W, rt.H, 127);
    if (st.full || st.empty) { this.ants = null; this._antsTick(); return; }
    const polys = maskContours(R, rt.W, rt.H, 1);
    const p = new Path2D();
    for (const pl of polys) {
      p.moveTo(pl[0], pl[1]);
      for (let i = 2; i < pl.length; i += 2) p.lineTo(pl[i], pl[i + 1]);
      p.closePath();
    }
    this.ants = { path: p, polys };
    this._antsTick();
  }

  _antsTick() {
    const want = !!(this.ants && this.step === 'cut' && this.hasImage());
    if (want && !this._antsTimer) this._antsTimer = setInterval(() => { this.antsPhase = (this.antsPhase + 1) % 8; this.requestDraw(); }, 110);
    if (!want && this._antsTimer) { clearInterval(this._antsTimer); this._antsTimer = null; }
  }

  _css(name, fb) { const v = getComputedStyle(this.root).getPropertyValue(name).trim(); return v || fb; }

  _theme() {
    if (!this._themeDirty && this._th) return this._th;
    this._themeDirty = false;
    const light = (document.documentElement.dataset.theme || this.settings.theme) === 'light';
    const pat = canvas(16, 16), pc = ctx2d(pat);
    pc.fillStyle = light ? '#ffffff' : '#3a3a42'; pc.fillRect(0, 0, 16, 16);
    pc.fillStyle = light ? '#e3e1de' : '#2c2c33'; pc.fillRect(0, 0, 8, 8); pc.fillRect(8, 8, 8, 8);
    this._th = {
      light, stage: this._css('--ps-stage', light ? '#e4e2df' : '#0d0d10'),
      accent: this._css('--ps-accent', '#e0455f'), checker: pat,
    };
    return this._th;
  }

  _draw() {
    const cv = this.el.cv, c = ctx2d(cv);
    const dpr = cv.width / Math.max(1, this.el.stage.clientWidth || cv.width);
    const th = this._theme();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = th.stage;
    c.fillRect(0, 0, cv.width, cv.height);
    this._antsTick();
    if (!this.rt) return;
    const rt = this.rt;
    const V = this.viewMatrix(), G = this.geoMatrix();
    const T = M.mul(V, G);
    const setT = (m, s = 1) => c.setTransform(m[0] * dpr * s, m[1] * dpr * s, m[2] * dpr * s, m[3] * dpr * s, m[4] * dpr, m[5] * dpr);
    const cr = this.cropRect();
    const crop = this.step === 'crop';
    const mode = this.displayMode;
    const res = this._showRes && this._showRes.adjKey ? this._showRes : rt.full;
    const sc = rt.W / res.w; // draft canvases are smaller
    c.save();
    // clip to crop (except while cropping)
    if (!crop) { setT(V); c.beginPath(); c.rect(cr.x, cr.y, cr.w, cr.h); c.clip(); }
    // image footprint
    setT(T);
    c.beginPath(); c.rect(0, 0, rt.W, rt.H);
    if (this.comparing) {
      c.imageSmoothingQuality = 'high';
      c.drawImage(rt.work, 0, 0);
    } else if (mode === 'checker' || mode === 'skin') {
      c.save(); c.clip();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = mode === 'skin' ? (this.settings.skinColor || '#d09a74') : c.createPattern(th.checker, 'repeat');
      c.fillRect(0, 0, cv.width, cv.height);
      c.restore();
      setT(T);
    } else if (mode === 'mask' && this.step === 'cut') {
      // drawn below
    }
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = res !== rt.full ? 'medium' : 'high';
    if (!this.comparing) {
      if (this.step === 'cut') {
        if (mode === 'overlay') { c.drawImage(res.cvAdj, 0, 0, rt.W, rt.H); c.drawImage(rt.cvOver, 0, 0); }
        else if (mode === 'mask') c.drawImage(rt.cvMask, 0, 0);
        else c.drawImage(rt.cvCut, 0, 0);
      } else {
        if (mode === 'overlay') {
          c.drawImage(this.st.onlySel ? rt.work : res.cvAdj, 0, 0, rt.W, rt.H);
          c.fillStyle = 'rgba(12,10,16,.62)'; c.fillRect(0, 0, rt.W, rt.H);
        } else if (mode === 'mask') {
          c.fillStyle = '#fff'; c.fillRect(0, 0, rt.W, rt.H);
        }
        if (res.cvFinal && res.finalKey) c.drawImage(res.cvFinal, 0, 0, res.w * sc, res.h * sc);
      }
    }
    c.restore();

    // marching ants
    if (this.step === 'cut' && this.ants && !this.comparing && !(this.gesture && this.gesture.liveMask)) {
      setT(T);
      const z = this.view.z;
      c.lineWidth = 1.6 / z; c.lineJoin = 'round';
      c.setLineDash([]);
      c.strokeStyle = 'rgba(255,255,255,.95)';
      c.stroke(this.ants.path);
      c.setLineDash([5 / z, 5 / z]); c.lineDashOffset = -this.antsPhase * 1.25 / z;
      c.strokeStyle = 'rgba(0,0,0,.95)';
      c.stroke(this.ants.path);
      c.setLineDash([]);
    }
    if (crop) this._drawCrop(c, dpr, V, T);
    this._drawGesture(c, dpr, T);
    const pct = Math.round(this.view.z * 100 / (this._fitZ || 1));
    this.el.zoomChip.textContent = pct === 100 ? 'Fit' : pct + '%';
    this.el.zoomChip.classList.toggle('dim', pct === 100);
  }

  _drawCrop(c, dpr, V, T) {
    const cr = this.cropRect();
    const rt = this.rt;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [x0, y0] = M.apply(V, cr.x, cr.y), [x1, y1] = M.apply(V, cr.x + cr.w, cr.y + cr.h);
    // dim everything outside the crop
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.beginPath(); c.rect(0, 0, c.canvas.width / dpr, c.canvas.height / dpr); c.rect(x0, y0, x1 - x0, y1 - y0); c.fill('evenodd');
    // image outline (rotated)
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1;
    c.beginPath();
    for (const [px, py] of [[0, 0], [rt.W, 0], [rt.W, rt.H], [0, rt.H]]) { const [sx, sy] = M.apply(T, px, py); c.lineTo(sx, sy); }
    c.closePath(); c.stroke();
    // thirds grid
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
    c.beginPath();
    for (let k = 1; k < 3; k++) { const x = x0 + (x1 - x0) * k / 3, y = y0 + (y1 - y0) * k / 3; c.moveTo(x, y0); c.lineTo(x, y1); c.moveTo(x0, y); c.lineTo(x1, y); }
    c.stroke();
    if (this.gesture && this.gesture.tool === 'straighten') {
      c.strokeStyle = 'rgba(255,255,255,.25)';
      c.beginPath();
      for (let k = 1; k < 9; k++) { const x = x0 + (x1 - x0) * k / 9, y = y0 + (y1 - y0) * k / 9; c.moveTo(x, y0); c.lineTo(x, y1); c.moveTo(x0, y); c.lineTo(x1, y); }
      c.stroke();
    }
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // corner handles
    c.lineWidth = 4; c.lineCap = 'square';
    const L = Math.min(22, (x1 - x0) / 3, (y1 - y0) / 3);
    c.beginPath();
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { c.moveTo(cx + dx * L, cy - dy * 2 + dy * 2); c.moveTo(cx + dx * L, cy); c.lineTo(cx, cy); c.lineTo(cx, cy + dy * L); }
    // edge handles
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, E = Math.min(14, (x1 - x0) / 5, (y1 - y0) / 5);
    c.moveTo(mx - E, y0); c.lineTo(mx + E, y0); c.moveTo(mx - E, y1); c.lineTo(mx + E, y1);
    c.moveTo(x0, my - E); c.lineTo(x0, my + E); c.moveTo(x1, my - E); c.lineTo(x1, my + E);
    c.stroke();
    c.restore();
  }

  _drawGesture(c, dpr, T) {
    const g = this.gesture;
    const accent = this._theme().accent;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toS = (p) => M.apply(T, p[0], p[1]);
    const line = (pts, close, dash) => {
      if (!pts || pts.length < 2) return;
      c.beginPath();
      pts.forEach((p, i) => { const [x, y] = toS(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      if (close) c.closePath();
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3.5; c.setLineDash([]); c.stroke();
      c.strokeStyle = this.mode === 'sub' ? '#ff6b7d' : '#fff'; c.lineWidth = 1.6; if (dash) c.setLineDash([6, 4]); c.stroke();
      c.setLineDash([]);
    };
    if (g && (g.tool === 'lasso' || g.tool === 'smart' && g.kind === 'loop')) line(g.pts, false, g.tool === 'smart');
    if (g && g.tool === 'smart' && g.kind === 'box' && g.pts.length > 1) {
      const a = g.pts[0], b = g.pts[g.pts.length - 1];
      line([a, [b[0], a[1]], b, [a[0], b[1]]], true, true);
    }
    if (g && g.tool === 'magnetic') { line(g.fixed.concat(g.live || []), false, false); for (const a of g.anchors) { const [x, y] = toS(a); c.fillStyle = '#fff'; c.fillRect(x - 2.5, y - 2.5, 5, 5); } }
    if (g && g.tool === 'polygon') {
      const pts = g.pts.concat(g.hover ? [g.hover] : []);
      line(pts, false, false);
      g.pts.forEach((p, i) => {
        const [x, y] = toS(p);
        c.beginPath(); c.arc(x, y, i === 0 ? 7 : 4.5, 0, Math.PI * 2);
        c.fillStyle = i === 0 ? accent : '#fff'; c.fill();
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.stroke();
      });
    }
    // brush cursor
    if (this.step === 'cut' && this.tool === 'brush' && this._hover && !this.comparing) {
      const r = this.toolOpts.brush.size / 2;
      c.beginPath(); c.arc(this._hover[0], this._hover[1], r, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = this.mode === 'sub' ? '#ff6b7d' : '#fff'; c.lineWidth = 1.3; c.stroke();
    }
    c.restore();
  }

  /* ════════════════════════════ pointer / gestures ════════════════════════════ */

  _bindStage() {
    const cv = this.el.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.hasImage()) return;
      e.preventDefault();
      this.root.focus({ preventScroll: true });
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const p = pos(e);
      this.pointers.set(e.pointerId, { p, type: e.pointerType });
      if (this.pointers.size === 2) {
        // second finger: cancel a just-started tool gesture and pinch/pan instead
        if (this.gesture && this.gesture.tool !== 'polygon') this._toolCancel(true, true);
        const [a, b] = [...this.pointers.values()].map((v) => v.p);
        this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t: performance.now() };
        return;
      }
      if (this.pointers.size > 2) return;
      const panBtn = e.button === 1 || (e.button === 0 && this._space) || e.button === 2;
      if (panBtn || this.step === 'adjust' || this.step === 'look') {
        // double tap → fit
        const now = performance.now();
        if (!panBtn && this._lastTap && now - this._lastTap.t < 320 && Math.hypot(p[0] - this._lastTap.p[0], p[1] - this._lastTap.p[1]) < 30) { this._lastTap = null; this.fit(); return; }
        this._lastTap = { t: now, p };
        this.pan = { p, tx: this.view.tx, ty: this.view.ty };
        cv.style.cursor = 'grabbing';
        return;
      }
      if (this.step === 'crop') { this._cropDown(p, e); return; }
      if (this.step === 'cut') this._toolDown(p, e);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (e.pointerType === 'mouse') { this._hover = p; if (this.tool === 'brush' && this.step === 'cut') this.requestDraw(); }
      const ptr = this.pointers.get(e.pointerId);
      if (ptr) ptr.p = p;
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()].map((v) => v.p);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.view.tx += c[0] - this.pinch.c[0]; this.view.ty += c[1] - this.pinch.c[1];
        if (this.pinch.d > 10) this.zoomAt(d / this.pinch.d, c[0], c[1]);
        this.pinch.d = d; this.pinch.c = c;
        this._autoFit = false;
        this.requestDraw();
        return;
      }
      if (this.pan) { this.view.tx = this.pan.tx + p[0] - this.pan.p[0]; this.view.ty = this.pan.ty + p[1] - this.pan.p[1]; this._autoFit = false; this.requestDraw(); return; }
      if (this.cropDrag) { this._cropMove(p, e); return; }
      if (this.step === 'cut') {
        if (this.gesture) this._toolMove(p, e);
        else if (this.tool === 'polygon' && e.pointerType === 'mouse' && this.polyHover) { /* noop */ }
      }
      if (this.gesture && this.gesture.tool === 'polygon' && e.pointerType === 'mouse') { this.gesture.hover = this.toSrc(...p); this.requestDraw(); }
    });
    const up = (e) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) { this.pinch = null; if (this.pointers.size === 0) this._lastTap = null; } return; }
      if (this.pan) { this.pan = null; cv.style.cursor = ''; return; }
      if (this.cropDrag) { this._cropUp(); return; }
      if (had && this.gesture && this.step === 'cut') this._toolUp(pos(e), e);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; this.pan = null; if (this.gesture && this.gesture.tool !== 'polygon') this._toolCancel(true); if (this.cropDrag) this._cropUp(); });
    cv.addEventListener('pointerleave', () => { this._hover = null; this.requestDraw(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('dblclick', (e) => {
      if (this.step === 'cut' && this.tool === 'polygon') { this._polyFinish(); return; }
      if (this.step !== 'cut' && this.step !== 'crop') this.fit();
      e.preventDefault();
    });
    cv.addEventListener('wheel', (e) => {
      if (!this.hasImage()) return;
      e.preventDefault();
      const p = pos(e);
      if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && e.deltaMode !== 0) || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 50)) {
        this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), p[0], p[1]);
      } else {
        this.view.tx -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; this.view.ty -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        this._autoFit = false;
        this.requestDraw();
      }
    }, { passive: false });
  }

  _bindGlobal() {
    const visible = () => this.root.isConnected && this.root.getClientRects().length > 0 && this.root.offsetParent !== null;
    const editable = (t) => t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)) && !(t.type === 'range' || t.type === 'checkbox');
    this._on(window, 'keydown', (e) => {
      if (!visible() || !this.hasImage() || editable(e.target)) return;
      if (this.el.layer.childElementCount) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
      if (mod) return;
      if (e.key === ' ') { if (!this._space) { this._space = true; this.el.cv.style.cursor = 'grab'; } e.preventDefault(); return; }
      if (e.key === '\\') { this.comparing = true; this.requestDraw(); return; }
      if (e.key === 'Escape') { this._toolCancel(); return; }
      if (e.key === 'Enter' && this.gesture && this.gesture.tool === 'polygon') { e.preventDefault(); this._polyFinish(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && this.gesture && this.gesture.tool === 'polygon') { e.preventDefault(); this._polyBack(); return; }
      if (e.key === '0' || k === 'f') { this.fit(); return; }
      if (e.key === '+' || e.key === '=') { const r = this.el.stage.getBoundingClientRect(); this.zoomAt(1.25, r.width / 2, r.height / 2); return; }
      if (e.key === '-') { const r = this.el.stage.getBoundingClientRect(); this.zoomAt(0.8, r.width / 2, r.height / 2); return; }
      if (['1', '2', '3', '4'].includes(e.key)) { this.setStep(STEPS[+e.key - 1].id); return; }
      if (this.step === 'cut') {
        const map = { s: 'smart', l: 'lasso', p: 'polygon', m: 'magnetic', w: 'wand', b: 'brush' };
        if (map[k]) { this.setTool(map[k]); return; }
        if (k === 'e') { this.tool = 'brush'; this.setMode('sub'); this.setTool('brush'); return; }
        if (k === 'x') { this.setMode(this.mode === 'add' ? 'sub' : 'add'); return; }
        if (e.key === '[' || e.key === ']') { const b = this.toolOpts.brush; b.size = clamp(Math.round(b.size * (e.key === ']' ? 1.2 : 1 / 1.2)), 4, 300); this._rebuildPanel(); this.requestDraw(); }
      }
    });
    this._on(window, 'keyup', (e) => {
      if (e.key === ' ') { this._space = false; this.el.cv.style.cursor = ''; }
      if (e.key === '\\' && this.comparing) { this.comparing = false; this.requestDraw(); }
    });
    this._on(window, 'paste', (e) => {
      if (!visible() || editable(e.target)) return;
      const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file' && /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); this.loadFiles(files).catch((err) => this._toast(err.message)); }
    });
    const root = this.root;
    root.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('drag'); } });
    root.addEventListener('dragleave', (e) => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('drag'); });
    root.addEventListener('drop', (e) => {
      root.classList.remove('drag');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      this.loadFiles(files).catch((err) => this._toast(err.message || "Couldn't open that picture"));
    });
  }

  /* ---------------- cut tools ---------------- */

  _opMode(e) {
    if (e && e.shiftKey && !e.altKey) return 'add';
    if (e && e.altKey) return 'sub';
    return this.mode;
  }
  /** first additive selection on an untouched (keep-everything) mask starts from empty */
  _base(mode) {
    const rt = this.rt;
    if (!rt.touched && mode === 'add') rt.mask.fill(0);
    rt.touched = true;
  }

  _toolDown(p, e) {
    const s = this.toSrc(...p);
    const mode = this._opMode(e);
    const t = this.tool;
    if (t === 'polygon') {
      const g = this.gesture && this.gesture.tool === 'polygon' ? this.gesture : null;
      if (!g) { this.gesture = { tool: 'polygon', pts: [s], mode, hover: null }; this.el.polyBar.hidden = false; }
      else {
        const [fx, fy] = this.srcToScreen(...g.pts[0]);
        if (g.pts.length >= 3 && Math.hypot(fx - p[0], fy - p[1]) < (e.pointerType === 'mouse' ? 10 : 22)) { this._polyFinish(); return; }
        g.pts.push(s);
        g.downAt = g.pts.length - 1;
      }
      this.gesture.dragIdx = this.gesture.pts.length - 1;
      this.requestDraw();
      return;
    }
    if (t === 'wand') { this._wand(s, mode); return; }
    if (t === 'bg') { this._bgPick(s); return; }
    if (t === 'lasso') { this.gesture = { tool: 'lasso', pts: [s], mode }; return; }
    if (t === 'smart') { this.gesture = { tool: 'smart', pts: [s], mode, kind: 'box', p0: p }; return; }
    if (t === 'magnetic') {
      const E = this._edge();
      const a = snapToEdge(E.grad, this.rt.W, this.rt.H, s[0], s[1], this._magR());
      this.gesture = { tool: 'magnetic', mode, anchors: [a], fixed: [[a[0] + 0.5, a[1] + 0.5]], live: null, last: a };
      this.requestDraw();
      return;
    }
    if (t === 'brush') this._brushDown(s, p, e, mode);
  }

  _toolMove(p, e) {
    const g = this.gesture;
    const s = this.toSrc(...p);
    if (g.tool === 'polygon') { if (g.dragIdx != null && this.pointers.size) { g.pts[g.dragIdx] = s; this.requestDraw(); } return; }
    if (g.tool === 'lasso' || g.tool === 'smart') {
      const last = g.pts[g.pts.length - 1];
      const minD = 1.5 / this.view.z;
      if (Math.hypot(s[0] - last[0], s[1] - last[1]) > minD) g.pts.push(s);
      if (g.tool === 'smart') g.kind = this._smartKind(g.pts);
      this.requestDraw();
      return;
    }
    if (g.tool === 'magnetic') { this._magMove(s); return; }
    if (g.tool === 'brush') this._brushMove(s, p, e);
  }

  _toolUp(p, e) {
    const g = this.gesture;
    if (g.tool === 'polygon') { g.dragIdx = null; this.requestDraw(); return; }
    if (g.tool === 'lasso') {
      this.gesture = null;
      if (g.pts.length < 3 || this._polyArea(g.pts) * this.view.z * this.view.z < 40) { this.requestDraw(); return; }
      this._applyPolygon(g.pts, g.mode, 'Lasso');
      return;
    }
    if (g.tool === 'smart') {
      this.gesture = null;
      const pts = g.pts;
      const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
      const tiny = Math.hypot((bx - ax) * this.view.z, (by - ay) * this.view.z) < 12 && this._polyArea(pts) * this.view.z * this.view.z < 400;
      if (tiny) {
        // a tap: select the subject automatically (or the object under the finger)
        this.selectSubject(g.mode);
        return;
      }
      let poly = pts;
      if (g.kind === 'box') poly = [[ax, ay], [bx, ay], [bx, by], [ax, by]];
      this.smartSelect(poly, g.mode);
      return;
    }
    if (g.tool === 'magnetic') { this._magFinish(); return; }
    if (g.tool === 'brush') this._brushUp();
  }

  _toolCancel(silent = false, revert = true) {
    const g = this.gesture;
    if (!g) return;
    if (g.tool === 'brush' && revert && g.before) { this.rt.mask.set(g.orig || g.before); this.rt.touched = g.origTouched; this._maskChanged(); this.rt.dispKey = {}; this.requestRender(); }
    this.gesture = null;
    this.el.polyBar.hidden = true;
    this.requestDraw();
    void silent;
  }

  _polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); }
  _smartKind(pts) {
    if (pts.length < 6) return 'box';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
    for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (i) len += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]); }
    const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
    const area = this._polyArea(pts), box = (x1 - x0) * (y1 - y0) || 1;
    return len > diag * 1.8 && area > box * 0.18 ? 'loop' : 'box';
  }

  _polyBack() {
    const g = this.gesture;
    if (!g || g.tool !== 'polygon') return;
    g.pts.pop();
    if (!g.pts.length) this._toolCancel();
    this.requestDraw();
  }
  _polyFinish() {
    const g = this.gesture;
    if (!g || g.tool !== 'polygon') return;
    this.gesture = null;
    this.el.polyBar.hidden = true;
    // drop accidental duplicate points from a double tap
    const pts = g.pts.filter((p, i) => !i || Math.hypot(p[0] - g.pts[i - 1][0], p[1] - g.pts[i - 1][1]) * this.view.z > 3);
    if (pts.length >= 3) this._applyPolygon(pts, g.mode, 'Polygon');
    else this.requestDraw();
  }

  _applyPolygon(pts, mode, label) {
    const rt = this.rt;
    const cov = polygonCoverage(pts, rt.W, rt.H);
    if (!cov) { this.requestDraw(); return; }
    this._base(mode);
    applyCoverage(rt.mask, rt.W, rt.H, cov, mode === 'sub' ? 'sub' : 'add');
    this._afterMaskEdit(label + (mode === 'sub' ? ' (remove)' : ''));
  }

  _afterMaskEdit(label) {
    this._maskChanged();
    this.rt.dispKey = {};
    this._commit(label);
    this._rebuildPanelSoon();
    this.requestRender();
  }
  _rebuildPanelSoon() { clearTimeout(this._rpT); this._rpT = setTimeout(() => this._rebuildPanel(), 0); }

  _wand(s, mode) {
    const rt = this.rt, o = this.toolOpts.wand;
    const sel = magicWand(rt.rgba, rt.W, rt.H, s[0], s[1], o.tol, o.contiguous);
    this._base(mode);
    mergeMask(rt.mask, sel, mode === 'sub' ? 'sub' : 'add');
    this._afterMaskEdit(mode === 'sub' ? 'Magic wand (remove)' : 'Magic wand');
  }

  /* background removal: a live session that can be re-tuned with the tolerance slider */
  removeBg({ sample = null, fresh = true } = {}) {
    const rt = this.rt, o = this.toolOpts.bg;
    if (fresh || !this.bgSession) this.bgSession = { before: rt.mask.slice(), touched: rt.touched, sample };
    if (sample) this.bgSession.sample = sample;
    const S = this.bgSession;
    const done = this.busy('Removing background…');
    setTimeout(() => {
      try {
        const keep = removeBackground(rt.rgba, rt.W, rt.H, { tol: o.tol, contiguous: o.contiguous, sample: S.sample });
        rt.mask.set(S.before);
        if (!S.touched) rt.mask.set(keep);
        else mergeMask(rt.mask, keep, 'intersect');
        rt.touched = true;
        this._maskChanged();
        rt.dispKey = {};
        if (this._bgCommitted) { this.hist.stack.length = this.hist.i; this.hist.i--; }
        this._commit('Remove background');
        this._bgCommitted = true;
        this.requestRender();
      } finally { done(); }
    }, 20);
  }
  endBgSession() { this.bgSession = null; this._bgCommitted = false; }
  _bgPick(s) {
    const rt = this.rt;
    const x = clamp(Math.round(s[0]), 0, rt.W - 1), y = clamp(Math.round(s[1]), 0, rt.H - 1);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = clamp(x + dx, 0, rt.W - 1), yy = clamp(y + dy, 0, rt.H - 1), i = (yy * rt.W + xx) * 4;
      r += rt.rgba[i]; g += rt.rgba[i + 1]; b += rt.rgba[i + 2]; n++;
    }
    this.removeBg({ sample: [r / n, g / n, b / n], fresh: !this.bgSession });
  }

  /* magnetic lasso */
  _edge() { if (!this.rt.edge) this.rt.edge = edgeCost(this.rt.rgba, this.rt.W, this.rt.H); return this.rt.edge; }
  _magR() { return Math.max(3, (this.toolOpts.magnetic.width * 1.4) / this.view.z * (this.phone ? 1.6 : 1)); }
  _magMove(s) {
    const g = this.gesture, rt = this.rt, E = this._edge();
    const tgt = snapToEdge(E.grad, rt.W, rt.H, s[0], s[1], this._magR());
    const a = g.last;
    const d = Math.hypot(tgt[0] - a[0], tgt[1] - a[1]);
    if (d < 1) return;
    const margin = Math.max(8, Math.min(40, this._magR() * 2));
    const path = livewire(E.cost, rt.W, rt.H, a[0], a[1], tgt[0], tgt[1], margin);
    // commit a stretch once the path is long enough (auto anchor points)
    const step = Math.max(14, 46 / this.view.z);
    if (d > step) {
      const cut = Math.max(1, Math.floor(path.length * 0.75));
      const keep = path.slice(1, cut + 1);
      g.fixed.push(...keep);
      const na = keep[keep.length - 1];
      g.last = [Math.floor(na[0]), Math.floor(na[1])];
      g.anchors.push(g.last);
      g.live = livewire(E.cost, rt.W, rt.H, g.last[0], g.last[1], tgt[0], tgt[1], margin).slice(1);
    } else g.live = path.slice(1);
    this.requestDraw();
  }
  _magFinish() {
    const g = this.gesture, rt = this.rt;
    this.gesture = null;
    let pts = g.fixed.concat(g.live || []);
    if (pts.length < 6) { this.requestDraw(); return; }
    // close back to the start along the edge when it is near, straight otherwise
    const a = pts[pts.length - 1], b = pts[0];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d > 2 && d < 260) {
      const E = this._edge();
      const back = livewire(E.cost, rt.W, rt.H, a[0], a[1], b[0], b[1], Math.min(30, d * 0.4 + 6));
      pts = pts.concat(back.slice(1));
    }
    this._applyPolygon(smoothPath(pts, 2), g.mode, 'Magnetic lasso');
  }

  /* brush */
  _brushDown(s, p, e, mode) {
    const rt = this.rt;
    const orig = rt.touched ? null : rt.mask.slice(), origTouched = rt.touched;
    this._base(mode);
    const n = rt.W * rt.H;
    if (!this._strokeBuf || this._strokeBuf.length !== n) this._strokeBuf = new Float32Array(n);
    else this._strokeBuf.fill(0);
    const o = this.toolOpts.brush;
    const g = this.gesture = { tool: 'brush', mode, before: rt.mask.slice(), orig, origTouched, last: s, liveMask: true, box: null, allow: o.smart ? new Uint8Array(n) : null, seed: null };
    if (o.smart) { const E = this._edge(); g.E = E; const i = (clamp(Math.round(s[1]), 0, rt.H - 1) * rt.W + clamp(Math.round(s[0]), 0, rt.W - 1)) * 4; g.seed = [rt.rgba[i], rt.rgba[i + 1], rt.rgba[i + 2]]; }
    this._dab(s, e);
  }
  _brushMove(s, p, e) {
    const g = this.gesture;
    const o = this.toolOpts.brush;
    const r = o.size / 2 / this.view.z;
    const d = Math.hypot(s[0] - g.last[0], s[1] - g.last[1]);
    const step = Math.max(0.6, r * 0.22);
    if (d < step) return;
    const n = Math.floor(d / step);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this._dab([g.last[0] + (s[0] - g.last[0]) * t, g.last[1] + (s[1] - g.last[1]) * t], e);
    }
    g.last = s;
  }
  _dab(s, e) {
    const rt = this.rt, g = this.gesture, o = this.toolOpts.brush;
    const pressure = e && e.pointerType === 'pen' && e.pressure > 0 ? 0.25 + e.pressure * 0.95 : 1;
    const r = Math.max(0.6, o.size / 2 / this.view.z * pressure);
    let allow = null;
    if (g.allow) allow = smartRegion(rt.rgba, g.E.grad, g.E.ref, rt.W, rt.H, s[0], s[1], r, g.allow, null);
    const box = stampDab(this._strokeBuf, rt.W, rt.H, s[0], s[1], r, o.hardness / 100, o.opacity / 100, allow);
    // apply the stroke buffer to the mask inside the dab box
    const buf = this._strokeBuf, m = rt.mask, before = g.before, W = rt.W;
    const add = g.mode !== 'sub';
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
      const i = y * W + x, a = buf[i];
      if (!a) continue;
      const b = before[i];
      m[i] = add ? b + (255 - b) * a : b * (1 - a);
    }
    this._paintDirty(box);
  }
  _brushUp() {
    const g = this.gesture;
    this.gesture = null;
    this._afterMaskEdit(g.mode === 'sub' ? 'Erase brush' : 'Keep brush');
  }

  /* ---------------- smart select (GrabCut) ---------------- */

  _initWorker() {
    this.rw = null;
    try {
      const rw = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
      rw.onmessage = (e) => this._onRender(e.data || {});
      rw.onerror = (e) => { e.preventDefault && e.preventDefault(); this.rw = null; this._inflight = null; this.requestRender(); };
      this.rw = rw;
    } catch { this.rw = null; }
    this.worker = null;
    this._jobs = new Map();
    this._jobId = 1;
    try {
      const w = new Worker(new URL('./seg-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const j = this._jobs.get(e.data.id); if (!j) return; this._jobs.delete(e.data.id); if (e.data.error) j.fail(new Error(e.data.error)); else j.ok(e.data.result); };
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); this.worker = null; for (const j of this._jobs.values()) j.fallback(); this._jobs.clear(); };
      this.worker = w;
    } catch { this.worker = null; }
  }

  _runSeg(job) {
    const local = () => new Promise((res, rej) => setTimeout(() => { try { res(runSmartSelect(job)); } catch (e) { rej(e); } }, 30));
    if (!this.worker) return local();
    return new Promise((ok, fail) => {
      const id = this._jobId++;
      let settled = false;
      const done = (f) => (v) => { if (settled) return; settled = true; clearTimeout(timer); f(v); };
      const entry = { ok: done(ok), fail: done(fail), fallback: () => { if (!settled) { settled = true; clearTimeout(timer); local().then(ok, fail); } } };
      const timer = setTimeout(() => { this._jobs.delete(id); entry.fallback(); }, 20000);
      this._jobs.set(id, entry);
      try {
        const copy = { ...job, rgba: job.rgba.slice(), region: job.region ? job.region.slice() : undefined };
        this.worker.postMessage({ id, job: copy }, [copy.rgba.buffer].concat(copy.region ? [copy.region.buffer] : []));
      } catch { this._jobs.delete(id); entry.fallback(); }
    });
  }

  /** Smart select inside a polygon (box or loop) in source coords. */
  async smartSelect(poly, mode = 'add') {
    const rt = this.rt;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mw = (x1 - x0) * 0.14 + 10, mh = (y1 - y0) * 0.14 + 10;
    const box = { x: clamp(Math.floor(x0 - mw), 0, rt.W - 1), y: clamp(Math.floor(y0 - mh), 0, rt.H - 1) };
    box.w = clamp(Math.ceil(x1 + mw), 1, rt.W) - box.x; box.h = clamp(Math.ceil(y1 + mh), 1, rt.H) - box.y;
    if (box.w < 4 || box.h < 4) return;
    await this._segmentIn(box, poly, mode, 'Smart select');
  }

  /** "Select subject": saliency + GrabCut over the whole photo. */
  async selectSubject(mode = 'add') {
    const rt = this.rt;
    await this._segmentIn({ x: 0, y: 0, w: rt.W, h: rt.H }, null, mode, 'Select subject');
  }

  async _segmentIn(box, poly, mode, label) {
    const rt = this.rt;
    const doc = this.doc;
    const done = this.busy(poly ? 'Finding the edges…' : 'Finding the subject…');
    const t0 = performance.now();
    try {
      const s = Math.min(1, SEG_MAX / Math.max(box.w, box.h));
      const sw = Math.max(8, Math.round(box.w * s)), sh = Math.max(8, Math.round(box.h * s));
      const sc = canvas(sw, sh), cx = ctx2d(sc);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(rt.work, box.x, box.y, box.w, box.h, 0, 0, sw, sh);
      const rgba = cx.getImageData(0, 0, sw, sh).data;
      const job = { rgba, w: sw, h: sh, mode: poly ? 'region' : 'auto' };
      if (poly) {
        cx.clearRect(0, 0, sw, sh);
        cx.fillStyle = '#fff';
        cx.beginPath();
        poly.forEach(([x, y], i) => { const px = (x - box.x) * sw / box.w, py = (y - box.y) * sh / box.h; if (i) cx.lineTo(px, py); else cx.moveTo(px, py); });
        cx.closePath(); cx.fill();
        const a = cx.getImageData(0, 0, sw, sh).data, reg = new Uint8Array(sw * sh);
        for (let i = 0; i < reg.length; i++) reg[i] = a[i * 4 + 3];
        job.region = reg;
      }
      const res = await this._runSeg(job);
      if (this.doc !== doc || !this.rt) return;
      // edge-aware upsample to the working resolution, inside the box
      const sub = new Uint8ClampedArray(box.w * box.h * 4);
      for (let y = 0; y < box.h; y++) sub.set(rt.rgba.subarray(((box.y + y) * rt.W + box.x) * 4, ((box.y + y) * rt.W + box.x + box.w) * 4), y * box.w * 4);
      const up = guidedUpsample(res.mask, sw, sh, sub, box.w, box.h, { bytes: true });
      const st = maskStats(up, box.w, box.h, 127);
      if (st.empty) { this._toast(poly ? 'Couldn’t find a clear subject there — try a looser box, or the lasso' : 'Couldn’t find a clear subject — drag a box around it'); return; }
      const full = new Uint8Array(rt.W * rt.H);
      for (let y = 0; y < box.h; y++) full.set(up.subarray(y * box.w, (y + 1) * box.w), (box.y + y) * rt.W + box.x);
      this._base(mode);
      mergeMask(rt.mask, full, mode === 'sub' ? 'sub' : 'add');
      this._lastSegMs = performance.now() - t0;
      this._afterMaskEdit(label);
    } catch (e) {
      console.error(e);
      this._toast('Smart select failed: ' + (e.message || e));
    } finally { done(); }
  }

  /** Snap the current selection edge to the real edges in the photo (guided filter). */
  snapEdges() {
    const rt = this.rt;
    if (!rt.touched) { this._toast('Select something first'); return; }
    const done = this.busy('Snapping to edges…');
    setTimeout(() => {
      try {
        const f = new Float32Array(rt.W * rt.H);
        for (let i = 0; i < f.length; i++) f[i] = rt.mask[i] / 255;
        const q = guidedFilter(rt.rgba, rt.W, rt.H, f, 7, 6e-4, 2);
        for (let i = 0; i < f.length; i++) rt.mask[i] = clamp01((q[i] - 0.5) * 1.8 + 0.5) * 255 + 0.5;
        this._afterMaskEdit('Snap to edges');
      } finally { done(); }
    }, 20);
  }

  maskAction(kind) {
    const rt = this.rt;
    if (kind === 'invert') { for (let i = 0; i < rt.mask.length; i++) rt.mask[i] = 255 - rt.mask[i]; rt.touched = true; }
    else if (kind === 'all') { rt.mask.fill(255); rt.touched = true; }
    else if (kind === 'clear') { rt.mask.fill(0); rt.touched = true; }
    this._afterMaskEdit({ invert: 'Invert', all: 'Select all', clear: 'Clear selection' }[kind]);
  }

  /** Mask statistics for the panel (coverage etc.). */
  maskInfo() { return maskStats(this.refined(), this.rt.W, this.rt.H, 127); }

  /* ---------------- adjust helpers ---------------- */

  histogram() {
    const res = this._showRes && this._showRes.adjKey ? this._showRes : this.rt.full;
    if (!res.adjKey) this._ensureAdj(res);
    const m = this.st.onlySel && this.rt.touched ? this._resMask(res) : null;
    return histogram(res.adj, res.w * res.h, m, res === this.rt.full ? 3 : 1);
  }
  auto() {
    const rt = this.rt;
    const m = this.rt.touched ? this.refined() : null;
    const a = autoAdjust(rt.rgba, rt.W * rt.H, m);
    const was = JSON.stringify(this.st.adjust);
    const isAuto = this._autoSig === was;
    if (isAuto) { for (const k of Object.keys(a)) this.st.adjust[k] = 0; this._autoSig = null; this._commit('Auto off'); }
    else { Object.assign(this.st.adjust, a); this._autoSig = JSON.stringify(this.st.adjust); this._commit('Auto'); }
    this._rebuildPanel();
    this.requestRender();
    return !isAuto;
  }
  get autoOn() { return this._autoSig === JSON.stringify(this.st.adjust); }

  /** Small preview renders for filter / look thumbnails (rendered larger, then scaled down). */
  thumbSource(R) {
    const rt = this.rt;
    const key = rt.maskVer + '|' + R + '|' + JSON.stringify(this.st.refine);
    this._thumbSrcs = this._thumbSrcs || new Map();
    const hit = this._thumbSrcs.get(R);
    if (hit && hit.key === key) return hit;
    // crop to the kept area so thumbnails show the subject
    const st = rt.touched ? this.maskInfo() : null;
    let b = st && st.bbox ? st.bbox : { x: 0, y: 0, w: rt.W, h: rt.H };
    const side = Math.max(b.w, b.h) * 1.06;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    b = { x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), w: Math.round(side), h: Math.round(side) };
    const c = canvas(R, R), x = ctx2d(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, R, R);
    x.imageSmoothingQuality = 'high';
    x.drawImage(rt.work, b.x, b.y, b.w, b.h, 0, 0, R, R);
    const rgba = x.getImageData(0, 0, R, R).data;
    const M2 = this.refined(), mask = new Uint8Array(R * R);
    for (let yy = 0; yy < R; yy++) for (let xx = 0; xx < R; xx++) {
      const sx = Math.floor(b.x + (xx + 0.5) * b.w / R), sy = Math.floor(b.y + (yy + 0.5) * b.h / R);
      mask[yy * R + xx] = sx < 0 || sy < 0 || sx >= rt.W || sy >= rt.H ? 0 : M2[sy * rt.W + sx];
    }
    const T = { key, rgba, mask, size: R, k: R / b.w, gx: b.x, gy: b.y, side: b.w };
    this._thumbSrcs.set(R, T);
    return T;
  }

  renderThumb(target, { adjust = this.st.adjust, look = null, size = 96 } = {}) {
    const side = this.thumbSource(size * 2).side;
    const R = look ? Math.min(400, Math.max(size * 2, Math.round(side * 0.42))) : size * 2;
    const T = this.thumbSource(R);
    const S = makeSource(T.rgba, R, R, { k: T.k, gx: T.gx, gy: T.gy, GW: this.rt.W, GH: this.rt.H });
    let px = adjustIsIdentity(adjust) ? T.rgba : applyAdjust(S, prepareAdjust(adjust), new Uint8ClampedArray(T.rgba.length));
    if (look) px = renderLookROI(px, R, R, look, { k: T.k, gx: T.gx, gy: T.gy, mask: this.rt.touched ? T.mask : null });
    const out = new Uint8ClampedArray(px.length);
    const touched = this.rt.touched;
    for (let i = 0; i < R * R; i++) { out[i * 4] = px[i * 4]; out[i * 4 + 1] = px[i * 4 + 1]; out[i * 4 + 2] = px[i * 4 + 2]; out[i * 4 + 3] = px[i * 4 + 3] * (touched ? T.mask[i] / 255 : 1); }
    const tmp = canvas(R, R);
    ctx2d(tmp).putImageData(new ImageData(out, R, R), 0, 0);
    target.width = size; target.height = size;
    const tc = ctx2d(target);
    tc.clearRect(0, 0, size, size);
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(tmp, 0, 0, size, size);
  }

  /* ════════════════════════════ crop ════════════════════════════ */

  _cropHit(p) {
    const V = this.viewMatrix(), cr = this.cropRect();
    const [x0, y0] = M.apply(V, cr.x, cr.y), [x1, y1] = M.apply(V, cr.x + cr.w, cr.y + cr.h);
    const R = this.phone || isTouch() ? 26 : 16;
    const nx = Math.abs(p[0] - x0) < R ? 'l' : Math.abs(p[0] - x1) < R ? 'r' : '';
    const ny = Math.abs(p[1] - y0) < R ? 't' : Math.abs(p[1] - y1) < R ? 'b' : '';
    const inX = p[0] > x0 - R && p[0] < x1 + R, inY = p[1] > y0 - R && p[1] < y1 + R;
    if ((nx || ny) && inX && inY) return (ny + nx) || null;
    if (p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1) return 'move';
    return null;
  }
  _cropDown(p, e) {
    const hit = this._cropHit(p);
    if (!hit) { this.pan = { p, tx: this.view.tx, ty: this.view.ty }; return; }
    this.cropDrag = { hit, p0: this.toFrame(...p), start: this.cropRect() };
    void e;
  }
  aspectValue(id = this.st.geom.aspect) {
    const [FW, FH] = this.frameDims();
    const map = { free: null, original: FW / FH, square: 1, '4:5': 4 / 5, '3:4': 3 / 4, '2:3': 2 / 3, '16:9': 16 / 9, band: 4 };
    return map[id] ?? null;
  }
  _cropMove(p) {
    const d = this.cropDrag;
    const [fx, fy] = this.toFrame(...p);
    const dx = fx - d.p0[0], dy = fy - d.p0[1];
    let { x, y, w, h: hh } = d.start;
    const [FW, FH] = this.frameDims();
    const min = Math.max(8, 24 / this.view.z);
    if (d.hit === 'move') { x = clamp(x + dx, 0, FW - w); y = clamp(y + dy, 0, FH - hh); }
    else {
      let l = x, t = y, r = x + w, b = y + hh;
      if (d.hit.includes('l')) l = clamp(l + dx, 0, r - min);
      if (d.hit.includes('r')) r = clamp(r + dx, l + min, FW);
      if (d.hit.includes('t')) t = clamp(t + dy, 0, b - min);
      if (d.hit.includes('b')) b = clamp(b + dy, t + min, FH);
      const ar = this._cropAspect();
      if (ar) {
        let cw = r - l, ch = b - t;
        if (d.hit.length === 2) { if (cw / ch > ar) cw = ch * ar; else ch = cw / ar; }
        else if (d.hit === 'l' || d.hit === 'r') ch = cw / ar; else cw = ch * ar;
        // anchor at the opposite edge/corner
        if (d.hit.includes('l')) l = r - cw; else if (!d.hit.includes('r')) { const c = (l + r) / 2; l = c - cw / 2; }
        if (d.hit.includes('t')) t = b - ch; else if (!d.hit.includes('b')) { const c = (t + b) / 2; t = c - ch / 2; }
        r = l + cw; b = t + ch;
        if (l < 0 || t < 0 || r > FW || b > FH) return; // would leave the photo
      }
      x = l; y = t; w = r - l; hh = b - t;
    }
    this._setCrop({ x, y, w, h: hh }, d.hit === 'move');
    this.requestDraw();
  }
  _cropUp() { this.cropDrag = null; this._commit('Crop'); this.requestRender(); }
  _cropAspect() {
    const a = this.aspectValue();
    if (!a || this.st.geom.aspect === 'band' || this.st.geom.aspect === 'square' || this.st.geom.aspect === 'original' || this.st.geom.aspect === 'free') return a;
    const c = this.cropRect();
    return c.h > c.w ? Math.min(a, 1 / a) : Math.max(a, 1 / a);
  }
  /** Set crop in frame px; keep it inside the (possibly straightened) photo. */
  _setCrop(r, moving = false) {
    const [FW, FH] = this.frameDims();
    r = this._fitInside(r, moving);
    this.st.geom.crop = { x: r.x / FW, y: r.y / FH, w: r.w / FW, h: r.h / FH };
  }
  _insideImage(px, py) {
    const g = this.st.geom;
    if (!g.angle) return true;
    const [FW, FH] = this.frameDims();
    const a = -g.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const x = px - FW / 2, y = py - FH / 2;
    const u = x * c - y * s, v = x * s + y * c;
    return Math.abs(u) <= FW / 2 + 1e-6 && Math.abs(v) <= FH / 2 + 1e-6;
  }
  _fitInside(r, moving) {
    const ok = (q) => [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]].every(([x, y]) => this._insideImage(x, y));
    if (ok(r)) return r;
    if (moving) { const prev = this.cropRect(); if (ok(prev)) return prev; }
    const [FW, FH] = this.frameDims();
    // shrink about the centre (moved towards the frame centre) until it fits
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let it = 0; it < 30; it++) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; const q = { x: cx - r.w * m / 2, y: cy - r.h * m / 2, w: r.w * m, h: r.h * m }; if (ok(q)) lo = m; else hi = m; }
      if (lo > 0.05) return { x: cx - r.w * lo / 2, y: cy - r.h * lo / 2, w: r.w * lo, h: r.h * lo };
      cx += (FW / 2 - cx) * 0.3; cy += (FH / 2 - cy) * 0.3;
    }
    return { x: FW / 2 - 4, y: FH / 2 - 4, w: 8, h: 8 };
  }
  setAspect(id) {
    const g = this.st.geom;
    g.aspect = id;
    const a = this._cropAspect();
    if (a) {
      const [FW, FH] = this.frameDims();
      const c = this.cropRect();
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      let w = FW, hh = FW / a;
      if (hh > FH) { hh = FH; w = FH * a; }
      const x = clamp(cx - w / 2, 0, FW - w), y = clamp(cy - hh / 2, 0, FH - hh);
      this._setCrop({ x, y, w, h: hh });
    }
    this._commit('Aspect');
    this.fit();
    this.requestRender();
  }
  rotate90(dir = -1) {
    const g = this.st.geom, c = g.crop;
    if (dir > 0) g.crop = { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w };
    else g.crop = { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
    g.rot = (g.rot + (dir > 0 ? 1 : 3)) % 4;
    this._commit('Rotate');
    this.fit(); this.requestRender();
  }
  flip(axis) {
    const g = this.st.geom, c = g.crop;
    if (axis === 'h') { g.flipH = !g.flipH; c.x = 1 - c.x - c.w; g.angle = -g.angle; }
    else { g.flipV = !g.flipV; c.y = 1 - c.y - c.h; g.angle = -g.angle; }
    this._commit(axis === 'h' ? 'Flip horizontal' : 'Flip vertical');
    this._rebuildPanel();
    this.requestRender();
  }
  /** Straighten: rotate and auto-crop to the largest rect (current aspect) inside the photo. */
  straighten(deg, commit = false) {
    const g = this.st.geom;
    g.angle = clamp(deg, -45, 45);
    const [FW, FH] = this.frameDims();
    const c = this._straightenBase || (this._straightenBase = this.cropRect());
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    this._setCrop({ x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h });
    void FW; void FH;
    if (commit) { this._straightenBase = null; this._commit('Straighten'); }
    this.requestRender();
  }
  autoTrim() {
    const rt = this.rt;
    if (!this.ants || !this.ants.polys.length) {
      const st = this.maskInfo();
      if (!st.bbox || st.full) { this._toast('Cut something out first — then I can trim to it'); return; }
    }
    const G = this.geoMatrix();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const polys = this.ants ? this.ants.polys : [];
    for (const pl of polys) for (let i = 0; i < pl.length; i += 2) { const [x, y] = M.apply(G, pl[i], pl[i + 1]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!isFinite(x0)) { const b = this.maskInfo().bbox; for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]) { const q = M.apply(G, x, y); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } }
    const [FW, FH] = this.frameDims();
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03;
    x0 = clamp(x0 - pad, 0, FW); y0 = clamp(y0 - pad, 0, FH); x1 = clamp(x1 + pad, 0, FW); y1 = clamp(y1 + pad, 0, FH);
    this.st.geom.aspect = 'free';
    this._setCrop({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    void rt;
    this._commit('Trim to subject');
    this._rebuildPanel();
    this.fit(); this.requestRender();
  }

  /* ════════════════════════════ output ════════════════════════════ */

  _renderOutput() {
    const rt = this.rt;
    const G = this.geoMatrix();
    const cr = this.cropRect();
    // 1) working-resolution result → find the kept bounds inside the crop
    const res = rt.full;
    this._ensureAdj(res);
    this._ensureLook(res);
    const m = this._resMask(res);
    const n = rt.W * rt.H, fin = new Uint8ClampedArray(n * 4), L = res.look;
    for (let i = 0, j = 0; i < n; i++, j += 4) { fin[j] = L[j]; fin[j + 1] = L[j + 1]; fin[j + 2] = L[j + 2]; fin[j + 3] = L[j + 3] * m[i] / 255; }
    const wcv = canvas(rt.W, rt.H); ctx2d(wcv).putImageData(new ImageData(fin, rt.W, rt.H), 0, 0);
    const cw = Math.max(1, Math.round(cr.w)), ch = Math.max(1, Math.round(cr.h));
    const probe = canvas(cw, ch), pc = ctx2d(probe);
    const PT = M.mul(M.translate(-cr.x, -cr.y), G);
    pc.setTransform(...PT); pc.imageSmoothingQuality = 'high'; pc.drawImage(wcv, 0, 0);
    const bb = alphaBox(pc.getImageData(0, 0, cw, ch).data, cw, ch, 6);
    if (!bb) return null;
    // trimmed rect in frame px
    const tr = { x: cr.x + bb.x, y: cr.y + bb.y, w: bb.w, h: bb.h };
    // 2) output scale (px per working px): best available, capped at OUT_MAX
    const longW = Math.max(tr.w, tr.h);
    const k = Math.max(0.05, Math.min(rt.fs, OUT_MAX / longW));
    let layer, LT; // layer canvas + transform (layer px → frame px)
    if (k <= 1.08) {
      layer = wcv; LT = G; // working resolution is enough
    } else {
      // region of the source that maps into the trimmed rect (+ margin for filters)
      const IG = M.inv(G);
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
      for (const [x, y] of [[tr.x, tr.y], [tr.x + tr.w, tr.y], [tr.x + tr.w, tr.y + tr.h], [tr.x, tr.y + tr.h]]) { const q = M.apply(IG, x, y); sx0 = Math.min(sx0, q[0]); sy0 = Math.min(sy0, q[1]); sx1 = Math.max(sx1, q[0]); sy1 = Math.max(sy1, q[1]); }
      const mg = 12;
      sx0 = Math.max(0, Math.floor(sx0 - mg)); sy0 = Math.max(0, Math.floor(sy0 - mg));
      sx1 = Math.min(rt.W, Math.ceil(sx1 + mg)); sy1 = Math.min(rt.H, Math.ceil(sy1 + mg));
      const rw = sx1 - sx0, rh = sy1 - sy0;
      const lw = Math.max(1, Math.round(rw * k)), lh = Math.max(1, Math.round(rh * k));
      const kk = lw / rw;
      const lc = canvas(lw, lh), lx = ctx2d(lc);
      lx.imageSmoothingQuality = 'high';
      lx.drawImage(rt.src, sx0 * rt.fs, sy0 * rt.fs, rw * rt.fs, rh * rt.fs, 0, 0, lw, lh);
      const px = lx.getImageData(0, 0, lw, lh).data;
      const S = makeSource(px, lw, lh, { k: kk, gx: sx0, gy: sy0, GW: rt.W, GH: rt.H });
      const adj = adjustIsIdentity(this.st.adjust) ? px : applyAdjust(S, prepareAdjust(this.st.adjust), new Uint8ClampedArray(px.length));
      // mask: refined working mask, upsampled; edges re-snapped to the high-res photo when not feathered
      const wm = new Float32Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) wm[y * rw + x] = m[(sy0 + y) * rt.W + sx0 + x] / 255;
      let up = resample(wm, rw, rh, lw, lh);
      if (!(this.st.refine.feather > 0) && kk > 1.3) {
        const q = guidedFilter(adj, lw, lh, up, Math.max(2, Math.round(kk * 1.5)), 4e-4, Math.max(1, Math.round(kk / 2)));
        for (let i = 0; i < up.length; i++) { const u = up[i]; if (u > 0.01 && u < 0.99) up[i] = clamp01((q[i] - 0.5) * 1.35 + 0.5) * 0.7 + u * 0.3; }
      }
      const mk = new Uint8Array(lw * lh);
      for (let i = 0; i < mk.length; i++) mk[i] = up[i] * 255 + 0.5;
      const look = this.st.look.id === 'photo' && !this.st.look.white && (this.st.look.strength ?? 100) >= 100 ? adj : renderLookROI(adj, lw, lh, this.st.look, { k: kk, gx: sx0, gy: sy0, mask: mk });
      const outPx = new Uint8ClampedArray(lw * lh * 4);
      for (let i = 0, j = 0; i < lw * lh; i++, j += 4) { outPx[j] = look[j]; outPx[j + 1] = look[j + 1]; outPx[j + 2] = look[j + 2]; outPx[j + 3] = look[j + 3] * mk[i] / 255; }
      layer = canvas(lw, lh); ctx2d(layer).putImageData(new ImageData(outPx, lw, lh), 0, 0);
      LT = M.mul(G, M.mul(M.translate(sx0, sy0), M.scale(1 / kk)));
    }
    // 3) draw into the trimmed output (frame px * k), then trim exactly + 2% padding
    const ow = Math.max(1, Math.round(tr.w * k)), oh = Math.max(1, Math.round(tr.h * k));
    const oc = canvas(ow, oh), ox = ctx2d(oc);
    ox.setTransform(...M.mul(M.scale(k), M.mul(M.translate(-tr.x, -tr.y), LT)));
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    // clip to the crop
    ox.save();
    ox.drawImage(layer, 0, 0);
    ox.restore();
    ox.setTransform(1, 0, 0, 1, 0, 0);
    ox.globalCompositeOperation = 'destination-in';
    ox.fillStyle = '#000';
    ox.fillRect(Math.round((cr.x - tr.x) * k), Math.round((cr.y - tr.y) * k), Math.round(cr.w * k), Math.round(cr.h * k));
    ox.globalCompositeOperation = 'source-over';
    const b2 = alphaBox(ox.getImageData(0, 0, ow, oh).data, ow, oh, 4);
    if (!b2) return null;
    const pad = Math.round(Math.max(b2.w, b2.h) * 0.02) + 2;
    const fw = b2.w + pad * 2, fh = b2.h + pad * 2;
    const sc = Math.min(1, OUT_MAX / Math.max(fw, fh));
    const out = canvas(Math.round(fw * sc), Math.round(fh * sc));
    const fx = ctx2d(out);
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(oc, b2.x, b2.y, b2.w, b2.h, Math.round(pad * sc), Math.round(pad * sc), Math.round(b2.w * sc), Math.round(b2.h * sc));
    out.dataset && (out.dataset.name = this.name);
    return out;
  }
}

function alphaBox(d, w, h, thr = 6) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export default PhotoStudio;
