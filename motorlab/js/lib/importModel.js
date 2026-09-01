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
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { assetUrl, setAssetBase, assetBytes, assetText } from './assets.js';
import { MainThreadDRACOLoader } from './dracoMain.js';

/* Every bundled model is Draco-compressed, because geometry is nearly all of
 * a model's weight and Draco takes it to about an eighth. That is what lets
 * the offline single file carry the whole catalogue instead of ten of it.
 *
 * DRACOLoader normally fetches its decoder from a directory path, which is no
 * use in a build where every asset is a data: URI. _loadLibrary is the one
 * place it does that, so it is the one place to redirect: both forms of the
 * app then find the decoder wherever that copy of the app keeps its assets.
 */
let draco = null;
function dracoLoader(){
  if (draco) return draco;
  /* The offline build inlines the plain-JS decoder as an ordinary script tag
     and decodes on the main thread — no fetch, no worker, no wasm, nothing a
     sandboxed host's security policy can take away. The hosted app keeps the
     worker pool and the wasm decoder, which are faster and allowed there. */
  if (globalThis.DracoDecoderModule){
    draco = new MainThreadDRACOLoader();
    return draco;
  }
  draco = new DRACOLoader();
  draco._loadLibrary = (name, responseType) => new Promise((res, rej) => {
    const bytes = assetBytes('draco/' + name);
    if (bytes !== null)
      return res(responseType === 'arraybuffer' ? bytes : new TextDecoder().decode(bytes));
    const f = new THREE.FileLoader();
    f.setResponseType(responseType === 'arraybuffer' ? 'arraybuffer' : 'text');
    f.load(assetUrl('draco/' + name), res, undefined, rej);
  });
  return draco;
}

/** A loader that can read the models we ship. */
function gltfLoader(){
  return new GLTFLoader().setDRACOLoader(dracoLoader());
}

/* kind is 'veh' or 'eng'; the value is { group, name, triangles, meshes } */
export const models = { veh:new Map(), eng:new Map() };

/* Which subjects the user has asked to see generated rather than real. The
 * real model is the better picture; the generated one is the better teacher,
 * because every part of it is a part you can take off. Both are worth having,
 * so the choice is theirs and it is remembered per machine.
 *
 * main.js keeps this in step with the saved settings — a global rather than an
 * import because store.js already imports this module, and the builders that
 * ask the question must not have to know about either. */
const generated = () => globalThis.__MOTORLAB_GENERATED || {};

export function preferGenerated(kind, id){ return !!generated()[`${kind}:${id}`]; }

/** The model for one subject, or null — null also when the user has asked for
 *  the generated one. */
export function modelFor(kind, id){
  if (preferGenerated(kind, id)) return null;
  const rec = models[kind]?.get(id) || null;
  if (rec) touch(kind, id);
  return rec;
}

/** The model regardless of that preference, for anything that needs to know
 *  whether one exists at all. */
export function rawModelFor(kind, id){ return models[kind]?.get(id) || null; }

/* ---- keeping only as many as will fit ---------------------------------
 *
 * A real model is a few megabytes of triangles and, more to the point,
 * several dozen textures sitting on the graphics card. Browsing the catalogue
 * loads one after another and nothing ever let go of them, so after a couple
 * of dozen machines the next glTF simply fails to parse — quietly, with the
 * app falling back to the generated one, which looks like nothing at all went
 * wrong. So the ones the user is not looking at are let go of properly:
 * dropping the reference is not enough, textures and geometry have to be
 * disposed by hand or the driver keeps them.
 */
const MAX_RESIDENT = 6;
const recent = [];                     // `${kind}:${id}`, most recent last
const bundled = new Set();             // only what we fetched; imports stay

function disposeGroup(g){
  g.traverse(o => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])){
      if (!m) continue;
      for (const k of Object.keys(m)){
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose?.();
    }
  });
}

function touch(kind, id){
  const k = `${kind}:${id}`;
  const at = recent.indexOf(k);
  if (at >= 0) recent.splice(at, 1);
  recent.push(k);
  while (recent.length > MAX_RESIDENT){
    const old = recent.shift();
    if (!bundled.has(old)) continue;          // a model the user imported stays
    const [ok, oid] = [old.slice(0, old.indexOf(':')), old.slice(old.indexOf(':') + 1)];
    const rec = models[ok]?.get(oid);
    if (!rec) continue;
    disposeGroup(rec.group);
    models[ok].delete(oid);
    bundled.delete(old);
  }
}
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

/* The bytes of assets/<path>: decoded straight out of the single-file build
 * when this copy is one, fetched over the network when it is hosted. Only the
 * hosted path touches fetch(); a sandboxed page hosting the single file may
 * refuse fetch entirely, and every model in the catalogue used to vanish with
 * it. */
const grabBytes = async (path) => {
  const local = assetBytes(path);
  if (local !== null) return local;
  /* a multi-megabyte fetch is the one most likely to be cut off — a reload
     part-way through will do it — and losing it silently is worse than a retry */
  for (let i = 0; i < 2; i++){
    try {
      const r = await fetch(assetUrl(path));
      if (r.ok) return await r.arrayBuffer();
    } catch { /* retry once */ }
  }
  return null;
};
export async function loadManifest(base = ''){
  setAssetBase(base);
  try {
    const local = assetText('models/manifest.json');
    if (local !== null){
      manifest = JSON.parse(local).models || {};
    } else {
      const bytes = await grabBytes('models/manifest.json');
      manifest = bytes ? JSON.parse(new TextDecoder().decode(bytes)).models || {} : {};
    }
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
const errors = new Map();

/** Why this subject's model did not load, if it did not. */
export function modelError(kind, id){ return errors.get(`${kind}:${id}`) || null; }

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
      const bytes = await grabBytes('models/' + rec.file);
      if (!bytes) throw new Error('could not be fetched');
      const out = await loadGLB(kind, id, bytes, rec.file, { persist:false });
      bundled.add(k);
      touch(kind, id);
      return out;
    } catch (err) {
      /* Falling back to the generated machine is the right behaviour and it
         looks like nothing went wrong, which is how a third of the catalogue
         once shipped as the wrong thing without anyone noticing. Say so. */
      failed.add(k);
      errors.set(k, String(err?.message || err));
      console.warn(`MotorLab: the model for ${k} did not load — ${errors.get(k)}. `
                 + 'Showing the generated machine instead.');
      return null;
    }
    finally { inFlight.delete(k); }
  })();
  inFlight.set(k, job);
  return job;
}

/** Parse a .glb/.gltf ArrayBuffer and file it against one vehicle or engine. */
export function loadGLB(kind, id, arrayBuffer, fileName = 'model.glb', opts = {}){
  return new Promise((resolve, reject) => {
    if (!models[kind]) return reject(new Error('Unknown model kind: ' + kind));
    gltfLoader().parse(arrayBuffer, '', (gltf) => {
      const g = gltf.scene || gltf.scenes?.[0];
      if (!g) return reject(new Error('That file has no scene in it.'));
      let meshes = 0, tris = 0;
      /* A skinned mesh is positioned by its bones, and Object3D.clone(true) —
         which fitting a model into a build relies on — keeps the clone rigged
         to the ORIGINAL skeleton, which is not in the scene. The rally car's
         wheels are skinned, and they fell to the floor around it. Nothing
         here ever animates a model, so bake the skin's current pose into
         plain geometry and drop the rig. */
      g.updateMatrixWorld(true);
      const skinned = [];
      g.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      for (const o of skinned){
        const geo = o.geometry.clone();
        const pos = geo.attributes.position;
        const nrm = geo.attributes.normal;
        const v = new THREE.Vector3(), n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++){
          v.fromBufferAttribute(pos, i);
          (o.applyBoneTransform || o.boneTransform).call(o, i, v);   // r151 renamed it
          pos.setXYZ(i, v.x, v.y, v.z);
          if (nrm){ n.fromBufferAttribute(nrm, i); n.normalize(); nrm.setXYZ(i, n.x, n.y, n.z); }
        }
        delete geo.attributes.skinIndex;
        delete geo.attributes.skinWeight;
        const still = new THREE.Mesh(geo, o.material);
        still.name = o.name;
        still.position.copy(o.position); still.quaternion.copy(o.quaternion); still.scale.copy(o.scale);
        o.parent.add(still);
        o.parent.remove(o);
      }
      g.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        o.castShadow = o.receiveShadow = true;
        /* Scans often ship every material in blend mode — one sedan arrived
           with its paint, tyres and numberplates all at a quarter opacity, and
           you could read the seats through the roof. Glass is glass; anything
           else that is untextured and see-through was never meant to be, so it
           goes back to solid. A textured translucent material (a decal, a
           mesh grille) is left alone. */
        const GLASSY = /glass|window|windshield|windscreen|lens|light|visor|bulb|crystal/i;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])){
          if (!m || !m.transparent) continue;
          if (m.alphaMap || m.map) continue;
          if (GLASSY.test(m.name || '')) continue;
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
        }
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
  const k = key(kind, id);
  const rec = models[kind]?.get(id);
  if (rec) disposeGroup(rec.group);
  models[kind]?.delete(id);
  bundled.delete(k);
  const at = recent.indexOf(k);
  if (at >= 0) recent.splice(at, 1);
  idbDel(k).catch(() => {});
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
