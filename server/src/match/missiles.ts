import { MISSILE, MISSILE_MAX_AGE, missileImpact, refillPod, splashDamage } from '../../../shared/missile.js';
import { missilePods } from '../../../shared/loadout.js';
import { NET, type Shot, type Vec3 } from '../../../shared/protocol.js';
import { cm, type MatchContext } from './context.js';
import { MAX_REWIND_MS, sampleHistory } from './history.js';
import { podSize, type Pilot } from './pilot.js';

/**
 * A piloted missile in flight (ADR-0025). The shooter's client flies it and reports its pose with each
 * state; the server checks every reported move (speed cap, lifetime) and decides impacts.
 */
interface Missile {
  shooter: string;
  rid: number;
  p: Vec3;
  v: Vec3;
  /** Server time it launched, and of its last accepted position. */
  born: number;
  updatedAt: number;
  lastSent: number;
}

/** How often missile positions go out to the other clients (ms). */
export const MISSILE_SEND_MS = 50;
/** Slack on the speed check: jitter in update timing, plus a few metres (ms are server receive times). */
const MISSILE_SPEED_SLACK = 1.3;
const MISSILE_MOVE_SLACK_M = 3;
/** Missile pod: accept a launch when the server's pod is within this of a full missile (clock skew). */
const POD_GRACE = 0.1;

export class Missiles {
  private list: Missile[] = [];

  constructor(private readonly ctx: MatchContext) {}

  clear(): void {
    this.list = [];
  }

  /** Forget a pilot's missile (they left). */
  drop(shooter: string): void {
    this.list = this.list.filter((m) => m.shooter !== shooter);
  }

  /**
   * Freestyle missile: must fly a Freestyle and have one in the pod. One in flight at a time: if the
   * server still has the old one (its end hasn't arrived yet), a new launch *replaces* it (it detonates
   * where it is) instead of being refused.
   */
  take(pilot: Pilot, now: number): boolean {
    if (missilePods(pilot.loadout) === 0) return false;
    const pod = refillPod(pilot.missiles, pilot.missilesAt, now, podSize(pilot.loadout));
    pilot.missiles = pod.ammo;
    pilot.missilesAt = pod.at;
    // A little grace: the client's pod mirror and ours tick on slightly different clocks.
    if (pilot.missiles < 1 - POD_GRACE) return false;
    pilot.missiles = Math.max(0, pilot.missiles - 1);
    // One in flight per pilot: the old one blows up. Take them out first, since a blast can end the match and clear the list.
    const old = this.list.filter((m) => m.shooter === pilot.id);
    if (old.length) this.list = this.list.filter((m) => m.shooter !== pilot.id);
    for (const m of old) this.explode(m.shooter, m.rid, [m.p[0], m.p[1], m.p[2]], now);
    return true;
  }

  /** An accepted launch (after `take`): relay it to everyone else and start tracking it. */
  launch(shooter: string, shot: Shot, st: number): void {
    this.ctx.emit({ t: 'shot', id: shooter, s: shot }, { except: shooter });
    const v: Vec3 = [shot.d[0] * MISSILE.launchSpeed, shot.d[1] * MISSILE.launchSpeed, shot.d[2] * MISSILE.launchSpeed];
    this.list.push({ shooter, rid: shot.rid ?? 0, p: [shot.p[0], shot.p[1], shot.p[2]], v, born: st, updatedAt: st, lastSent: 0 });
  }

  /**
   * The shooter reports where their missile is now (ADR-0025). Accept the move if it's physically
   * possible (clamp it if not), then check the path since the last report for geometry, pilots and props.
   */
  move(shooter: string, k: readonly number[], now: number): void {
    const x = this.list.find((m) => m.shooter === shooter && m.rid === k[0]);
    if (!x) return;
    const a = x.p;
    let b: Vec3 = [k[1]!, k[2]!, k[3]!];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const maxMove = (MISSILE.maxSpeed * MISSILE_SPEED_SLACK * Math.max(0, now - x.updatedAt)) / 1000 + MISSILE_MOVE_SLACK_M;
    if (dist > maxMove) {
      const f = maxMove / dist;
      b = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    const sp = Math.hypot(k[4]!, k[5]!, k[6]!);
    const vf = sp > MISSILE.maxSpeed ? MISSILE.maxSpeed / sp : 1;
    const v: Vec3 = [k[4]! * vf, k[5]! * vf, k[6]! * vf];
    const impact = this.impactAt(shooter, a, b, now);
    if (impact) {
      this.remove(x);
      this.explode(x.shooter, x.rid, impact, now);
      return;
    }
    x.p = b;
    x.v = v;
    x.updatedAt = now;
  }

  /** Where along a -> b the missile hits geometry or trips its fuse (pilots as the shooter saw them, props), or null. */
  private impactAt(shooter: string, a: Vec3, b: Vec3, now: number): Vec3 | null {
    const seen = Math.max(now - NET.interpDelayMs, now - MAX_REWIND_MS);
    const targets: Vec3[] = [];
    for (const target of this.ctx.pilots.values()) {
      // Enemies only: never the shooter, never the dead or spawn-protected.
      if (target.id === shooter || !target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, seen);
      if (pos) targets.push(pos);
    }
    // The fuse also reacts to cars, barrels and tanks (ADR-0023).
    targets.push(...this.ctx.props.centers(now));
    const f = missileImpact(a, b, this.ctx.colliders, targets);
    return f === null ? null : [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  /** The shooter blew up their missile (or their client saw it hit something). Trust the point if it's plausible. */
  detonate(id: string, rid: number, p: Vec3, now: number): void {
    const x = this.list.find((m) => m.shooter === id && m.rid === rid);
    if (!x) return;
    const reach = (MISSILE.maxSpeed * MISSILE_SPEED_SLACK * Math.max(0, now - x.updatedAt)) / 1000 + MISSILE_MOVE_SLACK_M;
    const near = Math.hypot(p[0] - x.p[0], p[1] - x.p[1], p[2] - x.p[2]) <= reach;
    // Check the last stretch too, so a detonation can't skip past a wall or a target.
    const at = (near && this.impactAt(id, x.p, p, now)) || (near ? p : x.p);
    this.remove(x);
    this.explode(x.shooter, x.rid, [at[0], at[1], at[2]], now);
  }

  private remove(x: Missile): void {
    const i = this.list.indexOf(x);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** End missiles that went quiet or outlived their fuel (ADR-0025), and relay positions to everyone else. */
  step(now: number): void {
    for (const x of [...this.list]) {
      const shooter = this.ctx.pilots.get(x.shooter);
      const expired = now - x.born > MISSILE_MAX_AGE * 1000 + MISSILE.staleMs;
      const stale = now - x.updatedAt > MISSILE.staleMs;
      // The pilot flying it died, or switched off the Freestyle: it blows where it is.
      const orphaned = !shooter || !shooter.alive || missilePods(shooter.loadout) === 0;
      if (expired || stale || orphaned) {
        this.remove(x);
        this.explode(x.shooter, x.rid, x.p, now);
      }
    }
    for (const x of this.list) {
      if (now - x.lastSent < MISSILE_SEND_MS) continue;
      x.lastSent = now;
      this.ctx.emit({ t: 'missile', id: x.shooter, rid: x.rid, p: x.p.map(cm) as Vec3, v: x.v.map(cm) as Vec3 }, { except: x.shooter });
    }
  }

  /** Missile detonation (ADR-0016): splash everyone nearby (not the shooter), and tell every client where. */
  private explode(shooter: string, rid: number, at: Vec3, now: number): void {
    this.ctx.emit({ t: 'boom', id: shooter, rid, p: at });
    // Props take the blast in any phase (ADR-0023); they go off on the next tick.
    this.ctx.props.splash(at, now, shooter, splashDamage);
    // Outside a running match missiles still fly and explode, but don't hurt pilots.
    if (this.ctx.phase !== 'playing') return;
    for (const target of this.ctx.pilots.values()) {
      if (target.id === shooter || !target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = splashDamage(Math.hypot(pos[0] - at[0], pos[1] - at[1], pos[2] - at[2]));
      if (damage > 0) this.ctx.hit(shooter, damage, target, now);
    }
  }
}
