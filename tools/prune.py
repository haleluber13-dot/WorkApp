#!/usr/bin/env python3
"""Prune data/cameras.json down to cameras that are actually live.

Three passes:
  1. de-duplicate identical image URLs
  2. fetch every image and drop anything that errors, is empty, or isn't an image
  3. hash the bytes — an image returned by many different cameras is a shared
     "camera offline" placeholder, so drop every camera showing it

Run: python3 tools/prune.py [--workers N]
"""
import json, os, sys, hashlib, collections, urllib.request, gzip, time
from concurrent.futures import ThreadPoolExecutor

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "data", "cameras.json")
MAGIC = (b"\xff\xd8\xff", b"\x89PN", b"GIF8", b"RIFF", b"BM")
PLACEHOLDER_MIN = 3          # same bytes from >= N cameras => shared placeholder

def fetch(url, timeout=20, limit=400_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit)

def probe(c):
    """-> (id, status, digest). status: ok | dead | empty | notimage"""
    url = c["u"]
    try:
        if c.get("k") == "hls" or url.endswith(".m3u8"):
            body = fetch(url, timeout=15, limit=8000)
            if not body or b"#EXTM3U" not in body[:200]:
                return (c["i"], "dead", None)
            return (c["i"], "ok", None)          # streams aren't hashed
        body = fetch(url)
        if len(body) < 800:
            return (c["i"], "empty", None)
        if not body.startswith(MAGIC):
            return (c["i"], "notimage", None)
        return (c["i"], "ok", hashlib.md5(body).hexdigest())
    except Exception:
        return (c["i"], "dead", None)

def main():
    workers = 64
    if "--workers" in sys.argv:
        workers = int(sys.argv[sys.argv.index("--workers") + 1])
    d = json.load(open(PATH))
    cams = d["cameras"]
    start = len(cams)
    print("loaded %d cameras" % start, flush=True)

    # pass 1: identical image URLs
    seen, deduped = set(), []
    for c in cams:
        if c["u"] in seen: continue
        seen.add(c["u"]); deduped.append(c)
    print("pass 1  dedupe url      : -%d  -> %d" % (start - len(deduped), len(deduped)), flush=True)

    # pass 2: fetch everything
    t0 = time.time()
    results, done = {}, 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for cid, status, digest in ex.map(probe, deduped):
            results[cid] = (status, digest)
            done += 1
            if done % 5000 == 0:
                print("   probed %d/%d  (%.0fs)" % (done, len(deduped), time.time() - t0), flush=True)
    counts = collections.Counter(s for s, _ in results.values())
    print("pass 2  fetch results   : %s  (%.0fs)" % (dict(counts), time.time() - t0), flush=True)

    # pass 3: shared placeholders
    hashes = collections.Counter(h for s, h in results.values() if s == "ok" and h)
    bad = {h for h, n in hashes.items() if n >= PLACEHOLDER_MIN}
    print("pass 3  placeholders    : %d distinct images shared by >=%d cameras"
          % (len(bad), PLACEHOLDER_MIN), flush=True)
    for h, n in hashes.most_common(8):
        if h in bad: print("            x%-5d %s" % (n, h), flush=True)

    kept = []
    for c in deduped:
        s, h = results.get(c["i"], ("dead", None))
        if s != "ok": continue
        if h and h in bad: continue
        kept.append(c)

    by_country = collections.Counter(c["c"] for c in kept)
    used = {c["p"] for c in kept if "p" in c}
    pages = d.get("pages", [])
    remap = {old: i for i, old in enumerate(sorted(used))}
    for c in kept:
        if "p" in c: c["p"] = remap[c["p"]]
    d.update({"count": len(kept), "countries": dict(by_country),
              "pages": [pages[i] for i in sorted(used)], "cameras": kept,
              "verified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    json.dump(d, open(PATH, "w"), separators=(",", ":"))
    raw = os.path.getsize(PATH)
    gz = len(gzip.compress(open(PATH, "rb").read(), 6))
    print("\nKEPT %d of %d  (%.1f%% live)" % (len(kept), start, 100.0 * len(kept) / start), flush=True)
    print("countries: %d   raw %.1f MB   gzip %.2f MB" % (len(by_country), raw / 1048576, gz / 1048576), flush=True)
    for k, v in by_country.most_common(): print("   %-20s %6d" % (k, v), flush=True)

if __name__ == "__main__":
    main()
