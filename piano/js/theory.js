/* Music theory core: spelled notes, scales, chords, keys, fingerings.
   A note is always *spelled* (letter + accidental + octave) because the staff
   needs to know whether a black key is C# or Db — MIDI numbers alone can't say. */

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const ACC_TEXT = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };
const ACC_ASCII = { "-2": "bb", "-1": "b", "0": "", "1": "#", "2": "x" };
const SOLFEGE = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

let nameStyle = "letters";
export function setNameStyle(s) { nameStyle = s === "solfege" ? "solfege" : "letters"; }
export function getNameStyle() { return nameStyle; }

export function makeNote(letter, acc, oct) {
  const li = typeof letter === "number" ? letter : LETTERS.indexOf(letter);
  const midi = 12 * (oct + 1) + NATURAL[li] + acc;
  return { letter: LETTERS[li], li, acc, oct, midi, step: oct * 7 + li };
}

/* "C4", "F#3", "Bb5", "Ebb4", "Fx2", "Cn4" */
export function parseNote(s) {
  const m = /^([A-G])(bb|b|#|x|n)?(-?\d)$/.exec(s);
  if (!m) return null;
  const acc = { bb: -2, b: -1, "#": 1, x: 2, n: 0 }[m[2]] ?? 0;
  const n = makeNote(m[1], acc, +m[3]);
  if (m[2] === "n") n.forceNatural = true;
  return n;
}

export const N = (s) => parseNote(s);

export function noteId(n) { return n.letter + ACC_ASCII[n.acc] + n.oct; }

/* Display name without octave, e.g. "F♯" or "Fa♯". */
export function pcLabel(n) {
  const base = nameStyle === "solfege" ? SOLFEGE[n.li] : n.letter;
  return base + ACC_TEXT[n.acc];
}
export function fullLabel(n) { return pcLabel(n) + n.oct; }
export function accText(a) { return ACC_TEXT[a]; }

const SHARP_SPELL = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

export function fromMidi(midi, preferFlat = false) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  const [li, acc] = (preferFlat ? FLAT_SPELL : SHARP_SPELL)[pc];
  return makeNote(li, acc, oct);
}

export function midiLabel(midi, preferFlat = false) {
  const n = fromMidi(midi, preferFlat);
  if (n.acc === 0) return fullLabel(n);
  const alt = fromMidi(midi, !preferFlat);
  return pcLabel(n) + "/" + pcLabel(alt) + n.oct;
}

export const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const isBlack = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

/* Build notes from a tonic by [degree, semitones] pairs so spelling is correct:
   degree picks the letter, semitones fixes the accidental. */
export function build(tonic, formula) {
  return formula.map(([deg, semi]) => {
    const li = (tonic.li + deg) % 7;
    const oct = tonic.oct + Math.floor((tonic.li + deg) / 7);
    const nat = makeNote(li, 0, oct);
    return makeNote(li, tonic.midi + semi - nat.midi, oct);
  });
}

export const SCALES = {
  major:          { name: "Major",            f: [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,11]], steps: "W W H W W W H" },
  natural_minor:  { name: "Natural minor",    f: [[0,0],[1,2],[2,3],[3,5],[4,7],[5,8],[6,10]], steps: "W H W W H W W" },
  harmonic_minor: { name: "Harmonic minor",   f: [[0,0],[1,2],[2,3],[3,5],[4,7],[5,8],[6,11]], steps: "W H W W H W+H H" },
  melodic_minor:  { name: "Melodic minor (up)", f: [[0,0],[1,2],[2,3],[3,5],[4,7],[5,9],[6,11]], steps: "W H W W W W H" },
  major_pent:     { name: "Major pentatonic", f: [[0,0],[1,2],[2,4],[4,7],[5,9]], steps: "W W W+H W W+H" },
  minor_pent:     { name: "Minor pentatonic", f: [[0,0],[2,3],[3,5],[4,7],[6,10]], steps: "W+H W W W+H W" },
  blues:          { name: "Blues",            f: [[0,0],[2,3],[3,5],[3,6],[4,7],[6,10]], steps: "W+H W H H W+H W" },
  dorian:         { name: "Dorian mode",      f: [[0,0],[1,2],[2,3],[3,5],[4,7],[5,9],[6,10]], steps: "W H W W W H W" },
  phrygian:       { name: "Phrygian mode",    f: [[0,0],[1,1],[2,3],[3,5],[4,7],[5,8],[6,10]], steps: "H W W W H W W" },
  lydian:         { name: "Lydian mode",      f: [[0,0],[1,2],[2,4],[3,6],[4,7],[5,9],[6,11]], steps: "W W W H W W H" },
  mixolydian:     { name: "Mixolydian mode",  f: [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,10]], steps: "W W H W W H W" },
  locrian:        { name: "Locrian mode",     f: [[0,0],[1,1],[2,3],[3,5],[4,6],[5,8],[6,10]], steps: "H W W H W W W" },
  chromatic:      { name: "Chromatic",        f: null, steps: "H H H H H H H H H H H H" },
};

export const CHORDS = {
  maj:   { name: "Major",              sym: "",      f: [[0,0],[2,4],[4,7]],            parts: ["root", "major 3rd", "perfect 5th"] },
  min:   { name: "Minor",              sym: "m",     f: [[0,0],[2,3],[4,7]],            parts: ["root", "minor 3rd", "perfect 5th"] },
  dim:   { name: "Diminished",         sym: "dim",   f: [[0,0],[2,3],[4,6]],            parts: ["root", "minor 3rd", "diminished 5th"] },
  aug:   { name: "Augmented",          sym: "aug",   f: [[0,0],[2,4],[4,8]],            parts: ["root", "major 3rd", "augmented 5th"] },
  sus2:  { name: "Suspended 2nd",      sym: "sus2",  f: [[0,0],[1,2],[4,7]],            parts: ["root", "major 2nd", "perfect 5th"] },
  sus4:  { name: "Suspended 4th",      sym: "sus4",  f: [[0,0],[3,5],[4,7]],            parts: ["root", "perfect 4th", "perfect 5th"] },
  maj7:  { name: "Major 7th",          sym: "maj7",  f: [[0,0],[2,4],[4,7],[6,11]],     parts: ["root", "major 3rd", "perfect 5th", "major 7th"] },
  dom7:  { name: "Dominant 7th",       sym: "7",     f: [[0,0],[2,4],[4,7],[6,10]],     parts: ["root", "major 3rd", "perfect 5th", "minor 7th"] },
  min7:  { name: "Minor 7th",          sym: "m7",    f: [[0,0],[2,3],[4,7],[6,10]],     parts: ["root", "minor 3rd", "perfect 5th", "minor 7th"] },
  m7b5:  { name: "Half-diminished",    sym: "m7♭5",  f: [[0,0],[2,3],[4,6],[6,10]],     parts: ["root", "minor 3rd", "diminished 5th", "minor 7th"] },
  dim7:  { name: "Diminished 7th",     sym: "dim7",  f: [[0,0],[2,3],[4,6],[6,9]],      parts: ["root", "minor 3rd", "diminished 5th", "diminished 7th"] },
  add9:  { name: "Add 9",              sym: "add9",  f: [[0,0],[2,4],[4,7],[8,14]],     parts: ["root", "major 3rd", "perfect 5th", "9th"] },
  maj9:  { name: "Major 9th",          sym: "maj9",  f: [[0,0],[2,4],[4,7],[6,11],[8,14]], parts: ["root", "major 3rd", "perfect 5th", "major 7th", "9th"] },
  dom9:  { name: "Dominant 9th",       sym: "9",     f: [[0,0],[2,4],[4,7],[6,10],[8,14]], parts: ["root", "major 3rd", "perfect 5th", "minor 7th", "9th"] },
  min9:  { name: "Minor 9th",          sym: "m9",    f: [[0,0],[2,3],[4,7],[6,10],[8,14]], parts: ["root", "minor 3rd", "perfect 5th", "minor 7th", "9th"] },
};

export const INTERVALS = [
  "Unison", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th",
  "Tritone", "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th", "Octave",
];

/* Key signatures: positive = sharps, negative = flats. */
export const KEY_SIG = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6,
};
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (letter indices)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F

/* letter index -> accidental implied by the key signature */
export function keyAccidentals(key) {
  const n = KEY_SIG[key] ?? 0;
  const map = {};
  if (n > 0) SHARP_ORDER.slice(0, n).forEach((li) => (map[li] = 1));
  if (n < 0) FLAT_ORDER.slice(0, -n).forEach((li) => (map[li] = -1));
  return map;
}
export function keySigList(key) {
  const n = KEY_SIG[key] ?? 0;
  return n >= 0 ? SHARP_ORDER.slice(0, n).map((li) => [li, 1]) : FLAT_ORDER.slice(0, -n).map((li) => [li, -1]);
}

export const CIRCLE = [
  { maj: "C", min: "Am" }, { maj: "G", min: "Em" }, { maj: "D", min: "Bm" },
  { maj: "A", min: "F#m" }, { maj: "E", min: "C#m" }, { maj: "B", min: "G#m" },
  { maj: "F#", alt: "Gb", min: "D#m" }, { maj: "Db", min: "Bbm" }, { maj: "Ab", min: "Fm" },
  { maj: "Eb", min: "Cm" }, { maj: "Bb", min: "Gm" }, { maj: "F", min: "Dm" },
];

export const TONICS = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];

export function tonicNote(name, oct = 4) { return parseNote(name + oct); }

/* Standard one-octave scale fingerings (8 notes ascending, tonic to tonic). */
const C_TYPE = { R: [1,2,3,1,2,3,4,5], L: [5,4,3,2,1,3,2,1] };
export const MAJOR_FINGERING = {
  C: C_TYPE, G: C_TYPE, D: C_TYPE, A: C_TYPE, E: C_TYPE,
  B:  { R: [1,2,3,1,2,3,4,5], L: [4,3,2,1,4,3,2,1] },
  F:  { R: [1,2,3,4,1,2,3,4], L: [5,4,3,2,1,3,2,1] },
  Bb: { R: [4,1,2,3,1,2,3,4], L: [3,2,1,4,3,2,1,3] },
  Eb: { R: [3,1,2,3,4,1,2,3], L: [3,2,1,4,3,2,1,3] },
  Ab: { R: [3,4,1,2,3,1,2,3], L: [3,2,1,4,3,2,1,3] },
  Db: { R: [2,3,1,2,3,4,1,2], L: [3,2,1,4,3,2,1,3] },
  "C#": { R: [2,3,1,2,3,4,1,2], L: [3,2,1,4,3,2,1,3] },
  "F#": { R: [2,3,4,1,2,3,1,2], L: [4,3,2,1,3,2,1,4] },
  Gb: { R: [2,3,4,1,2,3,1,2], L: [4,3,2,1,3,2,1,4] },
};
export const MINOR_FINGERING = { A: C_TYPE, D: C_TYPE, E: C_TYPE, G: C_TYPE, C: C_TYPE };

export function scaleFingering(tonic, type) {
  if (type === "major") return MAJOR_FINGERING[tonic] || null;
  if (["natural_minor", "harmonic_minor", "melodic_minor", "dorian", "mixolydian", "lydian", "phrygian"].includes(type)) {
    return (type.endsWith("minor") ? MINOR_FINGERING[tonic] : null) || null;
  }
  return null;
}

/* Scale notes as spelled note objects spanning one octave (tonic..tonic). */
export function scaleNotes(tonicName, type, oct = 4) {
  const t = tonicNote(tonicName, oct);
  if (type === "chromatic") {
    const flat = tonicName.includes("b") || tonicName === "F";
    return Array.from({ length: 13 }, (_, i) => fromMidi(t.midi + i, flat));
  }
  const notes = build(t, SCALES[type].f);
  notes.push(makeNote(t.li, t.acc, t.oct + 1));
  return notes;
}

export function chordNotes(rootName, type, oct = 4, inversion = 0) {
  const r = tonicNote(rootName, oct);
  let notes = build(r, CHORDS[type].f);
  for (let i = 0; i < inversion && i < notes.length - 1; i++) {
    const n = notes.shift();
    notes.push(makeNote(n.li, n.acc, n.oct + 1));
  }
  return notes;
}

/* Diatonic triads of a major key with roman numerals. */
export function diatonicChords(key, sevenths = false) {
  const minor = key.endsWith("m");
  const tonic = minor ? key.slice(0, -1) : key;
  const sc = build(tonicNote(tonic, 4), SCALES[minor ? "natural_minor" : "major"].f);
  const qualities = minor
    ? (sevenths ? ["min7", "m7b5", "maj7", "min7", "min7", "maj7", "dom7"] : ["min", "dim", "maj", "min", "min", "maj", "maj"])
    : (sevenths ? ["maj7", "min7", "min7", "maj7", "dom7", "min7", "m7b5"] : ["maj", "min", "min", "maj", "maj", "min", "dim"]);
  const romans = minor ? ["i", "ii°", "III", "iv", "v", "VI", "VII"] : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  return sc.map((n, i) => ({
    root: n, type: qualities[i], roman: romans[i],
    name: pcLabel(n) + CHORDS[qualities[i]].sym,
    notes: build(n, CHORDS[qualities[i]].f),
  }));
}

export function intervalName(semi) {
  const s = Math.abs(semi);
  if (s <= 12) return INTERVALS[s];
  return INTERVALS[s % 12] + " + octave";
}
