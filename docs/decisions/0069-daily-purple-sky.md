# ADR-0069: Daily purple sky

- **Status:** Accepted
- **Date:** 2026-10-15
- **Amends:** ADR-0007 (bright sunny skies)

## Context
The owner asked for the sky to turn purple for a short window every day, at the same moment for every pilot.

## Decision
- From **2:02 to 2:22 pm US Central time** (`America/Chicago`, so it follows daylight saving) every day, the sky dome is purple: zenith `#4b1d8f`, horizon `#d9b8ff` (`PALETTE.purpleZenith` / `purpleHorizon` in `client/src/world/scene.ts`). The sunset glow and sun disc stay.
- Outside that window the sky is the normal ADR-0007 sky.
- Each client checks its own clock once a second (`client/src/world/purpleSky.ts`), so the sky flips live during play. Only the sky dome changes; fog, lights and maps stay as they are.

## Alternatives considered
- **Purple all the time:** the owner wanted it temporary.
- **Each player's local time:** the owner chose one timezone so everyone sees it together.
- **Server-driven:** unnecessary; the device clock is accurate enough and works in solo too.

## Consequences
A player whose device clock is wrong sees the window at the wrong time. Changing the window or colours means editing `purpleSky.ts` and the palette, then a deploy.
