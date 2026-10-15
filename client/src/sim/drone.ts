import type RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import { isWing, type DroneClassId } from '../../../shared/drones';
import type { SpawnPoint } from '../../../shared/maps';
import { CRASH, FLIGHT_ASSIST, INPUT, SIM, type FlightAssist, type HorizonParams, type Rates } from '../config';
import { defaultLoadout, totalKg, type Loadout } from '../../../shared/loadout';
import { AFTERBURNER } from '../../../shared/specials';
import { PROPELLERS } from '../../../shared/propellers';
import type { ControlState } from '../input/inputManager';
import { payload, quadSpec } from './build';
import { createFlightOutput, rateSetpoint, throttleSafeToArm, type FlightState } from './flightModel';
import { PhysicalQuad, type PhysicalOptions, type PhysicalStepInput } from './physicalQuad';
import type { Physics } from './physics';
import { stepWing, WING } from './wingModel';

/** Missile-flying hover autopilot (ADR-0025). */
const HOVER = {
  /** Level-out rate (1/s per radian of tilt), velocity brake (1/s), yaw spin damping per step, motor sound level. */
  levelRate: 6,
  brake: 2.5,
  spinDamp: 0.1,
  motorOutput: 0.3,
  /** Turning to watch the missile: rate per radian of error (1/s), capped (rad/s). */
  lookRate: 5,
  maxLookRate: 6,
} as const;
const WORLD_UP = new Vector3(0, 1, 0);
const HOVER_UP = new Vector3();
const HOVER_AXIS = new Vector3();
const HOVER_W = new Vector3();
const HOVER_F = new Vector3();
const HOVER_Q = new Quaternion();
const HOVER_QE = new Quaternion();
const HOVER_QI = new Quaternion();
const HOVER_E = new Euler();
const HOVER_DIR = new Vector3();
/** How far below the drone to look for ground for ground effect (m). */
const GROUND_EFFECT_RAY = 1.2;

/**
 * Angular velocity (world frame) that turns a quad with rotation `rot` at `from` so its FPV camera,
 * tilted up by `uptiltDeg`, looks at `target` with no roll. Proportional, capped (ADR-0027).
 */
export function lookAngvel(rot: Quaternion, from: Vector3, target: Vector3, uptiltDeg: number, out: Vector3): Vector3 {
  const dir = HOVER_DIR.subVectors(target, from);
  if (dir.lengthSq() < 1e-4) return out.set(0, 0, 0);
  dir.normalize();
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) - (uptiltDeg * Math.PI) / 180;
  HOVER_Q.setFromEuler(HOVER_E.set(pitch, yaw, 0, 'YXZ'));
  // Error rotation from where we are to where we want to be, as axis * angle.
  HOVER_QE.copy(HOVER_Q).multiply(HOVER_QI.copy(rot).invert());
  if (HOVER_QE.w < 0) HOVER_QE.set(-HOVER_QE.x, -HOVER_QE.y, -HOVER_QE.z, -HOVER_QE.w);
  const angle = 2 * Math.acos(Math.min(1, HOVER_QE.w));
  const s = Math.sqrt(Math.max(1e-9, 1 - HOVER_QE.w * HOVER_QE.w));
  return out.set(HOVER_QE.x / s, HOVER_QE.y / s, HOVER_QE.z / s).multiplyScalar(Math.min(angle * HOVER.lookRate, HOVER.maxLookRate));
}

/**
 * The local drone: a Rapier rigid body driven by its class's flight model (ADR-0008, ADR-0013).
 * Rapier integrates motion and resolves contacts; every force and rate command comes from the model.
 */
export class Drone {
  readonly body: RAPIER.RigidBody;
  armed = false;
  /** Seconds flown armed since the last respawn (the OSD's fly timer). */
  armedSeconds = 0;
  crashed = false;
  /** Seconds since the crash, for auto-respawn. */
  crashTime = 0;
  /** Arm switch is on but throttle is too high to arm. */
  armBlocked = false;
  /** Wing maneuver mode: Special is held (ADR-0022). */
  maneuverActive = false;
  /** Afterburner (ADR-0033): burning now, and fuel left (0..1). */
  afterburnerActive = false;
  afterburnerFuel = 1;
  /** Hold a hover in place, ignoring the sticks (while you fly a missile, ADR-0025). */
  autoHover = false;
  /** While hovering, turn so the FPV camera (tilted up by `uptiltDeg`) looks at this point (ADR-0027). */
  hoverLook: { target: Vector3; uptiltDeg: number } | null = null;

  readonly state: FlightState = {
    rotation: new Quaternion(),
    linvel: new Vector3(),
    angvel: new Vector3(),
    motorOutput: 0,
    time: 0,
  };

  /** Previous and current physics poses, for render interpolation. */
  readonly prevPos = new Vector3();
  readonly currPos = new Vector3();
  readonly prevRot = new Quaternion();
  readonly currRot = new Quaternion();

  private readonly out = createFlightOutput();
  private readonly velBefore = new Vector3();
  private readonly spawnRot = new Quaternion();
  private collider: RAPIER.Collider | null = null;
  private droneClass: DroneClassId = 'freestyle';
  private loadoutNow: Loadout = defaultLoadout('freestyle');
  /** The pilot's flight assist (ADR-0045), and the self-levelling in use (the X8 always has its own). */
  private assist: FlightAssist = 'acro';
  private horizon: HorizonParams | undefined;
  /** Quads fly the physical model (ADR-0063, ADR-0064): real motors, props, battery and a PID loop. */
  private physical = new PhysicalQuad();
  private readonly physicalIn: PhysicalStepInput = { throttle: 0, setpoint: new Vector3(), roll: 0, pitch: 0, yaw: 0, armed: false, agl: Infinity };
  private readonly physicalOpt: PhysicalOptions = { thrust: 1 };
  private groundRay: RAPIER.Ray | null = null;


  constructor(
    private readonly physics: Physics,
    private spawn: SpawnPoint,
    droneClass: DroneClassId = 'freestyle',
  ) {
    const bodyDesc = physics.rapier.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.3);
    this.body = physics.world.createRigidBody(bodyDesc);
    this.setClass(droneClass);
    this.respawn();
  }

  get classId(): DroneClassId {
    return this.droneClass;
  }

  get loadout(): Loadout {
    return this.loadoutNow;
  }

  /** Switch to a body's default loadout. */
  setClass(id: DroneClassId): void {
    this.setLoadout(defaultLoadout(id));
  }

  /**
   * Fly this loadout (ADR-0033): quads get their parts, propeller (ADR-0065) and payload (ADR-0066) in the
   * physical model; the wing its own model at its all-up weight. Takes effect immediately; callers respawn after.
   */
  setLoadout(loadout: Loadout): void {
    const id = loadout.body;
    this.loadoutNow = loadout;
    this.droneClass = id;
    const { rapier, world } = this.physics;
    if (this.collider) world.removeCollider(this.collider, false);
    let desc: RAPIER.ColliderDesc;
    if (isWing(id)) {
      const e = WING.halfExtents;
      this.horizon = undefined;
      desc = rapier.ColliderDesc.cuboid(e.x, e.y, e.z).setMass(totalKg(loadout));
    } else {
      const spec = quadSpec(loadout);
      this.physical = new PhysicalQuad(spec, payload(loadout, spec));
      this.horizon = spec.horizon ?? (this.assist === 'acro' ? undefined : FLIGHT_ASSIST[this.assist]);
      const [hx, hy, hz] = spec.hull;
      // Real mass, centre of mass and inertia from the parts and what they carry (ADR-0063, ADR-0066).
      const hw = this.physical.hw;
      desc = rapier.ColliderDesc.cuboid(hx, hy, hz).setMassProperties(hw.mass, { x: hw.centre[0], y: hw.centre[1], z: hw.centre[2] }, { x: hw.inertia[0], y: hw.inertia[1], z: hw.inertia[2] }, { x: 0, y: 0, z: 0, w: 1 });
    }
    desc.setRestitution(0.2).setFriction(0.6);
    // The physical model turns the body with torques, so nothing may damp its rotation; the wing sets it directly.
    this.body.setAngularDamping(isWing(id) ? 0.3 : 0);
    this.collider = world.createCollider(desc, this.body);
  }

  /** Choose a flight assist (ADR-0045). The X8 keeps its own horizon mode whatever is chosen (ADR-0037). */
  setAssist(assist: FlightAssist): void {
    if (assist === this.assist) return;
    this.assist = assist;
    if (!this.isWing) this.horizon = this.physical.spec.horizon ?? (assist === 'acro' ? undefined : FLIGHT_ASSIST[assist]);
  }

  /** Bodies flown by the physical model (ADR-0063, ADR-0064): every quad. The wing has its own model. */
  private get isPhysical(): boolean {
    return !this.isWing;
  }

  private get isWing(): boolean {
    return isWing(this.droneClass);
  }

  /** A reversible (3D) quad's throttle rests at center; everything else at the bottom. */
  get restingThrottle(): number {
    return !this.isWing && this.physical.spec.reversible ? 0.5 : 0;
  }

  /** Respawn at a different pad (match spawns, ADR-0009). Later plain respawns use it too. */
  respawnAt(spawn: SpawnPoint): void {
    this.spawn = spawn;
    this.respawn();
  }

  /** Shot down: same as a crash, the quad loses power and falls. */
  kill(): void {
    if (this.crashed) return;
    this.crashed = true;
    this.armed = false;
    this.crashTime = 0;
  }

  respawn(): void {
    const [x, y, z] = this.spawn.pos;
    const wing = this.isWing;
    // Wings hand-launch: in the air, at flying speed, pointed along the nearest street/lane axis (ADR-0013).
    const yawDeg = wing ? Math.round(this.spawn.yawDeg / 90) * 90 : this.spawn.yawDeg;
    this.spawnRot.setFromAxisAngle(new Vector3(0, 1, 0), (yawDeg * Math.PI) / 180);
    const r = this.spawnRot;
    const lift = wing ? WING.launchHeight : this.physical.spec.hull[1] + 0.01;
    this.body.setTranslation({ x, y: y + lift, z }, true);
    this.body.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w }, true);
    const launch = new Vector3(0, 0, wing ? -WING.launchSpeed : 0).applyQuaternion(r);
    this.body.setLinvel({ x: launch.x, y: launch.y, z: launch.z }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.armed = false;
    this.armedSeconds = 0;
    this.crashed = false;
    this.crashTime = 0;
    this.maneuverActive = false;
    this.afterburnerActive = false;
    this.afterburnerFuel = 1;
    this.state.motorOutput = 0;
    this.physical.reset();
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** Arming rules, run once per frame. Throttle must be in its safe position to arm, like Betaflight. */
  updateArming(control: ControlState): void {
    const reversible = !this.isWing && !!this.physical.spec.reversible;
    const throttleLow = throttleSafeToArm(control.throttle, reversible, INPUT.armThrottleMax);
    if (this.crashed) {
      this.armed = false;
      this.armBlocked = false;
      return;
    }
    if (control.armSwitch === null) {
      // No arm switch mapped: arm the first time throttle is low, stay armed until a crash.
      if (!this.armed && throttleLow) this.armed = true;
      this.armBlocked = false;
      return;
    }
    if (!control.armSwitch) {
      this.armed = false;
      this.armBlocked = false;
    } else if (!this.armed) {
      this.armed = throttleLow;
      this.armBlocked = !throttleLow;
    }
  }

  /**
   * Class special, once per frame. The wing's maneuver mode is on while Special is held, or while a
   * radio switch mapped to it is on (ADR-0022). Returns true when it switches on.
   */
  handleSpecial(control: ControlState): boolean {
    const was = this.maneuverActive;
    const special = this.loadoutNow.special;
    this.maneuverActive = special === 'maneuver' && this.isWing && control.special && !this.crashed;
    // Afterburner (ADR-0033): held, while there's fuel.
    this.afterburnerActive = special === 'afterburner' && control.special && this.armed && !this.crashed && this.afterburnerFuel > 0;
    return this.maneuverActive && !was;
  }

  /** The OSD's flight mode: the wing's maneuver mode, or the self-levelling a quad flies with (ADR-0037, ADR-0045). */
  get flightMode(): 'ACRO' | 'HORIZON' | 'ANGLE' | 'MANEUVER' {
    if (this.isWing) return this.maneuverActive ? 'MANEUVER' : 'ACRO';
    if (!this.horizon) return 'ACRO';
    return this.horizon.transition === Infinity ? 'ANGLE' : 'HORIZON';
  }

  /** Battery voltage under load (V), sagging on punches like a real pack; null for the wing, which has no battery model. */
  get batteryVolts(): number | null {
    if (this.isWing) return null;
    const { battery } = this.physical.spec;
    return this.physical.sag * battery.cells * battery.cellVoltage;
  }

  /** Wing past its stall angle right now (for the HUD). */
  get stalled(): boolean {
    return this.isWing && !this.crashed && this.speed > 2 && Math.abs(this.out.alpha) > (WING.stallDeg * Math.PI) / 180;
  }

  /** Before world.step(): compute and apply flight forces. */
  preStep(control: ControlState, rates: Rates, dt: number): void {
    this.readBody();
    this.velBefore.copy(this.state.linvel);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);

    this.body.resetForces(true);
    this.body.resetTorques(true);
    if (this.crashed) {
      this.state.motorOutput = 0;
      return;
    }
    if (this.armed) this.armedSeconds += dt;
    if (this.autoHover && this.armed && !this.isWing) {
      this.hover();
      return;
    }
    // Afterburner fuel burns while lit and refills while not.
    const burning = this.afterburnerActive && this.afterburnerFuel > 0;
    this.afterburnerFuel = burning
      ? Math.max(0, this.afterburnerFuel - dt / AFTERBURNER.fuelSeconds)
      : Math.min(1, this.afterburnerFuel + dt / AFTERBURNER.refillSeconds);
    if (this.isPhysical) {
      this.stepPhysical(control, rates, dt, burning);
      return;
    }
    const prop = this.wingProp;
    const out = stepWing(control, this.state, this.armed, dt, this.out, this.maneuverActive, prop.wing.thrust * (burning ? 1 + AFTERBURNER.thrustBoost : 1), {
      id: prop.id,
      spool: prop.wing.spool,
      jet: prop.jet,
    });
    this.state.motorOutput = out.motorOutput;
    this.state.time += dt;
    this.body.setAngvel(out.angvel, true);
    this.body.addForce(out.force, true);
  }

  /** The physical model (ADR-0063): it returns a force and a torque, and Rapier turns and moves the body. */
  private stepPhysical(control: ControlState, rates: Rates, dt: number, burning: boolean): void {
    const inp = this.physicalIn;
    inp.throttle = control.throttle;
    inp.roll = control.roll;
    inp.pitch = control.pitch;
    inp.yaw = control.yaw;
    inp.armed = this.armed;
    rateSetpoint(control, this.state.rotation, rates, this.horizon, inp.setpoint);
    inp.agl = this.groundBelow();
    this.physicalOpt.thrust = burning ? 1 + AFTERBURNER.thrustBoost : 1;
    const q = this.physical;
    q.step(dt, this.state.rotation, this.state.linvel, this.state.angvel, inp, this.physicalOpt);
    this.state.motorOutput = q.motorOutput;
    this.state.time += dt;
    this.body.addForce(q.force, true);
    this.body.addTorque(q.torque, true);
  }

  /** Distance to whatever is just below the drone, for ground effect; Infinity when nothing is within reach. */
  private groundBelow(): number {
    const { rapier, world } = this.physics;
    const p = this.currPos;
    this.groundRay ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.groundRay.origin = { x: p.x, y: p.y, z: p.z };
    const hit = world.castRay(this.groundRay, GROUND_EFFECT_RAY, true, undefined, undefined, undefined, this.body);
    return hit ? hit.timeOfImpact : Infinity;
  }

  /**
   * Autopilot hover (ADR-0025): level out (keeping heading), cancel gravity and bleed off velocity.
   * A game autopilot, not a flight controller: it pushes the body directly.
   */
  private hover(): void {
    const rot = this.state.rotation;
    if (this.hoverLook) {
      // Turn so the tilted-up FPV camera looks at the target (ADR-0027).
      this.body.setAngvel(lookAngvel(rot, this.currPos, this.hoverLook.target, this.hoverLook.uptiltDeg, HOVER_W), true);
    } else {
      const up = HOVER_UP.set(0, 1, 0).applyQuaternion(rot);
      // Rotate the body's up back to world up, and damp any yaw spin.
      const axis = HOVER_AXIS.crossVectors(up, WORLD_UP);
      const spin = this.state.angvel;
      HOVER_W.copy(axis).multiplyScalar(HOVER.levelRate).setY(spin.y * (1 - HOVER.spinDamp));
      this.body.setAngvel(HOVER_W, true);
    }
    const mass = this.body.mass();
    const v = this.state.linvel;
    HOVER_F.set(-v.x * HOVER.brake * mass, (SIM.gravity - v.y * HOVER.brake) * mass, -v.z * HOVER.brake * mass);
    this.body.addForce(HOVER_F, true);
    this.state.motorOutput = HOVER.motorOutput;
  }

  /** After world.step(): update pose and detect crashes from sudden velocity changes. */
  postStep(dt: number): void {
    this.readBody();
    if (this.crashed) {
      this.crashTime += dt;
      return;
    }
    // Forces and gravity change velocity by well under 1 m/s per step; a big jump means we hit something.
    // Ducted props bounce you off walls that would otherwise crash you (ADR-0035).
    if (this.velBefore.distanceTo(this.state.linvel) > CRASH.impactDeltaV * PROPELLERS[this.loadoutNow.propeller].crashTolerance) {
      this.crashed = true;
      this.armed = false;
      this.crashTime = 0;
    }
  }

  /** The wing's propeller or jet (ADR-0035, ADR-0038). */
  private get wingProp() {
    return PROPELLERS[this.loadoutNow.propeller];
  }

  get speed(): number {
    return this.state.linvel.length();
  }

  private readBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    const w = this.body.angvel();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
    this.state.rotation.copy(this.currRot);
    this.state.linvel.set(v.x, v.y, v.z);
    this.state.angvel.set(w.x, w.y, w.z);
  }
}
