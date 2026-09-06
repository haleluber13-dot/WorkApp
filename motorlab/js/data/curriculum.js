/* MotorLab — lessons, drills and quizzes. Each lesson names the workspace it
 * wants you in, so "Open workspace" takes you straight to the hardware. */

const L = (o) => Object.assign({ xp:60, minutes:6, ws:'engine', quiz:[] }, o);

export const MODULES = [
  { id:'fundamentals', name:'How an engine works', icon:'⚙', lessons:[
    L({ id:'four-stroke', title:'The four strokes, and why 720°', ws:'engine', minutes:7, xp:80,
      body:[
        'Every four-stroke engine repeats the same four events in every cylinder: **intake** (piston down, intake valve open, cylinder fills), **compression** (both valves shut, piston up), **power** (mixture burns, gas expands, piston forced down) and **exhaust** (piston up, exhaust valve open, burnt gas pushed out).',
        'Each stroke is 180° of crankshaft rotation, so a complete cycle takes **720° — two full crank revolutions**. That single fact explains almost everything else about the engine: the camshaft turns at exactly half crank speed, a distributor rotates at half crank speed, and each cylinder fires once every two revolutions.',
        'Set the crank spinning in the 3D view and watch one cylinder. You will see the intake valve open just *before* the piston reaches the top, and close a long way *after* the bottom. That is deliberate — air has inertia, and it keeps piling into the cylinder even as the piston starts back up.',
      ],
      steps:['Open the Engine Bay and crank the engine slowly with the RPM slider.',
             'Follow one piston through all four strokes and count two crank revolutions.',
             'Watch the intake valve: note it is still open when the piston starts rising.'],
      quiz:[
        { q:'How many crankshaft revolutions make one complete four-stroke cycle?', options:['One','Two','Four','Half'], answer:1,
          why:'Four strokes × 180° = 720°, which is two full turns of the crank.' },
        { q:'Why does the intake valve stay open past bottom dead centre?', options:['To cool the valve','Because the air column has inertia and keeps filling the cylinder','To reduce compression','To let oil in'], answer:1,
          why:'Intake air is moving fast and has momentum. Closing at BDC would waste the charge that is still arriving.' },
      ] }),
    L({ id:'bmep', title:'Torque, power and mean effective pressure', ws:'dyno', minutes:8, xp:90,
      body:[
        'Torque is a *twisting force*. Power is torque multiplied by how fast you apply it: **power = torque × rpm**. That is why an engine can make huge torque and modest power (a truck diesel) or modest torque and huge power (a superbike).',
        'The number engineers actually compare engines by is **BMEP** — brake mean effective pressure. It is the average pressure that would have to act on the piston through the power stroke to produce the torque you measured, and it normalises out displacement entirely.',
        'A good naturally aspirated road engine makes about 11–12 bar BMEP. A race engine reaches 14–15. A modern turbo engine runs 22–26 bar, and a top fuel engine is beyond 100. When you fit an upgrade, watch BMEP on the dyno readout: if BMEP did not rise, the part did nothing.',
      ],
      steps:['Run a dyno pull and note peak torque and peak power rpm.',
             'Check they are at different rpm — power keeps rising after torque has peaked.',
             'Compare BMEP with another engine of very different size.'],
      quiz:[
        { q:'Peak power always happens…', options:['At the same rpm as peak torque','Below peak torque rpm','Above peak torque rpm','At the rev limiter'], answer:2,
          why:'Power = torque × rpm, so power keeps climbing after torque peaks, until torque falls faster than rpm rises.' },
        { q:'BMEP is useful because it…', options:['Measures fuel economy','Normalises for engine displacement','Only applies to turbo engines','Is measured in horsepower'], answer:1,
          why:'BMEP lets you compare a 1-litre engine and a 7-litre engine on equal terms.' },
      ] }),
    L({ id:'ve', title:'Volumetric efficiency: the engine is an air pump', ws:'dyno', minutes:7,
      body:[
        'An engine makes power by burning fuel, and it can only burn as much fuel as it has oxygen for. So **every power question is really an airflow question**.',
        'Volumetric efficiency (VE) is how much air actually enters the cylinder compared with its geometric volume. A standard road engine peaks around 85–95%. Good cams, ported heads and tuned intake and exhaust lengths can push a naturally aspirated engine past 100% — the pressure waves literally stuff extra air in.',
        'Forced induction attacks a different term: it raises the *density* of the air rather than the volume drawn. That is why a turbo engine can have mediocre VE and still make enormous power.',
      ],
      quiz:[
        { q:'A naturally aspirated engine reaching 105% VE means…', options:['It is turbocharged','Pressure-wave tuning is packing extra air in','The sensor is faulty','It is running lean'], answer:1,
          why:'Intake and exhaust pressure waves, correctly timed, can fill the cylinder beyond its swept volume.' },
      ] }),
  ]},

  { id:'bottomend', name:'Bottom end & assembly', icon:'🔩', lessons:[
    L({ id:'bearings', title:'Bearings, clearance and oil film', ws:'engine', minutes:8, xp:80,
      body:[
        'A crankshaft never touches its bearings when the engine is running properly. It floats on a wedge of pressurised oil a few microns thick — **hydrodynamic lubrication**. The oil pump does not create that film; rotation does. The pump only makes sure oil is there to be dragged into the wedge.',
        'Oil clearance is the gap between journal and bearing, typically **0.001 inch per inch of journal diameter**. Too tight and the film cannot form, so metal touches metal. Too loose and oil escapes out the sides faster than it can be replaced, pressure falls and the film collapses under load.',
        'This is why oil pressure falling at hot idle on a worn engine is a *symptom*, not a cause: the bearings have worn, the clearance has grown, and the oil is leaking out of the gaps.',
      ],
      steps:['Remove the oil pan, pickup and main caps in the Engine Bay.',
             'Look at the main bearing shells and read the clearance spec.',
             'Reassemble and torque the main caps from the centre outwards.'],
      quiz:[
        { q:'What actually creates the oil film that supports the crankshaft?', options:['The oil pump\'s pressure','Rotation dragging oil into a converging wedge','Gravity','The oil filter'], answer:1,
          why:'It is hydrodynamic: the spinning journal drags oil into a narrowing gap, and that generates the pressure that lifts the shaft.' },
        { q:'Excessive bearing clearance causes…', options:['Higher oil pressure','Lower oil pressure','No change','Better sealing'], answer:1,
          why:'Oil escapes the wider gap faster than the pump can supply it, so pressure drops.' },
      ] }),
    L({ id:'torque-seq', title:'Torque, stretch and why sequence matters', ws:'engine', minutes:9, xp:100,
      body:[
        'When you torque a bolt you are not really measuring tightness — you are trying to achieve a **clamp load**, and torque is only an indirect proxy for it. Most of the torque you apply is consumed by friction under the bolt head and in the threads. That is why the manual specifies whether the threads are oiled, dry, or coated.',
        '**Torque-to-yield** bolts are deliberately stretched past their elastic limit, which puts them on the flat part of the stress-strain curve where clamp load stays almost constant as the joint heats and grows. They are single-use — reusing one means starting from an unknown length.',
        'Sequence matters because a cylinder head is a beam. Tighten one end first and you bow the casting, and the joint at the other end will never seal. Always work **from the centre outwards**, in several increasing stages, then apply any angle stage.',
      ],
      steps:['Select the cylinder head and open its torque sheet.',
             'Run the torque wrench drill and follow the highlighted bolt sequence.',
             'Try deliberately torquing out of sequence and read the warning you get.'],
      quiz:[
        { q:'Why are torque-to-yield head bolts single use?', options:['They rust','They have been stretched past their elastic limit','They are cheap','The threads wear out'], answer:1,
          why:'Once yielded, the bolt has permanently deformed. Reusing it means the clamp load you achieve is unknown.' },
        { q:'Head bolts are tightened from the centre outwards because…', options:['It is faster','It stops the head bowing and lets the gasket load evenly','The centre bolts are longer','Tradition'], answer:1,
          why:'Starting at one end bends the head and the far end of the gasket never seals.' },
      ] }),
    L({ id:'balance', title:'Balance, firing order and why layouts sound different', ws:'engine', minutes:8,
      body:[
        'A single cylinder produces an unbalanced force every revolution. Add cylinders and those forces can be arranged to cancel. An **inline-6 is inherently balanced** in both primary and secondary order — that is a geometric fact, not a tuning achievement, and it is why straight sixes feel so smooth without balance shafts.',
        'A **cross-plane V8** has its crank pins at 90° intervals, so each bank fires unevenly (that burble). A **flat-plane V8** has pins at 180°, so each bank fires like an inline-4 — even, high-revving and much harsher.',
        'Firing order is chosen to spread the power pulses along the crank so it does not twist itself apart, and to stop two adjacent cylinders drawing from the intake at the same time. Change the firing order and you change the sound, the crank loading and the intake tuning all at once.',
      ],
      quiz:[
        { q:'Why is an inline-6 inherently balanced?', options:['Balance shafts','Its cylinder arrangement cancels primary and secondary forces','Heavy flywheel','Even firing only'], answer:1,
          why:'The geometry itself cancels both orders of vibration — no balance shafts required.' },
        { q:'A flat-plane V8 sounds different from a cross-plane V8 because…', options:['Different exhaust','Its crank pins are at 180° so each bank fires evenly','More cylinders','Higher compression'], answer:1,
          why:'Each bank behaves like an inline-4, giving even firing intervals and a much higher-pitched note.' },
      ] }),
  ]},

  { id:'head', name:'Head, cams & breathing', icon:'🌀', lessons:[
    L({ id:'cams', title:'Duration, lift, overlap and LSA', ws:'engine', minutes:9, xp:90,
      body:[
        '**Lift** is how far the valve opens; **duration** is how long it stays open, measured in crank degrees. Duration is what moves the torque curve: more duration keeps the valve open later, which suits high rpm where the air is moving fast, and hurts low rpm where it simply lets the charge blow back out.',
        '**Overlap** is the period when both valves are open around top dead centre. A little overlap lets exhaust scavenging pull fresh charge in. A lot of overlap gives you the lumpy race idle — and blows unburnt mixture straight out of the exhaust at low rpm.',
        '**Lobe separation angle** (LSA) is the angle between the intake and exhaust lobe peaks. Tight LSA (104–108°) means more overlap and a peakier engine. Wide LSA (112–116°) means less overlap — which is what turbo engines want, because boost would otherwise just push mixture out of the exhaust.',
      ],
      quiz:[
        { q:'Turbo engines usually run a wider lobe separation angle because…', options:['It sounds better','Less overlap stops boost pushing charge straight out the exhaust','It increases lift','It reduces friction'], answer:1,
          why:'With positive intake pressure, overlap would let boost blow through into the exhaust and waste fuel.' },
        { q:'Increasing camshaft duration usually…', options:['Adds low-rpm torque','Moves the power band higher and costs low-rpm torque','Has no effect on the curve','Raises compression'], answer:1,
          why:'A longer-open valve suits high gas velocity. At low rpm the charge gets pushed back out.' },
      ] }),
    L({ id:'timing-belt', title:'Timing the engine without bending valves', ws:'engine', minutes:8, xp:90,
      body:[
        'The camshaft must turn at exactly half crank speed, and it must be *phased* correctly — the right valve open at the right moment relative to the piston. Timing marks on the crank and cam sprockets exist purely to establish that phase.',
        'On an **interference engine** (most modern engines, and anything over about 10.5:1 compression), the valve at full lift occupies space the piston passes through. Get the timing wrong by a few teeth and the first crank rotation bends every valve it meets.',
        'The safe procedure is always the same: set both marks, fit the belt or chain with no slack on the drive side, release the tensioner, then **turn the engine over two full revolutions by hand** and check the marks line up again. If anything binds, stop — do not force it.',
      ],
      steps:['Remove the front cover and timing drive.','Reinstall it and confirm the marks align.','Turn the engine two revolutions and re-check.'],
      quiz:[
        { q:'On an interference engine, incorrect cam timing causes…', options:['Poor economy only','Valves striking pistons','Nothing until high rpm','Excess oil consumption'], answer:1,
          why:'The valve and piston share the same space at different times. Wrong phase means they meet.' },
      ] }),
  ]},

  { id:'boost', name:'Forced induction', icon:'💨', lessons:[
    L({ id:'turbo-basics', title:'How a turbocharger actually works', ws:'upgrade', minutes:9, xp:100,
      body:[
        'A turbocharger is two wheels on one shaft. Exhaust gas spins the **turbine**; the **compressor** on the other end pressurises the intake. Nothing is free: to spin the turbine you must hold back exhaust gas, which raises backpressure and costs pumping work. Boost is bought, not given.',
        'Two things limit boost. The **wastegate** deliberately bypasses exhaust around the turbine once target boost is reached. And the **compressor map** limits it physically — push too little air at too high a pressure ratio and the compressor **surges**; push too much and it chokes.',
        'Lag exists because the turbine has rotational inertia and needs exhaust energy to accelerate. Smaller turbines, twin turbos, twin-scroll housings, ball bearings and anti-lag all attack that same problem from different directions.',
      ],
      steps:['Fit a larger turbo in the Upgrade Shop and re-run the dyno.',
             'Note where the boost curve now starts and what happened below 3,000 rpm.',
             'Fit a twin-scroll housing and compare spool again.'],
      quiz:[
        { q:'Compressor surge happens when…', options:['Too much airflow','Too little airflow for the pressure ratio being demanded','The oil is cold','Boost is too low'], answer:1,
          why:'With not enough flow, the air stalls off the blades and reverses — that is the fluttering sound, and it destroys thrust bearings.' },
        { q:'A twin-scroll turbine housing improves spool by…', options:['Making the turbine bigger','Keeping exhaust pulses from adjacent-firing cylinders separate','Adding boost pressure directly','Cooling the exhaust'], answer:1,
          why:'Separated pulses arrive at the turbine sharp and strong instead of interfering with each other.' },
      ] }),
    L({ id:'intercooling', title:'Charge cooling and why it makes power', ws:'upgrade', minutes:7,
      body:[
        'Compressing air heats it. At 1.5 bar of boost, air leaves the compressor at well over 130 °C even though the compressor is doing its job perfectly — that is thermodynamics, not inefficiency.',
        'Hot air is a double problem. It is **less dense**, so you get less oxygen per unit of boost pressure. And it is far more prone to **knock**, which forces you to pull ignition timing, which costs more power still.',
        'An intercooler typically trades a small pressure drop (0.05–0.1 bar) for a large temperature drop (40–60 °C). That is almost always a winning trade. Water injection attacks the same problem chemically — evaporating water absorbs enormous heat right where it matters.',
      ],
      quiz:[
        { q:'The biggest benefit of a good intercooler on a tuned car is usually…', options:['Higher boost pressure','Denser charge and much less knock, so you can run more timing','Lower exhaust temperature only','Better fuel economy'], answer:1,
          why:'The knock margin it buys is worth more than the density gain alone.' },
      ] }),
  ]},

  { id:'tuning', name:'ECU tuning', icon:'💻', lessons:[
    L({ id:'lambda', title:'Lambda, AFR and where the power really is', ws:'tune', minutes:9, xp:100,
      body:[
        '**Lambda (λ)** is the ratio of the actual air/fuel ratio to the chemically correct one for that fuel. λ = 1.00 is stoichiometric whatever you are burning — 14.7:1 for gasoline, 9.8:1 for E85, 6.4:1 for methanol. This is why you should tune in lambda, not in AFR numbers.',
        'Maximum power is not at λ = 1. It is at about **λ 0.85–0.90** — slightly rich, because the extra fuel ensures every oxygen molecule finds a fuel molecule, and because evaporating fuel cools the charge. Maximum *efficiency* is slightly lean of stoichiometric, which is where a cruise map lives.',
        'Under boost, extra fuel is also **coolant**. A rotary at full load targets λ 0.75–0.78 not for power but to keep the apex seals alive. Going lean under boost is the single fastest way to destroy an engine.',
      ],
      steps:['Open the Tuning bay and look at the lambda table.',
             'Change the top load row to λ 1.00 and re-run the dyno — read the warnings.',
             'Use Auto-tune and compare the shape of the resulting table.'],
      quiz:[
        { q:'Best-power lambda for a gasoline engine is approximately…', options:['1.10','1.00','0.88','0.60'], answer:2,
          why:'Slightly rich of stoichiometric, roughly λ 0.85–0.90, gives the highest torque.' },
        { q:'Why do boosted engines run richer than stoichiometric at full load?', options:['Emissions','Charge cooling and detonation margin','Better fuel economy','To clean the injectors'], answer:1,
          why:'The extra fuel absorbs heat and lowers the chance of detonation, protecting pistons and turbine.' },
      ] }),
    L({ id:'knock', title:'Detonation, MBT and knock retard', ws:'tune', minutes:10, xp:120,
      body:[
        'Normal combustion is a flame front travelling smoothly across the chamber. **Detonation** is the unburnt end gas spontaneously exploding ahead of that front, producing a pressure spike that hammers the piston. It is what breaks ring lands and head gaskets.',
        '**MBT** — minimum advance for best torque — is the timing that puts peak cylinder pressure just after top dead centre, around 14–16° ATDC. Advancing past MBT does not make more power; it just makes more heat and more knock.',
        'What increases the octane an engine demands: more compression, more boost, higher intake temperature, more advance, a leaner mixture. What buys you margin: cooler charge, richer mixture, more octane, direct injection, and pre-chamber ignition. The ECU\'s knock sensor is a safety net, not a tuning strategy — if it is constantly pulling timing, the map is wrong.',
      ],
      steps:['Raise boost by 0.4 bar without touching the tables, and run the dyno.',
             'Read the knock warnings and the retard column.',
             'Auto-tune again and watch the timing table come back down.'],
      quiz:[
        { q:'Advancing ignition beyond MBT…', options:['Always makes more power','Makes no more power but more heat and knock risk','Reduces exhaust temperature safely','Improves economy'], answer:1,
          why:'MBT is by definition the timing for best torque. Past it you only add cylinder pressure at the wrong moment.' },
        { q:'Which of these does NOT increase the octane requirement?', options:['More boost','Higher intake air temperature','A richer mixture','More ignition advance'], answer:2,
          why:'Richer mixtures resist knock — the extra fuel cools the charge and slows the end-gas reaction.' },
      ] }),
    L({ id:'duty', title:'Injectors, duty cycle and fuel-system headroom', ws:'tune', minutes:7,
      body:[
        'Injector **duty cycle** is the fraction of the available time the injector is held open. Above about **85%** the injector no longer fully closes between pulses and flow stops being linear — so the fuelling you calibrated at 80% is not what you get at 95%.',
        'Changing fuel changes everything. E85 needs roughly **50% more volume** than gasoline for the same lambda, and methanol more than twice as much. That is why an E85 conversion begins with injectors and a pump, not with a map.',
        'On direct-injection engines the limit is usually the **cam-driven high-pressure pump**, not the injectors. It is the reason so many DI platforms hit a hard power ceiling that no amount of boost will get past.',
      ],
      quiz:[
        { q:'Switching from gasoline to E85 requires roughly…', options:['The same fuel volume','About 50% more fuel volume','Half the fuel volume','Only a timing change'], answer:1,
          why:'E85 is stoichiometric near 9.8:1 versus 14.7:1, so you must flow far more of it.' },
      ] }),
  ]},

  { id:'rotarydiesel', name:'Rotary & diesel', icon:'🔺', lessons:[
    L({ id:'wankel', title:'The Wankel: no pistons, no valves, no camshaft', ws:'engine', minutes:9, xp:100,
      body:[
        'A rotary has a triangular rotor orbiting inside an epitrochoid housing. Each of its three faces performs intake, compression, power and exhaust — so **one rotor is doing all four strokes simultaneously** on different faces.',
        'The rotor turns at one third of the eccentric shaft speed, and each face fires once per shaft revolution. That is why a 1.3-litre two-rotor behaves like a much larger four-stroke: it has three times the power events per revolution per unit of chamber volume.',
        'Intake and exhaust are **ports cut into the housings**, not valves — so port shape and position are the rotary\'s camshaft. The weak point is the **apex seals**: three per rotor, spring-loaded outward, sealing at up to 25 m/s while carrying full combustion pressure. Detonation kills them almost instantly, which is why rotaries are tuned deliberately rich.',
      ],
      quiz:[
        { q:'How does a rotary control intake and exhaust timing?', options:['Camshaft and valves','Port position and shape in the housings','Electronic solenoids','It does not'], answer:1,
          why:'Ports are the rotary\'s valve timing — street, bridge and peripheral porting move it dramatically.' },
        { q:'Why are turbo rotaries tuned so rich at full load?', options:['Emissions rules','To cool the apex seals and avoid detonation','Because the injectors are too big','Better fuel economy'], answer:1,
          why:'Extra fuel is coolant. A rotary that detonates loses apex seals immediately.' },
      ] }),
    L({ id:'diesel', title:'Compression ignition and why diesels make torque', ws:'engine', minutes:8,
      body:[
        'A diesel has **no spark plug**. Air alone is compressed to 16:1 or more, reaching 500–700 °C, and fuel injected at up to 2,000 bar ignites on contact. Timing is controlled entirely by *when you inject*, not by when a spark fires.',
        'Because there is no pre-mixed charge that can detonate, a diesel can run very high compression and very high boost. Combined with a long stroke, that produces enormous torque at low rpm — but the same long stroke limits rpm, so peak power is modest for the displacement.',
        'Diesels always run lean overall (λ 1.15 or leaner at full load). Fuelling past that produces visible soot — the "smoke limit" — which is why a diesel tune is fundamentally about how much fuel you can add before you run out of air.',
      ],
      quiz:[
        { q:'What ignites the fuel in a diesel?', options:['A spark plug','The heat of compressed air','A glow plug during running','A catalyst'], answer:1,
          why:'Compression heats the air past the fuel\'s auto-ignition temperature. Glow plugs only help a cold start.' },
      ] }),
  ]},

  { id:'chassis', name:'Chassis, suspension & brakes', icon:'🛞', lessons:[
    L({ id:'weight-transfer', title:'Weight transfer is the whole game', ws:'chassis', minutes:9, xp:100,
      body:[
        'A tyre\'s grip rises with the load on it — but **not proportionally**. Double the load and you get less than double the grip. This single non-linearity is why weight transfer matters so much: loading one tyre heavily while unloading its partner reduces the *total* grip of that axle.',
        'That is why anti-roll bars work as a balance tool. A stiffer bar makes an axle transfer more load across itself in a corner, which reduces that axle\'s total grip. **Stiffer front bar = more understeer. Stiffer rear bar = more oversteer.** You are not adding grip anywhere; you are choosing which end runs out first.',
        'The same logic governs springs, dampers, ride height and centre-of-gravity height. Lowering the car reduces total transfer; softening one end shifts transfer to the other.',
      ],
      steps:['Open the Chassis workspace and inspect the anti-roll bars.',
             'Read the roll-stiffness note and think about which end you would stiffen.'],
      quiz:[
        { q:'Fitting a stiffer rear anti-roll bar usually…', options:['Adds rear grip','Adds understeer','Adds oversteer','Has no effect'], answer:2,
          why:'It increases lateral load transfer at the rear, reducing that axle\'s total grip.' },
        { q:'Why does load transfer reduce an axle\'s total grip?', options:['The tyres get hot','Grip rises less than proportionally with load','The springs compress','Camber changes'], answer:1,
          why:'The heavily loaded tyre gains less than the unloaded one loses.' },
      ] }),
    L({ id:'geometry', title:'Camber, castor, toe and roll centres', ws:'chassis', minutes:9,
      body:[
        '**Camber** is the tyre\'s lean in the vertical plane. Negative camber keeps the tyre flat on the road as the body rolls — a strut car loses camber in bump, which is exactly why double wishbones are worth the packaging cost.',
        '**Castor** is the rearward lean of the steering axis. It gives self-centring and, usefully, adds negative camber to the outside wheel as you steer.',
        '**Toe** is the biggest lever on stability. A little toe-in at the rear calms a car under load; toe-out at the front makes it dive into corners and wander on the motorway. On a rear multilink, the toe link is the single most important adjustment there is.',
      ],
      quiz:[
        { q:'A MacPherson strut loses camber in bump. Double wishbones can gain it because…', options:['They are stiffer','The upper arm is shorter, which pulls the top of the wheel inward','They use spherical joints','They are lighter'], answer:1,
          why:'The short-long arm geometry generates camber gain as the wheel rises.' },
      ] }),
    L({ id:'brakes', title:'Brakes turn energy into heat — then throw it away', ws:'chassis', minutes:8,
      body:[
        'A bigger brake kit does **not** increase grip. The tyre decides how hard you can stop. What discs and calipers give you is **heat capacity and fade resistance** — the ability to do it repeatedly.',
        'Line pressure is pedal force × pedal ratio × booster assist ÷ master-cylinder area. Fit larger caliper pistons without matching the master cylinder and the pedal goes long and soft, because you now need more fluid volume for the same pad movement.',
        'Brake bias is set by the *ratio* of front to rear clamping torque. Too much front and you lock the fronts and go straight on; too much rear and the car spins. Weight transfer under braking is why almost every vehicle runs a strong front bias — and why a motorcycle uses roughly 90% front brake.',
      ],
      quiz:[
        { q:'A big brake kit primarily improves…', options:['Peak deceleration','Fade resistance and heat capacity','Tyre grip','Weight transfer'], answer:1,
          why:'Peak stopping is tyre-limited. Bigger brakes let you repeat it without fading.' },
      ] }),
  ]},

  { id:'electrical', name:'Electrical & audio', icon:'⚡', lessons:[
    L({ id:'circuits', title:'Fuses protect wire, not devices', ws:'wiring', minutes:8, xp:90,
      body:[
        'The rule that stops car fires: **a fuse protects the wire it feeds**, never the device on the end. You size the wire for the load and the run length, then fuse just above the wire\'s continuous rating. Fitting a bigger fuse to "stop it blowing" makes the wire the fuse.',
        'Voltage drop, not current rating, usually decides wire gauge on a vehicle. A long run to a rear-mounted amplifier can need far thicker cable than its current alone suggests, because dropping even half a volt matters at 12 V.',
        'A **relay** lets a thin switch wire control a thick power wire. The switch carries only coil current (a fraction of an amp), while the contacts carry the load. This is why headlight upgrades so often start with a relay harness.',
      ],
      steps:['Open the Wiring workspace and trace the starter circuit.',
             'Size a wire for a 40 A load over a 4 m run and check the recommendation.'],
      quiz:[
        { q:'A fuse is sized to protect…', options:['The device','The wire','The battery','The switch'], answer:1,
          why:'If the wire can carry 20 A continuously, the fuse goes just above that — regardless of what is on the end.' },
        { q:'Most mysterious electrical faults on a vehicle turn out to be…', options:['Bad fuses','Bad grounds','Weak batteries','Faulty relays'], answer:1,
          why:'Current must return to the battery negative. A corroded ground raises the reference voltage of everything on it.' },
      ] }),
    L({ id:'audio', title:'12 V audio: power, impedance and the alternator budget', ws:'audio', minutes:9,
      body:[
        'Amplifier current draw ≈ **RMS power ÷ (efficiency × 13.8 V)**. A 1,000 W RMS amplifier at 75% efficiency pulls close to 100 A at full output. That is a larger load than headlights, wipers and heater blower combined — and the alternator, not the battery, has to supply it.',
        '**Impedance** sets the load the amplifier sees. Two 4 Ω subwoofer voice coils in parallel present 2 Ω, which roughly doubles current draw and heat. Go below the amplifier\'s stable minimum and it will go into protection, or fail.',
        'Almost all blown tweeters are killed by **clipping**, not by power. A clipped signal is closer to a square wave, and its extra high-frequency energy all lands in the tweeter. Setting gains properly protects speakers better than any fuse.',
      ],
      steps:['Open the Audio workspace and build a system.',
             'Watch the alternator budget as you add amplifier power.',
             'Wire two subwoofers in parallel and see the impedance and current change.'],
      quiz:[
        { q:'Two 4 Ω speakers wired in parallel present…', options:['8 Ω','4 Ω','2 Ω','1 Ω'], answer:2,
          why:'Parallel resistances halve: 4 Ω ∥ 4 Ω = 2 Ω, which roughly doubles the current the amplifier draws.' },
        { q:'Tweeters are most often destroyed by…', options:['Too much clean power','Amplifier clipping','Cold weather','Low impedance'], answer:1,
          why:'A clipped waveform carries far more high-frequency energy than the music did, and the tweeter absorbs it.' },
      ] }),
  ]},

  { id:'bikes', name:'Motorcycles', icon:'🏍', lessons:[
    L({ id:'geometry-bike', title:'Rake, trail and why a bike steers', ws:'chassis', minutes:8, xp:80,
      body:[
        'A motorcycle turns by **leaning**, not by steering. To lean, the rider briefly steers *away* from the corner — countersteering — which moves the contact patch out from under the centre of mass and lets it fall into the turn.',
        '**Trail** is the distance between where the steering axis meets the ground and where the tyre actually touches. It is what makes the front wheel self-centre. More trail = more stability and heavier steering; less trail = quicker turn-in and less stability at speed.',
        'You change trail by changing rake, fork offset in the triple clamps, or ride height at either end. Raising the rear or dropping the front through the clamps steepens rake and quickens the steering — usually the first setup change a track rider makes.',
      ],
      quiz:[
        { q:'Increasing trail makes a motorcycle…', options:['Turn faster, less stable','Turn slower, more stable','Lighter','Unaffected'], answer:1,
          why:'More trail increases the self-centring effect, so it resists steering input and holds a line better.' },
        { q:'To initiate a right-hand turn at speed you first…', options:['Steer right','Steer left (countersteer)','Lean back','Brake hard'], answer:1,
          why:'A brief left input moves the contact patch left of the centre of mass, so the bike falls right.' },
      ] }),
    L({ id:'sag', title:'Setting sag before you touch a clicker', ws:'chassis', minutes:7,
      body:[
        '**Sag** is how far the suspension settles under weight. Rider sag should be roughly **30–33% of total travel** at both ends. It is set with spring preload, and it is the first thing to set on any bike — because it decides where in the stroke the suspension is operating.',
        'If sag is wrong, no damping adjustment can fix it. Too little sag and the suspension is topped out, so small bumps go straight to the chassis. Too much and it is riding deep in the stroke where the spring is already compressed and travel has run out.',
        'Critically, preload does **not** change spring rate. If correct sag needs more than about 10 mm of preload, the spring itself is wrong for your weight.',
      ],
      quiz:[
        { q:'Adding spring preload…', options:['Makes the spring stiffer','Changes ride height and sag but not the spring rate','Increases damping','Reduces travel available at the top'], answer:1,
          why:'Preload sets where in the stroke the suspension sits. Rate is a property of the spring itself.' },
      ] }),
  ]},

  { id:'safety', name:'Working safely', icon:'🛡', lessons:[
    L({ id:'shop-safety', title:'The things that actually hurt people', ws:'engine', minutes:6, xp:70,
      body:[
        'A vehicle on a jack is not supported — it is balanced. Always transfer the load onto **axle stands** on a hard level surface before any part of you goes underneath, and chock the wheels still on the ground.',
        'Fuel systems stay pressurised after the engine stops, and direct-injection rails hold **hundreds of bar**. Relieve pressure at the schrader or via the ECU procedure before opening any fuel line, and never crack a high-pressure DI line with the engine running.',
        'A hot cooling system is above 100 °C and under 1.1 bar — opening it sprays superheated coolant. Springs and pressurised struts store enough energy to kill: never disassemble a coilover without a proper compressor. And a turbo shut down hot will coke its bearing oil, so let it idle down.',
      ],
      quiz:[
        { q:'Before working under a vehicle you must…', options:['Set the handbrake','Support it on axle stands, not the jack','Leave it in gear','Loosen the wheels'], answer:1,
          why:'A jack is a lifting device, not a support. Axle stands carry the load.' },
        { q:'Why let a turbocharged engine idle before shutdown after hard use?', options:['To save fuel','So oil keeps flowing while the bearing cools','To recharge the battery','To clear the catalyst'], answer:1,
          why:'Shutting down hot stops oil flow through a red-hot bearing housing and cokes the oil in it.' },
      ] }),
  ]},
];

export const ALL_LESSONS = MODULES.flatMap(m => m.lessons.map(l => ({ ...l, module:m.id, moduleName:m.name })));
export const LESSON_BY_ID = Object.fromEntries(ALL_LESSONS.map(l => [l.id, l]));
export const TOTAL_XP = ALL_LESSONS.reduce((s,l) => s + l.xp, 0);
