# Draco decoder (plain JavaScript)

`draco_decoder.min.js` is the pure-JavaScript build of Google's Draco mesh
decompression decoder, taken from three.js 0.170.0
(`examples/jsm/libs/draco/draco_decoder.js`) and minified with esbuild —
no code changes.

It exists for the single-file offline build, which inlines it as an ordinary
script tag and decodes models on the main thread: no fetch, no workers and no
WebAssembly, so a sandboxed host's security policy has nothing to refuse.
The hosted app uses the faster wasm decoder in `assets/draco/` instead.

Draco is © Google LLC, licensed under the Apache License 2.0
(https://github.com/google/draco).
