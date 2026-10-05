/* The face on the mannequin: a textured mask built from the 468 landmark
   vertices, fitted onto the head (eye line, chin, face width) and
   shrink-wrapped onto the head surface, plus an optional hair shell. */

import { MeshBVH } from "../../vendor/bvh/three-mesh-bvh.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ helpers */

/** per-vertex distance (face-space units) to the oval polyline, in the xy plane */
function ovalDistance(points, oval) {
  const n = points.length / 3, d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const px = points[i * 3], py = points[i * 3 + 1];
    let best = Infinity;
    for (let k = 0; k < oval.length; k++) {
      const a = oval[k] * 3, b = oval[(k + 1) % oval.length] * 3;
      const ax = points[a], ay = points[a + 1], bx = points[b], by = points[b + 1];
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
      const dd = Math.hypot(px - ax - vx * t, py - ay - vy * t);
      if (dd < best) best = dd;
    }
    d[i] = best;
  }
  for (const v of oval) d[v] = 0;
  return d;
}

function adjacency(indices, n) {
  const sets = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  return sets.map((s) => Int32Array.from(s));
}

/** one level of midpoint subdivision (keeps the original vertices first) */
function subdivide(points, uv, indices) {
  const n0 = points.length / 3;
  const P = Array.from(points), U = Array.from(uv), I = [];
  const mid = new Map();
  const m = (a, b) => {
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    let v = mid.get(key);
    if (v === undefined) {
      v = P.length / 3;
      for (let k = 0; k < 3; k++) P.push((P[a * 3 + k] + P[b * 3 + k]) / 2);
      for (let k = 0; k < 2; k++) U.push((U[a * 2 + k] + U[b * 2 + k]) / 2);
      mid.set(key, v);
    }
    return v;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ab = m(a, b), bc = m(b, c), ca = m(c, a);
    I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  // boundary vertices: on edges used by a single triangle
  const cnt = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3];
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  const boundary = new Uint8Array(P.length / 3);
  for (const [key, c] of cnt) if (c === 1) { boundary[Math.floor(key / 65536)] = 1; boundary[key % 65536] = 1; }
  return { P: new Float32Array(P), U: new Float32Array(U), I, boundary, n0 };
}

function strandTexture(THREE, style) {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S), d = img.data;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const col = new Float32Array(S);
  for (let x = 0; x < S; x++) col[x] = rnd();
  for (let x = 0; x < S; x++) col[x] = (col[x] + col[(x + 1) % S] * 0.5 + col[(x + S - 1) % S] * 0.5) / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v;
    if (style === "buzz") v = 0.78 + rnd() * 0.32;                                   // stubble speckle
    else v = 0.72 + col[x] * 0.38 + (rnd() - 0.5) * 0.08 + 0.04 * Math.sin((y / S) * Math.PI * 6 + col[x] * 9); // strands along v
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = clamp(Math.round(v * 232), 0, 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ createFaceObject */

/**
 * The textured face mask (+ hair shell after fitting), in face space
 * (eye centre at the origin, +Y up, +Z out, unit = inter-pupil distance).
 */
export function createFaceObject(face, THREE) {
  const sub = subdivide(face.points, face.uv, face.indices);
  const n = sub.P.length / 3;
  const geo = new THREE.BufferGeometry();
  const pos = sub.P;
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(sub.U, 2));
  geo.setIndex(sub.I);
  // feather: alpha 0 on the oval → 1 over the outer ~15% of the face
  const dist = ovalDistance(pos, face.oval);
  for (let i = 0; i < n; i++) if (sub.boundary[i]) dist[i] = 0;
  let ymin = Infinity, ymax = -Infinity;
  for (const v of face.oval) { ymin = Math.min(ymin, face.points[v * 3 + 1]); ymax = Math.max(ymax, face.points[v * 3 + 1]); }
  const band = (ymax - ymin) * 0.15;
  // horizontal extent of the oval at a height (for a wider fade toward the sides of the face)
  const ov = face.oval.map((v) => [pos[v * 3], pos[v * 3 + 1]]);
  const rowExtent = (y) => {
    let l = Infinity, r = -Infinity;
    for (let k = 0; k < ov.length; k++) {
      const [ax, ay] = ov[k], [bx, by] = ov[(k + 1) % ov.length];
      if ((ay - y) * (by - y) > 0 || ay === by) continue;
      const x = ax + (bx - ax) * (y - ay) / (by - ay);
      l = Math.min(l, x); r = Math.max(r, x);
    }
    return [l, r];
  };
  const feather = new Float32Array(n);
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [l, r] = rowExtent(pos[i * 3 + 1]);
    const x = pos[i * 3];
    const t = x >= 0 ? (r > 0 ? x / r : 1) : (l < 0 ? x / l : 1);
    feather[i] = Math.min(clamp(dist[i] / band, 0, 1), clamp((1 - t) / 0.3, 0, 1));
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = sstep(0, 1, feather[i]) * 0.97 + (feather[i] > 0 ? 0.03 : 0);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  geo.userData.base = Float32Array.from(pos);
  geo.userData.feather = feather;
  geo.userData.adj = adjacency(sub.I, n);
  geo.userData.boundary = sub.boundary;

  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = face.image;

  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, emissiveMap: tex, emissive: new THREE.Color(0x161616), emissiveIntensity: 1,
    color: 0xffffff, roughness: 0.6, metalness: 0,
    sheen: 0.3, sheenRoughness: 0.75, sheenColor: new THREE.Color(face.skinTone).lerp(new THREE.Color(0xff6a50), 0.5),
    clearcoat: 0.1, clearcoatRoughness: 0.5, envMapIntensity: 0.55,
    vertexColors: true, transparent: true, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mask = new THREE.Mesh(geo, mat);
  mask.name = "faceMask";
  mask.renderOrder = 2;
  mask.castShadow = false; mask.receiveShadow = true;

  const group = new THREE.Group();
  group.name = "userFace";
  group.add(mask);
  group.userData = { face, mask, hair: null, THREE, fitted: false };
  return group;
}

/* ------------------------------------------------------------------ head measurement */

function makeCaster(bodyMesh, THREE) {
  const geo = bodyMesh.geometry;
  let bvh = geo.boundsTree;
  if (!bvh) {
    // build our own (on an index copy: the BVH reorders the index in place)
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", geo.attributes.position);
    if (geo.attributes.normal) g2.setAttribute("normal", geo.attributes.normal);
    if (geo.index) g2.setIndex(geo.index.clone());
    bvh = new MeshBVH(g2);
  }
  const bgeo = bvh.geometry || geo;
  const nor = bgeo.attributes.normal;
  const ray = new THREE.Ray();
  const tri = new THREE.Triangle(), bary = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const posA = bgeo.attributes.position;
  const qv = new THREE.Vector3(), cpt = {};
  const idxA = bgeo.index;
  /** closest surface point + interpolated normal */
  function closest(q) {
    qv.set(q[0], q[1], q[2]);
    const r = bvh.closestPointToPoint(qv, cpt);
    if (!r) return null;
    const f = r.faceIndex;
    const a = idxA ? idxA.getX(f * 3) : f * 3, b = idxA ? idxA.getX(f * 3 + 1) : f * 3 + 1, c = idxA ? idxA.getX(f * 3 + 2) : f * 3 + 2;
    va.fromBufferAttribute(posA, a); vb.fromBufferAttribute(posA, b); vc.fromBufferAttribute(posA, c);
    tri.set(va, vb, vc);
    let n;
    if (nor) {
      tri.getBarycoord(r.point, bary);
      const nx = nor.getX(a) * bary.x + nor.getX(b) * bary.y + nor.getX(c) * bary.z;
      const ny = nor.getY(a) * bary.x + nor.getY(b) * bary.y + nor.getY(c) * bary.z;
      const nz = nor.getZ(a) * bary.x + nor.getZ(b) * bary.y + nor.getZ(c) * bary.z;
      const l = Math.hypot(nx, ny, nz) || 1; n = [nx / l, ny / l, nz / l];
    } else { const t = new THREE.Vector3(); tri.getNormal(t); n = [t.x, t.y, t.z]; }
    return { p: [r.point.x, r.point.y, r.point.z], n };
  }
  cast.closest = closest;
  return cast;
  function cast(o, dir) {
    ray.origin.set(o[0], o[1], o[2]);
    ray.direction.set(dir[0], dir[1], dir[2]).normalize();
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    if (!hit) return null;
    const f = hit.face;
    let n;
    if (nor && f) {
      va.fromBufferAttribute(posA, f.a); vb.fromBufferAttribute(posA, f.b); vc.fromBufferAttribute(posA, f.c);
      tri.set(va, vb, vc); tri.getBarycoord(hit.point, bary);
      const nx = nor.getX(f.a) * bary.x + nor.getX(f.b) * bary.y + nor.getX(f.c) * bary.z;
      const ny = nor.getY(f.a) * bary.x + nor.getY(f.b) * bary.y + nor.getY(f.c) * bary.z;
      const nz = nor.getZ(f.a) * bary.x + nor.getZ(f.b) * bary.y + nor.getZ(f.c) * bary.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    } else n = f ? [f.normal.x, f.normal.y, f.normal.z] : [0, 0, 1];
    return { p: [hit.point.x, hit.point.y, hit.point.z], n };
  }
}

function boundsArrays(bounds, bodyMesh) {
  if (bounds && Array.isArray(bounds.min)) return bounds;
  if (bounds && bounds.min && bounds.min.isVector3) return { min: bounds.min.toArray(), max: bounds.max.toArray() };
  bodyMesh.geometry.computeBoundingBox();
  const b = bodyMesh.geometry.boundingBox;
  return { min: b.min.toArray(), max: b.max.toArray() };
}

/** Find the mannequin's face landmarks by raycasting (body-local coordinates). */
export function measureHead(cast, bounds) {
  const top = bounds.max[1];
  const S = (bounds.max[1] - bounds.min[1]) / 1.78;
  const step = 0.0015 * S;
  const prof = [];
  for (let y = top - 0.05 * S; y > top - 0.36 * S; y -= step) {
    const h = cast([0, y, 1.5], [0, 0, -1]);
    prof.push({ y, z: h ? h.p[2] : -1 });
  }
  // nose tip: most forward point in the face band
  let nose = null;
  for (const s of prof) if (s.y < top - 0.12 * S && s.y > top - 0.26 * S && (!nose || s.z > nose.z)) nose = s;
  if (!nose || nose.z < -0.5) nose = prof[Math.floor(prof.length * 0.45)] || { y: top - 0.18 * S, z: 0.1 * S };
  // chin: the biggest forward→back jump below the mouth (ray slips under the jaw onto the neck)
  let chin = null, jump = 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    if (a.y > nose.y - 0.04 * S || a.y < nose.y - 0.15 * S) continue;
    const dz = a.z - b.z;
    if (dz > jump) { jump = dz; chin = a; }
  }
  if (!chin) chin = { y: nose.y - 0.081 * S, z: nose.z - 0.02 * S };
  const eyeY = nose.y + 0.42 * (nose.y - chin.y);
  // lips: most forward point between the nose and the chin
  let mouth = null;
  for (const s of prof) if (s.y < nose.y - 0.02 * S && s.y > chin.y + 0.02 * S && (!mouth || s.z > mouth.z)) mouth = s;
  const u = (eyeY - chin.y) / 0.115; // the mannequin's head unit (≈ hsz * height scale)
  const at = (y) => { let best = prof[0]; for (const s of prof) if (Math.abs(s.y - y) < Math.abs(best.y - y)) best = s; return best.z; };
  // cranium centre for the hair
  const cy = eyeY + 0.04 * u;
  const fr = cast([0, cy, 1.5], [0, 0, -1]), bk = cast([0, cy, -1.5], [0, 0, 1]);
  const cz = fr && bk ? (fr.p[2] + bk.p[2]) / 2 : at(eyeY) - 0.1 * u;
  const sd = cast([1.5, cy, cz], [-1, 0, 0]);
  return {
    top, S, u, eyeY, chinY: chin.y, noseY: nose.y, noseZ: nose.z, mouthY: mouth ? mouth.y : lerp(nose.y, chin.y, 0.45), frontZ: Math.max(...prof.map((s) => s.z)),
    center: [0, cy, cz], halfWidth: sd ? sd.p[0] : 0.075 * u, eyeZ: at(eyeY),
  };
}

/** Max |x| (per height) where the head surface still faces forward (scanned from the outside in). */
function frontWidths(cast, head, y0, y1, rows = 28) {
  const out = [];
  const stepX = 0.002 * head.u;
  const zMin = head.center[2] + 0.015 * head.u;   // in front of the ears
  for (let r = 0; r <= rows; r++) {
    const y = lerp(y0, y1, r / rows);
    let w = 0.03 * head.u;
    for (let x = 0.14 * head.u; x > 0.03 * head.u; x -= stepX) {
      let ok = true;
      for (const sx of [1, -1]) {
        const h = cast([sx * x, y, 1.5], [0, 0, -1]);
        if (!h || h.n[2] < 0.12 || h.p[2] < zMin) { ok = false; break; }
      }
      if (ok) { w = x; break; }
    }
    out.push({ y, w });
  }
  return (y) => {
    if (y <= out[0].y) return out[0].w;
    for (let i = 0; i < out.length - 1; i++) if (y <= out[i + 1].y) return lerp(out[i].w, out[i + 1].w, (y - out[i].y) / (out[i + 1].y - out[i].y));
    return out[out.length - 1].w;
  };
}

/* ------------------------------------------------------------------ fitFaceToHead */

/**
 * Place the face object on the mannequin's head and shrink-wrap the mask onto
 * the head surface. Re-callable after the body is rebuilt.
 */
export function fitFaceToHead(object, { bodyMesh, regions, bounds, THREE } = {}) {
  THREE = THREE || object.userData.THREE;
  const ud = object.userData;
  const { face, mask } = ud;
  if (!bodyMesh || !face) return;
  const cast = makeCaster(bodyMesh, THREE);
  const B = boundsArrays(bounds, bodyMesh);
  const head = measureHead(cast, B);
  const u = head.u;
  const geo = mask.geometry;
  const base = geo.userData.base, feather = geo.userData.feather, adj = geo.userData.adj;
  const n = base.length / 3;

  // ---- scale: eye→chin distance and the mannequin's inter-pupil distance
  const yc = base[152 * 3 + 1];
  const D = head.eyeY - head.chinY;
  const sChin = D / -yc;
  const sIpd = 0.064 * u;
  const s = Math.pow(sChin, 0.65) * Math.pow(sIpd, 0.35);
  // vertical mapping through knots: eyes → nose tip → mouth → chin land on the mannequin's
  // (pulled most of the way, so its nose / lips sit under the person's and don't show twice)
  const yn = base[1 * 3 + 1], ym = (base[13 * 3 + 1] + base[14 * 3 + 1]) / 2;
  // natural positions (uniform scale, chin on the chin), then pulled toward the mannequin's
  // features — but no segment may stretch more than ~12% (proportions carry the likeness)
  const natN = head.eyeY + yn * s, natM = head.eyeY + ym * lerp(s, sChin, 0.6);
  let Yn = lerp(natN, head.noseY, 0.7);
  Yn = clamp(Yn, head.eyeY - (head.eyeY - natN) * 1.12, head.eyeY - (head.eyeY - natN) * 0.88);
  let Ym = lerp(natM, head.mouthY, 0.5);
  const segM = natN - natM;
  Ym = clamp(Ym, Yn - segM * 1.12, Yn - segM * 0.88);
  Ym = Math.max(Ym, head.chinY + 0.25 * (Yn - head.chinY));
  const knots = [[yc, head.chinY], [ym, Ym], [yn, Yn], [0, head.eyeY]];
  const mapY = monotone(knots, s);

  // ---- 2D placement with width compression where the face is wider than the head front
  let ytop = -Infinity;
  for (const v of face.oval) ytop = Math.max(ytop, base[v * 3 + 1]);
  const halfW = frontWidths(cast, head, head.chinY - 0.01 * u, head.eyeY + ytop * s + 0.01 * u);
  const X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const Yi = mapY(y);
    let Xi = x * s;
    const W = Math.max(0.02 * u, halfW(Yi) * 0.96);
    const t = Math.abs(Xi) / W;
    if (t > 0.66) Xi = Math.sign(Xi) * W * (0.66 + 0.34 * Math.tanh((t - 0.66) / 0.34));
    X[i] = Xi; Y[i] = Yi;
  }

  // ---- project onto the head along -Z
  const zStart = head.frontZ + 0.1;
  const hitP = new Float32Array(n * 3), hitN = new Float32Array(n * 3), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const h = cast([X[i], Y[i], zStart], [0, 0, -1]);
    if (h) { hitP.set(h.p, i * 3); hitN.set(h.n, i * 3); ok[i] = 1; }
  }
  // fill misses from neighbours
  for (let it = 0; it < 6; it++) for (let i = 0; i < n; i++) if (!ok[i]) {
    let c = 0; const p = [0, 0, 0], q = [0, 0, 0];
    for (const j of adj[i]) if (ok[j]) { for (let k = 0; k < 3; k++) { p[k] += hitP[j * 3 + k]; q[k] += hitN[j * 3 + k]; } c++; }
    if (c) { hitP.set([X[i], Y[i], p[2] / c], i * 3); const l = Math.hypot(...q) || 1; hitN.set(q.map((v) => v / l), i * 3); ok[i] = 2; }
  }

  // ---- smooth base surface (the mannequin's own nose/lips/brows removed)
  const isOval = geo.userData.boundary;
  let zb = new Float32Array(n);
  for (let i = 0; i < n; i++) zb[i] = hitP[i * 3 + 2];
  for (let it = 0; it < 22; it++) {
    const nz = new Float32Array(zb);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const j of adj[i]) sum += zb[j];
      nz[i] = lerp(zb[i], sum / adj[i].length, 0.6);
    }
    zb = nz;
  }

  // ---- the person's own relief: landmark depth minus its smooth (quadratic) trend
  const relief = (() => {
    // weighted least squares z ≈ c0 + c1 x + c2 y + c3 x² + c4 y² + c5 xy
    const M = Array.from({ length: 6 }, () => new Float64Array(6)), r = new Float64Array(6);
    for (let i = 0; i < n; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const f = [1, x, y, x * x, y * y, x * y];
      const w = 0.2 + feather[i];
      for (let a = 0; a < 6; a++) { r[a] += w * f[a] * z; for (let b = 0; b < 6; b++) M[a][b] += w * f[a] * f[b]; }
    }
    const c = solve(M, r);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      out[i] = base[i * 3 + 2] - (c[0] + c[1] * x + c[2] * y + c[3] * x * x + c[4] * y * y + c[5] * x * y);
    }
    // lift so the cheeks sit at ~0 (median of the interior)
    const inner = []; for (let i = 0; i < n; i++) if (feather[i] > 0.6) inner.push(out[i]);
    inner.sort((a, b) => a - b);
    const m = inner.length ? inner[Math.floor(inner.length * 0.4)] : 0;
    for (let i = 0; i < n; i++) out[i] -= m;
    return out;
  })();

  // ---- final positions (body-local)
  const off = 0.0015 * u;   // ~1.5 mm off the skin
  const maxLift = 0.026 * u;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const wr = sstep(0.45, 1.0, feather[i]);   // semi-transparent margins hug the skin
    const target = zb[i] + relief[i] * s * 0.8;
    // lift only where the head faces forward (a lift on a steep side would stick out of the silhouette)
    const dz = clamp((target - hitP[i * 3 + 2]) * wr * sstep(0.15, 0.6, hitN[i * 3 + 2]), 0, maxLift);
    for (let k = 0; k < 3; k++) P[i * 3 + k] = hitP[i * 3 + k] + hitN[i * 3 + k] * off;
    P[i * 3 + 2] += dz;
  }
  // gentle Laplacian smoothing of the lifted interior (keeps edges glued)
  for (let it = 0; it < 2; it++) {
    const Q = Float32Array.from(P);
    for (let i = 0; i < n; i++) {
      if (isOval[i]) continue;
      const w = 0.35 * sstep(0, 0.4, feather[i]);
      const a = [0, 0, 0];
      for (const j of adj[i]) for (let k = 0; k < 3; k++) a[k] += P[j * 3 + k];
      for (let k = 0; k < 3; k++) Q[i * 3 + k] = lerp(P[i * 3 + k], a[k] / adj[i].length, w);
    }
    // never sink below the skin
    for (let i = 0; i < n; i++) {
      const dz = Q[i * 3 + 2] - (hitP[i * 3 + 2] + hitN[i * 3 + 2] * off);
      if (dz < 0) Q[i * 3 + 2] -= dz;
    }
    P.set(Q);
  }

  // ---- coverage: the head must not poke through anywhere inside a triangle (its nose, cheekbones…)
  //      test sample points against the closest skin point, push out along the skin normal
  {
    const idx = geo.index.array;
    const S = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
    const want = off * 0.8;
    for (let it = 0; it < 3; it++) {
      const raise = new Float32Array(n);
      let any = false;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (feather[a] < 0.04 && feather[b] < 0.04 && feather[c] < 0.04) continue;   // invisible margin
        for (const [wa, wb, wc] of S) {
          const q = [0, 1, 2].map((k) => P[a * 3 + k] * wa + P[b * 3 + k] * wb + P[c * 3 + k] * wc);
          const h = cast.closest(q);
          if (!h) continue;
          const depth = (q[0] - h.p[0]) * h.n[0] + (q[1] - h.p[1]) * h.n[1] + (q[2] - h.p[2]) * h.n[2];
          const need = want - depth;
          if (need > 0) {
            const r = Math.min(need, 0.02 * u);
            if (r > raise[a]) raise[a] = r; if (r > raise[b]) raise[b] = r; if (r > raise[c]) raise[c] = r;
            any = true;
          }
        }
      }
      if (!any) break;
      // spread each lift smoothly over its neighbourhood (a tent would crease and catch the light)
      let r = raise;
      for (let k = 0; k < 6; k++) {
        const r2 = Float32Array.from(r);
        for (let i = 0; i < n; i++) {
          let sum = 0; for (const j of adj[i]) sum += r[j];
          const m = (sum / adj[i].length) * 0.92;
          if (m > r2[i]) r2[i] = isOval[i] ? Math.max(r[i], m * 0.5) : m;
        }
        r = r2;
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[i * 3 + k] += hitN[i * 3 + k] * r[i];
    }
  }

  // ---- object transform: face space → body-local (eye centre, uniform scale, facing +Z)
  const anchor = [0, head.eyeY, head.eyeZ];
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) pos.setXYZ(i, (P[i * 3] - anchor[0]) / s, (P[i * 3 + 1] - anchor[1]) / s, (P[i * 3 + 2] - anchor[2]) / s);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // blend toward the head's normals at the edge so shading matches the body skin exactly
  const nor = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const w = 0.15 + 0.6 * sstep(0, 1, feather[i]);
    const nx = lerp(hitN[i * 3], nor.getX(i), w), ny = lerp(hitN[i * 3 + 1], nor.getY(i), w), nz = lerp(hitN[i * 3 + 2], nor.getZ(i), w);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(i, nx / l, ny / l, nz / l);
  }
  // smooth the normals a little (soft shading like skin, no creases)
  for (let it = 0; it < 3; it++) {
    const N2 = Float32Array.from(nor.array);
    for (let i = 0; i < n; i++) {
      let x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
      for (const j of adj[i]) { x += nor.getX(j); y += nor.getY(j); z += nor.getZ(j); }
      const l = Math.hypot(x, y, z) || 1;
      N2[i * 3] = x / l; N2[i * 3 + 1] = y / l; N2[i * 3 + 2] = z / l;
    }
    nor.array.set(N2);
  }
  nor.needsUpdate = true;
  geo.computeBoundingBox(); geo.computeBoundingSphere();

  // place the group (in the body's frame)
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...anchor), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
  if (object.parent !== bodyMesh) {
    bodyMesh.updateMatrixWorld();
    m.premultiply(bodyMesh.matrixWorld);
    if (object.parent) { object.parent.updateMatrixWorld(); m.premultiply(new THREE.Matrix4().copy(object.parent.matrixWorld).invert()); }
  }
  m.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);

  // keep the mask material in step with the body skin (roughness, sheen, oil)
  const skin = bodyMesh.material;
  mask.onBeforeRender = () => syncSkin(mask.material, skin);
  syncSkin(mask.material, skin);

  ud.fit = { head, s, sChin, sIpd, anchor };
  ud.fitted = true;
  ud.cast = cast;
  buildHair(object, { cast, head, P, s, anchor, THREE });
  ud.cast = null;
}

function syncSkin(mat, skin) {
  if (!skin || Array.isArray(skin) || !mat || !mat.isMeshPhysicalMaterial || !skin.isMeshStandardMaterial) return;
  if (typeof skin.roughness === "number") mat.roughness = skin.roughness;
  if (typeof skin.sheen === "number") { mat.sheen = skin.sheen * 0.85; if (skin.sheenColor && mat.sheenColor) mat.sheenColor.copy(skin.sheenColor); }
  if (typeof skin.clearcoat === "number") { mat.clearcoat = skin.clearcoat; mat.clearcoatRoughness = skin.clearcoatRoughness; }
  if (typeof skin.envMapIntensity === "number") mat.envMapIntensity = skin.envMapIntensity;
}

/** monotone cubic (Fritsch–Carlson) through knots [[x, y]…] (x ascending); linear with slope `out` beyond the ends */
function monotone(knots, out) {
  const n = knots.length, x = knots.map((k) => k[0]), y = knots.map((k) => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (v) => {
    if (v <= x[0]) return y[0] + (v - x[0]) * m[0];
    if (v >= x[n - 1]) return y[n - 1] + (v - x[n - 1]) * out;
    let i = 0; while (v > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (v - x[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function solve(M, r) {
  const n = r.length, A = M.map((row, i) => [...row, r[i]]);
  for (let i = 0; i < n; i++) A[i][i] += 1e-6;
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-9;
    for (let j = c; j <= n; j++) A[c][j] /= d;
    for (let i = 0; i < n; i++) if (i !== c) { const f = A[i][c]; for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j]; }
  }
  return A.map((row) => row[n]);
}

/* ------------------------------------------------------------------ hair shell */

// thickness (m, top / sides) and hairline heights (m relative to the eye line,
// for a 1.0 head unit) at: sideburn (in front of the ear), over the ear, behind the ear, nape
const HAIR = {
  buzz: { top: 0.003, side: 0.003, line: [-0.012, 0.03, -0.02, -0.05], hang: false, alpha: 0.72 },
  short: { top: 0.010, side: 0.005, line: [-0.014, 0.028, -0.022, -0.056], hang: false, alpha: 1 },
  medium: { top: 0.016, side: 0.012, line: [-0.03, -0.055, -0.08, -0.095], hang: false, alpha: 1 },
};

/** Rebuild the hair shell for a style/colour (style "none" removes it). */
export function setFaceHair(object, style, color) {
  const ud = object.userData;
  const same = ud.face.hair === style;
  ud.face = { ...ud.face, hair: style, hairColor: color ?? ud.face.hairColor };
  if (same && ud.hair && ud.hairMat) { if (color) ud.hairMat.color.set(color); return; }
  if (!ud.fitted || !ud.hairArgs) return;
  buildHair(object, ud.hairArgs);
}

function buildHair(object, args) {
  const ud = object.userData;
  ud.hairArgs = args;
  if (ud.hair) { object.remove(ud.hair); ud.hair.geometry.dispose(); ud.hair.material.map?.dispose(); ud.hair.material.dispose(); ud.hair = null; ud.hairMat = null; }
  const style = ud.face.hair;
  const cfg = HAIR[style];
  if (!cfg) return;
  const { cast, head, P, s, anchor, THREE } = args;
  if (!cast) return;
  const u = head.u;
  const C = head.center;
  const az = (p) => Math.atan2(p[0] - C[0], p[2] - C[2]);
  const D2R = Math.PI / 180;

  // front hairline: the mask's upper outline, shifted to the hairline seen in the photo
  const oval = ud.face.oval;
  const front = [];
  for (const v of oval) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    if (p[1] < head.eyeY + 0.01 * u) continue;
    front.push([az(p), p[1]]);
  }
  front.sort((a, b) => a[0] - b[0]);
  let topY = -Infinity; for (const f of front) topY = Math.max(topY, f[1]);
  const hl = ud.face.hairline;
  // shift: detected hairline (face units above the eyes) vs the oval's top; hair always overlaps the mask's soft top edge a little
  let shift = -0.006 * u;
  if (typeof hl === "number") shift = clamp(head.eyeY + hl * s - topY, -0.03 * u, 0.03 * u) - 0.004 * u;
  const browY = head.eyeY + 0.02 * u;
  const thMax = Math.min(70 * D2R, Math.max(...front.map((f) => Math.abs(f[0]))));
  const frontY = (th) => {
    let y = front[0][1];
    if (th >= front[front.length - 1][0]) y = front[front.length - 1][1];
    else for (let i = 0; i < front.length - 1; i++) if (th >= front[i][0] && th <= front[i + 1][0]) { y = lerp(front[i][1], front[i + 1][1], (th - front[i][0]) / ((front[i + 1][0] - front[i][0]) || 1)); break; }
    return Math.max(browY, y + shift);
  };
  const ctrl = [[78, cfg.line[0]], [95, cfg.line[1]], [112, cfg.line[1]], [128, cfg.line[2]], [180, cfg.line[3]]];
  const hairlineY = (th) => {
    const a = Math.abs(th) / D2R;
    if (a <= thMax / D2R) return frontY(th);
    const pts = [[thMax / D2R, frontY(Math.sign(th) * thMax)], ...ctrl.map(([d, h]) => [d, head.eyeY + h * u])];
    for (let i = 0; i < pts.length - 1; i++) if (a <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], sstep(pts[i][0], pts[i + 1][0], a));
    return pts[pts.length - 1][1];
  };

  const NT = 160, NP = 72;
  const R0 = 0.4 * u, maxR = 0.16 * u;
  const lowY = head.eyeY - 0.13 * u;
  const phMin = -0.95;
  const band = 0.007 * u;
  // jagged edge: smooth per-column noise
  const jag = new Float32Array(NT + 1);
  { let seed = 99; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const raw = Array.from({ length: NT + 1 }, r);
    for (let i = 0; i <= NT; i++) jag[i] = (raw[i] * 0.5 + raw[(i + 1) % (NT + 1)] * 0.25 + raw[(i + NT) % (NT + 1)] * 0.25) - 0.5; }
  // grid of head points (top → bottom), invalid rays copy the row above
  const base = [], alpha = [], thickA = [];
  for (let i = 0; i <= NT; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / NT;
    const yh = hairlineY(th);
    const colP = [], colA = [], colT = [];
    let prev = null;
    for (let j = NP; j >= 0; j--) {
      const ph = lerp(phMin, Math.PI / 2 - 0.01, j / NP);
      const d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
      const h = cast([C[0] + d[0] * R0, C[1] + d[1] * R0, C[2] + d[2] * R0], [-d[0], -d[1], -d[2]]);
      const valid = h && h.p[1] > lowY && Math.hypot(h.p[0] - C[0], h.p[1] - C[1], h.p[2] - C[2]) < maxR;
      let p, inside;
      if (valid) {
        const nx = h.n[0] * 0.5 + d[0] * 0.5, ny = h.n[1] * 0.5 + d[1] * 0.5, nz = h.n[2] * 0.5 + d[2] * 0.5;
        const nl = Math.hypot(nx, ny, nz) || 1;
        p = { x: h.p[0], y: h.p[1], z: h.p[2], n: [nx / nl, ny / nl, nz / nl] };
        // soft, wider fade at the sides / nape; a slightly irregular front hairline
        const sideK = sstep(thMax, thMax + 0.5, Math.abs(th));
        inside = (h.p[1] - yh) / (band * (1 + 1.6 * sideK)) + jag[i] * 0.6 * (1 - sideK);
      } else { p = prev; inside = -9; }
      if (!p) { colP.push(null); colA.push(0); colT.push(0); continue; }
      prev = p;
      const topness = sstep(0.0, 1.2, ph);
      colP.push(p);
      colA.push(sstep(-1, 1.2, inside) * cfg.alpha);
      // never thinner than the face mask's offset (no fighting where they overlap)
      colT.push(Math.max(0.0028 * u, lerp(cfg.side, cfg.top, topness) * u * sstep(-1.5, 4, inside)));
    }
    base.push(colP.reverse()); alpha.push(colA.reverse()); thickA.push(colT.reverse());
  }
  // offset outward, then smooth the shell (no ear bumps) without sinking below the head
  const NV = (NT + 1) * (NP + 1);
  let X = new Float32Array(NV * 3);
  const minP = new Float32Array(NV * 3), nrm = new Float32Array(NV * 3), has = new Uint8Array(NV);
  for (let i = 0; i <= NT; i++) for (let j = 0; j <= NP; j++) {
    const k = i * (NP + 1) + j, p = base[i][j];
    if (!p) continue;
    has[k] = 1;
    const t = thickA[i][j];
    X[k * 3] = p.x + p.n[0] * t; X[k * 3 + 1] = p.y + p.n[1] * t; X[k * 3 + 2] = p.z + p.n[2] * t;
    const m = Math.max(0.0012 * u, t * 0.6);
    minP[k * 3] = p.x + p.n[0] * m; minP[k * 3 + 1] = p.y + p.n[1] * m; minP[k * 3 + 2] = p.z + p.n[2] * m;
    nrm.set(p.n, k * 3);
  }
  const smoothIt = style === "medium" ? 14 : style === "short" ? 6 : 2;
  for (let it = 0; it < smoothIt; it++) {
    const Y = Float32Array.from(X);
    for (let i = 0; i <= NT; i++) for (let j = 1; j < NP; j++) {
      const k = i * (NP + 1) + j;
      if (!has[k]) continue;
      const nb = [((i + NT - 1) % NT) * (NP + 1) + j, ((i + 1) % NT) * (NP + 1) + j, k - 1, k + 1];
      const a = [0, 0, 0]; let c = 0;
      for (const q of nb) if (has[q]) { a[0] += X[q * 3]; a[1] += X[q * 3 + 1]; a[2] += X[q * 3 + 2]; c++; }
      if (!c) continue;
      for (let e = 0; e < 3; e++) Y[k * 3 + e] = lerp(X[k * 3 + e], a[e] / c, 0.5);
      // never inside the minimum offset surface (push out along the normal)
      const dx = Y[k * 3] - minP[k * 3], dy = Y[k * 3 + 1] - minP[k * 3 + 1], dz = Y[k * 3 + 2] - minP[k * 3 + 2];
      const dn = dx * nrm[k * 3] + dy * nrm[k * 3 + 1] + dz * nrm[k * 3 + 2];
      if (dn < 0) for (let e = 0; e < 3; e++) Y[k * 3 + e] -= nrm[k * 3 + e] * dn;
    }
    X = Y;
  }
  const verts = [], cols = [], uvs = [], grid = [];
  for (let i = 0; i <= NT; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / NT;
    const col = [];
    for (let j = 0; j <= NP; j++) {
      const k = i * (NP + 1) + j;
      if (!has[k]) { col.push(-1); continue; }
      const ph = lerp(phMin, Math.PI / 2 - 0.01, j / NP);
      col.push(verts.length / 3);
      verts.push(X[k * 3], X[k * 3 + 1], X[k * 3 + 2]);
      cols.push(1, 1, 1, alpha[i][j]);
      uvs.push(th / (2 * Math.PI) * 12, ph / Math.PI * 5);
    }
    grid.push(col);
  }
  const idx = [];
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (cols[a * 4 + 3] + cols[b * 4 + 3] + cols[c * 4 + 3] + cols[d * 4 + 3] <= 0.001) continue;
    idx.push(a, b, c, a, c, d);
  }
  if (!idx.length) return;
  // to face space (the group's local frame)
  for (let i = 0; i < verts.length; i += 3) { verts[i] = (verts[i] - anchor[0]) / s; verts[i + 1] = (verts[i + 1] - anchor[1]) / s; verts[i + 2] = (verts[i + 2] - anchor[2]) / s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 4));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make the normals point away from the head centre
  {
    const p = g.attributes.position, nn = g.attributes.normal;
    let dot = 0;
    const c0 = [(C[0] - anchor[0]) / s, (C[1] - anchor[1]) / s, (C[2] - anchor[2]) / s];
    for (let i = 0; i < p.count; i += 7) dot += (p.getX(i) - c0[0]) * nn.getX(i) + (p.getY(i) - c0[1]) * nn.getY(i) + (p.getZ(i) - c0[2]) * nn.getZ(i);
    if (dot < 0) {
      const ix = g.index.array;
      for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
      g.index.needsUpdate = true;
      g.computeVertexNormals();
    }
  }
  const strands = strandTexture(THREE, style);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ud.face.hairColor || "#2a1d16"), map: strands, bumpMap: strands, bumpScale: style === "buzz" ? 0.6 : 1.5,
    roughness: style === "buzz" ? 0.85 : 0.68, metalness: 0,
    vertexColors: true, transparent: true, depthWrite: true, envMapIntensity: 0.6,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  const hair = new THREE.Mesh(g, mat);
  hair.name = "faceHair";
  hair.renderOrder = 3;
  hair.castShadow = style !== "buzz";
  object.add(hair);
  ud.hair = hair;
  ud.hairMat = mat;
}
