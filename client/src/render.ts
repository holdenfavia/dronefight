// Side-view renderer (ADR-0070): Canvas 2D, a camera that frames every fighter, parallax city
// backdrop, stage art, fighters, hit effects and screen shake.

import { FIGHTERS, type MoveId } from '../../shared/fighter/fighters';
import { INGREDIENTS, koFraction, signatureGauge } from '../../shared/fighter/signature';
import { activeHitboxes, centerY, chargeFraction, fighterDef, isAlive, moveActive, type Fighter, type GameEvent, type Projectile, type World } from '../../shared/fighter/sim';
import { SHIELD } from '../../shared/fighter/config';
import type { Platform } from '../../shared/fighter/stages';
import { ATTACK_COLORS, CAMERA, CITY_LOOKS, CPU_TAG, FALL, FEEL, HARBOR, PALETTE, SIGNATURE_LOOKS, fighterColor, type CityLook } from './config';
import { moveLook, type MoveLook } from './moveLooks';
import { drawFighterFigure } from './figures';
import { cheatOn } from './cheats';
import { isPurpleSkyTime } from './purpleSky';
import * as detail from './stageDetail';
import * as winter from './winterStage';
import { FOCAL, blend, box3, contactShadow, cylinder, frontRect, glow, haze, project, rgbOf, sphere, tone, toHex, type BoxStyle, type Eye } from './shade';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  /** streak: a line along its motion; ember: a glowing dot; bolt: a crackle of lightning; wisp: a curl of wind; wave: a flat shockwave. */
  kind: 'spark' | 'smoke' | 'dust' | 'ring' | 'star' | 'streak' | 'ember' | 'bolt' | 'wisp' | 'wave';
  grow: number;
}

interface Building {
  x: number;
  w: number;
  h: number;
  windows: boolean;
  /** How deep it runs back, for its side and roof in perspective. */
  d: number;
  /** 0..1, picks what stands on its roof. */
  roof: number;
}

/** Previous positions for smooth drawing between sim frames. */
export interface Prev {
  x: number;
  y: number;
}

/** How far the Helipad's truss tower lifts the pad above its skyscraper's roof. */
const HELIPAD_TOWER = 120;

/** The sky (gradient, sun, light shafts) is painted into a cache this much bigger than the screen on each side, and repainted this often. */
const SKY_CACHE = { pad: 40, everyFrames: 20 } as const;

/** Depths of the stage's solid parts (world units; the fighters stand at depth 0, positive is away from you). */
const STAGE_DEPTH = {
  /** The main platform's front face sits a little in front of the fighters, its back well behind them. */
  slabFront: -30,
  slabBack: 150,
  /** Half the depth of a pass-through girder. */
  beam: 16,
  /** Where the eye sits, as a fraction of the screen height: above the middle, so you look down onto the stage. */
  eyeHeight: 0.3,
} as const;

/** The Harvest Farm's ground, seen from above (world units of depth). */
const FARM_FIELD = {
  /** Where the grass field meets the hills. */
  back: 420,
  /** Half the width (in depth) of the dirt lane the fighters stand on. */
  lane: 34,
  /** Spacing of the plowed rows in the pumpkin patch in front. */
  furrow: 56,
  /** How much bigger than at depth 0 the nearest ground may get (caps how far toward you it is drawn). */
  maxNear: 4,
} as const;

/** The Harvest Farm oak's crown, cached as an image (world units around the bough; y up from the bough). */
const OAK_CROWN = {
  /** Image width and height. */
  w: 520,
  h: 280,
  /** Height above the bough of the image's middle row, and how far above that the image's top is. */
  mid: 70,
  top: 150,
} as const;

/** "r,g,b" as "#rrggbb". */
function rgbHex(rgb: string): string {
  return '#' + rgb.split(',').map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

/** A building color seen through the horizon haze, as one flat color. */
function blendHaze(color: string, hazeRgb: string, alpha: number): string {
  return blend(tone(color, -0.25), rgbHex(hazeRgb), alpha);
}

/** A shipping container color, for any whole number. */
function containerColor(n: number): string {
  const list = HARBOR.containers;
  return list[((n % list.length) + list.length) % list.length]!;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private cam = { x: 0, y: 150, zoom: 0.8 };
  private shake = 0;
  private particles: Particle[] = [];
  private flashes = new Map<number, number>();
  private koBeams: { x: number; y: number; color: string; life: number }[] = [];
  /** Floating words: PARRY!, COUNTER!, TECH. */
  private popups: { x: number; y: number; text: string; color: string; life: number }[] = [];
  /** Recent hitbox positions per fighter, drawn as a swing trail. */
  private trails = new Map<number, { x: number; y: number; r: number }[]>();
  private far: Building[] = [];
  private near: Building[] = [];
  private time = 0;
  private purple = false;
  /** The Harvest Farm (seasonal, ADR-0082): an autumn sky and countryside instead of the city. */
  private fall = false;
  /** The city stage's time of day (Rooftop, Helipad, Crane Yard). */
  private look: CityLook = CITY_LOOKS.rooftop;
  private stageId = 'rooftop';
  private mirrored = false;
  private purpleCheck = 0;
  private platforms: Platform[] = [];
  private lastWorld: World | null = null;

  /** `size`: draw at this fixed size (CSS pixels, at 1x) instead of filling the window, e.g. for stage thumbnails. */
  constructor(parent: HTMLElement, private size: { w: number; h: number } | null = null) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
    if (!size) window.addEventListener('resize', () => this.resize());
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = -2600; x < 2600; ) {
      const w = 60 + rand() * 120;
      this.far.push({ x, w, h: 160 + rand() * 360, windows: false, d: 40 + rand() * 60, roof: rand() });
      x += w + rand() * 20;
    }
    for (let x = -2200; x < 2200; ) {
      const w = 80 + rand() * 140;
      this.near.push({ x, w, h: 120 + rand() * 420, windows: true, d: 50 + rand() * 80, roof: rand() });
      x += w + 10 + rand() * 50;
    }
  }

  resize(): void {
    this.dpr = this.size ? 1 : Math.min(2, window.devicePixelRatio || 1);
    this.w = this.size?.w ?? window.innerWidth;
    this.h = this.size?.h ?? window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  /** Over-head tags by slot (setTags). */
  private tags: { text: string; cpu: boolean }[] = [];

  /** Reset effects and snap the camera, for a new match. */
  reset(world: World): void {
    this.particles = [];
    this.koBeams = [];
    this.popups = [];
    this.trails.clear();
    this.flashes.clear();
    this.shake = 0;
    this.platforms = world.stage.platforms;
    const target = this.cameraTarget(world);
    this.cam = { ...target };
  }

  /** Turn sim events into effects. */
  onEvents(world: World, events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const attacker = world.fighters[e.attacker]!;
          const look = e.move ? moveLook(attacker.id, e.move) : null;
          const color = look?.color ?? fighterColor(world.fighters[e.attacker]!);
          if (look) this.hitFx(look, e.x, e.y, color, e.kb, e.dmg);
          const n = 6 + Math.min(20, Math.floor(e.dmg * 1.4));
          for (let i = 0; i < n; i++) this.spark(e.x, e.y, color, 200 + e.kb * 6);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 14, max: 14, size: 10 + e.dmg * 2, color: '#fff', kind: 'ring', grow: 4 + e.kb * 0.05 });
          if (e.dmg >= 10) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 10, max: 10, size: 14 + e.dmg, color: '#fff6c9', kind: 'star', grow: 1 });
          this.flashes.set(e.target, 1);
          if (e.armored) this.popup(world.fighters[e.target]!, 'ARMOR', '#ffb36b');
          if (e.spam) this.popup(world.fighters[e.attacker]!, 'SPAM', '#c8c8c8');
          if (e.tip) {
            // A clean sword-tip hit: a bright white star and a ring.
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 14, max: 14, size: 16 + e.dmg, color: ATTACK_COLORS.tip, kind: 'star', grow: 2.5 });
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 12, max: 12, size: 8, color: ATTACK_COLORS.tip, kind: 'ring', grow: 5 });
          }
          if (e.sig) {
            // A signature hit (ADR-0079): the Knockout Punch, Flash Cut, Payback, Assassinate.
            const sc = SIGNATURE_LOOKS[e.sig] ?? { text: e.sig.toUpperCase(), color: ATTACK_COLORS.rage };
            for (let i = 0; i < 30; i++) this.ember(e.x, e.y, i % 3 ? sc.color : ATTACK_COLORS.smashCore, 600);
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 26, max: 26, size: 24, color: sc.color, kind: 'ring', grow: 10 });
            this.popup(attacker, sc.text, sc.color);
            this.shake = Math.min(FEEL.maxShake, this.shake + 10);
          }
          this.shake = Math.min(FEEL.maxShake, this.shake + e.kb * FEEL.shakePerKb);
          break;
        }
        case 'parry':
        case 'counter': {
          const slot = e.type === 'parry' ? e.target : e.slot;
          for (let i = 0; i < 14; i++) this.spark(e.x, e.y, '#ffffff', 420);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 18, max: 18, size: 14, color: '#bff4ff', kind: 'ring', grow: 6 });
          this.popup(world.fighters[slot]!, e.type === 'parry' ? 'PARRY!' : 'COUNTER!', '#bff4ff');
          this.shake = Math.min(FEEL.maxShake, this.shake + 6);
          break;
        }
        case 'grab': {
          const f = world.fighters[e.target]!;
          this.particles.push({ x: f.x, y: centerY(f), vx: 0, vy: 0, life: 10, max: 10, size: 12, color: fighterColor(world.fighters[e.slot]!), kind: 'ring', grow: 3 });
          break;
        }
        case 'tech':
          this.popup(world.fighters[e.slot]!, 'TECH', '#ffe27a');
          break;
        case 'shieldhit':
          for (let i = 0; i < 5; i++) this.spark(e.x, e.y, '#bfe8ff', 220);
          break;
        case 'shieldbreak': {
          const f = world.fighters[e.target]!;
          for (let i = 0; i < 24; i++) this.spark(f.x, centerY(f), '#bfe8ff', 500);
          this.shake = Math.min(FEEL.maxShake, this.shake + 10);
          break;
        }
        case 'ko': {
          const color = fighterColor(world.fighters[e.slot]!);
          this.koBeams.push({ x: e.x, y: e.y, color, life: 50 });
          for (let i = 0; i < 40; i++) this.spark(e.x, e.y, i % 2 ? color : '#fff', 900);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 30, max: 30, size: 30, color, kind: 'ring', grow: 16 });
          this.shake = FEEL.maxShake;
          break;
        }
        case 'jump': {
          const f = world.fighters[e.slot]!;
          for (let i = 0; i < (e.air ? 6 : 8); i++) {
            this.particles.push({ x: f.x + (Math.random() - 0.5) * 30, y: f.y + (e.air ? 4 : 2), vx: (Math.random() - 0.5) * 160, vy: e.air ? -120 - Math.random() * 120 : 30 + Math.random() * 40, life: 22, max: 22, size: 5 + Math.random() * 6, color: e.air ? '#ffffffaa' : '#d8cbb8', kind: e.air ? 'smoke' : 'dust', grow: 0.4 });
          }
          if (e.air) this.particles.push({ x: f.x, y: f.y + 2, vx: 0, vy: -40, life: 12, max: 12, size: 12, color: '#ffffff', kind: 'ring', grow: 2.5 });
          break;
        }
        case 'land': {
          const f = world.fighters[e.slot]!;
          for (let i = 0; i < (e.hard ? 12 : 5); i++) {
            const dir = i % 2 ? 1 : -1;
            this.particles.push({ x: f.x + dir * 10, y: f.y + 2, vx: dir * (60 + Math.random() * 160), vy: 20 + Math.random() * 50, life: 20, max: 20, size: 4 + Math.random() * 5, color: '#d8cbb8', kind: 'dust', grow: 0.3 });
          }
          break;
        }
        case 'explode':
          if (e.look !== 'bomb') { this.splat(e.x, e.y, e.r, e.look); break; }
          for (let i = 0; i < 30; i++) this.spark(e.x, e.y, i % 3 ? PALETTE.orange : '#ffe27a', 600);
          for (let i = 0; i < 10; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 100, vy: 40 + Math.random() * 80, life: 50, max: 50, size: 16 + Math.random() * 14, color: '#55504a', kind: 'smoke', grow: 0.6 });
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 16, max: 16, size: e.r * 0.4, color: '#ffe27a', kind: 'ring', grow: e.r * 0.06 });
          this.shake = Math.min(FEEL.maxShake, this.shake + 12);
          break;
        case 'reflect':
          for (let i = 0; i < 12; i++) this.spark(e.x, e.y, '#ffffff', 380);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 14, max: 14, size: 12, color: '#ffffff', kind: 'ring', grow: 5 });
          this.popup(world.fighters[e.slot]!, 'REFLECT!', '#ffffff');
          break;
        case 'signature': {
          // Meters filling, recipes served, possessions (ADR-0079).
          const f = world.fighters[e.slot]!;
          const on = e.target >= 0 ? world.fighters[e.target]! : f;
          let text: string;
          let color: string = ATTACK_COLORS.special[f.id] ?? '#fff';
          switch (e.kind) {
            case 'koReady': text = 'KO READY'; color = ATTACK_COLORS.rage; break;
            case 'kopunch': text = 'KNOCKOUT!'; color = ATTACK_COLORS.rage; break;
            case 'edge': text = `EDGE ${f.meter}`; break;
            case 'flashcut': text = 'FLASH CUT'; break;
            case 'fizzle': text = 'FIZZLE'; color = '#9aa4b0'; break;
            case 'undo': text = 'UNDONE'; break;
            case 'payback': text = 'PAYBACK'; break;
            case 'mark': text = `MARK ${on.tags[e.slot] ?? 0}`; break;
            case 'assassinate': text = 'ASSASSINATE'; break;
            case 'golden': text = 'GOLDEN'; break;
            case 'ingredient': text = (INGREDIENTS[f.pantry[f.pantry.length - 1] ?? 0] ?? '').toUpperCase(); break;
            case 'chili': text = 'CHILI! HITS BURN'; break;
            case 'soup': text = 'TOMATO SOUP! DAZING FOOD'; break;
            case 'stew': text = 'STEW! HEALED'; break;
            case 'feast': text = "CHEF'S SPECIAL!"; break;
            case 'haunt': text = `HAUNT ${on.tags[e.slot] ?? 0}`; color = ATTACK_COLORS.curse; break;
            case 'possess': text = 'POSSESSED!'; color = ATTACK_COLORS.curse; break;
            case 'trick': text = `x${f.chain} TRICK`; break;
            case 'groove': text = 'ON BEAT'; break;
            case 'offbeat': text = 'OFF BEAT'; color = '#9aa4b0'; break;
            case 'encore': text = 'ENCORE!'; break;
            // Christmas (ADR-0091).
            case 'snowpack': text = `SNOW ${f.meter}`; break;
            case 'avalanche': text = 'AVALANCHE!'; break;
            case 'woundUp': text = 'WOUND UP'; break;
            case 'crunch': text = 'CRUNCH!'; break;
            case 'sugarReady': text = 'SUGAR READY'; break;
            case 'sugarrush': text = 'SUGAR RUSH!'; break;
            case 'naughty': text = 'NAUGHTY!'; color = '#5a5a66'; break;
            case 'coal': text = 'COAL!'; color = '#5a5a66'; break;
            case 'glow': text = `GLOW ${f.meter}`; break;
            case 'beacon': text = 'BEACON!'; break;
            case 'batchReady': text = 'OVEN HOT'; break;
            case 'freshbatch': text = 'FRESH BATCH! HEALED'; break;
            default: text = '';
          }
          // Small, frequent ones only get a ring; the big moments get a popup.
          const quiet = e.kind === 'groove' || e.kind === 'offbeat' || e.kind === 'mark' || e.kind === 'haunt';
          if (text && !quiet) this.popup(on, text, color);
          this.particles.push({ x: on.x, y: centerY(on), vx: 0, vy: 0, life: 18, max: 18, size: quiet ? 8 : 14, color, kind: 'ring', grow: quiet ? 2.5 : 6 });
          break;
        }
        case 'status': {
          const f = world.fighters[e.slot]!;
          const text = { curse: 'CURSED', slow: 'SLOWED', haste: 'TEMPO!', reload: 'RELOADED' }[e.status];
          const color = { curse: ATTACK_COLORS.curse, slow: ATTACK_COLORS.slow, haste: ATTACK_COLORS.haste, reload: ATTACK_COLORS.special.gunslinger }[e.status];
          this.popup(f, text, color);
          this.particles.push({ x: f.x, y: centerY(f), vx: 0, vy: 0, life: 18, max: 18, size: 12, color, kind: 'ring', grow: 4 });
          break;
        }
        case 'warp': {
          // Blink and rewind: a puff where it left, a burst where it arrived, a faint streak between.
          const f = world.fighters[e.slot]!;
          const color = ATTACK_COLORS.special[f.id];
          const h = fighterDef(f).height / 2;
          for (const [x, y, n] of [[e.fromX, e.fromY, 8], [e.x, e.y, 14]] as const) {
            this.particles.push({ x, y: y + h, vx: 0, vy: 0, life: 16, max: 16, size: 10, color, kind: 'ring', grow: 4 });
            for (let i = 0; i < n; i++) this.ember(x, y + h, i % 2 ? color : '#ffffff', 240);
          }
          for (let i = 1; i < 6; i++) {
            const t = i / 6;
            this.particles.push({ x: e.fromX + (e.x - e.fromX) * t, y: e.fromY + (e.y - e.fromY) * t + h, vx: 0, vy: 0, life: 10 + i * 2, max: 20, size: 4, color, kind: 'ember', grow: -0.02 });
          }
          break;
        }
        case 'respawn': {
          const f = world.fighters[e.slot]!;
          this.particles.push({ x: f.x, y: centerY(f), vx: 0, vy: 0, life: 24, max: 24, size: 10, color: fighterColor(world.fighters[e.slot]!), kind: 'ring', grow: 5 });
          break;
        }
        default:
          break;
      }
    }
  }

  /** The hit effect for this kind of attack, on top of the common sparks. */
  private hitFx(look: MoveLook, x: number, y: number, color: string, kb: number, dmg: number): void {
    const n = 4 + Math.min(12, Math.floor(dmg));
    switch (look.fx) {
      case 'flame':
        for (let i = 0; i < n * 2; i++) this.ember(x, y, i % 3 ? color : ATTACK_COLORS.smashCore, 300 + kb * 4);
        this.particles.push({ x, y, vx: 0, vy: 0, life: 18, max: 18, size: 18 + dmg, color: ATTACK_COLORS.smashCore, kind: 'star', grow: 2 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 22, max: 22, size: 20, color, kind: 'ring', grow: 7 });
        break;
      case 'spike':
        for (let i = 0; i < n + 4; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
          const sp = 500 + Math.random() * 600;
          this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 16, max: 16, size: 3, color: i % 2 ? color : '#ffffff', kind: 'streak', grow: 0 });
        }
        this.particles.push({ x, y, vx: 0, vy: 0, life: 16, max: 16, size: 14, color, kind: 'ring', grow: 5 });
        break;
      case 'zap':
        for (let i = 0; i < 3 + Math.floor(dmg / 3); i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 8, max: 8, size: 26 + dmg * 2, color, kind: 'bolt', grow: 0 });
        break;
      case 'wind':
        for (let i = 0; i < 6; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 22, max: 22, size: 10 + Math.random() * 10, color: '#ffffff', kind: 'wisp', grow: 0.8 });
        break;
      case 'shock':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 18, max: 18, size: 16, color, kind: 'wave', grow: 9 });
        break;
      case 'energy':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 16, max: 16, size: 10, color, kind: 'ring', grow: 4 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 12, max: 12, size: 8, color: '#ffffff', kind: 'ring', grow: 2.5 });
        for (let i = 0; i < n; i++) this.ember(x, y, color, 260);
        break;
      case 'puff':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 8, max: 8, size: 6, color: '#ffffff', kind: 'ring', grow: 2 });
        break;
      case 'spin':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, size: 12, color, kind: 'ring', grow: 3 });
        break;
      default:
        break;
    }
  }

  /** Smoke bombs and thrown food burst into their own kind of mess. */
  private splat(x: number, y: number, r: number, look: string): void {
    const color = look === 'smoke' ? '#c9c9c9' : look === 'tomato' ? '#e8322a' : look === 'pie' ? '#f5e6c8' : '#7a4a2a';
    if (look === 'smoke') {
      for (let i = 0; i < 16; i++) {
        this.particles.push({ x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r * 0.8, vx: (Math.random() - 0.5) * 120, vy: 20 + Math.random() * 60, life: 60, max: 60, size: 18 + Math.random() * 16, color: '#bdbdbd', kind: 'smoke', grow: 0.5 });
      }
      return;
    }
    for (let i = 0; i < 18; i++) this.spark(x, y, i % 3 ? color : '#ffffff', 420);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, size: r * 0.4, color, kind: 'ring', grow: r * 0.05 });
  }

  private ember(x: number, y: number, color: string, speed: number): void {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 80, life: 20 + Math.random() * 20, max: 40, size: 2 + Math.random() * 3, color, kind: 'ember', grow: -0.04 });
  }

  /** Effects that run during a move's swing. */
  private swingFx(f: Fighter, look: MoveLook, color: string): void {
    const boxes = activeHitboxes(f);
    const trail = this.trails.get(f.slot) ?? [];
    if (boxes.length && look.fx !== 'grab') {
      let x = 0; let y = 0; let r = 0;
      for (const b of boxes) { x += b.x; y += b.y; r = Math.max(r, b.r); }
      trail.push({ x: x / boxes.length, y: y / boxes.length, r });
      if (trail.length > 7) trail.shift();
      const p = trail[trail.length - 1]!;
      const first = f.action === 'attack' && f.move && boxes.some((b) => b.hb.from === f.frame);
      switch (look.fx) {
        case 'flame':
          for (let i = 0; i < 3; i++) this.ember(p.x, p.y, i ? color : ATTACK_COLORS.smashCore, 160);
          break;
        case 'zap':
          if (this.time % 3 === 0) this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 5, max: 5, size: p.r * 1.3, color, kind: 'bolt', grow: 0 });
          break;
        case 'wind':
          if (this.time % 2 === 0) this.particles.push({ x: p.x, y: p.y, vx: f.facing * 200, vy: 40, life: 18, max: 18, size: p.r * 0.5, color: '#ffffff', kind: 'wisp', grow: 0.6 });
          break;
        case 'spike':
          this.particles.push({ x: p.x + (Math.random() - 0.5) * p.r, y: p.y, vx: 0, vy: -700, life: 8, max: 8, size: 2.5, color, kind: 'streak', grow: 0 });
          break;
        case 'energy':
          this.ember(p.x, p.y, color, 90);
          break;
        case 'shock':
          if (first) {
            this.particles.push({ x: f.x, y: f.y + 4, vx: 0, vy: 0, life: 20, max: 20, size: 20, color, kind: 'wave', grow: 10 });
            for (let i = 0; i < 14; i++) {
              const d = i % 2 ? 1 : -1;
              this.particles.push({ x: f.x + d * 20, y: f.y + 2, vx: d * (200 + Math.random() * 300), vy: 60 + Math.random() * 120, life: 24, max: 24, size: 5 + Math.random() * 6, color: '#d8cbb8', kind: 'dust', grow: 0.4 });
            }
          }
          break;
        case 'puff':
          if (first) this.particles.push({ x: p.x, y: p.y, vx: f.facing * 120, vy: 0, life: 8, max: 8, size: 5, color: '#ffffff', kind: 'ring', grow: 1.5 });
          break;
        default:
          break;
      }
      // Low sweeps kick up dust along the floor.
      if (look.pose === 'low' && f.grounded && this.time % 2 === 0) {
        this.particles.push({ x: p.x, y: f.y + 2, vx: f.facing * 180, vy: 30, life: 16, max: 16, size: 5, color: '#d8cbb8', kind: 'dust', grow: 0.3 });
      }
    } else if (trail.length) {
      trail.shift();
    }
    if (trail.length) this.trails.set(f.slot, trail);
    else this.trails.delete(f.slot);
  }

  private popup(f: Fighter, text: string, color: string): void {
    this.popups.push({ x: f.x, y: f.y + fighterDef(f).height + 40, text, color, life: 40 });
  }

  private spark(x: number, y: number, color: string, speed: number): void {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 14 + Math.random() * 14, max: 28, size: 2 + Math.random() * 3, color, kind: 'spark', grow: 0 });
  }

  private cameraTarget(world: World): { x: number; y: number; zoom: number } {
    const main = world.stage.platforms[0]!;
    const home = world.stage.view ?? main;
    let x1 = home.x1 + 100;
    let x2 = home.x2 - 100;
    let y1 = main.y - 40;
    let y2 = main.y + 200;
    for (const f of world.fighters) {
      if (!isAlive(f)) continue;
      x1 = Math.min(x1, f.x);
      x2 = Math.max(x2, f.x);
      y1 = Math.min(y1, f.y);
      y2 = Math.max(y2, f.y + fighterDef(f).height);
    }
    const b = world.stage.blast;
    const m = CAMERA.blastMargin;
    x1 = Math.max(b.left - m, x1 - CAMERA.padding);
    x2 = Math.min(b.right + m, x2 + CAMERA.padding);
    y1 = Math.max(b.bottom - m, y1 - CAMERA.padding * 0.7);
    y2 = Math.min(b.top + m, y2 + CAMERA.padding * 0.8);
    const unit = this.h / CAMERA.baseHeight;
    const zoom = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, Math.min(this.w / unit / (x2 - x1), CAMERA.baseHeight / (y2 - y1))));
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, zoom };
  }

  /** Pixels per world unit. */
  private get scale(): number {
    return this.cam.zoom * (this.h / CAMERA.baseHeight);
  }

  private sx(x: number): number {
    return (x - this.cam.x) * this.scale + this.w / 2;
  }

  private sy(y: number): number {
    return this.h / 2 - (y - this.cam.y) * this.scale;
  }

  /** +1 when the stage's sun is to the right, -1 when to the left. */
  private light(): 1 | -1 {
    return (this.fall || this.purple ? CITY_LOOKS.rooftop : this.look).sunX >= 0.5 ? 1 : -1;
  }

  /** The eye for the stage itself: the camera's center, at the stage's scale. */
  private eye(): Eye {
    return { vx: this.w / 2, vy: this.h * STAGE_DEPTH.eyeHeight, s: this.scale, light: this.light() };
  }

  /** The scenery view set back to depth z (positive is away from you), so flat scenery sits in perspective. */
  private viewAt(z: number): detail.View {
    const e = this.eye();
    const f = 1500 / (1500 + z * this.scale);
    return {
      ...this.view(),
      sx: (x) => e.vx + (this.sx(x) - e.vx) * f,
      sy: (y) => e.vy + (this.sy(y) - e.vy) * f,
      s: this.scale * f,
    };
  }

  /** What the stage scenery (stageDetail.ts) needs, for this frame. */
  private view(): detail.View {
    return {
      ctx: this.ctx, sx: (x) => this.sx(x), sy: (y) => this.sy(y), s: this.scale, time: this.time,
      purple: this.purple, w: this.w, h: this.h, camX: this.cam.x,
    };
  }

  /** Advance effects by one sim frame. */
  tick(world: World): void {
    this.time++;
    const t = this.cameraTarget(world);
    this.cam.x += (t.x - this.cam.x) * CAMERA.follow;
    this.cam.y += (t.y - this.cam.y) * CAMERA.follow;
    this.cam.zoom += (t.zoom - this.cam.zoom) * CAMERA.follow;
    this.shake *= FEEL.shakeDecay;
    if (this.shake < 0.3) this.shake = 0;
    for (const [slot, v] of this.flashes) {
      const next = v - 0.12;
      if (next <= 0) this.flashes.delete(slot);
      else this.flashes.set(slot, next);
    }
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life--;
      if (p.life <= 0) continue;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      if (p.kind === 'spark') { p.vx *= 0.9; p.vy = p.vy * 0.9 - 12; }
      else if (p.kind === 'smoke' || p.kind === 'dust') { p.vx *= 0.94; p.vy *= 0.94; }
      else if (p.kind === 'ember') { p.vx *= 0.92; p.vy = p.vy * 0.92 + 6; }
      else if (p.kind === 'wisp') { p.vx *= 0.9; p.vy *= 0.9; }
      p.size += p.grow;
      keep.push(p);
    }
    this.particles = keep.length > 800 ? keep.slice(-800) : keep;
    this.koBeams = this.koBeams.filter((b) => --b.life > 0);
    this.popups = this.popups.filter((p) => { p.y += 0.8; return --p.life > 0; });

    // Trails and smoke from the fighters themselves.
    for (const f of world.fighters) {
      if (!isAlive(f)) { this.trails.delete(f.slot); continue; }
      if (f.hitlag > 0) continue;
      const look = f.action === 'attack' && f.move ? moveLook(f.id, f.move) : null;
      if (look) this.swingFx(f, look, look.color ?? fighterColor(f));
      else if (this.trails.has(f.slot)) { const t = this.trails.get(f.slot)!; t.shift(); if (!t.length) this.trails.delete(f.slot); }
      // Charging: sparks gather in.
      const charge = chargeFraction(f);
      if (charge > 0 && this.time % 2 === 0) {
        const c = look?.color ?? fighterColor(f);
        const a = Math.random() * Math.PI * 2;
        const d = 40 + Math.random() * 20;
        const cy0 = centerY(f);
        this.particles.push({ x: f.x + Math.cos(a) * d, y: cy0 + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 16, max: 16, size: 2 + charge * 2, color: c, kind: 'ember', grow: 0 });
      }
      const cy = centerY(f);
      if (f.action === 'hitstun' && f.lastKb > 70 && this.time % 2 === 0) {
        this.particles.push({ x: f.x, y: cy, vx: 0, vy: 0, life: 30, max: 30, size: 8 + f.lastKb * 0.05, color: '#f2efe9', kind: 'smoke', grow: 0.35 });
      }
      if (f.percent >= FEEL.smokePercent && this.time % Math.max(3, 14 - Math.floor(f.percent / 20)) === 0) {
        this.particles.push({ x: f.x - f.facing * 8, y: cy + 8, vx: (Math.random() - 0.5) * 30, vy: 60, life: 40, max: 40, size: 5, color: '#5a5650', kind: 'smoke', grow: 0.25 });
      }
    }
  }

  draw(world: World, prev: readonly Prev[], alpha: number): void {
    const ctx = this.ctx;
    if (++this.purpleCheck % 60 === 1) this.purple = isPurpleSkyTime() || cheatOn('purple');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fall = world.stage.id === 'harvest';
    this.stageId = world.stage.id;
    this.look = CITY_LOOKS[world.stage.id as keyof typeof CITY_LOOKS] ?? CITY_LOOKS.rooftop;
    this.drawSky();
    const sh = this.shake;
    ctx.save();
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawBackdrop();
    this.drawSkyBirds();
    this.drawStage(world);
    this.drawParticles(false);
    this.lastWorld = world;
    for (const p of world.projectiles) this.drawProjectile(p, ATTACK_COLORS.special[world.fighters[p.owner]!.id] ?? fighterColor(world.fighters[p.owner]!), fighterColor(world.fighters[p.owner]!));
    for (const f of world.fighters) {
      if (!isAlive(f)) continue;
      const pv = prev[f.slot];
      const x = pv && f.hitlag === 0 ? pv.x + (f.x - pv.x) * alpha : f.x;
      const y = pv && f.hitlag === 0 ? pv.y + (f.y - pv.y) * alpha : f.y;
      this.drawFighter(world, f, x, y);
    }
    this.drawParticles(true);
    if (this.fall) this.drawFallingLeaves();
    if (this.stageId === 'village') winter.drawSnowfall(this.view());
    this.drawKoBeams();
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life / 12);
      this.label(p.text, this.sx(p.x), this.sy(p.y), p.color);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawOffscreen(world);
  }

  /** The sky behind everything: gradient, sun and light shafts, painted into a cache and redrawn every few frames. */
  private oakCache: { canvas: HTMLCanvasElement; key: string } | null = null;
  private skyCache: { canvas: HTMLCanvasElement; key: string; frame: number } | null = null;

  private drawSky(): void {
    const ctx = this.ctx;
    if (this.stageId === 'village') { winter.drawWinterSky(this.view(), this.cam.y); return; }
    const fall = this.fall && !this.purple;
    const L = this.fall || this.purple ? CITY_LOOKS.rooftop : this.look;
    // The sun drifts a hair with the camera; the cache is a little bigger than the screen so it can slide.
    const pad = SKY_CACHE.pad;
    const key = `${this.w}x${this.h}:${this.dpr}:${this.stageId}:${this.purple}`;
    if (!this.skyCache || this.skyCache.key !== key || this.time - this.skyCache.frame >= SKY_CACHE.everyFrames || this.time < this.skyCache.frame) {
      const canvas = this.skyCache?.canvas ?? document.createElement('canvas');
      canvas.width = Math.round((this.w + pad * 2) * this.dpr);
      canvas.height = Math.round((this.h + pad * 2) * this.dpr);
      const c = canvas.getContext('2d')!;
      c.setTransform(this.dpr, 0, 0, this.dpr, pad * this.dpr, pad * this.dpr);
      this.paintSky(c, L, fall);
      this.skyCache = { canvas, key, frame: this.time };
    }
    const ox = -this.cam.x * 0.03;
    const oy = this.cam.y * 0.02;
    const cx = Math.round(Math.max(-pad, Math.min(pad, ox)));
    const cy = Math.round(Math.max(-pad, Math.min(pad, oy)));
    ctx.drawImage(this.skyCache.canvas, cx - pad, cy - pad, this.w + pad * 2, this.h + pad * 2);
    this.drawClouds(L, fall);
  }

  private paintSky(ctx: CanvasRenderingContext2D, L: CityLook, fall: boolean): void {
    const pad = SKY_CACHE.pad;
    const g = ctx.createLinearGradient(0, -pad, 0, this.h + pad);
    g.addColorStop(0, this.purple ? PALETTE.purpleTop : fall ? FALL.skyTop : L.skyTop);
    g.addColorStop(0.75, this.purple ? PALETTE.purpleHorizon : fall ? FALL.skyHorizon : L.skyHorizon);
    g.addColorStop(1, this.purple ? '#f0dcff' : fall ? FALL.skyBottom : L.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(-pad, -pad, this.w + pad * 2, this.h + pad * 2);
    const sunX = this.w * L.sunX;
    const sunY = this.h * L.sunY;
    const r = this.h * L.sunSize;
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
    sg.addColorStop(0, L.sunCore);
    sg.addColorStop(0.08, L.sunGlow);
    sg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-pad, -pad, this.w + pad * 2, this.h + pad * 2);
    // Light shafts fanning out from the sun, turning very slowly.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rays = 9;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + this.time * 0.0008 + Math.sin(i * 3.1) * 0.2;
      const wdt = 0.05 + (i % 3) * 0.025;
      const len = this.h * (0.9 + (i % 2) * 0.4);
      const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, len);
      rg.addColorStop(0, 'rgba(255,236,200,0.10)');
      rg.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.arc(sunX, sunY, len, a - wdt, a + wdt);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawClouds(L: CityLook, fall: boolean): void {
    const ctx = this.ctx;
    // Drifting clouds: a shaded underside, a sunlit top, a soft edge.
    const base = this.purple ? '#b48ae0' : fall ? '#f7c99a' : toHex(L.clouds);
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 397 + this.time * (0.15 + i * 0.03) - this.cam.x * 0.08) % (this.w + 400) + this.w + 400) % (this.w + 400) - 200;
      const cy = this.h * (0.12 + (i % 3) * 0.09) + this.cam.y * 0.05;
      const sz = this.h * (0.05 + (i % 2) * 0.02);
      const puffs: [number, number, number][] = [[-1.6, 0.2, 1.0], [-0.5, -0.35, 1.25], [0.8, -0.2, 1.1], [1.9, 0.25, 0.85], [0.2, 0.3, 1.2]];
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = tone(base, -0.18);
      ctx.beginPath();
      for (const [px, py, pr] of puffs) {
        ctx.moveTo(cx + px * sz + pr * sz, cy + py * sz + sz * 0.15);
        ctx.arc(cx + px * sz, cy + py * sz + sz * 0.15, pr * sz, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = tone(base, 0.25);
      ctx.beginPath();
      for (const [px, py, pr] of puffs) {
        const ox = (L.sunX > 0.5 ? 1 : -1) * sz * 0.12;
        ctx.moveTo(cx + px * sz + ox + pr * sz * 0.8, cy + py * sz - sz * 0.12);
        ctx.arc(cx + px * sz + ox, cy + py * sz - sz * 0.12, pr * sz * 0.8, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Parallax layers: hills and two rows of city. */
  private drawBackdrop(): void {
    const ctx = this.ctx;
    const k = this.h / CAMERA.baseHeight;
    // Each layer stands on its own horizon (a fraction of the screen height) and drifts a little with the camera.
    const layer = (parallax: number, zoomK: number, horizon: number) => {
      const s = (0.5 + this.cam.zoom * 0.5) * zoomK * k;
      const base = this.h * horizon + (this.cam.y - 150) * parallax * s;
      return {
        x: (x: number) => this.w / 2 + (x - this.cam.x * parallax) * s,
        y: (y: number) => base - y * s,
        s,
      };
    };
    if (this.fall) { this.drawCountryside(layer); return; }
    if (this.stageId === 'village') { winter.drawWinterBackdrop(this.view(), layer); return; }
    const look = this.look;
    const horizonRgb = rgbOf(this.purple ? PALETTE.purpleHorizon : look.skyHorizon);
    const light = this.light();
    // Hills, lit along their ridges, sinking into haze.
    const hills = layer(0.05, 0.5, 0.78);
    const hillColor = this.purple ? '#8a63c9' : look.hills;
    // Haze is baked into the gradient: thicker toward the horizon at the hills' foot.
    const hazeHex = rgbHex(horizonRgb);
    const hg = ctx.createLinearGradient(0, hills.y(260), 0, hills.y(0));
    hg.addColorStop(0, blend(tone(hillColor, 0.12), hazeHex, 0.15));
    hg.addColorStop(1, blend(tone(hillColor, -0.15), hazeHex, 0.45));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    for (let px = 0; px <= this.w + 20; px += 20) {
      const wx = (px - this.w / 2) / hills.s + this.cam.x * 0.08;
      const hy = 130 + Math.sin(wx * 0.004) * 90 + Math.sin(wx * 0.011 + 2) * 40;
      ctx.lineTo(px, hills.y(hy));
    }
    ctx.lineTo(this.w, this.h);
    ctx.fill();

    /**
     * A row of buildings in perspective: each shows its sunlit or shaded side and its roof (when below the eye), with
     * a rim of sunlight on the sunny edge, roof clutter, windows on a fixed grid, and haze over the whole row.
     */
    /**
     * A row of buildings, painted once into a cache (at the sharpest zoom) and slid and scaled with the camera every
     * frame: parallax in x, zoom, and the camera's height, exactly as the layer() mapping does.
     */
    const city = (name: string, list: Building[], parallax: number, zoomK: number, horizon: number, color: string, windowColor: string, hazeAlpha: number) => {
      const L = layer(parallax, zoomK, horizon);
      const k = this.h / CAMERA.baseHeight;
      const s0 = (0.5 + CAMERA.maxZoom * 0.5) * zoomK * k;
      const key = `${name}:${this.stageId}:${this.purple}:${Math.round(this.h)}:${light}`;
      let cache = this.cityCache.get(name);
      if (!cache || cache.key !== key) {
        const x0 = Math.min(...list.map((b) => b.x)) - 80;
        const x1 = Math.max(...list.map((b) => b.x + b.w)) + 80;
        const yTop = 700;
        const yBottom = -260;
        const canvas = cache?.canvas ?? document.createElement('canvas');
        canvas.width = Math.ceil((x1 - x0) * s0);
        canvas.height = Math.ceil((yTop - yBottom) * s0);
        const c = canvas.getContext('2d')!;
        c.clearRect(0, 0, canvas.width, canvas.height);
        const C = { x: (x: number) => (x - x0) * s0, y: (y: number) => (yTop - y) * s0, s: s0 };
        this.paintCity(c, list, C, canvas.width, canvas.height, color, windowColor, hazeAlpha, light, horizonRgb);
        cache = { canvas, key, x0, yTop, s0 };
        this.cityCache.set(name, cache);
      }
      const z = L.s / cache.s0;
      ctx.drawImage(cache.canvas, L.x(cache.x0), L.y(cache.yTop), cache.canvas.width * z, cache.canvas.height * z);
      // Below the cache's bottom, the buildings carry on in the hazy base color.
      const bottom = L.y(cache.yTop) + cache.canvas.height * z;
      if (bottom < this.h) {
        ctx.fillStyle = blendHaze(color, horizonRgb, hazeAlpha);
        ctx.fillRect(0, bottom - 1, this.w, this.h - bottom + 1);
      }
    };
    city('far', this.far, 0.15, 0.55, 0.92, this.purple ? '#6c4aa8' : look.far, '', 0.4);
    if (this.stageId !== 'rooftop') detail.drawBeacons(this.view(), layer(0.15, 0.55, 0.92), this.far, 400);
    if (this.stageId === 'cranes') { this.drawHarbor(layer); return; }
    if (this.stageId === 'helipad') this.drawHelicopterFlyby(layer(0.12, 0.55, 0.9));
    city('near', this.near, 0.3, 0.7, 1.02, this.purple ? '#3e2a66' : look.near, this.purple ? 'rgba(255,214,255,0.25)' : look.windows, 0.18);
  }

  /** Cached rows of city (see drawBackdrop). */
  private cityCache = new Map<string, { canvas: HTMLCanvasElement; key: string; x0: number; yTop: number; s0: number }>();

  /**
   * Paint a row of buildings in perspective: each shows its sunlit or shaded side and its roof, a rim of sunlight on
   * the sunny edge, roof clutter and windows on a fixed grid, with haze over the whole row.
   */
  private paintCity(ctx: CanvasRenderingContext2D, list: readonly Building[], L: { x: (x: number) => number; y: (y: number) => number; s: number }, width: number, height: number, color: string, windowColor: string, hazeAlpha: number, light: 1 | -1, horizonRgb: string): void {
    const e: Eye = { vx: width / 2, vy: L.y(320), s: L.s, light };
    const front = ctx.createLinearGradient(0, L.y(560), 0, L.y(0));
    front.addColorStop(0, tone(color, 0.1));
    front.addColorStop(1, tone(color, -0.25));
    const roofColor = tone(color, 0.18);
    const rimColor = this.purple ? 'rgba(255,214,255,0.35)' : 'rgba(255,232,190,0.4)';
    // Outside in, so the nearer sides overlap correctly.
    const order = [...list].sort((a, b) => Math.abs(L.x(b.x + b.w / 2) - e.vx) - Math.abs(L.x(a.x + a.w / 2) - e.vx));
    for (const b of order) {
      const x = L.x(b.x);
      const w = b.w * L.s;
      const top = L.y(b.h);
      box3(ctx, e, x, top, x + w, height + 4, 0, b.d, { color, front, top: roofColor });
      ctx.fillStyle = rimColor;
      ctx.fillRect(light > 0 ? x + w - 2 : x, top, 2, height - top);
      ctx.fillStyle = tone(color, 0.25);
      ctx.fillRect(x, top, w, Math.max(1, 3 * L.s));
      // Roof clutter: a water tank, a little hut, or an antenna.
      if (b.roof > 0.7) {
        const tw = Math.min(w * 0.35, 26 * L.s);
        const tx = x + w * (0.2 + (b.roof - 0.7) * 1.5);
        cylinder(ctx, e, tx, top - tw * 1.1, tx + tw, top - tw * 0.2, roofColor);
        ctx.fillStyle = tone(color, -0.1);
        ctx.fillRect(tx + tw * 0.15, top - tw * 0.2, Math.max(1, 2 * L.s), tw * 0.2);
        ctx.fillRect(tx + tw * 0.8, top - tw * 0.2, Math.max(1, 2 * L.s), tw * 0.2);
      } else if (b.roof > 0.45) {
        box3(ctx, e, x + w * 0.55, top - 16 * L.s, x + w * 0.85, top, 10, 40, { color: tone(color, 0.05) });
      } else if (b.roof < 0.15) {
        ctx.fillStyle = tone(color, -0.2);
        ctx.fillRect(x + w * 0.5, top - 60 * L.s, Math.max(1, 2 * L.s), 60 * L.s);
      }
      if (b.windows) {
        const step = 22 * L.s;
        const cols = Math.floor((b.w - 10) / 22);
        const x0 = x + (w - cols * step) / 2 + step * 0.25;
        for (let r = 0; ; r++) {
          const wy = top + step * 0.6 + r * step;
          if (wy > height) break;
          for (let c = 0; c < cols; c++) {
            const hsh = ((b.x * 7 + r * 131 + c * 37) | 0) % 97;
            const lit = ((hsh + 97) % 97) / 97 < this.look.litWindows;
            ctx.fillStyle = lit ? windowColor : 'rgba(0,0,0,0.18)';
            ctx.fillRect(x0 + c * step, wy, step * 0.5, step * 0.55);
          }
        }
      }
    }
    haze(ctx, width, L.y(600), L.y(0), horizonRgb, hazeAlpha);
    // Below the horizon the haze stays at full strength.
    ctx.fillStyle = `rgba(${horizonRgb},${hazeAlpha})`;
    ctx.fillRect(0, L.y(0), width, height - L.y(0));
  }

  /** The Crane Yard's backdrop: the bay at dusk, ships going by, and a quay of containers and gantry cranes. */
  private drawHarbor(layer: (parallax: number, zoomK: number, horizon: number) => { x: (x: number) => number; y: (y: number) => number; s: number }): void {
    const ctx = this.ctx;
    const purple = this.purple;
    // The water, from the far shore down.
    const sea = layer(0.2, 0.6, 0.84);
    const shore = Math.max(0, sea.y(0));
    const wg = ctx.createLinearGradient(0, shore, 0, this.h);
    wg.addColorStop(0, purple ? '#7a5ab8' : HARBOR.waterTop);
    wg.addColorStop(1, purple ? '#3e2a66' : HARBOR.waterBottom);
    ctx.fillStyle = wg;
    ctx.fillRect(0, shore, this.w, this.h - shore);
    // The low sun's reflection, broken into ripples.
    const sunX = this.w * this.look.sunX - this.cam.x * 0.03;
    ctx.fillStyle = purple ? 'rgba(255,214,255,0.35)' : 'rgba(255,214,170,0.45)';
    for (let i = 0; i < 14; i++) {
      const y = shore + 6 + i * 9 * sea.s;
      if (y > this.h) break;
      const half = (60 - i * 3 + Math.sin(this.time * 0.05 + i) * 10) * sea.s;
      ctx.fillRect(sunX - half, y, half * 2, 2 * sea.s);
    }
    detail.drawHarborExtras(this.view(), sea, shore);
    // Two container ships crossing the bay, very slowly.
    const ships = layer(0.22, 0.6, 0.89);
    for (const [base, dir] of [[-500, 1], [900, -1]] as const) {
      const span = 4200;
      const wx = ((base + dir * this.time * 0.15) % span + span * 1.5) % span - span / 2;
      const x = ships.x(wx);
      const y = ships.y(0);
      const k = ships.s;
      if (x < -400 * k || x > this.w + 400 * k) continue;
      ctx.fillStyle = purple ? '#2e2050' : '#2a2f3e';
      ctx.beginPath();
      ctx.moveTo(x - 180 * k, y - 30 * k);
      ctx.lineTo(x + 200 * k, y - 30 * k);
      ctx.lineTo(x + 175 * k, y);
      ctx.lineTo(x - 165 * k, y);
      ctx.closePath();
      ctx.fill();
      // Bridge at the stern.
      const stern = dir > 0 ? -150 : 130;
      ctx.fillRect(x + stern * k, y - 70 * k, 24 * k, 40 * k);
      // Stacks of containers.
      for (let c = 0; c < 9; c++) {
        const cx = x + (-110 + c * 30 - (dir > 0 ? 0 : 40)) * k;
        const rows = 1 + ((c * 7 + base) & 1);
        for (let r = 0; r < rows; r++) {
          ctx.fillStyle = purple ? '#5a4a8a' : containerColor(c + r * 3 + (base & 3));
          ctx.globalAlpha = 0.7;
          ctx.fillRect(cx, y - (44 + r * 14) * k, 28 * k, 13 * k);
          ctx.globalAlpha = 1;
        }
      }
    }
    // The quay in front: a concrete edge, container stacks and ship-to-shore gantry cranes.
    const quay = layer(0.3, 0.7, 1.02);
    const qy = quay.y(15);
    const k = quay.s;
    ctx.fillStyle = purple ? '#3e2a66' : this.look.near;
    ctx.fillRect(0, qy, this.w, this.h - qy + 2);
    detail.drawQuayLights(this.view(), quay, qy);
    for (let i = -16; i <= 16; i++) {
      const wx = i * 260 + ((i * 37) & 63);
      const x = quay.x(wx);
      if (x < -300 * k || x > this.w + 300 * k) continue;
      if ((i & 3) === 0) {
        // A gantry crane: two A-frame legs, a boom reaching out over the water.
        ctx.strokeStyle = purple ? '#5a4a8a' : '#c2563a';
        ctx.lineWidth = Math.max(1, 5 * k);
        ctx.beginPath();
        ctx.moveTo(x - 50 * k, qy);
        ctx.lineTo(x - 30 * k, qy - 200 * k);
        ctx.moveTo(x + 50 * k, qy);
        ctx.lineTo(x + 30 * k, qy - 200 * k);
        ctx.moveTo(x - 40 * k, qy - 100 * k);
        ctx.lineTo(x + 40 * k, qy - 100 * k);
        ctx.moveTo(x - 130 * k, qy - 200 * k);
        ctx.lineTo(x + 220 * k, qy - 200 * k);
        ctx.moveTo(x, qy - 260 * k);
        ctx.lineTo(x - 130 * k, qy - 200 * k);
        ctx.moveTo(x, qy - 260 * k);
        ctx.lineTo(x + 220 * k, qy - 200 * k);
        ctx.moveTo(x, qy - 260 * k);
        ctx.lineTo(x, qy - 200 * k);
        ctx.stroke();
        continue;
      }
      // A stack of containers.
      const rows = 2 + ((i * 5) & 1) + ((i * 11) & 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === rows - 1 && ((i + c) & 3) === 1) continue;
          ctx.fillStyle = purple ? '#5a4a8a' : containerColor(i * 3 + c * 2 + r);
          ctx.globalAlpha = 0.6;
          ctx.fillRect(x + (c * 62 - 90) * k, qy - (r + 1) * 26 * k, 60 * k, 24 * k);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** A helicopter crossing the sunset behind the Helipad, its light blinking. */
  private drawHelicopterFlyby(L: { x: (x: number) => number; y: (y: number) => number; s: number }): void {
    const ctx = this.ctx;
    const span = 5200;
    const wx = ((this.time * 0.9) % span) - span / 2;
    const x = L.x(wx);
    const y = L.y(520 + Math.sin(this.time * 0.01) * 20);
    const k = L.s;
    if (x < -100 || x > this.w + 100) return;
    ctx.fillStyle = this.purple ? '#3e2a66' : '#2c2b42';
    ctx.beginPath();
    ctx.ellipse(x, y, 22 * k, 11 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 60 * k, y - 3 * k, 45 * k, 5 * k);
    ctx.fillRect(x - 64 * k, y - 10 * k, 5 * k, 14 * k);
    ctx.fillRect(x - 16 * k, y + 13 * k, 34 * k, 2 * k);
    // The rotor, blurred to a flicker.
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.time * 1.7);
    ctx.fillRect(x - 40 * k, y - 15 * k, 80 * k, 2 * k);
    ctx.globalAlpha = 1;
    if ((this.time >> 4) % 3 === 0) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(x - 62 * k, y - 10 * k, Math.max(1.5, 3 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The Harvest Farm's backdrop: autumn hills, a barn and a silo, rows of fall trees. */
  private drawCountryside(layer: (parallax: number, zoomK: number, horizon: number) => { x: (x: number) => number; y: (y: number) => number; s: number }): void {
    const ctx = this.ctx;
    const purple = this.purple;
    const hazeRgb = rgbOf(purple ? PALETTE.purpleHorizon : FALL.skyHorizon);
    const light = this.light();
    const hillY = (L: ReturnType<typeof layer>, base: number, amp: number, freq: number, shift: number, parallax: number, layerParallax: number) => (x: number) => {
      const wx = x + this.cam.x * (parallax - layerParallax);
      return L.y(base + Math.sin(wx * freq + shift) * amp + Math.sin(wx * freq * 2.7 + shift * 2) * amp * 0.35);
    };
    // Rolling hills lit along their crests, darker in the folds.
    const hazeHex = rgbHex(hazeRgb);
    const hillsAt = (L: ReturnType<typeof layer>, color: string, base: number, amp: number, freq: number, shift: number, parallax: number, hazeK = 0) => {
      const g = ctx.createLinearGradient(0, L.y(base + amp * 1.4), 0, L.y(base - amp));
      g.addColorStop(0, blend(tone(color, 0.15), hazeHex, hazeK * 0.4));
      g.addColorStop(1, blend(tone(color, -0.2), hazeHex, hazeK));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, this.h);
      for (let px = 0; px <= this.w + 20; px += 20) {
        const wx = (px - this.w / 2) / L.s + this.cam.x * parallax;
        ctx.lineTo(px, L.y(base + Math.sin(wx * freq + shift) * amp + Math.sin(wx * freq * 2.7 + shift * 2) * amp * 0.35));
      }
      ctx.lineTo(this.w, this.h);
      ctx.fill();
    };
    const far = layer(0.05, 0.5, 0.62);
    hillsAt(far, purple ? '#8a63c9' : FALL.hillFar, 140, 70, 0.004, 1, 0.08, 0.45);
    const mid = layer(0.15, 0.6, 0.7);
    hillsAt(mid, purple ? '#6c4aa8' : FALL.hillMid, 90, 40, 0.006, 3, 0.2, 0.25);
    const midHill = hillY(mid, 90, 40, 0.006, 3, 0.2, 0.15);
    detail.drawWindpump(this.view(), mid, midHill);
    // A red barn with a gable roof and a silo, in perspective on the middle hills.
    const e: Eye = { vx: this.w / 2, vy: this.h * 0.35, s: mid.s, light };
    const bx = mid.x(520);
    const by = Math.min(midHill(520), midHill(650)) + 6 * mid.s;
    const k = mid.s;
    const barn = purple ? '#4a2f7a' : FALL.barn;
    box3(ctx, e, bx, by - 90 * k, bx + 130 * k, by, 0, 120, { color: barn });
    // Roof: the slope running back, then the gable end in front.
    const [r1x, r1y] = project(e, bx - 10 * k, by - 90 * k, 0);
    const [r2x, r2y] = project(e, bx + 65 * k, by - 140 * k, 0);
    const [r3x, r3y] = project(e, bx + 65 * k, by - 140 * k, 120);
    const [r4x, r4y] = project(e, bx - 10 * k, by - 90 * k, 120);
    const [r5x, r5y] = project(e, bx + 140 * k, by - 90 * k, 0);
    const [r6x, r6y] = project(e, bx + 140 * k, by - 90 * k, 120);
    ctx.fillStyle = tone(purple ? '#3e2a66' : '#5a3a30', light < 0 ? 0.1 : -0.2);
    ctx.beginPath(); ctx.moveTo(r1x, r1y); ctx.lineTo(r2x, r2y); ctx.lineTo(r3x, r3y); ctx.lineTo(r4x, r4y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(purple ? '#3e2a66' : '#5a3a30', light > 0 ? 0.1 : -0.2);
    ctx.beginPath(); ctx.moveTo(r5x, r5y); ctx.lineTo(r2x, r2y); ctx.lineTo(r3x, r3y); ctx.lineTo(r6x, r6y); ctx.closePath(); ctx.fill();
    const gable = ctx.createLinearGradient(0, r2y, 0, by);
    gable.addColorStop(0, tone(barn, 0.1));
    gable.addColorStop(1, tone(barn, -0.25));
    ctx.fillStyle = gable;
    ctx.beginPath(); ctx.moveTo(r1x, r1y); ctx.lineTo(r2x, r2y); ctx.lineTo(r5x, r5y); ctx.closePath(); ctx.fill();
    ctx.fillRect(bx, by - 90 * k, 130 * k, 90 * k);
    ctx.strokeStyle = '#f4efe6';
    ctx.lineWidth = Math.max(1, 3 * k);
    ctx.strokeRect(bx + 40 * k, by - 60 * k, 50 * k, 60 * k);
    ctx.beginPath();
    ctx.moveTo(bx + 40 * k, by - 60 * k);
    ctx.lineTo(bx + 90 * k, by);
    ctx.moveTo(bx + 90 * k, by - 60 * k);
    ctx.lineTo(bx + 40 * k, by);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx + 55 * k, by - 120 * k, 20 * k, 16 * k);
    // The silo: a lit cylinder with a domed cap.
    const silo = purple ? '#5a4a8a' : '#b9b2a6';
    cylinder(ctx, e, bx + 150 * k, by - 160 * k, bx + 194 * k, by, silo);
    sphere(ctx, e, bx + 172 * k, by - 160 * k, 22 * k, 18 * k, silo);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let r = 1; r < 6; r++) ctx.fillRect(bx + 150 * k, by - r * 28 * k, 44 * k, Math.max(1, 1.5 * k));
    // Rows of fall trees on the near hills, round and lit from the sun.
    const near = layer(0.3, 0.7, 0.78);
    hillsAt(near, purple ? '#3e2a66' : FALL.hillNear, 40, 18, 0.008, 5, 0.35);
    const nearHill = hillY(near, 40, 18, 0.008, 5, 0.35, 0.3);
    detail.drawCornShocks(this.view(), near, nearHill);
    const te: Eye = { vx: this.w / 2, vy: this.h * 0.35, s: near.s, light };
    for (let i = -14; i <= 14; i++) {
      const tx = i * 150 + ((i * 53) % 40);
      const x = near.x(tx);
      if (x < -80 || x > this.w + 80) continue;
      const ty = nearHill(tx) + 4;
      const r = (34 + ((i * 17) & 15)) * near.s;
      contactShadow(ctx, x + light * -r * 0.4, ty, r * 1.1, r * 0.25, 0.3);
      const [t1, t2] = [x - 4 * near.s, x + 4 * near.s];
      cylinder(ctx, te, t1, ty - r * 1.4, t2, ty + 2, '#4a3020');
      const leaf = purple ? '#7a4ab0' : FALL.leaves[(i + 20) % FALL.leaves.length]!;
      sphere(ctx, te, x - r * 0.6, ty - r * 1.2, r * 0.7, r * 0.65, tone(leaf, -0.1));
      sphere(ctx, te, x + r * 0.6, ty - r * 1.25, r * 0.7, r * 0.65, tone(leaf, -0.05));
      sphere(ctx, te, x, ty - r * 1.65, r, r * 0.9, leaf);
    }
  }

  /** Leaves drifting down across the Harvest Farm (only the look: nothing in the fight). */
  private drawFallingLeaves(): void {
    const ctx = this.ctx;
    for (let i = 0; i < FALL.leafCount; i++) {
      const speed = 0.4 + (i % 5) * 0.12;
      const x = ((i * 211 + this.time * 0.6 + Math.sin(this.time * 0.02 + i) * 30) % (this.w + 60) + this.w + 60) % (this.w + 60) - 30;
      const y = ((i * 137 + this.time * speed) % (this.h + 40)) - 20;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * 0.03 + i);
      ctx.fillStyle = FALL.leaves[i % FALL.leaves.length]!;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawStage(world: World): void {
    const ctx = this.ctx;
    const s = this.scale;
    const id = world.stage.id;
    const main = world.stage.platforms[0]!;
    if (id === 'village') { winter.drawWinterStage(this.view(), world.stage); return; }
    // What holds the main platform up.
    if (id === 'rooftop') {
      // The building under the roof, all the way down, with recessed windows.
      const f = this.block(main.x1 + 20, main.x2 - 20, main.y - main.depth, this.bottomY(), -10, 520, { color: '#363a42' });
      this.windowGrid(f, 34, 'rgba(255,236,200,0.32)', 0.75, 3);
      detail.drawRooftopDetail(this.view(), main.x1 + 20, main.x2 - 20, main.y - main.depth);
    } else if (id === 'harvest') {
      // Solid ground: the field runs off both sides of the screen (drawn with the platforms).
      const top = this.sy(main.y - main.depth);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(0, top, this.w, this.h - top + 40);
    } else if (id === 'helipad') {
      const roof = main.y - main.depth - HELIPAD_TOWER;
      this.drawSkyscraper(roof);
      detail.drawSkyscraperDetail(this.view(), roof, -270, 270);
      // A truss tower holding the pad above the skyscraper's roof: the back frame in shadow, the front one lit.
      const top = main.y - main.depth;
      const bay = HELIPAD_TOWER / 2;
      for (const [z, k] of [[110, -0.35], [10, 0.1]] as const) {
        const steel = tone(this.purple ? '#8a63c9' : '#6b6880', k);
        for (const x of [-90, 90]) this.strut(x, top, z, x, roof, z, 9, steel);
        for (let y = top; y > roof + 1; y -= bay) {
          this.strut(-90, y, z, 90, y - bay, z, 5, steel);
          this.strut(90, y, z, -90, y - bay, z, 5, steel);
        }
      }
      for (const x of [-90, 90]) this.strut(x, top, 10, x, top, 110, 6, tone('#6b6880', -0.15));
      this.drawWindsock(230, roof);
    } else {
      // The deck sits on a stack of shipping containers, bottom row first so each one sits on the one below.
      const top = main.y - main.depth;
      let rows = 0;
      while (top - rows * 52 > -1400 && this.sy(top - rows * 52) < this.h + 60) rows++;
      for (let row = rows - 1; row >= 0; row--) {
        for (let col = 0; col < 5; col++) {
          const x = -250 + col * 100;
          const y = top - row * 52;
          const color = this.purple ? '#5a4a8a' : containerColor(row * 2 + col * 3 + 1);
          const f = this.block(x + 2, x + 98, y, y - 50, -20, 120, { color: tone(color, -0.15) });
          // Corrugation: alternating lit and shaded ribs.
          for (let r = 0; r < 8; r++) {
            const rx = f.x + (f.w * (r + 0.5)) / 8;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(rx - f.w / 32, f.y + 3 * s, f.w / 32, f.h - 6 * s);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(rx, f.y + 3 * s, f.w / 32, f.h - 6 * s);
          }
          detail.drawContainerDoors(this.view(), x + 2, y - 50, 96, 50, row * 5 + col);
        }
      }
      for (const side of [-1, 1]) this.drawTowerCrane(side);
    }

    for (const p of world.stage.platforms) if (p.solid) this.drawPlatform(p, id);
    if (id === 'rooftop') this.drawRooftopProps(main.y);
    if (id === 'harvest') this.drawFarmProps(main.y);
    for (const p of world.stage.platforms) if (!p.solid) this.drawPlatform(p, id);
    // Scenery in front of the platforms' faces.
    const v = this.view();
    if (id === 'rooftop') {
      const soft = world.stage.platforms.filter((p) => !p.solid);
      detail.drawPigeons(v, soft.flatMap((p, i) => (i === 2 ? [{ x: p.x2 - 20, y: p.y }] : [{ x: p.x1 + 18, y: p.y }, { x: p.x1 + 40, y: p.y }])));
    } else if (id === 'helipad') detail.drawHelipadDetail(v, main.x1, main.x2, main.y);
    else if (id === 'cranes') detail.drawDeckDetail(v, main.x1, main.x2, main.y, main.depth);
    else if (id === 'harvest') {
      const wagon = world.stage.platforms.find((p) => !p.solid && p.x1 > 0 && p.y < 200);
      if (wagon) detail.drawLantern(v, wagon.x1 + 10, wagon.y);
      detail.drawFarmFront(v, main.y);
    }
  }

  /** Birds crossing the sky, a kind for each stage. */
  private drawSkyBirds(): void {
    const v = this.view();
    if (this.stageId === 'village') return;
    if (this.fall) detail.drawBirds(v, 5, '#3a2614', 0.7, 0.18, 3);
    else if (this.stageId === 'cranes') detail.drawBirds(v, 6, 'rgba(255,255,255,0.8)', 0.5, 0.22, 1);
    else if (this.stageId === 'helipad') detail.drawBirds(v, 4, 'rgba(30,24,40,0.7)', 0.6, 0.3, 2);
    else detail.drawBirds(v, 3, 'rgba(60,64,70,0.6)', 0.8, 0.25, 4);
  }

  /** The Helipad's skyscraper: glass with lit windows at sunset, warning lights on its roof corners. */
  private drawSkyscraper(roof: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    if (this.sy(roof) > this.h) return;
    const glass = this.purple ? '#2e2050' : '#2a2c3e';
    const f = this.block(-270, 270, roof, this.bottomY(), -20, 460, { color: glass });
    this.block(-280, 280, roof, roof - 14, -26, 466, { color: this.purple ? '#3e2a66' : '#3a3c52', rim: true });
    this.windowGrid(f, 46, this.purple ? 'rgba(255,214,255,0.4)' : 'rgba(255,206,120,0.6)', 0.4, 6);
    // HVAC units and a stair hut on the roof.
    for (const [x1, x2, h, z1, z2] of [[-250, -190, 28, 60, 140], [-180, -140, 40, 180, 240], [150, 200, 34, 80, 160]] as const) {
      const u = this.block(x1, x2, roof + h, roof, z1, z2, { color: this.purple ? '#4a3a7a' : '#4a4c62', rim: true });
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 1; k < 4; k++) ctx.fillRect(u.x + 3, u.y + (u.h * k) / 4, u.w - 6, Math.max(1, s));
    }
    // The sunset reflected in the glass, strongest high up.
    const rg = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h * 0.6);
    rg.addColorStop(0, 'rgba(255,150,90,0.18)');
    rg.addColorStop(0.5, 'rgba(255,150,90,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(f.x, f.y, f.w, Math.min(f.h, this.h - f.y));
    ctx.fillStyle = (this.time >> 5) % 2 ? '#ff3b30' : '#661814';
    for (const cx of [-284, 284]) {
      const [lx, ly] = this.at(cx, roof + 4, -26);
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(2, 4 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A windsock on a mast, flapping in the wind. */
  private drawWindsock(x: number, y: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const mastTop = y + 75;
    ctx.strokeStyle = this.purple ? '#8a63c9' : '#6b6880';
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath();
    ctx.moveTo(this.sx(x), this.sy(y));
    ctx.lineTo(this.sx(x), this.sy(mastTop));
    ctx.stroke();
    // Five stripes, each a little narrower, drooping and waving at the tail.
    for (let i = 0; i < 5; i++) {
      const wave = Math.sin(this.time * 0.12 - i * 0.9) * (2 + i * 1.5);
      const x0 = x + i * 14;
      const h0 = 22 - i * 3;
      ctx.fillStyle = i % 2 ? '#f4efe6' : PALETTE.orange;
      ctx.beginPath();
      ctx.moveTo(this.sx(x0), this.sy(mastTop - i * 1.5 + wave * 0.5));
      ctx.lineTo(this.sx(x0 + 14), this.sy(mastTop - (i + 1) * 1.5 + wave));
      ctx.lineTo(this.sx(x0 + 14), this.sy(mastTop - (i + 1) * 1.5 - h0 + 3 + wave));
      ctx.lineTo(this.sx(x0), this.sy(mastTop - i * 1.5 - h0 + wave * 0.5));
      ctx.closePath();
      ctx.fill();
    }
  }

  /** A tower crane at one side of the Crane Yard: lattice mast, its jib is the high platform, counter-jib, ties and a hook. */
  private drawTowerCrane(side: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const yellow = this.purple ? '#c9a0ff' : '#e8a21a';
    const jibY = 170;
    const apex = 300;
    const X = (wx: number) => side * wx;
    const low = Math.min(this.bottomY(), jibY - 100);
    // The mast and apex as two lattice frames, the back one in shadow; braces between them.
    for (const [z, k] of [[22, -0.4], [-22, 0.08]] as const) {
      const c = tone(yellow, k);
      this.strut(X(382), jibY, z, X(382), low, z, 6, c);
      this.strut(X(418), jibY, z, X(418), low, z, 6, c);
      for (let y = jibY; y > low; y -= 50) this.strut(X(382), y, z, X(418), y - 50, z, 3, c);
      this.strut(X(386), jibY + 10, z, X(400), apex, z, 5, c);
      this.strut(X(414), jibY + 10, z, X(400), apex, z, 5, c);
      // Counter-jib out the back.
      this.strut(X(440), jibY + 4, z, X(545), jibY + 4, z, 4, c);
    }
    // Ties from the apex to both ends.
    ctx.strokeStyle = 'rgba(40,40,40,0.7)';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    const [ax, ay] = this.at(X(400), apex, 0);
    const [t1x, t1y] = this.at(X(236), jibY + 9, 0);
    const [t2x, t2y] = this.at(X(540), jibY + 6, 0);
    ctx.moveTo(ax, ay);
    ctx.lineTo(t1x, t1y);
    ctx.moveTo(ax, ay);
    ctx.lineTo(t2x, t2y);
    ctx.stroke();
    // Counterweight and the operator's cab, solid blocks.
    const cw = side > 0 ? 500 : -545;
    this.block(cw, cw + 45, jibY, jibY - 44, -26, 26, { color: this.purple ? '#3e2a66' : '#555a62', rim: true });
    const cab = side > 0 ? 340 : -382;
    const cf = this.block(cab, cab + 42, jibY - 4, jibY - 40, -24, 20, { color: this.purple ? '#5a4a8a' : '#d9d4c8', rim: true });
    const wg = ctx.createLinearGradient(0, cf.y, 0, cf.y + cf.h);
    wg.addColorStop(0, 'rgba(190,225,255,0.9)');
    wg.addColorStop(1, 'rgba(80,120,160,0.9)');
    ctx.fillStyle = wg;
    ctx.fillRect(cf.x + cf.w * 0.15, cf.y + cf.h * 0.15, cf.w * 0.7, cf.h * 0.45);
    // A hook on a swaying cable from the trolley near the jib's tip.
    const sway = Math.sin(this.time * 0.03 + side) * 6;
    const hx = side * 270;
    const hy = 95;
    this.block(hx - 14, hx + 14, jibY - 2, jibY - 10, -12, 12, { color: '#3a3e44' });
    const [c1x, c1y] = this.at(hx, jibY - 10, 0);
    const [c2x, c2y] = this.at(hx + sway, hy, 0);
    ctx.strokeStyle = 'rgba(30,30,30,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c1x, c1y);
    ctx.lineTo(c2x, c2y);
    ctx.stroke();
    ctx.strokeStyle = '#3a3e44';
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath();
    ctx.arc(c2x, c2y + 8 * s, 7 * s, -Math.PI * 0.1, Math.PI * 1.1, false);
    ctx.stroke();
  }

  /** A steel member between two world points at depths, as a thick line with a lit edge. */
  private strut(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number, color: string): void {
    const ctx = this.ctx;
    const [ax, ay] = this.at(x1, y1, z1);
    const [bx, by] = this.at(x2, y2, z2);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * this.scale);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  /** World y just below the bottom of the screen (where tall things can stop). */
  private bottomY(): number {
    return this.cam.y - (this.h / 2 + 40) / this.scale;
  }

  /** Windows on a front face, on a fixed grid (step in world units): recessed panes, some lit. */
  private windowGrid(f: { x: number; y: number; w: number; h: number }, step: number, litColor: string, litShare: number, seed: number): void {
    const ctx = this.ctx;
    const px = step * this.scale * (f.w / Math.max(1, f.w));
    const cols = Math.max(1, Math.floor(f.w / px));
    const x0 = f.x + (f.w - cols * px) / 2;
    for (let r = 0; ; r++) {
      const y = f.y + px * 0.6 + r * px;
      if (y > this.h || y > f.y + f.h) break;
      for (let c = 0; c < cols; c++) {
        const hsh = ((r * 131 + c * 37 + seed * 17) % 97) / 97;
        const wx = x0 + c * px + px * 0.2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(wx, y, px * 0.6, px * 0.62);
        ctx.fillStyle = hsh < litShare ? litColor : 'rgba(150,170,200,0.14)';
        ctx.fillRect(wx + 1, y + px * 0.08, px * 0.6 - 1, px * 0.54);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(wx, y + px * 0.62, px * 0.6, Math.max(1, px * 0.05));
      }
    }
  }

  /** Things standing on the Rooftop behind the fighters, in perspective: AC units, a water tower, a stair hut, vents. */
  private drawRooftopProps(roofY: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const steel = this.purple ? '#6c4aa8' : '#7d858f';
    const shadow = (x1: number, x2: number, z: number) => {
      const [ax, ay] = this.at(x1, roofY, z);
      const [bx] = this.at(x2, roofY, z);
      contactShadow(ctx, (ax + bx) / 2, ay, (bx - ax) * 0.7, 9 * s, 0.35);
    };
    // Farthest first.
    // Water tower on four legs.
    shadow(-215, -125, 130);
    for (const [lx, lz] of [[-200, 150], [-140, 150], [-200, 110], [-140, 110]] as const) this.strut(lx, roofY, lz, lx + (lx < -170 ? 5 : -5), roofY + 90, lz - (lz > 130 ? 5 : -5), 4, tone(steel, lz > 130 ? -0.35 : -0.1));
    this.strut(-200, roofY + 45, 110, -140, roofY + 45, 110, 2, tone(steel, -0.1));
    const [tx1, tty] = this.at(-212, roofY + 160, 130);
    const [tx2, tby] = this.at(-128, roofY + 90, 130);
    cylinder(ctx, this.eye(), tx1, tty, tx2, tby, this.purple ? '#7a4ab0' : '#8a6a4a');
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    for (const hy of [0.25, 0.5, 0.75]) {
      ctx.moveTo(tx1, tty + (tby - tty) * hy);
      ctx.lineTo(tx2, tty + (tby - tty) * hy);
    }
    ctx.stroke();
    const [rx1, rty] = this.at(-218, roofY + 160, 130);
    const [rx2] = this.at(-122, roofY + 160, 130);
    const [, ray] = this.at(-170, roofY + 188, 130);
    ctx.fillStyle = this.purple ? '#5a4a8a' : '#6b5038';
    ctx.beginPath();
    ctx.moveTo(rx1, rty);
    ctx.lineTo((rx1 + rx2) / 2, ray);
    ctx.lineTo(rx2, rty);
    ctx.fill();
    // Stair hut with a door.
    shadow(90, 160, 95);
    const hut = this.block(90, 160, roofY + 64, roofY, 70, 130, { color: steel, rim: true });
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(hut.x + hut.w * 0.3, hut.y + hut.h * 0.3, hut.w * 0.36, hut.h * 0.7);
    // AC units with fans on top.
    for (const [x1, x2, h, z1, z2] of [[-300, -230, 30, 30, 80], [230, 276, 44, 50, 100]] as const) {
      shadow(x1, x2, (z1 + z2) / 2);
      const ac = this.block(x1, x2, roofY + h, roofY, z1, z2, { color: tone(steel, 0.1), rim: true });
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 1; k < 5; k++) ctx.fillRect(ac.x + 4 * s, ac.y + (ac.h * k) / 5, ac.w - 8 * s, Math.max(1, s));
      const [fx, fy] = this.at((x1 + x2) / 2, roofY + h, (z1 + z2) / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(fx, fy, (x2 - x1) * 0.3 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A satellite dish on the tall AC unit.
    const [dx, dy] = this.at(252, roofY + 66, 75);
    this.strut(253, roofY + 44, 75, 253, roofY + 58, 75, 2, steel);
    sphere(ctx, this.eye(), dx, dy, 16 * s, 8 * s, this.purple ? '#c9a0ff' : '#d6dbe0');
    // Vents.
    for (const vx of [-40, 20]) {
      const [a1, a2] = this.at(vx, roofY + 24, 40);
      const [b1, b2] = this.at(vx + 12, roofY, 40);
      cylinder(ctx, this.eye(), a1, a2, b1, b2, steel);
    }
    // The antenna mast with its blinking light.
    this.strut(330, roofY, 60, 330, roofY + 150, 60, 3, '#26282b');
    const [bx, by] = this.at(330, roofY + 152, 60);
    const on = (this.time >> 5) % 2 === 1;
    ctx.fillStyle = on ? '#ff3b30' : '#661814';
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(2, 5 * s), 0, Math.PI * 2);
    ctx.fill();
    if (on) glow(ctx, bx, by, 22 * s, 'rgba(255,59,48,0.5)');
  }

  /** Things on the Harvest Farm's field behind the fighters: the fence and sunflowers far back, the scarecrow, pumpkins, the oak. */
  private drawFarmProps(ground: number): void {
    const ctx = this.ctx;
    detail.drawFarmBack(this.viewAt(260), ground);
    // The scarecrow and its crows, a little way back.
    const sv = this.viewAt(90);
    contactShadow(ctx, sv.sx(-420), sv.sy(ground), 40 * sv.s, 7 * sv.s, 0.3);
    this.drawScarecrow(sv, -420, ground);
    detail.drawCrows(sv, ground);
    // Pumpkins in the grass.
    for (const [px, pr, pz] of [[-360, 16, 40], [-330, 11, 70], [380, 18, 50], [410, 12, 20], [600, 15, 60]] as const) this.drawPumpkin(this.viewAt(pz), px, ground, pr);
    this.drawOak(ground);
  }

  private drawScarecrow(v: detail.View, x: number, y: number): void {
    const ctx = this.ctx;
    const s = v.s;
    const e = this.eye();
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = Math.max(1, 5 * s);
    ctx.beginPath();
    ctx.moveTo(v.sx(x), v.sy(y));
    ctx.lineTo(v.sx(x), v.sy(y + 110));
    ctx.moveTo(v.sx(x - 36), v.sy(y + 80));
    ctx.lineTo(v.sx(x + 36), v.sy(y + 80));
    ctx.stroke();
    // A blue shirt, round in the light, straw poking out of the cuffs.
    const shirt = ctx.createLinearGradient(v.sx(x - 18), 0, v.sx(x + 18), 0);
    shirt.addColorStop(e.light > 0 ? 1 : 0, '#7aa0c6');
    shirt.addColorStop(e.light > 0 ? 0 : 1, '#3f5f80');
    ctx.fillStyle = shirt;
    ctx.fillRect(v.sx(x - 18), v.sy(y + 88), 36 * s, 40 * s);
    ctx.fillStyle = '#e2bd5a';
    for (const cx of [-40, 34]) ctx.fillRect(v.sx(x + cx), v.sy(y + 84), 6 * s, 6 * s);
    sphere(ctx, e, v.sx(x), v.sy(y + 100), 11 * s, 11 * s, '#e8c07a');
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(v.sx(x - 18), v.sy(y + 110), 36 * s, 4 * s);
    const hat = ctx.createLinearGradient(0, v.sy(y + 130), 0, v.sy(y + 110));
    hat.addColorStop(0, '#9a6230');
    hat.addColorStop(1, '#5a3818');
    ctx.fillStyle = hat;
    ctx.fillRect(v.sx(x - 9), v.sy(y + 120), 18 * s, 10 * s);
  }

  private drawPumpkin(v: detail.View, x: number, y: number, r: number): void {
    const ctx = this.ctx;
    const s = v.s;
    const cx = v.sx(x);
    const cy = v.sy(y + r * 0.8);
    contactShadow(ctx, cx, v.sy(y), r * 1.5 * s, r * 0.35 * s, 0.35);
    sphere(ctx, this.eye(), cx, cy, r * 1.2 * s, r * 0.85 * s, '#e8731f');
    // Ribs.
    ctx.strokeStyle = 'rgba(120,50,10,0.45)';
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.beginPath();
    for (const k of [-0.55, 0, 0.55]) ctx.ellipse(cx + k * r * 0.5 * s, cy, r * (0.75 - Math.abs(k) * 0.4) * s, r * 0.82 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3f7a2a';
    ctx.fillRect(cx - 1.5 * s, v.sy(y + r * 1.75), 3 * s, 5 * s);
  }

  /** The Harvest Farm's oak: a round trunk with roots, two branches out to the bough, a canopy of lit leaf clusters. */
  private drawOak(ground: number): void {
    const ctx = this.ctx;
    const e = this.eye();
    const bough = ground + 235;
    const light = e.light;
    const P = (x: number, y: number) => [this.sx(x), this.sy(y)] as const;
    contactShadow(ctx, this.sx(0), this.sy(ground), 90 * this.scale, 12 * this.scale, 0.4);
    const bark = ctx.createLinearGradient(this.sx(-50), 0, this.sx(50), 0);
    bark.addColorStop(light > 0 ? 0 : 1, '#3a2414');
    bark.addColorStop(0.5, '#5a3a24');
    bark.addColorStop(light > 0 ? 1 : 0, '#8a6040');
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(...P(-46, ground));
    ctx.quadraticCurveTo(...P(-22, ground + 20), ...P(-18, ground + 60));
    ctx.lineTo(...P(-14, bough - 30));
    ctx.quadraticCurveTo(...P(-50, bough - 22), ...P(-96, bough - 4));
    ctx.lineTo(...P(-80, bough + 2));
    ctx.quadraticCurveTo(...P(-30, bough - 6), ...P(-4, bough));
    ctx.lineTo(...P(8, bough));
    ctx.quadraticCurveTo(...P(40, bough - 6), ...P(92, bough + 2));
    ctx.lineTo(...P(106, bough - 4));
    ctx.quadraticCurveTo(...P(54, bough - 24), ...P(16, bough - 32));
    ctx.lineTo(...P(20, ground + 60));
    ctx.quadraticCurveTo(...P(24, ground + 20), ...P(50, ground));
    ctx.closePath();
    ctx.fill();
    // Bark grooves.
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, 2 * this.scale);
    ctx.beginPath();
    for (const bx of [-10, -2, 6, 13]) {
      ctx.moveTo(...P(bx, ground + 20 + (bx & 7) * 4));
      ctx.lineTo(...P(bx + 2, ground + 150 + (bx & 7) * 6));
    }
    ctx.stroke();
    // The crown is painted once per zoom step into its own canvas (dozens of lit clusters are too dear every frame).
    const S = Math.round(this.scale * 20) / 20;
    const key = `${S}|${light}|${this.purple}`;
    if (!this.oakCache || this.oakCache.key !== key) {
      const canvas = this.oakCache?.canvas ?? document.createElement('canvas');
      canvas.width = Math.ceil(OAK_CROWN.w * S);
      canvas.height = Math.ceil(OAK_CROWN.h * S);
      const c = canvas.getContext('2d')!;
      c.clearRect(0, 0, canvas.width, canvas.height);
      const ox = canvas.width / 2;
      const oy = OAK_CROWN.top * S;
      // Seen head-on from the crown's middle: x and height from the bough, set back by depth z.
      const at = (x: number, y: number, z: number): [number, number] => {
        const f = 1500 / (1500 + z * S);
        return [ox + x * S * f, oy - (y - OAK_CROWN.mid) * S * f];
      };
      this.paintOakCrown(c, { vx: ox, vy: oy, s: S, light }, at, S);
      this.oakCache = { canvas, key };
    }
    const k = this.scale / S;
    const [ax, ay] = this.at(0, bough + OAK_CROWN.mid, 0);
    const cv = this.oakCache.canvas;
    ctx.drawImage(cv, ax - (cv.width / 2) * k, ay - OAK_CROWN.top * S * k, cv.width * k, cv.height * k);
  }

  /** The oak's limbs and crown, in the crown's own coordinates (y measured up from the bough). */
  private paintOakCrown(ctx: CanvasRenderingContext2D, e: Eye, at: (x: number, y: number, z: number) => [number, number], scale: number): void {
    const bough = 0;
    const light = e.light;
    const P = (x: number, y: number) => at(x, y, 0);
    // Limbs reaching up into the crown, so the leaves hang off branches instead of sitting on a shelf.
    ctx.strokeStyle = '#4a2f1c';
    ctx.lineCap = 'round';
    for (const [x1, y1, x2, y2, w] of [[-60, bough - 6, -150, bough + 60, 9], [60, bough - 6, 150, bough + 50, 9], [-6, bough - 20, -50, bough + 120, 11], [8, bough - 20, 70, bough + 115, 10], [-110, bough + 40, -180, bough + 30, 5], [120, bough + 35, 190, bough + 15, 5]] as const) {
      ctx.lineWidth = Math.max(1, w * scale);
      ctx.beginPath();
      ctx.moveTo(...P(x1, y1));
      ctx.quadraticCurveTo(...P((x1 + x2) / 2, (y1 + y2) / 2 + 18), ...P(x2, y2));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // The crown: a dome of leaf clusters around a dark core, set back in depth. Clusters low in the crown are in its
    // own shade, the top ones catch the sun, and a few hang below the bough at the ends.
    const leaves = this.purple ? ['#7a4ab0', '#8a63c9', '#6c4aa8'] : FALL.leaves;
    const cx0 = 5;
    const cy0 = bough + 70;
    const rx = 205;
    const ry = 80;
    const [ccx, ccy] = at(cx0, cy0 - 5, 60);
    const core = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, rx * scale);
    core.addColorStop(0, this.purple ? '#3e2a66' : '#6a2a14');
    core.addColorStop(1, this.purple ? 'rgba(62,42,102,0)' : 'rgba(106,42,20,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(ccx, ccy, rx * 0.95 * scale, ry * 0.95 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    const clusters: { x: number; y: number; r: number; z: number; c: string; shade: number }[] = [];
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt((i + 0.5) / n);
      const x = cx0 + Math.cos(a) * rx * rr;
      const y = cy0 + Math.sin(a) * ry * rr * (Math.sin(a) < 0 ? 0.8 : 1);
      // Toward the middle of the dome the clusters bulge out toward you; at its rim they sit further back.
      const z = 20 + rr * 70 - ((i * 37) % 30);
      const up = (y - (cy0 - ry)) / (2 * ry);
      clusters.push({ x, y, r: 26 + ((i * 13) % 16) - rr * 6, z, c: leaves[i % leaves.length]!, shade: -0.32 + up * 0.42 });
    }
    for (const [x, y] of [[-175, bough - 10], [-140, bough - 22], [170, bough - 12], [140, bough - 24], [-195, bough + 25], [200, bough + 20]] as const) {
      clusters.push({ x, y, r: 20, z: 30, c: leaves[(x & 3) % leaves.length]!, shade: -0.28 });
    }
    clusters.sort((a, b) => b.z - a.z);
    for (const c of clusters) {
      const [sx, sy] = at(c.x, c.y, c.z);
      const f = 1500 / (1500 + c.z * scale);
      const r = c.r * scale * f;
      sphere(ctx, e, sx, sy, r, r * 0.88, tone(c.c, c.shade - c.z / 400));
    }
    // A few small sunlit clusters on top, on the sun side.
    for (let i = 0; i < 7; i++) {
      const x = cx0 + light * (40 + i * 22) - light * 60;
      const y = cy0 + ry * (0.75 - Math.abs(i - 3) * 0.08);
      const [sx, sy] = at(x, y, 0);
      sphere(ctx, e, sx, sy, 14 * scale, 12 * scale, tone(leaves[(i + 2) % leaves.length]!, 0.18));
    }
  }

  /**
   * The Harvest Farm's ground, seen from above: grass rows running back to the hills, a dirt lane where the fighters
   * stand, and a plowed pumpkin patch running toward you off the bottom of the screen.
   */
  private drawFarmField(p: Platform): void {
    const ctx = this.ctx;
    const s = this.scale;
    const e = this.eye();
    const purple = this.purple;
    const F = FARM_FIELD;
    const hazeHex = rgbHex(rgbOf(purple ? PALETTE.purpleHorizon : FALL.skyHorizon));
    const gy = this.sy(p.y);
    const yAt = (z: number) => this.at(0, p.y, z)[1];
    // The grass field, hazier toward the hills, with crop rows that get thinner with distance.
    const grass = purple ? '#6c4aa8' : '#8f9a3a';
    const backY = yAt(F.back);
    const laneBack = yAt(F.lane);
    const g = ctx.createLinearGradient(0, backY, 0, laneBack);
    g.addColorStop(0, blend(grass, hazeHex, 0.55));
    g.addColorStop(1, tone(grass, 0.04));
    ctx.fillStyle = g;
    ctx.fillRect(-40, backY, this.w + 80, laneBack - backY + 1);
    for (let z = F.lane, i = 0; z < F.back; z += 24 + i * 5, i++) {
      const y1 = yAt(z);
      const y2 = yAt(z + 10 + i * 2);
      ctx.fillStyle = i % 2 ? 'rgba(80,60,20,0.14)' : 'rgba(255,230,140,0.1)';
      ctx.fillRect(-40, y2, this.w + 80, y1 - y2);
    }
    if (gy - e.vy < 8) {
      // Looking along the ground (should not happen with this camera): just soil below.
      ctx.fillStyle = purple ? '#3e2a66' : '#5e3c22';
      ctx.fillRect(-40, laneBack, this.w + 80, this.h + 40 - laneBack);
      return;
    }
    // How far toward you the ground has to run to reach the bottom of the screen.
    const near = Math.min(F.maxNear, (this.h + 30 - e.vy) / (gy - e.vy));
    const zNear = (FOCAL / near - FOCAL) / s;
    // The pumpkin patch: soil, darker toward you, plowed in rows that run to the horizon.
    const laneFront = yAt(-F.lane);
    const soil = purple ? '#4a3578' : '#7a5232';
    const sg = ctx.createLinearGradient(0, laneFront, 0, this.h);
    sg.addColorStop(0, tone(soil, 0.06));
    sg.addColorStop(1, tone(soil, -0.3));
    ctx.fillStyle = sg;
    ctx.fillRect(-40, laneFront, this.w + 80, this.h + 40 - laneFront);
    const lit = e.light;
    for (let x = p.x1; x < p.x2; x += F.furrow) {
      const [a1x, a1y] = this.at(x, p.y, -F.lane);
      const [b1x] = this.at(x + F.furrow * 0.5, p.y, -F.lane);
      const [c1x] = this.at(x + F.furrow, p.y, -F.lane);
      const [a2x, a2y] = this.at(x, p.y, zNear);
      const [b2x] = this.at(x + F.furrow * 0.5, p.y, zNear);
      const [c2x] = this.at(x + F.furrow, p.y, zNear);
      if (Math.max(a1x, a2x) < -50 && Math.max(c1x, c2x) < -50) continue;
      if (Math.min(a1x, a2x) > this.w + 50 && Math.min(c1x, c2x) > this.w + 50) continue;
      // Each ridge: one slope facing the sun, one in shadow.
      ctx.fillStyle = lit > 0 ? 'rgba(40,20,8,0.22)' : 'rgba(255,214,150,0.13)';
      ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.lineTo(b1x, a1y); ctx.lineTo(b2x, a2y); ctx.lineTo(a2x, a2y); ctx.fill();
      ctx.fillStyle = lit > 0 ? 'rgba(255,214,150,0.13)' : 'rgba(40,20,8,0.22)';
      ctx.beginPath(); ctx.moveTo(b1x, a1y); ctx.lineTo(c1x, a1y); ctx.lineTo(c2x, a2y); ctx.lineTo(b2x, a2y); ctx.fill();
    }
    // Pumpkins and their vines on the rows, bigger the nearer they are.
    for (const [px, pz, pr] of [[-520, -90, 15], [-250, -150, 18], [-60, -70, 12], [190, -120, 17], [430, -80, 14], [640, -170, 16], [-700, -200, 18], [40, -230, 20]] as const) {
      if (pz < zNear * 0.85) continue;
      const v = this.viewAt(pz);
      const vx = v.sx(px);
      if (vx < -60 || vx > this.w + 60) continue;
      ctx.strokeStyle = purple ? '#5a3a90' : '#4f7a2a';
      ctx.lineWidth = Math.max(1, 2 * v.s);
      ctx.beginPath();
      ctx.moveTo(v.sx(px - 50), v.sy(p.y));
      ctx.bezierCurveTo(v.sx(px - 30), v.sy(p.y + 8), v.sx(px - 15), v.sy(p.y - 6), vx, v.sy(p.y + 2));
      ctx.stroke();
      ctx.fillStyle = purple ? '#5a3a90' : '#5f8a30';
      for (const lx of [-42, -24]) {
        ctx.beginPath();
        ctx.ellipse(v.sx(px + lx), v.sy(p.y + 4), 7 * v.s, 4 * v.s, lx * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawPumpkin(v, px, p.y, pr);
    }
    // The dirt lane, with wheel ruts and grass along its edges.
    const dirt = purple ? '#5a4a8a' : '#b08458';
    const lg = ctx.createLinearGradient(0, laneBack, 0, laneFront);
    lg.addColorStop(0, tone(dirt, -0.06));
    lg.addColorStop(1, tone(dirt, 0.1));
    ctx.fillStyle = lg;
    ctx.fillRect(-40, laneBack, this.w + 80, laneFront - laneBack);
    ctx.fillStyle = 'rgba(70,40,18,0.22)';
    for (const z of [-15, 15]) ctx.fillRect(-40, yAt(z) - s, this.w + 80, Math.max(1, 2.5 * s));
    ctx.strokeStyle = purple ? '#8a63c9' : '#7a8a2a';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    for (const z of [F.lane, -F.lane]) {
      for (let x = -1400 + (z > 0 ? 0 : 23); x < 1400; x += 47) {
        const [tx, ty] = this.at(x, p.y, z);
        if (tx < -10 || tx > this.w + 10) continue;
        const k = 1500 / (1500 + z * s);
        ctx.moveTo(tx, ty); ctx.lineTo(tx - 3 * s * k, ty - 8 * s * k);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + 2 * s * k, ty - 10 * s * k);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + 5 * s * k, ty - 6 * s * k);
      }
    }
    ctx.stroke();
    // Corn stalks right in front of you at the corners, dark against the light, to frame the field.
    for (const [cx, ch, lean] of [[-235, 70, -0.1], [-210, 58, 0.05], [-188, 46, -0.04], [205, 50, 0.06], [228, 66, -0.05], [252, 74, 0.1]] as const) {
      const v = this.viewAt(zNear * 0.92);
      const bx = v.sx(cx);
      const by = this.h + 10;
      if (bx < -80 || bx > this.w + 80) continue;
      const k = v.s;
      const tx = bx + lean * ch * k;
      const ty = by - ch * k;
      const stalk = purple ? '#2e1f4a' : '#4a3a1c';
      ctx.strokeStyle = stalk;
      ctx.lineWidth = Math.max(2, 2.4 * k);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx, by - ch * k * 0.5, tx, ty);
      ctx.stroke();
      ctx.fillStyle = stalk;
      for (let q = 1; q <= 3; q++) {
        const ly = by - ch * k * (0.25 * q);
        const side = q % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx + lean * (by - ly) * 0.9, ly);
        ctx.quadraticCurveTo(bx + side * 14 * k, ly - 10 * k, bx + side * 24 * k, ly + 6 * k);
        ctx.quadraticCurveTo(bx + side * 12 * k, ly - 4 * k, bx + lean * (by - ly) * 0.9, ly + 3 * k);
        ctx.fill();
      }
      ctx.fillStyle = purple ? '#5a3a90' : '#9a7a2a';
      ctx.beginPath();
      ctx.ellipse(tx, ty, 2.2 * k, 7 * k, lean, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The Harvest Farm's platforms: a deep field, hay bales, a hay wagon, an oak bough, all solid in perspective. */
  private drawFarmPlatform(p: Platform): void {
    const ctx = this.ctx;
    const s = this.scale;
    const e = this.eye();
    if (p.solid) {
      this.drawFarmField(p);
      return;
    }
    if (p.y > 200) {
      // The oak bough: leaves tucked behind it, then the branch itself, round and lit, tapering out to its ends.
      for (let lx = p.x1 - 10, i = 0; lx < p.x2 + 10; lx += 30, i++) {
        const [cx, cy] = this.at(lx + ((i * 17) % 12), p.y + 6 + ((i * 23) % 14), 18);
        const r = (14 + ((i * 7) % 9)) * s;
        sphere(ctx, e, cx, cy, r, r * 0.85, tone(FALL.leaves[i % FALL.leaves.length]!, -0.12));
      }
      const [lx0, ly0] = this.at(p.x1 - 6, p.y - 2, 0);
      const [lx1, ly1] = this.at(p.x2 + 6, p.y - 2, 0);
      const [mx, my] = this.at((p.x1 + p.x2) / 2, p.y - 6, 0);
      const bark = ctx.createLinearGradient(0, my - 8 * s, 0, my + 8 * s);
      bark.addColorStop(0, '#8a6040');
      bark.addColorStop(0.45, '#5a3a24');
      bark.addColorStop(1, '#2e1c10');
      ctx.fillStyle = bark;
      ctx.beginPath();
      ctx.moveTo(lx0, ly0 - 3 * s);
      ctx.quadraticCurveTo(mx, my - 11 * s, lx1, ly1 - 3 * s);
      ctx.lineTo(lx1, ly1 + 2 * s);
      ctx.quadraticCurveTo(mx, my + 10 * s, lx0, ly0 + 2 * s);
      ctx.closePath();
      ctx.fill();
      return;
    }
    if (p.x1 < 0) {
      // Hay bales stacked from the ground up to the top, each a block with straw on its face.
      const bale = 34;
      const [shx, shy] = this.at((p.x1 + p.x2) / 2, 0, 0);
      contactShadow(ctx, shx, shy, (p.x2 - p.x1) * 0.62 * s, 12 * s, 0.4);
      for (let row = 0; row * bale < p.y; row++) {
        const y0 = row * bale;
        const y1 = Math.min(p.y, y0 + bale);
        const off = row % 2 ? 20 : 0;
        for (let bx = p.x1 + off; bx < p.x2 - 10; bx += 40) {
          const bw = Math.min(40, p.x2 - bx);
          const base = row % 2 ? '#d6ae4c' : '#e2bd5a';
          const f = this.block(bx + 1, bx + bw - 1, y1, y0, -26, 26, { color: base });
          ctx.strokeStyle = 'rgba(120,85,20,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 1; k < 5; k++) {
            ctx.moveTo(f.x + 2, f.y + (f.h * k) / 5);
            ctx.lineTo(f.x + f.w - 2, f.y + (f.h * k) / 5 + ((k * 7) % 3) - 1);
          }
          ctx.stroke();
          // Twine.
          ctx.fillStyle = 'rgba(90,60,20,0.6)';
          ctx.fillRect(f.x + f.w * 0.3, f.y, Math.max(1, s), f.h);
          ctx.fillRect(f.x + f.w * 0.7, f.y, Math.max(1, s), f.h);
        }
      }
      return;
    }
    // A hay wagon: back wheels in shadow, the bed, a heap of hay, front wheels.
    const wr = 30;
    const wheel = (wx: number, z: number, k: number) => {
      const [cx, cy] = this.at(wx, wr, z);
      const f = 1500 / (1500 + z * s);
      const r = wr * s * f;
      ctx.strokeStyle = tone('#3a2614', k);
      ctx.lineWidth = Math.max(1, 4 * s * f);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI;
        ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.fillStyle = tone('#3a2614', k);
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * s * f, 0, Math.PI * 2);
      ctx.fill();
    };
    const [sx1, sy1] = this.at((p.x1 + p.x2) / 2, 0, 0);
    contactShadow(ctx, sx1, sy1, (p.x2 - p.x1) * 0.6 * s, 10 * s, 0.35);
    for (const wx of [p.x1 + 40, p.x2 - 40]) wheel(wx, 28, -0.3);
    for (const wx of [p.x1 + 40, p.x2 - 40]) this.block(wx - 4, wx + 4, p.y - 12, wr, -2, 2, { color: '#6b4426' });
    this.block(p.x1 + 40, p.x2 - 40, wr + 3, wr - 3, -28, 28, { color: '#6b4426' });
    const bed = this.block(p.x1, p.x2, p.y, p.y - 12, -28, 28, { color: '#8a5a2b', rim: true });
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let k = 1; k < 6; k++) ctx.fillRect(bed.x + (bed.w * k) / 6, bed.y, Math.max(1, s), bed.h);
    // Side boards along the back, then a loose heap of hay: mounds set back in depth, straw sticking out.
    const back = this.block(p.x1 + 4, p.x2 - 4, p.y + 16, p.y, 22, 28, { color: '#7a4e26' });
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(back.x, back.y + back.h * 0.5, back.w, Math.max(1, s));
    const span = p.x2 - p.x1;
    for (const [fx, fy, fz, fr] of [[0.2, 6, 14, 0.2], [0.5, 12, 16, 0.26], [0.8, 6, 14, 0.2], [0.33, 2, 2, 0.2], [0.68, 3, 0, 0.21]] as const) {
      const [hx, hy] = this.at(p.x1 + span * fx, p.y + fy, fz);
      sphere(ctx, e, hx, hy, span * fr * s, span * fr * 0.42 * s, this.purple ? '#c9a0ff' : '#e2bd5a');
    }
    ctx.strokeStyle = this.purple ? '#a78ad8' : '#c99a3a';
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const [tx, ty] = this.at(p.x1 + 20 + ((i * 53) % (span - 40)), p.y + 4 + ((i * 29) % 16), 4);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + ((i % 3) - 1) * 5 * s, ty - 6 * s);
    }
    ctx.stroke();
    for (const wx of [p.x1 + 40, p.x2 - 40]) wheel(wx, -30, 0.05);
  }

  /** A block in world units (x1..x2 wide, y2 bottom to y1 top) from depth z1 back to z2, in perspective and lit. */
  private block(x1: number, x2: number, y1: number, y2: number, z1: number, z2: number, style: BoxStyle): { x: number; y: number; w: number; h: number } {
    const e = this.eye();
    box3(this.ctx, e, this.sx(x1), this.sy(y1), this.sx(x2), this.sy(y2), z1, z2, style);
    return frontRect(e, this.sx(x1), this.sy(y1), this.sx(x2), this.sy(y2), z1);
  }

  /** A world point at depth z, on screen. */
  private at(x: number, y: number, z: number): [number, number] {
    return project(this.eye(), this.sx(x), this.sy(y), z);
  }

  private drawPlatform(p: Platform, stage: string): void {
    if (stage === 'harvest') { this.drawFarmPlatform(p); return; }
    const ctx = this.ctx;
    const s = this.scale;
    if (p.solid) {
      const z1 = STAGE_DEPTH.slabFront;
      const z2 = STAGE_DEPTH.slabBack;
      const body = stage === 'helipad' ? '#3a3d4a' : stage === 'cranes' ? '#3d434c' : '#454a52';
      const deck = stage === 'helipad' ? '#5b5f6e' : stage === 'cranes' ? '#8a8f96' : '#c9c3b8';
      const f = this.block(p.x1, p.x2, p.y, p.y - p.depth, z1, z2, { color: body, top: deck });
      // Lines across the deck running back to the horizon, so the surface reads as a floor.
      const e = this.eye();
      if (e.vy < f.y) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = p.x1 + 40; gx < p.x2; gx += 40) {
          const [ax, ay] = this.at(gx, p.y, z1);
          const [bx, by] = this.at(gx, p.y, z2);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        for (let z = z1 + 40; z < z2; z += 40) {
          const [ax, ay] = this.at(p.x1, p.y, z);
          const [bx] = this.at(p.x2, p.y, z);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, ay);
        }
        ctx.stroke();
        // Light falls off toward the back of the deck.
        const [, backY] = this.at(p.x1, p.y, z2);
        const dg = ctx.createLinearGradient(0, f.y, 0, backY);
        dg.addColorStop(0, 'rgba(255,255,255,0.08)');
        dg.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = dg;
        const [lx1, ly1] = this.at(p.x1, p.y, z1);
        const [lx2] = this.at(p.x2, p.y, z1);
        const [bx1, by1] = this.at(p.x1, p.y, z2);
        const [bx2] = this.at(p.x2, p.y, z2);
        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(lx2, ly1);
        ctx.lineTo(bx2, by1);
        ctx.lineTo(bx1, by1);
        ctx.closePath();
        ctx.fill();
        if (stage === 'helipad') {
          // The landing circle painted on the deck, in perspective.
          const zc = (z1 + z2) / 2;
          const [cx, cy] = this.at(0, p.y, zc);
          const [, nearY] = this.at(0, p.y, zc - 70);
          const [, farY] = this.at(0, p.y, zc + 70);
          const [rx1] = this.at(-120, p.y, zc);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = Math.max(1, 3 * s);
          ctx.beginPath();
          ctx.ellipse(cx, cy, cx - rx1, Math.max(1, (nearY - farY) / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // The front face: panel grid and a hazard stripe along the lip.
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cols = Math.round((p.x2 - p.x1) / 40);
      for (let c = 1; c < cols; c++) {
        const gx = f.x + (f.w * c) / cols;
        ctx.moveTo(gx, f.y + 14 * s);
        ctx.lineTo(gx, f.y + f.h);
      }
      for (let gy = f.y + 34 * s; gy < f.y + f.h; gy += 20 * s) {
        ctx.moveTo(f.x, gy);
        ctx.lineTo(f.x + f.w, gy);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(f.x, f.y, f.w, Math.max(1, 1.5 * s));
      const stripe = 16 * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.x, f.y + 3 * s, f.w, 9 * s);
      ctx.clip();
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(f.x, f.y + 3 * s, f.w, 9 * s);
      ctx.fillStyle = PALETTE.orange;
      for (let sx = f.x - stripe; sx < f.x + f.w + stripe; sx += stripe * 2) {
        ctx.beginPath();
        ctx.moveTo(sx, f.y + 12 * s);
        ctx.lineTo(sx + stripe, f.y + 3 * s);
        ctx.lineTo(sx + stripe * 2, f.y + 3 * s);
        ctx.lineTo(sx + stripe, f.y + 12 * s);
        ctx.fill();
      }
      ctx.restore();
      // Shadow under the lip.
      const ug = ctx.createLinearGradient(0, f.y + 12 * s, 0, f.y + 40 * s);
      ug.addColorStop(0, 'rgba(0,0,0,0.35)');
      ug.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ug;
      ctx.fillRect(f.x, f.y + 12 * s, f.w, 28 * s);
      // Yellow corner lights where you can be pulled up onto the stage.
      for (const cx of [f.x, f.x + f.w]) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(cx - 3 * s, f.y - 2, 6 * s, 16 * s);
        glow(ctx, cx, f.y + 6 * s, 18 * s, 'rgba(255,210,63,0.45)');
      }
      if (stage === 'helipad') {
        for (let i = -4; i <= 4; i++) {
          const [lx, ly] = this.at(i * 95, p.y, z1);
          const on = (this.time >> 4) % 9 === i + 4;
          ctx.fillStyle = on ? '#ffe27a' : '#a8ff7a';
          ctx.fillRect(lx - 2 * s, ly - 4 * s, 4 * s, 3 * s);
          if (on) glow(ctx, lx, ly - 3 * s, 14 * s, 'rgba(255,226,122,0.6)');
        }
      }
    } else {
      // A steel I-beam: you see its top flange and the web in shadow.
      const color = stage === 'cranes' ? '#e8a21a' : PALETTE.orange;
      const f = this.block(p.x1, p.x2, p.y, p.y - 12, -STAGE_DEPTH.beam, STAGE_DEPTH.beam, { color, rim: true });
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(f.x, f.y + f.h * 0.3, f.w, f.h * 0.4);
      ctx.fillStyle = tone(color, -0.5);
      for (let k = 0; k * 20 + 10 < p.x2 - p.x1; k++) ctx.fillRect(f.x + (k * 20 + 10) * (f.w / (p.x2 - p.x1)) - s, f.y + f.h * 0.5 - s, 2 * s, 2 * s);
      if (stage !== 'rooftop') return;
      // Cables up to the crane holding it.
      const [ax, ay] = this.at(p.x1 + 6, p.y, 0);
      const [bx] = this.at(p.x2 - 6, p.y, 0);
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo((ax + bx) / 2, 0);
      ctx.lineTo(bx, ay);
      ctx.stroke();
    }
  }

  private drawProjectile(p: Projectile, color: string, slotColor: string): void {
    const ctx = this.ctx;
    const s = this.scale;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    const r = p.r;
    if (this.drawLook(p, px, py, r * s, color)) return;
    if (p.kind === 'shot') {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2 * s);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, color);
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'gust') {
      // Curved wind lines.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3 * s;
      const d = p.vx >= 0 ? 1 : -1;
      for (let i = -1; i <= 1; i++) {
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.time * 0.5 + i);
        ctx.beginPath();
        ctx.arc(px - d * 10 * s, py + i * 12 * s, r * (0.6 + 0.15 * Math.abs(i)) * s, d > 0 ? -0.9 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 0.9);
        ctx.stroke();
      }
      ctx.restore();
    } else if (p.kind === 'bomb') {
      // The Titan's boulder: a tumbling lumpy rock with the thrower's color on it.
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.age * 0.15 * (p.vx >= 0 ? -1 : 1));
      ctx.fillStyle = '#7a6a58';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = r * s * (0.85 + 0.2 * Math.sin(i * 2.7));
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = slotColor;
      ctx.fillRect(-r * 0.3 * s, -r * 0.3 * s, r * 0.35 * s, r * 0.25 * s);
      ctx.restore();
    } else {
      // Mines; one blinks faster once it's armed.
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      if (p.kind === 'mine') ctx.ellipse(px, py, r * 1.3 * s, r * 0.8 * s, 0, 0, Math.PI * 2);
      else ctx.arc(px, py, r * s, 0, Math.PI * 2);
      ctx.fill();
      const armed = p.kind !== 'mine' || p.age >= 30;
      ctx.fillStyle = (this.time >> (armed ? 2 : 4)) % 2 ? '#ff3b30' : color;
      ctx.beginPath();
      ctx.arc(px, py - r * 0.6 * s, r * 0.35 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Projectiles with their own look. Returns false to fall back to the plain kinds. */
  private drawLook(p: Projectile, px: number, py: number, r: number, color: string): boolean {
    const ctx = this.ctx;
    const ink = PALETTE.ink;
    const ball = (fill: string, rr = r) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    if (winter.drawChristmasLook(ctx, p, px, py, r)) return true;
    switch (p.look) {
      case 'star': {
        // A spinning four-point throwing star.
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.age * 0.6);
        ctx.fillStyle = '#c9d1d9';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 ? r * 0.45 : r * 1.5;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return true;
      }
      case 'goldbullet': {
        // The Gunslinger's last round: thick, golden, glowing.
        const d = Math.sign(p.vx) || 1;
        ctx.strokeStyle = '#ffd23faa';
        ctx.lineWidth = r * 1.6;
        ctx.beginPath();
        ctx.moveTo(px - d * r * 9, py);
        ctx.lineTo(px, py);
        ctx.stroke();
        ball('#fff2b0', r * 1.3);
        return true;
      }
      case 'bullet': {
        const d = Math.sign(p.vx) || 1;
        ctx.strokeStyle = color + '88';
        ctx.lineWidth = r * 0.8;
        ctx.beginPath();
        ctx.moveTo(px - d * r * 6, py);
        ctx.lineTo(px, py);
        ctx.stroke();
        ball('#ffe9a8', r * 0.8);
        return true;
      }
      case 'smoke':
        ball('#4a4a4a');
        ctx.fillStyle = '#ff6a13';
        ctx.fillRect(px - 1.5, py - r - 4, 3, 5);
        return true;
      case 'tomato':
        ball('#e8322a');
        ctx.fillStyle = '#3fae49';
        ctx.fillRect(px - 2, py - r - 2, 4, 3);
        return true;
      case 'pie':
        ball('#f5e6c8');
        ctx.fillStyle = '#c0552b';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        return true;
      case 'meatball':
        ball('#7a4a2a');
        return true;
      case 'snack':
        // River's cookie.
        ball('#c98a4b');
        ctx.fillStyle = '#4a2a14';
        for (const [dx, dy] of [[-0.35, -0.2], [0.3, -0.3], [0.05, 0.35]] as const) ctx.fillRect(px + dx * r - 1.5, py + dy * r - 1.5, 3, 3);
        return true;
      // Seasonal (ADR-0082).
      case 'egg':
        ctx.fillStyle = '#f6efe1';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.8, r, p.age * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        return true;
      case 'musketball':
      case 'cannonball': {
        const big = p.look === 'cannonball';
        const d = Math.sign(p.vx) || 1;
        ctx.strokeStyle = big ? '#e0b04aaa' : '#ffffff77';
        ctx.lineWidth = r * (big ? 1.8 : 0.9);
        ctx.beginPath();
        ctx.moveTo(px - d * r * (big ? 8 : 5), py);
        ctx.lineTo(px, py);
        ctx.stroke();
        ball(big ? '#2b2d30' : '#5a5e63', r * (big ? 1.8 : 0.8));
        return true;
      }
      case 'pumpkin':
        ctx.fillStyle = '#e8731f';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#b4531a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.45, r * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#3f7a2a';
        ctx.fillRect(px - 1.5, py - r * 0.85 - 4, 3, 5);
        return true;
      case 'spear': {
        // A fishing spear along its flight.
        const a = Math.atan2(-p.vy, p.vx);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-r * 4, 0);
        ctx.lineTo(r * 1.5, 0);
        ctx.stroke();
        ctx.strokeStyle = '#c99a5b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 4, 0);
        ctx.lineTo(r * 1.5, 0);
        ctx.stroke();
        ctx.fillStyle = '#d8d2c4';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r * 1.5, -r * 0.5);
        ctx.lineTo(r * 2.8, 0);
        ctx.lineTo(r * 1.5, r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return true;
      }
      case 'pot': {
        // A pot on the boil: steam and bubbles.
        ctx.fillStyle = '#3a3e44';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(px - r, py - r * 0.6, r * 2, r * 1.6, r * 0.3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(px - r * 0.85, py - r * 0.6, r * 1.7, r * 0.3);
        if (p.stuck && this.time % 6 === 0) {
          this.particles.push({ x: p.x + (Math.random() - 0.5) * p.r, y: p.y + p.r * 0.8, vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 40, life: 30, max: 30, size: 6 + Math.random() * 6, color: '#ffffffaa', kind: 'smoke', grow: 0.4 });
        }
        return true;
      }
      case 'wisp': {
        const g = this.ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, ATTACK_COLORS.curse);
        g.addColorStop(1, ATTACK_COLORS.curse + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (this.time % 3 === 0) this.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.2, vy: 20, life: 18, max: 18, size: p.r * 0.6, color: ATTACK_COLORS.curse, kind: 'wisp', grow: 0.4 });
        return true;
      }
      case 'yoyo': {
        // The string runs back to the thrower's hand.
        const owner = this.lastWorld?.fighters[p.owner];
        if (owner) {
          ctx.strokeStyle = PALETTE.ink;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(this.sx(owner.x + owner.facing * 10), this.sy(centerY(owner) + 4));
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.age * 0.5);
        ball(color);
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.stroke();
        ctx.restore();
        return true;
      }
      case 'note': {
        // A music note riding a sound wave.
        ctx.strokeStyle = color + 'aa';
        ctx.lineWidth = 3;
        const d = Math.sign(p.vx) || 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(px - d * i * 9, py, r * (0.7 + i * 0.25), d > 0 ? -0.8 : Math.PI - 0.8, d > 0 ? 0.8 : Math.PI + 0.8);
          ctx.stroke();
        }
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(px, py + r * 0.3, r * 0.35, r * 0.27, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(px + r * 0.28, py - r * 0.7, 2, r);
        ctx.fillRect(px + r * 0.28, py - r * 0.7, r * 0.4, 2);
        return true;
      }
      default:
        return false;
    }
  }

  private pose(f: Fighter): { tilt: number; spin: number } {
    const def = fighterDef(f);
    if (f.action === 'hitstun') return { tilt: 0, spin: (f.frame * 0.35 + f.slot) * (f.lastKb > 60 ? 1 : 0.3) };
    if (f.action === 'roll' || ((f.action === 'tech' || f.action === 'getup') && f.vx !== 0)) {
      return { tilt: 0, spin: (f.frame / Math.max(1, f.duration)) * Math.PI * 2 * (f.vx * f.facing >= 0 ? 1 : -1) };
    }
    if (f.action === 'down') return { tilt: -1.45, spin: 0 };
    if (f.action === 'getup' || f.action === 'tech') return { tilt: -1.45 * (1 - f.frame / Math.max(1, f.duration)), spin: 0 };
    if (f.action === 'held') return { tilt: 0.5 + Math.sin(f.frame * 0.9) * 0.15, spin: 0 };
    if (f.action === 'holding') return { tilt: 0.25, spin: 0 };
    if (f.action === 'attack' && f.move) {
      const m = def.moves[f.move]!;
      const startup = Math.max(1, (m.hitboxes?.[0]?.from ?? m.throwHit?.frame ?? m.projectile?.frame ?? 4) - 1);
      const t = Math.min(1, f.frame / m.frames);
      const wind = Math.min(1, f.frame / startup);
      const tilts: Partial<Record<MoveId, number>> = {
        jab: 0.2 * wind, jab2: 0.3 * wind, jab3: 0.5 * wind,
        ftilt: 0.45 * wind, utilt: -0.7 * wind, dtilt: 0.3 * wind,
        fsmash: f.frame <= startup ? -0.4 * wind : 0.8, usmash: -1.0 * wind, dsmash: 0.5 * wind,
        fair: 0.6 * wind, bair: -0.6 * wind, uair: -0.8 * wind, dair: 1.0 * wind,
        sspecial: 0.5, sspecialAir: 0.6, dspecial: m.slam ? 1.4 : 0.2, dspecialAir: 1.4,
        grab: 0.35 * wind, pummel: 0.4, fthrow: 0.6 * wind, bthrow: -0.9 * wind, uthrow: -1.0 * wind, dthrow: 1.0 * wind,
        carry: -0.6, carryslam: 0.4, counterhit: 0.7, riposte: 0.5, quake: 0.3,
      };
      if (f.move === 'nair' || f.move === 'getupattack') return { tilt: 0, spin: t * Math.PI * 2 };
      // Spinning recoveries: the Brawler's spiral kick and the Blade's rising spin.
      if (f.move === 'uspecial') return { tilt: -0.2, spin: f.id === 'brawler' || f.id === 'blade' ? t * Math.PI * 4 : 0 };
      if (f.move === 'dspecial' && m.counter) return { tilt: -0.3, spin: 0 };
      return { tilt: (tilts[f.move] ?? 0) * (1 - Math.max(0, t - 0.7) / 0.3), spin: 0 };
    }
    const lean = Math.max(-1, Math.min(1, f.vx / def.airSpeed)) * f.facing;
    return { tilt: lean * 0.28, spin: 0 };
  }

  private drawFighter(world: World, f: Fighter, x: number, y: number): void {
    const ctx = this.ctx;
    const def = fighterDef(f);
    const color = fighterColor(f);
    const cx = this.sx(x);
    const cy = this.sy(y + def.height / 2);
    const s = this.scale;

    if (f.action === 'respawn') {
      // Hovering respawn pad.
      ctx.fillStyle = color + 'aa';
      ctx.fillRect(cx - 40 * s, this.sy(y) + 2 * s, 80 * s, 5 * s);
      ctx.fillStyle = color + '33';
      ctx.fillRect(cx - 40 * s, this.sy(y) + 7 * s, 80 * s, 60 * s);
    }

    // Shadow on the platform below.
    const ground = this.groundBelow(f, x);
    if (ground !== null && y - ground < 400) {
      const k = 1 - (y - ground) / 400;
      ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
      ctx.beginPath();
      ctx.ellipse(cx, this.sy(ground) + 2 * s, def.halfW * s * (0.6 + 0.4 * k), 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Swing trail behind the figure, so the pose stays readable.
    const look = f.action === 'attack' && f.move ? moveLook(f.id, f.move) : null;
    const fxColor = look?.color ?? color;
    this.drawTrail(f, look, fxColor);

    const { tilt, spin } = this.pose(f);
    const invisible = f.invincible > 0 && f.action !== 'respawn' && (this.time >> 2) % 2 === 0;
    ctx.save();
    ctx.translate(cx + (f.hitlag > 0 && f.action === 'hitstun' ? (Math.random() - 0.5) * 6 : 0), cy);
    ctx.scale(s * f.facing, s);
    ctx.rotate(tilt + spin);
    if (invisible) ctx.globalAlpha = 0.45;
    const thrust = f.grounded ? 0.2 : f.vy > 0 ? 1 : 0.5;
    // The signature meter shows on the dressed looks (ADR-0084). The Yo-yo Kid's only while a combo is live.
    const gauge = signatureGauge(world, f);
    const meter = gauge && !(f.id === 'yoyo' && !gauge.text) ? gauge.value : 0;
    drawFighterFigure(ctx, f.id, {
      color,
      rage: koFraction(f),
      meter,
      ready: gauge?.ready ?? false,
      sisters: f.id === 'firstlight' ? f.meter : undefined,
      phase: this.time * (0.9 + thrust * 0.8) + f.slot,
      blink: this.blinkAmount(f.slot) + (f.action === 'hitstun' || f.action === 'shieldbreak' ? 1 : 0),
      flash: this.flashes.get(f.slot) ?? 0,
      thrust,
      stride: f.grounded && Math.abs(f.vx) > 30 ? Math.min(1, Math.abs(f.vx) / def.walkSpeed) : 0,
      punch: moveActive(f),
      ...this.attackPose(f),
    });
    ctx.restore();

    // Shield bubble.
    if (f.action === 'shield' || f.action === 'shieldstun') {
      const r = def.hurtR * (0.7 + 0.7 * (f.shieldHp / SHIELD.maxHp)) * s;
      ctx.fillStyle = color + '44';
      ctx.strokeStyle = color + 'cc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (f.action === 'shieldbreak' && this.time % 20 < 10) {
      this.label('DIZZY', cx, cy - def.height * s - 10, '#ffe27a');
    }

    // Swing arc on active frames, so you can see what's hitting.
    // Charging: a growing, pulsing glow.
    const charge = chargeFraction(f);
    if (charge > 0) {
      const r = (def.hurtR + 6 + charge * 18 + Math.sin(this.time * 0.8) * 3) * s;
      ctx.strokeStyle = charge >= 1 ? '#fff6c9' : fxColor;
      ctx.lineWidth = 2 + charge * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Full KO meter: a flickering red aura.
    if (koFraction(f) >= 1) {
      const r = (def.hurtR + 10 + Math.sin(this.time * 0.6) * 3) * s;
      const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      g.addColorStop(0, ATTACK_COLORS.rage + '00');
      g.addColorStop(1, ATTACK_COLORS.rage + '55');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (this.time % 4 === 0) this.ember(f.x + (Math.random() - 0.5) * def.halfW * 2, f.y + Math.random() * def.height, ATTACK_COLORS.rage, 60);
    }
    // Counter stance: a white outline.
    if (f.action === 'attack' && f.move) {
      const c = def.moves[f.move]!.counter;
      if (c && f.frame >= c.from && f.frame <= c.to) {
        ctx.strokeStyle = '#ffffffcc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, (def.hurtR + 8) * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const box of activeHitboxes(f)) {
      {
        ctx.save();
        ctx.globalAlpha = 0.3;
        const g = ctx.createRadialGradient(this.sx(box.x), this.sy(box.y), 0, this.sx(box.x), this.sy(box.y), box.r * s);
        g.addColorStop(0, '#ffffffcc');
        g.addColorStop(0.6, fxColor + '88');
        g.addColorStop(1, fxColor + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.sx(box.x), this.sy(box.y), box.r * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Status effects: a curse swirl, slow zzz, haste streaks.
    const headY = cy - (def.height / 2 + 8) * s;
    if (f.cursed > 0) {
      ctx.strokeStyle = ATTACK_COLORS.curse;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = this.time * 0.25 + i * 0.6;
        const rr = 3 + i * 0.7;
        const x = cx + Math.cos(a) * rr * s;
        const y = headY - 6 * s + Math.sin(a) * rr * 0.5 * s;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (f.slowed > 0 && this.time % 30 < 20) this.label('z z', cx + 18 * s, headY - 4 * s, ATTACK_COLORS.slow);
    if (f.hasted > 0 && Math.abs(f.vx) > 60) {
      ctx.strokeStyle = ATTACK_COLORS.haste;
      ctx.lineWidth = 2;
      const back = -Math.sign(f.vx);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + back * (def.halfW + 4) * s, cy + i * 10 * s);
        ctx.lineTo(cx + back * (def.halfW + 22) * s, cy + i * 10 * s);
        ctx.stroke();
      }
    }
    // Marks (Ninja) and haunting (Ghost) on this fighter: little pips over the head, in the marker's color (ADR-0079).
    let pipRow = 0;
    for (let slot = 0; slot < f.tags.length; slot++) {
      const n = f.tags[slot] ?? 0;
      const by = world.fighters[slot];
      if (!n || !by) continue;
      const haunt = by.id === 'ghost';
      const py = headY - (16 + pipRow * 9) * s;
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * 9 * s;
        ctx.fillStyle = haunt ? ATTACK_COLORS.curse : ATTACK_COLORS.special.ninja;
        ctx.strokeStyle = fighterColor(by);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (haunt) ctx.arc(px, py, 3.2 * s, 0, Math.PI * 2);
        else { ctx.moveTo(px, py - 4 * s); ctx.lineTo(px + 4 * s, py); ctx.lineTo(px, py + 4 * s); ctx.lineTo(px - 4 * s, py); ctx.closePath(); }
        ctx.fill();
        ctx.stroke();
      }
      pipRow++;
    }
    // Possessed: purple strings up to the Ghost pulling them.
    if (f.puppet > 0) {
      const g = world.fighters[f.puppetBy];
      if (g) {
        ctx.save();
        ctx.strokeStyle = ATTACK_COLORS.curse + 'cc';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -this.time;
        for (const off of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(cx + off * def.halfW * s, headY);
          ctx.lineTo(this.sx(g.x), this.sy(centerY(g)));
          ctx.stroke();
        }
        ctx.restore();
        if (this.time % 20 < 12) this.label('MASH!', cx, headY - 30 * s, ATTACK_COLORS.curse);
      }
    }
    // Chef's recipe: a steam wisp while it lasts.
    if (f.buff > 0 && this.time % 6 === 0) this.ember(f.x + (Math.random() - 0.5) * def.halfW, f.y + def.height, f.buffKind === 'chili' ? '#ff4a2a' : f.buffKind === 'feast' ? '#ffd23f' : '#ffffff', 40);
    // Gunslinger: shots left.
    const maxAmmo = def.ammo;
    if (maxAmmo) {
      for (let i = 0; i < maxAmmo; i++) {
        ctx.fillStyle = i < f.ammo ? (i === 0 ? '#fff2b0' : ATTACK_COLORS.special.gunslinger) : '#00000055';
        ctx.fillRect(cx + (i - maxAmmo / 2) * 6 * s, cy + (def.height / 2 + 6) * s, 4 * s, 4 * s);
      }
    }

    // Tag above the fighter: people get "P1" and an arrow, CPUs a muted "CPU 3" (ADR-0075).
    const tag = this.tags[f.slot] ?? { text: `P${f.slot + 1}`, cpu: false };
    const tagY = cy - (def.height / 2 + 26) * s - 8;
    if (tag.cpu) this.label(tag.text, cx, tagY, CPU_TAG.color, false, CPU_TAG.scale);
    else this.label(tag.text, cx, tagY, color, true);
  }

  /** Which stick-figure attack pose to show, and how far through its swing. */
  private attackPose(f: Fighter): { attack?: MoveLook['pose']; strike?: number } {
    if (f.action === 'holding') return { attack: 'grab', strike: 1 };
    if (f.action !== 'attack' || !f.move) return {};
    const m = fighterDef(f).moves[f.move]!;
    const look = moveLook(f.id, f.move);
    const hit = m.hitboxes?.[0]?.from ?? m.throwHit?.frame ?? m.projectile?.frame ?? m.boost?.frame ?? m.lunge?.frame ?? 4;
    const windup = Math.max(1, hit - 1);
    // Wind up, snap out, hold, then ease back over the last third.
    let strike = Math.min(1, f.frame / windup);
    const tail = Math.max(0, (f.frame - m.frames * 0.7) / (m.frames * 0.3));
    strike *= 1 - Math.min(1, tail) * 0.6;
    if (m.charge && f.frame <= m.charge.frame) strike = 0;
    if (m.counter && f.frame >= m.counter.from && f.frame <= m.counter.to) strike = 1;
    return { attack: look.pose, strike };
  }

  /** The swing trail: a fading ribbon through recent hitbox positions, styled by the attack. */
  private drawTrail(f: Fighter, look: MoveLook | null, color: string): void {
    const trail = this.trails.get(f.slot);
    if (!trail || trail.length < 1) return;
    const ctx = this.ctx;
    const s = this.scale;
    const fx = look?.fx ?? 'arc';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (fx === 'spin') {
      // A ring all the way round.
      const p = trail[trail.length - 1]!;
      const r = Math.max(p.r, Math.hypot(p.x - f.x, p.y - centerY(f)) + p.r * 0.6);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      const a0 = this.time * 0.6;
      ctx.arc(this.sx(f.x), this.sy(centerY(f)), r * s, a0, a0 + Math.PI * 1.6);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.restore();
      return;
    }
    const pts = trail.length === 1
      ? [{ x: f.x + (trail[0]!.x - f.x) * 0.4, y: centerY(f) + (trail[0]!.y - centerY(f)) * 0.4, r: trail[0]!.r * 0.6 }, trail[0]!]
      : trail;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const k = i / (pts.length - 1);
      const w = b.r * (fx === 'flame' ? 1.4 : fx === 'zap' ? 0.5 : fx === 'puff' ? 0.5 : 1) * k * s;
      ctx.globalAlpha = 0.25 + 0.5 * k;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, w);
      ctx.beginPath();
      if (fx === 'zap') {
        // Jagged lightning between the points.
        ctx.moveTo(this.sx(a.x), this.sy(a.y));
        const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 18;
        const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 18;
        ctx.lineTo(this.sx(mx), this.sy(my));
        ctx.lineTo(this.sx(b.x), this.sy(b.y));
      } else {
        ctx.moveTo(this.sx(a.x), this.sy(a.y));
        ctx.lineTo(this.sx(b.x), this.sy(b.y));
      }
      ctx.stroke();
      // A bright core for hot and energy attacks.
      if (fx === 'flame' || fx === 'energy' || fx === 'spike') {
        ctx.strokeStyle = fx === 'flame' ? ATTACK_COLORS.smashCore : '#ffffff';
        ctx.lineWidth = Math.max(1, w * 0.35);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private blinkAmount(slot: number): number {
    const t = (this.time + slot * 97) % 240;
    return t < 6 ? Math.sin((t / 6) * Math.PI) : 0;
  }

  private groundBelow(f: Fighter, x: number): number | null {
    let best: number | null = null;
    for (const p of this.platforms) {
      if (x >= p.x1 && x <= p.x2 && p.y <= f.y + 1 && (best === null || p.y > best)) best = p.y;
    }
    return best;
  }

  /** The tag over each fighter's head, by slot. */
  setTags(tags: readonly { text: string; cpu: boolean }[]): void {
    this.tags = [...tags];
  }

  /** MIRROR cheat (ADR-0077): the whole picture flips left to right; text is drawn flipped back. */
  setMirror(on: boolean): void {
    this.mirrored = on;
    this.canvas.style.transform = on ? 'scaleX(-1)' : '';
  }

  private label(text: string, x: number, y: number, color: string, arrow = false, scale = 1): void {
    const ctx = this.ctx;
    if (this.mirrored) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    ctx.font = `800 ${Math.round(Math.max(12, this.h * 0.022) * scale)}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    if (arrow) {
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 1);
      ctx.lineTo(x + 5, y + 1);
      ctx.lineTo(x, y + 7);
      ctx.fill();
    }
    if (this.mirrored) ctx.restore();
  }

  private drawParticles(front: boolean): void {
    const ctx = this.ctx;
    const s = this.scale;
    for (const p of this.particles) {
      const isFront = p.kind !== 'smoke' && p.kind !== 'dust';
      if (isFront !== front) continue;
      const a = p.life / p.max;
      const x = this.sx(p.x);
      const y = this.sy(p.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.kind === 'smoke' ? a * 0.7 : a));
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 4 * a * s);
        ctx.beginPath();
        ctx.arc(x, y, p.size * s, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const r = p.size * s;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rr = i % 2 ? r * 0.3 : r;
          ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
        ctx.fill();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * s);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (p.vx / 60) * s * 3, y + (p.vy / 60) * s * 3);
        ctx.stroke();
      } else if (p.kind === 'ember') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, p.size) * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (p.kind === 'bolt') {
        // A random zigzag out from the point, redrawn each frame so it flickers.
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 2 * s);
        for (let j = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          const ang = Math.random() * Math.PI * 2;
          let bx = x;
          let by = y;
          for (let k = 0; k < 4; k++) {
            bx += Math.cos(ang) * (p.size / 4) * s + (Math.random() - 0.5) * 10 * s;
            by += Math.sin(ang) * (p.size / 4) * s + (Math.random() - 0.5) * 10 * s;
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
        }
      } else if (p.kind === 'wisp') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 2.5 * a * s);
        ctx.beginPath();
        const st = (1 - a) * 3;
        ctx.arc(x, y, p.size * s, st, st + Math.PI * 1.1);
        ctx.stroke();
      } else if (p.kind === 'wave') {
        // A flat ring along the floor.
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 5 * a * s);
        ctx.beginPath();
        ctx.ellipse(x, y, p.size * s, p.size * 0.18 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * s * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (p.vx / 60) * s * 1.5, y + (p.vy / 60) * s * 1.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawKoBeams(): void {
    const ctx = this.ctx;
    for (const b of this.koBeams) {
      const x = this.sx(b.x);
      const y = this.sy(b.y);
      const a = b.life / 50;
      // A burst of light shooting from the blast zone back toward the middle of the screen.
      const ang = Math.atan2(this.h / 2 - y, this.w / 2 - x);
      const len = Math.max(this.w, this.h) * 0.9;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.15, b.color);
      g.addColorStop(1, b.color + '00');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      const spread = 40 + (1 - a) * 160;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(len, -spread);
      ctx.lineTo(len, spread);
      ctx.lineTo(0, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Bubbles at the screen edge for fighters out of view. */
  private drawOffscreen(world: World): void {
    const ctx = this.ctx;
    for (const f of world.fighters) {
      if (!isAlive(f)) continue;
      const def = FIGHTERS[f.id];
      const x = this.sx(f.x);
      const y = this.sy(f.y + def.height / 2);
      const m = 40;
      if (x > -10 && x < this.w + 10 && y > -10 && y < this.h + 10) continue;
      const bx = Math.max(m, Math.min(this.w - m, x));
      const by = Math.max(m, Math.min(this.h - m, y));
      const color = fighterColor(f);
      ctx.fillStyle = 'rgba(20,21,22,0.75)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(bx, by);
      const k = 0.6 * (28 / (def.halfW + 6));
      ctx.scale(k * f.facing, k);
      drawFighterFigure(ctx, f.id, { color, phase: this.time, blink: 0, flash: 0, thrust: 1 });
      ctx.restore();
    }
  }
}
