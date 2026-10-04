// Worker-safe body build: params → typed arrays + region anchors (no three.js).
import { buildModel, normalizeParams } from "./model.js";
import { polygonize } from "./mesher.js";
import { computeRegions } from "./regions.js";

// grid spacing (canonical meters) per detail level
export const DETAIL_H = { low: 0.0078, medium: 0.0047, high: 0.0031 };

export function buildBodyData(params) {
  const t0 = now();
  const P = normalizeParams(params);
  const { sdf, skel, refine } = buildModel(P);
  const t1 = now();
  const h = DETAIL_H[P.detail] || DETAIL_H.medium;
  const b = sdf.bounds();
  const m = 3 * h;
  const mesh = polygonize(sdf, {
    min: [b[0] - m, Math.max(b[1], -0.01) - m, b[2] - m],
    max: [b[3] + m, b[4] + m, b[5] + m],
    h,
    refine,
  });
  const t2 = now();
  const regions = computeRegions(sdf, skel);
  const t3 = now();

  // scale canonical 1.78 m figure to the requested height
  const S = P.heightCm / 178;
  const pos = mesh.positions;
  const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = pos[i + c] * S;
      pos[i + c] = v;
      if (v < bmin[c]) bmin[c] = v;
      if (v > bmax[c]) bmax[c] = v;
    }
  }
  for (const r of regions) {
    r.position = r.position.map((v) => v * S);
    r.sizeCm = Math.round(r.sizeCm * Math.sqrt(S) * 2) / 2;
  }
  return {
    positions: pos, normals: mesh.normals, indices: mesh.indices, regions,
    bounds: { min: bmin, max: bmax },
    stats: { ...mesh.stats, ms: { model: t1 - t0, mesh: t2 - t1, regions: t3 - t2, total: t3 - t0, ...mesh.stats.ms } },
  };
}

function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
