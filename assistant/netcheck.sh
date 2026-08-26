#!/data/data/com.termux/files/usr/bin/bash
# Is it the code or the network? Ask Google twice, with curl, and time it.
#
#   bash ~/WorkApp/assistant/netcheck.sh
#
# The listing (a GET) and a generation (a POST) go to the same host. When
# one works and the other does not, the difference is the network, not
# anything in this project.

key="${GEMINI_API_KEY:-$(cat "$HOME/.personal-ai/key" 2>/dev/null)}"
if [ -z "$key" ]; then
    echo "No API key found at ~/.personal-ai/key" >&2
    exit 1
fi

model="$(cat "$HOME/.personal-ai/model" 2>/dev/null || echo gemini-flash-latest)"
root="https://generativelanguage.googleapis.com/v1beta"

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is missing. Run: pkg install curl" >&2
    exit 1
fi

echo
echo "1. Listing models (GET, no body)"
curl -sS -m 30 -o /dev/null -w '   HTTP %{http_code} in %{time_total}s (connect %{time_connect}s)\n' \
     -H "x-goog-api-key: $key" "$root/models" \
  || echo "   curl itself failed"

echo
echo "2. Asking for one word (POST, tiny body) — $model"
curl -sS -m 45 -o /tmp/netcheck-answer.json \
     -w '   HTTP %{http_code} in %{time_total}s (connect %{time_connect}s, first byte %{time_starttransfer}s)\n' \
     -X POST -H "x-goog-api-key: $key" -H "Content-Type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Reply with one word: ready"}]}]}' \
     "$root/models/$model:generateContent" \
  || echo "   curl itself failed or timed out"
head -c 300 /tmp/netcheck-answer.json 2>/dev/null | sed 's/^/   /'
rm -f /tmp/netcheck-answer.json

echo
echo "3. Same POST over HTTP/1.1 only"
curl -sS -m 45 --http1.1 -o /dev/null \
     -w '   HTTP %{http_code} in %{time_total}s\n' \
     -X POST -H "x-goog-api-key: $key" -H "Content-Type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Reply with one word: ready"}]}]}' \
     "$root/models/$model:generateContent" \
  || echo "   curl itself failed or timed out"

echo
echo "If 1 works and 2 does not, the network is dropping the POST — try"
echo "wifi instead of mobile data, or the other way round. If both fail,"
echo "the key or the connection is the problem. If both work, the fault is"
echo "in this project and I want to know."
echo
