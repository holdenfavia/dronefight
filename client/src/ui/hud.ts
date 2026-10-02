import { NET } from '../../../shared/protocol';
import type { InputSource } from '../input/inputManager';
import type { NetStatus } from '../net/netClient';
import type { Drone } from '../sim/drone';

/** A snapshot this old means the other pilot's connection has stalled. */
const SIGNAL_LOST_MS = 600;

export interface NetHudInfo {
  status: NetStatus;
  room: string | null;
  pingMs: number;
  /** Null when nobody else is in the room. */
  peer: { delayMs: number; staleMs: number } | null;
}

export interface MarkerInfo {
  /** Screen position in CSS pixels. */
  x: number;
  y: number;
  /** False when the pilot is behind you or off-screen and the marker is pinned to the edge. */
  onScreen: boolean;
  distance: number;
}

export interface CombatHudInfo {
  phase: 'waiting' | 'playing' | 'ended';
  myTeam: number;
  /** Score per team index. */
  scores: [number, number];
  killsToWin: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  protected: boolean;
  /** Seconds until respawn while dead. */
  respawnIn: number | null;
  /** Set when the match has ended. */
  won: boolean | null;
  /** Short-lived message ("KILL +1", "SHOT DOWN"), or null. */
  toast: string | null;
}

export interface HudInfo {
  drone: Drone;
  throttle: number;
  source: InputSource;
  uncalibratedId: string | null;
  fps: number;
  backend: string;
  showDebug: boolean;
  autoResetIn: number | null;
  net: NetHudInfo | null;
  /** Edge arrow for a pilot who is off screen or behind you. */
  marker: MarkerInfo | null;
  /** Lead indicator: where to aim so your rounds meet them (ADR-0011). Screen px. */
  lead: { x: number; y: number } | null;
  combat: CombatHudInfo | null;
  /** This class's special: maneuver mode, smoke, or weapon/rockets (ADR-0015/0016). */
  special: { label: string; value: string } | null;
  /** Training stats line (ADR-0017), shown where the match score would be. */
  training: string | null;
}

type El =
  | 'thr'
  | 'spd'
  | 'alt'
  | 'status'
  | 'debug'
  | 'net'
  | 'marker'
  | 'markerLabel'
  | 'score'
  | 'hp'
  | 'hpFill'
  | 'hpText'
  | 'hitmark'
  | 'damage'
  | 'banner'
  | 'lead'
  | 'special'
  | 'specialLabel';

/** On-screen display, styled after a Betaflight OSD. Updates text only when it changes. */
export class Hud {
  private readonly el: Record<El, HTMLElement>;
  private readonly cache = new Map<HTMLElement, string>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="osd-damage" data-damage></div>
      <div class="osd-debug" data-debug></div>
      <div class="osd-net" data-net></div>
      <div class="osd-score" data-score></div>
      <div class="osd-cross"></div>
      <div class="osd-hitmark" data-hitmark></div>
      <div class="osd-lead" data-lead></div>
      <div class="osd-banner" data-banner></div>
      <div class="osd-marker" data-marker><span class="osd-marker-diamond"></span><span class="osd-marker-label" data-marker-label></span></div>
      <div class="osd-status" data-status></div>
      <div class="osd-hp" data-hp><span class="osd-label">HP</span><div class="osd-hp-bar"><div class="osd-hp-fill" data-hp-fill></div></div><span data-hp-text></span></div>
      <div class="osd-bottom">
        <div class="osd-item"><span class="osd-label">THR</span><span data-thr></span></div>
        <div class="osd-item"><span class="osd-label">SPD</span><span data-spd></span></div>
        <div class="osd-item"><span class="osd-label">ALT</span><span data-alt></span></div>
        <div class="osd-item" data-special-item><span class="osd-label" data-special-label></span><span data-special></span></div>
      </div>`;
    const q = (sel: string) => {
      const found = root.querySelector<HTMLElement>(sel);
      if (!found) throw new Error(`HUD element ${sel} missing`);
      return found;
    };
    this.el = {
      thr: q('[data-thr]'),
      spd: q('[data-spd]'),
      alt: q('[data-alt]'),
      status: q('[data-status]'),
      debug: q('[data-debug]'),
      net: q('[data-net]'),
      marker: q('[data-marker]'),
      markerLabel: q('[data-marker-label]'),
      score: q('[data-score]'),
      hp: q('[data-hp]'),
      hpFill: q('[data-hp-fill]'),
      hpText: q('[data-hp-text]'),
      hitmark: q('[data-hitmark]'),
      damage: q('[data-damage]'),
      banner: q('[data-banner]'),
      lead: q('[data-lead]'),
      special: q('[data-special]'),
      specialLabel: q('[data-special-label]'),
    };
  }

  /** You hit the other pilot: flash the hit marker. */
  flashHit(): void {
    restartAnimation(this.el.hitmark, 'show');
  }

  /** You took damage: pulse the screen edges. */
  flashDamage(): void {
    restartAnimation(this.el.damage, 'show');
  }

  private trainingText: string | null = null;

  update(info: HudInfo): void {
    const { drone } = info;
    this.trainingText = info.training;
    this.set(this.el.thr, `${Math.round(info.throttle * 100)}%`);
    this.set(this.el.spd, `${Math.round(drone.speed * 3.6)} km/h`);
    this.set(this.el.alt, `${Math.max(0, drone.currPos.y).toFixed(0)} m`);
    // Class special readout (ADR-0015/0016).
    (this.el.special.parentElement as HTMLElement).hidden = !info.special;
    if (info.special) {
      this.set(this.el.specialLabel, info.special.label);
      this.set(this.el.special, info.special.value);
    }

    let status = '';
    const combat = info.combat;
    if (combat && combat.phase !== 'waiting') {
      if (combat.phase === 'ended') status = '';
      else if (!combat.alive) status = combat.respawnIn !== null ? `respawn in ${Math.ceil(combat.respawnIn)}` : '';
      else if (combat.protected) status = 'spawn protected';
      else if (drone.armBlocked) status = armHint(drone, true);
      else if (!drone.armed && !drone.crashed) status = armHint(drone, false);
    } else if (drone.crashed) {
      status = info.autoResetIn !== null ? `CRASHED · respawn in ${Math.ceil(info.autoResetIn)}` : 'CRASHED';
    } else if (drone.armBlocked) {
      status = armHint(drone, true);
    } else if (!drone.armed) {
      status = armHint(drone, false);
    }
    this.set(this.el.status, status);

    let debug = '';
    if (info.showDebug) {
      const src = info.source === 'keyboard' && info.uncalibratedId ? 'keyboard (controller needs setup)' : info.source;
      debug = `${Math.round(info.fps)} FPS · ${info.backend} · input: ${src}`;
    }
    this.set(this.el.debug, debug);

    this.updateNet(info.net);
    this.updateMarker(info.marker);
    const lead = this.el.lead;
    lead.hidden = !info.lead;
    if (info.lead) lead.style.transform = `translate(${info.lead.x.toFixed(1)}px, ${info.lead.y.toFixed(1)}px)`;
    this.updateCombat(combat);
  }

  private updateCombat(c: CombatHudInfo | null): void {
    const active = !!c && c.phase !== 'waiting';
    this.el.hp.hidden = !active;
    this.el.score.hidden = !active && !this.trainingText;
    if (!active && this.trainingText) this.set(this.el.score, this.trainingText);
    if (!c || !active) {
      this.set(this.el.banner, c?.toast ?? '');
      return;
    }
    const pct = Math.max(0, c.hp / c.maxHp);
    this.el.hpFill.style.transform = `scaleX(${pct.toFixed(3)})`;
    this.el.hp.classList.toggle('low', pct <= 0.3);
    this.set(this.el.hpText, String(Math.round(c.hp)));

    const [orange, lime] = c.scores;
    const you = (team: number) => (team === c.myTeam ? ' (you)' : '');
    this.set(this.el.score, `Orange${you(0)} ${orange} : ${lime} Lime${you(1)} · first to ${c.killsToWin}`);

    let banner = c.toast ?? '';
    if (c.phase === 'ended') banner = c.won ? 'VICTORY' : 'DEFEAT';
    this.set(this.el.banner, banner);
    this.el.banner.classList.toggle('big', c.phase === 'ended');
  }

  private updateNet(net: NetHudInfo | null): void {
    let text = '';
    let warn = false;
    if (net) {
      if (net.status === 'reconnecting' || net.status === 'connecting') {
        text = 'Connecting…';
        warn = true;
      } else if (net.status === 'in-room' && net.room) {
        const ping = `ping ${Math.round(net.pingMs)} ms`;
        if (!net.peer) {
          text = `Room ${net.room} · waiting for pilot · ${ping}`;
        } else if (net.peer.staleMs > SIGNAL_LOST_MS) {
          text = `Room ${net.room} · pilot signal lost · ${ping}`;
          warn = true;
        } else {
          const delay = Math.round(net.peer.delayMs);
          text = `Room ${net.room} · ${ping} · delay ${delay} ms`;
          // Hard rule 1: over this is a bug, make it visible.
          warn = delay > NET.maxDisplayDelayMs;
        }
      }
    }
    this.set(this.el.net, text);
    this.el.net.classList.toggle('warn', warn);
  }

  private updateMarker(marker: MarkerInfo | null): void {
    const m = this.el.marker;
    if (!marker) {
      m.hidden = true;
      return;
    }
    m.hidden = false;
    m.style.transform = `translate(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px)`;
    m.classList.toggle('edge', !marker.onScreen);
    this.set(this.el.markerLabel, `${Math.round(marker.distance)} m`);
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }
}

function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  // Force a reflow so the animation restarts even if it is already running.
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 3D quads arm with the throttle centered (ADR-0013); everything else with it down. */
function armHint(drone: Drone, blocked: boolean): string {
  const center = drone.classId === 'quad3d';
  if (blocked) return center ? 'CENTER THROTTLE TO ARM' : 'LOWER THROTTLE TO ARM';
  return center ? 'DISARMED · throttle to center to arm' : 'DISARMED · throttle down to arm';
}
