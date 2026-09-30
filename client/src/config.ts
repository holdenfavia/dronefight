// All game-feel tunables live here (CLAUDE.md: no magic numbers for rates, physics or timings).

export const SIM = {
  /** Fixed physics rate. Flight model and Rapier step together (ADR-0008). */
  hz: 500,
  /** Longest frame we will simulate. Anything longer (tab hidden, hitch) is dropped, not caught up. */
  maxFrameSeconds: 0.1,
  gravity: 9.81,
} as const;

/** A 5" freestyle quad, roughly. */
export const QUAD = {
  massKg: 0.65,
  /** Collision box half-extents in metres (x = right, y = up, z = forward). */
  halfExtents: { x: 0.12, y: 0.035, z: 0.12 },
  /** Max static thrust divided by weight. */
  thrustToWeight: 8,
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
  /**
   * Quadratic drag coefficients per body axis (N per (m/s)^2).
   * The flat top/bottom face (y) catches much more air than the edges.
   */
  dragQuadratic: { x: 0.012, y: 0.022, z: 0.011 },
  /** Linear drag (N per m/s). Small: too much makes slow flight feel floaty. */
  dragLinear: 0.008,
  /** Prop wash: random torque shake when descending through your own disturbed air. */
  propWash: {
    /** Descent speed along body-down (m/s) where wash starts. */
    startSpeed: 2,
    /** Descent speed where wash reaches full strength. */
    fullSpeed: 8,
    /** Peak angular-rate disturbance (deg/s). */
    maxDegPerSec: 90,
  },
} as const;

export const CRASH = {
  /** Instant change in velocity (m/s) within one physics step that counts as a crash. */
  impactDeltaV: 7,
  /** Seconds before an automatic respawn after a crash. */
  autoResetSeconds: 2.5,
} as const;

/** Drones are drawn bigger than their 5" physics body so they're readable targets (ADR-0011). */
export const DRONE_VISUAL = {
  /** Model scale. The base model is ~0.31 m across, so 4.8 draws ~1.5 m. */
  scale: 4.8,
  /** Glow sprite size as a fraction of screen height, so it stays visible at any distance. */
  glowScreenSize: 0.05,
  /** Trail length in seconds, and its width in metres. */
  trailSeconds: 1.6,
  trailWidth: 0.9,
} as const;

export const CAMERA_DEFAULTS = {
  /** FPV camera uptilt in degrees. */
  uptiltDeg: 30,
  /** Horizontal field of view in degrees. */
  fovHorizontalDeg: 120,
  near: 0.05,
  far: 1200,
  /** Chase-camera offset behind and above the quad (metres). Debug/spectate view. */
  chaseDistance: 7,
  chaseHeight: 2,
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
