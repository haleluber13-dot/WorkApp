/* Otiyot — the synthesiser.
 *
 * One Voices object builds a whole signal chain on any BaseAudioContext, so the
 * same code drives live playback (AudioContext) and file rendering
 * (OfflineAudioContext). Nothing here knows about Hebrew; it just plays notes.
 *
 * The voices themselves are simple; everything after them — drive, bitcrush,
 * filter, chorus, sidechain, delay, reverb, width — lives in the FxRack.
 */

import { midiToFreq } from './mapping.js';
import { FxRack, defaultFx } from './fx.js';

function noiseBuffer(ctx, seconds = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* Soft clipping. At amount 0 this is a straight line, so the node can stay in
 * the chain permanently and simply do nothing. */
function driveCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = amount * amount * 90;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
}

/* Ten kick drums, all the same synthesis with different numbers:
 *   f0/f1  the pitch sweep, bend  how long it takes
 *   dec    how long the body rings, click  the transient on top
 *   dist   soft-clip amount, 0 for none */
export const KICKS = {
  kick_psy:    { name: 'Psy',      f0: 240, f1: 46, bend: 0.04,  dec: 0.30, click: 0.5,  dist: 0 },
  kick_dark:   { name: 'Dark',     f0: 215, f1: 37, bend: 0.065, dec: 0.58, click: 0.35, dist: 0.45 },
  kick_forest: { name: 'Forest',   f0: 285, f1: 53, bend: 0.022, dec: 0.17, click: 0.85, dist: 0.25 },
  kick_punch:  { name: 'Punch',    f0: 190, f1: 50, bend: 0.05,  dec: 0.32, click: 0.7,  dist: 0 },
  kick_soft:   { name: 'Soft',     f0: 140, f1: 48, bend: 0.08,  dec: 0.38, click: 0.25, dist: 0 },
  kick_808:    { name: '808',      f0: 150, f1: 36, bend: 0.10,  dec: 0.95, click: 0.2,  dist: 0 },
  kick_dist:   { name: 'Distorted',f0: 300, f1: 44, bend: 0.03,  dec: 0.24, click: 0.9,  dist: 0.9 },
  kick_gabber: { name: 'Gabber',   f0: 420, f1: 41, bend: 0.018, dec: 0.34, click: 1.0,  dist: 1.0 },
  kick_sub:    { name: 'Sub',      f0: 110, f1: 33, bend: 0.13,  dec: 0.72, click: 0.05, dist: 0 },
  kick_click:  { name: 'Click',    f0: 205, f1: 58, bend: 0.018, dec: 0.13, click: 1.0,  dist: 0.15 },
};

/* Seven bass timbres. The pattern comes from the style; this is the sound. */
export const BASSES = {
  rollbass:  { name: 'Roll',    blurb: 'Short, filtered, gone before the next kick.' },
  subbass:   { name: '808 sub', blurb: 'Pure sine that glides in from the last note.' },
  bass:      { name: 'Round',   blurb: 'Soft sine and triangle. Sits under everything.' },
  reese:     { name: 'Reese',   blurb: 'Detuned saws beating against each other.' },
  fmbass:    { name: 'FM growl', blurb: 'Two operators; the growl opens as it hits.' },
  squelch:   { name: 'Squelch', blurb: 'High resonance and a fast sweep — forest burble.' },
  pluckbass: { name: 'Pluck',   blurb: 'Tight and muted, almost a fingered string.' },
};

export class Voices {
  /**
   * @param {BaseAudioContext} ctx
   * @param {object} opt {reverb, tone, drive, delay, feedback, analyser}
   */
  constructor(ctx, opt = {}) {
    this.ctx = ctx;
    this.opt = { tone: 0.5, ...opt };

    // Everything downstream of the voices lives in the rack.
    this.rack = new FxRack(ctx, opt.fx || defaultFx());
    this.master = this.rack.input;         // what every voice connects to
    this.out = this.rack.volume;           // what the transport fades
    this.rack.setVolume(opt.volume ?? 0.9);

    if (opt.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;
      this.rack.comp.connect(this.analyser);
    }

    this.noise = noiseBuffer(ctx, 1);
    this.buffers = opt.buffers || new Map();   // sampleId -> AudioBuffer
    this.lastBass = null;                      // for 808 glides

    // Nodes still in the graph, with the time each becomes dead. Web Audio
    // keeps processing a gain or filter for as long as it stays connected,
    // even after its oscillators have stopped, so finished notes must be
    // unhooked or a long piece slows to a crawl.
    this._live = [];
  }

  _track(end, nodes) { this._live.push({ end, nodes }); }

  /** Disconnect every note that finished before `time`. */
  sweep(time) {
    if (!this._live.length) return;
    const keep = [];
    for (const e of this._live) {
      if (e.end <= time) {
        for (const n of e.nodes) { try { n.disconnect(); } catch (_) { /* already gone */ } }
      } else keep.push(e);
    }
    this._live = keep;
  }

  setVolume(x) { this.rack.setVolume(x); }
  setFx(id, param, value) { this.rack.set(id, param, value); }
  setFxEnabled(id, on) { this.rack.setEnabled(id, on); }
  replaceFx(settings) { this.rack.replace(settings); }
  setTone(x) { this.opt.tone = x; }

  /** Schedule one note. `when` is an absolute context time. */
  play(note, when) {
    if (note.kick) this.rack.duck(when);
    switch (note.voice) {
      case 'sample': return this._sample(note, when);
      // pitched
      case 'bass': return this._bass(note, when);
      case 'subbass': return this._sub(note, when);
      case 'rollbass': return this._roll(note, when);
      case 'reese': return this._reese(note, when);
      case 'fmbass': return this._fmbass(note, when);
      case 'squelch': return this._squelch(note, when);
      case 'pluckbass': return this._pluckbass(note, when);
      case 'pad': return this._pad(note, when);
      case 'acid': return this._acid(note, when);
      case 'saw': return this._saw(note, when);
      case 'bell': return this._bell(note, when);
      case 'rhodes': return this._rhodes(note, when);
      case 'stab': return this._stab(note, when);
      // drums
      case 'kick_psy': return this._kick(note, when, KICKS.kick_psy);
      case 'kick_808': return this._kick(note, when, KICKS.kick_808);
      case 'kick_punch': return this._kick(note, when, KICKS.kick_punch);
      case 'kick_soft': return this._kick(note, when, KICKS.kick_soft);
      case 'kick_dist': return this._kick(note, when, KICKS.kick_dist);
      case 'kick_dark': return this._kick(note, when, KICKS.kick_dark);
      case 'kick_forest': return this._kick(note, when, KICKS.kick_forest);
      case 'kick_gabber': return this._kick(note, when, KICKS.kick_gabber);
      case 'kick_sub': return this._kick(note, when, KICKS.kick_sub);
      case 'kick_click': return this._kick(note, when, KICKS.kick_click);
      case 'snare': return this._snare(note, when);
      case 'clap': return this._clap(note, when);
      case 'hat': return this._hat(note, when, 0.035, 8500);
      case 'ohat': return this._hat(note, when, 0.24, 7000);
      case 'perc': return this._perc(note, when);
      case 'tick': return this._tick(note, when, 0.24);
      case 'tav': return this._drum(note, when);
      default: return this._lead(note, when);
    }
  }

  /* ------------------------------------------------------------- pitched */

  /* A plucked, struck tone — two detuned oscillators through a filter that
   * closes as the note decays, plus a sine for the body. */
  _lead(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.08, note.dur);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';

    const bright = 1 + this.opt.tone * 3;
    filt.frequency.setValueAtTime(Math.min(16000, f * 7 * bright), when);
    filt.frequency.exponentialRampToValueAtTime(
      Math.max(160, f * 1.6), when + Math.min(dur, 1.1));
    filt.Q.value = 1.1;

    const peak = 0.22 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.32, when + Math.min(dur * 0.5, 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.28);

    const shapes = this.opt.tone > 0.66 ? ['sawtooth', 'square']
                 : this.opt.tone > 0.33 ? ['triangle', 'sawtooth']
                 : ['triangle', 'sine'];
    const oscs = [];
    shapes.forEach((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = i === 0 ? -4 : 5;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 1 : 0.42;
      o.connect(og).connect(filt);
      oscs.push(o);
    });

    // A touch of body an octave down so low notes are not all click.
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.value = f / 2;
    const bg = ctx.createGain();
    bg.gain.value = 0.3;
    body.connect(bg).connect(filt);
    oscs.push(body);

    filt.connect(g).connect(this.master);
    const stop = when + dur + 0.32;
    oscs.forEach(o => { o.start(when); o.stop(stop); });
    this._track(stop, [filt, g, bg, ...oscs]);
  }

  /* TB-303 in spirit: one saw, one very resonant lowpass, and an envelope on
   * the cutoff that opens hard and shuts fast. */
  _acid(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.05, note.dur);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 14 + this.opt.tone * 10;
    const base = 180 + this.opt.tone * 420;
    const top = Math.min(11000, base + 2600 + (note.vel ?? 0.8) * 4200);
    filt.frequency.setValueAtTime(top, when);
    filt.frequency.exponentialRampToValueAtTime(base, when + Math.min(dur * 1.6, 0.42));

    const g = ctx.createGain();
    const peak = 0.2 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    g.gain.setValueAtTime(peak, when + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.06);

    o.connect(filt).connect(g).connect(this.master);
    const stop = when + dur + 0.1;
    o.start(when); o.stop(stop);
    this._track(stop, [o, filt, g]);
  }

  /* Three detuned saws — the festival lead. */
  _saw(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.05, note.dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 3;
    filt.frequency.setValueAtTime(Math.min(13000, f * 9), when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.4), when + dur + 0.05);

    const g = ctx.createGain();
    const peak = 0.14 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.setValueAtTime(peak, when + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);

    const oscs = [];
    for (const det of [-11, 0, 11]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      oscs.push(o);
    }
    filt.connect(g).connect(this.master);
    const stop = when + dur + 0.12;
    oscs.forEach(o => { o.start(when); o.stop(stop); });
    this._track(stop, [filt, g, ...oscs]);
  }

  /* FM bell — two operators at an inharmonic ratio, long decay. */
  _bell(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.15, note.dur);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 2.76;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 2.4, when);
    modG.gain.exponentialRampToValueAtTime(f * 0.08, when + Math.min(dur, 1.4));
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    const peak = 0.19 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 1.1);

    car.connect(g).connect(this.master);
    const stop = when + dur + 1.2;
    car.start(when); mod.start(when);
    car.stop(stop); mod.stop(stop);
    this._track(stop, [car, mod, modG, g]);
  }

  /* FM electric piano — softer ratio, gentler envelope. */
  _rhodes(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.1, note.dur);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 2;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 1.5, when);
    modG.gain.exponentialRampToValueAtTime(f * 0.05, when + Math.min(dur, 0.8));
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    const peak = 0.2 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 0.4, when + Math.min(dur, 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);

    car.connect(g).connect(this.master);
    const stop = when + dur + 0.6;
    car.start(when); mod.start(when);
    car.stop(stop); mod.stop(stop);
    this._track(stop, [car, mod, modG, g]);
  }

  /* Short filtered chord stab. */
  _stab(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.05, note.dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 5;
    filt.frequency.setValueAtTime(Math.min(9000, f * 8), when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.8), when + dur * 0.8 + 0.03);

    const g = ctx.createGain();
    const peak = 0.16 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.1);

    const oscs = [];
    for (const [type, det] of [['sawtooth', -6], ['square', 7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      oscs.push(o);
    }
    filt.connect(g).connect(this.master);
    const stop = when + dur + 0.14;
    oscs.forEach(o => { o.start(when); o.stop(stop); });
    this._track(stop, [filt, g, ...oscs]);
  }

  /* A round, slow bass note. */
  _bass(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.12, note.dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    o2.detune.value = 6;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;

    const g = ctx.createGain();
    const peak = 0.3 * (note.vel ?? 0.5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.05);
    g.gain.setValueAtTime(peak, when + Math.max(0.06, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.14);

    const mix = ctx.createGain();
    mix.gain.value = 0.6;
    o.connect(mix); o2.connect(mix);
    mix.connect(lp).connect(g).connect(this.master);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.2); o2.stop(when + dur + 0.2);
    this._track(when + dur + 0.2, [o, o2, mix, lp, g]);
  }

  /* 808 sub: a near-pure sine that glides in from the previous note. */
  _sub(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.15, note.dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const from = note.glide && this.lastBass ? midiToFreq(this.lastBass) : f;
    o.frequency.setValueAtTime(from, when);
    if (from !== f) o.frequency.exponentialRampToValueAtTime(f, when + 0.07);
    this.lastBass = note.midi;

    // A little saturation gives the sub something to show on small speakers.
    const shape = ctx.createWaveShaper();
    shape.curve = driveCurve(0.25);

    const g = ctx.createGain();
    const peak = 0.42 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.setValueAtTime(peak, when + Math.max(0.05, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.12);

    o.connect(shape).connect(g).connect(this.master);
    const stop = when + dur + 0.16;
    o.start(when); o.stop(stop);
    this._track(stop, [o, shape, g]);
  }

  /* The psytrance offbeat: short, filtered, gone before the next kick. */
  _roll(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.04, note.dur);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(2000, f * 9), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 2.2), when + dur);
    lp.Q.value = 4;

    const g = ctx.createGain();
    const peak = 0.34 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const mix = ctx.createGain();
    mix.gain.value = 0.55;
    o.connect(mix); o2.connect(mix);
    mix.connect(lp).connect(g).connect(this.master);
    const stop = when + dur + 0.04;
    o.start(when); o2.start(when); o.stop(stop); o2.stop(stop);
    this._track(stop, [o, o2, mix, lp, g]);
  }

  /* Two saws a few cents apart, beating against each other. The interference
   * is the sound; a slow drift on one of them keeps it moving. */
  _reese(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.1, note.dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1400, f * 12);
    lp.Q.value = 2;

    const g = ctx.createGain();
    const peak = 0.3 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
    g.gain.setValueAtTime(peak, when + Math.max(0.03, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.1);

    const oscs = [];
    for (const det of [-14, 3, 16]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      oscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg).connect(oscs[2].detune);
    oscs.push(lfo);

    lp.connect(g).connect(this.master);
    const stop = when + dur + 0.14;
    oscs.forEach(o => { o.start(when); o.stop(stop); });
    this._track(stop, [lp, g, lg, ...oscs]);
  }

  /* FM growl: the modulator's envelope opens the timbre as the note lands. */
  _fmbass(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.08, note.dur);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 1.5;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 4.5, when);
    modG.gain.exponentialRampToValueAtTime(f * 0.4, when + Math.min(dur, 0.3));
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    const peak = 0.34 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);

    car.connect(g).connect(this.master);
    const stop = when + dur + 0.12;
    car.start(when); mod.start(when); car.stop(stop); mod.stop(stop);
    this._track(stop, [car, mod, modG, g]);
  }

  /* Very high resonance and a fast sweep — the burbling forest bass. */
  _squelch(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.04, note.dur);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 20;
    const top = Math.min(4200, f * 16 + 700);
    lp.frequency.setValueAtTime(top, when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(90, f * 1.4), when + Math.min(dur * 1.3, 0.2));

    const g = ctx.createGain();
    const peak = 0.24 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.03);

    o.connect(lp).connect(g).connect(this.master);
    const stop = when + dur + 0.06;
    o.start(when); o.stop(stop);
    this._track(stop, [o, lp, g]);
  }

  /* Tight and muted, close to a fingered string. */
  _pluckbass(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.05, note.dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(3000, f * 11), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(110, f * 2), when + Math.min(dur, 0.18));
    lp.Q.value = 3;

    const g = ctx.createGain();
    const peak = 0.32 * (note.vel ?? 0.8);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    g.gain.exponentialRampToValueAtTime(peak * 0.25, when + Math.min(dur * 0.6, 0.16));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.05);

    const oscs = [];
    for (const [type, gain] of [['triangle', 1], ['sawtooth', 0.35]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og).connect(lp);
      oscs.push(o, og);
    }
    lp.connect(g).connect(this.master);
    const stop = when + dur + 0.08;
    oscs.filter(n => n.frequency).forEach(o => { o.start(when); o.stop(stop); });
    this._track(stop, [lp, g, ...oscs]);
  }

  /* A breathing pad that swells under a whole verse. */
  _pad(note, when) {
    const ctx = this.ctx;
    const f = midiToFreq(note.midi);
    const dur = Math.max(0.4, note.dur);
    const g = ctx.createGain();
    const peak = 0.1 * (note.vel ?? 0.16);
    const rise = Math.min(dur * 0.4, 1.2);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + rise);
    g.gain.setValueAtTime(peak, when + Math.max(rise + 0.05, dur - 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.Q.value = 0.6;

    const oscs = [];
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = i ? 8 : -8;
      const og = ctx.createGain();
      og.gain.value = 0.4;
      o.connect(og).connect(lp);
      oscs.push(o);
    }
    lp.connect(g).connect(this.master);
    oscs.forEach(o => { o.start(when); o.stop(when + dur + 0.6); });
    this._track(when + dur + 0.6, [lp, g, ...oscs]);
  }

  /* A recorded or imported clip, fired from a pad. */
  _sample(note, when) {
    const buf = note.buffer || this.buffers.get(note.sampleId);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.05, note.rate || 1);
    const g = ctx.createGain();
    const peak = 0.9 * (note.vel ?? 0.8) * (note.gain ?? 1);
    g.gain.setValueAtTime(peak, when);

    const offset = Math.min(Math.max(0, note.start || 0), Math.max(0, buf.duration - 0.01));
    // A one-shot pad is cut at the next trigger; otherwise the clip runs on.
    const span = note.oneShot && note.dur
      ? Math.min(note.dur, buf.duration - offset)
      : buf.duration - offset;
    // A short fade at each end so trimming never clicks.
    g.gain.setValueAtTime(peak, when + Math.max(0.01, span - 0.012));
    g.gain.linearRampToValueAtTime(0.0001, when + span);

    src.connect(g).connect(this.master);
    src.start(when, offset);
    src.stop(when + span + 0.02);
    this._track(when + span + 0.04, [src, g]);
  }

  /* --------------------------------------------------------------- drums */

  _kick(note, when, k) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(k.f0, when);
    o.frequency.exponentialRampToValueAtTime(k.f1, when + k.bend);

    const g = ctx.createGain();
    const peak = 0.62 * (note.vel ?? 0.9);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + k.dec);

    let tail = g;
    const extra = [];
    if (k.dist > 0) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(k.dist);
      ws.oversample = '4x';
      g.connect(ws);
      tail = ws;
      extra.push(ws);
    }
    o.connect(g);
    tail.connect(this.master);

    // Click transient so the kick cuts through on small speakers.
    if (k.click > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.16 * k.click * (note.vel ?? 0.9), when);
      cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
      src.connect(hp).connect(cg).connect(this.master);
      src.start(when); src.stop(when + 0.04);
      extra.push(src, hp, cg);
    }

    const stop = when + k.dec + 0.05;
    o.start(when); o.stop(stop);
    this._track(stop, [o, g, ...extra]);
  }

  _snare(note, when) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    const peak = 0.3 * (note.vel ?? 0.8);
    ng.gain.setValueAtTime(peak, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    src.connect(bp).connect(ng).connect(this.master);
    src.start(when); src.stop(when + 0.2);

    // A tuned body under the noise so it reads as a drum, not a hiss.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, when);
    o.frequency.exponentialRampToValueAtTime(150, when + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(peak * 0.5, when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
    o.connect(og).connect(this.master);
    o.start(when); o.stop(when + 0.12);

    this._track(when + 0.22, [src, bp, ng, o, og]);
  }

  _clap(note, when) {
    const ctx = this.ctx;
    const peak = 0.26 * (note.vel ?? 0.8);
    const nodes = [];
    // Three quick bursts and a longer tail — how a clap actually behaves.
    for (const [off, amp, dec] of [[0, 0.8, 0.02], [0.011, 0.9, 0.02], [0.022, 1, 0.13]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak * amp, when + off);
      g.gain.exponentialRampToValueAtTime(0.0001, when + off + dec);
      src.connect(bp).connect(g).connect(this.master);
      src.start(when + off); src.stop(when + off + dec + 0.02);
      nodes.push(src, bp, g);
    }
    this._track(when + 0.2, nodes);
  }

  _hat(note, when, dec, hz) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hz;
    const g = ctx.createGain();
    const peak = 0.14 * (note.vel ?? 0.6);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
    src.connect(hp).connect(g).connect(this.master);
    src.start(when); src.stop(when + dec + 0.02);
    this._track(when + dec + 0.03, [src, hp, g]);
  }

  _perc(note, when) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 5;
    const g = ctx.createGain();
    const peak = 0.13 * (note.vel ?? 0.5);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    src.connect(bp).connect(g).connect(this.master);
    src.start(when); src.stop(when + 0.09);
    this._track(when + 0.1, [src, bp, g]);
  }

  /* A soft brush on every word boundary (Ambient Scroll only). */
  _tick(note, when, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    const peak = 0.06 * (note.vel ?? gain);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    src.connect(bp).connect(g).connect(this.master);
    src.start(when);
    src.stop(when + 0.1);
    this._track(when + 0.1, [src, bp, g]);
  }

  /* A low frame-drum hit at the end of each verse. */
  _drum(note, when) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, when);
    o.frequency.exponentialRampToValueAtTime(52, when + 0.16);
    const g = ctx.createGain();
    const peak = 0.34 * (note.vel ?? 0.5);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    o.connect(g).connect(this.master);
    o.start(when);
    o.stop(when + 0.45);
    this._track(when + 0.45, [o, g]);

    this._tick({ vel: 0.5 }, when, 0.5);
  }
}

/* ------------------------------------------------------------- transport */

/* Look-ahead scheduler: a timer wakes every 25 ms and hands the synth every
 * note that starts within the next 120 ms, so timing comes from the audio
 * clock rather than from setInterval. */
export class Transport {
  constructor() {
    this.ctx = null;
    this.voices = null;
    this.score = null;
    this.ptr = 0;
    this.startedAt = 0;
    this.offset = 0;
    this.timer = null;
    this.playing = false;
    this.onTick = null;
    this.onEnd = null;
    this.settings = { volume: 0.9, tone: 0.5 };
    this.fx = null;                 // FxRack settings, owned by the app
    this.buffers = new Map();       // sampleId -> AudioBuffer
  }

  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.voices = new Voices(this.ctx, {
        ...this.settings, analyser: true, fx: this.fx, buffers: this.buffers,
      });
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  load(score) {
    this.score = score;
    this.ptr = 0;
    this.offset = 0;
  }

  /** Swap the whole effects rack — used when the style or a knob changes. */
  setFx(settings) {
    this.fx = settings;
    this.voices?.replaceFx(settings);
  }

  get position() {
    if (!this.playing) return this.offset;
    return this.ctx.currentTime - this.startedAt + this.offset;
  }

  async play(from = null) {
    if (!this.score) return;
    await this.ensure();
    if (from !== null) this.seek(from);
    // pause() fades the master out; undo that before we start again.
    const g = this.voices.out.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(this.settings.volume, this.ctx.currentTime);
    this.startedAt = this.ctx.currentTime + 0.06;
    this.playing = true;
    this._loop();
    this.timer = setInterval(() => this._loop(), 25);
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    // Let scheduled tails ring out rather than cutting them dead.
    if (this.voices) {
      const g = this.voices.out.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + 0.08);
      setTimeout(() => {
        if (!this.playing) g.setValueAtTime(this.settings.volume, this.ctx.currentTime);
      }, 140);
    }
  }

  stop() {
    this.pause();
    this.offset = 0;
    this.ptr = 0;
  }

  seek(seconds) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.offset = Math.max(0, seconds);
    this.ptr = 0;
    const notes = this.score.notes;
    while (this.ptr < notes.length && notes[this.ptr].t < this.offset) this.ptr++;
    if (wasPlaying) this.play();
  }

  _loop() {
    if (!this.playing) return;
    const notes = this.score.notes;
    const now = this.position;
    const horizon = now + 0.12;

    while (this.ptr < notes.length && notes[this.ptr].t < horizon) {
      const n = notes[this.ptr++];
      const when = this.startedAt + (n.t - this.offset);
      if (when >= this.ctx.currentTime - 0.02) this.voices.play(n, Math.max(when, this.ctx.currentTime));
    }

    // Unhook notes that have finished, so an hour-long piece plays as cheaply
    // as the first minute does.
    this.voices.sweep(this.ctx.currentTime - 0.5);

    if (this.onTick) this.onTick(now);

    if (this.ptr >= notes.length && now > this.score.duration + 0.4) {
      this.stop();
      if (this.onEnd) this.onEnd();
    }
  }
}

/* --------------------------------------------------------------- offline */

/** Render a score to an AudioBuffer, for WAV export.
 *
 * Rendering is much slower than scheduling, so progress comes from suspending
 * the offline context at intervals rather than from counting notes — otherwise
 * the bar would race to the end and then sit there for the real work. */
export async function render(score, settings, onProgress) {
  const sampleRate = 44100;
  const total = score.duration + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const voices = new Voices(ctx, { ...settings, analyser: false });
  voices.setVolume(settings.volume ?? 0.9);

  // Suspend the render every couple of seconds. Each stop is used to schedule
  // the next few seconds of notes and to unhook the ones that have finished,
  // which keeps the number of live nodes flat instead of growing with the
  // length of the piece. Scheduling everything up front instead would leave
  // every node connected for the whole render and make the cost quadratic.
  const notes = score.notes;
  const AHEAD = 4;
  let ptr = 0;
  const schedule = until => {
    while (ptr < notes.length && notes[ptr].t < until) {
      const n = notes[ptr++];
      voices.play(n, n.t + 0.05);
    }
  };

  schedule(AHEAD);
  const stride = 2;
  const steps = Math.max(1, Math.ceil(total / stride));
  for (let i = 1; i < steps; i++) {
    const at = i * stride;
    ctx.suspend(at).then(() => {
      schedule(at + AHEAD);
      voices.sweep(at - 0.5);
      if (onProgress) onProgress(at / total);
      ctx.resume();
    });
  }
  if (onProgress) onProgress(0);

  const buf = await ctx.startRendering();
  if (onProgress) onProgress(1);
  return buf;
}
