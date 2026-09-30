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
  marker: MarkerInfo | null;
}

type El = 'thr' | 'spd' | 'alt' | 'status' | 'debug' | 'net' | 'marker' | 'markerLabel';

/** On-screen display, styled after a Betaflight OSD. Updates text only when it changes. */
export class Hud {
  private readonly el: Record<El, HTMLElement>;
  private readonly cache = new Map<HTMLElement, string>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="osd-debug" data-debug></div>
      <div class="osd-net" data-net></div>
      <div class="osd-cross"></div>
      <div class="osd-marker" data-marker><span class="osd-marker-diamond"></span><span class="osd-marker-label" data-marker-label></span></div>
      <div class="osd-status" data-status></div>
      <div class="osd-bottom">
        <div class="osd-item"><span class="osd-label">THR</span><span data-thr></span></div>
        <div class="osd-item"><span class="osd-label">SPD</span><span data-spd></span></div>
        <div class="osd-item"><span class="osd-label">ALT</span><span data-alt></span></div>
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
    };
  }

  update(info: HudInfo): void {
    const { drone } = info;
    this.set(this.el.thr, `${Math.round(info.throttle * 100)}%`);
    this.set(this.el.spd, `${Math.round(drone.speed * 3.6)} km/h`);
    this.set(this.el.alt, `${Math.max(0, drone.currPos.y).toFixed(0)} m`);

    let status = '';
    if (drone.crashed) {
      status = info.autoResetIn !== null ? `CRASHED · respawn in ${Math.ceil(info.autoResetIn)}` : 'CRASHED';
    } else if (drone.armBlocked) {
      status = 'LOWER THROTTLE TO ARM';
    } else if (!drone.armed) {
      status = 'DISARMED · throttle down to arm';
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
