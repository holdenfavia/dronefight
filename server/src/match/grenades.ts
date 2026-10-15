import { launchers } from '../../../shared/loadout.js';
import type { Shot, Vec3 } from '../../../shared/protocol.js';
import { grenadeDamage, launchGrenade, stepGrenade, type GrenadeState } from '../../../shared/grenade.js';
import { cm, type MatchContext } from './context.js';
import { sampleHistory } from './history.js';
import { MISSILE_SEND_MS } from './missiles.js';
import type { Pilot } from './pilot.js';

/** Grenades in the air or on the ground (ADR-0034), simulated here, and when they were last stepped. */
export class Grenades {
  private list: { shooter: string; rid: number; g: GrenadeState; lastSent: number }[] = [];
  private clock = 0;

  constructor(private readonly ctx: MatchContext) {}

  clear(): void {
    this.list = [];
  }

  /** Forget a pilot's grenades (they left). */
  drop(shooter: string): void {
    this.list = this.list.filter((g) => g.shooter !== shooter);
  }

  /** Launch a validated grenade, thrown with the carrier's velocity: one out per launcher you carry. */
  launch(pilot: Pilot, shot: Shot, st: number): void {
    if (this.list.filter((g) => g.shooter === pilot.id).length >= launchers(pilot.loadout)) return;
    this.ctx.emit({ t: 'shot', id: pilot.id, s: shot }, { except: pilot.id });
    const carrier = pilot.history[pilot.history.length - 1]?.v ?? [0, 0, 0];
    if (this.list.length === 0) this.clock = st;
    this.list.push({ shooter: pilot.id, rid: shot.rid ?? 0, g: launchGrenade(shot.p, shot.d, [carrier[0], carrier[1], carrier[2]]), lastSent: 0 });
  }

  /** Set off a grenade where the server has it (the shooter pressed Fire again, ADR-0034). */
  detonate(id: string, rid: number, now: number): void {
    this.step(now);
    const x = this.list.find((g) => g.shooter === id && g.rid === rid);
    if (!x) return;
    this.list.splice(this.list.indexOf(x), 1);
    this.explode(x.shooter, x.rid, x.g.p, now);
  }

  /** Advance grenades to `now`: they bounce and roll; the fuse sets off any left too long. Positions go out ~20/s. */
  step(now: number): void {
    if (this.list.length === 0) {
      this.clock = now;
      return;
    }
    const dt = Math.min(0.25, Math.max(0, (now - this.clock) / 1000));
    this.clock = now;
    for (const x of [...this.list]) {
      if (stepGrenade(x.g, this.ctx.colliders, dt).expired) {
        this.list.splice(this.list.indexOf(x), 1);
        this.explode(x.shooter, x.rid, x.g.p, now);
      }
    }
    for (const x of this.list) {
      if (now - x.lastSent < MISSILE_SEND_MS) continue;
      x.lastSent = now;
      this.ctx.emit({ t: 'grenade', id: x.shooter, rid: x.rid, p: x.g.p.map(cm) as Vec3 });
    }
  }

  /** A grenade goes off: a big blast that hurts everyone nearby (the shooter too) and props (ADR-0034). */
  private explode(shooter: string, rid: number, at: Vec3, now: number): void {
    const p: Vec3 = [at[0], at[1], at[2]];
    this.ctx.emit({ t: 'boom', id: shooter, rid, p, kind: 'grenade' });
    this.ctx.props.splash(p, now, shooter, grenadeDamage);
    if (this.ctx.phase !== 'playing') return;
    for (const target of [...this.ctx.pilots.values()]) {
      if (!target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = grenadeDamage(Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]));
      if (damage > 0) this.ctx.hit(shooter, damage, target, now);
    }
  }
}
