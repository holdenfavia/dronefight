import { CAMERA_DEFAULTS, DEFAULT_RATES, type Rates } from './config';
import { DEFAULT_DRONE, DRONE_ORDER, isDroneClassId, type DroneClassId } from '../../shared/drones';
import { cleanLoadout, defaultLoadout, type Loadout } from '../../shared/loadout';
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
  /** Drone body to fly (ADR-0013), and the loadout you built for each body (ADR-0033). */
  drone: DroneClassId;
  loadouts: Record<DroneClassId, Loadout>;
}

/** The loadout you fly now: your build for the selected body. */
export function currentLoadout(s: Settings): Loadout {
  return s.loadouts[s.drone];
}

function allDefaults(): Record<DroneClassId, Loadout> {
  return Object.fromEntries(DRONE_ORDER.map((id) => [id, defaultLoadout(id)])) as Record<DroneClassId, Loadout>;
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
    loadouts: allDefaults(),
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
    camera: { ...d.camera, ...saved.camera, ...fovMigration(saved.camera?.fovHorizontalDeg) },
    graphics: { ...d.graphics, ...saved.graphics },
    audio: { ...d.audio, ...saved.audio },
    map: isMapId(saved.map) ? saved.map : d.map,
    drone: isDroneClassId(saved.drone) ? saved.drone : d.drone,
    // Each saved build is re-validated (older saves, or modules that changed) and keeps its body.
    loadouts: Object.fromEntries(
      DRONE_ORDER.map((id) => [id, saved.loadouts?.[id] ? cleanLoadout({ ...saved.loadouts[id], body: id }, id) : d.loadouts[id]]),
    ) as Record<DroneClassId, Loadout>,
  };
}

/** Pilots still on the old default FOV move to the new one (ADR-0040); a FOV you picked yourself stays. */
function fovMigration(fov: number | undefined): { fovHorizontalDeg?: number } {
  return fov === CAMERA_DEFAULTS.oldFovHorizontalDeg ? { fovHorizontalDeg: CAMERA_DEFAULTS.fovHorizontalDeg } : {};
}

export function saveSettings(settings: Settings): void {
  saveJson(KEY, settings);
}
