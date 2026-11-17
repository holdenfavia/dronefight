// Signature mechanics (ADR-0079): one deeper system per fighter, each with a HUD meter.
// Brawler's KO meter, Blade's edge, Spark's mana, Titan's payback, Ninja's marks, Gunslinger's hot streak,
// Chef's pantry and recipes, Ghost's haunting and possession, Yo-yo Kid's trick combos, Bard's groove.
// Deterministic like the rest of the sim: the state lives on the fighters, so online snapshots carry it.

import { SIGNATURE } from './config.js';
import type { FighterId, HitStats, MoveId } from './fighters.js';
import type { Fighter, GameEvent, Input, Projectile, World } from './sim.js';

export type Ingredient = 'tomato' | 'pepper' | 'meat';
export type Recipe = 'chili' | 'soup' | 'stew' | 'feast';

/** Something worth a popup: a meter filled, a signature move came out, a recipe was served. */
export type SignatureKind =
  | 'koReady' | 'kopunch'
  | 'edge' | 'flashcut'
  | 'fizzle' | 'undo'
  | 'payback'
  | 'mark' | 'assassinate'
  | 'golden'
  | 'ingredient' | Recipe
  | 'haunt' | 'possess'
  | 'trick'
  | 'groove' | 'offbeat' | 'encore';

const AERIALS: ReadonlySet<MoveId> = new Set<MoveId>(['nair', 'fair', 'bair', 'uair', 'dair']);
const SMASHES: ReadonlySet<MoveId> = new Set<MoveId>(['fsmash', 'usmash', 'dsmash', 'quake']);
/** Moves that don't count for the Bard's beat (grabbing, holding, getting up). */
const OFF_BEAT_FREE: ReadonlySet<MoveId> = new Set<MoveId>(['grab', 'pummel', 'fthrow', 'bthrow', 'uthrow', 'dthrow', 'getupattack', 'counterhit']);

function emit(world: World, e: GameEvent): void {
  world.events.push(e);
}

function sig(world: World, f: Fighter, kind: SignatureKind, target = -1): void {
  emit(world, { type: 'signature', slot: f.slot, kind, target });
}

// ---------------------------------------------------------------------------------------------
// Life cycle

/** What the meter holds at the start of a stock: Spark starts with full mana, everyone else empty. */
export function startingMeter(id: FighterId): number {
  return id === 'spark' ? SIGNATURE.mana.max : 0;
}

/** Fresh signature state for a new fighter. */
export function newSignatureState(id: FighterId): Pick<Fighter,
  'meter' | 'pantry' | 'buff' | 'buffKind' | 'chain' | 'chainFrame' | 'tags' | 'tagTime' | 'puppetBy' | 'puppet' | 'rawPrev' | 'moveMod' | 'moveKb' | 'moveBonus' | 'moveSig'> {
  return {
    meter: startingMeter(id),
    pantry: [],
    buff: 0,
    buffKind: '',
    chain: 0,
    chainFrame: -9999,
    tags: [0, 0, 0, 0],
    tagTime: [0, 0, 0, 0],
    puppetBy: -1,
    puppet: 0,
    rawPrev: { left: false, right: false, up: false, down: false, attack: false, aimLeft: false, aimRight: false, aimUp: false, aimDown: false, special: false, shield: false, grab: false },
    moveMod: 1,
    moveKb: 1,
    moveBonus: 0,
    moveSig: '',
  };
}

/** A new stock: meters, buffs, marks and possession start over. */
export function resetSignature(f: Fighter): void {
  f.meter = startingMeter(f.id);
  f.pantry = [];
  f.buff = 0;
  f.buffKind = '';
  f.chain = 0;
  f.tags = [0, 0, 0, 0];
  f.tagTime = [0, 0, 0, 0];
  f.puppetBy = -1;
  f.puppet = 0;
}

/** Once a frame, before the fighter acts. */
export function tickSignature(world: World, f: Fighter): void {
  if (f.id === 'spark') f.meter = Math.min(SIGNATURE.mana.max, f.meter + SIGNATURE.mana.regen);
  if (f.buff > 0 && --f.buff === 0) f.buffKind = '';
  for (let i = 0; i < f.tagTime.length; i++) {
    if (f.tagTime[i]! > 0 && --f.tagTime[i]! === 0) f.tags[i] = 0;
  }
  if (f.puppet > 0) {
    const ghost = world.fighters[f.puppetBy];
    if (!ghost || ghost.action === 'dead' || ghost.action === 'out') f.puppet = 0;
    else f.puppet--;
    if (f.puppet <= 0) { f.puppet = 0; f.puppetBy = -1; }
  }
  // Out of the chain window: the combo is over.
  if (f.chain > 0 && world.frame - f.chainFrame > chainWindow(f)) f.chain = 0;
}

function chainWindow(f: Fighter): number {
  return f.id === 'yoyo' ? SIGNATURE.trick.window : SIGNATURE.chainWindow;
}

// ---------------------------------------------------------------------------------------------
// Possession: the Ghost steers a fully haunted foe's movement for a moment.

/**
 * The input a possessed fighter actually gets: the Ghost's movement keys and nothing else.
 * Every fresh key the possessed player presses shakes some of the possession off.
 */
export function puppetInput(f: Fighter, raw: Input, inputs: readonly Input[]): Input {
  const prev = f.rawPrev;
  f.rawPrev = { ...raw };
  if (f.puppet <= 0) return raw;
  let presses = 0;
  for (const k of Object.keys(raw) as (keyof Input)[]) if (raw[k] && !prev[k]) presses++;
  f.puppet = Math.max(0, f.puppet - presses * SIGNATURE.haunt.mash);
  if (f.puppet <= 0) { f.puppet = 0; f.puppetBy = -1; return raw; }
  const g = inputs[f.puppetBy];
  return { left: !!g?.left, right: !!g?.right, up: !!g?.up, down: !!g?.down, attack: false, aimLeft: false, aimRight: false, aimUp: false, aimDown: false, special: false, shield: false, grab: false };
}

// ---------------------------------------------------------------------------------------------
// Starting moves

/**
 * A move is about to start: swap in the signature version when its meter is full, spend meters,
 * and set this move's damage and knockback multipliers. Returns the move to actually play.
 */
export function beginMove(world: World, f: Fighter, move: MoveId): MoveId {
  f.moveMod = 1;
  f.moveKb = 1;
  f.moveBonus = 0;
  f.moveSig = '';
  const S = SIGNATURE;
  switch (f.id) {
    case 'brawler':
      if (move === 'nspecial' && f.meter >= S.ko.max) {
        f.meter = 0;
        f.moveSig = 'kopunch';
        sig(world, f, 'kopunch');
        return 'kopunch';
      }
      break;
    case 'blade':
      if ((move === 'sspecial' || move === 'sspecialAir') && f.meter >= S.edge.max) {
        f.meter = 0;
        f.moveSig = 'flashcut';
        sig(world, f, 'flashcut');
        return 'flashcut';
      }
      break;
    case 'spark': {
      const base = move.replace('Air', '');
      const cost = S.mana.cost[base];
      if (cost !== undefined) {
        if (f.meter >= cost) f.meter -= cost;
        else {
          f.meter = 0;
          f.moveMod = S.mana.fizzleDmg;
          f.moveSig = 'fizzle';
          sig(world, f, 'fizzle');
        }
      }
      break;
    }
    case 'titan':
      if (SMASHES.has(move) && f.meter > 0) {
        f.moveBonus = f.meter * S.payback.dmgShare;
        f.moveKb = 1 + f.meter * S.payback.kbPerStored;
        f.moveSig = 'payback';
        f.meter = 0;
      }
      break;
    case 'gunslinger':
      // The ammo was already spent: none left means this is the last bullet in the cylinder.
      if (move === 'nspecial' && f.ammo === 0) {
        f.moveMod = S.streak.goldenDmg + S.streak.dmgPer * f.meter;
        f.moveKb = 1 + S.streak.kbPer * f.meter;
        f.moveSig = 'golden';
        f.meter = 0;
      }
      break;
    case 'chef':
      if (move === 'dspecial' && f.pantry.length >= S.pantry.size) return 'cook';
      break;
    case 'bard': {
      if (OFF_BEAT_FREE.has(move)) break;
      if ((move === 'sspecial' || move === 'dspecial') && f.meter >= S.groove.max) {
        f.meter = 0;
        sig(world, f, 'encore');
        return move === 'sspecial' ? 'tempoEncore' : 'lullabyEncore';
      }
      if (onBeat(world.frame)) {
        if (f.meter < S.groove.max) { f.meter++; sig(world, f, 'groove'); }
      } else if (f.meter > 0) {
        f.meter--;
        sig(world, f, 'offbeat');
      }
      f.moveMod = 1 + S.groove.dmgPer * f.meter;
      break;
    }
    default:
      break;
  }
  return move;
}

/** The Bard's beat: is this frame close enough to a beat? */
export function onBeat(frame: number): boolean {
  const g = SIGNATURE.groove;
  const phase = frame % g.beat;
  return phase <= g.window || phase >= g.beat - g.window;
}

/** How far through the current beat, 0 right on it. */
export function beatPhase(frame: number): number {
  return (frame % SIGNATURE.groove.beat) / SIGNATURE.groove.beat;
}

/** Projectiles carry the move's multipliers (and the Chef's soup) from the moment they're thrown. */
export function projectileHit(f: Fighter, hit: HitStats): { hit: HitStats; look?: string } {
  let out: HitStats = hit;
  if (f.moveMod !== 1 || f.moveKb !== 1) out = { ...out, dmg: out.dmg * f.moveMod, bkb: out.bkb * f.moveKb, kbg: out.kbg * f.moveKb };
  if (f.id === 'chef' && f.buffKind === 'soup' && f.move === 'nspecial') {
    out = { ...out, dmg: out.dmg + SIGNATURE.pantry.soupDmg, stun: Math.max(out.stun ?? 0, SIGNATURE.pantry.soupStun) };
  }
  return { hit: out, look: f.moveSig === 'golden' ? 'goldbullet' : undefined };
}

/** Spark's blink goes a shorter way when it fizzles. */
export function blinkScale(f: Fighter): number {
  return f.moveSig === 'fizzle' ? SIGNATURE.mana.fizzleBlink : 1;
}

/** Spark's rewind undoes the damage taken since then, unless it fizzled. */
export function rewindHeals(f: Fighter): boolean {
  return f.id === 'spark' && f.moveSig !== 'fizzle';
}

/** The frame a move's `signature` action happens on: the Chef serves its recipe. */
export function signatureAction(world: World, f: Fighter): void {
  if (f.id !== 'chef' || f.pantry.length < SIGNATURE.pantry.size) return;
  const recipe = recipeOf(f.pantry);
  const P = SIGNATURE.pantry;
  f.pantry = [];
  switch (recipe) {
    case 'chili': f.buff = P.chiliFrames; break;
    case 'soup': f.buff = P.soupFrames; break;
    case 'stew': f.buff = 0; f.percent = Math.max(0, f.percent - P.stewHeal); break;
    case 'feast': f.buff = P.feastFrames; f.hasted = Math.max(f.hasted, P.feastFrames); break;
  }
  f.buffKind = f.buff > 0 ? recipe : '';
  sig(world, f, recipe);
}

/** Which recipe a full pantry makes: one of each is the Chef's Special (a feast); otherwise the ingredient there's most of. */
export function recipeOf(pantry: readonly number[]): Recipe {
  const n = [0, 0, 0];
  for (const i of pantry) n[i] = (n[i] ?? 0) + 1;
  if (n[0] === 1 && n[1] === 1 && n[2] === 1) return 'feast';
  if (n[1]! >= 2) return 'chili';
  if (n[2]! >= 2) return 'stew';
  return 'soup';
}

export const INGREDIENTS: readonly Ingredient[] = ['tomato', 'pepper', 'meat'];

// ---------------------------------------------------------------------------------------------
// Hits

export interface SignatureStrike {
  melee: boolean;
  isThrow?: boolean;
  move?: MoveId;
  tip?: boolean;
  /** A signature shot (the golden bullet). */
  sig?: string;
}

/** Multipliers a signature puts on a hit about to land, and what to call it. Spends what the hit spends. */
export function strikeMods(world: World, a: Fighter, t: Fighter, opts: SignatureStrike): { dmg: number; kb: number; bonus: number; sig?: string } {
  let dmg = 1;
  let kb = 1;
  let bonus = 0;
  let name: string | undefined = opts.sig;
  // The move's own multipliers (projectiles already carry theirs).
  if (opts.melee && !opts.isThrow) {
    dmg *= a.moveMod;
    kb *= a.moveKb;
    bonus += a.moveBonus;
    if (a.moveSig === 'payback' || a.moveSig === 'kopunch' || a.moveSig === 'flashcut') name = a.moveSig;
  }
  // Chains: hits in a row.
  a.chain = world.frame - a.chainFrame <= chainWindow(a) ? a.chain + 1 : 1;
  a.chainFrame = world.frame;
  switch (a.id) {
    case 'blade':
      if (opts.melee) dmg *= 1 + SIGNATURE.edge.dmgPerLevel * a.meter;
      break;
    case 'chef':
      if (a.buffKind === 'chili') dmg *= SIGNATURE.pantry.chiliDmg;
      break;
    case 'ninja': {
      const marks = t.tags[a.slot] ?? 0;
      if (opts.move === 'sspecial' && marks > 0) {
        bonus += SIGNATURE.marks.dmgPer * marks;
        kb *= 1 + SIGNATURE.marks.kbPer * marks;
        t.tags[a.slot] = 0;
        t.tagTime[a.slot] = 0;
        name = 'assassinate';
      }
      break;
    }
    case 'yoyo': {
      const T = SIGNATURE.trick;
      dmg *= Math.min(T.maxDmg, 1 + T.dmgPer * (a.chain - 1));
      if (a.chain >= T.finisherFrom) kb *= 1 + T.kbPer * a.chain;
      break;
    }
    default:
      break;
  }
  return { dmg, kb, bonus, sig: name };
}

/** After a hit lands (not shielded or countered): fill and drain meters, gather, mark, haunt. */
export function afterStrike(world: World, a: Fighter, t: Fighter, dmg: number, launched: boolean, opts: SignatureStrike): void {
  const S = SIGNATURE;
  // The one hit: the attacker's side.
  switch (a.id) {
    case 'brawler': {
      if (opts.move === 'kopunch') break;
      const was = a.meter;
      const combo = Math.min(S.ko.chainMaxMult, 1 + S.ko.chainBonus * (a.chain - 1));
      a.meter = Math.min(S.ko.max, a.meter + dmg * S.ko.perDealt * combo);
      if (was < S.ko.max && a.meter >= S.ko.max) sig(world, a, 'koReady');
      break;
    }
    case 'blade':
      if (opts.tip && a.meter < S.edge.max) { a.meter++; sig(world, a, 'edge'); }
      break;
    case 'spark':
      if (opts.melee) a.meter = Math.min(S.mana.max, a.meter + S.mana.perMeleeHit);
      break;
    case 'ninja':
      if (opts.move !== 'sspecial' && dmg > 0) {
        t.tags[a.slot] = Math.min(S.marks.max, (t.tags[a.slot] ?? 0) + 1);
        t.tagTime[a.slot] = S.marks.frames;
        sig(world, a, 'mark', t.slot);
      }
      break;
    case 'gunslinger':
      // The golden bullet spent the streak; it doesn't start a new one.
      if (!opts.melee && opts.move === 'nspecial' && opts.sig !== 'golden') a.meter = Math.min(S.streak.max, a.meter + 1);
      break;
    case 'chef':
      // Each melee move gives one ingredient, however many times it hits.
      if (opts.melee && a.moveSig !== 'gathered' && a.pantry.length < S.pantry.size && opts.move) {
        const kind = opts.isThrow ? 2 : AERIALS.has(opts.move) ? 1 : 0;
        a.pantry.push(kind);
        a.moveSig = 'gathered';
        sig(world, a, 'ingredient');
      }
      break;
    case 'ghost': {
      const haunt = t.tags[a.slot] ?? 0;
      if (!opts.melee && opts.move === 'nspecial' && haunt >= S.haunt.max) {
        t.tags[a.slot] = 0;
        t.tagTime[a.slot] = 0;
        t.puppetBy = a.slot;
        t.puppet = S.haunt.puppetFrames;
        t.cursed = 0; // The Ghost steers now; no swapped keys on top.
        t.rawPrev = { ...t.prev };
        sig(world, a, 'possess', t.slot);
      } else if (dmg > 0) {
        t.tags[a.slot] = Math.min(S.haunt.max, haunt + 1);
        t.tagTime[a.slot] = S.haunt.frames;
        sig(world, a, 'haunt', t.slot);
      }
      break;
    }
    case 'yoyo':
      if (a.chain >= SIGNATURE.trick.finisherFrom) sig(world, a, 'trick');
      break;
    default:
      break;
  }
  // The one hit: the target's side.
  t.chain = 0;
  switch (t.id) {
    case 'brawler':
      t.meter = Math.min(S.ko.max, t.meter + dmg * S.ko.perTaken);
      if (launched) t.meter = Math.max(0, t.meter - S.ko.launchLoss);
      break;
    case 'blade':
      if (dmg > 0 && t.meter > 0) t.meter = 0;
      break;
    case 'bard':
      if (launched && t.meter > 0) t.meter--;
      break;
    default:
      break;
  }
}

/** Armor soaked a hit. Titan stores it as payback; the Chef's feast armor doesn't. */
export function onArmor(t: Fighter, dmg: number): void {
  if (t.id === 'titan') t.meter = Math.min(SIGNATURE.payback.max, t.meter + dmg);
}

/** The Chef's feast: light hits don't flinch it while it attacks. */
export function feastArmor(t: Fighter, kb: number): boolean {
  return t.id === 'chef' && t.buffKind === 'feast' && t.action === 'attack' && kb < SIGNATURE.pantry.feastArmorKb;
}

/** A shot ran out or hit a wall without touching anyone. The Gunslinger's streak breaks. */
export function onProjectileMiss(world: World, p: Projectile): void {
  const owner = world.fighters[p.owner];
  if (owner?.id === 'gunslinger' && p.move === 'nspecial') owner.meter = 0;
}

/** Ninja's Shadow Step goes for the most-marked foe in range first. */
export function shadowStepPriority(f: Fighter, o: Fighter): number {
  return f.id === 'ninja' ? (o.tags[f.slot] ?? 0) : 0;
}

// ---------------------------------------------------------------------------------------------
// The HUD meter

export interface SignatureGauge {
  /** The mechanic's name, shown small. */
  label: string;
  /** 0..1 fill of the bar (bar meters), or pips lit out of `pips`. */
  value: number;
  pips?: number;
  lit?: number;
  /** The Chef's pantry: what's in each slot (-1 empty). */
  items?: number[];
  /** Full: the signature move is ready. */
  ready: boolean;
  /** Short text beside the meter ("KO PUNCH", "x5", "+18"). */
  text?: string;
  /** The Bard's beat pulse, 0..1 (1 right on the beat). */
  beat?: number;
}

/** What a fighter's signature meter shows right now (null for fighters without one). */
export function signatureGauge(world: World, f: Fighter): SignatureGauge | null {
  const S = SIGNATURE;
  const maxTag = () => Math.max(0, ...world.fighters.filter((o) => o !== f).map((o) => o.tags[f.slot] ?? 0));
  switch (f.id) {
    case 'brawler': {
      const ready = f.meter >= S.ko.max;
      return { label: 'KO', value: f.meter / S.ko.max, ready, text: ready ? 'KO PUNCH' : `${Math.floor(f.meter)}%` };
    }
    case 'blade':
      return { label: 'EDGE', value: f.meter / S.edge.max, pips: S.edge.max, lit: f.meter, ready: f.meter >= S.edge.max, text: f.meter >= S.edge.max ? 'FLASH CUT' : undefined };
    case 'spark':
      return { label: 'MANA', value: f.meter / S.mana.max, ready: false, text: `${Math.floor(f.meter)}` };
    case 'titan':
      return { label: 'PAYBACK', value: f.meter / S.payback.max, ready: f.meter >= S.payback.max * 0.5, text: f.meter > 0 ? `+${Math.floor(f.meter * S.payback.dmgShare)}` : undefined };
    case 'ninja': {
      const n = maxTag();
      return { label: 'MARKS', value: n / S.marks.max, pips: S.marks.max, lit: n, ready: n >= S.marks.max, text: n > 0 ? 'STEP IN' : undefined };
    }
    case 'gunslinger': {
      const golden = f.ammo === 1;
      return { label: 'STREAK', value: f.meter / S.streak.max, pips: S.streak.max, lit: f.meter, ready: golden, text: golden ? 'GOLDEN NEXT' : `${f.ammo}/6` };
    }
    case 'chef': {
      const items = [0, 1, 2].map((i) => f.pantry[i] ?? -1);
      const full = f.pantry.length >= S.pantry.size;
      const text = f.buff > 0 ? `${f.buffKind.toUpperCase()} ${Math.ceil(f.buff / 60)}s` : full ? `COOK ${recipeOf(f.pantry).toUpperCase()}` : undefined;
      return { label: 'PANTRY', value: f.pantry.length / S.pantry.size, items, ready: full, text };
    }
    case 'ghost': {
      const n = maxTag();
      return { label: 'HAUNT', value: n / S.haunt.max, pips: S.haunt.max, lit: n, ready: n >= S.haunt.max, text: n >= S.haunt.max ? 'POSSESS' : undefined };
    }
    case 'yoyo': {
      const live = f.chain > 0 && world.frame - f.chainFrame <= S.trick.window;
      return { label: 'COMBO', value: Math.min(1, f.chain / 8), ready: live && f.chain >= S.trick.finisherFrom, text: live && f.chain > 1 ? `x${f.chain}` : undefined };
    }
    case 'bard': {
      const ph = beatPhase(world.frame);
      return {
        label: 'GROOVE', value: f.meter / S.groove.max, pips: S.groove.max, lit: f.meter, ready: f.meter >= S.groove.max,
        text: f.meter >= S.groove.max ? 'ENCORE' : undefined, beat: Math.max(0, 1 - Math.min(ph, 1 - ph) * 6),
      };
    }
    default:
      return null;
  }
}

/** How full the Brawler's KO meter is, 0 to 1 (the figure's gloves glow when full). */
export function koFraction(f: Fighter): number {
  return f.id === 'brawler' ? Math.min(1, f.meter / SIGNATURE.ko.max) : 0;
}

/** Name of each fighter's mechanic, for the select screen and the controls card. */
export const SIGNATURE_NAMES: Partial<Record<FighterId, string>> = {
  brawler: 'KO Meter', blade: 'Edge', spark: 'Mana', titan: 'Payback', ninja: 'Marks',
  gunslinger: 'Hot Streak', chef: 'Pantry', ghost: 'Haunt', yoyo: 'Trick Combo', bard: 'Groove',
};
