# ADR-0063: The 5" flies a physical model ported from Flight Division

- **Status:** Accepted
- **Date:** 2026-10-14
- **Amends:** ADR-0008 (flight model), ADR-0061 (5" tuning)

## Context
After ADR-0061 the owner still found the 5" less powerful and less responsive than Flight Division's, and asked for the two to fly identically, using their flight code (allowed by ADR-0062). Their sim does not set rotation rates directly: it simulates the real parts and a Betaflight flight controller, and lets the physics engine turn and move the body.

## Decision
- The **Freestyle 5"** flies a physical model (`client/src/sim/physicalQuad.ts`, ported from Flight Division's flight code):
  - four blade-element rotors (thrust with an induced-inflow solve, vortex-ring and windmill handling, hub drag and blade flapping, shaft torque, wake turbulence) and ground effect;
  - motors and battery simulated electrically (1950 kV, winding resistance, current limits, back EMF, 6S sag and polarisation), so spool-up and power come from the hardware;
  - a Betaflight-style PID loop at 960 Hz (RC smoothing, feedforward, D-min, I-term relax, anti-gravity, TPA, airmode, dynamic idle) with a quad-X mixer;
  - real mass (0.65 kg), centre of mass and inertia from the parts; body drag from drag areas; Rapier integrates the force and torque (no angular damping).
- Its numbers are Flight Division's freestyle profile (`PHYSICAL_QUAD` in `client/src/config.ts`). Measured: static thrust-to-weight 9.1, hover ~20% throttle, full-throttle punch past 30 m/s within 1 s, full-stick roll and pitch reach max rate in ~60 ms, flat fall ~24 m/s.
- Pilot rates (Betaflight classic) and flight assists still set the rate setpoint. Loadout weight scales mass and inertia; propellers scale thrust and rotor inertia; the afterburner scales thrust.
- The 3D quad, racer and X8 stay on the simple model (ADR-0061) for now; the 5"'s simple-model thrust-to-weight is set to 9.13 so both agree.

## Alternatives considered
- **Keep tuning the simple model:** it can approach the numbers but not the feel of real motor spool, PID and inertia.
- **Port it to every body now:** the 3D quad needs reversible motors and the X8 eight rotors; done body by body later.

## Consequences
The 5"'s feel is now tuned through its parts and PID (`PHYSICAL_QUAD`), not `QUAD`'s rate and spool constants. The flight costs a little more CPU (two controller substeps per physics step). Other bodies can move to the physical model with their own specs.
