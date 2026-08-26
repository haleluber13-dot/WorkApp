/* MotorLab — bring your own model.
 * Real scanned or CAD-derived vehicles cannot be shipped with this app: the
 * good ones are licensed, and redistributing them is not ours to do. What the
 * app can do is take one you already have the right to use. Drop in a .glb or
 * .gltf and it is scaled to the vehicle's real wheelbase and used as the shell,
 * with the procedural chassis, suspension and drivetrain still underneath it.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const custom = { group:null, name:null, scale:1, lift:0, spin:0 };

/* Imported models are far too large for localStorage, so they live in IndexedDB
 * and survive a reload. Nothing ever leaves the device. */
const DB = 'motorlab', STORE = 'models';
function idb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, value){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const q = tx.objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function idbDel(key){
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => res();
  });
}

/** Re-load whatever was imported last time. Call once at start-up. */
export async function restoreCustom(){
  try {
    const saved = await idbGet('body');
    if (!saved?.buffer) return null;
    return await loadGLB(saved.buffer, saved.name, { persist:false });
  } catch { return null; }
}

export function loadGLB(arrayBuffer, fileName = 'model.glb', opts = {}){
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
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
      custom.group = g;
      custom.name = fileName;
      if (opts.persist !== false)
        idbPut('body', { name:fileName, buffer:arrayBuffer }).catch(() => {});
      resolve({ group:g, name:fileName, meshes, triangles:Math.round(tris) });
    }, (err) => reject(new Error(err?.message || 'Could not read that file as glTF.')));
  });
}

export function clearCustom(){ custom.group = null; custom.name = null; idbDel('body').catch(() => {}); }

/** Fit an imported model to a vehicle: match its length, sit it on the ground. */
export function fitToVehicle(source, lengthM, opts = {}){
  const g = source.clone(true);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  /* the longest horizontal axis is the car's length, whatever axis it was authored on */
  const longest = Math.max(size.x, size.z);
  if (!isFinite(longest) || longest <= 0) return g;
  const k = (lengthM / longest) * (opts.scale ?? 1);
  const wrap = new THREE.Group();
  g.position.sub(centre);                       // centre it on its own bounding box
  g.position.y += size.y / 2;                   // then sit it on the ground
  g.scale.setScalar(k);
  g.position.multiplyScalar(k);
  /* models authored nose-along-Z need a quarter turn to match our nose-along-X */
  wrap.rotation.y = (size.z > size.x ? Math.PI/2 : 0) + (opts.spin ?? 0);
  wrap.position.y = opts.lift ?? 0;
  wrap.add(g);
  return wrap;
}
