import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { SIM } from '../config';
import { groundRects, type ArenaBox, type GroundHole } from '../../../shared/maps';

export type Rapier = typeof RAPIER;

export interface Physics {
  rapier: Rapier;
  world: RAPIER.World;
}

export async function createPhysics(): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -SIM.gravity, z: 0 });
  world.timestep = 1 / SIM.hz;
  return { rapier: RAPIER, world };
}

const euler = new Euler();
const quat = new Quaternion();
const DEG = Math.PI / 180;

/** How far the ground reaches (m): well past every map's boundary. */
const GROUND_HALF = 1200;

/** Fixed colliders for a map's boxes and its ground (with any holes, ADR-0054), replaceable when the map changes (ADR-0012). */
export class ArenaColliders {
  private colliders: RAPIER.Collider[] = [];

  constructor(private readonly physics: Physics) {}

  set(boxes: readonly ArenaBox[], holes: readonly GroundHole[] = []): void {
    const { rapier, world } = this.physics;
    for (const c of this.colliders) world.removeCollider(c, false);
    // The ground: slabs covering everything but the holes, top face at y = 0.
    const ground = groundRects(GROUND_HALF, holes).map(([x0, z0, x1, z1]) =>
      world.createCollider(rapier.ColliderDesc.cuboid((x1 - x0) / 2, 1, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, -1, (z0 + z1) / 2).setFriction(0.8)),
    );
    this.colliders = boxes.map((box) => {
      const desc = rapier.ColliderDesc.cuboid(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)
        .setTranslation(box.pos[0], box.pos[1], box.pos[2])
        .setFriction(0.7);
      if (box.rot) {
        quat.setFromEuler(euler.set(box.rot[0] * DEG, box.rot[1] * DEG, box.rot[2] * DEG));
        desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      }
      return world.createCollider(desc);
    });
    this.colliders.push(...ground);
  }
}
