// How each attack looks (owner's request, 2026-11-10: "all the attacks look the same"). Every move gets a
// pose for the stick figure, an effect for its swing and hit, and a color: normal attacks in the fighter's
// slot color, smashes hot orange, spikes purple, specials in the fighter's own energy color (ADR-0072).

import type { FighterId, MoveId } from '../../shared/fighter/fighters';
import { ATTACK_COLORS } from './config';

/** What the stick figure does. */
export type AttackPose =
  | 'punch' | 'kick' | 'backkick' | 'uppercut' | 'low' | 'spin' | 'stomp' | 'spike'
  | 'grab' | 'throw' | 'cast' | 'counter' | 'dash' | 'rise'
  // Sword swings (the Blade).
  | 'slash' | 'overhead' | 'thrust' | 'upslash' | 'lowslash' | 'backslash' | 'downstab';

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
  /** null = the fighter's slot color. */
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

/** Per fighter: specials in its own energy, and normals that look like its style of fighting. */
const OWN: Record<FighterId, Partial<Record<MoveId, MoveLook>>> = {
  brawler: {
    jab3: { pose: 'punch', fx: 'arc', color: null },
    fair: { pose: 'kick', fx: 'puff', color: null },
    nspecial: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.special.brawler },
    sspecial: { pose: 'uppercut', fx: 'energy', color: ATTACK_COLORS.special.brawler },
    uspecial: { pose: 'spin', fx: 'energy', color: ATTACK_COLORS.special.brawler },
    dspecial: { pose: 'counter', fx: 'energy', color: ATTACK_COLORS.counter },
    counterhit: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.special.brawler },
  },
  blade: {
    jab: { pose: 'slash', fx: 'arc', color: null },
    jab2: { pose: 'thrust', fx: 'arc', color: null },
    ftilt: { pose: 'slash', fx: 'arc', color: null },
    utilt: { pose: 'upslash', fx: 'arc', color: null },
    dtilt: { pose: 'lowslash', fx: 'arc', color: null },
    fsmash: { pose: 'overhead', fx: 'flame', color: ATTACK_COLORS.smash },
    usmash: { pose: 'upslash', fx: 'flame', color: ATTACK_COLORS.smash },
    dsmash: { pose: 'lowslash', fx: 'flame', color: ATTACK_COLORS.smash },
    nair: { pose: 'spin', fx: 'spin', color: null },
    fair: { pose: 'slash', fx: 'arc', color: null },
    bair: { pose: 'backslash', fx: 'arc', color: null },
    uair: { pose: 'upslash', fx: 'arc', color: null },
    dair: { pose: 'downstab', fx: 'spike', color: ATTACK_COLORS.spike },
    getupattack: { pose: 'slash', fx: 'spin', color: null },
    nspecial: { pose: 'slash', fx: 'energy', color: ATTACK_COLORS.special.blade },
    sspecial: { pose: 'thrust', fx: 'energy', color: ATTACK_COLORS.special.blade },
    uspecial: { pose: 'upslash', fx: 'spin', color: ATTACK_COLORS.special.blade },
    dspecial: { pose: 'counter', fx: 'energy', color: ATTACK_COLORS.counter },
    riposte: { pose: 'thrust', fx: 'energy', color: ATTACK_COLORS.special.blade },
  },
  spark: {
    jab: { pose: 'cast', fx: 'zap', color: null },
    ftilt: { pose: 'cast', fx: 'energy', color: null },
    utilt: { pose: 'rise', fx: 'energy', color: null },
    dtilt: { pose: 'low', fx: 'energy', color: null },
    fsmash: { pose: 'cast', fx: 'flame', color: ATTACK_COLORS.smash },
    usmash: { pose: 'rise', fx: 'zap', color: ATTACK_COLORS.smash },
    dsmash: { pose: 'cast', fx: 'shock', color: ATTACK_COLORS.smash },
    nair: { pose: 'spin', fx: 'zap', color: null },
    fair: { pose: 'cast', fx: 'energy', color: null },
    nspecial: { pose: 'cast', fx: 'flame', color: ATTACK_COLORS.special.spark },
    sspecial: { pose: 'cast', fx: 'energy', color: ATTACK_COLORS.special.spark },
    uspecial: { pose: 'rise', fx: 'energy', color: ATTACK_COLORS.special.spark },
    dspecial: { pose: 'counter', fx: 'energy', color: ATTACK_COLORS.special.spark },
  },
  titan: {
    fair: { pose: 'spike', fx: 'arc', color: null },
    nspecial: { pose: 'throw', fx: 'shock', color: ATTACK_COLORS.special.titan },
    sspecial: { pose: 'grab', fx: 'grab', color: ATTACK_COLORS.special.titan },
    carry: { pose: 'throw', fx: 'energy', color: ATTACK_COLORS.special.titan },
    carryslam: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.special.titan },
    uspecial: { pose: 'rise', fx: 'shock', color: ATTACK_COLORS.special.titan },
    dspecial: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.special.titan },
    dspecialAir: { pose: 'stomp', fx: 'spike', color: ATTACK_COLORS.spike },
    quake: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.special.titan },
  },
};

const FALLBACK: MoveLook = { pose: 'punch', fx: 'arc', color: null };

export function moveLook(id: FighterId, move: MoveId): MoveLook {
  return OWN[id][move] ?? NORMAL[move] ?? FALLBACK;
}
