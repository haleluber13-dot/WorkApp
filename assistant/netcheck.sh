#!/data/data/com.termux/files/usr/bin/bash
# Which model will actually answer this key, and how fast?
#
#   bash ~/WorkApp/assistant/netcheck.sh
#
# A listing that returns instantly while a generation never comes back
# means the request is arriving and the answer is not being produced —
# so the question is which model, not whether the network works.

key="${GEMINI_API_KEY:-$(cat "$HOME/.personal-ai/key" 2>/dev/null)}"
if [ -z "$key" ]; then
    echo "No API key found at ~/.personal-ai/key" >&2
    exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
    echo "curl is missing. Run: pkg install curl" >&2
    exit 1
fi

root="https://generativelanguage.googleapis.com/v1beta"
# Termux has no /tmp. TMPDIR is set there; the fallback is for everywhere else.
work="${TMPDIR:-/tmp}"; mkdir -p "$work" 2>/dev/null
out="$work/netcheck.out"

ask() {  # ask MODEL EXTRA_CONFIG_JSON
    local model="$1" extra="$2" body
    body="{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"Say the word ready\"}]}]$extra}"
    printf '  %-38s' "$model${extra:+  (no thinking)}"
    curl -sS -m 40 -o "$out" -w '%{http_code} in %{time_total}s\n' \
         -X POST -H "x-goog-api-key: $key" -H "Content-Type: application/json" \
         -d "$body" "$root/models/$model:generateContent" \
        || printf 'gave up\n'
    if grep -q '"text"' "$out" 2>/dev/null; then
        printf '     answered: %s\n' \
            "$(tr -d '\n' < "$out" | sed 's/.*"text": *"\([^"]*\)".*/\1/' | cut -c1-40)"
    elif grep -q '"message"' "$out" 2>/dev/null; then
        printf '     %s\n' \
            "$(tr -d '\n' < "$out" | sed 's/.*"message": *"\([^"]*\)".*/\1/' | cut -c1-70)"
    fi
}

echo
echo "Reaching Google at all?"
printf '  %-38s' "GET the model list"
curl -sS -m 20 -o /dev/null -w '%{http_code} in %{time_total}s\n' \
     -H "x-goog-api-key: $key" "$root/models" || echo "failed"

echo
echo "Which model answers, and how fast?"
ask "gemini-flash-lite-latest" ""
ask "gemini-2.5-flash-lite" ""
ask "gemini-3.5-flash" ""
ask "gemini-flash-latest" ""
ask "gemini-flash-latest" ',"generationConfig":{"thinkingConfig":{"thinkingBudget":0}}'

rm -f "$out"
echo
echo "Any row with 200 is a model this phone can use. Put its name in"
echo "~/.personal-ai/model and the assistant will use it from then on."
echo "If the fast ones answer and the others time out, the slow ones are"
echo "thinking for longer than the wait allows — nothing is broken."
echo
