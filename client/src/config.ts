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
  /** Max static thrust divided by weight: the physical 5"'s thrust stand (ADR-0063), so both models agree. */
  thrustToWeight: 9.13,
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
  thrustToWeight: 7.14,
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
  thrustToWeight: 7.8,
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
  thrustToWeight: 4.09,
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

/**
 * Each physical quad hovers at this throttle at its default build's static thrust-to-weight (measured; guarded
 * by physicalQuad.test.ts). For the 3D quad it is the fraction of the upper half-stick. Hover throttle goes
 * with sqrt(weight / thrust) from there, for the Loadout screen.
 */
export const PHYSICAL_HOVER: Record<keyof typeof PHYSICAL_SPECS, { throttle: number; thrustToWeight: number }> = {
  freestyle: { throttle: 0.2, thrustToWeight: 9.13 },
  quad3d: { throttle: 0.31, thrustToWeight: 7.14 },
  racer: { throttle: 0.21, thrustToWeight: 7.8 },
  x8: { throttle: 0.36, thrustToWeight: 4.09 },
};
