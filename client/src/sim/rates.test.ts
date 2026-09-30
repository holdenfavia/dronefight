import { describe, expect, it } from 'vitest';
import { betaflightRate, maxRate } from './rates';

describe('betaflightRate', () => {
  const defaults = { rcRate: 1.0, superRate: 0.7, expo: 0.0 };

  it('is zero at center and symmetric', () => {
    expect(betaflightRate(0, defaults)).toBe(0);
    expect(betaflightRate(-0.5, defaults)).toBeCloseTo(-betaflightRate(0.5, defaults));
  });

  it('matches Betaflight max velocity for 1.0 / 0.70 / 0.00 (667 deg/s)', () => {
    expect(maxRate(defaults)).toBeCloseTo(666.67, 1);
  });

  it('is 200 * rcRate at full stick with no super rate', () => {
    expect(maxRate({ rcRate: 1.2, superRate: 0, expo: 0 })).toBeCloseTo(240);
  });

  it('expo softens center without changing the endpoint', () => {
    const withExpo = { ...defaults, expo: 0.5 };
    expect(Math.abs(betaflightRate(0.2, withExpo))).toBeLessThan(Math.abs(betaflightRate(0.2, defaults)));
    expect(maxRate(withExpo)).toBeCloseTo(maxRate(defaults));
  });

  it('applies the rcRate > 2 boost', () => {
    expect(maxRate({ rcRate: 2.1, superRate: 0, expo: 0 })).toBeCloseTo(200 * (2.1 + 14.54 * 0.1));
  });

  it('clamps stick input', () => {
    expect(betaflightRate(1.5, defaults)).toBeCloseTo(maxRate(defaults));
  });
});
