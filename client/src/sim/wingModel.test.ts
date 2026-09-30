import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SIM } from '../config';
import { createFlightOutput, type FlightInput, type FlightState } from './flightModel';
import { COBRA, cobraPitchRate, levelFlightSpeed, liftCoefficient, stepWing, WING } from './wingModel';

const dt = 1 / SIM.hz;
const centered: FlightInput = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };

function flying(speed: number, pitchDeg = 0): FlightState {
  return {
    rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (pitchDeg * Math.PI) / 180),
    linvel: new Vector3(0, 0, -speed),
    angvel: new Vector3(),
    motorOutput: 0,
    time: 0,
  };
}

/** Integrate translation and rotation (roughly what Rapier does) for `seconds`. */
function fly(state: FlightState, input: FlightInput, seconds: number, armed = true) {
  const out = createFlightOutput();
  for (let i = 0; i < seconds * SIM.hz; i++) {
    stepWing(input, state, armed, dt, out);
    state.motorOutput = out.motorOutput;
    state.linvel.addScaledVector(out.force, dt / WING.massKg);
    state.linvel.y -= SIM.gravity * dt;
    state.angvel.copy(out.angvel);
    const w = state.angvel;
    const angle = w.length() * dt;
    if (angle > 0) state.rotation.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), angle)).normalize();
  }
  return state;
}

describe('wing model (ADR-0013)', () => {
  it('lift rises with angle of attack, then stalls', () => {
    expect(liftCoefficient(0.1)).toBeGreaterThan(liftCoefficient(0));
    const stall = (WING.stallDeg * Math.PI) / 180;
    expect(liftCoefficient(stall + 0.35)).toBeLessThan(liftCoefficient(stall));
  });

  it('has a sensible stall speed and cruise speed', () => {
    const stallSpeed = levelFlightSpeed(liftCoefficient((WING.stallDeg * Math.PI) / 180));
    expect(stallSpeed).toBeGreaterThan(6);
    expect(stallSpeed).toBeLessThan(11);
  });

  it("can't hover: at zero airspeed it just falls", () => {
    const s = fly(flying(0), { ...centered, throttle: 0 }, 1);
    expect(s.linvel.y).toBeLessThan(-7);
  });

  it('holds altitude reasonably in powered level flight', () => {
    const s = fly(flying(25), { ...centered, throttle: 0.45 }, 3);
    expect(Math.abs(s.linvel.y)).toBeLessThan(6);
    expect(s.linvel.length()).toBeGreaterThan(15);
  });

  it('reaches a high top speed at full throttle, much faster than it hovers (which it cannot)', () => {
    const s = fly(flying(25), { ...centered, throttle: 1 }, 8);
    expect(s.linvel.length() * 3.6).toBeGreaterThan(140);
  });

  it('when slow, the nose drops to regain speed', () => {
    const s = fly(flying(5, 20), centered, 1.5, false);
    const nose = new Vector3(0, 0, -1).applyQuaternion(s.rotation);
    expect(nose.y).toBeLessThan(0);
  });

  it('rolls right on right stick', () => {
    const out = createFlightOutput();
    stepWing({ ...centered, throttle: 0.5, roll: 1 }, flying(20), true, 0.05, out);
    expect(out.angvel.z).toBeLessThan(0);
  });
});

describe('Cobra (ADR-0014)', () => {
  it('pitches the nose up past vertical and bleeds speed, then comes back', () => {
    const s = flying(40);
    const out = createFlightOutput();
    let t = 0;
    let maxNoseUp = -1;
    for (;;) {
      const rate = cobraPitchRate(t);
      if (rate === null) break;
      stepWing({ ...centered, throttle: 0.4 }, s, true, dt, out, rate);
      s.motorOutput = out.motorOutput;
      s.linvel.addScaledVector(out.force, dt / WING.massKg);
      s.linvel.y -= SIM.gravity * dt;
      s.angvel.copy(out.angvel);
      const w = s.angvel;
      const angle = w.length() * dt;
      if (angle > 0) s.rotation.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), angle)).normalize();
      const nose = new Vector3(0, 0, -1).applyQuaternion(s.rotation);
      maxNoseUp = Math.max(maxNoseUp, nose.y);
      t += dt;
    }
    // Nose went well up (at least ~70° above the horizon)...
    expect(maxNoseUp).toBeGreaterThan(Math.sin((70 * Math.PI) / 180));
    // ...and the airbrake took a big chunk of speed.
    expect(s.linvel.length()).toBeLessThan(40 * 0.7);
  });

  it('lasts under a second', () => {
    expect(cobraPitchRate(COBRA.upSeconds + COBRA.holdSeconds + COBRA.downSeconds + 0.01)).toBeNull();
  });
});
