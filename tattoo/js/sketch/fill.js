// Flood fill (scanline) with tolerance and anti-alias-friendly edge expansion.

/**
 * Compute a fill mask from `src` (ImageData) starting at (x, y).
 * tolerance: 0..255 (max channel distance on premultiplied RGBA).
 * expand: px of ring to grow into neighbouring (edge) pixels; ring pixels are painted *behind*.
 * Returns { mask: Uint8Array (1 core, 2 ring), rect: {x,y,w,h} } or null.
 */
export function fillMask(src, x, y, tolerance = 20, expand = 1) {
  const w = src.width, h = src.height, d = src.data;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const i0 = (y * w + x) * 4;
  const sa = d[i0 + 3], sr = d[i0] * sa / 255, sg = d[i0 + 1] * sa / 255, sb = d[i0 + 2] * sa / 255;
  const tol = tolerance;
  const match = (p) => {
    const i = p * 4, a = d[i + 3];
    if (Math.abs(a - sa) > tol) return false;
    const k = a / 255;
    return Math.abs(d[i] * k - sr) <= tol && Math.abs(d[i + 1] * k - sg) <= tol && Math.abs(d[i + 2] * k - sb) <= tol;
  };
  const mask = new Uint8Array(w * h);
  let minX = x, maxX = x, minY = y, maxY = y;
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop(), sx = stack.pop();
    let p = sy * w + sx;
    if (mask[p] || !match(p)) continue;
    let lx = sx, rx = sx;
    while (lx > 0 && !mask[p - (sx - lx) - 1] && match(p - (sx - lx) - 1)) lx--;
    while (rx < w - 1 && !mask[p + (rx - sx) + 1] && match(p + (rx - sx) + 1)) rx++;
    const row = sy * w;
    for (let xx = lx; xx <= rx; xx++) mask[row + xx] = 1;
    if (lx < minX) minX = lx; if (rx > maxX) maxX = rx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let inRun = false;
      for (let xx = lx; xx <= rx; xx++) {
        const q = nrow + xx;
        const ok = !mask[q] && match(q);
        if (ok && !inRun) { stack.push(xx, ny); inRun = true; }
        else if (!ok) inRun = false;
      }
    }
  }
  // grow a ring into edge pixels (8-neighbourhood on odd passes = rounder growth)
  for (let pass = 0; pass < expand; pass++) {
    const x0 = Math.max(0, minX - 1), x1 = Math.min(w - 1, maxX + 1);
    const y0 = Math.max(0, minY - 1), y1 = Math.min(h - 1, maxY + 1);
    const add = [];
    const diag = pass % 2 === 1;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const p = yy * w + xx;
      if (mask[p]) continue;
      const n = (xx > 0 && mask[p - 1]) || (xx < w - 1 && mask[p + 1]) || (yy > 0 && mask[p - w]) || (yy < h - 1 && mask[p + w]) ||
        (diag && ((xx > 0 && yy > 0 && mask[p - w - 1]) || (xx < w - 1 && yy > 0 && mask[p - w + 1]) || (xx > 0 && yy < h - 1 && mask[p + w - 1]) || (xx < w - 1 && yy < h - 1 && mask[p + w + 1])));
      if (n) add.push(p);
    }
    for (const p of add) mask[p] = 2;
    minX = x0; maxX = x1; minY = y0; maxY = y1;
  }
  return { mask, rect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

/** Paint the mask into `dst` (ImageData of the rect only). rgb: [r,g,b], opacity 0..1 */
export function applyFill(dst, mask, maskW, rect, rgb, opacity = 1) {
  const d = dst.data;
  const fa = opacity;
  const [fr, fg, fb] = rgb;
  for (let yy = 0; yy < rect.h; yy++) {
    for (let xx = 0; xx < rect.w; xx++) {
      const m = mask[(rect.y + yy) * maskW + rect.x + xx];
      if (!m) continue;
      const i = (yy * rect.w + xx) * 4;
      const da = d[i + 3] / 255;
      let oa, or, og, ob;
      if (m === 1) { // fill over existing
        oa = fa + da * (1 - fa);
        if (oa <= 0) continue;
        or = (fr * fa + d[i] * da * (1 - fa)) / oa;
        og = (fg * fa + d[i + 1] * da * (1 - fa)) / oa;
        ob = (fb * fa + d[i + 2] * da * (1 - fa)) / oa;
      } else { // existing over fill (keeps line anti-aliasing intact)
        oa = da + fa * (1 - da);
        if (oa <= 0) continue;
        or = (d[i] * da + fr * fa * (1 - da)) / oa;
        og = (d[i + 1] * da + fg * fa * (1 - da)) / oa;
        ob = (d[i + 2] * da + fb * fa * (1 - da)) / oa;
      }
      d[i] = or; d[i + 1] = og; d[i + 2] = ob; d[i + 3] = oa * 255;
    }
  }
}
