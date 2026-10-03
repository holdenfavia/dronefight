import { describe, expect, it } from 'vitest';
import { cleanPilotName, completeLooks, DEFAULT_LOOKS, isDroneLook, NAME_MAX, PAINTS } from './cosmetics.js';

describe('cosmetics (ADR-0030)', () => {
  it('validates looks against the catalog', () => {
    expect(isDroneLook({ body: 'red', pattern: 'stripes', accent: 'white' })).toBe(true);
    expect(isDroneLook({ body: 'red', pattern: 'lasers', accent: 'white' })).toBe(false);
    expect(isDroneLook({ body: '#ff0000', pattern: 'solid', accent: 'white' })).toBe(false);
    expect(isDroneLook(null)).toBe(false);
  });

  it('cleans pilot names: safe characters, trimmed, capped', () => {
    expect(cleanPilotName('  Holden  ')).toBe('Holden');
    expect(cleanPilotName('<script>x</script>')).toBe('scriptxscript');
    expect(cleanPilotName('a'.repeat(40))).toHaveLength(NAME_MAX);
    expect(cleanPilotName(42)).toBe('');
  });

  it('fills missing or broken saved looks from the defaults', () => {
    const looks = completeLooks({ wing: { body: 'pink', pattern: 'camo', accent: 'gold' }, quad3d: 'nonsense' });
    expect(looks.wing).toEqual({ body: 'pink', pattern: 'camo', accent: 'gold' });
    expect(looks.quad3d).toEqual(DEFAULT_LOOKS.quad3d);
    expect(looks.freestyle).toEqual(DEFAULT_LOOKS.freestyle);
  });

  it('paint ids are unique', () => {
    expect(new Set(PAINTS.map((p) => p.id)).size).toBe(PAINTS.length);
  });
});
