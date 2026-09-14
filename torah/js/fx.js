/* Otiyot — the effects rack.
 *
 * Eight plug-ins in a fixed order, each with a bypass and a couple of knobs.
 * A style arrives with its own settings; the user overrides any of them and
 * the change takes effect on the next note without rebuilding the score.
 *
 *   input -> drive -> crush -> filter -> chorus -> pump -> width -> output
 *                                                                    |
 *                                       dry + delay + reverb -> compressor -> out
 */

/** The rack's shape, and what each knob means. Drives the whole UI. */
export const FX_DEFS = {
  drive: {
    name: 'Drive', blurb: 'Soft clipping. Warm at the bottom, nasty at the top.',
    params: { amount: { label: 'Amount', min: 0, max: 1, step: 0.01, def: 0 } },
  },
  crush: {
    name: 'Bitcrush', blurb: 'Quantises the waveform. Lo-fi grit and digital dirt.',
    params: {
      bits: { label: 'Bits', min: 2, max: 16, step: 1, def: 8 },
      mix: { label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.5 },
    },
  },
  filter: {
    name: 'Filter', blurb: 'One sweepable filter across the whole mix.',
    params: {
      type: { label: 'Type', options: ['lowpass', 'highpass', 'bandpass'], def: 'lowpass' },
      cutoff: { label: 'Cutoff', min: 80, max: 18000, step: 10, def: 18000, log: true },
      q: { label: 'Resonance', min: 0.1, max: 20, step: 0.1, def: 0.8 },
    },
  },
  chorus: {
    name: 'Chorus', blurb: 'A detuned copy drifting behind the dry signal.',
    params: {
      rate: { label: 'Rate', min: 0.05, max: 6, step: 0.05, def: 0.7 },
      depth: { label: 'Depth', min: 0, max: 0.012, step: 0.0002, def: 0.004 },
      mix: { label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.35 },
    },
  },
  pump: {
    name: 'Sidechain', blurb: 'Ducks everything on each kick — the breathing you hear in dance music.',
    params: {
      depth: { label: 'Depth', min: 0, max: 1, step: 0.01, def: 0.55 },
      release: { label: 'Release', min: 0.04, max: 0.6, step: 0.01, def: 0.22 },
    },
  },
  delay: {
    name: 'Delay', blurb: 'Echo, with the repeats getting darker as they fade.',
    params: {
      time: { label: 'Time', min: 0.02, max: 1.5, step: 0.005, def: 0.1875 },
      feedback: { label: 'Feedback', min: 0, max: 0.85, step: 0.01, def: 0.35 },
      mix: { label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.34 },
    },
  },
  reverb: {
    name: 'Reverb', blurb: 'The room the whole thing is played in.',
    params: {
      size: { label: 'Size', min: 0.3, max: 6, step: 0.1, def: 2.6 },
      mix: { label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.3 },
    },
  },
  width: {
    name: 'Width', blurb: 'Narrows to mono or spreads past the speakers.',
    params: { amount: { label: 'Amount', min: 0, max: 2, step: 0.01, def: 1 } },
  },
};

export const FX_ORDER = ['drive', 'crush', 'filter', 'chorus', 'pump', 'delay', 'reverb', 'width'];

/** A full settings object with every plug-in at its default and bypassed. */
export function defaultFx() {
  const out = {};
  for (const [id, def] of Object.entries(FX_DEFS)) {
    const p = {};
    for (const [k, spec] of Object.entries(def.params)) p[k] = spec.def;
    out[id] = { on: false, ...p };
  }
  return out;
}

/** Fold a style's fx hints into a full rack setting. */
export function fxFromStyle(style) {
  const fx = defaultFx();
  const s = style.fx || {};
  if (s.drive > 0) { fx.drive.on = true; fx.drive.amount = s.drive; }
  if (s.delay > 0) { fx.delay.on = true; fx.delay.time = s.delay; fx.delay.feedback = s.feedback ?? 0.35; }
  if (s.reverb > 0) { fx.reverb.on = true; fx.reverb.mix = s.reverb; }
  // Anything with a kick gets the pump; it is most of what makes these
  // genres sound like themselves.
  if (style.kit) { fx.pump.on = true; fx.pump.depth = style.id === 'boombap' ? 0.3 : 0.55; }
  return fx;
}

/* ------------------------------------------------------------------ curves */

function driveCurve(amount) {
  const n = 2048, c = new Float32Array(n);
  const k = amount * amount * 90;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return c;
}

/* A staircase: rounding the signal to 2^bits levels is exactly what bit
 * reduction does, and a WaveShaper can do it without an AudioWorklet. */
function crushCurve(bits) {
  const n = 4096, c = new Float32Array(n);
  const levels = Math.pow(2, Math.max(1, bits) - 1);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.round(x * levels) / levels;
  }
  return c;
}

function impulse(ctx, seconds, decay = 2.4) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/* -------------------------------------------------------------------- rack */

export class FxRack {
  constructor(ctx, settings) {
    this.ctx = ctx;
    this.s = settings || defaultFx();

    const g = () => ctx.createGain();
    this.input = g();

    // --- drive -----------------------------------------------------------
    this.driveNode = ctx.createWaveShaper();
    this.driveNode.oversample = '2x';

    // --- bitcrush (wet/dry around the shaper) -----------------------------
    this.crushNode = ctx.createWaveShaper();
    this.crushWet = g();
    this.crushDry = g();
    this.crushSum = g();

    // --- filter ------------------------------------------------------------
    this.filterNode = ctx.createBiquadFilter();

    // --- chorus -------------------------------------------------------------
    this.chorusDelay = ctx.createDelay(0.08);
    this.chorusDelay.delayTime.value = 0.018;
    this.chorusLfo = ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusDepth = g();
    this.chorusLfo.connect(this.chorusDepth).connect(this.chorusDelay.delayTime);
    this.chorusWet = g();
    this.chorusDry = g();
    this.chorusSum = g();
    try { this.chorusLfo.start(); } catch (_) { /* already started */ }

    // --- sidechain pump ------------------------------------------------------
    this.pumpNode = g();
    this.pumpNode.gain.value = 1;

    // --- width (mid/side) ----------------------------------------------------
    this.split = ctx.createChannelSplitter(2);
    this.midG = g(); this.midG.gain.value = 0.5;
    this.sideL = g(); this.sideL.gain.value = 0.5;
    this.sideR = g(); this.sideR.gain.value = -0.5;
    this.sideSum = g();
    this.sideAmt = g();
    this.sideNeg = g(); this.sideNeg.gain.value = -1;
    this.outL = g(); this.outR = g();
    this.merge = ctx.createChannelMerger(2);

    this.output = g();

    // --- sends ----------------------------------------------------------------
    this.dry = g();
    this.delayNode = ctx.createDelay(2.5);
    this.delayFb = g();
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 2600;
    this.delaySend = g();
    this.conv = ctx.createConvolver();
    this.convSend = g();
    this.convDamp = ctx.createBiquadFilter();
    this.convDamp.type = 'highshelf';
    this.convDamp.frequency.value = 3200;
    this.convDamp.gain.value = -6;

    this.comp = ctx.createDynamicsCompressor();
    Object.assign(this.comp, {});
    this.comp.threshold.value = -15;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 4.5;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;

    this.volume = g();

    /* ---- wire it up ---- */
    this.input.connect(this.driveNode);

    this.driveNode.connect(this.crushNode).connect(this.crushWet).connect(this.crushSum);
    this.driveNode.connect(this.crushDry).connect(this.crushSum);

    this.crushSum.connect(this.filterNode);

    this.filterNode.connect(this.chorusDry).connect(this.chorusSum);
    this.filterNode.connect(this.chorusDelay).connect(this.chorusWet).connect(this.chorusSum);

    this.chorusSum.connect(this.pumpNode);

    // mid/side
    this.pumpNode.connect(this.split);
    this.split.connect(this.midG, 0); this.split.connect(this.midG, 1);
    this.split.connect(this.sideL, 0); this.split.connect(this.sideR, 1);
    this.sideL.connect(this.sideSum); this.sideR.connect(this.sideSum);
    this.sideSum.connect(this.sideAmt);
    this.sideAmt.connect(this.outL);
    this.sideAmt.connect(this.sideNeg).connect(this.outR);
    this.midG.connect(this.outL); this.midG.connect(this.outR);
    this.outL.connect(this.merge, 0, 0);
    this.outR.connect(this.merge, 0, 1);
    this.merge.connect(this.output);

    // sends and master
    this.output.connect(this.dry).connect(this.comp);
    this.output.connect(this.delaySend).connect(this.delayNode).connect(this.delayTone);
    this.delayTone.connect(this.delayFb).connect(this.delayNode);
    this.delayTone.connect(this.comp);
    this.output.connect(this.convSend).connect(this.conv).connect(this.convDamp).connect(this.comp);
    this.comp.connect(this.volume).connect(ctx.destination);

    this._impulseSize = null;
    this.applyAll();
  }

  /** Push every setting into the graph. */
  applyAll() {
    for (const id of FX_ORDER) this.apply(id);
  }

  /** Push one plug-in's settings into the graph. */
  apply(id) {
    const v = this.s[id];
    if (!v) return;
    const on = !!v.on;

    switch (id) {
      case 'drive':
        this.driveNode.curve = driveCurve(on ? v.amount : 0);
        break;

      case 'crush':
        this.crushNode.curve = crushCurve(v.bits);
        this.crushWet.gain.value = on ? v.mix : 0;
        this.crushDry.gain.value = on ? 1 - v.mix : 1;
        break;

      case 'filter':
        this.filterNode.type = v.type;
        // Bypass by parking the filter where it does nothing.
        this.filterNode.frequency.value = on ? v.cutoff
          : (v.type === 'highpass' ? 20 : 20000);
        this.filterNode.Q.value = on ? v.q : 0.0001;
        break;

      case 'chorus':
        this.chorusLfo.frequency.value = v.rate;
        this.chorusDepth.gain.value = on ? v.depth : 0;
        this.chorusWet.gain.value = on ? v.mix : 0;
        this.chorusDry.gain.value = on ? 1 - v.mix * 0.5 : 1;
        break;

      case 'pump':
        if (!on) {
          this.pumpNode.gain.cancelScheduledValues(this.ctx.currentTime);
          this.pumpNode.gain.value = 1;
        }
        break;

      case 'delay':
        this.delayNode.delayTime.value = Math.min(2.4, v.time);
        this.delayFb.gain.value = on ? Math.min(0.85, v.feedback) : 0;
        this.delaySend.gain.value = on ? v.mix : 0;
        break;

      case 'reverb':
        if (this._impulseSize !== v.size) {
          this.conv.buffer = impulse(this.ctx, v.size);
          this._impulseSize = v.size;
        }
        this.convSend.gain.value = on ? v.mix : 0;
        this.dry.gain.value = on ? 1 - v.mix * 0.45 : 1;
        break;

      case 'width':
        this.sideAmt.gain.value = on ? v.amount : 1;
        break;
    }
  }

  set(id, param, value) {
    if (!this.s[id]) return;
    this.s[id][param] = value;
    this.apply(id);
  }

  setEnabled(id, on) {
    if (!this.s[id]) return;
    this.s[id].on = on;
    this.apply(id);
  }

  replace(settings) {
    this.s = settings;
    this._impulseSize = null;
    this.applyAll();
  }

  setVolume(x) { this.volume.gain.value = x; }

  /** Duck the mix — called on every kick when the sidechain is on. */
  duck(when) {
    const p = this.s.pump;
    if (!p?.on) return;
    const g = this.pumpNode.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(Math.max(0.02, 1 - p.depth), when);
    g.linearRampToValueAtTime(1, when + p.release);
  }
}
