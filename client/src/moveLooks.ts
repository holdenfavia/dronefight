// How each attack looks (owner's request, 2026-11-10: "all the attacks look the same"). Every move gets a
// pose for the stick figure, an effect for its swing and hit, and a color: normal attacks in the drone's
// slot color, smashes hot orange, spikes purple, specials in the drone's own energy color.

import type { FighterId, MoveId } from '../../shared/fighter/fighters';
import { ATTACK_COLORS } from './config';

/** What the stick figure does. */
export type AttackPose =
  | 'punch' | 'kick' | 'backkick' | 'uppercut' | 'low' | 'spin' | 'stomp' | 'spike'
  | 'grab' | 'throw' | 'cast' | 'counter' | 'dash' | 'rise';

/**
 * The swing and hit effect.
 * arc: a swept trail. puff: quick little punches. flame: fire trail and embers (smashes).
 * shock: a ground shockwave. spin: a ring all around. spike: purple streaks downward.
 * zap: electric crackle. wind: swirling wisps. energy: a glowing trail. grab: a white snap.
 */
export type AttackFx = 'arc' | 'puff' | 'flame' | 'shock' | 'spin' | 'spike' | 'zap' | 'wind' | 'energy' | 'grab';

export interface MoveLook {
  pose: AttackPose;
  fx: AttackFx;
  /** null = the drone's slot color. */
  color: string | null;
}

const NORMAL: Partial<Record<MoveId, MoveLook>> = {
  jab: { pose: 'punch', fx: 'puff', color: null },
  jab2: { pose: 'punch', fx: 'puff', color: null },
  jab3: { pose: 'kick', fx: 'arc', color: null },
  ftilt: { pose: 'kick', fx: 'arc', color: null },
  utilt: { pose: 'uppercut', fx: 'arc', color: null },
  dtilt: { pose: 'low', fx: 'arc', color: null },
  fsmash: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.smash },
  usmash: { pose: 'uppercut', fx: 'flame', color: ATTACK_COLORS.smash },
  dsmash: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.smash },
  nair: { pose: 'spin', fx: 'spin', color: null },
  fair: { pose: 'kick', fx: 'arc', color: null },
  bair: { pose: 'backkick', fx: 'arc', color: null },
  uair: { pose: 'uppercut', fx: 'arc', color: null },
  dair: { pose: 'spike', fx: 'spike', color: ATTACK_COLORS.spike },
  grab: { pose: 'grab', fx: 'grab', color: ATTACK_COLORS.grab },
  pummel: { pose: 'punch', fx: 'puff', color: null },
  fthrow: { pose: 'throw', fx: 'arc', color: null },
  bthrow: { pose: 'throw', fx: 'arc', color: null },
  uthrow: { pose: 'throw', fx: 'arc', color: null },
  dthrow: { pose: 'spike', fx: 'shock', color: null },
  getupattack: { pose: 'spin', fx: 'spin', color: null },
  counterhit: { pose: 'punch', fx: 'energy', color: ATTACK_COLORS.counter },
};

/** Specials, per drone: each has its own flavor of effect. */
const SPECIALS: Record<FighterId, Partial<Record<MoveId, MoveLook>>> = {
  freestyle: {
    nspecial: { pose: 'cast', fx: 'energy', color: ATTACK_COLORS.special.freestyle },
    sspecial: { pose: 'dash', fx: 'energy', color: ATTACK_COLORS.special.freestyle },
    uspecial: { pose: 'rise', fx: 'energy', color: ATTACK_COLORS.special.freestyle },
    dspecial: { pose: 'counter', fx: 'energy', color: ATTACK_COLORS.counter },
  },
  racer: {
    jab: { pose: 'punch', fx: 'zap', color: null },
    nair: { pose: 'spin', fx: 'zap', color: null },
    dair: { pose: 'spike', fx: 'zap', color: ATTACK_COLORS.spike },
    usmash: { pose: 'uppercut', fx: 'zap', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'cast', fx: 'zap', color: ATTACK_COLORS.special.racer },
    sspecial: { pose: 'dash', fx: 'zap', color: ATTACK_COLORS.special.racer },
    uspecial: { pose: 'rise', fx: 'zap', color: ATTACK_COLORS.special.racer },
    dspecial: { pose: 'low', fx: 'zap', color: ATTACK_COLORS.special.racer },
  },
  heavy: {
    fair: { pose: 'spike', fx: 'arc', color: null },
    nspecial: { pose: 'cast', fx: 'flame', color: ATTACK_COLORS.special.heavy },
    sspecial: { pose: 'grab', fx: 'flame', color: ATTACK_COLORS.special.heavy },
    sspecialAir: { pose: 'dash', fx: 'flame', color: ATTACK_COLORS.special.heavy },
    cmdthrow: { pose: 'throw', fx: 'shock', color: ATTACK_COLORS.special.heavy },
    uspecial: { pose: 'rise', fx: 'flame', color: ATTACK_COLORS.special.heavy },
    dspecialAir: { pose: 'stomp', fx: 'flame', color: ATTACK_COLORS.special.heavy },
    slamland: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.special.heavy },
  },
  flipper: {
    nspecial: { pose: 'cast', fx: 'wind', color: ATTACK_COLORS.special.flipper },
    sspecial: { pose: 'backkick', fx: 'wind', color: ATTACK_COLORS.special.flipper },
    uspecial: { pose: 'rise', fx: 'wind', color: ATTACK_COLORS.special.flipper },
    dspecial: { pose: 'stomp', fx: 'spike', color: ATTACK_COLORS.spike },
    bair: { pose: 'backkick', fx: 'wind', color: null },
    dsmash: { pose: 'spin', fx: 'wind', color: ATTACK_COLORS.smash },
  },
};

const FALLBACK: MoveLook = { pose: 'punch', fx: 'arc', color: null };

export function moveLook(id: FighterId, move: MoveId): MoveLook {
  return SPECIALS[id][move] ?? NORMAL[move] ?? FALLBACK;
}
