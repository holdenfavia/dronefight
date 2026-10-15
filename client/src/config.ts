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

/**
 * Self-levelling (ADR-0037, ADR-0045): near center stick, roll and pitch set a tilt angle and the drone levels
 * itself; the levelling fades out with stick travel, so full stick is plain acro (flips still work).
 */
export interface HorizonParams {
  /** Tilt at full stick, if levelling were still on (deg). */
  maxAngleDeg: number;
  /** Rotation rate toward the target tilt per radian of error (1/s). */
  levelGain: number;
  /** Stick deflection (0..1) where levelling has faded out completely. */
  transition: number;
  /** Cap on the levelling rate (deg/s). */
  maxLevelDegPerSec: number;
}

/** Flight assist a pilot can choose for quads (ADR-0045); Acro (none) unless they turn one on (ADR-0050). */
export type FlightAssist = 'acro' | 'horizon' | 'angle';

/**
 * Self-levelling for each assist (ADR-0045), in the same form as the X8's horizon mode. Angle never fades
 * out (an infinite transition), so the stick only ever sets a tilt and the drone can't flip.
 */
export const FLIGHT_ASSIST: Record<Exclude<FlightAssist, 'acro'>, HorizonParams> = {
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

/**
 * Betaflight's rate types (ADR-0068). The three numbers per axis are what Betaflight Configurator shows for
 * that type: Betaflight = RC rate, super rate, expo; Actual = center rate (°/s), max rate (°/s), expo;
 * Quick = RC rate, max rate (°/s), expo.
 */
export type RateType = 'betaflight' | 'actual' | 'quick';

export interface AxisRates {
  rcRate: number;
  superRate: number;
  expo: number;
}

export interface Rates {
  type: RateType;
  roll: AxisRates;
  pitch: AxisRates;
  yaw: AxisRates;
}

export const DEFAULT_RATES: Rates = {
  type: 'betaflight',
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

/** Betaflight-style PID tune for the physical quad (ADR-0063). Per-axis arrays are [roll, pitch, yaw]. */
export interface PidTune {
  p: readonly number[];
  i: readonly number[];
  d: readonly number[];
  f: readonly number[];
  dMin: readonly number[];
  dMinGain: number;
  dMinAdvance: number;
  itermRelaxCutoff: number;
  itermRelaxYaw: boolean;
  itermLimit: number;
  itermWindup: number;
  antiGravityGain: number;
  antiGravityCutoff: number;
  tpaRate: number;
  tpaBreakpoint: number;
  pidSumLimit: number;
  pidSumLimitYaw: number;
  yawLowpass: number;
  gyroLowpassMin: number;
  gyroLowpassMax: number;
  dtermLowpassMin: number;
  dtermLowpassMax: number;
  dtermLowpass2: number;
  feedforwardBoost: number;
  feedforwardMaxRateLimit: number;
  rcSmoothingSetpoint: number;
  rcSmoothingFeedforward: number;
  rcSmoothingThrottle: number;
  motorIdle: number;
  dynIdleMinRpm: number;
  dynIdleMaxIncrease: number;
  airmodeStartThrottle: number;
  motorOutputLimit: number;
}

type V3 = readonly [number, number, number];

/** A quad described by its real parts (ADR-0063): layout and masses, drag, props, motors, battery and tune. */
export interface PhysicalQuadSpec {
  /** Collision box half-extents (m): x right, y up, z forward. */
  hull: V3;
  /** Always self-levels (the X8, ADR-0037); otherwise the pilot's flight assist applies (ADR-0045). */
  horizon?: HorizonParams;
  layout: {
    /** Motor positions from the centre (m), sideways and fore-aft. */
    reachX: number;
    reachZ: number;
    motorY: number;
    propY: number;
    motor: { mass: number; radius: number; height: number };
    prop: { mass: number; radius: number };
    battery: { mass: number; size: V3; at: V3 };
    /** Total arm mass (kg), as four rods from the centre to the motors. */
    arms: number;
    /**
     * Coaxial pairs (the X8): a second motor and prop under each arm end, this far (m) below the top one,
     * spinning the other way and working in the top prop's wake.
     */
    coaxialGap?: number;
    other: readonly { name: string; mass: number; at: V3; size: V3 }[];
  };
  aero: { dragArea: V3; pressureCentre: V3 };
  prop: {
    radius: number;
    blades: number;
    chord: number;
    pitch: number;
    liftSlope: number;
    profileDrag: number;
    zeroLift: number;
    maxLoading: number;
    flapping: number;
    inducedFactor: number;
    duct: number;
    wakeNoise: number;
  };
  motor: { kv: number; resistance: number; noLoadCurrent: number; currentLimit: number; brakeLimit: number; rotorInertia: number };
  battery: { cells: number; cellVoltage: number; resistance: number; polarisation: number; polarisationTau: number };
  tune: PidTune;
  /** Betaflight throttle expo and its mid point. */
  throttleExpo: number;
  throttleMid: number;
  /** Flight-controller loop rate (Hz); the physics step runs this many substeps per second. */
  loopHz: number;
  /** Motor rpm treated as 100% for sound. */
  maxRpm: number;
  /**
   * 3D mode (the 3D quad): motors and symmetric props run both ways. Stick centre is zero thrust, below it
   * is reverse; `deadband` is the fraction of each half-stick around centre that commands nothing.
   */
  reversible?: { deadband: number };
}

const BASE_TUNE: PidTune = {
  p: [45, 47, 45],
  i: [80, 84, 80],
  d: [40, 46, 0],
  f: [120, 125, 120],
  dMin: [30, 32, 0],
  dMinGain: 37,
  dMinAdvance: 20,
  itermRelaxCutoff: 15,
  itermRelaxYaw: false,
  itermLimit: 400,
  itermWindup: 85,
  antiGravityGain: 80,
  antiGravityCutoff: 5,
  tpaRate: 0.65,
  tpaBreakpoint: 0.35,
  pidSumLimit: 500,
  pidSumLimitYaw: 400,
  yawLowpass: 100,
  gyroLowpassMin: 250,
  gyroLowpassMax: 500,
  dtermLowpassMin: 75,
  dtermLowpassMax: 150,
  dtermLowpass2: 150,
  feedforwardBoost: 15,
  feedforwardMaxRateLimit: 90,
  rcSmoothingSetpoint: 40,
  rcSmoothingFeedforward: 40,
  rcSmoothingThrottle: 40,
  motorIdle: 0.055,
  dynIdleMinRpm: 0,
  dynIdleMaxIncrease: 0.15,
  airmodeStartThrottle: 0.25,
  motorOutputLimit: 1,
};

/**
 * The 5" freestyle as real parts (ADR-0063): numbers from the Flight Division sim's freestyle profile
 * (ADR-0062). 6S 1950 kV 2207-class motors on 5x4.5" tri-blades, a 0.25 kg pack, ~0.6 kg all-up.
 */
export const PHYSICAL_QUAD: PhysicalQuadSpec = {
  hull: [0.12, 0.035, 0.12],
  layout: {
    reachX: 0.087,
    reachZ: 0.087,
    motorY: 0.012,
    propY: 0.03,
    motor: { mass: 0.033, radius: 0.0135, height: 0.022 },
    prop: { mass: 0.0045, radius: 0.0635 },
    battery: { mass: 0.25, size: [0.038, 0.035, 0.075], at: [0, 0.04, 0.005] },
    arms: 0.07,
    other: [
      { name: 'bottom plate', mass: 0.03, at: [0, -0.002, 0], size: [0.06, 0.004, 0.13] },
      { name: 'top plate', mass: 0.015, at: [0, 0.024, 0], size: [0.045, 0.002, 0.1] },
      { name: 'stack', mass: 0.022, at: [0, 0.012, 0], size: [0.036, 0.015, 0.036] },
      { name: 'camera', mass: 0.012, at: [0, 0.018, -0.045], size: [0.019, 0.019, 0.02] },
      { name: 'vtx and receiver', mass: 0.03, at: [0, 0.012, 0.035], size: [0.03, 0.01, 0.04] },
      { name: 'mount, straps, hardware', mass: 0.071, at: [0, 0.018, -0.005], size: [0.08, 0.03, 0.1] },
    ],
  },
  aero: { dragArea: [0.0095, 0.019, 0.0085], pressureCentre: [0, 0.012, 0] },
  prop: {
    radius: 0.0635,
    blades: 3,
    chord: 0.011,
    pitch: 0.1143,
    liftSlope: 2.56,
    profileDrag: 0.048,
    zeroLift: 0.05,
    maxLoading: 0.2,
    flapping: 2,
    inducedFactor: 1.3,
    duct: 1,
    wakeNoise: 0.18,
  },
  motor: { kv: 1950, resistance: 0.085, noLoadCurrent: 1.6, currentLimit: 70, brakeLimit: 50, rotorInertia: 55e-7 },
  battery: { cells: 6, cellVoltage: 3.95, resistance: 0.026, polarisation: 0.012, polarisationTau: 2 },
  tune: {
    ...BASE_TUNE,
    d: [46, 52, 0],
    dMin: [42, 47, 0],
    f: [90, 93, 85],
    itermRelaxYaw: true,
    tpaRate: 0.3,
    tpaBreakpoint: 0.5,
    dynIdleMinRpm: 30,
  },
  throttleExpo: 0.1,
  throttleMid: 0.5,
  loopHz: 960,
  maxRpm: 32000,
};

/** Blade-element numbers every prop shares unless it says otherwise (Flight Division's defaults). */
const PROP_BASE = { zeroLift: 0.05, maxLoading: 0.2, flapping: 2, inducedFactor: 1.3, duct: 1, wakeNoise: 0.18 } as const;

/**
 * The 3" racer as real parts (ADR-0064): a 140 mm 6S 3" with 1505-class 2450 kV motors and 3x3" tri-blades,
 * 0.35 kg with its pack. Built the way Flight Division builds its quads (motor and prop from its 3" cinewhoop,
 * open props instead of ducts); tune from its racer.
 */
export const PHYSICAL_RACER: PhysicalQuadSpec = {
  hull: [0.08, 0.03, 0.08],
  layout: {
    reachX: 0.14 / Math.sqrt(8),
    reachZ: 0.14 / Math.sqrt(8),
    motorY: 0.01,
    propY: 0.022,
    motor: { mass: 0.02, radius: 0.0115, height: 0.016 },
    prop: { mass: 0.0022, radius: 0.0381 },
    battery: { mass: 0.11, size: [0.03, 0.028, 0.06], at: [0, 0.034, 0.004] },
    arms: 0.03,
    other: [
      { name: 'plates', mass: 0.03, at: [0, 0.004, 0], size: [0.04, 0.005, 0.09] },
      { name: 'stack', mass: 0.012, at: [0, 0.012, 0], size: [0.026, 0.01, 0.026] },
      { name: 'HD camera and vtx', mass: 0.045, at: [0, 0.018, -0.02], size: [0.03, 0.02, 0.05] },
      { name: 'receiver, antennas, hardware', mass: 0.0344, at: [0, 0.014, 0.02], size: [0.04, 0.02, 0.05] },
    ],
  },
  aero: { dragArea: [0.0045, 0.0085, 0.0037], pressureCentre: [0, 0.01, 0] },
  prop: { ...PROP_BASE, radius: 0.0381, blades: 3, chord: 0.0085, pitch: 0.0889, liftSlope: 2.4, profileDrag: 0.07, wakeNoise: 0.15 },
  motor: { kv: 3000, resistance: 0.11, noLoadCurrent: 0.9, currentLimit: 50, brakeLimit: 30, rotorInertia: 1e-6 },
  battery: { cells: 6, cellVoltage: 3.95, resistance: 0.06, polarisation: 0.025, polarisationTau: 2 },
  tune: {
    ...BASE_TUNE,
    p: [48, 50, 45],
    d: [50, 56, 0],
    dMin: [45, 50, 0],
    f: [90, 93, 55],
    itermRelaxYaw: true,
    tpaRate: 0.3,
    tpaBreakpoint: 0.5,
    dynIdleMinRpm: 40,
  },
  throttleExpo: 0.1,
  throttleMid: 0.5,
  loopHz: 960,
  maxRpm: 50000,
};

/**
 * The 3D quad as real parts (ADR-0064): the 5"'s frame and motors on a 3D ESC, with symmetric 5x3" 3D
 * tri-blades that push the same either way, and a lighter 0.2 kg pack (0.6 kg all-up).
 */
export const PHYSICAL_QUAD_3D: PhysicalQuadSpec = {
  ...PHYSICAL_QUAD,
  layout: { ...PHYSICAL_QUAD.layout, battery: { ...PHYSICAL_QUAD.layout.battery, mass: 0.2 } },
  aero: { dragArea: [0.0121, 0.019, 0.0099], pressureCentre: [0, 0.012, 0] },
  // A symmetric section has no lift at zero pitch, and makes more profile drag than a cambered one.
  prop: { ...PHYSICAL_QUAD.prop, pitch: 0.0889, zeroLift: 0, liftSlope: 2.4, profileDrag: 0.06 },
  tune: { ...PHYSICAL_QUAD.tune, motorIdle: 0.03, dynIdleMinRpm: 0 },
  // Linear throttle: centre stick is zero, and each half runs the full range one way.
  throttleExpo: 0,
  reversible: { deadband: 0.04 },
};

/**
 * The X8 heavy lifter as real parts (ADR-0064): four 0.5 m arms with a coaxial pair at each end, eight
 * 2806-class 1280 kV motors on 7" bi-blades and a big 6S pack, ~2 kg all-up. Motors, props and tune from
 * Flight Division's 7" long-range quad.
 */
export const PHYSICAL_X8: PhysicalQuadSpec = {
  hull: [0.2, 0.06, 0.2],
  // Always flies in horizon mode (ADR-0037, ADR-0045): a stable gun platform, not a dodger.
  horizon: { maxAngleDeg: 55, levelGain: 7, transition: 0.75, maxLevelDegPerSec: 300 },
  layout: {
    reachX: 0.5 / Math.sqrt(8),
    reachZ: 0.5 / Math.sqrt(8),
    motorY: 0.015,
    propY: 0.04,
    coaxialGap: 0.06,
    motor: { mass: 0.058, radius: 0.0175, height: 0.026 },
    prop: { mass: 0.009, radius: 0.0889 },
    battery: { mass: 0.6, size: [0.05, 0.045, 0.15], at: [0, 0.045, 0] },
    arms: 0.28,
    other: [
      { name: 'plates', mass: 0.2, at: [0, 0.01, 0], size: [0.12, 0.02, 0.2] },
      { name: 'stack and GPS', mass: 0.05, at: [0, 0.025, 0.03], size: [0.04, 0.02, 0.05] },
      { name: 'camera', mass: 0.04, at: [0, 0.03, -0.09], size: [0.03, 0.03, 0.03] },
      { name: 'hardpoint rails', mass: 0.2, at: [0, -0.03, 0], size: [0.2, 0.03, 0.2] },
      { name: 'vtx, antennas, hardware', mass: 0.094, at: [0, 0.03, 0.06], size: [0.06, 0.03, 0.1] },
    ],
  },
  aero: { dragArea: [0.0257, 0.049, 0.025], pressureCentre: [0, 0.01, 0] },
  prop: { ...PROP_BASE, radius: 0.0889, blades: 2, chord: 0.018, pitch: 0.1016, liftSlope: 3.65, profileDrag: 0.027 },
  motor: { kv: 975, resistance: 0.07, noLoadCurrent: 1.4, currentLimit: 60, brakeLimit: 40, rotorInertia: 22e-6 },
  battery: { cells: 6, cellVoltage: 3.95, resistance: 0.03, polarisation: 0.02, polarisationTau: 3 },
  tune: {
    ...BASE_TUNE,
    // Higher P and quicker I-term relax than the 7": the eight big rotors spool slowly, so I would wind up.
    p: [55, 58, 40],
    d: [60, 70, 0],
    dMin: [50, 60, 0],
    f: [70, 70, 80],
    itermRelaxCutoff: 8,
    itermRelaxYaw: true,
    tpaRate: 0.3,
    tpaBreakpoint: 0.5,
    dynIdleMinRpm: 28,
  },
  throttleExpo: 0.1,
  throttleMid: 0.5,
  loopHz: 960,
  maxRpm: 23000,
};

/** The physical model's spec for each quad body (ADR-0063, ADR-0064). */
export const PHYSICAL_SPECS = { freestyle: PHYSICAL_QUAD, quad3d: PHYSICAL_QUAD_3D, racer: PHYSICAL_RACER, x8: PHYSICAL_X8 } as const;
