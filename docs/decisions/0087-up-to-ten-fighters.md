# ADR-0087: Up to ten fighters per match

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0070 and ADR-0071 (up to 4 fighters), ADR-0075 (four player panels), ADR-0076 (rooms of 4)

## Context
Holden asked to "uncap the total number of players to 10 but only show 4 initially". The spec capped a match at
four fighters and listed "more than 4 fighters" as out of scope; he confirmed the change on a decision card.

## Decision
- A match holds up to **10 fighters** (`MATCH.maxFighters`): offline you plus up to nine CPUs; online a room holds
  up to 10 players (`MAX_ROOM_MEMBERS`) and the host's CPUs fill the rest.
- Menus show **four player panels** at first. Offline, an **Add a fighter** panel fills the first empty slot with a
  Normal CPU, opening one more panel each time, up to ten; turning the last ones Off folds them away again. Online,
  the lobby shows four panels, or as many as are in use plus one open slot.
- Fighters past a stage's own four spawns start spread along the main platform (`spawnPoint` in `sim.ts`). The
  first four start where they always did, so existing matches replay the same.
- Ten slot colors: the ten personal colors (ADR-0083), orange, lime, cyan, pink first. Teams stay at four.
- With more than four fighters the HUD cards shrink and wrap; the signature meter is left to the body (ADR-0084).

## Alternatives considered
- **Eight:** a common cap in other games; Holden asked for ten, matching the ten colors.
- **Show all ten panels:** cluttered for the usual 1v1 to 4-player games, so four come first.

## Consequences
- Hard rule 1 (60 FPS) has to hold with ten fighters on a mid-range laptop; the sim step is cheap, the renderer is
  the part to watch.
- Stages may want more spawn points or wider platforms for big fights later.
