import { buildCavern } from './cavern.js';
import { buildDowntown } from './downtown.js';
import type { MapDef, MapId, SpawnPoint } from './types.js';
import { buildPlayground } from './playground.js';
import { buildTraining } from './training.js';
import { buildYard } from './yard.js';

export type { ArenaBox, ArenaMaterial, Atmosphere, MapDef, MapId, SpawnPoint } from './types.js';
export type { MoverDef, MoverKind } from './movers.js';
export { moverPose } from './movers.js';
export { groundRects, inHole, type GroundHole } from './ground.js';
export { SURFACE, terrainHeight, terrainNormal, terrainSurface, type Terrain } from './terrain.js';

export const MAP_ORDER: readonly MapId[] = ['downtown', 'yard', 'playground', 'cavern', 'training'];
export const DEFAULT_MAP: MapId = 'downtown';

/** Map names, for menus: cheap, never builds a map. Each map's own `name` matches (maps.test.ts). */
export const MAP_NAMES: Readonly<Record<MapId, string>> = {
  downtown: 'Downtown',
  yard: 'Yard',
  playground: 'Playground',
  cavern: 'Cavern',
  training: 'Training',
};

const BUILDERS: Record<MapId, () => MapDef> = {
  downtown: buildDowntown,
  yard: buildYard,
  playground: buildPlayground,
  cavern: buildCavern,
  training: buildTraining,
};
const built = new Map<MapId, MapDef>();

export function isMapId(x: unknown): x is MapId {
  return typeof x === 'string' && Object.hasOwn(BUILDERS, x);
}

/**
 * The map, built on first use and kept: building every map at import cost ~0.3 s at startup.
 * Builders fill module-level arrays (Downtown's decor and terrain), so each must run only once.
 */
export function getMap(id: MapId): MapDef {
  let map = built.get(id);
  if (!map) {
    map = BUILDERS[id]();
    built.set(id, map);
  }
  return map;
}

/** Every map by id; reading one builds it (through getMap). */
export const MAPS: Readonly<Record<MapId, MapDef>> = Object.defineProperties(
  {} as Record<MapId, MapDef>,
  Object.fromEntries(MAP_ORDER.map((id) => [id, { enumerable: true, get: () => getMap(id) }])),
);

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
