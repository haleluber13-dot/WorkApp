/* Dyno & track — measure what the build actually does. */
import { h, section, kv, note, para, chip, btn, toast, select, field, lineChart, bar, add } from '../ui.js';
import { state, engine, vehicle, tune, fitted, save, U } from '../store.js';
import { displacementL } from '../data/engines.js';
import { dynoRun, accelerationRun, lapTime, TRACKS, vehicleMass, gripCoef } from '../sim/dyno.js';
import { simulate, emptyMods, baselineTorque } from '../sim/engineSim.js';
import { applyUpgrades } from '../data/upgrades.js';
import { addXp, unlock, evaluateChallenges } from '../game.js';
import { defaultTune } from '../sim/ecu.js';

let lastRun = null, baseline = null;

function mods(){ return applyUpgrades(emptyMods(), fitted()); }

export function render(ctx, tab){
  const e = engine(), v = vehicle(), t = tune(), m = mods();
  const wrap = h('div');
  if (tab === 'accel') return renderAccel(ctx, wrap);
  if (tab === 'track') return renderTrack(ctx, wrap);

  const run = dynoRun(e, t, m, v);
  const chart = h('canvas', { class:'chart', style:{ height:'250px' } });
  requestAnimationFrame(() => {
    const series = [
      { name:'Power (crank)', colour:'#ff7a1a', points:run.points.map(p => [p.rpm, U.power(p.hp).v]) },
      { name:'Torque', colour:'#22d3ee', axis:2, points:run.points.map(p => [p.rpm, U.torque(p.tq).v]) },
      { name:'Wheel power', colour:'#8a6d4a', dash:[4,3], points:run.points.map(p => [p.rpm, U.power(p.whp).v]) },
    ];
    if (baseline && baseline.engineId === e.id)
      series.push({ name:'Baseline', colour:'#5a6b86', dash:[2,3], points:baseline.points });
    lineChart(chart, { series, xLabel:'rpm',
      markers:[{ x:run.hpRpm, label:`${Math.round(U.power(run.hp).v)} ${U.power(run.hp).u}` }] });
  });

  const p = U.power(run.hp), tq = U.torque(run.tqNm);
  add(wrap,
    chart,
    h('div', { class:'btnrow', style:{ margin:'10px 0' } },
      btn('Run a pull', { class:'btn--pri', onClick:() => doPull(ctx) }),
      btn('Set as baseline', { onClick:() => {
        baseline = { engineId:e.id, points:run.points.map(x => [x.rpm, U.power(x.hp).v]) };
        toast('Baseline stored — the next pull overlays on it.'); ctx.refresh(); } }),
      baseline ? btn('Clear', { onClick:() => { baseline = null; ctx.refresh(); } }) : null),

    section('Results',
      kv('Peak power', `${p.v.toFixed(0)} ${p.u} @ ${run.hpRpm} rpm`),
      kv('At the wheels', `${U.power(run.whp).v.toFixed(0)} ${p.u}`),
      kv('Peak torque', `${tq.v.toFixed(0)} ${tq.u} @ ${run.tqRpm} rpm`),
      kv('Specific output', `${(run.hp/displacementL(e)).toFixed(0)} hp/L`),
      kv('Power to weight', `${(run.hp/(vehicleMass(v, m)/1000)).toFixed(0)} hp/tonne`),
      kv('Drivetrain loss', `${run.driveLossPct.toFixed(0)} %`),
      kv('Peak BMEP', `${Math.max(...run.points.map(x => x.bmep)).toFixed(1)} bar`),
      kv('Peak boost', U.fmt(U.pressure(Math.max(...run.points.map(x => x.boost))), 2)),
      kv('Peak airflow', `${Math.max(...run.points.map(x => x.airKgH)).toFixed(0)} kg/h`),
      kv('Gain over standard', `${((run.tqNm / baselineTorque(e) - 1) * 100).toFixed(0)} %`)),

    section('Conditions',
      kv('Ambient', U.fmt(U.temp(state.settings.ambientC))),
      kv('Charge temp at peak', U.fmt(U.temp(Math.max(...run.points.map(x => x.iat))))),
      kv('Peak EGT', U.fmt(U.temp(Math.max(...run.points.map(x => x.egt))))),
      kv('Fuel', run.fuel.name),
      run.points.some(x => x.capped) ? note(`Something is limiting this run: <b>${run.points.find(x => x.capped).capped}</b>. Until you address that, more boost will not give you more power.`, 'warn') : null),

    section('Engine health',
      bar(run.health.score/100, run.health.score > 75 ? 'ok' : run.health.score > 45 ? '' : 'bad'),
      kv('Score', `${run.health.score.toFixed(0)} / 100 — ${run.health.verdict}`),
      ...run.health.risks.slice(0, 4).map(r => note(r.msg, r.sev > 2 ? 'bad' : 'warn'))),
  );
  return wrap;
}

function doPull(ctx){
  const e = engine(), v = vehicle(), t = tune(), m = mods();
  const run = dynoRun(e, t, m, v);
  lastRun = run;
  state.game.dynoRuns = (state.game.dynoRuns || 0) + 1; save();
  unlock('first-dyno');
  addXp(20, 'Dyno pull');
  if (run.hp >= 500) unlock('500hp');
  if (run.hp >= 1000) unlock('1000hp');
  if (run.health.score < 20) unlock('grenade');
  /* let it actually sweep up to the power peak and settle back */
  const e2 = engine();
  if (ctx.viewport.state.rpm < 40) ctx.viewport.startEngine(e2.idle, { redline:e2.redline, spoolRpm:e2.spoolRpm || 2200 });
  setTimeout(() => ctx.viewport.revTo(run.hpRpm), 900);
  ctx.viewport.state.boost = Math.max(...run.points.map(p => p.boost));
  setTimeout(() => ctx.viewport.revTo(e2.idle), 4200);
  runChallengeCheck(ctx, run);
  toast(`${Math.round(U.power(run.hp).v)} ${U.power(run.hp).u} — ${run.health.verdict.toLowerCase()}.`,
        run.health.score > 60 ? 'good' : 'bad');
  ctx.refresh();
}

function runChallengeCheck(ctx, run){
  const e = engine(), v = vehicle(), t = tune(), m = mods();
  const acc = accelerationRun(e, t, m, v);
  const lap = lapTime(e, t, m, v, TRACKS[1]);
  const done = evaluateChallenges({
    hp: run.hp, specific: run.hp/displacementL(e), health: run.health.score,
    knockPoints: run.points.filter(p => p.knock > 0).length, octane: run.fuel.octane,
    quarter: acc.marks.q || 0, zeroTo100: acc.marks.kph100 || 0, lap: lap.seconds,
    spend: m.cost || 0, powerRatio: run.tqNm / baselineTorque(e),
    isRotary: e.kind === 'rotary',
  });
  for (const c of done) toast(`Challenge complete: ${c.name} (+$${c.reward})`, 'good');
  if (lap.seconds < 100) unlock('lap-record');
}

/* ---- acceleration ----------------------------------------------------- */
function renderAccel(ctx, wrap){
  const e = engine(), v = vehicle(), t = tune(), m = mods();
  const run = accelerationRun(e, t, m, v);
  const chart = h('canvas', { class:'chart', style:{ height:'210px' } });
  requestAnimationFrame(() => lineChart(chart, { xLabel:'seconds', series:[
    { name:U.speed(0).u, colour:'#ff7a1a', points:run.trace.map(p => [p.t, U.speed(p.v).v]) },
    { name:'g', colour:'#3ddc84', axis:2, points:run.trace.map(p => [p.t, p.a]) },
  ]}));
  const s = (x) => x ? x.toFixed(2) + ' s' : '—';
  add(wrap,
    para(`Standing-start run for the ${vehicle().name.toLowerCase()} with this engine, gearing, mass, tyres and aero. Shift time is modelled, and the launch is traction-limited.`),
    chart,
    section('Times',
      kv('0–100 km/h', s(run.marks.kph100)),
      kv('0–60 mph', s(run.marks.mph60)),
      kv('0–200 km/h', s(run.marks.kph200)),
      kv('1/8 mile', s(run.marks.eighth)),
      kv('1/4 mile', s(run.marks.q) + (run.marks.qSpeed ? ` @ ${U.fmt(U.speed(run.marks.qSpeed))}` : '')),
      kv('Top speed', U.fmt(U.speed(run.vmaxKph)))),
    section('Why it is that number',
      kv('Mass', `${run.mass.toFixed(0)} kg`),
      kv('Power to weight', `${run.powerToWeight.toFixed(0)} hp/tonne`),
      kv('Grip coefficient', gripCoef(v, m).toFixed(2)),
      kv('Drive layout', v.drivetrain),
      kv('Gears', String(run.gearCount)),
      kv('Wheelspin time', run.launchSlip.toFixed(2) + ' s'),
      run.launchSlip > 0.8 ? note('The launch is traction-limited for a long time — more power will not help here. Grip, weight distribution or a different launch rpm will.', 'warn')
                           : note('The launch is close to traction-limited, which is roughly where you want it.')),
    h('div', { class:'btnrow' }, btn('Send it', { class:'btn--pri', onClick:() => {
      const ev = engine();
      if (ctx.viewport.state.rpm < 40) ctx.viewport.startEngine(ev.idle, { redline:ev.redline });
      ctx.viewport.setAttitude(1);                     // squat on the launch
      ctx.viewport.state.speed = 14;
      setTimeout(() => ctx.viewport.revTo(ev.redline * 0.86), 700);
      setTimeout(() => ctx.viewport.setAttitude(-0.7), 2900);   // and dive when it stops
      setTimeout(() => { ctx.viewport.state.speed = 0; ctx.viewport.revTo(ev.idle); }, 3600);
      runChallengeCheck(ctx, dynoRun(e, t, m, v));
      toast(`${s(run.marks.kph100)} to 100 km/h, ${s(run.marks.q)} over the quarter.`, 'good');
    } })),
  );
  return wrap;
}

/* ---- track ------------------------------------------------------------ */
function renderTrack(ctx, wrap){
  const e = engine(), v = vehicle(), t = tune(), m = mods();
  const trackId = state.ui.trackId ||= (v.class === 'kart' ? 'kart' : 'gp');
  const track = TRACKS.find(x => x.id === trackId) || TRACKS[1];
  const lap = lapTime(e, t, m, v, track);
  add(wrap,
    para('A lap-time estimate: corner speeds solved from grip, mass and downforce, then acceleration and braking integrated down each straight. It is a model, not a lap of a real circuit — but it responds correctly to every change you make.'),
    field('Circuit', select(TRACKS.map(x => ({ value:x.id, label:`${x.name} — ${(x.lengthM/1000).toFixed(1)} km` })), trackId,
      (id) => { state.ui.trackId = id; save(); ctx.refresh(); })),
    section('Estimated lap',
      kv('Lap time', `${Math.floor(lap.seconds/60)}:${(lap.seconds%60).toFixed(2).padStart(5,'0')}`),
      kv('Average speed', U.fmt(U.speed(lap.avgKph))),
      kv('Slowest corner', U.fmt(U.speed(Math.min(...lap.cornerV)*3.6))),
      kv('Fastest corner', U.fmt(U.speed(Math.max(...lap.cornerV)*3.6))),
      kv('Grip coefficient', gripCoef(v, m).toFixed(2)),
      kv('Peak downforce', `${(v.downforceKg + (m.downforceBonus||0)).toFixed(0)} kg`),
      kv('Mass', `${vehicleMass(v, m).toFixed(0)} kg`)),
    section('Corner-by-corner', ...track.corners.map((r, i) =>
      kv(`Turn ${i+1} — ${r} m radius`, U.fmt(U.speed(lap.cornerV[i]*3.6))))),
    note('Notice what changes the lap and what does not: on a tight circuit, grip and mass dominate and peak power barely registers. On the superspeedway it is the opposite.'),
    h('div', { class:'btnrow' }, btn('Log this lap', { class:'btn--pri', onClick:() => {
      addXp(25, 'Lap completed');
      runChallengeCheck(ctx, dynoRun(e, t, m, v));
      toast(`Lap logged: ${lap.seconds.toFixed(2)} s.`, 'good');
      ctx.refresh();
    } })),
  );
  return wrap;
}

export default {
  id:'dyno', name:'Dyno & Track', short:'Dyno', icon:'📈', model:'vehicle',
  tabs:() => [{ id:'dyno', name:'Dyno' }, { id:'accel', name:'Acceleration' }, { id:'track', name:'Lap time' }],
  render,
  hud:() => ({ title:`${vehicle().name}`, sub:`${engine().name}` }),
  gauges:() => {
    const run = dynoRun(engine(), tune(), mods(), vehicle());
    return [
      { label:'Power', value:`${Math.round(U.power(run.hp).v)} ${U.power(run.hp).u}` },
      { label:'Wheel', value:`${Math.round(U.power(run.whp).v)}` },
      { label:'Health', value:run.health.score.toFixed(0), kind: run.health.score > 70 ? 'ok' : run.health.score > 40 ? 'warn' : 'bad' },
    ];
  },
};
