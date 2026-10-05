/* diesel — geometry for the parts declared in js/data/extra/diesel.js.
 *
 * Everything is placed in the same frame the core builder uses: crank along X
 * (front at −X), Y up, Z across. A point on a head is written in that bank's
 * own frame — a height up the bank axis and a stand-off across it — and turned
 * into scene coordinates with portAt(). In the bank frame, `inSide(b) * z` is
 * the intake face (the valley on a vee) and `-inSide(b) * z` the exhaust face.
 * Heights are taken off the same landmarks the core head uses: the deck
 * (L.deckH), the top of the head casting (deckH + 1.32·bore) and the cam/valve
 * cover (deckH + 1.34·bore up to + 1.68·bore).
 */
export function build(ctx){
  const { e } = ctx;
  if (e.fuel !== 'diesel') return;
  /* `tdi` is the Bosch common-rail four branch (EA288 and the D4EA share the
     rail, clamps, lines and return); `ea288` is what only the VW has */
  const cummins = e.id === 'd-i6-67', psd = e.id === 'd-v8-66', ea288 = e.id === 'd-i4-20', tdi = ea288 || e.id === 'hyundai-d4ea';
  if (!cummins && !psd && !tdi) return;

  const { L, M, MAT, has, add, each, flush, portAt, inSide, cylPosition, cylSlot,
          frontX, outerZ, wCase, turbos } = ctx;
  const { box, roundBox, cyl, tubeMesh, sphere, pipe, bolt, hexPrism, lathe, group, at, rot, V3, hoseRun } = ctx.geo;
  const B = L.bore, D = L.deckH;
  const hoseR = (pts, r, mat) => hoseRun ? hoseRun(pts, r, mat) : pipe(pts.map(p => p.isVector3 ? [p.x, p.y, p.z] : p), r, mat || MAT.rubber(), 10);
  /* a point in bank b's frame → a scene Vector3 */
  const P = (b, x, y, z) => { const [py, pz] = portAt(b, y, z); return V3(x, py, pz); };
  /* stand an object in bank b's frame (rotated with the bank) */
  const inBank = (b, obj, x, y, z) => {
    const g = group('bk'); obj.position.set(x, y, z); g.add(obj);
    g.rotation.x = L.bankAngles[b] || 0; return g;
  };
  const along = (obj) => rot(obj, 0, 0, Math.PI / 2);          // cylinder axis → X
  const across = (obj) => rot(obj, Math.PI / 2, 0, 0);         // cylinder axis → Z
  /* a cylinder from a to b (Vector3s) */
  const rod = (a, b, r, mat, seg = 10) => {
    const d = b.clone().sub(a), m = cyl(r, r, d.length(), mat, seg);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return m;
  };
  const bankOf = (i) => L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
  const I0 = inSide(0);                                       // intake side of an inline head (±1)
  const tb = turbos && turbos[0];

  /* ================================================================== */
  /* common-rail plumbing (Cummins, EA288)                               */
  /* ================================================================== */
  if (cummins || tdi){
    /* The rail. The core builder draws the diesel's fuel rail only as its
       feed line (the rail body is drawn on the petrol branch alone), so the
       body is added here to the existing 'fuelrail' part. It runs along the
       intake side of the head, below the plenum and just outboard of the
       inlet runners, with a short elbow at each end onto the points the core
       feed lines already end at. */
    const railY = D + B * 0.92, railZ = I0 * B * 1.32, oldZ = -B * 1.02;
    const rx0 = -L.len * 0.43, rx1 = L.len * 0.43, railR = B * (cummins ? 0.13 : 0.15);
    const portX = (i) => cylPosition(e, i, L).x + B * (cummins ? 0.30 : 0.36);
    if (has('fuelrail')){
      const rg = group('dieselrail');
      rg.add(at(along(cyl(railR, railR, rx1 - rx0, MAT.steel(), 18)), (rx0 + rx1) / 2, railY, railZ));
      for (const x of [rx0, rx1]) rg.add(at(along(hexPrism(railR * 2.0, M(10), MAT.steel())), x, railY, railZ));
      /* the outlet boss for each injection line, on top of the rail */
      for (let i = 0; i < e.cyl; i++)
        rg.add(at(hexPrism(M(15), M(12), MAT.plated()), portX(i), railY + railR + M(4), railZ));
      /* mounting feet to the head (Cummins: 4 × 10 mm hex, 24 N·m — INST step 24) */
      for (const k of [0.15, 0.38, 0.62, 0.85]){
        const x = rx0 + (rx1 - rx0) * k;
        rg.add(at(box(M(18), M(14), Math.abs(railZ) - B * 0.74, MAT.steel()), x, railY - railR * 0.4, (railZ + I0 * B * 0.74) / 2));
        rg.add(at(across(hexPrism(M(10), M(7), MAT.plated())), x, railY - railR * 0.4, railZ + I0 * (railR + M(3))));
      }
      /* elbows onto the core's feed line ends (front: pump line, rear: supply) */
      rg.add(pipe([[-L.len * 0.42, railY, railZ], [-L.len * 0.42, railY + M(6), (railZ + oldZ) / 2], [-L.len * 0.42, railY, oldZ]], M(4), MAT.steel(), 8));
      rg.add(pipe([[L.len * 0.42, railY, railZ], [L.len * 0.43, railY + M(6), (railZ + oldZ) / 2], [L.len * 0.44, railY, oldZ]], M(4), MAT.steel(), 8));
      add('fuelrail', rg);
    }
    /* rail pressure sensor on the firewall (rear) end, relief/regulator valve on the front */
    if (has('railsensor')){
      const s = group('railsensor');
      s.add(at(along(hexPrism(M(22), M(10), MAT.plated())), rx1 + M(9), railY, railZ));
      s.add(at(along(cyl(M(9), M(9), M(24), MAT.plated(), 12)), rx1 + M(26), railY, railZ));
      s.add(at(roundBox(M(22), M(18), M(18), .003, MAT.black()), rx1 + M(46), railY, railZ));
      add('railsensor', s);
    }
    if (has('railvalve')){
      const v = group('railvalve');
      if (tdi){
        /* hanging DOWN off the rail's rear end: the throttle flap body sits
           ahead of the front end at this height and the alternator under it */
        v.add(at(hexPrism(M(24), M(12), MAT.steel()), rx1 - M(4), railY - M(36), railZ));
        v.add(at(cyl(M(10), M(10), M(26), MAT.plated(), 12), rx1 - M(4), railY - M(60), railZ));
        v.add(at(roundBox(M(18), M(20), M(20), .003, MAT.black()), rx1 - M(4), railY - M(86), railZ));
      } else {
        v.add(at(along(hexPrism(M(24), M(12), MAT.steel())), rx0 - M(10), railY, railZ));
        v.add(at(along(cyl(M(10), M(10), M(26), MAT.steel(), 12)), rx0 - M(30), railY, railZ));
      }
      add('railvalve', v);
    }

    /* injector clamps */
    if (has('injclamps')){
      if (cummins){
        /* one clamp per injector, its bolt just behind the injector, above
           the rockers and crossheads (bank frame = scene frame on an inline) */
        for (let i = 0; i < e.cyl; i++){
          const x = cylPosition(e, i, L).x, g = group('clamp');
          g.add(at(roundBox(B * 0.42, B * 0.06, B * 0.16, .004, MAT.steel()), x + B * 0.14, D + B * 1.36, 0));
          g.add(at(tubeMesh(B * 0.11, B * 0.08, B * 0.26, MAT.steel(), 14), x, D + B * 1.23, 0));    // fork down onto the injector shoulder
          g.add(at(bolt(M(6), M(26), MAT.plated()), x + B * 0.30, D + B * 1.39, 0));
          each('injclamps', i, g);
        }
      } else {
        /* EA288: one forked piece between each pair of injectors, one bolt (SSP514 p.32) */
        for (let k = 0; k < Math.ceil(e.cyl / 2); k++){
          const xa = cylPosition(e, 2 * k, L).x, xb = cylPosition(e, Math.min(e.cyl - 1, 2 * k + 1), L).x;
          const xm = (xa + xb) / 2, g = group('clamp');
          g.add(at(roundBox(Math.abs(xb - xa) + B * 0.24, B * 0.07, B * 0.18, .004, MAT.steel()), xm, D + B * 1.36, 0));
          for (const x of [xa, xb]) g.add(at(tubeMesh(B * 0.12, B * 0.085, B * 0.26, MAT.steel(), 14), x, D + B * 1.23, 0));
          g.add(at(bolt(M(6), M(28), MAT.plated()), xm, D + B * 1.41, 0));
          each('injclamps', k, g);
        }
      }
      flush('injclamps');
    }

    /* Cummins quills: through the intake face of the head, nut on the outside */
    const quillY = D + B * 0.80, quillNutZ = I0 * B * 0.80;
    if (cummins && has('quills')){
      for (let i = 0; i < e.cyl; i++){
        const x = cylPosition(e, i, L).x, g = group('quill');
        g.add(rod(V3(portX(i), quillY, quillNutZ), V3(x + B * 0.02, quillY, I0 * B * 0.09), M(5), MAT.steel()));
        g.add(at(across(hexPrism(M(22), M(14), MAT.plated())), portX(i), quillY, I0 * (B * 0.75 + M(7))));
        each('quills', i, g);
      }
      flush('quills');
    }

    /* injection lines: rail outlet → over and down → quill nut (Cummins) or
       injector top (EA288). Offset along X so they clear the inlet runners. */
    if (has('injlines')){
      for (let i = 0; i < e.cyl; i++){
        const x = cylPosition(e, i, L).x, px = portX(i), top = railY + railR + M(10);
        const pts = cummins
          ? [[px, top, railZ], [px, top + B * 0.08, railZ - I0 * B * 0.12], [px, D + B * 0.98, I0 * B * 1.00],
             [px, quillY + B * 0.04, I0 * B * 0.90], [px, quillY, quillNutZ + I0 * M(14)]]
          : [[px, top, railZ], [px, D + B * 1.20, I0 * B * 1.10], [px, D + B * 1.18, I0 * B * 0.62],
             [x + B * 0.06, D + B * 1.16, I0 * B * 0.20], [x, D + B * 1.13, I0 * B * 0.05]];
        each('injlines', i, pipe(pts, M(3.2), MAT.steel(), 8));
      }
      flush('injlines');
    }

    /* injector return / drain */
    if (has('injreturn')){
      const g = group('injreturn');
      if (cummins){
        /* drain manifold along the intake face of the head, a banjo per cylinder,
           down into the return banjo on the rail and away to the tank at the rear */
        const dy = D + B * 1.17, dz = I0 * (B * 0.75 + M(6));
        g.add(at(along(cyl(M(3.5), M(3.5), L.len * 0.84, MAT.steel(), 8)), 0, dy, dz));
        for (let i = 0; i < e.cyl; i++)
          g.add(at(across(cyl(M(7), M(7), M(10), MAT.plated(), 10)), cylPosition(e, i, L).x - B * 0.22, dy, dz));
        const bx = -L.len * 0.36;
        g.add(at(across(hexPrism(M(17), M(12), MAT.plated())), bx, railY + railR + M(4), railZ));
        g.add(pipe([[-L.len * 0.42, dy, dz], [-L.len * 0.42, dy + M(10), (dz + railZ) / 2],
                    [bx, railY + railR + M(12), railZ]], M(3.5), MAT.steel(), 8));
        g.add(pipe([[bx, railY + railR + M(10), railZ], [bx + M(30), railY + B * 0.05, railZ + I0 * M(30)],
                    [0, D * 0.80, I0 * (outerZ + M(55))], [L.len * 0.50, D * 0.70, I0 * (outerZ + M(55))]],
                   M(4), MAT.rubber(), 8));
      } else {
        /* EA288: return along the top of the injectors and out to the intake side,
           pressure-retention valve at the rear, pulsation damper below it */
        const ry = D + B * 1.22;
        g.add(at(along(cyl(M(3), M(3), L.len * 0.80, MAT.plastic(), 8)), 0, ry, I0 * B * 0.20));
        for (let i = 0; i < e.cyl; i++){
          const x = cylPosition(e, i, L).x;
          g.add(pipe([[x, D + B * 1.12, I0 * B * 0.02], [x, ry, I0 * B * 0.20]], M(2.5), MAT.plastic(), 6));
        }
        const rvX = L.len * 0.44;
        g.add(pipe([[L.len * 0.40, ry, I0 * B * 0.20], [rvX, ry + M(8), I0 * B * 0.60], [rvX, D + B * 1.10, I0 * B * 1.05]], M(3), MAT.plastic(), 8));
        g.add(at(cyl(M(8), M(8), M(30), MAT.plastic(), 12), rvX, D + B * 1.10 - M(15), I0 * B * 1.05));     // retention valve
        const dmp = V3(rvX + M(10), D * 0.80, I0 * (outerZ + M(40)));
        g.add(pipe([[rvX, D + B * 1.10 - M(30), I0 * B * 1.05], [rvX + M(10), D * 0.95, I0 * (outerZ + M(30))], [dmp.x, dmp.y + M(28), dmp.z]], M(3), MAT.plastic(), 8));
        g.add(at(lathe([[0, -M(24)], [M(16), -M(20)], [M(19), 0], [M(16), M(20)], [0, M(24)]], MAT.black(), 16), dmp.x, dmp.y, dmp.z));
        g.add(pipe([[dmp.x, dmp.y - M(24), dmp.z], [L.len * 0.52, D * 0.55, dmp.z]], M(3), MAT.plastic(), 8));
      }
      add('injreturn', g);
    }

    /* VGT actuator on the turbo */
    if (has('vgtactuator') && tb){
      const s = tb.size, g = group('vgt');
      if (cummins){
        /* the electric actuator: a finned box on the bearing housing with its connector */
        const c = tb.pos.clone().add(V3(0, s * 0.80, -s * 0.06));
        g.add(at(roundBox(s * 0.62, s * 0.34, s * 0.44, .006, MAT.black()), c.x, c.y, c.z));
        for (let k = 0; k < 4; k++) g.add(at(box(s * 0.03, s * 0.08, s * 0.44, MAT.alloyDark()), c.x - s * 0.21 + k * s * 0.14, c.y + s * 0.20, c.z));
        g.add(at(roundBox(s * 0.20, s * 0.14, s * 0.16, .003, MAT.black()), c.x - s * 0.36, c.y + s * 0.04, c.z));
        g.add(rod(c.clone().add(V3(0, -s * 0.17, 0)), tb.pos.clone().add(V3(0, s * 0.42, 0)), M(9), MAT.alloyDark()));
      } else {
        /* the vacuum unit: canister below the bearing housing, rod to the vane lever */
        const can = tb.pos.clone().add(V3(0, -s * 0.70, s * 0.40));
        g.add(at(across(lathe([[0, -M(10)], [M(16), -M(10)], [M(18), -M(3)], [M(18), M(6)], [M(13), M(11)], [0, M(11)]], MAT.steel(), 20)),
                 can.x, can.y, can.z));
        const lever = tb.pos.clone().add(V3(s * 0.45, -s * 0.55, s * 0.10));
        g.add(rod(can, lever, M(2.5), MAT.plated(), 8));
        g.add(at(box(M(6), M(16), M(6), MAT.steel()), lever.x, lever.y, lever.z));
        g.add(at(cyl(M(3), M(3), M(14), MAT.plastic(), 8), can.x, can.y + M(12), can.z + M(8)));   // vacuum nipple
      }
      add('vgtactuator', g);
    }
  }

  /* ================================================================== */
  /* Cummins 6.7                                                          */
  /* ================================================================== */
  if (cummins){
    /* The intake end: throttle valve (core) → horn → grid heater → plenum.
       Taken off the core's own plenum: front face at −0.40·len, throttle body
       60 mm long centred at −0.48·len, both at the plenum's height and offset. */
    const inducY = D + B * 1.95, plz = I0 * B * 0.95;
    const plFront = -L.len * 0.40, thrBack = -L.len * 0.48 + M(30);
    const heatT = M(8), hornX0 = thrBack, hornX1 = plFront - heatT;
    const hornX = (hornX0 + hornX1) / 2, hornW = Math.max(M(20), hornX1 - hornX0);
    const hornTop = inducY + B * 0.30;
    if (has('gridheater')){
      const g = group('grid');
      g.add(at(box(heatT, B * 0.56, B * 0.74, MAT.alloyDark()), plFront - heatT / 2, inducY, plz));
      for (let k = -2; k <= 2; k++)                                           // the element ribbon showing at the edge
        g.add(at(box(heatT * 1.15, M(2), B * 0.62, MAT.hot()), plFront - heatT / 2, inducY + k * B * 0.09, plz));
      const stud = V3(plFront - heatT / 2, inducY + B * 0.28, plz - I0 * B * 0.20);
      g.add(at(cyl(M(4), M(4), M(26), MAT.plated(), 10), stud.x, stud.y + M(13), stud.z));
      g.add(at(hexPrism(M(10), M(7), MAT.plated()), stud.x, stud.y + M(20), stud.z));
      g.add(pipe([[stud.x, stud.y + M(22), stud.z], [stud.x - M(40), stud.y + M(40), stud.z + I0 * M(30)],
                  [frontX - M(40), D + B * 1.40, I0 * B * 1.70]], M(6), MAT.red(), 10));
      add('gridheater', g);
    }
    if (has('intakehorn')){
      const g = group('horn');
      g.add(at(roundBox(hornW, B * 0.58, B * 0.66, .008, MAT.alloy()), hornX, inducY, plz));
      g.add(at(box(M(6), B * 0.64, B * 0.78, MAT.alloy()), hornX1 - M(3), inducY, plz));     // flange to the plenum
      g.add(at(roundBox(hornW * 0.8, B * 0.10, B * 0.40, .006, MAT.alloy()), hornX, inducY + B * 0.32, plz));  // EGR valve seat
      for (const dy of [-1, 0, 1]) for (const sz of [-1, 1])
        g.add(at(along(hexPrism(M(10), M(6), MAT.plated())), hornX1 - M(9), inducY + dy * B * 0.24, plz + sz * B * 0.33));
      add('intakehorn', g);
    }
    if (has('egrvalve')){
      const g = group('egrv');
      g.add(at(roundBox(B * 0.50, B * 0.26, B * 0.40, .008, MAT.alloyDark()), hornX - M(4), hornTop + B * 0.16, plz));
      g.add(at(cyl(B * 0.17, B * 0.17, B * 0.22, MAT.black(), 18), hornX - M(4), hornTop + B * 0.40, plz + I0 * B * 0.04));
      g.add(at(roundBox(M(22), M(16), M(28), .003, MAT.black()), hornX - M(4) - B * 0.24, hornTop + B * 0.40, plz));   // connector
      add('egrvalve', g);
    }
    /* EGR cooler along the exhaust side above the log manifold (INST · H/M) */
    const E = -I0, cy = D + B * 1.00, cz = E * B * 1.25, cR = B * 0.28;
    const cx0 = -L.len * 0.40, cx1 = L.len * 0.12;
    if (has('egrcooler')){
      const g = group('egrc');
      g.add(at(along(cyl(cR, cR, cx1 - cx0, MAT.steel(), 20)), (cx0 + cx1) / 2, cy, cz));
      for (const x of [cx0, cx1]) g.add(at(along(cyl(cR * 1.18, cR * 1.18, M(10), MAT.steel(), 20)), x, cy, cz));
      for (let k = 1; k < 6; k++) g.add(at(along(cyl(cR * 1.04, cR * 1.04, M(3), MAT.steel(), 20)), cx0 + (cx1 - cx0) * k / 6, cy, cz));
      /* hot gas in at the rear, off the log manifold, between cylinders 4 and 5 */
      const logY = D + B * 0.02, logZ = E * B * 1.20;
      const inX = (cylPosition(e, 3, L).x + cylPosition(e, 4, L).x) / 2;
      g.add(pipe([[inX, logY, logZ], [inX, logY + B * 0.40, logZ + E * B * 0.10], [cx1 + M(20), cy - B * 0.10, cz], [cx1 + M(5), cy, cz]],
                 B * 0.13, MAT.hot(), 10));
      /* coolant in and out, to the head */
      for (const [x, y] of [[cx0 + M(40), cy + cR], [cx1 - M(40), cy + cR]])
        g.add(hoseR([V3(x, y, cz), V3(x, y + M(20), cz - E * M(20)), V3(x, D + B * 1.10, E * (B * 0.75 + M(4)))], M(7)));
      add('egrcooler', g);
    }
    /* crossover tube: cooler outlet at the front → up and over the front of the
       valve cover → down onto the EGR valve on the horn */
    if (has('egrpipe')){
      const g = group('egrpipe');
      const coverTop = D + B * 1.68, over = coverTop + B * 0.50;
      const a = V3(cx0 - M(5), cy, cz), v = V3(hornX - M(4), hornTop + B * 0.29, plz);
      const pts = [a, V3(cx0 - B * 0.30, cy + B * 0.20, cz), V3(cx0 - B * 0.45, over, E * B * 0.70),
                   V3(cx0 - B * 0.45, over + B * 0.08, 0), V3((cx0 - B * 0.45 + v.x) / 2, over, plz * 0.75),
                   V3(v.x + B * 0.05, v.y + B * 0.45, v.z), V3(v.x, v.y + B * 0.24, v.z)];
      g.add(pipe(pts.map(p => [p.x, p.y, p.z]), B * 0.15, MAT.steel(), 12));
      g.add(at(tubeMesh(B * 0.19, B * 0.15, M(12), MAT.plated(), 16), pts[3].x, pts[3].y, pts[3].z));       // centre clamp
      g.add(at(rot(tubeMesh(B * 0.19, B * 0.15, M(12), MAT.plated(), 16), 0, 0, Math.PI / 2), a.x - M(8), a.y, a.z));
      /* EGR temperature sensor in the top of the tube */
      const sp = pts[2];
      g.add(at(cyl(M(5), M(5), M(30), MAT.plated(), 8), sp.x, sp.y + B * 0.18, sp.z));
      g.add(at(roundBox(M(18), M(14), M(20), .003, MAT.black()), sp.x, sp.y + B * 0.18 + M(20), sp.z));
      add('egrpipe', g);
    }
    /* valve crossheads: one across each same-type valve pair, under the rocker tip.
       The core seats a four-valve head's pairs across Z at ±(0.21 ± 0.095)·bore. */
    if (has('bridges')){
      for (let i = 0; i < e.cyl; i++){
        const x = cylPosition(e, i, L).x;
        for (const [k, sgn] of [[0, -1], [1, 1]]){
          const g = group('bridge');
          g.add(at(box(B * 0.09, B * 0.055, B * 0.30, MAT.steel()), x, D + B * 0.885, sgn * B * 0.21));
          g.add(at(cyl(B * 0.035, B * 0.035, B * 0.05, MAT.steel(), 10), x, D + B * 0.93, sgn * B * 0.21));   // rocker contact pad
          each('bridges', i * 2 + k, g);
        }
      }
      flush('bridges');
    }
    /* rocker housing: a spacer band between head and cover, connectors on the intake side,
       and the injector harness running inside it */
    if (has('rockerhousing')){
      const g = group('rkh');
      const y0 = D + B * 1.30, h = B * 0.09, len = L.len * 0.985, hw = B * 0.77, t = B * 0.07;
      for (const sz of [-1, 1]) g.add(at(box(len, h, t, MAT.alloyDark()), 0, y0 + h / 2, sz * (hw - t / 2)));
      for (const sx of [-1, 1]) g.add(at(box(t, h, hw * 2, MAT.alloyDark()), sx * (len / 2 - t / 2), y0 + h / 2, 0));
      for (const fx of [-0.22, 0.22]){
        const x = fx * L.len;
        g.add(at(roundBox(M(30), M(26), M(26), .003, MAT.black()), x, y0 + h / 2, I0 * (hw + M(12))));
        g.add(at(roundBox(M(22), M(18), M(10), .003, MAT.alloyDark()), x, y0 + h / 2, I0 * (hw + M(28))));
      }
      /* the harness inside: along the intake side, a lead to each injector */
      const hy = D + B * 1.22, hz = I0 * B * 0.48;
      g.add(at(along(cyl(M(5), M(5), L.len * 0.80, MAT.black(), 8)), 0, hy, hz));
      for (let i = 0; i < e.cyl; i++){
        const x = cylPosition(e, i, L).x;
        g.add(pipe([[x - B * 0.05, hy, hz], [x - B * 0.05, hy, I0 * B * 0.20], [x, D + B * 1.10, I0 * B * 0.09]], M(2.5), MAT.black(), 6));
      }
      for (const fx of [-0.22, 0.22]) g.add(pipe([[fx * L.len, hy, hz], [fx * L.len, y0 + h / 2, I0 * hw]], M(4), MAT.black(), 6));
      add('rockerhousing', g);
    }
    /* CCV filter housing on top of the valve cover, two vent lines off the side */
    if (has('ccv')){
      const g = group('ccv'), top = D + B * 1.68, x = -L.len * 0.16;
      g.add(at(cyl(B * 0.30, B * 0.32, B * 0.22, MAT.black(), 22), x, top + B * 0.11, 0));
      g.add(at(cyl(B * 0.33, B * 0.33, B * 0.05, MAT.black(), 22), x, top + B * 0.245, 0));
      g.add(at(roundBox(M(20), M(14), M(18), .003, MAT.black()), x + B * 0.36, top + B * 0.12, 0));     // heater connector
      /* outlet to the turbo inlet, over the exhaust side; drain back down the intake side */
      const out0 = V3(x, top + B * 0.30, 0);
      const tIn = tb ? tb.coldIn.clone() : V3(0, D, -I0 * B * 1.6);
      g.add(hoseR([out0, V3(x + B * 0.30, top + B * 0.55, -I0 * B * 0.60), V3((x + tIn.x) / 2, D + B * 1.55, -I0 * B * 1.75),
                   V3(tIn.x - B * 0.30, tIn.y + B * 0.40, tIn.z), tIn], M(8)));
      g.add(hoseR([V3(x - B * 0.20, top + B * 0.05, I0 * B * 0.25), V3(x - B * 0.25, top - B * 0.10, I0 * B * 0.85),
                   V3(x - B * 0.30, D + B * 0.50, I0 * (wCase + M(20))), V3(x - B * 0.30, D * 0.55, I0 * (wCase + M(6)))], M(7)));
      add('ccv', g);
    }
    /* engine-mounted fuel filter: canister on a cast head, intake side of the block */
    if (has('fuelfilter')){
      const g = group('ffilter'), x = -L.len * 0.22, z = I0 * (outerZ + M(90)), y = D * 0.82;
      g.add(at(roundBox(M(96), M(44), M(96), .01, MAT.alloyDark()), x, y + M(70), z));
      g.add(at(cyl(M(46), M(46), M(130), MAT.alloy(), 24), x, y - M(18), z));
      g.add(at(cyl(M(16), M(16), M(22), MAT.black(), 12), x, y - M(94), z));                // water-in-fuel sensor
      g.add(at(box(M(70), M(16), Math.abs(z) - wCase, MAT.alloyDark()), x, y + M(70), (z + I0 * wCase) / 2));   // bracket
      for (const dx of [-M(26), M(26)]) g.add(at(along(hexPrism(M(14), M(10), MAT.plated())), x + dx, y + M(96), z));
      add('fuelfilter', g);
    }
  }

  /* ================================================================== */
  /* Ford 7.3 Power Stroke (T444E)                                        */
  /* ================================================================== */
  if (psd){
    const vA = Math.abs(L.bankAngles[0] || Math.PI / 4);
    const yFloor = (B * 0.775) / Math.sin(vA);           // where the two cylinder-case walls meet in the vee
    const hx = -L.len / 2 + B * 0.45;                    // front of the valley, ahead of the first pushrods
    const hy = yFloor + B * 0.48, hR = B * 0.30;
    if (has('hpop')){
      const g = group('hpop');
      g.add(at(along(cyl(hR, hR, B * 0.62, MAT.alloyDark(), 22)), hx, hy, 0));
      g.add(at(along(gearDisc(hR * 1.25, M(10))), hx - B * 0.36, hy, 0));
      /* the reservoir above it */
      g.add(at(roundBox(B * 0.62, B * 0.32, B * 0.70, .01, MAT.alloyDark()), hx - B * 0.04, hy + hR + B * 0.17, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(at(hexPrism(M(10), M(6), MAT.plated()), hx - B * 0.04 + sx * B * 0.25, hy + hR + B * 0.35, sz * B * 0.28));
      add('hpop', g);
    }
    if (has('ipr')){
      const g = group('ipr');
      const base = V3(hx + B * 0.33, hy + B * 0.05, B * 0.12);
      g.add(at(along(hexPrism(M(26), M(10), MAT.plated())), base.x + M(5), base.y, base.z));
      g.add(at(along(cyl(M(13), M(13), M(42), MAT.steel(), 14)), base.x + M(31), base.y, base.z));
      g.add(at(roundBox(M(20), M(22), M(22), .003, MAT.black()), base.x + M(60), base.y, base.z));
      add('ipr', g);
    }
    if (has('icp')){
      const g = group('icp'), c = V3(hx - B * 0.24, hy + hR + B * 0.36, -B * 0.16);
      g.add(at(hexPrism(M(22), M(10), MAT.plated()), c.x, c.y, c.z));
      g.add(at(cyl(M(10), M(10), M(22), MAT.plated(), 12), c.x, c.y + M(15), c.z));
      g.add(at(roundBox(M(20), M(16), M(18), .003, MAT.black()), c.x, c.y + M(34), c.z));
      add('icp', g);
    }
    /* branch tubes: HPOP outlet → into the vee clear of the case wall → the head's oil rail */
    if (has('oilrails')){
      for (let b = 0; b < 2; b++){
        const s = inSide(b), x = hx - B * 0.06;
        const start = V3(x, hy + B * 0.05, -s * hR * 0.9);
        const mid = P(b, x - B * 0.02, D - B * 0.05, s * B * 1.20);
        const end = P(b, x - B * 0.04, D + B * 0.60, s * (B * 0.75 + M(8)));
        const g = group('oilrail');
        g.add(pipe([[start.x, start.y, start.z], [mid.x, mid.y, mid.z], [end.x, end.y, end.z]], M(6), MAT.steel(), 10));
        g.add(inBank(b, across(hexPrism(M(20), M(12), MAT.plated())), x - B * 0.04, D + B * 0.60, s * (B * 0.75 + M(4))));
        each('oilrails', b, g);
      }
      flush('oilrails');
    }
    /* injector hold-downs, in each head beside its injector */
    if (has('injclamps')){
      for (let i = 0; i < e.cyl; i++){
        const b = bankOf(i), x = cylPosition(e, i, L).x;
        const g = group('clamp');
        g.add(at(roundBox(B * 0.36, B * 0.06, B * 0.15, .004, MAT.steel()), x + B * 0.12, D + B * 1.36, 0));
        g.add(at(tubeMesh(B * 0.11, B * 0.08, B * 0.26, MAT.steel(), 14), x, D + B * 1.23, 0));
        g.add(at(bolt(M(6), M(26), MAT.plated()), x + B * 0.26, D + B * 1.39, 0));
        each('injclamps', i, inBank(b, g, 0, 0, 0));
      }
      flush('injclamps');
    }
    /* under-valve-cover harness: a loom inside each cover, a lead to each
       injector and glow plug, out through a connector in the cover gasket */
    if (has('uvch')){
      for (let b = 0; b < 2; b++){
        const s = inSide(b), g = group('uvch');
        const ly = D + B * 1.42, lz = -s * B * 0.40;
        g.add(at(along(cyl(M(5), M(5), L.len * 0.80, MAT.black(), 8)), 0, ly, lz));
        for (let i = 0; i < e.cyl; i++){
          if (bankOf(i) !== b) continue;
          const x = cylPosition(e, i, L).x;
          g.add(pipe([[x, ly, lz], [x, ly - B * 0.08, lz * 0.5], [x, D + B * 1.12, 0]], M(2.5), MAT.black(), 6));
          if (has('glow'))           /* the core seats the glow plug at bank-frame z −0.30·bore */
            g.add(pipe([[x + B * 0.10, ly, lz], [x + B * 0.10, D + B * 1.10, -B * 0.30], [x, D + B * 1.04, -B * 0.30]], M(2.5), MAT.black(), 6));
        }
        g.add(at(roundBox(M(34), M(14), M(24), .003, MAT.black()), 0, D + B * 1.345, -s * (B * 0.68 + M(10))));   // gasket connector
        g.add(pipe([[0, ly, lz], [0, ly - B * 0.04, -s * B * 0.62], [0, D + B * 1.345, -s * B * 0.68]], M(4), MAT.black(), 6));
        each('uvch', b, inBank(b, g, 0, 0, 0));
      }
      flush('uvch');
    }
    /* glow plug relay: top of the passenger (−Z, bank 0) valve cover */
    if (has('glowrelay')){
      const g = group('glowrelay');
      g.add(roundBox(B * 0.46, B * 0.24, B * 0.34, .006, MAT.black()));
      for (const sx of [-1, 1]){
        g.add(at(cyl(M(4), M(4), M(16), MAT.plated(), 8), sx * B * 0.14, B * 0.18, 0));
        g.add(at(hexPrism(M(10), M(6), MAT.plated()), sx * B * 0.14, B * 0.16, 0));
      }
      const bank = (L.bankAngles[0] || 0) < 0 ? 0 : 1;
      add('glowrelay', inBank(bank, g, L.len * 0.20, D + B * 1.68 + B * 0.12, 0));
      const cable = P(bank, L.len * 0.20 + B * 0.14, D + B * 1.68 + B * 0.30, 0);
      add('glowrelay', pipe([[cable.x, cable.y, cable.z], [L.len * 0.30, cable.y + B * 0.30, cable.z * 0.6],
                             [L.len * 0.42, cable.y + B * 0.10, cable.z * 0.4]], M(5), MAT.red(), 8));
    }
    /* the fuel bowl: on top of the valley, between the two MAP-sensor bosses */
    const inducY = D * Math.cos(vA) * 1.04 + B * 0.70, plTop = inducY + B * 0.36;
    if (has('fuelfilter')){
      const g = group('fuelbowl'), x = -L.len * 0.20;
      g.add(at(roundBox(B * 0.95, B * 0.22, B * 0.80, .01, MAT.alloyDark()), x, plTop + B * 0.11, 0));
      g.add(at(cyl(B * 0.36, B * 0.38, B * 0.85, MAT.alloyDark(), 24), x, plTop + B * 0.64, 0));
      g.add(at(cyl(B * 0.40, B * 0.40, B * 0.12, MAT.black(), 24), x, plTop + B * 1.12, 0));       // cap
      g.add(at(along(cyl(M(8), M(8), M(28), MAT.plated(), 10)), x + B * 0.48, plTop + B * 0.12, B * 0.22));  // drain valve
      g.add(at(roundBox(M(18), M(14), M(20), .003, MAT.black()), x - B * 0.40, plTop + B * 0.30, -B * 0.25));  // heater connector
      for (let b = 0; b < 2; b++){                             // supply out to each head's fuel gallery
        const s = inSide(b), end = P(b, x + B * 0.10, D + B * 0.95, s * (B * 0.75 + M(4)));
        g.add(pipe([[x, plTop + B * 0.12, -s * B * 0.35], [x + B * 0.05, plTop + B * 0.05, -s * B * 0.90], [end.x, end.y, end.z]], M(4), MAT.rubber(), 8));
      }
      add('fuelfilter', g);
    }
    /* turbo pedestal: at the rear of the valley, or under the turbo if the core
       has put the turbo up in the valley */
    const valleyTurbo = tb && Math.abs(tb.pos.z) < B * 1.2 && tb.pos.y > yFloor;
    const px = valleyTurbo ? tb.pos.x : L.len / 2 - B * 0.38;
    const pTop = valleyTurbo ? tb.pos.y - tb.size * 0.85 : plTop + B * 0.10;
    const pBot = yFloor + B * 0.32;          /* its foot sits over the lifter bores, not down among them */
    if (has('turbopedestal')){
      const g = group('pedestal'), h = Math.max(B * 0.4, pTop - pBot);
      g.add(at(lathe([[0, 0], [B * 0.42, 0], [B * 0.34, h * 0.35], [B * 0.30, h * 0.85], [B * 0.40, h], [0, h]], MAT.iron(), 6), px, pBot, 0));
      g.add(at(roundBox(B * 0.80, B * 0.08, B * 0.80, .006, MAT.iron()), px, pTop, 0));            // turbo mounting face
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(at(hexPrism(M(12), M(8), MAT.plated()), px + sx * B * 0.32, pTop + B * 0.05, sz * B * 0.32));
      /* up-pipes from each exhaust manifold's rear outlet to the pedestal's turbine inlet */
      for (let b = 0; b < 2; b++){
        const s = inSide(b), o = P(b, L.len / 2 - B * 0.30, D + B * 0.30, -s * (B * 0.75 + B * 0.30));
        /* round the back of the head, outboard, then up and in over the top — a
           straight run cut through the head */
        const back = P(b, L.len / 2 + B * 0.40, D + B * 1.00, -s * (B * 0.75 + B * 0.50));
        const up = P(b, L.len / 2 + B * 0.40, D + B * 1.90, -s * B * 0.30);
        g.add(pipe([[o.x, o.y, o.z], [back.x, back.y, back.z], [up.x, up.y, up.z], [px + B * 0.20, pTop - B * 0.18, s * -B * 0.30]], B * 0.14, MAT.hot(), 10));
      }
      add('turbopedestal', g);
    }
    if (has('ebpv')){
      const g = group('ebpv');
      /* the valve body is the first length of downpipe off the turbine's mouth, not inside the housing */
      const c = valleyTurbo ? tb.hotOut.clone().addScaledVector(tb.hotOut.clone().sub(tb.pos).normalize(), B * 0.32) : V3(px + B * 0.45, pTop + B * 0.20, 0);
      g.add(at(along(tubeMesh(B * 0.30, B * 0.24, B * 0.30, MAT.hot(), 22)), c.x, c.y, c.z));
      g.add(at(rot(cyl(B * 0.235, B * 0.235, M(2), MAT.steel(), 20), 0, 0.5, Math.PI / 2), c.x, c.y, c.z));   // butterfly
      g.add(at(box(M(6), B * 0.30, M(8), MAT.steel()), c.x, c.y + B * 0.28, c.z + B * 0.20));               // lever
      g.add(rod(V3(c.x, c.y + B * 0.40, c.z + B * 0.20), V3(px, pTop - B * 0.30, B * 0.30), M(3), MAT.plated()));
      add('ebpv', g);
    }
  }

  /* ================================================================== */
  /* VW EA288                                                             */
  /* ================================================================== */
  if (tdi){
    /* LP-EGR module beside the turbo: cooler, and the valve on the compressor-inlet side (V339 on the EA288) */
    if (tb && (has('egrcooler') || has('egrvalve'))){
      const s = tb.size, E = -I0;
      const c0 = V3(tb.pos.x + s * 1.10, tb.pos.y - s * 0.85, tb.pos.z + E * s * 0.10);
      const len = s * 2.4;
      if (has('egrcooler')){
        const g = group('lpegr');
        g.add(at(roundBox(len, s * 0.62, s * 0.70, .01, MAT.steel()), c0.x + len / 2, c0.y, c0.z));
        for (let k = 1; k < 5; k++) g.add(at(box(M(3), s * 0.66, s * 0.74, MAT.alloyDark()), c0.x + len * k / 5, c0.y, c0.z));
        /* exhaust in from the filter side (rear) */
        g.add(pipe([[c0.x + len, c0.y, c0.z], [c0.x + len + s * 0.4, c0.y + s * 0.2, c0.z], [c0.x + len + s * 0.7, tb.pos.y, tb.pos.z + E * s * 0.4]], s * 0.22, MAT.hot(), 10));
        for (const k of [0.2, 0.8])
          /* coolant hoses to the block flank BELOW the manifold log, not up through it */
          g.add(hoseR([V3(c0.x + len * k, c0.y + s * 0.31, c0.z - E * s * 0.25), V3(c0.x + len * k, c0.y + s * 0.30, c0.z - E * s * 0.55),
                       V3(c0.x + len * k, D - B * 0.45, E * (wCase + M(6)))], M(6)));
        add('egrcooler', g);
      }
      if (has('egrvalve')){
        const g = group('v339'), v = V3(c0.x - s * 0.20, c0.y, c0.z);
        g.add(at(roundBox(s * 0.40, s * 0.62, s * 0.62, .006, MAT.alloyDark()), v.x, v.y, v.z));
        g.add(at(cyl(s * 0.20, s * 0.20, s * 0.36, MAT.black(), 16), v.x, v.y - s * 0.45, v.z));
        const ci = tb.coldIn;
        g.add(pipe([[v.x - s * 0.20, v.y, v.z], [v.x - s * 0.55, v.y + s * 0.30, v.z], [ci.x, ci.y - s * 0.25, ci.z], [ci.x, ci.y, ci.z]], s * 0.18, MAT.steel(), 10));
        add('egrvalve', g);
      }
    }
    /* glow plug harness along the intake face, a lead to each plug; J179 on the block */
    if (has('glowharness')){
      const g = group('glowh'), hy = D + B * 1.26, hz = I0 * (B * 0.75 + M(4));
      g.add(at(along(cyl(M(4), M(4), L.len * 0.80, MAT.black(), 8)), 0, hy, hz));
      for (let i = 0; i < e.cyl; i++){
        const x = cylPosition(e, i, L).x + B * 0.28;
        g.add(pipe([[x, hy, hz], [x, hy - B * 0.06, I0 * B * 0.50], [x - B * 0.28, D + B * 1.04, I0 * B * 0.30]], M(2.5), MAT.black(), 6));
      }
      const j = V3(L.len * 0.18, D * 0.70, I0 * (outerZ + M(45)));
      g.add(at(roundBox(M(80), M(60), M(30), .006, MAT.alloyDark()), j.x, j.y, j.z));
      g.add(at(roundBox(M(30), M(22), M(20), .003, MAT.black()), j.x - M(48), j.y, j.z));
      g.add(at(box(M(60), M(8), Math.abs(j.z) - wCase, MAT.alloyDark()), j.x, j.y - M(30), (j.z + I0 * wCase) / 2));
      g.add(pipe([[L.len * 0.40, hy, hz], [L.len * 0.44, hy - B * 0.40, hz + I0 * M(20)], [j.x + M(42), j.y + M(10), j.z]], M(5), MAT.black(), 8));
      add('glowharness', g);
    }
    /* vacuum pump: on the back of the oil-pump housing in the crankcase,
       its line leaving through the block gallery on the side */
    if (has('vacpump')){
      const g = group('vacpump');
      const opX = frontX + M(40), opY = -L.crankR * 0.6, opZ = B * 0.5;
      g.add(at(along(cyl(M(30), M(30), M(26), MAT.alloyDark(), 22)), opX + M(48), opY, opZ - M(4)));
      g.add(at(along(cyl(M(33), M(33), M(5), MAT.alloy(), 22)), opX + M(63), opY, opZ - M(4)));      // pump cover
      const port = V3(opX + M(110), L.crankR * 0.15, wCase + M(4));
      g.add(at(across(cyl(M(9), M(9), M(16), MAT.plated(), 12)), port.x, port.y, port.z));
      g.add(hoseR([port.clone().add(V3(0, 0, M(8))), V3(port.x - M(40), D * 0.45, wCase + M(30)),
                   V3(frontX + M(10), D * 0.85, wCase + M(40))], M(6)));
      add('vacpump', g);
    }
  }

  /* a toothed drive gear disc (axis Y before rotation) */
  function gearDisc(r, w){
    const g = group('gear');
    g.add(cyl(r * 0.88, r * 0.88, w, MAT.steel(), 28));
    for (let k = 0; k < 24; k++){
      const a = (k / 24) * Math.PI * 2;
      g.add(at(rot(box(r * 0.14, w, r * 0.10, MAT.steel()), 0, -a, 0), Math.cos(a) * r * 0.94, 0, Math.sin(a) * r * 0.94));
    }
    return g;
  }
}
