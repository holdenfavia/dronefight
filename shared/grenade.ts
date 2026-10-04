// Grenade launcher (ADR-0034): a physics grenade that arcs, bounces and rolls, and goes off when you press
// Fire again (or after its fuse). The server simulates every grenade with this code; the shooter's client
// runs the same code to predict their own.

import { raycastArenaHit, type BoxCollider } from './raycast.js';

export type Vec3 = [number, number, number];

export const GRENADE = {
  /** Muzzle speed (m/s), added to the drone's own velocity. */
  launchSpeed: 42,
  gravity: 9.81,
  /** Air drag: fraction of speed lost per second. */
  drag: 0.08,
  /** Bounce: fraction of speed kept along the surface normal, and along the surface. */
  restitution: 0.45,
  friction: 0.75,
  /** Below this speed on a floor it stops (rests). */
  restSpeed: 0.8,
  /** Goes off by itself after this long (s). */
  fuseSeconds: 8,
  /** Physics step (s). */
  step: 1 / 120,
  /** Blast: full damage out to `coreRadius`, falling to 0 at `splashRadius`. Big on purpose. */
  damage: 95,
  coreRadius: 3,
  splashRadius: 12,
} as const;

export interface GrenadeState {
  p: Vec3;
  v: Vec3;
  age: number;
  resting: boolean;
}

export function launchGrenade(p: Vec3, d: Vec3, carrierVelocity: Vec3 = [0, 0, 0]): GrenadeState {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const s = GRENADE.launchSpeed / len;
  return {
    p: [p[0], p[1], p[2]],
    v: [d[0] * s + carrierVelocity[0], d[1] * s + carrierVelocity[1], d[2] * s + carrierVelocity[2]],
    age: 0,
    resting: false,
  };
}

/**
 * Advance by `dt` (sub-stepped). Gravity and drag, then move along the path, bouncing off any surface it
 * meets. Returns the number of bounces (for the clink sound) and whether the fuse has run out.
 */
export function stepGrenade(g: GrenadeState, colliders: readonly BoxCollider[], dt: number): { bounces: number; expired: boolean } {
  let bounces = 0;
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(GRENADE.step, remaining);
    remaining -= h;
    g.age += h;
    if (g.resting) continue;
    g.v[1] -= GRENADE.gravity * h;
    const keep = Math.max(0, 1 - GRENADE.drag * h);
    g.v[0] *= keep;
    g.v[1] *= keep;
    g.v[2] *= keep;
    const speed = Math.hypot(g.v[0], g.v[1], g.v[2]);
    const travel = speed * h;
    if (travel < 1e-9) continue;
    const dx = g.v[0] / speed;
    const dy = g.v[1] / speed;
    const dz = g.v[2] / speed;
    const hit = raycastArenaHit(colliders, g.p[0], g.p[1], g.p[2], dx, dy, dz, travel);
    if (!hit) {
      g.p[0] += g.v[0] * h;
      g.p[1] += g.v[1] * h;
      g.p[2] += g.v[2] * h;
      continue;
    }
    // Move to just short of the surface, then reflect: lose energy into it, and a little along it.
    const back = 0.02;
    g.p[0] += dx * hit.dist + hit.nx * back;
    g.p[1] += dy * hit.dist + hit.ny * back;
    g.p[2] += dz * hit.dist + hit.nz * back;
    const vn = g.v[0] * hit.nx + g.v[1] * hit.ny + g.v[2] * hit.nz;
    const tx = g.v[0] - vn * hit.nx;
    const ty = g.v[1] - vn * hit.ny;
    const tz = g.v[2] - vn * hit.nz;
    g.v[0] = tx * GRENADE.friction - vn * GRENADE.restitution * hit.nx;
    g.v[1] = ty * GRENADE.friction - vn * GRENADE.restitution * hit.ny;
    g.v[2] = tz * GRENADE.friction - vn * GRENADE.restitution * hit.nz;
    if (Math.abs(vn) > 2) bounces++;
    // Settled on a floor: stop.
    if (hit.ny > 0.7 && Math.hypot(g.v[0], g.v[1], g.v[2]) < GRENADE.restSpeed) {
      g.v[0] = g.v[1] = g.v[2] = 0;
      g.resting = true;
    }
  }
  return { bounces, expired: g.age >= GRENADE.fuseSeconds };
}

/** Blast damage at `distance` from the grenade (ADR-0034). */
export function grenadeDamage(distance: number): number {
  if (distance <= GRENADE.coreRadius) return GRENADE.damage;
  if (distance >= GRENADE.splashRadius) return 0;
  return Math.round(GRENADE.damage * (1 - (distance - GRENADE.coreRadius) / (GRENADE.splashRadius - GRENADE.coreRadius)));
}
