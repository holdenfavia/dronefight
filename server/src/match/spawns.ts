import { pickSpawn, type MapDef } from '../../../shared/maps/index.js';
import { droneClass } from '../../../shared/drones.js';
import { COMBAT } from '../../../shared/combat.js';
import type { Vec3 } from '../../../shared/protocol.js';
import { resetBot } from '../../../shared/bots.js';
import { applyPending, type Pilot } from './pilot.js';

/** Spawn offsets: a pilot already within `SPAWN_TAKEN_M` of a spawn means the next goes beside it, on rings this far apart. */
const SPAWN_TAKEN_M = 3;
const SPAWN_RING_M = 4;

/** A spawn chosen for a pilot: its index on the map, and the offset beside it (x, z). */
export interface SpawnPick {
  spawn: number;
  o: [number, number];
}

/** Bots come back where they started, shootable at once (ADR-0067). */
export function respawnBot(pilot: Pilot & { bot: NonNullable<Pilot['bot']> }, now: number): void {
  resetBot(pilot.bot);
  pilot.history = [{ st: now, p: [...pilot.bot.pos], v: [0, 0, 0] }];
  applyPending(pilot);
  pilot.alive = true;
  pilot.hp = droneClass(pilot.loadout.body).maxHp;
  pilot.respawnAt = null;
  pilot.protectedUntil = 0;
  pilot.lastDamagedBy = null;
  pilot.damagedBy.clear();
}

/** Anti spawn-camping (ADR-0012): random spawn away from every living opponent, then a free spot beside it. */
export function chooseSpawn(map: MapDef, pilots: ReadonlyMap<string, Pilot>, pilot: Pilot, isTeammate: (p: Pilot) => boolean, random: () => number): SpawnPick {
  const opponents = [...pilots.values()]
    .filter((p) => p !== pilot && p.alive && !isTeammate(p))
    .map((p) => p.history[p.history.length - 1]?.p ?? map.spawns[p.lastSpawn ?? 0]?.pos)
    .filter((p): p is Vec3 => !!p);
  const spawn = pickSpawn(map.spawns, opponents, pilot.lastSpawn, random);
  const o = spawnOffset(pilots, pilot, map.spawns[spawn]!.pos);
  return { spawn, o };
}

/** Put a person on their spawn (ADR-0012): new build, full health, spawn-protected, no one to credit yet. */
export function placeAtSpawn(map: MapDef, pilot: Pilot, { spawn, o }: SpawnPick, now: number): void {
  pilot.lastSpawn = spawn;
  const base = map.spawns[spawn]!.pos;
  // Until the next state arrives, the pilot is at the spawn: later spawns must avoid it too.
  pilot.history = [{ st: now, p: [base[0] + o[0], base[1], base[2] + o[1]], v: [0, 0, 0] }];
  applyPending(pilot);
  pilot.shieldUntil = 0;
  pilot.shieldHp = 0;
  pilot.alive = true;
  pilot.hp = droneClass(pilot.loadout.body).maxHp;
  pilot.respawnAt = null;
  pilot.protectedUntil = now + COMBAT.spawnProtectionMs;
  pilot.lastDamagedBy = null;
  pilot.damagedBy.clear();
}

/**
 * With more pilots than spawns (ADR-0026), a spawn can already have someone on it: place this pilot
 * beside it on the first free spot of rings around it, never on top of another pilot.
 */
function spawnOffset(pilots: ReadonlyMap<string, Pilot>, pilot: Pilot, base: readonly number[]): [number, number] {
  const others = [...pilots.values()]
    .filter((p) => p !== pilot && p.alive)
    .map((p) => p.history[p.history.length - 1]?.p)
    .filter((p): p is Vec3 => !!p);
  const free = (dx: number, dz: number) => others.every((p) => Math.hypot(p[0] - base[0]! - dx, p[2] - base[2]! - dz) > SPAWN_TAKEN_M);
  if (free(0, 0)) return [0, 0];
  for (let ring = 1; ring <= 3; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.round(Math.cos(a) * SPAWN_RING_M * ring * 100) / 100;
      const dz = Math.round(Math.sin(a) * SPAWN_RING_M * ring * 100) / 100;
      if (free(dx, dz)) return [dx, dz];
    }
  }
  return [0, 0];
}
