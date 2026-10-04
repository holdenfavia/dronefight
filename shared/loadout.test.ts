import { describe, expect, it } from 'vitest';
import { DRONE_CLASSES, DRONE_ORDER } from './drones.js';
import { cleanLoadout, DEFAULT_LOADOUTS, defaultLoadout, guns, handling, loadFactor, missilePods, thrustToWeight, totalKg } from './loadout.js';

describe('loadouts (ADR-0033)', () => {
  it('every default loadout flies exactly as tuned (load factor 1) and has a valid shape', () => {
    for (const id of DRONE_ORDER) {
      const l = DEFAULT_LOADOUTS[id];
      expect(loadFactor(l)).toBeCloseTo(1, 10);
      expect(l.weapons).toHaveLength(DRONE_CLASSES[id].hardpoints);
      expect(cleanLoadout(l)).toEqual(l);
    }
  });

  it('defaults keep the tuned thrust-to-weight', () => {
    expect(thrustToWeight(DEFAULT_LOADOUTS.freestyle)).toBeCloseTo(8, 5);
    expect(thrustToWeight(DEFAULT_LOADOUTS.quad3d)).toBeCloseTo(7, 5);
    expect(thrustToWeight(DEFAULT_LOADOUTS.x8)).toBeCloseTo(4, 5);
  });

  it('weight adds up and makes builds heavier; four rail guns ground an X8', () => {
    const x8Rails = cleanLoadout({ body: 'x8', weapons: ['rail', 'rail', 'rail', 'rail'], special: null });
    expect(totalKg(x8Rails)).toBeCloseTo(2 + 4 * 2.8, 5);
    expect(thrustToWeight(x8Rails)).toBeLessThan(1);
    expect(handling(thrustToWeight(x8Rails)).level).toBe('grounded');
    const freestyleRail = cleanLoadout({ body: 'freestyle', weapons: ['rail', 'gun'], special: null });
    expect(loadFactor(freestyleRail)).toBeGreaterThan(3);
    expect(handling(thrustToWeight(freestyleRail)).level).toBe('heavy');
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

describe('propellers (ADR-0035)', () => {
  it('heavy-lift props lift more; bi-blades less; ducts only fit quads', () => {
    const base = DEFAULT_LOADOUTS.freestyle;
    const heavy = cleanLoadout({ ...base, propeller: 'heavy' });
    const bi = cleanLoadout({ ...base, propeller: 'bi' });
    expect(thrustToWeight(heavy)).toBeGreaterThan(thrustToWeight(base) * 1.25);
    expect(thrustToWeight(bi)).toBeLessThan(thrustToWeight(base));
    expect(cleanLoadout({ ...DEFAULT_LOADOUTS.wing, propeller: 'ducted' }).propeller).toBe('tri');
    expect(cleanLoadout({ ...base, propeller: 'ducted' }).propeller).toBe('ducted');
    expect(cleanLoadout({ ...base, propeller: 'jet' }).propeller).toBe('tri');
  });

  it('heavy-lift props get a four-rail X8 off the ground', () => {
    const rails = cleanLoadout({ body: 'x8', weapons: ['rail', 'rail', 'rail', 'rail'], special: null });
    expect(thrustToWeight(rails)).toBeLessThan(1);
    expect(thrustToWeight({ ...rails, propeller: 'heavy' })).toBeGreaterThan(1.1);
  });
});
