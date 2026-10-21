/* race — extra parts for the piston race engines (class 'race', not the R26B,
 * which is handled by rotary.js). Source: scratchpad/parts-research/special.md
 * §4 (FIA/NHRA regulations, Engine Builder, EngineLabs, period press).
 *
 *  race-16-v6h   F1 1.6 V6 turbo hybrid (2014–25 rules)
 *  race-58-stock NASCAR Ford FR9
 *  race-82-nitro Top Fuel 500 ci supercharged nitro Hemi
 *  race-20-rally Group A 2.0 turbo with anti-lag
 *  ford-dfv      Cosworth DFV 3.0 V8
 */

export const instanced = ['prechambers', 'rockershafts', 'magleads2', 'geartrain', 'slidethrottles'];

export function parts(e, ctx){
  if (e.class !== 'race' || e.kind === 'rotary') return [];
  const out = [];
  const add = (o) => out.push(o);
  const heads = ctx?.heads || ((e.layout === 'V' || e.layout === 'F') ? 2 : 1);

  /* ---- every piston race engine here runs a dry sump; the pump is the
     tree's `oilpump`, this is the remote tank and its lines ---- */
  add({ id:'drysumptank', name:'Dry-sump oil tank & lines', group:'lube', deps:['oilpump'], mesh:'oilfilter',
    teach:`With a dry sump the pan is only a shallow tray: the scavenge stages of the pump suck it empty and send the oil — and the air beaten into it — to a separate tank, where it de-aerates before the pressure stage draws it back. The crank no longer wades through oil, the engine can sit lower in the car, and oil pickup survives sustained cornering and braking loads. ${e.hybrid ? 'In an F1 car the tank is shaped to fit between the engine and the monocoque.' : 'The tank lives in the chassis, so the lines are big braided hoses with AN fittings.'}`,
    spec:{ 'System':'dry sump, multi-stage pump', 'Tank':'remote, de-aerating', 'Lines':'braided, AN fittings' } });

  /* ---------------- F1 1.6 V6 turbo hybrid ---------------- */
  if (e.hybrid){
    add({ id:'mguk', name:'MGU-K (kinetic motor-generator)', group:'accessory', deps:['crank'], mesh:'alternator',
      teach:'A motor-generator geared to the crankshaft at the front of the engine. Under braking it generates, charging the Energy Store (which is in the chassis, not on the engine); on the straights it drives the crank. The regulations cap it at 120 kW and 50,000 rpm. It also does the job of the starter — an F1 power unit has no conventional starter or alternator.',
      spec:{ 'Max power':'120 kW', 'Max speed':'50,000 rpm', 'Drive':'geared to the crankshaft', 'Energy store':'in the chassis (not modelled)' } });
    add({ id:'mguh', name:'MGU-H (heat motor-generator)', group:'induction', deps:['turbo'], mesh:'turbo',
      teach:'An electric machine on the turbocharger shaft, between the turbine and the compressor. When the exhaust has more energy than the compressor needs it generates (in place of a wastegate); when the driver gets back on the throttle it spins the turbo up instantly, which is why these engines have no turbo lag. Mercedes split the turbo, compressor at the front and turbine at the rear, with the MGU-H in the vee between them.',
      spec:{ 'Position':'on the turbo shaft, between turbine and compressor', 'Shaft limit':'~125,000 rpm' } });
    if (e.preChamber && e.ignition !== 'pre-chamber')
      add({ id:'prechambers', name:'Pre-chambers (turbulent jet ignition)', group:'ignition', qty:e.cyl, deps:['head'], mesh:'plug',
        teach:'A small chamber in the centre of the head, round the spark-plug tip, joined to the main chamber by a ring of tiny holes. The spark lights the charge in the pre-chamber; the pressure rise blasts jets of flame through the holes deep into a main charge too lean to light from a single spark. It is a passive pre-chamber — no fuel of its own — and it is a big part of how these engines passed 50% thermal efficiency.',
        spec:{ 'Type':'passive pre-chamber (TJI)', 'Position':'head centre, combined with the plug', 'Per cylinder':1 } });
    if (e.valvetrain === 'pneumatic')
      add({ id:'pvrs', name:'Pneumatic valve-spring air supply (bottle & regulator)', group:'valvetrain', deps:['head'], mesh:'fuelpump',
        teach:'There are no steel valve springs: each valve is closed by a gas spring, a piston in a small cylinder pressurised through galleries in the head. A little gas leaks past every cycle, so a high-pressure bottle and a regulator on the engine top it up continuously — lose the bottle and the valves stop closing. A steel spring cannot survive this rpm because its own coils start to surge.',
        spec:{ 'Air springs':`${e.cyl * (e.valvesPerCyl || 4)} (in the heads)`, 'Supply':'HP bottle + regulator', 'Feeds':'galleries in both heads' } });
  }

  /* ---------------- NASCAR FR9 ---------------- */
  if (e.id === 'race-58-stock' && e.cam === 'OHV')
    add({ id:'rockershafts', name:'Rocker shaft assemblies', group:'valvetrain', qty:heads, deps:['head'], mesh:'rocker',
      teach:'Instead of each rocker pivoting on its own stud, the rockers on each head ride on shafts held by rigid stands bolted to the head. A stud flexes at 9,000 rpm with these spring pressures and the valve timing wanders; a shaft system holds every rocker exactly where it was set, which is why every Cup engine uses one.',
      spec:{ 'Per head':'2 shafts on stands', 'Rockers':'16 on the engine, roller-tipped' } });

  /* ---------------- Top Fuel nitro Hemi ---------------- */
  if (e.fuel === 'nitro'){
    add({ id:'blowerdrive', name:'Blower drive belt & crank pulley', group:'induction', deps:['blower','crankpulley'], mesh:'pulley',
      teach:'A wide toothed (cog) belt from a pulley on the crank snout up to the blower pulley at the front of the 14-71. The pulley ratio sets the blower overdrive, which is one of the tuning variables a crew chief changes between rounds. If the belt lets go the blower stops and the car simply coasts.',
      spec:{ 'Belt':'cog belt, ~3 in wide', 'Drive':'crank snout → blower snout' } });
    add({ id:'injectorhat', name:'Injector hat & butterflies', group:'induction', deps:['blower'], mesh:'throttle',
      teach:'The scoop on top of the blower. Inside it are the butterflies — this engine\'s throttle — and a bank of fuel nozzles, because most of the nitromethane goes in here, ahead of the blower, where it cools the charge. The rest goes in through nozzles in the manifold and heads.',
      spec:{ 'Position':'on top of the blower', 'Contains':'butterflies (throttle), fuel nozzles' } });
    add({ id:'mechfuelpump', name:'Mechanical fuel pump', group:'fuel', deps:['frontcover'], mesh:'fuelpump',
      teach:'A gear pump driven off the front of the camshaft, so fuel delivery rises in step with rpm. There is no EFI on a Top Fuel engine: it is a constant-flow mechanical system, and a nitro engine burns so much fuel per cycle that the pump is enormous.',
      spec:{ 'Drive':'camshaft, front of the engine', 'Type':'mechanical gear pump (constant flow)' } });
    add({ id:'barrelvalve', name:'Barrel valve, main jet & lean-out valve', group:'fuel', deps:['mechfuelpump','injectorhat'], mesh:'fuelpump',
      teach:'A throttle-linked rotary valve in the fuel line: as the butterflies open it opens too, sending pump flow to the nozzles in proportion to throttle. The main jet and a timed lean-out valve trim the mixture down the track — tuning a nitro car is mostly done here and on the clutch, not with a laptop.',
      spec:{ 'Linked to':'the butterflies', 'Trim':'main jet + timed lean-out valve' } });
    add({ id:'magneto2', name:'Second magneto', group:'ignition', deps:['coils'], mesh:'coil',
      teach:'Two 44-amp magnetos, one for each of the two plugs in every cylinder. Nitromethane at these mixtures is extremely hard to light, and a cylinder that goes out fills with liquid fuel and hydraulics — so each cylinder gets two plugs on two separate magnetos.',
      spec:{ 'Output':'44 A', 'Fires':'the second plug in each cylinder' } });
    add({ id:'magleads2', name:'Plug leads (second magneto)', group:'ignition', qty:e.cyl, deps:['magneto2','plugs'], mesh:'coil',
      teach:'One heavy lead from the second magneto to the second plug of each cylinder — eight here, sixteen on the engine with the first magneto\'s set.' });
    add({ id:'burstpanel', name:'Intake burst panel', group:'induction', deps:['intake'], mesh:'intgasket',
      teach:'A deliberately weak panel in the intake manifold. When the manifold backfires — and on nitro it will — the panel blows out and vents the pressure instead of the blower being lifted off the engine.',
      spec:{ 'Purpose':'vents a manifold backfire', 'Rule':'NHRA-mandated' } });
    add({ id:'blowerrestraint', name:'Blower restraint straps', group:'induction', deps:['blower'], mesh:'blower',
      teach:'Ballistic straps over the blower case, anchored to the heads. If a big backfire does break the blower loose, they keep it on the car instead of letting it go into the crowd.',
      spec:{ 'Rule':'NHRA-mandated', 'Material':'ballistic fabric straps' } });
  }

  /* ---------------- Group A rally, anti-lag ---------------- */
  if (e.antilag){
    add({ id:'alsvalve', name:'Anti-lag air valve & bypass pipe', group:'induction', deps:['intake','exmanifold'], mesh:'bov',
      teach:'Off throttle, this valve bleeds charge air from the intake side straight into the exhaust manifold ahead of the turbine. The ECU retards the ignition hard and adds fuel, so the mixture burns in the manifold instead of the cylinder and keeps the turbine spinning — the bangs and flames from a rally car on a lift are the system working. It cooks manifolds and turbos.',
      spec:{ 'Taps':'charge air after the throttle', 'Feeds':'exhaust manifold, upstream of the turbine', 'With':'ignition retard + extra fuel' } });
    add({ id:'restrictor', name:`Turbo inlet restrictor (${e.restrictor || 34} mm)`, group:'induction', deps:['turbo'], mesh:'intake',
      teach:`All the air the engine breathes has to pass a ${e.restrictor || 34} mm hole within 50 mm of the compressor wheel. That caps mass flow and therefore peak power, whatever boost is run — so these engines are tuned for torque, response and anti-lag instead of top end.`,
      spec:{ 'Bore':`${e.restrictor || 34} mm`, 'Position':'within 50 mm upstream of the compressor wheel', 'Rule':'FIA Appendix J' } });
    add({ id:'icspray', name:'Intercooler water-spray bar', group:'induction', deps:['intercooler'], mesh:'injector',
      teach:'Nozzles on a bar in front of the intercooler spray a fine mist of water onto the core. It evaporates and pulls heat out of the core far faster than air alone, keeping charge temperature down on a long stage. The tank and pump are in the car.',
      spec:{ 'Sprays':'intercooler core face', 'Tank & pump':'in the chassis (not modelled)' } });
  }

  /* ---------------- Cosworth DFV ---------------- */
  if (e.id === 'ford-dfv'){
    add({ id:'geartrain', name:'Compound idler gears (torsion-bar hubs)', group:'timing', qty:2, deps:['crksprocket'], mesh:'timing',
      teach:'The DFV drives its four camshafts through a train of spur gears at the front. The flat-plane crank sends torsional spikes up that train which broke gears, so from 1971 the two compound idlers carry their gear on a nest of twelve small torsion bars — a spring drive that soaks up the spikes before they reach the cams.',
      spec:{ 'Qty':2, 'Torsion bars':'12 per gear (from 1971)', 'Drive':'gear train, front of the engine' } });
    add({ id:'slidethrottles', name:'Lucas slide throttles', group:'induction', qty:2, deps:['intake'], mesh:'throttle',
      teach:'Instead of butterflies, a flat plate per bank slides across the four inlet trumpets on ball and roller supports. Wide open there is nothing at all in the airflow — a butterfly spindle always is — and the plate is light enough to snap shut at 10,000 rpm.',
      spec:{ 'Per bank':'1 plate, 4 bores', 'Supports':'ball and roller races', 'Position':'inside the vee' } });
    add({ id:'meteringunit', name:'Lucas fuel metering unit', group:'fuel', deps:['timing','injectors'], mesh:'fuelpump',
      teach:'A mechanical metering-distributor in the vee, shaft-driven from the front gear train. A shuttle inside it measures a slug of fuel for each cylinder in turn, with the slug size set by a cam linked to the throttle, and sends it down its own line to the injector in that cylinder\'s trumpet. No electronics anywhere in the fuel system.',
      spec:{ 'Drive':'shaft from the front gear train', 'Outlets':e.cyl, 'Control':'throttle-linked metering cam' } });
  }
  return out;
}
