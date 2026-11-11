// Computer-controlled drones (ADR-0070, ADR-0071). A bot reads the world and produces the same Input a player would.

import { KNOCKBACK } from './config.js';
import { centerY, fighterDef, isAlive, knockback, NO_INPUT, type Fighter, type Input, type World } from './sim.js';
import { nextRandom } from './rng.js';
import { mainPlatform } from './stages.js';

export type BotLevel = 1 | 2 | 3;

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { 1: 'Easy', 2: 'Normal', 3: 'Hard' };

/**
 * Per level: frames between decisions, chance to attack when in range, chance to shield a nearby attack,
 * recovery skill, chance to tech, mash speed (chance per frame), chance to grab a shield.
 */
const LEVELS: Record<BotLevel, { react: number; aggression: number; shield: number; recoverySkill: number; tech: number; mash: number; grab: number }> = {
  1: { react: 22, aggression: 0.35, shield: 0.05, recoverySkill: 0.6, tech: 0.1, mash: 0.15, grab: 0.15 },
  2: { react: 12, aggression: 0.6, shield: 0.18, recoverySkill: 0.85, tech: 0.45, mash: 0.4, grab: 0.45 },
  3: { react: 6, aggression: 0.85, shield: 0.35, recoverySkill: 1, tech: 0.85, mash: 0.8, grab: 0.8 },
};

type Frame = Partial<Input>;

export interface Bot {
  slot: number;
  level: BotLevel;
  rng: { seed: number };
  /** The input the bot is holding until its next decision. */
  held: Input;
  /** Buttons to press (one-frame taps) at the next frame. */
  tap: Partial<Input>;
  /** Exact inputs for the next frames (combos, smashes, throws); overrides held and tap. */
  seq: Frame[];
  nextThink: number;
  last: Input;
  /** Already decided whether to tech this flight. */
  techDecided: boolean;
}

export function createBot(slot: number, level: BotLevel, seed = 1): Bot {
  return { slot, level, rng: { seed: seed * 7919 + slot * 104729 }, held: { ...NO_INPUT }, tap: {}, seq: [], nextThink: 0, last: { ...NO_INPUT }, techDecided: false };
}

/** The bot's input for this frame. Call once per frame before step(). */
export function botInput(bot: Bot, world: World): Input {
  const me = world.fighters[bot.slot];
  if (!me || !isAlive(me) || world.countdown > 0) { bot.seq = []; return (bot.last = { ...NO_INPUT }); }
  const cfg = LEVELS[bot.level];
  const rand = () => nextRandom(bot.rng);

  if (me.action === 'held') {
    // Mash out: a different key every few frames.
    bot.seq = [];
    const out: Input = { ...NO_INPUT };
    if (rand() < cfg.mash) out[(['left', 'right', 'up', 'shield'] as const)[world.frame % 4]!] = !bot.last.left && !bot.last.right && !bot.last.up && !bot.last.shield;
    return (bot.last = out);
  }
  if (me.action !== 'hitstun' && me.action !== 'air') bot.techDecided = false;

  if (bot.seq.length) {
    const out: Input = { ...NO_INPUT, ...bot.seq.shift() };
    bot.last = out;
    return { ...out };
  }

  // Recovery is checked every frame: falling off the stage is the bot's worst enemy.
  const recovering = recover(bot, world, me, rand, cfg);
  if (!recovering && world.frame >= bot.nextThink) {
    bot.nextThink = world.frame + cfg.react + Math.floor(rand() * cfg.react);
    think(bot, world, me, rand, cfg);
    if (bot.seq.length) return botInput(bot, world);
  }

  // A tap is one frame down; if the key was already down last frame, release it first so the press registers.
  const out: Input = { ...bot.held };
  for (const k of Object.keys(bot.tap) as (keyof Input)[]) {
    if (!bot.tap[k]) continue;
    if (bot.last[k]) out[k] = false;
    else { out[k] = true; delete bot.tap[k]; }
  }
  bot.last = out;
  return { ...out };
}

/** Would this knockback send them out from where they stand? (Rough.) */
function wouldKo(world: World, target: Fighter, dmg: number, bkb: number, kbg: number): boolean {
  const kb = knockback(target.percent + dmg, dmg, fighterDef(target).weight, bkb, kbg);
  const main = mainPlatform(world.stage);
  const toEdge = Math.min(Math.abs(target.x - world.stage.blast.left), Math.abs(world.stage.blast.right - target.x));
  const dist = (kb * KNOCKBACK.launchScale) ** 2 / (2 * KNOCKBACK.launchDecay) * 0.75;
  return dist > toEdge || (target.x < main.x1 + 120 || target.x > main.x2 - 120 ? dist > toEdge * 0.8 : false);
}

function recover(bot: Bot, world: World, me: Fighter, rand: () => number, cfg: (typeof LEVELS)[BotLevel]): boolean {
  const main = mainPlatform(world.stage);
  // Tech: press shield just before hitting the floor while launched.
  if (me.tumbling && !me.grounded && me.vy + me.ly < 0) {
    const ground = world.stage.platforms.some((p) => me.x > p.x1 && me.x < p.x2 && me.y > p.y && me.y - p.y < 60);
    if (ground && !bot.techDecided) {
      bot.techDecided = true;
      if (rand() < cfg.tech) bot.tap = { ...bot.tap, shield: true };
    }
  }
  if (me.action === 'down') {
    bot.held = { ...NO_INPUT };
    if (me.frame > 14 + Math.floor(rand() * 20)) {
      const r = rand();
      bot.tap = r < 0.3 ? { attack: true } : r < 0.6 ? { left: rand() < 0.5 } : { up: true };
      if (bot.tap.left === false) bot.tap = { right: true };
    }
    return true;
  }
  const offLeft = me.x < main.x1 - 5;
  const offRight = me.x > main.x2 + 5;
  const below = me.y < main.y - 10;
  if (!offLeft && !offRight && !below) return false;
  if (me.grounded) return false;
  if (me.action === 'hitstun' && me.frame < me.duration) {
    // Hold toward the stage while launched (directional influence).
    bot.held = { ...NO_INPUT, left: me.x > 0, right: me.x < 0, up: true };
    return true;
  }
  const toCenter = me.x > 0 ? -1 : 1;
  const edgeX = toCenter > 0 ? main.x1 : main.x2;
  const distToEdge = Math.abs(me.x - edgeX);
  const halfW = fighterDef(me).halfW;
  if (!offLeft && !offRight && below) {
    // Under the stage: get out from underneath before going up, or we bonk our head.
    const out = me.x > (main.x1 + main.x2) / 2 ? 1 : -1;
    const clear = out > 0 ? me.x > main.x2 + halfW : me.x < main.x1 - halfW;
    bot.held = { ...NO_INPUT, left: out < 0, right: out > 0 };
    if (!clear && me.vy + me.ly < 0 && me.y < main.y - main.depth - 120 && me.airJumpsLeft > 0) bot.tap = { up: true };
    return true;
  }
  bot.held = { ...NO_INPUT, left: toCenter < 0, right: toCenter > 0 };
  if (rand() > cfg.recoverySkill) return true;
  const falling = me.vy + me.ly < 0;
  if (falling && me.airJumpsLeft > 0 && me.y < main.y + 80) {
    bot.tap = { up: true };
  } else if (falling && me.sideSpecialsLeft > 0 && distToEdge > 220 && me.y > main.y - 160) {
    bot.tap = { special: true };
  } else if (falling && me.upSpecialsLeft > 0 && me.airJumpsLeft === 0 && me.y < main.y + 40) {
    bot.held = { ...bot.held, up: true };
    bot.tap = { special: true };
  }
  return true;
}

function think(bot: Bot, world: World, me: Fighter, rand: () => number, cfg: (typeof LEVELS)[BotLevel]): void {
  const target = nearestOpponent(world, me);
  bot.held = { ...NO_INPUT };
  bot.tap = {};
  if (!target) return;
  const main = mainPlatform(world.stage);
  const def = fighterDef(me);
  const dx = target.x - me.x;
  const dy = centerY(target) - centerY(me);
  const dist = Math.hypot(dx, dy);
  const toward: 1 | -1 = dx > 0 ? 1 : -1;
  const reach = def.hurtR + 45;

  if (me.action === 'holding') {
    // Pummel a little, then throw: toward the nearer edge, or up for a follow-up at low damage.
    if (rand() < 0.35) { bot.seq = [{}, { grab: true }]; return; }
    const edgeDir: 1 | -1 = me.x > 0 ? 1 : -1;
    const killy = target.percent > 90;
    const throwX = killy ? edgeDir : rand() < 0.5 ? edgeDir : 0;
    if (throwX === 0) bot.seq = [{}, rand() < 0.5 ? { aimUp: true } : { aimDown: true }];
    else bot.seq = [{}, throwX > 0 ? { aimRight: true } : { aimLeft: true }];
    return;
  }

  // Shield attacks that are about to land.
  if (me.grounded && target.action === 'attack' && dist < reach + 50 && rand() < cfg.shield) {
    bot.held = { ...NO_INPUT, shield: true };
    return;
  }

  // Don't chase someone off the stage; wait at the edge and shoot (or blow them away).
  const targetOff = target.x < main.x1 || target.x > main.x2 || target.y < main.y - 20;
  if (targetOff) {
    const edge = toward > 0 ? main.x2 - 40 : main.x1 + 40;
    const toEdge = edge - me.x;
    if (Math.abs(toEdge) > 30) bot.held = { ...NO_INPUT, left: toEdge < 0, right: toEdge > 0 };
    else if (rand() < cfg.aggression * 0.5) {
      me.facing === toward ? (bot.tap = { special: true }) : (bot.seq = [{}, { [toward > 0 ? 'right' : 'left']: true, special: true }]);
    }
    return;
  }

  // Grab shields (and sometimes anyone standing close).
  if (me.grounded && target.grounded && Math.abs(dx) < reach + 10 && Math.abs(dy) < 40) {
    const shielding = target.action === 'shield' || target.action === 'shieldstun';
    if ((shielding && rand() < cfg.grab) || rand() < cfg.grab * 0.2) {
      bot.seq = me.facing === toward ? [{}, { grab: true }] : [{}, { [toward > 0 ? 'right' : 'left']: true }, { grab: true }];
      return;
    }
  }

  if (dist < reach && rand() < cfg.aggression) {
    attackToward(bot, world, me, target, dx, dy, toward, rand);
    return;
  }

  // Close the distance.
  const left = toward < 0;
  const right = toward > 0;
  bot.held = { ...NO_INPUT, left, right };
  // Don't walk off the edge.
  if (me.grounded && ((right && me.x > main.x2 - 30) || (left && me.x < main.x1 + 30))) bot.held = { ...NO_INPUT };
  if (dy > 70 && (me.grounded || me.airJumpsLeft > 0) && rand() < 0.7) bot.tap = { up: true };
  else if (Math.abs(dx) > 260 && Math.abs(dy) < 60 && rand() < cfg.aggression * 0.3) bot.tap = { special: true };
  else if (Math.abs(dx) > 200 && me.grounded && rand() < 0.15) bot.tap = { up: true };
}

function aim(dir: 1 | -1): Frame {
  return dir > 0 ? { aimRight: true, attack: true } : { aimLeft: true, attack: true };
}

function move(dir: 1 | -1): Frame {
  return dir > 0 ? { right: true } : { left: true };
}

function attackToward(bot: Bot, world: World, me: Fighter, target: Fighter, dx: number, dy: number, toward: 1 | -1, rand: () => number): void {
  const def = fighterDef(me);
  const away: 1 | -1 = toward > 0 ? -1 : 1;
  if (me.grounded) {
    // A smash when it would finish them, charged a little.
    const fs = def.moves.fsmash.hitboxes![0]!;
    const charge: Frame[] = Array.from({ length: Math.floor(rand() * 18) }, () => ({ ...move(toward), ...aim(toward) }));
    if (dy > 45) {
      const us = def.moves.usmash.hitboxes!.at(-1)!;
      bot.seq = wouldKo(world, target, us.dmg, us.bkb, us.kbg) && rand() < 0.6
        ? [{}, { up: true, aimUp: true, attack: true }]
        : [{}, { aimUp: true, attack: true }];
      return;
    }
    if (wouldKo(world, target, fs.dmg * 1.15, fs.bkb, fs.kbg) && rand() < 0.65) {
      bot.seq = [{}, { ...move(toward), ...aim(toward) }, ...charge];
      return;
    }
    const r = rand();
    if (r < 0.15) {
      bot.seq = [{}, { ...move(toward), special: true }];
    } else if (r < 0.3) {
      bot.seq = [{}, { aimDown: true, attack: true }];
    } else if (r < 0.55 && Math.abs(dx) < 45) {
      // Jab combo.
      bot.seq = [{}, aim(toward), ...Array<Frame>(7).fill({}), aim(toward), ...Array<Frame>(7).fill({}), aim(toward)];
    } else if (r < 0.65) {
      bot.seq = [{}, { down: true, aimDown: true, attack: true }];
    } else {
      // Forward tilt: aim at them while holding away (turnaround tilt is the one-frame way to tilt).
      bot.seq = [{}, { ...move(away), ...aim(toward) }];
    }
    return;
  }
  // In the air.
  if (dy > 45) bot.seq = [{}, { aimUp: true, attack: true }];
  else if (dy < -40) bot.seq = [{}, { aimDown: true, attack: true }];
  else if (me.facing !== toward) bot.seq = [{}, aim(toward)]; // Back aerial.
  else if (rand() < 0.5) bot.seq = [{}, { ...move(toward), ...aim(toward) }];
  else bot.seq = [{}, aim(toward)];
}

function nearestOpponent(world: World, me: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const f of world.fighters) {
    if (f === me || !isAlive(f) || f.action === 'respawn') continue;
    const d = Math.hypot(f.x - me.x, f.y - me.y);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}
