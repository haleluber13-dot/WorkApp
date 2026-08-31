/* Garage — pick the machine and the engine that goes in it.
 *
 * You pick by looking. A dropdown of forty names tells you nothing about what
 * a car is; a wall of photographs with the three numbers that matter under
 * each one tells you almost everything, and the specification is a click away
 * on the Project tab for when it does not.
 */
import { h, section, kv, note, para, chip, btn, toast, select, field, lineChart, add } from '../ui.js';
import { state, engine, vehicle, save, invalidateTrees, U } from '../store.js';
import { ENGINES, ENGINE_BY_ID, summaryLine, layoutName, aspirationLabel, displacementL,
         firingOrder, firingInterval, pistonSpeed, boreStrokeRatio } from '../data/engines.js';
import { VEHICLES, VEHICLE_BY_ID, weightDistribution } from '../data/vehicles.js';
import { simulate, emptyMods } from '../sim/engineSim.js';
import { defaultTune } from '../sim/ecu.js';
import { applyUpgrades } from '../data/upgrades.js';
import { liveriesFor, setLivery } from '../build/scannedVehicle.js';
import { hasBundled, rawModelFor, preferGenerated } from '../lib/importModel.js';
import { photo } from '../lib/photo.js';

/* ---------------------------------------------------------------------- */
/* the picture wall                                                        */

const VEHICLE_FILTERS = [
  { id:'all',   name:'Everything', test:() => true },
  { id:'car',   name:'Cars',       test:(v) => v.class === 'car' && !RACE.has(v.id) },
  { id:'race',  name:'Race',       test:(v) => RACE.has(v.id) },
  { id:'bike',  name:'Bikes',      test:(v) => v.class === 'bike' },
  { id:'kart',  name:'Karts',      test:(v) => v.class === 'kart' },
  { id:'real',  name:'3D scanned', test:(v) => hasBundled('veh', v.id) },
];
const RACE = new Set(['formula','dragster','stockcar','nns','awd-rally','drift','semi','kart']);

const ENGINE_FILTERS = [
  { id:'all',  name:'Everything', test:() => true },
  { id:'car',  name:'Car',        test:(e) => e.class === 'car' },
  { id:'race', name:'Race',       test:(e) => e.class === 'race' },
  { id:'bike', name:'Motorcycle', test:(e) => e.class === 'bike' },
  { id:'real', name:'3D scanned', test:(e) => hasBundled('eng', e.id) },
];

const matches = (text, q) => !q || String(text).toLowerCase().includes(q);

/** One clickable photo card. */
function pickCard({ kind, id, name, maker, line, specs, on, onPick }){
  const card = h('button', { class:'pick' + (on ? ' pick--on' : ''), type:'button',
                             onclick:onPick, title:name });
  card.appendChild(photo(kind, id, name));
  if (hasBundled(kind, id)) card.appendChild(h('span', { class:'pick__tag', text:'3D scan' }));
  add(card,
    h('span', { class:'pick__maker', text: maker || '' }),
    h('span', { class:'pick__name', text: name }),
    h('span', { class:'pick__line', text: line }),
    h('span', { class:'pick__specs' }, ...specs.flatMap((s, i) => [
      i ? h('i', { class:'pick__dot', text:'·' }) : null,
      h('span', null, h('b', { text:s[0] }), ' ' + s[1]),
    ]).filter(Boolean)));
  return card;
}

/** Search box plus filter chips, wired to one piece of UI state. */
function wall({ ctx, keyName, filters, items, render }){
  const ui = state.ui[keyName] ||= { q:'', filter:'all' };
  const grid = h('div', { class:'pickgrid' });

  const paint = () => {
    const f = filters.find(x => x.id === ui.filter) || filters[0];
    const q = ui.q.trim().toLowerCase();
    const list = items.filter(x => f.test(x) &&
      (matches(x.name, q) || matches(x.maker, q) || matches(x.id, q) || matches(x.blurb, q)));
    grid.textContent = '';
    if (!list.length){
      grid.appendChild(h('div', { class:'muted', text:'Nothing matches that.' }));
      return;
    }
    for (const x of list) grid.appendChild(render(x));
  };

  const search = h('input', { class:'search', type:'search', value:ui.q,
    placeholder:'Search by name, marque or anything in the description',
    oninput:(e) => { ui.q = e.target.value; save(); paint(); } });

  const chips = h('div', { class:'chiprow' }, ...filters.map(f =>
    h('button', { class:'fchip' + (f.id === ui.filter ? ' fchip--on' : ''), type:'button',
      text:f.name, onclick:(e) => {
        ui.filter = f.id; save();
        e.currentTarget.parentNode.querySelectorAll('.fchip')
          .forEach(b => b.classList.toggle('fchip--on', b.textContent === f.name));
        paint();
      } })));

  paint();
  return h('div', null, h('div', { class:'wallbar' }, search, chips), grid);
}

/* The offline single file carries only the machines it has a real model for —
 * a catalogue of photographs is worth nothing if half the photographs are of
 * shapes derived from a specification. The hosted app shows everything,
 * because there a model is one fetch away. */
const scansOnly = () => !!globalThis.__MOTORLAB_SCANS_ONLY;
const shown = (items, kind) =>
  scansOnly() ? items.filter(x => hasBundled(kind, x.id)) : items;

function renderVehicles(ctx, wrap){
  add(wrap, para(scansOnly()
    ? 'Every machine in this copy is a real 3D scan, photographed in three dimensions and credited in assets/models/CREDITS.md. The picture on each card is a render of that model.'
    : 'Every machine in the catalogue. The picture is a render of the model the app will actually build, so what you see is what you get on the ramp.'));
  add(wrap, wall({
    ctx, keyName:'vehWall', filters:VEHICLE_FILTERS, items:shown(VEHICLES, 'veh'),
    render:(v) => pickCard({
      kind:'veh', id:v.id, name:v.name, maker:v.maker || labelFor(v),
      line:`${v.drivetrain} · ${v.chassis}`,
      specs:[[String(v.massKg), 'kg'], [String(v.lengthMm), 'mm long'], [String(v.wheelbase), 'mm wb']],
      on:v.id === state.vehicleId,
      onPick:() => choose(ctx, 'veh', v.id),
    }),
  }));
  return wrap;
}

function renderEngines(ctx, wrap){
  add(wrap, para(scansOnly()
    ? 'Every engine in this copy is a real 3D scan. Choosing one rebuilds its part tree, its torque specs and its tuning tables from the specification — take the scan off and the teachable engine is underneath it.'
    : 'Every engine in the catalogue. Choosing one rebuilds its 3D model, its part tree, its torque specs and its tuning tables from the specification.'));
  add(wrap, wall({
    ctx, keyName:'engWall', filters:ENGINE_FILTERS, items:shown(ENGINES, 'eng'),
    render:(e) => pickCard({
      kind:'eng', id:e.id, name:e.name, maker:e.maker,
      line:summaryLine(e),
      specs:[[displacementL(e).toFixed(e.displacement < 1000 ? 2 : 1), 'L'],
             [String(e.redline), 'rpm'], [String(e.dryWeight), 'kg']],
      on:e.id === state.engineId,
      onPick:() => choose(ctx, 'eng', e.id),
    }),
  }));
  return wrap;
}

const labelFor = (v) => v.class === 'bike' ? 'Motorcycle' : v.class === 'kart' ? 'Kart' : 'Car / truck';

function setSource(ctx, kind, id, wantGenerated){
  const bag = (state.ui.generated ||= {});
  if (wantGenerated) bag[`${kind}:${id}`] = true; else delete bag[`${kind}:${id}`];
  globalThis.__MOTORLAB_GENERATED = bag;
  invalidateTrees(); save(); ctx.reloadModel(); ctx.refresh();
  toast(wantGenerated ? 'Showing the generated model.' : 'Showing the 3D scan.');
}

function choose(ctx, kind, id){
  if (kind === 'veh'){
    state.vehicleId = id;
    const nv = VEHICLE_BY_ID[id];
    if (nv.engines?.length && !nv.engines.includes(state.engineId)) state.engineId = nv.engines[0];
    toast(`${nv.name} on the ramp.`);
  } else {
    state.engineId = id;
    toast(`${ENGINE_BY_ID[id].name} selected.`);
  }
  invalidateTrees(); save(); ctx.reloadModel(); ctx.refresh();
}

/* ---------------------------------------------------------------------- */
export function render(ctx, tab){
  const wrap = h('div');
  const v = vehicle(), e = engine();
  if (tab === 'vehicles') return renderVehicles(ctx, wrap);
  if (tab === 'engines') return renderEngines(ctx, wrap);
  if (tab === 'compare') return renderCompare(ctx, wrap);

  /* ---- the project tab: what is on the ramp right now ---- */
  const heads = h('div', { class:'grid2' },
    h('button', { class:'nowcard', type:'button', onclick:() => ctx.setTab('vehicles') },
      photo('veh', v.id, v.name),
      h('span', { class:'nowcard__k', text:'Vehicle' }),
      h('span', { class:'nowcard__n', text:v.name }),
      h('span', { class:'nowcard__c', text:'Change →' })),
    h('button', { class:'nowcard', type:'button', onclick:() => ctx.setTab('engines') },
      photo('eng', e.id, e.name),
      h('span', { class:'nowcard__k', text:'Engine' }),
      h('span', { class:'nowcard__n', text:e.name }),
      h('span', { class:'nowcard__c', text:'Change →' })));
  add(wrap, heads);

  /* Real or generated, per machine. Both are worth having: the scan is what
     the thing looks like, the generated one is what you can take apart. */
  const swap = (kind, id, name) => hasBundled(kind, id) || rawModelFor(kind, id)
    ? h('div', { class:'tglrow' },
        h('label', { text:`Show ${name} as` }),
        h('div', { class:'btnrow', style:{ margin:0, flex:'0 0 auto' } },
          btn('3D scan', { class: preferGenerated(kind, id) ? '' : 'btn--pri btn--sm',
            onClick:() => setSource(ctx, kind, id, false) }),
          btn('Generated', { class: preferGenerated(kind, id) ? 'btn--pri btn--sm' : '',
            onClick:() => setSource(ctx, kind, id, true) })))
    : null;

  add(wrap,
    swap('veh', v.id, 'the vehicle'),
    swap('eng', e.id, 'the engine'),
    hasBundled('veh', v.id) || hasBundled('eng', e.id)
      ? note('The scan is the real object, photographed in three dimensions. The generated one is built from the specification, so every part of it is a part you can take off — which is the only version the teardown works on.')
      : null,
    field('Engine', select(engineOptions(v), e.id, (id) => choose(ctx, 'eng', id))),
    v.model && liveriesFor(v.model).length ? field('Livery', select(
      liveriesFor(v.model).map(l => ({ value:l.id, label:l.name })),
      (state.ui.liveries ||= {})[v.model] || liveriesFor(v.model)[0].id,
      async (id) => {
        (state.ui.liveries ||= {})[v.model] = id; save();
        const ok = await setLivery(v.model, id);
        toast(ok ? 'Livery changed.' : 'That livery could not be loaded.', ok ? 'good' : 'bad');
      })) : null);

  const t = defaultTune(e);
  const res = simulate(e, state.tunes[e.id] || t, applyUpgrades(emptyMods(), state.fitted[e.id] || []));
  const p = U.power(res.hp), tq = U.torque(res.tqNm);

  add(wrap,
    section('The machine',
      para(v.blurb),
      kv('Class', labelFor(v)),
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
  tabs:() => [{ id:'vehicles', name:'Vehicles' }, { id:'engines', name:'Engines' },
              { id:'project', name:'Project' }, { id:'compare', name:'Compare' }],
  render,
  hud:() => ({ title: vehicle().name, sub: engine().name }),
};
