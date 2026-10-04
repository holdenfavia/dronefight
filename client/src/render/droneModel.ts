import * as THREE from 'three/webgpu';
import { droneClass, type DroneClassId } from '../../../shared/drones';
import { defaultLoadout, type Loadout } from '../../../shared/loadout';
import type { WeaponId } from '../../../shared/weapons';
import { PROPELLERS, type PropellerId } from '../../../shared/propellers';
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
  motor.name = 'pusher';
  group.add(motor);
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.004, 24), propMat);
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, 0.02, 0.13);
  prop.name = 'pusher';
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

/** A small model of a weapon module, hung under the frame (ADR-0033, ADR-0034). Real scale; forward is -Z. */
function weaponModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#24262a', roughness: 0.45, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: '#a7adb3', roughness: 0.25, metalness: 0.85 });
  const orange = new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.5 });
  const glowMat = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const tube = (len: number, r: number, x: number, y: number, z0: number, m: THREE.Material = steel, segments = 10) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segments).rotateX(Math.PI / 2), m);
    mesh.position.set(x, y, z0 - len / 2);
    g.add(mesh);
    return mesh;
  };
  const ring = (r: number, tubeR: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tubeR, 6, 16), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  switch (id) {
    case 'gun':
      box(0.014, 0.014, 0.03, 0, 0, 0, dark);
      tube(0.06, 0.004, 0, 0, -0.015);
      ring(0.006, 0.0018, 0, 0, -0.074, dark);
      break;
    case 'burst':
      box(0.016, 0.016, 0.045, 0, 0, 0, dark);
      box(0.008, 0.02, 0.012, 0, -0.016, 0.004, orange);
      tube(0.055, 0.0045, 0, 0.002, -0.022);
      break;
    case 'shotgun':
      box(0.026, 0.014, 0.028, 0, 0, 0.005, dark);
      tube(0.065, 0.0055, -0.006, 0, -0.009);
      tube(0.065, 0.0055, 0.006, 0, -0.009);
      box(0.02, 0.008, 0.018, 0, -0.011, -0.03, orange);
      break;
    case 'cannon': {
      const housing = tube(0.03, 0.012, 0, 0, 0.012, dark, 12);
      housing.position.z = 0;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        tube(0.075, 0.0025, Math.cos(a) * 0.0075, Math.sin(a) * 0.0075, -0.012);
      }
      ring(0.0105, 0.002, 0, 0, -0.08, dark);
      break;
    }
    case 'rail': {
      for (const x of [-0.009, 0.009]) box(0.006, 0.016, 0.16, x, 0, -0.04, dark);
      for (let k = 0; k < 4; k++) ring(0.013, 0.0022, 0, 0, -0.005 - k * 0.035, glowMat('#7fe0ff'));
      box(0.004, 0.004, 0.15, 0, 0, -0.04, glowMat('#c8f7ff'));
      break;
    }
    case 'missile': {
      box(0.032, 0.024, 0.07, 0, 0, 0, dark);
      for (const x of [-0.0105, 0, 0.0105]) {
        tube(0.012, 0.0045, x, 0.004, -0.035, steel, 8);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d7263d' }));
        tip.position.set(x, 0.004, -0.053);
        g.add(tip);
      }
      break;
    }
    case 'grenade': {
      tube(0.075, 0.011, 0, 0, 0.02, dark, 14);
      ring(0.011, 0.0025, 0, 0, -0.055, orange);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 14), dark);
      drum.position.set(0, -0.016, 0.005);
      g.add(drum);
      box(0.004, 0.004, 0.004, 0, 0.012, -0.02, glowMat('#ff3020'));
      break;
    }
  }
  g.traverse((o) => (o.castShadow = true));
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
  const mounts: THREE.Object3D[] = [];
  loadout.weapons.forEach((w, i) => {
    if (!w) return;
    const m = weaponModel(w);
    m.userData.slot = i;
    mounts.push(m);
    m.position.set(hardpointX(i, loadout.weapons.length, width), below, cls === 'wing' ? -0.02 : -0.03);
    model.add(m);
  });
  dressPropellers(model, loadout.propeller);
  // Each body has its own draw scale, so a racer and an X8 look nothing alike in size (ADR-0036).
  model.scale.setScalar(droneClass(cls).visualScale);
  model.userData.droneClass = cls;
  model.userData.weaponMounts = mounts;
  model.userData.loadoutKey = `${loadout.body}:${loadout.weapons.join(',')}:${loadout.special ?? ''}:${loadout.propeller}`;
  return model;
}

/**
 * Make the propeller discs look like the chosen props (ADR-0035): bi-blades a lighter blur, quad-blades a
 * denser one, heavy-lift wider, and ducts get a guard ring around each prop.
 */
function dressPropellers(model: THREE.Group, propeller: PropellerId): void {
  const jet = PROPELLERS[propeller].jet;
  if (jet) {
    mountJet(model, jet.kind);
    return;
  }
  const mat = model.userData.propMaterial as THREE.MeshStandardMaterial | undefined;
  if (!mat || propeller === 'tri') return;
  mat.opacity = propeller === 'bi' ? 0.38 : propeller === 'quad' ? 0.78 : mat.opacity;
  const discs: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === mat) discs.push(o);
  });
  const duct = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.3 });
  for (const d of discs) {
    if (propeller === 'heavy') d.scale.set(1.18, 1, 1.18);
    if (propeller === 'ducted') {
      const r = (d.geometry as THREE.CylinderGeometry).parameters.radiusTop * 1.08;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.018, 24, 1, true), duct);
      ring.material.side = THREE.DoubleSide;
      ring.position.copy(d.position);
      ring.rotation.copy(d.rotation);
      ring.castShadow = true;
      d.parent?.add(ring);
    }
  }
}

/**
 * A jet on top of the wing's pod in place of the pusher prop (ADR-0038). Real scale; forward is -Z.
 * Micro turbine: a fat nacelle. Pulse jet: a long thin pipe with a valve head, up on a pylon. Ramjet: a tube
 * with a shock-cone spike in its inlet. Each has a glowing nozzle.
 */
function mountJet(model: THREE.Group, kind: 'turbine' | 'pulsejet' | 'ramjet'): void {
  model.traverse((o) => {
    if (o.name === 'pusher') o.visible = false;
  });
  const metal = new THREE.MeshStandardMaterial({ color: '#9a9ea4', roughness: 0.3, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: kind === 'pulsejet' ? '#ff7a2a' : '#ffb347', toneMapped: false });
  const jet = new THREE.Group();
  /** A tube along Z from z0 (front) to z1 (back). */
  const tube = (r0: number, r1: number, z0: number, z1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, 16), mat);
    m.rotation.x = Math.PI / 2;
    m.position.z = (z0 + z1) / 2;
    jet.add(m);
    return m;
  };
  let tail = 0;
  let nozzle = 0;
  if (kind === 'turbine') {
    tube(0.036, 0.036, -0.1, 0.1, metal);
    tube(0.036, 0.024, 0.1, 0.15, metal);
    tube(0.03, 0.03, -0.103, -0.099, dark);
    tail = 0.15;
    nozzle = 0.022;
    jet.position.set(0, 0.075, 0.02);
  } else if (kind === 'pulsejet') {
    tube(0.034, 0.034, -0.16, -0.08, metal);
    tube(0.034, 0.016, -0.08, -0.03, metal);
    tube(0.016, 0.016, -0.03, 0.22, metal);
    tube(0.016, 0.022, 0.22, 0.26, metal);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.12), dark);
    pylon.position.set(0, -0.04, 0);
    jet.add(pylon);
    tail = 0.26;
    nozzle = 0.02;
    jet.position.set(0, 0.105, 0.0);
  } else {
    tube(0.032, 0.032, -0.08, 0.14, metal);
    tube(0.032, 0.026, 0.14, 0.18, metal);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 16), dark);
    spike.rotation.x = -Math.PI / 2;
    spike.position.z = -0.1;
    jet.add(spike);
    tail = 0.18;
    nozzle = 0.024;
    jet.position.set(0, 0.07, 0.0);
  }
  const flame = new THREE.Mesh(new THREE.CircleGeometry(nozzle, 16), glow);
  flame.position.z = tail + 0.001;
  jet.add(flame);
  jet.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  model.add(jet);
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
