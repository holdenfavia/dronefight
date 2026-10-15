import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DRONE_CLASSES } from '../../../shared/drones';
import { cleanLoadout, DEFAULT_LOADOUTS, type Loadout } from '../../../shared/loadout';
import { DEFAULT_RATES, FLIGHT_ASSIST, PHYSICAL_SPECS, SIM, type FlightAssist } from '../config';
import type { ControlState } from '../input/inputManager';
import { Drone } from './drone';
import { createPhysics, type Physics } from './physics';
import { buildStats, payload, quadSpec } from './build';
import { physicalHardware, thrustStand } from './physicalQuad';
import { maxRate } from './rates';

type Body = keyof typeof PHYSICAL_SPECS;

async function armedDrone(body: Body | Loadout = 'freestyle', assist: FlightAssist = 'acro'): Promise<{ physics: Physics; drone: Drone }> {
  const physics = await createPhysics();
  const drone = new Drone(physics, { pos: [0, 100, 0], yawDeg: 0 } as never);
  drone.setLoadout(typeof body === 'string' ? DEFAULT_LOADOUTS[body] : body);
  drone.setAssist(assist);
  drone.respawn();
  drone.armed = true;
  return { physics, drone };
}

/** Hover stick for a build, from the Loadout screen's stats. */
const hoverOf = (l: Loadout) => buildStats(l).hover!;

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

  it('hovers near 25% stick in its default build and punches out hard', async () => {
    const h = hoverOf(DEFAULT_LOADOUTS.freestyle);
    expect(h).toBeGreaterThan(0.2);
    expect(h).toBeLessThan(0.3);
    const low = await armedDrone();
    fly(low.physics, low.drone, { throttle: h - 0.03 }, 2);
    expect(low.drone.state.linvel.y).toBeLessThan(0);
    const high = await armedDrone();
    fly(high.physics, high.drone, { throttle: h + 0.03 }, 2);
    expect(high.drone.state.linvel.y).toBeGreaterThan(0);
    const punch = await armedDrone();
    fly(punch.physics, punch.drone, { throttle: 1 }, 1);
    expect(punch.drone.state.linvel.y).toBeGreaterThan(30);
  });

  it('rolls right, pitches nose down and yaws right at full stick, reaching the max rate', async () => {
    const target = maxRate(DEFAULT_RATES.roll);
    for (const [axis, control] of [['z', { roll: 1 }], ['x', { pitch: 1 }], ['y', { yaw: 1 }]] as const) {
      const { physics, drone } = await armedDrone();
      const h = hoverOf(DEFAULT_LOADOUTS.freestyle);
      fly(physics, drone, { throttle: h }, 0.3);
      fly(physics, drone, { throttle: h, ...control }, 0.25);
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

  it('weigh what the Loadout screen says, bare and loaded (ADR-0066)', () => {
    for (const body of ['freestyle', ...others] as const) {
      expect(physicalHardware(PHYSICAL_SPECS[body]).mass).toBeCloseTo(DRONE_CLASSES[body].frameKg, 2);
      const l = DEFAULT_LOADOUTS[body];
      const spec = quadSpec(l);
      const loaded = physicalHardware(spec, payload(l, spec)).mass;
      expect(loaded).toBeCloseTo(buildStats(l).kg, 2);
    }
  });

  it('hover where the Loadout screen says', async () => {
    for (const body of others) {
      const h = hoverOf(DEFAULT_LOADOUTS[body]);
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
        const h = stick(body, hoverOf(DEFAULT_LOADOUTS[body]));
        fly(physics, drone, { throttle: h }, 0.3);
        fly(physics, drone, { throttle: h, ...control }, body === 'x8' ? 0.3 : 0.25);
        const rate = bodyRate(drone)[axis];
        expect(rate).toBeLessThan(-0.9 * target);
        expect(rate).toBeGreaterThan(-1.15 * target);
      }
    }
  });

  it('the 3D quad hangs upside down on reversed props, and centre stick is zero thrust', async () => {
    const h = hoverOf(DEFAULT_LOADOUTS.quad3d);
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

describe('real weight on a bare frame (ADR-0066)', () => {
  it('extra weight climbs slower, and the Loadout screen says so', async () => {
    const heavy = cleanLoadout({ body: 'freestyle', weapons: ['rail', 'gun'], special: null });
    expect(buildStats(heavy).thrustToWeight).toBeLessThan(buildStats(DEFAULT_LOADOUTS.freestyle).thrustToWeight / 2);
    const a = await armedDrone();
    const b = await armedDrone(heavy);
    fly(a.physics, a.drone, { throttle: 1 }, 0.5);
    fly(b.physics, b.drone, { throttle: 1 }, 0.5);
    expect(b.drone.state.linvel.y).toBeLessThan(a.drone.state.linvel.y * 0.6);
    expect(b.drone.state.linvel.y).toBeGreaterThan(0);
  });

  it('overloading reads honestly: a rail gun on a 3" barely flies', () => {
    const racer = cleanLoadout({ body: 'racer', weapons: ['rail'], special: 'shield' });
    expect(buildStats(racer).handling.level).toBe('pig');
    expect(buildStats(DEFAULT_LOADOUTS.racer).handling.level).toBe('good');
  });

  it('a heavy payload slows the roll', () => {
    const heavy = cleanLoadout({ body: 'freestyle', weapons: ['rail', 'rail'], special: null });
    expect(buildStats(heavy).agility).toBeLessThan(buildStats(DEFAULT_LOADOUTS.freestyle).agility);
  });
});

describe('propellers as real props (ADR-0065)', () => {
  const base = DEFAULT_LOADOUTS.freestyle;
  const stats = (propeller: Loadout['propeller']) => buildStats({ ...base, propeller });

  it('heavy-lift props make the most thrust; ducts the least and are slowest', () => {
    expect(stats('heavy').thrustKg).toBeGreaterThan(stats('tri').thrustKg);
    expect(stats('ducted').thrustKg).toBeLessThan(stats('tri').thrustKg);
    expect(stats('ducted').topSpeedKmh).toBeLessThan(stats('tri').topSpeedKmh);
  });

  it('quad-blades are slower at the top end than bi-blades', () => {
    expect(stats('quad').topSpeedKmh).toBeLessThan(stats('bi').topSpeedKmh);
  });

  it('a different prop changes only the prop: same diameter, same frame', () => {
    for (const id of ['bi', 'quad', 'heavy', 'ducted'] as const) {
      const spec = quadSpec({ ...base, propeller: id });
      expect(spec.prop.radius).toBe(PHYSICAL_SPECS.freestyle.prop.radius);
      expect(spec.layout.reachX).toBe(PHYSICAL_SPECS.freestyle.layout.reachX);
      expect(spec.layout.reachZ).toBe(PHYSICAL_SPECS.freestyle.layout.reachZ);
    }
  });
});

describe('flight assist on the physical model (ADR-0037, ADR-0045)', () => {
  const tilt = (d: Drone) => new Vector3(0, 1, 0).applyQuaternion(d.state.rotation).angleTo(new Vector3(0, 1, 0)) / (Math.PI / 180);
  const start = (d: Drone) => d.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.8), true);

  it('Horizon and Angle level a quad when you let go; Acro holds the tilt', async () => {
    for (const [assist, levels] of [['horizon', true], ['angle', true], ['acro', false]] as const) {
      const { physics, drone } = await armedDrone('freestyle', assist);
      start(drone);
      fly(physics, drone, { throttle: hoverOf(DEFAULT_LOADOUTS.freestyle) }, 1.5);
      if (levels) expect(tilt(drone)).toBeLessThan(8);
      else expect(tilt(drone)).toBeGreaterThan(35);
    }
  });

  it('Angle never flips: full stick holds its max lean', async () => {
    const { physics, drone } = await armedDrone('freestyle', 'angle');
    fly(physics, drone, { throttle: hoverOf(DEFAULT_LOADOUTS.freestyle), roll: 1 }, 1.5);
    expect(tilt(drone)).toBeLessThan(FLIGHT_ASSIST.angle.maxAngleDeg + 8);
  });

  it('the X8 is always Horizon, even in Acro', async () => {
    const { physics, drone } = await armedDrone('x8', 'acro');
    start(drone);
    fly(physics, drone, { throttle: hoverOf(DEFAULT_LOADOUTS.x8) }, 2);
    expect(tilt(drone)).toBeLessThan(8);
  });
});
