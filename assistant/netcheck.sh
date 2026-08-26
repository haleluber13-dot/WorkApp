#!/data/data/com.termux/files/usr/bin/bash
# Is it the code, the network, or something in between?
#
#   bash ~/WorkApp/assistant/netcheck.sh
#
# The listing (a GET) and a generation (a POST) go to the same host on the
# same connection. When one works and the other does not, something is
# treating them differently, and these variants say what.

key="${GEMINI_API_KEY:-$(cat "$HOME/.personal-ai/key" 2>/dev/null)}"
if [ -z "$key" ]; then
    echo "No API key found at ~/.personal-ai/key" >&2
    exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
    echo "curl is missing. Run: pkg install curl" >&2
    exit 1
fi

model="$(cat "$HOME/.personal-ai/model" 2>/dev/null || echo gemini-flash-latest)"

# Termux has no /tmp. TMPDIR is set there; the fallback is for everywhere else.
work="${TMPDIR:-/tmp}"
mkdir -p "$work" 2>/dev/null
out="$work/netcheck.out"
err="$work/netcheck.err"
root="https://generativelanguage.googleapis.com"
body='{"contents":[{"role":"user","parts":[{"text":"Reply with one word: ready"}]}]}'
form='   %{http_code} in %{time_total}s\n'

try() {  # try LABEL curl-args...
    local label="$1"; shift
    printf '  %-34s' "$label"
    curl -sS -m 25 -o "$out" -w "$form" "$@" 2>"$err" \
        || printf '   FAILED: %s\n' "$(head -1 "$err" 2>/dev/null | cut -c1-60)"
}

echo
echo "Does anything reach Google at all?"
try "GET the model list"        -H "x-goog-api-key: $key" "$root/v1beta/models"
try "POST to httpbin (any host)" -X POST -d 'x=1' "https://httpbin.org/post"

echo
echo "The generation, several ways"
try "POST, key in header"       -X POST -H "x-goog-api-key: $key" \
    -H "Content-Type: application/json" -d "$body" \
    "$root/v1beta/models/$model:generateContent"
try "POST, key in the URL"      -X POST -H "Content-Type: application/json" -d "$body" \
    "$root/v1beta/models/$model:generateContent?key=$key"
try "POST, v1 instead of v1beta" -X POST -H "x-goog-api-key: $key" \
    -H "Content-Type: application/json" -d "$body" \
    "$root/v1/models/$model:generateContent"
try "POST, streaming endpoint"  -X POST -H "x-goog-api-key: $key" \
    -H "Content-Type: application/json" -d "$body" \
    "$root/v1beta/models/$model:streamGenerateContent"
try "POST, HTTP/1.1 forced"     --http1.1 -X POST -H "x-goog-api-key: $key" \
    -H "Content-Type: application/json" -d "$body" \
    "$root/v1beta/models/$model:generateContent"
try "POST, no Expect header"    -X POST -H "Expect:" -H "x-goog-api-key: $key" \
    -H "Content-Type: application/json" -d "$body" \
    "$root/v1beta/models/$model:generateContent"

echo
echo "  (last answer, if any:)"
head -c 200 "$out" 2>/dev/null | sed 's/^/   /'
rm -f "$out" "$err"
echo
echo
echo "200 anywhere in the generation rows means that variant works and the"
echo "assistant can use it. All zeros with httpbin at 200 means this host's"
echo "generation endpoint specifically is being blocked — switch between"
echo "wifi and mobile data, or use a VPN."
echo
