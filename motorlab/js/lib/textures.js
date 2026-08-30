/* MotorLab — the scanned texture library.
 *
 * These are photographic maps taken off real hardware: a cross-drilled,
 * gold-coated brake disc, a Brembo six-pot caliper and its normal map, a
 * carbon weave, an underbody pan, and tyre sidewall/tread with their bump
 * maps. Procedurally generated noise gets you a surface; these get you the
 * actual part, lettering and all.
 *
 * Everything loads once, up front, so the geometry builders stay synchronous.
 * If a file is missing the builders simply fall back to the generated
 * materials, so the app still runs with the whole folder deleted.
 */
import * as THREE from 'three';

const DIR = './assets/parts/';

/* file, and whether it holds colour (sRGB) or data (linear) */
const FILES = {
  brakeDisc:            ['brake_disc.png',            'srgb'],
  caliper:              ['caliper.png',               'srgb'],
  caliperNormal:        ['caliper_normal.png',        'data'],
  caliperMirror:        ['caliper_mirror.png',        'srgb'],
  caliperMirrorNormal:  ['caliper_mirror_normal.png', 'data'],
  carbon:               ['carbon.png',                'srgb'],
  underbody:            ['underbody.png',             'srgb'],
  tyreSide:             ['tyre_side.png',             'srgb'],
  tyreSideBump:         ['tyre_side_bump.png',        'data'],
  tyreBack:             ['tyre_back.png',             'srgb'],
  tread:                ['tread.png',                 'srgb'],
  treadBump:            ['tread_bump.png',            'data'],
  engineBay:            ['engine_bay.png',            'srgb'],
  doorline:             ['doorline.png',              'srgb'],
  glassFront:           ['glass_front.png',           'srgb'],
  glassDefrost:         ['glass_defrost.png',         'srgb'],
};

/** Where the caliper artwork actually sits inside its sheet, measured off the
 *  file: the rest of the 512² is empty. */
export const CALIPER_UV = { u0:0.0, u1:0.3594, v0:0.5957, v1:0.7090 };

/** And where the pleated filter element sits in the engine-bay sheet. */
export const FILTER_UV = { u0:0.016, u1:0.984, v0:0.719, v1:0.953 };

/* Photogrammetry-scanned PBR surfaces, CC0, from ambientCG. These carry the
 * micro-detail a generated material cannot invent: the grain of a casting, the
 * tool marks on machined steel, the heat scale on an exhaust, the tooth of
 * rubber. Metals take only the normal and roughness so MotorLab keeps its own
 * palette; the rest take the colour too. */
const SURFACES = {
  cast:    { nrm:'cast_nrm.jpg',    rgh:'cast_rgh.jpg',    col:'cast_col.jpg' },
  steel:   { nrm:'steel_nrm.jpg',   rgh:'steel_rgh.jpg',   col:'steel_col.jpg' },
  hot:     { nrm:'hot_nrm.jpg',     rgh:'hot_rgh.jpg',     col:'hot_col.jpg' },
  rubber:  { nrm:'rubber_nrm.jpg',  rgh:'rubber_rgh.jpg',  col:'rubber_col.jpg' },
  plastic: { nrm:'plastic_nrm.jpg', rgh:'plastic_rgh.jpg', col:'plastic_col.jpg' },
  leather: { nrm:'leather_nrm.jpg', rgh:'leather_rgh.jpg', col:'leather_col.jpg' },
  asphalt: { nrm:'asphalt_nrm.jpg', rgh:'asphalt_rgh.jpg', col:'asphalt_col.jpg' },
  brushed: { nrm:'brushed_nrm.jpg', rgh:'brushed_rgh.jpg' },
  paint:   { nrm:'paint_nrm.jpg',   rgh:'paint_rgh.jpg' },
  floor:   { nrm:'floor_nrm.jpg',   rgh:'floor_rgh.jpg',   col:'floor_col.jpg' },
};
const SURF_DIR = './assets/surfaces/';

const loaded = new Map();
let readyPromise = null;
const waiting = [];

/** The texture for `key`, or null if it has not loaded (or does not exist). */
export function tex(key){ return loaded.get(key) || null; }

/** True once the library has finished loading, successfully or not. */
export function texturesReady(){ return readyPromise !== null && loaded.has('__done'); }

/** Run `fn` once the library is in place — used by materials built early. */
export function whenTextures(fn){
  if (loaded.has('__done')) fn();
  else waiting.push(fn);
}

/** A repeating copy of a loaded map, so one file can dress several parts. */
export function repeated(key, rx, ry = rx){
  const t = tex(key);
  if (!t) return null;
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

/** The maps for one scanned surface, tiled `r` times. Any of them may be null.
 *  `colour` opts in to the scan's own colour, which metals do not want. */
export function surface(name, r = 2, colour = false){
  const spec = SURFACES[name];
  if (!spec) return {};
  const out = {};
  const nrm = repeated('surf_' + name + '_nrm', r);
  const rgh = repeated('surf_' + name + '_rgh', r);
  if (nrm) out.normalMap = nrm;
  if (rgh) out.roughnessMap = rgh;
  if (colour){
    const col = repeated('surf_' + name + '_col', r);
    if (col) out.map = col;
  }
  return out;
}

/** Load every map. Safe to call more than once; resolves even if all fail. */
export function loadTextures(base = ''){
  if (readyPromise) return readyPromise;
  if (typeof document === 'undefined'){            // node-side model tests
    loaded.set('__done', true);
    return (readyPromise = Promise.resolve(loaded));
  }
  const mgr = new THREE.LoadingManager();
  const inlined = globalThis.__MOTORLAB_ASSETS;
  if (inlined) mgr.setURLModifier((url) => {
    const key = './assets/' + String(url).split('/assets/').pop();
    return inlined[key] || url;
  });
  const loader = new THREE.TextureLoader(mgr);
  const one = (key, url, space, wrap) => new Promise((res) => loader.load(url, (t) => {
    t.colorSpace = space === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    /* 16x is the usual hardware maximum, and it is what keeps a floor or a
       tyre wall from smearing into mush at a grazing angle */
    t.anisotropy = 16;
    t.wrapS = t.wrapT = wrap;
    loaded.set(key, t);
    res(t);
  }, undefined, () => res(null)));

  const jobs = Object.entries(FILES).map(([key, [file, space]]) =>
    one(key, base + DIR + file, space, THREE.ClampToEdgeWrapping));
  for (const [name, spec] of Object.entries(SURFACES))
    for (const [kind, file] of Object.entries(spec))
      jobs.push(one(`surf_${name}_${kind}`, base + SURF_DIR + file,
                    kind === 'col' ? 'srgb' : 'data', THREE.RepeatWrapping));

  readyPromise = Promise.all(jobs).then(() => {
    loaded.set('__done', true);
    while (waiting.length) waiting.shift()();
    return loaded;
  });
  return readyPromise;
}
