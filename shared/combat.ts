// Combat rules shared by client and server (ADR-0009, ADR-0011, ADR-0012, ADR-0026). Rules live in the ADRs.
// Per-weapon numbers are in shared/weapons.ts, per-body health and hit radius in shared/drones.ts (ADR-0033, ADR-0036).

export const COMBAT = {
  /** Max round travel (m). */
  range: 300,
  /** Invulnerable this long after respawn, unless you fire. */
  spawnProtectionMs: 2000,
  respawnMs: 3000,
  /** A crash within this long after taking damage credits the kill to the attacker. */
  killCreditMs: 5000,
  /** Free-for-all (ADR-0026): first to this many kills wins. */
  killsToWin: 10,
  /** Results screen before the next match starts. */
  resultsMs: 6000,
  /** Server rejects shots that start further than this from the shooter's last known position. */
  maxMuzzleOffset: 4,
  /** Rounds leave this far in front of the camera. */
  muzzleForward: 0.2,
  /**
   * Gun muzzles around the camera (ADR-0011, ADR-0033): sideways offset, and how far above (hardpoints 1-2)
   * or below (3-4) it (m). Hardpoint 1 is upper left, 2 upper right, 3 lower left, 4 lower right.
   */
  gunSide: 0.5,
  gunRise: 0.3,
  gunDrop: 0.3,
  /** Both gun streams are angled to cross this far ahead of the camera (m). */
  convergence: 40,
} as const;

/** One color per pilot (ADR-0026), indexed by `MatchPlayer.team` (the color slot). Orange and lime first (ADR-0009). */
export const PILOT_COLORS = ['#ff6a13', '#b6f000', '#22d3ee', '#ff3fa4', '#ffd400', '#9b5cff', '#ff3b3b', '#3b82ff', '#f2f2f2', '#00e0a0'] as const;
export const PILOT_NAMES = ['Orange', 'Lime', 'Cyan', 'Pink', 'Yellow', 'Purple', 'Red', 'Blue', 'White', 'Teal'] as const;

/** A pilot's color and name by color slot (wraps, never undefined). */
export const pilotColor = (slot: number | null | undefined): string => PILOT_COLORS[(slot ?? 0) % PILOT_COLORS.length] ?? PILOT_COLORS[0];
export const pilotName = (slot: number | null | undefined): string => PILOT_NAMES[(slot ?? 0) % PILOT_NAMES.length] ?? 'Pilot';
