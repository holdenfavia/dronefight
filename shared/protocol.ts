import type { DroneClassId } from './drones.js';
import { cleanLoadout, type Loadout } from './loadout.js';
import { isWeaponId, type WeaponId } from './weapons.js';
import type { XpReason } from './progression.js';
import { isMapId, type MapId } from './maps/index.js';
import { cleanRoomOptions, type RoomOptions } from './roomOptions.js';
import { completeLooks, type DroneLook } from './cosmetics.js';

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
  /** Free-for-all rooms (ADR-0026). */
  maxPlayersPerRoom: 10,
  pingIntervalMs: 1000,
} as const;

/** No 0/O or 1/I, so codes are easy to read out over the phone. */
/** Room codes are two digits (ADR-0005): easy to read out on a call; 100 rooms is plenty for friends. */
export const ROOM_CODE_ALPHABET = '0123456789';
export const ROOM_CODE_LENGTH = 2;
export const ROOM_CODE_COUNT = ROOM_CODE_ALPHABET.length ** ROOM_CODE_LENGTH;

export function normalizeRoomCode(input: string): string {
  return input.replace(/[^0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
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
  /** The missile you're flying (ADR-0025): id, position xyz, velocity xyz. */
  k?: [number, number, number, number, number, number, number];
}

/** One round fired (ADR-0009). */
export interface Shot {
  /** Sender's estimate of server time at the moment of firing. */
  ts: number;
  /** Muzzle position. */
  p: Vec3;
  /** Normalized direction. */
  d: Vec3;
  /** Which hardpoint weapon fired (ADR-0033). `missile` and `grenade` launch one, with the shooter's id `rid`. */
  w: WeaponId;
  rid?: number;
}

export type MatchPhase = 'waiting' | 'playing' | 'ended';

export interface MatchPlayer {
  id: string;
  /** Color slot 0..9 (ADR-0026): 0 = orange, 1 = lime, … */
  team: number;
  /** Current drone body (ADR-0013) and its full loadout (ADR-0033), for models, sounds and the scoreboard. */
  drone: DroneClassId;
  loadout: Loadout;
  score: number;
  hp: number;
  alive: boolean;
  /** Spawn protection active. */
  protected: boolean;
  /** Shield up (ADR-0033). */
  shielded?: boolean;
  /** Level, for signed-in pilots (ADR-0032). */
  level?: number;
  /** Paint for the body they fly (ADR-0030), if they sent one. */
  look?: DroneLook;
}

export interface MatchState {
  /** The room's map (ADR-0012). */
  map: MapId;
  /** Destroyed props, by index into the map's props (ADR-0023). */
  props: number[];
  phase: MatchPhase;
  players: MatchPlayer[];
  winner: string | null;
  killsToWin: number;
  /** The room's match settings (ADR-0046), and who may change them (the creator, or the next pilot if they leave). */
  options: RoomOptions;
  host: string | null;
  /** Server time the match ends by time limit, if it has one. */
  endsAt?: number;
}

// ---- Client -> server

export type ClientMessage =
  /** Create a room with these match settings (ADR-0046). */
  | { t: 'create'; map: MapId; options?: RoomOptions }
  /** Your paint for every body (ADR-0030), so others see it on whichever you fly. */
  | { t: 'looks'; looks: Record<DroneClassId, DroneLook> }
  /** The host changes the room's match settings (ADR-0046): the match restarts with them. */
  | { t: 'options'; options: RoomOptions }
  /** `map` only when rejoining after a dropped connection: recreate the room with this code if it's gone (e.g. a server restart). */
  | { t: 'join'; room: string; map?: MapId }
  | { t: 'leave' }
  | { t: 'state'; s: DroneState }
  | { t: 'shot'; s: Shot }
  /** Choose a drone class; applies at the next respawn during a match (ADR-0013). */
  /** Your loadout (ADR-0033); in a match it applies at your next respawn. */
  | { t: 'loadout'; loadout: Loadout }
  /** Who you are, for XP (ADR-0032): your Supabase access token. Optional; guests never send it. */
  | { t: 'auth'; token: string }
  /** Blow up the missile you're flying, here (ADR-0025). */
  | { t: 'detonate'; rid: number; p: Vec3; w?: 'grenade' }
  /** Use a class ability at a position (3D smoke, ADR-0024). */
  | { t: 'ability'; kind: 'smoke' | 'shield'; p: Vec3 }
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
  /** `o`: offset (x, z metres) beside the spawn when another pilot is on it (ADR-0026). */
  | { t: 'respawn'; id: string; spawn: number; loadout: Loadout; o?: [number, number] }
  | { t: 'match'; m: MatchState }
  /** Someone used an ability (ADR-0016). */
  | { t: 'ability'; id: string; kind: 'smoke' | 'shield'; p: Vec3 }
  /** A missile exploded here (server-decided, ADR-0016). `id` is the shooter, `rid` their missile id. */
  | { t: 'boom'; id: string; rid: number; p: Vec3; kind?: 'grenade' }
  /** Where a grenade is now (ADR-0034), ~20/s while it's out. */
  | { t: 'grenade'; id: string; rid: number; p: Vec3 }
  /** Where a guided missile is now (sent ~20x/s while it flies). */
  | { t: 'missile'; id: string; rid: number; p: Vec3; v: Vec3 }
  /** Your sign-in was accepted for XP (ADR-0032): your total so far. */
  | { t: 'progress'; xp: number }
  /** You earned XP (ADR-0032): how much, for what, and your new total. */
  | { t: 'xp'; gained: number; reason: XpReason; xp: number }
  /** Prop `i` exploded at `p`, set off by `by` (ADR-0023). */
  | { t: 'prop'; i: number; p: Vec3; by: string | null };

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
    typeof s.crashed === 'boolean' &&
    (s.k === undefined || isVec(s.k, 7))
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
    case 'create': {
      const map = isMapId(m.map) ? m.map : 'downtown';
      return m.options !== undefined ? { t: 'create', map, options: cleanRoomOptions(m.options, map) } : { t: 'create', map };
    }
    case 'looks':
      return typeof m.looks === 'object' && m.looks !== null ? { t: 'looks', looks: completeLooks(m.looks) } : null;
    case 'options':
      return typeof m.options === 'object' && m.options !== null ? { t: 'options', options: cleanRoomOptions(m.options) } : null;
    case 'leave':
      return { t: 'leave' };
    case 'join':
      if (typeof m.room !== 'string') return null;
      return isMapId(m.map) ? { t: 'join', room: normalizeRoomCode(m.room), map: m.map } : { t: 'join', room: normalizeRoomCode(m.room) };
    case 'state':
      return isDroneState(m.s) ? { t: 'state', s: m.s } : null;
    case 'ping':
      return isNum(m.id) && isNum(m.ct) ? { t: 'ping', id: m.id, ct: m.ct } : null;
    case 'auth':
      return typeof m.token === 'string' && m.token.length > 0 && m.token.length <= 4096 ? { t: 'auth', token: m.token } : null;
    case 'detonate':
      if (!isNum(m.rid) || !isVec(m.p, 3)) return null;
      return m.w === 'grenade' ? { t: 'detonate', rid: m.rid, p: m.p as Vec3, w: 'grenade' } : { t: 'detonate', rid: m.rid, p: m.p as Vec3 };
    case 'ability':
      return (m.kind === 'smoke' || m.kind === 'shield') && isVec(m.p, 3) ? { t: 'ability', kind: m.kind, p: m.p as Vec3 } : null;
    case 'loadout':
      return typeof m.loadout === 'object' && m.loadout !== null ? { t: 'loadout', loadout: cleanLoadout(m.loadout) } : null;
    case 'shot': {
      const s = m.s as Record<string, unknown> | null;
      if (typeof s !== 'object' || s === null || !isNum(s.ts) || !isVec(s.p, 3) || !isVec(s.d, 3)) return null;
      const d = s.d as Vec3;
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 0.5 || len > 1.5) return null;
      if (!isWeaponId(s.w)) return null;
      const shot: Shot = { ts: s.ts, p: s.p as Vec3, d: [d[0] / len, d[1] / len, d[2] / len], w: s.w };
      if (s.w === 'missile' || s.w === 'grenade') {
        if (!isNum(s.rid)) return null;
        shot.rid = s.rid;
      }
      return { t: 'shot', s: shot };
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
