/* MotorLab — procedural part tree.
 * Given an engine spec we generate the full assembly graph: every part, what
 * must be bolted on before it, its fastener count, torque sequence and the
 * reason it matters. This is what makes the teardown work for all 35 engines
 * without hand-authoring 35 trees.
 */

export const GROUPS = [
  { id:'block',       name:'Block & bottom end',   order:1 },
  { id:'rotating',    name:'Rotating assembly',    order:2 },
  { id:'lube',        name:'Lubrication',          order:3 },
  { id:'head',        name:'Cylinder head',        order:4 },
  { id:'valvetrain',  name:'Valvetrain',           order:5 },
  { id:'timing',      name:'Timing drive',         order:6 },
  { id:'induction',   name:'Induction & boost',    order:7 },
  { id:'fuel',        name:'Fuel system',          order:8 },
  { id:'ignition',    name:'Ignition',             order:9 },
  { id:'exhaust',     name:'Exhaust',              order:10 },
  { id:'cooling',     name:'Cooling',              order:11 },
  { id:'accessory',   name:'Accessories & drive',  order:12 },
  { id:'sensors',     name:'Sensors & management', order:13 },
];
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map(g => [g.id, g]));

/* fastener sizing from bore — bigger bore, bigger bolts, more clamp load */
function boltSpecs(e){
  const b = e.kind === 'rotary' ? 90 : e.bore;
  const heavy = e.fuel === 'diesel' || e.class === 'race' || e.displacement > 5500;
  const mainSize   = b >= 100 ? 'M12' : b >= 88 ? 'M11' : 'M10';
  const headSize   = b >= 100 ? 'M12' : b >= 85 ? 'M11' : 'M10';
  const scale = heavy ? 1.45 : 1.0;
  return {
    main: { size:mainSize, nm: Math.round((b >= 100 ? 90 : b >= 88 ? 75 : 60) * scale), angle: 60 },
    rod:  { size:b >= 100 ? 'M10' : 'M9', nm: Math.round((b >= 100 ? 45 : 35) * scale), angle: 60 },
    head: { size:headSize, nm: Math.round((b >= 100 ? 60 : 45) * scale), angle: e.fuel === 'diesel' ? 180 : 150, tty:true },
    cam:  { size:'M6', nm: 12 },
    small:{ size:'M6', nm: 10 },
    med:  { size:'M8', nm: 25 },
  };
}

const P = (o) => Object.assign({ group:'block', qty:1, deps:[], removable:true }, o);

/** Bolt pattern used for the torque mini-game. */
function pattern(kind, count){ return { kind, count }; }

export function buildPartTree(e, opts = {}){
  const tree = e.kind === 'rotary' ? rotaryTree(e) : pistonTree(e);
  /* An imported model is fitted over the finished engine as a shell. It is the
     last thing on and the first thing off, so you can look at the real object
     and then lift it away to work on the one underneath. */
  if (opts.shell && !tree.byId.shell){
    const p = { id:'shell', name:'Imported model shell', group:'accessory', qty:1,
      deps:[], blocks:[], mesh:'body', step:tree.order.length,
      teach:'Your own model, sized to this engine and laid over it. Everything beneath it is the generated engine with every part still where it belongs — take the shell off and the whole teardown works exactly as before.' };
    tree.parts.push(p); tree.byId.shell = p; tree.order.push('shell');
    if (!tree.groups.some(g => g.id === 'accessory'))
      tree.groups = GROUPS.filter(g => tree.parts.some(q => q.group === g.id));
  }
  return tree;
}

/* ====================================================================== */
/* piston engines                                                          */
/* ====================================================================== */
function pistonTree(e){
  const B = boltSpecs(e);
  const banks   = (e.layout === 'V' || e.layout === 'F') ? 2 : (e.layout === 'W' ? 4 : 1);
  const heads   = (e.layout === 'V' || e.layout === 'F') ? 2 : 1;   // W16 shares 2 heads
  const perHead = Math.ceil(e.cyl / heads);
  const ohv     = e.cam === 'OHV';
  const cams    = ohv ? 1 : (e.cam === 'SOHC' ? heads : heads * 2);
  const nMains  = e.layout === 'V' || e.layout === 'F' ? (e.cyl/2) + 1 : e.cyl + 1;
  const headBoltsPerHead = perHead * (e.fuel === 'diesel' ? 6 : 4) + 2;
  const airCooled = (e.coolant || '').startsWith('air');
  const carb   = e.injection === 'carburettor';
  const diesel = e.fuel === 'diesel';
  const boosted = e.aspiration !== 'na';
  const turbos = { turbo:1, twinturbo:2, quadturbo:4 }[e.aspiration] || 0;
  const blown  = e.aspiration === 'supercharged';

  const parts = [];
  const add = (o) => { parts.push(P(o)); return o.id; };

  /* ---- block & bottom end ---- */
  add({ id:'block', name: airCooled ? 'Crankcase & barrels' : 'Engine block', group:'block',
    removable:false, mesh:'block',
    teach:`The block is the datum for everything else. ${layoutText(e)} Deck height, bore spacing and main-bearing bore are machined to a few microns — every other clearance you set is measured back to this casting.`,
    spec:{ 'Bore':`${e.bore} mm`, 'Stroke':`${e.stroke} mm`, 'Cylinders':e.cyl,
           'Deck':(e.class==='race'||e.displacement>5000)?'closed / semi-closed':'open deck',
           'Material': airCooled ? 'aluminium barrels, alloy cases' : (diesel||e.maker==='Vintage') ? 'cast iron' : 'aluminium alloy' } });

  add({ id:'mainbearings', name:'Main bearings (shells)', group:'block', qty:nMains*2, deps:['block'], mesh:'mainbearing',
    teach:'Tri-metal or bi-metal shells. They never spin in the housing — the tang locates them and crush holds them. Oil clearance is typically 0.001″ per inch of journal diameter; too tight and it seizes, too loose and oil pressure falls off.',
    spec:{ 'Oil clearance':'0.040–0.065 mm', 'Sets':nMains } });

  add({ id:'crank', name:'Crankshaft', group:'rotating', deps:['mainbearings'], mesh:'crank',
    teach:`${e.crank==='flat'?'Flat-plane crank: rod journals at 180°, so each bank fires evenly. Lighter and faster-revving, but the secondary imbalance shakes.':e.crank==='270'?'A 270° crankpin offset makes this parallel-twin fire like a 90° V-twin.':'Forged or cast steel, counterweighted so the rotating and half the reciprocating mass is balanced.'} Rod throw is exactly half the stroke — ${(e.stroke/2).toFixed(1)} mm here.`,
    spec:{ 'Throw':`${(e.stroke/2).toFixed(1)} mm`, 'Main journals':nMains, 'End float':'0.10–0.30 mm' } });

  add({ id:'maincaps', name:'Main caps', group:'block', qty:nMains, deps:['crank'], mesh:'maincap',
    torque:{ nm:B.main.nm, angle:B.main.angle, size:B.main.size, count:nMains*2,
             pattern:pattern('centre-out', nMains*2), stages:['30 Nm seat', `${B.main.nm} Nm`, `+${B.main.angle}°`],
             lube:'engine oil on threads & under head' },
    teach:'Caps are line-bored with the block — they are not interchangeable and they only fit one way round. Torque from the centre outwards in stages, then check the crank still turns freely by hand before you go any further.' });

  add({ id:'pistons', name:'Pistons, rings & pins', group:'rotating', qty:e.cyl, deps:['maincaps'], mesh:'piston',
    teach:`Ring pack from the top: compression ring (seals combustion), second ring (scrapes and seals), oil control ring with expander. Stagger the ring gaps ~120° apart. This engine's ${e.bore} mm piston runs about ${(e.bore*0.0006).toFixed(2)} mm of cold wall clearance${e.cr>12?' — and the high compression means valve reliefs in the crown are shallow, so cam timing errors bend valves.':'.'}`,
    spec:{ 'Bore':`${e.bore} mm`, 'Compression':`${e.cr}:1`, 'Ring gap (top)':`${(e.bore*0.0045).toFixed(2)} mm`,
           'Type': e.class==='race'||boosted ? 'forged 2618/4032' : 'hypereutectic cast' } });

  add({ id:'rods', name:'Connecting rods & caps', group:'rotating', qty:e.cyl, deps:['pistons'], mesh:'rod',
    torque:{ nm:B.rod.nm, angle:B.rod.angle, size:B.rod.size, count:e.cyl*2,
             pattern:pattern('pair', e.cyl*2), stages:[`${Math.round(B.rod.nm*0.4)} Nm`, `${B.rod.nm} Nm`, `+${B.rod.angle}°`],
             lube:'assembly lube on bolt threads' },
    teach:'Rod bolts are the single most stressed fastener in the engine — they hold the piston back at TDC on the exhaust stroke against inertia alone. Most are stretch bolts: measure stretch, not torque, if you have the gauge.',
    spec:{ 'Side clearance':'0.15–0.40 mm', 'Big-end clearance':'0.030–0.060 mm' } });

  /* ---- lubrication ---- */
  add({ id:'oilpump', name:'Oil pump', group:'lube', deps:['maincaps'], mesh:'oilpump',
    teach:`${e.class==='race'?'Dry sump: a multi-stage pump scavenges oil out of the pan into a remote tank, so the crank never wades through oil and the engine can sit lower.':'Gerotor or crescent pump driven off the crank nose. Pressure comes from restriction downstream — the pump is a flow device, the bearings are the restriction.'}`,
    spec:{ 'Type': e.class==='race' ? 'dry sump, 4-stage' : 'wet sump gerotor', 'Hot idle pressure':'>1.0 bar', 'At redline':'3.5–5.5 bar' } });
  add({ id:'pickup', name:'Oil pickup & windage tray', group:'lube', deps:['oilpump'], mesh:'pickup',
    teach:'The pickup screen must sit a few millimetres off the pan floor. A windage tray stops the crank whipping oil into a froth — aerated oil will not hold a bearing film.' });
  add({ id:'pangasket', name:'Oil pan gasket, drain bolt & crush washer', group:'lube', deps:['pickup'], mesh:'headgasket',
    torque:{ nm:B.med.nm*1.2|0, size:'M14 drain', count:1, pattern:pattern('sequence',1), stages:[`${B.med.nm*1.2|0} Nm`] },
    teach:'One-piece moulded rubber on a modern engine, cork or paper on an old one — either way it is fitted dry and never re-used. The drain bolt gets a fresh copper or aluminium crush washer every oil change: the washer is what seals, not the thread, which is why over-tightening the bolt strips the pan instead of stopping the drip.',
    spec:{ 'Gasket':'moulded rubber / cork', 'Crush washer':'copper or aluminium, one use', 'Sealant':'RTV at the timing-cover and rear-seal corners only' } });
  add({ id:'oilpan', name:'Oil pan / sump', group:'lube', deps:['pangasket'], mesh:'oilpan',
    torque:{ nm:B.small.nm, size:'M6', count:18, pattern:pattern('perimeter',18), stages:[`${B.small.nm} Nm`] },
    teach:'Perimeter bolts go in criss-cross to squeeze the sealant or gasket evenly. Over-torquing here dimples the flange and *causes* the leak you were trying to prevent.' });
  add({ id:'oilfilter', name:'Oil filter & cooler', group:'lube', deps:['oilpan'], mesh:'oilfilter',
    teach:'Full-flow filter with a bypass valve — if the filter clogs, dirty oil is still better than no oil. The cooler matters most on boosted and track engines where oil is the second coolant.' });

  /* ---- head ---- */
  add({ id:'headgasket', name:'Head gasket', group:'head', qty:heads, deps:['pistons','rods'], mesh:'headgasket',
    teach:`Multi-layer steel today. It seals ${e.cr}:1 compression${boosted?' plus boost':''}, plus coolant and oil galleries, across a joint that grows and shrinks every heat cycle. ${boosted?'Boosted engines lift heads before they blow gaskets — clamp load is the real fix.':''}`,
    spec:{ 'Type': boosted||e.class==='race' ? 'MLS, 3–5 layer' : 'MLS', 'Surface finish':'<0.8 µm Ra', 'Deck warp limit':'0.05 mm' } });

  add({ id:'head', name: heads>1 ? 'Cylinder heads' : 'Cylinder head', group:'head', qty:heads, deps:['headgasket'], mesh:'head',
    torque:{ nm:B.head.nm, angle:B.head.angle, size:B.head.size, count:headBoltsPerHead*heads,
             pattern:pattern('inside-out', headBoltsPerHead), tty:true,
             stages:[`${Math.round(B.head.nm*0.5)} Nm`, `${B.head.nm} Nm`, `+${Math.round(B.head.angle/2)}°`, `+${Math.round(B.head.angle/2)}°`],
             lube:'clean, dry threads unless the manual says oil' },
    teach:`Torque-to-yield bolts are stretched past their elastic limit on purpose — that is what keeps clamp load constant as the joint heats. They are single-use. Always work from the centre outwards; starting at a corner bows the head.`,
    spec:{ 'Bolts per head':headBoltsPerHead, 'Combustion chamber': e.cr>12?'compact pent-roof':diesel?'bowl-in-piston, flat deck':'pent-roof',
           'Valves': e.valvesPerCyl ? `${e.valvesPerCyl}/cyl` : '—' } });

  /* ---- valvetrain ---- */
  add({ id:'valves', name:'Valves, springs & retainers', group:'valvetrain', qty:e.cyl*e.valvesPerCyl, deps:['head'], mesh:'valve',
    teach:`${e.valvetrain==='pneumatic'?'Pneumatic springs: nitrogen pressure closes the valves because a steel spring cannot survive 15,000 rpm.':e.valvetrain==='desmodromic'?'Desmodromic: a second rocker pulls each valve closed mechanically, so valve float simply cannot happen.':'Spring pressure has to close the valve faster than the cam ramp drops away. Lose that race and the valve floats — then it meets the piston.'} Intake valves are bigger than exhaust because the exhaust leaves under pressure.`,
    spec:{ 'Valves':e.cyl*e.valvesPerCyl, 'Seat angle':'45° (30° on some intakes)', 'Stem seal':'viton umbrella',
           'Lash': ohv ? '0.15–0.25 mm (hot)' : 'shim-under-bucket 0.15–0.30 mm' } });

  if (ohv){
    add({ id:'cam', name:'Camshaft (in block)', group:'valvetrain', deps:['maincaps'], mesh:'cam',
      teach:'Cam-in-block: one camshaft in the V, lifters riding on it, pushrods reaching up to rockers. Compact and stiff, but valve motion is limited by the mass of that whole train.',
      spec:{ 'Lobes':e.cyl*2, 'Lift': e.class==='race'?'>14 mm':'9–12 mm', 'Duration @0.050″': e.class==='race'?'260–280°':'200–230°' } });
    add({ id:'lifters', name:'Lifters / tappets', group:'valvetrain', qty:e.cyl*2, deps:['cam'], mesh:'lifter',
      teach: e.class==='race' ? 'Solid roller lifters — a needle-bearing wheel on the lobe lets the cam use ramps that would shred a flat tappet.' : 'Hydraulic lifters take up lash automatically using oil pressure. That is why a cold engine ticks for a few seconds.' });
    add({ id:'pushrods', name:'Pushrods', group:'valvetrain', qty:e.cyl*2, deps:['lifters','head'], mesh:'pushrod',
      teach:'Length sets rocker geometry; the roller tip should sweep a narrow band across the valve stem. Too short or too long and you side-load the guide.' });
    if (airCooled)
      add({ id:'pushrodtubes', name:'Pushrod tubes & seals', group:'valvetrain', qty:e.cyl*2, deps:['pushrods'], mesh:'pushrod',
        teach:'On an air-cooled engine the pushrods run outside the castings, so each one gets a chromed tube with a rubber boot at either end. The boots are the seal between the rocker box and the crankcase — when a big twin marks its spot on the driveway, this is usually where it came from. The tubes are telescopic so they can be collapsed to get a pushrod out without pulling the head.',
        spec:{ 'Tubes':e.cyl*2, 'Seals':'O-ring at head, umbrella boot at case', 'Adjustment': 'collapse to fit, then set lash' } });
    add({ id:'rockers', name:'Rocker arms & shafts', group:'valvetrain', qty:e.cyl*2, deps:['pushrods'], mesh:'rocker',
      torque:{ nm:B.med.nm, size:'M8', count:e.cyl*2, pattern:pattern('sequence', e.cyl*2), stages:[`${B.med.nm} Nm`] },
      teach:`Rocker ratio multiplies cam lift — a 1.6 rocker turns 8 mm of lobe into 12.8 mm at the valve. Set lash with the lobe on its base circle.` });
  } else {
    add({ id:'cam', name: cams>1 ? `Camshafts (${cams})` : 'Camshaft', group:'valvetrain', qty:cams, deps:['head','valves'], mesh:'cam',
      teach:`${e.cam} — ${cams} camshaft${cams>1?'s':''} running directly in the head. ${e.camProfile==='aggressive'?'This one has a second, wilder lobe set that a rocker switches onto above about 5,800 rpm.':''} Duration decides where the torque peak lands; lift decides how much air gets through once it is open.`,
      spec:{ 'Lobes':e.cyl*e.valvesPerCyl, 'Lift': e.class==='race'?'12–14 mm':e.camProfile==='aggressive'?'11.5 mm':'9–10.5 mm',
             'Duration @1 mm': e.class==='race'?'270–290°':e.camProfile==='aggressive'?'250°':'220–235°',
             'LSA': boosted?'112–116° (wide, less overlap)':'104–110°' } });
    add({ id:'camcaps', name:'Cam caps / bearing ladder', group:'valvetrain', qty:cams*4, deps:['cam'], mesh:'camcap',
      torque:{ nm:B.cam.nm, size:'M6', count:cams*8, pattern:pattern('centre-out', cams*8),
               stages:['4 Nm seat', `${B.cam.nm} Nm`] },
      teach:'Cam caps clamp down against valve-spring pressure, so pull them down evenly in small steps or you will bend the camshaft. Same rule in reverse when you take them off.' });
  }

  if (e.vvt !== false && !carb)
    add({ id:'vvt', name:'Variable valve timing actuators', group:'valvetrain', qty:cams, deps:[ohv?'cam':'camcaps'], mesh:'vvt',
      teach:'Oil-pressure vane phasers rotate the cam relative to its sprocket, typically 40–50° of crank. Advancing the intake cam builds low-end torque; retarding it chases top end. The ECU commands it with a duty-cycle solenoid.' });

  /* ---- timing ---- */
  const timingDeps = ohv ? ['cam','crank'] : ['camcaps'];
  add({ id:'timing', name: e.class==='race' ? 'Gear/chain timing drive' : (e.cam==='OHV' ? 'Timing chain & gears' : 'Timing chain / belt'),
    group:'timing', deps:timingDeps, mesh:'timing',
    teach:`Cam turns at exactly half crank speed on a four-stroke — that is the whole reason a four-stroke needs 720° for one cycle. Line up every timing mark before the tensioner goes in, then turn it over two full crank revolutions by hand and check the marks come back.${e.cr>11?' On an interference engine like this one, getting it wrong bends valves on the first crank.':''}`,
    spec:{ 'Ratio':'2:1 crank:cam', 'Interference': e.cr>10.5?'yes — valves hit pistons':'non-interference' } });
  add({ id:'tensioner', name:'Tensioner & guides', group:'timing', deps:['timing'], mesh:'tensioner',
    teach:'Hydraulic tensioners need oil pressure, so they are slack when the engine is off — always pin or compress them during assembly and release only after everything is timed.' });
  add({ id:'frontcover', name:'Front / timing cover', group:'timing', deps:['tensioner'], mesh:'frontcover',
    torque:{ nm:B.small.nm, size:'M6', count:12, pattern:pattern('perimeter',12), stages:[`${B.small.nm} Nm`] },
    teach:'Carries the front crank seal. Fit the seal to the cover, not the crank, and lubricate the lip — a dry lip tears on the first start.' });
  add({ id:'seals', name:'Front & rear crank seals', group:'timing', qty:2, deps:['frontcover'], mesh:'headgasket',
    teach:'Two lip seals ride on the crank itself: one in the timing cover, one in the block behind the flywheel. Fit them square with a driver, not a hammer and screwdriver, and wet the lip with oil — a dry lip tears on the first start and you are back in there with the gearbox out. The rear one is the reason a clutch job and a rear main seal are always the same job.',
    spec:{ 'Type':'PTFE or nitrile lip seal', 'Front':'in the timing cover', 'Rear':'behind the flywheel', 'Runout limit':'0.05 mm on the sealing land' } });
  add({ id:'vcgasket', name:'Head cover gasket & grommets', group:'timing', qty:heads, deps:[ohv?'rockers':'camcaps'], mesh:'headgasket',
    teach:'The rubber gasket runs the whole perimeter, and each cover bolt pulls down through a rubber grommet with a metal crush limiter inside it. The limiter is what stops you squashing the gasket flat — it is also why this joint has a torque figure at all when it only holds oil mist.',
    spec:{ 'Gasket':'moulded rubber, re-usable if unsplit', 'Grommets':e.cyl*2+4, 'Limiter':'steel, sets the crush' } });
  add({ id:'valvecover', name: airCooled ? 'Rocker covers' : 'Valve cover(s)', group:'timing', qty:heads, deps:['vcgasket'], mesh:'valvecover',
    torque:{ nm:9, size:'M6', count:heads*10, pattern:pattern('inside-out',10), stages:['9 Nm'] },
    teach:'Almost every "oil leak" is this gasket. Torque is tiny and it is a spiral from the centre out — crushing the seal is the classic first-timer mistake.' });

  /* ---- induction ---- */
  if (turbos){
    add({ id:'turbo', name: turbos>1 ? `Turbochargers (×${turbos})` : 'Turbocharger', group:'induction',
      qty:turbos, deps:['head'], mesh:'turbo',
      torque:{ nm:32, size:'M10 stud', count:turbos*4, pattern:pattern('sequence',4), stages:['16 Nm','32 Nm'], lube:'nickel anti-seize' },
      teach:`Exhaust energy spins the turbine; the compressor on the other end of the shaft squeezes intake air. Boost is not free — it is bought with exhaust backpressure. ${e.aspiration==='twinturbo'?'Two smaller turbos halve the rotating inertia each one has to accelerate, so it spools sooner.':''} That shaft floats on a film of oil at ${e.class==='race'?'150,000+':'120,000–180,000'} rpm; never shut it down hot.`,
      spec:{ 'Count':turbos, 'Target boost':`${(e.boostTarget||1).toFixed(1)} bar`, 'Spool':`~${e.spoolRpm||2200} rpm`,
             'Bearing': e.class==='race'?'ball bearing':'journal, oil + water cooled' } });
    add({ id:'wastegate', name:'Wastegate & actuator', group:'induction', qty:turbos, deps:['turbo'], mesh:'wastegate',
      teach:'The wastegate bleeds exhaust *around* the turbine to cap boost. Spring pressure sets the minimum; the boost-control solenoid lies to the actuator to hold anything above it.' });
    add({ id:'bov', name:'Blow-off / recirculation valve', group:'induction', deps:['turbo'], mesh:'bov',
      teach:'Close the throttle at boost and the column of air has nowhere to go — it slams back into the compressor wheel. That is surge, and it kills thrust bearings. This valve vents it.' });
    add({ id:'intercooler', name:'Intercooler & charge pipes', group:'induction', deps:['turbo'], mesh:'intercooler',
      teach:'Compressing air heats it; hot air is less dense and knock-prone. A good core drops intake temps 40–60 °C for maybe 0.05 bar of pressure drop — a trade worth taking every time.',
      spec:{ 'Type': e.aspiration==='quadturbo'||e.class==='race' ? 'air-to-water' : 'air-to-air bar & plate', 'Target IAT rise':'<15 °C over ambient' } });
  }
  if (blown){
    add({ id:'blower', name: e.scType==='roots' ? 'Roots supercharger' : 'Twin-screw supercharger', group:'induction', deps:['head'], mesh:'blower',
      torque:{ nm:B.med.nm, size:'M8', count:10, pattern:pattern('inside-out',10), stages:[`${B.med.nm} Nm`] },
      teach:`Belt-driven positive displacement: boost the instant the crank turns, no lag at all. The cost is parasitic drag — this blower eats ${e.fuel==='nitro'?'over 900':'60–120'} hp just to turn.${e.scType==='roots'?' Roots blowers move air in lumps and heat it more; twin-screws compress internally and are cooler.':''}`,
      spec:{ 'Drive':'crank belt/gear', 'Overdrive': e.fuel==='nitro'?'60%':'~2.3:1', 'Target boost':`${(e.boostTarget||1).toFixed(1)} bar` } });
    add({ id:'intercooler', name:'Charge cooler', group:'induction', deps:['blower'], mesh:'intercooler',
      teach:'Air-to-water core built into the blower lid, with its own pump and heat exchanger. Short path, low pressure drop, and it can be pre-chilled with ice for a dyno pull.' });
  }
  add({ id:'intgasket', name:'Intake manifold gasket', group:'induction',
    qty:heads, deps:[turbos?'intercooler':blown?'intercooler':'head'], mesh:'headgasket',
    teach:'It seals vacuum, not pressure, so a shrunken one leaks air *in* and leans the engine out at idle — the classic hunting idle that no amount of ECU work fixes. On a V engine it also seals coolant and the valley, which is why a failed one can put water in the oil.',
    spec:{ 'Type': boosted ? 'moulded rubber on alloy carrier' : 'composite / rubber-on-steel', 'Re-use':'never' } });
  add({ id:'intake', name: carb ? 'Intake manifold & carburettor' : 'Intake manifold', group:'induction',
    deps:['intgasket'], mesh:'intake',
    torque:{ nm:B.med.nm, size:'M8', count:e.cyl*2, pattern:pattern('inside-out', e.cyl*2), stages:[`${Math.round(B.med.nm/2)} Nm`, `${B.med.nm} Nm`] },
    teach:`${carb?'A four-barrel carburettor meters fuel with airflow through a venturi — no sensors, no ECU, just physics and jets.':'Runner length tunes torque: long runners use pressure-wave reflection to stuff the cylinder at low rpm, short runners work up top. Plenum volume damps the pulses between cylinders.'}`,
    spec:{ 'Runner length': e.class==='race'?'short, ~180 mm':'320–450 mm', 'Plenum': carb?'—':`~${Math.round(e.displacement/1000*0.7*10)/10} L` } });
  if (!carb)
    add({ id:'throttle', name:'Throttle body', group:'induction', deps:['intake'], mesh:'throttle',
      teach:`Drive-by-wire: the pedal is a pair of potentiometers, the ECU decides the blade angle. That is what makes traction control, cruise and torque limiting possible at all.`,
      spec:{ 'Bore': `${Math.round(Math.sqrt(e.displacement)*0.95)} mm`, 'Type': e.class==='race'?'individual throttle bodies':'single electronic' } });

  /* ---- fuel ---- */
  if (carb){
    add({ id:'fuelpump', name:'Mechanical fuel pump & lines', group:'fuel', deps:['block'], mesh:'fuelpump',
      teach:'A lever riding an eccentric on the camshaft works a diaphragm — 0.4 bar is all a carburettor needs.' });
  } else {
    add({ id:'injectors', name:'Fuel injectors', group:'fuel', qty:e.cyl, deps:['intake'], mesh:'injector',
      teach:`${e.injection==='direct'?`Direct injection sprays straight into the chamber at ${diesel?'up to 2,000':'200–350'} bar. Charge cooling in-cylinder is what lets this engine run ${e.cr}:1 and still take boost.`:e.injection==='common-rail'?'Common rail holds diesel at up to 2,000 bar; solenoid or piezo injectors fire up to seven times per combustion event to shape the burn and cut noise.':'Port injection sprays onto the back of the hot intake valve. Cheap, clean-running, and it washes the valve — which direct injection does not.'}`,
      spec:{ 'Count':e.cyl, 'Flow': `${Math.round(e.displacement/e.cyl*0.28*(e.aspiration!=='na'?1.9:1))} cc/min`,
             'Pressure': e.injection==='direct'?'200–350 bar':e.injection==='common-rail'?'400–2000 bar':'3.5–4.0 bar' } });
    add({ id:'fuelrail', name:'Fuel rail & regulator', group:'fuel', deps:['injectors'], mesh:'fuelrail',
      teach:'The rail is a pressure reservoir that damps the pulse each injector makes. A returnless system regulates at the tank; a return system regulates here and references manifold pressure so the pressure *drop* across the injector stays constant.' });
    if (e.injection === 'direct' || e.injection === 'common-rail')
      add({ id:'hpfp', name:'High-pressure fuel pump', group:'fuel', deps:[ohv?'cam':'camcaps'], mesh:'hpfp',
        teach:'Driven by a lobe on the camshaft. It is the reason a direct-injection engine cannot simply be "turned up" on fuel — the pump caps how much you can flow, long before the injectors do.' });
  }

  /* ---- ignition ---- */
  if (!diesel){
    add({ id:'plugs', name:'Spark plugs', group:'ignition', qty:e.cyl*(e.ignition==='dual-mag'?2:1), deps:['head'], mesh:'plug',
      torque:{ nm:e.bore>=95?25:20, size:'M12/M14', count:e.cyl*(e.ignition==='dual-mag'?2:1),
               pattern:pattern('sequence', e.cyl), stages:[`hand tight + ½ turn (${e.bore>=95?25:20} Nm)`], lube:'never on the threads of an alloy head' },
      teach:`Heat range is about how fast the tip sheds heat, not how hot the spark is. ${boosted?'Boost and more timing want a colder plug and a tighter gap — the spark has to jump through much denser air.':'A colder plug on a stock engine just fouls.'} Gap here: ${boosted?'0.55–0.65':'0.8–1.1'} mm.` });
    add({ id:'coils', name: e.ignition==='distributor' ? 'Distributor, coil & leads' : e.ignition==='dual-mag' ? 'Magnetos & leads' : 'Ignition coils',
      group:'ignition', qty:e.ignition==='coil-on-plug'?e.cyl:1, deps:['plugs'], mesh:'coil',
      teach:`${e.ignition==='distributor'?'One coil, one rotor, one cap: the distributor sends the spark to the right cylinder mechanically. You set base timing by rotating the whole distributor against a timing light.':e.ignition==='dual-mag'?'Two magnetos, two plugs per cylinder, 44 amps of current — nitromethane is extremely hard to light.':'Coil-on-plug: one coil per cylinder, no leads, and the ECU can dwell each one independently. It also lets the ECU cut spark to a single cylinder for misfire detection or launch control.'} Firing order: ${(e.firing||'')}.` });
  } else {
    add({ id:'glow', name:'Glow plugs & controller', group:'ignition', qty:e.cyl, deps:['head'], mesh:'plug',
      teach:'A diesel has no spark. Glow plugs simply pre-heat the chamber so a cold engine will light off; once it is warm they are idle.' });
  }

  /* ---- exhaust ---- */
  add({ id:'exgasket', name:'Exhaust manifold gasket', group:'exhaust', qty:heads, deps:['head'], mesh:'headgasket',
    teach:'Multi-layer steel or embossed graphite, and it lives at 800 °C. It has to let the manifold grow and slide across the head without losing its seal — that movement is why the gasket wears out and why the studs go in with anti-seize and come out broken if they do not.',
    spec:{ 'Type':'MLS or graphite-faced steel', 'Peak temp':'800–950 °C', 'Re-use':'never' } });
  add({ id:'exmanifold', name: e.class==='race'||e.class==='bike' ? 'Exhaust headers' : 'Exhaust manifold(s)', group:'exhaust',
    qty:heads, deps:['exgasket'], mesh:'exmanifold',
    torque:{ nm:e.bore>=95?32:25, size:'M8 stud', count:e.cyl*2,
             pattern:pattern('inside-out', e.cyl*2), stages:[`${Math.round((e.bore>=95?32:25)/2)} Nm`, `${e.bore>=95?32:25} Nm`], lube:'copper anti-seize' },
    teach:`Equal-length primaries let each cylinder's exhaust pulse scavenge the next one — a well-tuned header is worth real power for free. Use new gaskets and copper nuts; these fasteners cycle through 800 °C every drive.` });
  add({ id:'exhaust', name:'Downpipe, cats & exhaust', group:'exhaust', deps:[turbos?'turbo':'exmanifold'], mesh:'exhaust',
    teach:`Backpressure is the enemy${turbos?' — on a turbo car the downpipe is usually the single biggest restriction and the biggest single power gain':''}. Diameter is a compromise: too big and low-rpm gas velocity collapses, taking your bottom-end torque with it.` });

  /* ---- cooling ---- */
  if (!airCooled){
    add({ id:'wpgasket', name:'Water pump gasket', group:'cooling', deps:['frontcover'], mesh:'headgasket',
      teach:'Paper, rubber-coated steel, or a plain O-ring depending on the engine. The weep hole below the pump is deliberate: when the shaft seal starts to go, coolant drips out of that hole instead of into the bearing, and that drip is your warning to change the pump before it seizes and throws the belt.',
      spec:{ 'Type':'paper / rubber-coated steel / O-ring', 'Sealant': 'none — fit dry unless the manual says otherwise' } });
    add({ id:'waterpump', name:'Water pump & thermostat', group:'cooling', deps:['wpgasket'], mesh:'waterpump',
      teach:'A closed 1.1 bar system raises the boiling point to about 125 °C. The thermostat stays shut until the block is warm so the engine reaches operating temperature quickly — cold running is what wears bores.' });
    add({ id:'radiator', name:'Radiator, fans & hoses', group:'cooling', deps:['waterpump'], mesh:'radiator',
      teach:`Coolant carries roughly a third of the fuel's energy straight out to the air. ${boosted?'Under sustained boost the cooling system, not the engine, is usually what ends the run.':''}` });
  } else {
    add({ id:'fins', name:'Cooling fins & oil cooler', group:'cooling', deps:['head'], mesh:'radiator',
      teach:'Air-cooled means the fin area and the oil are the entire cooling system. Head temperature climbs the moment you stop moving, which is why valve clearances are set loose.' });
  }

  /* ---- accessories ---- */
  add({ id:'flywheel', name: e.class==='bike' ? 'Clutch basket & primary drive' : 'Flywheel / flexplate', group:'accessory', deps:['seals'], mesh:'flywheel',
    torque:{ nm:Math.round(B.main.nm*1.4), size:'M12', count:e.class==='bike'?6:8,
             pattern:pattern('star', e.class==='bike'?6:8), stages:[`${Math.round(B.main.nm*0.6)} Nm`, `${Math.round(B.main.nm*1.4)} Nm`, '+45°'], lube:'thread locker' },
    teach:`Stored rotational inertia. A heavy flywheel makes an engine easy to launch and hard to stall; a light one lets revs rise and fall instantly but will stall in traffic. It also carries the starter ring gear${e.class!=='bike'?' and the crank position reluctor on many engines':''}.` });
  add({ id:'clutch', name: e.class==='bike' ? 'Clutch pack & pressure plate' : 'Clutch / torque converter', group:'accessory', deps:['flywheel'], mesh:'clutch',
    torque:{ nm:B.med.nm, size:'M8', count:6, pattern:pattern('star',6), stages:[`${B.med.nm} Nm`] },
    teach:`${e.class==='bike'?'A wet multi-plate pack running in engine oil, with a slipper ramp that backs the plates off under engine braking so the rear wheel does not hop on downshifts.':'The clutch has to hold more torque than the engine makes, but release smoothly. Clamp load, friction coefficient and disc radius are the only three variables you get.'}` });
  add({ id:'crankpulley', name:'Crank pulley / damper', group:'accessory', deps:['frontcover'], mesh:'pulley',
    torque:{ nm:Math.round(B.main.nm*2.2), size:'M16', count:1, pattern:pattern('single',1),
             stages:[`${Math.round(B.main.nm*1.2)} Nm`, `+${e.fuel==='diesel'?120:90}°`] },
    teach:'Not just a pulley — a harmonic damper. The crank twists and snaps back thousands of times a second; a bonded elastomer ring absorbs that resonance. A solid pulley on a road engine will eventually break the crank.' });
  add({ id:'alternator', name:'Alternator & belt drive', group:'accessory', deps:['crankpulley'], mesh:'alternator',
    teach:`A three-phase alternator rectified to DC, regulated to about 14.2 V. Everything electrical on the vehicle is really running off this, not the battery.`,
    spec:{ 'Output': e.class==='bike'?'350–500 W':'110–180 A', 'Regulated':'14.0–14.6 V' } });
  add({ id:'starter', name:'Starter motor', group:'accessory', deps:['flywheel'], mesh:'starter',
    teach:`A series-wound DC motor pulling ${diesel?'400–800':'120–250'} A for a second or two — the single biggest electrical load on the vehicle, which is why starter and battery cables are so thick.` });

  /* ---- sensors / management ---- */
  add({ id:'crksensor', name:'Crank & cam position sensors', group:'sensors', deps:['frontcover'], mesh:'sensor',
    teach:'The crank sensor reads a toothed wheel with a gap (60-2 is the classic). The gap tells the ECU where TDC is; the cam sensor tells it which of the two revolutions of the four-stroke cycle it is on. Lose either and the engine will not fire at all.' });
  add({ id:'mapsensor', name: boosted ? 'MAP / MAF & IAT sensors' : 'MAP / MAF sensor', group:'sensors', deps:['intake'], mesh:'sensor',
    teach:'Load measurement. Speed-density reads manifold pressure and infers airflow from rpm and VE; a MAF measures mass directly with a heated wire. Everything the fuel table does depends on getting this number right.' });
  if (!diesel)
    add({ id:'knock', name:'Knock sensors', group:'sensors', deps:['block'], mesh:'sensor',
      teach:'A piezo accelerometer bolted to the block, listening in a narrow band around 6–8 kHz. Detect a knock event and the ECU pulls timing from that cylinder within one or two cycles. This is the safety net your whole tune leans on.' });
  add({ id:'o2', name: diesel ? 'NOx / lambda & EGT sensors' : 'Wideband O₂ sensors', group:'sensors', deps:['exhaust'], mesh:'sensor',
    teach:`A wideband reports actual lambda from 0.65 to lean, not just rich/lean. It is how the ECU closed-loop trims fuel — and how you verify a tune instead of guessing.` });
  add({ id:'ecu', name:'ECU & engine harness', group:'sensors', deps:['crksensor','mapsensor'], mesh:'ecu',
    teach:`The engine control unit runs the fuel, spark, boost and cam tables you will edit in the Tuning bay. It samples every sensor a few hundred times a second and decides injector pulse width and ignition advance for every single combustion event.`,
    spec:{ 'Strategy': carb?'—':(e.injection==='direct'?'speed-density + model-based':'speed-density'),
           'Rev limit':`${e.redline} rpm`, 'Protection':'knock retard, lean-cut, overboost cut' } });

  return finish(parts, e);
}

function layoutText(e){
  if (e.layout === 'V') return `Two banks of ${e.cyl/2} at ${e.bankAngle}°, sharing one crankshaft.`;
  if (e.layout === 'F') return `Two horizontally opposed banks — pistons move away from each other, cancelling primary shake.`;
  if (e.layout === 'W') return `Two narrow-angle V8s on a common crank — sixteen cylinders in the length of a V8.`;
  return e.cyl === 1 ? 'A single cylinder — every force the engine makes is unbalanced by definition, hence the balance shaft.'
       : `${e.cyl} cylinders in a line.${e.cyl===6?' Inline-6 is inherently balanced in both primary and secondary order — no balance shafts needed.':''}`;
}

/* ====================================================================== */
/* rotary engines                                                          */
/* ====================================================================== */
function rotaryTree(e){
  const n = e.cyl;                     // rotor count
  const parts = [];
  const add = (o) => { parts.push(P(o)); return o.id; };
  const turbos = { turbo:1, twinturbo:2 }[e.aspiration] || 0;

  add({ id:'block', name:'Front stationary housing', group:'block', removable:false, mesh:'block',
    teach:'A rotary has no block in the usual sense: it is a stack of alternating iron rotor housings and aluminium side housings, all clamped together by long tension bolts running the whole length.',
    spec:{ 'Rotors':n, 'Chamber':`${e.chamberCc} cc × ${n*3} faces`, 'Eccentricity':'15 mm' } });
  add({ id:'stationary', name:'Stationary gears', group:'block', qty:n+1, deps:['block'], mesh:'mainbearing',
    teach:'Bolted to the side housings, these fixed gears mesh with the internal gear in each rotor. That gear pair is what forces the rotor to trace its epitrochoid path at exactly one third of eccentric-shaft speed.' });
  add({ id:'crank', name:'Eccentric shaft (e-shaft)', group:'rotating', deps:['stationary'], mesh:'crank',
    teach:'The rotary equivalent of a crankshaft. Each rotor rides on a 15 mm offset lobe; as the rotor orbits, it drives the shaft. The shaft turns three times for every one turn of a rotor.',
    spec:{ 'Lobes':n, 'Offset':'15 mm', 'Shaft:rotor':'3:1' } });
  add({ id:'rotorhousing', name:'Rotor housings', group:'block', qty:n, deps:['crank'], mesh:'rotorhousing',
    teach:'The famous epitrochoid bore, chrome- or nikasil-plated. Intake and exhaust are *ports* cut into the housings — there are no valves and no camshaft anywhere in this engine.',
    spec:{ 'Bore form':'2-lobe epitrochoid', 'Coating':'chrome / nikasil', 'Ports': e.ports || 'side intake, peripheral exhaust' } });
  add({ id:'pistons', name:'Rotors', group:'rotating', qty:n, deps:['rotorhousing'], mesh:'rotor',
    teach:`Each triangular rotor is doing all four strokes at once on its three faces. That is why a ${n}-rotor with only ${e.displacement} cc behaves like a much larger four-stroke — every face fires once per shaft revolution, not once every two.`,
    spec:{ 'Faces':3, 'Chamber':`${e.chamberCc} cc`, 'Internal gear':'meshes stationary gear 3:2' } });
  add({ id:'apex', name:'Apex, side & corner seals', group:'rotating', qty:n*3, deps:['pistons'], mesh:'apexseal',
    teach:'Apex seals are the whole ballgame. Three per rotor, spring-loaded outward, sealing against the housing at up to 25 m/s while carrying combustion pressure. They are the first thing that fails and the reason rotaries get rebuilt.',
    spec:{ 'Apex seals':n*3, 'Material': e.class==='race'?'ceramic / 3 mm steel':'2 mm carbon-steel', 'Corner seals':n*6 } });
  add({ id:'maincaps', name:'Tension bolts', group:'block', qty:17, deps:['apex'], mesh:'maincap',
    torque:{ nm:32, angle:0, size:'M10', count:17, pattern:pattern('centre-out',17),
             stages:['12 Nm seat','23 Nm','32 Nm'], lube:'engine oil' },
    teach:'Seventeen long bolts clamp the entire stack. Torque them from the centre outwards in three passes — this joint replaces both the main caps and the head bolts of a piston engine, and it seals combustion, coolant and oil all at once.' });
  add({ id:'oilpump', name:'Oil pump & metering pump', group:'lube', deps:['maincaps'], mesh:'oilpump',
    teach:'Two pumps. One is the normal pressure pump; the other, the oil metering pump, deliberately injects a small amount of oil into the intake charge to lubricate the apex seals. A rotary is *supposed* to burn oil.' });
  add({ id:'oilpan', name:'Oil pan & cooler', group:'lube', deps:['oilpump'], mesh:'oilpan',
    torque:{ nm:10, size:'M6', count:16, pattern:pattern('perimeter',16), stages:['10 Nm'] },
    teach:'Rotaries dump enormous heat into the oil — the oil cooler is not optional equipment here.' });
  if (turbos){
    add({ id:'turbo', name: turbos>1?'Sequential turbochargers':'Turbocharger', group:'induction', qty:turbos, deps:['maincaps'], mesh:'turbo',
      torque:{ nm:32, size:'M10 stud', count:turbos*4, pattern:pattern('sequence',4), stages:['16 Nm','32 Nm'], lube:'nickel anti-seize' },
      teach:'A rotary makes an ideal turbo engine: exhaust ports stay open longer and the gas leaves hot and energetic. The downside is that same heat cooks turbine housings and manifolds.' });
    add({ id:'intercooler', name:'Intercooler & piping', group:'induction', deps:['turbo'], mesh:'intercooler',
      teach:'Charge cooling matters even more here — a rotary chamber is long and thin with a travelling flame front, so it is naturally knock-sensitive.' });
  }
  add({ id:'intake', name:'Intake manifold & ports', group:'induction', deps:[turbos?'intercooler':'maincaps'], mesh:'intake',
    torque:{ nm:22, size:'M8', count:n*4, pattern:pattern('inside-out',n*4), stages:['11 Nm','22 Nm'] },
    teach:'Port shape *is* the cam profile of a rotary. Street porting enlarges the side ports; bridge and peripheral ports move the timing radically for power at the cost of idle and seal life.' });
  add({ id:'throttle', name:'Throttle body', group:'induction', deps:['intake'], mesh:'throttle', teach:'Feeds the primary and secondary runners; secondaries open only above a certain load so low-rpm gas velocity stays high.' });
  add({ id:'injectors', name:'Primary & secondary injectors', group:'fuel', qty:n*2, deps:['intake'], mesh:'injector',
    teach:'Two injectors per rotor: small primaries for idle and cruise resolution, big secondaries that come in under load. A rotary runs deliberately rich at high load — the extra fuel is cooling the seals.' });
  add({ id:'fuelrail', name:'Fuel rails & regulator', group:'fuel', deps:['injectors'], mesh:'fuelrail', teach:'Two rails, one per injector set, usually with a rising-rate regulator referencing boost.' });
  add({ id:'plugs', name:'Leading & trailing spark plugs', group:'ignition', qty:n*2, deps:['rotorhousing'], mesh:'plug',
    torque:{ nm:20, size:'M14', count:n*2, pattern:pattern('sequence',n*2), stages:['20 Nm'] },
    teach:'Two plugs per rotor. The leading plug fires first, the trailing a few degrees later, because the combustion chamber is a long crescent that a single flame front cannot cross in time.' });
  add({ id:'coils', name:'Ignition coils (leading/trailing)', group:'ignition', qty:n*2, deps:['plugs'], mesh:'coil',
    teach:'Separate coils and separate timing maps for leading and trailing. Split timing is a real tuning parameter on a rotary.' });
  add({ id:'exmanifold', name:'Exhaust manifold', group:'exhaust', deps:['rotorhousing'], mesh:'exmanifold',
    torque:{ nm:32, size:'M10 stud', count:n*3, pattern:pattern('sequence',n*3), stages:['16 Nm','32 Nm'], lube:'copper anti-seize' },
    teach:'Exhaust gas leaves a rotary at over 900 °C. Manifolds crack, so they are usually thick-wall stainless with slip joints.' });
  add({ id:'exhaust', name:'Downpipe & exhaust', group:'exhaust', deps:[turbos?'turbo':'exmanifold'], mesh:'exhaust',
    teach:'Rotaries love a big, free exhaust — there is no valve overlap to protect and no low-lift scavenging to preserve.' });
  add({ id:'waterpump', name:'Water pump & thermostat', group:'cooling', deps:['maincaps'], mesh:'waterpump',
    teach:'The rotor housings run far hotter on the combustion side than the intake side, so coolant flow through the stack is deliberately uneven.' });
  add({ id:'radiator', name:'Radiator & oil coolers', group:'cooling', deps:['waterpump'], mesh:'radiator',
    teach:'Twin oil coolers and a big radiator are standard survival equipment on a turbo rotary.' });
  add({ id:'flywheel', name:'Flywheel & counterweight', group:'accessory', deps:['maincaps'], mesh:'flywheel',
    torque:{ nm:480, size:'M24 nut', count:1, pattern:pattern('single',1), stages:['240 Nm','480 Nm'] },
    teach:'One enormous nut holds the flywheel to the e-shaft. Front and rear counterweights balance the orbiting rotor mass.' });
  add({ id:'clutch', name:'Clutch & pressure plate', group:'accessory', deps:['flywheel'], mesh:'clutch',
    torque:{ nm:25, size:'M8', count:6, pattern:pattern('star',6), stages:['25 Nm'] },
    teach:'Rotaries rev fast and have little flywheel effect from the rotating assembly, so a light clutch and flywheel suit them.' });
  add({ id:'crankpulley', name:'E-shaft pulley & damper', group:'accessory', deps:['maincaps'], mesh:'pulley',
    torque:{ nm:130, size:'M16', count:1, pattern:pattern('single',1), stages:['70 Nm','130 Nm'] },
    teach:'Drives the water pump, alternator and — critically — the oil metering pump.' });
  add({ id:'alternator', name:'Alternator & belts', group:'accessory', deps:['crankpulley'], mesh:'alternator', teach:'Standard three-phase alternator; belt routing is tight because the whole engine is so small.' });
  add({ id:'starter', name:'Starter motor', group:'accessory', deps:['flywheel'], mesh:'starter', teach:'A hot rotary can be hard to restart — low compression from hot seals — so the starter and battery are sized generously.' });
  add({ id:'crksensor', name:'E-shaft position sensor', group:'sensors', deps:['crankpulley'], mesh:'sensor', teach:'There is no camshaft to reference, so the shaft trigger wheel alone tells the ECU rotor phase.' });
  add({ id:'mapsensor', name:'MAP & IAT sensors', group:'sensors', deps:['intake'], mesh:'sensor', teach:'Speed-density is the norm on rotaries; port overlap makes a MAF reading noisy.' });
  add({ id:'knock', name:'Knock sensor', group:'sensors', deps:['rotorhousing'], mesh:'sensor', teach:'Detonation in a rotary breaks apex seals almost immediately — this sensor and a conservative tune are what keep it alive.' });
  add({ id:'o2', name:'Wideband O₂ sensor', group:'sensors', deps:['exhaust'], mesh:'sensor', teach:'Target lambda under boost is around 0.75–0.78 — much richer than a piston engine, deliberately, for seal cooling.' });
  add({ id:'ecu', name:'ECU & harness', group:'sensors', deps:['crksensor','mapsensor'], mesh:'ecu',
    teach:'Leading and trailing timing, primary/secondary injector staging and sequential boost control all live here.' });

  return finish(parts, e);
}

/* ====================================================================== */
function finish(parts, e){
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));
  /* dependants (what breaks if you pull this part) */
  for (const p of parts) p.blocks = [];
  for (const p of parts) for (const d of p.deps) if (byId[d]) byId[d].blocks.push(p.id);

  /* install order = topological sort respecting group order */
  const order = [], seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const p = byId[id]; if (!p) return;
    for (const d of p.deps) visit(d);
    order.push(id);
  };
  for (const p of parts) visit(p.id);
  parts.forEach(p => { p.step = order.indexOf(p.id); });

  const groups = GROUPS.filter(g => parts.some(p => p.group === g.id));
  return { engineId:e.id, parts, byId, order, groups,
    totalFasteners: parts.reduce((s,p) => s + (p.torque?.count || 0), 0) };
}

/** Can this part be installed right now? */
export function canInstall(tree, installed, id){
  const p = tree.byId[id];
  return !!p && !installed.has(id) && p.deps.every(d => installed.has(d));
}
/** Can this part be removed right now? (nothing bolted on top of it) */
export function canRemove(tree, installed, id){
  const p = tree.byId[id];
  return !!p && p.removable !== false && installed.has(id) && p.blocks.every(b => !installed.has(b));
}
export function blockers(tree, installed, id){
  const p = tree.byId[id]; if (!p) return [];
  return installed.has(id)
    ? p.blocks.filter(b => installed.has(b)).map(b => tree.byId[b].name)
    : p.deps.filter(d => !installed.has(d)).map(d => tree.byId[d].name);
}
