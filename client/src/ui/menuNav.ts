import type { ControlState } from '../input/inputManager';

/**
 * Menus from the radio (ADR-0068): the calibrated sticks and buttons move through whatever menu is showing.
 * Pitch moves focus, roll changes a value (sliders, lists, numbers) or moves along a row, Fire selects and
 * Special goes back. Reads only the normalized ControlState (Hard rule 3).
 */

/** Stick deflection that counts as a push, and the auto-repeat while held (s). */
const NAV = { threshold: 0.5, release: 0.3, firstRepeat: 0.4, repeat: 0.12 } as const;

const FOCUSABLE = 'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export class MenuNav {
  private vHeld = 0;
  private hHeld = 0;
  private vNext = 0;
  private hNext = 0;
  private fireWas = true;
  private specialWas = true;
  private time = 0;

  constructor(private readonly root: HTMLElement) {
    // Back to mouse or touch: drop the radio focus ring.
    window.addEventListener('pointermove', () => root.classList.remove('radio-nav'));
  }

  /** Call each frame while the menu is showing. Returns 'back' when Special was pressed. */
  update(control: ControlState, dt: number): 'back' | null {
    this.time += dt;
    const v = this.axis(control.pitch, 'v');
    const h = this.axis(control.roll, 'h');
    if (v !== 0) this.move(-v);
    if (h !== 0) this.adjust(h);
    const fire = control.fire && !this.fireWas;
    const special = control.special && !this.specialWas;
    this.fireWas = control.fire;
    this.specialWas = control.special;
    if (fire) this.select();
    if (special) {
      this.root.classList.add('radio-nav');
      return 'back';
    }
    return null;
  }

  /** Buttons held while the menu opened don't count until they're let go. */
  reset(): void {
    this.fireWas = true;
    this.specialWas = true;
  }

  /** -1, 0 or +1 when the stick is pushed (again, or on auto-repeat). */
  private axis(value: number, which: 'v' | 'h'): number {
    const held = which === 'v' ? this.vHeld : this.hHeld;
    const dir = Math.abs(value) >= NAV.threshold ? Math.sign(value) : Math.abs(value) < NAV.release ? 0 : held;
    let out = 0;
    if (dir !== held) {
      out = dir;
      if (which === 'v') this.vNext = this.time + NAV.firstRepeat;
      else this.hNext = this.time + NAV.firstRepeat;
    } else if (dir !== 0 && this.time >= (which === 'v' ? this.vNext : this.hNext)) {
      out = dir;
      if (which === 'v') this.vNext = this.time + NAV.repeat;
      else this.hNext = this.time + NAV.repeat;
    }
    if (which === 'v') this.vHeld = dir;
    else this.hHeld = dir;
    return out;
  }

  private focusables(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  private current(): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && this.root.contains(a) ? a : null;
  }

  /** Focus the next (+1) or previous (-1) control in page order. */
  private move(step: number): void {
    this.root.classList.add('radio-nav');
    const list = this.focusables();
    if (!list.length) return;
    const cur = this.current();
    const i = cur ? list.indexOf(cur) : -1;
    const next = i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
    list[next]!.focus();
    list[next]!.scrollIntoView({ block: 'nearest' });
  }

  /** Roll: change a slider, list or number; anywhere else move along the row. */
  private adjust(step: number): void {
    const el = this.current();
    if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) {
      this.root.classList.add('radio-nav');
      if (step > 0) el.stepUp();
      else el.stepDown();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (el instanceof HTMLSelectElement) {
      this.root.classList.add('radio-nav');
      const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + step));
      if (i !== el.selectedIndex) {
        el.selectedIndex = i;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    this.move(step);
  }

  private select(): void {
    this.root.classList.add('radio-nav');
    const el = this.current();
    if (!el) {
      this.move(1);
      return;
    }
    if (el instanceof HTMLSelectElement) this.adjust(1);
    else el.click();
  }
}
