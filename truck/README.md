# 🚛 TruckWay — GPS that knows how tall you are

A navigation app for drivers of big vehicles. It plans a route with a **truck
profile** (height, width, length, weight, axle load, hazmat), then independently
**checks every bridge, weight limit, width limit and truck ban along that route**
against your actual dimensions — and shows you the diesel, truck stops, parking
and scales on the way, the weather you'll be driving into, and **which stop you
can still reach before your hours run out**.

Car navigation will happily send a 13'6" trailer under a 12'10" bridge. This
won't.

## Why it compares several engines

No single free routing service is both truck-aware and reliably available, so
TruckWay asks all of them at once and picks the best answer:

| Engine | Profile | Key | What it contributes |
|---|---|---|---|
| **Valhalla** (FOSSGIS public instance) | `truck` costing with height/width/length/weight/axle-load/hazmat | none | The main truck router |
| **OpenRouteService** | `driving-hgv` with the same restrictions | free key, optional | A second truck opinion to compare |
| **OSRM** (demo server) | car | none | Last-resort fallback, clearly labelled |

Every candidate route — from every engine — is then scored on the same terms:
legality first (a route with a conflict always loses to one without, however
much faster), then time, then your toll/ferry preferences, then distance. The
winner is selected automatically; you can override it by tapping another card.

If only the car engine answers, you still get a route, marked with a dashed line
and a "car profile" badge — and the restriction check still runs on it, which is
what makes that fallback usable at all.

## The restriction check

This is the part that matters, and it runs independently of whichever engine
produced the route.

For each route, TruckWay walks a corridor along the line and asks OpenStreetMap
for everything carrying `maxheight`, `maxweight`, `maxwidth`, `maxlength`,
`maxaxleload`, `hgv=no|destination|…`, `hazmat`, or a height-restrictor barrier.
Each hit is then:

1. **Parsed properly** — `13'6"`, `120000 lbs`, `5 st`, `4.1 m`, `110 cm` and
   bare numbers all mean different things, and getting that wrong is the whole
   ballgame. (`default`, `none` and `unsigned` are correctly treated as "no
   information", not as zero.)
2. **Matched to the route** — the way must genuinely run *along* your route, with
   real overlap and a matching heading. A low bridge crossing *over* the
   motorway you're on is somebody else's problem, not yours.
3. **Compared against your truck** — under your height is `critical`; within six
   inches of it is `tight` and still worth knowing about.
4. **Clustered** — OSM splits one road into dozens of ways, so a single truck ban
   becomes one entry that says "4 sections", not twelve identical rows. Where a
   run of bridges varies, the lowest span is the one reported.

Each finding links to its OSM object so you can check the source yourself.

Findings it is less sure of are marked **likely**. The main cause is parallel
carriageways: where express and local lanes run a few metres apart and in the
same direction — the Dan Ryan in Chicago is the classic case — no geometric test
can tell which one the route is on. It errs toward telling you, because a
warning you can dismiss at the split beats a fine you can't.

### On queries being fast enough to be usable

The obvious query — buffer the whole route and ask for anything with a
restriction tag — times out, because it makes the server materialise every
element in the corridor before filtering. TruckWay instead does a tag-indexed
bounding-box lookup first (which narrows a city to a few hundred tagged ways in
a couple of seconds), then applies the corridor filter to that small set, then
does the exact "is this really on my route" test in the browser against the true
polyline. Same answer, seconds instead of a timeout, and kilobytes instead of
megabytes over a cellular link.

Requests are also **hedged** across four public Overpass mirrors: if the first
hasn't answered in six seconds, the next one is raced alongside it, and the
first good answer wins.

### When it can't check

If the map service can't be reached, the route is reported as **unknown**, never
as clear, and the Warnings tab says so in as many words. A green tick you didn't
earn is the most dangerous thing an app like this could show.

Restriction data is OpenStreetMap: good on main roads in most countries, patchy
on minor ones. **The sign at the bridge is always the authority.**

## Fuel, and what the prices actually are

There is no free, global, live diesel price feed. Rather than pretend otherwise,
TruckWay is explicit about it:

- **Estimates** come from a regional reference table (`data/fuel-baselines.json`,
  104 regions), adjusted for the chain and road type. They are labelled `est.`
  everywhere they appear, and the panel says so in plain language.
- **Reported prices** — what you actually paid — always replace the estimate for
  that station, are marked `reported` with their age, and go stale after two
  weeks. They travel with your backup.
- Reference figures are **editable in Settings**, per region, so you can correct
  them for the lanes you run.

On top of that: cheapest and dearest on the route, the spread on a full fill,
detour cost charged honestly against the saving (a cheap sign 4 miles off route
often isn't cheap), and a greedy fill-up plan from your tank size, economy,
current level and reserve.

Because most "fuel" nodes in a city are forecourts a 53-footer can't get into,
the diesel list defaults to **truck-friendly only** and tells you how many
car-only stations it hid. The filter runs *before* ranking, so the cheapest
badge, the spread and the plan never point at a station you can't use.

## Hours, and where you're going to park

The clocks are the easy half. The question that actually matters at 7pm is
*which truck stop can I still reach* — asked early enough that the answer is a
parking space rather than a shoulder.

Set a rule set (US property-carrying, or EU 561/AETR) and TruckWay keeps the
driving, duty, break and cycle clocks, starting and stopping automatically with
navigation. Elapsed time comes from a timestamp rather than a ticker, so the
numbers stay right across a reload, a backgrounded tab, or a phone that slept
for four hours. Starting mid-shift, you can enter the hours already used.

Then it plans against the real stops on your route:

- The **binding clock** — whichever of break, driving, duty or cycle stops you
  first — sets the distance you have left.
- It picks the **latest stop you can comfortably reach**, not the nearest and
  not the best-appointed. Stopping 200 miles early for a shower throws away a
  third of the shift, so the safety margin is a steep preference rather than a
  hard cut-off: a stop ten minutes tight still beats one two hundred miles back.
- Where nothing suitable falls before the limit, it says so **and names the next
  one past it**, with how far past — which is the information you need to decide
  whether to push or park early.
- A break that would fall after you must already have parked isn't offered; the
  two collapse into one stop.

During navigation it warns an hour out, which is roughly the last point at which
choosing your stop is still a free choice.

These are the everyday limits. Split sleeper berth, adverse-conditions
extensions and short-haul exemptions aren't modelled, everything stays on the
device, and your log book is the record — not this.

## Weather you'll actually be driving in

Forecast sampled along the route **at the hour you're predicted to reach each
point**, not the weather now. Alerts are tuned for a high-sided vehicle:

- **Crosswind gusts** — the thresholds move with your height and weight, because
  an empty box trailer catches wind a loaded one shrugs off. The high threshold
  is where agencies start closing roads to high-sided vehicles.
- **Ice** — freezing precipitation, or near-zero with rain falling.
- **Snow, fog and heavy rain**, with visibility figures.

Neighbouring samples with the same problem collapse into one alert, so a
300-mile windy stretch is a single line. Gust warnings also appear in the
driving alert strip, behind physical restrictions — a low bridge is a fact and a
forecast is a forecast.

## Stops

Truck stops, truck parking, rest areas, scales and repair along the route, each
with its distance along the route, how far off it sits, and how far you'd still
have to go. **"Nearby"** answers the question that actually decides a stop —
what's within 500 m: restaurants, showers, toilets, ATM, laundry, motel, repair,
groceries.

## Navigation

- Big manoeuvre banner and the one after it, ETA / distance / time / speed.
- Voice guidance, timed to give you room (highway exits are called a mile out).
- **Restriction call-outs while driving** — a critical one is announced up to
  five miles ahead, because you need somewhere to turn a 73-foot vehicle around.
  An on-screen strip shows the next one continuously.
- GPS snapped to the route with a windowed search, off-route detection that
  requires several consecutive bad fixes (one bad fix between city buildings is
  normal), and automatic re-routing — after which **the new route is checked
  just as thoroughly as the old one**.
- Screen wake-lock, day/night/plain maps.

## Saved places, recent trips, and the paperwork

Star the yards and docks you go back to; recent trips refill both ends, not just
the destination.

**Miles by region** gives an IFTA-style per-state (or per-country) split of the
planned route. No free API will slice a line by administrative boundary, so it
walks the route with reverse geocoding: a coarse pass to find which
jurisdictions the route touches, then a bisection on each transition to pin the
crossing to within about a mile. That's a few dozen requests instead of
hundreds, paced to stay inside Nominatim's usage policy — which is why it takes
a minute and sits behind a button rather than running automatically. It's an
estimate from the planned route, not a record of where the truck went, and it
says so.

## Run it with no server and no hosting

If GitHub Pages is not available to you, build a single self-contained file and
open it by double-clicking:

```bash
python3 truck/tools/build-standalone.py          # writes truckway-standalone.html
```

The stylesheet, Leaflet, every module and the diesel reference table are inlined,
so the page needs nothing beside it. Everything it talks to at runtime — tiles,
routing, Overpass, geocoding, weather — sends permissive CORS headers, so it all
works from a `file://` origin exactly as it does when hosted. Verified from disk:
live Valhalla truck routing, the restriction audit, weather and the saved
profile all work. The only things a `file://` page gives up are the service
worker (so no offline app shell) and installing it as a PWA.

## Run it

Static site, no build step:

```bash
python3 -m http.server 8099
# then open http://localhost:8099/truck/
```

Serve it over http/https rather than opening the file directly, so the service
worker and geolocation behave. Installable as a PWA on phone and desktop.

To add the second truck engine, get a free key at
[openrouteservice.org](https://openrouteservice.org/dev/#/signup) and paste it
into Settings — it's stored only in your browser.

## Layout

```
truck/
  index.html              app shell
  styles.css              dark, large-target, in-cab theme
  manifest.webmanifest    PWA manifest
  sw.js                   offline app shell (never caches routes or tiles)
  data/fuel-baselines.json  editable regional diesel reference prices
  js/util.js              units, imperial/metric parsing, geometry, polylines
  js/profile.js           the truck: dimensions, presets, fuel, preferences
  js/services.js          routing engines, geocoding, hedged Overpass
  js/restrict.js          the restriction audit and route scoring
  js/poi.js               truck stops, parking, scales, "what's nearby"
  js/fuel.js              price model, reports, spread, fill-up planner
  js/hos.js               hours of service and the where-to-park planner
  js/weather.js           forecast along the route, crosswind thresholds
  js/places.js            saved places, recent trips, per-region mileage
  js/nav.js               turn-by-turn, voice, hazard call-outs, off-route
  js/map.js               Leaflet layers, markers, vehicle arrow
  js/ui.js                rendering
  js/app.js               controller
  tools/build-standalone.py  bundles the whole app into one openable .html
```

Leaflet is vendored locally so the app still starts on a restrictive network.
Bump `CACHE` in `sw.js` when app files change.

## Credits and limits

Map data © OpenStreetMap contributors. Routing by Valhalla (FOSSGIS),
OpenRouteService and OSRM. Geocoding by Photon and Nominatim. Weather by
Open-Meteo. Tiles from OpenStreetMap and CARTO. All are shared community
services — please don't point heavy automated traffic at them.

**TruckWay is an aid, not an authority.** It checks what the map knows about
your route. It cannot know about a temporary restriction, a sign put up last
week, a load that shifted, or a bridge OSM has never recorded. The hours clocks
are a planning tool, not a log book, and the fuel prices are estimates until you
report a real one. Drive to the signs.
