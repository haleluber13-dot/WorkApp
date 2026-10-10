#!/usr/bin/env python3
"""Download PhoneGuard's Web Shield blocklists and write them into the app's assets.

Usage:  python3 tools/update_blocklists.py [--out app/src/main/assets/blocklists] [--rebuild]

Writes, for each category, <category>.txt.gz (one domain per line, sorted, gzipped) and
<category>.bin (the same list as the app's ready-to-load hash file, so the first start
after an install doesn't have to parse text), plus meta.json (counts, source, license,
generation time). Everything is downloaded and checked first and then written in one go,
so a failed run changes nothing. --rebuild skips the download and rewrites the outputs from
the .txt.gz files already there. Standard library only.

The parsing rules here must match HostsParser, and the hash and file format must match
DomainHash and HashFile, in app/src/main/java/com/workapp/phoneguard/shield/Blocklist.kt
(the phone downloads the same sources itself for weekly updates). BundledListsTest checks it.
"""

import argparse
import datetime
import gzip
import json
import os
import re
import struct
import sys
import tempfile
import urllib.request

# Category -> (source URL, license). Order matters only for display.
SOURCES = {
    "MALWARE": (
        "https://urlhaus.abuse.ch/downloads/hostfile/",
        "CC0 1.0 (abuse.ch URLhaus)",
    ),
    "PHISHING": (
        "https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt",
        "CC BY-SA 4.0 (malware-filter phishing-filter; sources OpenPhish, PhishTank, IPThreat)",
    ),
    "STALKERWARE": (
        "https://raw.githubusercontent.com/AssoEchap/stalkerware-indicators/master/generated/hosts",
        "CC BY 4.0 (Echap stalkerware-indicators)",
    ),
    "TRACKERS": (
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
        "MIT (StevenBlack/hosts: ads, trackers and malware)",
    ),
}

MAX_DOWNLOAD = 20 * 1024 * 1024  # same limit as the app
USER_AGENT = "PhoneGuard-blocklist-updater"

# Names that hosts files map to loopback for the machine itself. Never block them.
LOCAL_NAMES = {
    "localhost", "localhost.localdomain", "local", "broadcasthost", "0.0.0.0",
    "ip6-localhost", "ip6-loopback", "ip6-localnet", "ip6-mcastprefix",
    "ip6-allnodes", "ip6-allrouters", "ip6-allhosts",
}

LABEL_RE = re.compile(r"^[a-z0-9_-]{1,63}$")
IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


def is_ip(token):
    return bool(IPV4_RE.match(token)) or ":" in token


def normalize(raw):
    """Return the cleaned domain, or None if it is not a blockable domain name."""
    d = raw.strip().lower().rstrip(".")
    if not d or len(d) > 253 or d in LOCAL_NAMES:
        return None
    labels = d.split(".")
    if len(labels) < 2:
        return None  # bare names and TLDs are never blocked
    for label in labels:
        if not LABEL_RE.match(label):
            return None  # empty label, too long, or a character DNS names can't have
    if labels[-1].isdigit():
        return None  # an IP address or numeric junk, not a domain
    return d


def parse_line(line):
    """Domains on one line of a hosts file ("0.0.0.0 a.com b.com") or domain list ("a.com")."""
    line = line.split("#", 1)[0].strip().lstrip("﻿")
    if not line:
        return []
    tokens = line.split()
    if is_ip(tokens[0]):
        tokens = tokens[1:]
    out = []
    for t in tokens:
        d = normalize(t)
        if d is not None:
            out.append(d)
    return out


def parse(text):
    domains = set()
    for line in text.splitlines():
        domains.update(parse_line(line))
    return domains


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError("%s is larger than %d bytes" % (url, MAX_DOWNLOAD))
    return data.decode("utf-8", errors="replace")


# ---- binary hash lists (must match DomainHash and HashFile in Blocklist.kt) ----

MASK64 = (1 << 64) - 1
HASHFILE_MAGIC = 0x50474853  # "PGHS"
HASHFILE_VERSION = 1


def domain_hash(domain):
    """64-bit hash of a normalized (lowercase ASCII) domain: FNV-1a, then the murmur3 finalizer.

    Returned as a signed 64-bit value, the way Kotlin's Long holds it."""
    h = 0xCBF29CE484222325
    for b in domain.encode("ascii"):
        h = ((h ^ b) * 0x100000001B3) & MASK64
    h ^= h >> 33
    h = (h * 0xFF51AFD7ED558CCD) & MASK64
    h ^= h >> 33
    h = (h * 0xC4CEB9FE1A85EC53) & MASK64
    h ^= h >> 33
    return h - (1 << 64) if h >= (1 << 63) else h


def hash_file(domains, updated_at):
    """The app's on-disk hash list: header, then the sorted (signed) unique hashes, big-endian."""
    hashes = sorted({domain_hash(d) for d in domains})
    header = struct.pack(">iiqi", HASHFILE_MAGIC, HASHFILE_VERSION, updated_at, len(hashes))
    return header + struct.pack(">%dq" % len(hashes), *hashes)


def list_text(domains):
    return ("\n".join(sorted(domains)) + "\n").encode("ascii")


def read_list(path):
    with gzip.open(path, "rb") as f:
        return parse(f.read().decode("utf-8", errors="replace"))


# ---- writing ----

def write_all(out, files):
    """Writes {name: bytes} into folder `out` as one step, as far as a file system allows.

    Everything is written to temporary files first; only when all of them are complete are
    they renamed into place, meta.json last. So a failed run (a download error, a full disk)
    never leaves new lists next to an old meta.json."""
    temps = []
    try:
        for name, data in files.items():
            fd, tmp = tempfile.mkstemp(dir=out, prefix=".tmp-")
            temps.append((tmp, name))
            with os.fdopen(fd, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.chmod(tmp, 0o644)
        temps.sort(key=lambda t: t[1] == "meta.json")  # meta.json goes last
        while temps:
            tmp, name = temps[0]
            os.replace(tmp, os.path.join(out, name))
            temps.pop(0)
    finally:
        for tmp, _ in temps:
            try:
                os.unlink(tmp)
            except OSError:
                pass


def outputs(lists, generated, generated_millis):
    """All files for one consistent set of lists: {category: (domains, url, license)}."""
    files = {}
    meta = {"generated": generated, "generatedMillis": generated_millis, "lists": {}}
    for category, (domains, url, license_) in lists.items():
        name = category.lower() + ".txt.gz"
        # mtime=0 keeps the file byte-identical when the list did not change.
        files[name] = gzip.compress(list_text(domains), compresslevel=9, mtime=0)
        files[category.lower() + ".bin"] = hash_file(domains, generated_millis)
        meta["lists"][category] = {
            "file": name,
            "count": len(domains),
            "source": url,
            "license": license_,
        }
    files["meta.json"] = (json.dumps(meta, indent=2) + "\n").encode()
    return files


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_out = os.path.join(here, "..", "app", "src", "main", "assets", "blocklists")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=default_out, help="output folder (default: app assets)")
    ap.add_argument("--rebuild", action="store_true",
                    help="don't download: rewrite the .bin files (and meta.json) from the lists already in --out")
    args = ap.parse_args()
    out = os.path.normpath(args.out)
    os.makedirs(out, exist_ok=True)

    old_meta = {}
    try:
        with open(os.path.join(out, "meta.json")) as f:
            old_meta = json.load(f)
    except (OSError, ValueError):
        if args.rebuild:
            sys.exit("--rebuild needs an existing meta.json in %s" % out)
    old_lists = old_meta.get("lists", {})

    lists = {}
    if args.rebuild:
        generated = old_meta["generated"]
        generated_millis = old_meta["generatedMillis"]
        for category, (url, license_) in SOURCES.items():
            domains = read_list(os.path.join(out, category.lower() + ".txt.gz"))
            expected = old_lists.get(category, {}).get("count")
            if expected is not None and expected != len(domains):
                sys.exit("%s: list has %d domains but meta.json says %d" % (category, len(domains), expected))
            lists[category] = (domains, url, license_)
    else:
        now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
        generated = now.isoformat().replace("+00:00", "Z")
        generated_millis = int(now.timestamp() * 1000)
        # Download and check everything before writing anything.
        for category, (url, license_) in SOURCES.items():
            print("Downloading %s ..." % category, file=sys.stderr)
            domains = parse(download(url))
            old_count = old_lists.get(category, {}).get("count", 0)
            # Same sanity rule as the app: an empty or halved list means the source broke.
            if not domains or len(domains) < old_count // 2:
                sys.exit("%s: got %d domains (was %d) - refusing to write anything" % (category, len(domains), old_count))
            lists[category] = (domains, url, license_)
            print("  %s: %d domains" % (category, len(domains)), file=sys.stderr)

    write_all(out, outputs(lists, generated, generated_millis))
    print("Wrote %s" % out, file=sys.stderr)


if __name__ == "__main__":
    main()
