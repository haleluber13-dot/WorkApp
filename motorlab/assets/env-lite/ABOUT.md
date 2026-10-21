# Environments

Two equirectangular HDR environment maps from **Poly Haven** (polyhaven.com),
released under **CC0 1.0** — public domain, no attribution required. Credited
anyway, because it is the decent thing to do.

| File | Source | What it is |
|---|---|---|
| `garage.hdr` | `auto_service` | A real car service bay, lit by its own strip lights. The default. |
| `studio.hdr` | `studio_small_08` | A clean photographic studio, for looking at a build rather than working on one. |

## Why this matters more than it sounds

Chrome, clearcoat paint and glass do not look like anything on their own — they
look like whatever they are reflecting. A procedurally generated room gives soft
studio light and nothing to reflect, so a polished rim comes out as a grey
gradient. A photographed environment gives it the strip lights, the roller door
and the far wall, and it reads as metal.

Both are prefiltered once through three.js's PMREM generator into a radiance
map, then simply used. **Settings → Lighting** switches between them and the
generated room, which is also what everything falls back to if the files are
missing.

## How they were prepared

    python3 tools/hdr2small.py auto_service_1k.hdr assets/env/garage.hdr --width=512

The 1K originals are about 1.5 MB each. `hdr2small.py` decodes Radiance RGBE to
linear float, box-filters it down and re-encodes with run-length compression —
409 KB and 289 KB respectively. The map goes through a prefilter before anything
sees it, so the resolution lost is resolution that was going to be blurred away.

Each is scaled by a per-environment gain in `viewport.js`, because a photograph
of a room arrives at whatever brightness that room happened to be.
