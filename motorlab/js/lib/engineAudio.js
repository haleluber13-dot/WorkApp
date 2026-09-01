/* MotorLab — the sound of the engine, synthesised.
 *
 * No recordings: a recording is one engine at one rpm, and this garage holds
 * fifty-five engines that rev. The sound is built the way the noise itself is
 * built — combustion pulses at the firing frequency — so a V8 rumbles, a
 * four buzzes, a twin lopes, and everything follows the tachometer exactly.
 *
 * Everything here is plain Web Audio maths: oscillators, a noise buffer, a
 * shaper and filters. Nothing is fetched and no worklet is loaded, so it
 * runs identically in the hosted app and inside the sandboxed single file.
 */

let ctx = null;
const AC = () => (ctx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)());

/* a couple of seconds of white noise, looped — the mechanical hiss and the
   intake roar are both filtered slices of this */
let noiseBuf = null;
function noise(){
  if (noiseBuf) return noiseBuf;
  const sr = AC().sampleRate, b = AC().createBuffer(1, sr * 2, sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}

/* soft clip: what a cabin and an exhaust system do to a hard pulse train */
function shaperCurve(k = 2.4){
  const n = 512, c = new Float32Array(n);
  for (let i = 0; i < n; i++){
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

export class EngineAudio {
  constructor(){
    this.on = false;
    this.volume = 0.7;
    this._spec = { cyl: 4, stroke4: true };
  }

  /** Build the graph. Safe to call again; it tears down the old one. */
  start(spec = {}){
    this.stop();
    const ac = AC();
    if (ac.state === 'suspended') ac.resume();
    this._spec = { cyl: spec.cyl || 4, stroke4: spec.stroke4 !== false,
                   vee: !!spec.vee, big: (spec.displacement || 2000) > 4200 };
    const g = this.master = ac.createGain();
    g.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    g.connect(comp).connect(ac.destination);

    /* the pulse train: three saws on engine orders through a soft clip */
    this.shaper = ac.createWaveShaper();
    this.shaper.curve = shaperCurve(this._spec.big ? 3.2 : 2.2);
    this.lp = ac.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.Q.value = 0.8;
    this.shaper.connect(this.lp).connect(g);

    const mk = (mult, gain, type = 'sawtooth') => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = 30;
      const og = ac.createGain(); og.gain.value = gain;
      o.connect(og).connect(this.shaper);
      o.start();
      return { o, og, mult };
    };
    /* crank order (sub rumble), firing order (the note), first harmonic */
    this.oscs = [
      mk(0.5, this._spec.big ? 0.85 : 0.55),
      mk(1.0, 1.0),
      mk(2.0, 0.35),
      mk(3.0, this._spec.vee ? 0.22 : 0.12),
    ];
    /* uneven fire: a slow AM wobble, deep on twins, faint on multis */
    this.lopeOsc = ac.createOscillator(); this.lopeOsc.frequency.value = 8;
    this.lopeGain = ac.createGain();
    this.lopeGain.gain.value = this._spec.cyl <= 2 ? 0.45 : this._spec.cyl <= 4 ? 0.12 : 0.05;
    const one = ac.createGain(); one.gain.value = 1;
    this.lopeOsc.connect(this.lopeGain).connect(g.gain);
    this.lopeOsc.start();

    /* intake / mechanical noise: bandpassed hiss that follows the revs */
    this.noiseSrc = ac.createBufferSource();
    this.noiseSrc.buffer = noise(); this.noiseSrc.loop = true;
    this.bp = ac.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.Q.value = 0.7;
    this.noiseGain = ac.createGain(); this.noiseGain.gain.value = 0;
    this.noiseSrc.connect(this.bp).connect(this.noiseGain).connect(g);
    this.noiseSrc.start();

    this.on = true;
    return this;
  }

  /** Drive it from the running sim. rpm 0 = silence; cranking = the starter. */
  set(rpm, throttle = 0, cranking = 0){
    if (!this.on) return;
    if (!Number.isFinite(rpm)) rpm = 0;
    if (!Number.isFinite(throttle)) throttle = 0;
    const ac = AC(), t = ac.currentTime;
    const { cyl, stroke4 } = this._spec;
    if (cranking > 0){
      /* the starter: slow, flat, laboured — the note of the crank order only */
      const f = Math.max(8, (rpm / 60) * (cyl / (stroke4 ? 2 : 1)));
      for (const { o, mult } of this.oscs) o.frequency.setTargetAtTime(f * mult, t, 0.04);
      this.lp.frequency.setTargetAtTime(300, t, 0.05);
      this.master.gain.setTargetAtTime(0.30 * this.volume, t, 0.05);
      this.noiseGain.gain.setTargetAtTime(0.10 * this.volume, t, 0.05);
      this.bp.frequency.setTargetAtTime(700, t, 0.05);
      return;
    }
    if (rpm < 40){
      this.master.gain.setTargetAtTime(0, t, 0.10);
      this.noiseGain.gain.setTargetAtTime(0, t, 0.10);
      return;
    }
    const f0 = (rpm / 60) * (cyl / (stroke4 ? 2 : 1));   // firing frequency
    for (const { o, mult } of this.oscs)
      o.frequency.setTargetAtTime(Math.min(4000, f0 * mult), t, 0.03);
    this.lopeOsc.frequency.setTargetAtTime(Math.max(3, rpm / 120), t, 0.05);
    /* throttle opens the exhaust: brighter, louder, more hiss */
    const open = 0.35 + 0.65 * throttle;
    this.lp.frequency.setTargetAtTime(500 + open * (2200 + rpm * 0.35), t, 0.06);
    this.master.gain.setTargetAtTime((0.16 + 0.26 * open) * this.volume, t, 0.06);
    this.bp.frequency.setTargetAtTime(Math.min(6500, f0 * 6), t, 0.08);
    this.noiseGain.gain.setTargetAtTime((0.02 + 0.16 * throttle) * this.volume, t, 0.08);
  }

  setVolume(v){ this.volume = Math.max(0, Math.min(1, v)); }

  /** A short tyre chirp — the handbrake doing its job. */
  chirp(){
    const ac = AC(), t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noise();
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(1900, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * this.volume + 0.001, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t); src.stop(t + 0.4);
  }

  stop(){
    if (!this.on) return;
    const t = AC().currentTime;
    try { this.master.gain.setTargetAtTime(0, t, 0.08); } catch {}
    const dead = [this.oscs?.map(x => x.o), this.lopeOsc, this.noiseSrc].flat().filter(Boolean);
    setTimeout(() => { for (const n of dead){ try { n.stop(); } catch {} } }, 350);
    this.on = false;
  }
}

export const engineAudio = new EngineAudio();
