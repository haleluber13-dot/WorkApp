# Custom V-twin cruiser model

Supplied by the repository owner as `custom_xform.3DS` (with two `.max` scenes
that MotorLab cannot read — 3ds Max's own format is proprietary and undocumented)
and added at their request. MotorLab converts the `.3DS` to a `.glb` and works
out the parts from each piece's material and where it sits on the bike.

Two things worth knowing:

- **Provenance.** MotorLab did not create this mesh and cannot verify who did.
  Whoever publishes this repository is the one making it public, so satisfy
  yourself that you have the right to do so.
- **Trademarks.** The build is a recognisable Harley-Davidson custom. That name
  and the marks on the original belong to Harley-Davidson, Inc., and nothing
  here is endorsed by or connected with them — which is why the vehicle is
  listed as a generic "Custom V-twin cruiser". To drop it, delete this folder,
  remove the `harley` entry from `js/data/vehicles.js` and from `SCANNED` in
  `js/build/scannedVehicle.js`. The app works either way.

## How it was prepared

    python3 tools/tds2obj.py custom_xform.3DS harley.obj 0.001294
    python3 tools/obj2glb.py harley.obj assets/harley/harley.glb \
      --split --nouv --weld=0.003

`tds2obj.py` reads the chunks MotorLab needs (named meshes, vertices, UVs, faces,
per-face materials), turns 3DS's Z-up frame into Y-up and sets the bike on the
ground. The scale factor puts it at a real 2.5 m length. `--nouv` drops texture
coordinates the original's missing `.BMP` files would have used, and `--weld`
collapses vertices inside a 3 mm cell — 214,195 triangles down to 186,823 with no
visible change, which is worth about 400 KB.

## How it is wired in

The file names its 301 pieces after their material rather than their function, so
`SCANNED.harley.classify` works out the part from the material plus the piece's
bounding box:

| Material | Part in MotorLab |
|---|---|
| `black_m` | Backbone frame & forks |
| `silver` | V-twin & primary drive |
| `chrome` | Exhaust, bars & chrome |
| `body` | Fuel tank & fenders |
| `wheel`, and `gum` pieces big enough and far enough fore/aft | Wheels & tyres |
| `glass`, `red_l`, `blinker` | Lighting & indicators |
| `dash` | Instruments |
| everything else (`gum` grips, cables, `sign`, `red`, `nitro`) | Seat, cables & trim |

`cornerOf` splits the wheel pieces front from rear on the sign of their Z centre,
so each wheel turns about its own hub.
