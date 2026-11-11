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

/** Smash attacks: press a direction key and the matching attack together (ADR-0071). */
export const SMASH = {
  /** The direction key counts as "together" if pressed this many frames before the attack, or less. */
  flickFrames: 5,
} as const;

/** Grabs and throws (ADR-0071). */
export const GRAB = {
  /** Frames a grab holds before letting go on its own, plus more the more damage the held drone has. */
  holdBase: 70,
  holdPerPercent: 0.8,
  /** Each fresh key press by the held drone takes this many frames off. */
  mash: 5,
  /** Both drones stagger this long when the grab breaks. */
  releaseFrames: 16,
  /** Whiffed grab: extra lag is already in the move; grabbed drones are held this far apart (fraction of widths). */
  holdOverlap: 0.75,
} as const;

/** Teching: press shield just before you hit the floor while launched. */
export const TECH = {
  /** A shield press this many frames before landing counts. */
  window: 14,
  /** Pressing again within this many frames of the last press doesn't count (no mashing). */
  lockout: 40,
  inPlaceFrames: 22,
  rollFrames: 28,
  rollDistance: 130,
  invincibleFrames: 18,
} as const;

/** Lying on the floor after a missed tech. */
export const KNOCKDOWN = {
  /** Earliest frame you can get up. */
  minFrames: 14,
  /** Get up on your own after this long. */
  maxFrames: 70,
  getupFrames: 24,
  getupInvincible: 18,
  rollFrames: 30,
  rollDistance: 150,
} as const;

/** Using the same move again and again weakens it (ADR-0071). */
export const STALE = {
  /** Remember this many of your last hits. */
  queue: 8,
  /** Damage and knockback lost per copy of the move in the queue. */
  perUse: 0.06,
  min: 0.6,
} as const;

/** Parry: shield on the exact frames a hit lands. */
export const PARRY = {
  /** The first frames of a shield. */
  window: 5,
  /** Extra freeze on the attacker, so the parry can punish. */
  attackerLag: 14,
} as const;

/** Air dodge with a direction held: a quick dash that way. */
export const AIRDODGE = {
  speed: 780,
  /** Frames the dash keeps its speed before gravity comes back. */
  dashFrames: 12,
  /** Landing lag after a directional air dodge. */
  landLag: 10,
} as const;

/** Frames after an air jump in which an up special gives the jump back (W then Space). */
export const UP_SPECIAL_JUMP_REFUND = 5;

/** Dropping through a girder: hold down this long. */
export const DROP_HOLD_FRAMES = 4;

/** Shield release lag. */
export const SHIELD_DROP_FRAMES = 7;
