/** ui.js — Minimal DOM toolkit. No framework: the app is small enough that
 *  hand-rolled rendering beats shipping a runtime, and it keeps first paint
 *  instant on a phone with one bar of signal. */

/** Hyperscript. h('div.card', {onclick}, child, child) */
export function h(spec, props = null, ...children) {
  let tag = 'div', id = null, cls = [];
  const m = String(spec).match(/^([a-zA-Z0-9-]*)((?:[.#][^.#]+)*)$/);
  if (m) {
    tag = m[1] || 'div';
    (m[2].match(/[.#][^.#]+/g) || []).forEach((t) => {
      if (t[0] === '.') cls.push(t.slice(1)); else id = t.slice(1);
    });
  }
  const el = document.createElement(tag);
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  if (props && (props.nodeType || typeof props === 'string' || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export const frag = (...c) => {
  const f = document.createDocumentFragment();
  c.flat().forEach((x) => x && f.appendChild(x.nodeType ? x : document.createTextNode(String(x))));
  return f;
};

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/* ------------------------------------------------------------------ *
 * Icons — inline SVG, 24×24, currentColor.
 * ------------------------------------------------------------------ */

const P = {
  today:   'M7 3v2M17 3v2M3.5 9h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  people:  'M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 11a4 4 0 100-8 4 4 0 000 8M22 19v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  calendar:'M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  sheets:  'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zM3 9h18M3 15h18M9 3v18M15 3v18',
  gear:    'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.4.55.71.66H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  phone:   'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.6a2 2 0 01-.5 2.1L8.1 9.6a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.8.3 1.7.6 2.6.7a2 2 0 011.7 2z',
  chat:    'M21 11.5a8.4 8.4 0 01-9 8.4 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 013.5 11a8.4 8.4 0 018.4-8.4h.6a8.4 8.4 0 018 8z',
  pin:     'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z',
  nav:     'M3 11l19-9-9 19-2-8-8-2z',
  clock:   'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2',
  plus:    'M12 5v14M5 12h14',
  back:    'M15 18l-6-6 6-6',
  fwd:     'M9 18l6-6-6-6',
  check:   'M20 6L9 17l-5-5',
  x:       'M18 6L6 18M6 6l12 12',
  search:  'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3',
  truck:   'M1 3h15v13H1zM16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  fork:    'M6 2v7a3 3 0 006 0V2M9 12v10M17 2c-1.5 2-2 4-2 6s.5 3 2 3 2-1 2-3-.5-4-2-6zM17 11v11',
  broom:   'M19 3l-7 7M5 21l4-9 6 6-9 4zM10 12l4 4',
  shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  camera:  'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z',
  mic:     'M12 1a3 3 0 013 3v7a3 3 0 01-6 0V4a3 3 0 013-3z M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8',
  bulb:    'M9 21h6M10 18h4c0-3 3-4 3-7a5 5 0 10-10 0c0 3 3 4 3 7z',
  clipboard:'M9 2h6a1 1 0 011 1v2H8V3a1 1 0 011-1z M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2',
  star:    'M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.2 3.3L7 14.3l-5-4.9 7-.9z',
  trash:   'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6',
  cloud:   'M18 18a4 4 0 000-8 6 6 0 00-11.6-1.5A4.5 4.5 0 006.5 18z',
  edit:    'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z',
  sun:     'M12 17a5 5 0 100-10 5 5 0 000 10z M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  (P[name] || P.clock).split(' M').forEach((d, i) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', i ? 'M' + d : d);
    svg.appendChild(p);
  });
  return svg;
}

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch {}
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div#toast.toast');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

/* ------------------------------------------------------------------ *
 * Bottom sheet — the primary modal idiom on iOS.
 * ------------------------------------------------------------------ */

export function sheet({ title, body, actions = [], onClose }) {
  const scrim = h('div.scrim');
  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' });
  const close = () => {
    panel.classList.remove('in');
    scrim.classList.remove('in');
    setTimeout(() => { scrim.remove(); onClose?.(); }, 260);
  };
  panel.append(
    h('div.sheet-grab'),
    title ? h('div.sheet-head', h('h2', title), h('button.icon-btn', { onclick: close, 'aria-label': 'סגור' }, icon('x', 20))) : null,
    h('div.sheet-body', body),
    actions.length ? h('div.sheet-actions', actions) : null,
  );
  scrim.appendChild(panel);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  requestAnimationFrame(() => { scrim.classList.add('in'); panel.classList.add('in'); });
  return { close, panel };
}

export function confirmSheet(message, { danger = true, confirmLabel = 'מחק' } = {}) {
  return new Promise((resolve) => {
    const s = sheet({
      title: '',
      body: h('p.confirm-msg', message),
      actions: [
        h('button.btn.block' + (danger ? '.danger' : '.primary'),
          { onclick: () => { haptic(12); s.close(); resolve(true); } }, confirmLabel),
        h('button.btn.block.plain', { onclick: () => { s.close(); resolve(false); } }, 'ביטול'),
      ],
      onClose: () => resolve(false),
    });
  });
}

/**
 * Readable ink for text sitting on a coloured fill.
 *
 * The department palette spans very dark (red) to very light (the lighting
 * yellow), so a fixed white never works: white on #FFD60A is unreadable.
 * Relative luminance per WCAG, with the usual sRGB linearisation.
 */
export function inkOn(bg) {
  const hex = String(bg || '').trim();
  let r, g, b;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (m) {
    let v = m[1];
    if (v.length === 3) v = v.split('').map((c) => c + c).join('');
    [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  } else {
    const hsl = /hsl\(\s*\d+\s+\d+%\s+(\d+)%/.exec(hex);
    return hsl && Number(hsl[1]) > 62 ? '#141414' : '#FFFFFF';
  }
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against white vs. against near-black; pick the better one.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.10) ? '#FFFFFF' : '#141414';
}

/** Initials avatar with a stable colour derived from the name. */
export function avatar(name, size = 40, color) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = color || `hsl(${hash % 360} 62% 46%)`;
  return h('div.avatar', {
    style: {
      width: `${size}px`, height: `${size}px`, background: bg,
      fontSize: `${size * 0.38}px`, color: inkOn(bg),
    },
    'aria-hidden': 'true',
  }, initials || '?');
}

/** Escape for safe interpolation into href/text where needed. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
