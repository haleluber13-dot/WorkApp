# OlaKai

**Ola** = life. **Kai** = the sea. Every surf cam in the catalog running at once,
the conditions under each one, everything worth knowing about the place, and the
cheapest and fastest ways to get there.

Android, Kotlin, Jetpack Compose. Builds to an installable APK with no accounts
and no API keys.

<p align="center">
  <img src="tools/icon/store/play-icon-512.png" width="160" alt="OlaKai icon">
</p>

---

## What it does

**The Wall** — every live cam in the catalog side by side. Search, sort by what
is firing right now, by distance, or A–Z, and tap any tile to focus it. Each tile
carries the spot name, where it is, and the live numbers: wave height, period,
wind.

**Spots down the side** — all 60 places in the catalog, each with a colour bar
for its current score and a one-line reading. On a phone this becomes the
list you reach from any tile; on a tablet or in landscape it is a permanent rail.

**Focus** — one cam full width with sound and controls, the full conditions strip
(wave, period, swell direction, wind, gusts, tide, water and air temperature),
and everything about the place: how it breaks, what the bottom is, who it suits,
the swell/wind/tide/season it wants, the hazards, and a line of local knowledge.

**Atlas** — every spot on a world map, coloured by how it is doing right now.
Drawn on a Canvas from a bundled coastline file, so it needs no map SDK, no API
key, and no tiles.

**Settings** — metres or feet, and how many cams may decode at once (the "N live"
chip on the wall). Turn it down if the wall stutters, up if your phone can take
it.

**Trip** — for any spot: the destination airport, then the **cheapest**, the
**fastest**, and the **best value** way to get there. A slider moves the trade
between money and time and the best-value pick re-ranks instantly. Deep links
hand off to Google Flights, Skyscanner, Kiwi and Kayak to confirm the real fare.

## Live data, and where it comes from

| What | Source | Key needed |
|---|---|---|
| Wave height, period, swell direction, sea level | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) | No |
| Wind, gusts, air temperature | [Open-Meteo Forecast](https://open-meteo.com/en/docs) | No |
| Live cams | YouTube live embeds, pinned per channel | No |
| Airports (4,007 with IATA + scheduled service) | [OurAirports](https://ourairports.com/data/), public domain | No |
| Coastlines | Natural Earth 110m land, public domain | No |
| Flight fares | Amadeus Self-Service, or the built-in estimator | Optional |

Both Open-Meteo endpoints take comma-separated coordinate lists and answer in
request order, so the whole wall refreshes in **two HTTP calls**, not two per
spot. Conditions refresh on open and every ten minutes after.

## About the cams — read this

The catalog ships **32 verified cams across 21 spots**, not 60. That is
deliberate:

- Commercial cams (Surfline and similar) are **not embeddable**. The app does not
  scrape or re-stream them. Where a spot has no embeddable feed, it links out to
  the operator instead of faking a stream.
- Every bundled cam was resolved from a **live** YouTube stream, checked for
  public embeddability via oEmbed, and then **hand-checked against the spot it is
  filed under**. The resolver's false positives — a Bay Bridge camera surfacing
  for Ocean Beach, a bar called "Bondi" in Koh Samui — were dropped rather than
  shipped.
- Cams are pinned to a **channel**, not a video id. At playback time the app
  resolves the channel's current broadcast from its own `/live` page and embeds
  that concrete video, so an operator restarting their stream does not kill the
  tile. It will only accept an id that came from a watch page — when a channel
  is offline YouTube serves an ordinary channel page whose first video is a
  recommendation, and a random video in a surf cam tile is worse than a stale
  one.

Spots with no cam still have everything else: live conditions, the full write-up,
the travel board, and links to Windy's webcam map and Surfline for that location.

To re-resolve cams (they do come and go):

```bash
python3 tools/resolve_cams.py --out /tmp/cams.json   # search + verify candidates
# review /tmp/cams.json, then curate into app/src/main/assets/cams.json
```

### Fixing cams without shipping an update

Point the app at a hosted `spots.json` and it supersedes the bundled catalog on
launch:

```properties
# local.properties
catalog.url=https://example.com/olakai/spots.json
```

The download is parsed before it is persisted, so a truncated response cannot
brick the spot list, and any failure falls back to the bundled copy silently.

## Flights

`FlightProvider` has two implementations:

- **`AmadeusFlightProvider`** — real fares. Optional. Add credentials to
  `local.properties` (git-ignored):
  ```properties
  amadeus.clientId=your-id
  amadeus.clientSecret=your-secret
  ```
- **`EstimateFlightProvider`** — always available, no key. Models fare and block
  time from great-circle distance, airport size, season and booking lead time,
  and produces several routings so the cheapest/fastest/best-value trade is real.
  **Every number it produces is flagged `isEstimate` and the UI labels it.**

"Best value" normalises price and duration across the board and minimises a
weighted blend of the two — the slider *is* that weight. All three picks link
straight out to a booking site so the real price is one tap away.

## Build

Needs JDK 17+ and the Android SDK (compileSdk 35, minSdk 26).

```bash
./gradlew testDebugUnitTest    # 15 unit tests
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease      # minified, debug-signed so it installs as-is
```

`assembleRelease` is signed with the debug key on purpose, so the APK is
installable out of the box. **Replace `signingConfig` in `app/build.gradle.kts`
with a real keystore before publishing anywhere.**

CI (`.github/workflows/android.yml`) runs the tests and uploads both APKs on
every push.

## Layout

```
app/src/main/
  assets/
    spots.json          60 spots: place data, hazards, seasons, airports
    cams.json           32 curated, verified live cams
    airports.json       4,007 airports with IATA codes and coordinates
    world_land.json     simplified coastlines for the Atlas
  java/com/olakai/app/
    data/
      model/            Spot, Cam, Conditions, Airport, FlightOption
      catalog/          SpotRepository (assets + remote override), WorldMap
      marine/           MarineRepository — batched Open-Meteo calls
      flights/          FlightProvider, Amadeus, estimator, ranking, deep links
    ui/
      wall/             the live wall and its view model
      focus/            one spot, full screen
      travel/           cheapest / fastest / best value
      atlas/            Canvas world map
      components/       cam tiles, live video, chips, the spot rail
      theme/            colours, type, the score palette
tools/
  build_catalog.py      regenerates spots.json
  resolve_cams.py       finds and verifies live cams
  icon/make_icon.py     generates the icon — SVG and Android vectors from one source
```

## Performance

A wall of live video is the whole idea, and also the thing most likely to make a
phone stutter. Only the first *N* tiles hold a decoder — two by default, raisable in Settings.
Each live tile is its own renderer process and hardware video decoder instance,
and phones cap concurrent decoders lower than you would expect; past the cap
extra tiles simply render black. Everything past the budget renders a still
card, so fifty cams cost what two do.

The embed is loaded as a **top-level navigation** to `youtube.com/embed/<id>`,
never as an iframe inside a `data:` document — the latter leaves the page on an
origin the IFrame player refuses to run on, which is the classic cause of a
black embed in Android WebView. Everything autoplays muted, because browsers
refuse to autoplay audible video at all.

## Licensing and attribution

Cams remain the property of their operators and are shown through the official
YouTube embedded player, with the operator credited on the focus screen and a
link back to their channel. Airport data is from OurAirports (public domain);
coastlines are Natural Earth (public domain); marine and weather data are from
Open-Meteo (CC BY 4.0). Check each operator's terms before distributing this app
publicly.
