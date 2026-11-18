import { describe, expect, it } from 'vitest';
import { cleanTag, parseProfile, PROFILE_COLORS, resolveColors } from './profile.js';

describe('personal settings (ADR-0083)', () => {
  it('cleans tags to capitals and digits, four at most, never CPU', () => {
    expect(cleanTag('hf')).toBe('HF');
    expect(cleanTag('a.b-c d!e')).toBe('ABCD');
    expect(cleanTag('cpu1')).toBe('');
    expect(cleanTag(42)).toBe('');
  });

  it('falls back to the default for bad profiles', () => {
    expect(parseProfile(null)).toEqual({ tag: '', color: -1 });
    expect(parseProfile({ tag: 'zz', color: 99 })).toEqual({ tag: 'ZZ', color: -1 });
    expect(parseProfile({ tag: 'ok', color: 4 })).toEqual({ tag: 'OK', color: 4 });
  });

  it('keeps slot colors when nobody picks', () => {
    expect(resolveColors([-1, -1, -1, -1])).toEqual(PROFILE_COLORS.slice(0, 4));
  });

  it('gives a picked color and moves a CPU off it', () => {
    // Player 1 picks cyan, which is slot 3's color: the CPU in slot 3 takes the first free color.
    expect(resolveColors([2, -1, -1])).toEqual([PROFILE_COLORS[2], PROFILE_COLORS[1], PROFILE_COLORS[0]]);
  });

  it('lets the earlier slot keep a color two players picked', () => {
    const c = resolveColors([4, 4]);
    expect(c[0]).toBe(PROFILE_COLORS[4]);
    expect(c[1]).toBe(PROFILE_COLORS[1]);
    expect(new Set(c).size).toBe(2);
  });
});
