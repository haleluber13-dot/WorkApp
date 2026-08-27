# NASCAR Nationwide Series stock car model

This model and its textures were **supplied by the repository owner** and added
at their request. MotorLab loads it and maps its named objects onto part ids so
the bodywork comes apart panel by panel.

Two things worth knowing:

- **Provenance.** The mesh was exported from Blender; MotorLab did not create it
  and cannot verify who did. Whoever publishes this repository is the one making
  it public, so satisfy yourself that you have the right to do so.
- **Trademarks.** The paint textures carry third-party marks — NASCAR, Sprint,
  Goodyear and a number of sponsor logos. Those belong to their owners. If you
  would rather not publish them, delete `paint/` and `textures/`, drop the
  `nns` entry from `js/data/vehicles.js`, and load your own model through
  **Settings → Bring your own model** instead. The app works either way.

## How it is wired in

`js/build/scannedVehicle.js` holds the mapping. Object names in the `.obj` are
matched against `SCANNED.nns.map`, and each maps to a part id that appears in
the teardown list:

| Object in the file | Part in MotorLab |
|---|---|
| `underside` | Tube frame & floor |
| `interior_cage` | Roll cage |
| `interior_hardware` | Seat, belts & interior |
| `engine` | Engine & drivetrain |
| `front_end` / `rear_end` | Front clip / Rear clip |
| `hood`, `boot`, `roof` | Hood, Deck lid, Roof |
| `l_door`, `r_door` / `rl_door`, `rr_door` | Front door skins / Rear quarters |
| `fl_arch` … `rr_arch` | Front / rear wheel arches |
| `glass*` | Windscreen & rear window |
| `alpha` | Window net & hardware |
| `fl_*`, `fr_*`, `rl_*`, `rr_*` | Wheels & tyres, one group per corner |

Each wheel corner is re-centred on its own hub so it rotates and steers about the
right axis. To add another model, add an entry to `SCANNED` with the same shape.
