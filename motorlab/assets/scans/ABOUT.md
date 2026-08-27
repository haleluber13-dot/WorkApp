# Scanned components

Real 3D scans of individual parts. These are not decorative — each one replaces
a generated stand-in inside a build, because the shape is beyond what a
procedural loft can produce honestly.

| File | Part | Where it is used |
|---|---|---|
| `turbine_wheel.glb` | Turbocharger turbine wheel, ~50 mm | The hot side of every `turboUnit()` — every turbo in the catalog |

## Licence and attribution — please read

`turbine_wheel.glb` is derived from a scan by **Artec 3D** (artec3d.com),
released under the **Creative Commons Attribution 3.0 Unported** licence
(<http://creativecommons.org/licenses/by/3.0/>).

That licence has two requirements, and MotorLab meets both:

1. **Credit.** The attribution is shown in the app itself, under
   **Help → Credits**, sourced from `partCredits()` in
   `js/lib/partModels.js`. If you fork this, keep it.
2. **Say that you changed it.** The original was a 24 MB VRML file of 300,000
   triangles in millimetres. MotorLab converted it to OBJ
   (`tools/wrl2obj.py`), then packed it to binary glTF
   (`tools/obj2glb.py --scale=0.001 --offset=0,-25.25,0 --nouv --weld=0.0007`),
   which welds vertices inside a 0.7 mm cell — 300,000 triangles down to
   44,149, and 24 MB down to 511 KB. Normals are recomputed in the browser.
   No other change was made to the geometry.

Nothing here implies Artec 3D endorses MotorLab.

## Adding another scanned component

Add an entry to `PARTS` in `js/lib/partModels.js` with the file name, the
part's own long axis and its real diameter in metres, then call
`partMesh('<id>', { dia, mat, axis })` from the builder that needs it. Every
caller must keep its generated fallback for the `null` case, so the app still
works with this folder deleted.
