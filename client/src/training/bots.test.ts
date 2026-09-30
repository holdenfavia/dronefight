import { describe, expect, it } from 'vitest';
import { BOT_ZONE, createTrainingBots, stepBot, type Bot } from './bots';

const dt = 1 / 60;

function run(bot: Bot, seconds: number, aimedAt = false, onStep?: () => void) {
  for (let i = 0; i < seconds / dt; i++) {
    stepBot(bot, dt, aimedAt);
    onStep?.();
  }
}

describe('training bots (ADR-0017)', () => {
  const bots = createTrainingBots();
  const of = (kind: Bot['kind']) => bots.filter((b) => b.kind === kind);

  it('has every kind', () => {
    for (const kind of ['stationary', 'path', 'random', 'evasive'] as const) expect(of(kind).length).toBeGreaterThan(0);
  });

  it('stationary bots stay put', () => {
    const b = of('stationary')[0]!;
    run(b, 10);
    expect(b.pos.distanceTo(b.home)).toBeLessThan(0.5);
  });

  it('path bots move at about their set speed and stay near their path', () => {
    for (const b of of('path')) {
      let maxOff = 0;
      run(b, 20, false, () => {
        maxOff = Math.max(maxOff, Math.hypot(b.pos.x - b.path!.center.x, b.pos.z - b.path!.center.z));
      });
      expect(b.vel.length()).toBeGreaterThan(b.path!.speed * 0.3);
      expect(maxOff).toBeLessThanOrEqual(b.path!.size + 0.01);
    }
  });

  it('random and evasive bots keep moving and stay in their zone', () => {
    for (const b of [...of('random'), ...of('evasive')]) {
      let inZone = true;
      run(b, 60, false, () => {
        const z = BOT_ZONE;
        inZone &&= b.pos.x >= z.minX && b.pos.x <= z.maxX && b.pos.y >= z.minY && b.pos.y <= z.maxY && b.pos.z >= z.minZ && b.pos.z <= z.maxZ;
      });
      expect(inZone).toBe(true);
      expect(b.vel.length()).toBeGreaterThan(3);
    }
  });

  it('evasive bots jink more often while being aimed at', () => {
    const countJinks = (aimed: boolean) => {
      const b = createTrainingBots().find((x) => x.kind === 'evasive')!;
      let jinks = 0;
      let last = b.nextJink;
      run(b, 30, aimed, () => {
        if (b.nextJink !== last) {
          jinks++;
          last = b.nextJink;
        }
      });
      return jinks;
    };
    expect(countJinks(true)).toBeGreaterThan(countJinks(false) * 1.5);
  });
});
