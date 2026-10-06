import type RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import type { DroneClassId } from '../../../shared/drones';
import type { SpawnPoint } from '../../../shared/maps';
import { CRASH, FLIGHT_ASSIST, INPUT, QUAD, QUAD_3D, RACER, SIM, X8, type FlightAssist, type QuadParams, type Rates } from '../config';
import { defaultLoadout, loadFactor, type Loadout } from '../../../shared/loadout';
import { AFTERBURNER } from '../../../shared/specials';
import { PROPELLERS } from '../../../shared/propellers';
import type { ControlState } from '../input/inputManager';
import { createFlightOutput, stepFlight, throttleSafeToArm, type FlightState } from './flightModel';
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

const QUAD_PARAMS: Record<Exclude<DroneClassId, 'wing'>, QuadParams> = { freestyle: QUAD, quad3d: QUAD_3D, racer: RACER, x8: X8 };

/**
 * A quad build's flight parameters (ADR-0033, ADR-0035): its body's tuning, loaded by its weight, then
 * changed by its propellers (lift, response, spool, drag, prop wash).
 */
export function flightParams(loadout: Loadout, assist: FlightAssist = 'acro'): QuadParams {
  const base = loadedParams(QUAD_PARAMS[loadout.body === 'wing' ? 'freestyle' : loadout.body], loadFactor(loadout));
  const p = PROPELLERS[loadout.propeller];
  return {
    ...base,
    // The pilot's flight assist (ADR-0045); the X8 keeps its own horizon mode whatever is chosen (ADR-0037).
    horizon: base.horizon ?? (assist === 'acro' ? undefined : FLIGHT_ASSIST[assist]),
    thrustToWeight: base.thrustToWeight * p.thrust,
    rateTau: base.rateTau * p.response,
    motorTau: base.motorTau * p.spool,
    dragQuadratic: { x: base.dragQuadratic.x * p.drag, y: base.dragQuadratic.y * p.drag, z: base.dragQuadratic.z * p.drag },
    dragLinear: base.dragLinear * p.drag,
    propWash: { ...base.propWash, maxDegPerSec: base.propWash.maxDegPerSec * p.wash },
  };
}

/**
 * Rough top speed, 0..100, for the stat sheet (ADR-0035): flat-out speed goes with the square root of thrust
 * over drag. Scaled so a stock Freestyle reads 70.
 */
export function speedScore(loadout: Loadout): number {
  if (loadout.body === 'wing') return Math.round(Math.min(100, 85 * Math.sqrt(PROPELLERS[loadout.propeller].thrust / loadFactor(loadout))));
  const p = flightParams(loadout);
  const v = Math.sqrt((p.thrustToWeight * p.massKg) / p.dragQuadratic.z);
  const ref = Math.sqrt((QUAD.thrustToWeight * QUAD.massKg) / QUAD.dragQuadratic.z);
  return Math.round(Math.max(0, Math.min(100, (70 * v) / ref)));
}

/**
 * How snappy a build feels, 0..100, for the Loadout stat sheet (ADR-0033): the body's rate response, slowed
 * by load exactly as in flight (loadedParams). A 3" racer at its default build is 100.
 */
export function agilityScore(loadout: Loadout): number {
  const k = loadFactor(loadout);
  if (loadout.body === 'wing') return Math.round(Math.min(100, 62 / Math.sqrt(k) / PROPELLERS[loadout.propeller].response));
  const tau = flightParams(loadout).rateTau;
  return Math.round(Math.max(0, Math.min(100, (100 * RACER.rateTau) / tau)));
}

/**
 * A quad's flight parameters for a loadout `k` times heavier than its tuned default (ADR-0033): more mass,
 * the same thrust (so a lower thrust-to-weight), and slower response as the load grows.
 */
export function loadedParams(base: QuadParams, k: number): QuadParams {
  return { ...base, massKg: base.massKg * k, thrustToWeight: base.thrustToWeight / k, rateTau: base.rateTau * Math.sqrt(k) };
}

/**
 * The local drone: a Rapier rigid body driven by its class's flight model (ADR-0008, ADR-0013).
 * Rapier integrates motion and resolves contacts; every force and rate command comes from the model.
 */
export class Drone {
  readonly body: RAPIER.RigidBody;
  armed = false;
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
  /** The loadout and the flight parameters it gives (ADR-0033); boosted = with the afterburner lit. */
  private loadoutNow: Loadout = defaultLoadout('freestyle');
  private params: QuadParams = QUAD;
  private boosted: QuadParams = QUAD;
  /** The pilot's flight assist (ADR-0045). */
  private assist: FlightAssist = 'acro';


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
   * Fly this loadout (ADR-0033): its body's flight model and collision shape, with mass scaled by how much
   * heavier it is than the body's default. Takes effect immediately; callers respawn after.
   */
  setLoadout(loadout: Loadout): void {
    const id = loadout.body;
    this.loadoutNow = loadout;
    this.droneClass = id;
    const k = loadFactor(loadout);
    if (id !== 'wing') {
      this.params = flightParams(loadout, this.assist);
      this.boosted = { ...this.params, thrustToWeight: this.params.thrustToWeight * (1 + AFTERBURNER.thrustBoost) };
    }
    const { rapier, world } = this.physics;
    if (this.collider) world.removeCollider(this.collider, false);
    const e = id === 'wing' ? WING.halfExtents : QUAD_PARAMS[id].halfExtents;
    const mass = id === 'wing' ? WING.massKg * k : this.params.massKg;
    const desc = rapier.ColliderDesc.cuboid(e.x, e.y, e.z).setMass(mass).setRestitution(0.2).setFriction(0.6);
    this.collider = world.createCollider(desc, this.body);
  }

  /** Choose a flight assist (ADR-0045). Rebuilds the flight parameters only when it changes. */
  setAssist(assist: FlightAssist): void {
    if (assist === this.assist) return;
    this.assist = assist;
    this.setLoadout(this.loadoutNow);
  }

  /** The 3D quad's throttle rests at center; everything else at the bottom. */
  get restingThrottle(): number {
    return this.droneClass === 'quad3d' ? 0.5 : 0;
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
    const wing = this.droneClass === 'wing';
    // Wings hand-launch: in the air, at flying speed, pointed along the nearest street/lane axis (ADR-0013).
    const yawDeg = wing ? Math.round(this.spawn.yawDeg / 90) * 90 : this.spawn.yawDeg;
    this.spawnRot.setFromAxisAngle(new Vector3(0, 1, 0), (yawDeg * Math.PI) / 180);
    const r = this.spawnRot;
    const lift = wing ? WING.launchHeight : QUAD.halfExtents.y + 0.01;
    this.body.setTranslation({ x, y: y + lift, z }, true);
    this.body.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w }, true);
    const launch = new Vector3(0, 0, wing ? -WING.launchSpeed : 0).applyQuaternion(r);
    this.body.setLinvel({ x: launch.x, y: launch.y, z: launch.z }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.armed = false;
    this.crashed = false;
    this.crashTime = 0;
    this.maneuverActive = false;
    this.afterburnerActive = false;
    this.afterburnerFuel = 1;
    this.state.motorOutput = 0;
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** Arming rules, run once per frame. Throttle must be in its safe position to arm, like Betaflight. */
  updateArming(control: ControlState): void {
    const params = this.droneClass === 'wing' ? QUAD : this.params;
    const throttleLow = throttleSafeToArm(control.throttle, params, INPUT.armThrottleMax);
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
    this.maneuverActive = special === 'maneuver' && this.droneClass === 'wing' && control.special && !this.crashed;
    // Afterburner (ADR-0033): held, while there's fuel.
    this.afterburnerActive = special === 'afterburner' && control.special && this.armed && !this.crashed && this.afterburnerFuel > 0;
    return this.maneuverActive && !was;
  }

  /** Wing past its stall angle right now (for the HUD). */
  get stalled(): boolean {
    return this.droneClass === 'wing' && !this.crashed && this.speed > 2 && Math.abs(this.out.alpha) > (WING.stallDeg * Math.PI) / 180;
  }

  /** Before world.step(): compute and apply flight forces. */
  preStep(control: ControlState, rates: Rates, dt: number): void {
    this.readBody();
    this.velBefore.copy(this.state.linvel);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);

    this.body.resetForces(true);
    if (this.crashed) {
      this.state.motorOutput = 0;
      return;
    }
    if (this.autoHover && this.armed && this.droneClass !== 'wing') {
      this.hover();
      return;
    }
    // Afterburner fuel burns while lit and refills while not.
    const burning = this.afterburnerActive && this.afterburnerFuel > 0;
    this.afterburnerFuel = burning
      ? Math.max(0, this.afterburnerFuel - dt / AFTERBURNER.fuelSeconds)
      : Math.min(1, this.afterburnerFuel + dt / AFTERBURNER.refillSeconds);
    const out =
      this.droneClass === 'wing'
        ? stepWing(control, this.state, this.armed, dt, this.out, this.maneuverActive, this.wingProp.thrust * (burning ? 1 + AFTERBURNER.thrustBoost : 1), this.wingProp)
        : stepFlight(control, this.state, rates, this.armed, dt, this.out, burning ? this.boosted : this.params);
    this.state.motorOutput = out.motorOutput;
    this.state.time += dt;
    this.body.setAngvel(out.angvel, true);
    this.body.addForce(out.force, true);
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
