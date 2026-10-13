# ADR-0057: Detailed coastal hills; Detail test map removed

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** ADR-0054 (coastal backdrop), ADR-0053 (Detail test map)

## Context
The owner asked to remove the temporary Detail test map (its job, choosing Downtown's building detail, is done)
and for more detailed hills: the backdrop's hills were smooth 14-ring domes with striped coloring.

## Decision
- **Detail test map removed** (`lab` map id and `shared/maps/lab.ts`). Saved settings or rooms that named it fall
  back to Downtown (existing map-id validation).
- **Hills:** 30 rings × 96 segments each (about 7× the vertices), carved by ridged multi-octave noise in world
  space: spurs and gullies down the slopes and a rough skyline, strongest on mid-slopes; fine roughness on top.
  Granite domes stay smooth and sheer.
- **Hill and land color from the terrain:** forest greens in patches, lighter on crests, darker in gullies; bare
  rock only on near-vertical faces (and on granite domes); sand at the waterline.
- **Land around the map:** 12 m grid (was 20 m) with ridged detail on the rolling ground.
- Still flat-shaded vertex colors, no foliage geometry, one draw call each.

## Alternatives considered
- **Tree billboards or instanced trees on the hills:** many more draw calls and overdraw for scenery nobody flies
  into; the owner asked for green and mountainous, not leaves.
- **A heightmap texture:** an asset to ship; procedural noise is deterministic and free.

## Consequences
Measured 2.3–5.4 ms a frame at 2048×1536 on the dev machine across the favela, bay, city and overview views.
