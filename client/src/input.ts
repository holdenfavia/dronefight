// Keyboard controls (ADR-0070). Two players share one keyboard; key codes are physical keys,
// so the layout works the same on any keyboard language.

import { NO_INPUT, type Input } from '../../shared/fighter/sim';

export type Scheme = 'p1' | 'p2';

type KeyMap = Record<keyof Input, string[]>;

export const KEYMAPS: Record<Scheme, KeyMap> = {
  p1: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    attack: ['KeyF'],
    special: ['KeyG'],
    shield: ['KeyH'],
  },
  p2: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    attack: ['KeyK', 'Comma', 'Numpad1'],
    special: ['KeyL', 'Period', 'Numpad2'],
    shield: ['Semicolon', 'Slash', 'Numpad3'],
  },
};

/** Short labels for the controls card. */
export const KEY_LABELS: Record<Scheme, Record<keyof Input, string>> = {
  p1: { left: 'A', right: 'D', up: 'W', down: 'S', attack: 'F', special: 'G', shield: 'H' },
  p2: { left: '←', right: '→', up: '↑', down: '↓', attack: 'K', special: 'L', shield: ';' },
};

const GAME_KEYS = new Set(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()));

export class Keyboard {
  private down = new Set<string>();
  /** Keys pressed since the last call to takePressed (for menus). */
  private pressed: string[] = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    // Releasing keys while the window is in the background never reaches us: forget them all.
    target.addEventListener('blur', () => this.down.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  /** Input for one player from one or more schemes (a solo player can use either side). */
  read(schemes: readonly Scheme[]): Input {
    const input: Input = { ...NO_INPUT };
    for (const scheme of schemes) {
      const map = KEYMAPS[scheme];
      for (const key of Object.keys(map) as (keyof Input)[]) {
        if (map[key].some((code) => this.down.has(code))) input[key] = true;
      }
    }
    return input;
  }
}
