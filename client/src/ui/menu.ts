import { DEFAULT_RATES, type AxisRates } from '../config';
import { CalibrationScreen } from '../input/calibrationScreen';
import type { InputManager } from '../input/inputManager';
import { maxRate } from '../sim/rates';
import { defaultSettings, saveSettings, type Settings } from '../settings';

type Screen = 'main' | 'settings' | 'controller';

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
        <button class="btn big" data-fly>Fly</button>
        <button class="btn ghost" data-controller>Controller setup</button>
        <button class="btn ghost" data-settings>Settings</button>
        <div class="controller-status" data-status></div>
      </div>
      <div class="keys">ESC menu · R reset · C camera · keyboard: W/S throttle, A/D yaw, arrows pitch/roll</div>`;
    this.root.querySelector('[data-fly]')?.addEventListener('click', () => this.callbacks.onFly());
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
