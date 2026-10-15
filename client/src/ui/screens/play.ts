import { droneClass } from '../../../../shared/drones';
import { MAP_NAMES } from '../../../../shared/maps';
import type { MenuContext, MenuScreen } from './screen';

/** Play: pick drone and solo map, then fly solo, create a room, or type a friend's two-digit code. */
export class PlayScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  render(): void {
    const { root, net, settings } = this.ctx;
    const busy = net.status === 'connecting' || net.status === 'reconnecting';
    // The map only applies to solo and to rooms you create (where Room settings picks it too).
    root.innerHTML = `
      <div class="panel play">
        <div class="panel-head"><span class="kicker">Play</span><h2>Pick and go</h2></div>
        <button class="btn ghost" data-drone>Loadout: ${droneClass(settings.drone).name} ▸</button>
        <button class="btn ghost" data-map>Solo map: ${MAP_NAMES[settings.map]} ▸</button>
        <div class="play-modes">
          <button class="btn big" data-solo>Solo</button>
          <button class="btn big ghost" data-create ${busy ? 'disabled' : ''}>Create room</button>
        </div>
        <div class="divider">or join a friend</div>
        <div class="code-boxes">
          <input maxlength="1" inputmode="numeric" autocomplete="off" aria-label="First digit" data-digit="0">
          <input maxlength="1" inputmode="numeric" autocomplete="off" aria-label="Second digit" data-digit="1">
        </div>
        <div class="join-status" data-join-status></div>
        <div class="actions"><button class="btn ghost" data-back>Back</button></div>
      </div>`;
    root.querySelector('[data-drone]')?.addEventListener('click', () => this.ctx.show('drone'));
    root.querySelector('[data-map]')?.addEventListener('click', () => {
      this.ctx.nextMap();
      this.render();
      root.querySelector<HTMLElement>('[data-map]')?.focus();
    });
    root.querySelector('[data-solo]')?.addEventListener('click', () => this.ctx.fly());
    // Create room: pick the match settings first (ADR-0046).
    root.querySelector('[data-create]')?.addEventListener('click', () => this.ctx.show('rules'));
    root.querySelector('[data-back]')?.addEventListener('click', () => this.ctx.back());

    // Two digit boxes: typing moves along, the second digit joins straight away.
    const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-digit]')];
    const [first, second] = boxes;
    if (!first || !second) return;
    const tryJoin = () => {
      const code = boxes.map((b) => b.value).join('');
      if (code.length !== 2) return;
      this.join(code);
    };
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        const digits = box.value.replace(/[^0-9]/g, '');
        // Pasting "17" into a box fills both.
        if (digits.length > 1 && i === 0) {
          first.value = digits[0]!;
          second.value = digits[1]!;
        } else {
          box.value = digits.slice(-1);
        }
        if (box.value && i === 0) second.focus();
        tryJoin();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i === 1) first.focus();
      });
    });
    first.focus();
    this.status();
  }

  /** Join a room by its two-digit code. */
  join(code: string): void {
    this.ctx.joining = code;
    this.ctx.net.joinRoom(code);
    this.status(`Looking for room ${code}…`);
  }

  /** The status line under the code boxes: the given text, or what the connection is doing. */
  status(text?: string): void {
    const { root, net, joining } = this.ctx;
    const el = root.querySelector('[data-join-status]');
    if (!el) return;
    let msg = text ?? '';
    let warn = false;
    if (!text && net.status === 'error' && net.error) {
      msg = joining ? `No room ${joining}. Check the code with your friend.` : net.error;
      warn = true;
      // Clear the boxes for another try.
      root.querySelectorAll<HTMLInputElement>('[data-digit]').forEach((b) => (b.value = ''));
      root.querySelector<HTMLInputElement>('[data-digit="0"]')?.focus();
    } else if (!text && (net.status === 'connecting' || net.status === 'reconnecting')) {
      msg = joining ? `Looking for room ${joining}…` : 'Connecting…';
    }
    el.textContent = msg;
    el.classList.toggle('warn', warn);
  }
}
