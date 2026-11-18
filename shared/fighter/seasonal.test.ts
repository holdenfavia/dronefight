// The Thanksgiving fighters' signature mechanics and the Harvest Farm (ADR-0082).
import { describe, expect, it } from 'vitest';
import { createBot, botInput } from './bot.js';
import { MATCH, SIGNATURE } from './config.js';
import type { FighterId } from './fighters.js';
import { createWorld, NO_INPUT, step, type Input, type World } from './sim.js';
import { signatureGauge, SISTERS } from './signature.js';
import { STAGES } from './stages.js';

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

describe('Thanksgiving fighters (ADR-0082)', () => {
  it('each has a signature meter', () => {
    for (const id of ['turkey', 'pilgrim', 'firstlight'] as const) {
      const w = createWorld('harvest', [{ id }, { id: 'brawler' }]);
      expect(signatureGauge(w, w.fighters[0]!)?.label, id).toBeTruthy();
    }
  });

  it('Turkey: hits fill the Gobble meter; full, Gobble becomes Thunder Gobble', () => {
    const w = duel('turkey', 'brawler', 40);
    const t = w.fighters[0]!;
    run(w, 30, tap({ aimRight: true, attack: true }));
    expect(t.meter).toBeGreaterThan(0);
    t.meter = SIGNATURE.gobble.max;
    run(w, 60, tap({ aimDown: true, special: true }));
    expect(t.meter).toBe(0);
    expect(w.fighters[1]!.percent).toBeGreaterThan(10);
  });

  it('Pilgrim: one shot then a reload; a full harvest fires the Harvest Cannon', () => {
    const w = duel('pilgrim', 'titan', 300);
    const p = w.fighters[0]!;
    run(w, 40, tap({ aimRight: true, special: true }));
    expect(p.ammo).toBe(0);
    const plain = w.fighters[1]!.percent;
    expect(plain).toBeGreaterThan(0);
    run(w, 3, tap({ aimRight: true, special: true }));
    expect(p.move).toBe('reload');
    run(w, 60);
    expect(p.ammo).toBe(1);
    w.fighters[1]!.percent = 0;
    w.fighters[1]!.x = 300;
    p.x = 0;
    p.meter = SIGNATURE.harvest.max;
    run(w, 40, tap({ aimRight: true, special: true }));
    expect(p.meter).toBe(0);
    expect(w.fighters[1]!.percent).toBeGreaterThan(plain * 1.8);
  });

  it('Pilgrim: a landed throw gathers a sheaf', () => {
    const w = duel('pilgrim', 'brawler', 30);
    run(w, 30, tap({ grab: true }));
    run(w, 40, tap({ aimRight: true }));
    expect(w.fighters[0]!.meter).toBe(1);
  });

  it('First Light: ground, air and special hits grow the Three Sisters; all three make the next smash a Tidal Sweep', () => {
    const w = duel('firstlight', 'titan', 50);
    const f = w.fighters[0]!;
    run(w, 30, tap({ aimRight: true, attack: true }));
    expect(f.meter & SISTERS.corn).toBeTruthy();
    expect(f.meter & SISTERS.beans).toBe(0);
    // A plain smash, then the same smash with all three.
    w.fighters[1]!.percent = 0;
    f.meter = 0;
    run(w, 70, tap({ aimRight: true, attack: true, smash: true }));
    const plain = w.fighters[1]!.percent;
    expect(plain).toBeGreaterThan(0);
    const w2 = duel('firstlight', 'titan', 50);
    w2.fighters[0]!.meter = SISTERS.all;
    run(w2, 70, tap({ aimRight: true, attack: true, smash: true }));
    expect(w2.fighters[0]!.meter).toBe(0);
    expect(w2.fighters[1]!.percent).toBeGreaterThan(plain * 1.2);
  });
});

describe('Harvest Farm (ADR-0082): on the ground', () => {
  it('the floor runs past both side blast zones, so nobody falls out the bottom', () => {
    const st = STAGES.harvest;
    const floor = st.platforms[0]!;
    expect(floor.x1).toBeLessThan(st.blast.left);
    expect(floor.x2).toBeGreaterThan(st.blast.right);
    expect(floor.solid).toBe(true);
  });

  it('fast-falling and running about never goes under the floor', () => {
    const w = createWorld('harvest', [{ id: 'titan' }, { id: 'turkey' }]);
    skipCountdown(w);
    run(w, 600, (i) => [{ ...NO_INPUT, down: true, left: i % 200 < 100, right: i % 200 >= 100, up: i % 40 === 0 }, NO_INPUT]);
    for (const f of w.fighters) {
      expect(f.y).toBeGreaterThanOrEqual(-1);
      expect(f.stocks).toBe(MATCH.defaultStocks);
    }
  });

  it('bots finish a match there with the Thanksgiving fighters', () => {
    const w = createWorld('harvest', [{ id: 'turkey' }, { id: 'pilgrim' }, { id: 'firstlight' }, { id: 'brawler' }], 2, 11);
    const bots = w.fighters.map((f) => createBot(f.slot, 3, 11));
    let frames = 0;
    while (!w.over && frames < 60 * 60 * 6) {
      step(w, bots.map((b) => botInput(b, w)));
      frames++;
    }
    expect(w.over, `no winner after ${frames} frames`).toBe(true);
  });
});
