#!/usr/bin/env python3
"""Build a single-file TruckWay.

Produces one .html with the stylesheet, Leaflet, every app module and the
diesel reference table inlined, so the app runs from a double-clicked file with
no web server and no hosting. Everything it talks to at runtime — tiles,
routing, Overpass, geocoding, weather — sends permissive CORS headers, so a
page on a file:// origin reaches them the same as a hosted one would.

    python3 truck/tools/build-standalone.py [output.html]
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "truckway-standalone.html"

# Load order matters: each module registers itself on window.TW for the next.
MODULES = [
    "js/util.js", "js/profile.js", "js/services.js", "js/restrict.js",
    "js/poi.js", "js/fuel.js", "js/hos.js", "js/weather.js", "js/places.js",
    "js/nav.js", "js/map.js", "js/ui.js", "js/app.js",
]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def main():
    html = read("index.html")

    # A closing </script> inside inlined JS or JSON would end the block early.
    def guard(text):
        return text.replace("</script>", "<\\/script>")

    parts = [
        "<style>\n" + read("vendor/leaflet.css") + "\n</style>",
        "<style>\n" + read("styles.css") + "\n</style>",
    ]
    head_blob = "\n".join(parts)

    baselines = json.loads(read("data/fuel-baselines.json"))
    body_blob = [
        "<script>window.TW_FUEL_BASELINES = "
        + guard(json.dumps(baselines, ensure_ascii=False))
        + ";</script>",
        "<script>\n" + guard(read("vendor/leaflet.js")) + "\n</script>",
    ]
    for m in MODULES:
        body_blob.append(
            "<!-- " + m + " -->\n<script>\n" + guard(read(m)) + "\n</script>"
        )

    # Swap the external <link>/<script> tags for the inlined equivalents.
    html = html.replace('<link rel="stylesheet" href="vendor/leaflet.css">', "")
    html = html.replace('<link rel="stylesheet" href="styles.css">', head_blob)
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "")
    html = re.sub(r'\s*<script src="(vendor|js)/[^"]+"></script>', "", html)
    html = html.replace("</body>", "\n".join(body_blob) + "\n</body>")

    # Icons live in sibling files that a single page cannot carry; drop the
    # links rather than leave the browser chasing 404s.
    html = re.sub(r'\s*<link rel="(icon|apple-touch-icon)"[^>]*>', "", html)

    html = html.replace(
        "<title>TruckWay",
        "<!-- Single-file build. Open it in a browser; no server needed. -->\n<title>TruckWay",
    )

    OUT.write_text(html, encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({kb:.0f} KB)")
    for tag in ("<script", "<style"):
        print(f"  {tag} blocks: {html.count(tag)}")


if __name__ == "__main__":
    main()
