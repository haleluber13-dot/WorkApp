"""Hearing, without Google's speech service.

`termux-speech-to-text` is a thin wrapper around Android's recogniser,
which many phones — Samsung's especially — simply do not have. But every
phone can record a file, and Gemini can listen to one. So: record, send,
get words back. Better Hebrew than the Android recogniser, and nothing to
install.
"""

import base64
import os
import time

import gemini
import termux

RECORD_CMD = "termux-microphone-record"
RECORDING = os.path.expanduser("~/.personal-ai/turn.m4a")

# The container termux writes is MPEG-4; different Gemini versions have
# been happier with one name or the other, so try both before giving up.
MIME_TYPES = ("audio/aac", "audio/mp4", "audio/mpeg")

TRANSCRIBE = (
    "Transcribe this recording word for word. Reply with the words only — "
    "no quotes, no commentary, no translation. If nobody is speaking, "
    "reply with exactly: (silence)"
)

# Below this a file holds no speech, only the container's own header.
TOO_SMALL = 1200


def stop():
    """Stop any recording that is already running.

    Android allows one at a time, and a run that was interrupted leaves
    the old one going — after which every new recording is refused. This
    is cheap, so it is done before every recording rather than hoped for.
    """
    termux.run([RECORD_CMD, "-q"], 10)


def record(seconds=8, path=None, on_progress=None):
    """Record from the microphone into `path`. Returns (ok, problem)."""
    # Resolved here rather than as a default argument, so the location
    # stays one value that can be changed in one place.
    path = path or RECORDING
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        os.remove(path)
    except OSError:
        pass

    stop()

    # Recording starts in the background and the command returns at once.
    # No encoder is named: the default is AAC, and asking for one the
    # device does not have is another way to hang.
    ok, _, problem = termux.run(
        [RECORD_CMD, "-f", path, "-l", str(int(seconds))], 15
    )
    if not ok:
        return False, problem

    # Wait it out a second at a time, so the caller can show a countdown
    # instead of an unexplained pause.
    for remaining in range(int(seconds), 0, -1):
        if on_progress:
            on_progress(remaining)
        time.sleep(1)
    time.sleep(0.4)
    stop()

    if not os.path.exists(path):
        return False, (
            "The recording was never written. Termux:API needs the "
            "Microphone permission: Settings > Apps > Termux:API > "
            "Permissions > Microphone > Allow."
        )
    size = os.path.getsize(path)
    if size < TOO_SMALL:
        return False, (
            f"The recording came out nearly empty ({size} bytes). Either the "
            "microphone captured nothing, or another app is holding it — a "
            "call, or an assistant listening in the background. Check that "
            "Termux:API has the Microphone permission, and that nothing else "
            "is using the mic."
        )
    return True, ""


def transcribe(path=None, model=None, key=None, timeout=60, announce=None):
    """Send a recording to Gemini and return the words in it."""
    path = path or RECORDING
    with open(path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")

    return gemini.with_model_repair(
        lambda chosen: _transcribe_with(encoded, chosen, key, timeout),
        model or gemini.preferred_model(),
        key=key,
        announce=announce,
    )


def _transcribe_with(encoded, model, key, timeout):
    last = None
    for mime in MIME_TYPES:
        contents = [{
            "role": "user",
            "parts": [
                {"text": TRANSCRIBE},
                {"inline_data": {"mime_type": mime, "data": encoded}},
            ],
        }]
        try:
            response = gemini.raw_turn(
                contents, model=model, key=key, timeout=timeout, attempts=1
            )
        except gemini.GeminiError as error:
            last = error
            continue  # wrong mime type is one of the things this can mean
        heard = gemini.extract_text(response).strip()
        return "" if heard in ("(silence)", "(Silence)") else heard
    raise last


def listen(seconds=8, model=None, key=None, announce=None, path=None,
           on_progress=None):
    """Record and transcribe in one go. Returns (words, problem)."""
    path = path or RECORDING
    ok, problem = record(seconds, path, on_progress=on_progress)
    if not ok:
        return "", problem
    try:
        return transcribe(path, model=model, key=key, announce=announce), ""
    except gemini.GeminiError as error:
        return "", str(error)


def available():
    """True when this phone can record at all."""
    return termux.have(RECORD_CMD)


def play_back(path=None):
    """Play the recording so a person can hear what was captured."""
    path = path or RECORDING
    ok, _, problem = termux.run(["termux-media-player", "play", path], 20)
    return ok, problem


def describe(path=None):
    """Size of the last recording, for when nothing else explains itself."""
    path = path or RECORDING
    try:
        return os.path.getsize(path)
    except OSError:
        return 0
