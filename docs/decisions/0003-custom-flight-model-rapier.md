# ADR-0003: Custom acro flight model; Rapier only for collisions

- **Status:** Superseded by ADR-0008 (2026-09-29)
- **Date:** 2026-09-29

## Context

Both players fly real FPV, so the flight feel matters most. General-purpose physics engines don't model quad flight, and tuning a rigid body's forces to feel like Betaflight acro is harder than writing the model directly.

## Decision

- Write our own flight model: stick inputs pass through **Betaflight-style rates** (RC rate, super rate, expo) to become target angular rates. Thrust acts along the body up-axis, with gravity, linear/quadratic drag and a simple prop wash effect.
- Run it at a **fixed timestep** (e.g. 250–500 Hz sub-steps), independent of render frame rate.
- Use **Rapier** (WASM) only for collision detection and response against arena geometry and other drones.
- All tunable values are named constants in one config module.

## Alternatives considered

- **Full rigid-body sim in Rapier/Cannon:** realistic in theory, hard to tune toward the "Betaflight feel."
- **Arcade model:** easy, but won't feel right to real pilots.

## Consequences

- We own the tuning. Expect several feel-iteration passes with both pilots.
- The fixed-step sim also gives deterministic-ish state for networking (ADR-0004).
