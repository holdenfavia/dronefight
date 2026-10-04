# ADR-0041: Back to real-size flight physics; keep the 105° FOV

- **Status:** Accepted
- **Date:** 2026-10-04
- **Supersedes:** ADR-0040 (except its 105° default FOV)

## Context
ADR-0040 made the physics use the listed weights, retuned drag for a 25 m/s flat fall, capped top speed with prop pitch speed, and made drones collide at their drawn size. In play it was worse: drones could no longer fit through the gaps that make the maps fun, and the flight felt floatier, not less.

## Decision
- Flight physics and collision go back to exactly what they were before ADR-0040: real-size colliders (5" ~0.24 m), the tuned simulated masses (default builds fly as tuned; builds scale by weight relative to the default, ADR-0033), the original drag, no pitch-speed thrust loss.
- Hit spheres and drawn sizes are unchanged (ADR-0029, ADR-0036).
- Kept from ADR-0040: default FOV 105° (saved settings on the old 120° default migrate).

## Alternatives considered
- **Tune ADR-0040 further:** collision at drawn size closes the gaps regardless of tuning.

## Consequences
The Loadout screen's weights are again relative numbers (the physics scales a build by its weight over the default build's), not the simulated mass. Floatiness stays an open question; next things to try are separate knobs (fall speed, gravity slider) without touching collision size.
