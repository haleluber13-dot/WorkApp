# Personal assistant for Termux

A voice assistant that runs on the phone and can **work the phone**: Gemini
for the thinking, Termux for the hands and the voice. No pip packages, no
server in the middle.

Say "text Dani that I'm running late" and it finds the number, asks you
once, and sends it.

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

Then `bash doctor.sh` will tell you what is still wrong, and every script
here uses a timeout, so nothing in this project can ever hang your terminal
again.

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
| private | `location` ! |
| power | `run_shell` ! (only with `--allow-shell`) |

**!** = it asks you first, every time, and shows you exactly what it is
about to do. Nothing that costs money, reaches another person or reads your
location happens without a `y`. `--yes` turns the asking off; `--no-tools`
takes the hands away entirely.

```sh
ai "turn on the flashlight"
ai "wake me at 6:30 for the shoot"
ai "how much battery do I have left"
ai "text Dani that I am running twenty minutes late"
ai --tools                        # the full list
```

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
| `tools.py` | the actions it can take, and which ones must be confirmed |
| `termux.py` | one place where termux-api commands are run, always with a timeout |
| `bin/ai`, `bin/say`, `bin/listen` | what lands on your PATH |
| `doctor.sh` | diagnoses the phone, end to end |
| `setup.sh` | one-time install |
| `install.sh` | the one-line bootstrap: packages, clone, setup |
| `tests/` | 37 tests, no phone or network needed |

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

* A wake word — you still start it yourself.
* Calendar and email; both need OAuth, which is a bigger piece of work.
* Anything that survives the phone rebooting: no background service yet.
* A native APK. See above.
