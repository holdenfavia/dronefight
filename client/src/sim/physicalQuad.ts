/**
 * Physical quad flight model (ADR-0063), ported from the Flight Division browser sim's flight code with the
 * owner's permission (ADR-0062). Instead of setting the rotation rate directly, it simulates the real parts:
 *
 * - each prop as a blade-element rotor (thrust, in-plane hub drag and flapping, torque, induced inflow, wake),
 * - each motor and the battery electrically (kV, winding resistance, current limits, back EMF, voltage sag),
 * - a Betaflight-style PID loop (feedforward, D-min, I-term relax, anti-gravity, TPA, airmode, dynamic idle),
 * - body drag from drag areas, ground effect, prop-wake turbulence, and the airframe's real mass and inertia.
 *
 * The result is a force and a torque that Rapier integrates (ADR-0008). Body frame matches Three.js:
 * +X right, +Y up, -Z forward. Pure maths plus the body handle; allocation-free per step (Hard rule 2).
 */
import { Quaternion, Vector3 } from 'three';
import type { PhysicalQuadSpec, PidTune } from '../config';
import { PHYSICAL_QUAD } from '../config';
import type { BladeChange } from '../../../shared/propellers';

const TWO_PI = 2 * Math.PI;
const RPM_PER_RAD_S = 60 / TWO_PI;
const RAD_S_PER_RPM = TWO_PI / 60;
const DEG_PER_RAD = 180 / Math.PI;
const AIR_DENSITY = 1.225;
const HALF_RHO = 0.5 * AIR_DENSITY;

// --- Mass properties ------------------------------------------------------------------------------------

export interface Part {
  mass: number;
  /** Point or box part: centre and optional box size. */
  at?: readonly [number, number, number];
  size?: readonly [number, number, number];
  /** Rod part (an arm): from and to. */
  from?: readonly [number, number, number];
  to?: readonly [number, number, number];
}

/** Total mass, centre of mass and principal inertia (about the centre) of a set of parts. */
function massProperties(parts: readonly Part[]): { mass: number; centre: [number, number, number]; inertia: [number, number, number] } {
  let m = 0, mx = 0, my = 0, mz = 0, xx = 0, yy = 0, zz = 0;
  for (const p of parts) {
    const w = p.mass;
    m += w;
    if (p.from && p.to) {
      const [ax, ay, az] = p.from;
      const [bx, by, bz] = p.to;
      mx += (w * (ax + bx)) / 2;
      my += (w * (ay + by)) / 2;
      mz += (w * (az + bz)) / 2;
      xx += (w * (ax * ax + ax * bx + bx * bx)) / 3;
      yy += (w * (ay * ay + ay * by + by * by)) / 3;
      zz += (w * (az * az + az * bz + bz * bz)) / 3;
    } else {
      const [x, y, z] = p.at!;
      mx += w * x;
      my += w * y;
      mz += w * z;
      xx += w * x * x;
      yy += w * y * y;
      zz += w * z * z;
      if (p.size) {
        const [sx, sy, sz] = p.size;
        xx += (w * sx * sx) / 12;
        yy += (w * sy * sy) / 12;
        zz += (w * sz * sz) / 12;
      }
    }
  }
  const cx = mx / m, cy = my / m, cz = mz / m;
  xx -= m * cx * cx;
  yy -= m * cy * cy;
  zz -= m * cz * cz;
  // Second moments per axis -> moments of inertia about x, y, z.
  return { mass: m, centre: [cx, cy, cz], inertia: [yy + zz, xx + zz, xx + yy] };
}

/** Motor corners in (x, z): front right, front left, rear right, rear left. */
const CORNERS = [[1, -1], [-1, -1], [1, 1], [-1, 1]] as const;
/**
 * Prop spin direction per corner (props-out): the reaction to each motor's torque yaws the body. Motors 1 and 2
 * spin up for a nose-right yaw command (see `mix`), so their reaction must turn the nose right.
 */
const PROP_SPIN = [-1, 1, 1, -1] as const;
/** Quad-X mixer per corner: how much roll (right +), pitch (nose up +) and yaw (nose right +) each motor takes. */
const CORNER_MIX = [[-1, 1, -1], [1, 1, 1], [-1, -1, 1], [1, -1, -1]] as const;

/** One motor and prop: where it sits (x, z and the prop's height), which way it spins and how it mixes. */
interface RotorPlace {
  x: number;
  y: number;
  z: number;
  spin: number;
  mix: readonly [number, number, number];
  /** Index of the prop directly above, whose wake this one works in (coaxial lower props); -1 for none. */
  under: number;
}

/** Every rotor of the layout: four corners, plus a lower, counter-spinning prop under each for coaxial pairs. */
function rotorPlaces(spec: PhysicalQuadSpec): RotorPlace[] {
  const l = spec.layout;
  const places: RotorPlace[] = CORNERS.map(([sx, sz], i) => ({
    x: sx * l.reachX,
    y: l.propY,
    z: sz * l.reachZ,
    spin: PROP_SPIN[i]!,
    mix: CORNER_MIX[i]!,
    under: -1,
  }));
  if (l.coaxialGap !== undefined) {
    for (let i = 0; i < 4; i++) {
      const top = places[i]!;
      const [r, p, y] = top.mix;
      places.push({ x: top.x, y: top.y - l.coaxialGap, z: top.z, spin: -top.spin, mix: [r, p, -y], under: i });
    }
  }
  return places;
}

function quadParts(spec: PhysicalQuadSpec): Part[] {
  const l = spec.layout;
  const parts: Part[] = [];
  const mr = l.motor.radius * Math.sqrt(3);
  for (const r of rotorPlaces(spec)) {
    const lower = r.under >= 0 ? l.coaxialGap! : 0;
    parts.push({ mass: l.motor.mass, at: [r.x, l.motorY - lower, r.z], size: [mr, l.motor.height, mr] });
    parts.push({ mass: l.prop.mass, at: [r.x, r.y, r.z], size: [1.1 * l.prop.radius, 0, 1.1 * l.prop.radius] });
  }
  for (const [sx, sz] of CORNERS) parts.push({ mass: l.arms / 4, from: [0, 0, 0], to: [sx * l.reachX, 0, sz * l.reachZ] });
  parts.push({ mass: l.battery.mass, at: l.battery.at, size: l.battery.size });
  for (const o of l.other) parts.push({ mass: o.mass, at: o.at, size: o.size });
  return parts;
}

// --- Rotor aerodynamics ---------------------------------------------------------------------------------

export interface RotorModel {
  radius: number;
  area: number;
  theta0: number;
  thetaTw: number;
  halfSigmaA: number;
  quarterSigmaA: number;
  sigmaCd0: number;
  ctMax: number;
  flapping: number;
  kappa: number;
  duct: number;
  bladeArea: number;
}

/** Rotor constants from blade geometry: solidity and a linear twist fitted to the prop's pitch. */
export function rotorModel(p: PhysicalQuadSpec['prop']): RotorModel {
  const sigma = (p.blades * p.chord) / (Math.PI * p.radius);
  let s0 = 0, s1 = 0, sTh = 0, s2 = 0, sRTh = 0;
  for (let i = 0; i <= 14; i++) {
    const r = 0.3 + 0.05 * i;
    const w = r * r;
    const theta = Math.atan(p.pitch / (TWO_PI * p.radius * r)) + p.zeroLift;
    s0 += w;
    s1 += w * r;
    sTh += w * theta;
    s2 += w * r * r;
    sRTh += w * r * theta;
  }
  const thetaTw = (s0 * sRTh - s1 * sTh) / (s0 * s2 - s1 * s1);
  const theta0 = (sTh - thetaTw * s1) / s0;
  return {
    radius: p.radius,
    area: Math.PI * p.radius * p.radius,
    theta0,
    thetaTw,
    halfSigmaA: (sigma * p.liftSlope) / 2,
    quarterSigmaA: (sigma * p.liftSlope) / 4,
    sigmaCd0: sigma * p.profileDrag,
    ctMax: sigma * p.maxLoading,
    flapping: p.flapping,
    kappa: p.inducedFactor,
    duct: p.duct,
    bladeArea: p.blades * p.chord * p.radius * 0.85,
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
}

export interface RotorLoads {
  thrust: number;
  hx: number;
  hz: number;
  torque: number;
  induced: number;
  wake: number;
}

/**
 * One rotor's loads at spin `omega` (rad/s) with hub airspeed (vx, vy, vz) in the body frame: blade-element
 * thrust with an induced-inflow solve, vortex-ring/windmill handling when descending into the wake, in-plane
 * hub drag plus flapping, and shaft torque. `thrustScale` is ground effect times any boost.
 */
export function rotorLoads(out: RotorLoads, r: RotorModel, omega: number, vx: number, vy: number, vz: number, inducedPrev: number, thrustScale: number): RotorLoads {
  const tip = omega * r.radius;
  const axialRatio = Math.abs(vy) / (tip + 0.1);
  // A stopped or slow prop still catches air coming through it (windmill brake).
  const brake = axialRatio > 0.5 ? -HALF_RHO * r.bladeArea * 1.2 * Math.abs(vy) * vy * smoothstep(0.5, 1.5, axialRatio) : 0;
  if (tip < 0.5) {
    out.thrust = brake;
    out.hx = out.hz = out.torque = out.induced = out.wake = 0;
    return out;
  }
  const edge = Math.sqrt(vx * vx + vz * vz);
  const mu = edge / tip;
  const mu2 = mu * mu;
  const climb = vy / tip;
  const ctBlade = r.halfSigmaA * (r.theta0 * (1 / 3 + mu2 / 2) + r.thetaTw * (1 / 4 + mu2 / 4));
  const k = r.quarterSigmaA;
  let lambda = inducedPrev / tip;
  for (let i = 0; i < 2; i++) {
    const total = climb + lambda;
    const root = Math.sqrt(mu2 + total * total + 1e-6);
    const ct = ctBlade - k * total;
    const f = lambda - ct / (2 * root);
    lambda -= f / (1 + k / (2 * root) + (ct * total) / (2 * root * root * root));
    if (lambda > 1) lambda = 1;
    else if (lambda < -1) lambda = -1;
  }
  let wake = 0;
  const ctNow = ctBlade - k * (climb + lambda);
  if (vy < 0 && ctNow > 0) {
    // Descending into your own wake: blend toward the empirical vortex-ring inflow.
    const vh = tip * Math.sqrt(ctNow / 2);
    if (vh > 0.25) {
      const ratio = vy / vh;
      const crossflow = smoothstep(0.4, 1.2, edge / vh);
      const blend = smoothstep(0, 0.4, -ratio) * (1 - crossflow);
      if (blend > 0) {
        const vrs =
          ratio >= -2 ? 1 + ratio * (-1.125 + ratio * (-1.372 + ratio * (-1.718 + -0.655 * ratio))) : -ratio / 2 - Math.sqrt((ratio * ratio) / 4 - 1);
        lambda += ((vrs * vh) / tip - lambda) * blend;
        wake = blend * smoothstep(0.2, 0.7, -ratio) * (1 - smoothstep(1.4, 2.2, -ratio));
      }
    }
  }
  const inflow = climb + lambda;
  let ct = ctBlade - k * inflow;
  if (ct > r.ctMax) ct = r.ctMax;
  else if (ct < -r.ctMax) ct = -r.ctMax;
  const q = AIR_DENSITY * r.area * tip * tip;
  const thrust = ct * q * r.duct * thrustScale;
  const hub =
    ((r.sigmaCd0 * mu) / 4 + r.quarterSigmaA * inflow * mu * (r.theta0 + r.thetaTw / 2)) * q + (thrust > 0 ? r.flapping * thrust * mu : 0);
  const hubScaled = hub * smoothstep(0.5, 2, tip);
  if (edge > 1e-9) {
    out.hx = (-hubScaled * vx) / edge;
    out.hz = (-hubScaled * vz) / edge;
  } else {
    out.hx = out.hz = 0;
  }
  const cq = r.kappa * lambda * ct + climb * ct + (r.sigmaCd0 * (1 + 3 * mu2)) / 8;
  out.thrust = thrust + brake;
  out.torque = cq * q * r.radius;
  out.induced = lambda * tip;
  out.wake = wake;
  return out;
}

/** Thrust multiplier near the ground (Cheeseman-Bennett), capped at +25%; none above 8 prop radii. */
export function groundEffect(height: number, radius: number): number {
  if (!(height > 0) || height > 8 * radius) return 1;
  const a = radius / (4 * height);
  return 1 / (1 - Math.min(0.2, 4 * a * a));
}

// --- Motors and battery ---------------------------------------------------------------------------------

/**
 * The motors on one battery: back EMF, winding resistance, current limits, sag, and rotor spin-up. Reversible
 * motors (3D mode) take negative duty and spin either way; the others only ever spin forward.
 */
export class Powertrain {
  readonly omega: Float64Array;
  readonly drive: Float64Array;
  private readonly current: Float64Array;
  private readonly backEmf: Float64Array;
  private polarisation = 0;
  /** Battery voltage under load over its resting voltage. */
  sag = 1;

  constructor(readonly count = 4, private readonly reversible = false) {
    this.omega = new Float64Array(count);
    this.drive = new Float64Array(count);
    this.current = new Float64Array(count);
    this.backEmf = new Float64Array(count);
  }

  reset(): void {
    this.omega.fill(0);
    this.drive.fill(0);
    this.polarisation = 0;
    this.sag = 1;
  }

  /** Advance by dt with motor duty cycles `duty` (0..1) against aerodynamic shaft torques `load`. */
  step(dt: number, motor: PhysicalQuadSpec['motor'], battery: PhysicalQuadSpec['battery'], duty: ArrayLike<number>, armed: boolean, load: ArrayLike<number>, inertiaScale: number): void {
    const kw = motor.kv * RAD_S_PER_RPM;
    const kt = 1 / kw;
    const rest = battery.cells * battery.cellVoltage;
    const open = rest - this.polarisation;
    const n = this.count;
    // A 3D ESC drives full current either way; a normal one only brakes against its spin.
    const lowLimit = this.reversible ? -motor.currentLimit : -motor.brakeLimit;
    let bus = 0;
    let volts = open;
    if (armed) {
      let g = 0, e = 0;
      for (let i = 0; i < n; i++) {
        const emf = this.omega[i]! / kw;
        this.backEmf[i] = emf;
        const d = duty[i]!;
        g += (d * d) / motor.resistance;
        e += (d * emf) / motor.resistance;
      }
      const rb = battery.resistance;
      volts = (open + rb * e) / (1 + rb * g);
      let limited = false;
      for (let i = 0; i < n; i++) {
        let amps = (duty[i]! * volts - this.backEmf[i]!) / motor.resistance;
        if (amps > motor.currentLimit) {
          amps = motor.currentLimit;
          limited = true;
        } else if (amps < lowLimit) {
          amps = lowLimit;
          limited = true;
        }
        this.current[i] = amps;
        bus += duty[i]! * amps;
      }
      if (limited) volts = open - rb * bus;
    } else {
      this.current.fill(0);
    }
    this.sag = volts / rest;
    this.polarisation += (battery.polarisation * bus - this.polarisation) * (1 - Math.exp(-dt / battery.polarisationTau));
    const friction = kt * motor.noLoadCurrent;
    const inertia = motor.rotorInertia * inertiaScale;
    for (let i = 0; i < n; i++) {
      const w = this.omega[i]!;
      const speed = Math.abs(w);
      // Bearing friction opposes the spin, fading in over the first 50 rad/s.
      const lowSpeed = w > 50 ? 1 : w < -50 ? -1 : w / 50;
      const amps = this.current[i]!;
      const torque = kt * amps - friction * lowSpeed;
      this.drive[i] = torque;
      // Implicit damping from the electrical and aerodynamic slopes keeps the spin-up stable at large dt.
      const damping = (armed && amps < motor.currentLimit && amps > lowLimit ? (kt * kt) / motor.resistance : 0) + (speed > 1 ? (2 * Math.abs(load[i]!)) / speed : 0);
      const next = w + (dt * (torque - load[i]!)) / (inertia + dt * damping);
      this.omega[i] = this.reversible || next > 0 ? next : 0;
    }
  }
}

// --- Prop-wake turbulence -------------------------------------------------------------------------------

/** Band-limited noise channels (a resonant 2-pole filter on white noise), one per prop. */
class Turbulence {
  private readonly filter: Float64Array;
  private seed = 0x9e3779b9;
  private dt = 0;
  private b0 = 0;
  private a1 = 0;
  private a2 = 0;
  readonly value: Float64Array;

  constructor(private readonly count = 4, private readonly hz = 22, private readonly q = 0.9) {
    this.filter = new Float64Array(2 * count);
    this.value = new Float64Array(count);
  }

  reset(): void {
    this.filter.fill(0);
    this.value.fill(0);
    this.seed = 0x9e3779b9;
  }

  private next(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return (((t ^ (t >>> 14)) >>> 0) / 0x100000000) * 2 - 1;
  }

  step(dt: number): void {
    if (dt !== this.dt) {
      const w = TWO_PI * this.hz * dt;
      const r = Math.exp((-Math.PI * this.hz * dt) / this.q);
      this.a1 = 2 * r * Math.cos(w);
      this.a2 = -r * r;
      this.b0 = 1 / Math.sqrt((1 - this.a2) / ((1 + this.a2) * ((1 - this.a2) * (1 - this.a2) - this.a1 * this.a1)));
      this.dt = dt;
    }
    for (let i = 0; i < this.count; i++) {
      const white = (this.next() + this.next()) * 1.2247;
      const j = 2 * i;
      const y = this.b0 * white + this.a1 * this.filter[j]! + this.a2 * this.filter[j + 1]!;
      this.filter[j + 1] = this.filter[j]!;
      this.filter[j] = y;
      this.value[i] = y;
    }
  }
}

// --- Flight controller (Betaflight-style PID) -----------------------------------------------------------

/** First-order low-pass coefficient for a cutoff (Hz) at step dt. */
function lowpass(hz: number, dt: number): number {
  if (hz <= 0) return 1;
  const k = TWO_PI * hz * dt;
  return k / (k + 1);
}
/** Betaflight's PT2/PT3 cutoff correction for cascaded first-order filters. */
const PT2_CUTOFF = 1.5537739740300374;
/** Betaflight's PID scale factors (P, I, D, F) from gains to the motor-mix units. */
const P_SCALE = 0.032029;
const I_SCALE = 0.244381;
const D_SCALE = 529e-6;
const F_SCALE = 0.013754 / 100;
/** Shortest radio frame (s) the feedforward differentiates over. */
const RC_FRAME = 1 / 60;

export interface PidFlags {
  armed: boolean;
  airmode: boolean;
  /** Thrust direction: 1 forward, -1 reversed (3D mode). */
  direction: number;
}

/**
 * Rate PID loop with Betaflight's extras: RC smoothing, feedforward from setpoint steps, gyro and D-term
 * filters that open up with throttle, D-min, I-term relax, anti-gravity, TPA, airmode and dynamic idle.
 * Gyro and setpoints are in Betaflight's axes and units: roll (right +), pitch (nose up +), yaw (nose right +), deg/s.
 */
class RatePid {
  readonly motors: Float64Array;
  throttle = 0;
  private readonly setpoint = new Float64Array(3);
  private readonly gyro = new Float64Array(3);
  private readonly sum = new Float64Array(3);
  private readonly ff = new Float64Array(3);
  /** Raw and smoothed signals, filter states, I-terms (see `step`). */
  private readonly s = new Float64Array(55);

  /** `mixer` holds roll, pitch, yaw factors per motor. */
  constructor(public tune: PidTune, private readonly mixer: Float64Array) {
    this.motors = new Float64Array(mixer.length / 3);
  }

  reset(): void {
    this.s.fill(0);
    this.motors.fill(0);
  }

  /** One loop: setpoints (deg/s), throttle (0..1), gyro (deg/s), lowest motor rpm for dynamic idle. */
  step(dt: number, sp: ArrayLike<number>, sticks: ArrayLike<number>, throttleIn: number, gr: number, gp: number, gy: number, flags: PidFlags, minRpm: number): Float64Array {
    const x = this.s;
    const b = this.tune;
    if (x[53] === 0) {
      for (let a = 0; a < 3; a++) {
        const v = sp[a]!;
        x[14 + a] = v;
        x[2 * a] = v;
        x[2 * a + 1] = v;
        x[44 + a] = v;
        x[17 + a] = v;
      }
      x[6] = x[7] = x[47] = throttleIn;
      x[29] = x[32] = gr;
      x[30] = x[33] = gp;
      x[31] = x[34] = gy;
      x[20] = throttleIn;
      x[22] = RC_FRAME;
      x[53] = 1;
    }
    // A new radio frame when any setpoint (or throttle) changes: feedforward is the setpoint's step over the frame.
    x[21] += dt;
    let changed = throttleIn !== x[20];
    for (let a = 0; a < 3; a++) if (sp[a] !== x[17 + a]) changed = true;
    if (changed) {
      const frame = Math.max(dt, Math.min(x[21]!, RC_FRAME));
      for (let a = 0; a < 3; a++) {
        const v = sp[a]!;
        x[26 + a] = x[23 + a]!;
        x[23 + a] = (v - x[14 + a]!) / frame;
        x[14 + a] = v;
        x[17 + a] = v;
      }
      x[20] = throttleIn;
      x[22] = frame;
      x[21] = 0;
    } else if (x[21]! > x[22]! + dt / 2) {
      let any = false;
      for (let a = 0; a < 3; a++) if (x[23 + a] !== 0 || x[26 + a] !== 0) any = true;
      if (any) {
        for (let a = 0; a < 3; a++) {
          x[26 + a] = x[23 + a]!;
          x[23 + a] = 0;
        }
        x[21] = 0;
      }
    }
    const kSp = lowpass(PT2_CUTOFF * b.rcSmoothingSetpoint, dt);
    const kFf = lowpass(PT2_CUTOFF * b.rcSmoothingFeedforward, dt);
    const throttle = pt2(x, 6, throttleIn, lowpass(PT2_CUTOFF * b.rcSmoothingThrottle, dt));
    this.throttle = throttle;
    const ffLimit = b.feedforwardMaxRateLimit / 100;
    for (let a = 0; a < 3; a++) {
      this.setpoint[a] = pt2(x, 2 * a, x[14 + a]!, kSp);
      let f = x[23 + a]! + 0.01 * b.feedforwardBoost * (x[23 + a]! - x[26 + a]!);
      // Near full stick, feedforward fades so it can't overshoot the max rate.
      const stick = sticks[a]!;
      if (stick > ffLimit && f * sp[a]! > 0) f *= Math.max(0, (1 - stick) / (1 - ffLimit));
      this.ff[a] = pt2(x, 8 + 2 * a, f, kFf);
    }
    const kGyro = lowpass(b.gyroLowpassMin + (b.gyroLowpassMax - b.gyroLowpassMin) * throttle, dt);
    const kD1 = lowpass(b.dtermLowpassMin + (b.dtermLowpassMax - b.dtermLowpassMin) * throttle, dt);
    const kD2 = lowpass(b.dtermLowpass2, dt);
    const g = this.gyro;
    g[0] = pt1(x, 29, gr, kGyro);
    g[1] = pt1(x, 30, gp, kGyro);
    g[2] = pt1(x, 31, gy, kGyro);
    const throttleRate = Math.abs(throttle - pt1(x, 47, throttle, lowpass(b.antiGravityCutoff, dt)));
    const antiGravityI = 1 + (throttleRate * b.antiGravityGain) / 10;
    const antiGravityP = 1 + 0.5 * throttleRate;
    if (flags.armed) {
      if (throttle > b.airmodeStartThrottle) x[51] = 1;
    } else x[51] = 0;
    const airmode = flags.airmode && x[51] === 1;
    const windupStart = b.itermWindup / 100;
    const windup = x[52]! > windupStart ? Math.max(0, 1 - (x[52]! - windupStart) / (1 - windupStart)) : 1;
    const holdI = !flags.armed || (!airmode && throttle < 0.05);
    const tpa = throttle > b.tpaBreakpoint ? 1 - (b.tpaRate * (throttle - b.tpaBreakpoint)) / (1 - b.tpaBreakpoint) : 1;
    const kRelax = lowpass(b.itermRelaxCutoff, dt);
    const kDmin = lowpass(35, dt);
    for (let a = 0; a < 3; a++) {
      const setpoint = this.setpoint[a]!;
      const error = setpoint - g[a]!;
      const gyroRate = (g[a]! - x[32 + a]!) / dt;
      x[32 + a] = g[a]!;
      const dGyro = pt1(x, 38 + a, pt1(x, 35 + a, gyroRate, kD1), kD2);
      let relax = 1;
      if (a < 2 || b.itermRelaxYaw) relax = Math.max(0, 1 - Math.abs(setpoint - pt1(x, 44 + a, setpoint, kRelax)) / 40);
      let dGain = b.d[a]!;
      if (a < 2 && b.dMin[a]! > 0 && b.dMin[a]! < b.d[a]!) {
        const boost = pt1(x, 48 + a, Math.min(1, Math.abs(dGyro) * b.dMinGain * 4e-6 + Math.abs(this.ff[a]!) * b.dMinAdvance * 2e-6), kDmin);
        dGain = b.dMin[a]! + (b.d[a]! - b.dMin[a]!) * boost;
      }
      let p = P_SCALE * b.p[a]! * error * antiGravityP;
      if (a === 2) p = pt1(x, 50, p, lowpass(b.yawLowpass, dt));
      const d = -(D_SCALE * dGain) * dGyro * tpa;
      const f = b.f[a]! * F_SCALE * this.ff[a]!;
      const limit = a === 2 ? b.pidSumLimitYaw : b.pidSumLimit;
      const pdf = p + d + f;
      const total = pdf + x[41 + a]!;
      let iTerm = (total >= limit && error > 0) || (total <= -limit && error < 0) ? x[41 + a]! : x[41 + a]! + I_SCALE * b.i[a]! * error * relax * dt * antiGravityI * windup;
      if (iTerm > b.itermLimit) iTerm = b.itermLimit;
      else if (iTerm < -b.itermLimit) iTerm = -b.itermLimit;
      if (holdI) iTerm = 0;
      x[41 + a] = iTerm;
      const out = pdf + iTerm;
      this.sum[a] = flags.armed ? (out > limit ? limit : out < -limit ? -limit : out) : 0;
    }
    if (!flags.armed) {
      this.motors.fill(0);
      x[52] = 0;
      x[54] = 0;
      return this.motors;
    }
    let idle = b.motorIdle;
    if (b.dynIdleMinRpm > 0 && minRpm < Infinity) {
      const err = 100 * b.dynIdleMinRpm - minRpm;
      let it = x[54]! + 4e-4 * err * dt;
      if (it < 0) it = 0;
      else if (it > b.dynIdleMaxIncrease) it = b.dynIdleMaxIncrease;
      x[54] = it;
      idle += Math.min(b.dynIdleMaxIncrease, Math.max(0, it + 2e-5 * err));
    }
    x[52] = mix(this.motors, this.mixer, throttle, this.sum[0]! / 1000, this.sum[1]! / 1000, this.sum[2]! / 1000, airmode, idle, b.motorOutputLimit, flags.direction);
    return this.motors;
  }
}

function pt1(x: Float64Array, i: number, target: number, k: number): number {
  const v = x[i]! + (target - x[i]!) * k;
  x[i] = v;
  return v;
}
function pt2(x: Float64Array, i: number, target: number, k: number): number {
  const a = x[i]! + (target - x[i]!) * k;
  const b = x[i + 1]! + (a - x[i + 1]!) * k;
  x[i] = a;
  x[i + 1] = b;
  return b;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Multirotor mixer with airmode: returns how far the roll/pitch/yaw mix spans (for I-term windup). `throttle`
 * is the thrust magnitude; reversed (direction -1), each motor's output and its mix flip together, like
 * Betaflight's 3D mode, so a roll command still rolls the same way.
 */
function mix(out: Float64Array, mixer: Float64Array, throttle: number, roll: number, pitch: number, yaw: number, airmode: boolean, idle: number, limit: number, direction: number): number {
  const n = out.length;
  let hi = -Infinity, lo = Infinity;
  for (let i = 0; i < n; i++) {
    const m = direction * (mixer[3 * i]! * roll + mixer[3 * i + 1]! * pitch + mixer[3 * i + 2]! * yaw);
    out[i] = m;
    if (m > hi) hi = m;
    if (m < lo) lo = m;
  }
  const range = hi - lo;
  const s = range > 1 ? 1 / range : 1;
  hi *= s;
  lo *= s;
  let t = clamp01(throttle);
  if (airmode) {
    if (t < -lo) t = -lo;
    if (t > 1 - hi) t = 1 - hi;
  }
  const span = limit - idle;
  for (let i = 0; i < n; i++) out[i] = direction * (idle + span * clamp01(t + out[i]! * s));
  return range;
}

/** Betaflight throttle expo around a mid point. */
export function throttleCurve(t: number, expo: number, mid: number): number {
  const c = clamp01(t);
  const d = c - mid;
  const y = d / (d > 0 ? 1 - mid : mid);
  return mid + d * (1 - expo + expo * y * y);
}

// --- The airframe ---------------------------------------------------------------------------------------

/** The stock 5"'s prop radius: propeller weights are given for a set of four of these (ADR-0065). */
const PROP_KG_RADIUS = 0.0635;

/**
 * A body's spec with a different propeller (ADR-0065): the stock prop's blades, pitch, chord and profile drag
 * changed, a duct added, its extra weight spread over the props, and its spin-up inertia scaled with blade area.
 * The diameter stays the body's own, so every prop fits every quad.
 */
export function withPropeller(spec: PhysicalQuadSpec, blade: BladeChange | undefined, extraKg = 0): PhysicalQuadSpec {
  if (!blade && extraKg === 0) return spec;
  const b = blade ?? {};
  const p = spec.prop;
  const blades = b.blades ?? p.blades;
  const chord = p.chord * (b.chord ?? 1);
  // Each prop carries a quarter of the 5" set's extra weight, scaled by its disc area.
  const perProp = (extraKg / 4) * (p.radius / PROP_KG_RADIUS) ** 2;
  // About half a motor's spinning inertia is its prop, which grows with blade area.
  const area = (blades * chord) / (p.blades * p.chord);
  const drag = b.dragArea ?? 1;
  return {
    ...spec,
    layout: { ...spec.layout, prop: { ...spec.layout.prop, mass: spec.layout.prop.mass + perProp } },
    aero: { ...spec.aero, dragArea: [spec.aero.dragArea[0] * drag, spec.aero.dragArea[1] * drag, spec.aero.dragArea[2] * drag] },
    prop: { ...p, blades, chord, pitch: p.pitch * (b.pitch ?? 1), profileDrag: p.profileDrag * (b.profileDrag ?? 1), duct: p.duct * (b.duct ?? 1) },
    motor: { ...spec.motor, rotorInertia: spec.motor.rotorInertia * (0.5 + 0.5 * area) },
  };
}

export interface PhysicalHardware {
  mass: number;
  centre: [number, number, number];
  inertia: [number, number, number];
  rotor: RotorModel;
  /** Each hub's position from the centre of mass. */
  hubs: [number, number, number][];
  /** Each prop's spin direction (props-out, see PROP_SPIN). */
  spin: number[];
  /** Roll, pitch, yaw mixer factors per motor. */
  mixer: Float64Array;
  /** For each prop, the prop whose wake it sits in (coaxial lower props), or -1. */
  under: number[];
  /** Centre of pressure from the centre of mass. */
  pressure: [number, number, number];
}

/** The quad's mass properties from its parts plus any `payload` (weapons and specials on it, ADR-0066). */
export function physicalHardware(spec: PhysicalQuadSpec = PHYSICAL_QUAD, payload: readonly Part[] = []): PhysicalHardware {
  const m = massProperties([...quadParts(spec), ...payload]);
  const [cx, cy, cz] = m.centre;
  const [px, py, pz] = spec.aero.pressureCentre;
  const places = rotorPlaces(spec);
  return {
    ...m,
    rotor: rotorModel(spec.prop),
    hubs: places.map((r) => [r.x - cx, r.y - cy, r.z - cz] as [number, number, number]),
    spin: places.map((r) => r.spin),
    mixer: Float64Array.from(places.flatMap((r) => r.mix)),
    under: places.map((r) => r.under),
    pressure: [px - cx, py - cy, pz - cz],
  };
}

/** Static thrust-to-weight on a test stand: every motor at full duty for 0.5 s (lower coaxial props in the upper ones' wake). */
export function thrustStand(spec: PhysicalQuadSpec = PHYSICAL_QUAD, payload: readonly Part[] = []): { thrustToWeight: number; rpm: number; thrustKg: number } {
  const hw = physicalHardware(spec, payload);
  const n = hw.hubs.length;
  const pt = new Powertrain(n);
  const loads: RotorLoads = { thrust: 0, hx: 0, hz: 0, torque: 0, induced: 0, wake: 0 };
  const duty = new Array<number>(n).fill(1);
  const torque = new Array<number>(n).fill(0);
  const induced = new Array<number>(n).fill(0);
  let thrust = 0;
  for (let step = 0; step < 480; step++) {
    thrust = 0;
    for (let i = 0; i < n; i++) {
      const u = hw.under[i]!;
      rotorLoads(loads, hw.rotor, pt.omega[i]!, 0, u >= 0 ? induced[u]! : 0, 0, induced[i]!, 1);
      induced[i] = loads.induced;
      torque[i] = loads.torque;
      thrust += loads.thrust;
    }
    pt.step(1 / 960, spec.motor, spec.battery, duty, true, torque, 1);
  }
  return { thrustToWeight: thrust / (9.81 * hw.mass), rpm: pt.omega[0]! * RPM_PER_RAD_S, thrustKg: thrust / 9.81 };
}

export interface PhysicalStepInput {
  /** Stick throttle 0..1, before the throttle curve. */
  throttle: number;
  /** Rate setpoints in the body frame (rad/s), as `stepFlight` builds them: +x pitch up, +y yaw left, +z roll left. */
  setpoint: Vector3;
  /** Stick deflections 0..1 for roll, pitch, yaw (feedforward fades near full stick). */
  roll: number;
  pitch: number;
  yaw: number;
  armed: boolean;
  /** Height of the props above the ground below (m), Infinity when none is near. */
  agl: number;
}

export interface PhysicalOptions {
  /** Thrust multiplier (the afterburner). */
  thrust: number;
}

const scratchQ = new Quaternion();
const invQ = new Quaternion();
const midQ = new Quaternion();
const v3 = new Vector3();

/**
 * The physical quad: call `step` once per physics step with the body's pose and velocities. Returns the world
 * force and torque (N, N·m) to apply for this step, without gravity (Rapier applies it).
 */
export class PhysicalQuad {
  readonly hw: PhysicalHardware;
  readonly power: Powertrain;
  readonly force = new Vector3();
  readonly torque = new Vector3();
  /** Mean motor speed as a fraction of max rpm, squared: roughly the thrust fraction, for sound. */
  motorOutput = 0;
  private readonly pid: RatePid;
  private readonly turbulence: Turbulence;
  private readonly induced: Float64Array;
  private readonly aero: Float64Array;
  private readonly loads: RotorLoads = { thrust: 0, hx: 0, hz: 0, torque: 0, induced: 0, wake: 0 };
  private readonly sp = new Float64Array(3);
  private readonly sticks = new Float64Array(3);
  private readonly flags: PidFlags = { armed: false, airmode: true, direction: 1 };

  constructor(
    readonly spec: PhysicalQuadSpec = PHYSICAL_QUAD,
    payload: readonly Part[] = [],
  ) {
    this.hw = physicalHardware(spec, payload);
    const n = this.hw.hubs.length;
    this.power = new Powertrain(n, !!spec.reversible);
    this.turbulence = new Turbulence(n);
    this.induced = new Float64Array(n);
    this.aero = new Float64Array(n);
    this.pid = new RatePid(spec.tune, this.hw.mixer);
  }

  reset(): void {
    this.power.reset();
    this.induced.fill(0);
    this.turbulence.reset();
    this.pid.reset();
    this.flags.direction = 1;
    this.motorOutput = 0;
  }

  /**
   * Stick throttle to thrust magnitude through the throttle curve; in 3D mode the stick's lower half reverses
   * (sets `flags.direction`) and a deadband around centre commands nothing, keeping the last direction.
   */
  private thrustCommand(stick: number): number {
    const spec = this.spec;
    const rev = spec.reversible;
    if (!rev) return throttleCurve(stick, spec.throttleExpo, spec.throttleMid);
    const t = 2 * clamp01(stick) - 1;
    const a = Math.abs(t);
    if (a <= rev.deadband) return 0;
    this.flags.direction = t < 0 ? -1 : 1;
    return throttleCurve((a - rev.deadband) / (1 - rev.deadband), spec.throttleExpo, spec.throttleMid);
  }

  step(dt: number, rotation: Quaternion, linvel: Vector3, angvel: Vector3, input: PhysicalStepInput, opt: PhysicalOptions): void {
    const spec = this.spec;
    const hw = this.hw;
    const [ix0, iy0, iz0] = hw.inertia;
    const ix = ix0, iy = iy0, iz = iz0;
    invQ.copy(rotation).invert();
    const upY = v3.set(0, 1, 0).applyQuaternion(rotation).y;
    // Body-frame angular velocity (rad/s) and airspeed (m/s).
    v3.copy(angvel).applyQuaternion(invQ);
    let wx = v3.x, wy = v3.y, wz = v3.z;
    v3.copy(linvel).applyQuaternion(invQ);
    const vx = v3.x, vy = v3.y, vz = v3.z;
    const speed = linvel.length();
    const throttle = this.thrustCommand(input.throttle);
    this.flags.armed = input.armed;
    this.flags.airmode = true;
    const ground = upY > 0.5 ? groundEffect(input.agl + spec.layout.propY, hw.rotor.radius) : 1;
    // Body drag at the centre of pressure.
    const dk = -HALF_RHO * speed;
    const dx = dk * spec.aero.dragArea[0] * vx;
    const dy = dk * spec.aero.dragArea[1] * vy;
    const dz = dk * spec.aero.dragArea[2] * vz;
    const [px, py, pz] = hw.pressure;
    const dtx = py * dz - pz * dy, dty = pz * dx - px * dz, dtz = px * dy - py * dx;
    // Setpoints in Betaflight axes (deg/s).
    this.sp[0] = -input.setpoint.z * DEG_PER_RAD;
    this.sp[1] = input.setpoint.x * DEG_PER_RAD;
    this.sp[2] = -input.setpoint.y * DEG_PER_RAD;
    this.sticks[0] = Math.abs(input.roll);
    this.sticks[1] = Math.abs(input.pitch);
    this.sticks[2] = Math.abs(input.yaw);
    const n = Math.max(1, Math.round(dt * spec.loopHz));
    const h = dt / n;
    const rotorInertia = spec.motor.rotorInertia;
    const thrustScale = ground * opt.thrust;
    let fx = 0, fy = 0, fz = 0, tx = 0, ty = 0, tz = 0, sx = 0, sy = 0, sz = 0;
    const pt = this.power;
    const count = pt.count;
    for (let step = 0; step < n; step++) {
      let minOmega = Infinity;
      for (let i = 0; i < count; i++) minOmega = Math.min(minOmega, Math.abs(pt.omega[i]!));
      const minRpm = minOmega * RPM_PER_RAD_S;
      const duty = this.pid.step(h, this.sp, this.sticks, throttle, -wz * DEG_PER_RAD, wx * DEG_PER_RAD, -wy * DEG_PER_RAD, this.flags, minRpm);
      this.turbulence.step(h);
      let ax = dx, ay = dy, az = dz, mx = dtx, my = dty, mz = dtz;
      for (let i = 0; i < count; i++) {
        const [hx, hy, hz] = hw.hubs[i]!;
        // Hub airspeed: body airspeed plus rotation (v + w x r).
        const ux = vx + wy * hz - wz * hy;
        let uy = vy + wz * hx - wx * hz;
        const uz = vz + wx * hy - wy * hx;
        // A lower coaxial prop already has the upper one's wake coming down through it.
        const above = hw.under[i]!;
        if (above >= 0) uy += this.induced[above]!;
        // A reversed prop (3D mode) is the same rotor upside down: solve it in its own frame, then flip back.
        const w = pt.omega[i]!;
        const dir = w < 0 ? -1 : 1;
        rotorLoads(this.loads, hw.rotor, w * dir, ux, uy * dir, uz, this.induced[i]!, thrustScale);
        this.induced[i] = this.loads.induced;
        const gust = 1 + spec.prop.wakeNoise * this.loads.wake * this.turbulence.value[i]!;
        const t = this.loads.thrust * gust * dir;
        this.aero[i] = this.loads.torque * gust * dir;
        ax += this.loads.hx;
        ay += t;
        az += this.loads.hz;
        mx += hy * this.loads.hz - hz * t;
        my += hz * this.loads.hx - hx * this.loads.hz;
        mz += hx * t - hy * this.loads.hx;
      }
      pt.step(h, spec.motor, spec.battery, duty, input.armed, this.aero, 1);
      // Motor reaction torques yaw the body; spinning rotors add gyroscopic torque.
      let spin = 0;
      for (let i = 0; i < count; i++) {
        my -= hw.spin[i]! * pt.drive[i]!;
        spin += hw.spin[i]! * pt.omega[i]!;
      }
      spin *= rotorInertia;
      mx += wz * spin;
      mz -= wx * spin;
      // Rigid-body gyroscopic terms (Euler's equations).
      mx -= wy * iz * wz - wz * iy * wy;
      my -= wz * ix * wx - wx * iz * wz;
      mz -= wx * iy * wy - wy * ix * wx;
      wx += (mx / ix) * h;
      wy += (my / iy) * h;
      wz += (mz / iz) * h;
      fx += ax; fy += ay; fz += az;
      tx += mx; ty += my; tz += mz;
      sx += wx; sy += wy; sz += wz;
    }
    const inv = 1 / n;
    // Apply in the attitude halfway through the step.
    const half = dt * 0.25 * inv;
    midQ.set(sx * half, sy * half, sz * half, 1).normalize().premultiply(scratchQ.copy(rotation));
    this.force.set(fx * inv, fy * inv, fz * inv).applyQuaternion(midQ);
    this.torque.set(tx * inv, ty * inv, tz * inv).applyQuaternion(midQ);
    let rpm = 0;
    for (let i = 0; i < count; i++) rpm += Math.abs(pt.omega[i]!) * RPM_PER_RAD_S;
    const frac = Math.min(1, rpm / count / spec.maxRpm);
    this.motorOutput = frac * frac;
  }

  /** Battery voltage under load over its resting voltage (for the HUD). */
  get sag(): number {
    return this.power.sag;
  }
}
