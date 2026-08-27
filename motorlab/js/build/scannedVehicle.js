/* MotorLab — real vehicle meshes.
 * Where a proper model exists, MotorLab uses it instead of generating one. The
 * model's own object names are mapped onto part ids, so the teardown works
 * panel by panel on the real bodywork: hood, boot, doors, arches, roof, glass,
 * cage, interior and all four wheels.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { group, boundsOf } from '../lib/geo.js';

export const SCANNED = {
  nns: {
    name:'NASCAR Nationwide Series stock car',
    dir:'./assets/nns/', obj:'NNS.obj', mtl:'NNS.mtl',
    prefix:'nns_lod0_',
    /* model is nose-along-+Z, left-hand side at +X, sitting on Y = 0 */
    yaw: Math.PI / 2,
    normalMap:'textures/nns_normal.png',
    liveries:[
      { id:'placeholder', name:'House livery #6', file:'paint/nns_placeholder_paint.png' },
      { id:'sprint',      name:'Series car #008', file:'paint/nns_sprint_paint.png' },
    ],
    /* every named object in the file, and the part it belongs to */
    map:{
      underside:'chassis',
      interior_cage:'cage',
      interior_hardware:'seats',
      engine:'engine',
      front_end:'panelFront', rear_end:'panelRear',
      hood:'panelHood', hood_alpha:'panelHood',
      boot:'panelBoot', boot_alpha:'panelBoot',
      roof:'panelRoof',
      l_door:'panelDoorF', r_door:'panelDoorF',
      rl_door:'panelDoorR', rr_door:'panelDoorR',
      fl_arch:'panelArchF', fr_arch:'panelArchF',
      rl_arch:'panelArchR', rr_arch:'panelArchR',
      glass:'glass', glass_alpha:'glass', glass_carpaint:'glass', glass_interior:'glass',
      alpha:'netting',
      fl_tiretread:'wheels', fr_tiretread:'wheels', rl_tiretread:'wheels', rr_tiretread:'wheels',
      fl_tireface:'wheels', fr_tireface:'wheels', rl_tireface:'wheels', rr_tireface:'wheels',
      fl_hub:'wheels', fr_hub:'wheels', rl_hub:'wheels', rr_hub:'wheels',
      fl_hub_tiretread:'wheels', fr_hub_tiretread:'wheels',
      rl_hub_tiretread:'wheels', rr_hub_tiretread:'wheels',
    },
    /* which corner each wheel object belongs to, so it can turn and steer */
    corners:{ fl:['fl_tiretread','fl_tireface','fl_hub','fl_hub_tiretread'],
              fr:['fr_tiretread','fr_tireface','fr_hub','fr_hub_tiretread'],
              rl:['rl_tiretread','rl_tireface','rl_hub','rl_hub_tiretread'],
              rr:['rr_tiretread','rr_tireface','rr_hub','rr_hub_tiretread'] },
  },
};

const cache = new Map();
const liveryCache = new Map();

/** Swap the paint texture on a loaded model. */
export async function setLivery(modelId, liveryId, base = ''){
  const spec = SCANNED[modelId];
  const livery = spec?.liveries?.find(l => l.id === liveryId);
  const raw = cache.get(modelId);
  if (!livery || !raw) return false;
  const url = base + spec.dir + livery.file;
  let tex = liveryCache.get(url);
  if (!tex){
    tex = await new Promise((res) => new THREE.TextureLoader(assetManager()).load(url, res, undefined, () => res(null)));
    if (!tex) return false;
    tex.colorSpace = THREE.SRGBColorSpace;
    liveryCache.set(url, tex);
  }
  raw.traverse(o => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]))
      if (m?.name === 'paint'){ m.map = tex; m.needsUpdate = true; }
  });
  return true;
}
export function liveriesFor(modelId){ return SCANNED[modelId]?.liveries || []; }

export async function buildScannedVehicle(v, tree, opts = {}){
  const spec = SCANNED[v.model];
  if (!spec) throw new Error(`No model registered for ${v.model}`);
  const source = cache.get(v.model) || await loadRaw(spec, opts.base);
  cache.set(v.model, source);
  /* clone shares geometry and materials, so a livery change still reaches this
     instance — and the cached original keeps its children for the next build */
  const raw = source.clone(true);

  const root = group('vehicle');
  const nodes = new Map();
  const anim = { wheels:[], steer:[], corners:[], fans:[] };
  /* orient the model into MotorLab's frame: nose along +X, up is +Y */
  const oriented = group('oriented');
  oriented.rotation.y = spec.yaw;

  const byName = new Map();
  for (const child of raw.children) byName.set(child.name.replace(spec.prefix, ''), child);

  /* wheels first: each corner is re-centred on its own hub so it can rotate */
  const cornerOf = new Map();
  for (const [corner, names] of Object.entries(spec.corners || {})){
    const parts = names.map(n => byName.get(n)).filter(Boolean);
    if (!parts.length) continue;
    const b = new THREE.Box3();
    parts.forEach(p => b.expandByObject(p));
    const c = b.getCenter(new THREE.Vector3());
    const wheel = group('wheel_' + corner);
    for (const p of parts){
      p.position.sub(c);
      p.updateMatrix();
      wheel.add(p);
      cornerOf.set(p.name.replace(spec.prefix, ''), corner);
    }
    const hub = group('hub_' + corner);
    hub.position.copy(c);
    hub.add(wheel);
    /* the model's own axis is X, which becomes Z once the car is turned */
    wheel.userData.spinAxis = 'x';
    anim.wheels.push({ node:wheel, end: corner[0] === 'f' ? 'F' : 'R',
                       side: corner[1] === 'l' ? -1 : 1, radius: b.getSize(new THREE.Vector3()).y / 2 });
    if (corner[0] === 'f') anim.steer.push(hub);
    anim.corners.push({ end: corner[0] === 'f' ? 'F' : 'R', side: corner[1] === 'l' ? -1 : 1,
                        x:c.z, nodes:[hub], home:new Map([[hub, hub.position.y]]),
                        phase:c.z * 9, sprung:true });
    oriented.add(hub);
    if (!nodes.has('wheels')) nodes.set('wheels', []);
    nodes.get('wheels').push(hub);
    hub.traverse(o => { o.userData.partId = 'wheels'; if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  }

  /* everything else, grouped by the part it belongs to */
  const groups = new Map();
  for (const [name, child] of byName){
    if (cornerOf.has(name)) continue;
    const partId = spec.map[name];
    if (!partId || partId === 'wheels') continue;
    if (!groups.has(partId)) groups.set(partId, group(partId));
    groups.get(partId).add(child);
  }
  for (const [partId, g] of groups){
    oriented.add(g);
    if (!nodes.has(partId)) nodes.set(partId, []);
    nodes.get(partId).push(g);
    g.traverse(o => { o.userData.partId = partId; if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  }
  root.add(oriented);

  /* explode directions, in the oriented frame */
  const home = new Map();
  const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
  const dirs = {
    panelHood:V3(0.5,1.2,0), panelBoot:V3(-0.5,1.2,0), panelRoof:V3(0,1.5,0),
    panelFront:V3(1.4,0.3,0), panelRear:V3(-1.4,0.3,0),
    panelDoorF:V3(0.2,0.2,1.5), panelDoorR:V3(-0.2,0.2,1.5),
    panelArchF:V3(0.6,0.2,1.3), panelArchR:V3(-0.6,0.2,1.3),
    glass:V3(0,1.7,0), netting:V3(0,1.0,1.0), seats:V3(0,1.1,-0.6),
    cage:V3(0,0.9,0), engine:V3(1.0,1.1,0), wheels:V3(0,0,1.9), chassis:V3(0,0,0),
  };
  for (const [id, objs] of nodes) for (const o of objs){
    home.set(o, o.position.clone());
    o.userData.explodeDir = (dirs[id] || V3(0,0.9,0)).clone().multiplyScalar(0.42);
  }

  const bounds = boundsOf(root);
  return {
    root, nodes, anim, home, bounds, scanned:true,
    partIds:[...nodes.keys()],
    setExplode(f){
      for (const [, objs] of nodes) for (const o of objs){
        const h = home.get(o);
        if (h) o.position.copy(h).addScaledVector(o.userData.explodeDir, f);
      }
    },
    update(state){
      const spin = state.wheelAngle || 0;
      const t = state.time || 0;
      const moving = Math.abs(state.speed || 0) > 0.01;
      for (const w of anim.wheels) w.node.rotation.x = -spin;
      for (const s of anim.steer) s.rotation.y = (state.steer || 0) * 0.5;
      const pitch = state.pitch || 0, roll = state.roll || 0;
      for (const c of anim.corners){
        const road = moving ? Math.sin(t * 6.3 + c.phase) * 0.009 : 0;
        const travel = road + pitch * (c.end === 'F' ? 1 : -1) * 0.030 + roll * c.side * 0.026;
        for (const n of c.nodes){
          const h = c.home.get(n);
          if (h != null) n.position.y = h + travel;
        }
      }
    },
  };
}

/* ---------------------------------------------------------------------- */
/** In a single-file build the assets are inlined, so redirect every request. */
function assetManager(){
  const m = new THREE.LoadingManager();
  const inlined = globalThis.__MOTORLAB_ASSETS;
  if (inlined) m.setURLModifier((url) => {
    const key = './assets/' + String(url).split('/assets/').pop();
    return inlined[key] || url;
  });
  return m;
}

async function loadRaw(spec, base = ''){
  const dir = base + spec.dir;
  const mgr = assetManager();
  const mtl = await new Promise((res, rej) =>
    new MTLLoader(mgr).setPath(dir).load(spec.mtl, res, undefined, rej));
  mtl.preload();
  const obj = await new Promise((res, rej) =>
    new OBJLoader(mgr).setMaterials(mtl).setPath(dir).load(spec.obj, res, undefined, rej));

  /* MTLLoader gives Phong; convert so the environment map and clearcoat work */
  let normalMap = null;
  if (spec.normalMap){
    normalMap = await new Promise((res) =>
      new THREE.TextureLoader(mgr).load(dir + spec.normalMap, res, undefined, () => res(null)));
    if (normalMap) normalMap.colorSpace = THREE.NoColorSpace;
  }
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map(m => upgrade(m, o.name, normalMap));
    if (o.material.length === 1) o.material = o.material[0];
    o.geometry.computeVertexNormals?.();
  });
  return obj;
}

function upgrade(m, objectName, normalMap){
  if (!m) return new THREE.MeshStandardMaterial({ color:0x8a9099 });
  const map = m.map || null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  const n = (m.name || '') + ' ' + objectName;
  const isGlass = /glass/.test(n) && !/interior|carpaint/.test(n);
  const isPaint = /paint/.test(m.name || '');
  const isTyre  = /tiretread|tireface/.test(n);
  const isNet   = /alpha/.test(m.name || '');

  if (isGlass)
    return new THREE.MeshPhysicalMaterial({ map, color:0xffffff, metalness:0, roughness:0.04,
      clearcoat:1, clearcoatRoughness:0.02, transparent:true, opacity:0.55,
      envMapIntensity:2.2, side:THREE.DoubleSide, depthWrite:false });
  if (isPaint)
    return new THREE.MeshPhysicalMaterial({ map, normalMap, metalness:0.0, roughness:0.36,
      clearcoat:0.85, clearcoatRoughness:0.08, envMapIntensity:0.75, name:'paint' });
  if (isTyre)
    return new THREE.MeshStandardMaterial({ map, metalness:0.05, roughness:0.88,
      envMapIntensity:0.45, side:THREE.DoubleSide });
  if (isNet)
    return new THREE.MeshStandardMaterial({ map, metalness:0.1, roughness:0.8,
      transparent:true, alphaTest:0.4, side:THREE.DoubleSide, envMapIntensity:0.5 });
  return new THREE.MeshStandardMaterial({ map, metalness:0.25, roughness:0.62,
    envMapIntensity:0.8, side:THREE.DoubleSide });
}
