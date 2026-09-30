/* On-screen keyboard (SVG). Shows which keys to press with finger numbers,
   what you're playing, and lets you tap keys to hear them. */

import { isBlack, fromMidi, pcLabel } from "./theory.js";

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/* Snap a range outwards to whole white keys, at least `minWhite` wide. */
export function fitRange(lo, hi, minWhite = 15) {
  lo = Math.max(21, lo); hi = Math.min(108, hi);
  if (isBlack(lo)) lo--;
  if (isBlack(hi)) hi++;
  const whites = (a, b) => { let n = 0; for (let m = a; m <= b; m++) if (!isBlack(m)) n++; return n; };
  let grow = 0;
  while (whites(lo, hi) < minWhite && (lo > 21 || hi < 108)) {
    if ((grow++ % 2 === 0 && hi < 108) || lo <= 21) { hi++; if (isBlack(hi)) hi++; }
    else { lo--; if (isBlack(lo)) lo--; }
  }
  return [lo, hi];
}

export class Keyboard {
  constructor(host, { lo = 48, hi = 72, labels = "c", onPress = null, onRelease = null, height = null, maxHeight = null } = {}) {
    this.maxHeight = maxHeight;
    this.host = host;
    this.labels = labels;         // "all" | "c" | "none"
    this.onPress = onPress;
    this.onRelease = onRelease;
    this.fixedHeight = height;
    this.targets = new Map();     // midi -> {finger, hand}
    this.states = new Map();      // midi -> css state class
    this.svg = el("svg", { class: "kb", role: "img", "aria-label": "Piano keyboard" });
    host.appendChild(this.svg);
    this.setRange(lo, hi);
    this._ro = new ResizeObserver(() => this.render());
    this._ro.observe(host);
    this._bindPointer();
  }

  destroy() { this._ro.disconnect(); this.svg.remove(); }

  setRange(lo, hi) {
    [this.lo, this.hi] = [lo, hi];
    if (isBlack(this.lo)) this.lo--;
    if (isBlack(this.hi)) this.hi++;
    this.render();
  }
  setLabels(l) { this.labels = l; this.render(); }

  setTargets(list) {
    this.targets = new Map(list.map((t) => [t.midi, t]));
    this._paint();
  }
  setState(midi, cls, ms = 0) {
    if (cls) this.states.set(midi, cls); else this.states.delete(midi);
    this._paint();
    if (ms) setTimeout(() => { if (this.states.get(midi) === cls) { this.states.delete(midi); this._paint(); } }, ms);
  }
  clearStates() { this.states.clear(); this._paint(); }

  render() {
    const w = this.host.clientWidth || 360;
    const whites = [];
    for (let m = this.lo; m <= this.hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length;
    const cap = this.maxHeight ? this.maxHeight() : 230;
    const h = this.fixedHeight || Math.max(80, Math.min(cap, ww * 5.2));
    this.ww = ww; this.h = h;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.svg.setAttribute("width", w);
    this.svg.setAttribute("height", h);
    this.svg.innerHTML = "";
    this.keys = new Map();
    const gW = el("g", {}, this.svg), gB = el("g", {}, this.svg), gT = el("g", { class: "kb-marks" }, this.svg);
    this.gMarks = gT;
    whites.forEach((m, i) => {
      const r = el("rect", { x: i * ww + 0.5, y: 0, width: ww - 1, height: h, rx: Math.min(6, ww * 0.15), class: "k kw", "data-m": m }, gW);
      this.keys.set(m, { rect: r, x: i * ww, w: ww, black: false });
    });
    const bw = ww * 0.6, bh = h * 0.62;
    for (let m = this.lo; m <= this.hi; m++) {
      if (!isBlack(m)) continue;
      const left = this.keys.get(m - 1);
      if (!left) continue;
      const pc = m % 12;
      const nudge = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 }[pc] * bw;
      const x = left.x + ww - bw / 2 + nudge;
      const r = el("rect", { x, y: 0, width: bw, height: bh, rx: Math.min(4, bw * 0.12), class: "k kb-b", "data-m": m }, gB);
      this.keys.set(m, { rect: r, x, w: bw, black: true, h: bh });
    }
    for (const m of whites) {
      const k = this.keys.get(m);
      const n = fromMidi(m);
      const show = this.labels === "all" || (this.labels === "c" && m % 12 === 0);
      if (!show) continue;
      const t = el("text", { x: k.x + ww / 2, y: h - Math.max(6, ww * 0.22), class: "kl" + (m === 60 ? " kl-mid" : ""), "font-size": Math.max(8, Math.min(15, ww * 0.42)) }, gW);
      t.textContent = m % 12 === 0 || this.labels === "all" ? (this.labels === "all" && m % 12 !== 0 ? pcLabel(n) : pcLabel(n) + n.oct) : "";
    }
    this._paint();
  }

  _paint() {
    if (!this.keys) return;
    for (const [m, k] of this.keys) {
      let cls = "k " + (k.black ? "kb-b" : "kw");
      const t = this.targets.get(m);
      if (t) cls += t.hand === "L" ? " tgt-l" : " tgt-r";
      const s = this.states.get(m);
      if (s) cls += " " + s;
      k.rect.setAttribute("class", cls);
    }
    const g = this.gMarks;
    g.innerHTML = "";
    for (const [m, t] of this.targets) {
      const k = this.keys.get(m);
      if (!k) continue;
      const r = Math.max(7, Math.min(15, this.ww * 0.36));
      const cy = k.black ? k.h - r - 5 : this.h - r - Math.max(22, this.ww * 0.75);
      const cx = k.x + k.w / 2;
      el("circle", { cx, cy, r, class: "fdot " + (t.hand === "L" ? "fdot-l" : "fdot-r") }, g);
      const tx = el("text", { x: cx, y: cy + r * 0.36, class: "ftxt", "font-size": r * 1.1 }, g);
      tx.textContent = t.finger || "•";
    }
  }

  /* Scroll a wide keyboard so that the given midi range is visible. */
  keyX(m) { const k = this.keys?.get(m); return k ? k.x + k.w / 2 : null; }

  _bindPointer() {
    const down = new Map();
    const midiAt = (e) => {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const m = t && t.getAttribute && t.getAttribute("data-m");
      return m ? +m : null;
    };
    this.svg.addEventListener("pointerdown", (e) => {
      const m = midiAt(e);
      if (m == null) return;
      e.preventDefault();
      down.set(e.pointerId, m);
      this.svg.setPointerCapture?.(e.pointerId);
      this.onPress?.(m);
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!down.has(e.pointerId)) return;
      const m = midiAt(e);
      const prev = down.get(e.pointerId);
      if (m != null && m !== prev) {
        this.onRelease?.(prev);
        down.set(e.pointerId, m);
        this.onPress?.(m);
      }
    });
    const up = (e) => {
      if (!down.has(e.pointerId)) return;
      this.onRelease?.(down.get(e.pointerId));
      down.delete(e.pointerId);
    };
    this.svg.addEventListener("pointerup", up);
    this.svg.addEventListener("pointercancel", up);
  }
}
