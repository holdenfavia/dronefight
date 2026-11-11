// The fighters (original cast: ADR-0072, six more: ADR-0073; controls and combat: ADR-0071). Movement in u/s, frames at 60 Hz,
// angles in degrees (0 = straight ahead, 90 = straight up, negative = down; mirrored when facing left).
// Every fighter plays its own way: its own reach, speed and power, its own specials and its own gimmick
// (Brawler's rage, Blade's sword tip, Spark's teleports and rewind, Titan's armor and carry grab).

export type FighterId = 'brawler' | 'blade' | 'spark' | 'titan' | 'ninja' | 'gunslinger' | 'chef' | 'ghost' | 'yoyo' | 'bard';

export const FIGHTER_IDS: readonly FighterId[] = ['brawler', 'blade', 'spark', 'titan', 'ninja', 'gunslinger', 'chef', 'ghost', 'yoyo', 'bard'];

/** Moves every fighter has. */
export type CoreMoveId =
  | 'jab' | 'ftilt' | 'utilt' | 'dtilt'
  | 'fsmash' | 'usmash' | 'dsmash'
  | 'nair' | 'fair' | 'bair' | 'uair' | 'dair'
  | 'nspecial' | 'sspecial' | 'uspecial' | 'dspecial'
  | 'grab' | 'pummel' | 'fthrow' | 'bthrow' | 'uthrow' | 'dthrow'
  | 'getupattack';

/** Moves only some fighters have: jab follow-ups, air versions of specials, and moves other moves lead into. */
export type ExtraMoveId =
  | 'jab2' | 'jab3'
  | 'nspecialAir' | 'sspecialAir' | 'dspecialAir'
  | 'counterhit' | 'riposte' | 'carry' | 'carryslam' | 'quake' | 'reload' | 'quickdraw';

export type MoveId = CoreMoveId | ExtraMoveId;

/** How hard something hits. */
export interface HitStats {
  dmg: number;
  angle: number;
  /** Base knockback. */
  bkb: number;
  /** Knockback growth with damage, 100 = normal. */
  kbg: number;
  /** Pushes instead of hitting: no damage, no hitstun, this much push speed (u/s). */
  wind?: number;
  /** Stuns: at least this many frames of hitstun however light the hit. */
  stun?: number;
  /** Curses: left and right are swapped for the target for this many frames. */
  curse?: number;
  /** Slows: the target moves at reduced speed for this many frames. */
  slow?: number;
}

export interface Hitbox extends HitStats {
  /** First and last active frame (frames of the move count from 1). */
  from: number;
  to: number;
  /** Offset from the fighter's centre; x is forward. */
  x: number;
  y: number;
  r: number;
  /** Grabs instead of hitting. */
  grab?: boolean;
  /** Grabs can catch airborne fighters too (command grabs). */
  grabAir?: boolean;
  /** The grab goes straight into this move (command grabs). */
  grabMove?: MoveId;
  /** Damage is taken from the countered attack. */
  counter?: boolean;
  /** The tip of a sword: the strong spot. Listed after the rest of the blade, so it only lands when the base misses (spacing). */
  tip?: boolean;
}

export interface ProjectileDef {
  /**
   * shot flies straight, bomb is tossed and goes off on contact, mine sits on the floor until someone comes near,
   * gust pushes, hazard settles on the floor and hurts whoever touches it until it runs out.
   */
  kind: 'shot' | 'bomb' | 'mine' | 'gust' | 'hazard';
  speed: number;
  /** Launch angle (bombs are tossed). */
  angle: number;
  r: number;
  lifeFrames: number;
  gravity: number;
  hit: HitStats;
  /** Bombs and mines: blast radius when they go off. */
  blastR?: number;
  /** A fully charged shot: multipliers on size, damage and knockback (charge scales linearly). */
  charged?: { r: number; dmg: number; kb: number };
  /** At most this many out at once. */
  limit?: number;
  /** Turns toward the nearest opponent at this many degrees per second. */
  homing?: number;
  /** Flies out, then comes back to its thrower (a yo-yo); hits on the way out and back. */
  returns?: boolean;
  /** Hazards: the same fighter can be hurt again every this many frames. */
  rehit?: number;
  /** What it looks like (for the renderer): defaults to the kind. */
  look?: string;
}

export interface MoveDef {
  /** Total length in frames. */
  frames: number;
  hitboxes?: Hitbox[];
  /** Multi-hit: the same target can be hit again every this many frames. */
  rehit?: number;
  /** Aerials: lag when you land during the move. */
  landLag?: number;
  /** Velocity set on this frame (x forward). */
  lunge?: { frame: number; vx: number; vy: number };
  /** Jump on this frame, from the ground too (x forward). */
  hop?: { frame: number; vx: number; vy: number };
  /** Up specials: an upward thrust, aimed a little with left/right, then a helpless fall. */
  boost?: { frame: number; speed: number; steer: number };
  /** Fly straight down until landing; then play landMove. */
  slam?: { frame: number; speed: number; landMove?: MoveId };
  /** Gravity multiplier for a span of frames. */
  gravity?: { from: number; to: number; scale: number };
  projectile?: { frame: number; def: ProjectileDef; /** Throw these in turn instead (one per use). */ cycle?: ProjectileDef[] };
  /** Hold the button: the move pauses at this frame and charges, up to max frames. Damage × (1 + dmg) when full. */
  charge?: { frame: number; max: number; dmg: number };
  /** Hold the button: frames from..to repeat (rapid jabs, rapid fire). */
  loop?: { from: number; to: number };
  /** Press attack again from this frame on: go into the next move (jab combos). */
  next?: { move: MoveId; from: number };
  /** Super armor: hits below this knockback don't flinch you. */
  armor?: { from: number; to: number; kb: number };
  /** Counter: get hit in this window and strike back with move, damage × mult. */
  counter?: { from: number; to: number; move: MoveId; mult: number };
  invincible?: { from: number; to: number };
  /** Ends in a helpless fall if airborne. */
  helpless?: boolean;
  /** Counts as recovering for the ledge pull-up. */
  recovery?: boolean;
  /** Grabs: hit the held fighter on this frame; release sends them flying. */
  throwHit?: { frame: number; hit: HitStats; release: boolean; behind?: boolean };
  /** Flip around when the move ends. */
  turn?: boolean;
  /** Teleport this far on this frame, the way the movement keys point (up when none). */
  teleport?: { frame: number; dist: number };
  /** Snap back to where you were this many frames ago. */
  rewind?: { frame: number; back: number };
  /** Appear behind the nearest opponent within range (else dash forward a little). */
  shadowStep?: { frame: number; range: number };
  /** Projectiles that touch you in this window are sent back as yours. */
  reflect?: { from: number; to: number };
  /** Latch onto the nearest stage corner within range and pull up onto it. */
  tether?: { frame: number; range: number };
  /** Speed yourself up for this many frames. */
  haste?: { frame: number; frames: number };
  /** Refill the ammo on this frame. */
  reload?: { frame: number };
}

type CoreMoves = Record<CoreMoveId, MoveDef>;
export type Moveset = CoreMoves & Partial<Record<ExtraMoveId, MoveDef>>;

/** The Brawler's rage: builds as you deal and take damage; when full, the next smash or special hits much harder. */
export interface RageDef {
  max: number;
  /** Rage per point of damage dealt and taken. */
  perDealt: number;
  perTaken: number;
  /** Damage and knockback multipliers on the raging hit. */
  dmg: number;
  kb: number;
}

export interface FighterDef {
  id: FighterId;
  name: string;
  /** One line shown on the select screen. */
  blurb: string;
  /** Names of the four specials, for the select screen and controls card. */
  specials: { neutral: string; side: string; up: string; down: string };
  /** Half the drawn and collision width. */
  halfW: number;
  height: number;
  /** Hurtbox circle radius, centred halfway up. */
  hurtR: number;
  weight: number;
  walkSpeed: number;
  airSpeed: number;
  airAccel: number;
  gravity: number;
  maxFall: number;
  fastFall: number;
  jumpSpeed: number;
  airJumpSpeed: number;
  airJumps: number;
  /** Up specials allowed before you must land. */
  upSpecials: number;
  /** Side specials allowed in the air before you must land. */
  sideSpecials: number;
  /** Down specials allowed in the air before you must land (unlimited when unset). */
  downSpecials?: number;
  /** Hold jump in the air to hover for up to this many frames per trip off the ground. */
  hoverFrames: number;
  rage?: RageDef;
  /** Shots before the neutral special has to reload (the reload move plays instead when empty). */
  ammo?: number;
  moves: Moveset;
}

/** A hitbox: active frames, offset, radius, then damage, angle, base and growing knockback. */
function hb(from: number, to: number, x: number, y: number, r: number, dmg: number, angle: number, bkb: number, kbg: number, extra: Partial<Hitbox> = {}): Hitbox {
  return { from, to, x, y, r, dmg, angle, bkb, kbg, ...extra };
}

/** A sword tip hitbox. */
function tip(from: number, to: number, x: number, y: number, r: number, dmg: number, angle: number, bkb: number, kbg: number, extra: Partial<Hitbox> = {}): Hitbox {
  return hb(from, to, x, y, r, dmg, angle, bkb, kbg, { tip: true, ...extra });
}

/** A grab reaching this far forward. */
function grab(reach: number, r: number, startup: number, frames: number): MoveDef {
  return { frames, hitboxes: [hb(startup, startup + 1, reach, 0, r, 0, 0, 0, 0, { grab: true })] };
}

function pummel(dmg: number, frames = 16): MoveDef {
  return { frames, throwHit: { frame: 5, hit: { dmg, angle: 0, bkb: 0, kbg: 0 }, release: false } };
}

function throwMove(frames: number, frame: number, dmg: number, angle: number, bkb: number, kbg: number, behind = false): MoveDef {
  return { frames, throwHit: { frame, hit: { dmg, angle, bkb, kbg }, release: true, behind } };
}

/** Getting up from the floor with an attack: hits both sides, invincible at the start. */
function getupAttack(reach: number, dmg: number): MoveDef {
  return {
    frames: 36,
    invincible: { from: 1, to: 14 },
    hitboxes: [hb(10, 12, reach, -6, 26, dmg, 30, 55, 30), hb(17, 19, -reach, -6, 26, dmg, 150, 55, 30)],
  };
}

// ---------------------------------------------------------------------------------------------
// Brawler: a boxer. Fast and short-ranged: punches and kicks, a three-hit combo, a chargeable haymaker.
// Gimmick: rage builds as it fights; full rage makes the next smash or special hit much harder.

function brawler(): FighterDef {
  return {
    id: 'brawler',
    name: 'Brawler',
    blurb: 'Fast fists, short reach. Fighting builds rage; full rage makes the next smash or special huge.',
    specials: { neutral: 'Haymaker', side: 'Dash Uppercut', up: 'Spiral Kick', down: 'Counter-punch' },
    halfW: 26, height: 32, hurtR: 24,
    weight: 105,
    walkSpeed: 390, airSpeed: 320, airAccel: 2500,
    gravity: 2400, maxFall: 960, fastFall: 1500,
    jumpSpeed: 850, airJumpSpeed: 770, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    rage: { max: 60, perDealt: 1, perTaken: 0.6, dmg: 1.5, kb: 1.3 },
    moves: {
      // One, two, hook.
      jab: { frames: 12, hitboxes: [hb(2, 3, 26, 4, 18, 2, 70, 20, 10)], next: { move: 'jab2', from: 5 } },
      jab2: { frames: 14, hitboxes: [hb(2, 3, 28, 4, 18, 2, 70, 20, 10)], next: { move: 'jab3', from: 5 } },
      jab3: { frames: 26, hitboxes: [hb(4, 6, 32, 4, 24, 6, 40, 48, 72)] },
      ftilt: { frames: 22, hitboxes: [hb(5, 7, 38, -4, 22, 9, 36, 32, 98)] },
      utilt: { frames: 22, hitboxes: [hb(4, 8, 16, 26, 22, 8, 92, 38, 92)] },
      dtilt: { frames: 18, hitboxes: [hb(4, 6, 34, -14, 20, 5, 80, 36, 50)] },
      fsmash: {
        frames: 44, charge: { frame: 10, max: 60, dmg: 0.4 }, lunge: { frame: 13, vx: 380, vy: 0 },
        hitboxes: [hb(13, 15, 40, 4, 26, 17, 38, 38, 104)],
      },
      usmash: { frames: 42, charge: { frame: 7, max: 60, dmg: 0.4 }, hitboxes: [hb(10, 14, 10, 30, 26, 16, 88, 36, 104)] },
      // Punches the floor: a shockwave both ways.
      dsmash: {
        frames: 46, charge: { frame: 8, max: 60, dmg: 0.4 },
        hitboxes: [hb(14, 16, 34, -14, 28, 14, 75, 46, 92), hb(14, 16, -34, -14, 28, 14, 105, 46, 92)],
      },
      nair: { frames: 26, landLag: 6, hitboxes: [hb(4, 6, 0, 0, 32, 9, 45, 30, 84), hb(7, 12, 0, 0, 28, 6, 45, 24, 70)] },
      // A flying knee: deadly right as it comes out.
      fair: { frames: 28, landLag: 8, hitboxes: [hb(6, 7, 30, 0, 18, 15, 38, 30, 106), hb(8, 12, 28, 0, 20, 6, 60, 20, 60)] },
      bair: { frames: 26, landLag: 8, hitboxes: [hb(5, 8, -30, 2, 22, 12, 145, 30, 102)] },
      uair: { frames: 24, landLag: 6, hitboxes: [hb(4, 8, 4, 30, 24, 9, 88, 30, 96)] },
      dair: { frames: 32, landLag: 12, hitboxes: [hb(10, 12, 0, -28, 22, 13, -75, 25, 88)] },
      // Hold special to wind up (up to 1.5 s); armored as it swings.
      nspecial: {
        frames: 48, charge: { frame: 8, max: 90, dmg: 1.2 }, armor: { from: 9, to: 18, kb: 100 }, lunge: { frame: 18, vx: 520, vy: 0 },
        hitboxes: [hb(18, 21, 38, 4, 28, 13, 36, 44, 98)],
      },
      sspecial: {
        frames: 40, recovery: true, gravity: { from: 1, to: 14, scale: 0.3 }, lunge: { frame: 6, vx: 820, vy: 120 },
        hitboxes: [hb(6, 12, 24, 0, 22, 5, 75, 50, 30), hb(15, 19, 18, 24, 26, 10, 85, 55, 80)],
      },
      uspecial: {
        frames: 26, recovery: true, helpless: true, boost: { frame: 4, speed: 1100, steer: 30 }, rehit: 4,
        hitboxes: [hb(4, 14, 0, 16, 26, 3, 85, 40, 20), hb(15, 16, 0, 22, 28, 6, 80, 50, 80)],
      },
      dspecial: { frames: 32, counter: { from: 4, to: 20, move: 'counterhit', mult: 1.4 } },
      counterhit: { frames: 28, invincible: { from: 1, to: 10 }, hitboxes: [hb(4, 7, 34, 4, 30, 8, 38, 55, 90, { counter: true })] },
      grab: grab(28, 18, 6, 28),
      pummel: pummel(2, 14),
      fthrow: throwMove(24, 10, 8, 40, 55, 70),
      bthrow: throwMove(30, 14, 10, 140, 48, 92, true),
      uthrow: throwMove(28, 12, 7, 90, 62, 62),
      dthrow: throwMove(28, 14, 6, 72, 48, 45),
      getupattack: getupAttack(30, 7),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Blade: a swordfighter. Long reach, clean slashes. Gimmick: the tip of the sword is the strong spot,
// so spacing matters: hit with the end of the blade and it launches, too close and it's weak.

function blade(): FighterDef {
  return {
    id: 'blade',
    name: 'Blade',
    blurb: 'Long sword reach. Hit with the tip for big damage; up close it\'s weak. Parry stance.',
    specials: { neutral: 'Sword Wave', side: 'Lunge', up: 'Rising Spin', down: 'Parry Stance' },
    halfW: 25, height: 34, hurtR: 24,
    weight: 95,
    walkSpeed: 350, airSpeed: 300, airAccel: 2200,
    gravity: 2250, maxFall: 900, fastFall: 1400,
    jumpSpeed: 820, airJumpSpeed: 760, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 18, hitboxes: [hb(4, 5, 30, 2, 18, 3, 60, 25, 25), tip(4, 5, 58, 2, 14, 4, 60, 30, 30)], next: { move: 'jab2', from: 7 } },
      jab2: { frames: 26, hitboxes: [hb(5, 7, 34, 2, 18, 4, 40, 30, 50), tip(5, 7, 64, 2, 14, 7, 35, 40, 70)] },
      ftilt: { frames: 28, hitboxes: [hb(8, 10, 36, 4, 20, 8, 40, 30, 80), tip(8, 10, 66, 4, 16, 13, 38, 36, 100)] },
      utilt: { frames: 28, hitboxes: [hb(7, 12, 8, 26, 20, 7, 85, 36, 80), tip(7, 12, 10, 56, 18, 11, 90, 40, 96)] },
      dtilt: { frames: 20, hitboxes: [hb(5, 6, 32, -14, 16, 5, 30, 30, 40), tip(5, 6, 62, -14, 14, 8, 25, 36, 70)] },
      fsmash: {
        frames: 52, charge: { frame: 12, max: 60, dmg: 0.4 },
        hitboxes: [hb(18, 20, 40, 6, 24, 14, 40, 34, 94), tip(18, 20, 72, 0, 18, 22, 36, 40, 106)],
      },
      usmash: {
        frames: 48, charge: { frame: 9, max: 60, dmg: 0.4 },
        hitboxes: [hb(13, 17, 0, 36, 26, 12, 88, 34, 92), tip(13, 17, 0, 70, 20, 19, 90, 38, 104)],
      },
      dsmash: {
        frames: 48, charge: { frame: 7, max: 60, dmg: 0.4 },
        hitboxes: [
          hb(11, 12, 34, -14, 20, 10, 30, 34, 80),
          hb(18, 19, -34, -14, 20, 10, 150, 34, 80),
          tip(11, 12, 66, -14, 16, 16, 28, 40, 98),
          tip(18, 19, -66, -14, 16, 16, 152, 40, 98),
        ],
      },
      // A full circle of the blade.
      nair: {
        frames: 30, landLag: 7,
        hitboxes: [
          hb(5, 11, 0, 0, 30, 6, 50, 24, 60),
          tip(5, 7, 48, 0, 14, 11, 45, 32, 95),
          tip(8, 9, 0, 48, 14, 11, 80, 32, 95),
          tip(10, 11, -48, 0, 14, 11, 135, 32, 95),
        ],
      },
      fair: { frames: 32, landLag: 9, hitboxes: [hb(7, 10, 32, 6, 20, 8, 45, 28, 80), tip(7, 10, 58, 10, 16, 13, 40, 32, 100)] },
      bair: { frames: 30, landLag: 9, hitboxes: [hb(6, 9, -32, 2, 20, 8, 140, 28, 80), tip(6, 9, -60, 2, 16, 14, 145, 32, 104)] },
      uair: { frames: 28, landLag: 7, hitboxes: [hb(5, 10, 0, 30, 20, 7, 85, 28, 80), tip(5, 10, 0, 60, 16, 12, 88, 32, 96)] },
      dair: { frames: 36, landLag: 14, hitboxes: [hb(10, 13, 0, -30, 20, 8, -60, 24, 70), tip(10, 13, 0, -60, 16, 15, -80, 26, 92)] },
      // A slash that flies.
      nspecial: {
        frames: 34,
        projectile: { frame: 12, def: { kind: 'shot', speed: 700, angle: 0, r: 16, lifeFrames: 50, gravity: 0, limit: 1, hit: { dmg: 8, angle: 40, bkb: 34, kbg: 60 } } },
      },
      sspecial: {
        frames: 36, recovery: true, gravity: { from: 1, to: 16, scale: 0.15 }, lunge: { frame: 8, vx: 1100, vy: 60 },
        hitboxes: [hb(8, 14, 24, 0, 22, 7, 40, 40, 70), tip(8, 14, 58, 0, 16, 12, 35, 46, 92)],
      },
      uspecial: {
        frames: 28, recovery: true, helpless: true, boost: { frame: 5, speed: 1000, steer: 30 }, rehit: 4,
        hitboxes: [hb(5, 15, 0, 10, 46, 3, 85, 40, 20), hb(16, 17, 0, 20, 48, 7, 80, 50, 85)],
      },
      // Stand ready: anything that hits you (shots too) gets a tip-of-the-blade riposte.
      dspecial: { frames: 36, counter: { from: 3, to: 22, move: 'riposte', mult: 1.2 } },
      riposte: {
        frames: 30, invincible: { from: 1, to: 12 },
        hitboxes: [hb(6, 9, 32, 4, 22, 8, 40, 50, 85, { counter: true }), tip(6, 9, 64, 4, 18, 10, 40, 55, 100, { counter: true })],
      },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 42, 52, 70),
      bthrow: throwMove(30, 13, 10, 140, 48, 92, true),
      uthrow: throwMove(26, 11, 7, 90, 62, 62),
      dthrow: throwMove(26, 12, 6, 75, 48, 45),
      getupattack: getupAttack(44, 7),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Spark: a caster. Light and floaty (hold jump to levitate). Weak up close, strong from range: fireballs,
// a homing orb, a blink teleport and a rewind that snaps it back to where it was a moment ago.

function spark(): FighterDef {
  return {
    id: 'spark',
    name: 'Spark',
    blurb: 'A caster. Fireballs and a homing orb from range, blink teleport, rewind. Light and floaty.',
    specials: { neutral: 'Fireball', side: 'Homing Orb', up: 'Blink', down: 'Rewind' },
    halfW: 22, height: 30, hurtR: 21,
    weight: 85,
    walkSpeed: 300, airSpeed: 330, airAccel: 2400,
    gravity: 1900, maxFall: 760, fastFall: 1250,
    jumpSpeed: 780, airJumpSpeed: 720, airJumps: 2,
    upSpecials: 1, sideSpecials: 1, downSpecials: 1, hoverFrames: 45,
    moves: {
      // Hold attack for a stream of sparks.
      jab: { frames: 20, loop: { from: 3, to: 6 }, rehit: 3, hitboxes: [hb(3, 6, 34, 2, 18, 1, 80, 12, 0), hb(10, 11, 38, 2, 22, 4, 40, 38, 70)] },
      ftilt: { frames: 28, hitboxes: [hb(9, 11, 54, 2, 22, 9, 38, 34, 96)] },
      utilt: { frames: 28, hitboxes: [hb(8, 14, 0, 40, 30, 8, 90, 40, 92)] },
      dtilt: { frames: 22, hitboxes: [hb(6, 8, 40, -16, 20, 6, 30, 32, 60)] },
      // A blast that goes off a long way in front.
      fsmash: { frames: 52, charge: { frame: 10, max: 60, dmg: 0.4 }, hitboxes: [hb(18, 22, 76, 4, 30, 17, 38, 38, 104)] },
      usmash: {
        frames: 48, charge: { frame: 8, max: 60, dmg: 0.4 }, rehit: 4,
        hitboxes: [hb(12, 20, 0, 50, 28, 2, 90, 40, 10), hb(21, 23, 0, 64, 32, 8, 88, 40, 108)],
      },
      dsmash: {
        frames: 44, charge: { frame: 6, max: 60, dmg: 0.4 },
        hitboxes: [hb(12, 15, 46, -14, 22, 13, 25, 38, 96), hb(12, 15, -46, -14, 22, 13, 155, 38, 96)],
      },
      nair: { frames: 28, landLag: 6, rehit: 5, hitboxes: [hb(5, 16, 0, 0, 36, 2, 60, 20, 0), hb(18, 19, 0, 0, 38, 5, 45, 34, 80)] },
      fair: { frames: 30, landLag: 9, hitboxes: [hb(8, 11, 46, 2, 22, 11, 40, 30, 98)] },
      bair: { frames: 30, landLag: 9, hitboxes: [hb(7, 10, -46, 2, 22, 12, 145, 30, 100)] },
      uair: { frames: 26, landLag: 7, hitboxes: [hb(6, 10, 0, 44, 26, 10, 88, 30, 96)] },
      dair: { frames: 34, landLag: 12, hitboxes: [hb(10, 13, 0, -38, 22, 12, -75, 26, 86)] },
      // Hold special to grow the fireball.
      nspecial: {
        frames: 30, charge: { frame: 6, max: 75, dmg: 0 },
        projectile: {
          frame: 9,
          def: { kind: 'shot', speed: 780, angle: 0, r: 9, lifeFrames: 70, gravity: 0, hit: { dmg: 5, angle: 35, bkb: 26, kbg: 40 }, charged: { r: 2.4, dmg: 3.4, kb: 2.4 } },
        },
      },
      // A slow orb that follows the nearest opponent.
      sspecial: {
        frames: 32, gravity: { from: 1, to: 20, scale: 0.5 },
        projectile: { frame: 12, def: { kind: 'shot', speed: 420, angle: 0, r: 12, lifeFrames: 150, gravity: 0, limit: 1, homing: 140, hit: { dmg: 9, angle: 50, bkb: 40, kbg: 60 } } },
      },
      uspecial: { frames: 22, recovery: true, helpless: true, invincible: { from: 4, to: 10 }, teleport: { frame: 6, dist: 190 } },
      dspecial: { frames: 26, recovery: true, invincible: { from: 6, to: 12 }, rewind: { frame: 6, back: 45 } },
      grab: grab(26, 18, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 45, 50, 72),
      bthrow: throwMove(30, 13, 10, 145, 46, 92, true),
      uthrow: throwMove(26, 11, 6, 90, 70, 60),
      dthrow: throwMove(26, 12, 6, 100, 50, 40),
      getupattack: getupAttack(30, 6),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Titan: a huge grappler. Slow, heavy, hard to flinch: armor on its ground attacks. Throws boulders,
// shakes the ground, and its command grab leaps into the air with you and slams you down.

function titan(): FighterDef {
  return {
    id: 'titan',
    name: 'Titan',
    blurb: 'Huge and slow, hard to flinch. Grabs you, leaps and slams. Boulders and earthquakes.',
    specials: { neutral: 'Boulder Toss', side: 'Sky Carry', up: 'Titan Leap', down: 'Earthquake' },
    halfW: 42, height: 48, hurtR: 38,
    weight: 150,
    walkSpeed: 240, airSpeed: 235, airAccel: 1700,
    gravity: 2150, maxFall: 860, fastFall: 1250,
    jumpSpeed: 770, airJumpSpeed: 730, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 26, armor: { from: 1, to: 6, kb: 60 }, hitboxes: [hb(6, 8, 48, 2, 30, 8, 55, 36, 40)], next: { move: 'jab2', from: 10 } },
      jab2: { frames: 36, hitboxes: [hb(8, 10, 54, 2, 34, 12, 40, 50, 82)] },
      ftilt: { frames: 40, armor: { from: 1, to: 12, kb: 80 }, hitboxes: [hb(12, 15, 62, 0, 34, 15, 36, 38, 102)] },
      utilt: { frames: 38, armor: { from: 1, to: 10, kb: 80 }, hitboxes: [hb(10, 14, 0, 58, 40, 13, 88, 42, 100)] },
      dtilt: { frames: 32, armor: { from: 1, to: 8, kb: 80 }, hitboxes: [hb(9, 11, 50, -22, 30, 12, 80, 48, 70)] },
      fsmash: {
        frames: 66, charge: { frame: 12, max: 60, dmg: 0.4 }, armor: { from: 1, to: 24, kb: 130 },
        hitboxes: [hb(22, 25, 64, 4, 40, 25, 36, 42, 100)],
      },
      usmash: {
        frames: 60, charge: { frame: 9, max: 60, dmg: 0.4 }, armor: { from: 1, to: 20, kb: 120 },
        hitboxes: [hb(18, 22, 0, 64, 46, 22, 88, 42, 98)],
      },
      dsmash: {
        frames: 60, charge: { frame: 8, max: 60, dmg: 0.4 }, armor: { from: 1, to: 18, kb: 120 },
        hitboxes: [hb(16, 19, 64, -20, 36, 18, 28, 44, 94), hb(16, 19, -64, -20, 36, 18, 152, 44, 94)],
      },
      nair: { frames: 36, landLag: 10, hitboxes: [hb(8, 13, 0, 0, 54, 13, 45, 36, 90)] },
      // The sweet spot right at the start spikes; later it just hits hard.
      fair: { frames: 46, landLag: 16, hitboxes: [hb(14, 15, 52, -6, 34, 17, -60, 30, 85), hb(16, 19, 56, 0, 34, 15, 40, 36, 98)] },
      bair: { frames: 38, landLag: 12, hitboxes: [hb(10, 13, -56, 2, 34, 18, 140, 34, 102)] },
      uair: { frames: 36, landLag: 11, hitboxes: [hb(9, 13, 0, 56, 38, 15, 88, 34, 98)] },
      dair: { frames: 48, landLag: 20, hitboxes: [hb(16, 19, 0, -46, 34, 17, -85, 28, 92)] },
      nspecial: {
        frames: 48, armor: { from: 1, to: 14, kb: 90 },
        projectile: { frame: 18, def: { kind: 'bomb', speed: 620, angle: 35, r: 18, lifeFrames: 120, gravity: 1500, blastR: 52, limit: 1, hit: { dmg: 14, angle: 50, bkb: 50, kbg: 80 } } },
      },
      // A command grab that catches shields and fighters in the air, then leaps up and slams down.
      sspecial: {
        frames: 44, recovery: true, armor: { from: 1, to: 16, kb: 90 }, gravity: { from: 1, to: 20, scale: 0.3 }, lunge: { frame: 8, vx: 560, vy: 280 },
        hitboxes: [hb(10, 16, 50, 4, 32, 0, 0, 0, 0, { grab: true, grabAir: true, grabMove: 'carry' })],
      },
      carry: { frames: 90, hop: { frame: 2, vx: 260, vy: 1050 }, slam: { frame: 26, speed: 1500, landMove: 'carryslam' } },
      carryslam: {
        frames: 40, throwHit: { frame: 1, hit: { dmg: 18, angle: 70, bkb: 60, kbg: 78 }, release: true },
        hitboxes: [hb(2, 5, 64, -20, 36, 10, 70, 55, 70), hb(2, 5, -64, -20, 36, 10, 110, 55, 70)],
      },
      uspecial: {
        frames: 34, recovery: true, helpless: true, armor: { from: 1, to: 14, kb: 100 }, boost: { frame: 8, speed: 1150, steer: 20 },
        hitboxes: [hb(8, 20, 0, 30, 42, 9, 85, 50, 70)],
      },
      // On the ground it stamps; in the air it plummets. Either way the ground shakes on both sides.
      dspecial: { frames: 1, slam: { frame: 1, speed: 0, landMove: 'quake' } },
      dspecialAir: { frames: 60, slam: { frame: 8, speed: 1700, landMove: 'quake' }, hitboxes: [hb(8, 60, 0, -26, 34, 12, -75, 40, 70)] },
      quake: {
        frames: 40, armor: { from: 1, to: 10, kb: 120 },
        hitboxes: [hb(4, 7, 0, -20, 40, 13, 90, 60, 72), hb(4, 7, 80, -20, 40, 13, 80, 60, 72), hb(4, 7, -80, -20, 40, 13, 100, 60, 72)],
      },
      grab: grab(44, 26, 9, 36),
      pummel: pummel(3, 20),
      fthrow: throwMove(32, 14, 11, 38, 58, 75),
      bthrow: throwMove(40, 20, 13, 140, 52, 98, true),
      uthrow: throwMove(36, 16, 10, 90, 60, 80),
      dthrow: throwMove(34, 16, 9, 70, 52, 55),
      getupattack: getupAttack(46, 9),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Ninja: fast, light and tricky. Throwing stars, a shadow step that appears behind you and strikes,
// a vanishing jump, and a smoke bomb that leaves anyone caught in it dazed.

function ninja(): FighterDef {
  return {
    id: 'ninja',
    name: 'Ninja',
    blurb: 'Fast and tricky. Throwing stars, appears behind you to strike, smoke bombs that daze.',
    specials: { neutral: 'Throwing Stars', side: 'Shadow Step', up: 'Vanish', down: 'Smoke Bomb' },
    halfW: 22, height: 30, hurtR: 21,
    weight: 82,
    walkSpeed: 450, airSpeed: 360, airAccel: 2800,
    gravity: 2500, maxFall: 1000, fastFall: 1650,
    jumpSpeed: 860, airJumpSpeed: 760, airJumps: 2,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 10, hitboxes: [hb(2, 3, 26, 2, 16, 2, 70, 18, 10)], next: { move: 'jab2', from: 4 } },
      jab2: { frames: 12, hitboxes: [hb(2, 3, 28, 2, 16, 2, 70, 18, 10)], next: { move: 'jab3', from: 4 } },
      jab3: { frames: 22, hitboxes: [hb(3, 5, 30, 4, 20, 5, 45, 44, 70)] },
      ftilt: { frames: 20, hitboxes: [hb(4, 6, 36, 0, 20, 7, 36, 30, 96)] },
      utilt: { frames: 18, hitboxes: [hb(3, 7, 6, 28, 22, 6, 92, 36, 90)] },
      dtilt: { frames: 16, hitboxes: [hb(3, 5, 32, -14, 18, 5, 75, 34, 50)] },
      // Two quick blade slashes.
      fsmash: {
        frames: 40, charge: { frame: 8, max: 60, dmg: 0.4 }, lunge: { frame: 10, vx: 520, vy: 0 },
        hitboxes: [hb(10, 12, 34, 2, 22, 5, 70, 30, 20), hb(15, 17, 40, 2, 24, 11, 36, 36, 102)],
      },
      usmash: { frames: 38, charge: { frame: 6, max: 60, dmg: 0.4 }, hitboxes: [hb(9, 13, 0, 34, 28, 14, 88, 36, 102)] },
      dsmash: {
        frames: 36, charge: { frame: 5, max: 60, dmg: 0.4 },
        hitboxes: [hb(7, 9, 34, -12, 22, 11, 25, 36, 96), hb(7, 9, -34, -12, 22, 11, 155, 36, 96)],
      },
      nair: { frames: 24, landLag: 5, hitboxes: [hb(4, 12, 0, 0, 30, 7, 50, 26, 80)] },
      fair: { frames: 24, landLag: 7, hitboxes: [hb(5, 8, 32, 2, 20, 9, 42, 30, 96)] },
      bair: { frames: 24, landLag: 7, hitboxes: [hb(5, 8, -32, 2, 20, 11, 145, 28, 100)] },
      uair: { frames: 22, landLag: 6, hitboxes: [hb(4, 8, 0, 30, 22, 8, 88, 30, 94)] },
      dair: { frames: 30, landLag: 10, hitboxes: [hb(8, 10, 0, -28, 20, 10, -70, 25, 84)] },
      nspecial: {
        frames: 16,
        projectile: { frame: 5, def: { kind: 'shot', look: 'star', speed: 1300, angle: 0, r: 7, lifeFrames: 36, gravity: 0, limit: 3, hit: { dmg: 3, angle: 30, bkb: 18, kbg: 20 } } },
      },
      // Vanish and appear behind the nearest opponent, then cut.
      sspecial: {
        frames: 34, recovery: true, invincible: { from: 3, to: 10 }, gravity: { from: 1, to: 14, scale: 0 },
        shadowStep: { frame: 8, range: 340 }, hitboxes: [hb(11, 14, 30, 2, 26, 10, 40, 45, 80)],
      },
      uspecial: { frames: 24, recovery: true, helpless: true, invincible: { from: 4, to: 10 }, teleport: { frame: 6, dist: 200 } },
      dspecial: {
        frames: 30, invincible: { from: 8, to: 20 },
        projectile: { frame: 8, def: { kind: 'bomb', look: 'smoke', speed: 380, angle: -15, r: 10, lifeFrames: 40, gravity: 1200, blastR: 74, limit: 1, hit: { dmg: 3, angle: 80, bkb: 10, kbg: 0, stun: 50 } } },
      },
      grab: grab(26, 18, 6, 26),
      pummel: pummel(1, 10),
      fthrow: throwMove(22, 9, 7, 38, 52, 66),
      bthrow: throwMove(26, 11, 9, 140, 46, 88, true),
      uthrow: throwMove(24, 10, 6, 92, 60, 58),
      dthrow: throwMove(24, 12, 5, 80, 42, 42),
      getupattack: getupAttack(28, 6),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Gunslinger: a revolver with six shots, then a reload. A lasso grabs from far away, a quick-draw counter
// fires back, and a shotgun blast downward launches it up.

function gunslinger(): FighterDef {
  return {
    id: 'gunslinger',
    name: 'Gunslinger',
    blurb: 'Six shots, then reload. A lasso that grabs from afar, a quick-draw counter, a shotgun jump.',
    specials: { neutral: 'Revolver (6)', side: 'Lasso', up: 'Shotgun Jump', down: 'Quick Draw' },
    halfW: 24, height: 32, hurtR: 23,
    weight: 98,
    walkSpeed: 340, airSpeed: 300, airAccel: 2300,
    gravity: 2350, maxFall: 920, fastFall: 1450,
    jumpSpeed: 820, airJumpSpeed: 760, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    ammo: 6,
    moves: {
      // Pistol whip.
      jab: { frames: 16, hitboxes: [hb(3, 4, 30, 4, 20, 3, 65, 24, 20)], next: { move: 'jab2', from: 6 } },
      jab2: { frames: 26, hitboxes: [hb(4, 6, 32, 2, 22, 6, 40, 44, 70)] },
      ftilt: { frames: 26, hitboxes: [hb(6, 8, 38, -4, 22, 9, 36, 32, 98)] },
      utilt: { frames: 26, hitboxes: [hb(6, 10, 10, 30, 24, 8, 92, 38, 94)] },
      dtilt: { frames: 20, hitboxes: [hb(5, 7, 36, -14, 20, 6, 60, 34, 60)] },
      // Point-blank shots: the blast goes off well in front.
      fsmash: { frames: 50, charge: { frame: 12, max: 60, dmg: 0.4 }, hitboxes: [hb(16, 18, 70, 6, 26, 18, 30, 40, 102)] },
      usmash: { frames: 46, charge: { frame: 9, max: 60, dmg: 0.4 }, hitboxes: [hb(14, 16, 4, 72, 26, 16, 88, 38, 102)] },
      dsmash: {
        frames: 44, charge: { frame: 7, max: 60, dmg: 0.4 },
        hitboxes: [hb(11, 12, 60, -14, 22, 12, 22, 38, 94), hb(17, 18, -60, -14, 22, 12, 158, 38, 94)],
      },
      nair: { frames: 26, landLag: 6, hitboxes: [hb(4, 12, 0, 0, 30, 8, 50, 28, 82)] },
      fair: { frames: 30, landLag: 8, hitboxes: [hb(9, 11, 64, 4, 20, 10, 38, 30, 96)] },
      bair: { frames: 28, landLag: 8, hitboxes: [hb(6, 9, -32, 2, 22, 12, 145, 30, 102)] },
      uair: { frames: 26, landLag: 7, hitboxes: [hb(7, 9, 0, 62, 20, 9, 88, 30, 94)] },
      dair: { frames: 34, landLag: 12, hitboxes: [hb(10, 12, 0, -56, 20, 12, -80, 26, 86)] },
      nspecial: {
        frames: 18,
        projectile: { frame: 5, def: { kind: 'shot', look: 'bullet', speed: 1500, angle: 0, r: 6, lifeFrames: 40, gravity: 0, hit: { dmg: 6, angle: 20, bkb: 22, kbg: 32 } } },
      },
      reload: { frames: 54, reload: { frame: 44 } },
      // A long lasso: grabs on the ground or in the air, far away.
      sspecial: {
        frames: 46, recovery: true, gravity: { from: 1, to: 22, scale: 0.35 },
        hitboxes: [hb(12, 16, 96, 4, 26, 0, 0, 0, 0, { grab: true, grabAir: true })],
      },
      uspecial: {
        frames: 30, recovery: true, helpless: true, boost: { frame: 6, speed: 1140, steer: 25 },
        hitboxes: [hb(6, 8, 0, -40, 34, 13, -80, 40, 80)],
      },
      dspecial: { frames: 34, counter: { from: 4, to: 20, move: 'quickdraw', mult: 1.3 } },
      quickdraw: { frames: 26, invincible: { from: 1, to: 10 }, hitboxes: [hb(4, 6, 70, 4, 30, 8, 30, 55, 92, { counter: true })] },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 42, 52, 70),
      bthrow: throwMove(30, 13, 10, 140, 48, 92, true),
      uthrow: throwMove(26, 11, 7, 90, 62, 62),
      dthrow: throwMove(26, 12, 6, 75, 48, 45),
      getupattack: getupAttack(30, 7),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Chef: fights with kitchen gear. A frying pan for normals, thrown food that changes every throw
// (tomato, pie, meatball), a pan flip that bats shots back, and a boiling pot left on the stage.

const TOMATO: ProjectileDef = { kind: 'bomb', look: 'tomato', speed: 640, angle: 30, r: 9, lifeFrames: 90, gravity: 1500, blastR: 32, limit: 2, hit: { dmg: 5, angle: 45, bkb: 26, kbg: 40 } };
const PIE: ProjectileDef = { kind: 'bomb', look: 'pie', speed: 560, angle: 34, r: 12, lifeFrames: 90, gravity: 1500, blastR: 40, limit: 2, hit: { dmg: 6, angle: 70, bkb: 18, kbg: 10, stun: 36 } };
const MEATBALL: ProjectileDef = { kind: 'bomb', look: 'meatball', speed: 520, angle: 26, r: 13, lifeFrames: 90, gravity: 1800, blastR: 36, limit: 2, hit: { dmg: 11, angle: 40, bkb: 38, kbg: 78 } };

function chef(): FighterDef {
  return {
    id: 'chef',
    name: 'Chef',
    blurb: 'Frying pan smacks, a different food every throw, a pan flip that bats shots back, a boiling pot.',
    specials: { neutral: 'Food Toss', side: 'Pan Flip', up: 'Steam Jump', down: 'Boiling Pot' },
    halfW: 26, height: 32, hurtR: 24,
    weight: 108,
    walkSpeed: 320, airSpeed: 290, airAccel: 2200,
    gravity: 2300, maxFall: 900, fastFall: 1400,
    jumpSpeed: 820, airJumpSpeed: 750, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 18, hitboxes: [hb(4, 5, 34, 4, 22, 4, 60, 28, 25)], next: { move: 'jab2', from: 7 } },
      jab2: { frames: 28, hitboxes: [hb(5, 7, 38, 4, 26, 7, 40, 46, 72)] },
      ftilt: { frames: 28, hitboxes: [hb(7, 9, 44, 2, 26, 11, 36, 34, 100)] },
      utilt: { frames: 28, hitboxes: [hb(6, 11, 6, 34, 28, 9, 90, 40, 94)] },
      dtilt: { frames: 22, hitboxes: [hb(5, 7, 40, -14, 22, 7, 70, 36, 60)] },
      // A full two-handed pan swing.
      fsmash: { frames: 52, charge: { frame: 11, max: 60, dmg: 0.4 }, hitboxes: [hb(17, 20, 48, 6, 32, 20, 36, 40, 104)] },
      usmash: { frames: 46, charge: { frame: 8, max: 60, dmg: 0.4 }, hitboxes: [hb(13, 17, 0, 46, 32, 17, 88, 38, 100)] },
      dsmash: {
        frames: 48, charge: { frame: 7, max: 60, dmg: 0.4 },
        hitboxes: [hb(12, 15, 40, -14, 26, 14, 30, 40, 94), hb(12, 15, -40, -14, 26, 14, 150, 40, 94)],
      },
      nair: { frames: 28, landLag: 7, hitboxes: [hb(5, 12, 0, 0, 34, 9, 48, 30, 84)] },
      fair: { frames: 32, landLag: 9, hitboxes: [hb(8, 11, 40, 4, 26, 12, 40, 32, 100)] },
      bair: { frames: 30, landLag: 9, hitboxes: [hb(7, 10, -40, 2, 26, 13, 145, 30, 102)] },
      uair: { frames: 28, landLag: 7, hitboxes: [hb(5, 10, 0, 38, 28, 10, 88, 30, 96)] },
      // Pan flat on the head: a spike.
      dair: { frames: 36, landLag: 13, hitboxes: [hb(10, 13, 0, -32, 26, 13, -75, 26, 88)] },
      nspecial: { frames: 30, projectile: { frame: 10, def: TOMATO, cycle: [TOMATO, PIE, MEATBALL] } },
      // Bats shots back and smacks anyone in front.
      sspecial: {
        frames: 36, reflect: { from: 4, to: 18 }, gravity: { from: 1, to: 18, scale: 0.4 }, recovery: true, lunge: { frame: 4, vx: 260, vy: 160 },
        hitboxes: [hb(6, 10, 34, 4, 28, 9, 40, 44, 80)],
      },
      uspecial: {
        frames: 30, recovery: true, helpless: true, boost: { frame: 6, speed: 1100, steer: 25 }, rehit: 5,
        hitboxes: [hb(6, 18, 0, -10, 32, 2, 85, 40, 15), hb(19, 20, 0, 10, 34, 6, 80, 50, 80)],
      },
      dspecial: {
        frames: 34,
        projectile: { frame: 12, def: { kind: 'hazard', look: 'pot', speed: 120, angle: 50, r: 16, lifeFrames: 420, gravity: 1800, limit: 1, rehit: 30, hit: { dmg: 4, angle: 80, bkb: 40, kbg: 20 } } },
      },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 42, 52, 70),
      bthrow: throwMove(30, 13, 11, 140, 48, 94, true),
      uthrow: throwMove(26, 11, 7, 90, 62, 62),
      dthrow: throwMove(26, 12, 6, 75, 48, 45),
      getupattack: getupAttack(34, 7),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Ghost: floaty and slippery (hover a long time, three air jumps). Long spooky swipes, a possessing
// wisp that swaps your opponent's left and right, a fade that turns it intangible, a drifting float up.

function ghost(): FighterDef {
  return {
    id: 'ghost',
    name: 'Ghost',
    blurb: 'Floaty and slippery. Long swipes, a wisp that swaps your left and right, fades through attacks.',
    specials: { neutral: 'Possess', side: 'Spooky Swipe', up: 'Drift Up', down: 'Fade' },
    halfW: 24, height: 32, hurtR: 22,
    weight: 75,
    walkSpeed: 310, airSpeed: 340, airAccel: 2400,
    gravity: 1700, maxFall: 680, fastFall: 1150,
    jumpSpeed: 760, airJumpSpeed: 640, airJumps: 3,
    upSpecials: 1, sideSpecials: 1, downSpecials: 1, hoverFrames: 90,
    moves: {
      jab: { frames: 18, hitboxes: [hb(4, 6, 38, 2, 22, 4, 60, 28, 30)], next: { move: 'jab2', from: 8 } },
      jab2: { frames: 26, hitboxes: [hb(4, 7, 44, 2, 26, 6, 45, 42, 70)] },
      ftilt: { frames: 30, hitboxes: [hb(8, 11, 56, 2, 24, 9, 36, 32, 96)] },
      utilt: { frames: 30, hitboxes: [hb(7, 13, 0, 46, 30, 8, 90, 40, 92)] },
      dtilt: { frames: 24, hitboxes: [hb(6, 9, 52, -16, 22, 6, 30, 32, 60)] },
      fsmash: { frames: 52, charge: { frame: 10, max: 60, dmg: 0.4 }, hitboxes: [hb(17, 21, 66, 4, 30, 16, 38, 38, 104)] },
      usmash: { frames: 48, charge: { frame: 8, max: 60, dmg: 0.4 }, hitboxes: [hb(13, 19, 0, 56, 34, 15, 90, 38, 102)] },
      dsmash: {
        frames: 46, charge: { frame: 6, max: 60, dmg: 0.4 },
        hitboxes: [hb(12, 15, 54, -14, 24, 12, 25, 38, 96), hb(12, 15, -54, -14, 24, 12, 155, 38, 96)],
      },
      nair: { frames: 30, landLag: 6, rehit: 6, hitboxes: [hb(5, 18, 0, 0, 38, 3, 55, 24, 20), hb(19, 20, 0, 0, 40, 5, 45, 34, 80)] },
      fair: { frames: 30, landLag: 8, hitboxes: [hb(8, 11, 52, 2, 24, 10, 40, 30, 96)] },
      bair: { frames: 30, landLag: 8, hitboxes: [hb(7, 10, -50, 2, 24, 12, 145, 30, 100)] },
      uair: { frames: 28, landLag: 7, hitboxes: [hb(6, 11, 0, 50, 28, 9, 88, 30, 94)] },
      dair: { frames: 34, landLag: 11, hitboxes: [hb(10, 13, 0, -44, 24, 11, -70, 26, 84)] },
      // A slow wisp; whoever it touches has left and right swapped for 3 s.
      nspecial: {
        frames: 36,
        projectile: { frame: 12, def: { kind: 'shot', look: 'wisp', speed: 360, angle: 0, r: 14, lifeFrames: 110, gravity: 0, limit: 1, homing: 60, hit: { dmg: 4, angle: 70, bkb: 14, kbg: 0, stun: 14, curse: 180 } } },
      },
      sspecial: {
        frames: 36, recovery: true, gravity: { from: 1, to: 20, scale: 0.2 }, lunge: { frame: 6, vx: 520, vy: 120 },
        hitboxes: [hb(10, 14, 64, 2, 28, 11, 40, 44, 88)],
      },
      uspecial: { frames: 40, recovery: true, helpless: true, boost: { frame: 6, speed: 900, steer: 50 }, invincible: { from: 6, to: 16 } },
      // Fade out: intangible for a moment, free to drift.
      dspecial: { frames: 44, recovery: true, invincible: { from: 3, to: 34 }, gravity: { from: 1, to: 34, scale: 0.15 } },
      grab: grab(32, 22, 8, 32),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 8, 42, 52, 70),
      bthrow: throwMove(30, 13, 10, 140, 48, 92, true),
      uthrow: throwMove(26, 11, 7, 90, 62, 62),
      dthrow: throwMove(26, 12, 6, 75, 48, 45),
      getupattack: getupAttack(36, 6),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Yo-yo Kid: a combo fighter. The yo-yo gives its normals long reach, out and back. Up hits pop
// opponents up gently so they can be juggled. A thrown yo-yo comes back, a tether grabs the stage,
// and Around the World spins the yo-yo all the way round.

function yoyo(): FighterDef {
  return {
    id: 'yoyo',
    name: 'Yo-yo Kid',
    blurb: 'Combos and juggles. Long yo-yo reach out and back, a yo-yo that returns, a tether recovery.',
    specials: { neutral: 'Yo-yo Throw', side: 'Walk the Dog', up: 'Tether', down: 'Around the World' },
    halfW: 22, height: 28, hurtR: 21,
    weight: 88,
    walkSpeed: 380, airSpeed: 330, airAccel: 2500,
    gravity: 2300, maxFall: 920, fastFall: 1450,
    jumpSpeed: 830, airJumpSpeed: 760, airJumps: 2,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      // Out and back: two hits with the yo-yo.
      jab: { frames: 20, hitboxes: [hb(4, 6, 56, 2, 16, 3, 60, 26, 20), hb(9, 11, 30, 2, 16, 3, 70, 30, 30)] },
      ftilt: { frames: 26, hitboxes: [hb(6, 9, 70, 2, 18, 7, 40, 30, 92), hb(12, 14, 36, 2, 18, 3, 60, 30, 30)] },
      // Juggles: low knockback growth, straight up.
      utilt: { frames: 20, hitboxes: [hb(4, 8, 4, 50, 20, 6, 90, 52, 40)] },
      dtilt: { frames: 22, hitboxes: [hb(5, 9, 64, -16, 16, 5, 80, 40, 40)] },
      fsmash: {
        frames: 50, charge: { frame: 10, max: 60, dmg: 0.4 },
        hitboxes: [hb(15, 18, 86, 2, 22, 15, 36, 38, 104), hb(22, 24, 44, 2, 20, 4, 60, 30, 30)],
      },
      usmash: { frames: 46, charge: { frame: 8, max: 60, dmg: 0.4 }, hitboxes: [hb(13, 17, 0, 76, 24, 15, 90, 38, 102)] },
      dsmash: {
        frames: 46, charge: { frame: 6, max: 60, dmg: 0.4 },
        hitboxes: [hb(11, 13, 70, -16, 20, 12, 25, 38, 96), hb(17, 19, -70, -16, 20, 12, 155, 38, 96)],
      },
      nair: { frames: 28, landLag: 6, hitboxes: [hb(5, 14, 0, 0, 44, 7, 60, 34, 70)] },
      fair: { frames: 30, landLag: 8, hitboxes: [hb(7, 10, 62, 2, 18, 9, 45, 30, 90)] },
      bair: { frames: 30, landLag: 8, hitboxes: [hb(7, 10, -62, 2, 18, 11, 145, 30, 98)] },
      uair: { frames: 22, landLag: 6, hitboxes: [hb(4, 8, 0, 58, 20, 6, 88, 50, 45)] },
      dair: { frames: 34, landLag: 11, hitboxes: [hb(10, 13, 0, -58, 18, 10, -70, 26, 84)] },
      nspecial: {
        frames: 26,
        projectile: { frame: 8, def: { kind: 'shot', look: 'yoyo', speed: 820, angle: 0, r: 11, lifeFrames: 50, gravity: 0, limit: 1, returns: true, hit: { dmg: 5, angle: 60, bkb: 30, kbg: 30 } } },
      },
      // The yo-yo rolls along the floor in front, hitting over and over.
      sspecial: {
        frames: 44, rehit: 5,
        hitboxes: [hb(8, 26, 60, -14, 18, 2, 70, 20, 0), hb(27, 29, 80, -12, 22, 6, 50, 46, 76)],
      },
      uspecial: { frames: 30, recovery: true, helpless: true, tether: { frame: 6, range: 300 }, boost: { frame: 6, speed: 760, steer: 30 } },
      dspecial: {
        frames: 44, rehit: 6,
        hitboxes: [hb(8, 30, 0, 0, 62, 2, 85, 26, 0), hb(31, 33, 0, 0, 64, 6, 70, 48, 80)],
      },
      grab: grab(28, 18, 6, 28),
      pummel: pummel(2),
      fthrow: throwMove(24, 10, 8, 40, 52, 68),
      bthrow: throwMove(28, 12, 9, 140, 46, 90, true),
      uthrow: throwMove(24, 10, 6, 90, 64, 50),
      dthrow: throwMove(24, 12, 5, 80, 44, 40),
      getupattack: getupAttack(30, 6),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Bard: a guitar player. Sound waves from range, a tempo song that speeds the Bard up, a lullaby
// that slows everyone near it, and a power chord to recover. Smashes slam an amp.

function bard(): FighterDef {
  return {
    id: 'bard',
    name: 'Bard',
    blurb: 'A guitar. Sound waves, a tempo song that speeds you up, a lullaby that slows foes, amp slams.',
    specials: { neutral: 'Sound Wave', side: 'Tempo Song', up: 'Power Chord', down: 'Lullaby' },
    halfW: 24, height: 32, hurtR: 23,
    weight: 92,
    walkSpeed: 330, airSpeed: 310, airAccel: 2300,
    gravity: 2200, maxFall: 880, fastFall: 1380,
    jumpSpeed: 810, airJumpSpeed: 750, airJumps: 2,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      // Guitar neck jabs.
      jab: { frames: 16, hitboxes: [hb(3, 5, 38, 2, 20, 3, 60, 26, 25)], next: { move: 'jab2', from: 6 } },
      jab2: { frames: 26, hitboxes: [hb(4, 7, 42, 2, 24, 6, 42, 42, 72)] },
      ftilt: { frames: 28, hitboxes: [hb(7, 10, 46, 2, 26, 10, 36, 34, 98)] },
      utilt: { frames: 28, hitboxes: [hb(6, 12, 0, 42, 30, 8, 90, 40, 94)] },
      dtilt: { frames: 22, hitboxes: [hb(5, 7, 42, -14, 22, 6, 30, 32, 60)] },
      // Slam an amp down in front: a big blast of sound.
      fsmash: { frames: 56, charge: { frame: 12, max: 60, dmg: 0.4 }, hitboxes: [hb(19, 23, 54, -6, 38, 19, 38, 42, 102)] },
      usmash: { frames: 48, charge: { frame: 8, max: 60, dmg: 0.4 }, rehit: 4, hitboxes: [hb(13, 20, 0, 48, 34, 2, 90, 40, 10), hb(21, 23, 0, 56, 38, 9, 88, 40, 106)] },
      dsmash: {
        frames: 48, charge: { frame: 7, max: 60, dmg: 0.4 },
        hitboxes: [hb(13, 16, 50, -14, 26, 13, 28, 40, 96), hb(13, 16, -50, -14, 26, 13, 152, 40, 96)],
      },
      nair: { frames: 28, landLag: 6, hitboxes: [hb(5, 13, 0, 0, 40, 8, 50, 28, 84)] },
      fair: { frames: 30, landLag: 8, hitboxes: [hb(8, 11, 44, 2, 26, 11, 40, 30, 98)] },
      bair: { frames: 30, landLag: 8, hitboxes: [hb(7, 10, -44, 2, 26, 12, 145, 30, 100)] },
      uair: { frames: 26, landLag: 7, hitboxes: [hb(5, 10, 0, 44, 28, 9, 88, 30, 96)] },
      dair: { frames: 34, landLag: 12, hitboxes: [hb(10, 13, 0, -38, 26, 11, -72, 26, 86)] },
      nspecial: {
        frames: 30,
        projectile: { frame: 10, def: { kind: 'shot', look: 'note', speed: 640, angle: 0, r: 20, lifeFrames: 48, gravity: 0, limit: 2, hit: { dmg: 7, angle: 35, bkb: 34, kbg: 50 } } },
      },
      // Play a fast riff: faster movement for 5 s.
      sspecial: { frames: 40, haste: { frame: 20, frames: 300 } },
      uspecial: {
        frames: 30, recovery: true, helpless: true, boost: { frame: 6, speed: 1080, steer: 30 },
        hitboxes: [hb(6, 9, 0, -20, 46, 8, 80, 50, 70)],
      },
      // A soft song: everyone close moves slowly for 4 s.
      dspecial: { frames: 46, hitboxes: [hb(16, 20, 0, 0, 96, 2, 90, 16, 0, { slow: 240, stun: 12 })] },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 42, 52, 70),
      bthrow: throwMove(30, 13, 10, 140, 48, 92, true),
      uthrow: throwMove(26, 11, 7, 90, 62, 62),
      dthrow: throwMove(26, 12, 6, 75, 48, 45),
      getupattack: getupAttack(32, 7),
    },
  };
}

export const FIGHTERS: Record<FighterId, FighterDef> = {
  brawler: brawler(),
  blade: blade(),
  spark: spark(),
  titan: titan(),
  ninja: ninja(),
  gunslinger: gunslinger(),
  chef: chef(),
  ghost: ghost(),
  yoyo: yoyo(),
  bard: bard(),
};
