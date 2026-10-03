// Freestyle's piloted missile (ADR-0025). The shooter flies it from its own camera with the same
// shared physics; the server validates the reported path and decides hits.

import { raycastArena, segmentPointDistance, type BoxCollider } from './raycast.js';

export type Vec3 = [number, number, number];
/** Quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export const MISSILE = {
  /** Speed leaving the rail (m/s). */
  launchSpeed: 60,
  /**
   * Thrust as acceleration (m/s²) at full throttle; at zero throttle the motor still gives
   * `idleThrust` of it. Drag (a = drag·v²) sets the cruise speeds: ~120 m/s at full, ~60 at idle.
   */
  thrustAccel: 140,
  idleThrust: 0.25,
  drag: 0.0097,
  /** Validation cap for reported speeds (m/s). */
  maxSpeed: 130,
  /** Body rates at full stick (deg/s), scaled by thrust-vectoring authority. */
  rollDeg: 360,
  pitchDeg: 160,
  yawDeg: 100,
  /** Stick expo, so small corrections are gentle. */
  expo: 0.3,
  /** Turn authority from thrust vectoring: `minAuthority` at idle up to 1 at full throttle; after burnout `glideAuthority`. */
  minAuthority: 0.4,
  glideAuthority: 0.3,
  /** How fast the flight path swings onto the nose (1/s): high, it's a missile. */
  align: 6,
  glideAlign: 1.5,
  /** Fuel in seconds at full throttle; burns at `idleBurn` of that rate at zero throttle. */
  fuelSeconds: 6,
  idleBurn: 0.3,
  /** After burnout it glides (gravity, drag) this long, then self-destructs. */
  glideSeconds: 1.5,
  /** Never flies longer than this, whatever the throttle (s). */
  maxFlightSeconds: 10,
  gravity: 9.81,
  /** Proximity fuse radius (m, ADR-0027). */
  proximity: 4,
  /**
   * One-shot kill (ADR-0018): anyone within `lethalRadius` of the blast dies, whatever their class.
   * It's larger than the fuse radius, so a missile that fuses on you always kills.
   * Beyond it, splash falls from `damage` to 0 at `splashRadius` (e.g. a wall hit next to you).
   */
  lethalRadius: 5,
  damage: 50,
  splashRadius: 10,
  /** Pod size, time to regenerate one (ms), and how many can fly at once. */
  pod: 3,
  regenMs: 4000,
  maxInFlight: 1,
  /** Server: a missile with no position update for this long explodes where it was (ms). */
  staleMs: 500,
} as const;

/** Total time a missile can exist (s): flight cap plus the glide after burnout. */
export const MISSILE_MAX_AGE = MISSILE.maxFlightSeconds + MISSILE.glideSeconds;

export interface MissileState {
  p: Vec3;
  /** Velocity (m/s). */
  v: Vec3;
  /** Orientation; the nose is local -Z (like the drones). */
  q: Quat;
  /** Seconds since launch. */
  age: number;
  /** Fuel left, in seconds at full throttle. */
  fuel: number;
  /** Age when the fuel ran out, or null while burning. */
  burnout: number | null;
  /** Last throttle (0..1), for the HUD and sound. */
  throttle: number;
}

/** The pilot's sticks while flying the missile: throttle 0..1, rates -1..1. */
export interface MissileInput {
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export function launchMissile(p: Vec3, d: Vec3): MissileState {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  return {
    p: [p[0], p[1], p[2]],
    v: [dir[0] * MISSILE.launchSpeed, dir[1] * MISSILE.launchSpeed, dir[2] * MISSILE.launchSpeed],
    q: quatLookAlong(dir),
    age: 0,
    fuel: MISSILE.fuelSeconds,
    burnout: null,
    throttle: 0.5,
  };
}

const expo = (x: number) => x * (1 - MISSILE.expo) + x * x * x * MISSILE.expo;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * Advance one step under the pilot's input (null = sticks centered, half throttle). Sticks command body
 * rates with thrust-vectoring authority; the flight path swings onto the nose; thrust, drag and (after
 * burnout) gravity set the speed. Returns false once its flight is over (self-destruct).
 */
export function stepMissile(m: MissileState, input: MissileInput | null, dt: number): boolean {
  const throttle = clamp(input?.throttle ?? 0.5, 0, 1);
  const burning = m.burnout === null;
  m.throttle = burning ? throttle : 0;

  // Fuel.
  if (burning) {
    m.fuel -= (MISSILE.idleBurn + (1 - MISSILE.idleBurn) * throttle) * dt;
    if (m.fuel <= 0) {
      m.fuel = 0;
      m.burnout = m.age;
    }
  }
  const thrustFrac = m.burnout === null ? MISSILE.idleThrust + (1 - MISSILE.idleThrust) * throttle : 0;

  // Rotation: body rates from the sticks (same signs as the wing), scaled by vectoring authority.
  const authority = m.burnout === null ? MISSILE.minAuthority + (1 - MISSILE.minAuthority) * throttle : MISSILE.glideAuthority;
  const DEG = Math.PI / 180;
  const wx = -expo(clamp(input?.pitch ?? 0, -1, 1)) * MISSILE.pitchDeg * DEG * authority;
  const wy = -expo(clamp(input?.yaw ?? 0, -1, 1)) * MISSILE.yawDeg * DEG * authority;
  const wz = -expo(clamp(input?.roll ?? 0, -1, 1)) * MISSILE.rollDeg * DEG * authority;
  const angle = Math.hypot(wx, wy, wz) * dt;
  if (angle > 1e-9) {
    const k = Math.sin(angle / 2) / (Math.hypot(wx, wy, wz) || 1);
    m.q = quatNormalize(quatMultiply(m.q, [wx * k, wy * k, wz * k, Math.cos(angle / 2)]));
  }
  const nose = quatRotate(m.q, [0, 0, -1]);

  // Speed: thrust minus drag along the path.
  let speed = Math.hypot(m.v[0], m.v[1], m.v[2]);
  speed = Math.max(0, speed + (MISSILE.thrustAccel * thrustFrac - MISSILE.drag * speed * speed) * dt);
  // Direction: swing the flight path toward the nose.
  let dir: Vec3 = speed > 1e-6 ? [m.v[0], m.v[1], m.v[2]] : [nose[0], nose[1], nose[2]];
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
  const f = 1 - Math.exp(-(m.burnout === null ? MISSILE.align : MISSILE.glideAlign) * dt);
  dir = [dir[0] + (nose[0] - dir[0]) * f, dir[1] + (nose[1] - dir[1]) * f, dir[2] + (nose[2] - dir[2]) * f];
  const nl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  m.v = [(dir[0] / nl) * speed, (dir[1] / nl) * speed, (dir[2] / nl) * speed];
  // Powered, the motor holds it up; gliding, gravity takes over.
  if (m.burnout !== null) m.v[1] -= MISSILE.gravity * dt;

  m.p[0] += m.v[0] * dt;
  m.p[1] += m.v[1] * dt;
  m.p[2] += m.v[2] * dt;
  m.age += dt;
  if (m.age >= MISSILE.maxFlightSeconds && m.burnout === null) m.burnout = m.age;
  return m.burnout === null || m.age - m.burnout < MISSILE.glideSeconds;
}

// --- Small quaternion helpers (shared code can't use three.js types on the server's hot path).

export function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v); v' = v + w t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Orientation whose nose (-Z) points along `dir`, with no roll (right wing level). */
export function quatLookAlong(dir: Vec3): Quat {
  const yaw = Math.atan2(-dir[0], -dir[2]);
  const pitch = Math.asin(clamp(dir[1], -1, 1));
  const qy: Quat = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qx: Quat = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  return quatMultiply(qy, qx);
}

/** Enough to destroy any drone class outright. */
export const LETHAL_DAMAGE = 10_000;

/** Splash damage at `distance` metres from the blast: lethal up close, then falling off (ADR-0018). */
export function splashDamage(distance: number): number {
  if (distance <= MISSILE.lethalRadius) return LETHAL_DAMAGE;
  if (distance >= MISSILE.splashRadius) return 0;
  const t = (distance - MISSILE.lethalRadius) / (MISSILE.splashRadius - MISSILE.lethalRadius);
  return Math.round(MISSILE.damage * (1 - t));
}

/** Pod regeneration shared by server (authoritative) and client (HUD mirror). */
export function refillPod(ammo: number, lastMs: number, nowMs: number, size: number = MISSILE.pod): { ammo: number; at: number } {
  if (ammo >= size) return { ammo: size, at: nowMs };
  return { ammo: Math.min(size, ammo + (nowMs - lastMs) / MISSILE.regenMs), at: nowMs };
}

/**
 * Where along this step (A -> B) a missile detonates, as a fraction 0..1, or null if it flies on.
 * Geometry: first surface hit on the segment. Proximity fuse: closest approach to any target within
 * MISSILE.proximity. Shared by the server (authoritative) and the shooter's prediction, so they agree.
 */
export function missileImpact(
  a: Vec3,
  b: Vec3,
  colliders: readonly BoxCollider[],
  targets: readonly (readonly [number, number, number] | { x: number; y: number; z: number })[],
): number | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const step = Math.hypot(dx, dy, dz);
  if (step <= 0) return null;
  let best: number | null = null;
  // raycastArena returns `step` itself when nothing is in the way, so only strictly-less is a hit.
  const wall = raycastArena(colliders, a[0], a[1], a[2], dx / step, dy / step, dz / step, step);
  if (wall < step) best = wall / step;
  for (const t of targets) {
    const [px, py, pz] = Array.isArray(t) ? t : [(t as { x: number }).x, (t as { y: number }).y, (t as { z: number }).z];
    if (segmentPointDistance(a[0], a[1], a[2], b[0], b[1], b[2], px, py, pz) > MISSILE.proximity) continue;
    const len2 = step * step;
    const f = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / len2));
    if (best === null || f < best) best = f;
  }
  return best;
}
