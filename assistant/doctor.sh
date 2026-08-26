#!/data/data/com.termux/files/usr/bin/bash
# Find out what works on this phone and what does not:
#
#   bash ~/WorkApp/assistant/doctor.sh
#
# Every check has a timeout, so this always finishes.

ok()   { printf '  \033[32m OK     \033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mBLOCKED \033[0m %s\n' "$1"; }
gone() { printf '  \033[33mMISSING \033[0m %s\n' "$1"; }
note() { printf '            %s\n' "$1"; }

blocked=""
working=""
missing=""

# probe LABEL TIMEOUT COMMAND...
# Runs one harmless command and reports what happened.
probe() {
    local label="$1" limit="$2"; shift 2
    if ! command -v "$1" >/dev/null 2>&1; then
        gone "$label — $1 not installed"
        missing="$missing $label"
        return
    fi
    local output
    output="$(timeout "$limit" "$@" </dev/null 2>&1)"
    case $? in
        0)   ok "$label"; working="$working $label" ;;
        124) bad "$label — no answer in ${limit}s"; blocked="$blocked $label" ;;
        *)   bad "$label — $(echo "$output" | head -1 | cut -c1-45)"
             blocked="$blocked $label" ;;
    esac
}

echo
echo "THE COMMANDS"
if command -v termux-battery-status >/dev/null 2>&1; then
    ok "termux-api package installed"
else
    gone "termux-api package"
    note "Fix: pkg install termux-api"
    note "Nothing below can work until that is done."
fi
command -v python3 >/dev/null 2>&1 && ok "$(python3 --version 2>&1)" || gone "python3 (pkg install python)"
command -v am >/dev/null 2>&1 && ok "am — alarms and timers" || gone "am (pkg install termux-am)"

echo
echo "THE APP  (needs no permission — if this fails, nothing else matters)"
probe "Termux:API app reachable" 8 termux-battery-status

echo
echo "WHAT THE PHONE WILL LET IT DO"
probe "volume"                6 termux-volume
probe "clipboard"             6 termux-clipboard-get
probe "wifi info"             6 termux-wifi-connectioninfo
probe "contacts"              8 termux-contact-list
probe "text messages"         8 termux-sms-list -l 1 -t inbox
probe "notifications"         8 termux-notification-list
probe "camera"                8 termux-camera-info
probe "speech engine present" 8 termux-tts-engines
echo "  ...speaking out loud (you should hear 'test'):"
probe "text to speech"       12 termux-tts-speak "test"

echo
echo "  ...recording three seconds from the microphone:"
recording="$HOME/.personal-ai/doctor-test.m4a"
mkdir -p "$HOME/.personal-ai"; rm -f "$recording"
if command -v termux-microphone-record >/dev/null 2>&1; then
    # Stop anything already recording first: Android allows one at a time,
    # and an interrupted run refuses every recording after it. No encoder
    # is named — the default is AAC, and naming one the device lacks hangs.
    timeout 8 termux-microphone-record -q </dev/null >/dev/null 2>&1
    timeout 10 termux-microphone-record -f "$recording" -l 3 </dev/null >/dev/null 2>&1
    sleep 4
    timeout 8 termux-microphone-record -q </dev/null >/dev/null 2>&1
    size=$(stat -c%s "$recording" 2>/dev/null || echo 0)
    if [ "$size" -gt 1200 ]; then
        ok "microphone records ($size bytes captured)"
    else
        bad "microphone captured nothing"
        blocked="$blocked microphone"
    fi
    rm -f "$recording"
else
    gone "termux-microphone-record"
fi

echo "  ...and Android's own speech recogniser (optional):"
# Not counted as a fault: many phones have none, and the assistant
# records and lets Gemini listen instead.
saved_blocked="$blocked"
probe "android speech recogniser" 10 termux-speech-to-text
blocked="$saved_blocked"
note "Many phones, Samsung's especially, do not have one. That is fine —"
note "the assistant records instead and lets Gemini do the listening."
note "Test the whole thing with:  listen --record"

echo
echo "THE GEMINI KEY"
if [ -n "${GEMINI_API_KEY:-}" ]; then
    ok "GEMINI_API_KEY is set"
elif [ -s "$HOME/.personal-ai/key" ]; then
    ok "key file at ~/.personal-ai/key"
else
    gone "no Gemini API key"
    note "https://aistudio.google.com/apikey then:"
    note "  echo YOUR_KEY > ~/.personal-ai/key"
fi

echo
if [ -n "$blocked" ]; then
    echo "WHERE TO FIX WHAT IS BLOCKED"
    echo "  Permissions:  Settings > Apps > Termux:API > Permissions"
    echo "  Notifications: Settings > Notifications > Advanced >"
    echo "                 Notification access > Termux:API"
    echo "  Speech:       Settings > General management > Text-to-speech"
    echo "  Battery:      Settings > Apps > Termux:API > Battery > Unrestricted"
    echo "                and Settings > Battery > Background usage limits"
    echo
    echo "  Or let the phone open each of those for you:"
    echo "    bash ~/WorkApp/assistant/permissions.sh"
fi

echo "=================================================="
[ -n "$working" ] && printf 'WORKING: %s\n' "$working"
[ -n "$blocked" ] && printf 'BLOCKED: %s\n' "$blocked"
[ -n "$missing" ] && printf 'MISSING: %s\n' "$missing"
if [ -z "$blocked" ] && [ -z "$missing" ]; then
    echo "Everything works. Try:  ai --jarvis --wake"
elif [ -z "$blocked" ]; then
    echo "Nothing is blocked. Try:  ai --jarvis --wake"
fi
echo "=================================================="
echo
