// Photo studio — small UI widgets (DOM). Everything is scoped by the .photostudio CSS.
import { icon } from './icons.js';
import { curveLUT } from './adjust.js';

/** Tiny hyperscript: h('div', {class, onclick, html, ...attrs}, ...children) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Icon button with tooltip + aria-label. */
export function ibtn(ic, label, onclick, cls = '') {
  return h('button', { type: 'button', class: 'ps-ibtn ' + cls, title: label, 'aria-label': label, html: icon(ic), onclick });
}
/** Button with icon + text. */
export function btn(ic, text, onclick, cls = '', title) {
  return h('button', { type: 'button', class: 'ps-btn ' + cls, title: title || text, html: (ic ? icon(ic) : '') + `<span>${text}</span>`, onclick });
}

const fmtSigned = (v) => (v > 0 ? '+' + v : String(v));

/**
 * Slider: { label, min, max, step, value, def, icon, fmt, onStart, onInput, onCommit, compact }
 * Value badge: tap to reset to default.
 */
export function slider(o) {
  const def = o.def ?? 0;
  const fmt = o.fmt || ((v) => (o.min < 0 ? fmtSigned(v) : String(v)));
  const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value ?? def, 'aria-label': o.label });
  const val = h('button', { type: 'button', class: 'ps-sl-val', title: 'Tap to reset', 'aria-label': `${o.label}: reset` });
  const el = h('div', { class: 'ps-sl' + (o.compact ? ' compact' : '') + (o.cls ? ' ' + o.cls : '') },
    h('div', { class: 'ps-sl-top' }, h('span', { class: 'ps-sl-lbl', html: (o.icon ? icon(o.icon) : '') + `<span>${o.label}</span>` }), val),
    input);
  let dragging = false;
  const paint = () => {
    const v = +input.value, a = (Math.max(o.min, Math.min(o.max, 0)) - o.min) / (o.max - o.min) * 100, b = (v - o.min) / (o.max - o.min) * 100;
    const zero = o.min < 0 ? a : 0;
    input.style.setProperty('--a', Math.min(zero, b) + '%');
    input.style.setProperty('--b', Math.max(zero, b) + '%');
    val.textContent = fmt(v);
    el.classList.toggle('changed', v !== def);
  };
  const start = () => { if (!dragging) { dragging = true; o.onStart && o.onStart(); } };
  input.addEventListener('pointerdown', start);
  input.addEventListener('input', () => { start(); paint(); o.onInput && o.onInput(+input.value); });
  input.addEventListener('change', () => { dragging = false; paint(); o.onCommit && o.onCommit(+input.value); });
  input.addEventListener('pointerup', () => { if (dragging) setTimeout(() => { if (dragging) { dragging = false; o.onCommit && o.onCommit(+input.value); } }, 0); });
  val.addEventListener('click', () => { input.value = def; paint(); o.onInput && o.onInput(def); o.onCommit && o.onCommit(def); });
  input.addEventListener('dblclick', () => val.click());
  paint();
  return { el, input, set(v) { input.value = v; paint(); }, get: () => +input.value };
}

/** Segmented control: options [{v, label, icon, title}] */
export function seg(options, value, onChange, cls = '') {
  const el = h('div', { class: 'ps-seg ' + cls, role: 'radiogroup' });
  const btns = options.map((op) => {
    const b = h('button', { type: 'button', role: 'radio', title: op.title || op.label, 'aria-label': op.title || op.label, html: (op.icon ? icon(op.icon) : '') + (op.label ? `<span>${op.label}</span>` : '') });
    b.addEventListener('click', () => { set(op.v); onChange(op.v); });
    el.append(b);
    return [op.v, b];
  });
  const set = (v) => { for (const [k, b] of btns) { b.classList.toggle('on', k === v); b.setAttribute('aria-checked', String(k === v)); } };
  set(value);
  return { el, set };
}

/** Switch toggle */
export function toggle(label, value, onChange, title) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'ps-tog', title: title || label }, h('span', { text: label }), input, h('i', { 'aria-hidden': 'true' }));
  return { el, set(v) { input.checked = !!v; } };
}

/** Collapsible section */
export function section(title, body, { open = true, right = null, cls = '' } = {}) {
  const head = h('button', { type: 'button', class: 'ps-sec-h', 'aria-expanded': String(open) }, h('span', { text: title }));
  const el = h('section', { class: 'ps-sec ' + cls + (open ? '' : ' closed') }, h('div', { class: 'ps-sec-hd' }, head, right), h('div', { class: 'ps-sec-b' }, body));
  head.addEventListener('click', () => { const c = el.classList.toggle('closed'); head.setAttribute('aria-expanded', String(!c)); });
  return el;
}

/* ---------------- histogram ---------------- */

export function drawHistogram(cv, hist, { mode = 'rgb', css } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 240, H = cv.clientHeight || 70;
  if (cv.width !== Math.round(W * dpr)) cv.width = Math.round(W * dpr);
  if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!hist) return;
  let mx = 1;
  const chans = mode === 'rgb' ? ['r', 'g', 'b'] : ['l'];
  for (const c of chans) {
    const a = hist[c];
    // ignore the extreme bins for scaling (clipped spikes)
    for (let v = 2; v < 254; v++) if (a[v] > mx) mx = a[v];
  }
  const col = { r: 'rgba(255,70,70,.55)', g: 'rgba(60,220,90,.5)', b: 'rgba(70,120,255,.55)', l: css || 'rgba(160,160,170,.6)' };
  ctx.globalCompositeOperation = mode === 'rgb' ? 'lighter' : 'source-over';
  for (const c of chans) {
    const a = hist[c];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let v = 0; v < 256; v++) ctx.lineTo((v / 255) * W, H - Math.min(1, Math.sqrt(a[v] / mx)) * (H - 2));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = col[c];
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------- curves editor ---------------- */

/**
 * curves = { rgb, r, g, b } arrays of [x,y] (0..1). onInput(curves) while dragging, onCommit(curves) at the end.
 */
export function curvesEditor({ curves, onInput, onCommit, getHist }) {
  let ch = 'rgb';
  let C = JSON.parse(JSON.stringify(curves));
  const cv = h('canvas', { class: 'ps-curves', 'aria-label': 'Curves editor: drag points, tap the line to add a point, drag a point off the edge to remove it' });
  const chSeg = seg([{ v: 'rgb', label: 'RGB' }, { v: 'r', label: 'R' }, { v: 'g', label: 'G' }, { v: 'b', label: 'B' }], ch, (v) => { ch = v; draw(); }, 'ps-seg-sm');
  const resetB = h('button', { type: 'button', class: 'ps-link', text: 'Reset curve', onclick: () => { C[ch] = [[0, 0], [1, 1]]; draw(); onInput(C); onCommit(C); } });
  const el = h('div', { class: 'ps-curvebox' }, h('div', { class: 'ps-row' }, chSeg.el, resetB), cv);
  const colors = { rgb: null, r: '#ff5a5a', g: '#3ccf6a', b: '#5a8cff' };
  let drag = -1;
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 240, H = cv.clientHeight || W;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    return { W, H, dpr };
  }
  function draw() {
    const { W, H, dpr } = size();
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const st = getComputedStyle(cv);
    const text = st.color || '#ccc';
    const hist = getHist && getHist();
    if (hist) {
      const a = hist[ch === 'rgb' ? 'l' : ch];
      let mx = 1; for (let v = 2; v < 254; v++) mx = Math.max(mx, a[v]);
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let v = 0; v < 256; v++) ctx.lineTo(v / 255 * W, H - Math.min(1, Math.sqrt(a[v] / mx)) * H * 0.9);
      ctx.lineTo(W, H); ctx.closePath();
      ctx.globalAlpha = 0.18; ctx.fillStyle = text; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = text; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * W / 4, 0); ctx.lineTo(i * W / 4, H); ctx.moveTo(0, i * H / 4); ctx.lineTo(W, i * H / 4); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    ctx.globalAlpha = 1;
    // other channels faint
    for (const k of ['r', 'g', 'b', 'rgb']) {
      if (k === ch) continue;
      const pts = C[k];
      if (pts.length === 2 && pts[0][1] === 0 && pts[1][1] === 1) continue;
      const lut = curveLUT(pts);
      ctx.beginPath();
      for (let v = 0; v < 256; v++) ctx.lineTo(v / 255 * W, H - lut[v] * H);
      ctx.strokeStyle = colors[k] || text; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const lut = curveLUT(C[ch]);
    ctx.beginPath();
    for (let v = 0; v < 256; v++) ctx.lineTo(v / 255 * W, H - lut[v] * H);
    ctx.strokeStyle = colors[ch] || text; ctx.lineWidth = 2; ctx.stroke();
    for (const [x, y] of C[ch]) {
      ctx.beginPath(); ctx.arc(x * W, H - y * H, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)' ? st.backgroundColor : '#222';
      ctx.fill(); ctx.strokeStyle = colors[ch] || text; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    const pts = C[ch];
    const r = cv.getBoundingClientRect();
    let best = -1, bd = 1e9;
    pts.forEach((p, i) => { const d = Math.hypot((p[0] - x) * r.width, (p[1] - y) * r.height); if (d < bd) { bd = d; best = i; } });
    if (bd < 18) drag = best;
    else {
      pts.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
      pts.sort((a, b) => a[0] - b[0]);
      drag = pts.findIndex((p) => p[0] === Math.max(0, Math.min(1, x)));
    }
    draw(); onInput(C);
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const [x, y] = pos(e);
    const pts = C[ch];
    const lo = drag > 0 ? pts[drag - 1][0] + 0.01 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 0.01 : 1;
    const out = (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08) && drag > 0 && drag < pts.length - 1;
    pts[drag] = [drag === 0 ? Math.min(hi, Math.max(0, x)) : drag === pts.length - 1 ? Math.max(lo, Math.min(1, x)) : Math.max(lo, Math.min(hi, x)), Math.max(0, Math.min(1, y))];
    pts[drag].remove = out;
    draw(); onInput(C);
  });
  const end = () => {
    if (drag < 0) return;
    const pts = C[ch];
    if (pts[drag] && pts[drag].remove) pts.splice(drag, 1);
    drag = -1;
    draw(); onInput(C); onCommit(C);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', (e) => {
    const [x, y] = pos(e);
    const pts = C[ch];
    const i = pts.findIndex((p, k) => k > 0 && k < pts.length - 1 && Math.hypot(p[0] - x, p[1] - y) < 0.06);
    if (i > 0) { pts.splice(i, 1); draw(); onInput(C); onCommit(C); }
  });
  const ro = new ResizeObserver(() => draw());
  ro.observe(cv);
  return { el, draw, set(c) { C = JSON.parse(JSON.stringify(c)); draw(); } };
}

/* ---------------- levels editor ---------------- */

export function levelsEditor({ levels, onInput, onCommit, getHist }) {
  let L = { ...levels };
  const cv = h('canvas', { class: 'ps-levels-h', 'aria-hidden': 'true' });
  const bar = h('div', { class: 'ps-levels-bar' });
  const mk = (k, label) => h('button', { type: 'button', class: 'ps-lv-handle ' + k, title: label, 'aria-label': label });
  const hb = mk('black', 'Black input level'), hm = mk('mid', 'Midtones (gamma)'), hw = mk('white', 'White input level');
  bar.append(hb, hm, hw);
  const vals = h('div', { class: 'ps-levels-vals' });
  const resetB = h('button', { type: 'button', class: 'ps-link', text: 'Reset levels', onclick: () => { L = { black: 0, gamma: 1, white: 255 }; place(); onInput(L); onCommit(L); } });
  const el = h('div', { class: 'ps-levelsbox' }, cv, bar, h('div', { class: 'ps-row' }, vals, resetB));
  const midT = () => Math.pow(0.5, 1 / Math.max(0.1, L.gamma)); // position of the midtone handle between black & white
  function place() {
    const b = L.black / 255, w = L.white / 255, m = b + (w - b) * (1 - midT() + 0) ;
    // midtone handle position: t such that t^(1/gamma)=0.5 → t = 0.5^gamma
    const t = Math.pow(0.5, L.gamma);
    const mm = b + (w - b) * t;
    hb.style.left = b * 100 + '%'; hw.style.left = w * 100 + '%'; hm.style.left = mm * 100 + '%';
    void m;
    vals.textContent = `${L.black}  ·  ${L.gamma.toFixed(2)}  ·  ${L.white}`;
    if (getHist) drawHistogram(cv, getHist(), { mode: 'l' });
  }
  let drag = null;
  const posX = (e) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  for (const [hd, k] of [[hb, 'black'], [hm, 'mid'], [hw, 'white']]) {
    hd.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = k; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener('pointermove', (e) => {
      if (drag !== k) return;
      const x = posX(e) * 255;
      if (k === 'black') L.black = Math.round(Math.min(L.white - 2, x));
      else if (k === 'white') L.white = Math.round(Math.max(L.black + 2, x));
      else {
        const t = Math.max(0.02, Math.min(0.98, (x - L.black) / Math.max(1, L.white - L.black)));
        L.gamma = Math.round(Math.log(t) / Math.log(0.5) * 100) / 100;
        L.gamma = Math.max(0.1, Math.min(9.99, L.gamma));
      }
      place(); onInput(L);
    });
    const up = () => { if (drag === k) { drag = null; onCommit(L); } };
    hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    hd.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      if (k === 'black') L.black = Math.max(0, Math.min(L.white - 2, L.black + d * 2));
      else if (k === 'white') L.white = Math.min(255, Math.max(L.black + 2, L.white + d * 2));
      else L.gamma = Math.max(0.1, Math.min(9.99, Math.round((L.gamma - d * 0.05) * 100) / 100));
      place(); onInput(L); onCommit(L);
    });
  }
  const ro = new ResizeObserver(() => place());
  ro.observe(cv);
  place();
  return { el, draw: place, set(l) { L = { ...l }; place(); } };
}
