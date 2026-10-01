/* The course. Six levels, from "which finger is 1?" to Bach, Satie and jazz
   voicings. Every lesson mixes explanation, keyboard diagrams, quizzes and
   exercises you can watch, then play step by step on your own piano. */

const p = (html) => ({ t: "p", html });
const h = (text) => ({ t: "h", text });
const tip = (html) => ({ t: "tip", html });
const warn = (html) => ({ t: "warn", html });
const list = (items, ordered = false) => ({ t: "list", items, ordered });
const quiz = (q, options, answer, why) => ({ t: "quiz", q, options, answer, why });
/* "C4:1R E4:3R G4L" -> [{n, f, h}] */
const keys = (spec, opts = {}) => ({
  t: "kb",
  notes: spec.trim().split(/\s+/).filter(Boolean).map((s) => {
    const m = /^([A-G][#b]?\d)(?::(\d))?([RL])?$/.exec(s);
    return { n: m[1], f: m[2] ? +m[2] : null, h: m[3] || "R" };
  }),
  ...opts,
});
const ex = (o) => ({ t: "ex", ...o });
const tool = (id, label) => ({ t: "tool", id, label });

export const LEVELS = [
  /* ─────────────────────────── LEVEL 1 ─────────────────────────── */
  {
    id: "L1", title: "First Steps", sub: "Never touched a piano? Start here.", color: "#34d399",
    lessons: [
      {
        id: "1-1", title: "Welcome — how this course works", mins: 3,
        goals: ["Know how each lesson is built", "Set up your phone next to the piano", "Try the practice screen"],
        body: [
          p("This course takes you from your very first note to real repertoire — Bach, Beethoven, Satie, blues and jazz harmony. Every lesson is short and does one thing well. Go in order; each lesson uses skills from the ones before it."),
          h("Every lesson has three parts"),
          list([
            "<b>Understand</b> — a short explanation with pictures of the keyboard showing exactly which keys and fingers to use.",
            "<b>Check</b> — quick quiz questions so you know you really understood.",
            "<b>Play</b> — exercises. Tap <b>Practice</b> to open the practice screen: the music scrolls at the top, the keyboard at the bottom lights up the keys to press, and the colored circles show which finger to use.",
          ]),
          h("Set up your phone"),
          list([
            "Stand the phone on the music rack of your piano, right in front of you — turn it sideways (landscape) for the biggest keyboard.",
            "<b>Blue</b> = right hand. <b>Orange</b> = left hand. The number in the circle is the finger.",
            "In the practice screen, <b>▶ Listen</b> plays the exercise so you hear how it should sound. <b>✋ Step by step</b> waits for you to play each note before moving on — no rush. <b>🎯 Play along</b> moves in time and scores how many notes you hit on the beat.",
            "Stuck on a hard spot? Tap the music (or <b>📍</b>) to practice just those bars. Practicing one hand? The app can play the other hand for you. It can even say each note out loud (⚙ Options).",
            "Tap <b>⏺</b> to record yourself and listen back — the fastest way to hear what to improve.",
            "Tap <b>🎤</b> and the app listens to your real piano through the microphone and moves on by itself when you play the right note. Plugged in a MIDI/digital keyboard? Tap <b>MIDI</b> — it's exact, even for chords.",
            "No piano with you? Tap the keys on the screen instead.",
          ]),
          tip("Practice a little every day. Fifteen focused minutes daily beats two hours once a week — your fingers learn while you sleep between sessions."),
          ex({ title: "Try it: play one note", desc: "Tap Practice, then ✋ Step by step. Play the lit-up key (it's middle C) with your right thumb — finger 1.", ts: "4/4", tempo: 70, rh: "C4-1w C4-1w" }),
        ],
      },
      {
        id: "1-2", title: "Sitting & hand shape", mins: 4,
        goals: ["Sit at the right height and distance", "Make a relaxed, curved hand", "Avoid habits that cause tension"],
        body: [
          p("Good posture isn't about looking elegant — it's what lets you play fast, soft, loud and long without pain. Professionals spend years refining this; you'll start right from day one."),
          h("The bench"),
          list([
            "Sit in the <b>center</b> of the keyboard, roughly in front of middle C (the C nearest the middle — usually right below the brand name).",
            "Sit on the <b>front half</b> of the bench, feet flat on the floor (right foot slightly forward, ready for the pedal later).",
            "Height: your <b>forearms should be level</b> with the keys, or slope very slightly down to them. Elbows just in front of your body, not glued to your sides.",
            "Distance: with your hands on the keys, your elbows are a little bent — not cramped, not stretched straight.",
          ]),
          h("The hand"),
          list([
            "Let your arm hang loosely at your side: your fingers curl naturally. That relaxed curve is the shape you play with — like holding a small ball.",
            "Play on the <b>tips/pads</b> of fingers 2–5 and the <b>side corner</b> of the thumb.",
            "Knuckles stay firm (they don't collapse inward); wrist stays level and loose — not dropped below the keys, not arched high.",
            "Shoulders down. Breathe. If anything tightens, stop, shake your hands out and restart slower.",
          ]),
          warn("Pain is never part of practice. Tension or pain in the wrist, forearm or shoulder means stop, rest and play slower and lighter. Speed comes from relaxation, not force."),
          quiz("Your forearms should be…", ["Level with the keys", "Pointing up to the keys", "Resting on the wood below the keys"], 0, "Level forearms let the weight of your arm flow into the keys without bending the wrist."),
          quiz("Which part of finger 1 (thumb) touches the key?", ["The flat pad", "The side corner of the tip", "The knuckle"], 1, "The thumb plays on its side corner, which keeps the hand balanced over the other fingers."),
        ],
      },
      {
        id: "1-3", title: "Finger numbers", mins: 5,
        goals: ["Know fingers 1–5 on both hands", "Play one finger at a time, evenly"],
        body: [
          p("Piano music tells you which finger to use with numbers. Both hands use the same system: the <b>thumb is 1</b>, index 2, middle 3, ring 4, pinky 5."),
          p("Because your hands are mirror images, finger 1 of the right hand is on the <i>left</i> side of the hand, and finger 1 of the left hand is on the <i>right</i> side."),
          keys("C3:5L D3:4L E3:3L F3:2L G3:1L C4:1R D4:2R E4:3R F4:4R G4:5R", { lo: "C3", hi: "B4", caption: "Left hand (orange) and right hand (blue) — each finger on its own key." }),
          tip("Tap each finger on the table and say its number out loud: “1-2-3-4-5, 5-4-3-2-1”. Fingers 4 and 5 are weaker — that's normal and they get stronger quickly."),
          quiz("What number is your right-hand pinky?", ["1", "4", "5"], 2),
          quiz("Your left thumb is finger…", ["1", "5"], 0, "Thumbs are always 1, on both hands."),
          ex({ title: "Right hand: 1 2 3 4 5", desc: "Each finger on its own white key, starting with the thumb on middle C. Keep every note the same loudness.", ts: "4/4", tempo: 70, rh: "C4-1q D4-2 E4-3 F4-4 | G4-5 F4-4 E4-3 D4-2 | C4-1w" }),
          ex({ title: "Left hand: 5 4 3 2 1", desc: "The left hand starts with the pinky on the C below middle C.", ts: "4/4", tempo: 70, lh: "C3-5q D3-4 E3-3 F3-2 | G3-1 F3-2 E3-3 D3-4 | C3-5w" }),
        ],
      },
      {
        id: "1-4", title: "Map of the keyboard: finding C", mins: 5,
        goals: ["See the pattern of black keys", "Find every C instantly", "Find middle C"],
        body: [
          p("The keyboard looks like a sea of keys, but it's just one small pattern repeated: <b>groups of 2 black keys and groups of 3 black keys</b>. Everything you'll ever play is found from this pattern."),
          keys("C#4 D#4 F#4 G#4 A#4", { lo: "C4", hi: "B4", caption: "One group of 2 black keys and one group of 3 black keys." }),
          h("C lives left of the two black keys"),
          p("The white key directly to the <b>left of each group of two black keys</b> is a <b>C</b>. There's one C in every group, so a normal piano has 8 of them."),
          keys("C3 C4 C5", { lo: "C3", hi: "B5", caption: "Every C, just left of the 2 black keys." }),
          p("<b>Middle C</b> is the C nearest the middle of the piano. Written music is built around it, and we'll use it as home base."),
          quiz("Where is C?", ["Left of the 3 black keys", "Left of the 2 black keys", "Between the 2 black keys"], 1),
          ex({ title: "Find the Cs", desc: "Play the low C with your left hand, then middle C and the high C with your right. Look at the black keys, not the screen, to find them.", ts: "4/4", tempo: 70, lh: "C3-1h rh | rw", rh: "rw | C4-1h C5-1h" }),
        ],
      },
      {
        id: "1-5", title: "The musical alphabet", mins: 5,
        goals: ["Name every white key", "Find any white key from the black-key pattern"],
        body: [
          p("White keys are named with just seven letters: <b>C D E F G A B</b> — then it starts again at C. (Some countries say <i>Do Re Mi Fa Sol La Si</i>; switch the note names in Settings.)"),
          keys("C4 D4 E4 F4 G4 A4 B4", { lo: "C4", hi: "B4", labels: "all", caption: "C D E around the 2 black keys · F G A B around the 3 black keys." }),
          h("Landmarks"),
          list([
            "<b>D</b> is between the 2 black keys.",
            "<b>E</b> is right of the 2 black keys.",
            "<b>F</b> is left of the 3 black keys.",
            "<b>B</b> is right of the 3 black keys.",
            "<b>G</b> and <b>A</b> are between the 3 black keys.",
          ]),
          p("Moving <b>right</b> goes <b>up</b> (higher sound) through the alphabet; moving <b>left</b> goes <b>down</b>."),
          quiz("Which white key is between the 2 black keys?", ["C", "D", "E"], 1),
          quiz("What comes after G?", ["H", "A", "F"], 1, "After G the alphabet starts again at A."),
          quiz("F is found…", ["Left of the 3 black keys", "Right of the 2 black keys"], 0),
          ex({ title: "Walk up the alphabet", desc: "Use finger 2 for every key and say each name out loud as you play it.", ts: "4/4", tempo: 70, rh: "C4-2q D4-2 E4-2 F4-2 | G4-2 A4-2 B4-2 C5-2 | B4-2 A4-2 G4-2 F4-2 | E4-2 D4-2 C4-2h" }),
          ex({ title: "Jump to the landmarks", desc: "F, then B, then D, then G — find each one from the black keys.", ts: "4/4", tempo: 60, rh: "F4-2h B4-2h | D4-2h G4-2h | E4-2h A4-2h | C4-2w" }),
        ],
      },
      {
        id: "1-6", title: "Middle C and the C position", mins: 6,
        goals: ["Place both hands in C position", "Play without looking at your fingers"],
        body: [
          p("A <b>hand position</b> means one finger rests on each of five neighboring white keys. In <b>C position</b>, the right-hand thumb sits on middle C and fingers 2–5 cover D E F G. The left-hand pinky sits on the C below, with fingers 4–1 on D E F G."),
          keys("C3:5L D3:4L E3:3L F3:2L G3:1L C4:1R D4:2R E4:3R F4:4R G4:5R", { lo: "C3", hi: "B4", labels: "all", caption: "C position, both hands." }),
          tip("Once your hand is in position, try to keep your eyes on the screen (the music), not your fingers. Your hand already knows where every key is — that's how real players read."),
          ex({ title: "Right hand in C position", ts: "4/4", tempo: 72, rh: "C4-1q E4-3 D4-2 F4-4 | E4-3 G4-5 F4-4 D4-2 | C4-1 D4-2 E4-3 F4-4 | G4-5 E4-3 C4-1h" }),
          ex({ title: "Left hand in C position", ts: "4/4", tempo: 72, lh: "C3-5q E3-3 D3-4 F3-2 | E3-3 G3-1 F3-2 D3-4 | C3-5 D3-4 E3-3 F3-2 | G3-1 E3-3 C3-5h" }),
          ex({ title: "Hands take turns", desc: "Left hand plays, then the right hand answers.", ts: "4/4", tempo: 72, lh: "C3-5q D3-4 E3-3 F3-2 | G3-1w | rw | rw", rh: "rw | rw | C4-1q D4-2 E4-3 F4-4 | G4-5w" }),
        ],
      },
      {
        id: "1-7", title: "Rhythm: counting beats", mins: 6,
        goals: ["Feel a steady beat", "Know quarter, half and whole notes", "Count out loud while playing"],
        body: [
          p("Music moves on a steady pulse called the <b>beat</b> — the thing you tap your foot to. Notes are written with different shapes to show how many beats they last."),
          list([
            "<b>Quarter note</b> ♩ — filled head with a stem — <b>1 beat</b>.",
            "<b>Half note</b> — hollow head with a stem — <b>2 beats</b>.",
            "<b>Whole note</b> — hollow head, no stem — <b>4 beats</b>.",
          ]),
          p("Beats are grouped into <b>measures</b> (or bars), separated by bar lines. The <b>time signature</b> at the start — like <b>4/4</b> — says how many beats are in each measure (top number: 4) and which note gets one beat (bottom 4 = the quarter note)."),
          tip("Count out loud: “<b>1 2 3 4</b>” for every measure, and <i>hold</i> long notes through their counts. Turn on the metronome click in the practice screen to hear the beat."),
          quiz("How many beats does a half note last?", ["1", "2", "4"], 1),
          quiz("In 4/4, how many quarter notes fit in one measure?", ["3", "4", "8"], 1),
          ex({ title: "Quarter, half, whole", desc: "Count 1-2-3-4 out loud. Hold the half notes for 2 counts and the whole note for all 4.", ts: "4/4", tempo: 76, rh: "C4-1q C4 C4 C4 | C4-1h C4-1h | C4-1w | D4-2q D4 D4-2h | E4-3h E4-3h | D4-2h D4-2h | C4-1w" }),
        ],
      },
      {
        id: "1-8", title: "Your first song: Mary Had a Little Lamb", mins: 6,
        goals: ["Play a whole melody in C position", "Keep a steady beat through a song"],
        body: [
          p("Put your right hand in C position — thumb on middle C. This whole song uses only fingers 1, 2, 3 and 5. Listen first with <b>▶ Listen</b>, then play it with <b>✋ Step by step</b>. When it's easy, try <b>🎯 Play along</b>."),
          keys("C4:1R D4:2R E4:3R G4:5R", { lo: "C4", hi: "B4", labels: "all" }),
          tip("If a spot is hard, don't restart from the beginning every time — practice just that spot 3 times slowly, then play from one measure before it."),
          ex({ title: "Mary Had a Little Lamb", ts: "4/4", tempo: 84, rh: "E4-3q D4-2 C4-1 D4-2 | E4-3 E4-3 E4-3h | D4-2q D4-2 D4-2h | E4-3q G4-5 G4-5h | E4-3q D4-2 C4-1 D4-2 | E4-3 E4-3 E4-3 E4-3 | D4-2 D4-2 E4-3 D4-2 | C4-1w" }),
        ],
      },
      {
        id: "1-9", title: "Ode to Joy — Beethoven", mins: 6,
        goals: ["Play Beethoven's famous melody", "Use all five fingers in one piece"],
        body: [
          p("This melody is from Beethoven's 9th Symphony (1824) — one of the most famous tunes in the world. It uses all five fingers of the C position and moves mostly by <b>step</b> (to the neighbouring key)."),
          p("Measures 4 and 8 end with a half note: hold it for 2 counts before starting again."),
          ex({ title: "Ode to Joy (right hand)", ts: "4/4", tempo: 88, rh: "E4-3q E4-3 F4-4 G4-5 | G4-5 F4-4 E4-3 D4-2 | C4-1 C4-1 D4-2 E4-3 | E4-3 D4-2 D4-2h | E4-3q E4-3 F4-4 G4-5 | G4-5 F4-4 E4-3 D4-2 | C4-1 C4-1 D4-2 E4-3 | D4-2 C4-1 C4-1h" }),
          tip("Level 1 complete once you can play this without stopping! Next you'll learn to read these notes on the staff yourself."),
        ],
      },
    ],
  },

  /* ─────────────────────────── LEVEL 2 ─────────────────────────── */
  {
    id: "L2", title: "Reading Music", sub: "Treble & bass clef, both hands, sharps and flats.", color: "#60a5fa",
    lessons: [
      {
        id: "2-1", title: "The staff & treble clef", mins: 7,
        goals: ["Read notes on the treble staff", "Use landmark notes to read fast"],
        body: [
          p("Music is written on a <b>staff</b>: 5 lines and the 4 spaces between them. Notes higher on the staff sound higher. Each line and each space is one white key — going up one line-to-space is one step up the alphabet."),
          p("The <b>treble clef</b> 𝄞 (G clef) is used for the right hand. Its curl wraps around the 2nd line from the bottom, marking it as <b>G</b> (the G above middle C)."),
          h("Landmarks — read from these instead of counting"),
          list([
            "<b>Middle C</b> sits on a small extra line (a <i>ledger line</i>) just below the staff.",
            "<b>G</b> — the line the clef curls around (2nd line).",
            "<b>Treble C</b> (C5) — 3rd space.",
            "Lines bottom-to-top: <b>E G B D F</b> — “<b>E</b>very <b>G</b>ood <b>B</b>oy <b>D</b>oes <b>F</b>ine”.",
            "Spaces bottom-to-top spell <b>F A C E</b>.",
          ]),
          keys("C4 G4 C5", { lo: "C4", hi: "B5", labels: "all", caption: "The three landmarks: middle C, treble G and treble C." }),
          quiz("The spaces of the treble staff spell…", ["EGBDF", "FACE", "GBDFA"], 1),
          quiz("Which note sits on the 2nd line of the treble staff (where the clef curls)?", ["E", "G", "B"], 1),
          ex({ title: "Reading in the treble clef", desc: "Before pressing Step by step, try to name each note from the staff yourself.", ts: "4/4", tempo: 72, rh: "C4-1q E4-3 G4-5 E4-3 | C4-1 D4-2 E4-3 F4-4 | G4-5 F4-4 E4-3 D4-2 | E4-3 G4-5 C4-1h" }),
          tool("reading", "Drill it: Note Reading trainer"),
        ],
      },
      {
        id: "2-2", title: "The bass clef", mins: 7,
        goals: ["Read notes on the bass staff", "Know the bass landmarks"],
        body: [
          p("The <b>bass clef</b> 𝄢 (F clef) is used for the left hand and low notes. Its two dots surround the 4th line, marking it as <b>F</b> — the F below middle C."),
          list([
            "<b>Middle C</b> — ledger line just <i>above</i> the bass staff.",
            "<b>F</b> — the 4th line, between the clef's dots.",
            "<b>Bass C</b> (C3) — 2nd space.",
            "Lines bottom-to-top: <b>G B D F A</b> — “<b>G</b>ood <b>B</b>oys <b>D</b>o <b>F</b>ine <b>A</b>lways”.",
            "Spaces bottom-to-top: <b>A C E G</b> — “<b>A</b>ll <b>C</b>ows <b>E</b>at <b>G</b>rass”.",
          ]),
          keys("C3 F3 C4", { lo: "C3", hi: "B4", labels: "all", caption: "Bass landmarks: bass C, F and middle C." }),
          quiz("The dots of the bass clef surround which note?", ["G", "F", "C"], 1),
          quiz("Lines of the bass staff, bottom to top:", ["E G B D F", "G B D F A", "A C E G"], 1),
          ex({ title: "Reading in the bass clef", ts: "4/4", tempo: 72, lh: "C3-5q E3-3 G3-1 E3-3 | F3-2 D3-4 C3-5h | G3-1q F3-2 E3-3 D3-4 | C3-5 E3-3 G3-1h | F3-2q E3-3 D3-4 F3-2 | C3-5w" }),
        ],
      },
      {
        id: "2-3", title: "Grand staff: both hands together", mins: 7,
        goals: ["Read two staves at once", "Coordinate both hands"],
        body: [
          p("Piano music joins a treble and a bass staff with a brace: the <b>grand staff</b>. Right hand reads the top staff, left hand the bottom. Notes lined up vertically are played <b>at the same time</b>."),
          tip("Hands together is a new skill for your brain. The professional method: learn each hand alone first, then combine them very slowly. Use the Hands selector (R / L / Both) in the practice screen."),
          ex({ title: "Parallel motion", desc: "Both hands play the same notes an octave apart. Your fingers use different numbers — watch the circles.", ts: "4/4", tempo: 66, rh: "C4-1q D4-2 E4-3 F4-4 | G4-5 F4-4 E4-3 D4-2 | C4-1w", lh: "C3-5q D3-4 E3-3 F3-2 | G3-1 F3-2 E3-3 D3-4 | C3-5w" }),
          ex({ title: "Contrary motion", desc: "Both thumbs start near middle C and the hands move apart like a mirror — same finger numbers in both hands!", ts: "4/4", tempo: 66, rh: "C4-1q D4-2 E4-3 F4-4 | G4-5 F4-4 E4-3 D4-2 | C4-1w", lh: "C4-1q B3-2 A3-3 G3-4 | F3-5 G3-4 A3-3 B3-2 | C4-1w" }),
          ex({ title: "Melody and bass", desc: "Left hand holds long notes while the right hand moves.", ts: "4/4", tempo: 70, rh: "E4-3q D4-2 C4-1 D4-2 | E4-3 E4-3 E4-3h | D4-2q D4-2 E4-3 D4-2 | C4-1w", lh: "C3-5w | C3-5w | G3-1w | C3-5w" }),
        ],
      },
      {
        id: "2-4", title: "Steps, skips & intervals", mins: 6,
        goals: ["Recognize intervals on the staff", "Read by shape, not letter by letter"],
        body: [
          p("An <b>interval</b> is the distance between two notes. Good readers don't name every note — they see the <i>shape</i>: how far the next note moves."),
          list([
            "<b>2nd (step)</b>: line → next space (or space → next line). Next key.",
            "<b>3rd (skip)</b>: line → next line, or space → next space. Skip one key.",
            "<b>4th</b> and <b>5th</b>: bigger leaps. A 5th spans all five fingers in position (C to G).",
          ]),
          p("Two notes played one after another form a <b>melodic</b> interval; stacked and played together, a <b>harmonic</b> interval."),
          quiz("Line to the very next line is a…", ["2nd", "3rd", "5th"], 1),
          quiz("C up to G is a…", ["4th", "5th", "6th"], 1, "Count C(1) D(2) E(3) F(4) G(5) — the starting note counts as 1."),
          ex({ title: "Melodic intervals from C", desc: "2nd, 3rd, 4th, 5th — hear each distance grow.", ts: "4/4", tempo: 72, rh: "C4-1h D4-2h | C4-1h E4-3h | C4-1h F4-4h | C4-1h G4-5h | G4-5h C4-1h" }),
          ex({ title: "Harmonic intervals", desc: "Press both keys together, exactly at the same time.", ts: "4/4", tempo: 66, rh: "C4-1+D4-2h C4-1+E4-3h | C4-1+F4-4h C4-1+G4-5h | D4-2+F4-4h E4-3+G4-5h | C4-1+E4-3+G4-5w" }),
          tool("ear", "Train your ear on intervals"),
        ],
      },
      {
        id: "2-5", title: "3/4 time, dotted notes & rests", mins: 6,
        goals: ["Count in 3/4", "Hold dotted half notes", "Keep counting through rests"],
        body: [
          p("<b>3/4 time</b> has 3 beats per measure: “<b>1</b> 2 3, <b>1</b> 2 3” — the feel of a waltz. The first beat of each measure is a little stronger."),
          p("A <b>dot</b> after a note adds half its value again. A dotted half note = 2 + 1 = <b>3 beats</b> — a whole measure in 3/4."),
          p("<b>Rests</b> are silent beats. You still count them! Quarter rest = 1 beat, half rest (sits on the middle line) = 2 beats, whole rest (hangs below the 4th line) = a whole measure."),
          quiz("How many beats is a dotted half note?", ["2", "3", "4"], 1),
          quiz("During a rest you should…", ["Stop counting", "Keep counting silently"], 1),
          ex({ title: "Waltz in C", desc: "Count 1-2-3. The left hand holds a dotted half for the whole measure.", ts: "3/4", tempo: 96, rh: "E4-3h G4-5q | F4-4h D4-2q | E4-3h C4-1q | D4-2h. | E4-3h G4-5q | F4-4h D4-2q | E4-3q D4-2 E4-3 | C4-1h.", lh: "C3-5h. | G3-1h. | C3-5h. | G3-1h. | C3-5h. | G3-1h. | G3-1h. | C3-5h." }),
          ex({ title: "Counting rests", desc: "Say the counts during the rests out loud.", ts: "4/4", tempo: 72, rh: "C4-1q rq E4-3q rq | G4-5h rh | E4-3q E4-3 rq E4-3 | C4-1w" }),
        ],
      },
      {
        id: "2-6", title: "Sharps, flats & half steps", mins: 8,
        goals: ["Name the black keys", "Know half steps and whole steps", "Read ♯ ♭ ♮ on the staff"],
        body: [
          p("A <b>half step</b> (semitone) is the distance from one key to the very next key, black or white. It's the smallest step on the piano. A <b>whole step</b> is two half steps."),
          list([
            "<b>♯ Sharp</b> — raise a note by a half step: C♯ is the black key just right of C.",
            "<b>♭ Flat</b> — lower by a half step: B♭ is the black key just left of B.",
            "<b>♮ Natural</b> — cancel a sharp or flat: play the white key.",
          ]),
          p("Every black key has two names: the key between C and D is both C♯ and D♭. Which name is used depends on the key of the music — you'll see why in Level 3."),
          keys("C#4 Eb4 F#4 Ab4 Bb4", { lo: "C4", hi: "B4", labels: "all", caption: "C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭." }),
          p("<b>E–F</b> and <b>B–C</b> are half steps even though both are white keys — there's no black key between them."),
          p("On the staff an accidental is written <i>before</i> the note and lasts <b>until the end of that measure</b>."),
          quiz("The black key right of F is…", ["F♯", "F♭", "E♯"], 0),
          quiz("E to F is a…", ["Whole step", "Half step"], 1),
          quiz("A sharp written in measure 3 still applies in measure 4.", ["True", "False"], 1, "The bar line cancels it."),
          ex({ title: "Half steps and whole steps", ts: "4/4", tempo: 66, rh: "E4-3h F4-4h | B4-4h C5-5h | C4-1h D4-2h | F4-2h G4-3h | C4-1h C#4-2h | G4-3h Ab4-4h | C4-1w" }),
          ex({ title: "The chromatic scale", desc: "Every key in a row. Finger 3 on each black key, thumb on white keys (except 2 on F and C).", ts: "4/4", tempo: 66, rh: "C4-1q C#4-3 D4-1 D#4-3 | E4-1 F4-2 F#4-3 G4-1 | G#4-3 A4-1 A#4-3 B4-1 | C5-2w" }),
        ],
      },
      {
        id: "2-7", title: "Ode to Joy — hands together", mins: 7,
        goals: ["Play a full melody with a bass line"],
        body: [
          p("Now play Beethoven's melody with the left hand adding a bass. The left hand only uses C (finger 5) and G (finger 1) — two notes that make the harmony sound complete."),
          tip("Learn it in three passes: right hand alone → left hand alone → together at half speed. Only raise the tempo once it's clean three times in a row."),
          ex({ title: "Ode to Joy (hands together)", ts: "4/4", tempo: 80, rh: "E4-3q E4-3 F4-4 G4-5 | G4-5 F4-4 E4-3 D4-2 | C4-1 C4-1 D4-2 E4-3 | E4-3 D4-2 D4-2h | E4-3q E4-3 F4-4 G4-5 | G4-5 F4-4 E4-3 D4-2 | C4-1 C4-1 D4-2 E4-3 | D4-2 C4-1 C4-1h", lh: "C3-5w | G3-1w | C3-5w | G3-1w | C3-5w | G3-1w | C3-5w | G3-1h C3-5h" }),
        ],
      },
      {
        id: "2-8", title: "When the Saints Go Marching In", mins: 8,
        goals: ["Play pickups that start after a rest", "Play a 16-bar song hands together"],
        body: [
          p("This New Orleans classic starts on the second beat — count “(1) 2 3 4” with the rest on beat 1. Watch for the dotted half note in measure 10."),
          ex({ title: "When the Saints Go Marching In", ts: "4/4", tempo: 100, rh: "rq C4-1 E4-3 F4-4 | G4-5w | rq C4-1 E4-3 F4-4 | G4-5w | rq C4-1 E4-3 F4-4 | G4-5h E4-3h | C4-1h E4-3h | D4-2w | rq E4-3 E4-3 D4-2 | C4-1h. C4-1q | E4-3h G4-5q G4-5 | F4-4w | rh E4-3q F4-4 | G4-5h E4-3h | C4-1h D4-2h | C4-1w", lh: "C3-5w | C3-5w | C3-5w | C3-5w | C3-5w | C3-5w | C3-5w | G3-1w | C3-5w | C3-5w | C3-5w | F3-2w | C3-5w | C3-5w | C3-5h G3-1h | C3-5w" }),
          tip("Level 2 complete! You can now read both clefs, play hands together, and handle sharps and flats."),
        ],
      },
    ],
  },

  /* ─────────────────────────── LEVEL 3 ─────────────────────────── */
  {
    id: "L3", title: "Scales & Keys", sub: "Thumb-under technique, major & minor keys, eighth notes.", color: "#a78bfa",
    lessons: [
      {
        id: "3-1", title: "How a major scale is built", mins: 6,
        goals: ["Know the W-W-H-W-W-W-H formula", "Build a major scale on any note"],
        body: [
          p("A <b>scale</b> is a ladder of notes from one note up to the same letter an octave higher. The <b>major scale</b> — the “Do Re Mi” sound — always follows the same pattern of whole (W) and half (H) steps:"),
          p("<b style='font-size:1.2em;letter-spacing:.08em'>W – W – H – W – W – W – H</b>"),
          p("Play only white keys from C to C and you get exactly that pattern: the half steps fall on E–F and B–C. That's why <b>C major</b> has no sharps or flats."),
          keys("C4 D4 E4 F4 G4 A4 B4 C5", { lo: "C4", hi: "C5", labels: "all", caption: "C major: W W H W W W H." }),
          p("Start on any other note and follow the same formula, and you'll need black keys. From G: G A B C D E <b>F♯</b> G — the F must be raised to keep the last step a half step."),
          quiz("The major scale pattern is…", ["W H W W H W W", "W W H W W W H", "H W W W H W W"], 1),
          quiz("Which note is sharp in G major?", ["C♯", "F♯", "G♯"], 1),
          tool("scales", "Explore every scale in the Scale & Chord finder"),
        ],
      },
      {
        id: "3-2", title: "C major scale — right hand", mins: 8,
        goals: ["Pass the thumb under smoothly", "Play a legato (connected) scale"],
        body: [
          p("Five fingers, eight notes — so the hand has to move. Professionals do it by passing the <b>thumb under</b> the hand. Right hand: <b>1 2 3</b>, thumb under to F, then <b>1 2 3 4 5</b>. Coming down, finger <b>3 crosses over</b> the thumb onto E."),
          keys("C4:1R D4:2R E4:3R F4:1R G4:2R A4:3R B4:4R C5:5R", { lo: "C4", hi: "C5", labels: "all", caption: "Right hand fingering: 1 2 3 1 2 3 4 5." }),
          tip("Prepare the thumb early: while finger 2 plays D, the thumb already starts moving under toward F. The wrist stays level and smooth — no jerking or twisting of the elbow."),
          ex({ title: "Thumb-under drill", desc: "Just the crossing: 1-2-3 then thumb to F, and back.", ts: "4/4", tempo: 66, rh: "C4-1q D4-2 E4-3 F4-1 | E4-3 D4-2 C4-1h | C4-1q D4-2 E4-3 F4-1 | G4-2 F4-1 E4-3 D4-2 | C4-1w" }),
          ex({ title: "C major scale, right hand", ts: "4/4", tempo: 72, rh: "C4-1q D4-2 E4-3 F4-1 | G4-2 A4-3 B4-4 C5-5 | B4-4 A4-3 G4-2 F4-1 | E4-3 D4-2 C4-1h" }),
        ],
      },
      {
        id: "3-3", title: "C major scale — left hand", mins: 8,
        goals: ["Cross finger 3 over the thumb in the left hand"],
        body: [
          p("Left hand going up: <b>5 4 3 2 1</b>, then finger <b>3 crosses over</b> the thumb onto A, then <b>2 1</b>. Coming down: 1 2 3, <b>thumb under</b> to E, then 2 3 4 5 — the mirror image of the right hand."),
          keys("C3:5L D3:4L E3:3L F3:2L G3:1L A3:3L B3:2L C4:1L", { lo: "C3", hi: "C4", labels: "all", caption: "Left hand fingering: 5 4 3 2 1 3 2 1." }),
          ex({ title: "Cross-over drill", ts: "4/4", tempo: 66, lh: "E3-3q F3-2 G3-1 A3-3 | G3-1 F3-2 E3-3h | D3-4q E3-3 F3-2 G3-1 | A3-3 B3-2 C4-1h" }),
          ex({ title: "C major scale, left hand", ts: "4/4", tempo: 72, lh: "C3-5q D3-4 E3-3 F3-2 | G3-1 A3-3 B3-2 C4-1 | B3-2 A3-3 G3-1 F3-2 | E3-3 D3-4 C3-5h" }),
        ],
      },
      {
        id: "3-4", title: "C major scale — hands together", mins: 8,
        goals: ["Coordinate different fingerings in each hand"],
        body: [
          p("Hands together, the thumbs and crossings happen at <b>different moments</b> in each hand — this is the classic brain-teaser of piano technique, and mastering it unlocks everything else."),
          list([
            "Right hand crosses at F (going up) and E (coming down).",
            "Left hand crosses at A (going up) and E (coming down).",
            "Both hands arrive on 1 or 5 together at the top and bottom C.",
          ]),
          tip("Practice in slow motion: 50 bpm or less. Speed is built on a correct, relaxed motion — never the reverse."),
          ex({ title: "C major, hands together (parallel)", ts: "4/4", tempo: 60, rh: "C4-1q D4-2 E4-3 F4-1 | G4-2 A4-3 B4-4 C5-5 | B4-4 A4-3 G4-2 F4-1 | E4-3 D4-2 C4-1h", lh: "C3-5q D3-4 E3-3 F3-2 | G3-1 A3-3 B3-2 C4-1 | B3-2 A3-3 G3-1 F3-2 | E3-3 D3-4 C3-5h" }),
          ex({ title: "C major, contrary motion", desc: "Hands move apart from the middle — both thumbs cross at the same time!", ts: "4/4", tempo: 60, rh: "C4-1q D4-2 E4-3 F4-1 | G4-2 A4-3 B4-4 C5-5 | B4-4 A4-3 G4-2 F4-1 | E4-3 D4-2 C4-1h", lh: "C4-1q B3-2 A3-3 G3-1 | F3-2 E3-3 D3-4 C3-5 | D3-4 E3-3 F3-2 G3-1 | A3-3 B3-2 C4-1h" }),
        ],
      },
      {
        id: "3-5", title: "Eighth notes & dotted rhythms", mins: 8,
        goals: ["Count eighth notes with “and”", "Play dotted quarter + eighth"],
        body: [
          p("An <b>eighth note</b> is half a beat. Two eighths fill one beat and are joined by a <b>beam</b>. Count them “<b>1 and 2 and 3 and 4 and</b>” (write it 1 + 2 + …)."),
          p("A <b>dotted quarter</b> lasts 1½ beats, so it's usually followed by an eighth to finish the beat: “1 — + <b>2</b>”. It gives a long-short, lilting rhythm."),
          quiz("How many eighth notes fit in one 4/4 measure?", ["4", "6", "8"], 2),
          quiz("A dotted quarter lasts…", ["1 beat", "1½ beats", "2 beats"], 1),
          ex({ title: "Eighth-note warm-up", desc: "Count “1 + 2 + …” aloud; keep the eighths perfectly even.", ts: "4/4", tempo: 72, rh: "C4-1e D4-2 E4-3 F4-4 G4-5q G4-5 | G4-5e F4-4 E4-3 D4-2 C4-1q C4-1 | E4-3e E4-3 D4-2 D4-2 C4-1h" }),
          ex({ title: "Jingle Bells", desc: "Watch for the dotted quarter + eighth in measures 3, 5, 11 and 13.", ts: "4/4", tempo: 100, rh: "E4-3q E4-3 E4-3h | E4-3q E4-3 E4-3h | E4-3q G4-5 C4-1q. D4-2e | E4-3w | F4-4q F4-4 F4-4q. F4-4e | F4-4q E4-3 E4-3 E4-3e E4-3e | E4-3q D4-2 D4-2 E4-3 | D4-2h G4-5h | E4-3q E4-3 E4-3h | E4-3q E4-3 E4-3h | E4-3q G4-5 C4-1q. D4-2e | E4-3w | F4-4q F4-4 F4-4q. F4-4e | F4-4q E4-3 E4-3 E4-3e E4-3e | G4-5q G4-5 F4-4 D4-2 | C4-1w", lh: "C3-5w | C3-5w | C3-5w | C3-5w | F3-2w | C3-5w | G3-1w | G3-1w | C3-5w | C3-5w | C3-5w | C3-5w | F3-2w | C3-5w | G3-1w | C3-5w" }),
        ],
      },
      {
        id: "3-6", title: "G major, F major & key signatures", mins: 10,
        goals: ["Read a key signature", "Play G and F major scales"],
        body: [
          p("Instead of writing F♯ every time, music in G major puts one ♯ on the F line at the start of each staff: the <b>key signature</b>. It means <b>every F is F♯</b> — in every octave, for the whole piece — unless a natural sign cancels it."),
          list([
            "<b>G major</b>: 1 sharp — F♯. Same fingering as C major.",
            "<b>F major</b>: 1 flat — B♭. Right hand fingering changes: <b>1 2 3 4</b>, thumb under, <b>1 2 3 4</b> (finger 4 lands on B♭).",
          ]),
          keys("G4:1R A4:2R B4:3R C5:1R D5:2R E5:3R F#5:4R G5:5R", { lo: "G4", hi: "G5", labels: "all", caption: "G major, right hand: 1 2 3 1 2 3 4 5." }),
          keys("F4:1R G4:2R A4:3R Bb4:4R C5:1R D5:2R E5:3R F5:4R", { lo: "F4", hi: "F5", labels: "all", caption: "F major, right hand: 1 2 3 4 1 2 3 4." }),
          quiz("A key signature with one ♯ means…", ["Only the first F is sharp", "Every F is sharp", "Every note is sharp"], 1),
          ex({ title: "G major scale (RH)", key: "G", ts: "4/4", tempo: 72, rh: "G4-1q A4-2 B4-3 C5-1 | D5-2 E5-3 F#5-4 G5-5 | F#5-4 E5-3 D5-2 C5-1 | B4-3 A4-2 G4-1h" }),
          ex({ title: "G major scale (LH)", key: "G", ts: "4/4", tempo: 72, lh: "G2-5q A2-4 B2-3 C3-2 | D3-1 E3-3 F#3-2 G3-1 | F#3-2 E3-3 D3-1 C3-2 | B2-3 A2-4 G2-5h" }),
          ex({ title: "F major scale (RH)", key: "F", ts: "4/4", tempo: 72, rh: "F4-1q G4-2 A4-3 Bb4-4 | C5-1 D5-2 E5-3 F5-4 | E5-3 D5-2 C5-1 Bb4-4 | A4-3 G4-2 F4-1h" }),
          ex({ title: "F major scale (LH)", key: "F", ts: "4/4", tempo: 72, lh: "F2-5q G2-4 A2-3 Bb2-2 | C3-1 D3-3 E3-2 F3-1 | E3-2 D3-3 C3-1 Bb2-2 | A2-3 G2-4 F2-5h" }),
        ],
      },
      {
        id: "3-7", title: "Minor scales", mins: 10,
        goals: ["Hear major vs minor", "Play natural and harmonic A minor", "Understand relative keys"],
        body: [
          p("Minor keys sound darker, sadder or more dramatic. The key difference is the <b>3rd note</b>: in minor it's a half step lower than in major."),
          p("Every major key has a <b>relative minor</b> that shares its key signature, starting on the 6th note. C major ↔ <b>A minor</b>: both use only white keys."),
          h("Three kinds of minor"),
          list([
            "<b>Natural minor</b>: A B C D E F G A — the plain relative-minor scale.",
            "<b>Harmonic minor</b>: raise the 7th — G becomes <b>G♯</b>. This gives the exotic, strong pull back to A. Most classical minor-key music uses it.",
            "<b>Melodic minor</b>: raise the 6th and 7th going up (F♯, G♯), come down as natural minor.",
          ]),
          quiz("The relative minor of C major is…", ["C minor", "A minor", "E minor"], 1),
          quiz("Harmonic minor raises which note?", ["The 3rd", "The 6th", "The 7th"], 2),
          ex({ title: "A natural minor (RH)", key: "Am", ts: "4/4", tempo: 72, rh: "A4-1q B4-2 C5-3 D5-1 | E5-2 F5-3 G5-4 A5-5 | G5-4 F5-3 E5-2 D5-1 | C5-3 B4-2 A4-1h" }),
          ex({ title: "A harmonic minor (RH)", desc: "Listen for the wide step-and-a-half from F to G♯.", key: "Am", ts: "4/4", tempo: 72, rh: "A4-1q B4-2 C5-3 D5-1 | E5-2 F5-3 G#5-4 A5-5 | G#5-4 F5-3 E5-2 D5-1 | C5-3 B4-2 A4-1h" }),
          ex({ title: "A harmonic minor (LH)", key: "Am", ts: "4/4", tempo: 72, lh: "A2-5q B2-4 C3-3 D3-2 | E3-1 F3-3 G#3-2 A3-1 | G#3-2 F3-3 E3-1 D3-2 | C3-3 B2-4 A2-5h" }),
        ],
      },
      {
        id: "3-8", title: "The circle of fifths", mins: 8,
        goals: ["Know all 12 major keys and their signatures", "Find the relative minor of any key"],
        body: [
          p("Start at C and go up a 5th each time: C → G → D → A → E → B → F♯… Each step <b>adds one sharp</b>. Go the other way (down a 5th): C → F → B♭ → E♭ → A♭ → D♭… each step <b>adds one flat</b>. Arranged in a circle, all 12 keys fit like a clock."),
          list([
            "Sharps always appear in the order <b>F C G D A E B</b> (“Father Charles Goes Down And Ends Battle”).",
            "Flats appear in the reverse order <b>B E A D G C F</b>.",
            "Sharp keys: the key is a half step above the last sharp. Flat keys: the key is the second-to-last flat.",
            "Neighbours on the circle share 6 of their 7 notes — that's why music moves so easily between them.",
          ]),
          quiz("How many sharps does D major have?", ["1", "2", "3"], 1),
          quiz("Last sharp is G♯. What major key is it?", ["G", "A", "E"], 1, "A half step above G♯ is A. A major = F♯ C♯ G♯."),
          quiz("Flats are B♭ E♭ A♭. What major key?", ["E♭", "A♭", "B♭"], 0, "Second-to-last flat: E♭."),
          tool("circle", "Open the interactive Circle of Fifths"),
          tip("Level 3 complete! Aim to play all 12 major scales hands separately over the next months — the Scale finder generates a practice exercise for each one, with the right fingering."),
        ],
      },
    ],
  },

  /* ─────────────────────────── LEVEL 4 ─────────────────────────── */
  {
    id: "L4", title: "Chords & Harmony", sub: "Triads, inversions, progressions, accompaniment.", color: "#f472b6",
    lessons: [
      {
        id: "4-1", title: "Building triads", mins: 8,
        goals: ["Build a triad on any note", "Play the 7 chords of C major"],
        body: [
          p("A <b>chord</b> is three or more notes played together. The basic chord is the <b>triad</b>: a <b>root</b>, the note a <b>3rd</b> above it, and the note a <b>5th</b> above it — “skip a key, play a key, skip a key, play a key.” On the staff a triad looks like a snowman: three notes all on lines or all on spaces."),
          keys("C4:1R E4:3R G4:5R", { lo: "C4", hi: "B4", labels: "all", caption: "C major triad: C–E–G, fingers 1-3-5." }),
          p("Build a triad on each note of the C major scale and you get the 7 chords of the key. Numbered with Roman numerals: <b>I ii iii IV V vi vii°</b> — uppercase = major, lowercase = minor, ° = diminished."),
          quiz("A triad is built from…", ["Root, 2nd, 3rd", "Root, 3rd, 5th", "Root, 4th, 5th"], 1),
          ex({ title: "The 7 triads of C major", desc: "Fingers 1-3-5 for every chord. Listen for which sound bright (major) and which darker (minor).", ts: "4/4", tempo: 66, rh: "\"C\" C4-1+E4-3+G4-5h \"Dm\" D4-1+F4-3+A4-5h | \"Em\" E4-1+G4-3+B4-5h \"F\" F4-1+A4-3+C5-5h | \"G\" G4-1+B4-3+D5-5h \"Am\" A4-1+C5-3+E5-5h | \"Bdim\" B4-1+D5-3+F5-5h \"C\" C5-1+E5-3+G5-5h" }),
          ex({ title: "Broken triads", desc: "Play each chord one note at a time, up and down.", ts: "4/4", tempo: 80, rh: "C4-1q E4-3 G4-5 E4-3 | D4-1 F4-3 A4-5 F4-3 | E4-1 G4-3 B4-5 G4-3 | F4-1 A4-3 C5-5 A4-3 | G4-1 B4-3 D5-5 B4-3 | C5-1+E5-3+G5-5w" }),
        ],
      },
      {
        id: "4-2", title: "Major, minor, diminished, augmented", mins: 8,
        goals: ["Build all four triad qualities from any root", "Hear the difference"],
        body: [
          p("Triads differ by the size of their 3rds. Count half steps from the root:"),
          list([
            "<b>Major</b> — 4 + 3 half steps (C–E–G). Bright, stable.",
            "<b>Minor</b> — 3 + 4 (C–E♭–G). Lower the 3rd of a major chord. Dark, sad.",
            "<b>Diminished</b> — 3 + 3 (C–E♭–G♭). Tense, unstable.",
            "<b>Augmented</b> — 4 + 4 (C–E–G♯). Dreamy, floating.",
          ]),
          quiz("To turn a major chord into minor, you…", ["Raise the 5th", "Lower the 3rd", "Lower the root"], 1),
          quiz("D major is D–F♯–A. D minor is…", ["D–F–A", "D–F♯–A♭", "D–E–A"], 0),
          ex({ title: "Four qualities on C", ts: "4/4", tempo: 60, rh: "\"C\" C4-1+E4-3+G4-5h \"Cm\" C4-1+Eb4-3+G4-5h | \"Cdim\" C4-1+Eb4-3+Gb4-5h \"Caug\" C4-1+E4-3+G#4-5h | \"C\" C4-1+E4-3+G4-5w" }),
          ex({ title: "Major to minor around the keyboard", desc: "Move only the middle finger down a half step.", ts: "4/4", tempo: 66, rh: "\"D\" D4-1+F#4-3+A4-5h \"Dm\" D4-1+F4-3+A4-5h | \"E\" E4-1+G#4-3+B4-5h \"Em\" E4-1+G4-3+B4-5h | \"G\" G4-1+B4-3+D5-5h \"Gm\" G4-1+Bb4-3+D5-5h | \"A\" A4-1+C#5-3+E5-5h \"Am\" A4-1+C5-3+E5-5h" }),
          tool("scales", "Build any chord in the Scale & Chord finder"),
        ],
      },
      {
        id: "4-3", title: "I – IV – V and inversions", mins: 10,
        goals: ["Know the three primary chords", "Use inversions to move smoothly"],
        body: [
          p("Three chords — <b>I</b>, <b>IV</b> and <b>V</b> — harmonize thousands of songs. In C major they are <b>C</b>, <b>F</b> and <b>G</b>."),
          p("Jumping between root-position chords sounds choppy and makes your hand leap. Pros use <b>inversions</b>: the same notes, re-ordered so a different note is on the bottom."),
          list([
            "<b>Root position</b>: C E G (root on the bottom).",
            "<b>1st inversion</b>: E G C (3rd on the bottom).",
            "<b>2nd inversion</b>: G C E (5th on the bottom).",
          ]),
          p("Choose the inversion that keeps notes in common and moves the others by step — this is called <b>voice leading</b>. C (C E G) → F (C F A): C stays, E→F, G→A. Tiny movement, beautiful sound."),
          keys("C4:1R F4:3R A4:5R", { lo: "C4", hi: "B4", labels: "all", caption: "F chord in 2nd inversion (C–F–A), close to the C chord." }),
          quiz("E–G–C is which inversion of C major?", ["Root position", "1st inversion", "2nd inversion"], 1),
          ex({ title: "Inversions of C", ts: "4/4", tempo: 66, rh: "C4-1+E4-3+G4-5h E4-1+G4-2+C5-5h | G4-1+C5-3+E5-5h C5-1+E5-3+G5-5h | G4-1+C5-3+E5-5h E4-1+G4-2+C5-5h | C4-1+E4-3+G4-5w" }),
          ex({ title: "I – IV – I – V – I with voice leading", desc: "Right hand barely moves. Left hand plays the roots.", ts: "4/4", tempo: 66, rh: "C4-1+E4-3+G4-5w | C4-1+F4-3+A4-5w | C4-1+E4-3+G4-5w | B3-1+D4-2+G4-5w | C4-1+E4-3+G4-5w", lh: "\"C\" C3-5w | \"F\" F2-5w | \"C\" C3-5w | \"G\" G2-5w | \"C\" C3-5w" }),
        ],
      },
      {
        id: "4-4", title: "The four-chord progression", mins: 8,
        goals: ["Play I–V–vi–IV", "Add rhythm to chords"],
        body: [
          p("<b>I – V – vi – IV</b> (in C: C – G – Am – F) is the progression behind a huge amount of pop music. Learn it once and you can accompany hundreds of songs — in any key, once you know your scales."),
          p("With good voice leading the right hand stays in one spot: C (C E G) → G (B D G) → Am (C E A) → F (C F A)."),
          ex({ title: "I – V – vi – IV", ts: "4/4", tempo: 76, rh: "C4-1+E4-3+G4-5w | B3-1+D4-2+G4-5w | C4-1+E4-3+A4-5w | C4-1+F4-3+A4-5w | C4-1+E4-3+G4-5h C4-1+E4-3+G4-5q C4-1+E4-3+G4-5 | B3-1+D4-2+G4-5h B3-1+D4-2+G4-5q B3-1+D4-2+G4-5 | C4-1+E4-3+A4-5h C4-1+E4-3+A4-5q C4-1+E4-3+A4-5 | C4-1+F4-3+A4-5h C4-1+F4-3+A4-5q C4-1+F4-3+A4-5", lh: "\"C\" C3-1w | \"G\" G2-4w | \"Am\" A2-3w | \"F\" F2-5w | \"C\" C3-1w | \"G\" G2-4w | \"Am\" A2-3w | \"F\" F2-5w" }),
          tip("Try the same progression in G major: G – D – Em – C. Use the Circle of Fifths tool to see the chords of every key."),
        ],
      },
      {
        id: "4-5", title: "Accompaniment patterns", mins: 10,
        goals: ["Play broken chords and Alberti bass", "Keep a pattern going under a melody"],
        body: [
          p("Block chords are just the beginning. Pianists bring chords to life by <b>breaking</b> them into patterns in the left hand:"),
          list([
            "<b>Broken chord / arpeggio</b>: root – 5th – octave – 5th. Open and flowing.",
            "<b>Alberti bass</b>: lowest – highest – middle – highest (C G E G). The sound of Mozart and Haydn.",
            "<b>Waltz</b>: bass note on beat 1, chord on beats 2 and 3.",
          ]),
          ex({ title: "Alberti bass", desc: "Left hand alone. Keep the thumb light — the bottom notes carry the harmony.", ts: "4/4", tempo: 80, lh: "C3-5e G3-1 E3-3 G3-1 C3-5 G3-1 E3-3 G3-1 | B2-5 G3-1 D3-3 G3-1 B2-5 G3-1 D3-3 G3-1 | C3-5 A3-1 F3-2 A3-1 C3-5 A3-1 F3-2 A3-1 | C3-5 G3-1 E3-3 G3-1 C3-5h" }),
          ex({ title: "Twinkle, Twinkle with broken chords", desc: "The melody on top, a flowing arpeggio below.", ts: "4/4", tempo: 76, rh: "C4-1q C4-1 G4-4 G4-4 | A4-5 A4-5 G4-4h | F4-4q F4-4 E4-3 E4-3 | D4-2 D4-2 C4-1h", lh: "C3-5e G3-2 C4-1 G3-2 C3-5 G3-2 C4-1 G3-2 | F2-5 C3-2 F3-1 C3-2 C3-5 G3-2 C4-1 G3-2 | F2-5 C3-2 F3-1 C3-2 C3-5 G3-2 C4-1 G3-2 | G2-5 D3-2 G3-1 D3-2 C3-5h" }),
        ],
      },
      {
        id: "4-6", title: "Pachelbel's Canon progression", mins: 10,
        goals: ["Play a famous 8-chord progression in D major", "Hear a melody inside chords"],
        body: [
          p("Pachelbel's Canon (c. 1700) repeats one bass line over and over: <b>D – A – Bm – F♯m – G – D – G – A</b> (I – V – vi – iii – IV – I – IV – V). It's in D major — 2 sharps, F♯ and C♯."),
          p("The top notes of the right-hand chords form the famous descending melody: F♯ E D C♯ B A B C♯. Let those top notes sing a little louder than the others — voicing is a hallmark of professional playing."),
          ex({ title: "Canon in D (progression)", key: "D", ts: "4/4", tempo: 60, rh: "A4-1+D5-3+F#5-5w | A4-1+C#5-3+E5-5w | F#4-1+B4-3+D5-5w | F#4-1+A4-3+C#5-5w | D4-1+G4-3+B4-5w | D4-1+F#4-3+A4-5w | D4-1+G4-3+B4-5w | E4-1+A4-3+C#5-5w", lh: "\"D\" D3-1w | \"A\" A2-4w | \"Bm\" B2-3w | \"F#m\" F#2-5w | \"G\" G2-4w | \"D\" D2-5w | \"G\" G2-2w | \"A\" A2-1w" }),
        ],
      },
      {
        id: "4-7", title: "Playing from a lead sheet", mins: 10,
        goals: ["Read chord symbols", "Harmonize a melody yourself"],
        body: [
          p("Pop, jazz and worship musicians rarely read every note: they read a <b>lead sheet</b> — the melody plus <b>chord symbols</b> above it (C, F, G7, Am…). The pianist plays the melody in the right hand and makes up the left-hand part from the symbols."),
          list([
            "A letter alone = major chord (<b>F</b>). Small m = minor (<b>Am</b>). 7 = dominant seventh (<b>G7</b>).",
            "A slash gives the bass note: <b>C/E</b> = C chord with E in the bass.",
            "Start simple: play the chord in the left hand when the symbol changes, using close inversions.",
          ]),
          ex({ title: "Twinkle, Twinkle — lead-sheet style", desc: "Left hand plays close inversions of C, F and G.", ts: "4/4", tempo: 80, rh: "C4-1q C4-1 G4-4 G4-4 | A4-5 A4-5 G4-4h | F4-4q F4-4 E4-3 E4-3 | D4-2 D4-2 C4-1h | G4-5q G4-5 F4-4 F4-4 | E4-3 E4-3 D4-2h | G4-5q G4-5 F4-4 F4-4 | E4-3 E4-3 D4-2h | C4-1q C4-1 G4-4 G4-4 | A4-5 A4-5 G4-4h | F4-4q F4-4 E4-3 E4-3 | D4-2 D4-2 C4-1h", lh: "\"C\" C3-5+E3-3+G3-1w | \"F\" C3-5+F3-2+A3-1h \"C\" C3-5+E3-3+G3-1h | \"F\" C3-5+F3-2+A3-1h \"C\" C3-5+E3-3+G3-1h | \"G\" B2-5+D3-3+G3-1h \"C\" C3-5+E3-3+G3-1h | \"C\" C3-5+E3-3+G3-1h \"F\" C3-5+F3-2+A3-1h | \"C\" C3-5+E3-3+G3-1h \"G\" B2-5+D3-3+G3-1h | \"C\" C3-5+E3-3+G3-1h \"F\" C3-5+F3-2+A3-1h | \"C\" C3-5+E3-3+G3-1h \"G\" B2-5+D3-3+G3-1h | \"C\" C3-5+E3-3+G3-1w | \"F\" C3-5+F3-2+A3-1h \"C\" C3-5+E3-3+G3-1h | \"F\" C3-5+F3-2+A3-1h \"C\" C3-5+E3-3+G3-1h | \"G\" B2-5+D3-3+G3-1h \"C\" C3-5+E3-3+G3-1h" }),
          tip("Level 4 complete! Take any simple song you love, find its chords online, and play melody + left-hand chords. That skill alone lets you play almost anything."),
        ],
      },
    ],
  },

  /* ─────────────────────────── LEVEL 5 ─────────────────────────── */
  {
    id: "L5", title: "Technique & Expression", sub: "Dynamics, pedal, arpeggios, sevenths, your first classical piece.", color: "#fbbf24",
    lessons: [
      {
        id: "5-1", title: "Dynamics & articulation", mins: 8,
        goals: ["Play loud and soft on purpose", "Play legato and staccato"],
        body: [
          p("Playing the right notes is only half of music. The other half is <b>how</b> you play them. <b>Dynamics</b> are volume markings, written in Italian:"),
          list([
            "<b><i>pp</i></b> pianissimo — very soft · <b><i>p</i></b> piano — soft · <b><i>mp</i></b> mezzo-piano — medium soft",
            "<b><i>mf</i></b> mezzo-forte — medium loud · <b><i>f</i></b> forte — loud · <b><i>ff</i></b> fortissimo — very loud",
            "<b>cresc.</b> — gradually louder · <b>dim.</b> — gradually softer",
          ]),
          p("Volume comes from <b>speed</b> of the key, not from pressing harder into the key bed. Soft: slow, close to the keys. Loud: faster, using arm weight — still relaxed."),
          p("<b>Legato</b> (smooth, connected): release each key exactly as the next goes down. <b>Staccato</b> (a dot above/below the note): short and detached — bounce off the key lightly."),
          quiz("<i>mf</i> means…", ["Very loud", "Medium loud", "Medium soft"], 1),
          quiz("A dot above a note means…", ["Hold it longer", "Play it short (staccato)"], 1),
          ex({ title: "Soft legato, loud staccato", desc: "First phrase soft and connected; second phrase loud and bouncy.", ts: "4/4", tempo: 80, rh: "!p C4-1q D4-2 E4-3 F4-4 | G4-5h rh | !f G4-5q' F4-4' E4-3' D4-2' | C4-1h' rh | !mp E4-3q F4-4 G4-5 E4-3 | !mf D4-2' D4-2' G4-5' G4-5' | !p C4-1w" }),
        ],
      },
      {
        id: "5-2", title: "The sustain pedal", mins: 8,
        goals: ["Use the right pedal", "Master legato (syncopated) pedaling"],
        body: [
          p("The right pedal (<b>sustain</b> or damper pedal) lifts all the dampers so notes keep ringing after you let go. Keep your heel on the floor and press with the ball of your foot."),
          p("<b>Legato pedaling</b> — the professional technique: play the new chord, and <b>only then</b> lift the pedal and immediately press it down again. The foot moves <i>just after</i> the hands. This connects chords without blurring them together."),
          list([
            "<b>Ped.</b> — press the pedal · <b>*</b> — release it.",
            "Change the pedal every time the harmony changes, or the old chord will smear into the new one.",
          ]),
          warn("Beginners often “hold the pedal down forever”. If it sounds muddy, you missed a pedal change."),
          ex({ title: "Legato pedaling", desc: "Change the pedal at each new chord: hands down → foot up-and-down.", ts: "4/4", tempo: 60, rh: "C4-1+E4-3+G4-5w | C4-1+F4-3+A4-5w | B3-1+D4-2+G4-5w | C4-1+E4-3+G4-5w", lh: "!ped C3-5w | !ped F2-5w | !ped G2-5w | !ped C3-5w !*" }),
        ],
      },
      {
        id: "5-3", title: "Arpeggios", mins: 10,
        goals: ["Play a 2-octave C major arpeggio in each hand"],
        body: [
          p("An <b>arpeggio</b> is a chord played one note at a time across the keyboard. It builds reach, thumb-crossing and evenness, and it's in almost every piece from Mozart to film music."),
          list([
            "Right hand up: <b>1 2 3</b>, thumb under, <b>1 2 3 5</b>. Down: 5 3 2 1, 3 crosses over, 3 2 1.",
            "Left hand up: <b>5 4 2 1</b>, 4 crosses over, <b>4 2 1</b>. Down: 1 2 4, thumb under, 1 2 4 5.",
          ]),
          tip("Let the wrist and forearm travel smoothly sideways at an even speed; the thumb slips under without the elbow jutting out."),
          ex({ title: "C major arpeggio, right hand", ts: "4/4", tempo: 72, rh: "C4-1e E4-2 G4-3 C5-1 E5-2 G5-3 C6-5 G5-3 | E5-2 C5-1 G4-3 E4-2 C4-1h" }),
          ex({ title: "C major arpeggio, left hand", ts: "4/4", tempo: 72, lh: "C2-5e E2-4 G2-2 C3-1 E3-4 G3-2 C4-1 G3-2 | E3-4 C3-1 G2-2 E2-4 C2-5h" }),
        ],
      },
      {
        id: "5-4", title: "Finger independence: Hanon No. 1", mins: 10,
        goals: ["Strengthen fingers 4 and 5", "Build even, controlled speed"],
        body: [
          p("Charles-Louis Hanon's <i>The Virtuoso Pianist</i> (1873) has been used by pianists for 150 years. Exercise 1 moves one pattern up the keyboard step by step, then back down, working every finger equally."),
          list([
            "Start slow (60 bpm). Every note equally loud and exactly even.",
            "Lift fingers only slightly; the knuckles stay firm, the wrist loose.",
            "Increase the tempo by 4 bpm only when it's perfect three times in a row.",
            "Then play it with the left hand one octave lower (fingering 5 4 3 2 1 2 3 4).",
          ]),
          ex({ title: "Hanon Exercise No. 1 (right hand)", ts: "4/4", tempo: 60, rh: "C4-1e E4-2 F4-3 G4-4 A4-5 G4-4 F4-3 E4-2 | D4-1 F4-2 G4-3 A4-4 B4-5 A4-4 G4-3 F4-2 | E4-1 G4-2 A4-3 B4-4 C5-5 B4-4 A4-3 G4-2 | F4-1 A4-2 B4-3 C5-4 D5-5 C5-4 B4-3 A4-2 | G4-1 B4-2 C5-3 D5-4 E5-5 D5-4 C5-3 B4-2 | A4-1 C5-2 D5-3 E5-4 F5-5 E5-4 D5-3 C5-2 | G5-5 E5-4 D5-3 C5-2 B4-1 C5-2 D5-3 E5-4 | F5-5 D5-4 C5-3 B4-2 A4-1 B4-2 C5-3 D5-4 | E5-5 C5-4 B4-3 A4-2 G4-1 A4-2 B4-3 C5-4 | D5-5 B4-4 A4-3 G4-2 F4-1 G4-2 A4-3 B4-4 | C5-5 A4-4 G4-3 F4-2 E4-1 F4-2 G4-3 A4-4 | B4-5 G4-4 F4-3 E4-2 D4-1 E4-2 F4-3 G4-4 | C4-1w" }),
        ],
      },
      {
        id: "5-5", title: "Seventh chords & ii – V – I", mins: 10,
        goals: ["Build the five seventh chords", "Play the ii–V–I cadence with voice leading"],
        body: [
          p("Add another 3rd on top of a triad and you get a <b>seventh chord</b> — richer and more colorful. The five you need:"),
          list([
            "<b>maj7</b> (C E G B) — dreamy, soft. Major triad + major 7th.",
            "<b>7</b> — dominant (C E G B♭) — bluesy, wants to resolve. Major triad + minor 7th.",
            "<b>m7</b> (C E♭ G B♭) — smooth, mellow. Minor triad + minor 7th.",
            "<b>m7♭5</b> — half-diminished (C E♭ G♭ B♭) — moody.",
            "<b>dim7</b> (C E♭ G♭ B𝄫/A) — dramatic, suspenseful.",
          ]),
          p("<b>ii – V – I</b> (Dm7 – G7 – Cmaj7 in C) is the most important progression in jazz and very common everywhere. With good voice leading the 7th of each chord steps down to the 3rd of the next."),
          quiz("A dominant 7th chord on G is…", ["G B D F", "G B D F♯", "G B♭ D F"], 0),
          ex({ title: "Five sevenths on C", ts: "4/4", tempo: 60, rh: "\"Cmaj7\" C4-1+E4-2+G4-3+B4-5w | \"C7\" C4-1+E4-2+G4-3+Bb4-5w | \"Cm7\" C4-1+Eb4-2+G4-3+Bb4-5w | \"Cm7b5\" C4-1+Eb4-2+Gb4-3+Bb4-5w | \"Cdim7\" C4-1+Eb4-2+Gb4-3+A4-5w" }),
          ex({ title: "ii – V – I in C", desc: "Right hand moves by tiny steps; left hand plays roots.", ts: "4/4", tempo: 66, rh: "F4-1+A4-3+C5-5w | F4-1+G4-2+B4-4w | E4-1+G4-2+B4-4w | E4-1+G4-2+B4-4w", lh: "\"Dm7\" D3-5w | \"G7\" G2-5w | \"Cmaj7\" C3-5w | C3-5w" }),
        ],
      },
      {
        id: "5-6", title: "Minuet in G — Petzold", mins: 15,
        goals: ["Learn your first real classical piece", "Play an independent bass line"],
        body: [
          p("This Minuet (long attributed to J.S. Bach, actually by Christian Petzold, c. 1725) is in <b>G major</b> and <b>3/4</b>. It's one of the first real pieces every classical pianist learns — here are its first 8 measures."),
          list([
            "Right hand: mostly eighth notes by step — keep them even and legato, a slight lift on the quarter notes.",
            "Left hand: a real melody of its own, not just chords. Play it alone until it sings.",
            "Put hands together slowly (60 bpm), then aim for about 100.",
          ]),
          ex({ title: "Minuet in G — measures 1–8", key: "G", ts: "3/4", tempo: 88, rh: "D5-5q G4-1e A4-2 B4-3 C5-4 | D5-5q G4-1 G4-1 | E5-5q C5-1e D5-2 E5-3 F#5-4 | G5-5q G4-1 G4-1 | C5-4q D5-5e C5-4 B4-3 A4-2 | B4-3q C5-4e B4-3 A4-2 G4-1 | F#4-2q G4-1e A4-2 B4-3 G4-1 | A4-2h.", lh: "G3-5+B3-3+D4-1h A3-4q | B3-3h. | C4-2h. | B3-3h. | A3-4h. | G3-5h. | D4-1q B3-3 G3-5 | D4-1q D3-5 C4-1" }),
        ],
      },
      {
        id: "5-7", title: "How professionals practice", mins: 6,
        goals: ["Practice efficiently", "Build a daily routine"],
        body: [
          p("The difference between people who improve fast and people who don't is rarely talent — it's <b>how</b> they practice. These are the methods conservatory students use:"),
          list([
            "<b>Slow practice.</b> Practice at a tempo where you make <i>no</i> mistakes. Every wrong repetition trains the mistake.",
            "<b>Chunking.</b> Work on 1–2 measures at a time, then link them (always overlap one note into the next chunk).",
            "<b>Hands separately first</b>, then together.",
            "<b>Metronome ladder.</b> Once clean, raise the tempo 4–6 bpm at a time. When it breaks, drop back two steps.",
            "<b>Fix the hard spot first</b> — don't keep playing from the beginning.",
            "<b>Rhythm variations</b> for fast passages: long-short, short-long — it trains control.",
            "<b>Record yourself</b> and listen back as if you were the audience.",
            "<b>Rest.</b> Several short sessions beat one long one; your brain consolidates skills in between.",
          ], true),
          h("A daily 30-minute routine"),
          list([
            "5 min — warm-up: scales & arpeggios in one key (a new key each week).",
            "5 min — technique: Hanon or a chord progression through several keys.",
            "15 min — repertoire: the piece you're learning, in chunks.",
            "5 min — sight-reading or ear training (use the trainers in Tools).",
          ]),
          tool("metronome", "Open the metronome"),
        ],
      },
    ],
  },

  /* ─────────────────────────── LEVEL 6 ─────────────────────────── */
  {
    id: "L6", title: "Advanced Musicianship", sub: "Modes, blues, jazz voicings, Beethoven, Bach, Satie — and beyond.", color: "#f87171",
    lessons: [
      {
        id: "6-1", title: "Modes", mins: 10,
        goals: ["Know the seven modes", "Hear Dorian and Mixolydian"],
        body: [
          p("Play the C major scale starting and ending on a different note, and you get a <b>mode</b>: same notes, different home, different mood."),
          list([
            "<b>Ionian</b> (C–C) — the major scale.",
            "<b>Dorian</b> (D–D) — minor with a bright 6th. Jazz, funk, folk.",
            "<b>Phrygian</b> (E–E) — minor with a dark ♭2. Spanish/flamenco.",
            "<b>Lydian</b> (F–F) — major with a ♯4. Dreamy, film music.",
            "<b>Mixolydian</b> (G–G) — major with a ♭7. Rock, blues, the sound of a dominant 7th.",
            "<b>Aeolian</b> (A–A) — the natural minor scale.",
            "<b>Locrian</b> (B–B) — unstable; rarely used as a home.",
          ]),
          quiz("Which mode starts on the 2nd note of the major scale?", ["Phrygian", "Dorian", "Lydian"], 1),
          quiz("Mixolydian is a major scale with a…", ["♯4", "♭7", "♭3"], 1),
          ex({ title: "D Dorian", ts: "4/4", tempo: 72, rh: "D4-1q E4-2 F4-3 G4-1 | A4-2 B4-3 C5-4 D5-5 | C5-4 B4-3 A4-2 G4-1 | F4-3 E4-2 D4-1h" }),
          ex({ title: "G Mixolydian", ts: "4/4", tempo: 72, rh: "G4-1q A4-2 B4-3 C5-1 | D5-2 E5-3 F5-4 G5-5 | F5-4 E5-3 D5-2 C5-1 | B4-3 A4-2 G4-1h" }),
        ],
      },
      {
        id: "6-2", title: "The blues", mins: 12,
        goals: ["Play the blues scale", "Play a 12-bar blues with a boogie left hand"],
        body: [
          p("The <b>12-bar blues</b> is the foundation of blues, rock'n'roll and jazz. In C it uses three dominant-7th chords, C7, F7 and G7, in this order:"),
          p("<b>C7 C7 C7 C7 | F7 F7 C7 C7 | G7 F7 C7 G7</b>"),
          p("The <b>blues scale</b> on C: C E♭ F F♯ G B♭ C — the “blue note” F♯ (♭5) gives it its bite."),
          p("Right hand here plays <b>guide tones</b>: just the 3rd and 7th of each chord. Notice how they slide by half steps from chord to chord — a jazz-pianist's secret."),
          ex({ title: "C blues scale", ts: "4/4", tempo: 80, rh: "C4-1e Eb4-2 F4-3 F#4-4 G4-1 Bb4-2 C5-3 Bb4-2 | G4-1 F#4-4 F4-3 Eb4-2 C4-1h" }),
          ex({ title: "12-bar blues in C", desc: "Left hand: boogie pattern (5th–6th). Right hand: 3rds and 7ths.", ts: "4/4", tempo: 100, rh: "E4-1+Bb4-4w | E4-1+Bb4-4w | E4-1+Bb4-4w | E4-1+Bb4-4w | Eb4-1+A4-4w | Eb4-1+A4-4w | E4-1+Bb4-4w | E4-1+Bb4-4w | F4-1+B4-4w | Eb4-1+A4-4w | E4-1+Bb4-4w | F4-1+B4-4w", lh: "\"C7\" C3-5+G3-2q C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | \"F7\" F2-5+C3-2 F2-5+C3-2 F2-5+D3-1 F2-5+D3-1 | F2-5+C3-2 F2-5+C3-2 F2-5+D3-1 F2-5+D3-1 | \"C7\" C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | \"G7\" G2-5+D3-2 G2-5+D3-2 G2-5+E3-1 G2-5+E3-1 | \"F7\" F2-5+C3-2 F2-5+C3-2 F2-5+D3-1 F2-5+D3-1 | \"C7\" C3-5+G3-2 C3-5+G3-2 C3-5+A3-1 C3-5+A3-1 | \"G7\" G2-5+D3-2 G2-5+D3-2 G2-5+E3-1 G2-5+E3-1" }),
          tip("Improvise: loop the left hand and play anything from the C blues scale in the right. There are no wrong notes in that scale over this progression."),
        ],
      },
      {
        id: "6-3", title: "Jazz voicings", mins: 12,
        goals: ["Play shell voicings", "Play rootless A-voicings for ii–V–I"],
        body: [
          p("Jazz pianists rarely play plain triads. Two essential voicing systems:"),
          list([
            "<b>Shell voicings</b> (left hand): just root + 3rd or root + 7th. Clean, and leaves room for the melody.",
            "<b>Rootless voicings</b>: the bass player has the root, so the pianist plays 3rd, 5th, 7th and a colour note (9th, 13th). The ii–V–I “A-voicings” below are used on countless recordings.",
          ]),
          ex({ title: "Shell voicings: ii – V – I", ts: "4/4", tempo: 72, lh: "\"Dm7\" D3-5+C4-1w | \"G7\" G2-5+B2-3w | \"Cmaj7\" C3-5+B3-1w | C3-5+B3-1w" }),
          ex({ title: "Rootless voicings: Dm9 – G13 – Cmaj9", desc: "Only one or two notes move each time. Hear the colour of the 9ths and 13th.", ts: "4/4", tempo: 66, rh: "F4-1+A4-2+C5-3+E5-5w | F4-1+A4-2+B4-3+E5-5w | E4-1+G4-2+B4-3+D5-5w | E4-1+G4-2+B4-3+D5-5w", lh: "\"Dm9\" D3-5w | \"G13\" G2-5w | \"Cmaj9\" C3-5w | C3-5w" }),
          tip("Take these voicings through all 12 keys, following the circle of fifths (C – F – B♭ – E♭…). That's exactly how jazz students practice them."),
        ],
      },
      {
        id: "6-4", title: "Für Elise — Beethoven", mins: 15,
        goals: ["Play the opening of Für Elise", "Pass melody between hands smoothly"],
        body: [
          p("Beethoven's <i>Bagatelle in A minor</i> (1810). It's in <b>3/8</b>: three eighth-note beats per measure, counted in one gentle pulse. It starts with a two-note pickup."),
          list([
            "The E–D♯ trill-like motif is played with fingers 5–4, very light, like a whisper.",
            "The left-hand broken chords (A–E–A, E–E–G♯) hand the line over to the right hand — the listener should hear one continuous flowing line.",
            "Use the pedal on each left-hand broken chord and release it on the next E–D♯ motif.",
          ]),
          ex({ title: "Für Elise — opening", key: "Am", ts: "3/8", pickup: 0.5, tempo: 66, rh: "!p E5-5s D#5-4 | E5-5 D#5-4 E5-5 B4-2 D5-4 C5-3 | A4-1e rs C4-1s E4-2 A4-3 | B4-4e rs E4-1s G#4-2 B4-3 | C5-4e rs E4-1s E5-5 D#5-4 | E5-5 D#5-4 E5-5 B4-2 D5-4 C5-3 | A4-1e rs C4-1s E4-2 A4-3 | B4-4e rs E4-1s C5-4 B4-3 | A4-2q.", lh: "re | rq. | A2-5s E3-2 A3-1 rs re | E2-5s E3-2 G#3-1 rs re | A2-5s E3-2 A3-1 rs re | rq. | A2-5s E3-2 A3-1 rs re | E2-5s E3-2 G#3-1 rs re | A2-5s E3-2 A3-1 rs re" }),
        ],
      },
      {
        id: "6-5", title: "Prelude in C — J.S. Bach", mins: 15,
        goals: ["Play broken-chord texture evenly", "Hear harmony change bar by bar"],
        body: [
          p("The first prelude of Bach's <i>Well-Tempered Clavier</i> (1722) is one long chord progression, each harmony broken into the same pattern. Its beauty is in total evenness — no note louder than planned."),
          list([
            "Each half-measure: the left hand plays two low notes and <b>holds</b> them; the right hand plays the rest of the chord twice.",
            "Before playing, look at each measure and name its chord: C, Dm7/C, G7/B, C, Am/C, D7/C, G/B, Cmaj7/B…",
            "Tempo is calm (around 60–70). Aim for perfect evenness first.",
          ]),
          ex({ title: "Prelude in C, BWV 846 — measures 1–8", ts: "4/4", tempo: 60, lh: ["C4-5h C4-5h | C4-5h C4-5h | B3-5h B3-5h | C4-5h C4-5h | C4-5h C4-5h | C4-5h C4-5h | B3-5h B3-5h | B3-5h B3-5h", "rs E4-3q.. rs E4-3q.. | rs D4-4q.. rs D4-4q.. | rs D4-3q.. rs D4-3q.. | rs E4-3q.. rs E4-3q.. | rs E4-3q.. rs E4-3q.. | rs D4-4q.. rs D4-4q.. | rs D4-3q.. rs D4-3q.. | rs C4-4q.. rs C4-4q.."], rh: "re G4-1s C5-3 E5-5 G4-1 C5-3 E5-5 re G4-1s C5-3 E5-5 G4-1 C5-3 E5-5 | re A4-1s D5-3 F5-5 A4-1 D5-3 F5-5 re A4-1s D5-3 F5-5 A4-1 D5-3 F5-5 | re G4-1s D5-3 F5-5 G4-1 D5-3 F5-5 re G4-1s D5-3 F5-5 G4-1 D5-3 F5-5 | re G4-1s C5-3 E5-5 G4-1 C5-3 E5-5 re G4-1s C5-3 E5-5 G4-1 C5-3 E5-5 | re A4-1s E5-3 A5-5 A4-1 E5-3 A5-5 re A4-1s E5-3 A5-5 A4-1 E5-3 A5-5 | re F#4-1s A4-2 D5-5 F#4-1 A4-2 D5-5 re F#4-1s A4-2 D5-5 F#4-1 A4-2 D5-5 | re G4-1s D5-3 G5-5 G4-1 D5-3 G5-5 re G4-1s D5-3 G5-5 G4-1 D5-3 G5-5 | re E4-1s G4-2 C5-5 E4-1 G4-2 C5-5 re E4-1s G4-2 C5-5 E4-1 G4-2 C5-5" }),
        ],
      },
      {
        id: "6-6", title: "Gymnopédie No. 1 — Satie", mins: 15,
        goals: ["Play a wide left-hand leap accurately", "Shape a slow melody with pedal"],
        body: [
          p("Erik Satie, 1888. Marked <i>Lent et douloureux</i> — slow and sorrowful. In <b>D major/3/4</b>, the left hand swings between a low bass note on beat 1 and a soft chord on beats 2–3, alternating G major 7 and D major 7."),
          list([
            "The left-hand leap is the challenge: look ahead, move early, and land softly. Practice it alone for a few days.",
            "Change the pedal on every beat 1.",
            "The melody floats <i>above</i> the chords: play it slightly louder and perfectly legato.",
          ]),
          ex({ title: "Gymnopédie No. 1 — opening", key: "D", ts: "3/4", tempo: 72, rh: "rh. | rh. | rh. | rh. | rq F#5-3 A5-5 | G5-4 F#5-3 C#5-1 | B4-1 C#5-2 D5-3 | A4-1h. | F#4-1h.", lh: "!pp !ped G2-5q B3-3+D4-2+F#4-1h | !ped D2-5q A3-3+C#4-2+F#4-1h | !ped G2-5q B3-3+D4-2+F#4-1h | !ped D2-5q A3-3+C#4-2+F#4-1h | !ped G2-5q B3-3+D4-2+F#4-1h | !ped D2-5q A3-3+C#4-2+F#4-1h | !ped G2-5q B3-3+D4-2+F#4-1h | !ped D2-5q A3-3+C#4-2+F#4-1h | !ped G2-5q B3-3+D4-2+F#4-1h !*" }),
        ],
      },
      {
        id: "6-7", title: "Sight-reading, memory & performance", mins: 8,
        goals: ["Read new music fluently", "Memorize reliably", "Perform under pressure"],
        body: [
          h("Sight-reading"),
          list([
            "Before playing, scan: key signature, time signature, the lowest/highest notes, repeated patterns, tricky rhythms.",
            "Keep going no matter what. Leave out notes rather than stop — rhythm is king.",
            "Read ahead: your eyes should be at least a beat ahead of your hands.",
            "Read in shapes (steps, skips, chords), not single letters.",
            "Daily: 5 minutes of something easy you've never seen. Use the Note Reading trainer to automate note names.",
          ]),
          h("Memorizing"),
          list([
            "Use four kinds of memory together: <b>aural</b> (hear it), <b>muscle</b> (feel it), <b>visual</b> (see the score/keyboard) and <b>analytical</b> (know the chords and structure).",
            "Be able to start from several “landmarks” in the piece, not only from the beginning.",
            "Test yourself away from the piano: can you play it in your head?",
          ]),
          h("Performing"),
          list([
            "Practice performing: play for a friend, a phone camera, or a video call — once is not enough.",
            "Have a pre-performance routine: breathe, feel the tempo in your head before the first note.",
            "Mistakes will happen. Professionals keep the pulse and move on; the audience rarely notices.",
          ]),
        ],
      },
      {
        id: "6-8", title: "Your path to professional", mins: 6,
        goals: ["Plan your next years of study"],
        body: [
          p("You've covered the foundations that every professional pianist relies on. Here's how the path continues:"),
          list([
            "<b>Technique:</b> all 12 major and minor scales and arpeggios, 2–4 octaves, hands together. Then Czerny studies (Op. 599 → 849 → 299), later Chopin études.",
            "<b>Classical repertoire:</b> Bach Little Preludes and Inventions → Clementi and Kuhlau sonatinas → Mozart and Haydn sonatas → Chopin waltzes and nocturnes → Beethoven sonatas → Debussy, Rachmaninoff.",
            "<b>Pop/jazz route:</b> lead-sheet playing in all keys, rootless voicings, stride and walking bass, improvisation over standards (Autumn Leaves, All the Things You Are).",
            "<b>Ear training:</b> sing intervals, transcribe melodies and chords by ear — use the Ear Trainer daily.",
            "<b>Theory:</b> harmony and voice leading, counterpoint, form (binary, sonata), modulation.",
            "<b>Exams & teachers:</b> graded exams (ABRSM, RCM, Trinity) give structure; a good teacher, even once a month, corrects what no app can see — your posture, tone and musical shaping.",
            "<b>Play with others:</b> accompany singers, join a band or chamber group. It teaches listening like nothing else.",
          ]),
          tip("Keep a practice journal: date, what you practiced, tempo reached, what to fix tomorrow. Small daily progress becomes mastery. Enjoy the journey!"),
        ],
      },
    ],
  },
];

export const ALL_LESSONS = LEVELS.flatMap((lv) => lv.lessons.map((ls) => ({ ...ls, level: lv })));
export const lessonById = (id) => ALL_LESSONS.find((l) => l.id === id);
export function nextLesson(id) {
  const i = ALL_LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? ALL_LESSONS[i + 1] || null : null;
}
export function exercisesOf(lesson) { return lesson.body.filter((b) => b.t === "ex"); }
