#!/usr/bin/env python3
"""Resolve live surf-cam streams from YouTube and emit a verified cam catalog.

Refreshes app/src/main/assets/cams.json. Only streams that were actually live
and publicly embeddable at resolve time are recorded. The app embeds the
channel-live endpoint, so an entry keeps working after the specific broadcast
rotates -- this catalog pins the *channel*, not a perishable video id.

    python3 tools/resolve_cams.py --out app/src/main/assets/cams.json
"""
import argparse, json, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")
LIVE_FILTER = "EgJAAQ%3D%3D"  # YouTube search filter: Live
THROTTLE = 1.4                # seconds between requests -- stay polite, avoid 429


def fetch(url, timeout=40, tries=3):
    last = None
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
            "Cookie": "CONSENT=YES+cb; SOCS=CAI",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 429:
                time.sleep(4 * (attempt + 1))
                continue
            raise
        except Exception as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


def initial_data(html):
    m = re.search(r"var ytInitialData\s*=\s*({.*?});</script>", html, re.S)
    if not m:
        m = re.search(r'ytInitialData"\]\s*=\s*({.*?});', html, re.S)
    return json.loads(m.group(1)) if m else None


def walk(node, key):
    """Yield every value stored under `key` anywhere in the tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                yield v
            yield from walk(v, key)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v, key)


def text_of(node):
    if not isinstance(node, dict):
        return ""
    if "simpleText" in node:
        return node["simpleText"]
    return "".join(r.get("text", "") for r in node.get("runs", []))


def search_live(query, limit=8):
    url = ("https://www.youtube.com/results?search_query="
           + urllib.parse.quote(query) + "&sp=" + LIVE_FILTER)
    data = initial_data(fetch(url))
    if not data:
        return []
    out, seen = [], set()
    for vr in walk(data, "videoRenderer"):
        if not isinstance(vr, dict):
            continue
        blob = (json.dumps(vr.get("badges", []))
                + json.dumps(vr.get("thumbnailOverlays", []))).upper()
        if "LIVE" not in blob:
            continue
        vid = vr.get("videoId")
        owner = vr.get("ownerText") or vr.get("longBylineText") or {}
        runs = owner.get("runs") or [{}]
        chan = runs[0].get("navigationEndpoint", {}).get("browseEndpoint", {}).get("browseId")
        if not vid or not chan or vid in seen:
            continue
        seen.add(vid)
        out.append({
            "videoId": vid,
            "channelId": chan,
            "title": text_of(vr.get("title", {})),
            "channel": text_of(owner),
        })
        if len(out) >= limit:
            break
    return out


STOP = {"live", "cam", "webcam", "camera", "surf", "beach", "the", "de", "la",
        "en", "direct", "ao", "vivo", "directo", "praia", "plage", "playa"}

# Things that look like a surf cam in search but point at a bar, a lobby or a
# runway. A spot keyword inside one of these is almost always a name collision
# ("Malibu Hotel, Mamaia"; "Bondi Aussie Bar, Koh Samui").
REJECT = ("bar &", "bar and", "grill", "restaurant", "cafe", "café", "yacht club",
          "airport", "lobby", "pool bar", "hotel lobby", "casino", "aquarium tank",
          "ski", "mountain", "traffic")

OCEAN = ("surf", "wave", "waves", "swell", "beach", "playa", "praia", "plage",
         "ocean", "sea", "bay", "point", "reef", "海", "波")


def relevance(hit, spot):
    """Score a candidate against the spot's own tokens.

    The spot name has to show up in the *title* -- a channel that happens to be
    called "Malibu" is not evidence the camera points at Malibu -- and a
    geography token (region/country) has to corroborate it.
    """
    title = hit["title"].lower()
    channel = hit["channel"].lower()
    hay = title + " " + channel

    keywords = [k.lower() for k in spot.get("keywords", [])]
    geo = [g.lower() for g in spot.get("geo", [])]
    reject = [r.lower() for r in spot.get("reject", [])] + list(REJECT)

    score = 0
    if any(k in title for k in keywords if len(k) >= 3 and k not in STOP):
        score += 3
    elif any(k in channel for k in keywords if len(k) >= 3 and k not in STOP):
        score += 1
    if any(g in hay for g in geo):
        score += 2
    if any(w in hay for w in OCEAN):
        score += 1
    for r in reject:
        if r in hay:
            score -= 6
    return score


def embeddable(video_id):
    """oEmbed returns 200 only for public videos that allow embedding."""
    url = ("https://www.youtube.com/oembed?format=json&url="
           + urllib.parse.quote("https://www.youtube.com/watch?v=" + video_id))
    try:
        return json.loads(fetch(url, timeout=25))
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spots", default="tools/queries.json")
    ap.add_argument("--out", default="app/src/main/assets/cams.json")
    ap.add_argument("--per-spot", type=int, default=2)
    ap.add_argument("--min-score", type=int, default=4)
    args = ap.parse_args()

    queries = json.load(open(args.spots))
    result = {}
    for spot in queries:
        sid, terms = spot["id"], spot["queries"]
        candidates = []
        for q in terms:
            try:
                candidates += search_live(q)
            except Exception as e:
                print(f"  ! {sid}: search failed ({e})", file=sys.stderr)
            time.sleep(THROTTLE)
        # de-dup by channel, best-scoring first
        best, seen_chan = [], set()
        for h in sorted(candidates, key=lambda c: -relevance(c, spot)):
            if h["channelId"] in seen_chan:
                continue
            h["score"] = relevance(h, spot)
            if h["score"] < args.min_score:
                continue
            seen_chan.add(h["channelId"])
            best.append(h)
            if len(best) >= args.per_spot:
                break

        found = []
        for h in best:
            meta = embeddable(h["videoId"])
            time.sleep(THROTTLE)
            if not meta:
                print(f"  - {sid}: {h['channel']} not embeddable", file=sys.stderr)
                continue
            found.append({
                "score": h["score"],
                "videoId": h["videoId"],
                "channelId": h["channelId"],
                "title": meta.get("title", h["title"]),
                "channel": meta.get("author_name", h["channel"]),
                "channelUrl": meta.get("author_url", ""),
            })
            print(f"  + {sid}: {h['channel']} :: {h['title'][:58]}", file=sys.stderr)
        result[sid] = found

    json.dump(result, open(args.out, "w"), indent=1, ensure_ascii=False)
    total = sum(len(v) for v in result.values())
    covered = sum(1 for v in result.values() if v)
    print(f"\nresolved {total} cams; {covered}/{len(result)} spots covered -> {args.out}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
