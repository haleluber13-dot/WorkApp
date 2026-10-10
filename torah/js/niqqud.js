/* Otiyot — the points.
 *
 * A Hebrew letter on its own does not tell you how it is said. The dots and
 * dashes around it — the niqqud — carry the vowels, the doubling and the hard
 * or soft reading of a consonant. This module reads a pointed word and says
 * what is actually in it: which vowel sits on each letter, how long it is,
 * which letters are silent, and roughly how the whole word sounds.
 *
 * The syllable rules below (shva na vs nach, dagesh kal vs chazak) are the
 * standard teaching rules. They are a good approximation, not a full
 * grammatical parse, and they will be wrong on some words.
 */

const LETTER_RE = /[א-ת]/;

/** Final forms and the letters they are forms of. */
export const BASE = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export const DAGESH = 'ּ';   // also mappiq, also the shuruq dot
export const RAFE = 'ֿ';
export const METEG = 'ֽ';
export const SHIN_DOT = 'ׁ';
export const SIN_DOT = 'ׂ';

/* The vowels, with what they sound like and how long they are held.
 *   q    vowel quality — a e i o u, or 'ə' for a plain sheva
 *   len  'long' | 'short' | 'ultra'
 *   tr   how it is written in the transliteration */
export const VOWELS = {
  'ְ': { key: 'sheva',       he: 'שְׁוָא',           q: 'ə', len: 'ultra', tr: 'ə' },
  'ֱ': { key: 'hatafSegol',  he: 'חֲטַף סֶגוֹל',    q: 'e', len: 'ultra', tr: 'ĕ' },
  'ֲ': { key: 'hatafPatah',  he: 'חֲטַף פַּתַח',     q: 'a', len: 'ultra', tr: 'ă' },
  'ֳ': { key: 'hatafQamats', he: 'חֲטַף קָמָץ',     q: 'o', len: 'ultra', tr: 'ŏ' },
  'ִ': { key: 'hiriq',       he: 'חִירִיק',          q: 'i', len: 'short', tr: 'i' },
  'ֵ': { key: 'tsere',       he: 'צֵירֵי',           q: 'e', len: 'long',  tr: 'e' },
  'ֶ': { key: 'segol',       he: 'סֶגוֹל',           q: 'e', len: 'short', tr: 'e' },
  'ַ': { key: 'patah',       he: 'פַּתַח',            q: 'a', len: 'short', tr: 'a' },
  'ָ': { key: 'qamats',      he: 'קָמָץ',            q: 'a', len: 'long',  tr: 'a' },
  'ֹ': { key: 'holam',       he: 'חוֹלָם',           q: 'o', len: 'long',  tr: 'o' },
  'ֺ': { key: 'holamVav',    he: 'חוֹלָם מָלֵא',     q: 'o', len: 'long',  tr: 'o' },
  'ֻ': { key: 'qubuts',      he: 'קֻבּוּץ',           q: 'u', len: 'short', tr: 'u' },
  'ׇ': { key: 'qamatsQatan', he: 'קָמָץ קָטָן',      q: 'o', len: 'short', tr: 'o' },
};

/* Added by the reader, not written as a mark of its own: a vav holding a dot
 * with no vowel of its own is the long u. */
export const SHURUQ = { key: 'shuruq', he: 'שׁוּרוּק', q: 'u', len: 'long', tr: 'u' };

/** The six letters a dagesh can harden. */
const BEGADKEFAT = new Set(['ב', 'ג', 'ד', 'כ', 'פ', 'ת']);

/* Consonants, hard and soft. The soft readings are the ones a begadkefat
 * letter takes when it has no dagesh. */
const CONS = {
  'א': ['ʾ', 'ʾ'], 'ב': ['b', 'v'], 'ג': ['g', 'g'], 'ד': ['d', 'd'],
  'ה': ['h', 'h'], 'ו': ['v', 'v'], 'ז': ['z', 'z'], 'ח': ['ch', 'ch'],
  'ט': ['t', 't'], 'י': ['y', 'y'], 'כ': ['k', 'kh'], 'ל': ['l', 'l'],
  'מ': ['m', 'm'], 'נ': ['n', 'n'], 'ס': ['s', 's'], 'ע': ['ʿ', 'ʿ'],
  'פ': ['p', 'f'], 'צ': ['ts', 'ts'], 'ק': ['q', 'q'], 'ר': ['r', 'r'],
  'ש': ['sh', 'sh'], 'ת': ['t', 't'],
};

export const isLetter = ch => LETTER_RE.test(ch);
export const isPoint = ch =>
  (ch >= 'ְ' && ch <= 'ֽ') || ch === RAFE || ch === SHIN_DOT ||
  ch === SIN_DOT || ch === 'ׇ';

/** Strip every point, leaving the bare consonants. */
export const consonants = word => [...word].filter(isLetter).join('');

/**
 * Read a pointed word into one entry per written letter.
 *
 * Each entry: { letter, base, final, marks, vowel, dagesh, kind, shin, sin,
 *               meteg, silent, mater, shva }
 *   kind    'kal' (hardens the letter) | 'chazak' (doubles it) | 'mappiq' | null
 *   shva    'na' (sounded) | 'nach' (silent) | null
 *   mater   true when the letter is carrying the previous letter's vowel
 */
export function read(word) {
  const cl = [];
  for (const ch of word) {
    if (isLetter(ch)) {
      cl.push({
        letter: ch, base: BASE[ch] || ch, final: ch in BASE, marks: [],
        vowel: null, dagesh: false, kind: null, shin: false, sin: false,
        meteg: false, silent: false, mater: false, shva: null,
      });
    } else if (cl.length && isPoint(ch)) {
      cl[cl.length - 1].marks.push(ch);
    }
  }

  // --- first pass: what is written on each letter ---
  for (const c of cl) {
    for (const m of c.marks) {
      if (m === DAGESH) c.dagesh = true;
      else if (m === SHIN_DOT) c.shin = true;
      else if (m === SIN_DOT) c.sin = true;
      else if (m === METEG) c.meteg = true;
      else if (VOWELS[m] && !c.vowel) c.vowel = VOWELS[m];
    }
  }

  // --- second pass: the letters that are really vowels ---
  for (let i = 0; i < cl.length; i++) {
    const c = cl[i], prev = cl[i - 1];
    if (c.base === 'ו' && !c.vowel && c.dagesh && prev) {
      // וּ — a dot in a vav with nothing else is the long u.
      c.vowel = SHURUQ;
      c.mater = true;
      c.dagesh = false;
      if (!prev.vowel) prev.vowel = SHURUQ;
    } else if (c.base === 'ו' && c.vowel?.key === 'holam' && prev && !prev.vowel) {
      // וֹ — the vav is carrying the previous letter's o.
      c.mater = true;
      prev.vowel = c.vowel;
    } else if (c.base === 'י' && !c.vowel && prev?.vowel?.key === 'hiriq') {
      c.mater = true;                       // hiriq male
      c.silent = true;
    } else if (i === cl.length - 1 && c.base === 'ה' && !c.vowel && !c.dagesh) {
      c.mater = true;                       // a final he with no mappiq is mute
      c.silent = true;
    } else if ((c.base === 'א') && !c.vowel && i > 0) {
      c.silent = true;                      // a resting alef
    }
    if (c.base === 'ה' && c.dagesh && i === cl.length - 1) c.kind = 'mappiq';
  }

  // --- third pass: is each sheva sounded, and what kind of dagesh ---
  for (let i = 0; i < cl.length; i++) {
    const c = cl[i], prev = cl[i - 1];

    if (c.vowel?.key === 'sheva') {
      const last = i === cl.length - 1;
      if (last) c.shva = 'nach';                       // a word never ends on one
      else if (i === 0) c.shva = 'na';                 // except at the start
      else if (c.dagesh && !BEGADKEFAT.has(c.base)) c.shva = 'na';
      else if (prev?.shva === 'nach') c.shva = 'na';   // the second of two
      else if (prev?.vowel && prev.vowel.len === 'long' && !prev.meteg) c.shva = 'na';
      else c.shva = 'nach';
      if (c.shva === 'nach') c.silent = true;
    }

    if (c.dagesh && c.kind !== 'mappiq') {
      // A dagesh in one of the six only hardens it at the head of a syllable;
      // anywhere else, and in any other letter, it doubles.
      const atStart = i === 0 || prev?.shva === 'nach' || !prev?.vowel;
      c.kind = BEGADKEFAT.has(c.base) && atStart ? 'kal' : 'chazak';
    }
  }

  return cl;
}

/** Roughly how the word sounds, in Latin letters. */
export function translit(word) {
  const cl = read(word);
  let out = '';
  for (const c of cl) {
    if (c.mater && c.silent) continue;              // written, not sounded
    const pair = CONS[c.base];
    if (!pair) continue;

    if (!(c.mater && c.base === 'ו')) {
      let s;
      if (c.base === 'ש') s = c.sin ? 's' : 'sh';
      else if (BEGADKEFAT.has(c.base)) s = c.kind === 'kal' || c.kind === 'chazak' ? pair[0] : pair[1];
      else s = pair[0];
      if (c.kind === 'chazak' && !BEGADKEFAT.has(c.base)) s += s;   // doubled
      if (c.silent && c.vowel?.key !== 'sheva') s = '';             // resting alef
      out += s;
    }

    if (c.vowel && c.shva !== 'nach') {
      out += c.vowel.key === 'sheva' ? 'ə' : c.vowel.tr;
    }
  }
  return out.replace(/ʾ/g, '').replace(/ʿ/g, '’') || '—';
}

/* ------------------------------------------------------------- the music */

/* Vowels, heard as pitch. Bright vowels sit high and dark ones low, which is
 * roughly how the second formant actually behaves: i is the brightest sound
 * the mouth makes and u the darkest. */
export const VOWEL_STEP = { i: 2, e: 1, a: 0, 'ə': 0, o: -1, u: -2 };

/** How long a letter is held, by the vowel on it. */
export const VOWEL_LEN = { long: 1.5, short: 1, ultra: 0.5, none: 0.8, silent: 0.34 };

/** The pitch shift and length a cluster asks for. */
export function colour(c) {
  const silent = c.silent || c.shva === 'nach';
  const len = silent ? 'silent' : c.vowel ? c.vowel.len : 'none';
  return {
    step: c.vowel ? (VOWEL_STEP[c.vowel.q] ?? 0) : 0,
    hold: VOWEL_LEN[len],
    silent,
    accent: c.kind === 'chazak' ? 0.22 : c.kind === 'kal' || c.kind === 'mappiq' ? 0.1 : 0,
    doubled: c.kind === 'chazak',
  };
}
