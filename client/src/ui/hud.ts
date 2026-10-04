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
  /** The pilot's color. */
  color: string;
  /** Name tag (ADR-0043), shown while on screen: name (and level), and health 0..1 when known. */
  name: string;
  hp: number | null;
}

export interface CombatHudInfo {
  phase: 'waiting' | 'playing' | 'ended';
  /** Free-for-all (ADR-0026): your kills, your place (1 = leading), how many pilots, and the leader if it isn't you. */
  myScore: number;
  rank: number;
  pilots: number;
  leader: { name: string; score: number; color: string } | null;
  /** Who won, once the match has ended. */
  winnerName: string | null;
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
  /** Edge arrows for pilots who are off screen or behind you (ADR-0026: one per pilot). */
  markers: readonly MarkerInfo[];
  /** Lead indicator: where to aim so your rounds meet them (ADR-0011). Screen px. */
  lead: { x: number; y: number } | null;
  combat: CombatHudInfo | null;
  /** This class's special: maneuver mode, smoke, or weapon/rockets (ADR-0015/0016). */
  special: { label: string; value: string } | null;
  /** Training stats line (ADR-0017), shown where the match score would be. */
  training: string | null;
  /** Riding a missile (ADR-0025): its own HUD replaces the drone OSD. */
  missile: { speed: number; throttle: number; fuel: number; timeLeft: number; range: number | null } | null;
}

type El =
  | 'thr'
  | 'spd'
  | 'alt'
  | 'status'
  | 'debug'
  | 'net'
  | 'marker'
  | 'score'
  | 'hp'
  | 'hpFill'
  | 'hpText'
  | 'hitmark'
  | 'damage'
  | 'banner'
  | 'lead'
  | 'special'
  | 'specialLabel'
  | 'xp'
  | 'msl'
  | 'mslSpd'
  | 'mslThrFill'
  | 'mslFuelFill'
  | 'mslTime'
  | 'mslRange';

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
      <div class="osd-xp" data-xp></div>
      <div class="osd-markers" data-marker></div>
      <div class="osd-status" data-status></div>
      <div class="osd-hp" data-hp><span class="osd-label">HP</span><div class="osd-hp-bar"><div class="osd-hp-fill" data-hp-fill></div></div><span data-hp-text></span></div>
      <div class="msl" data-msl hidden>
        <div class="msl-corners"></div>
        <div class="msl-reticle"><span></span></div>
        <div class="msl-top">TV GUIDED · <b data-msl-time></b></div>
        <div class="msl-left"><span class="osd-label">THR</span><div class="msl-bar"><div data-msl-thr></div></div></div>
        <div class="msl-right"><span class="osd-label">FUEL</span><div class="msl-bar"><div data-msl-fuel></div></div></div>
        <div class="msl-bottom"><span data-msl-spd></span><span data-msl-range></span><span class="msl-hint">FIRE / SPECIAL: DETONATE</span></div>
      </div>
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
      score: q('[data-score]'),
      hp: q('[data-hp]'),
      hpFill: q('[data-hp-fill]'),
      hpText: q('[data-hp-text]'),
      hitmark: q('[data-hitmark]'),
      damage: q('[data-damage]'),
      banner: q('[data-banner]'),
      lead: q('[data-lead]'),
      special: q('[data-special]'),
      xp: q('[data-xp]'),
      specialLabel: q('[data-special-label]'),
      msl: q('[data-msl]'),
      mslSpd: q('[data-msl-spd]'),
      mslThrFill: q('[data-msl-thr]'),
      mslFuelFill: q('[data-msl-fuel]'),
      mslTime: q('[data-msl-time]'),
      mslRange: q('[data-msl-range]'),
    };
  }

  /** You hit the other pilot: flash the hit marker. */
  flashHit(): void {
    restartAnimation(this.el.hitmark, 'show');
  }

  private xpShown = { gained: 0, labels: [] as string[], at: 0 };

  /** XP earned (ADR-0032): "+100 XP · kill". Awards close together add up into one pop-up. */
  showXp(gained: number, label: string): void {
    const now = performance.now();
    const x = this.xpShown;
    if (now - x.at > 1500) {
      x.gained = 0;
      x.labels = [];
    }
    x.gained += gained;
    if (!x.labels.includes(label)) x.labels.push(label);
    x.at = now;
    this.el.xp.textContent = `+${x.gained} XP · ${x.labels.join(' + ')}`;
    restartAnimation(this.el.xp, 'show');
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
    this.updateMarkers(info.markers);
    const lead = this.el.lead;
    lead.hidden = !info.lead;
    if (info.lead) lead.style.transform = `translate(${info.lead.x.toFixed(1)}px, ${info.lead.y.toFixed(1)}px)`;
    this.updateCombat(combat);
    this.updateMissile(info.missile);
  }

  private updateMissile(m: HudInfo['missile']): void {
    const el = this.el;
    el.msl.hidden = !m;
    // The drone's crosshair and bottom row make no sense from the missile's nose.
    el.msl.parentElement?.classList.toggle('riding-missile', !!m);
    if (!m) return;
    this.set(el.mslSpd, `${Math.round(m.speed * 3.6)} KM/H`);
    this.set(el.mslTime, `${m.timeLeft.toFixed(1)} S`);
    this.set(el.mslRange, m.range === null ? 'NO TARGET' : `TGT ${Math.round(m.range)} M`);
    el.mslRange.classList.toggle('lock', m.range !== null && m.range < 40);
    el.mslThrFill.style.transform = `scaleY(${m.throttle.toFixed(3)})`;
    el.mslFuelFill.style.transform = `scaleY(${Math.max(0, m.fuel).toFixed(3)})`;
    el.msl.classList.toggle('low-fuel', m.fuel < 0.2);
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

    const place = c.rank === 1 ? 'leading' : `${ordinal(c.rank)} of ${c.pilots}`;
    const leader = c.leader ? ` · leader ${c.leader.name} ${c.leader.score}` : '';
    this.set(this.el.score, `You ${c.myScore} · ${place}${leader} · first to ${c.killsToWin}`);

    let banner = c.toast ?? '';
    if (c.phase === 'ended') banner = c.won ? 'VICTORY' : `${(c.winnerName ?? 'Someone').toUpperCase()} WINS`;
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

  private readonly markerEls: { root: HTMLElement; label: HTMLElement; name: HTMLElement; hp: HTMLElement; hpFill: HTMLElement }[] = [];

  /**
   * Pilot markers: an edge arrow with the distance when they're off screen (ADR-0026), and a War Thunder-style
   * name tag above them when they're on screen (ADR-0043): name, distance and a health bar in their color.
   */
  private updateMarkers(markers: readonly MarkerInfo[]): void {
    while (this.markerEls.length < markers.length) {
      const root = document.createElement('div');
      root.className = 'osd-marker';
      root.innerHTML =
        '<span class="osd-tag-name"></span><span class="osd-marker-diamond"></span><span class="osd-marker-label"></span><span class="osd-tag-hp"><span></span></span>';
      this.el.marker.appendChild(root);
      const hp = root.querySelector('.osd-tag-hp') as HTMLElement;
      this.markerEls.push({
        root,
        label: root.querySelector('.osd-marker-label') as HTMLElement,
        name: root.querySelector('.osd-tag-name') as HTMLElement,
        hp,
        hpFill: hp.firstElementChild as HTMLElement,
      });
    }
    this.markerEls.forEach((el, i) => {
      const marker = markers[i];
      el.root.hidden = !marker;
      if (!marker) return;
      el.root.style.transform = `translate(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px)`;
      el.root.style.setProperty('--pilot', marker.color);
      el.root.classList.toggle('edge', !marker.onScreen);
      el.root.classList.toggle('named', marker.onScreen);
      this.set(el.label, `${Math.round(marker.distance)} m`);
      this.set(el.name, marker.name);
      el.hp.hidden = !marker.onScreen || marker.hp === null;
      if (marker.hp !== null) el.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, marker.hp)).toFixed(3)})`;
    });
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
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
