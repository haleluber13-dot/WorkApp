/* Electrical — trace circuits, size wire, and diagnose faults. */
import { h, section, kv, note, para, chip, btn, toast, select, field, slider, modal, add } from '../ui.js';
import { state, vehicle, save, U } from '../store.js';
import { CIRCUITS, CIRCUIT_BY_ID, WIRE, sizeWire, recommendFuse, voltageDrop } from '../data/electrical.js';
import { addXp, unlock, evaluateChallenges } from '../game.js';

export function render(ctx, tab){
  const wrap = h('div');
  if (tab === 'sizing') return renderSizing(ctx, wrap);
  if (tab === 'faults') return renderFaults(ctx, wrap);

  const id = state.ui.circuitId ||= 'starting';
  const c = CIRCUIT_BY_ID[id] || CIRCUITS[0];
  const fault = state.ui.activeFault ? c.faults.find(f => f.id === state.ui.activeFault) : null;

  add(wrap,
    field('Circuit', select(CIRCUITS.map(x => ({ value:x.id, label:x.name })), c.id,
      (v) => { state.ui.circuitId = v; state.ui.activeFault = null; save(); ctx.refresh(); })),
    board(ctx, c, fault),
    section('How it works', para(c.teach), kv('Typical current', c.current)),
  );

  if (c.faults.length) add(wrap, section('Fault simulator',
    para('Inject a fault and read the symptom. Work out which link is broken, then click it on the board.'),
    ...c.faults.map(f => {
      const solved = state.ui.solvedFaults?.[f.id];
      return h('div', { class:'card' + (fault?.id === f.id ? ' on' : '') },
        h('div', { class:'card__h' }, h('div', { class:'card__t', text:f.name }),
          solved ? chip('solved','ok') : null),
        h('div', { class:'card__b', text: fault?.id === f.id ? f.symptom : 'Inject this fault to see its symptom.' }),
        h('div', { class:'btnrow', style:{ marginTop:'7px' } },
          btn(fault?.id === f.id ? 'Clear fault' : 'Inject fault', {
            onClick:() => { state.ui.activeFault = fault?.id === f.id ? null : f.id; save(); ctx.refresh(); } }),
          fault?.id === f.id ? btn('Show the answer', { onClick:() => {
            modal({ title:f.name, body:h('div', null, para(`<b>Symptom.</b> ${f.symptom}`), para(`<b>Cause.</b> ${f.fix}`),
              note(`The broken link is between <b>${nodeName(c, f.breaks[0])}</b> and <b>${nodeName(c, f.breaks[1])}</b>.`)),
              actions:[{ label:'Close' }] });
          } }) : null));
    })));
  return wrap;
}

function nodeName(c, id){ return c.nodes.find(n => n.id === id)?.name || id; }

function board(ctx, c, fault){
  const host = h('div', { class:'board' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const byId = Object.fromEntries(c.nodes.map(n => [n.id, n]));
  const broken = fault ? fault.breaks.join('|') : null;

  for (const [a, b] of c.links){
    const na = byId[a], nb = byId[b];
    if (!na || !nb) continue;
    const isBroken = broken && ([a,b].join('|') === broken || [b,a].join('|') === broken);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', na.x*100); line.setAttribute('y1', na.y*100);
    line.setAttribute('x2', nb.x*100); line.setAttribute('y2', nb.y*100);
    line.setAttribute('stroke', isBroken ? '#ff5a5a' : wireColour(na, nb));
    line.setAttribute('stroke-width', '0.7');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if (isBroken) line.setAttribute('stroke-dasharray', '3 2');
    line.style.cursor = 'pointer';
    line.addEventListener('click', () => {
      if (!fault) { toast('No fault injected — nothing to find yet.'); return; }
      if (isBroken){
        state.ui.solvedFaults = { ...(state.ui.solvedFaults||{}), [fault.id]:true };
        const n = Object.keys(state.ui.solvedFaults).length;
        addXp(45, 'Diagnosed a circuit fault');
        if (n >= 7) unlock('wired');
        evaluateChallenges({ faultsFixed:n });
        save();
        modal({ title:'Found it', body:h('div', null, para(`<b>${fault.name}</b>`), para(fault.fix)),
          actions:[{ label:'Nice', primary:true }] });
        state.ui.activeFault = null;
        ctx.refresh();
      } else toast('That link is intact. Follow the current from the source to the load and back to ground.', 'bad');
    });
    svg.appendChild(line);
  }
  host.appendChild(svg);
  for (const n of c.nodes){
    const el = h('div', { class:'node' + (n.type === 'ground' ? ' live' : ''),
      style:{ left:(n.x*100)+'%', top:(n.y*100)+'%' },
      title:n.type,
      onclick:() => toast(`${n.name} — ${nodeHelp(n.type)}`) }, n.name);
    host.appendChild(el);
  }
  return host;
}
function wireColour(a, b){
  if (a.type === 'ground' || b.type === 'ground') return '#6b7280';
  if (a.type === 'source' || b.type === 'source') return '#d94f4f';
  if (a.type === 'sensor' || b.type === 'sensor') return '#4fd97a';
  return '#4f9fd9';
}
function nodeHelp(type){
  return { source:'supplies current', ground:'the return path — current must get back here',
    fuse:'protects the wire, not the device', relay:'a small current switching a large one',
    switch:'operator control', load:'consumes the power', module:'electronics that switch loads',
    sensor:'sends a signal, carries almost no current', junction:'distributes the feed' }[type] || type;
}

/* ---- wire sizing ------------------------------------------------------ */
function renderSizing(ctx, wrap){
  const s = state.ui.wire ||= { amps:40, length:4, drop:0.5 };
  const out = h('div', { class:'sec' });
  const recalc = () => {
    const w = sizeWire(s.amps, s.length, s.drop);
    out.innerHTML = '';
    add(out,
      h('div', { class:'sec__h' }, h('span', { text:'Recommendation' })),
      kv('Wire size', (w.label ? w.label + ' AWG' : `${w.awg} AWG`) + ` (${w.mm2} mm²)`),
      kv('Ampacity', `${w.amps} A continuous`),
      kv('Voltage drop', `${w.dropV.toFixed(2)} V (${w.dropPct.toFixed(1)} %)`),
      kv('Fuse', `${recommendFuse(w)} A, within 30 cm of the battery`),
      w.marginal ? note('Even the largest cable here exceeds your voltage-drop target. Shorten the run, or accept the drop.', 'warn')
                 : note('This satisfies both the current rating and the voltage-drop limit. Voltage drop, not ampacity, is usually what decides the answer on a vehicle.'));
  };
  add(wrap,
    para('Size a cable properly: pick the wire that can carry the current <i>and</i> keep the voltage drop acceptable over the run, then fuse just above the wire rating.'),
    slider({ label:'Load current', min:5, max:300, step:5, value:s.amps, format:(v)=>v+' A',
      onInput:(v) => { s.amps = v; recalc(); } }),
    slider({ label:'Run length (one way)', min:0.5, max:8, step:0.5, value:s.length, format:(v)=>v+' m',
      onInput:(v) => { s.length = v; recalc(); } }),
    slider({ label:'Acceptable drop', min:0.1, max:1.5, step:0.1, value:s.drop, format:(v)=>v.toFixed(1)+' V',
      onInput:(v) => { s.drop = v; recalc(); } }),
    out,
    section('Reference table',
      ...WIRE.slice().reverse().map(w => kv((w.label || w.awg) + ' AWG', `${w.mm2} mm² · ${w.amps} A`))),
    note('<b>The rule that prevents fires:</b> the fuse protects the wire, never the device. If you fit a bigger fuse because it keeps blowing, the wire becomes the fuse.'),
  );
  recalc();
  return wrap;
}

function renderFaults(ctx, wrap){
  const solved = state.ui.solvedFaults || {};
  const all = CIRCUITS.flatMap(c => c.faults.map(f => ({ ...f, circuit:c })));
  add(wrap,
    para('Every fault in the simulator, and the reasoning that finds it. Diagnosis is always the same three questions: does it have a feed, does it have a ground, and is the switch actually closing?'),
    section(`Progress — ${Object.keys(solved).length} / ${all.length}`,
      ...all.map(f => h('div', { class:'card' },
        h('div', { class:'card__h' },
          h('div', null, h('div', { class:'card__brand', text:f.circuit.name }), h('div', { class:'card__t', text:f.name })),
          solved[f.id] ? chip('solved','ok') : chip('open')),
        h('div', { class:'card__b' }, h('b', null, 'Symptom: '), f.symptom),
        solved[f.id] ? h('div', { class:'card__b', style:{ marginTop:'5px', color:'var(--ink2)' } }, f.fix) : null,
        h('div', { class:'btnrow', style:{ marginTop:'7px' } },
          btn('Work on it', { onClick:() => {
            state.ui.circuitId = f.circuit.id; state.ui.activeFault = f.id; save();
            ctx.setTab('board'); } }))))),
  );
  return wrap;
}

export default {
  id:'wiring', name:'Electrical', icon:'⚡', model:'vehicle',
  tabs:() => [{ id:'board', name:'Circuits' }, { id:'sizing', name:'Wire sizing' }, { id:'faults', name:'Fault log' }],
  render,
  hud:() => ({ title:'Electrical systems', sub:`${vehicle().name} · 12 V` }),
};
