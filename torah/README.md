# אותיות · Otiyot — the letters of the Torah as music

Take every letter of the Torah, give each one a note, and play them in order.
That's the whole idea. No melody is composed by hand: the sequence you hear is
the text itself, read out as pitch.

There are four ways to decide which note a letter gets, and they sound
completely different from each other.

## The four mappings

**Sefer Yetzirah** — the oldest Jewish text that divides the alphabet into
musical groups does the work for us. Three *mothers* (א מ ש) become bass
pillars, the seven *doubles* (ב ג ד כ פ ר ת) become the seven degrees of the
scale, and the twelve *simples* become the twelve semitones. Letters that the
tradition treats as structurally different end up sounding structurally
different.

**Gematria** — each letter is a number. Units (א–ט) sit in the low octave, tens
(י–צ) in the middle, hundreds (ק–ת) up top, and the value inside each rank picks
the degree. Big letters are literally high notes.

**Alphabetical** — Alef to Tav walks straight up the scale. Twenty-two letters,
twenty-two rungs. The plainest possible reading, and a useful control: whatever
structure you hear here is structure that survives the crudest mapping.

**Cantillation (te‘amim)** — this one is different in kind. It ignores the
letters entirely and chants the accent marks instead: the little hooks and
wedges above and below the text that have carried the melody of the reading for
a thousand years. The Torah already *is* music, and this is the closest the app
gets to it. The motifs here are a plain approximation of the Ashkenazi trope,
enough to hear how the accents punctuate a verse. A real reader does far more
with them.

## The styles

The mapping decides which note a letter gets. The **style** decides what kind of
record it becomes — the tempo, the grid the letters land on, the drums
underneath, what the bass does and what the melody is played on. The letters
never change; only the clothes they arrive in.

| Style | BPM | The idea |
|---|---:|---|
| Ambient Scroll | 132 | The plain reading. One letter per beat, no drums. |
| Drone | 42 | Each letter held until it blurs into the next. |
| Goa Trance | 145 | 16th-note acid leads, rolling offbeat bass, 3/16 delay. |
| Full-On Psy | 142 | Bright and busy over a rolling bass. |
| Hi-Tech | 195 | Frantic 16ths and glitching percussion. |
| Psycore | 232 | Distorted kick, screaming lead, no room left. |
| Drum & Bass | 174 | Half-time breakbeat with a sub underneath. |
| Trap | 142 | Half-time snare, gliding 808, hats that stutter into rolls. |
| Boom Bap | 90 | Swung and dusty — the letters as the sample you rap over. |
| Techno | 132 | Four to the floor, offbeat open hat. |
| Dub | 74 | Slow, deep, mostly echo. |
| Downtempo | 86 | Unhurried and warm, for reading along to. |

Every style has its own **BPM**, which you can override from the transport bar;
the slider stays inside the range that genre actually lives in, and the header
shows the letters-per-minute the setting works out to. That number is the real
measure of how fast you are reading: Drone gets through 36 letters a minute,
Psycore 664.

Because tempo and grid change but the text does not, the same chapter can run
2.5 minutes or three quarters of an hour depending on what you pick.

The drum patterns are ordinary genre conventions — a four-to-the-floor kick, a
backbeat snare, an offbeat psytrance bass — written as step strings in
`js/styles.js`, so adding a style is a matter of adding one object.

## The modes

The scale you hear is one of the Jewish prayer modes a Torah reading actually
lives in — **Ahava Rabbah** (the pleading Freygish sound), **Magen Avot**,
**Mi Sheberach** (Ukrainian Dorian, with its raised fourth), or
**Adonai Malach**. Major, minor pentatonic and raw chromatic are there for
comparison, so you can hear how much of the character comes from the mode and
how much from the letters.

## What else is sounding

Beyond the melody line, each word gets a bass note rooted in its own gematria,
each verse gets a quiet chord built on its opening word, and a soft breath marks
every word boundary with a drum at the end of each verse. All three can be
switched off if you want the bare letters.

## What comes out

The interesting part is that the result isn't random and isn't arbitrary — it's
a portrait of Hebrew letter frequency. Yod, He, Vav, Mem, Alef and Lamed carry
most of the text, so their notes become the tonal centre of the piece whether
you intend it or not. The **What comes out** tab shows you exactly that: which
pitches the text lands on, which letters do the most singing, and the most
common melodic moves.

Some numbers, for the whole Torah at the default tempo:

| | |
|---|---|
| Letters | 304,557 |
| Words | 79,915 |
| Verses | 5,853 |
| Notes generated | ~482,000 |
| Playing time | about **45 hours** in Ambient Scroll, **4** at Psycore |

## Run it

Static site, no build step:

```bash
python3 -m http.server 8099
# then open http://localhost:8099/torah/
```

Opening `index.html` straight off disk won't work — the books are fetched as
JSON, so it needs to be served over `http://`. Once loaded, the service worker
caches everything and it runs offline. Installable as a PWA.

## Export

**MIDI** holds the whole selection however long it is, in four tracks — Letters,
Bass, Pads and Drums, with the kit on channel 10 at standard General MIDI keys —
so it opens straight into any DAW or notation program. **WAV** is rendered in the browser, so it's capped at
a few minutes of audio; pick a shorter selection for that.

## The text

The consonantal text is the **Westminster Leningrad Codex**, from
[tanach.us](https://tanach.us) — a freely distributable transcription of a
public-domain text. Final letter forms are folded onto their base letters (ך→כ
and so on), since they are the same letter and would otherwise get a different
note. Vowel points are ignored; the cantillation marks are kept and drive the
trope mapping.

Rebuild the data files with:

```bash
python3 tools/torah_build.py
```

## Honest limits

- The trope motifs are a stylised approximation, not a transcription of any
  particular reader or community's practice, and they don't implement the
  rules that govern how accents combine in a verse.
- Gematria mappings are one of many possible schemes; nothing here is claiming
  a hidden code was found. The point is to hear the text's shape, not to
  decode it.
- The whole Torah is about 480,000 notes. Selecting it works, but it holds the
  entire score in memory and the text pane switches to following the music
  rather than showing everything at once.
