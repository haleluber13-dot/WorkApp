#!/usr/bin/env python3
"""GlobeWatch camera harvester.

Fetches public, keyless camera directories from many countries and writes a single
static dataset (data/cameras.<region>.json) that the web app loads same-origin.
This sidesteps the CORS problem: only the IMAGE urls are hit from the browser,
and images never require CORS.

Run:  python3 tools/harvest.py
"""
import json, os, sys, urllib.request, urllib.error, gzip, io, math, time

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data")

def get(url, headers=None, timeout=45):
    h = {"User-Agent": UA, "Accept": "application/json,*/*", "Accept-Encoding": "gzip"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw

def get_json(url, headers=None, timeout=45):
    return json.loads(get(url, headers, timeout).decode("utf-8", "replace"))

def cam(cid, name, lat, lng, image, country, city="", category="road", tags=None, page=None, clip=None):
    """Normalized camera record consumed by the app."""
    if lat is None or lng is None: return None
    try: lat, lng = float(lat), float(lng)
    except (TypeError, ValueError): return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180): return None
    if lat == 0 and lng == 0: return None
    if not image: return None
    rec = {"id": cid, "name": (name or cid)[:90], "lat": round(lat, 5), "lng": round(lng, 5),
           "image": image, "country": country, "category": category}
    if city: rec["city"] = city[:60]
    if tags: rec["tags"] = tags[:6]
    if page: rec["page"] = page
    if clip: rec["clip"] = clip
    return rec

# ---------------------------------------------------------------- sources
SOURCES = {}
def source(name):
    def deco(fn):
        SOURCES[name] = fn
        return fn
    return deco

@source("finland")
def s_finland():
    d = get_json("https://tie.digitraffic.fi/api/weathercam/v1/stations",
                 {"Digitraffic-User": "GlobeWatch/1.0"})
    out = []
    for f in d.get("features", []):
        c = (f.get("geometry") or {}).get("coordinates") or []
        if len(c) < 2: continue
        p = f.get("properties") or {}
        nm = (p.get("name") or f.get("id") or "").replace("_", " ")
        for pr in (p.get("presets") or []):
            pid = pr.get("id")
            if not pid: continue
            out.append(cam("fi-" + pid, nm, c[1], c[0],
                           "https://weathercam.digitraffic.fi/%s.jpg" % pid,
                           "Finland", tags=["finland", "traffic"],
                           page="https://liikennetilanne.fintraffic.fi/"))
    return out

@source("london")
def s_london():
    arr = get_json("https://api.tfl.gov.uk/Place/Type/JamCam")
    out = []
    for p in arr:
        props = {a.get("key"): a.get("value") for a in (p.get("additionalProperties") or [])}
        img = props.get("imageUrl")
        if not img: continue
        out.append(cam("tfl-" + str(p.get("id")), p.get("commonName"), p.get("lat"), p.get("lon"),
                       img, "United Kingdom", "London", tags=["london", "traffic"],
                       page="https://tfl.gov.uk/traffic/status/", clip=props.get("videoUrl")))
    return out

@source("newyork")
def s_newyork():
    arr = get_json("https://webcams.nyctmc.org/api/cameras/")
    if isinstance(arr, dict): arr = arr.get("cameras") or arr.get("data") or []
    out = []
    for c in arr:
        if str(c.get("isOnline")).lower() == "false": continue
        cid = c.get("id")
        img = c.get("imageUrl") or ("https://webcams.nyctmc.org/api/cameras/%s/image" % cid)
        out.append(cam("nyc-" + str(cid), c.get("name"), c.get("latitude"), c.get("longitude"),
                       img, "United States", c.get("area") or "New York",
                       tags=["nyc", "traffic"], page="https://webcams.nyctmc.org/"))
    return out

@source("newzealand")
def s_newzealand():
    d = get_json("https://trafficnz.info/service/traffic/rest/4/cameras/all")
    out = []
    for c in (d.get("response", {}).get("camera") or []):
        if c.get("offline") or c.get("underMaintenance"): continue
        img = c.get("imageUrl") or ""
        if img.startswith("/"): img = "https://trafficnz.info" + img
        reg = (c.get("region") or {}).get("name") or ""
        out.append(cam("nz-" + str(c.get("id")), c.get("name") or c.get("description"),
                       c.get("latitude"), c.get("longitude"), img, "New Zealand", reg,
                       tags=["nz", "traffic"], page="https://www.journeys.nzta.govt.nz/"))
    return out

@source("singapore")
def s_singapore():
    d = get_json("https://api.data.gov.sg/v1/transport/traffic-images")
    items = d.get("items") or []
    cams = items[0].get("cameras", []) if items else []
    out = []
    for c in cams:
        loc = c.get("location") or {}
        out.append(cam("sg-" + str(c.get("camera_id")), "Camera " + str(c.get("camera_id")),
                       loc.get("latitude"), loc.get("longitude"), c.get("image"),
                       "Singapore", "Singapore", tags=["singapore", "traffic"],
                       page="https://data.gov.sg/"))
    return out

# ---------------------------------------------------------------- runner
def main(only=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    all_cams, report = [], []
    names = [only] if only else list(SOURCES)
    for name in names:
        fn = SOURCES.get(name)
        if not fn:
            report.append((name, 0, "unknown source")); continue
        t0 = time.time()
        try:
            cams = [c for c in fn() if c]
            seen, uniq = set(), []
            for c in cams:
                if c["id"] in seen: continue
                seen.add(c["id"]); uniq.append(c)
            all_cams += uniq
            report.append((name, len(uniq), "%.1fs" % (time.time() - t0)))
        except Exception as e:
            report.append((name, 0, "ERROR %s" % e))

    by_country = {}
    for c in all_cams:
        by_country.setdefault(c["country"], 0)
        by_country[c["country"]] += 1

    path = os.path.join(OUT_DIR, "cameras.json")
    with open(path, "w") as f:
        json.dump({"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "count": len(all_cams), "countries": by_country,
                   "cameras": all_cams}, f, separators=(",", ":"))

    print("%-14s %8s  %s" % ("SOURCE", "CAMERAS", "TIME"))
    for n, c, t in report: print("%-14s %8d  %s" % (n, c, t))
    print("-" * 40)
    print("TOTAL: %d cameras across %d countries" % (len(all_cams), len(by_country)))
    for k, v in sorted(by_country.items(), key=lambda x: -x[1]): print("   %-20s %6d" % (k, v))
    print("wrote %s (%.1f MB)" % (path, os.path.getsize(path) / 1e6))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
