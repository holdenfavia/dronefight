// Your stage bans (ADR-0086), saved in this browser. They count offline when stage pick and ban is on, and online
// they're shared with the room (the host decides whether the room uses them).

import type { StageId } from '../../shared/fighter/stages';
import { parseBans } from '../../shared/online';

const STORAGE_KEY = 'dronefight.stageBans.v1';

let bans: StageId[] = load();

function load(): StageId[] {
  try {
    return parseBans(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function stageBans(): StageId[] {
  return bans;
}

/**
 * Ban or unban a stage. A ban that would leave none of `offered` open doesn't stick: returns false.
 */
export function toggleBan(id: StageId, offered: readonly StageId[]): boolean {
  const next = bans.includes(id) ? bans.filter((b) => b !== id) : [...bans, id];
  if (!offered.some((s) => !next.includes(s))) return false;
  bans = parseBans(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bans));
  } catch {
    // Private mode: bans last until the page closes.
  }
  return true;
}
