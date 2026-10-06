import { describe, expect, it } from 'vitest';
import { defaultLoadout } from './loadout.js';
import { cleanRoomOptions, defaultRoomOptions, loadoutAllowed, restrictLoadout } from './roomOptions.js';

describe('room settings (ADR-0046)', () => {
  it('cleans junk from the wire, keeping at least one drone and one weapon', () => {
    const o = cleanRoomOptions({ map: 'yard', killsToWin: 7, timeLimitMin: 10, bodies: [], weapons: ['laser', 'rail'], specials: ['nope'], assist: 'acro' });
    expect(o.map).toBe('yard');
    expect(o.killsToWin).toBe(10);
    expect(o.timeLimitMin).toBe(10);
    expect(o.bodies.length).toBeGreaterThan(0);
    expect(o.weapons).toEqual(['rail']);
    expect(o.specials).toEqual([]);
    expect(o.assist).toBe('acro');
  });

  it('brings a build within the rules: body, weapons, special', () => {
    const rules = { ...defaultRoomOptions(), bodies: ['freestyle' as const], weapons: ['gun' as const], specials: [] };
    const x8 = defaultLoadout('x8');
    const r = restrictLoadout(x8, rules);
    expect(r.body).toBe('freestyle');
    expect(r.weapons).toEqual(['gun', 'gun']);
    expect(r.special).toBeNull();
    expect(loadoutAllowed(r, rules)).toBe(true);
    expect(loadoutAllowed(x8, rules)).toBe(false);
  });

  it('everything allowed changes nothing', () => {
    const l = defaultLoadout('wing');
    expect(restrictLoadout(l, defaultRoomOptions())).toEqual(l);
  });
});
