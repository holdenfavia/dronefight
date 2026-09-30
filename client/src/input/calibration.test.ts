import { describe, expect, it } from 'vitest';
import {
  applyDeadband,
  detectMovedAxis,
  detectSwitch,
  normalizeStick,
  normalizeThrottle,
  readSwitch,
  type AxisCalibration,
} from './calibration';

// A radio that doesn't use the full -1..1 range and isn't centered at 0, like many USB radios.
const radioAxis: AxisCalibration = { axis: 0, invert: false, min: -0.8, center: 0.05, max: 0.9 };

describe('normalizeStick', () => {
  it('maps center, extremes and halves independently', () => {
    expect(normalizeStick(0.05, radioAxis, 0)).toBe(0);
    expect(normalizeStick(0.9, radioAxis, 0)).toBe(1);
    expect(normalizeStick(-0.8, radioAxis, 0)).toBe(-1);
    expect(normalizeStick(0.475, radioAxis, 0)).toBeCloseTo(0.5);
  });

  it('clamps beyond calibrated range and supports invert', () => {
    expect(normalizeStick(1, radioAxis, 0)).toBe(1);
    expect(normalizeStick(0.9, { ...radioAxis, invert: true }, 0)).toBe(-1);
  });

  it('applies deadband and rescales so full stick is still 1', () => {
    expect(normalizeStick(0.06, radioAxis, 0.02)).toBe(0);
    expect(normalizeStick(0.9, radioAxis, 0.05)).toBeCloseTo(1);
  });
});

describe('normalizeThrottle', () => {
  it('maps full range to 0..1 and supports invert', () => {
    expect(normalizeThrottle(-0.8, radioAxis)).toBe(0);
    expect(normalizeThrottle(0.9, radioAxis)).toBe(1);
    expect(normalizeThrottle(0.9, { ...radioAxis, invert: true })).toBe(0);
  });
});

describe('applyDeadband', () => {
  it('is continuous at the deadband edge', () => {
    expect(applyDeadband(0.1, 0.1)).toBe(0);
    expect(applyDeadband(0.1001, 0.1)).toBeCloseTo(0, 3);
    expect(applyDeadband(-1, 0.1)).toBe(-1);
  });
});

describe('detection', () => {
  it('finds the axis that moved most, with sign, skipping excluded axes', () => {
    const base = [0, 0, 0, 0];
    expect(detectMovedAxis(base, [0.1, -0.9, 0.95, 0], [2])).toEqual({ axis: 1, delta: -0.9 });
    expect(detectMovedAxis(base, [0.1, 0.1, 0, 0])).toBeNull();
  });

  it('detects a pressed button before a moved axis', () => {
    const base = { axes: [0, 0, -1], buttons: [0, 0] };
    expect(detectSwitch(base, { axes: [0, 0, 1], buttons: [0, 1] }, [])).toEqual({ kind: 'button', index: 1 });
  });

  it('detects a switch on an axis and reads it back', () => {
    const base = { axes: [0, 0, -1], buttons: [0] };
    const flipped = { axes: [0, 0, 1], buttons: [0] };
    const binding = detectSwitch(base, flipped, [0, 1]);
    expect(binding).toEqual({ kind: 'axis', index: 2, threshold: 0, above: true });
    expect(readSwitch(binding, flipped)).toBe(true);
    expect(readSwitch(binding, base)).toBe(false);
  });
});
