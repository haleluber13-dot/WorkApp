/* MotorLab — teardown / rebuild workspace, shared by the Engine Bay and the
 * Chassis workspaces. Click any part in 3D (or in the list) and you get the
 * list of things you can do to it, why you can't do the others yet, and the
 * next correct step if you are stuck. */

import { h, section, sectionWith, kv, note, para, chip, bar, btn, toast, modal,
         torqueDial, confirmDialog, add } from '../ui.js';
import { state, engine, vehicle, tree, vTree, installedSet, setInstalled,
         vInstalledSet, setVInstalled, isTorqued, setTorqued, save, U } from '../store.js';
import { canInstall, canRemove, blockers, GROUP_BY_ID } from '../data/parts.js';
import { V_GROUP_BY_ID } from '../data/vehicleParts.js';
import { addXp, unlock } from '../game.js';
import { UPGRADE_BY_ID, availableFor } from '../data/upgrades.js';

/* ---------------------------------------------------------------------- */
function model(kind){
  return kind === 'vehicle'
    ? { tree: vTree(), get: vInstalledSet, set: setVInstalled, groups: V_GROUP_BY_ID,
        subject: vehicle(), noun:'vehicle' }
    : { tree: tree(), get: installedSet, set: setInstalled, groups: GROUP_BY_ID,
        subject: engine(), noun:'engine' };
}

let selected = null;
let ctxMenu = null;

/* ---- the click-anywhere action menu ---------------------------------- */
export function closeMenu(){ ctxMenu?.remove(); ctxMenu = null; }
addEventListener('pointerdown', (e) => { if (ctxMenu && !ctxMenu.contains(e.target)) closeMenu(); }, true);

function actionsFor(kind, partId){
  const M = model(kind);
  const p = M.tree.byId[partId];
  if (!p) return [];
  const inst = M.get();
  const installed = inst.has(partId);
  const out = [];
  out.push({ id:'inspect', label:'Inspect', icon:'🔍', ok:true,
    hint:'Read what this part does and what it is specified at.' });
  if (installed){
    const removable = canRemove(M.tree, inst, partId);
    out.push({ id:'remove', label:'Remove', icon:'🔧', ok:removable,
      why: p.removable === false ? 'This is the foundation everything else bolts to — it never comes out.'
         : removable ? null : `Blocked by: ${blockers(M.tree, inst, partId).join(', ')}. Take those off first.` });
    if (p.torque) out.push({ id:'torque', label: isTorqued(partId) ? 'Re-torque' : 'Torque it up', icon:'🎯', ok:true,
      hint:`${p.torque.count} × ${p.torque.size} at ${p.torque.nm} Nm.` });
  } else {
    const installable = canInstall(M.tree, inst, partId);
    out.push({ id:'install', label:'Install', icon:'⬇', ok:installable,
      why: installable ? null : `Needs first: ${blockers(M.tree, inst, partId).join(', ')}.` });
  }
  const ups = upgradesFor(kind, partId);
  if (ups.length) out.push({ id:'upgrade', label:`Upgrade / replace (${ups.length})`, icon:'⭐', ok:true,
    hint:'Aftermarket options that fit here.' });
  out.push({ id:'related', label:'What connects to this?', icon:'🔗', ok:true });
  out.push({ id:'focus', label:'Zoom to it', icon:'🎥', ok:true });
  return out;
}

/** Map an assembly part to the catalog upgrades that replace or modify it. */
const UPGRADE_SLOTS = {
  turbo:['turbo-stage1','turbo-stage2','turbo-efr','turbo-comp','twinscroll','antilag','hybrid-mgu'],
  blower:['sc-twinscrew','sc-roots','sc-centrifugal'],
  intercooler:['ic-bar','ic-water','meth','ic-ice'],
  cam:['cams-street','cams-race','vvt-tune'], vvt:['vvt-tune'],
  valves:['springs'], head:['headport'], headgasket:['headstuds'],
  pistons:['forged-rot','seals-race'], rods:['forged-rot'], apex:['seals-race'],
  maincaps:['girdle','headstuds'], crank:['balance','lightflywheel','balance-shaft-delete'],
  oilpump:['drysump'], injectors:['inj-big','inj-huge','flexfuel'],
  fuelrail:['pump-e85'], hpfp:['hpfp-up'],
  exhaust:['exh-cat','exh-full'], exmanifold:['headers','twinscroll'],
  intake:['intake-cai','itb'], throttle:['itb','intake-cai'],
  ecu:['ecu-piggy','ecu-standalone','knock-audio','egt-log'],
  o2:['egt-log'], knock:['knock-audio'],
  flywheel:['lightflywheel'], clutch:['clutch-twin'],
  /* vehicle */
  dampf:['coilovers','susp-race','bike-susp'], dampr:['coilovers','susp-race','bike-susp'],
  strutf:['coilovers','susp-race'], forks:['bike-susp'], shock:['bike-susp'],
  arbf:['arbs'], arbr:['arbs'], lcaf:['bushings'], lcar:['bushings'],
  discf:['bbk','pads-race','brake-cool'], calf:['bbk','pads-race'],
  discr:['bbk','pads-race'], calr:['pads-race'],
  wheels:['tyre-sport','tyre-slick','wheels-light'],
  diff:['lsd'], gearbox:['gears-close'], aero:['aero-kit'],
  body:['carbon-panels','weight-strip'], seats:['weight-strip'],
  exhaustsys:['exh-cat','exh-full'],
};
function upgradesFor(kind, partId){
  const ids = UPGRADE_SLOTS[partId] || [];
  const e = engine(), v = vehicle();
  return ids.map(i => UPGRADE_BY_ID[i]).filter(u => {
    if (!u) return false;
    try { return u.fits(e, v); } catch { return false; }
  });
}

export function openMenu(ctx, kind, partId, ev){
  closeMenu();
  const M = model(kind);
  const p = M.tree.byId[partId];
  if (!p) return;
  const acts = actionsFor(kind, partId);
  const box = h('div', { class:'card', style:{
    position:'fixed', zIndex:60, minWidth:'230px', maxWidth:'290px', boxShadow:'0 12px 34px rgba(0,0,0,.6)',
    background:'#141a26', borderColor:'#2e3950' } },
    h('div', { class:'card__h' },
      h('div', null,
        h('div', { class:'card__t', text:p.name }),
        h('div', { class:'tiny muted', text:(M.groups[p.group]?.name || '') + (p.qty > 1 ? ` · ×${p.qty}` : '') })),
      M.get().has(partId) ? chip('fitted','ok') : chip('off','warn')),
    ...acts.map(a => h('button', {
      class:'pitem' + (a.ok ? '' : ' blocked'),
      style:{ width:'100%', textAlign:'left', marginTop:'3px' },
      title: a.why || a.hint || '',
      onclick:() => { if (!a.ok){ toast(a.why || 'Not possible yet', 'bad'); return; } closeMenu(); runAction(ctx, kind, partId, a.id); } },
      h('span', { class:'pitem__st', style:{ background: a.ok ? 'var(--ok)' : '#3a4459' } }),
      h('span', { class:'pitem__n' }, `${a.icon}  ${a.label}`))),
    acts.some(a => !a.ok) ? h('div', { class:'tiny muted', style:{ marginTop:'7px', lineHeight:'1.5' },
      text: acts.find(a => !a.ok).why || '' }) : null,
  );
  document.body.appendChild(box);
  const r = box.getBoundingClientRect();
  const x = Math.min((ev?.clientX ?? innerWidth/2), innerWidth - r.width - 12);
  const y = Math.min((ev?.clientY ?? innerHeight/2), innerHeight - r.height - 12);
  box.style.left = Math.max(8, x) + 'px';
  box.style.top  = Math.max(8, y) + 'px';
  ctxMenu = box;
}

function runAction(ctx, kind, partId, action){
  const M = model(kind);
  switch (action){
    case 'inspect': selected = partId; ctx.viewport.select(partId); ctx.refresh(); break;
    case 'focus':   ctx.viewport.focusPart(partId); break;
    case 'install': doInstall(ctx, kind, partId); break;
    case 'remove':  doRemove(ctx, kind, partId); break;
    case 'torque':  openTorqueDrill(ctx, kind, partId); break;
    case 'upgrade': openUpgradeSheet(ctx, kind, partId); break;
    case 'related': showRelated(ctx, kind, partId); break;
  }
}

/* ---- install / remove ------------------------------------------------- */
export function doInstall(ctx, kind, partId){
  const M = model(kind);
  const inst = M.get();
  if (!canInstall(M.tree, inst, partId)){
    const need = blockers(M.tree, inst, partId);
    toast(`Not yet — fit ${need[0]} first.`, 'bad');
    return false;
  }
  inst.add(partId); M.set(inst);
  const p = M.tree.byId[partId];
  addXp(p.torque ? 18 : 10, `Fitted ${p.name}`);
  ctx.viewport.applyInstalled(inst);
  selected = partId; ctx.viewport.select(partId);
  if (p.torque && state.settings.torqueGame){
    toast(`${p.name} fitted — now torque it.`, 'good');
    openTorqueDrill(ctx, kind, partId);
  } else toast(`${p.name} fitted.`, 'good');
  checkMilestones(ctx, kind);
  ctx.refresh();
  return true;
}

export function doRemove(ctx, kind, partId){
  const M = model(kind);
  const inst = M.get();
  if (!canRemove(M.tree, inst, partId)){
    const b = blockers(M.tree, inst, partId);
    toast(b.length ? `Remove ${b[0]} first.` : 'This part cannot come off.', 'bad');
    return false;
  }
  const go = () => {
    inst.delete(partId); M.set(inst);
    setTorqued(partId, false);
    ctx.viewport.applyInstalled(inst);
    selected = partId; ctx.viewport.select(partId);
    toast(`${M.tree.byId[partId].name} removed.`);
    checkMilestones(ctx, kind);
    ctx.refresh();
  };
  if (state.settings.confirmRemove)
    confirmDialog('Remove part', `Take off ${M.tree.byId[partId].name}?`, go, 'Remove');
  else go();
  return true;
}

function checkMilestones(ctx, kind){
  const M = model(kind);
  const inst = M.get();
  const all = M.tree.parts;
  const core = all.filter(p => p.removable !== false);
  if (kind === 'engine'){
    if (core.every(p => !inst.has(p.id))) unlock('stripped');
    if (all.every(p => inst.has(p.id))){
      unlock('rebuilt');
      if (engine().kind === 'rotary') unlock('rotary');
      if (engine().fuel === 'diesel') unlock('diesel');
    }
  } else if (all.every(p => inst.has(p.id)) && vehicle().class === 'bike') unlock('bike');
}

/* ---- torque drill ----------------------------------------------------- */
export function openTorqueDrill(ctx, kind, partId){
  const M = model(kind);
  const p = M.tree.byId[partId];
  if (!p?.torque) return;
  const T = p.torque;
  const target = T.nm;
  const count = Math.min(T.count || 4, 24);
  const order = sequenceOrder(T.pattern?.kind || 'sequence', count);
  let idx = 0, applied = 0, mistakes = 0, done = [];

  const dial = h('canvas');
  const readout = h('div', { class:'wrench__v' });
  const grid = h('div', { class:'seqgrid' });
  const stageLine = h('div', { class:'tiny muted', style:{ textAlign:'center' } });
  const advice = h('div', { class:'note', style:{ marginTop:'10px' } });

  const drawGrid = () => {
    grid.innerHTML = '';
    const cols = Math.min(count, count > 12 ? 6 : count > 6 ? 5 : count);
    grid.style.gridTemplateColumns = `repeat(${cols}, 34px)`;
    for (let i = 0; i < count; i++){
      const pos = order.indexOf(i);
      const cls = done.includes(i) ? 'done' : (order[idx] === i ? 'next' : '');
      grid.appendChild(h('div', { class:'seqcell ' + cls, title:`Bolt ${i+1} — step ${pos+1} in the sequence` }, String(i+1)));
    }
  };
  const draw = () => {
    torqueDial(dial, { value: applied, target });
    readout.innerHTML = `${applied.toFixed(0)}<small> / ${target} Nm</small>`;
    stageLine.textContent = (T.stages || []).join('  →  ') + (T.lube ? `   ·   ${T.lube}` : '');
    drawGrid();
  };

  let pulling = false, raf = null;
  const startPull = () => {
    if (idx >= count) return;
    pulling = true; applied = 0;
    const step = () => {
      if (!pulling) return;
      applied += target * 0.028;
      if (applied > target * 1.65){ applied = target * 1.65; release(); return; }
      draw();
      raf = requestAnimationFrame(step);
    };
    step();
  };
  const release = () => {
    if (!pulling) return;
    pulling = false; cancelAnimationFrame(raf);
    const bolt = order[idx];
    const lo = target * 0.92, hi = target * 1.08;
    if (applied < lo){
      mistakes++;
      advice.className = 'note warn';
      advice.innerHTML = `<b>Under-torqued.</b> ${applied.toFixed(0)} Nm is below the ${target} Nm spec. Too little clamp load and the joint works loose or the gasket leaks. Pull again on the same bolt.`;
    } else if (applied > hi){
      mistakes++;
      advice.className = 'note bad';
      advice.innerHTML = `<b>Over-torqued.</b> ${applied.toFixed(0)} Nm past the ${target} Nm spec${T.tty ? ' on a torque-to-yield bolt' : ''}. In the real world you have now stretched the fastener${T.tty ? ' beyond its usable range' : ' or stripped the thread'} — replace it and start again.`;
      applied = 0; draw(); return;
    } else {
      done.push(bolt); idx++;
      advice.className = 'note';
      advice.innerHTML = idx >= count
        ? `<b>Joint complete.</b> ${count} fasteners at ${target} Nm in the correct ${T.pattern?.kind || 'sequence'} pattern.`
        : `Good — ${applied.toFixed(0)} Nm. Next is bolt <b>${order[idx]+1}</b>, following the ${T.pattern?.kind || 'sequence'} pattern.`;
      if (idx >= count){
        setTorqued(partId, true);
        const xp = 25 + count * 2 - mistakes * 5;
        addXp(Math.max(10, xp), `Torqued ${p.name}`);
        unlock('first-bolt');
        state.game.boltsTorqued = (state.game.boltsTorqued || 0) + count;
        if (mistakes === 0 && state.game.boltsTorqued >= 25) unlock('torque-perfect');
        save();
        toast(`${p.name} torqued to spec.`, 'good');
        ctx.refresh();
      }
    }
    applied = 0; draw();
  };

  const pullBtn = h('button', { class:'btn btn--pri btn--wide' }, 'Hold to pull the wrench');
  ['pointerdown'].forEach(e => pullBtn.addEventListener(e, (ev) => { ev.preventDefault(); startPull(); }));
  ['pointerup','pointerleave','pointercancel'].forEach(e => pullBtn.addEventListener(e, release));

  draw();
  modal({ title:`Torque — ${p.name}`, body:h('div', null,
    h('div', { class:'wrench' }, dial, readout),
    stageLine,
    para(`<b>${T.count} × ${T.size}</b> to <b>${T.nm} Nm</b>${T.angle ? ` plus <b>${T.angle}°</b> of angle` : ''}, ${T.pattern?.kind || 'in sequence'}.${T.tty ? ' These are torque-to-yield — single use.' : ''}`),
    grid,
    pullBtn,
    advice,
    para(p.teach)),
    actions:[{ label:'Done', primary:true }] });
}

function sequenceOrder(kind, n){
  const idx = [...Array(n).keys()];
  if (kind === 'centre-out' || kind === 'inside-out'){
    const mid = (n - 1) / 2;
    return idx.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  }
  if (kind === 'star'){
    const out = []; const step = n % 2 ? 2 : (n % 3 ? 3 : 2);
    let i = 0;
    while (out.length < n){ if (!out.includes(i % n)) out.push(i % n); else i++; i += step; }
    return out;
  }
  if (kind === 'perimeter'){
    const out = []; const mid = Math.floor(n/2);
    for (let k = 0; k < n; k++) out.push((mid + Math.ceil(k/2) * (k % 2 ? 1 : -1) + n) % n);
    return out;
  }
  if (kind === 'pair'){
    const out = []; for (let k = 0; k < n; k += 2){ out.push(k); if (k+1 < n) out.push(k+1); }
    return out;
  }
  return idx;
}

/* ---- upgrade sheet from a clicked part -------------------------------- */
function openUpgradeSheet(ctx, kind, partId){
  const ups = upgradesFor(kind, partId);
  const body = h('div', null,
    para(`Parts in the catalog that replace or modify <b>${model(kind).tree.byId[partId].name}</b>. Fitting one changes the simulation, so run the dyno afterwards and see what actually moved.`),
    ...ups.map(u => h('div', { class:'card' },
      h('div', { class:'card__h' },
        h('div', null, h('div', { class:'card__brand', text:u.brand }), h('div', { class:'card__t', text:u.name })),
        chip('$' + u.cost.toLocaleString(), 'acc')),
      h('div', { class:'card__b', text:u.teach }),
      h('div', { style:{ marginTop:'8px' } },
        btn('Open in the Upgrade Shop', { class:'btn--pri', onClick:() => { ctx.goto('upgrade', { highlight:u.id }); } })))));
  modal({ title:'Upgrade options', body, actions:[{ label:'Close' }] });
}

function showRelated(ctx, kind, partId){
  const M = model(kind);
  const p = M.tree.byId[partId];
  const inst = M.get();
  const body = h('div', null,
    para(p.teach),
    p.deps.length ? section('Must already be fitted', ...p.deps.map(d =>
      kv(M.tree.byId[d].name, inst.has(d) ? 'fitted' : 'missing', inst.has(d) ? '' : 'muted'))) : null,
    p.blocks.length ? section('Bolts on after this', ...p.blocks.map(b =>
      kv(M.tree.byId[b].name, inst.has(b) ? 'fitted' : 'not fitted'))) : null);
  modal({ title:p.name, body, actions:[{ label:'Close' }] });
  ctx.viewport.setHighlight([...p.deps, ...p.blocks]);
  setTimeout(() => ctx.viewport.setHighlight([]), 6000);
}

/* ---- coaching: what should I do next? --------------------------------- */
export function nextStep(kind){
  const M = model(kind);
  const inst = M.get();
  const missing = M.tree.order.filter(id => !inst.has(id));
  if (missing.length){
    const id = missing.find(m => canInstall(M.tree, inst, m)) || missing[0];
    return { kind:'install', id, part:M.tree.byId[id],
      msg:`Next to fit: <b>${M.tree.byId[id].name}</b>. ${M.tree.byId[id].deps.length ? 'Everything it bolts to is already on.' : 'It goes straight onto the foundation.'}` };
  }
  const untorqued = M.tree.parts.filter(p => p.torque && !isTorqued(p.id));
  if (untorqued.length)
    return { kind:'torque', id:untorqued[0].id, part:untorqued[0],
      msg:`Everything is fitted, but <b>${untorqued[0].name}</b> has not been torqued to spec yet.` };
  return { kind:'done', msg:'This assembly is complete and every bolted joint has been torqued. Take it to the dyno.' };
}

/* ---- panel ------------------------------------------------------------ */
export function renderPanel(ctx, kind, tab){
  const M = model(kind);
  const inst = M.get();
  const wrap = h('div');

  if (tab === 'inspect') return renderInspector(ctx, kind, wrap);
  if (tab === 'guide')   return renderGuide(ctx, kind, wrap);

  /* --- parts list --- */
  const total = M.tree.parts.length, on = M.tree.parts.filter(p => inst.has(p.id)).length;
  const step = nextStep(kind);
  add(wrap,
    h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:'Build progress' }),
        chip(`${on}/${total}`, on === total ? 'ok' : '')),
      bar(on/total, on === total ? 'ok' : ''),
      h('div', { class:'note', html:step.msg, style:{ marginTop:'8px' } }),
      h('div', { class:'btnrow', style:{ marginTop:'8px' } },
        step.kind === 'install' ? btn('Fit it for me', { class:'btn--pri', onClick:() => doInstall(ctx, kind, step.id) }) : null,
        step.kind === 'torque'  ? btn('Torque it', { class:'btn--pri', onClick:() => openTorqueDrill(ctx, kind, step.id) }) : null,
        step.id ? btn('Show me where', { onClick:() => { ctx.viewport.select(step.id); ctx.viewport.focusPart(step.id); selected = step.id; ctx.refresh(); } }) : null)),
    h('div', { class:'btnrow', style:{ marginBottom:'12px' } },
      btn('Strip it all', { onClick:() => stripAll(ctx, kind) }),
      btn('Build it all', { onClick:() => buildAll(ctx, kind) })),
  );

  for (const g of M.tree.groups){
    const parts = M.tree.parts.filter(p => p.group === g.id).sort((a,b) => a.step - b.step);
    const fitted = parts.filter(p => inst.has(p.id)).length;
    const openKey = kind + ':' + g.id;
    const collapsed = state.ui.groupsOpen[openKey] === false;
    const list = h('div', { class:'plist' }, ...parts.map(p => partRow(ctx, kind, p, inst)));
    const box = h('div', { class:'grp' + (collapsed ? ' collapsed' : '') },
      h('div', { class:'grp__h', onclick:(e) => {
        state.ui.groupsOpen[openKey] = collapsed; save();
        e.currentTarget.parentElement.classList.toggle('collapsed');
      } }, h('span', { text:g.name }),
         h('span', { class:'grp__bar' }, h('i', { style:{ width:(fitted/parts.length*100)+'%' } })),
         h('span', { class:'tiny', text:`${fitted}/${parts.length}` })),
      list);
    wrap.appendChild(box);
  }
  return wrap;
}

function partRow(ctx, kind, p, inst){
  const M = model(kind);
  const on = inst.has(p.id);
  const can = on ? canRemove(M.tree, inst, p.id) : canInstall(M.tree, inst, p.id);
  const torqued = p.torque ? isTorqued(p.id) : true;
  return h('div', {
    class:'pitem' + (on ? ' installed' : '') + (selected === p.id ? ' on' : '') + (can ? '' : ' blocked'),
    onclick:() => { selected = p.id; ctx.viewport.select(p.id); if (state.settings.autoFrame) ctx.viewport.focusPart(p.id); ctx.setTab('inspect'); },
    oncontextmenu:(ev) => { ev.preventDefault(); openMenu(ctx, kind, p.id, ev); } },
    h('span', { class:'pitem__st' }),
    h('span', { class:'pitem__n', text:p.name }),
    p.qty > 1 ? h('span', { class:'pitem__q', text:'×' + p.qty }) : null,
    on && p.torque && !torqued ? h('span', { class:'pitem__q', style:{ color:'var(--warn)' }, text:'⚠' }) : null,
    h('button', { class:'pitem__go', onclick:(ev) => { ev.stopPropagation(); on ? doRemove(ctx, kind, p.id) : doInstall(ctx, kind, p.id); },
      title: on ? 'Remove' : 'Install' }, on ? 'off' : 'fit'));
}

function stripAll(ctx, kind){
  const M = model(kind);
  confirmDialog('Strip the whole assembly', 'Remove every part in the correct order, down to the foundation?', () => {
    const inst = M.get();
    let guard = 0;
    while (guard++ < 400){
      const next = [...inst].find(id => canRemove(M.tree, inst, id));
      if (!next) break;
      inst.delete(next); setTorqued(next, false);
    }
    M.set(inst); ctx.viewport.applyInstalled(inst);
    checkMilestones(ctx, kind);
    toast('Stripped to the foundation.'); ctx.refresh();
  }, 'Strip it');
}
function buildAll(ctx, kind){
  const M = model(kind);
  const inst = M.get();
  for (const id of M.tree.order) inst.add(id);
  M.set(inst); ctx.viewport.applyInstalled(inst);
  checkMilestones(ctx, kind);
  addXp(30, 'Assembled everything');
  toast('Assembled. Torque specs still need doing individually.', 'good');
  ctx.refresh();
}

/* ---- inspector -------------------------------------------------------- */
function renderInspector(ctx, kind, wrap){
  const M = model(kind);
  const inst = M.get();
  const p = M.tree.byId[selected];
  if (!p){
    add(wrap, note('Click any part in the 3D view, or pick one from the Parts tab, to inspect it. <b>Right-click</b> a part for the full list of things you can do to it.'));
    return wrap;
  }
  const on = inst.has(p.id);
  add(wrap,
    h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:M.groups[p.group]?.name || 'Part' }),
        on ? chip('fitted', 'ok') : chip('not fitted', 'warn')),
      h('h3', { style:{ fontSize:'15px', marginBottom:'6px' }, text:p.name }),
      p.qty > 1 ? h('div', { class:'tiny muted', style:{ marginBottom:'8px' }, text:`Quantity: ${p.qty}` }) : null,
      para(p.teach)),
  );
  if (p.spec) add(wrap, section('Specification', ...Object.entries(p.spec).map(([k,v]) => kv(k, String(v)))));
  if (p.torque){
    const T = p.torque;
    add(wrap, section('Torque sheet',
      kv('Fastener', `${T.count} × ${T.size}`),
      kv('Torque', `${T.nm} Nm` + (T.angle ? ` + ${T.angle}°` : '')),
      kv('Pattern', T.pattern?.kind || 'sequence'),
      T.lube ? kv('Threads', T.lube) : null,
      T.tty ? kv('Type', 'torque-to-yield, single use') : null,
      h('div', { class:'tiny muted', style:{ marginTop:'6px' }, text:(T.stages||[]).join(' → ') }),
      h('div', { style:{ marginTop:'8px' } },
        btn(isTorqued(p.id) ? 'Re-torque this joint' : 'Torque this joint',
          { class:isTorqued(p.id) ? '' : 'btn--pri', onClick:() => openTorqueDrill(ctx, kind, p.id) }))));
  }
  const dep = p.deps.map(d => M.tree.byId[d]).filter(Boolean);
  const blk = p.blocks.map(b => M.tree.byId[b]).filter(Boolean);
  if (dep.length) add(wrap, section('Goes on after', ...dep.map(d => kv(d.name, inst.has(d.id) ? '✓ fitted' : 'missing'))));
  if (blk.length) add(wrap, section('Comes off before', ...blk.map(b => kv(b.name, inst.has(b.id) ? 'fitted — remove first' : '—'))));

  const ups = upgradesFor(kind, p.id);
  if (ups.length) add(wrap, section(`Upgrades that fit here (${ups.length})`,
    ...ups.slice(0, 4).map(u => h('div', { class:'card' },
      h('div', { class:'card__h' }, h('div', null,
        h('div', { class:'card__brand', text:u.brand }), h('div', { class:'card__t', text:u.name })),
        chip('$' + u.cost.toLocaleString())),
      h('div', { class:'card__b', text:u.teach.slice(0, 150) + (u.teach.length > 150 ? '…' : '') }))),
    btn('Open the Upgrade Shop', { class:'btn--wide', onClick:() => ctx.goto('upgrade') })));

  add(wrap, h('div', { class:'btnrow', style:{ marginTop:'12px' } },
    on ? btn('Remove', { onClick:() => doRemove(ctx, kind, p.id), disabled:!canRemove(M.tree, inst, p.id) })
       : btn('Install', { class:'btn--pri', onClick:() => doInstall(ctx, kind, p.id), disabled:!canInstall(M.tree, inst, p.id) }),
    btn('Zoom to it', { onClick:() => ctx.viewport.focusPart(p.id) })));
  return wrap;
}

/* ---- step-by-step guide ---------------------------------------------- */
function renderGuide(ctx, kind, wrap){
  const M = model(kind);
  const inst = M.get();
  const done = M.tree.order.filter(id => inst.has(id));
  const list = h('ol', { class:'steps' });
  M.tree.order.forEach((id, i) => {
    const p = M.tree.byId[id];
    const isDone = inst.has(id);
    const isCur = !isDone && M.tree.order.slice(0, i).every(x => inst.has(x));
    list.appendChild(h('li', { class: isDone ? 'done' : isCur ? 'cur' : '',
      onclick:() => { selected = id; ctx.viewport.select(id); ctx.viewport.focusPart(id); ctx.setTab('inspect'); },
      style:{ cursor:'pointer' } },
      h('b', { text:p.name }),
      p.torque ? h('span', { class:'tiny muted', text:` — ${p.torque.count} × ${p.torque.size} @ ${p.torque.nm} Nm` }) : null));
  });
  add(wrap,
    para(`The correct build order for this ${M.noun}, derived from what each part bolts to. Work down the list; tap any step to jump to that part in 3D.`),
    h('div', { class:'sec' }, h('div', { class:'sec__h' }, h('span', { text:'Assembly order' }),
      chip(`${done.length}/${M.tree.order.length}`)), list));
  return wrap;
}

export function getSelected(){ return selected; }
export function setSelected(id){ selected = id; }
