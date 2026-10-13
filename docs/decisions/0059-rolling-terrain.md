# ADR-0059: Rolling terrain under Downtown; street trees in the city

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** ADR-0012 (maps as shared data), ADR-0054 (ground holes), ADR-0058 (lawns)

## Context
Everything sat on one flat plane. The owner asked for San Francisco / Rio-style rolling ground under the city, the
parks and just about everywhere, unless there's a reason to be flat, and for street trees inside the city blocks.

## Decision
- **Shared terrain** (`shared/maps/terrain.ts`): a 5 m height grid over the map, two triangles per cell. The renderer
  draws those triangles, the physics floor is a triangle mesh of the same triangles, and the shared ray casts
  (server hits, grenades, missiles, impact splashes) march against the same surface, so all agree. Outside the map
  the ground stays the plane y = 0; holes (the pit) are left out of the terrain.
- **Downtown's ground:** rolling hills up to ~16 m (long smooth swells up to ~10 m in the city, which slopes down
  toward the bay), and **flat on purpose** where it must be: the river and bridges, the highway and its ramps, the
  rail viaduct and south avenue, the Circuit of the Americas, the airport and runway strip, the stadium and sports
  park, the megaproject, the favela (already terraced), the lake, and the map's edge. Each flat zone blends out
  over 30–80 m. Measured: 90% of the ground under 8% slope; the steepest banks ~50% for a few metres.
- **Maps are still built flat**, then fitted onto the terrain (`shared/maps/drape.ts`): groups (a city block with its
  sidewalk and trees, a building, a house, a sculpture) move as one and cut a level pad into the ground that
  blends back over 12 m; grounded parts grow foundations down; long low walls and fences step with the ground;
  flat paths and markings are cut into pieces tilted onto the slope; props and the city's traffic follow the
  ground; spawns sit on it. City blocks become terraces stepping down the slopes.
- **Lawns and sand become the terrain's surface** (grass, sand or paved cells) instead of sheets on top.
- **Street trees** line every city block's sidewalk (four per side, between the lamps, clear of spawns).

## Alternatives considered
- **A Rapier heightfield:** can't leave holes for the pit; a triangle mesh of the same triangles can.
- **Draping every building on the slope:** buildings must be level; pads and foundations are what real ones do.
- **Hills everywhere, including roads and runways:** cars, the circuit and the airliner need level ground there.

## Consequences
Map code keeps writing y = 0 for "on the ground" and wraps multi-part structures in `grouped()`. Tests check that
the terrain, the physics mesh and the ray march agree, and spawn tests measure from each spawn's real height.
Other maps are unchanged (no terrain = the flat plane).
