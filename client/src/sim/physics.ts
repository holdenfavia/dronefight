import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { SIM } from '../config';
import { groundRects, type ArenaBox, type GroundHole, type Terrain } from '../../../shared/maps';
import { terrainTriangles } from '../../../shared/maps/terrain';

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

/** A map box ready to become a collider, and the grid cells it touches. */
interface StaticBox {
  desc: RAPIER.ColliderDesc;
  collider: RAPIER.Collider | null;
}

/**
 * Fixed colliders for a map's boxes and its ground (with any holes, ADR-0054), replaceable when the map changes
 * (ADR-0012). Rapier's step costs time for every collider in the world, even static ones far away: Downtown's
 * ~12,000 boxes cost ~20 ms a frame at 500 Hz, capping the game at 30 FPS. So only the boxes near the drone
 * are in the world (`near`, once a frame); the ground is always there. Nothing else queries these colliders.
 */
export class ArenaColliders {
  private ground: RAPIER.Collider[] = [];
  private boxes: StaticBox[] = [];
  /** Grid cell key -> indices of the boxes whose bounds touch that cell. */
  private cells = new Map<number, number[]>();
  private active = new Set<number>();
  private cellX = NaN;
  private cellZ = NaN;

  constructor(private readonly physics: Physics) {}

  set(boxes: readonly ArenaBox[], holes: readonly GroundHole[] = [], terrain?: Terrain, mapHalf = 0): void {
    const { rapier, world } = this.physics;
    for (const c of this.ground) world.removeCollider(c, false);
    for (const b of this.boxes) if (b.collider) world.removeCollider(b.collider, false);
    // The ground: slabs covering everything but the holes, top face at y = 0. With rolling ground (ADR-0059) the
    // slabs only cover the outside of the map, and the map itself is the terrain's own triangles.
    const cut = terrain ? [{ x: 0, z: 0, w: mapHalf * 2, d: mapHalf * 2 }] : holes;
    this.ground = groundRects(GROUND_HALF, cut).map(([x0, z0, x1, z1]) =>
      world.createCollider(rapier.ColliderDesc.cuboid((x1 - x0) / 2, 1, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, -1, (z0 + z1) / 2).setFriction(0.8)),
    );
    if (terrain) {
      const { positions, indices } = terrainTriangles(terrain, holes);
      this.ground.push(world.createCollider(rapier.ColliderDesc.trimesh(positions, indices).setFriction(0.8)));
    }
    this.cells.clear();
    this.active.clear();
    this.cellX = this.cellZ = NaN;
    const size = SIM.colliderCellSize;
    this.boxes = boxes.map((box, i) => {
      const desc = rapier.ColliderDesc.cuboid(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)
        .setTranslation(box.pos[0], box.pos[1], box.pos[2])
        .setFriction(0.7);
      if (box.rot) {
        quat.setFromEuler(euler.set(box.rot[0] * DEG, box.rot[1] * DEG, box.rot[2] * DEG));
        desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      }
      // Bounding circle in plan view, whatever the rotation: half the box's diagonal.
      const r = 0.5 * Math.hypot(box.size[0], box.size[1], box.size[2]);
      for (let cx = Math.floor((box.pos[0] - r) / size); cx <= Math.floor((box.pos[0] + r) / size); cx++) {
        for (let cz = Math.floor((box.pos[2] - r) / size); cz <= Math.floor((box.pos[2] + r) / size); cz++) {
          const key = cellKey(cx, cz);
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
      }
      return { desc, collider: null };
    });
  }

  /** Keep the colliders within `SIM.colliderReachCells` grid cells of (x, z) in the world. Call before stepping. */
  near(x: number, z: number): void {
    const size = SIM.colliderCellSize;
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    if (cx === this.cellX && cz === this.cellZ) return;
    this.cellX = cx;
    this.cellZ = cz;
    const reach = SIM.colliderReachCells;
    const wanted = new Set<number>();
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        for (const i of this.cells.get(cellKey(ix, iz)) ?? []) wanted.add(i);
      }
    }
    const { world } = this.physics;
    for (const i of this.active) {
      if (wanted.has(i)) continue;
      const b = this.boxes[i]!;
      if (b.collider) world.removeCollider(b.collider, false);
      b.collider = null;
    }
    for (const i of wanted) {
      const b = this.boxes[i]!;
      if (!b.collider) b.collider = world.createCollider(b.desc);
    }
    this.active = wanted;
  }

  /** How many map boxes are in the physics world right now (for tests). */
  get activeCount(): number {
    return this.active.size;
  }
}

/** One number per grid cell (maps are well under ±30 km, so cells fit in 16 bits each way). */
function cellKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}
