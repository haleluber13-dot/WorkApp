/* MotorLab — parts catalog.
 * Every entry changes a real term in the simulator (VE, pressure ratio, charge
 * temperature, friction, fuel capacity, clamp load, grip, mass…), so fitting it
 * moves the dyno graph for a reason you can explain. Brand names are the real
 * companies that make this kind of part, listed for reference.
 */

import { isBoosted } from './engines.js';

export const CATS = [
  { id:'drift',     name:'Drift & rally' },
  { id:'induction', name:'Turbo & supercharger' },
  { id:'charge',    name:'Charge cooling & piping' },
  { id:'breathing', name:'Head, cams & valvetrain' },
  { id:'bottom',    name:'Bottom end & clamping' },
  { id:'fuelsys',   name:'Fuel system' },
  { id:'exhaust',   name:'Exhaust & intake' },
  { id:'mgmt',      name:'Engine management' },
  { id:'nitrous',   name:'Nitrous & power adders' },
  { id:'drivetrain',name:'Clutch & drivetrain' },
  { id:'chassis',   name:'Suspension & chassis' },
  { id:'brakes',    name:'Brakes' },
  { id:'tyres',     name:'Tyres & wheels' },
  { id:'aero',      name:'Aero & weight' },
];

const any = () => true;
const na  = (e) => !isBoosted(e);
const turbo = (e) => e.aspiration.includes('turbo');
const blown = (e) => e.aspiration === 'supercharged';
const piston = (e) => e.kind !== 'rotary';
const car = (e) => e.class !== 'bike';

const U = (o) => Object.assign({ cat:'induction', fits:any, cost:0, effects:{}, requires:[], conflicts:[], tier:1 }, o);

const rwd = (e, v) => true;   // the shop sells it; the sim charges the grip either way

export const UPGRADES = [
  /* ---------------- drift & rally ---------------- */
  U({ id:'angle-kit', name:'Steering angle kit (knuckles & extended LCAs)', brand:'Wisefab', cat:'drift', tier:2,
      fits:car, cost:2800, effects:{ steerLockMul:1.7, grip:-0.02 },
      teach:'Re-shaped knuckles move the steering arm pickup so the same rack travel turns the wheel much further, and corrected Ackermann keeps both fronts working at full lock. More lock means holding a steeper angle without spinning — the whole point of a drift front end.' }),
  U({ id:'hydro', name:'Hydraulic handbrake', brand:'ASD / Chase Bays', cat:'drift', tier:1,
      fits:car, cost:520, effects:{},
      teach:'A vertical lever with its own master cylinder plumbed straight into the rear calipers. Pull it and the rears lock instantly regardless of pad temperature — it is a drift initiation tool, not a parking brake.' }),
  U({ id:'lsd-2way', name:'2-way clutch limited-slip differential', brand:'Kaaz / OS Giken', cat:'drift', tier:2,
      fits:car, cost:1650, effects:{ grip:0.03 },
      teach:'Locks the rear axle on power AND off power, so both tyres drive — and both keep spinning together mid-drift. An open diff ends a drift the moment the inside tyre lights up alone.' }),
  U({ id:'bucket-harness', name:'Bucket seat & 6-point harness', brand:'Recaro / Takata', cat:'drift', tier:1,
      fits:car, cost:1400, effects:{ weightKg:-12 },
      teach:'At full lock and full throttle you steer with your hands, not with whatever muscles are keeping you in the chair. The seat holds you; the harness holds the seat\'s promise in a crash.' }),
  U({ id:'gravel-setup', name:'Gravel rally setup (raised, long-travel)', brand:'Proflex / EXE-TC', cat:'drift', tier:3,
      fits:car, cost:6800, effects:{ grip:-0.01, weightKg:8 },
      conflicts:['coilovers','susp-race'],
      teach:'Softer springs, huge damper travel and raised ride height keep the tyres on a surface that keeps moving. On gravel, grip comes from letting the wheel follow the ground, not from holding the body flat.' }),

  /* ---------------- induction ---------------- */
  U({ id:'turbo-stage1', name:'Hybrid turbocharger (billet compressor)', brand:'Garrett', cat:'induction', tier:1,
      fits:turbo, cost:2400, effects:{ boostMul:1.25, spoolMul:0.94, turbineTopEnd:1.06 },
      teach:'A billet compressor wheel with more blades and better aero flows more air for the same shaft speed. Spool suffers a little because the wheel is bigger; the top end gains a lot.' }),
  U({ id:'turbo-stage2', name:'Big single turbo conversion (GTX/G-series)', brand:'Garrett', cat:'induction', tier:3,
      fits:turbo, cost:6200, effects:{ boostMul:1.9, spoolMul:0.62, turbineTopEnd:1.28, veTopEnd:1.1 },
      conflicts:['turbo-stage1','sc-centrifugal'],
      teach:'One large turbo replaces the standard setup. Enormous top end, but the turbine takes far longer to light — you trade everything below 3,500 rpm for everything above it.' }),
  U({ id:'turbo-efr', name:'Dual-ball-bearing turbo (EFR)', brand:'BorgWarner', cat:'induction', tier:2,
      fits:turbo, cost:4300, effects:{ boostMul:1.55, spoolMul:1.18, turbineTopEnd:1.14, frictionMul:0.99 },
      conflicts:['turbo-stage2'],
      teach:'Ceramic ball bearings cut shaft friction dramatically, and a titanium-aluminide turbine wheel weighs half what Inconel does. It spools sooner *and* flows more — you pay for it in cash, not in lag.' }),
  U({ id:'turbo-comp', name:'Competition turbo (Pro Mod spec)', brand:'Precision Turbo', cat:'induction', tier:4,
      fits:turbo, cost:11800, effects:{ boostMul:2.6, spoolMul:0.48, turbineTopEnd:1.4, veTopEnd:1.15 },
      conflicts:['turbo-stage1','turbo-stage2','turbo-efr'], requires:['forged-rot','headstuds'],
      teach:'A 98 mm compressor that does not begin to work until the engine is already screaming. Only makes sense with a converter or clutch that lets you build boost against it.' }),
  U({ id:'twinscroll', name:'Twin-scroll turbine housing & divided manifold', brand:'HKS', cat:'induction', tier:2,
      fits:turbo, cost:1900, effects:{ spoolMul:1.22, veMul:1.03, exhaustMul:1.02 },
      teach:'Keeps the exhaust pulses of cylinders that fire next to each other from colliding. The turbine sees sharper, stronger pulses, so it spools earlier with no top-end cost.' }),
  U({ id:'antilag', name:'Anti-lag / rolling-boost system', brand:'Link ECU', cat:'induction', tier:3,
      fits:turbo, cost:1600, effects:{ spoolMul:1.65, frictionMul:1.02 },
      teach:'Retards ignition brutally and adds fuel so combustion finishes in the exhaust manifold, keeping the turbine spinning off-throttle. It works. It also destroys turbine wheels and exhaust valves.' }),
  U({ id:'sc-twinscrew', name:'Twin-screw supercharger kit', brand:'Whipple', cat:'induction', tier:3,
      fits:(e) => e.kind !== 'rotary' && !turbo(e), cost:7400,
      effects:{ boostAdd:0.75, parasiticMul:1.0, iatOffset:6 }, conflicts:['sc-roots','sc-centrifugal'],
      teach:'Positive displacement with internal compression: full boost from just above idle and cooler air than a roots blower. The belt drive costs you real crank horsepower to turn.' }),
  U({ id:'sc-roots', name:'Roots blower (8-71/14-71)', brand:'Eaton / BDS', cat:'induction', tier:3,
      fits:(e) => e.cam === 'OHV' && !turbo(e), cost:5800,
      effects:{ boostAdd:0.85, parasiticMul:1.35, iatOffset:22 }, conflicts:['sc-twinscrew','sc-centrifugal'],
      teach:'The blower sticking through the bonnet. It moves air in discrete lumps without compressing it internally, so it heats the charge badly — but the torque arrives the instant the crank turns.' }),
  U({ id:'sc-centrifugal', name:'Centrifugal supercharger', brand:'Vortech / ProCharger', cat:'induction', tier:2,
      fits:(e) => !turbo(e) && e.kind !== 'rotary', cost:5200,
      effects:{ boostAdd:0.6, parasiticMul:0.7, iatOffset:10, veTopEnd:1.05 }, conflicts:['sc-twinscrew','sc-roots'],
      teach:'Effectively a belt-driven turbo compressor. Boost rises with the square of engine speed, so it behaves like a naturally aspirated engine down low and a turbo car up top.' }),

  /* ---------------- charge cooling ---------------- */
  U({ id:'ic-bar', name:'Bar-and-plate front-mount intercooler', brand:'Garrett', cat:'charge', tier:1,
      fits:isBoosted, cost:900, effects:{ intercoolerEff:0.80 },
      teach:'More core volume and a better fin design drop intake temperatures 20–40 °C. Cooler air is denser *and* far less likely to knock, which is what actually lets you run more timing.' }),
  U({ id:'ic-water', name:'Air-to-water charge cooler & heat exchanger', brand:'CSF', cat:'charge', tier:2,
      fits:isBoosted, cost:2100, effects:{ intercoolerEff:0.88, iatOffset:-4 }, conflicts:['ic-bar'],
      teach:'Water carries roughly four times the heat per unit volume that air does, and the core can sit right on the throttle body. Short charge pipes mean less lag as well as less heat.' }),
  U({ id:'meth', name:'Water/methanol injection', brand:'AEM', cat:'charge', tier:2,
      fits:isBoosted, cost:750, effects:{ iatOffset:-28, intercoolerEff:0.05 },
      teach:'Evaporating water absorbs enormous latent heat right in the intake charge, and methanol adds octane. Worth several degrees of safe timing — but if the system fails, the tune it enabled will destroy the engine.' }),
  U({ id:'ic-ice', name:'Ice tank / dyno chiller', brand:'Track-day', cat:'charge', tier:1,
      fits:isBoosted, cost:300, effects:{ iatOffset:-18 },
      teach:'A tank of ice water in place of the heat exchanger. Only good for one run — but it shows you exactly how much power intake temperature is costing you.' }),

  /* ---------------- breathing ---------------- */
  U({ id:'cams-street', name:'Fast-road camshafts', brand:'Kelford / Skunk2', cat:'breathing', tier:1,
      fits:piston, cost:1100, effects:{ camDuration:14, veMul:1.03, veRpmShift:350 },
      teach:'More duration holds the valve open longer, so the cylinder keeps filling at higher rpm. You gain up top and lose a little idle quality and low-rpm torque — that lumpy idle is overlap.' }),
  U({ id:'cams-race', name:'Race camshafts (solid lifter)', brand:'Brian Crower', cat:'breathing', tier:3,
      fits:piston, cost:2600, effects:{ camDuration:34, veMul:1.09, veRpmShift:1100, veTopEnd:1.12 },
      conflicts:['cams-street'], requires:['springs'],
      teach:'Huge duration and lift with aggressive ramps. Below 4,000 rpm it is worse than standard; above the crossover it transforms the engine. Needs matching springs or the valves will float and meet a piston.' }),
  U({ id:'springs', name:'Valve springs, titanium retainers & keepers', brand:'Supertech / Ferrea', cat:'breathing', tier:1,
      fits:piston, cost:680, effects:{ rotatingStrength:1.12, veTopEnd:1.04 },
      teach:'Spring pressure has to close the valve faster than the cam ramp falls away. Titanium retainers cut the mass the spring must control, which raises the rpm at which float begins.' }),
  U({ id:'headport', name:'CNC-ported cylinder head & bigger valves', brand:'Cosworth', cat:'breathing', tier:2,
      fits:piston, cost:3200, effects:{ headFlowMul:1.13, veMul:1.05 },
      teach:'Port shape decides flow, and flow decides power. Bigger is not automatically better — you need port *velocity* at the rpm the engine actually uses, which is why a flow bench is not enough on its own.' }),
  U({ id:'portjob-rotary', name:'Bridge / peripheral porting', brand:'Racing Beat', cat:'breathing', tier:3,
      fits:(e) => e.kind === 'rotary', cost:2800, effects:{ veMul:1.14, veRpmShift:900, veTopEnd:1.1 },
      teach:'Port timing is a rotary\'s camshaft. Bridge porting adds a second opening; peripheral porting moves intake into the rotor housing entirely — massive power, no idle, and shorter seal life.' }),
  U({ id:'vvt-tune', name:'Adjustable cam gears / VVT recalibration', brand:'Tomei', cat:'breathing', tier:1,
      fits:piston, cost:420, effects:{ veRpmShift:-250, veMul:1.02 },
      teach:'Advancing the intake cam a few degrees shifts the torque curve down; retarding chases top end. On VVT engines this is a table in the ECU rather than a physical gear.' }),
  U({ id:'itb', name:'Individual throttle bodies', brand:'Jenvey', cat:'breathing', tier:2,
      fits:(e) => !isBoosted(e) && e.kind !== 'rotary', cost:2900,
      effects:{ veMul:1.06, veTopEnd:1.08, veRpmShift:400 },
      teach:'One throttle per cylinder means no shared plenum, no pulse interference between cylinders and an instant throttle response you can feel. Part-throttle drivability gets harder to tune.' }),

  /* ---------------- bottom end ---------------- */
  U({ id:'forged-rot', name:'Forged pistons & H-beam rods', brand:'Wiseco / Manley', cat:'bottom', tier:2,
      fits:piston, cost:2800, effects:{ rotatingStrength:1.6, crDelta:-0.3, frictionMul:1.02 },
      teach:'Forged 2618 alloy survives detonation and heat that would break a cast piston, at the cost of more cold clearance (and piston slap when cold). H-beam rods raise the ceiling on rod-bolt load.' }),
  U({ id:'seals-race', name:'Race apex seals & rebuilt rotors', brand:'Atkins', cat:'bottom', tier:2,
      fits:(e) => e.kind === 'rotary', cost:2400, effects:{ rotatingStrength:1.5, clampMul:1.2 },
      teach:'Three-millimetre or ceramic apex seals survive detonation that would shatter the standard two-piece seal. On a boosted rotary this is not optional.' }),
  U({ id:'headstuds', name:'Head studs & multi-layer gasket', brand:'ARP / Cometic', cat:'bottom', tier:1,
      fits:any, cost:620, effects:{ clampMul:1.75 },
      teach:'Studs are torqued into the block first, then the nut pulls straight up — no torsional load in the fastener, far more consistent clamp. This is what stops the head lifting when you raise boost.' }),
  U({ id:'girdle', name:'Main girdle / billet main caps', brand:'ARP', cat:'bottom', tier:2,
      fits:piston, cost:1400, effects:{ rotatingStrength:1.18 },
      teach:'Ties all the main caps together so the block cannot walk under load. On high-power builds the crank centreline moving is what kills bearings, not oil.' }),
  U({ id:'balance', name:'Balanced & knife-edged rotating assembly', brand:'Callies', cat:'bottom', tier:2,
      fits:piston, cost:1800, effects:{ frictionMul:0.94, rotatingStrength:1.15, inertiaMul:0.9 },
      teach:'Balancing to within a gram cuts the bearing loads that vibration causes, and knife-edging the counterweights reduces windage — the crank stops trying to whip the oil into foam.' }),
  U({ id:'drysump', name:'Dry-sump oiling system', brand:'Dailey Engineering', cat:'bottom', tier:3,
      fits:piston, cost:5400, effects:{ frictionMul:0.93, coolingMul:1.25 },
      teach:'Scavenge pumps pull oil (and crankcase pressure) out of the sump into a remote tank. Less windage, guaranteed pickup under cornering load, and the engine can be mounted lower.' }),

  /* ---------------- fuel ---------------- */
  U({ id:'inj-big', name:'High-impedance injectors (1050 cc)', brand:'Injector Dynamics', cat:'fuelsys', tier:1,
      fits:any, cost:900, effects:{ injectorMul:1.9 },
      teach:'Duty cycle above about 85% stops being linear — the injector never fully closes and fuelling goes unpredictable exactly where you least want it. Bigger injectors buy headroom, not power.' }),
  U({ id:'inj-huge', name:'Competition injectors (2200 cc)', brand:'Bosch Motorsport', cat:'fuelsys', tier:3,
      fits:any, cost:1900, effects:{ injectorMul:3.6 }, conflicts:['inj-big'],
      teach:'Necessary for E85 or methanol at high power, where you need two to three times the volume of gasoline. Idle quality suffers — huge injectors struggle to meter tiny amounts.' }),
  U({ id:'pump-e85', name:'In-tank pump upgrade & -8 feed lines', brand:'Walbro / DeatschWerks', cat:'fuelsys', tier:1,
      fits:any, cost:640, effects:{ fuelPumpMul:1.8 },
      teach:'Fuel pumps are rated at a pressure; add boost and rail pressure rises with it, so flow falls exactly when demand peaks. Always check pump flow *at your target rail pressure*.' }),
  U({ id:'hpfp-up', name:'Upgraded high-pressure pump & lobe', brand:'Dorch', cat:'fuelsys', tier:2,
      fits:(e) => e.injection === 'direct', cost:1500, effects:{ fuelPumpMul:1.6 },
      teach:'On a direct-injection engine the cam-driven high-pressure pump is the real fuelling ceiling — the port injectors people usually blame are not even the restriction.' }),
  U({ id:'flexfuel', name:'Flex-fuel sensor & ethanol content kit', brand:'Zeitronix', cat:'fuelsys', tier:1,
      fits:(e) => e.fuel !== 'diesel' && e.fuel !== 'nitro', cost:380, effects:{},
      teach:'Measures ethanol content in real time so the ECU can blend between a gasoline map and an E85 map. Lets you run whatever is in the tank without re-tuning.' }),

  /* ---------------- exhaust & intake ---------------- */
  U({ id:'exh-cat', name:'High-flow downpipe & sports catalyst', brand:'Akrapovič', cat:'exhaust', tier:1,
      fits:car, cost:1300, effects:{ exhaustMul:1.05, spoolMul:1.06 },
      teach:'On a turbo engine the downpipe is usually the single biggest restriction. Less backpressure means the turbine sees a bigger pressure drop, so it makes the same boost at lower shaft speed.' }),
  U({ id:'exh-full', name:'Full titanium exhaust system', brand:'Akrapovič / Yoshimura', cat:'exhaust', tier:2,
      fits:any, cost:2600, effects:{ exhaustMul:1.08, weightKg:-11 }, requires:['exh-cat'],
      teach:'Titanium is about 40% lighter than stainless for the same strength. On a bike that mass is high and far back, so it changes how the machine handles as much as how it sounds.' }),
  U({ id:'headers', name:'Equal-length tubular headers', brand:'Burns Stainless', cat:'exhaust', tier:2,
      fits:na, cost:1800, effects:{ veMul:1.05, exhaustMul:1.06, veTopEnd:1.05 },
      teach:'A departing exhaust pulse leaves a low-pressure wave behind it. Get primary length right and that wave arrives back at the valve during overlap and physically pulls the next intake charge in. Free power from wave timing.' }),
  U({ id:'intake-cai', name:'Cold-air intake & larger throttle body', brand:'Injen', cat:'exhaust', tier:1,
      fits:any, cost:480, effects:{ veMul:1.02, iatOffset:-6 },
      teach:'Most of the gain here is temperature, not flow — pulling air from outside the engine bay instead of over a hot manifold. A "cold air intake" that ingests hot air is worse than standard.' }),

  /* ---------------- management ---------------- */
  U({ id:'ecu-piggy', name:'Piggyback ECU / flash tune', brand:'Cobb', cat:'mgmt', tier:1,
      fits:any, cost:700, effects:{},
      teach:'Modifies the factory ECU\'s tables while keeping every safety strategy it ships with. The right first step: cheap, reversible, and you keep knock control and limp modes.' }),
  U({ id:'ecu-standalone', name:'Standalone engine management', brand:'Haltech / MoTeC / Syvecs', cat:'mgmt', tier:2,
      fits:any, cost:3400, effects:{}, conflicts:['ecu-piggy'],
      teach:'Full control of every table, plus traction control, launch control, flat-shift and per-cylinder trims. Also full responsibility — nothing is protecting the engine except the strategies you configure.' }),
  U({ id:'knock-audio', name:'Knock-detection audio system', brand:'Plex / Link', cat:'mgmt', tier:1,
      fits:(e) => e.fuel !== 'diesel', cost:900, effects:{},
      teach:'Lets you *hear* detonation in the block through headphones while the engine is on the dyno. Almost every engine destroyed on a dyno was knocking audibly before it let go.' }),
  U({ id:'egt-log', name:'Per-cylinder EGT & wideband array', brand:'Innovate / MoTeC', cat:'mgmt', tier:2,
      fits:any, cost:1400, effects:{},
      teach:'One wideband in the collector averages everything and hides a lean cylinder. Per-cylinder EGT is how you find the one runner that is about to melt.' }),

  /* ---------------- nitrous ---------------- */
  U({ id:'n2o-wet', name:'Wet nitrous system (100 shot)', brand:'NOS', cat:'nitrous', tier:2,
      fits:(e) => e.fuel !== 'nitro', cost:850, effects:{ veMul:1.16, iatOffset:-22 },
      teach:'Nitrous oxide is about 36% oxygen by mass, and it flashes to gas in the manifold — so it adds oxygen *and* huge charge cooling. It must be fuelled and the timing pulled, or it detonates instantly.' }),
  U({ id:'n2o-direct', name:'Direct-port nitrous (250 shot)', brand:'Nitrous Express', cat:'nitrous', tier:3,
      fits:(e) => e.fuel !== 'nitro', cost:2400, effects:{ veMul:1.42, iatOffset:-38 },
      conflicts:['n2o-wet'], requires:['forged-rot'],
      teach:'A nozzle in every runner so every cylinder gets exactly the same shot. Big power for very little money — and the fastest way to break a standard bottom end ever invented.' }),

  /* ---------------- drivetrain ---------------- */
  U({ id:'clutch-twin', name:'Twin-plate ceramic clutch', brand:'Exedy', cat:'drivetrain', tier:2,
      fits:any, cost:1900, effects:{ driveLoss:-0.01, weightKg:-4 },
      teach:'Two friction discs double the torque capacity without doubling the clamp load, so the pedal stays usable. Ceramic pucks bite hard and make low-speed manoeuvring an art form.' }),
  U({ id:'lsd', name:'Clutch-type limited-slip differential', brand:'Cusco / OS Giken', cat:'drivetrain', tier:2,
      fits:car, cost:1700, effects:{},
      teach:'Ramp angles set how much torque bias you get on power and on overrun. A 1.5-way diff locks hard under power and partly on deceleration — the setting most track cars want.' }),
  U({ id:'gears-close', name:'Close-ratio gear set', brand:'Quaife', cat:'drivetrain', tier:3,
      fits:car, cost:4200, effects:{},
      teach:'Narrower ratio steps keep the engine inside its power band through every shift. It only makes sense once the power curve is peaky enough to fall off between gears.' }),
  U({ id:'lightflywheel', name:'Lightweight flywheel', brand:'Fidanza', cat:'drivetrain', tier:1,
      fits:any, cost:520, effects:{ inertiaMul:0.62, weightKg:-5 },
      teach:'Removes rotational inertia, so revs rise and fall much faster. No extra peak power at all — but the car feels transformed, and it will try to stall in traffic.' }),

  /* ---------------- chassis ---------------- */
  U({ id:'coilovers', name:'Two-way adjustable coilovers', brand:'Öhlins / KW', cat:'chassis', tier:2,
      fits:car, cost:3100, effects:{ grip:0.06, weightKg:-6 },
      teach:'Separate compression and rebound adjustment lets you control the tyre over bumps and the body afterwards independently. Ride height and corner weights matter more than either clicker.' }),
  U({ id:'arbs', name:'Adjustable anti-roll bars', brand:'Whiteline', cat:'chassis', tier:1,
      fits:car, cost:640, effects:{ grip:0.03 },
      teach:'The cheapest handling balance tool there is. Stiffness scales with the fourth power of diameter, and moving the drop-link to a different hole changes the effective rate by a third.' }),
  U({ id:'bushings', name:'Spherical bearings & solid subframe mounts', brand:'SuperPro', cat:'chassis', tier:2,
      fits:car, cost:900, effects:{ grip:0.04 },
      teach:'Rubber bushings let the geometry move under load — the alignment you set in the pits is not the alignment you have mid-corner. Spherical bearings fix that and transmit every impact to you.' }),
  U({ id:'susp-race', name:'Race dampers & spring package', brand:'Öhlins TTX', cat:'chassis', tier:3,
      fits:any, cost:6800, effects:{ grip:0.11, weightKg:-8 }, conflicts:['coilovers'],
      teach:'Four-way adjustable with separate high- and low-speed circuits: low-speed damping controls body movement, high-speed controls the wheel over kerbs. They are different jobs.' }),
  U({ id:'bike-susp', name:'Fork cartridge kit & rear shock', brand:'Öhlins / K-Tech', cat:'chassis', tier:2,
      fits:(e) => e.class === 'bike', cost:2600, effects:{ grip:0.09 },
      teach:'Standard forks are usually under-damped and over-sprung for a fast rider. Correct spring rate for *your* weight first — clickers cannot fix a wrong spring.' }),

  /* ---------------- brakes ---------------- */
  U({ id:'bbk', name:'Six-piston big brake kit', brand:'Brembo / AP Racing', cat:'brakes', tier:2,
      fits:car, cost:4200, effects:{ brake:0.22, weightKg:-3 },
      teach:'Bigger discs give leverage and heat capacity; more pistons spread pad pressure evenly. Neither increases grip — the tyre still decides how hard you can stop. What you buy is fade resistance.' }),
  U({ id:'pads-race', name:'Race pad compound & braided lines', brand:'Pagid / Goodridge', cat:'brakes', tier:1,
      fits:any, cost:520, effects:{ brake:0.10 },
      teach:'Race pads have a higher friction coefficient once hot — and much lower when cold, which is genuinely dangerous on a road drive. Braided lines stop the pedal going long as the fluid heats.' }),
  U({ id:'brake-cool', name:'Brake cooling ducts', brand:'Custom', cat:'brakes', tier:1,
      fits:car, cost:340, effects:{ brake:0.06 },
      teach:'Ducting air to the disc\'s inner vanes is worth more on lap three than any pad. Discs are heat exchangers — the vanes are a pump, and they need something to pump.' }),

  /* ---------------- tyres ---------------- */
  U({ id:'tyre-sport', name:'Ultra-high-performance road tyres', brand:'Michelin / Pirelli', cat:'tyres', tier:1,
      fits:any, cost:1100, effects:{ grip:0.10 },
      teach:'The single biggest performance change available for the money, on any vehicle, every time. Compound and construction matter more than section width.' }),
  U({ id:'tyre-slick', name:'Racing slicks', brand:'Hoosier / Avon', cat:'tyres', tier:3,
      fits:any, cost:2400, effects:{ grip:0.32 }, conflicts:['tyre-sport'],
      teach:'No tread blocks means the whole footprint is rubber, and the carcass is built for one temperature window. Outside that window a slick is worse than a road tyre.' }),
  U({ id:'wheels-light', name:'Forged lightweight wheels', brand:'BBS / OZ', cat:'tyres', tier:2,
      fits:any, cost:2800, effects:{ weightKg:-18, grip:0.03 },
      teach:'Unsprung and rotating mass — every kilogram here is worth several in the body. The damper controls the wheel more easily, so the tyre stays on the road over bumps.' }),

  /* ---------------- aero & weight ---------------- */
  U({ id:'aero-kit', name:'Splitter, wing & diffuser package', brand:'Voltex / APR', cat:'aero', tier:2,
      fits:car, cost:3600, effects:{ downforce:220, drag:0.04 },
      teach:'Downforce rises with the square of speed, so aero does nothing in a slow corner and everything in a fast one. Balance front and rear together or you have simply moved the problem.' }),
  U({ id:'weight-strip', name:'Interior strip & polycarbonate windows', brand:'Track prep', cat:'aero', tier:1,
      fits:car, cost:800, effects:{ weightKg:-120 },
      teach:'Mass hurts everywhere at once: acceleration, braking, cornering and tyre wear. It is also the only modification that improves all four without a single trade-off.' }),
  U({ id:'carbon-panels', name:'Carbon body panels', brand:'Seibon', cat:'aero', tier:2,
      fits:car, cost:4400, effects:{ weightKg:-45 },
      teach:'Weight taken from the bonnet and roof lowers the centre of gravity as well as the total — which reduces load transfer in every corner.' }),
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

/** Merge a list of fitted upgrade ids into a modifier set. */
export function applyUpgrades(baseMods, ids){
  const m = { ...baseMods, labels:[...(baseMods.labels || [])] };
  let cost = 0, weight = 0, grip = 0, brake = 0, downforce = 0, drag = 0;
  for (const id of ids){
    const u = UPGRADE_BY_ID[id]; if (!u) continue;
    cost += u.cost;
    for (const [k, val] of Object.entries(u.effects)){
      if (k === 'weightKg'){ weight += val; continue; }
      if (k === 'grip'){ grip += val; continue; }
      if (k === 'brake'){ brake += val; continue; }
      if (k === 'downforce'){ downforce += val; continue; }
      if (k === 'drag'){ drag += val; continue; }
      if (k === 'intercoolerEff'){ m[k] = Math.max(m[k], val > 1 ? val : val); continue; }
      if (typeof val !== 'number'){ m[k] = val; continue; }
      /* multipliers compound, additive terms add */
      if (/Mul$/.test(k)) m[k] = (m[k] ?? 1) * val;
      else m[k] = (m[k] ?? 0) + val;
    }
    m.labels.push(u.name);
  }
  m.cost = cost; m.weightKg = weight; m.gripBonus = grip;
  m.brakeBonus = brake; m.downforceBonus = downforce; m.dragBonus = drag;
  return m;
}

export function availableFor(engine, vehicle){
  return UPGRADES.filter(u => {
    try { return u.fits(engine, vehicle); } catch { return false; }
  });
}

/** Why can't I fit this yet? */
export function fitProblems(u, fitted){
  const out = [];
  for (const r of u.requires) if (!fitted.includes(r))
    out.push({ kind:'requires', id:r, msg:`Needs ${UPGRADE_BY_ID[r]?.name || r} fitted first.` });
  for (const c of u.conflicts) if (fitted.includes(c))
    out.push({ kind:'conflict', id:c, msg:`Conflicts with ${UPGRADE_BY_ID[c]?.name || c} — remove it first.` });
  return out;
}
