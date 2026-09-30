import { INPUT } from '../config';
import {
  detectMovedAxis,
  detectSwitch,
  normalizeStick,
  normalizeThrottle,
  readSwitch,
  type AxisCalibration,
  type ControllerProfile,
  type RawSnapshot,
  type StickChannel,
  type SwitchBinding,
} from './calibration';
import type { InputManager } from './inputManager';

// Controller setup wizard (ADR-0006). Part of the input layer, so it may read raw values.

type StepId = 'select' | 'range' | 'center' | StickChannel | 'arm' | 'reset' | 'fire' | 'special' | 'test';

interface Step {
  id: StepId;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { id: 'select', title: 'Pick your controller', body: 'Plug in your radio over USB, then <b>move a stick</b>. Browsers only show a controller after it has been touched.' },
  { id: 'range', title: 'Full range', body: 'Move <b>both sticks</b> slowly around their full range, every corner, two or three times.' },
  { id: 'center', title: 'Rest position', body: 'Let the right stick center. Put <b>throttle all the way down</b> and the yaw stick centered. Hands off, then Next.' },
  { id: 'throttle', title: 'Throttle', body: 'Push <b>throttle all the way UP</b> and hold it.' },
  { id: 'roll', title: 'Roll', body: 'Throttle back down. Hold the right stick <b>full RIGHT</b>.' },
  { id: 'pitch', title: 'Pitch', body: 'Hold the right stick <b>full FORWARD</b> (up).' },
  { id: 'yaw', title: 'Yaw', body: 'Hold the left stick <b>full RIGHT</b>.' },
  { id: 'arm', title: 'Arm switch', body: 'Flip the switch you want to use to <b>ARM</b>. No arm switch? Skip: the quad arms when throttle is low.' },
  { id: 'reset', title: 'Reset button', body: 'Press or flip what you want for <b>RESET</b> (respawn). Or skip and use the R key.' },
  { id: 'fire', title: 'Fire', body: 'Press and hold the button or switch you want to <b>FIRE</b> with. Or skip and use the Space bar.' },
  { id: 'special', title: 'Special', body: 'Press the button you want for your class <b>SPECIAL</b> (the wing\'s Cobra). Or skip and use the E key.' },
  { id: 'test', title: 'Check it', body: 'Move the sticks. Each bar should follow the right stick in the right direction. Save when it looks good.' },
];

export class CalibrationScreen {
  private step = 0;
  private padIndex = -1;
  private padId = '';
  private rangeMin: number[] = [];
  private rangeMax: number[] = [];
  private center: number[] = [];
  private stepBaseline: RawSnapshot | null = null;
  private assigned: Partial<Record<StickChannel, { axis: number; invert: boolean }>> = {};
  private arm: SwitchBinding | null = null;
  private reset: SwitchBinding | null = null;
  private fire: SwitchBinding | null = null;
  private special: SwitchBinding | null = null;
  private deadband: number = INPUT.deadband;
  private pending: { axis: number; invert: boolean } | SwitchBinding | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputManager,
    private readonly onClose: () => void,
  ) {}

  open(): void {
    this.step = 0;
    this.padIndex = -1;
    this.assigned = {};
    this.arm = null;
    this.reset = null;
    this.fire = null;
    this.special = null;
    this.render();
  }

  /** Called every frame while the screen is visible. */
  tick(): void {
    const current = STEPS[this.step];
    if (!current) return;
    if (current.id === 'select') {
      this.renderPadList();
      return;
    }
    const raw = this.input.readRaw(this.padIndex);
    if (!raw) {
      this.setStatus('Controller disconnected. Plug it back in and move a stick.');
      return;
    }
    this.trackRange(raw);

    switch (current.id) {
      case 'range':
        this.renderRawBars(raw);
        this.setNextEnabled(this.axesWithRange() >= 4);
        break;
      case 'center':
        this.renderRawBars(raw);
        break;
      case 'throttle':
      case 'roll':
      case 'pitch':
      case 'yaw': {
        const exclude = Object.values(this.assigned).map((a) => a.axis);
        const moved = detectMovedAxis(this.center, raw.axes, exclude, 0.35);
        this.pending = moved ? { axis: moved.axis, invert: moved.delta < 0 } : null;
        this.renderRawBars(raw, moved?.axis);
        this.setStatus(moved ? `Detected: axis ${moved.axis}${moved.delta < 0 ? ' (inverted)' : ''} ✓` : 'Waiting for movement…');
        this.setNextEnabled(!!moved);
        break;
      }
      case 'arm':
      case 'reset':
      case 'fire':
      case 'special': {
        const exclude = Object.values(this.assigned).map((a) => a.axis);
        const found = this.stepBaseline ? detectSwitch(this.stepBaseline, raw, exclude) : null;
        this.pending = found;
        this.setStatus(found ? `Detected: ${describeSwitch(found)} ✓` : 'Waiting for a switch or button…');
        this.setNextEnabled(!!found);
        break;
      }
      case 'test':
        this.renderTest(raw);
        break;
    }
  }

  private render(): void {
    const current = STEPS[this.step];
    if (!current) return;
    const skippable = current.id === 'arm' || current.id === 'reset' || current.id === 'fire' || current.id === 'special';
    const isTest = current.id === 'test';
    this.root.innerHTML = `
      <div class="panel calib">
        <div class="panel-head">
          <span class="kicker">Controller setup · ${this.step + 1}/${STEPS.length}</span>
          <h2>${current.title}</h2>
        </div>
        <p class="calib-body">${current.body}</p>
        <div class="calib-live"></div>
        <div class="calib-status"></div>
        ${isTest ? `<label class="field">Deadband <input type="range" min="0" max="0.15" step="0.005" value="${this.deadband}" data-deadband><span data-deadband-value>${this.deadband.toFixed(3)}</span></label>` : ''}
        <div class="actions">
          <button class="btn ghost" data-cancel>Cancel</button>
          ${this.step > 1 ? '<button class="btn ghost" data-back>Back</button>' : ''}
          ${skippable ? '<button class="btn ghost" data-skip>Skip</button>' : ''}
          ${current.id !== 'select' ? `<button class="btn" data-next>${isTest ? 'Save' : 'Next'}</button>` : ''}
        </div>
      </div>`;
    this.root.querySelector('[data-cancel]')?.addEventListener('click', () => this.onClose());
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.go(this.step - 1));
    this.root.querySelector('[data-skip]')?.addEventListener('click', () => {
      this.pending = null;
      this.commit();
    });
    this.root.querySelector('[data-next]')?.addEventListener('click', () => this.commit());
    const db = this.root.querySelector<HTMLInputElement>('[data-deadband]');
    db?.addEventListener('input', () => {
      this.deadband = Number(db.value);
      const label = this.root.querySelector('[data-deadband-value]');
      if (label) label.textContent = this.deadband.toFixed(3);
    });
  }

  private go(step: number): void {
    this.step = Math.max(0, Math.min(STEPS.length - 1, step));
    this.pending = null;
    const raw = this.input.readRaw(this.padIndex);
    this.stepBaseline = raw;
    // Stepping back to a stick step re-detects it, so drop that assignment and any after it.
    const order: StickChannel[] = ['throttle', 'roll', 'pitch', 'yaw'];
    const id = STEPS[this.step]?.id;
    const idx = order.indexOf(id as StickChannel);
    if (idx >= 0) for (const ch of order.slice(idx)) delete this.assigned[ch];
    this.render();
  }

  private commit(): void {
    const id = STEPS[this.step]?.id;
    const raw = this.input.readRaw(this.padIndex);
    switch (id) {
      case 'range':
        break;
      case 'center':
        if (raw) this.center = [...raw.axes];
        break;
      case 'throttle':
      case 'roll':
      case 'pitch':
      case 'yaw':
        if (!this.pending || 'kind' in this.pending) return;
        this.assigned[id] = this.pending;
        break;
      case 'arm':
        this.arm = this.pending && 'kind' in this.pending ? this.pending : null;
        break;
      case 'reset':
        this.reset = this.pending && 'kind' in this.pending ? this.pending : null;
        break;
      case 'fire':
        this.fire = this.pending && 'kind' in this.pending ? this.pending : null;
        break;
      case 'special':
        this.special = this.pending && 'kind' in this.pending ? this.pending : null;
        break;
      case 'test': {
        const profile = this.buildProfile();
        if (profile) this.input.saveProfile(profile);
        this.onClose();
        return;
      }
    }
    this.go(this.step + 1);
  }

  private buildProfile(): ControllerProfile | null {
    const { throttle, roll, pitch, yaw } = this.assigned;
    if (!throttle || !roll || !pitch || !yaw) return null;
    const cal = (a: { axis: number; invert: boolean }): AxisCalibration => ({
      axis: a.axis,
      invert: a.invert,
      min: this.rangeMin[a.axis] ?? -1,
      max: this.rangeMax[a.axis] ?? 1,
      center: this.center[a.axis] ?? 0,
    });
    return {
      id: this.padId,
      axes: { throttle: cal(throttle), roll: cal(roll), pitch: cal(pitch), yaw: cal(yaw) },
      deadband: this.deadband,
      arm: this.arm,
      reset: this.reset,
      fire: this.fire,
      special: this.special,
    };
  }

  private trackRange(raw: RawSnapshot): void {
    raw.axes.forEach((v, i) => {
      this.rangeMin[i] = Math.min(this.rangeMin[i] ?? v, v);
      this.rangeMax[i] = Math.max(this.rangeMax[i] ?? v, v);
    });
  }

  private axesWithRange(): number {
    let n = 0;
    for (let i = 0; i < this.rangeMin.length; i++) {
      if ((this.rangeMax[i] ?? 0) - (this.rangeMin[i] ?? 0) > 0.8) n++;
    }
    return n;
  }

  private renderPadList(): void {
    const live = this.root.querySelector('.calib-live');
    if (!live) return;
    const pads = this.input.listGamepads();
    const key = pads.map((p) => p.index + p.id).join('|');
    if (live.getAttribute('data-key') === key) return;
    live.setAttribute('data-key', key);
    if (pads.length === 0) {
      live.innerHTML = '<div class="empty">No controller detected yet.</div>';
      return;
    }
    live.innerHTML = pads
      .map(
        (p) => `<button class="pad-choice" data-pad="${p.index}">
          <span class="pad-name">${escapeHtml(p.id)}</span>
          <span class="tag">${p.calibrated ? 'set up' : p.standard ? 'gamepad' : 'new'}</span>
        </button>`,
      )
      .join('');
    live.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.pad);
        const pad = pads.find((p) => p.index === index);
        if (!pad) return;
        this.padIndex = index;
        this.padId = pad.id;
        this.rangeMin = [];
        this.rangeMax = [];
        this.go(1);
      }),
    );
  }

  private renderRawBars(raw: RawSnapshot, highlight?: number): void {
    const live = this.root.querySelector('.calib-live');
    if (!live) return;
    if (live.childElementCount !== raw.axes.length) {
      live.innerHTML = raw.axes
        .map((_, i) => `<div class="bar-row" data-axis="${i}"><span class="bar-label">Axis ${i}</span><div class="bar"><div class="bar-range"></div><div class="bar-fill"></div></div></div>`)
        .join('');
    }
    raw.axes.forEach((v, i) => {
      const row = live.children[i] as HTMLElement | undefined;
      if (!row) return;
      row.classList.toggle('hot', i === highlight);
      const fill = row.querySelector<HTMLElement>('.bar-fill');
      const range = row.querySelector<HTMLElement>('.bar-range');
      if (fill) fill.style.left = `${((v + 1) / 2) * 100}%`;
      if (range) {
        const lo = ((this.rangeMin[i] ?? v) + 1) / 2;
        const hi = ((this.rangeMax[i] ?? v) + 1) / 2;
        range.style.left = `${lo * 100}%`;
        range.style.width = `${(hi - lo) * 100}%`;
      }
    });
  }

  private renderTest(raw: RawSnapshot): void {
    const live = this.root.querySelector('.calib-live');
    const profile = this.buildProfile();
    if (!live || !profile) return;
    const values: [string, number, boolean][] = [
      ['Throttle', normalizeThrottle(raw.axes[profile.axes.throttle.axis] ?? 0, profile.axes.throttle), false],
      ['Roll', normalizeStick(raw.axes[profile.axes.roll.axis] ?? 0, profile.axes.roll, this.deadband), true],
      ['Pitch', normalizeStick(raw.axes[profile.axes.pitch.axis] ?? 0, profile.axes.pitch, this.deadband), true],
      ['Yaw', normalizeStick(raw.axes[profile.axes.yaw.axis] ?? 0, profile.axes.yaw, this.deadband), true],
    ];
    if (live.childElementCount !== values.length + 1) {
      live.innerHTML =
        values
          .map(([name]) => `<div class="bar-row"><span class="bar-label">${name}</span><div class="bar"><div class="bar-fill"></div></div><span class="bar-value"></span></div>`)
          .join('') + '<div class="switches"></div>';
    }
    values.forEach(([, v, centered], i) => {
      const row = live.children[i] as HTMLElement;
      const fill = row.querySelector<HTMLElement>('.bar-fill');
      const val = row.querySelector<HTMLElement>('.bar-value');
      const pos = centered ? (v + 1) / 2 : v;
      if (fill) fill.style.left = `${pos * 100}%`;
      if (val) val.textContent = centered ? v.toFixed(2) : `${Math.round(v * 100)}%`;
    });
    const sw = live.lastElementChild as HTMLElement;
    const armText = profile.arm ? (readSwitch(profile.arm, raw) ? 'ARMED' : 'off') : 'auto (throttle low)';
    const resetText = profile.reset ? (readSwitch(profile.reset, raw) ? 'PRESSED' : 'off') : 'R key';
    const fireText = profile.fire ? (readSwitch(profile.fire, raw) ? 'FIRING' : 'off') : 'Space';
    sw.textContent = `Arm: ${armText} · Reset: ${resetText} · Fire: ${fireText}`;
  }

  private setStatus(text: string): void {
    const el = this.root.querySelector('.calib-status');
    if (el && el.textContent !== text) el.textContent = text;
  }

  private setNextEnabled(enabled: boolean): void {
    const btn = this.root.querySelector<HTMLButtonElement>('[data-next]');
    if (btn) btn.disabled = !enabled;
  }
}

function describeSwitch(s: SwitchBinding): string {
  return s.kind === 'button' ? `button ${s.index}` : `axis ${s.index} switch`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
