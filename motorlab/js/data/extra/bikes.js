/* bikes — the motorcycle drivetrain the car tree does not have.
 *
 * A bike engine is a power unit: crank, primary drive, clutch and gearbox in
 * one set of cases (unit construction), with the generator on the end of the
 * crank instead of on a belt. Everything here is gated on e.class === 'bike'
 * and on the engine itself, because the seven bikes are not one design:
 *   - CBR1000RR, Street Triple 765, Bonneville 900, CRF450R, Desmosedici V4:
 *     gear primary, wet multi-plate clutch on the RIGHT, generator on the LEFT
 *     crank end, countershaft sprocket on the LEFT.
 *   - Sportster Evolution 1200: chain primary and clutch in a primary case on
 *     the LEFT, four gear-driven cams in a cam chest on the RIGHT, dry sump.
 *   - R1200 Hexhead (air/oil): car-style dry single-plate clutch on the back
 *     of the crank and a SEPARATE 6-speed gearbox bolted behind it.
 * Source: scratchpad/parts-research/special.md §3 (3a shared drivetrain,
 * 3b Ducati desmo, 3c Harley Sportster Evo, 3d BMW Hexhead).
 *
 * Model frame (see js/build/extra/bikes.js): crank on X, so a transverse
 * bike's LEFT side is +X and RIGHT side −X; the gearbox lies behind the crank
 * (−Z, the intake side) and below it. On the longitudinal BMW, front is −X.
 */

/* Per-engine drivetrain facts. S = gear pairs (special.md 3a "Gear pairs").
 * Plate pairs and spring counts are per-model and the research marks them
 * [verify counts]: research gives ~8–10 friction / ~7–9 steel and 5–6 coil
 * springs, so the numbers below stay inside those ranges. */
const SPEC = {
  'm-i4-1000':    { make:'honda',   S:6, pairs:9, springs:6, slipper:'Slipper / assist cam set', starterClutch:true,
                    primary:'gear', ratio:1.72, rCl:66, sep:70, mainUp:25, sprocketT:16, rotorR:50 },
  'm-v4-1100':    { make:'ducati',  S:6, pairs:9, springs:6, slipper:'Slipper / self-servo ramp set', starterClutch:false,
                    primary:'gear', ratio:1.80, rCl:68, sep:72, mainUp:20, sprocketT:16, rotorR:52 },
  'm-triple-765': { make:'triumph', S:6, pairs:8, springs:6, slipper:'Slip-assist ramp set', starterClutch:true,
                    primary:'gear', ratio:1.85, rCl:62, sep:66, mainUp:20, sprocketT:16, rotorR:48 },
  'm-ptwin-900':  { make:'triumph', S:5, pairs:7, springs:6, slipper:'Torque-assist ramp set', starterClutch:true,
                    primary:'gear', ratio:1.70, rCl:64, sep:70, mainUp:12, sprocketT:17, rotorR:52 },
  'm-single-450': { make:'honda',   S:5, pairs:8, springs:6, slipper:null, starterClutch:true,
                    primary:'gear', ratio:2.70, rCl:60, sep:62, mainUp:10, sprocketT:13, rotorR:44 },
  'm-vtwin-1200': { make:'harley',  S:5, pairs:8, springs:0, slipper:null, starterClutch:false,
                    primary:'chain', ratio:1.55, rCl:70, sep:64, mainUp:-5, sprocketT:29, rotorR:58, cd:190 },
  'm-flat2-1200': { make:'bmw',     S:6, dry:true },
};
const DEFAULT = { make:'other', S:6, pairs:8, springs:6, slipper:null, starterClutch:true,
                  primary:'gear', ratio:1.8, rCl:64, sep:68, mainUp:15, sprocketT:16, rotorR:48 };

/** The drivetrain spec for a bike, shared with the geometry module. */
export function bikeSpec(e){
  if (!e || e.class !== 'bike' || e.kind === 'rotary') return null;
  const s = { ...DEFAULT, ...(SPEC[e.id] || {}) };
  /* an engine spec may carry its own ratios — trust it over the table */
  if (Array.isArray(e.gears) && e.gears.length) s.S = e.gears.length;
  else if (Number.isFinite(e.gears) && e.gears > 0) s.S = Math.round(e.gears);
  /* the spec's own drivetrain fields win over the table (engines.js:
     gearbox 'integrated' | 'separate', clutch 'wet' | 'dry') */
  if (e.gearbox === 'separate' || e.clutch === 'dry') s.dry = true;
  s.harley = s.make === 'harley';
  s.bmw = !!s.dry;
  return s;
}

/* Cover-bolt torque by make. Only the M6 cover and spring bolts carry a
 * figure; the big staked nuts (clutch centre, primary gear, rotor) vary by
 * model year and are left to the FSM in the spec text rather than guessed. */
const M6 = {
  honda:   { nm:12, src:'Honda FSM standard-torque table: 6 mm flange bolt 12 N·m' },
  ducati:  { nm:10, src:'Ducati general torque table: M6 10 N·m ±10%' },
  triumph: { nm:10, src:'M6 into aluminium, typical — confirm in the Triumph FSM' },
  harley:  { nm:11, src:'Harley primary/cam cover screws 80–110 in·lb (9–12 N·m)' },
  bmw:     { nm:10, src:'M6 into aluminium, typical — confirm in the BMW RSD' },
  other:   { nm:10, src:'M6 into aluminium, typical' },
};

export const instanced = ['gears', 'shiftforks', 'clutchplates', 'clutchsprings',
                          'desmorockers', 'tappetblocks'];

export function parts(e, ctx){
  const s = bikeSpec(e);
  if (!s) return [];
  const out = [];
  const add = (o) => out.push(o);
  const t6 = M6[s.make] || M6.other;
  const perim = (count, extra = {}) => ({ nm:t6.nm, size:'M6', count, pattern:{ kind:'perimeter', count },
                                          stages:[`${t6.nm} N·m`], lube:'clean dry threads', ...extra });
  const gearbox = s.bmw ? 'the separate gearbox' : 'the crankcases';

  /* ---------------- gearbox (all) ---------------- */
  add({ id:'mainshaft', name: s.bmw ? 'Gearbox input shaft' : 'Gearbox mainshaft (input)', group:'accessory',
    deps:['block'], mesh:'cam',
    teach: s.bmw
      ? 'The input shaft of the separate gearbox, splined into the dry clutch disc. It is hollow: the clutch pushrod runs right through it from the slave cylinder at the back of the box to the pressure plate at the front.'
      : `The input shaft of the gearbox, lying parallel to the crank behind it in ${gearbox}. It carries the clutch on its ${s.harley ? 'left' : 'right'}-hand end and the driving gear of every ratio along its length. Some of those gears are fixed to it, some spin freely on bushes, and some slide along its splines — the sliding ones are what the shift forks push.`,
    spec:{ 'Runs in':'ball bearing one end, needle or ball the other', 'Location': s.bmw ? 'in the gearbox, coaxial with the crank' : 'behind the crank, in the cases', 'Src':'special.md 3a/3d · PD H' } });

  add({ id:'countershaft', name: s.bmw ? 'Gearbox output shaft' : 'Countershaft (output)', group:'accessory',
    deps:['block'], mesh:'cam',
    teach: s.bmw
      ? 'The output shaft takes the selected ratio to the back of the gearbox, where the drive leaves for the shaft drive and bevel box at the rear wheel. There is no sprocket and no chain anywhere on this bike.'
      : `The output shaft, below and behind the mainshaft. Its ${s.harley ? 'right' : 'left'}-hand end comes out through a lip seal to the final-drive ${s.harley ? 'belt pulley' : 'sprocket'}. Each mainshaft gear meshes permanently with a partner on this shaft; selecting a gear just locks one partner to its shaft with dogs.`,
    spec:{ 'Final drive': s.bmw ? 'shaft' : s.harley ? 'belt, right side' : 'chain, left side', 'Src':'special.md 3a · PD H' } });

  add({ id:'gears', name:`Gear pairs (${s.S}-speed, main + counter)`, group:'accessory', qty:s.S,
    deps:['mainshaft', 'countershaft'], mesh:'timing',
    teach:`A constant-mesh sequential box: ${s.S} pairs of gears, ${2 * s.S} gears in all, always in mesh. Nothing slides into mesh — a dog gear slides sideways and its dogs lock a free-spinning gear to its shaft. That is why a bike shifts in a click and why rounded dogs make it jump out of gear under load. Teeth are straight-cut on most bikes; the R1200 uses helical gears for noise.`,
    spec:{ 'Pairs':s.S, 'Gears':2 * s.S, 'Engagement':'dog clutches, constant mesh', 'Src':'special.md 3a "Gear pairs" · PD H/M' } });

  add({ id:'shiftdrum', name:'Shift drum, neutral switch & detent star', group:'accessory',
    deps:['block'], mesh:'cam',
    teach:'A drum with zig-zag grooves cut round it. Each shift fork has a pin riding in a groove, so turning the drum one step moves the forks to the next gear. The star on the end of the drum and the spring-loaded detent (stopper) arm that drops between its points are what make each gear — and neutral — click into place. The neutral switch and gear-position sensor read the drum.',
    spec:{ 'Neutral switch':'1', 'Gear-position sensor':'1', 'Location':'below the gear shafts, across the case', 'Src':'special.md 3a · PD H' } });

  add({ id:'shiftforks', name:'Shift forks', group:'accessory', qty:3,
    deps:['shiftdrum', 'gears'], mesh:'rocker',
    teach:'Three forks on fork shafts, each with a pin in a drum groove and two fingers in the groove of a sliding dog gear. Bent or blued fork fingers are the classic cause of a box that jumps out of one gear — check finger thickness and the matching groove width whenever the cases are split.',
    spec:{ 'Forks':3, 'Check':'finger thickness and groove width against the FSM limits', 'Src':'special.md 3a · PD M' } });

  add({ id:'shiftshaft', name:'Gearshift spindle, ratchet & detent arm', group:'accessory',
    deps:['shiftdrum'], mesh:'cam',
    teach:'The shift lever turns this spindle. A ratchet arm on its far end indexes the drum one step and a return spring centres it again, so every stroke of the lever is exactly one gear. The spindle exits on the left, through its own oil seal.',
    spec:{ 'Return spring':'1', 'Detent (stopper) arm & spring':'1 each', 'Exits':'left side', 'Src':'special.md 3a · PD H' } });

  /* ---------------- BMW: dry clutch + separate gearbox ---------------- */
  if (s.bmw){
    /* the car-style dry clutch on the back of the crank (special.md 3d) */
    add({ id:'clutchhousing', name:'Clutch housing (flywheel) & starter ring gear', group:'accessory',
      deps:['crank'], mesh:'flywheel',
      teach:'On the air/oil boxer the clutch is a car clutch: a housing bolted to the back of the crankshaft carries the starter ring gear and is the face the friction disc is clamped against. The crank runs along the bike, so this sits at the back of the engine, between it and the gearbox.',
      spec:{ 'Type':'dry, single plate', 'Location':'rear of the crank', 'Bolts':'per RSD, thread-locked', 'Src':'special.md 3d · M' } });
    add({ id:'clutchdisc', name:'Dry clutch friction disc', group:'accessory', deps:['clutchhousing'], mesh:'clutch',
      teach:'One friction disc, splined onto the gearbox input shaft, running dry. Gearbox or engine oil reaching it — a leaking input-shaft or rear-main seal — makes it grab and judder, and the cure is the seal and a new disc. The tree\'s "wet multi-plate" wording does not apply to this generation.',
      spec:{ 'Plates':'1', 'Runs':'dry', 'Splined to':'gearbox input shaft', 'Src':'special.md 3d · M' } });
    add({ id:'drypressureplate', name:'Pressure plate & diaphragm spring', group:'accessory', deps:['clutchdisc'], mesh:'clutch',
      teach:'A diaphragm spring clamps the disc between the pressure plate and the housing. The pushrod from the slave cylinder comes forward through the hollow input shaft and presses on the spring\'s centre to release it.',
      spec:{ 'Spring':'diaphragm', 'Release':'pushrod through the input shaft', 'Src':'special.md 3d · M' } });
    add({ id:'gearboxhousing', name:'Gearbox housing (separate 6-speed)', group:'accessory',
      deps:['gears', 'shiftforks', 'shiftshaft', 'drypressureplate'], mesh:'flywheel',
      teach:'On the air/oil R1200 the gearbox is not in the crankcase. It is its own aluminium box, with its own oil, bolted to the back of the engine like a car gearbox — the dry clutch sits between the two. The integrated wet-clutch gearbox only arrived with the water-cooled R1200 in 2013. Pull this housing and the clutch is in front of you.',
      spec:{ 'Speeds':6, 'Oil':'separate gearbox oil', 'Clutch':'dry single-plate, in front of it', 'Bolts':'per RSD', 'Src':'special.md 3d · PRESS H' } });
    add({ id:'clutchslave', name:'Hydraulic clutch slave & pushrod', group:'accessory',
      deps:['gearboxhousing'], mesh:'clutch',
      teach:'A hydraulic slave cylinder on the back of the gearbox pushes a long rod forward through the hollow input shaft to release the dry clutch. Air in that line or a weeping slave seal and the clutch drags — the bike creeps in gear with the lever pulled.',
      spec:{ 'Release':'hydraulic, pushrod through the input shaft', 'Src':'special.md 3d · M' } });
    /* the alternator on its ELAST belt at the top front (special.md 3d) */
    add({ id:'topalternator', name:'Alternator (top front)', group:'accessory', deps:['block'], mesh:'alternator',
      teach:'The boxer is the one bike here with a car-type alternator: it sits on top of the crankcase at the front, above the crank, driven by a short belt off the front of the crankshaft. Everything else in this garage makes its electricity with a stator and a magnet rotor on the end of the crank.',
      spec:{ 'Location':'top front of the crankcase', 'Drive':'poly-V belt from the crank', 'Src':'special.md 3d · PRESS(largiader) H' } });
    add({ id:'altbelt', name:'Alternator belt (ELAST 4PK592) & crank pulley', group:'accessory',
      deps:['topalternator', 'frontcover'], mesh:'pulley',
      teach:'A stretch ("ELAST") poly-V belt with no tensioner and no adjustment. It is fitted by walking it onto the pulley with a tool while the engine is turned, and it is cut off to remove it — it is never re-used. A slipping belt here shows up as a charge light, not a squeal.',
      spec:{ 'Belt':'ELAST 4PK592, non-adjustable', 'Tensioner':'none', 'Fitting':'walked on with a tool; replace, never re-fit', 'Src':'special.md 3d · PRESS(largiader) H' } });
    add({ id:'beltcover', name:'Front engine cover (belt cover)', group:'accessory', deps:['altbelt'], mesh:'frontcover',
      torque: perim(8, { src:t6.src }),
      teach:'The cover on the nose of the engine over the alternator belt and pulleys. It is the first thing off for a belt change, and it is what the front of the engine looks like from the rider\'s seat.',
      spec:{ 'Location':'front', 'Torque src':t6.src, 'Src':'special.md 3d · M' } });
    return out;
  }

  /* ---------------- primary drive ---------------- */
  if (s.primary === 'gear')
    add({ id:'primarygear', name:'Primary drive gear (crank)', group:'accessory', deps:['crank'], mesh:'timing',
      teach:'A straight-cut gear on the right-hand end of the crank, meshing with the big driven gear on the back of the clutch basket. It is the first reduction between crank and wheel, and because it is straight-cut it whines. The nut holding it is one of the tightest on the engine — hold the crank with a gear-holder wedged between the two gears, never through the clutch.',
      spec:{ 'Location':'right crank end, under the clutch cover', 'Nut':'staked or thread-locked; torque per FSM', 'Src':'special.md 3a · PD H' } });

  if (s.harley){
    add({ id:'stator', name:'Stator (primary case)', group:'accessory', deps:['crank'], mesh:'alternator',
      teach:'On the Sportster the charging system lives in the primary case: the stator bolts to the left crankcase and the magnet rotor rides on the engine sprocket around it. It runs in primary oil, which is what cools it.',
      spec:{ 'Location':'left, inside the primary case', 'Src':'special.md 3c · M' } });
    add({ id:'genrotor', name:'Alternator rotor (on the engine sprocket)', group:'accessory', deps:['stator'], mesh:'flywheel',
      teach:'A ring of magnets that spins round the stator. Lose a magnet off the inside and it chews the stator windings — look for metal stuck to the stator whenever the primary is open.',
      spec:{ 'Location':'left crank (sprocket) shaft', 'Src':'special.md 3c · M' } });
    add({ id:'compensator', name:'Engine sprocket & compensator', group:'accessory', deps:['genrotor'], mesh:'timing',
      teach:'The engine sprocket on the left sprocket shaft with a ramp-and-spring compensator behind its nut. The ramps let the sprocket wind back a few degrees against the spring on each big-twin power pulse, so the primary chain and the gearbox do not take the hammer blows directly.',
      spec:{ 'Location':'left sprocket shaft, inside the primary case', 'Nut':'per FSM', 'Src':'special.md 3c · M' } });
  }

  /* ---------------- wet multi-plate clutch ---------------- */
  add({ id:'clutchbasket', name: s.harley ? 'Clutch basket, primary sprocket & starter ring gear' : 'Clutch basket (outer) & primary driven gear',
    group:'accessory', deps: s.primary === 'gear' ? ['mainshaft', 'primarygear'] : ['mainshaft'], mesh:'flywheel',
    teach: s.harley
      ? 'The outer drum the friction plates key into. On the Sportster it carries the primary chain sprocket and the starter ring gear — the starter turns the engine through the primary chain. It spins freely on the mainshaft; only the clamped plate pack makes it drive.'
      : 'The outer drum the friction plates key into, riveted to the big primary driven gear that the crank turns. Rubber or spring cush dampers between gear and basket soak up primary-drive shock. Notches worn into its fingers by the friction-plate tangs make the lever feel notchy — file them, or replace the basket.',
    spec:{ 'Driven by': s.harley ? 'primary chain' : 'crank primary gear', 'Damping':'cush rubbers or springs', 'Src':'special.md 3a/3c · PD H' } });

  if (s.harley)
    add({ id:'primarychain', name:'Primary chain & adjuster shoe', group:'accessory', deps:['compensator', 'clutchbasket'], mesh:'timing',
      teach:'A multi-row chain from the engine sprocket to the clutch basket, held taut by an adjuster shoe underneath it. Check free play through the inspection cover with the engine cold, at the tightest point of the chain. The primary runs in its own oil, separate from the engine, and on a Sportster the gearbox shares it.',
      spec:{ 'Location':'left, inside the primary case', 'Rows':'3-row on the Sportster [verify]', 'Src':'special.md 3c · M' } });

  add({ id:'clutchhub', name:'Clutch inner hub (centre)', group:'accessory', deps:['clutchbasket'], mesh:'clutch',
    teach:'The centre hub is splined to the mainshaft and the steel plates key onto it. It is held by a lock nut that is staked into a slot in the shaft — un-stake it before you undo it, and use a new nut. Hold the hub with a clutch holder, not by jamming the gears.',
    spec:{ 'Hub nut':'staked, single-use; torque per FSM', 'Src':'special.md 3a · PD H' } });

  add({ id:'clutchplates', name:'Clutch plate pairs (friction + steel)', group:'accessory', qty:s.pairs,
    deps:['clutchhub'], mesh:'clutch',
    teach:`Friction plates (tangs on the outside, into the basket) alternate with plain steel plates (teeth on the inside, onto the hub). Clamped together, the pack locks basket to hub; let the clamp off and they slip past one another in oil. Soak new friction plates in the engine oil before fitting, and never use a car oil with friction modifiers — it makes the pack slip. Measure friction plate thickness and steel plate warp against the FSM limits.`,
    spec:{ 'Pairs (this model)':`${s.pairs} [verify counts against the parts fiche]`, 'Research range':'~8–10 friction, ~7–9 steel', 'Runs in':'engine oil (wet)', 'Src':'special.md 3a · PD M' } });

  if (s.slipper)
    add({ id:'slipper', name:s.slipper, group:'accessory', deps:['clutchplates'], mesh:'clutch',
      teach:'Two sets of ramps between the hub and the pressure plate. Under drive they pull the pressure plate in harder (the "assist" — lighter springs, lighter lever). Under hard engine braking the back wheel tries to drive the engine, the ramps ride up and back the plates off, so the clutch slips instead of the tyre hopping on a downshift.',
      spec:{ 'Function':'assist under drive, slip under back-torque', 'Src':'special.md 3a "Slipper / assist ramps" · PRESS M' } });

  add({ id:'pressureplate', name:'Clutch pressure plate & lifter', group:'accessory',
    deps: s.slipper ? ['clutchplates', 'slipper'] : ['clutchplates'], mesh:'clutch',
    teach:'The outermost plate of the stack. The springs push it in to clamp the pack; the lifter rod and bearing pull it out when you squeeze the lever. A bearing that grinds with the lever pulled in is this release bearing.',
    spec:{ 'Release':'lifter rod and bearing through the cover or the mainshaft', 'Src':'special.md 3a · PD H/M' } });

  add({ id:'clutchsprings', name: s.springs ? 'Clutch springs & bolts' : 'Clutch diaphragm spring', group:'accessory',
    qty: Math.max(1, s.springs), deps:['pressureplate'], mesh:'clutch',
    torque: s.springs ? { nm:t6.nm, size:'M6', count:s.springs, pattern:{ kind:'star', count:s.springs },
                          stages:['finger tight', `${t6.nm} N·m`], lube:'clean dry threads', src:t6.src } : undefined,
    teach: s.springs
      ? `Coil springs on bolts through the pressure plate. Tighten them a turn at a time in a criss-cross until they bottom — pull one down alone and the pressure plate cocks and cracks. Measure free length every time: a short spring is a slipping clutch.`
      : 'From 1991 the Sportster clamps its pack with a single diaphragm spring instead of coil springs. It needs a compressor tool to remove and refit, and it is what gives the Evo its relatively light lever.',
    spec: s.springs ? { 'Springs':s.springs, 'Research range':'5–6 coil springs', 'Check':'free length against the FSM limit', 'Torque src':t6.src, 'Src':'special.md 3a · PD M' }
                    : { 'Spring':'1 diaphragm (1991+)', 'Src':'special.md 3a "Clutch springs" · PD M' } });

  /* ---------------- covers ---------------- */
  if (s.harley){
    add({ id:'primarycover', name:'Primary cover, derby & inspection covers', group:'accessory',
      deps:['primarychain', 'clutchsprings'], mesh:'frontcover',
      torque: perim(14, { src:t6.src }),
      teach:'The big left-hand case over the primary chain, compensator, charging system and clutch. The round derby cover in the middle gives you the clutch adjuster; the inspection cover lets you check primary chain play. It holds primary oil, so it has a gasket and a drain plug of its own.',
      spec:{ 'Side':'left', 'Holds':'primary/gearbox oil', 'Torque src':t6.src, 'Src':'special.md 3c · M' } });
  } else {
    add({ id:'clutchcover', name:'Clutch cover (right crankcase cover) & gasket', group:'accessory',
      deps: s.primary === 'gear' ? ['clutchsprings', 'primarygear'] : ['clutchsprings'], mesh:'frontcover',
      torque: perim(14, { src:t6.src }),
      teach:'The right-hand engine cover over the clutch and the primary drive. It is full of oil on the inside, so drain the engine or lay the bike on its left side before you pull it, and fit a new gasket — the dowels locate it, not the bolts. Note where the different-length bolts came from.',
      spec:{ 'Side':'right', 'Bolts':'perimeter M6, different lengths', 'Torque src':t6.src, 'Src':'special.md 3a "Clutch cover with gasket" · PD H' } });

    /* ---------------- left side: starter clutch, generator ---------------- */
    if (s.starterClutch){
      add({ id:'starterclutch', name:'Starter clutch (one-way sprag) & driven gear', group:'accessory', deps:['crank'], mesh:'flywheel',
        teach:'A one-way clutch bolted to the back of the alternator rotor. The starter turns its driven gear and the sprags lock it to the rotor, so the starter can drive the crank — but the moment the engine fires and overruns, the sprags let go and the engine can never drive the starter. A worn one slips and whirrs on cold starts.',
        spec:{ 'Location':'behind the alternator rotor on the crank', 'Bolts':'to the rotor, thread-locked', 'Src':'special.md 3a · PD H' } });
      add({ id:'starteridler', name:'Starter idle / reduction gear', group:'accessory', deps:['starterclutch'], mesh:'timing',
        teach:'The reduction gear between the starter motor pinion and the starter clutch driven gear. It multiplies the little motor\'s torque so it can spin a high-compression engine over.',
        spec:{ 'Gears':'1–2 by model', 'Src':'special.md 3a "Starter motor and reduction gears" · PD M' } });
    }
    add({ id:'genrotor', name:'Alternator rotor (flywheel)', group:'accessory',
      deps: s.starterClutch ? ['starterclutch'] : ['crank'], mesh:'flywheel',
      teach:'A steel cup with magnets bonded inside, on the taper on the left-hand end of the crank. It is all the flywheel a bike has. It comes off with a threaded puller in the centre, never with a hammer — the magnets crack. The taper must be clean and dry; oil on the taper lets it slip and shear the key.',
      spec:{ 'Location':'left crank end, on a taper', 'Removal':'rotor puller', 'Bolt':'per FSM', 'Src':'special.md 3a · PD H' } });
    add({ id:'stator', name:'Stator & pick-up (CKP) coil', group:'accessory', deps:['genrotor'], mesh:'alternator',
      teach:'The fixed coils inside the rotor. They are bolted to the inside of the left cover, so the stator comes off with the cover. Three yellow wires go to the regulator-rectifier; test phase-to-phase resistance and insulation to earth. This is the bike\'s whole charging system — the car tree\'s belt-driven alternator does not exist here.',
      spec:{ 'Output':'three-phase AC to a regulator-rectifier', 'Bolts':'3–4', 'Src':'special.md 3a "Stator and pick-up coil" · PD H' } });
    add({ id:'statorcover', name:'Generator (left) cover & gasket', group:'accessory',
      deps: s.starterClutch ? ['stator', 'starteridler'] : ['stator'], mesh:'frontcover',
      torque: perim(10, { src:t6.src }),
      teach:'The left-hand engine cover. The rotor\'s magnets pull on the stator inside it, so it comes away with a jerk — and the stator wiring is still attached. Use a new gasket and do not trap the wiring grommet.',
      spec:{ 'Side':'left', 'Carries':'stator', 'Torque src':t6.src, 'Src':'special.md 3a "Alternator / generator cover" · PD H' } });
  }

  /* ---------------- final drive ---------------- */
  add({ id:'frontsprocket', name: s.harley ? 'Transmission belt pulley' : 'Countershaft (front) sprocket', group:'accessory',
    deps:['countershaft'], mesh:'timing',
    teach: s.harley
      ? 'The final-drive pulley on the end of the transmission output, driving the toothed belt to the rear wheel. On the Sportster it is on the right-hand side, the opposite side from the primary.'
      : 'The front sprocket on the left end of the countershaft, held by a nut or bolt with a lock washer. One tooth here changes the overall gearing as much as about three at the back. Change it with the chain and the rear sprocket — a new chain on worn sprockets is worn within a few hundred kilometres.',
    spec: s.harley ? { 'Side':'right (Sportster) [verify — Big Twins are left]', 'Src':'special.md 3a · PD H, side corrected for the Sportster' }
                   : { 'Teeth':`~${s.sprocketT} (model dependent)`, 'Side':'left', 'Fixing':'nut or bolt + lock washer per FSM', 'Src':'special.md 3a · PD H' } });

  /* ---------------- Harley Sportster Evo: lifter blocks ----------------
     The cam chest itself is already in the core tree for this engine
     (camDrive:'gear'): crksprocket is the pinion, timing the gear train and
     frontcover the cam cover — they are not repeated here. */
  if (s.harley && ctx.ohv && ctx.airCooled)
    add({ id:'tappetblocks', name:'Tappet (lifter) blocks', group:'valvetrain', qty:Math.max(1, ctx.banks), deps:['lifters'], mesh:'lifter',
      teach:'Two separate alloy blocks on top of the cam chest, one per cylinder, each holding that cylinder\'s two hydraulic roller lifters with an anti-rotation pin. They are bolted on, not cast in — lifting one off after the pushrods are out is how you get at the lifters.',
      spec:{ 'Blocks':2, 'Lifters':'2 per block, hydraulic roller', 'Src':'special.md 3c "Hydraulic roller lifters" · M' } });

  /* ---------------- Ducati: desmodromic valvetrain ---------------- */
  if ((e.follower === 'desmo' || e.valvetrain === 'desmodromic') && !ctx.ohv){
    const n = e.cyl * (e.valvesPerCyl || 4);
    add({ id:'desmorockers', name:'Desmo rockers (opening + closing)', group:'valvetrain', qty:n,
      deps:['valves'], mesh:'rocker',
      teach:'Each valve has two rockers and two lobes. The opening rocker sits over the valve and the opening lobe pushes it down. The closing rocker hooks under split half-rings on the stem and the closing lobe lifts it, pulling the valve shut — so no valve spring decides how fast the valve closes, and valve float cannot happen. A light return spring on each closing rocker only takes up slack at cranking speed. There are two clearances to set per valve, opening and closing, each with its own shim.',
      spec:{ 'Rockers':`${n} opening + ${n} closing`, 'Shims':'opening and closing, two clearances per valve', 'Src':'special.md 3b · PRESS H' } });
  }
  return out;
}
