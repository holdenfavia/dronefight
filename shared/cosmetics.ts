// Drone customization (ADR-0030): a catalog shared by client and server, so a look sent over the wire is
// validated against the same list it was picked from. Cosmetic only: nothing here touches flight or combat,
// and the per-match pilot color (props, glow, trail; ADR-0026) is never part of a look.

import { DRONE_ORDER, type DroneClassId } from './drones.js';

export interface Paint {
  id: string;
  name: string;
  color: string;
}

/** Body and accent colors. Ids are stable (saved in profiles); names and colors can be tuned. */
export const PAINTS = [
  { id: 'carbon', name: 'Carbon', color: '#141516' },
  { id: 'white', name: 'Arctic', color: '#eceae4' },
  { id: 'orange', name: 'Safety orange', color: '#ff6a13' },
  { id: 'red', name: 'Race red', color: '#d7263d' },
  { id: 'yellow', name: 'Taxi', color: '#ffc61a' },
  { id: 'lime', name: 'Acid', color: '#b6f000' },
  { id: 'green', name: 'Forest', color: '#2e6b3a' },
  { id: 'teal', name: 'Teal', color: '#00a6a6' },
  { id: 'blue', name: 'Cobalt', color: '#2456d8' },
  { id: 'purple', name: 'Violet', color: '#7a3cff' },
  { id: 'pink', name: 'Bubblegum', color: '#ff5fb2' },
  { id: 'gunmetal', name: 'Gunmetal', color: '#4a5059' },
  { id: 'gold', name: 'Gold', color: '#c9a227' },
  { id: 'sand', name: 'Desert', color: '#c8b48a' },
] as const satisfies readonly Paint[];

export type PaintId = (typeof PAINTS)[number]['id'];

/** Body finishes. `stripes`, `checker` and `camo` mix the body and accent colors. */
export const PATTERNS = [
  { id: 'solid', name: 'Solid' },
  { id: 'stripes', name: 'Racing stripes' },
  { id: 'checker', name: 'Checker' },
  { id: 'camo', name: 'Camo' },
  { id: 'carbonweave', name: 'Carbon weave' },
  { id: 'chrome', name: 'Chrome' },
] as const;

export type PatternId = (typeof PATTERNS)[number]['id'];

/** One drone's look: body paint and finish, plus an accent (battery/camera, wing pod). */
export interface DroneLook {
  body: PaintId;
  pattern: PatternId;
  accent: PaintId;
}

/** Your profile's public part, sent to the room so other pilots see it. */
export interface PilotLook {
  /** Pilot name, or empty for none (then you're your color: "Cyan"). */
  name: string;
  look: DroneLook;
}

export const DEFAULT_LOOKS: Record<DroneClassId, DroneLook> = {
  freestyle: { body: 'carbon', pattern: 'solid', accent: 'white' },
  quad3d: { body: 'carbon', pattern: 'carbonweave', accent: 'carbon' },
  wing: { body: 'white', pattern: 'solid', accent: 'carbon' },
};

export const NAME_MAX = 16;

export function paintColor(id: PaintId): string {
  return PAINTS.find((p) => p.id === id)?.color ?? '#141516';
}

export function isPaintId(x: unknown): x is PaintId {
  return typeof x === 'string' && PAINTS.some((p) => p.id === x);
}

export function isPatternId(x: unknown): x is PatternId {
  return typeof x === 'string' && PATTERNS.some((p) => p.id === x);
}

export function isDroneLook(x: unknown): x is DroneLook {
  if (typeof x !== 'object' || x === null) return false;
  const l = x as Record<string, unknown>;
  return isPaintId(l.body) && isPatternId(l.pattern) && isPaintId(l.accent);
}

/** Letters, digits, spaces, `_` and `-`; trimmed, single spaces, at most NAME_MAX characters. */
export function cleanPilotName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Fill gaps in a saved set of looks from the defaults (older or partial saves stay valid). */
export function completeLooks(saved: unknown): Record<DroneClassId, DroneLook> {
  const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOKS };
  for (const cls of DRONE_ORDER) if (isDroneLook(s[cls])) out[cls] = s[cls] as DroneLook;
  return out;
}

/** A stable key for a look, to tell when a model needs rebuilding. */
export function lookKey(look: DroneLook): string {
  return `${look.body}/${look.pattern}/${look.accent}`;
}
