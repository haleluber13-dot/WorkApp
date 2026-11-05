# Card content schema — מפת החיים (lifemap)

Each topic has ONE file: `lifemap/data/cards/<topicId>.js`. The file must be plain browser JS (no modules, no imports) and look exactly like:

```js
window.LIFEMAP_CARDS = window.LIFEMAP_CARDS || {};
window.LIFEMAP_CARDS["nature"] = [
  { ...card }, { ...card }, ...
];
```

## Card object

| field | required | notes |
|---|---|---|
| `type` | yes | one of `question`, `task`, `fact`, `game`, `experiment`, `story`, `talk` |
| `level` | yes | `easy` / `medium` / `hard` — RELATIVE to the age band |
| `ages` | yes | `[min, max]` inclusive. Use exactly one band: `[2,3]`, `[4,5]`, `[6,8]`, `[9,12]` |
| `title` | yes | 2–6 Hebrew words, catchy, no trailing period |
| `text` | yes | the card body in Hebrew, written TO THE CHILD (second person). For ages 2–5 the parent reads it aloud, so keep it 1–2 short sentences. For 6–12, 1–4 sentences. |
| `answer` | question only | the answer, plus one line of explanation when useful |
| `steps` | task/experiment/game | array of 2–6 short step strings, in order |
| `materials` | optional | array of household items needed (e.g. `"כוס"`, `"נייר"`). Only everyday things. |
| `tip` | yes | 1–2 sentences FOR THE PARENT: how to guide, what to watch for, how to extend. Hebrew. |
| `skills` | yes | array of 1–3 short Hebrew skill tags (e.g. `"ספירה"`, `"מוטוריקה עדינה"`, `"אמפתיה"`) |
| `minutes` | optional | rough duration in minutes (default 5) |

## Content rules

- Hebrew only (except proper nouns). Natural, warm, kid-friendly, no slang that dates.
- Gender-neutral phrasing where possible (e.g. "נסו", "אפשר", "בואו") — the app is used by boys and girls. Avoid "אתה"/"את" forms; prefer plural imperative "בואו נ..." or infinitive "לנסות".
- NO screens needed, NO purchases, NO internet. Everything doable at home or in the yard with everyday items.
- Safety: nothing with fire, knives, chemicals, or heights for toddlers. For 6–12, when a step needs an adult (stove, scissors) say so in `text` or `tip`.
- Secular, universal values (kindness, curiosity, honesty). No religious instruction, no politics.
- Variety: within each (band × level) mix at least 3 different `type`s. Toddler cards lean on `task`, `game`, `talk`; older cards include `question`, `experiment`, `fact`, `story`.
- Difficulty is real: `hard` for 9–12 should be genuinely challenging (multi-step reasoning, research-free open questions, longer projects). `easy` for 2–3 is a single action ("הצביעו על האף").
- Questions must have a real `answer`. Open "talk" cards should put 1–3 follow-up prompts in `steps`.
- Every card unique in wording; don't repeat the same activity across levels with trivial changes.
- No emoji inside `text`/`answer`/`tip` (the UI adds icons). Emoji in `title` is fine but optional.

## Quantity per topic

4 bands × 3 levels × **4 cards** = **48 cards per topic minimum**. More is welcome (up to 6 per cell).

## Validation

Run from the repo root:

```
node lifemap/tools/validate-cards.js
```

It checks every topic has ≥4 cards per (band × level), valid enums, required fields, and no duplicate titles.
