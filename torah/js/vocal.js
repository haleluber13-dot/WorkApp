/* Otiyot — a voice the app builds itself.
 *
 * Not a recording and not the operating system's speech engine: a vocal tract
 * made of filters. A buzzing source stands in for the vocal folds, three
 * bandpass filters stand in for the resonances of the mouth and throat, and
 * moving those resonances is what turns one steady buzz into "a", "e" or "u".
 *
 * Because the niqqud reader already works out the consonant and the vowel on
 * every letter, this can sing the actual syllables of the text rather than
 * humming through them.
 */

/* The first three formants of each vowel, in hertz, with the bandwidth of
 * each resonance. These are the ordinary textbook values for a neutral adult
 * voice; the whole character of a vowel is in these six numbers. */
export const FORMANTS = {
  a: { f: [730, 1090, 2440], bw: [60, 90, 120], g: [1.0, 0.50, 0.22] },
  e: { f: [530, 1840, 2480], bw: [55, 95, 125], g: [1.0, 0.62, 0.28] },
  i: { f: [270, 2290, 3010], bw: [50, 100, 130], g: [1.0, 0.55, 0.30] },
  o: { f: [570,  840, 2410], bw: [60,  85, 120], g: [1.0, 0.48, 0.18] },
  u: { f: [300,  870, 2240], bw: [50,  85, 115], g: [1.0, 0.42, 0.14] },
  'ə': { f: [500, 1500, 2500], bw: [60, 95, 125], g: [1.0, 0.45, 0.20] },
};

/* How each Hebrew consonant is made, which decides what happens in the
 * moment before the vowel arrives. */
const ARTIC = {
  // stops: a beat of silence, then a burst
  'ב': 'stop', 'ג': 'stop', 'ד': 'stop', 'כ': 'stop', 'פ': 'stop',
  'ת': 'stop', 'ט': 'stop', 'ק': 'stop',
  // fricatives: noise, shaped high or low
  'ז': 'fric', 'ח': 'fric', 'ס': 'fric', 'צ': 'fric', 'ש': 'fric',
  // nasals: a hum through the nose first
  'מ': 'nasal', 'נ': 'nasal',
  // liquids and glides: the formants slide in
  'ל': 'glide', 'ר': 'glide', 'י': 'glide', 'ו': 'glide',
  // the breath and the throat
  'ה': 'breath', 'א': 'open', 'ע': 'open',
};

/* Where the noise sits for each fricative — this is most of what tells s
 * from sh from ch. */
const FRIC_HZ = {
  'ז': 4800, 'ח': 1600, 'ס': 6200, 'צ': 5200, 'ש': 3400,
  'ב': 1800, 'פ': 1400, 'ו': 1200,
};

export const VOICE_TYPES = {
  tenor:   { name: 'Tenor',   shift: 1.0,  blurb: 'The default throat.' },
  bass:    { name: 'Bass',    shift: 0.82, blurb: 'A longer tract — everything darker.' },
  alto:    { name: 'Alto',    shift: 1.12, blurb: 'Shorter and brighter.' },
  soprano: { name: 'Soprano', shift: 1.25, blurb: 'Shortest tract, highest resonances.' },
  child:   { name: 'Child',   shift: 1.4,  blurb: 'Very short — small head.' },
  giant:   { name: 'Giant',   shift: 0.62, blurb: 'Absurdly long. Barely a person.' },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Sing one syllable.
 *
 * @param {object} V      the Voices instance — gives ctx, master, noise, _track
 * @param {object} note   {midi, dur, vel, cons, vq, syllable}
 * @param {number} when   absolute context time
 * @param {object} o      {type, vibrato, breath, out}
 */
export function sing(V, note, when, o = {}) {
  const ctx = V.ctx;
  const dest = o.out || V.master;
  const f0 = 440 * Math.pow(2, (note.midi - 69) / 12);
  const dur = Math.max(0.06, note.dur);
  const vel = note.vel ?? 0.8;

  const type = VOICE_TYPES[o.type] || VOICE_TYPES.tenor;
  const shift = type.shift;
  const vowel = FORMANTS[note.vq] || FORMANTS['ə'];
  const artic = ARTIC[note.cons] || 'open';

  // The consonant takes a slice off the front; a long note gives it more room.
  const consLen = artic === 'open' ? 0
    : clamp(dur * 0.22, 0.012, artic === 'stop' ? 0.05 : 0.09);
  const vowStart = when + consLen;
  const vowLen = Math.max(0.04, dur - consLen);

  const nodes = [];
  const out = ctx.createGain();           // everything for this syllable
  out.gain.value = 1;
  out.connect(dest);
  nodes.push(out);

  /* ---- the vocal folds: a buzz, with a little life in it ---- */
  const glottis = ctx.createOscillator();
  glottis.type = 'sawtooth';
  glottis.frequency.setValueAtTime(f0, when);

  // A voice does not start dead on the note; it slides the last few cents.
  glottis.frequency.setValueAtTime(f0 * 0.985, vowStart);
  glottis.frequency.exponentialRampToValueAtTime(f0, vowStart + Math.min(0.06, vowLen * 0.3));

  // Vibrato, held back until the note has had a moment to settle.
  const vibAmt = o.vibrato ?? 0.5;
  if (vibAmt > 0 && vowLen > 0.25) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, vowStart);
    lg.gain.linearRampToValueAtTime(vibAmt * 22, vowStart + Math.min(0.35, vowLen * 0.5));
    lfo.connect(lg).connect(glottis.detune);
    lfo.start(when); lfo.stop(when + dur + 0.2);
    nodes.push(lfo, lg);
  }

  const source = ctx.createGain();
  source.gain.value = 0.5;
  glottis.connect(source);

  // Breath: a little noise through the same resonances keeps it from
  // sounding like a pure synth tone.
  const breath = o.breath ?? 0.35;
  if (breath > 0) {
    const n = ctx.createBufferSource();
    n.buffer = V.noise;
    n.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = breath * 0.06;
    n.connect(ng).connect(source);
    n.start(when); n.stop(when + dur + 0.2);
    nodes.push(n, ng);
  }
  nodes.push(glottis, source);

  /* ---- the mouth: three resonances in parallel ---- */
  const bank = [];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const hz = clamp(vowel.f[i] * shift, 90, 11000);
    bp.frequency.setValueAtTime(hz, when);
    bp.Q.value = clamp(hz / vowel.bw[i], 1, 30);
    const g = ctx.createGain();
    g.gain.value = vowel.g[i];
    source.connect(bp).connect(g).connect(out);
    bank.push(bp);
    nodes.push(bp, g);
  }

  // A liquid or glide reaches its vowel rather than starting there.
  if (artic === 'glide') {
    const from = note.cons === 'ל' ? [360, 1100, 2600]
               : note.cons === 'ר' ? [420, 1300, 1600]
               : note.cons === 'י' ? [280, 2200, 3000]
               : [320, 800, 2300];                       // vav
    for (let i = 0; i < 3; i++) {
      const target = clamp(vowel.f[i] * shift, 90, 11000);
      bank[i].frequency.setValueAtTime(clamp(from[i] * shift, 90, 11000), when);
      bank[i].frequency.linearRampToValueAtTime(target, vowStart + Math.min(0.08, vowLen * 0.4));
    }
  }

  /* ---- the amplitude: where the consonant actually lives ---- */
  const amp = ctx.createGain();
  const peak = 0.3 * vel;
  const g = amp.gain;
  g.setValueAtTime(0.0001, when);

  if (artic === 'stop') {
    // Closed, then released: silence, a click, then the vowel.
    g.setValueAtTime(0.0001, vowStart - 0.004);
    g.linearRampToValueAtTime(peak * 1.15, vowStart + 0.008);
  } else if (artic === 'nasal') {
    // The hum is already voiced, just muffled, so it rises early and low.
    g.linearRampToValueAtTime(peak * 0.35, when + consLen * 0.4);
    g.linearRampToValueAtTime(peak, vowStart + 0.02);
  } else if (artic === 'breath') {
    g.linearRampToValueAtTime(peak * 0.12, when + consLen * 0.5);
    g.linearRampToValueAtTime(peak, vowStart + 0.03);
  } else {
    g.linearRampToValueAtTime(peak, when + Math.min(0.03, dur * 0.25));
  }

  const rel = Math.min(0.12, vowLen * 0.35);
  g.setValueAtTime(peak, when + dur - rel);
  g.exponentialRampToValueAtTime(0.0001, when + dur + 0.02);
  out.disconnect();
  out.connect(amp).connect(dest);
  nodes.push(amp);

  /* ---- the nose, for m and n ---- */
  if (artic === 'nasal') {
    const nasal = ctx.createBiquadFilter();
    nasal.type = 'lowpass';
    nasal.frequency.setValueAtTime(note.cons === 'מ' ? 450 : 700, when);
    nasal.frequency.setValueAtTime(note.cons === 'מ' ? 450 : 700, vowStart - 0.001);
    nasal.frequency.linearRampToValueAtTime(6000, vowStart + 0.03);
    source.disconnect();
    source.connect(nasal);
    for (const bp of bank) nasal.connect(bp);
    nodes.push(nasal);
  }

  /* ---- friction: the hiss in front of the vowel ---- */
  if (artic === 'fric' || artic === 'stop') {
    const n = ctx.createBufferSource();
    n.buffer = V.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp((FRIC_HZ[note.cons] || 3000) * (shift * 0.5 + 0.5), 300, 12000);
    bp.Q.value = artic === 'stop' ? 1.2 : 2.4;
    const ng = ctx.createGain();
    const fPeak = (artic === 'stop' ? 0.18 : 0.26) * vel;
    if (artic === 'stop') {
      // A burst at the release, not a sustained hiss.
      ng.gain.setValueAtTime(0.0001, when);
      ng.gain.setValueAtTime(fPeak, vowStart);
      ng.gain.exponentialRampToValueAtTime(0.0001, vowStart + 0.035);
    } else {
      ng.gain.setValueAtTime(0.0001, when);
      ng.gain.linearRampToValueAtTime(fPeak, when + consLen * 0.4);
      ng.gain.setValueAtTime(fPeak, vowStart - 0.005);
      ng.gain.exponentialRampToValueAtTime(0.0001, vowStart + 0.02);
    }
    n.connect(bp).connect(ng).connect(dest);
    n.start(when); n.stop(vowStart + 0.06);
    nodes.push(n, bp, ng);
  }

  glottis.start(when);
  glottis.stop(when + dur + 0.15);
  V._track(when + dur + 0.2, nodes);
}

/* --------------------------------------------------------------- speaking */

/* Reading aloud is not singing. The pitch is not chosen by the music — it
 * drifts down across a phrase and drops at the end, which is what makes a
 * sentence sound finished — and the length of each syllable comes from the
 * vowel written on it rather than from a beat.
 *
 * Because this is built out of the same formants as the singing voice, it
 * needs nothing installed on the device. It is always there.
 */

/** Seconds a syllable takes when read at normal pace, by its vowel's length. */
const SPOKEN = { long: 0.26, short: 0.17, ultra: 0.09, none: 0.19, silent: 0.055 };

/* Who is reading. A vocal tract's length sets where the resonances sit and a
 * voice's pitch sets how fast the folds buzz; between them that is most of
 * what we hear as one person rather than another. */
export const REGISTERS = {
  man:     { name: 'A man',    type: 'bass',    midi: 45, breath: 0.3,  vibrato: 0.2,
             blurb: 'Long tract, low fold rate.' },
  woman:   { name: 'A woman',  type: 'alto',    midi: 57, breath: 0.38, vibrato: 0.3,
             blurb: 'Shorter tract, higher pitch.' },
  neutral: { name: 'Neither',  type: 'tenor',   midi: 50, breath: 0.34, vibrato: 0.25,
             blurb: 'Between the two, deliberately.' },
  child:   { name: 'A child',  type: 'child',   midi: 62, breath: 0.42, vibrato: 0.35,
             blurb: 'Small head, quick and high.' },
  elder:   { name: 'An elder', type: 'bass',    midi: 47, breath: 0.6,  vibrato: 0.55,
             blurb: 'Breathier, with more waver in it.' },
  deep:    { name: 'Deep',     type: 'giant',   midi: 36, breath: 0.45, vibrato: 0.15,
             blurb: 'Far longer than any real throat.' },
};

/**
 * Read a run of syllables aloud.
 *
 * @param {object} V     the Voices instance
 * @param {Array}  syls  [{cons, vq, len, silent, gap}] — len is 'long'|'short'|…
 * @param {number} when  absolute context time to begin
 * @param {object} o     {register, midi, rate, breath, vibrato, type, volume}
 * @returns {number} how long the whole phrase takes, in seconds
 */
export function speak(V, syls, when, o = {}) {
  const reg = REGISTERS[o.register] || REGISTERS.neutral;
  const base = o.midi ?? reg.midi;
  const rate = Math.max(0.3, o.rate ?? 1);
  const type = o.type || reg.type;
  const breath = o.breath ?? reg.breath;
  const vibrato = o.vibrato ?? reg.vibrato;
  const vol = o.volume ?? 1;

  const n = syls.length;
  if (!n) return 0;

  let t = when;
  for (let i = 0; i < n; i++) {
    const s = syls[i];
    const dur = (SPOKEN[s.silent ? 'silent' : (s.len || 'none')] ?? 0.19) / rate;

    // The phrase falls away as it goes, and further on the last syllable.
    const through = n === 1 ? 1 : i / (n - 1);
    let semis = 2.2 * (1 - through) - 1.2 * through;
    if (i === n - 1) semis -= 2.4;
    // A little movement, so it does not read like a machine.
    semis += (Math.random() - 0.5) * 0.7;

    if (!s.silent) {
      sing(V, {
        midi: base + semis,
        dur: dur * 1.08,                      // syllables overlap slightly
        vel: (i === n - 1 ? 0.72 : 0.85) * vol,
        cons: s.cons, vq: s.vq,
      }, t, { type, vibrato, breath, out: o.out });
    }

    t += dur + (s.gap || 0) / rate;
  }
  // A beat of silence after the phrase, as a reader takes.
  return t - when + 0.18 / rate;
}

/** How long `speak` will take, without scheduling anything. */
export function speakLength(syls, rate = 1) {
  let t = 0;
  for (const s of syls) {
    t += (SPOKEN[s.silent ? 'silent' : (s.len || 'none')] ?? 0.19) / rate + (s.gap || 0) / rate;
  }
  return t + 0.18 / rate;
}
