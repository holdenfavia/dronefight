import { describe, expect, it } from 'vitest';
import { botInput, createBot } from './fighter/bot.js';
import { FIGHTER_IDS } from './fighter/fighters.js';
import { createWorld, NO_INPUT, step, type Input } from './fighter/sim.js';
import { decodeInput, deserializeWorld, encodeInput, serializeWorld } from './online.js';

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
});
