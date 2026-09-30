import type { InputSource } from '../input/inputManager';
import type { Drone } from '../sim/drone';

export interface HudInfo {
  drone: Drone;
  throttle: number;
  source: InputSource;
  uncalibratedId: string | null;
  fps: number;
  backend: string;
  showDebug: boolean;
  autoResetIn: number | null;
}

/** On-screen display, styled after a Betaflight OSD. Updates text only when it changes. */
export class Hud {
  private readonly el: Record<'thr' | 'spd' | 'alt' | 'status' | 'debug', HTMLElement>;
  private readonly cache = new Map<HTMLElement, string>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="osd-debug" data-debug></div>
      <div class="osd-cross"></div>
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
    this.el = { thr: q('[data-thr]'), spd: q('[data-spd]'), alt: q('[data-alt]'), status: q('[data-status]'), debug: q('[data-debug]') };
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
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }
}
