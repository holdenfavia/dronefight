// The drone characters (ADR-0070). Movement in u/s, frames at 60 Hz, angles in degrees
// (0 = straight ahead, 90 = straight up, negative = down; mirrored when facing left).

export type FighterId = 'freestyle' | 'racer' | 'heavy' | 'flipper';

export const FIGHTER_IDS: readonly FighterId[] = ['freestyle', 'racer', 'heavy', 'flipper'];

export type MoveId =
  | 'jab' | 'ftilt' | 'utilt' | 'dtilt'
  | 'nair' | 'fair' | 'bair' | 'uair' | 'dair'
  | 'nspecial' | 'sspecial' | 'uspecial' | 'dspecial';

export interface Hitbox {
  /** Offset from the fighter's centre; x is forward. */
  x: number;
  y: number;
  r: number;
  dmg: number;
  angle: number;
  /** Base knockback. */
  bkb: number;
  /** Knockback growth with damage, 100 = normal. */
  kbg: number;
}

export interface ProjectileDef {
  kind: 'shot' | 'bomb';
  speed: number;
  /** Launch angle (bombs are tossed). */
  angle: number;
  r: number;
  lifeFrames: number;
  gravity: number;
  hit: Omit<Hitbox, 'x' | 'y'>;
  /** Bombs: blast radius when they go off. */
  blastR?: number;
}

export interface MoveDef {
  startup: number;
  active: number;
  endlag: number;
  hitbox?: Hitbox;
  /** Aerials: lag when you land during the move. */
  landLag?: number;
  /** Velocity set on the first active frame (x forward). */
  lunge?: { vx: number; vy: number };
  projectile?: ProjectileDef;
  /** Up special: an upward thrust burst, then a helpless fall. */
  boost?: number;
  /** Fly straight down until landing (Flipper's down special). */
  slam?: number;
  /** Gravity multiplier while the move runs. */
  gravityScale?: number;
}

export interface FighterDef {
  id: FighterId;
  name: string;
  /** One line shown on the select screen. */
  blurb: string;
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
  moves: Record<MoveId, MoveDef>;
}

/** The Freestyle moveset; other drones scale it and swap a few moves. */
function baseMoves(): Record<MoveId, MoveDef> {
  return {
    jab: { startup: 3, active: 3, endlag: 10, hitbox: { x: 30, y: 0, r: 20, dmg: 4, angle: 40, bkb: 25, kbg: 40 } },
    ftilt: { startup: 7, active: 4, endlag: 18, lunge: { vx: 260, vy: 0 }, hitbox: { x: 38, y: 0, r: 24, dmg: 11, angle: 38, bkb: 36, kbg: 100 } },
    utilt: { startup: 6, active: 5, endlag: 16, hitbox: { x: 6, y: 32, r: 28, dmg: 8, angle: 88, bkb: 40, kbg: 95 } },
    dtilt: { startup: 5, active: 4, endlag: 14, hitbox: { x: 30, y: -14, r: 20, dmg: 7, angle: 25, bkb: 35, kbg: 70 } },
    nair: { startup: 4, active: 8, endlag: 12, landLag: 6, hitbox: { x: 0, y: 0, r: 34, dmg: 8, angle: 45, bkb: 30, kbg: 80 } },
    fair: { startup: 7, active: 4, endlag: 16, landLag: 10, hitbox: { x: 36, y: 4, r: 24, dmg: 12, angle: 42, bkb: 32, kbg: 100 } },
    bair: { startup: 6, active: 4, endlag: 14, landLag: 9, hitbox: { x: -36, y: 2, r: 24, dmg: 13, angle: 140, bkb: 30, kbg: 105 } },
    uair: { startup: 5, active: 5, endlag: 12, landLag: 7, hitbox: { x: 0, y: 34, r: 26, dmg: 9, angle: 85, bkb: 30, kbg: 95 } },
    dair: { startup: 10, active: 4, endlag: 18, landLag: 14, hitbox: { x: 0, y: -30, r: 24, dmg: 13, angle: -80, bkb: 25, kbg: 85 } },
    nspecial: {
      startup: 8, active: 1, endlag: 16,
      projectile: { kind: 'shot', speed: 950, angle: 0, r: 8, lifeFrames: 48, gravity: 0, hit: { r: 8, dmg: 5, angle: 30, bkb: 22, kbg: 30 } },
    },
    sspecial: { startup: 6, active: 12, endlag: 18, gravityScale: 0.2, lunge: { vx: 900, vy: 140 }, hitbox: { x: 20, y: 0, r: 26, dmg: 10, angle: 35, bkb: 45, kbg: 80 } },
    uspecial: { startup: 4, active: 16, endlag: 4, boost: 1080, hitbox: { x: 0, y: 12, r: 28, dmg: 7, angle: 80, bkb: 50, kbg: 60 } },
    dspecial: {
      startup: 10, active: 1, endlag: 16,
      projectile: { kind: 'bomb', speed: 260, angle: 50, r: 12, lifeFrames: 100, gravity: 1800, blastR: 70, hit: { r: 70, dmg: 14, angle: 70, bkb: 50, kbg: 85 } },
    },
  };
}

/** Scale a moveset: sizes (positions and radii), damage, knockback growth and frame counts. */
function scaledMoves(size: number, dmg: number, kbg: number, frames: number): Record<MoveId, MoveDef> {
  const moves = baseMoves();
  for (const move of Object.values(moves)) {
    move.startup = Math.max(1, Math.round(move.startup * frames));
    move.active = Math.max(1, Math.round(move.active * frames));
    move.endlag = Math.max(1, Math.round(move.endlag * frames));
    if (move.landLag) move.landLag = Math.max(1, Math.round(move.landLag * frames));
    if (move.hitbox) {
      const h = move.hitbox;
      move.hitbox = { ...h, x: h.x * size, y: h.y * size, r: h.r * size, dmg: Math.round(h.dmg * dmg), kbg: h.kbg * kbg };
    }
    if (move.projectile) {
      const p = move.projectile;
      move.projectile = { ...p, r: p.r * size, hit: { ...p.hit, dmg: Math.round(p.hit.dmg * dmg), kbg: p.hit.kbg * kbg } };
    }
  }
  return moves;
}

function freestyle(): FighterDef {
  return {
    id: 'freestyle',
    name: 'Freestyle',
    blurb: 'The 5". Good at everything, great at nothing.',
    halfW: 28, height: 30, hurtR: 25,
    weight: 100,
    walkSpeed: 340, airSpeed: 310, airAccel: 2300,
    gravity: 2300, maxFall: 900, fastFall: 1400,
    jumpSpeed: 830, airJumpSpeed: 770, airJumps: 2,
    upSpecials: 1,
    moves: baseMoves(),
  };
}

function racer(): FighterDef {
  const moves = scaledMoves(0.9, 0.95, 1, 0.8);
  // Rapid little darts instead of one blaster shot.
  moves.nspecial = {
    startup: 5, active: 1, endlag: 9,
    projectile: { kind: 'shot', speed: 1250, angle: 0, r: 6, lifeFrames: 34, gravity: 0, hit: { r: 6, dmg: 3, angle: 25, bkb: 15, kbg: 20 } },
  };
  return {
    id: 'racer',
    name: 'Racer',
    blurb: 'The 3". Tiny, fast, three air jumps. Flies far when hit.',
    halfW: 21, height: 22, hurtR: 19,
    weight: 80,
    walkSpeed: 440, airSpeed: 370, airAccel: 2800,
    gravity: 2500, maxFall: 1000, fastFall: 1600,
    jumpSpeed: 840, airJumpSpeed: 740, airJumps: 3,
    upSpecials: 1,
    moves,
  };
}

function heavy(): FighterDef {
  const moves = scaledMoves(1.4, 1.25, 1, 1.3);
  // A slow cannonball that hits hard.
  moves.nspecial = {
    startup: 14, active: 1, endlag: 22,
    projectile: { kind: 'shot', speed: 620, angle: 0, r: 16, lifeFrames: 70, gravity: 0, hit: { r: 16, dmg: 13, angle: 40, bkb: 45, kbg: 70 } },
  };
  moves.uspecial.boost = 1150;
  return {
    id: 'heavy',
    name: 'Heavy',
    blurb: 'The X8. Huge, slow, hits like a truck. Hard to launch.',
    halfW: 42, height: 42, hurtR: 37,
    weight: 140,
    walkSpeed: 260, airSpeed: 250, airAccel: 1800,
    gravity: 2150, maxFall: 860, fastFall: 1250,
    jumpSpeed: 780, airJumpSpeed: 730, airJumps: 1,
    upSpecials: 1,
    moves,
  };
}

function flipper(): FighterDef {
  const moves = scaledMoves(1, 0.9, 1, 0.95);
  // Reversible motors: slams straight down, spiking anyone underneath.
  moves.dspecial = {
    startup: 8, active: 40, endlag: 14, slam: 1600, landLag: 12,
    hitbox: { x: 0, y: -18, r: 28, dmg: 12, angle: -70, bkb: 40, kbg: 75 },
  };
  moves.uspecial.boost = 900;
  return {
    id: 'flipper',
    name: 'Flipper',
    blurb: 'The 3D quad. Floaty, two up specials, slams down to spike.',
    halfW: 28, height: 30, hurtR: 25,
    weight: 90,
    walkSpeed: 320, airSpeed: 340, airAccel: 2500,
    gravity: 1950, maxFall: 760, fastFall: 1200,
    jumpSpeed: 760, airJumpSpeed: 700, airJumps: 2,
    upSpecials: 2,
    moves,
  };
}

export const FIGHTERS: Record<FighterId, FighterDef> = {
  freestyle: freestyle(),
  racer: racer(),
  heavy: heavy(),
  flipper: flipper(),
};
