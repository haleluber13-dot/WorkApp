/* Upgrade shop — fit real aftermarket parts and watch the model respond. */
import { h, section, kv, note, para, chip, btn, toast, select, field, lineChart } from '../ui.js';
import { state, engine, vehicle, tune, fitted, setFitted, save, U } from '../store.js';
import { UPGRADES, UPGRADE_BY_ID, CATS, applyUpgrades, availableFor, fitProblems } from '../data/upgrades.js';
import { simulate, emptyMods, boostCapability, inducedType } from '../sim/engineSim.js';
import { autoTune } from '../sim/ecu.js';
import { chargeTemp } from '../sim/engineSim.js';
import { spend, earn, addXp, unlock } from '../game.js';
import { dynoRun } from '../sim/dyno.js';

export function render(ctx, tab){
  const e = engine(), v = vehicle();
  const wrap = h('div');
  const list = fitted();
  const m = applyUpgrades(emptyMods(), list);
  const before = simulate(e, tune(), emptyMods());
  const after  = simulate(e, tune(), m);

  if (tab === 'fitted') return renderFitted(ctx, wrap, list, before, after, m);

  const cat = state.ui.upgradeCat ||= 'induction';
  const avail = availableFor(e, v);
  /* Predictions are quoted for a *tuned* engine: fitting hardware and leaving
   * the old map on it is not what anybody would actually do, and it hides what
   * the part is worth. Memoised for this render. */
  const tunedCache = new Map();
  const tunedHp = (modifiers, boost) => {
    const key = (modifiers.labels || []).join('|') + '@' + (boost ?? '');
    if (tunedCache.has(key)) return tunedCache.get(key);
    const base = { ...tune() };
    if (boost != null) base.boostTarget = boost;
    const t = autoTune(e, base, modifiers,
      { aggression: state.settings.autoTuneAggression, iatOf:(b) => chargeTemp(b, modifiers, state.settings.ambientC) });
    const hp = simulate(e, t, modifiers, { skipHealth:true }).hp;
    tunedCache.set(key, hp);
    return hp;
  };
  const tunedNow = tunedHp(m);
  wrap.append(
    h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:'Budget' }),
        chip('$' + state.game.credits.toLocaleString(), 'acc')),
      kv('Parts fitted', `${list.length}`),
      kv('Spent on this build', '$' + (m.cost || 0).toLocaleString()),
      kv('Power now', `${Math.round(U.power(after.hp).v)} ${U.power(after.hp).u}`),
      kv('Change', `${after.hp >= before.hp ? '+' : ''}${Math.round(U.power(after.hp - before.hp).v)} ${U.power(0).u}`),
      kv('Fully tuned', `${Math.round(U.power(tunedNow).v)} ${U.power(0).u}`)),
    note('Gains are quoted <b>after a re-tune</b>, because that is what you would actually do. Fit the part, then go to Tuning and turn it up — the Overview tab there shows the ceiling your hardware can now reach.'),
    field('Category', select(CATS.map(c => ({ value:c.id, label:c.name })), cat,
      (id) => { state.ui.upgradeCat = id; save(); ctx.refresh(); })),
  );

  const items = avail.filter(u => u.cat === cat);
  if (!items.length) wrap.append(note('Nothing in this category fits the current engine or vehicle. Swap to a different engine and check again — a supercharger kit will not fit a rotary, and anti-lag needs a turbo.'));

  for (const u of items){
    const on = list.includes(u.id);
    const probs = fitProblems(u, list);
    const preview = applyUpgrades(emptyMods(), on ? list : [...list, u.id]);
    const capNow = boostCapability(e, m), capNew = boostCapability(e, preview);
    const delta = on ? 0 : tunedHp(preview) - tunedNow;
    /* a bigger compressor does nothing until you actually command more boost,
     * so also show what it is worth once the tune uses the extra ceiling */
    const potential = (!on && capNew > capNow + 0.02) ? tunedHp(preview, capNew) - tunedNow : 0;
    wrap.append(h('div', { class:'card' + (on ? ' on' : '') },
      h('div', { class:'card__h' },
        h('div', null,
          h('div', { class:'card__brand', text:`${u.brand} · tier ${u.tier}` }),
          h('div', { class:'card__t', text:u.name })),
        h('div', { style:{ textAlign:'right' } },
          chip('$' + u.cost.toLocaleString(), on ? 'ok' : 'acc'),
          !on && Math.abs(delta) > 1 ? h('div', { class:'tiny', style:{ marginTop:'4px', color: delta > 0 ? 'var(--ok)' : 'var(--bad)' },
            text:`${delta > 0 ? '+' : ''}${Math.round(U.power(delta).v)} ${U.power(0).u} tuned` }) : null,
          !on && potential > 1 ? h('div', { class:'tiny', style:{ marginTop:'2px', color:'var(--acc)' },
            text:`+${Math.round(U.power(potential).v)} ${U.power(0).u} at ${capNew.toFixed(2)} bar` }) : null)),
      h('div', { class:'card__b', text:u.teach }),
      (!on && capNew > capNow + 0.02 && potential <= 1) ? h('div', { class:'tiny', style:{ marginTop:'6px', color:'var(--warn)' },
        text:`Raises the boost ceiling to ${capNew.toFixed(2)} bar, but on ${tune().fuel} at this charge temperature the extra boost only knocks. Fix the fuel or the charge cooling first and this part comes alive.` }) : null,
      probs.length ? h('div', { class:'tiny', style:{ marginTop:'6px', color:'var(--warn)' },
        text:probs.map(p => p.msg).join(' ') }) : null,
      h('div', { class:'btnrow', style:{ marginTop:'8px' } },
        on ? btn('Remove', { onClick:() => removeUp(ctx, u) })
           : btn('Fit it', { class:'btn--pri', disabled:probs.length > 0, onClick:() => fitUp(ctx, u) }))));
  }
  return wrap;
}

function fitUp(ctx, u){
  const list = fitted();
  if (state.settings.gameMode && !spend(u.cost)){
    toast(`Not enough credits — $${u.cost.toLocaleString()} needed, $${state.game.credits.toLocaleString()} available. Earn more from lessons, challenges and dyno runs.`, 'bad');
    return;
  }
  const capBefore = boostCapability(engine(), applyUpgrades(emptyMods(), list));
  setFitted([...list, u.id]);
  addXp(30, `Fitted ${u.name}`);
  const newMods = applyUpgrades(emptyMods(), fitted());
  const res = simulate(engine(), tune(), newMods);
  if (res.hp >= 500) unlock('500hp');
  if (res.hp >= 1000) unlock('1000hp');
  const capAfter = boostCapability(engine(), newMods);
  if (capAfter > capBefore + 0.02)
    toast(`${u.name} fitted. It raises the boost ceiling to ${capAfter.toFixed(2)} bar — but the ECU is still asking for ${(tune().boostTarget || 0).toFixed(2)} bar, so nothing changes until you turn it up in Tuning.`, 'good');
  else
    toast(`${u.name} fitted. Re-tune before you run it.`, 'good');
  ctx.refresh();
}
function removeUp(ctx, u){
  setFitted(fitted().filter(x => x !== u.id));
  if (state.settings.gameMode) earn(Math.round(u.cost * 0.6));
  toast(`${u.name} removed — 60% of the cost recovered.`);
  ctx.refresh();
}

function renderFitted(ctx, wrap, list, before, after, m){
  const e = engine();
  const chart = h('canvas', { class:'chart', style:{ height:'210px' } });
  requestAnimationFrame(() => lineChart(chart, { xLabel:'rpm', series:[
    { name:'Standard', colour:'#5a6b86', dash:[3,3], points:before.points.map(p => [p.rpm, U.power(p.hp).v]) },
    { name:'This build', colour:'#ff7a1a', points:after.points.map(p => [p.rpm, U.power(p.hp).v]) },
  ]}));
  wrap.append(
    para('Everything fitted to this engine, and what it did to the curve. Look at the <i>shape</i>, not just the peak — a big turbo that adds 150 hp at 7,000 rpm may have taken 60 Nm away at 2,500.'),
    chart,
    section('Totals',
      kv('Parts', String(list.length)),
      kv('Cost', '$' + (m.cost || 0).toLocaleString()),
      kv('Power', `${Math.round(U.power(before.hp).v)} → ${Math.round(U.power(after.hp).v)} ${U.power(0).u}`),
      kv('Torque', `${Math.round(U.torque(before.tqNm).v)} → ${Math.round(U.torque(after.tqNm).v)} ${U.torque(0).u}`),
      kv('Mass change', `${m.weightKg >= 0 ? '+' : ''}${m.weightKg} kg`),
      kv('Grip bonus', `+${((m.gripBonus||0)*100).toFixed(0)} %`),
      kv('Health', `${after.health.score.toFixed(0)} / 100 — ${after.health.verdict}`)),
    list.length ? section('Fitted parts', ...list.map(id => {
      const u = UPGRADE_BY_ID[id];
      return h('div', { class:'pitem installed' },
        h('span', { class:'pitem__st' }),
        h('span', { class:'pitem__n', text:u?.name || id }),
        h('button', { class:'pitem__go', onclick:() => removeUp(ctx, u) }, 'off'));
    })) : note('Nothing fitted yet. This engine is exactly as it left the factory.'),
    after.health.risks.length ? section('What this build is risking',
      ...after.health.risks.map(r => note(r.msg, r.sev > 2 ? 'bad' : 'warn'))) : null,
  );
  return wrap;
}

export default {
  id:'upgrade', name:'Upgrade Shop', short:'Upgrades', icon:'⭐', model:'engine',
  tabs:() => [{ id:'catalog', name:'Catalog' }, { id:'fitted', name:'This build' }],
  render,
  hud:() => ({ title:'Upgrade shop', sub:`${fitted().length} parts fitted · $${state.game.credits.toLocaleString()} available` }),
};
