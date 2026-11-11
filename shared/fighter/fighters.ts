// The drone characters (ADR-0070, movesets: ADR-0071). Movement in u/s, frames at 60 Hz, angles in degrees
// (0 = straight ahead, 90 = straight up, negative = down; mirrored when facing left).
// Every drone has its own moveset: its own frame data, reach and power, and its own specials.

export type FighterId = 'freestyle' | 'racer' | 'heavy' | 'flipper';

export const FIGHTER_IDS: readonly FighterId[] = ['freestyle', 'racer', 'heavy', 'flipper'];

/** Moves every drone has. */
export type CoreMoveId =
  | 'jab' | 'ftilt' | 'utilt' | 'dtilt'
  | 'fsmash' | 'usmash' | 'dsmash'
  | 'nair' | 'fair' | 'bair' | 'uair' | 'dair'
  | 'nspecial' | 'sspecial' | 'uspecial' | 'dspecial'
  | 'grab' | 'pummel' | 'fthrow' | 'bthrow' | 'uthrow' | 'dthrow'
  | 'getupattack';

/** Moves only some drones have: jab follow-ups, air versions of specials, and moves other moves lead into. */
export type ExtraMoveId =
  | 'jab2' | 'jab3'
  | 'nspecialAir' | 'sspecialAir' | 'dspecialAir'
  | 'counterhit' | 'cmdthrow' | 'slamland';

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
  /** Grabs can catch airborne drones too (command grabs). */
  grabAir?: boolean;
  /** The grab goes straight into this move (command grabs). */
  grabMove?: MoveId;
  /** Damage is taken from the countered attack. */
  counter?: boolean;
}

export interface ProjectileDef {
  /** shot flies straight, bomb is tossed and goes off on contact, mine sits on the floor until someone comes near, gust pushes. */
  kind: 'shot' | 'bomb' | 'mine' | 'gust';
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
  /** Up specials: an upward thrust, aimed a little with left/right, then a helpless fall. */
  boost?: { frame: number; speed: number; steer: number };
  /** Fly straight down until landing; then play landMove. */
  slam?: { frame: number; speed: number; landMove?: MoveId };
  /** Gravity multiplier for a span of frames. */
  gravity?: { from: number; to: number; scale: number };
  projectile?: { frame: number; def: ProjectileDef };
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
  /** Grabs: hit the held drone on this frame; release sends them flying. */
  throwHit?: { frame: number; hit: HitStats; release: boolean; behind?: boolean };
  /** Flip around when the move ends. */
  turn?: boolean;
}

type CoreMoves = Record<CoreMoveId, MoveDef>;
export type Moveset = CoreMoves & Partial<Record<ExtraMoveId, MoveDef>>;

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
  /** Hold jump in the air to hover for up to this many frames per trip off the ground. */
  hoverFrames: number;
  moves: Moveset;
}

/** A hitbox: active frames, offset, radius, then damage, angle, base and growing knockback. */
function hb(from: number, to: number, x: number, y: number, r: number, dmg: number, angle: number, bkb: number, kbg: number, extra: Partial<Hitbox> = {}): Hitbox {
  return { from, to, x, y, r, dmg, angle, bkb, kbg, ...extra };
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
// Freestyle: the 5". Honest all-rounder: a three-hit jab, a charge blaster, a counter.

function freestyle(): FighterDef {
  return {
    id: 'freestyle',
    name: 'Freestyle',
    blurb: 'The 5". Good at everything. Charge blaster, aimed thrust, counter.',
    specials: { neutral: 'Charge Blaster', side: 'Barrel Roll', up: 'Punch Out', down: 'Counter' },
    halfW: 28, height: 30, hurtR: 25,
    weight: 100,
    walkSpeed: 340, airSpeed: 310, airAccel: 2300,
    gravity: 2300, maxFall: 900, fastFall: 1400,
    jumpSpeed: 830, airJumpSpeed: 770, airJumps: 2,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 16, hitboxes: [hb(3, 4, 30, 0, 20, 3, 70, 22, 15)], next: { move: 'jab2', from: 6 } },
      jab2: { frames: 18, hitboxes: [hb(3, 4, 32, 0, 20, 3, 70, 22, 15)], next: { move: 'jab3', from: 6 } },
      jab3: { frames: 28, hitboxes: [hb(5, 7, 36, 2, 24, 6, 40, 45, 70)] },
      ftilt: { frames: 28, lunge: { frame: 7, vx: 260, vy: 0 }, hitboxes: [hb(7, 10, 40, 0, 24, 10, 38, 34, 100)] },
      utilt: { frames: 26, hitboxes: [hb(6, 8, 26, 18, 24, 7, 95, 40, 95), hb(9, 11, -10, 34, 26, 7, 85, 40, 95)] },
      dtilt: { frames: 22, hitboxes: [hb(5, 7, 32, -14, 20, 6, 78, 40, 55)] },
      fsmash: {
        frames: 46, charge: { frame: 9, max: 60, dmg: 0.4 }, lunge: { frame: 14, vx: 320, vy: 0 },
        hitboxes: [hb(14, 16, 44, 0, 28, 16, 38, 40, 104), hb(17, 19, 40, 0, 22, 12, 40, 34, 95)],
      },
      usmash: {
        frames: 44, charge: { frame: 7, max: 60, dmg: 0.4 },
        hitboxes: [hb(11, 12, 0, 22, 34, 3, 92, 60, 0), hb(13, 17, 0, 40, 32, 13, 88, 36, 100)],
      },
      dsmash: {
        frames: 44, charge: { frame: 5, max: 60, dmg: 0.4 },
        hitboxes: [hb(9, 11, 36, -12, 24, 13, 30, 38, 98), hb(15, 17, -36, -12, 24, 12, 150, 38, 98)],
      },
      nair: { frames: 26, landLag: 6, hitboxes: [hb(4, 7, 0, 0, 34, 9, 45, 30, 85), hb(8, 14, 0, 0, 30, 6, 45, 25, 70)] },
      fair: { frames: 32, landLag: 10, hitboxes: [hb(8, 9, 40, 4, 22, 13, 42, 32, 102), hb(10, 12, 32, 4, 22, 9, 42, 28, 90)] },
      bair: { frames: 28, landLag: 9, hitboxes: [hb(6, 9, -36, 2, 24, 13, 140, 30, 105)] },
      uair: { frames: 26, landLag: 7, hitboxes: [hb(5, 9, 0, 34, 26, 9, 85, 30, 95)] },
      dair: { frames: 36, landLag: 14, hitboxes: [hb(12, 13, 0, -30, 22, 14, -80, 25, 90), hb(14, 17, 0, -26, 24, 9, 60, 25, 70)] },
      nspecial: {
        frames: 26, charge: { frame: 6, max: 60, dmg: 0 },
        projectile: {
          frame: 8,
          def: { kind: 'shot', speed: 950, angle: 0, r: 8, lifeFrames: 54, gravity: 0, hit: { dmg: 4, angle: 30, bkb: 22, kbg: 35 }, charged: { r: 2.6, dmg: 4, kb: 2.2 } },
        },
      },
      sspecial: { frames: 36, recovery: true, gravity: { from: 1, to: 18, scale: 0.2 }, lunge: { frame: 7, vx: 900, vy: 140 }, hitboxes: [hb(7, 18, 20, 0, 26, 10, 35, 45, 80)] },
      uspecial: { frames: 24, recovery: true, helpless: true, boost: { frame: 5, speed: 1080, steer: 35 }, hitboxes: [hb(5, 14, 0, 14, 28, 7, 80, 50, 60)] },
      dspecial: { frames: 34, counter: { from: 5, to: 24, move: 'counterhit', mult: 1.3 } },
      counterhit: { frames: 30, invincible: { from: 1, to: 12 }, hitboxes: [hb(5, 8, 36, 0, 32, 8, 40, 50, 85, { counter: true })] },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(24, 10, 8, 40, 55, 70),
      bthrow: throwMove(30, 14, 10, 140, 48, 92, true),
      uthrow: throwMove(28, 12, 7, 90, 62, 62),
      dthrow: throwMove(28, 14, 6, 72, 48, 45),
      getupattack: getupAttack(32, 7),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Racer: the 3". Tiny and quick: rapid jabs, multi-hit drills, rapid darts, two air dashes, a mine.

function racer(): FighterDef {
  return {
    id: 'racer',
    name: 'Racer',
    blurb: 'The 3". Tiny, fast, three air jumps. Rapid hits, darts, mines. Flies far.',
    specials: { neutral: 'Dart Gun', side: 'Slipstream', up: 'Rocket Climb', down: 'Prox Mine' },
    halfW: 21, height: 22, hurtR: 19,
    weight: 80,
    walkSpeed: 440, airSpeed: 370, airAccel: 2800,
    gravity: 2500, maxFall: 1000, fastFall: 1650,
    jumpSpeed: 840, airJumpSpeed: 740, airJumps: 3,
    upSpecials: 1, sideSpecials: 2, hoverFrames: 0,
    moves: {
      // Hold attack for a flurry; let go for the finisher.
      jab: { frames: 22, loop: { from: 3, to: 6 }, rehit: 3, hitboxes: [hb(3, 6, 26, 0, 18, 1, 80, 14, 0), hb(10, 11, 30, 0, 22, 4, 40, 40, 70)] },
      ftilt: { frames: 22, hitboxes: [hb(5, 7, 32, 0, 20, 8, 36, 30, 95)] },
      utilt: { frames: 20, hitboxes: [hb(4, 7, 4, 28, 24, 6, 92, 38, 90)] },
      dtilt: { frames: 16, hitboxes: [hb(4, 5, 28, -10, 18, 5, 70, 34, 50)] },
      fsmash: {
        frames: 40, charge: { frame: 8, max: 60, dmg: 0.4 }, lunge: { frame: 11, vx: 640, vy: 0 },
        hitboxes: [hb(11, 16, 24, 0, 24, 13, 36, 36, 100)],
      },
      usmash: {
        frames: 38, charge: { frame: 6, max: 60, dmg: 0.4 }, rehit: 3,
        hitboxes: [hb(9, 17, 0, 26, 26, 2, 95, 50, 0), hb(18, 20, 0, 34, 28, 7, 88, 40, 110)],
      },
      dsmash: {
        frames: 34, charge: { frame: 4, max: 60, dmg: 0.4 },
        hitboxes: [hb(7, 10, 30, -8, 22, 11, 25, 36, 95), hb(7, 10, -30, -8, 22, 11, 155, 36, 95)],
      },
      nair: { frames: 28, landLag: 6, rehit: 4, hitboxes: [hb(5, 18, 0, 0, 28, 2, 60, 22, 0), hb(20, 21, 0, 0, 30, 5, 45, 34, 80)] },
      fair: { frames: 24, landLag: 7, hitboxes: [hb(5, 8, 30, 2, 20, 9, 42, 30, 98)] },
      bair: { frames: 24, landLag: 8, hitboxes: [hb(5, 8, -30, 2, 20, 11, 145, 28, 100)] },
      uair: { frames: 22, landLag: 6, hitboxes: [hb(4, 5, 10, 28, 22, 4, 85, 30, 30), hb(8, 10, -6, 30, 24, 6, 88, 32, 100)] },
      dair: { frames: 34, landLag: 12, rehit: 4, hitboxes: [hb(6, 18, 0, -24, 22, 2, -60, 16, 0), hb(20, 21, 0, -24, 24, 5, -50, 30, 70)] },
      // Hold special to keep firing.
      nspecial: {
        frames: 16, loop: { from: 4, to: 9 },
        projectile: { frame: 5, def: { kind: 'shot', speed: 1250, angle: 0, r: 6, lifeFrames: 34, gravity: 0, hit: { dmg: 2, angle: 25, bkb: 14, kbg: 15 } } },
      },
      sspecial: { frames: 30, recovery: true, gravity: { from: 1, to: 14, scale: 0 }, lunge: { frame: 5, vx: 1300, vy: 60 }, hitboxes: [hb(5, 13, 10, 0, 22, 7, 30, 40, 70)] },
      uspecial: { frames: 24, recovery: true, helpless: true, boost: { frame: 4, speed: 1260, steer: 20 }, rehit: 4, hitboxes: [hb(4, 12, 0, 12, 24, 3, 85, 40, 20), hb(13, 14, 0, 18, 26, 5, 85, 45, 80)] },
      dspecial: {
        frames: 26,
        projectile: { frame: 9, def: { kind: 'mine', speed: 160, angle: 60, r: 9, lifeFrames: 900, gravity: 1800, blastR: 62, limit: 1, hit: { dmg: 11, angle: 80, bkb: 50, kbg: 75 } } },
      },
      grab: grab(24, 16, 6, 26),
      pummel: pummel(1, 10),
      fthrow: throwMove(20, 8, 7, 35, 50, 65),
      bthrow: throwMove(24, 10, 8, 140, 45, 80, true),
      uthrow: throwMove(22, 9, 5, 92, 58, 55),
      dthrow: throwMove(24, 12, 5, 80, 40, 40),
      getupattack: getupAttack(26, 6),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Heavy: the X8. Slow and huge, with super armor on its smashes, a command grab and a ground pound.

function heavy(): FighterDef {
  return {
    id: 'heavy',
    name: 'Heavy',
    blurb: 'The X8. Huge, slow, armored smashes, a bear hug and a ground pound.',
    specials: { neutral: 'Cannonball', side: 'Bear Hug', up: 'Heavy Lift', down: 'Ground Pound' },
    halfW: 42, height: 42, hurtR: 37,
    weight: 140,
    walkSpeed: 260, airSpeed: 250, airAccel: 1800,
    gravity: 2150, maxFall: 860, fastFall: 1250,
    jumpSpeed: 780, airJumpSpeed: 730, airJumps: 1,
    upSpecials: 1, sideSpecials: 1, hoverFrames: 0,
    moves: {
      jab: { frames: 22, hitboxes: [hb(5, 6, 44, 0, 26, 6, 60, 30, 30)], next: { move: 'jab2', from: 8 } },
      jab2: { frames: 34, hitboxes: [hb(7, 9, 50, 2, 30, 10, 40, 48, 80)] },
      ftilt: { frames: 38, lunge: { frame: 11, vx: 200, vy: 0 }, hitboxes: [hb(11, 14, 56, 0, 32, 14, 36, 36, 102)] },
      utilt: { frames: 36, hitboxes: [hb(9, 13, 0, 46, 38, 12, 88, 40, 100)] },
      dtilt: { frames: 30, hitboxes: [hb(8, 10, 46, -18, 28, 11, 28, 40, 85)] },
      fsmash: {
        frames: 62, charge: { frame: 11, max: 60, dmg: 0.4 }, armor: { from: 1, to: 22, kb: 120 },
        hitboxes: [hb(20, 23, 60, 4, 38, 23, 36, 40, 100)],
      },
      usmash: {
        frames: 56, charge: { frame: 9, max: 60, dmg: 0.4 }, armor: { from: 1, to: 18, kb: 110 },
        hitboxes: [hb(16, 20, 0, 56, 44, 20, 88, 40, 98)],
      },
      dsmash: {
        frames: 56, charge: { frame: 8, max: 60, dmg: 0.4 }, armor: { from: 1, to: 16, kb: 110 },
        hitboxes: [hb(15, 18, 58, -16, 34, 17, 28, 42, 94), hb(15, 18, -58, -16, 34, 17, 152, 42, 94)],
      },
      nair: { frames: 34, landLag: 10, hitboxes: [hb(7, 12, 0, 0, 48, 12, 45, 34, 90)] },
      // The sweet spot right at the start spikes; later it just hits hard.
      fair: { frames: 44, landLag: 16, hitboxes: [hb(13, 14, 46, -6, 32, 16, -60, 30, 85), hb(15, 18, 50, 0, 32, 14, 40, 34, 98)] },
      bair: { frames: 36, landLag: 12, hitboxes: [hb(9, 12, -52, 2, 32, 17, 140, 32, 102)] },
      uair: { frames: 34, landLag: 11, hitboxes: [hb(8, 12, 0, 50, 36, 14, 88, 34, 98)] },
      dair: { frames: 46, landLag: 20, hitboxes: [hb(15, 18, 0, -42, 32, 16, -85, 28, 92)] },
      nspecial: {
        frames: 40, charge: { frame: 10, max: 60, dmg: 0 },
        projectile: {
          frame: 14,
          def: { kind: 'shot', speed: 620, angle: 0, r: 14, lifeFrames: 80, gravity: 0, hit: { dmg: 9, angle: 40, bkb: 40, kbg: 60 }, charged: { r: 1.8, dmg: 2.6, kb: 1.9 } },
        },
      },
      // A command grab that catches shields and drones in the air, then lifts and slams.
      sspecial: {
        frames: 44, armor: { from: 1, to: 16, kb: 90 }, lunge: { frame: 8, vx: 420, vy: 0 },
        hitboxes: [hb(10, 16, 46, 2, 30, 0, 0, 0, 0, { grab: true, grabAir: true, grabMove: 'cmdthrow' })],
      },
      sspecialAir: {
        frames: 42, recovery: true, gravity: { from: 1, to: 20, scale: 0.3 }, lunge: { frame: 8, vx: 640, vy: 260 },
        hitboxes: [hb(8, 18, 34, 0, 34, 12, 40, 45, 80)],
      },
      cmdthrow: { frames: 46, throwHit: { frame: 28, hit: { dmg: 16, angle: 75, bkb: 60, kbg: 72 }, release: true } },
      uspecial: { frames: 30, recovery: true, helpless: true, boost: { frame: 6, speed: 1150, steer: 25 }, rehit: 5, hitboxes: [hb(6, 22, 0, 36, 40, 3, 88, 45, 15), hb(23, 25, 0, 40, 40, 6, 88, 45, 80)] },
      // On the ground it's a stomp; in the air it plummets and quakes on landing.
      dspecial: { frames: 1, slam: { frame: 1, speed: 0, landMove: 'slamland' } },
      dspecialAir: { frames: 60, slam: { frame: 8, speed: 1700, landMove: 'slamland' }, hitboxes: [hb(8, 60, 0, -24, 32, 12, -75, 40, 70)] },
      slamland: { frames: 34, hitboxes: [hb(2, 5, 64, -16, 36, 12, 70, 55, 70), hb(2, 5, -64, -16, 36, 12, 110, 55, 70)] },
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
// Flipper: the 3D quad. Floaty: hold jump to hover, two up specials, a gust that pushes, a slam spike.

function flipper(): FighterDef {
  return {
    id: 'flipper',
    name: 'Flipper',
    blurb: 'The 3D quad. Floaty: hold jump to hover. Gust, flip kick, slam spike.',
    specials: { neutral: 'Reverse Gust', side: 'Flip Kick', up: 'Flip Up (x2)', down: 'Slam' },
    halfW: 28, height: 30, hurtR: 25,
    weight: 90,
    walkSpeed: 320, airSpeed: 340, airAccel: 2500,
    gravity: 1950, maxFall: 760, fastFall: 1200,
    jumpSpeed: 760, airJumpSpeed: 700, airJumps: 2,
    upSpecials: 2, sideSpecials: 1, hoverFrames: 70,
    moves: {
      jab: { frames: 18, hitboxes: [hb(3, 5, 30, 4, 22, 4, 65, 28, 25)], next: { move: 'jab2', from: 7 } },
      jab2: { frames: 28, hitboxes: [hb(4, 7, 30, 10, 26, 6, 60, 45, 70)] },
      ftilt: { frames: 28, hitboxes: [hb(7, 10, 38, -2, 24, 10, 32, 36, 98)] },
      utilt: { frames: 28, hitboxes: [hb(6, 12, 0, 30, 32, 8, 90, 42, 92)] },
      dtilt: { frames: 22, hitboxes: [hb(5, 7, 34, -14, 20, 7, 20, 32, 70)] },
      fsmash: {
        frames: 46, charge: { frame: 10, max: 60, dmg: 0.4 },
        hitboxes: [hb(14, 17, 42, 6, 30, 15, 35, 38, 104)],
      },
      usmash: {
        frames: 44, charge: { frame: 8, max: 60, dmg: 0.4 },
        hitboxes: [hb(12, 18, 0, 36, 38, 14, 90, 38, 100)],
      },
      dsmash: {
        frames: 42, charge: { frame: 6, max: 60, dmg: 0.4 },
        hitboxes: [hb(10, 16, 0, -10, 46, 12, 20, 40, 92)],
      },
      nair: { frames: 28, landLag: 6, hitboxes: [hb(5, 14, 0, 0, 36, 8, 50, 30, 80)] },
      fair: { frames: 30, landLag: 9, hitboxes: [hb(7, 10, 36, 0, 24, 11, 40, 30, 98)] },
      // The strongest aerial: a reverse-thrust kick backward.
      bair: { frames: 32, landLag: 10, hitboxes: [hb(8, 10, -38, 2, 26, 15, 145, 34, 106)] },
      uair: { frames: 26, landLag: 7, hitboxes: [hb(5, 10, 0, 36, 28, 10, 85, 32, 95)] },
      dair: { frames: 32, landLag: 12, hitboxes: [hb(9, 13, 0, -30, 26, 11, -70, 28, 82)] },
      // A gust of reversed thrust: no damage, but it pushes drones away (off the edge).
      nspecial: {
        frames: 30,
        projectile: { frame: 9, def: { kind: 'gust', speed: 520, angle: 0, r: 34, lifeFrames: 40, gravity: 0, limit: 1, hit: { dmg: 0, angle: 0, bkb: 0, kbg: 0, wind: 900 } } },
      },
      sspecial: {
        frames: 38, recovery: true, turn: true, gravity: { from: 1, to: 20, scale: 0.25 }, lunge: { frame: 6, vx: 760, vy: 180 },
        hitboxes: [hb(6, 12, 24, 0, 26, 8, 40, 40, 70), hb(13, 18, -26, 4, 28, 12, 140, 40, 90)],
      },
      uspecial: { frames: 22, recovery: true, helpless: true, boost: { frame: 4, speed: 900, steer: 40 }, hitboxes: [hb(4, 12, 0, 12, 28, 6, 80, 50, 60)] },
      dspecial: {
        frames: 50, slam: { frame: 8, speed: 1600 }, landLag: 12,
        hitboxes: [hb(8, 50, 0, -18, 28, 12, -70, 40, 75)],
      },
      grab: grab(30, 20, 7, 30),
      pummel: pummel(2),
      fthrow: throwMove(26, 11, 9, 45, 50, 72),
      bthrow: throwMove(30, 13, 11, 145, 46, 95, true),
      uthrow: throwMove(26, 11, 6, 90, 70, 60),
      dthrow: throwMove(26, 12, 6, 100, 50, 40),
      getupattack: getupAttack(32, 7),
    },
  };
}

export const FIGHTERS: Record<FighterId, FighterDef> = {
  freestyle: freestyle(),
  racer: racer(),
  heavy: heavy(),
  flipper: flipper(),
};
