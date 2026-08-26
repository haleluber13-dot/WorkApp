# Personal assistant for Termux

A voice assistant that runs on the phone and can **work the phone**: Gemini
for the thinking, Termux for the hands and the voice. No pip packages, no
server in the middle.

Say "text Dani that I'm running late" and it finds the number, asks you
once, and sends it.

```sh
ai --jarvis
```

One flag: he listens, answers out loud in a lower voice, does what you
asked, and keeps listening until you say stop.

---

## מהיר בעברית

הפקודה `termux-tts-speak` נתקעת בלי להחזיר כלום? זה כמעט תמיד אותו דבר:
חבילת `termux-api` מותקנת, אבל **אפליקציית Termux:API** לא. שתיהן נחוצות,
והן חייבות להיות מאותו מקור (או שתיהן מ־F-Droid, או שתיהן מ־GitHub).

```sh
pm list packages | grep termux      # מחפשים את com.termux.api ברשימה
```

אם `com.termux.api` לא מופיע — זו הבעיה. מתקינים את האפליקציה, פותחים
אותה פעם אחת, ואז:

שורה אחת, מדביקים בטרמוקס:

```sh
curl -fsSL https://raw.githubusercontent.com/haleluber13-dot/WorkApp/claude/personal-ai-history-fg11ay/assistant/install.sh | bash
```

> להדביק **שורה אחת בכל פעם**. בלוק של כמה שורות עם הערות `#` נדבק בטרמוקס
> לשורה אחת ארוכה ושובר את הפקודה הבאה.

לתשובות בעברית: `ai --lang he-IL --voice "..."`

---

## The hang, and why it happens

`termux-tts-speak "test"` that sits there until you press Ctrl+C is not a
broken TTS engine. It is Android refusing to connect two apps:

| What | Provides | Installed with |
|---|---|---|
| `termux-api` **package** | the `termux-*` commands | `pkg install termux-api` |
| Termux:API **app** | the service that does the work | F-Droid / GitHub, like any app |

With the commands but not the app, every `termux-*` call blocks forever
with no error at all. Same thing if the two were installed from different
sources — Play Store and F-Droid builds are signed with different keys and
Android will not let them talk.

Check it in one line:

```sh
bash ~/WorkApp/assistant/doctor.sh
```

Step 2 asks the phone something harmless and waits eight seconds for an
answer. No answer means the app is not reachable. If it is missing:

> Do not try to check this with `pm list packages` — on Android 11 and
> newer, Android hides other apps from Termux and the list comes back
> empty whether or not the app is installed.

1. Install Termux:API from the **same place you installed Termux**
   (F-Droid: <https://f-droid.org/packages/com.termux.api/>).
2. Open it once, so Android registers it.
3. Settings → Apps → Termux:API → Battery → **Unrestricted**
   (Android freezes background services otherwise).

`doctor.sh` prints a line per capability — volume, clipboard, contacts,
messages, notifications, camera, speech — saying which the phone allows and
which it blocks, then lists the exact settings screens for the blocked ones.
Permissions, notification access and text-to-speech live in three different
places on Android, and it names all three.

A command that has already gone silent is not waited on again in the same
run, and once the app itself is shown to be unreachable every other call
fails instantly — otherwise one spoken question that touches three tools
costs a minute of nothing.

When a command does time out, the assistant works out what that means
rather than guessing: it asks the phone something that needs no permission
at all, and if *that* answers, the app is fine and the silence belongs to
that one feature — a missing speech engine, a microphone permission — which
is what it then tells you.

> `pkill -f com.termux.api` kills the very service you need. Don't.

## What it can do to the phone

This is the part that makes it an assistant instead of a chat window. The
model is given a list of actions and decides on its own when to use them.

| | Action |
|---|---|
| clock | `current_time`, `set_alarm`, `set_timer` |
| phone | `battery`, `wifi`, `volume`, `brightness`, `torch`, `vibrate` |
| screen | `notification`, `toast`, `open_url` |
| text | `clipboard_read`, `clipboard_write` |
| people | `find_contact`, `send_sms` !, `call` !, `whatsapp` ! |
| apps | `play_music`, `navigate`, `open_app`, `search_web`, `open_url` |
| inbox | `read_notifications` !, `read_messages` ! |
| private | `location` ! |
| power | `run_shell` ! (only with `--allow-shell`) |

**!** = it asks you first, every time, and shows you exactly what it is
about to do. Nothing that costs money, reaches another person or reads your
location happens without a `y`. `--yes` turns the asking off; `--no-tools`
takes the hands away entirely.

```sh
ai "turn on the flashlight"
ai "wake me at 6:30 for the shoot"
ai "play some miles davis"
ai "navigate to Tel Aviv port"
ai "text Dani that I am running twenty minutes late"
ai "read me my notifications"
ai --tools                        # the full list
```

Music goes through Android's own "play this" intent, which Spotify,
YouTube Music and the stock players all answer — so it plays in whatever
you actually use. If nothing answers, it opens Spotify on the search.
Navigation opens Waze by default, Google Maps if you ask for it. Apps open
through deep links, so no special permission is involved.

`run_shell` is the whole phone in one tool — it is hidden unless you pass
`--allow-shell`, and it still asks before every command.

Two guards keep a confused model from running away with the phone: at most
six actions per question, and a hidden tool cannot be called even if the
model asks for it by name.


## Install

One line, pasted into Termux:

```sh
curl -fsSL https://raw.githubusercontent.com/haleluber13-dot/WorkApp/claude/personal-ai-history-fg11ay/assistant/install.sh | bash
```

It installs the packages, clones this repo to `~/WorkApp`, asks for your
Gemini API key, links `ai`, `say` and `listen` onto your PATH, and runs the
checks. Run it again any time to update.

Paste **one line at a time**. A multi-line block with `#` comments arrives
in Termux as a single glued-together line and eats the command after it.

The key lives in `~/.personal-ai/key`, mode 600. `GEMINI_API_KEY` in the
environment overrides it. Get one free at <https://aistudio.google.com/apikey>.

## Use it

```sh
ai "how long does rice take"        one question, one answer
ai                                   a conversation that remembers
ai --voice                           answers read out loud
ai --mic --voice                     hands free — talk to it, it talks back
ai --lang he-IL --voice "שלום"       speak Hebrew
ai --tools                           everything it can do to the phone
ai --models                          what your key can actually run
ai --doctor                          check the setup
ai --reset                           forget the conversation
```

Inside a conversation: `/tools`, `/reset`, `/voice off`, `/model NAME`, `/quit`.

The last 20 exchanges are kept in `~/.personal-ai/history.json`, so it
remembers across sessions. `--no-memory` skips that entirely.

Two standalone tools come with it:

```sh
say "the rice is done"               speak, with a timeout
echo "from a pipe" | say
listen                               print what the microphone hears
```

## Talking to him

```sh
ai --jarvis
```

He greets you, listens, answers out loud, and listens again — no keyboard,
no pressing anything between questions. Say **stop** (or *די*), or press
**ctrl-c**, to end it.

If the microphone does not answer, he says so once and hands you the
keyboard rather than retrying — a broken mic is broken, and waiting on it
twenty times over is just a hang with extra steps. Type `/quit` to leave
from there.

### Two ways to hear

`termux-speech-to-text` is a wrapper around Android's own recogniser, and
many phones — Samsung's especially — do not have one. So there is a second
way: record a few seconds and let Gemini listen to the audio. Better with
Hebrew than the Android recogniser, nothing extra to install, and it uses
the key you already have.

It picks for itself. Android first; the moment that turns out not to work,
it says so once and records from then on. Pin it if you want to:

```sh
ai --jarvis --ears gemini        # always record and send
ai --jarvis --ears android       # only the phone's recogniser
ai --jarvis --record-seconds 12  # allow longer sentences
```

Test hearing on its own:

```sh
listen              # whichever way works
listen --record     # the recording path specifically
```

Nothing captured means the Microphone permission: Settings → Apps →
Termux:API → Permissions → Microphone. It is granted separately from the
others, so contacts and SMS working tells you nothing about it.
`doctor.sh` records three seconds and tells you whether anything arrived.

A refused permission does not come back as an error — the app waits for a
dialog that a background service may not show, and that wait can jam the
whole Termux:API service, making the next command look broken too. If
everything starts hanging at once: Settings → Apps → Termux:API → Force
stop, then try again.

Typing works either way.

The voice is the phone's own text-to-speech, pitched down and slowed
slightly, which is most of what makes it sound like him:

```sh
ai --jarvis --pitch 0.7 --rate 0.9      # deeper, slower
ai --voice --pitch 1.2 "hello"          # or don't
```

For a better voice than the stock one, install a neural TTS engine from
the Play Store (Google's own, or Acapela / RHVoice for other languages) and
pick it in Settings → Accessibility → Text-to-speech. Everything here uses
whatever engine the phone is set to.

The manner comes from `personas/jarvis.txt` — calm, short, dry, no
enthusiasm, addresses you as sir now and then. It is a plain text file:
edit it, or write your own next to it and use `--persona yourname`.

A wake lock is taken while he is listening, because Android otherwise
freezes the loop after a few minutes.

## Which model it uses

Model availability differs by key and by region, so the default is a
starting guess, not a promise. The first time the API says a model does not
exist, the assistant lists what your key really has, picks the best chat
model on it, remembers that in `~/.personal-ai/model`, and carries on with
the question you asked. You do not have to do anything.

To choose yourself: `ai --models` to see the list, then `ai --model NAME`
for one question, or write the name into `~/.personal-ai/model` to keep it.
`GEMINI_MODEL` in the environment overrides both.

## Make it yours

Write `~/.personal-ai/system.txt` and that becomes its personality and
standing instructions:

```sh
cat > ~/.personal-ai/system.txt <<'PROMPT'
You are my assistant. I work in film production in Israel.
Answer in Hebrew unless I write in English. Keep it short.
PROMPT
```

## Layout

| File | What it is |
|---|---|
| `assistant.py` | the CLI: conversation, memory, flags |
| `gemini.py` | Gemini REST client, standard library only |
| `voice.py` | speech in and out, every call bounded by a timeout |
| `ears.py` | hearing without Google: record, then let Gemini listen |
| `tools.py` | the actions it can take, and which ones must be confirmed |
| `termux.py` | one place where termux-api commands are run, always with a timeout |
| `bin/ai`, `bin/say`, `bin/listen` | what lands on your PATH |
| `doctor.sh` | diagnoses the phone, end to end |
| `setup.sh` | one-time install |
| `install.sh` | the one-line bootstrap: packages, clone, setup |
| `personas/` | how he speaks — plain text, edit freely |
| `tests/` | 77 tests, no phone or network needed |

## Tests

```sh
cd ~/WorkApp/assistant && python3 -m unittest discover -s tests
```

They cover the retry policy, every error message, history handling, the
tool loop, the confirmation rules, and the timeout that stops a missing
Termux:API app from hanging the assistant.
The Termux calls themselves are stubbed — those you test by running
`ai --doctor` on the phone.

## About the APK

The natural question is "can you just send me an installable app". Not yet,
and the reason is worth knowing.

An APK has to carry its own microphone, speech, contacts and SMS code, and
every one of those needs a permission the Play Store reviews. That is a real
Android project — the kind of thing that takes days, not an afternoon — and
you cannot change it without rebuilding and reinstalling.

What you are running now does all of it today, through Termux:API, and you
can change its behaviour by editing one file on the phone. Start here, use
it for a week, find out which ten things you actually ask it. Then the APK
is worth building, because you will know what to put in it — and this code
becomes its specification.


## What is not here yet

* A wake word. You start him with `ai --jarvis`; he does not wake on his
  own name yet. That needs an always-on listener, which costs battery and
  needs care.
* Calendar and email; both need OAuth, which is a bigger piece of work.
* Hearing you while he is still speaking — a turn is recorded for a fixed
  few seconds, so you wait for him to finish.
* Anything that survives the phone rebooting: no background service yet.
* A native APK. See above.
