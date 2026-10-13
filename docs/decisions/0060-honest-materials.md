# ADR-0060: Materials match what things are made of

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** ADR-0053 (Downtown textures), ADR-0049 (landmarks)

## Context
Some structures wore the wrong texture: the rail viaduct's piers used the brick-with-windows building texture
(they looked like skyscraper walls holding up the tracks), chimneys and Yard boxcars did too, the Cavern's mine
timbers were brick, trees, benches, tires and every road used the gravel-roof texture, the plaza fountain's water
was the glass curtain wall, and windowed walls tiled windows across their own tops. Downtown also borrowed the
Playground's grid colors for real objects.

## Decision
- **New materials**, all procedural: bare brick (`masonry`); small-house walls in brick with small windows
  (`brickHouse`), painted plaster in five colors, and clapboard siding with shuttered windows; terracotta
  `clayTile` and asphalt `shingle` roofing; `road` asphalt; tree `bark`, `wood` planks and black `rubber`;
  corrugated steel in five colors (containers, boxcars, hangars); painted steel in red, yellow, blue and green;
  a green sports `court`.
- **Windowed walls** (facade, glass, brick and the house walls) keep their windows on their sides only; their tops
  and bottoms draw as plain roof.
- **Applied:** viaduct piers and chimneys bare brick; favela houses brick and colored plaster; suburb houses
  siding, plaster or brick under shingle or clay-tile roofs; runway, taxiway, circuit and boulevards road; trunks
  bark; benches wood; the plaza fountain water; hangars, containers and boxcars corrugated steel; the tower's
  veil, kerbs and run-off, sculptures and water tanks painted steel; tennis courts court; mine timbers wood.
  The Playground keeps its grid colors on purpose (ADR-0019).
- Each material also has a flat grid-style color and an impact splash.

## Consequences
New map code picks the material for what the thing is made of; the windowed building textures are for buildings
only. Measured frame times unchanged (2.8–10.3 ms a frame on the dev machine, both texture modes).
