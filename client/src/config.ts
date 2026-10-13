// All game-feel tunables live here (CLAUDE.md: no magic numbers for rates, physics or timings).

export const SIM = {
  /** Fixed physics rate. Flight model and Rapier step together (ADR-0008). */
  hz: 500,
  /** Longest frame we will simulate. Anything longer (tab hidden, hitch) is dropped, not caught up. */
  maxFrameSeconds: 0.1,
  gravity: 9.81,
  /**
   * Only map boxes near the drone are in the physics world (each collider costs Rapier time every step, even far
   * away). Grid cell size (m), and how many cells around the drone's cell are loaded: 20 m x 2 keeps everything
   * within 40-60 m, far more than a quad covers in one frame.
   */
  colliderCellSize: 20,
  colliderReachCells: 2,
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
  /**
   * Prop pitch speed (m/s, ADR-0052): thrust fades as air flows into the props this fast, reaching zero there.
   * With little drag, this is what caps top speed and climb, as on a real quad.
   */
  pitchSpeed: number;
  /**
   * Rotor drag (ADR-0061): air crossing a spinning prop disc sideways tilts the blades back (flapping) and
   * pushes against the motion, in proportion to thrust and to the crossing speed over the blade tip speed.
   * This is what makes a real quad's velocity follow where it points instead of sliding.
   */
  rotorDrag: {
    /** Blade flapping gain: in-plane force = flapping * thrust * (crossing speed / tip speed). */
    flapping: number;
    /** Blade tip speed at full thrust (m/s); tip speed goes with the square root of thrust. */
    tipSpeed: number;
  };
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
 * Air resistance (ADR-0042, ADR-0061): drag = 1/2 * air density * CdA * v^2, per body axis, at full strength.
 * The 5" freestyle's drag areas (CdA, m^2) are those of a real 5"; every other quad scales
 * them by its own projected areas (QUAD_AREAS, measured off client/src/render/droneModel.ts).
 */
export const AIR = {
  /** Sea-level air density (kg/m^3). */
  density: 1.225,
} as const;

/** The 5" freestyle's drag area (Cd x projected area, m^2) seen from the side (x), above (y) and front (z). */
export const FREESTYLE_DRAG_AREA = { x: 0.0095, y: 0.019, z: 0.0085 } as const;

/** Projected areas (m^2) of each quad from above (y), the front (z) and the side (x). Only their ratios matter. */
export const QUAD_AREAS = {
  /** 5" freestyle: crossed arms 0.011, stack and battery 0.0018 more, motors 0.002, 12 blades 0.0085. */
  freestyle: { top: 0.0233, front: 0.0068, side: 0.0085 },
  /** Same frame, plus a second battery underneath (shows from the front and side). */
  quad3d: { top: 0.0233, front: 0.0079, side: 0.0108 },
  /** The racer: the same layout at 3" size (2/3 the span, so 0.44x the area). */
  racer: { top: 0.0104, front: 0.003, side: 0.0038 },
  /** X8: long arms 0.025, plate 0.009 more, motors 0.005, blades of 4 coaxial pairs 0.021. */
  x8: { top: 0.06, front: 0.02, side: 0.023 },
} as const;

/** Quadratic drag per body axis (N per (m/s)^2) for a body with these projected areas, based on the 5". */
function shapeDrag(a: { top: number; front: number; side: number }): QuadParams['dragQuadratic'] {
  const f = QUAD_AREAS.freestyle;
  const q = 0.5 * AIR.density;
  return {
    x: q * FREESTYLE_DRAG_AREA.x * (a.side / f.side),
    y: q * FREESTYLE_DRAG_AREA.y * (a.top / f.top),
    z: q * FREESTYLE_DRAG_AREA.z * (a.front / f.front),
  };
}

/** A 5" freestyle quad, roughly. */
export const QUAD: QuadParams = {
  massKg: 0.65,
  /** Collision box half-extents in metres (x = right, y = up, z = forward). */
  halfExtents: { x: 0.12, y: 0.035, z: 0.12 },
  /** Max static thrust divided by weight: 10, a 6S 1950 kV 5" on 5x4.5" tri-blades (ADR-0061). */
  thrustToWeight: 10,
  /**
   * thrust = max * throttle^exponent (ADR-0061). Thrust goes with rpm squared and rpm with throttle, so 2:
   * hover sits near 32% throttle and the top half of the stick has the punch.
   */
  throttleExponent: 2,
  /**
   * Airmode idle thrust as a fraction of max, applied while armed: 5.5% motor idle, squared.
   * Real idle barely lifts anything (~3% of weight), so zero throttle means dropping.
   */
  idleThrust: 0.003,
  /** Motor spool time constant (seconds). Modern ESCs and motors spool in ~20 ms. */
  motorTau: 0.012,
  /** How fast the quad's rotation tracks the rate setpoint (seconds). Stands in for a tuned PID loop. */
  rateTau: 0.006,
  pitchSpeed: 62,
  /** 5x4.5" tri-blades: flapping gain 2, tips at ~213 m/s (32,000 rpm) at full thrust. */
  rotorDrag: { flapping: 2, tipSpeed: 213 },
  /** Quadratic drag per body axis (N per (m/s)^2), from the model's shape (ADR-0042, ADR-0061). */
  dragQuadratic: shapeDrag(QUAD_AREAS.freestyle),
  /** Linear drag (N per m/s): idling props and the frame resisting airflow. Small; rotor drag does the rest. */
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
  motorTau: 0.024,
  dragQuadratic: shapeDrag(QUAD_AREAS.quad3d),
  idleThrust: 0,
  threeD: { reverseEfficiency: 0.7, centerDeadband: 0.04 },
};

/**
 * 3" racer (ADR-0033): light and twitchy. Physics mass and thrust-to-weight are for its default loadout;
 * other loadouts scale them (shared/loadout.ts loadFactor).
 */
export const RACER: QuadParams = {
  ...QUAD,
  massKg: 0.35,
  halfExtents: { x: 0.08, y: 0.03, z: 0.08 },
  thrustToWeight: 8,
  motorTau: 0.009,
  rateTau: 0.004,
  dragQuadratic: shapeDrag(QUAD_AREAS.racer),
  dragLinear: 0.005,
};

/** X8 heavy lifter (ADR-0033): eight motors, big, slow to turn. */
export const X8: QuadParams = {
  ...QUAD,
  massKg: 1.6,
  halfExtents: { x: 0.2, y: 0.06, z: 0.2 },
  thrustToWeight: 4,
  motorTau: 0.028,
  rateTau: 0.02,
  dragQuadratic: shapeDrag(QUAD_AREAS.x8),
  dragLinear: 0.018,
  // Always flies in horizon mode (ADR-0037, ADR-0045): a stable gun platform, not a dodger.
  horizon: { maxAngleDeg: 55, levelGain: 7, transition: 0.75, maxLevelDegPerSec: 300 },
};

/** Flight assist a pilot can choose for quads (ADR-0045); Acro (none) unless they turn one on (ADR-0050). */
export type FlightAssist = 'acro' | 'horizon' | 'angle';

/**
 * Self-levelling for each assist (ADR-0045), in the same form as the X8's horizon mode. Angle never fades
 * out (an infinite transition), so the stick only ever sets a tilt and the drone can't flip.
 */
export const FLIGHT_ASSIST: Record<Exclude<FlightAssist, 'acro'>, NonNullable<QuadParams['horizon']>> = {
  horizon: { maxAngleDeg: 55, levelGain: 7, transition: 0.75, maxLevelDegPerSec: 300 },
  angle: { maxAngleDeg: 45, levelGain: 7, transition: Infinity, maxLevelDegPerSec: 300 },
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
  trailWidth: 0.5,
} as const;

export const CAMERA_DEFAULTS = {
  /** FPV camera uptilt in degrees. */
  uptiltDeg: 30,
  /** Horizontal field of view in degrees (ADR-0040: 105, like competitive shooters; was 120). */
  fovHorizontalDeg: 105,
  /** The old default: saved settings still on it move to the new one. */
  oldFovHorizontalDeg: 120,
  near: 0.05,
  far: 2000,
  /** Chase-camera offset behind and above the quad (metres). Debug/spectate view. */
  chaseDistance: 2.2,
  chaseHeight: 0.7,
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
