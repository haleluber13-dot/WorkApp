/* Garage — pick the machine and the engine that goes in it. */
import { h, section, kv, note, para, chip, btn, toast, select, field, lineChart, add } from '../ui.js';
import { state, engine, vehicle, save, invalidateTrees, U } from '../store.js';
import { ENGINES, ENGINE_BY_ID, summaryLine, layoutName, aspirationLabel, displacementL,
         firingOrder, firingInterval, pistonSpeed, boreStrokeRatio } from '../data/engines.js';
import { VEHICLES, VEHICLE_BY_ID, vehicleGroups, weightDistribution, wheelRadius } from '../data/vehicles.js';
import { simulate, emptyMods } from '../sim/engineSim.js';
import { defaultTune } from '../sim/ecu.js';
import { applyUpgrades } from '../data/upgrades.js';
import { liveriesFor, setLivery } from '../build/scannedVehicle.js';

export function render(ctx, tab){
  const wrap = h('div');
  const v = vehicle(), e = engine();
  if (tab === 'engines') return renderEngines(ctx, wrap);
  if (tab === 'compare') return renderCompare(ctx, wrap);

  const groups = vehicleGroups();
  add(wrap,
    para('Choose what you are working on. The 3D model, the part list, the wiring, the tuning tables and the dyno all follow this choice.'),
    field('Vehicle', select([
      { group:'Cars & trucks', items:groups.car.map(x => ({ value:x.id, label:x.name })) },
      { group:'Motorcycles',   items:groups.bike.map(x => ({ value:x.id, label:x.name })) },
      { group:'Karts',         items:groups.kart.map(x => ({ value:x.id, label:x.name })) },
    ], v.id, (id) => {
      state.vehicleId = id;
      const nv = VEHICLE_BY_ID[id];
      if (nv.engines?.length && !nv.engines.includes(state.engineId)) state.engineId = nv.engines[0];
      invalidateTrees(); save(); ctx.reloadModel(); ctx.refresh();
      toast(`${nv.name} on the ramp.`);
    })),
    field('Engine', select(engineOptions(v), e.id, (id) => {
      state.engineId = id; invalidateTrees(); save(); ctx.reloadModel(); ctx.refresh();
      toast(`${ENGINE_BY_ID[id].name} selected.`);
    })),
  );

  const t = defaultTune(e);
  const res = simulate(e, state.tunes[e.id] || t, applyUpgrades(emptyMods(), state.fitted[e.id] || []));
  const p = U.power(res.hp), tq = U.torque(res.tqNm);

  add(wrap,
    v.model && liveriesFor(v.model).length ? field('Livery', select(
      liveriesFor(v.model).map(l => ({ value:l.id, label:l.name })),
      (state.ui.liveries ||= {})[v.model] || liveriesFor(v.model)[0].id,
      async (id) => {
        (state.ui.liveries ||= {})[v.model] = id; save();
        const ok = await setLivery(v.model, id);
        toast(ok ? 'Livery changed.' : 'That livery could not be loaded.', ok ? 'good' : 'bad');
      })) : null,

    section('The machine',
      para(v.blurb),
      kv('Class', v.class === 'bike' ? 'Motorcycle' : v.class === 'kart' ? 'Kart' : 'Car / truck'),
      kv('Chassis', v.chassis),
      kv('Drivetrain', v.drivetrain + (v.bay ? ` · ${v.bay}` : '')),
      kv('Mass', `${v.massKg} kg`),
      kv('Wheelbase', `${v.wheelbase} mm`),
      v.trackF ? kv('Track F/R', `${v.trackF} / ${v.trackR} mm`) : null,
      kv('Front weight', `${Math.round(weightDistribution(v)*100)}%`),
      kv('Suspension', `${v.suspF} / ${v.suspR}`),
      kv('Brakes', `${v.brakeF} / ${v.brakeR} mm`),
      kv('Tyres', `${v.tyreF}/${v.rimF}"  ·  ${v.tyreR}/${v.rimR}"`),
      kv('Cd × A', `${v.cd.toFixed(2)} × ${v.area.toFixed(2)} m²`),
      v.downforceKg ? kv('Peak downforce', `${v.downforceKg} kg`) : null,
      kv('Fuel', `${v.fuelL} L`)),

    section('The engine',
      para(e.blurb),
      kv('Configuration', layoutName(e)),
      kv('Capacity', `${displacementL(e).toFixed(e.displacement < 1000 ? 3 : 1)} L`),
      e.kind === 'rotary' ? kv('Chamber', `${e.chamberCc} cc × ${e.cyl} rotors`)
                          : kv('Bore × stroke', `${e.bore} × ${e.stroke} mm  (${boreStrokeRatio(e).toFixed(2)} ratio)`),
      kv('Compression', `${e.cr}:1`),
      kv('Induction', aspirationLabel(e) + (e.boostTarget ? ` · ${U.fmt(U.pressure(e.boostTarget), 2)}` : '')),
      kv('Valvetrain', e.kind === 'rotary' ? 'ports, no valves' : `${e.cam}, ${e.valvesPerCyl}v/cyl`),
      kv('Fuel & injection', `${e.fuel} · ${e.injection}`),
      kv('Redline', `${e.redline} rpm`),
      kv('Firing order', firingOrder(e).join('-')),
      kv('Firing interval', `${firingInterval(e).toFixed(0)}° crank`),
      e.kind !== 'rotary' ? kv('Piston speed at redline', `${pistonSpeed(e, e.redline).toFixed(1)} m/s`) : null,
      kv('Dry weight', `${e.dryWeight} kg`)),

    section('Simulated output',
      kv('Peak power', `${p.v.toFixed(0)} ${p.u} @ ${res.hpRpm} rpm`),
      kv('Peak torque', `${tq.v.toFixed(0)} ${tq.u} @ ${res.tqRpm} rpm`),
      kv('Specific output', `${(res.hp/displacementL(e)).toFixed(0)} hp/L`),
      kv('Power to weight', `${(res.hp/(v.massKg/1000)).toFixed(0)} hp/tonne`),
      kv('Health', `${res.health.score.toFixed(0)} / 100 — ${res.health.verdict}`),
      note('These figures come from the simulator, not a spec sheet: displacement, breathing, pressure ratio, mixture, timing and friction. Change any of them and this changes.')),

    h('div', { class:'btnrow' },
      btn('Open the engine bay', { class:'btn--pri', onClick:() => ctx.goto('engine') }),
      btn('Build the chassis', { onClick:() => ctx.goto('chassis') }),
      btn('Run the dyno', { onClick:() => ctx.goto('dyno') })),
  );
  return wrap;
}

function engineOptions(v){
  const fits = new Set(v.engines || []);
  const suits = ENGINES.filter(e => fits.has(e.id));
  const others = ENGINES.filter(e => !fits.has(e.id));
  return [
    { group:`Factory options for the ${v.name.toLowerCase()}`, items:suits.map(e => ({ value:e.id, label:`${e.name}` })) },
    { group:'Engine swap — anything in the catalog', items:others.map(e => ({ value:e.id, label:`${e.name}  (${e.class})` })) },
  ];
}

function renderEngines(ctx, wrap){
  const groups = { car:'Cars & trucks', race:'Race engines', bike:'Motorcycle engines' };
  add(wrap, para('Every engine in the catalog. Selecting one rebuilds its 3D model, its part tree, its torque specs and its tuning tables from the specification.'));
  for (const [cls, title] of Object.entries(groups)){
    const list = ENGINES.filter(e => e.class === cls);
    if (!list.length) continue;
    add(wrap, h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:title }), chip(String(list.length))),
      ...list.map(e => h('div', { class:'card' + (e.id === state.engineId ? ' on' : ''),
        style:{ cursor:'pointer' },
        onclick:() => { state.engineId = e.id; invalidateTrees(); save(); ctx.reloadModel(); ctx.refresh(); toast(e.name + ' loaded.'); } },
        h('div', { class:'card__h' },
          h('div', null, h('div', { class:'card__brand', text:e.maker }), h('div', { class:'card__t', text:e.name })),
          e.added ? chip('new','acc') : null),
        h('div', { class:'tiny mono muted', style:{ marginBottom:'4px' }, text:summaryLine(e) }),
        h('div', { class:'card__b', text:e.blurb })))));
  }
  return wrap;
}

function renderCompare(ctx, wrap){
  const picks = state.ui.compare ||= [state.engineId, 'v8-50-ohv'];
  const colours = ['#ff7a1a', '#22d3ee', '#3ddc84'];
  const canvas = h('canvas', { class:'chart', style:{ height:'230px' } });
  add(wrap, para('Put any engines side by side on the same axes. This is the fastest way to see what layout, capacity and boost actually do to the shape of a curve.'));
  for (let i = 0; i < 3; i++){
    add(wrap, field(`Curve ${i+1}`, select(
      [{ value:'', label:'— none —' }, ...ENGINES.map(e => ({ value:e.id, label:e.name }))],
      picks[i] || '', (id) => { picks[i] = id; state.ui.compare = picks; save(); ctx.refresh(); })));
  }
  add(wrap, canvas);
  const rows = h('div', { class:'sec' });
  requestAnimationFrame(() => {
    const series = [];
    picks.forEach((id, i) => {
      const e = ENGINE_BY_ID[id]; if (!e) return;
      const r = simulate(e, defaultTune(e), emptyMods());
      series.push({ name:e.name.slice(0, 22), colour:colours[i], points:r.points.map(p => [p.rpm, p.hp]) });
      add(rows, kv(e.name, `${Math.round(r.hp)} hp @ ${r.hpRpm} · ${Math.round(r.tqNm)} Nm @ ${r.tqRpm}`));
    });
    if (series.length) lineChart(canvas, { series, xLabel:'rpm' });
  });
  add(wrap, rows);
  return wrap;
}

export default {
  id:'garage', name:'Garage', icon:'🏠', model:'vehicle',
  tabs:() => [{ id:'project', name:'Project' }, { id:'engines', name:'Engine catalog' }, { id:'compare', name:'Compare' }],
  render,
  hud:() => ({ title: vehicle().name, sub: engine().name }),
};
