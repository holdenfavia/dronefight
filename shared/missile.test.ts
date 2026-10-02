import { describe, expect, it } from 'vitest';
import { buildColliders } from './raycast.js';
import { DRONE_CLASSES } from './drones.js';
import { launchMissile, MISSILE, MISSILE_MAX_AGE, missileImpact, quatRotate, splashDamage, stepMissile, type MissileInput } from './missile.js';

const dt = 1 / 120;
const sticks = (throttle: number, more: Partial<MissileInput> = {}): MissileInput => ({ throttle, roll: 0, pitch: 0, yaw: 0, ...more });

/** Fly a missile launched level along -Z from 20 m up, with input(t), until it ends or `seconds` pass. */
function fly(input: (t: number) => MissileInput, seconds: number) {
  const m = launchMissile([0, 20, 0], [0, 0, -1]);
  let alive = true;
  let t = 0;
  while (alive && t < seconds) {
    alive = stepMissile(m, input(t), dt);
    t += dt;
  }
  return { m, alive, t };
}

const speed = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('piloted missile (ADR-0025)', () => {
  it('throttle sets the speed: ~120 m/s at full, ~60 at idle', () => {
    expect(speed(fly(() => sticks(1), 4).m.v)).toBeGreaterThan(105);
    expect(speed(fly(() => sticks(1), 4).m.v)).toBeLessThanOrEqual(MISSILE.maxSpeed);
    const idle = speed(fly(() => sticks(0), 4).m.v);
    expect(idle).toBeGreaterThan(50);
    expect(idle).toBeLessThan(70);
  });

  it('fuel lasts ~6 s at full throttle, then it glides and self-destructs', () => {
    const { t, m } = fly(() => sticks(1), 20);
    expect(m.burnout).toBeCloseTo(MISSILE.fuelSeconds, 1);
    expect(t).toBeCloseTo(MISSILE.fuelSeconds + MISSILE.glideSeconds, 1);
  });

  it('flying slow saves fuel, but it never flies longer than the cap', () => {
    const { t } = fly(() => sticks(0), 60);
    expect(t).toBeGreaterThan(MISSILE.fuelSeconds + MISSILE.glideSeconds + 1);
    expect(t).toBeLessThanOrEqual(MISSILE_MAX_AGE + dt);
  });

  it('pulling back pitches the nose up and the flight path follows', () => {
    const { m } = fly(() => sticks(1, { pitch: -1 }), 0.4);
    expect(quatRotate(m.q, [0, 0, -1])[1]).toBeGreaterThan(0.6);
    expect(m.v[1]).toBeGreaterThan(30);
  });

  it('thrust vectoring: more throttle turns harder', () => {
    const heading = (throttle: number) => {
      const { m } = fly(() => sticks(throttle, { yaw: 1 }), 0.5);
      return Math.abs(Math.atan2(m.v[0], -m.v[2]));
    };
    expect(heading(1)).toBeGreaterThan(heading(0) * 1.8);
  });

  it('after burnout gravity pulls it down', () => {
    const { m } = fly(() => sticks(1), MISSILE.fuelSeconds + 1);
    expect(m.burnout).not.toBeNull();
    expect(m.v[1]).toBeLessThan(-2);
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

describe('one-shot kill (ADR-0018)', () => {
  it('the proximity fuse trips inside the lethal radius, so a fused missile always kills', () => {
    expect(MISSILE.proximity).toBeLessThan(MISSILE.lethalRadius);
  });

  it('is lethal to every class within the lethal radius', () => {
    for (const cls of Object.values(DRONE_CLASSES)) {
      expect(splashDamage(0)).toBeGreaterThanOrEqual(cls.maxHp);
      expect(splashDamage(MISSILE.lethalRadius)).toBeGreaterThanOrEqual(cls.maxHp);
    }
  });

  it('falls off to nothing past the lethal radius', () => {
    const edge = splashDamage(MISSILE.lethalRadius + 0.01);
    expect(edge).toBeLessThanOrEqual(MISSILE.damage);
    expect(splashDamage((MISSILE.lethalRadius + MISSILE.splashRadius) / 2)).toBeLessThan(edge);
    expect(splashDamage(MISSILE.splashRadius)).toBe(0);
  });
});
