import { Quaternion, Vector3 } from 'three';
import { SIM } from '../config';
import type { FlightInput, FlightOutput, FlightState } from './flightModel';

/**
 * FPV wing flight model (ADR-0013). A flying wing with a pusher prop.
 *
 * - Lift from angle of attack (linear, then a stall), acting perpendicular to the airflow.
 * - Drag: parasitic plus induced (grows with lift) plus extra when stalled.
 * - A fin-like side force that kills sideslip.
 * - Sticks command body rates (rate mode, like a stabilized FPV wing in acro). Control authority
 *   scales with airspeed, and the nose weathervanes into the airflow, so a slow wing drops its nose.
 *
 * Same frame as the quad: +X right, +Y up, -Z forward (the nose and camera).
 */

export const WING = {
  massKg: 1.0,
  /** Collision box half-extents (m): ~0.9 m span, thin, ~0.5 m chord. */
  halfExtents: { x: 0.45, y: 0.04, z: 0.25 },
  /** Pusher prop max thrust (N): about 1.6x weight. */
  maxThrustN: 16,
  throttleExponent: 1.3,
  motorTau: 0.08,
  /** Air density (kg/m^3) and wing area (m^2). */
  rho: 1.225,
  area: 0.22,
  /** Lift coefficient at zero angle of attack, and slope per radian. Level stall speed ~9.7 m/s (35 km/h). */
  cl0: 0.15,
  clAlpha: 3.0,
  /** Stall angle (deg) and the lift left over once fully stalled. */
  stallDeg: 12,
  clPostStall: 0.45,
  /** Drag: parasitic, induced factor, and extra flat-plate drag when the air hits the wing broadside. */
  cd0: 0.035,
  inducedK: 0.06,
  cdBroadside: 0.5,
  /** Side force per (m/s of sideslip x m/s of airspeed): the winglets act as fins. */
  sideDamping: 0.05,
  /** Max commanded rates at full stick (deg/s). */
  maxRollDeg: 420,
  maxPitchDeg: 220,
  maxYawDeg: 90,
  /** Airspeed where the control surfaces have full authority, and the minimum authority when slow. */
  controlSpeed: 18,
  minAuthority: 0.25,
  /** How quickly rotation follows the sticks (s). */
  rateTau: 0.05,
  /** How strongly the nose aligns with the airflow (1/s at controlSpeed). */
  weathervane: 3,
  /** Stick expo so small corrections are gentle. */
  expo: 0.35,
  /** Camera uptilt for the wing (deg): wings fly nose-forward. */
  cameraUptiltDeg: 6,
  /** Hand-launch: spawn this high and this fast (ADR-0013). */
  launchHeight: 14,
  launchSpeed: 20,
} as const;

/**
 * Maneuver mode (ADR-0022): hold Special (or leave a switch on) for more pitch and roll authority and
 * relaxed stability. The nose no longer pulls itself back into the airflow as hard, so a hard pull can
 * take the wing past its stall angle: more agile, easier to stall.
 */
export const MANEUVER = {
  pitchScale: 2,
  rollScale: 1.3,
  /** Minimum control authority when slow (normal: WING.minAuthority). */
  minAuthority: 0.5,
  /** Fraction of the normal weathervane (nose-into-airflow) effect that remains. */
  weathervaneScale: 0.25,
} as const;

const DEG = Math.PI / 180;

const invRot = new Quaternion();
const vBody = new Vector3();
const vHat = new Vector3();
const right = new Vector3();
const forward = new Vector3();
const liftDir = new Vector3();
const target = new Vector3();
const vane = new Vector3();
const bodyAngvel = new Vector3();

function expo(x: number): number {
  return x * (1 - WING.expo) + x * x * x * WING.expo;
}

/** Lift coefficient for angle of attack `alpha` (rad): linear up to the stall, then it falls away. */
export function liftCoefficient(alpha: number): number {
  const stall = WING.stallDeg * DEG;
  const a = Math.abs(alpha);
  if (a <= stall) return WING.cl0 + WING.clAlpha * alpha;
  const peak = WING.cl0 + WING.clAlpha * stall;
  // Past the stall, lift fades toward the post-stall level over the next ~20 degrees.
  const fade = Math.min(1, (a - stall) / (20 * DEG));
  const mag = peak + (WING.clPostStall - peak) * fade;
  return Math.sign(alpha) * mag;
}


export function stepWing(
  input: FlightInput,
  state: FlightState,
  armed: boolean,
  dt: number,
  out: FlightOutput,
  /** Special held: maneuver mode (ADR-0022). */
  maneuver = false,
  /** Thrust multiplier (afterburner, ADR-0033). */
  thrustScale = 1,
): FlightOutput {
  const rot = state.rotation;
  invRot.copy(rot).invert();
  right.set(1, 0, 0).applyQuaternion(rot);
  forward.set(0, 0, -1).applyQuaternion(rot);

  // --- Prop.
  const t = Math.max(0, Math.min(1, input.throttle));
  const motorTarget = armed ? Math.pow(t, WING.throttleExponent) : 0;
  out.motorOutput = state.motorOutput + (motorTarget - state.motorOutput) * (1 - Math.exp(-dt / WING.motorTau));
  out.force.copy(forward).multiplyScalar(out.motorOutput * WING.maxThrustN * thrustScale);

  // --- Aerodynamics. Air moves opposite to the wing, so the flow direction is -velocity.
  const speed = state.linvel.length();
  let alpha = 0;
  if (speed > 0.5) {
    vHat.copy(state.linvel).divideScalar(speed);
    vBody.copy(state.linvel).applyQuaternion(invRot);
    // Positive when the nose is above the flight path.
    alpha = Math.atan2(-vBody.y, -vBody.z);
    const cl = liftCoefficient(alpha);
    const q = 0.5 * WING.rho * speed * speed * WING.area;

    // Lift: perpendicular to the airflow, in the wing's up/forward plane.
    liftDir.crossVectors(right, vHat);
    if (liftDir.lengthSq() > 1e-6) out.force.addScaledVector(liftDir.normalize(), q * cl);

    const broadside = Math.sin(alpha) ** 2;
    const cd = WING.cd0 + WING.inducedK * cl * cl + WING.cdBroadside * broadside;
    out.force.addScaledVector(vHat, -q * cd);

    // Winglets resist sideslip.
    out.force.addScaledVector(right, -vBody.x * speed * WING.sideDamping);
  }

  // --- Rotation: commanded rates, weaker when slow, plus the nose weathervaning into the airflow.
  const minAuthority = maneuver ? MANEUVER.minAuthority : WING.minAuthority;
  const authority = Math.max(minAuthority, Math.min(1, speed / WING.controlSpeed));
  const rateAlpha = 1 - Math.exp(-dt / WING.rateTau);
  if (armed || speed > 3) {
    const pitchRate = WING.maxPitchDeg * (maneuver ? MANEUVER.pitchScale : 1);
    const rollRate = WING.maxRollDeg * (maneuver ? MANEUVER.rollScale : 1);
    target.set(
      -expo(input.pitch) * pitchRate * DEG * authority,
      -expo(input.yaw) * WING.maxYawDeg * DEG * authority,
      -expo(input.roll) * rollRate * DEG * authority,
    );
    // To world, then add the weathervane turn that swings the nose toward the flight path.
    target.applyQuaternion(rot);
    if (speed > 0.5) {
      const vaneGain = WING.weathervane * (maneuver ? MANEUVER.weathervaneScale : 1);
      vane.crossVectors(forward, vHat).multiplyScalar(vaneGain * Math.min(1.5, speed / WING.controlSpeed));
      target.add(vane);
    }
    bodyAngvel.copy(state.angvel);
    bodyAngvel.lerp(target, rateAlpha);
    out.angvel.copy(bodyAngvel);
  } else {
    out.angvel.copy(state.angvel);
  }
  out.alpha = alpha;
  return out;
}

/** Level-flight speed at a given lift coefficient (for tests and HUD hints). */
export function levelFlightSpeed(cl: number): number {
  return Math.sqrt((2 * WING.massKg * SIM.gravity) / (WING.rho * WING.area * cl));
}
