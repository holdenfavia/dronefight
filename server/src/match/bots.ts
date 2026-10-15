import type { MapDef } from '../../../shared/maps/index.js';
import { NET, type DroneState, type Quat, type Vec3 } from '../../../shared/protocol.js';
import { botAttitude, roamingBot, stepBot, trainingBots, type Bot } from '../../../shared/bots.js';
import { cm, type Emit } from './context.js';
import { pushHistory } from './history.js';
import type { Pilot } from './pilot.js';

/** Practice bots (ADR-0067): how often their positions go out (ms), and how close to someone's crosshair counts as aimed at. */
const BOT_SEND_MS = 1000 / NET.sendHz;
const BOT_AIMED_COS = Math.cos((5 * Math.PI) / 180);
/** Bots show this much motor in their snapshots (for their sound and props). */
const BOT_MOTOR = 0.4;

/** The bot to add as the room's `n`th: the Training lineup first, then roaming bots that fit the map. */
export function nextBot(map: MapDef, training: boolean, n: number): Bot {
  return training ? (trainingBots()[n] ?? roamingBot(map, n)) : roamingBot(map, n);
}

/** Practice bots (ADR-0067) are pilots the server flies: numbering, when they were last stepped and last sent. */
export class BotPilots {
  private count = 0;
  private clock = 0;
  private sent = 0;

  /** A fresh pilot id for the next bot. */
  nextId(): string {
    return `bot${++this.count}`;
  }

  /** Fly the bots and send where they are, like anyone's snapshots (Hard rule 1). */
  step(pilots: ReadonlyMap<string, Pilot>, emit: Emit, now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.clock) / 1000));
    this.clock = now;
    const send = now - this.sent >= BOT_SEND_MS;
    if (send) this.sent = now;
    for (const p of pilots.values()) {
      const bot = p.bot;
      if (!bot || !p.alive) continue;
      stepBot(bot, dt, aimedAt(pilots, bot.pos));
      pushHistory(p.history, { st: now, p: [...bot.pos], v: [...bot.vel] });
      p.q = botAttitude(bot.vel, p.q);
      if (!send) continue;
      const s: DroneState = { ts: now, p: bot.pos.map(cm) as Vec3, q: p.q as Quat, v: bot.vel.map(cm) as Vec3, m: BOT_MOTOR, armed: true, crashed: false };
      emit({ t: 'snap', id: p.id, st: now, s });
    }
  }
}

/** Someone's crosshair is on this spot: evasive bots jink harder. */
function aimedAt(pilots: ReadonlyMap<string, Pilot>, at: Vec3): boolean {
  for (const p of pilots.values()) {
    if (p.bot || !p.alive) continue;
    const last = p.history[p.history.length - 1];
    if (!last) continue;
    const [x, y, z, w] = p.q as [number, number, number, number];
    // The nose (-Z) rotated by q.
    const fx = -(2 * (x * z + w * y));
    const fy = -(2 * (y * z - w * x));
    const fz = -(1 - 2 * (x * x + y * y));
    const dx = at[0] - last.p[0];
    const dy = at[1] - last.p[1];
    const dz = at[2] - last.p[2];
    const d = Math.hypot(dx, dy, dz);
    if (d > 0 && (fx * dx + fy * dy + fz * dz) / d > BOT_AIMED_COS) return true;
  }
  return false;
}
