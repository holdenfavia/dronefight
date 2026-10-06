import type { TouchSettings } from '../settings';

/**
 * Touch controls for iPad and iPhone (ADR-0044), layout B: floating sticks under your thumbs, corner triggers
 * for your index fingers, and any second finger on the aiming side fires. Only the input layer reads this
 * (InputManager, Hard rule 3); it turns fingers into stick values and buttons, and draws the controls.
 */

/** Touch tuning (ADR-0044). Sizes are fractions of the screen's short side unless noted. */
export const TOUCH = {
  /** Stick radius, and its limits in CSS px. */
  stickRadius: 0.14,
  minRadiusPx: 40,
  maxRadiusPx: 90,
  /** Fixed sticks sit this many radii in from the bottom corners. */
  fixedInset: 1.7,
  /** Corner triggers: width and height as fractions of the screen. */
  fireW: 0.2,
  fireH: 0.24,
  specialW: 0.16,
  specialH: 0.2,
  /** Double-tap on the throttle side switches weapons: each tap shorter than this (ms), closer together than this. */
  tapMs: 220,
  doubleTapMs: 350,
  tapSlopPx: 14,
  /** Pause button size (CSS px). */
  pausePx: 44,
} as const;

type Side = 'left' | 'right';

interface Stick {
  pointer: number | null;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  base: HTMLElement;
  nub: HTMLElement;
}

/** True on phones and tablets (touch screen, coarse pointer). */
export function isTouchDevice(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && matchMedia('(any-pointer: coarse)').matches;
}

export class TouchInput {
  readonly available = isTouchDevice();
  /** Latest values, read by InputManager. */
  throttle = 0;
  climb = 0;
  yaw = 0;
  roll = 0;
  pitch = 0;
  special = false;
  /** Left stick commands climb rate (altitude hold) instead of a throttle that stays put. Set by the input layer. */
  climbMode = false;
  /** Last time a finger touched the controls (performance.now()), 0 if never. */
  lastTouchAt = 0;
  /** Pause button. */
  onPause: () => void = () => {};

  private readonly root: HTMLElement;
  private readonly sticks: Record<Side, Stick>;
  private readonly fireEl: HTMLElement;
  private readonly specialEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  private readonly firePointers = new Set<number>();
  private specialPointer: number | null = null;
  private locked = false;
  private switchQueued = false;
  private visible = false;
  private tapStart = { id: -1, t: 0, x: 0, y: 0 };
  private lastTapAt = 0;

  constructor(
    root: HTMLElement,
    /** The live touch settings (read fresh each time: Settings can replace the object). */
    private readonly getSettings: () => TouchSettings,
  ) {
    this.root = root;
    root.innerHTML = `
      <div class="touch-trigger special" data-special>Special</div>
      <div class="touch-trigger fire" data-fire>Fire</div>
      <button class="touch-pause" data-pause aria-label="Pause">❚❚</button>
      <div class="touch-stick" data-stick="left"><div class="touch-nub"></div></div>
      <div class="touch-stick" data-stick="right"><div class="touch-nub"></div></div>`;
    const stick = (side: Side): Stick => {
      const base = root.querySelector(`[data-stick="${side}"]`) as HTMLElement;
      return { pointer: null, baseX: 0, baseY: 0, x: 0, y: 0, base, nub: base.firstElementChild as HTMLElement };
    };
    this.sticks = { left: stick('left'), right: stick('right') };
    this.fireEl = root.querySelector('[data-fire]') as HTMLElement;
    this.specialEl = root.querySelector('[data-special]') as HTMLElement;
    this.pauseEl = root.querySelector('[data-pause]') as HTMLElement;
    root.hidden = true;

    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
    // No page zoom or scroll while flying (iOS Safari pinch and double-tap).
    root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private get settings(): TouchSettings {
    return this.getSettings();
  }

  /** Fire: a corner trigger or second finger held, or trigger lock on. */
  get fire(): boolean {
    return this.locked || this.firePointers.size > 0;
  }

  /** True once after a double-tap on the throttle side. */
  consumeSwitch(): boolean {
    const s = this.switchQueued;
    this.switchQueued = false;
    return s;
  }

  /** Show the controls while flying; hiding lets go of everything. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) this.releaseAll();
  }

  /** Throttle back to its rest position (respawn; center for a 3D quad). */
  resetThrottle(rest: number): void {
    this.throttle = rest;
  }

  /** Lay out and draw the controls for this frame. */
  render(): void {
    if (!this.visible) return;
    const s = this.settings;
    const { w, h, r } = this.metrics();
    this.root.style.setProperty('--touch-opacity', String(s.opacity));
    const size = s.buttonSize;
    this.place(this.fireEl, w - w * TOUCH.fireW * size, 0, w * TOUCH.fireW * size, h * TOUCH.fireH * size);
    this.fireEl.hidden = !s.cornerTriggers;
    this.fireEl.classList.toggle('on', this.fire);
    this.fireEl.classList.toggle('locked', this.locked);
    this.place(this.specialEl, 0, 0, w * TOUCH.specialW * size, h * TOUCH.specialH * size);
    this.specialEl.classList.toggle('on', this.special);
    this.place(this.pauseEl, (w - TOUCH.pausePx) / 2, 6, TOUCH.pausePx, TOUCH.pausePx * 0.8);
    for (const side of ['left', 'right'] as const) {
      const st = this.sticks[side];
      const fixed = s.sticks === 'fixed';
      const active = st.pointer !== null;
      if (fixed && !active) this.fixedBase(st, side, w, h, r);
      st.base.hidden = !fixed && !active;
      this.place(st.base, st.baseX - r, st.baseY - r, r * 2, r * 2);
      const nx = active ? st.x - st.baseX : 0;
      const ny = active ? st.y - st.baseY : this.restNubY(side, r);
      const len = Math.hypot(nx, ny);
      const k = len > r ? r / len : 1;
      st.nub.style.transform = `translate(${(nx * k).toFixed(1)}px, ${(ny * k).toFixed(1)}px)`;
    }
  }

  private get throttleSide(): Side {
    return this.settings.swap ? 'right' : 'left';
  }

  private metrics(): { w: number; h: number; r: number } {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const r = Math.max(TOUCH.minRadiusPx, Math.min(TOUCH.maxRadiusPx, Math.min(w, h) * TOUCH.stickRadius * this.settings.stickSize));
    return { w, h, r };
  }

  private fixedBase(st: Stick, side: Side, w: number, h: number, r: number): void {
    st.baseX = side === 'left' ? r * TOUCH.fixedInset : w - r * TOUCH.fixedInset;
    st.baseY = h - r * TOUCH.fixedInset;
  }

  /** Where the throttle stick's nub rests: at the current throttle (it stays put), or centered for altitude hold. */
  private restNubY(side: Side, r: number): number {
    return side === this.throttleSide && !this.climbMode ? (0.5 - this.throttle) * 2 * r : 0;
  }

  private place(el: HTMLElement, x: number, y: number, w: number, h: number): void {
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.width = `${w.toFixed(1)}px`;
    el.style.height = `${h.toFixed(1)}px`;
  }

  private inside(el: HTMLElement, x: number, y: number): boolean {
    if (el.hidden) return false;
    const b = el.getBoundingClientRect();
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.lastTouchAt = performance.now();
    const { clientX: x, clientY: y, pointerId: id } = e;
    try {
      // Keep getting this finger's moves even if it slides over another element.
      this.root.setPointerCapture(id);
    } catch {
      // Not a live pointer (synthetic events): moves still arrive on the overlay.
    }
    if (this.inside(this.pauseEl, x, y)) {
      this.onPause();
      return;
    }
    if (this.inside(this.fireEl, x, y)) {
      if (this.settings.triggerLock) this.locked = !this.locked;
      else this.firePointers.add(id);
      return;
    }
    if (this.inside(this.specialEl, x, y)) {
      this.specialPointer = id;
      this.special = true;
      return;
    }
    const { w, h, r } = this.metrics();
    const side: Side = x < w / 2 ? 'left' : 'right';
    const st = this.sticks[side];
    if (st.pointer === null) {
      st.pointer = id;
      if (this.settings.sticks === 'fixed') this.fixedBase(st, side, w, h, r);
      else {
        // Floating: the stick appears under your thumb. The throttle stick keeps your throttle where it was.
        st.baseX = x;
        st.baseY = side === this.throttleSide && !this.climbMode ? y - (0.5 - this.throttle) * 2 * r : y;
      }
      st.x = x;
      st.y = y;
      this.read(side, r);
      if (side === this.throttleSide) this.tapStart = { id, t: performance.now(), x, y };
      return;
    }
    // A second finger on the aiming side fires while it's down.
    if (side !== this.throttleSide && this.settings.secondFingerFire) this.firePointers.add(id);
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    for (const side of ['left', 'right'] as const) {
      const st = this.sticks[side];
      if (st.pointer !== e.pointerId) continue;
      st.x = e.clientX;
      st.y = e.clientY;
      this.read(side, this.metrics().r);
    }
  }

  private up(e: PointerEvent): void {
    const id = e.pointerId;
    this.firePointers.delete(id);
    if (this.specialPointer === id) {
      this.specialPointer = null;
      this.special = false;
    }
    for (const side of ['left', 'right'] as const) {
      const st = this.sticks[side];
      if (st.pointer !== id) continue;
      st.pointer = null;
      // Aim and yaw spring back; throttle stays where you left it; altitude hold centers (hold height).
      if (side === this.throttleSide) {
        this.yaw = 0;
        this.climb = 0;
        this.detectDoubleTap(e);
      } else {
        this.roll = 0;
        this.pitch = 0;
      }
    }
  }

  private detectDoubleTap(e: PointerEvent): void {
    const now = performance.now();
    const t = this.tapStart;
    const quick = t.id === e.pointerId && now - t.t < TOUCH.tapMs && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TOUCH.tapSlopPx;
    if (!quick) return;
    if (now - this.lastTapAt < TOUCH.doubleTapMs) {
      this.switchQueued = true;
      this.lastTapAt = 0;
    } else this.lastTapAt = now;
  }

  /** Stick deflection to values: up is forward (pitch) or more throttle, right is roll or yaw right. */
  private read(side: Side, r: number): void {
    const st = this.sticks[side];
    let dx = (st.x - st.baseX) / r;
    let dy = (st.y - st.baseY) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (side === this.throttleSide) {
      this.yaw = dx;
      if (this.climbMode) this.climb = -dy;
      else this.throttle = Math.max(0, Math.min(1, 0.5 - ((st.y - st.baseY) / r) * 0.5));
    } else {
      this.roll = dx;
      this.pitch = -dy;
    }
  }

  private releaseAll(): void {
    for (const st of Object.values(this.sticks)) st.pointer = null;
    this.firePointers.clear();
    this.specialPointer = null;
    this.special = false;
    this.locked = false;
    this.roll = this.pitch = this.yaw = this.climb = 0;
  }
}
