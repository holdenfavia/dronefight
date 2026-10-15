import type { MatchPhase, ServerMessage } from '../../../shared/protocol.js';
import type { BoxCollider } from '../../../shared/raycast.js';
import type { PropField } from '../../../shared/props.js';
import type { Pilot } from './pilot.js';

export type Emit = (msg: ServerMessage, opts?: { to?: string; except?: string }) => void;

/**
 * What the projectile modules (bullets, missiles, grenades) see of their match. The map and its props can
 * change with the room settings, so these are read live, never kept.
 */
export interface MatchContext {
  readonly pilots: ReadonlyMap<string, Pilot>;
  readonly phase: MatchPhase;
  readonly colliders: readonly BoxCollider[];
  readonly props: PropField;
  readonly emit: Emit;
  /** Damage a pilot through the match's rules (shield, friendly fire, kill credit). */
  hit(shooterId: string | null, damage: number, target: Pilot, now: number): void;
}

/** Positions on the wire: to the centimetre. */
export const cm = (n: number): number => Math.round(n * 100) / 100;
