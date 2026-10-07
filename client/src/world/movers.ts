import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { moverPose, type MapDef, type MoverDef, type MoverKind } from '../../../shared/maps';
import type { V3 } from '../../../shared/maps/movers';
import type { ExplosiveDef } from '../../../shared/maps/types';
import type { PropField } from '../../../shared/props';
import type { Physics } from '../sim/physics';

/**
 * Props (ADR-0020, ADR-0023): each map's traffic, coaster train or tractor, posed every frame from the
 * shared clock (so both pilots see the same thing) with a kinematic collider you can crash into, plus
 * the map's static explosives (parked cars, barrels, tanks). A destroyed prop (per the PropField) is
 * hidden and its collider switched off until it comes back.
 */

interface Live {
  def: MoverDef;
  model: THREE.Group;
  body: RAPIER.RigidBody;
}

interface Static {
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
    case 'plane': {
      // An airliner (ADR-0054): the collision box is the fuselage; wings and tail are drawn around it.
      const white = mat('#f2f2ee', 0.4, 0.1);
      part(g, [w, h, l], [0, 0, 0], white);
      part(g, [w + 0.05, h * 0.25, l * 0.96], [0, -h * 0.1, 0], body);
      part(g, [w * 0.7, h * 0.35, 1.2], [0, h * 0.15, -l / 2 - 0.4], GLASS);
      part(g, [l * 0.95, 0.4, 5], [0, -h * 0.2, l * 0.02], white);
      for (const s of [-1, 1]) part(g, [1.8, 1.8, 4], [s * l * 0.22, -h * 0.55, -l * 0.02], mat('#9aa0a6', 0.3, 0.6));
      part(g, [0.4, h * 1.4, 4.5], [0, h * 1.1, l * 0.42], body);
      part(g, [l * 0.32, 0.3, 3], [0, h * 0.2, l * 0.44], white);
      break;
    }
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

/** Static explosives: a car looks like a traffic car; drums and tanks are cylinders. */
const EXPLOSIVE_COLORS = { car: '#e9e9e6', fuel: '#c8321e', propane: '#eeeeec', water: '#2f7fe0' } as const;

function cylinder(g: THREE.Group, radius: number, height: number, material: THREE.Material, y = 0, alongZ = false): void {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
  if (alongZ) geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.y = y;
  m.castShadow = true;
  g.add(m);
}

function buildExplosive(e: ExplosiveDef): THREE.Group {
  const [w, h, l] = e.size;
  const color = e.color ?? EXPLOSIVE_COLORS[e.kind];
  if (e.kind === 'car') return buildModel('car', color, e.size);
  const g = new THREE.Group();
  const body = mat(color, 0.5, 0.2);
  switch (e.kind) {
    case 'fuel':
      cylinder(g, w / 2, h, body);
      for (const y of [-h * 0.25, h * 0.25]) cylinder(g, w / 2 + 0.03, 0.08, BLACK, y);
      cylinder(g, w * 0.12, 0.1, mat('#e8d640', 0.5), h / 2 + 0.05);
      break;
    case 'propane':
      cylinder(g, w / 2, l - w * 0.4, body, 0, true);
      for (const z of [-(l / 2 - w * 0.2), l / 2 - w * 0.2]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 16, 8), body);
        cap.position.z = z;
        cap.scale.z = 0.4 / 0.5;
        g.add(cap);
      }
      part(g, [0.3, 0.4, 0.3], [0, h / 2 + 0.1, 0], mat('#c9a24a', 0.4, 0.6));
      break;
    case 'water':
      cylinder(g, w / 2, h * 0.9, body, -h * 0.05);
      cylinder(g, w / 2 + 0.05, h * 0.1, mat('#33363a', 0.7), h * 0.45);
      for (const y of [-h * 0.3, h * 0.05]) cylinder(g, w / 2 + 0.04, 0.12, BLACK, y);
      break;
  }
  return g;
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class MovingProps {
  private live: Live[] = [];
  private statics: Static[] = [];
  private field: PropField | null = null;
  private readonly pos: V3 = [0, 0, 0];
  private readonly dir: V3 = [0, 0, 0];
  private readonly qYaw = new THREE.Quaternion();
  private readonly qPitch = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
  ) {}

  setMap(map: MapDef, field: PropField): void {
    const { world } = this.physics;
    this.field = field;
    for (const l of [...this.live, ...this.statics]) {
      this.scene.remove(l.model);
      world.removeRigidBody(l.body);
    }
    this.statics = (map.explosives ?? []).map((e) => {
      const model = buildExplosive(e);
      model.position.set(...e.pos);
      model.rotation.y = ((e.yawDeg ?? 0) * Math.PI) / 180;
      this.scene.add(model);
      const { rapier } = this.physics;
      const q = model.quaternion;
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(...e.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
      world.createCollider(rapier.ColliderDesc.cuboid(e.size[0] / 2, e.size[1] / 2, e.size[2] / 2), body);
      return { model, body };
    });
    this.live = (map.movers ?? []).map((def) => {
      const model = buildModel(def.kind, def.color, def.size);
      this.scene.add(model);
      const { rapier } = this.physics;
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(rapier.ColliderDesc.cuboid(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2), body);
      return { def, model, body };
    });
  }

  /** Pose everything for shared time t (seconds); hide destroyed props and switch their colliders off. */
  update(t: number): void {
    const n = this.live.length;
    for (const [k, s] of this.statics.entries()) this.show(s, !this.field?.isDown(n + k));
    for (const [i, l] of this.live.entries()) {
      this.show(l, !this.field?.isDown(i));
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

  private show(p: { model: THREE.Group; body: RAPIER.RigidBody }, on: boolean): void {
    if (p.model.visible === on) return;
    p.model.visible = on;
    p.body.setEnabled(on);
  }
}
