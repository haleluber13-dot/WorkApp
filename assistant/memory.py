"""What the assistant knows about the person it works for.

A plain text file, read into every conversation and written to when the
model is told something worth keeping. Editable by hand: it is the file
that makes the assistant yours rather than generic.
"""

import os

MEMORY_FILE = os.path.expanduser("~/.personal-ai/memory.md")

# Enough for a few hundred facts; beyond that it is costing tokens on
# every single question and wants pruning rather than growing.
MAX_FACTS = 200


def load():
    """Everything remembered, as lines. Empty when there is nothing."""
    try:
        with open(MEMORY_FILE, encoding="utf-8") as handle:
            lines = [line.strip() for line in handle if line.strip()]
    except OSError:
        return []
    return [line.lstrip("- ").strip() for line in lines if not line.startswith("#")]


def save(facts):
    os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
    with open(MEMORY_FILE, "w", encoding="utf-8") as handle:
        handle.write("# What I know about you. Edit freely.\n\n")
        for fact in facts[-MAX_FACTS:]:
            handle.write(f"- {fact}\n")


def remember(fact):
    """Keep one fact. Returns what to tell the model."""
    fact = " ".join(fact.split())
    if not fact:
        return "nothing to remember"
    facts = load()
    if fact in facts:
        return "already knew that"
    facts.append(fact)
    save(facts)
    return f"remembered: {fact}"


def forget(about):
    """Drop every fact mentioning `about`."""
    about = about.strip().lower()
    if not about:
        return "nothing to forget"
    facts = load()
    keeping = [fact for fact in facts if about not in fact.lower()]
    dropped = len(facts) - len(keeping)
    if not dropped:
        return f"nothing remembered about '{about}'"
    save(keeping)
    return f"forgot {dropped} thing{'s' if dropped != 1 else ''} about {about}"


def as_prompt():
    """The remembered facts, shaped for the system instructions."""
    facts = load()
    if not facts:
        return ""
    lines = "\n".join(f"- {fact}" for fact in facts)
    return (
        "\n\nWhat you know about the person you work for. Use it without "
        "being asked, and without mentioning that you are using it:\n" + lines
    )
