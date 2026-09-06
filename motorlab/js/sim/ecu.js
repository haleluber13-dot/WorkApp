/* MotorLab — ECU model.
 * A tune is a set of calibration tables plus limits, exactly like a real
 * standalone: target lambda and ignition advance over (rpm × load), boost
 * target, cam phasing, rev limit and a torque limiter.
 */

import { FUELS, isBoosted } from '../data/engines.js';

export const LOAD_BINS = [20, 40, 60, 80, 100];          // % engine load

export function rpmBins(e){
  const lo = Math.max(600, Math.round(e.idle/100)*100);
  const hi = e.redline;
  const n = 10, out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((lo + (hi - lo) * (i/(n-1))) / 50) * 50);
  return out;
}

/** Mean-best-torque spark advance (°BTDC) before knock is considered. */
export function mbtTiming(e, rpm, loadPct, boostBar, fuel){
  if (e.fuel === 'diesel') return 0;
  const f = fuel || FUELS[e.fuel] || FUELS.gasoline;
  const load = loadPct / 100;
  const rpmTerm  = 6 + 14 * Math.min(1, rpm / (e.redline * 0.75));   // more time needed as rpm rises
  const loadTerm = 16 * (1 - load);                                   // light load burns slowly -> more advance
  const boostTerm = 9 * Math.max(0, boostBar);                        // dense charge burns fast -> less advance
  const crTerm    = 1.6 * (e.cr - 10);                                // high CR needs less
  /* slow-burning fuels (nitromethane above all) need far more advance */
  return clamp(rpmTerm + loadTerm + 12 - boostTerm - crTerm + (f.flameAdv || 0), 2, 70);
}

/** Lambda the factory would target: rich under load for cooling, stoich on cruise. */
export function stockLambda(e, rpm, loadPct){
  if (e.fuel === 'diesel') return 1.72 - 0.57 * (loadPct/100);   // smoke-limited at full load
  if (e.fuel === 'nitro')  return 0.42;
  const boosted = isBoosted(e);
  if (loadPct <= 40) return 1.00;
  if (loadPct <= 60) return boosted ? 0.97 : 1.00;
  if (loadPct <= 80) return boosted ? 0.88 : 0.93;
  const hi = boosted ? (e.class === 'race' ? 0.80 : 0.82) : 0.88;
  return e.kind === 'rotary' ? 0.77 : hi;
}

export function defaultTune(e){
  const rb = rpmBins(e);
  const lambda = rb.map(r => LOAD_BINS.map(l => stockLambda(e, r, l)));
  const nativeFuel = FUELS[defaultFuelFor(e)];
  const timing = rb.map(r => LOAD_BINS.map(l => round1(mbtTiming(e, r, l, l >= 80 ? (e.boostTarget || 0) : 0, nativeFuel) - safetyMargin(e, l))));
  return {
    rpmBins: rb,
    lambda, timing,
    boostTarget: e.boostTarget || 0,
    boostByRpm: null,                       // optional per-rpm boost curve
    revLimit: e.redline,
    tqLimitNm: 0,                           // 0 = no ECU torque limiter
    camAdvance: 0,                          // ° crank, + = advance intake cam
    fuel: defaultFuelFor(e),
    injectorScale: 1,
    launchRpm: Math.round(e.redline * 0.45),
    knockRetardMax: 8,
    antilag: !!e.antilag,
    notes: '',
  };
}
function defaultFuelFor(e){
  if (e.fuel === 'diesel') return 'diesel';
  if (e.fuel === 'nitro')  return 'nitro';
  if (e.class === 'race')  return 'race';
  if (e.fuel === 'premium') return 'premium';
  return 'gasoline';
}
function safetyMargin(e, loadPct){
  if (e.fuel === 'diesel') return 0;
  const boosted = isBoosted(e);
  if (loadPct >= 100) return boosted ? 5 : 3;
  if (loadPct >= 80)  return boosted ? 4 : 2;
  return 1;
}

/* bilinear-ish lookup with linear interpolation on rpm, nearest-with-blend on load */
export function lookup(table, rpmBinsArr, rpm, loadPct){
  const r = interpIndex(rpmBinsArr, rpm);
  const l = interpIndex(LOAD_BINS, loadPct);
  const v00 = table[r.i][l.i], v01 = table[r.i][l.j];
  const v10 = table[r.j][l.i], v11 = table[r.j][l.j];
  const a = v00 + (v01 - v00) * l.t;
  const b = v10 + (v11 - v10) * l.t;
  return a + (b - a) * r.t;
}
function interpIndex(bins, v){
  if (v <= bins[0]) return { i:0, j:0, t:0 };
  if (v >= bins[bins.length-1]) { const k = bins.length-1; return { i:k, j:k, t:0 }; }
  let i = 0; while (i < bins.length-2 && bins[i+1] < v) i++;
  const t = (v - bins[i]) / (bins[i+1] - bins[i]);
  return { i, j:i+1, t };
}

export function fuelProps(tune){ return FUELS[tune.fuel] || FUELS.gasoline; }

/** Rough per-cell audit used by the tuning panel to flag dangerous cells. */
export function auditTune(e, tune, ctx = {}){
  const issues = [];
  const rb = tune.rpmBins;
  const f = fuelProps(tune);
  const boost = tune.boostTarget || 0;
  rb.forEach((rpm, i) => {
    LOAD_BINS.forEach((load, j) => {
      const lam = tune.lambda[i][j], adv = tune.timing[i][j];
      const b = load >= 80 ? boost : boost * (load/100) * 0.5;
      const mbt = mbtTiming(e, rpm, load, b, f);
      const need = requiredOctane(e, b, lam, adv, mbt, ctx.iat ?? 35, f);
      if (e.fuel !== 'diesel' && need > f.octane + 1)
        issues.push({ rpm, load, kind:'knock', sev: need - f.octane,
          msg:`${rpm} rpm / ${load}% load needs ~${need.toFixed(0)} octane; ${f.name} is ${f.octane}. Pull ${Math.ceil((need-f.octane)/1.6)}° or richen it.` });
      if (load >= 80 && lam > (isBoosted(e) ? 0.92 : 1.02))
        issues.push({ rpm, load, kind:'lean', sev:(lam - 0.9)*10,
          msg:`Lambda ${lam.toFixed(2)} at ${rpm} rpm / ${load}% load is lean for full load — melted pistons start here.` });
      if (adv > mbt + 2)
        issues.push({ rpm, load, kind:'overadvance', sev:(adv-mbt)/2,
          msg:`${adv.toFixed(0)}° at ${rpm} rpm / ${load}% is past MBT (${mbt.toFixed(0)}°) — extra advance past MBT only makes heat and knock.` });
    });
  });
  if (tune.revLimit > e.redline * 1.12)
    issues.push({ kind:'revlimit', sev:3, msg:`Rev limit ${tune.revLimit} rpm is ${Math.round((tune.revLimit/e.redline-1)*100)}% over the design redline — valve float and rod-bolt failure territory.` });
  if (boost > (e.boostTarget || 0) * 1.9 && boost > 0)
    issues.push({ kind:'boost', sev:3, msg:`${boost.toFixed(2)} bar is well beyond the standard ${(e.boostTarget||0).toFixed(2)} bar. Check head clamping, fuelling and turbo compressor range.` });
  return issues.sort((a,b) => b.sev - a.sev);
}

/** Octane number this operating point demands. */
export function requiredOctane(e, boostBar, lambda, advance, mbt, iatC, fuel){
  const base      = 70 + 5.4 * (e.cr - 8);
  const boostTerm = 14 * Math.max(0, boostBar);
  const iatTerm   = 0.32 * (iatC - 25);
  const advTerm   = 1.5 * (advance - mbt);
  const mixTerm   = Math.max(0, 16 * (lambda - 0.85));   // rich mixture resists knock
  const rotary    = e.kind === 'rotary' ? 5 : 0;         // long thin chamber, travelling flame
  const di        = (e.injection === 'direct' || e.injection === 'common-rail') ? 6 : 0;
  const jet       = e.preChamber ? 26 : 0;   // pre-chamber jet ignition burns before it can knock
  const chill     = fuel ? 60 * ((fuel.coolFuel || 1) - 1) : 0;  // alcohols cool the charge
  return base + boostTerm + iatTerm + advTerm + mixTerm + rotary - di - chill - jet;
}

export const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const round1 = (v) => Math.round(v * 10) / 10;

export function cloneTune(t){ return JSON.parse(JSON.stringify(t)); }

/* ---------------------------------------------------------------------- */
/** Rebuild the fuel and spark tables for the current fuel, boost and mods.
 *  This is what a tuner does on the dyno: find MBT, back off for knock, and
 *  richen where cylinder pressure and exhaust temperature demand it. */
export function autoTune(e, tune, mods = {}, opts = {}){
  const aggression = opts.aggression ?? 0.5;          // 0 = safe street, 1 = one-run race map
  const f = fuelProps(tune);
  const t = cloneTune(tune);
  const boost = t.boostTarget || 0;
  const iatOf = opts.iatOf || (() => 35);
  t.rpmBins.forEach((rpm, i) => {
    LOAD_BINS.forEach((load, j) => {
      const b = load >= 80 ? boost : boost * Math.pow(load/100, 1.6);
      const iat = iatOf(b);
      /* target lambda: richer as load, boost and rpm climb; alcohol wants richer still */
      let lam = stockLambda(e, rpm, load);
      const floor = f.lambdaFloor ?? (e.kind === 'rotary' ? 0.72 : 0.76);
      if (e.fuel !== 'diesel'){
        const richen = (load/100) * (0.012 + boost * 0.018) * (1 - aggression * 0.5);
        lam = clamp(lam - richen, floor, 1.02);
      } else {
        lam = clamp(lam, floor, 2.2);
      }
      t.lambda[i][j] = Math.round(lam * 100) / 100;

      const mbt = mbtTiming(e, rpm, load, b, f);
      let adv = mbt;
      for (let k = 0; k < 90; k++){
        if (requiredOctane(e, b, lam, adv, mbt, iat, f) <= f.octane - (1 - aggression) * 2) break;
        adv -= 0.5;
      }
      t.timing[i][j] = Math.round(Math.min(adv, mbt) * 10) / 10;
    });
  });
  t.notes = `Auto-tuned for ${f.name} at ${boost.toFixed(2)} bar, ${aggression >= 0.75 ? 'race' : aggression >= 0.4 ? 'street/track' : 'conservative'} margin.`;
  return t;
}
