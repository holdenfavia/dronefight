// Combat rules shared by client and server (ADR-0009, ADR-0011, ADR-0012). Rules live in the ADRs.
// Per-class numbers (health, damage, fire rate, round speed, hit radius) are in shared/drones.ts (ADR-0013).

export const COMBAT = {
  /** Max round travel (m). */
  range: 300,
  /** Invulnerable this long after respawn, unless you fire. */
  spawnProtectionMs: 2000,
  respawnMs: 3000,
  /** A crash within this long after taking damage credits the kill to the attacker. */
  killCreditMs: 5000,
  killsToWin: 5,
  /** Results screen before the next match starts. */
  resultsMs: 6000,
  /** Server rejects shots that start further than this from the shooter's last known position. */
  maxMuzzleOffset: 4,
  /** Rounds leave this far in front of the camera. */
  muzzleForward: 0.2,
  /** Twin guns (ADR-0011): sideways offset of each gun from the camera, and how far below it (m). */
  gunSide: 0.3,
  gunDrop: 0.1,
  /** Both gun streams are angled to cross this far ahead of the camera (m). */
  convergence: 40,
} as const;

/** Team 0 orange, team 1 lime (ADR-0009). */
export const TEAM_COLORS = ['#ff6a13', '#b6f000'] as const;
export const TEAM_NAMES = ['Orange', 'Lime'] as const;
