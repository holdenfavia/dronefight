import { CAMERA_DEFAULTS, DEFAULT_RATES, type FlightAssist, type Rates } from './config';
import { DEFAULT_DRONE, DRONE_ORDER, isDroneClassId, type DroneClassId } from '../../shared/drones';
import { cleanLoadout, defaultLoadout, type Loadout } from '../../shared/loadout';
import { DEFAULT_MAP, isMapId, type MapId } from '../../shared/maps';
import { cleanRoomOptions, defaultRoomOptions, type RoomOptions } from '../../shared/roomOptions';
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
  /** Flight assist for quads (ADR-0045): Acro unless you turn one on, on every input (ADR-0050). */
  flightAssist: FlightAssist;
  /** Touch controls (ADR-0044). */
  touch: TouchSettings;
  /** The match settings you last created a room with (ADR-0046). */
  roomOptions: RoomOptions;
}

/** Touch controls (ADR-0044): saved per device. */
export interface TouchSettings {
  /** Floating sticks appear under your thumbs; fixed sticks sit in the bottom corners. */
  sticks: 'floating' | 'fixed';
  /** Stick size and sensitivity, as multipliers (0.6..1.6). */
  stickSize: number;
  sensitivity: number;
  /** Left-handed: aim with the left thumb. */
  swap: boolean;
  cornerTriggers: boolean;
  secondFingerFire: boolean;
  /** Guns fire while the lead circle is on a target. */
  autoFire: boolean;
  /** Tap Fire to keep firing, tap again to stop. */
  triggerLock: boolean;
  /** Control opacity (0.2..1) and trigger size multiplier (0.6..1.6). */
  opacity: number;
  buttonSize: number;
  /** Your own arrangement from the layout editor, or null for the default (ADR-0044). */
  layout: TouchLayout | null;
}

/** A spot or box on screen, as fractions of the screen's width and height (fits any device). */
export interface TouchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the touch controls sit (layout editor, ADR-0044): triggers, menu button, and fixed stick centers. */
export interface TouchLayout {
  fire: TouchRect;
  special: TouchRect;
  menu: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
}

/** A saved layout, or null if it's missing or malformed. */
export function cleanTouchLayout(raw: unknown): TouchLayout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, Record<string, unknown>>;
  const frac = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -0.5 && v <= 1.5;
  const pt = (o: Record<string, unknown> | undefined) => !!o && frac(o.x) && frac(o.y);
  const rect = (o: Record<string, unknown> | undefined) => pt(o) && frac(o!.w) && frac(o!.h);
  if (!rect(r.fire) || !rect(r.special) || !pt(r.menu) || !pt(r.left) || !pt(r.right)) return null;
  return raw as TouchLayout;
}

export const DEFAULT_TOUCH: TouchSettings = {
  sticks: 'fixed',
  stickSize: 1,
  sensitivity: 1,
  swap: false,
  cornerTriggers: true,
  secondFingerFire: true,
  autoFire: false,
  triggerLock: false,
  opacity: 0.6,
  buttonSize: 1,
  layout: null,
};

const ASSISTS = ['acro', 'horizon', 'angle'] as const;

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
    flightAssist: 'acro',
    touch: { ...DEFAULT_TOUCH },
    roomOptions: defaultRoomOptions(DEFAULT_MAP),
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
    flightAssist: ASSISTS.includes(saved.flightAssist as (typeof ASSISTS)[number]) ? (saved.flightAssist as Settings['flightAssist']) : d.flightAssist,
    touch: { ...d.touch, ...saved.touch, layout: cleanTouchLayout(saved.touch?.layout) },
    roomOptions: cleanRoomOptions(saved.roomOptions, d.map),
  };
}

/** Pilots still on the old default FOV move to the new one (ADR-0040); a FOV you picked yourself stays. */
function fovMigration(fov: number | undefined): { fovHorizontalDeg?: number } {
  return fov === CAMERA_DEFAULTS.oldFovHorizontalDeg ? { fovHorizontalDeg: CAMERA_DEFAULTS.fovHorizontalDeg } : {};
}

export function saveSettings(settings: Settings): void {
  saveJson(KEY, settings);
}
