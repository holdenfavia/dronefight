# ADR-0008: Custom flight model; Rapier applies all forces and integrates motion

- **Status:** Accepted
- **Date:** 2026-09-29
- **Supersedes:** ADR-0003

## Context

ADR-0003 said to use Rapier "only for collisions." In Phase 1 the drone was built as a Rapier dynamic body: our flight model computes the forces, and Rapier applies them, moves the body and resolves contacts. That gives realistic crashes and tumbling for free, but it contradicted ADR-0003's wording. We chose to make that the rule rather than hand-write motion integration and collision response.

## Decision

- **Our flight model decides what the quad does.** `client/src/sim/flightModel.ts` turns sticks into Betaflight-style rates (RC rate, super rate, expo), motor output with spool lag, thrust along the body up-axis, per-axis drag, and prop wash. All tunables live in `client/src/config.ts`.
- **Rapier applies every force and moves the body.** Thrust and drag go in via `addForce`. Gravity is Rapier's world gravity (9.81 m/s², real). Rapier integrates position and velocity and resolves all contacts.
- **Rotation is commanded, not torqued.** Each step, the flight model sets the body's angular velocity toward the rate setpoint (time constant `QUAD.rateTau`). This stands in for a well-tuned Betaflight PID loop.
- **Crashed or disarmed, the body belongs to Rapier.** No control authority; it tumbles and bounces physically.
- Fixed timestep: flight model and Rapier step together at `SIM.hz` (500 Hz), independent of frame rate.
- Flight feel is guarded by tests in `client/src/sim/flightModel.test.ts` (hover throttle, zero-throttle drop, rate response).

## Alternatives considered

- **Rapier only for collisions, with our own integrator (ADR-0003 as written):** more code, and we'd have to hand-write collision response and crash tumbling.
- **Torque-based rotation with a simulated PID loop:** could add realistic overshoot and wobble, but it's harder to tune and less crisp. Revisit if the feel demands it.
- **Full rigid-body quad in Rapier (per-motor thrust at each arm):** most "physical," but hard to make it feel like Betaflight acro.

## Consequences

- Flight feel is tuned only through `config.ts` and the flight model, never by changing Rapier settings on the drone (damping, gravity scale), so the feel stays in one place.
- Gravity stays at real-world value. Floatiness gets fixed through idle thrust and drag.
- For Phase 2, remote drones are not simulated. They're rendered from snapshots (ADR-0004); only the local drone runs this model.
