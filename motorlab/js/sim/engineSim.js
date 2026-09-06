/* MotorLab — engine simulator.
 *
 * Physically-flavoured, not a CFD solver: torque comes from mean effective
 * pressure, which comes from how much air the engine breathes, how dense that
 * air is, how well the mixture burns and how much friction it drags. Every
 * upgrade and every tuning change moves one of those terms, so the dyno graph
 * responds for the right reason.
 *
 *     T [Nm] = Vd[m³] · BMEP[Pa] / (2π · revsPerCycle)
 *     BMEP   = IMEP − FMEP
 *     IMEP   = imepRef · VE · densityRatio · ηmixture · ηtiming · headFlow
 */

import { FUELS, displacementL, pistonSpeed, isBoosted } from '../data/engines.js';
import { lookup, mbtTiming, requiredOctane, fuelProps, defaultTune, LOAD_BINS, clamp } from './ecu.js';

const AMBIENT_K = 298.15, AMBIENT_KPA = 101.325, GAMMA = 1.4;

/** Neutral modifier set — upgrades merge into this. */
export function emptyMods(){
  return {
    veMul:1, veRpmShift:0, veTopEnd:1,      // breathing
    headFlowMul:1, crDelta:0, camDuration:0,
    boostMul:1, boostAdd:0, boostCeil:99, spoolMul:1, turbineTopEnd:1,
    intercoolerEff:0.62, iatOffset:0,
    frictionMul:1, inertiaMul:1, parasiticMul:1,
    maxFuelKgH:0, restrictorMm:0,           // 0 = unrestricted
    injectorMul:1, fuelPumpMul:1,
    clampMul:1, rotatingStrength:1, coolingMul:1,
    weightKg:0, cost:0, exhaustMul:1, driveLoss:0.14,
    labels:[],
  };
}

export function veCurve(e, mods){
  const boosted = isBoosted(e);
  const peakRpm = clamp((boosted ? e.hpPeak * 0.82 : e.tqPeak) + mods.veRpmShift + mods.camDuration * 9,
                        e.idle * 1.5, e.redline * 0.98);
  const basePeak =
      e.class === 'race' ? 1.03
    : e.class === 'bike' ? 0.99
    : e.kind === 'rotary' ? 0.92
    : e.cam === 'OHV' ? 0.88
    : e.valvesPerCyl >= 4 ? 0.95 : 0.90;
  const peak = basePeak * mods.veMul * (1 + mods.camDuration * 0.004);
  const loSig = Math.max(600, (peakRpm - e.idle) * 0.78);
  const hiSig = Math.max(700, (e.redline - peakRpm) * 0.92 * mods.veTopEnd);
  return (rpm) => {
    const s = rpm < peakRpm ? loSig : hiSig;
    const x = (rpm - peakRpm) / s;
    let ve = peak * Math.exp(-0.5 * x * x);
    /* long-runner reversion below ~1200 rpm, and cam overlap hurting idle */
    if (rpm < e.idle * 1.6) ve *= 0.86 + 0.14 * (rpm / (e.idle * 1.6));
    if (mods.camDuration > 0 && rpm < peakRpm * 0.55) ve *= 1 - Math.min(0.28, mods.camDuration * 0.0035);
    return ve;
  };
}

/** What the hardware can deliver: the standard target scaled by whatever
 *  compressor is fitted, plus any bolt-on blower on a naturally aspirated engine. */
export function boostCapability(e, mods){
  const base = (e.boostTarget || 0) * (mods.boostMul ?? 1);
  return Math.min(mods.boostCeil ?? 99, base + (mods.boostAdd ?? 0));
}
export function inducedType(e, mods){
  if (e.aspiration !== 'na') return e.aspiration;
  return (mods.boostAdd ?? 0) > 0 ? 'supercharged' : 'na';
}

export function boostCurve(e, tune, mods){
  const cap = boostCapability(e, mods);
  /* the tune commands boost; the hardware caps what it can actually make */
  const commanded = tune.boostTarget ?? e.boostTarget ?? 0;
  const target = Math.min(commanded > 0 ? commanded : cap, cap);
  const asp = inducedType(e, mods);
  if (asp === 'na' || target <= 0) return () => 0;
  if (asp === 'supercharged'){
    if (e.scType === 'centrifugal')
      return (rpm) => target * Math.min(1, Math.pow(rpm / (e.redline * 0.92), 2));
    return (rpm) => target * Math.min(1, rpm / (e.idle * 1.6));       // positive displacement
  }
  const spool = Math.max(900, (e.spoolRpm || 2200) / mods.spoolMul) * (tune.antilag ? 0.62 : 1);
  const k = spool * 0.20;
  const flowLimit = e.redline * 0.84 * mods.turbineTopEnd;
  return (rpm) => {
    const s = 1 / (1 + Math.exp(-(rpm - spool) / k));
    const taper = rpm > flowLimit ? 1 - 0.30 * ((rpm - flowLimit) / Math.max(1, e.redline - flowLimit)) : 1;
    return target * s * Math.max(0.55, taper);
  };
}

/** Compressor discharge temperature after intercooling (°C). */
export function chargeTemp(boostBar, mods, ambientC = 25){
  if (boostBar <= 0) return ambientC + 8 + mods.iatOffset;             // underbonnet heat soak
  const pr = (AMBIENT_KPA + boostBar * 100) / AMBIENT_KPA;
  const etaC = 0.72;
  const tOut = (ambientC + 273.15) * Math.pow(pr, (GAMMA - 1) / (GAMMA * etaC)) - 273.15;
  const eff = clamp(mods.intercoolerEff, 0, 0.95);
  return ambientC + (tOut - ambientC) * (1 - eff) + mods.iatOffset;
}

/** Chen-Flynn style friction mean effective pressure, bar. */
export function fmep(e, rpm, peakCylBar, mods){
  const sp = e.kind === 'rotary' ? rpm * 0.0022 : pistonSpeed(e, rpm);
  const base = 0.38 + 0.0048 * peakCylBar + 0.088 * sp + 0.00085 * sp * sp;
  const rot = e.kind === 'rotary' ? 0.80 : 1;                        // fewer reciprocating parts
  return base * rot * mods.frictionMul;
}

/** Mixture efficiency vs lambda. */
export function etaMixture(e, lambda){
  if (e.fuel === 'diesel') return clamp(1.15 / Math.max(0.9, lambda), 0, 1.06);
  if (e.fuel === 'nitro')  return clamp(1 - 1.1 * Math.pow(lambda - 0.42, 2) * 8, 0.3, 1.05);
  const best = 0.88;
  if (lambda <= 1.02) return clamp(1 - 2.1 * Math.pow(lambda - best, 2), 0.4, 1);
  return clamp(1 - 2.1 * Math.pow(1.02 - best, 2) - 0.62 * (lambda - 1.02), 0.25, 1);
}

/** Torque efficiency when spark is away from MBT. */
export function etaTiming(deltaDeg){
  const d = Math.abs(deltaDeg);
  return clamp(1 - 0.00095 * d * d, 0.45, 1);
}

/** Choked mass flow through an inlet restrictor, kg/h. */
export function restrictorFlow(mm){
  if (!mm) return Infinity;
  const A = Math.PI * Math.pow(mm / 2000, 2);                        // m²
  return 0.0404 * AMBIENT_KPA * 1000 * A / Math.sqrt(AMBIENT_K) * 3600;
}

/* ---------------------------------------------------------------------- */

export function simulate(e, tune, mods = emptyMods(), opts = {}){
  const load = opts.load ?? 100;
  const ambientC = opts.ambientC ?? 25;
  const ve = veCurve(e, mods);
  const boostFn = boostCurve(e, tune, mods);
  const f = fuelProps(tune);
  const Vd = displacementL(e) / 1000;                                  // m³
  const cyc = 2 * Math.PI * e.revsPerCycle;
  const cr = e.cr + mods.crDelta;
  const points = [];
  const events = [];
  let damage = 0;

  const rpmMax = Math.min(tune.revLimit, e.redline * 1.35);
  const step = Math.max(50, Math.round((rpmMax - e.idle) / 90 / 25) * 25);

  for (let rpm = Math.max(800, e.idle); rpm <= rpmMax + 1; rpm += step){
    const boostRaw = load >= 95 ? boostFn(rpm) : boostFn(rpm) * Math.pow(load/100, 1.6);
    const boost = Math.max(0, boostRaw);
    const iat = chargeTemp(boost, mods, ambientC);
    const map = AMBIENT_KPA * (load >= 95 ? 0.985 : 0.30 + 0.70 * (load/100)) + boost * 100;
    const density = (map / AMBIENT_KPA) * (AMBIENT_K / (iat + 273.15));

    const veNow = ve(rpm);
    const lambda = lookup(tune.lambda, tune.rpmBins, rpm, load);
    const cmdAdv = lookup(tune.timing, tune.rpmBins, rpm, load);
    const mbt = mbtTiming(e, rpm, load, boost, f);

    /* knock control loop -------------------------------------------- */
    let adv = cmdAdv, knock = 0, retard = 0;
    if (e.fuel !== 'diesel'){
      for (let iter = 0; iter < 24; iter++){
        const need = requiredOctane({ ...e, cr }, boost, lambda, adv, mbt, iat, f);
        const over = need - f.octane;
        if (over <= 0) break;
        if (retard >= tune.knockRetardMax){ knock = over; break; }
        adv -= 0.5; retard += 0.5;
      }
      if (knock > 0) damage += knock * 0.02 * (rpm / e.redline);
    } else { adv = 0; }

    /* mean effective pressures --------------------------------------- */
    const crFactor = e.fuel === 'diesel' ? 1 : clamp(1 + 0.026 * (cr - 10), 0.8, 1.3);
    const etaMix  = etaMixture(e, lambda);
    const etaTim  = e.fuel === 'diesel' ? 1 : etaTiming(adv - mbt);
    const headFlow = headFlowFactor(e) * mods.headFlowMul * mods.exhaustMul;
    let imep = f.bmep * veNow * density * etaMix * etaTim * headFlow * crFactor;
    if (knock > 0) imep *= clamp(1 - knock * 0.012, 0.55, 1);

    const peakCyl = imep * cr * 0.9;
    let bmep = imep - fmep(e, rpm, peakCyl, mods);

    /* supercharger parasitic drag ------------------------------------ */
    if (e.aspiration === 'supercharged' && boost > 0){
      const drag = (e.scType === 'roots' ? 0.115 : 0.075) * boost * displacementL(e) * mods.parasiticMul;
      bmep -= drag;
    }
    bmep = Math.max(0, bmep);

    let tq = (Vd * bmep * 1e5) / cyc;                                   // Nm

    /* airflow ceiling (inlet restrictor) ------------------------------ */
    let airKgH = veNow * density * 1.184 * displacementL(e) * (rpm / (60 * e.revsPerCycle)) * 3.6;
    const capAir = restrictorFlow(mods.restrictorMm || e.restrictor || 0);
    let capped = null;
    if (airKgH > capAir){ tq *= capAir / airKgH; airKgH = capAir; capped = 'inlet restrictor'; }

    /* fuel-flow ceiling (regulation, or the pump) ---------------------- */
    let fuelKgH = airKgH / (f.afr * lambda);
    const capFuel = mods.maxFuelKgH || e.fuelFlowMaxKgH || 0;
    if (capFuel && fuelKgH > capFuel){ tq *= capFuel / fuelKgH; fuelKgH = capFuel; capped = 'fuel-flow limit'; }

    /* injector duty cycle --------------------------------------------- */
    const duty = injectorDuty(e, mods, fuelKgH);
    if (duty > 1.0){ tq /= duty; capped = 'injector duty'; }

    /* ECU torque limiter ---------------------------------------------- */
    if (tune.tqLimitNm > 0 && tq > tune.tqLimitNm) tq = tune.tqLimitNm;

    /* rev limiter fuel cut -------------------------------------------- */
    if (rpm > tune.revLimit) tq = 0;

    const hp = tq * rpm / 7127;
    const egt = exhaustTemp(e, lambda, adv, mbt, boost, load);

    points.push({
      rpm, tq, hp, kw: tq * rpm / 9549, boost, ve:veNow, lambda, timing:adv, cmdTiming:cmdAdv,
      mbt, retard, knock, iat, egt, bmep, imep, airKgH, fuelKgH, duty, density, capped,
      pistonSpeed: pistonSpeed(e, rpm),
    });
  }

  const peakHp = points.reduce((a,b) => b.hp > a.hp ? b : a, points[0]);
  const peakTq = points.reduce((a,b) => b.tq > a.tq ? b : a, points[0]);
  /* skipHealth breaks the recursion when we are computing the standard baseline */
  const health = opts.skipHealth
    ? { risks:[], score:100, damage, verdict:'—' }
    : assessHealth(e, tune, mods, points, damage);

  return {
    points, peakHp, peakTq, damage, health, fuel:f,
    hp: peakHp.hp, hpRpm: peakHp.rpm, tqNm: peakTq.tq, tqRpm: peakTq.rpm,
    lbft: peakTq.tq * 0.73756,
    specific: peakHp.hp / displacementL(e),
    events,
  };
}

function headFlowFactor(e){
  let k = e.kind === 'rotary' ? 1.00
        : e.cam === 'OHV' ? (e.valvesPerCyl >= 4 ? 0.99 : 0.94)
        : e.valvesPerCyl >= 4 ? 1.05 : 0.98;
  if (e.class === 'race') k *= 1.07;
  if (e.class === 'bike') k *= 1.05;
  if (e.valvetrain === 'pneumatic' || e.valvetrain === 'desmodromic') k *= 1.03;
  return k;
}

/* Factory injectors are sized for the engine's *native* fuel at its own peak
 * power. Change fuel (E85 needs ~50% more volume) or add boost and duty climbs
 * — which is exactly why an E85 conversion starts with bigger injectors. */
export function injectorCapacityKgH(e, mods = emptyMods()){
  const native = FUELS[e.fuel] || FUELS.gasoline;
  const nativeLambda = e.fuel === 'diesel' ? 1.15 : e.fuel === 'nitro' ? 0.42
                     : isBoosted(e) ? (e.class === 'race' ? 0.80 : 0.82) : 0.88;
  const boostF = isBoosted(e) ? 1.5 + (e.boostTarget || 0) * 0.5 : 1;
  const flowCcMin = (e.displacement / e.cyl) * (e.redline / 6000) * 0.42
                  * boostF * (14.7 / native.afr) * (0.88 / nativeLambda) * mods.injectorMul;
  const nInj = e.cyl * (e.kind === 'rotary' ? 2 : 1);
  return flowCcMin * 60 * 0.745 / 1000 * nInj * mods.fuelPumpMul;
}
function injectorDuty(e, mods, fuelKgH){
  const cap = injectorCapacityKgH(e, mods);
  return cap > 0 ? fuelKgH / cap : 0;
}

function exhaustTemp(e, lambda, adv, mbt, boost, load){
  if (e.fuel === 'diesel') return 380 + 320 * (load/100) + boost * 60;
  const peak = 700 + 260 * Math.exp(-Math.pow((lambda - 1.03) / 0.13, 2));
  const retardTerm = Math.max(0, mbt - adv) * 11;
  return peak + retardTerm + boost * 55 + (e.kind === 'rotary' ? 120 : 0) - (1 - load/100) * 220;
}

/* ---------------------------------------------------------------------- */
export function assessHealth(e, tune, mods, points, damage){
  const risks = [];
  const worst = (msg, sev) => risks.push({ msg, sev });
  const maxP  = points.reduce((a,b) => Math.max(a, b.pistonSpeed), 0);
  const maxEgt = points.reduce((a,b) => Math.max(a, b.egt), 0);
  const maxBoost = points.reduce((a,b) => Math.max(a, b.boost), 0);
  const maxTq = points.reduce((a,b) => Math.max(a, b.tq), 0);
  const leanHot = points.filter(p => p.lambda > (isBoosted(e) ? 0.93 : 1.03) && p.boost > 0.3);
  const knocking = points.filter(p => p.knock > 0);

  if (maxP > 25 * mods.rotatingStrength)
    worst(`Mean piston speed peaks at ${maxP.toFixed(1)} m/s. Above ~25 m/s you are into forged-rod-and-race-bearing territory.`, (maxP - 25) / 4);
  if (maxEgt > (e.fuel === 'diesel' ? 780 : 950))
    worst(`Exhaust gas temperature reaches ${maxEgt.toFixed(0)} °C. Turbine wheels and exhaust valves start giving up around ${e.fuel==='diesel'?780:950} °C — richen it or give back some timing.`, (maxEgt - 900) / 80);
  if (knocking.length)
    worst(`Detonation in ${knocking.length} of ${points.length} sampled points even after ${tune.knockRetardMax}° of knock retard. This is how ring lands break.`, 2 + knocking.length / 10);
  if (leanHot.length)
    worst(`${leanHot.length} boosted points are running lean (λ up to ${Math.max(...leanHot.map(p=>p.lambda)).toFixed(2)}). Lean + boost = melted pistons.`, 2.5);
  if (tune.revLimit > e.redline * 1.08)
    worst(`Rev limit is ${Math.round((tune.revLimit/e.redline-1)*100)}% over design. Valve float first, then the rod bolts.`, (tune.revLimit/e.redline - 1) * 18);
  if (maxBoost > (e.boostTarget || 0.5) * 1.6 * mods.clampMul)
    worst(`${maxBoost.toFixed(2)} bar with standard head clamping — head lift and gasket failure become likely. Studs and a thicker gasket buy headroom.`, 2);
  const duty = points.reduce((a,b) => Math.max(a, b.duty), 0);
  if (duty > 0.88)
    worst(`Injectors at ${(duty*100).toFixed(0)}% duty cycle. Past ~85% they stop flowing linearly and the tune goes lean where it matters most.`, (duty - 0.85) * 20);
  if (maxTq > baselineTorque(e) * 1.9 * mods.rotatingStrength)
    worst(`Torque is ${(maxTq / baselineTorque(e)).toFixed(1)}× standard on the standard rotating assembly. Rods and bearings are the limit now.`, 2.2);

  const score = clamp(100 - risks.reduce((s,r) => s + Math.max(0, r.sev) * 9, 0) - damage * 4, 0, 100);
  return { risks: risks.sort((a,b)=>b.sev-a.sev), score, damage,
    verdict: score > 82 ? 'Reliable' : score > 60 ? 'Streetable, watch it' : score > 35 ? 'Fragile — race duty only' : 'Grenade' };
}

/* The standard engine's own simulated peak torque, cached per engine — so
 * "gain over standard" compares like with like instead of against an estimate. */
const _baseline = new Map();
export function baselineTorque(e){
  if (_baseline.has(e.id)) return _baseline.get(e.id);
  const t = defaultTune(e);
  const v = simulate(e, t, emptyMods(), { load:100, skipHealth:true }).tqNm;
  _baseline.set(e.id, v);
  return v;
}
export function baselinePower(e){
  return simulate(e, defaultTune(e), emptyMods(), { load:100, skipHealth:true }).hp;
}

/** Fast single-point torque, used by the live 3D engine + drive sim. */
export function torqueAt(e, tune, mods, rpm, loadPct){
  const r = simulateFast(e, tune, mods, rpm, loadPct);
  return r.tq;
}
export function simulateFast(e, tune, mods, rpm, loadPct){
  const res = simulate(e, tune, mods, { load: loadPct });
  let best = res.points[0];
  for (const p of res.points) if (Math.abs(p.rpm - rpm) < Math.abs(best.rpm - rpm)) best = p;
  return best;
}
