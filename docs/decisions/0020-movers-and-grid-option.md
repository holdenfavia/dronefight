# ADR-0020: Moving props (city cars, roller coaster, tractor) and a grid-texture option

- **Status:** Accepted (amended by ADR-0023: rounds and missiles now hit props)
- **Date:** 2026-09-30
- **Amends:** ADR-0012 (maps can have moving props), ADR-0019 (grid style available on every map)

## Context

The pilots asked for things that move: cars to follow in Downtown, a roller coaster in the Playground, a tractor in the Yard. They also asked for a Settings button that swaps the realistic textures for the Playground's simplified grid look on every map.

## Decision

**Moving props ("movers")**
- Defined per map as data (`shared/maps/`): a closed route plus a speed. Each prop's pose is a pure function of time.
- **Same everywhere without networking:** clients evaluate poses from the shared clock (server time in a room, local time solo), so both pilots see every prop in the same place and no messages are needed.
- **Solid for flying:** each prop has a kinematic collider on the client, so hitting one crashes you like a wall.
- **Not simulated by the server:** props don't stop rounds or missiles and can't be damaged. They're scenery you race and dodge. Server hit checks are unchanged (ADR-0004).
- **Downtown traffic:** 10 cars on two loops through the street grid (inner ±30 m streets at ~16 m/s, outer ±90 m at ~20 m/s), each on the inside lane of its loop. That lane passes every intersection's center (and spawn pad) with room to spare.
- **Playground roller coaster:** a closed, hilly track (static boxes on support columns, part of the map) with a 4-car train. Speed follows energy conservation (slow at crests, fast in dips), precomputed into a time table so it stays deterministic.
- **Yard tractor:** a tractor towing a trailer on a rounded-rectangle loop at ~7 m/s, clear of spawns and structures.

**Grid-texture option**
- Settings → **Simplified grid textures**. Every textured material is swapped for a flat color with the Playground's baked grid (ADR-0019), including the ground. It applies instantly on every map and is saved per browser. The Playground itself is unchanged.

## Alternatives considered

- **Server-simulated props that block rounds:** consistent cover, but server work for every prop and more protocol. Props are scenery for now.
- **Networked prop positions:** unnecessary when motion is a deterministic function of the shared clock.

## Consequences

- `MapDef` gains optional `movers`. Map tests check routes stay clear of spawns.
- Rounds visibly passing through a car is expected behavior, noted in the RUNBOOK.
