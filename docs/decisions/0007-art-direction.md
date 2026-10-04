# ADR-0007: Art direction

- **Status:** Accepted (Playground exception: ADR-0019; menu style amended by ADR-0039)
- **Date:** 2026-09-29

## Context

We like the look of Flight Division (flightdivision.com): bright, clean, industrial-playground FPV. We want that feel without copying anything.

## Decision

- **Environment:** bright sunny blue sky, soft clean lighting, concrete, orange steel scaffolding and frames, platforms, ramps and gaps built for flying through and dogfighting around.
- **Palette:** orange / black / white as the core, with blue sky. A second team color TBD in Phase 3.
- **Rendering style:** stylized-realistic, clean surfaces, not gritty or post-apocalyptic.
- **UI/HUD:** bold condensed all-caps typeface, high contrast, occasional hand-written accent notes.
- **Performance first:** baked lighting, instancing and compressed textures. No effect that breaks SPEC Hard rule 2.

## Alternatives considered

- **Gritty realistic / military:** heavier to render and not the vibe we want.
- **Low-poly flat:** cheap, but less exciting than the reference.

## Consequences

- **Inspiration only.** No Flight Division logos, crash-test robot mascot, name, models, textures or screenshots in the project (SPEC Hard rule 4).
- All assets must be original, generated in code, or properly licensed (e.g. CC0), with the source noted.
