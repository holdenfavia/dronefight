// Client look and feel (ADR-0070). Simulation tuning lives in shared/fighter/config.ts.

/** One color per slot: orange and lime first (ADR-0026). */
export const SLOT_COLORS = ['#ff6a13', '#9be22d', '#2ec5ff', '#ff4fa3'] as const;

/** Team battles (ADR-0081): every fighter on a team wears its color instead of the slot's. */
export const TEAM_COLORS = ['#ff3b30', '#2f7bff', '#36d15a', '#ffd21f'] as const;
export const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Yellow'] as const;

/** Free-for-all colors by slot for the fight on screen: the slot colors, or players' own (ADR-0083). */
let fightColors: readonly string[] = SLOT_COLORS;

/** Set the free-for-all colors by slot (shared/profile.ts resolveColors); no argument = the slot colors. */
export function setFightColors(colors: readonly string[] = SLOT_COLORS): void {
  fightColors = colors;
}

/** A fighter's color: its team's in a team battle, otherwise its slot's or its player's own. */
export function fighterColor(f: { slot: number; team: number }): string {
  return (f.team >= 0 ? TEAM_COLORS[f.team] : fightColors[f.slot] ?? SLOT_COLORS[f.slot]) ?? '#fff';
}

/** Menu layout (ADR-0075). */
export const MENU = {
  /** Height (px) of a fighter portrait on the roster grid. */
  tileSize: 52,
  /** Roster columns when the layout can't be measured. */
  rosterColumns: 6,
} as const;

/** CPU tag over a CPU's head (ADR-0075): muted so people stand out. */
export const CPU_TAG = {
  color: '#c9c6bf',
  /** Text size relative to a player's tag. */
  scale: 0.85,
} as const;

export const PALETTE = {
  orange: '#ff6a13',
  ink: '#141516',
  carbon: '#1d1f22',
  steel: '#3a3e44',
  metal: '#9aa0a6',
  white: '#eeeeea',
  skyTop: '#2a78d6',
  skyHorizon: '#ffd9a8',
  // The daily purple sky (ADR-0069).
  purpleTop: '#4b1d8f',
  purpleHorizon: '#d9b8ff',
} as const;

export const CAMERA = {
  /** World units shown vertically at zoom 1 (scaled to the window height). */
  baseHeight: 720,
  /** Space kept around the fighters. */
  padding: 230,
  minZoom: 0.42,
  maxZoom: 1.15,
  /** Fraction of the way to the target per frame. */
  follow: 0.08,
  /** Never frame anything past this far beyond the blast zones. */
  blastMargin: 60,
} as const;

export const FEEL = {
  /** Screen shake (px) per point of knockback. */
  shakePerKb: 0.09,
  maxShake: 26,
  shakeDecay: 0.86,
  /** Above this percent fighters start smoking. */
  smokePercent: 90,
} as const;

export const AUDIO = {
  master: 0.5,
} as const;


/** Attack looks (ADR-0071 follow-up): colors that tell attacks apart at a glance. */
export const ATTACK_COLORS = {
  /** Smash attacks burn hot. */
  smash: '#ffb020',
  smashCore: '#fff2b0',
  /** Spikes (sending down) are purple, so a meteor reads differently from a launcher. */
  spike: '#a46bff',
  grab: '#ffffff',
  counter: '#ffffff',
  /** Each fighter's specials have their own energy. */
  special: {
    brawler: '#ff3b3b', blade: '#bfe9ff', spark: '#3fd0ff', titan: '#c9934f',
    ninja: '#6f7bff', gunslinger: '#ffd23f', chef: '#ff7b54', ghost: '#c8fff0', yoyo: '#ff4fd8', bard: '#4dd4a8',
    river: '#b8e0ff',
    // Seasonal (ADR-0082).
    turkey: '#c8642b', pilgrim: '#e0b04a', firstlight: '#6fc3c9',
  },
  /** Status effects shown over a fighter. */
  curse: '#b06bff',
  slow: '#7fb8ff',
  haste: '#ffe066',
  /** The Brawler's full-rage hit. */
  rage: '#ff3b3b',
  /** A sword-tip hit. */
  tip: '#ffffff',
} as const;

/** Signature hits (ADR-0079): the popup and burst color when one lands. */
export const SIGNATURE_LOOKS: Record<string, { text: string; color: string }> = {
  kopunch: { text: 'KNOCKOUT!', color: '#ff3b3b' },
  flashcut: { text: 'FLASH CUT!', color: '#bfe9ff' },
  payback: { text: 'PAYBACK!', color: '#ffb36b' },
  assassinate: { text: 'ASSASSINATE!', color: '#6f7bff' },
  golden: { text: 'GOLDEN!', color: '#ffd23f' },
  thundergobble: { text: 'THUNDER GOBBLE!', color: '#ff8a3d' },
  cannon: { text: 'HARVEST CANNON!', color: '#e0b04a' },
  tidal: { text: 'TIDAL SWEEP!', color: '#6fc3c9' },
};

/** The Harvest Farm's autumn look (seasonal stage, ADR-0082). */
export const FALL = {
  skyTop: '#f2a65a',
  skyHorizon: '#ffd39a',
  skyBottom: '#ffe6c2',
  hillFar: '#d49a63',
  hillMid: '#b8743f',
  hillNear: '#8f5a2e',
  barn: '#a8322a',
  leaves: ['#d9542b', '#e8892f', '#f2b632', '#b8401f', '#c97a2a'],
  /** Leaves drifting across the screen. */
  leafCount: 28,
} as const;

/** Online fights (ADR-0076): how many server frames to keep in hand against network jitter. */
export const ONLINE = {
  /** Frames to wait for before stepping (and again after the frames stop for a moment). */
  bufferFrames: 2,
  /** More than this waiting: step two per tick until caught up. */
  catchUpFrames: 6,
  /** More than this waiting (a hidden tab, a long stall): jump straight to the newest frames. */
  jumpFrames: 45,
} as const;

/** Client-side cheats typed in the code box (ADR-0077). Rule cheats' numbers live in shared/fighter/config.ts. */
export const CHEAT_LOOKS = {
  /** BIGHEAD: head size multiplier. */
  bigHead: 1.9,
  /** TURBO: game speed in offline fights (online fights run on the server's clock). */
  turbo: 1.5,
  /** Space presses this close together (ms), three in a row, open the code box. */
  tapWindowMs: 450,
} as const;
