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
  /** Lift coefficient at zero angle of attack, and slope per radian. */
  cl0: 0.15,
  clAlpha: 4.5,
  /** Stall angle (deg) and the lift left over once fully stalled. */
  stallDeg: 14,
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
 * Pugachev's Cobra (ADR-0014, reworked): hold Special for full up-elevator with stabilization off.
 * Pitch is then integrated from real moments instead of commanded directly:
 *   elevator moment      ~ q * S * c * elevator        (q = dynamic pressure: grows with airspeed squared)
 *   static stability     ~ -q * S * c * stability * sin(alpha)   (fights back harder as the nose rises)
 *   pitch damping        ~ -q * S * c * damping * rate / speed
 *   spin drag            ~ -spinDrag * rate * |rate|  (doesn't fade with speed, so a slowed wing can't tumble)
 * divided by the wing's pitch inertia. So the nose accelerates up in an arc, a fast wing Cobras hard,
 * a slow one barely can, speed bleeds from broadside drag, and the nose falls back as authority fades.
 */
export const COBRA = {
  /** Mean chord (m) and pitch moment of inertia (kg m^2). */
  chord: 0.3,
  pitchInertia: 0.03,
  /** Moment coefficients: full up-elevator, static stability, and pitch damping. */
  elevator: 0.08,
  stability: 0.075,
  damping: 0.2,
  /** Flat-plate rotational drag (N m per (rad/s)^2): a spinning wing pushes air even when it isn't moving. */
  spinDrag: 0.02,
} as const;

/**
 * One step of Cobra pitch dynamics. Takes and returns the body pitch rate (rad/s, nose-up positive).
 * `alpha` is the angle of attack (rad), `speed` the airspeed (m/s).
 */
export function cobraPitchStep(pitchRate: number, alpha: number, speed: number, dt: number): number {
  const q = 0.5 * WING.rho * speed * speed;
  const qsc = q * WING.area * COBRA.chord;
  const moment =
    qsc * COBRA.elevator -
    // Past 90° the airflow still pushes the nose back, so the restoring moment stays at full strength.
    qsc * COBRA.stability * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, alpha))) -
    (qsc * COBRA.damping * COBRA.chord * pitchRate) / Math.max(speed, 5) -
    COBRA.spinDrag * pitchRate * Math.abs(pitchRate);
  return pitchRate + (moment / COBRA.pitchInertia) * dt;
}

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
  /** Special held: Cobra pitch dynamics replace the pitch stick and weathervaning (ADR-0014). */
  cobra = false,
): FlightOutput {
  const rot = state.rotation;
  invRot.copy(rot).invert();
  right.set(1, 0, 0).applyQuaternion(rot);
  forward.set(0, 0, -1).applyQuaternion(rot);

  // --- Prop.
  const t = Math.max(0, Math.min(1, input.throttle));
  const motorTarget = armed ? Math.pow(t, WING.throttleExponent) : 0;
  out.motorOutput = state.motorOutput + (motorTarget - state.motorOutput) * (1 - Math.exp(-dt / WING.motorTau));
  out.force.copy(forward).multiplyScalar(out.motorOutput * WING.maxThrustN);

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
  const authority = Math.max(WING.minAuthority, Math.min(1, speed / WING.controlSpeed));
  const rateAlpha = 1 - Math.exp(-dt / WING.rateTau);
  if (cobra) {
    // Cobra: pitch integrates real moments; roll and yaw still follow the sticks (ADR-0014).
    bodyAngvel.copy(state.angvel).applyQuaternion(invRot);
    const pitch = cobraPitchStep(bodyAngvel.x, alpha, speed, dt);
    target.set(0, -expo(input.yaw) * WING.maxYawDeg * DEG * authority, -expo(input.roll) * WING.maxRollDeg * DEG * authority);
    bodyAngvel.y += (target.y - bodyAngvel.y) * rateAlpha;
    bodyAngvel.z += (target.z - bodyAngvel.z) * rateAlpha;
    bodyAngvel.x = pitch;
    out.angvel.copy(bodyAngvel).applyQuaternion(rot);
  } else if (armed || speed > 3) {
    target.set(
      -expo(input.pitch) * WING.maxPitchDeg * DEG * authority,
      -expo(input.yaw) * WING.maxYawDeg * DEG * authority,
      -expo(input.roll) * WING.maxRollDeg * DEG * authority,
    );
    // To world, then add the weathervane turn that swings the nose toward the flight path.
    target.applyQuaternion(rot);
    if (speed > 0.5) {
      vane.crossVectors(forward, vHat).multiplyScalar(WING.weathervane * Math.min(1.5, speed / WING.controlSpeed));
      target.add(vane);
    }
    bodyAngvel.copy(state.angvel);
    bodyAngvel.lerp(target, rateAlpha);
    out.angvel.copy(bodyAngvel);
  } else {
    out.angvel.copy(state.angvel);
  }
  return out;
}

/** Level-flight speed at a given lift coefficient (for tests and HUD hints). */
export function levelFlightSpeed(cl: number): number {
  return Math.sqrt((2 * WING.massKg * SIM.gravity) / (WING.rho * WING.area * cl));
}
