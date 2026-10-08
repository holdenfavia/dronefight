# ADR-0055: Downtown's racetrack is the Circuit of the Americas; reversed depth buffer

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** ADR-0054 (racetrack, map size), ADR-0001 (renderer setup)

## Context
The owner asked for the racetrack to be a recreation of the Circuit of the Americas in Austin, with its big
tower. They also saw two surfaces flicker into each other ("50-50 of each") when flying high: thin layers a few
centimetres apart (lawns, runway, track, road paint) ran out of depth-buffer precision far from the camera.

## Decision
- **The circuit:** the real COTA centerline (open data set bacinger/f1-circuits, MIT, converted to metres in
  `shared/maps/cota.ts`) at **41% scale (2.26 km a lap)**, turned 25° to fit the south strip, real
  counter-clockwise direction kept (rotated, never mirrored). Track 14 m wide.
- Turn 1 is a tight uphill hairpin on a **12 m grassy hill** (solid road and embankment); the rest is flat.
- Concrete barriers on both edges, left open on the inside of tight bends; red/white kerbs inside corners;
  red/white/blue striped run-off outside them; grass over the whole circuit area.
- Landmarks: the start/finish gantry, the main grandstand with a roof and the pit building along the main
  straight, a grandstand on the Turn 1 hilltop, and the **observation tower** (64 m deck) with a veil of 17 red
  steel tubes sweeping down over an amphitheater stage and its curved rows. All solid: fly through the veil.
- Six race cars lap it in two lanes (38 and 35 m/s).
- **Downtown grows to 1,120 m across** (half-size 560, was 460) to fit it; the park, the beach and the sea strip
  grow with it, the airliner's loop widens, the coastal backdrop follows the map's size.
- **Reversed depth buffer** (`reversedDepthBuffer: true` on the renderer): float depth with near-uniform precision
  out to the horizon, so overlapping thin surfaces stay stable from any height. Falls back to normal depth on
  WebGL2 without `EXT_clip_control`.

- **No shared faces (added the same day, after the flicker persisted):** reversed depth fixed far-away layers,
  but most flicker came from faces in *exactly* the same plane. Tiled materials now get **world-space UVs**, so
  overlapping boxes of one material draw identical pixels; boxes of different materials are kept from sharing a
  face (curtain walls, railings, viaduct piers, kerb colours), guarded by a test; track strips close the wedge
  gaps on bends.

## Alternatives considered
- **Keep the map at 920 m:** the circuit would be at ~29% scale, its hairpins too tight to read.
- **Draw it freehand:** wouldn't be recognizable; the real centerline is open data.
- **Fix flicker by spacing layers apart or a bigger near plane:** treats symptoms per layer; the near plane must
  stay small for a 0.3 m drone pressed against walls.
- **Logarithmic depth:** also works, but disables early depth testing (slower).

## Consequences
Real places (geometry only, no logos or names on signs) are fine under Hard rule 4, which is about other games'
assets. Old racetrack (rounded rectangle) is gone. Downtown's spawn in the old track's infield moves to the
circuit's infield.
