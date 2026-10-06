# Scanned part textures

Photographic maps supplied by the repository owner as TrueVision `.tga` files and
converted to PNG with `tools/tga2png.py`. They dress the *generated* parts, so
every procedural vehicle in MotorLab — not just the modelled ones — gets real
hardware where it used to get noise.

| File | Where it is used |
|---|---|
| `brake_disc.png` | The face of every `brakeDisc()`: cross-drilling, swept band, hat and hub bolts, all in register |
| `caliper.png` + `caliper_normal.png` | Both outward faces of every `caliper()` |
| `caliper_mirror*.png` | The mirrored pair, kept for future left/right-specific calipers |
| `carbon.png` | `MAT.carbon()`, and the carbon groups on the scanned hypercar |
| `underbody.png` | `MAT.underbody()` — floor pans and undertrays |
| `tyre_side.png` + `tyre_side_bump.png` | Tyre sidewalls, pinned rim-seat to shoulder so the moulded lettering lands where it does on the real tyre |
| `tread.png` + `tread_bump.png` | The tyre crown, wrapped 24 times around |
| `tyre_back.png` | The sidewall mask from the original set |
| `engine_bay.png`, `doorline.png`, `glass_front*.png`, `glass_defrost.png` | Loaded and available; not yet mapped onto a part |

## Provenance and trademarks

MotorLab did not create these images and cannot verify who did. The set carries
third-party marks — the brake hardware is Brembo's, the tyre sidewall is a
BFGoodrich Radial T/A. Those belong to their owners and nothing here is endorsed
by or connected with them. If you would rather not publish them, delete this
folder: `js/lib/textures.js` resolves every map to `null` when the files are
missing, and each material falls back to the generated look it had before.

## Converting more

    python3 tools/tga2png.py assets/parts name=SOURCE.tga [name=SOURCE.tga ...]

Handles TGA types 2, 3, 10 and 11 (uncompressed and run-length encoded, colour
and greyscale), fixes the BGR channel order and the bottom-left origin, and
writes a compressed PNG. Add the new file to `FILES` in `js/lib/textures.js` and
say whether it holds colour (`srgb`) or data (`data`).
