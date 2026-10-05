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

/* PBR surfaces, CC0, from ambientCG (credits in assets/surfaces/CREDITS.md).
 * These carry the micro-detail a generated material cannot invent: the grain
 * of a sand casting, the tool marks on a machined face, the scale on a forged
 * crank, the knit of a braided hose, the baked skin of wrinkle enamel. Every
 * set has a normal, a roughness and a colour map; which of them a material
 * takes is decided in geo.js (metals mostly keep MotorLab's own palette and
 * use the normal and roughness only, and those sets ship no colour file at all,
 * because the single-file build inlines every file in the folder). The same
 * file names exist at 224 px in assets/surfaces-lite/, which the single-file
 * build swaps in by name.
 *
 * tools/fetch-surfaces.py downloads and prepares them; the roughness maps are
 * levelled there to the real surface's value, so a material that takes one
 * runs roughness 1.0 and reads the truth off the map. */
const SURFACES = {
  cast:     { nrm:'cast_nrm.jpg',     rgh:'cast_rgh.jpg', },     // sand-cast aluminium
  iron:     { nrm:'iron_nrm.jpg',     rgh:'iron_rgh.jpg', },     // cast iron
  rust:     { nrm:'rust_nrm.jpg',     rgh:'rust_rgh.jpg',     col:'rust_col.jpg' },     // heat-cycled iron, rust bloom
  hot:      { nrm:'hot_nrm.jpg',      rgh:'hot_rgh.jpg', },      // heat-scaled steel
  machined: { nrm:'machined_nrm.jpg', rgh:'machined_rgh.jpg', }, // fine tool marks
  steel:    { nrm:'steel_nrm.jpg',    rgh:'steel_rgh.jpg', },    // brushed steel
  forged:   { nrm:'forged_nrm.jpg',   rgh:'forged_rgh.jpg',   col:'forged_col.jpg' },   // forging scale
  zinc:     { nrm:'zinc_nrm.jpg',     rgh:'zinc_rgh.jpg',     col:'zinc_col.jpg' },     // galvanised spangle
  powder:   { nrm:'powder_nrm.jpg',   rgh:'powder_rgh.jpg', },   // black powder coat
  wrinkle:  { nrm:'wrinkle_nrm.jpg',  rgh:'wrinkle_rgh.jpg', },  // wrinkle enamel
  braid:    { nrm:'braid_nrm.jpg',    rgh:'braid_rgh.jpg',    col:'braid_col.jpg' },    // stainless braid
  rubber:   { nrm:'rubber_nrm.jpg',   rgh:'rubber_rgh.jpg',   col:'rubber_col.jpg' },
  plastic:  { nrm:'plastic_nrm.jpg',  rgh:'plastic_rgh.jpg', },
  leather:  { nrm:'leather_nrm.jpg',  rgh:'leather_rgh.jpg',  col:'leather_col.jpg' },
  asphalt:  { nrm:'asphalt_nrm.jpg',  rgh:'asphalt_rgh.jpg',  col:'asphalt_col.jpg' },
  /* generated, not scanned: a faint brushed grain, the orange peel of sprayed
     paint, and the workshop floor */
  brushed:  { nrm:'brushed_nrm.jpg',  rgh:'brushed_rgh.jpg' },
  paint:    { nrm:'paint_nrm.jpg',    rgh:'paint_rgh.jpg' },
  floor:    { nrm:'floor_nrm.jpg',    rgh:'floor_rgh.jpg',    col:'floor_col.jpg' },
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

/** The maps for one surface, tiled `r` times — a number, or [rx, ry] when the
 *  grain should run with the part (tool marks along a shaft, braid along a
 *  hose). Any of them may be null. `colour` opts in to the scan's own colour,
 *  which bare metals mostly do not want. */
export function surface(name, r = 2, colour = false){
  const spec = SURFACES[name];
  if (!spec) return {};
  const [rx, ry] = Array.isArray(r) ? r : [r, r];
  const out = {};
  const nrm = repeated('surf_' + name + '_nrm', rx, ry);
  const rgh = repeated('surf_' + name + '_rgh', rx, ry);
  if (nrm) out.normalMap = nrm;
  if (rgh) out.roughnessMap = rgh;
  if (colour){
    const col = repeated('surf_' + name + '_col', rx, ry);
    if (col) out.map = col;
  }
  return out;
}

/** True when the surface library has at least one map of `name` loaded. */
export function hasSurface(name){
  return loaded.has('surf_' + name + '_nrm') || loaded.has('surf_' + name + '_rgh');
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
