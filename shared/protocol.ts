// Room protocol (ADR-0005, ADR-0070). For now the server only groups players by two-digit room code and
// relays messages between them; online fights will send inputs through this.

export type ClientMessage =
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'relay'; data: unknown };

export type ServerMessage =
  | { t: 'hello'; protocol: number }
  | { t: 'room'; code: string; you: number; members: number[] }
  | { t: 'relay'; from: number; data: unknown }
  | { t: 'error'; code: 'bad-message' | 'no-room' | 'room-full' | 'no-codes'; message: string };

export const ROOM_CODE_DIGITS = 2;
export const MAX_ROOM_MEMBERS = 4;

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
      return { t: msg.t };
    case 'join':
      return typeof msg.code === 'string' && /^\d{2}$/.test(msg.code) ? { t: 'join', code: msg.code } : null;
    case 'relay':
      return 'data' in msg ? { t: 'relay', data: msg.data } : null;
    default:
      return null;
  }
}
