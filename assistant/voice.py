"""Talking and listening on Termux, without ever hanging the terminal."""

import termux

SPEAK_CMD = "termux-tts-speak"
LISTEN_CMD = "termux-speech-to-text"
ENGINES_CMD = "termux-tts-engines"


class Voice:
    """Speech in and out, degrading to silence rather than to a hang."""

    def __init__(self, lang=None, timeout=25, enabled=True):
        self.lang = lang
        self.timeout = timeout
        self.enabled = enabled
        self.last_problem = ""
        self._warned = False

    def speak(self, text):
        """Say `text` out loud. Returns True if it was actually spoken."""
        if not self.enabled or not text.strip():
            return False
        command = [SPEAK_CMD]
        if self.lang:
            command += ["-l", self.lang]
        command.append(text)

        ok, _, problem = termux.run(command, self.timeout)
        if not ok:
            self.last_problem = problem
            self.enabled = False  # do not make the user wait for it twice
            return False
        return True

    def listen(self, timeout=60):
        """Return what the microphone heard, or "" if that did not work."""
        ok, heard, problem = termux.run([LISTEN_CMD], timeout)
        if not ok:
            self.last_problem = problem
            return ""
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
