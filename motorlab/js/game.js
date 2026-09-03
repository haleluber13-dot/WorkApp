/* MotorLab — the game layer: XP, levels, credits, achievements and challenges. */

import { state, save } from './store.js';

export const LEVELS = [
  { lvl:1,  xp:0,     title:'Apprentice' },
  { lvl:2,  xp:250,   title:'Spanner hand' },
  { lvl:3,  xp:650,   title:'Mechanic' },
  { lvl:4,  xp:1200,  title:'Engine builder' },
  { lvl:5,  xp:2000,  title:'Head porter' },
  { lvl:6,  xp:3100,  title:'Boost specialist' },
  { lvl:7,  xp:4500,  title:'Calibration engineer' },
  { lvl:8,  xp:6400,  title:'Race engineer' },
  { lvl:9,  xp:8800,  title:'Chief engineer' },
  { lvl:10, xp:12000, title:'Master builder' },
];

export function levelFor(xp){
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find(l => l.xp > xp);
  return { ...cur, next, toNext: next ? next.xp - xp : 0,
    progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

export const ACHIEVEMENTS = [
  { id:'first-bolt',   name:'First bolt',        desc:'Torque any fastener correctly.', xp:40, icon:'🔩' },
  { id:'stripped',     name:'Down to the block', desc:'Strip an engine to the bare block.', xp:150, icon:'🧱' },
  { id:'rebuilt',      name:'It lives',          desc:'Reassemble a complete engine and run it.', xp:250, icon:'🔥' },
  { id:'torque-perfect',name:'Torque wrench',    desc:'Torque 25 fasteners without a single overtorque.', xp:180, icon:'🎯' },
  { id:'first-dyno',   name:'On the rollers',    desc:'Complete your first dyno pull.', xp:60, icon:'📈' },
  { id:'no-knock',     name:'Clean map',         desc:'Make a tune with zero detonation at full load.', xp:200, icon:'✅' },
  { id:'grenade',      name:'Grenade',           desc:'Destroy an engine with a bad tune. Everyone does it once.', xp:80, icon:'💥' },
  { id:'500hp',        name:'Five hundred',      desc:'Reach 500 hp on any engine.', xp:150, icon:'🏇' },
  { id:'1000hp',       name:'Four figures',      desc:'Reach 1,000 hp on any engine.', xp:300, icon:'🚀' },
  { id:'rotary',       name:'Understands rotaries', desc:'Fully strip and rebuild a Wankel.', xp:220, icon:'🔺' },
  { id:'diesel',       name:'Compression ignition', desc:'Build and tune a diesel.', xp:180, icon:'🛻' },
  { id:'bike',         name:'Two wheels',        desc:'Build a complete motorcycle.', xp:200, icon:'🏍' },
  { id:'e85',          name:'Corn fed',          desc:'Convert an engine to E85 and tune it safely.', xp:160, icon:'🌽' },
  { id:'wired',        name:'Sparks',            desc:'Diagnose every wiring fault.', xp:220, icon:'⚡' },
  { id:'audio',        name:'Loud',              desc:'Build an audio system inside the alternator budget.', xp:140, icon:'🔊' },
  { id:'scholar',      name:'Scholar',           desc:'Complete every lesson.', xp:400, icon:'🎓' },
  { id:'globetrotter', name:'Globetrotter',      desc:'Explore all eleven racing disciplines on the map.', xp:150, icon:'🌍' },
  { id:'lap-record',   name:'Lap record',        desc:'Beat 100 seconds on the grand prix circuit.', xp:200, icon:'⏱' },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

export const CHALLENGES = [
  { id:'ch-strip', name:'Full teardown', ws:'engine', reward:400,
    brief:'Strip any engine down to the bare block, then build it back up with every fastener torqued correctly.',
    check:(ctx) => ctx.strippedToBlock && ctx.fullyBuilt && ctx.allTorqued },
  { id:'ch-400', name:'400 horsepower on pump fuel', ws:'tune', reward:500,
    brief:'Reach 400 hp with zero detonation, on pump 98 or lower, and a health score above 70.',
    check:(ctx) => ctx.hp >= 400 && ctx.knockPoints === 0 && ctx.octane <= 98 && ctx.health >= 70 },
  { id:'ch-eff', name:'Efficient power', ws:'tune', reward:450,
    brief:'Make at least 120 hp per litre with a health score above 80.',
    check:(ctx) => ctx.specific >= 120 && ctx.health >= 80 },
  { id:'ch-sub12', name:'Sub-12 second quarter', ws:'dyno', reward:600,
    brief:'Run a quarter mile in under 12.0 seconds in any vehicle.',
    check:(ctx) => ctx.quarter > 0 && ctx.quarter < 12 },
  { id:'ch-sub4', name:'Sub-4 second sprint', ws:'dyno', reward:550,
    brief:'0–100 km/h in under 4.0 seconds.',
    check:(ctx) => ctx.zeroTo100 > 0 && ctx.zeroTo100 < 4 },
  { id:'ch-lap', name:'Under 100 seconds', ws:'dyno', reward:700,
    brief:'Lap the grand prix circuit in under 100 seconds.',
    check:(ctx) => ctx.lap > 0 && ctx.lap < 100 },
  { id:'ch-rotary', name:'Rebuild a rotary', ws:'engine', reward:500,
    brief:'Strip and rebuild a Wankel engine, apex seals and all.',
    check:(ctx) => ctx.isRotary && ctx.fullyBuilt && ctx.strippedToBlock },
  { id:'ch-budget', name:'Budget build', ws:'upgrade', reward:450,
    brief:'Reach 300 hp for under $4,000 in parts.',
    check:(ctx) => ctx.hp >= 300 && ctx.spend <= 4000 },
  { id:'ch-reliable', name:'Bulletproof', ws:'tune', reward:400,
    brief:'Make at least 1.6× standard power with a health score of 90 or better.',
    check:(ctx) => ctx.powerRatio >= 1.6 && ctx.health >= 90 },
  { id:'ch-wiring', name:'Auto electrician', ws:'wiring', reward:350,
    brief:'Correctly diagnose all seven wiring faults.',
    check:(ctx) => ctx.faultsFixed >= 7 },
  { id:'ch-quiz', name:'Top of the class', ws:'learn', reward:500,
    brief:'Score 100% on every lesson quiz.',
    check:(ctx) => ctx.perfectQuizzes >= ctx.totalQuizzes && ctx.totalQuizzes > 0 },
];

/* ---- events ----------------------------------------------------------- */
const listeners = new Set();
export function onGameEvent(fn){ listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind, payload){ listeners.forEach(fn => fn(kind, payload)); }

export function addXp(amount, reason){
  if (!state.settings.gameMode) return null;
  const g = state.game;
  const before = levelFor(g.xp);
  g.xp += amount;
  const after = levelFor(g.xp);
  save();
  emit('xp', { amount, reason, xp:g.xp });
  if (after.lvl > before.lvl){
    g.credits += after.lvl * 1500;
    emit('level', after);
    return after;
  }
  return null;
}

export function unlock(id){
  const g = state.game;
  if (g.achievements.includes(id)) return false;
  const a = ACH_BY_ID[id]; if (!a) return false;
  g.achievements.push(id);
  g.xp += a.xp;
  save();
  emit('achievement', a);
  return true;
}

export function completeChallenge(id){
  const g = state.game;
  if (g.challenges[id]?.done) return false;
  const c = CHALLENGES.find(x => x.id === id); if (!c) return false;
  g.challenges[id] = { done:true, at:Date.now() };
  g.credits += c.reward;
  addXp(Math.round(c.reward * 0.6), `Challenge: ${c.name}`);
  save();
  emit('challenge', c);
  return true;
}

/** Evaluate every challenge against the current build context. */
export function evaluateChallenges(ctx){
  const done = [];
  for (const c of CHALLENGES){
    if (state.game.challenges[c.id]?.done) continue;
    let ok = false;
    try { ok = !!c.check(ctx); } catch { ok = false; }
    if (ok && completeChallenge(c.id)) done.push(c);
  }
  return done;
}

export function spend(amount){
  if (!state.settings.gameMode) return true;
  if (state.settings.unlimitedMoney) return true;   // money never runs out
  if (state.game.credits < amount) return false;
  state.game.credits -= amount; save(); return true;
}
export function earn(amount){ state.game.credits += amount; save(); }

export function progressSummary(){
  const g = state.game;
  const lv = levelFor(g.xp);
  return {
    xp:g.xp, level:lv, credits:g.credits,
    achievements:g.achievements.length, totalAchievements:ACHIEVEMENTS.length,
    challenges:Object.values(g.challenges).filter(c => c.done).length, totalChallenges:CHALLENGES.length,
  };
}
