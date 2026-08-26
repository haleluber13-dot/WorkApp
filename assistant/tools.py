"""The things the assistant can actually do to the phone.

Each tool is a name Gemini may call, a description it reads to decide when
to call it, and a function that runs a termux-api command. Tools that cost
money, touch a person, or read private data are marked `confirm=True` and
are never run without a yes.
"""

import datetime
import json
import shlex
import urllib.parse

import termux


class Tool:
    def __init__(self, name, description, run, properties=None, required=(), confirm=False):
        self.name = name
        self.description = description
        self.run = run
        self.properties = properties or {}
        self.required = list(required)
        self.confirm = confirm

    def declaration(self):
        """The shape Gemini needs in order to call this."""
        declared = {"name": self.name, "description": self.description}
        if self.properties:
            declared["parameters"] = {
                "type": "object",
                "properties": self.properties,
                "required": self.required,
            }
        return declared


def _simple(command, success, timeout=20):
    """A tool body that runs one command and reports plainly."""
    ok, output, problem = termux.run(command, timeout)
    if not ok:
        return f"failed: {problem}"
    return output or success


# --- what time is it -------------------------------------------------------
# Answered locally: the model has no clock, and this is the question people
# ask a phone assistant most.

def _now(**_):
    now = datetime.datetime.now().astimezone()
    return now.strftime("%A %d %B %Y, %H:%M (%Z)")


# --- the phone itself ------------------------------------------------------

def _battery(**_):
    ok, output, problem = termux.run(["termux-battery-status"], 15)
    if not ok:
        return f"failed: {problem}"
    try:
        data = json.loads(output)
    except ValueError:
        return output
    return (
        f"{data.get('percentage')}%, {str(data.get('status', '')).lower()}, "
        f"{data.get('temperature', 0):.0f}C"
    )


def _torch(on=True, **_):
    state = "on" if on else "off"
    return _simple(["termux-torch", state], f"torch {state}")


def _vibrate(milliseconds=500, **_):
    return _simple(
        ["termux-vibrate", "-d", str(int(milliseconds)), "-f"], "vibrated"
    )


def _notify(title="", message="", **_):
    return _simple(
        ["termux-notification", "--title", title or "Assistant", "--content", message],
        "notification shown",
    )


def _toast(message="", **_):
    return _simple(["termux-toast", message], "shown")


def _volume(stream="music", level=None, **_):
    if level is None:
        ok, output, problem = termux.run(["termux-volume"], 15)
        return output if ok else f"failed: {problem}"
    return _simple(
        ["termux-volume", stream, str(int(level))], f"{stream} volume set to {level}"
    )


def _brightness(level=128, **_):
    return _simple(["termux-brightness", str(int(level))], f"brightness {level}")


def _wifi(**_):
    ok, output, problem = termux.run(["termux-wifi-connectioninfo"], 15)
    if not ok:
        return f"failed: {problem}"
    try:
        data = json.loads(output)
    except ValueError:
        return output
    return f"{data.get('ssid', 'unknown')} ({data.get('ip', 'no ip')})"


def _clipboard_get(**_):
    ok, output, problem = termux.run(["termux-clipboard-get"], 15)
    return output if ok else f"failed: {problem}"


def _clipboard_set(text="", **_):
    ok, _, problem = termux.run(["termux-clipboard-set", text], 15)
    return "copied" if ok else f"failed: {problem}"


# --- reaching people -------------------------------------------------------

def _contacts(query="", **_):
    ok, output, problem = termux.run(["termux-contact-list"], 25)
    if not ok:
        return f"failed: {problem}"
    try:
        people = json.loads(output)
    except ValueError:
        return output
    needle = query.strip().lower()
    if needle:
        people = [
            person for person in people
            if needle in str(person.get("name", "")).lower()
        ]
    if not people:
        return f"no contact matching '{query}'"
    return "\n".join(
        f"{person.get('name')}: {person.get('number')}" for person in people[:10]
    )


def _sms(number="", message="", **_):
    return _simple(
        ["termux-sms-send", "-n", number, message], f"sent to {number}", timeout=30
    )


def _call(number="", **_):
    return _simple(["termux-telephony-call", number], f"calling {number}")


def _whatsapp(number="", message="", **_):
    digits = "".join(character for character in number if character.isdigit())
    url = f"https://wa.me/{digits}"
    if message:
        url += "?text=" + urllib.parse.quote(message)
    return _simple(["termux-open-url", url], "WhatsApp opened")


def _open_url(url="", **_):
    return _simple(["termux-open-url", url], f"opened {url}")


# --- clocks ----------------------------------------------------------------

def _alarm(hour=7, minute=0, message="", **_):
    command = [
        "am", "start", "-a", "android.intent.action.SET_ALARM",
        "--ei", "android.intent.extra.alarm.HOUR", str(int(hour)),
        "--ei", "android.intent.extra.alarm.MINUTES", str(int(minute)),
        "--ez", "android.intent.extra.alarm.SKIP_UI", "true",
    ]
    if message:
        command += ["--es", "android.intent.extra.alarm.MESSAGE", message]
    ok, _, problem = termux.run(command, 20)
    if not ok:
        return f"failed: {problem} (needs `pkg install termux-am`)"
    return f"alarm set for {int(hour):02d}:{int(minute):02d}"


def _timer(seconds=60, message="", **_):
    command = [
        "am", "start", "-a", "android.intent.action.SET_TIMER",
        "--ei", "android.intent.extra.alarm.LENGTH", str(int(seconds)),
        "--ez", "android.intent.extra.alarm.SKIP_UI", "true",
    ]
    if message:
        command += ["--es", "android.intent.extra.alarm.MESSAGE", message]
    ok, _, problem = termux.run(command, 20)
    if not ok:
        return f"failed: {problem} (needs `pkg install termux-am`)"
    return f"timer set for {int(seconds)} seconds"


# --- private things --------------------------------------------------------

def _location(**_):
    ok, output, problem = termux.run(["termux-location", "-p", "network"], 45)
    if not ok:
        return f"failed: {problem}"
    try:
        data = json.loads(output)
    except ValueError:
        return output
    return f"{data.get('latitude')}, {data.get('longitude')} (±{data.get('accuracy')}m)"


def _shell(command="", **_):
    ok, output, problem = termux.run(["sh", "-c", command], 60)
    if not ok:
        return f"failed: {problem}"
    return output[:2000] or "done (no output)"


ALL = [
    Tool("current_time", "The date and time right now, on this phone.", _now),
    Tool(
        "battery", "Battery percentage, charging state and temperature.", _battery
    ),
    Tool(
        "torch", "Turn the phone's flashlight on or off.", _torch,
        {"on": {"type": "boolean", "description": "true for on, false for off"}},
        ["on"],
    ),
    Tool(
        "vibrate", "Vibrate the phone.", _vibrate,
        {"milliseconds": {"type": "number", "description": "how long to buzz"}},
    ),
    Tool(
        "notification", "Put a notification in the phone's notification shade.",
        _notify,
        {
            "title": {"type": "string"},
            "message": {"type": "string"},
        },
        ["message"],
    ),
    Tool(
        "toast", "Flash a short message on screen.", _toast,
        {"message": {"type": "string"}}, ["message"],
    ),
    Tool(
        "volume",
        "Read the volumes, or set one. Streams: music, call, notification, "
        "ring, system, alarm.",
        _volume,
        {
            "stream": {"type": "string"},
            "level": {"type": "number", "description": "leave empty to just read"},
        },
    ),
    Tool(
        "brightness", "Set screen brightness, 0 to 255.", _brightness,
        {"level": {"type": "number"}}, ["level"],
    ),
    Tool("wifi", "Which wifi network the phone is on.", _wifi),
    Tool("clipboard_read", "Read what is on the clipboard.", _clipboard_get),
    Tool(
        "clipboard_write", "Put text on the clipboard.", _clipboard_set,
        {"text": {"type": "string"}}, ["text"],
    ),
    Tool(
        "find_contact",
        "Look up a phone number by name. Use this before calling or texting "
        "anyone by name.",
        _contacts,
        {"query": {"type": "string", "description": "part of the person's name"}},
        ["query"],
    ),
    Tool(
        "send_sms", "Send a text message.", _sms,
        {
            "number": {"type": "string"},
            "message": {"type": "string"},
        },
        ["number", "message"],
        confirm=True,
    ),
    Tool(
        "call", "Start a phone call.", _call,
        {"number": {"type": "string"}}, ["number"], confirm=True,
    ),
    Tool(
        "whatsapp",
        "Open WhatsApp on a chat with a number, with the message ready to send.",
        _whatsapp,
        {
            "number": {"type": "string", "description": "with country code"},
            "message": {"type": "string"},
        },
        ["number"],
        confirm=True,
    ),
    Tool(
        "open_url", "Open a web page or a deep link on the phone.", _open_url,
        {"url": {"type": "string"}}, ["url"],
    ),
    Tool(
        "set_alarm", "Set an alarm in the phone's clock app.", _alarm,
        {
            "hour": {"type": "number", "description": "24 hour clock"},
            "minute": {"type": "number"},
            "message": {"type": "string", "description": "label for the alarm"},
        },
        ["hour", "minute"],
    ),
    Tool(
        "set_timer", "Start a countdown timer.", _timer,
        {
            "seconds": {"type": "number"},
            "message": {"type": "string"},
        },
        ["seconds"],
    ),
    Tool(
        "location", "Where the phone is right now.", _location, confirm=True
    ),
    Tool(
        "run_shell",
        "Run a shell command in Termux and return its output. Only available "
        "when the assistant was started with --allow-shell.",
        _shell,
        {"command": {"type": "string"}},
        ["command"],
        confirm=True,
    ),
]

BY_NAME = {tool.name: tool for tool in ALL}
UNSAFE = {"run_shell"}


def available(allow_shell=False):
    """The tools this run is allowed to use."""
    return [tool for tool in ALL if allow_shell or tool.name not in UNSAFE]


def declarations(tools):
    return [{"functionDeclarations": [tool.declaration() for tool in tools]}]


def describe_call(name, args):
    """A one-line, readable version of what is about to happen."""
    if not args:
        return name
    shown = ", ".join(f"{key}={shlex.quote(str(value))}" for key, value in args.items())
    return f"{name}({shown})"


def execute(name, args, allowed, ask=None):
    """Run one tool call. `ask` decides on anything marked confirm."""
    tool = BY_NAME.get(name)
    if tool is None or tool not in allowed:
        return f"'{name}' is not a tool this assistant has."
    if tool.confirm and ask is not None and not ask(describe_call(name, args)):
        return "The user said no. Do not try this again; ask what they want instead."
    try:
        return tool.run(**(args or {}))
    except TypeError as error:
        return f"wrong arguments for {name}: {error}"
    except Exception as error:  # noqa: BLE001 - a tool must never kill the loop
        return f"{name} raised: {error}"
