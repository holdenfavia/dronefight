import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { DRONE_ORDER, droneClass, type DroneClassId } from '../../../shared/drones';
import { MAPS } from '../../../shared/maps';
import { QUAD, QUAD_3D, RACER, X8, type QuadParams } from '../config';
import { ArenaColliders, createPhysics } from './physics';
import { WING } from './wingModel';

const BOX: Record<DroneClassId, QuadParams['modelBox']> = { freestyle: QUAD.modelBox, quad3d: QUAD_3D.modelBox, racer: RACER.modelBox, x8: X8.modelBox, wing: WING.modelBox };

describe('drones collide at drawn size (ADR-0040)', () => {
  it('every body fits at every spawn on every map', async () => {
    const physics = await createPhysics();
    const arena = new ArenaColliders(physics);
    for (const [mapId, map] of Object.entries(MAPS)) {
      arena.set([...map.boxes, ...(map.explosives ?? []).map((e) => ({ pos: e.pos, size: e.size, rot: [0, e.yawDeg ?? 0, 0] as [number, number, number], mat: 'concrete' as const }))]);
      physics.world.step();
      for (const body of DRONE_ORDER) {
        const b = BOX[body];
        const s = droneClass(body).visualScale;
        const shape = new RAPIER.Cuboid(b.half.x * s, b.half.y * s, b.half.z * s);
        for (const sp of map.spawns) {
          // As Drone.respawn places it: resting on the pad (wings launch in the air), turned to the spawn's yaw.
          const rest = body === 'wing' ? WING.launchHeight : (b.half.y - b.centerY) * s + 0.01;
          const yaw = ((body === 'wing' ? Math.round(sp.yawDeg / 90) * 90 : sp.yawDeg) * Math.PI) / 180;
          let blocked = false;
          physics.world.intersectionsWithShape(
            { x: sp.pos[0], y: sp.pos[1] + rest + b.centerY * s + 0.05, z: sp.pos[2] },
            { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
            shape,
            () => ((blocked = true), false),
          );
          expect(blocked, `${body} at ${mapId} spawn ${sp.pos}`).toBe(false);
        }
      }
    }
  });
});
