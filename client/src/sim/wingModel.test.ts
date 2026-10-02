import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SIM } from '../config';
import { createFlightOutput, type FlightInput, type FlightState } from './flightModel';
import { levelFlightSpeed, liftCoefficient, stepWing, WING } from './wingModel';

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
    expect(stallSpeed).toBeGreaterThan(9);
    expect(stallSpeed).toBeLessThan(11.5);
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

describe('Cobra (ADR-0014): physics-based, hold Special', () => {
  const nose = new Vector3();
  /** Angle between the nose and the airflow (deg). */
  const aoa = (s: FlightState) => {
    nose.set(0, 0, -1).applyQuaternion(s.rotation);
    const v = s.linvel.length();
    return v < 0.1 ? 0 : (Math.acos(Math.max(-1, Math.min(1, nose.dot(s.linvel) / v))) * 180) / Math.PI;
  };
  /** Nose above the horizon (deg, -90..90). */
  const pitchUp = (s: FlightState) => {
    nose.set(0, 0, -1).applyQuaternion(s.rotation);
    return (Math.asin(Math.max(-1, Math.min(1, nose.y))) * 180) / Math.PI;
  };

  /** Hold the Cobra for `hold` s at 80% throttle, then fly normally (sticks centered) for `after` s. */
  function cobra(speed: number, hold: number, after = 0) {
    const s = flying(speed);
    const out = createFlightOutput();
    let peakAoa = 0;
    let aoaAt60ms = 0;
    let endAoa = 0;
    const steps = Math.round((hold + after) * SIM.hz);
    for (let i = 0; i < steps; i++) {
      stepWing({ ...centered, throttle: 0.8 }, s, true, dt, out, i < hold * SIM.hz);
      s.motorOutput = out.motorOutput;
      s.linvel.addScaledVector(out.force, dt / WING.massKg);
      s.linvel.y -= SIM.gravity * dt;
      s.angvel.copy(out.angvel);
      const w = s.angvel;
      const angle = w.length() * dt;
      if (angle > 0) s.rotation.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), angle)).normalize();
      if (i < hold * SIM.hz) peakAoa = Math.max(peakAoa, aoa(s));
      if (i === Math.round(0.06 * SIM.hz)) aoaAt60ms = aoa(s);
      endAoa = aoa(s);
    }
    return { peakAoa, aoaAt60ms, endAoa, pitch: pitchUp(s), speed: s.linvel.length() };
  }

  it('builds up over time instead of snapping (under 15° after 60 ms)', () => {
    for (const v of [12, 20, 30, 40]) expect(cobra(v, 0.5).aoaAt60ms).toBeLessThan(15);
  });

  it('a fast entry pitches past ~90° to the airflow; a slow one barely can', () => {
    const fast = cobra(40, 0.5);
    const slow = cobra(12, 0.5);
    expect(fast.peakAoa).toBeGreaterThan(85);
    expect(fast.peakAoa).toBeLessThan(125);
    expect(slow.peakAoa).toBeLessThan(fast.peakAoa * 0.6);
  });

  it('works as an airbrake: a fast entry loses about half its speed', () => {
    expect(cobra(40, 0.5).speed).toBeLessThan(40 * 0.6);
  });

  it('recovers to normal flight after release', () => {
    expect(cobra(30, 0.5, 1.5).endAoa).toBeLessThan(15);
  });
});
