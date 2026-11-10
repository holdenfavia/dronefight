// Game feel for the side-view fighter (ADR-0070). Every tuning number lives here or in fighters.ts.

/** Simulation rate. The sim is a fixed step so it can later run identically on every machine. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const MATCH = {
  /** 3-2-1-GO before anyone can move. */
  countdownFrames: 180,
  defaultStocks: 3,
  maxFighters: 4,
  /** Frames between a KO and the respawn platform appearing. */
  respawnDelayFrames: 60,
  /** Longest a fighter may wait on the respawn platform before it drops them. */
  respawnWaitFrames: 180,
  /** Invincibility after leaving the respawn platform. */
  respawnInvincibleFrames: 100,
  /** Height above the stage where fighters respawn. */
  respawnHeight: 330,
} as const;

export const KNOCKBACK = {
  /** Launch speed (u/s) per point of knockback. */
  launchScale: 11,
  /** How fast the launch speed bleeds off (u/s²). */
  launchDecay: 1250,
  /** Hitstun frames per point of knockback. */
  hitstunPerKb: 0.42,
  /** Knockback above this leaves a smoke trail and tumbles the drone. */
  tumbleKb: 80,
  /** Hold a direction when hit to bend the launch angle by up to this many degrees (directional influence). */
  diDegrees: 13,
  /** Spiked into the floor this fast (u/s) or more: bounce instead of landing. */
  groundBounceSpeed: 700,
} as const;

export const HITLAG = {
  base: 4,
  perDamage: 0.45,
  max: 18,
} as const;

export const SHIELD = {
  maxHp: 50,
  /** Per frame while held. */
  drain: 0.14,
  /** Per frame while not held. */
  regen: 0.09,
  /** Shield damage per point of attack damage. */
  damageScale: 1.25,
  breakStunFrames: 150,
  /** Hit on the shield: frames before you can act again. */
  stunFrames: 6,
} as const;

export const DODGE = {
  rollFrames: 22,
  rollDistance: 170,
  rollInvincible: [3, 16] as const,
  spotFrames: 18,
  spotInvincible: [2, 14] as const,
  airFrames: 26,
  airInvincible: [3, 20] as const,
} as const;

export const MOVEMENT = {
  jumpsquatFrames: 4,
  /** Release jump during jumpsquat: a short hop at this fraction of jump speed. */
  shortHop: 0.64,
  landFrames: 3,
  dropThroughFrames: 12,
  /** Ground friction (u/s²) when not walking. */
  friction: 2800,
  groundAccel: 3200,
  /** Drift allowed during an aerial attack, as a fraction of normal air acceleration. */
  attackAirControl: 0.8,
  /** Helpless fall after an up special: drift only. */
  helplessAirControl: 0.6,
} as const;

/** Recovering near the stage's corner pulls you up onto it. */
export const LEDGE = {
  /** How far below the top of the stage the pull reaches. */
  reachBelow: 80,
  /** During an up special or the helpless fall after it: reaches further, so you never bonk under the lip. */
  reachBelowRecovering: 160,
  /** How far out past the edge, beyond the drone's half width. */
  reachOut: 30,
  climbFrames: 10,
  invincibleFrames: 14,
} as const;
