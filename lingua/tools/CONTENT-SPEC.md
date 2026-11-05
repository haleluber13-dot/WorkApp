# LinguaPath content spec

LinguaPath (`lingua/`) is a static, no-build language-learning PWA (vanilla ES modules).
Content is **data-driven**: a language-neutral *concept* curriculum (English + Hebrew base
text) plus one *language pack* per target language that maps every concept id to target text.

All files are ES modules under `lingua/js/content/`. Plain JS object literals only — no imports,
no functions, no template literals, no comments containing backticks. Valid UTF-8. Use straight
double quotes for keys and strings (escape `"` inside as `\"`). Must pass `node --check`.

## 1. Concepts — `concepts-a.js` (levels A1, A2) and `concepts-b.js` (B1, B2, C1, C2)

```js
export const UNITS = [ /* unit objects, in course order */ ];
export const READINGS = [ /* reading objects */ ];
```

### Unit object

```js
{
  id: "a1-01",                       // <level lowercase>-<2 digits>, course order
  level: "A1",                       // A1 A2 B1 B2 C1 C2
  emoji: "👋",
  title: { en: "Greetings & introductions", he: "ברכות והיכרות" },
  goals: { en: ["Say hello and goodbye", "Introduce yourself"], he: ["...", "..."] },   // 3 goals
  grammarFocus: { en: "Subject pronouns; the verb 'to be'; formal vs informal 'you'",
                  he: "..." },      // what a language pack's grammar notes for this unit must cover
  vocab: [
    { id: "w.a1-01.hello", en: "hello", he: "שלום", pos: "interj" },
    { id: "w.a1-01.to-be", en: "to be", he: "להיות", pos: "verb" },
    // ...
  ],
  phrases: [ { id: "p.a1-01.1", en: "Nice to meet you.", he: "נעים מאוד." } /* ... */ ],
  sentences: [ { id: "s.a1-01.1", en: "My name is Anna and I am from Israel.", he: "..." } /* ... */ ],
  dialogue: {
    title: { en: "At a party", he: "במסיבה" },
    roles: { A: "Anna", B: "Daniel" },
    lines: [ { id: "d.a1-01.1", who: "A", en: "Hi! I'm Anna.", he: "היי! אני אנה." } /* ... */ ]
  },
  speaking: { en: "Introduce yourself: your name, where you are from and what you do.", he: "..." },
  writing:  { en: "Write four sentences about yourself.", he: "..." },
  model:    { id: "m.a1-01", en: "My name is ... . I am from ... . I am a ... . I speak ... .", he: "..." }
}
```

Rules:
- **ids** are globally unique and follow the patterns above exactly: `w.<unit>.<slug>`, `p.<unit>.<n>`,
  `s.<unit>.<n>`, `d.<unit>.<n>`, `m.<unit>`. Slugs: lowercase a–z, digits and hyphens only.
- `pos` ∈ noun, verb, adj, adv, pron, prep, conj, num, interj, det, phrase.
- English: verbs as "to eat"; nouns singular without article; adjectives base form.
  Hebrew: standard spelling without niqqud; verbs in infinitive (לאכול); nouns singular; adjectives masculine singular.
  Where a word is a noun with gender-specific Hebrew, give the masculine. Hebrew must be natural and correct.
- Each vocabulary word appears **once in the whole course** (do not re-teach "hello" in A2). Pick the
  most useful words for that level's topic (frequency-based, practical).
- Phrases: complete, useful, natural utterances (not single words). Sentences: full sentences 5–12 words that
  mainly reuse this unit's and earlier units' vocabulary — they are used for word-ordering and translation exercises.
- Dialogue: 8–12 lines, two speakers A/B (occasionally C), realistic, reuses unit vocabulary; A1 lines short.
- Counts per unit: vocab 26–32 (C1/C2: 22–26), phrases 10–12, sentences 10–12.
- Every `en` has a matching `he`. No empty strings.

### Reading object

```js
{ id: "r.a1.1", level: "A1", title: { en: "A new neighbour", he: "שכן חדש" },
  text: { en: "…60–80 words…", he: "…" },
  questions: [ { q: { en: "Where does Marta live?", he: "..." },
                 options: { en: ["In Madrid", "In Lisbon", "In Rome"], he: ["...", "...", "..."] },
                 answer: 0 } /* 3 questions */ ] }
```
Word counts: A1 60–80, A2 100–130, B1 160–200, B2 220–280, C1 300–380, C2 380–480. Narrative or
informational text in **plain English** that translates well (it will be translated into each target
language). Count: A1 3, A2 3, B1 3, B2 3, C1 2, C2 2. Questions test comprehension; one correct option.

### Level plan (unit topics)

A1 (10): greetings & introductions · numbers, time & dates · family & people · food & drink · at the café/restaurant ·
the city & directions · shopping & money · daily routine · home & rooms · weather, seasons & free time.
A2 (10): travel & transport · at the hotel & holidays · health & the body · work & professions · school & study ·
clothes & describing people · past events & telling stories · plans & the future · feelings & opinions · technology & communication.
B1 (8): culture, media & entertainment · nature & environment · relationships & social life · services, bank & bureaucracy ·
housing & moving · health, fitness & lifestyle · news, politics & society · work life & careers.
B2 (6): education & learning · science & technology · economy & business · arts & literature · law, rights & justice · global issues.
C1 (4): argumentation & debate · psychology & behaviour · history & philosophy · academic & professional writing.
C2 (3): idioms, register & nuance · humour, irony & wordplay · literature, rhetoric & style.

Vocabulary should get progressively more abstract/precise. Keep A1/A2 concrete and high-frequency.

## 2. Language pack — `<code>.js` (e.g. `es.js`, `pt.js`)

```js
export default {
  code: "es", name: "Español", englishName: "Spanish",
  variant: { en: "Neutral Spanish (Spain forms noted where they differ)", he: "..." },
  tts: ["es-ES", "es-MX", "es-US"],            // preferred speech-synthesis locales, best first
  stt: "es-ES",                                 // speech-recognition locale
  dir: "ltr",
  pronouns: ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ellas/ustedes"],
  articles: ["el", "la", "los", "las", "un", "una", "unos", "unas"],   // stripped when checking typed answers
  alphabet: [ { ch: "a", ex: "casa", en: "like a in 'father'", he: "כמו פתח: קאסה" } /* every letter/sound incl. digraphs */ ],
  tips: [ { en: "Stress falls on the second-to-last syllable unless marked with an accent.", he: "..." } /* 5–8 */ ],
  t: {
    "w.a1-01.hello": "hola",
    "w.a1-01.dog": "el perro",             // NOUNS include the definite article (teaches gender)
    "w.a1-01.to-be": "ser / estar",         // verbs: infinitive
    "p.a1-01.1": "Mucho gusto.",
    "s.a1-01.1": "Me llamo Ana y soy de Israel.",
    "d.a1-01.1": "¡Hola! Soy Ana.",
    "m.a1-01": "Me llamo ... . Soy de ... .",
    "r.a1.1": "…full translated reading text…",
    // EVERY id from both concept files must be present (vocab, phrases, sentences, dialogue lines, models, readings)
  },
  notes: { "w.a1-01.hello": { en: "Also 'buenas' informally.", he: "..." } },   // optional, tricky words only
  names: { "a1-01": { A: "Ana", B: "Daniel" } },  // optional: localised dialogue speaker names
  grammar: {
    "a1-01": [                                     // one array per unit, covering that unit's grammarFocus
      { title: { en: "Subject pronouns", he: "..." },
        body: { en: "Clear explanation, 60–160 words. Plain text; use \n for new lines.", he: "..." },
        examples: [ { t: "Yo soy Ana.", en: "I am Ana.", he: "אני אנה." } /* 3–6 */ ] }
      /* 1–3 points per unit */
    ],
    // ... every unit a1-01 … c2-03
  },
  verbs: {
    "ser": { en: "to be (identity)", he: "להיות", irregular: true,
             forms: { present: ["soy","eres","es","somos","sois","son"],
                      past:    ["fui","fuiste","fue","fuimos","fuisteis","fueron"],
                      future:  ["seré","serás","será","seremos","seréis","serán"] } }
    // 20–25 most useful verbs, 6 forms each in the pack's pronoun order; add "imperfect" / "conditional" if idiomatic
  },
  tenses: { present: { en: "Present", he: "הווה" }, past: { en: "Past (preterite)", he: "עבר" }, future: { en: "Future", he: "עתיד" } }
};
```

Rules for packs:
- Translate **meaning**, naturally, as a native speaker would say it in that context; keep register consistent
  with the dialogue. Vocabulary: single best equivalent (alternatives via `notes`). Nouns with definite article
  (es/pt/fr/it/de). German nouns capitalised. Readings translated fully and naturally.
- Provide `grammar` for **every** unit (41 units), aligned with that unit's `grammarFocus` but explaining how
  it works in *this* language (e.g. ser vs estar, ter vs haver, gendered articles, cases for German…).
  Hebrew body text must be real Hebrew (not transliteration). Keep `he` and `en` equivalent in meaning.
- Hebrew explanations should mention Hebrew contrasts where helpful (e.g. "unlike Hebrew, adjectives come after…").
- `alphabet` covers all letters and important digraphs/sounds of the language (Spanish: ñ, ll, rr, ch, c/z, g/j, h…).

## 3. Validation

```bash
node lingua/tools/validate.mjs            # checks concept files
node lingua/tools/validate.mjs es pt      # checks packs: coverage of every id, grammar for every unit
```
Must print `OK` with zero errors before you finish.
