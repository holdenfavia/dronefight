import { DEFAULT_TOUCH, type Settings, type TouchSettings } from '../../settings';
import type { MenuContext, MenuScreen } from './screen';

/**
 * Touch controls (ADR-0044): on a touch device it replaces Controller setup. Sticks, flight assist, the four
 * ways to fire, and how the controls look. Saved per device.
 */
export class TouchScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  render(): void {
    const { root, settings: s } = this.ctx;
    const t = s.touch;
    const check = (key: keyof TouchSettings, label: string, hint = '') =>
      `<label class="field check"><input type="checkbox" data-tcheck="${key}" ${t[key] ? 'checked' : ''}> ${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>`;
    const slider = (key: 'stickSize' | 'sensitivity' | 'opacity' | 'buttonSize', label: string, min: number, max: number) =>
      `<label class="field">${label} <input type="range" min="${min}" max="${max}" step="0.05" value="${t[key]}" data-tslider="${key}"><span>${Math.round(t[key] * 100)}%</span></label>`;
    const seg = (name: string, options: readonly [string, string][], current: string) =>
      `<div class="seg-choice" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-value="${v}" class="${v === current ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    root.innerHTML = `
      <div class="panel touch-settings">
        <div class="panel-head"><span class="kicker">Settings</span><h2>Touch controls</h2></div>
        <div class="touch-grid">
          <div>
            <div class="calib-sub">Sticks</div>
            ${seg('sticks', [['floating', 'Floating'], ['fixed', 'Fixed']], t.sticks)}
            ${slider('stickSize', 'Stick size', 0.6, 1.6)}
            ${slider('sensitivity', 'Sensitivity', 0.6, 1.6)}
            ${check('swap', 'Swap sides (aim with your left thumb)')}
            <div class="calib-sub">Flight</div>
            ${seg('assist', [['acro', 'Acro'], ['horizon', 'Horizon'], ['angle', 'Angle']], s.flightAssist)}
          </div>
          <div>
            <div class="calib-sub">Firing</div>
            ${check('cornerTriggers', 'Corner Fire trigger', 'top right, for your index finger')}
            ${check('secondFingerFire', 'Second finger fires', 'anywhere on the aiming side')}
            ${check('autoFire', 'Auto-fire on target', 'guns fire while the lead circle is on someone')}
            ${check('triggerLock', 'Trigger lock', 'tap Fire to keep firing')}
            <div class="calib-sub">Look</div>
            ${slider('opacity', 'Control opacity', 0.2, 1)}
            ${slider('buttonSize', 'Button size', 0.6, 1.6)}
          </div>
        </div>
        <p class="hint">Double-tap the left side to switch weapons. Saved on this device.</p>
        <div class="actions">
          <button class="btn ghost" data-tedit>Edit layout</button>
          <button class="btn ghost" data-treset>Reset</button>
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    root.querySelectorAll<HTMLInputElement>('[data-tcheck]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = el.dataset.tcheck as 'swap' | 'cornerTriggers' | 'secondFingerFire' | 'autoFire' | 'triggerLock';
        t[key] = el.checked;
        this.ctx.commit();
      }),
    );
    root.querySelectorAll<HTMLInputElement>('[data-tslider]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.tslider as 'stickSize' | 'sensitivity' | 'opacity' | 'buttonSize';
        t[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${Math.round(t[key] * 100)}%`;
        this.ctx.commit();
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-seg]').forEach((group) =>
      group.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const v = b.dataset.value ?? '';
          if (group.dataset.seg === 'sticks') t.sticks = v === 'fixed' ? 'fixed' : 'floating';
          else s.flightAssist = v as Settings['flightAssist'];
          group.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          this.ctx.commit();
        }),
      ),
    );
    // The layout editor hides the menu; when it's done, game.ts shows Touch controls again (still on the stack).
    root.querySelector('[data-tedit]')?.addEventListener('click', () => {
      this.ctx.hide();
      this.ctx.callbacks.onEditTouchLayout();
    });
    root.querySelector('[data-treset]')?.addEventListener('click', () => {
      s.touch = { ...DEFAULT_TOUCH, layout: s.touch.layout };
      this.ctx.commit();
      this.render();
    });
    root.querySelector('[data-done]')?.addEventListener('click', () => this.ctx.back());
  }
}
