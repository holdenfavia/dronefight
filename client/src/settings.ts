import { CAMERA_DEFAULTS, DEFAULT_RATES, type Rates } from './config';
import { loadJson, saveJson } from './storage';

export type CameraView = 'fpv' | 'chase';

export interface Settings {
  rates: Rates;
  camera: { uptiltDeg: number; fovHorizontalDeg: number; view: CameraView };
  graphics: { shadows: boolean; showDebug: boolean };
  audio: { volume: number; muted: boolean };
}

const KEY = 'settings';

export function defaultSettings(): Settings {
  return {
    rates: structuredClone(DEFAULT_RATES),
    camera: {
      uptiltDeg: CAMERA_DEFAULTS.uptiltDeg,
      fovHorizontalDeg: CAMERA_DEFAULTS.fovHorizontalDeg,
      view: 'fpv',
    },
    graphics: { shadows: true, showDebug: true },
    audio: { volume: 0.7, muted: false },
  };
}

/** Load saved settings, filling any missing fields from defaults (older saves stay valid). */
export function loadSettings(): Settings {
  const d = defaultSettings();
  const saved = loadJson<Partial<Settings>>(KEY, {});
  return {
    rates: {
      roll: { ...d.rates.roll, ...saved.rates?.roll },
      pitch: { ...d.rates.pitch, ...saved.rates?.pitch },
      yaw: { ...d.rates.yaw, ...saved.rates?.yaw },
    },
    camera: { ...d.camera, ...saved.camera },
    graphics: { ...d.graphics, ...saved.graphics },
    audio: { ...d.audio, ...saved.audio },
  };
}

export function saveSettings(settings: Settings): void {
  saveJson(KEY, settings);
}
