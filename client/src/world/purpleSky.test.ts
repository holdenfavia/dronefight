import { describe, expect, it } from 'vitest';
import { isPurpleSkyTime } from './purpleSky';

describe('isPurpleSkyTime', () => {
  it('is on from 2:02 to 2:22 pm Central (CDT, UTC-5)', () => {
    expect(isPurpleSkyTime(new Date('2026-10-15T19:01:59Z'))).toBe(false);
    expect(isPurpleSkyTime(new Date('2026-10-15T19:02:00Z'))).toBe(true);
    expect(isPurpleSkyTime(new Date('2026-10-15T19:21:59Z'))).toBe(true);
    expect(isPurpleSkyTime(new Date('2026-10-15T19:22:00Z'))).toBe(false);
  });

  it('follows daylight saving (CST, UTC-6)', () => {
    expect(isPurpleSkyTime(new Date('2026-12-15T19:05:00Z'))).toBe(false);
    expect(isPurpleSkyTime(new Date('2026-12-15T20:05:00Z'))).toBe(true);
  });

  it('is off at 2:05 am', () => {
    expect(isPurpleSkyTime(new Date('2026-10-15T07:05:00Z'))).toBe(false);
  });
});
