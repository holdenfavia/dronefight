import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SIM } from '../config';
import { PROPELLERS, ramFactor } from '../../../shared/propellers';
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

describe('Maneuver mode (ADR-0022): hold Special for more authority, easier to stall', () => {
  /** Hold a stick input at 70% throttle for `seconds`; report peak body rates (deg/s) and peak angle of attack (deg). */
  function hold(speed: number, input: Partial<FlightInput>, maneuver: boolean, seconds: number) {
    const s = flying(speed);
    const out = createFlightOutput();
    let pitchRate = 0;
    let rollRate = 0;
    let aoa = 0;
    const inv = new Quaternion();
    const body = new Vector3();
    for (let i = 0; i < seconds * SIM.hz; i++) {
      stepWing({ ...centered, throttle: 0.7, ...input }, s, true, dt, out, maneuver);
      s.motorOutput = out.motorOutput;
      s.linvel.addScaledVector(out.force, dt / WING.massKg);
      s.linvel.y -= SIM.gravity * dt;
      s.angvel.copy(out.angvel);
      const w = s.angvel;
      const angle = w.length() * dt;
      if (angle > 0) s.rotation.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), angle)).normalize();
      body.copy(s.angvel).applyQuaternion(inv.copy(s.rotation).invert());
      pitchRate = Math.max(pitchRate, (Math.abs(body.x) * 180) / Math.PI);
      rollRate = Math.max(rollRate, (Math.abs(body.z) * 180) / Math.PI);
      aoa = Math.max(aoa, (Math.abs(out.alpha) * 180) / Math.PI);
    }
    return { pitchRate, rollRate, aoa, speed: s.linvel.length() };
  }

  it('about doubles the pitch rate at speed', () => {
    const normal = hold(30, { pitch: -1 }, false, 0.3).pitchRate;
    const fast = hold(30, { pitch: -1 }, true, 0.3).pitchRate;
    expect(fast / normal).toBeGreaterThan(1.7);
  });

  it('adds some roll rate', () => {
    const normal = hold(30, { roll: 1 }, false, 0.3).rollRate;
    const fast = hold(30, { roll: 1 }, true, 0.3).rollRate;
    expect(fast / normal).toBeGreaterThan(1.2);
    expect(fast / normal).toBeLessThan(1.45);
  });

  it('a half-stick pull at 25 m/s stalls the wing in maneuver mode, but not in normal flight', () => {
    const stall = WING.stallDeg;
    expect(hold(25, { pitch: -0.5 }, false, 0.6).aoa).toBeLessThan(stall);
    expect(hold(25, { pitch: -0.5 }, true, 0.6).aoa).toBeGreaterThan(stall);
  });

  it('a full pull can swing the nose far past the airflow (post-stall), which normal flight never does', () => {
    expect(hold(30, { pitch: -1 }, true, 0.6).aoa).toBeGreaterThan(90);
    expect(hold(30, { pitch: -1 }, false, 0.6).aoa).toBeLessThan(45);
  });
});

describe('jets (ADR-0038)', () => {
  /** Motor output after holding `throttle` for `seconds` (speed held constant), and the last thrust (N). */
  function engine(id: 'tri' | 'turbine' | 'pulsejet' | 'ramjet', throttle: number, seconds: number, speed = 20) {
    const p = PROPELLERS[id];
    const state = flying(speed);
    const out = createFlightOutput();
    for (let i = 0; i < seconds * SIM.hz; i++) {
      stepWing({ ...centered, throttle }, state, true, dt, out, false, p.thrust, p);
      state.motorOutput = out.motorOutput;
      state.time += dt;
    }
    return { motor: out.motorOutput, thrust: out.motorOutput * WING.maxThrustN * p.thrust * ramFactor(id, speed) };
  }

  it('the turbine spools slowly but ends up far stronger', () => {
    expect(engine('turbine', 1, 0.3).motor).toBeLessThan(engine('tri', 1, 0.3).motor * 0.5);
    expect(engine('turbine', 1, 6).thrust).toBeGreaterThan(engine('tri', 1, 6).thrust * 1.5);
  });

  it('the turbine never fully idles', () => {
    expect(engine('turbine', 0, 8).motor).toBeGreaterThan(0.05);
  });

  it("the pulse jet can't throttle below its idle", () => {
    expect(engine('pulsejet', 0, 1).motor).toBeGreaterThan(0.4);
  });

  it('the ramjet is weak slow and the strongest fast', () => {
    expect(engine('ramjet', 1, 1, 10).thrust).toBeLessThan(engine('tri', 1, 1, 10).thrust);
    expect(engine('ramjet', 1, 1, 50).thrust).toBeGreaterThan(engine('turbine', 1, 8, 50).thrust);
  });
});
