// Class specials shared by client and server (ADR-0016, ADR-0024).

/**
 * 3D quad smoke trail (ADR-0024): for `durationMs` the other pilot sees only your frame (no glow, trail,
 * lead dot or marker) while you leave a thin smoke trail.
 */
export const SMOKE = {
  durationMs: 6000,
  cooldownMs: 10000,
  /** Trail puffs: one every `puffEveryMs`, growing from `puffStart` to `puffEnd` metres over `puffLifeMs`. */
  puffEveryMs: 40,
  puffStart: 0.35,
  puffEnd: 1.8,
  puffLifeMs: 1600,
} as const;

// Freestyle's guided missile lives in shared/missile.ts.
