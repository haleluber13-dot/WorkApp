/* Racing atlas — every discipline, on a world map and in a calendar. */
import { h, section, kv, note, para, chip, btn, toast, select, field, loadLand, worldMap } from '../ui.js';
import { state, save } from '../store.js';
import { RACES, RACE_BY_ID, DISCIPLINES, DISCIPLINE_BY_ID, MONTHS, racesByMonth, countries } from '../data/races.js';
import { addXp, unlock } from '../game.js';

let land = null;

export function render(ctx, tab){
  const wrap = h('div');
  if (tab === 'calendar') return renderCalendar(ctx, wrap);
  if (tab === 'series')   return renderSeries(ctx, wrap);
  return renderMap(ctx, wrap);
}

function activeFilters(){
  return state.ui.raceFilter ||= { disciplines:DISCIPLINES.map(d => d.id), q:'', month:0 };
}

function filtered(){
  const f = activeFilters();
  const q = (f.q || '').toLowerCase();
  return RACES.filter(r =>
    f.disciplines.includes(r.discipline) &&
    (!f.month || r.month === f.month) &&
    (!q || [r.name, r.series, r.circuit, r.country, r.city].join(' ').toLowerCase().includes(q)));
}

function renderMap(ctx, wrap){
  const f = activeFilters();
  const sel = state.ui.raceSel;
  const host = h('div', { class:'mapwrap', style:{ width:'100%', height:'270px', background:'#0b111c',
    border:'1px solid var(--line)', borderRadius:'10px', overflow:'hidden' } });

  const draw = async () => {
    land ||= await loadLand('./data/world_land.json');
    worldMap(host, {
      polygons: land,
      points: filtered().map(r => ({ id:r.id, lat:r.lat, lon:r.lon, name:r.name, city:r.city,
        country:r.country, colour:DISCIPLINE_BY_ID[r.discipline]?.colour || '#fff' })),
      selected: sel,
      onPick:(id) => {
        state.ui.raceSel = id; save();
        const seen = state.ui.seenDisciplines ||= [];
        const d = RACE_BY_ID[id].discipline;
        if (!seen.includes(d)){ seen.push(d); if (seen.length >= DISCIPLINES.length) unlock('globetrotter'); save(); }
        ctx.refresh();
      },
    });
  };
  draw();

  wrap.append(
    para('Every discipline, plotted where it actually happens. Tap a dot to read what makes that event what it is.'),
    host,
    h('div', { style:{ display:'flex', flexWrap:'wrap', gap:'4px', margin:'10px 0' } },
      ...DISCIPLINES.map(d => {
        const on = f.disciplines.includes(d.id);
        return h('button', { class:'chip', style:{ cursor:'pointer', opacity: on ? 1 : .35,
          borderColor: on ? d.colour : 'var(--line2)' },
          onclick:() => {
            f.disciplines = on ? f.disciplines.filter(x => x !== d.id) : [...f.disciplines, d.id];
            save(); ctx.refresh();
          } },
          h('span', { style:{ width:'7px', height:'7px', borderRadius:'50%', background:d.colour, display:'inline-block' } }),
          `${d.name} (${RACES.filter(r => r.discipline === d.id).length})`);
      })),
    h('div', { class:'btnrow', style:{ marginBottom:'10px' } },
      btn('All', { onClick:() => { f.disciplines = DISCIPLINES.map(d => d.id); save(); ctx.refresh(); } }),
      btn('None', { onClick:() => { f.disciplines = []; save(); ctx.refresh(); } })),
    h('div', { class:'field' }, h('input', { type:'text', placeholder:'Search circuit, series, country…', value:f.q,
      oninput:(e) => { f.q = e.target.value; save(); ctx.refresh(); } })),
  );

  if (sel && RACE_BY_ID[sel]){
    const r = RACE_BY_ID[sel];
    const d = DISCIPLINE_BY_ID[r.discipline];
    wrap.append(h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:d.name }), chip(MONTHS[(r.month||1)-1], 'acc')),
      h('h3', { style:{ fontSize:'15px', marginBottom:'4px' }, text:r.name }),
      h('div', { class:'tiny muted', style:{ marginBottom:'8px' }, text:`${r.series} · ${r.circuit}` }),
      para(r.notes),
      kv('Location', `${r.city}, ${r.country}`),
      kv('Coordinates', `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}`),
      r.lengthKm ? kv('Lap / stage length', `${r.lengthKm} km`) : null,
      r.turns ? kv('Corners', String(r.turns)) : null,
      kv('Surface', r.surface || 'asphalt')));
  }
  wrap.append(section(`Showing ${filtered().length} of ${RACES.length} events`,
    ...filtered().slice(0, 40).map(r => h('div', { class:'pitem' + (sel === r.id ? ' on' : ''),
      onclick:() => { state.ui.raceSel = r.id; save(); ctx.refresh(); } },
      h('span', { class:'pitem__st', style:{ background:DISCIPLINE_BY_ID[r.discipline]?.colour } }),
      h('span', { class:'pitem__n', text:r.name }),
      h('span', { class:'pitem__q', text:r.country })))));
  return wrap;
}

function renderCalendar(ctx, wrap){
  const byMonth = racesByMonth();
  wrap.append(para('The racing year, month by month. Motorsport never really stops — as one hemisphere\'s season ends the other\'s begins.'));
  byMonth.forEach((list, i) => {
    if (!list.length) return;
    wrap.append(h('div', { class:'grp' },
      h('div', { class:'grp__h' }, h('span', { text:MONTHS[i] }),
        h('span', { class:'grp__bar' }), h('span', { class:'tiny', text:String(list.length) })),
      h('div', { class:'plist' }, ...list.map(r => h('div', { class:'pitem',
        onclick:() => { state.ui.raceSel = r.id; save(); ctx.setTab('map'); } },
        h('span', { class:'pitem__st', style:{ background:DISCIPLINE_BY_ID[r.discipline]?.colour } }),
        h('span', { class:'pitem__n', text:r.name }),
        h('span', { class:'pitem__q', text:r.country }))))));
  });
  return wrap;
}

function renderSeries(ctx, wrap){
  wrap.append(para('What each discipline actually demands of the machine — which is the point of studying it here rather than just watching it.'));
  const engineering = {
    f1:'Aerodynamics above all: the car makes more downforce than it weighs. Power unit efficiency is regulated through a fuel-flow limit, so thermal efficiency, not displacement, is the competition.',
    endur:'Everything is a compromise with duration. Fuel economy sets stint length, brake and tyre wear set stop timing, and the fastest car rarely wins — the one that stops least does.',
    stock:'Spec bodywork and huge naturally aspirated V8s. Aerodynamic drafting and tyre management over a long green-flag run decide the result far more than horsepower.',
    rally:'Suspension travel, durability and driver information. Torque delivery matters more than peak power because traction changes surface to surface, metre to metre.',
    moto:'Everything is chassis and tyre. The engine must deliver torque the rear tyre can accept at lean angle — which is why traction control on a bike is really lean-angle-aware torque management.',
    motocross:'Suspension is the whole machine. Power is limited by what the rear tyre can put into loose dirt, so the tuning question is throttle response, not peak output.',
    kart:'No suspension and no differential. Every setup change is about how the frame flexes to lift the inside rear wheel so the kart can rotate at all.',
    drift:'Angle, speed and smoke, judged by people. Steering lock, differential lock and cooling matter far more than lap-time engineering.',
    drag:'Pure longitudinal acceleration. The whole engineering problem is putting power down in the first sixty metres — clutch slip management, not horsepower, wins rounds.',
    hill:'One run, no second chance, and often thousands of metres of altitude change. Naturally aspirated engines lose about 3% of their power per 300 m of elevation; turbos and electric motors do not.',
    ev:'Energy management. The fastest lap is rarely the winning strategy — you are racing a fixed number of kilowatt-hours, not a fixed number of laps.',
  };
  for (const d of DISCIPLINES){
    const list = RACES.filter(r => r.discipline === d.id);
    wrap.append(h('div', { class:'card' },
      h('div', { class:'card__h' },
        h('div', null, h('div', { class:'card__brand', style:{ color:d.colour }, text:`${d.icon} ${d.name}` }),
          h('div', { class:'card__t', text:`${list.length} events in the atlas` }))),
      h('div', { class:'card__b', text:engineering[d.id] || '' }),
      h('div', { class:'tiny muted', style:{ marginTop:'6px' },
        text:[...new Set(list.map(r => r.series))].join(' · ') })));
  }
  return wrap;
}

export default {
  id:'races', name:'Racing', icon:'🏁', model:null,
  tabs:() => [{ id:'map', name:'World map' }, { id:'calendar', name:'Calendar' }, { id:'series', name:'Disciplines' }],
  render,
  hud:() => ({ title:'World racing atlas', sub:`${RACES.length} events · ${countries().length} countries · ${DISCIPLINES.length} disciplines` }),
};
