// The side-view fighter simulation (ADR-0070, combat: ADR-0071): a fixed 60 Hz step from inputs to state.
// Pure data in, pure data out, no rendering, so the server can run it too when online play arrives.

import {
  AIRDODGE, DODGE, DROP_HOLD_FRAMES, DT, GRAB, HITLAG, KNOCKBACK, KNOCKDOWN, LEDGE, MATCH, MOVEMENT, PARRY, SHIELD,
  SHIELD_DROP_FRAMES, SMASH, STALE, TECH, UP_SPECIAL_JUMP_REFUND,
} from './config.js';
import { FIGHTERS, type FighterDef, type FighterId, type Hitbox, type HitStats, type MoveDef, type MoveId, type ProjectileDef } from './fighters.js';
import { nextRandom } from './rng.js';
import { STAGES, type Platform, type StageDef, type StageId } from './stages.js';

/**
 * One frame of controls. left/right/up/down move (up jumps). attack and special are held while an
 * attack or special is asked for; the aim keys say which way (arrow keys). With no aim key held,
 * attacks and specials take their direction from movement.
 */
export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean;
  aimLeft: boolean;
  aimRight: boolean;
  aimUp: boolean;
  aimDown: boolean;
  special: boolean;
  shield: boolean;
  grab: boolean;
}

export const NO_INPUT: Input = {
  left: false, right: false, up: false, down: false,
  attack: false, aimLeft: false, aimRight: false, aimUp: false, aimDown: false,
  special: false, shield: false, grab: false,
};

const INPUT_KEYS = Object.keys(NO_INPUT) as (keyof Input)[];

export type Action =
  | 'idle' | 'jumpsquat' | 'air' | 'land' | 'attack' | 'hitstun' | 'helpless'
  | 'shield' | 'shieldstun' | 'shieldbreak' | 'roll' | 'spotdodge' | 'airdodge'
  | 'holding' | 'held' | 'down' | 'getup' | 'tech'
  | 'dead' | 'respawn' | 'out';

export interface FighterStats {
  kos: number;
  falls: number;
  selfDestructs: number;
  damageDealt: number;
}

/** Keys that went down this frame. attack is set by any attack key, aimed or not. */
export type Pressed = Record<keyof Input, boolean>;

export interface Fighter {
  slot: number;
  id: FighterId;
  x: number;
  /** Feet. */
  y: number;
  vx: number;
  vy: number;
  /** Knockback velocity, decays separately from movement. */
  lx: number;
  ly: number;
  facing: 1 | -1;
  grounded: boolean;
  action: Action;
  /** Frames into the current action. */
  frame: number;
  /** Length of timed actions (hitstun, landing lag, stun). */
  duration: number;
  move: MoveId | null;
  /** Slots already hit by the current move. */
  moveHits: number[];
  /** The button that started the move; holding it charges or repeats. */
  moveButton: 'attack' | 'special' | null;
  /** Frames charged so far, and the damage multiplier that gives. */
  charge: number;
  chargeMult: number;
  /** The current move already counted toward staleness. */
  staleCounted: boolean;
  percent: number;
  stocks: number;
  airJumpsLeft: number;
  upSpecialsLeft: number;
  sideSpecialsLeft: number;
  airDodgeUsed: boolean;
  fastFalling: boolean;
  hoverLeft: number;
  hovering: boolean;
  dropThrough: number;
  /** Frames down has been held. */
  downHeld: number;
  hitlag: number;
  invincible: number;
  shieldHp: number;
  /** Slot this fighter holds in a grab, or -1. */
  grabbing: number;
  /** Slot holding this fighter, or -1. */
  grabbedBy: number;
  /** Frames left before the grab lets go. */
  grabTimer: number;
  /** Launched hard: landing without a tech knocks you down. */
  tumbling: boolean;
  /** World frame of the last shield press that counts for a tech. */
  techPress: number;
  lastShieldPress: number;
  airJumpFrame: number;
  /** The air dodge has a direction. */
  dodgeDash: boolean;
  /** Damage the counter strikes back with. */
  counterDmg: number;
  /** World frame each direction key last went down (for smash attacks). */
  pressFrame: { left: number; right: number; up: number; down: number };
  /** Presses made while busy, replayed when free (a few frames of input buffer). */
  buffer: Pressed | null;
  bufferFrame: number;
  /** Recent moves that hit, newest last, for stale-move weakening. */
  stale: MoveId[];
  /** Last fighter to hit this one, and when, for KO credit. */
  lastHitBy: number;
  lastHitFrame: number;
  /** Knockback of the last hit, for tumbling and trails. */
  lastKb: number;
  prev: Input;
  stats: FighterStats;
}

export interface Projectile {
  id: number;
  owner: number;
  kind: ProjectileDef['kind'];
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  gravity: number;
  hit: HitStats;
  blastR: number;
  /** Mines: resting on the floor. */
  stuck: boolean;
  move: MoveId;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; dmg: number; kb: number; attacker: number; target: number; armored?: boolean }
  | { type: 'shieldhit'; x: number; y: number; target: number }
  | { type: 'shieldbreak'; target: number }
  | { type: 'parry'; x: number; y: number; target: number }
  | { type: 'counter'; x: number; y: number; slot: number }
  | { type: 'grab'; slot: number; target: number }
  | { type: 'throw'; slot: number; target: number }
  | { type: 'tech'; slot: number }
  | { type: 'ko'; slot: number; x: number; y: number; by: number }
  | { type: 'jump'; slot: number; air: boolean }
  | { type: 'land'; slot: number; hard: boolean }
  | { type: 'swing'; slot: number; move: MoveId }
  | { type: 'shot'; slot: number; kind: ProjectileDef['kind'] }
  | { type: 'explode'; x: number; y: number; r: number }
  | { type: 'respawn'; slot: number }
  | { type: 'go' }
  | { type: 'gameover'; winner: number };

export interface FighterSetup {
  id: FighterId;
}

export interface World {
  stage: StageDef;
  frame: number;
  countdown: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  nextProjectileId: number;
  rng: { seed: number };
  over: boolean;
  /** Slot of the winner, or -1 for none (yet). */
  winner: number;
  /** Events from the last step, for sound and effects. */
  events: GameEvent[];
}

export function createWorld(stageId: StageId, setups: FighterSetup[], stocks: number = MATCH.defaultStocks, seed = 1): World {
  const stage = STAGES[stageId];
  const fighters = setups.map((setup, slot): Fighter => {
    const spawn = stage.spawns[slot % stage.spawns.length]!;
    const def = FIGHTERS[setup.id];
    return {
      slot,
      id: setup.id,
      x: spawn.x,
      y: spawn.y,
      vx: 0, vy: 0, lx: 0, ly: 0,
      facing: spawn.x <= 0 ? 1 : -1,
      grounded: true,
      action: 'idle',
      frame: 0,
      duration: 0,
      move: null,
      moveHits: [],
      moveButton: null,
      charge: 0,
      chargeMult: 1,
      staleCounted: false,
      percent: 0,
      stocks,
      airJumpsLeft: def.airJumps,
      upSpecialsLeft: def.upSpecials,
      sideSpecialsLeft: def.sideSpecials,
      airDodgeUsed: false,
      fastFalling: false,
      hoverLeft: def.hoverFrames,
      hovering: false,
      dropThrough: 0,
      downHeld: 0,
      hitlag: 0,
      invincible: 0,
      shieldHp: SHIELD.maxHp,
      grabbing: -1,
      grabbedBy: -1,
      grabTimer: 0,
      tumbling: false,
      techPress: -9999,
      lastShieldPress: -9999,
      airJumpFrame: -9999,
      dodgeDash: false,
      counterDmg: 0,
      pressFrame: { left: -9999, right: -9999, up: -9999, down: -9999 },
      buffer: null,
      bufferFrame: -9999,
      stale: [],
      lastHitBy: -1,
      lastHitFrame: -9999,
      lastKb: 0,
      prev: { ...NO_INPUT },
      stats: { kos: 0, falls: 0, selfDestructs: 0, damageDealt: 0 },
    };
  });
  return {
    stage,
    frame: 0,
    countdown: MATCH.countdownFrames,
    fighters,
    projectiles: [],
    nextProjectileId: 1,
    rng: { seed },
    over: false,
    winner: -1,
    events: [],
  };
}

export function fighterDef(f: Fighter): FighterDef {
  return FIGHTERS[f.id];
}

/** The move the fighter is doing (only call while f.move is set). */
export function moveOf(f: Fighter): MoveDef {
  return FIGHTERS[f.id].moves[f.move!]!;
}

/** Centre of the hurtbox. */
export function centerY(f: Fighter): number {
  return f.y + fighterDef(f).height / 2;
}

export function isAlive(f: Fighter): boolean {
  return f.action !== 'dead' && f.action !== 'out';
}

function inRange(frame: number, span: { from: number; to: number } | undefined): boolean {
  return !!span && frame >= span.from && frame <= span.to;
}

/** Hitboxes of the current move that are out this frame, in world space. */
export function activeHitboxes(f: Fighter): { x: number; y: number; r: number; hb: Hitbox }[] {
  if (f.action !== 'attack' || !f.move) return [];
  const m = moveOf(f);
  if (!m.hitboxes) return [];
  // Slams only hit on the way down.
  if (m.slam && m.slam.speed > 0 && (f.grounded || f.frame < m.slam.frame)) return [];
  const cy = centerY(f);
  const out: { x: number; y: number; r: number; hb: Hitbox }[] = [];
  for (const hb of m.hitboxes) {
    if (f.frame >= hb.from && f.frame <= hb.to) out.push({ x: f.x + f.facing * hb.x, y: cy + hb.y, r: hb.r, hb });
  }
  return out;
}

/** Is the move in its active (hitting) frames? */
export function moveActive(f: Fighter): boolean {
  return activeHitboxes(f).length > 0;
}

/** How charged the current move is, 0 to 1. */
export function chargeFraction(f: Fighter): number {
  if (f.action !== 'attack' || !f.move) return 0;
  const c = moveOf(f).charge;
  return c ? f.charge / c.max : 0;
}

/** Knockback (grows with the target's damage, shrinks with weight). */
export function knockback(percentAfter: number, dmg: number, weight: number, bkb: number, kbg: number): number {
  const p = percentAfter;
  return ((p / 10 + (p * dmg) / 20) * (200 / (weight + 100)) * 1.4 + 18) * (kbg / 100) + bkb;
}

/** Advance one frame. Inputs are by slot; missing slots get no input. */
export function step(world: World, inputs: readonly Input[]): void {
  world.events = [];
  world.frame++;
  if (world.countdown > 0) {
    world.countdown--;
    if (world.countdown === 0) world.events.push({ type: 'go' });
    for (const f of world.fighters) f.prev = { ...(inputs[f.slot] ?? NO_INPUT) };
    return;
  }
  for (const f of world.fighters) {
    const input = inputs[f.slot] ?? NO_INPUT;
    updateFighter(world, f, input);
    f.prev = { ...input };
  }
  pinHeld(world);
  updateProjectiles(world);
  resolveHits(world);
  checkGameOver(world);
}

// ---------------------------------------------------------------------------------------------
// Input helpers

function pressedEdges(input: Input, prev: Input): Pressed {
  const p = {} as Pressed;
  for (const k of INPUT_KEYS) p[k] = input[k] && !prev[k];
  // A new aim key while attack (or special) is held is a new press of it, aimed that way.
  const aimEdge = p.aimLeft || p.aimRight || p.aimUp || p.aimDown;
  p.attack = p.attack || (input.attack && aimEdge);
  p.special = p.special || (input.special && aimEdge);
  return p;
}

function anyPressed(p: Pressed): boolean {
  return INPUT_KEYS.some((k) => p[k]);
}

function stickX(input: Input): number {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

/** Direction of an aimed attack: the aim keys just pressed, else those held. Null when not aimed. */
function aimOf(input: Input, press: Pressed): { x: number; y: number } | null {
  const fromKeys = (l: boolean, r: boolean, u: boolean, d: boolean) => {
    const x = (r ? 1 : 0) - (l ? 1 : 0);
    const y = (u ? 1 : 0) - (d ? 1 : 0);
    return x !== 0 || y !== 0 ? { x, y } : null;
  };
  return fromKeys(press.aimLeft, press.aimRight, press.aimUp, press.aimDown) ?? fromKeys(input.aimLeft, input.aimRight, input.aimUp, input.aimDown);
}

/** The direction key was pressed just now (within the smash window). */
function fresh(world: World, f: Fighter, key: 'left' | 'right' | 'up' | 'down'): boolean {
  return world.frame - f.pressFrame[key] <= SMASH.flickFrames;
}

function dirKey(x: number): 'left' | 'right' {
  return x > 0 ? 'right' : 'left';
}

/**
 * Which grounded attack an attack press means. Aimed (arrow keys): up = up tilt, down = down tilt,
 * forward = jab; holding the same way with the movement keys = forward tilt; pressing that movement key
 * together with the arrow = smash. Not aimed: the old "attack + direction" rules.
 */
function groundAttack(world: World, f: Fighter, input: Input, press: Pressed): { move: MoveId; facing?: 1 | -1 } {
  const aim = aimOf(input, press);
  const mx = stickX(input);
  if (aim) {
    if (aim.y > 0) return { move: input.up && fresh(world, f, 'up') ? 'usmash' : 'utilt' };
    if (aim.y < 0) return { move: input.down && fresh(world, f, 'down') ? 'dsmash' : 'dtilt' };
    const face: 1 | -1 = aim.x > 0 ? 1 : -1;
    if (mx === face) return { move: fresh(world, f, dirKey(face)) ? 'fsmash' : 'ftilt', facing: face };
    if (mx === -face) return { move: 'ftilt', facing: face };
    return { move: 'jab', facing: face };
  }
  if (input.up) return { move: 'utilt' };
  if (input.down) return { move: fresh(world, f, 'down') ? 'dsmash' : 'dtilt' };
  if (mx !== 0) return { move: fresh(world, f, dirKey(mx)) ? 'fsmash' : 'ftilt', facing: mx > 0 ? 1 : -1 };
  return { move: 'jab' };
}

/** Which aerial an attack press means. Aimed forward with no movement held is the neutral aerial. */
function airAttack(f: Fighter, input: Input, press: Pressed): MoveId {
  const aim = aimOf(input, press);
  const mx = stickX(input);
  if (aim) {
    if (aim.y > 0) return 'uair';
    if (aim.y < 0) return 'dair';
    if (aim.x !== f.facing) return 'bair';
    return mx !== 0 ? 'fair' : 'nair';
  }
  if (input.up) return 'uair';
  if (input.down) return 'dair';
  if (mx !== 0 && mx !== f.facing) return 'bair';
  if (mx !== 0) return 'fair';
  return 'nair';
}

/** Throw direction from a press while holding: aim keys or movement keys. */
function throwDir(f: Fighter, press: Pressed): MoveId | null {
  const x = (press.aimRight || press.right ? 1 : 0) - (press.aimLeft || press.left ? 1 : 0);
  if (press.aimUp || press.up) return 'uthrow';
  if (press.aimDown || press.down) return 'dthrow';
  if (x !== 0) return x === f.facing ? 'fthrow' : 'bthrow';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Fighters

function setAction(f: Fighter, action: Action, duration = 0): void {
  f.action = action;
  f.frame = 0;
  f.duration = duration;
  if (action !== 'attack') {
    f.move = null;
    f.moveHits = [];
    f.moveButton = null;
    f.charge = 0;
    f.chargeMult = 1;
  }
}

function startMove(world: World, f: Fighter, move: MoveId, button: 'attack' | 'special' | null): void {
  setAction(f, 'attack');
  f.move = move;
  f.moveHits = [];
  f.moveButton = button;
  f.charge = 0;
  f.chargeMult = 1;
  f.staleCounted = false;
  f.tumbling = false;
  f.hovering = false;
  world.events.push({ type: 'swing', slot: f.slot, move });
}

function refreshAirOptions(f: Fighter): void {
  const def = fighterDef(f);
  f.airJumpsLeft = def.airJumps;
  f.upSpecialsLeft = def.upSpecials;
  f.sideSpecialsLeft = def.sideSpecials;
  f.airDodgeUsed = false;
  f.fastFalling = false;
  f.hoverLeft = def.hoverFrames;
}

/** States you can't act out of; presses made in them are buffered. */
function busy(f: Fighter): boolean {
  return f.action === 'attack' || f.action === 'land' || f.action === 'shieldstun' || f.action === 'roll'
    || f.action === 'spotdodge' || f.action === 'airdodge' || f.action === 'getup' || f.action === 'tech' || f.action === 'jumpsquat';
}

const BUFFER_FRAMES = 6;

function updateFighter(world: World, f: Fighter, input: Input): void {
  if (f.action === 'out') return;
  const press = pressedEdges(input, f.prev);
  for (const k of ['left', 'right', 'up', 'down'] as const) if (press[k]) f.pressFrame[k] = world.frame;
  f.downHeld = input.down ? f.downHeld + 1 : 0;
  if (press.shield) {
    // Teching: one press in the window counts; mashing (pressing again too soon) doesn't.
    if (world.frame - f.lastShieldPress >= TECH.lockout) f.techPress = world.frame;
    f.lastShieldPress = world.frame;
  }

  if (f.action === 'dead') {
    f.frame++;
    if (f.frame >= MATCH.respawnDelayFrames) respawn(world, f);
    return;
  }
  if (f.action === 'held') {
    // Mash anything to break out sooner.
    const holder = world.fighters[f.grabbedBy];
    if (holder && anyPressed(press)) holder.grabTimer -= GRAB.mash;
    if (f.hitlag > 0) f.hitlag--;
    f.frame++;
    return;
  }
  if (f.hitlag > 0) {
    f.hitlag--;
    if (anyPressed(press)) bufferPress(world, f, press);
    return;
  }
  if (f.invincible > 0) f.invincible--;
  if (f.dropThrough > 0) f.dropThrough--;
  if (f.action !== 'shield') f.shieldHp = Math.min(SHIELD.maxHp, f.shieldHp + SHIELD.regen);
  f.hovering = false;

  const def = fighterDef(f);
  const dir = stickX(input);
  f.frame++;

  // Presses made while busy are replayed a few frames later, so inputs never feel eaten.
  if (busy(f)) {
    if (anyPressed(press)) bufferPress(world, f, press);
  }
  const act = f.action === 'idle' || f.action === 'air' ? withBuffer(world, f, press) : press;

  switch (f.action) {
    case 'respawn': {
      f.vx = 0; f.vy = 0; f.lx = 0; f.ly = 0;
      const wantsOff = dir !== 0 || press.up || press.down || press.attack || press.special;
      if (wantsOff || f.frame >= MATCH.respawnWaitFrames) {
        setAction(f, 'air');
        f.invincible = MATCH.respawnInvincibleFrames;
        f.grounded = false;
      } else {
        f.invincible = MATCH.respawnInvincibleFrames;
        return;
      }
      break;
    }
    case 'idle':
      if (groundActions(world, f, input, act, dir)) break;
      walk(f, def, dir);
      break;
    case 'jumpsquat': {
      // Up attacks and up special during jumpsquat replace the jump; other attacks wait for the air.
      if (press.attack) {
        const g = groundAttack(world, f, input, press);
        if (g.move === 'utilt' || g.move === 'usmash') { startMove(world, f, g.move, 'attack'); break; }
      }
      if (press.special && specialDir(f, input, press).up) { startUpSpecial(world, f); break; }
      if (press.grab) { startMove(world, f, 'grab', null); break; }
      if (f.frame >= MOVEMENT.jumpsquatFrames) {
        f.vy = def.jumpSpeed * (input.up ? 1 : MOVEMENT.shortHop);
        f.grounded = false;
        setAction(f, 'air');
        world.events.push({ type: 'jump', slot: f.slot, air: false });
        // A rising aerial pressed during jumpsquat comes out right away.
        const buffered = withBuffer(world, f, press);
        if (buffered.attack) startMove(world, f, airAttack(f, input, buffered), 'attack');
        else if (buffered.special) startSpecial(world, f, input, buffered);
      }
      break;
    }
    case 'land':
      friction(f);
      if (f.frame >= f.duration) setAction(f, 'idle');
      break;
    case 'air':
      if (airActions(world, f, input, act, dir)) break;
      airDrift(f, def, dir, 1);
      break;
    case 'helpless':
      airDrift(f, def, dir, MOVEMENT.helplessAirControl);
      break;
    case 'attack':
      runMove(world, f, input, press, dir);
      break;
    case 'hitstun':
      if (f.frame >= f.duration) setAction(f, f.grounded ? 'idle' : 'air');
      else if (!f.grounded) airDrift(f, def, dir, 0.25);
      break;
    case 'shield':
      friction(f);
      f.shieldHp -= SHIELD.drain;
      if (f.shieldHp <= 0) { breakShield(world, f); break; }
      if (!input.shield) { setAction(f, 'land', SHIELD_DROP_FRAMES); break; }
      if (press.left || press.right) { startRoll(f, press.right ? 1 : -1); break; }
      if (press.down) { setAction(f, 'spotdodge', DODGE.spotFrames); break; }
      // Out of shield: jump, grab, up special, up smash.
      if (press.grab) { startMove(world, f, 'grab', null); break; }
      if (press.special && specialDir(f, input, press).up) { startUpSpecial(world, f); break; }
      if (press.attack && press.aimUp) { startMove(world, f, 'usmash', 'attack'); break; }
      if (press.up) { setAction(f, 'jumpsquat'); break; }
      break;
    case 'shieldstun':
      friction(f);
      if (f.frame >= f.duration) setAction(f, input.shield ? 'shield' : 'idle');
      break;
    case 'shieldbreak':
      friction(f);
      if (f.frame >= f.duration) { setAction(f, f.grounded ? 'idle' : 'air'); f.shieldHp = SHIELD.maxHp * 0.4; }
      break;
    case 'roll':
      if (f.frame >= DODGE.rollInvincible[0] && f.frame <= DODGE.rollInvincible[1]) f.invincible = Math.max(f.invincible, 1);
      if (f.frame >= f.duration) { f.vx = 0; setAction(f, 'idle'); }
      break;
    case 'spotdodge':
      friction(f);
      if (f.frame >= DODGE.spotInvincible[0] && f.frame <= DODGE.spotInvincible[1]) f.invincible = Math.max(f.invincible, 1);
      if (f.frame >= f.duration) setAction(f, 'idle');
      break;
    case 'airdodge':
      if (f.dodgeDash) {
        if (f.frame === AIRDODGE.dashFrames + 1) { f.vx *= 0.3; f.vy *= 0.3; }
        if (f.frame > AIRDODGE.dashFrames) airDrift(f, def, dir, 0.4);
      } else {
        airDrift(f, def, dir, 0.5);
      }
      if (f.frame >= DODGE.airInvincible[0] && f.frame <= DODGE.airInvincible[1]) f.invincible = Math.max(f.invincible, 1);
      if (f.frame >= f.duration) setAction(f, 'air');
      break;
    case 'holding': {
      friction(f);
      f.grabTimer--;
      if (f.grabTimer <= 0) { breakGrab(world, f); break; }
      const t = throwDir(f, press);
      if (t) { startMove(world, f, t, null); break; }
      if (press.grab || (press.attack && !aimOf(input, press))) { startMove(world, f, 'pummel', null); break; }
      break;
    }
    case 'down':
      friction(f);
      if (f.frame >= KNOCKDOWN.minFrames) {
        if (press.attack) { startMove(world, f, 'getupattack', null); break; }
        if (press.left || press.right || press.aimLeft || press.aimRight) {
          const d = press.right || press.aimRight ? 1 : -1;
          setAction(f, 'getup', KNOCKDOWN.rollFrames);
          f.vx = d * (KNOCKDOWN.rollDistance / (KNOCKDOWN.rollFrames * DT));
          break;
        }
        if (press.up || press.shield || press.special || press.grab) { setAction(f, 'getup', KNOCKDOWN.getupFrames); break; }
      }
      if (f.frame >= KNOCKDOWN.maxFrames) setAction(f, 'getup', KNOCKDOWN.getupFrames);
      break;
    case 'getup':
      if (f.frame <= KNOCKDOWN.getupInvincible) f.invincible = Math.max(f.invincible, 1);
      if (f.vx === 0) friction(f);
      if (f.frame >= f.duration) { f.vx = 0; setAction(f, 'idle'); }
      break;
    case 'tech':
      if (f.frame <= TECH.invincibleFrames) f.invincible = Math.max(f.invincible, 1);
      if (f.frame >= f.duration) { f.vx = 0; setAction(f, 'idle'); }
      break;
    default:
      break;
  }

  if (f.grabbing >= 0 && f.action !== 'holding' && f.action !== 'attack') {
    // Lost the grab some other way (knocked out of it): let go.
    breakGrab(world, f);
  }

  integrate(world, f, input);
  ledgeSnap(world, f, dir);
  checkBlastZone(world, f);
}

function bufferPress(world: World, f: Fighter, press: Pressed): void {
  if (!f.buffer || world.frame - f.bufferFrame > BUFFER_FRAMES) f.buffer = { ...press };
  else for (const k of INPUT_KEYS) f.buffer[k] = f.buffer[k] || press[k];
  f.bufferFrame = world.frame;
}

/** This frame's presses plus any recent buffered ones (then the buffer is used up). */
function withBuffer(world: World, f: Fighter, press: Pressed): Pressed {
  if (!f.buffer) return press;
  const b = f.buffer;
  f.buffer = null;
  if (world.frame - f.bufferFrame > BUFFER_FRAMES) return press;
  const out = { ...press };
  for (const k of INPUT_KEYS) out[k] = out[k] || b[k];
  return out;
}

function startRoll(f: Fighter, d: 1 | -1): void {
  setAction(f, 'roll', DODGE.rollFrames);
  f.facing = d > 0 ? -1 : 1; // Face back toward where you rolled from.
  f.vx = d * (DODGE.rollDistance / (DODGE.rollFrames * DT));
}

/**
 * Recovering near a corner of the stage pulls you up onto it, so you never get stuck under the lip.
 * Happens when holding toward the stage, or during a recovery special or the helpless fall after it.
 */
function ledgeSnap(world: World, f: Fighter, dir: number): void {
  if (f.grounded || f.grabbing >= 0) return;
  const recovering = f.action === 'helpless' || (f.action === 'attack' && !!f.move && !!moveOf(f).recovery);
  if (!recovering && f.action !== 'air' && f.action !== 'airdodge') return;
  const halfW = fighterDef(f).halfW;
  for (const p of world.stage.platforms) {
    if (!p.solid || f.y >= p.y || f.y < p.y - (recovering ? LEDGE.reachBelowRecovering : LEDGE.reachBelow)) continue;
    for (const side of [-1, 1] as const) {
      const edgeX = side < 0 ? p.x1 : p.x2;
      const out = side * (f.x - edgeX);
      if (out < -halfW * 0.6 || out > halfW + LEDGE.reachOut) continue;
      if (!recovering && dir !== -side) continue;
      f.x = edgeX - side * halfW * 0.6;
      f.y = p.y;
      f.vx = f.vy = f.lx = f.ly = 0;
      f.grounded = true;
      f.facing = side < 0 ? 1 : -1;
      f.tumbling = false;
      refreshAirOptions(f);
      setAction(f, 'land', LEDGE.climbFrames);
      f.invincible = Math.max(f.invincible, LEDGE.invincibleFrames);
      world.events.push({ type: 'land', slot: f.slot, hard: false });
      return;
    }
  }
}

/** Grounded options from idle. Returns true when an action started. */
function groundActions(world: World, f: Fighter, input: Input, press: Pressed, dir: number): boolean {
  if (press.attack) {
    const g = groundAttack(world, f, input, press);
    if (g.facing) f.facing = g.facing;
    startMove(world, f, g.move, 'attack');
    return true;
  }
  if (press.special) {
    startSpecial(world, f, input, press);
    return true;
  }
  if (press.grab) {
    startMove(world, f, 'grab', null);
    return true;
  }
  // The dodge key: with a direction it rolls or spot dodges straight away; alone it shields.
  if (press.shield && dir !== 0) { startRoll(f, dir > 0 ? 1 : -1); return true; }
  if (press.shield && input.down) { setAction(f, 'spotdodge', DODGE.spotFrames); return true; }
  if (input.shield) {
    setAction(f, 'shield');
    return true;
  }
  if (press.up) {
    setAction(f, 'jumpsquat');
    return true;
  }
  if (input.down && f.downHeld === DROP_HOLD_FRAMES && onSoftPlatform(world, f)) {
    f.grounded = false;
    f.dropThrough = MOVEMENT.dropThroughFrames;
    f.y -= 1;
    setAction(f, 'air');
    return true;
  }
  return false;
}

/** Air options. Returns true when an action started. */
function airActions(world: World, f: Fighter, input: Input, press: Pressed, dir: number): boolean {
  const def = fighterDef(f);
  if (press.attack) {
    startMove(world, f, airAttack(f, input, press), 'attack');
    return true;
  }
  if (press.special) {
    startSpecial(world, f, input, press);
    return f.action === 'attack';
  }
  if (press.shield && !f.airDodgeUsed) {
    f.airDodgeUsed = true;
    f.tumbling = false;
    setAction(f, 'airdodge', DODGE.airFrames);
    const dy = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    f.dodgeDash = dir !== 0 || dy !== 0;
    if (f.dodgeDash) {
      const len = Math.hypot(dir, dy);
      f.vx = (dir / len) * AIRDODGE.speed;
      f.vy = (dy / len) * AIRDODGE.speed;
      f.fastFalling = false;
    }
    return true;
  }
  if (press.up && f.airJumpsLeft > 0) {
    f.airJumpsLeft--;
    f.airJumpFrame = world.frame;
    f.vy = def.airJumpSpeed;
    f.fastFalling = false;
    f.tumbling = false;
    if (dir !== 0) f.vx = dir * def.airSpeed;
    world.events.push({ type: 'jump', slot: f.slot, air: true });
    return false; // Still drifts this frame.
  }
  // Hold jump to hover (the Flipper).
  if (input.up && !press.up && f.hoverLeft > 0 && f.vy <= 0) {
    f.hoverLeft--;
    f.hovering = true;
    f.vy = Math.max(f.vy, -40);
    f.fastFalling = false;
  }
  if (press.down && f.vy <= 120 && !f.fastFalling) {
    f.fastFalling = true;
    f.vy = -def.fastFall;
  }
  return false;
}

function projectileLimitReached(world: World, f: Fighter, m: MoveDef | undefined): boolean {
  const p = m?.projectile?.def;
  if (!p?.limit) return false;
  return world.projectiles.filter((q) => q.owner === f.slot && q.kind === p.kind).length >= p.limit;
}

/**
 * Which way a special goes. Aimed (arrow keys): up, down, or sideways; the forward arrow with no
 * movement key held is the neutral special. Not aimed: from the movement keys.
 */
function specialDir(f: Fighter, input: Input, press: Pressed): { up: boolean; down: boolean; x: number } {
  const aim = aimOf(input, press);
  if (!aim) return { up: input.up, down: input.down, x: stickX(input) };
  if (aim.y !== 0) return { up: aim.y > 0, down: aim.y < 0, x: 0 };
  return { up: false, down: false, x: aim.x === f.facing && stickX(input) === 0 ? 0 : aim.x };
}

function startSpecial(world: World, f: Fighter, input: Input, press: Pressed): void {
  const moves = fighterDef(f).moves;
  const { up, down, x: dir } = specialDir(f, input, press);
  const pick = (id: 'nspecial' | 'sspecial' | 'dspecial'): MoveId => {
    const air = `${id}Air` as const;
    return !f.grounded && moves[air] ? air : id;
  };
  if (up) { startUpSpecial(world, f); return; }
  if (down) {
    const id = pick('dspecial');
    if (projectileLimitReached(world, f, moves[id])) return;
    startMove(world, f, id, 'special');
    return;
  }
  if (dir !== 0) {
    if (!f.grounded && f.sideSpecialsLeft <= 0) return;
    f.facing = dir > 0 ? 1 : -1;
    if (!f.grounded) f.sideSpecialsLeft--;
    startMove(world, f, pick('sspecial'), 'special');
    return;
  }
  const id = pick('nspecial');
  if (projectileLimitReached(world, f, moves[id])) return;
  startMove(world, f, id, 'special');
}

function startUpSpecial(world: World, f: Fighter): void {
  if (f.upSpecialsLeft <= 0) return;
  // Pressed jump a moment before special: give that jump back.
  if (!f.grounded && world.frame - f.airJumpFrame <= UP_SPECIAL_JUMP_REFUND) {
    f.airJumpsLeft++;
    f.airJumpFrame = -9999;
  }
  f.upSpecialsLeft--;
  startMove(world, f, 'uspecial', 'special');
}

function buttonHeld(f: Fighter, input: Input): boolean {
  if (f.moveButton === 'attack') return input.attack;
  if (f.moveButton === 'special') return input.special;
  return false;
}

function runMove(world: World, f: Fighter, input: Input, press: Pressed, dir: number): void {
  const def = fighterDef(f);
  const m = moveOf(f);
  const held = buttonHeld(f, input);

  // Charging: hold the button and the move waits here, building power.
  if (m.charge && f.frame === m.charge.frame + 1 && held && f.charge < m.charge.max) {
    f.frame = m.charge.frame;
    f.charge++;
    f.chargeMult = 1 + (m.charge.dmg * f.charge) / m.charge.max;
    if (f.grounded) friction(f);
    else airDrift(f, def, dir, MOVEMENT.attackAirControl);
    return;
  }
  // Repeating while held.
  if (m.loop && f.frame === m.loop.to + 1 && held) {
    f.frame = m.loop.from;
    f.moveHits = [];
  }
  if (m.rehit && f.frame % m.rehit === 0) f.moveHits = [];
  // Jab combos: press again (a press during hitlag counts too).
  if (m.next && f.frame >= m.next.from && def.moves[m.next.move]) {
    const p = withBuffer(world, f, press);
    if (p.attack && groundAttack(world, f, input, p).move === 'jab') { startMove(world, f, m.next.move, 'attack'); return; }
  }
  if (inRange(f.frame, m.invincible)) f.invincible = Math.max(f.invincible, 1);

  const fr = f.frame;
  if (m.lunge && fr === m.lunge.frame) {
    f.vx = f.facing * m.lunge.vx;
    if (!f.grounded) f.vy = Math.max(f.vy, m.lunge.vy);
  }
  if (m.boost && fr === m.boost.frame) {
    if (dir !== 0) f.facing = dir > 0 ? 1 : -1;
    const steer = (dir * m.boost.steer * Math.PI) / 180;
    f.vx = Math.sin(steer) * m.boost.speed;
    f.vy = Math.cos(steer) * m.boost.speed;
    f.grounded = false;
    f.fastFalling = false;
    world.events.push({ type: 'jump', slot: f.slot, air: true });
  }
  if (m.slam && fr === m.slam.frame) {
    if (f.grounded) { finishSlam(world, f, m); return; }
    f.vy = -m.slam.speed;
    f.vx *= 0.3;
  }
  if (m.projectile && fr === m.projectile.frame) spawnProjectile(world, f, m.projectile.def, m.charge ? f.charge / m.charge.max : 0);
  if (m.throwHit && fr === m.throwHit.frame) throwHit(world, f, m.throwHit);

  const slamming = !!m.slam && m.slam.speed > 0 && fr >= m.slam.frame;
  if (f.grounded) {
    if (!m.lunge || fr > m.lunge.frame + 8) friction(f);
  } else if (!slamming) {
    airDrift(f, def, dir, m.boost ? 0.9 : MOVEMENT.attackAirControl);
    if (!m.boost && m.landLag !== undefined && press.down && f.vy <= 120 && !f.fastFalling) {
      f.fastFalling = true;
      f.vy = -def.fastFall;
    }
  }

  if (slamming) {
    if (fr >= m.frames) setAction(f, 'air');
    return;
  }
  if (fr >= m.frames) endMove(f, m);
}

function endMove(f: Fighter, m: MoveDef): void {
  if (m.turn) f.facing = f.facing > 0 ? -1 : 1;
  if (f.grabbing >= 0) { setAction(f, 'holding'); return; }
  if (f.grounded) setAction(f, 'idle');
  else setAction(f, m.helpless ? 'helpless' : 'air');
}

function finishSlam(world: World, f: Fighter, m: MoveDef): void {
  if (m.slam?.landMove) startMove(world, f, m.slam.landMove, null);
  else setAction(f, 'land', m.landLag ?? 10);
  world.events.push({ type: 'land', slot: f.slot, hard: true });
}

function spawnProjectile(world: World, f: Fighter, p: ProjectileDef, charge: number): void {
  const a = (p.angle * Math.PI) / 180;
  const c = p.charged;
  const r = p.r * (c ? 1 + (c.r - 1) * charge : 1);
  const hit: HitStats = c
    ? { ...p.hit, dmg: p.hit.dmg * (1 + (c.dmg - 1) * charge), bkb: p.hit.bkb * (1 + (c.kb - 1) * charge), kbg: p.hit.kbg * (1 + (c.kb - 1) * charge * 0.5) }
    : p.hit;
  world.projectiles.push({
    id: world.nextProjectileId++,
    owner: f.slot,
    kind: p.kind,
    x: f.x + f.facing * (fighterDef(f).halfW + r),
    y: centerY(f),
    vx: f.facing * Math.cos(a) * p.speed + (p.kind === 'bomb' || p.kind === 'mine' ? f.vx * 0.5 : 0),
    vy: Math.sin(a) * p.speed,
    r,
    life: p.lifeFrames,
    age: 0,
    gravity: p.gravity,
    hit,
    blastR: p.blastR ?? 0,
    stuck: false,
    move: f.move!,
  });
  world.events.push({ type: 'shot', slot: f.slot, kind: p.kind });
}

function walk(f: Fighter, def: FighterDef, dir: number): void {
  if (dir === 0) { friction(f); return; }
  f.facing = dir > 0 ? 1 : -1;
  const target = dir * def.walkSpeed;
  f.vx = approach(f.vx, target, MOVEMENT.groundAccel * DT);
}

function friction(f: Fighter): void {
  if (f.grounded) f.vx = approach(f.vx, 0, MOVEMENT.friction * DT);
}

function airDrift(f: Fighter, def: FighterDef, dir: number, control: number): void {
  const target = dir * def.airSpeed;
  if (dir === 0) f.vx = approach(f.vx, 0, def.airAccel * 0.35 * control * DT);
  else f.vx = approach(f.vx, target, def.airAccel * control * DT);
}

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}

function onSoftPlatform(world: World, f: Fighter): boolean {
  const p = standingOn(world, f);
  return !!p && !p.solid;
}

function standingOn(world: World, f: Fighter): Platform | null {
  const halfW = fighterDef(f).halfW * 0.5;
  for (const p of world.stage.platforms) {
    if (Math.abs(f.y - p.y) < 0.5 && f.x + halfW > p.x1 && f.x - halfW < p.x2) return p;
  }
  return null;
}

/** Actions that fall off an edge into 'air' when the ground disappears. */
const WALK_OFF: ReadonlySet<Action> = new Set<Action>(['idle', 'land', 'shield', 'roll', 'spotdodge', 'down', 'getup', 'tech', 'holding']);

/** Gravity, movement and stage collision. */
function integrate(world: World, f: Fighter, input: Input): void {
  const def = fighterDef(f);
  const m = f.action === 'attack' && f.move ? moveOf(f) : null;

  if (!f.grounded) {
    const slamming = !!m?.slam && m.slam.speed > 0 && f.frame >= m.slam.frame;
    const dashing = f.action === 'airdodge' && f.dodgeDash && f.frame <= AIRDODGE.dashFrames;
    const g = def.gravity * (m?.gravity && inRange(f.frame, m.gravity) ? m.gravity.scale : 1) * (f.hovering ? 0 : 1);
    if (!slamming && !dashing) {
      f.vy -= g * DT;
      const maxFall = f.fastFalling ? def.fastFall : def.maxFall;
      if (f.vy < -maxFall && f.action !== 'hitstun') f.vy = -maxFall;
    }
  }

  // Knockback bleeds off along its own direction.
  const lSpeed = Math.hypot(f.lx, f.ly);
  if (lSpeed > 0) {
    const next = Math.max(0, lSpeed - KNOCKBACK.launchDecay * DT);
    f.lx *= next / lSpeed;
    f.ly *= next / lSpeed;
  }

  const prevY = f.y;
  const halfW = def.halfW;
  const totalVx = f.vx + f.lx;
  const totalVy = f.vy + f.ly;

  // Horizontal: solid platforms block the sides.
  f.x += totalVx * DT;
  for (const p of world.stage.platforms) {
    if (!p.solid) continue;
    const overlapsY = f.y < p.y - 0.5 && f.y + def.height > p.y - p.depth;
    if (!overlapsY) continue;
    if (f.x + halfW > p.x1 && f.x - halfW < p.x2) {
      if (f.x < (p.x1 + p.x2) / 2) f.x = p.x1 - halfW;
      else f.x = p.x2 + halfW;
      f.vx = 0;
      f.lx = -f.lx * 0.3;
    }
  }

  if (f.grounded) {
    let p = standingOn(world, f);
    // Grounded attacks stop at the edge instead of lunging off it.
    if (!p && f.action === 'attack' && f.lx === 0) {
      f.x -= totalVx * DT;
      f.vx = 0;
      p = standingOn(world, f);
    }
    if (!p) {
      f.grounded = false;
      if (WALK_OFF.has(f.action)) setAction(f, 'air');
      // Walking off the edge uses no jumps.
    } else {
      f.y = p.y;
      f.vy = 0;
      if (f.ly > 0) { f.grounded = false; }
      else { f.ly = 0; return; }
    }
  }

  f.y += totalVy * DT;
  if (totalVy > 0) {
    // Bonk on the underside of solid platforms.
    for (const p of world.stage.platforms) {
      if (!p.solid) continue;
      const bottom = p.y - p.depth;
      if (prevY + def.height <= bottom && f.y + def.height > bottom && f.x + halfW > p.x1 && f.x - halfW < p.x2) {
        f.y = bottom - def.height;
        f.vy = Math.min(f.vy, 0);
        f.ly = -f.ly * 0.4;
      }
    }
    return;
  }

  for (const p of world.stage.platforms) {
    if (!p.solid && (f.dropThrough > 0 || (input.down && f.action !== 'hitstun' && f.action !== 'attack'))) continue;
    const halfFeet = halfW * 0.5;
    if (prevY >= p.y && f.y <= p.y && f.x + halfFeet > p.x1 && f.x - halfFeet < p.x2) {
      land(world, f, p, totalVy, input);
      return;
    }
  }
}

function land(world: World, f: Fighter, p: Platform, vy: number, input: Input): void {
  const launched = f.action === 'hitstun' || (f.action === 'air' && f.tumbling);
  // Tech: shield pressed just before the floor. Roll with a direction held.
  if (launched && f.tumbling && world.frame - f.techPress <= TECH.window) {
    f.y = p.y;
    f.vy = f.ly = 0;
    f.lx = 0;
    f.grounded = true;
    f.tumbling = false;
    f.techPress = -9999;
    refreshAirOptions(f);
    const d = stickX(input);
    if (d !== 0) {
      setAction(f, 'tech', TECH.rollFrames);
      f.vx = d * (TECH.rollDistance / (TECH.rollFrames * DT));
    } else {
      setAction(f, 'tech', TECH.inPlaceFrames);
      f.vx = 0;
    }
    world.events.push({ type: 'tech', slot: f.slot });
    return;
  }
  // Spiked hard into the floor: bounce instead of landing.
  if (f.action === 'hitstun' && -vy > KNOCKBACK.groundBounceSpeed) {
    f.y = p.y;
    f.ly = Math.abs(f.ly) * 0.55;
    f.vy = 0;
    world.events.push({ type: 'land', slot: f.slot, hard: true });
    return;
  }
  f.y = p.y;
  f.vy = 0;
  f.ly = 0;
  f.lx *= 0.5;
  f.grounded = true;
  refreshAirOptions(f);
  if (f.action === 'attack' && f.move) {
    const m = moveOf(f);
    if (m.slam && m.slam.speed > 0 && f.frame >= m.slam.frame) { finishSlam(world, f, m); return; }
    if (m.boost || m.landLag !== undefined) {
      setAction(f, 'land', m.landLag ?? MOVEMENT.landFrames);
      world.events.push({ type: 'land', slot: f.slot, hard: false });
      return;
    }
    // Grounded moves that briefly leave the ground (lunges) carry on.
    return;
  }
  if (launched && f.tumbling) {
    // Missed the tech: knocked flat.
    f.tumbling = false;
    f.lx = 0;
    setAction(f, 'down', KNOCKDOWN.maxFrames);
    world.events.push({ type: 'land', slot: f.slot, hard: true });
    return;
  }
  if (f.action === 'hitstun') {
    setAction(f, 'land', 8);
  } else if (f.action === 'airdodge') {
    setAction(f, 'land', f.dodgeDash ? AIRDODGE.landLag : 8);
  } else if (f.action === 'helpless') {
    setAction(f, 'land', 12);
  } else if (f.action === 'air' || f.action === 'respawn') {
    setAction(f, 'land', MOVEMENT.landFrames);
  }
  world.events.push({ type: 'land', slot: f.slot, hard: vy < -900 });
}

function breakShield(world: World, f: Fighter): void {
  f.shieldHp = 0;
  setAction(f, 'shieldbreak', SHIELD.breakStunFrames);
  f.vy = 500;
  f.grounded = false;
  world.events.push({ type: 'shieldbreak', target: f.slot });
}

function checkBlastZone(world: World, f: Fighter): void {
  const b = world.stage.blast;
  const cy = centerY(f);
  if (f.x > b.left && f.x < b.right && cy > b.bottom && cy < b.top) return;
  if (f.grabbing >= 0) breakGrab(world, f);
  const by = f.lastHitBy >= 0 && world.frame - f.lastHitFrame < 60 * 8 ? f.lastHitBy : -1;
  world.events.push({ type: 'ko', slot: f.slot, x: Math.max(b.left, Math.min(b.right, f.x)), y: Math.max(b.bottom, Math.min(b.top, cy)), by });
  f.stats.falls++;
  if (by >= 0) world.fighters[by]!.stats.kos++;
  else f.stats.selfDestructs++;
  f.stocks--;
  f.vx = f.vy = f.lx = f.ly = 0;
  f.hitlag = 0;
  f.tumbling = false;
  setAction(f, f.stocks > 0 ? 'dead' : 'out');
}

function respawn(world: World, f: Fighter): void {
  const main = world.stage.platforms[0]!;
  const living = world.fighters.filter((o) => o !== f && isAlive(o));
  // Respawn on the side away from the nearest opponent, above the stage.
  const avgX = living.length ? living.reduce((s, o) => s + o.x, 0) / living.length : 0;
  const x = Math.max(main.x1 + 60, Math.min(main.x2 - 60, avgX > 0 ? -120 : 120));
  f.x = x;
  f.y = main.y + MATCH.respawnHeight;
  f.vx = f.vy = f.lx = f.ly = 0;
  f.percent = 0;
  f.grounded = false;
  f.shieldHp = SHIELD.maxHp;
  f.lastHitBy = -1;
  f.stale = [];
  f.grabbing = -1;
  f.grabbedBy = -1;
  f.facing = x < 0 ? 1 : -1;
  refreshAirOptions(f);
  setAction(f, 'respawn');
  f.invincible = MATCH.respawnInvincibleFrames;
  world.events.push({ type: 'respawn', slot: f.slot });
}

// ---------------------------------------------------------------------------------------------
// Grabs

function startHold(world: World, a: Fighter, v: Fighter, grabMove: MoveId | undefined): void {
  if (v.grabbing >= 0) breakGrab(world, v);
  a.grabbing = v.slot;
  v.grabbedBy = a.slot;
  a.grabTimer = GRAB.holdBase + v.percent * GRAB.holdPerPercent;
  a.vx = 0;
  setAction(v, 'held');
  v.vx = v.vy = v.lx = v.ly = 0;
  v.fastFalling = false;
  v.tumbling = false;
  v.lastHitBy = a.slot;
  v.lastHitFrame = world.frame;
  if (grabMove) startMove(world, a, grabMove, null);
  else setAction(a, 'holding');
  world.events.push({ type: 'grab', slot: a.slot, target: v.slot });
}

/** Let go: both stagger apart. */
function breakGrab(world: World, holder: Fighter): void {
  const v = world.fighters[holder.grabbing];
  holder.grabbing = -1;
  if (!v || v.grabbedBy !== holder.slot) return;
  v.grabbedBy = -1;
  v.vx = holder.facing * 320;
  setAction(v, v.grounded ? 'land' : 'air', GRAB.releaseFrames);
  if (holder.action === 'holding') {
    holder.vx = -holder.facing * 200;
    setAction(holder, holder.grounded ? 'land' : 'air', GRAB.releaseFrames);
  }
}

/** Held drones stay in front of whoever holds them. */
function pinHeld(world: World): void {
  for (const a of world.fighters) {
    if (a.grabbing < 0) continue;
    const v = world.fighters[a.grabbing]!;
    if (v.grabbedBy !== a.slot) { a.grabbing = -1; continue; }
    v.x = a.x + a.facing * (fighterDef(a).halfW + fighterDef(v).halfW) * GRAB.holdOverlap;
    v.y = a.y;
    v.grounded = a.grounded;
    v.vx = v.vy = v.lx = v.ly = 0;
    v.facing = a.facing > 0 ? -1 : 1;
  }
}

function throwHit(world: World, f: Fighter, t: NonNullable<MoveDef['throwHit']>): void {
  const v = f.grabbing >= 0 ? world.fighters[f.grabbing] : undefined;
  if (!v || v.grabbedBy !== f.slot) return;
  if (!t.release) {
    // Pummel.
    v.percent = Math.min(999, v.percent + t.hit.dmg);
    f.stats.damageDealt += t.hit.dmg;
    f.hitlag = v.hitlag = 3;
    world.events.push({ type: 'hit', x: (f.x + v.x) / 2, y: centerY(v), dmg: t.hit.dmg, kb: 0, attacker: f.slot, target: v.slot });
    return;
  }
  f.grabbing = -1;
  v.grabbedBy = -1;
  if (t.behind) v.x = f.x - f.facing * (fighterDef(f).halfW + fighterDef(v).halfW) * GRAB.holdOverlap;
  setAction(v, v.grounded ? 'idle' : 'air');
  world.events.push({ type: 'throw', slot: f.slot, target: v.slot });
  strike(world, f, v, t.hit, f.facing, v.x, centerY(v), { melee: true, isThrow: true, move: f.move ?? undefined });
}

// ---------------------------------------------------------------------------------------------
// Projectiles

function hittable(f: Fighter): boolean {
  return isAlive(f) && f.action !== 'respawn' && f.invincible <= 0;
}

function updateProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    const owner = world.fighters[p.owner]!;
    if (owner.hitlag > 0 && p.kind === 'shot') { keep.push(p); continue; }
    p.age++;
    p.life--;
    let gone = p.life <= 0;
    if (!p.stuck) {
      p.vy -= p.gravity * DT;
      const prevY = p.y;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      // Stage contact.
      if (p.kind !== 'gust') {
        for (const pl of world.stage.platforms) {
          if (p.x <= pl.x1 || p.x >= pl.x2) continue;
          if (p.kind === 'mine') {
            // Mines settle on whatever floor they fall onto.
            if (p.vy <= 0 && prevY - p.r >= pl.y - 1 && p.y - p.r <= pl.y) {
              p.y = pl.y + p.r;
              p.vx = p.vy = 0;
              p.stuck = true;
            } else if (pl.solid && p.y < pl.y && p.y > pl.y - pl.depth) gone = true;
            continue;
          }
          if (p.y - p.r < pl.y && p.y > pl.y - (pl.solid ? pl.depth : 4)) {
            if (pl.solid || p.vy < 0) gone = true;
          }
        }
      }
    }
    // Fighter contact.
    if (!gone) {
      for (const f of world.fighters) {
        if (f.slot === p.owner || !isAlive(f) || f.action === 'respawn' || f.grabbedBy >= 0) continue;
        const dx = f.x - p.x;
        const dy = centerY(f) - p.y;
        const reach = fighterDef(f).hurtR + (p.kind === 'mine' ? p.blastR * 0.7 : p.r);
        if (dx * dx + dy * dy > reach * reach) continue;
        if (p.kind === 'gust') {
          // Wind: pushes, no damage, no hitstun. Gets KO credit if it blows you away.
          if (f.invincible > 0) continue;
          const d = p.vx >= 0 ? 1 : -1;
          const wind = p.hit.wind ?? 0;
          if (f.action === 'shield') { f.x += d * wind * DT * 0.25; continue; }
          f.lx = approach(f.lx, d * wind, wind * 0.3);
          f.lastHitBy = p.owner;
          f.lastHitFrame = world.frame;
          continue;
        }
        if (p.kind === 'mine') {
          if (p.age < 30) continue; // Arming.
          gone = true;
          break;
        }
        if (p.kind === 'shot') {
          if (f.invincible <= 0) strike(world, owner, f, p.hit, p.vx >= 0 ? 1 : -1, p.x, p.y, { melee: false, move: p.move });
        }
        gone = true;
        break;
      }
    }
    if (gone) {
      if (p.kind === 'bomb' || p.kind === 'mine') explode(world, p);
    } else {
      const b = world.stage.blast;
      if (p.x > b.left && p.x < b.right && p.y > b.bottom && p.y < b.top) keep.push(p);
    }
  }
  world.projectiles = keep;
}

function explode(world: World, p: Projectile): void {
  world.events.push({ type: 'explode', x: p.x, y: p.y, r: p.blastR });
  const owner = world.fighters[p.owner]!;
  for (const f of world.fighters) {
    if (f.slot === p.owner || !hittable(f) || f.grabbedBy >= 0) continue;
    const dx = f.x - p.x;
    const dy = centerY(f) - p.y;
    const reach = fighterDef(f).hurtR + p.blastR;
    if (dx * dx + dy * dy > reach * reach) continue;
    strike(world, owner, f, p.hit, dx >= 0 ? 1 : -1, p.x, p.y, { melee: false, move: p.move });
  }
}

// ---------------------------------------------------------------------------------------------
// Hits

/** World position of a fighter's first active hitbox (kept for the renderer and bots). */
export function hitboxWorld(f: Fighter): { x: number; y: number; r: number; hb: Hitbox } | null {
  return activeHitboxes(f)[0] ?? null;
}

function resolveHits(world: World): void {
  // Everyone's hitboxes are taken before any hit lands, so two drones hitting each other both connect (a trade).
  const boxes = world.fighters.map((a) => (a.hitlag > 0 ? [] : activeHitboxes(a)));
  world.fighters.forEach((a, i) => {
    const mine = boxes[i]!;
    if (!mine.length) return;
    for (const t of world.fighters) {
      if (t === a || !hittable(t) || a.moveHits.includes(t.slot) || t.grabbedBy === a.slot) continue;
      for (const box of mine) {
        const dx = t.x - box.x;
        const dy = centerY(t) - box.y;
        const reach = fighterDef(t).hurtR + box.r;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (box.hb.grab) {
          if (a.grabbing >= 0 || a.action !== 'attack') break;
          if (t.action === 'held' || t.action === 'holding' || t.action === 'down' || (!t.grounded && !box.hb.grabAir)) break;
          a.moveHits.push(t.slot);
          startHold(world, a, t, box.hb.grabMove);
          return;
        }
        a.moveHits.push(t.slot);
        const stats: HitStats = box.hb.counter ? { ...box.hb, dmg: a.counterDmg } : box.hb;
        strike(world, a, t, stats, a.facing, (box.x + t.x) / 2, (box.y + centerY(t)) / 2, { melee: true, move: a.move ?? undefined });
        break;
      }
    }
  });
}

function staleMult(f: Fighter, move: MoveId | undefined): number {
  if (!move) return 1;
  const uses = f.stale.filter((m) => m === move).length;
  return Math.max(STALE.min, 1 - uses * STALE.perUse);
}

function pushStale(f: Fighter, move: MoveId): void {
  f.stale.push(move);
  if (f.stale.length > STALE.queue) f.stale.shift();
}

interface StrikeOpts {
  melee: boolean;
  isThrow?: boolean;
  move?: MoveId;
}

function strike(world: World, attacker: Fighter, target: Fighter, hit: HitStats, facing: 1 | -1, x: number, y: number, opts: StrikeOpts): void {
  const tm = target.action === 'attack' && target.move ? moveOf(target) : null;
  const baseLag = Math.min(HITLAG.max, Math.floor(HITLAG.base + hit.dmg * HITLAG.perDamage));

  if (!opts.isThrow) {
    // Counter: strike back instead of getting hit.
    if (tm?.counter && inRange(target.frame, tm.counter)) {
      target.counterDmg = Math.max(6, hit.dmg * tm.counter.mult);
      target.facing = (opts.melee ? attacker.x : x) >= target.x ? 1 : -1;
      startMove(world, target, tm.counter.move, null);
      target.invincible = Math.max(target.invincible, 14);
      if (opts.melee) attacker.hitlag = baseLag + 10;
      world.events.push({ type: 'counter', x, y, slot: target.slot });
      return;
    }
    if (target.action === 'shield' || target.action === 'shieldstun') {
      // Parry: shield on the exact moment. No shield damage, and the attacker is left open.
      if (target.action === 'shield' && target.frame <= PARRY.window) {
        world.events.push({ type: 'parry', x, y, target: target.slot });
        if (opts.melee) attacker.hitlag = baseLag + PARRY.attackerLag;
        target.hitlag = Math.ceil(baseLag * 0.5);
        return;
      }
      target.shieldHp -= hit.dmg * SHIELD.damageScale;
      world.events.push({ type: 'shieldhit', x, y, target: target.slot });
      if (opts.melee) attacker.hitlag = Math.ceil(baseLag * 0.6);
      if (target.shieldHp <= 0) { breakShield(world, target); return; }
      setAction(target, 'shieldstun', SHIELD.stunFrames + Math.floor(hit.dmg / 3));
      target.vx = facing * (120 + hit.dmg * 14);
      return;
    }
  }

  const stale = staleMult(attacker, opts.move);
  if (opts.move && (!opts.melee || !attacker.staleCounted)) {
    pushStale(attacker, opts.move);
    if (opts.melee) attacker.staleCounted = true;
  }
  const dmg = hit.dmg * stale * (opts.melee && !opts.isThrow ? attacker.chargeMult : 1);
  const lag = Math.min(HITLAG.max, Math.floor(HITLAG.base + dmg * HITLAG.perDamage));
  target.percent = Math.min(999, target.percent + dmg);
  attacker.stats.damageDealt += dmg;
  const kb = knockback(target.percent, dmg, fighterDef(target).weight, hit.bkb, hit.kbg);
  target.lastHitBy = attacker.slot;
  target.lastHitFrame = world.frame;

  // Super armor: takes the damage, doesn't flinch.
  if (!opts.isThrow && tm?.armor && inRange(target.frame, tm.armor) && kb < tm.armor.kb) {
    target.hitlag = lag;
    if (opts.melee) attacker.hitlag = lag;
    world.events.push({ type: 'hit', x, y, dmg, kb: kb * 0.3, attacker: attacker.slot, target: target.slot, armored: true });
    return;
  }

  // Hit out of a grab, either side of it.
  if (target.grabbing >= 0) breakGrab(world, target);
  if (target.grabbedBy >= 0) {
    const holder = world.fighters[target.grabbedBy];
    target.grabbedBy = -1;
    if (holder) { holder.grabbing = -1; if (holder.action === 'holding') setAction(holder, 'idle'); }
  }

  // Angle, mirrored for facing, then bent by directional influence.
  let angle = hit.angle;
  if (facing < 0) angle = 180 - angle;
  const input = target.prev;
  const diX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const diY = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  if (diX !== 0 || diY !== 0) {
    const rad = (angle * Math.PI) / 180;
    // Perpendicular component of the held direction bends the launch.
    const perp = -Math.sin(rad) * diX + Math.cos(rad) * diY;
    angle += perp * KNOCKBACK.diDegrees;
  }
  const rad = (angle * Math.PI) / 180;
  const speed = kb * KNOCKBACK.launchScale;
  target.lx = Math.cos(rad) * speed;
  target.ly = Math.sin(rad) * speed;
  target.vx = 0;
  target.vy = 0;
  if (target.ly > 0) target.grounded = false;
  target.fastFalling = false;
  target.lastKb = kb;
  target.tumbling = kb >= KNOCKBACK.tumbleKb;
  setAction(target, 'hitstun', Math.max(8, Math.floor(kb * KNOCKBACK.hitstunPerKb)));
  // Getting hit gives your recovery back (except the air dodge).
  const def = fighterDef(target);
  target.upSpecialsLeft = def.upSpecials;
  target.sideSpecialsLeft = def.sideSpecials;
  target.airJumpsLeft = Math.max(target.airJumpsLeft, Math.min(1, def.airJumps));

  target.hitlag = lag;
  if (opts.melee) attacker.hitlag = lag;
  world.events.push({ type: 'hit', x, y, dmg, kb, attacker: attacker.slot, target: target.slot });
  // A little randomness in the spark only; the hit itself is deterministic.
  nextRandom(world.rng);
}

function checkGameOver(world: World): void {
  if (world.over) return;
  const left = world.fighters.filter((f) => f.stocks > 0);
  if (world.fighters.length > 1 && left.length <= 1) {
    world.over = true;
    world.winner = left[0]?.slot ?? -1;
    world.events.push({ type: 'gameover', winner: world.winner });
  }
}
