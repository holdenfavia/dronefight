import { describe, expect, it } from 'vitest';
import { botInput, createBot } from './bot.js';
import { MATCH } from './config.js';
import { FIGHTER_IDS, FIGHTERS } from './fighters.js';
import { createWorld, knockback, NO_INPUT, step, type Fighter, type Input, type World } from './sim.js';
import { STAGE_IDS } from './stages.js';

function skipCountdown(world: World): void {
  for (let i = 0; i < MATCH.countdownFrames; i++) step(world, []);
}

function run(world: World, frames: number, inputs: (frame: number) => Input[] = () => []): void {
  for (let i = 0; i < frames; i++) step(world, inputs(i));
}

describe('fighter sim', () => {
  it('nobody moves during the countdown', () => {
    const w = createWorld('rooftop', [{ id: 'brawler' }, { id: 'spark' }]);
    const x = w.fighters[0]!.x;
    run(w, 60, () => [{ ...NO_INPUT, right: true }]);
    expect(w.fighters[0]!.x).toBe(x);
  });

  it('walks, jumps and lands back on the stage', () => {
    const w = createWorld('rooftop', [{ id: 'brawler' }, { id: 'spark' }]);
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

  it('a charged forward smash at high percent launches off the stage and takes a stock', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 300; a!.facing = 1;
    b!.x = 345; b!.percent = 110;
    // Move key and arrow together = smash; hold the arrow to charge.
    run(w, 20, () => [{ ...NO_INPUT, right: true, aimRight: true, attack: true }]);
    expect(a!.move).toBe('fsmash');
    run(w, 240);
    expect(b!.stocks).toBe(MATCH.defaultStocks - 1);
    expect(a!.stats.kos).toBe(1);
  });

  it('the forward tilt at low percent does not KO', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45; b!.percent = 10;
    // Aiming at them while holding the other way is a (turnaround) tilt, not a smash.
    run(w, 240, (i) => [i === 0 ? { ...NO_INPUT, left: true, aimRight: true, attack: true } : NO_INPUT]);
    expect(b!.percent).toBeGreaterThan(10);
    expect(b!.stocks).toBe(MATCH.defaultStocks);
  });

  it('a shield blocks damage', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45;
    run(w, 30, (i) => [{ ...NO_INPUT, attack: i === 12 }, { ...NO_INPUT, shield: true }]);
    expect(b!.percent).toBe(0);
    expect(b!.shieldHp).toBeLessThan(50);
  });

  it('every fighter can recover from off the side with jumps and specials', () => {
    for (const id of FIGHTER_IDS) {
      const w = createWorld('helipad', [{ id }, { id: 'brawler' }]);
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
      const w = createWorld(stage, [{ id: 'brawler' }, { id: 'spark' }, { id: 'titan' }, { id: 'blade' }], 2, 7);
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
      const w = createWorld('rooftop', [{ id: 'brawler' }, { id: 'titan' }], 3, 42);
      const bots = w.fighters.map((f) => createBot(f.slot, 2, 42));
      for (let i = 0; i < 3000; i++) step(w, bots.map((b) => botInput(b, w)));
      return w.fighters.map((f) => [f.x, f.y, f.percent, f.stocks]);
    };
    expect(play()).toEqual(play());
  });

  it('the arrow keys pick the attack: forward arrow standing still jabs, and tapping again combos', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const a = w.fighters[0]!;
    step(w, [{ ...NO_INPUT, aimRight: true, attack: true }]);
    expect(a.move).toBe('jab');
    run(w, 6);
    step(w, [{ ...NO_INPUT, aimRight: true, attack: true }]);
    expect(a.move).toBe('jab2');
    run(w, 40);
    step(w, [{ ...NO_INPUT, aimUp: true, attack: true }]);
    expect(a.move).toBe('utilt');
    run(w, 40);
    step(w, [{ ...NO_INPUT, aimLeft: true, attack: true }]);
    expect(a.move).toBe('jab');
    expect(a.facing).toBe(-1);
  });

  it('aimed specials: special with an arrow picks the direction', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const a = w.fighters[0]!;
    a.facing = 1;
    step(w, [{ ...NO_INPUT, aimRight: true, special: true }]);
    expect(a.move).toBe('nspecial');
    run(w, 60);
    step(w, [{ ...NO_INPUT, aimLeft: true, special: true }]);
    expect(a.move).toBe('sspecial');
    expect(a.facing).toBe(-1);
    run(w, 80);
    step(w, [{ ...NO_INPUT, aimUp: true, special: true }]);
    expect(a.move).toBe('uspecial');
  });

  it('charging a smash makes it hit harder', () => {
    const hitWith = (chargeFrames: number) => {
      const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
      skipCountdown(w);
      const [a, b] = w.fighters;
      a!.x = 0; a!.facing = 1;
      b!.x = 50;
      run(w, 130, (i) => [i <= 9 + chargeFrames ? { ...NO_INPUT, right: i === 0, aimRight: true, attack: true } : NO_INPUT]);
      return b!.percent;
    };
    expect(hitWith(50)).toBeGreaterThan(hitWith(0) * 1.25);
  });

  it('grabs beat shields, and an arrow throws', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45;
    run(w, 12, (i) => [{ ...NO_INPUT, grab: i === 0 }, { ...NO_INPUT, shield: true }]);
    expect(a!.action).toBe('holding');
    expect(b!.action).toBe('held');
    step(w, [{ ...NO_INPUT, grab: true }, { ...NO_INPUT, shield: true }]);
    expect(a!.move).toBe('pummel');
    run(w, 20, () => [NO_INPUT, { ...NO_INPUT, shield: true }]);
    expect(b!.percent).toBeGreaterThan(0);
    expect(a!.action).toBe('holding');
    step(w, [{ ...NO_INPUT, aimUp: true, attack: true }]);
    expect(a!.move).toBe('uthrow');
    run(w, 30);
    expect(b!.grabbedBy).toBe(-1);
    expect(b!.percent).toBeGreaterThan(7);
    expect(b!.y).toBeGreaterThan(20);
  });

  it('mashing breaks out of a grab sooner', () => {
    const heldFor = (mash: boolean) => {
      const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
      skipCountdown(w);
      const [a, b] = w.fighters;
      a!.x = 0; a!.facing = 1;
      b!.x = 45;
      run(w, 10, (i) => [{ ...NO_INPUT, grab: i === 0 }]);
      expect(a!.action).toBe('holding');
      let frames = 0;
      while (b!.grabbedBy >= 0 && frames < 400) {
        step(w, [NO_INPUT, { ...NO_INPUT, left: mash && frames % 2 === 0 }]);
        frames++;
      }
      return frames;
    };
    expect(heldFor(true)).toBeLessThan(heldFor(false) * 0.6);
  });

  it('launched drones tech with a well-timed shield press, and get knocked down without one', () => {
    const landing = (tech: boolean) => {
      const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
      skipCountdown(w);
      const b = w.fighters[1]!;
      b.x = 0; b.y = 40; b.grounded = false; b.action = 'hitstun'; b.duration = 60; b.tumbling = true; b.vy = -600;
      let i = 0;
      while (!b.grounded && i < 60) { step(w, [NO_INPUT, { ...NO_INPUT, shield: tech && i === 2 }]); i++; }
      return b.action;
    };
    expect(landing(true)).toBe('tech');
    expect(landing(false)).toBe('down');
  });

  it('a shield raised right as the hit lands parries it', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 45;
    const events: string[] = [];
    // Jab comes out on frame 3; shield goes up 2 frames before.
    for (let i = 0; i < 20; i++) {
      step(w, [{ ...NO_INPUT, aimRight: true, attack: i === 0 }, { ...NO_INPUT, shield: i >= 1 }]);
      events.push(...w.events.map((e) => e.type));
    }
    expect(events).toContain('parry');
    expect(b!.shieldHp).toBeGreaterThan(47); // Only the drain from holding it.
    expect(b!.percent).toBe(0);
  });

  it("the Brawler's counter-punch strikes back", () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 75; b!.facing = -1;
    run(w, 60, (i) => [{ ...NO_INPUT, down: i < 2, special: i === 0 }, { ...NO_INPUT, aimLeft: true, attack: i === 3 }]);
    expect(a!.percent).toBe(0);
    expect(b!.percent).toBeGreaterThan(6);
  });

  it("the Titan's smash has super armor while charging", () => {
    const w = createWorld('helipad', [{ id: 'titan' }, { id: 'spark' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 60; b!.facing = -1;
    run(w, 40, (i) => [{ ...NO_INPUT, right: true, aimRight: true, attack: true }, { ...NO_INPUT, aimLeft: true, attack: i === 4 }]);
    expect(a!.percent).toBeGreaterThan(0);
    expect(a!.action).toBe('attack');
    expect(a!.move).toBe('fsmash');
  });

  it('using the same move over and over weakens it', () => {
    const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    const dmg: number[] = [];
    for (let n = 0; n < 5; n++) {
      a!.x = 0; a!.facing = 1; b!.x = 50; b!.y = 0; b!.lx = b!.ly = 0;
      const before = b!.percent;
      run(w, 60, (i) => [{ ...NO_INPUT, left: i === 0, aimRight: true, attack: i === 0 }]);
      dmg.push(b!.percent - before);
    }
    expect(dmg[4]!).toBeLessThan(dmg[0]! * 0.85);
  });

  it("the Spark's orb follows its target", () => {
    const w = createWorld('helipad', [{ id: 'spark' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = -200; a!.facing = 1;
    b!.x = 150;
    run(w, 14, (i) => [{ ...NO_INPUT, right: i < 2, aimRight: true, special: i === 0 }]);
    expect(w.projectiles.length).toBe(1);
    // Jump over it: the orb turns up to follow.
    b!.y = 160; b!.grounded = false; b!.action = 'air'; b!.vy = 0;
    run(w, 30, () => [NO_INPUT, { ...NO_INPUT, up: true }]);
    const orb = w.projectiles[0];
    expect(orb === undefined || orb.vy > 0).toBe(true);
  });

  it("the Spark's blink teleports and its rewind snaps back", () => {
    const w = createWorld('helipad', [{ id: 'spark' }, { id: 'titan' }]);
    skipCountdown(w);
    const f = w.fighters[0]!;
    f.x = 0; f.facing = 1;
    w.fighters[1]!.x = 400;
    run(w, 10, (i) => [{ ...NO_INPUT, right: i < 8, aimUp: true, special: i === 0 }]);
    expect(f.y).toBeGreaterThan(100);
    expect(f.x).toBeGreaterThan(100);
    // Walk away, then rewind: back near where it started.
    run(w, 120);
    const start = { x: f.x, y: f.y };
    run(w, 40, () => [{ ...NO_INPUT, right: true }]);
    expect(f.x).toBeGreaterThan(start.x + 80);
    run(w, 10, (i) => [{ ...NO_INPUT, aimDown: true, special: i === 0 }]);
    expect(Math.abs(f.x - start.x)).toBeLessThan(60);
  });

  it("the Blade's sword tip hits harder than the base of the blade", () => {
    const hitAt = (gap: number) => {
      const w = createWorld('helipad', [{ id: 'blade' }, { id: 'titan' }]);
      skipCountdown(w);
      const [a, b] = w.fighters;
      a!.x = 0; a!.facing = 1;
      b!.x = gap;
      run(w, 40, (i) => [{ ...NO_INPUT, left: i === 0, aimRight: true, attack: i === 0 }]);
      return b!.percent;
    };
    expect(hitAt(100)).toBeGreaterThan(hitAt(40) * 1.4);
  });

  it("the Brawler's full rage makes its next smash hit much harder", () => {
    const smash = (rage: number) => {
      const w = createWorld('helipad', [{ id: 'brawler' }, { id: 'titan' }]);
      skipCountdown(w);
      const [a, b] = w.fighters;
      a!.x = 0; a!.facing = 1; a!.rage = rage;
      b!.x = 50;
      run(w, 30, (i) => [{ ...NO_INPUT, right: i < 2, aimRight: true, attack: i < 2 }]);
      return { dmg: b!.percent, rage: a!.rage };
    };
    const calm = smash(0);
    const raging = smash(FIGHTERS.brawler.rage!.max);
    expect(raging.dmg).toBeGreaterThan(calm.dmg * 1.4);
    expect(raging.rage).toBe(0);
    expect(calm.rage).toBeGreaterThan(0);
  });

  it("the Titan's sky carry grabs through a shield, leaps and slams", () => {
    const w = createWorld('helipad', [{ id: 'titan' }, { id: 'brawler' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 100;
    let peak = 0;
    run(w, 120, (i) => {
      if (b!.action === 'held') peak = Math.max(peak, b!.y);
      return [{ ...NO_INPUT, left: i === 0, aimRight: true, special: i === 0 }, { ...NO_INPUT, shield: true }];
    });
    expect(peak).toBeGreaterThan(80);
    expect(b!.percent).toBeGreaterThan(15);
  });

  it("the Gunslinger fires six shots, then reloads", () => {
    const w = createWorld('helipad', [{ id: 'gunslinger' }, { id: 'titan' }]);
    skipCountdown(w);
    const f = w.fighters[0]!;
    f.x = -300; f.facing = 1;
    w.fighters[1]!.x = 600;
    for (let n = 0; n < 6; n++) run(w, 20, (i) => [{ ...NO_INPUT, aimRight: true, special: i === 0 }]);
    expect(f.ammo).toBe(0);
    run(w, 2, (i) => [{ ...NO_INPUT, aimRight: true, special: i === 0 }]);
    expect(f.move).toBe('reload');
    run(w, 60);
    expect(f.ammo).toBe(6);
  });

  it("the Chef's pan flip sends a shot back", () => {
    const w = createWorld('helipad', [{ id: 'chef' }, { id: 'gunslinger' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = -100; a!.facing = 1;
    b!.x = 200; b!.facing = -1;
    run(w, 40, (i) => [
      { ...NO_INPUT, right: i === 4, aimRight: i === 4, special: i === 4 },
      { ...NO_INPUT, aimLeft: true, special: i === 0 },
    ]);
    expect(a!.percent).toBe(0);
    expect(b!.percent).toBeGreaterThan(5);
  });

  it("the Chef's pot sits on the floor and burns whoever stands in it", () => {
    const w = createWorld('helipad', [{ id: 'chef' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 400;
    run(w, 60, (i) => [{ ...NO_INPUT, aimDown: true, special: i === 0 }]);
    const pot = w.projectiles.find((p) => p.kind === 'hazard');
    expect(pot?.stuck).toBe(true);
    b!.x = pot!.x;
    run(w, 70);
    expect(b!.percent).toBeGreaterThan(7);
  });

  it("the Ghost's wisp swaps its target's left and right", () => {
    const w = createWorld('helipad', [{ id: 'ghost' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = -100; a!.facing = 1;
    b!.x = 60;
    run(w, 40, (i) => [{ ...NO_INPUT, aimRight: true, special: i === 0 }]);
    expect(b!.cursed).toBeGreaterThan(0);
    run(w, 30);
    const x0 = b!.x;
    run(w, 20, () => [NO_INPUT, { ...NO_INPUT, right: true }]);
    expect(b!.x).toBeLessThan(x0 - 20);
  });

  it("the Yo-yo Kid's yo-yo comes back", () => {
    const w = createWorld('helipad', [{ id: 'yoyo' }, { id: 'titan' }]);
    skipCountdown(w);
    const f = w.fighters[0]!;
    f.x = -300; f.facing = 1;
    w.fighters[1]!.x = 600;
    run(w, 40, (i) => [{ ...NO_INPUT, aimRight: true, special: i === 0 }]);
    const yo = w.projectiles[0]!;
    expect(yo.returning).toBe(true);
    run(w, 80);
    expect(w.projectiles.length).toBe(0);
  });

  it("the Yo-yo Kid's tether pulls it onto the stage from far below", () => {
    const w = createWorld('helipad', [{ id: 'yoyo' }, { id: 'titan' }]);
    skipCountdown(w);
    const f = w.fighters[0]!;
    const main = w.stage.platforms[0]!;
    f.x = main.x2 + 90; f.y = main.y - 200; f.grounded = false; f.action = 'air'; f.airJumpsLeft = 0;
    run(w, 10, (i) => [{ ...NO_INPUT, left: true, aimUp: true, special: i === 0 }]);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(main.y);
  });

  it("the Ninja's shadow step appears behind its target", () => {
    const w = createWorld('helipad', [{ id: 'ninja' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = -200; a!.facing = 1;
    b!.x = 60; b!.facing = -1;
    run(w, 30, (i) => [{ ...NO_INPUT, right: i === 0, aimRight: i === 0, special: i === 0 }]);
    expect(a!.x).toBeGreaterThan(b!.x - 1);
    expect(b!.percent).toBeGreaterThan(5);
  });

  it("the Bard's lullaby slows and its tempo song speeds up", () => {
    const w = createWorld('helipad', [{ id: 'bard' }, { id: 'titan' }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 70;
    run(w, 50, (i) => [{ ...NO_INPUT, aimDown: true, special: i === 0 }]);
    expect(b!.slowed).toBeGreaterThan(0);
    run(w, 50, (i) => [{ ...NO_INPUT, left: i === 0, aimLeft: i === 0, special: i === 0 }]);
    expect(a!.hasted).toBeGreaterThan(0);
  });

  it('every fighter has its own moveset', () => {
    const sig = (id: (typeof FIGHTER_IDS)[number]) => JSON.stringify(FIGHTERS[id].moves);
    const sigs = new Set(FIGHTER_IDS.map(sig));
    expect(sigs.size).toBe(FIGHTER_IDS.length);
    const specials = new Set(FIGHTER_IDS.flatMap((id) => Object.values(FIGHTERS[id].specials)));
    expect(specials.size).toBeGreaterThanOrEqual(FIGHTER_IDS.length * 4 - 1);
  });

  it('every move of every fighter runs to its end without getting stuck', () => {
    const moves: Input[] = [
      { ...NO_INPUT, aimRight: true, attack: true }, { ...NO_INPUT, aimUp: true, attack: true }, { ...NO_INPUT, aimDown: true, attack: true },
      { ...NO_INPUT, right: true, aimRight: true, attack: true }, { ...NO_INPUT, up: true, aimUp: true, attack: true }, { ...NO_INPUT, down: true, aimDown: true, attack: true },
      { ...NO_INPUT, aimRight: true, special: true }, { ...NO_INPUT, aimLeft: true, special: true }, { ...NO_INPUT, aimDown: true, special: true },
      { ...NO_INPUT, grab: true },
    ];
    for (const id of FIGHTER_IDS) {
      for (const m of moves) {
        const w = createWorld('helipad', [{ id }, { id: 'brawler' }]);
        skipCountdown(w);
        const f: Fighter = w.fighters[0]!;
        f.x = 0; f.facing = 1;
        w.fighters[1]!.x = 300;
        step(w, [m]);
        expect(f.action, `${id} ${JSON.stringify(m)}`).toBe('attack');
        run(w, 150);
        expect(['idle', 'land', 'air'], `${id} ${f.move}`).toContain(f.action);
      }
    }
  });
});
