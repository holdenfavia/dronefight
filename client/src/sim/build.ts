// A loadout as the flight models see it (ADR-0065, ADR-0066): the quad's parts with its propeller, the weight
// of what it carries and where, and honest stats from short headless runs of the same models it flies with.

import { Quaternion, Vector3 } from 'three';
import { DEFAULT_RATES, PHYSICAL_SPECS, SIM, type PhysicalQuadSpec } from '../config';
import { DRONE_CLASSES } from '../../../shared/drones';
import { loadoutKey, totalKg, type Loadout } from '../../../shared/loadout';
import { PROPELLERS } from '../../../shared/propellers';
import { SPECIALS } from '../../../shared/specials';
import { WEAPONS } from '../../../shared/weapons';
import { createFlightOutput, rateSetpoint, type FlightState } from './flightModel';
import { PhysicalQuad, thrustStand, withPropeller, type Part, type PhysicalStepInput } from './physicalQuad';
import { maxRate } from './rates';
import { stepWing, WING } from './wingModel';

type QuadBody = keyof typeof PHYSICAL_SPECS;

export function isQuadBody(body: Loadout['body']): body is QuadBody {
  return body in PHYSICAL_SPECS;
}

/** The physical spec a quad loadout flies: its body's parts on its chosen propeller (ADR-0065). */
export function quadSpec(l: Loadout): PhysicalQuadSpec {
  const body = l.body as QuadBody;
  const prop = PROPELLERS[l.propeller];
  return withPropeller(PHYSICAL_SPECS[body], prop.blade, prop.kg);
}

/**
 * What a quad carries, as parts at their mounts (ADR-0066): hardpoints 1-2 forward and 3-4 aft, left and right,
 * just under the frame; the special at the centre underneath.
 */
export function payload(l: Loadout, spec: PhysicalQuadSpec): Part[] {
  const x = spec.layout.reachX * 0.5;
  const z = spec.layout.reachZ * 0.4;
  const y = -0.02;
  const parts: Part[] = [];
  l.weapons.forEach((w, i) => {
    if (!w) return;
    const side = i % 2 === 0 ? -1 : 1;
    const fore = i < 2 ? -1 : 1;
    parts.push({ mass: WEAPONS[w].kg, at: [side * x, y, fore * z] });
  });
  if (l.special && SPECIALS[l.special].kg > 0) parts.push({ mass: SPECIALS[l.special].kg, at: [0, y, 0] });
  return parts;
}

export type Handling = { label: string; level: 'good' | 'heavy' | 'pig' | 'grounded' };

export interface BuildStats {
  /** All-up weight (kg) and max static thrust (kgf). */
  kg: number;
  thrustKg: number;
  thrustToWeight: number;
  /** Hover throttle (0..1 of stick; for the 3D quad, of the upper half), or null for the wing. */
  hover: number | null;
  /** Level top speed (km/h) and how quickly it reaches full roll rate (0..100). */
  topSpeedKmh: number;
  agility: number;
  handling: Handling;
}

const cache = new Map<string, BuildStats>();

/** A build's stats, from the real flight model (cached per build). */
export function buildStats(l: Loadout): BuildStats {
  const key = loadoutKey(l);
  let s = cache.get(key);
  if (!s) {
    s = isQuadBody(l.body) ? quadStats(l) : wingStats(l);
    cache.set(key, s);
  }
  return s;
}

function quadStats(l: Loadout): BuildStats {
  const spec = quadSpec(l);
  const parts = payload(l, spec);
  const stand = thrustStand(spec, parts);
  const kg = totalKg(l);
  const tw = stand.thrustKg / kg;
  return {
    kg,
    thrustKg: stand.thrustKg,
    thrustToWeight: tw,
    hover: tw > 1 ? hoverThrottle(spec, parts) : null,
    topSpeedKmh: tw > 1 ? quadTopSpeed(spec, parts) : 0,
    agility: tw > 1 ? quadAgility(spec, parts) : 0,
    handling: quadHandling(tw),
  };
}

function quadHandling(tw: number): Handling {
  if (tw <= 1) return { label: 'Too heavy to take off', level: 'grounded' };
  if (tw < 1.8) return { label: 'Barely flies', level: 'pig' };
  if (tw < 3) return { label: 'Heavy and sluggish', level: 'heavy' };
  return { label: 'Agile', level: 'good' };
}

/** A free rigid body for headless runs: no Rapier, no ground, principal inertia in the body frame. */
class Flyer {
  readonly q: PhysicalQuad;
  readonly state: FlightState = { rotation: new Quaternion(), linvel: new Vector3(), angvel: new Vector3(), motorOutput: 0, time: 0 };
  private readonly input: PhysicalStepInput = { throttle: 0, setpoint: new Vector3(), roll: 0, pitch: 0, yaw: 0, armed: true, agl: Infinity };
  private readonly inv = new Quaternion();
  private readonly w = new Vector3();
  private readonly dq = new Quaternion();

  constructor(spec: PhysicalQuadSpec, parts: Part[]) {
    this.q = new PhysicalQuad(spec, parts);
  }

  step(throttle: number, roll: number, pitch: number, dt: number): void {
    const { state, input, q } = this;
    input.throttle = throttle;
    input.roll = roll;
    input.pitch = pitch;
    rateSetpoint(input, state.rotation, DEFAULT_RATES, undefined, input.setpoint);
    q.step(dt, state.rotation, state.linvel, state.angvel, input, { thrust: 1 });
    const m = q.hw.mass;
    state.linvel.addScaledVector(q.force, dt / m);
    state.linvel.y -= SIM.gravity * dt;
    // Angular: torque into the body frame, divide by principal inertia, back to world.
    this.inv.copy(state.rotation).invert();
    const t = this.w.copy(q.torque).applyQuaternion(this.inv);
    const [ix, iy, iz] = q.hw.inertia;
    const wb = state.angvel.applyQuaternion(this.inv);
    wb.x += (t.x / ix) * dt;
    wb.y += (t.y / iy) * dt;
    wb.z += (t.z / iz) * dt;
    state.angvel.copy(wb).applyQuaternion(state.rotation);
    const a = state.angvel.length() * dt;
    if (a > 0) {
      this.dq.setFromAxisAngle(this.w.copy(state.angvel).normalize(), a);
      state.rotation.premultiply(this.dq).normalize();
    }
  }
}

const STATS_DT = 1 / 240;

/**
 * The stick throttle that hovers, found by flying it: battery sag, the motors and the props all count, so it
 * matches what the pilot feels. For a reversible (3D) quad it is the share of the upper half-stick.
 */
function hoverThrottle(spec: PhysicalQuadSpec, parts: Part[]): number {
  const half = spec.reversible ? 0.5 : 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const f = new Flyer(spec, parts);
    for (let t = 0; t < 0.8 / STATS_DT; t++) f.step(half + mid * (1 - half), 0, 0, STATS_DT);
    if (f.state.linvel.y < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Level top speed (km/h): full throttle, nose held down so the thrust just carries the weight, until it stops
 * speeding up. The attitude is set directly (a perfect pilot); the model supplies thrust, drag and rotor drag.
 */
function quadTopSpeed(spec: PhysicalQuadSpec, parts: Part[]): number {
  const f = new Flyer(spec, parts);
  const g = SIM.gravity * f.q.hw.mass;
  const axis = new Vector3(1, 0, 0);
  let tilt = 0;
  for (let i = 0; i < 6 / STATS_DT; i++) {
    f.state.rotation.setFromAxisAngle(axis, -tilt);
    f.state.angvel.set(0, 0, 0);
    f.step(1, 0, 0, STATS_DT);
    f.state.angvel.set(0, 0, 0);
    // Tilt so the thrust's vertical part balances gravity (and hold height).
    const thrust = Math.max(g, f.q.force.length());
    const want = Math.acos(Math.min(1, (g - f.state.linvel.y * f.q.hw.mass) / thrust));
    tilt += (Math.min(1.45, want) - tilt) * 0.2;
  }
  const v = f.state.linvel;
  return Math.hypot(v.x, v.z) * 3.6;
}

/**
 * Agility (0..100): how much of a full-stick roll a build completes in its first 0.25 s, against an ideal quad
 * that reaches the max rate instantly. Inertia, spool and payload all slow it.
 */
function quadAgility(spec: PhysicalQuadSpec, parts: Part[]): number {
  const f = new Flyer(spec, parts);
  const hover = hoverThrottle(spec, parts);
  for (let i = 0; i < 0.3 / STATS_DT; i++) f.step(hover, 0, 0, STATS_DT);
  let angle = 0;
  const steps = 0.25 / STATS_DT;
  for (let i = 0; i < steps; i++) {
    f.step(hover, 1, 0, STATS_DT);
    angle += f.state.angvel.length() * STATS_DT;
  }
  const ideal = ((maxRate(DEFAULT_RATES.roll) * Math.PI) / 180) * 0.25;
  // Scaled so a near-perfect response reads ~100 and a slow, loaded quad far less.
  return Math.round(Math.max(0, Math.min(100, ((angle / ideal - 0.5) / 0.45) * 100)));
}

const WING_THRUST_KG = WING.maxThrustN / SIM.gravity;

function wingStats(l: Loadout): BuildStats {
  const prop = PROPELLERS[l.propeller];
  const kg = totalKg(l);
  const thrustKg = WING_THRUST_KG * prop.wing.thrust;
  const tw = thrustKg / kg;
  // A wing flies on lift, not thrust (ADR-0013): judge it against its own stock build, and it never sits grounded.
  const stock = WING_THRUST_KG / (DRONE_CLASSES.wing.frameKg + WEAPONS.cannon.kg);
  const r = tw / stock;
  const handling: Handling = r < 0.6 ? { label: 'Barely flies', level: 'pig' } : r < 0.85 ? { label: 'Heavy and sluggish', level: 'heavy' } : { label: 'Agile', level: 'good' };
  return { kg, thrustKg, thrustToWeight: tw, hover: null, topSpeedKmh: wingTopSpeed(l, kg), agility: Math.round(Math.min(100, 70 / Math.sqrt(kg / WING.massKg))), handling };
}

/** Wing level top speed (km/h): full throttle, wings level, nose trimmed to hold height, for 10 s. */
function wingTopSpeed(l: Loadout, kg: number): number {
  const prop = PROPELLERS[l.propeller];
  const state: FlightState = { rotation: new Quaternion(), linvel: new Vector3(0, 0, -WING.launchSpeed), angvel: new Vector3(), motorOutput: 1, time: 0 };
  const out = createFlightOutput();
  const input = { throttle: 1, roll: 0, pitch: 0, yaw: 0 };
  const axis = new Vector3(1, 0, 0);
  let trim = 0;
  for (let i = 0; i < 10 / STATS_DT; i++) {
    state.rotation.setFromAxisAngle(axis, trim);
    stepWing(input, state, true, STATS_DT, out, false, prop.wing.thrust, { id: l.propeller, spool: prop.wing.spool, jet: prop.jet });
    state.motorOutput = out.motorOutput;
    state.linvel.addScaledVector(out.force, STATS_DT / kg);
    state.linvel.y -= SIM.gravity * STATS_DT;
    state.angvel.set(0, 0, 0);
    trim += -state.linvel.y * 0.002;
    trim = Math.max(-0.3, Math.min(0.5, trim));
  }
  return Math.hypot(state.linvel.x, state.linvel.z) * 3.6;
}
