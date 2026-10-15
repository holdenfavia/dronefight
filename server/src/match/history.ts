import { NET, type Vec3 } from '../../../shared/protocol.js';

/**
 * Lag compensation (ADR-0004): a round is tested against where the shooter *saw* the target (100 ms behind
 * the shot's server time, matching the client's interpolation buffer), rewinding at most MAX_REWIND_MS.
 */

/** Position history kept per pilot for lag compensation. Bounded by time. */
export const HISTORY_MS = 1500;
export const MAX_REWIND_MS = NET.maxDisplayDelayMs;

export interface HistoryEntry {
  st: number;
  p: Vec3;
  v: Vec3;
}

/** Add a position and forget the ones older than HISTORY_MS (always keeping the newest). */
export function pushHistory(history: HistoryEntry[], entry: HistoryEntry): void {
  history.push(entry);
  while (history.length > 1 && (history[0]?.st ?? entry.st) < entry.st - HISTORY_MS) history.shift();
}

/** Target position at server time `t`: interpolated, or briefly extrapolated past the newest entry. */
export function sampleHistory(history: readonly HistoryEntry[], t: number): Vec3 | null {
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return null;
  if (t >= last.st) {
    const dt = Math.min(t - last.st, NET.maxExtrapolateMs) / 1000;
    return [last.p[0] + last.v[0] * dt, last.p[1] + last.v[1] * dt, last.p[2] + last.v[2] * dt];
  }
  if (t <= first.st) return first.p;
  for (let i = history.length - 1; i > 0; i--) {
    const a = history[i - 1];
    const b = history[i];
    if (a && b && a.st <= t && t <= b.st) {
      const k = b.st > a.st ? (t - a.st) / (b.st - a.st) : 0;
      return [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
    }
  }
  return last.p;
}
