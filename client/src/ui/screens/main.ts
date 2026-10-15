import { accountButton } from './account';
import type { MenuContext, MenuScreen } from './screen';

/** Start screen: Play, Settings and sign-in. */
export class MainScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  render(): void {
    const { root, input } = this.ctx;
    root.innerHTML = `
      <div class="title-block">
        <div class="logo">DRONE<span>FIGHT</span></div>
        <div class="scribble">fpv dogfights with friends</div>
      </div>
      <div class="panel main-menu">
        <button class="btn big" data-play>Play</button>
        <button class="btn ghost" data-settings>Settings</button>
        ${accountButton(this.ctx.account)}
        <div class="controller-status" data-status></div>
      </div>
      <div class="keys">${
        input.touchActive
          ? 'Touch: left thumb climbs and turns · right thumb aims · index fingers fire and special · second finger on the right fires · double-tap left switches weapons'
          : 'ESC menu · F fullscreen · R reset · C camera · M mute · keyboard: W/S throttle, A/D yaw, arrows pitch/roll, Space fire, E special'
      }</div>`;
    root.querySelector('[data-play]')?.addEventListener('click', () => this.ctx.show('play'));
    root.querySelector('[data-settings]')?.addEventListener('click', () => this.ctx.show('settings'));
    root.querySelector('[data-account]')?.addEventListener('click', () => this.ctx.show('account'));
    this.updateControllerStatus();
  }

  tick(): void {
    this.updateControllerStatus();
  }

  private updateControllerStatus(): void {
    const { root, input } = this.ctx;
    const el = root.querySelector('[data-status]');
    if (!el) return;
    const pads = input.listGamepads();
    const ready = pads.find((p) => p.kind === 'saved') ?? pads.find((p) => p.kind !== 'none');
    const text = ready
      ? `✓ ${ready.id}${ready.kind === 'guessed' ? ' (guessed layout: check it in Controller setup)' : ''}`
      : pads[0]
        ? `New controller found: set it up in Settings → Controller setup (${pads[0].id})`
        : input.touchActive
          ? '✓ Touch controls. A Bluetooth gamepad works too.'
          : 'No controller: keyboard mode. Plug in your radio and move a stick.';
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.toggle('warn', !ready && !input.touchActive);
    }
  }
}
