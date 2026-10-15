import type { AxisRates, RateType, Rates } from '../config';

/**
 * Betaflight's rate curves (ADR-0068): stick deflection (-1..1) -> angular rate (deg/s). Each mirrors the
 * firmware's own function so pilots can copy their real rates in.
 */

/** Betaflight "classic" rates: applyBetaflightRates(). */
export function betaflightRate(stick: number, rates: AxisRates): number {
  const x = Math.max(-1, Math.min(1, stick));
  const abs = Math.abs(x);

  let command = x;
  if (rates.expo > 0) {
    command = x * abs * abs * abs * rates.expo + x * (1 - rates.expo);
  }

  let rcRate = rates.rcRate;
  if (rcRate > 2) {
    rcRate += 14.54 * (rcRate - 2);
  }

  let rate = 200 * rcRate * command;
  if (rates.superRate > 0) {
    const superFactor = 1 / Math.max(0.01, Math.min(1, 1 - abs * rates.superRate));
    rate *= superFactor;
  }
  return rate;
}

/** Actual rates: applyActualRates(). rcRate = center sensitivity (°/s), superRate = max rate (°/s). */
export function actualRate(stick: number, rates: AxisRates): number {
  const x = Math.max(-1, Math.min(1, stick));
  const abs = Math.abs(x);
  const e = rates.expo;
  const curve = abs * (x ** 5 * e + x * (1 - e));
  const center = rates.rcRate;
  const movement = Math.max(0, rates.superRate - center);
  return x * center + movement * curve;
}

/** Quick rates: applyQuickRates(). rcRate as in Betaflight (×200 °/s at center), superRate = max rate (°/s). */
export function quickRate(stick: number, rates: AxisRates): number {
  const x = Math.max(-1, Math.min(1, stick));
  const abs = Math.abs(x);
  const rc = rates.rcRate * 200;
  const max = Math.max(rates.superRate, rc);
  const superConfig = (max / rc - 1) / (max / rc);
  const curve = rates.expo > 0 ? x * abs * abs * rates.expo + x * (1 - rates.expo) : x;
  const superFactor = 1 / Math.max(0.01, Math.min(1, 1 - abs * superConfig));
  return curve * rc * superFactor;
}

export function rateCurve(stick: number, rates: AxisRates, type: RateType = 'betaflight'): number {
  if (type === 'actual') return actualRate(stick, rates);
  if (type === 'quick') return quickRate(stick, rates);
  return betaflightRate(stick, rates);
}

/** Rate at full stick deflection, as shown in Betaflight Configurator's "Max Vel" column. */
export function maxRate(rates: AxisRates, type: RateType = 'betaflight'): number {
  return rateCurve(1, rates, type);
}

/** Each type's three numbers: label, input step and range, as Betaflight Configurator shows them. */
export const RATE_FIELDS: Record<RateType, Record<keyof AxisRates, { label: string; step: number; min: number; max: number }>> = {
  betaflight: {
    rcRate: { label: 'RC rate', step: 0.01, min: 0.01, max: 3 },
    superRate: { label: 'Super', step: 0.01, min: 0, max: 0.99 },
    expo: { label: 'Expo', step: 0.01, min: 0, max: 1 },
  },
  actual: {
    rcRate: { label: 'Center °/s', step: 10, min: 10, max: 2000 },
    superRate: { label: 'Max °/s', step: 10, min: 10, max: 2000 },
    expo: { label: 'Expo', step: 0.01, min: 0, max: 1 },
  },
  quick: {
    rcRate: { label: 'RC rate', step: 0.01, min: 0.01, max: 3 },
    superRate: { label: 'Max °/s', step: 10, min: 10, max: 2000 },
    expo: { label: 'Expo', step: 0.01, min: 0, max: 1 },
  },
};

export const RATE_TYPE_LABELS: Record<RateType, string> = { betaflight: 'Betaflight', actual: 'Actual', quick: 'Quick' };

/**
 * The same feel in another rate type: keeps the center sensitivity and the max rate, expo reset to 0. Exact
 * for most pilots' rates; the curve between can differ a little.
 */
export function convertAxis(rates: AxisRates, from: RateType, to: RateType): AxisRates {
  if (from === to) return { ...rates };
  const center = rateCurve(1e-4, rates, from) / 1e-4;
  const max = Math.max(center, maxRate(rates, from));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  if (to === 'actual') return { rcRate: Math.round(center), superRate: Math.round(max), expo: 0 };
  if (to === 'quick') return { rcRate: r2(center / 200), superRate: Math.round(max), expo: 0 };
  // Betaflight: max = 200·rc / (1 - super) for rc ≤ 2.
  const rc = r2(Math.min(2, center / 200));
  return { rcRate: rc, superRate: r2(Math.max(0, Math.min(0.99, 1 - (200 * rc) / max))), expo: 0 };
}

export function convertRates(rates: Rates, to: RateType): Rates {
  return {
    type: to,
    roll: convertAxis(rates.roll, rates.type, to),
    pitch: convertAxis(rates.pitch, rates.type, to),
    yaw: convertAxis(rates.yaw, rates.type, to),
  };
}

/**
 * Rates from a Betaflight CLI dump (`dump`, `diff all` or `rateprofile`): reads rates_type and the
 * roll/pitch/yaw rc_rate, srate and expo lines. Unset values keep `base`. Null if nothing was recognized.
 */
export function parseRateDump(text: string, base: Rates): Rates | null {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*set\s+(\w+)\s*=\s*(\S+)/i.exec(line);
    if (m) values.set(m[1]!.toLowerCase(), m[2]!.toUpperCase());
  }
  const typeName = values.get('rates_type');
  const type: RateType | null = typeName === 'ACTUAL' ? 'actual' : typeName === 'QUICK' ? 'quick' : typeName === 'BETAFLIGHT' ? 'betaflight' : typeName ? null : base.type;
  // RACEFLIGHT and KISS aren't supported.
  if (!type) return null;
  let found = typeName !== undefined;
  const out: Rates = convertRates(base, type);
  for (const axis of ['roll', 'pitch', 'yaw'] as const) {
    const num = (key: string) => {
      const v = values.get(key);
      const n = v === undefined ? NaN : Number(v);
      if (Number.isFinite(n)) found = true;
      return n;
    };
    // Betaflight stores integers: rc_rate and srate in hundredths (Betaflight, Quick rc) or tens of °/s.
    const rc = num(`${axis}_rc_rate`);
    const sr = num(`${axis}_srate`);
    const ex = num(`${axis}_expo`);
    const a = out[axis];
    if (Number.isFinite(rc)) a.rcRate = type === 'actual' ? rc * 10 : rc / 100;
    if (Number.isFinite(sr)) a.superRate = type === 'betaflight' ? sr / 100 : sr * 10;
    if (Number.isFinite(ex)) a.expo = ex / 100;
  }
  return found ? out : null;
}
