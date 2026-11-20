// Room protocol (ADR-0005, ADR-0075, ADR-0076). The server groups players by two-digit room code, keeps each
// room's lobby (picks, ready, the host's settings) and runs its online fights: members send their keys every
// frame, the server steps the fight and sends every frame's inputs back to the whole room.

import type { BotLevel } from './fighter/bot.js';
import type { FighterId } from './fighter/fighters.js';
import type { StageId } from './fighter/stages.js';
import { isBotLevel, isFighterId, isInputBits, isStagePick, isTeam, parseBans, type MatchStart, type RoomSettings } from './online.js';
import { MATCH } from './fighter/config.js';
import { parseProfile, type Profile } from './profile.js';

export type ClientMessage =
  /** `profile`: your tag and color (ADR-0083), shown to the room. */
  | { t: 'create'; profile?: Profile }
  | { t: 'join'; code: string; profile?: Profile }
  | { t: 'leave' }
  | { t: 'relay'; data: unknown }
  /** Your fighter, Ready, team (ADR-0081) and stage bans (ADR-0086) in the lobby. */
  | { t: 'pick'; fighter: FighterId; ready: boolean; team?: number; bans?: StageId[] }
  /** Host only: stage, stocks, CPUs, mode and stage pick and ban. */
  | { t: 'settings'; settings: RoomSettings }
  /** Host only: start the fight (everyone ready). */
  | { t: 'start' }
  /** Your keys this frame (shared/online.ts encodeInput); `s` numbers them so the server can ack (ADR-0089). */
  | { t: 'in'; b: number; s?: number };

export interface RoomMember {
  id: number;
  fighter: FighterId;
  ready: boolean;
  team: number;
  /** Stages they banned (ADR-0086). */
  bans: StageId[];
  /** Their personal tag and color (ADR-0083). */
  tag: string;
  color: number;
}

export type ServerMessage =
  | { t: 'hello'; protocol: number }
  | { t: 'room'; code: string; you: number; members: RoomMember[]; host: number; settings: RoomSettings; playing: boolean }
  | { t: 'relay'; from: number; data: unknown }
  /** A fight starts (or, joining mid-fight, is going on): build the same world. `you` is your fighter slot, -1 to watch. */
  | { t: 'match'; start: MatchStart; you: number }
  /** Inputs for frames `from`, `from + 1`, … (one array of input bits per frame, one entry per fighter). */
  /** `ack`: per fighter, the `s` of the last input the server used, -1 for none or a CPU (ADR-0089). */
  | { t: 'frames'; from: number; inputs: number[][]; ack?: number[] }
  /** The whole world after frame `frame` was stepped (shared/online.ts serializeWorld). */
  | { t: 'snap'; frame: number; world: string }
  /** A player left mid-fight: a CPU of this level takes over their fighter. */
  | { t: 'cpu'; slot: number; level: BotLevel }
  /** The fight is over and the room is back in its lobby. */
  | { t: 'end' }
  | { t: 'error'; code: 'bad-message' | 'no-room' | 'room-full' | 'no-codes' | 'not-host' | 'not-ready'; message: string };

export const ROOM_CODE_DIGITS = 2;
export const MAX_ROOM_MEMBERS = 10;

function isSeq(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function parseSettings(v: unknown): RoomSettings | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (!isStagePick(s.stage)) return null;
  if (typeof s.stocks !== 'number' || !Number.isInteger(s.stocks) || s.stocks < 1 || s.stocks > 5) return null;
  if (!Array.isArray(s.cpus) || s.cpus.length > MATCH.maxFighters - 1 || !s.cpus.every(isBotLevel)) return null;
  const r = s.rules && typeof s.rules === 'object' ? (s.rules as Record<string, unknown>) : {};
  const cpuTeams = Array.isArray(s.cpuTeams) ? s.cpuTeams : [];
  if (!cpuTeams.every(isTeam)) return null;
  return {
    stage: s.stage,
    stagePick: s.stagePick === true,
    stocks: s.stocks,
    cpus: [...s.cpus],
    rules: { moonJump: r.moonJump === true, oneHit: r.oneHit === true },
    teams: s.teams === true,
    friendlyFire: s.friendlyFire === true,
    // One team per CPU; a missing one starts on the first team.
    cpuTeams: s.cpus.map((_c, i) => (cpuTeams[i] as number | undefined) ?? 0),
  };
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
      return 'profile' in msg ? { t: 'create', profile: parseProfile(msg.profile) } : { t: 'create' };
    case 'leave':
    case 'start':
      return { t: msg.t };
    case 'join':
      if (typeof msg.code !== 'string' || !/^\d{2}$/.test(msg.code)) return null;
      return 'profile' in msg ? { t: 'join', code: msg.code, profile: parseProfile(msg.profile) } : { t: 'join', code: msg.code };
    case 'relay':
      return 'data' in msg ? { t: 'relay', data: msg.data } : null;
    case 'pick':
    {
      if (!isFighterId(msg.fighter) || typeof msg.ready !== 'boolean') return null;
      const pick: ClientMessage = { t: 'pick', fighter: msg.fighter, ready: msg.ready };
      if (isTeam(msg.team)) pick.team = msg.team;
      if ('bans' in msg) pick.bans = parseBans(msg.bans);
      return pick;
    }
    case 'settings': {
      const settings = parseSettings(msg.settings);
      return settings ? { t: 'settings', settings } : null;
    }
    case 'in':
      if (!isInputBits(msg.b)) return null;
      return isSeq(msg.s) ? { t: 'in', b: msg.b, s: msg.s } : { t: 'in', b: msg.b };
    default:
      return null;
  }
}
