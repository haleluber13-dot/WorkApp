#!/usr/bin/env python3
"""Download PhoneGuard's Web Shield blocklists and write them into the app's assets.

Usage:  python3 tools/update_blocklists.py [--out app/src/main/assets/blocklists]

Writes <category>.txt.gz (one domain per line, sorted, gzipped) for each category
plus meta.json (counts, source, license, generation time). Standard library only.

The parsing rules here must match HostsParser in
app/src/main/java/com/workapp/phoneguard/shield/Blocklist.kt, because the phone
downloads the same sources itself for weekly updates.
"""

import argparse
import datetime
import gzip
import json
import os
import re
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


def write_atomic(path, data):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_out = os.path.join(here, "..", "app", "src", "main", "assets", "blocklists")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=default_out, help="output folder (default: app assets)")
    args = ap.parse_args()
    out = os.path.normpath(args.out)
    os.makedirs(out, exist_ok=True)

    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    meta = {
        "generated": now.isoformat().replace("+00:00", "Z"),
        "generatedMillis": int(now.timestamp() * 1000),
        "lists": {},
    }
    old_meta = {}
    try:
        with open(os.path.join(out, "meta.json")) as f:
            old_meta = json.load(f).get("lists", {})
    except (OSError, ValueError):
        pass

    for category, (url, license_) in SOURCES.items():
        print("Downloading %s ..." % category, file=sys.stderr)
        domains = parse(download(url))
        old_count = old_meta.get(category, {}).get("count", 0)
        # Same sanity rule as the app: an empty or halved list means the source broke.
        if not domains or len(domains) < old_count // 2:
            sys.exit("%s: got %d domains (was %d) - refusing to write" % (category, len(domains), old_count))
        name = category.lower() + ".txt.gz"
        body = ("\n".join(sorted(domains)) + "\n").encode("ascii")
        # mtime=0 keeps the file byte-identical when the list did not change.
        write_atomic(os.path.join(out, name), gzip.compress(body, compresslevel=9, mtime=0))
        meta["lists"][category] = {
            "file": name,
            "count": len(domains),
            "source": url,
            "license": license_,
        }
        print("  %s: %d domains" % (category, len(domains)), file=sys.stderr)

    write_atomic(os.path.join(out, "meta.json"), (json.dumps(meta, indent=2) + "\n").encode())
    print("Wrote %s" % out, file=sys.stderr)


if __name__ == "__main__":
    main()
