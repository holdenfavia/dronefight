import * as THREE from 'three/webgpu';
import type { WeaponId } from '../../../shared/weapons';

/**
 * Rounds in flight (ADR-0009): purely visual, the server decides hits. Each weapon has its own look so you
 * can tell what's shooting at you (ADR-0033): a bright core in the weapon's color inside a soft glow in the
 * shooter's pilot color, so you can also tell who. Two instanced meshes (core + glow): two draw calls for
 * every round on screen (Hard rule 2).
 */

const CAPACITY = 1024;
/**
 * Rounds are drawn from just ahead of the muzzle, so yours visibly leave their own corner of the screen
 * (ADR-0033). They taper (thin tail, full-width head) so the part near your eye stays a fine line.
 */
const NEAR = 0.3;
/** Tail width as a fraction of the head's. */
const TAPER = 0.08;

/** How a weapon's rounds look. `beam` draws the whole path at once and fades (rail gun). */
interface ProjectileStyle {
  /** Visible streak length (m). */
  streak: number;
  /** Core and glow thickness (m). */
  core: number;
  glow: number;
  /** Core color (the weapon's signature). */
  color: string;
  beam?: { fadeMs: number };
}

/** Weapons that fire rounds (missiles and grenades are their own objects). */
export type RoundWeapon = Exclude<WeaponId, 'missile' | 'grenade'>;

export const PROJECTILE_STYLES: Record<RoundWeapon, ProjectileStyle> = {
  // Classic white-hot tracer.
  gun: { streak: 4, core: 0.07, glow: 0.22, color: '#fff3c4' },
  // Short, chunky yellow bolts in threes.
  burst: { streak: 1.8, core: 0.14, glow: 0.34, color: '#ffd23f' },
  // A spray of small orange pellets.
  shotgun: { streak: 0.7, core: 0.1, glow: 0.24, color: '#ff9a3c' },
  // Long, thin red-orange needles.
  cannon: { streak: 7, core: 0.04, glow: 0.14, color: '#ff4a2a' },
  // An instant cyan beam, muzzle to impact, fading out.
  rail: { streak: 0, core: 0.08, glow: 0.28, color: '#c8f7ff', beam: { fadeMs: 380 } },
};

interface Round {
  active: boolean;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  /** performance.now() at spawn. */
  born: number;
  /** Where it stops (first wall, prop or max range). */
  maxDist: number;
  speed: number;
  style: ProjectileStyle;
  /** It stops on something solid (wall, ground, prop), not at max range: show an impact there. */
  impact: boolean;
}

const Z = new THREE.Vector3(0, 0, 1);

export class Tracers {
  private readonly core: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedMesh;
  private readonly pool: Round[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly impactPoint = new THREE.Vector3();
  /** A round struck a surface here: the game draws a little hit marker (sparks). */
  onImpact: ((at: THREE.Vector3, color: string) => void) | null = null;

  constructor(scene: THREE.Scene) {
    // A tapered rod, 1 unit across at the head (+Z) and TAPER at the tail.
    const geo = new THREE.CylinderGeometry(0.5, 0.5 * TAPER, 1, 8).rotateX(Math.PI / 2);
    this.core = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }), CAPACITY);
    this.glow = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false, transparent: true, opacity: 0.55, depthWrite: false }),
      CAPACITY,
    );
    for (const mesh of [this.core, this.glow]) {
      mesh.frustumCulled = false;
      mesh.count = CAPACITY;
      scene.add(mesh);
    }
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({ active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), born: 0, maxDist: 0, speed: 1, style: PROJECTILE_STYLES.gun, impact: false });
      this.core.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.glow.setMatrixAt(i, this.m);
      this.core.setColorAt(i, this.color.set('#ffffff'));
      this.glow.setColorAt(i, this.color);
    }
  }

  /** A round from `weapon`, fired by a pilot of `pilotColor`; `impact` when it ends on something solid. */
  spawn(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, pilotColor: string, speed: number, weapon: RoundWeapon = 'gun', ageMs = 0, impact = false): void {
    const i = this.next;
    this.next = (this.next + 1) % CAPACITY;
    const t = this.pool[i];
    if (!t) return;
    t.active = true;
    t.origin.copy(origin);
    t.dir.copy(dir).normalize();
    t.born = performance.now() - ageMs;
    t.maxDist = maxDist;
    t.speed = speed;
    t.style = PROJECTILE_STYLES[weapon];
    t.impact = impact;
    // Brighter than 1.0 so they read as glowing (tone mapping is off for these materials).
    this.core.setColorAt(i, this.color.set(t.style.color).multiplyScalar(1.8));
    this.glow.setColorAt(i, this.color.set(pilotColor).multiplyScalar(1.4));
    if (this.core.instanceColor) this.core.instanceColor.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  update(): void {
    const now = performance.now();
    for (let i = 0; i < CAPACITY; i++) {
      const t = this.pool[i];
      if (!t || !t.active) continue;
      const age = now - t.born;
      let head: number;
      let tail: number;
      let thin = 1;
      if (t.style.beam) {
        // The whole path at once, thinning as it fades.
        if (age >= t.style.beam.fadeMs) {
          this.hide(i, t);
          continue;
        }
        head = t.maxDist;
        tail = NEAR;
        thin = 1 - age / t.style.beam.fadeMs;
        this.strike(t);
      } else {
        const dist = (age / 1000) * t.speed;
        head = Math.min(dist, t.maxDist);
        if (dist >= t.maxDist) this.strike(t);
        tail = Math.max(NEAR, dist - t.style.streak);
        if (tail >= t.maxDist) {
          this.hide(i, t);
          continue;
        }
      }
      if (head <= tail) {
        // Still inside the first few metres: not drawn yet.
        this.core.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        this.glow.setMatrixAt(i, this.m);
        continue;
      }
      const length = Math.max(0.01, head - tail);
      this.pos.copy(t.origin).addScaledVector(t.dir, (head + tail) / 2);
      this.q.setFromUnitVectors(Z, t.dir);
      this.core.setMatrixAt(i, this.m.compose(this.pos, this.q, this.scale.set(t.style.core * thin, t.style.core * thin, length)));
      this.glow.setMatrixAt(i, this.m.compose(this.pos, this.q, this.scale.set(t.style.glow * thin, t.style.glow * thin, length)));
    }
    this.core.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }

  /** The round reached what it hits: one impact marker, once. */
  private strike(t: Round): void {
    if (!t.impact) return;
    t.impact = false;
    this.onImpact?.(this.impactPoint.copy(t.origin).addScaledVector(t.dir, t.maxDist), t.style.color);
  }

  private hide(i: number, t: Round): void {
    t.active = false;
    this.m.makeScale(0, 0, 0);
    this.core.setMatrixAt(i, this.m);
    this.glow.setMatrixAt(i, this.m);
  }
}
