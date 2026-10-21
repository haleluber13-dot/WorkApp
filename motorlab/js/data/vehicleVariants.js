/* MotorLab — "change to a different part": the alternatives a vehicle part
 * can be swapped for. An engine upgrade (data/upgrades.js) changes numbers;
 * a variant changes the *thing* — a forged wheel is a different wheel, a GT
 * wing is a new part on the boot, coilovers are a different damper. The
 * builder reads `mesh` and draws it; the simulation reads `effects` the same
 * way it reads an upgrade's.
 *
 * A slot is one position on the car (front brakes, the bonnet …); each slot
 * has a list of variants, the first of which is the factory part. Which one a
 * given vehicle leaves the factory with is `defaultVariants(v)`, and the
 * effects quoted are relative to that stock part, so a race car whose
 * catalogue mass already includes forged wheels is not credited twice. */

const T = (o) => Object.assign({ brand:'', cost:0, effects:{}, mesh:{} }, o);

export const SLOTS = [
  { id:'wheels',        name:'Wheels',                 parts:['wheels'] },
  { id:'tyres',         name:'Tyres',                  parts:['wheels'] },
  { id:'brakesF',       name:'Front brakes',           parts:['discf','calf'] },
  { id:'brakesR',       name:'Rear brakes',            parts:['discr','calr'] },
  { id:'suspF',         name:'Front springs & dampers',parts:['dampf','strutf'] },
  { id:'suspR',         name:'Rear springs & dampers', parts:['dampr','strutr'] },
  { id:'exhaust',       name:'Exhaust rear section',   parts:['rearbox','midpipe'] },
  { id:'bonnet',        name:'Bonnet',                 parts:['bonnet'] },
  { id:'bumperF',       name:'Front bumper',           parts:['bumperF','splitter'] },
  { id:'spoiler',       name:'Rear spoiler / wing',    parts:['spoiler','bootlid'] },
  { id:'mirrors',       name:'Door mirrors',           parts:['mirrors'] },
  { id:'seats',         name:'Front seats',            parts:['seatsF'] },
  { id:'steeringwheel', name:'Steering wheel',         parts:['steeringwheel'] },
  { id:'roof',          name:'Roof',                   parts:['roof'] },
  { id:'lights',        name:'Headlamps',              parts:['headlamp'] },
];
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map(s => [s.id, s]));

/** The slots a part (base id) can be changed through. */
export function slotsForPart(baseId){
  return SLOTS.filter(s => s.parts.includes(baseId)).map(s => s.id);
}

export const VARIANTS = {
  wheels: [
    T({ id:'alloy', name:'Factory cast alloy wheels', brand:'OEM', cost:0,
        mesh:{ style:'alloy', spokes:5 },
        teach:'A cast aluminium wheel: molten alloy poured into a mould, then machined on the hub face and bead seats. Cheap to make in volume and perfectly adequate, but a casting has porosity, so it is made thick — a 18" cast wheel is 11–13 kg before the tyre goes on.' }),
    T({ id:'steel', name:'Pressed steel wheels', brand:'Kronprinz', cost:380, effects:{ weightKg:+8 },
        mesh:{ style:'steel', spokes:0 },
        teach:'Two pressings welded together: a rolled rim and a dished centre with vent holes. Heavier than alloy and it bends rather than cracks, which is exactly why winter sets and rally service crews still use them — a bent steel wheel can be hammered true at the roadside.' }),
    T({ id:'forged', name:'Forged lightweight wheels', brand:'BBS / Rays', cost:4200, effects:{ weightKg:-14, grip:0.01 },
        mesh:{ style:'forged', spokes:10 },
        teach:'Forging squeezes a solid billet into the shape under thousands of tonnes, aligning the grain and leaving no porosity, so the spokes can be a third as thick. The saving is unsprung and rotating mass: every kilogram off a wheel is worth several off the body, because the damper controls a lighter wheel more easily.' }),
    T({ id:'deepdish', name:'Deep-dish three-piece wheels', brand:'Work / Weds', cost:3600, effects:{ weightKg:+4, drag:0.004 },
        mesh:{ style:'deepdish', spokes:5, dish:1 },
        teach:'A separate centre bolted between an inner and outer barrel, so the offset — how far the hub face sits from the rim centreline — is set by the barrel widths. A low offset pushes the face inboard and the lip out, which is the look, and also widens the track, which loads the wheel bearings and changes the scrub radius.' }),
    T({ id:'gravel', name:'Gravel rally wheels (15")', brand:'Braid / OZ', cost:2200, effects:{ weightKg:+2 },
        mesh:{ style:'gravel', spokes:8, rimScale:0.84 },
        teach:'A smaller-diameter, thick-spoked wheel with a tall tyre over it. The sidewall is the first stage of the suspension on a loose surface and it protects the rim from rocks; the spokes are deliberately heavy because they will be hit, and a cracked spoke at speed on gravel is a rollover.' }),
    T({ id:'beadlock', name:'Beadlock off-road wheels', brand:'Method / Raceline', cost:3100, effects:{ weightKg:+11, drag:0.006 },
        mesh:{ style:'beadlock', spokes:6, rimScale:0.9 },
        teach:'An outer ring clamped by a circle of bolts pins the tyre bead to the rim, so the tyre can run at 0.3–0.5 bar for sand and rock without unseating. Street-illegal in most places: a bolt ring at the rim edge is a 32-point maintenance item, torqued in sequence, every outing.' }),
  ],
  tyres: [
    T({ id:'road', name:'Road tyres (summer touring)', brand:'OEM fitment', cost:0,
        mesh:{ tread:'road', width:1.0 },
        teach:'A directional tread with wide circumferential grooves to clear water and a compound that works from 5 °C up. The aspect ratio — sidewall height as a percentage of width — is most of the ride comfort and most of the steering delay.' }),
    T({ id:'sport', name:'Ultra-high-performance road tyres', brand:'Michelin PS4S', cost:1100, effects:{ grip:0.06 },
        mesh:{ tread:'road', width:1.04 },
        teach:'Stiffer sidewalls, a softer compound and bigger tread blocks. Grip goes up noticeably and so does wear: a soft compound gives its best for a few thousand kilometres, then hardens with heat cycles and is never quite the same tyre again.' }),
    T({ id:'semislick', name:'Semi-slick track tyres', brand:'Toyo R888R / Cup 2', cost:1500, effects:{ grip:0.16 },
        mesh:{ tread:'semislick', width:1.06 },
        teach:'Just enough grooving to be road-legal and no more. A semi-slick needs heat to work — cold, it has less grip than a good road tyre — and it aquaplanes early because there is almost nowhere for the water to go. This is the tyre every track-day understeer complaint is about.' }),
    T({ id:'slick', name:'Racing slicks', brand:'Pirelli / Hoosier', cost:2400, effects:{ grip:0.32 },
        mesh:{ tread:'slick', width:1.10 },
        teach:'No tread at all: the whole contact patch is rubber, and the compound is chosen for one temperature window. Below it the tyre skates; above it the surface tears into balls of rubber ("graining"). Not legal on the road anywhere, and useless the moment it rains.' }),
    T({ id:'allterrain', name:'All-terrain tyres', brand:'BFGoodrich KO2', cost:1300, effects:{ grip:-0.05, drag:0.02, weightKg:+10 },
        mesh:{ tread:'knobby', width:1.08, tall:1.06 },
        teach:'Open, interlocking blocks that clear gravel and mud, with a stiff carcass that shrugs off punctures. On tarmac the blocks squirm, so steering is softer and braking is longer — the price of a tyre that still works where the road ends.' }),
    T({ id:'mud', name:'Mud-terrain tyres', brand:'Maxxis Trepador', cost:1600, effects:{ grip:-0.12, drag:0.04, weightKg:+18 },
        mesh:{ tread:'knobby', width:1.16, tall:1.10 },
        teach:'Huge lugs with voids between them to bite and self-clean. They are loud, they wear fast, and on a wet road they have less grip than almost anything else you could fit — a mud tyre is a tool for one surface.' }),
  ],
  brakesF: [
    T({ id:'stock', name:'Vented discs & sliding calipers', brand:'OEM', cost:0,
        mesh:{ disc:'vented', pistons:1, size:1.0 },
        teach:'A cast-iron disc with internal vanes pumping air between two friction faces, and a single-piston floating caliper that slides on two pins to clamp both pads. Simple, cheap and self-adjusting; the pins corrode and the pads then wear on a taper.' }),
    T({ id:'solid', name:'Solid discs', brand:'OEM (base model)', cost:120, effects:{ brake:-0.08, weightKg:-4 },
        mesh:{ disc:'solid', pistons:1, size:0.92 },
        teach:'One plain plate of iron. It holds much less heat than a vented disc, so a few hard stops in a row and the pads boil their own resin — fade. Fine for a light car driven gently, which is why base models get them.' }),
    T({ id:'drilled', name:'Drilled & slotted discs, fast-road pads', brand:'EBC / Brembo Sport', cost:640, effects:{ brake:0.06 },
        mesh:{ disc:'drilled', pistons:1, size:1.0 },
        teach:'Slots scrape the glaze and gas off the pad face; holes do a little of that and mostly look good. Drilled holes are stress raisers and cross-drilled discs crack from hole to hole under track use — slots alone are the honest choice for a car that gets driven hard.' }),
    T({ id:'bbk', name:'6-piston big brake kit, 2-piece discs', brand:'AP Racing / StopTech', cost:3900, effects:{ brake:0.22, weightKg:-2 },
        mesh:{ disc:'twopiece', pistons:6, size:1.14, colour:0xd12b1e },
        teach:'A fixed monobloc caliper with three pistons each side, staged in size so the trailing edge of the pad is pressed as hard as the leading edge, on a bigger disc whose iron ring floats on an aluminium hat. More leverage, more thermal mass, far less flex — and it needs the master-cylinder bore and the pedal ratio thinking about, or the pedal goes long.' }),
    T({ id:'ceramic', name:'Carbon-ceramic discs', brand:'Brembo CCM', cost:11800, effects:{ brake:0.24, weightKg:-18 },
        mesh:{ disc:'ceramic', pistons:6, size:1.16, colour:0xe3b514 },
        teach:'Carbon fibre in a silicon-carbide matrix: half the mass of iron, almost no wear, and it does not fade because it does not care about 800 °C. Cold, the bite is poor and it squeals; and a stone chip that would be nothing on iron can write off a disc worth more than the wheels.' }),
  ],
  brakesR: [
    T({ id:'stock', name:'Vented rear discs & calipers', brand:'OEM', cost:0,
        mesh:{ disc:'vented', pistons:1, size:1.0 },
        teach:'The rear axle does a quarter to a third of the braking — weight transfers forward under deceleration — so the rear discs are smaller and the caliper usually also carries the parking-brake mechanism.' }),
    T({ id:'solid', name:'Solid rear discs', brand:'OEM', cost:90, effects:{ brake:-0.03, weightKg:-3 },
        mesh:{ disc:'solid', pistons:1, size:0.94 },
        teach:'Perfectly common at the rear, where the heat load is small. The disc is often a plain plate with an integral drum inside the hat for the parking brake.' }),
    T({ id:'drum', name:'Rear drum brakes', brand:'OEM (budget)', cost:60, effects:{ brake:-0.06, weightKg:+5 },
        mesh:{ disc:'drum', pistons:0, size:0.9 },
        teach:'Two curved shoes pushed outward against the inside of a rotating drum by a wheel cylinder. Self-energising — the drum\'s rotation wedges the leading shoe on harder — so it needs less pedal effort and makes an excellent parking brake. It also traps its own heat, which is why drums disappeared from front axles first.' }),
    T({ id:'drilled', name:'Drilled & slotted rear discs', brand:'EBC', cost:420, effects:{ brake:0.03 },
        mesh:{ disc:'drilled', pistons:1, size:1.0 },
        teach:'Matched to the fronts so pad behaviour stays the same at both ends; mismatched compounds move the brake balance as the temperature changes.' }),
    T({ id:'bbk', name:'4-piston rear kit, 2-piece discs', brand:'AP Racing', cost:2800, effects:{ brake:0.08, weightKg:-1 },
        mesh:{ disc:'twopiece', pistons:4, size:1.10, colour:0xd12b1e },
        teach:'Upgrading only the front moves the balance forward and the rears stop contributing; a matched rear kit keeps the proportion where the engineers put it. Most kits lose the parking brake, which a hydraulic handbrake or a separate caliper has to put back.' }),
    T({ id:'ceramic', name:'Carbon-ceramic rear discs', brand:'Brembo CCM', cost:7800, effects:{ brake:0.08, weightKg:-12 },
        mesh:{ disc:'ceramic', pistons:4, size:1.12, colour:0xe3b514 },
        teach:'Fitted to the rear mostly for mass: twelve kilograms off the back axle, unsprung and rotating.' }),
  ],
  suspF: [
    T({ id:'stock', name:'Factory springs & twin-tube dampers', brand:'OEM', cost:0,
        mesh:{ type:'stock', ride:0 },
        teach:'A gas-pressurised twin-tube damper inside a linear-rate coil. Valved for comfort first: soft in low-speed compression so the body floats over undulations, which is exactly what lets it roll and dive on a track.' }),
    T({ id:'lowering', name:'Lowering springs', brand:'Eibach Pro-Kit', cost:420, effects:{ grip:0.02, drag:-0.004 },
        mesh:{ type:'lowering', ride:-0.030 },
        teach:'Shorter, stiffer springs on the standard dampers: 25–35 mm lower, less roll, a lower centre of gravity. The catch is that the damper now works in the wrong part of its stroke and runs out of travel early — fine for a mild drop, and the reason bigger drops need a matched damper.' }),
    T({ id:'coilovers', name:'Height-adjustable coilovers', brand:'KW V3 / Öhlins', cost:2900, effects:{ grip:0.05, weightKg:-3 },
        mesh:{ type:'coilover', ride:-0.045, spring:0xe8c21a },
        teach:'A threaded damper body with a spring seat you wind up and down, so ride height and corner weights are set on the car, and separate compression and rebound adjusters. Ride height first, then corner weights, then the clickers — the other way round is how people end up chasing a handling fault that is a scale fault.' }),
    T({ id:'airride', name:'Air suspension', brand:'Air Lift Performance', cost:4100, effects:{ weightKg:+14 },
        mesh:{ type:'air', ride:-0.080 },
        teach:'A rubber bellows in place of the coil, fed by a compressor and a tank. Spring rate rises with pressure, so one bag can be a soft cruise and a firm track setting, and the car can be dropped onto its arches when parked. The dampers still have to match the bag, or it bounces.' }),
    T({ id:'lift', name:'Lift kit (long-travel)', brand:'Fox / Bilstein 5100', cost:2300, effects:{ grip:-0.04, drag:0.02, weightKg:+9 },
        mesh:{ type:'lift', ride:+0.060, spring:0x2d7bd1 },
        teach:'Longer springs and remote-reservoir dampers raise the body 50–75 mm for clearance and let the wheel travel further. The roll centre and the centre of gravity both go up, so on tarmac the car leans more and understeers earlier; off-road it keeps its wheels on the ground.' }),
  ],
  suspR: [
    T({ id:'stock', name:'Factory springs & dampers', brand:'OEM', cost:0,
        mesh:{ type:'stock', ride:0 },
        teach:'The rear is sprung for the laden case — a boot full of luggage and two in the back — so unladen it sits high and the rate feels soft.' }),
    T({ id:'lowering', name:'Rear lowering springs', brand:'Eibach', cost:380, effects:{ grip:0.02 },
        mesh:{ type:'lowering', ride:-0.030 },
        teach:'Drop one end only and you change the rake, which shifts the aerodynamic balance and the roll-stiffness split. Lowering kits are sold as a set for a reason.' }),
    T({ id:'coilovers', name:'Rear coilovers', brand:'KW / Öhlins', cost:2600, effects:{ grip:0.04, weightKg:-2 },
        mesh:{ type:'coilover', ride:-0.045, spring:0xe8c21a },
        teach:'On a multilink rear the spring and damper are often separate, so a "coilover" here is a damper with its own spring mounted beside the arm. Rear rate relative to front is the balance tool: stiffer rear, more oversteer.' }),
    T({ id:'airride', name:'Rear air springs', brand:'Air Lift', cost:3600, effects:{ weightKg:+12 },
        mesh:{ type:'air', ride:-0.080 },
        teach:'Air springs at the rear are also what heavy vehicles use for load levelling: the bag pressure rises to hold the ride height whatever is in the back.' }),
    T({ id:'lift', name:'Rear lift kit', brand:'Fox / Old Man Emu', cost:1900, effects:{ grip:-0.03, drag:0.015, weightKg:+8 },
        mesh:{ type:'lift', ride:+0.060, spring:0x2d7bd1 },
        teach:'On a live axle the lift comes from taller leaf packs or coils and longer shocks; the driveshaft angle changes with it, and past a few degrees the universal joints vibrate.' }),
  ],
  exhaust: [
    T({ id:'stock', name:'Factory rear silencer', brand:'OEM', cost:0,
        mesh:{ type:'stock' },
        teach:'A large absorption/expansion box tuned to kill the frequencies the engine makes at cruise, with a trim tip. Quiet, heavy, and a measurable restriction at high flow.' }),
    T({ id:'catback', name:'Cat-back stainless system', brand:'Milltek / Akrapovič', cost:1600, effects:{ exhaustMul:1.03, weightKg:-7 },
        mesh:{ type:'catback' },
        teach:'Larger-bore mandrel-bent stainless from the catalyst back, with a smaller free-flow silencer. Worth a few percent at the top end on a turbo car and mostly sound on a naturally aspirated one; the mass saving is real either way.' }),
    T({ id:'straight', name:'Straight-through race exhaust', brand:'Custom', cost:900, effects:{ exhaustMul:1.06, weightKg:-16 },
        mesh:{ type:'straight' },
        teach:'No silencer at all, just a resonator and a tip. Minimum back-pressure and maximum flow — and far past any road noise limit, so it is a track-only part.' }),
    T({ id:'sideexit', name:'Side-exit exhaust', brand:'Custom', cost:1200, effects:{ exhaustMul:1.04, weightKg:-11 },
        mesh:{ type:'side' },
        teach:'The pipe leaves ahead of the rear wheel instead of running the whole length of the car: shorter, lighter, louder. Rally and rallycross cars use it because the back of the car gets hit.' }),
  ],
  bonnet: [
    T({ id:'steel', name:'Steel bonnet', brand:'OEM', cost:0, mesh:{ type:'steel' },
        teach:'A pressed outer skin bonded to a stamped inner frame, hinged at the scuttle with a safety catch at the nose. Designed to fold in a controlled way in a pedestrian impact.' }),
    T({ id:'carbon', name:'Carbon-fibre bonnet', brand:'Seibon', cost:1700, effects:{ weightKg:-9 },
        mesh:{ type:'carbon' },
        teach:'Nine kilograms off the highest-mounted panel at the front of the car. Carbon does not fold: it shatters, and the catch and hinges need bonnet pins because the latch loads are not designed for a panel this stiff.' }),
    T({ id:'vented', name:'Vented bonnet with louvres', brand:'APR / Varis', cost:1400, effects:{ weightKg:-4 },
        mesh:{ type:'vented' },
        teach:'Louvres over the radiator let the hot air out of the bay instead of forcing it under the car. Lower under-bonnet temperature, lower intake temperature, and a little front downforce from the pressure relief — provided the louvres are behind the radiator, not in front of it.' }),
  ],
  bumperF: [
    T({ id:'stock', name:'Factory front bumper', brand:'OEM', cost:0, mesh:{ type:'stock' },
        teach:'A plastic skin over a foam block and an aluminium crash beam. The skin is a shape for airflow and pedestrians; the beam is what takes a low-speed impact without touching the structure.' }),
    T({ id:'splitter', name:'Front splitter', brand:'APR / Verus', cost:1100, effects:{ downforce:25, drag:0.012, weightKg:+5 },
        mesh:{ type:'splitter' },
        teach:'A flat plate projecting from the bottom of the bumper. Air stagnates on top of it (high pressure) and accelerates under it (low pressure), and the difference is downforce — on the front axle, which is why it has to be balanced with something at the back.' }),
  ],
  spoiler: [
    T({ id:'none', name:'No rear spoiler', brand:'', cost:0, mesh:{ type:'none' },
        teach:'A clean boot lid. Air leaves the roof, separates over the rear screen and the boot, and the car makes a little lift at the rear at speed.' }),
    T({ id:'lip', name:'Boot lip spoiler', brand:'OEM / Rieger', cost:260, effects:{ downforce:8, drag:0.003 },
        mesh:{ type:'lip' },
        teach:'A few centimetres of lip on the trailing edge of the boot. It trips the flow off the lid cleanly and cuts rear lift; a surprising amount of a saloon\'s high-speed stability comes from this one piece of plastic.' }),
    T({ id:'ducktail', name:'Ducktail spoiler', brand:'RWB / OEM', cost:650, effects:{ downforce:20, drag:0.008, weightKg:+2 },
        mesh:{ type:'ducktail' },
        teach:'A tall upturned lid. The 1973 Carrera RS wore the first one and it is still what you fit when you want rear downforce without a wing standing above the car.' }),
    T({ id:'gtwing', name:'GT wing on swan-neck uprights', brand:'APR / Voltex', cost:2400, effects:{ downforce:70, drag:0.045, weightKg:+7 },
        mesh:{ type:'gtwing' },
        teach:'A real aerofoil in clean air above the boot. Swan-neck mounts hold it from above so the low-pressure underside is uninterrupted. Downforce rises with the square of speed, so at 100 km/h it is a quarter of what it is at 200 — and the drag comes with it all the time.' }),
  ],
  mirrors: [
    T({ id:'stock', name:'Factory door mirrors', brand:'OEM', cost:0, mesh:{ type:'stock' },
        teach:'A painted housing on a folding base, with a heated, electrically adjusted glass. Each one is also a small aerodynamic bluff body sitting in the cleanest air on the car.' }),
    T({ id:'aero', name:'Aero mirrors', brand:'Craft Square / APR', cost:780, effects:{ drag:-0.006, weightKg:-2 },
        mesh:{ type:'aero' },
        teach:'A small carbon teardrop on a stalk. Less frontal area and a clean wake off the trailing edge; the glass is smaller and flat, which is why they are not road-legal everywhere.' }),
  ],
  seats: [
    T({ id:'stock', name:'Factory seats', brand:'OEM', cost:0, mesh:{ type:'stock' },
        teach:'A steel frame on sliding rails with a reclining backrest, adjustable headrest, side airbag and a pretensioned belt buckle. Comfortable, heavy — 18–25 kg each — and it lets you move around under cornering load.' }),
    T({ id:'sport', name:'Sports seats', brand:'Recaro Sportster', cost:2100, effects:{ weightKg:-14 },
        mesh:{ type:'sport' },
        teach:'Deeper bolsters at the thigh and shoulder, an integrated headrest, a reclining mechanism and the standard belt. You still slide; you slide less. The saving is mostly the frame.' }),
    T({ id:'bucket', name:'Fixed-back bucket seats & harnesses', brand:'Sparco / OMP (FIA)', cost:2900, effects:{ weightKg:-30 },
        mesh:{ type:'bucket' },
        teach:'A one-piece shell with harness slots and no recline, on fixed side mounts. The shoulder straps must run within 20° of horizontal from the shoulder to the harness bar — mounted low they compress the spine in a frontal impact. FIA homologation expires: a seat has a date on it.' }),
  ],
  steeringwheel: [
    T({ id:'stock', name:'Factory steering wheel', brand:'OEM', cost:0, mesh:{ type:'stock', dia:0.370 },
        teach:'370–380 mm with an airbag in the hub and the horn, cruise and audio controls on the spokes. The airbag is why the wheel is as big as it is and why you do not casually swap it.' }),
    T({ id:'sport', name:'Sports steering wheel (330 mm)', brand:'MOMO / Nardi', cost:420, effects:{ weightKg:-2 },
        mesh:{ type:'sport', dia:0.330 },
        teach:'A smaller, thicker-rimmed wheel on a boss. Less diameter means more steering effort and more wheel speed for the same hand movement; the airbag goes, which on a road car is a legal and a safety question before it is a handling one.' }),
    T({ id:'quickrelease', name:'Quick-release suede wheel (320 mm)', brand:'Sparco / NRG', cost:640, effects:{ weightKg:-2 },
        mesh:{ type:'quickrelease', dia:0.320 },
        teach:'A splined quick-release hub so the wheel lifts off to let you out of a caged car with a bucket seat. Suede rim because gloves grip it; it is ruined by bare hands in a season.' }),
  ],
  roof: [
    T({ id:'steel', name:'Steel roof panel', brand:'OEM', cost:0, mesh:{ type:'steel' },
        teach:'One pressing welded to the cant rails with bows underneath. The highest-mounted mass on the car, so it is the first panel anyone makes in something lighter.' }),
    T({ id:'carbon', name:'Carbon-fibre roof', brand:'OEM (M / RS) / Seibon', cost:3400, effects:{ weightKg:-6 },
        mesh:{ type:'carbon' },
        teach:'Six kilograms off the very top of the car lowers the centre of gravity by a few millimetres, which sounds like nothing and is worth a measurable amount of roll stiffness. Bonded, not welded.' }),
    T({ id:'sunroof', name:'Glass sunroof', brand:'Webasto', cost:1200, effects:{ weightKg:+13 },
        mesh:{ type:'sunroof' },
        teach:'A tilt-and-slide glass panel with its frame, motor, drains and cassette: thirteen kilograms added exactly where you least want it. Also four drain tubes that block and drip onto the fuse box.' }),
  ],
  lights: [
    T({ id:'halogen', name:'Halogen reflector headlamps', brand:'OEM (H4 / H7)', cost:0, mesh:{ type:'halogen' },
        teach:'A tungsten filament in a halogen gas, in a parabolic reflector behind a patterned lens. 55 W each, a warm yellow-white at about 3,200 K, and a filament life of a few hundred hours.' }),
    T({ id:'xenon', name:'Bi-xenon projector headlamps', brand:'Hella / Koito', cost:1400, mesh:{ type:'xenon' },
        teach:'An arc struck through xenon gas at 25,000 V by a ballast, in a projector with a cut-off shield. Twice the light of halogen, bluish-white at 4,300 K, and because the beam is so sharp it must have self-levelling or it dazzles.' }),
    T({ id:'led', name:'LED headlamps with daytime strip', brand:'OEM / Osram', cost:1900, effects:{ weightKg:-1 }, mesh:{ type:'led' },
        teach:'Arrays of diodes behind lenses, with a heatsink and fan — LEDs make light cold but die hot. Cool white, instant on, and the cluster is sealed: a failed diode means a new lamp.' }),
  ],
};
export const VARIANT_BY_SLOT_ID = Object.fromEntries(
  Object.entries(VARIANTS).map(([slot, list]) => [slot, Object.fromEntries(list.map(x => [x.id, x]))]));

/* ---- what each vehicle leaves the factory with ------------------------- */
const RACE = new Set(['formula','stockcar','nns','dragster','awd-rally','drift','audi-quattro-s1']);
const LED = new Set(['bmw-m5','audi-rs3','audi-r8','maserati-mc20','ferrari-812','porsche-911-gt3','toyota-lfa',
                     'ford-gt','lambo-v12','bugatti-w16','toyota-gr-yaris','concept','koenigsegg','ford-mustang-gt',
                     'super','hyper','sedan','pickup']);
const HALOGEN = new Set(['toyota-ae86','audi-quattro-s1','mazda-rx7','mazda-mx5','coupe','toyota-supra-a80',
                         'hatch','semi','stockcar','nns','drift','harley','cruiser','honda-nsx-na1']);

export function defaultVariants(v){
  const race = RACE.has(v.id);
  const offroad = v.body === 'pickup' || v.body === 'suv';
  const rally = v.body === 'rally';
  const carbonTub = /carbon/.test(v.chassis || '');
  const d = {
    wheels: race && !rally ? 'forged' : rally ? 'gravel' : v.body === 'semi' ? 'steel' : 'alloy',
    tyres: ['formula','dragster','stockcar','nns'].includes(v.id) ? 'slick' : v.id === 'drift' ? 'semislick'
         : rally ? 'allterrain' : offroad ? 'allterrain' : (v.downforceKg > 150 || v.tyreMu > 1.3) ? 'sport' : 'road',
    brakesF: race && !rally ? 'bbk' : (v.body === 'hyper' || (v.body === 'super' && v.brakeF >= 380)) ? 'ceramic' : 'stock',
    brakesR: race && !rally ? 'bbk' : (v.body === 'hyper' || (v.body === 'super' && v.brakeF >= 380)) ? 'ceramic' : 'stock',
    suspF: race ? 'coilovers' : 'stock',
    suspR: race ? 'coilovers' : 'stock',
    exhaust: race ? 'straight' : 'stock',
    bonnet: carbonTub ? 'carbon' : 'steel',
    bumperF: (race && !offroad) || v.downforceKg >= 180 ? 'splitter' : 'stock',
    spoiler: ['formula','dragster'].includes(v.id) ? 'none' : race ? 'gtwing' : v.downforceKg >= 150 ? 'ducktail'
           : v.downforceKg > 0 ? 'lip' : 'none',
    mirrors: race && !rally ? 'aero' : 'stock',
    seats: race ? 'bucket' : v.downforceKg >= 150 ? 'sport' : 'stock',
    steeringwheel: race ? 'quickrelease' : v.downforceKg >= 150 ? 'sport' : 'stock',
    roof: carbonTub ? 'carbon' : 'steel',
    lights: LED.has(v.id) ? 'led' : HALOGEN.has(v.id) ? 'halogen' : 'xenon',
  };
  for (const s of Object.keys(d)) if (!VARIANT_BY_SLOT_ID[s]?.[d[s]]) d[s] = VARIANTS[s][0].id;
  return d;
}

/* ---- the fitted set --------------------------------------------------- */
/* store.js keeps state.vVariants[vehicleId] = { slot: variantId } and mirrors
   it onto this global so the builders — which must not import the store —
   can read it. */
const fittedBag = () => globalThis.__MOTORLAB_VVARIANTS || {};

/** { slot: variantId } for this vehicle: the saved choice, else the factory one. */
export function variantsFor(v){
  const d = defaultVariants(v);
  const saved = fittedBag()[v.id] || {};
  const out = {};
  for (const s of Object.keys(VARIANTS)) out[s] = VARIANT_BY_SLOT_ID[s][saved[s]] ? saved[s] : d[s];
  return out;
}

/** The variant object fitted in one slot of this vehicle. */
export function variantOf(v, slot){
  return VARIANT_BY_SLOT_ID[slot]?.[variantsFor(v)[slot]] || VARIANTS[slot]?.[0];
}

/** Which slots have something other than the factory part fitted. */
export function changedSlots(v){
  const d = defaultVariants(v), f = variantsFor(v);
  return Object.keys(f).filter(s => f[s] !== d[s]);
}

/** The simulation effects of the fitted variants, relative to the factory
 *  set, in the shape applyUpgrades() produces so the two can be added:
 *  { weightKg, gripBonus, brakeBonus, downforceBonus, dragBonus, exhaustMul, cost, labels }. */
export function variantMods(v){
  const d = defaultVariants(v), f = variantsFor(v);
  const m = { weightKg:0, gripBonus:0, brakeBonus:0, downforceBonus:0, dragBonus:0, exhaustMul:1, cost:0, labels:[] };
  const apply = (varnt, sign) => {
    if (!varnt) return;
    for (const [k, val] of Object.entries(varnt.effects || {})){
      if (k === 'weightKg') m.weightKg += sign * val;
      else if (k === 'grip') m.gripBonus += sign * val;
      else if (k === 'brake') m.brakeBonus += sign * val;
      else if (k === 'downforce') m.downforceBonus += sign * val;
      else if (k === 'drag') m.dragBonus += sign * val;
      else if (k === 'exhaustMul') m.exhaustMul *= sign > 0 ? val : 1 / val;
    }
  };
  for (const s of Object.keys(f)){
    if (f[s] === d[s]) continue;
    apply(VARIANT_BY_SLOT_ID[s][d[s]], -1);
    const x = VARIANT_BY_SLOT_ID[s][f[s]];
    apply(x, +1);
    m.cost += x.cost; m.labels.push(x.name);
  }
  m.weightKg = Math.round(m.weightKg);
  return m;
}

/** Fold variant effects into a mods object from applyUpgrades(). */
export function withVariantMods(mods, v){
  const vm = variantMods(v);
  return { ...mods,
    weightKg:(mods.weightKg || 0) + vm.weightKg, gripBonus:(mods.gripBonus || 0) + vm.gripBonus,
    brakeBonus:(mods.brakeBonus || 0) + vm.brakeBonus, downforceBonus:(mods.downforceBonus || 0) + vm.downforceBonus,
    dragBonus:(mods.dragBonus || 0) + vm.dragBonus, exhaustMul:(mods.exhaustMul ?? 1) * vm.exhaustMul,
    cost:(mods.cost || 0) + vm.cost, labels:[...(mods.labels || []), ...vm.labels] };
}

/** One line of effects for the UI: "−14 kg · grip +1 %". */
export function describeEffects(effects = {}){
  const out = [];
  if (effects.weightKg) out.push(`${effects.weightKg > 0 ? '+' : '−'}${Math.abs(effects.weightKg)} kg`);
  if (effects.grip) out.push(`grip ${effects.grip > 0 ? '+' : '−'}${Math.round(Math.abs(effects.grip) * 100)} %`);
  if (effects.brake) out.push(`braking ${effects.brake > 0 ? '+' : '−'}${Math.round(Math.abs(effects.brake) * 100)} %`);
  if (effects.downforce) out.push(`downforce ${effects.downforce > 0 ? '+' : '−'}${Math.abs(effects.downforce)} kg`);
  if (effects.drag) out.push(`drag ${effects.drag > 0 ? '+' : '−'}${(Math.abs(effects.drag) * 100).toFixed(1)} %`);
  if (effects.exhaustMul) out.push(`flow ×${effects.exhaustMul.toFixed(2)}`);
  return out.join(' · ') || 'no change to the numbers';
}
