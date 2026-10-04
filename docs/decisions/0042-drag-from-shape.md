# ADR-0042: Air resistance calculated from each quad's real-size shape

- **Status:** Accepted
- **Date:** 2026-10-04
- **Amends:** ADR-0008 (flight model tuning)

## Context
Drones feel floaty. ADR-0040 tried drawn-size physics and was reverted (ADR-0041). The pilots asked for the drag to be calculated properly for a real 5" (the physics' size and weight), changing flight characteristics only: not hitboxes, drawn size, weight or thrust.

## Decision
- Quadratic drag per body axis = ½ · air density (1.225) · Cd · projected area, with Cd 1.17 for the flat top (falling flat) and 1.05 for the boxy front and side.
- Areas are measured off each body's real-size model: frame arms, stack, battery, camera, motors, and prop blades (an idling prop is mostly air). Freestyle: top 0.0233 m², front 0.0068, side 0.0085. 3D quad, racer and X8 likewise (`QUAD_AREAS` in `client/src/config.ts`).
- Linear drag stays (small rotor drag). Mass, thrust, rates, hitboxes and drawn sizes are unchanged. The wing keeps its own aerodynamic model.

| Default build | Flat fall (throttle cut) | Top speed | Punch-out |
|---|---|---|---|
| Freestyle | 16 → **19 m/s** | 48 → **56 m/s** (200 km/h) | 45 → **52 m/s** |
| 3D quad | 17 → **19** | 45 → **50** | 42 → **46** |
| Racer | 16 → **21** | 46 → **61** (220 km/h) | 43 → **57** |
| X8 | 17 → **19** | 35 → **39** | 31 → **33** |

## Alternatives considered
- **Hand-tuned drag (before):** edge drag was ~2.5× what the shape gives, which is part of the floaty, draggy feel.
- **Prop thrust loss at speed (ADR-0040's pitch speed):** real, and would bring top speeds back toward ~47 m/s; left out to change only air resistance. Available if top speeds feel too high.

## Consequences
Quads carry more speed, slow down less when you chop throttle, and fall a little faster. Top speeds rise. Changing a body's drag now means changing its areas, not raw numbers.
