import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cleanLoadout, DEFAULT_LOADOUTS, loadFactor, thrustToWeight } from '../../../shared/loadout';
import { DEFAULT_RATES, QUAD, SIM, X8 } from '../config';
import { loadedParams, lookAngvel } from './drone';
import { createFlightOutput, stepFlight } from './flightModel';

/** Integrate a rotation under lookAngvel and return the angle (deg) between the camera and the target. */
function settle(start: Quaternion, target: Vector3, uptiltDeg: number, seconds: number): number {
  const rot = start.clone();
  const from = new Vector3(0, 30, 0);
  const w = new Vector3();
  const dt = 1 / 500;
  for (let t = 0; t < seconds; t += dt) {
    lookAngvel(rot, from, target, uptiltDeg, w);
    const a = w.length() * dt;
    if (a > 0) rot.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), a)).normalize();
  }
  const cam = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (uptiltDeg * Math.PI) / 180)).applyQuaternion(rot);
  const to = target.clone().sub(from).normalize();
  return (Math.acos(Math.min(1, cam.dot(to))) * 180) / Math.PI;
}

describe('hover look-at (ADR-0027)', () => {
  it('turns the tilted FPV camera onto a target behind and below within a second', () => {
    expect(settle(new Quaternion(), new Vector3(40, 5, 60), 30, 1)).toBeLessThan(2);
  });

  it('works from a tilted, rolled start and for a target above', () => {
    const start = new Quaternion().setFromAxisAngle(new Vector3(1, 0.4, 0.3).normalize(), 1.2);
    expect(settle(start, new Vector3(-80, 70, -20), 20, 1.2)).toBeLessThan(2);
  });

  it('ends level (no roll): the camera horizon stays flat', () => {
    const rot = new Quaternion();
    const from = new Vector3(0, 30, 0);
    const target = new Vector3(50, 10, -30);
    const w = new Vector3();
    for (let t = 0; t < 1.5; t += 1 / 500) {
      lookAngvel(rot, from, target, 30, w);
      const a = w.length() / 500;
      if (a > 0) rot.premultiply(new Quaternion().setFromAxisAngle(w.clone().normalize(), a)).normalize();
    }
    const right = new Vector3(1, 0, 0).applyQuaternion(rot);
    expect(Math.abs(right.y)).toBeLessThan(0.02);
  });
});


/** Full throttle, level, from rest for `seconds`: vertical speed reached (m/s), with gravity. */
function climb(p: ReturnType<typeof loadedParams>, seconds: number): number {
  const state = { rotation: new Quaternion(), linvel: new Vector3(), angvel: new Vector3(), motorOutput: 0, time: 0 };
  const out = createFlightOutput();
  const dt = 1 / SIM.hz;
  for (let t = 0; t < seconds; t += dt) {
    stepFlight({ throttle: 1, roll: 0, pitch: 0, yaw: 0 }, state, DEFAULT_RATES, true, dt, out, p);
    state.motorOutput = out.motorOutput;
    state.linvel.y += (out.force.y / p.massKg - SIM.gravity) * dt;
    // Sitting on the ground: can't go below zero.
    if (state.linvel.y < 0 && out.force.y < p.massKg * SIM.gravity) state.linvel.y = 0;
  }
  return state.linvel.y;
}

describe('loadout weight in flight (ADR-0033)', () => {
  it('a default loadout flies exactly as tuned', () => {
    expect(loadedParams(QUAD, loadFactor(DEFAULT_LOADOUTS.freestyle))).toEqual({ ...QUAD, rateTau: QUAD.rateTau });
  });

  it('extra weight means a slower climb, at the thrust-to-weight the Loadout screen shows', () => {
    const heavy = cleanLoadout({ body: 'freestyle', weapons: ['rail', 'gun'], special: null });
    const p = loadedParams(QUAD, loadFactor(heavy));
    expect(p.thrustToWeight).toBeCloseTo(thrustToWeight(heavy), 5);
    expect(climb(p, 0.5)).toBeLessThan(climb(QUAD, 0.5) / 2);
    expect(climb(p, 0.5)).toBeGreaterThan(0);
  });

  it('too heavy to lift: an X8 with four rail guns stays on the ground', () => {
    const grounded = cleanLoadout({ body: 'x8', weapons: ['rail', 'rail', 'rail', 'rail'], special: null });
    expect(climb(loadedParams(X8, loadFactor(grounded)), 2)).toBe(0);
  });

  it('heavier quads respond more slowly', () => {
    const heavy = cleanLoadout({ body: 'freestyle', weapons: ['rail', 'rail'], special: null });
    expect(loadedParams(QUAD, loadFactor(heavy)).rateTau).toBeGreaterThan(QUAD.rateTau * 1.5);
  });
});
