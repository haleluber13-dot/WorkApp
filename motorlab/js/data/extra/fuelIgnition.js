/* fuelIgnition — extra parts for the tree. See js/data/extra/index.js.
 *
 * Induction, fuel-delivery and accessory-drive hardware that a factory parts
 * list names separately but pistonTree folds into something bigger (or leaves
 * out): the upper intake chamber, the exhaust studs, the injector seals, the
 * pulsation damper, the carburettor and its dress, the alternator mounting
 * hardware, the oil filter bracket and, for atmospheric engines, the airbox.
 * Geometry for every id here — and for the tree's own pspump / accomp /
 * grounds / airbox / tps / iscv, which had none — is in
 * js/build/extra/fuelIgnition.js.
 *
 * Sources (see scratchpad parts-research): [FSM-2JZ] = Toyota RM502U 1997
 * Supra repair manual (SF / EM / CO sections); [GEN] = family layout from
 * petrol.md, no hard number given, so no torque is invented for it.
 */

/** Pieces that come off one at a time. */
export const instanced = ['manifoldstuds', 'injseals'];

/* The 2JZ-GTE (i6-30-legend) has its own module (supra2jz) with the FSM's
   air intake chamber + stay, injector insulators, holders, pulsation damper
   and oil filter bracket, so those are not repeated here for that engine. */

/* Engines whose intake is a lower manifold plus a separate upper chamber
   bolted on top, and which the model draws with a single plenum (e.intake
   'plenum') — the chamber is built over that plenum. The RB26's collector over
   its six throttles is real too, but it is an ITB engine (e.intake 'itb'), so
   it is left to whoever draws the ITBs. */
const TWO_PIECE_INTAKE = new Set(['v6-35-na', 'nissan-vr38']);

export function parts(e, ctx){
  if (e.kind === 'rotary') return [];
  const out = [];
  const add = (o) => out.push(Object.assign({ qty:1, deps:[], removable:true }, o));
  const { carb, diesel, turbos, blown } = ctx;
  const road = e.class !== 'bike' && e.class !== 'race';
  const bike = e.class === 'bike';
  const is2jz = e.id === 'i6-30-legend';
  const itb = e.intake ? e.intake === 'itb' : (e.aspiration === 'na' && e.redline >= 7600);
  const efi = !carb && !diesel;
  const di = e.injection === 'direct';
  const exNm = is2jz ? 39 : (e.bore >= 95 ? 32 : 25);

  /* ---- induction ---- */
  /* the turbo branch of pistonTree already has an airbox; atmospheric and
     supercharged EFI engines breathe through one too */
  if (efi && !turbos && !bike && !(blown && e.class === 'race') && e.intake !== 'slide' && e.intake !== 'hat')
    add({ id:'airbox', name:'Air filter box & intake duct', group:'induction', deps:[itb ? 'intake' : 'throttle'], mesh:'intake',
      teach:'A moulded box round a pleated paper element, a snorkel that takes cool air from ahead of the radiator, and a rubber duct to the throttle body. The box is not decoration: it is a resonator tuned to quieten intake roar and it keeps hot under-bonnet air off the element. A filter that never sees service costs power quietly — restriction across the element is a pressure the pistons have to pull against on every intake stroke. Check that the duct clips are home after a service: an unmetered leak after a mass-air-flow meter will make the engine run lean and hunt at idle.',
      spec:{ 'Element':'pleated paper, dry', 'Service':'inspect every 15,000 km, replace at 30–60,000 km', 'Leak check':'every clamp and clip between the meter and the throttle' } });

  if (!carb && !diesel && !itb && (e.intake || 'plenum') === 'plenum' && TWO_PIECE_INTAKE.has(e.id)){
    add({ id:'plenum', name:'Upper intake plenum / collector', group:'induction', deps:['intake'], mesh:'intake',
      teach:'The intake is two castings: the lower manifold with the runners and the injector bosses, and this chamber on top of it that every runner draws from. The throttle body bolts to its front, and the idle-air passage, the brake-servo take-off and the vacuum references all tap into it. Splitting it this way is what lets you reach the injectors and the fuel rail without unbolting the runners from the head. Fit a new plenum gasket every time and tighten from the middle outwards; an air leak here is unmetered air and a lean, hunting idle. [GEN]',
      spec:{ 'Joint':'gasket to the lower manifold', 'Gasket':'new every time', 'Tighten':'centre outwards' } });
  }

  /* ---- carburettor engines ---- */
  /* car carburettors only: the Harley's CV carburettor is core's 'intake' */
  if (carb && !bike){
    add({ id:'carb', name:'Four-barrel carburettor & base gasket', group:'fuel', deps:['intake'], mesh:'throttle',
      teach:'Two primary barrels for cruising and two secondaries that open only on a big throttle. Air speeding through each venturi drops in pressure and pulls fuel out of the main jets, so fuel tracks airflow with no electronics at all. The float bowls hold a level of fuel set by a float and needle valve; set that level wrong and it floods or starves in corners. It sits on four studs on the manifold pad over a thick base gasket that also insulates it from manifold heat — snug the nuts evenly in a cross, because over-tightening warps the throttle-plate base and the throttles then stick. [GEN]',
      spec:{ 'Type':`${e.id === 'v8-70-bb' ? 'Holley 850 cfm double-pumper (L88)' : 'four-barrel (Rochester Quadrajet / Holley)'}`, 'Mounting':'4 studs + nuts on the carb pad', 'Base gasket':'new, insulating' } });
    add({ id:'choke', name:'Choke & fast-idle cam', group:'fuel', deps:['carb'], mesh:'sensor',
      teach:'A flap across the top of the primaries that closes on a cold start to make the mixture rich enough to light in a cold engine. A bimetal coil opens it as things warm — electrically heated on a Holley, on the intake crossover on a divorced Quadrajet choke. The fast-idle cam holds the throttle slightly open while it is on. A choke that sticks closed is the engine that runs black and fouls its plugs in the first mile; one that never closes is the engine that will not start on a frosty morning. [GEN]',
      spec:{ 'Type':'bimetal spring, electric or exhaust-heated', 'Check':'flap closed cold, fully open hot' } });
    add({ id:'carblinkage', name:'Throttle linkage, return springs & kickdown bracket', group:'induction', deps:['carb'], mesh:'throttle',
      teach:'The cable or rod from the pedal pulls a lever on the carburettor throttle shaft; two separate return springs pull it shut. Two springs is the rule, not an accident: if one breaks, the other still closes the throttle, so a broken spring can never leave the car accelerating on its own. On an automatic the same bracket carries the kickdown cable to the gearbox. [GEN]',
      spec:{ 'Return springs':'2, independent', 'Check':'snaps shut from wide open with the engine off' } });
    add({ id:'aircleaner', name:'Air cleaner housing, element & wing nut', group:'induction', deps:['carb'], mesh:'intake',
      teach:'The round pan on top of the carburettor holding a ring of pleated paper, clamped by a lid and a single wing nut on a stud screwed into the carb. Hand tight only — crank the wing nut down and you distort the air horn and bend the choke shaft. It is also a flame arrestor: a backfire through the carb goes into this housing instead of into the engine bay. [GEN]',
      spec:{ 'Element':'pleated paper ring', 'Wing nut':'hand tight', 'Snorkel':'forward, to cold air' } });
  }

  /* ---- fuel injection hardware ---- */
  if (efi && !is2jz){
    add({ id:'injseals', name: di ? 'Injector seal sets (combustion seals & O-rings)' : 'Injector seal sets (O-rings & insulators)',
      group:'fuel', qty:e.cyl, deps:['injectors'], mesh:'injector',
      teach: di
        ? 'Every direct injector has a PTFE combustion seal on its tip, sitting in the head and facing cylinder pressure and flame, a backup ring behind it, and an O-ring at the rail cup. The tip seal is single-use and goes on with a sizing sleeve: stretch it on, then let the sleeve squeeze it back to size before the injector goes into its bore. A leaking tip seal shows as carbon tracking up the injector body and a tick at idle. [GEN]'
        : `An O-ring at the top seals the injector into its cup on the fuel rail; a second O-ring and an insulator at the nozzle seal it into the manifold and keep manifold heat out of the injector. All of them are single-use. Lubricate with petrol or spindle oil only — never grease, which swells the rubber and can block the spray pattern. A nicked top O-ring is a fuel leak onto a hot engine; a hard lower one is a vacuum leak and a lean cylinder. [GEN]`,
      spec: di ? { 'Tip seal':'PTFE, single-use, sized after fitting', 'Rail end':'O-ring + backup ring' }
               : { 'Per injector':'2 O-rings + insulator', 'Lube':'petrol or spindle oil, never grease', 'Re-use':'never' } });
  }

  /* ---- exhaust ---- */
  if (!diesel && !bike)
    add({ id:'manifoldstuds', name:'Exhaust manifold stud pairs (studs & nuts)', group:'exhaust', qty:e.cyl, deps:['exmanifold'], mesh:'exmanifold',
      torque:{ nm:exNm, size:'M8 stud', count:e.cyl * 2, pattern:{ kind:'inside-out', count:e.cyl * 2 },
               stages: is2jz ? ['39 Nm, in sequence'] : [`${Math.round(exNm / 2)} Nm`, `${exNm} Nm`], lube:'copper anti-seize on the stud; new self-locking nuts' },
      teach:`Two studs per port, screwed into the head for life, and a nut on each that clamps the manifold flange through the gasket. Studs rather than bolts because the head is aluminium and the joint goes to 800 °C on every drive: a bolt wound in and out of soft threads that often strips them, a stud stays put and only the steel nut moves. The nuts are self-locking and single-use; the studs are what snap when you force a seized one, which is why you soak them and work them back and forth.${is2jz ? ' 2JZ-GTE: 12 new nuts at 39 N·m, in the manual\'s sequence. [FSM-2JZ]' : ' [GEN]'}`,
      spec:{ 'Per port':'2 studs + 2 nuts', 'Nuts':'self-locking, single-use', 'Seized stud':'heat, penetrant, work it both ways' } });

  /* ---- accessory drive & oil system ---- */
  if (road)
    add({ id:'altbracket', name:'Alternator pivot bolt & adjusting bracket', group:'accessory', deps:['alternator'], mesh:'alternator',
      torque: is2jz ? { nm:40, size:'M10', count:2, pattern:{ kind:'sequence', count:2 }, stages:['40 Nm'] } : undefined,
      teach:`The alternator hangs on a long pivot bolt through its lower ears and is held at the top by a slotted adjusting bracket. On an engine with a V-belt, swinging it out on the pivot and locking it in the slot is how you set belt tension; on a serpentine engine with an automatic tensioner the slot is gone and two through-bolts just hold it. Either way these come out before the alternator does — the pivot bolt is the last thing holding it.${is2jz ? ' 2JZ-GTE: bolt and nut, 40 N·m; loosen them to slide the generator off the water pump. [FSM-2JZ]' : ' [GEN]'}`,
      spec:{ 'Pivot':'long through-bolt in the lower ears', 'Adjuster':'slotted strap (V-belt) or fixed bolt (auto tensioner)' } });

  if (!diesel && !bike && e.class !== 'race' && !is2jz)
    add({ id:'filterbracket', name:'Oil filter bracket / housing', group:'lube', deps:['block'], mesh:'oilfilter',
      teach:`A cast housing on the side of the block that the filter screws on to. Oil from the pump comes out of the block into it, through the filter and back into the main gallery — and the housing carries the bypass valve that lets oil round a blocked filter rather than starve the bearings. On many engines it also carries the oil cooler union and the pressure switch. It seals to the block with an O-ring and a gasket, never re-used. [GEN]`,
      spec:{ 'Carries':'filter thread, bypass valve, often the cooler union', 'Seals':'gasket + O-ring, new' } });

  return out;
}
