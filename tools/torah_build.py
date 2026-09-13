#!/usr/bin/env python3
"""Build the Otiyot data files from the Westminster Leningrad Codex.

Downloads the five books of the Torah from tanach.us (WLC 4.20, freely
distributable transcription of a public-domain text) and emits one compact
JSON file per book containing, for every verse:

  * the consonantal letters, word by word  -> drives the letter->note mapping
  * the cantillation accent on each word   -> drives the trope mode

Usage:
    python3 tools/torah_build.py [--out torah/data] [--cache .cache/wlc]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.request

SOURCE = "https://tanach.us/Books/{}.xml"

BOOKS = [
    # id, tanach.us name, Hebrew name, English name
    ("genesis", "Genesis", "בראשית", "Genesis"),
    ("exodus", "Exodus", "שמות", "Exodus"),
    ("leviticus", "Leviticus", "ויקרא", "Leviticus"),
    ("numbers", "Numbers", "במדבר", "Numbers"),
    ("deuteronomy", "Deuteronomy", "דברים", "Deuteronomy"),
]

# The 22 letters. Final forms fold onto their base letter.
FINALS = {"ך": "כ", "ם": "מ", "ן": "נ",
          "ף": "פ", "ץ": "צ"}
LETTERS = set(chr(c) for c in range(0x05D0, 0x05EB))

# Cantillation accents, in the order the app's trope table expects them.
# Index becomes a single character (chr(48 + i)) in the packed accent string.
ACCENTS = [
    "֑",  # 0  etnahta
    "֒",  # 1  segolta
    "֓",  # 2  shalshelet
    "֔",  # 3  zaqef qatan
    "֕",  # 4  zaqef gadol
    "֖",  # 5  tipeha
    "֗",  # 6  revia
    "֘",  # 7  zarqa
    "֙",  # 8  pashta
    "֚",  # 9  yetiv
    "֛",  # 10 tevir
    "֜",  # 11 geresh
    "֝",  # 12 geresh muqdam
    "֞",  # 13 gershayim
    "֟",  # 14 qarney para
    "֠",  # 15 telisha gedola
    "֡",  # 16 pazer
    "֢",  # 17 atnah hafukh
    "֣",  # 18 munah
    "֤",  # 19 mahapakh
    "֥",  # 20 merkha
    "֦",  # 21 merkha kefula
    "֧",  # 22 darga
    "֨",  # 23 qadma
    "֩",  # 24 telisha qetana
    "֪",  # 25 yerah ben yomo
    "֫",  # 26 ole
    "֬",  # 27 iluy
    "֭",  # 28 dehi
    "֮",  # 29 zinorit
    "׃",  # 30 sof pasuq
]
ACCENT_INDEX = {ch: i for i, ch in enumerate(ACCENTS)}
NO_ACCENT = "."

VERSE_RE = re.compile(r"<v n=\"(\d+)\">(.*?)</v>", re.S)
CHAPTER_RE = re.compile(r"<c n=\"(\d+)\">(.*?)</c>", re.S)
WORD_RE = re.compile(r"<w>(.*?)</w>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def fetch(name: str, cache: pathlib.Path) -> str:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{name}.xml"
    if not path.exists():
        url = SOURCE.format(name)
        print(f"  downloading {url}", file=sys.stderr)
        with urllib.request.urlopen(url, timeout=120) as resp:
            path.write_bytes(resp.read())
    return path.read_text(encoding="utf-8")


def strip_word(raw: str) -> tuple[str, str]:
    """Return (consonants, accent-code) for one WLC word."""
    text = TAG_RE.sub("", raw)
    letters = []
    accent = NO_ACCENT
    for ch in text:
        if ch in FINALS:
            letters.append(FINALS[ch])
        elif ch in LETTERS:
            letters.append(ch)
        elif ch in ACCENT_INDEX and accent == NO_ACCENT and ch != "׃":
            # First accent on the word wins; sof pasuq is handled per verse.
            accent = chr(48 + ACCENT_INDEX[ch])
    return "".join(letters), accent


def build_book(xml: str) -> dict:
    chapters = []
    accents = []
    for _, chunk in CHAPTER_RE.findall(xml):
        verses, verse_accents = [], []
        for _, vchunk in VERSE_RE.findall(chunk):
            words, codes = [], []
            for raw in WORD_RE.findall(vchunk):
                cons, code = strip_word(raw)
                if not cons:
                    continue
                words.append(cons)
                codes.append(code)
            if words:
                verses.append(" ".join(words))
                verse_accents.append("".join(codes))
        chapters.append(verses)
        accents.append(verse_accents)
    return {"chapters": chapters, "accents": accents}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="torah/data")
    ap.add_argument("--cache", default=".cache/wlc")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cache = pathlib.Path(args.cache)

    manifest = {"source": "Westminster Leningrad Codex via tanach.us", "books": []}
    grand_letters = grand_words = grand_verses = 0

    for bid, src, he, en in BOOKS:
        print(f"{en}…", file=sys.stderr)
        book = build_book(fetch(src, cache))
        letters = sum(len(v.replace(" ", "")) for ch in book["chapters"] for v in ch)
        words = sum(len(v.split(" ")) for ch in book["chapters"] for v in ch)
        verses = sum(len(ch) for ch in book["chapters"])
        payload = {
            "id": bid, "he": he, "en": en,
            "letters": letters, "words": words, "verses": verses,
            "chapters": book["chapters"], "accents": book["accents"],
        }
        path = out / f"{bid}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        manifest["books"].append({
            "id": bid, "he": he, "en": en, "file": f"{bid}.json",
            "chapters": len(book["chapters"]),
            "verses": verses, "words": words, "letters": letters,
        })
        grand_letters += letters
        grand_words += words
        grand_verses += verses
        print(f"  {verses} verses, {words} words, {letters} letters, "
              f"{path.stat().st_size // 1024} KB", file=sys.stderr)

    manifest["totals"] = {"letters": grand_letters, "words": grand_words,
                          "verses": grand_verses}
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nTorah total: {grand_verses} verses, {grand_words} words, "
          f"{grand_letters} letters", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
