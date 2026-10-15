import { Quaternion, Vector3 } from 'three';
import type { HorizonParams, Rates } from '../config';
import { betaflightRate } from './rates';

/**
 * What every flight model shares (ADR-0008): stick input, body state, and the rate setpoint the sticks ask for.
 * Quads fly the physical model (physicalQuad.ts, ADR-0063/0064); the wing flies wingModel.ts.
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
  /** Current motor output as a fraction of max thrust (for sound and the wing's spool). */
  motorOutput: number;
  /** Simulation time in seconds. */
  time: number;
}

/** The wing model's output for one step. */
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

// Scratch objects: the flight models run every physics step, so they must not allocate (Hard rule 2).
const invRot = new Quaternion();
const worldUpBody = new Vector3();

export function createFlightOutput(): FlightOutput {
  return { force: new Vector3(), angvel: new Vector3(), motorOutput: 0, alpha: 0 };
}

/** True when the throttle is where it's safe to arm: bottom for normal quads, center for reversible (3D) ones. */
export function throttleSafeToArm(throttle: number, reversible: boolean, margin: number): boolean {
  return reversible ? Math.abs(throttle - 0.5) <= margin : throttle <= margin;
}

/**
 * Horizon mode (ADR-0037): blend the acro rate setpoint in `target` (body frame, rad/s) with a self-levelling
 * one. Near center stick roll and pitch steer toward a tilt angle set by the stick; past `transition` stick
 * the levelling is gone and it's pure acro.
 */
export function horizonBlend(input: FlightInput, rotation: Quaternion, h: HorizonParams, target: Vector3): Vector3 {
  // World up seen from the body. Level: (0, 1, 0). Rolled right: x < 0. Nose down: z > 0.
  worldUpBody.set(0, 1, 0).applyQuaternion(invRot.copy(rotation).invert());
  // Roll uses atan2 so an upside-down drone rolls back upright; pitch is the tilt toward the nose (±90°).
  const roll = Math.atan2(-worldUpBody.x, worldUpBody.y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, worldUpBody.z)));
  const max = h.maxAngleDeg * DEG;
  const cap = h.maxLevelDegPerSec * DEG;
  const clamp = (x: number) => Math.max(-cap, Math.min(cap, x));
  // Positive stick turns about the negative body axis (see rateSetpoint), so the rates are negated.
  const levelX = -clamp((input.pitch * max - pitch) * h.levelGain);
  const levelZ = -clamp((input.roll * max - roll) * h.levelGain);
  const stick = Math.min(1, Math.max(Math.abs(input.roll), Math.abs(input.pitch)));
  const level = Math.max(0, 1 - stick / h.transition);
  target.x = level * levelX + (1 - level) * target.x;
  target.z = level * levelZ + (1 - level) * target.z;
  return target;
}

/**
 * The rotation rate the sticks ask for, in the body frame (rad/s): Betaflight rates, blended with
 * self-levelling in horizon/angle (ADR-0037, ADR-0045). Positive stick turns about the negative body axis.
 */
export function rateSetpoint(input: FlightInput, rotation: Quaternion, rates: Rates, horizon: HorizonParams | undefined, out: Vector3): Vector3 {
  out.set(
    -betaflightRate(input.pitch, rates.pitch) * DEG,
    -betaflightRate(input.yaw, rates.yaw) * DEG,
    -betaflightRate(input.roll, rates.roll) * DEG,
  );
  if (horizon) horizonBlend(input, rotation, horizon, out);
  return out;
}
