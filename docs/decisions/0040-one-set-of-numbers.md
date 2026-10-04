# ADR-0040: One set of numbers: physics uses the listed weight and thrust, collides at drawn size

- **Status:** Superseded by ADR-0041 (2026-10-04), except the 105° default FOV
- **Date:** 2026-10-04
- **Supersedes:** ADR-0029's "physics stay real 5\"" (collision size)
- **Amends:** ADR-0033 (weight math), ADR-0036 (sizes)

## Context
Drones felt floaty. The flight physics simulated a real-size 5" (0.24 m box, 0.65 kg) while the Loadout screen listed 1.02 kg and the drone was drawn ~4.5 m wide: two sets of numbers. Falls capped at 16 m/s because flat-face drag was high for the simulated weight. The pilots want honest numbers: what the game shows is what the physics does. Truthful scaling to the drawn size (thousands of kg, flips taking seconds, 650 km/h top speed) was rejected because it ends acro flying.

## Decision
- **Weight and thrust:** the flight physics uses exactly the build's listed weight (`totalKg`) and thrust (`thrustKg` × propeller). No hidden tuned-mass factor. Default builds keep their thrust-to-weight, so hover throttle and punch-out are unchanged.
- **Drag:** retuned for the real weights so a flat, throttle-cut drop reaches ~25 m/s (was 16) and top speed stays ~47 m/s on a stock Freestyle.
- **Collision:** each body's physics box is its drawn model's bounding box (model extents × `visualScale`): 5"/3D ~4.5 × 1 m, racer ~2 × 0.4 m, X8 ~10.7 × 2.5 m, wing ~5.5 m span. Hit spheres stay as they are (they already equal the drawn width along the arms).
- **Game scale, not real scale:** these are game-size drones (a 4.5 m drone that weighs ~1 kg). Names don't imply size. Rates stay Betaflight acro rates.
- **Wing:** mass and thrust are its listed numbers; wing area and side force scale with them so it flies exactly as before.
- **FOV:** default 105° horizontal (was 120°); the slider stays.

## Alternatives considered
- **Truthful physics at drawn size:** ~3 t Freestyle, ~32 t X8, flips taking seconds, crossing Downtown in under 2 s; ends acro.
- **Gravity multiplier:** not needed if weight and drag are right; can be revisited with a Settings slider.

## Consequences
Big drones can't fit through gaps narrower than their drawn size; tight map features (training hoops, tunnel, ladder; scaffolding, monkey bars, lattice) need checking. The `loadFactor` bridge only slows rate response for heavier builds now; mass comes straight from the loadout.
