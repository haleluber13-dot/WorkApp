/* MotorLab — small geometry/material toolkit shared by every 3D builder. */
import * as THREE from 'three';
import { tex, repeated, surface, whenTextures, CALIPER_UV, FILTER_UV } from './textures.js';
import { partMesh } from './partModels.js';

/** Put a real surface onto a material: the normal and roughness always, the
 *  colour only where the scan's own colour is the material (rust bloom,
 *  forging scale, zinc spangle, braid). Anything the procedural version
 *  supplied for the same slot is dropped, so the two do not fight.
 *
 *  `repeat` is a number or [rx, ry] (tool marks along a shaft, braid along a
 *  hose). The roughness maps are levelled to the real surface's value by
 *  tools/fetch-surfaces.py, so when one is applied the material's roughness
 *  becomes a plain multiplier and defaults to 1.0: the map is the truth.
 *  `opts.rough` overrides that multiplier (a brighter casting, a duller
 *  steel); `opts.rough === false` leaves the roughness map off altogether
 *  (chrome, which has no roughness structure worth tiling). */
function dressSurface(m, name, repeat, normalScale = 1, useColour = false, opts = {}){
  const maps = surface(name, repeat, useColour);
  if (!maps.normalMap && !maps.roughnessMap) return false;
  if (maps.normalMap){
    m.normalMap = maps.normalMap;
    m.normalScale = new THREE.Vector2(normalScale, normalScale);
    m.bumpMap = null;
  }
  if (maps.roughnessMap && opts.rough !== false){
    m.roughnessMap = maps.roughnessMap;
    m.roughness = typeof opts.rough === 'number' ? opts.rough : 1.0;
  }
  if (maps.map){
    m.map = maps.map;
    if (opts.tint != null) m.color.set(opts.tint);
  }
  return true;
}

/** Dress a material once the surface library is in place. Until then — and
 *  if the files are missing — the procedural look stands in. */
function scanned(m, dress){
  whenTextures(() => { dress(m); m.needsUpdate = true; });
  return m;
}

/* ----------------------------------------------------------------------
 * Procedural surface detail. A perfectly uniform surface is the giveaway that
 * something is computer generated — real castings have grain, machined faces
 * have tool marks, rubber has a matte tooth. Generated once into a canvas.
 * -------------------------------------------------------------------- */
const _tex = new Map();
function makeTex(key, size, draw){
  if (_tex.has(key)) return _tex.get(key);
  if (typeof document === 'undefined'){ _tex.set(key, null); return null; }   // node-side model tests
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  _tex.set(key, t);
  return t;
}
/** Sand-cast grain: clustered speckle, the surface an engine block actually has. */
function castGrain(){
  return makeTex('cast', 256, (g, n) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, n, n);
    const img = g.getImageData(0, 0, n, n), d = img.data;
    for (let i = 0; i < d.length; i += 4){
      const v = 154 + (Math.random() - 0.5) * 92;
      d[i] = d[i+1] = d[i+2] = v;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 900; i++){                     // pitting
      g.fillStyle = `rgba(90,90,90,${0.05 + Math.random()*0.16})`;
      g.beginPath();
      g.arc(Math.random()*n, Math.random()*n, Math.random()*2.6 + 0.4, 0, Math.PI*2);
      g.fill();
    }
  });
}
/** Machined face: fine parallel tool marks. */
function machined(){
  return makeTex('machined', 256, (g, n) => {
    g.fillStyle = '#6f6f6f'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y++){
      g.fillStyle = `rgba(255,255,255,${Math.random()*0.13})`;
      g.fillRect(0, y, n, 1);
      g.fillStyle = `rgba(0,0,0,${Math.random()*0.10})`;
      g.fillRect(0, y + 0.5, n, 0.5);
    }
  });
}
/** Rubber: matte, slightly noisy, no specular structure. */
function rubberTooth(){
  return makeTex('rubber', 128, (g, n) => {
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 5000; i++){
      g.fillStyle = `rgba(0,0,0,${Math.random()*0.20})`;
      g.fillRect(Math.random()*n, Math.random()*n, 1.4, 1.4);
    }
  });
}
/** Tread pattern, drawn as a height field: circumferential grooves, shoulder
 *  blocks and sipes. The scanned rubber supplies the colour and the grain; this
 *  supplies the pattern, because the scan came off a slick. */
function treadPattern(kind){
  return makeTex('treadpat_' + kind, 256, (g, n) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, n, n);
    if (kind === 'knobby'){
      g.fillStyle = '#141414'; g.fillRect(0, 0, n, n);
      g.fillStyle = '#e8e8e8';
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 3; c++){
          const off = (r % 2) * 0.16;
          g.fillRect((c / 3 + off) * n, (r / 4 + 0.03) * n, 0.17 * n, 0.19 * n);
        }
      return;
    }
    for (const [y, hh] of [[0.20, 0.070], [0.50, 0.050], [0.80, 0.070]]){   // grooves
      g.fillStyle = '#181818';
      g.fillRect(0, (y - hh / 2) * n, n, hh * n);
    }
    g.fillStyle = '#242424';                                               // shoulder slots
    for (let i = 0; i < 4; i++){
      const x = (i / 4) * n;
      g.save(); g.translate(x, 0); g.rotate(0.16);
      g.fillRect(0, 0.01 * n, 0.075 * n, 0.15 * n);
      g.fillRect(0, 0.84 * n, 0.075 * n, 0.15 * n);
      g.restore();
    }
    g.fillStyle = 'rgba(30,30,30,0.85)';                                   // sipes
    for (let i = 0; i < 7; i++){
      const x = (i / 7) * n;
      g.fillRect(x, 0.255 * n, 0.022 * n, 0.19 * n);
      g.fillRect(x + n / 14, 0.555 * n, 0.022 * n, 0.19 * n);
    }
  });
}
function repeatXY(t, rx, ry){
  if (!t) return null;
  const c = t.clone(); c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  return c;
}
function withRepeat(t, r){
  if (!t) return null;
  const c = t.clone(); c.needsUpdate = true;
  const [rx, ry] = Array.isArray(r) ? r : [r, r];
  c.repeat.set(rx, ry);
  return c;
}

/** Give a geometry that has no `uv` attribute one, by box projection: each
 *  vertex takes the two coordinates across its dominant normal axis, in
 *  metres times `perMetre`. The surface maps need UVs to show at all, and a
 *  hand-built BufferGeometry (a volute, a blade, a shell) has none — without
 *  this the GPU reads uv (0,0) everywhere and the part comes out as one flat
 *  texel. Call it after computeVertexNormals(); returns the geometry. */
export function ensureUV(g, perMetre = 1){
  if (!g || g.attributes.uv || !g.attributes.position) return g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz){ u = z; v = y; }
    else if (ny >= nz){ u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u * perMetre; uv[i * 2 + 1] = v * perMetre;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/* Materials are shared: a V12 uses one aluminium, not twelve. */
const _mat = new Map();
const mat = (key, make) => { if (!_mat.has(key)) _mat.set(key, make()); return _mat.get(key); };

/* One envMapIntensity for the whole palette. What makes a metal read brighter
 * or duller than its neighbour is its roughness and its colour, never a
 * private gain on the reflections; the moment one part has 1.6 and the next
 * 0.4 the bright one glows and the dull one looks unlit. */
const ENV = 1.0;

/* UV repeats, by the size of part each material usually covers. Box and
 * cylinder faces span 0..1 in UV whatever their size, extrusions carry metres,
 * so a repeat is roughly "tiles per part" on the first and "tiles per metre"
 * on the second; these values land both at a grain that is right at engine
 * scale. Hardware runs a low repeat on purpose: a bolt head must not show the
 * same number of speckles as a block face. */
const REP = {
  block:    5,          // the block, the sump, the big castings
  casting:  4,          // heads, covers, housings
  housing:  3,          // pumps, alternators, small castings
  shaft:    [1, 3],     // crank and shafts: marks along the length
  hardware: 0.8,        // bolts, nuts, washers, clamps
  hose:     [8, 1.5],   // along the tube, round the tube
  cover:    4,          // painted cam covers
};

export const MAT = {
  /* sand-cast aluminium: the head, the covers, the housings. Bare metal, so
     metalness 1 and the colour is the reflectance of aluminium; the grain and
     the dullness come off the cast scan. Brighter than the block because a
     head is a cleaner, finer casting that gets handled and wiped. */
  alloy: () => mat('alloy', () => scanned(new THREE.MeshStandardMaterial({
    color:0xb8bdc3, metalness:1.0, roughness:0.66, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 3), bumpMap: withRepeat(castGrain(), 3), bumpScale:0.6 }),
    m => dressSurface(m, 'cast', REP.casting, 1.0, false, { rough: 0.92 }))),
  /* the block and the big structural castings: sand-cast, unmachined, and a
     good deal duller than the head and the covers bolted to it. Casting them
     all in the same bright alloy is what made an engine read as one lump of
     machined metal instead of an assembly of different parts. */
  cast: () => mat('cast', () => scanned(new THREE.MeshStandardMaterial({
    color:0x9da2a8, metalness:1.0, roughness:0.86, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 3), bumpMap: withRepeat(castGrain(), 3), bumpScale:0.9 }),
    m => dressSurface(m, 'cast', REP.block, 1.4, false, { rough: 1.0 }))),
  /* glass-filled nylon: what the inlet manifold and most top covers are made
     of on anything built since about 1995 */
  composite: () => mat('composite', () => scanned(new THREE.MeshStandardMaterial({
    color:0x1c1f24, metalness:0.0, roughness:0.55, envMapIntensity:ENV }),
    m => dressSurface(m, 'plastic', REP.housing, 1.2))),
  alloyDark: () => mat('alloyDark', () => scanned(new THREE.MeshStandardMaterial({
    color:0x6f757c, metalness:1.0, roughness:0.74, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.7 }),
    m => dressSurface(m, 'cast', REP.housing, 1.2))),
  /* cast iron: darker, rougher, coarser grain than aluminium, and still a
     metal — grey iron reflects about half what aluminium does */
  iron: () => mat('iron', () => scanned(new THREE.MeshStandardMaterial({
    color:0x5d6166, metalness:1.0, roughness:0.86, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 5), bumpMap: withRepeat(castGrain(), 5), bumpScale:0.8 }),
    m => dressSurface(m, 'iron', REP.block, 1.5))),
  /* forged steel as it comes out of the die and the heat treat: dark grey-
     brown scale, no polish — the webs of a crank, the beam of a rod. The
     scan's own mottle is the scale, so its colour is taken, tinted dark. */
  forged: () => mat('forged', () => scanned(new THREE.MeshStandardMaterial({
    color:0x3b3e43, metalness:1.0, roughness:0.60, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.45 }),
    m => dressSurface(m, 'forged', REP.shaft, 1.2, true, { tint: 0x9a9b9e }))),
  /* a multi-layer steel head gasket: bright steel sheets with a dark elastomer
     coat, seen edge-on as a thin silver line */
  mls: () => mat('mls', () => new THREE.MeshStandardMaterial({
    color:0x9ea2a4, metalness:1.0, roughness:0.50, envMapIntensity:ENV })),
  /* yellow zinc-chromate: the gold bolts, brackets and clamps on every
     Japanese engine of the 1990s — the galvanised spangle under a gold tint */
  zincYellow: () => mat('zincYellow', () => scanned(new THREE.MeshStandardMaterial({
    color:0xc9a84a, metalness:1.0, roughness:0.42, envMapIntensity:ENV }),
    m => dressSurface(m, 'zinc', REP.hardware, 0.8, true, { tint: 0xf4c85c, rough: 0.9 }))),
  /* a cast-iron exhaust manifold after a few hundred heat cycles: brown-grey
     scale with a rust bloom, darker toward the flanges, no shine at all. The
     rust is colour, so this one takes the scan's colour. */
  ironHot: () => mat('ironHot', () => scanned(new THREE.MeshStandardMaterial({
    color:0x57514c, metalness:0.5, roughness:0.92, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 5), bumpMap: withRepeat(castGrain(), 5), bumpScale:0.9 }),
    m => dressSurface(m, 'rust', REP.housing, 1.3, true, { tint: 0xe0d8d0 }))),
  /* a face that has been through the mill: bright, flat, fine tool marks that
     run one way — the grain is stretched along the part so the highlight
     streaks like it does on a turned or fly-cut surface */
  machined: () => mat('machined', () => scanned(new THREE.MeshStandardMaterial({
    color:0xd0d4d8, metalness:1.0, roughness:0.30, envMapIntensity:ENV,
    roughnessMap: withRepeat(machined(), 3), bumpMap: withRepeat(machined(), 3), bumpScale:0.15 }),
    m => dressSurface(m, 'machined', [1.5, 4], 0.7))),
  /* forged and machined steel: brushed, low roughness — shafts, springs,
     fasteners, the bright parts of a crank */
  steel: () => mat('steel', () => scanned(new THREE.MeshStandardMaterial({
    color:0xb6bcc4, metalness:1.0, roughness:0.40, envMapIntensity:ENV,
    roughnessMap: withRepeat(machined(), 2), bumpMap: withRepeat(machined(), 2), bumpScale:0.25 }),
    m => dressSurface(m, 'steel', [1, 2.5], 0.6))),
  /* chrome: a mirror with the faintest polish lines, and no roughness map,
     because a tiled roughness pattern on a mirror reads as dirt */
  chrome: () => mat('chrome', () => scanned(new THREE.MeshStandardMaterial({
    color:0xeef2f7, metalness:1.0, roughness:0.08, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [2, 6], 0.15, false, { rough: false }))),
  copper: () => mat('copper', () => scanned(new THREE.MeshStandardMaterial({
    color:0xc4763a, metalness:1.0, roughness:0.32, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [1, 3], 0.4, false, { rough: 0.8 }))),
  brass: () => mat('brass', () => scanned(new THREE.MeshStandardMaterial({
    color:0xc9a227, metalness:1.0, roughness:0.30, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [1, 3], 0.4, false, { rough: 0.8 }))),
  /* a bearing shell: steel back, white-metal face, both bright */
  bearing: () => mat('bearing', () => scanned(new THREE.MeshStandardMaterial({
    color:0xd7c9a8, metalness:1.0, roughness:0.34, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [1, 3], 0.4, false, { rough: 0.85 }))),
  /* rubber: the scan's colour (already near black) under a light grey tint,
     matte, with the tooth off the normal map */
  rubber: () => mat('rubber', () => scanned(new THREE.MeshStandardMaterial({
    color:0x14161a, metalness:0.0, roughness:0.94, envMapIntensity:ENV,
    roughnessMap: withRepeat(rubberTooth(), 6), bumpMap: withRepeat(rubberTooth(), 6), bumpScale:0.5 }),
    m => dressSurface(m, 'rubber', REP.housing, 1.0, true, { tint: 0xb4b6ba }))),
  plastic: () => mat('plastic', () => scanned(new THREE.MeshStandardMaterial({
    color:0x23282f, metalness:0.0, roughness:0.58, envMapIntensity:ENV }),
    m => dressSurface(m, 'plastic', REP.housing, 1.0))),
  /* exhaust side: heat-scaled steel. Not copper — headers go straw, then blue,
     then a dull grey scale, and they were reading like plumbing. */
  hot: () => mat('hot', () => scanned(new THREE.MeshStandardMaterial({
    color:0x7a7673, metalness:0.9, roughness:0.74, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.6 }),
    m => dressSurface(m, 'hot', REP.hose, 1.0))),
  /* painted components: a dielectric under a clearcoat, which is what makes
     paint read as paint. No metalness — paint is not metal. */
  red: () => mat('red', () => new THREE.MeshPhysicalMaterial({
    color:0xb52a20, metalness:0.0, roughness:0.38, clearcoat:1, clearcoatRoughness:0.10, envMapIntensity:ENV })),
  orange: () => mat('orange', () => new THREE.MeshPhysicalMaterial({
    color:0xd9741f, metalness:0.0, roughness:0.36, clearcoat:0.8, clearcoatRoughness:0.16, envMapIntensity:ENV })),
  blue: () => mat('blue', () => new THREE.MeshPhysicalMaterial({
    color:0x2f6fb0, metalness:0.0, roughness:0.38, clearcoat:0.8, clearcoatRoughness:0.14, envMapIntensity:ENV })),
  /* black oxide: the dark, slightly oily finish of German hardware */
  black: () => mat('black', () => scanned(new THREE.MeshStandardMaterial({
    color:0x1a1c20, metalness:1.0, roughness:0.55, envMapIntensity:ENV }),
    m => dressSurface(m, 'steel', REP.hardware, 0.5))),
  glass: () => mat('glass', () => new THREE.MeshPhysicalMaterial({
    color:0x9fd4ff, metalness:0, roughness:0.05, transmission:0.9, thickness:0.02,
    transparent:true, opacity:0.45, envMapIntensity:ENV })),
  /* a copper-faced gasket, seen edge-on */
  gasket: () => mat('gasket', () => new THREE.MeshStandardMaterial({
    color:0xc4631f, metalness:1.0, roughness:0.48, envMapIntensity:ENV })),
  wire: (c) => mat('wire' + c, () => new THREE.MeshStandardMaterial({
    color:c, metalness:0.0, roughness:0.48, envMapIntensity:ENV })),
  emissive: (c, i=1.4) => new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:i, roughness:.4 }),
  /* machined alloy wheel: brighter and smoother than a casting, because the
     face of a road wheel is turned and lacquered */
  rimAlloy: () => mat('rimAlloy', () => scanned(new THREE.MeshStandardMaterial({
    color:0xc6ccd4, metalness:1.0, roughness:0.26, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [3, 1], 0.5, false, { rough: 0.7 }))),
  /* real carbon-fibre weave, off a scan; used for aero, tubs and trim */
  carbon: () => mat('carbon', () => scanned(new THREE.MeshPhysicalMaterial({
    color:0xffffff, metalness:0.0, roughness:0.30, clearcoat:1, clearcoatRoughness:0.07,
    envMapIntensity:ENV }), m => { m.map = repeated('carbon', 3); if (!m.map) m.color.set(0x1b1d20); })),
  /* the underbody pan: seam sealer, spray-on deadener, road grime */
  underbody: () => mat('underbody', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.0, roughness:0.90, envMapIntensity:ENV }),
    m => { m.map = repeated('underbody', 3, 2); if (!m.map) m.color.set(0x2a2c30); })),
  /* tyre crown: scanned rubber for colour and grain, pattern on top. The scan
     came off a slick, so a road or knobby tyre gets its blocks from here. */
  tread: (kind = 'road') => mat('tread_' + kind, () => scanned(new THREE.MeshStandardMaterial({
    color:0x9c9fa2, metalness:0.0, roughness:0.96, envMapIntensity:ENV }), m => {
      m.map = repeated('tread', 24, 1);
      if (!m.map) m.color.set(0x16181c);
      m.bumpMap = kind === 'slick' ? repeated('treadBump', 24, 1)
                                   : repeatXY(treadPattern(kind), 24, 1);
      m.bumpScale = kind === 'slick' ? 1.0 : 2.2;
    })),
  /* tyre sidewall, lettering and all — mapped flat onto an annulus */
  sidewall: (outer = true) => mat('sidewall' + outer, () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.0, roughness:0.92, envMapIntensity:ENV,
    transparent:true, alphaTest:0.35, side:THREE.DoubleSide }), m => {
      m.map = tex(outer ? 'tyreSide' : 'tyreBack');
      m.bumpMap = tex('tyreSideBump'); m.bumpScale = 0.8;
      if (!m.map){ m.color.set(0x14161a); m.transparent = false; m.alphaTest = 0; }
    })),
  /* cross-drilled, gold-coated disc face, straight off the part */
  discFace: () => mat('discFace', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.75, roughness:0.42, envMapIntensity:ENV,
    transparent:true, alphaTest:0.5, side:THREE.DoubleSide }),
    m => { m.map = tex('brakeDisc'); if (!m.map){ m.color.set(0x5a5f66); m.transparent = false; m.alphaTest = 0; } })),
  /* six-pot caliper shell: photo albedo plus its own normal map */
  caliperShell: () => mat('caliperShell', () => scanned(new THREE.MeshPhysicalMaterial({
    color:0xffffff, metalness:0.0, roughness:0.36, clearcoat:0.9, clearcoatRoughness:0.10,
    envMapIntensity:ENV }), m => {
      m.map = tex('caliper'); m.normalMap = tex('caliperNormal');
      if (m.normalMap) m.normalScale = new THREE.Vector2(1.1, 1.1);
      if (!m.map) m.color.set(0xb52a20);
    })),
  /* coil body: glass-filled epoxy — dark, but not black, and semi-matte */
  coilBody: () => mat('coilBody', () => scanned(new THREE.MeshStandardMaterial({
    color:0x3a4048, metalness:0.0, roughness:0.55, envMapIntensity:ENV }),
    m => dressSurface(m, 'plastic', 1.5, 0.8))),
  /* alumina insulator: near-white, slightly translucent, semi-gloss glaze */
  ceramic: () => mat('ceramic', () => new THREE.MeshPhysicalMaterial({
    color:0xe8e4dc, metalness:0.0, roughness:0.30, clearcoat:0.5, clearcoatRoughness:0.25,
    sheen:0.3, sheenColor:0xfff8ee, envMapIntensity:ENV })),
  /* corrugated nylon conduit — the black tubing every engine loom runs inside */
  conduit: () => mat('conduit', () => scanned(new THREE.MeshStandardMaterial({
    color:0x15171b, metalness:0.0, roughness:0.62, envMapIntensity:ENV }),
    m => dressSurface(m, 'plastic', REP.hose, 1.0))),
  /* the moulded shell of a connector: glass-filled nylon, matt, slightly grey */
  connector: () => mat('connector', () => scanned(new THREE.MeshStandardMaterial({
    color:0x1d2026, metalness:0.0, roughness:0.58, envMapIntensity:ENV }),
    m => dressSurface(m, 'plastic', 1, 0.8))),
  /* stainless braid over a PTFE oil or fuel line: the knit runs along the
     hose, and the scan's own light-and-shadow of the weave is the colour */
  braid: () => mat('braid', () => scanned(new THREE.MeshStandardMaterial({
    color:0xb4bac2, metalness:1.0, roughness:0.44, envMapIntensity:ENV }),
    m => dressSurface(m, 'braid', REP.hose, 1.0, true, { tint: 0xffffff }))),
  /* anodised aluminium, which is what an AN fitting is: a dyed oxide skin on
     a machined part, so the tool marks show through the colour */
  anodised: () => mat('anodised', () => scanned(new THREE.MeshStandardMaterial({
    color:0x2b5f9c, metalness:1.0, roughness:0.36, envMapIntensity:ENV }),
    m => dressSurface(m, 'machined', [1, 2], 0.5, false, { rough: 0.9 }))),
  /* stamped stainless: heat shields, and only heat shields */
  stainless: () => mat('stainless', () => scanned(new THREE.MeshStandardMaterial({
    color:0xc6cad0, metalness:1.0, roughness:0.26, envMapIntensity:ENV,
    side:THREE.DoubleSide }),
    m => dressSurface(m, 'steel', 2, 0.5, false, { rough: 0.7 }))),
  /* zinc-plated fastener finish: bright, a spangle under the brightness,
     not chrome. Low repeat: a bolt head shows a few crystals, not a field. */
  plated: () => mat('plated', () => scanned(new THREE.MeshStandardMaterial({
    color:0xcfd3cf, metalness:1.0, roughness:0.34, envMapIntensity:ENV }),
    m => dressSurface(m, 'zinc', REP.hardware, 0.8, true, { tint: 0xf6f8f4, rough: 0.8 }))),
  /* the bonded rubber ring in a harmonic damper */
  damperRubber: () => mat('damperRubber', () => scanned(new THREE.MeshStandardMaterial({
    color:0x1a1a1c, metalness:0.0, roughness:0.85, envMapIntensity:ENV }),
    m => dressSurface(m, 'rubber', 2, 0.8))),
  /* clutch friction lining: pressed, matte, brown-grey */
  friction: () => mat('friction', () => scanned(new THREE.MeshStandardMaterial({
    color:0x5b5148, metalness:0.0, roughness:0.92, envMapIntensity:ENV }),
    m => dressSurface(m, 'cast', 2, 0.6))),
  /* a pleated filter element, off a real one */
  airFilter: () => mat('airFilter', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.0, roughness:0.72, envMapIntensity:ENV,
    side:THREE.DoubleSide }),
    m => { m.map = tex('engineBay'); if (!m.map) m.color.set(0xb04a4a); })),
  /* maker finishes on engine castings (realism.md §1.3): wrinkle paint is a
     thick textured enamel baked onto cam covers — matte, grainy, never shiny,
     and its skin is the one thing a flat colour can never fake, so it comes
     off a real wrinkle-enamel normal map with the colour on top; gloss is
     sprayed enamel on an iron block or a cover (small-block orange, Ferrari
     red), a dielectric under a clearcoat with the casting grain still showing
     through the paint; satin is the semi-matte black of a modern powder coat,
     off a powder-coat scan. None of them is metal, so none has metalness. */
  wrinkle: (hex) => mat('wrinkle' + hex, () => scanned(new THREE.MeshStandardMaterial({
    color:hex, metalness:0.0, roughness:0.86, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 7), bumpMap: withRepeat(castGrain(), 7), bumpScale:1.4 }),
    m => dressSurface(m, 'wrinkle', REP.cover, 1.6))),
  gloss: (hex) => mat('gloss' + hex, () => scanned(new THREE.MeshPhysicalMaterial({
    color:hex, metalness:0.0, roughness:0.38, clearcoat:0.9, clearcoatRoughness:0.14, envMapIntensity:ENV,
    bumpMap: withRepeat(castGrain(), 4), bumpScale:0.35 }),
    m => { if (dressSurface(m, 'cast', REP.casting, 0.45, false, { rough: false })){
             /* paint fills the pits, so the clearcoat sees a smoother surface
                than the base, with the sprayed orange peel on top */
             const peel = surface('paint', 9);
             if (peel.normalMap){ m.clearcoatNormalMap = peel.normalMap;
                                  m.clearcoatNormalScale = new THREE.Vector2(0.3, 0.3); } } })),
  satin: (hex) => mat('satin' + hex, () => scanned(new THREE.MeshStandardMaterial({
    color:hex, metalness:0.0, roughness:0.60, envMapIntensity:ENV,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.4 }),
    m => dressSurface(m, 'powder', REP.housing, 1.0))),
  /* body paint: metallic base under a clearcoat, tinted so the structure shows */
  paint: (colour, opacity = 1) => scanned(new THREE.MeshPhysicalMaterial({
    color:colour, metalness:0.72, roughness:0.26, clearcoat:1, clearcoatRoughness:0.045,
    envMapIntensity:ENV, transparent: opacity < 1, opacity,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide }),
    /* orange peel: the faint ripple every sprayed panel has, and the reason a
       real car reflects the world slightly unevenly */
    m => { const maps = surface('paint', 9);
           if (maps.normalMap){ m.clearcoatNormalMap = maps.normalMap;
                                m.clearcoatNormalScale = new THREE.Vector2(0.28, 0.28); } }),
};

/* cached geometry so a V12 does not build 12 identical cylinders from scratch */
const _cache = new Map();
function cached(key, make){ let g = _cache.get(key); if (!g){ g = make(); _cache.set(key, g); } return g; }

export function box(w,h,d, mat, key){
  return new THREE.Mesh(cached(key || `b${w},${h},${d}`, () => new THREE.BoxGeometry(w,h,d)), mat);
}
export function roundBox(w,h,d, r=0.06, mat){
  const s = new THREE.Shape();
  const x = w/2, y = h/2;
  s.moveTo(-x+r,-y); s.lineTo(x-r,-y); s.quadraticCurveTo(x,-y,x,-y+r);
  s.lineTo(x,y-r); s.quadraticCurveTo(x,y,x-r,y);
  s.lineTo(-x+r,y); s.quadraticCurveTo(-x,y,-x,y-r);
  s.lineTo(-x,-y+r); s.quadraticCurveTo(-x,-y,-x+r,-y);
  const g = new THREE.ExtrudeGeometry(s, { depth:d, bevelEnabled:false });
  g.translate(0,0,-d/2);
  return new THREE.Mesh(g, mat);
}
export function cyl(rt, rb, h, mat, seg=24, key){
  return new THREE.Mesh(cached(key || `c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt,rb,h,seg)), mat);
}
export function tubeMesh(rOuter, rInner, h, mat, seg=24){
  const s = new THREE.Shape(); s.absarc(0,0,rOuter,0,Math.PI*2,false);
  const hole = new THREE.Path(); hole.absarc(0,0,rInner,0,Math.PI*2,true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s,{ depth:h, bevelEnabled:false, curveSegments:seg });
  /* extrude runs 0..h along +Z; rotateX(-90°) turns that into 0..h along +Y, so
     the shift has to be -h/2 to leave the tube centred on its own origin the way
     cyl() is.  With +h/2 it sat a full half-length high, which quietly threw off
     every sprocket, fin, flywheel and pulley built from it. */
  g.rotateX(-Math.PI/2); g.translate(0,-h/2,0);
  return new THREE.Mesh(g, mat);
}
export function sphere(r, mat, seg=18){
  return new THREE.Mesh(cached(`s${r},${seg}`, () => new THREE.SphereGeometry(r,seg,seg)), mat);
}
/** A flat annulus with the map projected straight down the axle — the way a
 *  tyre sidewall or a brake disc is photographed. `span` sets how much of the
 *  sheet the part covers; `ring` instead pins the inner and outer edges to two
 *  radii in the texture, so circular artwork lands exactly on the annulus. */
export function faceDisc(rOuter, rInner, mat, { seg = 72, span = rOuter, ring = null } = {}){
  const g = new THREE.RingGeometry(rInner, rOuter, seg, 1);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y) || 1e-6;
    let rt = d / (2 * span);
    if (ring){
      const t = (d - rInner) / Math.max(1e-6, rOuter - rInner);
      rt = ring[0] + t * (ring[1] - ring[0]);
    }
    uv.setXY(i, 0.5 + (x / d) * rt, 0.5 + (y / d) * rt);
  }
  uv.needsUpdate = true;
  return new THREE.Mesh(g, mat);
}
/** Re-map a plane's UVs onto one rectangle of a texture sheet. */
export function setUVRect(g, { u0, u1, v0, v1 }){
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return g;
}
export function torus(r, t, mat, seg=20){
  return new THREE.Mesh(cached(`t${r},${t}`, () => new THREE.TorusGeometry(r,t,10,seg)), mat);
}
/** A pipe following points, used for headers, coolant hoses and wiring. */
export function pipe(points, radius, mat, seg=8){
  const curve = new THREE.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, Math.max(12, points.length*8), radius, seg, false);
  return new THREE.Mesh(g, mat);
}
/** A flanged hex bolt, the fastener on every modern engine: a rolled thread
 *  shank, a washer face under the head, the hex itself and the chamfer on top
 *  of it. Shank runs along Y centred on the origin, head at +Y — the same
 *  frame the old two-cylinder stand-in used, so nothing that places one moves. */
export function bolt(r=0.035, h=0.07, mat){
  const g = new THREE.Group();
  const m = mat || MAT.steel();
  /* the thread is bright rolled steel whatever the head is plated in; a short
     plain shoulder under the head is what a real bolt has above its thread */
  g.add(cyl(r, r, h, MAT.steel(), 8));
  g.add(at(cyl(r * 1.04, r * 1.04, h * 0.28, m, 8), 0, h * 0.36, 0));
  const flange = cyl(r * 2.0, r * 2.25, r * 0.55, m, 14);
  flange.position.y = h * 0.5 + r * 0.275; g.add(flange);
  const head = cyl(r * 1.62, r * 1.62, r * 1.20, m, 6);
  head.position.y = h * 0.5 + r * 0.55 + r * 0.60; g.add(head);
  const chamfer = cyl(r * 1.30, r * 1.62, r * 0.28, m, 6);
  chamfer.position.y = h * 0.5 + r * 0.55 + r * 1.20 + r * 0.14; g.add(chamfer);
  return g;
}
/** A hex nut on a stud end: the nut, its chamfer and the stud tip through it.
 *  Axis Y, the nut's underside on the origin. */
export function nutOnStud(af, h, mat, studR = af * 0.30){
  const g = group('nut');
  const m = mat || MAT.plated();
  g.add(at(hexPrism(af, h, m), 0, h * 0.5, 0));
  g.add(at(cyl(af * 0.44, af * 0.577, h * 0.16, m, 6), 0, h + h * 0.08, 0));
  g.add(at(cyl(studR, studR, h * 1.5, MAT.steel(), 8), 0, h * 0.75, 0));
  return g;
}
/** A machined pad: the bright flat a boss is milled to where something bolts
 *  on, a shade proud of the casting so the mill line shows. Lies in XZ, +Y up. */
export function machinedPad(w, d, t = 0.002, mat){
  return box(w, t, d, mat || MAT.machined());
}
/** A raised casting rib, stood on its edge: a thin bar with a drafted top. */
export function castRib(len, h, t, mat){
  const g = group('rib');
  g.add(box(len, h, t, mat));
  g.add(at(cyl(t * 0.5, t * 0.5, len, mat, 6).rotateZ(Math.PI / 2), 0, h * 0.5, 0));
  return g;
}

/* ----------------------------------------------------------------------
 * Lettering. A maker casts or paints its name on a cover; a block carries
 * its casting number on a raised pad. Both are rendered into a canvas once
 * and laid on a thin plate — nothing here is a mesh per letter. Headless
 * (no document) there is no canvas, so the caller gets null and falls back
 * to plain raised bars.
 * -------------------------------------------------------------------- */
const _decalMat = new Map();
export function letterDecal(lines, { w, h, hex = 0xd9dde0, style = 'bare', stripes = null,
                                     script = false, align = 'center', shadow = true } = {}){
  if (typeof document === 'undefined') return null;
  const rows = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (!rows.length) return null;
  const aspect = Math.max(0.5, Math.min(16, w / Math.max(1e-4, h)));
  const key = JSON.stringify([rows, hex, style, stripes, script, align, Math.round(aspect * 20)]);
  let m = _decalMat.get(key);
  if (!m){
    const W = 1024, H = Math.max(48, Math.round(W / aspect));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    let x0 = W * 0.04, x1 = W * 0.96;
    if (stripes && stripes.length){
      /* the three slanted bands, as on an M cover, ahead of the letters */
      const bw = W * 0.055, skew = H * 0.18;
      stripes.forEach((col, i) => {
        g.fillStyle = col;
        g.beginPath();
        const bx = x0 + i * bw * 1.15;
        g.moveTo(bx + skew, H * 0.14); g.lineTo(bx + bw + skew, H * 0.14);
        g.lineTo(bx + bw, H * 0.86); g.lineTo(bx, H * 0.86); g.closePath(); g.fill();
      });
      x0 += bw * 1.15 * stripes.length + W * 0.04;
    }
    const col = '#' + (hex >>> 0).toString(16).padStart(6, '0');
    const n = rows.length;
    const rowH = H / n;
    const family = script ? '"Brush Script MT", "URW Chancery L", "Segoe Script", "Comic Sans MS", cursive'
                          : '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", "Helvetica Neue", Arial, sans-serif';
    rows.forEach((text, i) => {
      const cy = rowH * (i + 0.5);
      let size = rowH * (script ? 0.78 : 0.72);
      g.font = `${script ? 'italic ' : ''}bold ${size}px ${family}`;
      const avail = x1 - x0;
      const tw = Math.max(1, g.measureText(text).width);
      /* condense to fit, never stretch */
      const sx = Math.min(1, avail / tw);
      g.save();
      const cx = align === 'left' ? x0 : align === 'right' ? x1 : (x0 + x1) / 2;
      g.translate(cx, cy);
      g.scale(sx, 1);
      g.textAlign = align; g.textBaseline = 'middle';
      if (shadow){
        /* a dark edge low-right and a pale one high-left is what makes paint
           read as raised casting from a metre away */
        g.fillStyle = 'rgba(0,0,0,0.70)'; g.fillText(text, 3, 4);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(text, -2, -2);
      }
      g.fillStyle = col; g.fillText(text, 0, 0);
      g.restore();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const metal = style === 'bare' || style === 'cast' || style === 'silver' || style === 'chrome' || style === 'chrome-blue';
    m = new THREE.MeshStandardMaterial({ map:t, transparent:true, alphaTest:0.25,
      metalness: metal ? 0.85 : 0.10, roughness: metal ? 0.34 : 0.48, envMapIntensity: metal ? 1.1 : 0.7,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
    _decalMat.set(key, m);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.rotation.x = -Math.PI / 2;            // lies flat, reads along +X, faces +Y
  mesh.renderOrder = 2;
  return mesh;
}
/** Lettering stood on a raised plate of the parent casting's own material —
 *  the badge on a cam cover, the number pad on a block. The plate's underside
 *  is the origin; `flip` turns the text to read from the other side. */
export function letterPlate(lines, w, h, plateMat, opts = {}){
  const g = group('letters');
  const t = opts.thickness ?? 0.0025;
  g.add(at(roundBox(w * 1.10, t, h * 1.25, Math.min(w, h) * 0.12, plateMat), 0, t / 2, 0));
  const d = letterDecal(lines, { w, h, ...opts });
  if (d){ at(d, 0, t + 0.0004, 0); if (opts.flip) d.rotation.z = Math.PI; g.add(d); }
  else {
    /* headless: a bar per word, so the pad still reads as lettered */
    const rows = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    rows.forEach((text, i) => {
      const words = String(text).split(/\s+/).filter(Boolean);
      const rowH = h / rows.length, cy = -h / 2 + rowH * (i + 0.5);
      let x = -w * 0.46;
      for (const wd of words){
        const bw = Math.min(w * 0.92 - (x + w * 0.46), wd.length * rowH * 0.42);
        if (bw <= 0) break;
        g.add(at(box(bw, t * 0.6, rowH * 0.46, opts.barMat || MAT.steel()), x + bw / 2, t + t * 0.3, cy));
        x += bw + rowH * 0.3;
      }
    });
  }
  return g;
}
export function group(name, ...kids){ const g = new THREE.Group(); g.name = name; kids.forEach(k => k && g.add(k)); return g; }

/** Tag an object (and its whole subtree) as belonging to a part. */
export function tag(obj, partId, extra){
  obj.traverse(o => {
    o.userData.partId = partId;
    if (extra) Object.assign(o.userData, extra);
    if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
  });
  return obj;
}

export function at(obj, x=0, y=0, z=0){ obj.position.set(x,y,z); return obj; }
export function rot(obj, x=0, y=0, z=0){ obj.rotation.set(x,y,z); return obj; }
export function scale(obj, x=1, y=x, z=x){ obj.scale.set(x,y,z); return obj; }

export function boundsOf(obj){
  const b = new THREE.Box3().setFromObject(obj);
  const size = b.getSize(new THREE.Vector3());
  const center = b.getCenter(new THREE.Vector3());
  return { box:b, size, center, radius: size.length()/2 };
}

/** Crank–slider: distance from crank axis to the wrist pin. */
export function slider(crankRadius, rodLength, theta){
  const s = crankRadius * Math.sin(theta);
  return crankRadius * Math.cos(theta) + Math.sqrt(Math.max(1e-6, rodLength*rodLength - s*s));
}

/** Epitrochoid used for a two-lobe Wankel housing bore. */
export function epitrochoid(R, e, steps=160){
  const pts = [];
  for (let i = 0; i <= steps; i++){
    const p = (i/steps) * Math.PI * 2;
    pts.push(new THREE.Vector2(e*Math.cos(3*p) + R*Math.cos(p), e*Math.sin(3*p) + R*Math.sin(p)));
  }
  return pts;
}

export const TAU = Math.PI * 2;
export const deg = (d) => d * Math.PI / 180;

/* ======================================================================
 * Real-part geometry — profiles taken from how the components are actually
 * shaped, because the shape is usually the explanation.
 * ==================================================================== */

/** Revolve a 2-D profile ([x,y] pairs, x = radius) around the Y axis. */
export function lathe(profile, mat, seg = 28){
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/* ----------------------------------------------------------------------
 * Real components. Every one of these is built to the proportions of the
 * actual part — a spark plug is a terminal, a ribbed insulator, a hex, a
 * rolled thread and a ground strap, not a cylinder.
 * -------------------------------------------------------------------- */

/** A hexagon prism about Y: a nut, a bolt head, a spark-plug shell. */
export function hexPrism(acrossFlats, h, mat){
  const r = acrossFlats / Math.sqrt(3);      // circumradius, from across-flats
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), mat);
  m.rotation.y = Math.PI / 6;                // a flat facing front, as it sits
  return m;
}

/** A real helical thread wound up the Y axis, for anything that screws in. */
export function helixThread(radius, length, pitch, wire, mat){
  const turns = Math.max(1, length / pitch);
  const steps = Math.max(28, Math.round(turns * 13));
  const pts = [];
  for (let i = 0; i <= steps; i++){
    const t = i / steps, a = t * turns * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, -length / 2 + t * length, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, steps, wire, 5, false), mat);
}

/** A ring of bolts on a circle — a flange, a pulley hub, a flywheel. */
export function boltCircle(radius, count, head, h, mat, plane = 'xz'){
  const g = group('bolts');
  for (let i = 0; i < count; i++){
    const a = (i / count) * TAU;
    const b = hexPrism(head, h, mat || MAT.plated());
    if (plane === 'xz') b.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    else if (plane === 'yz'){ rot(b, 0, 0, Math.PI / 2); b.position.set(0, Math.cos(a) * radius, Math.sin(a) * radius); }
    else { rot(b, Math.PI / 2, 0, 0); b.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0); }
    g.add(b);
  }
  return g;
}

/** An involute-ish spur gear, extruded along Z: a starter ring, a timing gear. */
export function gearMesh(radius, teeth, width, mat, toothH = radius * 0.07){
  const s = new THREE.Shape();
  const rr = radius - toothH, half = Math.PI / teeth;
  for (let i = 0; i < teeth; i++){
    const a = (i / teeth) * TAU;
    const p = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r];
    const a0 = a - half * 0.92, a1 = a - half * 0.34, a2 = a + half * 0.34, a3 = a + half * 0.92;
    if (i === 0) s.moveTo(...p(a0, rr)); else s.lineTo(...p(a0, rr));
    s.lineTo(...p(a1, radius));           // flank up
    s.lineTo(...p(a2, radius));           // tip land
    s.lineTo(...p(a3, rr));               // flank down
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth:width, bevelEnabled:false, curveSegments:2 });
  g.translate(0, 0, -width / 2);
  return new THREE.Mesh(g, mat);
}

/** A spark plug, to the proportions of a 14 mm one: terminal nut and stem, a
 *  five-rib alumina insulator, the hex, the rolled thread, the centre
 *  electrode and the ground strap bent over it. Tip points −Y. */
export function sparkPlug(length = 0.090, mats = {}){
  const k = length / 0.090;
  const M = (mm) => mm / 1000 * k;
  const g = group('sparkplug');
  const cer = mats.ceramic || MAT.ceramic();
  const shell = mats.shell || MAT.plated();
  const el = mats.electrode || MAT.steel();

  g.add(at(hexPrism(M(7.5), M(6), shell), 0, M(41), 0));          // terminal nut
  g.add(at(cyl(M(2.8), M(2.8), M(10), shell, 12), 0, M(34), 0));  // terminal stem

  /* the corrugated insulator — five ribs, which is what stops a flashover */
  const prof = [[M(0.1), M(31)], [M(4.2), M(31)]];
  for (let i = 0; i < 5; i++){
    const y = M(29) - i * M(4.6);
    prof.push([M(5.4), y + M(1.5)], [M(7.2), y], [M(5.4), y - M(1.5)]);
  }
  prof.push([M(6.6), M(6.0)], [M(8.4), M(3.2)], [M(8.4), M(2.2)], [M(4.0), M(2.0)]);
  g.add(lathe(prof, cer, 30));

  g.add(at(hexPrism(M(16), M(8), shell), 0, M(-3), 0));           // the hex
  g.add(at(lathe([[M(8.2), M(-7.2)], [M(10.4), M(-7.2)], [M(10.4), M(-8.4)], [M(8.2), M(-8.4)]],
                 shell, 20), 0, 0, 0));                           // sealing washer
  g.add(at(cyl(M(6.4), M(6.4), M(19), shell, 20), 0, M(-18), 0)); // thread core
  g.add(at(helixThread(M(7.0), M(18), M(1.25), M(0.62), shell), 0, M(-18), 0));
  g.add(at(cyl(M(2.4), M(2.4), M(6), cer, 12), 0, M(-30), 0));    // insulator nose
  g.add(at(cyl(M(0.8), M(0.8), M(4), el, 8), 0, M(-32.5), 0));    // centre electrode

  /* the ground strap: up the side of the shell, then bent over the gap */
  const strap = pipe([[M(5.6), M(-27), 0], [M(5.6), M(-34.5), 0],
                      [M(3.2), M(-35.4), 0], [M(0), M(-35.4), 0]], M(0.9), el, 6);
  g.add(strap);
  return g;
}

/** A pencil ignition coil: connector, body, and the rubber boot and spring
 *  that reach down the plug well. Boot points −Y. */
export function coilPack(length, mats = {}){
  const k = length / 0.130;
  const M = (mm) => mm / 1000 * k;
  const g = group('coil');
  const body = mats.body || MAT.coilBody();
  /* origin is the mouth of the boot, so the coil drops straight onto a plug */
  g.add(at(roundBox(M(23), M(13), M(17), M(2.5), body), 0, M(110), M(2)));  // connector
  for (let i = 0; i < 3; i++)                                               // its pins
    g.add(at(cyl(M(1.0), M(1.0), M(8), MAT.brass(), 6), (i - 1) * M(5), M(110), M(11)));
  g.add(at(lathe([[M(11.5), M(46)], [M(11.5), M(96)], [M(9.5), M(100)],
                  [M(9.5), M(106)]], body, 20), 0, 0, 0));                  // coil body
  g.add(at(lathe([[M(11.0), M(0)], [M(11.0), M(6)], [M(9.0), M(10)],
                  [M(9.0), M(32)], [M(11.5), M(42)], [M(11.5), M(46)]],
                 MAT.rubber(), 18), 0, 0, 0));                              // boot
  return g;
}

/** A trumpet: the flared inlet a race engine runs instead of an airbox. */
export function velocityStack(bore, length, mat){
  const r = bore / 2;
  const p = [];
  const n = 12;
  for (let i = 0; i <= n; i++){                 // a proper radiused bellmouth
    const t = i / n;
    const y = -length / 2 + t * length;
    const flare = Math.pow(t, 3.2);
    p.push([r * (1 + flare * 1.35), y]);
  }
  for (let i = n; i >= 0; i--){                 // and the inside of it
    const t = i / n;
    const y = -length / 2 + t * length;
    const flare = Math.pow(t, 3.2);
    p.push([r * (1 + flare * 1.35) - length * 0.035, y]);
  }
  return lathe(p, mat || MAT.alloy(), 30);
}

/** A cam cover: raised centre rib, a bolt rail down each side with its
 *  bosses, and the oil filler in the corner. Sits centred on the deck. */
/** Where the cam cover's top surface is, across its width, for the things
 *  that stand on it: hump height outboard, trough height between the humps on
 *  a twin-cam cover. `z` is across the cover in its own frame. */
export function camCoverTopAt(width, height, z, dohc){
  const w = width / 2, a = Math.abs(z) / w;
  if (!dohc) return a <= 0.40 ? height : a <= 0.58 ? height * (1.0 - (a - 0.40) / 0.18 * 0.26) : height * 0.50;
  if (a <= 0.16) return height * 0.66;
  if (a <= 0.22) return height * (0.66 + (a - 0.16) / 0.06 * 0.34);
  if (a <= 0.64) return height;
  return height * Math.max(0.16, 0.80 - (a - 0.64) / 0.36 * 0.64);
}
export function camCoverMesh(len, width, height, mat, bolts = 8, hardware = null, opts = {}){
  const g = group('camcover');
  const m = mat || MAT.alloyDark();
  const hw = hardware || MAT.plated();
  const w = width / 2;
  const dohc = !!opts.dohc;
  /* The cross-section, swept the length of the head. A twin-cam cover is two
     long humps — one over each camshaft — with the plug wells sunk in a trough
     between them; a single-cam or pushrod cover is one raised centre with a
     radiused shoulder down to the bolt rail. */
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w, height * 0.16);
  if (dohc){
    s.quadraticCurveTo(-w * 0.97, height * 0.62, -w * 0.78, height * 0.86);
    s.quadraticCurveTo(-w * 0.70, height * 1.00, -w * 0.64, height * 1.00);
    s.lineTo(-w * 0.22, height * 1.00);
    s.quadraticCurveTo(-w * 0.17, height * 1.00, -w * 0.16, height * 0.66);
    s.lineTo( w * 0.16, height * 0.66);
    s.quadraticCurveTo( w * 0.17, height * 1.00,  w * 0.22, height * 1.00);
    s.lineTo( w * 0.64, height * 1.00);
    s.quadraticCurveTo( w * 0.70, height * 1.00,  w * 0.78, height * 0.86);
    s.quadraticCurveTo( w * 0.97, height * 0.62,  w, height * 0.16);
  } else {
    s.quadraticCurveTo(-w * 0.94, height * 0.62, -w * 0.58, height * 0.74);
    s.lineTo(-w * 0.40, height * 1.00);
    s.lineTo( w * 0.40, height * 1.00);
    s.lineTo( w * 0.58, height * 0.74);
    s.quadraticCurveTo( w * 0.94, height * 0.62, w, height * 0.16);
  }
  s.lineTo( w, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth:len, bevelEnabled:false, curveSegments:6 });
  geo.rotateY(Math.PI / 2);            // extrude along Z, then lay it along X
  geo.translate(-len / 2, 0, 0);
  g.add(new THREE.Mesh(geo, m));
  /* the end walls are drafted and the top edge is radiused: a bar along each
     end hides the hard extrusion edge and reads as the cast rim it is */
  for (const sx of [-1, 1])
    g.add(at(cyl(height * 0.05, height * 0.05, width * 1.28, m, 6).rotateX(Math.PI / 2), sx * (len / 2 - height * 0.05), height * (dohc ? 0.99 : 0.99), 0));
  /* the bolt rail: a cast boss and a flanged bolt at each fixing, both sides.
     The bolt stands on a grommet height above the boss — the grommets belong
     to the cover gasket set and sit under these heads when it is fitted. */
  const bossH = height * 0.26;
  for (let i = 0; i < bolts; i++){
    const x = (i / (bolts - 1) - 0.5) * len * 0.92;
    for (const sd of [-1, 1]){
      g.add(at(cyl(width * 0.050, width * 0.062, bossH, m, 12), x, bossH / 2, sd * w * 0.90));
      /* a web from the boss up onto the shoulder, which is how the boss is cast */
      g.add(at(box(width * 0.030, bossH * 0.9, w * 0.14, m), x, bossH * 0.45, sd * w * 0.82));
      g.add(at(bolt(0.003, 0.012, hw), x, bossH, sd * w * 0.90));
    }
  }
  if (dohc){
    /* the plug wells: a raised rim round each tube in the trough, and a cast
       rib across the trough between wells to stiffen the thin floor */
    const wells = opts.wells || [];
    for (const x of wells)
      g.add(at(tubeMesh(w * 0.15, w * 0.11, height * 0.08, m, 16), x, height * 0.66 + height * 0.04, 0));
    for (let i = 0; i + 1 < wells.length; i++)
      g.add(at(box(height * 0.07, height * 0.10, w * 0.32, m), (wells[i] + wells[i + 1]) / 2, height * 0.66 + height * 0.05, 0));
    /* a raised rib along the inner edge of each hump, where the metal is thin */
    for (const sd of [-1, 1])
      g.add(at(box(len * 0.90, height * 0.04, w * 0.03, m), 0, height * 1.00, sd * w * 0.26));
  } else {
    /* a pair of longitudinal ribs flanking the lettering on a single-hump cover */
    for (const sd of [-1, 1])
      g.add(at(box(len * 0.82, height * 0.05, w * 0.03, m), 0, height * 1.00, sd * w * 0.32));
  }
  /* the baffle box: a raised breather chamber at the front end, with a hose
     nipple out of its side, the way every cover vents the crankcase */
  if (opts.breather !== false){
    const bz = dohc ? -w * 0.43 : 0, by = camCoverTopAt(width, height, bz, dohc);
    g.add(at(roundBox(len * 0.10, height * 0.10, w * 0.30, height * 0.02, m), -len * 0.36, by + height * 0.05, bz));
    g.add(at(cyl(height * 0.05, height * 0.05, w * 0.28, MAT.plated(), 10).rotateX(Math.PI / 2), -len * 0.36, by + height * 0.06, bz - w * 0.26));
    g.add(at(hoseClamp(height * 0.052).rotateX(Math.PI / 2), -len * 0.36, by + height * 0.06, bz - w * 0.36));
  }
  /* the maker's lettering, on a raised plate on the hump top */
  const lg = opts.legend;
  if (lg && lg.lines && lg.lines.length){
    const put = (lines, x, z, lw, lh, flipExtra) => {
      const p = letterPlate(lines, lw, lh, m, { hex:lg.hex, style:lg.style, stripes:lg.stripes,
                                                 script:lg.script, flip: !!opts.flip !== !!flipExtra, thickness: height * 0.03 });
      g.add(at(p, x, camCoverTopAt(width, height, z, dohc) - 0.0002, z));
    };
    if (dohc){
      const hz = w * 0.43, lw = len * 0.52, lh = w * 0.30;
      put(lg.lines, 0, -hz, lw, lh, false);
      put(lg.lines.slice(0, 1), lg.lines.length > 1 ? len * 0.05 : 0, hz, lw, lh, true);
    } else {
      put(lg.lines, 0, 0, len * 0.56, w * 0.46, false);
    }
  }
  return g;
}

/** An oil pan: tapered sides, a bolt flange all the way round, a sump
 *  kick-out at one end and the drain plug in the bottom of it. */
export function oilPanMesh(len, width, depth, mat){
  const g = group('oilpan');
  const m = mat || MAT.alloyDark();
  const w = width / 2;
  /* flange rail */
  g.add(at(box(len, depth * 0.06, width * 1.10, m), 0, depth * 0.47, 0));
  /* the shallow part, drafted inwards the way a casting has to be */
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(len * 0.995, depth * 0.42, width, 1, 1, 1), m);
  const pos = body.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++){              // draft: narrow at the base
    if (pos.getY(i) < 0){ pos.setX(i, pos.getX(i) * 0.97); pos.setZ(i, pos.getZ(i) * 0.80); }
  }
  pos.needsUpdate = true; body.geometry.computeVertexNormals();
  g.add(at(body, 0, depth * 0.22, 0));
  /* the sump: deeper, at the end the pickup sits in */
  const sump = new THREE.Mesh(new THREE.BoxGeometry(len * 0.34, depth * 0.62, width * 0.78), m);
  const sp = sump.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++){
    if (sp.getY(i) < 0){ sp.setX(i, sp.getX(i) * 0.88); sp.setZ(i, sp.getZ(i) * 0.82); }
  }
  sp.needsUpdate = true; sump.geometry.computeVertexNormals();
  g.add(at(sump, -len * 0.28, -depth * 0.28, 0));
  g.add(at(hexPrism(width * 0.09, depth * 0.10, MAT.plated()), -len * 0.28, -depth * 0.62, width * 0.22));
  /* the flange bolts, up through the rail into the block's pan-rail bosses:
     a row down each side and a pair across each end */
  const nb = Math.max(4, Math.round(len / 0.085));
  for (let i = 0; i < nb; i++){
    const x = (i / (nb - 1) - 0.5) * len * 0.92;
    for (const sd of [-1, 1])
      g.add(at(rot(bolt(0.003, 0.014, MAT.plated()), Math.PI, 0, 0), x, depth * 0.44 - 0.004, sd * w * 1.02));
  }
  for (const sx of [-1, 1]) for (const sd of [-0.4, 0.4])
    g.add(at(rot(bolt(0.003, 0.014, MAT.plated()), Math.PI, 0, 0), sx * len * 0.49, depth * 0.44 - 0.004, sd * w));
  /* a stiffening rib across the pan floor and the drain-plug boss cast round it */
  g.add(at(box(len * 0.30, depth * 0.05, width * 0.70, m), -len * 0.28, -depth * 0.58, 0));
  g.add(at(cyl(width * 0.10, width * 0.08, depth * 0.08, m, 14), -len * 0.28, -depth * 0.59, width * 0.22));
  return g;
}

/** A crankshaft damper: serpentine grooves, the bonded rubber ring, and the
 *  hub with its bolt circle. Axis along X, as the crank runs. */
export function crankDamper(radius, width, mat){
  const g = group('damper');
  const m = mat || MAT.iron();
  const ribs = 6;
  const p = [[radius * 0.30, -width * 0.5], [radius * 0.30, -width * 0.34]];
  for (let i = 0; i < ribs; i++){                   // the V-rib pulley grooves
    const z0 = -width * 0.30 + (i / ribs) * width * 0.68;
    const zw = (width * 0.68) / ribs;
    p.push([radius, z0], [radius * 0.90, z0 + zw * 0.5], [radius, z0 + zw]);
  }
  p.push([radius * 1.02, width * 0.44], [radius * 0.30, width * 0.44], [radius * 0.30, width * 0.5]);
  const ring = lathe(p, m, 40);
  rot(ring, 0, 0, Math.PI / 2);                     // lathe is about Y; the crank is X
  g.add(ring);
  const rubber = lathe([[radius * 0.62, -width * 0.30], [radius * 0.72, -width * 0.30],
                        [radius * 0.72, width * 0.40], [radius * 0.62, width * 0.40]],
                       MAT.damperRubber(), 36);
  rot(rubber, 0, 0, Math.PI / 2);
  g.add(rubber);
  const hub = lathe([[radius * 0.16, -width * 0.10], [radius * 0.60, -width * 0.10],
                     [radius * 0.60, width * 0.30], [radius * 0.16, width * 0.30]], m, 30);
  rot(hub, 0, 0, Math.PI / 2);
  g.add(hub);
  g.add(at(boltCircle(radius * 0.36, 6, radius * 0.11, width * 0.16, MAT.plated(), 'yz'),
           -width * 0.18, 0, 0));
  g.add(at(rot(hexPrism(radius * 0.30, width * 0.22, MAT.plated()), 0, 0, Math.PI / 2),
           -width * 0.32, 0, 0));                     // the crank bolt in the nose
  return g;
}

/** A flywheel: the friction face, the bolt circle, and a real starter ring
 *  gear with real teeth. Axis along X. */
export function flywheelMesh(radius, width, mat, teeth = 110, bolts = true){
  const g = group('flywheel');
  const m = mat || MAT.iron();
  const disc = lathe([[radius * 0.14, -width * 0.5], [radius * 0.92, -width * 0.5],
                      [radius * 0.92, -width * 0.10], [radius * 0.55, -width * 0.10],
                      [radius * 0.55, width * 0.5], [radius * 0.14, width * 0.5]], m, 44);
  rot(disc, 0, 0, Math.PI / 2);
  g.add(disc);
  const face = lathe([[radius * 0.42, -width * 0.52], [radius * 0.90, -width * 0.52],
                      [radius * 0.90, -width * 0.50], [radius * 0.42, -width * 0.50]],
                     MAT.steel(), 44);
  rot(face, 0, 0, Math.PI / 2);
  g.add(face);
  const ring = gearMesh(radius, teeth, width * 0.34, MAT.steel(), radius * 0.045);
  rot(ring, 0, Math.PI / 2, 0);
  ring.position.x = width * 0.18;
  g.add(ring);
  if (bolts) g.add(at(boltCircle(radius * 0.28, 8, radius * 0.10, width * 0.20, MAT.plated(), 'yz'),
           width * 0.42, 0, 0));
  return g;
}

/** A clutch cover: the pressed steel cover, its drive straps, and the
 *  diaphragm spring fingers you actually press on. Axis along X. */
export function clutchMesh(radius, width, mat){
  const g = group('clutch');
  const m = mat || MAT.steel();
  const cover = lathe([[radius * 0.30, width * 0.5], [radius * 0.86, width * 0.42],
                       [radius * 1.0, width * 0.10], [radius * 1.0, -width * 0.10],
                       [radius * 0.88, -width * 0.14], [radius * 0.88, -width * 0.5],
                       [radius * 0.30, -width * 0.5]], m, 40);
  rot(cover, 0, 0, Math.PI / 2);
  g.add(cover);
  const fingers = 18;                                   // the diaphragm spring
  for (let i = 0; i < fingers; i++){
    const a = (i / fingers) * TAU;
    const f = box(width * 0.06, radius * 0.52, radius * 0.10, MAT.plated());
    f.position.set(width * 0.40, Math.cos(a) * radius * 0.34, Math.sin(a) * radius * 0.34);
    f.rotation.x = -a;
    g.add(f);
  }
  g.add(at(lathe([[radius*0.16, width*0.36], [radius*0.30, width*0.36],
                  [radius*0.30, width*0.50], [radius*0.16, width*0.50]], MAT.plated(), 26)
           .rotateZ(Math.PI/2), 0, 0, 0));
  g.add(at(boltCircle(radius * 0.94, 6, radius * 0.09, width * 0.16, MAT.plated(), 'yz'),
           -width * 0.42, 0, 0));
  return g;
}

/** A water pump: the volute housing, the inlet snout and the drive pulley. */
export function waterPumpMesh(size, mat){
  const g = group('waterpump');
  const m = mat || MAT.alloyDark();
  /* the housing is a scan of a real pump where one is available; the pulley
     stays generated, because it has to turn with the belt */
  const scan = partMesh('waterPump', { dia: size * 1.05, depth: size * 0.55, axis:'x', mat:m });
  if (scan){
    g.add(scan);
  } else {
  const housing = lathe([[size * 0.14, -size * 0.30], [size * 0.50, -size * 0.30],
                         [size * 0.52, -size * 0.10], [size * 0.44, size * 0.16],
                         [size * 0.20, size * 0.22], [size * 0.14, size * 0.22]], m, 30);
  rot(housing, 0, 0, Math.PI / 2);
  g.add(housing);
  g.add(at(rot(cyl(size * 0.20, size * 0.22, size * 0.42, m, 18), 0, 0, Math.PI / 2),
           size * 0.10, -size * 0.42, 0));             // the lower hose snout
  }
  const pulley = lathe([[size * 0.10, -size * 0.40], [size * 0.42, -size * 0.40],
                        [size * 0.38, -size * 0.30], [size * 0.42, -size * 0.22],
                        [size * 0.10, -size * 0.22]], MAT.steel(), 28);
  rot(pulley, 0, 0, Math.PI / 2);
  pulley.position.x = -size * 0.34;
  g.add(pulley);
  g.userData.pulley = pulley;
  if (!scan)
    g.add(at(boltCircle(size * 0.42, 6, size * 0.08, size * 0.10, MAT.plated(), 'xy'), size * 0.24, 0, 0));
  return g;
}

/** A port flange: the plate an exhaust or inlet manifold bolts to, with its
 *  ports opened up and the studs through it. Plate lies in the YZ plane. */
export function portFlange(ports, portR, pitch, thickness, mat){
  const s = new THREE.Shape();
  const halfL = pitch * ports / 2, halfH = portR * 1.42;
  const r = portR * 0.5;
  s.moveTo(-halfL + r, -halfH);
  s.lineTo(halfL - r, -halfH); s.quadraticCurveTo(halfL, -halfH, halfL, -halfH + r);
  s.lineTo(halfL, halfH - r);  s.quadraticCurveTo(halfL, halfH, halfL - r, halfH);
  s.lineTo(-halfL + r, halfH); s.quadraticCurveTo(-halfL, halfH, -halfL, halfH - r);
  s.lineTo(-halfL, -halfH + r); s.quadraticCurveTo(-halfL, -halfH, -halfL + r, -halfH);
  for (let i = 0; i < ports; i++){                     // the ports themselves
    const h = new THREE.Path();
    h.absellipse((i - (ports - 1) / 2) * pitch, 0, portR * 1.02, portR * 0.90, 0, TAU, true);
    s.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth:thickness, bevelEnabled:false, curveSegments:14 });
  geo.rotateY(Math.PI / 2);
  const g = group('flange', new THREE.Mesh(geo, mat || MAT.iron()));
  for (let i = 0; i <= ports; i++){                    // and the studs between them, nutted
    const y = (i - ports / 2) * pitch;
    for (const sd of [-1, 1]){
      g.add(at(rot(cyl(portR * 0.16, portR * 0.16, thickness * 2.2, MAT.plated(), 8), 0, 0, Math.PI/2),
               thickness * 0.6, sd * halfH * 0.78, y));
      g.add(at(rot(nutOnStud(portR * 0.46, portR * 0.26, MAT.plated(), portR * 0.16), 0, 0, -Math.PI / 2),
               thickness, sd * halfH * 0.78, y));
    }
  }
  return g;
}

/** A piston: domed crown, three ring grooves, relieved skirt, pin bosses. */
export function pistonMesh(bore, mat, opts = {}){
  const r = bore / 2, h = bore * 0.52;
  const dish = opts.dish ?? 0.06;          // 0 = flat top, + = dished
  const p = [
    [0,            h*0.50],
    [r*0.55,       h*0.50 - bore*dish],
    [r*0.90,       h*0.46],
    [r*0.995,      h*0.40],                // top land
    [r*0.995,      h*0.34], [r*0.93, h*0.32], [r*0.93, h*0.28], [r*0.995, h*0.26],  // ring 1
    [r*0.995,      h*0.20], [r*0.93, h*0.18], [r*0.93, h*0.14], [r*0.995, h*0.12],  // ring 2
    [r*0.995,      h*0.06], [r*0.90, h*0.04], [r*0.90, h*0.00], [r*0.985, h*-0.02], // oil ring
    [r*0.985,     -h*0.30],
    [r*0.93,      -h*0.46],                // skirt taper
    [r*0.55,      -h*0.50],
    [0,           -h*0.50],
  ];
  const m = lathe(p, mat, 30);
  return m;
}

/** An I-beam connecting rod, small end at the origin, big end at −length. */
export function rodMesh(length, bigR, smallR, mat){
  const g = new THREE.Group();
  const web = 0.28, flange = 0.55;
  const s = new THREE.Shape();
  const w = bigR * flange, t = bigR * web;
  s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, -bigR*0.5);
  s.lineTo(t, -bigR*0.9); s.lineTo(t, -length + bigR*0.9);
  s.lineTo(w, -length + bigR*0.5); s.lineTo(w, -length);
  s.lineTo(-w, -length); s.lineTo(-w, -length + bigR*0.5);
  s.lineTo(-t, -length + bigR*0.9); s.lineTo(-t, -bigR*0.9);
  s.lineTo(-w, -bigR*0.5); s.closePath();
  const beam = new THREE.ExtrudeGeometry(s, { depth: bigR*0.75, bevelEnabled:true,
    bevelSize: bigR*0.06, bevelThickness: bigR*0.05, bevelSegments:1 });
  beam.rotateY(Math.PI/2); beam.translate(-bigR*0.37, 0, 0);
  g.add(new THREE.Mesh(beam, mat));
  const big = tubeMesh(bigR, bigR*0.66, bigR*1.5, mat, 22);
  rot(big, 0, 0, Math.PI/2); big.position.y = -length; g.add(big);
  const small = tubeMesh(smallR*1.55, smallR, smallR*2.4, mat, 18);
  rot(small, 0, 0, Math.PI/2); g.add(small);
  return g;
}

/** Crank counterweight: a fat half-disc, as cast. */
export function counterweight(r, thickness, mat, seg = 24){
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI * 0.12, Math.PI * 0.88, false);
  s.lineTo(-r*0.42, -r*0.30); s.lineTo(r*0.42, -r*0.30);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth:thickness, bevelEnabled:true,
    bevelSize:thickness*0.10, bevelThickness:thickness*0.08, bevelSegments:1, curveSegments:seg });
  g.rotateY(Math.PI/2); g.translate(-thickness/2, 0, 0);
  return new THREE.Mesh(g, mat);
}

/** Normalised valve lift for a harmonic cam lobe. angle in radians from the nose. */
export function lobeLift(angle, durationRad){
  let a = ((angle + Math.PI*3) % (Math.PI*2)) - Math.PI;   // wrap to −π…π
  const half = durationRad / 2;
  if (Math.abs(a) >= half) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * a / half));
}

/** A cam lobe: base circle with a harmonic nose pointing along −Y. */
export function camLobe(baseR, lift, durationRad, width, mat, seg = 72){
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++){
    const th = (i/seg) * TAU;
    /* nose points at −Y, i.e. th = −π/2 */
    const r = baseR + lift * lobeLift(th + Math.PI/2, durationRad);
    const x = r * Math.cos(th), y = r * Math.sin(th);
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, baseR*0.45, 0, TAU, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth:width, bevelEnabled:false, curveSegments:2 });
  g.rotateY(Math.PI/2); g.translate(-width/2, 0, 0);
  return new THREE.Mesh(g, mat);
}

/** A poppet valve: tulip head, waisted stem, keeper groove. */
export function valveMesh(headR, stemR, length, mat){
  const p = [
    [0,        -length*0.5],
    [headR*0.72, -length*0.5],
    [headR,    -length*0.5 + headR*0.30],       // 45° seat face
    [headR*0.96, -length*0.5 + headR*0.44],
    [stemR*1.6, -length*0.5 + headR*0.95],      // tulip blend
    [stemR,    -length*0.5 + headR*1.6],
    [stemR,     length*0.42],
    [stemR*0.78, length*0.46],                  // keeper groove
    [stemR,     length*0.50],
    [0,         length*0.50],
  ];
  return lathe(p, mat, 20);
}

/** A valve spring drawn as a real helix. */
export function springMesh(radius, length, coils, wire, mat){
  const pts = [];
  const n = Math.max(24, coils * 12);
  for (let i = 0; i <= n; i++){
    const t = i/n, a = t * TAU * coils;
    pts.push(new THREE.Vector3(Math.cos(a)*radius, -length/2 + t*length, Math.sin(a)*radius));
  }
  return pipe(pts, wire, mat, 6);
}

/** Turbo volute: a snail that grows in radius and shrinks in section. */
export function volute(rIn, rOut, width, mat, seg = 64){
  const outer = [], inner = [];
  for (let i = 0; i <= seg; i++){
    const t = i/seg, a = t * TAU;
    const ro = rIn + (rOut - rIn) * t;
    outer.push(new THREE.Vector2(Math.cos(a)*ro, Math.sin(a)*ro));
  }
  for (let i = seg; i >= 0; i--){
    const t = i/seg, a = t * TAU;
    inner.push(new THREE.Vector2(Math.cos(a)*rIn*0.62, Math.sin(a)*rIn*0.62));
  }
  const s = new THREE.Shape(outer);
  s.holes.push(new THREE.Path(inner));
  const g = new THREE.ExtrudeGeometry(s, { depth:width, bevelEnabled:true,
    bevelSize:width*0.08, bevelThickness:width*0.06, bevelSegments:1, curveSegments:2 });
  g.rotateY(Math.PI/2); g.translate(-width/2, 0, 0);
  return new THREE.Mesh(g, mat);
}

/** A bladed wheel (turbine, compressor, cooling fan). */
export function bladedWheel(radius, blades, width, mat, twist = 0.5){
  const g = new THREE.Group();
  g.add(cyl(radius*0.26, radius*0.20, width, mat, 14));
  for (let i = 0; i < blades; i++){
    const b = box(width*0.16, radius*0.86, width*0.9, mat);
    b.position.set(0, radius*0.52, 0);
    const holder = group('b', b);
    holder.rotation.z = (i/blades) * TAU;
    b.rotation.y = twist;
    g.add(holder);
  }
  return g;
}

/** A centrifugal compressor wheel. Each blade is a real swept surface: it
 *  starts axial at the inducer, turns through the wrap angle as the radius
 *  grows, and finishes backswept at the exducer — which is the shape that
 *  makes one, and the reason a flat vane never looks right. Splitter blades
 *  sit between the full ones from mid-span out, as they do on the real thing.
 *  Axis along Z, air enters at −Z. */
export function compressorWheel(radius, blades, width, mat, opts = {}){
  const g = group('compwheel');
  const rExit = radius;
  const rInd  = radius * (opts.inducer ?? 0.60);      // inducer tip
  const rHubIn = radius * (opts.hubIn ?? 0.20);
  const b2 = width * (opts.exducerHeight ?? 0.30);    // blade height at exit
  const L = width;
  const wrap = opts.wrap ?? 0.95;                     // radians the blade turns
  const N = 14;

  const hubR = (t) => rHubIn + (rExit * 0.86 - rHubIn) * Math.pow(t, 2.1);
  const shrR = (t) => rInd + (rExit - rInd) * Math.pow(t, 1.5);
  const hubZ = (t) => -L * Math.pow(1 - t, 1.5);
  const shrZ = (t) => hubZ(t) - b2 * t;
  const theta = (t) => wrap * Math.pow(t, 1.25);

  /* the hub, a body of revolution under the blades */
  const prof = [];
  for (let i = 0; i <= N; i++){ const t = i / N; prof.push([hubR(t), hubZ(t)]); }
  prof.push([rExit * 0.99, 0.001], [rExit * 0.99, -L * 0.05], [rHubIn * 0.55, -L * 0.05], [rHubIn * 0.55, -L]);
  const hub = lathe(prof, mat, 40);
  rot(hub, Math.PI / 2, 0, 0);                        // lathe is about Y; this runs on Z
  g.add(hub);
  g.add(at(rot(cyl(rHubIn * 0.5, rHubIn * 0.5, L * 0.5, mat, 14), Math.PI / 2, 0, 0), 0, 0, L * 0.2));

  /* one blade, built as a thin ribbon between the hub and shroud contours */
  const blade = (phi, t0) => {
    const pos = [], idx = [];
    const th = radius * 0.028;                        // half the blade thickness
    const steps = 16;
    for (let i = 0; i <= steps; i++){
      const t = t0 + (1 - t0) * (i / steps);
      const a = phi + theta(t);
      const ca = Math.cos(a), sa = Math.sin(a);
      const tx = -sa, ty = ca;                        // tangential, for the thickness
      for (const side of [-1, 1])
        for (const [r, z] of [[hubR(t), hubZ(t)], [shrR(t), shrZ(t)]])
          pos.push(r * ca + tx * th * side, r * sa + ty * th * side, z);
    }
    /* four vertices per station: (-hub, -shroud, +hub, +shroud) */
    for (let i = 0; i < steps; i++){
      const a0 = i * 4, b0 = a0 + 4;
      idx.push(a0+0, b0+0, a0+1,  b0+0, b0+1, a0+1);      // one face
      idx.push(a0+2, a0+3, b0+2,  b0+2, a0+3, b0+3);      // the other
      idx.push(a0+1, b0+1, a0+3,  b0+1, b0+3, a0+3);      // the tip edge
      idx.push(a0+0, a0+2, b0+0,  b0+0, a0+2, b0+2);      // the root edge
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  for (let i = 0; i < blades; i++){
    const phi = (i / blades) * TAU;
    g.add(blade(phi, 0));                                   // full blade
    g.add(blade(phi + Math.PI / blades, 0.38));             // splitter
  }
  return g;
}

/** A flash of combustion — a soft emissive blob that lives inside a cylinder. */
export function flameMesh(radius){
  const m = new THREE.MeshBasicMaterial({ color:0xffb04a, transparent:true, opacity:0, depthWrite:false,
    blending:THREE.AdditiveBlending });
  const mesh = sphere(radius, m, 12);
  mesh.userData.flame = m;
  mesh.renderOrder = 3;
  return mesh;
}

/** A puff of exhaust. */
export function puffMesh(radius){
  const m = new THREE.MeshBasicMaterial({ color:0x9aa8c0, transparent:true, opacity:0, depthWrite:false });
  const mesh = sphere(radius, m, 8);
  mesh.userData.puff = m;
  return mesh;
}

/** How much an engine layout shakes: primary and secondary imbalance, 0…1. */
export function imbalance(e){
  const key = e.kind === 'rotary' ? 'rotary'
    : e.layout === 'V' ? 'V' + e.cyl + (e.crank === 'flat' ? 'f' : '')
    : e.layout + e.cyl;
  const table = {
    I1:[1.00,0.55], I2:[0.62,0.35], I3:[0.30,0.10], I4:[0.10,0.46], I5:[0.16,0.10],
    I6:[0.03,0.03], V2:[0.72,0.30], V4:[0.30,0.18], V6:[0.22,0.12], V8:[0.10,0.06],
    V8f:[0.10,0.34], V10:[0.12,0.07], V12:[0.02,0.02], V16:[0.05,0.04],
    F2:[0.10,0.22], F4:[0.06,0.24], F6:[0.03,0.04], W16:[0.06,0.05], rotary:[0.03,0.02],
  };
  return table[key] || [0.15, 0.15];
}

/* ======================================================================
 * Real assemblies. These are the components people recognise on sight, so
 * they are built the way the real ones are put together rather than as
 * stand-in boxes. All of them are oriented for their real axis.
 * ==================================================================== */

/** A road wheel: tyre, rim barrel, dish face, spokes, hub. Axle along Z. */
export function wheelMesh({ radius, width, rimR, spokes = 5, style = 'alloy', tread = 'road' }){
  const g = group('wheel');
  const seat = rimR * 1.02;
  const half = width / 2;
  /* tyre: bead, sidewall with real bulge, shoulder, crown */
  const tyre = lathe([
    [seat,        -half*0.96],
    [seat*1.06,   -half*1.00],
    [radius*0.74, -half*1.04],          // sidewall bulges past the rim
    [radius*0.93, -half*0.96],
    [radius*0.995,-half*0.72],          // shoulder
    [radius,      -half*0.40],
    [radius,       half*0.40],
    [radius*0.995, half*0.72],
    [radius*0.93,  half*0.96],
    [radius*0.74,  half*1.04],
    [seat*1.06,    half*1.00],
    [seat,         half*0.96],
  ], MAT.rubber(), 44);
  rot(tyre, Math.PI/2, 0, 0);          // lathe revolves about Y; the axle is Z
  g.add(tyre);
  if (tread){
    /* the crown carries a scanned tread — pattern, grooves and siping in one
       band, wrapped the same number of times a real tyre repeats it */
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.002, radius * 1.002, width * 0.84, 72, 1, true),
      MAT.tread(tread === true ? 'road' : tread));
    rot(crown, Math.PI/2, 0, 0);
    g.add(crown);
  }
  /* sidewalls: the scanned sidewall face, pinned rim-seat to shoulder so the
     moulded lettering sits exactly where it does on the real tyre */
  for (const s of [1, -1]){
    const wall = faceDisc(radius * 0.80, seat, MAT.sidewall(true),
                          { seg:72, ring:[0.309, 0.494] });
    wall.position.z = s * half * 1.045;
    if (s < 0) wall.rotation.y = Math.PI;
    g.add(wall);
  }
  /* the rim itself is a scan of a real alloy wheel where one is available —
     spokes, lug holes, centre bore and bead seat all as cast */
  const scanRim = partMesh('carRim', {
    dia: rimR * 2.12, depth: width * 0.82, axis:'z',
    mat: style === 'chrome' ? MAT.chrome() : style === 'dark' ? MAT.alloyDark() : MAT.rimAlloy(),
  });
  if (scanRim){
    scanRim.position.z = width * 0.09;      // the face sits near flush with the tyre
    g.add(scanRim);
    g.userData.scannedRim = true;
    return g;
  }

  /* rim: inner barrel, outer lip, dish face */
  const barrel = lathe([
    [rimR*0.98, -half*0.94], [rimR*1.05, -half*0.98], [rimR*1.05, -half*0.86],
    [rimR*0.92, -half*0.70], [rimR*0.92,  half*0.34], [rimR*1.05,  half*0.86],
    [rimR*1.05,  half*0.98], [rimR*0.98,  half*0.94],
  ], style === 'chrome' ? MAT.chrome() : MAT.alloy(), 40);
  rot(barrel, Math.PI/2, 0, 0);
  g.add(barrel);
  /* the face sits at the outer edge, which is what you actually see */
  const faceZ = half * 0.52;
  const hub = cyl(rimR * 0.30, rimR * 0.30, width * 0.30, MAT.alloyDark(), 22);
  rot(hub, Math.PI/2, 0, 0); hub.position.z = faceZ * 0.7;
  g.add(hub);
  for (let i = 0; i < 5; i++){                       // wheel studs
    const a = (i / 5) * TAU;
    const n = cyl(rimR * 0.055, rimR * 0.055, width * 0.10, MAT.steel(), 8);
    rot(n, Math.PI/2, 0, 0);
    n.position.set(Math.cos(a) * rimR * 0.19, Math.sin(a) * rimR * 0.19, faceZ * 0.95);
    g.add(n);
  }
  const mat = style === 'chrome' ? MAT.chrome() : style === 'dark' ? MAT.alloyDark() : MAT.alloy();
  for (let i = 0; i < spokes; i++){
    const a = (i / spokes) * TAU;
    const s = new THREE.Shape();
    const rIn = rimR * 0.30, rOut = rimR * 0.97, hw = (Math.PI / spokes) * 0.42;
    s.moveTo(Math.cos(-hw*0.6) * rIn, Math.sin(-hw*0.6) * rIn);
    s.lineTo(Math.cos(-hw) * rOut, Math.sin(-hw) * rOut);
    s.lineTo(Math.cos(hw) * rOut, Math.sin(hw) * rOut);
    s.lineTo(Math.cos(hw*0.6) * rIn, Math.sin(hw*0.6) * rIn);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: width * 0.13, bevelEnabled:true,
      bevelSize: width*0.02, bevelThickness: width*0.02, bevelSegments:1 });
    const spoke = new THREE.Mesh(geo, mat);
    spoke.rotation.z = a;
    spoke.position.z = faceZ - width * 0.065;
    g.add(spoke);
  }
  /* spoked wire wheel for dirt bikes */
  if (style === 'wire'){
    g.children.filter(c => c.geometry?.type === 'ExtrudeGeometry').forEach(c => g.remove(c));
    for (let i = 0; i < 32; i++){
      const a = (i / 32) * TAU;
      const sp = cyl(width * 0.012, width * 0.012, rimR * 0.72, MAT.steel(), 5);
      sp.position.set(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, (i % 2 ? 1 : -1) * width * 0.22);
      sp.rotation.z = a + Math.PI/2;
      g.add(sp);
    }
  }
  return g;
}

/** A vented brake disc with a top hat and drilled face. Axis along Z. */
export function brakeDisc(diaM, mat){
  const r = diaM / 2;
  const g = group('disc');
  const face = lathe([
    [r*0.42, -0.014], [r*0.46, -0.014], [r*0.46, -0.006],
    [r*0.99, -0.013], [r*0.99, 0.013], [r*0.46, 0.006],
    [r*0.46, 0.014], [r*0.42, 0.014],
  ], mat || MAT.iron(), 40);
  rot(face, Math.PI/2, 0, 0);
  g.add(face);
  const hat = lathe([[r*0.20, -0.020], [r*0.44, -0.020], [r*0.44, 0.010], [r*0.20, 0.010]],
                    MAT.alloyDark(), 26);
  rot(hat, Math.PI/2, 0, 0); hat.position.z = -0.012;
  g.add(hat);
  /* the visible face is a scan of a cross-drilled, coated disc: the drilling
     pattern, the swept band, the hat and the hub bolts, all in register */
  const scan = faceDisc(r * 1.023, 0.0, MAT.discFace(), { seg:72, span:r * 1.023 });
  scan.position.z = 0.0145;
  g.add(scan);
  return g;
}

/** A pleated air-filter element on its end caps. Axis along X, so it sits the
 *  way an inlet does. */
export function filterElement(radius, length, capMat){
  const g = group('filter');
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 40, 1, true), MAT.airFilter());
  const uv = body.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)                 // wrap the pleats around it
    uv.setXY(i, FILTER_UV.u0 + ((uv.getX(i) * 3) % 1) * (FILTER_UV.u1 - FILTER_UV.u0),
                FILTER_UV.v0 + uv.getY(i) * (FILTER_UV.v1 - FILTER_UV.v0));
  uv.needsUpdate = true;
  rot(body, 0, 0, Math.PI / 2);
  g.add(body);
  for (const s of [-1, 1]){
    const cap = cyl(radius * 1.04, radius * 1.04, length * 0.06, capMat || MAT.alloyDark(), 30);
    rot(cap, 0, 0, Math.PI / 2);
    cap.position.x = s * length * 0.5;
    g.add(cap);
  }
  return g;
}

/** A multi-piston caliper straddling the disc. */
export function caliper(diaM, mat){
  const r = diaM / 2;
  const g = group('caliper');
  const L = r * 0.74, H = L / 3.17;        // the scan's own proportions, kept
  for (const z of [-r*0.105, r*0.105]){
    const half = roundBox(L * 0.96, H * 0.96, r*0.10, 0.005, mat || MAT.red());
    half.position.z = z;
    g.add(half);
    for (const off of [-0.26, 0, 0.26]){   // the pistons behind each pad
      const p = cyl(r*0.075, r*0.075, r*0.05, MAT.alloyDark(), 12);
      rot(p, Math.PI/2, 0, 0);
      p.position.set(off * r, -H*0.16, z * 0.55);
      g.add(p);
    }
  }
  /* the outward faces are the scanned caliper itself, so the casting ribs,
     the bleed nipple and the brand come from the real part */
  for (const s of [1, -1]){
    const f = new THREE.Mesh(setUVRect(new THREE.PlaneGeometry(L, H), CALIPER_UV),
                             MAT.caliperShell());
    f.position.z = s * r * 0.158;
    if (s < 0) f.rotation.y = Math.PI;
    g.add(f);
  }
  g.add(at(box(L*0.82, H*0.30, r*0.20, MAT.steel()), 0, H*0.62, 0));   // bridge
  return g;
}

/** A volute scroll — the snail a turbo housing actually is. The cross-section
 *  is swept around a spiral whose tube grows as it wraps, so the inner wall
 *  stays on the wheel at `rHub` (that edge is the tongue) while the outer wall
 *  opens out. Axis along Z; the spiral ends in a tangential throat. */
export function scrollHousing(rHub, rOuter, width, mat, opts = {}){
  const seg = opts.seg ?? 108, ring = opts.ring ?? 20;
  const turns = opts.turns ?? 1.0;
  const t0 = opts.minTube ?? width * 0.26;
  const t1 = opts.maxTube ?? Math.max(t0 * 1.05, (rOuter - rHub) * 0.92);
  const dir = opts.hand ?? 1;                  // 1 = clockwise seen from +Z
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++){
    const u = i / seg;
    const a = dir * u * TAU * turns;
    const tube = t0 + (t1 - t0) * u * u;       // grows fastest near the throat
    const cr = rHub + tube;
    const rx = Math.cos(a), ry = Math.sin(a);
    for (let j = 0; j <= ring; j++){
      const ph = (j / ring) * TAU;
      const cp = Math.cos(ph), sp = Math.sin(ph);
      pos.push((cr + cp * tube) * rx, (cr + cp * tube) * ry, sp * tube * 0.62);
      nor.push(cp * rx, cp * ry, sp);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++){
      const a0 = i * (ring + 1) + j, b0 = a0 + ring + 1;
      idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const scroll = new THREE.Mesh(g, mat);
  scroll.userData.throat = {                    // where the pipe joins it
    angle: dir * TAU * turns,
    radius: rHub + t1,
    tube: t1,
  };
  return scroll;
}

/** A turbocharger: turbine housing, bearing housing, compressor cover, wheels.
 *  Shaft along Z, turbine at −Z, compressor at +Z. */
export function turboUnit(size, mats = {}){
  const g = group('turbo');
  /* Clocking.
   *
   * A turbo is three castings on one axis, and the two outer ones turn
   * relative to the middle one — that is how the same turbo fits a hundred
   * different engines. What does NOT turn is the bearing housing: its oil feed
   * is on top and its drain is on the bottom, and the drain works by gravity,
   * so a bearing housing rolled over with its volutes is a turbo that would
   * fill its own exhaust with oil.
   *
   * So the housings live in here and the core does not. The caller turns
   * `userData.clock` to aim the compressor outlet wherever the charge pipe has
   * to leave, and the oil fittings stay where physics needs them.
   */
  const clock = group('clock');
  g.add(clock);
  const hot = mats.hot || MAT.hot(), cold = mats.cold || MAT.alloy();
  const zT = -size * 0.44, zC = size * 0.44;   // turbine side, compressor side

  /* --- the two snails ------------------------------------------------- */
  const build = (z, m, hand, hubR, outR, w) => {
    const sc = scrollHousing(hubR, outR, w, m,
                             { hand, turns:0.94, minTube:w * 0.22, maxTube:w * 0.62 });
    sc.position.z = z;
    clock.add(sc);
    /* the wheel shroud: the housing wall that wraps the blade tips */
    const shroud = lathe([[hubR * 1.02, -w * 0.42], [hubR * 1.02, w * 0.30],
                          [hubR * 0.70, w * 0.44], [hubR * 0.44, w * 0.44]], m, 40);
    rot(shroud, Math.PI / 2, 0, 0);
    shroud.position.z = z;
    clock.add(shroud);
    return sc.userData.throat;
  };
  const tThroat = build(zT, hot,  1, size * 0.52, size * 0.98, size * 0.50);
  const cThroat = build(zC, cold, -1, size * 0.48, size * 0.90, size * 0.46);

  /* --- the throats, with a flange on each ------------------------------ */
  const stub = (throat, z, m, len) => {
    const a = throat.angle, r = throat.radius;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const tx = -Math.sin(a), ty = Math.cos(a);        // tangential, at the throat
    const p = pipe([[x, y, z], [x + tx * len, y + ty * len, z]], throat.tube * 0.92, m, 14);
    clock.add(p);
    const face = new THREE.Vector3(x + tx * len, y + ty * len, z);
    /* the flange on the end of it, square to the pipe */
    const fl = cyl(throat.tube * 1.20, throat.tube * 1.20, size * 0.05, m, 18);
    rot(fl, 0, 0, a);                       // cylinder axis Y, turned onto the tangent
    at(fl, x + tx * len, y + ty * len, z);
    clock.add(fl);
    for (let i = 0; i < 4; i++){            // and its bolts
      const b = hexPrism(throat.tube * 0.26, size * 0.05, MAT.plated());
      const ph = (i / 4) * TAU + Math.PI / 4;
      const rr = throat.tube * 0.98;
      rot(b, 0, 0, a);
      b.position.set(x + tx * len + tx * 0 + (-Math.sin(a)) * 0 + Math.cos(a) * Math.cos(ph) * rr,
                     y + ty * len + Math.sin(a) * Math.cos(ph) * rr,
                     z + Math.sin(ph) * rr);
      clock.add(b);
    }
    return face;
  };
  /* where the four pipes bolt on, so a caller can join real pipework to them
     instead of guessing where the housings ended up */
  const turbineIn    = stub(tThroat, zT, hot,  size * 0.42);
  const compressorOut = stub(cThroat, zC, cold, size * 0.40);

  /* --- the axial mouths: turbine outlet one side, compressor inlet the
         other, both on the shaft line ------------------------------------ */
  const tOut = lathe([[size * 0.34, 0], [size * 0.38, -size * 0.10],
                      [size * 0.38, -size * 0.34], [size * 0.46, -size * 0.34],
                      [size * 0.46, -size * 0.40], [size * 0.30, -size * 0.40]], hot, 26);
  rot(tOut, Math.PI / 2, 0, 0); tOut.position.z = zT - size * 0.14;
  clock.add(tOut);
  const cIn = lathe([[size * 0.32, 0], [size * 0.36, size * 0.10],
                     [size * 0.36, size * 0.32], [size * 0.44, size * 0.32],
                     [size * 0.44, size * 0.38], [size * 0.28, size * 0.38]], cold, 26);
  rot(cIn, Math.PI / 2, 0, 0); cIn.position.z = zC + size * 0.14;
  clock.add(cIn);

  /* --- the bearing housing between them, with its oil feed and drain --- */
  const chra = lathe([
    [size*0.34, -size*0.20], [size*0.34, -size*0.10], [size*0.23, -size*0.08],
    [size*0.23,  size*0.08], [size*0.34,  size*0.10], [size*0.34,  size*0.20],
  ], MAT.alloyDark(), 26);
  rot(chra, Math.PI/2, 0, 0);
  g.add(chra);
  for (const s of [-1, 1])                      // the water jacket unions
    g.add(at(cyl(size*0.07, size*0.07, size*0.16, MAT.alloyDark(), 10), s * size*0.30, size*0.24, 0));
  const feed = cyl(size*0.075, size*0.075, size*0.28, MAT.steel(), 12);
  feed.position.y = size * 0.32;
  const feedFl = at(hexPrism(size*0.20, size*0.06, MAT.plated()), 0, size*0.46, 0);
  const drain = lathe([[size*0.15, -size*0.24], [size*0.15, -size*0.32],
                       [size*0.21, -size*0.32], [size*0.21, -size*0.36]], MAT.alloyDark(), 16);
  drain.position.y = -size * 0.04;
  g.add(feed, feedFl, drain);

  /* --- the bolt rings that hold each housing to the bearing housing ---- */
  for (const [z, r, m, n] of [[zT + size * 0.24, size * 0.40, hot, 6],
                              [zC - size * 0.24, size * 0.38, cold, 6]]){
    clock.add(at(lathe([[r * 0.86, -size * 0.03], [r, -size * 0.03],
                        [r, size * 0.03], [r * 0.86, size * 0.03]], m, 30)
                 .rotateX(Math.PI / 2), 0, 0, z));
    clock.add(at(boltCircle(r * 0.94, n, size * 0.09, size * 0.055, MAT.plated(), 'xy'), 0, 0, z));
  }

  /* --- the wastegate: the actuator canister, its rod, and the arm on the
         valve shaft that the rod pulls ------------------------------------ */
  const wgR = size * 0.26;
  const wg = group('wastegate');
  /* the canister lies with its axis along Z, clamped to the compressor cover */
  const can = lathe([[0, -size*0.07], [wgR*0.94, -size*0.07], [wgR, -size*0.03],
                     [wgR, size*0.03], [wgR*0.94, size*0.07], [0, size*0.07]],
                    MAT.steel(), 26);
  rot(can, Math.PI / 2, 0, 0);
  wg.add(can);
  wg.add(at(cyl(wgR * 0.30, wgR * 0.30, size * 0.10, MAT.plated(), 12), 0, 0, -size * 0.11));
  wg.add(at(cyl(size * 0.05, size * 0.05, size * 0.12, MAT.rubber(), 10), 0, wgR * 0.62, size * 0.06));
  clock.add(at(wg, size * 0.74, size * 0.36, zC - size * 0.02));
  /* the rod, running back to the arm on the turbine housing */
  clock.add(pipe([[size * 0.74, size * 0.36, zC - size * 0.13],
                  [size * 0.72, size * 0.44, zT + size * 0.30],
                  [size * 0.66, size * 0.52, zT + size * 0.14]], size * 0.028, MAT.plated(), 8));
  clock.add(at(rot(box(size * 0.16, size * 0.05, size * 0.03, MAT.plated()), 0, 0, deg(-30)),
               size * 0.60, size * 0.50, zT + size * 0.14));
  /* and the bracket that holds the canister off the cover */
  clock.add(at(rot(box(size * 0.30, size * 0.04, size * 0.03, MAT.steel()), 0, 0, deg(14)),
               size * 0.60, size * 0.28, zC + size * 0.02));

  /* --- the rotating assembly ------------------------------------------- */
  const shaft = group('shaft');
  const cw = compressorWheel(size * 0.42, 7, size * 0.30, MAT.chrome());
  /* the turbine is a scan of a real wheel — eleven blades, each one a twisted
     surface, which is not something a loft can be talked into producing */
  const tw = partMesh('turbine', { dia: size * 0.84, mat: MAT.steel(), axis:'z' })
             || bladedWheel(size * 0.42, 12, size * 0.28, MAT.steel(), -0.5);
  cw.position.z = zC;
  tw.position.z = zT;
  tw.rotation.y = Math.PI;                      // shaft stub inboard
  shaft.add(cw, tw);
  shaft.add(at(cyl(size * 0.075, size * 0.075, size * 0.80, MAT.steel(), 12)
               .rotateX(Math.PI / 2), 0, 0, 0));
  g.add(shaft);
  g.userData.shaft = shaft;
  g.userData.clock = clock;
  g.userData.ports = {
    turbineIn, compressorOut,
    turbineOut:   new THREE.Vector3(0, 0, zT - size * 0.40),
    compressorIn: new THREE.Vector3(0, 0, zC + size * 0.38),
    /* the bearing housing has to be fed and drained, and the wastegate
       actuator has to see boost, so say where all three connect */
    oilIn:    new THREE.Vector3(0, size * 0.50, 0),
    oilOut:   new THREE.Vector3(0, -size * 0.38, 0),
    wgSignal: new THREE.Vector3(size * 0.74, size * 0.36, zC - size * 0.13),
    hotTube:  tThroat.tube,
    coldTube: cThroat.tube,
    axialTube: size * 0.34,
  };
  return g;
}

/** An intercooler or radiator core: end tanks, tube-and-fin matrix. */
export function coreMesh(widthZ, heightY, depthX, mats = {}, fins = 26){
  const g = group('core');
  const body = mats.body || MAT.alloyDark();
  const matrix = mats.matrix || MAT.alloyDark();
  /* cast end tanks with the hose necks on them, the way a real core is made */
  for (const sd of [-1, 1]){
    const z = sd * (widthZ / 2 - widthZ * 0.05);
    const tank = roundBox(depthX * 1.18, heightY * 1.02, widthZ * 0.10, depthX * 0.22, body);
    tank.position.z = z;
    g.add(tank);
    const neck = cyl(heightY * 0.16, heightY * 0.17, depthX * 1.0, body, 18);
    rot(neck, Math.PI / 2, 0, 0);
    neck.position.set(0, sd * heightY * 0.26, z + sd * widthZ * 0.10);
    g.add(neck);
    g.add(at(lathe([[heightY*0.175, 0], [heightY*0.20, depthX*0.10], [heightY*0.175, depthX*0.18]],
                   body, 18).rotateX(Math.PI/2), 0, sd*heightY*0.26, z + sd*widthZ*0.15));
  }
  /* bar-and-plate matrix: a charge tube, then a folded fin block, repeated */
  const inner = widthZ * 0.80;
  const rows = Math.max(6, Math.round(fins * 0.45));
  const pitch = heightY * 0.92 / rows;
  for (let i = 0; i < rows; i++){
    const y = -heightY * 0.46 + (i + 0.5) * pitch;
    g.add(at(box(depthX * 0.98, pitch * 0.34, inner, body), 0, y, 0));       // the bar
    const fin = box(depthX * 0.92, pitch * 0.52, inner, matrix);             // the fin block
    g.add(at(fin, 0, y + pitch * 0.42, 0));
  }
  /* the fin corrugation, which is what you actually see edge-on */
  const n = Math.max(10, Math.round(inner / (heightY * 0.06)));
  for (let i = 0; i < n; i++){
    const z = -inner / 2 + (i + 0.5) * (inner / n);
    g.add(at(box(depthX * 1.0, heightY * 0.92, inner / n * 0.30, matrix), 0, 0, z));
  }
  for (const y of [-heightY / 2, heightY / 2])                                // top and bottom rails
    g.add(at(box(depthX * 1.06, heightY * 0.05, widthZ * 0.99, body), 0, y, 0));
  return g;
}

/** An alternator: stator case with cooling slots, drive pulley, fan, rear cover. */
export function alternatorMesh(size){
  const g = group('alt');
  const caseM = MAT.alloyDark();
  const R = size * 0.56;

  /* the housings are the recognisable part: a ring of cast webs with cooling
     slots cut between them, front and rear, clamped by four through-bolts */
  const slotted = (depth, slots) => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R, 0, TAU, false);
    const bore = new THREE.Path();
    bore.absarc(0, 0, R * 0.30, 0, TAU, true);
    sh.holes.push(bore);
    for (let i = 0; i < slots; i++){
      const a0 = (i / slots) * TAU, w = (TAU / slots) * 0.46;
      const r0 = R * 0.52, r1 = R * 0.90;
      const h = new THREE.Path();
      h.moveTo(Math.cos(a0 - w) * r0, Math.sin(a0 - w) * r0);
      h.lineTo(Math.cos(a0 - w) * r1, Math.sin(a0 - w) * r1);
      h.lineTo(Math.cos(a0 + w) * r1, Math.sin(a0 + w) * r1);
      h.lineTo(Math.cos(a0 + w) * r0, Math.sin(a0 + w) * r0);
      h.closePath();
      sh.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled:false, curveSegments:26 });
    geo.rotateY(Math.PI / 2);
    return new THREE.Mesh(geo, caseM);
  };
  const front = slotted(size * 0.13, 16); front.position.x = -size * 0.34;
  const rear  = slotted(size * 0.13, 16); rear.position.x  =  size * 0.21;
  g.add(front, rear);
  /* the stator laminations showing between the two housings */
  g.add(at(rot(cyl(R * 0.88, R * 0.88, size * 0.55, MAT.steel(), 34), 0, 0, Math.PI/2), -size*0.06, 0, 0));
  for (const x of [-size * 0.21, size * 0.21])      // the housing rims either side of it
    g.add(at(rot(lathe([[R*0.88, 0], [R, 0], [R, size*0.05], [R*0.88, size*0.05]], caseM, 34),
                 0, 0, Math.PI/2), x, 0, 0));
  /* through-bolts */
  for (let i = 0; i < 4; i++){
    const a0 = (i / 4) * TAU + Math.PI / 4;
    g.add(at(rot(cyl(size*0.035, size*0.035, size*0.62, MAT.plated(), 8), 0, 0, Math.PI/2),
             -size*0.06, Math.cos(a0) * R * 0.94, Math.sin(a0) * R * 0.94));
  }
  /* the mounting ears: a long arm with a bushed eye, and the pivot lug */
  g.add(at(box(size * 0.70, size * 0.11, size * 0.09, caseM), -size * 0.02, R * 0.92, 0));
  g.add(at(rot(tubeMesh(size*0.11, size*0.055, size*0.12, caseM, 18), 0, 0, Math.PI/2),
           size * 0.34, R * 0.94, 0));
  g.add(at(rot(tubeMesh(size*0.12, size*0.06, size*0.20, caseM, 18), 0, 0, Math.PI/2),
           -size * 0.30, -R * 0.92, 0));
  /* the regulator pack and the B+ post on the back */
  g.add(at(roundBox(size*0.14, size*0.24, size*0.28, size*0.03, MAT.plastic()), size*0.34, -R*0.55, 0));
  g.add(at(rot(cyl(size*0.055, size*0.055, size*0.13, MAT.copper(), 10), 0, 0, Math.PI/2),
           size * 0.36, R * 0.50, size * 0.16));

  /* a black six-groove serpentine pulley and its nut */
  const pulley = group('altpulley');
  const p = [[size*0.10, -size*0.10]];
  for (let i = 0; i < 6; i++){
    const z0 = -size*0.09 + (i/6) * size*0.18, zw = size*0.18/6;
    p.push([size*0.34, z0], [size*0.29, z0 + zw*0.5], [size*0.34, z0 + zw]);
  }
  p.push([size*0.10, size*0.10]);
  const rim = lathe(p, MAT.black(), 30);
  rot(rim, 0, 0, Math.PI/2);
  pulley.add(rim);
  pulley.add(at(rot(hexPrism(size*0.16, size*0.07, MAT.plated()), 0, 0, Math.PI/2), -size*0.14, 0, 0));
  at(pulley, -size * 0.56, 0, 0);
  g.add(pulley);
  g.userData.pulley = pulley;
  return g;
}

/** A Roots blower: the case with its cooling fins, the front snout and drive
 *  pulley, the inlet elbow and the manifold plate it bolts down to. */
export function superchargerMesh(len, width, height, mat){
  const g = group('blower');
  const m = mat || MAT.alloyDark();
  /* the case: two overlapping rotor bores, which is why a blower is that shape */
  const sh = new THREE.Shape();
  const r = height * 0.34, sep = width * 0.22;
  sh.absarc(-sep, 0, r, Math.PI * 0.5, Math.PI * 1.5, false);
  sh.lineTo(sep, -r);
  sh.absarc(sep, 0, r, Math.PI * 1.5, Math.PI * 0.5, false);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth:len, bevelEnabled:false, curveSegments:22 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-len / 2, 0, 0);
  g.add(at(new THREE.Mesh(geo, m), 0, height * 0.30, 0));
  /* the fin comb along the top */
  const fins = Math.max(8, Math.round(len / (height * 0.10)));
  for (let i = 0; i < fins; i++)
    g.add(at(box(len / fins * 0.42, height * 0.16, width * 0.86, m),
             -len / 2 + (i + 0.5) * (len / fins), height * 0.68, 0));
  /* the base plate that seals to the manifold, and its bolt line */
  g.add(at(box(len * 1.04, height * 0.07, width * 1.08, m), 0, 0, 0));
  for (let i = 0; i < 6; i++)
    for (const sd of [-1, 1])
      g.add(at(hexPrism(width * 0.07, height * 0.06, MAT.plated()),
               (i / 5 - 0.5) * len * 0.92, height * 0.07, sd * width * 0.48));
  /* the front bearing plate, snout and drive pulley */
  g.add(at(box(len * 0.10, height * 0.62, width * 0.94, m), -len * 0.54, height * 0.30, 0));
  g.add(at(box(len * 0.22, height * 0.30, width * 0.42, m), -len * 0.68, height * 0.34, 0));
  const pulley = lathe([[height*0.08, -width*0.09], [height*0.30, -width*0.09],
                        [height*0.26, 0], [height*0.30, width*0.09], [height*0.08, width*0.09]],
                       MAT.black(), 28);
  rot(pulley, 0, 0, Math.PI / 2);
  at(pulley, -len * 0.82, height * 0.34, 0);
  g.add(pulley);
  g.userData.pulley = pulley;
  /* the throttle elbow feeding it at the back */
  g.add(at(rot(cyl(height * 0.24, height * 0.24, len * 0.20, m, 22), 0, 0, Math.PI/2),
           len * 0.58, height * 0.44, 0));
  g.add(at(rot(cyl(height * 0.26, height * 0.26, len * 0.05, MAT.alloy(), 22), 0, 0, Math.PI/2),
           len * 0.68, height * 0.44, 0));
  return g;
}

/** An oil filter: the rolled can with its ribs, the base plate and the seal. */
export function oilFilterMesh(dia, len, mat){
  const r = dia / 2;
  const g = group('oilfilter');
  const m = mat || MAT.blue();
  const p = [[0, -len * 0.5], [r * 0.94, -len * 0.5], [r, -len * 0.44]];
  for (let i = 0; i < 5; i++){                       // the rolled ribs up the can
    const y = -len * 0.36 + (i / 5) * len * 0.72;
    p.push([r, y], [r * 0.95, y + len * 0.03], [r, y + len * 0.06]);
  }
  p.push([r, len * 0.40], [r * 0.90, len * 0.48], [r * 0.72, len * 0.50]);
  const can = lathe(p, m, 30);
  rot(can, 0, 0, Math.PI / 2);
  g.add(can);
  g.add(at(rot(lathe([[r*0.72, 0], [r*0.98, 0], [r*0.98, len*0.06], [r*0.72, len*0.06]],
                     MAT.steel(), 30), 0, 0, Math.PI/2), len * 0.52, 0, 0));
  g.add(at(rot(lathe([[r*0.55, 0], [r*0.86, 0], [r*0.86, len*0.03], [r*0.55, len*0.03]],
                     MAT.gasket(), 30), 0, 0, Math.PI/2), len * 0.58, 0, 0));
  return g;
}

/** A serpentine belt: the outer tangent path around a set of pulleys, wrapped
 *  the way a real one runs. Pulleys are given in the front plane as
 *  {y, z, r}; the belt is built in that plane at `x`. */
export function serpentineBelt(pulleys, x, width, mat, thickness = width * 0.12){
  const pts = pulleys.filter(p => p.r > 0);
  if (pts.length < 2) return null;
  /* the belt runs round the outside, so the path is the convex hull of the
     pulley centres, walked anticlockwise */
  const cx = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const hull = [...pts].sort((a, b) => Math.atan2(a.z - cy, a.y - cx) - Math.atan2(b.z - cy, b.y - cx));
  const path = [];
  for (let i = 0; i < hull.length; i++){
    const A = hull[i], B = hull[(i + 1) % hull.length];
    const dy = B.y - A.y, dz = B.z - A.z;
    const d = Math.hypot(dy, dz) || 1;
    /* the outer common tangent between two circles */
    const phi = Math.atan2(dz, dy) + Math.acos(Math.max(-1, Math.min(1, (A.r - B.r) / d)));
    const nz = Math.sin(phi), ny = Math.cos(phi);
    /* built at x = 0: scaling the mesh across the belt would otherwise scale
       its offset from the origin too, and throw it across the scene */
    path.push(new THREE.Vector3(0, A.y + ny * A.r, A.z + nz * A.r));
    path.push(new THREE.Vector3(0, B.y + ny * B.r, B.z + nz * B.r));
  }
  const curve = new THREE.CatmullRomCurve3(path, true, 'catmullrom', 0.02);
  const geo = new THREE.TubeGeometry(curve, path.length * 10, thickness * 0.5, 4, true);
  const belt = new THREE.Mesh(geo, mat || MAT.rubber());
  belt.scale.x = width / thickness;       // wide across the pulley, thin radially
  belt.position.x = x;                    // and only then moved onto the plane
  return belt;
}

/** A starter motor: body, solenoid on top, nose cone and drive. */
export function starterMesh(size){
  const g = group('starter');
  const body = cyl(size*0.34, size*0.34, size*0.9, MAT.alloyDark(), 22);
  rot(body, 0, 0, Math.PI/2);
  const sol = cyl(size*0.20, size*0.20, size*0.62, MAT.alloy(), 18);
  rot(sol, 0, 0, Math.PI/2);
  sol.position.set(size*0.05, size*0.44, 0);
  const nose = lathe([[size*0.10,0],[size*0.30,0],[size*0.22,size*0.30],[size*0.10,size*0.30]], MAT.alloy(), 20);
  rot(nose, 0, 0, -Math.PI/2);
  nose.position.x = size*0.45;
  const pinion = cyl(size*0.12, size*0.12, size*0.22, MAT.steel(), 14);
  rot(pinion, 0, 0, Math.PI/2);
  pinion.position.x = size*0.80;
  g.add(body, sol, nose, pinion);
  return g;
}

/* ---------------------------------------------------------------------- *
 * The small parts.
 *
 * An engine is mostly not castings. It is sensors, connectors, looms, hoses,
 * clamps, lines, clips and shields — and their absence is exactly what makes a
 * generated engine look generated. Everything below is built the way the real
 * part is built, and every one of them has an origin at the face it mounts to,
 * so a caller places it against a surface rather than near one.
 * ---------------------------------------------------------------------- */

/** A moulded electrical connector. Body centred on the origin, the mating face
 *  looking down −Y, the lock tab on +X, and the wires leaving through +Y. */
export function connectorShell(w, h, d, mats = {}){
  const shell = mats.shell || MAT.connector();
  const g = group('connector');
  g.add(roundBox(w, h, d, Math.min(w, d) * 0.14, shell));
  /* the latch: a ramp on the outside with the release lever above it */
  g.add(at(rot(box(w * 0.16, h * 0.30, d * 0.44, shell), 0, 0, deg(-8)),
           w * 0.54, h * 0.10, 0));
  g.add(at(box(w * 0.10, h * 0.44, d * 0.30, shell), w * 0.58, h * 0.34, 0));
  /* the seal at the mating face, and the strain-relief boot the wires go into */
  g.add(at(roundBox(w * 0.92, h * 0.10, d * 0.92, 0.002, MAT.rubber()), 0, -h * 0.52, 0));
  g.add(at(lathe([[Math.min(w, d) * 0.34, 0], [Math.min(w, d) * 0.30, h * 0.24],
                  [Math.min(w, d) * 0.20, h * 0.46]], MAT.rubber(), 14), 0, h * 0.48, 0));
  return g;
}

/** A sensor. `kind` is how it is held: 'screw' threads into a boss (lambda,
 *  coolant temperature, knock, oil pressure), 'flange' bolts to a face through
 *  a single ear (crank and cam position), 'boss' sits on two feet with a port
 *  underneath (MAP). The origin is the mounting face; the body runs up +Y. */
export function sensorMesh(kind, size, mats = {}){
  const body = mats.body || MAT.connector();
  const metal = mats.metal || MAT.plated();
  const g = group('sensor');
  const M2 = (f) => size * f;

  if (kind === 'screw'){
    g.add(at(helixThread(M2(0.30), M2(0.34), M2(0.09), M2(0.035), metal), 0, -M2(0.30), 0));
    g.add(at(cyl(M2(0.27), M2(0.27), M2(0.34), metal, 14), 0, -M2(0.30), 0));
    g.add(at(hexPrism(M2(0.78), M2(0.30), metal), 0, -M2(0.02), 0));   // the spanner flats
    g.add(at(lathe([[M2(0.30), 0], [M2(0.34), M2(0.10)], [M2(0.34), M2(0.62)],
                    [M2(0.26), M2(0.72)]], body, 16), 0, M2(0.14), 0));
  } else if (kind === 'flange'){
    g.add(at(cyl(M2(0.30), M2(0.30), M2(0.26), metal, 16), 0, -M2(0.10), 0));  // the spigot
    g.add(at(roundBox(M2(1.30), M2(0.20), M2(0.56), M2(0.08), metal), M2(0.42), M2(0.06), 0));
    g.add(at(cyl(M2(0.16), M2(0.16), M2(0.34), MAT.steel(), 10), M2(0.86), M2(0.14), 0));
    g.add(at(hexPrism(M2(0.34), M2(0.14), MAT.plated()), M2(0.86), M2(0.28), 0));
    g.add(at(roundBox(M2(0.56), M2(0.70), M2(0.50), M2(0.10), body), 0, M2(0.38), 0));
  } else {
    for (const s of [-1, 1])                                   // the two mounting ears
      g.add(at(roundBox(M2(0.30), M2(0.14), M2(0.34), M2(0.05), body), s * M2(0.62), M2(0.08), 0));
    g.add(at(cyl(M2(0.14), M2(0.14), M2(0.22), body, 12), 0, -M2(0.10), 0));   // the port stub
    g.add(at(roundBox(M2(0.90), M2(0.56), M2(0.62), M2(0.10), body), 0, M2(0.30), 0));
  }
  const c = connectorShell(M2(0.66), M2(0.46), M2(0.52), mats);
  const top = kind === 'screw' ? M2(0.94) : kind === 'flange' ? M2(0.94) : M2(0.80);
  g.add(at(c, 0, top, 0));
  g.userData.lead = new THREE.Vector3(0, top + M2(0.44), 0);   // where its loom starts
  return g;
}

/** A wiring loom: corrugated conduit, taped at intervals, clipped where it
 *  turns. Points are in the caller's frame; the taped wraps are placed along
 *  the same curve so they land on the tube rather than beside it. */
export function loomMesh(points, radius, mats = {}){
  if (points.length < 2) return null;
  const pts = points.map(p => p.isVector3 ? p : new THREE.Vector3(...p));
  const g = group('loom');
  g.add(pipe(pts, radius, mats.conduit || MAT.conduit(), 8));
  const curve = new THREE.CatmullRomCurve3(pts);
  const wraps = Math.max(2, Math.round(curve.getLength() / (radius * 26)));
  for (let i = 1; i <= wraps; i++){
    const t = i / (wraps + 1);
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const ring = cyl(radius * 1.22, radius * 1.22, radius * 1.1, MAT.rubber(), 10);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
    ring.position.copy(p);
    g.add(ring);
  }
  return g;
}

/** A worm-drive hose clamp: the band, and the housing the screw sits in. The
 *  band's axis is +Y, like everything else here, so a caller aligns it to the
 *  hose by turning +Y onto the tangent. */
export function hoseClamp(radius, mats = {}){
  const m = mats.band || MAT.plated();
  const g = group('clamp');
  g.add(tubeMesh(radius * 1.10, radius * 1.02, radius * 0.20, m, 24));
  g.add(at(roundBox(radius * 0.46, radius * 0.30, radius * 0.34, radius * 0.05, m),
           radius * 1.18, 0, 0));
  g.add(at(rot(cyl(radius * 0.11, radius * 0.11, radius * 0.44, m, 8), Math.PI / 2, 0, 0),
           radius * 1.24, 0, radius * 0.24));
  return g;
}

/** A braided-steel line with an anodised fitting at each end — a turbo oil
 *  feed, a fuel line, a brake line. The fittings sit square to the run. */
export function braidedLine(points, radius, mats = {}){
  const pts = points.map(p => p.isVector3 ? p : new THREE.Vector3(...p));
  const g = group('line');
  g.add(pipe(pts, radius, mats.hose || MAT.braid(), 8));
  const curve = new THREE.CatmullRomCurve3(pts);
  for (const t of [0, 1]){
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t).normalize();
    const fit = group('fitting');
    fit.add(at(hexPrism(radius * 3.0, radius * 1.5, mats.fitting || MAT.anodised()), 0, 0, 0));
    fit.add(at(cyl(radius * 1.15, radius * 1.15, radius * 2.4, mats.fitting || MAT.anodised(), 12),
               0, radius * (t ? 1.4 : -1.4), 0));
    fit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    fit.position.copy(p);
    g.add(fit);
  }
  return g;
}

/** The dipstick: a tube down into the sump, and the looped handle on top. */
export function dipstickMesh(points, radius, mats = {}){
  const g = group('dipstick');
  g.add(pipe(points, radius, mats.tube || MAT.steel(), 8));
  const top = points[0].isVector3 ? points[0] : new THREE.Vector3(...points[0]);
  g.add(at(torus(radius * 2.6, radius * 0.55, mats.handle || MAT.orange(), 18),
           top.x, top.y + radius * 3.0, top.z));
  g.add(at(cyl(radius * 1.4, radius * 1.4, radius * 2.2, mats.tube || MAT.steel(), 12),
           top.x, top.y + radius * 0.8, top.z));
  return g;
}

/** A screw-on oil filler cap: knurled rim, the tab you turn it by, and the
 *  neck it screws into. The origin is the cover face it stands on. */
export function fillerCap(radius, mats = {}){
  const m = mats.cap || MAT.connector();
  const g = group('fillercap');
  g.add(at(lathe([[radius * 1.08, 0], [radius * 1.08, radius * 0.34],
                  [radius * 0.92, radius * 0.46]], MAT.alloyDark(), 22), 0, 0, 0));
  g.add(at(lathe([[radius, radius * 0.30], [radius * 1.16, radius * 0.42],
                  [radius * 1.16, radius * 0.78], [radius * 0.86, radius * 0.92]], m, 24), 0, 0, 0));
  for (let i = 0; i < 12; i++){                       // the knurl you grip
    const a = (i / 12) * TAU;
    g.add(at(box(radius * 0.10, radius * 0.44, radius * 0.14, m),
             Math.cos(a) * radius * 1.14, radius * 0.60, Math.sin(a) * radius * 1.14));
  }
  g.add(at(box(radius * 1.9, radius * 0.16, radius * 0.30, m), 0, radius * 0.92, 0));
  return g;
}

/** The thermostat housing: a flange onto the block, the thermostat chamber,
 *  and the outlet neck the top hose clamps onto. The origin is the flange
 *  face; the neck points along +X, and `userData.outlet` says where it ends. */
export function thermostatMesh(radius, mats = {}){
  const m = mats.body || MAT.alloy();
  const g = group('thermostat');
  g.add(at(rot(lathe([[radius * 1.5, 0], [radius * 1.5, radius * 0.20],
                      [radius * 1.15, radius * 0.28]], m, 22), 0, 0, -Math.PI / 2), 0, 0, 0));
  g.add(at(rot(lathe([[radius * 1.15, radius * 0.20], [radius * 1.15, radius * 1.10],
                      [radius * 0.86, radius * 1.30], [radius * 0.86, radius * 1.90]], m, 22),
               0, 0, -Math.PI / 2), 0, 0, 0));
  for (let i = 0; i < 3; i++){                        // the bolts holding it on
    const a = (i / 3) * TAU + 0.4;
    g.add(at(rot(bolt(radius * 0.12, radius * 0.40, MAT.plated()), 0, 0, -Math.PI / 2),
             radius * 0.10, Math.sin(a) * radius * 1.24, Math.cos(a) * radius * 1.24));
  }
  g.add(at(rot(hoseClamp(radius * 0.90), 0, 0, -Math.PI / 2), radius * 1.72, 0, 0));
  g.userData.outlet = new THREE.Vector3(radius * 1.90, 0, 0);
  return g;
}

/** A braided earth strap between two points, with a ring terminal on each. */
export function groundStrap(a, b, radius, mats = {}){
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  mid.y -= A.distanceTo(B) * 0.16;                     // straps hang, they do not span
  const g = group('strap');
  g.add(pipe([A, mid, B], radius, mats.braid || MAT.braid(), 8));
  for (const p of [A, B]){
    g.add(at(tubeMesh(radius * 2.6, radius * 1.1, radius * 0.7, MAT.copper(), 16), p.x, p.y, p.z));
    g.add(at(cyl(radius * 1.0, radius * 1.0, radius * 1.6, MAT.plated(), 8), p.x, p.y, p.z));
  }
  return g;
}

/** A canister in an exhaust: inlet cone, shell, outlet cone. Used for the
 *  catalyst and for a silencer. The origin is the inlet, running along +X. */
export function canBody(length, radius, mats = {}){
  const shell = mats.shell || MAT.stainless();
  const g = group('can');
  const inR = radius * 0.42;
  g.add(rot(lathe([[inR, 0], [inR, length * 0.06], [radius, length * 0.20],
                   [radius, length * 0.80], [inR, length * 0.94], [inR, length]],
                  shell, 26), 0, 0, -Math.PI / 2));
  /* the seam weld round the middle, which is how these are actually made */
  g.add(at(rot(tubeMesh(radius * 1.04, radius * 0.99, length * 0.03, shell, 26), 0, 0, Math.PI / 2),
           length * 0.5, 0, 0));
  return g;
}

/** A stamped heat shield wrapped round something hot: a partial cylinder with
 *  a rolled edge and the standoffs that hold it off the surface. */
export function heatShield(radius, length, arc, mats = {}){
  const m = mats.shield || MAT.stainless();
  const g = group('heatshield');
  const geo = new THREE.CylinderGeometry(radius, radius, length, 24, 1, true,
                                         -arc / 2, arc);
  const sh = new THREE.Mesh(geo, m);
  rot(sh, 0, 0, Math.PI / 2);
  g.add(sh);
  for (const x of [-length * 0.36, length * 0.36])
    for (const s of [-1, 1]){
      const a = s * arc / 2;
      g.add(at(cyl(radius * 0.05, radius * 0.05, radius * 0.22, MAT.plated(), 8),
               x, Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92));
    }
  return g;
}

/** A PCV valve or breather: the grommet in the cover, the valve body, and the
 *  hose stub. Origin at the cover face, standing up +Y. */
export function pcvValve(size, mats = {}){
  const g = group('pcv');
  g.add(at(lathe([[size * 0.62, 0], [size * 0.62, size * 0.16], [size * 0.44, size * 0.24]],
                 MAT.rubber(), 16), 0, 0, 0));
  g.add(at(lathe([[size * 0.44, size * 0.10], [size * 0.44, size * 0.70],
                  [size * 0.34, size * 0.80]], mats.body || MAT.alloyDark(), 16), 0, 0, 0));
  g.add(at(lathe([[size * 0.30, size * 0.70], [size * 0.30, size * 1.10],
                  [size * 0.38, size * 1.16], [size * 0.30, size * 1.24]],
                 MAT.plated(), 14), 0, 0, 0));
  return g;
}

/** An engine mount: the arm off the block, the bonded rubber, and the stud
 *  that goes down into the subframe. Origin is the block face. */
export function engineMount(size, mats = {}){
  const g = group('mount');
  g.add(at(roundBox(size * 0.34, size * 1.10, size * 0.90, size * 0.08,
                    mats.arm || MAT.alloyDark()), size * 0.17, 0, 0));
  g.add(at(lathe([[size * 0.62, 0], [size * 0.62, size * 0.52], [size * 0.50, size * 0.60]],
                 MAT.damperRubber(), 20), size * 0.34, -size * 0.62, 0));
  g.add(at(cyl(size * 0.16, size * 0.16, size * 0.50, MAT.steel(), 10),
           size * 0.34, -size * 0.92, 0));
  for (const s of [-1, 1])
    g.add(at(bolt(size * 0.09, size * 0.30, MAT.plated()), 0, s * size * 0.36, size * 0.28));
  return g;
}
