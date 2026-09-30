# ADR-0019: Playground map in a solid-color grid style

- **Status:** Accepted
- **Date:** 2026-09-30
- **Amends:** ADR-0007 (art direction), for this map only

## Context

The pilots asked for a map built only from solid colors with grids running through them, modeled on a really big, really cool playground park. ADR-0007's bright industrial look (textured concrete, painted steel, orange/black/white) doesn't fit that.

## Decision

- New map **Playground** (`shared/maps/playground.ts`), a giant park scaled for drones: a playhouse tower on stilts with a gable roof and two big slides, a 25 m swing set, monkey bars, a climbing lattice, seesaw, merry-go-round, sandbox, crawl tunnel, climbing wall, trees, benches, painted hopscotch and a perimeter fence. 8 spawns around the edge.
- **Grid materials:** flat solid colors (red, blue, yellow, green, purple, orange, white, sand), each with a 1 m grid and bolder 4 m lines baked into a texture that tiles in world metres, plus a light grid ground. No other surface detail.
- The style is limited to this map. Other maps keep ADR-0007.
- Everything else is standard: boxes only, shared by client and server (ADR-0012), same scenery backdrop, same performance rules.

## Alternatives considered

- **Reuse the existing concrete/steel textures in bright colors:** muddier, and not the clean grid look asked for.
- **A shader-based world-space grid:** crisper at a distance, but more complex than a baked texture for the same effect at play distances.

## Consequences

- New materials (`grid*`) and a `grid` ground style.
- Adding more grid-style maps later is cheap.
