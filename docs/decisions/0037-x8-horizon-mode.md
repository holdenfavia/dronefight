# ADR-0037: The X8 flies in horizon mode

- **Status:** Accepted
- **Date:** 2026-10-04
- **Amends:** SPEC "Flight: acro (rate) mode only" and "Out of scope: angle/horizon mode" (for the X8 only)

## Context
The X8 heavy lifter (four hardpoints, 180 HP, ADR-0033) is too strong even after its bigger hitbox (ADR-0036). The pilots chose to balance it with a flight mode instead of more stat cuts: a self-levelling mode makes it a stable gun platform that can't dodge like an acro quad.

## Decision
- The **X8 always flies in horizon mode**; every other body stays acro-only.
- Horizon mode, Betaflight-style: near center stick the roll and pitch sticks set a **tilt angle** (full stick = 55°) and the drone levels itself when you let go; the self-levelling fades out with stick travel and is gone past **75% stick**, where the sticks are plain acro rates again, so a full-stick flip or roll still works. Yaw is always a rate.
- Levelling strength, max angle and transition live in `X8.horizon` (`client/src/config.ts`); the flight model is `stepFlight` in `client/src/sim/flightModel.ts`.
- The Loadout screen says so on the X8.

## Alternatives considered
- **Angle mode** (never flips): a harder nerf; the pilots picked horizon.
- **Cap the X8's rates in acro:** keeps the acro feel, but makes it a slower acro quad rather than a different-feeling drone.

## Consequences
SPEC Flight now says acro only, except the X8 (horizon). Angle mode and a pilot-selectable flight mode stay out of scope. Flight only: the server doesn't simulate flight.
