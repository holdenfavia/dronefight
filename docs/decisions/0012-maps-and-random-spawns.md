# ADR-0012: Multiple maps, random spawns, hitbox matches drawn size

- **Status:** Accepted (sizes superseded by ADR-0029)
- **Date:** 2026-09-29
- **Amends:** ADR-0009 (spawns), ADR-0011 (hit radius)

## Context

With bigger drones (ADR-0011), both pilots can now see targets properly, and the 1.5 m hit radius (twice the drawn size) felt too generous. Players asked for a more interesting, urban map with a nicer backdrop, and for spawns that can't be camped. ADR-0009 used exactly two fixed pads, which invites spawn camping.

## Decision

**Hitbox matches the drone**
- Server hit radius is **0.75 m**, half of the ~1.5 m drawn width.

**Maps**
- Maps are data in `shared/maps/`: collidable boxes, non-colliding distant decor, spawn points, ground style and bounds. Client and server both read them, so rounds and flight collide with exactly what's drawn.
- Two maps to start:
  - **Downtown** (new default): city blocks, towers, streets, an open parking garage, skybridge, rooftops, a construction site with a crane.
  - **Yard**: the original industrial arena.
- The **room creator picks the map**; joiners adopt it. Solo play uses the map selected in the menu.

**Random spawns (anti spawn-camping)**
- Each map has **8 spawn points**.
- On every respawn, the server picks randomly among spawns that are more than **60 m** from every living opponent (and not the pilot's own previous spawn when possible). If none qualify, it uses the spawn farthest from opponents.
- At match start, both pilots get random, well-separated spawns.

**Scenery (all maps)**
- A distant ring of hazy mountains, soft clouds, and a sun glow, following ADR-0007's bright palette.
- Downtown also gets a non-colliding distant skyline. All scenery is procedural geometry (Hard rule 4) and cheap to draw (Hard rule 2).

## Alternatives considered

- **Replace the Yard with Downtown:** simpler, but the Yard is a good open dogfight space worth keeping.
- **Fixed team spawns (ADR-0009 as written):** predictable and easy to camp.
- **Purely random spawns:** could drop you in front of your opponent. Filtering by distance keeps it fair.

## Consequences

- Protocol gains a map id on room creation, join and match state (version bump).
- The client can rebuild the arena and its colliders when the map changes, without reloading the page.
- Spawn pads are still drawn at each spawn as landing spots. With 8 per map and random selection, seeing them doesn't reveal where someone will appear.
