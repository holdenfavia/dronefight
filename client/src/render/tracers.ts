import * as THREE from 'three/webgpu';
import { COMBAT } from '../../../shared/combat';

/**
 * Tracer rounds (ADR-0009): purely visual. Hits are decided by the server.
 * One InstancedMesh for every round in flight, so it's a single draw call (Hard rule 2).
 */

const CAPACITY = 256;
/** Visible streak length (m). */
const STREAK = 4;

interface Tracer {
  active: boolean;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  /** performance.now() at spawn. */
  born: number;
  /** Where it stops (first wall or max range). */
  maxDist: number;
}

const Z = new THREE.Vector3(0, 0, 1);

export class Tracers {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Tracer[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 1);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.count = CAPACITY;
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({ active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), born: 0, maxDist: 0 });
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.color.set('#ffffff'));
    }
    scene.add(this.mesh);
  }

  spawn(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, color: string, ageMs = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % CAPACITY;
    const t = this.pool[i];
    if (!t) return;
    t.active = true;
    t.origin.copy(origin);
    t.dir.copy(dir).normalize();
    t.born = performance.now() - ageMs;
    t.maxDist = maxDist;
    // Brighter than 1.0 so tracers read as glowing (tone mapping is off for this material).
    this.mesh.setColorAt(i, this.color.set(color).multiplyScalar(1.6));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(): void {
    const now = performance.now();
    for (let i = 0; i < CAPACITY; i++) {
      const t = this.pool[i];
      if (!t || !t.active) continue;
      const dist = ((now - t.born) / 1000) * COMBAT.bulletSpeed;
      const head = Math.min(dist, t.maxDist);
      const tail = Math.max(0, dist - STREAK);
      if (tail >= t.maxDist) {
        t.active = false;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      const length = Math.max(0.01, head - tail);
      this.pos.copy(t.origin).addScaledVector(t.dir, (head + tail) / 2);
      this.q.setFromUnitVectors(Z, t.dir);
      this.m.compose(this.pos, this.q, this.scale.set(1, 1, length));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
