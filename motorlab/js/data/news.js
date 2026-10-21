/* MotorLab — bundled news seed. The Updates channel merges anything newer from
 * the feed on top of this, so the app keeps learning about new cars, engines,
 * tracks and race series without a rebuild. */

export const NEWS_CATEGORIES = [
  { id:'car',   name:'New cars',      icon:'🚗' },
  { id:'bike',  name:'New bikes',     icon:'🏍' },
  { id:'engine',name:'Engines & tech',icon:'⚙'  },
  { id:'race',  name:'Racing',        icon:'🏁' },
  { id:'track', name:'Tracks & roads',icon:'🛣'  },
  { id:'tuning',name:'Tuning scene',  icon:'🔧' },
];

export const NEWS_SEED = [
  { id:'n-hybridv6', date:'2026-08-12', cat:'engine', title:'Small-capacity turbo hybrids keep displacing big naturally aspirated engines',
    body:'The pattern across road and race categories is the same: shrink the displacement, add a turbo, and recover exhaust and braking energy electrically. A 1.6 L turbo hybrid V6 in top-flight single-seaters exceeds 50% thermal efficiency — roughly double what a good naturally aspirated road engine manages. Load the F1-style V6 in MotorLab and compare its BMEP against the 6.5 L V12.' },
  { id:'n-e85', date:'2026-08-02', cat:'tuning', title:'Flex-fuel conversions remain the cheapest real power per unit spent',
    body:'On a boosted engine, moving from pump gasoline to E85 typically buys 3–6° of ignition timing and 0.2–0.4 bar of usable boost, purely through octane and charge cooling. The catch is volume: E85 needs roughly 50% more fuel flow, so injectors and pump come first. Try it in the Tuning bay — switch fuel, auto-tune, and watch injector duty.' },
  { id:'n-rotary-range', date:'2026-07-21', cat:'engine', title:'The rotary returns as a generator, not a driven engine',
    body:'Single-rotor Wankels are appearing as range extenders rather than drive engines. Running at one constant, optimal load point sidesteps the rotary\'s two historic weaknesses — part-load fuel consumption and emissions — while keeping its remarkable power-to-size ratio. The apex-seal physics in MotorLab\'s rotary teardown are unchanged.' },
  { id:'n-hydrogen', date:'2026-07-08', cat:'engine', title:'Hydrogen combustion engines gain traction in endurance racing',
    body:'Hydrogen burns in an otherwise conventional piston engine with almost no carbon in the exhaust. The engineering problems are storage density, NOx at high combustion temperature, and pre-ignition — hydrogen has a very wide flammability range and a very low ignition energy, so it will light off anything hot in the chamber.' },
  { id:'n-800v', date:'2026-06-28', cat:'car', title:'800-volt architectures move down from supercars to mainstream EVs',
    body:'Doubling pack voltage halves the current for the same power, which means thinner cable, less heat and much faster DC charging. It is exactly the voltage-drop arithmetic in MotorLab\'s wiring lesson, applied at a scale where it saves tens of kilograms of copper.' },
  { id:'n-v8-return', date:'2026-06-15', cat:'car', title:'Naturally aspirated V8s survive where sound and response are the product',
    body:'Flat-plane V8s persist in low-volume sports cars for the same reasons they always have: a lighter crank, even firing per bank and an 8,000+ rpm ceiling. The cost is secondary imbalance you can feel — compare the flat-plane and cross-plane V8s side by side in the Engine Bay and watch the crank throws.' },
  { id:'n-bike-cruise', date:'2026-06-02', cat:'bike', title:'Radar cruise and IMU-based rider aids reach the middleweight class',
    body:'Six-axis inertial measurement units, once superbike-only, are now standard on middleweight naked bikes. Lean-sensitive traction control and cornering ABS both depend on knowing lean angle in real time — the same sensor data the ECU uses to decide how much torque the rear tyre can accept.' },
  { id:'n-motogp-aero', date:'2026-05-20', cat:'race', title:'Motorcycle aerodynamics have become a genuine development war',
    body:'Winglets, ride-height devices and ground-effect fairings now shape grand prix motorcycle design as much as chassis geometry does. Downforce fights wheelie under acceleration, which lets riders use more of the engine earlier — the same trade-off cars solved with wings decades ago.' },
  { id:'n-newtrack', date:'2026-05-04', cat:'track', title:'New-generation circuits are being designed around overtaking, not lap time',
    body:'Recent circuit design favours long acceleration zones into heavy braking areas with multiple lines, rather than sequences of fast sweepers. It is a direct response to the aerodynamic wake problem — a car cannot follow closely through a fast corner, but it can outbrake into a slow one.' },
  { id:'n-drift-power', date:'2026-04-18', cat:'tuning', title:'Professional drift power keeps climbing past 1,000 hp',
    body:'Top-level drift entries now routinely exceed 1,000 hp, chasing tyre speed rather than lap time. The engineering focus is cooling and driveshaft durability: sustained wheelspin puts enormous continuous heat into the differential and the tyres in a way circuit racing never does.' },
  { id:'n-synthetic', date:'2026-04-02', cat:'engine', title:'Synthetic and e-fuels are being trialled to keep combustion classes running',
    body:'Drop-in synthetic fuels made from captured CO₂ and renewable hydrogen behave like gasoline in an existing engine. Their appeal is that the entire installed base of engines and infrastructure keeps working — the challenge is the energy cost of manufacturing them.' },
  { id:'n-karting-electric', date:'2026-03-22', cat:'race', title:'Electric karting classes expand at club level',
    body:'Instant torque and no gearbox make karting a natural fit for electric power, and indoor venues gain enormously from no exhaust extraction. Chassis setup theory is unchanged: with no differential and no suspension, frame flex still does all the work.' },
  { id:'n-vtwin', date:'2026-03-10', cat:'bike', title:'Air-cooled V-twins persist through tighter emissions with clever thermal management',
    body:'Precision oil cooling of the rear cylinder head, variable valve timing and closed-loop fuelling have kept large air-cooled twins compliant. The trade-off has always been thermal: the rear cylinder sits in the front cylinder\'s hot air.' },
  { id:'n-brakes', date:'2026-02-25', cat:'tech', title:'Brake dust regulation drives coated and carbon-ceramic discs downmarket',
    body:'Particulate rules that count non-exhaust emissions have pushed tungsten-carbide-coated iron discs into ordinary road cars. They shed far less dust and resist corrosion — and, incidentally, fade less, which is the reason enthusiasts wanted them anyway.' },
  { id:'n-3dprint', date:'2026-02-08', cat:'engine', title:'Printed pistons and heads move from prototype to low-volume production',
    body:'Additively manufactured aluminium pistons allow cooling galleries in shapes no casting can produce, cutting crown temperature significantly. Lower crown temperature means more knock margin, which means more boost or more timing for the same fuel.' },
];

export function newsSorted(items){
  return [...items].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}
