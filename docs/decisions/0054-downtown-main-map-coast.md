# ADR-0054: Downtown becomes the main map: four new districts, a pit in the ground, an evening on the coast

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** ADR-0012 (Downtown, scenery), ADR-0049 (Downtown outskirts), ADR-0020 (movers), ADR-0053 (ledges)

## Context
Downtown's outskirts were mostly empty asphalt. The owner picked an airport, Central Park, a street racetrack
and a megaproject pit to fill it, and said Downtown will be the main map, so it can grow. The flat skyline boxes
beyond the boundary looked sad next to the detailed buildings; the owner asked for a Rio de Janeiro-like
backdrop: green, forested, hilly, coastal, with the sea at one end and the sun setting over it. Ledges used the
facade texture, so they looked like rows of windows.

## Decision
- **Size:** Downtown grows to 920 m across (half-size 460, was 260). The city and ADR-0049 outskirts stay.
- **Airport (east):** a runway along the shore, taxiway, terminal with jet bridges and three parked airliners,
  control tower, two hangars you can fly through, a fuel farm. A new mover kind, **`plane`**: one airliner flies
  touch-and-go laps (rolls up the runway, climbs, circles the map at ~140 m, lands over the racetrack) at 45 m/s.
  Destructible like other movers (600 HP, big blast).
- **Central Park (north, across the river):** lawn, a lake with a stone arch bridge, boathouse and rowboats,
  groves of trees, rock outcrops, an obelisk, a gazebo and a bandshell.
- **Street racetrack (south):** a rounded circuit with concrete barriers, kerbs, a start gantry, a grandstand with
  a canopy, pit garages; five race cars lap it in two lanes (34 and 31 m/s).
- **Megaproject (west):** a half-built 128 m supertall with open floors to fly through, three tower cranes, and a
  **90 m × 90 m excavation pit, 24 m deep** with shoring struts, a ramp and machines.
- **Holes in the ground** (`MapDef.holes`): the ground (drawn, physics, bullet checks) is cut out over each hole;
  maps add their own floor and walls.
- **The coast:** the sea along the east edge inside the map (sea wall, beach with palms, water), and beyond the
  boundary a **coastal backdrop** (`MapDef.backdrop: 'coast'`): forested green hills (no leaves, flat-shaded
  vertex colors), rolling land down to beaches, a bay with a sheer granite dome and islands, sailboats. Hills
  never reach into the play area. The flat skyline boxes are gone.
- **Evening light:** maps may set the sun's direction and color (`Atmosphere.sunDirection`, `sunColor`); Downtown's
  sun is low over the sea to the east, with a warm horizon glow and longer fog distance. Other maps are unchanged.
- **Trim material:** ledges and parapets use a plain painted `trim` material instead of the window facade. A
  `sand` material for beaches.
- Spawns: four in and around the city, one in each new district.

## Alternatives considered
- **More city blocks in the outskirts:** more of the same; landmarks give places to fight around.
- **Real foliage on the hills:** far too many triangles for scenery nobody flies into.
- **Sun low on every map:** would change the look of every map; it's per map instead.

## Consequences
Downtown has ~8,000 solid pieces; the spatial grid (ADR-0053) keeps bullet checks fast. The mover clearance test
takes longer and has a 30 s timeout. Scenery is now built per map. The shadow camera covers bigger maps and a low
sun.
