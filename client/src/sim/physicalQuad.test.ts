import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DRONE_CLASSES } from '../../../shared/drones';
import { DEFAULT_LOADOUTS, thrustToWeight } from '../../../shared/loadout';
import { DEFAULT_RATES, PHYSICAL_HOVER, PHYSICAL_SPECS, SIM } from '../config';
import type { ControlState } from '../input/inputManager';
import { Drone } from './drone';
import { createPhysics, type Physics } from './physics';
import { physicalHardware, thrustStand } from './physicalQuad';
import { maxRate } from './rates';

type Body = keyof typeof PHYSICAL_SPECS;

async function armedDrone(body: Body = 'freestyle'): Promise<{ physics: Physics; drone: Drone }> {
  const physics = await createPhysics();
  const drone = new Drone(physics, { pos: [0, 100, 0], yawDeg: 0 } as never);
  if (body !== 'freestyle') drone.setLoadout(DEFAULT_LOADOUTS[body]);
  drone.armed = true;
  return { physics, drone };
}

/** Stick throttle for a fraction of full thrust: the 3D quad's forward thrust is the upper half-stick. */
function stick(body: Body, fraction: number): number {
  return body === 'quad3d' ? 0.5 + fraction / 2 : fraction;
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

describe('physical 3", 3D quad and X8 (ADR-0064)', () => {
  const others = ['racer', 'quad3d', 'x8'] as const;

  it('weigh what the Loadout screen says, with the thrust it shows', () => {
    for (const body of others) {
      expect(physicalHardware(PHYSICAL_SPECS[body]).mass).toBeCloseTo(DRONE_CLASSES[body].frameKg, 2);
      const tw = thrustStand(PHYSICAL_SPECS[body]).thrustToWeight;
      expect(tw).toBeCloseTo(PHYSICAL_HOVER[body].thrustToWeight, 1);
      expect(thrustToWeight(DEFAULT_LOADOUTS[body])).toBeCloseTo(PHYSICAL_HOVER[body].thrustToWeight, 2);
    }
  });

  it('hover where the Loadout screen says', async () => {
    for (const body of others) {
      const h = PHYSICAL_HOVER[body].throttle;
      const low = await armedDrone(body);
      fly(low.physics, low.drone, { throttle: stick(body, h - 0.04) }, 2);
      expect(low.drone.state.linvel.y).toBeLessThan(0);
      const high = await armedDrone(body);
      fly(high.physics, high.drone, { throttle: stick(body, h + 0.04) }, 2);
      expect(high.drone.state.linvel.y).toBeGreaterThan(0);
    }
  });

  it('roll and pitch at the max rate, the X8 a little slower', async () => {
    const target = maxRate(DEFAULT_RATES.roll);
    for (const body of others) {
      for (const [axis, control] of [['z', { roll: 1 }], ['x', { pitch: 1 }]] as const) {
        const { physics, drone } = await armedDrone(body);
        const h = stick(body, PHYSICAL_HOVER[body].throttle);
        fly(physics, drone, { throttle: h }, 0.3);
        fly(physics, drone, { throttle: h, ...control }, body === 'x8' ? 0.3 : 0.25);
        const rate = bodyRate(drone)[axis];
        expect(rate).toBeLessThan(-0.9 * target);
        expect(rate).toBeGreaterThan(-1.15 * target);
      }
    }
  });

  it('the 3D quad hangs upside down on reversed props, and centre stick is zero thrust', async () => {
    const h = PHYSICAL_HOVER.quad3d.throttle;
    const flip = (d: Drone) => {
      d.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI), true);
    };
    const up = await armedDrone('quad3d');
    flip(up.drone);
    fly(up.physics, up.drone, { throttle: 0.5 - (h + 0.06) / 2 }, 1.5);
    expect(up.drone.state.linvel.y).toBeGreaterThan(0);
    const down = await armedDrone('quad3d');
    flip(down.drone);
    fly(down.physics, down.drone, { throttle: 0.5 - (h - 0.06) / 2 }, 1.5);
    expect(down.drone.state.linvel.y).toBeLessThan(0);
    const centre = await armedDrone('quad3d');
    fly(centre.physics, centre.drone, { throttle: 0.5 }, 1);
    expect(centre.drone.state.linvel.y).toBeLessThan(-0.8 * SIM.gravity);
  });
});
