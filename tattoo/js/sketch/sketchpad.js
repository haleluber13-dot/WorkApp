// InkForm 3D — Sketch studio (drawing pad for tattoo designs).
// Public API (see ARCHITECTURE.md):
//   new SketchPad(container, { width = 1024, height = 1024, settings = {} })
//   setSettings(s) · loadImage(src|canvas|svgString) · clear() · undo() · redo()
//   toCanvas() · toDataURL() · toTrimmedCanvas(padding) · isEmpty() · getState() · setState(json)
//   on(event, fn) /* "change" */ · off(event, fn) · destroy()

import { TOOLS, INK_SWATCHES, SKIN_TONES, Stroke, makeCanvas, symmetryTransforms, rectUnion, rectToInt, mul, TAU } from './brushes.js';
import { History, pixelEntry, groupEntry } from './history.js';
import { fillMask, applyFill } from './fill.js';
import { drawText, ensureFont } from './text.js';
import { buildUI } from './ui.js';

const PREF_KEY = 'inkform.sketch.v1';
const CSS_HREF = new URL('./sketch.css', import.meta.url).href;
const FONTS_HREF = new URL('../../fonts/fonts.css', import.meta.url).href;
const BRUSHES = ['fineliner', 'liner', 'brushpen', 'shader', 'stipple', 'hatch', 'pencil', 'marker'];
const MAX_DOC = 4096;

export const CANVAS_PRESETS = {
  square: { label: 'Square', w: 1024, h: 1024 },
  portrait: { label: 'Portrait 3:4', w: 768, h: 1024 },
  landscape: { label: 'Landscape 4:3', w: 1024, h: 768 },
  band: { label: 'Armband 4:1', w: 2048, h: 512 },
};

const BRUSH_ALIASES = {
  fine: 'fineliner', fineliner: 'fineliner', 'fine-liner': 'fineliner', 'fine liner': 'fineliner', pen: 'fineliner',
  liner: 'liner', tattoo: 'liner', 'tattoo-liner': 'liner', 'tattoo liner': 'liner', ink: 'liner',
  brush: 'brushpen', brushpen: 'brushpen', 'brush-pen': 'brushpen', 'brush pen': 'brushpen', calligraphy: 'brushpen',
  shader: 'shader', shading: 'shader', airbrush: 'shader', soft: 'shader',
  stipple: 'stipple', dotwork: 'stipple', dots: 'stipple',
  hatch: 'hatch', hatching: 'hatch',
  pencil: 'pencil', sketch: 'pencil',
  marker: 'marker',
  eraser: 'eraser', fill: 'fill', bucket: 'fill', shape: 'shape', shapes: 'shape', text: 'text', eyedropper: 'eyedropper', move: 'move',
};
const SYM_ALIASES = {
  off: 'off', none: 'off', false: 'off', '': 'off',
  vertical: 'vertical', mirror: 'vertical', x: 'vertical', 'mirror-x': 'vertical', 'left-right': 'vertical',
  horizontal: 'horizontal', y: 'horizontal', 'mirror-y': 'horizontal', 'top-bottom': 'horizontal',
  quad: 'quad', both: 'quad', four: 'quad',
  radial: 'radial', rotational: 'radial', mandala: 'radial',
  kaleido: 'kaleido', kaleidoscope: 'kaleido', 'radial-mirror': 'kaleido', mirrored: 'kaleido',
};

let LAYER_SEQ = 0;

function ensureLink(href, match) {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  if (links.some((l) => l.href === href || (match && (l.getAttribute('href') || '').includes(match)))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

export function ctxOf(c) {
  return c._ctx || (c._ctx = c.getContext('2d', { willReadFrequently: true }));
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  let s = m[1]; if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function normHex(h) { return rgbToHex(...hexToRgb(h)); }

function alphaBounds(canvas, thr = 0) {
  const w = canvas.width, h = canvas.height;
  const d = ctxOf(canvas).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let any = false;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > thr) { any = true; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    if (any) { if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export class SketchPad {
  constructor(container, { width = 1024, height = 1024, settings = {} } = {}) {
    if (!container) throw new Error('SketchPad: container element required');
    ensureLink(CSS_HREF, 'sketch/sketch.css');
    ensureLink(FONTS_HREF, 'fonts/fonts.css');
    this.container = container;
    this.w = clampDim(width); this.h = clampDim(height);
    this._ls = {};
    this.history = new History({ limit: 80 });
    this.layers = []; this.active = null;
    this.opts = {};
    for (const [id, def] of Object.entries(TOOLS)) this.opts[id] = { ...def.defaults };
    this.tool = 'liner'; this.lastBrush = 'liner';
    this.color = '#000000';
    this.recent = [];
    this.sym = { mode: 'off', n: 8, show: true };
    this.guides = { grid: false, center: false, rings: false, snap: false, gridSize: 64, ringCount: 4 };
    this.bg = { mode: 'checker', skin: SKIN_TONES[1] };
    this.view = { zoom: 1, panX: 0, panY: 0, rot: 0 };
    this.viewRotateGesture = true;
    this._pointers = new Map();
    this._mode = null;
    this._penSeen = false;
    this._preview = null;
    this._loadPrefs();

    this._initBuffers();
    const first = this._newLayer('Layer 1');
    this.layers.push(first); this.active = first;

    this.ui = buildUI(this);
    this.root = this.ui.root; this.canvas = this.ui.canvas;
    this.vctx = this.canvas.getContext('2d');
    this.history.onChange = () => this.ui.syncHistory();
    this._bindInput();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.ui.stage);
    this._ro.observe(this.root);
    this.setSettings(settings);
    this.ui.syncAll();
    this._resize();
  }

  // ---------------------------------------------------------------- events
  on(ev, fn) { (this._ls[ev] ||= new Set()).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._ls[ev]?.delete(fn); }
  _emit(ev, data) { for (const fn of this._ls[ev] || []) { try { fn(data); } catch (e) { console.error(e); } } }

  _changed(layer) {
    this._emptyCache = null;
    if (layer) layer.dirtyThumb = true; else for (const l of this.layers) l.dirtyThumb = true;
    clearTimeout(this._thumbT); this._thumbT = setTimeout(() => this.ui.syncThumbs(), 120);
    clearTimeout(this._changeT); this._changeT = setTimeout(() => this._emit('change', { source: 'sketch' }), 250);
    this._requestRender();
  }

  // ---------------------------------------------------------------- settings / prefs
  setSettings(s = {}) {
    if (!s || typeof s !== 'object') return;
    if (s.defaultBrush != null) {
      const id = BRUSH_ALIASES[String(s.defaultBrush).toLowerCase()];
      if (id) this.setTool(id);
    }
    if (s.defaultSize != null && isFinite(+s.defaultSize)) {
      const id = TOOLS[this.tool].kind === 'brush' || this.tool === 'shape' ? this.tool : this.lastBrush;
      this.opts[id].size = clamp(+s.defaultSize, 0.5, 500);
    }
    if (s.smoothing != null && isFinite(+s.smoothing)) {
      const v = clamp(+s.smoothing <= 1 && +s.smoothing > 0 && String(s.smoothing).includes('.') ? +s.smoothing * 100 : +s.smoothing, 0, 100);
      for (const id of [...BRUSHES, 'eraser']) this.opts[id].smoothing = v;
    }
    if (s.pressure != null) for (const id of [...BRUSHES, 'eraser']) {
      if (['shader', 'stipple', 'hatch', 'marker', 'eraser'].includes(id)) continue;
      this.opts[id].pSize = !!s.pressure;
    }
    if (s.symmetry != null) {
      const m = SYM_ALIASES[String(s.symmetry).toLowerCase()];
      if (m) this.sym.mode = m;
    }
    if (s.radialCount != null && isFinite(+s.radialCount)) this.sym.n = clamp(Math.round(+s.radialCount), 2, 24);
    if (s.showGrid != null) this.guides.grid = !!s.showGrid;
    if (s.skinColor) this.bg.skin = normHex(s.skinColor);
    if (s.background && ['checker', 'skin', 'white'].includes(s.background)) this.bg.mode = s.background;
    if (s.canvasSize != null) {
      const sz = parseSize(s.canvasSize);
      if (sz && (sz.w !== this.w || sz.h !== this.h)) {
        if (this.isEmpty() && this.layers.length <= 1) this._setDocSize(sz.w, sz.h);
        else this.resizeDocument(sz.w, sz.h);
      }
    }
    this.ui?.syncAll();
    this._savePrefs();
    this._requestRender();
  }

  _loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (!p) return;
      if (p.opts) for (const id of Object.keys(this.opts)) if (p.opts[id]) Object.assign(this.opts[id], p.opts[id]);
      if (p.tool && TOOLS[p.tool] && p.tool !== 'move') this.tool = p.tool;
      if (p.lastBrush && TOOLS[p.lastBrush]) this.lastBrush = p.lastBrush;
      if (p.color) this.color = normHex(p.color);
      if (Array.isArray(p.recent)) this.recent = p.recent.slice(0, 12).map(normHex);
      if (p.sym) Object.assign(this.sym, p.sym);
      if (p.guides) Object.assign(this.guides, p.guides);
      if (p.bg) Object.assign(this.bg, p.bg);
    } catch { /* storage unavailable */ }
  }
  _savePrefs() {
    clearTimeout(this._prefT);
    this._prefT = setTimeout(() => {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify({ opts: this.opts, tool: this.tool, lastBrush: this.lastBrush, color: this.color, recent: this.recent, sym: this.sym, guides: this.guides, bg: this.bg }));
      } catch { /* ignore */ }
    }, 400);
  }

  // ---------------------------------------------------------------- tools & options
  setTool(id) {
    if (!TOOLS[id]) return;
    if (id !== this.tool) this._commitPending();
    this.tool = id;
    if (BRUSHES.includes(id)) this.lastBrush = id;
    this.ui?.syncTool();
    this._savePrefs();
    this._requestRender();
  }
  setOpt(key, value, tool = this.tool) {
    this.opts[tool][key] = value;
    if (tool === 'text' && this._text) { if (key === 'font') ensureFont(value).then(() => this._renderTextPreview()); this._renderTextPreview(); }
    if (tool === 'shape' && this._shape) this._drawShape();
    this._savePrefs();
    this._requestRender();
  }
  setColor(hex, { recent = false } = {}) {
    this.color = normHex(hex);
    if (recent) this._pushRecent(this.color);
    if (this._text) this._renderTextPreview();
    this.ui?.syncColor();
    this._savePrefs();
  }
  _pushRecent(c) {
    this.recent = [c, ...this.recent.filter((x) => x !== c)].slice(0, 12);
    this.ui?.syncColor();
  }
  setSymmetry(patch) { Object.assign(this.sym, patch); this.sym.n = clamp(Math.round(this.sym.n), 2, 24); this.ui?.syncSym(); this._savePrefs(); this._requestRender(); }
  setGuides(patch) { Object.assign(this.guides, patch); this.ui?.syncSym(); this._savePrefs(); this._requestRender(); }
  setBackground(mode, skin) { if (mode) this.bg.mode = mode; if (skin) this.bg.skin = normHex(skin); this.ui?.syncBg(); this._savePrefs(); this._requestRender(); }

  // ---------------------------------------------------------------- document & layers
  _initBuffers() {
    const { w, h } = this;
    this.strokeCanvas = makeCanvas(w, h); this.sctx = this.strokeCanvas.getContext('2d');
    this.maskCanvas = makeCanvas(w, h); this.mctx = this.maskCanvas.getContext('2d');
    this.tmpCanvas = makeCanvas(w, h); this.tctx = this.tmpCanvas.getContext('2d');
    this.scratch = makeCanvas(w, h); this.scctx = this.scratch.getContext('2d');
  }
  _newLayer(name, props = {}) {
    const canvas = makeCanvas(this.w, this.h);
    const l = { id: 'L' + (++LAYER_SEQ), name, canvas, visible: true, opacity: 1, locked: false, ref: false, exportRef: false, dirtyThumb: true, ...props };
    Object.defineProperty(l, 'ctx', { get() { return ctxOf(this.canvas); }, enumerable: false });
    return l;
  }
  _snapshot() {
    return {
      w: this.w, h: this.h, active: this.active,
      list: this.layers.map((l) => ({ l, canvas: l.canvas, name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, ref: l.ref, exportRef: l.exportRef })),
    };
  }
  _restore(s) {
    if (s.w !== this.w || s.h !== this.h) { this.w = s.w; this.h = s.h; this._initBuffers(); this._needFit = true; this._resize(); }
    this.layers = s.list.map((e) => {
      const l = e.l;
      l.canvas = e.canvas;
      Object.assign(l, { name: e.name, visible: e.visible, opacity: e.opacity, locked: e.locked, ref: e.ref, exportRef: e.exportRef });
      l.dirtyThumb = true;
      return l;
    });
    this.active = this.layers.includes(s.active) ? s.active : this.layers[this.layers.length - 1];
    this.ui.syncLayers();
    this.ui.syncDoc();
    this._changed();
  }
  _structOp(label, fn) {
    this._commitPending();
    const before = this._snapshot();
    const extra = fn();
    const after = this._snapshot();
    const canv = (s) => new Set(s.list.map((e) => e.canvas));
    const a = canv(before), b = canv(after);
    let n = 0; for (const c of a) if (!b.has(c)) n++; for (const c of b) if (!a.has(c)) n++;
    const struct = {
      label, bytes: n * this.w * this.h * 4,
      undo: () => this._restore(before), redo: () => this._restore(after),
    };
    const entries = Array.isArray(extra) ? extra : extra && extra.undo ? [extra] : [];
    this.history.push(entries.length ? groupEntry([...entries, struct], label) : struct);
    this.ui.syncLayers();
    this._changed();
  }

  get artLayers() { return this.layers.filter((l) => !l.ref); }

  selectLayer(l) { if (!l || l === this.active) return; this._commitPending(); this.active = l; this.ui.syncLayers(); this._requestRender(); }

  addLayer(name) {
    let created;
    this._structOp('Add layer', () => {
      created = this._newLayer(name || this._nextName());
      const i = this.active ? this.layers.indexOf(this.active) + 1 : this.layers.length;
      this.layers.splice(i, 0, created);
      this.active = created;
    });
    return created;
  }
  _nextName() {
    let n = this.artLayers.length + 1;
    const names = new Set(this.layers.map((l) => l.name));
    while (names.has('Layer ' + n)) n++;
    return 'Layer ' + n;
  }
  duplicateLayer(l = this.active) {
    if (!l) return;
    this._structOp('Duplicate layer', () => {
      const c = this._newLayer(l.name + ' copy', { opacity: l.opacity, ref: l.ref, exportRef: l.exportRef });
      c.ctx.drawImage(l.canvas, 0, 0);
      this.layers.splice(this.layers.indexOf(l) + 1, 0, c);
      this.active = c;
    });
  }
  deleteLayer(l = this.active) {
    if (!l) return;
    if (this.layers.length <= 1) { this.clearLayer(l); return; }
    this._structOp('Delete layer', () => {
      const i = this.layers.indexOf(l);
      this.layers.splice(i, 1);
      if (!this.artLayers.length) { const n = this._newLayer('Layer 1'); this.layers.push(n); }
      if (this.active === l) this.active = this.layers[Math.min(i, this.layers.length - 1)];
      if (this.active.ref && this.artLayers.length) this.active = this.artLayers[this.artLayers.length - 1];
    });
  }
  moveLayer(l, toIndex) {
    const from = this.layers.indexOf(l);
    toIndex = clamp(toIndex, 0, this.layers.length - 1);
    if (from < 0 || from === toIndex) return;
    this._structOp('Reorder layers', () => { this.layers.splice(from, 1); this.layers.splice(toIndex, 0, l); });
  }
  mergeDown(l = this.active) {
    const i = this.layers.indexOf(l);
    if (i <= 0) { this.ui.toast('Nothing below to merge into'); return; }
    const below = this.layers[i - 1];
    if (below.ref !== l.ref) { this.ui.toast('Can’t merge art into the reference layer'); return; }
    this._structOp('Merge down', () => {
      const before = below.ctx.getImageData(0, 0, this.w, this.h);
      const g = below.ctx;
      g.save(); g.globalAlpha = l.visible ? l.opacity : 0; g.drawImage(l.canvas, 0, 0); g.restore();
      this.layers.splice(i, 1);
      this.active = below;
      below.dirtyThumb = true;
      return pixelEntry(below, { x: 0, y: 0, w: this.w, h: this.h }, before, 'Merge');
    });
  }
  clearLayer(l = this.active) {
    if (!l) return;
    this._commitPending();
    const r = alphaBounds(l.canvas);
    if (!r) return;
    const before = l.ctx.getImageData(r.x, r.y, r.w, r.h);
    l.ctx.clearRect(r.x, r.y, r.w, r.h);
    this.history.push(pixelEntry(l, r, before, 'Clear layer'));
    this._changed(l);
  }
  setLayerProp(l, prop, value) {
    l[prop] = value;
    if (prop === 'locked' || prop === 'name' || prop === 'visible' || prop === 'exportRef') this.ui.syncLayers();
    if (prop === 'visible' || prop === 'opacity' || prop === 'exportRef') this._changed(null);
    this._requestRender();
  }

  /** Reset to a single empty layer (undoable). */
  clear() {
    this._cancelPending();
    this._structOp('Clear', () => {
      const l = this._newLayer('Layer 1');
      this.layers = [l]; this.active = l;
    });
  }

  _setDocSize(w, h) {
    this.w = clampDim(w); this.h = clampDim(h);
    for (const l of this.layers) {
      const c = makeCanvas(this.w, this.h);
      l.canvas = c; l.dirtyThumb = true;
    }
    this._initBuffers();
    this._needFit = true; this._resize();
    this.ui?.syncDoc();
    this._changed();
  }

  /** Change the document size; content stays centered (scale=false) or is scaled to fit (scale=true). */
  resizeDocument(w, h, { scale = false } = {}) {
    w = clampDim(w); h = clampDim(h);
    if (w === this.w && h === this.h) return;
    this._structOp('Canvas size', () => {
      const ow = this.w, oh = this.h;
      this.w = w; this.h = h;
      for (const l of this.layers) {
        const c = makeCanvas(w, h);
        const g = ctxOf(c);
        g.imageSmoothingQuality = 'high';
        if (scale) {
          const k = Math.min(w / ow, h / oh);
          g.drawImage(l.canvas, (w - ow * k) / 2, (h - oh * k) / 2, ow * k, oh * k);
        } else g.drawImage(l.canvas, Math.round((w - ow) / 2), Math.round((h - oh) / 2));
        l.canvas = c;
      }
      this._initBuffers();
      this._needFit = true;
    });
    this._resize();
    this.ui.syncDoc();
  }

  // ---------------------------------------------------------------- history
  undo() { this._cancelPending(); if (this.history.undo()) { this._changed(); this.ui.syncLayers(); } }
  redo() { this._cancelPending(); if (this.history.redo()) { this._changed(); this.ui.syncLayers(); } }
  get canUndo() { return this.history.canUndo; }
  get canRedo() { return this.history.canRedo; }

  _commitPending() {
    if (this.xf) this.applyTransform();
    if (this._text) this._textCommit();
    if (this._shape) this._shapeCommit();
  }
  _cancelPending() {
    if (this.xf) this.cancelTransform();
    if (this._text) this._textCancel();
    if (this.stroke) this._abortStroke();
    if (this._shape) { this._clearBuffer(this._shape.bbox); this._shape = null; this._preview = null; }
  }

  // ---------------------------------------------------------------- export
  _composite(includeRef = null, withXf = true) {
    const c = makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    for (const l of this.layers) {
      if (!l.visible) continue;
      if (l.ref && !(includeRef ?? l.exportRef)) continue;
      g.save();
      g.globalAlpha = l.opacity;
      if (withXf && this.xf && this.xf.layer === l) { const m = this._xfMatrix(); g.setTransform(...m); g.imageSmoothingQuality = 'high'; }
      g.drawImage(l.canvas, 0, 0);
      g.restore();
    }
    return c;
  }
  /** Transparent full-document canvas of the visible art layers (no reference, background or guides). */
  toCanvas() { return this._composite(); }
  toDataURL(type = 'image/png', q) { return this.toCanvas().toDataURL(type, q); }
  /** Canvas cropped to the artwork bounds plus `padding` px; null when empty. */
  toTrimmedCanvas(padding = 0) {
    const full = this.toCanvas();
    const b = alphaBounds(full, 2);
    if (!b) return null;
    const p = Math.max(0, Math.round(padding));
    const c = makeCanvas(b.w + p * 2, b.h + p * 2);
    c.getContext('2d').drawImage(full, b.x, b.y, b.w, b.h, p, p, b.w, b.h);
    return c;
  }
  isEmpty() {
    if (this._emptyCache != null) return this._emptyCache;
    let empty = true;
    for (const l of this.layers) {
      if (!l.visible || (l.ref && !l.exportRef) || l.opacity <= 0) continue;
      if (alphaBounds(l.canvas, 0)) { empty = false; break; }
    }
    this._emptyCache = empty;
    return empty;
  }
  download(trimmed = false) {
    const c = trimmed ? this.toTrimmedCanvas(16) : this.toCanvas();
    if (!c) { this.ui.toast('Nothing to export yet'); return; }
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `inkform-sketch${trimmed ? '-trimmed' : ''}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  // ---------------------------------------------------------------- state
  getState() {
    return {
      type: 'inkform-sketch', version: 1,
      width: this.w, height: this.h,
      active: this.layers.indexOf(this.active),
      layers: this.layers.map((l) => ({
        name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, ref: l.ref, exportRef: l.exportRef,
        data: alphaBounds(l.canvas) ? l.canvas.toDataURL('image/png') : null,
      })),
      view: { background: this.bg.mode, skin: this.bg.skin, symmetry: this.sym.mode, radialCount: this.sym.n },
    };
  }
  async setState(json) {
    const st = typeof json === 'string' ? JSON.parse(json) : json;
    if (!st || !Array.isArray(st.layers)) throw new Error('SketchPad.setState: invalid state');
    this._cancelPending();
    const w = clampDim(st.width || this.w), h = clampDim(st.height || this.h);
    const layers = [];
    for (const ld of st.layers) {
      const prev = { w: this.w, h: this.h };
      this.w = w; this.h = h;
      const l = this._newLayer(ld.name || 'Layer', {
        visible: ld.visible !== false, opacity: clamp(+(ld.opacity ?? 1), 0, 1), locked: !!ld.locked, ref: !!ld.ref, exportRef: !!ld.exportRef,
      });
      this.w = prev.w; this.h = prev.h;
      if (ld.data) {
        try { const img = await loadImg(ld.data); l.ctx.drawImage(img, 0, 0, w, h); } catch (e) { console.warn('SketchPad: layer image failed', e); }
      }
      layers.push(l);
    }
    if (!layers.length) layers.push(this._newLayer('Layer 1'));
    this.w = w; this.h = h;
    this._initBuffers();
    this.layers = layers;
    this.active = layers[clamp(st.active ?? layers.length - 1, 0, layers.length - 1)];
    if (st.view) {
      if (st.view.background) this.bg.mode = st.view.background;
      if (st.view.skin) this.bg.skin = st.view.skin;
    }
    this.history.clear();
    this._needFit = true; this._resize();
    this.ui.syncAll();
    this._emptyCache = null;
    for (const l of this.layers) l.dirtyThumb = true;
    this.ui.syncThumbs();
    this._requestRender();
  }

  // ---------------------------------------------------------------- import
  /** Load artwork (URL/dataURL, svg string, canvas, image, bitmap, Blob) into a new layer, fitted & centered. */
  async loadImage(src, { name, asReference = false, fit = 0.9 } = {}) {
    const d = await toDrawable(src);
    this._cancelPending();
    const k = Math.min((this.w * fit) / d.w, (this.h * fit) / d.h);
    const dw = d.w * k, dh = d.h * k;
    let layer;
    this._structOp(asReference ? 'Add reference' : 'Import image', () => {
      layer = this._newLayer(name || (asReference ? 'Reference' : 'Imported'), asReference ? { ref: true, opacity: 0.4 } : {});
      const g = layer.ctx;
      g.imageSmoothingQuality = 'high';
      g.drawImage(d.source, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
      if (asReference) {
        this.layers.unshift(layer);
        if (!this.active || this.active.ref) this.active = this.artLayers[this.artLayers.length - 1];
      } else {
        const i = this.active ? this.layers.indexOf(this.active) + 1 : this.layers.length;
        this.layers.splice(i, 0, layer);
        this.active = layer;
      }
    });
    d.cleanup?.();
    return layer;
  }

  /** Add a pre-rendered canvas (same size or fitted) as a new layer. */
  _addCanvasLayer(canvas, name, rect) {
    let layer;
    this._structOp('Add layer', () => {
      layer = this._newLayer(name);
      if (rect) layer.ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h);
      else layer.ctx.drawImage(canvas, 0, 0);
      const i = this.active ? this.layers.indexOf(this.active) + 1 : this.layers.length;
      this.layers.splice(i, 0, layer);
      this.active = layer;
    });
    return layer;
  }

  async importFile(file) {
    if (!file) return;
    try {
      const d = await toDrawable(file);
      this.ui.importChooser(d);
    } catch (e) {
      console.warn(e);
      this.ui.toast('Could not read that image');
    }
  }

  // ---------------------------------------------------------------- view
  _resize() {
    const st = this.ui.stage;
    const cw = st.clientWidth, ch = st.clientHeight;
    this.ui.updateCompact();
    if (!cw || !ch) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cw !== this.cw || ch !== this.ch || dpr !== this.dpr) {
      this.cw = cw; this.ch = ch; this.dpr = dpr;
      this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
      this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
      this._checker = null;
    }
    if (this._needFit !== false) { this._needFit = false; this.fitView(); }
    this._requestRender();
  }
  _viewM(pan = true) {
    const v = this.view, z = v.zoom, c = Math.cos(v.rot), s = Math.sin(v.rot);
    const a = c * z, b = s * z, cc = -s * z, d = c * z;
    const ox = (this.cw || 0) / 2 + (pan ? v.panX : 0), oy = (this.ch || 0) / 2 + (pan ? v.panY : 0);
    return [a, b, cc, d, ox - (a * this.w / 2 + cc * this.h / 2), oy - (b * this.w / 2 + d * this.h / 2)];
  }
  toDoc(sx, sy) {
    const [a, b, c, d, e, f] = this._viewM();
    const det = a * d - b * c;
    const x = sx - e, y = sy - f;
    return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
  }
  toScreen(x, y) { const m = this._viewM(); return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; }
  _keepDocAt(doc, scr) {
    const m = this._viewM(false);
    this.view.panX = scr.x - (m[0] * doc.x + m[2] * doc.y + m[4]);
    this.view.panY = scr.y - (m[1] * doc.x + m[3] * doc.y + m[5]);
  }
  fitView() {
    if (!this.cw) { this._needFit = true; return; }
    const pad = this.ui.compact ? 20 : 48;
    this.view.rot = 0;
    this.view.zoom = Math.max(0.02, Math.min((this.cw - pad) / this.w, (this.ch - pad) / this.h));
    this.view.panX = 0; this.view.panY = 0;
    this.ui.syncZoom(); this._requestRender();
  }
  setZoom(z, at) {
    at ||= { x: this.cw / 2, y: this.ch / 2 };
    const d = this.toDoc(at.x, at.y);
    this.view.zoom = clamp(z, 0.03, 32);
    this._keepDocAt(d, at);
    this.ui.syncZoom(); this._requestRender();
  }
  zoomBy(f, at) { this.setZoom(this.view.zoom * f, at); }
  rotateView(deg, absolute = false) {
    const at = { x: this.cw / 2, y: this.ch / 2 };
    const d = this.toDoc(at.x, at.y);
    this.view.rot = absolute ? deg * Math.PI / 180 : this.view.rot + deg * Math.PI / 180;
    this.view.rot = Math.atan2(Math.sin(this.view.rot), Math.cos(this.view.rot));
    this._keepDocAt(d, at);
    this.ui.syncZoom(); this._requestRender();
  }

  // ---------------------------------------------------------------- input
  _bindInput() {
    const cv = this.canvas;
    this._h = {
      down: (e) => this._onDown(e), move: (e) => this._onMove(e), up: (e) => this._onUp(e, false), cancel: (e) => this._onUp(e, true),
      leave: () => { this._hover = null; this._requestRender(); },
      wheel: (e) => this._onWheel(e),
      key: (e) => this._onKey(e), keyup: (e) => this._onKeyUp(e),
      paste: (e) => this._onPaste(e),
      blur: () => { this._space = false; this.ui.setPanCursor(false); },
      dpr: () => this._resize(),
    };
    cv.addEventListener('pointerdown', this._h.down);
    cv.addEventListener('pointermove', this._h.move);
    cv.addEventListener('pointerup', this._h.up);
    cv.addEventListener('pointercancel', this._h.cancel);
    cv.addEventListener('pointerleave', this._h.leave);
    cv.addEventListener('wheel', this._h.wheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', this._h.key);
    window.addEventListener('keyup', this._h.keyup);
    window.addEventListener('paste', this._h.paste);
    window.addEventListener('blur', this._h.blur);
    window.addEventListener('resize', this._h.dpr);
  }
  _isActive() { return !this._destroyed && this.root.isConnected && this.root.getClientRects().length > 0 && this.root.offsetParent !== null; }
  _pt(e) {
    const r = this._rect || (this._rect = this.canvas.getBoundingClientRect());
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _pressure(e) {
    if (e.pointerType !== 'pen') return 1;
    const p = e.pressure;
    return p > 0 ? p : 0.5;
  }

  _onDown(e) {
    this._rect = this.canvas.getBoundingClientRect();
    if (this.ui.compact) this.ui.closeSheet();
    this.ui.closePopovers();
    const s = this._pt(e);
    if (e.pointerType === 'pen') this._penSeen = true;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this._pointers.set(e.pointerId, { x: s.x, y: s.y, type: e.pointerType, t: performance.now() });
    e.preventDefault();

    if (e.pointerType === 'touch') {
      const touches = [...this._pointers.values()].filter((p) => p.type === 'touch');
      if (touches.length >= 2) {
        if (this._mode === 'draw') {
          if (performance.now() - this._strokeT0 < 260 || (this.stroke && this.stroke.dist < 30)) this._abortStroke(); else this._endStroke();
        } else if (this._mode === 'shape') { this._clearBuffer(this._shape?.bbox); this._shape = null; this._preview = null; }
        this._startGesture();
        return;
      }
      if (this._penSeen) { this._startPan(s); return; } // palm rejection: fingers pan when a pen is in use
    }
    if (this._mode) return;
    if (e.button === 1 || e.button === 2 || this._space) { this._startPan(s); return; }
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const d = this.toDoc(s.x, s.y);
    const kind = TOOLS[this.tool].kind;
    if (e.altKey && (kind === 'brush' || kind === 'fill')) { this._pick(d); this._mode = 'picker'; return; }
    switch (kind) {
      case 'brush': this._beginStroke(e, s, d); break;
      case 'fill': this._fillAt(d); break;
      case 'picker': this._pick(d); this._mode = 'picker'; break;
      case 'shape': this._beginShape(d); break;
      case 'text': this._textDown(d); break;
      case 'move': this._xfDown(s, d); break;
    }
  }

  _onMove(e) {
    const s = this._pt(e);
    const ptr = this._pointers.get(e.pointerId);
    if (ptr) { ptr.x = s.x; ptr.y = s.y; }
    if (e.pointerType !== 'touch') { this._hover = s; this._hoverType = e.pointerType; }
    switch (this._mode) {
      case 'gesture': this._updateGesture(); break;
      case 'pan': if (e.pointerId === this._panId) this._updatePan(s); break;
      case 'draw': {
        if (e.pointerId !== this._drawId) break;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        const list = evs && evs.length ? evs : [e];
        for (const ev of list) {
          const p = this._pt(ev);
          let d = this.toDoc(p.x, p.y);
          d = this._snap(d);
          this._lastRaw = { ...d, p: this._pressure(ev), t: ev.timeStamp };
          const q = this._stab(d);
          this.stroke.add(q.x, q.y, this._pressure(ev), ev.timeStamp);
        }
        break;
      }
      case 'picker': this._pick(this.toDoc(s.x, s.y)); break;
      case 'shape': this._shape.b = this._snap(this.toDoc(s.x, s.y)); this._shape.mods = { shift: e.shiftKey, alt: e.altKey }; this._drawShape(); break;
      case 'textmove': { const d = this.toDoc(s.x, s.y); this._text.x = d.x - this._textOff.x; this._text.y = d.y - this._textOff.y; this._renderTextPreview(); this.ui.positionTextEditor(); break; }
      case 'xf': this._xfMove(s, this.toDoc(s.x, s.y), e); break;
      default:
        if (this.tool === 'move' && this.xf) this.ui.setStageCursor(this._xfCursor(this._xfHit(s)));
    }
    this._requestRender();
  }

  _onUp(e, cancelled) {
    const ptr = this._pointers.get(e.pointerId);
    this._pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!ptr) return;
    switch (this._mode) {
      case 'gesture':
        if ([...this._pointers.values()].filter((p) => p.type === 'touch').length < 2) this._endGesture();
        break;
      case 'pan': if (e.pointerId === this._panId) this._mode = null; break;
      case 'draw':
        if (e.pointerId !== this._drawId) break;
        if (cancelled && this.stroke && this.stroke.dist < 4) this._abortStroke(); else this._endStroke();
        break;
      case 'picker': this._mode = null; if (this.tool !== 'eyedropper') break; this._pushRecent(this.color); break;
      case 'shape': this._shapeCommit(); break;
      case 'textmove': this._mode = null; break;
      case 'xf': this._mode = null; this._xfDrag = null; this.ui.syncXf(); break;
    }
    if (e.pointerType === 'touch' && !this._pointers.size && this._mode === 'pan') this._mode = null;
    this._requestRender();
  }

  _onWheel(e) {
    e.preventDefault();
    const s = this._pt(e);
    const lineMode = e.deltaMode === 1;
    const mouseWheel = lineMode || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey) this.zoomBy(Math.exp(-e.deltaY * (lineMode ? 0.05 : 0.01)), s);
    else if (mouseWheel && !e.shiftKey) this.zoomBy(Math.exp(-e.deltaY * (lineMode ? 0.06 : 0.0018)), s);
    else {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      this.view.panX -= dx; this.view.panY -= dy; this._requestRender();
    }
  }

  _onKey(e) {
    if (!this._isActive()) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) {
      if (this._text && t === this.ui.textArea) {
        if (e.key === 'Escape') { e.preventDefault(); this._textCancel(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._textCommit(); }
      }
      return;
    }
    // only react when focus is inside the pad or on the page body (not other app widgets)
    if (t && t !== document.body && !this.root.contains(t) && t !== document.documentElement) return;
    if (this.ui.modalOpen) { if (e.key === 'Escape') this.ui.closeModal(); return; }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod || e.altKey) return;
    const o = this.opts[this.tool];
    switch (e.key) {
      case ' ': e.preventDefault(); if (!this._space) { this._space = true; this.ui.setPanCursor(true); } return;
      case '[': if (o.size != null) { this.setOpt('size', Math.max(0.5, +(o.size / 1.15).toFixed(1))); this.ui.syncTool(); } break;
      case ']': if (o.size != null) { this.setOpt('size', Math.min(500, +(o.size * 1.15 + 0.3).toFixed(1))); this.ui.syncTool(); } break;
      case '+': case '=': this.zoomBy(1.25); break;
      case '-': case '_': this.zoomBy(0.8); break;
      case '0': this.fitView(); break;
      case 'Enter': if (this.xf) this.applyTransform(); else if (this._text) this._textCommit(); break;
      case 'Escape': this._cancelPending(); this.ui.closeSheet(); break;
      default: {
        const map = { b: this.lastBrush, e: 'eraser', g: 'fill', i: 'eyedropper', v: 'move', t: 'text', u: 'shape', l: 'liner', p: 'pencil', s: 'shader', d: 'stipple', h: 'hatch', m: 'marker', n: 'brushpen', f: 'fineliner' };
        if (map[k]) this.setTool(map[k]);
        else if (k === 'r') this.rotateView(0, true);
        else return;
      }
    }
    e.preventDefault();
  }
  _onKeyUp(e) { if (e.key === ' ') { this._space = false; this.ui.setPanCursor(false); } }

  _onPaste(e) {
    if (!this._isActive()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = [...(e.clipboardData?.items || [])];
    const it = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (it) { e.preventDefault(); this.importFile(it.getAsFile()); return; }
    const txt = e.clipboardData?.getData('text/plain') || '';
    if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(txt)) { e.preventDefault(); this.importFile(new Blob([txt], { type: 'image/svg+xml' })); }
  }

  // pan / gesture
  _startPan(s) {
    this._mode = 'pan';
    this._panId = [...this._pointers.keys()].pop();
    this._panStart = { s, x: this.view.panX, y: this.view.panY };
    this.ui.setStageCursor('grabbing');
  }
  _updatePan(s) {
    const p = this._panStart;
    this.view.panX = p.x + s.x - p.s.x; this.view.panY = p.y + s.y - p.s.y;
  }
  _startGesture() {
    const [a, b] = [...this._pointers.values()].filter((p) => p.type === 'touch');
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this._g = {
      d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang0: Math.atan2(b.y - a.y, b.x - a.x), mid0: mid,
      zoom0: this.view.zoom, rot0: this.view.rot, doc: this.toDoc(mid.x, mid.y), t0: performance.now(), moved: false, rotating: false,
    };
    this._mode = 'gesture';
  }
  _updateGesture() {
    const tl = [...this._pointers.values()].filter((p) => p.type === 'touch');
    if (tl.length < 2) return;
    const [a, b] = tl, g = this._g;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let dAng = Math.atan2(b.y - a.y, b.x - a.x) - g.ang0;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
    if (Math.abs(d - g.d0) > 12 || Math.hypot(mid.x - g.mid0.x, mid.y - g.mid0.y) > 12 || Math.abs(dAng) > 0.12) g.moved = true;
    this.view.zoom = clamp(g.zoom0 * d / g.d0, 0.03, 32);
    if (this.viewRotateGesture && (g.rotating || Math.abs(dAng) > 0.26)) {
      g.rotating = true;
      let r = g.rot0 + dAng;
      const snap = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(r - snap) < 0.09) r = snap;
      this.view.rot = r;
    }
    this._keepDocAt(g.doc, mid);
    this.ui.syncZoom();
  }
  _endGesture() {
    const g = this._g;
    this._mode = null;
    if (g && !g.moved && performance.now() - g.t0 < 320) this.undo(); // two-finger tap = undo
    this._g = null;
    // remaining finger shouldn't start drawing mid-gesture
    if (this._pointers.size) this._mode = 'gesture-end';
    if (!this._pointers.size) this._mode = null;
  }

  // ---------------------------------------------------------------- strokes
  _canDraw(l = this.active) {
    if (!l) return false;
    if (l.ref) { this.ui.toast('This is the reference layer — pick an art layer to draw on'); return false; }
    if (l.locked) { this.ui.toast('Layer is locked'); return false; }
    if (!l.visible) { this.ui.toast('Layer is hidden'); return false; }
    return true;
  }
  _symT() { return symmetryTransforms(this.sym.mode, this.sym.n, this.w / 2, this.h / 2); }
  _stab(d, first = false) {
    const s = clamp((this.opts[this.tool].smoothing ?? 0) / 100, 0, 1);
    if (first || !this._lz) { this._lz = { ...d }; this._ema = { ...d }; return { ...d }; }
    const R = Math.pow(s, 1.5) * 26 / this.view.zoom;
    const lz = this._lz;
    const dx = d.x - lz.x, dy = d.y - lz.y, dist = Math.hypot(dx, dy);
    if (dist > R) { const k = (dist - R) / dist; lz.x += dx * k; lz.y += dy * k; }
    const k2 = 1 - s * 0.6;
    this._ema.x += (lz.x - this._ema.x) * k2; this._ema.y += (lz.y - this._ema.y) * k2;
    return { ...this._ema };
  }
  _beginStroke(e, s, d) {
    if (!this._canDraw()) return;
    d = this._snap(d);
    const def = { ...TOOLS[this.tool], id: this.tool };
    const opts = { ...this.opts[this.tool] };
    this.stroke = new Stroke({
      def, opts, color: this.color, ctx: this.sctx, maskCtx: this.mctx, tmpCtx: this.tctx,
      transforms: this._symT(), w: this.w, h: this.h, hasPressure: e.pointerType === 'pen',
    });
    this._preview = { opacity: opts.opacity ?? 1, erase: !!def.erase };
    this._drawId = e.pointerId;
    this._strokeT0 = performance.now();
    this._mode = 'draw';
    this._lastRaw = { ...d, p: this._pressure(e), t: e.timeStamp };
    const q = this._stab(d, true);
    this.stroke.add(q.x, q.y, this._pressure(e), e.timeStamp);
    if (TOOLS[this.tool].kind === 'brush' && !def.erase) this._pushRecentLater = true;
  }
  _endStroke() {
    const st = this.stroke;
    if (!st) { this._mode = null; return; }
    // catch up from the stabilised position to where the pointer lifted
    const r = this._lastRaw;
    if (r && this._ema) {
      const dx = r.x - this._ema.x, dy = r.y - this._ema.y, L = Math.hypot(dx, dy);
      if (L > 0.7) {
        const n = Math.min(6, Math.ceil(L / 4));
        for (let i = 1; i <= n; i++) st.add(this._ema.x + dx * i / n, this._ema.y + dy * i / n, r.p, r.t + i);
      }
    }
    st.finish();
    this._commitBuffer(st.bbox, this._preview.opacity, this._preview.erase, TOOLS[this.tool].label);
    this.stroke = null; this._mode = null; this._lz = null;
    if (this._pushRecentLater) { this._pushRecentLater = false; this._pushRecent(this.color); }
  }
  _abortStroke() {
    if (this.stroke) this._clearBuffer(this.stroke.bbox);
    this.stroke = null; this._preview = null; this._mode = null; this._lz = null;
    this._requestRender();
  }
  _clearBuffer(bbox) {
    const r = bbox ? rectToInt(bbox, this.w, this.h, 4) : { x: 0, y: 0, w: this.w, h: this.h };
    if (!r) return;
    for (const g of [this.sctx, this.mctx]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(r.x, r.y, r.w, r.h); }
  }
  /** Commit the stroke buffer onto the active layer as one undoable step. */
  _commitBuffer(bbox, opacity, erase, label) {
    const L = this.active;
    const r = rectToInt(bbox, this.w, this.h, 2);
    this._preview = null;
    if (!r || !L) { this._clearBuffer(bbox); this._requestRender(); return; }
    const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
    const g = L.ctx;
    g.save();
    g.globalAlpha = opacity;
    g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    g.drawImage(this.strokeCanvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.restore();
    this._clearBuffer(bbox);
    this.history.push(pixelEntry(L, r, before, label));
    this._changed(L);
  }

  // ---------------------------------------------------------------- fill / picker
  _fillAt(d) {
    if (!this._canDraw()) return;
    const L = this.active, o = this.opts.fill;
    const x = Math.floor(d.x), y = Math.floor(d.y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    let src;
    if (o.sample === 'all') src = ctxOf(this._composite(false, false)).getImageData(0, 0, this.w, this.h);
    else src = L.ctx.getImageData(0, 0, this.w, this.h);
    const res = fillMask(src, x, y, Math.round(o.tolerance * 2.55), Math.round(o.expand));
    if (!res) return;
    const r = res.rect;
    const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
    const dst = new ImageData(new Uint8ClampedArray(before.data), r.w, r.h);
    applyFill(dst, res.mask, this.w, r, hexToRgb(this.color), o.opacity);
    L.ctx.putImageData(dst, r.x, r.y);
    this.history.push(pixelEntry(L, r, before, 'Fill'));
    this._pushRecent(this.color);
    this._changed(L);
  }
  _pick(d) {
    const x = Math.floor(d.x), y = Math.floor(d.y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const c = this._pickC || (this._pickC = makeCanvas(1, 1));
    const g = ctxOf(c);
    g.clearRect(0, 0, 1, 1);
    const all = this.opts.eyedropper.pickSample !== 'layer';
    for (const l of this.layers) {
      if (!l.visible || (!all && l !== this.active)) continue;
      g.globalAlpha = l.opacity; g.drawImage(l.canvas, x, y, 1, 1, 0, 0, 1, 1);
    }
    g.globalAlpha = 1;
    const p = g.getImageData(0, 0, 1, 1).data;
    if (p[3] < 8) return;
    this.setColor(rgbToHex(p[0], p[1], p[2]));
  }

  // ---------------------------------------------------------------- shapes
  _beginShape(d) {
    if (!this._canDraw()) return;
    d = this._snap(d);
    this._shape = { a: d, b: d, mods: {}, bbox: null };
    this._preview = { opacity: this.opts.shape.opacity, erase: false };
    this._mode = 'shape';
  }
  _drawShape() {
    const sh = this._shape; if (!sh) return;
    this._clearBuffer(sh.bbox);
    const o = this.opts.shape, g = this.sctx;
    const geo = shapeGeometry(o, sh.a, sh.b, sh.mods);
    if (!geo) { sh.bbox = null; return; }
    const lw = Math.max(0.5, o.size);
    const closed = geo.closed;
    const fill = closed && o.shapeFill === 'fill';
    let bbox = null;
    for (const m of this._symT()) {
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.beginPath();
      geo.path(g);
      g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      if (fill) { g.fillStyle = this.color; g.fill(); }
      else { g.strokeStyle = this.color; g.stroke(); }
      const pad = lw / 2 + 2;
      for (const [px, py] of geo.extent) {
        const tx = m[0] * px + m[2] * py + m[4], ty = m[1] * px + m[3] * py + m[5];
        bbox = rectUnion(bbox, tx - pad, ty - pad, tx + pad, ty + pad);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    sh.bbox = bbox;
  }
  _shapeCommit() {
    const sh = this._shape; this._shape = null; this._mode = null;
    if (!sh) return;
    if (!sh.bbox || Math.hypot(sh.b.x - sh.a.x, sh.b.y - sh.a.y) < 1) { this._clearBuffer(sh.bbox); this._preview = null; this._requestRender(); return; }
    this._commitBuffer(sh.bbox, this.opts.shape.opacity, false, 'Shape');
    this._pushRecent(this.color);
  }

  // ---------------------------------------------------------------- text
  _textDown(d) {
    const t = this._text;
    if (t && t.bounds) {
      const b = t.bounds, pad = 12 / this.view.zoom;
      if (d.x >= b.x0 - pad && d.x <= b.x1 + pad && d.y >= b.y0 - pad && d.y <= b.y1 + pad) {
        this._textOff = { x: d.x - t.x, y: d.y - t.y }; this._mode = 'textmove'; return;
      }
    }
    if (t) { this._textCommit(); return; }
    if (!this._canDraw()) return;
    this._text = { x: d.x, y: d.y, value: '', bounds: null };
    this._preview = { opacity: this.opts.text.opacity, erase: false };
    this.ui.showTextEditor();
    ensureFont(this.opts.text.font).then(() => this._renderTextPreview());
    this._requestRender();
  }
  setTextValue(v) { if (this._text) { this._text.value = v; this._renderTextPreview(); } }
  _textTransforms() { return this._symT().filter((m) => m[0] * m[3] - m[1] * m[2] > 0); } // rotations only — no mirrored lettering
  _renderTextPreview() {
    const t = this._text; if (!t) return;
    this._clearBuffer(t.drawn);
    t.drawn = null;
    if (!t.value.trim()) { t.bounds = { x0: t.x - 20, y0: t.y - 20, x1: t.x + 20, y1: t.y + 20 }; this._requestRender(); return; }
    const o = this.opts.text;
    this._preview = { opacity: o.opacity, erase: false };
    const T = this._textTransforms();
    const b = drawText(this.sctx, { text: t.value, font: o.font, fontSize: o.fontSize, letterSpacing: o.letterSpacing, curve: o.curve, align: o.align, color: this.color }, t.x, t.y, T);
    t.bounds = b;
    let all = null;
    const pad = o.fontSize * 0.3 + 4;
    for (const m of T) for (const [px, py] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const tx = m[0] * px + m[2] * py + m[4], ty = m[1] * px + m[3] * py + m[5];
      all = rectUnion(all, tx - pad, ty - pad, tx + pad, ty + pad);
    }
    t.drawn = all;
    this._requestRender();
  }
  _textCommit() {
    const t = this._text; if (!t) return;
    this._text = null;
    this.ui.hideTextEditor();
    if (!t.value.trim() || !t.drawn) { this._clearBuffer(t.drawn); this._preview = null; this._requestRender(); return; }
    this._commitBuffer(t.drawn, this.opts.text.opacity, false, 'Text');
    this._pushRecent(this.color);
  }
  _textCancel() {
    const t = this._text; if (!t) return;
    this._text = null;
    this._clearBuffer(t.drawn); this._preview = null;
    this.ui.hideTextEditor();
    if (this._mode === 'textmove') this._mode = null;
    this._requestRender();
  }

  // ---------------------------------------------------------------- move / transform
  _xfDown(s, d) {
    if (!this.xf) {
      const L = this.active;
      if (!L) return;
      if (L.locked) { this.ui.toast('Layer is locked'); return; }
      const b = alphaBounds(L.canvas);
      if (!b) { this.ui.toast('Layer is empty'); return; }
      this.xf = { layer: L, b, cx: b.x + b.w / 2, cy: b.y + b.h / 2, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
      this.ui.syncXf();
    }
    const hit = this._xfHit(s);
    this._xfDrag = { hit, start: d, x0: { ...this.xf } };
    this._mode = 'xf';
  }
  _xfMatrix(xf = this.xf) {
    const c = Math.cos(xf.rot), s = Math.sin(xf.rot);
    const a = c * xf.sx, b = s * xf.sx, cc = -s * xf.sy, d = c * xf.sy;
    const ex = xf.cx + xf.tx, ey = xf.cy + xf.ty;
    return [a, b, cc, d, ex - (a * xf.cx + cc * xf.cy), ey - (b * xf.cx + d * xf.cy)];
  }
  _xfScreenQuad() {
    const xf = this.xf, m = mul(this._viewM(), this._xfMatrix());
    const { x, y, w, h } = xf.b;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: m[0] * px + m[2] * py + m[4], y: m[1] * px + m[3] * py + m[5] }));
  }
  _xfHandles() {
    const q = this._xfScreenQuad();
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const c = mid(q[0], q[2]);
    const top = mid(q[0], q[1]);
    let ux = top.x - c.x, uy = top.y - c.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    return {
      q, c,
      corners: q,
      edges: [{ p: top, t: 'scaleY' }, { p: mid(q[1], q[2]), t: 'scaleX' }, { p: mid(q[2], q[3]), t: 'scaleY' }, { p: mid(q[3], q[0]), t: 'scaleX' }],
      rot: { x: top.x + ux * 28, y: top.y + uy * 28 }, top,
    };
  }
  _xfHit(s) {
    if (!this.xf) return { type: 'move' };
    const H = this._xfHandles();
    const near = (p, r = 14) => Math.hypot(p.x - s.x, p.y - s.y) <= r;
    if (near(H.rot, 16)) return { type: 'rotate' };
    for (let i = 0; i < 4; i++) if (near(H.corners[i])) return { type: 'scale', i };
    for (const e of H.edges) if (near(e.p, 12)) return { type: e.t };
    if (pointInQuad(s, H.q)) return { type: 'move' };
    return { type: 'rotate' };
  }
  _xfCursor(hit) {
    return { move: 'move', rotate: 'grab', scale: 'nwse-resize', scaleX: 'ew-resize', scaleY: 'ns-resize' }[hit.type] || 'default';
  }
  _xfMove(s, d, e) {
    const D = this._xfDrag, x0 = D.x0, xf = this.xf;
    if (!D || !xf) return;
    const c = { x: x0.cx + x0.tx, y: x0.cy + x0.ty };
    const local = (p) => { const dx = p.x - c.x, dy = p.y - c.y, co = Math.cos(-x0.rot), si = Math.sin(-x0.rot); return { x: dx * co - dy * si, y: dx * si + dy * co }; };
    switch (D.hit.type) {
      case 'move': xf.tx = x0.tx + d.x - D.start.x; xf.ty = x0.ty + d.y - D.start.y; break;
      case 'scale': {
        const k = Math.max(0.01, Math.hypot(d.x - c.x, d.y - c.y) / Math.max(1e-3, Math.hypot(D.start.x - c.x, D.start.y - c.y)));
        xf.sx = x0.sx * k; xf.sy = x0.sy * k;
        if (e.shiftKey) { const a = local(d), b0 = local(D.start); xf.sx = x0.sx * (a.x / (b0.x || 1)); xf.sy = x0.sy * (a.y / (b0.y || 1)); }
        break;
      }
      case 'scaleX': { const a = local(d), b0 = local(D.start); const k = a.x / (Math.abs(b0.x) > 1e-3 ? b0.x : 1e-3); xf.sx = x0.sx * (Math.abs(k) < 0.01 ? 0.01 * Math.sign(k || 1) : k); break; }
      case 'scaleY': { const a = local(d), b0 = local(D.start); const k = a.y / (Math.abs(b0.y) > 1e-3 ? b0.y : 1e-3); xf.sy = x0.sy * (Math.abs(k) < 0.01 ? 0.01 * Math.sign(k || 1) : k); break; }
      case 'rotate': {
        let r = x0.rot + Math.atan2(d.y - c.y, d.x - c.x) - Math.atan2(D.start.y - c.y, D.start.x - c.x);
        if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
        xf.rot = r; break;
      }
    }
    this.ui.syncXf();
  }
  xfFlip(axis) { if (!this.xf) this._xfInit(); if (!this.xf) return; if (axis === 'h') this.xf.sx *= -1; else this.xf.sy *= -1; this.ui.syncXf(); this._requestRender(); }
  xfRotate(deg) { if (!this.xf) this._xfInit(); if (!this.xf) return; this.xf.rot += deg * Math.PI / 180; this.ui.syncXf(); this._requestRender(); }
  xfCenter() { if (!this.xf) this._xfInit(); if (!this.xf) return; this.xf.tx = this.w / 2 - this.xf.cx; this.xf.ty = this.h / 2 - this.xf.cy; this.ui.syncXf(); this._requestRender(); }
  _xfInit() {
    const L = this.active; if (!L || L.locked) return;
    const b = alphaBounds(L.canvas);
    if (!b) { this.ui.toast('Layer is empty'); return; }
    this.xf = { layer: L, b, cx: b.x + b.w / 2, cy: b.y + b.h / 2, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
  }
  applyTransform() {
    const xf = this.xf; if (!xf) return;
    this.xf = null; this._xfDrag = null;
    const ident = Math.abs(xf.tx) < 0.01 && Math.abs(xf.ty) < 0.01 && Math.abs(xf.sx - 1) < 1e-4 && Math.abs(xf.sy - 1) < 1e-4 && Math.abs(xf.rot) < 1e-5;
    if (!ident) {
      const L = xf.layer, m = this._xfMatrix(xf), b = xf.b;
      let box = rectUnion(null, b.x, b.y, b.x + b.w, b.y + b.h);
      for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const tx = m[0] * px + m[2] * py + m[4], ty = m[1] * px + m[3] * py + m[5];
        box = rectUnion(box, tx, ty, tx, ty);
      }
      const r = rectToInt(box, this.w, this.h, 2);
      if (r) {
        const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
        const copy = makeCanvas(b.w, b.h);
        copy.getContext('2d').drawImage(L.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        const g = L.ctx;
        g.save();
        g.clearRect(b.x, b.y, b.w, b.h);
        g.setTransform(...m);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(copy, b.x, b.y);
        g.restore();
        this.history.push(pixelEntry(L, r, before, 'Transform'));
        this._changed(L);
      }
    }
    this.ui.syncXf();
    this._requestRender();
  }
  cancelTransform() { this.xf = null; this._xfDrag = null; if (this._mode === 'xf') this._mode = null; this.ui.syncXf(); this._requestRender(); }

  // ---------------------------------------------------------------- guides / snapping
  _snap(d) {
    const G = this.guides;
    if (!G.snap || !(G.grid || G.center || G.rings || this.sym.mode !== 'off')) return d;
    const th = 10 / this.view.zoom;
    const cx = this.w / 2, cy = this.h / 2;
    let x = d.x, y = d.y, bx = th, by = th;
    const tryX = (v) => { const e = Math.abs(d.x - v); if (e < bx) { bx = e; x = v; } };
    const tryY = (v) => { const e = Math.abs(d.y - v); if (e < by) { by = e; y = v; } };
    if (G.grid) {
      const s = Math.max(4, G.gridSize);
      tryX(cx + Math.round((d.x - cx) / s) * s); tryY(cy + Math.round((d.y - cy) / s) * s);
    }
    if (G.center || ['vertical', 'quad'].includes(this.sym.mode)) tryX(cx);
    if (G.center || ['horizontal', 'quad'].includes(this.sym.mode)) tryY(cy);
    if (G.rings) {
      const R = Math.min(this.w, this.h) / 2, n = Math.max(1, G.ringCount);
      const r = Math.hypot(d.x - cx, d.y - cy);
      const k = Math.round(r / (R / n));
      if (k >= 1 && k <= n) {
        const rr = k * R / n, e = Math.abs(r - rr);
        if (e < th && e < Math.min(bx, by) && r > 0) return { x: cx + (d.x - cx) * rr / r, y: cy + (d.y - cy) * rr / r };
      }
    }
    return { x, y };
  }

  // ---------------------------------------------------------------- rendering
  _requestRender() {
    if (this._raf || this._destroyed) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._render(); });
  }
  _checkerPattern(g) {
    if (this._checker) return this._checker;
    const s = Math.round(10 * (this.dpr || 1));
    const t = makeCanvas(s * 2, s * 2), c = t.getContext('2d');
    c.fillStyle = '#fbfbfc'; c.fillRect(0, 0, s * 2, s * 2);
    c.fillStyle = '#e4e4ea'; c.fillRect(0, 0, s, s); c.fillRect(s, s, s, s);
    this._checker = g.createPattern(t, 'repeat');
    return this._checker;
  }
  _render() {
    const g = this.vctx; if (!g || !this.cw) return;
    const dpr = this.dpr, M = this._viewM();
    const set = (m) => g.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // document backdrop
    set(M);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 28 * dpr; g.shadowOffsetY = 6 * dpr;
    g.fillStyle = this.bg.mode === 'skin' ? this.bg.skin : '#ffffff';
    g.fillRect(0, 0, this.w, this.h);
    g.restore();
    if (this.bg.mode === 'checker') {
      g.save(); set(M); g.beginPath(); g.rect(0, 0, this.w, this.h); g.clip();
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = this._checkerPattern(g); g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.restore();
    } else if (this.bg.mode === 'skin') {
      g.save(); set(M);
      const grd = g.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h); g.restore();
    }
    // layers
    const z = this.view.zoom;
    g.imageSmoothingEnabled = z < 2.5;
    g.imageSmoothingQuality = z < 1 ? 'high' : 'low';
    for (const l of this.layers) {
      if (!l.visible) continue;
      set(M);
      g.globalAlpha = l.opacity;
      if (this.xf && this.xf.layer === l) {
        set(mul(M, this._xfMatrix()));
        g.imageSmoothingEnabled = true;
        g.drawImage(l.canvas, 0, 0);
        g.imageSmoothingEnabled = z < 2.5;
      } else if (l === this.active && this._preview) {
        const pv = this._preview;
        if (pv.erase || l.opacity < 1) {
          const sc = this.scctx;
          sc.globalCompositeOperation = 'source-over'; sc.globalAlpha = 1;
          sc.clearRect(0, 0, this.w, this.h);
          sc.drawImage(l.canvas, 0, 0);
          sc.globalAlpha = pv.opacity;
          sc.globalCompositeOperation = pv.erase ? 'destination-out' : 'source-over';
          sc.drawImage(this.strokeCanvas, 0, 0);
          sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over';
          g.drawImage(this.scratch, 0, 0);
        } else {
          g.drawImage(l.canvas, 0, 0);
          g.globalAlpha = pv.opacity;
          g.drawImage(this.strokeCanvas, 0, 0);
        }
      } else g.drawImage(l.canvas, 0, 0);
    }
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    this._drawGuides(g, M, set);
    this._drawOverlays(g, M, dpr);
  }
  _drawGuides(g, M, set) {
    const G = this.guides, w = this.w, h = this.h, cx = w / 2, cy = h / 2, z = this.view.zoom;
    const lw = 1 / z;
    set(M);
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    if (G.grid) {
      const s = Math.max(4, G.gridSize);
      if (s * z >= 5) {
        g.beginPath();
        for (let x = cx % s; x <= w; x += s) { g.moveTo(x, 0); g.lineTo(x, h); }
        for (let y = cy % s; y <= h; y += s) { g.moveTo(0, y); g.lineTo(w, y); }
        g.strokeStyle = 'rgba(40,140,255,0.22)'; g.lineWidth = lw; g.stroke();
      }
    }
    if (G.center) {
      g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.moveTo(0, cy); g.lineTo(w, cy);
      g.strokeStyle = 'rgba(40,140,255,0.6)'; g.lineWidth = lw * 1.2; g.stroke();
    }
    if (G.rings) {
      const R = Math.min(w, h) / 2, n = Math.max(1, G.ringCount);
      g.beginPath();
      for (let k = 1; k <= n; k++) { g.moveTo(cx + k * R / n, cy); g.arc(cx, cy, k * R / n, 0, TAU); }
      g.strokeStyle = 'rgba(40,140,255,0.45)'; g.lineWidth = lw; g.stroke();
    }
    if (this.sym.mode !== 'off' && this.sym.show) {
      const L = Math.hypot(w, h);
      g.beginPath();
      const m = this.sym.mode;
      if (m === 'vertical' || m === 'quad') { g.moveTo(cx, 0); g.lineTo(cx, h); }
      if (m === 'horizontal' || m === 'quad') { g.moveTo(0, cy); g.lineTo(w, cy); }
      if (m === 'radial' || m === 'kaleido') {
        const n = this.sym.n * (m === 'kaleido' ? 2 : 1);
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + k * TAU / n + (m === 'kaleido' ? 0 : 0);
          g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
        }
      }
      g.setLineDash([6 / z, 5 / z]);
      g.strokeStyle = 'rgba(224,69,95,0.75)'; g.lineWidth = lw * 1.3; g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(cx, cy, 4 / z, 0, TAU); g.fillStyle = 'rgba(224,69,95,0.9)'; g.fill();
    }
    g.restore();
  }
  _drawOverlays(g, M, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // transform box
    if (this.xf) {
      const H = this._xfHandles();
      g.save();
      g.beginPath(); H.q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(H.top.x, H.top.y); g.lineTo(H.rot.x, H.rot.y); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
      const knob = (p, r, fill) => { g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#111'; g.stroke(); };
      for (const p of H.corners) knob(p, 6, '#fff');
      for (const e of H.edges) knob(e.p, 4.5, '#fff');
      knob(H.rot, 7, cssAccent(this.root));
      g.restore();
    }
    // text box
    if (this._text && this._text.bounds) {
      const b = this._text.bounds;
      const q = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => this.toScreen(x, y));
      g.save(); g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      g.setLineDash([5, 4]); g.strokeStyle = cssAccent(this.root); g.lineWidth = 1.2; g.stroke(); g.restore();
    }
    // brush cursor
    const kind = TOOLS[this.tool].kind;
    if (this._hover && !this._space && this._mode !== 'pan' && (kind === 'brush' || kind === 'shape') && this._hoverType !== 'touch') {
      const o = this.opts[this.tool];
      const r = (o.size / 2) * this.view.zoom * (TOOLS[this.tool].stamp === 'soft' ? 1.15 : 1);
      const { x, y } = this._hover;
      g.save();
      if (kind === 'brush' && r > 3) {
        g.beginPath(); g.arc(x, y, r, 0, TAU);
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2.5; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1; g.stroke();
        if (this.sym.mode !== 'off' && !this.stroke) {
          const d = this.toDoc(x, y);
          const T = this._symT();
          g.setLineDash([3, 3]);
          for (let i = 1; i < T.length; i++) {
            const m = T[i];
            const p = this.toScreen(m[0] * d.x + m[2] * d.y + m[4], m[1] * d.x + m[3] * d.y + m[5]);
            g.beginPath(); g.arc(p.x, p.y, Math.max(2, r), 0, TAU); g.strokeStyle = 'rgba(224,69,95,0.55)'; g.stroke();
          }
          g.setLineDash([]);
        }
      }
      g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
      g.restore();
    }
  }

  // ---------------------------------------------------------------- teardown
  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._changeT); clearTimeout(this._thumbT); clearTimeout(this._prefT);
    this._ro?.disconnect();
    window.removeEventListener('keydown', this._h.key);
    window.removeEventListener('keyup', this._h.keyup);
    window.removeEventListener('paste', this._h.paste);
    window.removeEventListener('blur', this._h.blur);
    window.removeEventListener('resize', this._h.dpr);
    this.ui.destroy();
    this._ls = {};
    this.layers = [];
  }
}

// ---------------------------------------------------------------- helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampDim(v) { return clamp(Math.round(+v || 1024), 16, MAX_DOC); }
function cssAccent(el) {
  const v = getComputedStyle(el).getPropertyValue('--sp-accent').trim();
  return v || '#e0455f';
}
function pointInQuad(p, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i], b = q[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function parseSize(v) {
  if (v == null) return null;
  if (typeof v === 'number') return { w: v, h: v };
  if (Array.isArray(v)) return { w: +v[0], h: +(v[1] ?? v[0]) };
  if (typeof v === 'object') return v.width ? { w: +v.width, h: +(v.height ?? v.width) } : v.w ? { w: +v.w, h: +(v.h ?? v.w) } : null;
  const s = String(v).toLowerCase();
  if (CANVAS_PRESETS[s]) return { w: CANVAS_PRESETS[s].w, h: CANVAS_PRESETS[s].h };
  const m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(s);
  if (m) return { w: +m[1], h: +m[2] };
  if (/^\d+$/.test(s)) return { w: +s, h: +s };
  return null;
}
function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    if (!/^data:|^blob:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image load failed'));
    img.src = src;
  });
}
function svgSize(text) {
  const vb = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/.exec(text);
  const wm = /<svg[^>]*\swidth\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i.exec(text);
  const hm = /<svg[^>]*\sheight\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i.exec(text);
  let w = wm ? +wm[1] : 0, h = hm ? +hm[1] : 0;
  if ((!w || !h) && vb) { w = w || +vb[3]; h = h || +vb[4]; }
  return { w: w || 1024, h: h || 1024, hasDims: !!(wm && hm) };
}
/** Normalise any image-like input into { source, w, h, cleanup? } */
export async function toDrawable(src) {
  if (!src) throw new Error('no image');
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) return { source: src, w: src.width, h: src.height };
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) return { source: src, w: src.width, h: src.height };
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    if (!src.complete) await new Promise((r, j) => { src.onload = r; src.onerror = j; });
    return { source: src, w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }
  if (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas) return { source: src, w: src.width, h: src.height };
  if (src instanceof Blob) {
    if (src.type === 'image/svg+xml') return toDrawable(await src.text());
    const url = URL.createObjectURL(src);
    try { const img = await loadImg(url); return { source: img, w: img.naturalWidth, h: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) }; }
    catch (e) { URL.revokeObjectURL(url); throw e; }
  }
  if (typeof src === 'string') {
    const s = src.trim();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(s)) {
      const sz = svgSize(s);
      let text = s;
      if (!sz.hasDims) text = s.replace(/<svg\b/i, `<svg width="${sz.w}" height="${sz.h}"`);
      if (!/xmlns=/.test(text)) text = text.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      try { const img = await loadImg(url); return { source: img, w: sz.w, h: sz.h, cleanup: () => URL.revokeObjectURL(url) }; }
      catch (e) { URL.revokeObjectURL(url); throw e; }
    }
    const img = await loadImg(s);
    return { source: img, w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 };
  }
  if (src.source && src.w) return src;
  throw new Error('unsupported image source');
}

/** Geometry for the shape tool. Returns { path(ctx), extent: [[x,y]...], closed } */
export function shapeGeometry(o, a, b, mods = {}) {
  let { x: ax, y: ay } = a, { x: bx, y: by } = b;
  const type = o.shapeType;
  const fromCenter = o.fromCenter || mods.alt;
  if (Math.hypot(bx - ax, by - ay) < 0.5) return null;
  if (type === 'line' || type === 'arc') {
    if (mods.shift) {
      const ang = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(bx - ax, by - ay);
      bx = ax + Math.cos(ang) * L; by = ay + Math.sin(ang) * L;
    }
    if (type === 'line') return { closed: false, extent: [[ax, ay], [bx, by]], path: (g) => { g.moveTo(ax, ay); g.lineTo(bx, by); } };
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    const nx = dy / L, ny = -dx / L, c = L / 2;
    const sg = clamp((o.arcBend ?? 50) / 100, -1, 1) * c;
    if (Math.abs(sg) < 0.5) return { closed: false, extent: [[ax, ay], [bx, by]], path: (g) => { g.moveTo(ax, ay); g.lineTo(bx, by); } };
    const R = (c * c + sg * sg) / (2 * Math.abs(sg));
    const sign = Math.sign(sg);
    const ccx = mx + nx * (sg - sign * R), ccy = my + ny * (sg - sign * R);
    const a0 = Math.atan2(ay - ccy, ax - ccx), a1 = Math.atan2(by - ccy, bx - ccx);
    const apx = mx + nx * sg, apy = my + ny * sg;
    const ap = Math.atan2(apy - ccy, apx - ccx);
    const norm = (t) => ((t % TAU) + TAU) % TAU;
    const ccw = !(norm(ap - a0) < norm(a1 - a0));
    return { closed: false, extent: [[ax, ay], [bx, by], [apx, apy], [mx + nx * sg * 1.05, my + ny * sg * 1.05]], path: (g) => { g.moveTo(ax, ay); g.arc(ccx, ccy, R, a0, a1, ccw); } };
  }
  if (type === 'polygon' || type === 'star') {
    let ang = Math.atan2(by - ay, bx - ax);
    if (mods.shift) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
    const R = Math.hypot(bx - ax, by - ay);
    const n = clamp(Math.round(o.sides || 5), 3, 24);
    const pts = [];
    if (type === 'polygon') for (let k = 0; k < n; k++) { const t = ang + k * TAU / n; pts.push([ax + Math.cos(t) * R, ay + Math.sin(t) * R]); }
    else {
      const ri = R * clamp((o.starInner ?? 45) / 100, 0.05, 0.95);
      for (let k = 0; k < n * 2; k++) { const t = ang + k * Math.PI / n; const rr = k % 2 ? ri : R; pts.push([ax + Math.cos(t) * rr, ay + Math.sin(t) * rr]); }
    }
    return { closed: true, extent: pts, path: (g) => { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); } };
  }
  // rect / ellipse
  let w = bx - ax, h = by - ay;
  if (mods.shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  let x0, y0, x1, y1;
  if (fromCenter) { x0 = ax - w; y0 = ay - h; x1 = ax + w; y1 = ay + h; } else { x0 = ax; y0 = ay; x1 = ax + w; y1 = ay + h; }
  const L = Math.min(x0, x1), T = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
  const extent = [[L, T], [L + W, T], [L, T + H], [L + W, T + H]];
  if (type === 'rect') return { closed: true, extent, path: (g) => g.rect(L, T, W, H) };
  return { closed: true, extent, path: (g) => g.ellipse(L + W / 2, T + H / 2, Math.max(0.1, W / 2), Math.max(0.1, H / 2), 0, 0, TAU) };
}

export { TOOLS, INK_SWATCHES, SKIN_TONES };
export default SketchPad;
