# ADR-0049: Bigger maps (3x the area), filled with one-of-a-kind landmarks

- **Status:** Accepted
- **Date:** 2026-10-06
- **Amends:** ADR-0012 (map sizes, spawns), ADR-0019 (Playground), ADR-0048 (Cavern)

## Context
The pilots want every map three times the size, with the new space filled by unique, creative features (a river, bridges, a drop tower) rather than more of the same buildings.

## Decision
- **Three times the area** (about 1.7x across; 3x across would be 9x the area and spread 10 pilots too thin). Training is unchanged (it's a range).
  - **Downtown** 300 → 520 m: a river with a suspension bridge and an orange arch bridge, a stadium, a sculpture park of giant hoops, an elevated highway with on-ramps, a 110 m radio mast, a rail viaduct with a train and station, a water tower.
  - **Yard** 240 → 420 m: a harbor with a container ship and two ship-to-shore cranes, hollow cooling towers (fly in, out the top), a smokestack, a freight rail yard with a signal gantry and footbridge, a wind farm, a raised pipeline.
  - **Playground** 320 → 560 m: a fairground with a **drop tower** whose seats ride up slowly and free-fall (a mover with a fixed heading), a Ferris wheel, a carousel, a hedge maze, a pond with an arched bridge, a spiral slide tower, a bouncy castle and tethered hot-air balloons.
  - **Cavern** 370 → 640 m: two more chambers, an underground lake (island, stone arch bridge) and an old mine (headframe, timber props, ore piles, a mine-cart train on a loop), joined to the main chamber by tunnels; the east loop became the mine tunnel.
- **Water** is a new material (a thin sheet; flying into it is a crash; bullets throw a white splash).
- Spawns spread over the bigger maps (half in the old core, half in the new areas).
- New builders: `beam`, `polyBeam`, `hoop`, `water`; movers can keep a fixed `heading`; `dropTowerTiming`.

## Alternatives considered
- **3x across:** too much empty flying between fights for 2-10 pilots.
- **More of the same blocks:** what the pilots asked to avoid.

## Consequences
Bigger shadow-map extents (slightly softer shadows); more boxes per map, still merged one draw call per material. Fly each map together and tune.
