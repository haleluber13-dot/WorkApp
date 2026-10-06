# Surface map credits (lite tier)

These are the 256 px copies of `../surfaces/`, for the single-file offline build. Same sources, same licence.

Every map in this folder (and its 256 px twin in `../surfaces-lite/`) is
derived from a material published by **ambientCG** (https://ambientcg.com),
released under **CC0 1.0 Universal** (public domain, https://creativecommons.org/publicdomain/zero/1.0/).
No attribution is required; it is given anyway.

Prepared with `tools/fetch-surfaces.py`: the 1K JPEG set is downloaded, the
normal is rebuilt from the shipped normal plus slopes from the displacement map,
the roughness map is levelled to the real surface's value, and both are written
at 512 px (here) and 256 px (lite).

| Files | Source asset | Licence | Dresses |
|---|---|---|---|
| `cast_*` | [Metal039](https://ambientcg.com/a/Metal039) | CC0 1.0 | sand-cast aluminium: heads, covers, housings (`MAT.alloy`, `MAT.cast`, `MAT.alloyDark`) |
| `iron_*` | [Metal040](https://ambientcg.com/a/Metal040) | CC0 1.0 | cast iron: blocks, iron heads, manifolds (`MAT.iron`) |
| `rust_*` | [Metal021](https://ambientcg.com/a/Metal021) | CC0 1.0 | heat-cycled iron with a rust bloom: exhaust manifolds (`MAT.ironHot`) |
| `hot_*` | [Metal053C](https://ambientcg.com/a/Metal053C) | CC0 1.0 | heat-scaled steel: headers, turbine housings (`MAT.hot`) |
| `machined_*` | [Metal011](https://ambientcg.com/a/Metal011) | CC0 1.0 | fine tool marks: machined faces, fittings, chrome polish lines (`MAT.machined`, `MAT.anodised`, `MAT.chrome`, `MAT.rimAlloy`) |
| `steel_*` | [Metal009](https://ambientcg.com/a/Metal009) | CC0 1.0 | brushed steel: fasteners, shafts, springs, stainless (`MAT.steel`, `MAT.stainless`, `MAT.black`) |
| `forged_*` | [Metal019](https://ambientcg.com/a/Metal019) | CC0 1.0 | forged steel with dark scale: cranks, rods (`MAT.forged`) |
| `zinc_*` | [Metal037](https://ambientcg.com/a/Metal037) | CC0 1.0 | galvanised spangle: plated and yellow-zinc hardware (`MAT.plated`, `MAT.zincYellow`) |
| `powder_*` | [Metal027](https://ambientcg.com/a/Metal027) | CC0 1.0 | black powder coat (`MAT.satin`) |
| `wrinkle_*` | [Paint001](https://ambientcg.com/a/Paint001) | CC0 1.0 | wrinkle enamel on cam covers — normal and roughness only (`MAT.wrinkle`) |
| `braid_*` | [Chainmail001](https://ambientcg.com/a/Chainmail001) | CC0 1.0 | stainless braid over PTFE hose (`MAT.braid`) |
| `rubber_*` | [Rubber004](https://ambientcg.com/a/Rubber004) | CC0 1.0 | hoses, belts, mounts, tyres (`MAT.rubber`, `MAT.damperRubber`) |
| `plastic_*` | [Plastic013A](https://ambientcg.com/a/Plastic013A) | CC0 1.0 | glass-filled nylon covers, coils, connectors (`MAT.plastic`, `MAT.composite`, `MAT.connector`, `MAT.conduit`) |
| `leather_*` | [Leather030](https://ambientcg.com/a/Leather030) | CC0 1.0 | interiors |
| `asphalt_*` | [Asphalt031](https://ambientcg.com/a/Asphalt031) | CC0 1.0 | the ground |

`brushed_*`, `paint_*` and `floor_*` are generated in-house, not scans.

Sizes: full tier 512 px JPEG per map (about 2.5 MB for the folder); lite tier
256 px JPEG (about 0.6 MB). The lite files keep the full-tier names because
`tools/build-single.mjs` swaps them in by name and takes the MIME type from
that name, which is also why they are JPEG rather than WebP.
