/* valvetrain — extra parts for the tree. See js/data/extra/index.js.
 *
 * What the core tree bundles as "Valves, springs & retainers" and "Valve guides
 * & stem seals" is, in a factory parts list, five or six separate items per
 * valve. This module adds the ones that are missing as their own per-valve
 * pieces, the in-block cam hardware of the pushrod engines, the timing-drive
 * hardware between the sprockets, and gives the cam sensor and the half-moon
 * plugs (already in the tree) something to be.
 *
 * Sources (scratchpad/parts-research):
 *   2jz-manual.md  — Toyota RM502U (2JZ-GTE) EM-34 head disassembly, EM-15…18
 *                    timing belt, component table.
 *   petrol.md      — Section A per-valve rows; family 1 (chain I4: guides A/B +
 *                    tensioner arm; belt I4: belt + guide washer); family 3
 *                    (LS/SBC/BBC: cam bearings, thrust plate, lifter trays,
 *                    pushrod guide plates, rocker studs/bolts, valley cover).
 *   special.md     — follower types, gear-driven cam trains (F1, DFV, Cummins),
 *                    desmodromic and pneumatic valve closing, Cummins pedestals.
 */

/* The spec still says `camDrive:'chain'` for these, but they are belt engines
   (petrol.md audit #13 and family tables; special.md EA288 timing-belt row;
   the C30A's 90k-mile timing-belt service is the NSX's best-known job). */
const BELT_REAL = new Set(['i4-16-na', 'mazda-bp', 'nissan-rb26', 'f4-25-t', 'd-i4-20', 'honda-c30a']);
/* gear trains, no chain and no belt (special.md: "Gear-driven cam train — F1, DFV") */
const GEAR_CAMS = new Set(['race-16-v6h', 'ford-dfv']);
/* GM Gen III/IV/V small blocks: trays, valley cover, thrust plate, rocker bolts */
const LS = new Set(['v8-50-ohv', 'v8-62-sc']);
/* classic Chevrolet: pressed (SBC) or screw-in (BBC) rocker studs */
const STUD = { 'v8-57-sb':'pressed', 'v8-70-bb':'screw-in' };
/* the SBC 350 has iron heads with the seats cut into the casting (petrol.md
   Section A: "On iron heads (classic SBC/BBC) the seat is machined") — the L88
   427 ran aluminium heads, which is why it keeps its inserts */
const NO_SEAT_INSERTS = new Set(['v8-57-sb']);

export const beltDriven = (e) => e.camDrive === 'belt' || BELT_REAL.has(e.id);
export const gearDriven = (e) => e.camDrive === 'gear' || GEAR_CAMS.has(e.id);
export const isLS = (e) => LS.has(e.id);
export const studType = (e) => STUD[e.id] || null;
export const hasSeatInserts = (e) => !NO_SEAT_INSERTS.has(e.id);
export const desmo = (e) => e.follower === 'desmo' || e.valvetrain === 'desmodromic';
export const pneumatic = (e) => e.springs === 'pneumatic' || e.valvetrain === 'pneumatic';
/* Roller finger followers ride a hydraulic lash adjuster on road engines. Race
   and bike finger followers are solid and shimmed, and so are the 1LR-GUE's DLC
   tool-steel rockers (petrol.md family 4, Lexus press) and, as far as the
   research goes, the 9A1 GT3's. */
const SOLID_FINGERS = new Set(['toyota-1lr', 'porsche-9a1-gt3']);
export const finger = (e) => e.follower === 'finger' && e.cam !== 'OHV';
export const fingerHLA = (e) => finger(e) && (e.lash === 'hydraulic' || (e.class !== 'race' && e.class !== 'bike' && !SOLID_FINGERS.has(e.id)));
export const shaftRocker = (e) => e.follower === 'rocker' && e.cam !== 'OHV';
/* Which cams carry VTEC's third lobe: K20C1 exhaust only (petrol.md family 1);
   F20C and C30A switch both intake and exhaust. */
export const vtecSides = (e) => !(e.vvl && shaftRocker(e)) ? [] : e.id === 'i4-20-t' ? ['exhaust'] : ['intake', 'exhaust'];

/** In-block cam journals: one per main bulkhead on a vee. */
export const camJournals = (e) => (e.layout === 'V' ? e.cyl / 2 + 1 : e.cyl + 1);

export const instanced = [
  'springseats', 'retainers', 'guides', 'seats',
  'chainguides', 'cambearings', 'liftertrays', 'pushrodplates', 'rockerstuds',
  'halfmoon', 'fingers', 'hla', 'rockershafts', 'shaftrockers', 'vtecmid', 'vtecspool',
];

export function parts(e, ctx){
  if (!e || e.kind === 'rotary' || ctx?.rotary || !(e.valvesPerCyl > 0)) return [];
  const out = [];
  const add = (o) => out.push(o);
  const ohv = !!ctx.ohv, heads = ctx.heads || 1;
  const nV = e.cyl * e.valvesPerCyl;
  const is2JZ = e.id === 'i6-30-legend';
  const race = e.class === 'race';
  const fsm2jz = is2JZ ? { 'Source':'Toyota RM502U (2JZ-GTE) EM-34' } : {};

  /* ---------------- per valve ---------------- */
  add({ id:'guides', name:'Valve guides', group:'head', qty:nV, deps:['head'], mesh:'valve',
    teach:'A bronze or cast-iron sleeve pressed into the head, one per valve. It holds the stem square to its seat and carries most of the valve\'s heat out into the head. It is an interference fit: the head is heated and the old guide driven out, and the new one pressed in to a set height above the spring pocket. Intake and exhaust guides are different parts. A worn guide lets the valve rock, so the seat wears oval and oil runs down the stem.',
    spec:{ 'Fit':'press fit, head heated',
           'Stem-to-guide':'0.025–0.060 mm',
           ...(is2JZ ? { 'Protrusion':'IN 12.3–12.7 mm · EX 11.4–11.8 mm', 'Oversize':'STD / O/S 0.05' , ...fsm2jz } : {}) } });

  if (hasSeatInserts(e))
    add({ id:'seats', name:'Valve seat inserts', group:'head', qty:nV, deps:['head'], mesh:'valve',
      teach:`A hardened ring shrunk into the chamber roof where each valve closes. Aluminium is far too soft to take a valve hammering shut ${e.class==='race'?'at fifteen thousand rpm':'thousands of times a minute'}, so the seat is a separate ring of sintered steel or copper alloy. It is frozen and driven into a heated head, then cut to its angles in place. Seat width and where it touches the valve face decide how well the valve seals and how fast it sheds its heat.`,
      spec:{ 'Material': race ? 'copper-beryllium / sintered steel' : 'sintered hardened steel', 'Fit':'shrink fit',
             'Angles':'30° / 45° / 60° three-angle cut' } });

  if (ohv)   /* the core tree only adds stem seals on overhead-cam heads */
    add({ id:'stemseals', name:'Valve stem seals', group:'head', qty:nV, deps:['guides'], mesh:'valve',
      teach:'An umbrella or positive seal on the top of each guide, under the spring. It meters the oil that the rocker throws over the valve tips, leaving a film on the stem but not a flood. A new seal goes on the guide before the spring does. Hardened seals are the cause of the puff of blue smoke after a long idle.',
      spec:{ 'Type': race ? 'PTFE positive seal' : 'positive (Viton) or umbrella', 'Fit':'pressed over the guide boss' } });

  if (!desmo(e) && !pneumatic(e))
    add({ id:'springseats', name:'Valve spring seats', group:'valvetrain', qty:nV, deps:['guides'], mesh:'valve',
      teach:'A hardened steel washer under each valve spring. It stops the spring\'s end coil from cutting into the head as it turns and shuffles on every lift. On a rebuild it is easy to leave in the pocket and easy to lose, and fitting two by mistake changes the spring\'s installed height.',
      spec:{ 'Count':'1 per valve', 'Material':'hardened steel', 'Order':'valve → seat → spring → retainer → keepers', ...fsm2jz } });

  if (!desmo(e))
    add({ id:'retainers', name:'Spring retainers & keepers', group:'valvetrain', qty:nV, deps:['valves'], mesh:'valve',
      teach:`The retainer is the cap on top of the spring. The two keepers (collets) are split cones that lock it to a groove in the valve stem. To get a valve out, compress the spring and pick the two keepers out with a magnet. Fitting is the reverse. Then tap the stem tip lightly with a plastic hammer so the keepers seat. If a keeper is not seated, the valve drops into the cylinder.${pneumatic(e) ? ' Here the retainer carries the air-spring piston, not a steel spring.' : race ? ' Race retainers are titanium, because every gram over the spring is mass the spring has to stop.' : ''}`,
      spec:{ 'Keepers':'2 per valve', 'Retainer': race ? 'titanium' : 'steel',
             ...(is2JZ ? { 'Tool':'spring compressor SST 09202-70020', ...fsm2jz } : { 'Tool':'valve spring compressor' }) } });

  /* ---------------- cam followers that are not buckets ---------------- */
  if (finger(e)){
    const hla = fingerHLA(e);
    if (hla)
      add({ id:'hla', name:'Hydraulic lash adjusters', group:'valvetrain', qty:nV, deps:['head'], mesh:'lifter',
        teach:'A small oil-filled plunger in a bore in the head, one per valve. The domed top is the pivot that the finger follower rocks on. Oil pressure lifts the plunger until there is no lash at all, and a check ball holds it there, so valve clearance never needs setting. When the oil is old or low, or a check ball sticks, one bleeds down and you hear it as a tick at idle that fades as the oil warms up.',
        spec:{ 'Count':'1 per valve', 'Lash':'zero, self-adjusting', 'Fit':'slides into its bore; keep each in order' } });
    add({ id:'fingers', name:'Roller finger followers', group:'valvetrain', qty:nV,
      deps:[...(hla ? ['hla'] : ['head']), ...(desmo(e) ? ['valves'] : ['retainers'])], mesh:'rocker',
      teach: hla
        ? 'A short pressed-steel lever between the cam and the valve. One end pivots on a hydraulic lash adjuster, the other rests on the valve tip, and a needle-roller wheel in the middle runs on the cam lobe. Rolling instead of sliding cuts friction compared with a bucket. The lever ratio also gives more valve lift than the lobe has. They lift straight off once the cam is out, but each one goes back on the adjuster and valve it came from.'
        : `A lever between the cam and the valve with a roller or a hard-coated pad where the lobe runs. Here it pivots on a solid post, not a hydraulic adjuster, because a hydraulic adjuster cannot keep up at this engine's rpm.${e.id==='toyota-1lr'?' The 1LR-GUE\'s rockers are solid tool steel with a DLC (diamond-like carbon) coating.':''} Clearance is set with a shim at the valve tip, so lash has to be checked at the service interval.`,
      spec:{ 'Count':nV, 'Pivot': hla ? 'hydraulic lash adjuster' : 'solid post, shimmed', 'Contact':'needle roller on the lobe' } });
  }
  if (shaftRocker(e)){
    const sides = vtecSides(e);
    add({ id:'rockershafts', name:'Rocker shafts', group:'valvetrain', qty:ctx.cams, deps:['head'], mesh:'cam',
      teach:'A hollow steel shaft beside each camshaft, running through the cam holders. It is the pivot for the row of rocker arms, and it is also an oil gallery: pressurised oil inside it lubricates every rocker'+(sides.length ? ', and on a VTEC head a separate passage feeds the oil that pushes the locking pins across.' : '.')+' The holder bolts clamp the shafts and the cams together, so they come out with the cams.',
      spec:{ 'Shafts':ctx.cams, 'Location':'through the cam holders, parallel to each cam', 'Oil':'pressure-fed through the shaft bore' } });
    add({ id:'shaftrockers', name: sides.length ? 'Rocker arms (VTEC primary & secondary)' : 'Rocker arms', group:'valvetrain', qty:nV,
      deps:['rockershafts', 'retainers'], mesh:'rocker',
      teach:'Each rocker rides on the rocker shaft. The cam lobe pushes one end, and a screw adjuster at the other end presses on the valve tip. Lash is set with a feeler gauge, a screwdriver and a locknut, with the cam on its base circle. There are no shims and no cam removal, so checking valve clearance is a one-hour job.'+(sides.length ? ' On the VTEC side, the primary and secondary rockers drilled for the locking pins sit either side of the mid rocker.' : ''),
      spec:{ 'Count':nV, 'Adjuster':'screw + locknut at the valve end', 'Locknut':'~14–20 N·m (research [GEN] — verify in the Honda manual)' } });
    if (sides.length){
      add({ id:'vtecmid', name:'VTEC mid rockers & lost-motion assemblies', group:'valvetrain', qty:e.cyl * sides.length,
        deps:['rockershafts'], mesh:'rocker',
        teach:'Between each pair of rockers is a third, mid rocker that follows the tall high-rpm lobe. Below VTEC engagement it is not locked to anything, so it would flap and clatter. A spring-loaded lost-motion plunger in the head keeps it against its lobe. Above the switch point, oil pressure pushes a pin through all three rockers and locks them together, so both valves follow the tall lobe.',
        spec:{ 'Count':e.cyl * sides.length, 'VTEC side': sides.join(' + '), 'Locking':'oil-pressure pin through primary, mid and secondary rockers' } });
      add({ id:'vtecspool', name:'VTEC spool valve & pressure switch', group:'valvetrain', qty:ctx.heads, deps:['head'], mesh:'sensor',
        torque:{ nm:12, size:'M6', count:3 * ctx.heads, pattern:{ kind:'sequence', count:3 }, stages:['12 Nm'] },
        teach:'An ECU-switched solenoid and spool on the side of the head that sends oil to the rocker locking pins. Beside it is a pressure switch that tells the ECU the oil really got there. Its gasket includes a small filter screen. When that screen clogs, VTEC stops engaging and the engine goes flat at the top end.',
        spec:{ 'Bolts':'3 + gasket with screen', 'Torque':'12 N·m (Honda 6 mm flange-bolt standard)', 'Location':'side of the head, at the rear' } });
    }
  }

  /* ---------------- timing drive ---------------- */
  const belt = beltDriven(e);
  if (!ohv && !belt && !gearDriven(e))
    add({ id:'chainguides', name:'Chain guide rails', group:'timing', qty:2 * heads, deps:['timing'], mesh:'tensioner',
      teach:'Each cam chain runs between two rails. A fixed guide is bolted to the head and block on the tight side, and a pivoting tensioner arm on the slack side is pushed in by the tensioner. Both have nylon faces that the chain wears grooves into. The rattle on a cold start in the first second before oil pressure arrives comes from a worn arm or a tired tensioner. If a broken guide is left in place, the chain jumps a tooth.',
      spec:{ 'Per chain':'1 fixed guide + 1 tensioner arm', 'Chains':heads, 'Wear face':'nylon on a steel or alloy backbone',
             'Check':'groove depth in the face, cracks at the pivot' } });

  if (!ohv && belt){
    const sprockets = ctx.belt && !ohv;      // the core tree has cam pulleys and idlers only when the spec says belt
    add({ id:'timingbelt', name:'Timing belt', group:'timing', qty:1,
      deps:['crksprocket', ...(sprockets ? ['camsprockets', 'idlers'] : ['timing'])], mesh:'timing',
      teach:`A toothed rubber belt with glass-fibre cords. It runs over the crank pulley, ${ctx.cams} cam pulley${ctx.cams>1?'s':''}, the idler and the tensioner. It never stretches the way a chain does. It just ages, and then it lets go all at once.${(e.interference ?? (e.cr > 10.5 || ctx.boosted)) ? ' This is an interference engine, so a snapped belt means bent valves.' : ''} If you are re-using a belt, draw an arrow on it for the direction of rotation and matchmark it to the pulleys. Then turn the crank two full turns by hand and check every mark comes back.`,
      spec:{ 'Material':'HNBR, glass-fibre cords', 'Rule':'replace with the idler and tensioner, never oil it', ...(is2JZ ? { 'Check':'between the crank pulley and the exhaust cam pulley', 'Source':'Toyota RM502U EM-15…18' } : {}) } });
    /* the 2JZ's guide and plate come from the supra2jz module (tbguide, tbplate) */
    if (!is2JZ) add({ id:'beltguide', name:'Timing belt guide (crank)', group:'timing', qty:1, deps:['timingbelt'], mesh:'timing',
      teach:'A thin dished washer on the crank nose, in front of the crank timing pulley. It stops the belt walking forward off the pulley. Fit it with the cupped side facing out. If it goes on the wrong way round, the belt edge climbs it and frays.',
      spec:{ 'Fit':'cup side outward', ...(is2JZ ? { 'Source':'Toyota RM502U EM-15 (TB-14)' } : {}) } });
  }

  /* ---------------- in-block cam (pushrod engines) ---------------- */
  if (ohv && e.layout === 'V' && !ctx.airCooled)
    add({ id:'cambearings', name:'Cam bearings', group:'block', qty:camJournals(e), deps:['block'], mesh:'mainbearing',
      teach:'The in-block cam does not run in the bare block. It runs in a row of pressed-in bearing shells, one at each bulkhead. They go in with a driver on a long bar, and each one\'s oil hole has to line up with its oil passage. If one is turned, the cam and the lifters above it starve.',
      spec:{ 'Journals':camJournals(e), 'Fit':'pressed, installer tool', 'Check':'oil holes aligned with the galleries' } });

  if (ohv && isLS(e)){
    add({ id:'camthrust', name:'Cam retainer (thrust) plate', group:'block', qty:1, deps:['cam'], mesh:'frontcover',
      torque:{ nm:25, size:'M8', count:4, pattern:{ kind:'sequence', count:4 }, stages:['25 Nm'], lube:'threadlocker' },
      teach:'A steel plate bolted to the front of the block over the cam\'s front journal. It locates the cam fore and aft. A helical cam drive and the sprocket both push the cam along its axis, and this plate takes that load. The classic SBC and BBC have no plate; there the timing cover or a cam button stops the cam walking.',
      spec:{ 'Bolts':'4', 'Torque':'~25 N·m (research [GEN] — verify against the GM manual)', 'Engines':'LS / LT' } });
    add({ id:'liftertrays', name:'Lifter guide trays', group:'valvetrain', qty:4, deps:['lifters'], mesh:'lifter',
      torque:{ nm:12, size:'M6', count:4, pattern:{ kind:'sequence', count:4 }, stages:['12 Nm'] },
      teach:'Plastic trays that hold the roller lifters in pairs so they cannot turn in their bores. A roller lifter has to stay square to the lobe. If it turns, the wheel skids sideways across the cam and wipes both out in minutes. Each tray holds four lifters and is held down by one bolt in the valley. Lift the lifters out with the tray, and keep each set in its own bore.',
      spec:{ 'Trays':4, 'Lifters per tray':4, 'Bolt':'1 each, ~12 N·m' } });
    add({ id:'valleycover', name:'Valley cover & gasket', group:'block', qty:1, deps:['liftertrays'], mesh:'valvecover',
      teach:'A flat plate that closes the top of the lifter valley under the intake manifold. On a Gen III LS the knock sensors sit under it, and on the LT4 the cam-driven high-pressure fuel pump sits on it. The SBC and BBC have no valley cover, because the intake manifold itself is the roof of the valley.',
      spec:{ 'Bolts':'~10', 'Gasket':'moulded rubber in a steel carrier', 'Engines':'LS / LT only' } });
  }

  if (ohv && studType(e) === 'screw-in')
    add({ id:'pushrodplates', name:'Pushrod guide plates', group:'valvetrain', qty:e.cyl, deps:['head'], mesh:'rocker',
      teach:'A hardened steel plate under each pair of rocker studs, with a slot for each pushrod. A stud-mounted rocker has nothing locating it sideways, so the plate does that job by holding the pushrod. You can see the pushrods polish their slots. A pushrod that wears through its plate has been running at the wrong angle the whole time.',
      spec:{ 'Plates':e.cyl, 'Clamped by':'the rocker studs', 'Engines':'BBC (L88), performance SBC' } });

  if (ohv && (isLS(e) || studType(e) || e.id === 'd-i6-67')){
    const kind = isLS(e) ? 'bolt' : e.id === 'd-i6-67' ? 'pedestal' : 'stud';
    const per = kind === 'pedestal' ? e.cyl : e.cyl * 2;
    add({ id:'rockerstuds',
      name: kind === 'bolt' ? 'Rocker arm bolts & pedestals' : kind === 'pedestal' ? 'Rocker pedestals & hold-down bolts' : 'Rocker studs, pivot balls & adjusting nuts',
      group:'valvetrain', qty:per,
      deps: ['rockers', ...(studType(e) === 'screw-in' ? ['pushrodplates'] : [])], mesh:'rocker',
      ...(kind === 'bolt' ? { torque:{ nm:30, size:'M8', count:per, pattern:{ kind:'sequence', count:per }, stages:['30 Nm'], lube:'oil on threads' } }
        : studType(e) === 'screw-in' ? { torque:{ nm:68, size:'7/16″ stud', count:per, pattern:{ kind:'sequence', count:per }, stages:['68 Nm (50 lb-ft)'], lube:'sealant on the water-jacket threads' } }
        : {}),
      teach: kind === 'bolt'
        ? 'Each LS rocker pivots on a trunnion bearing that sits in a cast pedestal on the head, one pedestal to each pair of rockers. A single M8 bolt holds rocker, trunnion and pedestal down. There is no adjuster. With the lifter on its cam base circle, tightening the bolt to 30 N·m pushes the hydraulic lifter down and sets its preload. Turn the crank so each lifter is on the base circle before you tighten its bolt. If you tighten it on the lobe, you bend a pushrod.'
        : kind === 'pedestal'
        ? 'On the Cummins each cylinder\'s intake and exhaust rocker levers share one pedestal on the head, held by one bolt, with no long rocker shaft. Each rocker presses on a crosshead that opens a pair of valves. Lift the pedestal and its two rockers off as one unit, and keep them in order.'
        : `Each rocker rocks on a pivot ball on a stud, held down by an adjusting nut. Lash is set with the nut, not a shim: with the lifter on its base circle, run the nut down to zero lash, then a further half to three-quarters of a turn for hydraulic lifters.${studType(e)==='pressed' ? ' The stock studs are pressed into the head, and heavy springs can pull them out. That is why racers tap the head and fit screw-in studs.' : ' These are screw-in studs, torqued into the head, and they also clamp the pushrod guide plates.'}`,
      spec: kind === 'bolt' ? { 'Bolts':per, 'Size':'M8', 'Torque':'30 N·m (22 lb-ft) [GM FSM]', 'Adjustment':'none — preload set by the bolt' }
          : kind === 'pedestal' ? { 'Pedestals':per, 'Carries':'intake + exhaust rocker of one cylinder' }
          : { 'Studs':per, 'Type':studType(e), 'Lash':'zero + ½–¾ turn (hydraulic)' } });
  }
  return out;
}
