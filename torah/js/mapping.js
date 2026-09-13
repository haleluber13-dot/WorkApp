/* Otiyot — turning the letters of the Torah into notes.
 *
 * Everything here is pure: text in, a list of scheduled notes out. The audio
 * engine (audio.js) plays that list; the exporters (export.js) write it to WAV
 * or MIDI. Nothing in this file touches the DOM or the Web Audio API.
 */

/* ---------------------------------------------------------------- letters */

/* The 22 letters, in alphabetical order, with their gematria values and their
 * Sefer Yetzirah class: 3 mothers, 7 doubles, 12 simples. The associations are
 * the traditional ones the Sefer Yetzirah gives each class — elements for the
 * mothers, planets and days for the doubles, months and signs for the simples.
 * They are used for the letter table in the UI and to colour the piano roll. */
export const LETTERS = [
  { l: 'א', name: 'Alef',   tr: 'ʾ',  v: 1,   cls: 'mother', assoc: 'Air · breath' },
  { l: 'ב', name: 'Bet',    tr: 'b',  v: 2,   cls: 'double', assoc: 'Saturn · Sunday' },
  { l: 'ג', name: 'Gimel',  tr: 'g',  v: 3,   cls: 'double', assoc: 'Jupiter · Monday' },
  { l: 'ד', name: 'Dalet',  tr: 'd',  v: 4,   cls: 'double', assoc: 'Mars · Tuesday' },
  { l: 'ה', name: 'He',     tr: 'h',  v: 5,   cls: 'simple', assoc: 'Nisan · Aries' },
  { l: 'ו', name: 'Vav',    tr: 'v',  v: 6,   cls: 'simple', assoc: 'Iyar · Taurus' },
  { l: 'ז', name: 'Zayin',  tr: 'z',  v: 7,   cls: 'simple', assoc: 'Sivan · Gemini' },
  { l: 'ח', name: 'Chet',   tr: 'ḥ',  v: 8,   cls: 'simple', assoc: 'Tammuz · Cancer' },
  { l: 'ט', name: 'Tet',    tr: 'ṭ',  v: 9,   cls: 'simple', assoc: 'Av · Leo' },
  { l: 'י', name: 'Yod',    tr: 'y',  v: 10,  cls: 'simple', assoc: 'Elul · Virgo' },
  { l: 'כ', name: 'Kaf',    tr: 'k',  v: 20,  cls: 'double', assoc: 'Sun · Wednesday' },
  { l: 'ל', name: 'Lamed',  tr: 'l',  v: 30,  cls: 'simple', assoc: 'Tishrei · Libra' },
  { l: 'מ', name: 'Mem',    tr: 'm',  v: 40,  cls: 'mother', assoc: 'Water · silence' },
  { l: 'נ', name: 'Nun',    tr: 'n',  v: 50,  cls: 'simple', assoc: 'Cheshvan · Scorpio' },
  { l: 'ס', name: 'Samekh', tr: 's',  v: 60,  cls: 'simple', assoc: 'Kislev · Sagittarius' },
  { l: 'ע', name: 'Ayin',   tr: 'ʿ',  v: 70,  cls: 'simple', assoc: 'Tevet · Capricorn' },
  { l: 'פ', name: 'Pe',     tr: 'p',  v: 80,  cls: 'double', assoc: 'Venus · Thursday' },
  { l: 'צ', name: 'Tsadi',  tr: 'ṣ',  v: 90,  cls: 'simple', assoc: 'Shevat · Aquarius' },
  { l: 'ק', name: 'Qof',    tr: 'q',  v: 100, cls: 'simple', assoc: 'Adar · Pisces' },
  { l: 'ר', name: 'Resh',   tr: 'r',  v: 200, cls: 'double', assoc: 'Mercury · Friday' },
  { l: 'ש', name: 'Shin',   tr: 'š',  v: 300, cls: 'mother', assoc: 'Fire · hiss' },
  { l: 'ת', name: 'Tav',    tr: 't',  v: 400, cls: 'double', assoc: 'Moon · Shabbat' },
];

export const LETTER_INFO = new Map(LETTERS.map((x, i) => [x.l, { ...x, ord: i }]));

/* Positions within each Sefer Yetzirah class, used by the yetzirah mapping. */
const MOTHERS = LETTERS.filter(x => x.cls === 'mother').map(x => x.l);
const DOUBLES = LETTERS.filter(x => x.cls === 'double').map(x => x.l);
const SIMPLES = LETTERS.filter(x => x.cls === 'simple').map(x => x.l);

export const GEMATRIA = new Map(LETTERS.map(x => [x.l, x.v]));

/** Sum of the gematria values of a string of letters. */
export function gematria(word) {
  let sum = 0;
  for (const ch of word) sum += GEMATRIA.get(ch) || 0;
  return sum;
}

/* ------------------------------------------------------------------ modes */

/* Scales as semitone offsets from the tonic. The first four are the Jewish
 * prayer modes (nusach) a Torah reading actually lives in; the rest are there
 * for comparison. */
export const MODES = {
  ahavaRabbah: { name: 'Ahava Rabbah (Freygish)', steps: [0, 1, 4, 5, 7, 8, 10],
    note: 'The pleading mode — lowered 2nd over a major 3rd.' },
  magenAvot: { name: 'Magen Avot (natural minor)', steps: [0, 2, 3, 5, 7, 8, 10],
    note: 'The Friday-evening mode; plain and settled.' },
  miSheberach: { name: 'Mi Sheberach (Ukrainian Dorian)', steps: [0, 2, 3, 6, 7, 9, 10],
    note: 'Raised 4th — the yearning, "asking" mode.' },
  adonaiMalach: { name: 'Adonai Malach', steps: [0, 2, 4, 5, 7, 9, 10],
    note: 'Major with a lowered 7th; declarative, festive.' },
  major: { name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11], note: 'For comparison.' },
  pentatonic: { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10],
    note: 'Five notes — nothing can clash.' },
  chromatic: { name: 'Chromatic (no filtering)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    note: 'Every semitone. The rawest reading of the letters.' },
};

/** Turn a scale degree (which may run past the octave, or go negative) into a
 *  MIDI note number in the given mode. */
export function degreeToMidi(root, steps, degree) {
  const n = steps.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + 12 * oct + steps[idx];
}

export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const midiToName = m => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

/* --------------------------------------------------------------- mappings */

/* Each mapping answers one question: given a letter, which scale degree?
 * They differ in what they consider meaningful about a letter — its class, its
 * numeric value, or simply its place in the alphabet. */

export const MAPPINGS = {
  yetzirah: {
    name: 'Sefer Yetzirah',
    blurb: '3 mothers → bass pillars · 7 doubles → the 7 degrees · 12 simples → the 12 semitones.',
  },
  gematria: {
    name: 'Gematria',
    blurb: 'Units, tens and hundreds become three octaves; the value inside each rank picks the degree.',
  },
  ordinal: {
    name: 'Alphabetical',
    blurb: 'Alef to Tav walks straight up the scale — 22 letters, 22 rungs.',
  },
  trope: {
    name: 'Cantillation (te‘amim)',
    blurb: 'Ignores the letters and chants the accent marks instead, the way the Torah is actually read.',
  },
};

/** yetzirah: the three classes get three registers and three roles. */
function degreeYetzirah(letter, snap) {
  const i = MOTHERS.indexOf(letter);
  if (i >= 0) return { degree: [0, 3, 4][i], octave: -1, role: 'mother' };
  const j = DOUBLES.indexOf(letter);
  if (j >= 0) return { degree: j, octave: 0, role: 'double' };
  const k = SIMPLES.indexOf(letter);
  if (k >= 0) {
    // Twelve simples over twelve semitones. Snapped, they instead climb twelve
    // degrees of the mode, which keeps everything inside the nusach.
    return snap
      ? { degree: k, octave: 1, role: 'simple' }
      : { degree: null, semitone: k, octave: 1, role: 'simple' };
  }
  return null;
}

/** gematria: 1–9 low, 10–90 middle, 100–400 high. */
function degreeGematria(letter) {
  const v = GEMATRIA.get(letter);
  if (!v) return null;
  if (v < 10) return { degree: v - 1, octave: -1, role: 'unit' };
  if (v < 100) return { degree: v / 10 - 1, octave: 0, role: 'ten' };
  return { degree: v / 100 - 1, octave: 1, role: 'hundred' };
}

/** ordinal: straight up the alphabet. */
function degreeOrdinal(letter) {
  const info = LETTER_INFO.get(letter);
  if (!info) return null;
  return { degree: info.ord, octave: -1, role: info.cls };
}

/** The note a single letter makes under the current settings — used by the
 *  letter table so you can see the whole alphabet as pitches at a glance. */
export function letterMidi(letter, opt = {}) {
  const { mapping = 'yetzirah', mode = 'ahavaRabbah', root = 57, snapSimples = true } = opt;
  const steps = (MODES[mode] || MODES.ahavaRabbah).steps;
  const m = mapping === 'gematria' ? degreeGematria(letter)
          : mapping === 'ordinal' ? degreeOrdinal(letter)
          : degreeYetzirah(letter, snapSimples);
  if (!m) return null;
  return m.degree === null
    ? root + 12 * m.octave + m.semitone
    : degreeToMidi(root + 12 * m.octave, steps, m.degree);
}

/* ------------------------------------------------------------- te‘amim */

/* Stylised contours for the cantillation marks, as scale degrees relative to
 * the tonic. These are an approximation of the Ashkenazi Torah chant — enough
 * to hear the shape of the accents and how they punctuate a verse, and not a
 * substitute for learning the real trope from a reader.
 *
 * The index of each entry matches the accent codes packed by tools/torah_build.py.
 * `d` is disjunctive (it ends a phrase); conjunctive marks lean forward. */
export const TROPE = [
  { key: 'etnahta',     he: 'אֶתְנַחְתָּא',   deg: [2, 1, 0, -2, -3, -3], d: true },
  { key: 'segolta',     he: 'סֶגּוֹלְתָּא',   deg: [4, 3, 5, 4], d: true },
  { key: 'shalshelet',  he: 'שַׁלְשֶׁלֶת',    deg: [0, 2, 0, 2, 0, 2, 4, 2, 0], d: true },
  { key: 'zaqef qatan', he: 'זָקֵף קָטָן',   deg: [0, 2, 4, 3], d: true },
  { key: 'zaqef gadol', he: 'זָקֵף גָּדוֹל',  deg: [4, 2, 4, 5, 4], d: true },
  { key: 'tipeha',      he: 'טִפְחָא',       deg: [2, 1, 0, -1], d: true },
  { key: 'revia',       he: 'רְבִיעַ',       deg: [4, 4, 3, 2], d: true },
  { key: 'zarqa',       he: 'זַרְקָא',        deg: [2, 4, 3, 5], d: true },
  { key: 'pashta',      he: 'פַּשְׁטָא',      deg: [4, 5, 4], d: true },
  { key: 'yetiv',       he: 'יְתִיב',         deg: [0, 2, 1], d: true },
  { key: 'tevir',       he: 'תְּבִיר',        deg: [3, 2, 1, 2, 0], d: true },
  { key: 'geresh',      he: 'גֶּרֶשׁ',        deg: [4, 5, 4, 2], d: true },
  { key: 'geresh muqdam', he: 'גֶּרֶשׁ מֻקְדָּם', deg: [4, 5, 4], d: true },
  { key: 'gershayim',   he: 'גֵּרְשַׁיִם',    deg: [2, 4, 5, 4, 2], d: true },
  { key: 'qarney para', he: 'קַרְנֵי פָרָה',  deg: [2, 4, 5, 7, 5, 4, 2], d: true },
  { key: 'telisha gedola', he: 'תְּלִישָׁא גְדוֹלָה', deg: [0, 2, 4, 4], d: true },
  { key: 'pazer',       he: 'פָּזֵר',         deg: [2, 4, 5, 4, 3, 2], d: true },
  { key: 'atnah hafukh', he: 'אַתְנָח הָפוּךְ', deg: [1, 0, -2], d: true },
  { key: 'munah',       he: 'מֻנַּח',         deg: [2, 2], d: false },
  { key: 'mahapakh',    he: 'מַהְפָּךְ',      deg: [1, 2], d: false },
  { key: 'merkha',      he: 'מֵרְכָא',        deg: [0, -1], d: false },
  { key: 'merkha kefula', he: 'מֵרְכָא כְפוּלָה', deg: [0, -1, 0, -1], d: false },
  { key: 'darga',       he: 'דַּרְגָּא',      deg: [0, 2, 3, 4], d: false },
  { key: 'qadma',       he: 'קַדְמָא',        deg: [2, 4], d: false },
  { key: 'telisha qetana', he: 'תְּלִישָׁא קְטַנָּה', deg: [4, 3], d: false },
  { key: 'yerah ben yomo', he: 'יֶרַח בֶּן יוֹמוֹ', deg: [0, -1, -2, -1], d: false },
  { key: 'ole',         he: 'עוֹלֶה',         deg: [2, 4], d: false },
  { key: 'iluy',        he: 'עִלּוּי',        deg: [4, 5], d: false },
  { key: 'dehi',        he: 'דְּחִי',         deg: [1, 0], d: true },
  { key: 'zinorit',     he: 'צִנּוֹרִית',     deg: [3, 4], d: false },
  { key: 'sof pasuq',   he: 'סוֹף פָּסוּק',   deg: [1, 0, -1, 0], d: true },
];

/* --------------------------------------------------------------- duration */

export const RHYTHMS = {
  even: { name: 'Even', blurb: 'One pulse per letter.' },
  class: { name: 'By letter class', blurb: 'Mothers long, doubles medium, simples short.' },
  gematria: { name: 'By gematria', blurb: 'Bigger letters get longer notes.' },
};

function letterBeats(letter, rhythm) {
  if (rhythm === 'class') {
    const cls = LETTER_INFO.get(letter)?.cls;
    return cls === 'mother' ? 2 : cls === 'double' ? 1.5 : 1;
  }
  if (rhythm === 'gematria') {
    const v = GEMATRIA.get(letter) || 1;
    // log so that Tav (400) is about three times Alef (1), not four hundred.
    return 0.75 + Math.log10(v) * 0.75;
  }
  return 1;
}

/* -------------------------------------------------------------- sequencer */

/**
 * Turn verses into a flat, time-stamped score.
 *
 * @param {Array<{book,chapter,verse,words:string[],accents:string}>} verses
 * @param {object} opt
 * @returns {{notes:Array, duration:number, index:Array}}
 *   notes  — {t, dur, midi, vel, voice, letter, wordIndex, letterIndex}
 *   index  — one entry per source letter, pointing at its note (for the reader)
 */
export function sequence(verses, opt) {
  const {
    mapping = 'yetzirah',
    mode = 'ahavaRabbah',
    root = 57,           // A3
    tempo = 132,         // pulses per minute
    rhythm = 'even',
    snapSimples = true,
    bass = true,
    pad = true,
    percussion = true,
    verseRest = 1.5,     // beats of silence between verses
    humanize = 0.012,
  } = opt || {};

  const steps = (MODES[mode] || MODES.ahavaRabbah).steps;
  const spb = 60 / tempo;                       // seconds per pulse
  const notes = [];
  const index = [];
  let t = 0;

  const push = n => { notes.push(n); return n; };
  const jitter = () => (Math.random() - 0.5) * 2 * humanize;

  for (let vi = 0; vi < verses.length; vi++) {
    const v = verses[vi];
    const verseStart = t;

    // The verse's own tonic drifts by the opening word's gematria, so that
    // different verses do not all sit on the same chord.
    const opening = gematria(v.words[0] || '');
    const verseRoot = root + steps[opening % steps.length] - 12;

    for (let wi = 0; wi < v.words.length; wi++) {
      const word = v.words[wi];
      const wordStart = t;
      const lastWord = wi === v.words.length - 1;

      if (mapping === 'trope') {
        // One motif per word, taken from its accent.
        const code = v.accents ? v.accents[wi] : '.';
        const ti = code && code !== '.' ? code.charCodeAt(0) - 48 : -1;
        const tr = TROPE[ti] || { deg: [0], d: false, key: 'none' };
        const degs = lastWord ? TROPE[30].deg : tr.deg;
        const step = spb * (tr.d ? 0.75 : 0.55);
        for (let k = 0; k < degs.length; k++) {
          const midi = degreeToMidi(root, steps, degs[k]);
          push({
            t: t + jitter(), dur: step * (k === degs.length - 1 ? 1.8 : 1.05),
            midi, vel: k === 0 ? 0.9 : 0.72, voice: 'lead',
            letter: word[Math.min(k, word.length - 1)] || word[0],
            word, wordIndex: wi, verseIndex: vi, trope: tr.key,
          });
          t += step;
        }
        index.push({ verseIndex: vi, wordIndex: wi, letterIndex: 0,
                     t: wordStart, letter: word[0], trope: tr.key });
      } else {
        for (let li = 0; li < word.length; li++) {
          const letter = word[li];
          const info = LETTER_INFO.get(letter);
          if (!info) continue;

          const m = mapping === 'gematria' ? degreeGematria(letter)
                  : mapping === 'ordinal' ? degreeOrdinal(letter)
                  : degreeYetzirah(letter, snapSimples);
          if (!m) continue;

          const midi = m.degree === null
            ? root + 12 * m.octave + m.semitone
            : degreeToMidi(root + 12 * m.octave, steps, m.degree);

          const lastLetter = li === word.length - 1;
          let beats = letterBeats(letter, rhythm);
          if (lastLetter) beats *= 1.45;                 // a breath at each word
          if (lastWord && lastLetter) beats *= 1.8;      // and a longer one at the verse

          const dur = beats * spb;
          push({
            t: t + jitter(), dur: dur * 0.98, midi,
            vel: lastLetter ? 0.92 : 0.66 + (info.cls === 'mother' ? 0.16 : 0),
            voice: 'lead', letter, word, wordIndex: wi, letterIndex: li,
            verseIndex: vi, cls: info.cls,
          });
          index.push({ verseIndex: vi, wordIndex: wi, letterIndex: li,
                       t: t, letter, midi });
          t += dur;
        }
      }

      const wordDur = Math.max(t - wordStart, 0.05);

      if (bass) {
        // One sustained tone per word, rooted in the word's own gematria.
        const g = gematria(word);
        push({
          t: wordStart, dur: wordDur * 1.02,
          midi: degreeToMidi(verseRoot - 12, steps, g % steps.length),
          vel: 0.5, voice: 'bass', wordIndex: wi, verseIndex: vi,
        });
      }
      if (percussion) {
        push({ t: wordStart, dur: 0.09, midi: 0, vel: lastWord ? 0.5 : 0.24,
               voice: lastWord ? 'tav' : 'tick', wordIndex: wi, verseIndex: vi });
      }
    }

    const verseDur = t - verseStart;
    if (pad && verseDur > 0.2) {
      // A quiet chord under the whole verse: tonic, fourth, fifth of its root.
      for (const d of [0, 3, 4]) {
        push({ t: verseStart, dur: verseDur + verseRest * spb * 0.6,
               midi: degreeToMidi(verseRoot, steps, d), vel: 0.16,
               voice: 'pad', verseIndex: vi });
      }
    }

    t += verseRest * spb;
  }

  notes.sort((a, b) => a.t - b.t);
  const duration = notes.reduce((mx, n) => Math.max(mx, n.t + n.dur), 0);
  return { notes, index, duration };
}

/* --------------------------------------------------------------- analysis */

/** What actually came out: pitch-class census, intervals, range, letter counts. */
export function analyse(score) {
  const lead = score.notes.filter(n => n.voice === 'lead');
  const pitchClass = new Array(12).fill(0);
  const letters = new Map();
  const intervals = new Map();
  let lo = Infinity, hi = -Infinity, prev = null;

  for (const n of lead) {
    pitchClass[((n.midi % 12) + 12) % 12]++;
    lo = Math.min(lo, n.midi);
    hi = Math.max(hi, n.midi);
    if (n.letter) letters.set(n.letter, (letters.get(n.letter) || 0) + 1);
    if (prev !== null) {
      const iv = n.midi - prev;
      intervals.set(iv, (intervals.get(iv) || 0) + 1);
    }
    prev = n.midi;
  }

  const topLetters = [...letters.entries()].sort((a, b) => b[1] - a[1]);
  const topIntervals = [...intervals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    count: lead.length,
    total: score.notes.length,
    pitchClass,
    low: lo === Infinity ? null : lo,
    high: hi === -Infinity ? null : hi,
    topLetters,
    topIntervals,
    unisonShare: lead.length > 1 ? (intervals.get(0) || 0) / (lead.length - 1) : 0,
  };
}
