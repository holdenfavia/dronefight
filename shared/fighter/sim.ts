// The side-view fighter simulation (ADR-0070): a fixed 60 Hz step from inputs to state.
// Pure data in, pure data out, no rendering, so the server can run it too when online play arrives.

import { DODGE, DT, HITLAG, KNOCKBACK, LEDGE, MATCH, MOVEMENT, SHIELD } from './config.js';
import { FIGHTERS, type FighterDef, type FighterId, type Hitbox, type MoveDef, type MoveId } from './fighters.js';
import { nextRandom } from './rng.js';
import { STAGES, type Platform, type StageDef, type StageId } from './stages.js';

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean;
  special: boolean;
  shield: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, attack: false, special: false, shield: false };

export type Action =
  | 'idle' | 'jumpsquat' | 'air' | 'land' | 'attack' | 'hitstun' | 'helpless'
  | 'shield' | 'shieldstun' | 'shieldbreak' | 'roll' | 'spotdodge' | 'airdodge'
  | 'dead' | 'respawn' | 'out';

export interface FighterStats {
  kos: number;
  falls: number;
  selfDestructs: number;
  damageDealt: number;
}

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
  percent: number;
  stocks: number;
  airJumpsLeft: number;
  upSpecialsLeft: number;
  sideSpecialUsed: boolean;
  airDodgeUsed: boolean;
  fastFalling: boolean;
  dropThrough: number;
  hitlag: number;
  invincible: number;
  shieldHp: number;
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
  kind: 'shot' | 'bomb';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  gravity: number;
  hit: Omit<Hitbox, 'x' | 'y'>;
  blastR: number;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; dmg: number; kb: number; attacker: number; target: number }
  | { type: 'shieldhit'; x: number; y: number; target: number }
  | { type: 'shieldbreak'; target: number }
  | { type: 'ko'; slot: number; x: number; y: number; by: number }
  | { type: 'jump'; slot: number; air: boolean }
  | { type: 'land'; slot: number; hard: boolean }
  | { type: 'swing'; slot: number; move: MoveId }
  | { type: 'shot'; slot: number; kind: 'shot' | 'bomb' }
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
      percent: 0,
      stocks,
      airJumpsLeft: def.airJumps,
      upSpecialsLeft: def.upSpecials,
      sideSpecialUsed: false,
      airDodgeUsed: false,
      fastFalling: false,
      dropThrough: 0,
      hitlag: 0,
      invincible: 0,
      shieldHp: SHIELD.maxHp,
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

/** Centre of the hurtbox. */
export function centerY(f: Fighter): number {
  return f.y + fighterDef(f).height / 2;
}

export function isAlive(f: Fighter): boolean {
  return f.action !== 'dead' && f.action !== 'out';
}

/** Is the move in its active (hitting) frames? */
export function moveActive(f: Fighter): boolean {
  if (f.action !== 'attack' || !f.move) return false;
  const m = fighterDef(f).moves[f.move];
  if (m.slam) return f.frame > m.startup && !f.grounded;
  return f.frame > m.startup && f.frame <= m.startup + m.active;
}

/** Knockback (Smash-style: grows with the target's damage, shrinks with weight). */
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
  updateProjectiles(world);
  resolveHits(world);
  checkGameOver(world);
}

// ---------------------------------------------------------------------------------------------
// Fighters

interface Pressed {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  special: boolean;
  shield: boolean;
}

function pressedEdges(input: Input, prev: Input): Pressed {
  return {
    up: input.up && !prev.up,
    down: input.down && !prev.down,
    left: input.left && !prev.left,
    right: input.right && !prev.right,
    attack: input.attack && !prev.attack,
    special: input.special && !prev.special,
    shield: input.shield && !prev.shield,
  };
}

function stickX(input: Input): number {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

function setAction(f: Fighter, action: Action, duration = 0): void {
  f.action = action;
  f.frame = 0;
  f.duration = duration;
  if (action !== 'attack') {
    f.move = null;
    f.moveHits = [];
  }
}

function startMove(world: World, f: Fighter, move: MoveId): void {
  setAction(f, 'attack');
  f.move = move;
  f.moveHits = [];
  world.events.push({ type: 'swing', slot: f.slot, move });
}

function refreshAirOptions(f: Fighter): void {
  const def = fighterDef(f);
  f.airJumpsLeft = def.airJumps;
  f.upSpecialsLeft = def.upSpecials;
  f.sideSpecialUsed = false;
  f.airDodgeUsed = false;
  f.fastFalling = false;
}

function updateFighter(world: World, f: Fighter, input: Input): void {
  if (f.action === 'out') return;
  if (f.action === 'dead') {
    f.frame++;
    if (f.frame >= MATCH.respawnDelayFrames) respawn(world, f);
    return;
  }
  if (f.hitlag > 0) {
    f.hitlag--;
    return;
  }
  if (f.invincible > 0) f.invincible--;
  if (f.dropThrough > 0) f.dropThrough--;
  if (f.action !== 'shield') f.shieldHp = Math.min(SHIELD.maxHp, f.shieldHp + SHIELD.regen);

  const def = fighterDef(f);
  const press = pressedEdges(input, f.prev);
  const dir = stickX(input);
  f.frame++;

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
      if (groundActions(world, f, input, press, dir)) break;
      walk(f, def, dir);
      break;
    case 'jumpsquat':
      // Up + attack or special during jumpsquat: do the grounded up move instead of jumping.
      if (press.attack && input.up) { startMove(world, f, 'utilt'); break; }
      if (press.special && input.up) { startUpSpecial(world, f); break; }
      if (f.frame >= MOVEMENT.jumpsquatFrames) {
        f.vy = def.jumpSpeed * (input.up ? 1 : MOVEMENT.shortHop);
        f.grounded = false;
        setAction(f, 'air');
        world.events.push({ type: 'jump', slot: f.slot, air: false });
      }
      break;
    case 'land':
      friction(f);
      if (f.frame >= f.duration) setAction(f, 'idle');
      break;
    case 'air':
      if (airActions(world, f, input, press, dir)) break;
      airDrift(f, def, dir, 1);
      break;
    case 'helpless':
      airDrift(f, def, dir, MOVEMENT.helplessAirControl);
      break;
    case 'attack':
      runMove(world, f, input, dir);
      break;
    case 'hitstun':
      if (f.frame >= f.duration) setAction(f, f.grounded ? 'idle' : 'air');
      else if (!f.grounded) airDrift(f, def, dir, 0.25);
      break;
    case 'shield':
      friction(f);
      f.shieldHp -= SHIELD.drain;
      if (f.shieldHp <= 0) { breakShield(world, f); break; }
      if (!input.shield) { setAction(f, 'idle'); break; }
      if (press.left || press.right) {
        setAction(f, 'roll', DODGE.rollFrames);
        f.facing = press.right ? -1 : 1; // Face back toward where you rolled from.
        f.vx = (press.right ? 1 : -1) * (DODGE.rollDistance / (DODGE.rollFrames * DT));
        break;
      }
      if (press.down) { setAction(f, 'spotdodge', DODGE.spotFrames); break; }
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
      airDrift(f, def, dir, 0.5);
      if (f.frame >= DODGE.airInvincible[0] && f.frame <= DODGE.airInvincible[1]) f.invincible = Math.max(f.invincible, 1);
      if (f.frame >= f.duration) setAction(f, 'air');
      break;
    default:
      break;
  }

  integrate(world, f, input);
  ledgeSnap(world, f, dir);
  checkBlastZone(world, f);
}

/**
 * Recovering near a corner of the stage pulls you up onto it, so you never get stuck under the lip.
 * Happens when holding toward the stage, or during an up special or the helpless fall after it.
 */
function ledgeSnap(world: World, f: Fighter, dir: number): void {
  if (f.grounded) return;
  const recovering = f.action === 'helpless' || (f.action === 'attack' && (f.move === 'uspecial' || f.move === 'sspecial'));
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
    if (input.up) startMove(world, f, 'utilt');
    else if (input.down) startMove(world, f, 'dtilt');
    else if (dir !== 0) { f.facing = dir > 0 ? 1 : -1; startMove(world, f, 'ftilt'); }
    else startMove(world, f, 'jab');
    return true;
  }
  if (press.special) {
    startSpecial(world, f, input, dir);
    return true;
  }
  if (input.shield) {
    setAction(f, 'shield');
    return true;
  }
  if (press.up) {
    setAction(f, 'jumpsquat');
    return true;
  }
  if (press.down && onSoftPlatform(world, f)) {
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
  if (press.attack) {
    if (input.up) startMove(world, f, 'uair');
    else if (input.down) startMove(world, f, 'dair');
    else if (dir !== 0 && dir !== f.facing) startMove(world, f, 'bair');
    else if (dir !== 0) startMove(world, f, 'fair');
    else startMove(world, f, 'nair');
    return true;
  }
  if (press.special) {
    startSpecial(world, f, input, dir);
    return true;
  }
  if (press.shield && !f.airDodgeUsed) {
    f.airDodgeUsed = true;
    setAction(f, 'airdodge', DODGE.airFrames);
    return true;
  }
  if (press.up && f.airJumpsLeft > 0) {
    f.airJumpsLeft--;
    f.vy = fighterDef(f).airJumpSpeed;
    f.fastFalling = false;
    if (dir !== 0) { f.vx = dir * fighterDef(f).airSpeed; }
    world.events.push({ type: 'jump', slot: f.slot, air: true });
    return false; // Still drifts this frame.
  }
  if (press.down && f.vy <= 120 && !f.fastFalling) {
    f.fastFalling = true;
    f.vy = -fighterDef(f).fastFall;
  }
  return false;
}

function startSpecial(world: World, f: Fighter, input: Input, dir: number): void {
  if (input.up) { startUpSpecial(world, f); return; }
  if (input.down) {
    const m = fighterDef(f).moves.dspecial;
    // One bomb out at a time.
    if (m.projectile?.kind === 'bomb' && world.projectiles.some((p) => p.owner === f.slot && p.kind === 'bomb')) return;
    startMove(world, f, 'dspecial');
    return;
  }
  if (dir !== 0) {
    if (!f.grounded && f.sideSpecialUsed) return;
    f.facing = dir > 0 ? 1 : -1;
    if (!f.grounded) f.sideSpecialUsed = true;
    startMove(world, f, 'sspecial');
    return;
  }
  startMove(world, f, 'nspecial');
}

function startUpSpecial(world: World, f: Fighter): void {
  if (f.upSpecialsLeft <= 0) return;
  f.upSpecialsLeft--;
  startMove(world, f, 'uspecial');
}

function runMove(world: World, f: Fighter, input: Input, dir: number): void {
  const def = fighterDef(f);
  const m: MoveDef = def.moves[f.move!];
  const firstActive = f.frame === m.startup + 1;

  if (firstActive) {
    if (m.lunge) {
      f.vx = f.facing * m.lunge.vx;
      if (!f.grounded) f.vy = Math.max(f.vy, m.lunge.vy);
    }
    if (m.boost) {
      f.vy = m.boost;
      f.grounded = false;
      f.fastFalling = false;
      if (dir !== 0) f.facing = dir > 0 ? 1 : -1;
      f.vx = dir * def.airSpeed * 0.6;
      world.events.push({ type: 'jump', slot: f.slot, air: true });
    }
    if (m.slam) {
      f.vy = -m.slam;
      f.vx *= 0.3;
      f.grounded = false;
    }
    if (m.projectile) spawnProjectile(world, f, m);
  }

  if (f.grounded) {
    if (!m.lunge || f.frame > m.startup + m.active) friction(f);
  } else if (!m.slam) {
    airDrift(f, def, dir, m.boost ? 0.9 : MOVEMENT.attackAirControl);
    if (!m.boost && input.down && f.vy <= 120 && !f.fastFalling && !f.prev.down) {
      f.fastFalling = true;
      f.vy = -def.fastFall;
    }
  }

  if (m.slam) {
    if (f.grounded && f.frame > m.startup) { setAction(f, 'land', m.landLag ?? 10); return; }
    if (f.frame > m.startup + m.active) setAction(f, 'air');
    return;
  }
  const total = m.startup + m.active + m.endlag;
  if (f.frame >= total) {
    if (f.grounded) setAction(f, 'idle');
    else setAction(f, m.boost ? 'helpless' : 'air');
  }
}

function spawnProjectile(world: World, f: Fighter, m: MoveDef): void {
  const p = m.projectile!;
  const a = (p.angle * Math.PI) / 180;
  world.projectiles.push({
    id: world.nextProjectileId++,
    owner: f.slot,
    kind: p.kind,
    x: f.x + f.facing * (fighterDef(f).halfW + p.r),
    y: centerY(f),
    vx: f.facing * Math.cos(a) * p.speed + (p.kind === 'bomb' ? f.vx * 0.5 : 0),
    vy: Math.sin(a) * p.speed,
    r: p.r,
    life: p.lifeFrames,
    gravity: p.gravity,
    hit: p.hit,
    blastR: p.blastR ?? 0,
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

/** Gravity, movement and stage collision. */
function integrate(world: World, f: Fighter, input: Input): void {
  const def = fighterDef(f);
  const m = f.action === 'attack' && f.move ? def.moves[f.move] : null;

  if (!f.grounded) {
    const g = def.gravity * (m?.gravityScale && moveActive(f) ? m.gravityScale : 1);
    if (!(m?.slam && moveActive(f))) {
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
      if (f.action === 'idle' || f.action === 'land' || f.action === 'shield' || f.action === 'roll' || f.action === 'spotdodge') setAction(f, 'air');
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
      land(world, f, p, totalVy);
      return;
    }
  }
}

function land(world: World, f: Fighter, p: Platform, vy: number): void {
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
  const def = fighterDef(f);
  if (f.action === 'attack' && f.move) {
    const m = def.moves[f.move];
    if (m.slam) { setAction(f, 'land', m.landLag ?? 10); world.events.push({ type: 'land', slot: f.slot, hard: true }); return; }
    if (m.boost || m.landLag !== undefined) {
      setAction(f, 'land', m.landLag ?? MOVEMENT.landFrames);
      world.events.push({ type: 'land', slot: f.slot, hard: false });
      return;
    }
    // Grounded moves that briefly leave the ground (lunges) carry on.
    return;
  }
  if (f.action === 'hitstun') {
    // Tech-less landing: a short knockdown.
    setAction(f, 'land', 14);
  } else if (f.action === 'airdodge') {
    setAction(f, 'land', 8);
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
  const by = f.lastHitBy >= 0 && world.frame - f.lastHitFrame < 60 * 8 ? f.lastHitBy : -1;
  world.events.push({ type: 'ko', slot: f.slot, x: Math.max(b.left, Math.min(b.right, f.x)), y: Math.max(b.bottom, Math.min(b.top, cy)), by });
  f.stats.falls++;
  if (by >= 0) world.fighters[by]!.stats.kos++;
  else f.stats.selfDestructs++;
  f.stocks--;
  f.vx = f.vy = f.lx = f.ly = 0;
  f.hitlag = 0;
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
  f.facing = x < 0 ? 1 : -1;
  refreshAirOptions(f);
  setAction(f, 'respawn');
  f.invincible = MATCH.respawnInvincibleFrames;
  world.events.push({ type: 'respawn', slot: f.slot });
}

// ---------------------------------------------------------------------------------------------
// Projectiles

function updateProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    const owner = world.fighters[p.owner]!;
    if (owner.hitlag > 0 && p.kind === 'shot') { keep.push(p); continue; }
    p.vy -= p.gravity * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.life--;
    let gone = p.life <= 0;
    // Stage contact.
    for (const pl of world.stage.platforms) {
      if (p.x > pl.x1 && p.x < pl.x2 && p.y - p.r < pl.y && p.y > pl.y - (pl.solid ? pl.depth : 4)) {
        if (pl.solid || p.vy < 0) gone = true;
      }
    }
    // Fighter contact.
    if (!gone) {
      for (const f of world.fighters) {
        if (f.slot === p.owner || !isAlive(f) || f.action === 'respawn') continue;
        const dx = f.x - p.x;
        const dy = centerY(f) - p.y;
        const reach = fighterDef(f).hurtR + p.r;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (p.kind === 'shot') {
          if (f.invincible <= 0) applyHit(world, owner, f, { ...p.hit, x: 0, y: 0 }, p.vx >= 0 ? 1 : -1, p.x, p.y, false);
        }
        gone = true;
        break;
      }
    }
    if (gone) {
      if (p.kind === 'bomb') explode(world, p);
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
    if (f.slot === p.owner || !isAlive(f) || f.action === 'respawn' || f.invincible > 0) continue;
    const dx = f.x - p.x;
    const dy = centerY(f) - p.y;
    const reach = fighterDef(f).hurtR + p.blastR;
    if (dx * dx + dy * dy > reach * reach) continue;
    applyHit(world, owner, f, { ...p.hit, x: 0, y: 0 }, dx >= 0 ? 1 : -1, p.x, p.y, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Hits

/** World position of a fighter's current hitbox. */
export function hitboxWorld(f: Fighter): { x: number; y: number; r: number; hb: Hitbox } | null {
  if (!moveActive(f)) return null;
  const hb = fighterDef(f).moves[f.move!].hitbox;
  if (!hb) return null;
  return { x: f.x + f.facing * hb.x, y: centerY(f) + hb.y, r: hb.r, hb };
}

function resolveHits(world: World): void {
  for (const a of world.fighters) {
    if (a.hitlag > 0) continue;
    const box = hitboxWorld(a);
    if (!box) continue;
    for (const t of world.fighters) {
      if (t === a || !isAlive(t) || t.action === 'respawn' || a.moveHits.includes(t.slot)) continue;
      const dx = t.x - box.x;
      const dy = centerY(t) - box.y;
      const reach = fighterDef(t).hurtR + box.r;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (t.invincible > 0) continue;
      a.moveHits.push(t.slot);
      applyHit(world, a, t, box.hb, a.facing, (box.x + t.x) / 2, (box.y + centerY(t)) / 2, true);
    }
  }
}

function applyHit(world: World, attacker: Fighter, target: Fighter, hb: Hitbox, facing: 1 | -1, x: number, y: number, melee: boolean): void {
  const lag = Math.min(HITLAG.max, Math.floor(HITLAG.base + hb.dmg * HITLAG.perDamage));

  if (target.action === 'shield' || target.action === 'shieldstun') {
    target.shieldHp -= hb.dmg * SHIELD.damageScale;
    world.events.push({ type: 'shieldhit', x, y, target: target.slot });
    if (melee) attacker.hitlag = Math.ceil(lag * 0.6);
    if (target.shieldHp <= 0) { breakShield(world, target); return; }
    setAction(target, 'shieldstun', SHIELD.stunFrames + Math.floor(hb.dmg / 3));
    target.vx = facing * (120 + hb.dmg * 14);
    return;
  }

  target.percent = Math.min(999, target.percent + hb.dmg);
  attacker.stats.damageDealt += hb.dmg;
  const kb = knockback(target.percent, hb.dmg, fighterDef(target).weight, hb.bkb, hb.kbg);

  // Angle, mirrored for facing, then bent by directional influence.
  let angle = hb.angle;
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
  target.lastHitBy = attacker.slot;
  target.lastHitFrame = world.frame;
  target.lastKb = kb;
  setAction(target, 'hitstun', Math.max(8, Math.floor(kb * KNOCKBACK.hitstunPerKb)));
  // Getting hit gives your recovery back (except the air dodge).
  const def = fighterDef(target);
  target.upSpecialsLeft = def.upSpecials;
  target.sideSpecialUsed = false;
  target.airJumpsLeft = Math.max(target.airJumpsLeft, Math.min(1, def.airJumps));

  target.hitlag = lag;
  if (melee) attacker.hitlag = lag;
  world.events.push({ type: 'hit', x, y, dmg: hb.dmg, kb, attacker: attacker.slot, target: target.slot });
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
