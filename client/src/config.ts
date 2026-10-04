// All game-feel tunables live here (CLAUDE.md: no magic numbers for rates, physics or timings).

import { DEFAULT_LOADOUTS, thrustToWeight, totalKg } from '../../shared/loadout';

export const SIM = {
  /** Fixed physics rate. Flight model and Rapier step together (ADR-0008). */
  hz: 500,
  /** Longest frame we will simulate. Anything longer (tab hidden, hitch) is dropped, not caught up. */
  maxFrameSeconds: 0.1,
  gravity: 9.81,
} as const;

/** Quad flight parameters. Freestyle and 3D share the model; 3D adds reversible thrust (ADR-0013). */
export interface QuadParams {
  /** Weight of the body's default build (kg); a build's own weight replaces it (ADR-0040). */
  massKg: number;
  /**
   * The drawn model's bounding box in model units (half extents, and its center's height above the body
   * origin). The collider is this times the body's `visualScale`, so you collide at the size you see (ADR-0040).
   */
  modelBox: { half: { x: number; y: number; z: number }; centerY: number };
  thrustToWeight: number;
  throttleExponent: number;
  idleThrust: number;
  motorTau: number;
  rateTau: number;
  dragQuadratic: { x: number; y: number; z: number };
  dragLinear: number;
  propWash: { startSpeed: number; fullSpeed: number; maxDegPerSec: number };
  /**
   * Prop pitch speed (m/s): thrust fades as the air flowing into the props approaches it, reaching zero there
   * (ADR-0040). This, not drag, is what caps a real quad's top speed and its climb.
   */
  pitchSpeed: number;
  /** Present for 3D mode: throttle center is zero thrust, below center reverses the motors. */
  threeD?: {
    /** Reverse thrust as a fraction of forward (symmetric 3D props are less efficient). */
    reverseEfficiency: number;
    /** Half-width of the zero-thrust band around center, as a fraction of stick travel. */
    centerDeadband: number;
  };
  /**
   * Present for horizon mode (ADR-0037): near center stick, roll and pitch set a tilt angle and the drone
   * levels itself; the levelling fades out with stick travel, so full stick is plain acro (flips still work).
   */
  horizon?: {
    /** Tilt at full stick, if levelling were still on (deg). */
    maxAngleDeg: number;
    /** Rotation rate toward the target tilt per radian of error (1/s). */
    levelGain: number;
    /** Stick deflection (0..1) where levelling has faded out completely. */
    transition: number;
    /** Cap on the levelling rate (deg/s). */
    maxLevelDegPerSec: number;
  };
}

/**
 * How fast every quad falls flat with the throttle cut (m/s, ADR-0040). Flat-face drag is set from it, so
 * drops keep accelerating like a real quad's instead of parachuting (it was 16 m/s).
 */
export const FLAT_FALL_SPEED = 25;

/** Flat-face drag (N per (m/s)^2) that makes a quad fall flat at FLAT_FALL_SPEED, idle thrust included. */
function flatFaceDrag(massKg: number, tw: number, idleThrust: number, dragLinear: number): number {
  const v = FLAT_FALL_SPEED;
  return (massKg * SIM.gravity * (1 - idleThrust * tw) - dragLinear * v) / (v * v);
}

const FREESTYLE_KG = totalKg(DEFAULT_LOADOUTS.freestyle);
const FREESTYLE_TW = thrustToWeight(DEFAULT_LOADOUTS.freestyle);

/**
 * The Freestyle body. Mass and thrust are its default build's listed numbers (ADR-0040). Flat-face drag sets
 * the fall speed; prop pitch speed caps top speed; edge drag (from the 0.65 kg tuning, scaled) matters little.
 */
export const QUAD: QuadParams = {
  massKg: FREESTYLE_KG,
  /** createDroneModel(): 0.31 wide, -0.035 (hanging weapons) to 0.065 tall. x = right, y = up, z = forward. */
  modelBox: { half: { x: 0.156, y: 0.05, z: 0.156 }, centerY: 0.015 },
  /** Max static thrust divided by weight (the default build's). */
  thrustToWeight: FREESTYLE_TW,
  /** Tuned so a stock Freestyle tops out ~46 m/s and punches out ~41 m/s, like a fast real 5". */
  pitchSpeed: 75,
  /** thrust = max * throttle^exponent. 1.5 puts hover near 25% throttle, like a real 5". */
  throttleExponent: 1.5,
  /**
   * Airmode idle thrust as a fraction of max, applied while armed.
   * Real idle barely lifts anything: 0.006 is ~5% of weight, so zero throttle means dropping.
   */
  idleThrust: 0.006,
  /** Motor spool time constant (seconds). Modern ESCs and motors spool in ~20 ms. */
  motorTau: 0.02,
  /** How fast the quad's rotation tracks the rate setpoint (seconds). Stands in for a tuned PID loop. */
  rateTau: 0.01,
  /** Quadratic drag coefficients per body axis (N per (m/s)^2): edges (x, z) and the flat face (y). */
  dragQuadratic: { x: 0.0188, y: flatFaceDrag(FREESTYLE_KG, FREESTYLE_TW, 0.006, 0.0126), z: 0.0173 },
  /** Linear drag (N per m/s). Small: too much makes slow flight feel floaty. */
  dragLinear: 0.0126,
  /** Prop wash: random torque shake when descending through your own disturbed air. */
  propWash: {
    /** Descent speed along body-down (m/s) where wash starts. */
    startSpeed: 4,
    /** Descent speed where wash reaches full strength. */
    fullSpeed: 12,
    /** Peak angular-rate disturbance (deg/s). Cut from 90 at the pilots' request: barely a shimmer now. Set 0 to remove. */
    maxDegPerSec: 12,
  },
};

const QUAD3D_KG = totalKg(DEFAULT_LOADOUTS.quad3d);
const QUAD3D_TW = thrustToWeight(DEFAULT_LOADOUTS.quad3d);

/** 3D quad (ADR-0013): bidirectional motors, slower to reverse direction. Listed weight and thrust (ADR-0040). */
export const QUAD_3D: QuadParams = {
  ...QUAD,
  massKg: QUAD3D_KG,
  thrustToWeight: QUAD3D_TW,
  // Reversing a motor takes longer than spooling one way.
  motorTau: 0.035,
  // Symmetric frame; edges scaled from the 0.6 kg tuning to the real weight.
  dragQuadratic: { x: 0.021, y: flatFaceDrag(QUAD3D_KG, QUAD3D_TW, 0, 0.014), z: 0.021 },
  dragLinear: 0.014,
  idleThrust: 0,
  threeD: { reverseEfficiency: 0.7, centerDeadband: 0.04 },
};

const RACER_KG = totalKg(DEFAULT_LOADOUTS.racer);
const RACER_TW = thrustToWeight(DEFAULT_LOADOUTS.racer);

/** The racer (ADR-0033): light and twitchy, the Freestyle model drawn small. Listed weight and thrust (ADR-0040). */
export const RACER: QuadParams = {
  ...QUAD,
  massKg: RACER_KG,
  thrustToWeight: RACER_TW,
  motorTau: 0.015,
  rateTau: 0.007,
  // Edges scaled from the 0.35 kg tuning to the real weight.
  dragQuadratic: { x: 0.0094, y: flatFaceDrag(RACER_KG, RACER_TW, 0.006, 0.0067), z: 0.0094 },
  dragLinear: 0.0067,
};

const X8_KG = totalKg(DEFAULT_LOADOUTS.x8);
const X8_TW = thrustToWeight(DEFAULT_LOADOUTS.x8);

/** X8 heavy lifter (ADR-0033): eight motors, big, slow to turn. Listed weight and thrust (ADR-0040). */
export const X8: QuadParams = {
  ...QUAD,
  massKg: X8_KG,
  /** createX8Model(): 0.5 wide, -0.06 (hanging weapons) to 0.085 tall. */
  modelBox: { half: { x: 0.249, y: 0.0725, z: 0.249 }, centerY: 0.0125 },
  thrustToWeight: X8_TW,
  motorTau: 0.04,
  rateTau: 0.03,
  // Edges scaled from the 1.6 kg tuning to the real weight.
  dragQuadratic: { x: 0.0518, y: flatFaceDrag(X8_KG, X8_TW, 0.006, 0.0359), z: 0.0518 },
  dragLinear: 0.0359,
  // Always flies in horizon mode (ADR-0037): a stable gun platform, not a dodger.
  horizon: { maxAngleDeg: 55, levelGain: 7, transition: 0.75, maxLevelDegPerSec: 300 },
};

export const CRASH = {
  /** Instant change in velocity (m/s) within one physics step that counts as a crash. */
  impactDeltaV: 7,
  /** Seconds before an automatic respawn after a crash. */
  autoResetSeconds: 2.5,
} as const;

/** How other drones are made readable (ADR-0011). Per-class draw scale is in shared/drones.ts (ADR-0013). */
export const DRONE_VISUAL = {
  /** Glow sprite size as a fraction of screen height, so it stays visible at any distance. */
  glowScreenSize: 0.05,
  /** Trail length in seconds, and its width in metres. */
  trailSeconds: 1.6,
  trailWidth: 2.7,
} as const;

export const CAMERA_DEFAULTS = {
  /** FPV camera uptilt in degrees. */
  uptiltDeg: 30,
  /** Horizontal field of view in degrees (ADR-0040: 105, like competitive shooters; was 120). */
  fovHorizontalDeg: 105,
  /** The old default: saved settings still on it move to the new one. */
  oldFovHorizontalDeg: 120,
  near: 0.05,
  far: 1200,
  /** Chase-camera offset behind and above the quad (metres). Debug/spectate view. */
  chaseDistance: 14,
  chaseHeight: 4,
} as const;

/** Betaflight classic rates (RC rate, super rate, expo) per axis. */
export interface AxisRates {
  rcRate: number;
  superRate: number;
  expo: number;
}

export interface Rates {
  roll: AxisRates;
  pitch: AxisRates;
  yaw: AxisRates;
}

export const DEFAULT_RATES: Rates = {
  roll: { rcRate: 1.0, superRate: 0.7, expo: 0.0 },
  pitch: { rcRate: 1.0, superRate: 0.7, expo: 0.0 },
  yaw: { rcRate: 1.0, superRate: 0.7, expo: 0.0 },
};

export const INPUT = {
  /** Default stick deadband as a fraction of stick travel. */
  deadband: 0.02,
  /** Throttle must be below this to arm. */
  armThrottleMax: 0.05,
  /** Keyboard throttle change per second while a key is held. */
  keyboardThrottlePerSec: 0.6,
} as const;
