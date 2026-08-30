# 🔧 MotorLab — virtual engine & vehicle build lab

Strip an engine to the bare block bolt by bolt, put it back together in the right
order with the right torque sequence, build the chassis under it, wire it, tune
the ECU, then find out on the dyno whether you got it right.

Everything in MotorLab is **generated from a specification**, not modelled by
hand: the 3D geometry, the part list, the assembly order, the torque figures and
the physics all come from the same set of numbers. Add an engine to the catalog
and you get its 3D model, its teardown, its torque sheet and its dyno curve for
free.

## What's in it

**35+ engines** across every architecture — inline 3/4/5/6, V6, V8 (cross- and
flat-plane), V10, V12, W16, flat-4 and flat-6, two- and three-rotor Wankels,
four-cylinder and six-cylinder diesels, carburetted big blocks, an F1-style 1.6
turbo hybrid V6, a rally engine with anti-lag, a nitro-burning supercharged hemi,
and motorcycle singles, twins, triples, fours and V4s.

**16+ vehicles** — hot hatch, sports sedan, rear-drive coupe, mid-engine
supercar, rally car, heavy-duty pickup, Class-8 truck, drift car, formula car,
stock car, top-fuel dragster, superbike, cruiser, adventure tourer, motocross
bike and a shifter kart.

**Nine workspaces**

| Workspace | What you do there |
|---|---|
| **Garage** | Pick the machine and the engine. Compare any engines on the same axes. |
| **Engine Bay** | Strip and rebuild in 3D. Every joint has a real torque figure, stage sequence and bolt pattern. |
| **Chassis** | Subframes, wishbones, struts, uprights, anti-roll bars, brakes, driveshafts, diff, wheels. |
| **Upgrade Shop** | ~60 real aftermarket parts — turbos, blowers, cams, head work, fuel systems, suspension, tyres, aero. |
| **Tuning** | Fuel (λ) and ignition tables over rpm × load, boost, limiters, knock control, auto-tune. |
| **Dyno & Track** | Power and torque curves, 0–100, quarter mile, top speed, lap-time estimates. |
| **Electrical** | Circuit boards you can trace, injected faults to diagnose, and proper wire sizing. |
| **Audio & 12 V** | Build a system and keep it inside the alternator's budget. |
| **Learn** | 23 lessons, 38 quiz questions, 18 achievements and 11 build challenges. |
| **Racing** | Every discipline in the world on a map, with a calendar and what each one demands. |
| **News & Updates** | New cars, bikes, engines and tech — and the channel the app updates itself from. |
| **Settings** | Units, 3D quality, ambient conditions, difficulty, game mode, save import/export. |

## Real models, taken apart panel by panel

Where a proper vehicle model exists, MotorLab uses it instead of generating one —
and maps the model's own pieces onto part ids, so the teardown works on the real
bodywork. Three of them ship in the catalog:

- **NASCAR stock car** — front clip, rear clip, wheel arches, door skins, quarter
  panels, roof, hood, deck lid, glass and window net all come off separately, over
  a welded tube frame with the engine and cage underneath.
- **Carbon hypercar** — a carbon tub with the painted panels, the exposed carbon
  aero, the glazing, the lights and the cabin each lifting off on their own.
- **Custom V-twin cruiser** — strip it to the backbone frame and the V-twin, then
  put the chrome, the tank, the wheels and the trim back on.

Each wheel is re-centred on its own hub so it turns and steers correctly, and the
paint can be switched from the Garage. `SCANNED` in
[`js/build/scannedVehicle.js`](js/build/scannedVehicle.js) is where a model is
registered: either by naming its objects (`map`) or, when a file names its pieces
after their material, by working the part out from the material and where the
piece sits on the vehicle (`classify`).

See each folder's `ABOUT.md` — [nns](assets/nns/ABOUT.md),
[koenigsegg](assets/koenigsegg/ABOUT.md), [harley](assets/harley/ABOUT.md) — for
provenance, trademarks and the exact conversion command used.

### Real light

Chrome, clearcoat paint and glass do not look like anything on their own — they
look like whatever they are reflecting. `assets/env/` holds two equirectangular
HDR environment maps from **Poly Haven** (CC0): a real **auto service bay** and a
photographic **studio**. They are prefiltered into radiance maps and light the
whole scene, so a polished rim reflects strip lights and a roller door instead of
a grey gradient. **Settings → Lighting** switches between them and the generated
room, which is also the fallback.

This is the single biggest visual lever in the app, and it costs 700 KB — see
[`assets/env/ABOUT.md`](assets/env/ABOUT.md).

### Scanned surfaces, on everything

Geometry is only half of it. `assets/surfaces/` holds photogrammetry-scanned
PBR maps from **ambientCG** (CC0) that carry the micro-detail a generated
material cannot invent: the grain of a sand casting, the tool marks on machined
steel, the heat scale on an exhaust, the tooth of rubber. They dress
`MAT.alloy`, `MAT.alloyDark`, `MAT.iron`, `MAT.steel`, `MAT.hot`, `MAT.rubber`,
`MAT.plastic`, `MAT.chrome` and `MAT.rimAlloy`, so every engine and vehicle in
the catalog gets a real surface, not just the scanned components. Body paint
gets a scanned **orange peel** on its clearcoat — the faint ripple every sprayed
panel has, and the reason a real car reflects the world slightly unevenly. The
workshop floor under the model is a scan of real concrete.

Metals take only the normal and roughness maps, so MotorLab keeps its own
palette — a cast aluminium block should not turn the colour of whatever lump the
photographer happened to scan. All twenty-one maps together come to about
260 KB; see [`assets/surfaces/ABOUT.md`](assets/surfaces/ABOUT.md).

### Scanned parts, on the generated vehicles too

`assets/parts/` holds photographic maps taken off real hardware, and they dress
the **generated** parts, so every car in the catalog benefits and not just the
modelled ones: a cross-drilled, coated disc face; a six-pot caliper with its own
normal map; a carbon weave on the aero, the tub and the undertray; a real tyre
sidewall pinned rim-seat to shoulder so the moulded lettering lands where it does
on the tyre; and a pleated filter element on the inlet. The tread pattern is drawn
over the scanned rubber, because the scan came off a slick — road, slick and
knobby patterns are generated to match what the vehicle actually runs.

Delete `assets/parts/` and everything falls back to the generated materials it had
before; see [`assets/parts/ABOUT.md`](assets/parts/ABOUT.md).

### Scanned components

Some parts cannot be faked. A cast engine block is a landscape of webs, bosses
and draft angles; an alloy wheel is a shape somebody spent months styling; a
turbine wheel is eleven twisted blades. You do not get those from maths.

So ten real 3D scans ship in `assets/scans/`, and each one replaces a generated
stand-in where the generated version could never be honest:

| Scan | Replaces |
|---|---|
| Alloy road wheel | The rim inside every car and bike wheel |
| Four-cylinder engine | The engine in the Chassis workspace |
| Motorcycle engine | The engine on every generated motorcycle |
| Dual-clutch gearbox | The gearbox in the Chassis workspace |
| Water pump | The pump housing on every engine |
| Camshaft timing gear | The cam sprocket on every engine |
| Turbocharger turbine wheel | The hot side of every turbo |
| Radiator grille | The nose of every generated car |
| Manual transmission | The gearbox on longitudinal cars (the DCT goes on transverse ones — two different parts) |
| Motorcycle wheel | Available to any builder that wants it |

The tyre around a scanned rim stays generated, because it has to size itself to
the vehicle's spec; the water pump's pulley stays generated, because it has to
turn with the belt; and the Engine Bay's strip-down still runs on the generated
engine, because every casting there has to come apart on its own. The scans go
where a part is one solid thing.

They are registered in [`js/lib/partModels.js`](js/lib/partModels.js), load once
at boot, and every caller keeps its fallback so the app still runs with the
folder deleted.

All ten are scans by **Artec 3D**, used under CC BY 3.0. That licence requires
credit and a statement of changes: the credit is shown in the app under
**Help → Credits**, the licence text ships beside the models, and the exact
reduction applied to each is recorded in
[`assets/scans/ABOUT.md`](assets/scans/ABOUT.md). The originals run from 2 to 10
million triangles; what ships is between 0.2% and 2% of that.

### Real parts, not primitives

Everything else is still generated — but generated as the part, not as a box
standing in for it:

| Part | What it is built from |
|---|---|
| Spark plug | Terminal nut and stem, a five-rib alumina insulator, the hex, a real rolled thread wound as a helix, the centre electrode and the ground strap bent over the gap |
| Ignition coil | Pencil coil: connector with its pins, the body, and the rubber boot that reaches down the plug well onto the terminal |
| Turbocharger | Two volute scrolls — a cross-section swept round a spiral whose tube grows as it wraps, so the inner wall stays on the wheel and the outer wall opens out — with the tangential throats, the axial mouths, the bearing housing, its oil feed and drain, and the scanned turbine |
| Cam cover | A swept cross-section with a raised centre, a bolt rail with a boss and a bolt at every fixing, and the oil filler |
| Oil pan | Drafted sides, a bolt flange, a sump kick-out at the pickup end and the drain plug in the bottom of it |
| Crank damper | Six V-rib pulley grooves, the bonded rubber ring, the hub bolt circle and the crank bolt |
| Flywheel | Friction face, bolt circle, and a starter ring gear with real teeth |
| Clutch | Pressed cover, and eighteen diaphragm spring fingers |
| Water pump | Volute housing, hose snout, and the drive pulley that turns with the belt |
| Port flange | The plate the manifold bolts to, ports opened through it, studs between them |
| Velocity stack | A radiused bellmouth, on every individual throttle of a high-revving atmospheric engine |
| Air filter | A pleated element, off a real one |
| Compressor wheel | Seven full blades and seven splitters, each a swept surface that starts axial at the inducer and finishes backswept at the exducer — the shape that makes one |
| Alternator | Front and rear housings cast as a ring of webs with the cooling slots between them, the stator laminations showing, four through-bolts, the mounting eye and pivot lug, the regulator pack, the B+ post and a black six-groove pulley |
| Supercharger | The twin-rotor case with its fin comb, the manifold plate and its bolt line, the front bearing plate, snout and drive pulley, and the throttle elbow |
| Intercooler / radiator | A bar-and-plate matrix — a charge bar, then a folded fin block, repeated — with cast end tanks and the hose necks on them |
| Oil filter | A rolled can with its ribs, the base plate and the seal |
| Serpentine belt | The outer tangent path around the crank, water pump, alternator, idler and tensioner, solved as a convex hull so it runs the way a real one does |

### The conversion tools

| Tool | What it does |
|---|---|
| `tools/tga2png.py` | TrueVision TGA (types 2, 3, 10, 11) to PNG — fixes BGR order and bottom-left origin |
| `tools/tds2obj.py` | Autodesk `.3DS` to OBJ + MTL, Z-up to Y-up, one object per material |
| `tools/obj2glb.py` | OBJ + MTL to binary glTF: scale, offset, clip stray faces, weld, drop unused UVs |
| `tools/wrl2obj.py` | VRML 2.0 `IndexedFaceSet` (what a 3D scanner exports) to OBJ |
| `tools/scan2glb.py` | Any raw scan (PLY, STL, OBJ, VRML) to a web-sized binary glTF: decimate to a triangle budget by vertex clustering, scale to real size, trim strays |
| `tools/resize-maps.mjs` | Downscale and re-encode PBR maps by driving a headless browser's canvas — there is no image library here |
| `tools/hdr2small.py` | Downscale a Radiance HDR environment map: decode RGBE to linear, box-filter, re-encode run-length |

All three are pure standard-library Python 3 — no build step, no dependencies.

## Bring your own vehicle model

The models above were supplied by the repository owner. MotorLab does not go and
fetch scans of its own: the good ones are licensed work — from the studios that built them and, for production cars, from
the manufacturers whose designs they are — and redistributing them is not ours
to do. Owning a game that contains them is a licence to play that game, not a
licence to reuse its assets.

What the app does instead is take a model **you** are entitled to use.
**Settings → Bring your own model** accepts a `.glb` or `.gltf`. It is scaled to
the vehicle's real length, sat on the ground and used as the shell, with the
generated chassis, subframes, suspension, brakes and drivetrain still underneath
it where you can strip and rebuild them. It is stored in the browser's IndexedDB
so it survives a reload, and it never leaves the device.

Places to get one legitimately:

- **Scan a real car yourself** with a phone — Polycam, RealityScan or Scaniverse
  all export glTF. This is the genuine article: a real scan of a real car, and
  entirely yours.
- **Sketchfab**, filtered to Creative Commons or CC0 — thousands of vehicles,
  many of them photogrammetry, downloadable as glTF.
- **CC0 asset libraries** such as Quaternius and Kenney for stylised vehicles.
- **Manufacturer press and configurator releases**, where the terms allow it.

## The parts and the motion are the lesson

Nothing here is a box standing in for a component. Every part is drawn from the
profile the real one has, because the shape is usually the explanation:

- **Pistons** are revolved from a real profile — domed or dished crown, three
  ring grooves in the right places, a tapered skirt and pin bosses.
- **Connecting rods** are I-beams with a big end, a small end and the flanges
  that stop them buckling.
- **Crankshafts** have main journals, rod throws and cast counterweights sitting
  opposite the pin, arranged at the angles the firing order actually demands.
- **Cam lobes** are real harmonic lobes — a base circle with a nose — and the
  lobe you can see is the lobe doing the lifting. **Valves** are tulip-headed
  poppets with 45° seat faces and springs that visibly compress.
- **Turbochargers** have spiral volutes and bladed compressor and turbine wheels
  on a shared shaft.
- **Wheels** are built the way a wheel is: a tyre lathed from a real section
  with a bulging sidewall, shoulder and tread blocks; a rim barrel with bead
  seats and lips; a spoke face set at the outer edge where you actually see it;
  a hub and five studs. Axle across the car, dish facing out.
- **Brakes** are vented discs with a top hat and drilled faces, and multi-piston
  calipers straddling them — behind the axle at the front, ahead of it at the rear.
- **Turbochargers** have a turbine housing, a bearing housing with oil feed and
  drain, a compressor cover, both outlets, and a shaft carrying both wheels.
  Sized from displacement and boost, so a big single on a 2-litre is visibly
  enormous next to twins on a V8.
- **Intercoolers and radiators** are cores: end tanks, a tube-and-fin matrix and
  rails, with charge pipes routed from the compressor round to the throttle.
- **Alternators** have a stator case with cooling slots, a drive pulley, an
  internal fan and a B+ post. **Starters** have a solenoid, nose cone and pinion.
- **Cylinder heads** are 1.3 bores tall with intake and exhaust port bosses on
  their respective faces and spark plug wells sunk into the casting.
- **Cars** are lofted surfaces, not extrusions: 56 cross-sections along the
  length, each a superellipse with its own width, roof height, sill height and
  tumblehome, flared into hips over the wheels and scalloped into wheel arches.
  Paint is a metallic base under a clearcoat; the glazing is separate.

And the rendering matters as much as the geometry. Lighting is image-based —
the scene carries an environment map, so metal has something to reflect. Without
it, a perfectly correct aluminium casting renders as grey plastic, which is the
single biggest reason CG parts look fake. Cast surfaces carry sand-cast grain,
machined faces carry tool marks, rubber is matte and unreflective, and painted
parts get a clearcoat. Ambient occlusion and bloom are available on the High
quality tier, and if a device cannot run that pipeline the app detects the empty
frame and falls back on its own.

The motion is derived, not looped:

- Crank–slider kinematics, with each cylinder phased by **where it sits in the
  firing order** over the full 720° cycle. Watch a V8 and you can read its firing
  order off the pistons.
- Valve lift comes from the **cam lobe profile at its current angle**, so the
  nose visibly pushes the valve open — and on a pushrod engine the lifter,
  pushrod and rocker all follow it.
- **Combustion flashes in firing order**, drawn through the casting so you can
  see which cylinder is on its power stroke.
- **Engine shake** is computed from the layout's primary and secondary
  imbalance: a big single hammers, an inline-6 barely moves, a flat-plane V8
  buzzes where a cross-plane one does not.
- Starting is a **sequence**: the starter drags it over, it catches and flares,
  then settles to a hunting idle. After that the flywheel's inertia governs how
  fast it picks up revs — a race engine snaps, a truck diesel takes its time.
- The **turbo shaft lags** behind the engine, spooling up and coasting down.
- Vehicles get wheel rotation, steering, per-corner suspension travel over the
  road surface, and squat and dive under acceleration and braking.

**Part names appear when you touch a part** — hover or select — rather than
covering the model in labels. The 🏷 button pins them all when you want the map.

Press **C** for a cutaway: it sections the castings and leaves the crank, rods,
pistons, cams and valves whole inside the cut, like a museum display engine.

## The simulation

Torque comes from mean effective pressure, which comes from how much air the
engine breathes, how dense that air is, how well the mixture burns and how much
friction it drags:

```
T [Nm] = Vd · BMEP / (2π · revsPerCycle)
BMEP   = IMEP − FMEP
IMEP   = imepRef · VE · densityRatio · η(mixture) · η(timing) · headFlow
```

So every part and every table entry moves a term you can point at:

- **Camshafts** change volumetric efficiency and where it peaks.
- **Turbos** change the pressure ratio and when it arrives; **intercoolers**
  change charge density *and* knock margin.
- **Lambda** moves combustion efficiency (best power near λ 0.88) and knock
  resistance; **ignition advance** is measured against MBT.
- **Detonation** is modelled from compression, boost, intake temperature,
  advance, mixture and fuel — including the charge-cooling advantage of E85 and
  methanol, direct injection, and pre-chamber jet ignition.
- **Friction** follows a Chen-Flynn form, so long-stroke engines lose top end
  the way real ones do.
- **Restrictors, fuel-flow limits and injector duty** cap power the way rulebooks
  and hardware really do.

Vehicle performance integrates that torque curve through the gearbox against
mass, aerodynamic drag, downforce and a traction limit with weight transfer — so
a dragster is traction-limited off the line and a formula car is not.

The figures land close to real published numbers for the archetypes they
represent, but this is a **teaching simulation**, not a replacement for a dyno,
a workshop manual or a real torque spec.

## Run it

Static site, no build step:

```bash
python3 -m http.server 8099
# then open http://localhost:8099/motorlab/
```

Three.js is bundled locally in `vendor/`, so it works on a restricted network and
offline. It is installable as a PWA.

### One file, no server

To get a single HTML file you can double-click, email to yourself or carry on a
USB stick — three.js, every module, the coastline data and the update feed all
inlined:

```bash
npm install esbuild
node motorlab/tools/build-single.mjs motorlab-offline.html
```

That file needs no server and no network. It keeps your progress in the
browser's local storage like the hosted version does.

## It updates itself

`data/updates.json` is an update feed. Publish a newer version of that file and
every installed copy merges the new content on its next check — new cars, bikes,
engines, tuning parts, circuits, race series and news:

```json
{
  "version": 2,
  "published": "2026-09-01",
  "engines": [ { "id": "...", "name": "...", "bore": 86, "stroke": 86, ... } ],
  "vehicles": [ ... ], "upgrades": [ ... ], "races": [ ... ], "news": [ ... ]
}
```

Anything merged is stored on the device, so it keeps working offline. You can
point the app at a different feed in **Settings → Updates**, or add your own
vehicles and engines by hand in **News & Updates → Add your own** — they get a
generated 3D model, part tree and dyno curve like everything else.

Feed entries are plain data. Upgrade fitment is declared with a small object
(`{"boosted": true, "maxCyl": 4}`), never as code, so a feed can never execute
anything in your browser.

## Project layout

```
index.html            app shell
styles.css            workshop theme
sw.js                 service worker (offline)
data/updates.json     the update feed
data/world_land.json  coastlines for the racing map
assets/parts/         scanned part maps: disc, caliper, carbon, tyre, filter
assets/scans/         ten scanned components: engines, wheel, gearbox, pump…
assets/surfaces/      scanned PBR surfaces: cast, steel, hot, rubber, paint, floor…
assets/env/           photographed HDR lighting: a service bay and a studio
assets/nns/           NASCAR stock car model
assets/koenigsegg/    carbon hypercar model
assets/harley/        custom V-twin cruiser model
tools/                tga2png.py, tds2obj.py, wrl2obj.py, scan2glb.py,
                      obj2glb.py, build-single.mjs
vendor/three/         bundled three.js + OrbitControls + OBJ/MTL/GLTF loaders
js/
  main.js             shell: workspaces, 3D model loading, keyboard, HUD
  viewport.js         three.js scene, picking, ghosting, explode, cutaway, labels
  ui.js               DOM helpers, charts, torque dial, world map
  store.js            state, settings, persistence, units
  game.js             XP, levels, credits, achievements, challenges
  updates.js          the self-update channel
  lib/geo.js          geometry + material toolkit
  lib/textures.js     the scanned part maps, loaded once at boot
  lib/partModels.js   the scanned components, loaded once at boot
  lib/importModel.js  bring-your-own .glb import and persistence
  data/               engines, part trees, vehicles, upgrades, curriculum,
                      electrical, races, news
  sim/                ecu.js (tables, knock, auto-tune), engineSim.js (physics),
                      dyno.js (dyno, acceleration, lap time)
  build/              engineModel.js, vehicleModel.js — procedural 3D
                      scannedVehicle.js — the real models and their part maps
  workspaces/         one module per workspace
```

## Controls

| Key | Action |
|---|---|
| Left-drag / scroll / right-drag | orbit · zoom · pan |
| Click a part | select it and open its action menu |
| Right-click a part | action menu directly |
| `X` `C` `G` `L` `W` `F` | explode · cutaway · ghost · labels · wireframe · frame |
| `1`–`9` | jump between workspaces |
| `?` | help |

## Safety note

The workshop procedures described in the lessons are correct in principle, but a
simulation cannot see your vehicle. Support a vehicle on axle stands, relieve
fuel pressure before opening a line, never open a hot cooling system, and never
disassemble a spring or a strut without a proper compressor. Use the real
manufacturer torque specifications for real work.
