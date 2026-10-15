import { describe, expect, it } from 'vitest';
import { TRAINING_ZONE as BOT_ZONE, trainingBots as createTrainingBots, stepBot, type Bot } from './bots.js';

const len = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);

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
    expect(Math.hypot(b.pos[0] - b.home[0], b.pos[1] - b.home[1], b.pos[2] - b.home[2])).toBeLessThan(0.5);
  });

  it('path bots move at about their set speed and stay near their path', () => {
    for (const b of of('path')) {
      let maxOff = 0;
      run(b, 20, false, () => {
        maxOff = Math.max(maxOff, Math.hypot(b.pos[0] - b.path!.center[0], b.pos[2] - b.path!.center[2]));
      });
      expect(len(b.vel)).toBeGreaterThan(b.path!.speed * 0.3);
      expect(maxOff).toBeLessThanOrEqual(b.path!.size + 0.01);
    }
  });

  it('random and evasive bots keep moving and stay in their zone', () => {
    for (const b of [...of('random'), ...of('evasive')]) {
      let inZone = true;
      run(b, 60, false, () => {
        const z = BOT_ZONE;
        inZone &&= b.pos[0] >= z.minX && b.pos[0] <= z.maxX && b.pos[1] >= z.minY && b.pos[1] <= z.maxY && b.pos[2] >= z.minZ && b.pos[2] <= z.maxZ;
      });
      expect(inZone).toBe(true);
      expect(len(b.vel)).toBeGreaterThan(3);
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
