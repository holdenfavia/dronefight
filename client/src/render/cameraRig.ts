import * as THREE from 'three/webgpu';
import { CAMERA_DEFAULTS } from '../config';
import type { Settings } from '../settings';

const DEG = Math.PI / 180;

/** Horizontal FOV (what FPV pilots talk about) -> Three.js vertical FOV for a given aspect ratio. */
export function verticalFovDeg(horizontalDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((horizontalDeg * DEG) / 2) / aspect)) / DEG;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Class-specific uptilt that replaces the user setting (wings, ADR-0013). */
  uptiltOverride: number | null = null;
  private readonly uptilt = new THREE.Quaternion();
  private readonly xAxis = new THREE.Vector3(1, 0, 0);
  private readonly offset = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private chaseInitialized = false;

  constructor(private readonly settings: Settings) {
    this.camera = new THREE.PerspectiveCamera(90, 1, CAMERA_DEFAULTS.near, CAMERA_DEFAULTS.far);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.applyFov();
  }

  applyFov(): void {
    const h = this.settings.camera.view === 'fpv' ? this.settings.camera.fovHorizontalDeg : 100;
    this.camera.fov = verticalFovDeg(h, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  /** Ride a missile (ADR-0025): look straight out of its nose, from just behind the tip. */
  updateMissile(pos: THREE.Vector3, rot: THREE.Quaternion): void {
    const cam = this.camera;
    this.chaseInitialized = false;
    cam.quaternion.copy(rot);
    this.offset.set(0, 0, -0.4).applyQuaternion(rot);
    cam.position.copy(pos).add(this.offset);
  }

  /** Place the camera from the interpolated drone pose. */
  update(pos: THREE.Vector3, rot: THREE.Quaternion, dt: number): void {
    const cam = this.camera;
    if (this.settings.camera.view === 'fpv') {
      this.chaseInitialized = false;
      this.uptilt.setFromAxisAngle(this.xAxis, (this.uptiltOverride ?? this.settings.camera.uptiltDeg) * DEG);
      cam.quaternion.copy(rot).multiply(this.uptilt);
      this.offset.set(0, 0.03, -0.05).applyQuaternion(rot);
      cam.position.copy(pos).add(this.offset);
      return;
    }

    // Chase: behind the quad along its heading, ignoring pitch and roll so the view stays readable.
    this.forward.set(0, 0, -1).applyQuaternion(rot);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.target
      .copy(pos)
      .addScaledVector(this.forward, -CAMERA_DEFAULTS.chaseDistance)
      .add(this.offset.set(0, CAMERA_DEFAULTS.chaseHeight, 0));
    if (!this.chaseInitialized) {
      cam.position.copy(this.target);
      this.chaseInitialized = true;
    } else {
      cam.position.lerp(this.target, 1 - Math.exp(-dt * 10));
    }
    cam.lookAt(pos);
  }
}
