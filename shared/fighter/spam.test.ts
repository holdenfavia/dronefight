import { describe, expect, it } from 'vitest';
import { MATCH, SPECIAL_SPAM } from './config.js';
import type { FighterId } from './fighters.js';
import { createWorld, NO_INPUT, step, type Input, type World } from './sim.js';

function skipCountdown(world: World): void {
  for (let i = 0; i < MATCH.countdownFrames; i++) step(world, []);
}

function run(world: World, frames: number, inputs: (frame: number) => Input[] = () => []): void {
  for (let i = 0; i < frames; i++) step(world, inputs(i));
}

function duel(a: FighterId, b: FighterId, gap: number): World {
  const w = createWorld('helipad', [{ id: a }, { id: b }]);
  skipCountdown(w);
  const [f, g] = w.fighters;
  f!.x = 0; f!.facing = 1;
  g!.x = gap; g!.facing = -1;
  return w;
}

const tap = (keys: Partial<Input>) => (i: number): Input[] => [i === 0 ? { ...NO_INPUT, ...keys } : NO_INPUT];
const SIDE_SPECIAL = { right: true, aimRight: true, special: true };
const NEUTRAL_SPECIAL = { aimRight: true, special: true };

describe('special spam (ADR-0085)', () => {
  it('the third use of the same special in a row is spammed; a pause resets it', () => {
    const w = duel('brawler', 'titan', 1000);
    const a = w.fighters[0]!;
    const flags: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      run(w, 1, tap(SIDE_SPECIAL));
      expect(a.move).toBe('sspecial');
      flags.push(a.moveSpam);
      run(w, 60);
      a.x = 0; a.vx = 0;
    }
    expect(flags).toEqual([false, false, true, true]);
    run(w, SPECIAL_SPAM.windowFrames + 5);
    run(w, 1, tap(SIDE_SPECIAL));
    expect(a.moveSpam).toBe(false);
  });

  it('a different special or a normal attack in between does not count toward the same special', () => {
    const w = duel('brawler', 'titan', 1000);
    const a = w.fighters[0]!;
    run(w, 1, tap(SIDE_SPECIAL)); run(w, 60); a.x = 0;
    run(w, 1, tap(SIDE_SPECIAL)); run(w, 60); a.x = 0;
    run(w, 1, tap(NEUTRAL_SPECIAL));
    expect(a.move).toBe('nspecial');
    expect(a.moveSpam).toBe(false);
    run(w, 70);
    run(w, 1, tap({ aimRight: true, attack: true }));
    expect(a.moveSpam).toBe(false);
  });

  it('a spammed hit does half damage rounded down, no knockback and no hitstun', () => {
    const hit = (spammed: boolean) => {
      const w = duel('brawler', 'brawler', 70);
      const [a, b] = w.fighters;
      b!.percent = 60;
      if (spammed) { a!.spamKey = 'sspecial'; a!.spamCount = SPECIAL_SPAM.fromUse - 1; a!.spamFrame = w.frame; }
      let launched = false;
      run(w, 40, (i) => { if (b!.action === 'hitstun') launched = true; return tap(SIDE_SPECIAL)(i); });
      return { dmg: b!.percent - 60, launched, lx: b!.lx };
    };
    const normal = hit(false);
    const spam = hit(true);
    expect(normal.dmg).toBeGreaterThan(0);
    expect(normal.launched).toBe(true);
    expect(spam.launched).toBe(false);
    expect(spam.lx).toBe(0);
    expect(spam.dmg).toBeGreaterThan(0);
    expect(spam.dmg).toBeLessThanOrEqual(Math.floor(normal.dmg / 2) + 1);
    expect(Number.isInteger(spam.dmg)).toBe(true);
  });

  it("Gunslinger's six-shooter is not spam (its ammo already limits it)", () => {
    const w = duel('gunslinger', 'titan', 1000);
    const a = w.fighters[0]!;
    for (let i = 0; i < 4; i++) {
      run(w, 1, tap(NEUTRAL_SPECIAL));
      expect(a.moveSpam).toBe(false);
      run(w, 40);
    }
  });
});
