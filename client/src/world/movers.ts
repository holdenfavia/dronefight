import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { moverPose, type MapDef, type MoverDef, type MoverKind } from '../../../shared/maps';
import type { V3 } from '../../../shared/maps/movers';
import type { Physics } from '../sim/physics';

/**
 * Moving props (ADR-0020): each map's traffic, coaster train or tractor, posed every frame from the
 * shared clock (so both pilots see the same thing) and given a kinematic collider you can crash into.
 * Rounds pass through them: the server doesn't know they exist.
 */

interface Live {
  def: MoverDef;
  model: THREE.Group;
  body: RAPIER.RigidBody;
}

const mat = (color: string, roughness = 0.6, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const BLACK = mat('#1b1c1e', 0.8);
const GLASS = mat('#5d7f9e', 0.2, 0.4);
const LIGHT = new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false });

function part(g: THREE.Group, size: V3, pos: V3, material: THREE.Material): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.castShadow = true;
  g.add(m);
}

/** Models are built along -Z (forward), centered on the collision box. */
function buildModel(kind: MoverKind, color: string, size: V3): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color, 0.45, 0.2);
  const [w, h, l] = size;
  switch (kind) {
    case 'car':
      part(g, [w, h * 0.5, l], [0, -h * 0.15, 0], body);
      part(g, [w * 0.9, h * 0.45, l * 0.5], [0, h * 0.3, l * 0.05], GLASS);
      for (const x of [-w / 2, w / 2]) for (const z of [-l * 0.32, l * 0.32]) part(g, [0.35, 0.7, 0.7], [x, -h / 2 + 0.35, z], BLACK);
      for (const x of [-w * 0.3, w * 0.3]) part(g, [0.4, 0.2, 0.05], [x, -h * 0.1, -l / 2], LIGHT);
      break;
    case 'tractor':
      part(g, [1.4, 1.3, l * 0.7], [0, -0.35, -l * 0.12], body);
      part(g, [w * 0.75, 1.5, 1.5], [0, 0.55, l * 0.2], GLASS);
      part(g, [w * 0.8, 0.12, 1.7], [0, 1.35, l * 0.2], body);
      for (const s of [-1, 1]) part(g, [0.55, 2.2, 2.2], [s * (w / 2 - 0.2), -h / 2 + 1.1, l * 0.22], BLACK);
      for (const s of [-1, 1]) part(g, [0.4, 1.1, 1.1], [s * (w / 2 - 0.45), -h / 2 + 0.55, -l * 0.35], BLACK);
      part(g, [0.18, 1.3, 0.18], [0.45, 0.8, -l * 0.3], BLACK);
      part(g, [0.3, 0.2, 0.05], [0, -0.3, -l / 2], LIGHT);
      break;
    case 'trailer':
      part(g, [w, 0.4, l], [0, -h / 2 + 0.8, 0], body);
      for (const s of [-1, 1]) part(g, [0.3, 0.9, 0.9], [s * (w / 2 - 0.1), -h / 2 + 0.45, 0.3], BLACK);
      // Hay bales.
      for (const z of [-1.1, 1.1]) part(g, [w * 0.8, 0.9, 1.6], [0, -h / 2 + 1.45, z], mat('#e0c35a', 0.9));
      part(g, [0.2, 0.2, 1.6], [0, -h / 2 + 0.8, -l / 2 - 0.8], BLACK);
      break;
    case 'coasterCar':
      part(g, [w, h * 0.5, l], [0, -h * 0.25, 0], body);
      part(g, [w * 0.85, h * 0.5, 0.25], [0, h * 0.15, l * 0.1], mat('#eeeeec'));
      part(g, [w * 0.85, h * 0.5, 0.25], [0, h * 0.15, l * 0.42], mat('#eeeeec'));
      part(g, [w, 0.2, 0.2], [0, h * 0.35, -l * 0.2], BLACK);
      part(g, [w * 0.6, h * 0.3, 0.3], [0, -h * 0.1, -l / 2 - 0.1], BLACK);
      break;
  }
  return g;
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class MovingProps {
  private live: Live[] = [];
  private readonly pos: V3 = [0, 0, 0];
  private readonly dir: V3 = [0, 0, 0];
  private readonly qYaw = new THREE.Quaternion();
  private readonly qPitch = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
  ) {}

  setMap(map: MapDef): void {
    const { world } = this.physics;
    for (const l of this.live) {
      this.scene.remove(l.model);
      world.removeRigidBody(l.body);
    }
    this.live = (map.movers ?? []).map((def) => {
      const model = buildModel(def.kind, def.color, def.size);
      this.scene.add(model);
      const { rapier } = this.physics;
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(rapier.ColliderDesc.cuboid(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2), body);
      return { def, model, body };
    });
  }

  /** Pose everything for shared time t (seconds). */
  update(t: number): void {
    for (const l of this.live) {
      moverPose(l.def, t, this.pos, this.dir);
      const [dx, dy, dz] = this.dir;
      this.qYaw.setFromAxisAngle(Y, Math.atan2(-dx, -dz));
      this.qPitch.setFromAxisAngle(X, Math.asin(Math.max(-1, Math.min(1, dy))));
      l.model.quaternion.copy(this.qYaw).multiply(this.qPitch);
      l.model.position.set(this.pos[0], this.pos[1], this.pos[2]);
      const q = l.model.quaternion;
      l.body.setNextKinematicTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] });
      l.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
  }
}
