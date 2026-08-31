/* MotorLab — bring your own model.
 *
 * Photoreal scanned and CAD-derived vehicles cannot be shipped with this app.
 * The good ones are licensed work and redistributing them is not ours to do;
 * the ones that are genuinely free to redistribute are stylised rather than
 * real. What the app can do is take a model you already have the right to use
 * — a CC0 download, a purchased asset, or a scan you made yourself with a
 * phone — and use it in place of the generated one.
 *
 * A model is stored against the vehicle or engine it belongs to, so a library
 * builds up over time rather than one import replacing everything. Nothing
 * leaves the device: the files live in this browser's IndexedDB.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl, setAssetBase } from './assets.js';

/* kind is 'veh' or 'eng'; the value is { group, name, triangles, meshes } */
export const models = { veh:new Map(), eng:new Map() };

/** The model for one subject, or null. */
export function modelFor(kind, id){ return models[kind]?.get(id) || null; }
export function hasModels(){ return models.veh.size + models.eng.size > 0; }
export function listModels(){
  const out = [];
  for (const kind of ['veh', 'eng'])
    for (const [id, m] of models[kind]) out.push({ kind, id, ...m });
  return out;
}

/* Imported models are far too large for localStorage, so they live in IndexedDB
 * and survive a reload. */
const DB = 'motorlab', STORE = 'models';
function idb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn){
  return idb().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error);
  }));
}
const idbPut  = (k, v) => tx('readwrite', s => s.put(v, k));
const idbGet  = (k)    => tx('readonly',  s => s.get(k));
const idbDel  = (k)    => tx('readwrite', s => s.delete(k));
const idbKeys = ()     => tx('readonly',  s => s.getAllKeys());

const key = (kind, id) => `${kind}:${id}`;

/** Re-load everything imported in earlier sessions. Call once at start-up. */
export async function restoreModels(){
  let n = 0;
  try {
    const keys = await idbKeys() || [];
    for (const k of keys){
      /* 'body' is the single-slot key this used before models were kept per
         vehicle. Anything imported back then belongs to no particular car, so
         it is dropped rather than guessed at. */
      if (typeof k !== 'string' || !k.includes(':')) { idbDel(k).catch(() => {}); continue; }
      const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
      if (!models[kind]) continue;
      const saved = await idbGet(k);
      if (!saved?.buffer) continue;
      try { await loadGLB(kind, id, saved.buffer, saved.name, { persist:false }); n++; }
      catch { /* a file that no longer parses is not worth failing start-up over */ }
    }
  } catch { /* no IndexedDB, private window, quota — carry on generated */ }
  return n;
}

/** The manifest of models that ship with the app.
 *
 *  Only the manifest is read at start-up — it is a few kilobytes. The models
 *  themselves are several megabytes each and there are dozens of them, so
 *  fetching the lot before the first frame meant the app never got to one.
 *  Each is pulled when its vehicle or engine is actually selected.
 */
let manifest = null;

const grab = async (u) => {
  /* a multi-megabyte fetch is the one most likely to be cut off — a reload
     part-way through will do it — and losing it silently is worse than a retry */
  for (let i = 0; i < 2; i++){
    try { const r = await fetch(u); if (r.ok) return r; }
    catch { /* retry once */ }
  }
  return null;
};
export async function loadManifest(base = ''){
  setAssetBase(base);
  try {
    const res = await grab(assetUrl('models/manifest.json'));
    manifest = res ? (await res.json()).models || {} : {};
  } catch { manifest = {}; }
  return Object.keys(manifest).length;
}

/** Is there a model on file for this subject, loaded or not? */
export function hasBundled(kind, id){
  return !!(manifest && manifest[`${kind}:${id}`]);
}

/* A fetch that failed — offline, a truncated response, a file that no longer
 * parses — must not be retried on every rebuild, or the app spins on it
 * instead of falling back to the generated model. One attempt per session. */
const failed = new Set();

/** Is there a model to wait for: on file, not in memory, not already tried? */
export function modelPending(kind, id){
  const k = `${kind}:${id}`;
  return hasBundled(kind, id) && !models[kind]?.get(id) && !failed.has(k);
}

/** Make sure this subject's model is in memory, fetching it if need be.
 *  Resolves to the record, or null if there is nothing to fetch. */
const inFlight = new Map();
export function ensureModel(kind, id){
  const have = models[kind]?.get(id);
  if (have) return Promise.resolve(have);
  const rec = manifest?.[`${kind}:${id}`];
  if (!rec) return Promise.resolve(null);
  const k = `${kind}:${id}`;
  if (inFlight.has(k)) return inFlight.get(k);
  const job = (async () => {
    try {
      const r = await grab(assetUrl('models/' + rec.file));
      if (!r) { failed.add(k); return null; }
      return await loadGLB(kind, id, await r.arrayBuffer(), rec.file, { persist:false });
    } catch { failed.add(k); return null; }
    finally { inFlight.delete(k); }
  })();
  inFlight.set(k, job);
  return job;
}

/** Parse a .glb/.gltf ArrayBuffer and file it against one vehicle or engine. */
export function loadGLB(kind, id, arrayBuffer, fileName = 'model.glb', opts = {}){
  return new Promise((resolve, reject) => {
    if (!models[kind]) return reject(new Error('Unknown model kind: ' + kind));
    new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
      const g = gltf.scene || gltf.scenes?.[0];
      if (!g) return reject(new Error('That file has no scene in it.'));
      let meshes = 0, tris = 0;
      g.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        o.castShadow = o.receiveShadow = true;
        const idx = o.geometry?.index;
        tris += idx ? idx.count / 3 : (o.geometry?.attributes?.position?.count || 0) / 3;
      });
      if (!meshes) return reject(new Error('That file has no meshes in it.'));
      const rec = { group:g, name:fileName, meshes, triangles:Math.round(tris) };
      models[kind].set(id, rec);
      if (opts.persist !== false)
        idbPut(key(kind, id), { name:fileName, buffer:arrayBuffer }).catch(() => {});
      resolve(rec);
    }, (err) => reject(new Error(err?.message || 'Could not read that file as glTF.')));
  });
}

export function clearModel(kind, id){
  models[kind]?.delete(id);
  idbDel(key(kind, id)).catch(() => {});
}

/** Fit an imported model to a real size: match its length, sit it on the ground.
 *
 *  `lengthM` is the real overall length the model should end up, so a car that
 *  was authored at 1 unit long and one authored at 4,500 units both come out
 *  at the size the spec says they are.
 */
export function fitToLength(source, lengthM, opts = {}){
  const g = source.clone(true);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  /* the longest horizontal axis is the length, whatever axis it was authored on */
  const longest = Math.max(size.x, size.z);
  if (!isFinite(longest) || longest <= 0) return g;
  const k = (lengthM / longest) * (opts.scale ?? 1);
  const wrap = new THREE.Group();
  g.position.sub(centre);                       // centre it on its own bounding box
  if (opts.ground !== false) g.position.y += size.y / 2;   // then sit it on the ground
  g.scale.setScalar(k);
  g.position.multiplyScalar(k);
  /* models authored nose-along-Z need a quarter turn to match our nose-along-X */
  wrap.rotation.y = (size.z > size.x ? Math.PI/2 : 0) + (opts.spin ?? 0);
  wrap.position.y = opts.lift ?? 0;
  wrap.add(g);
  return wrap;
}

/* the old name, kept so nothing that still calls it breaks */
export const fitToVehicle = fitToLength;
