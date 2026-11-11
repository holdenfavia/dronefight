// Room protocol (ADR-0005, ADR-0075, ADR-0076). The server groups players by two-digit room code, keeps each
// room's lobby (picks, ready, the host's settings) and runs its online fights: members send their keys every
// frame, the server steps the fight and sends every frame's inputs back to the whole room.

import type { BotLevel } from './fighter/bot.js';
import type { FighterId } from './fighter/fighters.js';
import { isBotLevel, isFighterId, isInputBits, isStageId, type MatchStart, type RoomSettings } from './online.js';
import { MATCH } from './fighter/config.js';

export type ClientMessage =
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'relay'; data: unknown }
  /** Your fighter and Ready in the lobby. */
  | { t: 'pick'; fighter: FighterId; ready: boolean }
  /** Host only: stage, stocks and CPUs. */
  | { t: 'settings'; settings: RoomSettings }
  /** Host only: start the fight (everyone ready). */
  | { t: 'start' }
  /** Your keys this frame (shared/online.ts encodeInput). */
  | { t: 'in'; b: number };

export interface RoomMember {
  id: number;
  fighter: FighterId;
  ready: boolean;
}

export type ServerMessage =
  | { t: 'hello'; protocol: number }
  | { t: 'room'; code: string; you: number; members: RoomMember[]; host: number; settings: RoomSettings; playing: boolean }
  | { t: 'relay'; from: number; data: unknown }
  /** A fight starts (or, joining mid-fight, is going on): build the same world. `you` is your fighter slot, -1 to watch. */
  | { t: 'match'; start: MatchStart; you: number }
  /** Inputs for frames `from`, `from + 1`, … (one array of input bits per frame, one entry per fighter). */
  | { t: 'frames'; from: number; inputs: number[][] }
  /** The whole world after frame `frame` was stepped (shared/online.ts serializeWorld). */
  | { t: 'snap'; frame: number; world: string }
  /** A player left mid-fight: a CPU of this level takes over their fighter. */
  | { t: 'cpu'; slot: number; level: BotLevel }
  /** The fight is over and the room is back in its lobby. */
  | { t: 'end' }
  | { t: 'error'; code: 'bad-message' | 'no-room' | 'room-full' | 'no-codes' | 'not-host' | 'not-ready'; message: string };

export const ROOM_CODE_DIGITS = 2;
export const MAX_ROOM_MEMBERS = 4;

function parseSettings(v: unknown): RoomSettings | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (!isStageId(s.stage)) return null;
  if (typeof s.stocks !== 'number' || !Number.isInteger(s.stocks) || s.stocks < 1 || s.stocks > 5) return null;
  if (!Array.isArray(s.cpus) || s.cpus.length > MATCH.maxFighters - 1 || !s.cpus.every(isBotLevel)) return null;
  return { stage: s.stage, stocks: s.stocks, cpus: [...s.cpus] };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const msg = m as Record<string, unknown>;
  switch (msg.t) {
    case 'create':
    case 'leave':
    case 'start':
      return { t: msg.t };
    case 'join':
      return typeof msg.code === 'string' && /^\d{2}$/.test(msg.code) ? { t: 'join', code: msg.code } : null;
    case 'relay':
      return 'data' in msg ? { t: 'relay', data: msg.data } : null;
    case 'pick':
      return isFighterId(msg.fighter) && typeof msg.ready === 'boolean' ? { t: 'pick', fighter: msg.fighter, ready: msg.ready } : null;
    case 'settings': {
      const settings = parseSettings(msg.settings);
      return settings ? { t: 'settings', settings } : null;
    }
    case 'in':
      return isInputBits(msg.b) ? { t: 'in', b: msg.b } : null;
    default:
      return null;
  }
}
