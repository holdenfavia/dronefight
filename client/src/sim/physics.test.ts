import { describe, expect, it } from 'vitest';
import { getMap } from '../../../shared/maps';
import { SIM } from '../config';
import { ArenaColliders, createPhysics } from './physics';

describe('arena colliders near the drone (frame rate, Hard rule 2)', () => {
  it('keeps only nearby Downtown boxes in the physics world, and swaps them as the drone moves', async () => {
    const physics = await createPhysics();
    const map = getMap('downtown');
    const arena = new ArenaColliders(physics);
    arena.set(map.boxes, map.holes, map.terrain, map.halfSize);
    expect(arena.activeCount).toBe(0);
    const box = map.boxes.find((b) => !b.rot && b.size[1] > 2)!;
    arena.near(box.pos[0], box.pos[2]);
    expect(arena.activeCount).toBeGreaterThan(0);
    expect(arena.activeCount).toBeLessThan(map.boxes.length / 5);
    // The box under the drone is solid: a ray down from just above it hits a map box (after a step updates queries).
    physics.world.step();
    const ray = new physics.rapier.Ray({ x: box.pos[0], y: box.pos[1] + box.size[1] / 2 + 1, z: box.pos[2] }, { x: 0, y: -1, z: 0 });
    expect(physics.world.castRay(ray, 2, true)).not.toBeNull();
    // Far outside the map nothing is loaded but the ground.
    arena.near(SIM.colliderCellSize * 1000, 0);
    expect(arena.activeCount).toBe(0);
  });
});
