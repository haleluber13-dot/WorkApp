/* MotorLab — vehicle assembly graph (chassis → wheels), generated per vehicle. */

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
  if (v.model) return modelTree(v);
  return v.class === 'bike' ? bikeTree(v) : v.class === 'kart' ? kartTree(v) : carTree(v);
}

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
function carTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const race = ['formula','stockcar','dragster','awd-rally','drift'].includes(v.id);
  const awd = v.drivetrain === 'AWD', rwd = v.drivetrain !== 'FWD';
  const liveRear = v.suspR === 'liveaxle';
  const t = (nm, seq, count, size='M12') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${Math.round(nm*0.5)} Nm`, `${nm} Nm`] });

  add({ id:'chassis', name: v.chassis === 'ladder frame' ? 'Ladder frame' : v.chassis === 'tube frame' ? 'Tube-frame chassis'
        : v.chassis === 'carbon monocoque' ? 'Carbon monocoque' : v.chassis === 'chromoly tube' ? 'Chromoly tube chassis' : 'Unibody shell',
    group:'chassis', removable:false, mesh:'chassis',
    teach:`${v.chassis === 'unibody' ? 'A unibody has no separate frame — folded and spot-welded steel panels form one stiff box, and the suspension bolts to reinforced pickup points in that box.' : v.chassis === 'ladder frame' ? 'Two full-length rails with crossmembers between them. The body bolts on through rubber mounts, so cab noise and chassis flex are separated — ideal for towing, poor for handling.' : v.chassis === 'carbon monocoque' ? 'A single carbon-fibre tub the driver sits inside. Torsional stiffness of 30,000+ Nm/degree means the suspension actually does the work instead of the chassis flexing.' : 'Welded steel tubing triangulated so every load path is a tension or compression member — no bending.'} Torsional rigidity is the number that matters: a floppy chassis makes every suspension change meaningless.`,
    spec:{ 'Type':v.chassis, 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Kerb mass':`${v.massKg} kg` } });

  if (race) add({ id:'cage', name:'Roll cage', group:'chassis', deps:['chassis'], mesh:'cage',
    teach:'A cage is not just safety equipment — a well-triangulated cage tied into the strut towers can double the shell\'s torsional stiffness. That is why cars feel sharper after one goes in.' });

  add({ id:'subfront', name:'Front subframe', group:'subframe', deps:['chassis'], mesh:'subfront',
    torque:t(110,'star',8,'M14'),
    teach:'Everything the front axle does passes through this frame: engine mounts, lower arms, steering rack, anti-roll bar. Its bushings decide how much of that gets to the shell — solid mounts sharpen turn-in and let every road imperfection through.' });
  add({ id:'subrear', name:'Rear subframe', group:'subframe', deps:['chassis'], mesh:'subrear',
    torque:t(110,'star',8,'M14'),
    teach:'Carries the differential and the rear links. Rubber bushes here are the biggest single source of rear-axle steer under load — squishy bushings let the rear toe out and the car go loose mid-corner.' });
  add({ id:'mounts', name:'Engine & gearbox mounts', group:'subframe', qty:3, deps:['subfront'], mesh:'mounts',
    torque:t(85,'sequence',6),
    teach:'Mounts have one job that fights itself: hold the engine still, and isolate its vibration. Stiffer mounts mean less wheel-hop and better shift feel, more noise and more vibration at idle.' });

  add({ id:'engine', name:'Engine assembly', group:'drive', deps:['mounts'], mesh:'engine',
    teach:`Drops in ${v.bay === 'mid' ? 'behind the cockpit, ahead of the rear axle' : v.bay === 'front-transverse' ? 'sideways across the front, gearbox on the end of it' : 'lengthways up front, gearbox behind it'}. Build and tune the engine itself in the Engine Bay and Tuning workspaces — this part is the whole unit going into the car.`,
    spec:{ 'Position':v.bay, 'Drivetrain':v.drivetrain } });
  add({ id:'gearbox', name: v.id==='dragster' ? 'Multi-stage clutch & reverser' : `${v.gears.length}-speed gearbox`, group:'drive', deps:['engine'], mesh:'gearbox',
    torque:t(65,'star',v.class==='car'?8:6),
    teach:`Gear ratios multiply engine torque and divide engine speed. First gear is chosen so the car can pull away; top gear is chosen for cruise rpm and top speed. Close ratios keep the engine in its power band; wide ratios save fuel.`,
    spec:{ 'Ratios':v.gears.map(g=>g.toFixed(2)).join(' / '), 'Final drive':v.final.toFixed(2) } });
  if (awd) add({ id:'transfer', name:'Transfer case & centre differential', group:'drive', deps:['gearbox'], mesh:'transfer',
    teach:'Splits torque front to rear. An open centre diff sends torque to whichever axle has least grip; a limited-slip or clutch-pack centre lets you bias it — 40:60 rearward is the classic rally setting.' });
  if (rwd) add({ id:'prop', name:'Propshaft', group:'drive', deps:[awd?'transfer':'gearbox'], mesh:'prop',
    teach:'Two universal joints and a sliding spline, because the differential moves up and down with the suspension while the gearbox does not. Get the operating angles wrong and it vibrates at exactly one speed.' });
  add({ id:'diff', name: liveRear ? 'Live axle & differential' : 'Rear differential', group:'drive',
    deps:[rwd ? 'prop' : 'gearbox', 'subrear'], mesh:'diff', torque:t(75,'star',10),
    teach:`${v.id==='drift' ? 'A locked or two-way clutch-type diff so both rear wheels always turn together — that is what lets the car hold a slide instead of spinning up the inside wheel.' : 'An open diff sends equal torque to both wheels, which means the one with least grip sets the limit. A limited-slip diff resists the speed difference so the loaded wheel can still put power down.'}`,
    spec:{ 'Final drive':v.final.toFixed(2), 'Type': v.id==='drift'?'2-way locked': race?'clutch-type LSD':'helical LSD / open' } });
  add({ id:'axles', name:'Driveshafts & CV joints', group:'drive', deps:['diff'], mesh:'axles',
    torque:t(230,'single',1,'M24'),
    teach:'Constant-velocity joints transmit torque at an angle without the speed fluctuation a universal joint has. Unequal-length shafts on a powerful front-drive car are exactly why torque steer exists.' });

  /* suspension, both ends */
  for (const end of ['F','R']){
    const g = end === 'F' ? 'suspF' : 'suspR';
    const type = end === 'F' ? v.suspF : v.suspR;
    const base = end === 'F' ? 'subfront' : 'subrear';
    const sfx = end === 'F' ? 'f' : 'r';
    const label = end === 'F' ? 'Front' : 'Rear';
    if (type === 'none') continue;

    if (type === 'macpherson'){
      add({ id:'lca'+sfx, name:`${label} lower control arms`, group:g, qty:2, deps:[base], mesh:'lca'+sfx, torque:t(120,'sequence',4,'M14'),
        teach:'The lower arm alone locates the bottom of the upright, so its length and angle set the roll centre and most of the camber gain. Bushings here trade compliance for precision.' });
      add({ id:'strut'+sfx, name:`${label} struts (spring + damper)`, group:g, qty:2, deps:['lca'+sfx], mesh:'strut'+sfx, torque:t(60,'star',3,'M10'),
        teach:'A MacPherson strut is the damper doing double duty as the upper suspension link. Cheap, compact, and the reason strut cars lose camber as the body rolls — exactly when they need it most.',
        spec:{ 'Spring rate': race?'90–130 N/mm':'30–55 N/mm', 'Motion ratio':'~1.0 (direct acting)' } });
    } else if (type === 'doublewishbone' || type === 'pushrod'){
      add({ id:'lca'+sfx, name:`${label} lower wishbones`, group:g, qty:2, deps:[base], mesh:'lca'+sfx, torque:t(120,'sequence',4,'M14'),
        teach:'Two arms, four pivots, complete control. Change the length and inclination of each wishbone and you control camber gain, roll centre height and anti-dive independently.' });
      add({ id:'uca'+sfx, name:`${label} upper wishbones`, group:g, qty:2, deps:['lca'+sfx], mesh:'uca'+sfx, torque:t(95,'sequence',4,'M12'),
        teach:'Shorter than the lower arm on purpose — that difference is what pulls negative camber in as the wheel goes into bump, keeping the tyre flat while the body rolls.' });
      add({ id:'damp'+sfx, name: type==='pushrod' ? `${label} pushrods & inboard dampers` : `${label} coilovers`, group:g, qty:2,
        deps:['uca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',4,'M12'),
        teach: type==='pushrod' ? 'The damper and spring live inboard, driven through a rocker by a pushrod. The wheel sees clean air, and the rocker gives you a motion ratio to play with.'
             : 'Spring and damper as one adjustable unit. Compression damping controls the tyre over bumps; rebound damping controls the body afterwards.',
        spec:{ 'Motion ratio': type==='pushrod'?'0.55–0.75':'0.85–1.0', 'Damping':'low/high-speed comp + rebound' } });
    } else if (type === 'multilink'){
      add({ id:'lca'+sfx, name:`${label} lower links & trailing arm`, group:g, qty:2, deps:[base], mesh:'lca'+sfx, torque:t(110,'sequence',6,'M14'),
        teach:'Five separate links means five separate things you can tune. The toe link is the one that matters most — it decides whether the rear steers into or out of the corner under load.' });
      add({ id:'uca'+sfx, name:`${label} upper links & toe arm`, group:g, qty:2, deps:['lca'+sfx], mesh:'uca'+sfx, torque:t(90,'sequence',4,'M12'),
        teach:'Adjustable toe arms are the first thing a track build gets: rear toe of 0.1–0.2° in per side calms the car dramatically on corner exit.' });
      add({ id:'damp'+sfx, name:`${label} coilovers`, group:g, qty:2, deps:['uca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',4,'M12'),
        teach:'Rear spring rate relative to the front is your main balance tool: stiffer rear = more oversteer, stiffer front = more understeer.' });
    } else if (type === 'liveaxle' || type === 'solid'){
      add({ id:'lca'+sfx, name:`${label} axle location (links/leaves)`, group:g, qty:2, deps:[base], mesh:'lca'+sfx, torque:t(140,'sequence',4,'M16'),
        teach:'A live axle carries the differential inside it, so all that mass is unsprung. Leaf springs both locate and suspend it; four-link setups separate those two jobs and control axle wrap under power.' });
      add({ id:'damp'+sfx, name:`${label} shocks`, group:g, qty:2, deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(70,'sequence',2,'M12'),
        teach:'On a live axle the shocks fight wheel hop as much as body motion — that is why drag cars run 90/10 and 50/50 valving front to rear.' });
    } else if (type === 'torsionbeam'){
      add({ id:'lca'+sfx, name:'Rear torsion beam', group:g, deps:[base], mesh:'lca'+sfx, torque:t(110,'sequence',4,'M14'),
        teach:'One pressed-steel beam acting as trailing arms and anti-roll bar in a single part. Cheap, light, packages tiny — and gives you almost nothing to adjust.' });
      add({ id:'damp'+sfx, name:'Rear dampers & springs', group:g, qty:2, deps:['lca'+sfx], mesh:'damp'+sfx, torque:t(60,'sequence',2,'M12'),
        teach:'Separate spring and damper mounted almost vertically, so motion ratio is close to 1:1 and spring rate changes have a direct effect.' });
    } else if (type === 'airbag'){
      add({ id:'lca'+sfx, name:'Air-suspension trailing arms', group:g, qty:2, deps:[base], mesh:'lca'+sfx, torque:t(150,'sequence',4,'M16'),
        teach:'Air springs hold ride height constant whatever the load — essential when the vehicle mass triples between empty and fully freighted.' });
      add({ id:'damp'+sfx, name:'Air bags & levelling valves', group:g, qty:4, deps:['lca'+sfx], mesh:'damp'+sfx,
        teach:'A height-control valve bleeds air in or out to keep the frame level. Spring rate rises with load automatically — that is air suspension\'s whole advantage.' });
    }
    add({ id:'upr'+sfx, name:`${label} uprights / hubs & bearings`, group:g, qty:2, deps:[type==='torsionbeam'||type==='liveaxle'||type==='solid'||type==='airbag' ? 'lca'+sfx : (['doublewishbone','pushrod','multilink'].includes(type) ? 'uca'+sfx : 'strut'+sfx)],
      mesh:'upr'+sfx, torque:t(280,'single',1,'M22'),
      teach:`The upright holds the wheel bearing, the brake caliper and the ${end==='F'?'steering arm':'toe link'}. Its geometry sets ${end==='F'?'kingpin inclination and scrub radius — the two numbers that decide how the steering feels under braking':'bump steer at the rear'}.` });
    if (type !== 'torsionbeam' && type !== 'none')
      add({ id:'arb'+sfx, name:`${label} anti-roll bar`, group:g, deps:['upr'+sfx], mesh:'arb'+sfx, torque:t(45,'sequence',4,'M10'),
        teach:`A torsion spring that only resists *roll*, not bump. Stiffness scales with the fourth power of bar diameter — a 2 mm thicker bar is a huge change. Stiffer ${end==='F'?'front bar adds understeer':'rear bar adds oversteer'}.` });
  }

  add({ id:'rack', name:'Steering rack & tie rods', group:'steering', deps:['subfront','uprf'], mesh:'rack', torque:t(80,'sequence',4,'M12'),
    teach:`Rack ratio decides how much lock you get per turn of the wheel. Tie-rod height must match the lower arm's arc or the wheel steers itself as the suspension moves — that is bump steer.${v.steerAngle?` This build runs modified knuckles for ${v.steerAngle}° of lock.`:''}` });
  add({ id:'column', name:'Steering column & wheel', group:'steering', deps:['rack'], mesh:'column',
    teach:'A collapsible column with universal joints. Castor angle — not the rack — is what makes the wheel self-centre.' });

  for (const end of ['F','R']){
    const sfx = end === 'F' ? 'f' : 'r'; const label = end === 'F' ? 'Front' : 'Rear';
    const dia = end === 'F' ? v.brakeF : v.brakeR;
    if (!dia) continue;
    add({ id:'disc'+sfx, name:`${label} discs`, group:'brakes', qty:2, deps:['upr'+sfx], mesh:'disc'+sfx,
      teach:`A brake turns kinetic energy into heat and then throws it away. Disc diameter gives leverage; vane design and mass decide how much heat it can hold before it fades.`,
      spec:{ 'Diameter':`${dia} mm`, 'Type': race?'floating 2-piece, directional vanes':'vented cast iron' } });
    add({ id:'cal'+sfx, name:`${label} calipers & pads`, group:'brakes', qty:2, deps:['disc'+sfx], mesh:'cal'+sfx, torque:t(115,'sequence',2,'M14'),
      teach:`Piston area sets clamping force for a given line pressure — that is what "brake bias" really means. Pad compound decides friction *and* how it changes with temperature; a race pad is dangerous cold.` });
  }
  add({ id:'mcyl', name:'Master cylinder, booster & lines', group:'brakes', deps:['calf'], mesh:'mcyl',
    teach:'Pedal force × pedal ratio × booster assist ÷ master-cylinder area = line pressure. Fit bigger calipers without thinking about master-cylinder bore and the pedal goes long and soft.' });
  add({ id:'abs', name:'ABS / stability module', group:'brakes', deps:['mcyl'], mesh:'abs',
    teach:'Wheel-speed sensors spot a wheel decelerating faster than the car and modulate that circuit up to 15 times a second. Stability control adds yaw rate and steering angle and brakes individual corners to correct a slide.' });
  add({ id:'hbrake', name: v.id==='drift' ? 'Hydraulic handbrake' : 'Parking brake', group:'brakes', deps:['calr'], mesh:'hbrake',
    teach: v.id==='drift' ? 'A separate master cylinder plumbed into the rear circuit only — pull it and the rear locks instantly regardless of pedal input. This is how a drift is initiated and adjusted.' : 'Cable or electric actuator on the rear calipers, holding the car with the engine off.' });

  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, deps:['uprf','uprr'], mesh:'wheels',
    torque:t(120,'star',5,'M14'),
    teach:`Contact patch is roughly load ÷ tyre pressure, whatever the tyre. Width mostly buys you *heat capacity* and lateral stiffness, not raw area. Always torque wheels in a star pattern; never with an impact gun on a road car.`,
    spec:{ 'Front':`${v.tyreF}/${v.rimF}"`, 'Rear':`${v.tyreR}/${v.rimR}"`, 'Torque':'120 Nm star pattern' } });

  add({ id:'tank', name:'Fuel tank, pump & lines', group:'fuel', deps:['chassis'], mesh:'tank',
    teach:`${race?'A foam-filled fuel cell with a rubber bladder and a surge tank, so the pump never sees air under 2 g of cornering.':'A moulded plastic tank with an in-tank pump and a swirl pot. Under hard cornering an uncovered pickup pulls air — which is why race cars use surge tanks.'}`,
    spec:{ 'Capacity':`${v.fuelL} L` } });
  add({ id:'exhaustsys', name:'Exhaust system', group:'fuel', deps:['engine'], mesh:'exhaustsys',
    teach:'From the engine back: catalyst (or not, on a race car), resonator to cancel a specific frequency, muffler to absorb the rest. Every one of them is a restriction you trade for legality and noise.' });
  add({ id:'rad', name:'Radiator, fans & cooling', group:'cool', deps:['chassis','engine'], mesh:'rad',
    teach:'Airflow through the core, not core size, usually limits cooling. Sealing the gap between bumper and radiator is worth more than a bigger radiator badly ducted.' });
  if (v.downforceKg) add({ id:'aero', name:'Splitter, wing & diffuser', group:'body', deps:['chassis'], mesh:'aero',
    teach:`Downforce rises with the square of speed: ${v.downforceKg} kg at top speed is only a quarter of that at half speed. The splitter and diffuser must be balanced against the wing or the car changes character with every straight.`,
    spec:{ 'Peak downforce':`${v.downforceKg} kg`, 'Cd':v.cd.toFixed(2) } });

  add({ id:'battery', name:'Battery & main cables', group:'elec', deps:['chassis'], mesh:'battery',
    teach:'The battery starts the engine and buffers the alternator; it does not "power" a running car. Cable size is set by starter current — voltage drop, not fuse rating, is what sizes it.' });
  add({ id:'fusebox', name:'Fuse box & relays', group:'elec', deps:['battery'], mesh:'fusebox',
    teach:'A fuse protects the *wire*, never the device. Size the wire for the load, then fuse just above the wire\'s continuous rating. A relay lets a thin switch wire control a thick power wire.' });
  add({ id:'harness', name:'Wiring harness & grounds', group:'elec', deps:['fusebox'], mesh:'harness',
    teach:'Most "electrical gremlins" are ground faults. Current has to get back to the battery negative, and a corroded ground strap raises the voltage everything else floats at.' });
  add({ id:'lights', name:'Lighting & signals', group:'elec', deps:['harness'], mesh:'lights',
    teach:'LEDs draw a tenth of the current of filament bulbs, which is why converting them upsets flasher relays that measure current to detect a blown bulb.' });
  add({ id:'headunit', name:'Head unit / infotainment', group:'audio', deps:['harness'], mesh:'headunit',
    teach:'Pre-amp outputs feed the amplifier a clean low-level signal; speaker-level outputs do not. Setting head-unit volume past ~80% clips the signal, and clipping is what actually kills tweeters.' });
  add({ id:'amp', name:'Amplifier & distribution', group:'audio', deps:['headunit','battery'], mesh:'amp',
    teach:'Amplifier current draw ≈ RMS power ÷ (efficiency × 13.8 V). A 1,000 W RMS amp at 75% efficiency pulls nearly 100 A — that is a bigger load than the headlights, wipers and blower combined.' });
  add({ id:'speakers', name:'Speakers, subwoofer & enclosure', group:'audio', deps:['amp'], mesh:'speakers',
    teach:'Impedance sets the load: two 4 Ω subs wired in parallel present 2 Ω, which roughly doubles amplifier current draw. Sealed boxes are tight and flat; ported boxes are louder over a narrow band.' });
  add({ id:'body', name:'Body panels & glass', group:'body', deps:['chassis'], mesh:'body',
    teach:'On a unibody the outer panels carry real structural load; on a tube-frame car they are just skin. Weight here is high up, so it costs you more in roll than the same mass in the floor.' });
  add({ id:'seats', name:'Seats, harnesses & dash', group:'interior', deps:['chassis'], mesh:'seats',
    teach:`${race?'A fixed-back shell with the harness mounted so the shoulder straps run within 20° of horizontal — mount them too high and a frontal impact compresses your spine.':'Seat position sets your view, your leverage on the controls and where the centre of mass sits.'}` });

  return finish(parts, v);
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
function kartTree(v){
  const parts = [], add = (o) => { parts.push(P(o)); return o.id; };
  const t = (nm, seq, count, size='M8') => ({ nm, size, count, pattern:{ kind:seq, count }, stages:[`${nm} Nm`] });
  add({ id:'chassis', name:'Kart frame', group:'chassis', removable:false, mesh:'chassis',
    teach:'A kart has no suspension and no differential. The frame itself is the spring — it twists to lift the inside rear wheel so the kart can turn at all. Tube diameter and stiffener bars are the entire setup.',
    spec:{ 'Wheelbase':`${v.wheelbase} mm`, 'Track F/R':`${v.trackF}/${v.trackR} mm`, 'Mass':`${v.massKg} kg` } });
  add({ id:'axle', name:'Rear axle & bearings', group:'drive', deps:['chassis'], mesh:'axle', torque:t(25,'sequence',6),
    teach:'Axle stiffness is the main tuning tool: a softer axle lets the frame flex more and frees the kart up; a stiffer axle plants it. Length and hub width change how much the inside rear lifts.' });
  add({ id:'engine', name:'Engine & mount', group:'drive', deps:['chassis'], mesh:'engine', torque:t(30,'sequence',4),
    teach:'Bolted to the side of the frame on a slotted mount — sliding it changes chain tension and, slightly, the weight distribution.' });
  add({ id:'final', name:'Chain & sprockets', group:'drive', deps:['engine','axle'], mesh:'final',
    teach:'Sprocket choice is the only gearing you have on most karts, and it is changed for every track and even for temperature.' });
  add({ id:'spindles', name:'Front spindles & kingpins', group:'suspF', deps:['chassis'], mesh:'spindles', torque:t(35,'sequence',2),
    teach:'Caster and camber are set with eccentric kingpin pills. More caster jacks the inside rear higher when you steer — that is literally how a kart lifts a wheel to turn.' });
  add({ id:'rack', name:'Steering column & tie rods', group:'steering', deps:['spindles'], mesh:'rack', torque:t(25,'sequence',4),
    teach:'Ackermann geometry: the inside front wheel steers more than the outside so both follow their own arc. On a kart you change it by moving the tie-rod hole.' });
  add({ id:'wheels', name:'Wheels & tyres', group:'wheels', qty:4, deps:['spindles','axle'], mesh:'wheels', torque:t(25,'star',3),
    teach:'Tyre pressure is the fastest setup change on a kart — a few tenths of a bar transforms grip and how quickly the tyre comes up to temperature.' });
  add({ id:'calr', name:'Rear brake & master cylinder', group:'brakes', deps:['axle'], mesh:'calr', torque:t(20,'sequence',2),
    teach:'One disc on the axle, braking both rear wheels together. Lock it and the kart simply slides straight on.' });
  add({ id:'tank', name:'Fuel tank & lines', group:'fuel', deps:['chassis'], mesh:'tank', teach:'Mounted between the driver\'s legs, low and central, so the balance barely changes as it empties.' });
  add({ id:'seats', name:'Seat & stiffeners', group:'interior', deps:['chassis'], mesh:'seats',
    teach:'Seat position and seat stays are a genuine tuning tool: moving the seat 10 mm changes rear grip noticeably, and stays stiffen the frame around the axle.' });
  add({ id:'harness', name:'Ignition & wiring', group:'elec', deps:['engine'], mesh:'harness', teach:'A kill switch, a coil and, on a shifter kart, a battery and starter. That is the entire electrical system.' });
  return finish(parts, v);
}

/* ====================================================================== */
function finish(parts, v){
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));
  for (const p of parts) p.blocks = [];
  for (const p of parts) p.deps = p.deps.filter(d => byId[d]);
  for (const p of parts) for (const d of p.deps) byId[d].blocks.push(p.id);
  const order = [], seen = new Set();
  const visit = (id) => { if (seen.has(id)) return; seen.add(id);
    const p = byId[id]; if (!p) return; p.deps.forEach(visit); order.push(id); };
  parts.forEach(p => visit(p.id));
  parts.forEach(p => { p.step = order.indexOf(p.id); });
  const groups = V_GROUPS.filter(g => parts.some(p => p.group === g.id));
  return { vehicleId:v.id, parts, byId, order, groups,
    totalFasteners: parts.reduce((s,p) => s + (p.torque?.count || 0), 0) };
}
