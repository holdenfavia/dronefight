# ADR-0062: Flight Division's flight-model code may be used

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** SPEC Hard rule 4 (no copied assets or branding)

## Context
The owner wants Dronefight's quads to fly like the Flight Division browser sim and shared links to its flight-model files (flight controller, drone profiles and tuning). Hard rule 4 said "Nothing from Flight Division or any other game", so ADR-0061 could only re-implement its physics ideas and numbers. The owner says the project is allowed to use that code and chose to change the rule (2026-10-13).

## Decision
- Flight Division's **flight-model code and tuning data** (physics, flight controller, drone profiles) may be used directly in Dronefight, adapted to our code and conventions (TypeScript strict, named config constants).
- Everything else in Hard rule 4 stands: no art, models, textures, sounds, UI or branding from Flight Division or any other game (ADR-0007).
- Code taken from it gets a comment naming where it came from, so it can be traced.

## Alternatives considered
- **Keep the rule and re-implement ideas only (ADR-0061's approach):** slower to match their feel, and the owner says use is allowed.
- **Drop Hard rule 4 entirely:** wider than needed; art and branding stay our own.

## Consequences
Future flight work may port their rotor, motor, battery, ground-effect and controller code. The owner holds the permission; if it is ever withdrawn, ported code must be replaced. Fetching their files in this environment only returns summaries, so porting needs the raw files (saved into the repo or pasted).
