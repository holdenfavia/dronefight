// Class specials shared by client and server (ADR-0015, ADR-0016).

/** 3D quad smoke screen. */
export const SMOKE = {
  durationMs: 6000,
  cooldownMs: 10000,
  startRadius: 2,
  maxRadius: 9,
  growMs: 1000,
  /** The last part of the duration fades out (and stops concealing halfway through the fade). */
  fadeMs: 1200,
} as const;

/** Cloud radius (m) at `ageMs` after deploying, for concealment checks; 0 once it no longer hides anything. */
export function smokeRadius(ageMs: number): number {
  if (ageMs < 0 || ageMs > SMOKE.durationMs - SMOKE.fadeMs / 2) return 0;
  const grow = Math.min(1, ageMs / SMOKE.growMs);
  return SMOKE.startRadius + (SMOKE.maxRadius - SMOKE.startRadius) * (1 - (1 - grow) * (1 - grow));
}

// Freestyle's guided missile lives in shared/missile.ts.
