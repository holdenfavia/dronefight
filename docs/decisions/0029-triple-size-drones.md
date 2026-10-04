# ADR-0029: Drones drawn and hit at three times the size

- **Status:** Accepted (per-body sizes: ADR-0036; ADR-0040 tried collision at drawn size and was reverted by ADR-0041)
- **Date:** 2026-10-01
- **Supersedes:** ADR-0012's 0.75 m hitbox and ADR-0011's ~1.5 m drawn size (the principle "hit size matches drawn size; physics stay a real 5"" stands)

## Context

With a fast time-to-kill (ADR-0028), the pilots want gunfights to be about who lands shots first, and other drones were still small and hard to track. They asked for the model and hitbox to be three times bigger.

## Decision

- Hit radius ×3: Freestyle and 3D quad **2.25 m** (was 0.75), wing **2.7 m** (was 0.9).
- Drawn size ×3 to match: quads ~4.5 m across (`visualScale` 14.4), wing ~5.4 m (`visualScale` 6).
- Trails ×3 wide (2.7 m). Chase camera moves back (14 m, 4 m up) so your own drone fits.
- Physics, collisions with the world and flight feel are unchanged: still a real 5" quad and a 0.9 m wing.

## Consequences

- Numbers in `shared/drones.ts` (server and client) and `DRONE_VISUAL`/`CAMERA_DEFAULTS` in `client/src/config.ts`. Practice bots use the Freestyle hit radius, so they grow too.
- Drones can look like they overlap walls when flying close to them; only the drawing is big.
