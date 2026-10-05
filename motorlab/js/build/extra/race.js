/* race — geometry for the parts declared in js/data/extra/race.js.
 * Piston frame: crank on X, front at −X (frontX is the front face), Y up,
 * Z across. Everything is placed off the layout (L) and off the pieces the
 * main builder has already made (turbo ports, plug and valve nodes, the
 * blower pulley), so it lands on the right engine whatever its size. */
import * as THREE from 'three';
import { braidedLine, velocityStack } from '../../lib/geo.js';

const Yax = new THREE.Vector3(0, 1, 0);

export function build(ctx){
  const { e, L, has, MAT, M, nodes, root } = ctx;
  if (e.class !== 'race' || e.kind === 'rotary' || !L) return;
  const { box, roundBox, cyl, tubeMesh, torus, pipe, hexPrism, lathe, group, at, rot, V3, TAU } = ctx.geo;
  const frontX = ctx.frontX ?? (-L.len / 2 - M(18));
  root?.updateMatrixWorld?.(true);

  /* a cylinder from a to b */
  const rod = (a, b, r, mat, seg = 10) => {
    const d = new THREE.Vector3().subVectors(b, a), m = cyl(r, r, d.length(), mat, seg);
    m.quaternion.setFromUnitVectors(Yax, d.clone().normalize());
    m.position.copy(a).addScaledVector(d, 0.5);
    return m;
  };
  /* stand an object built along +Y on an axis through p */
  const along = (obj, p, dir) => { obj.quaternion.setFromUnitVectors(Yax, dir.clone().normalize()); obj.position.copy(p); return obj; };
  /* world-space extent of a part's meshes along a direction */
  const extent = (id, dir) => {
    let lo = Infinity, hi = -Infinity, pLo = null, pHi = null;
    const v = new THREE.Vector3();
    for (const o of nodes.get(id) || []){
      o.updateMatrixWorld(true);
      o.traverse(m => {
        if (!m.isMesh || !m.geometry?.attributes?.position) return;
        const pos = m.geometry.attributes.position;
        for (let k = 0; k < pos.count; k += Math.max(1, Math.floor(pos.count / 400))){
          v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
          const d = v.dot(dir);
          if (d < lo){ lo = d; pLo = v.clone(); }
          if (d > hi){ hi = d; pHi = v.clone(); }
        }
      });
    }
    return { lo, hi, pLo, pHi };
  };
  const bankUp = (b) => { const [y, z] = ctx.portAt(b, 1, 0); return V3(0, y, z); };
  const bankOf = (i) => (L.banks >= 2 ? ctx.cylSlot(e, i, L).bank : 0);
  const pt = (b, h, w) => { const [y, z] = ctx.portAt(b, h, w); return [y, z]; };

  /* ---------------- dry-sump tank & lines (all of them) ---------------- */
  if (has('drysumptank')){
    const g = group('drysump');
    const tX = frontX - L.bore * 1.6, tY = -L.crankR * 1.3 - M(62), tLen = M(220);
    const tank = rot(cyl(M(44), M(44), tLen, MAT.alloy(), 24), Math.PI / 2, 0, 0);
    g.add(at(tank, tX, tY, 0));
    for (const s of [-1, 1]) g.add(at(rot(cyl(M(46), M(46), M(6), MAT.alloyDark(), 24), Math.PI / 2, 0, 0), tX, tY, s * tLen / 2));
    g.add(at(cyl(M(14), M(14), M(18), MAT.anodised ? MAT.anodised() : MAT.red(), 12), tX, tY + M(52), -tLen * 0.25));   // filler / breather
    const pump = V3(frontX + M(40), -L.crankR * 0.6, L.bore * 0.5);                   // the tree's oil pump
    for (const [k, dz] of [[0, -M(10)], [1, M(14)]])
      g.add(braidedLine([V3(pump.x - M(36), pump.y - M(14) + k * M(10), pump.z + dz),
                         V3(frontX - M(30), tY - M(10) + k * M(8), pump.z + M(40) + dz),
                         V3(tX + M(30), tY + M(10), tLen / 2 - M(10) - k * M(30)),
                         V3(tX, tY + M(30), tLen / 2 - M(30) - k * M(40))], M(6)));
    ctx.add('drysumptank', g);
  }

  /* ---------------- F1 power unit ---------------- */
  if (has('mguk')){
    const g = group('mguk');
    const r = M(46), x0 = frontX + M(14), x1 = x0 + M(130);
    const y = -L.crankR * 1.3 - M(10), z = -(L.bore * 0.92 + M(66));
    g.add(at(rot(cyl(r, r, x1 - x0, MAT.alloyDark(), 28), 0, 0, Math.PI / 2), (x0 + x1) / 2, y, z));
    for (let k = 0; k < 8; k++)          // cooling fins round the stator housing
      g.add(at(rot(torus(r, M(2.2), MAT.alloyDark(), 30), 0, Math.PI / 2, 0), x0 + M(20) + k * M(13), y, z));
    /* the gear case that couples it to the crank nose */
    const yLo = y - M(52), yHi = -M(12), zLo = z - M(52), zHi = -M(26);
    g.add(at(roundBox(M(14), yHi - yLo, zHi - zLo, M(8), MAT.alloy()), x0 - M(7), (yLo + yHi) / 2, (zLo + zHi) / 2));
    /* HV phase cables (orange), back toward the energy store in the chassis */
    for (const dz of [-M(10), 0, M(10)])
      g.add(pipe([[x1 - M(10), y + M(30), z + dz], [x1 + M(30), y + M(36), z + dz * 1.2],
                  [L.len * 0.30, y + M(10), z - M(10) + dz], [L.len * 0.62, y + M(4), z + M(20) + dz]], M(5), MAT.orange(), 8));
    ctx.add('mguk', g);
  }
  if (has('mguh')){
    const tb = (ctx.turbos || [])[0];
    if (tb){
      const g = group('mguh');
      const ax = new THREE.Vector3().subVectors(tb.coldIn, tb.hotOut).normalize();
      const body = along(cyl(tb.size * 0.42, tb.size * 0.42, tb.size * 0.30, MAT.alloyDark(), 28), tb.pos, ax);
      g.add(body);
      for (const s of [-1, 1])
        g.add(along(cyl(tb.size * 0.45, tb.size * 0.45, tb.size * 0.03, MAT.plated(), 28), tb.pos.clone().addScaledVector(ax, s * tb.size * 0.15), ax));
      /* its HV connector and cables run back down the engine */
      const side = new THREE.Vector3().crossVectors(ax, Yax).normalize();
      const c0 = tb.pos.clone().addScaledVector(side, tb.size * 0.42);
      g.add(along(cyl(M(9), M(9), M(16), MAT.orange(), 12), c0, side));
      for (const k of [-1, 0, 1])
        g.add(pipe([c0.clone().addScaledVector(side, M(8)).add(V3(0, k * M(8), 0)),
                    c0.clone().addScaledVector(side, M(30)).add(V3(M(20), k * M(8), 0)),
                    V3(tb.pos.x + M(60), tb.pos.y + k * M(8), Math.sign(tb.pos.z) * (ctx.outerZ + L.bore * 1.45)),
                    V3(L.len * 0.70, tb.pos.y + k * M(8), Math.sign(tb.pos.z) * (ctx.outerZ + L.bore * 1.45))], M(4.5), MAT.orange(), 8));
      ctx.add('mguh', g);
    }
  }
  if (has('prechambers')){
    for (let i = 0; i < e.cyl; i++){
      const b = bankOf(i), u = bankUp(b);
      const ex = extent(`plugs.${i + 1}`, u);
      if (!ex.pLo) continue;
      /* the pre-chamber is the cap round the plug tip, in the chamber roof */
      const tip = ex.pLo.clone();
      const g = group('prechamber');
      const cap = lathe([[0, -M(5)], [M(4), -M(5)], [M(6.5), -M(2)], [M(6.5), M(9)], [M(8), M(10)], [M(8), M(13)], [0, M(13)]], MAT.copper ? MAT.copper() : MAT.steel(), 20);
      g.add(along(cap, tip, u));
      for (let k = 0; k < 6; k++){          // the jet holes, as tiny bosses round the nose
        const a = (k / 6) * TAU;
        const w = new THREE.Vector3(1, 0, 0).applyAxisAngle(u, a).multiplyScalar(M(4.2));
        g.add(at(cyl(M(0.8), M(0.8), M(2), MAT.black(), 6), tip.x + w.x, tip.y + w.y - u.y * M(3.5), tip.z + w.z - u.z * M(3.5)));
      }
      ctx.each('prechambers', i, g);
    }
    ctx.flush('prechambers');
  }
  if (has('pvrs')){
    const g = group('pvrs');
    /* The bottle lies along the left flank of the block below the head, where
       the turbo, its shield and the MGU-H are not (behind the engine they all
       share the crank axis). Regulator and gauge on the rear end. */
    const bx = L.len * 0.10, by = L.deckH * 0.55, bz = -(ctx.outerZ + L.bore * 0.45), bl = M(180);
    g.add(at(rot(cyl(M(30), M(30), bl, MAT.carbon ? MAT.carbon() : MAT.black(), 24), 0, 0, Math.PI / 2), bx, by, bz));
    for (const s of [-1, 1]) g.add(at(rot(sphereCap(M(30)), 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2), bx + s * bl / 2, by, bz));
    const reg = V3(bx + bl / 2 + M(40), by, bz);
    g.add(at(rot(cyl(M(13), M(13), M(28), MAT.alloy(), 16), 0, 0, Math.PI / 2), reg.x - M(8), reg.y, reg.z));
    g.add(at(cyl(M(10), M(10), M(8), MAT.chrome(), 16), reg.x - M(8), reg.y + M(18), reg.z));
    for (const s of [-0.3, 0.3]) g.add(at(rot(torus(M(31), M(2.5), MAT.black(), 24), 0, Math.PI / 2, 0), bx + s * bl, by, bz));
    /* feed lines back along the flank to the gas-spring galleries at the back of each head */
    for (let b = 0; b < L.banks; b++){
      const [hy, hz] = pt(b, L.deckH + L.bore * 0.95, 0);
      g.add(braidedLine([V3(reg.x, reg.y + M(10), reg.z + M(10)),
                         V3(L.len / 2 + M(30), by + L.bore * 0.6, bz * 0.8),
                         V3(L.len / 2 + M(8), hy, hz)], M(3.5)));
    }
    ctx.add('pvrs', g);
  }

  /* ---------------- NASCAR shaft rockers ---------------- */
  if (has('rockershafts')){
    for (let b = 0; b < L.banks; b++){
      const u = bankUp(b);
      const w = V3(0, -u.z, u.y);                     // across the bank, in the YZ plane
      /* valve-tip line of this bank, from the valves the builder placed */
      let tipH = -Infinity, xs = [];
      const wv = [];
      for (let i = 0; i < e.cyl; i++){
        if (bankOf(i) !== b) continue;
        xs.push(ctx.cylPosition(e, i, L).x);
        for (let k = 0; k < (e.valvesPerCyl || 2); k++){
          const ex = extent(`valves.${i * (e.valvesPerCyl || 2) + k + 1}`, u);
          if (ex.pHi){ tipH = Math.max(tipH, ex.hi); wv.push(ex.pHi.dot(w)); }
        }
      }
      if (!xs.length || !isFinite(tipH)) continue;
      const wMid = wv.reduce((a, c) => a + c, 0) / wv.length;
      const g = group('rockershaft');
      const xa = Math.min(...xs) - L.bore * 0.55, xb = Math.max(...xs) + L.bore * 0.55;
      const P = (x, h, ww) => V3(x, u.y * h + w.y * ww, u.z * h + w.z * ww);
      for (const s of [-1, 1])                          // two shafts per head
        g.add(rod(P(xa, tipH + M(24), wMid + s * M(11)), P(xb, tipH + M(24), wMid + s * M(11)), M(7.5), MAT.steel(), 14));
      const nStand = xs.length + 1;
      for (let k = 0; k < nStand; k++){
        const x = xa + M(14) + (k / (nStand - 1)) * (xb - xa - M(28));
        const st = box(M(16), M(34), M(40), MAT.alloy());
        const c = P(x, tipH + M(14), wMid);
        st.quaternion.setFromUnitVectors(Yax, u); st.position.copy(c);
        g.add(st);
      }
      ctx.each('rockershafts', b, g);
    }
    ctx.flush('rockershafts');
  }

  /* ---------------- Top Fuel ---------------- */
  const blower = nodes.get('blower')?.[0];
  const bp = new THREE.Vector3();
  if (blower?.userData?.pulley){ blower.updateMatrixWorld(true); blower.userData.pulley.getWorldPosition(bp); }
  const bTopY = blower ? new THREE.Box3().setFromObject(blower).max.y : L.deckH * 1.2;
  const bCx = blower ? blower.position.x : 0;
  if (has('blowerdrive') && blower){
    const g = group('blowerdrive');
    const x = bp.x, rC = L.bore * 0.62, rB = L.bore * 0.6 * 0.30 + M(1);
    /* the drive pulley on the crank snout */
    g.add(at(rot(tubeMesh(rC, M(18), M(28), MAT.alloy(), 36), 0, 0, Math.PI / 2), x, 0, 0));
    g.add(at(rot(cyl(M(22), M(22), M(30), MAT.steel(), 16), 0, 0, Math.PI / 2), x + M(20), 0, 0));
    /* the cog belt round both pulleys: a flat band, extruded across */
    const c1 = { y:0, z:0, r:rC + M(1) }, c2 = { y:bp.y, z:bp.z, r:rB };
    const loopPts = (off) => {
      const dy = c2.y - c1.y, dz = c2.z - c1.z, D = Math.hypot(dy, dz), ang = Math.atan2(dz, dy);
      const beta = Math.asin((c1.r - c2.r) / D), pts = [];
      for (let k = 0; k <= 24; k++){ const a = ang + Math.PI / 2 - beta + (k / 24) * (Math.PI + 2 * beta);
        pts.push(new THREE.Vector2((c1.r + off) * Math.sin(a), (c1.r + off) * Math.cos(a))); }
      for (let k = 1; k < 12; k++){ const a = ang - Math.PI / 2 + beta + (k / 12) * (Math.PI - 2 * beta);
        pts.push(new THREE.Vector2(c2.z + (c2.r + off) * Math.sin(a), c2.y + (c2.r + off) * Math.cos(a))); }
      return pts;
    };
    const sh = new THREE.Shape(loopPts(M(5)));
    sh.holes.push(new THREE.Path(loopPts(0).reverse()));
    const bw = L.bore * 0.6 * 0.18 + M(4);
    const geo = new THREE.ExtrudeGeometry(sh, { depth:bw, bevelEnabled:false, curveSegments:4 });
    geo.rotateY(-Math.PI / 2); geo.translate(x + bw / 2, 0, 0);
    g.add(new THREE.Mesh(geo, MAT.black()));
    ctx.add('blowerdrive', g);
  }
  const hatAt = V3(bCx, bTopY, 0);
  if (has('injectorhat')){
    const g = group('hat');
    const hw = L.bore * 1.15, hl = L.len * 0.34, hh = L.bore * 1.05;
    g.add(at(roundBox(hl * 1.05, M(14), hw * 1.05, M(4), MAT.alloy()), hatAt.x, hatAt.y + M(7), 0));        // base flange
    g.add(at(roundBox(hl * 0.55, hh, hw, M(10), MAT.alloy()), hatAt.x + hl * 0.20, hatAt.y + M(14) + hh / 2, 0));   // body
    /* the scoop: an open box facing forward, with the butterflies inside */
    const sx0 = hatAt.x - hl * 0.55, sx1 = hatAt.x - hl * 0.05, sy = hatAt.y + M(14) + hh * 0.62, sH = hh * 0.62, wall = M(5);
    const sc = (sx0 + sx1) / 2, sl = sx1 - sx0;
    g.add(at(box(sl, wall, hw, MAT.alloy()), sc, sy + sH / 2, 0));
    g.add(at(box(sl, wall, hw, MAT.alloy()), sc, sy - sH / 2, 0));
    for (const s of [-1, 1]) g.add(at(box(sl, sH, wall, MAT.alloy()), sc, sy, s * (hw / 2 - wall / 2)));
    g.add(at(box(sl * 0.6, hh * 0.40, hw, MAT.alloy()), sc + sl * 0.2, hatAt.y + M(14) + hh * 0.20, 0));    // throat below the mouth
    for (let k = 0; k < 3; k++){                 // butterflies on one shaft
      const bf = box(M(3), sH * 0.80, hw / 3 - M(8), MAT.brass());
      bf.rotation.z = 0.35;
      g.add(at(bf, sx0 + sl * 0.45, sy, (k - 1) * hw / 3));
    }
    g.add(at(rot(cyl(M(3), M(3), hw + M(16), MAT.steel(), 8), Math.PI / 2, 0, 0), sx0 + sl * 0.45, sy, 0));
    /* nozzle fittings on the hat */
    for (let k = 0; k < 4; k++)
      for (const s of [-1, 1]) g.add(at(rot(hexPrism(M(9), M(8), MAT.brass()), Math.PI / 2, 0, 0), hatAt.x + hl * (0.02 + k * 0.08), hatAt.y + M(14) + hh * 0.35, s * (hw / 2 + M(4))));
    ctx.add('injectorhat', g);
  }
  const pumpAt = V3(frontX - L.bore * 0.9, L.deckH * 0.38, L.bore * 1.0);
  if (has('mechfuelpump')){
    const g = group('fpump');
    g.add(at(rot(cyl(M(32), M(32), M(80), MAT.alloy(), 22), 0, 0, Math.PI / 2), pumpAt.x, pumpAt.y, pumpAt.z));
    g.add(at(rot(cyl(M(36), M(36), M(10), MAT.alloyDark(), 22), 0, 0, Math.PI / 2), pumpAt.x + M(40), pumpAt.y, pumpAt.z));
    /* the drive from the cam gear through the timing cover */
    g.add(at(rot(hexPrism(M(14), frontX - pumpAt.x - M(40) + M(14), MAT.steel()), 0, 0, Math.PI / 2), (pumpAt.x + M(45) + frontX + M(14)) / 2, pumpAt.y, pumpAt.z));
    g.add(at(rot(cyl(M(10), M(10), M(20), MAT.anodised ? MAT.anodised() : MAT.red(), 12), Math.PI / 2, 0, 0), pumpAt.x - M(10), pumpAt.y + M(12), pumpAt.z + M(38)));
    ctx.add('mechfuelpump', g);
  }
  if (has('barrelvalve')){
    const g = group('barrel');
    const hw = L.bore * 1.15;
    const bv = V3(hatAt.x - L.len * 0.12, hatAt.y + M(26), hw / 2 + M(30));
    g.add(at(rot(cyl(M(17), M(17), M(64), MAT.alloy(), 18), 0, 0, Math.PI / 2), bv.x, bv.y, bv.z));
    g.add(at(rot(cyl(M(7), M(7), M(20), MAT.steel(), 10), Math.PI / 2, 0, 0), bv.x - M(26), bv.y, bv.z - M(16)));   // throttle arm boss
    g.add(rod(V3(bv.x - M(26), bv.y + M(4), bv.z - M(26)), V3(hatAt.x - L.len * 0.10, hatAt.y + L.bore * 0.75, hw / 2 + M(10)), M(2.5), MAT.steel(), 8));
    /* main jet & lean-out valve in the line */
    g.add(at(rot(hexPrism(M(14), M(18), MAT.brass()), 0, 0, Math.PI / 2), bv.x + M(46), bv.y, bv.z));
    g.add(at(cyl(M(11), M(11), M(28), MAT.alloyDark(), 14), bv.x + M(70), bv.y + M(6), bv.z));
    /* pump → barrel valve → hat nozzles */
    g.add(braidedLine([V3(pumpAt.x + M(10), pumpAt.y + M(30), pumpAt.z + M(4)),
                       V3(frontX + M(10), bTopY - M(10), pumpAt.z + M(30)),
                       V3(bv.x - M(36), bv.y, bv.z)], M(8)));
    g.add(braidedLine([V3(bv.x + M(84), bv.y + M(6), bv.z), V3(bv.x + M(110), bv.y + M(20), bv.z - M(10)),
                       V3(hatAt.x + L.len * 0.08, hatAt.y + L.bore * 0.5, hw / 2 + M(10))], M(6)));
    ctx.add('barrelvalve', g);
  }
  /* the second magneto stands beside the tree's one at the back of the vee */
  const magAt = V3(L.len * 0.46, L.banks >= 2 ? L.deckH * 0.95 : L.deckH + L.bore * 0.30, L.bore * 0.80);
  const towers = [];
  if (has('magneto2')){
    const g = group('mag2');
    const dR = L.bore * 0.34;
    g.add(at(cyl(dR * 0.72, dR * 0.72, L.bore * 0.72, MAT.alloyDark(), 20), magAt.x, magAt.y, magAt.z));
    g.add(at(lathe([[0, 0], [dR, M(4)], [dR, L.bore * 0.24], [dR * 0.62, L.bore * 0.34], [0, L.bore * 0.36]], MAT.red(), 22),
             magAt.x, magAt.y + L.bore * 0.36, magAt.z));
    for (let k = 0; k < e.cyl; k++){
      const a = (k / e.cyl) * TAU;
      const t = V3(magAt.x + Math.cos(a) * dR * 0.74, magAt.y + L.bore * 0.60, magAt.z + Math.sin(a) * dR * 0.74);
      g.add(at(cyl(dR * 0.18, dR * 0.20, L.bore * 0.18, MAT.black(), 10), t.x, t.y, t.z));
      towers.push(t);
    }
    ctx.add('magneto2', g);
  }
  if (has('magleads2') && towers.length){
    const order = ctx.firingOrder ? ctx.firingOrder(e) : Array.from({ length: e.cyl }, (_, k) => k + 1);
    for (let i = 0; i < e.cyl; i++){
      const k = Math.max(0, order.indexOf(i + 1));
      const t = towers[k % towers.length];
      const b = bankOf(i), u = bankUp(b);
      const ex = extent(`plugs.${i * 2 + 2}`, u);
      const end = ex.pHi ? ex.pHi.clone().addScaledVector(u, M(6)) : V3(ctx.cylPosition(e, i, L).x, L.deckH, 0);
      const g = group('lead');
      g.add(pipe([[t.x, t.y + M(8), t.z],
                  [(t.x + end.x) / 2, Math.max(t.y, end.y) + L.bore * 0.32, (t.z + end.z) / 2],
                  [end.x, end.y + M(16), end.z],
                  [end.x, end.y, end.z]], M(5.5), MAT.blue(), 8));
      g.add(along(lathe([[M(10), 0], [M(10), M(18)], [M(6), M(24)]], MAT.rubber(), 12), end.clone().addScaledVector(u, -M(4)), u));
      ctx.each('magleads2', i, g);
    }
    ctx.flush('magleads2');
  }
  if (has('burstpanel')){
    const g = group('burst');
    const zf = L.bore * 1.45 / 2;
    const inducY = bTopY - L.bore * 0.6 * 0.76 + L.bore * 0.10;
    g.add(at(box(L.len * 0.16, L.bore * 0.40, M(4), MAT.red()), L.len * 0.14, inducY, zf + M(2)));
    for (let k = 0; k < 6; k++){
      const a = (k / 6) * TAU;
      g.add(at(rot(hexPrism(M(8), M(4), MAT.plated()), Math.PI / 2, 0, 0), L.len * 0.14 + Math.cos(a) * L.len * 0.065, inducY + Math.sin(a) * L.bore * 0.15, zf + M(5)));
    }
    ctx.add('burstpanel', g);
  }
  if (has('blowerrestraint') && blower){
    const g = group('restraint');
    const bb = new THREE.Box3().setFromObject(blower);
    for (const dx of [-L.len * 0.24, L.len * 0.20]){
      const x = bCx + dx;
      /* over the case and down to an anchor on each head */
      const pts = [];
      const hz = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) * 0.80;
      for (let k = 0; k <= 12; k++){
        const t = -1 + 2 * k / 12;
        pts.push(V3(x, bb.max.y + M(3) - Math.pow(Math.abs(t), 3) * L.bore * 0.45, t * (hz + L.bore * 1.15)));
      }
      g.add(pipe(pts, M(4), MAT.black(), 6));
      for (const s of [-1, 1]){
        const end = pts[s < 0 ? 0 : pts.length - 1];
        g.add(at(box(M(26), M(10), M(20), MAT.steel()), end.x, end.y - M(4), end.z));
      }
    }
    ctx.add('blowerrestraint', g);
  }

  /* ---------------- rally anti-lag, restrictor, spray ---------------- */
  const tb0 = (ctx.turbos || [])[0];
  if (has('restrictor') && tb0){
    const ax = new THREE.Vector3().subVectors(tb0.coldIn, tb0.hotOut).normalize();
    const g = group('restrictor');
    const d = (e.restrictor || 34) / 2;
    const ring = lathe([[M(d), 0], [M(d + 16), 0], [M(d + 16), M(8)], [M(d + 6), M(10)], [M(d + 6), M(38)], [M(d), M(38)]], MAT.anodised ? MAT.anodised() : MAT.red(), 32);
    g.add(along(ring, tb0.coldIn.clone().addScaledVector(ax, -M(2)), ax));
    ctx.add('restrictor', g);
  }
  if (has('alsvalve') && tb0){
    const g = group('als');
    const plenumZ = -L.bore * 0.95;
    const inducY = L.deckH + L.bore * 1.95;
    const start = V3(-L.len * 0.20, inducY + L.bore * 0.30, plenumZ + L.bore * 0.10);
    const valve = V3(-L.len * 0.22, L.deckH + L.bore * 2.45, -L.bore * 0.05);
    const end = V3(tb0.hotIn.x - L.bore * 0.85, tb0.hotIn.y + L.bore * 0.05, tb0.hotIn.z - L.bore * 0.30);
    g.add(at(rot(cyl(M(20), M(20), M(56), MAT.alloyDark(), 18), 0, 0, Math.PI / 2), valve.x, valve.y, valve.z));
    g.add(at(cyl(M(14), M(14), M(30), MAT.black(), 14), valve.x, valve.y + M(28), valve.z));     // solenoid
    g.add(pipe([start, V3(start.x, valve.y, start.z + M(20)), V3(valve.x - M(28), valve.y, valve.z)], M(11), MAT.stainless ? MAT.stainless() : MAT.steel(), 10));
    g.add(pipe([V3(valve.x + M(28), valve.y, valve.z), V3(valve.x + M(60), valve.y - M(10), valve.z + L.bore * 0.6),
                V3(end.x, end.y + L.bore * 0.6, end.z), end], M(11), MAT.hot(), 10));
    /* the check valve that stops exhaust coming back up the pipe */
    g.add(at(rot(cyl(M(15), M(15), M(30), MAT.brass(), 14), 0, 0, Math.PI / 2), valve.x + M(46), valve.y - M(4), valve.z + L.bore * 0.3));
    ctx.add('alsvalve', g);
  }
  if (has('icspray')){
    const g = group('spray');
    const icX = frontX - L.bore * 4.60, icY = L.crankR * 0.10, w = L.bore * 3.60, h = L.bore * 1.05;
    const bx = icX - M(38) - M(34), by = icY + h / 2 + M(12);
    g.add(at(rot(cyl(M(5), M(5), w * 0.86, MAT.brass(), 10), Math.PI / 2, 0, 0), bx, by, 0));
    for (let k = 0; k < 4; k++){
      const z = (k / 3 - 0.5) * w * 0.78;
      const nz = rot(lathe([[0, 0], [M(5), 0], [M(5), M(8)], [M(3), M(16)], [M(2), M(18)]], MAT.brass(), 12), 0, 0, -2.2);
      g.add(at(nz, bx + M(3), by - M(2), z));
    }
    g.add(pipe([[bx, by, w * 0.43], [bx - M(20), by + M(20), w * 0.50], [bx - M(30), icY - h * 0.6, w * 0.52]], M(4), MAT.black(), 6));
    ctx.add('icspray', g);
  }

  /* ---------------- Cosworth DFV ---------------- */
  if (has('geartrain')){
    for (let b = 0; b < L.banks; b++){
      const [gy, gz] = pt(b, L.deckH * 0.88, 0);
      const x = -L.len / 2 - M(8);              // between the block face and the cam-drive plane
      const g = group('compound');
      g.add(at(rot(tubeMesh(M(31), M(9), M(3.5), MAT.steel(), 34), 0, 0, Math.PI / 2), x - M(1.5), gy, gz));
      g.add(at(rot(tubeMesh(M(20), M(9), M(3), MAT.steel(), 26), 0, 0, Math.PI / 2), x + M(1.8), gy, gz));
      /* teeth, as a fine ring of bumps on the big gear */
      for (let k = 0; k < 36; k++){
        const a = (k / 36) * TAU;
        g.add(at(box(M(3.5), M(3), M(3), MAT.steel()), x - M(1.5), gy + Math.sin(a) * M(32), gz + Math.cos(a) * M(32)));
      }
      /* the twelve torsion bars in the hub */
      for (let k = 0; k < 12; k++){
        const a = (k / 12) * TAU;
        g.add(at(rot(cyl(M(1.6), M(1.6), M(6.5), MAT.plated(), 6), 0, 0, Math.PI / 2), x, gy + Math.sin(a) * M(14), gz + Math.cos(a) * M(14)));
      }
      ctx.each('geartrain', b, g);
    }
    ctx.flush('geartrain');
  }
  if (has('slidethrottles')){
    const topY = L.deckH + L.bore * 1.62;
    for (let b = 0; b < L.banks; b++){
      const xs = [];
      let zEnd = 0;
      for (let i = 0; i < e.cyl; i++){
        if (bankOf(i) !== b) continue;
        xs.push(ctx.cylPosition(e, i, L).x);
        const [, pz] = pt(b, L.deckH + L.bore * 0.34, ctx.inSide(b) * L.bore * 0.70);
        zEnd = pz * 0.55;
      }
      if (!xs.length) continue;
      const g = group('slide');
      const xa = Math.min(...xs) - M(30), xb = Math.max(...xs) + M(30);
      const yH = topY - M(9);
      /* the housing the plate slides in, with a bore for each trumpet */
      const sh = new THREE.Shape();
      sh.moveTo(xa, zEnd - M(32)); sh.lineTo(xb, zEnd - M(32)); sh.lineTo(xb, zEnd + M(32)); sh.lineTo(xa, zEnd + M(32)); sh.closePath();
      for (const x of xs){ const hp = new THREE.Path(); hp.absarc(x, zEnd, M(20), 0, TAU, true); sh.holes.push(hp); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth:M(12), bevelEnabled:false, curveSegments:16 });
      geo.rotateX(Math.PI / 2); geo.translate(0, yH + M(6), 0);          // shape (x, z), thickness down Y
      g.add(new THREE.Mesh(geo, MAT.alloyDark()));
      /* the plate itself, poking out of the front end where the linkage pulls it */
      g.add(at(box(M(46), M(3), M(52), MAT.steel()), xa - M(18), yH, zEnd));
      /* ball / roller supports along the sides */
      for (let k = 0; k <= xs.length; k++)
        for (const s of [-1, 1])
          g.add(at(rot(cyl(M(4), M(4), M(8), MAT.bearing(), 10), Math.PI / 2, 0, 0), xa + M(8) + k * (xb - xa - M(16)) / xs.length, yH, zEnd + s * M(36)));
      /* linkage rod across to the throttle cross-shaft */
      g.add(rod(V3(xa - M(40), yH, zEnd), V3(xa - M(40), yH + M(6), 0), M(3), MAT.steel(), 8));
      ctx.each('slidethrottles', b, g);
    }
    ctx.flush('slidethrottles');
  }
  if (has('meteringunit')){
    const g = group('metering');
    const mx = -L.len / 2 + L.bore * 1.25, my = L.deckH + L.bore * 0.08, ml = M(90);
    g.add(at(rot(cyl(M(26), M(26), ml, MAT.alloy(), 22), 0, 0, Math.PI / 2), mx, my, 0));
    g.add(at(rot(cyl(M(30), M(30), M(14), MAT.alloyDark(), 22), 0, 0, Math.PI / 2), mx - ml / 2 - M(4), my, 0));
    g.add(at(rot(cyl(M(10), M(10), M(12), MAT.steel(), 12), 0, 0, Math.PI / 2), mx - ml / 2 - M(17), my, 0));   // drive coupling
    /* the throttle-linked metering cam lever on top */
    g.add(at(box(M(10), M(26), M(6), MAT.steel()), mx + M(20), my + M(36), 0));
    /* one line per cylinder, from the head of the unit to its injector */
    for (let i = 0; i < e.cyl; i++){
      const b = bankOf(i), p = ctx.cylPosition(e, i, L);
      const [ry, rz] = ctx.railAt ? ctx.railAt(b) : pt(b, L.deckH + L.bore * 0.5, 0);
      const a = (i / e.cyl) * TAU;
      const o = V3(mx + ml / 2 + M(4), my + Math.sin(a) * M(16), Math.cos(a) * M(16));
      g.add(at(rot(hexPrism(M(7), M(6), MAT.brass()), 0, 0, Math.PI / 2), o.x, o.y, o.z));
      g.add(pipe([o, V3(o.x + M(20), o.y + M(4), o.z * 1.6), V3(p.x, ry + M(14), rz * 0.6), V3(p.x, ry + M(4), rz)], M(2.2), MAT.steel(), 6));
    }
    ctx.add('meteringunit', g);
  }

  /* a domed end cap for the air bottle */
  function sphereCap(r){
    return lathe([[0, r * 0.45], [r * 0.6, r * 0.36], [r * 0.9, r * 0.18], [r, 0]], MAT.black(), 20);
  }
}
