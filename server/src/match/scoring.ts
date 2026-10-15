import { COMBAT } from '../../../shared/combat.js';
import type { Side } from '../../../shared/roomOptions.js';
import type { ProgressEvent } from '../progression.js';
import type { Pilot } from './pilot.js';

/** Damage, kill credit, team totals and XP events (ADR-0009, ADR-0032, ADR-0047). */

/** Finish and win XP need at least this many human pilots in the match (ADR-0067). */
const MIN_HUMANS_FOR_XP = 2;

export type Progress = (pilotId: string, event: ProgressEvent) => void;

/** Take damage off a pilot's health. A shield soaks damage first (ADR-0033). */
export function applyDamage(target: Pilot, rawDamage: number, now: number): void {
  let damage = rawDamage;
  if (target.shieldUntil > now && target.shieldHp > 0) {
    const absorbed = Math.min(target.shieldHp, damage);
    target.shieldHp -= absorbed;
    damage -= absorbed;
    if (target.shieldHp <= 0) target.shieldUntil = 0;
  }
  target.hp = Math.max(0, target.hp - damage);
}

/** Who gets the kill if this pilot dies now: whoever damaged them in the last 5 s and is still here (ADR-0009). */
export function recentAttacker(pilot: Pilot, pilots: ReadonlyMap<string, Pilot>, now: number): string | null {
  const by = pilot.lastDamagedBy;
  return by && now - pilot.lastDamagedAt <= COMBAT.killCreditMs && pilots.has(by) ? by : null;
}

/** XP (ADR-0032) for a death: the kill, and assists for anyone else who hurt them recently. */
export function deathProgress(pilots: ReadonlyMap<string, Pilot>, pilot: Pilot, killerId: string | null, now: number, progress: Progress): void {
  progress(pilot.id, 'death');
  if (killerId && pilots.has(killerId)) progress(killerId, 'kill');
  for (const [id, at] of pilot.damagedBy) {
    if (id !== killerId && id !== pilot.id && now - at <= COMBAT.killCreditMs && pilots.has(id)) progress(id, 'assist');
  }
}

/** XP at the end of a match: everyone still here finished it; the winner (or winning team) won it. */
export function endProgress(pilots: ReadonlyMap<string, Pilot>, humans: number, teams: boolean, winnerId: string | null, winSide: Side | null, progress: Progress): void {
  // Finishing and winning earn XP only against other people (ADR-0067).
  if (humans < MIN_HUMANS_FOR_XP) return;
  for (const p of pilots.values()) progress(p.id, 'finish');
  if (teams) {
    for (const p of pilots.values()) if (winSide !== null && p.side === winSide) progress(p.id, 'win');
  } else if (winnerId) progress(winnerId, 'win');
}

/** A team's kills (Teams mode). */
export function sideScore(pilots: ReadonlyMap<string, Pilot>, side: Side): number {
  let n = 0;
  for (const p of pilots.values()) if (p.side === side) n += p.score;
  return n;
}

/** Time's up (ADR-0046): the most kills wins; a tie at the top is a draw. */
export function timeUpResult(pilots: ReadonlyMap<string, Pilot>, teams: boolean): { winnerId: string | null; side: Side | null } {
  if (teams) {
    const a = sideScore(pilots, 0);
    const b = sideScore(pilots, 1);
    return { winnerId: null, side: a === b ? null : a > b ? 0 : 1 };
  }
  const ranked = [...pilots.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const tie = top && ranked[1] && ranked[1].score === top.score;
  return { winnerId: top && !tie ? top.id : null, side: null };
}
