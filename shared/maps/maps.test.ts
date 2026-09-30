import { describe, expect, it } from 'vitest';
import { buildColliders, raycastArena } from '../raycast.js';
import { MAP_ORDER, MAPS, pickSpawn, SPAWN_SAFE_DISTANCE } from './index.js';

describe('maps', () => {
  for (const id of MAP_ORDER) {
    const map = MAPS[id];
    describe(map.name, () => {
      it('has 8 spawns inside the boundary', () => {
        expect(map.spawns).toHaveLength(8);
        for (const s of map.spawns) {
          expect(Math.abs(s.pos[0])).toBeLessThan(map.halfSize);
          expect(Math.abs(s.pos[2])).toBeLessThan(map.halfSize);
        }
      });

      it('leaves room to take off from every spawn (nothing solid within 4 m above the pad)', () => {
        const colliders = buildColliders(map.boxes.filter((b) => b.mat !== 'pad'));
        for (const s of map.spawns) {
          const up = raycastArena(colliders, s.pos[0], 0.5, s.pos[2], 0, 1, 0, 20);
          expect(up, `spawn at ${s.pos}`).toBeGreaterThan(4);
        }
      });

      it('does not start any spawn inside geometry', () => {
        const colliders = buildColliders(map.boxes.filter((b) => b.mat !== 'pad' && b.mat !== 'sidewalk'));
        for (const s of map.spawns) {
          // Cast in four directions from pad height: something inside a box would report 0.
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            expect(raycastArena(colliders, s.pos[0], 1, s.pos[2], dx, 0, dz, 10), `spawn at ${s.pos}`).toBeGreaterThan(1.5);
          }
        }
      });
    });
  }
});

describe('pickSpawn (ADR-0012)', () => {
  const spawns = MAPS.downtown.spawns;

  it('never picks a spawn near an opponent when a safe one exists', () => {
    const enemy = spawns[0]!.pos;
    for (let seed = 0; seed < 200; seed++) {
      const i = pickSpawn(spawns, [enemy], null, () => seed / 200);
      const s = spawns[i]!;
      expect(Math.hypot(s.pos[0] - enemy[0], s.pos[2] - enemy[2])).toBeGreaterThanOrEqual(SPAWN_SAFE_DISTANCE);
    }
  });

  it('avoids repeating the previous spawn', () => {
    for (let seed = 0; seed < 50; seed++) expect(pickSpawn(spawns, [], 3, () => seed / 50)).not.toBe(3);
  });

  it('uses every spawn over time', () => {
    const used = new Set<number>();
    for (let seed = 0; seed < 100; seed++) used.add(pickSpawn(spawns, [], null, () => seed / 100));
    expect(used.size).toBe(spawns.length);
  });

  it('falls back to the farthest spawn when all are close', () => {
    const everywhere = spawns.map((s) => s.pos);
    const i = pickSpawn(spawns, everywhere, null);
    expect(i).toBeGreaterThanOrEqual(0);
  });
});
