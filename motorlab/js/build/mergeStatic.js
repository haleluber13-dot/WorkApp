/* Fewer draw calls for the same picture.
 *
 * A generated engine is a few thousand small meshes — every bolt head, washer
 * and hose clamp is its own object, because that is how it was easiest to
 * place them. A phone GPU does not mind the triangles; it minds the draw
 * calls, and with a shadow pass each mesh costs two. So once a part is built,
 * everything in it that never moves and shares a material is baked into one
 * mesh, in the part's own frame, and the originals are dropped. The part still
 * comes off as one piece, is picked as one piece and explodes as one piece;
 * only the renderer sees a difference.
 *
 * Anything the animation touches — pistons, rods, lobes, pulleys, fans,
 * followers, puffs of smoke — is left exactly as built, and so is everything
 * under it, because a baked mesh cannot slide down a bore.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* every Object3D the animation holds a reference to, however deep in anim */
function liveObjects(anim){
  const live = new Set();
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || depth > 4 || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.isObject3D){ live.add(v); return; }
    if (Array.isArray(v)){ for (const x of v) walk(x, depth + 1); return; }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(anim, 0);
  return live;
}

const attrKey = (g) => Object.keys(g.attributes).sort().join(',') + (g.index ? '#i' : '');

export function mergeStatic(nodes, anim, { minMeshes = 2 } = {}){
  if (globalThis.__MOTORLAB_NO_MERGE) return { before:0, after:0 };
  const live = liveObjects(anim);
  let before = 0, after = 0;
  const inv = new THREE.Matrix4();
  for (const [, objs] of nodes){
    for (const part of objs){
      part.updateMatrixWorld(true);
      inv.copy(part.matrixWorld).invert();
      /* collect the meshes that may be baked: not animated, not under anything animated */
      const groups = new Map();
      const visit = (o, underLive) => {
        const isLive = underLive || live.has(o);
        if (o !== part && o.isMesh && !isLive && !Array.isArray(o.material) && o.geometry?.isBufferGeometry
            && !o.isInstancedMesh && !o.isSkinnedMesh && !o.morphTargetInfluences?.length
            && o.geometry.attributes.position){
          const key = o.material.uuid + '|' + attrKey(o.geometry) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(o);
        }
        for (const c of o.children) visit(c, isLive);
      };
      visit(part, false);
      for (const [, list] of groups){
        before += list.length;
        if (list.length < minMeshes){ after += list.length; continue; }
        const baked = [];
        for (const m of list){
          const g = m.geometry.clone();
          const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
          g.applyMatrix4(rel);
          /* mergeGeometries wants matching attribute sets; drop stragglers the
             key did not catch (e.g. an unused uv2) rather than fail the part */
          baked.push(g);
        }
        let merged = null;
        try { merged = mergeGeometries(baked, false); } catch { merged = null; }
        if (!merged){ after += list.length; continue; }
        const first = list[0];
        const mesh = new THREE.Mesh(merged, first.material);
        mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
        mesh.renderOrder = first.renderOrder;
        mesh.name = 'baked';
        mesh.userData = { ...first.userData };          /* partId: picking finds the part through the mesh */
        for (const m of list){ m.removeFromParent(); }
        part.add(mesh);
        after += 1;
      }
    }
  }
  return { before, after };
}
