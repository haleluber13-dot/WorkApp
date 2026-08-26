"""A small Gemini client that only uses the Python standard library.

Termux ships Python without pip packages, and asking someone to build
`requests` on a phone is a bad first step, so everything here is urllib.
"""

import json
import os
import time
import urllib.error
import urllib.request

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash"

# Where the key is looked for, in order, when it is not passed explicitly.
KEY_ENV_VARS = ("GEMINI_API_KEY", "GOOGLE_API_KEY")
KEY_FILE = os.path.expanduser("~/.personal-ai/key")
MODEL_FILE = os.path.expanduser("~/.personal-ai/model")


class GeminiError(RuntimeError):
    """An error worth showing to the person using the assistant.

    The message is written to be read out loud, not debugged. `kind`
    marks the errors that callers can do something about on their own.
    """

    def __init__(self, message, kind=""):
        super().__init__(message)
        self.kind = kind


def find_key(explicit=None):
    """Return the API key, or raise with instructions for getting one."""
    if explicit:
        return explicit.strip()
    for name in KEY_ENV_VARS:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    try:
        with open(KEY_FILE, encoding="utf-8") as handle:
            value = handle.read().strip()
        if value:
            return value
    except OSError:
        pass
    raise GeminiError(
        "No Gemini API key found.\n"
        "Get one at https://aistudio.google.com/apikey then run:\n"
        "  mkdir -p ~/.personal-ai\n"
        "  echo YOUR_KEY_HERE > ~/.personal-ai/key\n"
        "  chmod 600 ~/.personal-ai/key"
    )


def _request(url, payload, key, timeout):
    """Do one HTTP call. Tests replace this function."""
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data)
    request.add_header("x-goog-api-key", key)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _explain_http_error(error, model):
    """Turn an HTTP status into a sentence that says what to do about it."""
    body = ""
    try:
        body = error.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001 - the body is a nicety, never required
        pass
    detail = body
    try:
        detail = json.loads(body)["error"]["message"]
    except Exception:  # noqa: BLE001
        pass

    if error.code == 400 and "API_KEY_INVALID" in body:
        return GeminiError(
            "Google rejected the API key. Copy it again from "
            "https://aistudio.google.com/apikey — a stray space or newline "
            "is enough to break it."
        )
    if error.code in (401, 403):
        return GeminiError(
            "The key is not allowed to use this API. Check that the "
            "Generative Language API is enabled for the project the key "
            f"belongs to.\nGoogle said: {detail}"
        )
    if error.code == 404:
        return GeminiError(
            f"The model '{model}' does not exist for this key. "
            "Run `ai --models` to see what your key can actually use.",
            kind="model_missing",
        )
    if error.code == 429:
        return GeminiError(
            "Out of quota for now — the free tier limits requests per "
            "minute and per day. Wait a minute and try again."
        )
    if error.code >= 500:
        return GeminiError(
            "Google's servers are busy or down right now. This one is not "
            "your fault; try again shortly."
        )
    return GeminiError(f"Gemini returned HTTP {error.code}: {detail}")


def _call(url, payload, key, timeout, attempts, model, sleep=time.sleep):
    """Call the API, retrying the failures that are worth retrying."""
    delay = 2
    last = None
    for attempt in range(1, attempts + 1):
        try:
            return _request(url, payload, key, timeout)
        except urllib.error.HTTPError as error:
            last = _explain_http_error(error, model)
            retryable = error.code == 429 or error.code >= 500
        except urllib.error.URLError as error:
            last = GeminiError(
                "Could not reach Google. Check that the phone is online "
                f"(wifi or mobile data).\nDetail: {error.reason}"
            )
            retryable = True
        except TimeoutError:
            last = GeminiError(
                f"Gemini did not answer within {timeout} seconds. "
                "A weak signal usually explains it."
            )
            retryable = True
        if not retryable or attempt == attempts:
            raise last
        sleep(delay)
        delay *= 2
    raise last  # pragma: no cover - the loop above always returns or raises


def build_contents(history, prompt):
    """Shape the conversation the way the REST API expects it.

    `history` is a list of (role, text) pairs where role is "user" or
    "model"; `prompt` is the new thing being asked.
    """
    contents = []
    for role, text in history:
        if role not in ("user", "model"):
            raise ValueError(f"unknown role: {role}")
        contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents


def extract_text(response):
    """Pull the reply out of a response, or explain why there isn't one."""
    feedback = response.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        raise GeminiError(
            f"Gemini refused to answer that ({feedback['blockReason']})."
        )

    candidates = response.get("candidates") or []
    if not candidates:
        raise GeminiError("Gemini sent back an empty answer.")

    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()

    if not text:
        reason = candidate.get("finishReason", "")
        if reason == "MAX_TOKENS":
            raise GeminiError(
                "The answer hit the length limit before any text came back. "
                "Raise --max-tokens or ask something smaller."
            )
        if reason == "SAFETY":
            raise GeminiError("Gemini stopped that answer on safety grounds.")
        raise GeminiError(f"Gemini sent back an empty answer ({reason or 'no reason given'}).")
    return text


def _payload(contents, system, tools, max_tokens, temperature):
    payload = {"contents": contents}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    if tools:
        payload["tools"] = tools
    config = {}
    if max_tokens:
        config["maxOutputTokens"] = int(max_tokens)
    if temperature is not None:
        config["temperature"] = float(temperature)
    if config:
        payload["generationConfig"] = config
    return payload


def split_parts(response):
    """Separate an answer into what it said and what it wants to do.

    Returns (text, calls) where each call is {"name": ..., "args": {...}}.
    A reply can carry both: "turning the light on" plus the call itself.
    """
    feedback = response.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        raise GeminiError(
            f"Gemini refused to answer that ({feedback['blockReason']})."
        )

    candidates = response.get("candidates") or []
    if not candidates:
        raise GeminiError("Gemini sent back an empty answer.")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    calls = [
        {
            "name": part["functionCall"].get("name", ""),
            "args": part["functionCall"].get("args") or {},
        }
        for part in parts
        if "functionCall" in part
    ]
    return text, calls


def raw_turn(
    contents,
    system=None,
    tools=None,
    model=DEFAULT_MODEL,
    key=None,
    timeout=60,
    attempts=3,
    max_tokens=None,
    temperature=None,
):
    """One round trip, returning the whole response. Used by the tool loop."""
    key = find_key(key)
    payload = _payload(contents, system, tools, max_tokens, temperature)
    url = f"{API_ROOT}/models/{model}:generateContent"
    return _call(url, payload, key, timeout, attempts, model)


def generate(
    prompt,
    history=(),
    system=None,
    model=DEFAULT_MODEL,
    key=None,
    timeout=60,
    attempts=3,
    max_tokens=None,
    temperature=None,
):
    """Ask Gemini one question and return the text of the answer."""
    response = raw_turn(
        build_contents(list(history), prompt),
        system=system,
        model=model,
        key=key,
        timeout=timeout,
        attempts=attempts,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return extract_text(response)


def list_models(key=None, timeout=30):
    """Return the model names this key may use, newest-style names first."""
    key = find_key(key)
    response = _call(f"{API_ROOT}/models", None, key, timeout, 2, "models")
    names = []
    for model in response.get("models", []):
        methods = model.get("supportedGenerationMethods", [])
        if "generateContent" not in methods:
            continue
        names.append(model.get("name", "").removeprefix("models/"))
    return sorted(name for name in names if name)


# Best first: a fast, current, generally-available chat model. Anything
# built for another job entirely is skipped outright.
PREFERRED = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-pro-latest",
)
NOT_FOR_CHAT = ("embedding", "aqa", "image", "-tts", "live", "audio", "vision", "learnlm")


def choose_model(models, exclude=()):
    """Pick the best chat model out of what a key actually offers.

    `exclude` names models already shown not to work. Being listed and
    being callable are not the same thing — a key can advertise a model
    and still refuse it — so a model that has failed is never chosen
    again.
    """
    usable = [
        name for name in models
        if name.startswith("gemini-")
        and name not in exclude
        and not any(word in name for word in NOT_FOR_CHAT)
    ]
    if not usable:
        return None  # this key has no chat model at all

    for wanted in PREFERRED:
        if wanted in usable:
            return wanted
    # Nothing known: prefer a plain name over a dated preview build.
    plain = [name for name in usable if "preview" not in name and "exp" not in name]
    return sorted(plain or usable, key=len)[0]


def preferred_model():
    """The model to use: the environment, then what was chosen last time."""
    chosen = os.environ.get("GEMINI_MODEL", "").strip()
    if chosen:
        return chosen
    try:
        with open(MODEL_FILE, encoding="utf-8") as handle:
            remembered = handle.read().strip()
        if remembered:
            return remembered
    except OSError:
        pass
    return DEFAULT_MODEL


def remember_model(name):
    os.makedirs(os.path.dirname(MODEL_FILE), exist_ok=True)
    with open(MODEL_FILE, "w", encoding="utf-8") as handle:
        handle.write(name + "\n")


def repair_model(current, key=None, announce=None, exclude=()):
    """Find a model this key can actually run, and remember it."""
    offered = list_models(key)
    choice = choose_model(offered, exclude=set(exclude) | {current})
    if not choice:
        raise GeminiError(
            "None of the models this key offers would run.\n"
            f"Tried: {', '.join(sorted(set(exclude) | {current}))}\n"
            f"Offered: {', '.join(offered) or 'nothing'}\n"
            "A key can list a model and still refuse it — usually the key "
            "is restricted, or belongs to a project without access. Make a "
            "fresh one at https://aistudio.google.com/apikey"
        )
    remember_model(choice)
    if announce:
        announce(f"[{current} is not available to your key — using {choice} instead]")
    return choice


def with_model_repair(attempt, model, key=None, announce=None, tries=4):
    """Run `attempt(model)`; when the model is refused, try another.

    Every path that talks to Gemini needs this, not just the chat one: a
    key that cannot run the default model cannot transcribe with it
    either. And one replacement is not enough — a key may advertise
    several models it will not actually serve — so keep going down the
    list rather than offering the same one twice.
    """
    tried = []
    current = model
    for _ in range(tries):
        try:
            return attempt(current)
        except GeminiError as error:
            if error.kind != "model_missing":
                raise
            tried.append(current)
            current = repair_model(current, key=key, announce=announce, exclude=tried)
    raise GeminiError(
        "Gave up after trying: " + ", ".join(tried + [current]) + ". "
        "Run `ai --models` to see the list, then `ai --model NAME` to pick "
        "one by hand."
    )
