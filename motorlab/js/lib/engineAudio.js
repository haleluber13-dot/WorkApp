/* MotorLab — the sound of the engine.
 *
 * Two layers. The first is real: recordings of the actual machines — a
 * cross-plane V8 at idle, a rotary's brap, a Harley's potato-potato — looped
 * and pitch-tracked to the tachometer, crossfading from the idle recording to
 * the high-rpm one as the engine climbs. Which recording plays is decided by
 * assets/sounds/sounds.json, and every file in it is a licence-clean
 * recording with its author credited in assets/sounds/CREDITS.md.
 *
 * The second layer is synthesised from the physics — combustion pulses at the
 * firing frequency — and does two jobs: it is the fallback when a copy of the
 * app carries no recordings (or the archetype has none), and under the
 * recordings it supplies the exact-rpm fundamental so the note never detunes
 * from the tachometer even when a loop is pitched far from where it was
 * recorded.
 */
import { assetBytes, assetText, assetUrl, assetBundled } from './assets.js';

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

/* ---- the recordings ----------------------------------------------------- */

/** Which family of recordings speaks for an engine. Derived from the same
 *  spec fields the simulation runs on, with a small override map for engines
 *  whose voice their layout alone does not predict. */
export function soundArchetype(e){
  if (!e) return null;
  if (e.sound) return e.sound;
  if (e.kind === 'rotary') return 'rotary';
  const diesel = e.fuel === 'diesel' || /^d-/.test(e.id || '');
  if (diesel) return e.layout === 'V' ? 'diesel-v8' : 'diesel-i6';
  if (e.class === 'bike'){
    if (e.cyl === 1) return 'single';
    if (e.cyl === 2) return e.layout === 'V' && (e.bankAngle || 90) <= 60 ? 'vtwin' : 'twin';
    if (e.cyl === 3) return 'twin';
    return 'bike-i4';
  }
  if (e.layout === 'F') return e.cyl >= 6 ? 'flat6' : 'flat4';
  if (e.cyl === 12) return 'v12';
  if (e.cyl === 10) return 'v10';
  if (e.cyl === 16) return 'v12';
  if (e.cyl === 8) return e.firing === 'V8f' ? 'v8-flat' : 'v8-cross';
  if (e.cyl === 5) return 'i5';
  if (e.cyl === 6 && e.layout === 'I') return 'i6-turbo';
  if (e.cyl === 6) return e.aspiration !== 'na' ? 'v6-turbo' : 'i4-sport';
  return 'i4-sport';
}

let soundManifest;           // sounds.json, parsed once
const sampleBank = new Map(); // archetype -> promise of {idle:{buffer,rpm}, rev:{buffer,rpm}} | null

async function soundBytes(path){
  const local = assetBytes(path);
  if (local !== null) return local;
  if (!assetBundled(path)) return null;   // sandboxed single file without sounds: no fetch
  try {
    const r = await fetch(assetUrl(path));
    if (r.ok) return await r.arrayBuffer();
  } catch {}
  return null;
}

/* Decode compressed audio to a buffer. The callback form is used and the
   result is bounced into the live playback context: decoding directly on a
   context that is already running its oscillators can stall in some engines,
   so the decode happens on its own short-lived context. */
function decode(bytes){
  return new Promise((resolve, reject) => {
    const tmp = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; try { tmp.close(); } catch {} fn(v); };
    Promise.resolve(tmp.state === 'suspended' ? tmp.resume() : null).catch(() => {}).then(() => {
      try {
        const p = tmp.decodeAudioData(bytes, b => finish(resolve, b), e => finish(reject, e));
        if (p && p.then) p.then(b => finish(resolve, b), e => finish(reject, e));
      } catch (e) { finish(reject, e); }
    });
    setTimeout(() => finish(reject, new Error('decode timeout')), 8000);
  });
}

async function loadSoundManifest(){
  if (soundManifest !== undefined) return soundManifest;
  try {
    const local = assetText('sounds/sounds.json');
    if (local !== null) return (soundManifest = JSON.parse(local));
    const bytes = await soundBytes('sounds/sounds.json');
    return (soundManifest = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null);
  } catch { return (soundManifest = null); }
}

/** Every recording this copy of the app can play, with its author and licence
 *  — the Files tab renders these so credit travels with the sound. */
export async function soundCredits(){
  const man = await loadSoundManifest();
  if (!man) return [];
  const out = [];
  for (const [key, rec] of Object.entries(man)){
    const clips = rec?.file ? [[key.replace(/^_/, ''), rec]]
      : ['idle', 'rev', 'crank'].filter(k => rec?.[k]?.file).map(k => [k, rec[k]]);
    for (const [kind, m] of clips)
      out.push({ archetype: key.replace(/^_/, ''), kind, file: m.file,
                 title: m.title || m.file, author: m.author || 'unknown',
                 licence: m.licence || '', source: m.source || '' });
  }
  return out;
}

async function buildSamples(archetype){
  const man = await loadSoundManifest();
  const rec = man?.[archetype];
  if (!rec) return { set: null, firm: true };   // genuinely no recording: cache it
  const out = {};
  let softFail = false;
  for (const kind of ['idle', 'rev', 'crank']){
    const meta = rec[kind] || (kind === 'crank' ? man?._crank : null);
    if (!meta?.file) continue;
    const bytes = await soundBytes('sounds/' + meta.file);
    if (!bytes){ softFail = true; continue; }        // a transient fetch miss
    try {
      out[kind] = { buffer: await decode(bytes), rpm: meta.rpm || 900,
                    loopStart: meta.loopStart || 0, loopEnd: meta.loopEnd || 0 };
    } catch { softFail = true; }                      // a stalled/refused decode
  }
  /* only remember the answer when it is real: a fetch or decode that timed out
     under load must be retried next time, not cached as "this engine is silent" */
  return { set: out.idle ? out : null, firm: !!out.idle || !softFail };
}

function loadSamples(archetype){
  if (!archetype) return Promise.resolve(null);
  if (!sampleBank.has(archetype)){
    const p = buildSamples(archetype).then((r) => {
      if (!r.firm) sampleBank.delete(archetype);     // let the next call try again
      return r.set;
    }, () => { sampleBank.delete(archetype); return null; });
    sampleBank.set(archetype, p);
  }
  return sampleBank.get(archetype);
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
    /* the synth's own bus: full voice alone, an under-layer once a recording
       of the real engine is playing on top of it */
    this.synthBus = ac.createGain(); this.synthBus.gain.value = 1;
    this.shaper.connect(this.lp).connect(this.synthBus).connect(g);

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
    this._epoch = (this._epoch || 0) + 1;
    this.samples = null;
    this.soundId = spec.soundId ?? null;
    this._armSamples(spec.soundId, this._epoch);
    return this;
  }

  /** Fetch and stand up the recorded layer; harmless no-op when this copy of
   *  the app carries no recording for the archetype. */
  async _armSamples(archetype, epoch){
    const set = await loadSamples(archetype);
    if (!set || !this.on || epoch !== this._epoch) return;
    const ac = AC();
    const mkLoop = (s) => {
      const src = ac.createBufferSource();
      src.buffer = s.buffer; src.loop = true;
      /* the loop markers skip the guard audio around the seamless body, so the
         mp3 encoder's delay padding never lands inside the loop */
      if (s.loopEnd > s.loopStart){ src.loopStart = s.loopStart; src.loopEnd = s.loopEnd; }
      const gn = ac.createGain(); gn.gain.value = 0;
      src.connect(gn).connect(this.master);
      src.start(ac.currentTime, s.loopStart || 0);
      return { src, gn, rpm: s.rpm };
    };
    this.samples = {
      idle: mkLoop(set.idle),
      rev:  set.rev ? mkLoop(set.rev) : null,
      crank: set.crank ? mkLoop(set.crank) : null,
    };
    /* the real thing carries the voice now; the synth drops to a supporting
       fundamental that keeps the note glued to the tachometer */
    this.synthBus.gain.setTargetAtTime(0.22, ac.currentTime, 0.4);
  }

  _setSamples(rpm, throttle, cranking, t){
    const s = this.samples;
    if (!s) return;
    const open = 0.35 + 0.65 * throttle;
    if (cranking > 0){
      s.idle.gn.gain.setTargetAtTime(s.crank ? 0 : 0.06, t, 0.05);
      s.rev?.gn.gain.setTargetAtTime(0, t, 0.05);
      s.crank?.gn.gain.setTargetAtTime(0.65, t, 0.04);
      s.crank?.src.playbackRate.setTargetAtTime(1, t, 0.1);
      return;
    }
    s.crank?.gn.gain.setTargetAtTime(0, t, 0.03);
    if (rpm < 40){
      s.idle.gn.gain.setTargetAtTime(0, t, 0.1);
      s.rev?.gn.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const lo = s.idle.rpm, hi = s.rev?.rpm || lo * 4;
    /* equal-power fade from the idle recording to the high-rpm one */
    const x = Math.max(0, Math.min(1, (rpm - lo * 1.1) / Math.max(1, hi * 0.9 - lo * 1.1)));
    const level = 0.34 + 0.42 * open;
    s.idle.gn.gain.setTargetAtTime(level * Math.cos(x * Math.PI / 2), t, 0.07);
    s.idle.src.playbackRate.setTargetAtTime(Math.max(0.55, Math.min(3.2, rpm / lo)), t, 0.05);
    if (s.rev){
      s.rev.gn.gain.setTargetAtTime(level * Math.sin(x * Math.PI / 2), t, 0.07);
      s.rev.src.playbackRate.setTargetAtTime(Math.max(0.45, Math.min(2.4, rpm / hi)), t, 0.05);
    }
  }

  /** Drive it from the running sim. rpm 0 = silence; cranking = the starter. */
  set(rpm, throttle = 0, cranking = 0){
    if (!this.on) return;
    if (!Number.isFinite(rpm)) rpm = 0;
    if (!Number.isFinite(throttle)) throttle = 0;
    const ac = AC(), t = ac.currentTime;
    const { cyl, stroke4 } = this._spec;
    this._setSamples(rpm, throttle, cranking, t);
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
    const s = this.samples;
    const dead = [this.oscs?.map(x => x.o), this.lopeOsc, this.noiseSrc,
                  s?.idle.src, s?.rev?.src, s?.crank?.src].flat().filter(Boolean);
    this.samples = null;
    this._epoch = (this._epoch || 0) + 1;
    setTimeout(() => { for (const n of dead){ try { n.stop(); } catch {} } }, 350);
    this.on = false;
  }
}

export const engineAudio = new EngineAudio();
