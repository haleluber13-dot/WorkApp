/* rotary — extra parts for the Wankel tree (13B-REW, 20B-REW, R26B).
 * Source: scratchpad/parts-research/special.md §2 (FSM / parts-diagram recall,
 * MotoIQ, Haltech, Robinette, Wikipedia 787B). Only `e.kind === 'rotary'`.
 *
 * The existing tree has the housing stack as one non-removable `block`, the
 * rotors, a combined apex row and coarse lube/induction parts. This adds the
 * individual irons, the per-rotor seal sets, the front-end parts (cover,
 * oil-pump chain, counterweights, thrust bearing), oil metering, and — on the
 * sequential twin-turbo engines — the valves, solenoids and vacuum harness
 * that actually sequence the two turbos. The R26B gets its third plug per
 * rotor and the telescopic intake trumpets. */

export const instanced = [
  'interhousing', 'sideseals', 'cornerseals', 'oilseals', 'coolantseals',
  'counterweights', 'ompnozzles', 'oilcoolers', 'seqsolenoids',
  'plugs3', 'coils3', 'teletrumpets',
];

export function parts(e, ctx){
  if (e.kind !== 'rotary') return [];
  const n = e.cyl;
  const race = e.class === 'race';
  const seq = e.aspiration === 'twinturbo';
  const out = [];
  const add = (o) => out.push(o);

  /* ---- the housing stack: the irons between and around the rotor housings ---- */
  add({ id:'fronthousing', name:'Front housing (front iron)', group:'block', deps:['block'], mesh:'block',
    teach:'The first casting on the stand. It carries the front stationary gear and main bearing in its centre bore, the front secondary intake port on its inner face, and the oil pump on its front face. Its inner face is a sliding surface for the side seals, so it is nitrided and lapped flat — a scored iron is resurfaced or replaced, never just cleaned up.',
    spec:{ 'Material':'cast iron, nitrided face', 'Carries':'front stationary gear, main bearing, secondary port', 'Flatness':'checked with a straight edge across the face' } });
  if (n > 1)
    add({ id:'interhousing', name:'Intermediate housings (centre irons)', group:'block', qty:n-1, deps:['rotorhousing','pistons'], mesh:'block',
      teach:`One between each pair of rotor housings (${n-1} here). It splits the stack into separate chambers, and on the 13B-REW it carries the primary intake ports — one on each face, one for each rotor. The e-shaft passes through its centre bore, which is why a three- or four-rotor e-shaft cannot be one plain piece.`,
      spec:{ 'Qty':n-1, 'Ports':'primary intake, one per face', 'Material':'cast iron, nitrided faces' } });
  add({ id:'rearhousing', name:'Rear housing (rear iron)', group:'block', deps:['rotorhousing','stationary'], mesh:'block',
    teach:'The last iron in the stack. It carries the rear stationary gear and main bearing, the rear secondary port, the oil-filter pedestal and the thermal pellet that decides whether the oil goes through the coolers. The tension bolts go in from this end.',
    spec:{ 'Carries':'rear stationary gear, main bearing, oil-filter pedestal, thermal pellet' } });

  /* ---- the seals on the rotors (the apex seals are already in the tree) ---- */
  add({ id:'sideseals', name:'Side seals', group:'rotating', qty:n*6, deps:['pistons'], mesh:'apexseal',
    teach:'Three thin strips on each face of each rotor, each pushed out against the side housing by a wave spring. They seal the faces of the chamber the way the apex seals seal its tips. Each side seal ends at a corner seal, and the gap between them is measured — too tight and the seal binds when hot, too loose and compression leaks round the corner.',
    spec:{ 'Per rotor':'3 per face × 2 faces = 6', 'Total':n*6, 'Springs':'one wave spring each' } });
  add({ id:'cornerseals', name:'Corner seals', group:'rotating', qty:n*6, deps:['pistons'], mesh:'apexseal',
    teach:'A small spring-loaded plug at each apex on both faces. The apex seal passes through its slot and the two side seals butt against it, so it is the joint where three seals meet. Worn corner-seal bores in the rotor are a common reason a rotor is scrapped.',
    spec:{ 'Per rotor':'3 per face × 2 faces = 6', 'Total':n*6 } });
  add({ id:'oilseals', name:'Oil seals (inner & outer)', group:'rotating', qty:n*4, deps:['pistons'], mesh:'headgasket',
    teach:'Two concentric scraper rings on each rotor face, inside the side seals, each with its own spring and O-ring. Oil is sprayed into the hollow rotor to cool it; these rings scrape it back off the side housing so it cannot be dragged out into the chamber and burned. A failed oil seal shows up as blue smoke at idle.',
    spec:{ 'Per rotor':'inner + outer, both faces = 4', 'Total':n*4, 'With':'spring and O-ring each' } });

  /* ---- the coolant seals at every rotor-housing joint ---- */
  add({ id:'coolantseals', name:'Coolant seal sets (inner seal & outer O-ring)', group:'cooling', qty:n*2, deps:['rotorhousing'], mesh:'headgasket',
    teach:`The housing joints are metal to metal — there is no gasket anywhere in the stack. Each face of each rotor housing (${n*2} joints) has an inner rubber seal running round the bore and an outer O-ring round the water jacket, and these rubbers are the only thing keeping coolant out of the chamber. A rotary that is "pushing coolant" or white-smoking has a failed coolant seal, and the only fix is to split the stack.${seq?' The turbo engines also have a protector ring inside each inner seal to keep combustion heat off the rubber.':''}`,
    spec:{ 'Joints':n*2, 'Per joint':'inner seal + outer O-ring', 'Sealing':'no gasket — rubbers only' } });

  /* ---- front end ---- */
  add({ id:'thrustbearing', name:'E-shaft thrust bearing & thrust plate', group:'rotating', deps:['crank','fronthousing'], mesh:'mainbearing',
    teach:'A needle (Torrington) thrust bearing and a thrust plate on the front of the e-shaft, clamped by the pulley bolt. Together with selective spacers they set e-shaft end play — the FSM checks it with a dial gauge before the front cover goes on, because too little end play scuffs the rotors against the irons.',
    spec:{ 'Type':'needle thrust bearing + plate', 'Sets':'e-shaft end play (spacer selected)' } });
  add({ id:'oilpumpdrive', name:'Oil pump drive chain & sprockets', group:'lube', deps:['oilpump','crank'], mesh:'timing',
    teach:'A short chain from a sprocket on the e-shaft to the oil pump on the front housing, inside the front cover. It is the only "timing chain" a rotary has, and it does not time anything — it just turns the pump.',
    spec:{ 'Chain':1, 'Sprockets':2 } });
  add({ id:'counterweights', name:'E-shaft counterweights', group:'rotating', qty:2, deps:['crank'], mesh:'flywheel',
    teach:'The rotors orbit off-centre, so the e-shaft carries a counterweight at each end, set opposite the eccentric lobes. The front one sits under the front cover, keyed and clamped by the pulley bolt; the rear one is a separate weight (on manual 13B-REWs it is cast into the flywheel). Mix up front and rear and the engine shakes itself apart.',
    spec:{ 'Front':'keyed, clamped by the pulley bolt', 'Rear':'separate, or integral with the flywheel' } });
  add({ id:'frontcover', name:'Front cover & front oil seal', group:'timing', deps:['fronthousing','oilpumpdrive','thrustbearing'], mesh:'frontcover',
    teach:'The alloy case on the front housing. It closes up the oil-pump chain and the front counterweight, carries the front oil seal the e-shaft pulley runs in, and is where the oil metering pump bolts on.',
    spec:{ 'Covers':'oil-pump chain, front counterweight', 'Seal':'front e-shaft oil seal' } });

  /* ---- oil metering (street engines; the R26B ran without it) ---- */
  if (!race){
    add({ id:'omp', name:'Oil metering pump (OMP)', group:'lube', deps:['frontcover'], mesh:'oilpump',
      teach:`A small plunger pump bolted to the side of the front cover. Its whole job is to burn oil on purpose: it meters engine oil into the rotor housings to lubricate the apex seals, which have no other oil supply. ${seq?'On the 13B-REW a stepper motor on the pump, driven by the ECU, sets how much it delivers for the load and rpm.':''} Delete it without premixing and the apex seals run dry.`,
      spec:{ 'Mounting':'side of the front cover, 2 bolts', 'Control': seq ? 'ECU stepper motor' : 'throttle-linked' } });
    add({ id:'ompnozzles', name:'Oil-injection nozzles (with MOP lines)', group:'lube', qty:n, deps:['omp','rotorhousing'], mesh:'injector',
      teach:'One nozzle in the top of each rotor housing, sealed with a crush washer and fitted with a check valve, each fed by its own clear line from the OMP so you can see the oil move. A stuck check valve lets the line drain back and starves that rotor of apex-seal oil.',
      spec:{ 'Per housing':1, 'Seal':'crush washer', 'Check valve':'in the nozzle' } });
  }

  /* ---- rear housing: thermal pellet and (13B-REW) twin oil coolers ---- */
  add({ id:'thermalpellet', name:'Thermal pellet (oil-cooler bypass)', group:'lube', deps:['rearhousing'], mesh:'sensor',
    teach:'A wax pellet behind a plug in the rear housing\'s oil passage. Cold, it lets the oil bypass the coolers so it warms quickly; hot, the wax expands and closes the bypass, forcing all the oil through the coolers. A pellet stuck open starves the coolers — the oil temperature climbs on track for no visible reason.',
    spec:{ 'Location':'rear housing oil passage, behind a plug', 'Function':'bypass cold, through the coolers hot' } });
  if (e.id === 'rotary-13b-t')
    add({ id:'oilcoolers', name:'Oil coolers & lines', group:'cooling', qty:2, deps:['rearhousing'], mesh:'radiator',
      teach:'Two oil coolers in the nose, one on each side of the radiator, plumbed from the rear housing\'s filter pedestal through the thermal pellet. A rotary rejects a large share of its heat into the oil — the rotors are oil-cooled from the inside — so these are survival equipment, not an option.',
      spec:{ 'Qty':2, 'Position':'either side of the radiator', 'Fed from':'rear housing pedestal' } });

  /* ---- sequential twin-turbo control (13B-REW, 20B-REW) ---- */
  if (seq){
    add({ id:'precontrolvalve', name:'Turbo pre-control valve & actuator', group:'induction', deps:['turbo','exmanifold'], mesh:'wastegate',
      teach:'A flap in the turbo manifold, worked by a vacuum/pressure actuator. Before the changeover it opens a little to bleed primary exhaust across to the secondary turbine, pre-spinning it so it is already turning when it is asked to take load — that is what keeps the changeover dip short.',
      spec:{ 'Opens':'before changeover, to pre-spin the secondary', 'Actuator':'diaphragm, solenoid-switched' } });
    add({ id:'turbocontrolvalve', name:'Turbo control valve & actuator', group:'induction', deps:['turbo','exmanifold'], mesh:'wastegate',
      teach:'The big exhaust flap at the secondary turbine inlet. Closed, all the exhaust drives the primary turbo; at the changeover (about 4,000–4,500 rpm) it swings open and gives the secondary turbine the full flow. Boost dips to about 8 psi for a moment and comes back on both turbos.',
      spec:{ 'Changeover':'~4,000–4,500 rpm', 'Position':'secondary turbine inlet' } });
    add({ id:'chargecontrolvalve', name:'Charge control valve & actuator', group:'induction', deps:['turbo','intercooler'], mesh:'bov',
      teach:'A flap at the secondary compressor outlet, in the Y-pipe. Until changeover it stays shut so the primary\'s boost cannot leak backwards out through the idle secondary compressor; it opens once the secondary is making pressure of its own.',
      spec:{ 'Position':'secondary compressor outlet (Y-pipe)', 'Closed':'until the secondary makes boost' } });
    add({ id:'chargereliefvalve', name:'Charge relief valve', group:'induction', deps:['chargecontrolvalve'], mesh:'bov',
      teach:'Vents the secondary compressor while the charge control valve is shut, so the pre-spinning secondary can free-wheel instead of compressing against a closed door and surging.',
      spec:{ 'Position':'on the Y-pipe', 'Open':'while the secondary pre-spins' } });
    add({ id:'wastegate', name:'Wastegate & actuator (primary turbo)', group:'induction', deps:['turbo'], mesh:'wastegate',
      teach:'An internal wastegate on the primary turbine with its actuator and a restrictor pill in the signal line. The spring alone holds it shut to about 7 psi; the wastegate solenoid bleeds the signal so the ECU can run about 10 psi.',
      spec:{ 'Spring':'~7 psi', 'Target':'~10 psi with solenoid duty', 'Restrictor pill':'in the actuator line' } });
    add({ id:'seqsolenoids', name:'Sequential-control solenoids', group:'sensors', qty:5, deps:['rearhousing'], mesh:'sensor',
      teach:'Five ECU-switched solenoids on one rack — turbo pre-control, turbo control, charge control, charge relief and wastegate control. The chain is always ECU → solenoid → vacuum or pressure → actuator → valve, so a dead solenoid looks exactly like a stuck valve.',
      spec:{ 'Qty':5, 'Switched':'by the ECU', 'Media':'manifold vacuum / boost pressure' } });
    add({ id:'vacuumhoses', name:'Vacuum & pressure hoses ("rat\'s nest")', group:'induction',
      deps:['seqsolenoids','precontrolvalve','turbocontrolvalve','chargecontrolvalve','chargereliefvalve','wastegate'], mesh:'bov',
      teach:'Preformed vacuum and pressure lines, two check valves and the vacuum and pressure chambers that let the actuators move during a transient. Every hose is a different length for a reason and none are labelled. One perished hose leaves the car on one turbo and it still drives — which is why the first diagnosis is to squeeze every hose by hand. Many owners replace the lot with a simplified "rat\'s nest removal" layout.',
      spec:{ 'Check valves':2, 'Chambers':'vacuum + pressure', 'First check':'every hose, by hand, cold' } });
  }

  /* ---- R26B: third plug per rotor and telescopic intake ---- */
  if (e.ignition === 'triple-plug'){
    add({ id:'plugs3', name:'Third spark plugs', group:'ignition', qty:n, deps:['rotorhousing'], mesh:'plug',
      teach:'The R26B fires three plugs per rotor (12 in all). The chamber of a rotary is a long, thin crescent moving away from the plugs as it burns, and at 9,000 rpm two plugs could not light it completely; the third one burns the trailing end of the charge so the fuel is not still burning in the exhaust port.',
      spec:{ 'Per rotor':'3 (this is the third)', 'Engine total':n*3 } });
    add({ id:'coils3', name:'Third ignition coils', group:'ignition', qty:n, deps:['plugs3'], mesh:'coil',
      teach:'Each third plug has its own coil and its own timing, so the ECU can stagger all three sparks across the chamber.' });
    add({ id:'teletrumpets', name:'Telescopic intake trumpets', group:'induction', qty:n, deps:['intake'], mesh:'intake',
      teach:'One trumpet per peripheral intake port, each a pair of sliding tubes. An ECU-driven actuator slides them continuously to change the intake length with rpm, retuning the pressure wave for every speed — the R26B\'s answer to the poor low-speed manners of a peripheral port.',
      spec:{ 'Qty':n, 'Length':'continuously variable', 'Ports':'peripheral intake' } });
    add({ id:'trumpetactuator', name:'Trumpet actuator & linkage', group:'induction', deps:['teletrumpets'], mesh:'throttle',
      teach:'A single ECU-controlled actuator and a cross-shaft linkage that slides all of the telescopic trumpets together.' });
  }
  return out;
}
