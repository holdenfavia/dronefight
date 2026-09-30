// Freestyle's TOW-style guided missile (ADR-0016). Shared physics: the server flies it authoritatively,
// and the shooter's client runs the same code to predict their own missile with zero steering lag.

import { raycastArena, segmentPointDistance, type BoxCollider } from './raycast.js';

export type Vec3 = [number, number, number];

export const MISSILE = {
  /** Motor burn: constant speed (m/s) for boostSeconds. */
  speed: 95,
  boostSeconds: 2.5,
  /** Self-destructs at this age (s): together with the burn time this caps the reach (~340 m). */
  lifetimeSeconds: 5,
  /** Max turn rate while boosting, and after burnout (deg/s). */
  turnRateDeg: 110,
  coastTurnRateDeg: 30,
  /** After burnout: speed decays by this fraction per second, and gravity pulls it down. */
  coastDrag: 0.8,
  gravity: 9.81,
  /** Guidance aims this far past the missile along your line of sight (m), so it flies onto the crosshair smoothly. */
  aimLead: 12,
  /** Proximity fuse radius (m) and splash: `damage` at the center, 0 at `splashRadius`. */
  proximity: 2.5,
  damage: 45,
  splashRadius: 5,
  /** Pod size, time to regenerate one (ms), and how many can fly at once (a TOW operator guides one). */
  pod: 3,
  regenMs: 4000,
  maxInFlight: 1,
} as const;

export interface MissileState {
  p: Vec3;
  /** Velocity (m/s). */
  v: Vec3;
  /** Seconds since launch. */
  age: number;
}

/** The shooter's line of sight: where their crosshair points. */
export interface AimRay {
  o: Vec3;
  d: Vec3;
}

export function launchMissile(p: Vec3, d: Vec3): MissileState {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return { p: [p[0], p[1], p[2]], v: [(d[0] / len) * MISSILE.speed, (d[1] / len) * MISSILE.speed, (d[2] / len) * MISSILE.speed], age: 0 };
}

/**
 * Advance one step. Guidance (SACLOS, like a TOW): steer toward the point on the shooter's line of sight
 * a little past the missile, limited by the turn rate. `aim` null = wire cut: no steering.
 * Returns false once the missile has reached its lifetime (self-destruct).
 */
export function stepMissile(m: MissileState, aim: AimRay | null, dt: number): boolean {
  const boosting = m.age < MISSILE.boostSeconds;
  let [vx, vy, vz] = m.v;
  let speed = Math.hypot(vx, vy, vz);

  if (aim && speed > 1) {
    const [ox, oy, oz] = aim.o;
    const range = Math.hypot(m.p[0] - ox, m.p[1] - oy, m.p[2] - oz) + MISSILE.aimLead;
    const tx = ox + aim.d[0] * range - m.p[0];
    const ty = oy + aim.d[1] * range - m.p[1];
    const tz = oz + aim.d[2] * range - m.p[2];
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      // Rotate the velocity direction toward the target direction by at most maxTurn.
      const cx = vx / speed;
      const cy = vy / speed;
      const cz = vz / speed;
      const wx = tx / tl;
      const wy = ty / tl;
      const wz = tz / tl;
      const angle = Math.acos(Math.max(-1, Math.min(1, cx * wx + cy * wy + cz * wz)));
      const maxTurn = ((boosting ? MISSILE.turnRateDeg : MISSILE.coastTurnRateDeg) * Math.PI) / 180 * dt;
      if (angle > 1e-6) {
        const k = Math.min(1, maxTurn / angle);
        // Slerp between the unit vectors.
        const sinA = Math.sin(angle);
        const a = Math.sin((1 - k) * angle) / sinA;
        const b = Math.sin(k * angle) / sinA;
        vx = (a * cx + b * wx) * speed;
        vy = (a * cy + b * wy) * speed;
        vz = (a * cz + b * wz) * speed;
      }
    }
  }

  if (boosting) {
    // Motor on: hold speed along the current heading.
    const s = Math.hypot(vx, vy, vz) || 1;
    vx = (vx / s) * MISSILE.speed;
    vy = (vy / s) * MISSILE.speed;
    vz = (vz / s) * MISSILE.speed;
  } else {
    // Burnt out: drag bleeds speed and gravity pulls it down. No more boost, ever.
    const decay = Math.exp(-MISSILE.coastDrag * dt);
    vx *= decay;
    vy = vy * decay - MISSILE.gravity * dt;
    vz *= decay;
  }
  speed = Math.hypot(vx, vy, vz);
  m.v[0] = vx;
  m.v[1] = vy;
  m.v[2] = vz;
  m.p[0] += vx * dt;
  m.p[1] += vy * dt;
  m.p[2] += vz * dt;
  m.age += dt;
  return m.age < MISSILE.lifetimeSeconds;
}

/** Splash damage at `distance` metres from the blast. */
export function splashDamage(distance: number): number {
  if (distance >= MISSILE.splashRadius) return 0;
  return Math.round(MISSILE.damage * (1 - distance / MISSILE.splashRadius));
}

/** Pod regeneration shared by server (authoritative) and client (HUD mirror). */
export function refillPod(ammo: number, lastMs: number, nowMs: number): { ammo: number; at: number } {
  if (ammo >= MISSILE.pod) return { ammo: MISSILE.pod, at: nowMs };
  return { ammo: Math.min(MISSILE.pod, ammo + (nowMs - lastMs) / MISSILE.regenMs), at: nowMs };
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
