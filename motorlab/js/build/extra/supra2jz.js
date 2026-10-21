/* supra2jz — geometry for the 2JZ-GTE parts declared in js/data/extra/supra2jz.js.
 * Only the `i6-30-legend` engine draws anything here. Everything is placed off
 * the same layout the main builder uses:
 *   - front of the engine is −X, and ctx.frontX is the timing-drive plane;
 *   - the exhaust and both turbos are on +Z (ctx.exSide(0));
 *   - the intake, plenum and fuel rail are on −Z (ctx.inSide(0));
 *   - ctx.turbos carries each turbo's position and port points
 *     (No.1 = front = turbos[0]).
 * Every piece stands on the face it bolts to, so taking the part away leaves
 * that face bare. */
import * as THREE from 'three';
import { sensorMesh } from '../../lib/geo.js';

export function build(ctx){
  const { e, L, M, MAT, has, add, each, flush, frontX, beltX, turbos } = ctx;
  if (!e || e.id !== 'i6-30-legend') return;
  const { box, roundBox, cyl, tubeMesh, pipe, bolt, hexPrism, lathe, group, at, rot, V3, hoseRun } = ctx.geo;

  /* ---- shared reference points, all from the main builder's layout ---- */
  const half   = L.len / 2;                       // block / head end faces at ±half
  const deck   = L.deckH;
  const headTop = deck + L.bore * 1.32;
  const caseZ  = L.bore * 0.92;                   // block flank
  const inZ    = ctx.inSide(0), exZ = ctx.exSide(0);
  const inducY = deck + L.bore * 1.95;            // plenum centre height
  const plenZ  = -L.bore * 0.95;                  // plenum centre across
  const thr    = V3(-L.len * 0.48, inducY, plenZ);  // throttle body centre
  const [railY, railZ] = ctx.railAt(0);
  const camY   = deck + L.bore * 1.00;
  const camZ   = L.bore * 0.34;
  const panY0  = -L.crankR * 1.9;                 // No.1 pan centre height
  const panBot = panY0 - L.crankR * 1.0 - M(0.5);  // bottom of the No.1 pan (oilPanMesh hangs ~1·crankR below its origin)
  const radX   = frontX - L.bore * 3.10;          // radiator core
  const radY   = deck * 0.58;
  const Y = V3(0, 1, 0);

  /* stand an object's +Y along a direction */
  const orient = (obj, dir) => { obj.quaternion.setFromUnitVectors(Y, dir.clone().normalize()); return obj; };
  /* a flat bar between two points — stays, brackets, straps */
  const bar = (a, b, w, t, mat) => {
    const d = b.clone().sub(a);
    const m = box(w, d.length(), t, mat);
    orient(m, d);
    m.position.copy(a).addScaledVector(d, 0.5);
    return m;
  };
  /* a bolt whose head faces along `dir` */
  const boltAt = (p, dir, r = M(4), h = M(12)) => { const b = bolt(r, h, MAT.steel()); orient(b, dir); b.position.copy(p); return b; };
  /* a flat flange ring facing along `dir` */
  const flange = (p, dir, rO, rI, t = M(4), mat = MAT.iron()) => {
    const f = tubeMesh(rO, rI, t, mat, 20); orient(f, dir); f.position.copy(p); return f;
  };
  /* a plate cut from a 2-D outline, extruded `t` along +X (used for plates that lie in the Y–Z plane) */
  const plateYZ = (shape, t, mat) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth:t, bevelEnabled:false, curveSegments:18 });
    g.rotateY(Math.PI / 2);                       // shape x→ −z, shape y→ y, extrude → +x
    return new THREE.Mesh(g, mat);
  };
  /* a plate cut from a 2-D outline lying in the X–Z plane, `t` thick upward */
  const plateXZ = (shape, t, mat) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth:t, bevelEnabled:false, curveSegments:18 });
    g.rotateX(Math.PI / 2);                       // shape x→ x, shape y→ −z, extrude → −y
    g.translate(0, t, 0);
    return new THREE.Mesh(g, mat);
  };
  const vsvBody = (h = M(30)) => {                // a vacuum switching valve: coil can, two nipples, plug
    const g = group('vsv');
    g.add(cyl(M(11), M(11), h, MAT.black(), 16));
    for (const dz of [-M(5), M(5)]) g.add(at(cyl(M(2.5), M(2.5), M(12), MAT.plated(), 8), 0, h / 2 + M(6), dz));
    g.add(at(box(M(14), M(12), M(10), MAT.plastic()), M(12), -h * 0.15, 0));
    return g;
  };

  /* ================================================================== */
  /* timing drive                                                        */
  /* ================================================================== */
  if (has('tbcover3')){
    /* the long top cover over the coils, notched where the oil filler cap
       comes up through it */
    const g = group('tbcover3');
    const x0 = -L.len * 0.45, x1 = L.len * 0.45, w = M(34);
    const capX = -L.len * 0.34, capZ = inZ * L.bore * 0.34, capR = M(26);
    /* outline in (x, z): plateXZ maps shape y straight onto world z. A hole
       that crosses the edge is not a valid shape, so the notch for the filler
       cap is cut by running the outline round it instead. */
    const ez = inZ * w;                           // the intake edge, where the cap sits
    const s2 = new THREE.Shape();
    s2.moveTo(x0, -ez); s2.lineTo(x1, -ez); s2.lineTo(x1, ez);
    s2.lineTo(capX + capR, ez);
    s2.absarc(capX, capZ, capR, 0, Math.PI, ez > 0);
    s2.lineTo(x0, ez); s2.closePath();
    const top = plateXZ(s2, M(7), MAT.plastic());
    top.position.y = headTop + L.bore * 0.75;     // just clear of the coil tops and the PCV valve
    g.add(top);
    /* front and rear skirts down onto the head covers */
    for (const sx of [x0, x1])
      g.add(at(box(M(6), M(26), w * 2, MAT.plastic()), sx, headTop + L.bore * 0.75 - M(12), 0));
    /* the raised centre panel and the ten 5 mm hex bolts round the edge */
    g.add(at(roundBox(L.len * 0.62, M(4), w * 1.1, M(1.5), MAT.plastic()), M(10), headTop + L.bore * 0.75 + M(9), 0));
    for (let k = 0; k < 5; k++)
      for (const sz of [-1, 1]){
        const bx = x0 + (x1 - x0) * (0.06 + k * 0.22);
        if (Math.abs(bx - capX) < capR + M(8) && sz === Math.sign(ez)) continue;
        g.add(at(cyl(M(5), M(5), M(4), MAT.steel(), 10), bx, headTop + L.bore * 0.75 + M(8), sz * (w - M(7))));
      }
    add('tbcover3', g);
  }

  if (has('tbcover4')){
    /* the rear plate on the head's front face, behind the cam pulleys, with a
       hole for each cam nose and the cam timing marks on its face */
    const g = group('tbcover4');
    const s = new THREE.Shape();
    const zH = L.bore * 0.80, y0 = deck - M(4), y1 = headTop + M(12), r = M(10);
    s.moveTo(-zH + r, y0); s.lineTo(zH - r, y0); s.quadraticCurveTo(zH, y0, zH, y0 + r);
    s.lineTo(zH, y1 - r); s.quadraticCurveTo(zH, y1, zH - r, y1);
    s.lineTo(-zH + r, y1); s.quadraticCurveTo(-zH, y1, -zH, y1 - r);
    s.lineTo(-zH, y0 + r); s.quadraticCurveTo(-zH, y0, -zH + r, y0);
    for (const sz of [-1, 1]){ const h = new THREE.Path(); h.absarc(sz * camZ, camY, M(27), 0, Math.PI * 2, true); s.holes.push(h); }
    const pl = plateYZ(s, M(2.5), MAT.steel());
    pl.position.x = frontX + M(9);          // behind the belt and the pulleys, in front of the cam seals
    g.add(pl);
    /* the timing marks the cam pulley marks line up with */
    for (const sz of [-1, 1])
      g.add(at(box(M(1.5), M(9), M(2.5), MAT.chrome()), frontX + M(8.2), camY + M(33), sz * camZ));
    for (const [yy, zz] of [[deck + M(8), -zH + M(8)], [deck + M(8), zH - M(8)], [headTop, -zH + M(8)], [headTop, zH - M(8)]])
      g.add(at(rot(hexPrism(M(8), M(2), MAT.steel()), 0, 0, Math.PI / 2), frontX + M(8), yy, zz));   // low flange heads: the belt runs right over them
    add('tbcover4', g);
  }

  if (has('tbguide')){
    /* dished washer on the crank nose, cup facing forward */
    const gd = lathe([[M(24), 0], [M(33), 0], [M(35), M(0.8)], [M(35.5), M(1.4)], [M(34), M(1.4)], [M(32), M(0.8)], [M(24), M(0.8)]],
                     MAT.steel(), 32);
    rot(gd, 0, 0, Math.PI / 2);                    // its +Y (the cup) now points to −X, the front
    add('tbguide', at(gd, frontX - M(7), 0, 0));    // right at the belt's front edge
  }

  if (has('tbplate')){
    const g = group('tbplate');
    const p = V3(frontX + M(4), -L.crankR * 0.80, L.crankR * 0.92);
    g.add(at(roundBox(M(2), M(20), M(30), M(4), MAT.steel()), p.x, p.y, p.z));
    g.add(boltAt(V3(p.x - M(2), p.y, p.z + M(6)), V3(-1, 0, 0), M(3), M(8)));
    add('tbplate', g);
  }

  /* ================================================================== */
  /* accessory drive (M/T tensioner damper)                              */
  /* ================================================================== */
  const brkAt = V3(beltX + M(10), deck * 0.62, L.bore * 0.72);   // ahead of the front cover face
  if (has('dbtbracket')){
    const g = group('dbtbracket');
    g.add(at(roundBox(M(8), M(46), M(30), M(4), MAT.steel()), brkAt.x, brkAt.y, brkAt.z));
    for (const dy of [-M(14), M(14)]) g.add(boltAt(V3(brkAt.x - M(5), brkAt.y + dy, brkAt.z + M(8)), V3(-1, 0, 0), M(3.5), M(8)));
    add('dbtbracket', g);
  }
  if (has('dbtdamper')){
    /* gas strut from the bracket up to the drive belt tensioner arm */
    const g = group('dbtdamper');
    const a = V3(brkAt.x - M(10), brkAt.y + M(16), brkAt.z - M(4));
    const b = V3(beltX + M(1), deck * 0.96 - M(18), M(16));
    const d = b.clone().sub(a), len = d.length();
    const body = cyl(M(9), M(9), len * 0.58, MAT.black(), 16);
    orient(body, d); body.position.copy(a).addScaledVector(d, 0.29);
    const rodm = cyl(M(4), M(4), len * 0.46, MAT.chrome(), 10);
    orient(rodm, d); rodm.position.copy(a).addScaledVector(d, 0.77);
    g.add(body, rodm);
    for (const p of [a, b]){ const eye = tubeMesh(M(7), M(3.5), M(6), MAT.steel(), 14); rot(eye, 0, 0, Math.PI / 2); eye.position.copy(p); g.add(eye); }
    add('dbtdamper', g);
  }

  /* ================================================================== */
  /* sequential turbo hardware                                           */
  /* ================================================================== */
  const T = turbos || [];
  const elbowY = T.length ? T[0].hotOut.y - M(60) : deck * 0.62;
  const elbowZ = T.length ? T[0].hotOut.z : L.bore * 1.2;
  if (T.length >= 2){
    if (has('turbelbow')){
      const g = group('turbelbow');
      const ends = [];
      for (const tb of T){
        const o = tb.hotOut;
        /* flange on the turbine outlet, then down and back toward the front pipe */
        g.add(flange(o.clone().add(V3(0, 0, -M(2))), V3(0, 0, -1), M(30), M(16), M(6)));
        const low = V3(o.x + M(30), elbowY, elbowZ);
        g.add(pipe([o.clone().add(V3(0, 0, -M(4))), V3(o.x + M(10), o.y - M(32), o.z - M(2)), low], M(20), MAT.iron(), 14));
        ends.push(low);
        for (let k = 0; k < 6; k++){
          const a = (k / 6) * Math.PI * 2;
          g.add(at(rot(hexPrism(M(9), M(5), MAT.steel()), Math.PI / 2, 0, 0),
                   o.x + Math.cos(a) * M(25), o.y + Math.sin(a) * M(25), o.z - M(7)));
        }
      }
      /* the common outlet joining both */
      g.add(pipe([ends[0], V3((ends[0].x + ends[1].x) / 2, elbowY - M(6), elbowZ), ends[1]], M(19), MAT.iron(), 14));
      add('turbelbow', g);
    }
    if (has('exmplate')){
      const g = group('exmplate');
      /* on top of the common outlet, beside the bypass pipe's flange */
      const cx = (T[0].hotOut.x + T[1].hotOut.x) / 2 - M(60);
      g.add(at(roundBox(M(110), M(3), M(50), M(8), MAT.plated()), cx, elbowY + M(19), elbowZ));
      for (const dx of [-M(44), M(44)]) g.add(boltAt(V3(cx + dx, elbowY + M(21), elbowZ), V3(0, 1, 0), M(3.5), M(6)));
      add('exmplate', g);
    }
    if (has('exbypasspipe')){
      /* from under the manifold log, down into the elbow — between the turbos */
      const g = group('exbypasspipe');
      const colY = deck + L.bore * 0.02, colZ = L.bore * 1.20;
      const a = V3(L.len * 0.07, colY - M(26), colZ + M(14));
      const b = V3(L.len * 0.10, elbowY + M(18), elbowZ + M(10));
      g.add(pipe([a, V3(L.len * 0.085, (a.y + b.y) / 2 - M(4), colZ + M(28)), b], M(13), MAT.hot(), 12));
      g.add(flange(a, V3(0, 1, 0), M(20), M(11), M(4)));
      g.add(flange(b, V3(0, -1, 0), M(20), M(11), M(4)));
      for (const p of [a, b]) for (const dx of [-M(14), M(14)])
        g.add(at(hexPrism(M(9), M(5), MAT.steel()), p.x + dx, p.y + (p === a ? -M(4) : M(4)), p.z));
      add('exbypasspipe', g);
    }
    T.forEach((tb, k) => {
      const s = k === 0 ? 1 : -1;                 // the face that looks at the other turbo
      if (has('bhplates')){
        const g = group('bhplate');
        const p = tb.pos.clone().add(V3(s * tb.size * 0.40, -tb.size * 0.10, 0));
        g.add(at(roundBox(M(26), M(24), M(3), M(5), MAT.alloy()), p.x, p.y, p.z));
        g.children[0].rotation.y = Math.PI / 2;
        for (const dy of [-M(8), M(8)]) g.add(boltAt(V3(p.x + s * M(2), p.y + dy, p.z), V3(s, 0, 0), M(2.5), M(6)));
        each('bhplates', k, g);
      }
      if (has('turbostays')){
        const g = group('turbostay');
        const a = tb.pos.clone().add(V3(M(32), -tb.size * 0.80, -M(20)));
        const b = V3(tb.pos.x + M(36), deck * 0.46, caseZ + M(3));
        g.add(bar(a, b, M(16), M(5), MAT.steel()));
        g.add(boltAt(a.clone().add(V3(0, 0, M(4))), V3(0, 0, 1), M(4), M(10)));
        g.add(boltAt(b.clone().add(V3(0, 0, M(4))), V3(0, 0, 1), M(4), M(10)));
        each('turbostays', k, g);
      }
      if (has('turbowater')){
        const g = group('turbowater');
        const a = tb.pos.clone().add(V3(-M(24), -M(14), 0));
        /* down the block side of the turbo to a union BELOW the outlet elbow's run (which is at deck·0.56) */
        const pts = [a, V3(a.x - M(44), tb.pos.y - tb.size * 0.95, tb.pos.z + M(18)), V3(a.x - M(10), deck * 0.40, caseZ + M(26))];
        g.add(pipe(pts, M(4.5), MAT.steel(), 10));
        g.add(at(roundBox(M(14), M(10), M(14), M(2), MAT.steel()), a.x, a.y, a.z));
        /* the turbo water hose on to the block-side bypass union */
        g.add(hoseRun([pts[2], V3(pts[2].x - M(6), deck * 0.34, caseZ + M(10)), V3(pts[2].x - M(10), deck * 0.32, caseZ + M(2))], M(6)));
        each('turbowater', k, g);
      }
    });
    flush('bhplates'); flush('turbostays'); flush('turbowater');

    if (has('airtube4')){
      /* the first length of the No.1 turbo's outlet, with the air bypass valve
         riding on it and its recirculation hose back to the inlet connector */
      const tb = T[0];
      const g = group('airtube4');
      const o = tb.coldOut;
      const down = V3(o.x - M(12), o.y - M(38), o.z - M(1));
      g.add(pipe([o, o.clone().lerp(down, 0.5).add(V3(-M(2), 0, 0)), down], tb.coldTube * 1.35, MAT.alloy(), 14));
      g.add(flange(o.clone().add(V3(M(2), 0, 0)), V3(1, 0, 0), tb.coldTube * 1.9, tb.coldTube, M(4), MAT.alloy()));
      const abv = V3(o.x - M(44), o.y + M(4), o.z + M(26));
      g.add(at(lathe([[0, -M(14)], [M(15), -M(14)], [M(16), -M(4)], [M(16), M(6)], [M(10), M(14)], [0, M(14)]], MAT.alloyDark(), 20), abv.x, abv.y, abv.z));
      g.add(pipe([down.clone().add(V3(-M(8), M(10), M(6))), V3(abv.x + M(4), abv.y - M(18), abv.z - M(6)), abv.clone().add(V3(0, -M(12), 0))], M(7), MAT.rubber(), 10));
      g.add(hoseRun([abv.clone().add(V3(0, M(14), 0)), V3(abv.x, abv.y + M(22), abv.z + M(18)), V3(abv.x, tb.coldIn.y, tb.coldIn.z + M(52))], M(6)));
      add('airtube4', g);
    }
    if (has('intairconn')){
      /* the cold inlet: one pipe from the air cleaner, split to both
         compressor inlets */
      const g = group('intairconn');
      const runZ = T[0].coldIn.z + M(58), runY = T[0].coldIn.y;
      const r = T[0].axialTube * 1.05;
      const xs = T.map(tb => tb.coldIn.x);
      for (const tb of T){
        const i0 = tb.coldIn.clone().add(V3(0, 0, M(12)));
        g.add(pipe([i0, V3(i0.x, runY, runZ - M(26)), V3(i0.x - M(26), runY, runZ)], r, MAT.rubber(), 12));
        g.add(flange(i0, V3(0, 0, 1), r * 1.25, r * 0.9, M(5), MAT.plated()));
      }
      g.add(pipe([V3(Math.max(...xs) - M(26), runY, runZ), V3(Math.min(...xs) - M(26), runY, runZ)], r * 1.1, MAT.alloyDark(), 14));
      g.add(pipe([V3(Math.min(...xs) - M(26), runY, runZ), V3(Math.min(...xs) - M(110), runY + M(12), runZ),
                  V3(frontX - M(30), runY + M(50), runZ - M(10)), V3(frontX - M(110), runY + M(70), runZ - M(30))],
                 r * 1.25, MAT.alloyDark(), 14));
      /* the PCV take-off from the No.2 head cover */
      g.add(at(rot(cyl(M(6), M(6), M(18), MAT.alloyDark(), 10), Math.PI / 2, 0, 0), Math.min(...xs) - M(70), runY + M(12), runZ - M(16)));
      add('intairconn', g);
    }
  }

  if (has('prestank')){
    /* low on the intake side, by the dipstick and the starter flange */
    const g = group('prestank');
    const c = V3(L.len * 0.22, L.crankR * 0.70, inZ * (caseZ + M(56)));   /* ahead of the starter solenoid */
    const can = cyl(M(22), M(22), M(72), MAT.black(), 20); rot(can, 0, 0, Math.PI / 2); at(can, c.x, c.y, c.z);
    g.add(can);
    for (const sx of [-1, 1]) g.add(at(rot(lathe([[0, 0], [M(22), 0], [M(18), M(6)], [0, M(8)]], MAT.black(), 20), 0, 0, -sx * Math.PI / 2), c.x + sx * M(36), c.y, c.z));
    g.add(at(box(M(36), M(5), M(36), MAT.steel()), c.x - M(8), c.y - M(18), inZ * (caseZ + M(28))));      // bracket arm to the block
    g.add(at(box(M(36), M(30), M(4), MAT.steel()), c.x - M(8), c.y - M(8), inZ * (caseZ + M(10))));
    for (const dx of [-M(10), M(10)]) g.add(boltAt(V3(c.x - M(8) + dx, c.y - M(8), inZ * (caseZ + M(13))), V3(0, 0, inZ), M(3.5), M(6)));
    const v = vsvBody(M(26)); at(v, c.x - M(14), c.y + M(36), c.z);       // the VSV for EVAP on the same bracket
    g.add(v);
    add('prestank', g);
  }

  /* ================================================================== */
  /* air intake chamber, throttle extras                                 */
  /* ================================================================== */
  const chW = L.bore * 0.70 + M(6), chH = L.bore * 0.46 + M(4), chL = L.len * 0.80 + M(12);
  if (has('intchamber')){
    /* a cast shell over the plenum, with its throttle flange, ribs and the
       bolts down onto the intake manifold */
    const g = group('intchamber');
    g.add(at(roundBox(chL, chH, chW, M(8), MAT.alloy()), 0, inducY, plenZ));
    g.add(at(roundBox(M(10), chH + M(16), chW + M(14), M(6), MAT.alloy()), -chL / 2 - M(4), inducY, plenZ));   // throttle body flange
    g.add(at(roundBox(M(8), chH + M(8), chW + M(6), M(4), MAT.alloy()), chL / 2 + M(2), inducY, plenZ));     // rear end
    for (const dy of [-M(10), 0, M(10)])
      g.add(at(box(chL * 0.92, M(3), M(4), MAT.alloy()), 0, inducY + dy, plenZ + inZ * (chW / 2 + M(1.5))));
    /* 5 bolts + 2 nuts along the lower outboard edge */
    for (let k = 0; k < 7; k++){
      const bx = -chL * 0.44 + k * chL * 0.88 / 6;
      g.add(at(hexPrism(M(11), M(6), MAT.steel()), bx, inducY - chH / 2 - M(1), plenZ + inZ * (chW / 2 - M(4))));
    }
    add('intchamber', g);
  }
  const stayDown = (x, top, w, t, mat) => {
    const a = V3(x, inducY - chH / 2, plenZ + inZ * (chW / 2 - M(2)));
    const b = V3(x, railY - M(6), inZ * (L.bore * 1.42));
    const c = V3(x, deck + M(14), inZ * (L.bore * 0.80));
    const d = V3(x, deck + M(6), inZ * (L.bore * 0.76));
    const g = group('stay');
    g.add(bar(a, b, w, t, mat), bar(b, c, w, t, mat), bar(c, d, w, t, mat));
    g.add(boltAt(a.clone().add(V3(0, -M(2), 0)), V3(0, -1, 0), M(3.5), M(8)));
    g.add(boltAt(d, V3(0, 0, inZ), M(4), M(8)));
    return g;
  };
  if (has('chamberstay')) add('chamberstay', stayDown(L.len * 0.135, 0, M(14), M(4), MAT.steel()));
  if (has('manifoldstay')) add('manifoldstay', stayDown(-L.len * 0.148, 0, M(20), M(6), MAT.alloyDark()));

  if (has('subthrottle')){
    /* the TRAC sub-throttle actuator on the outboard face of the throttle body */
    const g = group('subthrottle');
    g.add(at(roundBox(M(36), M(20), M(34), M(4), MAT.black()), thr.x, thr.y + M(52), thr.z));
    g.add(at(cyl(M(9), M(9), M(10), MAT.alloyDark(), 14), thr.x, thr.y + M(41), thr.z));
    g.add(at(box(M(14), M(10), M(12), MAT.plastic()), thr.x + M(14), thr.y + M(66), thr.z + M(8)));
    for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      g.add(at(cyl(M(2.5), M(2.5), M(3), MAT.steel(), 8), thr.x + dx * M(14), thr.y + M(63), thr.z + dy * M(13)));
    add('subthrottle', g);
  }
  if (has('subtps')){
    /* on the far end of the sub-throttle shaft, facing the engine */
    const g = group('subtps');
    g.add(at(rot(cyl(M(14), M(14), M(9), MAT.black(), 18), Math.PI / 2, 0, 0), thr.x, thr.y, thr.z - inZ * M(44)));
    g.add(at(box(M(12), M(10), M(8), MAT.plastic()), thr.x - M(16), thr.y + M(6), thr.z - inZ * M(44)));
    for (const dy of [-M(9), M(9)]) g.add(at(rot(cyl(M(2), M(2), M(3), MAT.steel(), 8), Math.PI / 2, 0, 0), thr.x + M(6), thr.y + dy, thr.z - inZ * M(49)));
    add('subtps', g);
  }
  if (has('iaccheck')){
    const g = group('iaccheck');
    const p = V3(-L.len * 0.27, inducY - chH / 2 - M(10), plenZ + inZ * M(24));
    g.add(at(rot(cyl(M(7), M(7), M(20), MAT.alloyDark(), 12), Math.PI / 2, 0, 0), p.x, p.y, p.z));
    g.add(at(rot(tubeMesh(M(9), M(6), M(2), MAT.copper ? MAT.copper() : MAT.plated(), 14), Math.PI / 2, 0, 0), p.x, p.y, p.z - inZ * M(11)));
    g.add(at(rot(cyl(M(4), M(4), M(12), MAT.plated(), 10), Math.PI / 2, 0, 0), p.x, p.y, p.z + inZ * M(15)));
    add('iaccheck', g);
  }

  /* ================================================================== */
  /* fuel: insulators, spacers, holders, pulsation damper                */
  /* ================================================================== */
  const injLine = (i) => {
    const x = ctx.cylPosition(e, i, L).x;
    const [py, pz] = ctx.portAt(0, deck + L.bore * 0.44, inZ * L.bore * 0.62);
    return { x, top:V3(x, railY, railZ), port:V3(x, py, pz) };
  };
  if (has('injinsulators')){
    for (let i = 0; i < e.cyl; i++){
      const { top, port } = injLine(i);
      const dir = port.clone().sub(top);
      for (const [k, f] of [[0, 0.30], [1, 0.86]]){
        const ring = tubeMesh(M(11), M(7.5), M(4), MAT.black(), 16);
        orient(ring, dir); ring.position.copy(top).lerp(port, f);
        each('injinsulators', i * 2 + k, ring);
      }
    }
    flush('injinsulators');
  }
  if (has('railspacers')){
    [-1, 1].forEach((sx, k) => {
      const x = sx * L.pitch * 2.0;
      const g = group('spacer');
      g.add(at(cyl(M(9), M(9), M(12), MAT.alloyDark(), 14), x, railY - M(19), railZ));
      g.add(bar(V3(x, railY - M(25), railZ), V3(x, deck + L.bore * 0.40, inZ * (L.bore * 0.75 + M(2))), M(14), M(5), MAT.alloyDark()));
      each('railspacers', k, g);
    });
    flush('railspacers');
  }
  if (has('injholders')){
    for (let k = 0; k < Math.floor(e.cyl / 2); k++){
      const a = injLine(k * 2), b = injLine(k * 2 + 1);
      const pa = a.top.clone().lerp(a.port, 0.40), pb = b.top.clone().lerp(b.port, 0.40);
      const g = group('holder');
      const mid = pa.clone().lerp(pb, 0.5);
      g.add(at(box(pb.x - pa.x + M(26), M(3), M(12), MAT.steel()), mid.x, mid.y + M(3), mid.z - inZ * M(2)));
      for (const p of [pa, pb]) g.add(at(box(M(10), M(8), M(10), MAT.steel()), p.x, p.y, p.z - inZ * M(1)));
      for (const dx of [-M(16), M(16)]) g.add(boltAt(V3(mid.x + dx, mid.y + M(5), mid.z - inZ * M(2)), V3(0, 1, 0), M(3), M(8)));
      each('injholders', k, g);
    }
    flush('injholders');
  }
  if (has('pulsedamper')){
    /* screwed into the lower fuel inlet union at the fuel pipe support, low on
       the block's intake side behind the starter */
    const g = group('pulsedamper');
    const p = V3(L.len * 0.26, -L.crankR * 0.62, inZ * (caseZ + M(16)));   /* ahead of the starter, which is on this flank */
    g.add(at(lathe([[0, 0], [M(13), 0], [M(13), M(16)], [M(9), M(22)], [0, M(22)]], MAT.plated(), 18), p.x, p.y - M(22), p.z));
    g.add(at(hexPrism(M(19), M(7), MAT.steel()), p.x, p.y - M(26), p.z));
    g.add(at(box(M(26), M(10), M(14), MAT.alloyDark()), p.x, p.y + M(4), p.z - inZ * M(6)));   // fuel pipe support boss
    add('pulsedamper', g);
  }

  /* ================================================================== */
  /* cooling                                                             */
  /* ================================================================== */
  const woAt = V3(-half + M(33), deck + M(36), inZ * (L.bore * 0.91 + M(13)));
  if (has('wateroutlet')){
    const g = group('wateroutlet');
    g.add(at(roundBox(M(26), M(30), M(26), M(5), MAT.alloy()), woAt.x, woAt.y, woAt.z));
    g.add(at(rot(tubeMesh(M(11), M(8), M(22), MAT.alloy(), 16), Math.PI / 2, 0, 0), woAt.x, woAt.y + M(2), woAt.z + inZ * M(22)));   // upper hose neck
    /* ECT sender gauge on top */
    g.add(at(hexPrism(M(13), M(5), MAT.plated()), woAt.x - M(6), woAt.y + M(18), woAt.z));
    g.add(at(cyl(M(5), M(5), M(10), MAT.plastic(), 10), woAt.x - M(6), woAt.y + M(25), woAt.z));
    for (const dx of [-M(9), M(9)]) g.add(boltAt(V3(woAt.x + dx, woAt.y - M(10), woAt.z + inZ * M(13)), V3(0, 0, inZ), M(3.5), M(6)));
    add('wateroutlet', g);
  }
  function torus(r, t, mat, seg){ return new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, seg), mat); }

  const pumpIn = V3(beltX + L.bore * 0.30, deck * 0.36, -L.bore * 0.82);
  if (has('waterinlet')){
    const g = group('waterinlet');
    const p = V3(pumpIn.x + M(10), deck * 0.31, inZ * (L.bore * 1.02));   // outboard of the lower timing cover and idler
    g.add(at(roundBox(M(30), M(22), M(26), M(5), MAT.alloy()), p.x, p.y, p.z));
    g.add(pipe([p.clone().add(V3(-M(2), M(4), -inZ * M(4))), pumpIn.clone().add(V3(M(2), -M(2), inZ * M(4))), pumpIn], M(10), MAT.alloy(), 12));
    for (const dz of [-M(12), M(12)]) g.add(boltAt(V3(p.x, p.y - M(12), p.z + dz), V3(0, -1, 0), M(3.5), M(6)));
    add('waterinlet', g);
  }
  if (has('wbypass')){
    /* No.1: water outlet down to the pump, on O-rings */
    /* (the model's pump sits ahead of the alternator, so the pipe drops from
       the outlet into the front corner of the block instead of all the way down) */
    each('wbypass', 0, pipe([V3(woAt.x - M(8), woAt.y - M(14), woAt.z - inZ * M(4)),
                             V3(-half + M(17), deck + M(4), inZ * L.bore * 0.84),
                             V3(-half + M(12), deck - M(3), inZ * L.bore * 0.68)], M(7), MAT.steel(), 10));
    /* No.2: along the intake flank of the block into the pump */
    each('wbypass', 1, (() => {
      const g = group('wbp2');
      const y = deck * 0.44, z = inZ * (caseZ + M(7));
      g.add(pipe([V3(-half - M(13), y - M(6), inZ * (L.bore * 0.93)), V3(-half + M(10), y, z), V3(-L.len * 0.08, y, z)], M(7), MAT.steel(), 10));
      g.add(at(box(M(20), M(16), M(4), MAT.steel()), -L.len * 0.30, y, z - inZ * M(6)));
      g.add(boltAt(V3(-L.len * 0.30, y, z + inZ * M(-4)), V3(0, 0, inZ), M(3), M(6)));
      g.add(hoseRun([V3(-L.len * 0.08, y, z), V3(-L.len * 0.02, y + M(10), z + inZ * M(6)), V3(L.len * 0.03, y + M(24), z + inZ * M(6))], M(7)));
      return g;
    })());
    /* No.3: with the No.2 air tube on the No.2 turbo, taking the heater hose */
    if (T.length >= 2){
      const tb = T[1];
      const a = tb.pos.clone().add(V3(-M(46), M(14), -M(9)));        // under the IACV, outboard of the manifold log
      each('wbypass', 2, (() => {
        const g = group('wbp3');
        g.add(pipe([a, V3(a.x - M(40), a.y + M(68), a.z - M(2)), V3(a.x - M(85), deck + L.bore * 0.90, exZ * L.bore * 1.28)], M(6.5), MAT.steel(), 10));
        g.add(at(roundBox(M(12), M(12), M(12), M(2), MAT.steel()), a.x, a.y, a.z));
        return g;
      })());
    } else {
      each('wbypass', 2, at(cyl(M(6), M(6), M(60), MAT.steel(), 10), 0, deck * 0.8, exZ * L.bore));
    }
    /* No.4: intake side under the plenum, feeding the IAC valve and the throttle body */
    each('wbypass', 3, (() => {
      const g = group('wbp4');
      const y = railY + M(25), z = inZ * (L.bore * 1.49);   // under the VSV bracket by the throttle
      g.add(pipe([V3(-L.len * 0.20, y, z), V3(-L.len * 0.485, y, z), V3(thr.x - M(15), y + M(7), thr.z + inZ * M(23)),
                  V3(thr.x - M(13), thr.y - M(42), thr.z + inZ * M(3))], M(6.5), MAT.steel(), 10));
      for (const x of [-L.len * 0.24, -L.len * 0.36]) g.add(at(box(M(10), M(18), M(4), MAT.steel()), x, y - M(10), z - inZ * M(4)));
      return g;
    })());
    flush('wbypass');
  }
  if (has('heaterunion')){
    /* pressed into the rear of the head, 48 mm proud */
    const g = group('heaterunion');
    const p = V3(half, deck + L.bore * 0.50, inZ * L.bore * 0.52);
    const t = cyl(M(9), M(9), M(48), MAT.steel(), 16); rot(t, 0, 0, Math.PI / 2); at(t, p.x + M(24), p.y, p.z);
    g.add(t);
    g.add(at(rot(torus(M(9.5), M(1.6), MAT.steel(), 16), 0, Math.PI / 2, 0), p.x + M(40), p.y, p.z));
    add('heaterunion', g);
  }
  if (has('efans')){
    /* two small electric fans on the No.1 fan shroud, in the upper corners
       clear of the coupling fan's disc */
    [-1, 1].forEach((sz, k) => {
      const g = group('efan');
      const c = V3(radX + M(68), radY + M(84), sz * M(150));
      const ring = tubeMesh(M(52), M(47), M(18), MAT.black(), 28); rot(ring, 0, 0, Math.PI / 2); at(ring, c.x, c.y, c.z); g.add(ring);
      for (let b = 0; b < 5; b++){
        const blade = box(M(3), M(40), M(16), MAT.black());
        const a = (b / 5) * Math.PI * 2;
        blade.position.set(c.x, c.y + Math.cos(a) * M(24), c.z + Math.sin(a) * M(24));
        blade.rotation.set(a, deg(28), 0);
        g.add(blade);
      }
      const motor = cyl(M(18), M(18), M(26), MAT.alloyDark(), 18); rot(motor, 0, 0, Math.PI / 2); at(motor, c.x + M(16), c.y, c.z); g.add(motor);
      for (let s = 0; s < 3; s++){
        const a = (s / 3) * Math.PI * 2 + 0.5;
        g.add(bar(V3(c.x + M(10), c.y + Math.cos(a) * M(18), c.z + Math.sin(a) * M(18)),
                  V3(c.x + M(2), c.y + Math.cos(a) * M(49), c.z + Math.sin(a) * M(49)), M(5), M(3), MAT.black()));
      }
      each('efans', k, g);
    });
    flush('efans');
  }
  function deg(d){ return d * Math.PI / 180; }
  if (has('ectswitch')){
    const g = group('ectswitch');
    const p = V3(radX + M(34), radY - M(110), -M(40));   /* in the radiator's lower tank, between the hoses, clear of the charge pipe */
    g.add(at(rot(hexPrism(M(22), M(8), MAT.plated()), 0, 0, Math.PI / 2), p.x, p.y, p.z));
    g.add(at(rot(cyl(M(9), M(9), M(16), MAT.black(), 14), 0, 0, Math.PI / 2), p.x + M(12), p.y, p.z));
    add('ectswitch', g);
  }

  /* ================================================================== */
  /* lubrication                                                         */
  /* ================================================================== */
  const pan2Y = panBot - M(16), pan2L = L.len * 0.66, pan2X = L.len * 0.06, pan2W = L.bore * 1.18;
  if (has('oilbaffle')){
    const g = group('oilbaffle');
    const s = new THREE.Shape();
    s.moveTo(-pan2L / 2, -pan2W / 2); s.lineTo(pan2L / 2, -pan2W / 2); s.lineTo(pan2L / 2, pan2W / 2); s.lineTo(-pan2L / 2, pan2W / 2); s.closePath();
    for (let k = 0; k < 7; k++){ const h = new THREE.Path(); h.absarc(-pan2L * 0.40 + k * pan2L * 0.133, 0, M(14), 0, Math.PI * 2, true); s.holes.push(h); }
    const pl = plateXZ(s, M(2), MAT.steel());
    pl.position.set(pan2X, panBot - M(2.5), 0);
    g.add(pl);
    for (let k = 0; k < 7; k++) g.add(at(cyl(M(5), M(5), M(3), MAT.steel(), 6), pan2X - pan2L * 0.45 + k * pan2L * 0.15, panBot - M(4), (k % 2 ? 1 : -1) * pan2W * 0.44));
    add('oilbaffle', g);
  }
  if (has('oilpan2')){
    const g = group('oilpan2');
    /* a pressed tray with a flange round it — open top, so it is drawn as a
       floor, four walls and a lip */
    const wallH = M(26), t = M(2.5);
    g.add(at(box(pan2L, t, pan2W, MAT.steel()), pan2X, pan2Y - wallH / 2, 0));
    for (const sz of [-1, 1]) g.add(at(box(pan2L, wallH, t, MAT.steel()), pan2X, pan2Y, sz * pan2W / 2));
    for (const sx of [-1, 1]) g.add(at(box(t, wallH, pan2W, MAT.steel()), pan2X + sx * pan2L / 2, pan2Y, 0));
    g.add(at(box(pan2L + M(14), M(3), pan2W + M(14), MAT.steel()), pan2X, pan2Y + wallH / 2 - M(1.5), 0));
    /* drain plug with its gasket */
    g.add(at(rot(hexPrism(M(17), M(8), MAT.steel()), 0, 0, 0), pan2X + pan2L * 0.38, pan2Y - wallH / 2 - M(5), pan2W * 0.22));
    for (let k = 0; k < 8; k++)
      for (const sz of [-1, 1]) g.add(at(cyl(M(4.5), M(4.5), M(3), MAT.steel(), 6), pan2X - pan2L * 0.46 + k * pan2L * 0.13, pan2Y + wallH / 2 - M(4.5), sz * (pan2W / 2 + M(4))));
    add('oilpan2', g);
  }
  if (has('oillevel')){
    const g = group('oillevel');
    const p = V3(pan2X + pan2L * 0.10, pan2Y, inZ * (pan2W / 2 + M(2)));
    g.add(at(roundBox(M(36), M(20), M(4), M(4), MAT.alloyDark()), p.x, p.y, p.z));
    g.add(at(box(M(14), M(12), M(12), MAT.plastic()), p.x, p.y, p.z + inZ * M(8)));
    for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) g.add(boltAt(V3(p.x + dx * M(13), p.y + dy * M(6), p.z + inZ * M(2)), V3(0, 0, inZ), M(2.2), M(5)));
    add('oillevel', g);
  }
  if (has('turbooilout') && T.length){
    /* one pipe along the exhaust flank of the pan, collecting both drains */
    const g = group('turbooilout');
    const drains = T.map(tb => V3(tb.oilOut.x - L.len * 0.06, -L.crankR * 1.42, tb.side * L.bore * 0.58));
    const y = panBot + M(14), z = exZ * (L.bore * 0.72);
    const xs = drains.map(d => d.x);
    g.add(pipe([V3(Math.min(...xs), y, z), V3(Math.max(...xs), y, z)], M(6), MAT.steel(), 10));
    for (const d of drains) g.add(pipe([V3(d.x, y, z), V3(d.x, (y + d.y) / 2, z), V3(d.x, d.y - M(6), d.z + exZ * M(6))], M(6), MAT.steel(), 10));
    const fx = (Math.min(...xs) + Math.max(...xs)) / 2;
    g.add(at(roundBox(M(30), M(16), M(4), M(4), MAT.steel()), fx, y, z - exZ * M(4)));
    for (const dx of [-M(10), M(10)]) g.add(at(rot(hexPrism(M(10), M(5), MAT.steel()), Math.PI / 2, 0, 0), fx + dx, y, z + exZ * M(1)));
    add('turbooilout', g);
  }
  if (has('oilfbracket')){
    /* the boss the filter spins onto, against the block */
    const g = group('oilfbracket');
    const c = V3(L.len * 0.20, -L.crankR * 0.90, 0);
    const ring = tubeMesh(M(58), M(44), M(12), MAT.alloy(), 28); rot(ring, Math.PI / 2, 0, 0); at(ring, c.x, c.y, exZ * (caseZ + M(6))); g.add(ring);
    add('oilfbracket', g);
  }

  /* ================================================================== */
  /* head ancillaries: EGR, hangers, cam sensor, knock sensor            */
  /* ================================================================== */
  const egrAt = V3(half + M(10), deck + L.bore * 0.35, exZ * L.bore * 0.33);   // below the No.2 cam sensor
  if (has('egrcooler')){
    const g = group('egrcooler');
    g.add(at(roundBox(M(18), M(54), M(58), M(5), MAT.alloy()), egrAt.x, egrAt.y, egrAt.z));
    for (let k = 0; k < 5; k++) g.add(at(box(M(4), M(48), M(3), MAT.alloy()), egrAt.x + M(10), egrAt.y, egrAt.z - M(22) + k * M(11)));
    for (let k = 0; k < 8; k++){
      const yy = egrAt.y + (k % 4 - 1.5) * M(15), zz = egrAt.z + (k < 4 ? -1 : 1) * M(25);
      g.add(boltAt(V3(egrAt.x + M(9), yy, zz), V3(1, 0, 0), M(2.5), M(6)));
    }
    add('egrcooler', g);
  }
  if (has('egrvalve')){
    const g = group('egrvalve');
    const v = V3(egrAt.x + M(44), egrAt.y + M(10), egrAt.z + M(12));
    g.add(at(lathe([[0, -M(16)], [M(18), -M(16)], [M(20), -M(4)], [M(20), M(6)], [M(13), M(14)], [0, M(14)]], MAT.alloyDark(), 20), v.x, v.y, v.z));
    g.add(at(cyl(M(4), M(4), M(10), MAT.plated(), 8), v.x, v.y + M(18), v.z));
    g.add(pipe([V3(egrAt.x + M(12), v.y, v.z), v.clone().add(V3(-M(18), 0, 0))], M(10), MAT.alloy(), 10));
    /* the EGR pipe over the back of the head into the chamber's rear end */
    g.add(pipe([v.clone().add(V3(0, M(14), 0)), V3(v.x - M(10), inducY + M(26), v.z - M(26)),
                V3(chL / 2 + M(36), inducY + M(30), plenZ + M(10)), V3(chL / 2 + M(8), inducY + M(6), plenZ)], M(8), MAT.steel(), 12));
    g.add(at(hexPrism(M(19), M(8), MAT.steel()), v.x, v.y + M(16), v.z));
    add('egrvalve', g);
  }
  if (has('vsvegr') || has('vsvfpc')){
    const brX = L.len * 0.29;
    const z = plenZ + inZ * (chW / 2 + M(19.5));
    [['vsvegr', brX - M(28)], ['vsvfpc', brX + M(28)]].forEach(([id, x]) => {
      if (!has(id)) return;
      const g = group(id);
      g.add(at(vsvBody(M(28)), x, inducY + M(10), z));
      g.add(at(box(M(40), M(30), M(3), MAT.steel()), x, inducY + M(2), plenZ + inZ * (chW / 2 + M(7))));
      g.add(bar(V3(x, inducY - M(10), plenZ + inZ * (chW / 2 + M(2))), V3(x, inducY - M(10), z), M(18), M(3), MAT.steel()));
      add(id, g);
    });
  }
  if (has('hangerfront')){
    const g = group('hangerfront');
    const s = new THREE.Shape();
    s.moveTo(-M(22), 0); s.lineTo(M(22), 0); s.lineTo(M(14), M(96)); s.absarc(0, M(96), M(16), 0, Math.PI, false); s.lineTo(-M(22), 0);
    const h = new THREE.Path(); h.absarc(0, M(96), M(8), 0, Math.PI * 2, true); s.holes.push(h);
    const geo = new THREE.ExtrudeGeometry(s, { depth:M(5), bevelEnabled:false, curveSegments:16 });
    const m = new THREE.Mesh(geo, MAT.steel());
    m.position.set(-half + M(34), headTop - M(18), exZ * (L.bore * 0.91));
    if (exZ < 0) m.rotation.y = Math.PI;
    g.add(m);
    for (const dx of [-M(11), M(11)]) g.add(boltAt(V3(-half + M(34) + dx, headTop - M(8), exZ * (L.bore * 0.91 + M(5))), V3(0, 0, exZ), M(4), M(8)));
    add('hangerfront', g);
  }
  /* No.1 (the core 'camsensor', valvetrain module) reads the intake cam at
     the rear of the head; No.2 sits beside it on the exhaust cam, same height */
  const cmpAt = V3(half + M(3), deck + L.bore * 0.86, exZ * camZ);
  if (has('camsensor2')){
    const g = group('camsensor2');
    g.add(at(roundBox(M(5), M(30), M(18), M(2), MAT.black()), cmpAt.x, cmpAt.y, cmpAt.z));                 // flange
    g.add(at(rot(cyl(M(9), M(9), M(24), MAT.black(), 14), 0, 0, Math.PI / 2), cmpAt.x - M(12), cmpAt.y, cmpAt.z));   // body, into the head
    g.add(at(box(M(18), M(14), M(16), MAT.plastic()), cmpAt.x + M(12), cmpAt.y + M(4), cmpAt.z));          // connector
    for (const dy of [-M(10), M(10)]) g.add(boltAt(V3(cmpAt.x + M(4), cmpAt.y + dy, cmpAt.z), V3(1, 0, 0), M(2.5), M(5)));
    add('camsensor2', g);
  }
  if (has('hangerrear')){
    const g = group('hangerrear');
    const s = new THREE.Shape();
    /* shape x is the plate's width across the engine, shape y is up */
    s.moveTo(-M(20), 0); s.lineTo(M(20), 0); s.lineTo(M(14), M(70)); s.absarc(0, M(70), M(15), 0, Math.PI, false); s.lineTo(-M(20), 0);
    const hole = new THREE.Path(); hole.absarc(0, M(70), M(8), 0, Math.PI * 2, true); s.holes.push(hole);
    const pl = plateYZ(s, M(5), MAT.steel());
    pl.position.set(half + M(1), cmpAt.y + M(16), 0);      // centred over both cam sensors
    g.add(pl);
    for (const dz of [-M(10), M(10)]) g.add(boltAt(V3(half + M(7), cmpAt.y + M(26), dz), V3(1, 0, 0), M(4), M(8)));
    /* the head ground strap under the same bolts */
    g.add(pipe([V3(half + M(8), cmpAt.y + M(24), inZ * M(14)), V3(half + M(40), cmpAt.y + M(34), inZ * (camZ + M(30))),
                V3(half + M(60), cmpAt.y + M(10), inZ * (camZ + M(70)))], M(4), MAT.copper ? MAT.copper() : MAT.plated(), 8));
    add('hangerrear', g);
  }
  if (has('knock2')){
    /* the second sensor, rear half of the block, intake flank */
    const m = sensorMesh('screw', L.bore * 0.34);
    m.quaternion.setFromUnitVectors(Y, V3(0, 0, inZ));
    m.position.set(L.len * 0.22, L.crankR * 1.15, inZ * (caseZ + M(5)));
    add('knock2', m);
  }
}
