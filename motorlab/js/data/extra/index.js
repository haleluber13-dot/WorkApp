/* Extra part modules — one file per family of parts, so they can be written
 * and reviewed independently. Each module exports `parts(e, ctx)` returning an
 * array of part descriptors (same shape as pistonTree's add({...})); they are
 * appended to the engine's tree before dependencies are resolved. Return []
 * for engines the module does not apply to. */
import * as bottomEnd from './bottomEnd.js';
import * as valvetrain from './valvetrain.js';
import * as fuelIgnition from './fuelIgnition.js';
import * as supra2jz from './supra2jz.js';
import * as diesel from './diesel.js';
import * as bikes from './bikes.js';
import * as race from './race.js';
import * as rotary from './rotary.js';

const MODULES = [bottomEnd, valvetrain, fuelIgnition, supra2jz, diesel, bikes, race, rotary];

export function extraParts(e, ctx){
  const out = [];
  for (const m of MODULES){
    try { const list = m.parts?.(e, ctx) || []; for (const p of list) if (p && p.id) out.push(p); }
    catch (err){ console.warn('extra parts module failed', m, err); }
  }
  return out;
}

/** Ids the modules want split into one part per piece. */
export function extraInstanced(){ return MODULES.flatMap(m => m.instanced || []); }
