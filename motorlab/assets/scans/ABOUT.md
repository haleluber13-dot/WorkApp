# Scanned components

Nine 3D scans of real hardware. These are not decoration — each replaces a
generated stand-in inside a build, because the shape is beyond what a
procedural loft can produce honestly. A cast engine block is a landscape of
webs, bosses and draft angles; an alloy wheel is a shape somebody spent months
styling; a turbine wheel is eleven twisted blades. You do not get those from
maths, you get them from a scanner.

| File | Part | Where it is used |
|---|---|---|
| `turbine_wheel.glb` | Turbocharger turbine wheel, 50 mm | The hot side of every `turboUnit()` |
| `car_rim.glb` | Alloy road wheel | The rim inside every car and bike wheel — the tyre around it stays generated, because it has to size itself to the spec |
| `moto_wheel.glb` | Motorcycle wheel | Loaded, available to `partMesh('motoWheel')` |
| `cam_gear.glb` | Camshaft timing gear | The cam sprocket on every belt- or chain-driven engine |
| `water_pump.glb` | Water pump | The pump housing; the pulley stays generated so it can turn with the belt |
| `gearbox.glb` | Dual-clutch gearbox | The gearbox in the Chassis workspace |
| `engine_i4.glb` | Four-cylinder engine | The engine in the Chassis workspace, where it is one part. The strip-down happens on the generated model in the Engine Bay, where every casting has to come apart separately |
| `engine_moto.glb` | Motorcycle engine | The engine on every generated motorcycle |
| `radiator_grille.glb` | Radiator grille | The nose of every generated car body |

## Licence and attribution — please read

Every file here is derived from a scan by **Artec 3D** (artec3d.com), released
under the **Creative Commons Attribution 3.0 Unported** licence. The full text
is in `LICENSE-CC-BY-3.0.txt`; the summary is at
<http://creativecommons.org/licenses/by/3.0/>.

That licence asks two things, and MotorLab does both:

1. **Credit.** The attribution is shown in the app under **Help → Credits**,
   built from `partCredits()` in `js/lib/partModels.js` — it names every scan
   actually loaded. If you fork this, keep it.
2. **Say that you changed it.** Every one of these was reduced to run in a
   browser. The originals are 2 to 10 million triangles and 80 to 450 MB each:

       python3 tools/scan2glb.py <source> assets/scans/<name>.glb \
         --tris=<budget> --size=<real size in metres> [--trim=0.004]

   `scan2glb.py` reads PLY, STL, OBJ or VRML, collapses the mesh to the
   triangle budget by vertex clustering (each cell's vertices average to one
   point, degenerate triangles are dropped), scales it so its longest side
   measures the part's real size in metres, and writes positions and indices
   only — normals are recomputed in the browser, where they come out smoother
   than the raw scan's. `--trim` throws away the strays a scan always carries:
   a cable left in shot, a sliver of turntable.

   The result is between 0.2% and 2% of the original triangle count. No other
   change was made to the geometry.

Nothing here implies Artec 3D endorses MotorLab.

## Adding another scanned component

Add an entry to `PARTS` in `js/lib/partModels.js` with the file name, the
part's own long or rotational axis, its largest dimension in metres and its
extent along that axis, then call `partMesh('<id>', { dia, depth, fit, axis,
mat })` from the builder that needs it. Every caller must keep its generated
fallback for the `null` case, so the app still works with this folder deleted.
