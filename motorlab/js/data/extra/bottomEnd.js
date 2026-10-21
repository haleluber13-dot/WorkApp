/* bottomEnd — the rotating-assembly and bottom-end pieces a factory parts
 * catalogue lists separately that the base tree folds into bigger parts:
 * big-end shells, ring sets, piston pins and circlips, the head bolts as their
 * own removable part, head dowels, flywheel bolts, the crank pulley key and
 * the crank pulley bolt. Geometry lives in js/build/extra/bottomEnd.js.
 *
 * Sources (see scratchpad/parts-research): [RM502U] = Toyota 1997 Supra
 * repair manual RM502U (2JZ-GTE), sections EM/LU; [FSM] = maker's factory
 * manual figure as reproduced in petrol.md; [GEN] = general layout for the
 * family, not checked against the specific engine's manual. */

export const instanced = ['rodbearings', 'rings', 'pins', 'headbolts', 'headdowels'];

const LS_GEN4 = new Set(['v8-50-ohv']);            // LS3 — Gen IV small block
const GM_PRESSFIT_DAMPER = new Set(['v8-50-ohv', 'v8-62-sc']);   // LS/LT damper: no key [FSM]
const KEYED_JDM = new Set(['Toyota', 'Nissan', 'Mazda', 'Honda']);

const isPiston = (e) => e.kind !== 'rotary';
const isBike = (e) => e.class === 'bike';
/* single-cylinder dirt bikes and the Harley run a one-piece rod on a caged
   roller big end, not split shells */
const rollerBigEnd = (e) => e.id === 'm-vtwin-1200' || (isBike(e) && e.cyl === 1);
/* the classic small-block Chevrolet uses a press-fit pin: no circlips [FSM] */
const pressFitPin = (e) => e.id === 'v8-57-sb';

/**
 * Head bolts per head, and where that number comes from. Shared with the
 * geometry module so the drawn bolt count always equals the part's count.
 */
export function headBoltPlan(e, perHead){
  const known = {
    'i6-30-legend': { n:14, src:'Toyota RM502U (EM-29…33): 14 bolts + 14 plate washers' },
    'nissan-rb26':  { n:14, src:'Nissan FSM via petrol.md family 2: 14 bolts, same 2×(N+1) layout as the 2JZ' },
    'v8-50-ohv':    { n:15, src:'GM factory manual: 15 per head — 10 × M11 + 5 × M8 upper row' },
    'v8-62-sc':     { n:15, src:'GM factory manual (Gen IV/V small block): 15 per head — 10 × M11 + 5 × M8' },
    'v8-57-sb':     { n:17, src:'Chevrolet factory manual: 17 per head' },
    'v8-70-bb':     { n:17, src:'Chevrolet factory manual: 17 per head, long and short' },
    'f4-25-t':      { n:6,  src:'Subaru factory manual: 6 per head' },
  }[e.id];
  if (known) return known;
  if (e.fuel === 'diesel')
    return { n: perHead * 6 + 2, src:'estimate (the base tree’s diesel formula, 6 per bore + 2) — not checked against the maker’s manual' };
  if (e.layout === 'I' && e.cam !== 'OHV')
    return { n: 2 * (perHead + 1), src:'inline DOHC rule 2×(N+1): a bolt either side of every bore gap plus the ends (petrol.md family 1; [GEN] outside Japan)' };
  return { n: 2 * (perHead + 1), src:'[GEN] 2×(N+1) per head — a bolt either side of every bore gap plus the ends; check the engine’s manual' };
}

/** Real head-bolt torque where the research has it; otherwise none (the head part keeps its generic figure). */
function headBoltTorque(e, n, heads, B){
  const count = n * heads;
  switch (e.id){
    case 'i6-30-legend': return { nm:34, angle:180, size:'M11 · 10 mm bi-hex', count, tty:true,
      pattern:{ kind:'inside-out', count }, stages:['34 N·m in sequence, several passes', 'paint mark, +90° in order', '+90° again — mark faces the rear'],
      lube:'engine oil on the threads and under the heads (Toyota RM502U)' };
    case 'v8-50-ohv': case 'v8-62-sc': return { nm:30, angle:180, size:'M11 ×10 + M8 ×5', count, tty:true,
      pattern:{ kind:'inside-out', count }, stages:['M11: 30 N·m (22 lb-ft) in sequence', 'M11: +90°', 'M11: +90° (front and rear medium bolts +50°)', 'M8 upper row: 30 N·m'],
      lube:'new TTY bolts, as supplied (GM factory manual)' };
    case 'v8-57-sb': return { nm:88, size:'head bolt', count,
      pattern:{ kind:'inside-out', count }, stages:['three passes in sequence', '88 N·m (65 lb-ft)'],
      lube:'sealer on the bolts that break into the water jacket (Chevrolet manual)' };
    case 'v8-70-bb': return { nm:105, size:'long + short', count,
      pattern:{ kind:'inside-out', count }, stages:['passes in sequence', 'long bolts 102–108 N·m (75–80 lb-ft)', 'short bolts 88–92 N·m (65–68 lb-ft)'],
      lube:'oil on threads; sealer where a bolt enters the water jacket (Chevrolet manual)' };
    case 'f4-25-t': return { nm:34, angle:180, size:B.head.size, count, tty:true,
      pattern:{ kind:'inside-out', count }, stages:['29 N·m', '69 N·m', 'loosen 180°', 'loosen 180°', '34 N·m', '+90°', '+90°'],
      lube:'oil on threads (Subaru manual; versions vary)' };
    default: return undefined;
  }
}

export function parts(e, ctx){
  if (!isPiston(e) || ctx.rotary) return [];
  const out = [];
  const is2jz = e.id === 'i6-30-legend';
  const heads = ctx.heads || 1, perHead = ctx.perHead || e.cyl;

  /* ---- big-end shells ---- */
  if (!rollerBigEnd(e))
    out.push({ id:'rodbearings', name:'Rod bearings (big-end shells)', group:'rotating', qty:e.cyl * 2,
      deps:['rods'], mesh:'mainbearing',
      teach:`Two thin steel-backed half-shells per rod — the odd-numbered piece is the upper shell in the rod, the even one the lower shell in the cap. A tang locates each shell in a notch; crush, not the tang, stops it spinning. The upper shell often carries the oil hole and the lower does not, so never swap them. Oil the running face, never the back.${is2jz ? ' Toyota lists 6 upper + 6 lower, in 5 select sizes chosen from the cap mark and the crank mark, and keeps each lower shell in its own cap (RM502U, BD-22).' : ''} Measure the clearance with Plastigage before you commit.`,
      spec:{ 'Pieces': `${e.cyl * 2} (${e.cyl} upper + ${e.cyl} lower)`, 'Oil clearance':'0.030–0.060 mm typical', 'Located by':'tang in a notch, held by crush',
             'Source': is2jz ? 'Toyota RM502U' : 'petrol.md §A [FSM-2JZ / GEN]' } });

  /* ---- ring sets ---- */
  out.push({ id:'rings', name:'Piston ring sets', group:'rotating', qty:e.cyl, deps:['pistons'], mesh:'piston',
    teach:`One set per piston: top compression ring, second ring, and an oil-control ring made of an expander between two thin rails. ${is2jz ? 'Toyota marks the top ring "2T" and the second "2N" — code mark facing up — and fits the rails and expander by hand (RM502U, BD-29).' : 'Each compression ring has a mark that faces up; fitted upside down, the second ring pumps oil instead of scraping it.'} Stagger the gaps round the piston so they never line up, and check the end gap in the bore before fitting. They come off with a ring expander once the piston is out on the bench.`,
    spec:{ 'Rings per piston':'3 (oil ring = expander + 2 rails)', 'Top ring gap':`${(e.bore * 0.0045).toFixed(2)} mm (≈0.0045 × bore)`, 'Gap stagger':'~120°',
           'Source': is2jz ? 'Toyota RM502U' : 'petrol.md §A [GEN]' } });

  /* ---- pins & circlips ---- */
  if (pressFitPin(e))
    out.push({ id:'pins', name:'Piston pins (press-fit)', group:'rotating', qty:e.cyl, deps:['pistons'], mesh:'piston',
      teach:'The small-block Chevrolet uses a pressed pin: it is an interference fit in the rod small end and floats only in the piston, so there are no circlips. It comes out on a press with a support fixture, and goes back with the rod small end heated — never hammered.',
      spec:{ 'Type':'press-fit in rod', 'Circlips':'none', 'Source':'petrol.md §A [FSM]' } });
  else
    out.push({ id:'pins', name:'Piston pin sets (pin + 2 circlips)', group:'rotating', qty:e.cyl, deps:['pistons'], mesh:'piston',
      teach:`A hardened hollow pin through the piston bosses and the rod small end, held in by a snap ring (circlip) at each end. It floats in both.${is2jz ? ' Toyota: heat the piston to about 80 °C, push the pin in by thumb, new snap rings, gap away from the cutout; pin and piston are a matched set (RM502U, BD-30).' : ' Always fit new circlips with the gap away from the removal notch — a clip that walks out scores the bore from top to bottom.'}`,
      spec:{ 'Pieces':'1 pin + 2 circlips', 'Type':'full-floating', 'Source': is2jz ? 'Toyota RM502U' : 'petrol.md §A [FSM-2JZ / GEN]' } });

  /* ---- head bolts, as their own part ---- */
  const plan = headBoltPlan(e, perHead);
  const torque = headBoltTorque(e, plan.n, heads, ctx.B);
  out.push({ id:'headbolts', name: is2jz ? 'Head bolt sets (bolts + plate washers)' : 'Head bolt sets', group:'head', qty:heads,
    deps:['head'], mesh:'head', torque,
    teach:`${plan.n} bolts clamp each head to the block through the gasket. They are the most-taught fastener in the engine: loosen them in the reverse of the tightening sequence over several passes, or the head warps. ${torque?.tty ? 'These are torque-to-yield — stretched on purpose and single-use.' : ''}${is2jz ? ' On the 2JZ the camshafts come out first, then the 14 bolts with a 10 mm bi-hex, then the 14 plate washers, then the head lifts off its dowels (RM502U, HR-20/21).' : ''}`.trim(),
    spec:{ 'Bolts per head': plan.n, 'Heads': heads, 'Count source': plan.src,
           ...(torque ? {} : { 'Torque':'per the maker’s manual — not in our sources' }) } });

  /* ---- head dowels ---- */
  out.push({ id:'headdowels', name:'Head locating dowels', group:'head', qty:heads * 2, deps:['block'], mesh:'headgasket',
    teach:'Two hollow ring dowels in the block deck, sitting in two of the head-bolt holes, locate the gasket and the head before a single bolt goes in. Leave one out and the gasket can shift across a fire ring — and fail. They stay in the block when the head lifts off; pull them only to replace them.',
    spec:{ 'Per head':2, 'Type':'hollow ring dowel', 'Source':'petrol.md §A [GEN]' } });

  if (!isBike(e)){
    /* ---- flywheel bolts ---- */
    out.push({ id:'flywheelbolts', name:'Flywheel bolts', group:'accessory', qty:1, deps:['flywheel'], mesh:'flywheel',
      torque: is2jz ? { nm:49, angle:90, size:'flywheel bolt', count:8, pattern:{ kind:'star', count:8 },
                        stages:['49 N·m in sequence', '+90°'], lube:'new bolts (Toyota RM502U, BD-1); A/T drive plate: 83 N·m with adhesive 1324' } : undefined,
      teach:`${is2jz ? 'Eight bolts through the flywheel into the rear crank flange — 49 N·m then +90° on the manual car, 83 N·m with adhesive on the automatic drive plate (RM502U).' : 'Six to ten bolts through the flywheel into the rear crank flange, under the clutch.'} They are usually single-use and are tightened across the circle. Lock the ring gear while you work on them: the crank will turn otherwise.`,
      spec:{ 'Bolts': is2jz ? 8 : '8 shown (6–10 by engine)', 'Under':'the clutch disc and cover', 'Source': is2jz ? 'Toyota RM502U' : 'petrol.md §A [GEN]',
             ...(is2jz ? {} : { 'Torque':'per the maker’s manual — not in our sources' }) } });

    /* ---- crank pulley key ---- */
    const keyed = is2jz || e.id === 'v8-57-sb' || e.id === 'v8-70-bb'
               || (KEYED_JDM.has(e.maker) && e.class === 'car' && e.fuel !== 'diesel');
    if (keyed && !GM_PRESSFIT_DAMPER.has(e.id))
      out.push({ id:'crankkey', name: is2jz ? 'Pulley set key' : 'Crank pulley key (Woodruff)', group:'rotating', qty:1, deps:['crank'], mesh:'timing',
        teach:'A small key in a slot in the crank nose that locks the timing sprocket and the pulley to the crank in one angular position. It is what makes the timing marks mean anything. A sheared key lets the pulley slip round — the marks lie and the timing is wrong. (The LS/LT small block has none: its damper is a press fit.)',
        spec:{ 'Location':'crank nose keyway, under the pulley', 'Source': (is2jz || e.id === 'v8-57-sb' || e.id === 'v8-70-bb') ? 'petrol.md §A [FSM-2JZ / FSM]' : '[GEN] keyed Japanese pulley — check the manual' } });

    /* ---- crank pulley bolt ---- */
    const cbTorque = is2jz ? { nm:324, size:'crank bolt (SST hold)', count:1, pattern:{ kind:'single', count:1 }, stages:['324 N·m'], lube:'oil on threads and under the head (Toyota RM502U)' }
      : LS_GEN4.has(e.id) ? { nm:50, angle:140, size:'damper bolt', count:1, pattern:{ kind:'single', count:1 }, stages:['install the damper with an installer, not the bolt', 'new bolt: 50 N·m', '+140°'], tty:true, lube:'new TTY bolt (GM factory manual)' }
      : e.id === 'v8-57-sb' ? { nm:81, size:'balancer bolt', count:1, pattern:{ kind:'single', count:1 }, stages:['81 N·m (60 lb-ft)'], lube:'oil on threads' }
      : undefined;
    out.push({ id:'crankbolt', name:'Crank pulley bolt & washer', group:'accessory', qty:1, deps:['crankpulley'], mesh:'pulley',
      torque: cbTorque,
      teach:`The highest-torque fastener on most engines${is2jz ? ' — 324 N·m on the 2JZ, held with Toyota SST 09213-70010 + 09330-00021 and pulled with puller 09950-50010 (RM502U, TB-12)' : ''}. It clamps the damper, the timing sprocket and the oil-pump drive together against the crank nose. You need a holding tool on the pulley or the flywheel, never a screwdriver in the ring gear.`,
      spec:{ 'Qty':1, 'Source': is2jz ? 'Toyota RM502U' : (LS_GEN4.has(e.id) || e.id === 'v8-57-sb') ? 'petrol.md family 3 [FSM]' : '[GEN] — torque per the maker’s manual' } });
  }
  return out;
}
