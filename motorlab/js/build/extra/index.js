/* Geometry for the extra part modules. Each module exports `build(ctx)` and
 * uses ctx.add / ctx.each / ctx.flush exactly like the main builder, with the
 * engine's layout (ctx.L) and placement helpers (ctx.portAt, ctx.railAt, …).
 * A module must only add geometry for ids the tree has (ctx.has guards that),
 * and every part it declares must get geometry — the headless build check
 * fails otherwise. */
import * as bottomEnd from './bottomEnd.js';
import * as valvetrain from './valvetrain.js';
import * as fuelIgnition from './fuelIgnition.js';
import * as supra2jz from './supra2jz.js';
import * as diesel from './diesel.js';
import * as bikes from './bikes.js';
import * as race from './race.js';
import * as rotary from './rotary.js';

const MODULES = [bottomEnd, valvetrain, fuelIgnition, supra2jz, diesel, bikes, race, rotary];

export function buildExtraParts(ctx){
  for (const m of MODULES){
    try { m.build?.(ctx); }
    catch (err){ console.warn('extra geometry module failed', m, err); }
  }
}
