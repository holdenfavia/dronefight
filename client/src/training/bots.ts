import { Vector3 } from 'three';
import { TRAINING_FIRING_LINE_Z, TRAINING_LANE_DISTANCES } from '../../../shared/maps/training';

/**
 * Practice bot behaviors for the Training map (ADR-0017). Pure motion logic, no rendering:
 * stationary (white), fixed path (blue), random (yellow), evasive (red).
 */

export type BotKind = 'stationary' | 'path' | 'random' | 'evasive';

export const BOT_COLORS: Record<BotKind, string> = {
  stationary: '#ffffff',
  path: '#4fc3ff',
  random: '#ffd84f',
  evasive: '#ff4f6d',
};

/** Where random and evasive bots roam (and are pulled back into). */
export const BOT_ZONE = { minX: -110, maxX: 110, minY: 6, maxY: 45, minZ: -130, maxZ: 40 } as const;

const EVASIVE = {
  cruise: 18,
  maxSpeed: 30,
  /** Sideways and vertical kick of a jink (m/s). */
  kick: 15,
  vertical: 7,
  /** Seconds between jinks: relaxed, and while being aimed at. */
  relaxed: [1.6, 3] as const,
  aimedAt: [0.5, 1.1] as const,
};

export interface PathSpec {
  shape: 'circle' | 'figure8' | 'line';
  center: Vector3;
  /** Radius / half-width (m). */
  size: number;
  /** Speed along the path (m/s). */
  speed: number;
}

export interface Bot {
  id: number;
  kind: BotKind;
  home: Vector3;
  pos: Vector3;
  vel: Vector3;
  path: PathSpec | null;
  waypoint: Vector3;
  /** Time (s) since this bot (re)spawned: drives path motion. */
  t: number;
  /** When the next evasive jink happens (s, bot time). */
  nextJink: number;
  rand: () => number;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function randomPoint(rand: () => number, out: Vector3): Vector3 {
  const z = BOT_ZONE;
  return out.set(
    z.minX + rand() * (z.maxX - z.minX),
    z.minY + rand() * (z.maxY - z.minY),
    z.minZ + rand() * (z.maxZ - z.minZ),
  );
}

let nextId = 1;

function makeBot(kind: BotKind, home: Vector3, path: PathSpec | null, seed: number): Bot {
  const rand = seeded(seed);
  const bot: Bot = {
    id: nextId++,
    kind,
    home: home.clone(),
    pos: home.clone(),
    vel: new Vector3(),
    path,
    waypoint: new Vector3(),
    t: 0,
    nextJink: 1,
    rand,
  };
  randomPoint(rand, bot.waypoint);
  return bot;
}

/** The standard training lineup. */
export function createTrainingBots(): Bot[] {
  const bots: Bot[] = [];
  // Stationary: one per lane distance, staggered left/right and higher the further out.
  TRAINING_LANE_DISTANCES.forEach((dist, i) => {
    const z = TRAINING_FIRING_LINE_Z - dist;
    bots.push(makeBot('stationary', new Vector3(i % 2 === 0 ? -12 : 12, 6 + i * 4, z), null, 100 + i));
  });
  // Fixed paths.
  bots.push(makeBot('path', new Vector3(-60, 18, -20), { shape: 'circle', center: new Vector3(-60, 18, -20), size: 25, speed: 15 }, 200));
  bots.push(makeBot('path', new Vector3(60, 24, -30), { shape: 'figure8', center: new Vector3(60, 24, -30), size: 32, speed: 17 }, 201));
  bots.push(makeBot('path', new Vector3(0, 12, -100), { shape: 'line', center: new Vector3(0, 12, -100), size: 50, speed: 18 }, 202));
  // Random and evasive, starting spread across the field.
  for (let i = 0; i < 3; i++) bots.push(makeBot('random', new Vector3(-70 + i * 70, 20, -50), null, 300 + i));
  for (let i = 0; i < 3; i++) bots.push(makeBot('evasive', new Vector3(-60 + i * 60, 28, -90), null, 400 + i));
  return bots;
}

/** Back to its home position and path start (after being shot down). */
export function resetBot(bot: Bot): void {
  bot.pos.copy(bot.home);
  bot.vel.set(0, 0, 0);
  bot.t = 0;
  bot.nextJink = 1;
  randomPoint(bot.rand, bot.waypoint);
}

const prev = new Vector3();
const desired = new Vector3();
const side = new Vector3();

/** Position on a fixed path at time t. */
export function pathPoint(path: PathSpec, t: number, out: Vector3): Vector3 {
  const c = path.center;
  if (path.shape === 'circle') {
    const w = path.speed / path.size;
    return out.set(c.x + path.size * Math.cos(w * t), c.y + 2 * Math.sin(2 * w * t), c.z + path.size * Math.sin(w * t));
  }
  if (path.shape === 'figure8') {
    // Lemniscate of Gerono; angular rate chosen so the average speed is about path.speed.
    const w = path.speed / (path.size * 1.2);
    return out.set(c.x + path.size * Math.sin(w * t), c.y + 3 * Math.sin(w * t), c.z + path.size * Math.sin(w * t) * Math.cos(w * t));
  }
  const w = path.speed / path.size;
  return out.set(c.x + path.size * Math.sin(w * t), c.y, c.z);
}

/**
 * Advance a bot by dt seconds. `aimedAt` is true while the player's crosshair is on it,
 * which makes evasive bots jink more often.
 */
export function stepBot(bot: Bot, dt: number, aimedAt: boolean): void {
  bot.t += dt;
  prev.copy(bot.pos);
  switch (bot.kind) {
    case 'stationary':
      bot.pos.copy(bot.home);
      bot.pos.y += 0.3 * Math.sin(bot.t * 1.3);
      break;
    case 'path':
      if (bot.path) pathPoint(bot.path, bot.t, bot.pos);
      break;
    case 'random':
    case 'evasive': {
      const cruise = bot.kind === 'evasive' ? EVASIVE.cruise : 14;
      if (bot.pos.distanceTo(bot.waypoint) < 8) randomPoint(bot.rand, bot.waypoint);
      desired.subVectors(bot.waypoint, bot.pos).normalize().multiplyScalar(cruise);
      // Smooth steering toward the waypoint.
      bot.vel.lerp(desired, 1 - Math.exp(-dt * 1.2));
      if (bot.kind === 'evasive' && bot.t >= bot.nextJink) {
        // Jink: a hard sideways kick and a vertical change, like a pilot breaking a lock.
        side.set(-bot.vel.z, 0, bot.vel.x).normalize();
        const dir = bot.rand() < 0.5 ? -1 : 1;
        bot.vel.addScaledVector(side, dir * EVASIVE.kick);
        bot.vel.y += (bot.rand() - 0.5) * 2 * EVASIVE.vertical;
        const [lo, hi] = aimedAt ? EVASIVE.aimedAt : EVASIVE.relaxed;
        bot.nextJink = bot.t + lo + bot.rand() * (hi - lo);
      }
      if (bot.vel.length() > EVASIVE.maxSpeed) bot.vel.setLength(EVASIVE.maxSpeed);
      bot.pos.addScaledVector(bot.vel, dt);
      // Stay inside the zone.
      const z = BOT_ZONE;
      bot.pos.set(
        Math.max(z.minX, Math.min(z.maxX, bot.pos.x)),
        Math.max(z.minY, Math.min(z.maxY, bot.pos.y)),
        Math.max(z.minZ, Math.min(z.maxZ, bot.pos.z)),
      );
      return;
    }
  }
  // Path and stationary bots: velocity from motion (for lead and orientation).
  if (dt > 0) bot.vel.subVectors(bot.pos, prev).divideScalar(dt);
}
