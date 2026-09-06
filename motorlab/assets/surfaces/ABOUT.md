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
| `cast_*` | Metal046A | `MAT.alloy`, `MAT.alloyDark`, `MAT.iron` — every casting |
| `steel_*` | Metal029 | `MAT.steel` — crank, rods, fasteners, springs |
| `hot_*` | Metal053C | `MAT.hot` — headers, manifolds, turbine housings |
| `rubber_*` | Rubber004 | `MAT.rubber` — tyres, hoses, mounts, belts |
| `plastic_*` | Plastic013A | `MAT.plastic` — covers, coils, trim |
| `leather_*` | Leather030 | Loaded, available for interiors |
| `asphalt_*` | Asphalt031 | Loaded, available for the ground plane |

Metals take only the **normal** and **roughness** maps, so MotorLab keeps its
own palette — a cast aluminium block should not turn the colour of whatever
lump the photographer happened to scan. Rubber, plastic, leather and asphalt
take the colour too.

## How they were prepared

    node tools/resize-maps.mjs assets/surfaces \
      cast_nrm=Metal046A_1K-JPG_NormalGL.jpg:256:0.85 ...

The originals are 1024² JPEGs of 300–500 KB each. At the size these tile across
a casting or a tyre that is entirely wasted, so `resize-maps.mjs` decodes,
downscales and re-encodes them — there is no image library in this environment,
so it drives a headless browser's canvas to do the work. All twenty-one maps
together come to about 260 KB.

`NormalGL` is the OpenGL-convention normal map, which is the one three.js wants.

Delete this folder and every material falls back to the procedural grain it had
before; `js/lib/textures.js` resolves each map to `null` when it is missing.
