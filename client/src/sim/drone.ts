import type RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { DroneClassId } from '../../../shared/drones';
import type { SpawnPoint } from '../../../shared/maps';
import { CRASH, INPUT, QUAD, QUAD_3D, type QuadParams, type Rates } from '../config';
import type { ControlState } from '../input/inputManager';
import { createFlightOutput, stepFlight, throttleSafeToArm, type FlightState } from './flightModel';
import type { Physics } from './physics';
import { stepWing, WING } from './wingModel';

const QUAD_PARAMS: Record<Exclude<DroneClassId, 'wing'>, QuadParams> = { freestyle: QUAD, quad3d: QUAD_3D };

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
  /** Wing Cobra in progress: Special is held (ADR-0014). */
  cobraActive = false;

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

  /** Switch flight model and collision shape. Takes effect immediately; callers respawn after (ADR-0013). */
  setClass(id: DroneClassId): void {
    this.droneClass = id;
    const { rapier, world } = this.physics;
    if (this.collider) world.removeCollider(this.collider, false);
    const e = id === 'wing' ? WING.halfExtents : QUAD_PARAMS[id].halfExtents;
    const mass = id === 'wing' ? WING.massKg : QUAD_PARAMS[id].massKg;
    const desc = rapier.ColliderDesc.cuboid(e.x, e.y, e.z).setMass(mass).setRestitution(0.2).setFriction(0.6);
    this.collider = world.createCollider(desc, this.body);
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
    this.cobraActive = false;
    this.state.motorOutput = 0;
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** Arming rules, run once per frame. Throttle must be in its safe position to arm, like Betaflight. */
  updateArming(control: ControlState): void {
    const params = this.droneClass === 'wing' ? QUAD : QUAD_PARAMS[this.droneClass];
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
   * Class special, once per frame (ADR-0014). The wing's Cobra runs while Special is held; physics
   * decides how hard it pitches (fast = violent, slow = barely). Returns true when a Cobra starts.
   */
  handleSpecial(control: ControlState): boolean {
    const was = this.cobraActive;
    this.cobraActive = this.droneClass === 'wing' && control.special && this.armed && !this.crashed;
    return this.cobraActive && !was;
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
    const out =
      this.droneClass === 'wing'
        ? stepWing(control, this.state, this.armed, dt, this.out, this.cobraActive)
        : stepFlight(control, this.state, rates, this.armed, dt, this.out, QUAD_PARAMS[this.droneClass]);
    this.state.motorOutput = out.motorOutput;
    this.state.time += dt;
    this.body.setAngvel(out.angvel, true);
    this.body.addForce(out.force, true);
  }

  /** After world.step(): update pose and detect crashes from sudden velocity changes. */
  postStep(dt: number): void {
    this.readBody();
    if (this.crashed) {
      this.crashTime += dt;
      return;
    }
    // Forces and gravity change velocity by well under 1 m/s per step; a big jump means we hit something.
    if (this.velBefore.distanceTo(this.state.linvel) > CRASH.impactDeltaV) {
      this.crashed = true;
      this.armed = false;
      this.crashTime = 0;
    }
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
