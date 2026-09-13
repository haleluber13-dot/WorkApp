/* Otiyot — the synthesiser.
 *
 * One Voices object builds a whole signal chain on any BaseAudioContext, so the
 * same code drives live playback (AudioContext) and file rendering
 * (OfflineAudioContext). Nothing here knows about Hebrew; it just plays notes.
 */

import { midiToFreq } from './mapping.js';

/* A short, cheap reverb: exponentially decaying noise as an impulse response.
 * Cheaper than shipping an impulse file and good enough for a stone-room feel. */
function impulse(ctx, seconds = 2.6, decay = 2.4) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

function noiseBuffer(ctx, seconds = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export class Voices {
  /**
   * @param {BaseAudioContext} ctx
   * @param {object} opt  {reverb, tone, analyser}
   */
  constructor(ctx, opt = {}) {
    this.ctx = ctx;
    this.opt = { reverb: 0.32, tone: 0.5, ...opt };

    const master = ctx.createGain();
    master.gain.value = 0.9;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.gain.value = 1 - this.opt.reverb * 0.5;
    wet.gain.value = this.opt.reverb;

    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx);

    // A gentle high shelf keeps the plucks from getting glassy in the tail.
    const damp = ctx.createBiquadFilter();
    damp.type = 'highshelf';
    damp.frequency.value = 3200;
    damp.gain.value = -6;

    master.connect(dry).connect(comp);
    master.connect(conv).connect(damp).connect(wet).connect(comp);
    comp.connect(ctx.destination);

    if (opt.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;
      comp.connect(this.analyser);
    }

    this.master = master;
    this.dry = dry;
    this.wet = wet;
    this.noise = noiseBuffer(ctx, 1);

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

  setReverb(x) {
    this.wet.gain.value = x;
    this.dry.gain.value = 1 - x * 0.5;
  }

  setVolume(x) { this.master.gain.value = x; }

  /** Schedule one note. `when` is an absolute context time. */
  play(note, when) {
    switch (note.voice) {
      case 'bass': return this._bass(note, when);
      case 'pad': return this._pad(note, when);
      case 'tick': return this._tick(note, when, 0.24);
      case 'tav': return this._drum(note, when);
      default: return this._lead(note, when);
    }
  }

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

  /* A soft brush on every word boundary. */
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
    this.settings = { volume: 0.9, reverb: 0.32, tone: 0.5 };
  }

  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.voices = new Voices(this.ctx, { ...this.settings, analyser: true });
      this.voices.setVolume(this.settings.volume);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  load(score) {
    this.score = score;
    this.ptr = 0;
    this.offset = 0;
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
    const g = this.voices.master.gain;
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
      const g = this.voices.master.gain;
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
  const voices = new Voices(ctx, settings);
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
