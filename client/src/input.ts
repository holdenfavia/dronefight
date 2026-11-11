// Keyboard controls (ADR-0071): one player per keyboard. WASD moves; the arrow keys attack in their
// direction. Q makes arrows specials: hold it, or tap it once to prime the next arrow (owner's idea,
// 2026-11-10). E shields and dodges, ? (the slash key) grabs. Key codes are physical keys, so the layout works
// the same on any keyboard language.

import { NO_INPUT, type Input } from '../../shared/fighter/sim';

const MOVE = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' } as const;
const AIM = { aimLeft: 'ArrowLeft', aimRight: 'ArrowRight', aimUp: 'ArrowUp', aimDown: 'ArrowDown' } as const;
const SPECIAL_KEY = 'KeyQ';
const GRAB_KEY = 'Slash'; // The ? key.
const SHIELD_KEY = 'KeyE';

/** Short labels for the controls card. */
export const KEY_LABELS = {
  move: 'A D',
  jump: 'W',
  down: 'S',
  arrows: '← → ↑ ↓',
  special: 'Q',
  grab: '?',
  shield: 'E',
} as const;

const GAME_KEYS = new Set<string>([...Object.values(MOVE), ...Object.values(AIM), SPECIAL_KEY, GRAB_KEY, SHIELD_KEY]);

export class Keyboard {
  private down = new Set<string>();
  /** Keys pressed since the last call to takePressed (for menus). */
  private pressed: string[] = [];
  /** Q was tapped since the last arrow: the next arrow is a special. */
  primed = false;
  /** Arrow keys held as specials (pressed with Q held or primed); the rest are attacks. */
  private specialArrows = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.push(e.code);
        if (e.code === SPECIAL_KEY) this.primed = true;
        else if (e.code.startsWith('Arrow')) {
          if (this.primed || this.down.has(SPECIAL_KEY)) this.specialArrows.add(e.code);
          this.primed = false;
        }
      }
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.specialArrows.delete(e.code);
    });
    // Releasing keys while the window is in the background never reaches us: forget them all.
    target.addEventListener('blur', () => { this.down.clear(); this.specialArrows.clear(); });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  /** Forget a primed special (new match). */
  reset(): void {
    this.primed = false;
    this.specialArrows.clear();
  }

  /** The player's input this frame. */
  read(): Input {
    const input: Input = { ...NO_INPUT };
    for (const [k, code] of Object.entries(MOVE) as [keyof typeof MOVE, string][]) input[k] = this.down.has(code);
    for (const [k, code] of Object.entries(AIM) as [keyof typeof AIM, string][]) {
      if (!this.down.has(code)) continue;
      input[k] = true;
      if (this.specialArrows.has(code)) input.special = true;
      else input.attack = true;
    }
    input.grab = this.down.has(GRAB_KEY);
    input.shield = this.down.has(SHIELD_KEY);
    return input;
  }
}
