/* MotorLab — the studio.
 *
 * Everything that makes the 3D view read as a product shot rather than a
 * debug viewport, and nothing about the models themselves: the light rig, the
 * floor it all stands on, the per-tier render settings, and the small amount
 * of colour maths that keeps the fog and the backdrop the same colour once
 * the tone mapper has had its way with them.
 *
 * All of it is fitted to the subject. An engine is 0.6 m across and a car is
 * 4.5 m, so nothing here is in fixed metres — the rig, the shadow camera, the
 * pool of light and the fog all scale from the bounding box the viewport hands
 * over each time a model is set.
 */
import * as THREE from 'three';

/** Render quality presets. `pixelRatio` is a cap on devicePixelRatio. */
export const TIERS = {
  fast:     { label:'Fast',     pixelRatio:1,   shadows:false, shadowMap:0,    composer:false, ssao:false, smaa:false, msaa:0 },
  balanced: { label:'Balanced', pixelRatio:1.5, shadows:true,  shadowMap:1024, composer:true,  ssao:false, smaa:true,  msaa:4 },
  high:     { label:'High',     pixelRatio:1.5, shadows:true,  shadowMap:2048, composer:true,  ssao:true,  smaa:true,  msaa:4 },
};

/** The look: colours and levels shared by every tier. */
export const LOOK = {
  /* the backdrop, display-referred — what you actually see behind the model */
  background: 0x0c0e13,
  /* the floor's own colour; the vignette map and the lights do the rest */
  floor: 0x15171c,
  /* per-environment gain: each HDR arrives at whatever brightness the room
     happened to be, and the generated room is dimmer than either photograph */
  envGain: { garage:1.45, studio:1.05, neutral:0.95, other:1.1 },
  exposure: 1.02,
  /* the light rig, as multiples of the subject's bounding-sphere radius */
  key:  { color:0xfff0dc, intensity:2.3, dir:new THREE.Vector3( 0.85, 1.30, 0.95), dist:4.0 },
  fill: { color:0xbed2ff, intensity:0.70, dir:new THREE.Vector3(-1.25, 0.40, 1.00), dist:4.0 },
  rim:  { color:0xe6edff, intensity:1.70, dir:new THREE.Vector3(-0.65, 0.85, -1.25), dist:4.0 },
  hemi: { sky:0x9db4d8, ground:0x15181f, intensity:0.24 },
  /* an overhead soft spot that puts the subject in a pool of light on the
     floor; `irradiance` is what lands on the floor, the candela follow */
  pool: { color:0xfff4e6, irradiance:0.34, height:4.5, reach:2.3, penumbra:0.9 },
  contactOpacity: 0.50,
};

/* ------------------------------------------------------------------------ */
/* Tone-mapping inverse.
 *
 * Fog is applied inside the material shaders, before the tone mapper; the
 * backdrop colour is cleared straight into the canvas, after it. Give both
 * the same hex and the floor fades into a horizon that is visibly darker than
 * the sky behind it. So the fog (and, when the frame goes through the
 * composer, the clear colour too) gets the colour that the tone mapper will
 * turn INTO the backdrop colour. ACES has no closed-form inverse worth
 * writing down; a bisection per channel is exact enough and runs once. */
function acesFit(v){
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
}
function acesForward(linear, exposure){
  /* mirrors three's ACESFilmicToneMapping for a grey value (the RRT/ODT
     matrices are near-identity for neutral colours) */
  return THREE.MathUtils.clamp(acesFit(linear * exposure / 0.6), 0, 1);
}
function invertAces(target, exposure){
  let lo = 0, hi = 4;
  for (let i = 0; i < 40; i++){
    const mid = (lo + hi) / 2;
    if (acesForward(mid, exposure) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/** The linear colour that tone-maps to `display` (a display-referred Color). */
export function preToneMapped(display, exposure = 1, toneMapping = THREE.ACESFilmicToneMapping){
  const out = new THREE.Color();
  const lin = display.clone();                    // Color stores working-space (linear) values
  if (toneMapping === THREE.NoToneMapping) return lin;
  if (toneMapping !== THREE.ACESFilmicToneMapping){
    /* other mappers are gentle in the darks — a plain exposure undo is close */
    return lin.multiplyScalar(1 / Math.max(0.01, exposure));
  }
  out.r = invertAces(lin.r, exposure);
  out.g = invertAces(lin.g, exposure);
  out.b = invertAces(lin.b, exposure);
  return out;
}

/* ------------------------------------------------------------------------ */
/* The light rig. */
export function buildRig(){
  const group = new THREE.Group();
  group.name = 'studio-rig';
  const hemi = new THREE.HemisphereLight(LOOK.hemi.sky, LOOK.hemi.ground, LOOK.hemi.intensity);

  const key = new THREE.DirectionalLight(LOOK.key.color, LOOK.key.intensity);
  key.name = 'key';
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 2;

  const fill = new THREE.DirectionalLight(LOOK.fill.color, LOOK.fill.intensity);
  fill.name = 'fill';
  const rim = new THREE.DirectionalLight(LOOK.rim.color, LOOK.rim.intensity);
  rim.name = 'rim';
  const pool = new THREE.SpotLight(LOOK.pool.color, 0, 0, Math.PI / 5, LOOK.pool.penumbra, 2);
  pool.name = 'pool';

  group.add(hemi, key, key.target, fill, fill.target, rim, rim.target, pool, pool.target);
  return { group, hemi, key, fill, rim, pool };
}

/** Aim and size the rig for a subject.
 *  @param rig    from buildRig()
 *  @param box    world-space Box3 of the subject
 *  @param floorY where the floor is
 *  @param tier   one of TIERS (for the shadow map size) */
export function fitRig(rig, box, floorY, tier){
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(0.25, size.length() / 2);

  const place = (light, spec) => {
    light.position.copy(c).addScaledVector(spec.dir.clone().normalize(), r * spec.dist);
    light.target.position.copy(c);
    light.target.updateMatrixWorld();
  };
  place(rig.key, LOOK.key);
  place(rig.fill, LOOK.fill);
  place(rig.rim, LOOK.rim);

  /* The shadow camera: an orthographic box just big enough for the subject
     and the floor around it where its shadow lands. Tight is what gives the
     texels to resolve a bolt head; the margin is what keeps the shadow of a
     long bonnet from being sliced off at the frustum edge. */
  const sh = rig.key.shadow;
  const half = r * 1.6;
  const cam = sh.camera;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
  cam.near = r * (LOOK.key.dist - 1.8);
  cam.far  = r * (LOOK.key.dist + 2.4);
  cam.updateProjectionMatrix();
  /* bias in texels: two texels of normal offset is enough to clear acne on a
     curved surface and small enough that a thin part still touches its own
     shadow; the depth bias is a hair, so contact shadows stay in contact */
  const mapSize = tier?.shadowMap || 2048;
  const texel = (half * 2) / mapSize;
  sh.normalBias = texel * 2.2;
  sh.bias = -0.00012;
  if (sh.mapSize.x !== mapSize){
    sh.mapSize.set(mapSize, mapSize);
    sh.map?.dispose?.();
    sh.map = null;
  }

  /* the pool of light on the floor */
  const p = LOOK.pool;
  const h = r * p.height + (c.y - floorY);
  rig.pool.position.set(c.x, floorY + h, c.z + r * 0.25);
  rig.pool.target.position.set(c.x, floorY, c.z);
  rig.pool.target.updateMatrixWorld();
  rig.pool.angle = Math.min(Math.PI / 2.6, Math.atan((r * p.reach) / h));
  rig.pool.penumbra = p.penumbra;
  rig.pool.intensity = p.irradiance * h * h;      // candela → the asked-for lux at the floor
  rig.pool.distance = 0;
  return { c, size, r };
}

/* ------------------------------------------------------------------------ */
/* The floor. */

/** A radial gradient on a canvas: `stops` are [t, grey] pairs, t in 0..1 of
 *  the radius. Used for the floor vignette and the contact-shadow blob. */
function radialTexture(size, stops, alpha = false){
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  for (const [t, v] of stops){
    const k = Math.round(v * 255);
    grad.addColorStop(t, alpha ? `rgba(0,0,0,${v.toFixed(3)})` : `rgb(${k},${k},${k})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

/** Floor, grid and the contact-shadow blob, in one group. Unit-sized; the
 *  viewport scales and places it per subject with fitFloor(). */
export function buildFloor(){
  const group = new THREE.Group();
  group.name = 'studio-floor';

  const vignette = typeof document !== 'undefined'
    ? radialTexture(1024, [[0, 1.0], [0.08, 0.90], [0.18, 0.50], [0.35, 0.22], [0.60, 0.09], [1.0, 0.04]])
    : null;
  const mat = new THREE.MeshStandardMaterial({
    color: LOOK.floor, roughness: 0.90, metalness: 0.0, envMapIntensity: 0.16, map: vignette });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 128), mat);
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const blob = typeof document !== 'undefined'
    ? radialTexture(512, [[0, 1.0], [0.25, 0.80], [0.55, 0.32], [0.80, 0.08], [1.0, 0.0]], true)
    : null;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color:0x000000, map: blob, transparent:true,
      opacity:LOOK.contactOpacity, depthWrite:false, fog:false }));
  contact.name = 'contact';
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = 1;
  group.add(contact);

  const gridHolder = new THREE.Group();
  gridHolder.name = 'grid';
  group.add(gridHolder);

  return { group, floor, floorMat: mat, contact, gridHolder, grid: null };
}

/** Size the floor to the subject: the slab, the pool, the blob and the grid.
 *  Returns the floor radius, which is also where the fog should have fully
 *  closed in. */
export function fitFloor(fl, box, floorY){
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(0.25, size.length() / 2);

  const radius = Math.max(10, r * 22);
  fl.group.position.set(0, floorY, 0);
  fl.floor.position.set(c.x, 0, c.z);
  fl.floor.scale.setScalar(radius);
  /* the vignette is drawn across the whole slab; the bright pool is the inner
     tenth of it, so it scales with the subject for free */
  fl.floorMat.normalMap?.repeat.set(radius * 1.4, radius * 1.4);
  fl.floorMat.roughnessMap?.repeat.set(radius * 1.4, radius * 1.4);

  /* the soft contact shadow is the footprint, a little larger, flattened */
  fl.contact.position.set(c.x, 0.002, c.z);
  fl.contact.scale.set(Math.max(0.2, size.x * 1.30), Math.max(0.2, size.z * 1.30), 1);

  /* grid cells: 10 cm for an engine, 50 cm for a car */
  const cell = r < 1.2 ? 0.1 : r < 3 ? 0.5 : 1.0;
  const span = Math.ceil(radius * 0.9 / cell) * cell * 2;
  if (fl.grid){ fl.gridHolder.remove(fl.grid); fl.grid.geometry.dispose(); fl.grid.material.dispose(); }
  const grid = new THREE.GridHelper(span, Math.round(span / cell), 0x2a3140, 0x1b202a);
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  grid.material.depthWrite = false;
  grid.position.set(Math.round(c.x / cell) * cell, 0.001, Math.round(c.z / cell) * cell);
  fl.gridHolder.add(grid);
  fl.grid = grid;
  return radius;
}

/* ------------------------------------------------------------------------ */
/** Ambient-occlusion settings for a subject of bounding radius `r`, with the
 *  camera's near/far — the pass measures its distances in orthographic depth,
 *  0..1 across near..far, so they have to be converted every time the camera
 *  changes. kernelRadius is in view-space metres. */
export function ssaoFor(r, near, far){
  const range = Math.max(1e-3, far - near);
  const kernel = THREE.MathUtils.clamp(r * 0.085, 0.03, 0.30);
  return {
    kernelRadius: kernel,
    minDistance: (r * 0.0025) / range,
    maxDistance: (kernel * 1.5) / range,
  };
}
