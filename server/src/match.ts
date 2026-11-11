// One online fight (ADR-0076). The server owns it: it takes each member's latest keys, runs the CPUs, steps the
// shared deterministic sim and hands back what each frame used, so every client can step the same world.

import { botInput, createBot, type Bot, type BotLevel } from '../../shared/fighter/bot.js';
import { createWorld, NO_INPUT, step, type World } from '../../shared/fighter/sim.js';
import { decodeInput, encodeInput, INPUT_HOLD_FRAMES, MATCH_END_FRAMES, MAX_QUEUED_INPUTS, type MatchStart } from '../../shared/online.js';

interface Slot {
  /** Room member playing this fighter, or -1 for a CPU. */
  member: number;
  bot: Bot | null;
  queue: number[];
  last: number;
  /** Frames since this member's last input arrived. */
  starved: number;
}

export class OnlineMatch {
  readonly world: World;
  private slots: Slot[];
  private overFrames = 0;

  constructor(readonly start: MatchStart) {
    this.world = createWorld(start.stage, start.fighters.map((f) => ({ id: f.fighter })), start.stocks, start.seed);
    this.slots = start.fighters.map((f, i) => ({
      member: f.member,
      bot: f.member < 0 ? createBot(i, (f.level || 2) as BotLevel, start.seed) : null,
      queue: [],
      last: 0,
      starved: 0,
    }));
  }

  slotOf(member: number): number {
    return this.slots.findIndex((s) => s.member === member);
  }

  /** A member's keys for their next frame. */
  input(member: number, bits: number): void {
    const s = this.slots.find((x) => x.member === member);
    if (!s) return;
    s.queue.push(bits);
    // A burst after a stall: keep only the newest few, so the fighter never lags behind its player.
    if (s.queue.length > MAX_QUEUED_INPUTS) s.queue.splice(0, s.queue.length - MAX_QUEUED_INPUTS);
  }

  /** The member left: a CPU takes over their fighter. Returns its slot, or -1. */
  replaceWithCpu(member: number, level: BotLevel): number {
    const i = this.slotOf(member);
    if (i < 0) return -1;
    const s = this.slots[i]!;
    s.member = -1;
    s.bot = createBot(i, level, this.start.seed + this.world.frame);
    s.queue = [];
    return i;
  }

  get hasPlayers(): boolean {
    return this.slots.some((s) => s.member >= 0);
  }

  /** The fight has been over long enough for everyone to see the results. */
  get finished(): boolean {
    return this.overFrames >= MATCH_END_FRAMES;
  }

  /** Step one frame; returns the input bits each fighter used. */
  step(): number[] {
    const bits = this.slots.map((s) => {
      if (s.bot) return encodeInput(botInput(s.bot, this.world));
      const next = s.queue.shift();
      if (next !== undefined) {
        s.last = next;
        s.starved = 0;
      } else if (++s.starved > INPUT_HOLD_FRAMES) {
        s.last = encodeInput(NO_INPUT);
      }
      return s.last;
    });
    step(this.world, bits.map(decodeInput));
    if (this.world.over) this.overFrames++;
    return bits;
  }
}
