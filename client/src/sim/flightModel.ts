import { Quaternion, Vector3 } from 'three';
import { QUAD, SIM, type Rates } from '../config';
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
  /** Current motor output as a fraction of max thrust (spools with QUAD.motorTau). */
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
}

const DEG = Math.PI / 180;
export const MAX_THRUST_N = QUAD.thrustToWeight * QUAD.massKg * SIM.gravity;

// Scratch objects: the flight model runs 500x per second, so it must not allocate (Hard rule 2).
const invRot = new Quaternion();
const bodyVec = new Vector3();
const bodyAngvel = new Vector3();
const targetBody = new Vector3();
const up = new Vector3();

export function createFlightOutput(): FlightOutput {
  return { force: new Vector3(), angvel: new Vector3(), motorOutput: 0 };
}

/** Throttle stick (0..1) -> desired motor output (0..1), before spool lag. */
export function throttleToMotor(throttle: number, armed: boolean): number {
  if (!armed) return 0;
  const t = Math.max(0, Math.min(1, throttle));
  return Math.max(QUAD.idleThrust, Math.pow(t, QUAD.throttleExponent));
}

/** Throttle (0..1) needed to hover, handy for the HUD and tests. */
export function hoverThrottle(): number {
  return Math.pow(1 / QUAD.thrustToWeight, 1 / QUAD.throttleExponent);
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

export function stepFlight(
  input: FlightInput,
  state: FlightState,
  rates: Rates,
  armed: boolean,
  dt: number,
  out: FlightOutput,
): FlightOutput {
  invRot.copy(state.rotation).invert();
  up.set(0, 1, 0).applyQuaternion(state.rotation);

  // --- Motors: spool toward the commanded output.
  const motorTarget = throttleToMotor(input.throttle, armed);
  const motorAlpha = 1 - Math.exp(-dt / QUAD.motorTau);
  out.motorOutput = state.motorOutput + (motorTarget - state.motorOutput) * motorAlpha;

  // --- Rotation: track the Betaflight rate setpoint, like a well-tuned PID loop.
  if (armed) {
    // Positive stick = negative rotation about the body axis (see frame note above).
    targetBody.set(
      -betaflightRate(input.pitch, rates.pitch) * DEG,
      -betaflightRate(input.yaw, rates.yaw) * DEG,
      -betaflightRate(input.roll, rates.roll) * DEG,
    );

    // Prop wash: descending into your own disturbed air shakes the quad.
    const descent = -state.linvel.dot(up);
    const wash =
      smoothstep(QUAD.propWash.startSpeed, QUAD.propWash.fullSpeed, descent) *
      Math.min(1, out.motorOutput * 3) *
      QUAD.propWash.maxDegPerSec *
      DEG;
    if (wash > 0) {
      targetBody.x += wash * washNoise(state.time, 1);
      targetBody.z += wash * washNoise(state.time, 2);
      targetBody.y += 0.3 * wash * washNoise(state.time, 3);
    }

    bodyAngvel.copy(state.angvel).applyQuaternion(invRot);
    const rateAlpha = 1 - Math.exp(-dt / QUAD.rateTau);
    bodyAngvel.lerp(targetBody, rateAlpha);
    out.angvel.copy(bodyAngvel).applyQuaternion(state.rotation);
  } else {
    // Disarmed: no control authority, the body keeps whatever spin physics gave it.
    out.angvel.copy(state.angvel);
  }

  // --- Forces: thrust along body up, drag computed in the body frame.
  out.force.copy(up).multiplyScalar(out.motorOutput * MAX_THRUST_N);

  bodyVec.copy(state.linvel).applyQuaternion(invRot);
  const speed = bodyVec.length();
  bodyVec.set(
    -(QUAD.dragQuadratic.x * speed + QUAD.dragLinear) * bodyVec.x,
    -(QUAD.dragQuadratic.y * speed + QUAD.dragLinear) * bodyVec.y,
    -(QUAD.dragQuadratic.z * speed + QUAD.dragLinear) * bodyVec.z,
  );
  out.force.add(bodyVec.applyQuaternion(state.rotation));

  return out;
}
