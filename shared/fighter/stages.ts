// Stages (ADR-0070): one solid main platform, optional pass-through platforms, blast zones.

export type StageId = 'rooftop' | 'helipad' | 'cranes';

export const STAGE_IDS: readonly StageId[] = ['rooftop', 'helipad', 'cranes'];

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
};

/** Left and right edges of the main stage, for bots and the camera. */
export function mainPlatform(stage: StageDef): Platform {
  return stage.platforms[0]!;
}
