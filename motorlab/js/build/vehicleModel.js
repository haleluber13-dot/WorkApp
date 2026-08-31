/* MotorLab — procedural 3D vehicle builder: chassis, subframes, suspension,
 * drivetrain, brakes, wheels, electrics and body, all derived from the spec
 * and tagged by part id so the same teardown UI works on a whole car. */
import * as THREE from 'three';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, group, tag, at, rot,
         boundsOf, deg, TAU, lathe, wheelMesh, brakeDisc, caliper, coreMesh } from '../lib/geo.js';
import { wheelRadius, weightDistribution } from '../data/vehicles.js';
import { modelFor, fitToLength } from '../lib/importModel.js';
import { partMesh } from '../lib/partModels.js';

const M = (mm) => mm / 1000;

export function buildVehicle(v, tree){
  return v.class === 'bike' ? buildBike(v, tree) : buildCar(v, tree);
}

/* ====================================================================== */
function buildCar(v, tree){
  const root = group('vehicle'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const modelled = modelFor('veh', v.id);
  /* A kart is all frame and wheels with nothing to hide them behind, so a
     model of one duplicates everything visibly. A car's generated wheels sit
     inside its arches, where they are still worth having. */
  const bare = modelled && v.class === 'kart';
  const has = (id) => !!tree.byId[id] && !(bare && DUPLICATED_BY_MODEL.has(id));
  const anim = { wheels:[], steer:[], susp:[], fans:[], corners:[] };

  const wb = M(v.wheelbase), tf = M(v.trackF) || M(1200), tr = M(v.trackR) || M(1200);
  const rF = wheelRadius(v, false), rR = wheelRadius(v, true);
  const len = M(v.lengthMm), wid = M(v.widthMm), hgt = M(v.heightMm);
  const axF = wb/2, axR = -wb/2;
  const floorY = Math.max(rF, rR) * 0.42;
  const kart = v.class === 'kart';
  const open = ['formula','dragster'].includes(v.id);

  /* ---- chassis ---- */
  const ch = group('chassis');
  if (v.chassis === 'ladder frame'){
    for (const s of [-1,1]) ch.add(at(box(len*0.82, M(160), M(90), MAT.iron()), 0, floorY, s*wid*0.28));
    for (let i = 0; i < 5; i++) ch.add(at(box(M(80), M(90), wid*0.56, MAT.iron()), (i-2)*len*0.17, floorY, 0));
  } else if (v.chassis.includes('tube') || v.chassis.includes('chromoly')){
    const nodesXY = [[len*0.42,floorY,0],[len*0.2,floorY+hgt*0.1,wid*0.3],[-len*0.1,floorY+hgt*0.25,wid*0.32],
                     [-len*0.35,floorY+hgt*0.1,wid*0.28],[-len*0.45,floorY,0]];
    for (const s of [-1,1]) ch.add(pipe(nodesXY.map(p=>[p[0],p[1],p[2]*s]), M(22), MAT.steel(), 6));
    for (let i=0;i<nodesXY.length;i++) ch.add(at(rot(cyl(M(20),M(20),wid*0.6,MAT.steel(),8),Math.PI/2,0,0), nodesXY[i][0], nodesXY[i][1], 0));
  } else if (v.chassis === 'carbon monocoque'){
    const tub = roundBox(len*0.42, hgt*0.42, wid*0.6, 0.06, MAT.carbon());
    ch.add(at(tub, len*0.02, floorY + hgt*0.16, 0));
  } else {
    ch.add(at(box(len*0.72, M(70), wid*0.78, MAT.underbody()), 0, floorY, 0));
    for (const s of [-1,1]) ch.add(at(box(len*0.72, M(150), M(110), MAT.alloyDark()), 0, floorY+M(60), s*wid*0.34));
    ch.add(at(box(M(90), hgt*0.34, wid*0.8, MAT.alloyDark()), len*0.12, floorY+hgt*0.2, 0)); // firewall
  }
  /* the flat undertray, which is what you actually see from below */
  if (!open) ch.add(at(box(len*0.80, M(14), wid*0.80, MAT.underbody()), 0, floorY - M(46), 0));
  add('chassis', ch);

  if (has('cage')){
    const cg = group('cage');
    const P = [[len*0.12,floorY,wid*0.36],[len*0.10,floorY+hgt*0.5,wid*0.34],[-len*0.12,floorY+hgt*0.52,wid*0.34],[-len*0.2,floorY,wid*0.36]];
    for (const s of [-1,1]) cg.add(pipe(P.map(p=>[p[0],p[1],p[2]*s]), M(21), MAT.steel(), 6));
    cg.add(at(rot(cyl(M(21),M(21),wid*0.68,MAT.steel(),8),Math.PI/2,0,0), len*0.10, floorY+hgt*0.5, 0));
    cg.add(at(rot(cyl(M(21),M(21),wid*0.68,MAT.steel(),8),Math.PI/2,0,0), -len*0.12, floorY+hgt*0.52, 0));
    cg.add(pipe([[len*0.10,floorY+hgt*0.5,-wid*0.34],[-len*0.12,floorY+hgt*0.52,wid*0.34]], M(18), MAT.steel(), 6));
    add('cage', cg);
  }

  /* ---- subframes ---- */
  if (has('subfront')){
    const sf = group('sf');
    sf.add(at(box(M(420), M(80), tf*0.86, MAT.alloyDark()), axF*0.72, floorY*0.72, 0));
    for (const s of [-1,1]) sf.add(at(box(M(360), M(70), M(70), MAT.alloyDark()), axF*0.72, floorY*0.72, s*tf*0.4));
    add('subfront', sf);
  }
  if (has('subrear')){
    const sr = group('sr');
    sr.add(at(box(M(380), M(80), tr*0.8, MAT.alloyDark()), axR*0.86, floorY*0.75, 0));
    add('subrear', sr);
  }
  if (has('mounts')) for (let i = 0; i < 3; i++)
    add('mounts', at(cyl(M(45), M(45), M(60), MAT.rubber(), 12), axF*(0.5 - i*0.15), floorY*1.15, (i%2?1:-1)*tf*0.24));

  /* ---- powertrain ---- */
  const bay = v.bay;
  let detailLamps = null;          // set by the body-detail pass, if there is a shell
  const engX = bay === 'mid' ? axR*0.45 : bay === 'rear' ? axR*1.2 : axF*0.62;
  const engY = floorY + M(230);
  if (has('engine')){
    const eg = group('eng');
    const transverse = bay.includes('transverse') || kart;
    const bw = transverse ? tf*0.62 : M(520), bd = transverse ? M(520) : tf*0.5;
    /* in the chassis view the engine is one part, so it can be a scan of a
       real one — the strip-down happens on the generated model in the Engine
       Bay, where every casting has to come apart */
    const scan = kart ? null : partMesh('engineI4', { fit: M(660), axis: transverse ? 'z' : 'x',
                                                      mat: MAT.alloy() });
    if (scan){
      eg.add(scan);
    } else {
      eg.add(roundBox(bw, M(420), bd, 0.03, MAT.alloy()));
      eg.add(at(roundBox(bw*0.92, M(120), bd*0.88, 0.02, MAT.alloyDark()), 0, M(280), 0));
    }
    add('engine', at(eg, engX, engY, 0));
  }
  if (has('gearbox')){
    const gb = group('gb');
    const transverse = bay.includes('transverse') || kart;
    /* a transverse car runs a transaxle, a longitudinal one a gearbox behind
       the engine — two different scans, because they are two different parts */
    const scan = transverse ? partMesh('gearbox', { fit: M(600), axis:'z', mat: MAT.alloyDark() })
                            : partMesh('transmission', { fit: M(760), axis:'x', mat: MAT.alloyDark() });
    if (scan) gb.add(scan);
    else gb.add(rot(cyl(M(180), M(140), M(560), MAT.alloyDark(), 16), 0, 0, Math.PI/2));
    add('gearbox', at(gb, transverse ? engX : engX - M(560), engY - M(60), transverse ? -tf*0.34 : 0));
  }
  if (has('transfer')) add('transfer', at(roundBox(M(260), M(220), M(220), .02, MAT.alloyDark()), engX - M(600), engY - M(140), tf*0.16));
  if (has('prop')) add('prop', at(rot(cyl(M(38), M(38), Math.abs(engX - axR) + M(400), MAT.steel(), 12), 0, 0, Math.PI/2),
        (engX + axR)/2, floorY*0.85, 0));
  if (has('diff')){
    const df = group('diff');
    df.add(sphere(M(150), MAT.alloyDark(), 16));
    df.add(at(rot(cyl(M(55), M(55), tr*0.7, MAT.steel(), 12), Math.PI/2, 0, 0), 0, 0, 0));
    add('diff', at(df, axR, floorY*0.95, 0));
  }
  if (has('axles')) for (const s of [-1,1])
    add('axles', at(rot(cyl(M(28), M(28), tr*0.42, MAT.steel(), 10), Math.PI/2, 0, 0), axR, floorY*0.95, s*tr*0.25));

  /* ---- suspension corners ---- */
  const corner = (end, side) => {
    const x = end === 'F' ? axF : axR;
    const track = end === 'F' ? tf : tr;
    const r = end === 'F' ? rF : rR;
    const sfx = end === 'F' ? 'f' : 'r';
    const z = side * track/2;
    const type = end === 'F' ? v.suspF : v.suspR;
    const inner = side * track*0.14, outer = z*0.86;
    const unsprung = [];                      // moves with the wheel, not the body

    /* ---- linkage, spring and damper (a kart has none of this) ---- */
    if (type !== 'none'){
      if (has('lca'+sfx)){
        const a = group('lca');
        a.add(pipe([[x - M(120), floorY*0.72, inner],[x, r*0.55, outer]], M(24), MAT.alloyDark(), 6));
        a.add(pipe([[x + M(140), floorY*0.72, inner],[x, r*0.55, outer]], M(24), MAT.alloyDark(), 6));
        add('lca'+sfx, a);
      }
      if (has('uca'+sfx)){
        const a = group('uca');
        a.add(pipe([[x - M(90), floorY + M(320), inner*1.4],[x, r*1.28, outer*0.94]], M(20), MAT.alloyDark(), 6));
        a.add(pipe([[x + M(110), floorY + M(320), inner*1.4],[x, r*1.28, outer*0.94]], M(20), MAT.alloyDark(), 6));
        add('uca'+sfx, a);
      }
      const dampId = has('strut'+sfx) ? 'strut'+sfx : 'damp'+sfx;
      if (has(dampId)){
        const d = group('damp');
        const top = has('strut'+sfx) ? floorY + M(620) : floorY + M(430);
        const bot = has('strut'+sfx) ? r*0.6 : r*1.15;
        const hlen = top - bot;
        d.add(at(cyl(M(26), M(26), hlen, MAT.steel(), 12), x, (top+bot)/2, outer*0.92));
        d.add(at(cyl(M(34), M(34), hlen*0.42, MAT.alloyDark(), 12), x, bot + hlen*0.21, outer*0.92));
        /* the coil spring, drawn as a real helix around the damper body */
        const pts = [];
        for (let i = 0; i <= 96; i++){
          const t = i/96, ang = t * TAU * 7;
          pts.push(new THREE.Vector3(x + Math.cos(ang)*M(58), bot + hlen*0.16 + t*hlen*0.70, outer*0.92 + Math.sin(ang)*M(58)));
        }
        d.add(pipe(pts, M(11), MAT.orange(), 6));
        add(dampId, d);
        anim.susp.push({ node:d, side, end });
      }
      if (has('arb'+sfx)){
        const b = group('arb');
        b.add(pipe([[x + (end==='F'?M(220):-M(220)), floorY*0.8, 0],
                    [x + (end==='F'?M(220):-M(220)), floorY*0.8, outer*0.6],
                    [x, r*0.7, outer*0.8]], M(14), MAT.steel(), 6));
        add('arb'+sfx, b);
      }
    }

    /* ---- upright, brakes and wheel: every corner has these ---- */
    if (has('upr'+sfx)){
      const u = group('upr');
      u.add(at(box(M(110), r*0.85, M(80), MAT.alloy()), x, r, outer));
      u.add(at(rot(cyl(M(45), M(45), M(70), MAT.steel(), 12), Math.PI/2, 0, 0), x, r, outer + side*M(30)));
      add('upr'+sfx, u); unsprung.push(u);
    } else if (type === 'none'){
      /* a stub axle: a kart calls it a spindle, a dragster just bolts it to the frame */
      const u = at(box(M(90), r*0.7, M(90), MAT.steel()), x, r, outer);
      add(has('spindles') ? 'spindles' : has('wheels') ? 'wheels' : 'chassis', u);
      unsprung.push(u);
    }
    /* The hub centreline: the axle runs across the car, along Z. */
    const hubZ = outer + side * M(40);
    const dia = end === 'F' ? v.brakeF : v.brakeR;
    if (dia && has('disc'+sfx)){
      const disc = brakeDisc(M(dia), MAT.iron());
      disc.scale.z = side;                        // the hat faces inboard on both sides
      add('disc'+sfx, at(disc, x, r, hubZ - side * M(26))); unsprung.push(disc);
      if (end === 'F') anim.steer.push(disc);
    }
    if (dia && has('cal'+sfx)){
      const c = caliper(M(dia), MAT.red());
      /* calipers sit behind the axle at the front, ahead of it at the rear */
      const ang = end === 'F' ? deg(150) : deg(30);
      at(c, x + Math.cos(ang) * M(dia) * 0.36, r + Math.sin(ang) * M(dia) * 0.36, hubZ - side * M(26));
      c.rotation.z = ang - Math.PI/2;
      add('cal'+sfx, c); unsprung.push(c);
    }
    if (has('wheels')){
      const width = M(end === 'F' ? v.tyreF : v.tyreR);
      const rimR = M((end === 'F' ? v.rimF : v.rimR) * 25.4 / 2);
      const w = wheelMesh({ radius:r, width, rimR,
        spokes: v.class === 'kart' ? 6 : ['formula','stockcar','dragster'].includes(v.id) ? 10 : 5,
        style: v.body === 'mx' ? 'wire' : v.class === 'kart' ? 'dark' : 'alloy',
        /* slicks on the cars that run them, blocks on the ones that do not */
        tread: v.class === 'kart' || ['formula','dragster','stockcar','nns','drift'].includes(v.id)
               ? 'slick' : 'road' });
      w.scale.z = side;                           // the dish faces outward on both sides
      /* steering happens about the kingpin, so the wheel hangs inside a steer group */
      const steerG = group('steer');
      steerG.position.set(x, r, hubZ);
      steerG.add(w);
      anim.wheels.push({ node:w, end, side, radius:r });
      if (end === 'F') anim.steer.push(steerG);
      add('wheels', steerG); unsprung.push(steerG);
    }
    anim.corners.push({ end, side, x, nodes:unsprung,
                        home:new Map(unsprung.map(n => [n, n.position.y])),
                        phase: x * 9 + side * 1.7,
                        sprung: type !== 'none' });
  };
  for (const end of ['F','R']) for (const side of [-1,1]) corner(end, side);

  if (has('rack')){
    const rk = group('rack');
    rk.add(at(rot(cyl(M(30), M(30), tf*0.62, MAT.alloyDark(), 12), Math.PI/2, 0, 0), axF - M(120), floorY + M(140), 0));
    for (const s of [-1,1]) rk.add(pipe([[axF - M(120), floorY + M(140), s*tf*0.3],[axF - M(40), rF*1.0, s*tf*0.42]], M(13), MAT.steel(), 6));
    add('rack', rk);
  }
  if (has('column')){
    const co = group('col');
    co.add(at(rot(cyl(M(18), M(18), M(620), MAT.steel(), 10), 0, 0, deg(58)), axF*0.1, floorY + M(560), -wid*0.16*(open?0:1)));
    co.add(at(rot(tubeMesh(M(175), M(150), M(30), MAT.black(), 24), deg(28), 0, 0), axF*0.1 - M(280), floorY + M(760), -wid*0.16*(open?0:1)));
    add('column', co);
  }
  if (has('mcyl')) add('mcyl', at(roundBox(M(200), M(150), M(150), .01, MAT.alloy()), axF*0.35, floorY + M(420), -wid*0.2));
  if (has('abs'))  add('abs',  at(roundBox(M(150), M(130), M(120), .01, MAT.plastic()), axF*0.3, floorY + M(320), wid*0.24));
  if (has('hbrake')) add('hbrake', at(rot(cyl(M(20), M(20), M(340), MAT.steel(), 8), 0, 0, deg(70)), 0, floorY + M(300), -wid*0.1));

  if (has('tank')) add('tank', at(roundBox(M(700), M(230), wid*0.58, .04, MAT.plastic()), axR*0.45, floorY + M(120), 0));
  if (has('exhaustsys')){
    const ex = pipe([[engX - M(300), floorY*0.7, wid*0.1],[0, floorY*0.55, wid*0.16],
                     [axR*0.8, floorY*0.6, wid*0.2],[axR*1.25, floorY*0.7, wid*0.22]], M(34), MAT.iron(), 10);
    const muf = at(rot(cyl(M(95), M(95), M(420), MAT.steel(), 16), 0, 0, Math.PI/2), axR*1.05, floorY*0.65, wid*0.21);
    add('exhaustsys', group('ex', ex, muf));
  }
  if (has('rad')){
    const rd = group('rad');
    rd.add(at(coreMesh(wid*0.50, hgt*0.28, M(56)), len*0.36, floorY + hgt*0.17, 0));
    const fan = group('fan');
    for (let i = 0; i < 7; i++){ const b = box(M(18), hgt*0.11, M(8), MAT.black()); b.rotation.x = (i/7)*TAU; fan.add(b); }
    at(rot(fan, 0, 0, Math.PI/2), len*0.32, floorY + hgt*0.17, 0);
    rd.add(fan); anim.fans.push(fan);
    add('rad', rd);
  }
  if (has('aero')){
    /* aero is carbon on a real car, and the weave is why it is left unpainted */
    const cf = MAT.carbon();
    const ae = group('aero');
    ae.add(at(box(M(150), M(24), wid*0.78, cf), len*0.435, floorY*0.55, 0));          // splitter
    ae.add(at(rot(box(M(320), M(26), wid*0.86, cf), 0, 0, deg(-12)), axR*1.25, floorY + hgt*0.62, 0)); // wing
    for (const s of [-1,1]) ae.add(at(box(M(40), hgt*0.2, M(24), cf), axR*1.25, floorY + hgt*0.5, s*wid*0.4));
    ae.add(at(box(M(420), M(30), wid*0.7, cf), axR*1.05, floorY*0.5, 0));             // diffuser
    add('aero', ae);
  }
  if (has('battery')) add('battery', at(roundBox(M(280), M(200), M(190), .01, MAT.black()), axF*0.25, floorY + M(400), wid*0.3));
  if (has('fusebox')) add('fusebox', at(roundBox(M(200), M(120), M(160), .01, MAT.plastic()), axF*0.15, floorY + M(430), -wid*0.3));
  if (has('harness')){
    const hn = group('hn');
    const cols = [0xd94f4f, 0xd9b84f, 0x4fd97a, 0x4f9fd9, 0xd94fd0];
    for (let i = 0; i < 5; i++)
      hn.add(pipe([[axF*0.25, floorY + M(390) + i*M(9), wid*0.28],
                   [axF*0.15, floorY + M(420) + i*M(9), -wid*0.2],
                   [0, floorY + M(300) + i*M(9), -wid*0.28],
                   [axR*0.7, floorY + M(230) + i*M(9), -wid*0.2]], M(6), MAT.wire(cols[i]), 5));
    add('harness', hn);
  }
  if (has('headunit')) add('headunit', at(roundBox(M(180), M(110), M(180), .01, MAT.black()), axF*0.02, floorY + M(560), 0));
  if (has('amp')) add('amp', at(roundBox(M(320), M(70), M(240), .01, MAT.alloyDark()), axR*0.9, floorY + M(240), -wid*0.2));
  if (has('speakers')){
    const sp = group('sp');
    for (const s of [-1,1]){
      sp.add(at(rot(cyl(M(85), M(85), M(70), MAT.black(), 18), 0, 0, Math.PI/2), axF*0.2, floorY + M(220), s*wid*0.44));
      sp.add(at(rot(cyl(M(60), M(60), M(50), MAT.black(), 16), 0, 0, Math.PI/2), axR*0.2, floorY + M(420), s*wid*0.44));
    }
    sp.add(at(rot(cyl(M(160), M(160), M(190), MAT.black(), 20), Math.PI/2, 0, 0), axR*0.95, floorY + M(300), wid*0.16));
    add('speakers', sp);
  }
  if (has('seats')){
    const st = group('seats');
    for (let i = 0; i < Math.min(2, v.seats); i++){
      const s = (i ? 1 : -1) * (v.seats === 1 ? 0 : wid*0.2);
      st.add(at(box(M(430), M(90), M(460), MAT.black()), -len*0.02, floorY + M(300), s));
      st.add(at(rot(box(M(120), M(640), M(440), MAT.black()), 0, 0, deg(-10)), -len*0.2, floorY + M(560), s));
    }
    st.add(at(box(M(140), M(220), wid*0.72, MAT.plastic()), axF*0.12, floorY + M(590), 0));
    add('seats', st);
  }
  const imported = modelFor('veh', v.id);
  /* A kart has no bodywork in its part tree, so asking has('body') first would
     throw its model away. If there is a model, it goes on. */
  if (imported){
    /* an imported model replaces the generated shell; everything under it stays */
    const bd = group('body');
    bd.add(fitToLength(imported.group, len, { lift: floorY * 0.02 }));
    add('body', bd);
  } else if (has('body') && !open){
    const bd = group('body');
    const opacity = globalThis.__MOTORLAB_BODY_OPACITY ?? 0.8;
    const paint = MAT.paint(v.colour, opacity);
    const surf = bodySurfaces(v, len, hgt, floorY, axF, axR, rF, rR);
    const shell = surf.body;
    bd.add(new THREE.Mesh(loft(shell, 56), paint));
    bd.add(bodyGlazing(surf, len, hgt, new THREE.MeshPhysicalMaterial({
      color:0x080d14, metalness:0.0, roughness:0.035, clearcoat:1, clearcoatRoughness:0.02,
      transparent:true, opacity:0.90, envMapIntensity:2.8, side:THREE.DoubleSide })));

    /* a scan of a real radiator grille in the nose, where the air goes in */
    /* the scan's long side is its own X, so it has to be turned across the car
       before it is set into the nose */
    const grille = partMesh('grille', { fit: wid * 0.50, depth: M(60), axis:'y',
                                        mat: MAT.plastic() });
    if (grille){
      grille.rotation.y = Math.PI / 2;
      bd.add(at(grille, len * 0.412, floorY + hgt * 0.30, 0));
    }
    /* the trim that turns the shell into a car: panel gaps, arch lips,
       mirrors, grille, intakes and pipes, all placed on the shell's surface */
    const det = bodyDetail(v, surf.L, shell, len, hgt, wid, floorY, axF, axR, rF, rR);
    if (det.trim) bd.add(det.trim);
    if (det.lamps && has('lights')) add('lights', det.lamps);
    detailLamps = det.lamps;
    add('body', bd);
  }
  if (open && has('body')){
    const bd = group('body');
    const paint = MAT.paint(v.colour, globalThis.__MOTORLAB_BODY_OPACITY ?? 0.8);
    bd.add(at(roundBox(len*0.55, hgt*0.36, wid*0.42, .06, paint), len*0.02, floorY + hgt*0.2, 0));
    bd.add(at(box(len*0.2, M(50), wid*0.6, paint), len*0.36, floorY + hgt*0.1, 0));
    add('body', bd);
  }

  /* Lamps normally come out of the body-detail pass, set into the real skin.
     A vehicle built from an imported model, or an open-wheeler with no shell to
     set them into, falls back to a pair on the nose and tail. */
  if (has('lights') && !detailLamps && !imported) for (const s of [-1,1]){
    add('lights', at(roundBox(M(55), M(105), M(230), .02, MAT.glass()), len*0.425, floorY + hgt*0.33, s*wid*0.27));
    add('lights', at(roundBox(M(50), M(95), M(210), .02, MAT.red()), -len*0.425, floorY + hgt*0.35, s*wid*0.27));
  }

  return finalize(root, nodes, anim, v);
}

/* ----------------------------------------------------------------------
 * A car body is a lofted surface, not a flat extrusion. Each style is defined
 * by four longitudinal curves — roofline, sill line, body width and greenhouse
 * width — sampled into cross-sections and skinned. That is what gives it a
 * crowned roof, a tapering nose, hips over the rear arches and tumblehome.
 * t runs 0 at the front bumper to 1 at the tail.
 * -------------------------------------------------------------------- */
const BODY_LINES = {
  /* A car is not one rounded form. It is a flat-sided lower body with a hard
     shoulder line along the top of it, a narrower greenhouse sitting on that
     shoulder with pillars holding up a roof panel, and glass filling the gaps
     between the pillars. Building it as a single lofted tube is exactly why it
     came out looking like a bar of soap.
       sill  – underside of the body, as a fraction of overall height
       waist – the shoulder: bonnet top, door tops, boot lid. Runs the whole car.
       roof  – the roof line. Where it falls below the waist there is no cabin.
       wide  – half width, as a fraction of the car's own half width
       ghW   – how much narrower the greenhouse is than the body below it
       squL/squG – how square the sections are: high means flat flanks and a
                   crisp shoulder, low means rounded. A car is very square.
       pillars – [t at the shoulder, t at the roof] for the A, B and C pillars.
  */
  coupe: {
    sill :[[0,0.130],[0.10,0.085],[0.35,0.072],[0.65,0.072],[0.90,0.085],[1,0.140]],
    wide :[[0,0.65],[0.07,0.72],[0.18,0.90],[0.32,0.96],[0.50,0.97],[0.68,1.00],[0.84,0.94],[0.94,0.74],[1,0.66]],
    waist:[[0,0.30],[0.07,0.41],[0.18,0.455],[0.30,0.470],[0.50,0.490],[0.72,0.500],[0.86,0.505],[0.95,0.490],[1,0.44]],
    roof :[[0,0.16],[0.28,0.42],[0.35,0.60],[0.43,0.86],[0.50,0.97],[0.62,0.99],[0.70,0.94],[0.78,0.78],[0.86,0.46],[1,0.26]],
    pillars:[[0.335,0.455],[0.615,0.615],[0.855,0.755]],
    ghW:0.82, squL:7.0, squG:4.6,
    cuts:{ bonnet:0.30, doorF:0.34, doorR:0.72, boot:0.86 },
  },
  sedan: {
    sill :[[0,0.136],[0.10,0.087],[0.35,0.074],[0.65,0.074],[0.90,0.087],[1,0.149]],
    wide :[[0,0.65],[0.09,0.72],[0.22,0.91],[0.38,0.96],[0.56,0.98],[0.74,0.98],[0.88,0.90],[1,0.78]],
    waist:[[0,0.30],[0.07,0.42],[0.18,0.460],[0.30,0.475],[0.50,0.495],[0.72,0.505],[0.86,0.510],[0.95,0.500],[1,0.46]],
    roof :[[0,0.16],[0.26,0.44],[0.33,0.62],[0.42,0.88],[0.49,0.99],[0.68,1.00],[0.76,0.93],[0.84,0.74],[0.90,0.52],[1,0.30]],
    pillars:[[0.315,0.435],[0.545,0.545],[0.835,0.755]],
    ghW:0.83, squL:6.6, squG:4.4,
    cuts:{ bonnet:0.28, doorF:0.32, doorR:0.80, boot:0.84 },
  },
  hatch: {
    sill :[[0,0.136],[0.10,0.093],[0.35,0.081],[0.65,0.081],[0.90,0.093],[1,0.149]],
    wide :[[0,0.68],[0.09,0.74],[0.22,0.92],[0.38,0.97],[0.58,0.98],[0.76,0.97],[0.90,0.90],[1,0.84]],
    waist:[[0,0.32],[0.07,0.44],[0.18,0.480],[0.30,0.495],[0.50,0.515],[0.72,0.525],[0.88,0.530],[1,0.48]],
    roof :[[0,0.18],[0.24,0.46],[0.31,0.66],[0.40,0.90],[0.47,1.00],[0.72,1.00],[0.82,0.94],[0.90,0.78],[0.96,0.56],[1,0.40]],
    pillars:[[0.295,0.415],[0.545,0.545],[0.815,0.775]],
    ghW:0.84, squL:6.2, squG:4.2,
    cuts:{ bonnet:0.26, doorF:0.30, doorR:0.66, boot:0.86 },
  },
  super: {
    sill :[[0,0.099],[0.12,0.062],[0.40,0.056],[0.70,0.056],[0.92,0.074],[1,0.124]],
    wide :[[0,0.71],[0.10,0.78],[0.24,0.94],[0.40,0.96],[0.56,0.98],[0.72,1.00],[0.86,0.96],[0.95,0.78],[1,0.78]],
    waist:[[0,0.24],[0.08,0.34],[0.20,0.375],[0.32,0.390],[0.50,0.420],[0.70,0.450],[0.86,0.470],[0.95,0.460],[1,0.40]],
    roof :[[0,0.12],[0.28,0.36],[0.34,0.54],[0.42,0.80],[0.48,0.92],[0.58,0.92],[0.66,0.84],[0.74,0.66],[0.82,0.48],[1,0.30]],
    pillars:[[0.325,0.435],[0.735,0.665]],
    ghW:0.80, squL:7.5, squG:4.8,
    cuts:{ bonnet:0.28, doorF:0.32, doorR:0.62, boot:0.80 },
  },
  gt: {
    sill :[[0,0.116],[0.10,0.074],[0.35,0.064],[0.65,0.064],[0.90,0.078],[1,0.128]],
    wide :[[0,0.65],[0.08,0.72],[0.20,0.92],[0.34,0.96],[0.52,0.95],[0.70,1.00],[0.86,0.95],[0.95,0.78],[1,0.69]],
    waist:[[0,0.26],[0.07,0.36],[0.20,0.400],[0.34,0.415],[0.52,0.435],[0.72,0.450],[0.88,0.455],[0.96,0.440],[1,0.40]],
    roof :[[0,0.14],[0.34,0.40],[0.41,0.60],[0.50,0.88],[0.56,0.98],[0.66,0.97],[0.74,0.88],[0.82,0.70],[0.90,0.46],[1,0.28]],
    pillars:[[0.395,0.505],[0.815,0.735]],
    ghW:0.81, squL:7.2, squG:4.6,
    cuts:{ bonnet:0.36, doorF:0.40, doorR:0.76, boot:0.86 },
  },
  muscle: {
    sill :[[0,0.130],[0.10,0.086],[0.35,0.072],[0.65,0.072],[0.90,0.086],[1,0.140]],
    wide :[[0,0.71],[0.08,0.76],[0.20,0.94],[0.34,0.97],[0.52,0.96],[0.70,1.00],[0.86,0.96],[0.95,0.82],[1,0.84]],
    waist:[[0,0.30],[0.07,0.42],[0.20,0.465],[0.36,0.480],[0.54,0.500],[0.74,0.515],[0.88,0.525],[1,0.50]],
    roof :[[0,0.18],[0.40,0.46],[0.47,0.66],[0.55,0.90],[0.61,1.00],[0.74,1.00],[0.81,0.92],[0.88,0.72],[0.94,0.56],[1,0.44]],
    pillars:[[0.455,0.575],[0.865,0.775]],
    ghW:0.84, squL:6.4, squG:4.3,
    cuts:{ bonnet:0.42, doorF:0.46, doorR:0.78, boot:0.90 },
  },
  roadster: {
    sill :[[0,0.124],[0.10,0.078],[0.35,0.066],[0.65,0.066],[0.90,0.080],[1,0.132]],
    wide :[[0,0.65],[0.08,0.72],[0.20,0.92],[0.34,0.96],[0.52,0.96],[0.68,0.99],[0.84,0.93],[0.94,0.74],[1,0.66]],
    waist:[[0,0.28],[0.08,0.38],[0.20,0.425],[0.34,0.440],[0.52,0.460],[0.72,0.470],[0.88,0.470],[1,0.42]],
    roof :[[0,0.16],[0.36,0.42],[0.42,0.60],[0.47,0.66],[0.53,0.64],[0.58,0.46],[1,0.28]],
    pillars:[[0.405,0.455]],
    ghW:0.78, squL:6.8, squG:4.2,
    cuts:{ bonnet:0.34, doorF:0.40, doorR:0.68, boot:0.80 },
  },
  hyper: {
    sill :[[0,0.092],[0.12,0.056],[0.40,0.050],[0.70,0.050],[0.92,0.068],[1,0.116]],
    wide :[[0,0.74],[0.10,0.80],[0.24,0.96],[0.40,0.98],[0.56,0.99],[0.72,1.02],[0.86,0.98],[0.95,0.80],[1,0.81]],
    waist:[[0,0.22],[0.08,0.30],[0.20,0.340],[0.32,0.355],[0.50,0.385],[0.70,0.410],[0.86,0.430],[1,0.36]],
    roof :[[0,0.10],[0.26,0.32],[0.33,0.52],[0.42,0.78],[0.48,0.90],[0.58,0.90],[0.66,0.80],[0.76,0.58],[0.86,0.40],[1,0.26]],
    pillars:[[0.315,0.425],[0.755,0.675]],
    ghW:0.79, squL:7.8, squG:5.0,
    cuts:{ bonnet:0.26, doorF:0.30, doorR:0.60, boot:0.78 },
  },
  rally: {
    sill :[[0,0.149],[0.10,0.105],[0.35,0.093],[0.65,0.093],[0.90,0.105],[1,0.161]],
    wide :[[0,0.71],[0.09,0.78],[0.22,0.98],[0.38,1.02],[0.58,1.03],[0.76,1.02],[0.90,0.94],[1,0.87]],
    waist:[[0,0.32],[0.07,0.44],[0.18,0.485],[0.30,0.500],[0.50,0.520],[0.72,0.530],[0.88,0.535],[1,0.48]],
    roof :[[0,0.18],[0.24,0.47],[0.31,0.68],[0.40,0.92],[0.47,1.00],[0.72,1.00],[0.82,0.94],[0.90,0.80],[0.96,0.58],[1,0.40]],
    pillars:[[0.295,0.415],[0.545,0.545],[0.815,0.775]],
    ghW:0.85, squL:6.0, squG:4.1,
    cuts:{ bonnet:0.26, doorF:0.30, doorR:0.66, boot:0.86 },
  },
  suv: {
    sill :[[0,0.161],[0.10,0.118],[0.35,0.105],[0.65,0.105],[0.90,0.118],[1,0.174]],
    wide :[[0,0.71],[0.09,0.76],[0.22,0.93],[0.38,0.98],[0.60,0.99],[0.78,0.98],[0.92,0.92],[1,0.87]],
    waist:[[0,0.36],[0.07,0.48],[0.18,0.530],[0.30,0.545],[0.50,0.565],[0.72,0.575],[0.90,0.580],[1,0.52]],
    roof :[[0,0.22],[0.24,0.52],[0.31,0.74],[0.40,0.94],[0.47,1.00],[0.80,1.00],[0.90,0.94],[0.97,0.76],[1,0.50]],
    pillars:[[0.295,0.415],[0.565,0.565],[0.845,0.805]],
    ghW:0.86, squL:5.8, squG:4.0,
    cuts:{ bonnet:0.26, doorF:0.30, doorR:0.72, boot:0.88 },
  },
  pickup: {
    sill :[[0,0.161],[0.10,0.124],[0.40,0.118],[0.70,0.118],[0.92,0.130],[1,0.174]],
    wide :[[0,0.78],[0.09,0.80],[0.22,0.94],[0.40,0.97],[0.62,0.97],[0.80,0.99],[0.94,0.96],[1,0.93]],
    waist:[[0,0.36],[0.07,0.50],[0.18,0.560],[0.30,0.580],[0.42,0.600],[0.60,0.600],[0.66,0.585],[0.95,0.580],[1,0.55]],
    roof :[[0,0.22],[0.26,0.56],[0.33,0.80],[0.40,0.98],[0.46,1.02],[0.58,1.02],[0.62,0.62],[1,0.50]],
    pillars:[[0.315,0.415],[0.605,0.575]],
    ghW:0.88, squL:5.4, squG:3.9,
    cuts:{ bonnet:0.24, doorF:0.30, doorR:0.58, boot:0.64 },
  },
  semi: {
    sill :[[0,0.186],[0.10,0.149],[0.50,0.143],[0.90,0.149],[1,0.186]],
    wide :[[0,0.87],[0.10,0.86],[0.24,0.98],[0.50,1.00],[0.72,0.98],[0.90,0.94],[1,0.99]],
    waist:[[0,0.42],[0.08,0.66],[0.16,0.720],[0.24,0.740],[0.56,0.740],[0.62,0.660],[0.72,0.640],[1,0.62]],
    roof :[[0,0.30],[0.14,0.70],[0.20,0.96],[0.26,1.04],[0.54,1.04],[0.60,0.70],[1,0.56]],
    pillars:[[0.185,0.255],[0.555,0.535]],
    ghW:0.90, squL:5.0, squG:3.8,
    cuts:{ bonnet:0.12, doorF:0.22, doorR:0.50, boot:0.60 },
  },
};
BODY_LINES.stockcar = BODY_LINES.rally;

function curveAt(pts, t){
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++){
    if (t <= pts[i][0]){
      const [t0, v0] = pts[i-1], [t1, v1] = pts[i];
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));      // smoothstep, so the panel line is fair
    }
  }
  return pts[pts.length - 1][1];
}

/** Skin a set of cross-sections into a closed surface. */
function loft(sections, N){
  const pos = [], idx = [];
  const rings = sections.length;
  for (const sec of sections){
    for (let j = 0; j < N; j++){
      const th = (j / N) * Math.PI * 2;
      const cz = Math.cos(th), cy = Math.sin(th);
      const n = sec.squ;
      const sz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / n);
      const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / n);
      /* tumblehome: the section narrows as it rises toward the roof */
      const w = cy >= 0 ? sec.wBot + (sec.wTop - sec.wBot) * cy : sec.wBot;
      const yMid = (sec.yTop + sec.yBot) / 2, hH = Math.max(1e-4, (sec.yTop - sec.yBot) / 2);
      pos.push(sec.x, yMid + hH * sy, w * sz);
    }
  }
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < N; j++){
      const a = i*N + j, b = i*N + (j+1)%N, c = (i+1)*N + (j+1)%N, d = (i+1)*N + j;
      idx.push(a, b, c, a, c, d);
    }
  for (const [ringIndex, flip] of [[0, false], [rings-1, true]]){
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < N; j++){
      cx += pos[(ringIndex*N + j)*3]; cy += pos[(ringIndex*N + j)*3+1]; cz += pos[(ringIndex*N + j)*3+2];
    }
    pos.push(cx/N, cy/N, cz/N);
    for (let j = 0; j < N; j++){
      const a = ringIndex*N + j, b = ringIndex*N + (j+1)%N;
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ----------------------------------------------------------------------
 * Body detail.
 *
 * A lofted shell is a shape. A car is that shape with lights set into it,
 * panel gaps running across it, arch lips around the wheels, mirrors on the
 * doors and pipes out the back — and it is those, not the silhouette, that
 * make the eye read "car" instead of "lozenge". Every piece below is placed
 * against the shell's own surface, solved exactly from the same superellipse
 * the loft is built from, so trim sits on the paint rather than near it.
 * -------------------------------------------------------------------- */
function shellProbe(sections){
  const S = sections.filter(Boolean).slice().sort((a, b) => b.x - a.x);   // nose first
  const lerp = (a, b, k) => a + (b - a) * k;
  const secAt = (x) => {
    if (!S.length) return null;
    if (x >= S[0].x) return S[0];
    for (let i = 1; i < S.length; i++){
      if (x >= S[i].x){
        const a = S[i-1], b = S[i], k = (a.x - x) / Math.max(1e-6, a.x - b.x);
        return { x, yBot:lerp(a.yBot,b.yBot,k), yTop:lerp(a.yTop,b.yTop,k),
                 wBot:lerp(a.wBot,b.wBot,k), wTop:lerp(a.wTop,b.wTop,k),
                 squ:lerp(a.squ||2.6, b.squ||2.6, k) };
      }
    }
    return S[S.length-1];
  };
  /* Invert the loft: given a height on a section, return the half-width of the
     surface there. loft() puts a vertex at y = yMid + hH·sign(cy)|cy|^(2/n) and
     z = w·|cz|^(2/n), so going the other way is |cy| = |sy|^(n/2). */
  const surfZ = (sec, y) => {
    if (!sec) return 0;
    const yMid = (sec.yTop + sec.yBot) / 2, hH = Math.max(1e-4, (sec.yTop - sec.yBot) / 2);
    const sy = Math.max(-1, Math.min(1, (y - yMid) / hH));
    const n = sec.squ || 2.6;
    const cy = Math.sign(sy) * Math.pow(Math.abs(sy), n / 2);
    const cz = Math.sqrt(Math.max(0, 1 - cy * cy));
    const w = cy >= 0 ? sec.wBot + (sec.wTop - sec.wBot) * cy : sec.wBot;
    return w * Math.pow(cz, 2 / n);
  };
  const noseX = S.length ? S[0].x : 0, tailX = S.length ? S[S.length-1].x : 0;
  return {
    noseX, tailX, secAt, surfZ,
    z(x, y){ return surfZ(secAt(x), y); },
    /* a point sitting on the skin, nudged out by `lift` so trim does not
       z-fight with the paint it is lying on */
    p(x, y, side, lift = 0){ return new THREE.Vector3(x, y, side * (this.z(x, y) + lift)); },
    top(x){ const c = secAt(x); return c ? c.yTop : 0; },
    bot(x){ const c = secAt(x); return c ? c.yBot : 0; },
  };
}

function bodyDetail(v, L, sections, len, hgt, wid, floorY, axF, axR, rF, rR){
  const sp = shellProbe(sections);
  if (!sp.secAt(0)) return { trim:null, lamps:null };
  const trim = group('trim'), lamps = group('lamps');
  const X = (t) => len / 2 - t * len;                 // 0 = nose, 1 = tail
  /* the shoulder line, read off the body's own top edge rather than a constant:
     it rises from the nose over the bonnet and again over the boot */
  const waist = (t) => floorY + hgt * curveAt(L.waist, t);
  const belt = waist(0.5);
  const dark   = MAT.black();
  const rubber = MAT.rubber();
  const gap    = new THREE.MeshStandardMaterial({ color:0x0a0c10, roughness:0.9, metalness:0.0 });
  const lensF  = new THREE.MeshPhysicalMaterial({ color:0xdfe8ff, metalness:0.0, roughness:0.06,
                   clearcoat:1, transmission:0.55, thickness:0.02, ior:1.45,
                   emissive:0xbcd0f0, emissiveIntensity:0.85, envMapIntensity:2.4 });
  const lensR  = new THREE.MeshPhysicalMaterial({ color:0x8c0d10, metalness:0.0, roughness:0.10,
                   clearcoat:1, transmission:0.35, thickness:0.02, ior:1.45,
                   emissive:0xe01820, emissiveIntensity:1.15, envMapIntensity:2.0 });
  const amber  = new THREE.MeshPhysicalMaterial({ color:0xc06a10, metalness:0.0, roughness:0.12,
                   clearcoat:1, emissive:0xe08a18, emissiveIntensity:0.80 });

  /* --- panel gaps: a 5 mm dark line lying in the skin ------------------- */
  const seam = (pts, r = M(5)) => pts.length > 1 && trim.add(pipe(pts, r, gap, 5));
  const runV = (t, y0, y1, side, n = 9) => {          // up the body at one station
    const out = [], x = X(t);
    for (let i = 0; i <= n; i++){
      const y = y0 + (y1 - y0) * (i / n);
      if (y > sp.top(x) - M(20) || y < sp.bot(x) + M(10)) continue;
      if (sp.z(x, y) < M(60)) continue;
      out.push(sp.p(x, y, side, M(3)).toArray());
    }
    return out;
  };
  const runH = (t0, t1, y, side, n = 12) => {         // along the body at one height
    const out = [];
    for (let i = 0; i <= n; i++){
      const t = t0 + (t1 - t0) * (i / n);
      const x = X(t);
      /* past the nose or tail the section has no surface at this height and
         the point collapses onto the centreline — which drew a straight line
         through the middle of the car */
      if (y > sp.top(x) - M(20) || y < sp.bot(x) + M(10)) continue;
      if (sp.z(x, y) < M(60)) continue;
      out.push(sp.p(x, y, side, M(3)).toArray());
    }
    return out;
  };
  const cuts = L.cuts || { bonnet:0.34, doorF:0.42, doorR:0.68, boot:0.80 };
  for (const side of [-1, 1]){
    const sill = Math.max(sp.bot(X(0.50)) + hgt * 0.04, floorY + hgt * 0.10);
    /* the door: up the A-pillar side, along the sill, up the rear cut */
    seam(runV(cuts.doorF, sill, sp.top(X(cuts.doorF)) - hgt * 0.012, side));
    seam(runV(cuts.doorR, sill, sp.top(X(cuts.doorR)) - hgt * 0.012, side));
    seam(runH(cuts.doorF, cuts.doorR, sill, side));
    /* bonnet and boot shut lines, running down the flanks to the cross cut,
       following the shoulder as it rises and falls */
    for (const [t0, t1] of [[0.06, cuts.bonnet], [cuts.boot, 0.96]]){
      const pts = [];
      for (let i = 0; i <= 10; i++){
        const t = t0 + (t1 - t0) * (i / 10), x = X(t), y = waist(t) - hgt * 0.012;
        if (sp.z(x, y) < M(60)) continue;
        pts.push(sp.p(x, y, side, M(3)).toArray());
      }
      seam(pts);
    }
  }
  /* The cross cuts over the bonnet and boot arc over the crown, so they are
     walked around the loft's own ring rather than solved height by height —
     the same superellipse, top half only, from one flank over the top to the
     other. */
  const arc = (t) => {
    const c = sp.secAt(X(t)); if (!c) return null;
    const n = c.squ || 2.6;
    const yMid = (c.yTop + c.yBot) / 2, hH = (c.yTop - c.yBot) / 2;
    const pts = [];
    for (let i = 0; i <= 20; i++){
      const th = Math.PI * (i / 20);
      const cz = Math.cos(th), cy = Math.sin(th);
      const sz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / n);
      const sy = Math.pow(Math.max(0, cy), 2 / n);
      const w = c.wBot + (c.wTop - c.wBot) * cy;
      pts.push([c.x, yMid + hH * sy + M(2), w * sz * 1.006]);
    }
    return pts;
  };
  seam(arc(cuts.bonnet)); seam(arc(cuts.boot));

  /* --- wheel arch lips -------------------------------------------------- */
  for (const [ax, r] of [[axF, rF], [axR, rR]])
    for (const side of [-1, 1]){
      const pts = [];
      for (let i = 0; i <= 16; i++){
        const th = Math.PI * (0.07 + 0.86 * (i / 16));
        const x = ax + r * 1.30 * Math.cos(th);
        const y = Math.max(sp.bot(x) + M(10), r + r * 1.24 * Math.sin(th));
        pts.push(sp.p(x, y, side, M(2)).toArray());
      }
      trim.add(pipe(pts, M(13), rubber, 6));
    }

  /* --- lower body: bumpers, valances and sills ---------------------------
     A car is not one colour from the ground up. The bumper skins, the sill and
     the valances are separate mouldings, and the tonal break between them and
     the paint is a large part of why a real car does not read as one blob. */
  const skirtY = Math.max(sp.bot(X(0.5)) + hgt * 0.02, floorY + hgt * 0.07);
  for (const side of [-1, 1]){
    const sk = [];
    for (let i = 0; i <= 14; i++){
      const t = 0.24 + (0.76 - 0.24) * (i / 14), x = X(t);
      if (sp.z(x, skirtY) < M(80)) continue;
      sk.push(sp.p(x, skirtY, side, -M(6)).toArray());
    }
    if (sk.length > 3) trim.add(pipe(sk, M(26), dark, 6));
  }
  /* the front and rear bumper skins, wrapped round the corners of the shell */
  for (const [t0, t1] of [[0.005, 0.10], [0.90, 0.995]]){
    for (const side of [-1, 1]){
      const bp = [];
      for (let i = 0; i <= 10; i++){
        const t = t0 + (t1 - t0) * (i / 10), x = X(t);
        const y = floorY + hgt * 0.135;
        if (sp.z(x, y) < M(50)) continue;
        bp.push(sp.p(x, y, side, -M(4)).toArray());
      }
      if (bp.length > 3) trim.add(pipe(bp, M(30), dark, 6));
    }
  }

  /* --- lights -----------------------------------------------------------
     A lamp is a lens in a dark housing, and the housing is what gives it an
     edge against the paint. Without it the lens reads as a sticker. */
  const lampY = waist(0.06) - hgt * 0.045;
  const tailY = waist(0.95) - hgt * 0.035;
  for (const side of [-1, 1]){
    const zf = sp.z(X(0.06), lampY), zr = sp.z(X(0.945), tailY);
    if (zf > M(60)){
      const hz = zf * 0.44, hh = hgt * 0.072;
      lamps.add(at(roundBox(M(110), hh * 1.20, hz * 1.12, .012, dark),
                   X(0.058), lampY, side * zf * 0.52));
      lamps.add(at(roundBox(M(86), hh, hz, .010, lensF), X(0.072), lampY, side * zf * 0.52));
      /* the projector barrels you can see through the lens */
      for (const k of [-1, 1])
        lamps.add(at(rot(cyl(hh * 0.32, hh * 0.32, M(56), MAT.chrome(), 14), 0, 0, Math.PI/2),
                     X(0.066), lampY, side * zf * 0.52 + k * hz * 0.28));
      /* the indicator, in its own lens outboard and below */
      lamps.add(at(roundBox(M(64), hgt * 0.030, zf * 0.16, .006, amber),
                   X(0.050), lampY - hgt * 0.058, side * zf * 0.84));
    }
    if (zr > M(60)){
      const rz = zr * 0.42, rh = hgt * 0.062;
      lamps.add(at(roundBox(M(96), rh * 1.24, rz * 1.14, .012, dark),
                   X(0.952), tailY, side * zr * 0.54));
      lamps.add(at(roundBox(M(76), rh, rz, .010, lensR), X(0.968), tailY, side * zr * 0.54));
    }
  }

  /* --- grille and lower intakes ----------------------------------------- */
  const gy = floorY + hgt * 0.20;
  const gz = sp.z(X(0.035), gy);
  if (gz > M(80)){
    trim.add(at(rot(coreMesh(gz * 1.34, hgt * 0.13, M(40), {}, 22), 0, Math.PI/2, 0),
                X(0.055), gy, 0));
    for (const side of [-1, 1])
      trim.add(at(roundBox(M(70), hgt * 0.09, gz * 0.34, .01, dark),
                  X(0.028), floorY + hgt * 0.10, side * gz * 0.66));
  }

  /* --- mirrors ---------------------------------------------------------- */
  const mt = cuts.doorF + 0.03, my = waist(mt) + hgt * 0.012;
  const mz = sp.z(X(mt), my);
  if (mz > M(120)) for (const side of [-1, 1]){
    const g2 = group('mirror');
    /* a short triangular sail from the door skin, then the housing on the end */
    g2.add(at(rot(cyl(M(14), M(20), M(58), dark, 10), 0, 0, deg(78)), M(16), -M(16), side * M(24)));
    g2.add(at(roundBox(M(62), M(88), M(150), .03, MAT.paint(v.colour, 1)), 0, 0, side * M(64)));
    g2.add(at(roundBox(M(14), M(74), M(128), .01, MAT.chrome()), -M(28), 0, side * M(66)));
    trim.add(at(g2, X(mt), my, side * (mz - M(10))));
  }

  /* --- a side intake, on anything with the engine behind the driver ------ */
  if (v.bay === 'mid' || v.bay === 'rear'){
    const it = 0.66, iy = waist(it) - hgt * 0.055;
    const iz = sp.z(X(it), iy);
    for (const side of [-1, 1]){
      trim.add(at(roundBox(len * 0.10, hgt * 0.13, M(60), .02, dark), X(it), iy, side * (iz - M(20))));
      trim.add(at(rot(coreMesh(hgt * 0.10, len * 0.075, M(30), {}, 14), Math.PI/2, 0, 0),
                  X(it), iy, side * (iz - M(34))));
    }
  }

  /* --- exhaust tips and a rear valance ---------------------------------- */
  const ey = floorY + hgt * 0.10;
  const ez = sp.z(X(0.985), ey);
  if (ez > M(80)){
    const tips = v.class === 'car' ? (v.drivetrain === 'FWD' ? 1 : 2) : 1;
    for (const side of (tips > 1 ? [-1, 1] : [0])){
      const tip = tubeMesh(M(46), M(38), M(150), MAT.stainless ? MAT.stainless() : MAT.chrome(), 18);
      rot(tip, 0, 0, Math.PI/2);
      trim.add(at(tip, X(1.0) - M(30), ey, side * ez * 0.52));
    }
    trim.add(at(roundBox(M(130), hgt * 0.10, ez * 1.5, .02, dark), X(0.985), floorY + hgt * 0.055, 0));
  }
  return { trim, lamps };
}

/** The body: one continuous surface from nose to tail, sill to roof.
 *
 *  A car really is one shell. Building the cabin as a separate narrower loft
 *  perched on the body gave a pod sitting on a slab, which is not what a car
 *  looks like from the side. What makes the cabin read is not that it is a
 *  different object — it is that the section is squared off so the flanks and
 *  roof are flat, that it pulls in hard as it rises (tumblehome), and that the
 *  windows are cut into it.
 */
function bodySurfaces(v, len, hgt, floorY, axF, axR, rF, rR){
  const L = BODY_LINES[v.body] || BODY_LINES.sedan;
  const halfW = M(v.widthMm) / 2;
  /* the bodywork has to cover the wheels — this is what gives a car its hips */
  const overF = (M(v.trackF || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreF) / 2;
  const overR = (M(v.trackR || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreR) / 2;
  const N = 80;
  const body = [];
  let tFirst = 1, tLast = 0;
  for (let i = 0; i < N; i++){
    const t = i / (N - 1);
    const x = len/2 - t * len;
    let wide  = curveAt(L.wide, t) * halfW;
    let sillY = floorY + hgt * curveAt(L.sill, t);
    const waistY = floorY + hgt * curveAt(L.waist, t);
    const roofY  = floorY + hgt * curveAt(L.roof, t);
    for (const [ax, r, over] of [[axF, rF, overF], [axR, rR, overR]]){
      const d = Math.abs(x - ax) / (r * 1.28);
      if (d < 1){
        const k = 1 - d * d;
        sillY = Math.max(sillY, r * 1.16 * (1 - d * d * 0.30));
        wide  = Math.max(wide, (over + M(26)) * (0.95 + 0.05 * k));
      }
    }
    /* over the cabin the section pulls in hard toward the roof; over the
       bonnet and boot it barely tapers at all */
    const cabin = roofY > waistY + hgt * 0.055;
    const topY  = Math.max(roofY, waistY);
    if (cabin){ tFirst = Math.min(tFirst, t); tLast = Math.max(tLast, t); }
    body.push({ x, t, yBot:sillY, yTop:Math.max(topY, sillY + hgt * 0.03),
                wBot:wide, wTop:wide * (cabin ? L.ghW : 0.94),
                squ:L.squL, waistY, roofY, cabin });
  }
  /* Close the ends without pinching them to a point — cars have flat faces. */
  for (const i of [0, body.length - 1]){
    body[i].wBot *= 0.86; body[i].wTop *= 0.86; body[i].squ *= 1.25;
  }
  return { L, body, tFirst, tLast };
}

/** Stitch a grid of rows of points into a surface. */
function patch(rows, mat){
  const pos = [], idx = [];
  const R = rows.length, C = rows[0].length;
  for (const row of rows) for (const p of row) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < R - 1; i++)
    for (let j = 0; j < C - 1; j++){
      const a = i*C + j, b = i*C + j+1, c = (i+1)*C + j+1, d = (i+1)*C + j;
      idx.push(a, b, c, a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** The glazing: windscreen, side windows and backlight cut into the body.
 *
 *  Cutting them into the shell rather than replacing the cabin with glass is
 *  what gives you pillars for free — a pillar is simply the paint left between
 *  two windows, so it is always exactly as wide as the gap and always in the
 *  right place.
 */
function bodyGlazing(surf, len, hgt, glassMat){
  const { L, body, tFirst, tLast } = surf;
  const g = group('glazing');
  const P = L.pillars || [];
  if (!P.length || tLast <= tFirst) return g;
  const secAt = (t) => {
    const k = Math.max(0, Math.min(body.length - 1.001, t * (body.length - 1)));
    const i = Math.floor(k), f = k - i, a = body[i], b = body[i + 1] || a;
    const m = (p, q) => p + (q - p) * f;
    return { x:m(a.x,b.x), yBot:m(a.yBot,b.yBot), yTop:m(a.yTop,b.yTop),
             wBot:m(a.wBot,b.wBot), wTop:m(a.wTop,b.wTop), squ:m(a.squ,b.squ),
             waistY:m(a.waistY,b.waistY), roofY:m(a.roofY,b.roofY) };
  };
  const LIFT = 1.018;
  /* the angle around the section at a given height — the loft's superellipse,
     solved the other way */
  const thAt = (c, y) => {
    const yMid = (c.yTop + c.yBot) / 2, hH = Math.max(1e-4, (c.yTop - c.yBot) / 2);
    const sy = Math.max(-0.999, Math.min(0.999, (y - yMid) / hH));
    const n = c.squ || 5;
    return Math.asin(Math.sign(sy) * Math.pow(Math.abs(sy), n / 2));
  };
  const pt = (c, th) => {
    const n = c.squ || 5, yMid = (c.yTop + c.yBot) / 2, hH = (c.yTop - c.yBot) / 2;
    const cz = Math.cos(th), cy = Math.sin(th);
    const sz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / n);
    const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / n);
    const w = (cy >= 0 ? c.wBot + (c.wTop - c.wBot) * cy : c.wBot) * LIFT;
    return new THREE.Vector3(c.x, yMid + hH * sy, w * sz);
  };
  /* a sheet across the crown: the windscreen and the backlight */
  const cross = (t0, t1, inset) => {
    const rows = [];
    const n = 14;
    for (let i = 0; i <= n; i++){
      const t = t0 + (t1 - t0) * (i / n);
      const c = secAt(t);
      const lo = thAt(c, c.waistY + hgt * inset);
      if (!(lo < Math.PI/2 - 0.05)) continue;
      const r = [];
      for (let j = 0; j <= 20; j++) r.push(pt(c, lo + (Math.PI - 2*lo) * (j / 20)));
      rows.push(r);
    }
    if (rows.length > 1) g.add(patch(rows, glassMat));
  };
  /* a band up the flank: the side windows */
  const flank = (t0, t1, side) => {
    const rows = [];
    const n = 16;
    for (let i = 0; i <= n; i++){
      const t = t0 + (t1 - t0) * (i / n);
      const c = secAt(t);
      const yLo = c.waistY + hgt * 0.014, yHi = c.roofY - hgt * 0.052;
      if (yHi - yLo < hgt * 0.03) continue;
      const th0 = thAt(c, yLo), th1 = thAt(c, yHi);
      const r = [];
      for (let j = 0; j <= 5; j++){
        const th = th0 + (th1 - th0) * (j / 5);
        r.push(pt(c, side > 0 ? th : Math.PI - th));
      }
      rows.push(r);
    }
    if (rows.length > 1) g.add(patch(rows, glassMat));
  };
  const A = P[0], C = P[P.length - 1];
  cross(Math.max(tFirst + 0.004, A[0]), A[1], 0.010);
  cross(C[1], Math.min(tLast - 0.004, C[0]), 0.014);
  const spans = P.length >= 3
    ? [[A[1] + 0.012, P[1][0] - 0.014], [P[1][0] + 0.014, C[1] - 0.012]]
    : [[A[1] + 0.012, C[1] - 0.012]];
  for (const [t0, t1] of spans){
    if (t1 - t0 < 0.02) continue;
    flank(t0, t1, 1); flank(t0, t1, -1);
  }
  return g;
}

/* ====================================================================== */
/* ====================================================================== */
/* A real model of a motorcycle is the whole motorcycle — tank, seat, wheels,
 * lights and all. Building the generated versions of those as well leaves two
 * of everything in the same place, which on a bike is unmissable: a blue box
 * of a fuel tank sitting inside a photographed one. So when there is a model,
 * the parts it already contains are not built a second time. Everything under
 * the skin — frame, forks, swingarm, brakes, engine — still is. */
const DUPLICATED_BY_MODEL = new Set([
  'body', 'tank', 'wheels', 'lights', 'exhaustsys', 'rad', 'subframe',
  'forks', 'triple', 'shock', 'swingarm', 'discf', 'discr', 'final',
  'seats', 'cage', 'chassis', 'engine',
]);

function buildBike(v, tree){
  const root = group('bike'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const imported = modelFor('veh', v.id);
  /* the frame and the wiring live inside the bodywork, so they are still
     worth building under a real model; everything on the outside is not, and
     the engine has a whole workspace of its own */
  const keep = new Set(['chassis', 'battery', 'harness']);
  const has = (id) => !!tree.byId[id] &&
    !(imported && DUPLICATED_BY_MODEL.has(id) && !keep.has(id));
  const anim = { wheels:[], steer:[], susp:[], fans:[], corners:[] };

  const wb = M(v.wheelbase);
  const rF = wheelRadius(v, false), rR = wheelRadius(v, true);
  const axF = wb/2, axR = -wb/2;
  const rake = deg(v.rakeDeg || 25);
  const headY = rF + M(680), headX = axF - M(120);
  const swingY = rR + M(60), swingX = axR + M(560);

  const ch = group('frame');
  if (v.chassis.includes('trellis')){
    const pts = [[headX, headY, 0],[headX - M(280), headY - M(140), M(120)],[swingX, swingY + M(220), M(140)],[swingX, swingY, M(90)]];
    for (const s of [-1,1]){
      ch.add(pipe(pts.map(p => [p[0], p[1], p[2]*s]), M(15), MAT.red(), 6));
      ch.add(pipe([[headX, headY - M(60), s*M(40)],[headX - M(400), headY - M(320), s*M(150)],[swingX, swingY + M(150), s*M(130)]], M(13), MAT.red(), 6));
    }
  } else if (v.chassis.includes('backbone')){
    ch.add(pipe([[headX, headY, 0],[axF*0.2, headY - M(80), 0],[swingX, swingY + M(260), 0]], M(34), MAT.black(), 8));
    for (const s of [-1,1]) ch.add(pipe([[headX, headY - M(180), 0],[axF*0.1, rR + M(120), s*M(110)],[swingX, swingY, s*M(110)]], M(18), MAT.black(), 6));
  } else {
    for (const s of [-1,1]){
      ch.add(pipe([[headX, headY - M(40), s*M(60)],[axF*0.1, headY - M(120), s*M(215)],[swingX, swingY + M(210), s*M(170)],[swingX, swingY + M(20), s*M(110)]], M(30), MAT.alloy(), 6));
    }
  }
  ch.add(at(rot(cyl(M(34), M(34), M(200), MAT.alloyDark(), 14), 0, 0, Math.PI/2 - rake), headX, headY - M(70), 0));
  add('chassis', ch);

  if (has('subframe')){
    const sf = group('sub');
    for (const s of [-1,1]) sf.add(pipe([[swingX, swingY + M(220), s*M(130)],[axR*0.55, rR + M(560), s*M(140)],[axR*1.05, rR + M(560), s*M(110)]], M(14), MAT.alloyDark(), 6));
    add('subframe', sf);
  }
  if (has('engine')){
    const eg = group('eng');
    const wide = v.bay === 'boxer';
    /* a scan of a real motorcycle engine — cases, barrel, cam cover and fins */
    const scan = wide ? null : partMesh('engineMoto', { fit: M(520), axis:'y', mat: MAT.alloy() });
    if (scan){
      eg.add(at(scan, axF*0.1, rR + M(250), 0));
    } else {
      eg.add(at(roundBox(M(400), M(380), wide ? M(900) : M(420), .03, MAT.alloy()), axF*0.1, rR + M(300), 0));
      eg.add(at(roundBox(M(340), M(230), wide ? M(760) : M(360), .03, MAT.alloyDark()), axF*0.1 - M(40), rR + M(90), 0));
      if (v.bay === 'longitudinal-v') for (const a of [deg(22), deg(-23)])
        eg.add(at(rot(box(M(230), M(300), M(240), MAT.alloyDark()), 0, 0, a), axF*0.1 + Math.sin(a)*M(220), rR + M(430) + Math.cos(a)*M(120), 0));
    }
    add('engine', eg);
  }
  if (has('triple')){
    const tp = group('tp');
    for (const y of [headY + M(60), headY - M(160)])
      tp.add(at(rot(box(M(90), M(40), M(300), MAT.alloy()), 0, 0, rake), headX + (y - headY)*Math.tan(rake), y, 0));
    add('triple', tp);
  }
  if (has('forks')){
    const fk = group('fk');
    for (const s of [-1,1]){
      const top = new THREE.Vector3(headX + M(60), headY + M(60), s*M(110));
      const bot = new THREE.Vector3(axF, rF, s*M(110));
      const dir = bot.clone().sub(top);
      const h = dir.length();
      const tube = cyl(M(28), M(28), h, MAT.chrome(), 14);
      tube.position.copy(top.clone().addScaledVector(dir, 0.5));
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize().negate());
      fk.add(tube);
      const slider = cyl(M(34), M(34), h*0.42, MAT.black(), 14);
      slider.position.copy(top.clone().addScaledVector(dir, 0.78));
      slider.quaternion.copy(tube.quaternion);
      fk.add(slider);
    }
    add('forks', fk);
    anim.steer.push(fk);
  }
  if (has('swingarm')){
    const sw = group('sw');
    for (const s of [-1,1]) sw.add(pipe([[swingX, swingY, s*M(120)],[axR, rR, s*M(150)]], M(26), MAT.alloy(), 6));
    sw.add(at(rot(cyl(M(22), M(22), M(280), MAT.steel(), 10), Math.PI/2, 0, 0), swingX, swingY, 0));
    add('swingarm', sw);
  }
  if (has('shock')){
    const sh = group('sh');
    const a = new THREE.Vector3(swingX + M(60), swingY + M(420), 0), b2 = new THREE.Vector3(swingX - M(150), swingY - M(20), 0);
    const dir = b2.clone().sub(a), h = dir.length();
    const body = cyl(M(30), M(30), h, MAT.alloyDark(), 12);
    body.position.copy(a.clone().addScaledVector(dir, .5));
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize().negate());
    sh.add(body);
    const pts = [];
    for (let i = 0; i <= 60; i++){
      const t = i/60, ang = t*TAU*6;
      const p = a.clone().addScaledVector(dir, 0.12 + t*0.72);
      pts.push(new THREE.Vector3(p.x + Math.cos(ang)*M(52), p.y, p.z + Math.sin(ang)*M(52)));
    }
    sh.add(pipe(pts, M(10), MAT.orange(), 6));
    add('shock', sh);
    anim.susp.push({ node:sh, end:'R', side:0 });
  }
  if (has('wheels')) for (const [end, x, r, w, rim] of [['F', axF, rF, v.tyreF, v.rimF], ['R', axR, rR, v.tyreR, v.rimR]]){
    const wl = wheelMesh({ radius:r, width:M(w), rimR:M(rim*25.4/2),
      spokes: v.body === 'mx' ? 32 : 5,
      style: v.body === 'mx' ? 'wire' : v.body === 'cruiser' ? 'chrome' : 'dark',
      tread: v.body === 'mx' ? 'knobby' : 'road' });
    const steerG = group('steer');
    steerG.position.set(x, r, 0);
    steerG.add(wl);
    anim.wheels.push({ node:wl, end, side:0, radius:r });
    if (end === 'F') anim.steer.push(steerG);
    add('wheels', steerG);
  }
  if (has('discf')) for (const sd of [-1,1]){
    add('discf', at(brakeDisc(M(v.brakeF), MAT.steel()), axF, rF, sd*M(85)));
    const c = caliper(M(v.brakeF), MAT.red());
    at(c, axF + Math.cos(deg(150))*M(v.brakeF)*0.36, rF + Math.sin(deg(150))*M(v.brakeF)*0.36, sd*M(85));
    c.rotation.z = deg(150) - Math.PI/2;
    add('discf', c);
  }
  if (has('discr')){
    add('discr', at(brakeDisc(M(v.brakeR), MAT.steel()), axR, rR, M(95)));
    const c = caliper(M(v.brakeR), MAT.red());
    at(c, axR + Math.cos(deg(30))*M(v.brakeR)*0.36, rR + Math.sin(deg(30))*M(v.brakeR)*0.36, M(95));
    c.rotation.z = deg(30) - Math.PI/2;
    add('discr', c);
  }
  if (has('final')){
    const fd = group('fd');
    if (v.drivetrain === 'shaft'){
      fd.add(pipe([[swingX, swingY, M(140)],[axR, rR, M(150)]], M(30), MAT.alloyDark(), 8));
    } else {
      const w = v.drivetrain === 'belt' ? M(30) : M(16);
      for (const yOff of [M(40), -M(40)])
        fd.add(at(box(Math.abs(swingX - axR), M(10), w, v.drivetrain==='belt'?MAT.rubber():MAT.steel()), (swingX+axR)/2, (swingY + rR)/2 + yOff, -M(120)));
      fd.add(at(rot(tubeMesh(M(v.drivetrain==='belt'?95:110), M(30), w, MAT.alloy(), 24), 0, 0, Math.PI/2), axR, rR, -M(120)));
    }
    add('final', fd);
  }
  if (has('tank')) add('tank', at(roundBox(M(620), M(280), M(340), .09, new THREE.MeshStandardMaterial({ color:v.colour, metalness:.6, roughness:.28 })), axF*0.28, rR + M(680), 0));
  if (has('exhaustsys')){
    const ex = group('ex');
    ex.add(pipe([[axF*0.15, rR + M(430), M(90)],[axF*0.05, rR + M(120), M(140)],[axR*0.4, rR + M(180), M(170)],[axR*0.95, rR + M(320), M(180)]], M(26), MAT.steel(), 8));
    ex.add(at(rot(cyl(M(70), M(70), M(320), MAT.alloyDark(), 16), 0, 0, deg(80)), axR*0.95, rR + M(360), M(180)));
    add('exhaustsys', ex);
  }
  if (has('rad')) add('rad', at(box(M(60), M(320), M(280), MAT.alloyDark()), axF*0.42, rR + M(420), 0));
  if (has('battery')) add('battery', at(roundBox(M(170), M(140), M(90), .01, MAT.black()), axR*0.5, rR + M(500), 0));
  if (has('harness')){
    const hn = group('hn');
    for (let i = 0; i < 4; i++)
      hn.add(pipe([[axR*0.5, rR + M(520) + i*M(8), 0],[axF*0.1, rR + M(600) + i*M(8), M(60)],[headX, headY - M(200) + i*M(8), 0]], M(6), MAT.wire([0xd94f4f,0xd9b84f,0x4fd97a,0x4f9fd9][i]), 5));
    add('harness', hn);
  }
  if (has('lights')){
    add('lights', at(roundBox(M(120), M(180), M(220), .04, MAT.glass()), headX + M(220), headY - M(120), 0));
    add('lights', at(roundBox(M(80), M(90), M(140), .02, MAT.red()), axR*1.05, rR + M(560), 0));
  }
  if (imported){
    /* the same rule cars follow: a real model stands in for the bodywork, and
       the frame, forks, swingarm and brakes stay underneath it */
    const bd = group('body');
    bd.add(fitToLength(imported.group, M(v.lengthMm), { lift: 0 }));
    add('body', bd);
  } else if (has('body')){
    const bd = group('body');
    const paint = MAT.paint(v.colour, globalThis.__MOTORLAB_BODY_OPACITY ?? 0.8);
    bd.add(at(roundBox(M(560), M(180), M(300), .07, paint), axR*0.55, rR + M(640), 0));
    if (v.body === 'sportbike') bd.add(at(roundBox(M(700), M(560), M(560), .1, paint), axF*0.4, rR + M(480), 0));
    bd.add(at(rot(cyl(M(18), M(18), M(680), MAT.black(), 10), Math.PI/2, 0, 0), headX + M(60), headY + M(120), 0));
    add('body', bd);
  }
  return finalize(root, nodes, anim, v);
}

/* ====================================================================== */
function finalize(root, nodes, anim, v){
  const home = new Map();
  for (const [id, objs] of nodes) for (const o of objs){
    home.set(o, o.position.clone());
    o.userData.explodeDir = vExplodeDir(id, o);
  }
  const bounds = boundsOf(root);
  return {
    root, nodes, anim, home, bounds,
    partIds:[...nodes.keys()],
    setExplode(f){
      for (const [, objs] of nodes) for (const o of objs){
        const h = home.get(o); o.position.copy(h).addScaledVector(o.userData.explodeDir, f);
      }
    },
    update(state){
      const spin = state.wheelAngle || 0;
      const t = state.time || 0;
      const moving = Math.abs(state.speed || 0) > 0.01;
      for (const w of anim.wheels) w.node.rotation.z = -spin;
      const st = (state.steer || 0) * 0.5;
      for (const s of anim.steer) s.rotation.y = st;
      /* Suspension travel: pitch under acceleration or braking, roll from
       * steering, plus the road surface itself once the wheels are turning. */
      const pitch = state.pitch || 0, roll = state.roll || 0;
      for (const c of anim.corners){
        if (!c.sprung) continue;
        const road = moving ? Math.sin(t * 6.3 + c.phase) * 0.009 + Math.sin(t * 11.7 + c.phase * 2) * 0.004 : 0;
        const dive = pitch * (c.end === 'F' ? 1 : -1) * 0.030;
        const lean = roll * c.side * 0.026;
        const travel = road + dive + lean;
        for (const n of c.nodes){
          const home = c.home.get(n);
          if (home != null) n.position.y = home + travel;
        }
      }
      for (const s of anim.susp) s.node.position.y = -(state.suspTravel || 0);
      for (const f of anim.fans) f.rotation.x = t * (moving ? 14 : 6);
    },
  };
}

function vExplodeDir(id){
  const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
  const map = {
    body:V3(0,1.4,0), aero:V3(0,1.0,0), seats:V3(0,1.1,-0.5), cage:V3(0,1.2,0),
    chassis:V3(0,0,0), subfront:V3(0.7,-0.5,0), subrear:V3(-0.7,-0.5,0), mounts:V3(0.4,0.4,0),
    engine:V3(0,1.1,0), gearbox:V3(-0.5,0.8,0.4), transfer:V3(-0.6,-0.4,0.5), prop:V3(0,-0.7,0),
    diff:V3(-0.9,-0.4,0), axles:V3(-0.5,-0.3,0.8),
    lcaf:V3(0.7,-0.35,0.9), ucaf:V3(0.7,0.5,0.9), strutf:V3(0.5,0.9,0.8), dampf:V3(0.5,0.9,0.8),
    uprf:V3(0.6,0,1.2), arbf:V3(0.9,-0.2,0),
    lcar:V3(-0.7,-0.35,0.9), ucar:V3(-0.7,0.5,0.9), dampr:V3(-0.5,0.9,0.8),
    uprr:V3(-0.6,0,1.2), arbr:V3(-0.9,-0.2,0),
    discf:V3(0.4,0,1.5), calf:V3(0.5,0.4,1.5), discr:V3(-0.4,0,1.5), calr:V3(-0.5,0.4,1.5),
    wheels:V3(0,0,1.9), rack:V3(0.9,0.2,0), column:V3(0.6,0.9,-0.4),
    mcyl:V3(0.5,0.9,-0.6), abs:V3(0.4,0.7,0.8), hbrake:V3(0,1.0,-0.3),
    tank:V3(0,-0.9,0), exhaustsys:V3(0,-1.0,0.6), rad:V3(1.4,0.2,0),
    battery:V3(0.5,1.0,0.7), fusebox:V3(0.4,1.0,-0.7), harness:V3(0,1.3,-0.3),
    lights:V3(1.0,0.5,0.4), headunit:V3(0,1.2,0), amp:V3(-0.8,0.8,-0.5), speakers:V3(0,0.7,1.3),
    forks:V3(0.8,0.8,0), triple:V3(0.7,1.0,0), swingarm:V3(-1.0,-0.2,0), shock:V3(-0.4,1.0,0),
    final:V3(-0.6,-0.4,-0.8), subframe:V3(-0.9,0.5,0), axle:V3(-0.8,0,0), spindles:V3(0.8,0,0.6),
  };
  const d = (map[id] || V3(0,0.9,0)).clone();
  return d.multiplyScalar(0.42);
}
