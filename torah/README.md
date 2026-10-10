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

## The points

A Hebrew letter on its own does not tell you how it is said. The dots and
dashes around it — the **niqqud** — carry the vowels, the doubling, and the
hard or soft reading of a consonant. They are written in the text and they are
sounded in the music.

- **Vowels bend the pitch.** Bright vowels sit high and dark ones low, which is
  roughly how the second formant really behaves: `i` +2 degrees, `e` +1,
  `a` 0, `o` −1, `u` −2. The shift is in degrees of the mode, so the note never
  leaves the nusach.
- **Vowels set the length.** A qamats or a holam is held; a patah or a hiriq is
  shorter; a hataf or a sounded sheva is barely there. This is what makes a
  word move the way it is spoken rather than as an even row of notes.
- **A dagesh accents.** A dagesh chazak doubles its letter, so the note is
  struck twice; a dagesh kal or a mappiq just lands harder.
- **Silent letters become ghosts** rather than notes — a sheva nach, a resting
  alef, a final he without a mappiq, a yod or vav that is only carrying a
  vowel.

Tap or hover any word and it tells you roughly how it sounds:
בְּרֵאשִׁית is `bəreshit`, הַשָּׁמַיִם is `hashshamayim` with the dagesh
doubling the shin.

All four can be switched off in ☰, and so can the points themselves if you want
the bare consonants back. The vowel table sits under the 22 letters in **The 22
letters**.

The syllable rules here — whether a sheva is sounded, whether a dagesh doubles
or hardens — are the standard teaching rules. They are a good approximation,
not a full grammatical parse, and they will be wrong on some words.

## The voice the app builds itself

The **Voice** lead, in the Beat tab, is not a recording and not the operating
system's speech engine — it is a vocal tract made out of filters. A buzzing
source stands in for the vocal folds and three bandpass filters stand in for
the resonances of the mouth and throat; moving those three resonances is what
turns one steady buzz into "a", "e" or "u".

Because the niqqud reader already works out the consonant and the vowel on
every letter, it sings the **actual syllables** of the text rather than
humming through them. בְּרֵאשִׁית comes out as *bə-re-ʾ-shi-y-t*, one syllable
per note, on the pitch that letter was given.

Consonants are articulated by class: stops close and release with a burst,
fricatives hiss ahead of the vowel at their own frequency, nasals hum through
a lowpass before opening, liquids slide their formants into place. The
**throat** control scales every resonance at once — a shorter tract is a
smaller head making the same note, which is the whole difference between Bass
and Child. Vibrato holds back a moment before it arrives, the way a singer's
does.

It is a crude voice. It is recognisably a voice.

## Every note, one at a time

The **Notes** tab lists every letter of a verse with the syllable it sings,
and lets you change any of them: pitch by the semitone, length from a quarter
to three times, level, or silence it outright.

Edits are filed against the letter's address in the book — `genesis:1:1:0:2`
— not its position in what is currently loaded. So a note you changed stays
changed through a style change, a tempo change, leaving the chapter and
coming back, and a reload. **Reset all** clears them.

## Read aloud

The **Read aloud** tab narrates the text over the music.

### The voice that is always there

The first voice in the list is the **built-in voice** — the same vocal tract of
filters that sings the melody, taught to read instead of sing. It needs nothing
installed, so it is there on any device, and it is what the app starts with.

Reading is not singing: the pitch is not taken from the music but drifts down
across the phrase and drops at the end, which is what makes a sentence sound
finished, and each syllable's length comes from the vowel written on it rather
than from a beat. Because the niqqud reader resolves the consonant and vowel on
every letter, it pronounces the Hebrew properly — it reads the Hebrew whichever
text is on screen.

**Who is reading** picks the register: a man, a woman, neither, a child, an
elder, or something deeper than any real throat. These are vocal tract length
and fold rate, which is most of what we hear as one person rather than another.
Nobody in particular — see the note at the end of this section.

**Change it while it is reading and it changes on the spot.** The narrator has
its own output, so swapping the reader cuts the voice and restarts the line
without touching the music.

### Voices from the device

Below the built-in one sit whatever the operating system has installed. Nothing is sent anywhere — the speaking happens
on your phone or laptop.

- **Any language the device can speak.** A Mac or iPhone usually has dozens
  including Hebrew; Android has whatever Google Speech Services has downloaded;
  a bare Linux browser may have none, which is why the built-in voice exists.
  A device voice can read a translation in its own language.
- **Two modes.** *Follow the music* speaks each verse as the playhead reaches
  it — note that the fast styles outrun any narrator, so this suits Ambient
  Scroll, Drone, Dub and Downtempo. *Audiobook* lets the narrator set the pace,
  reading verse after verse with the music underneath.
- **What to read**: the pointed Hebrew, the transliteration, or a translation.
- **Eight characters** — Storyteller, Herald, Scholar, Light, Close, Rush,
  Dream — which shape the device's own voice with speed and pitch, plus the
  three sliders underneath. They are not impressions of anybody.
- **Ducking** drops the band under the voice and brings it back after.

### The languages

Speaking a language and having the text in it are two different things. The
voices cover whatever the device has; the **words** have to come from a
translation. Four are bundled, and every one is public domain:

| | |
|---|---|
| English | The Holy Scriptures: A New Translation (JPS 1917) |
| Français | Bible du Rabbinat, 1899 |
| Polski | trans. Izaak Cylkow, 1841–1908 |
| Esperanto | La Malnova Testamento, L. L. Zamenhof |

`tools/torah_translations.py` fetches them from [Sefaria](https://www.sefaria.org)
and **refuses any version not marked Public Domain** — the check runs per book
at fetch time, so a licence change upstream cannot quietly pull a restricted
text into the bundle. That guard is why the list is four and not ten.

For any other language, load your own from the bottom of the pane: either a
JSON file shaped `{ "label": "…", "books": { "genesis": [[verse, …], …] } }`,
or a plain text file with one verse per line laid over the current selection.

### On celebrity and musician voices

Not supported, deliberately. Cloning a real person's voice to narrate text puts
words in their mouth they never said; name, likeness and voice are protected in
many places, and several jurisdictions now legislate on voice cloning
specifically. The character presets shape the device's own voice instead.

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
| Dark Psy | 152 | A long dark kick, a twisted low lead and no daylight at all. |
| Forest | 160 | Organic and burbling — tight clicky kick, wooden percussion, everything staccato. |
| Zenonesque | 140 | Slow, broken and bit-crushed. Space where the other psy styles put more notes. |
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

## Making it yours

Everything above is a starting point. Five panes across the top of the right-hand
side open the whole thing up.

**Beat** — every track in the current style, with mute, solo and level, and a
clickable step grid for each drum. Tap a step to cycle it through rest, ghost,
soft, normal and hard.

Above the tracks sit three pickers that work on any style:

- **Kick** — ten of them. Psy, Dark, Forest, Punch, Soft, 808, Distorted,
  Gabber, Sub and Click. All the same synthesis with different numbers: a pitch
  sweep, how fast it falls, how long the body rings, how much transient sits on
  top and how hard it is clipped.
- **Bass** — seven timbres, independent of the pattern the style plays. Roll,
  808 sub, Round, Reese (detuned saws beating against each other), FM growl,
  Squelch (the burbling forest sound) and Pluck.
- **Groove** — ten ready-made drum patterns you can drop onto any style: four
  on the floor, offbeat pump, rolling sixteenths, breakbeat, half-time, broken,
  tribal, stomp, sparse and double time. The kick and bass sounds stay whatever
  you picked.

Reset puts the style's own patterns and sounds back.

**Samples** — record straight from your phone or laptop microphone, or bring in
any audio file. Clips are kept in this browser, on your device: nothing is
uploaded anywhere. Give a clip to one of the eight pads, tap the steps it should
fire on, and set its level, pitch, start point and whether it is cut off by the
next hit or left to ring.

**Lyrics** — type your own words, one line per bar. A blank line rests for a bar
and trailing dots hold a line for an extra bar each. The lines land on the beat,
a ticker under the header follows along as it plays, and the count beside each
line is its syllables — past about four a beat it stops being sayable, and the
app says so. Save them as an `.lrc` so the words travel with the audio. The app
places the words you write; it does not write any.

**Plug-ins** — eight effects in signal order, each with a bypass and a couple of
knobs: drive, bitcrush, filter, chorus, sidechain, delay, reverb and stereo
width. Every style switches on the ones it needs — the sidechain is most of what
makes the dance styles breathe — and all of it is yours to change.

**Light or dark** — the sun/moon button in the header cycles light, dark and
follow-the-device. Light is the default.

Your whole setup — style, BPM, mode, mixer, patterns, plug-ins, pads and lyrics
— saves in the browser as you go, and downloads as a single file from the
settings panel. Recorded clips stay on the device and are not part of that file.

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
and so on) **for the music**, since they are the same letter and would otherwise get a different
note — but the final forms are kept as written, and so is every point: niqqud,
dagesh and mappiq, the shin and sin dots, meteg and qamats qatan. The
cantillation accents are lifted out separately and drive the trope mapping.

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
- The trope motifs, the drum patterns and the plug-ins are all approximations
  written from scratch. The kits are ordinary genre conventions, not samples of
  anyone's records.
- Recorded clips live in this browser's storage on this device. Clearing site
  data removes them, and they do not sync anywhere.
- The whole Torah is about 480,000 notes. Selecting it works, but it holds the
  entire score in memory and the text pane switches to following the music
  rather than showing everything at once.
