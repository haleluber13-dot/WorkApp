"""Running termux-api commands safely.

Two rules hold for every call in this project:

* stdin is closed, so a command can never sit waiting for input;
* a timeout is always set, because a phone without the Termux:API app
  makes these commands block forever with no error at all.
"""

import shutil
import subprocess

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
        return False, "", API_MISSING_HELP
    except OSError as error:
        return False, "", f"could not start {command[0]}: {error}"
    if finished.returncode != 0:
        detail = (finished.stderr or finished.stdout or "").strip()
        return False, "", f"{command[0]} failed: {detail or 'no detail given'}"
    return True, (finished.stdout or "").strip(), ""
