/* MotorLab — procedural 3D engine builder.
 * Reads an engine spec and constructs the whole assembly in metres, tagging
 * every mesh with its part id so the viewport can pick, hide, ghost, explode
 * and animate it. Nothing here is a downloaded model — it is all derived from
 * bore, stroke, cylinder count and layout.
 */
import * as THREE from 'three';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, bolt, group, tag, at, rot,
         boundsOf, slider, epitrochoid, deg, TAU,
         lathe, pistonMesh, rodMesh, counterweight, camLobe, lobeLift, valveMesh, springMesh,
         volute, bladedWheel, flameMesh, puffMesh, imbalance,
         turboUnit, coreMesh, alternatorMesh, starterMesh } from '../lib/geo.js';
import { firingOrder } from '../data/engines.js';

const M = (mm) => mm / 1000;   // spec is in millimetres, scene is in metres

export function buildEngine(e, tree){
  return e.kind === 'rotary' ? buildRotary(e, tree) : buildPiston(e, tree);
}

/* ====================================================================== */
/* geometry layout helpers                                                 */
/* ====================================================================== */
function layout(e){
  const bore = M(e.bore), stroke = M(e.stroke);
  const pitch = bore * 1.32;                                  // bore spacing
  const banks = (e.layout === 'V' || e.layout === 'F') ? 2 : (e.layout === 'W' ? 4 : 1);
  const perBank = Math.ceil(e.cyl / banks);
  const half = deg(e.bankAngle) / 2;
  const bankAngles = e.layout === 'I' ? [0]
    : e.layout === 'F' ? [deg(90), deg(-90)]
    : e.layout === 'W' ? [half*0.35, -half*0.35, half*1.5, -half*1.5].slice(0,4)
    : [ -half, half ];
  const rodLen = stroke * 1.75;
  const crankR = stroke / 2;
  const deckH  = crankR + rodLen + bore * 0.55;               // crank axis -> deck
  const len = perBank * pitch + pitch * 0.55;
  return { bore, stroke, pitch, banks, perBank, bankAngles, rodLen, crankR, deckH, len };
}

/** Which bank a cylinder sits in, and its index along that bank. */
function cylSlot(e, i, L){
  if (L.banks === 1) return { bank:0, idx:i };
  if (e.layout === 'W') return { bank: i % 4, idx: Math.floor(i / 4) };
  return { bank: i % 2, idx: Math.floor(i / 2) };
}

/** Crank angle at which each cylinder fires, over the full cycle (0…720°). */
function fireAngles(e){
  const fo = firingOrder(e);
  const per = (360 * e.revsPerCycle) / e.cyl;
  const out = new Array(e.cyl).fill(0);
  fo.forEach((cylNo, k) => { out[cylNo - 1] = deg(k * per); });
  return out;
}
/** The same angles reduced to one crank revolution — where the rod journal sits. */
function pinAngles(e){ return fireAngles(e).map(a => a % TAU); }

/** Valve event centres and duration, in crank degrees of the 720° cycle. */
function camTiming(e){
  const duration = deg(e.class === 'race' ? 285 : e.camProfile === 'aggressive' ? 255 : 228);
  /* boosted engines run a wider lobe separation, so less overlap around TDC */
  const spread = e.aspiration === 'na' ? 0 : deg(9);
  return { duration, intake: deg(450) + spread, exhaust: deg(270) - spread };
}

function cylPosition(e, i, L){
  const { bank, idx } = cylSlot(e, i, L);
  const x = (idx - (L.perBank - 1) / 2) * L.pitch;
  return { x, angle: L.bankAngles[bank] ?? 0, bank };
}

/* ====================================================================== */
/* piston engines                                                          */
/* ====================================================================== */
function buildPiston(e, tree){
  const L = layout(e);
  const root = group('engine');
  const nodes = new Map();
  const add = (id, obj) => {
    if (!obj) return;
    tag(obj, id);
    root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []);
    nodes.get(id).push(obj);
  };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const has = (id) => !!tree.byId[id];
  const airCooled = (e.coolant || '').startsWith('air');
  const ohv = e.cam === 'OHV';
  const pins = pinAngles(e);
  const fires = fireAngles(e);
  const CAM = camTiming(e);

  /* ---- block ---- */
  const blockG = group('block');
  const blockH = L.deckH - L.crankR * 0.15;
  for (const bank of L.bankAngles.keys()){
    const a = L.bankAngles[bank];
    const bg = group('bank');
    const body = roundBox(L.len, blockH * 0.72, L.bore * 1.55, 0.02, MAT.alloy());
    body.position.y = L.crankR * 0.7 + blockH * 0.36;
    bg.add(body);
    /* cylinder walls visible through the casting */
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if (s.bank !== bank) continue;
      const p = cylPosition(e, i, L);
      const liner = tubeMesh(L.bore/2 * 1.06, L.bore/2, L.stroke * 1.35, MAT.iron(), 20);
      liner.position.set(p.x, L.crankR * 0.95 + L.stroke * 0.9, 0);
      bg.add(liner);
      if (airCooled) for (let f = 0; f < 7; f++){
        const fin = tubeMesh(L.bore/2*1.5, L.bore/2*1.1, M(3), MAT.alloyDark(), 20);
        fin.position.set(p.x, L.crankR*0.95 + L.stroke*0.45 + f * M(11), 0);
        bg.add(fin);
      }
    }
    bg.rotation.x = a;
    blockG.add(bg);
  }
  /* crankcase / bedplate */
  const cc = roundBox(L.len, L.crankR * 1.9, L.bore * 1.5, 0.02, MAT.alloyDark());
  cc.position.y = -L.crankR * 0.35;
  blockG.add(cc);
  add('block', blockG);

  /* ---- main bearings + caps ---- */
  const nMains = L.banks >= 2 ? e.cyl / 2 + 1 : e.cyl + 1;
  const mbG = group('mains'), mcG = group('maincaps');
  for (let i = 0; i < nMains; i++){
    const x = (i - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    const sh = tubeMesh(L.crankR * 0.62, L.crankR * 0.52, M(16), MAT.bearing(), 18);
    at(rot(sh, 0, 0, Math.PI/2), x, 0, 0); mbG.add(sh);
    const cap = roundBox(M(38), L.crankR * 0.9, L.bore * 0.95, 0.01, MAT.alloyDark());
    at(cap, x, -L.crankR * 0.62, 0); mcG.add(cap);
    for (const sgn of [-1, 1]){
      const b = bolt(M(5), M(34), MAT.steel());
      at(b, x, -L.crankR * 1.05, sgn * L.bore * 0.36); mcG.add(b);
    }
  }
  add('mainbearings', mbG); add('maincaps', mcG);

  /* ---- crankshaft: main journals, rod throws, counterweights ---- */
  const crankG = group('crank');
  const jR = L.crankR * 0.52, pinR = L.crankR * 0.44;
  for (let i = 0; i < nMains; i++){
    const x = (i - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    const j = cyl(jR, jR, M(26), MAT.steel(), 20);
    rot(j, 0, 0, Math.PI/2); j.position.x = x; crankG.add(j);
  }
  crankG.add(rot(cyl(jR * 0.62, jR * 0.62, L.len * 0.99, MAT.steel(), 14), 0, 0, Math.PI/2));
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const throwG = group('throw');
    const pin = cyl(pinR, pinR, L.pitch * 0.46, MAT.steel(), 18);
    rot(pin, 0, 0, Math.PI/2); pin.position.set(p.x, L.crankR, 0);
    throwG.add(pin);
    for (const side of [-1, 1]){
      const web = box(M(15), L.crankR * 1.5, L.crankR * 1.15, MAT.steel());
      web.position.set(p.x + side * L.pitch * 0.28, L.crankR * 0.45, 0);
      throwG.add(web);
      const cw = counterweight(L.crankR * 1.62, M(17), MAT.steel());
      cw.rotation.x = Math.PI;                       // opposite the pin
      cw.position.set(p.x + side * L.pitch * 0.30, 0, 0);
      throwG.add(cw);
    }
    throwG.rotation.x = pins[i];
    crankG.add(throwG);
  }
  const snout = cyl(L.crankR * 0.36, L.crankR * 0.36, M(70), MAT.steel(), 16);
  rot(snout, 0, 0, Math.PI/2); snout.position.x = -L.len/2 - M(30); crankG.add(snout);
  anim.crank = crankG;
  add('crank', crankG);

  /* ---- pistons + rods ---- */
  const pistG = group('pistons'), rodG = group('rods');
  const pinBoreR = L.bore * 0.105;
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const pg = group('p' + i);
    pg.add(pistonMesh(L.bore, MAT.alloy(), { dish: e.injection === 'direct' ? 0.12 : e.cr > 11 ? 0.02 : 0.07 }));
    for (let r = 0; r < 3; r++){
      const ring = torus(L.bore/2 * 0.995, M(1.7), r === 2 ? MAT.iron() : MAT.steel(), 26);
      rot(ring, Math.PI/2, 0, 0);
      ring.position.y = L.bore * (0.146 - r * 0.062);
      pg.add(ring);
    }
    const wrist = cyl(pinBoreR, pinBoreR, L.bore * 0.66, MAT.steel(), 14);
    rot(wrist, 0, 0, Math.PI/2); wrist.position.y = -L.bore * 0.045; pg.add(wrist);
    pg.userData.cylIndex = i;
    pistG.add(pg);

    const rg = group('r' + i);
    rg.add(rodMesh(L.rodLen, L.crankR * 0.66, pinBoreR, MAT.steel()));
    rodG.add(rg);

    anim.pistons.push({ node:pg, i, x:p.x, angle:p.angle, fire:fires[i] });
    anim.rods.push({ node:rg, i, x:p.x, angle:p.angle, fire:fires[i] });

    /* combustion flash, drawn through the casting so the firing order is visible */
    const flame = flameMesh(L.bore * 0.42);
    flame.material.depthTest = false;
    flame.position.set(p.x, L.deckH - L.bore * 0.10, 0);
    const fh = group('flame'); fh.add(flame); fh.rotation.x = p.angle;
    root.add(fh);
    anim.flames.push({ node:flame, mat:flame.material, fire:fires[i] });
  }
  add('pistons', pistG); add('rods', rodG);

  /* ---- head gasket + heads ---- */
  const hgG = group('hg'), headG = group('heads'), vcG = group('vc');
  const camG = group('cams'), capG = group('camcaps'), valG = group('valves');
  const plugG = group('plugs'), coilG = group('coils'), injG = group('inj'), railG = group('rail');
  const nBanksHead = L.banks === 4 ? 2 : L.banks;
  for (let b = 0; b < nBanksHead; b++){
    const a = L.bankAngles[b] ?? 0;
    /* place a part in this bank's frame, keeping whatever cylinder position it
       was already given along the crank axis */
    const mk = (obj, y, z = 0) => {
      const g = group('h');
      g.add(obj);
      obj.position.set(obj.position.x, y, z);
      g.rotation.x = a;
      return g;
    };

    hgG.add(mk(box(L.len, M(2.2), L.bore*1.5, MAT.gasket()), L.deckH));
    const headBody = roundBox(L.len, L.bore * 1.32, L.bore * 1.5, 0.03, MAT.alloy());
    headG.add(mk(headBody, L.deckH + L.bore * 0.66));
    /* port bosses on each face — the lumps you actually see on a head */
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1)/2) * L.pitch;
      for (const [zf, mat] of [[-0.80, MAT.alloy()], [0.80, MAT.hot()]]){
        const port = cyl(L.bore * 0.19, L.bore * 0.22, L.bore * 0.22, mat, 16);
        rot(port, Math.PI/2, 0, 0);
        headG.add(mk(at(port, px, 0, zf * L.bore), L.deckH + L.bore * 0.46, zf * L.bore));
      }
      /* spark plug well sunk into the casting */
      headG.add(mk(at(cyl(L.bore*0.13, L.bore*0.13, L.bore*0.34, MAT.black(), 14), px, 0, 0),
                   L.deckH + L.bore * 1.02));
    }
    /* head bolts */
    for (let i = 0; i < e.cyl / (L.banks >= 2 ? 2 : 1) + 1; i++){
      for (const sgn of [-1, 1]){
        const bl = bolt(M(6), M(30), MAT.steel());
        const x = (i - (L.perBank) / 2) * L.pitch + L.pitch/2;
        headG.add(mk(at(bl, x, 0, sgn * L.bore * 0.62), L.deckH + L.bore * 1.22));
      }
    }
    if (!ohv){
      const nCams = e.cam === 'SOHC' ? 1 : 2;
      const lobesPer = Math.max(1, Math.floor(e.valvesPerCyl / 2));
      const baseR = L.bore * 0.135, liftR = L.bore * 0.062, lobeW = L.bore * 0.11;
      const inBank = [...Array(e.cyl).keys()].filter(i => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0) === b);
      for (let c = 0; c < nCams; c++){
        const zc = nCams === 1 ? 0 : (c ? 1 : -1) * L.bore * 0.34;
        const camY = L.deckH + L.bore * 1.00;
        const cg = group('cam');
        cg.add(rot(cyl(baseR * 0.52, baseR * 0.52, L.len * 0.94, MAT.steel(), 16), 0, 0, Math.PI/2));
        /* one cam serves both sides on a SOHC head, so it carries both events */
        const events = nCams === 1 ? ['intake', 'exhaust'] : [c === 0 ? 'intake' : 'exhaust'];
        for (const i of inBank){
          const px = cylPosition(e, i, L).x;
          for (const ev of events){
            const centre = ev === 'intake' ? CAM.intake : CAM.exhaust;
            const phase = -(fires[i] + centre) / 2;
            for (let j = 0; j < lobesPer; j++){
              const lobe = camLobe(baseR, liftR, CAM.duration, lobeW, MAT.steel());
              const holder = group('lobe');
              holder.add(lobe);
              holder.position.x = px + (j - (lobesPer - 1)/2) * lobeW * 1.7
                                + (events.length > 1 ? (ev === 'intake' ? -lobeW : lobeW) * 1.9 : 0);
              cg.add(holder);
              anim.lobes.push({ node:holder, phase, up:false });
            }
          }
        }
        camG.add(mk(cg, camY, zc));
        anim.cams.push({ node:cg, bank:b, index:c });
        for (let i = 0; i < L.perBank + 1; i++){
          const cap = roundBox(M(30), M(16), M(34), 0.006, MAT.alloyDark());
          capG.add(mk(at(cap, (i - L.perBank/2) * L.pitch, 0, zc), L.deckH + L.bore*1.12, zc));
        }
      }
    }
    /* valves */
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if ((L.banks >= 2 ? s.bank % 2 : 0) !== b) continue;
      const p = cylPosition(e, i, L);
      const nv = Math.max(2, e.valvesPerCyl);
      const perSide = Math.max(1, Math.floor(nv / 2));
      const maxLift = L.bore * 0.105;
      for (let v = 0; v < nv; v++){
        const intake = v < perSide;
        const j = intake ? v : v - perSide;
        const zoff = (intake ? -1 : 1) * L.bore * 0.21
                   + (perSide > 1 ? (j - (perSide - 1)/2) * L.bore * 0.19 : 0);
        const headR = L.bore * (intake ? 0.20 : 0.175);
        const vg = group('v');
        vg.add(valveMesh(headR, L.bore * 0.038, L.bore * 0.86, intake ? MAT.steel() : MAT.hot()));
        valG.add(mk(at(vg, p.x, 0, zoff), L.deckH + L.bore * 0.32, zoff));
        /* the spring seats on the head and is compressed by the retainer */
        const sp = springMesh(L.bore * 0.115, L.bore * 0.30, 6, L.bore * 0.020, MAT.steel());
        const spHolder = mk(at(sp, p.x, 0, zoff), L.deckH + L.bore * 0.52, zoff);
        valG.add(spHolder);
        const centre = intake ? CAM.intake : CAM.exhaust;
        anim.valves.push({ node:vg, cyl:i, intake, bank:b, lift:maxLift,
                           phase:-(fires[i] + centre) / 2, duration:CAM.duration,
                           spring:sp, springHome:sp.position.y });
      }
      /* spark plug / injector / coil */
      if (e.fuel !== 'diesel'){
        const pl = cyl(M(7), M(7), L.bore * 0.34, MAT.steel(), 10);
        plugG.add(mk(at(pl, p.x, 0, 0), L.deckH + L.bore * 0.84));
        const co = roundBox(M(26), L.bore*0.34, M(30), .006, MAT.plastic());
        coilG.add(mk(at(co, p.x, 0, 0), L.deckH + L.bore * 1.66));
      } else {
        const inj = cyl(M(9), M(9), L.bore*0.4, MAT.steel(), 10);
        injG.add(mk(at(inj, p.x, 0, 0), L.deckH + L.bore*0.90));
      }
    }
    /* valve cover */
    const vc = roundBox(L.len * 0.98, L.bore * 0.34, L.bore * 1.36, 0.02, MAT.alloyDark());
    vcG.add(mk(vc, L.deckH + L.bore * 1.48));
  }
  add('headgasket', hgG); add('head', headG);
  if (has('camcaps')) add('camcaps', capG);
  add('cam', camG); add('valves', valG); add('valvecover', vcG);
  if (has('plugs')) add('plugs', plugG);
  if (has('glow'))  add('glow', plugG);
  if (has('coils')) add('coils', coilG);

  /* ---- OHV valvetrain ---- */
  if (ohv){
    const camIn = group('camin');
    const baseR = L.bore * 0.15, liftR = L.bore * 0.055, lobeW = L.bore * 0.12;
    camIn.add(rot(cyl(baseR * 0.55, baseR * 0.55, L.len * 0.96, MAT.steel(), 16), 0, 0, Math.PI/2));
    const camY = L.crankR * 1.55;
    const liftG = group('lifters'), prG = group('pushrods'), rkG = group('rockers');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const side = L.banks >= 2 ? (cylSlot(e, i, L).bank ? 1 : -1) : 1;
      for (const which of ['intake', 'exhaust']){
        const centre = which === 'intake' ? CAM.intake : CAM.exhaust;
        const phase = -(fires[i] + centre) / 2;
        const sgn = which === 'intake' ? -1 : 1;
        const lobe = camLobe(baseR, liftR, CAM.duration, lobeW, MAT.steel());
        const holder = group('lobe'); holder.add(lobe);
        holder.position.set(p.x + sgn * lobeW * 0.9, 0, 0);
        camIn.add(holder);
        anim.lobes.push({ node:holder, phase, up:true });

        const lz = sgn * L.bore * 0.18 * (L.banks >= 2 ? side : 1);
        const lf = cyl(L.bore * 0.062, L.bore * 0.062, L.bore * 0.24, MAT.steel(), 12);
        at(lf, p.x + sgn * lobeW * 0.9, camY + baseR + L.bore * 0.14, lz);
        liftG.add(lf);
        const prLen = L.deckH * 0.66;
        const pr = cyl(L.bore * 0.024, L.bore * 0.024, prLen, MAT.steel(), 8);
        at(pr, p.x + sgn * lobeW * 0.9, camY + baseR + L.bore * 0.26 + prLen/2, lz);
        prG.add(pr);
        const rk = box(L.bore * 0.30, L.bore * 0.075, L.bore * 0.09, MAT.steel());
        const rkH = group('rk'); rkH.add(rk);
        rk.position.x = -sgn * L.bore * 0.12;
        rkH.position.set(p.x + sgn * lobeW * 0.9, L.deckH + L.bore * 0.95, lz * 1.4);
        rkG.add(rkH);
        anim.followers.push({ lifter:lf, pushrod:pr, rocker:rkH, phase, duration:CAM.duration,
                              travel:L.bore * 0.055, rockSign:sgn,
                              lifterHome:lf.position.y, pushrodHome:pr.position.y });
      }
    }
    camIn.position.y = camY;
    anim.cams.push({ node:camIn, bank:0, index:0 });
    add('cam', camIn);
    add('lifters', liftG); add('pushrods', prG); add('rockers', rkG);
  }

  /* ---- timing drive ---- */
  const tG = group('timing');
  const frontX = -L.len/2 - M(18);
  const crankSpr = tubeMesh(L.crankR * 0.7, L.crankR * 0.4, M(12), MAT.steel(), 20);
  rot(crankSpr, 0, 0, Math.PI/2); crankSpr.position.x = frontX; tG.add(crankSpr);
  if (!ohv){
    for (let b = 0; b < nBanksHead; b++){
      const a = L.bankAngles[b] ?? 0;
      const nCams = e.cam === 'SOHC' ? 1 : 2;
      for (let c = 0; c < nCams; c++){
        const zc = nCams === 1 ? 0 : (c ? 1 : -1) * L.bore * 0.34;
        const g = group('spr');
        const spr = tubeMesh(L.crankR * 1.3, L.crankR * 0.5, M(11), MAT.steel(), 24);
        rot(spr, 0, 0, Math.PI/2);
        spr.position.set(frontX, L.deckH + L.bore * 1.00, zc);
        g.add(spr); g.rotation.x = a; tG.add(g);
        const chain = pipe([[frontX, L.crankR*0.7, 0],
                            [frontX, L.deckH*0.6, L.bore*0.5*Math.sign(zc||1)],
                            [frontX, L.deckH + L.bore*1.00, zc]], M(4), MAT.steel(), 6);
        const cg = group('ch'); cg.add(chain); cg.rotation.x = a * 0.5; tG.add(cg);
      }
    }
  } else {
    const camSpr = tubeMesh(L.crankR * 1.0, L.crankR*0.4, M(11), MAT.steel(), 22);
    rot(camSpr, 0, 0, Math.PI/2); camSpr.position.set(frontX, L.crankR*1.55, 0); tG.add(camSpr);
  }
  add('timing', tG);
  add('tensioner', at(box(M(20), M(70), M(16), MAT.plastic()), frontX, L.deckH * 0.55, L.bore * 0.5));
  const fc = roundBox(M(24), L.deckH * 1.5, L.bore * 1.5, 0.02, MAT.alloyDark());
  add('frontcover', at(rot(fc, 0, Math.PI/2, 0), frontX - M(14), L.deckH * 0.5, 0));

  /* ---- lubrication ---- */
  add('oilpump', at(roundBox(M(70), M(70), M(50), .01, MAT.alloyDark()), frontX + M(40), -L.crankR * 0.6, L.bore * 0.5));
  add('pickup', pipe([[0,-L.crankR*0.9,0],[0,-L.crankR*1.6,L.bore*0.25],[L.len*0.15,-L.crankR*1.9,L.bore*0.3]], M(9), MAT.steel()));
  const pan = roundBox(L.len * 0.94, L.crankR * 1.5, L.bore * 1.35, 0.02, MAT.alloyDark());
  add('oilpan', at(pan, 0, -L.crankR * 1.9, 0));
  add('oilfilter', at(rot(cyl(M(45), M(45), M(110), MAT.blue(), 18), 0, 0, Math.PI/2), L.len*0.2, -L.crankR*0.9, L.bore*0.85));

  /* ---- induction ---- */
  const inducY = L.deckH + L.bore * 1.95;
  const intakeG = group('intake');
  const plenum = roundBox(L.len * 0.8, L.bore * 0.5, L.bore * 0.7, 0.03, MAT.alloy());
  at(plenum, 0, inducY, L.banks >= 2 ? 0 : -L.bore * 0.95);
  intakeG.add(plenum);
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const zEnd = L.banks >= 2 ? 0 : -L.bore * 0.95;
    const zHead = L.banks >= 2 ? (cylSlot(e,i,L).bank ? 1 : -1) * L.bore * 0.5 : -L.bore * 0.42;
    const runner = pipe([
      [p.x, inducY, zEnd],
      [p.x, inducY - L.bore * 0.2, zHead * 0.8],
      [p.x, L.deckH + L.bore * 0.50, zHead],
    ], M(17), MAT.alloy(), 8);
    intakeG.add(runner);
  }
  add('intake', intakeG);
  if (has('throttle'))
    add('throttle', at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 18), 0, 0, Math.PI/2), -L.len*0.48, inducY, L.banks>=2 ? 0 : -L.bore*0.95));
  if (has('injectors') && e.fuel !== 'diesel'){
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const zHead = L.banks >= 2 ? (cylSlot(e,i,L).bank ? 1 : -1) * L.bore * 0.52 : -L.bore * 0.46;
      injG.add(at(cyl(M(8), M(8), M(56), MAT.plastic(), 10), p.x, L.deckH + L.bore * 0.62, zHead));
    }
    add('injectors', injG);
    for (const b of [0, 1].slice(0, nBanksHead)){
      const z = L.banks >= 2 ? (b ? 1 : -1) * L.bore * 0.62 : -L.bore * 0.56;
      railG.add(at(rot(cyl(M(13), M(13), L.len * 0.9, MAT.steel(), 12), 0, 0, Math.PI/2), 0, L.deckH + L.bore * 0.80, z));
    }
    add('fuelrail', railG);
  }
  if (has('hpfp')) add('hpfp', at(roundBox(M(60), M(60), M(60), .01, MAT.alloyDark()), -L.len*0.36, L.deckH + L.bore*1.15, L.bore*0.7));
  if (has('fuelpump')) add('fuelpump', at(roundBox(M(60), M(50), M(50), .01, MAT.alloyDark()), -L.len*0.3, L.crankR, L.bore*0.85));

  /* turbo / blower */
  if (has('turbo')){
    const n = { turbo:1, twinturbo:2, quadturbo:4 }[e.aspiration] || 1;
    const tg = group('turbos');
    /* size scales with how much air it has to move — a big single on a 2-litre
       is physically enormous next to a pair of small twins on a V8 */
    const size = L.bore * (n === 1 ? 1.05 : n === 2 ? 0.82 : 0.62)
               * (1 + (e.boostTarget || 0) * 0.18);
    for (let i = 0; i < n; i++){
      const t = turboUnit(size);
      const zs = L.banks >= 2 ? (i % 2 ? 1 : -1) * L.bore * 0.55 : L.bore * 1.25;
      const xs = n > 2 ? (Math.floor(i/2) - 0.5) * L.len * 0.42
               : n === 2 ? (i ? 1 : -1) * L.len * 0.22 : L.len * 0.18;
      at(t, xs, L.banks >= 2 ? L.deckH + L.bore * 0.72 : L.deckH * 0.62, zs);
      /* the compressor faces outward, away from the engine */
      t.rotation.y = zs < 0 ? Math.PI : 0;
      anim.turbos.push(t.userData.shaft);
      tg.add(t);
    }
    add('turbo', tg);
    add('wastegate', at(cyl(M(28), M(28), M(70), MAT.hot(), 14), L.len*0.3, L.deckH*0.7, (L.banks>=2? L.bore*0.6 : L.bore*1.3)));
    add('bov', at(cyl(M(24), M(24), M(60), MAT.blue(), 14), -L.len*0.35, L.deckH + L.bore*0.5, L.bore*1.1));
    /* the intercooler lives ahead of the engine, in the airstream, in front of
       the radiator — not beside the block */
    const icX = frontX - L.bore * 2.05;
    const ic = coreMesh(L.bore * 4.6, L.bore * 1.35, M(80));
    const icG = group('ic');
    icG.add(at(ic, icX, L.deckH * 0.62, 0));
    /* compressor outlet forward to the core, then back to the throttle */
    icG.add(pipe([[L.len*0.18, L.deckH*0.62, L.bore*1.25],
                  [L.len*0.30, L.deckH*0.45, L.bore*1.9],
                  [icX*0.55,   L.deckH*0.42, L.bore*1.9],
                  [icX + M(30), L.deckH*0.62, L.bore*1.6]], L.bore*0.17, MAT.alloy(), 10));
    icG.add(pipe([[icX + M(30), L.deckH*0.62, -L.bore*1.6],
                  [icX*0.5,    L.deckH*0.9,  -L.bore*1.7],
                  [-L.len*0.55, inducY*0.92, -L.bore*0.9],
                  [-L.len*0.48, inducY,      L.banks >= 2 ? 0 : -L.bore*0.95]], L.bore*0.17, MAT.alloy(), 10));
    add('intercooler', icG);
  }
  if (has('blower')){
    const bg = group('blower');
    const body = roundBox(L.len * 0.72, L.bore * 0.62, L.bore * 0.95, 0.03, MAT.alloyDark());
    body.position.y = inducY + L.bore * 0.1;
    const snoutB = cyl(M(45), M(45), M(80), MAT.alloy(), 16);
    rot(snoutB, 0, 0, Math.PI/2); snoutB.position.set(-L.len*0.42, inducY + L.bore*0.1, 0);
    const hat = roundBox(L.len*0.4, L.bore*0.3, L.bore*0.7, .02, MAT.alloy());
    hat.position.y = inducY + L.bore * 0.52;
    bg.add(body, snoutB, hat);
    add('blower', bg);
    add('intercooler', at(box(L.len*0.7, M(60), L.bore*0.8, MAT.alloy()), 0, inducY - L.bore*0.24, 0));
  }

  /* ---- exhaust ---- */
  const exG = group('ex');
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const side = L.banks >= 2 ? (cylSlot(e,i,L).bank ? 1 : -1) : 1;
    const zH = L.banks >= 2 ? side * L.bore * 0.55 : L.bore * 0.5;
    const collectorX = L.banks >= 2 ? 0 : L.len * 0.35;
    exG.add(pipe([
      [p.x, L.deckH + L.bore * 0.46, zH],
      [p.x, L.deckH * 0.72, zH + side * L.bore * 0.45],
      [(p.x + collectorX)/2, L.deckH * 0.5, side * L.bore * 0.95],
      [collectorX, L.deckH * 0.42, side * L.bore * 1.0],
    ], M(16), MAT.hot(), 8));
  }
  add('exmanifold', exG);
  const dp = pipe([[0, L.deckH*0.42, L.bore*1.0],[L.len*0.6, L.crankR, L.bore*1.4],[L.len*1.3, L.crankR*0.4, L.bore*1.4]], M(24), MAT.iron(), 10);
  add('exhaust', dp);
  addPuffs(root, anim, new THREE.Vector3(L.len*1.32, L.crankR*0.4, L.bore*1.4), L.bore);

  /* ---- cooling / accessories ---- */
  if (has('waterpump')){
    const wp = group('wp');
    wp.add(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 18), 0, 0, Math.PI/2));
    add('waterpump', at(wp, frontX - M(30), L.deckH * 0.55, -L.bore * 0.4));
  }
  if (has('radiator')){
    const rad = group('rad');
    rad.add(coreMesh(L.bore * 4.4, L.deckH * 1.30, M(48), {}, 34));
    const fan = bladedWheel(L.deckH * 0.52, 7, M(52), MAT.black(), 0.7);
    rot(fan, 0, Math.PI/2, 0);
    fan.position.x = M(56);
    rad.add(fan); anim.fans.push(fan);
    /* top and bottom hoses back to the block */
    rad.add(pipe([[M(20), L.deckH * 0.95, -L.bore*0.5], [frontX*0.6, L.deckH*0.9, -L.bore*0.55],
                  [frontX - M(40), L.deckH*0.8, -L.bore*0.4]], L.bore*0.13, MAT.rubber(), 8));
    rad.add(pipe([[M(20), L.deckH * 0.18, L.bore*0.5], [frontX*0.6, L.deckH*0.25, L.bore*0.5],
                  [frontX - M(30), L.deckH*0.5, L.bore*0.3]], L.bore*0.13, MAT.rubber(), 8));
    add('radiator', at(rad, frontX - L.bore * 1.15, L.deckH * 0.58, 0));
  }
  if (has('fins')) add('fins', at(box(L.len, M(20), L.bore*1.6, MAT.alloyDark()), 0, L.deckH*1.15, 0));

  const pulley = group('pulley');
  pulley.add(rot(tubeMesh(L.crankR * 1.15, L.crankR * 0.35, M(34), MAT.iron(), 24), 0, 0, Math.PI/2));
  at(pulley, frontX - M(46), 0, 0);
  anim.pulleys.push({ node:pulley, ratio:1 });
  add('crankpulley', pulley);

  const alt = alternatorMesh(L.bore * 1.35);
  anim.pulleys.push({ node:alt.userData.pulley, ratio:2.6 });
  add('alternator', at(alt, frontX - M(30), L.deckH * 0.72, -L.bore * 0.85));

  add('starter', at(starterMesh(L.bore * 1.6), L.len * 0.42, -L.crankR * 0.1, L.bore * 0.85));

  const fw = group('fw');
  fw.add(rot(tubeMesh(L.bore * 1.05, L.crankR * 0.3, M(30), MAT.iron(), 32), 0, 0, Math.PI/2));
  at(fw, L.len/2 + M(26), 0, 0);
  anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  const cl = group('cl');
  cl.add(rot(tubeMesh(L.bore * 0.95, L.crankR * 0.35, M(46), MAT.steel(), 28), 0, 0, Math.PI/2));
  add('clutch', at(cl, L.len/2 + M(64), 0, 0));

  /* ---- sensors / ECU ---- */
  const sens = [
    ['crksensor', frontX + M(10), -L.crankR*0.9, L.bore*0.6],
    ['mapsensor', 0, inducY + L.bore*0.30, L.banks>=2?L.bore*0.2:-L.bore*0.8],
    ['knock', 0, L.crankR*1.4, -L.bore*0.82],
    ['o2', L.len*0.75, L.crankR*0.8, L.bore*1.35],
  ];
  for (const [id,x,y,z] of sens) if (has(id)) add(id, at(cyl(M(11), M(11), M(46), MAT.plastic(), 10), x, y, z));
  if (has('ecu')){
    const ecu = roundBox(M(190), M(45), M(150), .01, MAT.plastic());
    add('ecu', at(ecu, -L.len*0.2, L.deckH + L.bore*2.25, -L.bore*1.5));
  }
  if (has('vvt')){
    const vg = group('vvt');
    for (let b = 0; b < nBanksHead; b++){
      const a = L.bankAngles[b] ?? 0;
      const g = group('x');
      g.add(at(rot(tubeMesh(L.crankR*1.15, L.crankR*0.4, M(30), MAT.alloy(), 22), 0,0,Math.PI/2), frontX + M(4), L.deckH + L.bore*1.00, 0));
      g.rotation.x = a; vg.add(g);
    }
    add('vvt', vg);
  }

  return finalize(e, root, nodes, anim, L);
}

/* ====================================================================== */
/* rotary                                                                  */
/* ====================================================================== */
function buildRotary(e, tree){
  const R = M(105), ecc = M(15), width = M(80), pitch = width * 1.55;
  const root = group('engine'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const n = e.cyl;
  const has = (id) => !!tree.byId[id];
  const xOf = (i) => (i - (n-1)/2) * pitch;

  /* side + rotor housings */
  const sideG = group('side'), rhG = group('rh');
  for (let i = 0; i <= n; i++){
    const plate = roundBox(M(14), R*2.3, R*2.0, .02, MAT.alloy());
    at(rot(plate, 0, Math.PI/2, 0), xOf(i) - pitch/2, 0, 0);
    sideG.add(plate);
  }
  for (let i = 0; i < n; i++){
    const shape = new THREE.Shape();
    shape.moveTo(-R*1.18, -R*1.02);
    shape.lineTo(R*1.18, -R*1.02); shape.lineTo(R*1.18, R*1.02);
    shape.lineTo(-R*1.18, R*1.02); shape.closePath();
    const hole = new THREE.Path();
    const pts = epitrochoid(R, ecc, 140);
    hole.moveTo(pts[0].x, pts[0].y);
    for (let k = pts.length - 1; k >= 0; k--) hole.lineTo(pts[k].x, pts[k].y);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled:false, curveSegments:8 });
    g.rotateY(Math.PI/2); g.translate(xOf(i) - width/2, 0, 0);
    rhG.add(new THREE.Mesh(g, MAT.iron()));
  }
  add('block', sideG); add('stationary', at(rot(tubeMesh(M(40), M(26), M(20), MAT.steel(), 20), 0,0,Math.PI/2), xOf(0)-pitch/2, 0, 0));
  add('rotorhousing', rhG);

  /* eccentric shaft */
  const eg = group('eshaft');
  const shaft = cyl(M(24), M(24), pitch * (n + 1.2), MAT.steel(), 18);
  rot(shaft, 0, 0, Math.PI/2); eg.add(shaft);
  for (let i = 0; i < n; i++){
    const lobeG = group('lobe');
    const lobe = cyl(M(45), M(45), width * 0.9, MAT.steel(), 20);
    rot(lobe, 0, 0, Math.PI/2);
    lobe.position.set(xOf(i), ecc, 0);
    lobeG.add(lobe);
    lobeG.userData.phase = (i / n) * TAU;
    eg.add(lobeG);
  }
  anim.crank = eg;
  add('crank', eg);

  /* rotors */
  const rotG = group('rotors'), apexG = group('apex');
  for (let i = 0; i < n; i++){
    const rg = group('rotor');
    const shape = new THREE.Shape();
    const rr = R - ecc * 1.0;
    for (let k = 0; k <= 120; k++){
      const t = (k/120) * TAU;
      /* Reuleaux-ish triangle: three flanks bulging outward */
      const rad = rr * (1 + 0.16 * Math.cos(3 * t));
      const x = rad * Math.cos(t), y = rad * Math.sin(t);
      k ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, M(48), 0, TAU, true); shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: width * 0.94, bevelEnabled:false, curveSegments:6 });
    g.rotateY(Math.PI/2); g.translate(-width*0.47, 0, 0);
    const body = new THREE.Mesh(g, MAT.alloyDark());
    rg.add(body);
    for (let a = 0; a < 3; a++){
      const seal = box(width * 0.94, M(9), M(4), MAT.steel());
      const t = (a/3) * TAU;
      const rad = rr * 1.16;
      at(rot(seal, t, 0, 0), 0, rad * Math.sin(t), rad * Math.cos(t));
      seal.rotation.x = -t;
      apexG.add(seal);
      rg.userData.seals = rg.userData.seals || [];
    }
    rg.userData.phase = (i / n) * TAU;
    rg.userData.baseX = xOf(i);
    rotG.add(rg);
    anim.rotors.push(rg);
    /* each rotor face fires once per shaft revolution */
    const flame = flameMesh(R * 0.30);
    flame.material.depthTest = false;
    flame.position.set(xOf(i), 0, R * 0.55);
    root.add(flame);
    anim.flames.push({ node:flame, mat:flame.material, fire:(i / n) * TAU, cycle:TAU });
  }
  add('pistons', rotG); add('apex', apexG);

  /* tension bolts */
  const tb = group('tb');
  for (let k = 0; k < 12; k++){
    const t = (k/12) * TAU;
    const b = cyl(M(6), M(6), pitch * (n + 0.9), MAT.steel(), 8);
    rot(b, 0, 0, Math.PI/2);
    at(b, 0, Math.sin(t) * R * 1.05, Math.cos(t) * R * 1.05);
    tb.add(b);
  }
  add('maincaps', tb);

  add('oilpump', at(roundBox(M(80), M(80), M(60), .01, MAT.alloyDark()), xOf(0) - pitch*0.8, -R*0.6, R*0.5));
  add('oilpan', at(roundBox(pitch*(n+0.6), M(90), R*1.4, .02, MAT.alloyDark()), 0, -R*1.15, 0));

  if (has('turbo')){
    const tg = group('turbos');
    const cnt = e.aspiration === 'twinturbo' ? 2 : 1;
    for (let i = 0; i < cnt; i++){
      const t = turboUnit(R * (cnt > 1 ? 0.62 : 0.80));
      anim.turbos.push(t.userData.shaft);
      at(t, xOf(n-1) + pitch*(0.5 + i*0.55), -R*0.15 + i*R*0.55, R*1.05);
      tg.add(t);
    }
    add('turbo', tg);
    const ric = coreMesh(pitch*(n+1.4), R*0.8, M(76));
    rot(ric, 0, Math.PI/2, 0);
    add('intercooler', at(ric, 0, -R*0.1, -R*1.9));
  }

  const intakeG = group('intake');
  intakeG.add(at(roundBox(pitch*n*0.9, M(90), M(120), .02, MAT.alloy()), 0, R*0.55, -R*0.75));
  for (let i = 0; i < n; i++)
    intakeG.add(pipe([[xOf(i), R*0.5, -R*0.75],[xOf(i), R*0.2, -R*0.5],[xOf(i)-pitch*0.4, 0, -R*0.35]], M(19), MAT.alloy(), 8));
  add('intake', intakeG);
  add('throttle', at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 16), 0,0,Math.PI/2), -pitch*(n/2+0.4), R*0.55, -R*0.75));

  const injG = group('inj'), railG = group('rail');
  for (let i = 0; i < n*2; i++)
    injG.add(at(cyl(M(8), M(8), M(52), MAT.plastic(), 10), xOf(Math.floor(i/2)) + (i%2?M(24):-M(24)), R*0.25, -R*0.55));
  add('injectors', injG);
  railG.add(at(rot(cyl(M(13), M(13), pitch*n, MAT.steel(), 12), 0,0,Math.PI/2), 0, R*0.42, -R*0.62));
  add('fuelrail', railG);

  const plugG = group('plugs'), coilG = group('coils');
  for (let i = 0; i < n; i++) for (const s of [-1, 1]){
    plugG.add(at(rot(cyl(M(7), M(7), M(40), MAT.steel(), 10), 0, 0, Math.PI/2 + s*0.3), xOf(i) + s*M(22), M(10), -R*1.0));
    coilG.add(at(roundBox(M(26), M(50), M(30), .006, MAT.plastic()), xOf(i) + s*M(26), R*0.9, -R*0.3));
  }
  add('plugs', plugG); add('coils', coilG);

  const exG = group('ex');
  for (let i = 0; i < n; i++)
    exG.add(pipe([[xOf(i), 0, R*1.0],[xOf(i), -R*0.3, R*1.3],[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35]], M(20), MAT.hot(), 8));
  add('exmanifold', exG);
  add('exhaust', pipe([[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35],[xOf(n-1)+pitch*1.6, -R*0.5, R*1.2]], M(30), MAT.iron(), 10));
  addPuffs(root, anim, new THREE.Vector3(xOf(n-1)+pitch*1.65, -R*0.5, R*1.2), R*0.6);

  add('waterpump', at(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 16), 0,0,Math.PI/2), xOf(0)-pitch*0.9, R*0.3, -R*0.4));
  const rad = group('rad');
  const rcore = coreMesh(pitch*(n+1.6), R*1.3, M(46), {}, 30);
  rot(rcore, 0, Math.PI/2, 0); rad.add(rcore);
  const fan = group('fan');
  for (let i = 0; i < 7; i++){ const b = box(M(16), R*0.5, M(6), MAT.black()); b.rotation.z = (i/7)*TAU; fan.add(b); }
  fan.position.z = M(40); rad.add(fan); anim.fans.push(fan);
  add('radiator', at(rad, 0, R*0.1, -R*2.4));

  const pul = group('pul');
  pul.add(rot(tubeMesh(M(70), M(26), M(34), MAT.iron(), 22), 0,0,Math.PI/2));
  at(pul, xOf(0) - pitch*1.1, 0, 0); anim.pulleys.push({ node:pul, ratio:1 });
  add('crankpulley', pul);
  add('alternator', at(alternatorMesh(R*0.55), xOf(0)-pitch*0.9, R*0.75, -R*0.6));
  add('starter', at(starterMesh(R*0.62), xOf(n-1)+pitch*0.6, -R*0.35, -R*0.5));
  const fw = group('fw'); fw.add(rot(tubeMesh(R*0.95, M(30), M(30), MAT.iron(), 30), 0,0,Math.PI/2));
  at(fw, xOf(n-1) + pitch*0.75, 0, 0); anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  add('clutch', at(rot(tubeMesh(R*0.85, M(34), M(46), MAT.steel(), 26), 0,0,Math.PI/2), xOf(n-1)+pitch*1.05, 0, 0));

  for (const [id,x,y,z] of [['crksensor', xOf(0)-pitch*0.75, -R*0.5, R*0.4],
                            ['mapsensor', 0, R*0.75, -R*0.8],
                            ['knock', 0, -R*0.3, -R*0.9],
                            ['o2', xOf(n-1)+pitch*1.2, -R*0.5, R*1.2]])
    if (has(id)) add(id, at(cyl(M(11), M(11), M(46), MAT.plastic(), 10), x, y, z));
  if (has('ecu')) add('ecu', at(roundBox(M(190), M(45), M(150), .01, MAT.plastic()), 0, R*1.3, -R*1.4));

  return finalize(e, root, nodes, anim, { bore:R, deckH:R, len:pitch*n, crankR:ecc, rodLen:R, stroke:M(80) });
}

function addPuffs(root, anim, at3, scale){
  for (let i = 0; i < 5; i++){
    const m = puffMesh(scale * 0.16);
    m.position.copy(at3);
    root.add(m);
    anim.puffs.push({ node:m, mat:m.material, home:at3.clone(), offset:i / 5 });
  }
}

/* ====================================================================== */
function finalize(e, root, nodes, anim, L){
  /* remember home transforms + choose an explode direction per part */
  const home = new Map();
  for (const [id, objs] of nodes){
    for (const o of objs){
      home.set(o, o.position.clone());
      o.userData.explodeDir = explodeDir(id, o, L);
    }
  }
  const bounds = boundsOf(root);
  anim.rootNode = root;
  anim.homePos = root.position.clone();
  return {
    root, nodes, anim, home, bounds, layout:L,
    partIds: [...nodes.keys()],
    setExplode(f){
      for (const [id, objs] of nodes) for (const o of objs){
        const h = home.get(o), d = o.userData.explodeDir;
        o.position.copy(h).addScaledVector(d, f);
      }
    },
    update(state){ animate(e, anim, state, L); },
  };
}

const UP = new THREE.Vector3(0,1,0);
function explodeDir(id, obj, L){
  const up   = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const fwd  = new THREE.Vector3(-1, 0, 0);
  const back = new THREE.Vector3(1, 0, 0);
  const outZ = new THREE.Vector3(0, 0.15, -1).normalize();
  const map = {
    valvecover:up.clone().multiplyScalar(1.55), camcaps:up.clone().multiplyScalar(1.25),
    cam:up.clone().multiplyScalar(1.05), vvt:fwd.clone().multiplyScalar(1.3),
    rockers:up.clone().multiplyScalar(1.3), pushrods:up.clone().multiplyScalar(0.95),
    lifters:up.clone().multiplyScalar(0.6),
    valves:up.clone().multiplyScalar(0.8), head:up.clone().multiplyScalar(0.62),
    headgasket:up.clone().multiplyScalar(0.45), plugs:up.clone().multiplyScalar(1.5),
    glow:up.clone().multiplyScalar(1.5),
    coils:up.clone().multiplyScalar(1.85), intake:new THREE.Vector3(0,1.1,-0.5),
    throttle:new THREE.Vector3(-0.6,1.2,-0.7), injectors:new THREE.Vector3(0,1.35,-0.35),
    fuelrail:new THREE.Vector3(0,1.5,-0.4), hpfp:new THREE.Vector3(-0.5,1.2,0.5),
    turbo:new THREE.Vector3(0.3,0.7,1.1), wastegate:new THREE.Vector3(0.6,0.5,1.0),
    bov:new THREE.Vector3(-0.6,0.9,0.9), intercooler:new THREE.Vector3(0,0.2,-1.5),
    blower:up.clone().multiplyScalar(1.6),
    exmanifold:new THREE.Vector3(0,0.1,1.25), exhaust:new THREE.Vector3(0.8,-0.1,1.35),
    oilpan:down.clone().multiplyScalar(1.15), pickup:down.clone().multiplyScalar(0.75),
    oilpump:new THREE.Vector3(-0.7,-0.7,0.5), oilfilter:new THREE.Vector3(0.4,-0.6,1.0),
    maincaps:down.clone().multiplyScalar(0.72), mainbearings:down.clone().multiplyScalar(0.4),
    crank:down.clone().multiplyScalar(0.15), pistons:up.clone().multiplyScalar(0.3),
    rods:up.clone().multiplyScalar(0.12), apex:up.clone().multiplyScalar(0.7),
    rotorhousing:outZ.clone().multiplyScalar(0.5), stationary:fwd.clone().multiplyScalar(0.9),
    timing:fwd.clone().multiplyScalar(1.15), tensioner:fwd.clone().multiplyScalar(1.35),
    frontcover:fwd.clone().multiplyScalar(1.5), crankpulley:fwd.clone().multiplyScalar(1.75),
    waterpump:new THREE.Vector3(-1.3,0.35,-0.4), radiator:new THREE.Vector3(0,0,-1.7),
    fins:up.clone().multiplyScalar(1.2),
    alternator:new THREE.Vector3(-1.2,0.65,-0.7), starter:new THREE.Vector3(1.1,-0.3,0.7),
    flywheel:back.clone().multiplyScalar(1.4), clutch:back.clone().multiplyScalar(1.75),
    ecu:new THREE.Vector3(-0.4,1.7,-1.0), crksensor:new THREE.Vector3(-1.0,-0.5,0.7),
    mapsensor:new THREE.Vector3(0,1.6,-0.6), knock:new THREE.Vector3(0,0.4,-1.1),
    o2:new THREE.Vector3(1.0,-0.2,1.2), fuelpump:new THREE.Vector3(-0.8,0.4,0.9),
    block:new THREE.Vector3(0,0,0),
  };
  const v = (map[id] || new THREE.Vector3(0, 0.8, 0)).clone();
  return v.multiplyScalar(L.bore * 1.9);
}

/* ---------------------------------------------------------------------- */
function animate(e, anim, state, L){
  const th = state.crankAngle || 0;                 // 0…4π, one full four-stroke cycle
  const rpm = state.rpm || 0;
  const running = rpm > 1;
  const load = state.load ?? 0.5;
  const dt = state.dt ?? 0.016;
  const CYCLE = Math.PI * 4;

  if (anim.crank) anim.crank.rotation.x = th;

  /* rotors orbit the eccentric shaft at a third of its speed */
  for (const r of anim.rotors){
    const ph = th + r.userData.phase;
    r.position.set(r.userData.baseX, L.crankR * Math.sin(ph), L.crankR * Math.cos(ph));
    r.rotation.x = -ph / 3;
  }

  /* crank–slider: each cylinder is offset by where it sits in the firing order */
  for (const p of anim.pistons){
    const t = th - p.fire;
    const y = slider(L.crankR, L.rodLen, t);
    p.node.position.set(p.x, y * Math.cos(p.angle), -y * Math.sin(p.angle));
    p.node.rotation.x = p.angle;
  }
  for (const r of anim.rods){
    const t = th - r.fire;
    const y = slider(L.crankR, L.rodLen, t);
    const pinY = L.crankR * Math.cos(t), pinZ = L.crankR * Math.sin(t);
    /* the rod leans in its own bank plane, chasing the crank pin */
    const localPinY = pinY * Math.cos(-r.angle) - pinZ * Math.sin(-r.angle);
    const localPinZ = pinY * Math.sin(-r.angle) + pinZ * Math.cos(-r.angle);
    const tilt = Math.atan2(localPinZ, y - localPinY);
    r.node.position.set(r.x, y * Math.cos(r.angle), -y * Math.sin(r.angle));
    r.node.rotation.set(r.angle, 0, 0);
    r.node.rotateX(-tilt);
  }

  /* camshafts turn at half crank speed; the lobe you can see is the lobe that lifts */
  const camRot = th / 2;
  for (const c of anim.cams) if (c.spin) c.node.rotation.x = camRot;
  for (const lo of anim.lobes)
    lo.node.rotation.x = camRot + lo.phase + (lo.up ? Math.PI : 0);
  for (const v of anim.valves){
    const lift = lobeLift(camRot + v.phase, v.duration) * v.lift;
    v.node.position.y = -lift;
    if (v.spring){
      const f = lift / v.lift;
      v.spring.scale.y = 1 - f * 0.30;
      v.spring.position.y = v.springHome - lift * 0.5;
    }
  }
  for (const f of anim.followers){
    const lift = lobeLift(camRot + f.phase, f.duration) * f.travel;
    f.lifter.position.y = f.lifterHome + lift;
    f.pushrod.position.y = f.pushrodHome + lift;
    f.rocker.rotation.z = f.rockSign * (lift / f.travel) * 0.16;
  }

  /* combustion: a flash in the cylinder that is on its power stroke */
  for (const fl of anim.flames){
    const cycle = fl.cycle || CYCLE;
    let psi = (th - fl.fire) % cycle;
    if (psi < 0) psi += cycle;
    const win = deg(70);
    const k = psi < win ? 1 - psi / win : 0;
    const inten = running ? k * (0.30 + 0.70 * load) : 0;
    fl.mat.opacity = inten * 0.5;
    fl.node.scale.setScalar(0.5 + inten * 0.9);
  }

  /* exhaust leaving the tailpipe */
  const time = state.time || 0;
  for (const p of anim.puffs){
    if (!running){ p.mat.opacity = 0; continue; }
    const t = ((time * (0.7 + rpm / 2600) + p.offset) % 1);
    p.mat.opacity = (1 - t) * 0.22 * Math.min(1, load + 0.25);
    p.node.position.set(p.home.x + t * L.bore * 2.4, p.home.y + t * L.bore * 0.55, p.home.z);
    p.node.scale.setScalar(0.5 + t * 2.4);
  }

  /* belt drive and cooling fan */
  for (const p of anim.pulleys) p.node.rotation.x = th * (p.ratio ?? 1);
  for (const f of anim.fans) f.rotation.z = time * (running ? 6 + rpm / 900 : 0);
  for (const f of anim.fans) if (f.parent) f.rotation.x = time * (running ? 6 + rpm / 900 : 0);

  /* the turbo shaft has real inertia — it does not stop when you lift */
  anim.turboAngle = (anim.turboAngle || 0) + (state.turboSpin || 0) * dt;
  for (const t of anim.turbos) t.rotation.z = anim.turboAngle;

  /* vibration: primary and secondary imbalance, which is why an inline-6 is smooth
     and a big single is not */
  if (anim.rootNode && anim.homePos){
    const [p1, p2] = anim.shake || [0, 0];
    const amp = running ? Math.min(1, rpm / 3500) * L.bore * 0.035 : 0;
    const dy = (Math.cos(th) * p1 * 0.7 + Math.cos(th * 2) * p2) * amp;
    const dz = (Math.sin(th) * p1 + Math.sin(th * 2) * p2 * 0.6) * amp * 0.6;
    anim.rootNode.position.set(anim.homePos.x, anim.homePos.y + dy, anim.homePos.z + dz);
  }
}
