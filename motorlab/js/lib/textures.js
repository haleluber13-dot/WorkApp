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
  readyPromise = Promise.all(Object.entries(FILES).map(([key, [file, space]]) =>
    new Promise((res) => loader.load(base + DIR + file, (t) => {
      t.colorSpace = space === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      loaded.set(key, t);
      res(t);
    }, undefined, () => res(null)))
  )).then(() => {
    loaded.set('__done', true);
    while (waiting.length) waiting.shift()();
    return loaded;
  });
  return readyPromise;
}
