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
  /** Knockback above this leaves a smoke trail and tumbles the fighter. */
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
  /** How far out past the edge, beyond the fighter's half width. */
  reachOut: 30,
  climbFrames: 10,
  invincibleFrames: 14,
} as const;

/** Grabs and throws (ADR-0071). */
export const GRAB = {
  /** Frames a grab holds before letting go on its own, plus more the more damage the held fighter has. */
  holdBase: 70,
  holdPerPercent: 0.8,
  /** Each fresh key press by the held fighter takes this many frames off. */
  mash: 5,
  /** Both fighters stagger this long when the grab breaks. */
  releaseFrames: 16,
  /** Whiffed grab: extra lag is already in the move; grabbed fighters are held this far apart (fraction of widths). */
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

/** Spark's rewind: frames of position history kept (the move snaps back by its own `back`). */
export const REWIND_HISTORY_FRAMES = 60;

/** Reflected projectiles (the Chef's pan flip) fly back a little faster and harder. */
export const REFLECT = {
  speedMult: 1.15,
  damageMult: 1.25,
  /** At least this many frames of flight after the reflect. */
  extraLife: 40,
} as const;

/** Status effects: the Bard's lullaby (slow) and tempo song (haste). */
export const STATUS = {
  slowMult: 0.6,
  hasteMult: 1.35,
} as const;

/** Rule cheats typed on the menus (ADR-0077). */
export const CHEAT_RULES = {
  /** MOONJUMP: gravity and fall speeds scale by this. */
  moonGravity: 0.4,
  moonFall: 0.55,
  /** ONEHIT: every hit launches at least this hard (enough to fly off from anywhere). */
  oneHitKb: 340,
} as const;

/**
 * Signature mechanics (ADR-0079): one deeper system per fighter, each with its own HUD meter.
 * The logic lives in signature.ts; every number is here.
 */
export const SIGNATURE = {
  /** Hits landed within this many frames of each other count as one chain (Brawler's combos, Yo-yo Kid's tricks). */
  chainWindow: 60,
  /** Brawler's KO meter: fills from damage dealt (more in a combo) and a little from damage taken; getting launched knocks some out. Full: Haymaker becomes the Knockout Punch. */
  ko: { max: 100, perDealt: 1.8, chainBonus: 0.25, chainMaxMult: 2, perTaken: 0.6, launchLoss: 20 },
  /** Blade's edge: each sword-tip hit sharpens it a level (every level adds damage); getting hit dulls it to nothing. Full: Lunge becomes Flash Cut. */
  edge: { max: 3, dmgPerLevel: 0.1 },
  /** Spark's mana: specials cost it, it refills over time and from landing hits. Too little: the spell fizzles (1 to 2 damage, no knockback, short blink). */
  mana: { max: 100, regen: 0.12, perMeleeHit: 6, cost: { nspecial: 12, sspecial: 25, uspecial: 10, dspecial: 40 } as Record<string, number>, fizzleDmg: { min: 1, max: 2 }, fizzleBlink: 0.55 },
  /** Titan's payback: damage soaked by armor is stored and added to the next smash or Earthquake. */
  payback: { max: 40, dmgShare: 0.6, kbPerStored: 1 / 70 },
  /** Ninja's marks on a foe: each Ninja hit adds one; Shadow Step cashes them in as Assassinate. */
  marks: { max: 3, frames: 360, dmgPer: 3, kbPer: 0.12 },
  /** Gunslinger's hot streak: bullets that hit in a row. The last bullet in the cylinder is golden and grows with the streak. */
  streak: { max: 5, goldenDmg: 1.5, dmgPer: 0.25, kbPer: 0.1 },
  /** Chef's pantry: ground hits gather tomatoes, air hits peppers, throws meat. A full pantry turns Boiling Pot into Cook. */
  pantry: {
    size: 3,
    cookFrame: 22,
    chiliFrames: 480, chiliDmg: 1.3,
    soupFrames: 600, soupStun: 40, soupDmg: 3,
    stewHeal: 25,
    feastFrames: 360, feastArmorKb: 80,
  },
  /** Ghost's haunting: each Ghost hit haunts the foe a level; a Possess wisp on a fully haunted foe takes over their movement. */
  haunt: { max: 3, frames: 480, puppetFrames: 100, mash: 6 },
  /** Yo-yo Kid's trick combo: every hit in a chain adds damage; from the 4th hit on, the launch grows too. */
  trick: { window: 50, dmgPer: 0.06, maxDmg: 1.45, finisherFrom: 3, kbPer: 0.05 },
  /** Bard's groove: attacks started on the beat build it (and hit harder), off-beat ones lose it. Full: the songs become encores. */
  groove: { beat: 30, window: 4, max: 4, dmgPer: 0.07 },
  // Seasonal fighters (ADR-0082).
  /** Turkey's Gobble meter: fills from damage dealt and taken. Full: Gobble becomes Thunder Gobble. */
  gobble: { max: 100, perDealt: 1.6, perTaken: 1.0 },
  /** Pilgrim's harvest: each smash or throw that lands gathers a sheaf. Full: the next Blunderbuss shot is the Harvest Cannon. */
  harvest: { max: 3, cannonDmg: 2.2, cannonKb: 1.6 },
  /** First Light's Three Sisters: ground hits grow corn, air hits beans, specials and throws squash. All three: the next smash is a Tidal Sweep. */
  sisters: { tidalDmg: 1.3, tidalKb: 1.35 },
} as const;
