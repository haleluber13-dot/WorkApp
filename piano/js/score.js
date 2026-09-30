/* Exercise notation.

   Each hand is a string of space-separated tokens (or an array of strings for
   several voices in one hand):

     C4-1q        note C4, finger 1, quarter note
     F#3-2h.      dotted half      (w h q e s = whole/half/quarter/eighth/16th)
     C4-1+E4-3+G4-5w   chord: notes joined with "+", duration at the end
     rq / rh.     rests
     E4-3e'       trailing ' = staccato
     |            bar line (ignored; bars come from the time signature)
     !p !mf !f    dynamics for the next note      !ped  pedal down/change
     !*           pedal up                        "Am7" chord symbol (_ = space)

   Durations are sticky: a token without one reuses the previous duration. */

import { parseNote } from "./theory.js";

const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
const DYN_VEL = { pp: 0.3, p: 0.42, mp: 0.55, mf: 0.68, f: 0.82, ff: 0.95 };
const EPS = 1e-6;

function parseDur(code) {
  const base = DUR[code[0]];
  const dots = code.length - 1;
  return base * (dots === 2 ? 1.75 : dots === 1 ? 1.5 : 1);
}

export function parseVoice(str, hand, voice = 0) {
  const events = [];
  const pedal = [];
  let t = 0, cur = "q", dyn = null, vel = 0.68, sym = null, ped = false;
  for (const raw of str.trim().split(/\s+/)) {
    if (!raw || raw === "|") continue;
    if (raw.startsWith("!")) {
      const m = raw.slice(1);
      if (m === "ped") ped = true;
      else if (m === "*") pedal.push({ t, type: "up", hand });
      else if (DYN_VEL[m] != null) { dyn = m; vel = DYN_VEL[m]; }
      else if (m === "cresc" || m === "dim") dyn = m;
      continue;
    }
    if (raw.startsWith('"')) { sym = raw.replace(/"/g, "").replace(/_/g, " "); continue; }
    let tok = raw;
    let stacc = false;
    if (tok.endsWith("'")) { stacc = true; tok = tok.slice(0, -1); }
    const dm = /([whqes]\.{0,2})$/.exec(tok);
    if (dm && !/^[A-G]/.test(tok.slice(-dm[1].length))) {
      cur = dm[1];
      tok = tok.slice(0, -dm[1].length);
    }
    const d = parseDur(cur);
    const ev = { t, d, dur: cur, hand, voice, notes: [], rest: false, stacc, vel };
    if (dyn) { ev.dyn = dyn; dyn = null; }
    if (sym) { ev.sym = sym; sym = null; }
    if (ped) { pedal.push({ t, type: "down", hand }); ev.ped = true; ped = false; }
    if (tok === "r") {
      ev.rest = true;
    } else {
      for (const part of tok.split("+")) {
        const m = /^([A-G](?:bb|b|#|x|n)?-?\d)(?:-(\d))?$/.exec(part);
        if (!m) throw new Error(`Bad token "${raw}"`);
        const n = parseNote(m[1]);
        n.finger = m[2] ? +m[2] : null;
        n.hand = hand;
        ev.notes.push(n);
      }
      ev.notes.sort((a, b) => a.midi - b.midi);
    }
    events.push(ev);
    t += d;
  }
  return { events, pedal, end: t };
}

/* Exercise definition -> parsed score shared by the staff, player and matcher. */
export function parseExercise(ex) {
  const [num, den] = (ex.ts || "4/4").split("/").map(Number);
  const measure = (num * 4) / den;
  const pickup = ex.pickup || 0;
  const events = [];
  const pedal = [];
  let end = 0;
  const hands = [];
  for (const [key, hand] of [["rh", "R"], ["lh", "L"]]) {
    if (!ex[key]) continue;
    hands.push(hand);
    const voices = Array.isArray(ex[key]) ? ex[key] : [ex[key]];
    voices.forEach((v, i) => {
      const p = parseVoice(v, hand, i);
      events.push(...p.events);
      pedal.push(...p.pedal);
      end = Math.max(end, p.end);
    });
  }
  events.sort((a, b) => a.t - b.t || (a.hand === "R" ? -1 : 1));
  pedal.sort((a, b) => a.t - b.t);
  const bars = [];
  for (let b = pickup > 0 ? pickup : measure; b < end - EPS; b += measure) bars.push(b);
  return {
    ex, events, pedal, end, measure, pickup, num, den, hands,
    key: ex.key || "C", tempo: ex.tempo || 80, bars,
  };
}

/* Steps are the moments you have to press something. `hands` filters which
   hand's notes you are responsible for ("RL", "R" or "L"). */
export function buildSteps(score, hands = "RL") {
  const map = new Map();
  for (const ev of score.events) {
    if (ev.rest || !hands.includes(ev.hand)) continue;
    const k = Math.round(ev.t / EPS);
    if (!map.has(k)) map.set(k, { t: ev.t, notes: [], events: [] });
    const s = map.get(k);
    s.events.push(ev);
    for (const n of ev.notes) if (!s.notes.some((x) => x.midi === n.midi)) s.notes.push(n);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).map((s, i) => {
    s.i = i;
    s.notes.sort((a, b) => a.midi - b.midi);
    return s;
  });
}

export function scoreRange(score) {
  let lo = 127, hi = 0;
  for (const ev of score.events) for (const n of ev.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
  if (lo > hi) return [60, 72];
  return [lo, hi];
}

/* When does the pedal let go of a note that starts at t? */
export function pedalRelease(score, t, noteEnd) {
  let down = false, releaseAt = noteEnd;
  for (const p of score.pedal) {
    if (p.t <= t + EPS) { down = p.type === "down"; continue; }
    if (down) { releaseAt = Math.max(noteEnd, p.t); }
    break;
  }
  if (down && releaseAt === noteEnd) {
    const next = score.pedal.find((p) => p.t > t + EPS);
    releaseAt = Math.max(noteEnd, next ? next.t : score.end + 1);
  }
  return releaseAt;
}
