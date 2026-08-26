/* MotorLab — engine catalog.
 * Every entry is a *spec*, not a mesh: the 3D builder derives geometry from
 * bore/stroke/layout, and the simulator derives the torque curve from
 * displacement, VE, pressure ratio and efficiency. Add a spec here and the
 * whole app (3D model, part tree, torque sheet, dyno) picks it up.
 *
 * revsPerCycle : crank revolutions per power stroke per chamber (4-stroke = 2,
 *                rotary/2-stroke = 1). Feeds T = Vd*BMEP / (2*pi*revsPerCycle).
 */

/* bmep = reference INDICATED mean effective pressure (bar) at VE=1.0, best-power
 * lambda and MBT timing. Friction (FMEP) is subtracted by the simulator. */
export const FUELS = {
  gasoline: { name:'Pump gasoline 91',  octane:91,  bmep:14.6, afr:14.7, lhv:43.4, coolFuel:1.00, flameAdv:0 },
  premium:  { name:'Pump gasoline 98',  octane:98,  bmep:15.0, afr:14.7, lhv:43.5, coolFuel:1.00, flameAdv:0 },
  race:     { name:'Race gas 110',      octane:110, bmep:15.6, afr:14.6, lhv:43.0, coolFuel:1.03, flameAdv:1 },
  e85:      { name:'E85 ethanol blend', octane:105, bmep:15.4, afr:9.8,  lhv:29.2, coolFuel:1.15, flameAdv:3, lambdaFloor:0.72 },
  methanol: { name:'Methanol M100',     octane:109, bmep:16.2, afr:6.4,  lhv:19.9, coolFuel:1.35, flameAdv:7, lambdaFloor:0.60 },
  diesel:   { name:'Diesel #2',         octane:0,   bmep:10.6,  afr:18.0, lhv:42.6, coolFuel:1.00, cetane:48, flameAdv:0, lambdaFloor:1.10 },
  nitro:    { name:'Nitromethane 90%',  octane:132, bmep:30.0, afr:1.7,  lhv:11.3, coolFuel:1.6, flameAdv:40, lambdaFloor:0.34 },
};

const E = (o) => Object.assign({
  kind:'piston', layout:'I', bankAngle:0, valvesPerCyl:4, cam:'DOHC', revsPerCycle:2,
  aspiration:'na', fuel:'gasoline', class:'car', idle:750, coolant:'water',
  ignition:'coil-on-plug', injection:'port', dryWeight:140,
}, o);

/* firing orders for the common layouts (used by the animator + wiring lesson) */
export const FIRING = {
  I3:[1,3,2], I4:[1,3,4,2], I5:[1,2,4,5,3], I6:[1,5,3,6,2,4],
  V6:[1,4,3,6,5,2], V8:[1,8,7,2,6,5,4,3], V8f:[1,5,4,8,3,7,2,6],
  V10:[1,10,9,4,3,6,5,8,7,2], V12:[1,12,5,8,3,10,6,7,2,11,4,9],
  F4:[1,3,2,4], F6:[1,6,2,4,3,5], V2:[1,2], I2:[1,2], I1:[1], V4:[1,3,2,4],
};

export const ENGINES = [
  /* ---------------- everyday & performance cars ---------------- */
  E({ id:'i4-16-na', name:'1.6L DOHC Inline-4', maker:'Economy', layout:'I', cyl:4,
      displacement:1598, bore:79, stroke:81.5, cr:10.5, redline:6800, tqPeak:4400, hpPeak:6200,
      firing:'I4', blurb:'The engine most of the world drives. Small bore, long-ish stroke, four valves per cylinder, port injection. The perfect first teardown — everything is where the textbook says it is.' }),

  E({ id:'i4-20-t', name:'2.0L Turbo Inline-4 (GDI)', maker:'Modern', layout:'I', cyl:4,
      displacement:1998, bore:86, stroke:86, cr:9.6, redline:7000, tqPeak:2200, hpPeak:5800,
      aspiration:'turbo', injection:'direct', boostTarget:1.2, spoolRpm:2000, firing:'I4', dryWeight:145,
      blurb:'Square bore/stroke, twin-scroll turbo, direct injection. Makes big torque just off idle and is the most common tuning platform on earth.' }),

  E({ id:'i4-20-vtec', name:'2.0L High-Revving NA Inline-4', maker:'Screamer', layout:'I', cyl:4,
      displacement:1996, bore:86, stroke:85.9, cr:12.3, redline:9000, tqPeak:6200, hpPeak:8200,
      fuel:'premium', firing:'I4', camProfile:'aggressive', dryWeight:135,
      blurb:'12.3:1 compression, individual throttle-friendly head, and a cam profile that does nothing until 5,800 rpm and then eats the rest of the tach.' }),

  E({ id:'i5-25-t', name:'2.5L Turbo Inline-5', maker:'Rally', layout:'I', cyl:5,
      displacement:2480, bore:82.5, stroke:92.8, cr:10.0, redline:7000, tqPeak:2000, hpPeak:6000,
      aspiration:'turbo', injection:'direct', boostTarget:1.4, spoolRpm:1900, firing:'I5', dryWeight:165,
      blurb:'Odd cylinder count, odd firing interval, unmistakable warble. Longer stroke than bore gives it diesel-like low-end shove.' }),

  E({ id:'i6-30-tt', name:'3.0L Twin-Turbo Inline-6', maker:'Grand Tourer', layout:'I', cyl:6,
      displacement:2998, bore:84, stroke:90, cr:10.2, redline:7000, tqPeak:1800, hpPeak:6000,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.3, spoolRpm:1700, firing:'I6', dryWeight:190,
      blurb:'Perfectly balanced by geometry — an inline-6 cancels its own primary and secondary forces, which is why it feels turbine-smooth without balance shafts.' }),

  E({ id:'i6-30-legend', name:'3.0L Iron-Block Twin-Turbo I6', maker:'Legend', layout:'I', cyl:6,
      displacement:2997, bore:86, stroke:86, cr:8.5, redline:7200, tqPeak:3600, hpPeak:6200,
      aspiration:'twinturbo', boostTarget:0.7, spoolRpm:2600, firing:'I6', dryWeight:230, fuel:'premium',
      blurb:'Closed-deck iron block, forged crank, sequential turbos. Famous because the bottom end will hold roughly triple its factory power before it complains.' }),

  E({ id:'v6-35-na', name:'3.5L V6 (60°)', maker:'Mainstream', layout:'V', cyl:6, bankAngle:60,
      displacement:3471, bore:92, stroke:87, cr:11.0, redline:6800, tqPeak:4700, hpPeak:6400,
      firing:'V6', dryWeight:175,
      blurb:'The default family-car and pickup engine: compact, 60° banks for even firing, chain-driven quad cams and variable valve timing.' }),

  E({ id:'v6-29-tt', name:'2.9L Twin-Turbo V6 (90°)', maker:'Super Sedan', layout:'V', cyl:6, bankAngle:90,
      displacement:2891, bore:86.5, stroke:82, cr:9.3, redline:7500, tqPeak:2500, hpPeak:6500,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.5, spoolRpm:2100, firing:'V6',
      fuel:'premium', dryWeight:180,
      blurb:'Hot-vee layout — turbos live in the valley between the banks, so the exhaust path is short and it spools like a much smaller engine.' }),

  E({ id:'v8-50-ohv', name:'5.0L Pushrod V8 (OHV)', maker:'American', layout:'V', cyl:8, bankAngle:90,
      displacement:4951, bore:96, stroke:85.5, cr:10.5, redline:6600, tqPeak:4400, hpPeak:5800,
      cam:'OHV', valvesPerCyl:2, firing:'V8', dryWeight:200,
      blurb:'One cam in the block, pushrods and rockers up top. Physically tiny for its displacement, which is exactly why it ends up in everything.' }),

  E({ id:'v8-62-sc', name:'6.2L Supercharged V8', maker:'American', layout:'V', cyl:8, bankAngle:90,
      displacement:6162, bore:103.25, stroke:92, cr:9.5, redline:6600, tqPeak:3600, hpPeak:6100,
      cam:'OHV', valvesPerCyl:2, aspiration:'supercharged', scType:'twinscrew', boostTarget:0.9,
      firing:'V8', fuel:'premium', dryWeight:245,
      blurb:'1.7-litre twin-screw blower sitting in the valley. Positive displacement means full boost at 2,000 rpm — no waiting, ever.' }),

  E({ id:'v8-40-tt', name:'4.0L Twin-Turbo DOHC V8', maker:'Autobahn', layout:'V', cyl:8, bankAngle:90,
      displacement:3982, bore:86, stroke:86, cr:10.0, redline:7200, tqPeak:2000, hpPeak:6000,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.2, spoolRpm:1800, firing:'V8',
      fuel:'premium', dryWeight:220,
      blurb:'Hot-vee, cross-plane crank, four cams. Two turbos tucked inside the V and a water-to-air intercooler where the intake manifold would normally be.' }),

  E({ id:'v8-52-flat', name:'5.2L Flat-Plane V8', maker:'Exotic', layout:'V', cyl:8, bankAngle:90,
      displacement:5163, bore:94, stroke:93, cr:12.0, redline:8250, tqPeak:4750, hpPeak:7500,
      firing:'V8f', crank:'flat', fuel:'premium', dryWeight:205,
      blurb:'Flat-plane crank: each bank fires evenly like two inline-4s, so the exhaust note is a shriek instead of a burble. Lighter crank, higher revs, more vibration.' }),

  E({ id:'v10-52-na', name:'5.2L V10 (90°)', maker:'Exotic', layout:'V', cyl:10, bankAngle:90,
      displacement:5204, bore:84.5, stroke:92.8, cr:12.7, redline:8700, tqPeak:6500, hpPeak:8000,
      firing:'V10', fuel:'premium', dryWeight:225,
      blurb:'Ten cylinders, dry sump, 12.7:1 compression. Naturally aspirated response with an 8,700 rpm ceiling — the last of a dying breed.' }),

  E({ id:'v12-65-na', name:'6.5L V12 (60°)', maker:'Exotic', layout:'V', cyl:12, bankAngle:60,
      displacement:6498, bore:95, stroke:76.4, cr:11.8, redline:8500, tqPeak:5500, hpPeak:8000,
      firing:'V12', fuel:'premium', dryWeight:270,
      blurb:'Big bore, short stroke, six cylinders per bank firing every 60° of crank rotation. Torque delivery so continuous it feels electric.' }),

  E({ id:'f4-25-t', name:'2.5L Turbo Flat-4 (Boxer)', maker:'Boxer', layout:'F', cyl:4, bankAngle:180,
      displacement:2457, bore:99.5, stroke:79, cr:9.0, redline:6700, tqPeak:3200, hpPeak:5800,
      aspiration:'turbo', boostTarget:1.0, spoolRpm:2600, firing:'F4', dryWeight:160,
      blurb:'Pistons punch outward at each other — low centre of gravity, and unequal-length headers give it that off-beat rumble.' }),

  E({ id:'f6-30-t', name:'3.0L Twin-Turbo Flat-6', maker:'Rear-Engine', layout:'F', cyl:6, bankAngle:180,
      displacement:2981, bore:91, stroke:76.4, cr:10.5, redline:7500, tqPeak:2300, hpPeak:6500,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.1, spoolRpm:1900, firing:'F6',
      fuel:'premium', dryWeight:185,
      blurb:'Flat-6 hung behind the rear axle, dry-sumped so it can sit low. Two small turbos, one per bank, for near-instant response.' }),

  E({ id:'w16-80-qt', name:'8.0L Quad-Turbo W16', maker:'Hypercar', layout:'W', cyl:16, bankAngle:90,
      displacement:7993, bore:86, stroke:86, cr:9.0, redline:6800, tqPeak:2000, hpPeak:6400,
      aspiration:'quadturbo', injection:'direct', boostTarget:1.9, spoolRpm:1800, firing:'V8',
      fuel:'premium', dryWeight:400,
      blurb:'Two narrow-angle V8s on a common crank, four turbochargers and ten radiators. Included mostly so you can see what "too much" looks like in 3D.' }),

  /* ---------------- rotary ---------------- */
  E({ id:'rotary-13b-t', name:'13B 1.3L Turbo Rotary (2-rotor)', maker:'Wankel', kind:'rotary', layout:'rotary',
      cyl:2, displacement:1308, chamberCc:654, cr:9.0, redline:8000, tqPeak:5000, hpPeak:6500,
      aspiration:'twinturbo', revsPerCycle:1, cam:'none', valvesPerCyl:0, boostTarget:0.7, spoolRpm:2800,
      fuel:'premium', dryWeight:125, idle:900, ports:'peripheral-exhaust, side-intake',
      blurb:'No pistons, no valves, no camshaft. Three-sided rotors orbit an eccentric shaft; each rotor face does intake, compression, power and exhaust once per eccentric-shaft revolution.' }),

  E({ id:'rotary-20b', name:'20B 2.0L Turbo Rotary (3-rotor)', maker:'Wankel', kind:'rotary', layout:'rotary',
      cyl:3, displacement:1962, chamberCc:654, cr:9.0, redline:8500, tqPeak:5200, hpPeak:7000,
      aspiration:'twinturbo', revsPerCycle:1, cam:'none', valvesPerCyl:0, boostTarget:0.8, spoolRpm:2900,
      fuel:'race', dryWeight:155, idle:950,
      blurb:'Three rotors on one eccentric shaft. Overlapping power pulses make it sound like a two-stroke jet — and it will still fit under a low bonnet.' }),

  /* ---------------- diesel & trucks ---------------- */
  E({ id:'d-i4-20', name:'2.0L Turbo Diesel Inline-4', maker:'Diesel', layout:'I', cyl:4,
      displacement:1968, bore:81, stroke:95.5, cr:16.2, redline:4800, tqPeak:1900, hpPeak:4000,
      aspiration:'turbo', fuel:'diesel', injection:'common-rail', boostTarget:1.5, spoolRpm:1500,
      firing:'I4', idle:800, glow:true, dryWeight:170,
      blurb:'Compression ignition — no spark plugs at all. 16.2:1 squeeze lights the fuel, a variable-geometry turbo keeps it awake, and 1,800 bar common rail meters the diesel.' }),

  E({ id:'d-i6-67', name:'6.7L Turbo Diesel Inline-6', maker:'Heavy Duty', layout:'I', cyl:6,
      displacement:6690, bore:107, stroke:124, cr:16.2, redline:3400, tqPeak:1800, hpPeak:2800,
      aspiration:'turbo', fuel:'diesel', injection:'common-rail', boostTarget:1.9, spoolRpm:1500,
      firing:'I6', idle:700, glow:true, valvesPerCyl:2, cam:'OHV', dryWeight:450,
      blurb:'Cast-iron everything, six head bolts per cylinder, torque measured in four figures. This is the pickup/heavy-truck workhorse.' }),

  E({ id:'d-v8-66', name:'6.6L Turbo Diesel V8', maker:'Heavy Duty', layout:'V', cyl:8, bankAngle:90,
      displacement:6599, bore:103, stroke:99, cr:16.0, redline:3600, tqPeak:1600, hpPeak:2800,
      aspiration:'turbo', fuel:'diesel', injection:'common-rail', boostTarget:1.7, spoolRpm:1500,
      firing:'V8', idle:680, glow:true, valvesPerCyl:4, cam:'OHV', dryWeight:470,
      blurb:'Two banks, one enormous variable-geometry turbo in the valley, and enough low-end torque to bend driveshafts.' }),

  E({ id:'v8-70-bb', name:'7.0L Big-Block V8 (carbureted)', maker:'Vintage', layout:'V', cyl:8, bankAngle:90,
      displacement:7000, bore:108, stroke:95.5, cr:10.25, redline:6000, tqPeak:3800, hpPeak:5400,
      cam:'OHV', valvesPerCyl:2, ignition:'distributor', injection:'carburettor', firing:'V8',
      fuel:'premium', dryWeight:290, idle:850,
      blurb:'Cast iron, a single four-barrel carburettor and a points-or-HEI distributor. Learn ignition timing here — you set it with a timing light, not a laptop.' }),

  E({ id:'v8-57-sb', name:'5.7L Small-Block V8 (carbureted)', maker:'Vintage', layout:'V', cyl:8, bankAngle:90,
      displacement:5735, bore:101.6, stroke:88.4, cr:9.0, redline:5800, tqPeak:3200, hpPeak:4800,
      cam:'OHV', valvesPerCyl:2, ignition:'distributor', injection:'carburettor', firing:'V8',
      dryWeight:250, idle:800,
      blurb:'The most-built V8 in history. Simple enough to rebuild on a kitchen table and the reason "swap a small-block into it" is a complete sentence.' }),

  /* ---------------- race ---------------- */
  E({ id:'race-16-v6h', name:'1.6L Turbo Hybrid V6 (F1-style)', maker:'Formula', layout:'V', cyl:6, bankAngle:90,
      displacement:1600, bore:80, stroke:53, cr:14.0, redline:15000, tqPeak:10500, hpPeak:12500,
      aspiration:'turbo', injection:'direct', boostTarget:2.6, spoolRpm:5000, firing:'V6',
      fuel:'race', class:'race', idle:4000, valvetrain:'pneumatic', hybrid:true, dryWeight:145,
      fuelFlowMaxKgH:100, mguKw:120, preChamber:true,
      blurb:'Pneumatic valve springs, 500 bar direct injection, a single turbo split across the V with an electric motor on the shaft. Pre-chamber combustion pushes thermal efficiency past 50%.' }),

  E({ id:'race-20-rally', name:'2.0L Rally Turbo Inline-4 (anti-lag)', maker:'Rally', layout:'I', cyl:4,
      displacement:1998, bore:85, stroke:88, cr:8.5, redline:8000, tqPeak:3500, hpPeak:6500,
      aspiration:'turbo', boostTarget:2.5, spoolRpm:2500, firing:'I4', fuel:'race', class:'race',
      antilag:true, restrictor:34, dryWeight:150,
      blurb:'34 mm inlet restrictor, anti-lag that dumps fuel into the exhaust manifold to keep the turbine spinning off-throttle, and a gearbox that shifts flat.' }),

  E({ id:'race-58-stock', name:'5.8L NA Race V8 (stock-car)', maker:'Oval', layout:'V', cyl:8, bankAngle:90,
      displacement:5860, bore:104.8, stroke:85, cr:12.0, redline:9000, tqPeak:7500, hpPeak:8800,
      cam:'OHV', valvesPerCyl:2, firing:'V8', fuel:'race', class:'race', injection:'direct',
      dryWeight:210, idle:1200,
      blurb:'Pushrods at 9,000 rpm. Roller lifters, shaft rockers, a dry sump and a single four-barrel-sized throttle body — built to run flat out for 500 miles.' }),

  E({ id:'race-82-nitro', name:'8.2L Supercharged Nitro V8', maker:'Drag', layout:'V', cyl:8, bankAngle:90,
      displacement:8194, bore:108, stroke:111.8, cr:6.5, redline:8400, tqPeak:7000, hpPeak:8000,
      cam:'OHV', valvesPerCyl:2, aspiration:'supercharged', scType:'roots', boostTarget:4.0,
      fuel:'nitro', class:'race', ignition:'dual-mag', dryWeight:290, idle:2400,
      blurb:'Billet aluminium hemi, 14-71 roots blower at 60% overdrive, two magnetos firing 44 amps, and enough nitromethane to make 11,000 hp for four seconds at a time.' }),

  /* ---------------- motorcycles ---------------- */
  E({ id:'m-i4-1000', name:'1000cc Inline-4 Supersport', maker:'Superbike', layout:'I', cyl:4,
      displacement:999, bore:76, stroke:55, cr:13.0, redline:14500, tqPeak:11500, hpPeak:13500,
      firing:'I4', class:'bike', fuel:'premium', idle:1300, dryWeight:58, coolant:'water',
      blurb:'Bore nearly 40% larger than the stroke, titanium valves, and a cassette gearbox in the same casting as the crankcase. Revs to 14,500 all day.' }),

  E({ id:'m-v4-1100', name:'1100cc V4 Superbike (90°)', maker:'Superbike', layout:'V', cyl:4, bankAngle:90,
      displacement:1103, bore:81, stroke:53.5, cr:14.0, redline:14500, tqPeak:11000, hpPeak:13000,
      firing:'V4', class:'bike', fuel:'premium', idle:1400, dryWeight:66, valvetrain:'desmodromic',
      blurb:'90° V4 with a counter-rotating crank and desmodromic valve actuation — cams close the valves mechanically instead of relying on springs.' }),

  E({ id:'m-vtwin-1200', name:'1200cc Air-Cooled V-Twin (45°)', maker:'Cruiser', layout:'V', cyl:2, bankAngle:45,
      displacement:1202, bore:88.9, stroke:96.8, cr:10.0, redline:5800, tqPeak:3000, hpPeak:5200,
      cam:'OHV', valvesPerCyl:2, firing:'V2', class:'bike', coolant:'air', idle:1000, dryWeight:75,
      blurb:'Two cylinders sharing one crankpin at 45°, air-cooled fins, pushrods in chrome tubes. The uneven firing interval is the whole point.' }),

  E({ id:'m-ptwin-900', name:'900cc Parallel-Twin (270°)', maker:'Roadster', layout:'I', cyl:2,
      displacement:900, bore:84.6, stroke:80, cr:11.0, redline:9500, tqPeak:6500, hpPeak:8500,
      firing:'I2', class:'bike', idle:1200, dryWeight:52, crank:'270',
      blurb:'A 270° crank makes a parallel-twin fire like a 90° V-twin — same lopsided character, far simpler packaging.' }),

  E({ id:'m-triple-765', name:'765cc Inline-3', maker:'Roadster', layout:'I', cyl:3,
      displacement:765, bore:78, stroke:53.4, cr:12.9, redline:12500, tqPeak:9500, hpPeak:11750,
      firing:'I3', class:'bike', fuel:'premium', idle:1250, dryWeight:50,
      blurb:'Three cylinders split the difference: the low-end torque of a twin, the top-end of a four, and a firing interval that howls.' }),

  E({ id:'m-single-450', name:'450cc Single (motocross)', maker:'Dirt', layout:'I', cyl:1,
      displacement:449, bore:96, stroke:62.1, cr:13.5, redline:11000, tqPeak:7000, hpPeak:9000,
      firing:'I1', class:'bike', fuel:'premium', idle:1900, dryWeight:29, valvesPerCyl:4,
      cam:'SOHC', valvetrain:'finger-follower',
      blurb:'One enormous 96 mm piston, a titanium con-rod and a five-day service interval if you race it. The simplest complete four-stroke you can study.' }),

  E({ id:'m-flat2-1200', name:'1200cc Flat-Twin (Boxer)', maker:'Tourer', layout:'F', cyl:2, bankAngle:180,
      displacement:1170, bore:101, stroke:73, cr:12.5, redline:9000, tqPeak:6250, hpPeak:7750,
      firing:'I2', class:'bike', idle:1100, dryWeight:65, coolant:'air-oil',
      blurb:'Cylinders sticking out into the airflow on both sides, shaft final drive, and a crankshaft that runs along the bike instead of across it.' }),
];

export const ENGINE_BY_ID = Object.fromEntries(ENGINES.map(e => [e.id, e]));

/* ---- derived helpers -------------------------------------------------- */

export function displacementL(e){ return e.displacement / 1000; }

export function cylinderVolumeL(e){ return displacementL(e) / (e.kind === 'rotary' ? e.cyl : e.cyl); }

/** Mean piston speed (m/s) — the number that really limits rpm. */
export function pistonSpeed(e, rpm){
  if (e.kind === 'rotary') return 0;
  return (2 * (e.stroke/1000) * rpm) / 60;
}

export function boreStrokeRatio(e){
  return e.kind === 'rotary' ? null : e.bore / e.stroke;
}

export function aspirationLabel(e){
  return { na:'Naturally aspirated', turbo:'Turbocharged', twinturbo:'Twin-turbo',
           quadturbo:'Quad-turbo', supercharged:'Supercharged' }[e.aspiration] || e.aspiration;
}

export function isBoosted(e){ return e.aspiration !== 'na'; }

export function firingOrder(e){
  return FIRING[e.firing] || FIRING['I' + e.cyl] || [...Array(e.cyl)].map((_,i)=>i+1);
}

/** Crank angle between power strokes, in degrees. */
export function firingInterval(e){
  return (360 * e.revsPerCycle) / e.cyl;
}

export function summaryLine(e){
  const bits = [
    `${displacementL(e).toFixed(e.displacement < 1000 ? 3 : 1)} L`,
    e.kind === 'rotary' ? `${e.cyl}-rotor` : layoutName(e),
    aspirationLabel(e),
    `${e.cr.toFixed(1)}:1`,
  ];
  return bits.join(' · ');
}

export function layoutName(e){
  if (e.kind === 'rotary') return `${e.cyl}-rotor Wankel`;
  if (e.layout === 'I') return e.cyl === 1 ? 'Single' : `Inline-${e.cyl}`;
  if (e.layout === 'V') return `V${e.cyl} (${e.bankAngle}°)`;
  if (e.layout === 'F') return `Flat-${e.cyl}`;
  if (e.layout === 'W') return `W${e.cyl}`;
  return e.layout;
}

export function engineGroups(){
  const g = { car:[], bike:[], race:[] };
  for (const e of ENGINES) (g[e.class] || g.car).push(e);
  return g;
}
