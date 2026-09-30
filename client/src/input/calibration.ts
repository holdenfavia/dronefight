// Stick mapping and calibration maths (ADR-0006). Pure functions, no DOM access.

export const STICK_CHANNELS = ['throttle', 'roll', 'pitch', 'yaw'] as const;
export type StickChannel = (typeof STICK_CHANNELS)[number];

export interface AxisCalibration {
  /** Index into Gamepad.axes. */
  axis: number;
  invert: boolean;
  /** Raw extremes and rest position recorded during calibration. */
  min: number;
  center: number;
  max: number;
}

export type SwitchBinding =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; threshold: number; above: boolean };

export interface ControllerProfile {
  /** Gamepad.id this profile belongs to. */
  id: string;
  axes: Record<StickChannel, AxisCalibration>;
  deadband: number;
  /** Null means no arm switch: the quad arms whenever throttle is low. */
  arm: SwitchBinding | null;
  reset: SwitchBinding | null;
}

export interface RawSnapshot {
  axes: readonly number[];
  buttons: readonly number[];
}

export function applyDeadband(value: number, deadband: number): number {
  const abs = Math.abs(value);
  if (abs <= deadband) return 0;
  return (Math.sign(value) * (abs - deadband)) / (1 - deadband);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Self-centering stick (roll/pitch/yaw): raw -> -1..1 using separate halves around center. */
export function normalizeStick(raw: number, cal: AxisCalibration, deadband: number): number {
  const span = raw >= cal.center ? cal.max - cal.center : cal.center - cal.min;
  let value = span > 1e-6 ? (raw - cal.center) / span : 0;
  value = clamp(value, -1, 1);
  if (cal.invert) value = -value;
  return applyDeadband(value, deadband);
}

/** Throttle: raw -> 0..1 across the full recorded range. */
export function normalizeThrottle(raw: number, cal: AxisCalibration): number {
  const span = cal.max - cal.min;
  let value = span > 1e-6 ? (raw - cal.min) / span : 0;
  value = clamp(value, 0, 1);
  return cal.invert ? 1 - value : value;
}

export function readSwitch(binding: SwitchBinding | null, raw: RawSnapshot): boolean {
  if (!binding) return false;
  if (binding.kind === 'button') return (raw.buttons[binding.index] ?? 0) > 0.5;
  const value = raw.axes[binding.index] ?? 0;
  return binding.above ? value > binding.threshold : value < binding.threshold;
}

// --- Auto-detection helpers used by the calibration wizard.

/** Axis whose value moved furthest from the baseline, ignoring `exclude`. */
export function detectMovedAxis(
  baseline: readonly number[],
  current: readonly number[],
  exclude: readonly number[] = [],
  minDelta = 0.3,
): { axis: number; delta: number } | null {
  let best: { axis: number; delta: number } | null = null;
  for (let i = 0; i < current.length; i++) {
    if (exclude.includes(i)) continue;
    const delta = (current[i] ?? 0) - (baseline[i] ?? 0);
    if (Math.abs(delta) >= minDelta && (!best || Math.abs(delta) > Math.abs(best.delta))) {
      best = { axis: i, delta };
    }
  }
  return best;
}

/** A button newly pressed, or an axis newly moved, compared with the baseline. */
export function detectSwitch(
  baseline: RawSnapshot,
  current: RawSnapshot,
  excludeAxes: readonly number[],
): SwitchBinding | null {
  for (let i = 0; i < current.buttons.length; i++) {
    if ((current.buttons[i] ?? 0) > 0.5 && (baseline.buttons[i] ?? 0) <= 0.5) {
      return { kind: 'button', index: i };
    }
  }
  const moved = detectMovedAxis(baseline.axes, current.axes, excludeAxes, 0.5);
  if (moved) {
    const from = baseline.axes[moved.axis] ?? 0;
    const to = current.axes[moved.axis] ?? 0;
    return { kind: 'axis', index: moved.axis, threshold: (from + to) / 2, above: to > from };
  }
  return null;
}

/** Sensible default for gamepads the browser reports with the "standard" layout (Xbox/PlayStation). */
export function standardGamepadProfile(id: string, deadband: number): ControllerProfile {
  const stick = (axis: number, invert: boolean): AxisCalibration => ({
    axis,
    invert,
    min: -1,
    center: 0,
    max: 1,
  });
  return {
    id,
    // Mode 2 layout: left stick = throttle/yaw, right stick = pitch/roll.
    // Stick up reports -1, so throttle and pitch are inverted.
    axes: {
      throttle: stick(1, true),
      yaw: stick(0, false),
      pitch: stick(3, true),
      roll: stick(2, false),
    },
    deadband: Math.max(deadband, 0.08),
    arm: null,
    reset: { kind: 'button', index: 3 },
  };
}
