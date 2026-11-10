// Computer-controlled drones (ADR-0070). A bot reads the world and produces the same Input a player would.

import { fighterDef, centerY, isAlive, NO_INPUT, type Fighter, type Input, type World } from './sim.js';
import { nextRandom } from './rng.js';
import { mainPlatform } from './stages.js';

export type BotLevel = 1 | 2 | 3;

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { 1: 'Easy', 2: 'Normal', 3: 'Hard' };

/** Per level: frames between decisions, chance to attack when in range, chance to shield a nearby attack. */
const LEVELS: Record<BotLevel, { react: number; aggression: number; shield: number; recoverySkill: number }> = {
  1: { react: 22, aggression: 0.35, shield: 0.05, recoverySkill: 0.6 },
  2: { react: 12, aggression: 0.6, shield: 0.18, recoverySkill: 0.85 },
  3: { react: 6, aggression: 0.85, shield: 0.35, recoverySkill: 1 },
};

export interface Bot {
  slot: number;
  level: BotLevel;
  rng: { seed: number };
  /** The input the bot is holding until its next decision. */
  held: Input;
  /** Buttons to press (one-frame taps) at the next frame. */
  tap: Partial<Input>;
  nextThink: number;
  last: Input;
}

export function createBot(slot: number, level: BotLevel, seed = 1): Bot {
  return { slot, level, rng: { seed: seed * 7919 + slot * 104729 }, held: { ...NO_INPUT }, tap: {}, nextThink: 0, last: { ...NO_INPUT } };
}

/** The bot's input for this frame. Call once per frame before step(). */
export function botInput(bot: Bot, world: World): Input {
  const me = world.fighters[bot.slot];
  if (!me || !isAlive(me) || world.countdown > 0) return (bot.last = { ...NO_INPUT });
  const cfg = LEVELS[bot.level];
  const rand = () => nextRandom(bot.rng);

  // Recovery is checked every frame: falling off the stage is the bot's worst enemy.
  const recovering = recover(bot, world, me, rand, cfg.recoverySkill);
  if (!recovering && world.frame >= bot.nextThink) {
    bot.nextThink = world.frame + cfg.react + Math.floor(rand() * cfg.react);
    think(bot, world, me, rand, cfg);
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

function recover(bot: Bot, world: World, me: Fighter, rand: () => number, skill: number): boolean {
  const main = mainPlatform(world.stage);
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
  if (rand() > skill) return true;
  const falling = me.vy + me.ly < 0;
  if (falling && me.airJumpsLeft > 0 && me.y < main.y + 80) {
    bot.tap = { up: true };
  } else if (falling && !me.sideSpecialUsed && distToEdge > 220 && me.y > main.y - 160) {
    bot.held = { ...bot.held };
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
  const toward = dx > 0 ? 1 : -1;
  const reach = def.hurtR + 45;

  // Shield attacks that are about to land.
  if (me.grounded && target.action === 'attack' && dist < reach + 50 && rand() < cfg.shield) {
    bot.held = { ...NO_INPUT, shield: true };
    return;
  }

  // Don't chase someone off the stage; wait at the edge and shoot.
  const targetOff = target.x < main.x1 || target.x > main.x2 || target.y < main.y - 20;
  if (targetOff) {
    const edge = toward > 0 ? main.x2 - 40 : main.x1 + 40;
    const toEdge = edge - me.x;
    if (Math.abs(toEdge) > 30) bot.held = { ...NO_INPUT, left: toEdge < 0, right: toEdge > 0 };
    else if (rand() < cfg.aggression * 0.5) { bot.held = { ...NO_INPUT, left: toward < 0, right: toward > 0 }; bot.tap = { special: true }; }
    return;
  }

  if (dist < reach && rand() < cfg.aggression) {
    attackToward(bot, me, dx, dy, toward, rand);
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

function attackToward(bot: Bot, me: Fighter, dx: number, dy: number, toward: number, rand: () => number): void {
  const left = toward < 0;
  const right = toward > 0;
  if (dy > 45) {
    bot.held = { ...NO_INPUT, up: true };
    bot.tap = { attack: true };
  } else if (dy < -40 && !me.grounded) {
    bot.held = { ...NO_INPUT, down: true };
    bot.tap = { attack: true };
  } else if (rand() < 0.15) {
    bot.held = { ...NO_INPUT, left, right };
    bot.tap = { special: true };
  } else if (Math.abs(dx) < 25 && rand() < 0.4) {
    bot.tap = { attack: true };
  } else {
    bot.held = { ...NO_INPUT, left, right };
    bot.tap = { attack: true };
  }
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
