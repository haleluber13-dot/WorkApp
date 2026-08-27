# Carbon hypercar model

Supplied by the repository owner as `Koenigsegg.blend` / `.fbx` / `.obj` and
added at their request. MotorLab packs it into a `.glb` and maps its material
groups onto part ids, so the bodywork comes apart the way the parts list says.

Two things worth knowing:

- **Provenance.** The mesh was exported from Blender 2.83; MotorLab did not
  create it and cannot verify who did. Whoever publishes this repository is the
  one making it public, so satisfy yourself that you have the right to do so.
- **Trademarks.** The shape is a recognisable Koenigsegg. The name and the car's
  design belong to Koenigsegg Automotive AB, and nothing here is endorsed by or
  connected with them — which is why the vehicle is listed as a generic "Carbon
  hypercar". If you would rather not publish it, delete this folder, drop the
  `koenigsegg` entry from `js/data/vehicles.js` and from `SCANNED` in
  `js/build/scannedVehicle.js`, and load your own model through
  **Settings → Bring your own model** instead. The app works either way.

## How it was prepared

    python3 tools/obj2glb.py Koenigsegg.obj assets/koenigsegg/koenigsegg.glb \
      --scale=0.11771 --offset=0.08,0.07,-0.4 --clip=1.6,2.2,3.0 --split \
      --strip='_Koenisegg_one\.[0-9]+'

`--scale` puts the model in metres against its real 2662 mm wheelbase, `--offset`
sets the wheels on Y = 0 and centres it, `--clip` throws away three stray faces
that sat three metres off the side of the car, and `--split` gives every material
group its own node so it can be shown, hidden and exploded separately.

## How it is wired in

| Node in the file | Part in MotorLab |
|---|---|
| `Body__Carbon` | Carbon tub & floor |
| `Body__Car_Texture` | Painted body panels |
| `Body__Carbon_003`, `Body__Carbon_001` | Exposed carbon aero |
| `Body__Window_Glass` | Glazing |
| `Body__Rear_Lights` | Lighting |
| `Body__Carbon_002` | Cabin, doors & seats |
| `FL__`, `FR__`, `RL__`, `RR__` | Wheels & tyres, one group per corner |

No paint texture came with the model, so the liveries in the Garage are real
colours applied to the `paint` material rather than texture swaps. The carbon
groups are dressed with the scanned weave in `assets/parts/carbon.png`.
