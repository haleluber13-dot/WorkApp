/* MotorLab — procedural 3D vehicle builder: chassis, subframes, suspension,
 * drivetrain, brakes, wheels, electrics, body and cabin, all derived from the
 * spec and tagged by part id so the same teardown UI works on a whole car.
 *
 * Every part in data/vehicleParts.js gets its own geometry here, piece by
 * piece: four wheels, two front wings, a door a side, a lamp a corner. The
 * body is lofted as one surface and then cut into its panels along the same
 * lines a real car is — bonnet, wings, doors, sills, quarters, roof, boot lid,
 * bumpers — and where a real scan of the car exists it is cut the same way
 * (build/scanSplit.js) and stands in for the generated panels. */
import * as THREE from 'three';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, group, tag, at, rot,
         boundsOf, deg, TAU, lathe, wheelMesh, brakeDisc, caliper, coreMesh, ensureUV, faceDisc } from '../lib/geo.js';
import { wheelRadius } from '../data/vehicles.js';
import { modelFor, fitToLength } from '../lib/importModel.js';
import { partMesh } from '../lib/partModels.js';
import { variantsFor, defaultVariants, VARIANT_BY_SLOT_ID, VARIANTS } from '../data/vehicleVariants.js';
import { splitScan, panelFor } from './scanSplit.js';

const M = (mm) => mm / 1000;

export function buildVehicle(v, tree){
  return v.class === 'bike' ? buildBike(v, tree) : buildCar(v, tree);
}

/* ====================================================================== */
function buildCar(v, tree){
  const root = group('vehicle'); const nodes = new Map();
  const bases = new Set(tree.parts.map(p => p.parent || p.id));
  const orphans = [];
  /* tag a part's geometry; a piece id ('doorF.1') must be in the tree, a base
     id must have at least one piece or itself in it */
  const add = (id, obj) => {
    if (!obj) return;
    if (!tree.byId[id] && !bases.has(id)){ orphans.push(id); return; }
    tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj);
  };
  root.userData.orphans = orphans;
  const has = (id) => !!tree.byId[id] || bases.has(id);
  const kart = v.class === 'kart';
  const open = ['formula','dragster'].includes(v.id) || v.body === 'formula' || v.body === 'dragster';
  const doors4 = ['sedan','hatch','suv','rally','pickup'].includes(v.body) && !kart && !open;
  const race = ['formula','stockcar','dragster','awd-rally','drift','audi-quattro-s1','nns'].includes(v.id);
  const mid = v.bay === 'mid' || v.bay === 'rear';
  const fwd = v.drivetrain === 'FWD', awd = v.drivetrain === 'AWD', rwd = !fwd;
  const anim = { wheels:[], steer:[], susp:[], fans:[], corners:[] };

  /* ---- the fitted variants ---- */
  const VV = variantsFor(v);
  const VB = (slot) => VARIANT_BY_SLOT_ID[slot][VV[slot]] || VARIANTS[slot][0];
  const vm = (slot) => VB(slot).mesh || {};
  const DEF = defaultVariants(v);

  /* ---- the frame ---- */
  const wb = M(v.wheelbase), tf = M(v.trackF) || M(1200), tr = M(v.trackR) || M(1200);
  const rF = wheelRadius(v, false), rR = wheelRadius(v, true);
  const len = M(v.lengthMm), wid = M(v.widthMm), hgt = M(v.heightMm);
  const axF = wb/2, axR = -wb/2;
  /* ride height: springs and dampers set where the body sits over the wheels */
  const rideF = vm('suspF').ride || 0, rideR = vm('suspR').ride || 0;
  /* a scanned body cannot be lowered or lifted, so the ride change moves the
     generated body and chassis only; the spring and damper still show it */
  const ride = modelFor('veh', v.id) ? 0 : (rideF + rideR) / 2;
  const floorY = Math.max(rF, rR) * 0.42 + ride;
  const L = BODY_LINES[v.body] || BODY_LINES.sedan;
  const X = (t) => len / 2 - t * len;                     // t: 0 at the nose, 1 at the tail
  const cuts = { ...(L.cuts || { bonnet:0.30, doorF:0.34, doorR:0.72, boot:0.86 }) };
  cuts.B = (L.pillars?.length >= 3 ? L.pillars[1][0] : null) ?? Math.max((cuts.doorF + cuts.doorR) / 2, (L.pillars?.[0]?.[1] ?? 0) + 0.05);
  cuts.bumperF = 0.068; cuts.bumperR = 0.935;
  /* above the waist a door frame ends at the B-post; a coupe's quarter glass starts there */
  cuts.frameR = (!doors4 && L.pillars?.length >= 3) ? Math.min(cuts.doorR, L.pillars[1][0] + 0.01) : cuts.doorR;
  const waistY = (t) => floorY + hgt * curveAt(L.waist, t);
  const firewallX = open || kart ? null : mid ? X(cuts.doorR) + M(80) : X(cuts.bonnet) - M(60);
  const dims = { len, wid, hgt, axF, axR, tf, tr, rF, rR, floorY, X, cuts, waistY, firewallX, doors4, mid, open, kart };

  /* ---- the scan, if there is one, cut into the same parts ---- */
  const imported = modelFor('veh', v.id);
  let scan = null, scanWhole = false;      // { buckets, counts, empty }
  const scanHas = (id) => !!scan?.buckets.has(id);
  const scanHasBase = (base) => !!scan && [...scan.buckets.keys()].some(k => k === base || k.startsWith(base + '.'));
  if (imported){
    const wrap = fitToLength(imported.group, len, { lift: 0 });
    try {
      if (globalThis.__MOTORLAB_NO_SPLIT) throw new Error('split disabled');
      scan = splitScan(wrap, v, L, dims, { expected: tree.parts.filter(p => p.group === 'body').map(p => p.id) });
    } catch (err){
      console.warn('scan split failed, showing the scan whole', err);
      scan = null; scanWhole = true;
      const bd = group('body');
      bd.add(wrap);
      add(has('roof') ? 'roof' : 'chassis', bd);
    }
  }
  /* which fitted variants replace what the scan shows */
  const changed = (slot) => VV[slot] !== DEF[slot];
  const scanHidden = new Set();
  if (scan){
    if (changed('wheels') || changed('tyres')) for (const k of scan.buckets.keys()) if (k.startsWith('wheels.')) scanHidden.add(k);
    if (changed('brakesF')) for (const k of scan.buckets.keys()) if (k.startsWith('discf.')) scanHidden.add(k);
    if (changed('brakesR')) for (const k of scan.buckets.keys()) if (k.startsWith('discr.')) scanHidden.add(k);
    if (changed('seats')) for (const k of scan.buckets.keys()) if (k.startsWith('seatsF.')) scanHidden.add(k);
    if (changed('steeringwheel')) scanHidden.add('steeringwheel');
    if (changed('mirrors')) for (const k of scan.buckets.keys()) if (k.startsWith('mirrors.')) scanHidden.add(k);
    if (changed('exhaust')) scanHidden.add('rearbox');
    if (changed('suspF')) for (const k of scan.buckets.keys()) if (/^(dampf|strutf)\./.test(k)) scanHidden.add(k);
    if (changed('suspR')) for (const k of scan.buckets.keys()) if (/^(dampr|strutr)\./.test(k)) scanHidden.add(k);
    if (changed('spoiler')) scanHidden.add('spoiler');           // the scan's own wing goes when another (or none) is chosen
  }
  /* draw the generated version of a part only when the scan has none of it */
  const gen = (id) => has(id) && !(scan && (scanHas(id) || (!id.includes('.') && scanHasBase(id))) && !scanHidden.has(id) && !(!id.includes('.') && [...scanHidden].some(k => k.startsWith(id + '.'))));
  const genBody = !scan && !scanWhole && !open && !kart;

  /* ---- chassis ---- */
  const ch = group('chassis');
  /* the sill box sections sit at the body's edge; the floor and undertray stop
     short of the tyres' inboard faces */
  const sillZ = wid*0.40;
  const floorHalf = Math.min(tf, tr)/2 + M(40) - M(Math.max(v.tyreF, v.tyreR))/2 - M(60);
  if (v.chassis === 'ladder frame'){
    for (const s of [-1,1]) ch.add(at(box(len*0.82, M(160), M(90), MAT.iron()), 0, floorY, s*wid*0.28));
    for (let i = 0; i < 5; i++) ch.add(at(box(M(80), M(90), wid*0.56, MAT.iron()), (i-2)*len*0.17, floorY, 0));
    if (!kart) ch.add(at(box(len*0.40, M(40), wid*0.74, MAT.underbody()), X(0.5), floorY + M(100), 0));   // cab floor
  } else if (v.chassis.includes('tube') || v.chassis.includes('chromoly')){
    const nodesXY = [[len*0.42,floorY,0],[len*0.2,floorY+hgt*0.1,wid*0.3],[-len*0.1,floorY+hgt*0.25,wid*0.32],
                     [-len*0.35,floorY+hgt*0.1,wid*0.28],[-len*0.45,floorY,0]];
    for (const s of [-1,1]) ch.add(pipe(nodesXY.map(p=>[p[0],p[1],p[2]*s]), M(22), MAT.steel(), 6));
    for (let i=0;i<nodesXY.length;i++) ch.add(at(rot(cyl(M(20),M(20),wid*0.6,MAT.steel(),8),Math.PI/2,0,0), nodesXY[i][0], nodesXY[i][1], 0));
    if (!kart && !open) ch.add(at(box(len*0.44, M(30), wid*0.66, MAT.underbody()), X(0.52), floorY, 0));
  } else if (v.chassis === 'carbon monocoque'){
    const tub = roundBox(len*0.42, hgt*0.42, wid*0.6, 0.06, MAT.carbon());
    ch.add(at(tub, len*0.02, floorY + hgt*0.16, 0));
  } else {
    const tunnel = !fwd && !mid;
    if (tunnel) for (const s2 of [-1,1]) ch.add(at(box(len*0.72, M(70), Math.min(wid*0.39, floorHalf) - M(180), MAT.underbody()), 0, floorY, s2*((Math.min(wid*0.39, floorHalf) + M(180)) / 2)));
    else ch.add(at(box(len*0.72, M(70), Math.min(wid*0.78, floorHalf*2), MAT.underbody()), 0, floorY, 0));
    /* the sills: the two box sections between the wheel arches, at the body's edge */
    const sillLen = (axF - rF*1.35) - (axR + rR*1.35), sillX = ((axF - rF*1.35) + (axR + rR*1.35)) / 2;
    for (const s of [-1,1]) ch.add(at(box(Math.max(M(600), sillLen), M(150), M(110), MAT.alloyDark()), sillX, floorY+M(60), s*sillZ));
    if (firewallX != null) ch.add(at(box(M(60), hgt*0.34, wid*0.76, MAT.alloyDark()), firewallX, floorY+hgt*0.2, 0)); // bulkhead
    /* the transmission tunnel down the middle of the floor */
    if (tunnel) ch.add(at(roundBox(len*0.72, M(300), M(360), 0.05, MAT.underbody()), 0, floorY + M(120), 0));
  }
  /* the flat undertray, which is what you actually see from below */
  if (!open && !kart) ch.add(at(box(len*0.80, M(14), Math.min(wid*0.80, floorHalf*2), MAT.underbody()), 0, floorY - M(46), 0));
  if (kart) ch.add(at(box(len*0.46, M(8), wid*0.5, MAT.alloy()), X(0.46), floorY - M(10), 0));
  add('chassis', ch);
  /* a scan bucket the tree has no part for goes with the panel it is on */
  const FALLBACK = { wipers:'windscreen', grille:'bumperF', fuelflap:'quarters.1', seatR:'carpet', bed:'bootlid', spoiler:'bootlid',
                     console:'carpet', headliner:'roof', pedals:'dash', steeringwheel:'dash', 'glassQ.1':'quarters.1', 'glassQ.2':'quarters.2',
                     'glassR.1':'quarters.1', 'glassR.2':'quarters.2', 'doorR.1':'quarters.1', 'doorR.2':'quarters.2', 'doorcardsR.1':'quarters.1', 'doorcardsR.2':'quarters.2',
                     cat:'midpipe', rearbox:'midpipe', difff:'gearbox', engine:'chassis', subrear:'chassis', subfront:'chassis' };
  if (scan) for (const [id, grp] of scan.buckets){
    if (scanHidden.has(id)) continue;
    if (id.startsWith('wheels.')) continue;                       // placed with the corners below
    const base = id.includes('.') ? id.slice(0, id.indexOf('.')) : id;
    const fb = FALLBACK[id] || FALLBACK[base];
    /* a carbon bonnet or roof on a scanned car: the scan's panel in the weave */
    if ((id === 'bonnet' && vm('bonnet').type === 'carbon') || (id === 'roof' && vm('roof').type === 'carbon'))
      grp.traverse(o => { if (o.isMesh) o.material = MAT.carbon(); });
    add(has(id) ? id : has(base) ? base : (fb && has(fb)) ? fb : 'chassis', grp);
  }

  if (gen('cage')){
    const cg = group('cage');
    const P = [[len*0.12,floorY,wid*0.36],[len*0.10,floorY+hgt*0.5,wid*0.34],[-len*0.12,floorY+hgt*0.52,wid*0.34],[-len*0.2,floorY,wid*0.36]];
    for (const s of [-1,1]) cg.add(pipe(P.map(p=>[p[0],p[1],p[2]*s]), M(21), MAT.steel(), 6));
    cg.add(at(rot(cyl(M(21),M(21),wid*0.68,MAT.steel(),8),Math.PI/2,0,0), len*0.10, floorY+hgt*0.5, 0));
    cg.add(at(rot(cyl(M(21),M(21),wid*0.68,MAT.steel(),8),Math.PI/2,0,0), -len*0.12, floorY+hgt*0.52, 0));
    cg.add(pipe([[len*0.10,floorY+hgt*0.5,-wid*0.34],[-len*0.12,floorY+hgt*0.52,wid*0.34]], M(18), MAT.steel(), 6));
    add('cage', cg);
  }
  if (gen('halo')){
    const hl = group('halo');
    const y = floorY + hgt * 0.78;
    hl.add(pipe([[len*0.04, y, -wid*0.17],[len*0.10, y + M(40), -wid*0.08],[len*0.12, y + M(50), 0],[len*0.10, y + M(40), wid*0.08],[len*0.04, y, wid*0.17],[-len*0.04, y - M(10), wid*0.14],[-len*0.04, y - M(10), -wid*0.14],[len*0.04, y, -wid*0.17]], M(34), MAT.carbon(), 8));
    hl.add(pipe([[len*0.12, y + M(50), 0],[len*0.16, floorY + hgt*0.52, 0]], M(28), MAT.carbon(), 8));
    add('halo', hl);
  }
  if (gen('floortray')) add('floortray', at(box(len*0.44, M(6), wid*0.46, MAT.alloy()), X(0.44), floorY + M(2), 0));

  /* ---- subframes ---- */
  const subY = floorY + M(60);                     // the subframe rails, where the arms pivot
  if (gen('subfront')){
    const sf = group('sf');
    sf.add(at(box(M(420), M(80), tf*0.86, MAT.alloyDark()), axF - M(60), subY, 0));
    for (const s of [-1,1]) sf.add(at(box(M(360), M(70), M(70), MAT.alloyDark()), axF - M(60), subY, s*tf*0.4));
    add('subfront', sf);
  }
  if (gen('subrear')){
    const sr = group('sr');
    for (const s of [-1,1]) sr.add(at(box(M(640), M(80), M(80), MAT.alloyDark()), axR, subY, s*tr*0.30));
    sr.add(at(box(M(80), M(80), tr*0.64, MAT.alloyDark()), axR - M(280), subY, 0));
    sr.add(at(box(M(80), M(60), tr*0.64, MAT.alloyDark()), axR + M(280), subY - M(40), 0));
    add('subrear', sr);
  }
  const bay = v.bay;
  const transverse = bay.includes('transverse') || kart;
  const engX = mid ? axR + M(620) : bay === 'rear' ? axR - M(200) : (firewallX != null ? (axF + firewallX) / 2 + M(140) : axF*0.62);
  /* a transverse engine sits to the right of centre with the transaxle on its
     left end, the pair filling the bay between the inner wheel arches */
  const engZ = transverse && !kart ? tf*0.12 : 0;
  const gbxZ = transverse ? -(tf*0.13 + M(150)) : 0;
  const engY = floorY + M(250);
  if (has('mounts')){
    const spots = transverse ? [[engX, engY - M(170), engZ + tf*0.22], [engX - M(40), engY + M(100), gbxZ - M(230)], [engX - M(330), engY - M(280), engZ]]
                 : mid ? [[engX + M(200), engY - M(170), -tf*(open ? 0.18 : 0.30)], [engX + M(200), engY - M(170), tf*(open ? 0.18 : 0.30)], [engX - M(450), engY - M(200), tf*(open ? 0.12 : 0.25)]]
                 : [[engX, engY - M(170), -tf*0.30], [engX, engY - M(170), tf*0.30], [engX - M(860), engY - M(330), 0]];
    spots.forEach((p, i) => { if (gen(`mounts.${i+1}`)) add(`mounts.${i+1}`, at(rot(cyl(M(45), M(45), M(60), MAT.rubber(), 12), 0, 0, 0), p[0], p[1], p[2])); });
  }

  /* ---- powertrain ---- */
  if (gen('engine')){
    const eg = group('eng');
    const bw = transverse ? tf*0.50 : M(520), bd = transverse ? M(520) : tf*0.5;
    /* in the chassis view the engine is one part, so it can be a scan of a
       real one — the strip-down happens on the generated model in the Engine
       Bay, where every casting has to come apart */
    const scanE = kart ? null : partMesh('engineI4', { fit: M(660), axis: transverse ? 'z' : 'x', mat: MAT.alloy() });
    if (scanE) eg.add(scanE);
    else {
      eg.add(roundBox(bw, M(420), bd, 0.03, MAT.alloy()));
      eg.add(at(roundBox(bw*0.92, M(120), bd*0.88, 0.02, MAT.alloyDark()), 0, M(280), 0));
    }
    add('engine', at(eg, kart ? axR + M(120) : engX, kart ? floorY + M(160) : engY, kart ? wid*0.30 : engZ));
  }
  if (gen('gearbox')){
    const gb = group('gb');
    const scanG = transverse ? partMesh('gearbox', { fit: M(320), axis:'z', mat: MAT.alloyDark() })
                             : partMesh('transmission', { fit: M(760), axis:'x', mat: MAT.alloyDark() });
    if (scanG) gb.add(scanG);
    else gb.add(rot(cyl(M(180), M(140), M(560), MAT.alloyDark(), 16), 0, 0, Math.PI/2));
    add('gearbox', at(gb, transverse ? engX - M(40) : engX - M(560), transverse ? engY + M(10) : engY - M(150), gbxZ));
  }
  if (gen('transfer')) add('transfer', at(roundBox(M(260), M(220), M(220), .02, MAT.alloyDark()), engX - M(600), engY - M(140), tf*0.16));
  const diffY = rR;                                  // the differential sits on the axle line
  if (gen('prop')){
    const tail = [transverse ? engX - M(300) : engX - M(900), transverse ? engY - M(100) : engY - M(200), 0];
    const nose = [axR + M(180), diffY, 0];
    const pr = group('prop');
    pr.add(pipe([tail, nose], M(38), MAT.steel(), 12));
    pr.add(at(cyl(M(55), M(55), M(70), MAT.steel(), 12).rotateZ(Math.PI/2), tail[0] + M(40), tail[1], 0));   // the front universal joint
    pr.add(at(cyl(M(55), M(55), M(70), MAT.steel(), 12).rotateZ(Math.PI/2), nose[0] - M(40), nose[1], 0));
    add('prop', pr);
  }
  if (gen('diff')){
    const df = group('diff');
    const dx = fwd ? engX - M(120) : axR, dy = fwd ? engY - M(170) : diffY, dz = fwd ? gbxZ + M(110) : 0;
    df.add(sphere(fwd ? M(120) : M(150), MAT.alloyDark(), 16));
    if (!fwd && v.suspR === 'liveaxle') df.add(at(rot(cyl(M(55), M(55), tr*0.7, MAT.steel(), 12), Math.PI/2, 0, 0), 0, 0, 0));
    add('diff', at(df, dx, dy, dz));
  }
  if (gen('difff')) add('difff', at(sphere(M(115), MAT.alloyDark(), 16), axF - M(40), floorY + M(150), -tf*0.12));
  if (has('axles')){
    const shafts = awd ? [['F',-1],['F',1],['R',-1],['R',1]] : fwd ? [['F',-1],['F',1]] : [['R',-1],['R',1]];
    shafts.forEach(([end, s], i) => {
      const id = `axles.${i+1}`; if (!gen(id)) return;
      const x = end === 'F' ? axF : axR, track = end === 'F' ? tf : tr, r = end === 'F' ? rF : rR;
      const y0 = end === 'F' ? engY - M(170) : diffY;
      const inner = s * track*0.12, outer = s * (track/2 - M(110));
      const g = group('axle');
      g.add(pipe([[x, y0, inner],[x, r, outer]], M(26), MAT.steel(), 10));
      g.add(at(cyl(M(44), M(44), M(90), MAT.rubber(), 12).rotateX(Math.PI/2), x, y0 + (r - y0) * 0.12, inner + s * M(60)));
      g.add(at(cyl(M(46), M(46), M(90), MAT.rubber(), 12).rotateX(Math.PI/2), x, r - (r - y0) * 0.08, outer - s * M(60)));
      add(id, g);
    });
  }

  /* ---- suspension corners ---- */
  const unsprungOf = {};
  const corner = (end, side) => {
    const x = end === 'F' ? axF : axR;
    const track = end === 'F' ? tf : tr;
    const r = end === 'F' ? rF : rR;
    const sfx = end === 'F' ? 'f' : 'r';
    const n = side < 0 ? 1 : 2;                       // left = .1, right = .2
    const z = side * track/2;
    const type = end === 'F' ? v.suspF : v.suspR;
    const tyreW = M(end === 'F' ? v.tyreF : v.tyreR) * ((vm('tyres').width) || 1);
    const innerFace = Math.abs(z*0.86 + side * M(40)) - tyreW / 2;      // the tyre's inboard sidewall
    const inner = side * track*0.14, outer = z*0.86;
    const armOut = side * Math.min(Math.abs(outer), innerFace - M(30));   // where an arm may reach without touching the tyre
    const unsprung = [];
    const sv = vm(end === 'F' ? 'suspF' : 'suspR');
    const cornerRide = end === 'F' ? rideF : rideR;

    if (type !== 'none' && !kart){
      if (gen('lca'+sfx+'.'+n)){
        const a = group('lca');
        a.add(pipe([[x - M(120), subY, inner],[x, r*0.55, armOut]], M(24), MAT.alloyDark(), 6));
        a.add(pipe([[x + M(140), subY, inner],[x, r*0.55, armOut]], M(24), MAT.alloyDark(), 6));
        a.add(at(sphere(M(30), MAT.steel(), 10), x, r*0.55, armOut));          // the ball joint
        add('lca'+sfx+'.'+n, a);
      }
      if (gen('uca'+sfx+'.'+n)){
        const a = group('uca');
        const uIn = side * Math.max(Math.abs(inner) * 1.4, track*0.30);
        a.add(pipe([[x - M(90), floorY + M(320), uIn],[x, r*1.28, armOut*0.94]], M(20), MAT.alloyDark(), 6));
        a.add(pipe([[x + M(110), floorY + M(320), uIn],[x, r*1.28, armOut*0.94]], M(20), MAT.alloyDark(), 6));
        add('uca'+sfx+'.'+n, a);
      }
      const dampBase = has('strut'+sfx) ? 'strut'+sfx : 'damp'+sfx;
      const dampId = dampBase + '.' + n;
      if (gen(dampId)){
        const strut = dampBase.startsWith('strut');
        const top = strut ? floorY + M(620) : floorY + M(430);
        const bot = strut ? r*0.6 : r*1.15;
        const d = damperMesh(sv, { x, top, bot, z: side * Math.min(Math.abs(outer) * 0.92, innerFace - M(50)), strut, race });
        add(dampId, d);
        anim.susp.push({ node:d, side, end });
      }
      if (gen('arb'+sfx) && side < 0){                  // one bar across the car
        const b = group('arb');
        const bx = x + (end==='F' ? M(220) : -M(220)), by = subY + M(70);
        b.add(pipe([[bx, by, -outer*0.72],[bx, by, outer*0.72]], M(14), MAT.steel(), 6));
        for (const s of [-1,1]) b.add(pipe([[bx, by, s*Math.abs(outer)*0.72],[x + (end==='F' ? M(90) : -M(90)), subY + M(50), s*Math.abs(armOut)*0.80]], M(14), MAT.steel(), 6));
        for (const s of [-1,1]) b.add(at(rot(box(M(60), M(50), M(40), MAT.alloyDark()), 0, 0, 0), bx, by, s*track*0.26));  // the clamps
        add('arb'+sfx, b);
      }
      if (gen('arblink'+sfx+'.'+n)){
        const lk = group('arblink');
        const bx = x + (end==='F' ? M(90) : -M(90));
        lk.add(pipe([[bx, subY + M(50), armOut*0.80],[x + (end==='F' ? M(60) : -M(60)), r*0.62, armOut*0.86]], M(10), MAT.steel(), 6));
        add('arblink'+sfx+'.'+n, lk);
      }
    }

    /* ---- upright, brakes and wheel: every corner has these ---- */
    if (gen('upr'+sfx+'.'+n)){
      const u = group('upr');
      u.add(at(box(M(110), r*0.85, M(80), MAT.alloy()), x, r, outer));
      u.add(at(rot(cyl(M(45), M(45), M(70), MAT.steel(), 12), Math.PI/2, 0, 0), x, r, outer + side*M(30)));
      add('upr'+sfx+'.'+n, u); unsprung.push(u);
    } else if (type === 'none' && !has('upr'+sfx)){
      /* a stub axle: a kart calls it a spindle, a dragster just bolts it to the frame */
      const u = at(box(M(90), r*0.7, M(90), MAT.steel()), x, r, outer);
      const sid = has('spindles') && end === 'F' ? 'spindles.' + n : has('axle') && end === 'R' ? 'axle' : 'chassis';
      if (gen(sid)) { add(sid, u); unsprung.push(u); }
    }
    const hubZ = outer + side * M(40);
    const dia = end === 'F' ? v.brakeF : v.brakeR;
    const bv = vm(end === 'F' ? 'brakesF' : 'brakesR');
    if (dia && gen('disc'+sfx+'.'+n)){
      const disc = discMesh(bv, M(dia), end);
      disc.scale.z = side;                        // the hat faces inboard on both sides
      add('disc'+sfx+'.'+n, at(disc, x, r, hubZ - side * M(26))); unsprung.push(disc);
      if (end === 'F') anim.steer.push(disc);
    }
    if (dia && gen('cal'+sfx+'.'+n)){
      const c = caliperMesh(bv, M(dia), end);
      const ang = end === 'F' ? deg(150) : deg(30);
      const rr = M(dia) * (bv.size || 1) * 0.36;
      if (bv.disc !== 'drum'){ at(c, x + Math.cos(ang) * rr, r + Math.sin(ang) * rr, hubZ - side * M(26)); c.rotation.z = ang - Math.PI/2; }
      else at(c, x, r, hubZ - side * M(26) - side * M(30));
      add('cal'+sfx+'.'+n, c); unsprung.push(c);
      if (end === 'F') anim.steer.push(c);
    }
    const wheelId = 'wheels.' + (end === 'F' ? (side < 0 ? 1 : 2) : (side < 0 ? 3 : 4));
    if (has('wheels')){
      const steerG = group('steer');
      steerG.position.set(x, r, hubZ);
      let w = null;
      if (scan && scanHas(wheelId) && !scanHidden.has(wheelId)){
        w = scan.buckets.get(wheelId);
        steerG.position.copy(w.position);          // the scan's own hub
        w.position.set(0, 0, 0);
        w.userData.spinAxis = 'z';
      } else if (gen(wheelId)){
        w = wheelVariantMesh(v, end, vm('wheels'), vm('tyres'), { race, kart });
        w.scale.z = side;                           // the dish faces outward on both sides
      }
      if (w){
        steerG.add(w);
        anim.wheels.push({ node:w, end, side, radius: w.userData.radius || r });
        if (end === 'F') anim.steer.push(steerG);
        add(wheelId, steerG); unsprung.push(steerG);
      }
    }
    unsprungOf[end + n] = unsprung;
    anim.corners.push({ end, side, x, nodes:unsprung,
                        home:new Map(unsprung.map(nd => [nd, nd.position.y])),
                        phase: x * 9 + side * 1.7,
                        sprung: type !== 'none' });
  };
  for (const end of ['F','R']) for (const side of [-1,1]) corner(end, side);

  /* ---- steering ---- */
  const seatZ = v.seats === 1 ? 0 : -wid*0.205;                // the driver sits on the left
  const dashX = open || kart ? X(0.42) : X(cuts.doorF) + M(80);
  const wheelHub = new THREE.Vector3(open || kart ? dashX - M(120) : dashX - M(420), open ? floorY + hgt*0.55 : kart ? floorY + M(520) : floorY + M(640), seatZ);
  const rackPos = new THREE.Vector3(open ? axF - M(450) : axF - (transverse ? M(300) : M(260)), floorY - M(10), 0);
  const armX = axF - M(150);                                  // the steering arm, behind the hub
  if (gen('rack')){
    const rk = group('rack');
    rk.add(at(rot(cyl(M(30), M(30), tf*0.62, MAT.alloyDark(), 12), Math.PI/2, 0, 0), rackPos.x, rackPos.y, 0));
    rk.add(at(rot(cyl(M(42), M(42), M(120), MAT.alloyDark(), 12), Math.PI/2, 0, 0), rackPos.x, rackPos.y, seatZ * 0.6));   // the pinion housing
    if (kart) for (const s of [-1,1]) rk.add(pipe([[rackPos.x, rackPos.y, s*tf*0.3],[armX, rF*1.0, s*tf*0.42]], M(13), MAT.steel(), 6));
    add('rack', rk);
  }
  if (has('tierods')) for (const s of [-1,1]){
    const id = 'tierods.' + (s < 0 ? 1 : 2); if (!gen(id)) continue;
    const tr2 = group('tierod');
    tr2.add(pipe([[rackPos.x, rackPos.y, s*tf*0.3],[armX, rF*0.95, s*tf*0.42]], M(13), MAT.steel(), 6));
    tr2.add(at(sphere(M(22), MAT.steel(), 10), armX, rF*0.95, s*tf*0.42));
    add(id, tr2);
  }
  if (gen('column')){
    const co = group('col');
    /* the column runs from the wheel hub down through the bulkhead to the rack pinion */
    const knee = new THREE.Vector3(wheelHub.x + M(380), wheelHub.y - M(300), seatZ * 0.8);
    co.add(pipe([[wheelHub.x - M(60), wheelHub.y, wheelHub.z], knee.toArray()], M(20), MAT.steel(), 10));
    co.add(pipe([knee.toArray(), [rackPos.x, rackPos.y + M(40), seatZ * 0.6]], M(14), MAT.steel(), 8));
    co.add(at(sphere(M(26), MAT.alloyDark(), 10), knee.x, knee.y, knee.z));   // the universal joint
    co.add(at(roundBox(M(260), M(120), M(140), 0.02, MAT.black()), wheelHub.x + M(160), wheelHub.y - M(70), wheelHub.z));   // the column shroud
    add('column', co);
  }
  if (gen('steeringwheel')) add('steeringwheel', steeringWheelMesh(vm('steeringwheel'), wheelHub, open || kart));

  /* ---- brakes, plumbing ---- */
  const mcylPos = new THREE.Vector3(open ? X(0.28) : firewallX != null ? firewallX + M(130) : axF*0.35, open ? floorY + M(300) : floorY + M(560), seatZ);
  if (gen('mcyl')){
    const mc = group('mcyl');
    mc.add(at(rot(cyl(M(110), M(110), M(70), MAT.black(), 20), 0, 0, Math.PI/2), mcylPos.x, mcylPos.y, mcylPos.z));          // the servo
    mc.add(at(rot(cyl(M(26), M(26), M(170), MAT.alloy(), 14), 0, 0, Math.PI/2), mcylPos.x + M(120), mcylPos.y, mcylPos.z));  // the cylinder
    mc.add(at(roundBox(M(90), M(80), M(70), .01, MAT.plastic()), mcylPos.x + M(120), mcylPos.y + M(80), mcylPos.z));          // the reservoir
    add('mcyl', mc);
  }
  if (gen('abs')) add('abs', at(roundBox(M(150), M(130), M(120), .01, MAT.plastic()), firewallX != null ? firewallX + M(100) : axF*0.3, floorY + M(430), -wid*0.36));
  if (gen('brakelines')){
    const bl = group('brakelines');
    const y = floorY - M(20);
    for (const s of [-1,1]){
      bl.add(pipe([[mcylPos.x + M(200), mcylPos.y, mcylPos.z],[mcylPos.x + M(260), floorY + M(100), s*wid*0.30],[axF - M(60), y, s*wid*0.30],[axF, rF*0.9, s*tf*0.40]], M(4), MAT.steel(), 5));
      bl.add(pipe([[mcylPos.x + M(200), mcylPos.y - M(20), mcylPos.z],[0, y, s*wid*0.31],[axR + M(80), y, s*wid*0.31],[axR, rR*0.9, s*tr*0.40]], M(4), MAT.steel(), 5));
    }
    add('brakelines', bl);
  }
  if (gen('hbrake')){
    const hb = group('hbrake');
    const hx = open || kart ? X(0.45) : X(cuts.doorF) - M(900), hy = floorY + M(80);
    hb.add(at(rot(cyl(M(14), M(14), M(300), MAT.steel(), 8), 0, 0, deg(-62)), hx, hy + M(170), kart ? -wid*0.2 : 0));
    hb.add(at(roundBox(M(40), M(60), M(50), .01, MAT.black()), hx + M(120), hy + M(300), kart ? -wid*0.2 : 0));   // the grip
    if (!open && !kart) for (const s of [-1,1]) hb.add(pipe([[hx, hy, 0],[axR + M(300), floorY - M(30), s*wid*0.22],[axR, rR*0.8, s*tr*0.38]], M(5), MAT.black(), 5));
    add('hbrake', hb);
  }
  if (gen('pedals')){
    const pd = group('pedals');
    const px = mcylPos.x - M(140), py = floorY + M(110);
    pd.add(at(box(M(60), M(260), M(200), MAT.alloyDark()), px, py + M(280), seatZ));                      // the pedal box
    for (const [dz, w2] of [[-M(80), M(60)], [0, M(80)], [M(90), M(50)]])
      pd.add(pipe([[px, py + M(300), seatZ + dz],[px - M(100), py + M(40), seatZ + dz]], M(8), MAT.steel(), 6)),
      pd.add(at(rot(box(M(16), M(80), w2, MAT.rubber()), 0, 0, deg(-20)), px - M(110), py + M(40), seatZ + dz));
    add('pedals', pd);
  }

  /* ---- fuel ---- */
  const tankX = race && !open ? axR + M(500) : open ? X(0.60) : axR + M(560);
  const tankY = open ? floorY + M(220) : floorY + M(150), tankW = open ? wid*0.3 : wid*0.56;
  if (gen('tank')) add('tank', at(roundBox(M(620), M(220), tankW, .04, race ? MAT.alloyDark() : MAT.plastic()), kart ? X(0.4) : tankX, kart ? floorY + M(140) : tankY, 0));
  if (gen('fuelpump')){
    const fp = group('fuelpump');
    fp.add(at(cyl(M(70), M(70), M(30), MAT.black(), 20), tankX, tankY + M(125), -tankW*0.2));             // the flange on top
    fp.add(at(cyl(M(28), M(28), M(180), MAT.alloyDark(), 12), tankX, tankY + M(20), -tankW*0.2));         // the pump module inside
    add('fuelpump', fp);
  }
  if (gen('fuellines')){
    const fl = group('fuellines');
    for (const dz of [0, M(14)])
      fl.add(pipe([[tankX, tankY + M(140), -tankW*0.2 + dz],[tankX + M(300), floorY + M(40), -wid*0.33 + dz],[engX - M(300), floorY + M(40), -wid*0.33 + dz],[engX - M(200), engY, -tf*0.26 + dz]], M(5), MAT.black(), 5));
    fl.add(at(rot(cyl(M(30), M(30), M(140), MAT.alloy(), 12), 0, 0, Math.PI/2), (tankX + engX) / 2, floorY + M(40), -wid*0.33));   // the filter
    add('fuellines', fl);
  }
  if (gen('fillerneck')){
    const fn = group('fillerneck');
    const flapT = Math.min(cuts.boot - 0.03, Math.max(cuts.doorR + 0.02, (len/2 - axR + rR*1.42) / len));
    const flapX = X(flapT), flapY = waistY(flapT) - hgt*0.10;
    const over = [axR + M(60), Math.max(tankY + M(100), rR*1.30 + M(40)), -wid*0.37];   // up and over the arch
    fn.add(pipe([[tankX - M(200), tankY + M(60), -tankW*0.42], over, [flapX + M(80), flapY - M(40), -wid*0.42],[flapX, flapY, -wid*0.47]], M(24), MAT.steel(), 8));
    fn.add(pipe([[tankX - M(100), tankY + M(110), -tankW*0.42],[over[0], over[1] + M(50), over[2]],[flapX + M(40), flapY + M(40), -wid*0.44]], M(7), MAT.black(), 5));
    add('fillerneck', fn);
  }
  /* ---- exhaust, in its real sections ---- */
  {
    const ev = vm('exhaust');
    const exZ = fwd ? wid*0.08 : Math.min(wid*0.12, M(140));
    const exY = Math.max(floorY - M(75), M(80));
    const startX = mid ? engX - M(300) : engX - M(200), startY = mid ? engY - M(100) : engY - M(150);
    const catX = mid ? axR - M(200) : firewallX != null ? firewallX - M(400) : engX - M(900);
    if (gen('downpipe')){
      const dp = group('downpipe');
      dp.add(pipe([[startX, startY, exZ*0.6],[startX - M(150), floorY + M(40), exZ],[Math.min(startX - M(300), catX + M(250)), exY, exZ]], M(34), MAT.iron(), 10));
      dp.add(at(rot(cyl(M(40), M(40), M(120), MAT.stainless ? MAT.stainless() : MAT.steel(), 12), 0, 0, Math.PI/2), Math.min(startX - M(300), catX + M(250)) + M(100), exY, exZ));   // the flexi
      add('downpipe', dp);
    }
    if (gen('cat')){
      const ct = group('cat');
      ct.add(at(rot(cyl(M(55), M(55), M(300), MAT.steel(), 16), 0, 0, Math.PI/2), catX, exY, exZ));
      ct.add(at(roundBox(M(80), M(60), M(40), .01, MAT.alloyDark()), catX + M(130), exY + M(60), exZ));  // the oxygen sensor boss
      add('cat', ct);
    }
    const boxX = mid ? axR - M(300) : axR + (ev.type === 'side' ? M(700) : -M(250));
    if (gen('midpipe')){
      const mp = group('midpipe');
      if (ev.type === 'side'){
        mp.add(pipe([[catX - M(160), exY, exZ],[axR + M(900), exY, wid*0.30],[axR + M(760), exY + M(40), -(-1)*wid*0.44]], M(34 * (ev.type === 'stock' ? 1 : 1.15)), MAT.iron(), 10));
      } else {
        mp.add(pipe([[catX - M(160), exY, exZ],[(catX + boxX)/2, exY + M(10), exZ],[boxX + M(260), exY, exZ]], M(ev.type === 'stock' ? 34 : 40), MAT.iron(), 10));
        mp.add(at(rot(cyl(M(45), M(45), M(260), MAT.steel(), 14), 0, 0, Math.PI/2), (catX + boxX)/2, exY, exZ));   // the resonator
      }
      add('midpipe', mp);
    }
    if (gen('rearbox')) add('rearbox', exhaustRearMesh(ev, { boxX, exY, exZ, len, wid, X, fwd, floorY, hgt, axR, mid }));
  }

  /* ---- cooling ---- */
  const radX = mid ? X(0.08) : X(cuts.bumperF + 0.03), radY = floorY + hgt*0.17, radW = wid*0.50, radH = hgt*0.28;
  if (gen('rad')) add('rad', at(coreMesh(radW, radH, M(56)), radX, radY, 0));
  if (gen('fans')){
    const fg = group('fans');
    fg.add(at(box(M(30), radH*0.98, radW*0.98, MAT.black()), radX - M(60), radY, 0));                       // the shroud
    for (const s of [-1,1]){
      const fan = group('fan');
      for (let i = 0; i < 7; i++){ const b = box(M(18), radH*0.22, M(8), MAT.black()); b.rotation.x = (i/7)*TAU; fan.add(b); }
      at(rot(fan, 0, 0, Math.PI/2), radX - M(85), radY, s*radW*0.25);
      fg.add(fan); anim.fans.push(fan);
    }
    add('fans', fg);
  }
  if (gen('hoses')){
    const hs = group('hoses');
    hs.add(pipe([[radX - M(30), radY + radH*0.30, radW*0.42],[engX + M(200), engY + M(200), tf*0.20]], M(20), MAT.rubber(), 8));
    hs.add(pipe([[radX - M(30), radY - radH*0.30, -radW*0.42],[engX + M(250), engY - M(60), -tf*0.20]], M(20), MAT.rubber(), 8));
    add('hoses', hs);
  }
  if (gen('exptank')) add('exptank', at(roundBox(M(160), M(160), M(130), .02, MAT.plastic()), engX + M(120), engY + M(260), wid*0.30));
  if (gen('condenser')) add('condenser', at(coreMesh(radW*0.92, radH*0.82, M(22), {}, 14), radX + M(70), radY - radH*0.04, 0));
  if (gen('accomp')) add('accomp', at(rot(cyl(M(65), M(65), M(200), MAT.alloyDark(), 16), 0, 0, Math.PI/2), engX + (transverse ? M(360) : M(380)), engY - M(120), transverse ? engZ - M(100) : -tf*0.20));
  if (gen('heaterbox')) add('heaterbox', at(roundBox(M(260), M(280), M(420), .03, MAT.plastic()), dashX - M(140), floorY + M(540), wid*0.06));

  /* ---- electrics ---- */
  const batX = open ? X(0.63) : mid ? X(0.12) : transverse ? radX - M(200) : (firewallX != null ? firewallX + M(250) : engX - M(300));
  const batZ = open ? wid*0.18 : transverse ? -wid*0.28 : wid*0.28;
  if (gen('battery')) add('battery', at(roundBox(M(280), M(200), M(190), .01, MAT.black()), batX, floorY + M(420), batZ));
  if (gen('fusebox')) add('fusebox', at(roundBox(M(130), M(120), M(200), .01, MAT.plastic()), open ? batX : firewallX != null ? firewallX + M(85) : batX - M(60), floorY + M(500), open ? -wid*0.18 : wid*0.38));
  if (gen('ecu')) add('ecu', at(roundBox(M(180), M(40), M(140), .01, MAT.alloy()), open ? X(0.60) : firewallX != null ? firewallX + M(60) : axF*0.2, open ? floorY + M(300) : floorY + M(560), open ? 0 : -wid*0.30));
  if (gen('harness') && (open || kart)){
    /* a single-seater's loom runs along the tub floor from the battery to the
       dash; a kart's from the engine to the steering column */
    const hn = group('hn');
    const cols = [0xd94f4f, 0xd9b84f, 0x4fd97a, 0x4f9fd9];
    for (let i = 0; i < 4; i++)
      hn.add(kart
        ? pipe([[axR + M(100), floorY + M(260) + i*M(8), wid*0.22],[X(0.5), floorY + M(120) + i*M(8), wid*0.12],[X(0.32), floorY + M(140) + i*M(8), M(40)],[X(0.30), floorY + M(400) + i*M(8), M(20)]], M(5), MAT.wire(cols[i]), 5)
        : pipe([[batX, floorY + M(120) + i*M(8), batZ*0.8],[X(0.5), floorY + M(90) + i*M(8), M(60)],[X(0.40), floorY + M(140) + i*M(8), M(30)],[dashX - M(60), floorY + hgt*0.45 + i*M(8), 0]], M(5), MAT.wire(cols[i]), 5));
    add('harness', hn);
  } else if (gen('harness')){
    const hn = group('hn');
    const cols = [0xd94f4f, 0xd9b84f, 0x4fd97a, 0x4f9fd9, 0xd94fd0];
    for (let i = 0; i < 5; i++)
      hn.add(pipe([[batX, floorY + M(430) + i*M(9), batZ*0.9],
                   [batX - M(200), floorY + M(480) + i*M(9), -wid*0.2],
                   [dashX - M(60), floorY + M(600) + i*M(9), -wid*0.26],
                   [dashX - M(500), floorY + M(70) + i*M(9), -wid*0.29],
                   [X(0.5), floorY + M(70) + i*M(9), -wid*0.29],
                   [axR + M(500), floorY + M(70) + i*M(9), -wid*0.27]], M(6), MAT.wire(cols[i]), 5));
    add('harness', hn);
  }
  if (gen('horn')) add('horn', at(rot(cyl(M(45), M(45), M(50), MAT.black(), 14), 0, 0, Math.PI/2), radX + M(170), radY + radH*0.30, radW*0.14));
  if (gen('washer')) add('washer', at(roundBox(M(180), M(260), M(120), .02, MAT.plastic()), radX - M(140), floorY + M(360), -wid*0.36));
  if (gen('headunit')) add('headunit', at(roundBox(M(150), M(100), M(180), .01, MAT.black()), dashX - (open || kart ? M(120) : M(360)), (open || kart ? floorY + hgt*0.52 : waistY(cuts.doorF) - M(190)), 0));
  if (gen('amp')) add('amp', at(roundBox(M(320), M(70), M(240), .01, MAT.alloyDark()), axR - M(200), floorY + M(140), -wid*0.2));
  if (gen('speakers')){
    const sp = group('sp');
    for (const s of [-1,1]) sp.add(at(rot(cyl(M(80), M(80), M(60), MAT.black(), 18), 0, 0, Math.PI/2), X(cuts.doorF) - M(300), floorY + M(300), s*(wid*0.40 - M(30))));
    sp.add(at(rot(cyl(M(150), M(150), M(180), MAT.black(), 20), Math.PI/2, 0, 0), axR - M(350), floorY + M(200), wid*0.16));
    add('speakers', sp);
  }

  /* ---- the body: a lofted skin cut into its panels, or the scan ---- */
  let surf = null, sp = null;
  if (genBody || (scan && !open)){
    surf = bodySurfaces(v, len, hgt, floorY, axF, axR, rF, rR, cuts);
    sp = shellProbe(surf.body);
  }
  if (genBody){
    const opacity = globalThis.__MOTORLAB_BODY_OPACITY ?? 1;
    const paint = MAT.paint(v.colour, opacity);
    const panels = loftPanels(surf, len, hgt, floorY, cuts, { doors4, pickup: v.body === 'pickup', paint, bonnet: vm('bonnet'), roof: vm('roof') });
    for (const [id, mesh] of panels) if (has(id)) add(id, mesh); else add(has(id.replace(/\.\d$/, '')) ? id.replace(/\.\d$/, '') : 'chassis', mesh);
    const glass = new THREE.MeshPhysicalMaterial({
      color:0x080d14, metalness:0.0, roughness:0.035, clearcoat:1, clearcoatRoughness:0.02,
      transparent:true, opacity:0.90, envMapIntensity:2.8, side:THREE.DoubleSide });
    for (const [id, pane] of bodyGlazing(surf, len, hgt, glass, { doors4, roadster: v.body === 'roadster', B: cuts.B }))
      if (has(id)) add(id, pane);
    const det = bodyDetail(v, surf.L, surf.body, len, hgt, wid, floorY, axF, axR, rF, rR, cuts, vm('lights'), vm('mirrors'));
    for (const [id, objs] of det) for (const o of objs){
      if (has(id)) add(id, o);
      else if (has(id.replace(/\.\d$/, ''))) add(id.replace(/\.\d$/, ''), o);
    }
    /* a scan of a real radiator grille in the nose, where the air goes in */
    if (has('grille')){
      /* the scan's long side is its own X and its thin side its Y; stood up
         across the nose that is X→Z and Y→X, which this one rotation does */
      const grille = partMesh('grille', { fit: wid * 0.46, depth: M(50), axis:'y', mat: MAT.plastic() });
      const gg = group('grille');
      const gyy = Math.min(floorY + hgt * 0.26, sp.top(X(0.03)) - hgt * 0.07);
      if (grille){ grille.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); gg.add(at(grille, X(0.028), gyy, 0)); }
      else gg.add(at(rot(coreMesh(wid * 0.44, hgt * 0.12, M(40), {}, 22), 0, Math.PI/2, 0), X(0.03), gyy, 0));
      add('grille', gg);
    }
  }
  if (scan && !open && surf){
    /* a scan without separable lamps or mirrors gets generated ones, set where
       the generated skin would carry them */
    const want = new Set(['headlamp.1','headlamp.2','taillamp.1','taillamp.2','mirrors.1','mirrors.2','wipers','fuelflap']);
    const det = bodyDetail(v, surf.L, surf.body, len, hgt, wid, floorY, axF, axR, rF, rR, cuts, vm('lights'), vm('mirrors'));
    for (const [id, objs] of det) if (want.has(id) && gen(id)) for (const o of objs) add(id, o);
  }
  if (open && gen('nosecone')){
    const paint = MAT.paint(v.colour, 1);
    add('nosecone', at(rot(cyl(M(90), M(220), len*0.25, paint, 14), 0, 0, -Math.PI/2), X(0.145), floorY + hgt*0.30, 0));
    if (gen('splitter')){
      const fw = group('frontwing');
      fw.add(at(box(M(420), M(22), wid*0.98, MAT.carbon()), X(0.04), floorY + hgt*0.08, 0));
      fw.add(at(rot(box(M(220), M(18), wid*0.98, MAT.carbon()), 0, 0, deg(-18)), X(0.08), floorY + hgt*0.17, 0));
      for (const s of [-1,1]) fw.add(at(box(M(560), hgt*0.22, M(12), MAT.carbon()), X(0.06), floorY + hgt*0.17, s*wid*0.49));
      add('splitter', fw);
    }
    for (const s of [-1,1]) if (gen('sidepods.' + (s < 0 ? 1 : 2)))
      add('sidepods.' + (s < 0 ? 1 : 2), at(roundBox(len*0.30, hgt*0.30, wid*0.20, .05, paint), X(0.56), floorY + hgt*0.26, s*wid*0.30));
    if (gen('enginecover')) add('enginecover', at(rot(roundBox(len*0.28, hgt*0.26, wid*0.22, .06, paint), 0, 0, deg(6)), X(0.74), floorY + hgt*0.52, 0));
    if (gen('floor')){
      const fl = group('floor');
      fl.add(at(box(len*0.50, M(16), wid*0.72, MAT.carbon()), X(0.56), floorY - M(10), 0));
      fl.add(at(rot(box(len*0.12, M(16), wid*0.72, MAT.carbon()), 0, 0, deg(14)), X(0.86), floorY + M(40), 0));
      add('floor', fl);
    }
    if (gen('rearwing')){
      const rw = group('rearwing');
      rw.add(at(rot(box(M(300), M(22), wid*0.50, MAT.carbon()), 0, 0, deg(-10)), X(0.95), floorY + hgt*0.86, 0));
      rw.add(at(rot(box(M(160), M(16), wid*0.50, MAT.carbon()), 0, 0, deg(-30)), X(0.985), floorY + hgt*0.92, 0));
      for (const s of [-1,1]) rw.add(at(box(M(520), hgt*0.34, M(12), MAT.carbon()), X(0.94), floorY + hgt*0.78, s*wid*0.25));
      rw.add(at(box(M(60), hgt*0.54, M(24), MAT.carbon()), X(0.86), floorY + hgt*0.57, 0));            // the pylon, down to the cover
      add('rearwing', rw);
    }
  }
  if (kart){
    const paint = MAT.paint(v.colour, 1);
    if (gen('bumperF')) add('bumperF', pipe([[X(0.06), floorY + M(130), -wid*0.26],[X(0.02), floorY + M(130), -wid*0.12],[X(0.02), floorY + M(130), wid*0.12],[X(0.06), floorY + M(130), wid*0.26]], M(14), MAT.steel(), 8));
    if (gen('nosecone')) add('nosecone', at(roundBox(M(180), M(220), wid*0.50, .06, paint), X(0.05), floorY + M(220), 0));
    if (gen('nassau')) add('nassau', at(rot(roundBox(M(260), M(30), wid*0.30, .02, paint), 0, 0, deg(-50)), X(0.30), floorY + M(420), 0));
    for (const s of [-1,1]) if (gen('sidepods.' + (s < 0 ? 1 : 2)))
      add('sidepods.' + (s < 0 ? 1 : 2), at(roundBox(len*0.42, M(160), M(150), .04, paint), X(0.55), floorY + M(140), s*(wid*0.5 - M(90))));
    if (gen('bumperR')) add('bumperR', at(roundBox(M(120), M(220), wid*0.96, .04, paint), X(0.97), floorY + M(180), 0));
    if (gen('seats')){
      const st = group('seat');
      st.add(at(box(M(360), M(40), M(380), MAT.black()), X(0.60), floorY + M(90), 0));
      st.add(at(rot(box(M(40), M(520), M(400), MAT.black()), 0, 0, deg(-22)), X(0.70), floorY + M(320), 0));
      add('seats', st);
    }
    if (gen('final')){
      const fd = group('final');
      fd.add(at(rot(tubeMesh(M(110), M(30), M(14), MAT.alloy(), 24), 0, 0, Math.PI/2), axR, rR, wid*0.30));
      add('final', fd);
    }
    if (gen('axle')) add('axle', at(rot(cyl(M(25), M(25), tr*0.96, MAT.steel(), 12), Math.PI/2, 0, 0), axR, rR, 0));
    if (gen('exhaustsys')){
      const ex = group('ex');
      ex.add(pipe([[axR + M(300), floorY + M(260), wid*0.30],[axR - M(100), floorY + M(220), wid*0.36],[axR - M(500), floorY + M(220), wid*0.30]], M(22), MAT.steel(), 8));
      ex.add(at(rot(cyl(M(55), M(55), M(360), MAT.alloyDark(), 14), 0, 0, Math.PI/2), axR - M(520), floorY + M(220), wid*0.30));
      add('exhaustsys', ex);
    }
  }
  /* aero that can be added to any body, scan or generated */
  if (!open && !kart){
    const bootTopY = (t) => (surf ? sp.top(X(t)) : floorY + hgt*curveAt(L.waist, t)) + M(4);
    if (gen('spoiler')) add('spoiler', spoilerMesh(vm('spoiler'), { X, len, wid, hgt, floorY, cuts, topY: bootTopY, colour: v.colour }));
    if (gen('splitter') && has('bumperF')) add('splitter', at(box(M(260), M(18), wid*0.90, MAT.carbon()), X(0.03), floorY + hgt*0.055, 0));
    if (gen('diffuser')){
      const df = group('diffuser');
      df.add(at(rot(box(M(420), M(16), wid*0.74, MAT.carbon()), 0, 0, deg(12)), X(0.93), floorY + hgt*0.03, 0));
      for (let i = -2; i <= 2; i++) df.add(at(rot(box(M(420), hgt*0.07, M(10), MAT.carbon()), 0, 0, deg(12)), X(0.93), floorY + hgt*0.06, i*wid*0.17));
      add('diffuser', df);
    }
  }

  /* ---- the cabin ---- */
  if (!kart) buildInterior({ v, has, gen, add, dims, vm, surf, sp, seatZ, wheelHub, dashX, race, open, doors4, scan, scanHidden });

  if (orphans.length) root.userData.orphans = [...new Set(orphans)];
  return finalize(root, nodes, anim, v, null);
}


/* ======================================================================
 * The cabin. Everything sits where it does in the car: the dash under the
 * windscreen between the A-pillars, the seats on the floor between the
 * axles, the bench over the fuel tank, the console on the tunnel, the cards
 * on the inside of the doors, the headliner under the roof.
 * ==================================================================== */
function buildInterior(C){
  const { v, has, gen, add, dims, vm, surf, sp, seatZ, wheelHub, dashX, race, open, doors4 } = C;
  const { len, wid, hgt, floorY, X, cuts, axR, waistY } = dims;
  const floorTop = floorY + M(35);
  const cabinF = open ? X(0.40) : X(cuts.doorF) + M(40);              // the A-pillar foot
  const cabinR = open ? X(0.55) : X(doors4 ? cuts.boot : cuts.doorR) - M(60);
  const innerHalf = open ? wid*0.18 : wid*0.40 - M(70);                // inside the sills
  const roofUnder = (x) => (surf && sp ? sp.top(x) : floorY + hgt*0.96) - M(28);
  const cloth = race ? MAT.carbon() : MAT.black();
  const trim = MAT.plastic();
  const seatKind = vm('seats').type || 'stock';

  if (gen('carpet')) add('carpet', at(box(Math.abs(cabinF - cabinR), M(12), innerHalf*2, race ? MAT.alloy() : MAT.black()), (cabinF + cabinR)/2, floorTop + M(6), 0));

  /* the dash: a moulding across the car under the windscreen base */
  const dashTop = open ? floorY + hgt*0.58 : waistY(cuts.doorF) - M(40);
  const dashH = open ? M(90) : M(300), dashD = open ? M(140) : M(460);
  if (gen('dash')){
    const d = group('dash');
    const w = open ? wid*0.26 : innerHalf*2 + M(100);
    d.add(at(roundBox(dashD, dashH, w, .03, trim), dashX - dashD/2 + M(20), dashTop - dashH/2, 0));
    if (!open){
      d.add(at(roundBox(M(140), M(90), M(380), .02, MAT.black()), dashX - dashD + M(40), dashTop - M(140), seatZ));         // the binnacle
      d.add(at(roundBox(M(60), M(160), M(260), .01, MAT.black()), dashX - dashD + M(10), dashTop - M(180), 0));            // the centre stack
      for (const s of [-1,1]) d.add(at(roundBox(M(60), M(70), M(90), .01, MAT.black()), dashX - dashD + M(10), dashTop - M(90), s*wid*0.30));   // outer vents
    } else {
      d.add(at(roundBox(M(40), M(70), M(140), .01, MAT.black()), wheelHub.x + M(30), wheelHub.y + M(80), wheelHub.z));     // the display on the wheel
    }
    add('dash', d);
  }
  if (gen('console') && !open){
    const c = group('console');
    const cx0 = dashX - dashD, cx1 = cabinF - M(1100);
    const tunnelTop = (v.drivetrain !== 'FWD' && !(v.bay === 'mid' || v.bay === 'rear')) ? floorY + M(270) : floorTop;
    c.add(at(roundBox(Math.abs(cx0 - cx1), M(200), M(220), .03, trim), (cx0 + cx1)/2, tunnelTop + M(100), 0));
    c.add(at(rot(cyl(M(10), M(10), M(180), MAT.steel(), 8), 0, 0, deg(-8)), cx0 - M(320), tunnelTop + M(280), 0));           // the gear lever
    c.add(at(sphere(M(28), MAT.black(), 10), cx0 - M(345), tunnelTop + M(370), 0));
    add('console', c);
  }
  /* the seats: cushion on a frame, backrest leaning back, headrest on top */
  const seatX = open ? X(0.46) : cabinF - M(780);
  const seatMesh = (kind, side) => {
    const g = group('seat');
    const w2 = kind === 'bucket' ? M(480) : M(500);
    if (kind === 'bucket'){
      g.add(at(roundBox(M(440), M(120), w2, .04, MAT.carbon()), 0, M(220), 0));                                  // the shell base
      g.add(at(rot(roundBox(M(90), M(700), w2, .05, MAT.carbon()), 0, 0, deg(-14)), -M(240), M(560), 0));          // one-piece back
      for (const s of [-1,1]) g.add(at(rot(roundBox(M(260), M(640), M(60), .02, MAT.carbon()), 0, 0, deg(-14)), -M(170), M(560), s*(w2/2 - M(30))));   // the wings
      g.add(at(box(M(380), M(70), w2*0.76, MAT.red()), 0, M(290), 0));                                            // the padding
      for (const s of [-1,1]) g.add(at(box(M(40), M(130), M(50), MAT.alloyDark()), -M(40), M(100), s*(w2/2 - M(60))));   // side mounts
    } else {
      const bolster = kind === 'sport';
      g.add(at(box(M(130), M(160), M(60), MAT.alloyDark()), M(40), M(90), -w2*0.36));                             // the rails
      g.add(at(box(M(130), M(160), M(60), MAT.alloyDark()), M(40), M(90), w2*0.36));
      g.add(at(roundBox(M(480), M(110), w2, .05, cloth), 0, M(230), 0));                                           // the cushion
      if (bolster) for (const s of [-1,1]) g.add(at(roundBox(M(400), M(80), M(90), .03, cloth), M(30), M(300), s*(w2/2 - M(50))));
      g.add(at(rot(roundBox(M(120), M(600), w2*0.94, .05, cloth), 0, 0, deg(-12)), -M(270), M(560), 0));          // the backrest
      if (bolster) for (const s of [-1,1]) g.add(at(rot(roundBox(M(150), M(540), M(80), .03, cloth), 0, 0, deg(-12)), -M(250), M(540), s*(w2/2 - M(50))));
      g.add(at(rot(roundBox(M(110), M(170), M(260), .04, cloth), 0, 0, deg(-12)), -M(360), M(960), 0));           // the headrest
      for (const s of [-1,1]) g.add(at(rot(cyl(M(7), M(7), M(80), MAT.steel(), 8), 0, 0, deg(-12)), -M(335), M(840), s*M(70)));
    }
    return g;
  };
  const seatsN = v.seats === 1 ? 1 : 2;
  for (let i = 1; i <= seatsN; i++){
    if (!gen('seatsF.' + i)) continue;
    const z = seatsN === 1 ? 0 : (i === 1 ? seatZ : -seatZ);
    add('seatsF.' + i, at(seatMesh(seatKind, i), seatX, floorTop, z));
  }
  if (gen('seatR')){
    const b = group('bench');
    const bx = doors4 ? X(cuts.B) - M(520) : cabinF - M(1620);
    const bw = innerHalf*2 - M(120);
    b.add(at(roundBox(M(480), M(130), bw, .05, cloth), bx, floorTop + M(310), 0));
    b.add(at(rot(roundBox(M(110), M(560), bw, .05, cloth), 0, 0, deg(-18)), bx - M(300), floorTop + M(600), 0));
    for (const s of [-1,1]) b.add(at(rot(roundBox(M(90), M(150), M(240), .04, cloth), 0, 0, deg(-18)), bx - M(400), floorTop + M(950), s*bw*0.28));
    add('seatR', b);
  }
  /* belts: a reel at the B-pillar base, the webbing up to the shoulder and down to the buckle */
  for (let i = 1; i <= seatsN; i++){
    if (!gen('belts.' + i)) continue;
    const z = seatsN === 1 ? 0 : (i === 1 ? seatZ : -seatZ);
    const s = Math.sign(z) || -1;
    const g = group('belt');
    const pillarZ = s * (innerHalf - M(50)), pillarX = seatX - M(520);
    if (race){
      for (const dz of [-M(110), M(110)]) g.add(pipe([[seatX - M(320), floorTop + M(880), z + dz],[seatX - M(560), floorTop + M(840), z + dz]], M(24), MAT.red(), 6));
      g.add(pipe([[seatX - M(560), floorTop + M(820), z - M(140)],[seatX - M(560), floorTop + M(820), z + M(140)]], M(18), MAT.steel(), 8));   // the harness bar
    } else {
      g.add(at(roundBox(M(80), M(140), M(60), .01, MAT.black()), pillarX, floorTop + M(200), pillarZ));           // the reel
      g.add(pipe([[pillarX, floorTop + M(270), pillarZ],[pillarX, floorTop + M(1000), pillarZ]], M(12), MAT.black(), 4));
      g.add(pipe([[pillarX, floorTop + M(1000), pillarZ],[seatX + M(40), floorTop + M(290), z - s*M(200)]], M(12), MAT.black(), 4));   // the shoulder strap
      g.add(at(box(M(60), M(80), M(40), MAT.alloyDark()), seatX + M(40), floorTop + M(280), z - s*M(230)));         // the buckle
    }
    add('belts.' + i, g);
  }
  if (gen('headliner') && !open) add('headliner', at(box(Math.abs(cabinF - cabinR) * 0.88, M(10), innerHalf*1.9, race ? MAT.black() : MAT.plastic()), (cabinF + cabinR)/2, roofUnder((cabinF + cabinR)/2) - M(10), 0));
  /* door cards: the trim on the inside of each door skin */
  const cardAt = (x0, x1, id, side) => {
    const z = side * (innerHalf + M(40));
    const h = waistY((X(x0) + X(x1)) / 2 / 1) ;
    const yTop = waistY((x0 + x1) / 2) - M(40), yBot = floorTop + M(120);
    const g = group('doorcard');
    g.add(at(box(Math.abs(X(x0) - X(x1)) - M(60), yTop - yBot, M(22), trim), (X(x0) + X(x1))/2, (yTop + yBot)/2, z));
    g.add(at(roundBox(M(260), M(60), M(60), .02, MAT.black()), (X(x0) + X(x1))/2 + M(80), yTop - M(300), z - side*M(35)));   // the armrest
    g.add(at(rot(cyl(M(70), M(70), M(20), MAT.black(), 16), 0, 0, Math.PI/2), (X(x0) + X(x1))/2 + M(80), yBot + M(200), z - side*M(12)));   // the speaker grille
    add(id, g);
  };
  if (!open){
    const doorEnd = doors4 ? cuts.B : cuts.doorR;
    for (const side of [-1,1]){
      const n = side < 0 ? 1 : 2;
      if (gen('doorcardsF.' + n)) cardAt(cuts.doorF, doorEnd, 'doorcardsF.' + n, side);
      if (doors4 && gen('doorcardsR.' + n)) cardAt(cuts.B, cuts.doorR, 'doorcardsR.' + n, side);
    }
  }
}

/* ======================================================================
 * Variant geometry: the thing the slot is changed to.
 * ==================================================================== */

/** A wheel and tyre, in the chosen style. Axis along Z, dish toward +Z. */
function wheelVariantMesh(v, end, W, T, { race, kart }){
  const r = wheelRadius(v, end === 'R');
  const widthMm = end === 'F' ? v.tyreF : v.tyreR;
  const rimIn = (end === 'F' ? v.rimF : v.rimR) * (W.rimScale || 1);
  const width = M(widthMm) * (T.width || 1);
  const rimR = M(rimIn * 25.4 / 2);
  const treadKind = T.tread === 'knobby' ? 'knobby' : T.tread === 'slick' ? 'slick' : 'road';
  const style = W.style || 'alloy';
  if (style === 'alloy' && !kart){
    /* the factory wheel: the scanned alloy rim where there is one */
    const g = wheelMesh({ radius:r, width, rimR, spokes:W.spokes || 5, style:'alloy', tread:treadKind });
    g.userData.radius = r;
    return g;
  }
  const g = group('wheel');
  const seat = rimR * 1.02, half = width / 2;
  const tyre = lathe([
    [seat, -half*0.96], [seat*1.06, -half*1.00], [r*0.74, -half*1.04], [r*0.93, -half*0.96], [r*0.995, -half*0.72],
    [r, -half*0.40], [r, half*0.40], [r*0.995, half*0.72], [r*0.93, half*0.96], [r*0.74, half*1.04], [seat*1.06, half*1.00], [seat, half*0.96],
  ], MAT.rubber(), 44);
  rot(tyre, Math.PI/2, 0, 0); g.add(tyre);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.002, r * 1.002, width * 0.84, 72, 1, true), MAT.tread(treadKind));
  rot(crown, Math.PI/2, 0, 0); g.add(crown);
  if (T.tread === 'knobby') for (let i = 0; i < 18; i++){           // the lugs an all-terrain wears on its shoulders
    const a = i / 18 * TAU;
    for (const s of [-1,1]){ const lug = box(M(28), M(14), width*0.18, MAT.rubber()); lug.position.set(Math.cos(a)*r*0.985, Math.sin(a)*r*0.985, s*width*0.40); lug.rotation.z = a; g.add(lug); }
  }
  for (const s of [1, -1]){
    const wall = faceDisc(r * 0.80, seat, MAT.sidewall(true), { seg:72, ring:[0.309, 0.494] });
    wall.position.z = s * half * 1.045; if (s < 0) wall.rotation.y = Math.PI; g.add(wall);
  }
  const faceZ = style === 'deepdish' ? half * 0.10 : half * 0.52;      // a deep dish sets the face far inboard
  const mat = style === 'steel' ? MAT.satin(0x2a2d31) : style === 'gravel' ? MAT.gloss(0xe8e9ea) : style === 'beadlock' ? MAT.satin(0x202326)
            : style === 'forged' ? MAT.rimAlloy() : MAT.chrome();
  const barrel = lathe([
    [rimR*0.98, -half*0.94], [rimR*1.05, -half*0.98], [rimR*1.05, -half*0.86], [rimR*0.92, -half*0.70],
    [rimR*0.92, half*0.34], [rimR*1.05, half*0.86], [rimR*1.05, half*0.98], [rimR*0.98, half*0.94],
  ], style === 'deepdish' ? MAT.chrome() : mat, 40);
  rot(barrel, Math.PI/2, 0, 0); g.add(barrel);
  if (style === 'deepdish'){                                         // the polished lip, stepped
    const lip = lathe([[rimR*0.92, faceZ + M(10)], [rimR*1.04, half*0.92], [rimR*1.04, half*0.98], [rimR*0.98, half*0.98]], MAT.chrome(), 40);
    rot(lip, Math.PI/2, 0, 0); g.add(lip);
  }
  if (style === 'steel'){
    const disc = lathe([[rimR*0.18, faceZ - M(30)], [rimR*0.55, faceZ - M(10)], [rimR*0.92, faceZ - M(35)], [rimR*0.92, faceZ - M(55)], [rimR*0.18, faceZ - M(60)]], mat, 40);
    rot(disc, Math.PI/2, 0, 0); g.add(disc);
    for (let i = 0; i < 8; i++){ const a = i/8*TAU; const hole = cyl(rimR*0.07, rimR*0.07, M(14), MAT.black(), 10); rot(hole, Math.PI/2, 0, 0); hole.position.set(Math.cos(a)*rimR*0.70, Math.sin(a)*rimR*0.70, faceZ - M(28)); g.add(hole); }
    const cap = cyl(rimR*0.24, rimR*0.26, M(30), MAT.chrome(), 20); rot(cap, Math.PI/2, 0, 0); cap.position.z = faceZ - M(10); g.add(cap);
    g.userData.radius = r; return g;
  }
  const spokes = W.spokes || 5;
  const hub = cyl(rimR * 0.30, rimR * 0.30, width * 0.30, MAT.alloyDark(), 22);
  rot(hub, Math.PI/2, 0, 0); hub.position.z = faceZ * 0.7; g.add(hub);
  for (let i = 0; i < 5; i++){
    const a = (i / 5) * TAU;
    const n = cyl(rimR * 0.055, rimR * 0.055, width * 0.10, MAT.steel(), 8);
    rot(n, Math.PI/2, 0, 0); n.position.set(Math.cos(a) * rimR * 0.19, Math.sin(a) * rimR * 0.19, faceZ + width*0.03); g.add(n);
  }
  const thin = style === 'forged' ? 0.26 : style === 'gravel' ? 0.70 : style === 'beadlock' ? 0.55 : 0.42;
  for (let i = 0; i < spokes; i++){
    const a = (i / spokes) * TAU;
    const s = new THREE.Shape();
    const rIn = rimR * 0.30, rOut = rimR * 0.95, hw = (Math.PI / spokes) * thin;
    s.moveTo(Math.cos(-hw*0.6) * rIn, Math.sin(-hw*0.6) * rIn);
    s.lineTo(Math.cos(-hw) * rOut, Math.sin(-hw) * rOut);
    s.lineTo(Math.cos(hw) * rOut, Math.sin(hw) * rOut);
    s.lineTo(Math.cos(hw*0.6) * rIn, Math.sin(hw*0.6) * rIn);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: width * (style === 'forged' ? 0.10 : 0.14), bevelEnabled:true, bevelSize: width*0.015, bevelThickness: width*0.015, bevelSegments:1 });
    const spoke = new THREE.Mesh(geo, mat);
    spoke.rotation.z = a;
    /* a deep dish's spokes dive from the lip down to the face */
    if (style === 'deepdish') spoke.rotation.y = 0;
    spoke.position.z = faceZ - width * 0.065;
    g.add(spoke);
  }
  if (style === 'beadlock'){                                          // the clamp ring and its 32 bolts
    const ring = lathe([[rimR*0.86, half*0.90], [rimR*1.10, half*0.90], [rimR*1.10, half*1.02], [rimR*0.86, half*1.02]], MAT.satin(0x3a3d41), 48);
    rot(ring, Math.PI/2, 0, 0); g.add(ring);
    for (let i = 0; i < 32; i++){ const a = i/32*TAU; const b = cyl(M(7), M(7), M(12), MAT.steel(), 6); rot(b, Math.PI/2, 0, 0); b.position.set(Math.cos(a)*rimR*0.98, Math.sin(a)*rimR*0.98, half*1.04); g.add(b); }
  }
  g.userData.radius = r;
  return g;
}

/** A brake disc in the chosen construction. Axis along Z, hat toward −Z. */
function discMesh(B, diaM, end){
  const dia = diaM * (B.size || 1);
  const r = dia / 2;
  if (B.disc === 'drum'){
    const g = group('drum');
    const drum = lathe([[r*0.30, -0.030], [r*0.96, -0.030], [r*1.0, -0.020], [r*1.0, 0.090], [r*0.96, 0.095], [r*0.30, 0.095]], MAT.iron(), 40);
    rot(drum, Math.PI/2, 0, 0); g.add(drum);
    const hub = lathe([[r*0.18, -0.045], [r*0.32, -0.045], [r*0.32, -0.030], [r*0.18, -0.030]], MAT.alloyDark(), 24);
    rot(hub, Math.PI/2, 0, 0); g.add(hub);
    return g;
  }
  if (B.disc === 'solid'){
    const g = group('disc');
    const face = lathe([[r*0.42, -0.006], [r*0.99, -0.006], [r*0.99, 0.006], [r*0.42, 0.006]], MAT.iron(), 40);
    rot(face, Math.PI/2, 0, 0); g.add(face);
    const hat = lathe([[r*0.20, -0.020], [r*0.44, -0.020], [r*0.44, 0.006], [r*0.20, 0.006]], MAT.alloyDark(), 26);
    rot(hat, Math.PI/2, 0, 0); hat.position.z = -0.012; g.add(hat);
    return g;
  }
  const g = brakeDisc(dia, B.disc === 'ceramic' ? MAT.satin(0x2b2d30) : MAT.iron());
  if (B.disc === 'twopiece' || B.disc === 'ceramic'){
    /* an aluminium hat bolted to the ring through a circle of drive bobbins */
    const hat = lathe([[r*0.20, -0.024], [r*0.50, -0.024], [r*0.52, -0.010], [r*0.52, 0.010], [r*0.20, 0.010]], MAT.anodised ? MAT.anodised(0x7c8aa6) : MAT.alloy(), 30);
    rot(hat, Math.PI/2, 0, 0); g.add(hat);
    for (let i = 0; i < 10; i++){ const a = i/10*TAU; const b = cyl(M(5), M(5), 0.034, MAT.steel(), 6); rot(b, Math.PI/2, 0, 0); b.position.set(Math.cos(a)*r*0.51, Math.sin(a)*r*0.51, 0); g.add(b); }
  }
  if (B.disc === 'drilled' || B.disc === 'ceramic'){
    /* drilled: a spiral of holes through the friction face; ceramic: dimples */
    const n = B.disc === 'ceramic' ? 36 : 24, dark = MAT.black();
    for (let i = 0; i < n; i++){
      const a = i / n * TAU * (B.disc === 'ceramic' ? 1 : 1), rr = r * (0.62 + 0.26 * ((i % 3) / 2));
      const h = cyl(B.disc === 'ceramic' ? r*0.018 : r*0.028, B.disc === 'ceramic' ? r*0.018 : r*0.028, 0.030, dark, 8);
      rot(h, Math.PI/2, 0, 0); h.position.set(Math.cos(a + i*0.4) * rr, Math.sin(a + i*0.4) * rr, 0); g.add(h);
    }
  }
  if (B.disc === 'drilled') for (let i = 0; i < 8; i++){                // the slots
    const a = i/8*TAU; const s = box(r*0.30, M(5), M(3) + 0.028, MAT.black()); s.position.set(Math.cos(a)*r*0.72, Math.sin(a)*r*0.72, 0); s.rotation.z = a + 0.35; g.add(s);
  }
  return g;
}

/** A caliper in the chosen construction. */
function caliperMesh(B, diaM, end){
  const dia = diaM * (B.size || 1);
  const r = dia / 2;
  const colour = B.colour != null ? MAT.gloss(B.colour) : MAT.red();
  if (B.disc === 'drum'){
    /* the backplate with the two shoes and the wheel cylinder, which is what is
       behind a drum */
    const g = group('shoes');
    const plate = lathe([[r*0.30, 0], [r*0.98, 0], [r*0.98, 0.004], [r*0.30, 0.004]], MAT.alloyDark(), 36);
    rot(plate, Math.PI/2, 0, 0); g.add(plate);
    for (const s of [-1,1]){
      const shoe = new THREE.Mesh(new THREE.TorusGeometry(r*0.86, r*0.035, 8, 24, Math.PI*0.8), MAT.steel());
      shoe.rotation.z = s > 0 ? Math.PI*0.1 : Math.PI*1.1; shoe.position.z = 0.03; g.add(shoe);
    }
    g.add(at(rot(cyl(r*0.08, r*0.08, r*0.36, MAT.alloy(), 12), Math.PI/2, 0, 0), 0, r*0.88, 0.03));   // the wheel cylinder
    return g;
  }
  const pistons = B.pistons || 1;
  if (pistons <= 2) return caliper(dia, colour);
  /* a fixed monobloc: longer, wrapping further round the disc, with its
     bridge bolts and the pistons staged along it */
  const g = group('caliper');
  const arc = pistons >= 6 ? deg(78) : deg(62);
  const body = new THREE.Mesh(new THREE.TorusGeometry(r*0.80, r*0.17, 10, 28, arc), colour);
  body.rotation.z = -arc/2; body.scale.z = 0.62; g.add(body);
  for (const z of [-r*0.13, r*0.13]) for (let i = 0; i < pistons/2; i++){
    const a = -arc/2 + arc * (i + 0.5) / (pistons/2);
    const size = r * (0.045 + 0.012 * i);
    const p = cyl(size, size, r*0.08, MAT.alloyDark(), 12); rot(p, Math.PI/2, 0, 0);
    p.position.set(Math.cos(a)*r*0.80, Math.sin(a)*r*0.80, z*0.5); g.add(p);
  }
  for (const a of [-arc*0.38, 0, arc*0.38]){ const b = cyl(r*0.03, r*0.03, r*0.36, MAT.steel(), 8); rot(b, Math.PI/2, 0, 0); b.position.set(Math.cos(a)*r*0.97, Math.sin(a)*r*0.97, 0); g.add(b); }
  /* the group is placed with its centre at the disc's edge like the stock caliper,
     so bring the arc back onto the disc */
  const wrap = group('cal');
  body.position.set(0, -r*0.80 + r*0.17, 0);
  g.children.forEach(c => { if (c !== body) c.position.y -= r*0.80 - r*0.17; });
  wrap.add(g);
  return wrap;
}

/** A spring and damper in the chosen construction, standing between top and bot. */
function damperMesh(S, { x, top, bot, z, strut, race }){
  const d = group('damp');
  const type = S.type || 'stock';
  const hlen = top - bot;
  const springCol = S.spring != null ? MAT.gloss(S.spring) : type === 'stock' ? MAT.satin(0x1f2226) : race ? MAT.orange() : MAT.orange();
  const bodyMat = type === 'coilover' ? MAT.anodised ? MAT.anodised(0x8a9bb5) : MAT.alloy() : type === 'lift' ? MAT.gloss(0xd9dde2) : MAT.steel();
  d.add(at(cyl(M(26), M(26), hlen, bodyMat, 12), x, (top+bot)/2, z));                          // the rod and body
  d.add(at(cyl(M(34), M(34), hlen*0.42, type === 'coilover' ? MAT.alloyDark() : MAT.alloyDark(), 12), x, bot + hlen*0.21, z));
  if (type === 'coilover'){
    /* the threaded body with its two adjuster collars and the spring seat */
    d.add(at(cyl(M(37), M(37), hlen*0.30, MAT.anodised ? MAT.anodised(0x3a3f47) : MAT.alloyDark(), 16), x, bot + hlen*0.40, z));
    for (const k of [0.30, 0.37]) d.add(at(cyl(M(52), M(52), M(16), MAT.gloss(0xc81e1e), 16), x, bot + hlen*k, z));
    d.add(at(cyl(M(58), M(58), M(10), MAT.alloyDark(), 16), x, bot + hlen*0.86, z));
    d.add(at(roundBox(M(50), M(40), M(50), .01, MAT.alloyDark()), x, top - M(20), z));           // the rebound adjuster
  }
  if (type === 'air'){
    /* a rubber bellows in place of the coil, and the air line into its top */
    const bag = lathe([[M(30), 0], [M(78), M(20)], [M(70), hlen*0.22], [M(80), hlen*0.30], [M(70), hlen*0.42], [M(80), hlen*0.50], [M(60), hlen*0.58], [M(30), hlen*0.60]], MAT.rubber(), 24);
    d.add(at(bag, x, bot + hlen*0.24, z));
    d.add(pipe([[x, top - M(10), z],[x + M(80), top + M(60), z*0.9],[x + M(200), top + M(40), z*0.8]], M(5), MAT.blue ? MAT.blue() : MAT.black(), 6));
  } else {
    const pts = [];
    const coils = type === 'lift' ? 9 : type === 'lowering' ? 5 : 7;
    const r = type === 'lift' ? M(62) : M(58);
    const y0 = type === 'coilover' ? bot + hlen*0.40 : bot + hlen*0.16, y1 = type === 'coilover' ? bot + hlen*0.84 : bot + hlen*0.86;
    for (let i = 0; i <= 96; i++){
      const t = i/96, ang = t * TAU * coils;
      pts.push(new THREE.Vector3(x + Math.cos(ang)*r, y0 + t*(y1 - y0), z + Math.sin(ang)*r));
    }
    d.add(pipe(pts, type === 'lift' ? M(13) : M(11), springCol, 6));
  }
  if (type === 'lift') d.add(at(cyl(M(28), M(28), hlen*0.5, MAT.alloy(), 12), x + M(70), (top+bot)/2 + hlen*0.1, z));   // the remote reservoir
  if (strut) d.add(at(cyl(M(70), M(70), M(30), MAT.rubber(), 16), x, top - M(15), z));          // the top mount
  return d;
}

/** The steering wheel, on the column hub, raked back toward the driver. */
function steeringWheelMesh(S, hub, open){
  const g = group('steeringwheel');
  const dia = S.dia || 0.370;
  const type = S.type || 'stock';
  const rim = type === 'quickrelease' ? MAT.satin(0x1c1c1e) : MAT.black();
  /* built in a local frame: the rim lies in the local YZ plane, facing +X,
     then the whole thing is tilted about Z and set on the hub */
  const w = group('rim');
  if (open){
    w.add(roundBox(M(40), M(190), dia*0.72, .03, MAT.carbon()));
    for (const s of [-1,1]) w.add(at(roundBox(M(50), M(90), M(70), .02, rim), 0, M(20), s*dia*0.40));
    w.add(at(roundBox(M(30), M(70), M(140), .01, MAT.black()), M(30), M(70), 0));
  } else {
    const ring = torus(dia/2, type === 'stock' ? M(16) : M(19), rim, 14);
    ring.rotation.y = Math.PI/2; w.add(ring);
    const boss = cyl(type === 'stock' ? M(80) : M(45), type === 'stock' ? M(80) : M(45), M(50), type === 'stock' ? MAT.black() : MAT.alloyDark(), 20);
    boss.rotation.z = Math.PI/2; boss.position.x = -M(10); w.add(boss);
    for (const a of [0, Math.PI, -Math.PI/2]){           // three spokes: left, right, down
      const sp = box(M(14), M(28), dia/2 - M(30), type === 'stock' ? MAT.black() : MAT.alloy());
      sp.position.set(-M(10), Math.sin(a) * dia/4, Math.cos(a) * dia/4);
      sp.rotation.x = -a; w.add(sp);
    }
    if (type === 'quickrelease'){
      w.add(at(rot(cyl(M(46), M(46), M(60), MAT.gloss(0xb01010), 20), 0, 0, Math.PI/2), -M(60), 0, 0));   // the release collar
      w.add(at(rot(cyl(M(30), M(30), M(50), MAT.steel(), 20), 0, 0, Math.PI/2), -M(110), 0, 0));
    }
  }
  w.rotation.z = open ? 0 : deg(-22);
  w.position.copy(hub);
  g.add(w);
  return g;
}

/** The exhaust rear section in the chosen style. */
function exhaustRearMesh(E, { boxX, exY, exZ, len, wid, X, fwd, floorY, hgt, axR, mid }){
  const g = group('rearbox');
  const type = E.type || 'stock';
  const tipMat = MAT.stainless ? MAT.stainless() : MAT.chrome();
  const tailX = X(1.0) - M(40), tipY = floorY + hgt*0.10;
  if (type === 'side'){
    const sx = axR + M(760), sz = -wid*0.44;
    g.add(at(rot(cyl(M(70), M(70), M(420), MAT.steel(), 16), 0, 0, Math.PI/2), sx + M(120), exY + M(40), sz + M(60)));
    const tip = tubeMesh(M(44), M(38), M(140), tipMat, 18); rot(tip, Math.PI/2, 0, deg(0)); tip.rotation.set(Math.PI/2, 0, 0);
    g.add(at(tip, sx - M(60), exY + M(40), sz - M(40)));
    return g;
  }
  if (type === 'straight'){
    g.add(pipe([[boxX + M(260), exY, exZ],[tailX - M(160), exY, exZ*1.3],[tailX, tipY, exZ*1.6]], M(40), MAT.steel(), 12));
    if (!fwd) g.add(pipe([[boxX + M(260), exY, exZ],[tailX - M(160), exY, -exZ*1.3],[tailX, tipY, -exZ*1.6]], M(40), MAT.steel(), 12));
    for (const s of (fwd ? [1] : [-1, 1])){ const tip = tubeMesh(M(52), M(46), M(140), tipMat, 18); rot(tip, 0, 0, Math.PI/2); g.add(at(tip, tailX, tipY, s*exZ*1.6)); }
    return g;
  }
  /* a transverse silencer box across the back, with tips out the valance */
  const bw = type === 'catback' ? M(360) : M(440), br = type === 'catback' ? M(65) : M(70);
  g.add(at(rot(roundBox(M(300), br*2, bw, .05, type === 'catback' ? MAT.stainless ? MAT.stainless() : MAT.chrome() : MAT.steel()), 0, 0, 0), boxX, exY + M(30), exZ*0.6));
  g.add(pipe([[boxX + M(150), exY, exZ],[boxX + M(260), exY, exZ]], M(34), MAT.iron(), 8));
  const tips = fwd ? [1] : [-1, 1];
  for (const s of tips){
    g.add(pipe([[boxX - M(150), exY, exZ*0.6],[boxX - M(300), exY, s*wid*0.20],[tailX, tipY, s*wid*0.24]], M(type === 'catback' ? 38 : 32), MAT.steel(), 8));
    const tr = type === 'catback' ? M(50) : M(42);
    const tip = tubeMesh(tr, tr - M(5), M(150), tipMat, 18); rot(tip, 0, 0, Math.PI/2); g.add(at(tip, tailX + M(20), tipY, s*wid*0.24));
  }
  return g;
}

/** The rear spoiler or wing, sat on the boot lid at its trailing edge. */
function spoilerMesh(S, { X, len, wid, hgt, floorY, cuts, topY, colour }){
  const g = group('spoiler');
  const type = S.type || 'none';
  if (type === 'none') return null;
  const tEdge = 0.965;
  const x = X(tEdge), y = topY(tEdge);
  const w = wid * 0.78;
  if (type === 'lip'){
    g.add(at(rot(roundBox(M(110), M(22), w, .01, MAT.paint(colour, 1)), 0, 0, deg(-16)), x + M(20), y + M(26), 0));
    return g;
  }
  if (type === 'ducktail'){
    const dt = group('ducktail');
    dt.add(at(rot(roundBox(M(260), M(40), w, .02, MAT.paint(colour, 1)), 0, 0, deg(-24)), x + M(60), y + M(60), 0));
    for (const s of [-1,1]) dt.add(at(rot(box(M(240), M(90), M(24), MAT.paint(colour, 1)), 0, 0, deg(-24)), x + M(40), y + M(20), s*w/2));
    g.add(dt); return g;
  }
  /* a GT wing: the aerofoil on two swan-neck uprights, with endplates */
  const wy = y + hgt*0.20, ww = wid*0.86;
  const foil = new THREE.Mesh(new THREE.ExtrudeGeometry((() => {
    const s = new THREE.Shape(); s.moveTo(-M(150), 0); s.quadraticCurveTo(-M(60), M(44), M(150), M(6)); s.quadraticCurveTo(M(20), -M(26), -M(150), 0); return s; })(),
    { depth: ww, bevelEnabled:false }), MAT.carbon());
  foil.rotation.set(0, 0, deg(-8)); foil.position.set(x + M(20), wy, -ww/2); g.add(foil);
  for (const s of [-1,1]){
    g.add(at(box(M(360), M(160), M(10), MAT.carbon()), x, wy + M(20), s*(ww/2 + M(5))));                       // the endplate
    g.add(pipe([[x + M(140), y + M(8), s*wid*0.26],[x + M(100), wy + M(60), s*wid*0.26],[x - M(20), wy + M(60), s*wid*0.26],[x - M(40), wy + M(20), s*wid*0.26]], M(14), MAT.alloyDark(), 8));   // the swan neck
    g.add(at(box(M(140), M(14), M(80), MAT.alloyDark()), x + M(140), y + M(8), s*wid*0.26));                   // the foot on the lid
  }
  return g;
}

/* ----------------------------------------------------------------------
 * A car body is a lofted surface, not a flat extrusion. Each style is defined
 * by four longitudinal curves — roofline, sill line, body width and greenhouse
 * width — sampled into cross-sections and skinned. That is what gives it a
 * crowned roof, a tapering nose, hips over the rear arches and tumblehome.
 * t runs 0 at the front bumper to 1 at the tail.
 * -------------------------------------------------------------------- */
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

/* a point on a section's superellipse at angle th: the loft's own equation */
function ringPoint(sec, th, lift = 1){
  const cz = Math.cos(th), cy = Math.sin(th);
  const n = sec.squ;
  const sz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / n);
  const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / n);
  const w = (cy >= 0 ? sec.wBot + (sec.wTop - sec.wBot) * cy : sec.wBot) * lift;
  const yMid = (sec.yTop + sec.yBot) / 2, hH = Math.max(1e-4, (sec.yTop - sec.yBot) / 2);
  return [sec.x, yMid + hH * sy, w * sz];
}

/** Skin the sections into a closed surface and cut it into panels.
 *
 *  Each quad of the loft is classified by its centre and its normal against
 *  the body lines — the same rule the scan splitter uses — and the triangles
 *  of each panel become one mesh. Because every ring shares the same angular
 *  sampling and extra rings are placed exactly on the shut lines, the seams
 *  come out as straight lines, not sawteeth. */
function loftPanels(surf, len, hgt, floorY, cuts, opts){
  const { body:sections } = surf;
  const N = 56;
  const rings = sections.length;
  const pos = [];
  for (const sec of sections) for (let j = 0; j < N; j++) pos.push(ringPoint(sec, (j / N) * Math.PI * 2));
  const tris = new Map();                              // id -> [a,b,c, ...] vertex positions
  const put = (id, a, b, c) => { if (!tris.has(id)) tris.set(id, []); tris.get(id).push(a, b, c); };
  const X = (t) => len / 2 - t * len;
  const tOf = (x) => (len / 2 - x) / len;
  const secAtX = (x) => { let best = sections[0]; for (const s of sections) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s; return best; };
  const classify = (p0, p1, p2) => {
    const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    /* the loft's winding points outward for the sides; make sure of it */
    if ((cz * nz) < 0 && Math.abs(nz) > 0.5){ nx = -nx; ny = -ny; nz = -nz; }
    const sec = secAtX(cx);
    const t = Math.max(0, Math.min(1, tOf(cx)));
    return panelFor({ t, y:cy, z:cz, nx, ny, nz, waist:sec.waistY, sill:sec.doorSill, cabin:sec.cabin, cuts, doors4:opts.doors4, pickup:opts.pickup });
  };
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < N; j++){
      const a = pos[i*N + j], b = pos[i*N + (j+1)%N], c = pos[(i+1)*N + (j+1)%N], d = pos[(i+1)*N + j];
      /* one label per quad, so a seam never cuts a quad diagonally */
      const id = classify(a, b, c);
      put(id, a, b, c); put(id, a, c, d);
    }
  for (const [ringIndex, flip] of [[0, false], [rings-1, true]]){
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < N; j++){ const p = pos[ringIndex*N + j]; cx += p[0]; cy += p[1]; cz += p[2]; }
    const ctr = [cx/N, cy/N, cz/N];
    for (let j = 0; j < N; j++){
      const a = pos[ringIndex*N + j], b = pos[ringIndex*N + (j+1)%N];
      const id = ringIndex === 0 ? (a[1] + b[1]) / 2 > secAtX(a[0]).waistY - M(20) ? 'bonnet' : 'bumperF'
                                 : (a[1] + b[1]) / 2 > secAtX(a[0]).waistY - M(30) ? 'bootlid' : 'bumperR';
      if (flip) put(id, ctr, b, a); else put(id, ctr, a, b);
    }
  }
  const out = [];
  const bonnetMat = opts.bonnet?.type === 'carbon' ? MAT.carbon() : opts.paint;
  const roofMat = opts.roof?.type === 'carbon' ? MAT.carbon() : opts.paint;
  const bumperMat = opts.paint;
  for (const [id, arr] of tris){
    const g = new THREE.BufferGeometry();
    const flat = new Float32Array(arr.length * 3);
    arr.forEach((p, i) => { flat[i*3] = p[0]; flat[i*3+1] = p[1]; flat[i*3+2] = p[2]; });
    g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    g.computeVertexNormals(); ensureUV(g, 4);
    const mat = id === 'chassis' ? MAT.underbody() : id === 'bonnet' ? bonnetMat : id === 'roof' ? roofMat
              : id.startsWith('sills') ? MAT.satin(0x15171a) : id.startsWith('bumper') ? bumperMat : opts.paint;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'panel:' + id;
    if (id === 'chassis') mesh.name = 'floorpan';
    out.push([id, mesh]);
    /* the vented bonnet gets its louvres, the sunroof its glass */
    if (id === 'bonnet' && opts.bonnet?.type === 'vented'){
      const sec = secAtX(X(cuts.bonnet * 0.55));
      const grp = group('vents');
      for (let i = 0; i < 6; i++) for (const s of [-1,1])
        grp.add(at(rot(box(M(26), M(10), sec.wTop*0.26, MAT.black()), 0, 0, deg(-30)), X(cuts.bonnet * 0.42) + i*M(70), sec.yTop + M(6), s*sec.wTop*0.46));
      grp.add(at(roundBox(M(260), M(60), sec.wTop*0.42, .02, bonnetMat), X(cuts.bonnet * 0.78), sec.yTop + M(20), 0));   // the scoop
      out.push([id, grp]);
    }
    if (id === 'roof' && opts.roof?.type === 'sunroof'){
      const tM = (cuts.doorF + cuts.B) / 2;
      const sec = secAtX(X(tM));
      out.push([id, at(box(M(700), M(8), sec.wTop*0.62, new THREE.MeshPhysicalMaterial({ color:0x05080c, roughness:0.05, clearcoat:1, metalness:0, envMapIntensity:2.6 })), X(tM), sec.yTop + M(5), 0)]);
    }
  }
  return out;
}

/* ----------------------------------------------------------------------
 * Body detail: lamps set into the skin, panel gaps, arch lips, mirrors, the
 * grille, intakes and pipes. Every piece is placed against the shell's own
 * surface and handed to the panel it lies on, so it comes off with it.
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
    p(x, y, side, lift = 0){ return new THREE.Vector3(x, y, side * (this.z(x, y) + lift)); },
    top(x){ const c = secAt(x); return c ? c.yTop : 0; },
    bot(x){ const c = secAt(x); return c ? c.yBot : 0; },
  };
}

function bodyDetail(v, L, sections, len, hgt, wid, floorY, axF, axR, rF, rR, cuts, lightV, mirrorV){
  const out = new Map();
  const give = (id, obj) => { if (!obj) return; if (!out.has(id)) out.set(id, []); out.get(id).push(obj); };
  const sp = shellProbe(sections);
  if (!sp.secAt(0)) return out;
  const X = (t) => len / 2 - t * len;
  const waist = (t) => floorY + hgt * curveAt(L.waist, t);
  const dark   = MAT.black();
  const rubber = MAT.rubber();
  const gap    = new THREE.MeshStandardMaterial({ color:0x0a0c10, roughness:0.9, metalness:0.0 });
  const lt = lightV?.type || 'xenon';
  const lensF  = new THREE.MeshPhysicalMaterial({ color: lt === 'halogen' ? 0xf4e7c6 : lt === 'led' ? 0xeef4ff : 0xdfe8ff, metalness:0.0, roughness:0.06,
                   clearcoat:1, transmission:0.55, thickness:0.02, ior:1.45,
                   emissive: lt === 'halogen' ? 0xf2d58a : lt === 'led' ? 0xe9f2ff : 0xbcd0f0, emissiveIntensity: lt === 'led' ? 1.1 : 0.85, envMapIntensity:2.4 });
  const lensR  = new THREE.MeshPhysicalMaterial({ color:0x8c0d10, metalness:0.0, roughness:0.10,
                   clearcoat:1, transmission:0.35, thickness:0.02, ior:1.45,
                   emissive:0xe01820, emissiveIntensity:1.15, envMapIntensity:2.0 });
  const amber  = new THREE.MeshPhysicalMaterial({ color:0xc06a10, metalness:0.0, roughness:0.12,
                   clearcoat:1, emissive:0xe08a18, emissiveIntensity:0.80 });
  const side1 = (s) => s < 0 ? 1 : 2;

  /* --- panel gaps: a 5 mm dark line lying in the skin ------------------- */
  const seam = (id, pts, r = M(5)) => pts.length > 1 && give(id, pipe(pts, r, gap, 5));
  const runV = (t, y0, y1, side, n = 9) => {
    const out2 = [], x = X(t);
    for (let i = 0; i <= n; i++){
      const y = y0 + (y1 - y0) * (i / n);
      if (y > sp.top(x) - M(20) || y < sp.bot(x) + M(10)) continue;
      if (sp.z(x, y) < M(60)) continue;
      out2.push(sp.p(x, y, side, M(3)).toArray());
    }
    return out2;
  };
  const runH = (t0, t1, y, side, n = 12) => {
    const out2 = [];
    for (let i = 0; i <= n; i++){
      const t = t0 + (t1 - t0) * (i / n);
      const x = X(t);
      if (y > sp.top(x) - M(20) || y < sp.bot(x) + M(10)) continue;
      if (sp.z(x, y) < M(60)) continue;
      out2.push(sp.p(x, y, side, M(3)).toArray());
    }
    return out2;
  };
  const doors4 = ['sedan','hatch','suv','rally','pickup'].includes(v.body);
  for (const side of [-1, 1]){
    const sill = sections[Math.floor(sections.length/2)].doorSill;
    const dF = 'doorF.' + side1(side), dR = doors4 ? 'doorR.' + side1(side) : dF;
    seam(dF, runV(cuts.doorF, sill, sp.top(X(cuts.doorF)) - hgt * 0.012, side));
    if (doors4) seam(dR, runV(cuts.B, sill, sp.top(X(cuts.B)) - hgt * 0.012, side));
    seam(dR, runV(cuts.doorR, sill, sp.top(X(cuts.doorR)) - hgt * 0.012, side));
    seam(dF, runH(cuts.doorF, doors4 ? cuts.B : cuts.doorR, sill, side));
    if (doors4) seam(dR, runH(cuts.B, cuts.doorR, sill, side));
    for (const [t0, t1, id] of [[0.06, cuts.bonnet, 'bonnet'], [cuts.boot, 0.96, 'bootlid']]){
      const pts = [];
      for (let i = 0; i <= 10; i++){
        const t = t0 + (t1 - t0) * (i / 10), x = X(t), y = waist(t) - hgt * 0.012;
        if (sp.z(x, y) < M(60)) continue;
        pts.push(sp.p(x, y, side, M(3)).toArray());
      }
      seam(id, pts);
    }
  }
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
  seam('bonnet', arc(cuts.bonnet)); seam('bootlid', arc(cuts.boot));

  /* --- wheel arch lips, on the wing and the quarter ---------------------- */
  for (const [ax, r, idBase] of [[axF, rF, 'wingF'], [axR, rR, 'quarters']])
    for (const side of [-1, 1]){
      const pts = [];
      for (let i = 0; i <= 16; i++){
        const th = Math.PI * (0.07 + 0.86 * (i / 16));
        const x = ax + r * 1.30 * Math.cos(th);
        const y = Math.max(sp.bot(x) + M(10), r + r * 1.24 * Math.sin(th));
        pts.push(sp.p(x, y, side, M(2)).toArray());
      }
      give(idBase + '.' + side1(side), pipe(pts, M(13), rubber, 6));
    }

  /* --- lower body: the skirt line on the sills, the bumper strips -------- */
  const skirtY = Math.max(sp.bot(X(0.5)) + hgt * 0.02, floorY + hgt * 0.07);
  for (const side of [-1, 1]){
    const sk = [];
    for (let i = 0; i <= 14; i++){
      const t = cuts.doorF + (cuts.doorR - cuts.doorF) * (i / 14), x = X(t);
      if (sp.z(x, skirtY) < M(80)) continue;
      sk.push(sp.p(x, skirtY, side, -M(6)).toArray());
    }
    if (sk.length > 3) give('sills.' + side1(side), pipe(sk, M(26), dark, 6));
  }
  for (const [t0, t1, id] of [[0.005, 0.10, 'bumperF'], [0.90, 0.995, 'bumperR']]){
    for (const side of [-1, 1]){
      const bp = [];
      for (let i = 0; i <= 10; i++){
        const t = t0 + (t1 - t0) * (i / 10), x = X(t);
        const y = Math.max(floorY + hgt * 0.135, sp.bot(x) + M(70));
        if (sp.z(x, y) < M(50)) continue;
        bp.push(sp.p(x, y, side, -M(4)).toArray());
      }
      if (bp.length > 3) give(id, pipe(bp, M(30), dark, 6));
    }
  }

  /* --- lights: a lens in a dark housing, one part per corner -------------
     The lamps sit just under the bonnet's leading edge and the boot's trailing
     edge, and the lens sits flush in the skin: the housing runs back into the
     body from the first station where the skin is wide enough to hold it. */
  const hhF = hgt * 0.072, rhR = hgt * 0.062;
  const lampY = Math.min(waist(0.06) - hgt * 0.045, Math.min(sp.top(X(0.045)), sp.top(X(0.075))) - hhF * 0.60 - M(30));
  const tailY = Math.min(waist(0.95) - hgt * 0.035, Math.min(sp.top(X(0.945)), sp.top(X(0.975))) - rhR * 0.62 - M(30));
  const faceT = (y, zAbs, fromTail) => {
    for (let i = 0; i <= 120; i++){ const t = fromTail ? 1 - i * 0.002 : i * 0.002; if (sp.z(X(t), y) >= zAbs) return t; }
    return fromTail ? 0.94 : 0.06;
  };
  for (const side of [-1, 1]){
    const zf = sp.z(X(0.06), lampY), zr = sp.z(X(0.945), tailY);
    if (zf > M(60)){
      const hl = group('headlamp');
      const hz = zf * 0.44, hh = hhF, zc = zf * 0.52;
      const tFace = faceT(lampY, zc + hz * 0.56 + M(10), false);
      const xFace = X(tFace), depth = Math.max(M(90), X(tFace) - X(0.085));
      hl.add(at(roundBox(depth, hh * 1.20, hz * 1.12, .012, dark), xFace - depth/2 - M(4), lampY, side * zc));
      hl.add(at(roundBox(M(14), hh, hz, .006, lensF), xFace - M(4), lampY, side * zc));
      if (lt === 'led'){
        for (const k of [-1, 0, 1]) hl.add(at(rot(cyl(hh * 0.16, hh * 0.16, M(60), MAT.chrome(), 12), 0, 0, Math.PI/2), xFace - M(45), lampY + hh*0.12, side * zc + k * hz * 0.28));
        hl.add(at(roundBox(M(14), hh * 0.12, hz * 0.9, .004, new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xffffff, emissiveIntensity:1.6 })), xFace - M(2), lampY - hh*0.36, side * zc));
      } else if (lt === 'xenon'){
        for (const k of [-1, 1]) hl.add(at(rot(cyl(hh * 0.32, hh * 0.32, M(56), MAT.chrome(), 14), 0, 0, Math.PI/2), xFace - M(45), lampY, side * zc + k * hz * 0.28));
      } else {
        hl.add(at(rot(cyl(hh * 0.44, hh * 0.30, M(50), MAT.chrome(), 18), 0, 0, Math.PI/2), xFace - M(42), lampY, side * zc));
      }
      const tInd = faceT(lampY - hgt * 0.058, zf * 0.84 + zf * 0.09, false);
      hl.add(at(roundBox(M(14), hgt * 0.030, zf * 0.16, .006, amber), X(tInd) - M(6), lampY - hgt * 0.058, side * zf * 0.84));
      give('headlamp.' + side1(side), hl);
    }
    if (zr > M(60)){
      const tl = group('taillamp');
      const rz = zr * 0.42, rh = rhR, zc = zr * 0.54;
      const tFace = faceT(tailY, zc + rz * 0.57 + M(10), true);
      const xFace = X(tFace), depth = Math.max(M(80), X(0.93) - xFace);
      tl.add(at(roundBox(depth, rh * 1.24, rz * 1.14, .012, dark), xFace + depth/2 + M(4), tailY, side * zc));
      tl.add(at(roundBox(M(14), rh, rz, .006, lensR), xFace + M(4), tailY, side * zc));
      tl.add(at(roundBox(M(12), rh * 0.4, rz * 0.3, .004, MAT.glass()), xFace + M(3), tailY - rh*0.28, side * zr * 0.30));   // the reverse lamp
      give('taillamp.' + side1(side), tl);
    }
  }

  /* --- lower intakes in the bumper -------------------------------------- */
  const gy = floorY + hgt * 0.20;
  const gz = sp.z(X(0.035), gy);
  const iy = Math.max(floorY + hgt * 0.10, sp.bot(X(0.028)) + hgt * 0.045 + M(20));
  if (gz > M(80) && iy < gy) for (const side of [-1, 1])
    give('bumperF', at(roundBox(M(70), hgt * 0.09, gz * 0.34, .01, dark), X(0.028), iy, side * sp.z(X(0.028), iy) * 0.66));

  /* --- mirrors ---------------------------------------------------------- */
  const mt = cuts.doorF + 0.03, my = waist(mt) + hgt * 0.012;
  const mz = sp.z(X(mt), my);
  if (mz > M(120)) for (const side of [-1, 1]){
    const g2 = group('mirror');
    if (mirrorV?.type === 'aero'){
      g2.add(at(rot(cyl(M(10), M(14), M(120), MAT.carbon(), 10), 0, 0, deg(80)), M(10), M(10), side * M(50)));
      g2.add(at(roundBox(M(50), M(66), M(120), .03, MAT.carbon()), -M(10), M(40), side * M(118)));
      g2.add(at(roundBox(M(8), M(56), M(100), .01, MAT.chrome()), -M(36), M(40), side * M(120)));
    } else {
      g2.add(at(rot(cyl(M(14), M(20), M(58), dark, 10), 0, 0, deg(78)), M(16), -M(16), side * M(24)));
      g2.add(at(roundBox(M(62), M(88), M(150), .03, MAT.paint(v.colour, 1)), 0, 0, side * M(64)));
      g2.add(at(roundBox(M(14), M(74), M(128), .01, MAT.chrome()), -M(28), 0, side * M(66)));
    }
    give('mirrors.' + side1(side), at(g2, X(mt), my, side * (mz - M(10))));
  }

  /* --- wipers, parked along the windscreen base ------------------------- */
  {
    const wp = group('wipers');
    const tw = cuts.doorF - 0.012, wy = waist(tw) + hgt * 0.018, wx = X(tw);
    for (const s of [-1, 1]){
      const z0 = s * wid * 0.08 - wid * 0.12;
      wp.add(pipe([[wx, wy, z0],[wx - M(60), wy + M(40), z0 + M(300)]], M(7), dark, 5));
      wp.add(pipe([[wx - M(40), wy + M(30), z0 + M(80)],[wx - M(110), wy + M(80), z0 + M(420)]], M(5), rubber, 4));
    }
    give('wipers', wp);
  }

  /* --- a side intake, on anything with the engine behind the driver ------ */
  if (v.bay === 'mid' || v.bay === 'rear'){
    const it = 0.66, iy = waist(it) - hgt * 0.055;
    const iz = sp.z(X(it), iy);
    for (const side of [-1, 1]){
      give('quarters.' + side1(side), at(roundBox(len * 0.10, hgt * 0.13, M(60), .02, dark), X(it), iy, side * (iz - M(20))));
      give('quarters.' + side1(side), at(rot(coreMesh(hgt * 0.10, len * 0.075, M(30), {}, 14), Math.PI/2, 0, 0), X(it), iy, side * (iz - M(34))));
    }
  }

  /* --- the rear valance and the fuel flap -------------------------------- */
  const ey = Math.max(floorY + hgt * 0.10, sp.bot(X(0.985)) + hgt * 0.06);
  const ez = sp.z(X(0.985), ey);
  if (ez > M(80)) give('bumperR', at(roundBox(M(130), hgt * 0.10, ez * 1.5, .02, dark), X(0.985), ey - hgt * 0.045, 0));
  {
    const ft = Math.min(cuts.boot - 0.03, Math.max(cuts.doorR + 0.02, (len/2 - axR + rR*1.42) / len)), fy = waist(ft) - hgt * 0.10;
    const fz = sp.z(X(ft), fy);
    if (fz > M(100)) give('fuelflap', at(roundBox(M(150), M(150), M(8), .02, MAT.paint(v.colour, 1)).rotateY(Math.PI/2), X(ft), fy, -(fz + M(2))));
  }
  return out;
}

/** The body: one continuous surface from nose to tail, sill to roof, sampled
 *  into sections — with a section placed exactly on every shut line so the
 *  panel seams are straight. */
function bodySurfaces(v, len, hgt, floorY, axF, axR, rF, rR, cuts){
  const L = BODY_LINES[v.body] || BODY_LINES.sedan;
  const halfW = M(v.widthMm) / 2;
  const overF = (M(v.trackF || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreF) / 2;
  const overR = (M(v.trackR || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreR) / 2;
  const N = 80;
  const ts = new Set();
  for (let i = 0; i < N; i++) ts.add(i / (N - 1));
  for (const c of [cuts.bonnet, cuts.doorF, cuts.doorR, cuts.boot, cuts.B, cuts.bumperF, cuts.bumperR])
    if (c > 0.01 && c < 0.99){ ts.add(c - 0.0005); ts.add(c + 0.0005); }
  const T = [...ts].sort((a, b) => a - b);
  const body = [];
  let tFirst = 1, tLast = 0;
  const doorSill = Math.max(floorY + hgt * curveAt(L.sill, 0.5) + hgt * 0.04, floorY + hgt * 0.10);
  for (const t of T){
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
    const cabin = roofY > waistY + hgt * 0.055;
    const topY  = Math.max(roofY, waistY);
    if (cabin){ tFirst = Math.min(tFirst, t); tLast = Math.max(tLast, t); }
    body.push({ x, t, yBot:sillY, yTop:Math.max(topY, sillY + hgt * 0.03),
                wBot:wide, wTop:wide * (cabin ? L.ghW : 0.94),
                squ:L.squL, waistY, roofY, cabin, doorSill });
  }
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
  g.setIndex(idx); g.computeVertexNormals(); ensureUV(g, 4);
  return new THREE.Mesh(g, mat);
}

/** The glazing: windscreen, rear screen and a pane per door, each its own
 *  part, cut into the body so the pillars are the paint left between them. */
function bodyGlazing(surf, len, hgt, glassMat, opts){
  const { L, body, tFirst, tLast } = surf;
  const out = [];
  const P = L.pillars || [];
  if (!P.length || tLast <= tFirst) return out;
  const secAt = (t) => {
    let i = 0; while (i < body.length - 2 && body[i + 1].t <= t) i++;
    const a = body[i], b = body[i + 1] || a, f = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)));
    const m = (p, q) => p + (q - p) * f;
    return { x:m(a.x,b.x), yBot:m(a.yBot,b.yBot), yTop:m(a.yTop,b.yTop),
             wBot:m(a.wBot,b.wBot), wTop:m(a.wTop,b.wTop), squ:m(a.squ,b.squ),
             waistY:m(a.waistY,b.waistY), roofY:m(a.roofY,b.roofY) };
  };
  const LIFT = 1.018;
  const thAt = (c, y) => {
    const yMid = (c.yTop + c.yBot) / 2, hH = Math.max(1e-4, (c.yTop - c.yBot) / 2);
    const sy = Math.max(-0.999, Math.min(0.999, (y - yMid) / hH));
    const n = c.squ || 5;
    return Math.asin(Math.sign(sy) * Math.pow(Math.abs(sy), n / 2));
  };
  const pt = (c, th) => { const p = ringPoint(c, th, LIFT); return new THREE.Vector3(p[0], p[1], p[2]); };
  const cross = (id, t0, t1, inset) => {
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
    if (rows.length > 1){ const m = patch(rows, glassMat); m.name = 'glass:' + id; out.push([id, m]); }
  };
  const flank = (id, t0, t1, side) => {
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
    if (rows.length > 1){ const m = patch(rows, glassMat); m.name = 'glass:' + id; out.push([id, m]); }
  };
  const A = P[0], C = P[P.length - 1];
  cross('windscreen', Math.max(tFirst + 0.004, A[0]), A[1], 0.010);
  if (!opts.roadster) cross('rearscreen', C[1], Math.min(tLast - 0.004, C[0]), 0.014);
  /* one pane per door: three pillars give two panes a side; two pillars on a
     four-door body are split at the B-post; a roadster has only its door glass */
  const spans = P.length >= 3
    ? [['glassF', A[1] + 0.012, P[1][0] - 0.014], [opts.doors4 ? 'glassR' : 'glassQ', P[1][0] + 0.014, C[1] - 0.012]]
    : P.length === 1 ? [['glassF', A[1] + 0.012, tLast - 0.03]]
    : opts.doors4 && opts.B ? [['glassF', A[1] + 0.012, opts.B - 0.012], ['glassR', opts.B + 0.012, C[1] - 0.012]]
    : [['glassF', A[1] + 0.012, C[1] - 0.012]];
  for (const [id, t0, t1] of spans){
    if (t1 - t0 < 0.02) continue;
    flank(id + '.2', t0, t1, 1); flank(id + '.1', t0, t1, -1);
  }
  return out;
}

export const BODY_LINES = {
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
    /* JM Tucson proportions: high beltline (~0.63 of height), a bonnet a third
       of the length, a blunt nose, fast A-pillar, upright C-pillar and tailgate */
    sill :[[0,0.150],[0.10,0.112],[0.35,0.102],[0.65,0.102],[0.90,0.112],[1,0.160]],
    wide :[[0,0.80],[0.08,0.86],[0.20,0.96],[0.36,0.99],[0.60,1.00],[0.80,0.99],[0.93,0.95],[1,0.90]],
    waist:[[0,0.40],[0.06,0.52],[0.16,0.585],[0.30,0.600],[0.50,0.615],[0.72,0.625],[0.92,0.635],[1,0.60]],
    roof :[[0,0.26],[0.30,0.56],[0.36,0.76],[0.43,0.94],[0.49,1.00],[0.84,1.00],[0.92,0.96],[0.97,0.82],[1,0.62]],
    pillars:[[0.335,0.455],[0.585,0.585],[0.865,0.835]],
    ghW:0.88, squL:5.8, squG:4.2,
    cuts:{ bonnet:0.31, doorF:0.34, doorR:0.72, boot:0.90 },
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
  return finalize(root, nodes, anim, v, imported ? 'body' : null);
}

/* ====================================================================== */
function finalize(root, nodes, anim, v, shellId = null){
  const home = new Map();
  for (const [id, objs] of nodes) for (const o of objs){
    home.set(o, o.position.clone());
    o.userData.explodeDir = vExplodeDir(id, o);
  }
  const bounds = boundsOf(root);
  return {
    root, nodes, anim, home, bounds,
    /* a split scan has no single shell any more: every panel is its own part,
       so nothing is ever hidden "under" a shell. Bikes still wear theirs. */
    shellId,
    keepIds: new Set(v.modelKeeps || []),
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

/* which way a part comes off when the model explodes — a left-hand piece goes
   left, a right-hand piece right, a front piece forward */
function vExplodeDir(id, o){
  const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
  const base = id.includes('.') ? id.slice(0, id.indexOf('.')) : id;
  const n = id.includes('.') ? Number(id.slice(id.indexOf('.') + 1)) : 0;
  const side = n === 1 || n === 3 ? -1 : n === 2 || n === 4 ? 1 : 0;
  const map = {
    chassis:V3(0,0,0), subfront:V3(0.7,-0.5,0), subrear:V3(-0.7,-0.5,0), mounts:V3(0.4,0.4,0), cage:V3(0,1.2,0), halo:V3(0,1.4,0), floortray:V3(0,-0.6,0),
    engine:V3(0,1.1,0), gearbox:V3(-0.5,0.8,0.4), transfer:V3(-0.6,-0.4,0.5), prop:V3(0,-0.7,0),
    diff:V3(-0.9,-0.4,0), difff:V3(0.9,-0.4,0), axles:V3(0,-0.3,0.9),
    lcaf:V3(0.7,-0.35,0.9), ucaf:V3(0.7,0.5,0.9), strutf:V3(0.5,0.9,0.8), dampf:V3(0.5,0.9,0.8),
    uprf:V3(0.6,0,1.2), arbf:V3(0.9,-0.2,0), arblinkf:V3(0.7,-0.1,1.0), tierods:V3(0.9,0.1,0.6),
    lcar:V3(-0.7,-0.35,0.9), ucar:V3(-0.7,0.5,0.9), dampr:V3(-0.5,0.9,0.8), strutr:V3(-0.5,0.9,0.8),
    uprr:V3(-0.6,0,1.2), arbr:V3(-0.9,-0.2,0), arblinkr:V3(-0.7,-0.1,1.0),
    discf:V3(0.4,0,1.5), calf:V3(0.5,0.4,1.5), discr:V3(-0.4,0,1.5), calr:V3(-0.5,0.4,1.5),
    wheels:V3(0,0,1.9), rack:V3(0.9,0.2,0), column:V3(0.6,0.9,-0.4), steeringwheel:V3(0.3,1.2,-0.3),
    mcyl:V3(0.5,0.9,-0.6), abs:V3(0.4,0.7,0.8), hbrake:V3(0,1.0,-0.3), brakelines:V3(0,-0.8,0), pedals:V3(0.3,0.8,-0.5),
    tank:V3(0,-0.9,0), fuelpump:V3(0,-1.1,-0.3), fuellines:V3(0,-0.9,-0.3), fillerneck:V3(-0.3,-0.4,-1.0),
    downpipe:V3(0.3,-1.0,0.3), cat:V3(0,-1.0,0.4), midpipe:V3(0,-1.0,0.5), rearbox:V3(-0.6,-1.0,0.4),
    rad:V3(1.4,0.2,0), fans:V3(1.2,0.3,0), hoses:V3(1.0,0.6,0), exptank:V3(0.4,1.0,0.6), condenser:V3(1.6,0.1,0), accomp:V3(0.4,0.6,-0.9), heaterbox:V3(0.3,1.1,0.3),
    battery:V3(0.5,1.0,0.7), fusebox:V3(0.4,1.0,-0.7), harness:V3(0,1.3,-0.3), ecu:V3(0.4,1.1,-0.6), horn:V3(1.1,0.5,-0.3), washer:V3(1.0,0.6,-0.7),
    headlamp:V3(1.3,0.4,0.5), taillamp:V3(-1.3,0.4,0.5), wipers:V3(0.4,1.1,0),
    headunit:V3(0,1.2,0), amp:V3(-0.8,0.8,-0.5), speakers:V3(0,0.7,1.3),
    bonnet:V3(0.5,1.5,0), wingF:V3(0.6,0.4,1.3), bumperF:V3(1.6,0.2,0), grille:V3(1.9,0.3,0), splitter:V3(1.7,-0.2,0),
    doorF:V3(0.1,0.3,1.7), doorR:V3(-0.1,0.3,1.7), sills:V3(0,-0.3,1.3), quarters:V3(-0.5,0.4,1.3), roof:V3(0,1.8,0),
    bootlid:V3(-0.6,1.4,0), bed:V3(-0.4,1.2,0), bumperR:V3(-1.6,0.2,0), mirrors:V3(0.2,0.6,1.5), fuelflap:V3(-0.3,0.2,1.4),
    windscreen:V3(0.5,1.6,0), rearscreen:V3(-0.6,1.6,0), glassF:V3(0.1,1.2,1.2), glassR:V3(-0.1,1.2,1.2), glassQ:V3(-0.4,1.2,1.2),
    spoiler:V3(-0.8,1.4,0), diffuser:V3(-1.4,-0.4,0), rearwing:V3(-1.2,1.2,0), nosecone:V3(1.8,0.3,0), sidepods:V3(0,0.4,1.5), enginecover:V3(-0.4,1.4,0), floor:V3(0,-1.0,0), nassau:V3(0.8,1.0,0),
    carpet:V3(0,0.9,0), headliner:V3(0,1.9,0), dash:V3(0.4,1.3,0), console:V3(0,1.3,0), seatsF:V3(0,1.3,0.6), seatR:V3(-0.4,1.3,0), seats:V3(0,1.3,0), belts:V3(0,1.2,0.8),
    doorcardsF:V3(0.1,0.4,1.2), doorcardsR:V3(-0.1,0.4,1.2),
    forks:V3(0.8,0.8,0), triple:V3(0.7,1.0,0), swingarm:V3(-1.0,-0.2,0), shock:V3(-0.4,1.0,0),
    final:V3(-0.6,-0.4,-0.8), subframe:V3(-0.9,0.5,0), axle:V3(-0.8,0,0), spindles:V3(0.8,0,0.6), body:V3(0,1.4,0), lights:V3(1.0,0.5,0.4), exhaustsys:V3(0,-1.0,0.6), aero:V3(0,1.0,0),
  };
  const d = (map[base] || V3(0,0.9,0)).clone();
  if (side) d.z = Math.abs(d.z) * side;
  else if (o){
    /* a piece with no side of its own still leaves on its own side of the car */
    const wz = o.position.z || 0;
    if (Math.abs(wz) > 0.15) d.z = Math.abs(d.z) * Math.sign(wz);
  }
  return d.multiplyScalar(0.42);
}
