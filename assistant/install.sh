#!/data/data/com.termux/files/usr/bin/bash
# One command to get everything onto the phone:
#
#   curl -fsSL https://raw.githubusercontent.com/haleluber13-dot/WorkApp/claude/personal-ai-history-fg11ay/assistant/install.sh | bash
#
# Safe to run again later — it updates instead of complaining.
set -uo pipefail

REPO="https://github.com/haleluber13-dot/WorkApp.git"
BRANCH="claude/personal-ai-history-fg11ay"
DIR="$HOME/WorkApp"

echo "==> Installing packages"
pkg install -y git python termux-api termux-am || {
    echo "pkg install failed. Run 'termux-change-repo', pick a mirror, try again." >&2
    exit 1
}

if [ -d "$DIR/.git" ]; then
    echo "==> Updating $DIR"
    git -C "$DIR" fetch origin "$BRANCH" || exit 1
    git -C "$DIR" checkout "$BRANCH" || exit 1
    git -C "$DIR" merge --ff-only "origin/$BRANCH" || {
        echo "Local changes are in the way. Move $DIR aside and run this again." >&2
        exit 1
    }
else
    echo "==> Cloning into $DIR"
    git clone --branch "$BRANCH" "$REPO" "$DIR" || exit 1
fi

exec bash "$DIR/assistant/setup.sh"
