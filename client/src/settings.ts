import { CAMERA_DEFAULTS, DEFAULT_RATES, type Rates } from './config';
import { DEFAULT_DRONE, isDroneClassId, type DroneClassId } from '../../shared/drones';
import { DEFAULT_MAP, isMapId, type MapId } from '../../shared/maps';
import { loadJson, saveJson } from './storage';

export type CameraView = 'fpv' | 'chase';

export interface Settings {
  rates: Rates;
  camera: { uptiltDeg: number; fovHorizontalDeg: number; view: CameraView };
  graphics: { shadows: boolean; showDebug: boolean; gridTextures: boolean };
  /** Master volume, then your own drone vs other pilots (0..1 each). */
  audio: { volume: number; own: number; others: number; muted: boolean };
  /** Map for solo play and for rooms you create (ADR-0012). */
  map: MapId;
  /** Drone class to fly (ADR-0013). */
  drone: DroneClassId;
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
    graphics: { shadows: true, showDebug: true, gridTextures: false },
    audio: { volume: 0.7, own: 0.8, others: 1, muted: false },
    map: DEFAULT_MAP,
    drone: DEFAULT_DRONE,
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
    map: isMapId(saved.map) ? saved.map : d.map,
    drone: isDroneClassId(saved.drone) ? saved.drone : d.drone,
  };
}

export function saveSettings(settings: Settings): void {
  saveJson(KEY, settings);
}
