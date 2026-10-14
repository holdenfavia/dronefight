import { Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES, SIM } from '../config';
import type { ControlState } from '../input/inputManager';
import { Drone } from './drone';
import { createPhysics, type Physics } from './physics';
import { physicalHardware, thrustStand } from './physicalQuad';
import { maxRate } from './rates';

async function armedDrone(): Promise<{ physics: Physics; drone: Drone }> {
  const physics = await createPhysics();
  const drone = new Drone(physics, { pos: [0, 100, 0], yawDeg: 0 } as never);
  drone.armed = true;
  return { physics, drone };
}

function fly(physics: Physics, drone: Drone, control: Partial<ControlState>, seconds: number): void {
  const c = { throttle: 0, roll: 0, pitch: 0, yaw: 0, ...control } as ControlState;
  for (let i = 0; i < seconds * SIM.hz; i++) {
    drone.preStep(c, DEFAULT_RATES, 1 / SIM.hz);
    physics.world.step();
    drone.postStep(1 / SIM.hz);
  }
}

/** Body-frame rotation rate (deg/s). */
function bodyRate(drone: Drone) {
  const w = drone.state.angvel.clone().applyQuaternion(new Quaternion().copy(drone.state.rotation).invert());
  return w.multiplyScalar(180 / Math.PI);
}

describe('physical 5" (ADR-0063)', () => {
  it('is a 0.65 kg quad with ~9:1 static thrust', () => {
    expect(physicalHardware().mass).toBeCloseTo(0.65, 2);
    const stand = thrustStand();
    expect(stand.thrustToWeight).toBeGreaterThan(8.5);
    expect(stand.thrustToWeight).toBeLessThan(10);
  });

  it('hovers near 20% throttle and punches out hard', async () => {
    const low = await armedDrone();
    fly(low.physics, low.drone, { throttle: 0.17 }, 2);
    expect(low.drone.state.linvel.y).toBeLessThan(0);
    const high = await armedDrone();
    fly(high.physics, high.drone, { throttle: 0.24 }, 2);
    expect(high.drone.state.linvel.y).toBeGreaterThan(0);
    const punch = await armedDrone();
    fly(punch.physics, punch.drone, { throttle: 1 }, 1);
    expect(punch.drone.state.linvel.y).toBeGreaterThan(30);
  });

  it('rolls right, pitches nose down and yaws right at full stick, reaching the max rate', async () => {
    const target = maxRate(DEFAULT_RATES.roll);
    for (const [axis, control] of [['z', { roll: 1 }], ['x', { pitch: 1 }], ['y', { yaw: 1 }]] as const) {
      const { physics, drone } = await armedDrone();
      fly(physics, drone, { throttle: 0.2 }, 0.3);
      fly(physics, drone, { throttle: 0.2, ...control }, 0.25);
      const rate = bodyRate(drone)[axis];
      expect(rate).toBeLessThan(-0.9 * target);
      expect(rate).toBeGreaterThan(-1.15 * target);
    }
  });

  it('falls flat at a real 5"\'s ~23 m/s with the throttle cut', async () => {
    const { physics, drone } = await armedDrone();
    fly(physics, drone, { throttle: 0 }, 8);
    expect(-drone.state.linvel.y).toBeGreaterThan(20);
    expect(-drone.state.linvel.y).toBeLessThan(27);
  });
});
