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
- **Cars** get a real silhouette per body style — bonnet line, screen rake and
  tail — with wheel arches cut through and an inset glasshouse.

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
vendor/three/         bundled three.js + OrbitControls
js/
  main.js             shell: workspaces, 3D model loading, keyboard, HUD
  viewport.js         three.js scene, picking, ghosting, explode, cutaway, labels
  ui.js               DOM helpers, charts, torque dial, world map
  store.js            state, settings, persistence, units
  game.js             XP, levels, credits, achievements, challenges
  updates.js          the self-update channel
  lib/geo.js          geometry + material toolkit
  data/               engines, part trees, vehicles, upgrades, curriculum,
                      electrical, races, news
  sim/                ecu.js (tables, knock, auto-tune), engineSim.js (physics),
                      dyno.js (dyno, acceleration, lap time)
  build/              engineModel.js, vehicleModel.js — procedural 3D
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
