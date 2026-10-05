// Photo studio — full-resolution output processing (pure; runs in the render worker or on the main thread).
// job = { px: Uint8ClampedArray (lw×lh source pixels), lw, lh, kk, gx, gy, GW, GH, wm: Float32Array (rw×rh mask 0..1),
//         rw, rh, adjust, look, feather } → Uint8ClampedArray RGBA (look × mask)
import { clamp01, resample } from './util.js';
import { makeSource, prepareAdjust, applyAdjust, adjustIsIdentity } from './adjust.js';
import { renderLookROI } from './looks.js';
import { guidedFilter } from './segment.js';

export function processOutput(job) {
  const { px, lw, lh, kk } = job;
  const S = makeSource(px, lw, lh, { k: kk, gx: job.gx, gy: job.gy, GW: job.GW, GH: job.GH });
  const adj = adjustIsIdentity(job.adjust) ? px : applyAdjust(S, prepareAdjust(job.adjust), new Uint8ClampedArray(px.length));
  // mask: refined working mask, upsampled; edges re-snapped to the high-res photo when not feathered
  const up = resample(job.wm, job.rw, job.rh, lw, lh);
  if (!(job.feather > 0) && kk > 1.3) {
    const q = guidedFilter(adj, lw, lh, up, Math.max(2, Math.round(kk * 1.5)), 4e-4, Math.max(1, Math.round(kk / 2)));
    for (let i = 0; i < up.length; i++) { const u = up[i]; if (u > 0.01 && u < 0.99) up[i] = clamp01((q[i] - 0.5) * 1.35 + 0.5) * 0.7 + u * 0.3; }
  }
  const mk = new Uint8Array(lw * lh);
  for (let i = 0; i < mk.length; i++) mk[i] = up[i] * 255 + 0.5;
  const L = job.look;
  const look = L.id === 'photo' && !L.white && (L.strength ?? 100) >= 100 ? adj : renderLookROI(adj, lw, lh, L, { k: kk, gx: job.gx, gy: job.gy, mask: mk });
  const out = new Uint8ClampedArray(lw * lh * 4);
  for (let i = 0, j = 0; i < lw * lh; i++, j += 4) { out[j] = look[j]; out[j + 1] = look[j + 1]; out[j + 2] = look[j + 2]; out[j + 3] = look[j + 3] * mk[i] / 255; }
  return out;
}
