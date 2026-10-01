/* Song library: public-domain songs, graded. Some are full songs written
   here; others reuse a piece from a lesson (`ref: "lessonId#index"`). */

import { lessonById, exercisesOf } from "./curriculum.js";

export const SONG_LEVELS = [
  { n: 1, label: "Beginner", stars: "★" },
  { n: 2, label: "Easy", stars: "★★" },
  { n: 3, label: "Intermediate", stars: "★★★" },
  { n: 4, label: "Advanced", stars: "★★★★" },
];

const RAW = [
  {
    id: "hot-cross-buns", title: "Hot Cross Buns", by: "Traditional", level: 1, after: "1-7",
    tip: "Only three fingers: 1, 2, 3. Measure 3 has eighth notes — two per beat.",
    ex: { ts: "4/4", tempo: 90, rh: "E4-3q D4-2 C4-1h | E4-3q D4-2 C4-1h | C4-1e C4-1 C4-1 C4-1 D4-2 D4-2 D4-2 D4-2 | E4-3q D4-2 C4-1h", lh: "C3-5w | C3-5w | C3-5h G3-1h | C3-5w" },
  },
  { id: "mary", title: "Mary Had a Little Lamb", by: "Traditional", level: 1, ref: "1-8#0", tip: "Right hand in C position — thumb on middle C." },
  { id: "ode", title: "Ode to Joy", by: "Ludwig van Beethoven", level: 1, ref: "2-7#0", tip: "Learn the right hand first, then add the left-hand bass." },
  {
    id: "frere-jacques", title: "Frère Jacques", by: "Traditional (France)", level: 1, after: "1-9",
    tip: "The left hand holds a C–G “drone” the whole time. In measure 5 the right hand moves up so finger 5 can reach A.",
    ex: { ts: "4/4", tempo: 96, rh: "C4-1q D4-2 E4-3 C4-1 | C4-1 D4-2 E4-3 C4-1 | E4-3 F4-4 G4-5h | E4-3q F4-4 G4-5h | G4-4e A4-5 G4-4 F4-3 E4-2q C4-1 | G4-4e A4-5 G4-4 F4-3 E4-2q C4-1 | C4-3q G3-1 C4-3h | C4-3q G3-1 C4-3h", lh: "C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w | C3-5+G3-1w" },
  },
  {
    id: "london-bridge", title: "London Bridge", by: "Traditional (England)", level: 1, after: "1-9",
    tip: "The hand starts one key higher than C position (thumb on D) so finger 5 reaches A.",
    ex: { ts: "4/4", tempo: 100, rh: "G4-4q. A4-5e G4-4q F4-3 | E4-2 F4-3 G4-4h | D4-1q E4-2 F4-3h | E4-2q F4-3 G4-4h | G4-4q. A4-5e G4-4q F4-3 | E4-2 F4-3 G4-4h | D4-1h G4-4h | E4-2q C4-1h.", lh: "C3-5w | C3-5w | G3-1w | C3-5w | C3-5w | C3-5w | G3-1w | C3-5w" },
  },
  { id: "twinkle", title: "Twinkle, Twinkle, Little Star", by: "Traditional (France)", level: 2, ref: "4-7#0", tip: "Left hand plays simple chords — watch the chord names above the music." },
  {
    id: "row-boat", title: "Row, Row, Row Your Boat", by: "Traditional", level: 2, after: "3-5",
    tip: "6/8 time: count “1-2-3-4-5-6”, feeling two big beats (1 and 4). Measure 5 is a fast broken C chord: fingers 5-3-2-1.",
    ex: { ts: "6/8", tempo: 96, rh: "C4-1q. C4-1q. | C4-1q D4-2e E4-3q. | E4-3q D4-2e E4-3q F4-4e | G4-5h. | C5-5e C5-5 C5-5 G4-3 G4-3 G4-3 | E4-2 E4-2 E4-2 C4-1 C4-1 C4-1 | G4-5q F4-4e E4-3q D4-2e | C4-1h.", lh: "C3-5+G3-1h. | C3-5+G3-1h. | C3-5+G3-1h. | C3-5+G3-1h. | C3-5+G3-1h. | C3-5+G3-1h. | B2-5+F3-2+G3-1h. | C3-5+G3-1h." },
  },
  {
    id: "happy-birthday", title: "Happy Birthday", by: "Mildred & Patty Hill", level: 2, after: "3-5",
    tip: "Starts with a pickup on beat 3. The big leap to high G in measure 5 is the fun part — move the hand early.",
    ex: { ts: "3/4", tempo: 100, pickup: 1, rh: "G4-1e G4-1 | A4-2q G4-1 C5-4 | B4-3h G4-1e G4-1 | A4-2q G4-1 D5-5 | C5-4h G4-1e G4-1 | G5-5q E5-3 C5-1 | B4-2q A4-1 F5-5e F5-5 | E5-4q C5-2 D5-3 | C5-2h.", lh: "rq | \"C\" C3-5+E3-3+G3-1h. | \"G7\" B2-5+F3-2+G3-1h. | B2-5+F3-2+G3-1h. | \"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"F\" C3-5+F3-2+A3-1h. | \"C\" C3-5+E3-3+G3-1h \"G7\" B2-5+F3-2+G3-1q | \"C\" C3-5+E3-3+G3-1h." },
  },
  { id: "jingle", title: "Jingle Bells", by: "James Lord Pierpont", level: 2, ref: "3-5#1" },
  { id: "saints", title: "When the Saints Go Marching In", by: "Traditional (USA)", level: 2, ref: "2-8#0" },
  {
    id: "silent-night", title: "Silent Night", by: "Franz Gruber", level: 3, after: "3-6",
    tip: "Gentle and legato. The dotted quarter + eighth rhythm rocks like a lullaby. Left hand: C, F and G chords.",
    ex: { ts: "3/4", tempo: 84, rh: "!p G4-2q. A4-3e G4-2q | E4-1h. | G4-2q. A4-3e G4-2q | E4-1h. | D5-5h D5-5q | B4-3h. | C5-4h C5-4q | G4-1h. | A4-3h A4-3q | C5-5q. B4-4e A4-3q | G4-2q. A4-3e G4-2q | E4-1h. | A4-3h A4-3q | C5-5q. B4-4e A4-3q | G4-2q. A4-3e G4-2q | E4-1h. | !mf D5-3h D5-3q | F5-5q. D5-3e B4-1q | C5-2h. | E5-4h. | !p C5-5q G4-2 E4-1 | G4-5q. F4-4e D4-2q | C4-1h.", lh: "\"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"G\" B2-5+D3-3+G3-1h. | B2-5+D3-3+G3-1h. | \"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"F\" C3-5+F3-2+A3-1h. | C3-5+F3-2+A3-1h. | \"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"F\" C3-5+F3-2+A3-1h. | C3-5+F3-2+A3-1h. | \"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"G\" B2-5+D3-3+G3-1h. | B2-5+D3-3+G3-1h. | \"C\" C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | C3-5+E3-3+G3-1h. | \"G\" B2-5+D3-3+G3-1h. | \"C\" C3-5+E3-3+G3-1h." },
  },
  {
    id: "greensleeves", title: "Greensleeves", by: "Traditional (England, 16th c.)", level: 3, after: "3-7",
    tip: "A minor with G♯ (harmonic minor). Keep the lilting long–short rhythm; the left hand plays open fifths.",
    ex: { key: "Am", ts: "3/4", tempo: 92, pickup: 1, rh: "A4-1q | C5-2h D5-3q | E5-4q. F5-5e E5-4q | D5-3h B4-1q | G4-1q. A4-2e B4-3q | C5-4h A4-2q | A4-2q. G#4-1e A4-2q | B4-3h G#4-1q | E4-1h A4-1q | C5-2h D5-3q | E5-4q. F5-5e E5-4q | D5-3h B4-1q | G4-1q. A4-2e B4-3q | C5-4q. B4-3e A4-2q | G#4-2q. F#4-1e G#4-2q | A4-3h.", lh: "rq | \"Am\" A2-5+E3-1h. | \"C\" C3-5+G3-1h. | \"G\" G2-5+D3-1h. | \"Em\" E2-5+B2-1h. | \"Am\" A2-5+E3-1h. | A2-5+E3-1h. | \"E\" E2-5+B2-1h. | \"Am\" A2-5+E3-1h. | A2-5+E3-1h. | \"C\" C3-5+G3-1h. | \"G\" G2-5+D3-1h. | \"Em\" E2-5+B2-1h. | \"Am\" A2-5+E3-1h. | \"E\" E2-5+B2-1h. | \"Am\" A2-5+E3-1h." },
  },
  { id: "canon", title: "Canon in D (chords)", by: "Johann Pachelbel", level: 3, ref: "4-6#0" },
  {
    id: "minuet-full", title: "Minuet in G (complete A section)", by: "Christian Petzold", level: 3, after: "5-6",
    tip: "Measures 9–14 repeat the opening; only the last two bars change to finish on G.",
    ex: { key: "G", ts: "3/4", tempo: 92, rh: "D5-5q G4-1e A4-2 B4-3 C5-4 | D5-5q G4-1 G4-1 | E5-5q C5-1e D5-2 E5-3 F#5-4 | G5-5q G4-1 G4-1 | C5-4q D5-5e C5-4 B4-3 A4-2 | B4-3q C5-4e B4-3 A4-2 G4-1 | F#4-2q G4-1e A4-2 B4-3 G4-1 | A4-2h. | D5-5q G4-1e A4-2 B4-3 C5-4 | D5-5q G4-1 G4-1 | E5-5q C5-1e D5-2 E5-3 F#5-4 | G5-5q G4-1 G4-1 | C5-4q D5-5e C5-4 B4-3 A4-2 | B4-3q C5-4e B4-3 A4-2 G4-1 | A4-2q B4-3e A4-2 G4-1 F#4-2 | G4-1h.", lh: "G3-5+B3-3+D4-1h A3-4q | B3-3h. | C4-2h. | B3-3h. | A3-4h. | G3-5h. | D4-1q B3-3 G3-5 | D4-1q D3-5 C4-1 | G3-5+B3-3+D4-1h A3-4q | B3-3h. | C4-2h. | B3-3h. | A3-4h. | G3-5h. | C4-2q D4-1 D3-5 | G3-1h." },
  },
  { id: "fur-elise", title: "Für Elise (opening)", by: "Ludwig van Beethoven", level: 4, ref: "6-4#0" },
  { id: "prelude-c", title: "Prelude in C (bars 1–8)", by: "Johann Sebastian Bach", level: 4, ref: "6-5#0" },
  { id: "gymnopedie", title: "Gymnopédie No. 1 (opening)", by: "Erik Satie", level: 4, ref: "6-6#0" },
  { id: "blues", title: "12-Bar Blues in C", by: "Blues tradition", level: 4, ref: "6-2#1" },
];

export const SONGS = RAW.map((s) => {
  if (!s.ref) return { ...s, ex: { title: s.title, ...s.ex } };
  const [lid, i] = s.ref.split("#");
  const ls = lessonById(lid);
  const ex = exercisesOf(ls)[+i];
  return { ...s, after: s.after || lid, ex: { ...ex, title: s.title }, lesson: lid, tip: s.tip || ex.desc };
});
export const songById = (id) => SONGS.find((s) => s.id === id);
