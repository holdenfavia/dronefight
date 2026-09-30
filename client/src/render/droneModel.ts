import * as THREE from 'three/webgpu';
import { droneClass, type DroneClassId } from '../../../shared/drones';
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

/** The model for a drone class, drawn at the class's scale (ADR-0011, ADR-0013). */
export function createClassModel(cls: DroneClassId, teamColor: string): THREE.Group {
  const model = cls === 'wing' ? createWingModel(teamColor) : createDroneModel(teamColor);
  if (cls === 'quad3d') {
    // 3D quads fly both ways up: a second battery underneath makes them look symmetric.
    const battery = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.03, 0.075),
      new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.7 }),
    );
    battery.position.y = -0.03;
    model.add(battery);
  }
  model.scale.setScalar(droneClass(cls).visualScale);
  model.userData.droneClass = cls;
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
