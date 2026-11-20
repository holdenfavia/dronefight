// The Christmas fighters' signature mechanics and the Winter Village (ADR-0091).
import { describe, expect, it } from 'vitest';
import { createBot, botInput } from './bot.js';
import { MATCH, SIGNATURE } from './config.js';
import type { FighterId } from './fighters.js';
import { createWorld, NO_INPUT, step, type Input, type World } from './sim.js';
import { signatureGauge } from './signature.js';

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
const CHRISTMAS: readonly FighterId[] = ['snowman', 'nutcracker', 'elf', 'santa', 'reindeer', 'gingerbread'];

describe('Christmas fighters (ADR-0091)', () => {
  it('each has a signature meter', () => {
    for (const id of CHRISTMAS) {
      const w = createWorld('village', [{ id }, { id: 'brawler' }]);
      expect(signatureGauge(w, w.fighters[0]!)?.label, id).toBeTruthy();
    }
  });

  it('Snowman: a snowball that lands packs snow and slows; a full Snowpack throws an Avalanche', () => {
    const w = duel('snowman', 'titan', 200);
    const s = w.fighters[0]!;
    run(w, 40, tap({ aimRight: true, special: true }));
    expect(s.meter).toBe(1);
    expect(w.fighters[1]!.slowed).toBeGreaterThan(0);
    const plain = w.fighters[1]!.percent;
    w.fighters[1]!.percent = 0;
    w.fighters[1]!.x = 200;
    s.x = 0;
    s.meter = SIGNATURE.snowpack.max;
    run(w, 60, tap({ aimRight: true, special: true }));
    expect(s.meter).toBe(0);
    expect(w.fighters[1]!.percent).toBeGreaterThan(plain * 2);
  });

  it('Nutcracker: marching winds the key; fully wound, the next smash is a Crunch', () => {
    const w = duel('nutcracker', 'titan', 600);
    const n = w.fighters[0]!;
    run(w, 30, () => [{ ...NO_INPUT, right: true }]);
    expect(n.meter).toBeGreaterThan(0);
    const plainW = duel('nutcracker', 'titan', 50);
    run(plainW, 70, tap({ aimRight: true, attack: true, smash: true }));
    const plain = plainW.fighters[1]!.percent;
    expect(plain).toBeGreaterThan(0);
    const w2 = duel('nutcracker', 'titan', 50);
    w2.fighters[0]!.meter = SIGNATURE.windup.max;
    run(w2, 70, tap({ aimRight: true, attack: true, smash: true }));
    expect(w2.fighters[0]!.meter).toBeLessThan(SIGNATURE.windup.max);
    expect(w2.fighters[1]!.percent).toBeGreaterThan(plain * 1.2);
  });

  it('Elf: hits fill Sugar Rush; full, Jingle Bell becomes a burst of speed', () => {
    const w = duel('elf', 'brawler', 30);
    const e = w.fighters[0]!;
    run(w, 30, tap({ aimRight: true, attack: true }));
    expect(e.meter).toBeGreaterThan(0);
    e.meter = SIGNATURE.sugar.max;
    run(w, 40, tap({ aimDown: true, special: true }));
    expect(e.meter).toBe(0);
    expect(e.hasted).toBeGreaterThan(0);
  });

  it('Santa: whoever hits him goes on the Naughty List; his next hit on them is a Lump of Coal', () => {
    const w = duel('santa', 'brawler', 40);
    const s = w.fighters[0]!;
    const b = w.fighters[1]!;
    // The Brawler jabs Santa.
    run(w, 30, (i) => [NO_INPUT, i === 0 ? { ...NO_INPUT, aimLeft: true, attack: true } : NO_INPUT]);
    expect(b.tags[s.slot]).toBe(1);
    expect(signatureGauge(w, s)?.lit).toBe(1);
    // Santa's ftilt on a listed foe hits harder, and takes them off the list.
    const plainW = duel('santa', 'brawler', 50);
    run(plainW, 40, tap({ aimRight: true, right: true, attack: true }));
    const plain = plainW.fighters[1]!.percent;
    expect(plain).toBeGreaterThan(0);
    const w2 = duel('santa', 'brawler', 50);
    w2.fighters[1]!.tags[0] = 1;
    w2.fighters[1]!.tagTime[0] = 100;
    run(w2, 40, tap({ aimRight: true, right: true, attack: true }));
    expect(w2.fighters[1]!.tags[0]).toBe(0);
    expect(w2.fighters[1]!.percent).toBeGreaterThan(plain * 1.2);
  });

  it('Reindeer: aerials light the nose; three, and the next Nose Beam is a Beacon', () => {
    const plainW = duel('reindeer', 'titan', 250);
    run(plainW, 40, tap({ aimRight: true, special: true }));
    const plain = plainW.fighters[1]!.percent;
    expect(plain).toBeGreaterThan(0);
    const w = duel('reindeer', 'titan', 250);
    w.fighters[0]!.meter = SIGNATURE.glow.max;
    run(w, 40, tap({ aimRight: true, special: true }));
    expect(w.fighters[0]!.meter).toBe(0);
    expect(w.fighters[1]!.percent).toBeGreaterThan(plain * 1.6);
  });

  it('Gingerbread: getting hit fills Fresh Batch; full, it bakes a burst that heals', () => {
    const w = duel('gingerbread', 'brawler', 40);
    const g = w.fighters[0]!;
    run(w, 30, (i) => [NO_INPUT, i === 0 ? { ...NO_INPUT, aimLeft: true, attack: true } : NO_INPUT]);
    expect(g.meter).toBeGreaterThan(0);
    run(w, 60);
    g.x = 0; w.fighters[1]!.x = 40;
    g.percent = 40;
    g.meter = SIGNATURE.batch.max;
    run(w, 50, tap({ aimDown: true, special: true }));
    expect(g.meter).toBe(0);
    expect(g.percent).toBe(40 - SIGNATURE.batch.heal);
  });
});

describe('Winter Village (ADR-0091)', () => {
  it('bots finish a match there with the Christmas fighters', () => {
    const w = createWorld('village', CHRISTMAS.map((id) => ({ id })), 2, 7);
    const bots = w.fighters.map((f) => createBot(f.slot, 3, 7));
    let frames = 0;
    while (!w.over && frames < 60 * 60 * 8) {
      step(w, bots.map((b) => botInput(b, w)));
      frames++;
    }
    expect(w.over, `no winner after ${frames} frames`).toBe(true);
  });
});
