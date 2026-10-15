import { describe, expect, it } from 'vitest';
import { DRONE_CLASSES, DRONE_ORDER } from './drones.js';
import { cleanLoadout, DEFAULT_LOADOUTS, defaultLoadout, guns, loadoutKey, missilePods, totalKg } from './loadout.js';

describe('loadouts (ADR-0033)', () => {
  it('every default loadout has a valid shape', () => {
    for (const id of DRONE_ORDER) {
      const l = DEFAULT_LOADOUTS[id];
      expect(l.weapons).toHaveLength(DRONE_CLASSES[id].hardpoints);
      expect(cleanLoadout(l)).toEqual(l);
    }
  });

  it('weight is the bare drone plus what it carries (ADR-0066)', () => {
    const x8Rails = cleanLoadout({ body: 'x8', weapons: ['rail', 'rail', 'rail', 'rail'], special: null });
    expect(totalKg(x8Rails)).toBeCloseTo(2 + 4 * 1.12, 5);
    expect(totalKg({ ...DEFAULT_LOADOUTS.freestyle, weapons: [null, null], special: null })).toBeCloseTo(0.65, 5);
  });

  it('a build has one key: same build, same key; any change, a new one', () => {
    const l = DEFAULT_LOADOUTS.freestyle;
    expect(loadoutKey(cleanLoadout(structuredClone(l)))).toBe(loadoutKey(l));
    expect(loadoutKey({ ...l, propeller: 'bi' })).not.toBe(loadoutKey(l));
    expect(loadoutKey({ ...l, weapons: [l.weapons[1], l.weapons[0]] })).not.toBe(loadoutKey(l));
  });

  it('cleans bad input: hardpoint count, unknown modules, specials that do not fit', () => {
    expect(cleanLoadout({ body: 'racer', weapons: ['rail', 'rail', 'rail'], special: 'shield' })).toEqual({ body: 'racer', weapons: ['rail'], special: 'shield', propeller: 'tri' });
    expect(cleanLoadout({ body: 'freestyle', weapons: ['laser'], special: 'maneuver' })).toEqual({ body: 'freestyle', weapons: [null, null], special: null, propeller: 'tri' });
    expect(cleanLoadout({ body: 'wing', weapons: ['cannon'], special: 'maneuver' }).special).toBe('maneuver');
    expect(cleanLoadout('garbage', 'x8')).toEqual(defaultLoadout('x8'));
  });

  it('splits guns from missile pods', () => {
    const l = DEFAULT_LOADOUTS.x8;
    expect(guns(l)).toEqual(['gun', 'gun', 'burst']);
    expect(missilePods(l)).toBe(1);
  });
});

describe('propellers (ADR-0035, ADR-0065)', () => {
  it('ducts only fit quads; jets only the wing', () => {
    const base = DEFAULT_LOADOUTS.freestyle;
    expect(cleanLoadout({ ...DEFAULT_LOADOUTS.wing, propeller: 'ducted' }).propeller).toBe('tri');
    expect(cleanLoadout({ ...base, propeller: 'ducted' }).propeller).toBe('ducted');
    expect(cleanLoadout({ ...base, propeller: 'turbine' }).propeller).toBe('tri');
    expect(cleanLoadout({ ...DEFAULT_LOADOUTS.wing, propeller: 'turbine' }).propeller).toBe('turbine');
  });
});
