import { isDroneClassId, type DroneClassId } from './drones.js';
import { isMapId, type MapId } from './maps/index.js';

// Network protocol shared by client and server (ADR-0002, ADR-0004, ADR-0005).
// JSON over WebSocket. Times are milliseconds on the server's clock unless noted.

export const NET = {
  /** Local drone state sends per second. */
  sendHz: 30,
  /** Remote drones render this far behind server time (ADR-0004: fixed ~100 ms buffer). */
  interpDelayMs: 100,
  /** How long to extrapolate past the newest snapshot before holding still. */
  maxExtrapolateMs: 150,
  /** Snapshots further apart than this are a gap: snap to the newer one instead of sliding across. */
  gapMs: 250,
  /** Snapshots kept per remote player. Bounded so nothing can ever back up (Hard rule 1). */
  bufferSize: 8,
  /** Hard rule 1: remote players are never shown more than this far behind. */
  maxDisplayDelayMs: 250,
  /** Server skips sending to a socket with more than this many bytes still unsent (drop, never queue). */
  maxBufferedBytes: 16 * 1024,
  maxPlayersPerRoom: 2,
  pingIntervalMs: 1000,
} as const;

/** No 0/O or 1/I, so codes are easy to read out over the phone. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** One drone's state as sent by its owner. */
export interface DroneState {
  /** Sender's estimate of server time when this state was produced. */
  ts: number;
  p: Vec3;
  q: Quat;
  v: Vec3;
  /** Motor output 0..1 (for sound/props later). */
  m: number;
  armed: boolean;
  crashed: boolean;
}

/** One round fired (ADR-0009). */
export interface Shot {
  /** Sender's estimate of server time at the moment of firing. */
  ts: number;
  /** Muzzle position. */
  p: Vec3;
  /** Normalized direction. */
  d: Vec3;
}

export type MatchPhase = 'waiting' | 'playing' | 'ended';

export interface MatchPlayer {
  id: string;
  /** 0 = orange, 1 = lime. */
  team: number;
  /** Current drone class (ADR-0013). */
  drone: DroneClassId;
  score: number;
  hp: number;
  alive: boolean;
  /** Spawn protection active. */
  protected: boolean;
}

export interface MatchState {
  /** The room's map (ADR-0012). */
  map: MapId;
  phase: MatchPhase;
  players: MatchPlayer[];
  winner: string | null;
  killsToWin: number;
}

// ---- Client -> server

export type ClientMessage =
  | { t: 'create'; map: MapId }
  | { t: 'join'; room: string }
  | { t: 'leave' }
  | { t: 'state'; s: DroneState }
  | { t: 'shot'; s: Shot }
  /** Choose a drone class; applies at the next respawn during a match (ADR-0013). */
  | { t: 'loadout'; drone: DroneClassId }
  | { t: 'ping'; id: number; ct: number };

// ---- Server -> client

export type ErrorCode = 'room-not-found' | 'room-full' | 'bad-message' | 'protocol';

export type ServerMessage =
  | { t: 'hello'; protocol: number; st: number }
  | { t: 'joined'; room: string; you: string; peers: string[]; map: MapId }
  | { t: 'peer-joined'; id: string }
  | { t: 'peer-left'; id: string }
  /** A peer's state, stamped with the server receive time `st`. */
  | { t: 'snap'; id: string; st: number; s: DroneState }
  | { t: 'pong'; id: number; ct: number; st: number }
  | { t: 'error'; code: ErrorCode; message: string }
  /** Another pilot fired (for drawing their tracers). */
  | { t: 'shot'; id: string; s: Shot }
  | { t: 'hit'; shooter: string; target: string; hp: number }
  | { t: 'death'; id: string; killer: string | null; cause: 'shot' | 'crash' }
  | { t: 'respawn'; id: string; spawn: number; drone: DroneClassId }
  | { t: 'match'; m: MatchState };

// ---- Validation (never trust the wire)

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isVec(x: unknown, n: number): boolean {
  return Array.isArray(x) && x.length === n && x.every(isNum);
}

export function isDroneState(x: unknown): x is DroneState {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    isNum(s.ts) &&
    isVec(s.p, 3) &&
    isVec(s.q, 4) &&
    isVec(s.v, 3) &&
    isNum(s.m) &&
    typeof s.armed === 'boolean' &&
    typeof s.crashed === 'boolean'
  );
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  switch (m.t) {
    case 'create':
      return { t: 'create', map: isMapId(m.map) ? m.map : 'downtown' };
    case 'leave':
      return { t: 'leave' };
    case 'join':
      return typeof m.room === 'string' ? { t: 'join', room: normalizeRoomCode(m.room) } : null;
    case 'state':
      return isDroneState(m.s) ? { t: 'state', s: m.s } : null;
    case 'ping':
      return isNum(m.id) && isNum(m.ct) ? { t: 'ping', id: m.id, ct: m.ct } : null;
    case 'loadout':
      return isDroneClassId(m.drone) ? { t: 'loadout', drone: m.drone } : null;
    case 'shot': {
      const s = m.s as Record<string, unknown> | null;
      if (typeof s !== 'object' || s === null || !isNum(s.ts) || !isVec(s.p, 3) || !isVec(s.d, 3)) return null;
      const d = s.d as Vec3;
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 0.5 || len > 1.5) return null;
      return { t: 'shot', s: { ts: s.ts, p: s.p as Vec3, d: [d[0] / len, d[1] / len, d[2] / len] } };
    }
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const msg = JSON.parse(raw) as { t?: unknown };
    return typeof msg === 'object' && msg !== null && typeof msg.t === 'string' ? (msg as ServerMessage) : null;
  } catch {
    return null;
  }
}
