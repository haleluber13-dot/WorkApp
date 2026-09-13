/* Otiyot — styles.
 *
 * A style decides what kind of record the text becomes: how fast, what grid
 * the letters land on, which drums run underneath, what the bass does and what
 * the melody is played on. The letters themselves never change — only the
 * clothes they arrive in.
 *
 * Patterns are written as step strings so they read like a drum machine:
 *   X  hard    x  normal    o  soft    -  ghost    .  rest
 * A pattern is any length and loops; 16 steps is one bar of 16ths.
 */

const HIT = { X: 1, x: 0.82, o: 0.58, '-': 0.3, '.': 0 };

/** "x..x" -> [0.82, 0, 0, 0.82] */
export function steps(str) {
  return [...str.replace(/\s/g, '')].map(c => HIT[c] ?? 0);
}

/* Every style is the same shape, so the sequencer never special-cases one.
 *
 *   bpm      beats per minute this style wants (the user can override it)
 *   grid     steps per beat — 4 means the letters sit on sixteenths
 *   per      steps each letter occupies before the next one starts
 *   swing    0–0.4, how far the off-steps are pushed late
 *   lead     which synth plays the letters, and in which octave
 *   bass     'roll' | 'sub' | 'sustain' | 'walk' | 'none'
 *   kit      drum voices + the pattern each one plays
 *   fx       delay / reverb / drive for the whole style
 *   gate     note length as a fraction of the step
 *   barGap   bars of groove left running between verses
 */
export const STYLES = {

  scroll: {
    name: 'Ambient Scroll',
    blurb: 'The plain reading. One letter per beat, no drums, room to think.',
    free: true,                      // flowing durations rather than a step grid
    bpm: 132, grid: 1, per: 1, swing: 0,
    lead: { voice: 'pluck', oct: 0 },
    bass: 'sustain',
    fx: { reverb: 0.34, delay: 0, feedback: 0, drive: 0 },
  },

  drone: {
    name: 'Drone',
    blurb: 'Each letter held until it blurs into the next. Barely music, mostly weather.',
    free: true,
    bpm: 42, grid: 1, per: 1, swing: 0,
    lead: { voice: 'bell', oct: 0 },
    bass: 'sustain',
    fx: { reverb: 0.62, delay: 0.5, feedback: 0.4, drive: 0 },
  },

  goa: {
    name: 'Goa Trance',
    blurb: 'The 1996 sound: 16th-note acid leads, a rolling offbeat bass and a lot of delay.',
    bpm: 145, grid: 4, per: 1, swing: 0, gate: 0.82,
    lead: { voice: 'acid', oct: 1 },
    bass: 'roll',
    kit: {
      kick:  { voice: 'kick_psy',  p: 'X...X...X...X...' },
      hat:   { voice: 'hat',       p: '..x...x...x...x.' },
      ohat:  { voice: 'ohat',      p: '....o.......o...' },
      snare: { voice: 'clap',      p: '................x...............' },
      perc:  { voice: 'perc',      p: '...-..-....-..-.' },
    },
    fx: { reverb: 0.26, delay: 0.1875, feedback: 0.42, drive: 0.3 },  // 3/16 delay
    barGap: 1,
  },

  fullon: {
    name: 'Full-On Psy',
    blurb: 'Night-sky festival psy — a triplet-feel rolling bass under a bright, busy lead.',
    bpm: 142, grid: 4, per: 1, swing: 0, gate: 0.7,
    lead: { voice: 'saw', oct: 1 },
    bass: 'roll',
    kit: {
      kick:  { voice: 'kick_psy',  p: 'X...X...X...X...' },
      hat:   { voice: 'hat',       p: '..x...x...x...x.' },
      ohat:  { voice: 'ohat',      p: '......o.......o.' },
      snare: { voice: 'clap',      p: '................' },
      perc:  { voice: 'perc',      p: '.-.-.-.-.-.-.-.-' },
    },
    fx: { reverb: 0.24, delay: 0.1875, feedback: 0.34, drive: 0.35 },
    barGap: 1,
  },

  hitech: {
    name: 'Hi-Tech',
    blurb: 'Twice the speed and none of the patience. Frantic 16ths, glitching percussion.',
    bpm: 195, grid: 4, per: 1, swing: 0, gate: 0.55,
    lead: { voice: 'acid', oct: 1 },
    bass: 'roll',
    kit: {
      kick:  { voice: 'kick_psy',  p: 'X...X...X...X...' },
      hat:   { voice: 'hat',       p: '..x.x.x...x.x.x.' },
      ohat:  { voice: 'ohat',      p: '............o...' },
      snare: { voice: 'snare',     p: '..........-....x' },
      perc:  { voice: 'perc',      p: '-.--.-.--.-.--.-' },
    },
    fx: { reverb: 0.18, delay: 0.09375, feedback: 0.38, drive: 0.55 },
    barGap: 0,
  },

  psycore: {
    name: 'Psycore',
    blurb: 'Distorted kick, screaming lead, no room left. The text at terminal velocity.',
    bpm: 232, grid: 4, per: 1, swing: 0, gate: 0.5,
    lead: { voice: 'acid', oct: 1 },
    bass: 'roll',
    kit: {
      kick:  { voice: 'kick_dist', p: 'X...X...X...X...' },
      hat:   { voice: 'hat',       p: '.xx.xx.xx.xx.xx.' },
      ohat:  { voice: 'ohat',      p: '......o.......o.' },
      snare: { voice: 'snare',     p: '....x.......x..x' },
      perc:  { voice: 'perc',      p: 'x-x-x-x-x-x-x-x-' },
    },
    fx: { reverb: 0.16, delay: 0.078, feedback: 0.3, drive: 0.85 },
    barGap: 0,
  },

  dnb: {
    name: 'Drum & Bass',
    blurb: 'Half-time breakbeat at 174 with a sub that sits under everything.',
    bpm: 174, grid: 4, per: 1, swing: 0.06, gate: 0.7,
    lead: { voice: 'pluck', oct: 1 },
    bass: 'sub',
    kit: {
      kick:  { voice: 'kick_punch', p: 'x.......' + '..x.....' + 'x.....x.' + '........' },
      snare: { voice: 'snare',      p: '....X.......' + '....X...' + '....' + '............' },
      hat:   { voice: 'hat',        p: '..x...x...x...x.' },
      ohat:  { voice: 'ohat',       p: '..............o.' },
      perc:  { voice: 'perc',       p: '.-....-..-....-.' },
    },
    fx: { reverb: 0.22, delay: 0.1, feedback: 0.25, drive: 0.2 },
    barGap: 1,
  },

  trap: {
    name: 'Trap',
    blurb: 'Half-time snare, gliding 808 and hats that stutter into triplet rolls.',
    bpm: 142, grid: 4, per: 2, swing: 0, gate: 0.6,
    lead: { voice: 'bell', oct: 1 },
    bass: 'sub',
    kit: {
      kick:  { voice: 'kick_808',  p: 'X.....X...X.....' + 'X.....X.....X...' },
      snare: { voice: 'snare',     p: '........X.......' },
      hat:   { voice: 'hat',       p: 'x.x.x.xxxxx.x.x.' + 'x.x.x.x.xxxxxxxx' },
      ohat:  { voice: 'ohat',      p: '..............o.' },
      perc:  { voice: 'perc',      p: '................' },
    },
    fx: { reverb: 0.24, delay: 0.14, feedback: 0.2, drive: 0.15 },
    barGap: 1,
  },

  boombap: {
    name: 'Boom Bap',
    blurb: 'Ninety BPM, swung, dusty. The letters become the sample you rap over.',
    bpm: 90, grid: 4, per: 2, swing: 0.2, gate: 0.75,
    lead: { voice: 'rhodes', oct: 0 },
    bass: 'walk',
    kit: {
      kick:  { voice: 'kick_soft', p: 'X.....x...X.....' },
      snare: { voice: 'snare',     p: '....X.......X...' },
      hat:   { voice: 'hat',       p: 'x.x.x.x.x.x.x.x.' },
      ohat:  { voice: 'ohat',      p: '..........o.....' },
      perc:  { voice: 'perc',      p: '................' },
    },
    fx: { reverb: 0.3, delay: 0.16, feedback: 0.18, drive: 0.25 },
    barGap: 1,
  },

  techno: {
    name: 'Techno',
    blurb: 'Four to the floor, offbeat open hat, one idea repeated until it changes you.',
    bpm: 132, grid: 4, per: 1, swing: 0, gate: 0.6,
    lead: { voice: 'stab', oct: 0 },
    bass: 'walk',
    kit: {
      kick:  { voice: 'kick_punch', p: 'X...X...X...X...' },
      ohat:  { voice: 'ohat',       p: '..o...o...o...o.' },
      hat:   { voice: 'hat',        p: 'x.x.x.x.x.x.x.x.' },
      snare: { voice: 'clap',       p: '....x.......x...' },
      perc:  { voice: 'perc',       p: '.......-.......-' },
    },
    fx: { reverb: 0.28, delay: 0.125, feedback: 0.3, drive: 0.3 },
    barGap: 1,
  },

  dub: {
    name: 'Dub',
    blurb: 'Slow, deep and mostly echo. Chords fall on the offbeat and drift away.',
    bpm: 74, grid: 4, per: 2, swing: 0.12, gate: 0.5,
    lead: { voice: 'stab', oct: 0 },
    bass: 'walk',
    kit: {
      kick:  { voice: 'kick_soft', p: 'X.......X.......' },
      snare: { voice: 'snare',     p: '........x.......' },
      hat:   { voice: 'hat',       p: '..x...x...x...x.' },
      ohat:  { voice: 'ohat',      p: '............o...' },
      perc:  { voice: 'perc',      p: '......-.......-.' },
    },
    fx: { reverb: 0.45, delay: 0.24, feedback: 0.55, drive: 0.2 },
    barGap: 1,
  },

  downtempo: {
    name: 'Downtempo',
    blurb: 'Unhurried, warm, a little hazy. For reading along rather than dancing.',
    bpm: 86, grid: 4, per: 2, swing: 0.14, gate: 0.8,
    lead: { voice: 'rhodes', oct: 0 },
    bass: 'sustain',
    kit: {
      kick:  { voice: 'kick_soft', p: 'X.......x.......' },
      snare: { voice: 'snare',     p: '....o.......o...' },
      hat:   { voice: 'hat',       p: '..-...x...-...x.' },
      ohat:  { voice: 'ohat',      p: '..............o.' },
      perc:  { voice: 'perc',      p: '................' },
    },
    fx: { reverb: 0.4, delay: 0.2, feedback: 0.28, drive: 0.1 },
    barGap: 1,
  },
};

/** Bass patterns per mode, as steps within one bar of 16ths. */
export const BASS_PATTERNS = {
  // Classic psytrance: kick on the beat, bass on the three sixteenths after it.
  roll: '.xxx.xxx.xxx.xxx',
  walk: 'x.......x.......',
  sub:  'x...............',
};

export const STYLE_LIST = Object.entries(STYLES).map(([id, s]) => ({ id, ...s }));

/** Sensible BPM bounds per style, so the slider stays in the genre's world. */
export function bpmRange(styleId) {
  const s = STYLES[styleId] || STYLES.scroll;
  if (s.free) return { min: 20, max: 300 };
  return { min: Math.max(40, Math.round(s.bpm * 0.55)), max: Math.round(s.bpm * 1.6) };
}
