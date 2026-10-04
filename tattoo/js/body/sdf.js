// Compact signed-distance-field evaluator for the procedural body.
// Pure JS (no three.js) so it can run inside a module worker.
//
// Primitives are stored in one flat Float64Array (STRIDE numbers each) and
// combined in insertion order with polynomial (cubic) smooth-min unions,
// smooth subtractions or smooth intersections. Each primitive carries an
// axis-aligned bounding box used to skip it cheaply when it cannot affect the
// result at the query point.

export const T_CONE = 0, T_ELL = 1, T_BOX = 2, T_LOFT = 3, T_PLANE = 4;
export const OP_UNION = 0, OP_SUB = 1, OP_INTER = 2;
export const STRIDE = 40;

// header layout
const TY = 0, OP = 1, K = 2, K0 = 3, HASRAMP = 4, RO = 5, RG = 8, BB = 11, PR = 17;

export class SDFBuilder {
  constructor() {
    this.items = [];
    this.loft = [];
  }
  _push(type, op, k, params, bbox, ramp) {
    this.items.push({ type, op, k, params, bbox, ramp });
    return this.items.length - 1;
  }
  // round cone from a (radius r1) to b (radius r2)
  cone(a, b, r1, r2, k = 0, opt = {}) {
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
    if (l2 < 1e-10) { ba[1] = 1e-5; l2 = 1e-10; }
    const L = Math.sqrt(l2);
    // keep the cone well-defined: |r1-r2| < length
    const maxd = L * 0.95;
    if (Math.abs(r1 - r2) > maxd) { if (r1 > r2) r2 = r1 - maxd; else r1 = r2 - maxd; }
    const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    const R = Math.max(r1, r2);
    const bbox = [
      Math.min(a[0] - r1, b[0] - r2), Math.min(a[1] - r1, b[1] - r2), Math.min(a[2] - r1, b[2] - r2),
      Math.max(a[0] + r1, b[0] + r2), Math.max(a[1] + r1, b[1] + r2), Math.max(a[2] + r1, b[2] + r2)];
    void R;
    return this._push(T_CONE, opCode(opt), k, [a[0], a[1], a[2], ba[0], ba[1], ba[2], r1, r2, l2, rr, a2, il2], bbox, opt.ramp);
  }
  // ellipsoid with orthonormal axes [ax, ay, az] and radii
  // radii: [rx, ry, rz] or asymmetric [rx+, rx-, ry+, ry-, rz+, rz-]
  ell(c, axes, radii, k = 0, opt = {}) {
    const r = radii.length === 3 ? [radii[0], radii[0], radii[1], radii[1], radii[2], radii[2]] : radii.slice();
    const [ax, ay, az] = axes;
    const bbox = [0, 0, 0, 0, 0, 0];
    for (let d = 0; d < 3; d++) {
      let lo = 0, hi = 0;
      const comps = [ax[d], ay[d], az[d]];
      for (let a = 0; a < 3; a++) {
        const v = comps[a];
        const rp = r[a * 2], rn = r[a * 2 + 1];
        // extent along world axis d contributed by local axis a
        if (v >= 0) { hi += v * rp; lo -= v * rn; } else { hi += -v * rn; lo -= -v * rp; }
      }
      bbox[d] = c[d] + lo; bbox[d + 3] = c[d] + hi;
    }
    return this._push(T_ELL, opCode(opt), k, [c[0], c[1], c[2], ...ax, ...ay, ...az, ...r], bbox, opt.ramp);
  }
  // rounded box: half extents b (inside the rounding), rounding radius rad
  box(c, axes, b, rad, k = 0, opt = {}) {
    const [ax, ay, az] = axes;
    const bbox = [0, 0, 0, 0, 0, 0];
    for (let d = 0; d < 3; d++) {
      const e = Math.abs(ax[d]) * (b[0] + rad) + Math.abs(ay[d]) * (b[1] + rad) + Math.abs(az[d]) * (b[2] + rad);
      bbox[d] = c[d] - e; bbox[d + 3] = c[d] + e;
    }
    return this._push(T_BOX, opCode(opt), k, [c[0], c[1], c[2], ...ax, ...ay, ...az, b[0], b[1], b[2], rad], bbox, opt.ramp);
  }
  // vertical loft: rows [[y, a(half width), bf(front half depth), bb(back half depth), cz], ...]
  // resampled uniformly with Catmull-Rom interpolation into n samples.
  loftY(rows, k = 0, n = 96, opt = {}) {
    rows = rows.slice().sort((p, q) => p[0] - q[0]);
    const y0 = rows[0][0], y1 = rows[rows.length - 1][0];
    const step = (y1 - y0) / (n - 1);
    const base = this.loft.length;
    let maxA = 0, maxF = -1, minB = 1;
    for (let i = 0; i < n; i++) {
      const y = y0 + step * i;
      const v = catmull(rows, y);
      this.loft.push(v[0], v[1], v[2], v[3]);
      maxA = Math.max(maxA, v[0]);
      maxF = Math.max(maxF, v[3] + v[1]);
      minB = Math.min(minB, v[3] - v[2]);
    }
    const bbox = [-maxA, y0, minB, maxA, y1, maxF];
    return this._push(T_LOFT, opCode(opt), k, [y0, y1, n, base, step], bbox, opt.ramp);
  }
  // half-space y >= 0 (used as a smooth intersection to flatten the soles)
  floor(k = 0.004) {
    return this._push(T_PLANE, OP_INTER, k, [], [-10, -10, -10, 10, 0, 10]);
  }
  build() {
    const n = this.items.length;
    const D = new Float64Array(n * STRIDE);
    for (let i = 0; i < n; i++) {
      const it = this.items[i], o = i * STRIDE;
      D[o + TY] = it.type; D[o + OP] = it.op; D[o + K] = it.k; D[o + K0] = it.k;
      if (it.ramp) {
        // k varies from k0 (at ramp origin) to k (at origin + dir*len)
        const { o: ro, dir, len, k0 } = it.ramp;
        D[o + HASRAMP] = 1; D[o + K0] = k0;
        D[o + RO] = ro[0]; D[o + RO + 1] = ro[1]; D[o + RO + 2] = ro[2];
        D[o + RG] = dir[0] / len; D[o + RG + 1] = dir[1] / len; D[o + RG + 2] = dir[2] / len;
      }
      for (let j = 0; j < 6; j++) D[o + BB + j] = it.bbox[j];
      for (let j = 0; j < it.params.length; j++) D[o + PR + j] = it.params[j];
    }
    return new SDF(D, n, new Float64Array(this.loft), this.items.map((it) => it.bbox));
  }
}

function opCode(opt) { return opt.sub ? OP_SUB : opt.inter ? OP_INTER : OP_UNION; }

function catmull(rows, y) {
  let i = 0;
  while (i < rows.length - 2 && y > rows[i + 1][0]) i++;
  const p1 = rows[i], p2 = rows[i + 1];
  const p0 = rows[Math.max(0, i - 1)], p3 = rows[Math.min(rows.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (y - p1[0]) / (p2[0] - p1[0])));
  const out = [];
  for (let c = 1; c < p1.length; c++) {
    // non-uniform spacing tolerated: use tangents scaled by segment length
    const h = p2[0] - p1[0];
    const m1 = i > 0 ? (p2[c] - p0[c]) / (p2[0] - p0[0]) * h : (p2[c] - p1[c]);
    const m2 = i + 2 < rows.length ? (p3[c] - p1[c]) / (p3[0] - p1[0]) * h : (p2[c] - p1[c]);
    const t2 = t * t, t3 = t2 * t;
    out.push((2 * t3 - 3 * t2 + 1) * p1[c] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[c] + (t3 - t2) * m2);
  }
  return out;
}

export class SDF {
  constructor(D, n, L, bboxes) {
    this.D = D; this.n = n; this.L = L; this.bboxes = bboxes;
    this.all = new Int32Array(n);
    for (let i = 0; i < n; i++) this.all[i] = i;
  }

  // union of primitive boxes (excluding the floor plane)
  bounds() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.n; i++) {
      if (this.D[i * STRIDE] === T_PLANE || this.D[i * STRIDE + OP] !== OP_UNION) continue;
      const o = i * STRIDE + BB;
      for (let j = 0; j < 3; j++) { b[j] = Math.min(b[j], this.D[o + j]); b[j + 3] = Math.max(b[j + 3], this.D[o + j + 3]); }
    }
    return b;
  }

  // indices of primitives that may influence points inside the box (expanded by margin)
  listFor(x0, y0, z0, x1, y1, z1, margin, cand = null) {
    const out = [];
    const D = this.D;
    const src = cand || this.all;
    for (let ii = 0; ii < src.length; ii++) {
      const i = src[ii];
      const o = i * STRIDE;
      const e = D[o + K] + margin;
      if (D[o + BB] - e > x1 || D[o + BB + 3] + e < x0) continue;
      if (D[o + BB + 1] - e > y1 || D[o + BB + 4] + e < y0) continue;
      if (D[o + BB + 2] - e > z1 || D[o + BB + 5] + e < z0) continue;
      out.push(i);
    }
    return Int32Array.from(out);
  }

  prim(o, x, y, z) {
    const D = this.D;
    const t = D[o];
    const p = o + PR;
    if (t === T_ELL) {
      const qx = x - D[p], qy = y - D[p + 1], qz = z - D[p + 2];
      const lx = D[p + 3] * qx + D[p + 4] * qy + D[p + 5] * qz;
      const ly = D[p + 6] * qx + D[p + 7] * qy + D[p + 8] * qz;
      const lz = D[p + 9] * qx + D[p + 10] * qy + D[p + 11] * qz;
      const rx = lx >= 0 ? D[p + 12] : D[p + 13];
      const ry = ly >= 0 ? D[p + 14] : D[p + 15];
      const rz = lz >= 0 ? D[p + 16] : D[p + 17];
      const ax = lx / rx, ay = ly / ry, az = lz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / rx, by = ay / ry, bz = az / rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-12) return -Math.min(rx, ry, rz);
      return k0 * (k0 - 1) / k1;
    }
    if (t === T_CONE) {
      const pax = x - D[p], pay = y - D[p + 1], paz = z - D[p + 2];
      const bax = D[p + 3], bay = D[p + 4], baz = D[p + 5];
      const r1 = D[p + 6], r2 = D[p + 7], l2 = D[p + 8], rr = D[p + 9], a2 = D[p + 10], il2 = D[p + 11];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const wx = pax * l2 - bax * yy, wy = pay * l2 - bay * yy, wz = paz * l2 - baz * yy;
      const x2 = wx * wx + wy * wy + wz * wz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const kk = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
      if ((zz > 0 ? 1 : zz < 0 ? -1 : 0) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
      if ((yy > 0 ? 1 : yy < 0 ? -1 : 0) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    }
    if (t === T_LOFT) {
      const y0 = D[p], y1 = D[p + 1], n = D[p + 2], base = D[p + 3], step = D[p + 4];
      const d0 = this.loft2(base, n, y0, step, x, y, z);
      const dp = this.loft2(base, n, y0, step, x, y + 0.008, z);
      const dm = this.loft2(base, n, y0, step, x, y - 0.008, z);
      const gy = (dp - dm) / 0.016;
      const dxz = d0 / Math.sqrt(1 + gy * gy);
      const dy = Math.max(y0 - y, y - y1);
      if (dxz > 0 && dy > 0) return Math.sqrt(dxz * dxz + dy * dy);
      return dxz > dy ? dxz : dy;
    }
    if (t === T_BOX) {
      const qx = x - D[p], qy = y - D[p + 1], qz = z - D[p + 2];
      const lx = Math.abs(D[p + 3] * qx + D[p + 4] * qy + D[p + 5] * qz) - D[p + 12];
      const ly = Math.abs(D[p + 6] * qx + D[p + 7] * qy + D[p + 8] * qz) - D[p + 13];
      const lz = Math.abs(D[p + 9] * qx + D[p + 10] * qy + D[p + 11] * qz) - D[p + 14];
      const mx = lx > 0 ? lx : 0, my = ly > 0 ? ly : 0, mz = lz > 0 ? lz : 0;
      const inner = Math.min(Math.max(lx, ly, lz), 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + inner - D[p + 15];
    }
    if (t === T_PLANE) return -y;
    return 1e9;
  }

  loft2(base, n, y0, step, x, y, z) {
    const L = this.L;
    let t = (y - y0) / step;
    if (t < 0) t = 0; else if (t > n - 1) t = n - 1;
    let i = t | 0; if (i > n - 2) i = n - 2;
    const f = t - i;
    const j = base + i * 4;
    const a = L[j] + (L[j + 4] - L[j]) * f;
    const bf = L[j + 1] + (L[j + 5] - L[j + 1]) * f;
    const bb = L[j + 2] + (L[j + 6] - L[j + 2]) * f;
    const cz = L[j + 3] + (L[j + 7] - L[j + 3]) * f;
    const zz = z - cz;
    const b = zz > 0 ? bf : bb;
    const ax = x / a, az = zz / b;
    const k0 = Math.sqrt(ax * ax + az * az);
    const bx = ax / a, bz = az / b;
    const k1 = Math.sqrt(bx * bx + bz * bz);
    if (k1 < 1e-12) return -Math.min(a, b);
    return k0 * (k0 - 1) / k1;
  }

  eval(list, count, x, y, z) {
    const D = this.D;
    let acc = 1e9;
    for (let n = 0; n < count; n++) {
      const o = list[n] * STRIDE;
      const op = D[o + OP];
      let k = D[o + K];
      if (op !== OP_INTER) {
        let ex = 0, t;
        t = D[o + BB] - x; if (t > 0) ex += t * t; else { t = x - D[o + BB + 3]; if (t > 0) ex += t * t; }
        t = D[o + BB + 1] - y; if (t > 0) ex += t * t; else { t = y - D[o + BB + 4]; if (t > 0) ex += t * t; }
        t = D[o + BB + 2] - z; if (t > 0) ex += t * t; else { t = z - D[o + BB + 5]; if (t > 0) ex += t * t; }
        if (ex > 0) {
          const lim = op === OP_UNION ? acc + k : k - acc;
          if (lim <= 0 || ex >= lim * lim) continue;
        }
      }
      if (D[o + HASRAMP] !== 0) {
        let r = (x - D[o + RO]) * D[o + RG] + (y - D[o + RO + 1]) * D[o + RG + 1] + (z - D[o + RO + 2]) * D[o + RG + 2];
        r = r < 0 ? 0 : r > 1 ? 1 : r;
        k = D[o + K0] + (k - D[o + K0]) * r;
      }
      const d = this.prim(o, x, y, z);
      if (op === OP_UNION) {
        const h = k - Math.abs(acc - d);
        const m = acc < d ? acc : d;
        acc = h > 0 ? m - h * h * h / (6 * k * k) : m;
      } else {
        const b = op === OP_SUB ? -d : d;
        const h = k - Math.abs(acc - b);
        const m = acc > b ? acc : b;
        acc = h > 0 ? m + h * h * h / (6 * k * k) : m;
      }
    }
    return acc;
  }

  evalAll(x, y, z) { return this.eval(this.all, this.n, x, y, z); }

  // tetrahedral gradient; writes [gx,gy,gz,value] into out
  grad(list, count, x, y, z, e, out) {
    const a = this.eval(list, count, x + e, y - e, z - e);
    const b = this.eval(list, count, x - e, y - e, z + e);
    const c = this.eval(list, count, x - e, y + e, z - e);
    const d = this.eval(list, count, x + e, y + e, z + e);
    const s = 1 / (4 * e);
    out[0] = (a - b - c + d) * s;
    out[1] = (-a - b + c + d) * s;
    out[2] = (-a + b - c + d) * s;
    out[3] = (a + b + c + d) * 0.25;
    return out;
  }
}
