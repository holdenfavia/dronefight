# ADR-0065: Propellers are real props in the physical flight model

- **Status:** Accepted
- **Date:** 2026-10-15
- **Supersedes:** ADR-0035's multiplier model for quads (the five propeller choices, their names, weights and the ducts' crash tolerance stay; the wing's jets, ADR-0038, are unchanged)

## Context
Since every quad flies the physical model (ADR-0063, ADR-0064), three of a propeller's five multipliers (`response`, `drag`, `wash`) changed nothing in flight, while the Loadout screen still showed their effect. The architecture review (2026-10-14) recommended making props parts of the physical model, the same move ADR-0064 made for bodies. Holden approved all of the review's recommendations.

## Decision
- A propeller is a change to the body's stock prop in the physical model: blade count, pitch, chord, profile drag, duct effect and extra mass. Its diameter stays the body's own (a 5" takes 5" props, the X8 7"), so one choice works on every quad.
- Bi-blade: 2 blades, more pitch. Quad-blade: 4 blades, less pitch. Heavy-lift: 3 wide, high-pitch blades. Ducted: the stock blades in a duct (more static thrust per blade, more drag, prop guards keep their crash tolerance). Tri-blade is the stock prop.
- What a prop does (lift, response, top speed, wash) comes out of the blade-element rotor, motor and battery model, not from multipliers. The `thrust`, `response`, `spool`, `drag` and `wash` multipliers are removed for quads.
- The wing keeps its own model; its propeller and jets keep their multipliers (ADR-0035, ADR-0038).

## Alternatives considered
- **Keep only the multipliers that still work (thrust, spool):** honest but flattens the choice to "more or less thrust".
- **Leave it as is:** the screen would keep describing a drone you don't fly.

## Consequences
- `shared/propellers.ts` describes quad props as blade geometry; `client/src/sim/physicalQuad.ts` builds the rotor from the body's spec plus the prop.
- Loadout stats for props come from running the real model (see ADR-0066).
- Prop choices fly differently from before; tune after a play-test.
