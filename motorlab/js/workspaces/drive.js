/* Drive — sit in the car, turn the key, hear it, rev it, shift it.
 *
 * The car stays in the garage: this is the rolling-road fantasy, not a
 * driving game. The engine is the app's own live simulation — the same rpm
 * the crank animation and the turbos follow — and the sound is synthesised
 * from that rpm and the engine's real cylinder count, so a V8 sounds like a
 * V8 and a twin lopes. Gears map revs to road speed through the car's real
 * ratios and final drive.
 */
import { h, section, para, btn, toast, add } from '../ui.js';
import { state, engine, vehicle, fitted, save } from '../store.js';
import { engineAudio } from '../lib/engineAudio.js';

const drive = {
  running: false, gear: 0, throttle: 0, steer: 0, steerTo: 0, hand: false, keys: false,
  raf: 0, refs: null, active: false,
};

const wheelRadius = (v) => {
  /* rolling radius from the spec: rim + a sensible sidewall */
  const rim = (v.rimF || 17) * 25.4 / 2;
  const wall = (v.tyreF || 225) * 0.45;
  return (rim + wall) / 1000;
};

function ratios(v){ return v.gears || [3.6, 2.1, 1.4, 1.0, 0.8]; }

function speedKmh(v, rpm, gear){
  if (gear <= 0 || rpm <= 0) return 0;
  const r = ratios(v)[gear - 1] * (v.final || 3.7);
  const wheelRps = rpm / 60 / r;
  return wheelRps * 2 * Math.PI * wheelRadius(v) * 3.6;
}

/* ---- the cluster: one SVG binnacle ------------------------------------ */
function clusterSvg(e){
  const redline = e.redline || 7000;
  const top = Math.ceil(redline / 1000) + 1;                 // dial goes 1k past
  const A0 = -220, A1 = 40;                                  // sweep, degrees
  const ang = (k) => (A0 + (k / top) * (A1 - A0)) * Math.PI / 180;
  let ticks = '', nums = '';
  for (let k = 0; k <= top; k++){
    const a = ang(k), big = 84, small = 74, num = 62;
    const red = k * 1000 >= redline;
    ticks += `<line x1="${Math.cos(a)*small}" y1="${Math.sin(a)*small}"
      x2="${Math.cos(a)*big}" y2="${Math.sin(a)*big}"
      stroke="${red ? 'var(--bad,#e5484d)' : 'currentColor'}" stroke-width="2.5"/>`;
    nums += `<text x="${Math.cos(a)*num}" y="${Math.sin(a)*num + 4}"
      text-anchor="middle" font-size="12" fill="${red ? 'var(--bad,#e5484d)' : 'currentColor'}">${k}</text>`;
    if (k < top) for (let m = 1; m < 5; m++){
      const aa = ang(k + m / 5);
      ticks += `<line x1="${Math.cos(aa)*80}" y1="${Math.sin(aa)*80}"
        x2="${Math.cos(aa)*84}" y2="${Math.sin(aa)*84}" stroke="currentColor" stroke-width="1" opacity=".5"/>`;
    }
  }
  /* the red arc across the last stretch of the dial */
  const ra = ang(redline / 1000), rb = ang(top);
  const arc = `<path d="M ${Math.cos(ra)*88} ${Math.sin(ra)*88}
    A 88 88 0 ${rb - ra > Math.PI ? 1 : 0} 1 ${Math.cos(rb)*88} ${Math.sin(rb)*88}"
    fill="none" stroke="var(--bad,#e5484d)" stroke-width="5" opacity=".85"/>`;
  return `
  <svg viewBox="-110 -110 220 190" class="dash__tach" role="img" aria-label="Tachometer">
    <circle r="97" fill="var(--dashface,#0b0e13)" stroke="currentColor" stroke-width="1.5" opacity=".95"/>
    ${arc}${ticks}${nums}
    <text y="34" text-anchor="middle" font-size="10" opacity=".6">rpm × 1000</text>
    <g data-needle>
      <line x1="0" y1="12" x2="0" y2="-78" stroke="var(--acc,#ff7a1a)" stroke-width="4" stroke-linecap="round"/>
      <circle r="7" fill="var(--acc,#ff7a1a)"/>
    </g>
    <text data-speed y="66" text-anchor="middle" font-size="30" font-weight="700"
      font-family="var(--mono,monospace)">0</text>
    <text data-speedu y="80" text-anchor="middle" font-size="10" opacity=".6">km/h</text>
  </svg>`;
}

function needleAngle(e, rpm){
  const top = (Math.ceil((e.redline || 7000) / 1000) + 1) * 1000;
  const A0 = -220, A1 = 40;
  return A0 + Math.min(1, rpm / top) * (A1 - A0) + 90;   // needle art points up
}

/* ---- the loop --------------------------------------------------------- */
function tick(ctx){
  if (!drive.active) return;
  const vp = ctx.viewport, s = vp.state, e = engine(), v = vehicle();
  const r = drive.refs;

  /* throttle → target revs; the limiter cuts on the last few hundred rpm */
  if (drive.running && !s.cranking){
    const idle = e.idle || 850, red = e.redline || 7000;
    let target = idle + drive.throttle * (red - idle);
    if (s.rpm > red * 0.985 && drive.throttle > 0.9)
      target = red * 0.92;                                  // the bounce
    vp.revTo(target);
  }
  /* wheels turn with the revs through the gearbox, so the exterior view
     shows the car "rolling" while it sits on the road; the handbrake locks
     them while the revs flare free */
  const kmh = drive.running && !drive.hand ? speedKmh(v, s.rpm, drive.gear) : 0;
  s.speed = kmh / 3.6 / Math.max(0.05, wheelRadius(v));
  /* steering eases toward where the hands are, and centres itself */
  drive.steer += (drive.steerTo - drive.steer) * Math.min(1, (s.dt || 0.016) * 6);
  /* the angle kit does what it says: the same input turns the wheels further */
  s.steer = drive.steer * (fitted().includes('angle-kit') ? 1.7 : 1);

  /* the global sound follows the sim; tell it how hard the pedal is down */
  s.demand = drive.throttle;

  if (r){
    r.needle.setAttribute('transform', `rotate(${needleAngle(e, s.rpm)})`);
    r.speed.textContent = String(Math.round(kmh));
    r.rpm.textContent = String(Math.round(s.rpm));
    r.gear.textContent = drive.gear === 0 ? 'N' : String(drive.gear);
    const boosted = /turbo/.test(e.aspiration || '');
    if (r.boost){
      const spool = Math.max(0, Math.min(1, (s.rpm - (e.spoolRpm || 2200) * 0.6)
                    / Math.max(1, (e.spoolRpm || 2200)))) * drive.throttle;
      const bar = boosted && drive.running ? (e.boostTarget || 1) * spool : 0;
      r.boost.style.width = `${Math.min(100, bar / ((e.boostTarget || 1) || 1) * 100)}%`;
      r.boostTxt.textContent = `${bar.toFixed(2)} bar`;
    }
    r.lights.classList.toggle('dash__lights--out', drive.running && !s.cranking);
    r.start.textContent = drive.running ? '■ STOP' : '● START';
    r.start.classList.toggle('dash__start--run', drive.running);
  }
  drive.raf = requestAnimationFrame(() => tick(ctx));
}

function ignition(ctx){
  const vp = ctx.viewport, e = engine();
  if (!drive.running){
    drive.running = true;
    vp.startEngine(e.idle || 850, { redline: e.redline || 7000, spoolRpm: e.spoolRpm || 2200,
                                    inertia: (e.dryWeight || 150) / 150 });
    toast(`${e.name} — running.`);
  } else {
    drive.running = false;
    drive.throttle = 0;
    vp.state.demand = 0;
    vp.stopEngine();
    toast('Engine off.');
  }
}

function shift(dir){
  const v = vehicle();
  drive.gear = Math.max(0, Math.min(ratios(v).length, drive.gear + dir));
}

function enterDrive(ctx){
  if (drive.active) return;
  drive.active = true;
  const vp = ctx.viewport;
  vp.setGhost(false); vp.setExplode(0);
  vp.enterInterior(vehicle(), { side: state.settings.seatSide, fov: state.settings.driveFov });
  /* pedals on the keyboard while the workspace is open */
  drive._down = (ev) => {
    if (ev.repeat) return;
    if (ev.code === 'Space' || ev.code === 'KeyW' || ev.code === 'ArrowUp'){ drive.throttle = 1; ev.preventDefault(); }
    if (ev.code === 'ArrowRight') shift(1);
    if (ev.code === 'ArrowLeft') shift(-1);
    if (ev.code === 'KeyI') ignition(ctx);
    if (ev.code === 'KeyA') drive.steerTo = -1;
    if (ev.code === 'KeyD') drive.steerTo = 1;
    if (ev.code === 'KeyH' && drive.running){ drive.hand = true; engineAudio.chirp(); }
  };
  drive._up = (ev) => {
    if (ev.code === 'KeyA' || ev.code === 'KeyD') drive.steerTo = 0;
    if (ev.code === 'KeyH') drive.hand = false;
    if (ev.code === 'Space' || ev.code === 'KeyW' || ev.code === 'ArrowUp'){
      drive.throttle = 0;
      /* Space on keyup also "clicks" whichever button still has focus —
         which was the starter, so revving the engine kept switching it off */
      ev.preventDefault();
    }
  };
  addEventListener('keydown', drive._down);
  addEventListener('keyup', drive._up);
  tick(ctx);
}

export function leaveDrive(ctx){
  if (!drive.active) return;
  drive.active = false;
  cancelAnimationFrame(drive.raf);
  removeEventListener('keydown', drive._down);
  removeEventListener('keyup', drive._up);
  drive.running = false; drive.throttle = 0;
  ctx.viewport.stopEngine();
  ctx.viewport.exitInterior();
  ctx.viewport.state.speed = 0;
  ctx.viewport.state.demand = 0;
}

/* ---- panel ------------------------------------------------------------ */
export function render(ctx, tab){
  const wrap = h('div');
  const e = engine(), v = vehicle();
  enterDrive(ctx);

  const dash = h('div', { class:'dash', html: clusterSvg(e) });
  const boosted = /turbo|charged/.test(e.aspiration || '');
  const boostRow = boosted
    ? h('div', { class:'dash__boostrow' },
        h('span', { class:'dash__lbl', text:'BOOST' }),
        h('div', { class:'dash__boostbar' }, h('div', { class:'dash__boostfill' })),
        h('span', { class:'dash__boosttxt mono', text:'0.00 bar' }))
    : null;
  const lights = h('div', { class:'dash__lights' },
    h('span', { class:'dl dl--oil', title:'Oil pressure', text:'🛢' }),
    h('span', { class:'dl dl--batt', title:'Charging', text:'🔋' }),
    h('span', { class:'dl dl--eng', title:'Check engine', text:'⚠' }));
  const gearBadge = h('div', { class:'dash__gear', text:'N' });
  const rpmTxt = h('div', { class:'dash__rpm mono', text:'0' });

  const start = h('button', { class:'dash__start', type:'button', text:'● START',
    onclick:(ev) => { ignition(ctx); ev.currentTarget.blur(); } });
  const throttle = h('button', { class:'dash__pedal', type:'button', text:'THROTTLE — hold' });
  for (const [ev, on] of [['pointerdown', 1], ['pointerup', 0], ['pointercancel', 0], ['pointerleave', 0]])
    throttle.addEventListener(ev, (x) => { drive.throttle = on; x.preventDefault(); });
  const steer = h('input', { type:'range', min:-100, max:100, step:1, value:0, class:'dash__steer',
    'aria-label':'Steering' });
  steer.addEventListener('input', () => { drive.steerTo = steer.value / 100; });
  for (const ev of ['pointerup', 'pointercancel'])
    steer.addEventListener(ev, () => { steer.value = 0; drive.steerTo = 0; });
  const hand = h('button', { class:'dash__pedal dash__hand', type:'button', text:'HANDBRAKE — hold' });
  for (const [ev, on] of [['pointerdown', 1], ['pointerup', 0], ['pointercancel', 0], ['pointerleave', 0]])
    hand.addEventListener(ev, (x) => {
      if (on && !drive.hand && drive.running) engineAudio.chirp();
      drive.hand = !!on; x.preventDefault();
    });
  const down = btn('‹ Gear', { onClick:() => shift(-1) });
  const up = btn('Gear ›', { onClick:() => shift(1) });
  const view = btn('Inside / outside', { onClick:() => {
    const vp = ctx.viewport;
    if (vp.interior){ vp.exitInterior(); vp.frame(); }
    else vp.enterInterior(v, { side: state.settings.seatSide, fov: state.settings.driveFov });
  } });

  add(wrap,
    h('div', { class:'dash__head' },
      h('div', null, h('b', { text: v.name }), h('div', { class:'dash__sub', text: e.name })),
      lights),
    dash,
    h('div', { class:'dash__mid' }, gearBadge, rpmTxt, h('span', { class:'dash__lbl', text:'rpm' })),
    boostRow,
    h('div', { class:'btnrow', style:{ marginTop:'10px' } }, start, throttle),
    h('div', { class:'btnrow' }, hand, steer),
    h('div', { class:'btnrow' }, down, up, view),
    para('Hold the throttle and it revs; the tach, the sound, the crank and the turbos all follow '
      + 'the same simulation. Gears map the revs to road speed through this car\'s real ratios. '
      + 'Keys: <b>Space</b> throttle · <b>←/→</b> shift · <b>A/D</b> steer · <b>H</b> handbrake · <b>I</b> ignition.'));

  drive.refs = {
    needle: dash.querySelector('[data-needle]'),
    speed: dash.querySelector('[data-speed]'),
    gear: gearBadge, rpm: rpmTxt, lights, start,
    boost: boostRow?.querySelector('.dash__boostfill') || null,
    boostTxt: boostRow?.querySelector('.dash__boosttxt') || null,
  };
  return wrap;
}

export default {
  id:'drive', name:'Drive', icon:'🏁', model:'vehicle',
  tabs:() => [],
  render,
  leave: leaveDrive,
  hud:() => ({ title: vehicle().name, sub: 'In the driver\'s seat' }),
};
