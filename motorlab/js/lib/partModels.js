/* MotorLab — scanned component models.
 *
 * Some parts cannot be faked convincingly. A turbine wheel is eleven twisted
 * blades; a cast engine block is a landscape of webs, bosses and draft angles;
 * an alloy rim is a shape somebody spent months styling. Where a real scan of
 * the component exists, MotorLab loads it and drops the generated stand-in.
 *
 * Every model here is a 3D scan of the actual hardware by Artec 3D, used under
 * CC BY 3.0. They load once at boot, alongside the texture library, so the
 * geometry builders stay synchronous — and every caller keeps its generated
 * fallback, so the app still runs with this folder deleted.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetBundled, assetBytes } from './assets.js';

const DIR = './assets/scans/';
const CREDIT = 'Scanned by Artec 3D (artec3d.com), CC BY 3.0, decimated for the web';

/* `axis` is the part's own long/rotational axis, `size` its largest dimension
 * in metres and `depth` its extent along that axis — between them a scan can
 * be dropped into a build at whatever size that engine or vehicle wants. */
const PARTS = {
  turbine:    { file:'turbine_wheel.glb',   axis:'z', size:0.0503, depth:0.030,
                what:'Turbocharger turbine wheel' },
  carRim:     { file:'car_rim.glb',         axis:'z', size:0.500,  depth:0.472,
                what:'Alloy road wheel' },
  camGear:    { file:'cam_gear.glb',        axis:'z', size:0.200,  depth:0.051,
                what:'Camshaft timing gear' },
  waterPump:  { file:'water_pump.glb',      axis:'z', size:0.200,  depth:0.091,
                what:'Water pump' },
  gearbox:    { file:'gearbox.glb',         axis:'y', size:0.600,  depth:0.578,
                what:'Dual-clutch gearbox' },
  engineI4:   { file:'engine_i4.glb',       axis:'x', size:0.680,  depth:0.530,
                what:'Four-cylinder engine' },
  engineMoto: { file:'engine_moto.glb',     axis:'y', size:0.500,  depth:0.461,
                what:'Motorcycle engine' },
  grille:     { file:'radiator_grille.glb', axis:'y', size:1.200,  depth:0.171,
                what:'Radiator grille' },
  transmission:{file:'transmission.glb',    axis:'x', size:0.720,  depth:0.720,
                what:'Manual transmission' },
};

const loaded = new Map();
let readyPromise = null;

export function partsReady(){ return loaded.has('__done'); }

/** What each scan in use is, so the app can credit it as its licence requires. */
export function partCredits(){
  const have = Object.entries(PARTS).filter(([id]) => loaded.has(id));
  if (!have.length) return [];
  return [`${have.map(([, p]) => p.what).sort().join(', ')} — ${CREDIT}`];
}

/* turning one axis onto another, as an Euler rotation */
const TURN = {
  'z:y':[-Math.PI/2, 0, 0], 'z:x':[0, Math.PI/2, 0],
  'y:z':[ Math.PI/2, 0, 0], 'y:x':[0, 0, -Math.PI/2],
  'x:z':[0, -Math.PI/2, 0], 'x:y':[0, 0, Math.PI/2],
};

/**
 * A copy of the scanned part, sized and turned to fit where it is going.
 *   dia   — target size across the two axes normal to its own axis
 *   depth — target extent along its axis (omit to scale uniformly)
 *   fit    — target largest dimension, for parts that are not round
 *   axis  — the axis it should end up running along
 * Returns null when the model is not available, so every caller can fall back.
 */
export function partMesh(id, { dia, depth, fit, axis, mat, tint } = {}){
  const spec = PARTS[id];
  const src = loaded.get(id);
  if (!spec || !src) return null;
  const mesh = src.clone();
  if (mat) mesh.material = mat;
  else if (tint){ mesh.material = src.material.clone(); mesh.material.color.setHex(tint); }

  const k = (fit != null ? fit : dia != null ? dia : spec.size) / spec.size;
  const kd = depth != null ? depth / spec.depth : k;
  /* scale across and along its own axis, before it is turned */
  const s = { x:k, y:k, z:k };
  s[spec.axis] = kd;
  mesh.scale.set(s.x, s.y, s.z);

  const g = new THREE.Group();
  g.add(mesh);
  if (axis && axis !== spec.axis){
    const t = TURN[`${spec.axis}:${axis}`];
    if (t) g.rotation.set(t[0], t[1], t[2]);
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
  readyPromise = Promise.all(Object.entries(PARTS).map(([id, spec]) => {
    /* The single-file build leaves this folder out to fit its size cap, and a
       sandboxed host may refuse the doomed fetch loudly. Nothing to load is a
       state this module already handles — take it quietly. */
    if (!assetBundled('scans/' + spec.file)) return Promise.resolve();
    /* inlined copies decode locally, so no fetch is ever issued for them */
    const local = assetBytes('scans/' + spec.file);
    const job = local !== null
      ? new Promise((res, rej) => loader.parse(local, '', res, rej))
      : loader.loadAsync(base + DIR + spec.file);
    return job.then((gltf) => {
      let found = null;
      gltf.scene.traverse(o => { if (o.isMesh && !found) found = o; });
      if (!found) return;
      /* scanner output ships no normals worth keeping, and a smooth recompute
         reads better than the per-triangle facets the raw scan gives */
      found.geometry.computeVertexNormals();
      found.geometry.center();
      loaded.set(id, found);
    }).catch(() => {});
  })).then(() => { loaded.set('__done', true); return loaded; });
  return readyPromise;
}
