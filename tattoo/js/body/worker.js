// Module worker: builds body meshes off the main thread (no three.js here —
// import maps do not apply inside workers).
import { buildBodyData } from "./core.js";

self.onmessage = (e) => {
  const { id, params } = e.data || {};
  try {
    const data = buildBodyData(params);
    self.postMessage({ id, data }, [data.positions.buffer, data.normals.buffer, data.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
