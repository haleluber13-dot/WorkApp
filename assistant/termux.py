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


FEATURE_HELP = {
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


def why_no_answer(command):
    """Work out what a timeout actually means, instead of guessing.

    Ask the phone something that needs no permission. If that answers, the
    app is fine and the silence belongs to this command alone.
    """
    if command[0] in PROBE:
        return API_MISSING_HELP
    ok, _, _ = run(PROBE, 6)
    if not ok:
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
        return False, "", why_no_answer(command)
    except OSError as error:
        return False, "", f"could not start {command[0]}: {error}"
    if finished.returncode != 0:
        detail = (finished.stderr or finished.stdout or "").strip()
        return False, "", f"{command[0]} failed: {detail or 'no detail given'}"
    return True, (finished.stdout or "").strip(), ""
