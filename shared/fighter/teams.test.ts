// Team battles (ADR-0081): teammates can't hurt each other unless friendly fire is on, and the last team standing wins.

import { describe, expect, it } from 'vitest';
import { botInput, createBot } from './bot.js';
import { MATCH } from './config.js';
import { createWorld, NO_INPUT, step, type Input, type MatchRules, type World } from './sim.js';

function skipCountdown(world: World): void {
  for (let i = 0; i < MATCH.countdownFrames; i++) step(world, []);
}

function run(world: World, frames: number, inputs: (frame: number) => Input[] = () => []): void {
  for (let i = 0; i < frames; i++) step(world, inputs(i));
}

/** Fighter 0 jabs fighter 1, standing right next to it. Returns fighter 1's percent after. */
function jabTeammate(rules: MatchRules): number {
  const w = createWorld('helipad', [{ id: 'brawler', team: 0 }, { id: 'brawler', team: 0 }, { id: 'spark', team: 1 }], 3, 1, rules);
  skipCountdown(w);
  const [a, b, c] = w.fighters;
  a!.x = 0; a!.facing = 1;
  b!.x = 40;
  c!.x = 400;
  run(w, 2, (i) => [{ ...NO_INPUT, aimRight: i === 0, attack: i === 0 }]);
  run(w, 60);
  return b!.percent;
}

describe('team battles', () => {
  it('teammates pass through each other\'s hits', () => {
    expect(jabTeammate({})).toBe(0);
  });

  it('friendly fire lets teammates hit each other', () => {
    expect(jabTeammate({ friendlyFire: true })).toBeGreaterThan(0);
  });

  it('hits still land on the other team', () => {
    const w = createWorld('helipad', [{ id: 'brawler', team: 0 }, { id: 'brawler', team: 1 }]);
    skipCountdown(w);
    const [a, b] = w.fighters;
    a!.x = 0; a!.facing = 1;
    b!.x = 40;
    run(w, 2, (i) => [{ ...NO_INPUT, aimRight: i === 0, attack: i === 0 }]);
    run(w, 60);
    expect(b!.percent).toBeGreaterThan(0);
  });

  it('the fight ends when one team is left, even with several of its fighters standing', () => {
    const w = createWorld('rooftop', [{ id: 'brawler', team: 0 }, { id: 'blade', team: 0 }, { id: 'spark', team: 1 }], 1);
    skipCountdown(w);
    const foe = w.fighters[2]!;
    foe.x = 5000; // Past the blast zone.
    run(w, 2);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(0);
    expect(w.fighters[w.winner]!.team).toBe(0);
  });

  it('a free-for-all still needs a single fighter left', () => {
    const w = createWorld('rooftop', [{ id: 'brawler' }, { id: 'blade' }, { id: 'spark' }], 1);
    skipCountdown(w);
    w.fighters[2]!.x = 5000;
    run(w, 2);
    expect(w.over).toBe(false);
    expect(w.winnerTeam).toBe(-1);
  });

  it('CPUs fight a 2v2 to the end without hitting their own teammates', () => {
    const w = createWorld('rooftop', [{ id: 'brawler', team: 0 }, { id: 'spark', team: 1 }, { id: 'titan', team: 0 }, { id: 'blade', team: 1 }], 2, 7);
    const bots = w.fighters.map((f) => createBot(f.slot, 3, 7));
    let frames = 0;
    let teamHits = 0;
    while (!w.over && frames < 60 * 60 * 6) {
      step(w, bots.map((b) => botInput(b, w)));
      for (const e of w.events) if (e.type === 'hit' && w.fighters[e.attacker]!.team === w.fighters[e.target]!.team) teamHits++;
      frames++;
    }
    expect(w.over, `no winner after ${frames} frames`).toBe(true);
    expect(w.winnerTeam).toBeGreaterThanOrEqual(0);
    expect(teamHits).toBe(0);
  });
});
