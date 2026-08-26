#!/data/data/com.termux/files/usr/bin/env python3
"""A personal assistant that runs in Termux, talks to Gemini, and can act.

    ai "what is on my plate today"      one question, one answer
    ai                                   a conversation that remembers
    ai --voice                           the answers are read out loud
    ai --mic --voice                     hands free: talk, listen
    ai "turn on the torch"               it can work the phone
    ai --doctor                          check what is broken on this phone
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gemini  # noqa: E402
import tools as tools_module  # noqa: E402
import voice as voice_module  # noqa: E402

HOME = os.path.expanduser("~/.personal-ai")
HISTORY_FILE = os.path.join(HOME, "history.json")
SYSTEM_FILE = os.path.join(HOME, "system.txt")
MODEL_FILE = os.path.join(HOME, "model")
PERSONA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "personas")

# Said out loud, these end the conversation.
STOP_WORDS = (
    "stop", "goodbye", "good bye", "that is all", "that's all", "thank you that is all",
    "די", "תפסיק", "מספיק", "להתראות", "זהו",
)

DEFAULT_SYSTEM = (
    "You are a personal assistant running on a phone, in a terminal. "
    "You can work the phone yourself through the tools you were given — "
    "use them instead of explaining how the user could do it. Look a "
    "person up with find_contact before texting or calling them by name, "
    "and check current_time before doing anything with clocks. "
    "Answer in the language the question was asked in. Be brief: a couple "
    "of sentences unless more is genuinely needed, because the answer may "
    "be read out loud. No markdown formatting, no bullet symbols, no "
    "asterisks — plain sentences only."
)

# Enough context to be useful, small enough to stay fast and cheap.
MAX_TURNS = 20

# How many times the model may act before answering, per question. This
# stops a confused model from working the phone in circles.
MAX_TOOL_STEPS = 6


def load_history():
    try:
        with open(HISTORY_FILE, encoding="utf-8") as handle:
            saved = json.load(handle)
    except (OSError, ValueError):
        return []
    history = []
    for turn in saved:
        role, text = turn.get("role"), turn.get("text")
        if role in ("user", "model") and isinstance(text, str):
            history.append((role, text))
    return history[-MAX_TURNS * 2:]


def save_history(history):
    os.makedirs(HOME, exist_ok=True)
    trimmed = history[-MAX_TURNS * 2:]
    with open(HISTORY_FILE, "w", encoding="utf-8") as handle:
        json.dump(
            [{"role": role, "text": text} for role, text in trimmed],
            handle,
            ensure_ascii=False,
            indent=1,
        )


def load_model():
    """The model chosen last time, if there was one."""
    try:
        with open(MODEL_FILE, encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def save_model(name):
    os.makedirs(HOME, exist_ok=True)
    with open(MODEL_FILE, "w", encoding="utf-8") as handle:
        handle.write(name + "\n")


def repair_model(args):
    """Called when the key does not serve the model we asked for.

    Keys differ by account and by region, so rather than making someone
    read a list and pick, find one that works and remember it.
    """
    models = gemini.list_models()
    choice = gemini.choose_model(models)
    if not choice:
        raise gemini.GeminiError(
            "This key cannot run any chat model. It may be an API key for a "
            "different Google service. Make a new one at "
            "https://aistudio.google.com/apikey"
        )
    print(f"[{args.model} is not available to your key — using {choice} instead]",
          file=sys.stderr)
    args.model = choice
    save_model(choice)
    return choice


def load_system(persona=None):
    """The instructions the model works under.

    A persona shipped with the project, then whatever the user wrote in
    ~/.personal-ai/system.txt, then the plain default.
    """
    if persona:
        path = os.path.join(PERSONA_DIR, f"{persona}.txt")
        try:
            with open(path, encoding="utf-8") as handle:
                return handle.read().strip()
        except OSError:
            print(f"[no persona called '{persona}' — using the default]", file=sys.stderr)
    try:
        with open(SYSTEM_FILE, encoding="utf-8") as handle:
            written = handle.read().strip()
        if written:
            return written
    except OSError:
        pass
    return DEFAULT_SYSTEM


def answer(args, history, prompt, allowed, ask=None, report=None):
    """Get an answer, letting the model work the phone on the way.

    Returns (text, actions) where actions is what it actually did.
    """
    contents = gemini.build_contents(list(history), prompt)
    declarations = tools_module.declarations(allowed) if allowed else None
    actions = []

    for _ in range(MAX_TOOL_STEPS):
        response = gemini.raw_turn(
            contents,
            system=load_system(getattr(args, "persona", None)),
            tools=declarations,
            model=args.model,
            timeout=args.timeout,
            max_tokens=args.max_tokens,
        )
        text, calls = gemini.split_parts(response)

        if not calls:
            if not text:
                return gemini.extract_text(response), actions
            return text, actions

        # Keep the model's own turn in the transcript exactly as it came
        # back, or the function results it gets next will not line up.
        contents.append(response["candidates"][0]["content"])

        results = []
        for call in calls:
            if report:
                report(tools_module.describe_call(call["name"], call["args"]))
            result = tools_module.execute(call["name"], call["args"], allowed, ask=ask)
            actions.append((call["name"], result))
            results.append(
                {
                    "functionResponse": {
                        "name": call["name"],
                        "response": {"result": result},
                    }
                }
            )
        contents.append({"role": "user", "parts": results})

    return (
        "That took too many steps, so I stopped. Try asking for one thing at a time.",
        actions,
    )


def make_asker(args, speaker):
    """Return the function that approves risky actions, or None for always-yes."""
    if args.yes:
        return None

    def ask(description):
        question = f"Do it?  {description}"
        print(f"\n  {question} [y/N] ", end="", flush=True)
        speaker.speak("May I " + description.split("(")[0].replace("_", " ") + "?")
        try:
            reply = input().strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return False
        return reply in ("y", "yes", "כן", "ok")

    return ask


def doctor(args):
    """Say plainly which of the moving parts work and which do not."""
    print("Checking the phone\n")
    for label, ok, detail in voice_module.check():
        mark = "ok  " if ok else "BAD "
        print(f"  [{mark}] {label}")
        if detail and not ok:
            print("         " + detail.replace("\n", "\n         "))

    print("\nChecking the Gemini key\n")
    try:
        models = gemini.list_models()
    except gemini.GeminiError as error:
        print("  [BAD ] key")
        print("         " + str(error).replace("\n", "\n         "))
        return 1
    print(f"  [ok  ] key works, {len(models)} models available")
    preferred = [name for name in models if name.startswith(("gemini-2", "gemini-3"))]
    for name in (preferred or models)[:8]:
        print(f"         {name}")
    if args.model not in models:
        choice = gemini.choose_model(models)
        if choice:
            save_model(choice)
            print(f"\n  '{args.model}' is not available to this key — switched to {choice}.")
        else:
            print(f"\n  '{args.model}' is not available, and no chat model is.")
    print(f"\n  [ok  ] {len(tools_module.available(args.allow_shell))} actions available")
    return 0


def run_once(args, speaker, prompt, history):
    allowed = [] if args.no_tools else tools_module.available(args.allow_shell)
    ask = make_asker(args, speaker)
    report = (lambda line: print(f"  · {line}")) if not args.quiet else None
    try:
        return answer(args, history, prompt, allowed, ask=ask, report=report)
    except gemini.GeminiError as error:
        if error.kind != "model_missing":
            raise
        repair_model(args)
        return answer(args, history, prompt, allowed, ask=ask, report=report)


def one_shot(args, speaker):
    prompt = " ".join(args.prompt).strip()
    history = [] if args.no_memory else load_history()
    text, _ = run_once(args, speaker, prompt, history)
    print(text)
    speaker.speak(text)
    speaker.warn_once(sys.stderr)
    if not args.no_memory:
        save_history(history + [("user", prompt), ("model", text)])
    return 0


def is_goodbye(said):
    """True when the words spoken mean 'we are done'."""
    cleaned = said.strip().lower().rstrip(".!?")
    return cleaned in STOP_WORDS


def converse(args, speaker):
    history = [] if args.no_memory else load_history()
    if args.mic:
        print("Listening. Say 'stop' when you are done.\n")
        # Android suspends background work aggressively; without this the
        # loop dies quietly a few minutes in.
        voice_module.termux.run(["termux-wake-lock"], 10)
        speaker.speak("At your service.")
    else:
        print("Personal assistant. /help for commands, /quit to leave.\n")
    if history:
        print(f"(carrying {len(history) // 2} earlier exchanges)\n")

    silence = 0
    while True:
        if args.mic:
            print("listening...", end=" ", flush=True)
            prompt = speaker.listen(timeout=args.listen_timeout)
            print(prompt or "(nothing heard)")
            if not prompt:
                speaker.warn_once(sys.stderr)
                if not voice_module.termux.have(voice_module.LISTEN_CMD):
                    return 1
                silence += 1
                # Three silences in a row means the microphone is not
                # working, not that there is nothing to say.
                if silence >= 3:
                    print("Nothing heard three times over. Stopping.")
                    speaker.speak("I will be here when you need me.")
                    break
                continue
            silence = 0
            if is_goodbye(prompt):
                speaker.speak("Very good.")
                break
        else:
            try:
                prompt = input("you> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not prompt:
                continue

        if prompt.startswith("/"):
            if handle_command(args, speaker, prompt) is False:
                break
            if prompt.split()[0].lower() == "/reset":
                history = []
            continue

        try:
            text, _ = run_once(args, speaker, prompt, history)
        except gemini.GeminiError as error:
            print(f"\n{error}\n", file=sys.stderr)
            continue

        print(f"\n{text}\n")
        speaker.speak(text)
        speaker.warn_once(sys.stderr)
        history = history + [("user", prompt), ("model", text)]
        if not args.no_memory:
            save_history(history)

    if args.mic:
        voice_module.termux.run(["termux-wake-unlock"], 10)
    return 0


def handle_command(args, speaker, line):
    """Run a /command. Returns False when it is time to leave."""
    command, _, rest = line.partition(" ")
    command = command.lower()
    rest = rest.strip()

    if command in ("/quit", "/exit", "/q"):
        return False
    if command == "/reset":
        save_history([])
        print("Memory cleared.\n")
    elif command == "/voice":
        speaker.enabled = rest.lower() != "off"
        print(f"Voice {'on' if speaker.enabled else 'off'}.\n")
    elif command == "/model":
        if rest:
            args.model = rest
        print(f"Model: {args.model}\n")
    elif command == "/tools":
        for tool in tools_module.available(args.allow_shell):
            mark = "!" if tool.confirm else " "
            print(f" {mark} {tool.name:<16} {tool.description}")
        print("\n ! = asks before doing it\n")
    elif command == "/help":
        print(
            "  /tools        what it can do to the phone\n"
            "  /reset        forget the conversation\n"
            "  /voice off    stop reading answers out loud\n"
            "  /model NAME   switch model\n"
            "  /quit         leave\n"
        )
    else:
        print(f"Unknown command: {command}. Try /help.\n")
    return True


def apply_jarvis(args):
    """One flag for the whole thing: his voice, his manner, no keyboard.

    Anything the user set explicitly is left alone.
    """
    args.mic = True
    args.voice = True
    args.persona = args.persona or "jarvis"
    args.pitch = 0.8 if args.pitch is None else args.pitch    # deeper
    args.rate = 0.95 if args.rate is None else args.rate      # unhurried
    return args


def build_parser():
    parser = argparse.ArgumentParser(
        prog="ai",
        description="A personal assistant for Termux, powered by Gemini.",
    )
    parser.add_argument("prompt", nargs="*", help="ask one question and exit")
    parser.add_argument(
        "--model",
        default=os.environ.get("GEMINI_MODEL") or load_model() or gemini.DEFAULT_MODEL,
    )
    parser.add_argument("--voice", action="store_true", help="read answers out loud")
    parser.add_argument("--mic", action="store_true", help="take questions from the microphone")
    parser.add_argument("--lang", default=os.environ.get("AI_TTS_LANG"), help="TTS language, e.g. he-IL")
    parser.add_argument("--jarvis", action="store_true",
                        help="hands free: he listens, answers out loud, and keeps listening")
    parser.add_argument("--persona", default=None, help="a personality from personas/, e.g. jarvis")
    parser.add_argument("--pitch", type=float, default=None, help="voice pitch; below 1.0 is deeper")
    parser.add_argument("--rate", type=float, default=None, help="speaking rate; below 1.0 is slower")
    parser.add_argument("--no-tools", action="store_true", help="answer only, never touch the phone")
    parser.add_argument("--allow-shell", action="store_true", help="let it run shell commands (asks first)")
    parser.add_argument("--yes", action="store_true", help="do not ask before risky actions")
    parser.add_argument("--quiet", action="store_true", help="do not print what it is doing")
    parser.add_argument("--no-memory", action="store_true", help="do not read or write history")
    parser.add_argument("--timeout", type=int, default=60, help="seconds to wait for Gemini")
    parser.add_argument("--speak-timeout", type=int, default=25, help="seconds to wait for the phone to speak")
    parser.add_argument("--listen-timeout", type=int, default=60, help="seconds to wait for the microphone")
    parser.add_argument("--max-tokens", type=int, default=None)
    parser.add_argument("--models", action="store_true", help="list the models this key can use")
    parser.add_argument("--tools", action="store_true", help="list what it can do to the phone")
    parser.add_argument("--doctor", action="store_true", help="check the setup and say what is broken")
    parser.add_argument("--reset", action="store_true", help="forget the conversation and exit")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)

    if args.reset:
        save_history([])
        print("Memory cleared.")
        return 0

    if args.jarvis:
        apply_jarvis(args)

    if args.tools:
        for tool in tools_module.available(args.allow_shell):
            mark = "!" if tool.confirm else " "
            print(f" {mark} {tool.name:<16} {tool.description}")
        print("\n ! = asks before doing it")
        return 0

    if args.doctor:
        return doctor(args)

    try:
        if args.models:
            for name in gemini.list_models():
                print(name)
            return 0

        speaker = voice_module.Voice(
            lang=args.lang,
            timeout=args.speak_timeout,
            enabled=args.voice or args.mic,
            pitch=args.pitch,
            rate=args.rate,
        )
        if args.prompt:
            return one_shot(args, speaker)
        return converse(args, speaker)
    except gemini.GeminiError as error:
        print(f"\n{error}\n", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print()
        return 130


if __name__ == "__main__":
    sys.exit(main())
