# ADR-0006: Radios via Gamepad API behind a calibration layer

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

We want to fly with real radios. The primary device is the **DJI FPV Remote Controller 2** (bundled with the original DJI Avata), which shows up as a USB joystick. Every radio reports axes in a different order, range and polarity, so raw Gamepad API values can't be used directly.

## Decision

- Read controllers via the browser **Gamepad API**.
- All input flows through one **input layer** that outputs normalized `throttle`, `roll`, `pitch`, `yaw` in known ranges plus buttons (arm, reset, fire).
- A **mapping + calibration screen** lets the player assign each axis, invert it, record min/center/max endpoints, and set deadband. Profiles are saved per browser, keyed by controller ID.
- Keyboard and standard gamepads are fallbacks through the same layer.

## Alternatives considered

- **Hard-coded mappings per known radio:** brittle; breaks for any radio we haven't tested.
- **WebHID direct access:** more control but worse browser support and permission friction.

## Consequences

- Game code never touches raw axes (SPEC Hard rule 3).
- Chrome/Edge are primary targets for reliable gamepad support.
