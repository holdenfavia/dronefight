import type { TouchLayout, TouchSettings } from '../settings';

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
  /** Layout editor: smallest trigger (fraction of the screen side), and the resize handle (CSS px). */
  minTrigger: 0.06,
  handlePx: 26,
} as const;

type Part = 'fire' | 'special' | 'menu' | 'left' | 'right';

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
  /** The hamburger menu button (top middle): opens the pause menu, same as Escape. */
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
  /** Layout editor (ADR-0044): on while arranging the controls; the part being dragged, and how. */
  editing = false;
  private onEditDone: (() => void) | null = null;
  private drag: { id: number; part: Part; resize: boolean; x: number; y: number; start: TouchLayout } | null = null;
  private readonly editBar: HTMLElement;
  private readonly handles: Record<'fire' | 'special', HTMLElement>;

  constructor(
    root: HTMLElement,
    /** The live touch settings (read fresh each time: Settings can replace the object). */
    private readonly getSettings: () => TouchSettings,
  ) {
    this.root = root;
    root.innerHTML = `
      <div class="touch-trigger special" data-special>Special</div>
      <div class="touch-trigger fire" data-fire>Fire</div>
      <button class="touch-pause" data-pause aria-label="Menu"><span></span><span></span><span></span></button>
      <div class="touch-stick" data-stick="left"><div class="touch-nub"></div></div>
      <div class="touch-stick" data-stick="right"><div class="touch-nub"></div></div>
      <div class="touch-handle" data-handle="fire"></div>
      <div class="touch-handle" data-handle="special"></div>
      <div class="touch-editbar" hidden>
        <span>Drag to move · drag a corner to resize</span>
        <button data-edit="reset">Reset</button>
        <button data-edit="done" class="on">Done</button>
      </div>`;
    const stick = (side: Side): Stick => {
      const base = root.querySelector(`[data-stick="${side}"]`) as HTMLElement;
      return { pointer: null, baseX: 0, baseY: 0, x: 0, y: 0, base, nub: base.firstElementChild as HTMLElement };
    };
    this.sticks = { left: stick('left'), right: stick('right') };
    this.fireEl = root.querySelector('[data-fire]') as HTMLElement;
    this.specialEl = root.querySelector('[data-special]') as HTMLElement;
    this.pauseEl = root.querySelector('[data-pause]') as HTMLElement;
    this.editBar = root.querySelector('.touch-editbar') as HTMLElement;
    this.handles = { fire: root.querySelector('[data-handle="fire"]') as HTMLElement, special: root.querySelector('[data-handle="special"]') as HTMLElement };
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

  /** Open the layout editor (ADR-0044); `done` runs when you tap Done (the layout is already saved in settings). */
  startEditing(done: () => void): void {
    this.releaseAll();
    this.editing = true;
    this.onEditDone = done;
    this.root.classList.add('editing');
    this.editBar.hidden = false;
  }

  private stopEditing(): void {
    this.editing = false;
    this.drag = null;
    this.root.classList.remove('editing');
    this.editBar.hidden = true;
    const done = this.onEditDone;
    this.onEditDone = null;
    done?.();
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

  /** The default arrangement, as fractions of the screen (corners for triggers, menu top middle). */
  private defaultLayout(w: number, h: number, r: number): TouchLayout {
    const size = this.settings.buttonSize;
    const fw = TOUCH.fireW * size;
    return {
      fire: { x: 1 - fw, y: 0, w: fw, h: TOUCH.fireH * size },
      special: { x: 0, y: 0, w: TOUCH.specialW * size, h: TOUCH.specialH * size },
      menu: { x: 0.5, y: (6 + TOUCH.pausePx * 0.4) / h },
      left: { x: (r * TOUCH.fixedInset) / w, y: 1 - (r * TOUCH.fixedInset) / h },
      right: { x: 1 - (r * TOUCH.fixedInset) / w, y: 1 - (r * TOUCH.fixedInset) / h },
    };
  }

  /** Your layout from the editor, or the default. */
  private layout(w: number, h: number, r: number): TouchLayout {
    return this.settings.layout ?? this.defaultLayout(w, h, r);
  }

  /** Lay out and draw the controls for this frame. */
  render(): void {
    if (!this.visible) return;
    const s = this.settings;
    const { w, h, r } = this.metrics();
    const L = this.layout(w, h, r);
    this.root.style.setProperty('--touch-opacity', String(this.editing ? 0.9 : s.opacity));
    this.place(this.fireEl, L.fire.x * w, L.fire.y * h, L.fire.w * w, L.fire.h * h);
    this.fireEl.hidden = !s.cornerTriggers && !this.editing;
    this.fireEl.classList.toggle('on', this.fire);
    this.fireEl.classList.toggle('locked', this.locked);
    this.place(this.specialEl, L.special.x * w, L.special.y * h, L.special.w * w, L.special.h * h);
    this.specialEl.classList.toggle('on', this.special);
    this.place(this.pauseEl, L.menu.x * w - TOUCH.pausePx / 2, L.menu.y * h - TOUCH.pausePx * 0.4, TOUCH.pausePx, TOUCH.pausePx * 0.8);
    // Resize handles on the triggers' inner bottom corners, only while editing.
    const hp = TOUCH.handlePx;
    this.place(this.handles.fire, L.fire.x * w - hp / 2, (L.fire.y + L.fire.h) * h - hp / 2, hp, hp);
    this.place(this.handles.special, (L.special.x + L.special.w) * w - hp / 2, (L.special.y + L.special.h) * h - hp / 2, hp, hp);
    for (const el of Object.values(this.handles)) el.hidden = !this.editing;
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
    const p = this.layout(w, h, r)[side];
    st.baseX = p.x * w;
    st.baseY = p.y * h;
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
    if (this.editing) {
      e.preventDefault();
      this.editDown(e);
      return;
    }
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
    if (this.editing) {
      this.editMove(e);
      return;
    }
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
    if (this.editing) {
      if (this.drag?.id === e.pointerId) this.drag = null;
      return;
    }
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

  // --- Layout editor (ADR-0044)

  private editDown(e: PointerEvent): void {
    const { clientX: x, clientY: y, pointerId: id } = e;
    const bar = this.editBar.getBoundingClientRect();
    if (x >= bar.left && x <= bar.right && y >= bar.top && y <= bar.bottom) {
      const btn = [...this.editBar.querySelectorAll<HTMLElement>('[data-edit]')].find((b) => this.inside(b, x, y));
      if (btn?.dataset.edit === 'reset') this.settings.layout = null;
      else if (btn?.dataset.edit === 'done') this.stopEditing();
      return;
    }
    const { w, h, r } = this.metrics();
    const start = structuredClone(this.layout(w, h, r));
    const pick = (): { part: Part; resize: boolean } | null => {
      if (this.inside(this.handles.fire, x, y)) return { part: 'fire', resize: true };
      if (this.inside(this.handles.special, x, y)) return { part: 'special', resize: true };
      if (this.inside(this.pauseEl, x, y)) return { part: 'menu', resize: false };
      if (this.inside(this.fireEl, x, y)) return { part: 'fire', resize: false };
      if (this.inside(this.specialEl, x, y)) return { part: 'special', resize: false };
      if (this.settings.sticks === 'fixed') {
        for (const side of ['left', 'right'] as const) if (this.inside(this.sticks[side].base, x, y)) return { part: side, resize: false };
      }
      return null;
    };
    const hit = pick();
    if (!hit) return;
    try {
      this.root.setPointerCapture(id);
    } catch {
      // Synthetic pointer.
    }
    this.drag = { id, ...hit, x, y, start };
  }

  private editMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const { w, h } = this.metrics();
    const dx = (e.clientX - d.x) / w;
    const dy = (e.clientY - d.y) / h;
    const L = structuredClone(d.start);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.part === 'fire' || d.part === 'special') {
      const box = L[d.part];
      if (d.resize && d.part === 'fire') {
        // Fire's handle is its inner (bottom-left) corner: keep the top-right corner where it is.
        const right = box.x + box.w;
        box.w = clamp(box.w - dx, TOUCH.minTrigger, 0.6);
        box.h = clamp(box.h + dy, TOUCH.minTrigger, 0.6);
        box.x = right - box.w;
      } else if (d.resize) {
        box.w = clamp(box.w + dx, TOUCH.minTrigger, 0.6);
        box.h = clamp(box.h + dy, TOUCH.minTrigger, 0.6);
      } else {
        box.x = clamp(box.x + dx, 0, 1 - box.w);
        box.y = clamp(box.y + dy, 0, 1 - box.h);
      }
    } else {
      const p = L[d.part];
      p.x = clamp(p.x + dx, 0.03, 0.97);
      p.y = clamp(p.y + dy, 0.05, 0.97);
    }
    this.settings.layout = L;
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
