/* Sound: a small additive piano synth (no samples to download, works offline)
   plus a metronome click. Partials are slightly stretched like real piano
   strings and the upper ones die away faster, which is most of what makes a
   sine stack sound like a struck string instead of an organ. */

import { freq } from "./theory.js";

let ctx = null, out = null, volume = 0.8;

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    out = ctx.createGain();
    out.gain.value = volume;
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setVolume(v) { volume = v; if (out) out.gain.value = v; }
export const now = () => audio().currentTime;

const PARTIALS = [1, 0.55, 0.32, 0.2, 0.12, 0.08, 0.05];
const live = new Map(); // midi -> voice, for note-offs from MIDI/touch

export function playNote(midi, { when = 0, dur = 1, vel = 0.7, sustain = false } = {}) {
  const c = audio();
  const t0 = Math.max(c.currentTime, when || c.currentTime);
  const f = freq(midi);
  const B = 0.0004 * Math.pow(2, (midi - 60) / 24);
  const decay = Math.min(9, Math.max(0.9, 4.2 * Math.pow(261.6 / f, 0.55)));
  const bright = Math.min(1, Math.max(0.25, 0.35 + vel * 0.8));
  const g = c.createGain();
  g.gain.value = 0;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(16000, f * (5 + 12 * vel)), t0);
  lp.frequency.exponentialRampToValueAtTime(Math.min(16000, f * 3 + 400), t0 + decay * 0.7);
  g.connect(lp).connect(out);
  const oscs = [];
  const maxP = f > 1500 ? 3 : f > 800 ? 5 : PARTIALS.length;
  for (let n = 1; n <= maxP; n++) {
    const fn = f * n * Math.sqrt(1 + B * n * n);
    if (fn > 18000) break;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = fn;
    const pg = c.createGain();
    const amp = PARTIALS[n - 1] * Math.pow(bright, n - 1);
    pg.gain.setValueAtTime(amp, t0);
    pg.gain.exponentialRampToValueAtTime(Math.max(amp * 0.02, 1e-5), t0 + decay / Math.pow(n, 0.8));
    o.connect(pg).connect(g);
    o.start(t0);
    oscs.push(o);
  }
  const peak = 0.22 * Math.pow(vel, 1.4) * (f < 120 ? 1.3 : 1);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(peak * 0.001, t0 + decay * 1.6);
  const voice = { g, oscs, t0, stopped: false };
  const stop = (at) => {
    if (voice.stopped) return;
    voice.stopped = true;
    const t = Math.max(at, c.currentTime);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 1e-5), t);
    g.gain.setTargetAtTime(0, t, 0.06);
    oscs.forEach((o) => o.stop(t + 0.5));
  };
  voice.stop = stop;
  if (!sustain) stop(t0 + Math.max(0.08, dur));
  else {
    live.get(midi)?.stop(c.currentTime);
    live.set(midi, voice);
    oscs.forEach((o) => o.stop(t0 + decay * 1.7));
  }
  return voice;
}

export function noteOff(midi) {
  const v = live.get(midi);
  if (v) { v.stop(audio().currentTime); live.delete(midi); }
}

export function playChord(midis, opts = {}) { midis.forEach((m) => playNote(m, opts)); }

export function click(when, accent = false) {
  const c = audio();
  const t = Math.max(c.currentTime, when);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = accent ? 1760 : 1180;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(accent ? 0.16 : 0.09, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.06);
}

/* A cancellable look-ahead scheduler: `items` are {at (seconds from start), fn(whenAbs)}. */
export function schedule(items, { onEnd, lead = 0.12 } = {}) {
  const c = audio();
  const start = c.currentTime + lead;
  let i = 0, stopped = false;
  items.sort((a, b) => a.at - b.at);
  const tick = () => {
    if (stopped) return;
    const horizon = c.currentTime + 0.15;
    while (i < items.length && start + items[i].at <= horizon) {
      items[i].fn(start + items[i].at);
      i++;
    }
    if (i >= items.length) {
      const last = items.length ? items[items.length - 1].at : 0;
      const wait = Math.max(0, (start + last - c.currentTime) * 1000);
      timer = setTimeout(() => { if (!stopped && onEnd) onEnd(); }, wait + 50);
      return;
    }
    timer = setTimeout(tick, 25);
  };
  let timer = setTimeout(tick, 0);
  return {
    start,
    stop() { stopped = true; clearTimeout(timer); },
    get stopped() { return stopped; },
  };
}
