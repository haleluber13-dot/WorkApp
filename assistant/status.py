"""A live notification, so you can see he is running without looking here.

Android shows it in the shade and on the lock screen: one line, an icon
that changes with what he is doing, and a button to stop him.
"""

import termux

NOTIFICATION_ID = "personal-ai"

# Material icon names, which is what termux-notification takes.
STATES = {
    "ready":     ("smart_toy",    "at your service",  "#4c8dff"),
    "listening": ("mic",          "listening",        "#39d353"),
    "thinking":  ("psychology",   "thinking",         "#f0a020"),
    "acting":    ("bolt",         "working the phone", "#c678dd"),
    "speaking":  ("volume_up",    "speaking",         "#4c8dff"),
    "asleep":    ("bedtime",      "waiting for the wake word", "#6b7280"),
}


def show(state, detail="", name="JARVIS"):
    """Put the current state in the notification shade. Never blocks."""
    icon, said, colour = STATES.get(state, STATES["ready"])
    command = [
        "termux-notification",
        "--id", NOTIFICATION_ID,
        "--title", name,
        "--content", detail or said,
        "--icon", icon,
        "--led-color", colour.lstrip("#"),
        "--priority", "low",
        "--alert-once",
        "--ongoing",
        "--button1", "Stop",
        "--button1-action", "pkill -f assistant.py",
    ]
    # A status line is never worth waiting on: if the phone is busy, the
    # conversation carries on without it.
    ok, _, _ = termux.run(command, 6)
    return ok


def clear():
    termux.run(["termux-notification-remove", NOTIFICATION_ID], 6)
