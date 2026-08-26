/* MotorLab — dyno, drag strip and lap-time estimation.
 * The dyno reads the engine simulator; the vehicle sims integrate that torque
 * curve through the gearbox against mass, drag, downforce and tyre grip.
 */
import { simulate } from './engineSim.js';
import { wheelRadius, weightDistribution } from '../data/vehicles.js';

const RHO = 1.225, G = 9.81;

/** Wheel-power curve: crank torque minus drivetrain loss. */
export function dynoRun(e, tune, mods, v){
  const res = simulate(e, tune, mods, { load:100 });
  const loss = (v?.driveLoss ?? 0.14) + (mods.driveLoss ?? 0) - 0.14;
  const k = 1 - Math.max(0.03, Math.min(0.3, v ? v.driveLoss : 0.14));
  const pts = res.points.map(p => ({ ...p, whp: p.hp * k, wtq: p.tq * k }));
  return { ...res, points:pts, whp: Math.max(...pts.map(p => p.whp)),
           wtq: Math.max(...pts.map(p => p.wtq)), driveLossPct: (1-k)*100 };
}

function torqueLookup(points){
  const last = points[points.length - 1];
  return (rpm) => {
    if (rpm <= points[0].rpm) return points[0].tq * (rpm / points[0].rpm);
    if (rpm >= last.rpm) return last.tq;           // hold to the limiter, never fall to zero
    for (let i = 1; i < points.length; i++){
      if (points[i].rpm >= rpm){
        const a = points[i-1], b = points[i];
        const t = (rpm - a.rpm) / (b.rpm - a.rpm);
        return a.tq + (b.tq - a.tq) * t;
      }
    }
    return last.tq;
  };
}

export function vehicleMass(v, mods){ return v.massKg + (mods.weightKg || 0); }

export function gripCoef(v, mods){
  const base = v.tyreMu ?? (v.class === 'kart' ? 1.45 : v.class === 'bike' ? 1.25
             : ['formula','stockcar'].includes(v.id) ? 1.65 : 1.05);
  return base + (mods.gripBonus || 0);
}

/** Full acceleration run: 0–100 km/h, 0–200, quarter mile, top speed. */
export function accelerationRun(e, tune, mods, v, opts = {}){
  const res = simulate(e, tune, mods, { load:100 });
  const tq = torqueLookup(res.points);
  const mass = vehicleMass(v, mods);
  const rW = wheelRadius(v, true);
  const gears = v.gears, final = v.final * (v.primary || 1);
  const eff = 1 - (v.driveLoss ?? 0.14);
  const cdA = v.cd * v.area * (1 + (mods.dragBonus || 0));
  const dfMax = (v.downforceKg + (mods.downforceBonus || 0)) * G;                 // N, peak
  const dfK = dfMax / Math.pow(90, 2);                                             // N per (m/s)^2
  const downAt = (sp) => Math.min(dfMax, dfK * sp * sp);
  const mu = gripCoef(v, mods);
  const driveFrac = v.drivetrain === 'AWD' ? 1 : v.drivetrain === 'FWD' ? weightDistribution(v)
                  : (v.class === 'bike' ? 0.72 : 1 - weightDistribution(v));
  const shiftTime = opts.shiftTime ?? (v.class === 'bike' ? 0.06 : ['formula','super','dragster'].includes(v.id) ? 0.04 : 0.22);
  const idle = e.idle, limit = tune.revLimit;

  /* direct-drive cars (dragsters) launch on a slipping clutch near peak power */
  const launchRpm = gears.length === 1 ? tune.revLimit * 0.86
                  : Math.min(tune.revLimit * 0.94, Math.max(tune.launchRpm || 0, idle * 1.2));
  let t = 0, x = 0, spd = 0, gear = 0, shiftUntil = 0;
  const dt = 0.005, trace = [];
  const marks = {};
  let launchSlip = 0, stall = 0;

  for (let step = 0; step < 24000; step++){
    const rpm = Math.max(idle, spd / rW * gears[gear] * final * 60 / (2*Math.PI));
    if (rpm >= limit && gear < gears.length - 1 && t > shiftUntil){
      gear++; shiftUntil = t + shiftTime;
    }
    const inGear = t >= shiftUntil;
    /* a slipping clutch lets the engine sit at launch rpm until road speed catches up */
    const rpmT = gear === 0 ? Math.max(rpm, launchRpm) : rpm;
    const engTq = inGear ? tq(Math.min(rpmT, limit)) : 0;
    let wheelF = engTq * gears[gear] * final * eff / rW;

    /* traction limit including weight transfer and downforce */
    const down = mass * G * driveFrac + downAt(spd) * (v.class === 'bike' ? 0.6 : 0.5);
    const transfer = v.class === 'bike' ? 0.28 : 0.16;
    const maxF = mu * (down * (1 + (spd < 8 ? transfer : transfer * 0.3)));
    if (wheelF > maxF){ wheelF = maxF; launchSlip += dt; }

    const drag = 0.5 * RHO * cdA * spd * spd;
    const roll = mass * G * 0.013;
    const a = (wheelF - drag - roll) / mass;
    spd += a * dt; if (spd < 0) spd = 0;
    x += spd * dt; t += dt;

    if (!marks.kph100 && spd >= 27.78) marks.kph100 = t;
    if (!marks.kph200 && spd >= 55.56) marks.kph200 = t;
    if (!marks.mph60 && spd >= 26.82) marks.mph60 = t;
    if (!marks.q && x >= 402.34){ marks.q = t; marks.qSpeed = spd * 3.6; }
    if (!marks.eighth && x >= 201.17) marks.eighth = t;
    if (step % 12 === 0) trace.push({ t, v:spd*3.6, x, rpm, gear:gear+1, a: a/G });
    /* stop once genuinely out of acceleration — not merely mid-shift */
    if (inGear && a < 0.03 && spd > 20) stall += dt; else stall = 0;
    if (stall > 0.75 && marks.q) break;
    if (t > 120) break;
  }
  /* top speed: where thrust equals drag in the highest usable gear */
  let vmax = 0;
  for (let s = 5; s < 160; s += 0.5){
    let best = 0;
    for (let g = 0; g < gears.length; g++){
      const rpm = s / rW * gears[g] * final * 60 / (2*Math.PI);
      if (rpm > limit || rpm < idle) continue;
      best = Math.max(best, tq(rpm) * gears[g] * final * eff / rW);
    }
    const drag = 0.5 * RHO * cdA * s * s + vehicleMass(v, mods) * G * 0.013;
    if (best > drag) vmax = s;
  }
  return { trace, marks, vmaxKph: vmax * 3.6, mass, res, gearCount: gears.length,
           powerToWeight: res.hp / (mass/1000), launchSlip };
}

/** Very rough lap-time model: a track is a list of corner radii and straights. */
export function lapTime(e, tune, mods, v, track){
  const res = simulate(e, tune, mods, { load:100 });
  const tq = torqueLookup(res.points);
  const mass = vehicleMass(v, mods);
  const mu = gripCoef(v, mods);
  const cdA = v.cd * v.area * (1 + (mods.dragBonus || 0));
  const dfMax = (v.downforceKg + (mods.downforceBonus || 0)) * G;
  const dfK = dfMax / Math.pow(90, 2);
  const downAt = (sp) => Math.min(dfMax, dfK * sp * sp);
  const rW = wheelRadius(v, true), gears = v.gears, final = v.final * (v.primary || 1);
  const eff = 1 - (v.driveLoss ?? 0.14);
  const brakeMu = mu * (1 + (mods.brakeBonus || 0) * 0.35);

  /* corner speeds */
  const cornerV = track.corners.map(r => {
    let s = 10;
    for (let i = 0; i < 40; i++){
      const down = mass * G + downAt(s);
      s = Math.sqrt(mu * down * r / mass);
    }
    return s;
  });
  let time = 0;
  for (let i = 0; i < track.corners.length; i++){
    const vIn = cornerV[i], vOut = cornerV[(i+1) % cornerV.length];
    const straight = track.straights[i];
    /* accelerate from vIn along the straight, then brake to vOut */
    let s = vIn, x = 0, dt = 0.02, tAcc = 0;
    const brakeDecel = brakeMu * G * 1.05;
    while (x < straight && tAcc < 60){
      const bDist = Math.max(0, (s*s - vOut*vOut) / (2*brakeDecel));
      let a;
      if (straight - x <= bDist){ a = -brakeDecel; }
      else {
        let best = 0;
        for (let g = 0; g < gears.length; g++){
          const rpm = s / rW * gears[g] * final * 60 / (2*Math.PI);
          if (rpm > tune.revLimit || rpm < e.idle) continue;
          best = Math.max(best, tq(rpm) * gears[g] * final * eff / rW);
        }
        const down = mass * G + downAt(s);
        best = Math.min(best, mu * down * (v.drivetrain === 'AWD' ? 1 : 0.62));
        a = (best - 0.5*RHO*cdA*s*s - mass*G*0.013) / mass;
      }
      s = Math.max(3, s + a*dt); x += s*dt; tAcc += dt;
    }
    time += tAcc + (track.cornerArc[i] ?? (Math.PI/2 * track.corners[i])) / Math.max(6, vIn);
  }
  return { seconds: time, cornerV, avgKph: (track.lengthM/1000) / (time/3600) };
}

export const TRACKS = [
  { id:'club', name:'Club circuit', lengthM:2400,
    corners:[38, 90, 25, 140, 60, 45], cornerArc:[70,120,45,110,90,70],
    straights:[320, 210, 480, 160, 260, 190] },
  { id:'gp', name:'Grand prix circuit', lengthM:5300,
    corners:[95, 38, 130, 24, 70, 175, 45, 58, 30], cornerArc:[150,80,190,60,120,240,90,110,70],
    straights:[900, 240, 420, 180, 610, 330, 250, 300, 200] },
  { id:'street', name:'Street course', lengthM:3100,
    corners:[22, 30, 60, 18, 45, 80, 26], cornerArc:[60,70,100,50,90,130,55],
    straights:[560, 190, 300, 140, 420, 230, 180] },
  { id:'oval', name:'Superspeedway oval', lengthM:4000,
    corners:[240, 240, 240, 240], cornerArc:[420,420,420,420],
    straights:[900, 180, 900, 180] },
  { id:'kart', name:'Kart track', lengthM:1150,
    corners:[14, 22, 9, 30, 16, 12], cornerArc:[35,50,25,60,40,30],
    straights:[180, 90, 140, 70, 120, 85] },
];
