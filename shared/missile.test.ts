import { describe, expect, it } from 'vitest';
import { buildColliders } from './raycast.js';
import { launchMissile, MISSILE, missileImpact, stepMissile, type AimRay } from './missile.js';

const dt = 1 / 120;

function fly(aim: (t: number) => AimRay | null, seconds: number) {
  const m = launchMissile([0, 20, 0], [0, 0, -1]);
  let alive = true;
  let maxRange = 0;
  for (let t = 0; t < seconds && alive; t += dt) {
    alive = stepMissile(m, aim(t), dt);
    maxRange = Math.max(maxRange, Math.hypot(m.p[0], m.p[2]));
  }
  return { m, alive, maxRange };
}

describe('guided missile (ADR-0016)', () => {
  it('self-destructs at its lifetime', () => {
    const { alive, m } = fly(() => null, 10);
    expect(alive).toBe(false);
    expect(m.age).toBeCloseTo(MISSILE.lifetimeSeconds, 1);
  });

  it('cannot reach across the map: total reach stays under 360 m', () => {
    const { maxRange } = fly(() => null, 10);
    expect(maxRange).toBeGreaterThan(MISSILE.speed * MISSILE.boostSeconds * 0.95);
    expect(maxRange).toBeLessThan(360);
  });

  it('loses speed and drops after the motor burns out', () => {
    const { m } = fly(() => null, MISSILE.boostSeconds + 1.5);
    expect(Math.hypot(...m.v)).toBeLessThan(MISSILE.speed * 0.6);
    expect(m.v[1]).toBeLessThan(-5);
  });

  it('follows the line of sight: turn the crosshair and the missile flies back onto it', () => {
    // Shooter at the launch point looks forward for 0.3 s, then turns 90° to look right (+X).
    const aim = (t: number): AimRay => ({ o: [0, 20, 0], d: t < 0.3 ? [0, 0, -1] : [1, 0, 0] });
    // A 90° snap at 95 m/s takes about 2 s to swing back onto the line (turn radius ~50 m).
    const { m } = fly(aim, 2.45);
    // Distance from the missile to the new line of sight (the +X axis through the shooter).
    const offLine = Math.hypot(m.p[1] - 20, m.p[2]);
    expect(offLine).toBeLessThan(5);
    expect(m.p[0]).toBeGreaterThan(20);
  });

  it('turns no faster than its turn rate', () => {
    const m = launchMissile([0, 20, 0], [0, 0, -1]);
    stepMissile(m, { o: [0, 20, 0], d: [0, 0, 1] }, 0.1); // demand a 180° turn
    const turned = (Math.acos(-m.v[2] / Math.hypot(...m.v)) * 180) / Math.PI;
    expect(turned).toBeLessThanOrEqual(MISSILE.turnRateDeg * 0.1 + 0.5);
  });
});

describe('missileImpact (shared by server and prediction)', () => {
  const wall = buildColliders([{ pos: [0, 5, -50], size: [20, 10, 1], mat: 'concrete' }]);

  it('regression: open air is NOT an impact (the missile used to explode on launch)', () => {
    expect(missileImpact([0, 5, 0], [0, 5, -1], wall, [])).toBeNull();
    expect(missileImpact([0, 5, 0], [0, 5, -1], [], [])).toBeNull();
  });

  it('hits geometry at the right point', () => {
    const f = missileImpact([0, 5, -45], [0, 5, -55], wall, []);
    expect(f).not.toBeNull();
    expect(f!).toBeCloseTo(0.45, 1);
  });

  it('proximity fuse trips within range and not beyond', () => {
    expect(missileImpact([0, 5, 0], [0, 5, -10], [], [[2, 5, -5]])).toBeCloseTo(0.5, 2);
    expect(missileImpact([0, 5, 0], [0, 5, -10], [], [[MISSILE.proximity + 0.5, 5, -5]])).toBeNull();
  });

  it('never fuses on a drone that is not in the target list (the shooter)', () => {
    // The shooter sits right on the launch point but is never passed as a target.
    expect(missileImpact([0, 5, 0], [0, 5, -1], [], [])).toBeNull();
  });
});
