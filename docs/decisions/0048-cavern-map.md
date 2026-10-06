# ADR-0048: Cavern map

- **Status:** Accepted
- **Date:** 2026-10-05
- **Extends:** ADR-0012 (maps as shared data); per-map atmosphere

## Context
The pilots want a map that's one really big cave, with tunnel offshoots, stalactites and stalagmites.

## Decision
- **Cavern:** a main chamber ~260 × 190 m with a lumpy rock ceiling 45–70 m up, closed all round.
- **Tunnels:** two loop tunnels (north and south, each leaving and re-entering the chamber), an east loop, and a west tunnel ending in a crystal grotto; 18 m wide and high.
- **Formations:** stalactites hang from the ceiling (tapering boxes), stalagmites rise from the floor, a few full columns join both, and low rock mounds break up the floor.
- **Light:** sunlight falls through three holes in the roof (each has an invisible lid, so nobody flies out); glowing crystal clusters light the tunnels and the grotto; a dark, short-range fog fills the space.
- **New pieces:** materials `rock` and `crystal` (emissive), ground `rock`, and an optional per-map `atmosphere` (fog, ambient and sun levels) the scene applies when the map loads. Bullet impacts on rock throw stone chips.
- Fuel drums and propane tanks at two miners' camps (ADR-0023). 8 spawns in the chamber.
- Built from boxes like every map (`shared/maps/cavern.ts`), so the server, physics and rendering share it.

## Alternatives considered
- **Real cave meshes:** organic, but the whole game (server hits, physics, rendering) is built on boxes; boxes keep it consistent and fast.
- **A fully dark cave with only crystals:** moody but hard to fight in; the light shafts keep it readable.

## Consequences
Distant mountains and clouds can only be seen through the roof holes. The X8 (10 m hitbox) has room in the chamber and tunnels.
