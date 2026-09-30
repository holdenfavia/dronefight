import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES, QUAD, QUAD_3D, SIM } from '../config';
import {
  createFlightOutput,
  hoverThrottle,
  MAX_THRUST_N,
  stepFlight,
  throttleSafeToArm,
  throttleToMotor,
  type FlightInput,
  type FlightState,
} from './flightModel';
import { maxRate } from './rates';

function level(): FlightState {
  return {
    rotation: new Quaternion(),
    linvel: new Vector3(),
    angvel: new Vector3(),
    motorOutput: 0,
    time: 0,
  };
}

const centered: FlightInput = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
const dt = 1 / SIM.hz;

/** Run the model for `seconds`, integrating only rotation and motor output. */
function run(input: FlightInput, seconds: number, state = level()) {
  const out = createFlightOutput();
  for (let i = 0; i < seconds * SIM.hz; i++) {
    stepFlight(input, state, DEFAULT_RATES, true, dt, out);
    state.motorOutput = out.motorOutput;
    state.angvel.copy(out.angvel);
    state.time += dt;
  }
  return { state, out };
}

describe('flight model', () => {
  it('hovers near 25% throttle', () => {
    const t = hoverThrottle();
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.3);
    const { out } = run({ ...centered, throttle: t }, 0.5);
    expect(out.force.y).toBeCloseTo(QUAD.massKg * SIM.gravity, 1);
  });

  it('produces no thrust or control when disarmed', () => {
    const out = createFlightOutput();
    stepFlight({ throttle: 1, roll: 1, pitch: 0, yaw: 0 }, level(), DEFAULT_RATES, false, dt, out);
    expect(out.force.length()).toBe(0);
    expect(out.angvel.length()).toBe(0);
  });

  it('reaches the max roll rate within ~0.1 s at full stick', () => {
    const { out } = run({ ...centered, throttle: 0.5, roll: 1 }, 0.1);
    const degPerSec = (-out.angvel.z * 180) / Math.PI;
    expect(degPerSec).toBeGreaterThan(maxRate(DEFAULT_RATES.roll) * 0.98);
  });

  it('rolls right (right side down) on positive roll stick', () => {
    const { out } = run({ ...centered, throttle: 0.5, roll: 1 }, 0.05);
    expect(out.angvel.z).toBeLessThan(0);
  });

  it('pitches nose down on forward pitch stick', () => {
    const { out } = run({ ...centered, throttle: 0.5, pitch: 1 }, 0.05);
    // Rotation about +X by a negative angle moves the nose (-Z) downward.
    expect(out.angvel.x).toBeLessThan(0);
  });

  it('yaws nose right on positive yaw stick', () => {
    const { out } = run({ ...centered, throttle: 0.5, yaw: 1 }, 0.05);
    expect(out.angvel.y).toBeLessThan(0);
  });

  it('opposes motion with drag', () => {
    const state = level();
    state.linvel.set(0, 0, -30);
    const out = createFlightOutput();
    stepFlight(centered, state, DEFAULT_RATES, false, dt, out);
    expect(out.force.z).toBeGreaterThan(0);
  });

  it('drops like a real quad at zero throttle (not floaty)', () => {
    // Idle lift must be a small fraction of weight.
    expect((QUAD.idleThrust * MAX_THRUST_N) / (QUAD.massKg * SIM.gravity)).toBeLessThan(0.1);
    // Level, armed, zero throttle: after 1 s it should be close to free fall (9.8 m/s).
    const state = level();
    const out = createFlightOutput();
    for (let i = 0; i < SIM.hz; i++) {
      stepFlight(centered, state, DEFAULT_RATES, true, dt, out);
      state.motorOutput = out.motorOutput;
      state.linvel.addScaledVector(out.force, dt / QUAD.massKg);
      state.linvel.y -= SIM.gravity * dt;
    }
    expect(-state.linvel.y).toBeGreaterThan(7.5);
  });

  it('snaps to the commanded rate within 40 ms', () => {
    const { out } = run({ ...centered, throttle: 0.5, roll: 1 }, 0.04);
    const degPerSec = (-out.angvel.z * 180) / Math.PI;
    expect(degPerSec).toBeGreaterThan(maxRate(DEFAULT_RATES.roll) * 0.9);
  });

  it('keeps max thrust consistent with thrust-to-weight', () => {
    expect(MAX_THRUST_N / (QUAD.massKg * SIM.gravity)).toBeCloseTo(QUAD.thrustToWeight);
  });
});

describe('3D quad (ADR-0013)', () => {
  it('makes zero thrust at throttle center, forward above, reversed ~70% below', () => {
    expect(throttleToMotor(0.5, true, QUAD_3D)).toBe(0);
    expect(throttleToMotor(1, true, QUAD_3D)).toBeCloseTo(1);
    expect(throttleToMotor(0, true, QUAD_3D)).toBeCloseTo(-QUAD_3D.threeD!.reverseEfficiency);
  });

  it('has a small deadband around center', () => {
    expect(throttleToMotor(0.51, true, QUAD_3D)).toBe(0);
    expect(throttleToMotor(0.6, true, QUAD_3D)).toBeGreaterThan(0);
  });

  it('arms with the throttle at center, not at the bottom', () => {
    expect(throttleSafeToArm(0.5, QUAD_3D, 0.05)).toBe(true);
    expect(throttleSafeToArm(0, QUAD_3D, 0.05)).toBe(false);
    expect(throttleSafeToArm(0, QUAD, 0.05)).toBe(true);
  });

  it('can hover upside down by reversing thrust', () => {
    const inverted: FlightState = { ...level(), rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI) };
    const out = createFlightOutput();
    let throttle = 0;
    // Find the reversed throttle that pushes up while inverted.
    for (let t = 0.5; t >= 0; t -= 0.01) {
      inverted.motorOutput = throttleToMotor(t, true, QUAD_3D);
      stepFlight({ throttle: t, roll: 0, pitch: 0, yaw: 0 }, inverted, DEFAULT_RATES, true, dt, out, QUAD_3D);
      if (out.force.y >= QUAD_3D.massKg * SIM.gravity) {
        throttle = t;
        break;
      }
    }
    expect(throttle).toBeGreaterThan(0);
    expect(throttle).toBeLessThan(0.5);
  });
});
