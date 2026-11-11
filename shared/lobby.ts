// Online lobby state (ADR-0075). Each member tells the others its pick through the room relay
// (ADR-0005); the server never reads it. Online fights wait for the netcode decision (roadmap, Phase 2).

import { FIGHTER_IDS, type FighterId } from './fighter/fighters.js';

/** What one member of a room has chosen. */
export interface LobbyPick {
  fighter: FighterId;
  ready: boolean;
}

/** Messages members relay to each other. */
export type LobbyMessage = { t: 'pick'; fighter: FighterId; ready: boolean };

/** Accept only a well-formed lobby message from another member. */
export function parseLobbyMessage(data: unknown): LobbyMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.t !== 'pick') return null;
  if (typeof m.fighter !== 'string' || !(FIGHTER_IDS as readonly string[]).includes(m.fighter)) return null;
  if (typeof m.ready !== 'boolean') return null;
  return { t: 'pick', fighter: m.fighter as FighterId, ready: m.ready };
}

/** The member who will host the fight: the one who has been in the room longest. */
export function lobbyHost(members: readonly number[]): number {
  return members.length ? Math.min(...members) : -1;
}
