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
