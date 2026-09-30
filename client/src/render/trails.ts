import * as THREE from 'three/webgpu';
import { DRONE_VISUAL } from '../config';

/**
 * Fading flight-path ribbons behind other pilots (ADR-0011). One mesh per pilot, rebuilt in place each
 * frame from a bounded ring of recent positions. Solid team color that fades out via vertex alpha.
 */

const MAX_POINTS = 128;
/** Only record a new point after moving this far (m). */
const MIN_STEP = 0.15;
/** A jump bigger than this is a respawn or snap, not flight: start a new trail. */
const BREAK_DISTANCE = 25;

class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: { p: THREE.Vector3; t: number }[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly base = new THREE.Color();

  constructor() {
    this.positions = new Float32Array(MAX_POINTS * 2 * 3);
    this.colors = new Float32Array(MAX_POINTS * 2 * 4);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(index);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  push(pos: THREE.Vector3, now: number): void {
    const last = this.points[this.points.length - 1];
    if (last) {
      const d = last.p.distanceTo(pos);
      if (d > BREAK_DISTANCE) this.points.length = 0;
      else if (d < MIN_STEP) return;
    }
    const recycled = this.points.length >= MAX_POINTS ? this.points.shift() : undefined;
    const p = recycled?.p ?? new THREE.Vector3();
    this.points.push({ p: p.copy(pos), t: now });
  }

  clear(): void {
    this.points.length = 0;
  }

  update(now: number, camera: THREE.Camera, color: string): void {
    const maxAge = DRONE_VISUAL.trailSeconds * 1000;
    while (this.points.length > 0 && now - (this.points[0]?.t ?? now) > maxAge) this.points.shift();
    const n = this.points.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    this.base.set(color);
    for (let i = 0; i < n; i++) {
      const cur = this.points[i]!;
      const prev = this.points[Math.max(0, i - 1)]!;
      const next = this.points[Math.min(n - 1, i + 1)]!;
      // Ribbon faces the camera: widen perpendicular to both the path and the view direction.
      tangent.subVectors(next.p, prev.p);
      toCam.subVectors(camera.position, cur.p);
      side.crossVectors(tangent, toCam).normalize();
      // Newest end is widest and brightest.
      const life = 1 - (now - cur.t) / maxAge;
      const half = (DRONE_VISUAL.trailWidth / 2) * life;
      const o = i * 6;
      this.positions[o] = cur.p.x + side.x * half;
      this.positions[o + 1] = cur.p.y + side.y * half;
      this.positions[o + 2] = cur.p.z + side.z * half;
      this.positions[o + 3] = cur.p.x - side.x * half;
      this.positions[o + 4] = cur.p.y - side.y * half;
      this.positions[o + 5] = cur.p.z - side.z * half;
      const alpha = life * 0.85;
      const c = i * 8;
      for (let v = 0; v < 2; v++) {
        this.colors[c + v * 4] = this.base.r;
        this.colors[c + v * 4 + 1] = this.base.g;
        this.colors[c + v * 4 + 2] = this.base.b;
        this.colors[c + v * 4 + 3] = alpha;
      }
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}

const tangent = new THREE.Vector3();
const toCam = new THREE.Vector3();
const side = new THREE.Vector3();

export class Trails {
  private readonly trails = new Map<string, Trail>();

  constructor(private readonly scene: THREE.Scene) {}

  /** Record and redraw the trail for each visible pilot; remove trails for pilots who left. */
  update(
    pilots: readonly { id: string; position: THREE.Vector3; team: number | null; crashed: boolean; concealed?: boolean }[],
    camera: THREE.Camera,
    colorFor: (team: number | null) => string,
  ): void {
    const now = performance.now();
    const seen = new Set<string>();
    for (const pilot of pilots) {
      seen.add(pilot.id);
      let trail = this.trails.get(pilot.id);
      if (!trail) {
        trail = new Trail();
        this.trails.set(pilot.id, trail);
        this.scene.add(trail.mesh);
      }
      // Inside smoke the trail stops growing: it leads into the cloud and disappears (ADR-0016).
      if (!pilot.crashed && !pilot.concealed) trail.push(pilot.position, now);
      trail.update(now, camera, colorFor(pilot.team));
    }
    for (const [id, trail] of this.trails) {
      if (seen.has(id)) continue;
      this.scene.remove(trail.mesh);
      trail.mesh.geometry.dispose();
      this.trails.delete(id);
    }
  }
}
