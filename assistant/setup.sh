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
echo "==> Checking the phone"
bash "$here/doctor.sh"

echo "Try it:   ai \"turn on the flashlight\""
echo
