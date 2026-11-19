// Personal settings (ADR-0083): your own tag over your fighter's head and your own color. Saved in the browser;
// online, every member shares theirs with the room so friends see them too. Presentation only: the fight sim
// never sees them (Hard rule 2).

/** Colors a player can pick for their fighter. The first four are the slot colors (ADR-0026). */
export const PROFILE_COLORS = [
  '#ff6a13', // orange
  '#9be22d', // lime
  '#2ec5ff', // cyan
  '#ff4fa3', // pink
  '#a46bff', // purple
  '#ffc21a', // gold
  '#1fd6b0', // teal
  '#ff3b4f', // red
  '#3f7bff', // blue
  '#b9c4cc', // silver
] as const;

export const PROFILE_COLOR_NAMES = ['Orange', 'Lime', 'Cyan', 'Pink', 'Purple', 'Gold', 'Teal', 'Red', 'Blue', 'Silver'] as const;

/** Longest tag: arcade-style initials or a short name. */
export const TAG_MAX = 4;

export interface Profile {
  /** Your tag, e.g. "HF"; empty = the default ("P1", or your slot online). */
  tag: string;
  /** Index into PROFILE_COLORS; -1 = your slot's color. */
  color: number;
}

export function defaultProfile(): Profile {
  return { tag: '', color: -1 };
}

/** A typed tag made safe to show: capital letters and digits only, at most TAG_MAX, never posing as a CPU. */
export function cleanTag(v: unknown): string {
  if (typeof v !== 'string') return '';
  const tag = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TAG_MAX);
  // CPUs are tagged "CPU" everywhere (ADR-0075); a player can't look like one.
  return tag.startsWith('CPU') ? '' : tag;
}

export function isProfileColor(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < PROFILE_COLORS.length;
}

/** A profile from untrusted data (storage, the network); anything odd falls back to the default. */
export function parseProfile(v: unknown): Profile {
  if (!v || typeof v !== 'object') return defaultProfile();
  const p = v as Record<string, unknown>;
  return { tag: cleanTag(p.tag), color: isProfileColor(p.color) ? p.color : -1 };
}

/**
 * Each fighter's color in a free-for-all, by slot. A player's picked color wins unless someone in an earlier slot
 * already has it; everyone else (CPUs, players with no pick or a clash) wears their slot's color, or the first
 * color nobody wears if that one is taken. Every client gets the same answer.
 */
export function resolveColors(wanted: readonly number[]): string[] {
  const out: (string | null)[] = wanted.map(() => null);
  const taken = new Set<string>();
  wanted.forEach((c, i) => {
    const color = c >= 0 ? PROFILE_COLORS[c] : undefined;
    if (color && !taken.has(color)) {
      out[i] = color;
      taken.add(color);
    }
  });
  return out.map((c, i) => {
    if (c) return c;
    const slot = PROFILE_COLORS[i % PROFILE_COLORS.length]!;
    const color = !taken.has(slot) ? slot : PROFILE_COLORS.find((x) => !taken.has(x)) ?? slot;
    taken.add(color);
    return color;
  });
}
