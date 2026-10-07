// Destructible props (ADR-0023): every moving prop plus each map's explosives. Rounds and missiles damage
// them; at 0 HP they explode (hurting nearby props and, in a match, pilots) and come back 30 s later.
// The server runs this in rooms; the client runs the same code in solo.

import { moverPose, type MoverDef, type MoverKind, type V3 } from './maps/movers.js';
import type { ArenaBox, ExplosiveDef, ExplosiveKind, MapDef } from './maps/types.js';

export type PropKind = MoverKind | ExplosiveKind;

export interface PropStats {
  hp: number;
  /** Blast radius (m) and damage at the center, falling linearly to 0 at the radius. 0 = harmless. */
  blastRadius: number;
  blastDamage: number;
  effect: 'fire' | 'water';
}

/** Freestyle rounds do 20, wing cannon 5, a shotgun pellet 8; a missile within 3 m destroys anything. */
export const PROP_STATS: Record<PropKind, PropStats> = {
  car: { hp: 120, blastRadius: 7, blastDamage: 50, effect: 'fire' },
  tractor: { hp: 200, blastRadius: 8, blastDamage: 50, effect: 'fire' },
  trailer: { hp: 80, blastRadius: 6, blastDamage: 35, effect: 'fire' },
  coasterCar: { hp: 60, blastRadius: 6, blastDamage: 35, effect: 'fire' },
  // The Downtown airliner (ADR-0054): tough, and a big fireball.
  plane: { hp: 600, blastRadius: 16, blastDamage: 60, effect: 'fire' },
  fuel: { hp: 25, blastRadius: 7, blastDamage: 50, effect: 'fire' },
  propane: { hp: 50, blastRadius: 9, blastDamage: 60, effect: 'fire' },
  water: { hp: 60, blastRadius: 0, blastDamage: 0, effect: 'water' },
};

export const PROPS = {
  /** A destroyed prop comes back after this long (ms). */
  respawnMs: 30_000,
  /** Delay before a prop caught in another's blast goes off (ms): chains pop in sequence. */
  chainDelayMs: 150,
} as const;

export interface PropRef {
  kind: PropKind;
  /** Exactly one of these is set. */
  mover: MoverDef | null;
  explosive: ExplosiveDef | null;
  /** Width, height, length (m). */
  size: V3;
}

/** A map's destructible props: movers first (in map order), then explosives. Indices are shared on the wire. */
export function mapProps(map: MapDef): PropRef[] {
  return [
    ...(map.movers ?? []).map((m) => ({ kind: m.kind, mover: m, explosive: null, size: m.size })),
    ...(map.explosives ?? []).map((e) => ({ kind: e.kind, mover: null, explosive: e, size: e.size })),
  ];
}

/** A map's explosives as plain boxes (for clearance tests). */
export function explosiveBoxes(map: MapDef): ArenaBox[] {
  return (map.explosives ?? []).map((e) => ({ pos: e.pos, size: e.size, rot: [0, e.yawDeg ?? 0, 0], mat: 'steel' }));
}

/** Damage a blast of `kind` does at `distance` metres. */
export function blastDamage(kind: PropKind, distance: number): number {
  const s = PROP_STATS[kind];
  if (s.blastRadius <= 0 || distance >= s.blastRadius) return 0;
  return Math.round(s.blastDamage * (1 - distance / s.blastRadius));
}

export interface Blast {
  i: number;
  kind: PropKind;
  p: V3;
  /** Who set it off (the start of a chain counts for the whole chain). */
  by: string | null;
}

interface Pose {
  c: V3;
  /** Local axes: right (width), up (height), forward (length). */
  r: V3;
  u: V3;
  f: V3;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

export class PropField {
  readonly props: PropRef[];
  private readonly hp: number[];
  /** Time (ms) a destroyed prop comes back; 0 = standing. */
  private readonly downUntil: number[];
  /** Explosions waiting to go off (chains), at time `at` (ms). */
  private pending: { i: number; at: number; by: string | null }[] = [];
  private readonly pose: Pose = { c: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], f: [0, 0, 0] };
  private readonly dir: V3 = [0, 0, 0];

  constructor(map: MapDef) {
    this.props = mapProps(map);
    this.hp = this.props.map((p) => PROP_STATS[p.kind].hp);
    this.downUntil = this.props.map(() => 0);
  }

  isDown(i: number): boolean {
    return (this.downUntil[i] ?? 0) > 0;
  }

  /** Indices of destroyed props (sent to clients in the match state). */
  downList(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.downUntil.length; i++) if (this.downUntil[i]! > 0) out.push(i);
    return out;
  }

  /** Clients in a room mirror the server: exactly these props are down. */
  syncDown(list: readonly number[], now: number): void {
    const down = new Set(list);
    for (let i = 0; i < this.props.length; i++) {
      if (down.has(i)) {
        if (this.downUntil[i] === 0) this.downUntil[i] = now + PROPS.respawnMs;
      } else {
        this.downUntil[i] = 0;
        this.hp[i] = PROP_STATS[this.props[i]!.kind].hp;
      }
    }
    this.pending = [];
  }

  /** Everything standing at full health. */
  reset(): void {
    this.syncDown([], 0);
  }

  /** Prop i's center at time t (ms) into `out`. */
  center(i: number, t: number, out: V3): V3 {
    const p = this.poseAt(i, t);
    out[0] = p.c[0];
    out[1] = p.c[1];
    out[2] = p.c[2];
    return out;
  }

  /**
   * First standing prop a round hits before `maxDist` (the wall), or null. Fired at shared time `ts` (ms)
   * at `speed` m/s: moving props are tested where they are when the round gets there.
   */
  bulletHit(o: V3, d: V3, maxDist: number, ts: number, speed: number): { i: number; dist: number } | null {
    let best: { i: number; dist: number } | null = null;
    for (let i = 0; i < this.props.length; i++) {
      if (this.isDown(i)) continue;
      const prop = this.props[i]!;
      const limit = best ? best.dist : maxDist;
      let pose = this.poseAt(i, ts);
      // Moving props: first guess the arrival time from the distance to the center, then refine once.
      if (prop.mover) {
        const toC = Math.hypot(pose.c[0] - o[0], pose.c[1] - o[1], pose.c[2] - o[2]);
        if (toC - 30 > limit) continue;
        pose = this.poseAt(i, ts + (toC / speed) * 1000);
      }
      let hit = rayBox(o, d, limit, pose, prop.size);
      if (hit !== null && prop.mover) {
        pose = this.poseAt(i, ts + (hit / speed) * 1000);
        hit = rayBox(o, d, limit, pose, prop.size);
      }
      if (hit !== null) best = { i, dist: hit };
    }
    return best;
  }

  /** Standing props near a point (for a missile's proximity fuse): their centers at time t (ms). */
  centers(t: number): V3[] {
    const out: V3[] = [];
    for (let i = 0; i < this.props.length; i++) if (!this.isDown(i)) out.push(this.center(i, t, [0, 0, 0]));
    return out;
  }

  /** Damage prop i. At 0 HP it explodes after `delay` ms (0 = on the next tick). */
  damage(i: number, amount: number, now: number, by: string | null, delay = 0): void {
    if (this.isDown(i) || amount <= 0) return;
    const before = this.hp[i]!;
    if (before <= 0) return; // already going off
    this.hp[i] = before - amount;
    if (this.hp[i]! <= 0) this.pending.push({ i, at: now + delay, by });
  }

  /** A blast at `at` (missile or prop): each standing prop takes `damageAt(distance to its box)`. */
  splash(at: V3, now: number, by: string | null, damageAt: (distance: number) => number, delay = 0, except = -1): void {
    for (let i = 0; i < this.props.length; i++) {
      if (i === except || this.isDown(i)) continue;
      const dmg = damageAt(boxDistance(at, this.poseAt(i, now), this.props[i]!.size));
      if (dmg > 0) this.damage(i, dmg, now, by, delay);
    }
  }

  /** Advance to `now` (ms): set off due explosions (and their chains), bring back props whose time is up. */
  tick(now: number): { blasts: Blast[]; respawned: number[] } {
    const blasts: Blast[] = [];
    const respawned: number[] = [];
    for (let i = 0; i < this.props.length; i++) {
      if (this.downUntil[i]! > 0 && now >= this.downUntil[i]!) {
        this.downUntil[i] = 0;
        this.hp[i] = PROP_STATS[this.props[i]!.kind].hp;
        respawned.push(i);
      }
    }
    // Chains add to `pending` while we go, so loop until nothing more is due now.
    for (let guard = 0; guard < 100; guard++) {
      const due = this.pending.filter((x) => x.at <= now);
      if (due.length === 0) break;
      this.pending = this.pending.filter((x) => x.at > now);
      for (const x of due) {
        if (this.isDown(x.i)) continue;
        this.downUntil[x.i] = now + PROPS.respawnMs;
        const kind = this.props[x.i]!.kind;
        const p = this.center(x.i, now, [0, 0, 0]);
        blasts.push({ i: x.i, kind, p, by: x.by });
        this.splash(p, now, x.by, (dist) => blastDamage(kind, dist), PROPS.chainDelayMs, x.i);
      }
    }
    return { blasts, respawned };
  }

  private poseAt(i: number, t: number): Pose {
    const prop = this.props[i]!;
    const pose = this.pose;
    if (prop.mover) {
      moverPose(prop.mover, t / 1000, pose.c, this.dir);
      const len = Math.hypot(this.dir[0], this.dir[1], this.dir[2]) || 1;
      pose.f[0] = this.dir[0] / len;
      pose.f[1] = this.dir[1] / len;
      pose.f[2] = this.dir[2] / len;
      // right = up x forward, then up = forward x right.
      const rl = Math.hypot(pose.f[2], pose.f[0]) || 1;
      pose.r[0] = pose.f[2] / rl;
      pose.r[1] = 0;
      pose.r[2] = -pose.f[0] / rl;
      pose.u[0] = pose.f[1] * pose.r[2] - pose.f[2] * pose.r[1];
      pose.u[1] = pose.f[2] * pose.r[0] - pose.f[0] * pose.r[2];
      pose.u[2] = pose.f[0] * pose.r[1] - pose.f[1] * pose.r[0];
    } else {
      const e = prop.explosive!;
      const yaw = ((e.yawDeg ?? 0) * Math.PI) / 180;
      pose.c[0] = e.pos[0];
      pose.c[1] = e.pos[1];
      pose.c[2] = e.pos[2];
      // Same convention as a box rotated by yaw about Y (three.js / eulerXYZMatrix).
      pose.r[0] = Math.cos(yaw);
      pose.r[1] = 0;
      pose.r[2] = -Math.sin(yaw);
      pose.u[0] = 0;
      pose.u[1] = 1;
      pose.u[2] = 0;
      pose.f[0] = Math.sin(yaw);
      pose.f[1] = 0;
      pose.f[2] = Math.cos(yaw);
    }
    return pose;
  }
}

/** Distance along the ray to an oriented box, or null if it misses within maxDist (0 if starting inside). */
export function rayBox(o: V3, d: V3, maxDist: number, pose: Pose, size: V3): number | null {
  const rel = [o[0] - pose.c[0], o[1] - pose.c[1], o[2] - pose.c[2]];
  const axes = [pose.r, pose.u, pose.f];
  let tMin = 0;
  let tMax = maxDist;
  for (let k = 0; k < 3; k++) {
    const half = size[k]! / 2;
    const oo = dot(rel, axes[k]!);
    const dd = dot(d, axes[k]!);
    if (Math.abs(dd) < 1e-9) {
      if (Math.abs(oo) > half) return null;
      continue;
    }
    let t1 = (-half - oo) / dd;
    let t2 = (half - oo) / dd;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Distance from a point to an oriented box's surface (0 inside). */
function boxDistance(p: V3, pose: Pose, size: V3): number {
  const rel = [p[0] - pose.c[0], p[1] - pose.c[1], p[2] - pose.c[2]];
  let sq = 0;
  const axes = [pose.r, pose.u, pose.f];
  for (let k = 0; k < 3; k++) {
    const out = Math.abs(dot(rel, axes[k]!)) - size[k]! / 2;
    if (out > 0) sq += out * out;
  }
  return Math.sqrt(sq);
}
