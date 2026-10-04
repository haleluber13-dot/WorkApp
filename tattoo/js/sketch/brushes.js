// Brush engine for the Sketch studio: tool definitions + stamp-based stroke renderer.
// Strokes are rendered into a doc-sized buffer (stroke canvas) and committed onto the
// layer with the stroke opacity, so overlapping stamps never exceed the opacity.

export const TAU = Math.PI * 2;

export const INK_SWATCHES = [
  { c: '#000000', n: 'True black' },
  { c: '#2b2b2b', n: 'Dark wash' },
  { c: '#555555', n: 'Medium wash' },
  { c: '#888888', n: 'Light wash' },
  { c: '#bdbdbd', n: 'Pale wash' },
  { c: '#c8102e', n: 'Classic red' },
  { c: '#e2611b', n: 'Orange' },
  { c: '#f2b705', n: 'Yellow' },
  { c: '#1e7b3c', n: 'Green' },
  { c: '#0f8a8a', n: 'Teal' },
  { c: '#1c4fa0', n: 'Blue' },
  { c: '#5a2a8a', n: 'Purple' },
  { c: '#6b3d22', n: 'Brown' },
  { c: '#ffffff', n: 'White highlight' },
];

export const SKIN_TONES = ['#f6dcc8', '#eac2a4', '#d6a27c', '#b47a55', '#8a5638', '#5c3a26'];

// Per-tool definitions. `ui` lists option controls shown in the tool panel.
export const TOOLS = {
  move: { label: 'Move / transform', short: 'Move', key: 'V', icon: 'move', kind: 'move', ui: ['moveActions'], defaults: {} },
  fineliner: {
    label: 'Fine liner', short: 'Fine', icon: 'fineliner', kind: 'brush', stamp: 'round', spacing: 0.06, pMin: 0.55,
    ui: ['size', 'opacity', 'smoothing', 'pressure'],
    defaults: { size: 3, opacity: 1, flow: 1, smoothing: 40, pSize: true, pOpacity: false },
  },
  liner: {
    label: 'Tattoo liner', short: 'Liner', icon: 'liner', kind: 'brush', stamp: 'round', spacing: 0.05, pMin: 0.1, taper: true, velocity: true,
    ui: ['size', 'opacity', 'taper', 'smoothing', 'pressure'],
    defaults: { size: 8, opacity: 1, flow: 1, smoothing: 50, taper: 55, pSize: true, pOpacity: false },
  },
  brushpen: {
    label: 'Brush pen', short: 'Brush', icon: 'brushpen', kind: 'brush', stamp: 'nib', spacing: 0.04, pMin: 0.2, taper: true, velocity: true,
    ui: ['size', 'opacity', 'nibAngle', 'nibThin', 'taper', 'smoothing', 'pressure'],
    defaults: { size: 20, opacity: 1, flow: 1, smoothing: 45, taper: 40, nibAngle: 40, nibThin: 22, pSize: true, pOpacity: false },
  },
  shader: {
    label: 'Shader (soft / whip shading)', short: 'Shade', icon: 'shader', kind: 'brush', stamp: 'soft', spacing: 0.1, pMin: 0.4, fadeEnd: true,
    ui: ['size', 'opacity', 'flow', 'hardness', 'whip', 'smoothing', 'pressure'],
    defaults: { size: 70, opacity: 0.75, flow: 0.12, hardness: 0, whip: 0, smoothing: 25, pSize: false, pOpacity: true },
  },
  stipple: {
    label: 'Stipple / dotwork', short: 'Dots', icon: 'stipple', kind: 'brush', stamp: 'dots', spacing: 0.3, pMin: 0.3,
    ui: ['size', 'opacity', 'density', 'dotSize', 'jitter', 'smoothing', 'pressure'],
    defaults: { size: 50, opacity: 1, flow: 1, density: 35, dotSize: 2.5, jitter: 50, smoothing: 20, pSize: false, pOpacity: false },
  },
  hatch: {
    label: 'Hatching', short: 'Hatch', icon: 'hatch', kind: 'brush', stamp: 'round', masked: 'hatch', spacing: 0.08, pMin: 0.4,
    ui: ['size', 'opacity', 'hatchMode', 'hatchSpacing', 'hatchAngle', 'hatchWidth', 'smoothing'],
    defaults: { size: 60, opacity: 1, flow: 1, hatchMode: 'lines', hatchSpacing: 9, hatchAngle: 45, hatchWidth: 1.6, smoothing: 30, pSize: false, pOpacity: false },
  },
  pencil: {
    label: 'Pencil (sketch)', short: 'Pencil', icon: 'pencil', kind: 'brush', stamp: 'soft', hardnessFixed: 0.72, masked: 'grain', spacing: 0.12, pMin: 0.5,
    ui: ['size', 'opacity', 'grain', 'smoothing', 'pressure'],
    defaults: { size: 4, opacity: 0.9, flow: 0.7, grain: 60, smoothing: 25, pSize: true, pOpacity: true },
  },
  marker: {
    label: 'Marker (flat, translucent)', short: 'Marker', icon: 'marker', kind: 'brush', stamp: 'round', spacing: 0.05, pMin: 0.6,
    ui: ['size', 'opacity', 'smoothing', 'pressure'],
    defaults: { size: 26, opacity: 0.45, flow: 1, smoothing: 35, pSize: false, pOpacity: false },
  },
  eraser: {
    label: 'Eraser', short: 'Erase', key: 'E', icon: 'eraser', kind: 'brush', stamp: 'round', spacing: 0.06, pMin: 0.4, erase: true,
    ui: ['eraseMode', 'size', 'opacity', 'smoothing', 'pressure'],
    defaults: { size: 30, opacity: 1, flow: 1, eraseMode: 'hard', smoothing: 25, pSize: false, pOpacity: false },
  },
  fill: { label: 'Fill bucket', short: 'Fill', key: 'G', icon: 'fill', kind: 'fill', ui: ['opacity', 'tolerance', 'expand', 'sample'], defaults: { opacity: 1, tolerance: 20, expand: 1, sample: 'layer' } },
  shape: {
    label: 'Shapes', short: 'Shape', key: 'U', icon: 'shape', kind: 'shape',
    ui: ['shapeType', 'shapeFill', 'size', 'opacity', 'sides', 'starInner', 'arcBend', 'fromCenter'],
    defaults: { shapeType: 'ellipse', shapeFill: 'outline', size: 6, opacity: 1, sides: 5, starInner: 45, arcBend: 50, fromCenter: false },
  },
  text: {
    label: 'Text', short: 'Text', key: 'T', icon: 'text', kind: 'text',
    ui: ['font', 'fontSize', 'letterSpacing', 'curve', 'align', 'opacity'],
    defaults: { font: 'Ink Script', fontSize: 90, letterSpacing: 0, curve: 0, align: 'center', opacity: 1 },
  },
  eyedropper: { label: 'Eyedropper', short: 'Pick', key: 'I', icon: 'eyedropper', kind: 'picker', ui: ['pickSample'], defaults: { pickSample: 'all' } },
};

export const TOOL_ORDER = [
  ['move'],
  ['fineliner', 'liner', 'brushpen', 'shader', 'stipple', 'hatch', 'pencil', 'marker'],
  ['eraser', 'fill', 'shape', 'text', 'eyedropper'],
];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// ---- soft stamp sprites -----------------------------------------------------
const SPRITE = 128;
const spriteCache = new Map();
function softSprite(hardness) {
  const key = Math.round(hardness * 20);
  let c = spriteCache.get('g' + key);
  if (c) return c;
  c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  const h = key / 20;
  const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  // smooth falloff: plateau until `h`, then a cosine-ish ramp
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let a;
    if (t <= h) a = 1;
    else { const u = (t - h) / (1 - h || 1); a = 0.5 + 0.5 * Math.cos(Math.PI * u); a *= a; }
    grad.addColorStop(t, `rgba(255,255,255,${a.toFixed(4)})`);
  }
  g.fillStyle = grad; g.fillRect(0, 0, SPRITE, SPRITE);
  spriteCache.set('g' + key, c);
  return c;
}
export function tintedSprite(hardness, color) {
  const key = 'c' + Math.round(hardness * 20) + color;
  let c = spriteCache.get(key);
  if (c) return c;
  if (spriteCache.size > 80) for (const k of [...spriteCache.keys()]) if (k[0] === 'c') spriteCache.delete(k);
  c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  g.drawImage(softSprite(hardness), 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, SPRITE, SPRITE);
  spriteCache.set(key, c);
  return c;
}

// ---- patterns ---------------------------------------------------------------
let grainTile = null;
export function grainCanvas() {
  if (grainTile) return grainTile;
  const N = 256;
  grainTile = makeCanvas(N, N);
  const g = grainTile.getContext('2d');
  const id = g.createImageData(N, N);
  const rnd = mulberry32(1337);
  // value noise: 2 octaves of fine noise + a coarse "paper tooth" octave
  const coarse = new Float32Array(32 * 32);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd();
  const sampleCoarse = (x, y) => {
    const fx = x / 8, fy = y / 8; const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const v = (xx, yy) => coarse[((yy & 31) * 32) + (xx & 31)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = rnd() * 0.55 + sampleCoarse(x, y) * 0.45;
    const a = Math.max(0, Math.min(1, (n - 0.18) * 1.7));
    const i = (y * N + x) * 4;
    // stored inverted: alpha = "hole" strength, applied with destination-out × grain amount
    id.data[i] = id.data[i + 1] = id.data[i + 2] = 0; id.data[i + 3] = Math.round((1 - a) * 255);
  }
  g.putImageData(id, 0, 0);
  return grainTile;
}

export function hatchPattern(ctx, spacing, width, angleDeg) {
  const sp = Math.max(2, spacing);
  const tile = makeCanvas(8, Math.round(sp * 4));
  const g = tile.getContext('2d');
  const H = tile.height;
  // 4 lines per tile, anti-aliased by fractional rects
  for (let k = 0; k < 4; k++) {
    const y0 = k * (H / 4) + (H / 4 - width) / 2;
    const yA = Math.floor(y0), yB = Math.ceil(y0 + width);
    for (let y = yA; y < yB; y++) {
      const cov = Math.max(0, Math.min(y + 1, y0 + width) - Math.max(y, y0));
      g.fillStyle = `rgba(0,0,0,${cov})`; g.fillRect(0, y, 8, 1);
    }
  }
  const pat = ctx.createPattern(tile, 'repeat');
  pat.setTransform(new DOMMatrix().rotateSelf(angleDeg));
  return pat;
}

// ---- symmetry transforms ----------------------------------------------------
export function mul(A, B) { // A·B (B applied first), matrices as [a,b,c,d,e,f]
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}
export function symmetryTransforms(mode, n, cx, cy) {
  const I = [1, 0, 0, 1, 0, 0];
  const V = [-1, 0, 0, 1, 2 * cx, 0];
  const H = [1, 0, 0, -1, 0, 2 * cy];
  const rot = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; };
  switch (mode) {
    case 'vertical': return [I, V];
    case 'horizontal': return [I, H];
    case 'quad': return [I, V, H, mul(V, H)];
    case 'radial': { const out = []; for (let k = 0; k < n; k++) out.push(rot(k * TAU / n)); return out; }
    case 'kaleido': { const out = []; for (let k = 0; k < n; k++) { const R = rot(k * TAU / n); out.push(R, mul(R, V)); } return out; }
    default: return [I];
  }
}

// ---- rect helpers -----------------------------------------------------------
export function rectUnion(r, x0, y0, x1, y1) {
  if (!r) return { x0, y0, x1, y1 };
  if (x0 < r.x0) r.x0 = x0; if (y0 < r.y0) r.y0 = y0;
  if (x1 > r.x1) r.x1 = x1; if (y1 > r.y1) r.y1 = y1;
  return r;
}
export function rectToInt(r, w, h, pad = 2) {
  if (!r) return null;
  const x = Math.max(0, Math.floor(r.x0 - pad)), y = Math.max(0, Math.floor(r.y0 - pad));
  const x1 = Math.min(w, Math.ceil(r.x1 + pad)), y1 = Math.min(h, Math.ceil(r.y1 + pad));
  if (x1 <= x || y1 <= y) return null;
  return { x, y, w: x1 - x, h: y1 - y };
}

// ---- Stroke -----------------------------------------------------------------
/**
 * o: { def, opts, color, ctx (stroke buffer), maskCtx, tmpCtx, transforms, w, h, hasPressure, seed }
 */
export class Stroke {
  constructor(o) {
    Object.assign(this, o);
    this.pts = [];
    this.seed = o.seed ?? ((Math.random() * 1e9) | 0);
    this.bbox = null; this.frame = null;
    this.finalLen = null;
    const { def, opts } = this;
    this.rake = def.masked === 'hatch' && opts.hatchMode === 'rake';
    this.masked = !!def.masked && !this.rake;
    this.target = this.masked ? this.maskCtx : this.ctx;
    if (this.masked) {
      if (def.masked === 'grain') this.pattern = this.ctx.createPattern(grainCanvas(), 'repeat');
      else {
        this.pattern = hatchPattern(this.ctx, opts.hatchSpacing, opts.hatchWidth, opts.hatchAngle);
        if (opts.hatchMode === 'cross') this.pattern2 = hatchPattern(this.ctx, opts.hatchSpacing, opts.hatchWidth, opts.hatchAngle + 90);
      }
    }
    this.soft = def.stamp === 'soft' || (def.erase && opts.eraseMode === 'soft');
    this.hardness = def.hardnessFixed ?? (def.erase ? 0.15 : (opts.hardness ?? 0) / 100 * 0.95);
    if (this.soft) this.sprite = tintedSprite(this.hardness, def.erase ? '#000' : this.color);
    this._reset();
  }

  _reset() {
    this.dist = 0; this.next = 0; this.drawn = 0;
    this.rng = mulberry32(this.seed);
    this.lastSize = this.opts.size;
    this.stamps = 0;
  }

  add(x, y, p, t) {
    const pts = this.pts, last = pts[pts.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 0.7) { last.p = last.p * 0.6 + p * 0.4; return; }
      const dt = Math.max(4, t - last.t);
      const v = last.v * 0.6 + (d / dt) * 0.4;
      pts.push({ x, y, p, t, v });
    } else {
      pts.push({ x, y, p, t, v: 0 });
      this._stamp(x, y, p, 0, 0, 0, 0);
    }
    this._renderAvailable(false);
    this._post();
  }

  _renderAvailable(final) {
    const n = this.pts.length;
    const upto = final ? n - 1 : n - 2;
    while (this.drawn < upto) { this._segment(this.drawn); this.drawn++; }
  }

  /** finish the stroke; re-renders with end taper when needed. */
  finish() {
    this._renderAvailable(true);
    const { def, opts } = this;
    const needsRerender = (def.taper && opts.taper > 0) || (def.fadeEnd && opts.whip > 0);
    const isTap = this.dist < Math.max(1.5, opts.size * 0.35);
    if (needsRerender || (isTap && def.taper)) {
      const L = this.dist;
      this._clearBBox();
      this._reset();
      this.finalLen = L;
      const p0 = this.pts[0];
      if (isTap && def.taper) {
        this.tapMode = true; // a tap = a full dot (tattoo dot)
        this._stamp(p0.x, p0.y, p0.p, 0, 0, 0, 0);
      } else {
        this._stamp(p0.x, p0.y, p0.p, 0, 0, 0, 0);
        for (let i = 0; i < this.pts.length - 1; i++) this._segment(i);
      }
    }
    this._post();
  }

  _clearBBox() {
    const r = rectToInt(this.bbox, this.w, this.h, 4);
    if (!r) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(r.x, r.y, r.w, r.h);
    if (this.masked) { this.maskCtx.setTransform(1, 0, 0, 1, 0, 0); this.maskCtx.clearRect(r.x, r.y, r.w, r.h); }
    this.frame = rectUnion(this.frame, r.x, r.y, r.x + r.w, r.y + r.h);
  }

  _segment(i) {
    const P = this.pts;
    const p1 = P[i], p2 = P[i + 1];
    const p0 = P[i - 1] || p1, p3 = P[i + 2] || p2;
    const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (d12 < 1e-6) return;
    const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || d12;
    const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y) || d12;
    const k1 = d12 / (d01 + d12), k2 = d12 / (d12 + d23);
    const c1x = p1.x + (p2.x - p0.x) * k1 / 3, c1y = p1.y + (p2.y - p0.y) * k1 / 3;
    const c2x = p2.x - (p3.x - p1.x) * k2 / 3, c2y = p2.y - (p3.y - p1.y) * k2 / 3;
    const steps = Math.min(600, Math.max(2, Math.ceil(d12 * 1.5)));
    let px = p1.x, py = p1.y;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps, iu = 1 - u;
      const b0 = iu * iu * iu, b1 = 3 * iu * iu * u, b2 = 3 * iu * u * u, b3 = u * u * u;
      const qx = b0 * p1.x + b1 * c1x + b2 * c2x + b3 * p2.x;
      const qy = b0 * p1.y + b1 * c1y + b2 * c2y + b3 * p2.y;
      const l = Math.hypot(qx - px, qy - py);
      if (l > 0) {
        const dirx = (qx - px) / l, diry = (qy - py) / l;
        while (this.next <= this.dist + l) {
          const f = (this.next - this.dist) / l;
          const uu = (s - 1 + f) / steps;
          const x = px + (qx - px) * f, y = py + (qy - py) * f;
          const p = p1.p + (p2.p - p1.p) * uu;
          const v = p1.v + (p2.v - p1.v) * uu;
          this._stamp(x, y, p, v, dirx, diry, this.next);
          this.next += this._spacing();
        }
        this.dist += l;
      }
      px = qx; py = qy;
    }
  }

  _spacing() {
    const { def, opts } = this;
    if (this.rake) return Math.max(0.3, opts.hatchWidth * 0.3);
    if (def.stamp === 'dots') return Math.max(1, opts.size * def.spacing);
    if (def.stamp === 'nib') return Math.max(0.25, this.lastSize * Math.max(0.05, opts.nibThin / 100) * 0.35);
    return Math.max(0.25, this.lastSize * def.spacing);
  }

  _taper(d) {
    const o = this.opts, s = o.size, T = o.taper / 100;
    let a = s * (0.8 + 6 * T), b = s * (1.2 + 9 * T);
    let f = 1;
    if (this.finalLen != null) {
      const L = this.finalLen;
      if (a + b > L * 0.95) { const k = (L * 0.95) / (a + b); a *= k; b *= k; }
      if (b > 0) f = Math.min(f, Math.sin(Math.PI / 2 * Math.min(1, Math.max(0, L - d) / b)));
    }
    if (a > 0) f = Math.min(f, Math.sin(Math.PI / 2 * Math.min(1, d / a)));
    return 0.03 + 0.97 * f;
  }

  _stamp(x, y, p, v, dx, dy, d) {
    const { def, opts } = this;
    let size = opts.size;
    let alpha = opts.flow ?? 1;
    const pr = this.hasPressure ? Math.max(0, Math.min(1, p)) : 1;
    if (opts.pSize && this.hasPressure) size *= def.pMin + (1 - def.pMin) * Math.pow(pr, 0.85);
    if (opts.pOpacity && this.hasPressure) alpha *= 0.12 + 0.88 * pr;
    if (def.velocity && !this.hasPressure) size *= 1 - Math.min(0.32, Math.max(0, (v - 0.45) * 0.16));
    if (def.taper && opts.taper > 0 && !this.tapMode) size *= this._taper(d);
    if (def.fadeEnd && opts.whip > 0 && this.finalLen != null) {
      const W = opts.whip / 100;
      const u = Math.min(1, Math.max(0, d / Math.max(1, this.finalLen)));
      alpha *= 1 - W * Math.pow(u, 1.3);
    }
    this.lastSize = size;
    const T = this.transforms;
    const g = this.target;
    let r = size / 2;
    const color = this.def.erase ? '#000' : this.color;

    if (def.stamp === 'dots') { this._dots(x, y, r, pr); return; }
    if (this.rake) { this._rake(x, y, r, dx, dy); return; }

    // flow → per-stamp alpha (independent of spacing)
    if (alpha < 1) {
      const sp = Math.max(0.02, Math.min(1, this._spacing() / Math.max(0.5, size)));
      alpha = 1 - Math.pow(1 - alpha, sp * 4);
    }
    if (r < 0.5) { alpha *= (r / 0.5) * (r / 0.5) + 0.0; r = 0.5; }
    if (alpha <= 0.002) return;
    if (def.stamp === 'soft' && this.def.hardnessFixed) { // pencil jitter
      x += (this.rng() - 0.5) * size * 0.12; y += (this.rng() - 0.5) * size * 0.12;
    }
    g.globalAlpha = alpha;
    const pad = r + 2;
    if (this.soft) {
      const S = this.sprite;
      // soft sprites have ~0 alpha at the rim, so scale them a bit larger for perceived size
      const rr = r * 1.15;
      for (const m of T) {
        const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(S, tx - rr, ty - rr, rr * 2, rr * 2);
        this._grow(tx, ty, rr + 2);
      }
    } else if (def.stamp === 'nib') {
      const thin = Math.max(0.04, opts.nibThin / 100);
      const ang = (opts.nibAngle || 0) * Math.PI / 180;
      g.fillStyle = color;
      for (const m of T) {
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        g.beginPath();
        g.ellipse(x, y, r, Math.max(0.5, r * thin), ang, 0, TAU);
        g.fill();
        const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
        this._grow(tx, ty, pad);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = color;
      g.beginPath();
      for (const m of T) {
        const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
        g.moveTo(tx + r, ty);
        g.arc(tx, ty, r, 0, TAU);
        this._grow(tx, ty, pad);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    this.stamps++;
  }

  _dots(x, y, r, pr) {
    const { opts } = this;
    const g = this.target, T = this.transforms;
    const dot = Math.max(0.3, opts.dotSize / 2);
    const area = Math.PI * r * r;
    const spacingLen = Math.max(1, opts.size * this.def.spacing);
    // dots per stamp so density is independent of spacing
    const perArea = (opts.density / 100) * 0.09 / (dot * dot);
    let count = area * perArea * (spacingLen / (2 * r)) * (0.35 + 0.65 * pr);
    let n = Math.floor(count); if (this.rng() < count - n) n++;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.color; g.globalAlpha = 1;
    g.beginPath();
    const jit = opts.jitter / 100;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU;
      const rr = r * Math.pow(this.rng(), 0.62);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      const ds = Math.max(0.35, dot * (1 + jit * (this.rng() * 2 - 1) * 0.75));
      for (const m of T) {
        const tx = m[0] * px + m[2] * py + m[4], ty = m[1] * px + m[3] * py + m[5];
        g.moveTo(tx + ds, ty); g.arc(tx, ty, ds, 0, TAU);
      }
    }
    g.fill();
    for (const m of T) {
      const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
      this._grow(tx, ty, r + dot * 2 + 2);
    }
  }

  _rake(x, y, r, dx, dy) {
    const { opts } = this;
    const g = this.target, T = this.transforms;
    if (!dx && !dy) { dx = 1; dy = 0; }
    const nx = -dy, ny = dx;
    const gap = Math.max(1.5, opts.hatchSpacing);
    const count = Math.max(2, Math.round((r * 2) / gap) + 1);
    const lw = Math.max(0.35, opts.hatchWidth / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.color; g.globalAlpha = 1;
    g.beginPath();
    for (let k = 0; k < count; k++) {
      const off = (k - (count - 1) / 2) * gap;
      const px = x + nx * off, py = y + ny * off;
      for (const m of T) {
        const tx = m[0] * px + m[2] * py + m[4], ty = m[1] * px + m[3] * py + m[5];
        g.moveTo(tx + lw, ty); g.arc(tx, ty, lw, 0, TAU);
      }
    }
    g.fill();
    for (const m of T) {
      const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
      this._grow(tx, ty, (count * gap) / 2 + lw + 2);
    }
  }

  _grow(x, y, r) {
    this.bbox = rectUnion(this.bbox, x - r, y - r, x + r, y + r);
    this.frame = rectUnion(this.frame, x - r, y - r, x + r, y + r);
  }

  /** Masked brushes: rebuild the visible stroke buffer from mask × pattern in the dirty frame. */
  _post() {
    if (!this.masked || !this.frame) return;
    const r = rectToInt(this.frame, this.w, this.h, 2);
    if (!r) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(r.x, r.y, r.w, r.h);
    c.drawImage(this.maskCtx.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    if (this.def.masked === 'grain') {
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = Math.max(0, Math.min(1, (this.opts.grain ?? 60) / 100));
    } else c.globalCompositeOperation = 'destination-in';
    c.fillStyle = this.pattern; c.fillRect(r.x, r.y, r.w, r.h);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (this.pattern2) {
      const t = this.tmpCtx;
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'source-over';
      t.clearRect(r.x, r.y, r.w, r.h);
      t.drawImage(this.maskCtx.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      t.globalCompositeOperation = 'destination-in';
      t.fillStyle = this.pattern2; t.fillRect(r.x, r.y, r.w, r.h);
      t.globalCompositeOperation = 'source-over';
      c.drawImage(t.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      t.clearRect(r.x, r.y, r.w, r.h);
    }
  }

  takeFrame() { const f = this.frame; this.frame = null; return f; }
}
