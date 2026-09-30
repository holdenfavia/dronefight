import { describe, expect, it } from 'vitest';
import { interceptTime } from './lead.js';

describe('interceptTime', () => {
  it('is distance / speed for a still target', () => {
    expect(interceptTime(0, 0, -35, 0, 0, 0, 350)).toBeCloseTo(0.1);
  });

  it('leads a crossing target so round and target meet', () => {
    const [dx, dz, vx, s] = [0, -40, 30, 350];
    const t = interceptTime(dx, 0, dz, vx, 0, 0, s);
    expect(t).not.toBeNull();
    const meet = Math.hypot(dx + vx * (t ?? 0), dz);
    expect(meet).toBeCloseTo(s * (t ?? 0), 4);
  });

  it('gives up on a target running away faster than the round', () => {
    expect(interceptTime(0, 0, -50, 0, 0, -400, 350)).toBeNull();
  });
});
