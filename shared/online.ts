// Online fights (ADR-0076): the room server runs the fight and sends every frame's inputs to everyone in the
// room, who step the same deterministic sim (shared/fighter/). A full snapshot now and then heals any drift
// (another browser's floating point, a dropped tab) and lets late joiners watch.

import type { BotLevel } from './fighter/bot.js';
import { MATCH } from './fighter/config.js';
import { FIGHTER_IDS, type FighterId } from './fighter/fighters.js';
import { NO_INPUT, type Input, type World } from './fighter/sim.js';
import { STAGE_IDS, STAGES, type StageId } from './fighter/stages.js';

/** Input keys in bit order: bit 0 is `left`. */
const INPUT_BITS = Object.keys(NO_INPUT) as (keyof Input)[];
const ALL_BITS = (1 << INPUT_BITS.length) - 1;

export function encodeInput(input: Input): number {
  let b = 0;
  INPUT_BITS.forEach((k, i) => {
    if (input[k]) b |= 1 << i;
  });
  return b;
}

export function decodeInput(bits: number): Input {
  const input: Input = { ...NO_INPUT };
  INPUT_BITS.forEach((k, i) => {
    input[k] = (bits & (1 << i)) !== 0;
  });
  return input;
}

export function isInputBits(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= ALL_BITS;
}

/** What one member of a room has chosen in the lobby. */
export interface MemberPick {
  fighter: FighterId;
  ready: boolean;
}

/** The host's match settings. Each CPU is one entry: its level. */
export interface RoomSettings {
  stage: StageId;
  stocks: number;
  cpus: BotLevel[];
}

export function defaultRoomSettings(): RoomSettings {
  return { stage: 'rooftop', stocks: MATCH.defaultStocks, cpus: [] };
}

export function isFighterId(v: unknown): v is FighterId {
  return typeof v === 'string' && (FIGHTER_IDS as readonly string[]).includes(v);
}

export function isStageId(v: unknown): v is StageId {
  return typeof v === 'string' && (STAGE_IDS as readonly string[]).includes(v);
}

export function isBotLevel(v: unknown): v is BotLevel {
  return v === 1 || v === 2 || v === 3;
}

/** One fighter in an online match: a room member's, or a CPU's (member -1). */
export interface MatchFighter {
  fighter: FighterId;
  member: number;
  level: BotLevel | 0;
}

export interface MatchStart {
  stage: StageId;
  stocks: number;
  seed: number;
  fighters: MatchFighter[];
}

/** A world as JSON (the stage by id; events of the last step dropped, they were already played). */
export function serializeWorld(world: World): string {
  return JSON.stringify({ ...world, stage: world.stage.id, events: [] });
}

export function deserializeWorld(json: string): World | null {
  try {
    const w = JSON.parse(json) as Omit<World, 'stage'> & { stage: string };
    if (!isStageId(w.stage) || !Array.isArray(w.fighters)) return null;
    return { ...w, stage: STAGES[w.stage], events: [] };
  } catch {
    return null;
  }
}

/** Where two serialized worlds differ (first few paths), for the console when an online fight drifts. */
export function describeDrift(ours: string, theirs: string): string {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (out.length >= 6) return;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      if (a !== b) out.push(`${path || 'world'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      return;
    }
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.join() !== kb.join() && new Set(ka).size === new Set([...ka, ...kb]).size) out.push(`${path || 'world'}: key order`);
    for (const k of new Set([...ka, ...kb])) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
  };
  try {
    walk(JSON.parse(ours), JSON.parse(theirs), '');
  } catch {
    return 'unreadable';
  }
  return out.join(' · ') || 'no difference';
}

/** Frames between snapshots during a fight. */
export const SNAPSHOT_EVERY_FRAMES = 60;
/** Inputs a member may have waiting on the server; older ones are dropped so lag can't build up. */
export const MAX_QUEUED_INPUTS = 4;
/** With no new input for this many frames (tab hidden, connection stalled) the fighter lets go of every key. */
export const INPUT_HOLD_FRAMES = 12;
/** Frames the server keeps running after the last stock falls, before the room goes back to its lobby. */
export const MATCH_END_FRAMES = 150;
