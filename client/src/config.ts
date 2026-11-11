// Client look and feel (ADR-0070). Simulation tuning lives in shared/fighter/config.ts.

/** One color per slot: orange and lime first (ADR-0026). */
export const SLOT_COLORS = ['#ff6a13', '#9be22d', '#2ec5ff', '#ff4fa3'] as const;

export const PALETTE = {
  orange: '#ff6a13',
  ink: '#141516',
  carbon: '#1d1f22',
  steel: '#3a3e44',
  metal: '#9aa0a6',
  white: '#eeeeea',
  skyTop: '#2a78d6',
  skyHorizon: '#ffd9a8',
  // The daily purple sky (ADR-0069).
  purpleTop: '#4b1d8f',
  purpleHorizon: '#d9b8ff',
} as const;

/** How the characters are drawn. 'stick' = placeholder stick figures (2026-11-10); 'drone' = the drone art. */
export const CHARACTER_ART: 'stick' | 'drone' = 'stick';

export const CAMERA = {
  /** World units shown vertically at zoom 1 (scaled to the window height). */
  baseHeight: 720,
  /** Space kept around the fighters. */
  padding: 230,
  minZoom: 0.42,
  maxZoom: 1.15,
  /** Fraction of the way to the target per frame. */
  follow: 0.08,
  /** Never frame anything past this far beyond the blast zones. */
  blastMargin: 60,
} as const;

export const FEEL = {
  /** Screen shake (px) per point of knockback. */
  shakePerKb: 0.09,
  maxShake: 26,
  shakeDecay: 0.86,
  /** Above this percent drones start smoking. */
  smokePercent: 90,
} as const;

export const AUDIO = {
  master: 0.5,
} as const;

