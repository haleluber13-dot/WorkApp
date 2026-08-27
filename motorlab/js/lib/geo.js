/* MotorLab — small geometry/material toolkit shared by every 3D builder. */
import * as THREE from 'three';
import { tex, repeated, whenTextures, CALIPER_UV, FILTER_UV } from './textures.js';

/** Dress a material with scanned maps as soon as the library is in place.
 *  Until then — and if the files are missing — the generated look stands in. */
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
  c.repeat.set(r, r);
  return c;
}

/* Materials are shared: a V12 uses one aluminium, not twelve. */
const _mat = new Map();
const mat = (key, make) => { if (!_mat.has(key)) _mat.set(key, make()); return _mat.get(key); };

export const MAT = {
  /* sand-cast aluminium: bright, fairly rough, grainy */
  alloy: () => mat('alloy', () => new THREE.MeshStandardMaterial({
    color:0xa8b0ba, metalness:0.88, roughness:0.52, envMapIntensity:1.15,
    roughnessMap: withRepeat(castGrain(), 3), bumpMap: withRepeat(castGrain(), 3), bumpScale:0.6 })),
  alloyDark: () => mat('alloyDark', () => new THREE.MeshStandardMaterial({
    color:0x767e88, metalness:0.86, roughness:0.62, envMapIntensity:1.0,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.7 })),
  /* cast iron: darker, rougher, still metal */
  iron: () => mat('iron', () => new THREE.MeshStandardMaterial({
    color:0x4e535b, metalness:0.82, roughness:0.72, envMapIntensity:0.85,
    roughnessMap: withRepeat(castGrain(), 5), bumpMap: withRepeat(castGrain(), 5), bumpScale:0.8 })),
  /* forged and machined steel: tool marks, low roughness */
  steel: () => mat('steel', () => new THREE.MeshStandardMaterial({
    color:0xc2c9d2, metalness:1.0, roughness:0.26, envMapIntensity:1.3,
    roughnessMap: withRepeat(machined(), 2), bumpMap: withRepeat(machined(), 2), bumpScale:0.25 })),
  chrome: () => mat('chrome', () => new THREE.MeshStandardMaterial({
    color:0xeef2f7, metalness:1.0, roughness:0.06, envMapIntensity:1.6 })),
  copper: () => mat('copper', () => new THREE.MeshStandardMaterial({
    color:0xc4763a, metalness:1.0, roughness:0.32, envMapIntensity:1.3 })),
  brass: () => mat('brass', () => new THREE.MeshStandardMaterial({
    color:0xc9a227, metalness:1.0, roughness:0.30, envMapIntensity:1.3 })),
  bearing: () => mat('bearing', () => new THREE.MeshStandardMaterial({
    color:0xd7c9a8, metalness:0.85, roughness:0.34, envMapIntensity:1.2 })),
  rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({
    color:0x14161a, metalness:0.0, roughness:0.94, envMapIntensity:0.35,
    roughnessMap: withRepeat(rubberTooth(), 6), bumpMap: withRepeat(rubberTooth(), 6), bumpScale:0.5 })),
  plastic: () => mat('plastic', () => new THREE.MeshStandardMaterial({
    color:0x23282f, metalness:0.0, roughness:0.58, envMapIntensity:0.7 })),
  /* exhaust side: heat-discoloured, oxidised, barely reflective */
  hot: () => mat('hot', () => new THREE.MeshStandardMaterial({
    color:0x8d6552, metalness:0.72, roughness:0.66, envMapIntensity:0.8,
    roughnessMap: withRepeat(castGrain(), 4), bumpMap: withRepeat(castGrain(), 4), bumpScale:0.6 })),
  /* painted components get a clearcoat, which is what makes paint read as paint */
  red: () => mat('red', () => new THREE.MeshPhysicalMaterial({
    color:0xb52a20, metalness:0.15, roughness:0.34, clearcoat:1, clearcoatRoughness:0.10, envMapIntensity:1.1 })),
  orange: () => mat('orange', () => new THREE.MeshPhysicalMaterial({
    color:0xd9741f, metalness:0.30, roughness:0.32, clearcoat:0.8, clearcoatRoughness:0.16, envMapIntensity:1.1 })),
  blue: () => mat('blue', () => new THREE.MeshPhysicalMaterial({
    color:0x2f6fb0, metalness:0.25, roughness:0.34, clearcoat:0.8, clearcoatRoughness:0.14, envMapIntensity:1.1 })),
  black: () => mat('black', () => new THREE.MeshStandardMaterial({
    color:0x101216, metalness:0.30, roughness:0.62, envMapIntensity:0.7 })),
  glass: () => mat('glass', () => new THREE.MeshPhysicalMaterial({
    color:0x9fd4ff, metalness:0, roughness:0.05, transmission:0.9, thickness:0.02,
    transparent:true, opacity:0.45, envMapIntensity:1.4 })),
  gasket: () => mat('gasket', () => new THREE.MeshStandardMaterial({
    color:0xc4631f, metalness:0.55, roughness:0.44, envMapIntensity:0.9 })),
  wire: (c) => mat('wire' + c, () => new THREE.MeshStandardMaterial({
    color:c, metalness:0.0, roughness:0.48, envMapIntensity:0.6 })),
  emissive: (c, i=1.4) => new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:i, roughness:.4 }),
  /* real carbon-fibre weave, off a scan; used for aero, tubs and trim */
  carbon: () => mat('carbon', () => scanned(new THREE.MeshPhysicalMaterial({
    color:0xffffff, metalness:0.28, roughness:0.30, clearcoat:1, clearcoatRoughness:0.07,
    envMapIntensity:1.1 }), m => { m.map = repeated('carbon', 3); if (!m.map) m.color.set(0x1b1d20); })),
  /* the underbody pan: seam sealer, spray-on deadener, road grime */
  underbody: () => mat('underbody', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.35, roughness:0.85, envMapIntensity:0.45 }),
    m => { m.map = repeated('underbody', 3, 2); if (!m.map) m.color.set(0x2a2c30); })),
  /* tyre crown: scanned rubber for colour and grain, pattern on top. The scan
     came off a slick, so a road or knobby tyre gets its blocks from here. */
  tread: (kind = 'road') => mat('tread_' + kind, () => scanned(new THREE.MeshStandardMaterial({
    color:0x9c9fa2, metalness:0.0, roughness:0.96, envMapIntensity:0.22 }), m => {
      m.map = repeated('tread', 24, 1);
      if (!m.map) m.color.set(0x16181c);
      m.bumpMap = kind === 'slick' ? repeated('treadBump', 24, 1)
                                   : repeatXY(treadPattern(kind), 24, 1);
      m.bumpScale = kind === 'slick' ? 1.0 : 2.2;
    })),
  /* tyre sidewall, lettering and all — mapped flat onto an annulus */
  sidewall: (outer = true) => mat('sidewall' + outer, () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.0, roughness:0.92, envMapIntensity:0.3,
    transparent:true, alphaTest:0.35, side:THREE.DoubleSide }), m => {
      m.map = tex(outer ? 'tyreSide' : 'tyreBack');
      m.bumpMap = tex('tyreSideBump'); m.bumpScale = 0.8;
      if (!m.map){ m.color.set(0x14161a); m.transparent = false; m.alphaTest = 0; }
    })),
  /* cross-drilled, gold-coated disc face, straight off the part */
  discFace: () => mat('discFace', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.75, roughness:0.42, envMapIntensity:1.1,
    transparent:true, alphaTest:0.5, side:THREE.DoubleSide }),
    m => { m.map = tex('brakeDisc'); if (!m.map){ m.color.set(0x5a5f66); m.transparent = false; m.alphaTest = 0; } })),
  /* six-pot caliper shell: photo albedo plus its own normal map */
  caliperShell: () => mat('caliperShell', () => scanned(new THREE.MeshPhysicalMaterial({
    color:0xffffff, metalness:0.15, roughness:0.36, clearcoat:0.9, clearcoatRoughness:0.10,
    envMapIntensity:1.1 }), m => {
      m.map = tex('caliper'); m.normalMap = tex('caliperNormal');
      if (m.normalMap) m.normalScale = new THREE.Vector2(1.1, 1.1);
      if (!m.map) m.color.set(0xb52a20);
    })),
  /* a pleated filter element, off a real one */
  airFilter: () => mat('airFilter', () => scanned(new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:0.15, roughness:0.72, envMapIntensity:0.6,
    side:THREE.DoubleSide }),
    m => { m.map = tex('engineBay'); if (!m.map) m.color.set(0xb04a4a); })),
  /* body paint: metallic base under a clearcoat, tinted so the structure shows */
  paint: (colour, opacity = 1) => new THREE.MeshPhysicalMaterial({
    color:colour, metalness:0.72, roughness:0.26, clearcoat:1, clearcoatRoughness:0.045,
    envMapIntensity:1.35, transparent: opacity < 1, opacity, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide }),
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
  g.rotateX(-Math.PI/2); g.translate(0,h/2,0);
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
export function bolt(r=0.035, h=0.07, mat){
  const g = new THREE.Group();
  const head = cyl(r*1.7, r*1.7, h*0.42, mat || MAT.steel(), 6);
  head.position.y = h*0.5; g.add(head);
  const shank = cyl(r, r, h, mat || MAT.steel(), 8);
  g.add(shank);
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

/** A turbocharger: turbine housing, bearing housing, compressor cover, wheels.
 *  Shaft along Z, turbine at −Z, compressor at +Z. */
export function turboUnit(size, mats = {}){
  const g = group('turbo');
  const hot = mats.hot || MAT.hot(), cold = mats.cold || MAT.alloy();
  const tHousing = volute(size * 0.34, size * 0.98, size * 0.52, hot, 72);
  rot(tHousing, 0, -Math.PI/2, 0);                 // volute() extrudes along X; bring it to Z
  tHousing.position.z = -size * 0.42;
  const cHousing = volute(size * 0.30, size * 0.88, size * 0.46, cold, 72);
  rot(cHousing, 0, -Math.PI/2, 0);
  cHousing.position.z = size * 0.42;
  /* the bearing housing between them, with its oil feed and drain */
  const chra = lathe([
    [size*0.34, -size*0.16], [size*0.34, -size*0.05], [size*0.24, -size*0.05],
    [size*0.24,  size*0.05], [size*0.34,  size*0.05], [size*0.34,  size*0.16],
  ], MAT.alloyDark(), 22);
  rot(chra, Math.PI/2, 0, 0);
  const feed = cyl(size*0.09, size*0.09, size*0.30, MAT.steel(), 12);
  feed.position.y = size * 0.34;
  const drain = cyl(size*0.13, size*0.13, size*0.26, MAT.alloyDark(), 12);
  drain.position.y = -size * 0.32;
  /* the outlets that make a turbo recognisable */
  const cOut = cyl(size*0.30, size*0.30, size*0.44, cold, 20);
  rot(cOut, 0, 0, Math.PI/2);
  cOut.position.set(size*0.92, size*0.30, size*0.42);
  const tIn = cyl(size*0.34, size*0.34, size*0.40, hot, 20);
  rot(tIn, 0, 0, Math.PI/2);
  tIn.position.set(-size*0.92, size*0.30, -size*0.42);
  const shaft = group('shaft');
  const cw = bladedWheel(size * 0.44, 10, size * 0.30, MAT.chrome(), 0.6);
  const tw = bladedWheel(size * 0.46, 12, size * 0.30, MAT.steel(), -0.5);
  cw.position.z = size * 0.42;
  tw.position.z = -size * 0.42;
  shaft.add(cw, tw);
  g.add(tHousing, cHousing, chra, feed, drain, cOut, tIn, shaft);
  g.userData.shaft = shaft;
  return g;
}

/** An intercooler or radiator core: end tanks, tube-and-fin matrix. */
export function coreMesh(widthZ, heightY, depthX, mats = {}, fins = 26){
  const g = group('core');
  const body = mats.body || MAT.alloyDark();
  const matrix = mats.matrix || MAT.alloy();
  for (const z of [-widthZ/2 + widthZ*0.045, widthZ/2 - widthZ*0.045]){
    const tank = roundBox(depthX * 1.12, heightY * 1.02, widthZ * 0.09, depthX*0.16, body);
    tank.position.z = z;
    g.add(tank);
  }
  const inner = widthZ * 0.82;
  for (let i = 0; i < fins; i++){
    const z = -inner/2 + (i + 0.5) * (inner / fins);
    const tube = box(depthX * 0.94, heightY * 0.94, inner / fins * 0.42, matrix);
    tube.position.z = z;
    g.add(tube);
  }
  /* top and bottom rails */
  for (const y of [-heightY/2, heightY/2])
    g.add(at(box(depthX * 1.0, heightY * 0.06, widthZ * 0.98, body), 0, y, 0));
  return g;
}

/** An alternator: stator case with cooling slots, drive pulley, fan, rear cover. */
export function alternatorMesh(size){
  const g = group('alt');
  const caseM = MAT.alloyDark();
  const front = lathe([[size*0.10,-size*0.34],[size*0.52,-size*0.34],[size*0.56,-size*0.16],[size*0.10,-size*0.16]], caseM, 24);
  const stator = cyl(size*0.56, size*0.56, size*0.34, MAT.alloy(), 26);
  const rear = lathe([[size*0.10,size*0.16],[size*0.54,size*0.16],[size*0.50,size*0.36],[size*0.10,size*0.36]], caseM, 24);
  for (const m of [front, stator, rear]) rot(m, 0, 0, Math.PI/2);
  stator.position.x = 0; front.position.x = 0; rear.position.x = 0;
  g.add(front, stator, rear);
  for (let i = 0; i < 14; i++){                       // cooling slots around the case
    const a = (i/14) * TAU;
    const slot = box(size*0.26, size*0.10, size*0.05, MAT.black());
    slot.position.set(0, Math.cos(a)*size*0.54, Math.sin(a)*size*0.54);
    slot.rotation.x = -a;
    g.add(slot);
  }
  const pulley = lathe([[size*0.08,-size*0.10],[size*0.34,-size*0.10],[size*0.30,0],[size*0.34,size*0.10],[size*0.08,size*0.10]],
                       MAT.steel(), 22);
  rot(pulley, 0, 0, Math.PI/2);
  pulley.position.x = -size * 0.52;
  const fan = bladedWheel(size*0.34, 9, size*0.12, MAT.steel(), 0.5);
  rot(fan, 0, Math.PI/2, 0);
  fan.position.x = -size * 0.38;
  const post = cyl(size*0.07, size*0.07, size*0.14, MAT.copper(), 10);
  post.position.set(size*0.30, size*0.44, 0);
  g.add(pulley, fan, post);
  g.userData.pulley = pulley;
  return g;
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
