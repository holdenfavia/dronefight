import { describe, expect, it } from 'vitest';
import { botInput, createBot } from './bot.js';
import { MATCH } from './config.js';
import { FIGHTER_IDS, FIGHTERS } from './fighters.js';
import { createWorld, knockback, NO_INPUT, step, type Input, type World } from './sim.js';
import { STAGE_IDS } from './stages.js';

function skipCountdown(world: World): void {
  for (let i = 0; i < MATCH.countdownFrames; i++) step(world, []);
}

function run(world: World, frames: number, inputs: (frame: number) => Input[] = () => []): void {
  for (let i = 0; i < frames; i++) step(world, inputs(i));
}

describe('fighter sim', () => {
  it('nobody moves during the countdown', () => {
    const w = createWorld('rooftop', [{ id: 'freestyle' }, { id: 'racer' }]);
    const x = w.fighters[0]!.x;
    run(w, 60, () => [{ ...NO_INPUT, right: true }]);
    expect(w.fighters[0]!.x).toBe(x);
  });

  it('walks, jumps and lands back on the stage', () => {
    const w = createWorld('rooftop', [{ id: 'freestyle' }, { id: 'racer' }]);
    skipCountdown(w);
    const f = w.fighters[0]!;
    const x0 = f.x;
    run(w, 20, () => [{ ...NO_INPUT, right: true }]);
    expect(f.x).toBeGreaterThan(x0 + 50);
    run(w, 2, (i) => [{ ...NO_INPUT, up: i === 0 }]);
    run(w, 10, () => [{ ...NO_INPUT, up: true }]);
    expect(f.grounded).toBe(false);
    expect(f.y).toBeGreaterThan(50);
    run(w, 90);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);
  });

  it('knockback grows with damage and shrinks with weight', () => {
    expect(knockback(100, 12, 100, 30, 100)).toBeGreaterThan(knockback(20, 12, 100, 30, 100));
    expect(knockback(100, 12, 140, 30, 100)).toBeLessThan(knockback(100, 12, 74, 30, 100));
  });

  it('a forward tilt at high percent launches off the stage and takes a stock', () => {
    const w = createWorld('helipad', [{ id: 'freestyle' }, { id: 'freestyle' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 300; a!.facing = 1;
    b!.x = 345; b!.percent = 140;
    run(w, 2, (i) => [{ ...NO_INPUT, attack: i === 0 }]);
    run(w, 240);
    expect(b!.stocks).toBe(MATCH.defaultStocks - 1);
    expect(a!.stats.kos).toBe(1);
  });

  it('the same forward tilt at low percent does not KO', () => {
    const w = createWorld('helipad', [{ id: 'freestyle' }, { id: 'freestyle' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45; b!.percent = 10;
    run(w, 240, (i) => [{ ...NO_INPUT, attack: i === 0 }]);
    expect(b!.percent).toBeGreaterThan(10);
    expect(b!.stocks).toBe(MATCH.defaultStocks);
  });

  it('a shield blocks damage', () => {
    const w = createWorld('helipad', [{ id: 'freestyle' }, { id: 'freestyle' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45;
    run(w, 30, (i) => [{ ...NO_INPUT, attack: i === 2 }, { ...NO_INPUT, shield: true }]);
    expect(b!.percent).toBe(0);
    expect(b!.shieldHp).toBeLessThan(50);
  });

  it('every drone can recover from off the side with jumps and specials', () => {
    for (const id of FIGHTER_IDS) {
      const w = createWorld('helipad', [{ id }, { id: 'freestyle' }]);
      skipCountdown(w);
      const f = w.fighters[0]!;
      f.x = 640; f.y = -60; f.grounded = false; f.action = 'air';
      // Hold left; jump whenever falling; side special, then up special.
      let phase = 0;
      run(w, 300, (i) => {
        const input = { ...NO_INPUT, left: true };
        if (f.grounded) return [NO_INPUT];
        const falling = f.vy < 0;
        if (falling && f.airJumpsLeft > 0 && i % 2 === 0) input.up = true;
        else if (falling && phase === 0 && f.airJumpsLeft === 0) { input.special = true; phase = 1; }
        else if (falling && phase === 1 && i % 2 === 0) { input.up = true; input.special = true; phase = 2; }
        return [input];
      });
      expect(f.stocks, `${FIGHTERS[id].name} fell`).toBe(MATCH.defaultStocks);
      expect(f.grounded, `${FIGHTERS[id].name} did not land`).toBe(true);
    }
  });

  it('bots finish a match on every stage', () => {
    for (const stage of STAGE_IDS) {
      const w = createWorld(stage, [{ id: 'freestyle' }, { id: 'racer' }, { id: 'heavy' }, { id: 'flipper' }], 2, 7);
      const bots = w.fighters.map((f) => createBot(f.slot, 3, 7));
      let frames = 0;
      while (!w.over && frames < 60 * 60 * 6) {
        step(w, bots.map((b) => botInput(b, w)));
        frames++;
      }
      expect(w.over, `${stage}: no winner after ${frames} frames`).toBe(true);
    }
  });

  it('is deterministic: the same inputs give the same match', () => {
    const play = () => {
      const w = createWorld('rooftop', [{ id: 'freestyle' }, { id: 'heavy' }], 3, 42);
      const bots = w.fighters.map((f) => createBot(f.slot, 2, 42));
      for (let i = 0; i < 3000; i++) step(w, bots.map((b) => botInput(b, w)));
      return w.fighters.map((f) => [f.x, f.y, f.percent, f.stocks]);
    };
    expect(play()).toEqual(play());
  });
});
