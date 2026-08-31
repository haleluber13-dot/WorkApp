# Draco decoder

`draco_wasm_wrapper.js` and `draco_decoder.wasm` from the Draco library
(google/draco), Apache 2.0, as shipped with three.js.

Every bundled model is Draco-compressed. A car's geometry is the bulk of its
file — a few hundred kilobytes of float32 positions, normals and texture
coordinates — and Draco takes that to about an eighth of the size, which is
the difference between the offline single file carrying ten real cars and
carrying all of them.
