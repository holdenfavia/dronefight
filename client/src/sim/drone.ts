import type RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { CRASH, INPUT, QUAD, type Rates } from '../config';
import type { ControlState } from '../input/inputManager';
import { createFlightOutput, stepFlight, type FlightState } from './flightModel';
import type { SpawnPoint } from '../../../shared/maps';
import type { Physics } from './physics';

/**
 * The local quad: a Rapier rigid body driven by our flight model (ADR-0008).
 * Rapier integrates motion and resolves contacts; every force and rate command comes from stepFlight().
 */
export class Drone {
  readonly body: RAPIER.RigidBody;
  armed = false;
  crashed = false;
  /** Seconds since the crash, for auto-respawn. */
  crashTime = 0;
  /** Arm switch is on but throttle is too high to arm. */
  armBlocked = false;

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

  constructor(
    physics: Physics,
    private spawn: SpawnPoint,
  ) {
    const { rapier, world } = physics;
    const bodyDesc = rapier.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.3);
    this.body = world.createRigidBody(bodyDesc);
    const e = QUAD.halfExtents;
    const collider = rapier.ColliderDesc.cuboid(e.x, e.y, e.z).setMass(QUAD.massKg).setRestitution(0.2).setFriction(0.6);
    world.createCollider(collider, this.body);
    this.respawn();
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
    this.spawnRot.setFromAxisAngle(new Vector3(0, 1, 0), (this.spawn.yawDeg * Math.PI) / 180);
    const r = this.spawnRot;
    this.body.setTranslation({ x, y: y + QUAD.halfExtents.y + 0.01, z }, true);
    this.body.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.armed = false;
    this.crashed = false;
    this.crashTime = 0;
    this.state.motorOutput = 0;
    this.readBody();
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** Arming rules, run once per frame. Throttle must be low to arm, like Betaflight. */
  updateArming(control: ControlState): void {
    const throttleLow = control.throttle <= INPUT.armThrottleMax;
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
    const out = stepFlight(control, this.state, rates, this.armed, dt, this.out);
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
