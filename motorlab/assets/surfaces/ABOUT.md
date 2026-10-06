# Scanned surfaces

Photogrammetry-scanned PBR material maps from **ambientCG** (ambientcg.com),
released under **CC0 1.0** — public domain, no attribution required. They are
credited in the app anyway, because it is the decent thing to do.

These carry the micro-detail a generated material cannot invent: the grain of a
sand casting, the tool marks on machined steel, the heat scale on an exhaust,
the tooth of rubber. They dress the *generated* parts, so every engine and
vehicle in the catalog gets a real surface, not just the scanned components.

| Surface | Source | Used by |
|---|---|---|
| `cast_*` | Metal039 | `MAT.alloy`, `MAT.cast`, `MAT.alloyDark` — sand-cast aluminium |
| `iron_*` | Metal040 | `MAT.iron` — cast-iron blocks and heads |
| `rust_*` | Metal021 | `MAT.ironHot` — exhaust manifolds, with the scan's rust colour |
| `hot_*` | Metal053C | `MAT.hot` — headers, turbine housings |
| `machined_*` | Metal011 | `MAT.machined`, `MAT.anodised`, `MAT.chrome`, `MAT.rimAlloy` |
| `steel_*` | Metal009 | `MAT.steel`, `MAT.stainless`, `MAT.black` — fasteners, shafts, springs |
| `forged_*` | Metal019 | `MAT.forged` — cranks and rods, with the scan's scale colour |
| `zinc_*` | Metal037 | `MAT.plated`, `MAT.zincYellow` — galvanised spangle, tinted |
| `powder_*` | Metal027 | `MAT.satin` — black powder coat |
| `wrinkle_*` | Paint001 | `MAT.wrinkle` — the baked skin of wrinkle enamel |
| `braid_*` | Chainmail001 | `MAT.braid` — stainless braided hose |
| `rubber_*` | Rubber004 | `MAT.rubber` — tyres, hoses, mounts, belts |
| `plastic_*` | Plastic013A | `MAT.plastic`, `MAT.composite`, connectors, conduit |
| `leather_*` | Leather030 | Loaded, available for interiors |
| `asphalt_*` | Asphalt031 | Loaded, available for the ground plane |

Metals mostly take only the **normal** and **roughness** maps, so MotorLab
keeps its own palette — a cast aluminium block should not turn the colour of
whatever lump the photographer happened to scan. Where the colour *is* the
material — rust bloom on a manifold, forging scale, zinc spangle, the knit of
a braid — the colour map is taken too, tinted by the material colour. Rubber,
plastic, leather and asphalt take the colour as well. Credits and licence:
`CREDITS.md`.

## How they were prepared

    python3 motorlab/tools/fetch-surfaces.py

downloads each set at 1K and writes two tiers: 512 px here, 256 px in
`../surfaces-lite/` under the same names, which `tools/build-single.mjs`
swaps in for the single-file offline build. ambientCG's procedural metals
ship a normal map that is nearly flat at 1K (the relief is in the
displacement map), so the script rebuilds each normal from the displacement
slopes plus the shipped normal, matches the lite tier's relief to the full
tier's so a casting does not go smooth offline, and levels every roughness
map to the real surface's value so the materials run `roughness: 1` and read
the truth off the map.

`NormalGL` is the OpenGL-convention normal map, which is the one three.js wants.

Delete this folder and every material falls back to the procedural grain it had
before; `js/lib/textures.js` resolves each map to `null` when it is missing.
