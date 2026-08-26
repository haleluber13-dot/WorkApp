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
if command -v termux-tts-speak >/dev/null 2>&1; then
    ok "termux-tts-speak is installed"
else
    bad "termux-tts-speak is missing"
    note "Fix: pkg install termux-api"
fi

echo
echo "2. The Termux:API app (the part that actually does the work)"
packages="$(pm list packages 2>/dev/null)"
if [ -z "$packages" ]; then
    note "Could not ask Android for the package list; check by hand instead."
elif echo "$packages" | grep -q '^package:com.termux.api$'; then
    ok "com.termux.api is installed"
else
    bad "com.termux.api is NOT installed — this is almost certainly the problem"
    note "The package and the app are two different things. Without the app,"
    note "every termux-* command waits forever with no error."
    note "Fix: install Termux:API from the same place you installed Termux."
    note "     F-Droid: https://f-droid.org/packages/com.termux.api/"
    note "Then open it once so Android registers it."
fi

echo
echo "3. Both installed from the same source?"
sources="$(pm list packages -i 2>/dev/null | grep -E 'com\.termux(\.api)?=')"
if [ -z "$sources" ]; then
    note "Could not read install sources; skipping."
else
    echo "$sources" | sed 's/^package:/        /'
    termux_src="$(echo "$sources"  | grep 'com.termux='     | sed 's/.*installer=//')"
    api_src="$(echo "$sources"     | grep 'com.termux.api=' | sed 's/.*installer=//')"
    if [ -n "$termux_src" ] && [ -n "$api_src" ] && [ "$termux_src" != "$api_src" ]; then
        bad "Different install sources — the two apps are signed differently"
        note "Android will not let them talk. Uninstall both, reinstall both"
        note "from F-Droid (or both from GitHub), then try again."
    elif [ -n "$api_src" ]; then
        ok "Same source"
    fi
fi

echo
echo "4. Text to speech"
if command -v termux-tts-engines >/dev/null 2>&1; then
    engines="$(timeout 8 termux-tts-engines </dev/null 2>&1)"
    case $? in
        0) ok "the phone answered"; echo "$engines" | sed 's/^/        /' ;;
        124) bad "no answer within 8 seconds — see step 2, the app is not reachable" ;;
        *) bad "termux-tts-engines failed"; echo "$engines" | sed 's/^/        /' ;;
    esac
else
    bad "termux-tts-engines is missing — see step 1"
fi

echo
echo "5. Can it be heard?"
if command -v termux-volume >/dev/null 2>&1; then
    volumes="$(timeout 8 termux-volume </dev/null 2>&1)"
    if [ $? -eq 0 ]; then
        echo "$volumes" | sed 's/^/        /'
        note "If music/notification volume is 0, speech plays but is silent."
    else
        bad "could not read the volumes — see step 2"
    fi
fi

echo
echo "6. Python and the Gemini key"
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
    note "Get one at https://aistudio.google.com/apikey then:"
    note "  mkdir -p ~/.personal-ai && echo YOUR_KEY > ~/.personal-ai/key"
    note "  chmod 600 ~/.personal-ai/key"
fi

echo
echo "One more thing Android does silently: it freezes background services"
echo "to save battery. Settings > Apps > Termux:API > Battery > Unrestricted,"
echo "and the same for Termux. Then run: termux-wake-lock"
echo
