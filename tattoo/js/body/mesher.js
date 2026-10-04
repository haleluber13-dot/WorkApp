// Sparse narrow-band surface nets on a rectilinear (locally refinable) grid.
//
// 1. Axis coordinates are generated with a spacing function so chosen boxes
//    (hands) get finer cells. A rectilinear grid has no T-junctions, so the
//    mesh stays crack-free.
// 2. Culling hierarchy: 16^3-cell super-blocks are tested against the full
//    SDF (Lipschitz bound) and get a culled primitive list; 4^3-cell storage
//    blocks are tested with that list and get their own list; 2^3-cell groups
//    are tested again. Only nodes of surviving groups are sampled (cached).
// 3. Surface nets: one vertex per sign-changing cell, one quad per
//    sign-changing grid edge (cells missing from the band are created lazily,
//    so the surface stays closed). Vertices are projected onto the zero level
//    with a Newton step along the SDF gradient; normals come from the gradient.
// 4. Tiny disconnected fragments are discarded.

const SH = 2, B = 1 << SH, BM = B - 1, BV = B * B * B; // storage block (cells)
const SB = 16;               // super-block size (cells)
const GROUP_SAFETY = 1.25;   // slack for approximate (non-exact) distance bounds
const CELL_SLACK = 0.15; // allowed overshoot of the vertex outside its cell (fraction)
const RENORMAL = 0.2; // re-evaluate the gradient after a Newton step longer than this (in cells)

function fac(r, ax) { return Array.isArray(r.factor) ? r.factor[ax] : r.factor; }
function smooth01(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

export function axisCoords(lo, hi, h, intervals) {
  const T = 5 * h;
  const out = [lo];
  let x = lo;
  while (x < hi) {
    let f = 1;
    for (const [a, b, fc] of intervals) {
      const dist = x < a ? a - x : x > b ? x - b : 0;
      const w = 1 - smooth01(dist / T);
      f = Math.min(f, 1 - (1 - fc) * w);
    }
    x += h * f;
    out.push(x);
  }
  return Float64Array.from(out);
}

const EDGES = new Int8Array([0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]);

export function polygonize(sdf, opts) {
  const { min, max, h, refine = [] } = opts;
  const t0 = now();
  const X = axisCoords(min[0], max[0], h, refine.map((r) => [r.min[0], r.max[0], fac(r, 0)]));
  const Y = axisCoords(min[1], max[1], h, refine.map((r) => [r.min[1], r.max[1], fac(r, 1)]));
  const Z = axisCoords(min[2], max[2], h, refine.map((r) => [r.min[2], r.max[2], fac(r, 2)]));
  const nx = X.length, ny = Y.length, nz = Z.length;
  const nbx = ((nx - 1) >> SH) + 1, nby = ((ny - 1) >> SH) + 1, nbz = ((nz - 1) >> SH) + 1;
  const slot = new Int32Array(nbx * nby * nbz).fill(-1);
  const margin = 2.5 * h;
  let evals = 0;

  // pooled per-block storage
  let nBlocks = 0, bcap = 4096;
  let nodeVal = new Float32Array(bcap * BV).fill(NaN);
  let cellVert = new Int32Array(bcap * BV).fill(-1);
  const bList = [];
  // primitive candidates per super-block (cached; blocks always filter their own super-block's list)
  const nsx = Math.ceil((nx - 1) / SB), nsy = Math.ceil((ny - 1) / SB), nsz = Math.ceil((nz - 1) / SB);
  const superLists = new Map();
  function superList(si, sj, sk) {
    const key = (sk * nsy + sj) * nsx + si;
    let L = superLists.get(key);
    if (!L) {
      const I0 = si * SB, J0 = sj * SB, K0 = sk * SB;
      const I1 = Math.min(I0 + SB, nx - 1), J1 = Math.min(J0 + SB, ny - 1), K1 = Math.min(K0 + SB, nz - 1);
      L = sdf.listFor(X[I0], Y[J0], Z[K0], X[I1], Y[J1], Z[K1], margin);
      superLists.set(key, L);
    }
    return L;
  }

  function makeBlock(bi, bj, bk) {
    if (nBlocks >= bcap) {
      const nc = bcap * 2;
      const nv = new Float32Array(nc * BV).fill(NaN); nv.set(nodeVal); nodeVal = nv;
      const ncv = new Int32Array(nc * BV).fill(-1); ncv.set(cellVert); cellVert = ncv;
      bcap = nc;
    }
    const s = nBlocks++;
    const i0 = bi * B, j0 = bj * B, k0 = bk * B;
    const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
    const cand = superList(Math.floor(i0 / SB), Math.floor(j0 / SB), Math.floor(k0 / SB));
    bList.push(sdf.listFor(X[i0], Y[j0], Z[k0], X[i1], Y[j1], Z[k1], margin, cand));
    slot[(bk * nby + bj) * nbx + bi] = s;
    return s;
  }
  function blockOf(i, j, k) {
    const s = slot[((k >> SH) * nby + (j >> SH)) * nbx + (i >> SH)];
    return s >= 0 ? s : makeBlock(i >> SH, j >> SH, k >> SH);
  }
  function node(i, j, k) {
    const s = blockOf(i, j, k);
    const li = s * BV + (((k & BM) * B + (j & BM)) * B + (i & BM));
    let v = nodeVal[li];
    if (v !== v) {
      const L = bList[s];
      v = sdf.eval(L, L.length, X[i], Y[j], Z[k]);
      evals++;
      if (v === 0) v = 1e-9;
      nodeVal[li] = v;
    }
    return v;
  }

  // vertex storage
  let vcap = 1 << 16;
  let vpos = new Float64Array(vcap * 3);
  let vcell = new Int32Array(vcap * 3);
  let nv = 0;
  const cv = new Float64Array(8);

  // create the vertex of cell (i,j,k) from its 8 corner values (in cv)
  function emitVertex(i, j, k, li) {
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
    cellVert[li] = nv;
    return nv++;
  }

  // vertex of cell (i,j,k), creating it lazily; -1 if the cell has no crossing
  function cellVertex(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return -1;
    const s = blockOf(i, j, k);
    const li = s * BV + (((k & BM) * B + (j & BM)) * B + (i & BM));
    const ex = cellVert[li];
    if (ex >= 0) return ex;
    if (ex === -2) return -1; // known empty
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = node(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) { cellVert[li] = -2; return -1; }
    return emitVertex(i, j, k, li);
  }

  // --- 1. super-block, block and group culling + sampling
  const all = sdf.all;
  const gv = new Float64Array(27);
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
    const cand = superList(si, sj, sk);
    if (cand.length === 0) continue;
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
        const ex = (X[gi1] - X[gi]) * 0.5, ey = (Y[gj1] - Y[gj]) * 0.5, ez = (Z[gk1] - Z[gk]) * 0.5;
        const r = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const dg = sdf.eval(L, L.length, X[gi] + ex, Y[gj] + ey, Z[gk] + ez);
        evals++;
        if (Math.abs(dg) > r * GROUP_SAFETY + 0.05 * h) continue;
        // sample the (up to) 3x3x3 nodes of the group once
        const ci = gi1 - gi, cj = gj1 - gj, ck = gk1 - gk;
        for (let c = 0; c <= ck; c++) for (let b = 0; b <= cj; b++) for (let a = 0; a <= ci; a++) gv[(c * 3 + b) * 3 + a] = node(gi + a, gj + b, gk + c);
        for (let c = 0; c < ck; c++) for (let b = 0; b < cj; b++) for (let a = 0; a < ci; a++) {
          let mask = 0;
          for (let q = 0; q < 8; q++) {
            const v = gv[((c + (q >> 2)) * 3 + b + ((q >> 1) & 1)) * 3 + a + (q & 1)];
            cv[q] = v;
            if (v < 0) mask |= 1 << q;
          }
          const i = gi + a, j = gj + b, k = gk + c;
          const sl = blockOf(i, j, k);
          const li = sl * BV + (((k & BM) * B + (j & BM)) * B + (i & BM));
          if (cellVert[li] !== -1) continue;
          if (mask === 0 || mask === 255) { cellVert[li] = -2; continue; }
          emitVertex(i, j, k, li);
        }
      }
    }
  }
  const t1 = now();

  // --- 2. quads from sign-changing edges (may create missing vertices lazily)
  let qcap = nv * 4 + 1024;
  let quads = new Int32Array(qcap * 4);
  let nq = 0;
  let skipped = 0;
  function quad(a, b, c, d, forward) {
    if (a < 0 || b < 0 || c < 0 || d < 0) { skipped++; return; }
    if (nq >= qcap) { qcap *= 2; const n = new Int32Array(qcap * 4); n.set(quads); quads = n; }
    const o = nq * 4;
    if (forward) { quads[o] = a; quads[o + 1] = b; quads[o + 2] = c; quads[o + 3] = d; }
    else { quads[o] = a; quads[o + 1] = d; quads[o + 2] = c; quads[o + 3] = b; }
    nq++;
  }
  for (let v = 0; v < nv; v++) {
    const i = vcell[v * 3], j = vcell[v * 3 + 1], k = vcell[v * 3 + 2];
    // make sure every neighbour sharing a sign-changing face exists (closes the
    // surface where the band culling was too optimistic; the list grows as we go)
    for (let c = 0; c < 8; c++) cv[c] = node(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
    for (let f = 0; f < 6; f++) {
      const ax = f >> 1, hi = f & 1;
      let neg = 0;
      for (let c = 0; c < 8; c++) if (((c >> ax) & 1) === hi && cv[c] < 0) neg++;
      if (neg === 0 || neg === 4) continue;
      const d = hi ? 1 : -1;
      if (ax === 0) cellVertex(i + d, j, k); else if (ax === 1) cellVertex(i, j + d, k); else cellVertex(i, j, k + d);
    }
    const in0 = node(i, j, k) < 0;
    // x edge: cells (i, j-1..j, k-1..k)
    if ((node(i + 1, j, k) < 0) !== in0) quad(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), in0);
    // y edge: cells (i-1..i, j, k-1..k)
    if ((node(i, j + 1, k) < 0) !== in0) quad(cellVertex(i - 1, j, k - 1), cellVertex(i - 1, j, k), cellVertex(i, j, k), cellVertex(i, j, k - 1), in0);
    // z edge: cells (i-1..i, j-1..j, k)
    if ((node(i, j, k + 1) < 0) !== in0) quad(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), in0);
  }
  const t2 = now();

  // --- 3. project vertices onto the surface (one Newton step), normals from the gradient
  const g = new Float64Array(4);
  const normals = new Float32Array(nv * 3);
  const orig = vpos.slice(0, nv * 3); // surface-nets positions (fold-free fallback)
  const hmin = h * Math.min(...refine.map((r) => Math.min(fac(r, 0), fac(r, 1), fac(r, 2))), 1);
  for (let v = 0; v < nv; v++) {
    const i = vcell[v * 3], j = vcell[v * 3 + 1], k = vcell[v * 3 + 2];
    const L = bList[blockOf(i, j, k)];
    const cellH = Math.min(X[i + 1] - X[i], Y[j + 1] - Y[j], Z[k + 1] - Z[k]);
    const e = Math.max(cellH * 0.25, hmin * 0.15);
    let x = vpos[v * 3], y = vpos[v * 3 + 1], z = vpos[v * 3 + 2];
    sdf.grad(L, L.length, x, y, z, e, g);
    evals += 4;
    const d = g[3];
    const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    let moved = 0;
    if (gl2 > 1e-12) {
      let sx = d * g[0] / gl2, sy = d * g[1] / gl2, sz = d * g[2] / gl2;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sl > cellH) { sx *= cellH / sl; sy *= cellH / sl; sz *= cellH / sl; }
      x -= sx; y -= sy; z -= sz;
      moved = sl / cellH;
    }
    // keep the vertex inside (a slightly grown copy of) its cell: prevents fold-overs
    const gx = (X[i + 1] - X[i]) * CELL_SLACK, gy = (Y[j + 1] - Y[j]) * CELL_SLACK, gz = (Z[k + 1] - Z[k]) * CELL_SLACK;
    x = x < X[i] - gx ? X[i] - gx : x > X[i + 1] + gx ? X[i + 1] + gx : x;
    y = y < Y[j] - gy ? Y[j] - gy : y > Y[j + 1] + gy ? Y[j + 1] + gy : y;
    z = z < Z[k] - gz ? Z[k] - gz : z > Z[k + 1] + gz ? Z[k + 1] + gz : z;
    vpos[v * 3] = x; vpos[v * 3 + 1] = y; vpos[v * 3 + 2] = z;
    if (moved > RENORMAL) { sdf.grad(L, L.length, x, y, z, e, g); evals += 4; }
    const gl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1;
    normals[v * 3] = g[0] / gl; normals[v * 3 + 1] = g[1] / gl; normals[v * 3 + 2] = g[2] / gl;
  }
  const t3 = now();

  // --- 4. triangulate (shorter diagonal), drop tiny components
  const tris = new Uint32Array(nq * 6);
  let nt = 0;
  const P = vpos;
  for (let q = 0; q < nq; q++) {
    const o = q * 4;
    const a = quads[o], b = quads[o + 1], c = quads[o + 2], d = quads[o + 3];
    if (d2(P, a, c) <= d2(P, b, d)) { tris[nt++] = a; tris[nt++] = b; tris[nt++] = c; tris[nt++] = a; tris[nt++] = c; tris[nt++] = d; }
    else { tris[nt++] = a; tris[nt++] = b; tris[nt++] = d; tris[nt++] = b; tris[nt++] = c; tris[nt++] = d; }
  }
  quads = null;
  // undo the projection of vertices around folded triangles (face normal opposing the field normal)
  let unfolded = 0;
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    for (let t = 0; t < nt; t += 3) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const mx = normals[a] + normals[b] + normals[c], my = normals[a + 1] + normals[b + 1] + normals[c + 1], mz = normals[a + 2] + normals[b + 2] + normals[c + 2];
      if (fx * mx + fy * my + fz * mz >= 0) continue;
      for (const q of [a, b, c]) {
        if (P[q] === orig[q] && P[q + 1] === orig[q + 1] && P[q + 2] === orig[q + 2]) continue;
        P[q] = orig[q]; P[q + 1] = orig[q + 1]; P[q + 2] = orig[q + 2];
        changed++;
      }
    }
    unfolded += changed;
    if (!changed) break;
  }
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < nt; t += 3) {
    const a = find(tris[t]), b = find(tris[t + 1]);
    if (a !== b) parent[a] = b;
    const c = find(tris[t + 2]), b2 = find(b);
    if (c !== b2) parent[c] = b2;
  }
  const compTris = new Map();
  for (let t = 0; t < nt; t += 3) { const r = find(tris[t]); compTris.set(r, (compTris.get(r) || 0) + 1); }
  let maxC = 0; for (const c of compTris.values()) maxC = Math.max(maxC, c);
  const keep = new Uint8Array(nv);
  let kept = 0;
  for (const [r, c] of compTris) if (c >= Math.max(40, maxC * 0.01)) { keep[r] = 1; kept++; }
  const remap = new Int32Array(nv).fill(-1);
  let nv2 = 0;
  for (let t = 0; t < nt; t += 3) {
    if (!keep[find(tris[t])]) continue;
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
    if (!keep[find(tris[t])]) continue;
    indices[ni++] = remap[tris[t]]; indices[ni++] = remap[tris[t + 1]]; indices[ni++] = remap[tris[t + 2]];
  }
  const t4 = now();
  let debug;
  if (opts.debug) {
    const cells = new Int32Array(nv2 * 3);
    for (let v = 0; v < nv; v++) { const r = remap[v]; if (r >= 0) { cells[r * 3] = vcell[v * 3]; cells[r * 3 + 1] = vcell[v * 3 + 1]; cells[r * 3 + 2] = vcell[v * 3 + 2]; } }
    debug = { cells, X, Y, Z, node };
  }
  return {
    debug,
    positions, normals: nrm, indices: ni === nt ? indices : indices.slice(0, ni),
    stats: {
      grid: [nx, ny, nz], blocks: nBlocks, evals, vertices: nv2, triangles: ni / 3,
      components: compTris.size, dropped: compTris.size - kept, unfolded, skipped,
      ms: { sample: t1 - t0, quads: t2 - t1, project: t3 - t2, finish: t4 - t3 },
    },
  };
}

function d2(P, a, b) {
  const x = P[a * 3] - P[b * 3], y = P[a * 3 + 1] - P[b * 3 + 1], z = P[a * 3 + 2] - P[b * 3 + 2];
  return x * x + y * y + z * z;
}

function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
