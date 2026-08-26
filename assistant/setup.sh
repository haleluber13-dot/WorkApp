#!/data/data/com.termux/files/usr/bin/bash
# One-time setup on the phone. Run it again any time; nothing is undone.
set -uo pipefail
here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo "==> Packages"
pkg install -y python termux-api termux-am >/dev/null || {
    echo "pkg install failed. Run 'termux-change-repo' and try again." >&2
    exit 1
}

mkdir -p "$HOME/.personal-ai"
chmod 700 "$HOME/.personal-ai"

if [ ! -s "$HOME/.personal-ai/key" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    echo
    echo "==> Gemini API key"
    echo "Get one free at https://aistudio.google.com/apikey, then paste it here."
    echo "(Press enter to skip; you can add it later.)"
    # Read from the terminal, not from stdin: this script is often reached
    # through `curl ... | bash`, where stdin is the download, not the user.
    if [ -r /dev/tty ]; then
        read -r key < /dev/tty
    else
        read -r key
    fi
    if [ -n "${key// }" ]; then
        printf '%s\n' "$key" > "$HOME/.personal-ai/key"
        chmod 600 "$HOME/.personal-ai/key"
        echo "Saved to ~/.personal-ai/key"
    else
        echo "Skipped. Later: echo YOUR_KEY > ~/.personal-ai/key"
    fi
fi

echo
echo "==> Commands"
for tool in ai say listen; do
    ln -sf "$here/bin/$tool" "$PREFIX/bin/$tool"
    echo "  $tool"
done

echo
echo "==> Home screen shortcuts"
mkdir -p "$HOME/.shortcuts"
cat > "$HOME/.shortcuts/Jarvis.sh" <<SHORTCUT
#!/data/data/com.termux/files/usr/bin/bash
# Tap this on the home screen to wake him. Needs the Termux:Widget app.
exec $here/bin/ai --jarvis
SHORTCUT
cat > "$HOME/.shortcuts/Jarvis (wake word).sh" <<SHORTCUT
#!/data/data/com.termux/files/usr/bin/bash
exec $here/bin/ai --jarvis --wake
SHORTCUT
chmod +x "$HOME/.shortcuts/"*.sh
echo "  Jarvis"
echo "  Jarvis (wake word)"
echo "  Install the Termux:Widget app, then long-press the home screen >"
echo "  Widgets > Termux, to get a tappable icon for each."

echo
echo "==> Checking the phone"
bash "$here/doctor.sh"

echo "Try it:   ai \"turn on the flashlight\""
echo
