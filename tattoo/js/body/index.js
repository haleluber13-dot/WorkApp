// InkForm 3D — procedural parametric human body.
//
//   DEFAULT_BODY                       default BodyParams
//   REGION_LIST                        static region metadata {id,label,group,side,sizeCm,aliases}
//   buildBody(params) → Promise<{ geometry, regions, bounds }>
//   nearestRegion(regions, point, normal?) → region id
//
// The body is a signed-distance field of smooth-blended primitives
// (model.js / sdf.js), polygonized by sparse surface nets (mesher.js) inside a
// module worker, with a main-thread fallback. Results are cached by params.
import * as THREE from "three";
import { DEFAULT_BODY, normalizeParams } from "./model.js";
import { REGION_LIST, nearestRegion } from "./regions.js";

export { DEFAULT_BODY, REGION_LIST, nearestRegion, normalizeParams };

/** Suggested defaults when switching sex (the app may merge these). */
export const SEX_DEFAULTS = Object.freeze({
  male: Object.freeze({ heightCm: 178 }),
  female: Object.freeze({ heightCm: 166 }),
});

const CACHE_SIZE = 4;
const cache = new Map(); // key → Promise<data>
let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();
let lastStats = null;

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, data, error } = e.data || {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error)); else p.resolve(data);
    };
    worker.onerror = (e) => {
      // module failed to load or crashed: fall back to the main thread
      workerBroken = true;
      try { worker.terminate(); } catch { /* ignore */ }
      worker = null;
      const all = [...pending.values()];
      pending.clear();
      for (const p of all) p.fallback();
      if (e && e.preventDefault) e.preventDefault();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

async function computeMainThread(P) {
  const { buildBodyData } = await import("./core.js");
  return buildBodyData(P);
}

function compute(P) {
  const w = getWorker();
  if (!w) return computeMainThread(P);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const fallback = () => computeMainThread(P).then(resolve, reject);
    pending.set(id, { resolve, reject: () => { pending.delete(id); fallback(); }, fallback });
    try { w.postMessage({ id, params: P }); } catch { pending.delete(id); fallback(); }
  });
}

function toResult(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = "body";
  geometry.userData.stats = data.stats;
  const regions = data.regions.map((r) => ({
    ...r, position: r.position.slice(), normal: r.normal.slice(), up: r.up.slice(), aliases: r.aliases.slice(),
  }));
  return { geometry, regions, bounds: { min: data.bounds.min.slice(), max: data.bounds.max.slice() } };
}

/**
 * Build (or fetch from cache) the body mesh for the given params.
 * @param {Partial<typeof DEFAULT_BODY>} params
 */
export async function buildBody(params = {}) {
  const P = normalizeParams({ ...DEFAULT_BODY, ...params });
  const key = JSON.stringify(P);
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
    cache.set(key, entry);
  } else {
    entry = compute(P);
    cache.set(key, entry);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    entry.catch(() => cache.delete(key));
  }
  const data = await entry;
  lastStats = data.stats;
  return toResult(data);
}

/** Timing / size info of the last build (debugging). */
export function getLastBuildStats() { return lastStats; }
