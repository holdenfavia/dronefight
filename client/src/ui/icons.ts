// Icons for the Loadout screen (ADR-0033): small hand-drawn vector silhouettes of every body, weapon and
// special. Inline SVG in currentColor, so they take the card's text color and stay crisp at any size.

import type { DroneClassId } from '../../../shared/drones';
import type { SpecialId } from '../../../shared/specials';
import type { WeaponId } from '../../../shared/weapons';
import type { PropellerId } from '../../../shared/propellers';

const svg = (body: string) =>
  `<svg viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** A top-down quad: four arms, motors and prop discs. */
const quad = (arm: number, prop: number, extra = '') =>
  svg(
    `<line x1="${32 - arm}" y1="${20 - arm * 0.6}" x2="${32 + arm}" y2="${20 + arm * 0.6}"/><line x1="${32 - arm}" y1="${20 + arm * 0.6}" x2="${32 + arm}" y2="${20 - arm * 0.6}"/>` +
      [
        [32 - arm, 20 - arm * 0.6],
        [32 + arm, 20 + arm * 0.6],
        [32 - arm, 20 + arm * 0.6],
        [32 + arm, 20 - arm * 0.6],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${prop}" stroke-width="1.6" opacity="0.7"/><circle cx="${x}" cy="${y}" r="1.6" fill="currentColor"/>`)
        .join('') +
      `<rect x="27" y="15" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>` +
      extra,
  );

export const BODY_ICONS: Record<DroneClassId, string> = {
  freestyle: quad(14, 7),
  quad3d: quad(14, 7, '<path d="M26 34 h12 M29 31 l-3 3 3 3 M35 31 l3 3 -3 3" stroke-width="1.8"/>'),
  wing: svg('<path d="M32 6 L58 30 L58 34 L32 22 L6 34 L6 30 Z" fill="currentColor" fill-opacity="0.25"/><line x1="32" y1="6" x2="32" y2="26"/><path d="M6 30 v-6 M58 30 v-6"/>'),
  racer: quad(9, 5),
  x8: svg(
    '<line x1="12" y1="8" x2="52" y2="32"/><line x1="12" y1="32" x2="52" y2="8"/>' +
      [
        [12, 8],
        [52, 32],
        [12, 32],
        [52, 8],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" stroke-width="1.6" opacity="0.7"/><circle cx="${x}" cy="${y}" r="4.5" stroke-width="1.4" opacity="0.7"/>`)
        .join('') +
      '<rect x="25" y="14" width="14" height="12" rx="2" fill="currentColor" stroke="none"/>',
  ),
};

export const WEAPON_ICONS: Record<WeaponId, string> = {
  gun: svg('<rect x="22" y="15" width="14" height="10" rx="1.5" fill="currentColor" stroke="none"/><line x1="36" y1="20" x2="56" y2="20" stroke-width="3"/><rect x="54" y="17" width="5" height="6" rx="1"/>'),
  burst: svg('<rect x="16" y="14" width="20" height="10" rx="1.5" fill="currentColor" stroke="none"/><rect x="22" y="24" width="7" height="10" rx="1"/><line x1="36" y1="18" x2="58" y2="18" stroke-width="3"/><path d="M44 30 h3 M50 30 h3 M56 30 h3" stroke-width="3"/>'),
  shotgun: svg('<rect x="14" y="13" width="14" height="14" rx="2" fill="currentColor" stroke="none"/><line x1="28" y1="16" x2="58" y2="16" stroke-width="3.4"/><line x1="28" y1="24" x2="58" y2="24" stroke-width="3.4"/><rect x="34" y="27" width="12" height="5" rx="1"/>'),
  cannon: svg('<circle cx="18" cy="20" r="9" fill="currentColor" fill-opacity="0.3"/><path d="M26 14 H58 M26 20 H60 M26 26 H58" stroke-width="2.6"/><circle cx="18" cy="20" r="3" fill="currentColor"/>'),
  rail: svg('<path d="M8 13 H58 M8 27 H58" stroke-width="3"/><path d="M16 11 v18 M26 11 v18 M36 11 v18 M46 11 v18" stroke-width="1.8" opacity="0.8"/><line x1="12" y1="20" x2="62" y2="20" stroke-width="1.6" stroke-dasharray="3 3"/>'),
  missile: svg('<rect x="8" y="10" width="26" height="20" rx="2"/>' + [14, 20, 26].map((y) => `<path d="M34 ${y} H52 l6 0 -4 -3 M52 ${y} l-4 3" stroke-width="2"/>`).join('')),
  grenade: svg('<rect x="10" y="12" width="34" height="14" rx="3" fill="currentColor" fill-opacity="0.25"/><circle cx="24" cy="31" r="6"/><ellipse cx="52" cy="19" rx="7" ry="5.5" fill="currentColor"/><path d="M52 12 v-4" stroke-width="2"/>'),
};

export const SPECIAL_ICONS: Record<SpecialId, string> = {
  smoke: svg('<circle cx="22" cy="24" r="8" fill="currentColor" fill-opacity="0.3"/><circle cx="34" cy="18" r="10" fill="currentColor" fill-opacity="0.3"/><circle cx="46" cy="24" r="7" fill="currentColor" fill-opacity="0.3"/><path d="M8 32 Q20 26 32 32 T56 32" stroke-width="2"/>'),
  maneuver: svg('<path d="M10 30 Q30 30 34 10" stroke-width="3"/><path d="M28 12 l6 -4 2 7"/><path d="M40 32 a10 10 0 1 0 0 -14" stroke-width="2" opacity="0.7"/>'),
  afterburner: svg('<rect x="8" y="14" width="22" height="12" rx="2" fill="currentColor" stroke="none"/><path d="M30 20 L44 12 L40 20 L58 20 L40 20 L44 28 Z" fill="currentColor" fill-opacity="0.4"/>'),
  shield: svg('<path d="M32 4 L52 11 V22 Q52 33 32 38 Q12 33 12 22 V11 Z" fill="currentColor" fill-opacity="0.25"/><path d="M24 21 l6 6 11 -12" stroke-width="3"/>'),
};

/** An empty slot. */
export const EMPTY_ICON = svg('<rect x="14" y="8" width="36" height="24" rx="3" stroke-dasharray="4 3" opacity="0.6"/><path d="M28 20 h8 M32 16 v8" opacity="0.6"/>');

/** A propeller seen from above with `blades` blades; `guard` draws a duct ring. */
const prop = (blades: number, length: number, width: number, guard = false) =>
  svg(
    Array.from({ length: blades }, (_, i) => {
      const a = (i / blades) * 360;
      return `<ellipse cx="32" cy="${20 - length / 2}" rx="${width}" ry="${length / 2}" transform="rotate(${a} 32 20)" fill="currentColor" fill-opacity="0.35"/>`;
    }).join('') +
      '<circle cx="32" cy="20" r="3" fill="currentColor"/>' +
      (guard ? '<circle cx="32" cy="20" r="18" stroke-width="3"/>' : ''),
  );

export const PROPELLER_ICONS: Record<PropellerId, string> = {
  tri: prop(3, 16, 3.4),
  bi: prop(2, 18, 3),
  quad: prop(4, 13, 3.4),
  heavy: prop(3, 18, 4.6),
  ducted: prop(3, 14, 3.4, true),
  // Jets (ADR-0038), side view, intake on the left, exhaust flame on the right.
  turbine: svg(
    '<path d="M8 13 H44 L52 16 V24 L44 27 H8 Z" fill="currentColor" fill-opacity="0.3"/><ellipse cx="8" cy="20" rx="3" ry="7"/><path d="M12 15 V25 M16 15 V25 M20 15 V25" stroke-width="1.4"/><path d="M52 17 L60 20 L52 23" fill="currentColor" fill-opacity="0.6" stroke="none"/>',
  ),
  pulsejet: svg(
    '<path d="M6 14 Q6 12 10 12 H20 Q24 12 26 18 H56 V22 H26 Q24 28 20 28 H10 Q6 28 6 26 Z" fill="currentColor" fill-opacity="0.3"/><path d="M58 17 L62 20 L58 23 M58 13 L61 15 M58 27 L61 25" stroke-width="1.8"/>',
  ),
  ramjet: svg(
    '<path d="M4 20 L16 17 V23 Z" fill="currentColor"/><path d="M12 13 H48 L54 16 V24 L48 27 H12 Z" fill="currentColor" fill-opacity="0.3"/><path d="M54 17 L62 20 L54 23" fill="currentColor" fill-opacity="0.6" stroke="none"/><path d="M24 31 h14 M34 28 l4 3 -4 3" stroke-width="1.6" opacity="0.7"/>',
  ),
};
