/* MotorLab — procedural 3D vehicle builder: chassis, subframes, suspension,
 * drivetrain, brakes, wheels, electrics and body, all derived from the spec
 * and tagged by part id so the same teardown UI works on a whole car. */
import * as THREE from 'three';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, group, tag, at, rot,
         boundsOf, deg, TAU, lathe } from '../lib/geo.js';
import { wheelRadius, weightDistribution } from '../data/vehicles.js';
import { custom, fitToVehicle } from '../lib/importModel.js';

const M = (mm) => mm / 1000;

export function buildVehicle(v, tree){
  return v.class === 'bike' ? buildBike(v, tree) : buildCar(v, tree);
}

/* ====================================================================== */
function buildCar(v, tree){
  const root = group('vehicle'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const has = (id) => !!tree.byId[id];
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
    const tub = roundBox(len*0.42, hgt*0.42, wid*0.6, 0.06, MAT.black());
    ch.add(at(tub, len*0.02, floorY + hgt*0.16, 0));
  } else {
    ch.add(at(box(len*0.72, M(70), wid*0.78, MAT.alloyDark()), 0, floorY, 0));
    for (const s of [-1,1]) ch.add(at(box(len*0.72, M(150), M(110), MAT.alloyDark()), 0, floorY+M(60), s*wid*0.34));
    ch.add(at(box(M(90), hgt*0.34, wid*0.8, MAT.alloyDark()), len*0.12, floorY+hgt*0.2, 0)); // firewall
  }
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
  const engX = bay === 'mid' ? axR*0.45 : bay === 'rear' ? axR*1.2 : axF*0.62;
  const engY = floorY + M(230);
  if (has('engine')){
    const eg = group('eng');
    const transverse = bay.includes('transverse') || kart;
    const bw = transverse ? tf*0.62 : M(520), bd = transverse ? M(520) : tf*0.5;
    eg.add(roundBox(bw, M(420), bd, 0.03, MAT.alloy()));
    eg.add(at(roundBox(bw*0.92, M(120), bd*0.88, 0.02, MAT.alloyDark()), 0, M(280), 0));
    add('engine', at(eg, engX, engY, 0));
  }
  if (has('gearbox')){
    const gb = group('gb');
    const transverse = bay.includes('transverse') || kart;
    gb.add(rot(cyl(M(180), M(140), M(560), MAT.alloyDark(), 16), transverse ? 0 : 0, 0, Math.PI/2));
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
    const dia = end === 'F' ? v.brakeF : v.brakeR;
    if (dia && has('disc'+sfx)){
      const disc = rot(tubeMesh(M(dia/2), M(dia/6), M(28), MAT.iron(), 30), 0, 0, Math.PI/2);
      add('disc'+sfx, at(disc, x, r, outer + side*M(14))); unsprung.push(disc);
    }
    if (dia && has('cal'+sfx)){
      const c = roundBox(M(90), M(150), M(120), .01, MAT.red());
      add('cal'+sfx, at(c, x - M(dia/2)*0.75, r + M(dia/2)*0.6, outer + side*M(14)));
      unsprung.push(c);
    }
    if (has('wheels')){
      const w = group('wheel');
      const width = M(end === 'F' ? v.tyreF : v.tyreR);
      const rimR = M((end === 'F' ? v.rimF : v.rimR) * 25.4 / 2);
      /* tyre with a shoulder radius, then the rim barrel, then the spokes */
      w.add(rot(lathe([
        [rimR*1.00, -width/2], [r*0.93, -width/2], [r*1.00, -width*0.30],
        [r*1.00,  width*0.30], [r*0.93,  width/2], [rimR*1.00, width/2],
      ], MAT.rubber(), 34), 0, 0, Math.PI/2));
      w.add(rot(tubeMesh(rimR, rimR*0.34, width*0.88, MAT.chrome(), 28), 0, 0, Math.PI/2));
      const nSpokes = v.class === 'kart' ? 5 : 8;
      for (let s2 = 0; s2 < nSpokes; s2++){
        const sp = box(width*0.42, rimR*0.92, M(24), MAT.alloy());
        const a = (s2/nSpokes)*TAU;
        sp.rotation.x = a;
        sp.position.set(0, Math.cos(a)*rimR*0.5, Math.sin(a)*rimR*0.5);
        w.add(sp);
      }
      w.add(rot(cyl(rimR*0.30, rimR*0.30, width*0.5, MAT.alloyDark(), 16), 0, 0, Math.PI/2));
      at(w, x, r, outer + side*M(40));
      anim.wheels.push({ node:w, end, side, radius:r });
      if (end === 'F') anim.steer.push(w);
      add('wheels', w); unsprung.push(w);
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
    rd.add(at(box(M(60), hgt*0.3, wid*0.62, MAT.alloyDark()), len*0.44, floorY + hgt*0.16, 0));
    const fan = group('fan');
    for (let i = 0; i < 7; i++){ const b = box(M(18), hgt*0.11, M(8), MAT.black()); b.rotation.x = (i/7)*TAU; fan.add(b); }
    at(rot(fan, 0, 0, Math.PI/2), len*0.41, floorY + hgt*0.16, 0);
    rd.add(fan); anim.fans.push(fan);
    add('rad', rd);
  }
  if (has('aero')){
    const ae = group('aero');
    ae.add(at(box(M(120), M(24), wid*0.92, MAT.black()), len*0.47, floorY*0.55, 0));           // splitter
    ae.add(at(rot(box(M(320), M(26), wid*0.86, MAT.black()), 0, 0, deg(-12)), axR*1.25, floorY + hgt*0.62, 0)); // wing
    for (const s of [-1,1]) ae.add(at(box(M(40), hgt*0.2, M(24), MAT.black()), axR*1.25, floorY + hgt*0.5, s*wid*0.4));
    ae.add(at(box(M(420), M(30), wid*0.7, MAT.black()), axR*1.05, floorY*0.5, 0));             // diffuser
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
  if (has('lights')) for (const s of [-1,1]){
    add('lights', at(roundBox(M(70), M(120), M(260), .02, MAT.glass()), len*0.46, floorY + hgt*0.32, s*wid*0.3));
    add('lights', at(roundBox(M(60), M(110), M(230), .02, MAT.red()), -len*0.46, floorY + hgt*0.34, s*wid*0.3));
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
  if (has('body') && custom.group){
    /* an imported model replaces the generated shell; everything under it stays */
    const bd = group('body');
    bd.add(fitToVehicle(custom.group, len, { lift: floorY * 0.02 }));
    add('body', bd);
  } else if (has('body') && !open){
    const bd = group('body');
    const opacity = globalThis.__MOTORLAB_BODY_OPACITY ?? 0.8;
    const shell = bodySections(v, len, hgt, floorY, axF, axR, rF, rR, false).filter(Boolean);
    bd.add(new THREE.Mesh(loft(shell, 30), MAT.paint(v.colour, opacity)));
    const glass = bodySections(v, len, hgt, floorY, axF, axR, rF, rR, true).filter(Boolean);
    if (glass.length > 3)
      bd.add(new THREE.Mesh(loft(glass, 26), new THREE.MeshPhysicalMaterial({
        color:0x2b3a4c, metalness:0.0, roughness:0.04, clearcoat:1, clearcoatRoughness:0.02,
        transparent:true, opacity:0.62, envMapIntensity:2.4, side:THREE.DoubleSide })));
    add('body', bd);
  }
  if (open && has('body')){
    const bd = group('body');
    const paint = MAT.paint(v.colour, globalThis.__MOTORLAB_BODY_OPACITY ?? 0.8);
    bd.add(at(roundBox(len*0.55, hgt*0.36, wid*0.42, .06, paint), len*0.02, floorY + hgt*0.2, 0));
    bd.add(at(box(len*0.2, M(50), wid*0.6, paint), len*0.36, floorY + hgt*0.1, 0));
    add('body', bd);
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
  coupe: {
    roof:[[0,0.26],[0.08,0.33],[0.22,0.40],[0.36,0.47],[0.46,0.64],[0.56,0.85],[0.66,0.90],
          [0.78,0.86],[0.90,0.62],[1,0.46]],
    sill:[[0,0.124],[0.10,0.081],[0.35,0.068],[0.65,0.068],[0.90,0.081],[1,0.136]],
    wide:[[0,0.40],[0.08,0.70],[0.20,0.90],[0.34,0.96],[0.52,0.97],[0.68,1.00],[0.84,0.94],[0.94,0.74],[1,0.44]],
    glass:[[0,0.30],[0.42,0.62],[0.58,0.80],[0.74,0.78],[0.88,0.56],[1,0.34]],
    squ:2.9, beltline:0.62,
  },
  super: {
    roof:[[0,0.22],[0.10,0.28],[0.26,0.33],[0.38,0.40],[0.48,0.58],[0.58,0.72],[0.68,0.74],
          [0.80,0.68],[0.92,0.52],[1,0.44]],
    sill:[[0,0.099],[0.12,0.062],[0.40,0.056],[0.70,0.056],[0.92,0.074],[1,0.124]],
    wide:[[0,0.46],[0.10,0.78],[0.24,0.94],[0.40,0.96],[0.56,0.98],[0.72,1.00],[0.86,0.96],[0.95,0.78],[1,0.52]],
    glass:[[0,0.28],[0.44,0.60],[0.58,0.70],[0.70,0.68],[0.84,0.52],[1,0.32]],
    squ:3.3, beltline:0.52,
  },
  hatch: {
    roof:[[0,0.30],[0.10,0.38],[0.24,0.46],[0.36,0.53],[0.46,0.74],[0.58,0.95],[0.74,0.97],
          [0.86,0.94],[0.95,0.80],[1,0.52]],
    sill:[[0,0.136],[0.10,0.093],[0.35,0.081],[0.65,0.081],[0.90,0.093],[1,0.149]],
    wide:[[0,0.44],[0.09,0.74],[0.22,0.92],[0.38,0.97],[0.58,0.98],[0.76,0.97],[0.90,0.90],[1,0.56]],
    glass:[[0,0.32],[0.42,0.70],[0.58,0.88],[0.78,0.88],[0.92,0.72],[1,0.40]],
    squ:2.6, beltline:0.66,
  },
  sedan: {
    roof:[[0,0.28],[0.10,0.35],[0.24,0.43],[0.36,0.50],[0.46,0.70],[0.58,0.92],[0.70,0.93],
          [0.80,0.80],[0.90,0.62],[1,0.54]],
    sill:[[0,0.136],[0.10,0.087],[0.35,0.074],[0.65,0.074],[0.90,0.087],[1,0.149]],
    wide:[[0,0.42],[0.09,0.72],[0.22,0.91],[0.38,0.96],[0.56,0.98],[0.74,0.98],[0.88,0.90],[1,0.52]],
    glass:[[0,0.30],[0.42,0.66],[0.58,0.86],[0.72,0.84],[0.86,0.60],[1,0.36]],
    squ:2.7, beltline:0.64,
  },
  suv: {
    roof:[[0,0.34],[0.10,0.44],[0.24,0.54],[0.36,0.60],[0.46,0.82],[0.58,1.00],[0.76,1.01],
          [0.90,0.98],[0.97,0.88],[1,0.58]],
    sill:[[0,0.161],[0.10,0.118],[0.35,0.105],[0.65,0.105],[0.90,0.118],[1,0.174]],
    wide:[[0,0.46],[0.09,0.76],[0.22,0.93],[0.38,0.98],[0.60,0.99],[0.78,0.98],[0.92,0.92],[1,0.58]],
    glass:[[0,0.36],[0.42,0.76],[0.58,0.94],[0.80,0.94],[0.94,0.80],[1,0.44]],
    squ:2.4, beltline:0.70,
  },
  pickup: {
    roof:[[0,0.32],[0.10,0.50],[0.22,0.62],[0.34,0.66],[0.42,0.94],[0.52,1.02],[0.60,1.02],
          [0.64,0.66],[0.70,0.62],[0.95,0.62],[1,0.60]],
    sill:[[0,0.161],[0.10,0.124],[0.40,0.118],[0.70,0.118],[0.92,0.13],[1,0.174]],
    wide:[[0,0.50],[0.09,0.80],[0.22,0.94],[0.40,0.97],[0.62,0.97],[0.80,0.99],[0.94,0.96],[1,0.62]],
    glass:[[0,0.36],[0.40,0.66],[0.47,0.96],[0.58,0.96],[0.63,0.66],[1,0.40]],
    squ:2.2, beltline:0.64,
  },
  semi: {
    roof:[[0,0.40],[0.08,0.72],[0.16,0.86],[0.24,1.02],[0.40,1.04],[0.56,1.04],[0.62,0.70],
          [0.72,0.66],[0.95,0.66],[1,0.62]],
    sill:[[0,0.186],[0.10,0.149],[0.50,0.143],[0.90,0.149],[1,0.186]],
    wide:[[0,0.56],[0.10,0.86],[0.24,0.98],[0.50,1.00],[0.72,0.98],[0.90,0.94],[1,0.66]],
    glass:[[0,0.44],[0.22,0.72],[0.30,1.00],[0.52,1.00],[0.60,0.72],[1,0.44]],
    squ:2.0, beltline:0.72,
  },
  rally: {
    roof:[[0,0.30],[0.10,0.38],[0.24,0.46],[0.36,0.52],[0.46,0.74],[0.58,0.94],[0.74,0.95],
          [0.86,0.90],[0.95,0.74],[1,0.50]],
    sill:[[0,0.149],[0.10,0.105],[0.35,0.093],[0.65,0.093],[0.90,0.105],[1,0.161]],
    wide:[[0,0.46],[0.09,0.78],[0.22,0.98],[0.38,1.02],[0.58,1.03],[0.76,1.02],[0.90,0.94],[1,0.58]],
    glass:[[0,0.32],[0.42,0.70],[0.58,0.88],[0.78,0.86],[0.92,0.70],[1,0.40]],
    squ:2.5, beltline:0.66,
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

/** Cross-sections for a car body, with the wheel arches scalloped out. */
function bodySections(v, len, hgt, floorY, axF, axR, rF, rR, glassOnly){
  const L = BODY_LINES[v.body] || BODY_LINES.sedan;
  const halfW = M(v.widthMm) / 2;
  /* the bodywork has to cover the wheels — this is what gives a car its hips */
  const overF = (M(v.trackF || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreF) / 2;
  const overR = (M(v.trackR || v.widthMm * 0.85) / 2) * 0.86 + M(40) + M(v.tyreR) / 2;
  const STATIONS = 56;
  const out = [];
  for (let i = 0; i < STATIONS; i++){
    const t = i / (STATIONS - 1);
    const x = len/2 - t * len;
    let wide = curveAt(L.wide, t) * halfW;
    const roofY = floorY + hgt * curveAt(L.roof, t);
    let sillY = floorY + hgt * curveAt(L.sill, t);
    /* scallop the sill up over each axle — that is the wheel arch — and flare
       the section out over it so the tyre sits inside the bodywork */
    for (const [ax, r, over] of [[axF, rF, overF], [axR, rR, overR]]){
      const d = Math.abs(x - ax) / (r * 1.45);
      if (d < 1){
        const k = 1 - d * d;
        sillY = Math.max(sillY, r * 1.22 * (1 - d * d * 0.42));
        wide = Math.max(wide, (over + M(28)) * (0.94 + 0.06 * k));
      }
    }
    if (glassOnly){
      const gTop = floorY + hgt * curveAt(L.glass, t);
      const belt = floorY + hgt * L.beltline;
      if (gTop <= belt + 0.01){ out.push(null); continue; }
      out.push({ x, yBot:belt, yTop:gTop, wBot:wide * 0.90, wTop:wide * 0.70, squ:L.squ * 1.15 });
    } else {
      out.push({ x, yBot:sillY, yTop:Math.max(roofY, sillY + 0.02),
                 wBot:wide, wTop:wide * (0.70 + 0.22 * (1 - curveAt(L.glass, t))), squ:L.squ });
    }
  }
  /* close the ends without pinching them to a point — cars have flat faces */
  const taper = (s, k) => s && Object.assign(s, { wBot:s.wBot*k, wTop:s.wTop*k, squ:(s.squ||2.6)*1.5 });
  taper(out[0], 0.66); taper(out[out.length-1], 0.70);
  return out;
}
/* ====================================================================== */
function buildBike(v, tree){
  const root = group('bike'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const has = (id) => !!tree.byId[id];
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
    eg.add(at(roundBox(M(400), M(380), wide ? M(900) : M(420), .03, MAT.alloy()), axF*0.1, rR + M(300), 0));
    eg.add(at(roundBox(M(340), M(230), wide ? M(760) : M(360), .03, MAT.alloyDark()), axF*0.1 - M(40), rR + M(90), 0));
    if (v.bay === 'longitudinal-v') for (const a of [deg(22), deg(-23)])
      eg.add(at(rot(box(M(230), M(300), M(240), MAT.alloyDark()), 0, 0, a), axF*0.1 + Math.sin(a)*M(220), rR + M(430) + Math.cos(a)*M(120), 0));
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
    const wl = group('w');
    const rimR = M(rim*25.4/2);
    wl.add(rot(tubeMesh(r, rimR, M(w), MAT.rubber(), 30), 0, 0, Math.PI/2));
    wl.add(rot(tubeMesh(rimR, rimR*0.3, M(w)*0.8, MAT.alloyDark(), 24), 0, 0, Math.PI/2));
    for (let i = 0; i < (v.body === 'mx' ? 16 : 5); i++){
      const sp = box(M(w)*0.4, rimR*0.92, M(v.body === 'mx' ? 8 : 26), MAT.alloy());
      sp.rotation.x = (i/(v.body==='mx'?16:5))*TAU;
      sp.position.set(0, Math.cos((i/(v.body==='mx'?16:5))*TAU)*rimR*0.5, Math.sin((i/(v.body==='mx'?16:5))*TAU)*rimR*0.5);
      wl.add(sp);
    }
    at(wl, x, r, 0);
    anim.wheels.push({ node:wl, end, side:0, radius:r });
    if (end === 'F') anim.steer.push(wl);
    add('wheels', wl);
  }
  if (has('discf')) for (const s of [-1,1]){
    add('discf', at(rot(tubeMesh(M(v.brakeF/2), M(v.brakeF/6), M(6), MAT.steel(), 28), 0, 0, Math.PI/2), axF, rF, s*M(85)));
    add('discf', at(roundBox(M(70), M(120), M(60), .01, MAT.red()), axF - M(v.brakeF/2)*0.7, rF + M(v.brakeF/2)*0.6, s*M(85)));
  }
  if (has('discr')){
    add('discr', at(rot(tubeMesh(M(v.brakeR/2), M(v.brakeR/6), M(6), MAT.steel(), 24), 0, 0, Math.PI/2), axR, rR, M(95)));
    add('discr', at(roundBox(M(60), M(100), M(50), .01, MAT.red()), axR + M(v.brakeR/2)*0.6, rR + M(v.brakeR/2)*0.5, M(95)));
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
  if (has('body')){
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
