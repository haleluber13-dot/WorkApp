/* MotorLab — 12 V electrical systems, wiring and car audio. */

/* AWG → cross-section and realistic chassis-wiring ampacity */
export const WIRE = [
  { awg:20, mm2:0.52,  amps:5   }, { awg:18, mm2:0.82,  amps:8   },
  { awg:16, mm2:1.31,  amps:12  }, { awg:14, mm2:2.08,  amps:18  },
  { awg:12, mm2:3.31,  amps:28  }, { awg:10, mm2:5.26,  amps:40  },
  { awg:8,  mm2:8.37,  amps:60  }, { awg:6,  mm2:13.3,  amps:85  },
  { awg:4,  mm2:21.2,  amps:130 }, { awg:2,  mm2:33.6,  amps:180 },
  { awg:0,  mm2:53.5,  amps:255 }, { awg:-2, mm2:85.0,  amps:360, label:'2/0' },
];
export const FUSE_SIZES = [5,7.5,10,15,20,25,30,40,50,60,80,100,125,150,200,250,300];

/** Resistivity of copper, ohm·mm²/m. */
const RHO_CU = 0.0172;

/** Pick a wire for a load: both ampacity and voltage drop must be satisfied. */
export function sizeWire(amps, lengthM, maxDropV = 0.5, volts = 13.8){
  const runM = lengthM * 2;                       // out and back (chassis ground counts)
  for (const w of WIRE){
    if (w.amps < amps * 1.15) continue;
    const drop = (RHO_CU * runM / w.mm2) * amps;
    if (drop <= maxDropV) return { ...w, dropV:drop, dropPct: drop/volts*100 };
  }
  const w = WIRE[WIRE.length - 1];
  const drop = (RHO_CU * runM / w.mm2) * amps;
  return { ...w, dropV:drop, dropPct: drop/volts*100, marginal:true };
}
export function voltageDrop(awgEntry, amps, lengthM){
  return (RHO_CU * lengthM * 2 / awgEntry.mm2) * amps;
}
export function recommendFuse(wire){
  return FUSE_SIZES.find(f => f >= wire.amps * 0.8) || FUSE_SIZES[FUSE_SIZES.length-1];
}

/* ---------------------------------------------------------------------- */
/* circuits laid out on the wiring board (x, y in 0..1)                    */

export const CIRCUITS = [
  { id:'starting', name:'Starting circuit', current:'150–800 A for 1–3 s',
    teach:'The highest-current circuit on any vehicle, and the only one that is deliberately unfused — a fuse that could carry starter current would be useless as protection. The ignition switch energises the solenoid, and the solenoid\'s contacts carry the real load.',
    nodes:[
      { id:'bat+',   name:'Battery +',        x:.10, y:.22, type:'source' },
      { id:'bat-',   name:'Battery −',        x:.10, y:.78, type:'ground' },
      { id:'sw',     name:'Ignition switch',  x:.38, y:.16, type:'switch' },
      { id:'sol',    name:'Starter solenoid', x:.63, y:.28, type:'relay' },
      { id:'starter',name:'Starter motor',    x:.86, y:.42, type:'load' },
      { id:'gnd',    name:'Engine ground strap', x:.60, y:.80, type:'ground' },
    ],
    links:[ ['bat+','sw'], ['sw','sol'], ['bat+','sol'], ['sol','starter'], ['starter','gnd'], ['gnd','bat-'] ],
    faults:[
      { id:'gndstrap', name:'Corroded engine ground strap', breaks:['gnd','bat-'],
        symptom:'Starter clicks or turns slowly; headlights dim heavily while cranking.',
        fix:'Clean and re-terminate the engine-to-chassis strap. Current cannot get back to the battery.' },
      { id:'sol-fail', name:'Failed solenoid contacts', breaks:['sol','starter'],
        symptom:'One loud click, no crank, battery is fine and lights stay bright.',
        fix:'The solenoid coil pulls in but its high-current contacts are burnt.' },
    ] },

  { id:'charging', name:'Charging circuit', current:'80–180 A',
    teach:'The alternator, not the battery, powers a running vehicle. Its regulator holds the system at about 14.2 V, and any voltage drop between alternator and battery makes the regulator over- or under-charge because it senses the wrong voltage.',
    nodes:[
      { id:'alt',  name:'Alternator B+',      x:.14, y:.30, type:'source' },
      { id:'reg',  name:'Voltage regulator',  x:.14, y:.66, type:'module' },
      { id:'fus',  name:'Main fusible link',  x:.40, y:.30, type:'fuse' },
      { id:'bat+', name:'Battery +',          x:.66, y:.24, type:'source' },
      { id:'dist', name:'Distribution block', x:.66, y:.60, type:'junction' },
      { id:'bat-', name:'Battery − / chassis',x:.88, y:.78, type:'ground' },
    ],
    links:[ ['alt','fus'], ['fus','bat+'], ['bat+','dist'], ['reg','alt'], ['dist','bat-'] ],
    faults:[
      { id:'badlink', name:'Burnt fusible link', breaks:['fus','bat+'],
        symptom:'Battery light on, system voltage drops to ~12.4 V and falls as you drive.',
        fix:'The alternator output never reaches the battery — the vehicle is running off stored charge.' },
    ] },

  { id:'ignition', name:'Ignition & injection', current:'8–25 A',
    teach:'The ECU switches coils and injectors on their *ground* side, so power is present at both all the time and the ECU completes the circuit. That is why probing for 12 V at an injector tells you almost nothing on its own.',
    nodes:[
      { id:'bat+',  name:'Battery +',        x:.08, y:.30, type:'source' },
      { id:'relay', name:'Main relay',       x:.30, y:.22, type:'relay' },
      { id:'fuse',  name:'ECU fuse 15 A',    x:.30, y:.62, type:'fuse' },
      { id:'ecu',   name:'ECU',              x:.54, y:.44, type:'module' },
      { id:'coils', name:'Ignition coils',   x:.80, y:.22, type:'load' },
      { id:'inj',   name:'Injectors',        x:.80, y:.52, type:'load' },
      { id:'crk',   name:'Crank sensor',     x:.54, y:.82, type:'sensor' },
      { id:'gnd',   name:'ECU ground',       x:.30, y:.86, type:'ground' },
    ],
    links:[ ['bat+','relay'], ['relay','fuse'], ['fuse','ecu'], ['relay','coils'], ['relay','inj'],
            ['ecu','coils'], ['ecu','inj'], ['crk','ecu'], ['ecu','gnd'] ],
    faults:[
      { id:'nocrk', name:'Crank sensor open circuit', breaks:['crk','ecu'],
        symptom:'Engine cranks but never fires; no rpm shown on the dash while cranking.',
        fix:'With no crank signal the ECU does not know where TDC is, so it fires nothing at all.' },
      { id:'relayfail', name:'Main relay not pulling in', breaks:['relay','coils'],
        symptom:'Dead — no fuel pump prime, no spark, but the starter turns normally.',
        fix:'The relay feeds everything the engine needs. Check its coil trigger before condemning the ECU.' },
    ] },

  { id:'lighting', name:'Lighting circuit', current:'10–20 A',
    teach:'Classic upgrade case: a switch that carries full headlight current will eventually burn. A relay harness moves the current to a short thick wire straight from the battery and leaves the switch carrying only coil current.',
    nodes:[
      { id:'bat+',  name:'Battery +',       x:.10, y:.26, type:'source' },
      { id:'fuse',  name:'Fuse 20 A',       x:.32, y:.26, type:'fuse' },
      { id:'relay', name:'Headlight relay', x:.54, y:.40, type:'relay' },
      { id:'sw',    name:'Light switch',    x:.32, y:.74, type:'switch' },
      { id:'lampL', name:'Left headlight',  x:.84, y:.26, type:'load' },
      { id:'lampR', name:'Right headlight', x:.84, y:.58, type:'load' },
      { id:'gnd',   name:'Chassis ground',  x:.58, y:.86, type:'ground' },
    ],
    links:[ ['bat+','fuse'], ['fuse','relay'], ['sw','relay'], ['relay','lampL'], ['relay','lampR'],
            ['lampL','gnd'], ['lampR','gnd'] ],
    faults:[
      { id:'onelamp', name:'One headlight ground corroded', breaks:['lampR','gnd'],
        symptom:'One headlight out; the bulb tests fine on the bench.',
        fix:'A load needs both a feed and a return. This one has lost its return path.' },
    ] },

  { id:'audio', name:'Audio power circuit', current:'40–150 A',
    teach:'An amplifier is one of the largest continuous loads you can add. Its power wire must be fused within 30 cm of the battery — that fuse protects the cable in a crash, not the amplifier.',
    nodes:[
      { id:'bat+',  name:'Battery +',            x:.08, y:.30, type:'source' },
      { id:'mainf', name:'Main fuse (≤30 cm)',   x:.28, y:.30, type:'fuse' },
      { id:'dist',  name:'Distribution block',   x:.50, y:.30, type:'junction' },
      { id:'amp',   name:'Amplifier',            x:.74, y:.44, type:'load' },
      { id:'hu',    name:'Head unit (remote)',   x:.50, y:.76, type:'module' },
      { id:'gnd',   name:'Chassis ground (<45 cm)', x:.74, y:.82, type:'ground' },
      { id:'spk',   name:'Speakers / subwoofer', x:.93, y:.22, type:'load' },
    ],
    links:[ ['bat+','mainf'], ['mainf','dist'], ['dist','amp'], ['hu','amp'], ['amp','gnd'], ['amp','spk'] ],
    faults:[
      { id:'longgnd', name:'Ground run to the far side of the boot', breaks:['amp','gnd'],
        symptom:'Amplifier goes into protection at high volume; alternator whine through the speakers.',
        fix:'Ground the amplifier to bare chassis metal within about 45 cm. A long ground is a resistor and an aerial.' },
    ] },
];
export const CIRCUIT_BY_ID = Object.fromEntries(CIRCUITS.map(c => [c.id, c]));

/* ---------------------------------------------------------------------- */
/* audio components                                                        */

export const AUDIO = {
  headunits:[
    { id:'hu-oem',   name:'Factory head unit',      preOutV:0,   cost:0,   teach:'Speaker-level outputs only. You need a line-output converter to feed an aftermarket amplifier, and its signal is already equalised by the factory tune.' },
    { id:'hu-basic', name:'Aftermarket head unit',  preOutV:2.0, cost:220, teach:'2 V pre-outs and a basic 3-band EQ. Fine for a modest system.' },
    { id:'hu-dsp',   name:'DSP head unit',          preOutV:5.0, cost:640, teach:'5 V pre-outs, 31-band EQ, time alignment and active crossovers. Time alignment alone transforms staging in a car, where you sit far closer to one speaker than the other.' },
  ],
  amps:[
    { id:'amp-4x75',  name:'4-channel 75 W RMS',     rms:300,  ch:4, eff:0.65, cost:280, teach:'Class A/B: cleaner but only about 65% efficient, so it draws more current and makes real heat.' },
    { id:'amp-4x150', name:'4-channel 150 W RMS',    rms:600,  ch:4, eff:0.72, cost:520, teach:'Enough for a full active front stage plus rear fill.' },
    { id:'amp-mono1', name:'Monoblock 1000 W RMS',   rms:1000, ch:1, eff:0.78, cost:610, teach:'Class D: efficient and compact, ideal for subwoofers where its high-frequency limitations do not matter.' },
    { id:'amp-mono3', name:'Monoblock 3000 W RMS',   rms:3000, ch:1, eff:0.80, cost:1400, teach:'At 3 kW you are past what a standard alternator can supply. This is where a high-output alternator and a second battery become mandatory, not optional.' },
  ],
  speakers:[
    { id:'sp-coax',   name:'6.5" coaxial pair',       rms:60,  ohm:4, cost:110, teach:'Tweeter mounted in the middle of the woofer. Simple, but the tweeter fires from a door card at knee height.' },
    { id:'sp-comp',   name:'6.5" component set',      rms:100, ohm:4, cost:340, teach:'Separate tweeter you can mount high on the A-pillar, with a passive crossover. Far better staging.' },
    { id:'sp-active', name:'3-way active front stage', rms:150, ohm:4, cost:780, teach:'Every driver gets its own amplifier channel and its own crossover in the DSP. Maximum control, most tuning work.' },
  ],
  subs:[
    { id:'sub-single10', name:'Single 10" sub, sealed',   rms:400,  ohm:4, cost:210, teach:'Sealed enclosures are tight and accurate with a gentle roll-off that suits the cabin gain of a car.' },
    { id:'sub-single12', name:'Single 12" sub, ported',   rms:800,  ohm:2, cost:340, teach:'A port resonates at a tuned frequency, adding several dB over a narrow band — much louder, less accurate below tuning.' },
    { id:'sub-dual15',   name:'Dual 15" subs, ported',    rms:2400, ohm:1, cost:980, teach:'A 1 Ω final load doubles amplifier current draw again. Check the amplifier is rated stable at that impedance.' },
  ],
};

export function ampCurrentDraw(rmsW, eff, volts = 13.8){ return rmsW / (eff * volts); }
export function parallelImpedance(ohms){ return 1 / ohms.reduce((s,o) => s + 1/o, 0); }
export function seriesImpedance(ohms){ return ohms.reduce((s,o) => s + o, 0); }

/** Electrical budget for a build: does the alternator cover it? */
export function powerBudget(alternatorA, loads){
  const total = loads.reduce((s,l) => s + l.amps, 0);
  return { total, alternatorA, headroom: alternatorA - total,
    ok: total <= alternatorA * 0.85,
    verdict: total > alternatorA ? 'Over budget — the battery is being drained while you drive.'
           : total > alternatorA * 0.85 ? 'Very close to the alternator limit; voltage will sag at idle.'
           : 'Within the alternator\'s capacity.' };
}

export const BASE_LOADS = [
  { name:'ECU, sensors & fuel pump', amps:14 },
  { name:'Ignition coils',           amps:7  },
  { name:'Headlights (halogen)',     amps:12 },
  { name:'Heater blower (max)',      amps:18 },
  { name:'Cooling fans',             amps:26 },
  { name:'Wipers, dash & misc',      amps:9  },
];
