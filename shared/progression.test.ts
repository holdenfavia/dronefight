import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, xpForLevel } from './progression.js';

describe('levels (ADR-0032)', () => {
  it('follows 250·n·(n−1)', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(3)).toBe(1500);
    expect(xpForLevel(5)).toBe(5000);
    expect(xpForLevel(10)).toBe(22500);
  });

  it('levelForXp is the inverse, exactly at the boundaries', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
    expect(levelForXp(1499)).toBe(2);
    expect(levelForXp(1500)).toBe(3);
    for (let level = 1; level < 200; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level) - 1)).toBe(Math.max(1, level - 1));
    }
  });

  it('reports progress through the current level', () => {
    expect(levelProgress(700)).toEqual({ level: 2, into: 200, span: 1000 });
  });
});
