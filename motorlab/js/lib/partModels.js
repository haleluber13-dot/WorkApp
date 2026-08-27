/* MotorLab — scanned component models.
 *
 * Some parts are impossible to fake convincingly: a turbine wheel is eleven
 * blades, each a twisted surface with a different curvature at every radius,
 * and no amount of lofting gets you the real thing. Where a proper scan of the
 * component exists, MotorLab uses it and drops the generated stand-in.
 *
 * They load once at boot, alongside the texture library, so the geometry
 * builders stay synchronous. Every caller falls back if a model is absent.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = './assets/scans/';

/* `axis` is the part's own long axis, `size` its real diameter in metres —
 * both needed to drop it into a build at whatever scale that engine wants. */
const PARTS = {
  turbine: { file:'turbine_wheel.glb', axis:'z', dia:0.0503,
             credit:'Turbine wheel scanned by Artec 3D (artec3d.com), CC BY 3.0' },
};

const loaded = new Map();
let readyPromise = null;

export function partsReady(){ return loaded.has('__done'); }

/** The credits every scanned component in use requires. */
export function partCredits(){
  return Object.entries(PARTS).filter(([id]) => loaded.has(id)).map(([, p]) => p.credit);
}

/** A copy of the scanned part, scaled so it measures `dia` across and turned
 *  so its axis runs along `axis`. Null when the model is not available. */
export function partMesh(id, { dia, mat, axis = 'z' } = {}){
  const spec = PARTS[id];
  const src = loaded.get(id);
  if (!spec || !src) return null;
  const mesh = src.clone();
  if (mat) mesh.material = mat;
  const g = new THREE.Group();
  g.add(mesh);
  const k = dia ? dia / spec.dia : 1;
  mesh.scale.setScalar(k);
  if (axis !== spec.axis){
    if (spec.axis === 'z' && axis === 'y') mesh.rotation.x = -Math.PI / 2;
    if (spec.axis === 'z' && axis === 'x') mesh.rotation.y = Math.PI / 2;
  }
  g.userData.scanned = id;
  return g;
}

export function loadPartModels(base = ''){
  if (readyPromise) return readyPromise;
  if (typeof document === 'undefined'){
    loaded.set('__done', true);
    return (readyPromise = Promise.resolve(loaded));
  }
  const mgr = new THREE.LoadingManager();
  const inlined = globalThis.__MOTORLAB_ASSETS;
  if (inlined) mgr.setURLModifier((url) => {
    const key = './assets/' + String(url).split('/assets/').pop();
    return inlined[key] || url;
  });
  const loader = new GLTFLoader(mgr);
  readyPromise = Promise.all(Object.entries(PARTS).map(([id, spec]) =>
    loader.loadAsync(base + DIR + spec.file).then((gltf) => {
      let found = null;
      gltf.scene.traverse(o => { if (o.isMesh && !found) found = o; });
      if (!found) return;
      /* scanner output has no normals worth shipping, and a smooth recompute
         reads better than the per-triangle facets the raw scan gives */
      found.geometry.computeVertexNormals();
      found.geometry.center();
      loaded.set(id, found);
    }).catch(() => {})
  )).then(() => { loaded.set('__done', true); return loaded; });
  return readyPromise;
}
