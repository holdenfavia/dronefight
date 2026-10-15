import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES } from '../config';
import { actualRate, betaflightRate, convertRates, maxRate, parseRateDump, quickRate, rateCurve } from './rates';

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

describe('rate types (ADR-0068)', () => {
  it('Actual rates hit their center and max rates', () => {
    const a = { rcRate: 200, superRate: 670, expo: 0.54 };
    expect(actualRate(1, a)).toBeCloseTo(670);
    expect(actualRate(1e-4, a) / 1e-4).toBeCloseTo(200, 0);
    expect(actualRate(-1, a)).toBeCloseTo(-670);
  });

  it('Quick rates hit their max rate, with the RC rate at center', () => {
    const q = { rcRate: 1, superRate: 670, expo: 0 };
    expect(quickRate(1, q)).toBeCloseTo(670);
    expect(quickRate(1e-4, q) / 1e-4).toBeCloseTo(200, 0);
  });

  it('converting keeps the center and max rate', () => {
    const bf = DEFAULT_RATES;
    for (const to of ['actual', 'quick'] as const) {
      const c = convertRates(bf, to);
      expect(maxRate(c.roll, to)).toBeCloseTo(maxRate(bf.roll), -1);
      expect(rateCurve(1e-4, c.roll, to) / 1e-4).toBeCloseTo(200, -1);
      const back = convertRates(c, 'betaflight');
      expect(maxRate(back.roll)).toBeCloseTo(maxRate(bf.roll), -1);
    }
  });

  it('reads a Betaflight CLI dump', () => {
    const dump = `# rateprofile 0
rateprofile 0
set rates_type = ACTUAL
set roll_rc_rate = 7
set pitch_rc_rate = 7
set yaw_rc_rate = 7
set roll_expo = 0
set pitch_expo = 0
set yaw_expo = 0
set roll_srate = 67
set pitch_srate = 67
set yaw_srate = 67`;
    const r = parseRateDump(dump, DEFAULT_RATES)!;
    expect(r.type).toBe('actual');
    expect(r.roll).toEqual({ rcRate: 70, superRate: 670, expo: 0 });
    expect(maxRate(r.yaw, r.type)).toBeCloseTo(670);
    const bf = parseRateDump('set roll_rc_rate = 120\nset roll_srate = 75\nset roll_expo = 10', DEFAULT_RATES)!;
    expect(bf.type).toBe('betaflight');
    expect(bf.roll).toEqual({ rcRate: 1.2, superRate: 0.75, expo: 0.1 });
    expect(parseRateDump('hello', DEFAULT_RATES)).toBeNull();
    expect(parseRateDump('set rates_type = KISS', DEFAULT_RATES)).toBeNull();
  });
});
