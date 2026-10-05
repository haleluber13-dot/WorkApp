/* Geometric maker — Delaunay triangulation (sweep-hull, after the Delaunator
   algorithm by Volodymyr Agafonkin, re-implemented here) plus Voronoi cells,
   polygon clipping and small geometry helpers. No dependencies. */

const EPSILON = Math.pow(2, -52);
const EDGE_STACK = new Uint32Array(1024);

export class Delaunay {
  /* coords: Float64Array [x0, y0, x1, y1, …] */
  constructor(coords) {
    const n = coords.length >> 1;
    this.coords = coords;
    const maxTriangles = Math.max(2 * n - 5, 0);
    this._triangles = new Uint32Array(maxTriangles * 3);
    this._halfedges = new Int32Array(maxTriangles * 3);
    this._hashSize = Math.ceil(Math.sqrt(n));
    this._hullPrev = new Uint32Array(n);
    this._hullNext = new Uint32Array(n);
    this._hullTri = new Uint32Array(n);
    this._hullHash = new Int32Array(this._hashSize).fill(-1);
    this._ids = new Uint32Array(n);
    this._dists = new Float64Array(n);
    this._run();
  }

  _run() {
    const coords = this.coords, hullPrev = this._hullPrev, hullNext = this._hullNext,
      hullTri = this._hullTri, hullHash = this._hullHash;
    const n = coords.length >> 1;
    this.trianglesLen = 0;
    if (n < 3) { this.triangles = new Uint32Array(0); this.halfedges = new Int32Array(0); this.hull = new Uint32Array(0); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = coords[2 * i], y = coords[2 * i + 1];
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      this._ids[i] = i;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    let minDist = Infinity, i0 = 0, i1 = 0, i2 = 0;
    for (let i = 0; i < n; i++) {
      const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
      if (d < minDist) { i0 = i; minDist = d; }
    }
    const i0x = coords[2 * i0], i0y = coords[2 * i0 + 1];
    minDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === i0) continue;
      const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
      if (d < minDist && d > 0) { i1 = i; minDist = d; }
    }
    let i1x = coords[2 * i1], i1y = coords[2 * i1 + 1];
    let minRadius = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === i0 || i === i1) continue;
      const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
      if (r < minRadius) { i2 = i; minRadius = r; }
    }
    let i2x = coords[2 * i2], i2y = coords[2 * i2 + 1];
    if (minRadius === Infinity) { // all collinear
      this.triangles = new Uint32Array(0); this.halfedges = new Int32Array(0); this.hull = new Uint32Array(0); return;
    }
    if (orient(i0x, i0y, i1x, i1y, i2x, i2y)) {
      const i = i1, x = i1x, y = i1y;
      i1 = i2; i1x = i2x; i1y = i2y;
      i2 = i; i2x = x; i2y = y;
    }
    const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
    this._cx = center.x; this._cy = center.y;
    for (let i = 0; i < n; i++) this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
    const dists = this._dists;
    const idArr = Array.from(this._ids).sort((a, b) => dists[a] - dists[b]);
    this._ids.set(idArr);

    this._hullStart = i0;
    let hullSize = 3;
    hullNext[i0] = hullPrev[i2] = i1;
    hullNext[i1] = hullPrev[i0] = i2;
    hullNext[i2] = hullPrev[i1] = i0;
    hullTri[i0] = 0; hullTri[i1] = 1; hullTri[i2] = 2;
    hullHash.fill(-1);
    hullHash[this._hashKey(i0x, i0y)] = i0;
    hullHash[this._hashKey(i1x, i1y)] = i1;
    hullHash[this._hashKey(i2x, i2y)] = i2;
    this._addTriangle(i0, i1, i2, -1, -1, -1);

    for (let k = 0, xp = 0, yp = 0; k < this._ids.length; k++) {
      const i = this._ids[k];
      const x = coords[2 * i], y = coords[2 * i + 1];
      if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
      xp = x; yp = y;
      if (i === i0 || i === i1 || i === i2) continue;
      let start = 0;
      for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
        start = hullHash[(key + j) % this._hashSize];
        if (start !== -1 && start !== hullNext[start]) break;
      }
      start = hullPrev[start];
      let e = start, q;
      while (q = hullNext[e], !orient(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1])) {
        e = q;
        if (e === start) { e = -1; break; }
      }
      if (e === -1) continue;
      let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
      hullTri[i] = this._legalize(t + 2);
      hullTri[e] = t;
      hullSize++;
      let nn = hullNext[e];
      while (q = hullNext[nn], orient(x, y, coords[2 * nn], coords[2 * nn + 1], coords[2 * q], coords[2 * q + 1])) {
        t = this._addTriangle(nn, i, q, hullTri[i], -1, hullTri[nn]);
        hullTri[i] = this._legalize(t + 2);
        hullNext[nn] = nn;
        hullSize--;
        nn = q;
      }
      if (e === start) {
        while (q = hullPrev[e], orient(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1])) {
          t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
          this._legalize(t + 2);
          hullTri[q] = t;
          hullNext[e] = e;
          hullSize--;
          e = q;
        }
      }
      this._hullStart = hullPrev[i] = e;
      hullNext[e] = hullPrev[nn] = i;
      hullNext[i] = nn;
      hullHash[this._hashKey(x, y)] = i;
      hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
    }
    this.hull = new Uint32Array(hullSize);
    for (let i = 0, e = this._hullStart; i < hullSize; i++) { this.hull[i] = e; e = hullNext[e]; }
    this.triangles = this._triangles.subarray(0, this.trianglesLen);
    this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
  }

  _hashKey(x, y) {
    return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
  }

  _legalize(a) {
    const triangles = this._triangles, halfedges = this._halfedges, coords = this.coords;
    let i = 0, ar = 0;
    while (true) {
      const b = halfedges[a];
      const a0 = a - a % 3;
      ar = a0 + (a + 2) % 3;
      if (b === -1) {
        if (i === 0) break;
        a = EDGE_STACK[--i];
        continue;
      }
      const b0 = b - b % 3;
      const al = a0 + (a + 1) % 3;
      const bl = b0 + (b + 2) % 3;
      const p0 = triangles[ar], pr = triangles[a], pl = triangles[al], p1 = triangles[bl];
      const illegal = inCircle(
        coords[2 * p0], coords[2 * p0 + 1], coords[2 * pr], coords[2 * pr + 1],
        coords[2 * pl], coords[2 * pl + 1], coords[2 * p1], coords[2 * p1 + 1]);
      if (illegal) {
        triangles[a] = p1;
        triangles[b] = p0;
        const hbl = halfedges[bl];
        if (hbl === -1) {
          let e = this._hullStart;
          do {
            if (this._hullTri[e] === bl) { this._hullTri[e] = a; break; }
            e = this._hullPrev[e];
          } while (e !== this._hullStart);
        }
        this._link(a, hbl);
        this._link(b, halfedges[ar]);
        this._link(ar, bl);
        const br = b0 + (b + 1) % 3;
        if (i < EDGE_STACK.length) EDGE_STACK[i++] = br;
      } else {
        if (i === 0) break;
        a = EDGE_STACK[--i];
      }
    }
    return ar;
  }

  _link(a, b) {
    this._halfedges[a] = b;
    if (b !== -1) this._halfedges[b] = a;
  }

  _addTriangle(i0, i1, i2, a, b, c) {
    const t = this.trianglesLen;
    this._triangles[t] = i0; this._triangles[t + 1] = i1; this._triangles[t + 2] = i2;
    this._link(t, a); this._link(t + 1, b); this._link(t + 2, c);
    this.trianglesLen += 3;
    return t;
  }

  /* Unique edges as [a, b] point index pairs. */
  edges() {
    const out = [], T = this.triangles, H = this.halfedges;
    for (let e = 0; e < T.length; e++) {
      if (e > H[e]) out.push([T[e], T[e % 3 === 2 ? e - 2 : e + 1]]);
    }
    return out;
  }

  /* Voronoi cell polygons for the first `count` points (the caller adds far
     away frame points so these cells are bounded), clipped to the rectangle. */
  voronoi(count, x0, y0, x1, y1) {
    const T = this.triangles, H = this.halfedges, C = this.coords;
    const nt = T.length / 3;
    const cc = new Float64Array(nt * 2);
    for (let t = 0; t < nt; t++) {
      const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
      const o = circumcenter(C[2 * a], C[2 * a + 1], C[2 * b], C[2 * b + 1], C[2 * c], C[2 * c + 1]);
      cc[2 * t] = o.x; cc[2 * t + 1] = o.y;
    }
    const inedge = new Int32Array(C.length >> 1).fill(-1);
    for (let e = 0; e < T.length; e++) {
      const p = T[e % 3 === 2 ? e - 2 : e + 1];
      if (H[e] === -1 || inedge[p] === -1) inedge[p] = e;
    }
    const cells = new Array(count);
    for (let p = 0; p < count; p++) {
      const start = inedge[p];
      if (start === -1) { cells[p] = null; continue; }
      const poly = [];
      let incoming = start, guard = 0, open = false;
      do {
        const t = (incoming / 3) | 0;
        poly.push([cc[2 * t], cc[2 * t + 1]]);
        const outgoing = incoming % 3 === 2 ? incoming - 2 : incoming + 1;
        incoming = H[outgoing];
        if (incoming === -1) { open = true; break; }
      } while (incoming !== start && ++guard < 64);
      cells[p] = open ? null : clipRect(poly, x0, y0, x1, y1);
    }
    return cells;
  }
}

function pseudoAngle(dx, dy) {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return (dy > 0 ? 3 - p : 1 + p) / 4;
}
function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function orientIfSure(px, py, rx, ry, qx, qy) {
  const l = (ry - py) * (qx - px), r = (rx - px) * (qy - py);
  return Math.abs(l - r) >= 3.3306690738754716e-16 * Math.abs(l + r) ? l - r : 0;
}
function orient(rx, ry, qx, qy, px, py) {
  const sign = orientIfSure(px, py, rx, ry, qx, qy) || orientIfSure(rx, ry, qx, qy, px, py) || orientIfSure(qx, qy, px, py, rx, ry);
  return sign < 0;
}
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
  const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
  const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}
function circumradius(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const bl = dx * dx + dy * dy, cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = (ey * bl - dy * cl) * d, y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}
export function circumcenter(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const bl = dx * dx + dy * dy, cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  return { x: ax + (ey * bl - dy * cl) * d, y: ay + (dx * cl - ex * bl) * d };
}

/* Sutherland–Hodgman clip of a polygon ([[x,y],…]) to an axis-aligned rect. */
export function clipRect(poly, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const isect = [
    (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])],
    (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1],
  ];
  let out = poly;
  for (let k = 0; k < 4 && out.length; k++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ina = edges[k](a), inb = edges[k](b);
      if (inb) { if (!ina) out.push(isect[k](a, b)); out.push(b); }
      else if (ina) out.push(isect[k](a, b));
    }
  }
  return out.length >= 3 ? out : null;
}

/* Clip a polygon against a half plane dot(p - o, n) <= 0. */
export function clipHalfPlane(poly, ox, oy, nx, ny) {
  const out = [];
  const s = (p) => (p[0] - ox) * nx + (p[1] - oy) * ny;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[i];
    const sa = s(a), sb = s(b);
    if (sb <= 0) {
      if (sa > 0) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      out.push(b);
    } else if (sa <= 0) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out.length >= 3 ? out : null;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}
export function polyCentroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return Math.sqrt(x * x + y * y);
}

/* Small seeded PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
