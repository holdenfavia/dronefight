// What the HUD points at: name tags and edge arrows for other pilots (ADR-0026, ADR-0043), the lead indicator
// (ADR-0011) and the missile's target list. Reads the camera, the remote views and the match; draws nothing.

import * as THREE from 'three/webgpu';
import { interceptTime } from '../../../shared/lead';
import { COMBAT, pilotColor, pilotName } from '../../../shared/combat';
import { pilotLabel } from '../../../shared/roomOptions';
import { droneClass } from '../../../shared/drones';
import type { NetClient } from '../net/netClient';
import type { RemoteDrones } from '../render/remoteDrones';
import type { MarkerInfo } from './hud';

export interface TargetingDeps {
  camera: () => THREE.Camera;
  container: HTMLElement;
  remotes: RemoteDrones;
  net: NetClient;
  /** Where our shots come from. */
  origin: () => THREE.Vector3;
  /** Speed of the selected weapon's rounds (m/s), or null when it has no lead (missiles, grenades). */
  projectileSpeed: () => number | null;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export class Targeting {
  private readonly projected = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly leadPoint = new THREE.Vector3();
  private readonly toTargetLead = new THREE.Vector3();
  private readonly toPilot = new THREE.Vector3();
  private readonly lead: ScreenPoint = { x: 0, y: 0 };
  private readonly markerPool: MarkerInfo[] = [];
  private readonly markers: MarkerInfo[] = [];
  private readonly missileTargets: THREE.Vector3[] = [];

  constructor(private readonly deps: TargetingDeps) {}

  /** What the missile HUD measures range to: the other pilots and bots (not while they smoke). */
  missileTargetList(): readonly THREE.Vector3[] {
    this.missileTargets.length = 0;
    for (const v of this.deps.remotes.views) if (!v.crashed && !v.concealed) this.missileTargets.push(v.position);
    return this.missileTargets;
  }

  /** Teams mode (ADR-0047): this pilot is on your team. */
  isTeammate(id: string): boolean {
    const m = this.deps.net.match;
    if (!m || m.options.mode !== 'teams') return false;
    const mine = this.deps.net.me?.side;
    return mine !== undefined && m.players.find((p) => p.id === id)?.side === mine;
  }

  /**
   * Every other pilot gets a marker: a name tag while on screen, an edge arrow when not. Smoking pilots get neither
   * (ADR-0024); crashed and dead ones have no tag. Bots get tags too.
   */
  pilotMarkers(): readonly MarkerInfo[] {
    const { net } = this.deps;
    this.markers.length = 0;
    for (const v of this.deps.remotes.views) {
      if (v.concealed || v.crashed) continue;
      const player = net.match?.players.find((p) => p.id === v.id);
      if (player && !player.alive) continue;
      const m = this.nextMarker();
      this.markerFor(v.position, m);
      m.color = pilotColor(v.team ?? 1);
      // Callsign or color (ADR-0047); teammates are marked as friendly.
      const label = player ? pilotLabel(player) : pilotName(v.team);
      const friendly = this.isTeammate(v.id);
      m.name = `${friendly ? '▲ ' : ''}${label}${player?.level ? ` · ${player.level}` : ''}`;
      m.hp = player ? player.hp / droneClass(player.drone).maxHp : null;
      this.markers.push(m);
    }
    return this.markers;
  }

  /** Lead indicator on the pilot nearest your crosshair (ADR-0026), skipping smoking, holding or crashed ones. */
  pilotLead(): ScreenPoint | null {
    const cam = this.deps.camera();
    cam.getWorldDirection(this.camForward);
    let best: (typeof this.deps.remotes.views)[number] | null = null;
    let bestDot = -Infinity;
    for (const v of this.deps.remotes.views) {
      // Never lead a teammate (ADR-0047): the circle and auto-fire are for enemies.
      if (v.concealed || v.mode === 'hold' || v.crashed || this.isTeammate(v.id)) continue;
      const dot = this.toPilot.subVectors(v.position, cam.position).normalize().dot(this.camForward);
      if (dot > bestDot) {
        bestDot = dot;
        best = v;
      }
    }
    return best ? this.leadFor(best.position, best.velocity) : null;
  }

  private nextMarker(): MarkerInfo {
    const i = this.markers.length;
    return this.markerPool[i] ?? (this.markerPool[i] = { x: 0, y: 0, onScreen: true, distance: 0, color: '', name: '', hp: null });
  }

  /** Screen marker for a pilot, pinned to the screen edge when off-screen or behind (written into `marker`). */
  private markerFor(target: THREE.Vector3, marker: MarkerInfo): MarkerInfo {
    const cam = this.deps.camera();
    const { clientWidth: w, clientHeight: h } = this.deps.container;
    this.toTarget.copy(target).sub(cam.position);
    marker.distance = this.toTarget.length();
    cam.getWorldDirection(this.camForward);
    const behind = this.toTarget.dot(this.camForward) < 0;
    this.projected.copy(target).project(cam);
    let nx = this.projected.x;
    let ny = this.projected.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const inside = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    if (!inside) {
      // Push to the edge along the direction from screen center.
      const scale = 0.92 / Math.max(Math.abs(nx), Math.abs(ny), 1e-6);
      nx *= scale;
      ny *= scale;
    }
    marker.x = ((nx + 1) / 2) * w;
    marker.y = ((1 - ny) / 2) * h;
    marker.onScreen = inside;
    return marker;
  }

  /** Lead indicator (ADR-0011): where the target will be when a round fired now reaches it. */
  private leadFor(target: THREE.Vector3, velocity: THREE.Vector3): ScreenPoint | null {
    const d = this.toTargetLead.subVectors(target, this.deps.origin());
    const speed = this.deps.projectileSpeed();
    if (speed === null) return null;
    const t = interceptTime(d.x, d.y, d.z, velocity.x, velocity.y, velocity.z, speed);
    if (t === null || t * speed > COMBAT.range) return null;
    this.leadPoint.copy(target).addScaledVector(velocity, t);
    const cam = this.deps.camera();
    cam.getWorldDirection(this.camForward);
    if (this.toTarget.subVectors(this.leadPoint, cam.position).dot(this.camForward) <= 0) return null;
    this.projected.copy(this.leadPoint).project(cam);
    if (Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1) return null;
    this.lead.x = ((this.projected.x + 1) / 2) * this.deps.container.clientWidth;
    this.lead.y = ((1 - this.projected.y) / 2) * this.deps.container.clientHeight;
    return this.lead;
  }
}
