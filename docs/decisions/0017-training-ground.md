# ADR-0017: Training ground with practice bots

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Pilots want to practice aim alone: against still targets, predictable movers, and unpredictable, evasive ones.

## Decision

**Training map** (`shared/maps/training.ts`): open ground with firing lanes, distance posts, some cover and a tower. It's a normal map (8 spawns, boundary grid), selectable with the Map button.

**Practice bots**, spawned when flying **solo on the Training map**. Each kind has its own glow color:

| Kind | Color | Behavior |
|---|---|---|
| Stationary | white | Hover in place (gentle bob) at ~40, 80, 130 and 180 m down the lanes |
| Fixed path | blue | Circle, figure-8 and a back-and-forth strafe line at steady speeds |
| Random | yellow | Smoothly fly to random waypoints in a zone |
| Evasive | red | Random paths plus sudden jinks (sideways kicks, altitude drops), more often while you're aiming at them |

- Bots have Freestyle health and hit radius. When killed they explode and respawn at home after 3 s.
- Hits on bots are checked **in the client**: rounds and pellets are stepped along their flight like the server does; missiles use the same proximity fuse and splash. This is safe because there is no opponent. Matches stay server-authoritative (ADR-0004); bots never appear in rooms.
- HUD shows **hits, kills and accuracy**. The lead indicator targets the bot nearest the crosshair. Hit markers and sounds are the same as in a match.
- Bots are drawn with the Freestyle model, their glow and a trail, reusing the existing renderers.

## Alternatives considered

- **Server-side bots in rooms:** lets two pilots practice together, but adds server simulation for a solo feature. Later, if wanted.
- **Static targets only:** doesn't train tracking or leading moving, unpredictable targets.

## Consequences

- A new map id (`training`); `MapId` and the map picker include it.
- The client gains a small local hit checker for practice. It must never be used for match damage.
