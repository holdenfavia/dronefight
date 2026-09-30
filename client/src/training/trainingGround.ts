import * as THREE from 'three/webgpu';
import { droneClass } from '../../../shared/drones';
import { splashDamage } from '../../../shared/missile';
import { segmentPointDistance } from '../../../shared/raycast';
import { DRONE_VISUAL } from '../config';
import { createClassModel, setDronePropColor } from '../render/droneModel';
import { Trails } from '../render/trails';
import { BOT_COLORS, createTrainingBots, resetBot, stepBot, type Bot } from './bots';

/**
 * Solo practice on the Training map (ADR-0017): draws the bots, checks your rounds and missile
 * splash against them locally, and keeps hit/kill/accuracy stats. Never used in matches: rooms stay
 * server-authoritative (ADR-0004).
 */

const BOT_HP = droneClass('freestyle').maxHp;
const BOT_RADIUS = droneClass('freestyle').hitRadius;
const RESPAWN_S = 3;
/** Crosshair within this angle of a bot counts as "aimed at" (evasive bots react). */
const AIMED_DEG = 5;

interface LiveBot {
  bot: Bot;
  hp: number;
  deadFor: number | null;
  model: THREE.Group;
  glow: THREE.Sprite;
  view: { id: string; position: THREE.Vector3; team: number | null; crashed: boolean };
}

interface Round {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  damage: number;
  maxDist: number;
  traveled: number;
}

export interface TrainingCallbacks {
  onHit(): void;
  onKill(at: THREE.Vector3): void;
}

export class TrainingGround {
  active = false;
  hits = 0;
  kills = 0;
  rounds = 0;
  /** Exposed read-only for the dev console and tests. */
  bots: LiveBot[] = [];
  /** Trail views, built once per spawn so the frame loop doesn't allocate (Hard rule 2). */
  private views: LiveBot['view'][] = [];
  private shots: Round[] = [];
  private readonly trails: Trails;
  private readonly positions: THREE.Vector3[] = [];
  private readonly camDir = new THREE.Vector3();
  private readonly toBot = new THREE.Vector3();
  private readonly glowMap: THREE.Texture;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly callbacks: TrainingCallbacks,
  ) {
    this.trails = new Trails(scene);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    this.glowMap = new THREE.CanvasTexture(c);
  }

  /** Turn practice on (solo on the Training map) or off. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.spawnAll();
    else this.clearAll();
  }

  resetStats(): void {
    this.hits = 0;
    this.kills = 0;
    this.rounds = 0;
  }

  /** Living bot positions, for the missile proximity fuse. */
  targets(): readonly THREE.Vector3[] {
    this.positions.length = 0;
    for (const b of this.bots) if (b.deadFor === null) this.positions.push(b.bot.pos);
    return this.positions;
  }

  /** One of our rounds or pellets, to check against bots as it flies. */
  addRound(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, maxDist: number): void {
    if (!this.active) return;
    this.rounds++;
    this.shots.push({ origin: origin.clone(), dir: dir.clone(), speed, damage, maxDist, traveled: 0 });
  }

  /** Our missile exploded here: same splash rule as the server. */
  splash(at: THREE.Vector3): void {
    if (!this.active) return;
    for (const b of this.bots) {
      if (b.deadFor !== null) continue;
      const damage = splashDamage(b.bot.pos.distanceTo(at));
      if (damage > 0) this.damage(b, damage);
    }
  }

  /** The bot nearest the crosshair (for the lead indicator), or null. */
  bestTarget(camera: THREE.Camera): { position: THREE.Vector3; velocity: THREE.Vector3 } | null {
    camera.getWorldDirection(this.camDir);
    let best: LiveBot | null = null;
    let bestDot = Math.cos((25 * Math.PI) / 180);
    for (const b of this.bots) {
      if (b.deadFor !== null) continue;
      this.toBot.subVectors(b.bot.pos, camera.position);
      const dist = this.toBot.length();
      if (dist > 300) continue;
      const dot = this.toBot.divideScalar(dist).dot(this.camDir);
      if (dot > bestDot) {
        bestDot = dot;
        best = b;
      }
    }
    return best ? { position: best.bot.pos, velocity: best.bot.vel } : null;
  }

  statsText(): string {
    const acc = this.rounds > 0 ? Math.round((this.hits / this.rounds) * 100) : 0;
    return `Training · hits ${this.hits} · kills ${this.kills} · accuracy ${acc}% · R resets stats`;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (!this.active) return;
    camera.getWorldDirection(this.camDir);
    const aimCos = Math.cos((AIMED_DEG * Math.PI) / 180);

    for (const b of this.bots) {
      if (b.deadFor !== null) {
        b.deadFor += dt;
        if (b.deadFor >= RESPAWN_S) {
          b.deadFor = null;
          b.hp = BOT_HP;
          resetBot(b.bot);
          b.model.visible = true;
        }
        b.glow.visible = false;
        b.view.crashed = true;
        continue;
      }
      this.toBot.subVectors(b.bot.pos, camera.position).normalize();
      stepBot(b.bot, dt, this.toBot.dot(this.camDir) > aimCos);
      b.model.position.copy(b.bot.pos);
      orient(b.model, b.bot.vel);
      b.glow.position.copy(b.bot.pos);
      b.glow.visible = true;
      b.view.crashed = false;
    }

    // Rounds in flight vs bots, in small steps like the server.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      const next = Math.min(s.traveled + s.speed * dt, s.maxDist);
      const ax = s.origin.x + s.dir.x * s.traveled;
      const ay = s.origin.y + s.dir.y * s.traveled;
      const az = s.origin.z + s.dir.z * s.traveled;
      const bx = s.origin.x + s.dir.x * next;
      const by = s.origin.y + s.dir.y * next;
      const bz = s.origin.z + s.dir.z * next;
      let done = next >= s.maxDist;
      for (const b of this.bots) {
        if (b.deadFor !== null) continue;
        const p = b.bot.pos;
        if (segmentPointDistance(ax, ay, az, bx, by, bz, p.x, p.y, p.z) <= BOT_RADIUS) {
          this.hits++;
          this.damage(b, s.damage);
          done = true;
          break;
        }
      }
      s.traveled = next;
      if (done) this.shots.splice(i, 1);
    }

    this.trails.update(
      this.views,
      camera,
      (team) => Object.values(BOT_COLORS)[team ?? 0] ?? '#ffffff',
    );
  }

  private damage(b: LiveBot, amount: number): void {
    this.callbacks.onHit();
    b.hp -= amount;
    if (b.hp <= 0) {
      this.kills++;
      b.deadFor = 0;
      b.model.visible = false;
      b.glow.visible = false;
      this.callbacks.onKill(b.bot.pos.clone());
    }
  }

  private spawnAll(): void {
    const kinds = Object.keys(BOT_COLORS);
    this.bots = createTrainingBots().map((bot) => {
      const color = BOT_COLORS[bot.kind];
      const model = createClassModel('freestyle', color);
      setDronePropColor(model, color);
      this.scene.add(model);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowMap, color, transparent: true, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }),
      );
      glow.scale.setScalar(DRONE_VISUAL.glowScreenSize * 2);
      this.scene.add(glow);
      return {
        bot,
        hp: BOT_HP,
        deadFor: null,
        model,
        glow,
        view: { id: `bot${bot.id}`, position: bot.pos, team: kinds.indexOf(bot.kind), crashed: false },
      };
    });
    this.views = this.bots.map((b) => b.view);
    this.resetStats();
  }

  private clearAll(): void {
    for (const b of this.bots) {
      this.scene.remove(b.model, b.glow);
    }
    this.bots = [];
    this.views = [];
    this.shots = [];
    this.trails.update([], new THREE.PerspectiveCamera(), () => '#fff');
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();

/** Point a bot along its velocity and tip it forward with speed, like a quad flying that way. */
function orient(model: THREE.Group, vel: THREE.Vector3): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.5) return;
  qYaw.setFromAxisAngle(Y_AXIS, Math.atan2(-vel.x, -vel.z));
  qPitch.setFromAxisAngle(X_AXIS, -Math.min(0.6, speed / 40));
  model.quaternion.copy(qYaw).multiply(qPitch);
}
