// Practice bots (ADR-0017, ADR-0067): pure motion, shared so the room server flies them as pilots in a match.
// Stationary (white), fixed path (blue), random (yellow), evasive (red).

import { TRAINING_FIRING_LINE_Z, TRAINING_LANE_DISTANCES } from './maps/training.js';
import { terrainHeight, type MapDef } from './maps/index.js';
import type { Vec3 } from './protocol.js';

export type BotKind = 'stationary' | 'path' | 'random' | 'evasive';

export const BOT_KINDS: readonly BotKind[] = ['stationary', 'path', 'random', 'evasive'];

export const BOT_COLORS: Record<BotKind, string> = {
  stationary: '#ffffff',
  path: '#4fc3ff',
  random: '#ffd84f',
  evasive: '#ff4f6d',
};

/** Where random and evasive bots roam (and are pulled back into). */
export interface BotZone {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** The Training range's roaming zone. */
export const TRAINING_ZONE: BotZone = { minX: -110, maxX: 110, minY: 6, maxY: 45, minZ: -130, maxZ: 40 };

/** Bots on other maps roam the middle of the map, this high above the spawns (m), so they stay out of the streets. */
const MAP_ZONE = { share: 0.5, above: [18, 55] as const };

const RANDOM_CRUISE = 14;
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
  center: Vec3;
  /** Radius / half-width (m). */
  size: number;
  /** Speed along the path (m/s). */
  speed: number;
}

export interface Bot {
  kind: BotKind;
  home: Vec3;
  pos: Vec3;
  vel: Vec3;
  path: PathSpec | null;
  zone: BotZone;
  waypoint: Vec3;
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

function randomPoint(rand: () => number, z: BotZone, out: Vec3): Vec3 {
  out[0] = z.minX + rand() * (z.maxX - z.minX);
  out[1] = z.minY + rand() * (z.maxY - z.minY);
  out[2] = z.minZ + rand() * (z.maxZ - z.minZ);
  return out;
}

export function makeBot(kind: BotKind, home: Vec3, path: PathSpec | null, seed: number, zone: BotZone = TRAINING_ZONE): Bot {
  const rand = seeded(seed);
  const bot: Bot = { kind, home: [...home], pos: [...home], vel: [0, 0, 0], path, zone, waypoint: [0, 0, 0], t: 0, nextJink: 1, rand };
  randomPoint(rand, zone, bot.waypoint);
  return bot;
}

/**
 * The Training lineup, most useful first (a room holds 10 pilots, so the lineup is cut to fit): a stationary bot
 * at each lane distance, then paths, random and evasive bots across the field.
 */
export function trainingBots(): Bot[] {
  const at = (i: number): Vec3 => [i % 2 === 0 ? -12 : 12, 6 + i * 4, TRAINING_FIRING_LINE_Z - TRAINING_LANE_DISTANCES[i]!];
  return [
    makeBot('stationary', at(0), null, 100),
    makeBot('path', [-60, 18, -20], { shape: 'circle', center: [-60, 18, -20], size: 25, speed: 15 }, 200),
    makeBot('random', [-70, 20, -50], null, 300),
    makeBot('evasive', [0, 28, -90], null, 400),
    makeBot('stationary', at(1), null, 101),
    makeBot('path', [60, 24, -30], { shape: 'figure8', center: [60, 24, -30], size: 32, speed: 17 }, 201),
    makeBot('evasive', [60, 28, -90], null, 401),
    makeBot('stationary', at(2), null, 102),
    makeBot('random', [70, 20, -50], null, 301),
    makeBot('stationary', at(3), null, 103),
    makeBot('path', [0, 12, -100], { shape: 'line', center: [0, 12, -100], size: 50, speed: 18 }, 202),
    makeBot('evasive', [-60, 28, -90], null, 402),
    makeBot('random', [0, 20, -50], null, 302),
  ];
}

/** A bot a host adds on any map (ADR-0067): it roams the middle of the map, evasive or random by turn. */
export function roamingBot(map: MapDef, n: number): Bot {
  const h = map.halfSize * MAP_ZONE.share;
  const spawnY = Math.min(...map.spawns.map((s) => s.pos[1]));
  const ground = Math.max(spawnY, terrainHeight(map.terrain, 0, 0));
  const zone: BotZone = { minX: -h, maxX: h, minY: ground + MAP_ZONE.above[0], maxY: ground + MAP_ZONE.above[1], minZ: -h, maxZ: h };
  const kind: BotKind = n % 2 === 0 ? 'evasive' : 'random';
  const home = randomPoint(seeded(500 + n), zone, [0, 0, 0]);
  return makeBot(kind, home, null, 600 + n, zone);
}

/** Back to its home position and path start (after being shot down). */
export function resetBot(bot: Bot): void {
  bot.pos = [...bot.home];
  bot.vel = [0, 0, 0];
  bot.t = 0;
  bot.nextJink = 1;
  randomPoint(bot.rand, bot.zone, bot.waypoint);
}

/** Position on a fixed path at time t. */
export function pathPoint(path: PathSpec, t: number, out: Vec3): Vec3 {
  const [cx, cy, cz] = path.center;
  if (path.shape === 'circle') {
    const w = path.speed / path.size;
    out[0] = cx + path.size * Math.cos(w * t);
    out[1] = cy + 2 * Math.sin(2 * w * t);
    out[2] = cz + path.size * Math.sin(w * t);
  } else if (path.shape === 'figure8') {
    // Lemniscate of Gerono; angular rate chosen so the average speed is about path.speed.
    const w = path.speed / (path.size * 1.2);
    out[0] = cx + path.size * Math.sin(w * t);
    out[1] = cy + 3 * Math.sin(w * t);
    out[2] = cz + path.size * Math.sin(w * t) * Math.cos(w * t);
  } else {
    const w = path.speed / path.size;
    out[0] = cx + path.size * Math.sin(w * t);
    out[1] = cy;
    out[2] = cz;
  }
  return out;
}

/**
 * Advance a bot by dt seconds. `aimedAt` is true while a pilot's crosshair is on it, which makes evasive bots
 * jink more often.
 */
export function stepBot(bot: Bot, dt: number, aimedAt: boolean): void {
  bot.t += dt;
  const [px, py, pz] = bot.pos;
  switch (bot.kind) {
    case 'stationary':
      bot.pos = [bot.home[0], bot.home[1] + 0.3 * Math.sin(bot.t * 1.3), bot.home[2]];
      break;
    case 'path':
      if (bot.path) pathPoint(bot.path, bot.t, bot.pos);
      break;
    case 'random':
    case 'evasive': {
      const cruise = bot.kind === 'evasive' ? EVASIVE.cruise : RANDOM_CRUISE;
      const p = bot.pos;
      const v = bot.vel;
      const w = bot.waypoint;
      const toW = Math.hypot(w[0] - p[0], w[1] - p[1], w[2] - p[2]);
      if (toW < 8) randomPoint(bot.rand, bot.zone, w);
      const d = Math.max(1e-6, Math.hypot(w[0] - p[0], w[1] - p[1], w[2] - p[2]));
      // Smooth steering toward the waypoint.
      const k = 1 - Math.exp(-dt * 1.2);
      for (let i = 0; i < 3; i++) v[i]! += (((w[i]! - p[i]!) / d) * cruise - v[i]!) * k;
      if (bot.kind === 'evasive' && bot.t >= bot.nextJink) {
        // Jink: a hard sideways kick and a vertical change, like a pilot breaking a lock.
        const sl = Math.max(1e-6, Math.hypot(v[0], v[2]));
        const dir = bot.rand() < 0.5 ? -1 : 1;
        const sx = -v[2] / sl;
        const sz = v[0] / sl;
        v[0] += sx * dir * EVASIVE.kick;
        v[2] += sz * dir * EVASIVE.kick;
        v[1] += (bot.rand() - 0.5) * 2 * EVASIVE.vertical;
        const [lo, hi] = aimedAt ? EVASIVE.aimedAt : EVASIVE.relaxed;
        bot.nextJink = bot.t + lo + bot.rand() * (hi - lo);
      }
      const speed = Math.hypot(v[0], v[1], v[2]);
      if (speed > EVASIVE.maxSpeed) for (let i = 0; i < 3; i++) v[i]! *= EVASIVE.maxSpeed / speed;
      // Stay inside the zone.
      const z = bot.zone;
      p[0] = Math.max(z.minX, Math.min(z.maxX, p[0] + v[0] * dt));
      p[1] = Math.max(z.minY, Math.min(z.maxY, p[1] + v[1] * dt));
      p[2] = Math.max(z.minZ, Math.min(z.maxZ, p[2] + v[2] * dt));
      return;
    }
  }
  // Path and stationary bots: velocity from motion (for lead and orientation).
  if (dt > 0) bot.vel = [(bot.pos[0] - px) / dt, (bot.pos[1] - py) / dt, (bot.pos[2] - pz) / dt];
}

/** A bot's attitude as a quaternion [x, y, z, w]: pointed along its velocity, tipped forward with speed like a quad. */
export function botAttitude(vel: Vec3, last: readonly number[]): [number, number, number, number] {
  const speed = Math.hypot(vel[0], vel[2]);
  if (speed < 0.5) return [last[0]!, last[1]!, last[2]!, last[3]!];
  const yaw = Math.atan2(-vel[0], -vel[2]);
  const pitch = -Math.min(0.6, speed / 40);
  // q = qYaw(Y) * qPitch(X)
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}
