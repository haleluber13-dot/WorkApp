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
const POOL_SIZE = Math.max(1, Math.min(2, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2) - 1));
const pool = [];          // { worker, busy, job }
const queue = [];         // jobs waiting for a free worker
let workersBroken = false;
let lastStats = null;

function spawnWorker() {
  const entry = { worker: null, busy: false, job: null };
  const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  entry.worker = w;
  w.onmessage = (e) => {
    const { data, error } = e.data || {};
    const job = entry.job;
    entry.job = null; entry.busy = false;
    if (job) {
      if (error) job.fallback(); else { data.stats.via = "worker"; job.resolve(data); }
    }
    pump();
  };
  w.onerror = (e) => {
    // module failed to load or crashed: fall back to the main thread for everything
    if (e && e.preventDefault) e.preventDefault();
    workersBroken = true;
    for (const p of pool) { try { p.worker.terminate(); } catch { /* ignore */ } if (p.job) p.job.fallback(); }
    pool.length = 0;
    while (queue.length) queue.shift().fallback();
  };
  return entry;
}

function pump() {
  while (queue.length) {
    let entry = pool.find((p) => !p.busy);
    if (!entry && pool.length < POOL_SIZE && !workersBroken) {
      try { entry = spawnWorker(); pool.push(entry); } catch { workersBroken = true; }
    }
    if (!entry) break;
    const job = queue.shift();
    entry.busy = true; entry.job = job;
    try { entry.worker.postMessage({ id: job.id, params: job.params }); }
    catch { entry.busy = false; entry.job = null; job.fallback(); }
  }
}

async function computeMainThread(P) {
  const { buildBodyData } = await import("./core.js");
  const data = buildBodyData(P);
  data.stats.via = "main-thread";
  return data;
}

let seq = 0;
function compute(P) {
  if (workersBroken || typeof Worker === "undefined") return computeMainThread(P);
  return new Promise((resolve, reject) => {
    let done = false;
    const job = {
      id: ++seq, params: P,
      resolve: (d) => { if (!done) { done = true; resolve(d); } },
      fallback: () => { if (!done) { done = true; computeMainThread(P).then(resolve, reject); } },
    };
    queue.push(job);
    pump();
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
