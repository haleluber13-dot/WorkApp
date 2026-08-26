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

# probe LABEL TIMEOUT COMMAND...
# Runs one harmless command and reports what happened.
probe() {
    local label="$1" limit="$2"; shift 2
    if ! command -v "$1" >/dev/null 2>&1; then
        gone "$label — $1 not installed"
        return
    fi
    local output
    output="$(timeout "$limit" "$@" </dev/null 2>&1)"
    case $? in
        0)   ok "$label" ;;
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
echo "  The microphone cannot be tested without you talking. Run:  listen"
echo "  then say something. Silence means the Microphone permission, or no"
echo "  Google speech service on the phone."

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
    echo "BLOCKED:$blocked"
    echo
    echo "Nearly always a permission. Open:"
    echo "  Settings > Apps > Termux:API > Permissions"
    echo "and allow Microphone, Contacts, SMS, Phone, Camera, Location —"
    echo "whichever of them you want it to use."
    echo
    echo "Notifications are separate, and not under Permissions:"
    echo "  Settings > Notifications > Advanced > Notification access > Termux:API"
    echo
    echo "Text to speech is separate again — it is the phone's own engine:"
    echo "  Settings > General management > Text-to-speech output"
    echo "  Pick an engine, tap the gear, install the voice data, and press"
    echo "  'Listen to an example'. Silent there means silent here."
else
    echo "Everything checked is working."
fi

echo
echo "Last thing, and it bites later rather than now: Android freezes"
echo "background services to save battery, which turns working commands into"
echo "hanging ones after a few days."
echo "  Settings > Apps > Termux:API > Battery > Unrestricted"
echo "  Settings > Apps > Termux > Battery > Unrestricted"
echo
