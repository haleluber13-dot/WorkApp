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

/* Optional fact fields (absent = unknown/default, never guessed):
 *  vvt        true = cam phasers fitted, false = none (tree adds phasers unless false)
 *  vvl        true = variable lift (VTEC, VarioCam Plus, valvelift)
 *  follower   'bucket' | 'finger' (roller finger follower + HLA) | 'rocker' (shaft rockers)
 *             | 'pushrod' (cam in block, or BMW high-cam short pushrods) | 'desmo'
 *  lash       'hydraulic' when the buckets/rockers self-adjust
 *  springs    'pneumatic' where steel valve springs are replaced
 *  drySump    true = dry sump with scavenge stages and a remote tank
 *  sequential true = sequential twin turbo, false = parallel
 *  intake     'plenum' | 'itb' (one throttle per cylinder) | 'carb' | 'slide' | 'hat'
 *  intercooler 'front' | 'top' | 'side' | 'water' (air-to-water) | 'none'
 *  turboLayout 'singleInline' | 'seqInline' | 'parInline' | 'valley' (hot-V / pedestal)
 *             | 'outboardLow' | 'rearOutboard' | 'boxerRear'
 *  vgt        variable-geometry turbine;  glow / intakeHeater  diesel cold-start aid
 *  crank      'flat' | 'cross' | '270';   rods  'aluminium' where not steel
 *  plugsPerCyl / plugsPerRotor  spark plugs per chamber
 *  gearbox    'integrated' (in the crankcase) | 'separate';  clutch 'wet' | 'dry'
 *  finish     { cover, letters, plenum, block, …hexes } maker signature finish
 *             (realism.md §1.3), finishConfidence 'high' | 'medium' | 'low'
 */
const E = (o) => Object.assign({
  kind:'piston', layout:'I', bankAngle:0, valvesPerCyl:4, cam:'DOHC', revsPerCycle:2,
  aspiration:'na', fuel:'gasoline', class:'car', idle:750, coolant:'water',
  ignition:'coil-on-plug', injection:'port', dryWeight:140, camDrive:'chain',
}, o);

/* firing orders for the common layouts (used by the animator + wiring lesson) */
/* Cylinder numbering is the app's own: on a vee/flat, odd cylinders sit on
   one bank and even on the other, front to back (cylSlot: bank = i % 2).
   That is GM/Ford-Navistar/Subaru numbering, so those orders read exactly as
   published; makers who number one bank then the other (Ferrari, BMW, Ford
   Modular, Porsche) are converted here, so the displayed digits differ from
   the maker's sheet but every cylinder fires at the right moment. */
export const FIRING = {
  I3:[1,3,2], I4:[1,3,4,2], I5:[1,2,4,5,3], I6:[1,5,3,6,2,4],
  V6:[1,4,3,6,5,2],
  V8:[1,8,7,2,6,5,4,3],         // GM LS / Gen V cross-plane
  V8sbc:[1,8,4,3,6,5,7,2],      // classic Chevrolet small- and big-block
  V8psd:[1,2,7,3,4,5,6,8],      // Navistar T444E / 7.3 Power Stroke
  V8ford:[1,5,6,3,4,2,7,8],     // Ford Modular/Coyote 1-3-7-2-6-5-4-8
  V8bmw:[1,8,7,5,4,3,6,2],      // BMW S65 1-5-4-8-7-2-6-3
  V8f:[1,6,5,8,7,4,3,2],        // flat-plane, banks alternate (Ferrari 1-5-3-7-4-8-2-6)
  V10:[1,10,9,4,3,6,5,8,7,2],
  V12:[1,10,9,6,5,12,11,4,3,8,7,2], // even-fire 60° (Ferrari 1-7-5-11-3-9-6-12-2-8-4-10)
  W16:[1,14,9,4,7,12,15,6,13,8,3,16,11,2,5,10], // Bugatti published order
  F4:[1,3,2,4], F6:[1,6,3,2,5,4], // F6 = Porsche 1-6-2-4-3-5
  V2:[1,2], I2:[1,2], I1:[1], V4:[1,3,2,4],
};

export const ENGINES = [
  /* ---------------- everyday & performance cars ---------------- */
  E({ id:'i4-16-na', name:'4A-GE 1.6 DOHC Inline-4', maker:'Toyota', layout:'I', cyl:4,
      displacement:1587, bore:81, stroke:77, cr:10.3, redline:7600, tqPeak:5200, hpPeak:7200,
      firing:'I4', camDrive:'belt', vvt:false, follower:'bucket', ignition:'distributor', intake:'plenum',
      intercooler:'none',
      finish:{ cover:'natural-alu', letters:'paint-red', plenum:'alu-cast', block:'iron', lettersHex:'#B22222' },
      finishConfidence:'high',
      blurb:'The engine most of the world drives. Small bore, long-ish stroke, four valves per cylinder, port injection. The perfect first teardown — everything is where the textbook says it is.' }),

  E({ id:'i4-20-t', name:'K20C1 2.0 VTEC Turbo', maker:'Honda', layout:'I', cyl:4,
      displacement:1996, bore:86, stroke:85.9, cr:9.8, redline:7000, tqPeak:2500, hpPeak:6500,
      aspiration:'turbo', injection:'direct', boostTarget:1.2, spoolRpm:2000, firing:'I4', dryWeight:145,
      vvt:true, vvl:true, follower:'rocker', intake:'plenum', intercooler:'front', turboLayout:'singleInline',
      finish:{ cover:'red', letters:'bare', plenum:'composite-black', block:'alu-die-cast', centre:'black-plastic' },
      finishConfidence:'medium',
      blurb:'Square bore/stroke, a single-scroll turbo fed by an exhaust manifold cast into the head, direct injection. Makes big torque just off idle and is the most common tuning platform on earth.' }),

  E({ id:'i4-20-vtec', name:'F20C 2.0 VTEC', maker:'Honda', layout:'I', cyl:4,
      displacement:1997, bore:87, stroke:84, cr:11.7, redline:9000, tqPeak:7500, hpPeak:8300,
      fuel:'premium', firing:'I4', camProfile:'aggressive', dryWeight:135,
      vvt:false, vvl:true, follower:'rocker', intake:'plenum', intercooler:'none',
      finish:{ cover:'wrinkle-red', letters:'bare', plenum:'alu-cast', block:'alu-frm-lined', centre:'black-plastic' },
      finishConfidence:'high',
      blurb:'11.7:1 compression, individual throttle-friendly head, and a cam profile that does nothing until 5,800 rpm and then eats the rest of the tach.' }),

  E({ id:'i5-25-t', name:'2.5 TFSI Inline-5', maker:'Audi', layout:'I', cyl:5,
      displacement:2480, bore:82.5, stroke:92.8, cr:10.0, redline:7000, tqPeak:2000, hpPeak:6000,
      aspiration:'turbo', injection:'direct', boostTarget:1.4, spoolRpm:1900, firing:'I5', dryWeight:165,
      vvt:true, vvl:true, follower:'finger', intake:'plenum', intercooler:'front', turboLayout:'singleInline',
      finish:{ cover:'plastic-black', letters:'red', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'Odd cylinder count, odd firing interval, unmistakable warble. Longer stroke than bore gives it diesel-like low-end shove.' }),

  E({ id:'i6-30-tt', name:'S58 3.0 Twin-Turbo Inline-6', maker:'BMW', layout:'I', cyl:6,
      displacement:2998, bore:84, stroke:90, cr:9.3, redline:7200, tqPeak:2750, hpPeak:6250,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.3, spoolRpm:1700, firing:'I6', dryWeight:190,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'water', turboLayout:'parInline',
      finish:{ cover:'plastic-black', letters:'m-tricolour', plenum:'composite-a2w', block:'alu-closed-deck', insert:'carbon' },
      finishConfidence:'medium',
      blurb:'Perfectly balanced by geometry — an inline-6 cancels its own primary and secondary forces, which is why it feels turbine-smooth without balance shafts.' }),

  E({ id:'i6-30-legend', name:'2JZ-GTE 3.0 Twin-Turbo', maker:'Toyota', layout:'I', cyl:6,
      camDrive:'belt', vvt:false, pistonJets:true, throttleType:'cable', sequential:true, interference:true,
      displacement:2997, bore:86, stroke:86, cr:8.5, redline:6800, tqPeak:3600, hpPeak:5600,
      aspiration:'twinturbo', boostTarget:0.7, spoolRpm:2600, firing:'I6', dryWeight:230, fuel:'premium',
      follower:'bucket', intake:'plenum', intercooler:'front', turboLayout:'seqInline',
      finish:{ cover:'textured-dark-grey', letters:'bare', plenum:'alu-cast', block:'iron', centre:'black-plastic', hardware:'zincYellow' },
      finishConfidence:'medium',
      blurb:'Closed-deck iron block, forged crank, sequential turbos. Famous because the bottom end will hold roughly triple its factory power before it complains.' }),

  E({ id:'v6-35-na', name:'2GR-FE 3.5 V6', maker:'Toyota', layout:'V', cyl:6, bankAngle:60,
      displacement:3456, bore:94, stroke:83, cr:10.8, redline:6600, tqPeak:4700, hpPeak:6200,
      firing:'V6', dryWeight:175,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'none',
      finish:{ cover:'plastic-black', letters:'silver', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'The default family-car and pickup engine: compact, 60° banks for even firing, chain-driven quad cams and variable valve timing.' }),

  E({ id:'v6-29-tt', name:'F160 2.9 V6 Twin-Turbo', maker:'Alfa Romeo', layout:'V', cyl:6, bankAngle:90,
      displacement:2891, bore:86.5, stroke:82, cr:9.3, redline:7500, tqPeak:2500, hpPeak:6500,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.5, spoolRpm:2100, firing:'V6',
      fuel:'premium', dryWeight:180,
      vvt:true, intake:'plenum', turboLayout:'outboardLow',
      finish:{ cover:'red', letters:'bare', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'One turbo per bank, hung low and outboard of the heads, with the exhaust ports on the outside of the vee — the Ferrari F154 family layout cut down to six cylinders.' }),

  E({ id:'v8-50-ohv', name:'LS3 6.2 Small Block', maker:'GM', layout:'V', cyl:8, bankAngle:90,
      displacement:6162, bore:103.25, stroke:92, cr:10.7, redline:6600, tqPeak:4600, hpPeak:5900,
      cam:'OHV', valvesPerCyl:2, firing:'V8', dryWeight:200,
      vvt:false, follower:'pushrod', intake:'plenum', intercooler:'none',
      finish:{ cover:'black', letters:'none', plenum:'composite-black', block:'alu', coils:'on-cover' },
      finishConfidence:'high',
      blurb:'One cam in the block, pushrods and rockers up top. Physically tiny for its displacement, which is exactly why it ends up in everything.' }),

  E({ id:'v8-62-sc', name:'LT4 6.2 Supercharged V8', maker:'Chevrolet', layout:'V', cyl:8, bankAngle:90,
      displacement:6162, bore:103.25, stroke:92, cr:10.0, redline:6600, tqPeak:3600, hpPeak:6400,
      cam:'OHV', valvesPerCyl:2, aspiration:'supercharged', scType:'roots', boostTarget:0.9,
      firing:'V8', fuel:'premium', dryWeight:245,
      injection:'direct', vvt:true, follower:'pushrod', drySump:true, intake:'plenum', intercooler:'water',
      finish:{ cover:'black', letters:'none', plenum:'blower-black', block:'alu', coils:'side-brackets' },
      finishConfidence:'high',
      blurb:'1.7-litre Eaton TVS blower (a four-lobe Roots type, with water-to-air charge coolers in its lid) sitting in the valley. Positive displacement means full boost at 2,000 rpm — no waiting, ever.' }),

  E({ id:'v8-40-tt', name:'F154 3.9 Twin-Turbo V8', maker:'Ferrari', layout:'V', cyl:8, bankAngle:90,
      displacement:3902, bore:86.5, stroke:83, cr:9.4, redline:8000, tqPeak:3000, hpPeak:8000,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.3, spoolRpm:2000, firing:'V8f',
      fuel:'premium', dryWeight:220,
      crank:'flat', vvt:true, follower:'bucket', drySump:true, intake:'plenum', intercooler:'side',
      turboLayout:'outboardLow',
      finish:{ cover:'red', letters:'bare', plenum:'red', block:'alu', coverHex:'#B0161A' },
      finishConfidence:'medium',
      blurb:'Flat-plane crank, four cams, dry sump. One twin-scroll turbo per bank, hung low and outboard of the heads, with air-to-air intercoolers in the side intakes.' }),

  E({ id:'v8-52-flat', name:'Voodoo 5.2 Flat-Plane V8', maker:'Ford', layout:'V', cyl:8, bankAngle:90,
      displacement:5163, bore:94, stroke:93, cr:12.0, redline:8250, tqPeak:4750, hpPeak:7500,
      firing:'V8f', crank:'flat', fuel:'premium', dryWeight:205,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'none',
      finish:{ cover:'black', letters:'red', plenum:'composite-black', block:'alu' }, finishConfidence:'low',
      blurb:'Flat-plane crank: each bank fires evenly like two inline-4s, so the exhaust note is a shriek instead of a burble. Lighter crank, higher revs, more vibration.' }),

  E({ id:'v10-52-na', name:'5.2 FSI V10', maker:'Audi', layout:'V', cyl:10, bankAngle:90,
      displacement:5204, bore:84.5, stroke:92.8, cr:12.7, redline:8700, tqPeak:6500, hpPeak:8000,
      firing:'V10', fuel:'premium', dryWeight:225,
      vvt:true, follower:'finger', drySump:true, intake:'plenum', intercooler:'none',
      finish:{ cover:'carbon-silver', letters:'silver', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'Ten cylinders, dry sump, 12.7:1 compression. Naturally aspirated response with an 8,700 rpm ceiling — the last of a dying breed.' }),

  E({ id:'v12-65-na', name:'L539 6.5 V12', maker:'Lamborghini', layout:'V', cyl:12, bankAngle:60,
      displacement:6498, bore:95, stroke:76.4, cr:11.8, redline:8500, tqPeak:5500, hpPeak:8250,
      firing:'V12', fuel:'premium', dryWeight:270,
      vvt:true, follower:'bucket', drySump:true, intake:'plenum', intercooler:'none',
      finish:{ cover:'black-grey', letters:'silver', plenum:'carbon', block:'alu', accent:'red' },
      finishConfidence:'medium',
      blurb:'Big bore, short stroke, six cylinders per bank firing every 60° of crank rotation. Torque delivery so continuous it feels electric.' }),

  E({ id:'f4-25-t', name:'EJ257 2.5 Turbo Boxer', maker:'Subaru', layout:'F', cyl:4, bankAngle:180,
      displacement:2457, bore:99.5, stroke:79, cr:8.2, redline:6700, tqPeak:4000, hpPeak:6000,
      aspiration:'turbo', boostTarget:1.0, spoolRpm:2600, firing:'F4', dryWeight:160,
      camDrive:'belt', vvt:true, follower:'bucket', intake:'plenum', intercooler:'top',
      turboLayout:'boxerRear',
      finish:{ cover:'silver-cast', letters:'bare', plenum:'red', block:'alu', intercooler:'silver' },
      finishConfidence:'medium',
      blurb:'Pistons punch outward at each other — low centre of gravity, and unequal-length headers give it that off-beat rumble.' }),

  E({ id:'f6-30-t', name:'9A2 Evo 3.0 Twin-Turbo Flat-Six', maker:'Porsche', layout:'F', cyl:6, bankAngle:180,
      displacement:2981, bore:91, stroke:76.4, cr:10.2, redline:7500, tqPeak:2300, hpPeak:6500,
      aspiration:'twinturbo', injection:'direct', boostTarget:1.1, spoolRpm:1900, firing:'F6',
      fuel:'premium', dryWeight:185,
      vvt:true, vvl:true, follower:'bucket', intake:'plenum', intercooler:'top', turboLayout:'rearOutboard',
      finish:{ cover:'black', letters:'none', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'Flat-6 hung behind the rear axle, dry-sumped so it can sit low. Two small turbos, one per bank, for near-instant response.' }),

  E({ id:'w16-80-qt', name:'8.0 W16 Quad-Turbo', maker:'Bugatti', layout:'W', cyl:16, bankAngle:90,
      displacement:7993, bore:86, stroke:86, cr:9.0, redline:6800, tqPeak:2000, hpPeak:6400,
      aspiration:'quadturbo', injection:'direct', boostTarget:1.9, spoolRpm:1800, firing:'W16',
      fuel:'premium', dryWeight:400,
      vvt:true, drySump:true, intake:'plenum', intercooler:'water',
      finish:{ cover:'black-carbon', letters:'chrome-blue', plenum:'carbon', block:'alu' },
      finishConfidence:'medium',
      blurb:'Two narrow-angle V8s on a common crank, four turbochargers and ten radiators. Included mostly so you can see what "too much" looks like in 3D.' }),

  /* ---------------- rotary ---------------- */
  E({ id:'rotary-13b-t', name:'13B-REW Twin-Turbo Rotary', maker:'Mazda', kind:'rotary', layout:'rotary', modelFit:{ scale:0.62, lift:-0.06 },
      cyl:2, displacement:1308, chamberCc:654, cr:9.0, redline:8000, tqPeak:5000, hpPeak:6500,
      aspiration:'twinturbo', revsPerCycle:1, cam:'none', valvesPerCyl:0, boostTarget:0.7, spoolRpm:2800,
      fuel:'premium', dryWeight:125, idle:900, ports:'peripheral-exhaust, side-intake',
      sequential:true, vvt:false, plugsPerRotor:2, intercooler:'front', turboLayout:'seqInline',
      finish:{ cover:'silver-housings', letters:'none', plenum:'black', block:'iron-end-plates' },
      finishConfidence:'medium',
      blurb:'No pistons, no valves, no camshaft. Three-sided rotors orbit an eccentric shaft; each rotor face does intake, compression, power and exhaust once per eccentric-shaft revolution.' }),

  E({ id:'rotary-20b', name:'20B-REW 3-Rotor', maker:'Mazda', kind:'rotary', layout:'rotary',
      cyl:3, displacement:1962, chamberCc:654, cr:9.0, redline:7000, tqPeak:5200, hpPeak:6500,
      aspiration:'twinturbo', revsPerCycle:1, cam:'none', valvesPerCyl:0, boostTarget:0.8, spoolRpm:2900,
      fuel:'premium', dryWeight:155, idle:950,
      sequential:true, vvt:false, plugsPerRotor:2, intercooler:'front', turboLayout:'seqInline',
      finish:{ cover:'silver-housings', letters:'none', plenum:'black', block:'iron-end-plates' },
      finishConfidence:'medium',
      blurb:'Three rotors on one eccentric shaft. Overlapping power pulses make it sound like a two-stroke jet — and it will still fit under a low bonnet.' }),

  /* ---------------- diesel & trucks ---------------- */
  E({ id:'d-i4-20', name:'EA288 2.0 TDI', maker:'Volkswagen', layout:'I', cyl:4,
      displacement:1968, bore:81, stroke:95.5, cr:16.2, redline:4800, tqPeak:1900, hpPeak:4000,
      aspiration:'turbo', fuel:'diesel', injection:'common-rail', boostTarget:1.5, spoolRpm:1500,
      firing:'I4', idle:800, glow:true, dryWeight:170,
      camDrive:'belt', vvt:false, follower:'finger', vgt:true, intercooler:'water',
      turboLayout:'singleInline',
      finish:{ cover:'plastic-black', letters:'TDI', plenum:'composite-a2w', block:'iron' },
      finishConfidence:'medium',
      blurb:'Compression ignition — no spark plugs at all. 16.2:1 squeeze lights the fuel, a variable-geometry turbo keeps it awake, and 1,800 bar common rail meters the diesel.' }),

  E({ id:'d-i6-67', name:'6.7 ISB Turbo Diesel', maker:'Cummins', layout:'I', cyl:6,
      displacement:6690, bore:107, stroke:124, cr:17.3, redline:3400, tqPeak:1800, hpPeak:2800,
      aspiration:'turbo', fuel:'diesel', injection:'common-rail', boostTarget:1.9, spoolRpm:1500,
      firing:'I6', idle:700, glow:false, valvesPerCyl:4, cam:'OHV', dryWeight:450,
      intakeHeater:true, camDrive:'gear', vvt:false, follower:'pushrod', vgt:true, intercooler:'front',
      turboLayout:'singleInline',
      finish:{ cover:'beige', letters:'none', plenum:'iron', block:'iron-painted', coverHex:'#CDBB97' },
      finishConfidence:'medium',
      blurb:'Cast-iron everything, six head bolts per cylinder, torque measured in four figures. This is the pickup/heavy-truck workhorse.' }),

  E({ id:'d-v8-66', name:'Power Stroke 7.3 V8', maker:'Ford', layout:'V', cyl:8, bankAngle:90,
      displacement:7270, bore:104.4, stroke:106.2, cr:17.5, redline:3600, tqPeak:1600, hpPeak:2800,
      aspiration:'turbo', fuel:'diesel', injection:'heui', boostTarget:1.7, spoolRpm:1500,
      firing:'V8psd', idle:680, glow:true, valvesPerCyl:2, cam:'OHV', dryWeight:470,
      camDrive:'gear', vvt:false, follower:'pushrod', vgt:false, turboLayout:'valley', intercooler:'front',
      finish:{ cover:'black', letters:'none', plenum:'iron', block:'iron-painted' }, finishConfidence:'low',
      blurb:'Two valves per cylinder, HEUI injectors fired by engine oil pressurised to about 3,000 psi, one big wastegated turbo on a pedestal in the valley, and enough low-end torque to bend driveshafts.' }),

  E({ id:'v8-70-bb', name:'427 Big-Block (L88)', maker:'Chevrolet', layout:'V', cyl:8, bankAngle:90,
      displacement:7000, bore:108, stroke:95.5, cr:12.5, redline:6000, tqPeak:4000, hpPeak:5200,
      cam:'OHV', valvesPerCyl:2, ignition:'distributor', injection:'carburettor', firing:'V8sbc',
      fuel:'race', dryWeight:290, idle:850,
      vvt:false, follower:'pushrod', intake:'carb', intercooler:'none',
      finish:{ cover:'finned-alu', letters:'cast', plenum:'alu', block:'iron-orange', blockHex:'#D9531E', heads:'alu-bare' },
      finishConfidence:'medium',
      blurb:'Cast-iron block, aluminium heads, 12.5:1 compression, a single four-barrel carburettor and a transistorised distributor. Learn ignition timing here — you set it with a timing light, not a laptop.' }),

  E({ id:'v8-57-sb', name:'350 Small-Block', maker:'Chevrolet', layout:'V', cyl:8, bankAngle:90,
      displacement:5735, bore:101.6, stroke:88.4, cr:9.0, redline:5800, tqPeak:3200, hpPeak:4800,
      cam:'OHV', valvesPerCyl:2, ignition:'distributor', injection:'carburettor', firing:'V8sbc',
      dryWeight:250, idle:800,
      vvt:false, follower:'pushrod', intake:'carb', intercooler:'none',
      finish:{ cover:'chrome', letters:'script', plenum:'iron-orange', block:'iron-orange', blockHex:'#D9531E' },
      finishConfidence:'high',
      blurb:'The most-built V8 in history. Simple enough to rebuild on a kitchen table and the reason "swap a small-block into it" is a complete sentence.' }),

  /* ---------------- race ---------------- */
  E({ id:'race-16-v6h', name:'1.6 V6 Turbo Hybrid Power Unit', maker:'Formula 1', layout:'V', cyl:6, bankAngle:90,
      displacement:1600, bore:80, stroke:53, cr:14.0, redline:15000, tqPeak:10500, hpPeak:12500,
      aspiration:'turbo', injection:'direct', boostTarget:2.6, spoolRpm:5000, firing:'V6',
      fuel:'race', class:'race', idle:4000, valvetrain:'pneumatic', hybrid:true, dryWeight:145,
      fuelFlowMaxKgH:100, mguKw:120, preChamber:true,
      vvt:false, follower:'finger', springs:'pneumatic', drySump:true,
      finish:{ cover:'carbon', letters:'none', plenum:'carbon', block:'alu', heatFoil:'gold' },
      finishConfidence:'high',
      blurb:'Pneumatic valve springs, 500 bar direct injection, a single turbo split across the V with an electric motor on the shaft. Pre-chamber combustion pushes thermal efficiency past 50%.' }),

  E({ id:'race-20-rally', name:'2.0 Turbo Rally (anti-lag)', maker:'Group A', layout:'I', cyl:4,
      displacement:1998, bore:85, stroke:88, cr:8.5, redline:8000, tqPeak:3500, hpPeak:6500,
      aspiration:'turbo', boostTarget:2.5, spoolRpm:2500, firing:'I4', fuel:'race', class:'race',
      antilag:true, restrictor:34, dryWeight:150,
      vvt:false, intercooler:'front', turboLayout:'singleInline',
      blurb:'34 mm inlet restrictor, anti-lag that dumps fuel into the exhaust manifold to keep the turbine spinning off-throttle, and a gearbox that shifts flat.' }),

  E({ id:'race-58-stock', name:'FR9 5.9 NASCAR V8', maker:'Ford', layout:'V', cyl:8, bankAngle:90,
      displacement:5860, bore:104.8, stroke:85, cr:12.0, redline:9000, tqPeak:7500, hpPeak:8800,
      cam:'OHV', valvesPerCyl:2, firing:'V8', fuel:'race', class:'race', injection:'port',
      dryWeight:210, idle:1200,
      vvt:false, follower:'pushrod', drySump:true, intake:'plenum', intercooler:'none',
      finish:{ cover:'black-billet', letters:'none', plenum:'alu-cast', block:'iron' },
      finishConfidence:'low',
      blurb:'Pushrods at 9,000 rpm. Roller lifters, shaft rockers, a dry sump and a single four-barrel-sized throttle body — built to run flat out for 500 miles.' }),

  E({ id:'race-82-nitro', name:'500ci Supercharged Nitro Hemi', maker:'Top Fuel', layout:'V', cyl:8, bankAngle:90,
      displacement:8130, bore:106.4, stroke:114.3, cr:6.5, redline:8400, tqPeak:7000, hpPeak:8000,
      cam:'OHV', valvesPerCyl:2, aspiration:'supercharged', scType:'roots', boostTarget:4.0,
      fuel:'nitro', class:'race', ignition:'dual-mag', dryWeight:290, idle:2400,
      injection:'mechanical', rods:'aluminium', plugsPerCyl:2, vvt:false, follower:'pushrod', drySump:true,
      intake:'hat',
      finish:{ cover:'billet-alu', letters:'none', plenum:'magnesium-hat', block:'billet-alu', blower:'polished', hardware:'gold-anodised' },
      finishConfidence:'high',
      blurb:'Billet aluminium hemi, 14-71 roots blower at 60% overdrive, two magnetos firing 44 amps, and enough nitromethane to make 11,000 hp for four seconds at a time.' }),

  /* ---------------- motorcycles ---------------- */
  E({ id:'m-i4-1000', name:'CBR1000RR 1.0 Inline-4', maker:'Honda', layout:'I', cyl:4,
      displacement:999, bore:76, stroke:55, cr:13.0, redline:14500, tqPeak:11000, hpPeak:13000,
      firing:'I4', class:'bike', fuel:'premium', idle:1300, dryWeight:58, coolant:'water',
      vvt:false, follower:'bucket', intake:'itb', gearbox:'integrated', clutch:'wet',
      finish:{ cover:'satin-black', letters:'none', plenum:'airbox', block:'alu', cases:'black-polished' },
      finishConfidence:'medium',
      blurb:'Bore nearly 40% larger than the stroke, titanium valves, and a gearbox in the same casting as the crankcase. Revs to 14,500 all day.' }),

  E({ id:'m-v4-1100', name:'Desmosedici Stradale 1.1 V4', maker:'Ducati', layout:'V', cyl:4, bankAngle:90,
      displacement:1103, bore:81, stroke:53.5, cr:14.0, redline:14500, tqPeak:10000, hpPeak:13000,
      firing:'V4', class:'bike', fuel:'premium', idle:1400, dryWeight:66, valvetrain:'desmodromic',
      vvt:false, follower:'desmo', intake:'itb', gearbox:'integrated', clutch:'wet',
      finish:{ cover:'black-red', letters:'red', plenum:'black', block:'alu', cases:'silver-black' },
      finishConfidence:'medium',
      blurb:'90° V4 with a counter-rotating crank and desmodromic valve actuation — cams close the valves mechanically instead of relying on springs.' }),

  E({ id:'m-vtwin-1200', name:'Evolution 1200 Air-Cooled V-Twin', maker:'Harley-Davidson', layout:'V', cyl:2, bankAngle:45,
      displacement:1202, bore:88.9, stroke:96.8, cr:10.0, redline:5800, tqPeak:3000, hpPeak:5200,
      cam:'OHV', valvesPerCyl:2, firing:'V2', class:'bike', coolant:'air', idle:1000, dryWeight:75,
      injection:'carburettor', ignition:'wasted-spark', camDrive:'gear', vvt:false, follower:'pushrod',
      drySump:true, intake:'carb', gearbox:'integrated', clutch:'wet',
      finish:{ cover:'chrome', letters:'none', plenum:'chrome-air-cleaner', block:'alu', fins:'polished', barrels:'black' },
      finishConfidence:'high',
      blurb:'Two cylinders sharing one crankpin at 45°, air-cooled fins, pushrods in chrome tubes. The uneven firing interval is the whole point.' }),

  E({ id:'m-ptwin-900', name:'Bonneville 900 Parallel-Twin', maker:'Triumph', layout:'I', cyl:2,
      displacement:900, bore:84.6, stroke:80, cr:11.0, redline:7700, tqPeak:3800, hpPeak:7500,
      firing:'I2', class:'bike', idle:1200, dryWeight:52, crank:'270',
      cam:'SOHC', vvt:false, gearbox:'integrated', clutch:'wet',
      finish:{ cover:'black', letters:'silver', plenum:'bean-can-tb', block:'alu' },
      finishConfidence:'medium',
      blurb:'A 270° crank makes a parallel-twin fire like a 90° V-twin — same lopsided character, far simpler packaging.' }),

  E({ id:'m-triple-765', name:'765 Street Triple Inline-3', maker:'Triumph', layout:'I', cyl:3,
      displacement:765, bore:78, stroke:53.4, cr:12.9, redline:12500, tqPeak:9500, hpPeak:11750,
      firing:'I3', class:'bike', fuel:'premium', idle:1250, dryWeight:50,
      vvt:false, follower:'bucket', intake:'itb', gearbox:'integrated', clutch:'wet',
      finish:{ cover:'black', letters:'silver', plenum:'airbox', block:'alu' }, finishConfidence:'medium',
      blurb:'Three cylinders split the difference: the low-end torque of a twin, the top-end of a four, and a firing interval that howls.' }),

  E({ id:'m-single-450', name:'CRF450R 450 Single', maker:'Honda', layout:'I', cyl:1,
      displacement:449, bore:96, stroke:62.1, cr:13.5, redline:11000, tqPeak:7000, hpPeak:9000,
      firing:'I1', class:'bike', fuel:'premium', idle:1900, dryWeight:29, valvesPerCyl:4,
      cam:'SOHC', valvetrain:'finger-follower',
      vvt:false, follower:'finger', intake:'itb', gearbox:'integrated', clutch:'wet',
      finish:{ cover:'satin-black', letters:'none', plenum:'airbox', block:'alu' }, finishConfidence:'medium',
      blurb:'One enormous 96 mm piston, a titanium con-rod and a five-day service interval if you race it. The simplest complete four-stroke you can study.' }),


  /* ---------------- the ones people actually name ----------------
     Real engines, specified from their published bore, stroke, compression
     ratio and rev limit. The geometry builder derives the model from those
     numbers, so an engine that revs to 9,000 gets a short stroke here and a
     short stroke on screen. Names are used to identify the engineering; no
     manufacturer is affiliated with or endorses this app. */

  E({ id:'bmw-s54', name:'S54B32 3.2 Inline-6', maker:'BMW', layout:'I', cyl:6,
      displacement:3246, bore:87, stroke:91, cr:11.5, redline:8000, tqPeak:4900, hpPeak:7900,
      firing:'I6', fuel:'premium', dryWeight:191, valvetrain:'double-VANOS', idle:900,
      vvt:true, follower:'bucket', intake:'itb', intercooler:'none',
      finish:{ cover:'wrinkle-silver', letters:'bare', plenum:'composite-black', block:'iron', tricolour:'#0066B1 #1C3E94 #E22718' },
      finishConfidence:'medium',
      blurb:'Six individual throttle butterflies, one per cylinder, on a naturally aspirated iron-linered straight six that revs to 8,000. No plenum means no shared pressure wave between cylinders — throttle response is instant and each runner can be tuned on its own. Double-VANOS swings both cams. 100 hp per litre without a turbo, in 2000.' }),

  E({ id:'bmw-s65', name:'S65B40 4.0 V8', maker:'BMW', layout:'V', cyl:8, bankAngle:90,
      displacement:3999, bore:92, stroke:75.2, cr:12.0, redline:8400, tqPeak:3900, hpPeak:8300,
      firing:'V8bmw', fuel:'premium', dryWeight:202, valvetrain:'double-VANOS', idle:900,
      crank:'cross', vvt:true, follower:'bucket', intake:'itb', intercooler:'none',
      finish:{ cover:'wrinkle-grey', letters:'bare', plenum:'carbon', block:'alu', tricolour:'#0066B1 #1C3E94 #E22718' },
      finishConfidence:'medium',
      blurb:'A cross-plane V8 derived from the S85 V10, with eight individual throttles and an 8,400 rpm limit. The cross-plane crank fires each bank unevenly, so the exhaust note keeps a V8 burble under the scream, and the banks are joined by a crossover to even out the pulses.' }),

  E({ id:'mazda-r26b', name:'R26B 2.6 Four-Rotor', maker:'Mazda', kind:'rotary', layout:'rotary',
      cyl:4, displacement:2616, chamberCc:654, cr:10.0, redline:9000, tqPeak:6500, hpPeak:9000,
      aspiration:'na', revsPerCycle:1, cam:'none', valvesPerCyl:0, fuel:'race', class:'race',
      ignition:'triple-plug', injection:'port', firing:'I4', idle:1400, dryWeight:180,
      plugsPerRotor:3, ports:'peripheral-intake, peripheral-exhaust', vvt:false, drySump:true, intake:'itb',
      intercooler:'none',
      finish:{ cover:'silver-housings', letters:'none', plenum:'trumpets', block:'iron-end-plates' },
      finishConfidence:'medium',
      blurb:'Four rotors, three spark plugs each, continuously variable intake trumpets, and the only non-piston engine ever to win Le Mans outright. No valves, no camshaft, no reciprocating mass at all — just four eccentric lobes and a scream that carries across a circuit.' }),

  E({ id:'maserati-nettuno', name:'Nettuno 3.0 V6 Twin-Turbo', maker:'Maserati', layout:'V', cyl:6,
      bankAngle:90, displacement:3000, bore:88, stroke:82, cr:11.0, redline:8000, tqPeak:3000,
      hpPeak:7500, aspiration:'twinturbo', injection:'direct', boostTarget:2.0, spoolRpm:2200,
      firing:'V6', fuel:'premium', dryWeight:190, ignition:'pre-chamber', idle:800,
      vvt:true, drySump:true, plugsPerCyl:2, intake:'plenum', turboLayout:'outboardLow',
      finish:{ cover:'red', letters:'grey', plenum:'composite-black', block:'alu', insert:'carbon' },
      finishConfidence:'medium',
      blurb:'A pre-chamber taken straight off a Formula 1 power unit: a spark plug inside a tiny pre-chamber lights the mixture there, which jets burning gas through six holes into the main chamber and lights it from six places at once. That lets 11:1 compression live with two bar of boost — 210 hp per litre from three litres.' }),

  E({ id:'maserati-f136', name:'F136 4.7 V8', maker:'Maserati', layout:'V', cyl:8, bankAngle:90,
      displacement:4691, bore:94, stroke:84.5, cr:11.3, redline:7600, tqPeak:4750, hpPeak:7000,
      firing:'V8', fuel:'premium', dryWeight:184, idle:850,
      crank:'cross', vvt:true, follower:'bucket', intake:'plenum', intercooler:'none',
      finish:{ cover:'red', letters:'trident', plenum:'alu-cast', block:'alu' }, finishConfidence:'medium',
      blurb:'A cross-plane, wet-sump V8 from the Ferrari-built F136 family, with a butterfly valve in the exhaust that opens above 3,000 rpm and turns a grand tourer into something else entirely. Naturally aspirated, wet-linered, and built when the answer to more power was still more revs.' }),

  E({ id:'toyota-1lr', name:'1LR-GUE 4.8 V10', maker:'Toyota', layout:'V', cyl:10, bankAngle:72,
      displacement:4805, bore:88, stroke:79, cr:12.0, redline:9000, tqPeak:6800, hpPeak:8700,
      firing:'V10', fuel:'premium', dryWeight:140, idle:1000, valvetrain:'titanium',
      vvt:true, follower:'finger', drySump:true, intake:'itb', intercooler:'none',
      finish:{ cover:'wrinkle-black', letters:'red', plenum:'carbon', block:'alu' },
      finishConfidence:'medium',
      blurb:'A 72° V10 with titanium valves and rods, a dry sump, and so little rotating inertia that it climbs from idle to 9,000 rpm in six-tenths of a second — faster than an analogue tacho needle can follow, which is why the car it went in had a digital one. Built with an acoustics company involved in the intake design.' }),

  E({ id:'ford-coyote', name:'Coyote 5.0 DOHC V8', maker:'Ford', layout:'V', cyl:8, bankAngle:90,
      displacement:5038, bore:93, stroke:92.7, cr:12.0, redline:7500, tqPeak:4600, hpPeak:7000,
      firing:'V8ford', fuel:'premium', dryWeight:198, injection:'direct', idle:700,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'none',
      finish:{ cover:'black', letters:'silver', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'Four camshafts and thirty-two valves on an American V8 that is still nearly square, with twin independent variable cam timing on all four cams. A cross-plane crank keeps the traditional lope; the DOHC heads let it rev to 7,500 anyway.' }),

  E({ id:'ford-ecoboost-35', name:'3.5 EcoBoost Twin-Turbo V6', maker:'Ford', layout:'V', cyl:6,
      bankAngle:60, displacement:3497, bore:92.5, stroke:86.7, cr:10.5, redline:7000, tqPeak:3500,
      hpPeak:6250, aspiration:'twinturbo', injection:'direct', boostTarget:1.6, spoolRpm:1750,
      firing:'V6', fuel:'premium', dryWeight:200, idle:700,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'front', turboLayout:'outboardLow',
      finish:{ cover:'plastic-black', letters:'silver', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'A truck engine that went to Le Mans and won its class. Two turbos, direct injection and an aluminium block with cast-iron liners, tuned one way for towing torque at 1,750 rpm and another way for 24 hours flat out.' }),

  E({ id:'ford-dfv', name:'Cosworth DFV 3.0 V8', maker:'Ford', layout:'V', cyl:8, bankAngle:90,
      displacement:2993, bore:85.7, stroke:64.8, cr:11.0, redline:10500, tqPeak:8500, hpPeak:9000,
      firing:'V8f', fuel:'race', class:'race', dryWeight:168, idle:3500, ignition:'distributor',
      injection:'mechanical', valvetrain:'flat-tappet',
      crank:'flat', plugsPerCyl:1, camDrive:'gear', vvt:false, follower:'bucket', drySump:true,
      intake:'slide', intercooler:'none',
      finish:{ cover:'magnesium-black', letters:'COSWORTH', plenum:'slide-polished-trumpets', block:'alu' },
      finishConfidence:'high',
      blurb:'Double Four Valve: the engine that won 155 Grands Prix and made the modern racing car possible, because it was the first to be designed as a structural member — the gearbox bolts to its back and the rear suspension to the gearbox, so the chassis simply stops behind the driver. Flat-plane crank, gear-driven cams, 3.0 litres, 10,500 rpm in 1967.' }),

  E({ id:'nissan-rb26', name:'RB26DETT 2.6 Twin-Turbo', maker:'Nissan', layout:'I', cyl:6,
      displacement:2568, bore:86, stroke:73.7, cr:8.5, redline:8000, tqPeak:4400, hpPeak:6800,
      aspiration:'twinturbo', boostTarget:0.7, spoolRpm:3000, firing:'I6', fuel:'premium',
      dryWeight:250, idle:900,
      camDrive:'belt', vvt:false, sequential:false, follower:'bucket', intake:'itb', intercooler:'front',
      turboLayout:'parInline',
      finish:{ cover:'wrinkle-red', letters:'bare', plenum:'alu-cast', block:'iron', coverHex:'#A51C17', centre:'black-plate', hardware:'zincYellow' },
      finishConfidence:'medium',
      blurb:'Six individual throttle bodies on a turbocharged straight six — a combination almost nobody else built, because it costs a plenum’s worth of packaging to gain throttle response a turbo engine is not supposed to have. Iron block, forged crank, and parallel rather than sequential turbos.' }),

  E({ id:'nissan-vr38', name:'VR38DETT 3.8 Twin-Turbo V6', maker:'Nissan', layout:'V', cyl:6,
      bankAngle:60, displacement:3799, bore:95.5, stroke:88.4, cr:9.0, redline:7000, tqPeak:3200,
      hpPeak:6400, aspiration:'twinturbo', boostTarget:0.95, spoolRpm:2400, firing:'V6',
      fuel:'premium', dryWeight:275, injection:'port', idle:800,
      vvt:true, intake:'plenum', intercooler:'front', turboLayout:'outboardLow',
      finish:{ cover:'black-grey', letters:'builder-plaque', plenum:'alu-cast', block:'alu' },
      finishConfidence:'medium',
      blurb:'Plasma-sprayed bores instead of iron liners — molten metal blown onto the aluminium as a 0.15 mm coating, lighter and better at shedding heat than a pressed-in sleeve. Each engine is hand-built by one person in a clean room, with their name on a plaque.' }),

  E({ id:'ferrari-f140', name:'F140 6.5 V12', maker:'Ferrari', layout:'V', cyl:12, bankAngle:65,
      displacement:6496, bore:94, stroke:78, cr:13.6, redline:8900, tqPeak:7000, hpPeak:8500,
      firing:'V12', fuel:'premium', dryWeight:225, injection:'direct', idle:900,
      vvt:true, follower:'bucket', drySump:true, intake:'plenum', intercooler:'none',
      finish:{ cover:'crackle-red', letters:'bare', plenum:'composite-black-red', block:'alu', coverHex:'#B0161A' },
      finishConfidence:'high',
      blurb:'Twelve cylinders at 65°, 13.6:1 compression, 350 bar direct injection and a variable-geometry intake with runners that physically change length as the revs rise. Naturally aspirated, 8,900 rpm, and the last of a line that has not been interrupted since 1947.' }),

  E({ id:'porsche-mezger', name:'Mezger 3.6 Turbo Flat-Six', maker:'Porsche', layout:'F', cyl:6,
      bankAngle:180, displacement:3600, bore:100, stroke:76.4, cr:9.0, redline:6750, tqPeak:2200,
      hpPeak:6000, aspiration:'twinturbo', boostTarget:1.0, spoolRpm:2000, firing:'F6',
      fuel:'premium', dryWeight:210, coolant:'water', idle:800,
      vvt:true, vvl:true, follower:'bucket', drySump:true, vgt:true, intake:'plenum', intercooler:'side',
      turboLayout:'rearOutboard',
      finish:{ cover:'crinkle-grey', letters:'PORSCHE', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'The crankcase from a Le Mans winner, kept in production long after the road engines moved on because nothing else would take the boost. Dry sump, water-cooled heads on an air-cooled architecture, and variable-geometry turbochargers on a petrol engine — a trick everyone said could not survive exhaust temperatures.' }),

  E({ id:'merc-m178', name:'M178 4.0 Twin-Turbo V8', maker:'Mercedes-AMG', layout:'V', cyl:8,
      bankAngle:90, displacement:3982, bore:83, stroke:92, cr:10.5, redline:7200, tqPeak:1750,
      hpPeak:6250, aspiration:'twinturbo', injection:'direct', boostTarget:1.4, spoolRpm:1750,
      firing:'V8', fuel:'premium', dryWeight:209, idle:650,
      vvt:true, follower:'finger', drySump:true, intake:'plenum', intercooler:'water', turboLayout:'valley',
      finish:{ cover:'black-grey', letters:'builder-plaque', plenum:'composite-black', block:'alu', trim:'carbon' },
      finishConfidence:'high',
      blurb:'A long-stroke twin-turbo V8 with Nanoslide bores — iron sprayed onto the aluminium and then honed until the surface is a network of oil-holding pores. Dry sumped so it can sit low in the chassis, and built one engine to one engineer.' }),

  E({ id:'honda-c30a', name:'C30A 3.0 V6 VTEC', maker:'Honda', layout:'V', cyl:6, bankAngle:90,
      displacement:2977, bore:90, stroke:78, cr:10.2, redline:8000, tqPeak:5300, hpPeak:7100,
      firing:'V6', fuel:'premium', dryWeight:184, idle:800, valvetrain:'VTEC',
      ignition:'distributor', camDrive:'belt', vvt:false, vvl:true, follower:'rocker', intake:'plenum',
      intercooler:'none', finish:{ cover:'wrinkle-black', letters:'red', plenum:'alu-cast', block:'alu' },
      finishConfidence:'low',
      blurb:'Titanium connecting rods in a road car, in 1990, because the engineers wanted 8,000 rpm and the steel rods would not allow it. All-aluminium, VTEC on both banks, and light enough that the whole car came in under 1,400 kg.' }),

  E({ id:'mazda-bp', name:'BP-ZE 1.8 DOHC', maker:'Mazda', layout:'I', cyl:4,
      displacement:1839, bore:83, stroke:85, cr:9.0, redline:7000, tqPeak:5000, hpPeak:6500,
      firing:'I4', dryWeight:118, idle:850,
      camDrive:'belt', vvt:false, follower:'bucket', lash:'hydraulic', intake:'plenum', intercooler:'none',
      finish:{ cover:'black', letters:'red', plenum:'alu-cast', block:'iron' }, finishConfidence:'low',
      blurb:'A small, light, utterly conventional twin-cam four whose whole job is to be reliable and to sound eager. Short intake runners, a light flywheel and an exhaust tuned by ear as much as by flow bench — proof that a chassis lesson does not need 500 hp.' }),


  E({ id:'toyota-g16e', name:'G16E-GTS 1.6 Turbo Inline-3', maker:'Toyota', layout:'I', cyl:3,
      displacement:1618, bore:87.5, stroke:89.7, cr:10.5, redline:6500, tqPeak:3000, hpPeak:6500,
      aspiration:'turbo', injection:'direct', boostTarget:1.75, spoolRpm:2000, firing:'I3',
      fuel:'premium', dryWeight:126, idle:800,
      vvt:true, follower:'finger', intake:'plenum', intercooler:'front', turboLayout:'singleInline',
      finish:{ cover:'plastic-black', letters:'red', plenum:'composite-black', block:'alu' },
      finishConfidence:'medium',
      blurb:'Three cylinders, one single-scroll turbo and 1.6 litres making the specific output of a race engine. Odd cylinder counts have an inherent rocking couple, so it runs a balance shaft; the payoff is one fewer cylinder of friction and a very short, very stiff crank.' }),

  E({ id:'porsche-9a1-gt3', name:'9A1 4.0 Flat-Six (GT3)', maker:'Porsche', layout:'F', cyl:6,
      bankAngle:180, displacement:3996, bore:102, stroke:81.5, cr:13.3, redline:9000, tqPeak:6100,
      hpPeak:8400, firing:'F6', fuel:'premium', dryWeight:180, coolant:'water', idle:900,
      injection:'direct', valvetrain:'rocker-arm',
      vvt:true, follower:'finger', drySump:true, intake:'itb', intercooler:'none',
      finish:{ cover:'black', letters:'PORSCHE', plenum:'carbon', block:'alu' }, finishConfidence:'medium',
      blurb:'Six individual throttle bodies, a rigid rocker-arm valvetrain instead of buckets, a dry sump with seven scavenge stages, and a 9,000 rpm limit on a road car with a warranty. The crankcase and crank come from the endurance racing version, not the other way round.' }),

  E({ id:'m-flat2-1200', name:'R1200 Boxer Twin', maker:'BMW', layout:'F', cyl:2, bankAngle:180,
      displacement:1170, bore:101, stroke:73, cr:12.5, redline:9000, tqPeak:6250, hpPeak:7750,
      firing:'I2', class:'bike', idle:1100, dryWeight:65, coolant:'air-oil',
      cam:'SOHC', follower:'pushrod', vvt:false, intake:'itb', gearbox:'separate', clutch:'dry',
      finish:{ cover:'silver', letters:'BMW', plenum:'none', block:'alu', cases:'silver' },
      finishConfidence:'medium',
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
