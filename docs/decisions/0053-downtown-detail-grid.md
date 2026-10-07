# ADR-0053: Level-3 building detail in Downtown, grid textures by default, a spatial grid for collisions

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** ADR-0012 (Downtown), ADR-0020 (grid textures option)

## Context
On the Detail test map the pilots chose "level 3": real 3D detail you can land on. They also want the
simplified grid look as the default. Thousands more solid pieces would slow the server's bullet checks,
which tested every piece in the map.

## Decision
- **Every Downtown building at level 3:** a colonnade with a recessed glass storefront at street level, a ledge at every floor, balconies every other floor on one street face, a setback upper tier with a terrace railing on tall towers, a rooftop parapet and penthouse (or a water tank), AC units, billboards; everything outlined. Random choices keep their order, so the city keeps its layout. Downtown: ~1,600 → ~4,700 solid pieces, ~66,000 triangles.
- **Spatial grid** (`shared/raycast.ts`): colliders bucketed into 16 m columns; rays walk only the columns they cross, nearest first. 20,000 bullet checks on the new Downtown: 59 ms with the grid vs 937 ms without. Used by the server and client for bullets, missiles, grenades and impact splashes. A test checks it finds exactly what testing every piece finds, on every map.
- **Grid textures are the default**, and switched on once for everyone who had them off (settings version 1); after that the Settings checkbox sticks.
- **Outlines** (`edge` on a box) draw dark edges, one merged line mesh per map.

## Alternatives considered
- **Level 5 everywhere:** ~900k more triangles; kept for possible landmarks later.
- **No grid:** bullet checks would have tripled in cost.

## Consequences
The Detail test map stays for now for comparison; remove it when it's no longer needed.
