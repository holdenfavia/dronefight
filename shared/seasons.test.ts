import { describe, expect, it } from 'vitest';
import { ALL_FIGHTER_IDS, FIGHTER_IDS, SEASONAL_FIGHTER_IDS } from './fighter/fighters.js';
import { SEASONAL_STAGE_IDS, STAGE_IDS, STAGES } from './fighter/stages.js';
import { activeSeasons, availableStages, inSeason, randomPool, SEASON_IDS, SEASONS, seasonDay, seasonOfFighter, seasonOfStage, seasonalFighters } from './seasons.js';

/** Noon US Central on a day of 2026. */
const day = (month: number, d: number) => new Date(Date.UTC(2026, month - 1, d, 18, 0, 0));

describe('seasonal events (ADR-0082)', () => {
  it('Thanksgiving runs through November, US Central time', () => {
    expect(activeSeasons(day(11, 1)).map((s) => s.id)).toEqual(['thanksgiving']);
    expect(activeSeasons(day(11, 26)).map((s) => s.id)).toEqual(['thanksgiving']);
    expect(activeSeasons(day(11, 30)).map((s) => s.id)).toEqual(['thanksgiving']);
    expect(activeSeasons(day(10, 31))).toEqual([]);
    expect(activeSeasons(day(12, 1))).toEqual([]);
    // 11 pm Nov 30 in Chicago is already Dec 1 in UTC: still on.
    expect(activeSeasons(new Date(Date.UTC(2026, 11, 1, 5, 0, 0))).map((s) => s.id)).toEqual(['thanksgiving']);
    expect(seasonDay(new Date(Date.UTC(2026, 11, 1, 5, 0, 0)))).toEqual({ month: 11, day: 30 });
  });

  it('windows can wrap the new year (for a Christmas or New Year event)', () => {
    const wrap = { ...SEASONS.thanksgiving, start: { month: 12, day: 20 }, end: { month: 1, day: 5 } };
    expect(inSeason(wrap, { month: 12, day: 25 })).toBe(true);
    expect(inSeason(wrap, { month: 1, day: 3 })).toBe(true);
    expect(inSeason(wrap, { month: 1, day: 6 })).toBe(false);
    expect(inSeason(wrap, { month: 12, day: 19 })).toBe(false);
  });

  it('the SEASONS code turns every event on', () => {
    expect(activeSeasons(day(6, 1), true).map((s) => s.id)).toEqual(SEASON_IDS);
  });

  it('every seasonal fighter and stage belongs to exactly one event, and the sim knows it', () => {
    for (const id of SEASONAL_FIGHTER_IDS) {
      expect(SEASON_IDS.filter((s) => SEASONS[s].fighters.includes(id)), id).toHaveLength(1);
      expect(ALL_FIGHTER_IDS).toContain(id);
      expect(FIGHTER_IDS).not.toContain(id);
    }
    for (const id of SEASONAL_STAGE_IDS) {
      expect(SEASON_IDS.filter((s) => SEASONS[s].stages.includes(id)), id).toHaveLength(1);
      expect(STAGES[id].name, id).toBeTruthy();
      expect(STAGE_IDS).toContain(id);
    }
    for (const s of SEASON_IDS) {
      for (const f of SEASONS[s].fighters) expect(SEASONAL_FIGHTER_IDS).toContain(f);
      for (const st of SEASONS[s].stages) expect(SEASONAL_STAGE_IDS).toContain(st);
    }
    expect(seasonOfFighter('brawler')).toBeNull();
    expect(seasonOfFighter('turkey')?.id).toBe('thanksgiving');
    expect(seasonOfStage('harvest')?.id).toBe('thanksgiving');
    expect(seasonOfStage('rooftop')).toBeNull();
  });

  it('in season, the event joins the roster, the stages and the Random pool; out of season it does not', () => {
    const on = activeSeasons(day(11, 20));
    expect(seasonalFighters(on)).toEqual(['turkey', 'pilgrim', 'firstlight']);
    expect(availableStages(on)).toContain('harvest');
    expect(randomPool(on)).toEqual(expect.arrayContaining(['turkey', 'pilgrim', 'firstlight', 'brawler']));
    expect(randomPool(on)).not.toContain('river');
    const off = activeSeasons(day(3, 1));
    expect(seasonalFighters(off)).toEqual([]);
    expect(availableStages(off)).not.toContain('harvest');
    expect(randomPool(off)).toEqual([...FIGHTER_IDS]);
  });
});
