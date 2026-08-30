# Car Concept — a complete road car, modelled

**Source:** [Khronos glTF Sample Assets — CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)
**Author:** © 2017 The Khronos Group Inc.
**Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see `LICENSE.md`.
Khronos trademarks and logos are **excluded** from the licence and are not used
anywhere in MotorLab.

This is the only vehicle in MotorLab that was drawn by hand as a complete car
rather than generated from a spec or reduced from a scan, and it is the reason
the teardown on it goes so much further than on anything else: every panel, both
doors with their mirrors, handles, glass and gaskets, the roof, the bonnet with
its grille and headlights, the tail with its lights and hatch, the glazing, the
wipers, the whole cabin — seats, dash, steering wheel, pedals — and all four
wheels with the discs and calipers behind them are separate, named objects.

## What was changed

CC BY 4.0 requires a statement of changes. In order:

1. **`tools/glb-optimise.mjs`** — 11,503 kB → 5,458 kB, pixel-identical:
   - textures re-encoded (2,855 kB → 260 kB), keeping PNG only where the alpha
     channel is actually used;
   - normals quantised to signed bytes via `KHR_mesh_quantization`;
   - 158 unused vertex attributes dropped, and the buffer views repacked.
2. **`tools/glb-rename.mjs --sync`** — eight pieces made of more than one
   material had no mesh name of their own, so a loader would call them
   `mesh_90`. Each now carries the name of the node above it. The four tyres,
   which had no name at all, became `WheelFrontLTyre` and friends.
3. **`tools/glb-pose.mjs`** — the model ships in a showroom pose with 30° of
   lock wound onto the front wheels. Both front assemblies — rim, tyre, disc and
   caliper together — were turned back 30° about their own hub centres, so the
   car sits straight and steers from straight.

Nothing else was touched: the geometry, the UVs, the material parameters and the
three authored paint jobs are the Khronos originals.

## How MotorLab uses it

`js/build/scannedVehicle.js`, entry `carconcept`:

- **`flatten`** — the file parents everything to the underbody, and the doors
  carry their own glass and trim. MotorLab flattens the tree, keeping every
  piece exactly where it was, so that parts can be removed one at a time.
- **`keepMaterials`** — the model's own PBR set (metallic-flake paint under a
  clearcoat, real transmissive glass) is better than anything MotorLab would
  fit, so only the environment response is adjusted.
- **`variants`** — the three paint jobs are `KHR_materials_variants`:
  *Carmine Candy*, *Pearly Swirly* and *Torched Graphite*. They appear in the
  Garage as liveries.
- **`classify`** — object names are matched against `CONCEPT_PARTS` to decide
  which teardown part each piece belongs to. Brakes are deliberately *not*
  part of the wheels: take a wheel off and the disc and caliper stay.

## Measurements taken from the file

| | |
|---|---|
| Overall | 4,357 × 2,222 × 1,149 mm |
| Wheelbase | 2,799 mm |
| Track, front / rear | 1,952 / 1,965 mm |
| Tyre | 768 mm diameter, 280 mm section |
| Triangles | 213,347 across 97 meshes |
