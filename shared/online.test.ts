import { describe, expect, it } from 'vitest';
import { botInput, createBot } from './fighter/bot.js';
import { FIGHTER_IDS } from './fighter/fighters.js';
import { createWorld, NO_INPUT, step, type Input } from './fighter/sim.js';
import { parseClientMessage } from './protocol.js';
import { decodeInput, deserializeWorld, drawStage, encodeInput, parseBans, serializeWorld } from './online.js';

describe('online fights', () => {
  it('packs every key into input bits and back', () => {
    const keys = Object.keys(NO_INPUT) as (keyof Input)[];
    for (const k of keys) expect(decodeInput(encodeInput({ ...NO_INPUT, [k]: true }))).toEqual({ ...NO_INPUT, [k]: true });
    expect(encodeInput(NO_INPUT)).toBe(0);
  });

  it('a world restored from a snapshot plays on exactly like the original', () => {
    for (let pair = 0; pair < FIGHTER_IDS.length; pair += 2) {
      const ids = [FIGHTER_IDS[pair]!, FIGHTER_IDS[(pair + 1) % FIGHTER_IDS.length]!, FIGHTER_IDS[(pair + 5) % FIGHTER_IDS.length]!];
      const world = createWorld('rooftop', ids.map((id) => ({ id })), 3, 77 + pair);
      const bots = ids.map((_id, i) => createBot(i, 3, 5));
      const inputs: number[][] = [];
      for (let i = 0; i < 2400; i++) {
        const bits = bots.map((b) => encodeInput(botInput(b, world)));
        inputs.push(bits);
        step(world, bits.map(decodeInput));
      }
      // Restore at frame 1200 from the original run and replay the rest.
      const replay = createWorld('rooftop', ids.map((id) => ({ id })), 3, 77 + pair);
      for (let i = 0; i < 1200; i++) step(replay, inputs[i]!.map(decodeInput));
      const restored = deserializeWorld(serializeWorld(replay))!;
      for (let i = 1200; i < 2400; i++) step(restored, inputs[i]!.map(decodeInput));
      expect(serializeWorld(restored)).toBe(serializeWorld(world));
    }
  });

  it('accepts the secret fighter as a pick and the host\'s rule cheats in settings (ADR-0077)', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'pick', fighter: 'river', ready: true }))).toEqual({ t: 'pick', fighter: 'river', ready: true });
    const msg = parseClientMessage(JSON.stringify({ t: 'settings', settings: { stage: 'rooftop', stocks: 3, cpus: [], rules: { oneHit: true, nonsense: 1 } } }));
    expect(msg).toEqual({ t: 'settings', settings: { stage: 'rooftop', stagePick: false, stocks: 3, cpus: [], rules: { moonJump: false, oneHit: true }, teams: false, friendlyFire: false, cpuTeams: [] } });
    const old = parseClientMessage(JSON.stringify({ t: 'settings', settings: { stage: 'rooftop', stocks: 3, cpus: [] } }));
    expect(old).toEqual({ t: 'settings', settings: { stage: 'rooftop', stagePick: false, stocks: 3, cpus: [], rules: { moonJump: false, oneHit: false }, teams: false, friendlyFire: false, cpuTeams: [] } });
  });
  it('draws the stage: the pick unless banned or Random, then an open one (ADR-0086)', () => {
    const offered = ['rooftop', 'helipad', 'cranes'] as const;
    expect(drawStage('helipad', offered, [], () => 0.9)).toBe('helipad');
    expect(drawStage('helipad', offered, ['helipad'], () => 0)).toBe('rooftop');
    expect(drawStage('random', offered, ['rooftop'], () => 0.99)).toBe('cranes');
    // Everything banned: any stage on offer.
    expect(drawStage('random', offered, [...offered], () => 0.5)).toBe('helipad');
    expect(parseBans(['cranes', 'moon', 'cranes', 3])).toEqual(['cranes']);
  });
});
