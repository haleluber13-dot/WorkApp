/* MotorLab — vehicle catalog.
 * Archetypes drawn from the real world (a hot hatch, a mid-engine supercar, a
 * heavy-duty pickup, a superbike…) with the numbers that actually change how
 * they behave: mass, wheelbase, track, drivetrain, suspension type, gearing,
 * tyre width and aero. The 3D builder derives the whole vehicle from these.
 */

const V = (o) => Object.assign({
  class:'car', drivetrain:'FWD', bay:'front-transverse', suspF:'macpherson', suspR:'torsionbeam',
  chassis:'unibody', brakeF:300, brakeR:280, tyreF:205, tyreR:205, rimF:17, rimR:17,
  cd:0.32, area:2.2, downforceKg:0, driveLoss:0.14, fuelL:50, seats:5, colour:0x2f6fb0,
}, o);

const CATALOG = [
  V({ id:'hatch', name:'Hot hatchback', body:'hatch', engines:['i4-16-na','i4-20-t','i4-20-vtec','d-i4-20'],
      massKg:1320, wheelbase:2620, trackF:1540, trackR:1520, lengthMm:4250, widthMm:1800, heightMm:1450,
      gears:[3.62,2.08,1.36,1.03,0.84,0.69], final:4.06, tyreF:225, tyreR:225, rimF:18, rimR:18,
      brakeF:340, brakeR:300, cd:0.33, area:2.15, fuelL:50,
      blurb:'Front-wheel drive, transverse engine, MacPherson struts up front and a torsion beam at the back. The most common performance-car layout on earth and the best place to learn why understeer happens.' }),

  V({ id:'sedan', name:'Sports sedan', body:'sedan', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'multilink', engines:['i6-30-tt','v6-29-tt','i4-20-t','v8-40-tt'],
      massKg:1720, wheelbase:2860, trackF:1600, trackR:1620, lengthMm:4750, widthMm:1870, heightMm:1440,
      gears:[5.25,3.36,2.17,1.72,1.32,1.00,0.82,0.64], final:3.15, tyreF:255, tyreR:275, rimF:19, rimR:19,
      brakeF:380, brakeR:360, cd:0.29, area:2.25, fuelL:65,
      blurb:'Longitudinal engine, gearbox behind it, propshaft to a limited-slip differential. Double wishbones front, multilink rear — the classic recipe for a car that steers with the throttle.' }),

  V({ id:'coupe', name:'Rear-drive sports coupe', body:'coupe', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'multilink', engines:['i6-30-legend','f4-25-t','v8-50-ohv','i4-20-vtec','rotary-13b-t'],
      massKg:1380, wheelbase:2570, trackF:1520, trackR:1550, lengthMm:4380, widthMm:1790, heightMm:1290,
      gears:[3.63,2.19,1.54,1.21,1.00,0.79], final:3.73, tyreF:235, tyreR:265, rimF:18, rimR:18,
      brakeF:355, brakeR:330, cd:0.28, area:2.0, fuelL:55, seats:4,
      blurb:'Light, short-wheelbase, rear-drive. Weight distribution near 50:50 and a limited-slip diff — this is the car every drift and track lesson is built around.' }),

  V({ id:'super', name:'Mid-engine supercar', body:'super', drivetrain:'RWD', bay:'mid',
      suspF:'doublewishbone', suspR:'doublewishbone', chassis:'carbon monocoque',
      engines:['v10-52-na','v12-65-na','v8-52-flat','f6-30-t','v8-40-tt'],
      massKg:1480, wheelbase:2700, trackF:1670, trackR:1650, lengthMm:4550, widthMm:1990, heightMm:1160,
      gears:[3.13,2.05,1.48,1.15,0.94,0.78,0.65], final:3.62, tyreF:255, tyreR:325, rimF:20, rimR:21,
      brakeF:398, brakeR:380, cd:0.34, area:1.95, downforceKg:180, fuelL:80, seats:2,
      blurb:'Engine behind the driver, ahead of the rear axle — the lowest possible polar moment of inertia. Pushrod-actuated inboard dampers and real aerodynamic downforce.' }),

  V({ id:'awd-rally', name:'AWD rally car', body:'rally', drivetrain:'AWD', bay:'front-transverse',
      suspF:'macpherson', suspR:'macpherson', engines:['race-20-rally','i5-25-t','f4-25-t','i4-20-t'],
      massKg:1230, wheelbase:2600, trackF:1600, trackR:1600, lengthMm:4180, widthMm:1875, heightMm:1440,
      gears:[2.92,2.07,1.59,1.28,1.06,0.88], final:4.11, tyreF:225, tyreR:225, rimF:18, rimR:18,
      brakeF:355, brakeR:305, cd:0.36, area:2.2, fuelL:60,
      blurb:'Three differentials, 300 mm of suspension travel and a centre diff you can bias from the cockpit. Long-travel struts and a welded roll cage doing structural work.' }),

  V({ id:'pickup', name:'Heavy-duty pickup', body:'pickup', drivetrain:'AWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'liveaxle', chassis:'ladder frame',
      engines:['d-i6-67','d-v8-66','v8-62-sc','v8-50-ohv'],
      massKg:3400, wheelbase:3680, trackF:1740, trackR:1780, lengthMm:6120, widthMm:2050, heightMm:2020,
      gears:[4.71,3.14,2.10,1.67,1.29,1.00,0.84,0.67,0.58,0.50], final:3.73, tyreF:285, tyreR:285, rimF:20, rimR:20,
      brakeF:380, brakeR:380, cd:0.42, area:3.6, fuelL:130, driveLoss:0.19,
      blurb:'Body-on-frame: a ladder chassis carrying a live rear axle on leaf springs. Everything is sized for towing loads, not for corner speed.' }),

  V({ id:'semi', name:'Class-8 truck tractor', body:'semi', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'liveaxle', suspR:'airbag', chassis:'ladder frame', engines:['d-i6-67','d-v8-66'],
      massKg:8200, wheelbase:4300, trackF:2050, trackR:1850, lengthMm:6800, widthMm:2550, heightMm:3900,
      gears:[12.8,8.9,6.5,4.7,3.4,2.5,1.8,1.35,1.0,0.74], final:3.42, tyreF:315, tyreR:295, rimF:22, rimR:22,
      brakeF:430, brakeR:430, cd:0.62, area:9.5, fuelL:900, driveLoss:0.22, seats:2,
      blurb:'Air suspension, air brakes, a ten-speed range-splitter gearbox and an engine tuned for 1,000,000 km between rebuilds rather than for peak power.' }),

  V({ id:'drift', name:'Drift-spec coupe', body:'coupe', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'macpherson', suspR:'multilink', engines:['i6-30-legend','v8-50-ohv','rotary-20b','i4-20-t'],
      massKg:1250, wheelbase:2570, trackF:1560, trackR:1580, lengthMm:4400, widthMm:1820, heightMm:1290,
      gears:[3.32,1.90,1.31,1.00,0.75], final:4.08, tyreF:235, tyreR:265, rimF:18, rimR:18,
      brakeF:330, brakeR:310, cd:0.31, area:2.0, fuelL:60, seats:2, steerAngle:65,
      blurb:'Welded or two-way locked differential, hydraulic handbrake, and modified steering knuckles for 65° of lock. Built to hold a slide, not to set a lap time.' }),

  V({ id:'formula', name:'Open-wheel formula car', body:'formula', drivetrain:'RWD', bay:'mid',
      suspF:'pushrod', suspR:'pushrod', chassis:'carbon monocoque', engines:['race-16-v6h','i4-20-vtec','race-58-stock'],
      massKg:798, wheelbase:3600, trackF:1600, trackR:1550, lengthMm:5600, widthMm:2000, heightMm:950,
      gears:[2.85,2.12,1.72,1.44,1.23,1.07,0.94,0.83], final:3.10, tyreF:305, tyreR:405, rimF:18, rimR:18,
      brakeF:278, brakeR:266, cd:0.90, area:1.5, downforceKg:1400, fuelL:110, seats:1, driveLoss:0.09, tyreMu:1.75,
      blurb:'Carbon monocoque, inboard pushrod suspension, and more downforce than the car weighs at speed. The engine is a stressed member — the gearbox bolts to it and the rear suspension bolts to the gearbox.' }),

  V({ id:'stockcar', name:'Oval stock car', body:'stockcar', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'liveaxle', chassis:'tube frame', engines:['race-58-stock','v8-50-ohv','v8-70-bb'],
      massKg:1540, wheelbase:2790, trackF:1600, trackR:1600, lengthMm:5000, widthMm:1900, heightMm:1300,
      gears:[2.66,1.78,1.30,1.00], final:3.90, tyreF:305, tyreR:305, rimF:15, rimR:15,
      brakeF:330, brakeR:330, cd:0.38, area:2.3, downforceKg:320, fuelL:70, seats:1,
      blurb:'Steel tube frame, live rear axle on trailing arms, and deliberate left-side weight bias for turning left at 300 km/h for four hours.' }),

  V({ id:'nns', name:'NASCAR stock car (modelled)', body:'stockcar', model:'nns',
      drivetrain:'RWD', bay:'front-longitudinal', suspF:'doublewishbone', suspR:'liveaxle',
      chassis:'tube frame', engines:['race-58-stock','v8-50-ohv','v8-70-bb','v8-62-sc'],
      massKg:1540, wheelbase:2780, trackF:1600, trackR:1600,
      lengthMm:5120, widthMm:1930, heightMm:1310,
      gears:[2.66,1.78,1.30,1.00], final:3.90, tyreF:305, tyreR:305, rimF:15, rimR:15,
      brakeF:330, brakeR:330, cd:0.38, area:2.35, downforceKg:320, fuelL:70, seats:1,
      colour:0xc0392b,
      blurb:'Built from a real model rather than generated, so the bodywork comes apart the way the actual car does: front and rear clip, wheel arches, doors, roof, hood and boot each come off separately, over a welded tube frame with a live rear axle. Steel tube chassis, no driver aids, and a body shaped by a rulebook rather than a wind tunnel.' }),

  V({ id:'koenigsegg', name:'Carbon hypercar (modelled)', body:'super', model:'koenigsegg',
      drivetrain:'RWD', bay:'mid', suspF:'doublewishbone', suspR:'doublewishbone',
      chassis:'carbon monocoque', engines:['v8-40-tt','v8-52-flat','v12-65-na','v10-52-na','w16-80-qt'],
      massKg:1360, wheelbase:2660, trackF:1700, trackR:1735,
      lengthMm:4500, widthMm:2060, heightMm:1185,
      gears:[2.92,1.94,1.44,1.13,0.92,0.76,0.63], final:3.36, tyreF:265, tyreR:345, rimF:19, rimR:20,
      brakeF:397, brakeR:380, cd:0.33, area:1.88, downforceKg:300, fuelL:70, seats:2,
      driveLoss:0.11, tyreMu:1.42, colour:0x9aa3ad,
      blurb:'Built from a real model, not generated. A carbon tub with the bodywork, exposed carbon aero, cabin, glass and lights each coming off separately. Mid-mounted engine, double wishbones at both ends, and enough carbon in the structure that the whole car weighs less than a family hatchback.' }),

  V({ id:'concept', name:'Concept coupé (modelled)', body:'coupe', model:'carconcept',
      drivetrain:'AWD', bay:'front-longitudinal', suspF:'doublewishbone', suspR:'multilink',
      chassis:'bonded aluminium', engines:['v8-40-tt','v6-29-tt','i6-30-tt','v10-52-na','i4-20-t'],
      massKg:1780, wheelbase:2800, trackF:1950, trackR:1965,
      lengthMm:4360, widthMm:2220, heightMm:1150,
      gears:[4.70,3.13,2.10,1.67,1.29,1.00,0.84], final:3.44, tyreF:285, tyreR:285, rimF:24, rimR:24,
      brakeF:390, brakeR:370, cd:0.26, area:2.15, downforceKg:60, fuelL:68, seats:2,
      driveLoss:0.11, tyreMu:1.30, colour:0xa8100c,
      blurb:'A complete road car built as a model rather than generated, and the most detailed vehicle in MotorLab: every panel, both doors with their mirrors and glass, the roof, the bonnet, the tail, the glazing, the wipers, the full cabin with seats, wheel and pedals, and all four wheels with the discs and calipers behind them. Take the wheels off and the brakes stay where they are. Three complete factory paint jobs come with it.' }),


  /* ---- named cars ------------------------------------------------------
     Real vehicles, entered from their published kerb mass, wheelbase, track,
     dimensions, tyre sizes and gear ratios. The 3D builder lofts the body from
     those numbers, so a car with a 2,650 mm wheelbase and a 1,190 mm roof gets
     exactly that on screen. Names identify the engineering; no manufacturer is
     affiliated with or endorses this app. */

  V({ id:'bmw-m3-e46', name:'BMW M3 (E46)', body:'coupe', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'macpherson', suspR:'multilink', engines:['bmw-s54','i6-30-legend','bmw-s65'],
      massKg:1570, wheelbase:2731, trackF:1518, trackR:1525, lengthMm:4492, widthMm:1780, heightMm:1372,
      gears:[4.23,2.51,1.67,1.23,1.00,0.83], final:3.62, tyreF:225, tyreR:255, rimF:18, rimR:18,
      brakeF:325, brakeR:328, cd:0.33, area:2.05, fuelL:63, seats:4, colour:0x5c9bd6,
      blurb:'A naturally aspirated straight six with six throttle bodies, a limited-slip differential and struts at the front. The chassis is deliberately soft in roll and stiff in bump so it tells you what the rear axle is doing before it does it.' }),

  V({ id:'bmw-m5', name:'BMW M5 (super saloon)', body:'sedan', drivetrain:'AWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'multilink', engines:['i6-30-tt','bmw-s65','merc-m178','v8-40-tt'],
      massKg:1855, wheelbase:2982, trackF:1627, trackR:1621, lengthMm:4966, widthMm:1903, heightMm:1473,
      gears:[5.00,3.20,2.14,1.72,1.31,1.00,0.82,0.64], final:3.15, tyreF:275, tyreR:285, rimF:20, rimR:20,
      brakeF:395, brakeR:380, cd:0.32, area:2.32, fuelL:68, seats:5, colour:0x2b3a4a,
      blurb:'Four doors, four driven wheels and a switch that disconnects the front axle entirely. Everything that makes it fast — the diff, the dampers, the torque split — is a map, which makes it the best car here for learning what those maps actually do.' }),

  V({ id:'mazda-rx7', name:'Mazda RX-7 (FD)', body:'coupe', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'doublewishbone', engines:['rotary-13b-t','rotary-20b','mazda-r26b'],
      massKg:1260, wheelbase:2425, trackF:1460, trackR:1460, lengthMm:4295, widthMm:1760, heightMm:1230,
      gears:[3.48,2.02,1.39,1.00,0.72], final:4.10, tyreF:225, tyreR:255, rimF:17, rimR:17,
      brakeF:294, brakeR:292, cd:0.31, area:1.90, fuelL:76, seats:4, colour:0xd8dde3,
      blurb:'Double wishbones at all four corners, a 50:50 weight split and an engine with no reciprocating parts at all. The sequential twin turbos hand over at about 4,500 rpm — a system of six vacuum-actuated valves that is the single most misunderstood thing on the car.' }),

  V({ id:'mazda-mx5', name:'Mazda MX-5 (NA)', body:'roadster', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'doublewishbone', engines:['mazda-bp','i4-16-na','rotary-13b-t'],
      massKg:960, wheelbase:2265, trackF:1405, trackR:1425, lengthMm:3970, widthMm:1675, heightMm:1235,
      gears:[3.14,1.89,1.33,1.00,0.81], final:4.10, tyreF:185, tyreR:185, rimF:14, rimR:14,
      brakeF:235, brakeR:231, cd:0.38, area:1.72, fuelL:45, seats:2, colour:0xb61e23,
      blurb:'Under a tonne, double wishbones at both ends, and a powerplant frame — an aluminium beam bolting the gearbox rigidly to the differential so the whole drivetrain reacts as one piece. The least powerful car here and the one that teaches balance best.' }),

  V({ id:'audi-r8', name:'Audi R8 V10', body:'super', drivetrain:'AWD', bay:'mid',
      suspF:'doublewishbone', suspR:'doublewishbone', chassis:'aluminium spaceframe',
      engines:['v10-52-na','v8-40-tt','porsche-9a1-gt3'],
      massKg:1660, wheelbase:2650, trackF:1638, trackR:1599, lengthMm:4426, widthMm:1940, heightMm:1240,
      gears:[3.13,2.05,1.48,1.15,0.94,0.78,0.65], final:3.61, tyreF:245, tyreR:305, rimF:19, rimR:19,
      brakeF:380, brakeR:356, cd:0.36, area:1.99, downforceKg:100, fuelL:83, seats:2,
      driveLoss:0.13, colour:0xb9bfc6,
      blurb:'A bonded and riveted aluminium spaceframe with a dry-sumped V10 sitting behind the cabin and driving all four wheels through a multi-plate clutch on the front axle. No turbos, no hybrid — just 8,700 rpm and a gearbox ahead of the engine.' }),

  V({ id:'audi-rs3', name:'Audi RS 3 (five-cylinder)', body:'hatch', drivetrain:'AWD', bay:'front-transverse',
      suspF:'macpherson', suspR:'multilink', engines:['i5-25-t','i4-20-t','toyota-g16e'],
      massKg:1575, wheelbase:2631, trackF:1567, trackR:1541, lengthMm:4389, widthMm:1851, heightMm:1414,
      gears:[3.56,2.53,1.65,1.21,0.94,0.81,0.67], final:4.17, tyreF:265, tyreR:245, rimF:19, rimR:19,
      brakeF:375, brakeR:310, cd:0.34, area:2.18, fuelL:55, seats:5, colour:0x4d5b68,
      blurb:'A transverse five-cylinder hanging ahead of the front axle, with a torque-splitting rear differential that can send everything to one rear wheel. The 1-2-4-5-3 firing order is why it sounds like nothing else on the road.' }),

  V({ id:'audi-quattro-s1', name:'Audi Quattro (Group B)', body:'rally', drivetrain:'AWD',
      bay:'front-longitudinal', suspF:'macpherson', suspR:'macpherson', chassis:'steel with cage',
      engines:['i5-25-t','race-20-rally'],
      massKg:1090, wheelbase:2204, trackF:1510, trackR:1510, lengthMm:4240, widthMm:1860, heightMm:1344,
      gears:[2.50,1.75,1.30,1.03,0.83], final:4.11, tyreF:245, tyreR:245, rimF:16, rimR:16,
      brakeF:330, brakeR:305, cd:0.42, area:2.10, downforceKg:120, fuelL:120, seats:2,
      driveLoss:0.17, colour:0xe4e6e8,
      blurb:'The car that proved permanent four-wheel drive belonged in competition. Short wheelbase, engine hung out ahead of the front axle, and a five-cylinder turbo with anti-lag — nose-heavy, violent, and quicker on loose surfaces than anything two-wheel drive.' }),

  V({ id:'maserati-mc20', name:'Maserati MC20', body:'super', drivetrain:'RWD', bay:'mid',
      suspF:'doublewishbone', suspR:'doublewishbone', chassis:'carbon monocoque',
      engines:['maserati-nettuno','maserati-f136','v8-40-tt'],
      massKg:1500, wheelbase:2700, trackF:1682, trackR:1610, lengthMm:4669, widthMm:1965, heightMm:1224,
      gears:[3.36,2.13,1.55,1.21,1.00,0.84,0.70,0.60], final:3.44, tyreF:245, tyreR:305, rimF:20, rimR:20,
      brakeF:380, brakeR:350, cd:0.38, area:1.95, downforceKg:110, fuelL:60, seats:2,
      driveLoss:0.11, colour:0x1b3f7a,
      blurb:'A carbon tub with the engine as a fully stressed member, butterfly doors and a pre-chamber V6 lifted almost intact from Formula 1 thinking. Two spark plugs per cylinder, one of which fires inside a thimble-sized chamber and lights the main charge from six directions.' }),

  V({ id:'maserati-granturismo', name:'Maserati GranTurismo', body:'gt', drivetrain:'RWD',
      bay:'front-longitudinal', suspF:'doublewishbone', suspR:'doublewishbone',
      engines:['maserati-f136','v8-40-tt','ferrari-f140'],
      massKg:1880, wheelbase:2942, trackF:1586, trackR:1590, lengthMm:4881, widthMm:1915, heightMm:1353,
      gears:[4.19,2.53,1.67,1.22,1.00,0.80], final:3.73, tyreF:245, tyreR:285, rimF:20, rimR:20,
      brakeF:360, brakeR:345, cd:0.33, area:2.16, fuelL:86, seats:4, colour:0x0e2a52,
      blurb:'A front-mid engine — the whole V8 sits behind the front axle line — with the gearbox at the back for weight balance. Wishbones at both ends, a flat-plane crank and a exhaust valve that opens at 3,000 rpm and changes the car’s character completely.' }),

  V({ id:'toyota-supra-a80', name:'Toyota Supra (A80)', body:'coupe', drivetrain:'RWD',
      bay:'front-longitudinal', suspF:'doublewishbone', suspR:'doublewishbone',
      engines:['i6-30-legend','nissan-rb26','i6-30-tt'],
      massKg:1510, wheelbase:2550, trackF:1520, trackR:1525, lengthMm:4520, widthMm:1810, heightMm:1275,
      gears:[3.83,2.36,1.69,1.31,1.00,0.79], final:3.13, tyreF:235, tyreR:255, rimF:17, rimR:17,
      brakeF:324, brakeR:324, cd:0.31, area:1.98, fuelL:75, seats:4, colour:0xd8d9db,
      blurb:'A closed-deck iron block with six bolts per main bearing cap, which is the entire reason this engine has the reputation it has: the bottom end will take three times its factory power before anything in it complains. Sequential twin turbos, wishbones all round.' }),

  V({ id:'toyota-ae86', name:'Toyota Corolla (AE86)', body:'coupe', drivetrain:'RWD',
      bay:'front-longitudinal', suspF:'macpherson', suspR:'liveaxle',
      engines:['i4-16-na','mazda-bp','i4-20-vtec'],
      massKg:940, wheelbase:2400, trackF:1355, trackR:1345, lengthMm:4205, widthMm:1625, heightMm:1335,
      gears:[3.59,2.25,1.44,1.00,0.86], final:4.30, tyreF:185, tyreR:185, rimF:14, rimR:14,
      brakeF:250, brakeR:240, cd:0.39, area:1.80, fuelL:50, seats:4, colour:0xf2f3f4,
      blurb:'A live rear axle on four links and a Panhard rod, struts up front, and 130 hp in a car under a tonne. The rear axle is the lesson: both wheels are tied together, so lifting one lifts the other, and the whole thing steps out as a unit.' }),

  V({ id:'toyota-lfa', name:'Toyota LFA', body:'gt', drivetrain:'RWD', bay:'front-longitudinal',
      suspF:'doublewishbone', suspR:'multilink', chassis:'carbon monocoque',
      engines:['toyota-1lr','ferrari-f140','v10-52-na'],
      massKg:1480, wheelbase:2605, trackF:1580, trackR:1570, lengthMm:4505, widthMm:1895, heightMm:1220,
      gears:[3.54,2.19,1.60,1.27,1.03,0.84], final:3.42, tyreF:265, tyreR:305, rimF:20, rimR:20,
      brakeF:390, brakeR:360, cd:0.31, area:1.93, downforceKg:90, fuelL:65, seats:2,
      driveLoss:0.12, colour:0xe8e9ea,
      blurb:'A carbon monocoque woven on looms the company built itself, a front-mid V10 with almost no flywheel effect, and a transaxle at the rear. The whole car exists because the engineers wanted to find out how light they could make a road car if nobody stopped them.' }),

  V({ id:'toyota-gr-yaris', name:'Toyota GR Yaris', body:'hatch', drivetrain:'AWD',
      bay:'front-transverse', suspF:'macpherson', suspR:'doublewishbone',
      engines:['toyota-g16e','i4-20-t','i5-25-t'],
      massKg:1280, wheelbase:2560, trackF:1535, trackR:1565, lengthMm:3995, widthMm:1805, heightMm:1455,
      gears:[3.54,1.91,1.31,1.00,0.79,0.63], final:3.94, tyreF:225, tyreR:225, rimF:18, rimR:18,
      brakeF:356, brakeR:297, cd:0.34, area:2.10, fuelL:50, seats:4, colour:0xd6d8da,
      blurb:'A three-cylinder turbo, a lower roof than the car it is named after, and a centre coupling you can bias 70:30 either way from a dial. Homologated for rallying first and made road-legal second, which is why the rear suspension is double wishbones on a hatchback.' }),

  V({ id:'ford-mustang-gt', name:'Ford Mustang GT', body:'muscle', drivetrain:'RWD',
      bay:'front-longitudinal', suspF:'macpherson', suspR:'multilink',
      engines:['ford-coyote','v8-52-flat','v8-50-ohv','v8-70-bb'],
      massKg:1705, wheelbase:2720, trackF:1582, trackR:1648, lengthMm:4789, widthMm:1916, heightMm:1381,
      gears:[4.70,2.99,2.15,1.77,1.52,1.28,1.00,0.85,0.69,0.64], final:3.55,
      tyreF:255, tyreR:275, rimF:19, rimR:19, brakeF:352, brakeR:330,
      cd:0.36, area:2.28, fuelL:61, seats:4, colour:0x1d2530,
      blurb:'Long bonnet, short deck, and — for the first time in this car’s life — an independent rear suspension instead of a live axle. Four camshafts on an American V8, and a cross-plane crank that keeps the lope even with 7,500 rpm available.' }),

  V({ id:'ford-gt', name:'Ford GT', body:'super', drivetrain:'RWD', bay:'mid',
      suspF:'pushrod', suspR:'pushrod', chassis:'carbon monocoque',
      engines:['ford-ecoboost-35','v8-40-tt','ford-dfv'],
      massKg:1385, wheelbase:2710, trackF:1670, trackR:1620, lengthMm:4779, widthMm:1930, heightMm:1109,
      gears:[2.92,1.94,1.44,1.13,0.92,0.76,0.63], final:3.36, tyreF:245, tyreR:325, rimF:20, rimR:20,
      brakeF:394, brakeR:360, cd:0.36, area:1.85, downforceKg:400, fuelL:57, seats:2,
      driveLoss:0.10, colour:0x1657a8,
      blurb:'Flying buttresses that are not styling: the bodywork is shaped around two ducts that take air through the car, which is why the cabin is so narrow. Inboard pushrod suspension with a hydraulic ride-height drop, and a twin-turbo V6 rather than a V8 because the aerodynamics mattered more than the cylinder count.' }),

  V({ id:'ferrari-812', name:'Ferrari V12 Berlinetta', body:'gt', drivetrain:'RWD',
      bay:'front-longitudinal', suspF:'doublewishbone', suspR:'multilink',
      engines:['ferrari-f140','v12-65-na','maserati-f136'],
      massKg:1630, wheelbase:2720, trackF:1672, trackR:1645, lengthMm:4657, widthMm:1971, heightMm:1276,
      gears:[3.08,2.19,1.63,1.29,1.03,0.84,0.69], final:3.62, tyreF:275, tyreR:315, rimF:20, rimR:20,
      brakeF:398, brakeR:360, cd:0.32, area:1.98, downforceKg:180, fuelL:92, seats:2,
      driveLoss:0.11, colour:0xb3121a,
      blurb:'Front-mid V12 with the gearbox at the back, rear-wheel steering, and an intake system whose runners change length as the revs rise so the pressure wave arrives at the right moment across the whole range. Six hundred and fifty litres of air a second at peak power.' }),

  V({ id:'porsche-911-gt3', name:'Porsche 911 GT3', body:'coupe', drivetrain:'RWD', bay:'rear',
      suspF:'doublewishbone', suspR:'multilink',
      engines:['porsche-9a1-gt3','f6-30-t','porsche-mezger'],
      massKg:1435, wheelbase:2457, trackF:1600, trackR:1553, lengthMm:4573, widthMm:1852, heightMm:1279,
      gears:[3.75,2.38,1.72,1.34,1.11,0.96,0.84], final:3.97, tyreF:255, tyreR:315, rimF:20, rimR:21,
      brakeF:408, brakeR:380, cd:0.35, area:2.02, downforceKg:385, fuelL:64, seats:2,
      driveLoss:0.11, colour:0xdfe2e5,
      blurb:'The engine hangs behind the rear axle, which should make it undrivable and instead makes it the best traction car here. Double wishbones at the front instead of struts, a swan-neck wing hung from above so the air under it stays clean, and 9,000 rpm from a flat six.' }),

  V({ id:'nissan-gtr-r35', name:'Nissan GT-R (R35)', body:'coupe', drivetrain:'AWD',
      bay:'front-longitudinal', suspF:'doublewishbone', suspR:'multilink',
      engines:['nissan-vr38','nissan-rb26','i6-30-tt'],
      massKg:1752, wheelbase:2780, trackF:1590, trackR:1600, lengthMm:4710, widthMm:1895, heightMm:1370,
      gears:[4.06,2.30,1.60,1.25,1.00,0.80], final:3.70, tyreF:255, tyreR:285, rimF:20, rimR:20,
      brakeF:390, brakeR:380, cd:0.26, area:2.13, downforceKg:100, fuelL:74, seats:4,
      driveLoss:0.15, colour:0x3a4450,
      blurb:'The gearbox, the transfer case and the final drive are all at the back, with a propshaft running forward to the front wheels — so the front axle is driven from behind it. That layout is why the weight distribution works and why the driveline is so complicated.' }),

  V({ id:'nissan-skyline-r34', name:'Nissan Skyline GT-R (R34)', body:'coupe', drivetrain:'AWD',
      bay:'front-longitudinal', suspF:'multilink', suspR:'multilink',
      engines:['nissan-rb26','i6-30-legend','nissan-vr38'],
      massKg:1560, wheelbase:2665, trackF:1480, trackR:1490, lengthMm:4600, widthMm:1785, heightMm:1360,
      gears:[3.83,2.36,1.69,1.31,1.00,0.79], final:3.55, tyreF:245, tyreR:245, rimF:18, rimR:18,
      brakeF:324, brakeR:322, cd:0.34, area:2.05, fuelL:65, seats:4, colour:0x2f4d80,
      blurb:'A rear-drive car with a clutch pack that feeds the front axle only when the rear starts to slip, reading yaw and wheel speed a hundred times a second. Six individual throttle bodies on a turbocharged straight six — a combination almost nobody else attempted.' }),

  V({ id:'honda-nsx-na1', name:'Honda NSX (NA1)', body:'super', drivetrain:'RWD', bay:'mid',
      suspF:'doublewishbone', suspR:'doublewishbone', chassis:'aluminium monocoque',
      engines:['honda-c30a','i4-20-vtec','v6-35-na'],
      massKg:1370, wheelbase:2530, trackF:1510, trackR:1530, lengthMm:4430, widthMm:1810, heightMm:1170,
      gears:[3.07,1.96,1.42,1.03,0.79], final:4.06, tyreF:205, tyreR:225, rimF:15, rimR:16,
      brakeF:282, brakeR:282, cd:0.32, area:1.85, fuelL:70, seats:2,
      driveLoss:0.12, colour:0xc8102e,
      blurb:'The first all-aluminium monocoque road car: body, suspension and engine, which took 200 kg out of it. Titanium connecting rods so it could rev to 8,000, forged aluminium wishbones at all four corners, and a cabin visibility brief written around a fighter cockpit.' }),

  V({ id:'lambo-v12', name:'Lamborghini V12 Flagship', body:'super', drivetrain:'AWD', bay:'mid',
      suspF:'pushrod', suspR:'pushrod', chassis:'carbon monocoque',
      engines:['v12-65-na','ferrari-f140','v10-52-na'],
      massKg:1575, wheelbase:2700, trackF:1720, trackR:1700, lengthMm:4797, widthMm:2030, heightMm:1136,
      gears:[2.94,2.06,1.52,1.18,0.97,0.81,0.68], final:3.55, tyreF:255, tyreR:355, rimF:20, rimR:21,
      brakeF:400, brakeR:380, cd:0.34, area:1.96, downforceKg:250, fuelL:85, seats:2,
      driveLoss:0.12, colour:0xd8a326,
      blurb:'A carbon tub with inboard pushrod suspension at both ends — horizontal dampers lying flat inside the structure, worked by a rocker, exactly as a single-seater does it. Sixty-five degrees between the banks and no turbochargers anywhere.' }),

  V({ id:'bugatti-w16', name:'Bugatti W16 Hypercar', body:'hyper', drivetrain:'AWD', bay:'mid',
      suspF:'doublewishbone', suspR:'doublewishbone', chassis:'carbon monocoque',
      engines:['w16-80-qt','v12-65-na','v10-52-na'],
      massKg:1996, wheelbase:2711, trackF:1682, trackR:1660, lengthMm:4544, widthMm:2038, heightMm:1212,
      gears:[2.79,1.86,1.35,1.03,0.81,0.65,0.52], final:3.53, tyreF:285, tyreR:355, rimF:20, rimR:21,
      brakeF:420, brakeR:400, cd:0.36, area:2.07, downforceKg:450, fuelL:100, seats:2,
      driveLoss:0.14, colour:0x1a2a4a,
      blurb:'Sixteen cylinders in two narrow-angle Vs on one crankshaft, four turbochargers, ten radiators and a cooling system that moves more heat than the engine makes power. At full throttle it empties the tank in twelve minutes and the tyres last fifteen.' }),

  V({ id:'subaru-wrx-sti', name:'Subaru WRX STI', body:'sedan', drivetrain:'AWD',
      bay:'front-longitudinal', suspF:'macpherson', suspR:'multilink',
      engines:['f4-25-t','race-20-rally','i4-20-t'],
      massKg:1534, wheelbase:2650, trackF:1530, trackR:1540, lengthMm:4595, widthMm:1795, heightMm:1475,
      gears:[3.64,2.24,1.59,1.14,0.89,0.71], final:3.90, tyreF:245, tyreR:245, rimF:18, rimR:18,
      brakeF:340, brakeR:326, cd:0.35, area:2.16, fuelL:60, seats:5, colour:0x1f4fa8,
      blurb:'A flat four slung low over the front axle, a centre differential you can lock by hand, and a helical limited-slip at the front with a Torsen at the back. The boxer layout is the point: the crankshaft sits barely above the sump, so the whole car’s centre of gravity comes down with it.' }),

  V({ id:'dragster', name:'Top-fuel dragster', body:'dragster', drivetrain:'RWD', bay:'mid',
      suspF:'none', suspR:'solid', chassis:'chromoly tube', engines:['race-82-nitro','v8-62-sc'],
      massKg:1050, wheelbase:7600, trackF:600, trackR:2200, lengthMm:9000, widthMm:2400, heightMm:1000,
      gears:[1.00], final:3.20, tyreF:100, tyreR:430, rimF:18, rimR:16,
      brakeF:0, brakeR:330, cd:0.55, area:1.2, downforceKg:3600, fuelL:80, seats:1, driveLoss:0.06, tyreMu:4.2,
      blurb:'No gearbox — a multi-stage slipper clutch is the transmission. Seven and a half metres of chromoly, a wing making three tonnes of downforce, and four seconds of engine life per run.' }),

  /* ---- motorcycles ---- */
  V({ id:'sportbike', name:'Litre-class superbike', class:'bike', body:'sportbike', drivetrain:'chain',
      bay:'transverse', suspF:'usd-fork', suspR:'swingarm-monoshock', chassis:'twin-spar aluminium',
      engines:['m-i4-1000','m-v4-1100','m-triple-765'],
      massKg:200, wheelbase:1420, trackF:0, trackR:0, lengthMm:2070, widthMm:710, heightMm:1140,
      gears:[2.62,2.04,1.71,1.50,1.36,1.25], final:2.62, primary:1.65,
      tyreF:120, tyreR:190, rimF:17, rimR:17, brakeF:320, brakeR:220,
      cd:0.58, area:0.6, fuelL:17, seats:1, driveLoss:0.10, rakeDeg:24, trailMm:100,
      blurb:'Twin-spar aluminium frame using the engine as a stressed member. Rake, trail and swingarm length are the only chassis tuning you get — and they change everything.' }),

  V({ id:'cruiser', name:'V-twin cruiser', class:'bike', body:'cruiser', drivetrain:'belt',
      bay:'longitudinal-v', suspF:'tele-fork', suspR:'twin-shock', chassis:'steel backbone',
      engines:['m-vtwin-1200','m-ptwin-900'],
      massKg:295, wheelbase:1630, lengthMm:2340, widthMm:900, heightMm:1120,
      gears:[3.34,2.30,1.71,1.40,1.19,1.00], final:2.36, primary:1.60,
      tyreF:100, tyreR:180, rimF:19, rimR:16, brakeF:300, brakeR:290,
      cd:0.7, area:0.8, fuelL:18, seats:2, driveLoss:0.11, rakeDeg:30, trailMm:145,
      blurb:'Long wheelbase, 30° of rake, low seat. Belt final drive and an air-cooled 45° V-twin bolted rigidly into a steel backbone frame.' }),

  V({ id:'harley', name:'Custom V-twin cruiser (modelled)', class:'bike', body:'cruiser', model:'harley',
      drivetrain:'belt', bay:'longitudinal-v', suspF:'tele-fork', suspR:'twin-shock',
      chassis:'steel backbone', engines:['m-vtwin-1200','m-ptwin-900'],
      massKg:310, wheelbase:1690, lengthMm:2500, widthMm:900, heightMm:1040,
      gears:[3.34,2.30,1.71,1.40,1.19,1.00], final:2.36, primary:1.60,
      tyreF:90, tyreR:200, rimF:21, rimR:16, brakeF:300, brakeR:290,
      cd:0.72, area:0.82, fuelL:19, seats:2, driveLoss:0.11, rakeDeg:34, trailMm:160,
      colour:0x8f1410,
      blurb:'A scanned custom build rather than a generated one: raked front end, narrow 21-inch front wheel, fat rear, and every chromed piece exactly where the builder put it. Strip it down to the backbone frame and the V-twin, then put the tank, the chrome and the wheels back on.' }),

  V({ id:'adv', name:'Adventure tourer', class:'bike', body:'adv', drivetrain:'shaft',
      bay:'boxer', suspF:'usd-fork', suspR:'single-sided', chassis:'steel trellis',
      engines:['m-flat2-1200','m-ptwin-900','m-triple-765'],
      massKg:250, wheelbase:1520, lengthMm:2210, widthMm:950, heightMm:1420,
      gears:[2.44,1.71,1.30,1.07,0.94,0.83], final:2.75, primary:1.60,
      tyreF:120, tyreR:170, rimF:19, rimR:17, brakeF:305, brakeR:276,
      cd:0.68, area:0.85, fuelL:25, seats:2, driveLoss:0.12, rakeDeg:26, trailMm:116,
      blurb:'Long-travel suspension, shaft final drive and a flat-twin slung low. Built to carry luggage across a continent and still climb a gravel pass.' }),

  V({ id:'mx', name:'Motocross bike', class:'bike', body:'mx', drivetrain:'chain',
      bay:'transverse', suspF:'usd-fork', suspR:'linkage-monoshock', chassis:'aluminium perimeter',
      engines:['m-single-450'],
      massKg:110, wheelbase:1485, lengthMm:2190, widthMm:825, heightMm:1270,
      gears:[2.14,1.75,1.45,1.23,1.04], final:3.85, primary:2.48,
      tyreF:80, tyreR:110, rimF:21, rimR:19, brakeF:270, brakeR:240,
      cd:0.75, area:0.7, fuelL:7, seats:1, driveLoss:0.11, rakeDeg:27, trailMm:118, travelMm:310,
      blurb:'310 mm of suspension travel at both ends, a linkage rear shock with high- and low-speed compression adjusters, and a 450 single that will loft the front wheel in third.' }),

  V({ id:'kart', name:'Shifter kart', class:'kart', body:'kart', drivetrain:'chain', bay:'side',
      suspF:'none', suspR:'none', chassis:'tube frame', engines:['m-single-450'],
      massKg:165, wheelbase:1050, trackF:1200, trackR:1400, lengthMm:1900, widthMm:1400, heightMm:600,
      gears:[2.30,1.85,1.55,1.33,1.15,1.00], final:2.50, primary:1.0,
      tyreF:120, tyreR:180, rimF:5, rimR:5, brakeF:0, brakeR:190,
      cd:0.8, area:0.55, fuelL:8, seats:1, driveLoss:0.08,
      blurb:'No suspension and no differential at all. The chassis itself flexes and the inside rear wheel lifts to let it turn — every setup change is about how much the frame twists.' }),
];

/* A build that ships without a vehicle's model file — the single-file offline
 * build drops the heaviest ones to stay under its size limit — leaves that
 * vehicle out of the catalogue rather than offering a car it cannot draw. */
export const VEHICLES = CATALOG.filter(v => !(globalThis.__MOTORLAB_OMIT || []).includes(v.id));

export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map(v => [v.id, v]));

export function tyreRadiusM(widthMm, aspect, rimIn){
  return (rimIn * 25.4 / 2 + widthMm * (aspect/100)) / 1000;
}
export function wheelRadius(v, rear){
  const w = rear ? v.tyreR : v.tyreF;
  const rim = rear ? v.rimR : v.rimF;
  const aspect = v.class === 'bike' ? 55 : v.class === 'kart' ? 40 : (w > 280 ? 30 : w > 240 ? 35 : 45);
  return tyreRadiusM(w, aspect, rim);
}
export function weightDistribution(v){
  const map = { 'front-transverse':0.62, 'front-longitudinal':0.53, 'mid':0.42, 'rear':0.38,
                'transverse':0.51, 'longitudinal-v':0.48, 'boxer':0.50, 'side':0.42 };
  return map[v.bay] ?? 0.52;
}
export function vehicleGroups(){
  const g = { car:[], bike:[], kart:[] };
  for (const v of VEHICLES) (g[v.class] || g.car).push(v);
  return g;
}
