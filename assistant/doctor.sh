#!/data/data/com.termux/files/usr/bin/bash
# Find out why the assistant is not talking. Run this first, on the phone:
#
#   bash ~/WorkApp/assistant/doctor.sh
#
# Every check has a timeout, so this script always finishes.

ok()   { printf '  \033[32m OK \033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mBAD \033[0m %s\n' "$1"; }
note() { printf '        %s\n' "$1"; }

echo
echo "1. The termux-api package (the commands)"
if command -v termux-battery-status >/dev/null 2>&1; then
    ok "the termux-* commands are installed"
else
    bad "the termux-* commands are missing"
    note "Fix: pkg install termux-api"
    note "Nothing below can work until that is done."
fi

echo
echo "2. The Termux:API app (the part that does the work)"
# This is the only check that means anything: ask the phone something
# harmless and see whether an answer comes back. Reading the package list
# does not work on Android 11 and newer — Android hides other apps from
# Termux, so 'pm list packages' comes back empty even when all is well.
if command -v termux-battery-status >/dev/null 2>&1; then
    battery="$(timeout 8 termux-battery-status </dev/null 2>&1)"
    case $? in
        0)
            ok "the app answered"
            echo "$battery" | tr -d '\n' | cut -c1-70 | sed 's/^/        /'
            echo
            ;;
        124)
            bad "no answer within 8 seconds — the Termux:API app is not reachable"
            note "This is what makes termux-tts-speak hang forever."
            note ""
            note "The package and the app are two different things. Install the"
            note "app from the same place you installed Termux:"
            note "  F-Droid: https://f-droid.org/packages/com.termux.api/"
            note "Open it once so Android registers it, then run this again."
            note ""
            note "Already installed it? Then the two were installed from"
            note "different sources (Play Store vs F-Droid vs GitHub). They are"
            note "signed with different keys and Android will not let them talk."
            note "Uninstall both, reinstall both from F-Droid."
            ;;
        *)
            bad "the command failed"
            echo "$battery" | sed 's/^/        /'
            note "If this says permission denied, grant Termux:API its"
            note "permissions in Settings > Apps > Termux:API > Permissions."
            ;;
    esac
else
    bad "skipped — see step 1"
fi

echo
echo "3. Text to speech"
if command -v termux-tts-engines >/dev/null 2>&1; then
    engines="$(timeout 8 termux-tts-engines </dev/null 2>&1)"
    case $? in
        0) ok "an engine answered"; echo "$engines" | sed 's/^/        /' ;;
        124) bad "no answer — same cause as step 2" ;;
        *) bad "termux-tts-engines failed"; echo "$engines" | sed 's/^/        /' ;;
    esac
else
    bad "skipped — see step 1"
fi

echo
echo "4. Can it be heard?"
if command -v termux-volume >/dev/null 2>&1; then
    volumes="$(timeout 8 termux-volume </dev/null 2>&1)"
    if [ $? -eq 0 ]; then
        echo "$volumes" | grep -E 'stream|volume' | sed 's/^/        /'
        note "If the music volume is 0, speech runs but you hear nothing."
    else
        bad "could not read the volumes — see step 2"
    fi
fi

echo
echo "5. Python and the Gemini key"
if command -v python3 >/dev/null 2>&1; then
    ok "$(python3 --version 2>&1)"
else
    bad "python3 is missing"; note "Fix: pkg install python"
fi
if [ -n "${GEMINI_API_KEY:-}" ]; then
    ok "GEMINI_API_KEY is set in the environment"
elif [ -s "$HOME/.personal-ai/key" ]; then
    ok "key file found at ~/.personal-ai/key"
else
    bad "no Gemini API key found"
    note "Get one at https://aistudio.google.com/apikey then run:"
    note "  mkdir -p ~/.personal-ai"
    note "  echo YOUR_KEY > ~/.personal-ai/key"
fi

echo
echo "6. Setting alarms and timers"
if command -v am >/dev/null 2>&1; then
    ok "am is installed (alarms and timers will work)"
else
    bad "am is missing — alarms and timers will not work"
    note "Fix: pkg install termux-am"
fi

echo
echo "One more thing Android does quietly: it freezes background services to"
echo "save battery, which makes these commands hang later even when they work"
echo "now. Settings > Apps > Termux:API > Battery > Unrestricted, and the same"
echo "for Termux."
echo
