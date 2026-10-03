// Progression rules (ADR-0032), shared so the client shows exactly what the server awards.

/** XP per event. Only the room server awards these, and only to signed-in pilots in a running online match. */
export const XP = {
  kill: 100,
  assist: 40,
  prop: 10,
  finish: 100,
  win: 300,
} as const;

export type XpReason = keyof typeof XP;

/** Total XP needed to reach `level` (level 1 needs 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 250 * n * (n - 1);
}

/** The level a total XP amount gives. */
export function levelForXp(rawXp: number): number {
  const xp = Math.max(0, rawXp);
  // Solve 250·n·(n−1) <= xp for the largest n.
  const n = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 250)) / 2);
  // Guard against floating-point edges.
  if (xpForLevel(n + 1) <= xp) return n + 1;
  if (xpForLevel(n) > xp) return n - 1;
  return n;
}

/** Progress through the current level: XP into it, and the XP the whole level spans. */
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  return { level, into: xp - base, span: xpForLevel(level + 1) - base };
}
