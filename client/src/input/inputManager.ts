import { INPUT } from '../config';
import type { FlightInput } from '../sim/flightModel';
import { loadJson, saveJson } from '../storage';
import {
  normalizeStick,
  normalizeThrottle,
  readSwitch,
  standardGamepadProfile,
  type ControllerProfile,
  type RawSnapshot,
} from './calibration';

/**
 * The input layer (ADR-0006, Hard rule 3). This is the ONLY module that reads navigator.getGamepads().
 * Everything else consumes the normalized ControlState.
 */

export interface ControlState extends FlightInput {
  /** Arm switch position, or null if no arm switch is mapped (auto-arm on low throttle). */
  armSwitch: boolean | null;
  /** True for one poll when reset is pressed. */
  resetPressed: boolean;
  /** Fire held (ADR-0009). */
  fire: boolean;
  /** True for one poll when the class special (e.g. Cobra) is pressed (ADR-0014). */
  specialPressed: boolean;
}

export type InputSource = 'radio' | 'gamepad' | 'keyboard';

export interface GamepadInfo {
  index: number;
  id: string;
  standard: boolean;
  calibrated: boolean;
}

const PROFILES_KEY = 'controllerProfiles';
const SELECTED_KEY = 'selectedController';
/** Keyboard flight is for testing; full-rate digital sticks are unflyable. */
const KEYBOARD_STICK_SCALE = 0.45;

export class InputManager {
  readonly state: ControlState = {
    throttle: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    armSwitch: null,
    resetPressed: false,
    fire: false,
    specialPressed: false,
  };
  source: InputSource = 'keyboard';
  /** Gamepad.id of a connected controller with no profile yet, if that's all we have. */
  uncalibratedId: string | null = null;
  activeId: string | null = null;

  private profiles: Record<string, ControllerProfile> = loadJson(PROFILES_KEY, {});
  private selectedId: string | null = loadJson(SELECTED_KEY, null);
  private keys = new Set<string>();
  private keyboardThrottle = 0;
  private resetWasDown = false;
  private specialWasDown = false;
  private readonly rawScratch: { axes: number[]; buttons: number[] } = { axes: [], buttons: [] };

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  listGamepads(): GamepadInfo[] {
    const list: GamepadInfo[] = [];
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      list.push({
        index: pad.index,
        id: pad.id,
        standard: pad.mapping === 'standard',
        calibrated: pad.id in this.profiles,
      });
    }
    return list;
  }

  /** Raw values for the calibration screen only. Game code must use `state`. */
  readRaw(index: number): RawSnapshot | null {
    const pad = navigator.getGamepads()[index];
    if (!pad) return null;
    return { axes: [...pad.axes], buttons: pad.buttons.map((b) => b.value) };
  }

  getProfile(id: string): ControllerProfile | null {
    return this.profiles[id] ?? null;
  }

  saveProfile(profile: ControllerProfile): void {
    this.profiles[profile.id] = profile;
    saveJson(PROFILES_KEY, this.profiles);
    this.select(profile.id);
  }

  select(id: string): void {
    this.selectedId = id;
    saveJson(SELECTED_KEY, id);
  }

  poll(dt: number): ControlState {
    const pad = this.pickGamepad();
    const profile = pad ? this.profileFor(pad) : null;

    let resetDown: boolean;
    let specialDown: boolean;
    if (pad && profile) {
      this.readPad(pad, profile);
      this.source = pad.mapping === 'standard' && !(pad.id in this.profiles) ? 'gamepad' : 'radio';
      this.activeId = pad.id;
      this.uncalibratedId = null;
      resetDown = readSwitch(profile.reset, this.rawScratch) || this.keys.has('KeyR');
      this.state.fire = readSwitch(profile.fire ?? null, this.rawScratch) || this.keys.has('Space');
      specialDown = readSwitch(profile.special ?? null, this.rawScratch) || this.keys.has('KeyE');
    } else {
      this.readKeyboard(dt);
      this.source = 'keyboard';
      this.activeId = null;
      this.uncalibratedId = pad ? pad.id : null;
      resetDown = this.keys.has('KeyR');
      this.state.fire = this.keys.has('Space');
      specialDown = this.keys.has('KeyE');
    }

    this.state.resetPressed = resetDown && !this.resetWasDown;
    this.resetWasDown = resetDown;
    this.state.specialPressed = specialDown && !this.specialWasDown;
    this.specialWasDown = specialDown;
    return this.state;
  }

  private pickGamepad(): Gamepad | null {
    let firstCalibrated: Gamepad | null = null;
    let firstStandard: Gamepad | null = null;
    let firstAny: Gamepad | null = null;
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      if (pad.id === this.selectedId && (pad.id in this.profiles || pad.mapping === 'standard')) return pad;
      if (!firstCalibrated && pad.id in this.profiles) firstCalibrated = pad;
      if (!firstStandard && pad.mapping === 'standard') firstStandard = pad;
      if (!firstAny) firstAny = pad;
    }
    return firstCalibrated ?? firstStandard ?? firstAny;
  }

  private profileFor(pad: Gamepad): ControllerProfile | null {
    const saved = this.profiles[pad.id];
    if (saved) return saved;
    if (pad.mapping === 'standard') return standardGamepadProfile(pad.id, INPUT.deadband);
    return null;
  }

  private readPad(pad: Gamepad, profile: ControllerProfile): void {
    const raw = this.rawScratch;
    raw.axes.length = pad.axes.length;
    for (let i = 0; i < pad.axes.length; i++) raw.axes[i] = pad.axes[i] ?? 0;
    raw.buttons.length = pad.buttons.length;
    for (let i = 0; i < pad.buttons.length; i++) raw.buttons[i] = pad.buttons[i]?.value ?? 0;

    const { axes, deadband } = profile;
    const s = this.state;
    s.throttle = normalizeThrottle(raw.axes[axes.throttle.axis] ?? 0, axes.throttle);
    s.roll = normalizeStick(raw.axes[axes.roll.axis] ?? 0, axes.roll, deadband);
    s.pitch = normalizeStick(raw.axes[axes.pitch.axis] ?? 0, axes.pitch, deadband);
    s.yaw = normalizeStick(raw.axes[axes.yaw.axis] ?? 0, axes.yaw, deadband);
    s.armSwitch = profile.arm ? readSwitch(profile.arm, raw) : null;
  }

  private readKeyboard(dt: number): void {
    const k = this.keys;
    const axis = (pos: string, neg: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    const throttleDir = axis('KeyW', 'KeyS');
    this.keyboardThrottle = Math.max(
      0,
      Math.min(1, this.keyboardThrottle + throttleDir * INPUT.keyboardThrottlePerSec * dt),
    );
    const s = this.state;
    s.throttle = this.keyboardThrottle;
    s.yaw = axis('KeyD', 'KeyA') * KEYBOARD_STICK_SCALE;
    s.pitch = axis('ArrowUp', 'ArrowDown') * KEYBOARD_STICK_SCALE;
    s.roll = axis('ArrowRight', 'ArrowLeft') * KEYBOARD_STICK_SCALE;
    s.armSwitch = null;
  }

  /** Keyboard throttle snaps back to its rest position on respawn (center for a 3D quad, ADR-0013). */
  resetKeyboardThrottle(rest = 0): void {
    this.keyboardThrottle = rest;
  }
}
