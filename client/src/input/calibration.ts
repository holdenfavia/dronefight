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
  /** Optional: profiles saved before combat existed don't have it (ADR-0009). */
  fire?: SwitchBinding | null;
  /** Optional class ability, e.g. the wing's maneuver mode (ADR-0022). */
  special?: SwitchBinding | null;
  /** Optional: switch between guns and missile pods when the special slot is taken (ADR-0033). */
  weaponSwitch?: SwitchBinding | null;
  /** Stick sensitivity for roll/pitch/yaw (1 = as calibrated). Thumbsticks often want less. */
  sensitivity?: number;
}

/** Sensitivity slider range in Controller setup. */
export const SENSITIVITY_RANGE = { min: 0.3, max: 1.5 } as const;

/** Scale a -1..1 stick value by the profile's sensitivity, keeping it in range. */
export function applySensitivity(value: number, sensitivity = 1): number {
  return clamp(value * sensitivity, -1, 1);
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

/**
 * Controllers that look like gamepads by name (Logitech, 8BitDo, generic "USB gamepad"…). Radios
 * (DJI, EdgeTX/OpenTX, Radiomaster, TBS…) don't match: they always go through Controller setup.
 */
export function looksLikeGamepad(id: string): boolean {
  return /gamepad|game ?pad|controller|joypad|logitech|dual ?action|rumble|f310|f510|f710|xbox|8bitdo|wireless controller|dualsense|dualshock|pro controller|046d/i.test(id) &&
    !/dji|opentx|edgetx|radiomaster|frsky|tbs|jumper|tx16|zorro|boxer/i.test(id);
}

/**
 * Best guess for a gamepad the browser doesn't map to the "standard" layout (e.g. a Logitech in
 * DirectInput mode): the usual axis order (left X/Y, right X/Y) and the usual button numbers.
 * Shown as "guessed" so the pilot checks it, and Calibrate sticks fixes it if it's wrong.
 */
export function guessedGamepadProfile(id: string, deadband: number): ControllerProfile {
  return { ...standardGamepadProfile(id, deadband), sensitivity: 0.8 };
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
    // Right trigger fires; left trigger is the class special (wing maneuver mode).
    fire: { kind: 'button', index: 7 },
    special: { kind: 'button', index: 6 },
    // Right bumper switches guns / missiles (ADR-0033).
    weaponSwitch: { kind: 'button', index: 5 },
    // Thumbsticks are short and twitchy compared with radio gimbals.
    sensitivity: 0.8,
  };
}
