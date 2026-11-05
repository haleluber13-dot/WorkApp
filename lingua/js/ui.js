/* Small DOM helpers. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
export const sample = (a, n) => shuffle(a).slice(0, n);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastTimer;
export function toast(msg, ms = 2200) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), ms);
}

/* modal(html) → { el, close } ; closes on backdrop click / Escape */
export function modal(html, { onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="modal__card">${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  return { el: wrap, close };
}
export function confirm(msg, yes = "OK", no = "Cancel") {
  return new Promise((res) => {
    const m = modal(`<p class="modal__msg">${esc(msg)}</p><div class="row end"><button class="btn" data-close>${esc(no)}</button><button class="btn primary" data-yes>${esc(yes)}</button></div>`, { onClose: () => res(false) });
    m.el.querySelector("[data-yes]").onclick = () => { res(true); m.el.remove(); };
  });
}

/* tiny sound effects via Web Audio */
let ctx;
export function sfx(kind) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const tone = (f, t0, dur, type = "sine", g = 0.08) => {
      const o = ctx.createOscillator(), a = ctx.createGain();
      o.type = type; o.frequency.value = f; a.gain.setValueAtTime(0.0001, now + t0);
      a.gain.exponentialRampToValueAtTime(g, now + t0 + 0.01); a.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.connect(a).connect(ctx.destination); o.start(now + t0); o.stop(now + t0 + dur + 0.05);
    };
    if (kind === "ok") { tone(660, 0, 0.12); tone(880, 0.1, 0.18); }
    else if (kind === "bad") { tone(220, 0, 0.25, "triangle"); }
    else if (kind === "done") { tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.12); tone(1046, 0.36, 0.3); }
    else if (kind === "tick") tone(1200, 0, 0.04, "square", 0.03);
  } catch { /* no audio */ }
}

export const fmtMin = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
