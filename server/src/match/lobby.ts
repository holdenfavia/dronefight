import type { MatchPhase } from '../../../shared/protocol.js';
import type { Side } from '../../../shared/roomOptions.js';
import { refit, type Pilot } from './pilot.js';

/** Teams, color slots and the pre-match menu (ADR-0026, ADR-0047). */

/** A match runs with at least this many pilots (ADR-0026). */
export const MIN_PILOTS = 2;

/** The lowest color slot nobody has (free-for-all, ADR-0026). */
export function freeSlot(pilots: ReadonlyMap<string, Pilot>): number {
  const used = new Set([...pilots.values()].map((p) => p.team));
  let team = 0;
  while (used.has(team)) team++;
  return team;
}

/** The team with fewer pilots (Orange on a tie), for someone joining. */
export function smallerSide(pilots: ReadonlyMap<string, Pilot>): Side {
  let a = 0;
  let b = 0;
  for (const p of pilots.values()) p.side === 0 ? a++ : b++;
  return b < a ? 1 : 0;
}

/** Two pilots on the same team (never friendly fire). */
export function teammates(teams: boolean, a: Pilot, b: Pilot): boolean {
  return teams && a !== b && a.side === b.side;
}

/** Color slots and teams after the mode changes: Teams splits everyone evenly; free-for-all gives each their own color. */
export function reassignColors(pilots: ReadonlyMap<string, Pilot>, teams: boolean): void {
  let i = 0;
  for (const p of pilots.values()) {
    if (teams) {
      p.side = (i++ % 2) as Side;
      p.team = p.side;
    } else p.team = -1;
  }
  if (!teams) for (const p of pilots.values()) p.team = freeSlot(pilots);
}

/** Whether the host can start now: two pilots, and in Teams someone on each team. */
export function canStart(pilots: ReadonlyMap<string, Pilot>, phase: MatchPhase, teams: boolean): boolean {
  if (phase === 'playing' || pilots.size < MIN_PILOTS) return false;
  if (!teams) return true;
  const sides = new Set([...pilots.values()].map((p) => p.side));
  return sides.size === 2;
}

/** After the results, a pilot is back in the pre-match menu (ADR-0047): flying free, not ready, no score. */
export function backInLobby(p: Pilot, now: number): void {
  p.score = 0;
  p.ready = false;
  refit(p);
  p.protectedUntil = now;
}
