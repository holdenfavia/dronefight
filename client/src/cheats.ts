// Cheat codes (ADR-0077). Tap Space three times quickly on any menu to open the code box, then type a code.
// Each code toggles: type it again to turn it off. They stay on in this browser until turned off.
// To add a code: add an entry to CHEATS, then read it with cheatOn(key) where it takes effect.

import type { FighterId } from '../../shared/fighter/fighters';
import { FIGHTER_IDS, SECRET_FIGHTER_IDS } from '../../shared/fighter/fighters';
import type { MatchRules } from '../../shared/fighter/sim';
import type { StageId } from '../../shared/fighter/stages';
import { activeSeasons, availableStages, randomPool, seasonalFighters, type SeasonDef } from '../../shared/seasons';

export type CheatKey = 'river' | 'bigHead' | 'moonJump' | 'turbo' | 'oneHit' | 'purple' | 'mirror' | 'seasons';

export interface Cheat {
  key: CheatKey;
  /** What you type (letters only, any case). */
  code: string;
  /** Shown when it turns on and in the list of active cheats. */
  name: string;
  on: string;
  off: string;
  /** A rule of the fight: sent with the host's room settings so the whole room plays by it. */
  rule?: keyof MatchRules;
  /** Unlocks this secret fighter on the roster. */
  fighter?: FighterId;
}

export const CHEATS: readonly Cheat[] = [
  { key: 'river', code: 'RIVER', name: 'River', fighter: 'river', on: 'River joins the roster!', off: 'River went home.' },
  { key: 'bigHead', code: 'BIGHEAD', name: 'Big heads', on: 'Big heads!', off: 'Heads back to normal.' },
  { key: 'moonJump', code: 'MOONJUMP', name: 'Moon jump', rule: 'moonJump', on: 'Moon jump: low gravity.', off: 'Gravity is back.' },
  { key: 'turbo', code: 'TURBO', name: 'Turbo', on: 'Turbo: 1.5x speed (offline fights).', off: 'Normal speed.' },
  { key: 'oneHit', code: 'ONEHIT', name: 'One hit', rule: 'oneHit', on: 'One hit: every hit is a KO.', off: 'Hits are normal again.' },
  { key: 'purple', code: 'PURPLE', name: 'Purple sky', on: 'Purple sky, all day.', off: 'The sky is back to normal.' },
  { key: 'mirror', code: 'MIRROR', name: 'Mirror', on: 'Mirror world: everything is flipped.', off: 'The world is back the right way.' },
  { key: 'seasons', code: 'SEASONS', name: 'Every season', on: 'Every seasonal event is on, all year.', off: 'Seasonal events follow the calendar again.' },
];

const STORAGE_KEY = 'dronefight.cheats.v1';

function load(): Set<CheatKey> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return new Set();
    return new Set(CHEATS.map((c) => c.key).filter((k) => raw.includes(k)));
  } catch {
    return new Set();
  }
}

const active = load();
const listeners: (() => void)[] = [];

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...active]));
  } catch {
    // Private mode: cheats last until the page closes.
  }
}

export function cheatOn(key: CheatKey): boolean {
  return active.has(key);
}

export function activeCheats(): Cheat[] {
  return CHEATS.filter((c) => active.has(c.key));
}

/** Call when any cheat turns on or off. */
export function onCheatsChange(fn: () => void): void {
  listeners.push(fn);
}

/** Try a typed code. Returns what happened, or null when no cheat has that code. */
export function enterCode(typed: string): { cheat: Cheat; on: boolean } | null {
  const code = typed.toUpperCase().replace(/[^A-Z]/g, '');
  const cheat = CHEATS.find((c) => c.code === code);
  if (!cheat) return null;
  const on = !active.has(cheat.key);
  if (on) active.add(cheat.key);
  else active.delete(cheat.key);
  save();
  for (const fn of listeners) fn();
  return { cheat, on };
}

/** The fight rules the active cheats turn on (offline fights, and online when you host). */
export function cheatRules(): MatchRules {
  const rules: MatchRules = {};
  for (const c of activeCheats()) if (c.rule) rules[c.rule] = true;
  return rules;
}

/** Seasonal events on right now (ADR-0082): by the calendar, or all of them with the SEASONS code. */
export function seasonsNow(): SeasonDef[] {
  return activeSeasons(new Date(), active.has('seasons'));
}

/** The roster on this computer: everyone, the fighters of the events on now, and the secret fighters it has unlocked. */
export function rosterIds(): FighterId[] {
  return [
    ...FIGHTER_IDS,
    ...seasonalFighters(seasonsNow()),
    ...SECRET_FIGHTER_IDS.filter((id) => CHEATS.some((c) => c.fighter === id && active.has(c.key))),
  ];
}

/** Stages to pick from on this computer: the everyday ones, then the events' on now. */
export function stageIds(): StageId[] {
  return availableStages(seasonsNow());
}

/** Who Random draws from here: the everyday cast plus the events' fighters on now. */
export function randomFighters(): FighterId[] {
  return randomPool(seasonsNow());
}

/** Three quick taps of Space open the code box. Returns true on the third. */
export class TripleTap {
  private times: number[] = [];

  constructor(private windowMs: number) {}

  tap(now: number): boolean {
    this.times = [...this.times.filter((t) => now - t <= this.windowMs * 2), now].slice(-3);
    const [a, b, c] = this.times;
    if (a !== undefined && b !== undefined && c !== undefined && b - a <= this.windowMs && c - b <= this.windowMs) {
      this.times = [];
      return true;
    }
    return false;
  }
}
