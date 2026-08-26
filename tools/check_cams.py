#!/usr/bin/env python3
"""Check every cam in app/src/main/assets/cams.json is still alive.

YouTube entries are checked through oEmbed, which answers 200 only for a public,
embeddable video; HLS entries are fetched and must return a real playlist. Run
this before shipping -- a dead entry is a black tile.

    python3 tools/check_cams.py
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def check_youtube(video_id):
    url = ("https://www.youtube.com/oembed?format=json&url="
           + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}"))
    try:
        _, body = get(url)
        return True, json.loads(body).get("title", "")[:52]
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} (video gone or embedding disabled)"
    except Exception as e:
        return False, str(e)[:52]


def check_hls(url):
    try:
        status, body = get(url)
        text = body.decode("utf-8", "replace")
        if not text.startswith("#EXTM3U"):
            return False, "not an HLS playlist"
        playable = "#EXTINF" in text or "#EXT-X-STREAM-INF" in text
        return playable, "playlist ok" if playable else "playlist has no segments"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)[:52]


def main():
    cams = json.load(open("app/src/main/assets/cams.json"))
    dead = []
    total = 0
    for spot, entries in sorted(cams.items()):
        for entry in entries:
            total += 1
            if entry.get("url"):
                ok, why = check_hls(entry["url"])
            else:
                ok, why = check_youtube(entry.get("videoId", ""))
            mark = "ok " if ok else "DEAD"
            print(f"{mark} {spot:16} {entry.get('channel','')[:22]:24} {why}")
            if not ok:
                dead.append((spot, entry.get("channel", ""), why))
            time.sleep(0.4)

    print(f"\n{total - len(dead)}/{total} alive")
    if dead:
        print("dead entries:")
        for spot, channel, why in dead:
            print(f"  {spot} :: {channel} :: {why}")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
