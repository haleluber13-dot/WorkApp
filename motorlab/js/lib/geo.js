/* MotorLab — small geometry/material toolkit shared by every 3D builder. */
import * as THREE from 'three';

export const MAT = {
  alloy:    () => new THREE.MeshStandardMaterial({ color:0x9aa3ad, metalness:.68, roughness:.42 }),
  alloyDark:() => new THREE.MeshStandardMaterial({ color:0x6d757f, metalness:.7,  roughness:.5  }),
  iron:     () => new THREE.MeshStandardMaterial({ color:0x4a4f57, metalness:.55, roughness:.72 }),
  steel:    () => new THREE.MeshStandardMaterial({ color:0xb9c0c8, metalness:.9,  roughness:.28 }),
  chrome:   () => new THREE.MeshStandardMaterial({ color:0xe6ebf2, metalness:1.0, roughness:.08 }),
  copper:   () => new THREE.MeshStandardMaterial({ color:0xc4763a, metalness:.9,  roughness:.35 }),
  brass:    () => new THREE.MeshStandardMaterial({ color:0xc9a227, metalness:.85, roughness:.34 }),
  bearing:  () => new THREE.MeshStandardMaterial({ color:0xd7c9a8, metalness:.75, roughness:.45 }),
  rubber:   () => new THREE.MeshStandardMaterial({ color:0x1b1d21, metalness:.05, roughness:.95 }),
  plastic:  () => new THREE.MeshStandardMaterial({ color:0x2a2f38, metalness:.1,  roughness:.72 }),
  hot:      () => new THREE.MeshStandardMaterial({ color:0x8a6252, metalness:.6,  roughness:.62 }),
  red:      () => new THREE.MeshStandardMaterial({ color:0xc0392b, metalness:.35, roughness:.5  }),
  orange:   () => new THREE.MeshStandardMaterial({ color:0xd9741f, metalness:.4,  roughness:.45 }),
  blue:     () => new THREE.MeshStandardMaterial({ color:0x2f6fb0, metalness:.4,  roughness:.45 }),
  black:    () => new THREE.MeshStandardMaterial({ color:0x15171c, metalness:.25, roughness:.7  }),
  glass:    () => new THREE.MeshPhysicalMaterial({ color:0x9fd4ff, metalness:0, roughness:.08, transmission:.85, transparent:true, opacity:.4 }),
  gasket:   () => new THREE.MeshStandardMaterial({ color:0xd06a2a, metalness:.3,  roughness:.6  }),
  wire:     (c) => new THREE.MeshStandardMaterial({ color:c, metalness:.2, roughness:.6 }),
  emissive: (c, i=1.4) => new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:i, roughness:.4 }),
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
