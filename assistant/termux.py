"""Running termux-api commands safely.

Two rules hold for every call in this project:

* stdin is closed, so a command can never sit waiting for input;
* a timeout is always set, because a phone without the Termux:API app
  makes these commands block forever with no error at all.
"""

import shutil
import subprocess

# Commands that need nothing but the app itself. If one of these answers,
# the app is installed and reachable, and any other timeout is about that
# command's own permission or engine — not about the app.
PROBE = ["termux-battery-status"]

API_MISSING_HELP = (
    "The Termux:API app is not answering. The `termux-api` package alone is "
    "not enough — the separate Termux:API *app* must be installed too, from "
    "the same source as Termux itself (both F-Droid, or both GitHub; the "
    "Play Store builds are signed differently and cannot talk to each "
    "other).\n"
    "  1. Install Termux:API from https://f-droid.org/packages/com.termux.api/\n"
    "  2. Open it once, so Android registers it.\n"
    "  3. Settings > Apps > Termux:API > Battery > Unrestricted."
)


# Commands that Android gates behind a runtime permission. When one of
# these is refused the app does not fail — it waits for a dialog that a
# background service is not allowed to show, and the wait can jam the
# whole API service, so the next command looks like a dead app too.
PERMISSION_GATED = {
    "termux-microphone-record",
    "termux-speech-to-text",
    "termux-sms-send",
    "termux-sms-list",
    "termux-contact-list",
    "termux-telephony-call",
    "termux-location",
    "termux-camera-photo",
    "termux-camera-info",
    "termux-notification-list",
}

WEDGED_NOTE = (
    "\nA blocked command can leave the Termux:API service stuck, which "
    "makes everything after it look broken too. If the next command also "
    "hangs: Settings > Apps > Termux:API > Force stop, then try again."
)

FEATURE_HELP = {
    "termux-microphone-record": (
        "The microphone did not record.\n"
        "Termux:API is missing the Microphone permission. The others may\n"
        "well be granted — this one is separate:\n"
        "  Settings > Apps > Termux:API > Permissions > Microphone > Allow\n"
        "If Microphone is not listed there, open the Termux:API app once\n"
        "from the app drawer and look again."
    ),
    "termux-tts-speak": (
        "The Termux:API app is working — so this is text-to-speech itself.\n"
        "The phone has no speech engine set up, or the engine has no voice\n"
        "data installed.\n"
        "  Settings > General management > Text-to-speech output\n"
        "  Pick an engine (install Google's from the Play Store if there is\n"
        "  none), tap the gear beside it, and install the voice data for\n"
        "  your language. Then press 'Listen to an example' — if the phone\n"
        "  stays silent there, it will stay silent here too."
    ),
    "termux-speech-to-text": (
        "The Termux:API app is working — so this is the microphone.\n"
        "  1. Settings > Apps > Termux:API > Permissions > Microphone > Allow\n"
        "  2. It uses Google's speech service: the Google app must be\n"
        "     installed and enabled. Samsung phones sometimes have it\n"
        "     disabled.\n"
        "Typing works either way."
    ),
    "termux-sms-send": "Grant SMS permission: Settings > Apps > Termux:API > Permissions > SMS.",
    "termux-sms-list": "Grant SMS permission: Settings > Apps > Termux:API > Permissions > SMS.",
    "termux-contact-list": "Grant Contacts permission: Settings > Apps > Termux:API > Permissions > Contacts.",
    "termux-telephony-call": "Grant Phone permission: Settings > Apps > Termux:API > Permissions > Phone.",
    "termux-location": "Grant Location permission, and switch location on in the quick settings.",
    "termux-camera-photo": "Grant Camera permission: Settings > Apps > Termux:API > Permissions > Camera.",
    "termux-notification-list": (
        "This one needs notification access, which is not an ordinary\n"
        "permission: Settings > Notifications > Advanced > Notification\n"
        "access > Termux:API."
    ),
}


# Once something has been shown not to answer, there is nothing to gain by
# waiting on it again in the same run. A Jarvis question that calls three
# tools should not cost a minute of silence to fail.
_app_unreachable = False
_silent_commands = set()


def forget_failures():
    """Start trusting the phone again (used by the tests, and by --doctor)."""
    global _app_unreachable
    _app_unreachable = False
    _silent_commands.clear()


def why_no_answer(command):
    """Work out what a timeout actually means, instead of guessing.

    Ask the phone something that needs no permission. If that answers, the
    app is fine and the silence belongs to this command alone.
    """
    global _app_unreachable
    if command[0] in PROBE:
        _app_unreachable = True
        return API_MISSING_HELP
    ok, _, _ = run(PROBE, 6)
    if not ok:
        if command[0] in PERMISSION_GATED:
            # The app answered until this command ran, so the likely story
            # is a refused permission that jammed the service — not a
            # missing app. Say the useful thing first.
            return FEATURE_HELP.get(command[0], "") + WEDGED_NOTE
        _app_unreachable = True
        return API_MISSING_HELP
    return FEATURE_HELP.get(
        command[0],
        f"The Termux:API app is working, so {command[0]} is being blocked on "
        "its own — usually a permission. Look under Settings > Apps > "
        "Termux:API > Permissions.",
    )


def have(command):
    """True when `command` exists on the PATH."""
    return shutil.which(command) is not None


def run(command, timeout=20, stdin_text=None):
    """Run a command. Returns (ok, output, problem) and never raises."""
    if not have(command[0]):
        hint = "termux-api" if command[0].startswith("termux-") else "the package that provides it"
        return False, "", f"{command[0]} is not installed (`pkg install {hint}`)."
    if _app_unreachable and command[0].startswith("termux-"):
        return False, "", API_MISSING_HELP
    if command[0] in _silent_commands:
        return False, "", FEATURE_HELP.get(
            command[0], f"{command[0]} did not answer earlier in this run."
        )

    try:
        finished = subprocess.run(
            command,
            input=stdin_text,
            stdin=None if stdin_text is not None else subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        problem = why_no_answer(command)
        _silent_commands.add(command[0])
        return False, "", problem
    except OSError as error:
        return False, "", f"could not start {command[0]}: {error}"
    if finished.returncode != 0:
        detail = (finished.stderr or finished.stdout or "").strip()
        return False, "", f"{command[0]} failed: {detail or 'no detail given'}"
    return True, (finished.stdout or "").strip(), ""
