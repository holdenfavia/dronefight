import * as THREE from 'three/webgpu';
import { PALETTE } from '../world/scene';

/**
 * A 5" freestyle quad built from primitives. Forward is -Z, matching the flight model.
 * Used for the chase view now and for the other pilot's drone in Phase 2.
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
  return group;
}
