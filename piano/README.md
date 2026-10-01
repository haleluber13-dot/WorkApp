# 🎹 PianoPath — learn piano from zero to pro

A complete piano course that lives on your phone. Stand the phone on the music
rack, and it shows you — key by key and finger by finger — what to play on your
real piano, then **listens** and moves on when you get it right.

Open it at `/piano/` (installable as an app; works offline once loaded).

## What's inside

- **Onboarding** — asks your level (and skips what you know), what you play on,
  note-name style (C D E or Do Re Mi) and a daily goal.
- **Today's practice** — a daily plan on the home screen: warm-up (scale of the
  week), today's lesson, a review of the exercise you practiced longest ago, a
  2-minute reading/ear drill, and a song.
- **Real grand-piano sound** — Salamander Grand Piano samples (CC-BY 3.0,
  Alexander Holm), cached for offline use; a synth fallback.
- **18 songs** graded ★ to ★★★★ (Hot Cross Buns → Happy Birthday, Silent Night,
  Greensleeves, Minuet in G, Für Elise, Bach, Satie, blues).
- **Glossary** of every term and symbol, searchable, with examples you can hear.

## The course — 47 lessons, 68 playable exercises

| Level | What you learn |
|---|---|
| 1 · First Steps | Posture & hand shape, finger numbers, finding C, note names, middle C & C position, counting rhythm, first songs (Mary Had a Little Lamb, Ode to Joy) |
| 2 · Reading Music | Treble & bass clef with landmark notes, grand staff, hands together, intervals, 3/4 & rests, sharps/flats & half steps, Ode to Joy HT, When the Saints |
| 3 · Scales & Keys | Major-scale formula, thumb-under / cross-over technique, C major HT & contrary motion, eighth & dotted rhythms (Jingle Bells), G/F major & key signatures, minor scales, circle of fifths |
| 4 · Chords & Harmony | Triads & qualities, I–IV–V with inversions & voice leading, I–V–vi–IV, Alberti bass & broken chords, Pachelbel's Canon, playing from lead sheets |
| 5 · Technique & Expression | Dynamics & articulation, legato pedalling, 2-octave arpeggios, Hanon No. 1, seventh chords & ii–V–I, Minuet in G (Petzold), how professionals practice |
| 6 · Advanced Musicianship | Modes, blues scale & 12-bar blues, jazz shell & rootless voicings, Für Elise, Bach Prelude in C, Satie Gymnopédie No. 1, sight-reading/memory/performance, the path to professional |

Every lesson: short explanation → keyboard diagrams with finger numbers →
quiz questions → exercises.

## The practice screen

- **Sheet music** (grand staff, key/time signatures, beams, fingerings, dynamics,
  chord symbols, pedal marks) that scrolls with you and highlights the current notes.
- **Keyboard** that lights up the keys to press — blue = right hand, orange =
  left hand — with the finger number on each key.
- A line that spells it out: *Right E₄ ③ · Left C₃ ⑤*.
- **▶ Listen** — plays it at your tempo with a count-in and metronome, showing bar and beat.
- **🎯 Play along** — the music moves in time; notes you hit on the beat turn
  green, missed ones red; you get a score and whether you're early or late.
- **✋ Step by step** — waits at each step until you play it. Input from:
  - **🎤 microphone** — hears your acoustic/digital piano (pitch detection for
    single notes, chroma matching for chords; repeated notes need a fresh strike),
  - **🎹 MIDI** keyboard (USB/Bluetooth via Web MIDI — exact, best for chords),
  - or tapping the on-screen keys.
- Hands separately or together — the app can **play the other hand for you**.
- **Practice just some bars**: tap the music or use 📍 (bar numbers are shown).
- **Say the notes out loud**, auto speed-up after a perfect run, tempo ±, loop,
  hint, skip, music size, **record yourself and listen back**, full screen, and
  the screen stays awake while you practice.
- Wrong-note count and accuracy at the end. Finishing all exercises completes the lesson.

## Tools

Scale & chord finder (any key, correct spelling, standard fingerings, generates
a practice exercise) · Note-reading trainer (treble/bass/ledger/accidentals,
60-second rounds, answer on your piano) · Ear trainer (intervals, chord
qualities) · Circle of fifths (key signatures, diatonic chords) · Metronome
(accents, subdivisions, tap tempo) · Piano & note finder (play a note on your
piano, see its name and where it's written).

Progress (lessons, daily minutes, streak, records) and settings (letter or
Do-Re-Mi names, key labels, theme, volume, mic sensitivity) are stored in the
browser, with backup/restore.

## Code

No build step, no dependencies. Sound is recorded piano samples played through
Web Audio (with a synth fallback).

```
index.html  styles.css  sw.js  manifest.webmanifest
js/theory.js     spelled notes, scales, chords, keys, fingerings
js/score.js      exercise notation parser (see below)
js/staff.js      SVG sheet-music renderer
js/keyboard.js   SVG keyboard
js/audio.js      synth, metronome click, scheduler
js/listen.js     microphone pitch/chord detection, Web MIDI
js/practice.js   practice screen
js/curriculum.js the course content
js/tools.js      tools
js/songs.js      song library
js/glossary.js   glossary
samples/         piano samples (Salamander, CC-BY 3.0)
js/store.js      progress & settings
js/app.js        routing and pages
```

### Writing exercises

Each hand is a string of tokens (an array of strings gives several voices):

```
C4-1q        C4, finger 1, quarter      (w h q e s; "." dotted, ".." double-dotted)
C4-1+E4-3+G4-5h   chord                  rq / rh.   rests
E4-3e'       staccato                    |          bar line (checked by the validator only)
!p !mf !f    dynamics                    !ped / !*  pedal down(change) / up
"Am7"        chord symbol (_ = space)    durations are sticky
```

```js
{ title: "Ode to Joy", ts: "4/4", key: "C", tempo: 88,
  rh: "E4-3q E4-3 F4-4 G4-5 | ...", lh: "C3-5w | G3-1w | ..." }
```

When app files change, bump `CACHE` in `sw.js`.
