// Photo studio — step panels. Desktop: a right-hand panel with sections. Phone (≤700px): a bottom sheet with a
// scrolling chip row + a control row (iPad-Photos style), plus the output bar.
import { h, btn, ibtn, slider, seg, toggle, section, drawHistogram, curvesEditor, levelsEditor } from './widgets.js';
import { icon } from './icons.js';
import { ADJ, FILTERS, defaultAdjust } from './adjust.js';
import { LOOKS, defaultLook } from './looks.js';
import { REFINE_DEFAULTS } from './mask.js';

export const STEPS = [
  { id: 'cut', label: 'Cut out', short: 'Cut', icon: 'stepCut', title: 'Step 1 · Cut out what you want to keep' },
  { id: 'adjust', label: 'Adjust', short: 'Adjust', icon: 'stepAdjust', title: 'Step 2 · Light, colour and filters' },
  { id: 'look', label: 'Tattoo look', short: 'Look', icon: 'stepLook', title: 'Step 3 · Turn it into tattoo art' },
  { id: 'crop', label: 'Crop', short: 'Crop', icon: 'stepCrop', title: 'Step 4 · Crop, rotate, straighten' },
];

const TOOLS = [
  { id: 'smart', label: 'Smart select', short: 'Smart', icon: 'smart', tip: 'Drag a box or loop around the subject — it finds the real edges (S)' },
  { id: 'lasso', label: 'Lasso', short: 'Lasso', icon: 'lasso', tip: 'Draw freehand around the outline (L)' },
  { id: 'polygon', label: 'Polygon', short: 'Polygon', icon: 'polygon', tip: 'Tap corner points to make straight edges (P)' },
  { id: 'magnetic', label: 'Magnetic', short: 'Magnetic', icon: 'magnetic', tip: 'Trace an outline that snaps to edges (M)' },
  { id: 'wand', label: 'Magic wand', short: 'Wand', icon: 'wand', tip: 'Tap a colour area (W)' },
  { id: 'brush:add', label: 'Keep brush', short: 'Keep', icon: 'brush', tip: 'Paint what you want to keep (B)' },
  { id: 'brush:sub', label: 'Erase brush', short: 'Erase', icon: 'eraser', tip: 'Paint away what you don’t want (E)' },
  { id: 'bg', label: 'Background', short: 'Background', icon: 'background', tip: 'Remove a plain background — paper, wall, sky' },
];

const VIEW_MODES = [
  { v: 'overlay', label: 'Overlay', icon: 'vOverlay', title: 'Dim what is cut away' },
  { v: 'checker', label: 'Cut-out', icon: 'vChecker', title: 'Show only what you keep' },
  { v: 'skin', label: 'On skin', icon: 'vSkin', title: 'Preview on skin' },
  { v: 'mask', label: 'Mask', icon: 'vMask', title: 'Black & white mask' },
];

const INKS = [
  ['#151515', 'Black'], ['#3d2c8d', 'Stencil purple'], ['#5b5b5b', 'Grey wash'], ['#8b1e2d', 'Red'], ['#1f3f8f', 'Blue'], ['#1f6b3a', 'Green'], ['#5a3418', 'Brown'],
];

const phoneChip = (S, step, v) => { S._chip = S._chip || {}; if (v !== undefined) S._chip[step] = v; return S._chip[step]; };

export function buildPanel(S, step, phone) {
  S._histCb = null;
  if (!S.hasImage()) return h('div', { class: 'ps-pn empty' });
  const body = { cut: cutPanel, adjust: adjustPanel, look: lookPanel, crop: cropPanel }[step](S, phone);
  if (phone) return h('div', { class: 'ps-pn phone' }, body, outBar(S));
  const i = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[i + 1];
  const head = h('div', { class: 'ps-pn-head' },
    h('h3', {}, h('i', { text: String(i + 1) }), STEPS[i].label),
    ibtn('reset', 'Reset this step', () => S.resetStep(), 'ps-ibtn-sm'),
    next ? btn('next', next.label, () => S.setStep(next.id), 'ps-next', `Next: ${next.label}`) : null);
  return h('div', { class: 'ps-pn' }, head, h('div', { class: 'ps-scroll' }, body), outPanel(S));
}

/* ═══════════════ output ═══════════════ */

function nameInput(S) {
  const inp = h('input', { type: 'text', class: 'ps-name', value: S.name, maxlength: '60', 'aria-label': 'Design name', placeholder: 'Photo tattoo', spellcheck: 'false' });
  inp.addEventListener('input', () => { S.name = inp.value; });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
  S.el.nameInput = inp;
  return inp;
}

function outPanel(S) {
  const items = S.outputItems();
  return h('div', { class: 'ps-out' },
    h('label', { class: 'ps-name-row' }, h('span', { text: 'Name' }), nameInput(S)),
    S.opts.onUse ? btn('body', 'Put on body', () => S.output('onUse'), 'ps-primary', 'Place it on the 3D body') : null,
    h('div', { class: 'ps-out-grid' + (items.length === 4 ? ' four' : '') }, ...items.map((it) => btn(it.icon, it.label, it.run, 'ps-out-btn'))));
}

function outBar(S) {
  const modes = S.step === 'cut' ? VIEW_MODES : VIEW_MODES.slice(0, 3);
  const cur = modes.find((m) => m.v === S.displayMode) || modes[0];
  const vb = h('button', { type: 'button', class: 'ps-viewcycle', title: 'Background: ' + cur.label, 'aria-label': 'Change background (now ' + cur.label + ')', html: icon(cur.icon) + `<span>${cur.label}</span>` });
  vb.addEventListener('click', () => { const i = modes.indexOf(cur); S.setDisplayMode(modes[(i + 1) % modes.length].v); });
  const more = h('button', { type: 'button', class: 'ps-ibtn ps-outmore', title: 'Save, export and more', 'aria-label': 'Save, export and more', html: icon('save') });
  more.addEventListener('click', () => {
    const name = h('label', { class: 'ps-name-row' }, h('span', { text: 'Name' }), nameInput(S));
    S.sheet('Your tattoo', S.outputItems().map((it) => ({ icon: it.icon, label: it.label, run: it.run })), name);
  });
  return h('div', { class: 'ps-outbar' }, vb,
    S.opts.onUse ? btn('body', 'Put on body', () => S.output('onUse'), 'ps-primary') : h('span', { class: 'ps-grow' }),
    more);
}

/* ═══════════════ helpers ═══════════════ */

function chipRow(chips) {
  const row = h('div', { class: 'ps-chips', role: 'toolbar' });
  for (const c of chips) {
    const b = h('button', { type: 'button', class: 'ps-chip' + (c.on ? ' on' : '') + (c.accent ? ' accent' : '') + (c.changed ? ' changed' : ''), title: c.tip || c.label, 'aria-label': c.tip || c.label, 'aria-pressed': c.on ? 'true' : 'false' });
    if (c.thumb) b.append(c.thumb); else b.insertAdjacentHTML('beforeend', icon(c.icon));
    b.append(h('span', { text: c.label }));
    b.addEventListener('click', c.run);
    row.append(b);
  }
  requestAnimationFrame(() => { const on = row.querySelector('.ps-chip.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
  return row;
}
const ctlRow = (...kids) => h('div', { class: 'ps-ctl' }, ...kids);

function modeSeg(S) {
  return seg([{ v: 'add', label: 'Add', icon: 'plus', title: 'Add to what you keep (Shift)' }, { v: 'sub', label: 'Remove', icon: 'minus', title: 'Remove from what you keep (Alt)' }], S.mode, (v) => S.setMode(v), 'ps-mode').el;
}

/* ═══════════════ 1 · cut out ═══════════════ */

function toolOptions(S, phone) {
  const t = S.tool, out = [];
  const o = S.toolOpts;
  const C = phone;
  if (t === 'wand') {
    out.push(slider({ label: 'Tolerance', min: 0, max: 100, value: o.wand.tol, def: 32, compact: C, onInput: (v) => { o.wand.tol = v; } }).el);
    out.push(toggle('Contiguous', o.wand.contiguous, (v) => { o.wand.contiguous = v; }, 'Only connected pixels').el);
  } else if (t === 'brush') {
    out.push(slider({ label: 'Size', min: 4, max: 300, value: o.brush.size, def: 46, compact: C, fmt: (v) => v + ' px', onInput: (v) => { o.brush.size = v; S.requestDraw(); } }).el);
    out.push(slider({ label: 'Hardness', min: 0, max: 100, value: o.brush.hardness, def: 70, compact: C, onInput: (v) => { o.brush.hardness = v; } }).el);
    out.push(slider({ label: 'Opacity', min: 5, max: 100, value: o.brush.opacity, def: 100, compact: C, onInput: (v) => { o.brush.opacity = v; } }).el);
    out.push(toggle('Smart edges', o.brush.smart, (v) => { o.brush.smart = v; }, 'Edge-aware: the brush won’t cross strong edges').el);
  } else if (t === 'magnetic') {
    out.push(slider({ label: 'Snap width', min: 2, max: 30, value: o.magnetic.width, def: 10, compact: C, fmt: (v) => v + ' px', onInput: (v) => { o.magnetic.width = v; } }).el);
  } else if (t === 'bg') {
    out.push(slider({
      label: 'Tolerance', min: 0, max: 100, value: o.bg.tol, def: 40, compact: C,
      onInput: (v) => { o.bg.tol = v; },
      onCommit: (v) => { o.bg.tol = v; S.removeBg({ fresh: !S.bgSession }); },
    }).el);
    out.push(toggle('Only around the edges', o.bg.contiguous, (v) => { o.bg.contiguous = v; S.removeBg({ fresh: !S.bgSession }); }, 'Keep background-coloured areas inside the subject').el);
    out.push(btn('background', S.bgSession ? 'Re-detect' : 'Remove background', () => S.removeBg({ fresh: true }), 'ps-accent-o'));
  } else if (t === 'smart' && !phone) {
    out.push(h('p', { class: 'ps-tip', html: 'Drag a <b>box</b> or a rough <b>loop</b> around the subject — it snaps to the real edges. Tap the photo to find the subject automatically.' }));
  } else if (t === 'polygon' && !phone) {
    out.push(h('p', { class: 'ps-tip', html: 'Tap points around the shape. Tap the first point, double-tap or press <b>Enter</b> to close. <b>Backspace</b> removes the last point.' }));
  } else if (t === 'lasso' && !phone) {
    out.push(h('p', { class: 'ps-tip', html: 'Draw around the outline — the shape closes when you let go. Hold <b>Shift</b> to add, <b>Alt</b> to remove.' }));
  } else if (t === 'magnetic' && !phone) {
    out.push(h('p', { class: 'ps-tip', text: 'Trace slowly along the edge.' }));
  }
  return out;
}

function refineControls(S, compact) {
  const r = S.st.refine;
  const sl = (key, label, min, max, fmt) => slider({
    label, min, max, value: r[key], def: REFINE_DEFAULTS[key], compact, fmt,
    onStart: () => S.dragStart(),
    onInput: (v) => S.edit((st) => { st.refine[key] = v; }, { commit: false, live: true }),
    onCommit: (v) => S.edit((st) => { st.refine[key] = v; }, { label: label }),
  }).el;
  return [
    sl('feather', 'Feather', 0, 100, (v) => (v ? (v / 100 * 24).toFixed(1) + ' px' : '0')),
    sl('smooth', 'Smooth', 0, 100),
    sl('shift', 'Expand / Contract', -100, 100, (v) => (v > 0 ? '+' : '') + (v / 100 * 25).toFixed(1) + ' px'),
    sl('specks', 'Remove specks', 0, 100),
    sl('holes', 'Fill holes', 0, 100),
  ];
}
function maskButtons(S) {
  return [
    btn('snap', 'Snap to edges', () => S.snapEdges(), '', 'Make the selection edge follow the real edges in the photo'),
    btn('invert', 'Invert', () => S.maskAction('invert'), '', 'Swap kept and cut-away'),
    btn('selectAll', 'Keep all', () => S.maskAction('all'), '', 'Keep the whole photo'),
    btn('clear', 'Clear', () => S.maskAction('clear'), '', 'Cut away everything and start the selection again'),
  ];
}

function cutPanel(S, phone) {
  const toolOn = (t) => (t.id === 'brush:add' ? S.tool === 'brush' && S.mode !== 'sub' : t.id === 'brush:sub' ? S.tool === 'brush' && S.mode === 'sub' : S.tool === t.id);
  const pick = (t) => {
    if (S.tool === 'bg' && t.id !== 'bg') S.endBgSession();
    if (t.id.startsWith('brush')) { S.mode = t.id.endsWith('sub') ? 'sub' : 'add'; S.setTool('brush'); }
    else { if (S.tool === 'brush') S.mode = 'add'; S.setTool(t.id); if (t.id === 'bg' && !S.bgSession) S.removeBg({ fresh: true }); }
  };
  const showMode = !['brush', 'bg'].includes(S.tool);
  if (phone) {
    const chip = phoneChip(S, 'cut') || 'tool';
    const chips = [
      { label: 'Subject', icon: 'subject', accent: true, tip: 'Select the main subject automatically', run: () => S.selectSubject('add') },
      ...TOOLS.map((t) => ({ label: t.short, icon: t.icon, tip: t.tip, on: chip === 'tool' && toolOn(t), run: () => { phoneChip(S, 'cut', 'tool'); pick(t); } })),
      { label: 'Refine', icon: 'refine', on: chip === 'refine', tip: 'Feather, smooth, expand…', run: () => { phoneChip(S, 'cut', 'refine'); S._rebuildPanel(); } },
    ];
    let ctl;
    if (chip === 'refine') ctl = ctlRow(...refineControls(S, true), ...maskButtons(S));
    else ctl = ctlRow(showMode ? modeSeg(S) : null, ...toolOptions(S, true));
    if (!ctl.childElementCount) ctl.append(h('span', { class: 'ps-tip', text: 'Tip: pinch to zoom, two fingers to move.' }));
    return [chipRow(chips), ctl];
  }
  const info = S.rt.touched ? S.maskInfo() : null;
  const pct = info ? Math.round(info.coverage * 100) : 100;
  const quick = h('div', { class: 'ps-quick' },
    btn('subject', 'Select subject', () => S.selectSubject('add'), 'ps-accent ps-big', 'Find the main subject automatically'),
    btn('background', 'Remove background', () => { S.mode = 'add'; S.setTool('bg'); S.removeBg({ fresh: true }); }, 'ps-big', 'Remove a plain background (paper, wall) — great for photographed drawings'));
  const grid = h('div', { class: 'ps-toolgrid' }, ...TOOLS.map((t) => {
    const b = h('button', { type: 'button', class: 'ps-tool' + (toolOn(t) ? ' on' : ''), title: t.tip, 'aria-label': t.label, 'aria-pressed': String(toolOn(t)), html: icon(t.icon) + `<span>${t.short}</span>` });
    b.addEventListener('click', () => pick(t));
    return b;
  }));
  const opts = toolOptions(S, false);
  return [
    quick,
    section('Tools', [grid, showMode ? h('div', { class: 'ps-row ps-mode-row' }, modeSeg(S), h('span', { class: 'ps-kbd', text: 'Shift adds · Alt removes' })) : null, ...opts].filter(Boolean)),
    section('Refine edge', [...refineControls(S, false), h('div', { class: 'ps-btnrow' }, ...maskButtons(S))], { right: h('span', { class: 'ps-badge', title: 'How much of the photo you keep', text: pct + '% kept' }) }),
    section('Show', seg(VIEW_MODES, S.viewMode.cut, (v) => S.setDisplayMode(v), 'ps-seg-icons').el),
  ];
}

/* ═══════════════ 2 · adjust ═══════════════ */

function adjSlider(S, a, compact) {
  return slider({
    label: a.label, min: a.min, max: a.max, value: S.st.adjust[a.id] || 0, def: 0, icon: compact ? null : a.id, compact,
    onStart: () => S.dragStart(),
    onInput: (v) => S.edit((st) => { st.adjust[a.id] = v; }, { commit: false, live: true }),
    onCommit: (v) => S.edit((st) => { st.adjust[a.id] = v; }, { label: a.label }),
  }).el;
}

function filterThumbs(S) {
  const wrap = h('div', { class: 'ps-thumbs' });
  const items = [];
  for (const f of FILTERS) {
    const cv = h('canvas', { width: 72, height: 72 });
    const b = h('button', { type: 'button', class: 'ps-thumb' + (S.st.adjust.filter === f.id ? ' on' : ''), title: f.label, 'aria-label': `Filter: ${f.label}` }, cv, h('span', { text: f.label }));
    b.addEventListener('click', () => { S.edit((st) => { st.adjust.filter = f.id; if (!st.adjust.filterAmount) st.adjust.filterAmount = 100; }, { label: 'Filter ' + f.label }); S._rebuildPanel(); });
    wrap.append(b);
    items.push([cv, f]);
  }
  lazy(S, items.map(([cv, f]) => () => S.renderThumb(cv, { adjust: { ...S.st.adjust, filter: f.id, filterAmount: 100 }, size: 72 })));
  return wrap;
}

/** Run thumbnail renders a few at a time without blocking the UI. */
function lazy(S, jobs) {
  const token = (S._lazyTok = (S._lazyTok || 0) + 1);
  let i = 0;
  const run = () => {
    if (token !== S._lazyTok || !S.hasImage()) return;
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 12) { try { jobs[i](); } catch (e) { console.warn(e); } i++; }
    if (i < jobs.length) setTimeout(run, 16);
  };
  run();
}

function filterAmount(S, compact) {
  if (S.st.adjust.filter === 'original') return null;
  return slider({
    label: 'Filter strength', min: 0, max: 100, value: S.st.adjust.filterAmount, def: 100, compact,
    onStart: () => S.dragStart(),
    onInput: (v) => S.edit((st) => { st.adjust.filterAmount = v; }, { commit: false, live: true }),
    onCommit: (v) => S.edit((st) => { st.adjust.filterAmount = v; }, { label: 'Filter strength' }),
  }).el;
}

function histCanvas(S) {
  const cv = h('canvas', { class: 'ps-hist', 'aria-label': 'Histogram' });
  S._histCb = () => { if (cv.isConnected) drawHistogram(cv, S.histogram()); };
  requestAnimationFrame(() => S._histCb && S._histCb());
  return cv;
}

function curvesBox(S) {
  return curvesEditor({
    curves: S.st.adjust.curves,
    getHist: () => S.histogram(),
    onInput: (c) => { S.dragStart(); S.edit((st) => { st.adjust.curves = JSON.parse(JSON.stringify(c)); }, { commit: false, live: true }); },
    onCommit: (c) => S.edit((st) => { st.adjust.curves = JSON.parse(JSON.stringify(c)); }, { label: 'Curves' }),
  }).el;
}
function levelsBox(S) {
  return levelsEditor({
    levels: S.st.adjust.levels,
    getHist: () => S.histogram(),
    onInput: (l) => { S.dragStart(); S.edit((st) => { st.adjust.levels = { ...l }; }, { commit: false, live: true }); },
    onCommit: (l) => S.edit((st) => { st.adjust.levels = { ...l }; }, { label: 'Levels' }),
  }).el;
}

function adjustPanel(S, phone) {
  const autoOn = S.autoOn;
  const onlySel = S.rt.touched ? toggle('Measure kept area only', S.st.onlySel, (v) => { S.edit((st) => { st.onlySel = v; }, { label: 'Selection only' }); }, 'Auto and the histogram look only at what you keep; the cut-away part shows the original').el : null;
  if (phone) {
    const chip = phoneChip(S, 'adjust') || 'exposure';
    const chips = [
      { label: 'Auto', icon: 'auto', accent: true, on: autoOn, tip: 'Automatic enhance', run: () => S.auto() },
      { label: 'Filters', icon: 'filters', on: chip === 'filters', changed: S.st.adjust.filter !== 'original', run: () => { phoneChip(S, 'adjust', 'filters'); S._rebuildPanel(); } },
      ...ADJ.map((a) => ({ label: a.label, icon: a.id, on: chip === a.id, changed: !!S.st.adjust[a.id], run: () => { phoneChip(S, 'adjust', a.id); S._rebuildPanel(); } })),
      { label: 'Curves', icon: 'curves', on: chip === 'curves', run: () => { phoneChip(S, 'adjust', 'curves'); S._rebuildPanel(); } },
      { label: 'Levels', icon: 'levels', on: chip === 'levels', run: () => { phoneChip(S, 'adjust', 'levels'); S._rebuildPanel(); } },
      { label: 'Reset', icon: 'reset', run: () => S.resetStep() },
    ];
    let ctl;
    if (chip === 'filters') ctl = h('div', { class: 'ps-ctl col' }, filterThumbs(S), filterAmount(S, true));
    else if (chip === 'curves') ctl = h('div', { class: 'ps-ctl col' }, curvesBox(S));
    else if (chip === 'levels') ctl = h('div', { class: 'ps-ctl col' }, levelsBox(S));
    else { const a = ADJ.find((x) => x.id === chip) || ADJ[0]; ctl = h('div', { class: 'ps-ctl col' }, adjSlider(S, a, false)); }
    return [chipRow(chips), ctl];
  }
  const groups = {};
  for (const a of ADJ) (groups[a.group] = groups[a.group] || []).push(a);
  const autoB = btn('auto', autoOn ? 'Auto is on' : 'Auto', () => S.auto(), 'ps-big ' + (autoOn ? 'ps-accent' : 'ps-accent-o'), 'Automatic enhance from the histogram (tap again to undo)');
  return [
    h('div', { class: 'ps-adjhead' }, autoB, histCanvas(S), onlySel),
    section('Filters', [filterThumbs(S), filterAmount(S, false)]),
    ...Object.entries(groups).map(([g, list]) => section(g, list.map((a) => adjSlider(S, a, false)))),
    section('Curves', curvesBox(S), { open: false }),
    section('Levels', levelsBox(S), { open: false }),
  ];
}

/* ═══════════════ 3 · tattoo look ═══════════════ */

function lookControls(S, compact) {
  const L = S.st.look;
  const def = LOOKS.find((x) => x.id === L.id) || LOOKS[0];
  const out = [];
  const mk = (key, label, min, max, dv) => slider({
    label, min, max, value: L[key] ?? dv, def: dv, compact,
    onStart: () => S.dragStart(),
    onInput: (v) => S.edit((st) => { st.look[key] = v; }, { commit: false, live: true }),
    onCommit: (v) => S.edit((st) => { st.look[key] = v; }, { label: label }),
  }).el;
  if (L.id !== 'photo') out.push(mk('strength', 'Strength', 0, 100, 100));
  for (const c of def.controls) out.push(mk(c[0], c[1], c[2], c[3], c[4]));
  if (def.ink) {
    const sw = h('div', { class: 'ps-swatches', role: 'radiogroup', 'aria-label': 'Ink colour' });
    for (const [hex, name] of INKS) {
      const b = h('button', { type: 'button', class: 'ps-sw' + (L.ink === hex ? ' on' : ''), title: name, 'aria-label': `Ink: ${name}`, style: { background: hex } });
      b.addEventListener('click', () => { S.edit((st) => { st.look.ink = hex; }, { label: 'Ink colour' }); S._rebuildPanel(); });
      sw.append(b);
    }
    const custom = h('input', { type: 'color', value: L.ink || '#151515', title: 'Any colour', 'aria-label': 'Custom ink colour' });
    custom.addEventListener('input', () => S.edit((st) => { st.look.ink = custom.value; }, { commit: false }));
    custom.addEventListener('change', () => S.edit((st) => { st.look.ink = custom.value; }, { label: 'Ink colour' }));
    sw.append(h('label', { class: 'ps-sw custom', title: 'Any colour' }, custom));
    out.push(h('div', { class: 'ps-inkrow' }, h('span', { class: 'ps-sublbl', text: 'Ink' }), sw));
  }
  return out;
}

function lookCards(S, phone) {
  const items = [];
  const cards = LOOKS.map((L) => {
    const cv = h('canvas', { width: 80, height: 80 });
    items.push([cv, L]);
    const on = S.st.look.id === L.id;
    return { L, cv, on };
  });
  lazy(S, items.map(([cv, L]) => () => S.renderThumb(cv, { look: { ...defaultLook(L.id), ink: (LOOKS.find((x) => x.id === L.id).ink && S.st.look.ink && S.st.look.id !== 'photo' && L.id !== 'stencil') ? S.st.look.ink : defaultLook(L.id).ink }, size: 80 })));
  const choose = (L) => {
    if (S.st.look.id === L.id) return;
    const prev = S.st.look;
    S.edit((st) => { st.look = defaultLook(L.id); if (prev.ink && st.look.ink && L.id !== 'stencil' && prev.id !== 'stencil') st.look.ink = prev.ink; }, { label: L.label });
    S._rebuildPanel();
  };
  if (phone) return cards.map(({ L, cv, on }) => ({ label: L.label, thumb: cv, on, tip: L.desc, run: () => choose(L) }));
  return h('div', { class: 'ps-lookgrid' }, ...cards.map(({ L, cv, on }) => {
    const b = h('button', { type: 'button', class: 'ps-look' + (on ? ' on' : ''), title: L.desc, 'aria-label': `${L.label}: ${L.desc}`, 'aria-pressed': String(on) }, cv, h('span', { text: L.label }));
    b.addEventListener('click', () => choose(L));
    return b;
  }));
}

function lookPanel(S, phone) {
  if (phone) return [chipRowThumbs(S), ctlRow(...lookControls(S, true))];
  const L = LOOKS.find((x) => x.id === S.st.look.id) || LOOKS[0];
  return [
    lookCards(S, false),
    section(L.label, [h('p', { class: 'ps-tip', text: L.desc + (L.id === 'photo' ? '' : ' — white areas become bare skin.') }), ...lookControls(S, false)]),
  ];
}
function chipRowThumbs(S) {
  const row = chipRow(lookCards(S, true));
  row.classList.add('thumbs');
  return row;
}

/* ═══════════════ 4 · crop ═══════════════ */

const ASPECTS = [
  ['free', 'Free'], ['original', 'Original'], ['square', 'Square'], ['4:5', '4:5'], ['3:4', '3:4'], ['2:3', '2:3'], ['16:9', '16:9'], ['band', '4:1 band'],
];

function cropPanel(S, phone) {
  const g = S.st.geom;
  const straight = slider({
    label: 'Straighten', min: -45, max: 45, step: 0.5, value: g.angle, def: 0, icon: phone ? null : 'straighten', compact: phone,
    fmt: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + '°',
    onStart: () => { S.gesture = { tool: 'straighten' }; },
    onInput: (v) => S.straighten(v),
    onCommit: (v) => { S.gesture = null; S.straighten(v, true); },
  }).el;
  const actions = [
    btn('rotate', 'Rotate', () => S.rotate90(-1), '', 'Rotate 90° left'),
    btn('flipH', 'Flip', () => S.flip('h'), '', 'Flip horizontal'),
    btn('flipV', 'Flip ↕', () => S.flip('v'), '', 'Flip vertical'),
    btn('trim', 'Trim to subject', () => S.autoTrim(), 'ps-accent-o', 'Crop tightly around what you keep'),
  ];
  if (phone) {
    const chips = ASPECTS.map(([id, label]) => ({ label, icon: 'aspect', on: g.aspect === id, run: () => { S.setAspect(id); S._rebuildPanel(); } }));
    return [chipRow(chips), ctlRow(straight, ...actions)];
  }
  const asp = h('div', { class: 'ps-aspects' }, ...ASPECTS.map(([id, label]) => {
    const b = h('button', { type: 'button', class: 'ps-pill' + (g.aspect === id ? ' on' : ''), text: label, 'aria-pressed': String(g.aspect === id) });
    b.addEventListener('click', () => { S.setAspect(id); S._rebuildPanel(); });
    return b;
  }));
  return [
    section('Aspect ratio', asp),
    section('Rotate & flip', [h('div', { class: 'ps-btnrow' }, btn('rotate', 'Rotate left', () => S.rotate90(-1)), btn('rotateR', 'Rotate right', () => S.rotate90(1))), h('div', { class: 'ps-btnrow' }, btn('flipH', 'Flip horizontal', () => S.flip('h')), btn('flipV', 'Flip vertical', () => S.flip('v'))), straight]),
    section('Trim', [btn('trim', 'Trim to subject', () => S.autoTrim(), 'ps-accent-o ps-big', 'Crop tightly around what you keep'), h('p', { class: 'ps-tip', text: 'The result is always trimmed to what you keep — cropping just frames it.' })]),
  ];
}

export { defaultAdjust };
