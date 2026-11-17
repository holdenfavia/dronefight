import { describe, expect, it } from 'vitest';
import { MATCH, SIGNATURE } from './config.js';
import type { FighterId } from './fighters.js';
import { createWorld, NO_INPUT, step, type Input, type World } from './sim.js';
import { recipeOf, signatureGauge } from './signature.js';

function skipCountdown(world: World): void {
  for (let i = 0; i < MATCH.countdownFrames; i++) step(world, []);
}

function run(world: World, frames: number, inputs: (frame: number) => Input[] = () => []): void {
  for (let i = 0; i < frames; i++) step(world, inputs(i));
}

/** Two fighters on the Helipad, the first at x=0 facing right, the second `gap` to its right. */
function duel(a: FighterId, b: FighterId, gap: number): World {
  const w = createWorld('helipad', [{ id: a }, { id: b }]);
  skipCountdown(w);
  const [f, g] = w.fighters;
  f!.x = 0; f!.facing = 1;
  g!.x = gap; g!.facing = -1;
  return w;
}

const tap = (keys: Partial<Input>) => (i: number): Input[] => [i === 0 ? { ...NO_INPUT, ...keys } : NO_INPUT];
const NEUTRAL_SPECIAL = { aimRight: true, special: true };
const SIDE_SPECIAL = { right: true, aimRight: true, special: true };
const DOWN_SPECIAL = { aimDown: true, special: true };

describe('signature mechanics (ADR-0079)', () => {
  it('every cast fighter has a HUD meter; River has none', () => {
    for (const id of ['brawler', 'blade', 'spark', 'titan', 'ninja', 'gunslinger', 'chef', 'ghost', 'yoyo', 'bard'] as const) {
      const w = createWorld('rooftop', [{ id }, { id: 'river' }]);
      expect(signatureGauge(w, w.fighters[0]!)?.label).toBeTruthy();
      expect(signatureGauge(w, w.fighters[1]!)).toBeNull();
    }
  });

  it('Blade: a full edge turns Lunge into a Flash Cut that goes through shields', () => {
    const w = duel('blade', 'titan', 90);
    const [a, b] = w.fighters;
    a!.meter = SIGNATURE.edge.max;
    run(w, 3, tap(SIDE_SPECIAL));
    expect(a!.move).toBe('flashcut');
    expect(a!.meter).toBe(0);
    run(w, 30, () => [NO_INPUT, { ...NO_INPUT, shield: true }]);
    expect(b!.percent).toBeGreaterThan(10);
  });

  it('Blade: getting hit dulls the edge', () => {
    const w = duel('brawler', 'blade', 40);
    w.fighters[1]!.meter = 2;
    run(w, 20, tap({ aimRight: true, attack: true }));
    expect(w.fighters[1]!.percent).toBeGreaterThan(0);
    expect(w.fighters[1]!.meter).toBe(0);
  });

  it('Spark: casting without mana fizzles; rewind takes back recent damage', () => {
    const w = duel('spark', 'titan', 600);
    const s = w.fighters[0]!;
    s.meter = 0;
    run(w, 2, tap(NEUTRAL_SPECIAL));
    expect(s.moveSig).toBe('fizzle');
    run(w, 60);
    s.meter = SIGNATURE.mana.max;
    s.percent = 40;
    run(w, 5);
    run(w, 20, tap(DOWN_SPECIAL));
    expect(s.percent).toBe(0);
  });

  it('Titan: damage soaked by armor comes back on the next smash', () => {
    const smash = (stored: number) => {
      const w = duel('titan', 'brawler', 70);
      w.fighters[0]!.meter = stored;
      run(w, 60, (i) => [{ ...NO_INPUT, right: i < 2, aimRight: true, attack: i < 2 }]);
      return { dmg: w.fighters[1]!.percent, left: w.fighters[0]!.meter };
    };
    const plain = smash(0);
    const payback = smash(30);
    expect(payback.dmg).toBeGreaterThan(plain.dmg + 10);
    expect(payback.left).toBe(0);
  });

  it('Titan: armor stores what it soaks', () => {
    const w = duel('titan', 'brawler', 60);
    const [t, b] = w.fighters;
    b!.facing = -1;
    // Titan winds up a charged forward smash (armored); the Brawler jabs into it.
    run(w, 20, (i) => [{ ...NO_INPUT, right: i < 2, aimRight: true, attack: true }, { ...NO_INPUT, aimLeft: i === 6, attack: i === 6 }]);
    expect(t!.percent).toBeGreaterThan(0);
    expect(t!.meter).toBeGreaterThan(0);
  });

  it('Ninja: stars mark; Shadow Step onto a marked foe cashes the marks in', () => {
    const w = duel('ninja', 'titan', 200);
    run(w, 30, tap(NEUTRAL_SPECIAL));
    expect(w.fighters[1]!.tags[0]).toBe(1);

    const strike = (marks: number) => {
      const v = duel('ninja', 'titan', 200);
      v.fighters[1]!.tags[0] = marks;
      v.fighters[1]!.tagTime[0] = 300;
      run(v, 40, tap(SIDE_SPECIAL));
      return { dmg: v.fighters[1]!.percent, marks: v.fighters[1]!.tags[0] };
    };
    const plain = strike(0);
    const marked = strike(3);
    expect(marked.dmg).toBeGreaterThan(plain.dmg + 8);
    expect(marked.marks).toBe(0);
  });

  it('Gunslinger: the last bullet is golden and grows with the streak; a miss breaks the streak', () => {
    const shot = (ammo: number, streak: number) => {
      const w = duel('gunslinger', 'titan', 300);
      const g = w.fighters[0]!;
      g.ammo = ammo; g.meter = streak;
      run(w, 30, tap(NEUTRAL_SPECIAL));
      return { dmg: w.fighters[1]!.percent, streak: g.meter };
    };
    const normal = shot(6, 0);
    const golden = shot(1, 5);
    expect(normal.streak).toBe(1);
    expect(golden.dmg).toBeGreaterThan(normal.dmg * 2.5);
    expect(golden.streak).toBe(0);

    const w = duel('gunslinger', 'titan', 300);
    w.fighters[1]!.y = 400; // Out of the line of fire.
    w.fighters[0]!.meter = 3;
    run(w, 60, tap(NEUTRAL_SPECIAL));
    expect(w.fighters[0]!.meter).toBe(0);
  });

  it('Chef: hits gather ingredients; a full pantry cooks the recipe it adds up to', () => {
    const w = duel('chef', 'titan', 40);
    run(w, 20, tap({ aimRight: true, attack: true }));
    expect(w.fighters[0]!.pantry).toEqual([0]);

    expect(recipeOf([1, 1, 0])).toBe('chili');
    expect(recipeOf([2, 2, 1])).toBe('stew');
    expect(recipeOf([0, 0, 2])).toBe('soup');
    expect(recipeOf([0, 1, 2])).toBe('feast');

    const c = duel('chef', 'titan', 400);
    const chef = c.fighters[0]!;
    chef.pantry = [2, 2, 0];
    chef.percent = 50;
    run(c, 3, tap(DOWN_SPECIAL));
    expect(chef.move).toBe('cook');
    run(c, 40);
    expect(chef.percent).toBe(50 - SIGNATURE.pantry.stewHeal);
    expect(chef.pantry).toEqual([]);

    chef.pantry = [1, 1, 2];
    run(c, 45, tap(DOWN_SPECIAL));
    expect(chef.buffKind).toBe('chili');
  });

  it('Ghost: a wisp on a fully haunted foe possesses them; the Ghost steers, mashing breaks free', () => {
    const w = duel('ghost', 'titan', 140);
    const [g, t] = w.fighters;
    t!.tags[0] = SIGNATURE.haunt.max;
    t!.tagTime[0] = 300;
    run(w, 40, tap(NEUTRAL_SPECIAL));
    expect(t!.puppet).toBeGreaterThan(0);
    expect(t!.puppetBy).toBe(g!.slot);
    // Wait out the hitstun, then walk them right.
    run(w, 20);
    const x0 = t!.x;
    run(w, 15, () => [{ ...NO_INPUT, right: true }, NO_INPUT]);
    expect(t!.x).toBeGreaterThan(x0 + 40);
    // Mashing shakes it off.
    const keys: (keyof Input)[] = ['attack', 'special', 'shield', 'grab'];
    run(w, 40, (i) => [NO_INPUT, { ...NO_INPUT, [keys[i % 4]!]: i % 2 === 0 }]);
    expect(t!.puppet).toBe(0);
  });

  it('Yo-yo Kid: hits in a chain count up', () => {
    const w = duel('yoyo', 'titan', 40);
    run(w, 60, (i) => [{ ...NO_INPUT, aimRight: true, attack: i % 14 < 2 }]);
    expect(w.fighters[0]!.chain).toBeGreaterThanOrEqual(2);
  });

  it('Bard: attacks on the beat build groove, off the beat lose it; full groove turns the lullaby into a sleeping encore', () => {
    const w = duel('bard', 'titan', 60);
    const b = w.fighters[0]!;
    const toBeat = () => { while ((w.frame + 1) % SIGNATURE.groove.beat !== 0) step(w, []); };
    toBeat();
    run(w, 40, tap({ aimRight: true, attack: true }));
    toBeat();
    expect(b.meter).toBe(1);
    run(w, 15);
    run(w, 40, tap({ aimRight: true, attack: true }));
    expect(b.meter).toBe(0);

    const e = duel('bard', 'titan', 60);
    e.fighters[0]!.meter = SIGNATURE.groove.max;
    run(e, 3, tap(DOWN_SPECIAL));
    expect(e.fighters[0]!.move).toBe('lullabyEncore');
    run(e, 20);
    expect(e.fighters[1]!.action).toBe('hitstun');
    expect(e.fighters[1]!.duration).toBeGreaterThanOrEqual(90);
  });

  it('every fighter\'s forward smash and forward tilt land on someone standing in front', () => {
    for (const id of ['brawler', 'blade', 'spark', 'titan', 'ninja', 'gunslinger', 'chef', 'ghost', 'yoyo', 'bard'] as const) {
      for (const [move, keys] of [['fsmash', { right: true, aimRight: true, attack: true }], ['ftilt', { left: true, aimRight: true, attack: true }]] as const) {
        const w = duel(id, 'titan', 70);
        w.fighters[0]!.facing = 1;
        run(w, 80, tap(keys));
        expect(w.fighters[1]!.percent, `${id} ${move}`).toBeGreaterThan(2);
      }
    }
  });
});
