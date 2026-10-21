/* supra2jz — the Toyota 2JZ-GTE's own parts, from the 1997 Supra repair manual
 * (RM502U). Only the `i6-30-legend` engine gets them; every other engine gets
 * an empty list.
 *
 * Names are the manual's own wording. Torques are the printed N·m figures. Each
 * part's spec carries its step in the factory removal procedure:
 *   TB = timing belt removal (EM-15…18), HR = cylinder head removal (EM-29…33),
 *   HD = cylinder head disassembly (EM-34), BD = cylinder block disassembly
 *   (EM-71…78), OP = oil pump removal (LU-9…11), TC = turbocharger removal
 *   (TC-10…17), INJ = injector / air intake chamber removal (SF-20…24).
 *   Other prefixes name the section they come from.
 * A part's deps are what it is bolted onto, so it has to come off before any of
 * them can. This module can add parts but cannot change the existing ones, so
 * where an existing part ought to depend on one of these (No.1/No.2 timing belt
 * covers on the guide, for example), that link is missing. The module's report
 * lists those gaps. */

const SRC = 'Toyota RM502U (1997 Supra), 2JZ-GTE';
const pat = (kind, count) => ({ kind, count });

/* parts split into one tree entry per physical piece */
export const instanced = ['bhplates', 'turbostays', 'turbowater', 'injinsulators', 'railspacers',
                          'injholders', 'wbypass', 'efans'];

export function parts(e, ctx){
  if (!e || e.id !== 'i6-30-legend') return [];
  const P = [];
  const add = (o) => { P.push(Object.assign({ qty:1, deps:[], removable:true }, o)); return o.id; };

  /* ================= timing drive ================= */
  add({ id:'tbcover3', name:'No.3 timing belt cover', group:'timing', deps:['coils', 'valvecover'], mesh:'frontcover',
    teach:'Most people assume this is an engine cover. The manual calls it the No.3 timing belt cover: the long cover that runs down the middle of the engine over the two cylinder head covers and the ignition coils. The oil filler cap passes through it and has to come out first. After that, ten 5 mm hex bolts and it lifts off. It is the first thing off in the timing-belt job (step 5) and the coil job (IG-6), because nothing on top of the engine can be reached with it in place.',
    spec:{ 'Manual name':'No.3 Timing Belt Cover', 'Fasteners':'10 bolts, 5 mm hex', 'Torque':'not printed', 'Comes off first':'Oil filler cap',
           'Factory step':'TB-5 (EM-15) · IG-6 step 1', 'Source':SRC } });

  add({ id:'tbcover4', name:'No.4 timing belt cover (rear plate)', group:'timing', deps:['camseals'], mesh:'frontcover',
    torque:{ nm:8.0, size:'M6', count:4, pattern:pat('perimeter', 4), stages:['8.0 N·m'] },
    teach:'A pressed plate on the front face of the head, behind the two camshaft timing pulleys. It carries the cam timing marks: at TDC No.1 compression, each pulley mark lines up with a mark on this plate. The engine wire protector clamps to it. It can only come off after both cam pulleys are off (HR-18, then HR-19). On a 2JZ the cam timing check is made against this cover, so a bent one gives a wrong reading.',
    spec:{ 'Manual name':'No.4 Timing Belt Cover', 'Fasteners':'4 bolts', 'Torque':'8.0 N·m', 'Carries':'camshaft timing marks, engine wire protector clamp',
           'Factory step':'HR-19 (EM-31)', 'Source':SRC } });

  add({ id:'tbguide', name:'Timing belt guide', group:'timing', deps:['timing'], mesh:'timing',
    teach:'A dished washer on the crank nose, in front of the crankshaft timing pulley. It stops the belt walking forward off the pulley. It goes on after the belt and before the No.1 cover, with the cup side facing outward (EM-22 step 4). Fitted backwards, its rim rubs the edge of the belt until the belt frays.',
    spec:{ 'Manual name':'Timing Belt Guide', 'Fasteners':'none, held by the crank pulley', 'Fit':'cup side outward',
           'Factory step':'TB-14 (EM-17)', 'Source':SRC } });

  add({ id:'tbplate', name:'Timing belt plate', group:'timing', deps:['crksprocket'], mesh:'timing',
    torque:{ nm:7.8, size:'M6', count:1, pattern:pat('sequence', 1), stages:['7.8 N·m'] },
    teach:'A small plate held by a single bolt. It goes on immediately after the crankshaft timing pulley slides onto its key (EM-21 step 1c) and comes off immediately before it (TB-17a). Toyota\'s warning for this area: do not scratch the sensor teeth on the crankshaft timing pulley. Those teeth are what the crank position sensor reads, so a slipped tool here gives a misfire that looks electrical.',
    spec:{ 'Manual name':'Timing Belt Plate', 'Fasteners':'1 bolt', 'Torque':'7.8 N·m',
           'Factory step':'TB-17(a) (EM-18)', 'Source':SRC } });

  /* ================= accessory drive ================= */
  add({ id:'dbtbracket', name:'Drive belt tensioner bracket (M/T)', group:'accessory', deps:['oilpump'], mesh:'pulley',
    torque:{ nm:27, size:'M8', count:2, pattern:pat('sequence', 2), stages:['27 N·m'] },
    teach:'Fitted to manual-gearbox cars only. It is the anchor for the gas damper that steadies the drive belt tensioner. It is held by two nuts at the front of the engine and comes off late in the strip, during oil pump removal (LU-9 step 7).',
    spec:{ 'Manual name':'Drive Belt Tensioner Bracket (M/T)', 'Fasteners':'2 nuts', 'Torque':'27 N·m',
           'Factory step':'OP-7 (LU-9)', 'Source':SRC } });

  add({ id:'dbtdamper', name:'Drive belt tensioner damper (M/T)', group:'accessory', deps:['dbtbracket', 'accbelt'], mesh:'pulley',
    torque:{ nm:20, size:'M8', count:2, pattern:pat('sequence', 2), stages:['20 N·m'] },
    teach:'A gas-filled strut between the bracket and the drive belt tensioner arm, fitted to M/T cars. With a manual gearbox the crank speed changes sharply on every gear change, and without this strut the tensioner arm flutters. It is the very first thing off in the timing-belt, head and generator jobs. It holds pressure: before you throw one away, pull the rod out fully and drill the cylinder to let the gas out.',
    spec:{ 'Manual name':'Drive Belt Tensioner Damper (M/T)', 'Fasteners':'2 nuts', 'Torque':'20 N·m', 'Disposal':'extend rod, drill to release gas',
           'Factory step':'TB-2 · HR-3 · CH-8', 'Source':SRC } });

  /* ================= sequential turbo hardware ================= */
  add({ id:'turbelbow', name:'Turbine outlet elbow', group:'exhaust', deps:['turbo'], mesh:'exmanifold',
    torque:{ nm:25, size:'M8', count:12, pattern:pat('star', 6), stages:['uniformly, several passes', '25 N·m'], lube:'12 new nuts, 2 new gaskets' },
    teach:'The single cast elbow that joins the two turbine outlets. Both turbos bolt to it, 6 new nuts each at 25 N·m, and it hands the exhaust on to the front pipe. The two turbos and this elbow come off the exhaust manifold as one assembly: 8 new nuts at 54 N·m, tightened evenly over several passes (TC-29). The turbos are separated from the elbow afterwards on the bench (TC-37/38).',
    spec:{ 'Manual name':'Turbine Outlet Elbow', 'Turbo to elbow':'6 nuts each, 25 N·m (new)', 'Assembly to manifold':'8 nuts, 54 N·m (new)',
           'Factory step':'TC-29 (assembly) · TC-37/38 (bench)', 'Source':SRC } });

  add({ id:'exmplate', name:'Exhaust manifold plate', group:'exhaust', deps:['turbelbow'], mesh:'exmanifold',
    teach:'A plate held by two bolts on the turbine outlet elbow. It comes off on the bench (TC-32) once the turbo assembly is out of the car. The manual does not print a torque for it.',
    spec:{ 'Manual name':'Exhaust Manifold Plate', 'Fasteners':'2 bolts', 'Torque':'not printed', 'Factory step':'TC-32', 'Source':SRC } });

  add({ id:'bhplates', name:'Bearing housing side plates', group:'induction', qty:2, deps:['turbo'], mesh:'turbo',
    torque:{ nm:8.8, size:'M6', count:4, pattern:pat('pair', 2), stages:['No.1 turbo 8.8 N·m · No.2 turbo 9.0 N·m'], lube:'new gasket' },
    teach:'There is one plate on the side of each turbo\'s bearing (centre) housing, held by 2 nuts on a new gasket. #1 is on the No.1 turbo (8.8 N·m) and #2 is on the No.2 turbo (9.0 N·m). They come off on the bench, each next to that turbo\'s water pipe (TC-34, TC-36).',
    spec:{ 'Manual name':'Bearing Housing Side Plate', 'Qty':'2 (one per turbo)', 'Torque':'No.1 8.8 N·m / No.2 9.0 N·m',
           'Factory step':'TC-34 (No.1) · TC-36 (No.2)', 'Source':SRC } });

  add({ id:'turbostays', name:'Turbocharger stays', group:'induction', qty:2, deps:['turbo'], mesh:'turbo',
    torque:{ nm:43, size:'M10', count:4, pattern:pat('pair', 2), stages:['43 N·m'] },
    teach:'Braces from each turbo down to the block, one bolt and one nut each at 43 N·m. Two turbos hanging off a hot cast manifold would crack it with their own vibration without these. The No.2 stay also holds the clamp for the No.1 turbo oil pipe, so refit that clamp under the nut (TC-26).',
    spec:{ 'Manual name':'No.1 / No.2 Turbocharger Stay', 'Fasteners':'1 bolt + 1 nut each', 'Torque':'43 N·m', 'Also holds':'No.1 turbo oil pipe clamp (No.2 stay)',
           'Factory step':'TC-25 (No.1) · TC-26 (No.2)', 'Source':SRC } });

  add({ id:'exbypasspipe', name:'Exhaust bypass pipe', group:'exhaust', deps:['ebv', 'turbelbow'], mesh:'exmanifold',
    torque:{ nm:25, size:'M8', count:4, pattern:pat('pair', 4), stages:['25 N·m'], lube:'4 new nuts, 2 new gaskets' },
    teach:'The short pipe that carries the gas the exhaust bypass valve lets through, to pre-spin the No.2 turbo before the main handover. It is the first hot-side part off once the heat insulator is gone (TC-21): 4 nuts and 2 gaskets, both renewed on refit.',
    spec:{ 'Manual name':'Exhaust Bypass Pipe', 'Fasteners':'4 nuts (new)', 'Torque':'25 N·m', 'Gaskets':'2, new',
           'Factory step':'TC-21', 'Source':SRC } });

  add({ id:'airtube4', name:'No.4 air tube & air bypass valve', group:'induction', deps:['turbo'], mesh:'bov',
    torque:{ nm:21, size:'M8', count:2, pattern:pat('pair', 2), stages:['21 N·m'], lube:'new gasket' },
    teach:'An assembly bolted to the No.1 turbo with 2 bolts at 21 N·m. The air bypass valve on it is Toyota\'s factory recirculation valve. The manual\'s test: air must not flow from port A to port B until vacuum is applied to the actuator. When the throttle snaps shut at boost, manifold vacuum opens the valve and the trapped charge is returned to the compressor inlet. It is not vented to the air. The No.2 turbo water pipe is also bolted to this tube, so that bolt comes out first (TC-18b).',
    spec:{ 'Manual name':'No.4 Air Tube and Air Bypass Valve Assembly', 'Fasteners':'2 bolts to No.1 turbo', 'Torque':'21 N·m',
           'Valve test':'no flow A→B; flows A→B with vacuum on the actuator', 'Factory step':'TC-18(d)(e)', 'Source':SRC } });

  add({ id:'intairconn', name:'Intake air connector & No.1 air tube', group:'induction', deps:['turbo'], mesh:'intake',
    torque:{ nm:21, size:'M8', count:2, pattern:pat('pair', 2), stages:['21 N·m'], lube:'new gasket' },
    teach:'The cold-side pipework that brings filtered air from the air cleaner and MAF meter to the compressor inlets. The No.1 air tube bolts to the No.1 turbo with 2 bolts at 21 N·m. The PCV hose from the No.2 cylinder head cover joins here, which is why the inside of the pipe is oily. The No.5 air hose, by the air cleaner duct at the front, is part of the same inlet tract; it comes off for radiator removal (RAD-7) and is not drawn separately.',
    spec:{ 'Manual name':'Intake Air Connector and No.1 Air Tube', 'No.1 air tube to No.1 turbo':'2 bolts, 21 N·m', 'Hoses':'air hose from No.2 air tube, PCV hose from No.2 head cover',
           'Factory step':'TC-18(g)', 'Source':SRC } });

  add({ id:'prestank', name:'Pressure tank & VSV for EVAP', group:'induction', deps:['block'], mesh:'bov',
    torque:{ nm:21, size:'M8', count:2, pattern:pat('pair', 2), stages:['21 N·m'] },
    teach:'A small vacuum reservoir with a one-way valve. It holds a supply of vacuum for the turbo control actuators, so the valves can still be moved under boost, when the manifold has no vacuum to give. Test: air passes from port A to port B only, and the tank holds 60 kPa of vacuum for a minute. It sits low on the intake side by the starter and dipstick, on one bracket with the VSV for EVAP (2 nuts, 21 N·m). It comes off in the head job (HR-10).',
    spec:{ 'Manual name':'Pressure Tank and VSV Assembly', 'Fasteners':'2 nuts', 'Torque':'21 N·m', 'Check valve':'A→B only; holds 60 kPa vacuum',
           'VSV for EVAP':'30–34 Ω', 'Factory step':'HR-10 (EM-30)', 'Source':SRC } });

  /* ================= intake: air intake chamber & throttle ================= */
  add({ id:'intchamber', name:'Air intake chamber', group:'induction', deps:['intake'], mesh:'intake',
    torque:{ nm:27, size:'M8', count:7, pattern:pat('inside-out', 7), stages:['uniformly, several passes', '27 N·m'], lube:'new gasket' },
    teach:'On the 2JZ the plenum is a separate casting from the intake manifold underneath it. The throttle body, IAC valve, EGR pipe and most of the vacuum hoses fasten to the chamber, and the delivery pipe and injectors are on the manifold below. It is held by 5 bolts and 2 nuts (with the engine wire bracket), tightened evenly to 27 N·m on a new gasket. Getting it off is the long part of the injector job: throttle body, dipsticks, both stays, the control cable bracket, 4 connectors, 11 hoses and the EGR pipe all come first (INJ-2…11). Maximum warpage 0.15 mm.',
    spec:{ 'Manual name':'Air Intake Chamber', 'Fasteners':'5 bolts + 2 nuts', 'Torque':'27 N·m', 'Warpage limit':'0.15 mm',
           'Factory step':'INJ-12 (SF-22) · HR-8', 'Source':SRC } });

  add({ id:'chamberstay', name:'Air intake chamber stay', group:'induction', deps:['intchamber'], mesh:'intake',
    torque:{ nm:19, size:'M8', count:2, pattern:pat('pair', 2), stages:['19 N·m'] },
    teach:'A brace from the air intake chamber down to the engine, one bolt and one nut at 19 N·m. A long alloy plenum carrying a throttle body on one end resonates without it. It comes off early in the injector job (INJ-5), right after the dipsticks.',
    spec:{ 'Manual name':'Air Intake Chamber Stay', 'Fasteners':'1 bolt + 1 nut', 'Torque':'19 N·m', 'Factory step':'INJ-5 (SF-21)', 'Source':SRC } });

  add({ id:'manifoldstay', name:'Manifold stay', group:'induction', deps:['intchamber'], mesh:'intake',
    torque:{ nm:39, size:'M10', count:2, pattern:pat('pair', 2), stages:['39 N·m'] },
    teach:'A second brace, under the chamber, with 2 bolts at 39 N·m. That is twice the chamber stay\'s torque, because this one carries the load from the intake side of the block. It is the last thing off before the chamber itself (INJ-11).',
    spec:{ 'Manual name':'Manifold Stay', 'Fasteners':'2 bolts', 'Torque':'39 N·m', 'Factory step':'INJ-11 (SF-22)', 'Source':SRC } });

  add({ id:'subthrottle', name:'Sub-throttle actuator', group:'induction', deps:['throttle'], mesh:'throttle',
    teach:'The 2JZ-GTE throttle body has two blades in series. The driver works the main one. The ECU works the second one through this electric actuator, held by 4 screws. Traction control (TRAC) closes it to cut engine torque without the pedal moving. Coil resistance 0.82–0.98 Ω. The manual says not to clean the sensors, actuator, dashpot or opener on this body with solvent.',
    spec:{ 'Manual name':'Sub-Throttle Actuator', 'Fasteners':'4 screws', 'Coil':'0.82–0.98 Ω', 'Factory step':'SF-43 inspection step 6', 'Source':SRC } });

  add({ id:'subtps', name:'Sub-throttle position sensor', group:'sensors', deps:['throttle'], mesh:'sensor',
    teach:'A potentiometer on the sub-throttle shaft. It reports to the ECU where the traction-control blade actually is. It is set, not just bolted on: loosen the 2 set screws and adjust the switch with a 0.45 mm feeler gauge between the throttle stop screw and the lever (the main TPS uses 0.65 mm). Its connector is one of the first unplugged when the throttle body comes off.',
    spec:{ 'Manual name':'Sub-Throttle Position Sensor', 'Fasteners':'2 set screws', 'Adjustment':'0.45 mm feeler', 'Factory step':'adjust only (SF-43)', 'Source':SRC } });

  add({ id:'iaccheck', name:'IAC check valve & seal washer', group:'induction', deps:['intchamber'], mesh:'sensor',
    teach:'A small one-way valve with a seal washer, in the IAC valve\'s air path. It comes out after the IAC valve has been unbolted from the air intake chamber and its air hose and two water bypass hoses are off (SF-51 step 3d). It goes back in first. The manual gives one warning for it: watch the installation direction. Fitted backwards it stops the IAC air, and the engine will not idle cold.',
    spec:{ 'Manual name':'Check Valve, Seal Washer (IAC valve)', 'Fit':'direction marked, see SF-53', 'Factory step':'IAC-3(d) (SF-51)', 'Source':SRC } });

  /* ================= fuel ================= */
  add({ id:'injinsulators', name:'Injector insulators', group:'fuel', qty:12, deps:['injectors'], mesh:'injector',
    teach:'There are two insulators per injector: six come off with the injector holders, and six come out of the delivery pipe once it is lifted away. All twelve are new every time the injectors come out (INJ-16 b and e). They keep heat from the head and manifold out of the injector, and they hold the injector square so its O-rings seal.',
    spec:{ 'Manual name':'Insulator', 'Qty':'12 (6 at the holders + 6 at the delivery pipe)', 'Reuse':'never', 'Factory step':'INJ-16(b)(e)', 'Source':SRC } });

  add({ id:'railspacers', name:'Delivery pipe spacers', group:'fuel', qty:2, deps:['intake'], mesh:'fuelrail',
    teach:'Two spacers sit between the delivery pipe\'s mounting feet and the intake manifold. They set the height of the pipe, which sets how far each injector is pushed into its seat. They are lifted off after the delivery pipe and injectors come out (INJ-16d).',
    spec:{ 'Manual name':'Spacer', 'Qty':2, 'Delivery pipe bolts':'2 bolts, 21 N·m', 'Factory step':'INJ-16(d)', 'Source':SRC } });

  add({ id:'injholders', name:'Injector holders', group:'fuel', qty:3, deps:['fuelrail', 'injinsulators'], mesh:'injector',
    torque:{ nm:7.8, size:'M6', count:6, pattern:pat('pair', 2), stages:['7.8 N·m'] },
    teach:'Three stamped holders, each pressing two injectors down into the intake manifold through their insulators, with 2 bolts at 7.8 N·m. The engine wire clamps onto them. They are the first thing off when the delivery pipe and injectors come out (INJ-16a). Lubricate the injector O-rings with gasoline or spindle oil only; never use engine oil or grease.',
    spec:{ 'Manual name':'Injector Holder', 'Qty':3, 'Fasteners':'6 bolts', 'Torque':'7.8 N·m', 'Factory step':'INJ-16(a)', 'Source':SRC } });

  add({ id:'pulsedamper', name:'Fuel pressure pulsation damper', group:'fuel', deps:['fuellines'], mesh:'fuelrail',
    torque:{ nm:41, size:'M12 union', count:1, pattern:pat('sequence', 1), stages:['41 N·m (35 N·m on SST, 30 cm fulcrum)'], lube:'new upper + lower gaskets' },
    teach:'A spring-and-diaphragm can screwed in as the union bolt at the lower end of the fuel inlet pipe, at the fuel pipe support on the block. It absorbs the pressure ripple from the injectors opening and closing. It is low on the intake side, so the starter has to come off before you can reach it. Use SST 09612-24014 and new large (upper) and small (lower) gaskets.',
    spec:{ 'Manual name':'Fuel Pressure Pulsation Damper', 'Torque':'41 N·m (35 with SST)', 'Gaskets':'large upper + small lower, new', 'Access':'starter removed',
           'Factory step':'PD-2 (SF-31) · HR-11', 'Source':SRC } });

  /* ================= cooling ================= */
  add({ id:'wateroutlet', name:'Water outlet (ECT sensor & sender gauge)', group:'cooling', deps:['head'], mesh:'waterpump',
    torque:{ nm:21, size:'M8', count:2, pattern:pat('pair', 2), stages:['21 N·m'], lube:'new gasket' },
    teach:'The housing where coolant leaves the head. The upper radiator hose and the turbo water hoses connect to it. It carries the ECT sensor for the ECU and a separate ECT sender for the dashboard gauge, which are two different parts in two different holes. It is held by 2 bolts at 21 N·m on a new gasket. The No.1 water bypass pipe slips into it on O-rings.',
    spec:{ 'Manual name':'Water Outlet', 'Fasteners':'2 bolts', 'Torque':'21 N·m', 'Carries':'ECT sensor, ECT sender gauge, upper radiator hose, turbo water hoses',
           'Factory step':'HR-5(c) · WP-12', 'Source':SRC } });

  add({ id:'waterinlet', name:'Water inlet (thermostat housing)', group:'cooling', deps:['waterpump'], mesh:'waterpump',
    torque:{ nm:21, size:'M8', count:2, pattern:pat('pair', 2), stages:['21 N·m'], lube:'new thermostat gasket' },
    teach:'On the 2JZ the thermostat is not at the head outlet. It sits in this inlet at the bottom of the water pump, where the lower radiator hose comes in, and controls how much cold water from the radiator is let in (CO-14). Line up the jiggle valve with the protrusion on the inlet. The thermostat opens at 80–84 °C and lifts at least 8.5 mm at 95 °C. The manual: never run the engine without it.',
    spec:{ 'Manual name':'Water Inlet and Lower Radiator Hose Assembly', 'Fasteners':'2 nuts', 'Torque':'21 N·m', 'Thermostat':'opens 80–84 °C, ≥8.5 mm lift at 95 °C',
           'Factory step':'TS-4 (CO-14)', 'Source':SRC } });

  add({ id:'wbypass', name:'Water bypass pipes', group:'cooling', qty:4, deps:['waterpump'], mesh:'waterpump',
    teach:'The pipes are numbered in the manual. #1 is the No.1 bypass pipe, a slip fit on 2 O-rings between the water outlet and the water pump (fit with soapy water). #2 runs along the block into the pump, 2 bolts and 2 nuts at 21 N·m, and takes the heater and turbo water hoses. #3 is built into the No.2 air tube on the No.2 turbo and feeds the heater hose (21 N·m). #4 is on the intake side and feeds the IAC valve and the coolant-heated throttle body.',
    spec:{ 'Manual name':'No.1–No.4 Water Bypass Pipe', 'No.1':'slip fit, 2 new O-rings — HR-5(d)', 'No.2':'2 bolts + 2 nuts, 21 N·m — BD-8 / WP-13', 'No.3':'with No.2 air tube, 21 N·m — TC-31', 'No.4':'2 bolts — INJ-10', 'Source':SRC } });

  add({ id:'turbowater', name:'Turbo water pipes', group:'cooling', qty:2, deps:['turbo'], mesh:'turbo',
    torque:{ nm:9.0, size:'M6', count:4, pattern:pat('pair', 2), stages:['No.1 9.0 N·m · No.2 8.8 N·m'], lube:'new gasket' },
    teach:'Each turbo\'s bearing housing is water-cooled. A steel water pipe bolts to each one with 2 nuts on a new gasket: No.1 at 9.0 N·m, No.2 at 8.8 N·m. Turbo water hoses run back to the water outlet and the No.2 water bypass pipe. After the engine is switched off, coolant keeps moving through here by thermosiphon and carries heat out of the bearings. That is why a 2JZ that is idled briefly before shutdown keeps its turbo seals.',
    spec:{ 'Manual name':'No.1 / No.2 Turbo Water Pipe (+ Turbo Water Hoses)', 'Torque':'No.1 9.0 N·m / No.2 8.8 N·m', 'Factory step':'TC-35 (No.1) · TC-33 (No.2)', 'Source':SRC } });

  add({ id:'heaterunion', name:'Heater union', group:'cooling', deps:['head'], mesh:'waterpump',
    teach:'A steel tube pressed into the cylinder head for the heater water hose. It never comes out in service. A new one goes into a new head only (EM-45): adhesive 08833-00070 (Three Bond 1324) on the end, then tapped in with a wooden block until 48 mm protrudes.',
    spec:{ 'Manual name':'Heater Union', 'Fit':'press fit + adhesive 1324', 'Protrusion':'48 mm', 'Factory step':'not removed (new head only)', 'Source':SRC } });

  add({ id:'efans', name:'Electric cooling fans', group:'cooling', qty:2, deps:['radiator'], mesh:'radiator',
    torque:{ nm:3.9, size:'M5', count:6, pattern:pat('perimeter', 3), stages:['fan motors 3.9 N·m'] },
    teach:'The 2JZ-GTE has a belt-driven fan with a fluid coupling on the water pump, plus two electric fans on the radiator\'s No.1 fan shroud. The ECT switch in the radiator and two relays switch the electric fans. They come off only after the radiator is out (CO-31): 6 screws for the fans, then 6 screws for the motors at 3.9 N·m. Fit each motor with its drain hole facing down. Current draw 2.5–4.5 A.',
    spec:{ 'Manual name':'Electric Cooling Fan (fan + fan motor)', 'Qty':'2', 'Motor torque':'3.9 N·m', 'Current':'2.5–4.5 A', 'Factory step':'FAN-2/3 (CO-31)', 'Source':SRC } });

  add({ id:'ectswitch', name:'ECT switch (electric cooling fan)', group:'sensors', deps:['radiator'], mesh:'sensor',
    torque:{ nm:7.4, size:'M16', count:1, pattern:pat('sequence', 1), stages:['7.4 N·m'], lube:'new O-ring, soapy water' },
    teach:'A temperature switch screwed into the radiator. It is not in the engine. The contacts are closed below 91 °C and open above 100 °C, and the relay logic runs the electric fans from that. Because the switch opens when hot, a broken wire looks the same as a hot engine, so the fans run. That makes the circuit fail safe. 7.4 N·m on a new O-ring.',
    spec:{ 'Manual name':'ECT Switch (for Electric Cooling Fan)', 'Torque':'7.4 N·m', 'Switching':'closed <91 °C, open >100 °C', 'Factory step':'RAD-12', 'Source':SRC } });

  /* ================= lubrication ================= */
  add({ id:'oilbaffle', name:'Oil pan baffle plate', group:'lube', deps:['oilpan'], mesh:'oilpan',
    torque:{ nm:8.8, size:'M6', count:7, pattern:pat('perimeter', 7), stages:['8.8 N·m'] },
    teach:'A plate across the opening in the No.1 oil pan, held by 5 bolts and 2 nuts at 8.8 N·m. It stops the oil surging away from the strainer under hard cornering and braking. It is reached from below once the No.2 pan and the strainer are off (OP-13).',
    spec:{ 'Manual name':'Oil Pan Baffle Plate', 'Fasteners':'5 bolts + 2 nuts', 'Torque':'8.8 N·m', 'Factory step':'OP-13 (LU-10)', 'Source':SRC } });

  add({ id:'oilpan2', name:'No.2 oil pan (lower)', group:'lube', deps:['oilpan', 'oilbaffle'], mesh:'oilpan',
    torque:{ nm:8.8, size:'M6', count:16, pattern:pat('perimeter', 16), stages:['8.8 N·m'], lube:'FIPG 08826-00080, 4–5 mm bead' },
    teach:'The 2JZ\'s sump is in two pieces. The No.1 pan is a structural alloy casting bolted to the block. This No.2 pan is the pressed-steel tray under it that actually holds the oil, and it carries the drain plug (38 N·m). It is held by 14 bolts and 2 nuts at 8.8 N·m on a 4–5 mm bead of FIPG, and it has to be assembled within 5 minutes of laying the bead. Break the seal with SST 09032-00100, a thin blade. Do not lever it, or you mark the No.1 pan\'s sealing face.',
    spec:{ 'Manual name':'No.2 Oil Pan', 'Fasteners':'14 bolts + 2 nuts', 'Torque':'8.8 N·m', 'Seal':'FIPG, 4–5 mm, assemble within 5 min', 'Drain plug':'38 N·m, new gasket',
           'Factory step':'OP-11 (LU-10)', 'Source':SRC } });

  add({ id:'oillevel', name:'Oil level sensor', group:'sensors', deps:['oilpan2'], mesh:'sensor',
    torque:{ nm:5.4, size:'M6', count:4, pattern:pat('perimeter', 4), stages:['5.4 N·m'], lube:'new gasket' },
    teach:'A level switch that reaches down into the sump and drives the low-oil warning. It is held by 4 bolts at only 5.4 N·m on a new gasket. It comes off before the No.2 pan (OP-10), and the manual adds: do not drop it when you lift it out.',
    spec:{ 'Manual name':'Oil Level Sensor', 'Fasteners':'4 bolts', 'Torque':'5.4 N·m', 'Factory step':'OP-10 (LU-9)', 'Source':SRC } });

  add({ id:'turbooilout', name:'Turbo oil outlet pipe', group:'lube', deps:['oilpan'], mesh:'oilpan',
    torque:{ nm:27, size:'M8', count:2, pattern:pat('pair', 2), stages:['27 N·m'], lube:'new gasket' },
    teach:'The two turbos drain their oil by gravity through hoses into this one pipe on the side of the No.1 oil pan (2 nuts, 27 N·m, new gasket). It has to sit below both turbo bearing housings. A drain that has to climb anywhere backs oil up into the turbo, and the oil comes out past the seals as smoke.',
    spec:{ 'Manual name':'Turbo Oil Outlet Pipe', 'Fasteners':'2 nuts', 'Torque':'27 N·m', 'Hoses':'2 turbo oil outlet hoses', 'Factory step':'OP-14 (LU-10)', 'Source':SRC } });

  add({ id:'oilfbracket', name:'Oil filter bracket', group:'lube', deps:['block'], mesh:'oilfilter',
    torque:{ nm:90, size:'M20 union', count:1, pattern:pat('sequence', 1), stages:['90 N·m'], lube:'new gasket + O-ring' },
    teach:'The alloy bracket that takes oil out of the block\'s main gallery to the oil cooler and filter and back again. It is held by a single hollow union bolt at 90 N·m, on a new gasket and O-ring. It comes off in the block strip (BD-10), after the oil cooler and No.2 water bypass pipe.',
    spec:{ 'Manual name':'Oil Filter Bracket', 'Fasteners':'1 union bolt', 'Torque':'90 N·m', 'Factory step':'BD-10 (EM-72)', 'Source':SRC } });

  /* ================= cylinder head ancillaries ================= */
  add({ id:'egrcooler', name:'EGR cooler', group:'exhaust', deps:['head'], mesh:'exmanifold',
    torque:{ nm:8.8, size:'M6', count:8, pattern:pat('perimeter', 8), stages:['8.8 N·m'], lube:'new gasket' },
    teach:'A water-jacketed passage bolted to the cylinder head that cools the exhaust gas on its way back into the intake. Cooler EGR gas displaces more charge and lowers combustion temperature, which is the point of it: less NOx. It is held by 8 bolts at only 8.8 N·m on a new gasket. It comes off during head disassembly (HD-3), after the hangers and cam sensors.',
    spec:{ 'Manual name':'EGR Cooler', 'Fasteners':'8 bolts', 'Torque':'8.8 N·m', 'Factory step':'HD-3 (EM-34)', 'Source':SRC } });

  add({ id:'egrvalve', name:'EGR valve & EGR pipe', group:'exhaust', deps:['egrcooler', 'intchamber'], mesh:'wastegate',
    torque:{ nm:64, size:'M14 union', count:3, pattern:pat('sequence', 3), stages:['union bolt 64 N·m', 'pipe bolts 27 N·m'], lube:'new gasket' },
    teach:'The vacuum-operated valve that meters exhaust gas from the EGR cooler into the air intake chamber, through the EGR pipe. The pipe has a union bolt at the valve (64 N·m) and 2 bolts at the chamber end (27 N·m). The pipe has to come off before the air intake chamber can (INJ-9). The EGR gas temperature sensor (20 N·m, 64–97 kΩ at 50 °C) reads the flow so the ECU can tell whether EGR is actually happening.',
    spec:{ 'Manual name':'EGR Valve / EGR Pipe', 'Pipe union (valve)':'64 N·m', 'Pipe bolts':'27 N·m', 'EGR gas temp sensor':'20 N·m',
           'Factory step':'INJ-9 (SF-21)', 'Source':SRC } });

  add({ id:'vsvegr', name:'VSV for EGR', group:'sensors', deps:['intchamber'], mesh:'bov',
    teach:'A vacuum switching valve. The ECU energises it to send vacuum to the EGR valve, or to hold the vacuum off at idle, when cold and at full load. The 2JZ-GTE has several of these, each labelled by what it controls. This is the EGR one, 30–34 Ω, with its connector next to the chamber (INJ-7).',
    spec:{ 'Manual name':'VSV for EGR', 'Coil':'30–34 Ω', 'Factory step':'connector at INJ-7', 'Source':SRC } });

  add({ id:'vsvfpc', name:'VSV for fuel pressure control', group:'sensors', deps:['intchamber'], mesh:'bov',
    teach:'This one switches the fuel pressure regulator\'s vacuum reference. After a hot start, fuel can boil in the delivery pipe. The ECU uses this VSV to vent the regulator to atmosphere, which raises rail pressure for a short time so the vapour is pushed back into liquid and the engine does not stumble. 33–39 Ω.',
    spec:{ 'Manual name':'VSV for Fuel Pressure Control', 'Coil':'33–39 Ω', 'Factory step':'connector at INJ-7', 'Source':SRC } });

  add({ id:'hangerfront', name:'Front engine hanger', group:'head', deps:['head'], mesh:'head',
    torque:{ nm:39, size:'M10', count:2, pattern:pat('pair', 2), stages:['39 N·m'] },
    teach:'The steel lifting eye on the front of the cylinder head, where the hoist chain hooks on to lift the engine out. It comes off first when the head is stripped (HD-1) and goes back on last at 39 N·m. Lift only from the hangers. Lifting from a manifold is how alloy castings crack.',
    spec:{ 'Manual name':'Front Engine Hanger', 'Torque':'39 N·m', 'Factory step':'HD-1 (EM-34)', 'Source':SRC } });

  add({ id:'camsensor2', name:'Camshaft position sensor No.2', group:'sensors', deps:['head'], mesh:'sensor',
    torque:{ nm:8.8, size:'M6', count:2, pattern:pat('pair', 2), stages:['8.8 N·m'], lube:'new gasket' },
    teach:'The 2JZ-GTE has two camshaft position sensors, No.1 and No.2, each held by 2 bolts at 8.8 N·m on its own gasket. They sit under the engine hanger and ground strap. To reach them (IG-9): IAC connector and air hose off, then the hanger and strap, then the sensors. Cold resistance 835–1,400 Ω. The existing camshaft sensor card is No.1; this is the second.',
    spec:{ 'Manual name':'Camshaft Position Sensor (No.2)', 'Fasteners':'2 bolts', 'Torque':'8.8 N·m', 'Resistance (cold)':'835–1,400 Ω',
           'Factory step':'HD-2 · CMP-5 (IG-9)', 'Source':SRC } });

  add({ id:'hangerrear', name:'Rear engine hanger & ground strap', group:'head', deps:['head', 'camsensor2'], mesh:'head',
    torque:{ nm:39, size:'M10', count:2, pattern:pat('pair', 2), stages:['39 N·m'] },
    teach:'The rear lifting eye. The head\'s ground strap shares its 2 bolts. It sits over the camshaft position sensors, so it has to come off before you can reach them (IG-9). Refit the ground strap under it and torque to 39 N·m. With a loose strap, the sensor circuits on the head lose their ground and give readings that make no sense.',
    spec:{ 'Manual name':'Rear Engine Hanger + Ground Strap', 'Fasteners':'2 bolts', 'Torque':'39 N·m', 'Factory step':'HD-1 · CMP-3 (IG-9)', 'Source':SRC } });

  add({ id:'knock2', name:'Knock sensor 2', group:'sensors', deps:['block'], mesh:'sensor',
    torque:{ nm:44, size:'M12', count:1, pattern:pat('sequence', 1), stages:['44 N·m'] },
    teach:'The 2JZ-GTE has two knock sensors screwed into the side of the block (Knock Sensor 1 and Knock Sensor 2). Each is a piezo element, and its signal depends on how tightly it is clamped to the block, so 44 N·m is a calibration value, not just a fastening torque. Reaching them means removing the throttle body and the starter first (SF-75). Use SST 09816-30010.',
    spec:{ 'Manual name':'Knock Sensor 2', 'Torque':'44 N·m', 'Tool':'SST 09816-30010', 'Access':'throttle body + starter off',
           'Factory step':'BD-9/13 · KS-3 (SF-75)', 'Source':SRC } });

  return P;
}
