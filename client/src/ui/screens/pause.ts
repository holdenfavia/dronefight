import { droneClass } from '../../../../shared/drones';
import { MAP_NAMES } from '../../../../shared/maps';
import { accountButton } from './account';
import { escapeHtml, type MenuContext, type MenuScreen } from './screen';

/** Pause menu (Escape during a game): resume, change drone, the room, settings, or leave. */
export class PauseScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  render(): void {
    const { root, net, settings, input } = this.ctx;
    const inRoom = net.online;
    const where = inRoom ? `Room ${net.room} · ${net.map ? MAP_NAMES[net.map] : ''}` : `Solo · ${MAP_NAMES[settings.map]}`;
    root.innerHTML = `
      <div class="panel pause-menu">
        <div class="panel-head"><span class="kicker">Paused</span><h2>${escapeHtml(where)}</h2></div>
        <button class="btn big" data-resume>Resume</button>
        <button class="btn ghost" data-drone>Loadout: ${droneClass(settings.drone).name} ▸</button>
        ${inRoom ? '' : `<button class="btn ghost" data-map>Map: ${MAP_NAMES[settings.map]} ▸</button>`}
        ${inRoom ? `<button class="btn ghost" data-room>${net.match?.phase === 'playing' ? `Room ${net.room}: pilots` : 'Pre-match'} ▸</button>` : ''}
        ${inRoom ? `<button class="btn ghost" data-rules>Room settings ▸</button>` : ''}
        ${input.touchActive ? '<button class="btn ghost" data-touch>Touch controls ▸</button>' : ''}
        <button class="btn ghost" data-settings>Settings</button>
        <button class="btn ghost leave" data-leave>Leave game</button>
        ${accountButton(this.ctx.account)}
      </div>
      <div class="keys">ESC resume</div>`;
    root.querySelector('[data-resume]')?.addEventListener('click', () => this.ctx.fly());
    root.querySelector('[data-map]')?.addEventListener('click', () => {
      this.ctx.nextMap();
      this.render();
      root.querySelector<HTMLElement>('[data-map]')?.focus();
    });
    root.querySelector('[data-drone]')?.addEventListener('click', () => this.ctx.show('drone'));
    root.querySelector('[data-room]')?.addEventListener('click', () => this.ctx.show('room'));
    root.querySelector('[data-touch]')?.addEventListener('click', () => this.ctx.show('touch'));
    root.querySelector('[data-rules]')?.addEventListener('click', () => this.ctx.show('rules'));
    root.querySelector('[data-settings]')?.addEventListener('click', () => this.ctx.show('settings'));
    root.querySelector('[data-account]')?.addEventListener('click', () => this.ctx.show('account'));
    root.querySelector('[data-leave]')?.addEventListener('click', () => this.ctx.leaveGame('main'));
  }
}
