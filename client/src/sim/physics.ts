import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { SIM } from '../config';
import type { ArenaBox } from '../world/arenaLayout';

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

/** Fixed colliders for the ground and every arena box. */
export function addArenaColliders({ rapier, world }: Physics, boxes: readonly ArenaBox[], groundHalfSize: number) {
  const ground = rapier.ColliderDesc.cuboid(groundHalfSize, 1, groundHalfSize)
    .setTranslation(0, -1, 0)
    .setFriction(0.8);
  world.createCollider(ground);

  for (const box of boxes) {
    const desc = rapier.ColliderDesc.cuboid(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)
      .setTranslation(box.pos[0], box.pos[1], box.pos[2])
      .setFriction(0.7);
    if (box.rot) {
      quat.setFromEuler(euler.set(box.rot[0] * DEG, box.rot[1] * DEG, box.rot[2] * DEG));
      desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    world.createCollider(desc);
  }
}
