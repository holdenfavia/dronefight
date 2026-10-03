import * as THREE from 'three/webgpu';
import { droneClass, type DroneClassId } from '../../../shared/drones';
import { defaultLoadout, type Loadout } from '../../../shared/loadout';
import type { WeaponId } from '../../../shared/weapons';
import { PALETTE } from '../world/scene';

/**
 * A 5" freestyle quad built from primitives. Forward is -Z, matching the flight model.
 * Used for the chase view and for other pilots' drones.
 */
export function createDroneModel(propColor: string = PALETTE.orange): THREE.Group {
  const group = new THREE.Group();
  const carbon = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.5, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.6 });
  const motorMat = new THREE.MeshStandardMaterial({ color: '#8d9196', roughness: 0.3, metalness: 0.8 });
  const propMat = new THREE.MeshStandardMaterial({
    color: propColor,
    roughness: 0.4,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const armLength = 0.26;
  const arm = new THREE.BoxGeometry(0.022, 0.006, armLength);
  for (const angle of [45, -45]) {
    const m = new THREE.Mesh(arm, carbon);
    m.rotation.y = (angle * Math.PI) / 180;
    group.add(m);
  }

  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.075), carbon);
  stack.position.y = 0.02;
  group.add(stack);

  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.02), orange);
  cam.position.set(0, 0.022, -0.045);
  group.add(cam);

  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.075), new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.7 }));
  battery.position.y = 0.05;
  group.add(battery);

  const motorGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.016, 12);
  const propGeo = new THREE.CylinderGeometry(0.064, 0.064, 0.002, 24);
  const r = armLength / 2;
  for (const [x, z] of [[r, r], [-r, r], [r, -r], [-r, -r]] as const) {
    const px = x * Math.SQRT1_2;
    const pz = z * Math.SQRT1_2;
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(px, 0.011, pz);
    const prop = new THREE.Mesh(propGeo, propMat);
    prop.position.set(px, 0.022, pz);
    group.add(motor, prop);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  group.userData.propMaterial = propMat;
  return group;
}

/**
 * FPV wing (ADR-0013): a swept flying wing with winglets, a camera pod and a pusher prop.
 * Real size (~0.9 m span); forward is -Z like the quads.
 */
export function createWingModel(teamColor: string = PALETTE.orange): THREE.Group {
  const group = new THREE.Group();
  const foam = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.5, metalness: 0.3 });
  const team = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55 });
  const propMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false });

  // Planform in the XY plane (y = forward), extruded for thickness, then laid flat.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.3);
  shape.lineTo(0.45, -0.16);
  shape.lineTo(0.45, -0.24);
  shape.lineTo(0, -0.1);
  shape.lineTo(-0.45, -0.24);
  shape.lineTo(-0.45, -0.16);
  shape.closePath();
  const thickness = 0.03;
  const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, -thickness / 2, 0);
  group.add(new THREE.Mesh(wingGeo, foam));

  // Team-colored stripes near the tips, so the class and side read at a distance.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.034, 0.12), team);
    stripe.position.set(side * 0.36, 0, 0.14);
    group.add(stripe);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.12), team);
    fin.position.set(side * 0.45, 0.06, 0.2);
    group.add(fin);
  }

  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.32), carbon);
  pod.position.set(0, 0.03, -0.05);
  group.add(pod);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.03), team);
  cam.position.set(0, 0.035, -0.22);
  group.add(cam);

  // Pusher prop at the trailing edge, spinning in the XY plane.
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12), carbon);
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0, 0.02, 0.11);
  group.add(motor);
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.004, 24), propMat);
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, 0.02, 0.13);
  group.add(prop);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  group.userData.propMaterial = propMat;
  group.userData.teamMaterials = [team];
  return group;
}

/**
 * X8 heavy lifter (ADR-0033): four long arms with coaxial motor pairs (a prop above and below each),
 * a big central plate and a heavy battery.
 */
export function createX8Model(propColor: string = PALETTE.orange): THREE.Group {
  const group = new THREE.Group();
  const carbon = new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.5, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.6 });
  const motorMat = new THREE.MeshStandardMaterial({ color: '#8d9196', roughness: 0.3, metalness: 0.8 });
  const propMat = new THREE.MeshStandardMaterial({ color: propColor, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false });
  const arm = 0.42;
  for (const angle of [45, -45]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, arm), carbon);
    m.rotation.y = (angle * Math.PI) / 180;
    group.add(m);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.14), carbon);
  plate.position.y = 0.02;
  group.add(plate);
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.11), new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.7 }));
  battery.position.y = 0.06;
  group.add(battery);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.025), accent);
  cam.position.set(0, 0.03, -0.08);
  group.add(cam);
  const motorGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.022, 12);
  const propGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.002, 24);
  const r = (arm / 2) * Math.SQRT1_2;
  for (const [x, z] of [[r, r], [-r, r], [r, -r], [-r, -r]] as const) {
    for (const side of [1, -1]) {
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(x, side * 0.016, z);
      const prop = new THREE.Mesh(propGeo, propMat);
      prop.position.set(x, side * 0.03, z);
      group.add(motor, prop);
    }
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  group.userData.propMaterial = propMat;
  return group;
}

/** Hardpoint positions under the frame (m, real scale): spread side to side by hardpoint count. */
function hardpointX(slot: number, slots: number, width: number): number {
  return slots <= 1 ? 0 : (slot / (slots - 1) - 0.5) * width;
}

/** A small model of a weapon module, hung under the frame (ADR-0033). Forward is -Z. */
function weaponModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.45, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.3, metalness: 0.8 });
  const barrel = (len: number, radius: number, x = 0, y = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8).rotateX(Math.PI / 2), steel);
    m.position.set(x, y, -len / 2);
    g.add(m);
  };
  switch (id) {
    case 'gun':
      barrel(0.06, 0.004);
      break;
    case 'burst':
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.05), dark), {}));
      barrel(0.07, 0.004, 0, 0.002);
      break;
    case 'shotgun':
      barrel(0.06, 0.006, -0.006);
      barrel(0.06, 0.006, 0.006);
      break;
    case 'cannon':
      for (let k = 0; k < 3; k++) barrel(0.08, 0.003, Math.cos((k / 3) * Math.PI * 2) * 0.006, Math.sin((k / 3) * Math.PI * 2) * 0.006);
      break;
    case 'rail': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), dark);
      body.position.z = -0.04;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.004, 0.14), new THREE.MeshBasicMaterial({ color: '#7fe0ff', toneMapped: false }));
      glow.position.set(0, 0.011, -0.04);
      g.add(body, glow);
      break;
    }
    case 'missile': {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.07), dark);
      g.add(pod);
      for (const x of [-0.008, 0.008]) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.012, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d7263d' }));
        tip.position.set(x, 0, -0.041);
        g.add(tip);
      }
      break;
    }
  }
  return g;
}

/**
 * The model for a loadout (ADR-0033): its body, drawn at the body's scale (ADR-0011, ADR-0029), with its
 * weapons hung under the frame so other pilots can see what you carry.
 */
export function createClassModel(cls: DroneClassId, teamColor: string, loadout: Loadout = defaultLoadout(cls)): THREE.Group {
  const model = cls === 'wing' ? createWingModel(teamColor) : cls === 'x8' ? createX8Model(teamColor) : createDroneModel(teamColor);
  if (cls === 'quad3d') {
    // 3D quads fly both ways up: a second battery underneath makes them look symmetric.
    const battery = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.03, 0.075),
      new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.7 }),
    );
    battery.position.y = -0.03;
    model.add(battery);
  }
  // Weapons: under the frame (on a wing, under the wing either side of the pod).
  const width = cls === 'wing' ? 0.5 : cls === 'x8' ? 0.16 : 0.08;
  const below = cls === 'wing' ? -0.02 : cls === 'x8' ? -0.025 : -0.012;
  loadout.weapons.forEach((w, i) => {
    if (!w) return;
    const m = weaponModel(w);
    m.position.set(hardpointX(i, loadout.weapons.length, width), below, cls === 'wing' ? -0.02 : -0.03);
    model.add(m);
  });
  // The 3" racer is a smaller frame drawn at the same scale (hitbox 1.6 m vs 2.25 m, ADR-0033).
  const inner = cls === 'racer' ? 0.7 : cls === 'x8' ? 1 : 1;
  model.scale.setScalar(droneClass(cls).visualScale * inner);
  model.userData.droneClass = cls;
  model.userData.loadoutKey = `${loadout.body}:${loadout.weapons.join(',')}:${loadout.special ?? ''}`;
  return model;
}

/** Recolor a drone's props (and team accents) to its team color (ADR-0009). */
export function setDronePropColor(model: THREE.Group, color: string): void {
  const mats = [model.userData.propMaterial, ...((model.userData.teamMaterials as unknown[]) ?? [])] as (
    | THREE.MeshStandardMaterial
    | undefined
  )[];
  for (const mat of mats) {
    if (mat && `#${mat.color.getHexString()}` !== color.toLowerCase()) mat.color.set(color);
  }
}
