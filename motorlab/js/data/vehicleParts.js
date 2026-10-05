/* MotorLab — vehicle assembly graph (chassis → wheels), generated per vehicle.
 * Every panel, every corner and every cabin part is its own part, expanded
 * into left/right and corner pieces the way the engine tree expands pistons. */
import { VARIANTS, VARIANT_BY_SLOT_ID, variantsFor } from './vehicleVariants.js';

export const V_GROUPS = [
  { id:'chassis',   name:'Chassis & structure',  order:1 },
  { id:'subframe',  name:'Subframes & mounts',   order:2 },
  { id:'suspF',     name:'Front suspension',     order:3 },
  { id:'suspR',     name:'Rear suspension',      order:4 },
  { id:'steering',  name:'Steering',             order:5 },
  { id:'brakes',    name:'Brakes',               order:6 },
  { id:'wheels',    name:'Wheels & tyres',       order:7 },
  { id:'drive',     name:'Drivetrain',           order:8 },
  { id:'fuel',      name:'Fuel & exhaust',       order:9 },
  { id:'cool',      name:'Cooling',              order:10 },
  { id:'elec',      name:'Electrical',           order:11 },
  { id:'audio',     name:'Audio & 12 V',         order:12 },
  { id:'body',      name:'Body & aero',          order:13 },
  { id:'interior',  name:'Cockpit',              order:14 },
];
export const V_GROUP_BY_ID = Object.fromEntries(V_GROUPS.map(g => [g.id, g]));

const P = (o) => Object.assign({ group:'chassis', qty:1, deps:[], removable:true }, o);

export function buildVehicleTree(v){
  if (v.model === 'koenigsegg') return hypercarModelTree(v);
  if (v.model === 'harley') return cruiserModelTree(v);
  if (v.model === 'carconcept') return conceptModelTree(v);
  if (v.model) return modelTree(v);
  return v.class === 'bike' ? bikeTree(v) : v.class === 'kart' ? kartTree(v) : carTree(v);
}

/* ====================================================================== */

/* ====================================================================== */
/* A scanned hypercar: a carbon tub with everything else bolted to it.     */
function hypercarModelTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M8') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${Math.round(nm*0.6)} Nm`, `${nm} Nm`] });

  add({ id:'floor', name:'Carbon tub & floor', group:'chassis', removable:false,
    teach:'The tub is the car. A single carbon-fibre monocoque carries the suspension loads, the engine, the fuel and the occupants, and it is the reason a car this fast can weigh what a hatchback weighs. Nothing about it is serviceable — you either bond a repair patch under a schedule or you replace the tub.',
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Kerb mass':`${v.massKg} kg` } });
  add({ id:'shell', name:'Painted body panels', group:'body', deps:['floor'], torque:t(12,'perimeter',18,'M6'),
    teach:'The outer skin is carbon too, but painted. It carries no structural load at all — clamshells lift off the tub in one piece so a whole corner of the car can be reached in minutes.',
    spec:{ 'Length':`${v.lengthMm} mm`, 'Width':`${v.widthMm} mm`, 'Height':`${v.heightMm} mm`, 'Cd':v.cd } });
  add({ id:'aero', name:'Exposed carbon aero', group:'body', deps:['shell'], torque:t(15,'perimeter',14,'M6'),
    teach:'Splitter, sills, diffuser and wing. Left unpainted because paint is mass and because the weave is the point. The front splitter and rear diffuser work as a pair: move one and you move the aerodynamic balance, which changes how the car behaves at the exact moment you can least afford a surprise.',
    spec:{ 'Downforce':`${v.downforceKg} kg`, 'Frontal area':`${v.area} m²` } });
  add({ id:'glass', name:'Glazing', group:'body', deps:['shell'],
    teach:'Laminated screen, tempered side and rear glass. On a mid-engine car the rear glass usually doubles as the engine cover, so it takes heat as well as load.' });
  add({ id:'lights', name:'Lighting', group:'elec', deps:['shell'],
    teach:'LED clusters bonded into the bodywork with their own drivers. They are part of the aerodynamic surface, so a damaged light means a damaged aero surface, not just a bulb.' });
  add({ id:'interior', name:'Cabin, doors & seats', group:'interior', deps:['floor'], torque:t(24,'sequence',8,'M8'),
    teach:'Seats bonded or bolted straight to the tub, no seat rails — the pedal box moves instead. The doors are the famous dihedral synchro-helix arrangement: they rotate out and forward in one motion, so the car can be opened in a normal parking space.' });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, deps:['floor'], torque:t(150,'star',5,'M14'),
    teach:'Hollow carbon wheels save unsprung mass where it matters most — a kilogram off a wheel is worth several off the body. Torque them in a star pattern, in two stages, every time.',
    spec:{ 'Front':`${v.tyreF}/35 R${v.rimF}`, 'Rear':`${v.tyreR}/30 R${v.rimR}`, 'Torque':'150 Nm, star pattern' } });

  return finish(parts, v);
}

/* ====================================================================== */
/* A scanned custom cruiser: backbone frame, V-twin, and a lot of chrome.  */
function cruiserModelTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M10') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${nm} Nm`] });

  add({ id:'frame', name:'Backbone frame & forks', group:'chassis', removable:false,
    teach:'A steel backbone frame with the engine hung rigidly beneath it. Rake and trail are set by the steering-head angle and the fork offset, and a custom build usually pushes both a long way past standard — more rake means more stability in a straight line and heavier, slower steering everywhere else.',
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Rake':`${v.rakeDeg}°`, 'Trail':`${v.trailMm} mm`, 'Mass':`${v.massKg} kg` } });
  add({ id:'engine', name:'V-twin & primary drive', group:'drive', deps:['frame'], torque:t(60,'sequence',6,'M12'),
    teach:'A 45° air-cooled V-twin, both cylinders on one crankpin — which is exactly why it sounds the way it does: two power strokes 315° and 405° apart instead of evenly spaced. Build and tune the engine itself in the Engine Bay and Tuning workspaces.' });
  add({ id:'chrome', name:'Exhaust, bars & chrome', group:'body', deps:['engine'], torque:t(25,'sequence',8,'M8'),
    teach:'Pipes, risers, bars, mirrors, levers and covers. On a custom build the chrome is half the labour and most of the cost, and every bracket is one-off.' });
  add({ id:'tank', name:'Fuel tank & fenders', group:'fuel', deps:['frame'], torque:t(20,'sequence',4,'M8'),
    teach:'The tank is a stressed-looking part that carries nothing. It sits on rubber isolators on the backbone, because a rigidly-mounted tank on a rigidly-mounted V-twin cracks at the seams.',
    spec:{ 'Capacity':`${v.fuelL} L` } });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:2, deps:['frame'], torque:t(95,'star',5,'M12'),
    teach:'A narrow 21-inch front and a fat rear is the classic custom stance. The front wheel does most of the braking and all of the steering, so a bigger diameter with less section makes the bike fall into corners more slowly — deliberate, on this kind of build.',
    spec:{ 'Front':`${v.tyreF}/90 R${v.rimF}`, 'Rear':`${v.tyreR}/55 R${v.rimR}`, 'Torque':'95 Nm' } });
  add({ id:'trim', name:'Seat, cables & trim', group:'interior', deps:['tank'],
    teach:'Seat, grips, cables, lines and badging. Route the throttle and clutch cables before the bars go on, and check them lock to lock — a cable that pulls at full lock will open the throttle for you mid-turn.' });
  add({ id:'lights', name:'Lighting & indicators', group:'elec', deps:['chrome'],
    teach:'Headlamp, tail lamp and indicators. The wiring runs inside the bars and down the frame spine on a build like this, which looks superb and makes every fault a strip-down.' });
  add({ id:'dash', name:'Instruments', group:'elec', deps:['chrome'],
    teach:'Speedometer and warning cluster in the tank console or on the risers. It takes its signal from a wheel or gearbox sensor, so a wheel or sprocket change means recalibrating it.' });

  return finish(parts, v);
}

/* ====================================================================== */
/* A modelled concept car: a full road car, panel by panel, with the        */
/* brakes left behind when the wheels come off.                            */
function conceptModelTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M8') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${Math.round(nm*0.6)} Nm`, `${nm} Nm`] });

  add({ id:'chassis', name:'Platform & underbody', group:'chassis', removable:false,
    teach:'A concept car is built the way a low-volume car is built: extruded aluminium sections bonded and riveted into a floor and a pair of sills, with the suspension picking up on cast nodes at each corner. It is stiff, it is light, and it is far too slow to make in the quantities a mass-market steel unibody is made in — which is exactly why cars like this stay concepts.',
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Kerb mass':`${v.massKg} kg` } });
  add({ id:'engine', name:'Engine, gearbox & axles', group:'drive', deps:['chassis'], torque:t(90,'sequence',6,'M12'),
    teach:'Engine set behind the front axle line, gearbox behind that, and driveshafts out to all four corners through a centre differential. Mounting it behind the axle is the whole reason the bonnet is that long and the cabin is that far back: it buys weight distribution, and it costs cabin space. Build and tune the engine itself in the Engine Bay and Tuning workspaces.' });
  add({ id:'brakes', name:'Discs & calipers', group:'brakes', qty:4, deps:['chassis'], torque:t(110,'sequence',2,'M12'),
    teach:'Take a wheel off and this is what is behind it: a vented disc and a fixed caliper, bolted to the upright rather than to the wheel. A fixed caliper has pistons on both sides and no slide pins, so it flexes less and bites more evenly — and it has to be built around the disc, which is why it never comes off without the disc coming with it.',
    spec:{ 'Front disc':`${v.brakeF} mm`, 'Rear disc':`${v.brakeR} mm` } });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, deps:['brakes'], torque:t(140,'star',5,'M14'),
    teach:'Big rims, short sidewalls. A low-profile tyre gives sharper turn-in and almost no compliance, so every bump goes into the suspension and the structure instead. Torque in a star pattern, in two stages, every time.',
    spec:{ 'Front':`${v.tyreF}/30 R${v.rimF}`, 'Rear':`${v.tyreR}/30 R${v.rimR}`, 'Torque':'140 Nm, star pattern' } });
  add({ id:'shell', name:'Body sides & pillars', group:'body', deps:['chassis'], torque:t(20,'perimeter',16,'M6'),
    teach:'Sills, quarters and the pillars between them. This is the part of the body that actually carries load in a side impact, and on a car with the battery in the floor the sill is doing double duty: it protects the pack as well as the occupants.',
    spec:{ 'Length':`${v.lengthMm} mm`, 'Width':`${v.widthMm} mm`, 'Height':`${v.heightMm} mm`, 'Cd':v.cd } });
  add({ id:'panelHood', name:'Bonnet & front clip', group:'body', deps:['shell'], torque:t(14,'sequence',6,'M6'),
    teach:'A long bonnet over a short engine bay is mostly empty air, and that air is doing a job: it is the pedestrian-impact clearance and the front crush structure. The clamshell lifts with the wings attached, so a whole corner of the car can be reached at once.' });
  add({ id:'panelRear', name:'Rear clip & hatch', group:'body', deps:['shell'], torque:t(14,'sequence',6,'M6'),
    teach:'The tail carries the diffuser and the rear crash structure. On a fastback the hatch is a structural ring — cut it and the body loses torsional stiffness in a hurry.' });
  add({ id:'panelRoof', name:'Roof panel', group:'body', deps:['shell'], torque:t(12,'perimeter',10,'M6'),
    teach:'A roof is one of the highest pieces of mass on the car, so it is where weight hurts handling most. That is the whole argument for a carbon or aluminium roof on an otherwise steel body.' });
  add({ id:'panelDoorF', name:'Doors, mirrors & handles', group:'body', qty:2, deps:['shell'], torque:t(28,'sequence',6,'M8'),
    teach:'Each door is a frame, an outer skin, an intrusion beam, the glass and its regulator, and the mirror. Set the hinges before the striker: a door that is adjusted at the latch to hide a hinge problem will drop again the first time it is slammed.' });
  add({ id:'glass', name:'Glazing', group:'body', deps:['panelRoof'],
    teach:'Laminated windscreen, tempered elsewhere. The screen is bonded in and is a structural part of the body — the urethane bead is what stops the roof folding in a rollover, and it needs its full cure time before the car is driven.' });
  add({ id:'lights', name:'Lighting & signals', group:'elec', deps:['panelHood'],
    teach:'LED clusters with their own drivers, on the bus rather than on a switched feed. A failed unit usually means a failed driver, not a failed diode — and the cluster is bonded, so it replaces as an assembly.' });
  add({ id:'seats', name:'Seats & floor', group:'interior', deps:['chassis'], torque:t(45,'sequence',4,'M10'),
    teach:'Seats bolt through the floor into captive nuts bonded into the platform, with the belt pretensioners wired into the restraint bus. Disconnect the battery and wait before undoing anything with a squib in it.',
    spec:{ 'Seats':v.seats } });
  add({ id:'dash', name:'Dash, wheel & pedals', group:'interior', deps:['seats'], torque:t(22,'sequence',6,'M8'),
    teach:'The whole cockpit comes out as a crossbeam assembly: dash, column, pedal box and the wiring behind them. The accelerator is a sensor, not a cable — nothing between your foot and the throttle body is mechanical any more — but the brake pedal still pushes fluid, and always will.' });
  add({ id:'trim', name:'Wipers & plates', group:'body', deps:['glass'],
    teach:'Wiper arms are splined and handed, and they park to a mark on the screen rather than to a stop. Fit them to the mark, not to where they look right.' });

  return finish(parts, v);
}

/* ====================================================================== */
/* A vehicle backed by a real model: the panels are the parts.             */
function modelTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M10') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${nm} Nm`] });

  add({ id:'chassis', name:'Tube frame & floor', group:'chassis', removable:false,
    teach:'A stock car has no unibody at all. Everything hangs off a welded steel tube frame with a flat floor pan, and the bodywork is non-structural skin bolted to it. That is why these cars can be rebuilt overnight after contact.',
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Track':`${v.trackF} mm`, 'Mass':`${v.massKg} kg` } });
  add({ id:'cage', name:'Roll cage', group:'chassis', deps:['chassis'], torque:t(60,'sequence',8,'M12'),
    teach:'The cage is the car. Door bars on the driver\'s side are doubled and filled, the halo hoop carries the roof, and every tube is a load path calculated for a 200 mph impact into a concrete wall.' });
  add({ id:'engine', name:'Engine & drivetrain', group:'drive', deps:['chassis'], torque:t(85,'sequence',6,'M12'),
    teach:'Front-mounted, set well back and low, driving a live rear axle through a four-speed. Build and tune the engine itself in the Engine Bay and Tuning workspaces.' });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, deps:['chassis'], torque:t(160,'star',5,'M14'),
    teach:'Five lugs, steel wheels, and bias-ply slicks with no tread pattern at all. Stagger — running a slightly larger circumference on the right rear — is a real setup tool on an oval.',
    spec:{ 'Tyre':`${v.tyreF} section`, 'Rim':`${v.rimF}"`, 'Torque':'160 Nm, star pattern' } });
  add({ id:'seats', name:'Seat, belts & interior', group:'interior', deps:['cage'], torque:t(45,'sequence',6),
    teach:'A full containment seat welded to the cage, a six-point harness and a head-and-neck restraint. The seat is part of the structure, not fitted to the floor.' });
  add({ id:'panelFront', name:'Front clip & nose', group:'body', deps:['cage'], torque:t(22,'perimeter',12,'M6'),
    teach:'The nose is a separate bolt-on clip. It carries the splitter, the radiator opening and the crush structure, and it is designed to be replaced in minutes.' });
  add({ id:'panelRear', name:'Rear clip & tail', group:'body', deps:['cage'], torque:t(22,'perimeter',12,'M6'),
    teach:'The tail panel and rear valance set the height and angle of the spoiler, which is where most of this car\'s rear downforce comes from.' });
  add({ id:'panelArchF', name:'Front wheel arches', group:'body', qty:2, deps:['panelFront'], torque:t(18,'perimeter',10,'M6'),
    teach:'Arch clearance is regulated and measured. Too low and the car is illegal; too high and you lose the seal that makes the underbody work.' });
  add({ id:'panelArchR', name:'Rear wheel arches', group:'body', qty:2, deps:['panelRear'], torque:t(18,'perimeter',10,'M6'),
    teach:'The right rear arch takes the most load on an oval, and its shape is checked against a template after every session.' });
  add({ id:'panelDoorF', name:'Front door skins', group:'body', qty:2, deps:['panelArchF'], torque:t(18,'perimeter',10,'M6'),
    teach:'Door skins are flat sheet over the door bars — there is no door, no hinge and no window winder. The driver climbs in through the window.' });
  add({ id:'panelDoorR', name:'Rear quarter panels', group:'body', qty:2, deps:['panelArchR'], torque:t(18,'perimeter',10,'M6'),
    teach:'The quarter panels shape the air going to the spoiler. Body templates are checked here more closely than anywhere else on the car.' });
  add({ id:'panelRoof', name:'Roof & flaps', group:'body', deps:['panelDoorF'], torque:t(18,'perimeter',8,'M6'),
    teach:'The roof carries the roof flaps: sprung panels that pop up if the car spins backwards and the pressure over the roof drops, killing the lift that would otherwise fly it.' });
  add({ id:'panelHood', name:'Hood', group:'body', deps:['panelFront'], torque:t(14,'sequence',4,'M6'),
    teach:'Pinned, not hinged. The hood also carries the engine bay extraction louvres that let hot air out at speed.' });
  add({ id:'panelBoot', name:'Deck lid & spoiler', group:'body', deps:['panelRear'], torque:t(14,'sequence',4,'M6'),
    teach:'Spoiler angle and height are the single biggest aerodynamic adjustment available, and both are tightly regulated.' });
  add({ id:'glass', name:'Windscreen & rear window', group:'body', deps:['panelRoof'],
    teach:'Polycarbonate, not glass, with a tear-off stack on the outside of the windscreen. Light, and it does not shatter into the cockpit.' });
  add({ id:'netting', name:'Window net & hardware', group:'interior', deps:['glass'],
    teach:'The window net keeps the driver\'s arms inside in a roll and must release with one latch from inside. Officials check it before every race.' });

  return finish(parts, v);
}


/* ====================================================================== */
/* Which body styles have four doors, and what the back of the car is called. */
const FOUR_DOOR = new Set(['sedan', 'hatch', 'suv', 'rally', 'pickup']);
const TAIL_NAME = { hatch:'Tailgate', suv:'Tailgate', rally:'Tailgate', pickup:'Tailgate', semi:'Rear cab panel',
                    muscle:'Deck lid', coupe:'Boot lid', sedan:'Boot lid', gt:'Boot lid', roadster:'Boot lid',
                    super:'Engine cover & deck', hyper:'Engine cover & deck' };
export const bodyDoors = (v) => FOUR_DOOR.has(v.body) && v.class === 'car' ? 4 : 2;
export const isOpenWheeler = (v) => ['formula', 'dragster'].includes(v.id) || v.body === 'formula' || v.body === 'dragster';

/* ====================================================================== */
function carTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const race = ['formula','stockcar','dragster','awd-rally','drift','audi-quattro-s1'].includes(v.id);
  const awd = v.drivetrain === 'AWD', rwd = v.drivetrain !== 'FWD', fwd = v.drivetrain === 'FWD';
  const liveRear = v.suspR === 'liveaxle';
  const open = isOpenWheeler(v);
  const doors4 = bodyDoors(v) === 4;
  const roadster = v.body === 'roadster';
  const pickup = v.body === 'pickup';
  const mid = v.bay === 'mid' || v.bay === 'rear';
  const var_ = variantsFor(v);
  const VB = (slot) => VARIANT_BY_SLOT_ID[slot][var_[slot]] || VARIANTS[slot][0];
  const t = (nm, seq, count, size='M12') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${Math.round(nm*0.5)} Nm`, `${nm} Nm`] });
  const t1 = (nm, seq, count, size='M8') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${nm} Nm`] });

  /* ---- structure --------------------------------------------------------- */
  add({ id:'chassis', name: v.chassis === 'ladder frame' ? 'Ladder frame & floor' : v.chassis === 'tube frame' ? 'Tube-frame chassis'
        : v.chassis === 'carbon monocoque' ? 'Carbon monocoque' : v.chassis === 'chromoly tube' ? 'Chromoly tube chassis'
        : /aluminium/.test(v.chassis) ? 'Aluminium spaceframe & floor' : 'Unibody shell & floor pan',
    group:'chassis', removable:false, mesh:'chassis',
    teach:`${v.chassis === 'unibody' ? 'A unibody has no separate frame — folded and spot-welded steel panels form one stiff box, and the suspension bolts to reinforced pickup points in that box. The floor pan, sills, pillars and inner wings are all this one welded structure; the panels you can unbolt hang off it.' : v.chassis === 'ladder frame' ? 'Two full-length rails with crossmembers between them. The body bolts on through rubber mounts, so cab noise and chassis flex are separated — ideal for towing, poor for handling.' : v.chassis === 'carbon monocoque' ? 'A single carbon-fibre tub the driver sits inside. Torsional stiffness of 30,000+ Nm/degree means the suspension actually does the work instead of the chassis flexing.' : /aluminium/.test(v.chassis) ? 'Extruded and cast aluminium sections bonded and riveted into a floor, sills and towers. Light and stiff, and almost impossible to repair after a structural hit.' : 'Welded steel tubing triangulated so every load path is a tension or compression member — no bending.'} Torsional rigidity is the number that matters: a floppy chassis makes every suspension change meaningless.`,
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Kerb mass':`${v.massKg} kg` } });

  if (race) add({ id:'cage', name:'Roll cage', group:'chassis', deps:['chassis'], mesh:'cage', torque:t(60,'sequence',8,'M12'),
    teach:'A cage is not just safety equipment — a well-triangulated cage tied into the strut towers can double the shell\'s torsional stiffness. That is why cars feel sharper after one goes in. The feet are plated to the floor; a cage bolted through bare sheet metal pulls through in a rollover.' });

  add({ id:'subfront', name:'Front subframe', group:'subframe', deps:['chassis'], mesh:'subfront', torque:t(110,'star',8,'M14'),
    teach:'Everything the front axle does passes through this frame: engine mounts, lower arms, steering rack, anti-roll bar. Its bushings decide how much of that gets to the shell — solid mounts sharpen turn-in and let every road imperfection through.' });
  add({ id:'subrear', name: liveRear ? 'Rear crossmember & axle mounts' : 'Rear subframe', group:'subframe', deps:['chassis'], mesh:'subrear', torque:t(110,'star',8,'M14'),
    teach: liveRear ? 'A live axle needs no subframe for a differential — the diff lives in the axle — so the rear structure is a crossmember carrying the spring hangers and the damper mounts.'
                    : 'Carries the differential and the rear links. Rubber bushes here are the biggest single source of rear-axle steer under load — squishy bushings let the rear toe out and the car go loose mid-corner.' });
  add({ id:'mounts', name:'Engine & gearbox mounts', group:'subframe', qty:3, labels:['left engine mount','right engine mount','gearbox mount'],
    deps:['subfront'], mesh:'mounts', torque:t(85,'sequence',6),
    teach:'Mounts have one job that fights itself: hold the engine still, and isolate its vibration. Stiffer mounts mean less wheel-hop and better shift feel, more noise and more vibration at idle. Two take the engine, one takes the gearbox tail, and together they set the driveline angle.' });

  /* ---- powertrain -------------------------------------------------------- */
  add({ id:'engine', name:'Engine assembly', group:'drive', deps:['mounts'], mesh:'engine',
    teach:`Drops in ${mid ? 'behind the cockpit, ahead of the rear axle' : v.bay === 'front-transverse' ? 'sideways across the front, gearbox on the end of it' : 'lengthways up front, gearbox behind it'}. Build and tune the engine itself in the Engine Bay and Tuning workspaces — this part is the whole unit going into the car.`,
    spec:{ 'Position':v.bay, 'Drivetrain':v.drivetrain } });
  add({ id:'gearbox', name: v.id==='dragster' ? 'Multi-stage clutch & reverser' : fwd || (awd && v.bay === 'front-transverse') ? `${v.gears.length}-speed transaxle` : `${v.gears.length}-speed gearbox`,
    group:'drive', deps:['engine'], mesh:'gearbox', torque:t(65,'star',v.class==='car'?8:6),
    teach:`Gear ratios multiply engine torque and divide engine speed. First gear is chosen so the car can pull away; top gear is chosen for cruise rpm and top speed. Close ratios keep the engine in its power band; wide ratios save fuel.${fwd ? ' On a transverse car the final drive and differential live inside this casing — a transaxle.' : ''}`,
    spec:{ 'Ratios':v.gears.map(g=>g.toFixed(2)).join(' / '), 'Final drive':v.final.toFixed(2) } });
  if (awd) add({ id:'transfer', name:'Transfer case & centre differential', group:'drive', deps:['gearbox'], mesh:'transfer', torque:t(45,'sequence',8,'M10'),
    teach:'Splits torque front to rear. An open centre diff sends torque to whichever axle has least grip; a limited-slip or clutch-pack centre lets you bias it — 40:60 rearward is the classic rally setting.' });
  if (rwd) add({ id:'prop', name:'Propshaft', group:'drive', deps:[awd?'transfer':'gearbox'], mesh:'prop', torque:t(75,'sequence',4,'M10'),
    teach:'Two universal joints and a sliding spline, because the differential moves up and down with the suspension while the gearbox does not. Get the operating angles wrong and it vibrates at exactly one speed. The flange bolts are marked and go back in the same holes to keep the balance.' });
  if (awd && !fwd) add({ id:'difff', name:'Front differential', group:'drive', deps:['transfer','subfront'], mesh:'difff', torque:t(70,'star',8),
    teach:'Takes the front share of torque from the transfer case and splits it left to right. On a longitudinal all-wheel-drive car it hangs off the side of the gearbox or sits in the sump with a shaft through the engine.' });
  if (rwd) add({ id:'diff', name: liveRear ? 'Live axle & differential' : 'Rear differential', group:'drive',
    deps:[rwd ? 'prop' : 'gearbox', 'subrear'], mesh:'diff', torque:t(75,'star',10),
    teach:`${v.id==='drift' ? 'A locked or two-way clutch-type diff so both rear wheels always turn together — that is what lets the car hold a slide instead of spinning up the inside wheel.' : 'An open diff sends equal torque to both wheels, which means the one with least grip sets the limit. A limited-slip diff resists the speed difference so the loaded wheel can still put power down.'}`,
    spec:{ 'Final drive':v.final.toFixed(2), 'Type': v.id==='drift'?'2-way locked': race?'clutch-type LSD':'helical LSD / open' } });
  else add({ id:'diff', name:'Final drive & differential (in transaxle)', group:'drive', deps:['gearbox'], mesh:'diff', torque:t(40,'sequence',10,'M10'),
    teach:'In a transverse front-drive car the crown wheel and the differential sit inside the gearbox casing, driving the two front shafts directly. The ring gear is helical and the diff is usually open, which is why a powerful front-drive car spins its inside wheel out of a tight corner.',
    spec:{ 'Final drive':v.final.toFixed(2) } });
  add({ id:'axles', name:'Driveshafts & CV joints', group:'drive', qty: awd ? 4 : 2, end: awd ? null : (fwd ? 'F' : 'R'), each:'Driveshaft',
    deps: awd ? ['diff','difff'] : ['diff'], mesh:'axles', torque:t(230,'single',1,'M24'),
    teach:'Constant-velocity joints transmit torque at an angle without the speed fluctuation a universal joint has. The outer joint plunges and the inner one slides so the shaft can follow the wheel. The hub nut is the single biggest torque on the car; it is staked or a new nut every time. Unequal-length shafts on a powerful front-drive car are exactly why torque steer exists.' });

  /* ---- suspension, both ends --------------------------------------------- */
  for (const end of ['F','R']){
    const g = end === 'F' ? 'suspF' : 'suspR';
    const type = end === 'F' ? v.suspF : v.suspR;
    const base = end === 'F' ? 'subfront' : 'subrear';
    const sfx = end === 'F' ? 'f' : 'r';
    const label = end === 'F' ? 'Front' : 'Rear';
    const sv = VB(end === 'F' ? 'suspF' : 'suspR');
    const dampName = (plain) => sv.mesh.type === 'coilover' ? `${label} coilovers (height-adjustable)`
                              : sv.mesh.type === 'air' ? `${label} air springs & dampers`
                              : sv.mesh.type === 'lift' ? `${label} long-travel lift springs & dampers`
                              : sv.mesh.type === 'lowering' ? `${label} lowering springs & dampers` : plain;
    if (type === 'none') continue;

    if (type === 'macpherson'){
      add({ id:'lca'+sfx, name:`${label} lower control arms`, group:g, qty:2, end, each:'Lower control arm', deps:[base], mesh:'lca'+sfx, torque:t(120,'sequence',4,'M14'),
        teach:'The lower arm alone locates the bottom of the upright, so its length and angle set the roll centre and most of the camber gain. Bushings here trade compliance for precision. The ball joint at its outer end is what the upright pivots on.' });
      add({ id:'strut'+sfx, name:dampName(`${label} struts (spring + damper)`), group:g, qty:2, end, each:'Strut', deps:['lca'+sfx], mesh:'strut'+sfx, torque:t(60,'star',3,'M10'),
        teach:'A MacPherson strut is the damper doing double duty as the upper suspension link. Cheap, compact, and the reason strut cars lose camber as the body rolls — exactly when they need it most. The top mount bolts to the inner wing, the bottom clamps the upright.',
        spec:{ 'Spring rate': race?'90–130 N/mm':'30–55 N/mm', 'Motion ratio':'~1.0 (direct acting)', 'Fitted':sv.name } });
    } else if (type === 'doublewishbone' || type === 'pushrod'){
      add({ id:'lca'+sfx, name:`${label} lower wishbones`, group:g, qty:2, end, each:'Lower wishbone', deps:[base], mesh:'lca'+sfx, torque:t(120,'sequence',4,'M14'),
        teach:'Two arms, four pivots, complete control. Change the length and inclination of each wishbone and you control camber gain, roll centre height and anti-dive independently.' });
      add({ id:'uca'+sfx, name:`${label} upper wishbones`, group:g, qty:2, end, each:'Upper wishbone', deps:['lca'+sfx], mesh:'uca'+sfx, torque:t(95,'sequence',4,'M12'),
        teach:'Shorter than the lower arm on purpose — that difference is what pulls negative camber in as the wheel goes into bump, keeping the tyre flat while the body rolls.' });
      add({ id:'damp'+sfx, name: type==='pushrod' ? `${label} pushrods & inboard dampers` : dampName(`${label} springs & dampers`), group:g, qty:2, end, each: type==='pushrod' ? 'Pushrod & damper' : 'Spring & damper',
        deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',4,'M12'),
        teach: type==='pushrod' ? 'The damper and spring live inboard, driven through a rocker by a pushrod. The wheel sees clean air, and the rocker gives you a motion ratio to play with.'
             : 'Spring and damper as one unit between the lower wishbone and the body. Compression damping controls the tyre over bumps; rebound damping controls the body afterwards.',
        spec:{ 'Motion ratio': type==='pushrod'?'0.55–0.75':'0.85–1.0', 'Damping':'low/high-speed comp + rebound', 'Fitted':sv.name } });
    } else if (type === 'multilink'){
      add({ id:'lca'+sfx, name:`${label} lower links & trailing arms`, group:g, qty:2, end, each:'Lower link set', deps:[base], mesh:'lca'+sfx, torque:t(110,'sequence',6,'M14'),
        teach:'Five separate links means five separate things you can tune. The toe link is the one that matters most — it decides whether the rear steers into or out of the corner under load.' });
      add({ id:'uca'+sfx, name:`${label} upper links & toe arms`, group:g, qty:2, end, each:'Upper link & toe arm', deps:['lca'+sfx], mesh:'uca'+sfx, torque:t(90,'sequence',4,'M12'),
        teach:'Adjustable toe arms are the first thing a track build gets: rear toe of 0.1–0.2° in per side calms the car dramatically on corner exit.' });
      add({ id:'damp'+sfx, name:dampName(`${label} springs & dampers`), group:g, qty:2, end, each:'Spring & damper', deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',4,'M12'),
        teach:'Rear spring rate relative to the front is your main balance tool: stiffer rear = more oversteer, stiffer front = more understeer.',
        spec:{ 'Fitted':sv.name } });
    } else if (type === 'liveaxle' || type === 'solid'){
      add({ id:'lca'+sfx, name:`${label} axle location (links / leaf springs)`, group:g, qty:2, end, each:'Axle link / leaf', deps:[base], mesh:'lca'+sfx, torque:t(140,'sequence',4,'M16'),
        teach:'A live axle carries the differential inside it, so all that mass is unsprung. Leaf springs both locate and suspend it; four-link setups separate those two jobs and control axle wrap under power.' });
      add({ id:'damp'+sfx, name:dampName(`${label} shocks`), group:g, qty:2, end, each:'Shock absorber', deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(70,'sequence',2,'M12'),
        teach:'On a live axle the shocks fight wheel hop as much as body motion — that is why drag cars run 90/10 and 50/50 valving front to rear.',
        spec:{ 'Fitted':sv.name } });
    } else if (type === 'torsionbeam'){
      add({ id:'lca'+sfx, name:'Rear torsion beam', group:g, deps:[base], mesh:'lca'+sfx, torque:t(110,'sequence',4,'M14'),
        teach:'One pressed-steel beam acting as trailing arms and anti-roll bar in a single part. Cheap, light, packages tiny — and gives you almost nothing to adjust.' });
      add({ id:'damp'+sfx, name:dampName('Rear springs & dampers'), group:g, qty:2, end, each:'Spring & damper', deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',2,'M12'),
        teach:'Separate spring and damper mounted almost vertically, so motion ratio is close to 1:1 and spring rate changes have a direct effect.',
        spec:{ 'Fitted':sv.name } });
    } else if (type === 'airbag'){
      add({ id:'lca'+sfx, name:'Air-suspension trailing arms', group:g, qty:2, end, each:'Trailing arm', deps:[base], mesh:'lca'+sfx, torque:t(150,'sequence',4,'M16'),
        teach:'Air springs hold ride height constant whatever the load — essential when the vehicle mass triples between empty and fully freighted.' });
      add({ id:'damp'+sfx, name:'Air bags, dampers & levelling valves', group:g, qty:2, end, each:'Air spring & damper', deps:['lca'+sfx], mesh:'damp'+sfx,
        teach:'A height-control valve bleeds air in or out to keep the frame level. Spring rate rises with load automatically — that is air suspension\'s whole advantage.' });
    }
    const uprDep = (type==='torsionbeam'||type==='liveaxle'||type==='solid'||type==='airbag') ? 'lca'+sfx
                 : ['doublewishbone','pushrod','multilink'].includes(type) ? 'uca'+sfx : 'strut'+sfx;
    add({ id:'upr'+sfx, name:`${label} uprights, hubs & bearings`, group:g, qty:2, end, each: liveRear && end==='R' ? 'Hub & bearing' : 'Upright & hub', deps:[uprDep],
      mesh:'upr'+sfx, torque:t(280,'single',1,'M22'),
      teach:`The upright holds the wheel bearing, the brake caliper and the ${end==='F'?'steering arm':'toe link'}. Its geometry sets ${end==='F'?'kingpin inclination and scrub radius — the two numbers that decide how the steering feels under braking':'bump steer at the rear'}. The hub nut is torqued with the wheel on the ground, never with the car on stands.` });
    if (type !== 'torsionbeam' && type !== 'none'){
      add({ id:'arb'+sfx, name:`${label} anti-roll bar`, group:g, deps:[base], mesh:'arb'+sfx, torque:t(45,'sequence',4,'M10'),
        teach:`A torsion spring that only resists *roll*, not bump. Stiffness scales with the fourth power of bar diameter — a 2 mm thicker bar is a huge change. Stiffer ${end==='F'?'front bar adds understeer':'rear bar adds oversteer'}. It clamps to the ${end==='F'?'subframe':'subframe'} in two rubber bushes.` });
      add({ id:'arblink'+sfx, name:`${label} anti-roll bar drop links`, group:g, qty:2, end, each:'Drop link', deps:['arb'+sfx, 'lca'+sfx], mesh:'arblink'+sfx, torque:t1(55,'sequence',2,'M10'),
        teach:'Short links with a ball joint at each end joining the bar to the arm or strut. They are the usual source of a front-end knock over bumps, and on a track car they are where you fit the quick-release that disconnects the bar for wet sessions.' });
    }
  }

  /* ---- steering ---------------------------------------------------------- */
  add({ id:'rack', name:'Steering rack', group:'steering', deps:['subfront'], mesh:'rack', torque:t(80,'sequence',4,'M12'),
    teach:`Rack ratio decides how much lock you get per turn of the wheel. The rack bolts across the subframe in two bushes; worn ones give a steering wheel that moves before the wheels do.${v.steerAngle?` This build runs modified knuckles for ${v.steerAngle}° of lock.`:''}` });
  add({ id:'tierods', name:'Track rods & ends', group:'steering', qty:2, end:'F', each:'Track rod', deps:['rack','uprf'], mesh:'tierods', torque:t1(45,'single',1,'M12'),
    teach:'The inner joint threads into the rack, the outer joint bolts to the steering arm on the upright. Tie-rod height must match the lower arm\'s arc or the wheel steers itself as the suspension moves — that is bump steer. Toe is set by winding the rod in or out, then locking the nut.' });
  add({ id:'column', name:'Steering column & intermediate shaft', group:'steering', deps:['rack'], mesh:'column', torque:t1(35,'sequence',4,'M8'),
    teach:'A collapsible column with universal joints down to the rack pinion. Castor angle — not the rack — is what makes the wheel self-centre. The intermediate shaft has a splined slip joint and a clamp bolt that only goes in one way.' });

  /* ---- brakes ------------------------------------------------------------ */
  for (const end of ['F','R']){
    const sfx = end === 'F' ? 'f' : 'r'; const label = end === 'F' ? 'Front' : 'Rear';
    const dia = end === 'F' ? v.brakeF : v.brakeR;
    if (!dia) continue;
    const bv = VB(end === 'F' ? 'brakesF' : 'brakesR');
    const drum = bv.mesh.disc === 'drum';
    const discName = drum ? 'Rear brake drums' : bv.mesh.disc === 'ceramic' ? `${label} carbon-ceramic discs`
                   : bv.mesh.disc === 'twopiece' ? `${label} two-piece floating discs` : bv.mesh.disc === 'drilled' ? `${label} drilled & slotted discs`
                   : bv.mesh.disc === 'solid' ? `${label} solid discs` : `${label} vented discs`;
    const calName = drum ? 'Rear shoes, wheel cylinders & backplates'
                  : bv.mesh.pistons >= 4 ? `${label} ${bv.mesh.pistons}-piston calipers & pads` : `${label} calipers & pads`;
    add({ id:'disc'+sfx, name:discName, group:'brakes', qty:2, end, each: drum ? 'Brake drum' : 'Brake disc', deps:['upr'+sfx], mesh:'disc'+sfx,
      teach: drum ? 'The drum slides over the hub studs and is held on by the wheel. Inside it the shoes press outward; the drum traps its own heat, so a long descent cooks the linings.'
           : `A brake turns kinetic energy into heat and then throws it away. Disc diameter gives leverage; vane design and mass decide how much heat it can hold before it fades. The disc is located by the hub and clamped by the wheel — the small screw only holds it while the wheel is off.`,
      spec:{ 'Diameter':`${Math.round(dia * (bv.mesh.size || 1))} mm`, 'Type': bv.name } });
    add({ id:'cal'+sfx, name:calName, group:'brakes', qty:2, end, each: drum ? 'Shoes & wheel cylinder' : 'Caliper', deps:['disc'+sfx], mesh:'cal'+sfx, torque:t(drum ? 25 : 115,'sequence',2,drum ? 'M8' : 'M14'),
      teach: drum ? 'Two shoes on a backplate, pushed out by a hydraulic wheel cylinder and pulled back by return springs. Adjustment is a ratchet that takes up lining wear every time the handbrake is used.'
           : `Piston area sets clamping force for a given line pressure — that is what "brake bias" really means. Pad compound decides friction *and* how it changes with temperature; a race pad is dangerous cold. The caliper bolts to the upright on two high-tensile bolts; they are never reused on a race car.`,
      spec:{ 'Pistons': drum ? '1 wheel cylinder' : String(bv.mesh.pistons || 1), 'Fitted':bv.name } });
  }
  add({ id:'brakelines', name:'Brake lines & flexible hoses', group:'brakes', deps:['calf', v.brakeR ? 'calr' : 'calf', 'chassis'], mesh:'brakelines',
    teach:'Rigid steel lines along the floor and a flexible hose at each corner so the caliper can move with the wheel. Rubber hoses swell a little under pressure, which is why braided lines firm the pedal up. Fluid is hygroscopic: it absorbs water through the hoses and boils sooner every year.' });
  add({ id:'mcyl', name:'Master cylinder & servo', group:'brakes', deps:['brakelines'], mesh:'mcyl', torque:t1(22,'sequence',4,'M8'),
    teach:'Pedal force × pedal ratio × booster assist ÷ master-cylinder area = line pressure. Fit bigger calipers without thinking about master-cylinder bore and the pedal goes long and soft. It bolts through the firewall onto the vacuum servo, with the reservoir on top.' });
  add({ id:'abs', name:'ABS / stability module', group:'brakes', deps:['brakelines','harness'], mesh:'abs',
    teach:'Wheel-speed sensors spot a wheel decelerating faster than the car and modulate that circuit up to 15 times a second. Stability control adds yaw rate and steering angle and brakes individual corners to correct a slide.' });
  add({ id:'hbrake', name: v.id==='drift' ? 'Hydraulic handbrake' : 'Parking brake lever & cables', group:'brakes', deps:[v.brakeR ? 'calr' : 'calf', 'chassis'], mesh:'hbrake',
    teach: v.id==='drift' ? 'A separate master cylinder plumbed into the rear circuit only — pull it and the rear locks instantly regardless of pedal input. This is how a drift is initiated and adjusted.' : 'A lever on the tunnel pulling two cables to the rear calipers or drums, holding the car with the engine off. The cables run under the floor and seize when the outer sheath lets water in.' });

  /* ---- wheels ------------------------------------------------------------ */
  {
    const wv = VB('wheels'), tv = VB('tyres');
    add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, each:'Wheel & tyre', deps:['uprf','uprr'], mesh:'wheels',
      torque:t(race ? 140 : 120,'star',5,'M14'),
      teach:`Contact patch is roughly load ÷ tyre pressure, whatever the tyre. Width mostly buys you *heat capacity* and lateral stiffness, not raw area. Always torque wheels in a star pattern; never with an impact gun on a road car.`,
      spec:{ 'Front':`${v.tyreF}/${v.rimF}"`, 'Rear':`${v.tyreR}/${v.rimR}"`, 'Wheel':wv.name, 'Tyre':tv.name, 'Torque':`${race ? 140 : 120} Nm star pattern` } });
  }

  /* ---- fuel & exhaust ---------------------------------------------------- */
  add({ id:'tank', name: race ? 'Fuel cell' : 'Fuel tank', group:'fuel', deps:['chassis'], mesh:'tank', torque:t1(25,'sequence',4,'M8'),
    teach:`${race?'A foam-filled fuel cell with a rubber bladder in a steel or carbon container, mounted where a rear impact cannot reach it.':'A moulded plastic tank under the rear seat, ahead of the rear axle — the one place a rear or side impact is least likely to reach it. Two steel straps hold it up.'}`,
    spec:{ 'Capacity':`${v.fuelL} L` } });
  add({ id:'fuelpump', name: race ? 'Fuel pump, surge tank & filter' : 'In-tank fuel pump & sender', group:'fuel', deps:['tank'], mesh:'fuelpump', torque:t1(8,'perimeter',8,'M5'),
    teach: race ? 'A surge tank holds a litre that the pump can never uncover, however hard the car corners. The lift pump in the cell keeps it full; the high-pressure pump feeds the rails from it.'
         : 'The pump sits in a swirl pot inside the tank with the level sender beside it, dropped in through a hole under the back seat. Under hard cornering an uncovered pickup pulls air — which is why race cars use surge tanks.' });
  add({ id:'fuellines', name:'Fuel lines & filter', group:'fuel', deps:['fuelpump','engine'], mesh:'fuellines',
    teach:'Feed and return (or a single returnless feed) along the floor inside the sill, clipped every 300 mm, with the filter in the line. Hard plastic or steel on the car, braided flexible at the engine so it can move on its mounts.' });
  if (!open) add({ id:'fillerneck', name:'Filler neck & breather', group:'fuel', deps:['tank','quarters'], mesh:'fillerneck',
    teach:'The pipe from the filler cap down to the tank, with a breather that lets air out as fuel goes in and a rollover valve that stops fuel coming the other way. It passes through the rear quarter, which is why the quarter comes off after it.' });
  add({ id:'downpipe', name: race ? 'Downpipe' : 'Downpipe & flexible joint', group:'fuel', deps:['engine'], mesh:'downpipe', torque:t(45,'sequence',3,'M10'),
    teach:'From the manifold or turbine flange down to under the floor. A braided flexi section lets the engine rock on its mounts without cracking the pipe. On a turbo car this is the single most valuable pipe to enlarge.' });
  if (!race) add({ id:'cat', name:'Catalytic converter', group:'fuel', deps:['downpipe'], mesh:'cat', torque:t(45,'sequence',3,'M10'),
    teach:'A ceramic honeycomb coated with platinum, palladium and rhodium, converting CO, hydrocarbons and NOx at 400–800 °C. It needs the mixture dancing around stoichiometric to do all three, which is what the oxygen sensor loop is for. Every one of them is a restriction you trade for legality.' });
  {
    const ev = VB('exhaust');
    add({ id:'midpipe', name: ev.mesh.type === 'side' ? 'Side-exit mid pipe' : 'Centre section & resonator', group:'fuel', deps:[race ? 'downpipe' : 'cat'], mesh:'midpipe', torque:t(45,'sequence',2,'M10'),
      teach:'The long run under the floor, hung on rubber mounts, with a resonator sized to cancel one specific drone frequency. Hangers are rubber because the whole system grows 20 mm when it is hot.' });
    add({ id:'rearbox', name: ev.mesh.type === 'straight' ? 'Straight-through rear pipe & tips' : ev.mesh.type === 'side' ? 'Side exhaust silencer & tip' : ev.mesh.type === 'catback' ? 'Performance rear silencer & tips' : 'Rear silencer & tailpipes', group:'fuel', deps:['midpipe'], mesh:'rearbox', torque:t1(35,'sequence',2,'M8'),
      teach:`${ev.teach} The box hangs on two rubber mounts and clamps or bolts to the centre section.`,
      spec:{ 'Fitted':ev.name } });
  }

  /* ---- cooling ----------------------------------------------------------- */
  add({ id:'rad', name:'Radiator', group:'cool', deps:['chassis'], mesh:'rad', torque:t1(10,'sequence',4,'M6'),
    teach:'Airflow through the core, not core size, usually limits cooling. Sealing the gap between bumper and radiator is worth more than a bigger radiator badly ducted. It sits in rubber pegs top and bottom so it does not carry chassis flex.' });
  add({ id:'fans', name:'Cooling fans & shroud', group:'cool', deps:['rad'], mesh:'fans', torque:t1(8,'sequence',4,'M6'),
    teach:'Electric fans in a shroud that makes them pull through the whole core instead of a hole in the middle of it. At road speed they do nothing; in traffic they are the entire cooling system.' });
  add({ id:'hoses', name:'Coolant hoses', group:'cool', deps:['rad','engine'], mesh:'hoses',
    teach:'Top hose from the thermostat housing to the radiator inlet, bottom hose from the outlet to the pump. Moulded EPDM rubber on spring clips; a hose that feels soft when hot is about to fail. Fill with the heater on and bleed the high point.' });
  add({ id:'exptank', name:'Expansion tank & cap', group:'cool', deps:['hoses'], mesh:'exptank',
    teach:'Coolant expands about 4 % from cold to hot; this is where it goes. The cap is a pressure valve — 1.1 to 1.4 bar — and the pressure is what raises the boiling point past 120 °C. A tired cap is the commonest cause of a car that "uses water".' });
  if (!race){
    add({ id:'condenser', name:'A/C condenser & drier', group:'cool', deps:['chassis'], mesh:'condenser', torque:t1(8,'sequence',4,'M6'),
      teach:'A second heat exchanger in front of the radiator, dumping the heat the air-conditioning took out of the cabin. It steals the radiator\'s cold air, which is why the fans run when the A/C is on.' });
    add({ id:'accomp', name:'A/C compressor', group:'cool', deps:['engine'], mesh:'accomp', torque:t1(25,'sequence',4,'M8'),
      teach:'Belt-driven off the crank, with an electromagnetic clutch so it only loads the engine when cooling is called for. Three to five kilowatts at full chat — you can feel it on a small engine.' });
    add({ id:'heaterbox', name:'Heater box & blower', group:'cool', deps:['chassis'], mesh:'heaterbox',
      teach:'The heater matrix, the evaporator, the blower and the flaps that mix them, all in one plastic box behind the dashboard. It goes in before the dash because it can only come out after it.' });
  }

  /* ---- aero -------------------------------------------------------------- */
  const bf = VB('bumperF'), sp = VB('spoiler');
  if (bf.mesh.type === 'splitter' || v.downforceKg >= 150) add({ id:'splitter', name: open ? 'Front wing' : 'Front splitter', group:'body', deps:[open ? 'chassis' : 'bumperF'], mesh:'splitter', torque:t1(15,'perimeter',8,'M6'),
    teach: open ? 'The front wing makes a third of the car\'s downforce and sets the balance; the flap angle is one of the few things changed at a pit stop.' : bf.teach,
    spec:{ 'Downforce':`${bf.effects.downforce || 0} kg (at top speed)` } });
  if (sp.mesh.type !== 'none' && !open) add({ id:'spoiler', name: sp.mesh.type === 'gtwing' ? 'GT wing & uprights' : sp.mesh.type === 'ducktail' ? 'Ducktail spoiler' : 'Boot lip spoiler', group:'body', deps:['bootlid'], mesh:'spoiler', torque:t1(12,'sequence',sp.mesh.type === 'gtwing' ? 8 : 4,'M6'),
    teach:sp.teach, spec:{ 'Fitted':sp.name } });
  if (v.downforceKg >= 100 && !open) add({ id:'diffuser', name:'Rear diffuser', group:'body', deps:['bumperR'], mesh:'diffuser', torque:t1(12,'perimeter',8,'M6'),
    teach:'Air under the car speeds up toward the back and the diffuser lets it expand gradually, which lowers the pressure under the whole floor. It only works with a flat floor ahead of it and a sealed sill; a diffuser on a car with a lumpy underside is decoration.',
    spec:{ 'Peak downforce':`${v.downforceKg} kg`, 'Cd':v.cd.toFixed(2) } });
  if (open){
    add({ id:'rearwing', name:'Rear wing & endplates', group:'body', deps:['chassis'], mesh:'rearwing', torque:t1(15,'sequence',6,'M6'),
      teach:'The rear wing is the biggest single downforce device on the car and most of its drag. Mainplane and flap, with the DRS flap opening on the straights to shed the drag.',
      spec:{ 'Peak downforce':`${v.downforceKg} kg` } });
    add({ id:'sidepods', name:'Sidepods & radiator ducts', group:'body', qty:2, each:'Sidepod', deps:['chassis'], mesh:'sidepods', torque:t1(10,'perimeter',10,'M6'),
      teach:'The radiators live inside, and the outer shape manages the air going to the floor and the rear wing. They are the first thing damaged in contact and are made to come off in minutes.' });
    add({ id:'nosecone', name:'Nose cone', group:'body', deps:['chassis'], mesh:'nosecone', torque:t1(15,'sequence',4,'M8'),
      teach:'A crash structure first and a fairing second: it has to absorb a frontal impact by crushing progressively, and it carries the front wing. Changed in a pit stop with four pins.' });
    add({ id:'enginecover', name:'Engine cover & airbox', group:'body', deps:['engine'], mesh:'enginecover', torque:t1(10,'perimeter',8,'M6'),
      teach:'The roll hoop intake feeds the airbox under here; the cover itself is a fairing over the engine and the shark fin stabilises the car in yaw.' });
    add({ id:'floor', name:'Floor & diffuser', group:'body', deps:['chassis'], mesh:'floor', torque:t1(12,'perimeter',14,'M6'),
      teach:'Most of a modern single-seater\'s downforce comes from under it: the floor edges seal the underbody and the diffuser expands the flow at the back.' });
    if (v.id !== 'dragster') add({ id:'halo', name:'Halo', group:'chassis', deps:['chassis'], mesh:'halo', torque:t(60,'sequence',3,'M12'),
      teach:'A titanium hoop bolted to the tub at three points, rated for 125 kN — the weight of a London bus — to keep a wheel or a wall out of the cockpit.' });
  }

  /* ---- electrical -------------------------------------------------------- */
  add({ id:'battery', name:'Battery & main cables', group:'elec', deps:['chassis'], mesh:'battery', torque:t1(6,'single',1,'M6'),
    teach:'The battery starts the engine and buffers the alternator; it does not "power" a running car. Cable size is set by starter current — voltage drop, not fuse rating, is what sizes it. Negative off first, on last.' });
  add({ id:'fusebox', name:'Fuse box & relays', group:'elec', deps:['battery'], mesh:'fusebox',
    teach:'A fuse protects the *wire*, never the device. Size the wire for the load, then fuse just above the wire\'s continuous rating. A relay lets a thin switch wire control a thick power wire.' });
  add({ id:'harness', name:'Wiring harness & grounds', group:'elec', deps:['fusebox'], mesh:'harness',
    teach:'Most "electrical gremlins" are ground faults. Current has to get back to the battery negative, and a corroded ground strap raises the voltage everything else floats at. The loom runs along the sill under the carpet and across the bulkhead behind the dash.' });
  add({ id:'ecu', name:'Engine control unit', group:'elec', deps:['harness'], mesh:'ecu', torque:t1(8,'sequence',4,'M6'),
    teach:'The computer reading every sensor and firing every injector and coil. Mounted in the bay or behind the kick panel, with one or two big multi-pin connectors that only release with the lever. Tune it in the Tuning workspace.' });
  add({ id:'horn', name:'Horn', group:'elec', deps:['harness'], mesh:'horn',
    teach:'A diaphragm driven by an electromagnet that interrupts its own supply — a buzzer with a trumpet on it. Two horns of different pitch is what gives a car its chord.' });
  if (!open){
    add({ id:'washer', name:'Washer bottle & pump', group:'elec', deps:['chassis'], mesh:'washer',
      teach:'Tucked in the wing behind the bumper, with a small centrifugal pump in its side. The one reservoir under the bonnet that must never get engine coolant in it.' });
    const lv = VB('lights');
    add({ id:'headlamp', name: lv.mesh.type === 'led' ? 'LED headlamps' : lv.mesh.type === 'xenon' ? 'Bi-xenon projector headlamps' : 'Halogen headlamps', group:'elec', qty:2, each:'Headlamp', deps:['chassis', 'wingF', 'harness'], mesh:'headlamp', torque:t1(5,'sequence',3,'M6'),
      teach:`${lv.teach} The unit bolts into the front panel behind the bumper, so the bumper comes off before it does.`,
      spec:{ 'Fitted':lv.name } });
    add({ id:'taillamp', name:'Tail lamp clusters', group:'elec', qty:2, each:'Tail lamp', deps:['quarters','harness'], mesh:'taillamp', torque:t1(4,'sequence',3,'M5'),
      teach:'Stop, tail, indicator and reverse in one cluster bolted into the quarter panel from inside the boot. LEDs draw a tenth of the current of filament bulbs, which is why converting them upsets flasher relays that measure current to detect a blown bulb.' });
    add({ id:'wipers', name:'Wiper arms, motor & linkage', group:'elec', deps:['windscreen','harness'], mesh:'wipers',
      teach:'A motor and a crank linkage under the scuttle panel; the arms are splined and handed, and they park to a mark on the screen rather than to a stop. Fit them to the mark, not to where they look right.' });
  }
  if (!race){
    add({ id:'headunit', name:'Head unit / infotainment', group:'audio', deps:['dash'], mesh:'headunit',
      teach:'Pre-amp outputs feed the amplifier a clean low-level signal; speaker-level outputs do not. Setting head-unit volume past ~80% clips the signal, and clipping is what actually kills tweeters.' });
    add({ id:'amp', name:'Amplifier & distribution', group:'audio', deps:['harness'], mesh:'amp',
      teach:'Amplifier current draw ≈ RMS power ÷ (efficiency × 13.8 V). A 1,000 W RMS amp at 75% efficiency pulls nearly 100 A — that is a bigger load than the headlights, wipers and blower combined.' });
    add({ id:'speakers', name:'Speakers & subwoofer', group:'audio', deps:['amp', doors4 ? 'doorcardsR' : 'doorcardsF'], mesh:'speakers',
      teach:'Impedance sets the load: two 4 Ω subs wired in parallel present 2 Ω, which roughly doubles amplifier current draw. Door speakers mount behind the door cards; the sub lives in the boot.' });
  }

  /* ---- body panels -------------------------------------------------------- */
  if (!open){
    const bo = VB('bonnet'), ro = VB('roof'), mi = VB('mirrors');
    add({ id:'bonnet', name: bo.mesh.type === 'carbon' ? 'Carbon-fibre bonnet' : bo.mesh.type === 'vented' ? 'Vented bonnet' : mid ? 'Front luggage lid' : 'Bonnet', group:'body', deps:['chassis'], mesh:'bonnet', torque:t1(22,'sequence',4,'M8'),
      teach:`${bo.teach} Two hinge bolts a side, scribed round before they come out so it goes back in alignment.`, spec:{ 'Fitted':bo.name } });
    add({ id:'wingF', name:'Front wings', group:'body', qty:2, each:'Front wing', deps:['chassis'], mesh:'wingF', torque:t1(10,'perimeter',8,'M6'),
      teach:'The front wing is a bolt-on panel — the one big exterior panel on a unibody that is. It bolts along the top to the inner wing, at the back behind the door edge and at the bottom to the sill. The bumper bolts to its leading edge, so the bumper comes off first.' });
    add({ id:'bumperF', name: bf.mesh.type === 'splitter' ? 'Front bumper (with splitter)' : 'Front bumper', group:'body', deps:['wingF','headlamp'], mesh:'bumperF', torque:t1(8,'perimeter',10,'M6'),
      teach:'A plastic skin over a foam block and an aluminium crash beam. The skin is a shape for airflow and pedestrians; the beam is what takes a low-speed impact without touching the structure. It clips into the wing edges and bolts under the headlamps.' });
    add({ id:'grille', name:'Grille', group:'body', deps:['bumperF'], mesh:'grille', torque:t1(3,'perimeter',6,'M5'),
      teach:'The grille is a trim ring around the hole the radiator breathes through. Block half of it and most cars still cool fine on the move — the lower intake is doing the work.' });
    add({ id:'doorF', name:'Front doors', group:'body', qty:2, each:'Door', end:'F', deps:['chassis'], mesh:'doorF', torque:t(28,'sequence',4,'M10'),
      teach:'Each door is a pressed inner frame with an outer skin, an intrusion beam, the latch and the hinges. It hangs on two hinges on the A-pillar; the striker is set last. A door that is adjusted at the latch to hide a hinge problem will drop again the first time it is slammed. The card, glass and mirror come off it first because their wiring runs through the hinge gap.' });
    if (doors4) add({ id:'doorR', name:'Rear doors', group:'body', qty:2, each:'Door', end:'R', deps:['chassis'], mesh:'doorR', torque:t(28,'sequence',4,'M10'),
      teach:'Hinged on the B-pillar, with the child locks and, on most cars, the fuel-flap-side filler access behind it. Rear doors are the panels most often replaced after a side impact — a door is a bolt-on, a B-pillar is a structural repair.' });
    add({ id:'sills', name:'Sill covers', group:'body', qty:2, each:'Sill cover', deps:['chassis'], mesh:'sills', torque:t1(3,'perimeter',8,'M5'),
      teach:'A plastic or composite skirt clipped along the bottom of the body below the doors. It hides the structural sill — which is welded, and which a jack goes under at the reinforced points only.' });
    add({ id:'quarters', name: pickup ? 'Bed sides' : 'Rear quarter panels', group:'body', qty:2, each: pickup ? 'Bed side' : 'Rear quarter', deps:['chassis'], mesh:'quarters', torque:t1(10,'perimeter',8,'M6'),
      teach: pickup ? 'The load bed is a separate box bolted to the frame behind the cab; its sides carry the tail lamps and the tailgate hinges.'
                    : 'On a unibody the rear quarter is welded along the roof gutter, the sill and the boot aperture — replacing one is a cut-and-weld job, not a bolt-on. It carries the tail lamp and the filler neck, so both come off first.' });
    if (!roadster) add({ id:'roof', name: ro.mesh.type === 'carbon' ? 'Carbon-fibre roof & pillars' : ro.mesh.type === 'sunroof' ? 'Roof with glass sunroof' : 'Roof panel & pillars', group:'body', deps:['chassis'], mesh:'roof', torque:t1(12,'perimeter',10,'M6'),
      teach:`${ro.teach} The A, B and C pillars carry it, and the windscreen and rear screen are bonded into the aperture it forms — so both come out before it does.`, spec:{ 'Fitted':ro.name } });
    else add({ id:'roof', name:'Soft top & frame', group:'body', deps:['chassis'], mesh:'roof', torque:t1(25,'sequence',6,'M8'),
      teach:'A folding frame with a fabric or vinyl skin, bolted to the rear deck behind the seats. The header rail latches to the windscreen frame, which on a roadster is a structural hoop in its own right.' });
    add({ id:'bootlid', name: TAIL_NAME[v.body] || 'Boot lid', group:'body', deps:['chassis'], mesh:'bootlid', torque:t1(22,'sequence',4,'M8'),
      teach: /Tailgate/.test(TAIL_NAME[v.body] || '') ? 'Top-hinged, on two gas struts, with the rear screen bonded into it and the wiper motor and number-plate lamps inside it. The glass comes out first because the lid is far heavier with it.'
           : mid ? 'The lid over the engine, louvred or glazed so the engine can be seen and heat can escape. It hinges at the back or the sides and carries the engine bay cooling ducts.'
           : 'Hinged on gooseneck or four-bar hinges with torsion rods or struts to hold it up. The latch, the lock and the lamps are in it; the rear screen is in the body, not the lid.' });
    if (pickup) add({ id:'bed', name:'Load bed & tonneau', group:'body', deps:['quarters'], mesh:'bed', torque:t1(45,'sequence',8,'M10'),
      teach:'A pressed-steel or composite floor between the bed sides, bolted down to the frame through rubber pads, with a tonneau cover over it.' });
    add({ id:'bumperR', name:'Rear bumper', group:'body', deps:['quarters','taillamp'], mesh:'bumperR', torque:t1(8,'perimeter',10,'M6'),
      teach:'Like the front: a skin, a foam block and a beam. The parking sensors live in the skin and the exhaust tips pass through or under it. It bolts into the quarter edges, so the quarters come off after it.' });
    add({ id:'mirrors', name: mi.mesh.type === 'aero' ? 'Aero door mirrors' : 'Door mirrors', group:'body', qty:2, each:'Door mirror', deps:['doorF'], mesh:'mirrors', torque:t1(6,'sequence',3,'M6'),
      teach:`${mi.teach} Three bolts through the door frame at the sail panel, with the heater and motor wiring going through the door.`, spec:{ 'Fitted':mi.name } });
    add({ id:'fuelflap', name:'Fuel filler flap', group:'body', deps:['quarters'], mesh:'fuelflap',
      teach:'A small hinged door in the quarter with a cable or electric release and a cup behind it that catches drips. Which side it is on decides which side of the pump you park at.' });
    /* glazing */
    add({ id:'windscreen', name:'Windscreen', group:'body', deps:['roof','headliner'], mesh:'windscreen',
      teach:'Laminated: two sheets of glass with a plastic interlayer that holds the shards in a crash. It is bonded in with urethane and is a structural part of the body — the bead is what stops the roof folding in a rollover, and it needs its full cure time before the car is driven.' });
    if (!roadster) add({ id:'rearscreen', name: /Tailgate/.test(TAIL_NAME[v.body] || '') ? 'Tailgate glass' : 'Rear screen', group:'body', deps:[/Tailgate/.test(TAIL_NAME[v.body] || '') ? 'bootlid' : 'roof'], mesh:'rearscreen',
      teach:'Tempered, not laminated: it shatters into blunt granules. The heater element is printed on the inside face, and the aerial is often in it too.' });
    add({ id:'glassF', name:'Front door glass', group:'body', qty:2, each:'Door glass', end:'F', deps:['doorF'], mesh:'glassF',
      teach:'Tempered glass clamped into a regulator inside the door — a scissor or cable mechanism driven by a motor. The glass comes out through the top of the door with the card off and the regulator wound to the access holes.' });
    if (doors4) add({ id:'glassR', name:'Rear door glass', group:'body', qty:2, each:'Door glass', end:'R', deps:['doorR'], mesh:'glassR',
      teach:'Usually a drop glass plus a fixed quarter light in the same door frame, because the wheel arch intrudes into the door and the drop glass can only go so far down.' });
    else if (!roadster) add({ id:'glassQ', name:'Rear quarter glass', group:'body', qty:2, each:'Quarter glass', deps:['quarters','roof'], mesh:'glassQ',
      teach:'A fixed pane bonded into the quarter panel behind the door. On some coupés it hinges out an inch for ventilation.' });
  }

  /* ---- interior ------------------------------------------------------------ */
  add({ id:'carpet', name: race ? 'Floor panels & heel plates' : 'Carpet & underlay', group:'interior', deps:['harness','fuellines'], mesh:'carpet',
    teach: race ? 'Bare aluminium floor and heel plates — the carpet is the first ten kilograms a race car loses.'
         : 'Moulded carpet over a felt and foam underlay that is most of the car\'s sound deadening. It goes in over the harness and the fuel and brake lines, and before the seats and console that sit on top of it.' });
  if (!race) add({ id:'headliner', name:'Headliner', group:'interior', deps: roadster ? ['chassis'] : ['roof'], mesh:'headliner',
    teach:'A moulded fibreglass board with foam and fabric on its face, holding the grab handles, lights and sun visors. It is bigger than any opening it has to come out through, which is why it comes out before the windscreen goes in.' });
  else add({ id:'headliner', name:'Roof padding', group:'interior', deps: roadster ? ['chassis'] : ['roof'], mesh:'headliner',
    teach:'FIA roll-cage padding on every tube within reach of a helmet, and nothing else overhead.' });
  add({ id:'dash', name: open ? 'Steering wheel display & switchgear' : 'Dashboard & crossbeam', group:'interior', deps: race || open ? ['harness'] : ['heaterbox','harness'], mesh:'dash', torque:t1(22,'sequence',6,'M8'),
    teach: open ? 'Every readout and almost every control is on the wheel itself; the tub has only the master switches.'
         : 'The whole cockpit comes out as one assembly: a steel crossbeam from A-pillar to A-pillar with the dash moulding, the instruments, the airbags and the vents on it. It goes in after the heater box and the harness, because both are behind it.' });
  add({ id:'pedals', name:'Pedal box', group:'interior', deps:['mcyl'], mesh:'pedals', torque:t1(22,'sequence',4,'M8'),
    teach:'Brake and clutch pedals pivot on one shaft bolted to the firewall, in line with the master cylinder push rod; the accelerator is a sensor on its own bracket — nothing between your foot and the throttle body is mechanical any more. The brake pedal ratio (about 4:1) is the first stage of brake multiplication.' });
  {
    const sw = VB('steeringwheel');
    add({ id:'steeringwheel', name: sw.mesh.type === 'quickrelease' ? 'Quick-release steering wheel' : sw.mesh.type === 'sport' ? 'Sports steering wheel' : 'Steering wheel & airbag', group:'interior', deps:['column', open ? 'chassis' : 'dash'], mesh:'steeringwheel', torque:t1(50,'single',1,'M16'),
      teach:`${sw.teach} One centre nut on the column splines; the wheel is marked to the column before it comes off so the spokes go back level.`, spec:{ 'Diameter':`${Math.round(sw.mesh.dia * 1000)} mm`, 'Fitted':sw.name } });
  }
  if (!open) add({ id:'console', name:'Centre console & gear lever', group:'interior', deps:['carpet','hbrake'], mesh:'console', torque:t1(5,'sequence',6,'M6'),
    teach:'The trim over the tunnel, carrying the gear lever gaiter, the handbrake grip, the cupholders and the armrest. It goes on after the handbrake lever, which pokes up through it.' });
  {
    const sv = VB('seats');
    add({ id:'seatsF', name: v.seats === 1 ? (sv.mesh.type === 'bucket' ? 'Driver\'s bucket seat' : 'Driver\'s seat') : sv.mesh.type === 'bucket' ? 'Front bucket seats' : sv.mesh.type === 'sport' ? 'Front sports seats' : 'Front seats',
      group:'interior', qty: v.seats === 1 ? 1 : 2, each:'Seat', labels: v.seats === 1 ? ['driver'] : null, deps:['carpet'], mesh:'seatsF', torque:t(45,'sequence',4,'M10'),
      teach:`${sv.teach} Four bolts into captive nuts in the floor; the pretensioner connector is disconnected with the battery off and after a wait.`, spec:{ 'Fitted':sv.name } });
    if (v.seats > 2 && !race) add({ id:'seatR', name:'Rear seat bench & backrest', group:'interior', deps:['carpet'], mesh:'seatR',
      teach:'The cushion lifts off two clips at the front; the backrest bolts to the parcel shelf or hinges to fold. The fuel pump access is under the cushion on most cars.' });
    if (!open) add({ id:'belts', name:'Seat belts & pretensioners', group:'interior', qty: v.seats === 1 ? 1 : 2, each: race ? 'Harness' : 'Seat belt', labels: v.seats === 1 ? ['driver'] : null, deps:['seatsF', race ? 'cage' : 'chassis'], mesh:'belts', torque:t(45,'single',1,'M11'),
      teach: race ? 'Six-point harness: two lap, two shoulder, two anti-submarine straps, mounted to the cage and the seat shell. The shoulder straps run within 20° of horizontal from the shoulder to the harness bar — mount them too high and a frontal impact compresses your spine.'
           : 'The reel bolts to the B-pillar base, the top loop to the height adjuster, the buckle to the seat frame. The pretensioner is a pyrotechnic charge in the reel or buckle: treat it as live.' });
  }
  if (!open){
    add({ id:'doorcardsF', name:'Front door cards', group:'interior', qty:2, each:'Door card', end:'F', deps:['doorF'], mesh:'doorcardsF', torque:t1(2,'perimeter',8,'M5'),
      teach:'The trim panel on the inside of the door with the armrest, the window switches, the speaker and the handle, held by clips round its edge and a couple of screws behind the handle. It comes off before the glass, the regulator or the mirror can be reached.' });
    if (doors4) add({ id:'doorcardsR', name:'Rear door cards', group:'interior', qty:2, each:'Door card', end:'R', deps:['doorR'], mesh:'doorcardsR', torque:t1(2,'perimeter',8,'M5'),
      teach:'Same construction as the front cards, usually with the child-lock access behind them.' });
  }

  return finish(expandVInstances(parts, v), v);
}

/* ====================================================================== */
function bikeTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M10') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${Math.round(nm*0.5)} Nm`, `${nm} Nm`] });

  add({ id:'chassis', name:`Frame (${v.chassis})`, group:'chassis', removable:false, mesh:'chassis',
    teach:`On a motorcycle the engine is usually a stressed member — it *is* part of the frame. Rake (${v.rakeDeg}°) and trail (${v.trailMm} mm) are the two numbers that decide whether the bike is stable in a straight line or eager to turn.`,
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Rake':`${v.rakeDeg}°`, 'Trail':`${v.trailMm} mm`, 'Mass':`${v.massKg} kg` } });
  add({ id:'subframe', name:'Rear subframe', group:'subframe', deps:['chassis'], mesh:'subrear', torque:t(45,'sequence',4),
    teach:'Bolts on and carries only the seat, rider and luggage — which is why it is often aluminium or even plastic on a race bike.' });
  add({ id:'engine', name:'Engine assembly', group:'drive', deps:['chassis'], mesh:'engine', torque:t(65,'sequence',4,'M12'),
    teach:'Bolted into the frame at three or four points, taking chassis loads through the cases. Engine position front-to-back is a major handling parameter — move it forward and the front tyre gets more load.' });
  add({ id:'triple', name:'Triple clamps & steering head', group:'suspF', deps:['chassis'], mesh:'triple', torque:t(25,'sequence',4,'M8'),
    teach:'Offset in the triple clamps changes trail without changing rake. Less offset = more trail = more stability, slower steering.' });
  add({ id:'forks', name:`Front forks (${v.suspF})`, group:'suspF', qty:2, deps:['triple'], mesh:'forks', torque:t(23,'sequence',4,'M8'),
    teach:`Upside-down forks put the fat tube at the clamps where bending loads are highest. Compression damping controls the dive; rebound controls how fast the front comes back up — set rebound too fast and the front pushes wide on corner exit.`,
    spec:{ 'Travel': v.travelMm ? `${v.travelMm} mm` : '120 mm', 'Adjust':'preload, compression, rebound' } });
  add({ id:'swingarm', name:'Swingarm & pivot', group:'suspR', deps:['engine'], mesh:'swingarm', torque:t(100,'single',1,'M18'),
    teach:'Swingarm length and pivot height set anti-squat: how much the chain\'s pull tries to extend the suspension under power. Too much and the bike goes light and unsettled; too little and it squats and runs wide.' });
  add({ id:'shock', name:`Rear shock (${v.suspR})`, group:'suspR', deps:['swingarm'], mesh:'shock', torque:t(45,'sequence',2,'M10'),
    teach:`${v.suspR.includes('linkage') ? 'A rising-rate linkage makes the shock progressively harder to compress deeper in the stroke — soft over small bumps, firm on landings.' : 'Sag is the first setting on any bike: with the rider aboard the rear should settle about 30% into its travel. Set that before touching a damping clicker.'}`,
    spec:{ 'Rider sag':'30–33% of travel', 'Adjust':'preload, HS/LS compression, rebound' } });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:2, deps:['forks','swingarm'], mesh:'wheels', torque:t(85,'single',1,'M20'),
    teach:`A bike turns by leaning, so tyre *profile* matters more than width — the contact patch migrates across the crown as you lean. Front ${v.tyreF}, rear ${v.tyreR}.` });
  add({ id:'discf', name:'Front discs & calipers', group:'brakes', qty:2, deps:['wheels'], mesh:'discf', torque:t(45,'sequence',2,'M10'),
    teach:`Roughly 90% of a motorcycle's braking is on the front tyre, because weight transfer unloads the rear almost completely. Twin ${v.brakeF} mm discs with radial-mount calipers.` });
  add({ id:'discr', name:'Rear disc & caliper', group:'brakes', deps:['wheels'], mesh:'discr', torque:t(25,'sequence',2,'M8'),
    teach:'Small and deliberately weak — the rear brake is for stabilising and trimming a line, not for stopping.' });
  add({ id:'final', name: v.drivetrain==='chain' ? 'Chain & sprockets' : v.drivetrain==='belt' ? 'Belt final drive' : 'Shaft final drive',
    group:'drive', deps:['swingarm','wheels'], mesh:'final',
    teach:`${v.drivetrain==='chain'?'Sprocket sizes are the cheapest gearing change there is: one tooth down on the front is roughly three up on the back. Chain slack must be set with the swingarm at its tightest point, not just hanging.':v.drivetrain==='belt'?'Quiet, clean and long-lived, but you cannot change the ratio without a whole new belt and pulleys.':'Shaft drive is maintenance-free but reacts against the swingarm — the bike rises and falls with throttle changes unless the drive is decoupled.'}`,
    spec:{ 'Primary':v.primary?.toFixed(2) ?? '—', 'Final':v.final.toFixed(2) } });
  add({ id:'tank', name:'Fuel tank & pump', group:'fuel', deps:['chassis'], mesh:'tank',
    teach:`${v.fuelL} litres carried high and over the engine — fuel level noticeably changes the bike's centre of gravity between full and empty.` });
  add({ id:'exhaustsys', name:'Exhaust system', group:'fuel', deps:['engine'], mesh:'exhaustsys',
    teach:'Header length tunes the torque curve; the mid-pipe volume and the exhaust valve tame the dip a long header creates in the middle of the range.' });
  add({ id:'rad', name:'Radiator & cooling', group:'cool', deps:['engine'], mesh:'rad',
    teach:`${(v.id==='cruiser')?'Air and oil cooling only — fin area and oil volume are the entire system.':'A small, high-flow core in the airstream with a fan for traffic. Bikes have almost no thermal reserve when stationary.'}` });
  add({ id:'battery', name:'Battery & regulator/rectifier', group:'elec', deps:['chassis'], mesh:'battery',
    teach:'A bike alternator is a permanent-magnet stator making AC all the time; the reg/rec turns it to DC and burns the excess as heat. That is why reg/recs fail and why they are mounted in the airstream.' });
  add({ id:'harness', name:'Harness, ECU & switchgear', group:'elec', deps:['battery'], mesh:'harness',
    teach:'Modern bikes run a CAN bus: one pair of wires carrying every message between dash, ECU, ABS and traction control instead of a wire per function.' });
  add({ id:'lights', name:'Lighting & instruments', group:'elec', deps:['harness'], mesh:'lights',
    teach:'The dash is usually a CAN node too — it displays what the ECU broadcasts, so a "sensor fault" often shows up first as a missing dash reading.' });
  add({ id:'body', name:'Bodywork, seat & bars', group:'body', deps:['subframe'], mesh:'body',
    teach:'Fairings on a road bike are mostly about wind protection; on a race bike the belly pan is also there to catch oil so a blown engine does not put oil on the racing line.' });

  return finish(parts, v);
}

/* ====================================================================== */

/* ====================================================================== */
function kartTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M8') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${nm} Nm`] });
  add({ id:'chassis', name:'Kart frame', group:'chassis', removable:false, mesh:'chassis',
    teach:'A kart has no suspension and no differential. The frame itself is the spring — it twists to lift the inside rear wheel so the kart can turn at all. Tube diameter and stiffener bars are the entire setup.',
    spec:{ 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Mass':`${v.massKg} kg` } });
  add({ id:'floortray', name:'Floor tray', group:'chassis', deps:['chassis'], mesh:'floortray', torque:t(10,'perimeter',8,'M6'),
    teach:'An aluminium sheet riveted or bolted under the frame between the front and rear rails. It carries the driver\'s feet and the pedals, and it stiffens the frame — a cracked tray changes the handling.' });
  add({ id:'axle', name:'Rear axle & bearings', group:'drive', deps:['chassis'], mesh:'axle', torque:t(25,'sequence',6),
    teach:'Axle stiffness is the main tuning tool: a softer axle lets the frame flex more and frees the kart up; a stiffer axle plants it. Length and hub width change how much the inside rear lifts.' });
  add({ id:'engine', name:'Engine & mount', group:'drive', deps:['chassis'], mesh:'engine', torque:t(30,'sequence',4),
    teach:'Bolted to the side of the frame on a slotted mount — sliding it changes chain tension and, slightly, the weight distribution.' });
  add({ id:'final', name:'Chain & sprockets', group:'drive', deps:['engine','axle'], mesh:'final',
    teach:'Sprocket choice is the only gearing you have on most karts, and it is changed for every track and even for temperature.' });
  add({ id:'spindles', name:'Front spindles & kingpins', group:'suspF', qty:2, end:'F', each:'Spindle', deps:['chassis'], mesh:'spindles', torque:t(35,'sequence',2),
    teach:'Caster and camber are set with eccentric kingpin pills. More caster jacks the inside rear higher when you steer — that is literally how a kart lifts a wheel to turn.' });
  add({ id:'rack', name:'Steering column & tie rods', group:'steering', deps:['spindles'], mesh:'rack', torque:t(25,'sequence',4),
    teach:'Ackermann geometry: the inside front wheel steers more than the outside so both follow their own arc. On a kart you change it by moving the tie-rod hole.' });
  add({ id:'steeringwheel', name:'Steering wheel & boss', group:'interior', deps:['rack'], mesh:'steeringwheel', torque:t(12,'sequence',3,'M6'),
    teach:'A small flat-bottomed wheel on a hub with three bolts. Kart steering is direct — a quarter turn is full lock — so the wheel is small enough to keep both hands on it.' });
  add({ id:'pedals', name:'Pedals & cables', group:'interior', deps:['floortray'], mesh:'pedals', torque:t(15,'sequence',2,'M8'),
    teach:'Throttle on the right, brake on the left, each a bent tube on a pivot with a cable or rod to the carburettor and the master cylinder. The pedal stops are set so the brake cannot bottom the master cylinder.' });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, each:'Wheel & tyre', deps:['spindles','axle'], mesh:'wheels', torque:t(25,'star',3),
    teach:'Tyre pressure is the fastest setup change on a kart — a few tenths of a bar transforms grip and how quickly the tyre comes up to temperature.' });
  add({ id:'calr', name:'Rear brake disc, caliper & master cylinder', group:'brakes', deps:['axle'], mesh:'calr', torque:t(20,'sequence',2),
    teach:'One disc on the axle, braking both rear wheels together. Lock it and the kart simply slides straight on.' });
  add({ id:'tank', name:'Fuel tank & lines', group:'fuel', deps:['chassis'], mesh:'tank', teach:'Mounted between the driver\'s legs under the steering column, low and central, so the balance barely changes as it empties.' });
  add({ id:'exhaustsys', name:'Exhaust & silencer', group:'fuel', deps:['engine'], mesh:'exhaustsys', torque:t(10,'sequence',2,'M6'),
    teach:'A tuned-length header into a silencer alongside the seat. On a two-stroke the pipe length and the expansion chamber shape set where the power is; a few centimetres move the peak by hundreds of rpm.' });
  add({ id:'seats', name:'Seat & stiffeners', group:'interior', deps:['chassis'], mesh:'seats', torque:t(12,'sequence',4),
    teach:'Seat position and seat stays are a genuine tuning tool: moving the seat 10 mm changes rear grip noticeably, and stays stiffen the frame around the axle.' });
  add({ id:'bumperF', name:'Front bumper', group:'body', deps:['chassis'], mesh:'bumperF', torque:t(15,'sequence',4),
    teach:'A steel tube hoop in two sockets on the front of the frame. It carries the nose cone and takes the first hit.' });
  add({ id:'nosecone', name:'Nose cone', group:'body', deps:['bumperF'], mesh:'nosecone', torque:t(6,'sequence',2,'M6'),
    teach:'The plastic nose on the front bumper. In most series it is held on by clips that let it shift back on impact — a pushed-in nose is a penalty, so bumping is policed by the bodywork itself.' });
  add({ id:'nassau', name:'Nassau panel', group:'body', deps:['rack','tank'], mesh:'nassau', torque:t(6,'sequence',2,'M6'),
    teach:'The panel over the fuel tank and the steering column in front of the driver — the number plate and the only aerodynamic surface on the kart.' });
  add({ id:'sidepods', name:'Side pods', group:'body', qty:2, each:'Side pod', deps:['chassis'], mesh:'sidepods', torque:t(15,'sequence',4),
    teach:'Plastic pods on tube bars either side of the seat, there to stop wheel-to-wheel contact climbing a tyre. The bars locate in sockets on the frame.' });
  add({ id:'bumperR', name:'Rear bumper', group:'body', deps:['axle'], mesh:'bumperR', torque:t(15,'sequence',4),
    teach:'A wide plastic or tube bumper behind the rear wheels, mandatory since open rear wheels launched karts over each other.' });
  add({ id:'harness', name:'Ignition & wiring', group:'elec', deps:['engine'], mesh:'harness', teach:'A kill switch, a coil and, on a shifter kart, a battery and starter. That is the entire electrical system.' });
  return finish(expandVInstances(parts, v), v);
}

/* ====================================================================== */
/* Pieces.
 *
 * A car has four wheels, two front wings and two doors a side, and each one
 * comes off on its own. Any quantity part the builder tags piece by piece is
 * expanded here into one part per piece, `<id>.<n>`, so each can be removed,
 * torqued and benched by itself — the same contract data/parts.js has with
 * the engine builder. A piece knows which corner it is (end F/R, side L/R),
 * and a piece's dependencies resolve to the matching pieces of the part it
 * sits on: the front-left wheel needs the front-left upright, not all four. */
export const INSTANCED = new Set([
  'mounts', 'axles', 'lcaf', 'lcar', 'ucaf', 'ucar', 'strutf', 'strutr', 'dampf', 'dampr',
  'uprf', 'uprr', 'arblinkf', 'arblinkr', 'tierods', 'discf', 'discr', 'calf', 'calr',
  'wheels', 'headlamp', 'taillamp', 'wingF', 'doorF', 'doorR', 'sills', 'quarters', 'mirrors',
  'glassF', 'glassR', 'glassQ', 'seatsF', 'belts', 'doorcardsF', 'doorcardsR', 'sidepods', 'spindles',
]);

/** Where piece i of qty lives: { end, side, label }. */
function pieceWhere(p, i, qty){
  if (p.labels && p.labels[i - 1] != null) return { end:p.end || null, side:null, label:p.labels[i - 1] };
  if (qty === 4 && !p.end){
    const end = i <= 2 ? 'F' : 'R', side = i % 2 ? -1 : 1;
    return { end, side, label:`${end === 'F' ? 'front' : 'rear'} ${side < 0 ? 'left' : 'right'}` };
  }
  if (qty === 2){
    const side = i === 1 ? -1 : 1;
    return { end:p.end || null, side, label:`${p.end ? (p.end === 'F' ? 'front ' : 'rear ') : ''}${side < 0 ? 'left' : 'right'}` };
  }
  return { end:p.end || null, side:null, label:`#${i}` };
}

export function expandVInstances(parts, v){
  const inst = {};
  for (const p of parts)
    if (INSTANCED.has(p.id) && p.qty >= 1) inst[p.id] = Array.from({ length:p.qty }, (_, k) => ({ id:`${p.id}.${k + 1}`, ...pieceWhere(p, k + 1, p.qty) }));
  if (!Object.keys(inst).length) return parts;
  const compatible = (a, b) => (a.side == null || b.side == null || a.side === b.side)
                            && (a.end == null || b.end == null || a.end === b.end);
  const resolve = (depId, where) => {
    const pieces = inst[depId]; if (!pieces) return [depId];
    if (!where) return pieces.map(x => x.id);
    const hit = pieces.filter(x => compatible(where, x));
    /* the front-left wheel sits on the front-left upright and on nothing at
       the back: a part at the other end is simply not a dependency */
    if (!hit.length && where.end && pieces.every(x => x.end && x.end !== where.end)) return [];
    return (hit.length ? hit : pieces).map(x => x.id);
  };
  const out = [];
  for (const p of parts){
    if (!inst[p.id]){ out.push({ ...p, deps:[...new Set(p.deps.flatMap(d => resolve(d, null)))] }); continue; }
    const each = p.each || p.name.replace(/,.*$/, '').replace(/\s*\(.*\)$/, '').replace(/s$/, '');
    for (const w of inst[p.id]){
      const i = Number(w.id.slice(w.id.indexOf('.') + 1));
      const T = p.torque ? { ...p.torque, count:Math.max(1, Math.round(p.torque.count / p.qty)),
        pattern:p.torque.pattern ? { ...p.torque.pattern, count:Math.max(1, Math.round(p.torque.count / p.qty)) } : undefined } : undefined;
      out.push({ ...p, id:w.id, name:`${each} — ${w.label}`, qty:1, parent:p.id, parentName:p.name, index:i, of:p.qty,
        end:w.end, side:w.side, torque:T, deps:[...new Set(p.deps.flatMap(d => resolve(d, w)))] });
    }
  }
  return out;
}

/** The part a piece belongs to — `wheels` for `wheels.3`, itself otherwise. */
export const vBaseId = (id) => (typeof id === 'string' && id.includes('.')) ? id.slice(0, id.indexOf('.')) : id;

/* ====================================================================== */
function finish(parts, v){
  parts = parts.filter(p => p.id && p.name);
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));
  for (const p of parts) p.blocks = [];
  for (const p of parts) p.deps = p.deps.filter(d => byId[d] && d !== p.id);
  for (const p of parts) for (const d of p.deps) byId[d].blocks.push(p.id);
  const order = [], seen = new Set();
  const visit = (id) => { if (seen.has(id)) return; seen.add(id);
    const p = byId[id]; if (!p) return; p.deps.forEach(visit); order.push(id); };
  parts.forEach(p => visit(p.id));
  parts.forEach(p => { p.step = order.indexOf(p.id); });
  const groups = V_GROUPS.filter(g => parts.some(p => p.group === g.id));
  const bases = new Set(parts.map(p => p.parent || p.id));
  return { vehicleId:v.id, parts, byId, order, groups, baseCount:bases.size,
    totalFasteners: parts.reduce((s,p) => s + (p.torque?.count || 0), 0) };
}
