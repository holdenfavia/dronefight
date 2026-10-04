import * as THREE from 'three/webgpu';
import type { Loadout } from '../../../shared/loadout';
import { createClassModel, setDronePropColor } from './droneModel';
import { droneClass } from '../../../shared/drones';

/**
 * Live 3D preview for the Loadout screen (ADR-0033): your build spinning on a glowing turntable on the right
 * of the screen, with numbered badges on each hardpoint (1-4, matching the corner it fires from). It's its
 * own little scene drawn over the paused game view, so it never clips into walls wherever you stopped.
 */
/** How far in front of the preview camera the stage stands (m). */
const DIST = 15;

export class LoadoutPreview {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly stage = new THREE.Group();
  private model: THREE.Group | null = null;
  private key = '';
  private spin = 0;
  private active = false;
  private readonly badges = new Map<number, THREE.SpriteMaterial>();
  private halfWidth = 8;
  private halfHeight = 4;

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5a5f66', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(-4, 8, 6);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#9fd3ff', 1.2);
    rim.position.set(5, 2, -8);
    this.scene.add(rim);
    // Turntable: a dark disc with a glowing orange ring.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.2, 48), new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.6, metalness: 0.4 }));
    disc.position.y = -1.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.05, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff6a13', toneMapped: false }));
    ring.position.y = -1.19;
    this.stage.add(disc, ring);
    this.scene.add(this.stage);
  }

  /**
   * Show `loadout` (or nothing, with null) in the pilot's color, centered on `anchor` (normalized screen
   * coords, -1..1). Rebuilds only when the build changes.
   */
  update(loadout: Loadout | null, color: string, dt: number, anchor: { x: number; y: number } | null = null): void {
    this.active = !!loadout;
    if (!loadout) return;
    if (anchor) this.stage.position.set(anchor.x * this.halfWidth, anchor.y * this.halfHeight - 0.6, -DIST);
    const key = `${loadout.body}:${loadout.weapons.join(',')}:${loadout.special ?? ''}:${loadout.propeller}`;
    if (key !== this.key) {
      if (this.model) this.stage.remove(this.model);
      this.model = createClassModel(loadout.body, color, loadout);
      // Sized against the 5" so bodies keep their relative size (ADR-0036), compressed (square root) so a
      // racer is still visible and an X8 still fits the turntable.
      const ref = droneClass('freestyle').hitRadius;
      this.model.scale.multiplyScalar(1.45 / ref / Math.sqrt(droneClass(loadout.body).hitRadius / ref));
      this.model.position.y = 0.1;
      this.addBadges(this.model);
      this.stage.add(this.model);
      this.key = key;
    }
    if (this.model) setDronePropColor(this.model, color);
    this.spin += dt * 0.6;
    this.stage.rotation.y = this.spin;
    // Tip it toward you so you see the top, rocking now and then to show the weapons underneath.
    if (this.model) this.model.rotation.x = 0.3 + 0.25 * Math.sin(this.spin * 0.8);
  }

  /** Draw over the frame already rendered. */
  render(renderer: THREE.WebGPURenderer): void {
    if (!this.active) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // The stage sits in the right part of the screen, beside the Loadout panel.
    this.halfHeight = DIST * Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.halfWidth = this.halfHeight * aspect;
    this.stage.position.set(this.halfWidth * 0.48, 0, -DIST);
  }

  /** Numbered badges under each mounted weapon (1 upper left … 4 lower right on screen). */
  private addBadges(model: THREE.Group): void {
    const weapons = (model.userData.weaponMounts as THREE.Object3D[] | undefined) ?? [];
    weapons.forEach((mount) => {
      const sprite = new THREE.Sprite(this.badge((mount.userData.slot as number | undefined) ?? 0));
      // Mounts are in the model's real-size units; the badge hangs just below the weapon.
      sprite.position.set(0, -0.045, 0.015);
      sprite.scale.setScalar(0.035);
      mount.add(sprite);
    });
  }

  private badge(slot: number): THREE.SpriteMaterial {
    const cached = this.badges.get(slot);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ff6a13';
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#111';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 38px Barlow Condensed, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(slot + 1), 32, 34);
    }
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, toneMapped: false });
    this.badges.set(slot, mat);
    return mat;
  }
}
