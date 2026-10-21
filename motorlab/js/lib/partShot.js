/* A picture of one part, rendered from the part itself.
 *
 * A list that says "goes on after: main bearings, main caps" is a list of
 * words. The same list with a picture of each one beside it is a list of
 * things you can find on the machine in front of you — which is the whole
 * difference between reading about an engine and working on one.
 *
 * Baking these ahead of time would mean fifty engines times fifty parts of
 * artwork, and it would go stale the moment a builder changed. Instead the
 * part is drawn here, live, out of the model already in memory: clone it into
 * a tiny scene of its own, frame it, take one frame, keep the data URL.
 */
import * as THREE from 'three';

const cache = new Map();          // `${key}:${partId}` -> data URL
let rig = null;

function ensureRig(size){
  if (rig) return rig;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true,
                                         preserveDrawingBuffer:true });
  } catch { return (rig = { broken:true }); }
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 200);
  /* Three lights and no environment map: a part shot has to read as a shape
     first, and a shape reads best with a key, a fill and a rim. */
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2.4, 3.2, 2.0);
  const fill = new THREE.DirectionalLight(0x93b4e8, 0.9); fill.position.set(-2.6, 0.7, 1.4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(-1.0, 1.6, -2.6);
  scene.add(key, fill, rim, new THREE.AmbientLight(0x8fa4c4, 0.55));
  return (rig = { canvas, renderer, scene, camera, size });
}

/** Data URL of a picture of `partId` in `model`, or null if it cannot be drawn.
 *  `key` identifies the subject so two engines' pistons do not share a cache
 *  entry. */
export function partShot(model, partId, key = '', size = 96){
  const ck = `${key}:${partId}:${size}`;
  if (cache.has(ck)) return cache.get(ck);

  const objs = model?.nodes?.get(partId);
  if (!objs?.length) return null;
  const r = ensureRig(size);
  if (r.broken) return null;
  if (r.size !== size){
    r.canvas.width = r.canvas.height = size;
    r.renderer.setSize(size, size, false);
    r.size = size;
  }

  const holder = new THREE.Group();
  for (const o of objs){
    const c = o.clone(true);
    /* the part is drawn where it sits on the machine; put it back on its own
       origin so the frame below is of the part and not of the empty space
       between it and the crank */
    c.position.copy(o.position);
    holder.add(c);
  }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  if (box.isEmpty()) return null;
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.001, box.getSize(new THREE.Vector3()).length() * 0.5);
  holder.position.sub(centre);

  r.scene.add(holder);
  const dist = radius / Math.tan((r.camera.fov * Math.PI / 180) / 2) * 1.28;
  r.camera.position.set(0.78, 0.52, 1).normalize().multiplyScalar(dist);
  r.camera.lookAt(0, 0, 0);
  r.camera.near = Math.max(0.001, dist / 200);
  r.camera.far = dist * 12;
  r.camera.updateProjectionMatrix();

  let url = null;
  try {
    r.renderer.render(r.scene, r.camera);
    url = r.canvas.toDataURL('image/png');
  } catch { url = null; }
  r.scene.remove(holder);
  holder.traverse(o => { if (o.isMesh && o.geometry?.dispose) { /* clones share geometry */ } });

  cache.set(ck, url);
  return url;
}

/** Drop everything cached for one subject — call when its model is rebuilt. */
export function forgetShots(key){
  for (const k of [...cache.keys()]) if (k.startsWith(key + ':')) cache.delete(k);
}
