/* Engine Bay & Chassis — both are the same teardown workspace on different trees. */
import { renderPanel, openMenu, getSelected, setSelected, nextStep,
         liftPart, dropPart, restoreBench } from './assembly.js';
import { h, btn, add } from '../ui.js';
import { engine, vehicle, installedSet, vInstalledSet, tree, vTree, tune, fitted, U, state } from '../store.js';
import { simulate, emptyMods } from '../sim/engineSim.js';
import { applyUpgrades } from '../data/upgrades.js';
import { summaryLine } from '../data/engines.js';

const tabs = [{ id:'parts', name:'Parts' }, { id:'inspect', name:'Inspector' },
              { id:'bench', name:'Bench' }, { id:'guide', name:'Build order' },
              { id:'ref', name:'Reference' }];

export const engineWs = {
  id:'engine', name:'Engine Bay', short:'Engine', icon:'⚙', model:'engine', tools:{ explode:true, crank:true },
  tabs:() => tabs,
  render:(ctx, tab) => renderPanel(ctx, 'engine', tab),
  onPick:(ctx, id, hit, ev) => { if (!id) return; setSelected(id); ctx.viewport.select(id);
    if (ev?.detail !== 0) openMenu(ctx, 'engine', id, ev); ctx.setTab('inspect'); },
  onContext:(ctx, id, hit, ev) => id && openMenu(ctx, 'engine', id, ev),
  onLift:(ctx, id) => liftPart(ctx, 'engine', id),
  onDrop:(ctx, id) => dropPart(ctx, 'engine', id),
  onModel:(ctx) => restoreBench(ctx, 'engine'),
  labelFor:(id) => { const p = tree().byId[id]; return p ? { name:p.name, installed:installedSet().has(id) } : null; },
  hud:() => {
    const e = engine(), inst = installedSet(), t = tree();
    return { title:e.name, sub:`${summaryLine(e)} · ${inst.size}/${t.parts.length} parts fitted` };
  },
  gauges:() => {
    const inst = installedSet(), t = tree();
    const complete = inst.size === t.parts.length;
    const res = complete ? simulate(engine(), tune(), applyUpgrades(emptyMods(), fitted())) : null;
    return [
      { label:'Assembly', value:`${Math.round(inst.size/t.parts.length*100)}%`, kind: complete ? 'ok' : '' },
      { label:'Fasteners', value:String(t.totalFasteners) },
      res ? { label:'Output', value:`${Math.round(U.power(res.hp).v)} ${U.power(res.hp).u}` }
          : { label:'Status', value:'incomplete', kind:'warn' },
    ];
  },
};

/* The service strip: where the car stands while you work on it. On the lift
   the whole underside — subframes, wishbones, dampers, exhaust, driveline —
   comes out from under the scan; with the front clip off, the engine sits in
   an open bay the way it does in a workshop. */
function serviceStrip(ctx){
  const vp = ctx.viewport, v = vehicle();
  const mode = vp.service || 'ground';
  const mk = (id, label) => btn(label, {
    class: mode === id ? 'btn--pri btn--sm' : 'btn--sm',
    onClick: () => { vp.setService(id, v); ctx.refresh(); },
  });
  return h('div', { class:'btnrow', style:{ marginBottom:'8px' } },
    mk('ground', 'On the ground'), mk('lift', 'On the lift'), mk('bay', 'Front clip off'));
}

export const chassisWs = {
  id:'chassis', name:'Chassis & Suspension', short:'Chassis', icon:'🛞', model:'vehicle', tools:{ explode:true },
  tabs:() => tabs,
  render:(ctx, tab) => {
    const wrap = h('div');
    add(wrap, serviceStrip(ctx), renderPanel(ctx, 'vehicle', tab));
    return wrap;
  },
  leave:(ctx) => ctx.viewport.setService('ground', vehicle()),
  onPick:(ctx, id, hit, ev) => { if (!id) return; setSelected(id); ctx.viewport.select(id);
    if (ev?.detail !== 0) openMenu(ctx, 'vehicle', id, ev); ctx.setTab('inspect'); },
  onContext:(ctx, id, hit, ev) => id && openMenu(ctx, 'vehicle', id, ev),
  onLift:(ctx, id) => liftPart(ctx, 'vehicle', id),
  onDrop:(ctx, id) => dropPart(ctx, 'vehicle', id),
  onModel:(ctx) => restoreBench(ctx, 'vehicle'),
  labelFor:(id) => { const p = vTree().byId[id]; return p ? { name:p.name, installed:vInstalledSet().has(id) } : null; },
  hud:() => {
    const v = vehicle(), inst = vInstalledSet(), t = vTree();
    return { title:v.name, sub:`${v.chassis} · ${v.drivetrain} · ${inst.size}/${t.parts.length} parts fitted` };
  },
  gauges:() => {
    const v = vehicle(), inst = vInstalledSet(), t = vTree();
    return [
      { label:'Assembly', value:`${Math.round(inst.size/t.parts.length*100)}%`, kind: inst.size === t.parts.length ? 'ok' : '' },
      { label:'Mass', value:`${v.massKg} kg` },
      { label:'Wheelbase', value:`${v.wheelbase} mm` },
    ];
  },
};
