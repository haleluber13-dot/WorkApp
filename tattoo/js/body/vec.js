// Tiny vector helpers on [x, y, z] arrays (model construction only, not hot).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const madd = (...terms) => {
  // madd(p, v1, s1, v2, s2, ...) = p + v1*s1 + v2*s2 ...
  const r = terms[0].slice();
  for (let i = 1; i < terms.length; i += 2) { const v = terms[i], s = terms[i + 1]; r[0] += v[0] * s; r[1] += v[1] * s; r[2] += v[2] * s; }
  return r;
};
export const rad = (deg) => (deg * Math.PI) / 180;
// rotate unit vector a toward unit vector b (perpendicular) by angle (radians)
export const tilt = (a, b, ang) => norm([a[0] * Math.cos(ang) + b[0] * Math.sin(ang), a[1] * Math.cos(ang) + b[1] * Math.sin(ang), a[2] * Math.cos(ang) + b[2] * Math.sin(ang)]);
// rotate vector v around unit axis k by angle (Rodrigues)
export const rotate = (v, k, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang), kd = dot(k, v), kx = cross(k, v);
  return [v[0] * c + kx[0] * s + k[0] * kd * (1 - c), v[1] * c + kx[1] * s + k[1] * kd * (1 - c), v[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
};

// A limb frame: d = along the limb (proximal → distal), f = anterior, l = lateral (side-aware)
export function frame(o, d, fHint, side) {
  d = norm(d);
  let f = sub(fHint, mul(d, dot(fHint, d)));
  f = norm(f);
  const l = mul(cross(d, f), -side);
  return makeFrame(o, d, l, f);
}
export function makeFrame(o, d, l, f) {
  return {
    o, d, l, f,
    p(u, v = 0, w = 0) { return [o[0] + d[0] * u + l[0] * v + f[0] * w, o[1] + d[1] * u + l[1] * v + f[1] * w, o[2] + d[2] * u + l[2] * v + f[2] * w]; },
    axes() { return [d, l, f]; },
  };
}
