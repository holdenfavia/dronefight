import type { AxisRates, RateType } from '../config';
import type { InputManager } from '../input/inputManager';
import { convertRates, maxRate, parseRateDump, rateCurve, RATE_FIELDS, RATE_TYPE_LABELS } from '../sim/rates';
import { DEFAULT_TOUCH, defaultSettings, type Settings } from '../settings';

/** Settings tabs (ADR-0068). Reset to defaults resets only the open tab. */
export type SettingsTab = 'flying' | 'controls' | 'sound' | 'graphics';

const TABS: [SettingsTab, string][] = [
  ['flying', 'Flying'],
  ['controls', 'Controls'],
  ['sound', 'Sound'],
  ['graphics', 'Graphics'],
];

const ASSIST_LABELS = { acro: 'Acro (no assist)', horizon: 'Horizon', angle: 'Angle' } as const;
const AXES = ['roll', 'pitch', 'yaw'] as const;
/** Curve colors per axis, on the dark panel. */
const AXIS_COLORS = { roll: '#ff6a13', pitch: '#9be22d', yaw: '#e8e8e8' } as const;
/** How long the Reset button waits for the confirming second press (ms). */
const RESET_CONFIRM_MS = 3000;

export interface SettingsHooks {
  /** A setting changed: save it and apply it. */
  commit(): void;
  /** Open a sub-screen: controller setup, button mapping or touch controls. */
  open(screen: 'controller' | 'buttons' | 'touch'): void;
  done(): void;
}

/** The Settings screen: Flying, Controls, Sound and Graphics tabs. */
export class SettingsScreen {
  private tab: SettingsTab = 'flying';
  private resetArmed = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly input: InputManager,
    private readonly hooks: SettingsHooks,
  ) {}

  render(): void {
    const tabLabel = TABS.find(([t]) => t === this.tab)![1];
    this.resetArmed = 0;
    this.root.innerHTML = `
      <div class="panel settings">
        <div class="panel-head"><span class="kicker">Settings</span><h2>${tabLabel}</h2></div>
        <div class="seg-choice settings-tabs" role="tablist">${TABS.map(
          ([t, l]) => `<button type="button" role="tab" data-tab="${t}" class="${t === this.tab ? 'on' : ''}" aria-selected="${t === this.tab}">${l}</button>`,
        ).join('')}</div>
        <div class="settings-body">${this.body()}</div>
        <div class="actions">
          ${this.hasDefaults() ? `<button class="btn ghost" data-defaults>Reset ${tabLabel}</button>` : ''}
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as SettingsTab;
        this.render();
        this.root.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus();
      }),
    );
    const reset = this.root.querySelector<HTMLButtonElement>('[data-defaults]');
    reset?.addEventListener('click', () => {
      // Two presses: the first asks, the second (within a few seconds) resets this tab only.
      const now = performance.now();
      if (now - this.resetArmed > RESET_CONFIRM_MS) {
        this.resetArmed = now;
        reset.textContent = `Press again to reset ${tabLabel}`;
        reset.classList.add('confirm');
        window.setTimeout(() => {
          if (this.resetArmed === now && reset.isConnected) {
            reset.textContent = `Reset ${tabLabel}`;
            reset.classList.remove('confirm');
          }
        }, RESET_CONFIRM_MS);
        return;
      }
      this.resetTab();
      this.hooks.commit();
      this.render();
      this.root.querySelector<HTMLElement>('[data-defaults]')?.focus();
    });
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.hooks.done());
    if (this.tab === 'flying') this.bindFlying();
    else if (this.tab === 'controls') this.bindControls();
    else if (this.tab === 'sound') this.bindSound();
    else this.bindGraphics();
  }

  private hasDefaults(): boolean {
    return this.tab !== 'controls' || this.input.touchActive;
  }

  /** Put this tab's settings back to defaults; nothing else (builds, room settings, touch layout) changes. */
  private resetTab(): void {
    const s = this.settings;
    const d = defaultSettings();
    if (this.tab === 'flying') {
      s.rates = d.rates;
      s.camera = d.camera;
      s.flightAssist = d.flightAssist;
    } else if (this.tab === 'controls') {
      // The layout you arranged stays; reset it from the layout editor.
      s.touch = { ...DEFAULT_TOUCH, layout: s.touch.layout };
    } else if (this.tab === 'sound') s.audio = d.audio;
    else s.graphics = d.graphics;
  }

  private body(): string {
    const s = this.settings;
    if (this.tab === 'controls') {
      return this.input.touchActive
        ? `<div class="settings-controller"><button class="btn" data-open="touch">Touch controls</button></div>
           <p class="hint">Sticks, firing and the layout of the touch controls.</p>`
        : `<div class="settings-controller"><button class="btn" data-open="controller">Controller setup</button><button class="btn ghost" data-open="buttons">Map buttons</button></div>
           <p class="hint">Calibrate your radio or gamepad, and map Arm, Fire, Special, Switch weapon and Menu. In menus: pitch moves, roll changes a value, Fire selects, Special goes back.</p>`;
    }
    if (this.tab === 'sound') {
      const slider = (key: 'volume' | 'own' | 'others', label: string) =>
        `<label class="field">${label} <input type="range" min="0" max="1" step="0.05" value="${s.audio[key]}" data-audio="${key}"><span>${Math.round(s.audio[key] * 100)}%</span></label>`;
      return `${slider('volume', 'Volume')}${slider('own', 'My drone')}${slider('others', 'Other pilots')}
        <label class="field check"><input type="checkbox" data-mute ${s.audio.muted ? 'checked' : ''}> Mute (M)</label>`;
    }
    if (this.tab === 'graphics') {
      return `<label class="field check"><input type="checkbox" data-gfx="shadows" ${s.graphics.shadows ? 'checked' : ''}> Shadows</label>
        <label class="field check"><input type="checkbox" data-gfx="gridTextures" ${s.graphics.gridTextures ? 'checked' : ''}> Simplified grid textures</label>
        <label class="field check"><input type="checkbox" data-gfx="showDebug" ${s.graphics.showDebug ? 'checked' : ''}> Debug readout (FPS, renderer)</label>`;
    }
    const type = s.rates.type;
    const f = RATE_FIELDS[type];
    const keys = ['rcRate', 'superRate', 'expo'] as const;
    const rateRow = (axis: (typeof AXES)[number]) => {
      const r = s.rates[axis];
      return `<tr data-axis="${axis}">
        <th><i class="axis-dot" style="background:${AXIS_COLORS[axis]}"></i>${axis}</th>
        ${keys.map((k) => `<td><input type="number" step="${f[k].step}" min="${f[k].min}" max="${f[k].max}" value="${r[k]}" data-rate="${k}"></td>`).join('')}
        <td class="maxvel" data-max>${Math.round(maxRate(r, type))}</td>
      </tr>`;
    };
    return `
      <label class="field">Flight assist
        <select data-assist>
          ${(['acro', 'horizon', 'angle'] as const).map((a) => `<option value="${a}" ${s.flightAssist === a ? 'selected' : ''}>${ASSIST_LABELS[a]}</option>`).join('')}
        </select>
      </label>
      <p class="hint">Quads only. The X8 always flies Horizon.</p>
      <div class="calib-sub">Rates</div>
      <label class="field">Rate type
        <select data-rate-type>${(Object.keys(RATE_TYPE_LABELS) as RateType[]).map((t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${RATE_TYPE_LABELS[t]}</option>`).join('')}</select>
      </label>
      <div class="rates-wrap">
        <table class="rates">
          <thead><tr><th></th>${keys.map((k) => `<th>${f[k].label}</th>`).join('')}<th>Max °/s</th></tr></thead>
          <tbody>${AXES.map(rateRow).join('')}</tbody>
        </table>
        <svg class="rate-curve" viewBox="0 0 120 80" data-curve aria-label="Rate curves">${this.curve()}</svg>
      </div>
      <details class="rate-paste">
        <summary>Paste from Betaflight CLI</summary>
        <textarea rows="4" data-cli placeholder="In the Betaflight CLI type: rateprofile, then paste the output here"></textarea>
        <button class="btn ghost" data-cli-apply>Use these rates</button> <span class="hint" data-cli-status></span>
      </details>
      <div class="calib-sub">Camera</div>
      <label class="field">Camera uptilt <input type="range" min="0" max="60" step="1" value="${s.camera.uptiltDeg}" data-cam="uptiltDeg"><span>${s.camera.uptiltDeg}°</span></label>
      <label class="field">Field of view <input type="range" min="80" max="150" step="1" value="${s.camera.fovHorizontalDeg}" data-cam="fovHorizontalDeg"><span>${s.camera.fovHorizontalDeg}°</span></label>
      <label class="field">View
        <select data-view><option value="fpv" ${s.camera.view === 'fpv' ? 'selected' : ''}>FPV</option><option value="chase" ${s.camera.view === 'chase' ? 'selected' : ''}>Chase</option></select>
      </label>`;
  }

  /** Rate (°/s) against stick (0..1) for each axis, scaled to the fastest axis. */
  private curve(): string {
    const r = this.settings.rates;
    const top = Math.max(100, ...AXES.map((a) => maxRate(r[a], r.type)));
    const lines = AXES.map((a) => {
      const pts: string[] = [];
      for (let i = 0; i <= 24; i++) {
        const x = i / 24;
        pts.push(`${(x * 116 + 2).toFixed(1)},${(78 - (rateCurve(x, r[a], r.type) / top) * 74).toFixed(1)}`);
      }
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${AXIS_COLORS[a]}" stroke-width="1.4"/>`;
    });
    return `<rect x="2" y="4" width="116" height="74" fill="none" stroke="rgba(255,255,255,0.15)"/>${lines.join('')}<text x="4" y="11" fill="rgba(255,255,255,0.6)" font-size="7">${Math.round(top)}°/s</text>`;
  }

  private refreshRates(): void {
    const r = this.settings.rates;
    this.root.querySelectorAll<HTMLElement>('tr[data-axis]').forEach((row) => {
      const axis = row.dataset.axis as (typeof AXES)[number];
      const max = row.querySelector('[data-max]');
      if (max) max.textContent = String(Math.round(maxRate(r[axis], r.type)));
    });
    const svg = this.root.querySelector('[data-curve]');
    if (svg) svg.innerHTML = this.curve();
  }

  private bindFlying(): void {
    const s = this.settings;
    this.root.querySelector<HTMLSelectElement>('[data-assist]')?.addEventListener('change', (e) => {
      s.flightAssist = (e.target as HTMLSelectElement).value as Settings['flightAssist'];
      this.hooks.commit();
    });
    this.root.querySelector<HTMLSelectElement>('[data-rate-type]')?.addEventListener('change', (e) => {
      // Switching type keeps the feel: same center sensitivity and max rate (ADR-0068).
      s.rates = convertRates(s.rates, (e.target as HTMLSelectElement).value as RateType);
      this.hooks.commit();
      this.render();
      this.root.querySelector<HTMLElement>('[data-rate-type]')?.focus();
    });
    this.root.querySelectorAll<HTMLInputElement>('[data-rate]').forEach((el) =>
      el.addEventListener('change', () => {
        const axis = el.closest<HTMLElement>('tr')?.dataset.axis as (typeof AXES)[number] | undefined;
        const key = el.dataset.rate as keyof AxisRates;
        const value = Number(el.value);
        if (!axis || !Number.isFinite(value)) return;
        const { min, max } = RATE_FIELDS[s.rates.type][key];
        s.rates[axis][key] = Math.max(min, Math.min(max, value));
        el.value = String(s.rates[axis][key]);
        this.refreshRates();
        this.hooks.commit();
      }),
    );
    this.root.querySelector('[data-cli-apply]')?.addEventListener('click', () => {
      const text = this.root.querySelector<HTMLTextAreaElement>('[data-cli]')?.value ?? '';
      const parsed = parseRateDump(text, s.rates);
      const status = this.root.querySelector('[data-cli-status]');
      if (!parsed) {
        if (status) status.textContent = 'No Betaflight, Actual or Quick rates found in that text.';
        return;
      }
      s.rates = parsed;
      this.hooks.commit();
      this.render();
      const after = this.root.querySelector('[data-cli-status]');
      if (after) after.textContent = `Loaded ${RATE_TYPE_LABELS[parsed.type]} rates.`;
    });
    this.root.querySelectorAll<HTMLInputElement>('[data-cam]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.cam as 'uptiltDeg' | 'fovHorizontalDeg';
        s.camera[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${el.value}°`;
        this.hooks.commit();
      }),
    );
    this.root.querySelector<HTMLSelectElement>('[data-view]')?.addEventListener('change', (e) => {
      s.camera.view = (e.target as HTMLSelectElement).value === 'chase' ? 'chase' : 'fpv';
      this.hooks.commit();
    });
  }

  private bindControls(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => b.addEventListener('click', () => this.hooks.open(b.dataset.open as 'controller' | 'buttons' | 'touch')));
  }

  private bindSound(): void {
    const s = this.settings;
    this.root.querySelectorAll<HTMLInputElement>('[data-audio]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.audio as 'volume' | 'own' | 'others';
        s.audio[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${Math.round(s.audio[key] * 100)}%`;
        this.hooks.commit();
      }),
    );
    this.root.querySelector<HTMLInputElement>('[data-mute]')?.addEventListener('change', (e) => {
      s.audio.muted = (e.target as HTMLInputElement).checked;
      this.hooks.commit();
    });
  }

  private bindGraphics(): void {
    const s = this.settings;
    this.root.querySelectorAll<HTMLInputElement>('[data-gfx]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = el.dataset.gfx as 'shadows' | 'showDebug' | 'gridTextures';
        s.graphics[key] = el.checked;
        this.hooks.commit();
      }),
    );
  }
}
