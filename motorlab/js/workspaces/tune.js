/* Tuning bay — the ECU calibration tables and everything that limits them. */
import { h, section, kv, note, para, chip, btn, toast, select, field, slider, lineChart, modal, bar } from '../ui.js';
import { state, engine, vehicle, tune, setTune, resetTune, fitted, save, U } from '../store.js';
import { FUELS, isBoosted, displacementL } from '../data/engines.js';
import { LOAD_BINS, autoTune, auditTune, cloneTune, mbtTiming, fuelProps } from '../sim/ecu.js';
import { simulate, emptyMods, injectorCapacityKgH, chargeTemp, boostCapability, inducedType } from '../sim/engineSim.js';
import { applyUpgrades } from '../data/upgrades.js';
import { addXp, unlock, evaluateChallenges } from '../game.js';

export function mods(){ return applyUpgrades(emptyMods(), fitted()); }
export function result(){ return simulate(engine(), tune(), mods(), { ambientC: state.settings.ambientC }); }

export function render(ctx, tab){
  const e = engine(), t = tune(), m = mods();
  const wrap = h('div');
  if (tab === 'fuel')    return renderTable(ctx, wrap, 'lambda');
  if (tab === 'spark')   return renderTable(ctx, wrap, 'timing');
  if (tab === 'audit')   return renderAudit(ctx, wrap);

  const res = result();
  const p = U.power(res.hp), tq = U.torque(res.tqNm);
  const knocking = res.points.filter(x => x.knock > 0).length;
  const maxDuty = Math.max(...res.points.map(x => x.duty));
  const maxEgt = Math.max(...res.points.map(x => x.egt));
  const maxIat = Math.max(...res.points.map(x => x.iat));

  const chart = h('canvas', { class:'chart', style:{ height:'190px' } });
  requestAnimationFrame(() => lineChart(chart, { xLabel:'rpm', series:[
    { name:'Power', colour:'#ff7a1a', points:res.points.map(x => [x.rpm, x.hp]) },
    { name:'Torque', colour:'#22d3ee', axis:2, points:res.points.map(x => [x.rpm, x.tq]) },
  ]}));

  wrap.append(
    chart,
    h('div', { class:'sec', style:{ marginTop:'10px' } },
      kv('Peak power', `${p.v.toFixed(0)} ${p.u} @ ${res.hpRpm} rpm`),
      kv('Peak torque', `${tq.v.toFixed(0)} ${tq.u} @ ${res.tqRpm} rpm`),
      kv('Knocking points', knocking ? `${knocking} of ${res.points.length}` : 'none'),
      kv('Injector duty', `${(maxDuty*100).toFixed(0)} %`),
      kv('Peak EGT', U.fmt(U.temp(maxEgt))),
      kv('Peak intake temp', U.fmt(U.temp(maxIat))),
      kv('Engine health', `${res.health.score.toFixed(0)} / 100 — ${res.health.verdict}`),
      bar(res.health.score/100, res.health.score > 75 ? 'ok' : res.health.score > 45 ? '' : 'bad')),

    section('Calibration',
      field('Fuel', select(Object.entries(FUELS).map(([k, f]) => ({ value:k, label:`${f.name}${f.octane ? ` — ${f.octane} octane` : ''}` })),
        t.fuel, (v) => { t.fuel = v; setTune(t); ctx.refresh();
          toast(`Now on ${FUELS[v].name}. Re-tune — the timing and fuel tables are wrong for it.`, 'bad'); })),
      inducedType(e, m) !== 'na' ? slider({ label:'Boost target', min:0, max: Math.max(0.4, boostCapability(e, m)), step:0.05,
        value: Math.min(t.boostTarget || boostCapability(e, m), boostCapability(e, m)),
        format:(v) => U.fmt(U.pressure(v), 2),
        onInput:(v) => { t.boostTarget = v; setTune(t); ctx.debouncedRefresh(); } }) : null,
      inducedType(e, m) !== 'na' ? h('div', { class:'tiny muted', style:{ margin:'-2px 0 8px' },
        text:`Hardware ceiling with what is fitted: ${U.fmt(U.pressure(boostCapability(e, m)), 2)}` }) : null,
      slider({ label:'Rev limit', min: Math.round(e.redline*0.6), max: Math.round(e.redline*1.25), step:50, value:t.revLimit,
        format:(v) => v + ' rpm', onInput:(v) => { t.revLimit = v; setTune(t); ctx.debouncedRefresh(); } }),
      slider({ label:'Knock retard authority', min:0, max:16, step:1, value:t.knockRetardMax,
        format:(v) => v + '°', onInput:(v) => { t.knockRetardMax = v; setTune(t); ctx.debouncedRefresh(); } }),
      slider({ label:'Torque limiter', min:0, max: Math.round(res.tqNm * 1.6), step:10, value:t.tqLimitNm,
        format:(v) => v ? `${v} Nm` : 'off', onInput:(v) => { t.tqLimitNm = v; setTune(t); ctx.debouncedRefresh(); } }),
      slider({ label:'Launch rpm', min:1000, max:t.revLimit, step:100, value:t.launchRpm,
        format:(v) => v + ' rpm', onInput:(v) => { t.launchRpm = v; setTune(t); } }),
      e.antilag !== undefined || isBoosted(e) ? h('div', { class:'slrow' },
        h('label', { text:'Anti-lag' }), h('span', { style:{ flex:1 } }),
        btn(t.antilag ? 'On' : 'Off', { class:t.antilag ? 'btn--pri' : '',
          onClick:() => { t.antilag = !t.antilag; setTune(t); ctx.refresh(); } })) : null),

    section('Tuner tools',
      h('div', { class:'btnrow' },
        btn('Auto-tune (safe)', { onClick:() => doAuto(ctx, 0.25) }),
        btn('Auto-tune (street)', { class:'btn--pri', onClick:() => doAuto(ctx, 0.5) }),
        btn('Auto-tune (race)', { onClick:() => doAuto(ctx, 0.85) })),
      h('div', { class:'btnrow', style:{ marginTop:'7px' } },
        btn('Reset to factory', { onClick:() => { resetTune(); toast('Back to the factory calibration.'); ctx.refresh(); } }),
        btn('Check the map', { onClick:() => ctx.setTab('audit') }))),

    section('Fuel system headroom',
      kv('Injector capacity', `${injectorCapacityKgH(e, m).toFixed(1)} kg/h`),
      kv('Peak demand', `${Math.max(...res.points.map(x => x.fuelKgH)).toFixed(1)} kg/h`),
      kv('Duty at peak', `${(maxDuty*100).toFixed(0)} %`),
      maxDuty > 0.85 ? note('Injector duty is past 85%. Past that point the injector no longer closes fully between pulses and fuelling stops being predictable — fit larger injectors before you add any more boost.', 'bad')
                     : note('Duty cycle is within the linear region of the injector.')),
  );

  if (res.health.risks.length) wrap.append(section('Warnings',
    ...res.health.risks.slice(0, 5).map(r => note(r.msg, r.sev > 2 ? 'bad' : 'warn'))));
  return wrap;
}

function doAuto(ctx, aggression){
  const e = engine(), t = tune(), m = mods();
  const iatOf = (b) => chargeTemp(b, m, state.settings.ambientC);
  const nt = autoTune(e, t, m, { aggression, iatOf });
  setTune(nt);
  const res = simulate(e, nt, m);
  addXp(35, 'Calibrated a map');
  if (res.points.every(p => p.knock === 0)) unlock('no-knock');
  if (nt.fuel === 'e85' && res.health.score > 60) unlock('e85');
  if (res.hp >= 500) unlock('500hp');
  if (res.hp >= 1000) unlock('1000hp');
  if (res.health.score < 20) unlock('grenade');
  toast(nt.notes, 'good');
  ctx.refresh();
}

/* ---- editable tables -------------------------------------------------- */
function renderTable(ctx, wrap, which){
  const e = engine(), t = tune();
  const isLambda = which === 'lambda';
  const table = t[which];
  wrap.append(para(isLambda
    ? 'Target <b>lambda</b> against rpm (rows) and engine load (columns). λ 1.00 is stoichiometric for whatever fuel is selected. Best power is around λ 0.85–0.90; cruise cells run λ 1.00 for efficiency and emissions. Drag a cell up or down to change it.'
    : 'Ignition advance in <b>degrees before top dead centre</b>, against rpm and load. Cells past MBT are shown in orange — they make heat, not power. Cells that will knock on the selected fuel are shown in red. Drag to change.'));

  const tbl = h('table', { class:'tbl' });
  const head = h('tr', null, h('th', { text:'rpm \\ load' }), ...LOAD_BINS.map(l => h('th', { text:l + '%' })));
  tbl.appendChild(head);
  const f = fuelProps(t);
  const m = mods();

  t.rpmBins.forEach((rpm, i) => {
    const tr = h('tr', null, h('td', { class:'h', text:String(rpm) }));
    LOAD_BINS.forEach((load, j) => {
      const boost = load >= 80 ? (t.boostTarget || 0) : (t.boostTarget || 0) * Math.pow(load/100, 1.6);
      const mbt = mbtTiming(e, rpm, load, boost, f);
      const cell = h('td', { class:'cell' });
      const paint = () => {
        const v = table[i][j];
        cell.textContent = isLambda ? v.toFixed(2) : v.toFixed(1);
        cell.style.color = '';
        if (!isLambda){
          if (v > mbt + 1) cell.style.color = 'var(--warn)';
          const iat = chargeTemp(boost, m, state.settings.ambientC);
          const need = 70 + 5.4*(e.cr-8) + 14*boost + 0.32*(iat-25) + 1.5*(v - mbt)
                     - ((e.injection === 'direct' || e.injection === 'common-rail') ? 6 : 0)
                     - 60*((f.coolFuel||1)-1) - (e.preChamber ? 26 : 0);
          if (e.fuel !== 'diesel' && need > f.octane) cell.style.color = 'var(--bad)';
        } else {
          if (load >= 80 && v > (isBoosted(e) ? 0.92 : 1.02)) cell.style.color = 'var(--bad)';
        }
      };
      let startY = 0, startV = 0;
      cell.addEventListener('pointerdown', (ev) => {
        cell.setPointerCapture(ev.pointerId);
        startY = ev.clientY; startV = table[i][j];
      });
      cell.addEventListener('pointermove', (ev) => {
        if (!cell.hasPointerCapture?.(ev.pointerId)) return;
        const d = (startY - ev.clientY) / (isLambda ? 260 : 12);
        table[i][j] = isLambda ? Math.max(0.6, Math.min(1.3, Math.round((startV + d)*100)/100))
                               : Math.max(-10, Math.min(60, Math.round((startV + d)*10)/10));
        paint();
      });
      cell.addEventListener('pointerup', () => { setTune(t); ctx.debouncedRefresh(); });
      paint();
      tr.appendChild(cell);
    });
    tbl.appendChild(tr);
  });
  wrap.append(h('div', { class:'tablewrap' }, tbl));
  wrap.append(h('div', { class:'btnrow', style:{ marginTop:'10px' } },
    btn('−5%', { onClick:() => scale(ctx, which, isLambda ? 1.02 : 0.95) }),
    btn('+5%', { onClick:() => scale(ctx, which, isLambda ? 0.98 : 1.05) }),
    btn('Auto-fill', { class:'btn--pri', onClick:() => doAuto(ctx, state.settings.autoTuneAggression) })));
  wrap.append(note(isLambda
    ? 'Richer means a <i>lower</i> lambda number. Under boost, extra fuel is doing two jobs — making power and cooling the charge.'
    : 'Timing that knocks is worse than timing that is a degree soft. Detonation costs power immediately and pistons eventually.'));
  return wrap;
}
function scale(ctx, which, k){
  const t = tune();
  t[which] = t[which].map(row => row.map(v => which === 'lambda'
    ? Math.round(v * k * 100)/100 : Math.round(v * k * 10)/10));
  setTune(t); ctx.refresh();
}

/* ---- audit ------------------------------------------------------------ */
function renderAudit(ctx, wrap){
  const e = engine(), t = tune(), m = mods();
  const issues = auditTune(e, t, { iat: chargeTemp(t.boostTarget || 0, m, state.settings.ambientC) });
  const res = result();
  wrap.append(para('A tuner reading your map cell by cell. Every entry below is a specific cell or limit that will cost power, or cost you the engine.'));
  if (!issues.length && !res.health.risks.length)
    wrap.append(note('Nothing flagged. Every cell is inside its knock margin, the mixture is sensible for the load, and no limit is being exceeded.'));
  wrap.append(...issues.slice(0, 14).map(i => note(i.msg, i.sev > 6 ? 'bad' : i.sev > 2 ? 'warn' : '')));
  if (res.health.risks.length)
    wrap.append(section('Mechanical risk', ...res.health.risks.map(r => note(r.msg, r.sev > 2 ? 'bad' : 'warn'))));
  wrap.append(h('div', { class:'btnrow', style:{ marginTop:'10px' } },
    btn('Fix it for me (safe)', { class:'btn--pri', onClick:() => doAuto(ctx, 0.25) }),
    btn('Back to the map', { onClick:() => ctx.setTab('overview') })));
  return wrap;
}

export default {
  id:'tune', name:'Tuning', icon:'💻', model:'engine',
  tabs:() => [{ id:'overview', name:'Overview' }, { id:'fuel', name:'Fuel (λ)' },
              { id:'spark', name:'Ignition' }, { id:'audit', name:'Map check' }],
  render,
  hud:() => {
    const res = result();
    return { title:`${engine().name}`, sub:`${Math.round(res.hp)} hp · ${Math.round(res.tqNm)} Nm · health ${res.health.score.toFixed(0)}` };
  },
  gauges:() => {
    const res = result();
    const knock = res.points.filter(p => p.knock > 0).length;
    return [
      { label:'Power', value:`${Math.round(U.power(res.hp).v)} ${U.power(res.hp).u}` },
      { label:'Torque', value:`${Math.round(U.torque(res.tqNm).v)} ${U.torque(res.tqNm).u}` },
      { label:'Boost', value:U.fmt(U.pressure(Math.max(...res.points.map(p => p.boost))), 2) },
      { label:'Knock', value: knock ? `${knock} pts` : 'clear', kind: knock ? 'bad' : 'ok' },
    ];
  },
};
