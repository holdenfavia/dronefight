import { INPUT } from '../config';
import {
  detectMovedAxis,
  detectSwitch,
  normalizeStick,
  normalizeThrottle,
  readSwitch,
  applySensitivity,
  SENSITIVITY_RANGE,
  type AxisCalibration,
  type ControllerProfile,
  type RawSnapshot,
  type StickChannel,
  type SwitchBinding,
} from './calibration';
import type { InputManager, ProfileKind } from './inputManager';

// Controller setup (ADR-0006). Part of the input layer, so it may read raw values. A hub per controller
// with three separate parts: calibrate sticks (keeps buttons), map buttons (keeps sticks), stick feel.

type StepId = 'select' | 'range' | 'center' | StickChannel | 'arm' | 'reset' | 'fire' | 'special' | 'weaponSwitch' | 'test';

interface Step {
  id: StepId;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { id: 'select', title: 'Pick your controller', body: 'Plug in your radio or gamepad over USB, then <b>move a stick</b>. Browsers only show a controller after it has been touched.' },
  { id: 'range', title: 'Full range', body: 'Move <b>both sticks</b> slowly around their full range, every corner, two or three times.' },
  { id: 'center', title: 'Rest position', body: 'Let the right stick center. Put <b>throttle all the way down</b> and the yaw stick centered (on a gamepad, just let both sticks rest). Hands off, then Next.' },
  { id: 'throttle', title: 'Throttle', body: 'Push <b>throttle all the way UP</b> and hold it.' },
  { id: 'roll', title: 'Roll', body: 'Throttle back down. Hold the right stick <b>full RIGHT</b>.' },
  { id: 'pitch', title: 'Pitch', body: 'Hold the right stick <b>full FORWARD</b> (up).' },
  { id: 'yaw', title: 'Yaw', body: 'Hold the left stick <b>full RIGHT</b>.' },
  { id: 'arm', title: 'Arm switch', body: 'Flip the switch you want to use to <b>ARM</b>. No arm switch? Skip: the quad arms when throttle is low.' },
  { id: 'reset', title: 'Reset button', body: 'Press or flip what you want for <b>RESET</b> (respawn). Or skip and use the R key.' },
  { id: 'fire', title: 'Fire', body: 'Press and hold the button or switch you want to <b>FIRE</b> with. Or skip and use the Space bar.' },
  { id: 'special', title: 'Special', body: 'Press the button you want for your class <b>SPECIAL</b> (the wing\'s maneuver mode: a button, or a switch to leave it on). Or skip and use the E key.' },
  { id: 'weaponSwitch', title: 'Switch weapon', body: 'Press the button you want to <b>SWITCH</b> between guns and missiles (needed only if you carry missile pods and a special). Or skip and use the Q key.' },
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
  private weaponSwitch: SwitchBinding | null = null;
  private deadband: number = INPUT.deadband;
  private sensitivity = 1;
  private pending: { axis: number; invert: boolean } | SwitchBinding | null = null;
  /** The hub, or a wizard: sticks only (keeps buttons) or buttons only (keeps sticks). */
  private view: 'hub' | 'wizard' = 'hub';
  private steps: Step[] = STEPS;
  private buttonsOnly = false;
  /** The hub's controller (index into navigator.getGamepads()), and what its list looked like last render. */
  private hubPad = -1;
  private hubKey = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputManager,
    private readonly onClose: () => void,
  ) {}

  /** The controller hub: pick a controller, then calibrate sticks, map buttons, or adjust stick feel. */
  openHub(padIndex = this.hubPad): void {
    this.view = 'hub';
    this.hubPad = padIndex;
    this.hubKey = '';
    this.renderHub();
  }

  /** Sticks only: detects axes, range and center, and keeps the button bindings. */
  openSticks(padIndex = -1): void {
    this.start(false, padIndex);
  }

  /** Buttons only: Arm / Reset / Fire / Special, keeping the stick calibration (ADR-0014). */
  openButtons(padIndex = -1): void {
    this.start(true, padIndex);
  }

  private start(buttonsOnly: boolean, padIndex: number): void {
    this.view = 'wizard';
    this.buttonsOnly = buttonsOnly;
    const buttonSteps: StepId[] = ['select', 'arm', 'reset', 'fire', 'special', 'weaponSwitch', 'test'];
    const stickSteps: StepId[] = ['select', 'range', 'center', 'throttle', 'roll', 'pitch', 'yaw', 'test'];
    this.steps = STEPS.filter((st) => (buttonsOnly ? buttonSteps : stickSteps).includes(st.id));
    this.step = 0;
    this.padIndex = -1;
    this.assigned = {};
    this.arm = null;
    this.reset = null;
    this.fire = null;
    this.special = null;
    this.weaponSwitch = null;
    this.deadband = INPUT.deadband;
    this.sensitivity = 1;
    if (padIndex >= 0 && this.choosePad(padIndex)) {
      this.go(1);
      return;
    }
    this.render();
  }

  /** Leave a wizard: back to the hub for the same controller. */
  private closeWizard(): void {
    this.openHub(this.padIndex >= 0 ? this.padIndex : this.hubPad);
  }

  /**
   * Start a wizard on this controller from whatever it uses now (saved, default or guessed), so the
   * part you're not redoing is kept. Buttons only needs working sticks first.
   */
  private choosePad(index: number): boolean {
    const pad = this.input.listGamepads().find((p) => p.index === index);
    if (!pad) return false;
    this.padIndex = index;
    this.padId = pad.id;
    this.rangeMin = [];
    this.rangeMax = [];
    const loaded = this.loadExisting(index);
    if (this.buttonsOnly && !loaded) {
      const live = this.root.querySelector('.calib-live');
      if (live) live.innerHTML = '<div class="empty">This controller has no stick setup yet. Run Calibrate sticks first.</div>';
      return false;
    }
    // Recalibrating sticks: detect every axis again (buttons and feel stay as loaded).
    if (!this.buttonsOnly) {
      this.assigned = {};
      this.rangeMin = [];
      this.rangeMax = [];
      this.center = [];
    }
    return true;
  }

  /** Called every frame while the screen is visible. */
  tick(): void {
    if (this.view === 'hub') {
      this.tickHub();
      return;
    }
    const current = this.steps[this.step];
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
      case 'weaponSwitch':
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
    const current = this.steps[this.step];
    if (!current) return;
    const skippable = current.id === 'arm' || current.id === 'reset' || current.id === 'fire' || current.id === 'special' || current.id === 'weaponSwitch';
    const isTest = current.id === 'test';
    this.root.innerHTML = `
      <div class="panel calib">
        <div class="panel-head">
          <span class="kicker">${this.buttonsOnly ? 'Map buttons' : 'Calibrate sticks'} · ${this.step + 1}/${this.steps.length}</span>
          <h2>${current.title}</h2>
        </div>
        <p class="calib-body">${current.body}</p>
        ${this.buttonsOnly && this.currentBinding(current.id) !== undefined ? `<p class="hint">Currently: ${this.currentBinding(current.id) ? describeSwitch(this.currentBinding(current.id)!) : 'not set'}. Skip keeps it.</p>` : ''}
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
    this.root.querySelector('[data-cancel]')?.addEventListener('click', () => this.closeWizard());
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.go(this.step - 1));
    this.root.querySelector('[data-skip]')?.addEventListener('click', () => {
      // Remapping buttons: Skip keeps the current binding. Full setup: Skip means "none".
      if (this.buttonsOnly) this.go(this.step + 1);
      else {
        this.pending = null;
        this.commit();
      }
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
    this.step = Math.max(0, Math.min(this.steps.length - 1, step));
    this.pending = null;
    const raw = this.input.readRaw(this.padIndex);
    this.stepBaseline = raw;
    // Stepping back to a stick step re-detects it, so drop that assignment and any after it.
    const order: StickChannel[] = ['throttle', 'roll', 'pitch', 'yaw'];
    const id = this.steps[this.step]?.id;
    const idx = order.indexOf(id as StickChannel);
    if (idx >= 0) for (const ch of order.slice(idx)) delete this.assigned[ch];
    this.render();
  }

  private commit(): void {
    const id = this.steps[this.step]?.id;
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
      case 'weaponSwitch':
        this.weaponSwitch = this.pending && 'kind' in this.pending ? this.pending : null;
        break;
      case 'test': {
        const profile = this.buildProfile();
        if (profile) this.input.saveProfile(profile);
        this.closeWizard();
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
      weaponSwitch: this.weaponSwitch,
      sensitivity: this.sensitivity,
    };
  }

  /** The saved binding for a button step, or undefined for steps that aren't buttons. */
  private currentBinding(id: StepId): SwitchBinding | null | undefined {
    if (id === 'arm') return this.arm;
    if (id === 'reset') return this.reset;
    if (id === 'fire') return this.fire;
    if (id === 'special') return this.special;
    if (id === 'weaponSwitch') return this.weaponSwitch;
    return undefined;
  }

  /** Start from the controller's current profile (saved, default or guessed): sticks, bindings and feel. */
  private loadExisting(index: number): boolean {
    const { profile } = this.input.effectiveProfile(index);
    if (!profile) return false;
    for (const ch of ['throttle', 'roll', 'pitch', 'yaw'] as const) {
      const cal = profile.axes[ch];
      this.assigned[ch] = { axis: cal.axis, invert: cal.invert };
      this.rangeMin[cal.axis] = cal.min;
      this.rangeMax[cal.axis] = cal.max;
      this.center[cal.axis] = cal.center;
    }
    this.deadband = profile.deadband;
    this.arm = profile.arm;
    this.reset = profile.reset;
    this.fire = profile.fire ?? null;
    this.special = profile.special ?? null;
    this.weaponSwitch = profile.weaponSwitch ?? null;
    this.sensitivity = profile.sensitivity ?? 1;
    return true;
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
          <span class="tag">${KIND_TAG[p.kind]}</span>
        </button>`,
      )
      .join('');
    live.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (this.choosePad(Number(btn.dataset.pad))) this.go(1);
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
    const profile = this.buildProfile();
    if (profile) this.renderPreview(raw, profile);
  }

  /** Live bars for throttle/roll/pitch/yaw as the game will see them, plus switch states. */
  private renderPreview(raw: RawSnapshot, profile: ControllerProfile): void {
    const live = this.root.querySelector('.calib-live');
    if (!live) return;
    const stick = (ch: 'roll' | 'pitch' | 'yaw') =>
      applySensitivity(normalizeStick(raw.axes[profile.axes[ch].axis] ?? 0, profile.axes[ch], profile.deadband), profile.sensitivity);
    const values: [string, number, boolean][] = [
      ['Throttle', normalizeThrottle(raw.axes[profile.axes.throttle.axis] ?? 0, profile.axes.throttle), false],
      ['Roll', stick('roll'), true],
      ['Pitch', stick('pitch'), true],
      ['Yaw', stick('yaw'), true],
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
    const specialText = profile.special ? (readSwitch(profile.special, raw) ? 'PRESSED' : 'off') : 'E key';
    const switchText = profile.weaponSwitch ? (readSwitch(profile.weaponSwitch, raw) ? 'PRESSED' : 'off') : 'Q key';
    sw.textContent = `Arm: ${armText} · Reset: ${resetText} · Fire: ${fireText} · Special: ${specialText} · Switch: ${switchText}`;
  }

  // --- Hub

  private renderHub(): void {
    const pads = this.input.listGamepads();
    const pad = pads.find((p) => p.index === this.hubPad) ?? pads[0];
    this.hubPad = pad?.index ?? -1;
    this.hubKey = pads.map((p) => p.index + p.id + p.kind).join('|');
    const { profile, kind } = pad ? this.input.effectiveProfile(pad.index) : { profile: null, kind: 'none' as ProfileKind };
    const sens = profile?.sensitivity ?? 1;
    const db = profile?.deadband ?? INPUT.deadband;
    this.root.innerHTML = `
      <div class="panel calib">
        <div class="panel-head"><span class="kicker">Controller setup</span><h2>${pad ? escapeHtml(shortName(pad.id)) : 'No controller'}</h2></div>
        ${
          pads.length > 1
            ? `<div class="calib-pads">${pads.map((p) => `<button class="pad-choice ${p.index === this.hubPad ? 'on' : ''}" data-hub-pad="${p.index}"><span class="pad-name">${escapeHtml(shortName(p.id))}</span><span class="tag">${KIND_TAG[p.kind]}</span></button>`).join('')}</div>`
            : ''
        }
        <p class="calib-body">${pad ? KIND_TEXT[kind] : 'Plug in your radio or gamepad over USB, then <b>move a stick</b>.'}</p>
        ${
          pad
            ? `<div class="calib-parts">
          <button class="btn" data-sticks>Calibrate sticks</button>
          <button class="btn ${profile ? '' : 'ghost'}" data-buttons ${profile ? '' : 'disabled'}>Map buttons</button>
        </div>
        <div class="calib-sub">Stick feel</div>
        <label class="field">Sensitivity <input type="range" min="${SENSITIVITY_RANGE.min}" max="${SENSITIVITY_RANGE.max}" step="0.05" value="${sens}" data-sens ${profile ? '' : 'disabled'}><span data-sens-value>${Math.round(sens * 100)}%</span></label>
        <label class="field">Deadband <input type="range" min="0" max="0.15" step="0.005" value="${db}" data-db ${profile ? '' : 'disabled'}><span data-db-value>${db.toFixed(3)}</span></label>
        <div class="calib-live"></div>`
            : ''
        }
        <div class="actions">
          ${kind === 'saved' ? '<button class="btn ghost" data-reset-profile>Reset to defaults</button>' : ''}
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.onClose());
    this.root.querySelector('[data-sticks]')?.addEventListener('click', () => this.openSticks(this.hubPad));
    this.root.querySelector('[data-buttons]')?.addEventListener('click', () => this.openButtons(this.hubPad));
    this.root.querySelectorAll<HTMLButtonElement>('[data-hub-pad]').forEach((b) =>
      b.addEventListener('click', () => this.openHub(Number(b.dataset.hubPad))),
    );
    this.root.querySelector('[data-reset-profile]')?.addEventListener('click', () => {
      if (pad) this.input.deleteProfile(pad.id);
      this.openHub(this.hubPad);
    });
    // Stick feel saves as you slide (a default or guessed layout becomes your saved setup).
    const feel = (key: 'sensitivity' | 'deadband', input: HTMLInputElement, label: string, format: (v: number) => string) => {
      input.addEventListener('input', () => {
        const current = this.input.effectiveProfile(this.hubPad).profile;
        if (!current) return;
        const value = Number(input.value);
        this.input.saveProfile({ ...current, [key]: value });
        const el = this.root.querySelector(label);
        if (el) el.textContent = format(value);
      });
    };
    const sensInput = this.root.querySelector<HTMLInputElement>('[data-sens]');
    const dbInput = this.root.querySelector<HTMLInputElement>('[data-db]');
    if (sensInput) feel('sensitivity', sensInput, '[data-sens-value]', (v) => `${Math.round(v * 100)}%`);
    if (dbInput) feel('deadband', dbInput, '[data-db-value]', (v) => v.toFixed(3));
  }

  private tickHub(): void {
    const pads = this.input.listGamepads();
    const key = pads.map((p) => p.index + p.id + p.kind).join('|');
    // Re-render when controllers come and go (but not when a slider just saved: the kind stays put).
    if (key !== this.hubKey && !this.root.querySelector('input[type=range]:active')) this.renderHub();
    if (this.hubPad < 0) return;
    const raw = this.input.readRaw(this.hubPad);
    const { profile } = this.input.effectiveProfile(this.hubPad);
    if (raw && profile) this.renderPreview(raw, profile);
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

const KIND_TAG: Record<ProfileKind, string> = { saved: 'set up', default: 'gamepad', guessed: 'guessed', none: 'new' };

const KIND_TEXT: Record<ProfileKind, string> = {
  saved: 'Using <b>your setup</b>. Recalibrate the sticks or remap buttons separately: each keeps the other.',
  default: 'Using the <b>standard gamepad layout</b>: left stick throttle/yaw, right stick pitch/roll, RT fire, LT special, Y reset. It works as is; adjust the feel below or remap buttons.',
  guessed: 'Using a <b>guessed gamepad layout</b> (left stick throttle/yaw, right stick pitch/roll, RT fire, LT special). Check the bars below; if a stick is wrong, Calibrate sticks.',
  none: 'Not set up yet. <b>Calibrate sticks</b> first, then map your buttons.',
};

/** Gamepad ids are long ("Logitech Dual Action (STANDARD GAMEPAD Vendor: 046d Product: c216)"): keep the name. */
function shortName(id: string): string {
  return id.replace(/\s*\(.*\)\s*$/, '').trim() || id;
}

function describeSwitch(s: SwitchBinding): string {
  return s.kind === 'button' ? `button ${s.index}` : `axis ${s.index} switch`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
