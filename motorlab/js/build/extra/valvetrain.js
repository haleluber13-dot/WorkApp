/* valvetrain — geometry for the parts declared in js/data/extra/valvetrain.js.
 * See js/build/extra/index.js.
 *
 * Everything is placed with the same maths as the head/bank loop in
 * engineModel.js: a part on a head is built in that bank's own frame (height up
 * the cylinder axis, offset across it) and the frame is then rolled about the
 * crank axis by the bank angle. Per-valve pieces use the valve loop's own
 * indexing (cylinder i, valve v → piece i·nv + v) so piece n of every part sits
 * on valve n. */
import * as THREE from 'three';
import { isLS, camJournals, vtecSides } from '../../data/extra/valvetrain.js';

const deg = (d) => d * Math.PI / 180;

/* a copy of engineModel's camTiming(), so a retainer rides its valve */
function camTiming(e){
  const duration = deg(e.class === 'race' ? 285 : e.camProfile === 'aggressive' ? 255 : 228);
  const spread = e.aspiration === 'na' ? 0 : deg(9);
  return { duration, intake: deg(450) + spread, exhaust: deg(270) - spread };
}

/* A shape drawn in the (z, y) plane, extruded along X and centred on x = 0. */
function extrudeX(shape, depth, mat){
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:false, curveSegments:20 });
  g.rotateY(-Math.PI / 2);                     // (u, v, d) → (−d, v, u)
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/* convex hull (monotone chain) of [z, y] points */
function hull(pts){
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p){ while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--){ const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
const ringPts = (circles, grow, n = 40) => circles.flatMap(c => Array.from({ length:n }, (_, k) => {
  const t = (k / n) * Math.PI * 2;
  return [c.z + Math.cos(t) * (c.r + grow), c.y + Math.sin(t) * (c.r + grow)];
}));
const polyShape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
const polyPath  = (pts) => { const s = new THREE.Path();  s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };

export function build(ctx){
  const { e, L, M, MAT, has, each, flush, add, anim, frontX, cylPosition, cylSlot, fires, portAt, inSide } = ctx;
  if (!e || e.kind === 'rotary' || !L || !L.bankAngles) return;
  const { box, roundBox, cyl, tubeMesh, bolt, hexPrism, lathe, group, at, rot } = ctx.geo;
  const b = L.bore, ohv = ctx.ohv;
  const nBanksHead = L.banks === 4 ? 2 : L.banks;
  const CAM = camTiming(e);

  /* place obj at (x, y, z) in bank `a`'s frame */
  const inBank = (a, obj, x, y, z = 0) => {
    obj.position.set(x, y, z);
    const g = group('vt'); g.add(obj); g.rotation.x = a; return g;
  };
  const bankOf = (i) => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0);

  /* ================= per valve ================= */
  const want = ['guides', 'seats', 'springseats', 'retainers'].filter(has);
  if (want.length && e.valvesPerCyl > 0){
    const nv = Math.max(2, e.valvesPerCyl);
    const perSide = Math.max(1, Math.floor(nv / 2));
    const stemR = b * 0.038, maxLift = b * 0.105;
    const vY = b * 0.4025, vLen = b * 0.695;             // valve group centre and length, as in the valve loop
    const vBot = vY - vLen / 2;                          // valve face, above the deck
    for (let bk = 0; bk < nBanksHead; bk++){
      const a = L.bankAngles[bk] ?? 0;
      for (let i = 0; i < e.cyl; i++){
        if (bankOf(i) !== bk) continue;
        const p = cylPosition(e, i, L);
        for (let v = 0; v < nv; v++){
          const intake = v < perSide;
          const j = intake ? v : v - perSide;
          const zoff = (intake ? -1 : 1) * b * 0.21 + (perSide > 1 ? (j - (perSide - 1) / 2) * b * 0.19 : 0);
          const headR = b * (intake ? 0.20 : 0.175);
          const n = i * nv + v;

          /* guide: pressed into the head from the port roof up into the spring pocket */
          if (has('guides')){
            const gd = tubeMesh(stemR * 1.80, stemR * 1.06, b * 0.18, MAT.bearing(), 14);
            each('guides', n, inBank(a, gd, p.x, L.deckH + b * 0.42, zoff));
          }
          /* seat insert: the ring in the chamber roof the valve face closes on */
          if (has('seats')){
            const st = tubeMesh(headR * 1.10, headR * 0.80, headR * 0.30, MAT.iron(), 24);
            each('seats', n, inBank(a, st, p.x, L.deckH + vBot + headR * 0.15, zoff));
          }
          /* spring seat: hardened washer under the spring (spring spans 0.37–0.67 bore) */
          if (has('springseats')){
            const ss = tubeMesh(b * 0.134, stemR * 1.85, b * 0.016, MAT.plated(), 22);
            each('springseats', n, inBank(a, ss, p.x, L.deckH + b * 0.362, zoff));
          }
          /* retainer and its two split keepers, on the keeper groove; they ride
             the valve, so they are animated exactly as the valve is */
          if (has('retainers')){
            const r = group('retainer');
            const top = b * 0.672 - vY;                    // relative to the valve's own centre
            r.add(at(lathe([[stemR * 1.22, top - b * 0.026], [b * 0.098, top - b * 0.026], [b * 0.104, top - b * 0.002],
                            [b * 0.132, top], [b * 0.132, top + b * 0.018], [stemR * 1.30, top + b * 0.020]],
                           e.class === 'race' ? MAT.alloyDark() : MAT.steel(), 24), 0, 0, 0));
            for (const s of [0, 1]){
              const kg = new THREE.CylinderGeometry(b * 0.054, stemR * 1.12, b * 0.050, 12, 1, false, s * Math.PI + 0.06, Math.PI - 0.12);
              r.add(at(new THREE.Mesh(kg, MAT.plated()), 0, top + b * 0.028, 0));
            }
            const holder = inBank(a, r, p.x, L.deckH + vY, zoff);
            each('retainers', n, holder);
            const centre = intake ? CAM.intake : CAM.exhaust;
            anim?.valves?.push({ node:r, cyl:i, intake, bank:bk, lift:maxLift,
                                 phase:-(fires[i] + centre) / 2, duration:CAM.duration, home:r.position.y });
          }
        }
      }
    }
    for (const id of want) flush(id);
  }

  /* cam layout per bank, exactly as the head loop lays them out */
  const nCams = ohv ? 0 : (e.cam === 'SOHC' ? 1 : 2);
  const camY = L.deckH + b * 1.00;
  const camZ = (c) => (nCams === 1 ? 0 : (c ? 1 : -1) * b * 0.34);
  const rCrank = L.crankR * 0.7, rCam = L.crankR * 1.3;

  /* ================= cam followers: fingers, shaft rockers, desmo ================= */
  const fol = ['fingers', 'hla', 'shaftrockers', 'vtecmid', 'desmorockers'].filter(has);
  if ((fol.length || has('rockershafts') || has('vtecspool')) && nCams && e.valvesPerCyl > 0){
    const nv = Math.max(2, e.valvesPerCyl);
    const perSide = Math.max(1, Math.floor(nv / 2));
    const lobeW = b * 0.11;
    const tipY = L.deckH + b * 0.765;                      // just above the valve stem tip (0.75 bore)
    const rollY = camY - b * 0.135 - b * 0.045;            // roller under the lobe's base circle
    const sides = vtecSides(e);
    /* an arm between two points in the bank's (y, z) plane, at x0 → x1 */
    const arm = (g, p0, p1, w, t, mat) => {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      const len = Math.hypot(dx, dy, dz);
      const m = box(w, t, len, mat);
      m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx, dy, dz).normalize());
      g.add(m); return m;
    };
    const roller = (g, x, y, z, r) => g.add(at(rot(cyl(r, r, b * 0.05, MAT.steel(), 14), 0, 0, Math.PI / 2), x, y, z));
    for (let bk = 0; bk < nBanksHead; bk++){
      const a = L.bankAngles[bk] ?? 0;
      for (let i = 0; i < e.cyl; i++){
        if (bankOf(i) !== bk) continue;
        const p = cylPosition(e, i, L);
        for (let v = 0; v < nv; v++){
          const intake = v < perSide;
          const j = intake ? v : v - perSide;
          const zoff = (intake ? -1 : 1) * b * 0.21 + (perSide > 1 ? (j - (perSide - 1) / 2) * b * 0.19 : 0);
          const c = nCams === 1 ? 0 : (intake ? 0 : 1);
          const zc = camZ(c), out = intake ? -1 : 1;    // outboard, away from the plug well
          /* fan the pair of followers out along the crank so they land under
             their own lobes, as the head loop spaces the lobes */
          const xo = perSide > 1 ? (j - (perSide - 1) / 2) * lobeW * 1.7 : 0;
          const n = i * nv + v;
          const valveTip = [p.x, tipY, zoff];
          if (has('fingers') || has('hla')){
            const piv = [p.x + xo, L.deckH + b * 0.80, zc + out * b * 0.15];
            if (has('hla')){
              const h = group('hla');
              h.add(at(cyl(b * 0.046, b * 0.046, b * 0.17, MAT.steel(), 14), piv[0], piv[1] - b * 0.10, piv[2]));
              h.add(at(new THREE.Mesh(new THREE.SphereGeometry(b * 0.030, 12, 8), MAT.steel()), piv[0], piv[1] - b * 0.012, piv[2]));
              each('hla', n, (() => { const g = group('vt'); g.add(h); g.rotation.x = a; return g; })());
            }
            if (has('fingers')){
              const f = group('finger');
              arm(f, piv, valveTip, b * 0.07, b * 0.035, MAT.steel());
              roller(f, p.x + xo * 0.5, rollY, (zc + (piv[2] + zoff) / 2) / 2, b * 0.045);
              f.add(at(cyl(b * 0.034, b * 0.034, b * 0.03, MAT.steel(), 12), valveTip[0], tipY - b * 0.004, zoff));   // pad on the stem
              const g = group('vt'); g.add(f); g.rotation.x = a;
              each('fingers', n, g);
            }
          }
          if (has('shaftrockers')){
            const shaft = [p.x + xo, L.deckH + b * 0.86, zc + out * b * 0.17];
            const r = group('rocker');
            r.add(at(rot(tubeMesh(b * 0.055, b * 0.036, b * 0.07, MAT.steel(), 16), 0, 0, Math.PI / 2), shaft[0], shaft[1], shaft[2]));
            arm(r, shaft, [valveTip[0], tipY + b * 0.05, zoff], b * 0.06, b * 0.05, MAT.steel());
            roller(r, p.x + xo * 0.5, rollY + b * 0.01, zc, b * 0.045);
            /* the screw adjuster and its locknut over the valve tip */
            r.add(at(cyl(M(3.5), M(3.5), b * 0.12, MAT.plated(), 10), valveTip[0], tipY + b * 0.045, zoff));
            r.add(at(hexPrism(M(10), M(5), MAT.plated()), valveTip[0], tipY + b * 0.11, zoff));
            const g = group('vt'); g.add(r); g.rotation.x = a;
            each('shaftrockers', n, g);
          }
          if (has('desmorockers')){
            /* opening rocker over the stem tip, closing rocker forked under the
               split half-rings lower down the stem — two lobes, two levers */
            const piv = [p.x + xo, L.deckH + b * 0.80, zc + out * b * 0.17];
            const d = group('desmo');
            arm(d, piv, valveTip, b * 0.06, b * 0.04, MAT.steel());
            const cPiv = [p.x + xo, L.deckH + b * 0.62, zc + out * b * 0.14];
            arm(d, cPiv, [p.x, L.deckH + b * 0.66, zoff], b * 0.05, b * 0.035, MAT.alloyDark());
            d.add(at(rot(tubeMesh(b * 0.04, b * 0.022, b * 0.06, MAT.plated(), 12), 0, 0, Math.PI / 2), cPiv[0], cPiv[1], cPiv[2]));
            d.add(at(tubeMesh(b * 0.05, b * 0.040, b * 0.02, MAT.plated(), 12), p.x, L.deckH + b * 0.672, zoff));   // closing half-rings
            const g = group('vt'); g.add(d); g.rotation.x = a;
            each('desmorockers', n, g);
          }
        }
        /* VTEC mid rocker and its lost-motion plunger, between each pair */
        if (has('vtecmid') && perSide > 1)
          sides.forEach((sd, k) => {
            const intake = sd === 'intake', c = nCams === 1 ? 0 : (intake ? 0 : 1);
            const zc = camZ(c), out = intake ? -1 : 1;
            const zmid = (intake ? -1 : 1) * b * 0.21;
            const m = group('vtecmid');
            const shaft = [p.x, L.deckH + b * 0.86, zc + out * b * 0.17];
            m.add(at(rot(tubeMesh(b * 0.055, b * 0.036, b * 0.06, MAT.steel(), 16), 0, 0, Math.PI / 2), ...shaft));
            arm(m, shaft, [p.x, L.deckH + b * 0.80, zmid], b * 0.05, b * 0.045, MAT.plated());
            roller(m, p.x, rollY + b * 0.01, zc, b * 0.045);
            m.add(at(cyl(b * 0.035, b * 0.035, b * 0.14, MAT.steel(), 12), p.x, L.deckH + b * 0.70, zmid));   // lost-motion plunger
            const g = group('vt'); g.add(m); g.rotation.x = a;
            each('vtecmid', (i * sides.length) + k, g);
          });
      }
    }
    for (const id of fol) flush(id);

    if (has('rockershafts')){
      let k = 0;
      for (let bk = 0; bk < nBanksHead; bk++){
        const a = L.bankAngles[bk] ?? 0;
        for (let c = 0; c < nCams; c++){
          const out = (nCams === 1 ? 1 : (c ? 1 : -1));
          const sh = rot(cyl(b * 0.034, b * 0.034, L.len * 0.92, MAT.steel(), 14), 0, 0, Math.PI / 2);
          each('rockershafts', k++, inBank(a, sh, 0, L.deckH + b * 0.86, camZ(c) + out * b * 0.17));
        }
      }
      flush('rockershafts');
    }
    if (has('vtecspool')){
      for (let bk = 0; bk < nBanksHead; bk++){
        const a = L.bankAngles[bk] ?? 0;
        const sp = group('spool');
        sp.add(roundBox(b * 0.42, b * 0.30, M(16), 0.003, MAT.alloyDark()));
        sp.add(at(rot(cyl(M(14), M(14), M(34), MAT.black(), 16), Math.PI / 2, 0, 0), -b * 0.08, 0, M(22)));
        sp.add(at(roundBox(M(16), M(14), M(14), 0.002, MAT.plastic()), -b * 0.08, M(18), M(30)));
        sp.add(at(rot(cyl(M(8), M(8), M(16), MAT.plated(), 12), Math.PI / 2, 0, 0), b * 0.12, 0, M(14)));   // pressure switch
        for (const [dx, dy] of [[-0.16, 0.10], [0.16, 0.10], [0, -0.11]])
          sp.add(at(rot(bolt(M(3), M(8), MAT.steel()), Math.PI / 2, 0, 0), dx * b, dy * b, M(9)));
        /* on the head's rear end face (on a vee the inner face at this height carries the fuel rail) */
        each('vtecspool', bk, L.banks >= 2 ? inBank(a, sp, L.len / 2 + M(30), L.deckH + b * 0.60, b * 0.20)
                                           : inBank(a, sp, L.len / 2 - b * 0.40, L.deckH + b * 0.55, b * 0.75 + M(8)));
      }
      flush('vtecspool');
    }
  }

  /* ================= half-moon plugs ================= */
  if (has('halfmoon') && nCams){
    const rh = b * 0.135, t = M(10);
    let k = 0;
    for (let bk = 0; bk < nBanksHead; bk++){
      const a = L.bankAngles[bk] ?? 0;
      for (let c = 0; c < nCams; c++){
        const s = new THREE.Shape();
        s.moveTo(-rh, 0); s.absarc(0, 0, rh, Math.PI, Math.PI * 2, false); s.closePath();
        const hm = extrudeX(s, t, MAT.rubber());
        /* flat face flush with the cover joint, arc down round the cam bore,
           standing a hair proud of the head's rear face */
        each('halfmoon', k++, inBank(a, hm, L.len / 2 - t / 2 + M(2), L.deckH + b * 1.20, camZ(c)));
      }
    }
    flush('halfmoon');
  }

  /* ================= chain guides ================= */
  if (has('chainguides') && nCams){
    /* the outer tangent between the crank sprocket and a cam sprocket, on the
       side `sgn` (−1 / +1 across the bank) */
    const span = (zc, sgn) => {
      const D = [camY, zc], dist = Math.hypot(D[0], D[1]);
      const u = [D[0] / dist, D[1] / dist], pr = [-u[1], u[0]];
      const cphi = (rCrank - rCam) / dist, sphi = Math.sqrt(Math.max(0, 1 - cphi * cphi));
      let nrm = [cphi * u[0] + sphi * pr[0], cphi * u[1] + sphi * pr[1]];
      if (Math.sign(nrm[1]) !== sgn) nrm = [cphi * u[0] - sphi * pr[0], cphi * u[1] - sphi * pr[1]];
      return { a:[rCrank * nrm[0], rCrank * nrm[1]], b:[camY + rCam * nrm[0], zc + rCam * nrm[1]], n:nrm };
    };
    const rail = (sp, kind) => {
      const g = group(kind);
      const off = M(7);                                // the chain's own thickness, outboard of the line
      const A = [sp.a[0] + sp.n[0] * off, sp.a[1] + sp.n[1] * off];
      const B = [sp.b[0] + sp.n[0] * off, sp.b[1] + sp.n[1] * off];
      const dy = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dy, dz);
      const th = Math.atan2(dz, dy);
      const f0 = kind === 'arm' ? 0.10 : 0.18, f1 = kind === 'arm' ? 0.82 : 0.86;
      const mid = (f0 + f1) / 2, L0 = len * (f1 - f0);
      const at2 = (f, out = 0) => [A[0] + dy * f + sp.n[0] * out, A[1] + dz * f + sp.n[1] * out];
      /* nylon wear face against the chain, steel/alloy backbone behind it */
      const [fy, fz] = at2(mid, M(2));
      g.add(at(rot(box(M(15), L0, M(5), MAT.black()), th, 0, 0), frontX, fy, fz));
      const [by, bz] = at2(mid, M(7));
      g.add(at(rot(box(M(9), L0 * 0.94, M(6), kind === 'arm' ? MAT.alloyDark() : MAT.steel()), th, 0, 0), frontX + M(3), by, bz));
      if (kind === 'arm'){
        /* the pivot at the bottom end, and the pad the tensioner plunger pushes on */
        const [py, pz] = at2(f0 + 0.03, M(6));
        g.add(at(rot(cyl(M(8), M(8), M(18), MAT.alloyDark(), 14), 0, 0, Math.PI / 2), frontX + M(2), py, pz));
        g.add(at(rot(hexPrism(M(10), M(6), MAT.plated()), 0, 0, Math.PI / 2), frontX - M(9), py, pz));
        const [qy, qz] = at2(f1 - 0.18, M(11));
        g.add(at(rot(box(M(12), M(14), M(6), MAT.alloyDark()), th, 0, 0), frontX + M(3), qy, qz));
      } else {
        for (const f of [f0 + 0.08, f1 - 0.08]){
          const [py, pz] = at2(f, M(8));
          g.add(at(rot(hexPrism(M(9), M(5), MAT.plated()), 0, 0, Math.PI / 2), frontX - M(6), py, pz));
        }
      }
      return g;
    };
    let k = 0;
    for (let bk = 0; bk < nBanksHead; bk++){
      const a = L.bankAngles[bk] ?? 0;
      const zs = Array.from({ length:nCams }, (_, c) => camZ(c));
      const fixed = rail(span(Math.min(...zs), -1), 'guide');
      const arm   = rail(span(Math.max(...zs), +1), 'arm');
      const wrap = (o) => { const g = group('cg'); g.add(o); g.rotation.x = a; return g; };
      each('chainguides', k++, wrap(fixed));
      each('chainguides', k++, wrap(arm));
    }
    flush('chainguides');
  }

  /* ================= timing belt ================= */
  if (has('timingbelt')){
    const circles = [{ y:0, z:0, r:rCrank }];
    for (let bk = 0; bk < nBanksHead; bk++)
      for (let c = 0; c < nCams; c++){
        const [y, z] = portAt(bk, camY, camZ(c));
        circles.push({ y, z, r:rCam });
      }
    if (has('idlers'))                              // where the core builder puts them
      circles.push({ y:L.deckH * 1.05, z:-b * 0.40, r:M(26) }, { y:L.deckH * 0.20, z:-b * 1.00, r:M(21) });
    const outer = hull(ringPts(circles, M(4.5))), inner = hull(ringPts(circles, M(0.5)));
    const sh = polyShape(outer); sh.holes.push(polyPath(inner));
    const beltMesh = extrudeX(sh, M(15), MAT.rubber());
    beltMesh.position.x = frontX;
    add('timingbelt', beltMesh);
  }
  if (has('beltguide')){
    const g = group('beltguide');
    g.add(rot(tubeMesh(L.crankR * 0.86, L.crankR * 0.40, M(1.6), MAT.steel(), 28), 0, 0, Math.PI / 2));
    g.add(at(rot(tubeMesh(L.crankR * 0.90, L.crankR * 0.82, M(4), MAT.steel(), 28), 0, 0, Math.PI / 2), -M(2), 0, 0));
    add('beltguide', at(g, frontX - M(8), 0, 0));
  }

  /* ================= cam position sensor ================= */
  if (has('camsensor')){
    const sensor = () => {                           // body down the local −Y, connector on top
      const s = group('camsensor');
      s.add(at(cyl(M(9), M(9), M(24), MAT.black(), 14), 0, -M(12), 0));
      s.add(at(roundBox(M(30), M(5), M(18), 0.002, MAT.black()), 0, M(2), 0));        // flange
      s.add(at(bolt(M(3.5), M(10), MAT.steel()), M(10), M(5), 0));
      s.add(at(roundBox(M(14), M(18), M(16), 0.002, MAT.plastic()), -M(4), M(13), 0));  // connector
      s.add(at(box(M(10), M(3), M(4), MAT.black()), -M(4), M(23), 0));                  // latch
      return s;
    };
    const cs = group('camsensor');
    if (ohv){
      /* pushrod engine: in the front of the timing cover, reading the cam
         sprocket face (LS3: petrol.md family 3) */
      const s = sensor(); s.rotation.z = Math.PI / 2;    // body points +X into the cover
      cs.add(at(s, frontX - M(30), L.crankR * 1.55 + L.crankR * 0.95, b * 0.18));
    } else {
      const rear = e.id === 'i6-30-legend' || e.id === 'f4-25-t' || e.id === 'mazda-bp';
      /* 2JZ: No.1 of two sensors at the rear of the head (RM502U); EJ257 one per head at
         the rear; BP cam angle sensor off the rear of the cam. Everything else:
         on the intake side of the head near the front, over the front journal. */
      /* the 2JZ's No.2 sensor is supra2jz's camsensor2, on the other cam */
      const heads = e.id === 'f4-25-t' ? [[0, 0], [1, 0]] : [[0, 0]];
      for (const [bk, c] of heads){
        const a = L.bankAngles[bk] ?? 0;
        const s = sensor();
        if (rear){
          s.rotation.z = -Math.PI / 2;                   // body points −X, into the head's rear face
          cs.add(inBank(a, s, L.len / 2 + M(3), L.deckH + b * 0.86, camZ(nCams > 1 ? c : 0)));
        } else {
          const side = inSide(bk) || -1;
          s.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;   // body points across, into the head
          cs.add(inBank(a, s, -L.len / 2 + M(34), camY - b * 0.08, side * (b * 0.75 + M(3))));
        }
      }
    }
    add('camsensor', cs);
  }

  /* ================= pushrod engines ================= */
  if (ohv){
    const camYb = L.crankR * 1.55, baseR = b * 0.15, lobeW = b * 0.12;
    const yBot = camYb + baseR + b * 0.14;                 // lifter centre (valley engines)
    const lifterAt = (i, which) => {
      const p = cylPosition(e, i, L);
      const side = L.banks >= 2 ? (cylSlot(e, i, L).bank ? 1 : -1) : 1;
      const sgn = which === 'intake' ? -1 : 1;
      return { x:p.x + sgn * lobeW * 0.9, z:sgn * b * 0.18 * (L.banks >= 2 ? side : 1), sgn };
    };

    if (has('cambearings')){
      const n = camJournals(e);
      for (let k = 0; k < n; k++){
        const x = (k - L.perBank / 2) * L.pitch;
        const br = tubeMesh(baseR * 0.80, baseR * 0.56, M(18), MAT.bearing(), 22);
        each('cambearings', k, at(rot(br, 0, 0, Math.PI / 2), x, camYb, 0));
      }
      flush('cambearings');
    }
    if (has('camthrust')){
      const g = group('camthrust');
      g.add(box(M(5), b * 0.46, b * 0.40, MAT.steel()));
      for (const [dy, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
        g.add(at(rot(bolt(M(3), M(8), MAT.steel()), 0, 0, Math.PI / 2), -M(4), dy * b * 0.16, dz * b * 0.14));
      add('camthrust', at(g, -L.len / 2 - M(7.5), camYb, 0));
    }
    if (has('liftertrays')){
      /* one tray per four lifters: the two cylinders that share a crank
         throw, which is how the tree pairs them (lifters 4k+1…4k+4) */
      const nT = Math.round(e.cyl / 2);
      for (let k = 0; k < nT; k++){
        const g = group('tray');
        const pts = [];
        for (const i of [2 * k, 2 * k + 1]) for (const w of ['intake', 'exhaust']) pts.push(lifterAt(i, w));
        for (const q of pts){
          g.add(at(tubeMesh(b * 0.086, b * 0.064, b * 0.07, MAT.black(), 18), q.x, yBot + b * 0.05, q.z));
        }
        const xs = pts.map(q => q.x), zs = pts.map(q => q.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        g.add(at(box(Math.max(...xs) - Math.min(...xs), b * 0.035, b * 0.05, MAT.black()), cx, yBot + b * 0.05, Math.min(...zs)));
        g.add(at(box(Math.max(...xs) - Math.min(...xs), b * 0.035, b * 0.05, MAT.black()), cx, yBot + b * 0.05, Math.max(...zs)));
        g.add(at(box(b * 0.05, b * 0.035, Math.max(...zs) - Math.min(...zs), MAT.black()), cx, yBot + b * 0.05, cz));
        g.add(at(bolt(M(3), M(9), MAT.steel()), cx, yBot + b * 0.09, cz));
        each('liftertrays', k, g);
      }
      flush('liftertrays');
    }
    if (has('valleycover')){
      /* a flat plate over the lifter valley, with a grommeted hole for every
         pushrod that passes it */
      const hx = L.len * 0.44, hz = b * 0.32;
      const s = new THREE.Shape();
      s.moveTo(-hx, -hz); s.lineTo(hx, -hz); s.lineTo(hx, hz); s.lineTo(-hx, hz); s.closePath();
      const holes = [];
      for (let i = 0; i < e.cyl; i++) for (const w of ['intake', 'exhaust']){
        const q = lifterAt(i, w);
        const h = new THREE.Path(); h.absarc(q.x, q.z, b * 0.045, 0, Math.PI * 2, true); s.holes.push(h);
        holes.push(q);
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth:M(3), bevelEnabled:false, curveSegments:12 });
      geo.rotateX(Math.PI / 2);                            // (x, z) plane, extruded downward
      const g = group('valleycover');
      const yc = yBot + b * 0.12 + M(22);
      g.add(at(new THREE.Mesh(geo, MAT.alloyDark()), 0, yc, 0));
      for (const q of holes) g.add(at(tubeMesh(b * 0.058, b * 0.040, M(5), MAT.rubber(), 14), q.x, yc - M(1.5), q.z));
      for (let k = 0; k < 5; k++) for (const sz of [-1, 1])
        g.add(at(bolt(M(3), M(8), MAT.steel()), (k / 4 - 0.5) * hx * 1.9, yc + M(2), sz * hz * 0.86));
      add('valleycover', g);
    }

    /* rocker pivots: same place the OHV loop hangs each rocker */
    const rockerAt = (i, which) => {
      const q = lifterAt(i, which);
      const b0 = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const openAir = ctx.airCooled;
      const rockR = openAir ? L.deckH + b * 1.06 : L.deckH + b * 0.95;
      const [ry, rz] = openAir ? portAt(b0, rockR, q.sgn * b * 0.24) : [rockR, q.z * 1.4];
      return { x:q.x, y:ry, z:rz };
    };
    if (has('pushrodplates')){
      for (let i = 0; i < e.cyl; i++){
        const r1 = rockerAt(i, 'intake'), r2 = rockerAt(i, 'exhaust');
        const q1 = lifterAt(i, 'intake'), q2 = lifterAt(i, 'exhaust');
        const g = group('prplate');
        /* at the top of the pushrods, where the plate actually holds them */
        const y = yBot + b * 0.12 + L.deckH * 0.66 - b * 0.08;
        /* a plate between the two studs with a slot round each pushrod */
        const cx = (q1.x + q2.x) / 2, cz = (q1.z + q2.z) / 2;
        const dx = q2.x - q1.x, dz = q2.z - q1.z, ln = Math.hypot(dx, dz);
        const plate = box(ln + b * 0.16, M(3), b * 0.14, MAT.steel());
        plate.rotation.y = -Math.atan2(dz, dx);
        g.add(at(plate, cx, y, cz));
        for (const q of [q1, q2]) g.add(at(tubeMesh(b * 0.040, b * 0.026, M(4), MAT.plated(), 12), q.x, y + M(1), q.z));
        each('pushrodplates', i, g);
      }
      flush('pushrodplates');
    }
    if (has('rockerstuds')){
      const pedestal = e.id === 'd-i6-67';
      if (pedestal){
        for (let i = 0; i < e.cyl; i++){
          const r1 = rockerAt(i, 'intake'), r2 = rockerAt(i, 'exhaust');
          const g = group('pedestal');
          const cx = (r1.x + r2.x) / 2, cz = (r1.z + r2.z) / 2;
          const w = Math.abs(r2.z - r1.z) + b * 0.12;
          g.add(at(roundBox(b * 0.14, b * 0.10, w, 0.004, MAT.iron()), cx, r1.y - b * 0.085, cz));
          g.add(at(bolt(M(5), M(16), MAT.steel()), cx, r1.y + b * 0.02, cz));
          each('rockerstuds', i, g);
        }
      } else {
        const ls = isLS(e);
        for (let i = 0; i < e.cyl; i++) for (const w of ['intake', 'exhaust']){
          const r = rockerAt(i, w);
          const vi = i * 2 + (w === 'intake' ? 0 : 1);
          const g = group('rstud');
          if (ls){
            /* M8 bolt through the trunnion, into the pedestal */
            g.add(at(cyl(M(4), M(4), b * 0.16, MAT.steel(), 10), r.x, r.y - b * 0.02, r.z));
            g.add(at(hexPrism(M(13), M(6), MAT.steel()), r.x, r.y + b * 0.06, r.z));
          } else {
            /* stud, pivot ball and adjusting nut */
            g.add(at(cyl(M(5), M(5), b * 0.24, MAT.steel(), 10), r.x, r.y + b * 0.01, r.z));
            g.add(at(new THREE.Mesh(new THREE.SphereGeometry(M(8), 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.plated()), r.x, r.y + b * 0.035, r.z));
            g.add(at(hexPrism(M(15), M(9), MAT.plated()), r.x, r.y + b * 0.085, r.z));
          }
          each('rockerstuds', vi, g);
        }
      }
      flush('rockerstuds');
    }
  }
}
