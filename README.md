# 🌐 GlobeWatch — Live Public Cameras of the World

A floating **3D globe of public live cameras** — streets, roads, airports, harbors,
skylines, plazas, nature and orbit — with a live mosaic wall beside it. Spin the
globe, tap a point to focus on one feed, search anywhere, favorite the ones you
like, and **add your own locations**. Installable as an app (PWA) on phone and
desktop.

> **Scope & ethics:** GlobeWatch aggregates *genuinely public* feeds — cameras their
> owners publish for public viewing (city/tourism webcams, DOT traffic cams, port and
> airport cams, and 24/7 public YouTube live streams). It deliberately does **not**
> include any way to access private or non‑consenting cameras; accessing a camera
> without authorization is illegal and a real privacy harm. Add feeds you have the
> right to view.

## Other apps in this repository

- **[OlaKai](./olakai/)** — surf and beach live cameras.
- **[MotorLab](./motorlab/)** — a virtual build and tuning bay for engines, cars,
  motorcycles and karts: strip an engine to the block in 3D and rebuild it with real
  torque sequences, build the chassis, wire it, tune the ECU and run it on the dyno.
  See [motorlab/README.md](./motorlab/README.md).

## Features

- **3D globe** (globe.gl / three.js) with category‑colored, glowing camera points.
  Click a point → focus that feed. Degrades gracefully to the wall if the 3D
  library can't load (offline/blocked).
- **Live wall** — a mosaic of every camera in view, filterable and searchable.
- **Focus view** — full player, coordinates, tags, source link, and a *Nearby
  cameras* strip to hop between feeds in the same area.
- **Search** everything: name, city, country, category, tags (`/` to jump to search).
- **Categories**: Streets, Roads/Traffic, Air/Skyline, Sea/Harbors, Malls/Plazas,
  Airports, Nature, Space.
- **Add / edit / delete** any location. Edits to built‑in cameras are stored as
  overrides and can be reset; your cameras and favorites persist in the browser.
- **Import / export** your whole collection as JSON (backup or share).
- **Load from providers**: one click loads Transport for London's ~900 public
  traffic cameras (no key needed); a free [Windy Webcams API](https://api.windy.com/keys)
  key pulls thousands more public webcams worldwide — either a global sample or
  **just the region you've zoomed the globe to**.
- **Every platform**: YouTube (video + channel auto‑live), Twitch (channel + video),
  Kick, Vimeo, HLS (`.m3u8`), MPEG‑DASH (`.mpd`), MP4, refreshing image snapshots,
  and any embeddable page. **Paste any live link** into the Add form and it
  auto‑detects the platform.
- **PWA** — installable, offline app shell, works on mobile and desktop.

## Run it

It's a static site — no build step.

```bash
# any static server works; e.g.
python3 -m http.server 8099
# then open http://localhost:8099
```

Open `index.html` directly works too, but a local server is recommended so the
service worker and module loading behave normally.

## Add a camera

Click **＋** and fill in the form. Choose a **Source type**:

> Tip: just paste a link into **"Paste any live link"** and the platform + id/URL
> fill in automatically. Or set them manually:

| Type | Put in "Stream id / URL" |
|------|--------------------------|
| YouTube — video id | the video id, e.g. `eJ7ZkQ5TC08` |
| YouTube — channel id (auto‑live) | the channel id — always shows whatever is live now |
| Twitch — channel | the channel name, e.g. `somecam` |
| Twitch — video id | the VOD/clip id |
| Kick — channel | the channel name |
| Vimeo — video id | the numeric id |
| HLS `.m3u8` URL | direct stream URL |
| MPEG‑DASH `.mpd` URL | direct manifest URL |
| MP4 video URL | direct `.mp4` URL |
| Refreshing image URL | a public snapshot JPEG (refreshes every few seconds) |
| Embeddable page URL | any page that allows being embedded |

Latitude/longitude place it on the globe (optional — feeds without coordinates
still appear on the wall).

## Project layout

```
index.html               app shell
manifest.webmanifest     PWA manifest
sw.js                    service worker (offline app shell)
assets/css/style.css     command‑center theme
assets/js/data.js        seed dataset + categories (editable)
assets/js/store.js       state, persistence, import/export, Windy API
assets/js/globe.js       3D globe layer (+ graceful fallback)
assets/js/ui.js          wall, focus player, editor & settings modals
assets/js/app.js         controller: search, filters, views, events
assets/icons/            app icons
```

## Notes

- The 3D globe and HLS libraries load from CDN; the app still works (wall, search,
  add/edit) if they're blocked or you're offline.
- Live feeds on the open web rotate over time — every entry is editable, so if a
  stream goes dark, open its source page and update the id/URL.
- When you change app files, bump `CACHE` in `sw.js` so clients pick up the update.

## Publish a shareable link (GitHub Pages)

This is a static site, so GitHub Pages can host it for free:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Pick the branch `claude/global-live-camera-app-49nlr4` (or `main` after merging)
   and folder **/ (root)**, then **Save**.
4. Wait ~1 minute. Your live URL will be:

   **https://haleluber13-dot.github.io/WorkApp/**

Because the app embeds third‑party live players (YouTube, Twitch, etc.), host it
on a real web server like Pages — a sandboxed preview that blocks cross‑site
embeds will show the shell but not the feeds.

## Camera data pipeline

`tools/harvest.py` fetches public, keyless camera directories from many countries
and writes one static `data/cameras.json` that the app loads same-origin.

This design exists because **most government camera APIs send no CORS header**, so
a browser cannot fetch their camera lists at all. Harvesting server-side sidesteps
that: the browser only loads the **images**, and images never require CORS.

```bash
python3 tools/harvest.py            # all sources
python3 tools/harvest.py finland    # one source
```

Sources whose image URLs expire (Singapore's per-refresh UUIDs, Estonia's
timestamped paths) are marked `bundle=False` and fetched live in the browser
instead — both send CORS headers.

Adding a country: write one `@source("name")` function returning `cam(...)`
records, then re-run. Reprojection helpers are available for national grids
(`_reproject("EPSG:3346")`); install `pyproj` for those sources.
