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
  | 'slash' | 'overhead' | 'thrust' | 'upslash' | 'lowslash' | 'backslash' | 'downstab'
  // Aiming a gun (the Gunslinger) and playing the guitar (the Bard).
  | 'shoot' | 'strum';

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
    ftilt: { pose: 'uppercut', fx: 'puff', color: null },
    fsmash: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.smash },
    kopunch: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.rage },
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
    flashcut: { pose: 'dash', fx: 'energy', color: '#ffffff' },
  },
  spark: {
    jab: { pose: 'cast', fx: 'zap', color: null },
    ftilt: { pose: 'cast', fx: 'zap', color: ATTACK_COLORS.special.spark },
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
    ftilt: { pose: 'dash', fx: 'shock', color: null },
    fsmash: { pose: 'overhead', fx: 'shock', color: ATTACK_COLORS.smash },
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
  ninja: {
    jab: { pose: 'punch', fx: 'puff', color: null },
    jab3: { pose: 'kick', fx: 'arc', color: null },
    ftilt: { pose: 'spin', fx: 'arc', color: null },
    fsmash: { pose: 'dash', fx: 'flame', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'throw', fx: 'energy', color: ATTACK_COLORS.special.ninja },
    sspecial: { pose: 'slash', fx: 'energy', color: ATTACK_COLORS.special.ninja },
    uspecial: { pose: 'rise', fx: 'energy', color: ATTACK_COLORS.special.ninja },
    dspecial: { pose: 'throw', fx: 'energy', color: ATTACK_COLORS.special.ninja },
  },
  gunslinger: {
    ftilt: { pose: 'throw', fx: 'arc', color: null },
    fsmash: { pose: 'shoot', fx: 'flame', color: ATTACK_COLORS.smash },
    usmash: { pose: 'uppercut', fx: 'flame', color: ATTACK_COLORS.smash },
    dsmash: { pose: 'shoot', fx: 'shock', color: ATTACK_COLORS.smash },
    fair: { pose: 'shoot', fx: 'energy', color: null },
    uair: { pose: 'uppercut', fx: 'energy', color: null },
    dair: { pose: 'spike', fx: 'spike', color: ATTACK_COLORS.spike },
    nspecial: { pose: 'shoot', fx: 'energy', color: ATTACK_COLORS.special.gunslinger },
    reload: { pose: 'counter', fx: 'grab', color: ATTACK_COLORS.special.gunslinger },
    sspecial: { pose: 'throw', fx: 'grab', color: ATTACK_COLORS.special.gunslinger },
    uspecial: { pose: 'spike', fx: 'flame', color: ATTACK_COLORS.special.gunslinger },
    dspecial: { pose: 'counter', fx: 'energy', color: ATTACK_COLORS.counter },
    quickdraw: { pose: 'shoot', fx: 'flame', color: ATTACK_COLORS.special.gunslinger },
  },
  chef: {
    jab3: { pose: 'punch', fx: 'arc', color: null },
    jab: { pose: 'slash', fx: 'puff', color: null },
    ftilt: { pose: 'uppercut', fx: 'arc', color: null },
    fsmash: { pose: 'spin', fx: 'flame', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'throw', fx: 'arc', color: ATTACK_COLORS.special.chef },
    cook: { pose: 'cast', fx: 'wind', color: ATTACK_COLORS.special.chef },
    sspecial: { pose: 'slash', fx: 'energy', color: ATTACK_COLORS.special.chef },
    uspecial: { pose: 'rise', fx: 'wind', color: '#ffffff' },
    dspecial: { pose: 'low', fx: 'flame', color: ATTACK_COLORS.special.chef },
  },
  ghost: {
    jab: { pose: 'punch', fx: 'wind', color: null },
    jab2: { pose: 'punch', fx: 'wind', color: null },
    ftilt: { pose: 'spin', fx: 'wind', color: null },
    nair: { pose: 'spin', fx: 'wind', color: null },
    fsmash: { pose: 'cast', fx: 'wind', color: ATTACK_COLORS.slow },
    nspecial: { pose: 'cast', fx: 'energy', color: ATTACK_COLORS.curse },
    sspecial: { pose: 'slash', fx: 'wind', color: ATTACK_COLORS.special.ghost },
    uspecial: { pose: 'rise', fx: 'wind', color: ATTACK_COLORS.special.ghost },
    dspecial: { pose: 'counter', fx: 'wind', color: ATTACK_COLORS.special.ghost },
  },
  yoyo: {
    jab: { pose: 'punch', fx: 'arc', color: null },
    ftilt: { pose: 'punch', fx: 'arc', color: null },
    dtilt: { pose: 'low', fx: 'arc', color: null },
    nair: { pose: 'spin', fx: 'spin', color: null },
    fsmash: { pose: 'punch', fx: 'zap', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'punch', fx: 'energy', color: ATTACK_COLORS.special.yoyo },
    sspecial: { pose: 'low', fx: 'zap', color: ATTACK_COLORS.special.yoyo },
    uspecial: { pose: 'uppercut', fx: 'energy', color: ATTACK_COLORS.special.yoyo },
    dspecial: { pose: 'spin', fx: 'spin', color: ATTACK_COLORS.special.yoyo },
  },
  bard: {
    jab: { pose: 'thrust', fx: 'arc', color: null },
    jab2: { pose: 'thrust', fx: 'arc', color: null },
    ftilt: { pose: 'slash', fx: 'arc', color: null },
    fsmash: { pose: 'overhead', fx: 'shock', color: ATTACK_COLORS.smash },
    usmash: { pose: 'strum', fx: 'zap', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'strum', fx: 'energy', color: ATTACK_COLORS.special.bard },
    sspecial: { pose: 'strum', fx: 'energy', color: ATTACK_COLORS.haste },
    uspecial: { pose: 'rise', fx: 'shock', color: ATTACK_COLORS.special.bard },
    dspecial: { pose: 'strum', fx: 'wind', color: ATTACK_COLORS.slow },
    tempoEncore: { pose: 'strum', fx: 'zap', color: ATTACK_COLORS.haste },
    lullabyEncore: { pose: 'strum', fx: 'wind', color: ATTACK_COLORS.curse },
  },
  // River (secret): slaps and shoves, a belly bump, a bounce and the Belly Flop.
  river: {
    jab: { pose: 'punch', fx: 'puff', color: null },
    jab2: { pose: 'punch', fx: 'arc', color: null },
    fsmash: { pose: 'overhead', fx: 'flame', color: ATTACK_COLORS.smash },
    dsmash: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'throw', fx: 'arc', color: ATTACK_COLORS.special.river },
    sspecial: { pose: 'dash', fx: 'energy', color: ATTACK_COLORS.special.river },
    uspecial: { pose: 'rise', fx: 'energy', color: ATTACK_COLORS.special.river },
    dspecial: { pose: 'spike', fx: 'spike', color: ATTACK_COLORS.special.river },
    dspecialAir: { pose: 'spike', fx: 'spike', color: ATTACK_COLORS.special.river },
    bellyflop: { pose: 'stomp', fx: 'shock', color: ATTACK_COLORS.special.river },
    fthrow: { pose: 'throw', fx: 'flame', color: ATTACK_COLORS.special.river },
    bthrow: { pose: 'throw', fx: 'flame', color: ATTACK_COLORS.special.river },
    uthrow: { pose: 'throw', fx: 'flame', color: ATTACK_COLORS.special.river },
  },
  // Turkey (seasonal): pecks, wing slaps, a strut, flaps and gobbles.
  turkey: {
    jab: { pose: 'punch', fx: 'puff', color: null },
    jab2: { pose: 'punch', fx: 'puff', color: null },
    jab3: { pose: 'punch', fx: 'wind', color: null },
    ftilt: { pose: 'slash', fx: 'wind', color: null },
    nair: { pose: 'spin', fx: 'wind', color: null },
    fsmash: { pose: 'punch', fx: 'flame', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'throw', fx: 'arc', color: ATTACK_COLORS.special.turkey },
    sspecial: { pose: 'dash', fx: 'puff', color: ATTACK_COLORS.special.turkey },
    uspecial: { pose: 'rise', fx: 'wind', color: ATTACK_COLORS.special.turkey },
    dspecial: { pose: 'cast', fx: 'shock', color: ATTACK_COLORS.special.turkey },
    thundergobble: { pose: 'cast', fx: 'shock', color: ATTACK_COLORS.smash },
  },
  // Pilgrim (seasonal): a threshing flail, a blunderbuss, a pitchfork, pumpkins.
  pilgrim: {
    jab: { pose: 'slash', fx: 'arc', color: null },
    jab2: { pose: 'overhead', fx: 'arc', color: null },
    ftilt: { pose: 'slash', fx: 'arc', color: null },
    fsmash: { pose: 'overhead', fx: 'shock', color: ATTACK_COLORS.smash },
    nspecial: { pose: 'shoot', fx: 'energy', color: ATTACK_COLORS.special.pilgrim },
    reload: { pose: 'counter', fx: 'arc', color: ATTACK_COLORS.special.pilgrim },
    sspecial: { pose: 'thrust', fx: 'energy', color: ATTACK_COLORS.special.pilgrim },
    uspecial: { pose: 'rise', fx: 'wind', color: ATTACK_COLORS.special.pilgrim },
    dspecial: { pose: 'throw', fx: 'arc', color: ATTACK_COLORS.special.pilgrim },
  },
  // Sachem (seasonal): a canoe paddle, a fishing spear, a net and a fish weir.
  firstlight: {
    jab: { pose: 'thrust', fx: 'arc', color: null },
    jab2: { pose: 'slash', fx: 'arc', color: null },
    ftilt: { pose: 'slash', fx: 'wind', color: null },
    utilt: { pose: 'upslash', fx: 'arc', color: null },
    dtilt: { pose: 'lowslash', fx: 'arc', color: null },
    fsmash: { pose: 'slash', fx: 'wind', color: ATTACK_COLORS.smash },
    usmash: { pose: 'upslash', fx: 'flame', color: ATTACK_COLORS.smash },
    fair: { pose: 'slash', fx: 'arc', color: null },
    bair: { pose: 'backslash', fx: 'arc', color: null },
    nspecial: { pose: 'throw', fx: 'energy', color: ATTACK_COLORS.special.firstlight },
    sspecial: { pose: 'throw', fx: 'wind', color: ATTACK_COLORS.special.firstlight },
    uspecial: { pose: 'rise', fx: 'wind', color: ATTACK_COLORS.special.firstlight },
    dspecial: { pose: 'counter', fx: 'wind', color: ATTACK_COLORS.special.firstlight },
    weirhit: { pose: 'slash', fx: 'energy', color: ATTACK_COLORS.counter },
  },
};

// Seasonal fighters (ADR-0082) are added below.
const FALLBACK: MoveLook = { pose: 'punch', fx: 'arc', color: null };

export function moveLook(id: FighterId, move: MoveId): MoveLook {
  return OWN[id][move] ?? NORMAL[move] ?? FALLBACK;
}
