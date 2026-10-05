/* diesel — the parts that make the three turbodiesels diesels.
 *
 * Engines: Cummins 6.7 ISB (d-i6-67, common rail, 24-valve OHV, VGT, grid heater),
 * Ford/Navistar 7.3 Power Stroke T444E (d-v8-66, HEUI, 2-valve OHV, wastegated
 * turbo on a valley pedestal) and VW EA288 2.0 TDI CRBC (d-i4-20, common rail,
 * DOHC, VGT, low-pressure EGR).
 *
 * Sources (see scratchpad/parts-research/special.md §1):
 *   SSP514 — VW Self-Study Program 820433 "The EA288 TDI" (ea288.txt)
 *   INST   — Fleece FPE-2026-159 install sheet, 6.7 Cummins intake plenum, 2007.5–2024 Ram
 *   PRESS  — dieselhub / trade press for the 7.3 HEUI system
 *   PD/FSM — parts-diagram / service-manual structure, recalled (confidence M)
 * Torque figures are only given where a source states one; everything else
 * names the fastener and says "per FSM" rather than invent a number.
 *
 * Deliberately NOT added here, because the core tree already has the part:
 * injectors, fuelrail, hpfp (CP3 / CP4.1), glow, turbo, wastegate, intercooler,
 * throttle, intake, oilcooler, pcv, oilpump. Rocker pedestals for the Cummins
 * come from the valvetrain module ('rockerstuds').
 */

export const instanced = ['injlines', 'quills', 'injclamps', 'bridges', 'oilrails', 'uvch'];

export function parts(e, ctx){
  if (e.fuel !== 'diesel') return [];
  const cummins = e.id === 'd-i6-67', psd = e.id === 'd-v8-66', tdi = e.id === 'd-i4-20';
  if (!cummins && !psd && !tdi) return [];
  const out = [];
  const add = (o) => out.push(o);
  const glow = e.glow !== false;

  /* ------------------------------------------------------------------ */
  /* common-rail injection plumbing — Cummins and EA288                  */
  /* ------------------------------------------------------------------ */
  if (cummins || tdi){
    add({ id:'injclamps', name: cummins ? 'Injector hold-down clamps' : 'Injector clamping pieces',
      group:'fuel', qty: cummins ? e.cyl : Math.ceil(e.cyl / 2), deps:['injectors'], mesh:'injector',
      teach: cummins
        ? 'Each injector stands vertically in the middle of its four valves and is pulled down onto its copper sealing washer by a clamp and one bolt beside it, under the rocker housing. Order matters on a Cummins: the clamp is torqued first so the injector is seated, and only then is the connector tube (quill) nut tightened from the side of the head. Do it the other way round and the quill seals against an injector that then moves, and it leaks high-pressure fuel into the head.'
        : 'One clamping piece holds two injectors. Each piece is a forked bracket with one bolt between a pair of injectors, so the four injectors are held by two bolts. Loosen one and you have freed two injectors.',
      spec: cummins
        ? { 'Clamps':`${e.cyl}, one per injector`, 'Bolt':'1 each, per FSM', 'Order':'clamp first, then the quill nut', 'Source':'PD · M' }
        : { 'Clamping pieces':`${Math.ceil(e.cyl / 2)} (each holds two injectors)`, 'Bolt':'1 each, per FSM', 'Source':'SSP514 p.32 · H' } });

    if (cummins)
      add({ id:'quills', name:'High-pressure connector tubes (quills)', group:'fuel', qty:e.cyl,
        deps:['injclamps'], mesh:'fuelrail',
        teach:'On the Cummins the fuel reaches each injector sideways, through the side of the head. A short hardened tube, the connector tube or quill, passes through a bore in the intake side of the head and its cone nose presses into a port on the injector body. A retaining nut on the outside of the head holds it in. The quill nose and the injector port are a metal-to-metal seal, so a quill that has been tightened onto an unseated injector, or reused with a marked nose, weeps fuel into the oil.',
        spec:{ 'Count':e.cyl, 'Entry':'intake side of the head, into the injector body', 'Sequence':'injector clamp first, then quill nut', 'Source':'PD/FSM · H' } });

    add({ id:'injlines', name: cummins ? 'High-pressure injection lines, rail to connector tube' : 'High-pressure injection lines, rail to injector',
      group:'fuel', qty:e.cyl, deps: cummins ? ['quills', 'fuelrail'] : ['injclamps', 'fuelrail'], mesh:'fuelrail',
      teach: cummins
        ? 'Six pre-bent steel lines carry fuel at common-rail pressure from the rail to the connector tube on each cylinder. They are all the same length so every injector sees the same pressure wave. The cone seat at each end is the seal, so a line is only reused if its seats are unmarked. Take them off #1 to #6 and put them back #6 to #1, with a 19 mm line wrench, never an open spanner.'
        : 'One rigid steel line per cylinder from the rail to the top of its injector, carrying up to 1,800 bar. The cone ends are the seal. Crack one with the engine running and the jet will go through skin, so the rail is always allowed to bleed down first.',
      spec: cummins
        ? { 'Lines':e.cyl, 'Line nut':'19 mm', 'Remove':'#1 → #6', 'Install':'#6 → #1', 'Source':'INST steps 14 & 26 · H' }
        : { 'Lines':e.cyl, 'Pressure':'up to 1,800 bar', 'Source':'SSP514 p.30 · H' } });

    add({ id:'injreturn', name: cummins ? 'Fuel drain manifold & return line' : 'Injector return line, pressure-retention valve & pulsation damper',
      group:'fuel', deps:['fuelrail'], mesh:'fuelrail',
      teach: cummins
        ? 'Every injector spills a little fuel each time it fires, and that leak-off is collected by a drain manifold along the side of the head and sent back to the tank through a banjo on the driver (intake) side of the rail. Measuring how much each injector returns is how a worn injector is found. The banjo uses new sealing washers every time.'
        : 'Leak-off from the four solenoid injectors runs back through a return line held at about 1 bar by a pressure-retention valve, which keeps the injectors consistent. A pulsation damper in the same line soaks up the pulses from the single-piston pump, which would otherwise drum through the floor of the car.',
      spec: cummins
        ? { 'Return banjo':'17 mm, driver side of the rail (rear of the rail on 2019+)', 'Washers':'new, both faces', 'Source':'INST step 15 · H' }
        : { 'Return pressure':'0.4–1.0 bar', 'Retention valve':'~1 bar', 'Damper':'in the return line, near the right side of the engine', 'Source':'SSP514 pp.30–31, 39 · H' } });

    add({ id:'railsensor', name: cummins ? 'Rail pressure sensor' : 'G247 fuel pressure sensor', group:'sensors',
      deps:['fuelrail'], mesh:'sensor',
      teach:'A strain-gauge sensor screwed into the end of the rail. The ECU closes the loop on rail pressure with it many times a second, so a lazy sensor shows up as hard starting and smoke, not as a warning light.',
      spec: cummins ? { 'Location':'firewall end of the rail', 'Source':'INST step 16 · H' }
                    : { 'Location':'on the rail', 'Source':'SSP514 p.31 · H' } });

    add({ id:'railvalve', name: cummins ? 'Rail pressure-relief valve' : 'N276 fuel pressure regulator valve', group:'fuel',
      deps:['fuelrail'], mesh:'fuelrail',
      teach: cummins
        ? 'A mechanical valve in the end of the rail that opens if pressure ever runs away, because the sensor or the pump metering has failed. It is a last resort, not a regulator. Rail pressure on the Cummins is set at the inlet of the CP3 by its metering valve, which only admits the fuel the rail needs.'
        : 'The EA288 runs dual pressure control. The N290 valve on the CP4.1 meters how much fuel the pump takes in, and this N276 valve on the rail bleeds pressure off into the return. When the fuel is cold, N276 deliberately routes warm rail fuel back to the filter to stop it waxing.',
      spec: cummins ? { 'Type':'mechanical relief', 'Source':'special.md §1 (INST) · H' }
                    : { 'Pairs with':'N290 metering valve on the pump', 'Source':'SSP514 pp.31, 35 · H' } });

    add({ id:'vgtactuator', name: cummins ? 'VGT actuator (Holset HE351VE, electric)' : 'VGT vacuum unit, G581 position sensor & N75 valve',
      group:'induction', deps:['turbo'], mesh:'wastegate',
      teach: cummins
        ? 'The Holset turbo has a sliding nozzle ring in the turbine housing instead of a wastegate, moved by an electric actuator on the bearing housing. Closing the vanes makes back-pressure, which is also how this engine does its exhaust braking: there is no separate butterfly.'
        : 'Guide vanes in the turbine housing are swung by a vacuum unit on a lever, and an electro-pneumatic valve (N75) sets the vacuum. G581 inside the unit tells the ECU where the vanes are. If the vacuum is lost, a spring parks the vanes in the steep position: the car limps on low boost and cannot regenerate its particulate filter.',
      spec: cummins ? { 'Turbo':'Holset HE351VE', 'Mount':'bearing housing', 'Source':'PRESS · M' }
                    : { 'Control':'N75 duty cycle → vacuum unit', 'Failsafe':'spring to steep vanes', 'Source':'SSP514 pp.43–44 · H' } });

    add({ id:'egrcooler', name: cummins ? 'EGR cooler' : 'Low-pressure EGR module cooler', group:'exhaust',
      deps: cummins ? ['exmanifold'] : ['turbo'], mesh:'intercooler',
      teach: cummins
        ? 'A coolant-to-exhaust heat exchanger running along the exhaust side of the engine above the manifold. Hot gas taken off the manifold is cooled here before it is mixed back into the intake. Oil mist from the crankcase vent sticks to the soot inside it, and that is what clogs and eventually cracks these coolers.'
        : 'The US EA288 takes its EGR gas after the particulate filter, so it is clean and cool, and feeds it back in front of the compressor. The cooler and the V339 valve form one module between the filter and the turbo. Because the soot has already been filtered out, this cooler does not clog the way high-pressure EGR coolers do.',
      spec: cummins ? { 'Location':'exhaust side, above the manifold', 'Media':'engine coolant', 'Source':'INST · H/M' }
                    : { 'Loop':'low pressure (after DPF → compressor inlet)', 'High-pressure EGR':'not fitted (previous VW TDIs)', 'Source':'SSP514 pp.50–52 · H' } });

    add({ id:'egrvalve', name: cummins ? 'EGR valve' : 'V339 EGR motor 2', group:'induction',
      deps: cummins ? ['intakehorn'] : ['egrcooler'], mesh:'throttle',
      teach: cummins
        ? 'An electrically driven valve on top of the intake horn that meters cooled exhaust into the charge air. Inert gas in the cylinder lowers the peak flame temperature, and that is what cuts NOx. The horn, throttle valve and EGR valve come off the engine together as one unit.'
        : 'A throttle in the EGR path, worked by the ECU with a PWM signal, with its own position sensor (G466). Together with the exhaust flap J883 it sets the pressure difference that pushes exhaust round the loop. If it fails a spring closes it and EGR simply stops.',
      spec: cummins ? { 'Location':'intake horn, front top', 'Removal':'with the horn and throttle as one unit', 'Source':'INST steps 3 & 8 · H' }
                    : { 'Position sensor':'G466, integrated', 'Failsafe':'spring closed', 'Source':'SSP514 p.53 · H' } });
  }

  /* ------------------------------------------------------------------ */
  /* Cummins 6.7                                                          */
  /* ------------------------------------------------------------------ */
  if (cummins){
    add({ id:'gridheater', name:'Intake grid heater', group:'ignition', deps:['intake'], mesh:'intake',
      teach:'The Cummins has no glow plugs. It heats the intake air instead: an electric grid sandwiched between the intake horn and the plenum, fed through a heavy power stud from a relay. It is switched on before and just after cranking in the cold, and the voltage dip when it cycles is what makes the headlights pulse on a cold morning.',
      spec:{ 'Location':'between the intake horn and the plenum, front top', 'Power stud nut':'10 mm', 'Replaces':'glow plugs (none fitted)', 'Source':'INST step 11 · H' } });
    add({ id:'intakehorn', name:'Intake horn (elbow)', group:'induction', deps:['gridheater'], mesh:'intake',
      torque:{ nm:24, size:'M6 (10 mm hex)', count:6, pattern:{ kind:'sequence', count:6 }, stages:['24 Nm (18 lb-ft)'], lube:'new horn gasket' },
      teach:'The cast elbow where the charge-air boot comes up from the intercooler into the throttle valve and turns into the plenum. The EGR valve sits on it too, so charge air, EGR gas and grid-heater heat all meet here. That mix of oily soot is why the horn is the part that cokes up and gets cleaned.',
      spec:{ 'Bolts':'6 × 10 mm hex, 24 N·m (18 lb-ft)', 'Carries':'throttle valve, EGR valve', 'Source':'INST steps 8 & 31 · H' } });
    add({ id:'egrpipe', name:'EGR crossover tube & temperature sensor', group:'exhaust', deps:['egrcooler', 'egrvalve'], mesh:'exmanifold',
      teach:'The pipe you see crossing the front of the valve cover. It carries cooled exhaust from the cooler outlet on the exhaust side over the top of the engine to the EGR valve on the intake side. A clamp holds it at the cooler, a centre clamp holds it to the engine, and an EGR temperature sensor sits in it.',
      spec:{ 'Fixings':'clamp at the cooler, centre clamp, 8 mm', 'Sensor':'EGR temperature', 'Source':'INST step 3 · H' } });
    add({ id:'bridges', name:'Valve crossheads (bridges)', group:'valvetrain', qty:e.cyl * 2, deps:['valves'], mesh:'rocker',
      teach:'One rocker opens two valves through a crosshead: a small steel bridge lying across the tips of the two intake (or two exhaust) valves, with the rocker pressing on its middle. That is how one cam lobe and one pushrod run a four-valve head. A crosshead that is not sitting level opens one valve late and can be cracked by the rocker.',
      spec:{ 'Count':`${e.cyl * 2} (one per valve pair)`, 'Fixing':'none, floating on the valve tips', 'Source':'PD · H' } });
    add({ id:'rockerhousing', name:'Rocker housing & injector harness pass-throughs', group:'timing', deps:['rockers', 'injclamps'], mesh:'valvecover',
      teach:'A cast spacer between the head and the valve cover. The injector wiring runs underneath the cover, so its two harness connectors pass through this housing on the intake (driver) side. Disconnect both before lifting it, and check their seals when it goes back, because oil wicks out along a dry one.',
      spec:{ 'Harness connectors':'2, intake side', 'Seal':'gasket to head and to cover', 'Source':'INST step 12 · H' } });
    add({ id:'ccv', name:'Crankcase vent (CCV) filter & PCV lines', group:'lube', deps:['valvecover'], mesh:'valvecover',
      teach:'A coalescing filter in a housing on the valve cover catches oil mist out of the blow-by before it is sent to the turbo inlet. Two vent lines join the cover at the side. It is a service item: when it plugs, crankcase pressure rises and pushes oil out of seals, and the mist that gets past it is what fouls the EGR cooler.',
      spec:{ 'Location':'valve cover', 'Lines':'2, at the side of the cover', 'Source':'INST step 10 · H' } });
    add({ id:'fuelfilter', name:'Engine-mounted fuel filter & water-in-fuel sensor', group:'fuel', deps:['block'], mesh:'oilfilter',
      teach:'The last filter before the CP3, on the intake side of the engine. A common-rail pump and injectors are ruined by particles too small to see and by water, which is why the Ram also carries a frame-mounted filter and water separator ahead of this one. Draining the water from the separator is a routine job, and fuel is bled through after any filter change before the engine is cranked.',
      spec:{ 'Location':'intake side of the block, front (varies by model year)', 'Also fitted':'frame-mounted filter / water separator (chassis)', 'Source':'special.md §1 · M [verify by year]' } });
  }

  /* ------------------------------------------------------------------ */
  /* Ford 7.3 Power Stroke (T444E) — HEUI                                 */
  /* ------------------------------------------------------------------ */
  if (psd){
    add({ id:'hpop', name:'HEUI high-pressure oil pump & reservoir', group:'fuel', deps:['cam'], mesh:'hpfp',
      teach:'The 7.3 fires its injectors with engine oil, not fuel. A gear-driven swash-plate pump at the front of the lifter valley, fed from a reservoir above it, pressurises oil to roughly 500–3,000 psi and sends it to oil rails drilled into the heads. Each injector uses that oil to drive an intensifier piston that raises the fuel to injection pressure.',
      spec:{ 'Location':'front of the lifter valley', 'Drive':'gear from the camshaft', 'Pressure':'≈500–3,000 psi (ICP)', 'Source':'PRESS (dieselhub) · H' } });
    add({ id:'ipr', name:'IPR valve (injection pressure regulator)', group:'fuel', deps:['hpop'], mesh:'sensor',
      teach:'A PWM solenoid valve screwed into the HPOP. The PCM sets injection-control pressure by bleeding oil back to the sump through it, so it is to the 7.3 what the rail pressure regulator is to a common-rail engine. A sticking IPR or a torn O-ring on it is a classic hot-no-start.',
      spec:{ 'Location':'screwed into the HPOP, in the valley', 'Control':'PCM duty cycle', 'Source':'PRESS · H' } });
    add({ id:'icp', name:'ICP sensor (injection control pressure)', group:'sensors', deps:['hpop'], mesh:'sensor',
      teach:'Reports high-pressure oil pressure back to the PCM, which closes the loop with the IPR valve. Oil getting into its connector is a known fault that upsets idle and starting.',
      spec:{ 'Location':'high-pressure oil circuit at the HPOP / reservoir (varies by year)', 'Source':'PRESS · M [verify]' } });
    add({ id:'oilrails', name:'High-pressure oil branch tubes (to the head oil rails)', group:'fuel', qty:2, deps:['hpop', 'head'], mesh:'fuelrail',
      teach:'One tube per head carries oil from the HPOP to the oil rail drilled into that head, which feeds every injector on the bank. A leaking branch tube or its O-rings robs the system of pressure and shows up as hard starting when hot.',
      spec:{ 'Count':'2, one per head', 'Oil rails':'integral, drilled in the heads', 'Source':'PD · M' } });
    add({ id:'injclamps', name:'Injector hold-down clamps & bolts', group:'fuel', qty:e.cyl, deps:['injectors'], mesh:'injector',
      teach:'Each HEUI injector stands vertically in its head under the valve cover and is held down by one clamp bolt. The O-rings on the body seal oil, fuel and combustion gas from one another, so they are replaced every time an injector comes out.',
      spec:{ 'Clamps':`${e.cyl}, one bolt each`, 'Bolt':'per FSM', 'Seals':'body O-rings, replace', 'Source':'PRESS · H' } });
    add({ id:'uvch', name:'Under-valve-cover harnesses', group:'ignition', qty:2,
      deps: glow ? ['injectors', 'glow'] : ['injectors'], mesh:'coil',
      teach:'Inside each valve cover a harness runs along the head to every injector solenoid and every glow plug, and leaves through a connector moulded into the valve cover gasket. The covers move with heat and the wires chafe on the rocker gear, which is the classic cause of 7.3 misfires and no-glow faults. Unplugging the gasket connector before lifting the cover is the first job.',
      spec:{ 'Count':'2, one per head', 'Connects':'injectors and glow plugs', 'Exit':'connector in the valve cover gasket', 'Source':'PRESS · M' } });
    if (glow)
      add({ id:'glowrelay', name:'Glow plug relay', group:'ignition', deps:['valvecover'], mesh:'sensor',
        teach:'A heavy relay commanded by the PCM switches battery current to all eight glow plugs. It sits on top of the engine near the passenger valve cover, and it is the part that most often fails.',
        spec:{ 'Location':'top of the engine, passenger valve cover', 'Control':'PCM', 'Source':'PRESS (dieselhub) · H' } });
    add({ id:'fuelfilter', name:'Fuel bowl: filter, water separator, heater & drain', group:'fuel', deps:['intake'], mesh:'oilfilter',
      teach:'One cast housing on top of the engine in the valley filters the fuel, separates and drains water, heats the fuel in the cold and regulates the low pressure sent to the heads. The drain valve on its side is opened to let water out, and the element is changed from the top.',
      spec:{ 'Location':'top of the engine, in the valley', 'Contains':'filter, water separator, heater, drain valve', 'Source':'PRESS · H' } });
    add({ id:'turbopedestal', name:'Turbo pedestal', group:'induction', deps:['head'], mesh:'exmanifold',
      teach:'The 7.3 carries its single wastegated Garrett turbo on a cast pedestal at the rear of the valley, fed by up-pipes from both exhaust manifolds. The pedestal carries the oil feed and drain and houses the back-pressure valve actuator. The turbo is not a variable-geometry unit.',
      spec:{ 'Location':'rear of the valley', 'Turbo':'Garrett TP38 / GTP38, wastegated', 'Source':'PRESS · H' } });
    add({ id:'ebpv', name:'Exhaust back-pressure valve (EBPV)', group:'exhaust', deps:['turbopedestal'], mesh:'wastegate',
      teach:'A butterfly in the turbine outlet with its actuator inside the pedestal. After a cold start it closes to make the engine work against back-pressure, which warms it up faster. It is not an exhaust brake.',
      spec:{ 'Location':'turbine outlet, actuator in the pedestal', 'Purpose':'cold-start warm-up', 'Source':'PRESS (dieselhub) · H' } });
  }

  /* ------------------------------------------------------------------ */
  /* VW EA288                                                             */
  /* ------------------------------------------------------------------ */
  if (tdi){
    if (glow)
      add({ id:'glowharness', name:'Glow plug harness & J179 glow time control module', group:'ignition', deps:['glow'], mesh:'coil',
        teach:'The four steel glow plugs (Q10–Q13) are each fed by their own output from the J179 module, which drives them with PWM so the voltage at the plug can be set: up to 11.5 V to reach over 1,000 °C within 2 seconds for a cold start, then about 4.4 V of post-start glow for up to 5 minutes to cut smoke and combustion noise. The four are switched one after another rather than together, to spare the vehicle\'s electrical supply.',
        spec:{ 'Plugs':'Q10, Q11, Q12, Q13', 'Module':'J179, engine bay beside the plugs', 'Pre-glow':'≤11.5 V, >1,000 °C in ≤2 s', 'Post-glow':'4.4 V effective, ≤5 min', 'Source':'SSP514 pp.41, 63–64 · H' } });
    add({ id:'vacpump', name:'Vacuum pump (in the oil/vacuum pump unit)', group:'lube', deps:['oilpump'], mesh:'oilpump',
      teach:'A diesel has no throttle vacuum, so the brake servo, the turbo vacuum unit and the EGR flap need a pump. On the EA288 it is not on the end of the camshaft as on older TDIs. It shares one housing and one shaft with the oil pump on the bottom of the block, driven by a toothed belt that runs in the oil, and its vacuum line leaves through a gallery in the block.',
      spec:{ 'Drive':'shared shaft with the oil pump, belt in oil from the crank', 'Outlet':'gallery in the block → vacuum line', 'Source':'SSP514 pp.12–13 · H' } });
  }

  return out;
}
