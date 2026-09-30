// Combat tuning shared by client and server (ADR-0009). Rules live in the ADR; numbers are tunable here.

export const COMBAT = {
  fireRate: 12,
  /** Round speed (m/s). */
  bulletSpeed: 350,
  /** Max round travel (m). */
  range: 300,
  damage: 12,
  maxHp: 100,
  /** Hit sphere around a drone (m). Generous: the quad is small and there is lag. */
  hitRadius: 0.45,
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
  /** Rounds leave the nose this far in front of the camera. */
  muzzleForward: 0.2,
} as const;

/** Team 0 orange, team 1 lime (ADR-0009). */
export const TEAM_COLORS = ['#ff6a13', '#b6f000'] as const;
export const TEAM_NAMES = ['Orange', 'Lime'] as const;
