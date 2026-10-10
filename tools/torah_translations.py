#!/usr/bin/env python3
"""Fetch public-domain Torah translations for Otiyot's read-aloud.

Only versions Sefaria marks "Public Domain" are taken — all of them are
nineteenth or early twentieth century works whose copyright has expired. The
licence on every version is checked at fetch time and anything else is
skipped, so a licence change upstream cannot quietly pull a restricted text
into the bundle.

One file per language, loaded only when that language is chosen.

Usage:
    python3 tools/torah_translations.py [--out torah/data/trans] [--only en]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://www.sefaria.org/api/v3/texts/{ref}?version={ver}"

BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]

# lang code -> (label, Sefaria language, version title). Every one of these is
# listed by Sefaria as Public Domain; the fetch refuses anything that is not.
# The language has to match the version, not the request — Sefaria keys its
# versions by the language they are written in.
VERSIONS = {
    "en": ("English — JPS 1917", "english",
           "The Holy Scriptures: A New Translation (JPS 1917)"),
    "fr": ("Français — Rabbinat 1899", "french",
           "Bible du Rabbinat 1899 [fr]"),
    "de": ("Deutsch — Wohlgemuth 1899", "german",
           "Die fünf Bücher Moses, trans. Dr. J. Wohlgemuth, Rödelheim 1899 [de]"),
    "it": ("Italiano — Luzzatto 1872", "italian",
           "Il Pentateuco. Traduzione italiana di Samuel David Luzzatto, 1872 [it]"),
    "pl": ("Polski — Cylkow", "polish",
           "Bible in Polish, trans. Izaak Cylkow, 1841 - 1908 [pl]"),
    "eo": ("Esperanto — Zamenhof", "esperanto",
           "La Malnova Testamento, L.L.Zamenhof [eo]"),
}

TAG_RE = re.compile(r"<[^>]+>")
FOOTNOTE_RE = re.compile(r"<sup[^>]*>.*?</sup>|<i class=\"footnote\">.*?</i>", re.S)
WS_RE = re.compile(r"\s+")


def clean(html: str) -> str:
    """Strip the markup and footnotes, leaving speakable prose."""
    if not isinstance(html, str):
        return ""
    s = FOOTNOTE_RE.sub("", html)
    s = TAG_RE.sub("", s)
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&")
          .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    return WS_RE.sub(" ", s).strip()


def fetch_book(book: str, lang: str, version: str) -> list[list[str]]:
    url = API.format(ref=urllib.parse.quote(book),
                     ver=urllib.parse.quote(f"{lang}|{version}"))
    req = urllib.request.Request(url, headers={"User-Agent": "otiyot-build"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.load(resp)

    versions = data.get("versions") or []
    v = next((x for x in versions
              if version in (x.get("versionTitle") or "")), None)
    if v is None:
        raise RuntimeError(f"no text returned for {book}")

    licence = (v.get("license") or "").strip()
    if licence.lower() != "public domain":
        raise RuntimeError(
            f"refusing {book}: licence is {licence!r}, not Public Domain")

    chapters = v.get("text") or []
    return [[clean(x) for x in (ch or [])] for ch in chapters]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="torah/data/trans")
    ap.add_argument("--only", default="", help="comma-separated language codes")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    wanted = [c.strip() for c in args.only.split(",") if c.strip()] or list(VERSIONS)

    # Keep languages fetched by an earlier run; a partial run must not drop them.
    index = []
    existing = out / "index.json"
    if existing.exists():
        try:
            index = json.loads(existing.read_text(encoding="utf-8")).get("translations", [])
        except Exception:                       # noqa: BLE001 - rebuild from scratch
            index = []
    index = [t for t in index if t.get("code") not in wanted
             and (out / f"{t.get('code')}.json").exists()]

    for code in wanted:
        if code not in VERSIONS:
            print(f"  unknown language {code}", file=sys.stderr)
            continue
        label, lang, version = VERSIONS[code]
        print(f"{label}…", file=sys.stderr)
        books = {}
        ok = True
        for b in BOOKS:
            try:
                books[b.lower()] = fetch_book(b, lang, version)
                print(f"  {b}: {sum(len(c) for c in books[b.lower()])} verses",
                      file=sys.stderr)
            except Exception as err:          # noqa: BLE001 - report and skip
                print(f"  {b} failed: {err}", file=sys.stderr)
                ok = False
                break
            time.sleep(0.4)                   # be polite to the API
        if not ok:
            continue

        payload = {"code": code, "label": label, "version": version,
                   "license": "Public Domain",
                   "source": "https://www.sefaria.org", "books": books}
        path = out / f"{code}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
        kb = path.stat().st_size // 1024
        print(f"  -> {path} ({kb} KB)", file=sys.stderr)
        index.append({"code": code, "label": label, "file": f"{code}.json",
                      "kb": kb, "license": "Public Domain"})

    (out / "index.json").write_text(
        json.dumps({"translations": index}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"\n{len(index)} translations written", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
