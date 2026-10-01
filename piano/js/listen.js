/* Hearing your real piano.

   Microphone: a McLeod-style normalized autocorrelation finds the pitch of a
   single note; a chroma vector (energy per pitch class, from the spectrum)
   checks chords. An onset detector tells a fresh key-strike apart from a note
   that is still ringing, so repeated notes (E E E) each count.

   MIDI: any USB/Bluetooth MIDI keyboard through Web MIDI — exact, and the best
   choice for chords. */

import { audio } from "./audio.js";

export class MicListener {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.running = false;
    this.sensitivity = 1;
  }

  async start() {
    const c = audio();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.src = c.createMediaStreamSource(this.stream);
    this.an = c.createAnalyser();
    this.an.fftSize = 8192;
    this.an.smoothingTimeConstant = 0;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.spec = new Float32Array(this.an.frequencyBinCount);
    this.sr = c.sampleRate;
    this.env = 0;
    this.floor = 0.002;
    this.lastOnset = 0;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._frame();
      this.timer = setTimeout(loop, 40);
    };
    loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.src?.disconnect();
  }

  _frame() {
    this.an.getFloatTimeDomainData(this.buf);
    /* newest ~85 ms, downsampled 2x */
    const N = 2048, ds = 2;
    const start = this.buf.length - N * ds;
    const x = new Float32Array(N);
    let rms = 0;
    for (let i = 0; i < N; i++) {
      const v = (this.buf[start + i * ds] + this.buf[start + i * ds + 1]) * 0.5;
      x[i] = v; rms += v * v;
    }
    rms = Math.sqrt(rms / N);
    /* noise floor follows quiet passages slowly */
    if (rms < this.floor * 3) this.floor = this.floor * 0.98 + rms * 0.02;
    this.floor = Math.max(0.0008, this.floor);
    const now = performance.now();
    const gate = this.floor * 4 / this.sensitivity;
    const onset = rms > gate && rms > this.env * 1.35 && now - this.lastOnset > 90;
    if (onset) this.lastOnset = now;
    this.env = Math.max(rms, this.env * 0.9);

    let pitch = null, clarity = 0;
    if (rms > gate) {
      const r = detectPitch(x, this.sr / ds);
      if (r) { pitch = r.freq; clarity = r.clarity; }
    }
    let chroma = null;
    if (rms > gate) chroma = this._chroma();
    const midi = pitch ? 69 + 12 * Math.log2(pitch / 440) : null;
    this.onFrame({ rms, level: Math.min(1, rms / 0.12), onset, sinceOnset: now - this.lastOnset, midi, clarity, chroma, active: rms > gate });
  }

  _chroma() {
    this.an.getFloatFrequencyData(this.spec);
    const binHz = this.sr / this.an.fftSize;
    const ch = new Float32Array(12);
    const lo = Math.floor(60 / binHz), hi = Math.min(this.spec.length - 1, Math.floor(4200 / binHz));
    for (let i = lo; i <= hi; i++) {
      const v = this.spec[i];
      if (v < this.spec[i - 1] || v < this.spec[i + 1]) continue;
      const mag = Math.pow(10, v / 20);
      const f = i * binHz;
      const m = 69 + 12 * Math.log2(f / 440);
      const r = Math.round(m);
      if (Math.abs(m - r) > 0.35) continue;
      /* higher partials count a little less so overtones don't swamp roots */
      ch[((r % 12) + 12) % 12] += mag * (f < 1000 ? 1 : 0.6);
    }
    const max = Math.max(...ch);
    if (max <= 0) return null;
    for (let i = 0; i < 12; i++) ch[i] /= max;
    return ch;
  }
}

/* Normalized square difference function pitch detector (McLeod & Wyvill). */
export function detectPitch(x, sr) {
  const N = x.length;
  const minLag = Math.floor(sr / 2200), maxLag = Math.min(N >> 1, Math.floor(sr / 50));
  const nsdf = new Float32Array(maxLag + 1);
  let m = 0;
  for (let i = 0; i < N; i++) m += x[i] * x[i];
  let mm = 2 * m;
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    for (let i = 0; i < N - tau; i++) acf += x[i] * x[i + tau];
    nsdf[tau] = mm > 0 ? (2 * acf) / mm : 0;
    mm -= x[tau] * x[tau] + x[N - 1 - tau] * x[N - 1 - tau];
  }
  /* key maxima between positive zero-crossings */
  const peaks = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau] > 0) tau++;
  let best = -1, bestTau = 0;
  for (; tau < maxLag; tau++) {
    if (nsdf[tau] > 0 && nsdf[tau - 1] <= 0) { if (best > 0) peaks.push([bestTau, best]); best = -1; }
    if (nsdf[tau] > 0 && nsdf[tau] > best && tau >= minLag) { best = nsdf[tau]; bestTau = tau; }
  }
  if (best > 0) peaks.push([bestTau, best]);
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => p[1]));
  const pick = peaks.find((p) => p[1] >= top * 0.88);
  if (!pick || pick[1] < 0.55) return null;
  const t = pick[0];
  const a = nsdf[t - 1], b = nsdf[t], c = nsdf[t + 1] ?? b;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { freq: sr / (t + (Number.isFinite(shift) ? shift : 0)), clarity: b };
}

/* Web MIDI */
export class MidiInput {
  constructor({ onOn, onOff, onStatus }) {
    this.onOn = onOn; this.onOff = onOff; this.onStatus = onStatus;
    this.held = new Set();
    this.names = [];
  }
  get supported() { return !!navigator.requestMIDIAccess; }
  async start() {
    if (!this.supported) throw new Error("Web MIDI isn't supported in this browser (try Chrome or Edge).");
    this.access = await navigator.requestMIDIAccess();
    const bind = () => {
      this.names = [];
      for (const input of this.access.inputs.values()) {
        this.names.push(input.name);
        input.onmidimessage = (e) => this._msg(e.data);
      }
      this.onStatus?.(this.names);
    };
    this.access.onstatechange = bind;
    bind();
  }
  _msg([st, d1, d2]) {
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) { this.held.add(d1); this.onOn?.(d1, d2 / 127); }
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) { this.held.delete(d1); this.onOff?.(d1); }
  }
}
