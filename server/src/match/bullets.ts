import { droneClass } from '../../../shared/drones.js';
import { WEAPONS } from '../../../shared/weapons.js';
import { NET, type Shot, type Vec3 } from '../../../shared/protocol.js';
import { raycastArena, segmentPointDistance } from '../../../shared/raycast.js';
import type { MatchContext } from './context.js';
import { MAX_REWIND_MS, sampleHistory } from './history.js';

/**
 * Rounds in flight (ADR-0009), with limited lag compensation (ADR-0004): each is tested against the targets
 * where the shooter saw them, rewinding at most MAX_REWIND_MS.
 */

/** Bullet simulation step. 350 m/s * 2 ms = 0.7 m, well under the hit sphere diameter. */
const SUBSTEP_MS = 2;

interface Bullet {
  shooter: string;
  /** Shooter's class stats at the moment of firing. */
  speed: number;
  damage: number;
  p: Vec3;
  d: Vec3;
  /** Distance to the first wall along the path (or max range). */
  maxDist: number;
  /** Server time on the target's timeline that matches the moment of firing. */
  t0: number;
  traveled: number;
  /** The prop this round hits at maxDist, if it gets that far (ADR-0023). */
  prop: number | null;
}

export class Bullets {
  private list: Bullet[] = [];

  constructor(private readonly ctx: MatchContext) {}

  clear(): void {
    this.list = [];
  }

  /** Forget a pilot's rounds (they left). */
  drop(shooter: string): void {
    this.list = this.list.filter((b) => b.shooter !== shooter);
  }

  /** A validated round from `shooter`: find what it can reach, then fly it as far as the timeline allows. */
  fire(shooter: string, shot: Shot, st: number): void {
    const gun = WEAPONS[shot.w];
    const [px, py, pz] = shot.p;
    const [dx, dy, dz] = shot.d;
    const wall = raycastArena(this.ctx.colliders, px, py, pz, dx, dy, dz, gun.range);
    const seen = shot.ts - NET.interpDelayMs;
    const t0 = Math.min(st, Math.max(seen, st - MAX_REWIND_MS));
    // Props move on the shared clock, which the shooter sees live: test them at the claimed fire time.
    const fired = Math.min(st, Math.max(shot.ts, st - MAX_REWIND_MS));
    const prop = this.ctx.props.bulletHit(shot.p, shot.d, wall, fired, gun.speed);
    this.list.push({
      shooter,
      speed: gun.speed,
      damage: gun.damage,
      p: shot.p,
      d: shot.d,
      maxDist: prop ? prop.dist : wall,
      t0,
      traveled: 0,
      prop: prop ? prop.i : null,
    });
    this.step(st);
  }

  /** Advance rounds as far as target history allows (the target timeline can't run past `now`). */
  step(now: number): void {
    if (this.list.length === 0) return;
    const remaining: Bullet[] = [];

    for (const b of this.list) {
      const stepDist = (b.speed * SUBSTEP_MS) / 1000;
      const msPerMeter = 1000 / b.speed;
      let done = false;
      while (!done && b.traveled < b.maxDist) {
        const next = Math.min(b.traveled + stepDist, b.maxDist);
        const targetTime = b.t0 + ((b.traveled + next) / 2) * msPerMeter;
        if (targetTime > now) break;

        const ax = b.p[0] + b.d[0] * b.traveled;
        const ay = b.p[1] + b.d[1] * b.traveled;
        const az = b.p[2] + b.d[2] * b.traveled;
        const bx = b.p[0] + b.d[0] * next;
        const by = b.p[1] + b.d[1] * next;
        const bz = b.p[2] + b.d[2] * next;

        for (const target of this.ctx.pilots.values()) {
          if (this.ctx.phase !== 'playing') break;
          if (target.id === b.shooter || !target.alive || target.protectedUntil > now) continue;
          const pos = sampleHistory(target.history, targetTime);
          if (!pos) continue;
          const miss = segmentPointDistance(ax, ay, az, bx, by, bz, pos[0], pos[1], pos[2]);
          if (miss <= droneClass(target.loadout.body).hitRadius) {
            this.ctx.hit(b.shooter, b.damage, target, now);
            done = true;
            break;
          }
        }
        b.traveled = next;
      }
      if (!done && b.traveled >= b.maxDist && b.prop !== null) this.ctx.props.damage(b.prop, b.damage, now, b.shooter);
      else if (!done && b.traveled < b.maxDist) remaining.push(b);
    }
    this.list = remaining;
  }
}
