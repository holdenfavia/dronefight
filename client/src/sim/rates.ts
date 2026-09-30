import type { AxisRates } from '../config';

/**
 * Betaflight "classic" rate curve: stick deflection (-1..1) -> angular rate (deg/s).
 * Mirrors Betaflight's applyBetaflightRates() so pilots can copy their real rates in.
 */
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

/** Rate at full stick deflection, as shown in Betaflight Configurator's "Max Vel" column. */
export function maxRate(rates: AxisRates): number {
  return betaflightRate(1, rates);
}
