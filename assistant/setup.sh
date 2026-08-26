#!/data/data/com.termux/files/usr/bin/bash
# One-time setup on the phone.
set -uo pipefail
here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo "Installing packages..."
pkg install -y python termux-api || {
    echo "pkg install failed. Run 'termux-change-repo' and try again." >&2
    exit 1
}

mkdir -p "$HOME/.personal-ai"
chmod 700 "$HOME/.personal-ai"

if [ ! -s "$HOME/.personal-ai/key" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    echo
    echo "Paste your Gemini API key (from https://aistudio.google.com/apikey):"
    read -r key
    if [ -n "${key// }" ]; then
        printf '%s\n' "$key" > "$HOME/.personal-ai/key"
        chmod 600 "$HOME/.personal-ai/key"
        echo "Saved to ~/.personal-ai/key"
    fi
fi

bindir="$PREFIX/bin"
for tool in ai say listen; do
    ln -sf "$here/bin/$tool" "$bindir/$tool"
done
echo "Linked ai, say and listen into $bindir"

echo
echo "Now checking the phone:"
bash "$here/doctor.sh"
