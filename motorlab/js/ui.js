/* MotorLab — DOM helpers, panels, charts, gauges and the world map. */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'data' && typeof v === 'object') Object.entries(v).forEach(([a,b]) => el.dataset[a] = b);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)){
    if (kid == null || kid === false) continue;
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* ---- feedback --------------------------------------------------------- */
let toastTimer = null;
export function toast(msg, kind = ''){
  const el = $('#toast'); if (!el) return;
  el.textContent = msg;
  el.className = 'toast on ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast ' + kind, kind === 'bad' ? 4200 : 2600);
}

export function modal({ title, body, actions = [], wide = false, onClose }){
  const host = $('#modal');
  const card = h('div', { class:'modal__card', style: wide ? { width:'min(1000px,100%)' } : null });
  const close = () => { host.hidden = true; host.innerHTML = ''; onClose?.(); };
  card.append(
    h('div', { class:'modal__head' },
      h('h3', { text:title }),
      h('button', { class:'iconbtn', onclick:close, title:'Close' }, '✕')),
    h('div', { class:'modal__body' }, body),
    actions.length ? h('div', { class:'modal__foot' },
      ...actions.map(a => h('button', {
        class:'btn ' + (a.primary ? 'btn--pri' : a.danger ? 'btn--danger' : ''),
        onclick:() => { const r = a.onClick?.(); if (r !== false) close(); } }, a.label))) : null,
  );
  host.innerHTML = '';
  host.appendChild(card);
  host.hidden = false;
  host.onclick = (ev) => { if (ev.target === host) close(); };
  return { close, card };
}

export function confirmDialog(title, message, onYes, yesLabel = 'Confirm'){
  modal({ title, body: h('p', { class:'p', text:message }),
    actions:[{ label:'Cancel' }, { label:yesLabel, primary:true, onClick:onYes }] });
}

/* ---- panel widgets ---------------------------------------------------- */
export function section(title, ...kids){
  return h('div', { class:'sec' }, h('div', { class:'sec__h' }, h('span', { text:title })), ...kids);
}
export function sectionWith(title, right, ...kids){
  return h('div', { class:'sec' },
    h('div', { class:'sec__h' }, h('span', { text:title }), right || null), ...kids);
}
export function kv(label, value, cls = ''){
  return h('div', { class:'kv ' + cls }, h('span', { text:label }), h('b', { text:value }));
}
export function note(text, kind = ''){ return h('div', { class:'note ' + kind, html:text }); }
export function para(html){ return h('p', { class:'p', html }); }
export function chip(text, kind = ''){ return h('span', { class:'chip ' + (kind ? 'chip--' + kind : ''), text }); }
export function bar(frac, kind = ''){
  return h('div', { class:'bar ' + kind }, h('i', { style:{ width: Math.max(0, Math.min(1, frac))*100 + '%' } }));
}
export function btn(label, opts = {}){
  return h('button', { class:'btn ' + (opts.class || ''), onclick:opts.onClick, disabled:opts.disabled, title:opts.title }, label);
}
export function field(label, control){
  return h('div', { class:'field' }, h('label', { class:'f', text:label }), control);
}
export function select(options, value, onChange){
  const el = h('select', { onchange:(e) => onChange(e.target.value) });
  for (const o of options){
    if (o.group){
      const g = h('optgroup', { label:o.group });
      o.items.forEach(i => g.appendChild(h('option', { value:i.value, selected:i.value === value }, i.label)));
      el.appendChild(g);
    } else el.appendChild(h('option', { value:o.value, selected:o.value === value }, o.label));
  }
  return el;
}
export function slider({ label, min, max, step = 1, value, format = (v)=>v, onInput }){
  const out = h('output', { text:format(value) });
  const input = h('input', { type:'range', min, max, step, value,
    oninput:(e) => { const v = parseFloat(e.target.value); out.textContent = format(v); onInput(v); } });
  return h('div', { class:'slrow' }, h('label', { text:label }), input, out);
}
export function toggle(label, value, onChange){
  const b = h('button', { class:'btn' + (value ? ' btn--pri' : ''), onclick:() => onChange(!value) }, value ? 'On' : 'Off');
  return h('div', { class:'slrow' }, h('label', { text:label }), h('span', { style:{ flex:'1' } }), b);
}

/* ---- charts ----------------------------------------------------------- */
export function lineChart(canvas, { series, xLabel, yLabel, y2Label, xMin, xMax, grid = true, markers = [] }){
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 360, hgt = canvas.clientHeight || 200;
  canvas.width = w * dpr; canvas.height = hgt * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);
  const pad = { l:44, r:series.some(s => s.axis === 2) ? 44 : 12, t:12, b:26 };
  const plotW = w - pad.l - pad.r, plotH = hgt - pad.t - pad.b;
  const xs = series.flatMap(s => s.points.map(p => p[0]));
  const x0 = xMin ?? Math.min(...xs), x1 = xMax ?? Math.max(...xs);
  const axes = [1, 2].map(ax => {
    const ys = series.filter(s => (s.axis || 1) === ax).flatMap(s => s.points.map(p => p[1]));
    if (!ys.length) return null;
    const lo = Math.min(0, Math.min(...ys)), hi = Math.max(...ys) * 1.08 || 1;
    return { lo, hi };
  });
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * plotW;
  const Y = (v, ax = 1) => { const a = axes[ax-1] || axes[0]; return pad.t + plotH - ((v - a.lo) / (a.hi - a.lo || 1)) * plotH; };

  c.strokeStyle = '#1c2433'; c.lineWidth = 1;
  c.fillStyle = '#68758d'; c.font = '10px ui-monospace,monospace';
  if (grid) for (let i = 0; i <= 5; i++){
    const yy = pad.t + (i/5) * plotH;
    c.beginPath(); c.moveTo(pad.l, yy); c.lineTo(pad.l + plotW, yy); c.stroke();
    if (axes[0]){
      const val = axes[0].hi - (i/5) * (axes[0].hi - axes[0].lo);
      c.textAlign = 'right'; c.fillText(fmtNum(val), pad.l - 6, yy + 3);
    }
    if (axes[1]){
      const val = axes[1].hi - (i/5) * (axes[1].hi - axes[1].lo);
      c.textAlign = 'left'; c.fillText(fmtNum(val), pad.l + plotW + 6, yy + 3);
    }
  }
  c.textAlign = 'center';
  for (let i = 0; i <= 5; i++){
    const xx = pad.l + (i/5) * plotW;
    c.fillText(fmtNum(x0 + (i/5) * (x1 - x0)), xx, hgt - 8);
    if (grid && i){ c.beginPath(); c.moveTo(xx, pad.t); c.lineTo(xx, pad.t + plotH); c.strokeStyle = '#161d29'; c.stroke(); c.strokeStyle='#1c2433'; }
  }
  for (const m of markers){
    c.strokeStyle = m.colour || '#ff7a1a'; c.setLineDash([3,3]);
    c.beginPath(); c.moveTo(X(m.x), pad.t); c.lineTo(X(m.x), pad.t + plotH); c.stroke();
    c.setLineDash([]);
    if (m.label){ c.fillStyle = m.colour || '#ff7a1a'; c.textAlign='left'; c.fillText(m.label, X(m.x)+4, pad.t+10); }
  }
  for (const s of series){
    if (!s.points.length) continue;
    c.beginPath();
    s.points.forEach((p, i) => { const px = X(p[0]), py = Y(p[1], s.axis || 1); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.strokeStyle = s.colour; c.lineWidth = s.width || 2; c.setLineDash(s.dash || []); c.stroke(); c.setLineDash([]);
    if (s.fill){
      c.lineTo(X(s.points[s.points.length-1][0]), Y(0, s.axis||1));
      c.lineTo(X(s.points[0][0]), Y(0, s.axis||1)); c.closePath();
      c.fillStyle = s.fill; c.fill();
    }
  }
  /* legend */
  c.textAlign = 'left'; let lx = pad.l + 4;
  for (const s of series){
    if (!s.name) continue;
    c.fillStyle = s.colour; c.fillRect(lx, pad.t + 2, 9, 3);
    c.fillStyle = '#9aa8c0'; c.fillText(s.name, lx + 13, pad.t + 6);
    lx += c.measureText(s.name).width + 30;
  }
  if (xLabel){ c.fillStyle='#68758d'; c.textAlign='right'; c.fillText(xLabel, w - pad.r, hgt - 8); }
}
function fmtNum(v){
  if (Math.abs(v) >= 1000) return Math.round(v/100)/10 + 'k';
  return Math.abs(v) >= 10 ? Math.round(v) : Math.round(v*10)/10;
}

/** Torque wrench arc gauge. */
export function torqueDial(canvas, { value, target, tolerance = 0.08 }){
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = 190, hh = 112;
  canvas.width = w * dpr; canvas.height = hh * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = hh + 'px';
  const c = canvas.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,w,hh);
  const cx = w/2, cy = hh - 8, r = 78;
  const max = target * 1.6;
  const a0 = Math.PI, a1 = 0;
  const ang = (v) => a0 + (Math.min(v, max)/max) * (a1 - a0);
  c.lineWidth = 12; c.lineCap = 'butt';
  c.strokeStyle = '#1c2433'; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
  /* target band */
  c.strokeStyle = '#1e5c39'; c.beginPath(); c.arc(cx, cy, r, ang(target*(1-tolerance)), ang(target*(1+tolerance))); c.stroke();
  /* over-torque zone */
  c.strokeStyle = '#5c2323'; c.beginPath(); c.arc(cx, cy, r, ang(target*(1+tolerance)), a1); c.stroke();
  /* needle */
  const good = value >= target*(1-tolerance) && value <= target*(1+tolerance);
  const over = value > target*(1+tolerance);
  c.strokeStyle = over ? '#ff5a5a' : good ? '#3ddc84' : '#ff7a1a';
  c.lineWidth = 3; c.beginPath();
  const a = ang(value);
  c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a)*(r+5), cy + Math.sin(a)*(r+5)); c.stroke();
  c.fillStyle = '#9aa8c0'; c.font = '9px ui-monospace,monospace'; c.textAlign = 'center';
  c.fillText('0', cx - r, cy + 12); c.fillText(Math.round(max) + ' Nm', cx + r, cy + 12);
}

/* ---- world map -------------------------------------------------------- */
let landCache = null;
export async function loadLand(url = './data/world_land.json'){
  if (landCache) return landCache;
  const inlined = globalThis.__MOTORLAB_LAND;
  if (inlined){ landCache = inlined.polygons || inlined; return landCache; }
  try {
    const r = await fetch(url);
    landCache = (await r.json()).polygons || [];
  } catch { landCache = []; }
  return landCache;
}

/** Equirectangular world map with plotted dots. Returns the svg element. */
export function worldMap(host, { polygons, points, onPick, selected, width = 900, height = 460 }){
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block';

  const proj = (lon, lat) => [ (lon + 180) / 360 * width, (90 - lat) / 180 * height ];

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', width); bg.setAttribute('height', height);
  bg.setAttribute('fill', '#0b111c'); svg.appendChild(bg);

  /* graticule */
  const g0 = document.createElementNS(NS, 'g');
  g0.setAttribute('stroke', '#141c2a'); g0.setAttribute('stroke-width', '1');
  for (let lon = -150; lon <= 150; lon += 30){
    const [x] = proj(lon, 0);
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x); l.setAttribute('y1', 0); l.setAttribute('x2', x); l.setAttribute('y2', height);
    g0.appendChild(l);
  }
  for (let lat = -60; lat <= 60; lat += 30){
    const [, y] = proj(0, lat);
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 0); l.setAttribute('y1', y); l.setAttribute('x2', width); l.setAttribute('y2', y);
    g0.appendChild(l);
  }
  svg.appendChild(g0);

  const land = document.createElementNS(NS, 'g');
  land.setAttribute('fill', '#18202e'); land.setAttribute('stroke', '#243046'); land.setAttribute('stroke-width', '0.6');
  for (const poly of polygons || []){
    if (!poly || poly.length < 3) continue;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + poly.map(([lon, lat]) => proj(lon, lat).map(n => n.toFixed(1)).join(',')).join('L') + 'Z');
    land.appendChild(p);
  }
  svg.appendChild(land);

  const dots = document.createElementNS(NS, 'g');
  for (const pt of points || []){
    const [x, y] = proj(pt.lon, pt.lat);
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'pointer';
    const isSel = selected === pt.id;
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', x); halo.setAttribute('cy', y);
    halo.setAttribute('r', isSel ? 11 : 8);
    halo.setAttribute('fill', pt.colour); halo.setAttribute('opacity', isSel ? '0.32' : '0.16');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', isSel ? 5 : 3.4);
    dot.setAttribute('fill', pt.colour);
    dot.setAttribute('stroke', isSel ? '#fff' : 'rgba(0,0,0,.5)');
    dot.setAttribute('stroke-width', isSel ? '1.4' : '0.8');
    const t = document.createElementNS(NS, 'title');
    t.textContent = `${pt.name} — ${pt.city}, ${pt.country}`;
    g.append(halo, dot, t);
    g.addEventListener('click', () => onPick?.(pt.id));
    dots.appendChild(g);
  }
  svg.appendChild(dots);

  host.innerHTML = '';
  host.appendChild(svg);
  return svg;
}

/* ---- misc ------------------------------------------------------------- */
export function download(filename, text, type = 'application/json'){
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href:url, download:filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pickFile(accept, cb){
  const input = h('input', { type:'file', accept, style:{ display:'none' },
    onchange:(e) => { const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => cb(r.result, f.name); r.readAsText(f); } });
  document.body.appendChild(input); input.click(); setTimeout(() => input.remove(), 4000);
}
export function tabs(host, items, active, onChange){
  host.innerHTML = '';
  for (const t of items)
    host.appendChild(h('button', { class:'ptab' + (t.id === active ? ' on' : ''),
      onclick:() => onChange(t.id) }, t.name));
}
