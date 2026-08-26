/* MotorLab — procedural 3D engine builder.
 * Reads an engine spec and constructs the whole assembly in metres, tagging
 * every mesh with its part id so the viewport can pick, hide, ghost, explode
 * and animate it. Nothing here is a downloaded model — it is all derived from
 * bore, stroke, cylinder count and layout.
 */
import * as THREE from 'three';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, bolt, group, tag, at, rot,
         boundsOf, slider, epitrochoid, deg, TAU } from '../lib/geo.js';
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

/** Crank pin angle for each cylinder, derived from the real firing order. */
function pinAngles(e){
  const fo = firingOrder(e);
  const per = (360 * e.revsPerCycle) / e.cyl;
  const out = new Array(e.cyl).fill(0);
  fo.forEach((cylNo, k) => { out[cylNo - 1] = deg((k * per) % 360); });
  return out;
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
  const anim = { pistons:[], rods:[], crank:null, cams:[], valves:[], pulleys:[], fans:[], flames:[], turbos:[], rotors:[] };
  const has = (id) => !!tree.byId[id];
  const airCooled = (e.coolant || '').startsWith('air');
  const ohv = e.cam === 'OHV';
  const pins = pinAngles(e);

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

  /* ---- crankshaft ---- */
  const crankG = group('crank');
  const mainJ = cyl(L.crankR * 0.5, L.crankR * 0.5, L.len * 0.98, MAT.steel(), 20);
  rot(mainJ, 0, 0, Math.PI/2); crankG.add(mainJ);
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const th = pins[i];
    const web = box(M(14), L.crankR * 2.1, L.crankR * 1.3, MAT.steel());
    web.position.set(p.x, 0, 0);
    const throwG = group('throw');
    const pin = cyl(L.crankR * 0.42, L.crankR * 0.42, L.pitch * 0.52, MAT.steel(), 16);
    rot(pin, 0, 0, Math.PI/2);
    pin.position.set(p.x, L.crankR, 0);
    const cw = box(M(16), L.crankR * 1.6, L.crankR * 1.1, MAT.steel());
    cw.position.set(p.x, -L.crankR * 0.75, 0);
    throwG.add(pin, cw, web);
    throwG.userData.pinAngle = th;
    throwG.rotation.x = th;
    /* rotate the throw about the crank axis, which passes through y=0,z=0 */
    const holder = group('holder'); holder.add(throwG);
    crankG.add(holder);
    throwG.position.set(0,0,0);
    /* reposition children so rotation happens about the crank centreline */
    pin.position.set(p.x, L.crankR, 0);
    cw.position.set(p.x, -L.crankR * 0.75, 0);
    web.position.set(p.x, L.crankR * 0.1, 0);
  }
  const snout = cyl(L.crankR * 0.36, L.crankR * 0.36, M(70), MAT.steel(), 16);
  rot(snout, 0, 0, Math.PI/2); snout.position.x = -L.len/2 - M(30); crankG.add(snout);
  anim.crank = crankG;
  add('crank', crankG);

  /* ---- pistons + rods ---- */
  const pistG = group('pistons'), rodG = group('rods');
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const pg = group('p' + i);
    const crown = cyl(L.bore/2 * 0.985, L.bore/2 * 0.985, L.bore * 0.52, MAT.alloy(), 22);
    pg.add(crown);
    for (let r = 0; r < 3; r++){
      const ring = torus(L.bore/2 * 0.99, M(1.6), r === 2 ? MAT.iron() : MAT.steel(), 22);
      rot(ring, Math.PI/2, 0, 0); ring.position.y = L.bore*0.16 - r * M(5);
      pg.add(ring);
    }
    const pinM = cyl(M(9), M(9), L.bore * 0.62, MAT.steel(), 12);
    rot(pinM, 0, 0, Math.PI/2); pinM.position.y = -L.bore*0.06; pg.add(pinM);
    pg.userData.cylIndex = i;
    pistG.add(pg);

    const rg = group('r' + i);
    const beam = box(M(15), L.rodLen, M(26), MAT.steel());
    beam.position.y = -L.rodLen/2; rg.add(beam);
    const bigEnd = tubeMesh(L.crankR * 0.62, L.crankR * 0.42, M(24), MAT.steel(), 16);
    rot(bigEnd, 0, 0, Math.PI/2); bigEnd.position.y = -L.rodLen; rg.add(bigEnd);
    const smallEnd = tubeMesh(M(15), M(9), M(20), MAT.steel(), 14);
    rot(smallEnd, 0, 0, Math.PI/2); rg.add(smallEnd);
    rodG.add(rg);

    anim.pistons.push({ node:pg, i, x:p.x, angle:p.angle, pin:pins[i] });
    anim.rods.push({ node:rg, i, x:p.x, angle:p.angle, pin:pins[i] });
  }
  add('pistons', pistG); add('rods', rodG);

  /* ---- head gasket + heads ---- */
  const hgG = group('hg'), headG = group('heads'), vcG = group('vc');
  const camG = group('cams'), capG = group('camcaps'), valG = group('valves');
  const plugG = group('plugs'), coilG = group('coils'), injG = group('inj'), railG = group('rail');
  const nBanksHead = L.banks === 4 ? 2 : L.banks;
  for (let b = 0; b < nBanksHead; b++){
    const a = L.bankAngles[b] ?? 0;
    const mk = (obj, y, z=0) => { const g = group('h'); g.add(obj); obj.position.set(0, y, z); g.rotation.x = a; return g; };

    hgG.add(mk(box(L.len, M(2.2), L.bore*1.5, MAT.gasket()), L.deckH));
    const headBody = roundBox(L.len, L.bore * 0.62, L.bore * 1.5, 0.02, MAT.alloy());
    headG.add(mk(headBody, L.deckH + L.bore * 0.31));
    /* head bolts */
    for (let i = 0; i < e.cyl / (L.banks >= 2 ? 2 : 1) + 1; i++){
      for (const sgn of [-1, 1]){
        const bl = bolt(M(6), M(30), MAT.steel());
        const x = (i - (L.perBank) / 2) * L.pitch + L.pitch/2;
        headG.add(mk(at(bl, x, 0, sgn * L.bore * 0.62), L.deckH + L.bore * 0.6));
      }
    }
    if (!ohv){
      const nCams = e.cam === 'SOHC' ? 1 : 2;
      for (let c = 0; c < nCams; c++){
        const zc = nCams === 1 ? 0 : (c ? 1 : -1) * L.bore * 0.34;
        const shaft = cyl(M(16), M(16), L.len * 0.94, MAT.steel(), 16);
        rot(shaft, 0, 0, Math.PI/2);
        const cg = group('cam');
        cg.add(shaft);
        for (let i = 0; i < L.perBank * (e.valvesPerCyl / 2); i++){
          const lobe = cyl(M(21), M(21), M(11), MAT.steel(), 16);
          rot(lobe, 0, 0, Math.PI/2);
          lobe.position.set((i - (L.perBank*(e.valvesPerCyl/2) - 1)/2) * (L.pitch/(e.valvesPerCyl/2)), M(5), 0);
          cg.add(lobe);
        }
        const holder = mk(cg, L.deckH + L.bore * 0.55, zc);
        camG.add(holder);
        anim.cams.push({ node:cg, bank:b, index:c });
        for (let i = 0; i < L.perBank + 1; i++){
          const cap = roundBox(M(30), M(16), M(34), 0.006, MAT.alloyDark());
          capG.add(mk(at(cap, (i - L.perBank/2) * L.pitch, 0, zc), L.deckH + L.bore*0.66, zc));
        }
      }
    }
    /* valves */
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if ((L.banks >= 2 ? s.bank % 2 : 0) !== b) continue;
      const p = cylPosition(e, i, L);
      for (let v = 0; v < Math.max(2, e.valvesPerCyl); v++){
        const intake = v < Math.max(1, e.valvesPerCyl/2);
        const zoff = (intake ? -1 : 1) * L.bore * 0.2 + ((v % 2) ? L.bore*0.09 : -L.bore*0.09);
        const vg = group('v');
        const stem = cyl(M(3.2), M(3.2), L.bore * 0.72, MAT.steel(), 10);
        const headV = cyl(L.bore * (intake ? 0.185 : 0.16), L.bore * (intake ? 0.185 : 0.16) * 0.75, M(5), intake ? MAT.steel() : MAT.hot(), 16);
        headV.position.y = -L.bore * 0.36;
        const spring = cyl(M(13), M(13), L.bore * 0.26, MAT.steel(), 10);
        spring.position.y = L.bore * 0.16;
        vg.add(stem, headV, spring);
        const holder = mk(at(vg, p.x, 0, zoff), L.deckH + L.bore * 0.30, zoff);
        valG.add(holder);
        anim.valves.push({ node:vg, cyl:i, intake, bank:b, pin:pins[i], lift:L.bore * 0.10 });
      }
      /* spark plug / injector / coil */
      if (e.fuel !== 'diesel'){
        const pl = cyl(M(7), M(7), L.bore * 0.34, MAT.steel(), 10);
        plugG.add(mk(at(pl, p.x, 0, 0), L.deckH + L.bore * 0.5));
        const co = roundBox(M(26), L.bore*0.34, M(30), .006, MAT.plastic());
        coilG.add(mk(at(co, p.x, 0, 0), L.deckH + L.bore * 0.86));
      } else {
        const inj = cyl(M(9), M(9), L.bore*0.4, MAT.steel(), 10);
        injG.add(mk(at(inj, p.x, 0, 0), L.deckH + L.bore*0.55));
      }
    }
    /* valve cover */
    const vc = roundBox(L.len * 0.98, L.bore * 0.34, L.bore * 1.36, 0.02, MAT.alloyDark());
    vcG.add(mk(vc, L.deckH + L.bore * 0.92));
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
    const shaft = cyl(M(19), M(19), L.len * 0.96, MAT.steel(), 16);
    rot(shaft, 0, 0, Math.PI/2); camIn.add(shaft);
    for (let i = 0; i < e.cyl; i++){
      const lobe = cyl(M(24), M(24), M(12), MAT.steel(), 14);
      rot(lobe, 0, 0, Math.PI/2);
      lobe.position.set((i - (e.cyl-1)/2) * (L.len/e.cyl), M(6), 0);
      camIn.add(lobe);
    }
    camIn.position.y = L.crankR * 1.55;
    anim.cams.push({ node:camIn, bank:0, index:0 });
    add('cam', camIn);

    const liftG = group('lifters'), prG = group('pushrods'), rkG = group('rockers');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      for (const sgn of [-1, 1]){
        const lf = cyl(M(11), M(11), M(40), MAT.steel(), 10);
        at(lf, p.x, L.crankR * 2.2, sgn * L.bore * 0.18); liftG.add(lf);
        const pr = cyl(M(4), M(4), L.deckH * 0.72, MAT.steel(), 8);
        at(pr, p.x, L.crankR * 2.2 + L.deckH * 0.4, sgn * L.bore * 0.2); prG.add(pr);
        const rk = box(M(52), M(13), M(15), MAT.steel());
        at(rot(rk, 0, 0, sgn * 0.12), p.x, L.deckH + L.bore * 0.42, sgn * L.bore * 0.3);
        rkG.add(rk);
      }
    }
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
        spr.position.set(frontX, L.deckH + L.bore * 0.55, zc);
        g.add(spr); g.rotation.x = a; tG.add(g);
        const chain = pipe([[frontX, L.crankR*0.7, 0],
                            [frontX, L.deckH*0.6, L.bore*0.5*Math.sign(zc||1)],
                            [frontX, L.deckH + L.bore*0.55, zc]], M(4), MAT.steel(), 6);
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
  const inducY = L.deckH + L.bore * 1.15;
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
      [p.x, L.deckH + L.bore * 0.42, zHead],
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
      injG.add(at(cyl(M(8), M(8), M(56), MAT.plastic(), 10), p.x, L.deckH + L.bore * 0.5, zHead));
    }
    add('injectors', injG);
    for (const b of [0, 1].slice(0, nBanksHead)){
      const z = L.banks >= 2 ? (b ? 1 : -1) * L.bore * 0.62 : -L.bore * 0.56;
      railG.add(at(rot(cyl(M(13), M(13), L.len * 0.9, MAT.steel(), 12), 0, 0, Math.PI/2), 0, L.deckH + L.bore * 0.66, z));
    }
    add('fuelrail', railG);
  }
  if (has('hpfp')) add('hpfp', at(roundBox(M(60), M(60), M(60), .01, MAT.alloyDark()), -L.len*0.36, L.deckH + L.bore*0.8, L.bore*0.7));
  if (has('fuelpump')) add('fuelpump', at(roundBox(M(60), M(50), M(50), .01, MAT.alloyDark()), -L.len*0.3, L.crankR, L.bore*0.85));

  /* turbo / blower */
  if (has('turbo')){
    const n = { turbo:1, twinturbo:2, quadturbo:4 }[e.aspiration] || 1;
    const tg = group('turbos');
    for (let i = 0; i < n; i++){
      const t = group('t');
      const zs = (i % 2 ? 1 : -1) * (L.banks >= 2 ? L.bore * 0.05 : L.bore * 1.0);
      const xs = (Math.floor(i/2) - (n > 2 ? 0.5 : 0)) * L.len * 0.4;
      const turbine = cyl(L.bore * 0.42, L.bore * 0.42, L.bore * 0.34, MAT.hot(), 22);
      rot(turbine, Math.PI/2, 0, 0); turbine.position.z = -L.bore * 0.22;
      const compr = cyl(L.bore * 0.38, L.bore * 0.38, L.bore * 0.3, MAT.alloy(), 22);
      rot(compr, Math.PI/2, 0, 0); compr.position.z = L.bore * 0.22;
      const chra = cyl(L.bore * 0.16, L.bore * 0.16, L.bore * 0.2, MAT.alloyDark(), 16);
      rot(chra, Math.PI/2, 0, 0);
      const wheel = group('w');
      for (let bl = 0; bl < 9; bl++){
        const v = box(M(3), L.bore*0.26, L.bore*0.1, MAT.chrome());
        v.rotation.z = (bl/9) * TAU; v.position.y = 0;
        wheel.add(v);
      }
      rot(wheel, Math.PI/2, 0, 0); wheel.position.z = L.bore * 0.22;
      t.add(turbine, compr, chra, wheel);
      at(t, xs, L.banks >= 2 ? L.deckH + L.bore * 0.9 : L.deckH * 0.55, zs);
      anim.turbos.push(wheel);
      tg.add(t);
    }
    add('turbo', tg);
    add('wastegate', at(cyl(M(28), M(28), M(70), MAT.hot(), 14), L.len*0.3, L.deckH*0.7, (L.banks>=2? L.bore*0.6 : L.bore*1.3)));
    add('bov', at(cyl(M(24), M(24), M(60), MAT.blue(), 14), -L.len*0.35, L.deckH + L.bore*0.5, L.bore*1.1));
    add('intercooler', at(box(L.len*1.25, L.bore*0.95, M(85), MAT.alloyDark()), 0, L.deckH*0.25, -L.bore*2.1));
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
      [p.x, L.deckH + L.bore * 0.34, zH],
      [p.x, L.deckH * 0.72, zH + side * L.bore * 0.45],
      [(p.x + collectorX)/2, L.deckH * 0.5, side * L.bore * 0.95],
      [collectorX, L.deckH * 0.42, side * L.bore * 1.0],
    ], M(16), MAT.hot(), 8));
  }
  add('exmanifold', exG);
  const dp = pipe([[0, L.deckH*0.42, L.bore*1.0],[L.len*0.6, L.crankR, L.bore*1.4],[L.len*1.3, L.crankR*0.4, L.bore*1.4]], M(24), MAT.iron(), 10);
  add('exhaust', dp);

  /* ---- cooling / accessories ---- */
  if (has('waterpump')){
    const wp = group('wp');
    wp.add(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 18), 0, 0, Math.PI/2));
    add('waterpump', at(wp, frontX - M(30), L.deckH * 0.55, -L.bore * 0.4));
  }
  if (has('radiator')){
    const rad = group('rad');
    rad.add(box(L.len * 1.5, L.deckH * 1.25, M(48), MAT.alloyDark()));
    const fan = group('fan');
    for (let i = 0; i < 7; i++){
      const bl2 = box(M(16), L.deckH * 0.42, M(6), MAT.black());
      bl2.rotation.z = (i/7) * TAU; bl2.position.y = 0;
      fan.add(bl2);
    }
    fan.position.z = M(40); rad.add(fan); anim.fans.push(fan);
    add('radiator', at(rad, 0, L.deckH * 0.55, -L.bore * 2.6));
  }
  if (has('fins')) add('fins', at(box(L.len, M(20), L.bore*1.6, MAT.alloyDark()), 0, L.deckH*1.15, 0));

  const pulley = group('pulley');
  pulley.add(rot(tubeMesh(L.crankR * 1.15, L.crankR * 0.35, M(34), MAT.iron(), 24), 0, 0, Math.PI/2));
  at(pulley, frontX - M(46), 0, 0);
  anim.pulleys.push(pulley);
  add('crankpulley', pulley);

  const alt = group('alt');
  alt.add(rot(cyl(M(56), M(56), M(110), MAT.alloy(), 18), 0, 0, Math.PI/2));
  const altP = rot(tubeMesh(M(30), M(12), M(22), MAT.steel(), 18), 0, 0, Math.PI/2);
  altP.position.x = -M(66); alt.add(altP);
  anim.pulleys.push(altP);
  add('alternator', at(alt, frontX - M(40), L.deckH * 0.72, -L.bore * 0.75));

  add('starter', at(rot(cyl(M(48), M(48), M(150), MAT.alloyDark(), 16), 0, 0, Math.PI/2), L.len * 0.4, -L.crankR*0.2, L.bore * 0.8));

  const fw = group('fw');
  fw.add(rot(tubeMesh(L.bore * 1.05, L.crankR * 0.3, M(30), MAT.iron(), 32), 0, 0, Math.PI/2));
  at(fw, L.len/2 + M(26), 0, 0);
  anim.pulleys.push(fw);
  add('flywheel', fw);
  const cl = group('cl');
  cl.add(rot(tubeMesh(L.bore * 0.95, L.crankR * 0.35, M(46), MAT.steel(), 28), 0, 0, Math.PI/2));
  add('clutch', at(cl, L.len/2 + M(64), 0, 0));

  /* ---- sensors / ECU ---- */
  const sens = [
    ['crksensor', frontX + M(10), -L.crankR*0.9, L.bore*0.6],
    ['mapsensor', 0, inducY + L.bore*0.28, L.banks>=2?L.bore*0.2:-L.bore*0.8],
    ['knock', 0, L.crankR*1.4, -L.bore*0.82],
    ['o2', L.len*0.75, L.crankR*0.8, L.bore*1.35],
  ];
  for (const [id,x,y,z] of sens) if (has(id)) add(id, at(cyl(M(11), M(11), M(46), MAT.plastic(), 10), x, y, z));
  if (has('ecu')){
    const ecu = roundBox(M(190), M(45), M(150), .01, MAT.plastic());
    add('ecu', at(ecu, -L.len*0.2, L.deckH + L.bore*1.55, -L.bore*1.5));
  }
  if (has('vvt')){
    const vg = group('vvt');
    for (let b = 0; b < nBanksHead; b++){
      const a = L.bankAngles[b] ?? 0;
      const g = group('x');
      g.add(at(rot(tubeMesh(L.crankR*1.15, L.crankR*0.4, M(30), MAT.alloy(), 22), 0,0,Math.PI/2), frontX + M(4), L.deckH + L.bore*0.55, 0));
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
  const anim = { pistons:[], rods:[], crank:null, cams:[], valves:[], pulleys:[], fans:[], rotors:[], turbos:[] };
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
      const t = group('t');
      t.add(rot(cyl(M(70), M(70), M(60), MAT.hot(), 20), Math.PI/2, 0, 0));
      const c = rot(cyl(M(62), M(62), M(54), MAT.alloy(), 20), Math.PI/2, 0, 0);
      c.position.z = M(58); t.add(c);
      const wheel = group('w');
      for (let b = 0; b < 9; b++){ const v = box(M(3), M(46), M(18), MAT.chrome()); v.rotation.z = (b/9)*TAU; wheel.add(v); }
      rot(wheel, Math.PI/2, 0, 0); wheel.position.z = M(58); t.add(wheel);
      anim.turbos.push(wheel);
      at(t, xOf(n-1) + pitch*0.55, -R*0.2 + i*R*0.75, R*0.85);
      tg.add(t);
    }
    add('turbo', tg);
    add('intercooler', at(box(pitch*(n+1.4), R*0.8, M(80), MAT.alloyDark()), 0, -R*0.1, -R*1.9));
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

  add('waterpump', at(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 16), 0,0,Math.PI/2), xOf(0)-pitch*0.9, R*0.3, -R*0.4));
  const rad = group('rad'); rad.add(box(pitch*(n+1.6), R*1.3, M(48), MAT.alloyDark()));
  const fan = group('fan');
  for (let i = 0; i < 7; i++){ const b = box(M(16), R*0.5, M(6), MAT.black()); b.rotation.z = (i/7)*TAU; fan.add(b); }
  fan.position.z = M(40); rad.add(fan); anim.fans.push(fan);
  add('radiator', at(rad, 0, R*0.1, -R*2.4));

  const pul = group('pul');
  pul.add(rot(tubeMesh(M(70), M(26), M(34), MAT.iron(), 22), 0,0,Math.PI/2));
  at(pul, xOf(0) - pitch*1.1, 0, 0); anim.pulleys.push(pul);
  add('crankpulley', pul);
  add('alternator', at(rot(cyl(M(56), M(56), M(110), MAT.alloy(), 16), 0,0,Math.PI/2), xOf(0)-pitch*0.9, R*0.75, -R*0.6));
  add('starter', at(rot(cyl(M(48), M(48), M(150), MAT.alloyDark(), 16), 0,0,Math.PI/2), xOf(n-1)+pitch*0.6, -R*0.35, -R*0.5));
  const fw = group('fw'); fw.add(rot(tubeMesh(R*0.95, M(30), M(30), MAT.iron(), 30), 0,0,Math.PI/2));
  at(fw, xOf(n-1) + pitch*0.75, 0, 0); anim.pulleys.push(fw);
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
  root.position.y -= 0;
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
  const th = state.crankAngle || 0;
  if (anim.crank) anim.crank.rotation.x = th;
  /* rotary */
  for (const r of anim.rotors){
    const ph = th + r.userData.phase;
    r.position.set(r.userData.baseX, L.crankR * Math.sin(ph), L.crankR * Math.cos(ph));
    r.rotation.x = -ph / 3;
  }
  /* pistons + rods */
  for (const p of anim.pistons){
    const t = th - p.pin;
    const y = slider(L.crankR, L.rodLen, t);
    const node = p.node;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    node.position.set(p.x, y * c, -y * s);
    node.rotation.x = p.angle;
  }
  for (const r of anim.rods){
    const t = th - r.pin;
    const y = slider(L.crankR, L.rodLen, t);
    const pinY = L.crankR * Math.cos(t), pinZ = L.crankR * Math.sin(t);
    /* rod tilt within the bank plane */
    const localPinY = pinY * Math.cos(-r.angle) - pinZ * Math.sin(-r.angle);
    const localPinZ = pinY * Math.sin(-r.angle) + pinZ * Math.cos(-r.angle);
    const tilt = Math.atan2(localPinZ, y - localPinY);
    const node = r.node;
    const c = Math.cos(r.angle), sN = Math.sin(r.angle);
    node.position.set(r.x, y * c, -y * sN);
    node.rotation.set(r.angle, 0, 0);
    node.rotateX(tilt);
  }
  /* cams at half crank speed; valves lift on their own phase */
  for (const c of anim.cams) c.node.rotation.x = th / 2;
  for (const v of anim.valves){
    const t = ((th - v.pin) / 2) % TAU;
    const centre = v.intake ? Math.PI * 0.5 : Math.PI * 1.5;
    let d = ((t - centre + Math.PI * 3) % TAU) - Math.PI;
    const win = 1.25;
    const lift = Math.abs(d) < win ? Math.pow(Math.cos((d / win) * Math.PI / 2), 2) : 0;
    v.node.position.y = -lift * v.lift;
  }
  for (const p of anim.pulleys) p.rotation.x = th * 1.8;
  for (const f of anim.fans) f.rotation.z = th * 0.6;
  const boost = state.boost || 0;
  for (const t of anim.turbos) t.rotation.z = th * (3 + boost * 6);
}
