// DOM UI for the Sketch studio: toolbar, tool options, colour, symmetry/guides, layers,
// canvas/export menu, modals (import chooser, photo → stencil), responsive phone layout.

import { icon } from './icons.js';
import { TOOLS, TOOL_ORDER, INK_SWATCHES, SKIN_TONES, Stroke, makeCanvas } from './brushes.js';
import { FONTS, ensureFont } from './text.js';
import { photoToStencil, STENCIL_DEFAULTS } from './stencil.js';

const PRESETS = [
  { id: 'square', label: 'Square', w: 1024, h: 1024 },
  { id: 'portrait', label: 'Portrait 3:4', w: 768, h: 1024 },
  { id: 'landscape', label: 'Landscape 4:3', w: 1024, h: 768 },
  { id: 'band', label: 'Armband 4:1', w: 2048, h: 512 },
];

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
function ibtn(name, label, onclick, cls = '') {
  return h('button', { type: 'button', class: 'sp-ibtn ' + cls, title: label, 'aria-label': label, html: icon(name), onclick });
}
function tbtn(name, label, onclick, cls = '') {
  return h('button', { type: 'button', class: 'sp-btn ' + cls, title: label, onclick, html: icon(name) + `<span>${label}</span>` });
}

function slider({ label, min, max, step = 1, value, log = false, unit = '', fmt, onInput, onChange }) {
  const toPos = (v) => (log ? Math.log(v / min) / Math.log(max / min) * 1000 : v);
  const fromPos = (p) => (log ? min * Math.pow(max / min, p / 1000) : +p);
  const input = h('input', { type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step, 'aria-label': label });
  const out = h('span', { class: 'sp-val' });
  const show = (v) => { out.textContent = (fmt ? fmt(v) : (Math.abs(v) < 10 && step < 1 ? (+v).toFixed(1) : Math.round(v))) + unit; };
  const fill = () => { const p = (input.value - input.min) / (input.max - input.min) * 100; input.style.setProperty('--p', p + '%'); };
  const set = (v) => { input.value = toPos(v); show(v); fill(); };
  input.addEventListener('input', () => {
    let v = fromPos(input.value);
    if (log) v = v < 10 ? Math.round(v * 2) / 2 : Math.round(v);
    show(v); fill(); onInput?.(v);
  });
  input.addEventListener('change', () => onChange?.(fromPos(input.value)));
  set(value);
  const el = h('label', { class: 'sp-row sp-slider' }, h('span', { class: 'sp-lbl' }, label), input, out);
  return { el, set, input };
}
function seg({ options, value, onChange, label, iconOnly = false, cls = '' }) {
  const el = h('div', { class: 'sp-seg ' + cls, role: 'radiogroup', 'aria-label': label || '' });
  const btns = options.map((o) => {
    const b = h('button', {
      type: 'button', role: 'radio', title: o.title || o.label, 'aria-label': o.title || o.label,
      html: (o.icon ? icon(o.icon) : '') + (iconOnly && o.icon ? '' : `<span>${o.label}</span>`),
      onclick: () => { set(o.value); onChange?.(o.value); },
    });
    b.dataset.value = o.value;
    el.append(b);
    return b;
  });
  const set = (v) => btns.forEach((b) => { const on = b.dataset.value === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  set(value);
  return { el, set };
}
function toggle({ label, value, onChange, iconName }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange?.(input.checked));
  const el = h('label', { class: 'sp-row sp-toggle' }, iconName ? h('span', { class: 'sp-ticon', html: icon(iconName) }) : null, h('span', { class: 'sp-lbl' }, label), input, h('span', { class: 'sp-switch', 'aria-hidden': 'true' }));
  return { el, set: (v) => { input.checked = !!v; }, input };
}

// ------------------------------------------------------------ HSV helpers
function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return { h: hh, s: mx ? d / mx : 0, v: mx };
}
function hsvToHex(hh, s, v) {
  const f = (n) => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export function buildUI(pad) {
  const ui = { compact: false, modalOpen: false };
  const container = pad.container;
  const root = h('div', { class: 'sketchpad', tabindex: '-1' });
  ui.root = root;

  // ---------------------------------------------------------- top bar
  const undoB = ibtn('undo', 'Undo (Ctrl+Z)', () => pad.undo());
  const redoB = ibtn('redo', 'Redo (Shift+Ctrl+Z)', () => pad.redo());
  const zoomLbl = h('button', { type: 'button', class: 'sp-zoomlbl', title: 'Zoom — click for 100%', onclick: () => pad.setZoom(1) }, '100%');
  const fileInput = h('input', { type: 'file', accept: 'image/*,.svg', hidden: true });
  let fileMode = 'choose';
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]; fileInput.value = '';
    if (!f) return;
    if (fileMode === 'stencil') toDrawableFromFile(f).then((d) => ui.stencilDialog(d)).catch(() => ui.toast('Could not read that image'));
    else if (fileMode === 'ref') pad.loadImage(f, { asReference: true, fit: 1 }).catch(() => ui.toast('Could not read that image'));
    else pad.importFile(f);
  });
  const pickFile = (mode) => { fileMode = mode; fileInput.click(); };
  async function toDrawableFromFile(f) {
    const { toDrawable } = await import('./sketchpad.js');
    return toDrawable(f);
  }
  ui.pickFile = pickFile;

  const docBtn = tbtn('canvas', 'Canvas', (e) => { e.stopPropagation(); togglePop(); }, 'sp-docbtn');
  const symQuick = ibtn('symRadial', 'Symmetry & guides', () => openSheet('sym'), 'sp-only-compact');
  const moreB = ibtn('more', 'Canvas, import & export', () => openSheet('doc'), 'sp-only-compact');
  const top = h('header', { class: 'sp-top' },
    h('div', { class: 'sp-group sp-only-wide' },
      tbtn('importImg', 'Import', () => pickFile('choose')),
      tbtn('stencil', 'Photo → stencil', () => startStencil()),
      docBtn),
    h('div', { class: 'sp-group' }, undoB, redoB, symQuick),
    h('div', { class: 'sp-flex' }),
    h('div', { class: 'sp-group sp-zoom' },
      ibtn('zoomOut', 'Zoom out (−)', () => pad.zoomBy(0.8), 'sp-only-wide'),
      zoomLbl,
      ibtn('zoomIn', 'Zoom in (+)', () => pad.zoomBy(1.25), 'sp-only-wide'),
      ibtn('fit', 'Fit to screen (0)', () => pad.fitView()),
      ibtn('rotate', 'Rotate view 15° (R resets)', () => pad.rotateView(15), 'sp-only-wide')),
    h('div', { class: 'sp-group sp-only-wide' },
      h('button', { type: 'button', class: 'sp-btn sp-primary', title: 'Download transparent PNG', onclick: () => pad.download(false), html: icon('download') + '<span>PNG</span>' })),
    moreB,
    fileInput);

  // ---------------------------------------------------------- tool rail
  const toolBtns = {};
  const makeToolBtn = (id) => {
    const t = TOOLS[id];
    const key = t.key ? ` (${t.key})` : '';
    const b = h('button', { type: 'button', class: 'sp-tool', title: t.label + key, 'aria-label': t.label, html: icon(t.icon) + `<span class="sp-tool-lbl">${t.short}</span>`, onclick: () => { if (pad.tool === id && ui.compact) openSheet('tool'); else pad.setTool(id); } });
    b.dataset.tool = id;
    (toolBtns[id] ||= []).push(b);
    return b;
  };
  const rail = h('nav', { class: 'sp-rail', 'aria-label': 'Tools' });
  TOOL_ORDER.forEach((grp, i) => { if (i) rail.append(h('div', { class: 'sp-sep' })); grp.forEach((id) => rail.append(makeToolBtn(id))); });
  const railChip = h('button', { type: 'button', class: 'sp-chip sp-rail-chip', title: 'Colour', 'aria-label': 'Current colour', onclick: () => { secs.color.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); secs.color.classList.remove('collapsed'); } });
  rail.append(h('div', { class: 'sp-flex' }), railChip);

  // ---------------------------------------------------------- stage
  const canvas = h('canvas', { class: 'sp-canvas', 'aria-label': 'Drawing canvas', role: 'img' });
  const toastEl = h('div', { class: 'sp-toast', role: 'status', 'aria-live': 'polite' });
  const dropEl = h('div', { class: 'sp-drop' }, h('div', { html: icon('importImg') + '<span>Drop image to import</span>' }));
  const textArea = h('textarea', { class: 'sp-textarea', rows: 2, placeholder: 'Type your lettering…', 'aria-label': 'Text' });
  textArea.addEventListener('input', () => pad.setTextValue(textArea.value));
  const textEd = h('div', { class: 'sp-textedit', hidden: true },
    textArea,
    h('div', { class: 'sp-textedit-actions' },
      h('span', { class: 'sp-hint' }, 'Drag the text to move it'),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => pad._textCancel(), html: icon('close') + '<span>Cancel</span>' }),
      h('button', { type: 'button', class: 'sp-btn sp-primary', onclick: () => pad._textCommit(), html: icon('check') + '<span>Place</span>' })));
  ui.textArea = textArea;
  const xfBar = h('div', { class: 'sp-floatbar', hidden: true },
    ibtn('flipH', 'Flip horizontal', () => pad.xfFlip('h')),
    ibtn('flipV', 'Flip vertical', () => pad.xfFlip('v')),
    ibtn('rot90', 'Rotate 90°', () => pad.xfRotate(90)),
    ibtn('center', 'Center on canvas', () => pad.xfCenter()),
    h('span', { class: 'sp-sep-v' }),
    h('button', { type: 'button', class: 'sp-btn sp-xf-cancel', onclick: () => pad.cancelTransform(), html: icon('close') + '<span>Cancel</span>' }),
    h('button', { type: 'button', class: 'sp-btn sp-primary sp-xf-apply', onclick: () => pad.applyTransform(), html: icon('check') + '<span>Apply</span>' }));
  const stage = h('main', { class: 'sp-stage' }, canvas, xfBar, textEd, toastEl, dropEl);
  ui.stage = stage; ui.canvas = canvas;

  // ---------------------------------------------------------- sections
  const secs = {};
  const mkSec = (id, title, iconName, body, extraHead) => {
    const head = h('button', { type: 'button', class: 'sp-sec-head', 'aria-expanded': 'true' }, h('span', { class: 'sp-sec-ic', html: icon(iconName) }), h('span', { class: 'sp-sec-title' }, title), extraHead || null);
    head.addEventListener('click', (e) => {
      if (ui.compact || e.target.closest('.sp-sec-extra')) return;
      const s = secs[id]; s.classList.toggle('collapsed'); head.setAttribute('aria-expanded', !s.classList.contains('collapsed'));
    });
    const s = h('section', { class: 'sp-sec', dataset: { sec: id } }, head, body);
    s._title = title; s._titleEl = head.querySelector('.sp-sec-title');
    secs[id] = s;
    return s;
  };

  // tool options
  const toolBody = h('div', { class: 'sp-sec-body sp-toolopts' });
  const resetBtn = h('span', { class: 'sp-sec-extra sp-link', role: 'button', tabindex: '0', title: 'Reset this tool to defaults', text: 'Reset', onclick: () => { const id = pad.tool; Object.assign(pad.opts[id], TOOLS[id].defaults); ui.syncTool(); pad._savePrefs(); } });
  mkSec('tool', 'Tool', 'sliders', toolBody, resetBtn);

  // colour
  const colorBody = h('div', { class: 'sp-sec-body sp-color' });
  mkSec('color', 'Colour', 'palette', colorBody);
  const svCanvas = h('canvas', { class: 'sp-sv', width: 240, height: 120, 'aria-label': 'Saturation and brightness' });
  const svKnob = h('div', { class: 'sp-sv-knob' });
  const svWrap = h('div', { class: 'sp-sv-wrap' }, svCanvas, svKnob);
  const hueBar = h('div', { class: 'sp-hue', 'aria-label': 'Hue', role: 'slider' });
  const hueKnob = h('div', { class: 'sp-hue-knob' });
  hueBar.append(hueKnob);
  const curChip = h('div', { class: 'sp-chip sp-chip-lg' });
  const hexIn = h('input', { class: 'sp-hex', type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': 'Hex colour' });
  hexIn.addEventListener('change', () => { const v = hexIn.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v) || /^#?[0-9a-f]{3}$/i.test(v)) pad.setColor(v.startsWith('#') ? v : '#' + v, { recent: true }); else ui.syncColor(); });
  const swatches = h('div', { class: 'sp-swatches' });
  INK_SWATCHES.forEach((s) => swatches.append(h('button', { type: 'button', class: 'sp-sw', title: s.n, 'aria-label': s.n, style: { background: s.c }, onclick: () => pad.setColor(s.c, { recent: true }) })));
  const recentEl = h('div', { class: 'sp-swatches sp-recent' });
  colorBody.append(
    h('div', { class: 'sp-color-top' }, curChip, hexIn),
    svWrap, hueBar,
    h('div', { class: 'sp-sublbl' }, 'Tattoo inks'), swatches,
    h('div', { class: 'sp-sublbl sp-recent-lbl' }, 'Recent'), recentEl);
  let hsv = hexToHsv(pad.color);
  const drawSV = () => {
    const g = svCanvas.getContext('2d'), W = svCanvas.width, H = svCanvas.height;
    g.fillStyle = hsvToHex(hsv.h, 1, 1); g.fillRect(0, 0, W, H);
    const a = g.createLinearGradient(0, 0, W, 0); a.addColorStop(0, '#fff'); a.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = a; g.fillRect(0, 0, W, H);
    const b = g.createLinearGradient(0, 0, 0, H); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, '#000');
    g.fillStyle = b; g.fillRect(0, 0, W, H);
    svKnob.style.left = hsv.s * 100 + '%'; svKnob.style.top = (1 - hsv.v) * 100 + '%';
    svKnob.style.background = hsvToHex(hsv.h, hsv.s, hsv.v);
    hueKnob.style.left = (hsv.h / 360) * 100 + '%';
  };
  const dragArea = (el, fn, done) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const mv = (ev) => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); done?.(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      mv(e);
    });
  };
  let selfColor = false;
  const applyHsv = () => { selfColor = true; pad.setColor(hsvToHex(hsv.h, hsv.s, hsv.v)); selfColor = false; drawSV(); };
  dragArea(svWrap, (x, y) => { hsv.s = x; hsv.v = 1 - y; applyHsv(); }, () => pad._pushRecent(pad.color));
  dragArea(hueBar, (x) => { hsv.h = Math.min(359.9, x * 360); applyHsv(); }, () => pad._pushRecent(pad.color));

  // symmetry & guides
  const symBody = h('div', { class: 'sp-sec-body' });
  mkSec('sym', 'Symmetry & guides', 'symKaleido', symBody);
  const symSeg = seg({
    label: 'Symmetry', iconOnly: true, cls: 'sp-seg-icons', value: pad.sym.mode, onChange: (v) => pad.setSymmetry({ mode: v }),
    options: [
      { value: 'off', label: 'Off', icon: 'symOff', title: 'Symmetry off' },
      { value: 'vertical', label: 'Mirror', icon: 'symV', title: 'Vertical mirror (left ↔ right)' },
      { value: 'horizontal', label: 'Flip', icon: 'symH', title: 'Horizontal mirror (top ↔ bottom)' },
      { value: 'quad', label: 'Quad', icon: 'symQuad', title: 'Quad (both axes)' },
      { value: 'radial', label: 'Radial', icon: 'symRadial', title: 'Radial — mandala' },
      { value: 'kaleido', label: 'Kaleido', icon: 'symKaleido', title: 'Mirrored radial — kaleidoscope' },
    ],
  });
  const symLabel = h('div', { class: 'sp-symlabel' });
  const radialS = slider({ label: 'Segments', min: 2, max: 24, value: pad.sym.n, onInput: (v) => pad.setSymmetry({ n: v }) });
  const symShow = toggle({ label: 'Show symmetry axes', value: pad.sym.show, onChange: (v) => pad.setSymmetry({ show: v }) });
  const gGrid = toggle({ label: 'Grid', iconName: 'grid', value: pad.guides.grid, onChange: (v) => pad.setGuides({ grid: v }) });
  const gSize = slider({ label: 'Grid size', min: 8, max: 256, value: pad.guides.gridSize, unit: 'px', onInput: (v) => pad.setGuides({ gridSize: v }) });
  const gCenter = toggle({ label: 'Center lines', iconName: 'center', value: pad.guides.center, onChange: (v) => pad.setGuides({ center: v }) });
  const gRings = toggle({ label: 'Circle guides', iconName: 'rings', value: pad.guides.rings, onChange: (v) => pad.setGuides({ rings: v }) });
  const gRingN = slider({ label: 'Rings', min: 1, max: 12, value: pad.guides.ringCount, onInput: (v) => pad.setGuides({ ringCount: v }) });
  const gSnap = toggle({ label: 'Snap to guides', iconName: 'magnet', value: pad.guides.snap, onChange: (v) => pad.setGuides({ snap: v }) });
  symBody.append(symSeg.el, symLabel, radialS.el, symShow.el, h('div', { class: 'sp-divider' }), gGrid.el, gSize.el, gCenter.el, gRings.el, gRingN.el, gSnap.el);

  // layers
  const layerList = h('ol', { class: 'sp-layers', 'aria-label': 'Layers' });
  const layerOpacity = slider({ label: 'Opacity', min: 0, max: 100, value: 100, unit: '%', onInput: (v) => pad.active && pad.setLayerProp(pad.active, 'opacity', v / 100) });
  const refExport = toggle({ label: 'Include reference in export', value: false, onChange: (v) => pad.active && pad.setLayerProp(pad.active, 'exportRef', v) });
  const layerActions = h('div', { class: 'sp-layer-actions' },
    ibtn('plus', 'New layer', () => pad.addLayer()),
    ibtn('duplicate', 'Duplicate layer', () => pad.duplicateLayer()),
    ibtn('merge', 'Merge down', () => pad.mergeDown()),
    ibtn('clear', 'Clear layer', () => pad.clearLayer()),
    ibtn('up', 'Move layer up', () => pad.active && pad.moveLayer(pad.active, pad.layers.indexOf(pad.active) + 1)),
    ibtn('down', 'Move layer down', () => pad.active && pad.moveLayer(pad.active, pad.layers.indexOf(pad.active) - 1)),
    ibtn('trash', 'Delete layer', () => pad.deleteLayer(), 'sp-danger'));
  const layersBody = h('div', { class: 'sp-sec-body' },
    layerList, layerOpacity.el, refExport.el, layerActions,
    h('button', { type: 'button', class: 'sp-btn sp-wide', onclick: () => pickFile('ref'), html: icon('image') + '<span>Add trace reference photo…</span>' }));
  const addLayerHead = h('span', { class: 'sp-sec-extra sp-ibtn sp-ibtn-sm', role: 'button', tabindex: '0', title: 'New layer', 'aria-label': 'New layer', html: icon('plus'), onclick: () => pad.addLayer() });
  mkSec('layers', 'Layers', 'layers', layersBody, addLayerHead);

  // canvas / file
  const docBody = h('div', { class: 'sp-sec-body' });
  mkSec('doc', 'Canvas & export', 'canvas', docBody);
  const presetSeg = seg({
    label: 'Canvas shape', cls: 'sp-seg-presets', value: '', onChange: (v) => applyPreset(v),
    options: PRESETS.map((p) => ({ value: p.id, label: p.label, title: `${p.label} (${p.w}×${p.h})`, icon: null })),
  });
  presetSeg.el.querySelectorAll('button').forEach((b, i) => {
    const p = PRESETS[i]; const k = 22 / Math.max(p.w, p.h);
    b.insertAdjacentHTML('afterbegin', `<i class="sp-aspect" style="width:${Math.max(5, p.w * k)}px;height:${Math.max(5, p.h * k)}px"></i>`);
  });
  const resSeg = seg({ label: 'Resolution', value: '1', onChange: (v) => applyPreset(currentPreset() || 'square', +v), options: [{ value: '1', label: 'Standard' }, { value: '1.5', label: 'High' }, { value: '2', label: 'Max' }] });
  const docDims = h('div', { class: 'sp-hint sp-dims' });
  const bgSeg = seg({ label: 'Preview background', value: pad.bg.mode, onChange: (v) => pad.setBackground(v), options: [{ value: 'checker', label: 'Transparent', icon: 'checker' }, { value: 'skin', label: 'Skin' }, { value: 'white', label: 'White' }] });
  const skinRow = h('div', { class: 'sp-swatches sp-skin' });
  SKIN_TONES.forEach((c) => skinRow.append(h('button', { type: 'button', class: 'sp-sw', title: 'Skin tone ' + c, 'aria-label': 'Skin tone ' + c, style: { background: c }, onclick: () => pad.setBackground('skin', c) })));
  docBody.append(
    h('div', { class: 'sp-btnrow sp-only-compact' },
      h('button', { type: 'button', class: 'sp-btn', onclick: () => { closeSheet(); pickFile('choose'); }, html: icon('importImg') + '<span>Import image</span>' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => { closeSheet(); startStencil(); }, html: icon('stencil') + '<span>Photo → stencil</span>' })),
    h('div', { class: 'sp-sublbl' }, 'Canvas shape'), presetSeg.el, resSeg.el, docDims,
    h('div', { class: 'sp-sublbl' }, 'Preview background'), bgSeg.el, skinRow,
    h('div', { class: 'sp-hint' }, 'Backgrounds, guides and reference layers are never exported.'),
    h('div', { class: 'sp-sublbl' }, 'Export'),
    h('div', { class: 'sp-btnrow' },
      h('button', { type: 'button', class: 'sp-btn sp-primary', onclick: () => pad.download(false), html: icon('download') + '<span>Download PNG</span>' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => pad.download(true), html: icon('fit') + '<span>Trimmed PNG</span>' })),
    h('div', { class: 'sp-btnrow' },
      h('button', { type: 'button', class: 'sp-btn sp-danger', onclick: () => confirmModal('Clear the whole sketch?', 'All layers will be removed. You can undo this.', 'Clear', () => pad.clear()), html: icon('trash') + '<span>Clear sketch</span>' })));
  function currentPreset() {
    const r = pad.w / pad.h;
    const p = PRESETS.find((p) => Math.abs(p.w / p.h - r) < 0.01);
    return p?.id;
  }
  function applyPreset(id, mult) {
    const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
    const cur = currentPreset();
    const m = mult ?? (cur ? Math.round(Math.max(pad.w, pad.h) / Math.max(PRESETS.find((x) => x.id === cur).w, PRESETS.find((x) => x.id === cur).h) * 2) / 2 : 1);
    pad.resizeDocument(Math.round(p.w * (m || 1)), Math.round(p.h * (m || 1)));
    ui.syncDoc();
  }

  // ---------------------------------------------------------- panel / dock / sheet / popover
  const panel = h('aside', { class: 'sp-panel', 'aria-label': 'Studio panels' }, secs.tool, secs.color, secs.sym, secs.layers);
  const pop = h('div', { class: 'sp-pop', hidden: true }, secs.doc);
  const homes = { tool: panel, color: panel, sym: panel, layers: panel, doc: pop };
  const order = ['tool', 'color', 'sym', 'layers'];
  const dockTools = h('div', { class: 'sp-dock-tools' });
  TOOL_ORDER.flat().forEach((id) => dockTools.append(makeToolBtn(id)));
  const dockChip = h('button', { type: 'button', class: 'sp-chip sp-dock-chip', title: 'Colour', 'aria-label': 'Colour', onclick: () => openSheet('color') });
  const dockOpts = ibtn('sliders', 'Tool options', () => openSheet('tool'), 'sp-dock-btn');
  const dockLayers = ibtn('layers', 'Layers', () => openSheet('layers'), 'sp-dock-btn');
  const dock = h('div', { class: 'sp-dock' }, dockTools, h('div', { class: 'sp-dock-right' }, dockChip, dockOpts, dockLayers));
  const sheetTitle = h('div', { class: 'sp-sheet-title' });
  const sheetBody = h('div', { class: 'sp-sheet-body' });
  const sheet = h('div', { class: 'sp-sheet', hidden: true, role: 'dialog' },
    h('div', { class: 'sp-sheet-head' }, h('div', { class: 'sp-sheet-grab' }), sheetTitle, ibtn('close', 'Close', () => closeSheet(), 'sp-ibtn-sm')),
    sheetBody);
  let sheetName = null;
  function openSheet(name) {
    if (!ui.compact) {
      if (name === 'doc') { togglePop(); return; }
      secs[name]?.classList.remove('collapsed');
      secs[name]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (sheetName === name) { closeSheet(); return; }
    closeSheet();
    sheetName = name;
    sheetTitle.textContent = name === 'tool' ? TOOLS[pad.tool].label : secs[name]._title;
    secs[name].classList.remove('collapsed');
    sheetBody.append(secs[name]);
    sheet.hidden = false;
    root.classList.add('sp-sheet-open');
    [dockChip, dockOpts, dockLayers, symQuick, moreB].forEach((b) => b.classList.remove('on'));
    ({ color: dockChip, tool: dockOpts, layers: dockLayers, sym: symQuick, doc: moreB })[name]?.classList.add('on');
  }
  function closeSheet() {
    if (!sheetName) return;
    const s = secs[sheetName];
    rehome(sheetName, s);
    sheetName = null;
    sheet.hidden = true;
    root.classList.remove('sp-sheet-open');
    [dockChip, dockOpts, dockLayers, symQuick, moreB].forEach((b) => b.classList.remove('on'));
  }
  function rehome(name, s) {
    const home = homes[name];
    if (home === panel) {
      const idx = order.indexOf(name);
      const next = order.slice(idx + 1).map((n) => secs[n]).find((x) => x.parentNode === panel);
      panel.insertBefore(s, next || null);
    } else home.append(s);
  }
  function togglePop(force) {
    const show = force ?? pop.hidden;
    pop.hidden = !show;
    docBtn.classList.toggle('on', show);
    if (show) ui.syncDoc();
  }
  ui.closePopovers = () => togglePop(false);
  ui.closeSheet = closeSheet;
  ui.openSheet = openSheet;
  const outside = (e) => { if (!pop.hidden && !pop.contains(e.target) && !docBtn.contains(e.target)) togglePop(false); };
  document.addEventListener('pointerdown', outside, true);

  root.append(top, rail, stage, panel, pop, sheet, dock);
  container.append(root);

  ui.updateCompact = () => {
    const w = root.clientWidth;
    if (!w) return;
    const c = w <= 700;
    if (c !== ui.compact) {
      closeSheet(); togglePop(false);
      ui.compact = c;
      root.classList.toggle('sp-compact', c);
      pad._needFit = true;
    }
  };

  // ---------------------------------------------------------- drag & drop
  let dragDepth = 0;
  root.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dragDepth++; root.classList.add('sp-dragging'); } });
  root.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  root.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove('sp-dragging'); });
  root.addEventListener('drop', (e) => {
    dragDepth = 0; root.classList.remove('sp-dragging');
    const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/') || /\.svg$/i.test(f.name));
    if (f) { e.preventDefault(); pad.importFile(f); }
  });

  // ---------------------------------------------------------- tool options
  let brushPreview = null;
  function buildToolOptions() {
    const id = pad.tool, def = TOOLS[id], o = pad.opts[id];
    toolBody.textContent = '';
    secs.tool._titleEl.textContent = def.label;
    if (sheetName === 'tool') sheetTitle.textContent = def.label;
    const set = (k) => (v) => pad.setOpt(k, v);
    const pctS = (k, label) => slider({ label, min: 0, max: 100, value: Math.round((o[k] ?? 1) * 100), unit: '%', onInput: (v) => { pad.setOpt(k, v / 100); refreshPreview(); } });
    const plain = (k, label, min, max, extra = {}) => slider({ label, min, max, value: o[k], onInput: (v) => { pad.setOpt(k, v); refreshPreview(); }, ...extra });
    brushPreview = null;
    if (def.kind === 'brush') {
      brushPreview = h('canvas', { class: 'sp-preview', width: 480, height: 110, 'aria-hidden': 'true' });
      toolBody.append(brushPreview);
    }
    for (const key of def.ui) {
      let el = null;
      switch (key) {
        case 'size': el = slider({ label: 'Size', min: 0.5, max: def.kind === 'shape' ? 80 : 400, log: true, value: o.size, unit: 'px', onInput: (v) => { pad.setOpt('size', v); refreshPreview(); } }).el; break;
        case 'opacity': el = pctS('opacity', 'Opacity').el; break;
        case 'flow': el = pctS('flow', 'Flow').el; break;
        case 'smoothing': el = plain('smoothing', 'Stabilizer', 0, 100).el; break;
        case 'pressure':
          el = h('div', { class: 'sp-pair' },
            toggle({ label: 'Pressure → size', value: o.pSize, onChange: (v) => { pad.setOpt('pSize', v); refreshPreview(); } }).el,
            toggle({ label: 'Pressure → opacity', value: o.pOpacity, onChange: (v) => { pad.setOpt('pOpacity', v); refreshPreview(); } }).el);
          break;
        case 'taper': el = plain('taper', 'Taper', 0, 100).el; break;
        case 'nibAngle': el = plain('nibAngle', 'Nib angle', 0, 180, { unit: '°' }).el; break;
        case 'nibThin': el = plain('nibThin', 'Nib thickness', 5, 100, { unit: '%' }).el; break;
        case 'hardness': el = plain('hardness', 'Hardness', 0, 100, { unit: '%' }).el; break;
        case 'whip': el = plain('whip', 'Whip fade', 0, 100, { unit: '%' }).el; break;
        case 'density': el = plain('density', 'Density', 1, 100, { unit: '%' }).el; break;
        case 'dotSize': el = plain('dotSize', 'Dot size', 0.5, 16, { step: 0.5, unit: 'px' }).el; break;
        case 'jitter': el = plain('jitter', 'Size jitter', 0, 100, { unit: '%' }).el; break;
        case 'grain': el = plain('grain', 'Grain', 0, 100, { unit: '%' }).el; break;
        case 'hatchMode': el = seg({ label: 'Hatch style', value: o.hatchMode, onChange: (v) => { pad.setOpt('hatchMode', v); refreshPreview(); }, options: [{ value: 'lines', label: 'Lines' }, { value: 'cross', label: 'Cross' }, { value: 'rake', label: 'Contour' }] }).el; break;
        case 'hatchSpacing': el = plain('hatchSpacing', 'Line spacing', 3, 40, { unit: 'px' }).el; break;
        case 'hatchAngle': el = plain('hatchAngle', 'Angle', 0, 180, { unit: '°' }).el; break;
        case 'hatchWidth': el = plain('hatchWidth', 'Line width', 0.5, 8, { step: 0.1, unit: 'px' }).el; break;
        case 'eraseMode': el = seg({ label: 'Eraser edge', value: o.eraseMode, onChange: (v) => { pad.setOpt('eraseMode', v); refreshPreview(); }, options: [{ value: 'hard', label: 'Hard' }, { value: 'soft', label: 'Soft' }] }).el; break;
        case 'tolerance': el = plain('tolerance', 'Tolerance', 0, 100, { unit: '%' }).el; break;
        case 'expand': el = plain('expand', 'Grow into lines', 0, 4, { unit: 'px' }).el; break;
        case 'sample': el = seg({ label: 'Sample', value: o.sample, onChange: set('sample'), options: [{ value: 'layer', label: 'This layer' }, { value: 'all', label: 'All layers' }] }).el; break;
        case 'pickSample': el = seg({ label: 'Sample', value: o.pickSample, onChange: set('pickSample'), options: [{ value: 'all', label: 'All layers' }, { value: 'layer', label: 'This layer' }] }).el; break;
        case 'shapeType':
          el = seg({
            label: 'Shape', iconOnly: true, cls: 'sp-seg-icons', value: o.shapeType, onChange: (v) => { pad.setOpt('shapeType', v); buildToolOptions(); },
            options: [{ value: 'line', label: 'Line', icon: 'shLine' }, { value: 'rect', label: 'Rectangle', icon: 'shRect' }, { value: 'ellipse', label: 'Ellipse', icon: 'shEllipse' }, { value: 'polygon', label: 'Polygon', icon: 'shPolygon' }, { value: 'star', label: 'Star', icon: 'shStar' }, { value: 'arc', label: 'Arc', icon: 'shArc' }],
          }).el;
          break;
        case 'shapeFill': if (!['line', 'arc'].includes(o.shapeType)) el = seg({ label: 'Style', value: o.shapeFill, onChange: set('shapeFill'), options: [{ value: 'outline', label: 'Outline' }, { value: 'fill', label: 'Filled' }] }).el; break;
        case 'sides': if (['polygon', 'star'].includes(o.shapeType)) el = plain('sides', o.shapeType === 'star' ? 'Points' : 'Sides', 3, 24).el; break;
        case 'starInner': if (o.shapeType === 'star') el = plain('starInner', 'Inner radius', 10, 90, { unit: '%' }).el; break;
        case 'arcBend': if (o.shapeType === 'arc') el = plain('arcBend', 'Bend', -100, 100, { unit: '%' }).el; break;
        case 'fromCenter': if (['rect', 'ellipse'].includes(o.shapeType)) el = toggle({ label: 'Draw from center (Alt)', value: o.fromCenter, onChange: set('fromCenter') }).el; break;
        case 'font': {
          const sel = h('select', { class: 'sp-select', 'aria-label': 'Font' });
          FONTS.forEach((f) => { const op = h('option', { value: f.id }, f.label); op.style.fontFamily = `"${f.id}", ${f.fallback}`; sel.append(op); });
          sel.value = o.font;
          sel.style.fontFamily = `"${o.font}", ${(FONTS.find((f) => f.id === o.font) || FONTS[0]).fallback}`;
          sel.addEventListener('change', () => { pad.setOpt('font', sel.value); sel.style.fontFamily = `"${sel.value}", ${(FONTS.find((f) => f.id === sel.value) || FONTS[0]).fallback}`; });
          el = h('label', { class: 'sp-row' }, h('span', { class: 'sp-lbl' }, 'Font'), sel);
          break;
        }
        case 'fontSize': el = plain('fontSize', 'Size', 8, 400, { unit: 'px' }).el; break;
        case 'letterSpacing': el = plain('letterSpacing', 'Spacing', -20, 80, { unit: '%' }).el; break;
        case 'curve': el = plain('curve', 'Arc curve', -360, 360, { unit: '°' }).el; break;
        case 'align': el = seg({ label: 'Align', iconOnly: true, cls: 'sp-seg-icons', value: o.align, onChange: set('align'), options: [{ value: 'left', label: 'Left', icon: 'alignLeft' }, { value: 'center', label: 'Center', icon: 'alignCenter' }, { value: 'right', label: 'Right', icon: 'alignRight' }] }).el; break;
        case 'moveActions':
          el = h('div', {},
            h('div', { class: 'sp-btnrow' },
              ibtn('flipH', 'Flip horizontal', () => pad.xfFlip('h')), ibtn('flipV', 'Flip vertical', () => pad.xfFlip('v')),
              ibtn('rot90', 'Rotate 90°', () => pad.xfRotate(90)), ibtn('center', 'Center on canvas', () => pad.xfCenter())),
            h('p', { class: 'sp-hint' }, 'Drag inside the box to move, corners to scale (Shift = free), edges to stretch, outside to rotate (Shift snaps 15°). Enter applies.'));
          break;
      }
      if (el) toolBody.append(el);
    }
    if (def.kind === 'text') toolBody.append(h('p', { class: 'sp-hint' }, 'Tap the canvas to place text. Arc curve bends lettering for banners; radial symmetry repeats it around the center.'));
    if (def.kind === 'fill') toolBody.append(h('p', { class: 'sp-hint' }, '“Grow into lines” tucks the fill under anti-aliased line edges so there are no halos.'));
    refreshPreview();
  }
  let pvRaf = 0;
  function refreshPreview() { if (!brushPreview || pvRaf) return; pvRaf = requestAnimationFrame(() => { pvRaf = 0; drawBrushPreview(); }); }
  function drawBrushPreview() {
    const cv = brushPreview; if (!cv) return;
    const id = pad.tool, def = { ...TOOLS[id], id }, o = { ...pad.opts[id] };
    const W = cv.width, H = cv.height;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    // scale sizes so huge brushes still fit the preview
    const k = Math.min(1, (H * 0.55) / Math.max(1, o.size));
    o.size *= k; if (o.dotSize) o.dotSize = Math.max(0.6, o.dotSize * Math.max(k, 0.5));
    const buf = makeCanvas(W, H), mask = makeCanvas(W, H), tmp = makeCanvas(W, H);
    const ink = def.erase ? '#000000' : pad.color;
    const st = new Stroke({ def, opts: o, color: ink, ctx: buf.getContext('2d'), maskCtx: mask.getContext('2d'), tmpCtx: tmp.getContext('2d'), transforms: [[1, 0, 0, 1, 0, 0]], w: W, h: H, hasPressure: true, seed: 7 });
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = 24 + t * (W - 48), y = H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22;
      st.add(x, y, Math.sin(t * Math.PI) * 0.9 + 0.1, i * 16);
    }
    st.finish();
    if (def.erase) {
      g.fillStyle = pad.color; g.globalAlpha = 0.9; g.fillRect(0, H * 0.3, W, H * 0.4); g.globalAlpha = 1;
      g.globalCompositeOperation = 'destination-out';
    }
    g.globalAlpha = o.opacity ?? 1;
    g.drawImage(buf, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const light = isLight(pad.color);
    cv.classList.toggle('sp-preview-dark', light);
  }
  function isLight(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 200; }

  // ---------------------------------------------------------- layers list
  function buildLayers() {
    layerList.textContent = '';
    const list = [...pad.layers].reverse();
    for (const l of list) {
      const thumb = h('canvas', { class: 'sp-thumb', width: 44, height: 44 });
      l._thumb = thumb; l.dirtyThumb = true;
      const name = h('span', { class: 'sp-lname', title: 'Double-click to rename' }, l.name);
      const eye = ibtn(l.visible ? 'eye' : 'eyeOff', l.visible ? 'Hide layer' : 'Show layer', (e) => { e.stopPropagation(); pad.setLayerProp(l, 'visible', !l.visible); }, 'sp-ibtn-sm' + (l.visible ? '' : ' off'));
      const lock = ibtn(l.locked ? 'lock' : 'unlock', l.locked ? 'Unlock layer' : 'Lock layer', (e) => { e.stopPropagation(); pad.setLayerProp(l, 'locked', !l.locked); }, 'sp-ibtn-sm' + (l.locked ? ' on' : ' faint'));
      const grip = h('span', { class: 'sp-grip', html: icon('grip'), title: 'Drag to reorder', 'aria-hidden': 'true' });
      const li = h('li', { class: 'sp-layer' + (l === pad.active ? ' active' : '') + (l.ref ? ' ref' : '') + (l.visible ? '' : ' hidden-layer'), tabindex: '0', 'aria-label': l.name, 'aria-selected': l === pad.active },
        grip, thumb, h('div', { class: 'sp-lmeta' }, name, l.ref ? h('span', { class: 'sp-tag' }, 'Trace ref') : h('span', { class: 'sp-lsub' }, Math.round(l.opacity * 100) + '%')), lock, eye);
      li.addEventListener('click', () => pad.selectLayer(l));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pad.selectLayer(l); } });
      name.addEventListener('dblclick', (e) => { e.stopPropagation(); rename(l, name); });
      li.addEventListener('contextmenu', (e) => { e.preventDefault(); rename(l, name); });
      grip.addEventListener('pointerdown', (e) => startReorder(e, l, li));
      layerList.append(li);
    }
    const a = pad.active;
    if (a) {
      layerOpacity.set(Math.round(a.opacity * 100));
      refExport.el.hidden = !a.ref; refExport.set(a.exportRef);
    }
    ui.syncThumbs(true);
  }
  function rename(l, nameEl) {
    const inp = h('input', { class: 'sp-rename', value: l.name, 'aria-label': 'Layer name' });
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; if (ok && inp.value.trim()) pad.setLayerProp(l, 'name', inp.value.trim().slice(0, 40)); else buildLayers(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
  }
  function startReorder(e, l, li) {
    e.preventDefault(); e.stopPropagation();
    const rows = [...layerList.children];
    const marker = h('div', { class: 'sp-dropline' });
    layerList.append(marker);
    li.classList.add('dragging');
    let target = null;
    const mv = (ev) => {
      const y = ev.clientY;
      const lr = layerList.getBoundingClientRect();
      let idx = rows.length;
      for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { idx = i; break; } }
      const ref = rows[idx] ? rows[idx].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
      marker.style.top = (ref - lr.top + layerList.scrollTop - 1) + 'px';
      target = idx;
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      marker.remove(); li.classList.remove('dragging');
      if (target == null) return;
      const from = rows.indexOf(li);
      let toRow = target > from ? target - 1 : target;
      const n = pad.layers.length;
      const toIndex = n - 1 - toRow;
      if (toRow !== from) pad.moveLayer(l, toIndex);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    mv(e);
  }

  // ---------------------------------------------------------- toast / modal
  let toastT = 0;
  ui.toast = (msg) => {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };
  let modalEl = null;
  ui.modal = ({ title, body, actions = [], wide = false, onClose }) => {
    ui.closeModal();
    const close = () => ui.closeModal();
    const foot = h('div', { class: 'sp-modal-foot' }, ...actions.map((a) => h('button', { type: 'button', class: 'sp-btn' + (a.primary ? ' sp-primary' : '') + (a.danger ? ' sp-danger' : ''), html: (a.icon ? icon(a.icon) : '') + `<span>${a.label}</span>`, onclick: () => { if (a.onClick?.() !== false) close(); } })));
    const card = h('div', { class: 'sp-modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sp-modal-head' }, h('h3', {}, title), ibtn('close', 'Close', close, 'sp-ibtn-sm')), body, actions.length ? foot : null);
    modalEl = h('div', { class: 'sp-modal-wrap', onpointerdown: (e) => { if (e.target === modalEl) close(); } }, card);
    modalEl._onClose = onClose;
    root.append(modalEl);
    ui.modalOpen = true;
    return close;
  };
  ui.closeModal = () => { if (!modalEl) return; const m = modalEl; modalEl = null; ui.modalOpen = false; m.remove(); m._onClose?.(); };
  function confirmModal(title, text, okLabel, fn) {
    ui.modal({ title, body: h('p', { class: 'sp-modal-text' }, text), actions: [{ label: 'Cancel' }, { label: okLabel, danger: true, onClick: fn }] });
  }

  ui.importChooser = (d) => {
    const prev = makeCanvas(Math.max(1, Math.round(d.w * Math.min(1, 220 / Math.max(d.w, d.h)))), Math.max(1, Math.round(d.h * Math.min(1, 220 / Math.max(d.w, d.h)))));
    prev.getContext('2d').drawImage(d.source, 0, 0, prev.width, prev.height);
    prev.className = 'sp-import-prev';
    const opt = (ic, title, sub, fn) => h('button', { type: 'button', class: 'sp-choice', onclick: () => { ui.closeModal(); fn(); } }, h('span', { class: 'sp-choice-ic', html: icon(ic) }), h('span', {}, h('b', {}, title), h('small', {}, sub)));
    ui.modal({
      title: 'Import image',
      body: h('div', { class: 'sp-import' }, h('div', { class: 'sp-import-pv' }, prev),
        h('div', { class: 'sp-choices' },
          opt('layers', 'Add as new layer', 'Fitted and centered on the canvas', () => pad.loadImage(d, { name: 'Imported' })),
          opt('image', 'Use as trace reference', 'Shown faded under your ink — never exported', () => pad.loadImage(d, { asReference: true, fit: 1 })),
          opt('stencil', 'Photo → stencil…', 'Turn a photo into clean tattoo linework', () => ui.stencilDialog(d)))),
    });
  };

  function startStencil() {
    const ref = pad.layers.find((l) => l.ref);
    if (ref) {
      const opt = (ic, title, sub, fn) => h('button', { type: 'button', class: 'sp-choice', onclick: () => { ui.closeModal(); fn(); } }, h('span', { class: 'sp-choice-ic', html: icon(ic) }), h('span', {}, h('b', {}, title), h('small', {}, sub)));
      ui.modal({
        title: 'Photo → stencil',
        body: h('div', { class: 'sp-choices' },
          opt('image', 'Use the trace reference', ref.name, () => ui.stencilDialog({ source: ref.canvas, w: pad.w, h: pad.h, fromRef: true })),
          opt('importImg', 'Choose a photo…', 'From your device', () => pickFile('stencil'))),
      });
    } else pickFile('stencil');
  }
  ui.startStencil = startStencil;

  let lastStencil = { ...STENCIL_DEFAULTS };
  ui.stencilDialog = (d) => {
    const P = { ...lastStencil, color: lastStencil.inkMode === 'current' ? pad.color : '#000000' };
    let keepRef = !d.fromRef;
    // fitted output size in document pixels
    const fit = d.fromRef ? 1 : 0.9;
    const k = Math.min((pad.w * fit) / d.w, (pad.h * fit) / d.h);
    const fw = Math.max(8, Math.round(d.w * k)), fh = Math.max(8, Math.round(d.h * k));
    const pk = Math.min(1, 440 / Math.max(fw, fh));
    const pw = Math.round(fw * pk), ph = Math.round(fh * pk);
    const srcPrev = makeCanvas(pw, ph); { const g = srcPrev.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(d.source, 0, 0, pw, ph); }
    const pv = h('canvas', { class: 'sp-stencil-pv', width: pw, height: ph });
    let showPhoto = false;
    const busy = h('div', { class: 'sp-busy' }, 'Processing…');
    const render = () => {
      const out = photoToStencil(srcPrev, pw, ph, { ...P, weight: P.weight }, pk);
      const g = pv.getContext('2d');
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.fillRect(0, 0, pw, ph);
      if (showPhoto) { g.globalAlpha = 0.35; g.drawImage(srcPrev, 0, 0); g.globalAlpha = 1; }
      g.drawImage(out, 0, 0);
    };
    let tmr = 0;
    const schedule = () => { clearTimeout(tmr); tmr = setTimeout(render, 40); };
    const thrLabel = () => (P.mode === 'edges' ? 'Sensitivity' : P.mode === 'threshold' ? 'Darkness' : 'Ink level');
    const thr = slider({ label: thrLabel(), min: 0, max: 100, value: P.threshold, onInput: (v) => { P.threshold = v; schedule(); } });
    const detail = slider({ label: 'Detail', min: 0, max: 100, value: P.detail, onInput: (v) => { P.detail = v; schedule(); } });
    const weight = slider({ label: 'Line weight', min: 1, max: 12, step: 0.5, value: P.weight, unit: 'px', onInput: (v) => { P.weight = v; schedule(); } });
    const shadows = slider({ label: 'Shadow fill', min: 0, max: 100, value: P.shadows, unit: '%', onInput: (v) => { P.shadows = v; schedule(); } });
    const cleanup = slider({ label: 'Clean up specks', min: 0, max: 100, value: P.cleanup, unit: '%', onInput: (v) => { P.cleanup = v; schedule(); } });
    const sync = () => { thr.el.querySelector('.sp-lbl').textContent = thrLabel(); detail.el.hidden = P.mode === 'scan'; shadows.el.hidden = P.mode === 'scan'; weight.el.hidden = P.mode === 'scan'; };
    const modeSeg = seg({ label: 'Method', value: P.mode, onChange: (v) => { P.mode = v; sync(); schedule(); }, options: [{ value: 'edges', label: 'Outlines' }, { value: 'threshold', label: 'Bold ink' }, { value: 'scan', label: 'Line-art scan' }] });
    const inkSeg = seg({ label: 'Ink', value: lastStencil.inkMode || 'black', onChange: (v) => { P.inkMode = v; P.color = v === 'current' ? pad.color : '#000000'; schedule(); }, options: [{ value: 'black', label: 'Black ink' }, { value: 'current', label: 'Current colour' }] });
    const photoT = toggle({ label: 'Show photo under preview', value: false, onChange: (v) => { showPhoto = v; schedule(); } });
    const refT = toggle({ label: 'Keep photo as trace reference', value: keepRef, onChange: (v) => { keepRef = v; } });
    if (d.fromRef) refT.el.hidden = true;
    sync();
    const body = h('div', { class: 'sp-stencil' },
      h('div', { class: 'sp-stencil-view' }, pv),
      h('div', { class: 'sp-stencil-ctrls' }, h('div', { class: 'sp-sublbl' }, 'Method'), modeSeg.el, thr.el, detail.el, weight.el, shadows.el, cleanup.el, inkSeg.el, photoT.el, refT.el));
    ui.modal({
      title: 'Photo → stencil', wide: true, body,
      onClose: () => clearTimeout(tmr),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Create stencil layer', primary: true, icon: 'stencil', onClick: () => {
            lastStencil = { ...P };
            body.append(busy);
            setTimeout(async () => {
              try {
                const out = photoToStencil(d.source, fw, fh, P, 1);
                if (keepRef && !d.fromRef) await pad.loadImage(d, { asReference: true, name: 'Reference photo', fit });
                pad._addCanvasLayer(out, 'Stencil', { x: Math.round((pad.w - fw) / 2), y: Math.round((pad.h - fh) / 2), w: fw, h: fh });
                ui.toast('Stencil layer created');
              } catch (e) { console.error(e); ui.toast('Stencil conversion failed'); }
              ui.closeModal();
            }, 30);
            return false;
          },
        },
      ],
    });
    render();
  };

  // ---------------------------------------------------------- text editor / transform bar
  ui.showTextEditor = () => {
    textArea.value = ''; textEd.hidden = false;
    textArea.focus({ preventScroll: true });
    setTimeout(() => { if (pad._text && document.activeElement !== textArea) textArea.focus({ preventScroll: true }); }, 0);
  };
  ui.hideTextEditor = () => { textEd.hidden = true; textArea.blur(); };
  ui.positionTextEditor = () => {};
  ui.syncXf = () => {
    const show = pad.tool === 'move';
    xfBar.hidden = !show;
    xfBar.querySelector('.sp-xf-apply').disabled = !pad.xf;
    xfBar.querySelector('.sp-xf-cancel').disabled = !pad.xf;
  };
  ui.setPanCursor = (on) => { stage.classList.toggle('sp-panning', on); };
  ui.setStageCursor = (c) => { canvas.style.cursor = c || ''; };

  // ---------------------------------------------------------- sync
  ui.syncTool = () => {
    for (const [id, bs] of Object.entries(toolBtns)) bs.forEach((b) => { b.classList.toggle('on', id === pad.tool); b.setAttribute('aria-pressed', id === pad.tool); });
    const kind = TOOLS[pad.tool].kind;
    root.dataset.tool = pad.tool; root.dataset.kind = kind;
    canvas.style.cursor = '';
    buildToolOptions();
    ui.syncXf();
    const active = (toolBtns[pad.tool] || [])[1];
    if (ui.compact && active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };
  ui.syncColor = () => {
    const c = pad.color;
    curChip.style.background = c; railChip.style.background = c; dockChip.style.background = c;
    if (document.activeElement !== hexIn) hexIn.value = c;
    if (!selfColor) { const n = hexToHsv(c); if (n.s > 0 && n.v > 0) hsv = n; else hsv = { h: hsv.h, s: n.s, v: n.v }; drawSV(); }
    swatches.querySelectorAll('.sp-sw').forEach((b, i) => b.classList.toggle('on', INK_SWATCHES[i].c === c));
    recentEl.textContent = '';
    pad.recent.forEach((rc) => recentEl.append(h('button', { type: 'button', class: 'sp-sw' + (rc === c ? ' on' : ''), title: rc, 'aria-label': 'Recent ' + rc, style: { background: rc }, onclick: () => pad.setColor(rc) })));
    recentEl.hidden = !pad.recent.length; colorBody.querySelector('.sp-recent-lbl').hidden = !pad.recent.length;
    refreshPreview();
  };
  ui.syncSym = () => {
    symSeg.set(pad.sym.mode);
    const radial = pad.sym.mode === 'radial' || pad.sym.mode === 'kaleido';
    radialS.el.hidden = !radial; radialS.set(pad.sym.n);
    symShow.el.hidden = pad.sym.mode === 'off'; symShow.set(pad.sym.show);
    symLabel.textContent = { off: 'No symmetry', vertical: 'Mirror left ↔ right', horizontal: 'Mirror top ↔ bottom', quad: 'Four-way mirror', radial: `Radial · ${pad.sym.n} segments`, kaleido: `Kaleidoscope · ${pad.sym.n}× mirrored` }[pad.sym.mode];
    gGrid.set(pad.guides.grid); gSize.set(pad.guides.gridSize); gSize.el.hidden = !pad.guides.grid;
    gCenter.set(pad.guides.center); gRings.set(pad.guides.rings); gRingN.set(pad.guides.ringCount); gRingN.el.hidden = !pad.guides.rings;
    gSnap.set(pad.guides.snap);
    symQuick.innerHTML = icon(pad.sym.mode === 'off' ? 'symOff' : { vertical: 'symV', horizontal: 'symH', quad: 'symQuad', radial: 'symRadial', kaleido: 'symKaleido' }[pad.sym.mode]);
    symQuick.classList.toggle('active', pad.sym.mode !== 'off');
  };
  ui.syncBg = () => { bgSeg.set(pad.bg.mode); skinRow.hidden = pad.bg.mode !== 'skin'; skinRow.querySelectorAll('.sp-sw').forEach((b, i) => b.classList.toggle('on', SKIN_TONES[i] === pad.bg.skin)); };
  ui.syncLayers = buildLayers;
  ui.syncThumbs = (all) => {
    for (const l of pad.layers) {
      if (!l._thumb || (!l.dirtyThumb && !all)) continue;
      l.dirtyThumb = false;
      const t = l._thumb, g = t.getContext('2d');
      g.clearRect(0, 0, t.width, t.height);
      const k = Math.min(t.width / pad.w, t.height / pad.h);
      const w = pad.w * k, hh = pad.h * k;
      g.imageSmoothingQuality = 'high';
      g.drawImage(l.canvas, (t.width - w) / 2, (t.height - hh) / 2, w, hh);
    }
  };
  ui.syncHistory = () => { undoB.disabled = !pad.canUndo; redoB.disabled = !pad.canRedo; };
  ui.syncZoom = () => {
    const rot = Math.round(pad.view.rot * 180 / Math.PI);
    zoomLbl.textContent = Math.round(pad.view.zoom * 100) + '%' + (rot ? ` · ${rot}°` : '');
  };
  ui.syncDoc = () => {
    const cur = currentPreset();
    presetSeg.set(cur || '');
    if (cur) {
      const p = PRESETS.find((x) => x.id === cur);
      const m = Math.max(pad.w, pad.h) / Math.max(p.w, p.h);
      resSeg.set(String(Math.round(m * 2) / 2));
    } else resSeg.set('');
    docDims.textContent = `${pad.w} × ${pad.h} px · transparent PNG`;
  };
  ui.syncAll = () => { ui.syncTool(); ui.syncColor(); ui.syncSym(); ui.syncBg(); ui.syncLayers(); ui.syncHistory(); ui.syncZoom(); ui.syncDoc(); };

  ui.destroy = () => {
    document.removeEventListener('pointerdown', outside, true);
    clearTimeout(toastT);
    root.remove();
  };
  void ensureFont;
  return ui;
}
