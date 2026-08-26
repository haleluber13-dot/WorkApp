"""Talking and listening on Termux, without ever hanging the terminal."""

import sys

import ears
import termux

SPEAK_CMD = "termux-tts-speak"
LISTEN_CMD = "termux-speech-to-text"
ENGINES_CMD = "termux-tts-engines"


class Voice:
    """Speech in and out, degrading to silence rather than to a hang."""

    def __init__(self, lang=None, timeout=25, enabled=True, pitch=None, rate=None,
                 hearing="auto", model=None, record_seconds=8):
        self.lang = lang
        self.timeout = timeout
        self.enabled = enabled
        self.pitch = pitch  # below 1.0 is deeper
        self.rate = rate    # below 1.0 is slower
        # "auto" tries Android first and falls back to Gemini for good;
        # "android" and "gemini" pin one of them.
        self.hearing = hearing
        self.model = model
        self.record_seconds = record_seconds
        self.last_problem = ""
        self.mic_working = None  # None until tried; False when it failed
        self._warned = False

    def speak(self, text):
        """Say `text` out loud. Returns True if it was actually spoken."""
        if not self.enabled or not text.strip():
            return False
        command = [SPEAK_CMD]
        if self.lang:
            command += ["-l", self.lang]
        if self.pitch:
            command += ["-p", str(self.pitch)]
        if self.rate:
            command += ["-r", str(self.rate)]
        command.append(text)

        ok, _, problem = termux.run(command, self.timeout)
        if not ok:
            self.last_problem = problem
            self.enabled = False  # do not make the user wait for it twice
            return False
        return True

    def listen(self, timeout=60):
        """Return what the microphone heard.

        An empty string can mean two very different things, so `mic_working`
        says which: False means hearing failed outright and the caller
        should stop asking. True with an empty string just means nobody
        said anything.
        """
        if self.hearing in ("auto", "android"):
            ok, heard, problem = termux.run([LISTEN_CMD], timeout)
            if ok:
                self.mic_working = True
                return heard
            if self.hearing == "android":
                self.last_problem = problem
                self.mic_working = False
                return ""
            # Android cannot hear on this phone. Do not try it again.
            self.hearing = "gemini"
            print(
                "[the phone has no speech recogniser — listening through "
                "Gemini instead]",
                file=sys.stderr,
            )

        return self._listen_through_gemini()

    def _listen_through_gemini(self):
        if not ears.available():
            self.last_problem = (
                f"{ears.RECORD_CMD} is missing (`pkg install termux-api`)."
            )
            self.mic_working = False
            return ""
        heard, problem = ears.listen(self.record_seconds, model=self.model)
        if problem:
            self.last_problem = problem
            self.mic_working = False
            return ""
        self.mic_working = True
        return heard

    def warn_once(self, stream):
        """Print the reason speech is off, the first time it matters."""
        if self.last_problem and not self._warned:
            self._warned = True
            print(f"\n[voice off] {self.last_problem}\n", file=stream)


def check():
    """Report what works on this phone. Used by `ai --doctor`."""
    results = []
    for label, command in (
        ("termux-api package", SPEAK_CMD),
        ("speech to text", LISTEN_CMD),
    ):
        ok = termux.have(command)
        results.append((label, ok, "" if ok else f"missing: {command}"))

    ok, output, problem = termux.run([ENGINES_CMD], 8)
    results.insert(1, ("Termux:API app + TTS", ok, problem or output))
    return results
