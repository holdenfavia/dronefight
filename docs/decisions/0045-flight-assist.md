# ADR-0045: Pilot-selectable flight assist (Acro, Horizon, Angle) and altitude hold

- **Status:** Accepted for Acro/Horizon/Angle; altitude hold and the Horizon-on-touch default superseded by ADR-0050
- **Date:** 2026-10-05
- **Amends:** ADR-0037 (the X8 stays locked to horizon); SPEC Flight and out-of-scope ("angle mode or pilot-selectable flight modes")

## Context
Touch pilots and new pilots can't fly pure acro on thumbs (ADR-0044). The pilots want everyone to be able to play across the drones, while the standard drones keep real acro by default.

## Decision
- **Flight assist** is a pilot setting for quad bodies: **Acro** (rates, no levelling; the default for radios, gamepads and keyboard), **Horizon** (levels near center stick, acro past 75% stick; the default on touch) or **Angle** (levels, never flips: the stick sets a tilt up to 45°).
- **The X8 is always Horizon**, whatever the setting (ADR-0037).
- **Altitude hold** (touch, on by default there): the throttle stick commands climb rate, centered holds height. Available on quads only.
- The wing keeps its own flight model; assist doesn't apply to it yet.
- Assist is a flight-model choice only; the server doesn't simulate flight.

## Alternatives considered
- **Assist locked per body:** simpler but shuts new pilots out of most drones.
- **Assist only on touch:** gamepad and keyboard players benefit too.

## Consequences
Angle and Horizon can't do fast flips, which is their natural trade-off; no extra penalty. Settings gain a Flight assist choice; the Touch controls screen shows it too.
