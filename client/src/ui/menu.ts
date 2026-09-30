import { DEFAULT_RATES, type AxisRates } from '../config';
import { CalibrationScreen } from '../input/calibrationScreen';
import type { InputManager } from '../input/inputManager';
import type { NetClient } from '../net/netClient';
import { maxRate } from '../sim/rates';
import { defaultSettings, saveSettings, type Settings } from '../settings';

type Screen = 'main' | 'settings' | 'controller' | 'online';

export interface MenuCallbacks {
  onFly(): void;
  /** Camera or graphics settings changed and need re-applying. */
  onSettingsChanged(): void;
}

/** Pause menu with main, settings and controller-setup screens. */
export class Menu {
  visible = true;
  private screen: Screen = 'main';
  private readonly calibration: CalibrationScreen;

  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputManager,
    private readonly settings: Settings,
    private readonly net: NetClient,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.calibration = new CalibrationScreen(root, input, () => this.show('main'));
    this.show('main');
  }

  show(screen: Screen): void {
    this.screen = screen;
    this.visible = true;
    this.root.hidden = false;
    if (screen === 'main') this.renderMain();
    else if (screen === 'settings') this.renderSettings();
    else if (screen === 'online') this.renderOnline();
    else this.calibration.open();
  }

  hide(): void {
    this.visible = false;
    this.root.hidden = true;
  }

  /** Escape key: back out of sub-screens, or toggle the menu. */
  back(): void {
    if (!this.visible) this.show('main');
    else if (this.screen !== 'main') this.show('main');
    else this.callbacks.onFly();
  }

  /** Network status changed: refresh whatever shows it. */
  onNetChange(): void {
    if (!this.visible) return;
    if (this.screen === 'online') this.renderOnline();
    if (this.screen === 'main') this.renderMain();
  }

  tick(): void {
    if (!this.visible) return;
    if (this.screen === 'controller') this.calibration.tick();
    if (this.screen === 'main') this.updateControllerStatus();
  }

  private renderMain(): void {
    this.root.innerHTML = `
      <div class="title-block">
        <div class="logo">DRONE<span>FIGHT</span></div>
        <div class="scribble">flight test · phase 1</div>
      </div>
      <div class="panel main-menu">
        <button class="btn big" data-fly>${this.net.inRoom ? 'Fly' : 'Fly solo'}</button>
        <button class="btn ghost" data-online>${this.net.inRoom ? `Room ${this.net.room}` : 'Play online'}</button>
        <button class="btn ghost" data-controller>Controller setup</button>
        <button class="btn ghost" data-settings>Settings</button>
        <div class="controller-status" data-status></div>
      </div>
      <div class="keys">ESC menu · R reset · C camera · M mute · keyboard: W/S throttle, A/D yaw, arrows pitch/roll, Space fire</div>`;
    this.root.querySelector('[data-fly]')?.addEventListener('click', () => this.callbacks.onFly());
    this.root.querySelector('[data-online]')?.addEventListener('click', () => this.show('online'));
    this.root.querySelector('[data-controller]')?.addEventListener('click', () => this.show('controller'));
    this.root.querySelector('[data-settings]')?.addEventListener('click', () => this.show('settings'));
    this.updateControllerStatus();
  }

  private updateControllerStatus(): void {
    const el = this.root.querySelector('[data-status]');
    if (!el) return;
    const pads = this.input.listGamepads();
    const ready = pads.find((p) => p.calibrated) ?? pads.find((p) => p.standard);
    const text = ready
      ? `✓ ${ready.id}`
      : pads[0]
        ? `New controller found. Run Controller setup: ${pads[0].id}`
        : 'No controller: keyboard mode. Plug in your radio and move a stick.';
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.toggle('warn', !ready);
    }
  }

  private renderOnline(): void {
    const net = this.net;
    const busy = net.status === 'connecting' || net.status === 'reconnecting';

    if (net.inRoom && net.room) {
      const peerCount = net.peers.size;
      this.root.innerHTML = `
        <div class="panel online">
          <div class="panel-head"><span class="kicker">Play online</span><h2>Your room</h2></div>
          <div class="room-code">${net.room}</div>
          <div class="room-hint">read this code to your friend</div>
          <div class="peer-status ${peerCount > 0 ? 'ok' : ''}">${peerCount > 0 ? '✓ Friend connected' : 'Waiting for your friend…'}</div>
          <div class="actions">
            <button class="btn ghost" data-copy>Copy invite link</button>
            <button class="btn ghost" data-leave>Leave room</button>
            <button class="btn" data-fly>Fly</button>
          </div>
        </div>`;
      this.root.querySelector('[data-fly]')?.addEventListener('click', () => this.callbacks.onFly());
      this.root.querySelector('[data-leave]')?.addEventListener('click', () => {
        net.leave();
        this.renderOnline();
      });
      this.root.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const link = `${location.origin}${location.pathname}?room=${net.room}`;
        navigator.clipboard?.writeText(link).then(
          () => (btn.textContent = 'Copied ✓'),
          () => (btn.textContent = link),
        );
      });
      return;
    }

    this.root.innerHTML = `
      <div class="panel online">
        <div class="panel-head"><span class="kicker">Play online</span><h2>1v1 room</h2></div>
        <button class="btn big" data-create ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Create room'}</button>
        <div class="divider">or join a friend</div>
        <form class="join-row" data-join>
          <input maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false" data-code ${busy ? 'disabled' : ''}>
          <button class="btn" type="submit" ${busy ? 'disabled' : ''}>Join</button>
        </form>
        <div class="net-error">${net.error ? escapeText(net.error) : ''}</div>
        <div class="actions"><button class="btn ghost" data-back>Back</button></div>
      </div>`;
    this.root.querySelector('[data-create]')?.addEventListener('click', () => net.createRoom());
    this.root.querySelector('[data-join]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = this.root.querySelector<HTMLInputElement>('[data-code]')?.value ?? '';
      if (code.trim()) net.joinRoom(code);
    });
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.show('main'));
    this.root.querySelector<HTMLInputElement>('[data-code]')?.focus();
  }

  private renderSettings(): void {
    const s = this.settings;
    const rateRow = (axis: 'roll' | 'pitch' | 'yaw') => {
      const r = s.rates[axis];
      return `<tr data-axis="${axis}">
        <th>${axis}</th>
        <td><input type="number" step="0.01" min="0.01" max="3" value="${r.rcRate}" data-rate="rcRate"></td>
        <td><input type="number" step="0.01" min="0" max="0.99" value="${r.superRate}" data-rate="superRate"></td>
        <td><input type="number" step="0.01" min="0" max="1" value="${r.expo}" data-rate="expo"></td>
        <td class="maxvel" data-max>${Math.round(maxRate(r))}</td>
      </tr>`;
    };
    this.root.innerHTML = `
      <div class="panel settings">
        <div class="panel-head"><span class="kicker">Settings</span><h2>Rates &amp; camera</h2></div>
        <table class="rates">
          <thead><tr><th></th><th>RC rate</th><th>Super</th><th>Expo</th><th>Max °/s</th></tr></thead>
          <tbody>${rateRow('roll')}${rateRow('pitch')}${rateRow('yaw')}</tbody>
        </table>
        <p class="hint">Betaflight classic rates. Copy yours from the Betaflight Configurator.</p>
        <label class="field">Camera uptilt <input type="range" min="0" max="60" step="1" value="${s.camera.uptiltDeg}" data-cam="uptiltDeg"><span>${s.camera.uptiltDeg}°</span></label>
        <label class="field">Field of view <input type="range" min="80" max="150" step="1" value="${s.camera.fovHorizontalDeg}" data-cam="fovHorizontalDeg"><span>${s.camera.fovHorizontalDeg}°</span></label>
        <label class="field">View
          <select data-view><option value="fpv" ${s.camera.view === 'fpv' ? 'selected' : ''}>FPV</option><option value="chase" ${s.camera.view === 'chase' ? 'selected' : ''}>Chase</option></select>
        </label>
        <label class="field">Volume <input type="range" min="0" max="1" step="0.05" value="${s.audio.volume}" data-volume><span>${Math.round(s.audio.volume * 100)}%</span></label>
        <label class="field check"><input type="checkbox" data-mute ${s.audio.muted ? 'checked' : ''}> Mute (M)</label>
        <label class="field check"><input type="checkbox" data-gfx="shadows" ${s.graphics.shadows ? 'checked' : ''}> Shadows</label>
        <label class="field check"><input type="checkbox" data-gfx="showDebug" ${s.graphics.showDebug ? 'checked' : ''}> Debug readout (FPS, renderer)</label>
        <div class="actions">
          <button class="btn ghost" data-defaults>Reset to defaults</button>
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;

    this.root.querySelectorAll<HTMLInputElement>('[data-rate]').forEach((el) =>
      el.addEventListener('change', () => {
        const row = el.closest<HTMLElement>('tr');
        const axis = row?.dataset.axis as 'roll' | 'pitch' | 'yaw' | undefined;
        const key = el.dataset.rate as keyof AxisRates;
        const value = Number(el.value);
        if (!axis || !Number.isFinite(value)) return;
        const limits: Record<keyof AxisRates, [number, number]> = { rcRate: [0.01, 3], superRate: [0, 0.99], expo: [0, 1] };
        const [lo, hi] = limits[key];
        s.rates[axis][key] = Math.max(lo, Math.min(hi, value));
        el.value = String(s.rates[axis][key]);
        const max = row?.querySelector('[data-max]');
        if (max) max.textContent = String(Math.round(maxRate(s.rates[axis])));
        this.commit();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('[data-cam]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.cam as 'uptiltDeg' | 'fovHorizontalDeg';
        s.camera[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${el.value}°`;
        this.commit();
      }),
    );
    this.root.querySelector<HTMLSelectElement>('[data-view]')?.addEventListener('change', (e) => {
      s.camera.view = (e.target as HTMLSelectElement).value === 'chase' ? 'chase' : 'fpv';
      this.commit();
    });
    this.root.querySelectorAll<HTMLInputElement>('[data-gfx]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = el.dataset.gfx as 'shadows' | 'showDebug';
        s.graphics[key] = el.checked;
        this.commit();
      }),
    );
    this.root.querySelector<HTMLInputElement>('[data-volume]')?.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      s.audio.volume = Number(el.value);
      const label = el.nextElementSibling;
      if (label) label.textContent = `${Math.round(s.audio.volume * 100)}%`;
      this.commit();
    });
    this.root.querySelector<HTMLInputElement>('[data-mute]')?.addEventListener('change', (e) => {
      s.audio.muted = (e.target as HTMLInputElement).checked;
      this.commit();
    });
    this.root.querySelector('[data-defaults]')?.addEventListener('click', () => {
      Object.assign(s, defaultSettings(), { rates: structuredClone(DEFAULT_RATES) });
      this.commit();
      this.renderSettings();
    });
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.show('main'));
  }

  private commit(): void {
    saveSettings(this.settings);
    this.callbacks.onSettingsChanged();
  }
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
