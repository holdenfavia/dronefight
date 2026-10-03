// All game-feel tunables live here (CLAUDE.md: no magic numbers for rates, physics or timings).

export const SIM = {
  /** Fixed physics rate. Flight model and Rapier step together (ADR-0008). */
  hz: 500,
  /** Longest frame we will simulate. Anything longer (tab hidden, hitch) is dropped, not caught up. */
  maxFrameSeconds: 0.1,
  gravity: 9.81,
} as const;

/** Quad flight parameters. Freestyle and 3D share the model; 3D adds reversible thrust (ADR-0013). */
export interface QuadParams {
  massKg: number;
  halfExtents: { x: number; y: number; z: number };
  thrustToWeight: number;
  throttleExponent: number;
  idleThrust: number;
  motorTau: number;
  rateTau: number;
  dragQuadratic: { x: number; y: number; z: number };
  dragLinear: number;
  propWash: { startSpeed: number; fullSpeed: number; maxDegPerSec: number };
  /** Present for 3D mode: throttle center is zero thrust, below center reverses the motors. */
  threeD?: {
    /** Reverse thrust as a fraction of forward (symmetric 3D props are less efficient). */
    reverseEfficiency: number;
    /** Half-width of the zero-thrust band around center, as a fraction of stick travel. */
    centerDeadband: number;
  };
}

/** A 5" freestyle quad, roughly. */
export const QUAD: QuadParams = {
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
    startSpeed: 4,
    /** Descent speed where wash reaches full strength. */
    fullSpeed: 12,
    /** Peak angular-rate disturbance (deg/s). Cut from 90 at the pilots' request: barely a shimmer now. Set 0 to remove. */
    maxDegPerSec: 12,
  },
};

/** 3D quad (ADR-0013): lighter build, bidirectional motors, slower to reverse direction. */
export const QUAD_3D: QuadParams = {
  ...QUAD,
  massKg: 0.6,
  thrustToWeight: 7,
  // Reversing a motor takes longer than spooling one way.
  motorTau: 0.035,
  // Symmetric frame: top and bottom faces are similar.
  dragQuadratic: { x: 0.012, y: 0.02, z: 0.012 },
  idleThrust: 0,
  threeD: { reverseEfficiency: 0.7, centerDeadband: 0.04 },
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
  /** Horizontal field of view in degrees. */
  fovHorizontalDeg: 120,
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
