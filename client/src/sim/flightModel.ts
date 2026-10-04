import { Quaternion, Vector3 } from 'three';
import { QUAD, SIM, type QuadParams, type Rates } from '../config';
import { betaflightRate } from './rates';

/**
 * Custom acro flight model (ADR-0008). Pure maths: given sticks and the current body state,
 * produce the force to apply and the angular velocity to set for one fixed step.
 *
 * Body frame matches Three.js: +X right, +Y up, -Z forward (where the FPV camera looks).
 */

export interface FlightInput {
  /** 0..1 */
  throttle: number;
  /** -1..1, right stick right = +1 */
  roll: number;
  /** -1..1, right stick forward = +1 (nose down) */
  pitch: number;
  /** -1..1, left stick right = +1 (nose right) */
  yaw: number;
}

export interface FlightState {
  rotation: Quaternion;
  /** World-space linear velocity (m/s). */
  linvel: Vector3;
  /** World-space angular velocity (rad/s). */
  angvel: Vector3;
  /** Current motor output as a fraction of max thrust; negative when a 3D quad reverses (spools with motorTau). */
  motorOutput: number;
  /** Simulation time in seconds, drives deterministic prop-wash noise. */
  time: number;
}

export interface FlightOutput {
  /** World-space force (N) excluding gravity, which the physics engine applies. */
  force: Vector3;
  /** New world-space angular velocity (rad/s). */
  angvel: Vector3;
  motorOutput: number;
  /** Angle of attack (rad); wings only, 0 for quads. */
  alpha: number;
}

const DEG = Math.PI / 180;
export function maxThrust(p: QuadParams): number {
  return p.thrustToWeight * p.massKg * SIM.gravity;
}
export const MAX_THRUST_N = maxThrust(QUAD);

// Scratch objects: the flight model runs 500x per second, so it must not allocate (Hard rule 2).
const invRot = new Quaternion();
const bodyVec = new Vector3();
const bodyAngvel = new Vector3();
const targetBody = new Vector3();
const up = new Vector3();
const worldUpBody = new Vector3();

export function createFlightOutput(): FlightOutput {
  return { force: new Vector3(), angvel: new Vector3(), motorOutput: 0, alpha: 0 };
}

/**
 * Throttle stick (0..1) -> desired motor output, before spool lag.
 * Normal quads: 0..1 with airmode idle. 3D quads (ADR-0013): center is zero, below center reverses.
 */
export function throttleToMotor(throttle: number, armed: boolean, p: QuadParams = QUAD): number {
  if (!armed) return 0;
  const t = Math.max(0, Math.min(1, throttle));
  if (p.threeD) {
    const c = t * 2 - 1;
    const db = p.threeD.centerDeadband;
    if (Math.abs(c) <= db) return 0;
    const mag = Math.pow((Math.abs(c) - db) / (1 - db), p.throttleExponent);
    return c > 0 ? mag : -mag * p.threeD.reverseEfficiency;
  }
  return Math.max(p.idleThrust, Math.pow(t, p.throttleExponent));
}

/** True when the throttle is where it's safe to arm: bottom for normal quads, center for 3D. */
export function throttleSafeToArm(throttle: number, p: QuadParams, margin: number): boolean {
  return p.threeD ? Math.abs(throttle - 0.5) <= margin : throttle <= margin;
}

/** Throttle (0..1) needed to hover, handy for the HUD and tests. */
export function hoverThrottle(p: QuadParams = QUAD): number {
  return Math.pow(1 / p.thrustToWeight, 1 / p.throttleExponent);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Smooth pseudo-random signal in roughly -1..1, deterministic in time. */
function washNoise(t: number, seed: number): number {
  return (
    0.5 * Math.sin(t * 23.1 + seed * 1.7) +
    0.3 * Math.sin(t * 41.7 + seed * 4.3) +
    0.2 * Math.sin(t * 67.3 + seed * 9.1)
  );
}

/**
 * Horizon mode (ADR-0037): blend the acro rate setpoint in `target` (body frame, rad/s) with a self-levelling
 * one. Near center stick roll and pitch steer toward a tilt angle set by the stick; past `transition` stick
 * the levelling is gone and it's pure acro.
 */
export function horizonBlend(input: FlightInput, rotation: Quaternion, h: NonNullable<QuadParams['horizon']>, target: Vector3): Vector3 {
  // World up seen from the body. Level: (0, 1, 0). Rolled right: x < 0. Nose down: z > 0.
  worldUpBody.set(0, 1, 0).applyQuaternion(invRot.copy(rotation).invert());
  // Roll uses atan2 so an upside-down drone rolls back upright; pitch is the tilt toward the nose (±90°).
  const roll = Math.atan2(-worldUpBody.x, worldUpBody.y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, worldUpBody.z)));
  const max = h.maxAngleDeg * DEG;
  const cap = h.maxLevelDegPerSec * DEG;
  const clamp = (x: number) => Math.max(-cap, Math.min(cap, x));
  // Positive stick turns about the negative body axis (see stepFlight), so the rates are negated.
  const levelX = -clamp((input.pitch * max - pitch) * h.levelGain);
  const levelZ = -clamp((input.roll * max - roll) * h.levelGain);
  const stick = Math.min(1, Math.max(Math.abs(input.roll), Math.abs(input.pitch)));
  const level = Math.max(0, 1 - stick / h.transition);
  target.x = level * levelX + (1 - level) * target.x;
  target.z = level * levelZ + (1 - level) * target.z;
  return target;
}

/** Fraction of static thrust left with `inflow` m/s of air coming into the props (ADR-0040). */
export function propEfficiency(inflow: number, p: QuadParams): number {
  return Math.max(0, 1 - Math.max(0, inflow) / p.pitchSpeed);
}

export function stepFlight(
  input: FlightInput,
  state: FlightState,
  rates: Rates,
  armed: boolean,
  dt: number,
  out: FlightOutput,
  p: QuadParams = QUAD,
): FlightOutput {
  invRot.copy(state.rotation).invert();
  up.set(0, 1, 0).applyQuaternion(state.rotation);

  // --- Motors: spool toward the commanded output.
  const motorTarget = throttleToMotor(input.throttle, armed, p);
  const motorAlpha = 1 - Math.exp(-dt / p.motorTau);
  out.motorOutput = state.motorOutput + (motorTarget - state.motorOutput) * motorAlpha;

  // --- Rotation: track the Betaflight rate setpoint, like a well-tuned PID loop.
  if (armed) {
    // Positive stick = negative rotation about the body axis (see frame note above).
    targetBody.set(
      -betaflightRate(input.pitch, rates.pitch) * DEG,
      -betaflightRate(input.yaw, rates.yaw) * DEG,
      -betaflightRate(input.roll, rates.roll) * DEG,
    );
    if (p.horizon) horizonBlend(input, state.rotation, p.horizon, targetBody);

    // Prop wash: descending into your own disturbed air shakes the quad.
    const descent = -state.linvel.dot(up);
    const wash =
      smoothstep(p.propWash.startSpeed, p.propWash.fullSpeed, descent) *
      Math.min(1, Math.abs(out.motorOutput) * 3) *
      p.propWash.maxDegPerSec *
      DEG;
    if (wash > 0) {
      targetBody.x += wash * washNoise(state.time, 1);
      targetBody.z += wash * washNoise(state.time, 2);
      targetBody.y += 0.3 * wash * washNoise(state.time, 3);
    }

    bodyAngvel.copy(state.angvel).applyQuaternion(invRot);
    const rateAlpha = 1 - Math.exp(-dt / p.rateTau);
    bodyAngvel.lerp(targetBody, rateAlpha);
    out.angvel.copy(bodyAngvel).applyQuaternion(state.rotation);
  } else {
    // Disarmed: no control authority, the body keeps whatever spin physics gave it.
    out.angvel.copy(state.angvel);
  }

  // --- Forces: thrust along body up, fading as the air flows into the props near their pitch speed (ADR-0040);
  // drag computed in the body frame.
  out.force.copy(up).multiplyScalar(out.motorOutput * maxThrust(p) * propEfficiency(state.linvel.dot(up) * Math.sign(out.motorOutput), p));

  bodyVec.copy(state.linvel).applyQuaternion(invRot);
  const speed = bodyVec.length();
  bodyVec.set(
    -(p.dragQuadratic.x * speed + p.dragLinear) * bodyVec.x,
    -(p.dragQuadratic.y * speed + p.dragLinear) * bodyVec.y,
    -(p.dragQuadratic.z * speed + p.dragLinear) * bodyVec.z,
  );
  out.force.add(bodyVec.applyQuaternion(state.rotation));

  return out;
}
