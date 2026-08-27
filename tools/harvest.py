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

def get(url, headers=None, timeout=45, tries=3):
    h = {"User-Agent": UA, "Accept": "application/json,*/*", "Accept-Encoding": "gzip"}
    if headers: h.update(headers)
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw
        except Exception as e:          # transient resets are common on these hosts
            last = e
            if attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
    raise last

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
def source(name, bundle=True):
    """bundle=False marks sources whose image URLs expire; those are fetched
    live in the browser instead (they all send CORS headers)."""
    def deco(fn):
        if bundle: SOURCES[name] = fn
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

@source("singapore", bundle=False)
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

@source("california")
def s_california():
    """Caltrans CWWP2 — 12 districts, ~3500 cameras."""
    out = []
    for n in range(1, 13):
        url = "https://cwwp2.dot.ca.gov/data/d%d/cctv/cctvStatusD%02d.json" % (n, n)
        try: d = get_json(url)
        except Exception: continue
        for row in (d.get("data") or []):
            c = row.get("cctv") or {}
            if str(c.get("inService")).lower() != "true": continue
            loc = c.get("location") or {}
            img = (((c.get("imageData") or {}).get("static") or {}).get("currentImageURL"))
            if not img: continue
            nm = loc.get("locationName") or loc.get("nearbyPlace") or "Caltrans camera"
            out.append(cam("ca-d%d-%s" % (n, c.get("index")), nm,
                           loc.get("latitude"), loc.get("longitude"), img,
                           "United States", loc.get("county") or loc.get("nearbyPlace") or "California",
                           tags=["california", "caltrans", "traffic"],
                           page="https://cwwp2.dot.ca.gov/vm/streamlist.htm"))
    return out

@source("hongkong")
def s_hongkong():
    """Hong Kong Transport Department — XML feed, ~1000 cameras."""
    import xml.etree.ElementTree as ET
    raw = get("https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml")
    root = ET.fromstring(raw)
    out = []
    for im in root.iter("image"):
        g = lambda t: (im.findtext(t) or "").strip()
        img = g("url") or ("https://tdcctv.data.one.gov.hk/%s.JPG" % g("key"))
        out.append(cam("hk-" + g("key"), g("description") or g("key"),
                       g("latitude"), g("longitude"), img, "Hong Kong",
                       g("district") or g("region"), tags=["hongkong", "traffic"],
                       page="https://data.gov.hk/"))
    return out

@source("ontario")
def s_ontario():
    """Ontario 511 — each camera site exposes several views."""
    arr = get_json("https://511on.ca/api/v2/get/cameras")
    out = []
    for c in arr:
        for v in (c.get("Views") or []):
            if str(v.get("Status")).lower() != "enabled": continue
            u = v.get("Url")
            if not u: continue
            nm = c.get("Location") or "Ontario camera"
            if v.get("Description"): nm += " — " + v["Description"]
            out.append(cam("on-%s-%s" % (c.get("Id"), v.get("Id")), nm,
                           c.get("Latitude"), c.get("Longitude"), u, "Canada", "Ontario",
                           tags=["ontario", "canada", "traffic"], page="https://511on.ca/"))
    return out

@source("britishcolumbia")
def s_bc():
    arr = get_json("https://www.drivebc.ca/api/webcams/")
    out = []
    for c in arr:
        if not c.get("is_on") or not c.get("should_appear"): continue
        coords = ((c.get("location") or {}).get("coordinates")) or []
        if len(coords) < 2: continue
        out.append(cam("bc-" + str(c.get("id")), c.get("name") or c.get("caption"),
                       coords[1], coords[0],
                       "https://www.drivebc.ca/images/%s.jpg" % c.get("id"),
                       "Canada", c.get("region_name") or "British Columbia",
                       tags=["bc", "canada", "traffic"], page="https://www.drivebc.ca/"))
    return out

@source("oregon")
def s_oregon():
    """ODOT TripCheck — .js extension but pure JSON; needs Accept: */*."""
    import urllib.parse
    d = json.loads(get("https://tripcheck.com/Scripts/map/data/cctvinventory.js",
                       {"Accept": "*/*"}).decode("utf-8", "replace"))
    out = []
    for f in (d.get("features") or []):
        a = f.get("attributes") or {}
        fn = a.get("filename")
        if not fn: continue
        img = "https://tripcheck.com/RoadCams/cams/" + urllib.parse.quote(fn)
        out.append(cam("or-" + str(a.get("publishedImageId") or a.get("cameraId")),
                       a.get("title"), a.get("latitude"), a.get("longitude"), img,
                       "United States", "Oregon", tags=["oregon", "odot", "traffic"],
                       page="https://tripcheck.com/"))
    return out

@source("nsw")
def s_nsw():
    d = get_json("https://data.livetraffic.com/cameras/traffic-cam.json")
    out = []
    for f in (d.get("features") or []):
        coords = (f.get("geometry") or {}).get("coordinates") or []
        p = f.get("properties") or {}
        if len(coords) < 2 or not p.get("href"): continue
        out.append(cam("nsw-" + str(f.get("id")), p.get("title"), coords[1], coords[0],
                       p.get("href"), "Australia", "New South Wales",
                       tags=["nsw", "australia", "traffic"],
                       page="https://www.livetraffic.com/"))
    return out

def _reproject(epsg):
    """Return an (x,y)->(lat,lng) function, or None if pyproj is unavailable."""
    try:
        from pyproj import Transformer
        t = Transformer.from_crs(epsg, "EPSG:4326", always_xy=True)
        return lambda x, y: (lambda lon, lat: (lat, lon))(*t.transform(x, y))
    except Exception:
        return None

@source("norway")
def s_norway():
    """Statens vegvesen — keyless but requires two custom headers."""
    d = get_json("https://road-weather-and-view.atlas.vegvesen.no/weather-information/measurement-sites",
                 {"Accept": "application/vnd.svv.v1+json; charset=utf-8", "X-System-ID": "vvtraf"})
    out = []
    for site in (d.get("measurementSites") or []):
        coords = (((site.get("location") or {}).get("geometry") or {}).get("coordinates")) or []
        if len(coords) < 2: continue
        county = (((site.get("location") or {}).get("county")) or {}).get("name") or ""
        for c in (site.get("cameras") or []):
            img = c.get("stillImageUrl")
            if not img or str(c.get("status", "OK")).upper() not in ("OK", ""): continue
            nm = site.get("name") or "Norway camera"
            if c.get("orientationDescription"): nm += " — " + c["orientationDescription"]
            out.append(cam("no-" + str(c.get("id")), nm, coords[1], coords[0], img,
                           "Norway", county, tags=["norway", "traffic"],
                           page="https://www.vegvesen.no/trafikk/", clip=c.get("videoUrl") or None))
    return out

@source("iceland")
def s_iceland():
    arr = get_json("https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1")
    out = []
    for i, r in enumerate(arr):
        img = r.get("Slod")
        if not img: continue
        nm = r.get("Myndavel") or "Iceland camera"
        if r.get("Skyring"): nm += " — " + r["Skyring"]
        out.append(cam("is-%s-%d" % (r.get("Maelist_nr"), i), nm, r.get("Breidd"), r.get("Lengd"),
                       img, "Iceland", r.get("Vegheiti") or "", tags=["iceland", "traffic"],
                       page="https://www.vegagerdin.is/"))
    return out

@source("ireland")
def s_ireland():
    arr = get_json("https://iretg.carsprogram.org/cameras_v1/api/cameras")
    out = []
    for c in arr:
        if c.get("active") is False or c.get("public") is False: continue
        loc = c.get("location") or {}
        for i, v in enumerate(c.get("views") or []):
            if v.get("type") != "STILL_IMAGE" or not v.get("url"): continue
            out.append(cam("ie-%s-%d" % (c.get("id"), i), v.get("name") or c.get("name"),
                           loc.get("latitude"), loc.get("longitude"), v["url"], "Ireland",
                           loc.get("cityReference") or loc.get("routeId") or "",
                           tags=["ireland", "traffic"], page="https://www.tii.ie/"))
    return out

@source("lithuania")
def s_lithuania():
    """eismoinfo.lt — coordinates are EPSG:3346 (LKS-94), must be reprojected."""
    proj = _reproject("EPSG:3346")
    if not proj:
        raise RuntimeError("pyproj required for Lithuania (pip install pyproj)")
    arr = get_json("https://eismoinfo.lt/eismoinfo-backend/camera-info-table")
    out = []
    for c in arr:
        if c.get("x") is None or c.get("y") is None: continue
        lat, lng = proj(c["x"], c["y"])
        img = c.get("image") or ("https://eismoinfo.lt/eismoinfo-backend/image-provider/camera/last?id=%s" % c.get("id"))
        out.append(cam("lt-" + str(c.get("id")), c.get("name"), lat, lng, img, "Lithuania",
                       c.get("roadName") or "", tags=["lithuania", "traffic"],
                       page="https://eismoinfo.lt/"))
    return out

@source("switzerland")
def s_switzerland():
    """MeteoSwiss webcams — EPSG:2056 coords, image URL embedded in an HTML blob."""
    import re
    proj = _reproject("EPSG:2056")
    if not proj:
        raise RuntimeError("pyproj required for Switzerland")
    d = get_json("https://data.geo.admin.ch/ch.meteoschweiz.messnetz-webcams/ch.meteoschweiz.messnetz-webcams_en.json")
    out = []
    for f in (d.get("features") or []):
        coords = (f.get("geometry") or {}).get("coordinates") or []
        p = f.get("properties") or {}
        if len(coords) < 2: continue
        m = re.search(r'src="(https://backend\.roundshot\.com/cams/[^"]+?)/thumbnail"', p.get("description") or "")
        if not m: continue
        lat, lng = proj(coords[0], coords[1])
        out.append(cam("ch-" + str(f.get("id")), p.get("station_name"), lat, lng,
                       m.group(1) + "/thumbnail", "Switzerland", p.get("station_name") or "",
                       category="nature", tags=["switzerland", "weather", "alps"],
                       page="https://www.meteoswiss.admin.ch/"))
    return out

@source("panama")
def s_panama():
    """Panama Canal locks cameras (ArcGIS index + canal authority image host)."""
    d = get_json("https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/"
                 "PanamanCanalCameraLocations/FeatureServer/0/query"
                 "?where=1%3D1&outFields=*&outSR=4326&f=json")
    fixes = {"hd-gatun.jpg": "gatun00001.jpg"}          # published path is stale
    out = []
    for f in (d.get("features") or []):
        a, g = f.get("attributes") or {}, f.get("geometry") or {}
        img = (a.get("liveimage") or a.get("staticimage") or "").split("?")[0]
        if not img: continue
        if not img.startswith("http"): img = "http://" + img
        for bad, good in fixes.items():
            if img.endswith(bad): img = img.replace(bad, good)
        out.append(cam("pa-%s" % a.get("OBJECTID"), a.get("name"), g.get("y"), g.get("x"), img,
                       "Panama", "Panama Canal", category="sea",
                       tags=["panama", "canal", "shipping"], page="https://pancanal.com/"))
    return out

@source("centralamerica")
def s_centralamerica():
    """Volcano cameras across Guatemala / Costa Rica / Nicaragua."""
    d = get_json("https://services.arcgis.com/LjCtRQt1uf8M6LGR/arcgis/rest/services/"
                 "Camaras_Volcanes/FeatureServer/0/query"
                 "?where=1%3D1&outFields=*&outSR=4326&f=json")
    # OVSICORI moved its images; rewrite the dead ovsprivado paths
    import re
    def fix(url):
        m = re.search(r"ovsprivado\.una\.ac\.cr/images/stories/([^/]+)/camara\.jpg", url or "")
        if m:
            return "https://www.ovsicori.una.ac.cr/images/stories/camaras/%s/camara.jpg" % m.group(1)
        return url
    out = []
    for f in (d.get("features") or []):
        a, g = f.get("attributes") or {}, f.get("geometry") or {}
        img = fix((a.get("URL_Imagen") or "").strip().rstrip("?"))
        if not img: continue
        lat, lng = g.get("y"), g.get("x")
        country = ("Guatemala" if lat and 13.5 < lat < 15.5 and lng and lng < -89.5 else
                   "Costa Rica" if lat and 9 < lat < 11.3 else
                   "Nicaragua" if lat and 11.3 <= lat < 13.5 else "Central America")
        out.append(cam("cav-%s" % a.get("OBJECTID"), a.get("Nombre"), lat, lng, img,
                       country, category="nature", tags=["volcano", "monitoring"],
                       page="https://www.ovsicori.una.ac.cr/"))
    # Small source with a lot of rotted URLs (dead hosts, 0-byte 200s): check every
    # one and keep only cameras that actually return a frame.
    return keep_live([c for c in out if c])

def keep_live(cams, workers=12):
    """Fetch every image and drop entries that fail or return an empty/placeholder body."""
    from concurrent.futures import ThreadPoolExecutor
    def ok(c):
        try:
            raw = get(c["image"], timeout=15, tries=1)
            return c if len(raw) > 1000 and raw[:3] in (b"\xff\xd8\xff", b"\x89PN") else None
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return [c for c in ex.map(ok, cams) if c]

@source("southafrica")
def s_southafrica():
    """i-traffic South Africa — POST-only DataTables endpoint, ~1200 cameras."""
    body = json.dumps({"draw": 1, "columns": [], "order": [], "start": 0,
                       "length": 3000, "search": {"value": "", "regex": False}}).encode()
    req = urllib.request.Request("https://www.i-traffic.co.za/List/GetData/Cameras", data=body,
                                 headers={"User-Agent": UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode("utf-8", "replace"))
    out = []
    for c in (d.get("data") or []):
        if c.get("blocked") or c.get("displayCamera") is False: continue
        rid = c.get("DT_RowId") or c.get("id")
        if not rid: continue
        out.append(cam("za-" + str(rid), c.get("displayName") or c.get("description1"),
                       c.get("latitude"), c.get("longitude"),
                       "https://www.i-traffic.co.za/map/Cctv/" + str(rid),
                       "South Africa", c.get("cityName") or c.get("region") or "",
                       tags=["southafrica", "traffic"], page="https://www.i-traffic.co.za/"))
    return out

@source("panomax")
def s_panomax():
    """Panomax panorama cameras worldwide. These return HTTP 200 with the last
    frame the camera ever produced — even years old — so gate on Last-Modified."""
    from concurrent.futures import ThreadPoolExecutor
    import email.utils, datetime
    d = get_json("https://api.panomax.com/1.0/instances/lists-client/all", timeout=90)
    seen, cand = set(), []
    for inst in (d.get("instances") or []):
        c = inst.get("cam") or {}
        cid, lat, lng = c.get("id"), c.get("latitude"), c.get("longitude")
        if not cid or lat is None or lng is None or cid in seen: continue
        seen.add(cid)
        cand.append((cid, inst.get("name") or c.get("location") or ("Panomax " + str(cid)),
                     lat, lng, inst.get("frontentryUrl")))
    now = time.time()
    def fresh(item):
        cid = item[0]
        url = "https://panodata.panomax.com/cams/%d/recent_reduced.jpg" % cid
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                lm = r.headers.get("Last-Modified")
                if not lm: return None
                age = now - email.utils.parsedate_to_datetime(lm).timestamp()
                return (item, url) if age < 86400 else None      # updated in the last 24h
        except Exception:
            return None
    live = []
    with ThreadPoolExecutor(max_workers=24) as ex:
        for res in ex.map(fresh, cand):
            if res: live.append(res)
    out = []
    for (cid, nm, lat, lng, page), url in live:
        out.append(cam("pmx-%d" % cid, nm, lat, lng, url, country_for(lat, lng),
                       category="nature", tags=["panorama", "panomax"], page=page))
    return out

@source("bavaria_austria")
def s_bavaria_austria():
    """BayernInfo — one feed carrying Bavarian (DE) and ASFINAG (AT) motorway cams."""
    d = get_json("https://map.bayerninfo.de/cam/listOfWebcamsV3.json")
    out, seen = [], set()
    def walk(node):
        for w in (node.get("webcams") or []):
            wid, url = w.get("id"), w.get("url")
            if not wid or not url or wid in seen: continue
            seen.add(wid)
            nm = " ".join(x for x in [w.get("route"), w.get("direction")] if x) or ("Camera %s" % wid)
            out.append(cam("bay-%s" % wid, nm, w.get("lat"), w.get("lon"),
                           "https://map.bayerninfo.de/cam/" + url,
                           "Austria" if url.startswith("asfinag/") else "Germany",
                           w.get("location") or "", tags=["motorway", "traffic"],
                           page="https://www.bayerninfo.de/"))
        for g in (node.get("groups") or []): walk(g)
    walk(d)
    return out

@source("southtyrol")
def s_southtyrol():
    """Open Data Hub South Tyrol — Alpine/Dolomites webcams (feratel, IDM, A22...)."""
    d = get_json("https://tourism.api.opendatahub.com/v1/WebcamInfo?pagesize=2000")
    out = []
    for it in (d.get("Items") or []):
        if it.get("Active") is False: continue
        pos = ((it.get("GpsPoints") or {}).get("position")) or {}
        gal = it.get("ImageGallery") or []
        img = gal[0].get("ImageUrl") if gal else None
        if not img or pos.get("Latitude") is None: continue
        out.append(cam("it-%s" % it.get("Id"), it.get("Shortname"),
                       pos.get("Latitude"), pos.get("Longitude"), img,
                       "Italy", "South Tyrol", category="nature",
                       tags=["alps", "webcam"], page=it.get("Webcamurl")))
    return out

@source("madrid")
def s_madrid():
    """Madrid city traffic cameras — published as KML."""
    import xml.etree.ElementTree as ET
    raw = get("https://informo.madrid.es/informo/tmadrid/CCTV.kml")
    root = ET.fromstring(raw.decode("utf-8-sig", "replace"))
    # this feed uses the earth.google.com KML namespace, not opengis.net
    def tag(el): return el.tag.split("}")[-1]
    def find_all(el, name): return [e for e in el.iter() if tag(e) == name]
    out = []
    for pm in find_all(root, "Placemark"):
        vals = {}
        for dnode in find_all(pm, "Data"):
            v = next((e for e in dnode.iter() if tag(e).lower() == "value"), None)
            vals[dnode.get("name")] = (v.text or "").strip() if v is not None else ""
        pt = next((e for e in pm.iter() if tag(e) == "coordinates"), None)
        if pt is None or not vals.get("Numero"): continue
        parts = (pt.text or "").strip().split(",")
        if len(parts) < 2: continue
        out.append(cam("mad-%s" % vals["Numero"], vals.get("Nombre"), parts[1], parts[0],
                       "https://informo.madrid.es/cameras/Camara%s.jpg" % vals["Numero"],
                       "Spain", "Madrid", tags=["madrid", "traffic"],
                       page="https://informo.madrid.es/"))
    return out

@source("fotowebcam")
def s_fotowebcam():
    """foto-webcam.eu — high-quality Alpine cams across AT/DE/IT/CH/LI."""
    import re
    html = get("https://www.foto-webcam.eu/").decode("utf-8", "replace")
    m = re.search(r'var metadata\s*=\s*new Object\((\{"cams":.*?\})\);', html, re.S)
    if not m: raise RuntimeError("foto-webcam: metadata block not found")
    cams = json.loads(m.group(1)).get("cams") or []
    CC = {"at": "Austria", "de": "Germany", "it": "Italy", "ch": "Switzerland",
          "li": "Liechtenstein", "gl": "Greenland", "pe": "Peru", "us": "United States"}
    out = []
    for c in cams:
        if c.get("offline") or c.get("hidden"): continue
        cid = c.get("id")
        img = c.get("imgurl") or ("https://www.foto-webcam.eu/webcam/%s/current/400.jpg" % cid)
        out.append(cam("fw-%s" % cid, c.get("title") or c.get("name"),
                       c.get("latitude"), c.get("longitude"), img,
                       CC.get((c.get("country") or "").lower(), "Other"), "",
                       category="nature", tags=["alps", "panorama"], page=c.get("link")))
    return out

@source("basque")
def s_basque():
    """Basque Country (trafikoa) — WGS84 list embedded in the portal page."""
    import re
    html = get("https://apps.trafikoa.euskadi.eus/wps/portal/trafico/trafikoKamerak").decode("utf-8", "replace")
    out = []
    # the page concatenates the id outside the quotes:  url: ".../camaras/"+819+".jpg"
    for m in re.finditer(r'camaras/"\s*\+\s*(\d+)\s*\+\s*"\.jpg"\s*,\s*title:\s*"([^"]*)"'
                         r'\s*,\s*lat:\s*"([-\d.]+)"\s*,\s*long:\s*"([-\d.]+)"', html, re.S):
        cid, title, lat, lng = m.groups()
        out.append(cam("eus-%s" % cid, title, lat, lng,
                       "https://apps.trafikoa.euskadi.eus/static/files/tr/camaras/%s.jpg" % cid,
                       "Spain", "Basque Country", tags=["basque", "traffic"],
                       page="https://apps.trafikoa.euskadi.eus/"))
    return out

def _jp_pref(host, pref, prefix):
    """Ishikawa/Gifu share a getCameraMaster + getCamera join on camera id."""
    master = get_json("https://%s/api/getCameraMaster" % host).get("vals") or []
    live = get_json("https://%s/api/getCamera" % host).get("vals") or []
    imgs = {}
    for c in live:
        ci = c.get("cameraImg")
        if isinstance(ci, str) and ci:
            imgs.setdefault(c.get("id"), []).append((ci, ""))
        elif isinstance(ci, list):
            for v in ci:
                if v.get("img"): imgs.setdefault(c.get("id"), []).append((v["img"], v.get("caption") or ""))
    out = []
    for m in master:
        got = imgs.get(m.get("id"))
        if not got: continue                    # master rows without a live frame
        for i, (path, caption) in enumerate(got):
            nm = m.get("pointName") or m.get("route") or "camera"
            if caption: nm += " — " + caption
            out.append(cam("%s-%s-%d" % (prefix, m.get("id"), i), nm,
                           m.get("latitude"), m.get("longitude"),
                           "https://%s/%s" % (host, path.lstrip("/")),
                           "Japan", m.get("area") or pref, tags=["japan", pref.lower(), "road"],
                           page="https://%s/" % host))
    return out

@source("japan_ishikawa")
def s_jp_ishikawa(): return _jp_pref("douro.pref.ishikawa.lg.jp", "Ishikawa", "jpik")

@source("japan_gifu")
def s_jp_gifu(): return _jp_pref("douro.pref.gifu.lg.jp", "Gifu", "jpgf")

@source("japan_fukui")
def s_jp_fukui():
    arr = get_json("https://www.hozen.pref.fukui.lg.jp/hozen/yuki/assets/jsons/cameras.json")
    out = []
    for c in arr:
        icons = ((c.get("map") or {}).get("icons")) or []
        img = ((c.get("data") or {}).get("image"))
        if not icons or not img: continue
        out.append(cam("jpfk-%s" % c.get("id"), c.get("name"),
                       icons[0].get("lat"), icons[0].get("lng"),
                       "https://www.hozen.pref.fukui.lg.jp/hozen/yuki/" + img.lstrip("/"),
                       "Japan", (c.get("area") or {}).get("name") or "Fukui",
                       tags=["japan", "fukui", "road"],
                       page="https://www.hozen.pref.fukui.lg.jp/hozen/yuki/"))
    return out

@source("japan_toyama")
def s_jp_toyama():
    base = "https://www.toyama-douro.toyama.toyama.jp/"
    cm = get_json(base + "json/camera_master.json")
    cur = get_json(base + "json/camera.json")
    out = []
    for key, m in cm.items():
        data = ((cur.get(key) or {}).get("camera_data")) or {}
        fn = None
        for _ts, v in sorted(data.items(), reverse=True):
            fn = (v or {}).get("file_name1")
            if fn: break
        if not fn: continue
        out.append(cam("jpty-%s" % key, m.get("name"), m.get("lat"), m.get("lng"),
                       base + (m.get("path") or "kl/camimg/") + fn, "Japan",
                       m.get("area") or "Toyama", tags=["japan", "toyama", "road"], page=base))
    # linked cameras (mostly MLIT national roads) already carry absolute image urls
    try:
        lk = get_json(base + "json/link_master.json")
        for key, m in lk.items():
            p = m.get("path") or ""
            if not p.startswith("http") or not re_img(p): continue
            out.append(cam("jptl-%s" % key, m.get("name"), m.get("lat"), m.get("lng"), p,
                           "Japan", m.get("munic") or m.get("area") or "Toyama",
                           tags=["japan", "mlit", "road"], page=base))
    except Exception:
        pass
    return out

def re_img(u):
    import re
    return bool(re.search(r"\.(jpe?g|png)(\?|$)", u or "", re.I))

@source("thailand")
def s_thailand():
    """Longdo/iTIC Thailand. The jpeg field returns 0 bytes — only hls_url works."""
    d = get_json("https://traffic.longdo.com/camera.json")
    out = []
    for c in (d.get("item") or []):
        hls = c.get("hls_url")
        if not hls: continue
        rec = cam("th-%s" % c.get("camid"), c.get("title"), c.get("latitude"), c.get("longitude"),
                  hls, "Thailand", c.get("organization") or "", tags=["thailand", "traffic"],
                  page="https://traffic.longdo.com/")
        if rec: rec["kind"] = "hls"          # stream, not a still image
        out.append(rec)
    return out

@source("indonesia")
def s_indonesia():
    """Semarang (Pantau Semar) — HLS streams embedded as JS in the page."""
    import re
    ids = ["", "?cctv_category_id=fc3ed271-787c-4191-a7dd-fc84314a9f71",
           "?cctv_category_id=5b5b7e51-3a2e-446f-8fae-50d8e9e7196d",
           "?cctv_category_id=194fd5d9-098f-4dbe-93da-8288c6761bf0",
           "?cctv_category_id=df69dbea-87c9-4d79-9ddc-f388c33f2dc9",
           "?cctv_category_id=815111a4-2beb-41f0-a44a-d6d11dfc31ca",
           "?cctv_category_id=ee2827a7-f7a2-4599-bd22-5bbf4844fa2d"]
    seen, out = set(), []
    for suffix in ids:
        try:
            html = get("https://pantausemar.semarangkota.go.id/" + suffix).decode("utf-8", "replace")
        except Exception:
            continue
        m = re.search(r"var cctvs\s*=\s*(\[.*?\]);", html, re.S)
        if not m: continue
        for c in json.loads(m.group(1)):
            for l in (c.get("links") or []):
                u = l.get("url")
                if not u or u in seen: continue
                seen.add(u)
                rec = cam("id-%s-%s" % (c.get("cctv_id"), l.get("id")),
                          l.get("name") or c.get("owner_name"), c.get("lat"), c.get("lng"),
                          u, "Indonesia", "Semarang", tags=["indonesia", "traffic"],
                          page="https://pantausemar.semarangkota.go.id/")
                if rec: rec["kind"] = "hls"
                out.append(rec)
    return [c for c in out if c]

# ---- Family A: "Castle Rock 511" — one endpoint shape across 21 jurisdictions ----
CASTLE_ROCK = [
    # (prefix, host, country, default region)
    ("fl", "fl511.com", "United States", "Florida"),
    ("ga", "511ga.org", "United States", "Georgia"),
    ("ut", "udottraffic.utah.gov", "United States", "Utah"),
    ("nys", "511ny.org", "United States", "New York"),
    ("pa", "www.511pa.com", "United States", "Pennsylvania"),
    ("nc", "drivenc.gov", "United States", "North Carolina"),
    ("az", "www.az511.gov", "United States", "Arizona"),
    ("nv", "www.nvroads.com", "United States", "Nevada"),
    ("wi", "511wi.gov", "United States", "Wisconsin"),
    ("idh", "511.idaho.gov", "United States", "Idaho"),
    ("ne511", "newengland511.org", "United States", "New England"),
    ("ct", "www.ctroads.org", "United States", "Connecticut"),
    ("ab", "511.alberta.ca", "Canada", "Alberta"),
    ("la", "511la.org", "United States", "Louisiana"),
    ("ak", "511.alaska.gov", "United States", "Alaska"),
    ("nb", "511.gnb.ca", "Canada", "New Brunswick"),
    ("ns", "511.novascotia.ca", "Canada", "Nova Scotia"),
    ("sk", "hotline.gov.sk.ca", "Canada", "Saskatchewan"),
    ("mb", "www.manitoba511.ca", "Canada", "Manitoba"),
    ("yt", "511yukon.ca", "Canada", "Yukon"),
    ("pe", "www.511.gov.pe.ca", "Canada", "Prince Edward Island"),
]

def _castle_rock(prefix, host, country, region):
    import urllib.parse, re
    out, start, total = [], 0, None
    while total is None or start < total:
        q = urllib.parse.quote(json.dumps({"columns": [], "start": start, "length": 100}))
        d = get_json("https://%s/List/GetData/Cameras?query=%s&lang=en" % (host, q), timeout=60)
        if total is None: total = d.get("recordsTotal") or 0
        rows = d.get("data") or []
        if not rows: break
        for r in rows:
            wkt = (((r.get("latLng") or {}).get("geography") or {}).get("wellKnownText")) or ""
            m = re.search(r"POINT\s*\(([-\d.]+)\s+([-\d.]+)\)", wkt)
            if not m: continue
            lng, lat = float(m.group(1)), float(m.group(2))
            state = r.get("state") or region
            for v in (r.get("images") or []):
                if v.get("disabled") or v.get("blocked") or not v.get("imageUrl"): continue
                out.append(cam("%s-%s" % (prefix, v.get("id")),
                               r.get("location") or r.get("roadway") or "Camera",
                               lat, lng, "https://%s%s" % (host, v["imageUrl"]),
                               country, r.get("county") or state,
                               tags=[state.lower().replace(" ", ""), "traffic"],
                               page="https://%s/" % host))
        start += 100
        if start > 8000: break                       # safety stop
    return out

def _mk_castle_rock(prefix, host, country, region):
    fn = lambda: _castle_rock(prefix, host, country, region)
    fn.__name__ = "s_cr_" + prefix
    return fn
for _p, _h, _c, _r in CASTLE_ROCK:
    source("cr_" + _p)(_mk_castle_rock(_p, _h, _c, _r))

# ---- Family B: "CARS Program" — whole state in one GET ----
CARS = [("mn", "Minnesota"), ("co", "Colorado"), ("ia", "Iowa"), ("in", "Indiana"),
        ("ks", "Kansas"), ("ne", "Nebraska"), ("ma", "Massachusetts")]

def _cars(code, state):
    arr = get_json("https://%stg.carsprogram.org/cameras_v1/api/cameras" % code, timeout=60)
    out = []
    for c in arr:
        if c.get("public") is False: continue
        loc = c.get("location") or {}
        for i, v in enumerate(c.get("views") or []):
            url = v.get("url") if v.get("type") == "STILL_IMAGE" else v.get("videoPreviewUrl")
            if not url: continue
            out.append(cam("%s-%s-%d" % (code, c.get("id"), i), v.get("name") or c.get("name"),
                           loc.get("latitude"), loc.get("longitude"), url,
                           "United States", loc.get("cityReference") or state,
                           tags=[state.lower(), "traffic"],
                           page="https://%stg.carsprogram.org/" % code))
    return out

def _mk_cars(code, state):
    fn = lambda: _cars(code, state)
    fn.__name__ = "s_cars_" + code
    return fn
for _c, _s in CARS:
    source("cars_" + _c)(_mk_cars(_c, _s))

# ---- Family C: ArcGIS-style and one-off state endpoints ----
def _arcgis(url, latf, lngf, namef, imgf, prefix, country, region, tags=None, where=None):
    d = get_json(url, timeout=60)
    out = []
    for f in (d.get("features") or []):
        a, g = f.get("attributes") or {}, f.get("geometry") or {}
        img = a.get(imgf)
        if not img: continue
        lat = g.get("y") if latf == "@geom" else a.get(latf)
        lng = g.get("x") if lngf == "@geom" else a.get(lngf)
        out.append(cam("%s-%s" % (prefix, a.get("OBJECTID") or a.get("objectid") or len(out)),
                       a.get(namef), lat, lng, img, country, region,
                       tags=tags or [region.lower(), "traffic"]))
    return out

@source("illinois")
def s_illinois():
    return _arcgis("https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/"
                   "TrafficCamerasTM_Public/FeatureServer/0/query?where=1%3D1&outFields=*"
                   "&outSR=4326&f=json&resultRecordCount=5000",
                   "@geom", "@geom", "CameraLocation", "SnapShot", "il", "United States", "Illinois")

@source("washington")
def s_washington():
    return _arcgis("https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/"
                   "TravelInfoCamerasWeather/FeatureServer/0/query?where=1%3D1&outFields=*"
                   "&outSR=4326&f=json&resultRecordCount=3000",
                   "@geom", "@geom", "CameraTitle", "ImageURL", "wa", "United States", "Washington")

@source("iowa_gis")
def s_iowa_gis():
    return _arcgis("https://services.arcgis.com/8lRhdTsQyJpO52F1/ArcGIS/rest/services/"
                   "Traffic_Cameras_View/FeatureServer/0/query?where=1%3D1&outFields=*"
                   "&outSR=4326&f=json&resultRecordCount=5000",
                   "@geom", "@geom", "Desc_", "ImageURL", "iag", "United States", "Iowa")

@source("hawaii")
def s_hawaii():
    return _arcgis("https://services.arcgis.com/6I1ysurtNWNxkuwd/arcgis/rest/services/"
                   "HawaiiTrafficCameras/FeatureServer/0/query?where=1%3D1&outFields=*"
                   "&outSR=4326&f=json&resultRecordCount=500",
                   "@geom", "@geom", "Camera_Description", "URL", "hi", "United States", "Hawaii")

@source("seattle")
def s_seattle():
    return _arcgis("https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/"
                   "Traffic_Cameras_CDL/FeatureServer/0/query?where=SERVSTAT%3D%27ACTV%27"
                   "&outFields=*&outSR=4326&f=json&resultRecordCount=1000",
                   "@geom", "@geom", "LOCATION", "URL", "sea", "United States", "Seattle")

@source("austin")
def s_austin():
    return _arcgis("https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/"
                   "TRANSPORTATION_traffic_cameras/FeatureServer/0/query"
                   "?where=CAMERA_STATUS%3D%27TURNED_ON%27&outFields=*&outSR=4326&f=json"
                   "&resultRecordCount=2000",
                   "@geom", "@geom", "LOCATION_NAME", "SCREENSHOT_ADDRESS", "atx",
                   "United States", "Austin")

@source("newfoundland")
def s_newfoundland():
    return _arcgis("https://services8.arcgis.com/aCyQID5qQcyrJMm2/arcgis/rest/services/"
                   "TI_HighwayCamera/FeatureServer/0/query?where=1%3D1&outFields=*"
                   "&outSR=4326&f=json",
                   "@geom", "@geom", "location", "url", "nl", "Canada", "Newfoundland and Labrador")

@source("calgary")
def s_calgary():
    import re
    d = get_json("https://services1.arcgis.com/AVP60cs0Q9PEA8rH/arcgis/rest/services/"
                 "TrafficCameras_Public/FeatureServer/0/query?where=IsPublic%3D%27Yes%27"
                 "&outFields=*&outSR=4326&f=json&resultRecordCount=500", timeout=60)
    out = []
    for f in (d.get("features") or []):
        a, g = f.get("attributes") or {}, f.get("geometry") or {}
        m = re.search(r'href="([^"]+\.jpg)"', a.get("URL") or "") or \
            re.search(r'src="([^"]+\.jpg)"', a.get("Description") or "")
        if not m: continue
        out.append(cam("cgy-%s" % a.get("OBJECTID"), a.get("Title"), g.get("y"), g.get("x"),
                       m.group(1), "Canada", "Calgary", tags=["calgary", "traffic"]))
    return out

@source("ohio")
def s_ohio():
    arr = get_json("https://api.ohgo.com/cameras", timeout=60)
    out = []
    for c in arr:
        for i, v in enumerate(c.get("Cameras") or []):
            u = v.get("SmallURL") or v.get("LargeURL")
            if not u: continue
            out.append(cam("oh-%s-%d" % (c.get("Id"), i), c.get("Location"),
                           c.get("Latitude"), c.get("Longitude"), u,
                           "United States", "Ohio", tags=["ohio", "traffic"],
                           page="https://ohgo.com/"))
    return out

@source("alabama")
def s_alabama():
    arr = get_json("https://api.algotraffic.com/v4.0/Cameras", timeout=60)
    out = []
    for c in arr:
        u = c.get("snapshotImageUrl")
        loc = c.get("location") or {}
        if not u: continue
        nm = " ".join(x for x in [loc.get("displayRouteDesignator"), loc.get("displayCrossStreet")] if x)
        out.append(cam("al-%s" % c.get("id"), nm or "Alabama camera",
                       loc.get("latitude"), loc.get("longitude"), u, "United States",
                       loc.get("city") or "Alabama", tags=["alabama", "traffic"],
                       page="https://algotraffic.com/"))
    return out

@source("michigan")
def s_michigan():
    import re
    arr = get_json("https://mdotjboss.state.mi.us/MiDrive/cameras/searchCamera", timeout=60)
    out = []
    for c in arr:
        m = re.search(r"lat=([-\d.]+)&(?:amp;)?lon=([-\d.]+).*?id=(\d+)", c.get("county") or "")
        img = re.search(r'src="([^"]+)"', c.get("image") or "")
        if not m or not img: continue
        out.append(cam("mi-%s" % m.group(3), c.get("title") or c.get("location") or "MDOT camera",
                       m.group(1), m.group(2), img.group(1), "United States", "Michigan",
                       tags=["michigan", "traffic"], page="https://mdotjboss.state.mi.us/MiDrive/"))
    return out

# Rough country attribution for sources that ship coordinates but no country.
_BOXES = [
    ("Austria", 46.3, 49.1, 9.5, 17.2), ("Switzerland", 45.8, 47.9, 5.9, 10.5),
    ("Germany", 47.2, 55.1, 5.8, 15.1), ("Italy", 36.6, 47.1, 6.6, 18.6),
    ("France", 41.3, 51.2, -5.2, 9.6), ("Slovenia", 45.4, 46.9, 13.3, 16.6),
    ("Spain", 35.9, 43.9, -9.4, 3.4), ("Czechia", 48.5, 51.1, 12.0, 18.9),
    ("Poland", 49.0, 54.9, 14.1, 24.2), ("Croatia", 42.3, 46.6, 13.4, 19.4),
    ("Slovakia", 47.7, 49.6, 16.8, 22.6), ("Greece", 34.8, 41.8, 19.3, 28.3),
    ("Turkey", 35.8, 42.2, 25.6, 44.8), ("Israel", 29.4, 33.4, 34.2, 35.9),
    ("Norway", 57.9, 71.2, 4.5, 31.2), ("Sweden", 55.3, 69.1, 11.1, 24.2),
    ("Finland", 59.7, 70.1, 20.5, 31.6), ("United Kingdom", 49.8, 60.9, -8.7, 1.8),
    ("Netherlands", 50.7, 53.6, 3.3, 7.2), ("Belgium", 49.5, 51.5, 2.5, 6.4),
    ("Portugal", 36.9, 42.2, -9.6, -6.1), ("United States", 24.5, 49.4, -125.0, -66.9),
    ("Canada", 41.7, 70.0, -141.0, -52.6), ("South Africa", -35.0, -22.1, 16.4, 32.9),
    ("Australia", -43.7, -10.6, 112.9, 153.7), ("New Zealand", -47.3, -34.1, 166.4, 178.6),
]
def country_for(lat, lng):
    for name, a, b, c, d in _BOXES:
        if a <= lat <= b and c <= lng <= d: return name
    return "Other"

# ---------------------------------------------------------------- verification
def verify(cams, per_source=6):
    """Sample image URLs per source prefix and report how many return real frames.
    Catches dead hosts and placeholder/empty responses before they reach the app."""
    import collections, random
    groups = collections.defaultdict(list)
    for c in cams:
        groups[c["id"].split("-")[0]].append(c)
    print("\n%-16s %6s  %s" % ("SOURCE", "LIVE", "SAMPLE RESULT"))
    report = {}
    for pfx, lst in sorted(groups.items()):
        sample = lst if len(lst) <= per_source else random.Random(7).sample(lst, per_source)
        ok = 0; notes = []
        for c in sample:
            try:
                raw = get(c["image"], timeout=20, tries=1)
                if len(raw) < 1000: notes.append("empty/placeholder")
                elif not raw[:3] in (b"\xff\xd8\xff", b"\x89PN"): notes.append("not-an-image")
                else: ok += 1
            except Exception as e:
                notes.append(str(e)[:28])
        report[pfx] = (ok, len(sample))
        print("%-16s %3d/%-3d  %s" % (pfx, ok, len(sample), "; ".join(sorted(set(notes))[:2]) or "all good"))
    return report

# ---------------------------------------------------------------- runner
def main(only=None, do_verify=False):
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
    if do_verify: verify(all_cams)

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else None, do_verify="--verify" in sys.argv)
