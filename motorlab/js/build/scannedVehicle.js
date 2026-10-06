/* MotorLab — real vehicle meshes.
 * Where a proper model exists, MotorLab uses it instead of generating one. The
 * model's own object names are mapped onto part ids, so the teardown works
 * panel by panel on the real bodywork: hood, boot, doors, arches, roof, glass,
 * cage, interior and all four wheels.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { group, boundsOf } from '../lib/geo.js';
import { repeated } from '../lib/textures.js';

export const SCANNED = {
  nns: {
    name:'NASCAR Nationwide Series stock car',
    dir:'./assets/nns/', obj:'NNS.obj', mtl:'NNS.mtl',
    prefix:'nns_lod0_',
    /* model is nose-along-+Z, left-hand side at +X, sitting on Y = 0 */
    yaw: Math.PI / 2,
    normalMap:'textures/nns_normal.jpg',
    liveries:[
      { id:'placeholder', name:'House livery #6', file:'paint/nns_placeholder_paint.jpg' },
      { id:'sprint',      name:'Series car #008', file:'paint/nns_sprint_paint.jpg' },
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

  /* ------------------------------------------------------------------ */
  koenigsegg: {
    name:'Mid-engine hypercar (scanned)',
    dir:'./assets/koenigsegg/', glb:'koenigsegg.glb',
    /* nose along +Z, left-hand side at +X, sitting on Y = 0 */
    yaw: Math.PI / 2,
    /* the file names each piece <part>_<model>.<n>__<material> */
    clean:(n) => n.toLowerCase(),
    map:{
      'body__car_texture':'shell',
      'body__carbon_003':'aero',
      'body__carbon_001':'aero',
      'body__carbon_002':'interior',
      'body__carbon':'floor',
      'body__window_glass':'glass',
      'body__rear_lights':'lights',
    },
    corners:{ fl:['fl__carbon_001'], fr:['fr__carbon_001'],
              rl:['rl__carbon_001'], rr:['rr__carbon_001'] },
    /* no paint texture came with the model, so the liveries are real colours */
    liveries:[
      { id:'ghost',   name:'Ghost silver',   colour:0x6d7681 },
      { id:'carbon',  name:'Exposed carbon', colour:0x15171a },
      { id:'racing',  name:'Racing orange',  colour:0xd4541a },
      { id:'sky',     name:'Sky blue',       colour:0x2f6fb0 },
      { id:'crimson', name:'Crimson',        colour:0x9c1f1a },
    ],
    materialFor:(mat) => /window_glass/i.test(mat) ? 'glass'
                       : /rear_lights/i.test(mat) ? 'lamp'
                       : /carbon/i.test(mat) ? 'carbon'
                       : 'paint',
  },

  /* ------------------------------------------------------------------ */
  /* An authored concept car rather than a scan: every panel, the glazing, the
     cabin, the wheels and the brakes are separate objects with real names, and
     it ships three complete paint jobs of its own as glTF material variants. */
  carconcept: {
    name:'Concept coupé (modelled)',
    dir:'./assets/carconcept/', glb:'carconcept.glb',
    /* nose along +Z, left-hand side at +X, wheels touching Y = 0 */
    yaw: Math.PI / 2,
    flatten: true,        /* the file hangs everything off the underbody */
    keepMaterials: true,  /* its own PBR set is better than anything we'd fit */
    variants: true,       /* three authored paint jobs, as material variants */
    clean:(n) => n.toLowerCase(),
    classify:(name) => {
      for (const [re, id] of CONCEPT_PARTS) if (re.test(name)) return id;
      return null;
    },
    cornerOf:(name) => {
      const m = /^wheel(front|rear)([lr])(rim|tyre)/.exec(name);
      return m ? (m[1] === 'front' ? 'f' : 'r') + m[2] : null;
    },
    liveries:[
      /* the file's own names for its own paint jobs */
      { id:'carmine',  name:'Carmine candy',    variant:'Carmine Candy' },
      { id:'pearl',    name:'Pearly swirly',    variant:'Pearly Swirly' },
      { id:'graphite', name:'Torched graphite', variant:'Torched Graphite' },
    ],
  },

  /* ------------------------------------------------------------------ */
  harley: {
    name:'Custom V-twin cruiser (scanned)',
    dir:'./assets/harley/', glb:'harley.glb',
    yaw: Math.PI / 2,
    clean:(n) => n.toLowerCase(),
    /* the file names its pieces after their material, so the parts are worked
       out from the material plus where the piece sits on the bike */
    classify:(name, box) => {
      const kind = name.split('__').pop();
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      if (kind === 'wheel') return 'wheels';
      if (kind === 'gum')
        return (size.y > 0.25 && size.z > 0.25 && Math.abs(c.z) > 0.45) ? 'wheels' : 'trim';
      if (kind === 'body') return 'tank';
      if (kind === 'silver') return 'engine';
      if (kind === 'black_m') return 'frame';
      if (kind === 'chrome') return 'chrome';
      if (kind === 'dash') return 'dash';
      if (kind === 'glass' || kind === 'red_l' || kind === 'blinker') return 'lights';
      return 'trim';
    },
    cornerOf:(name, box) => {
      const kind = name.split('__').pop();
      if (kind !== 'wheel' && kind !== 'gum') return null;
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      if (kind === 'gum' && !(size.y > 0.25 && size.z > 0.25 && Math.abs(c.z) > 0.45)) return null;
      return c.z > 0 ? 'f' : 'r';
    },
    liveries:[
      { id:'candy',  name:'Candy apple',    colour:0x8f1410 },
      { id:'black',  name:'Vivid black',    colour:0x0d0e11 },
      { id:'flake',  name:'Gold flake',     colour:0xb98a24 },
      { id:'teal',   name:'Sea-foam green', colour:0x2c7d74 },
    ],
    materialFor:(mat) => /glass/i.test(mat) ? 'glass'
                       : /red_l|blinker/i.test(mat) ? 'lamp'
                       : /chrome/i.test(mat) ? 'chrome'
                       : /silver/i.test(mat) ? 'alloy'
                       : /gum/i.test(mat) ? 'tyre'
                       : /black_m/i.test(mat) ? 'satin'
                       : /^body$/i.test(mat) ? 'paint'
                       : 'trim',
  },
};

/* Which teardown part each of the concept car's objects belongs to. The file
 * names every piece after what it is, so this reads down the car: brakes come
 * before wheels because a brake disc is inside the wheel, wipers before glass
 * because they sit on the screen, and the floormats before the floor. */
const CONCEPT_PARTS = [
  [/^wheel(front|rear)[lr]brake/,            'brakes'],
  [/^wheel(front|rear)[lr]/,                 'wheels'],
  [/^bodyheadlights|^bodytaillights|^bodyturnsignals/, 'lights'],
  [/^bodyhood/,                              'panelHood'],
  [/^bodyroofpanel/,                         'panelRoof'],
  [/^bodyrearpanels|^interiorrearhatch|^interiorrearpanels/, 'panelRear'],
  [/^bodydoor[lr]|^interiordoor[lr]/,        'panelDoorF'],
  [/^bodywindshieldwipers|^license/,         'trim'],
  [/^bodywindshield|^bodyrearwindow|^bodywindowsrearsides/, 'glass'],
  [/^bodypillars|^bodypanelscolor/,          'shell'],
  [/^interiorseats|^interiorfloormats/,      'seats'],
  [/^interiorsteering|^interiorpedal|^interiordash|^interiormid|^interiorcage|^interiorpillar/, 'dash'],
  [/^bodyunderside|^interiorfloor|^axles/,   'chassis'],
  [/^engine/,                                'engine'],
];

/** The name a model's object is known by, once the file's own noise is off. */
function cleanName(spec, raw){
  const n = spec.clean ? spec.clean(raw) : raw;
  return spec.prefix ? n.replace(spec.prefix, '') : n;
}

const cache = new Map();
const liveryCache = new Map();

/** Swap the paint texture on a loaded model. */
export async function setLivery(modelId, liveryId, base = ''){
  const spec = SCANNED[modelId];
  const livery = spec?.liveries?.find(l => l.id === liveryId);
  const raw = cache.get(modelId);
  if (!livery || !raw) return false;
  if (livery.variant != null){         /* one of the file's own paint jobs */
    const pairs = raw.userData?.variantSets?.get(livery.variant);
    if (!pairs?.length) return false;
    for (const [target, src] of pairs) wear(target, src);
    return true;
  }
  if (livery.colour != null){          /* a model with no paint sheet of its own */
    raw.traverse(o => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material]))
        if (m?.name === 'paint'){ m.color.setHex(livery.colour); m.needsUpdate = true; }
    });
    return true;
  }
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
/* Make one material look like another, without assuming they are the same kind.
 * A variant can swap a clearcoated paint for a plain one, and Material.copy()
 * between two different classes reaches for properties the source has never
 * heard of. Only the properties that describe the surface are carried over, and
 * the ones that exist on the richer class alone fall back to "off". */
const WEAR_SHARED = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap',
  'alphaMap','roughness','metalness','opacity','transparent','emissiveIntensity','aoMapIntensity'];
const WEAR_EXTRA  = ['clearcoat','clearcoatRoughness','clearcoatMap','clearcoatRoughnessMap',
  'clearcoatNormalMap','iridescence','iridescenceIOR','iridescenceThicknessMap',
  'transmission','thickness','sheen'];
function wear(target, src){
  if (target.color && src.color) target.color.copy(src.color);
  if (target.emissive && src.emissive) target.emissive.copy(src.emissive);
  if (target.normalScale && src.normalScale) target.normalScale.copy(src.normalScale);
  if ('iridescenceThicknessRange' in target)
    target.iridescenceThicknessRange = [...(src.iridescenceThicknessRange || [100, 400])];
  for (const k of WEAR_SHARED) if (k in target && src[k] !== undefined) target[k] = src[k];
  for (const k of WEAR_EXTRA){
    if (!(k in target)) continue;
    const v = src[k];
    target[k] = v !== undefined ? v : (typeof target[k] === 'number' ? 0 : null);
  }
  tune(target);
  target.needsUpdate = true;
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
  for (const child of raw.children){
    const base = cleanName(spec, child.name);
    let name = base;
    for (let n = 2; byName.has(name); n++) name = base + '#' + n;
    byName.set(name, child);
  }

  /* a model whose pieces are named after their material has its corners worked
     out from geometry instead of from a fixed list */
  const cornerNames = { ...(spec.corners || {}) };
  if (spec.cornerOf){
    for (const [name, child] of byName){
      const key = spec.cornerOf(name, new THREE.Box3().setFromObject(child));
      if (key) (cornerNames[key] ||= []).push(name);
    }
  }

  /* wheels first: each corner is re-centred on its own hub so it can rotate */
  const cornerOf = new Map();
  for (const [corner, names] of Object.entries(cornerNames)){
    const parts = names.map(n => byName.get(n)).filter(Boolean);
    if (!parts.length) continue;
    /* precise: a wheel's own bounding box, turned, gives a box far bigger than
       the wheel — and the radius taken from it would spin the tyre too slowly */
    const b = new THREE.Box3();
    parts.forEach(p => b.expandByObject(p, true));
    const c = b.getCenter(new THREE.Vector3());
    const wheel = group('wheel_' + corner);
    for (const p of parts){
      p.position.sub(c);
      p.updateMatrix();
      wheel.add(p);
      cornerOf.set(cleanName(spec, p.name), corner);
    }
    const hub = group('hub_' + corner);
    hub.position.copy(c);
    hub.add(wheel);
    /* the model's own axis is X, which becomes Z once the car is turned */
    wheel.userData.spinAxis = 'x';
    const end = corner[0] === 'f' ? 'F' : 'R';
    const side = corner.length > 1 ? (corner[1] === 'l' ? -1 : 1) : 0;
    anim.wheels.push({ node:wheel, end, side, radius: b.getSize(new THREE.Vector3()).y / 2 });
    if (end === 'F') anim.steer.push(hub);
    anim.corners.push({ end, side, x:c.z, nodes:[hub], home:new Map([[hub, hub.position.y]]),
                        phase:c.z * 9, sprung:true });
    oriented.add(hub);
    if (!nodes.has('wheels')) nodes.set('wheels', []);
    nodes.get('wheels').push(hub);
    hub.traverse(o => { o.userData.partId = 'wheels'; if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  }

  /* everything else, grouped by the part it belongs to — and, for a part that
     comes in a left and a right, split by side. A pair of doors that explodes
     as one group sends the far door straight through the car; split, each one
     swings out of its own side. */
  /* which way is sideways depends on how the model is turned into MotorLab's
     frame, so measure across the car in the frame the explode is described in */
  const yawS = Math.sin(spec.yaw || 0), yawC = Math.cos(spec.yaw || 0);
  const across = (v) => v.z * yawC - v.x * yawS;
  const size = new THREE.Box3().setFromObject(raw).getSize(new THREE.Vector3());
  const offCentre = (size.x * Math.abs(yawS) + size.z * Math.abs(yawC)) * 0.06;
  const groups = new Map();
  const centre = new THREE.Vector3();
  for (const [name, child] of byName){
    if (cornerOf.has(name)) continue;
    const box = new THREE.Box3().setFromObject(child);
    const partId = spec.map ? spec.map[name]
                 : spec.classify ? spec.classify(name, box)
                 : null;
    if (!partId || partId === 'wheels') continue;
    box.getCenter(centre);
    const off = across(centre);
    const side = off > offCentre ? 1 : off < -offCentre ? -1 : 0;
    const key = partId + '|' + side;
    if (!groups.has(key)){
      const g = group(partId);
      g.userData.side = side;
      g.userData.partId = partId;
      groups.set(key, g);
    }
    groups.get(key).add(child);
  }
  for (const g of groups.values()){
    const partId = g.userData.partId;
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
    brakes:V3(0,0,1.1),
    /* hypercar */
    shell:V3(0,1.3,0), aero:V3(0.9,0.5,0.8), interior:V3(0,1.0,-0.9), lights:V3(-1.1,0.5,0),
    floor:V3(0,-0.7,0),
    /* cruiser */
    tank:V3(0,1.2,0), frame:V3(0,0,0), chrome:V3(0,0.4,1.3), dash:V3(0.7,0.9,0),
    trim:V3(0,0.7,0.8),
  };
  for (const [id, objs] of nodes) for (const o of objs){
    home.set(o, o.position.clone());
    const dir = (dirs[id] || V3(0,0.9,0)).clone().multiplyScalar(0.42);
    /* a left-hand part goes out to the left, a right-hand part to the right */
    if (o.userData.side) dir.z = Math.abs(dir.z) * o.userData.side;
    o.userData.explodeDir = dir;
  }

  if (!nodes.size) throw new Error(`Model ${v.model} loaded but no part matched its map`);

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

  if (spec.glb){
    const gltf = await new Promise((res, rej) =>
      new GLTFLoader(mgr).setPath(dir).load(spec.glb, res, undefined, rej));
    let obj = gltf.scene;
    obj.traverse(o => {
      if (!o.isMesh) return;
      /* a file that carries positions and UVs only gets its normals computed
         here — cheaper than shipping them, and smoother for it */
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      if (spec.keepMaterials){ tune(o.material); return; }
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      o.material = dress(spec.materialFor ? spec.materialFor(src?.name || '', o.name) : 'trim', src);
    });
    const variantSets = spec.variants ? await readVariants(gltf) : null;
    if (spec.flatten) obj = flatten(obj);
    if (variantSets) obj.userData.variantSets = variantSets;
    return obj;
  }

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

/* A model whose own materials are worth keeping still needs its lighting
 * response matched to the rest of MotorLab, and its shadows switched on. */
function tune(material){
  for (const m of (Array.isArray(material) ? material : [material])){
    if (!m) continue;
    m.envMapIntensity = m.transmission > 0 ? 1.6 : 1.0;
    m.side = m.transmission > 0 ? THREE.DoubleSide : m.side;
  }
}

/* Pull the file's own paint jobs out of KHR_materials_variants.
 *
 * The extension lists, per piece, which material each variant swaps in. Rather
 * than swapping material objects at runtime — which would not reach the clones
 * MotorLab hands out — each variant is resolved once into a list of
 * (live material, the material it should look like) pairs, and changing livery
 * copies one onto the other. Variant zero usually *is* the default material,
 * so it is snapshotted first or switching back to it would do nothing. */
async function readVariants(gltf){
  const names = (gltf.userData?.gltfExtensions?.KHR_materials_variants?.variants || []).map(v => v.name);
  if (!names.length) return null;
  const sets = new Map(names.map(n => [n, []]));
  const seen = new Set(), jobs = [];
  gltf.scene.traverse(o => {
    const mv = o.userData?.gltfExtensions?.KHR_materials_variants;
    if (!o.isMesh || !mv || Array.isArray(o.material)) return;
    const target = o.material;
    for (const m of (mv.mappings || [])) for (const vi of (m.variants || [])){
      const key = target.uuid + '|' + vi;
      if (seen.has(key) || !names[vi]) continue;
      seen.add(key);
      jobs.push(gltf.parser.getDependency('material', m.material)
        .then(src => sets.get(names[vi]).push([target, src === target ? target.clone() : src]))
        .catch(() => {}));
    }
  });
  await Promise.all(jobs);
  return sets;
}

/* Flatten a nested model into one list of meshes, keeping every piece exactly
 * where it was. A file that parents the doors to the underbody and the glass to
 * the doors renders identically either way, but only a flat model can be taken
 * apart a part at a time. Pieces the file left unnamed inherit the name of the
 * nearest thing above them that has one, so a multi-material part stays
 * identifiable. */
function flatten(root){
  root.updateMatrixWorld(true);
  const found = [];
  const walk = (o, inherited) => {
    const name = o.name || inherited;
    if (o.isMesh) found.push([o, name]);
    for (const c of [...o.children]) walk(c, name);
  };
  walk(root, 'piece');
  const out = group('model');
  found.forEach(([mesh, name], i) => {
    mesh.matrix.copy(mesh.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.name = name || ('piece_' + i);
    out.add(mesh);            /* add() detaches it from its old parent */
  });
  return out;
}

/** Build the material for one kind of surface on a scanned model. The colour
 *  the file carried is kept as the tint, so a red taillight stays red. */
function dress(kind, src){
  const tint = src?.color ? src.color.clone() : new THREE.Color(0xb4b8bd);
  switch (kind){
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color:0x0d1116, metalness:0, roughness:0.03,
        clearcoat:1, clearcoatRoughness:0.02, transparent:true, opacity:0.42,
        envMapIntensity:2.4, side:THREE.DoubleSide, depthWrite:false, name:'glass' });
    case 'lamp':
      return new THREE.MeshPhysicalMaterial({ color:tint, emissive:tint, emissiveIntensity:0.55,
        metalness:0.1, roughness:0.18, clearcoat:1, transmission:0.35, thickness:0.01,
        envMapIntensity:1.6, name:'lamp' });
    case 'carbon': {
      /* the real weave, off a scan, under a clearcoat — this is what carbon
         bodywork actually looks like: dark, directional, deeply glossy */
      const m = new THREE.MeshPhysicalMaterial({ color:0x9aa0a6, metalness:0.10, roughness:0.34,
        clearcoat:1, clearcoatRoughness:0.09, envMapIntensity:0.50, name:'carbon' });
      const map = repeated('carbon', 6);
      if (map) m.map = map; else m.color.copy(tint);
      return m;
    }
    case 'chrome':
      return new THREE.MeshStandardMaterial({ color:0xf2f5f8, metalness:1.0, roughness:0.045,
        envMapIntensity:1.9, name:'chrome' });
    case 'alloy':
      return new THREE.MeshStandardMaterial({ color:0xc3c9d0, metalness:0.95, roughness:0.28,
        envMapIntensity:1.4, name:'alloy' });
    case 'satin':
      return new THREE.MeshStandardMaterial({ color:0x1b1e22, metalness:0.55, roughness:0.44,
        envMapIntensity:0.9, name:'satin' });
    case 'tyre': {
      const m = new THREE.MeshStandardMaterial({ color:0x8f9296, metalness:0.0, roughness:0.97,
        envMapIntensity:0.16, name:'tyre' });
      const map = repeated('tread', 8, 2);
      if (map) m.map = map; else m.color.set(0x14161a);
      return m;
    }
    case 'paint':
      return new THREE.MeshPhysicalMaterial({ color:tint.getHex() === 0xffffff ? 0x9aa3ad : tint,
        metalness:0.10, roughness:0.27, clearcoat:1, clearcoatRoughness:0.055,
        envMapIntensity:0.8, name:'paint' });
    default:
      return new THREE.MeshStandardMaterial({ color:tint, metalness:0.35, roughness:0.55,
        envMapIntensity:0.9, side:THREE.DoubleSide, name:'trim' });
  }
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
