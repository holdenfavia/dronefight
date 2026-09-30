import { describe, expect, it } from 'vitest';
import { coasterTiming, moverDistance, moverPose, roundedRect, routeFromPoints, sampleRoute, type V3 } from './movers.js';

describe('mover routes (ADR-0020)', () => {
  const square = routeFromPoints(roundedRect(-10, -10, 10, 10, 2, 0, false));

  it('a rounded rectangle is a closed loop of about the right length', () => {
    // Straight parts 4 x (20 - 4) plus a full circle of radius 2.
    expect(square.length).toBeCloseTo(64 + 2 * Math.PI * 2, 0);
  });

  it('samples positions on the loop and wraps', () => {
    const p: V3 = [0, 0, 0];
    const d: V3 = [0, 0, 0];
    sampleRoute(square, square.length + 1, p, d);
    const q: V3 = [0, 0, 0];
    sampleRoute(square, 1, q, d);
    expect(p[0]).toBeCloseTo(q[0]);
    expect(p[2]).toBeCloseTo(q[2]);
    expect(Math.hypot(...d)).toBeCloseTo(1);
  });

  it('constant-speed movers are where speed x time says', () => {
    const m = { kind: 'car' as const, route: square, offset: 0, speed: 5, color: '#fff', size: [2, 1, 4] as V3, lift: 0 };
    expect(moverDistance(m, 3)).toBeCloseTo(15);
  });

  it('the coaster is slow at the top and fast at the bottom', () => {
    // A loop that goes up to 30 m and down to 5 m.
    const pts: V3[] = [];
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      pts.push([50 * Math.cos(a), 17.5 + 12.5 * Math.sin(a), 50 * Math.sin(a)]);
    }
    const route = routeFromPoints(pts);
    const timing = coasterTiming(route, 5);
    const m = { kind: 'coasterCar' as const, route, offset: 0, timing, color: '#f00', size: [2, 1, 3] as V3, lift: 0 };
    const speedNear = (targetY: number) => {
      // Find a time where the train is near targetY and measure its speed there.
      const p: V3 = [0, 0, 0];
      const d: V3 = [0, 0, 0];
      for (let t = 0; t < timing.lapSeconds; t += 0.05) {
        moverPose(m, t, p, d);
        if (Math.abs(p[1] - targetY) < 0.3) return (moverDistance(m, t + 0.05) - moverDistance(m, t)) / 0.05;
      }
      return NaN;
    };
    expect(speedNear(30)).toBeLessThan(8);
    expect(speedNear(5)).toBeGreaterThan(20);
    expect(timing.lapSeconds).toBeGreaterThan(5);
  });
});
