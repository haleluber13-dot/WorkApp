/* Sheet music renderer: draws a parsed score as a single horizontal system
   (grand staff when both hands play) in SVG, with fingerings, beams, key and
   time signatures, dynamics, chord symbols and pedal marks. The practice
   screen highlights the current step and keeps it scrolled into view. */

import { keySigList, keyAccidentals, accText } from "./theory.js";

const NS = "http://www.w3.org/2000/svg";
const S = 10; // one staff space in px
const EPS = 1e-6;
const tk = (t) => Math.round(t * 1000);

function mk(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, str, cls, size) {
  const t = mk("text", { x, y, class: cls }, parent);
  if (size) t.setAttribute("font-size", size);
  t.textContent = str;
  return t;
}

const CLEF = {
  treble: { topStep: 38, mid: 34 },
  bass: { topStep: 26, mid: 22 },
};
const KEY_STEPS = {
  treble: { 1: [38, 35, 39, 36, 33, 37, 34], "-1": [34, 37, 33, 36, 32, 35, 31] },
  bass: { 1: [24, 21, 25, 22, 19, 23, 20], "-1": [20, 23, 19, 22, 18, 21, 17] },
};

function trebleClef(g, x, top) {
  const p = (a, b) => `${x + a * S},${top + b * S}`;
  mk("path", {
    class: "clef",
    d: `M${p(1.55, 3.3)} C${p(0.95, 3.35)} ${p(0.95, 2.55)} ${p(1.5, 2.45)} C${p(2.25, 2.35)} ${p(2.4, 3.5)} ${p(1.65, 3.8)}`
      + ` C${p(0.65, 4.15)} ${p(0.05, 3.0)} ${p(0.75, 2.05)} C${p(1.35, 1.25)} ${p(2.15, 0.55)} ${p(2.0, -0.7)}`
      + ` C${p(1.9, -1.6)} ${p(1.3, -1.6)} ${p(1.15, -0.75)} C${p(0.95, 0.4)} ${p(1.45, 3.5)} ${p(1.75, 5.0)}`
      + ` C${p(1.9, 5.7)} ${p(1.2, 5.95)} ${p(0.85, 5.45)}`,
  }, g);
  mk("circle", { cx: x + 1.0 * S, cy: top + 5.25 * S, r: 0.34 * S, class: "clef-dot" }, g);
}
function bassClef(g, x, top) {
  const p = (a, b) => `${x + a * S},${top + b * S}`;
  mk("circle", { cx: x + 0.5 * S, cy: top + 1.05 * S, r: 0.42 * S, class: "clef-dot" }, g);
  mk("path", { class: "clef clef-b", d: `M${p(0.2, 1.0)} C${p(0.3, 0.05)} ${p(2.3, -0.3)} ${p(2.45, 1.15)} C${p(2.55, 2.55)} ${p(1.4, 3.55)} ${p(0.15, 4.1)}` }, g);
  mk("circle", { cx: x + 3.0 * S, cy: top + 0.5 * S, r: 0.2 * S, class: "clef-dot" }, g);
  mk("circle", { cx: x + 3.0 * S, cy: top + 1.5 * S, r: 0.2 * S, class: "clef-dot" }, g);
}

function restGlyph(g, x, top, dur, cls) {
  const b = dur[0];
  const r = mk("g", { class: "rest " + cls }, g);
  if (b === "w") mk("rect", { x: x - 0.65 * S, y: top + 1 * S, width: 1.3 * S, height: 0.55 * S }, r);
  else if (b === "h") mk("rect", { x: x - 0.65 * S, y: top + 1.45 * S, width: 1.3 * S, height: 0.55 * S }, r);
  else if (b === "q") {
    const p = (a, c) => `${x + a * S},${top + c * S}`;
    mk("path", { class: "rest-q", d: `M${p(-0.35, 0.9)} L${p(0.4, 1.8)} L${p(-0.25, 2.55)} L${p(0.45, 3.35)} Q${p(-0.6, 2.95)} ${p(-0.1, 4.1)}` }, r);
  } else {
    const flags = b === "e" ? 1 : 2;
    for (let i = 0; i < flags; i++) {
      const oy = i * 1.0 * S;
      mk("circle", { cx: x - 0.35 * S - i * 0.25 * S, cy: top + 1.6 * S + oy, r: 0.3 * S }, r);
      mk("path", { class: "rest-e", d: `M${x - 0.5 * S - i * 0.25 * S},${top + 1.85 * S + oy} Q${x},${top + 2.0 * S + oy} ${x + 0.45 * S - i * 0.25 * S},${top + 1.45 * S + oy}` }, r);
    }
    mk("line", { x1: x + 0.45 * S, y1: top + 1.45 * S, x2: x - 0.2 * S - (flags - 1) * 0.3 * S, y2: top + (3.4 + flags - 1) * S, class: "rest-stem" }, r);
  }
  if (dur.includes(".")) mk("circle", { cx: x + 1.0 * S, cy: top + 1.5 * S, r: 0.17 * S }, r);
}

export class Staff {
  constructor(host, { fit = false } = {}) {
    this.host = host;
    this.showFingers = true;
    this.scale = 1;
    /* fit: scale the music to the height of its container (practice screen) */
    if (fit) {
      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(host);
      this.fit = true;
    }
  }

  _fit() {
    if (!this.svg || !this.fit) return;
    const avail = this.host.clientHeight - 8;
    this.scale = Math.max(0.4, Math.min(1.6, avail / this.H));
    this.svg.setAttribute("width", this.W * this.scale);
    this.svg.setAttribute("height", this.H * this.scale);
  }

  render(score) {
    this.score = score;
    const staves = [];
    const clefFor = (h) => (score.ex.clef && score.ex.clef[h]) || (h === "R" ? "treble" : "bass");
    for (const h of ["R", "L"]) if (score.hands.includes(h)) staves.push({ hand: h, clef: clefFor(h) });
    const byHand = Object.fromEntries(staves.map((s) => [s.hand, s]));

    /* vertical extents: how far notes stick out above/below each staff */
    for (const st of staves) {
      const c = CLEF[st.clef];
      let hiStep = c.topStep, loStep = c.topStep - 8;
      for (const ev of score.events) if (ev.hand === st.hand) for (const n of ev.notes) { hiStep = Math.max(hiStep, n.step); loStep = Math.min(loStep, n.step); }
      st.up = Math.max(0, (hiStep - c.topStep) / 2) * S + (this.showFingers ? 2.6 : 1.6) * S;
      st.down = Math.max(0, (c.topStep - 8 - loStep) / 2) * S + (this.showFingers ? 2.6 : 1.6) * S;
      if (this.showFingers) {
        const stack = Math.max(1, ...score.events.filter((e) => e.hand === st.hand).map((e) => e.notes.filter((n) => n.finger).length));
        if (st.hand === "R") st.up += (stack - 1) * 1.25 * S; else st.down += (stack - 1) * 1.25 * S;
      }
    }
    const hasSym = score.events.some((e) => e.sym);
    let y = hasSym ? 2.4 * S : 0.5 * S;
    staves.forEach((st, i) => {
      y += st.up;
      st.top = y;
      y += 4 * S + st.down;
      if (i === 0 && staves.length > 1) y += 0.5 * S;
    });
    const hasPed = score.pedal.length > 0;
    const hasDyn = score.events.some((e) => e.dyn);
    const H = y + (hasPed ? 1.8 * S : 0) + (hasDyn ? 0.6 * S : 0) + 0.4 * S;
    const yOf = (st, step) => st.top + ((CLEF[st.clef].topStep - step) * S) / 2;

    /* displayed accidentals: key signature + accidentals carried through a bar */
    const keyAcc = keyAccidentals(score.key);
    const barOf = (t) => { let b = 0; for (const bt of score.bars) if (bt <= t + EPS) b++; return b; };
    const carried = new Map();
    for (const ev of score.events) {
      const bar = barOf(ev.t);
      for (const n of ev.notes) {
        const k = `${ev.hand}|${bar}|${n.step}`;
        const expect = carried.has(k) ? carried.get(k) : keyAcc[n.li] || 0;
        n.showAcc = n.acc !== expect || n.forceNatural ? n.acc : null;
        carried.set(k, n.acc);
      }
    }

    /* horizontal layout */
    const nKey = Math.abs(keySigList(score.key).length);
    const headerW = 4.2 * S + nKey * 1.05 * S + (score.ex.bare ? 0.5 : 3.2) * S;
    const onsets = [...new Set(score.events.map((e) => tk(e.t)))].sort((a, b) => a - b).map((k) => k / 1000);
    const accAt = new Set(score.events.filter((e) => e.notes.some((n) => n.showAcc != null)).map((e) => tk(e.t)));
    const xs = new Map();
    const barX = [];
    let x = headerW + 1.2 * S, prev = null, bi = 0;
    for (const t of onsets) {
      if (prev != null) {
        const xPrev = x;
        x += S * (2.5 + 2.7 * Math.sqrt(t - prev));
        let crossed = false;
        while (bi < score.bars.length && score.bars[bi] <= t + EPS) { bi++; crossed = true; }
        if (crossed) {
          x = Math.max(x + 1.2 * S, xPrev + 3.6 * S);
          barX.push(x - 1.6 * S - (accAt.has(tk(t)) ? 1.0 * S : 0));
        }
      }
      if (accAt.has(tk(t))) x += 1.1 * S;
      xs.set(tk(t), x);
      prev = t;
    }
    const lastEv = score.events.reduce((a, e) => (e.t + e.d > a.t + a.d ? e : a), score.events[0] || { t: 0, d: 1 });
    const endX = (xs.get(tk(lastEv.t)) || x) + S * (2.2 + 2.2 * Math.sqrt(lastEv.d));
    const W = endX + 1.5 * S;
    this.xs = xs;

    const svg = mk("svg", { class: "staff", width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    this.svg = svg;
    this.cursor = mk("rect", { class: "cursor", x: 0, y: 0, width: 2.6 * S, height: H, rx: 6, visibility: "hidden" }, svg);
    const gLines = mk("g", { class: "lines" }, svg);
    const gNotes = mk("g", { class: "notes" }, svg);
    this.groups = [];

    for (const st of staves) {
      for (let i = 0; i < 5; i++) mk("line", { x1: 0, x2: endX, y1: st.top + i * S, y2: st.top + i * S, class: "sl" }, gLines);
      (st.clef === "treble" ? trebleClef : bassClef)(gLines, 0.7 * S, st.top);
      let kx = 4.2 * S;
      for (const [li, a] of keySigList(score.key)) {
        const idx = keySigList(score.key).findIndex((p) => p[0] === li);
        const step = KEY_STEPS[st.clef][a > 0 ? 1 : "-1"][idx];
        txt(gLines, kx, yOf(st, step) + (a > 0 ? 0.55 * S : 0.35 * S), accText(a), "acc", 2.4 * S);
        kx += 1.05 * S;
      }
      const tsx = 4.2 * S + nKey * 1.05 * S + 1.3 * S;
      if (!score.ex.bare) {
        txt(gLines, tsx, st.top + 1.85 * S, String(score.num), "ts", 2.3 * S);
        txt(gLines, tsx, st.top + 3.85 * S, String(score.den), "ts", 2.3 * S);
      }
    }
    const sysTop = staves[0].top, sysBot = staves[staves.length - 1].top + 4 * S;
    mk("line", { x1: 0.5, x2: 0.5, y1: sysTop, y2: sysBot, class: "bl" }, gLines);
    for (const bx of barX) mk("line", { x1: bx, x2: bx, y1: sysTop, y2: sysBot, class: "bl" }, gLines);
    mk("line", { x1: endX - 4, x2: endX - 4, y1: sysTop, y2: sysBot, class: "bl" }, gLines);
    mk("rect", { x: endX - 2.2, y: sysTop, width: 3, height: sysBot - sysTop, class: "bl-end" }, gLines);

    /* multi-voice hands: the higher voice stems up */
    const voiceDir = {};
    for (const st of staves) {
      const means = {};
      for (const ev of score.events) if (ev.hand === st.hand && !ev.rest) {
        (means[ev.voice] ||= []).push(...ev.notes.map((n) => n.midi));
      }
      const vs = Object.keys(means);
      if (vs.length > 1) {
        const avg = (v) => means[v].reduce((a, b) => a + b, 0) / means[v].length;
        const hiV = vs.reduce((a, b) => (avg(a) > avg(b) ? a : b));
        for (const v of vs) voiceDir[st.hand + v] = v === hiV ? "up" : "down";
      }
    }

    /* beam groups: consecutive 8ths/16ths in the same beat, same hand+voice */
    const beatLen = score.den === 8 && score.num % 3 === 0 ? 1.5 : 1;
    const posInBar = (t) => {
      const rel = score.pickup > 0 ? t - score.pickup : t;
      return ((rel % score.measure) + score.measure) % score.measure;
    };
    const beams = [];
    const groupOf = new Map();
    const streams = {};
    for (const ev of score.events) (streams[ev.hand + ev.voice] ||= []).push(ev);
    for (const list of Object.values(streams)) {
      let cur = [];
      const flush = () => { if (cur.length > 1) { beams.push(cur); cur.forEach((e) => groupOf.set(e, cur)); } cur = []; };
      for (const ev of list) {
        const short = !ev.rest && (ev.dur[0] === "e" || ev.dur[0] === "s") && !ev.dur.includes(".") ;
        const beat = Math.floor((posInBar(ev.t) + EPS) / beatLen) + "|" + barOf(ev.t);
        if (!short) { flush(); continue; }
        if (cur.length && cur[0]._beat !== beat) flush();
        ev._beat = beat;
        cur.push(ev);
      }
      flush();
    }

    const stemInfo = new Map();
    const dirFor = (ev, st) => {
      if (voiceDir[ev.hand + ev.voice]) return voiceDir[ev.hand + ev.voice];
      const grp = groupOf.get(ev);
      const notes = grp ? grp.flatMap((e) => e.notes) : ev.notes;
      const hi = Math.max(...notes.map((n) => n.step)), lo = Math.min(...notes.map((n) => n.step));
      const mid = CLEF[st.clef].mid;
      return hi - mid > mid - lo ? "down" : "up";
    };

    for (const ev of score.events) {
      const st = byHand[ev.hand];
      const x0 = xs.get(tk(ev.t));
      const g = mk("g", { class: "ev", "data-t": tk(ev.t), "data-h": ev.hand }, gNotes);
      this.groups.push(g);
      if (ev.rest) {
        const isBarRest = Math.abs(ev.d - score.measure) < EPS && ev.d !== 4;
        const vd = voiceDir[ev.hand + ev.voice];
        restGlyph(g, x0, st.top + (vd === "up" ? -4 * S : vd === "down" ? 3 * S : 0), isBarRest ? "w" : ev.dur, "");
        continue;
      }
      const dir = dirFor(ev, st);
      const up = dir === "up";
      const hollow = ev.dur[0] === "w" || ev.dur[0] === "h";
      const steps = ev.notes.map((n) => n.step);
      /* seconds inside a chord: flip the upper/lower head to the other side */
      const offs = ev.notes.map(() => 0);
      for (let i = 1; i < ev.notes.length; i++) {
        if (steps[i] - steps[i - 1] === 1 && offs[i - 1] === 0) offs[up ? i : i - 1] = up ? 1.25 * S : -1.25 * S;
      }
      const c = CLEF[st.clef];
      /* ledger lines */
      const minS = Math.min(...steps), maxS = Math.max(...steps);
      const bottom = c.topStep - 8;
      const ledW = 1.1 * S;
      for (let s = bottom - 2; s >= minS; s -= 2) mk("line", { x1: x0 - ledW, x2: x0 + ledW + (offs.some((o) => o) ? 1.2 * S : 0), y1: yOf(st, s), y2: yOf(st, s), class: "ledger" }, g);
      for (let s = c.topStep + 2; s <= maxS; s += 2) mk("line", { x1: x0 - ledW, x2: x0 + ledW + (offs.some((o) => o) ? 1.2 * S : 0), y1: yOf(st, s), y2: yOf(st, s), class: "ledger" }, g);
      /* heads + accidentals + dots */
      let accCol = 0;
      ev.notes.slice().reverse().forEach((n) => {
        if (n.showAcc == null) return;
        const ay = yOf(st, n.step);
        const ax = x0 - 1.55 * S - (accCol % 2) * 0.95 * S;
        txt(g, ax, ay + (n.showAcc < 0 ? 0.35 * S : 0.55 * S), n.showAcc === 0 ? "♮" : accText(n.showAcc), "acc", 2.1 * S);
        accCol++;
      });
      ev.notes.forEach((n, i) => {
        const hy = yOf(st, n.step);
        const hx = x0 + offs[i];
        mk("ellipse", { cx: hx, cy: hy, rx: 0.66 * S, ry: 0.46 * S, transform: `rotate(-22 ${hx} ${hy})`, class: hollow ? "head hollow" : "head" }, g);
        if (ev.dur.includes(".")) {
          const dy = (c.topStep - n.step) % 2 === 0 ? -0.5 * S : 0;
          mk("circle", { cx: x0 + 1.25 * S + Math.max(0, ...offs), cy: hy + dy, r: 0.18 * S, class: "dot" }, g);
          if (ev.dur.endsWith("..")) mk("circle", { cx: x0 + 1.75 * S + Math.max(0, ...offs), cy: hy + dy, r: 0.18 * S, class: "dot" }, g);
        }
      });
      /* stem (beamed stems are finished after all groups are placed) */
      if (ev.dur[0] !== "w") {
        const yHi = yOf(st, maxS), yLo = yOf(st, minS);
        const sx = up ? x0 + 0.6 * S : x0 - 0.6 * S;
        const base = up ? yLo : yHi;
        const far = up ? yHi : yLo;
        const endY = up ? Math.min(far - 3.4 * S, st.top + 2 * S) : Math.max(far + 3.4 * S, st.top + 2 * S);
        const stem = mk("line", { x1: sx, x2: sx, y1: base, y2: endY, class: "stem" }, g);
        stemInfo.set(ev, { stem, sx, base, far, up, endY, g });
        const flags = { e: 1, s: 2 }[ev.dur[0]] || 0;
        if (flags && !groupOf.has(ev)) {
          for (let f = 0; f < flags; f++) {
            const fy = endY + (up ? f * 0.9 * S : -f * 0.9 * S);
            const d = up
              ? `M${sx},${fy} c${0.2 * S},${1.1 * S} ${1.5 * S},${1.3 * S} ${1.0 * S},${3.0 * S}`
              : `M${sx},${fy} c${0.2 * S},${-1.1 * S} ${1.5 * S},${-1.3 * S} ${1.0 * S},${-3.0 * S}`;
            mk("path", { d, class: "flag" }, g);
          }
        }
      }
      if (ev.stacc) {
        const sy = up ? yOf(st, minS) + 1.1 * S : yOf(st, maxS) - 1.1 * S;
        mk("circle", { cx: x0, cy: sy, r: 0.17 * S, class: "dot" }, g);
      }
      /* fingerings: right hand above its staff, left hand below */
      if (this.showFingers) {
        const fs = ev.notes.filter((n) => n.finger);
        if (fs.length) {
          const isR = st.hand === "R";
          let fy = isR
            ? Math.min(st.top - 0.9 * S, yOf(st, maxS) - (up ? 4.4 : 1.3) * S)
            : Math.max(st.top + 5.6 * S, yOf(st, minS) + (up ? 1.9 : 5.0) * S);
          const order = isR ? fs.slice().reverse() : fs.slice();
          const col = order.map((n) => n.finger).join(isR ? "\n" : "\n");
          order.forEach((n, i) => {
            const yy = isR ? fy - (order.length - 1 - i) * 1.25 * S : fy + i * 1.25 * S;
            txt(g, x0, yy, String(n.finger), "fing " + (isR ? "fing-r" : "fing-l"), 1.25 * S);
          });
          void col;
        }
      }
      if (ev.sym) txt(g, x0 - 0.6 * S, 1.6 * S, ev.sym, "csym", 1.45 * S);
      if (ev.dyn) {
        const dy = st.top + 4 * S + Math.min(st.down - 0.6 * S, 3.2 * S);
        txt(g, x0 - 0.5 * S, dy, ev.dyn === "cresc" ? "cresc." : ev.dyn === "dim" ? "dim." : ev.dyn, "dyn", 1.6 * S);
      }
    }

    /* beams */
    for (const grp of beams) {
      const infos = grp.map((e) => stemInfo.get(e)).filter(Boolean);
      if (infos.length < 2) continue;
      const up = infos[0].up;
      const a = infos[0], b = infos[infos.length - 1];
      let slope = (b.endY - a.endY) / (b.sx - a.sx || 1);
      slope = Math.max(-0.2, Math.min(0.2, slope));
      const yAt = (sx, off) => a.endY + slope * (sx - a.sx) + off;
      let off = 0;
      for (const inf of infos) {
        const need = up ? inf.far - 2.8 * S : inf.far + 2.8 * S;
        const y0 = yAt(inf.sx, off);
        if (up && y0 > need) off -= y0 - need;
        if (!up && y0 < need) off += need - y0;
      }
      const thick = 0.5 * S;
      const gg = infos[0].g;
      infos.forEach((inf) => inf.stem.setAttribute("y2", yAt(inf.sx, off)));
      const beamPath = (x1, x2, level) => {
        const dy = (up ? 1 : -1) * level * 0.8 * S;
        const y1 = yAt(x1, off) + dy, y2 = yAt(x2, off) + dy;
        const t = up ? thick : -thick;
        return `M${x1},${y1} L${x2},${y2} L${x2},${y2 + t} L${x1},${y1 + t} Z`;
      };
      mk("path", { d: beamPath(a.sx, b.sx, 0), class: "beam" }, gg);
      for (let i = 0; i < grp.length; i++) {
        if (grp[i].dur[0] !== "s") continue;
        const inf = infos[i];
        const nextS = i + 1 < grp.length && grp[i + 1].dur[0] === "s";
        const prevS = i > 0 && grp[i - 1].dur[0] === "s";
        if (nextS) mk("path", { d: beamPath(inf.sx, infos[i + 1].sx, 1), class: "beam" }, gg);
        else if (!prevS) {
          const toLeft = i === grp.length - 1;
          const x2 = inf.sx + (toLeft ? -1.1 : 1.1) * S;
          mk("path", { d: beamPath(Math.min(inf.sx, x2), Math.max(inf.sx, x2), 1), class: "beam" }, gg);
        }
      }
    }

    /* pedal marks */
    if (hasPed) {
      const py = sysBot + staves[staves.length - 1].down + 0.9 * S;
      let isDown = false;
      for (const p of score.pedal) {
        const px = xs.get(tk(p.t)) ?? endX - 2 * S;
        if (p.type === "down") {
          if (isDown) txt(gNotes, px - 2.4 * S, py, "*", "ped", 1.8 * S);
          txt(gNotes, px - 0.6 * S, py, "Ped.", "ped", 1.4 * S);
          isDown = true;
        } else {
          txt(gNotes, px - 1.2 * S, py, "*", "ped", 1.8 * S);
          isDown = false;
        }
      }
    }

    this.host.innerHTML = "";
    this.host.appendChild(svg);
    this.H = H;
    this.W = W;
    this._fit();
    return svg;
  }

  xOf(t) { return this.xs?.get(tk(t)); }

  /* Highlight notes at time t (optionally only these hands), mark earlier ones done. */
  highlight(t, hands = "RL", scroll = true) {
    if (!this.svg) return;
    const key = t == null ? null : tk(t);
    for (const g of this.groups) {
      const gt = +g.dataset.t, h = g.dataset.h;
      const mine = hands.includes(h);
      g.classList.toggle("cur", key != null && gt === key && mine);
      g.classList.toggle("done", key != null && gt < key);
    }
    const x = key == null ? null : this.xs.get(key);
    if (x == null) { this.cursor.setAttribute("visibility", "hidden"); return; }
    this.cursor.setAttribute("visibility", "visible");
    this.cursor.setAttribute("x", x - 1.3 * S);
    if (scroll) {
      const host = this.host;
      const target = x * this.scale - host.clientWidth * 0.33;
      if (Math.abs(host.scrollLeft - target) > 4) host.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  }
}
