import { DOWNTOWN } from './downtown.js';
import type { MapDef, MapId, SpawnPoint } from './types.js';
import { PLAYGROUND } from './playground.js';
import { TRAINING } from './training.js';
import { YARD } from './yard.js';

export type { ArenaBox, ArenaMaterial, MapDef, MapId, SpawnPoint } from './types.js';
export type { MoverDef, MoverKind } from './movers.js';
export { moverPose } from './movers.js';

export const MAPS: Record<MapId, MapDef> = { downtown: DOWNTOWN, yard: YARD, playground: PLAYGROUND, training: TRAINING };
export const MAP_ORDER: readonly MapId[] = ['downtown', 'yard', 'playground', 'training'];
export const DEFAULT_MAP: MapId = 'downtown';

export function isMapId(x: unknown): x is MapId {
  return typeof x === 'string' && x in MAPS;
}

export function getMap(id: MapId): MapDef {
  return MAPS[id];
}

/** Spawns must be at least this far from every living opponent (ADR-0012). */
export const SPAWN_SAFE_DISTANCE = 60;

/**
 * Anti spawn-camping (ADR-0012): pick a random spawn at least SPAWN_SAFE_DISTANCE from every opponent,
 * avoiding `previous` when possible. If none qualify, use the one farthest from the nearest opponent.
 */
export function pickSpawn(
  spawns: readonly SpawnPoint[],
  opponents: readonly (readonly [number, number, number])[],
  previous: number | null,
  random: () => number = Math.random,
): number {
  const nearest = (s: SpawnPoint) =>
    opponents.reduce((min, o) => Math.min(min, Math.hypot(s.pos[0] - o[0], s.pos[2] - o[2])), Infinity);
  const safe = spawns.map((_, i) => i).filter((i) => nearest(spawns[i]!) >= SPAWN_SAFE_DISTANCE);
  const fresh = safe.filter((i) => i !== previous);
  const pool = fresh.length > 0 ? fresh : safe;
  if (pool.length > 0) return pool[Math.floor(random() * pool.length)] ?? pool[0]!;
  let best = 0;
  for (let i = 1; i < spawns.length; i++) if (nearest(spawns[i]!) > nearest(spawns[best]!)) best = i;
  return best;
}
