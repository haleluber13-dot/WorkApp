/* Audio & 12 V — build a system and stay inside the alternator's budget. */
import { h, section, kv, note, para, chip, btn, toast, select, field, slider, bar, add } from '../ui.js';
import { state, vehicle, save, U } from '../store.js';
import { AUDIO, ampCurrentDraw, parallelImpedance, seriesImpedance, powerBudget,
         BASE_LOADS, sizeWire, recommendFuse } from '../data/electrical.js';
import { addXp, unlock } from '../game.js';

function build(){
  return state.ui.audio ||= { hu:'hu-basic', amp:'amp-4x150', sp:'sp-comp', sub:'sub-single12',
                              subCount:1, wiring:'parallel', alt:130, runM:4, gain:0.7 };
}

export function render(ctx, tab){
  const b = build();
  const wrap = h('div');
  if (tab === 'theory') return renderTheory(ctx, wrap);

  const hu  = AUDIO.headunits.find(x => x.id === b.hu);
  const amp = AUDIO.amps.find(x => x.id === b.amp);
  const sp  = AUDIO.speakers.find(x => x.id === b.sp);
  const sub = AUDIO.subs.find(x => x.id === b.sub);

  const subOhms = Array(b.subCount).fill(sub.ohm);
  const load = b.wiring === 'parallel' ? parallelImpedance(subOhms) : seriesImpedance(subOhms);
  const powerAtLoad = amp.rms * Math.min(2.2, Math.max(0.4, 4 / Math.max(0.5, load)));
  const draw = ampCurrentDraw(powerAtLoad * b.gain, amp.eff);
  const budget = powerBudget(b.alt, [...BASE_LOADS, { name:'Audio system', amps:draw }]);
  const wire = sizeWire(draw, b.runM, 0.4);
  const cost = hu.cost + amp.cost + sp.cost + sub.cost * b.subCount;

  add(wrap,
    section('The system',
      field('Head unit', select(AUDIO.headunits.map(x => ({ value:x.id, label:`${x.name} — $${x.cost}` })), b.hu,
        (v) => { b.hu = v; save(); ctx.refresh(); })),
      field('Amplifier', select(AUDIO.amps.map(x => ({ value:x.id, label:`${x.name} — $${x.cost}` })), b.amp,
        (v) => { b.amp = v; save(); ctx.refresh(); })),
      field('Front stage', select(AUDIO.speakers.map(x => ({ value:x.id, label:`${x.name} — $${x.cost}` })), b.sp,
        (v) => { b.sp = v; save(); ctx.refresh(); })),
      field('Subwoofer', select(AUDIO.subs.map(x => ({ value:x.id, label:`${x.name} — $${x.cost}` })), b.sub,
        (v) => { b.sub = v; save(); ctx.refresh(); })),
      slider({ label:'Sub count', min:1, max:4, step:1, value:b.subCount, format:(v)=>String(v),
        onInput:(v) => { b.subCount = v; save(); ctx.debouncedRefresh(); } }),
      field('Sub wiring', select([{ value:'parallel', label:'Parallel (impedance falls)' },
                                  { value:'series', label:'Series (impedance rises)' }], b.wiring,
        (v) => { b.wiring = v; save(); ctx.refresh(); })),
      slider({ label:'Typical listening level', min:0.15, max:1, step:0.05, value:b.gain,
        format:(v)=>Math.round(v*100)+'%', onInput:(v) => { b.gain = v; save(); ctx.debouncedRefresh(); } })),

    section('Electrical result',
      kv('Amplifier load', `${load.toFixed(2)} Ω`),
      kv('Power at that load', `${Math.round(powerAtLoad)} W RMS`),
      kv('Current draw', `${draw.toFixed(0)} A`),
      kv('Power cable', `${wire.label || wire.awg} AWG (${wire.mm2} mm²)`),
      kv('Main fuse', `${recommendFuse(wire)} A`),
      kv('Voltage drop', `${wire.dropV.toFixed(2)} V`),
      kv('System cost', '$' + cost.toLocaleString())),

    section('Alternator budget',
      slider({ label:'Alternator output', min:60, max:320, step:10, value:b.alt, format:(v)=>v+' A',
        onInput:(v) => { b.alt = v; save(); ctx.debouncedRefresh(); } }),
      bar(Math.min(1, budget.total / b.alt), budget.ok ? 'ok' : 'bad'),
      kv('Total demand', `${budget.total.toFixed(0)} A`),
      kv('Alternator', `${b.alt} A`),
      kv('Headroom', `${budget.headroom.toFixed(0)} A`),
      note(budget.verdict, budget.ok ? '' : 'bad'),
      ...BASE_LOADS.map(l => kv(l.name, l.amps + ' A')),
      kv('Audio system', draw.toFixed(0) + ' A')),

    load < 1 ? note('Below 1 Ω very few amplifiers are stable. Check the amplifier\'s minimum rated impedance before wiring it this way — going under it is how amplifiers die.', 'bad') : null,

    h('div', { class:'btnrow' }, btn('Sign it off', { class:'btn--pri', onClick:() => {
      if (budget.ok){ unlock('audio'); addXp(60, 'Designed an audio system'); toast('System signed off — inside the alternator budget.', 'good'); }
      else toast('Over budget. Either fit a bigger alternator or use less amplifier.', 'bad');
      ctx.refresh();
    } })),

    section('Why these parts',
      note(hu.teach), note(amp.teach), note(sp.teach), note(sub.teach)),
  );
  return wrap;
}

function renderTheory(ctx, wrap){
  add(wrap,
    para('Car audio is an electrical engineering problem wearing a music hat. Four numbers decide almost everything.'),
    section('1 — Power and current',
      para('Amplifier current draw ≈ <b>RMS power ÷ (efficiency × 13.8 V)</b>. Class D amplifiers run around 78–85% efficient; class A/B around 60–68%. A 1,000 W RMS class D amp still pulls roughly 90 A at full output.')),
    section('2 — Impedance',
      para('Parallel halves it, series adds it. Two 4 Ω coils in parallel = 2 Ω; in series = 8 Ω. Halving impedance roughly doubles current draw and heat, and every amplifier has a minimum it is stable at.')),
    section('3 — Cable and fusing',
      para('Size the power cable for <b>voltage drop</b> over the actual run, not just its current rating. Fuse it within 30 cm of the battery, because that fuse exists to protect the cable if the car is damaged — not to protect the amplifier.')),
    section('4 — Gain, not volume',
      para('Gain matches the amplifier to the head unit\'s output voltage. It is not a volume control. Set it too high and the amplifier clips before the head unit does — and a clipped signal is what actually destroys tweeters, not power.')),
    note('The single biggest improvement in most car systems is not more power. It is sound deadening on the door skin and getting the tweeter up near ear height and on-axis.'),
  );
  return wrap;
}

export default {
  id:'audio', name:'Audio & 12 V', short:'Audio', icon:'🔊', model:'vehicle',
  tabs:() => [{ id:'build', name:'System' }, { id:'theory', name:'Theory' }],
  render,
  hud:() => ({ title:'Audio & electrical load', sub:vehicle().name }),
};
