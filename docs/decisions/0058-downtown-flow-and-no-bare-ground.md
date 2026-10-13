# ADR-0058: Downtown flows: boulevards, a sculpture garden, and no bare ground

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** ADR-0054, ADR-0056 (Downtown districts)

## Context
The owner found Downtown disconnected: districts sat like islands on grey asphalt, "a bunch of squares with
buildings". They asked for more flow, almost no blank space, and something like a sculpture garden.

## Decision
- **Boulevards** tie the districts together: a riverside boulevard between the river and Central Park across the
  whole map (to a roundabout at the airport), and a south avenue between the city and the viaduct, under the
  highway. Road, centre dashes, sidewalks, rows of trees and lamps; gaps under the bridges and the highway.
- **Sculpture garden** in the strip between the megaproject and the highway: a winding path, hedges, benches and
  lamps, a reflecting pool with stepping stones, and nine solid sculptures (stacked-cube tower, twisting spine,
  interlocked rings, balanced rocks, pole forest, a cube on its corner, a slab arch, a helix). The megaproject's
  site cabins move beside the pit.
- **Airport landside:** a fountain roundabout at the boulevard's end and a hotel tower.
- **No bare ground:** after everything is placed, a 10 m grid lays lawn on every clear patch (lower than every other
  ground layer, so no shared faces), and every clear 20 m patch gets trees, shrubs or a bench. Left paved on
  purpose: the city's streets, the airport's car park and cargo apron. The runway strip and the airliner's
  approach get grass only; spawns keep a 16 m clearing.

## Alternatives considered
- **Hand-placing every gap:** fragile; any new district would leave new gaps. The fill runs last and adapts.
- **A lawn texture for the whole ground:** would turn streets and car parks green too.

## Consequences
Downtown: ~10,900 solid pieces, ~3,200 decor. Measured 3.2–9.8 ms a frame at 2048×1536 on the dev machine (worst:
the whole map from its north edge). Watch frame rate on the mid-range laptop at the next play-test.
