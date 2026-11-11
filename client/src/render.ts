// Side-view renderer (ADR-0070): Canvas 2D, a camera that frames every fighter, parallax city
// backdrop, stage art, fighters, hit effects and screen shake.

import { FIGHTERS, type MoveId } from '../../shared/fighter/fighters';
import { activeHitboxes, centerY, chargeFraction, fighterDef, isAlive, moveActive, rageFraction, type Fighter, type GameEvent, type Projectile, type World } from '../../shared/fighter/sim';
import { SHIELD } from '../../shared/fighter/config';
import type { Platform } from '../../shared/fighter/stages';
import { ATTACK_COLORS, CAMERA, FEEL, PALETTE, SLOT_COLORS } from './config';
import { moveLook, type MoveLook } from './moveLooks';
import { drawFighterFigure } from './figures';
import { isPurpleSkyTime } from './purpleSky';

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
}

/** Previous positions for smooth drawing between sim frames. */
export interface Prev {
  x: number;
  y: number;
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
  private purpleCheck = 0;
  private platforms: Platform[] = [];

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = -2600; x < 2600; ) {
      const w = 60 + rand() * 120;
      this.far.push({ x, w, h: 160 + rand() * 360, windows: false });
      x += w + rand() * 20;
    }
    for (let x = -2200; x < 2200; ) {
      const w = 80 + rand() * 140;
      this.near.push({ x, w, h: 120 + rand() * 420, windows: true });
      x += w + 10 + rand() * 50;
    }
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

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
          const color = look?.color ?? SLOT_COLORS[e.attacker] ?? '#fff';
          if (look) this.hitFx(look, e.x, e.y, color, e.kb, e.dmg);
          const n = 6 + Math.min(20, Math.floor(e.dmg * 1.4));
          for (let i = 0; i < n; i++) this.spark(e.x, e.y, color, 200 + e.kb * 6);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 14, max: 14, size: 10 + e.dmg * 2, color: '#fff', kind: 'ring', grow: 4 + e.kb * 0.05 });
          if (e.dmg >= 10) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 10, max: 10, size: 14 + e.dmg, color: '#fff6c9', kind: 'star', grow: 1 });
          this.flashes.set(e.target, 1);
          if (e.armored) this.popup(world.fighters[e.target]!, 'ARMOR', '#ffb36b');
          if (e.tip) {
            // A clean sword-tip hit: a bright white star and a ring.
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 14, max: 14, size: 16 + e.dmg, color: ATTACK_COLORS.tip, kind: 'star', grow: 2.5 });
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 12, max: 12, size: 8, color: ATTACK_COLORS.tip, kind: 'ring', grow: 5 });
          }
          if (e.rage) {
            // The Brawler unloads its rage.
            for (let i = 0; i < 30; i++) this.ember(e.x, e.y, i % 3 ? ATTACK_COLORS.rage : ATTACK_COLORS.smashCore, 600);
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 26, max: 26, size: 24, color: ATTACK_COLORS.rage, kind: 'ring', grow: 10 });
            this.popup(attacker, 'RAGE!', ATTACK_COLORS.rage);
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
          this.particles.push({ x: f.x, y: centerY(f), vx: 0, vy: 0, life: 10, max: 10, size: 12, color: SLOT_COLORS[e.slot] ?? '#fff', kind: 'ring', grow: 3 });
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
          const color = SLOT_COLORS[e.slot] ?? '#fff';
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
          for (let i = 0; i < 30; i++) this.spark(e.x, e.y, i % 3 ? PALETTE.orange : '#ffe27a', 600);
          for (let i = 0; i < 10; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 100, vy: 40 + Math.random() * 80, life: 50, max: 50, size: 16 + Math.random() * 14, color: '#55504a', kind: 'smoke', grow: 0.6 });
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 16, max: 16, size: e.r * 0.4, color: '#ffe27a', kind: 'ring', grow: e.r * 0.06 });
          this.shake = Math.min(FEEL.maxShake, this.shake + 12);
          break;
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
          this.particles.push({ x: f.x, y: centerY(f), vx: 0, vy: 0, life: 24, max: 24, size: 10, color: SLOT_COLORS[e.slot] ?? '#fff', kind: 'ring', grow: 5 });
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
    let x1 = main.x1 + 100;
    let x2 = main.x2 - 100;
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
      if (look) this.swingFx(f, look, look.color ?? SLOT_COLORS[f.slot] ?? '#fff');
      else if (this.trails.has(f.slot)) { const t = this.trails.get(f.slot)!; t.shift(); if (!t.length) this.trails.delete(f.slot); }
      // Charging: sparks gather in.
      const charge = chargeFraction(f);
      if (charge > 0 && this.time % 2 === 0) {
        const c = look?.color ?? SLOT_COLORS[f.slot] ?? '#fff';
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
    if (++this.purpleCheck % 60 === 1) this.purple = isPurpleSkyTime();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky();
    const sh = this.shake;
    ctx.save();
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawBackdrop();
    this.drawStage(world);
    this.drawParticles(false);
    for (const p of world.projectiles) this.drawProjectile(p, ATTACK_COLORS.special[world.fighters[p.owner]!.id] ?? SLOT_COLORS[p.owner] ?? '#fff', SLOT_COLORS[p.owner] ?? '#fff');
    for (const f of world.fighters) {
      if (!isAlive(f)) continue;
      const pv = prev[f.slot];
      const x = pv && f.hitlag === 0 ? pv.x + (f.x - pv.x) * alpha : f.x;
      const y = pv && f.hitlag === 0 ? pv.y + (f.y - pv.y) * alpha : f.y;
      this.drawFighter(f, x, y);
    }
    this.drawParticles(true);
    this.drawKoBeams();
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life / 12);
      this.label(p.text, this.sx(p.x), this.sy(p.y), p.color);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawOffscreen(world);
  }

  private drawSky(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, this.purple ? PALETTE.purpleTop : PALETTE.skyTop);
    g.addColorStop(0.75, this.purple ? PALETTE.purpleHorizon : PALETTE.skyHorizon);
    g.addColorStop(1, this.purple ? '#f0dcff' : '#ffe9c9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // Sun glow, barely moving with the camera.
    const sunX = this.w * 0.72 - this.cam.x * 0.03;
    const sunY = this.h * 0.62 + this.cam.y * 0.02;
    const r = this.h * 0.5;
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
    sg.addColorStop(0, 'rgba(255,248,226,0.95)');
    sg.addColorStop(0.08, 'rgba(255,236,190,0.75)');
    sg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, this.w, this.h);
    // Drifting clouds.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 397 + this.time * (0.15 + i * 0.03) - this.cam.x * 0.08) % (this.w + 400) + this.w + 400) % (this.w + 400) - 200;
      const cy = this.h * (0.12 + (i % 3) * 0.09) + this.cam.y * 0.05;
      const s = this.h * (0.05 + (i % 2) * 0.02);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 3, s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 1.5, cy - s * 0.5, s * 1.8, s * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
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
    // Hills.
    const hills = layer(0.05, 0.5, 0.78);
    ctx.fillStyle = this.purple ? '#8a63c9' : '#9fb6c9';
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    for (let px = 0; px <= this.w + 20; px += 20) {
      const wx = (px - this.w / 2) / hills.s + this.cam.x * 0.08;
      const hy = 130 + Math.sin(wx * 0.004) * 90 + Math.sin(wx * 0.011 + 2) * 40;
      ctx.lineTo(px, hills.y(hy));
    }
    ctx.lineTo(this.w, this.h);
    ctx.fill();

    const city = (list: Building[], parallax: number, zoomK: number, horizon: number, color: string, windowColor: string) => {
      const L = layer(parallax, zoomK, horizon);
      ctx.fillStyle = color;
      for (const b of list) {
        const x = L.x(b.x);
        const w = b.w * L.s;
        if (x + w < 0 || x > this.w) continue;
        const top = L.y(b.h);
        ctx.fillRect(x, top, w, this.h - top + 2);
        if (b.windows) {
          ctx.fillStyle = windowColor;
          const step = 22 * L.s;
          for (let wy = top + step * 0.6; wy < this.h; wy += step) {
            for (let wx = x + step * 0.4; wx < x + w - step * 0.4; wx += step) {
              if (((wx * 13 + wy * 7) | 0) % 5 === 0) continue;
              ctx.fillRect(wx, wy, step * 0.45, step * 0.5);
            }
          }
          ctx.fillStyle = color;
        }
      }
    };
    city(this.far, 0.15, 0.55, 0.92, this.purple ? '#6c4aa8' : '#7f97ad', '');
    city(this.near, 0.3, 0.7, 1.02, this.purple ? '#3e2a66' : '#51667a', this.purple ? 'rgba(255,214,255,0.25)' : 'rgba(255,236,200,0.22)');
  }

  private drawStage(world: World): void {
    const ctx = this.ctx;
    const s = this.scale;
    const id = world.stage.id;
    const main = world.stage.platforms[0]!;
    // What holds the main platform up.
    if (id === 'rooftop') {
      // The building under the roof, all the way down.
      const x = this.sx(main.x1 + 20);
      const w = (main.x2 - main.x1 - 40) * s;
      const top = this.sy(main.y - main.depth);
      ctx.fillStyle = '#2b2f35';
      ctx.fillRect(x, top, w, this.h - top + 40);
      ctx.fillStyle = 'rgba(255,236,200,0.28)';
      const step = 34 * s;
      for (let wy = top + step * 0.5; wy < this.h + 40; wy += step) {
        for (let wx = x + step * 0.3; wx < x + w - step * 0.5; wx += step) ctx.fillRect(wx, wy, step * 0.5, step * 0.55);
      }
      // Rooftop clutter.
      this.box(-300, main.y, 70, 34, '#4b5058');
      this.box(-290, main.y + 34, 50, 10, '#5e646d');
      this.box(230, main.y, 50, 50, '#4b5058');
      ctx.strokeStyle = '#26282b';
      ctx.lineWidth = Math.max(1, 3 * s);
      ctx.beginPath();
      ctx.moveTo(this.sx(330), this.sy(main.y));
      ctx.lineTo(this.sx(330), this.sy(main.y + 150));
      ctx.stroke();
      ctx.fillStyle = (this.time >> 5) % 2 ? '#ff3b30' : '#661814';
      ctx.beginPath();
      ctx.arc(this.sx(330), this.sy(main.y + 152), Math.max(2, 5 * s), 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'helipad') {
      // A truss tower under the pad.
      ctx.strokeStyle = '#3a3e44';
      ctx.lineWidth = Math.max(1, 6 * s);
      const tx1 = this.sx(-90);
      const tx2 = this.sx(90);
      const top = this.sy(main.y - main.depth);
      ctx.beginPath();
      ctx.moveTo(tx1, top);
      ctx.lineTo(tx1, this.h + 40);
      ctx.moveTo(tx2, top);
      ctx.lineTo(tx2, this.h + 40);
      for (let y = 0; y < 12; y++) {
        const y1 = this.sy(main.y - main.depth - y * 90);
        const y2 = this.sy(main.y - main.depth - (y + 1) * 90);
        ctx.moveTo(tx1, y1);
        ctx.lineTo(tx2, y2);
        ctx.moveTo(tx2, y1);
        ctx.lineTo(tx1, y2);
      }
      ctx.stroke();
    } else {
      // Two crane towers holding the arms.
      for (const side of [-1, 1]) {
        const cx = side * 400;
        ctx.strokeStyle = '#e8a21a';
        ctx.lineWidth = Math.max(1, 5 * s);
        const x1 = this.sx(cx - 20);
        const x2 = this.sx(cx + 20);
        ctx.beginPath();
        ctx.moveTo(x1, this.sy(170));
        ctx.lineTo(x1, this.h + 40);
        ctx.moveTo(x2, this.sy(170));
        ctx.lineTo(x2, this.h + 40);
        for (let y = 170; y > -900; y -= 50) {
          ctx.moveTo(x1, this.sy(y));
          ctx.lineTo(x2, this.sy(y - 50));
        }
        ctx.stroke();
        // Counterweight above.
        this.box(cx - 30, 180, 60, 30, '#3a3e44');
      }
      const top = this.sy(main.y - main.depth);
      ctx.fillStyle = '#2b2f35';
      ctx.fillRect(this.sx(-200), top, 400 * s, this.h - top + 40);
    }

    for (const p of world.stage.platforms) this.drawPlatform(p, id);
  }

  private box(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(this.sx(x), this.sy(y + h), w * this.scale, h * this.scale);
  }

  private drawPlatform(p: Platform, stage: string): void {
    const ctx = this.ctx;
    const s = this.scale;
    const x = this.sx(p.x1);
    const w = (p.x2 - p.x1) * s;
    const top = this.sy(p.y);
    if (p.solid) {
      const d = p.depth * s;
      ctx.fillStyle = stage === 'helipad' ? '#33373d' : '#3b4047';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + w, top);
      ctx.lineTo(x + w - 18 * s, top + d);
      ctx.lineTo(x + 18 * s, top + d);
      ctx.closePath();
      ctx.fill();
      // Grid on the face (the v1 grid textures).
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = p.x1 + 40; gx < p.x2; gx += 40) {
        ctx.moveTo(this.sx(gx), top);
        ctx.lineTo(this.sx(gx), top + d);
      }
      for (let gy = 20; gy < p.depth; gy += 20) {
        ctx.moveTo(x + 10 * s, top + gy * s);
        ctx.lineTo(x + w - 10 * s, top + gy * s);
      }
      ctx.stroke();
      // Surface and hazard stripe.
      ctx.fillStyle = '#e9e6df';
      ctx.fillRect(x, top - 2, w, 6 * s + 2);
      const stripe = 16 * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, top + 6 * s, w, 8 * s);
      ctx.clip();
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x, top + 6 * s, w, 8 * s);
      ctx.fillStyle = PALETTE.orange;
      for (let sx = x - stripe; sx < x + w + stripe; sx += stripe * 2) {
        ctx.beginPath();
        ctx.moveTo(sx, top + 14 * s);
        ctx.lineTo(sx + stripe, top + 6 * s);
        ctx.lineTo(sx + stripe * 2, top + 6 * s);
        ctx.lineTo(sx + stripe, top + 14 * s);
        ctx.fill();
      }
      ctx.restore();
      if (stage === 'helipad') {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, 3 * s);
        ctx.beginPath();
        ctx.ellipse(this.sx(0), top + 1, 110 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = -4; i <= 4; i++) {
          ctx.fillStyle = (this.time >> 4) % 9 === i + 4 ? '#ffe27a' : '#a8ff7a';
          ctx.fillRect(this.sx(i * 95) - 2 * s, top - 4 * s, 4 * s, 3 * s);
        }
      }
    } else {
      // Steel girder in orange, with rivets.
      const h = 10 * s;
      ctx.fillStyle = stage === 'cranes' ? '#e8a21a' : PALETTE.orange;
      ctx.fillRect(x, top, w, 3 * s);
      ctx.fillRect(x, top + h - 3 * s, w, 3 * s);
      ctx.fillRect(x, top, w, h * 0.3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, top + 3 * s, w, h - 6 * s);
      ctx.fillStyle = PALETTE.ink;
      for (let rx = p.x1 + 10; rx < p.x2; rx += 20) ctx.fillRect(this.sx(rx) - s, top + h * 0.5 - s, 2 * s, 2 * s);
      // Cables to the sky.
      ctx.strokeStyle = 'rgba(30,30,30,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6 * s, top);
      ctx.lineTo(x + w / 2, 0);
      ctx.lineTo(x + w - 6 * s, top);
      ctx.stroke();
    }
  }

  private drawProjectile(p: Projectile, color: string, slotColor: string): void {
    const ctx = this.ctx;
    const s = this.scale;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    const r = p.r;
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

  private drawFighter(f: Fighter, x: number, y: number): void {
    const ctx = this.ctx;
    const def = fighterDef(f);
    const color = SLOT_COLORS[f.slot] ?? '#fff';
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
    drawFighterFigure(ctx, f.id, {
      color,
      rage: rageFraction(f),
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
    // Full rage: a flickering red aura.
    if (rageFraction(f) >= 1) {
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

    // Player tag above the fighter.
    this.label(`P${f.slot + 1}`, cx, cy - (def.height / 2 + 26) * s - 8, color, true);
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

  private label(text: string, x: number, y: number, color: string, arrow = false): void {
    const ctx = this.ctx;
    ctx.font = `800 ${Math.round(Math.max(12, this.h * 0.022))}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
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
      const color = SLOT_COLORS[f.slot] ?? '#fff';
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
