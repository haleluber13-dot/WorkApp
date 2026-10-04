/* Skin-wrapping decals.

   A tattoo is laid onto the body with a discrete exponential map: starting at
   the tattoo's center we walk outward across the mesh (Dijkstra over mesh
   edges) and give every vertex 2D skin coordinates that preserve geodesic
   distances. Unlike a planar projection this wraps around arms and legs like a
   real tattoo, never stretches on curved skin and never bleeds onto a
   neighbouring limb (the walk follows the surface, not straight lines).

   SkinSurface owns the mesh topology, a BVH for picking, and builds decal
   geometry for a placement in a few milliseconds. */

import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "../vendor/bvh/three-mesh-bvh.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* Tangent frame for a tattoo at a surface normal: `up` is the design's up
   direction on the skin, `right` its right, both perpendicular to normal. */
export function tattooFrame(normal, rotationDeg = 0, out = {}) {
  const n = _tmpN.copy(normal).normalize();
  let ref = WORLD_UP;
  if (Math.abs(n.y) > 0.92) ref = _ref.set(0, 0, n.y > 0 ? -1 : 1); // top of foot / shoulder: up = toward the body's back/front
  const up = (out.up || new THREE.Vector3()).copy(ref).addScaledVector(n, -ref.dot(n)).normalize();
  const right = (out.right || new THREE.Vector3()).crossVectors(up, n).normalize();
  if (rotationDeg) {
    const a = -rotationDeg * Math.PI / 180; // positive = clockwise as seen from outside
    const c = Math.cos(a), s = Math.sin(a);
    const r2 = _r2.copy(right).multiplyScalar(c).addScaledVector(up, s);
    const u2 = _u2.copy(up).multiplyScalar(c).addScaledVector(right, -s);
    right.copy(r2); up.copy(u2);
  }
  out.up = up; out.right = right; out.normal = (out.normal || new THREE.Vector3()).copy(n);
  return out;
}
const _tmpN = new THREE.Vector3(), _ref = new THREE.Vector3(), _r2 = new THREE.Vector3(), _u2 = new THREE.Vector3();

/* Minimal binary heap keyed by float priority. */
class Heap {
  constructor(cap = 1024) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], topK = this.k[0];
    const key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    this.lastKey = topK;
    return top;
  }
}

export class SkinSurface {
  constructor(geometry) {
    this.geometry = geometry;
    // the BVH reorders triangles in the index buffer: build it before reading topology
    geometry.boundsTree = new MeshBVH(geometry);
    this.pos = geometry.attributes.position.array;
    this.nor = geometry.attributes.normal.array;
    this.index = geometry.index.array;
    const nv = this.pos.length / 3, nt = this.index.length / 3;
    this.nv = nv; this.nt = nt;
    this._buildTopology();
    // scratch per-vertex buffers, reset lazily via stamp
    this.dist = new Float64Array(nv);
    this.stamp = new Uint32Array(nv);
    this.done = new Uint32Array(nv);
    this.uv = new Float32Array(nv * 2);
    this.fr = new Float32Array(nv * 6); // per-vertex transported frame: right(3) up(3)
    this.gen = 0;
    this.heap = new Heap(4096);
  }

  _buildTopology() {
    const { index, nv, nt } = this;
    // vertex -> triangles
    const tcount = new Uint32Array(nv + 1);
    for (let i = 0; i < index.length; i++) tcount[index[i] + 1]++;
    for (let i = 0; i < nv; i++) tcount[i + 1] += tcount[i];
    const tri = new Uint32Array(index.length), fill = tcount.slice(0, nv);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const v = index[3 * t + k]; tri[fill[v]++] = t; }
    this.vtStart = tcount; this.vtList = tri;
    // vertex -> neighbours (deduplicated)
    const nStart = new Uint32Array(nv + 1), nList = new Uint32Array(index.length * 2);
    let w = 0;
    const seen = new Int32Array(nv).fill(-1);
    for (let v = 0; v < nv; v++) {
      nStart[v] = w;
      for (let j = tcount[v]; j < tcount[v + 1]; j++) {
        const t = tri[j];
        for (let k = 0; k < 3; k++) {
          const u = index[3 * t + k];
          if (u !== v && seen[u] !== v) { seen[u] = v; nList[w++] = u; }
        }
      }
    }
    nStart[nv] = w;
    this.nStart = nStart; this.nList = nList.slice(0, w);
  }

  /* Raycast helper for meshes using this geometry. */
  static enableFastRaycast(mesh) { mesh.raycast = acceleratedRaycast; }

  /* Closest surface point + normal to an arbitrary point (e.g. after moving a
     tattoo in its tangent plane). */
  closestPoint(point) {
    const hit = this.geometry.boundsTree.closestPointToPoint(point);
    if (!hit) return null;
    return { point: hit.point.clone(), normal: this.faceNormal(hit.faceIndex), faceIndex: hit.faceIndex };
  }

  /* Smooth (interpolated) normal near a face: average of its vertex normals. */
  faceNormal(f, out = new THREE.Vector3()) {
    const { index, nor } = this;
    out.set(0, 0, 0);
    for (let k = 0; k < 3; k++) { const i = index[3 * f + k] * 3; out.x += nor[i]; out.y += nor[i + 1]; out.z += nor[i + 2]; }
    return out.normalize();
  }

  /* Smooth normal at a point inside face f, interpolated barycentrically. */
  normalAt(point, f, out = new THREE.Vector3()) {
    const { index, pos, nor } = this;
    const a = index[3 * f], b = index[3 * f + 1], c = index[3 * f + 2];
    _ta.set(pos[3 * a], pos[3 * a + 1], pos[3 * a + 2]);
    _tb.set(pos[3 * b], pos[3 * b + 1], pos[3 * b + 2]);
    _tc.set(pos[3 * c], pos[3 * c + 1], pos[3 * c + 2]);
    THREE.Triangle.getBarycoord(point, _ta, _tb, _tc, _bary);
    out.set(0, 0, 0);
    const w = [_bary.x, _bary.y, _bary.z], ids = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const i = ids[k] * 3;
      out.x += nor[i] * w[k]; out.y += nor[i + 1] * w[k]; out.z += nor[i + 2] * w[k];
    }
    if (!isFinite(out.x) || out.lengthSq() < 1e-8) return this.faceNormal(f, out);
    return out.normalize();
  }

  /* Build the decal mesh for a tattoo.
     opts: { position:Vector3, normal:Vector3, rotation (deg), width, height (meters), flip, lift (meters) }
     Returns a BufferGeometry with position, normal, uv (uv 0..1 spans the design). */
  buildDecal({ position, normal, rotation = 0, width, height, flip = false, lift = 0.0005 }) {
    const { pos, nor, nStart, nList, vtStart, vtList, index } = this;
    const hit = this.geometry.boundsTree.closestPointToPoint(position);
    if (!hit) return null;
    const p0 = hit.point;
    const frame = tattooFrame(normal, rotation);
    const e1 = frame.right, e2 = frame.up, n0 = frame.normal;
    const hw = width / 2, hh = height / 2;
    const R = Math.sqrt(hw * hw + hh * hh) * 1.12 + 0.004;

    const gen = ++this.gen;
    const { dist, stamp, done, uv, fr, heap } = this;
    heap.clear();
    const reached = [];

    const seed = (v) => {
      const i = 3 * v;
      const dx = pos[i] - p0.x, dy = pos[i + 1] - p0.y, dz = pos[i + 2] - p0.z;
      const d = Math.hypot(dx, dy, dz);
      if (stamp[v] === gen && dist[v] <= d) return;
      stamp[v] = gen; dist[v] = d;
      uv[2 * v] = dx * e1.x + dy * e1.y + dz * e1.z;
      uv[2 * v + 1] = dx * e2.x + dy * e2.y + dz * e2.z;
      this._setFrame(v, e1, e2);
      heap.push(d, v);
    };
    const f = hit.faceIndex;
    seed(index[3 * f]); seed(index[3 * f + 1]); seed(index[3 * f + 2]);
    const seeds = new Set([index[3 * f], index[3 * f + 1], index[3 * f + 2]]);

    const tR = new THREE.Vector3(), tU = new THREE.Vector3(), nv = new THREE.Vector3();
    while (heap.n) {
      const v = heap.pop();
      if (done[v] === gen) continue;
      if (heap.lastKey > dist[v] + 1e-12) continue; // stale entry
      done[v] = gen;
      reached.push(v);
      const iv = 3 * v;
      // upwind average of uv from finalized neighbours (seeds keep their direct projection)
      if (!seeds.has(v)) {
        let su = 0, sv = 0, sw = 0, best = -1, bestD = Infinity;
        for (let j = nStart[v]; j < nStart[v + 1]; j++) {
          const q = nList[j];
          if (done[q] !== gen || q === v) continue;
          const iq = 3 * q;
          const dx = pos[iv] - pos[iq], dy = pos[iv + 1] - pos[iq + 1], dz = pos[iv + 2] - pos[iq + 2];
          const len = Math.hypot(dx, dy, dz) || 1e-9;
          // project the edge into q's tangent frame, keep its length
          const r = fr.subarray(6 * q, 6 * q + 6);
          let a = dx * r[0] + dy * r[1] + dz * r[2];
          let b = dx * r[3] + dy * r[4] + dz * r[5];
          const l2 = Math.hypot(a, b) || 1e-9;
          a *= len / l2; b *= len / l2;
          const w = 1 / len;
          su += (uv[2 * q] + a) * w; sv += (uv[2 * q + 1] + b) * w; sw += w;
          if (dist[q] < bestD) { bestD = dist[q]; best = q; }
        }
        if (sw > 0) { uv[2 * v] = su / sw; uv[2 * v + 1] = sv / sw; }
        // transport the frame from the closest-to-center finalized neighbour
        if (best >= 0) {
          nv.set(nor[iv], nor[iv + 1], nor[iv + 2]);
          tR.fromArray(fr, 6 * best); tU.fromArray(fr, 6 * best + 3);
          tR.addScaledVector(nv, -tR.dot(nv)).normalize();
          tU.crossVectors(nv, tR).normalize();
          this._setFrame(v, tR, tU);
        }
      }
      // relax neighbours
      const dv = dist[v];
      for (let j = nStart[v]; j < nStart[v + 1]; j++) {
        const w = nList[j];
        if (done[w] === gen) continue;
        const iw = 3 * w;
        const nd = dv + Math.hypot(pos[iw] - pos[iv], pos[iw + 1] - pos[iv + 1], pos[iw + 2] - pos[iv + 2]);
        if (nd > R) continue;
        if (stamp[w] !== gen || nd < dist[w]) { stamp[w] = gen; dist[w] = nd; heap.push(nd, w); }
      }
    }

    // collect triangles whose 3 vertices were reached and whose uv box meets the design rect
    const tris = [];
    const tStamp = this._tStamp || (this._tStamp = new Uint32Array(this.nt));
    for (const v of reached) {
      for (let j = vtStart[v]; j < vtStart[v + 1]; j++) {
        const t = vtList[j];
        if (tStamp[t] === gen) continue;
        tStamp[t] = gen;
        const a = index[3 * t], b = index[3 * t + 1], c = index[3 * t + 2];
        if (done[a] !== gen || done[b] !== gen || done[c] !== gen) continue;
        const ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c];
        const va = uv[2 * a + 1], vb = uv[2 * b + 1], vc = uv[2 * c + 1];
        if (Math.max(ua, ub, uc) < -hw || Math.min(ua, ub, uc) > hw) continue;
        if (Math.max(va, vb, vc) < -hh || Math.min(va, vb, vc) > hh) continue;
        tris.push(t);
      }
    }
    if (!tris.length) return null;

    const remap = new Map();
    const P = [], N = [], U = [], I = [];
    const sx = flip ? -1 : 1;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = index[3 * t + k];
        let id = remap.get(v);
        if (id === undefined) {
          id = remap.size; remap.set(v, id);
          const i = 3 * v;
          P.push(pos[i] + nor[i] * lift, pos[i + 1] + nor[i + 1] * lift, pos[i + 2] + nor[i + 2] * lift);
          N.push(nor[i], nor[i + 1], nor[i + 2]);
          U.push(sx * uv[2 * v] / width + 0.5, uv[2 * v + 1] / height + 0.5);
        }
        I.push(id);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(remap.size > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    g.computeBoundingSphere();
    return g;
  }

  _setFrame(v, r, u) {
    const o = 6 * v, fr = this.fr;
    fr[o] = r.x; fr[o + 1] = r.y; fr[o + 2] = r.z; fr[o + 3] = u.x; fr[o + 4] = u.y; fr[o + 5] = u.z;
  }

  /* Move a point along the skin: start at `position` and walk `right`/`up`
     meters in the tattoo's tangent frame, re-projecting onto the surface in
     small steps so the path follows curvature. */
  walk(position, normal, rotation, rightM, upM) {
    const total = Math.hypot(rightM, upM);
    const steps = Math.max(1, Math.ceil(total / 0.01));
    let p = position.clone(), n = normal.clone();
    const fr = {};
    for (let i = 0; i < steps; i++) {
      tattooFrame(n, rotation, fr);
      p.addScaledVector(fr.right, rightM / steps).addScaledVector(fr.up, upM / steps);
      const c = this.closestPoint(p);
      if (!c) break;
      p = c.point; n = this.normalAt(p, c.faceIndex);
    }
    return { position: p, normal: n };
  }
}

const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _bary = new THREE.Vector3();
