# 🗣️ LinguaPath — learn any language, from zero to fluent

A complete language-learning platform that runs in the browser and installs as an app.
Interface in **English or Hebrew**; learn **Spanish, Portuguese, French, Italian, German**
(full hand-written courses), **English or Hebrew** (native course content), or **any of
97 languages** (the same curriculum built live through machine translation).

Open it at `/lingua/`. Works offline once loaded (translation and speech recognition
need a connection).

## What's inside

- **A1 → C2 course**: 41 units, ~1,150 words, 400+ phrases, 400+ sentences, 41 dialogues,
  16 graded readings, a grammar note set and verb tables per full-course language,
  a sounds & alphabet guide, speaking and writing tasks in every unit.
- **Four skills in every unit** — Words (flashcards) → Practice (mixed exercises) →
  Dialogue (listen, read, role-play with your voice) → Grammar → Speak (microphone task,
  model answer) → Write (back-translation check, optional AI correction).
- **Exercise types**: choose the translation (both directions), what do you hear, match
  the pairs, type the word, dictation, put the words in order, fill the gap, say it out
  loud (speech recognition + pronunciation score), translate the sentence.
- **Smart review**: spaced repetition (SM-2) over every word and phrase you practise, plus
  a phrasebook of anything you save from the translator or tap in a reading.
- **Practice hub**: shadowing drills, dialogue role-play, dictation, graded readings with
  tap-to-translate, guided writing, all grammar & verb tables, pronunciation guide,
  and an optional **AI tutor** (free conversation and writing correction with your own
  Anthropic API key — the key stays on your device).
- **Translator**: any pair of 97 languages, auto-detect, voice input, read-aloud (normal
  and slow), alternatives, history, save-to-phrasebook, and a two-person **conversation
  mode** where each speaker taps their own microphone.
- **Progress**: streak, XP, daily goal, 14-day chart, achievements, estimated CEFR level,
  several languages at once, backup/restore.

## How it works

No build step, no dependencies: vanilla ES modules, Web Speech API for speech synthesis
and recognition, `localStorage` for progress.

```
index.html  styles.css  sw.js  manifest.webmanifest  icons/
js/app.js          shell, routing, onboarding, home, course map
js/curriculum.js   merges the concept units, loads a language pack, builds auto courses
js/exercises.js    builds a practice session from a unit
js/lesson.js       exercise player (feedback, re-queueing mistakes, SRS updates)
js/unit.js         unit page: words · practice · dialogue · grammar · speak · write
js/review.js       spaced-repetition review + phrasebook
js/practice.js     practice hub (speaking, listening, reading, writing, grammar, sounds)
js/translator.js   translator + conversation mode
js/tutor.js        optional AI tutor (Claude API, bring your own key)
js/progress.js     progress & settings
js/speech.js       TTS / STT wrappers, answer grading, pronunciation similarity
js/translate.js    translation providers with fallback + cache + offline dictionary
js/srs.js  js/store.js  js/i18n.js  js/langs.js  js/grammar.js  js/ui.js
js/content/concepts-a.js   language-neutral curriculum, levels A1–A2 (English + Hebrew)
js/content/concepts-b.js   levels B1–C2
js/content/{es,pt,fr,it,de}.js   language packs (see tools/CONTENT-SPEC.md)
tools/validate.mjs         content validator:  node lingua/tools/validate.mjs es pt fr it de
```

### Languages

| Kind | Languages | What you get |
|---|---|---|
| ★ Full course | Spanish, Portuguese (Brazilian, with European notes), French, Italian, German | Hand-written translations of every item, grammar notes for all 41 units, 20+ conjugated verbs, pronunciation guide |
| ★ Native content | English, Hebrew | The curriculum's own text (no grammar notes / verb tables yet) |
| ⚙ Auto course | 90 more (Arabic, Russian, Japanese, Chinese, Korean, Turkish, …) | Every unit is translated on first open through the translator and cached on the device; grammar shows the unit's focus and example sentences |

Adding a full course = writing one pack file following `tools/CONTENT-SPEC.md` and adding
its code to `PACKS` in `js/langs.js` and to `sw.js`.

### Translation

Free, keyless providers are tried in order (Google's public web endpoint → MyMemory →
Lingva), results are cached, and the built-in course dictionary answers offline. In
Settings you can add a **DeepL** key or your own **LibreTranslate** server; those take
priority.

### Voice

- **Read-aloud** uses the voices installed on the device. Pick a specific voice in
  Settings. If a language has no voice: Android → install Google Text-to-speech voices;
  iOS → Settings → Accessibility → Spoken Content → Voices; Windows → Language settings.
- **Speech recognition** needs Chrome, Edge or Safari (Firefox has none). Pronunciation is
  scored by comparing what was recognised with the target sentence.

## Notes

- When you change app files, bump `CACHE` in `sw.js` so installed clients update.
- Content lives in plain JS object literals, so anyone can fix or extend it; run the
  validator before committing.
