// Seasonal events (ADR-0082): fighters and stages that join the game for part of the year, tagged Seasonal.
// Thanksgiving (ADR-0082) and Christmas (ADR-0091).
//
// To add an event: add its id to SeasonId and an entry to SEASONS (dates, fighters, stages, colors). Its fighters
// go in SEASONAL_FIGHTER_IDS (shared/fighter/fighters.ts) and its stages in SEASONAL_STAGE_IDS (stages.ts).
// The menus, Random and CPUs pick them up from here.
//
// The fight sim never reads the date (Hard rule 2): which fighters and stages are offered is decided on the menus
// (and by the room server for CPU picks). The sim knows every seasonal fighter and stage all year, so a match
// started on the last evening of an event plays out the same everywhere.

import { FIGHTER_IDS, type FighterId } from './fighter/fighters.js';
import { STAGE_IDS, SEASONAL_STAGE_IDS, type StageId } from './fighter/stages.js';
import { SEASONAL_FIGHTER_IDS } from './fighter/fighters.js';

export type SeasonId = 'thanksgiving' | 'christmas';

/** A day of the year: month 1-12, day 1-31. */
export interface MonthDay {
  month: number;
  day: number;
}

export interface SeasonDef {
  id: SeasonId;
  /** "Thanksgiving". */
  name: string;
  /** One line for the menu banner. */
  blurb: string;
  /** First and last day it's on, inclusive, in SEASON_TIMEZONE. May wrap the new year (Dec 20 to Jan 5). */
  start: MonthDay;
  end: MonthDay;
  fighters: readonly FighterId[];
  stages: readonly StageId[];
  /** The Seasonal tag and banner colors. */
  color: string;
  accent: string;
}

/** Every player sees the same event on the same day (the same zone as the purple sky, ADR-0069). */
export const SEASON_TIMEZONE = 'America/Chicago';

export const SEASONS: Record<SeasonId, SeasonDef> = {
  thanksgiving: {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    blurb: 'Turkey, Pilgrim and Chief join the fight, on the Harvest Farm.',
    start: { month: 11, day: 1 },
    end: { month: 11, day: 30 },
    fighters: ['turkey', 'pilgrim', 'firstlight'],
    stages: ['harvest'],
    color: '#d9722b',
    accent: '#ffcf7a',
  },
  christmas: {
    id: 'christmas',
    name: 'Christmas',
    blurb: 'Snowman, Nutcracker, Elf, Santa, Reindeer and Gingerbread join the fight, in the Winter Village.',
    start: { month: 12, day: 1 },
    end: { month: 12, day: 31 },
    fighters: ['snowman', 'nutcracker', 'elf', 'santa', 'reindeer', 'gingerbread'],
    stages: ['village'],
    color: '#c8283c',
    accent: '#bfe8ff',
  },
};

export const SEASON_IDS = Object.keys(SEASONS) as SeasonId[];

const dayClock = new Intl.DateTimeFormat('en-US', { timeZone: SEASON_TIMEZONE, month: 'numeric', day: 'numeric' });

/** Today's month and day in SEASON_TIMEZONE. */
export function seasonDay(now: Date = new Date()): MonthDay {
  let month = 1;
  let day = 1;
  for (const p of dayClock.formatToParts(now)) {
    if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
  }
  return { month, day };
}

function key(d: MonthDay): number {
  return d.month * 100 + d.day;
}

/** Is this day inside the event's window (which may wrap the new year)? */
export function inSeason(season: SeasonDef, today: MonthDay): boolean {
  const t = key(today);
  const a = key(season.start);
  const b = key(season.end);
  return a <= b ? t >= a && t <= b : t >= a || t <= b;
}

/** The events on right now. `all` turns every event on (the SEASONS cheat code). */
export function activeSeasons(now: Date = new Date(), all = false): SeasonDef[] {
  const today = seasonDay(now);
  return SEASON_IDS.map((id) => SEASONS[id]).filter((s) => all || inSeason(s, today));
}

/** The event a fighter belongs to, or null for the everyday cast. */
export function seasonOfFighter(id: FighterId): SeasonDef | null {
  return SEASON_IDS.map((s) => SEASONS[s]).find((s) => s.fighters.includes(id)) ?? null;
}

/** The event a stage belongs to, or null for the everyday stages. */
export function seasonOfStage(id: StageId): SeasonDef | null {
  return SEASON_IDS.map((s) => SEASONS[s]).find((s) => s.stages.includes(id)) ?? null;
}

/** Seasonal fighters on the roster right now. */
export function seasonalFighters(seasons: readonly SeasonDef[]): FighterId[] {
  return SEASONAL_FIGHTER_IDS.filter((id) => seasons.some((s) => s.fighters.includes(id)));
}

/** Stages to pick from right now: the everyday ones, then the events'. */
export function availableStages(seasons: readonly SeasonDef[]): StageId[] {
  return STAGE_IDS.filter((id) => !SEASONAL_STAGE_IDS.includes(id) || seasons.some((s) => s.stages.includes(id)));
}

/** Who Random and CPUs draw from: the everyday cast plus the events' fighters (never secret ones). */
export function randomPool(seasons: readonly SeasonDef[]): FighterId[] {
  return [...FIGHTER_IDS, ...seasonalFighters(seasons)];
}
