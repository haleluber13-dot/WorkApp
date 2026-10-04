// Sparse narrow-band surface nets on a rectilinear (locally refinable) grid.
//
// 1. Axis coordinates are generated with a spacing function so chosen boxes
//    (hands) get finer cells. A rectilinear grid has no T-junctions, so the
//    mesh stays crack-free.
// 2. The grid is split into 8^3-cell blocks. Each block centre is tested
//    against the SDF (Lipschitz bound); surviving blocks get a culled
//    primitive list, then 2^3-cell groups inside are tested again. Only cells
//    of surviving groups are sampled (lazily, cached per block).
// 3. Surface nets: one vertex per sign-changing cell, one quad per
//    sign-changing grid edge. Vertices are then projected onto the zero level
//    with Newton steps along the SDF gradient, normals come from the gradient.
// 4. Tiny disconnected fragments are discarded.

const SH = 2, B = 1 << SH, BM = B - 1; // storage block size (cells)
const SB = 16; // coarse culling super-block size (cells)

function fac(r, ax) { return Array.isArray(r.factor) ? r.factor[ax] : r.factor; }
function smooth01(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

export function axisCoords(lo, hi, h, intervals) {
  const T = 5 * h;
  const out = [lo];
  let x = lo;
  while (x < hi) {
    let f = 1;
    for (const [a, b, fac] of intervals) {
      const dist = x < a ? a - x : x > b ? x - b : 0;
      const w = 1 - smooth01(dist / T);
      f = Math.min(f, 1 - (1 - fac) * w);
    }
    x += h * f;
    out.push(x);
  }
  return Float64Array.from(out);
}

export function polygonize(sdf, { min, max, h, refine = [] }) {
  const t0 = now();
  const X = axisCoords(min[0], max[0], h, refine.map((r) => [r.min[0], r.max[0], fac(r, 0)]));
  const Y = axisCoords(min[1], max[1], h, refine.map((r) => [r.min[1], r.max[1], fac(r, 1)]));
  const Z = axisCoords(min[2], max[2], h, refine.map((r) => [r.min[2], r.max[2], fac(r, 2)]));
  const nx = X.length, ny = Y.length, nz = Z.length;
  const nbx = ((nx - 1) >> SH) + 1, nby = ((ny - 1) >> SH) + 1, nbz = ((nz - 1) >> SH) + 1;
  const slot = new Int32Array(nbx * nby * nbz).fill(-1);
  const bNodes = [], bVert = [], bList = [];
  const margin = 2.5 * h;
  let evals = 0;

  let cand = null; // candidate primitive subset (current super-block) used when creating blocks
  function makeBlock(bi, bj, bk) {
    const s = bNodes.length;
    const i0 = bi * B, j0 = bj * B, k0 = bk * B;
    const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
    bList.push(sdf.listFor(X[i0], Y[j0], Z[k0], X[i1], Y[j1], Z[k1], margin, cand));
    bNodes.push(new Float32Array(B * B * B).fill(NaN));
    bVert.push(new Int32Array(B * B * B).fill(-1));
    slot[(bk * nby + bj) * nbx + bi] = s;
    return s;
  }
  function blockOf(i, j, k) {
    const bi = i >> SH, bj = j >> SH, bk = k >> SH;
    const s = slot[(bk * nby + bj) * nbx + bi];
    return s >= 0 ? s : makeBlock(bi, bj, bk);
  }
  function node(i, j, k) {
    const s = blockOf(i, j, k);
    const li = ((k & BM) * B + (j & BM)) * B + (i & BM);
    const arr = bNodes[s];
    let v = arr[li];
    if (v !== v) {
      const L = bList[s];
      v = sdf.eval(L, L.length, X[i], Y[j], Z[k]);
      evals++;
      if (v === 0) v = 1e-9;
      arr[li] = v;
    }
    return v;
  }

  // vertex storage
  let vcap = 1 << 16;
  let vpos = new Float64Array(vcap * 3);
  let vcell = new Int32Array(vcap * 3);
  let nv = 0;
  const cv = new Float64Array(8);
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];

  function cellVertex(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return -1;
    const s = blockOf(i, j, k);
    const li = ((k & BM) * B + (j & BM)) * B + (i & BM);
    const vt = bVert[s];
    const ex = vt[li];
    if (ex >= 0) return ex;
    if (ex === -2) return -1; // known empty
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = node(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) { vt[li] = -2; return -1; }
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = EDGES[e], b = EDGES[e + 1];
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const ax = X[i + (a & 1)], ay = Y[j + ((a >> 1) & 1)], az = Z[k + ((a >> 2) & 1)];
      const bx = X[i + (b & 1)], by = Y[j + ((b >> 1) & 1)], bz = Z[k + ((b >> 2) & 1)];
      sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t;
      cnt++;
    }
    if (nv >= vcap) {
      vcap *= 2;
      const np = new Float64Array(vcap * 3); np.set(vpos); vpos = np;
      const nc = new Int32Array(vcap * 3); nc.set(vcell); vcell = nc;
    }
    vpos[nv * 3] = sx / cnt; vpos[nv * 3 + 1] = sy / cnt; vpos[nv * 3 + 2] = sz / cnt;
    vcell[nv * 3] = i; vcell[nv * 3 + 1] = j; vcell[nv * 3 + 2] = k;
    vt[li] = nv;
    return nv++;
  }

  // --- 1. super-block, block and group culling
  const all = sdf.all;
  const nsx = Math.ceil((nx - 1) / SB), nsy = Math.ceil((ny - 1) / SB), nsz = Math.ceil((nz - 1) / SB);
  for (let sk = 0; sk < nsz; sk++) for (let sj = 0; sj < nsy; sj++) for (let si = 0; si < nsx; si++) {
    const I0 = si * SB, J0 = sj * SB, K0 = sk * SB;
    const I1 = Math.min(I0 + SB, nx - 1), J1 = Math.min(J0 + SB, ny - 1), K1 = Math.min(K0 + SB, nz - 1);
    {
      const hx = (X[I1] - X[I0]) * 0.5, hy = (Y[J1] - Y[J0]) * 0.5, hz = (Z[K1] - Z[K0]) * 0.5;
      const R = Math.sqrt(hx * hx + hy * hy + hz * hz);
      const d = sdf.eval(all, all.length, X[I0] + hx, Y[J0] + hy, Z[K0] + hz);
      evals++;
      if (Math.abs(d) > R * 1.25 + 2 * h) continue;
    }
    cand = sdf.listFor(X[I0], Y[J0], Z[K0], X[I1], Y[J1], Z[K1], margin);
    if (cand.length === 0) { cand = null; continue; }
    for (let k0 = K0; k0 < K1; k0 += B) for (let j0 = J0; j0 < J1; j0 += B) for (let i0 = I0; i0 < I1; i0 += B) {
      const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
      const hx = (X[i1] - X[i0]) * 0.5, hy = (Y[j1] - Y[j0]) * 0.5, hz = (Z[k1] - Z[k0]) * 0.5;
      const R = Math.sqrt(hx * hx + hy * hy + hz * hz);
      const d = sdf.eval(cand, cand.length, X[i0] + hx, Y[j0] + hy, Z[k0] + hz);
      evals++;
      if (Math.abs(d) > R * 1.3 + 0.2 * h) continue;
      const s = blockOf(i0, j0, k0);
      const L = bList[s];
      if (L.length === 0) continue;
      for (let gk = k0; gk < k1; gk += 2) for (let gj = j0; gj < j1; gj += 2) for (let gi = i0; gi < i1; gi += 2) {
        const gi1 = Math.min(gi + 2, nx - 1), gj1 = Math.min(gj + 2, ny - 1), gk1 = Math.min(gk + 2, nz - 1);
        const gx = (X[gi] + X[gi1]) * 0.5, gy = (Y[gj] + Y[gj1]) * 0.5, gz = (Z[gk] + Z[gk1]) * 0.5;
        const ex = (X[gi1] - X[gi]) * 0.5, ey = (Y[gj1] - Y[gj]) * 0.5, ez = (Z[gk1] - Z[gk]) * 0.5;
        const r = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const dg = sdf.eval(L, L.length, gx, gy, gz);
        evals++;
        if (Math.abs(dg) > r * 1.35 + 0.1 * h) continue;
        for (let c = 0; c < 8; c++) {
          const ci = gi + (c & 1), cj = gj + ((c >> 1) & 1), ck = gk + ((c >> 2) & 1);
          if (ci < gi1 && cj < gj1 && ck < gk1) cellVertex(ci, cj, ck);
        }
      }
    }
    cand = null;
  }
  const t1 = now();

  // --- 2. quads from sign-changing edges (processing may create new vertices lazily)
  let quads = [];
  for (let v = 0; v < nv; v++) {
    const i = vcell[v * 3], j = vcell[v * 3 + 1], k = vcell[v * 3 + 2];
    const n0 = node(i, j, k);
    const in0 = n0 < 0;
    // x edge: cells (i, j-1..j, k-1..k), plane (y,z)
    if ((node(i + 1, j, k) < 0) !== in0) quad(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), in0);
    // y edge: cells (i-1..i, j, k-1..k), plane (z,x): order (z-1,x-1),(z,x-1),(z,x),(z-1,x)
    if ((node(i, j + 1, k) < 0) !== in0) quad(cellVertex(i - 1, j, k - 1), cellVertex(i - 1, j, k), cellVertex(i, j, k), cellVertex(i, j, k - 1), in0);
    // z edge: cells (i-1..i, j-1..j, k), plane (x,y)
    if ((node(i, j, k + 1) < 0) !== in0) quad(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), in0);
  }
  function quad(a, b, c, d, forward) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (forward) quads.push(a, b, c, d); else quads.push(a, d, c, b);
  }
  const t2 = now();

  // --- 3. project vertices onto the surface, compute normals
  const g = new Float64Array(4);
  const normals = new Float32Array(nv * 3);
  const hmin = h * Math.min(...refine.map((r) => Math.min(fac(r, 0), fac(r, 1), fac(r, 2))), 1);
  for (let v = 0; v < nv; v++) {
    const i = vcell[v * 3], j = vcell[v * 3 + 1], k = vcell[v * 3 + 2];
    const L = bList[blockOf(i, j, k)];
    const cellH = Math.min(X[i + 1] - X[i], Y[j + 1] - Y[j], Z[k + 1] - Z[k]);
    const e = Math.max(cellH * 0.25, hmin * 0.15);
    let x = vpos[v * 3], y = vpos[v * 3 + 1], z = vpos[v * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    sdf.grad(L, L.length, x, y, z, e, g);
    evals += 4;
    const d = g[3];
    const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (gl2 > 1e-12) {
      let sx = d * g[0] / gl2, sy = d * g[1] / gl2, sz = d * g[2] / gl2;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sl > cellH) { sx *= cellH / sl; sy *= cellH / sl; sz *= cellH / sl; }
      x -= sx; y -= sy; z -= sz;
    }
    void x0; void y0; void z0;
    vpos[v * 3] = x; vpos[v * 3 + 1] = y; vpos[v * 3 + 2] = z;
    const gl = Math.sqrt(gl2) || 1;
    normals[v * 3] = g[0] / gl; normals[v * 3 + 1] = g[1] / gl; normals[v * 3 + 2] = g[2] / gl;
  }
  const t3 = now();

  // --- 4. triangulate (shorter diagonal), drop tiny components
  const nq = quads.length / 4;
  let tris = new Uint32Array(nq * 6);
  let nt = 0;
  const P = vpos;
  for (let q = 0; q < nq; q++) {
    const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3];
    const ac = d2(P, a, c), bd = d2(P, b, d);
    if (ac <= bd) { tris[nt++] = a; tris[nt++] = b; tris[nt++] = c; tris[nt++] = a; tris[nt++] = c; tris[nt++] = d; }
    else { tris[nt++] = a; tris[nt++] = b; tris[nt++] = d; tris[nt++] = b; tris[nt++] = c; tris[nt++] = d; }
  }
  quads = null;
  // union-find
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < nt; t += 3) {
    const a = find(tris[t]), b = find(tris[t + 1]), c = find(tris[t + 2]);
    if (a !== b) parent[a] = b;
    const b2 = find(b);
    if (c !== b2) parent[c] = b2;
  }
  const compTris = new Map();
  for (let t = 0; t < nt; t += 3) { const r = find(tris[t]); compTris.set(r, (compTris.get(r) || 0) + 1); }
  let maxC = 0; for (const c of compTris.values()) maxC = Math.max(maxC, c);
  const keep = new Set();
  for (const [r, c] of compTris) if (c >= Math.max(40, maxC * 0.01)) keep.add(r);
  const remap = new Int32Array(nv).fill(-1);
  let nv2 = 0;
  for (let t = 0; t < nt; t += 3) {
    if (!keep.has(find(tris[t]))) continue;
    for (let c = 0; c < 3; c++) { const v = tris[t + c]; if (remap[v] < 0) remap[v] = nv2++; }
  }
  const positions = new Float32Array(nv2 * 3);
  const nrm = new Float32Array(nv2 * 3);
  for (let v = 0; v < nv; v++) {
    const r = remap[v]; if (r < 0) continue;
    positions[r * 3] = P[v * 3]; positions[r * 3 + 1] = P[v * 3 + 1]; positions[r * 3 + 2] = P[v * 3 + 2];
    nrm[r * 3] = normals[v * 3]; nrm[r * 3 + 1] = normals[v * 3 + 1]; nrm[r * 3 + 2] = normals[v * 3 + 2];
  }
  let ni = 0;
  const indices = new Uint32Array(nt);
  for (let t = 0; t < nt; t += 3) {
    if (!keep.has(find(tris[t]))) continue;
    indices[ni++] = remap[tris[t]]; indices[ni++] = remap[tris[t + 1]]; indices[ni++] = remap[tris[t + 2]];
  }
  const t4 = now();
  return {
    positions, normals: nrm, indices: indices.slice(0, ni),
    stats: {
      grid: [nx, ny, nz], blocks: bNodes.length, evals, vertices: nv2, triangles: ni / 3,
      components: compTris.size, dropped: compTris.size - keep.size,
      ms: { sample: t1 - t0, quads: t2 - t1, project: t3 - t2, finish: t4 - t3 },
    },
  };
}

function d2(P, a, b) {
  const x = P[a * 3] - P[b * 3], y = P[a * 3 + 1] - P[b * 3 + 1], z = P[a * 3 + 2] - P[b * 3 + 2];
  return x * x + y * y + z * z;
}

function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
