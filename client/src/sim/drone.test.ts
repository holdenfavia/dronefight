import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { lookAngvel } from './drone';

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
