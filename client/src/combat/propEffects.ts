// What a destructible prop looks and sounds like when it goes (ADR-0023): water tanks burst into spray,
// everything else explodes into fire and smoke. The server decides when; this only draws it.

import * as THREE from 'three/webgpu';
import { PROP_STATS, type PropKind } from '../../../shared/props';
import type { V3 } from '../../../shared/maps/movers';
import type { Sfx } from '../audio/sfx';
import type { Particles } from '../render/particles';
import type { Missiles } from './effects';

export class PropEffects {
  private readonly point = new THREE.Vector3();

  constructor(
    private readonly particles: Particles,
    private readonly sfx: Sfx,
    private readonly missiles: Missiles,
  ) {}

  blast(kind: PropKind, p: V3): void {
    const { particles } = this;
    this.point.set(p[0], p[1], p[2]);
    const rnd = (k: number) => (Math.random() - 0.5) * k;
    if (PROP_STATS[kind].effect === 'water') {
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        particles.emit(p[0], p[1], p[2], { startSize: 0.5, endSize: 1.8, lifeMs: 900 + Math.random() * 700, color: k % 3 ? '#9fd3ff' : '#eef8ff', alpha: 0.85, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 6, vz: Math.sin(a) * sp });
      }
      this.sfx.splash(this.point);
      return;
    }
    this.missiles.effect(this.point);
    for (let k = 0; k < 18; k++) {
      particles.emit(p[0] + rnd(1.5), p[1] + rnd(1), p[2] + rnd(1.5), { startSize: 1, endSize: 2.6, lifeMs: 500 + Math.random() * 400, color: k % 2 ? '#ff9a2e' : '#ffd25a', alpha: 0.95, vx: rnd(6), vy: 3 + Math.random() * 5, vz: rnd(6) });
    }
    for (let k = 0; k < 8; k++) {
      particles.emit(p[0] + rnd(2), p[1] + 1, p[2] + rnd(2), { startSize: 1.5, endSize: 5, lifeMs: 3500 + Math.random() * 1500, color: '#3a3632', alpha: 0.7, vx: rnd(1), vy: 1.5 + Math.random(), vz: rnd(1) });
    }
    this.sfx.explosion(this.point);
  }

  /** Sparks where our round hits a prop, once the round gets there. */
  roundHit(at: { x: number; y: number; z: number }, travelMs: number): void {
    const { x, y, z } = at;
    window.setTimeout(() => {
      for (let k = 0; k < 3; k++) {
        this.particles.emit(x, y, z, { startSize: 0.15, endSize: 0.45, lifeMs: 260, color: '#ffd27a', alpha: 1, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6 });
      }
    }, travelMs);
  }
}
