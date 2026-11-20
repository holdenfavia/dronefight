// Stages (ADR-0070): one solid main platform, optional pass-through platforms, blast zones.

export type StageId = 'rooftop' | 'helipad' | 'cranes' | 'harvest' | 'village';

/** Every stage the sim knows. Seasonal ones (ADR-0082) are offered only while their event is on (shared/seasons.ts). */
export const STAGE_IDS: readonly StageId[] = ['rooftop', 'helipad', 'cranes', 'harvest', 'village'];

/** Seasonal stages (ADR-0082): which event each belongs to is in shared/seasons.ts. */
export const SEASONAL_STAGE_IDS: readonly StageId[] = ['harvest', 'village'];

export interface Platform {
  x1: number;
  x2: number;
  /** Standing surface. */
  y: number;
  /** Solid platforms block from every side down to this depth; soft ones only from above. */
  solid: boolean;
  depth: number;
}

export interface StageDef {
  id: StageId;
  name: string;
  blurb: string;
  platforms: Platform[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** Where fighters start, by slot. */
  spawns: { x: number; y: number }[];
  /**
   * The part of the stage the camera frames when everyone is close (defaults to the main platform). For ground
   * stages, whose floor runs past the side blast zones.
   */
  view?: { x1: number; x2: number };
}

const BLAST = { left: -1020, right: 1020, top: 820, bottom: -520 };

export const STAGES: Record<StageId, StageDef> = {
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop',
    blurb: 'A downtown roof with three girders.',
    platforms: [
      { x1: -380, x2: 380, y: 0, solid: true, depth: 90 },
      { x1: -270, x2: -120, y: 125, solid: false, depth: 10 },
      { x1: 120, x2: 270, y: 125, solid: false, depth: 10 },
      { x1: -75, x2: 75, y: 240, solid: false, depth: 10 },
    ],
    blast: BLAST,
    spawns: [{ x: -200, y: 0 }, { x: 200, y: 0 }, { x: -70, y: 0 }, { x: 70, y: 0 }],
  },
  helipad: {
    id: 'helipad',
    name: 'Helipad',
    blurb: 'One flat pad. Nowhere to hide.',
    platforms: [{ x1: -420, x2: 420, y: 0, solid: true, depth: 70 }],
    blast: BLAST,
    spawns: [{ x: -220, y: 0 }, { x: 220, y: 0 }, { x: -80, y: 0 }, { x: 80, y: 0 }],
  },
  cranes: {
    id: 'cranes',
    name: 'Crane Yard',
    blurb: 'A narrow deck and two high crane arms.',
    platforms: [
      { x1: -300, x2: 300, y: 0, solid: true, depth: 110 },
      { x1: -440, x2: -230, y: 170, solid: false, depth: 10 },
      { x1: 230, x2: 440, y: 170, solid: false, depth: 10 },
    ],
    blast: BLAST,
    spawns: [{ x: -180, y: 0 }, { x: 180, y: 0 }, { x: -340, y: 170 }, { x: 340, y: 170 }],
  },
  // Seasonal, Thanksgiving (ADR-0082). Owner's request: on the ground, so there's no falling off: the floor runs
  // past both side blast zones and you can only be knocked out off the left, the right or the top.
  harvest: {
    id: 'harvest',
    name: 'Harvest Farm',
    blurb: 'A fall farm on solid ground: no falling, only out the sides or the top.',
    platforms: [
      { x1: -1400, x2: 1400, y: 0, solid: true, depth: 240 },
      // Hay bales on the left, a hay wagon on the right, an oak bough up high.
      { x1: -310, x2: -150, y: 100, solid: false, depth: 10 },
      { x1: 150, x2: 330, y: 115, solid: false, depth: 10 },
      { x1: -100, x2: 110, y: 235, solid: false, depth: 10 },
    ],
    blast: BLAST,
    spawns: [{ x: -220, y: 0 }, { x: 220, y: 0 }, { x: -80, y: 0 }, { x: 80, y: 0 }],
    view: { x1: -440, x2: 440 },
  },
  // Seasonal, Christmas (ADR-0091): a snowy village square at dusk. A raised square with a big tree behind it, a
  // market-stall roof low on the left, a parked sleigh low on the right and a garland of lights strung up high.
  village: {
    id: 'village',
    name: 'Winter Village',
    blurb: 'A snowy village square: a market stall, a sleigh and a garland of lights.',
    platforms: [
      { x1: -390, x2: 390, y: 0, solid: true, depth: 100 },
      { x1: -300, x2: -150, y: 110, solid: false, depth: 10 },
      { x1: 150, x2: 310, y: 95, solid: false, depth: 10 },
      { x1: -110, x2: 110, y: 225, solid: false, depth: 10 },
    ],
    blast: BLAST,
    spawns: [{ x: -210, y: 0 }, { x: 210, y: 0 }, { x: -70, y: 0 }, { x: 70, y: 0 }],
  },
};

/** Left and right edges of the main stage, for bots and the camera. */
export function mainPlatform(stage: StageDef): Platform {
  return stage.platforms[0]!;
}
