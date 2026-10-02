# ADR-0026: Free-for-all rooms of up to 10 pilots

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** ADR-0005's "max 2 players per room"; ADR-0009's two teams (orange vs lime) and first to 5

## Context

More friends want in. Rooms were 1v1 (ADR-0005), and combat assumed exactly two pilots on two teams (ADR-0009). The pilots chose free-for-all over teams.

## Decision

- Up to **10 pilots per room**. A match starts once **2** are in; pilots can join a running match (score 0, spawn protected). Below 2 it goes back to waiting.
- **Free-for-all**: every pilot is an enemy. **First to 10 kills** wins, then a new match starts.
- **Ten pilot colors**, one per pilot (orange and lime first, so 1v1 looks as before). `MatchPlayer.team` now means the pilot's color slot.
- Spawns: still 8 per map (ADR-0012), each respawn away from every other living pilot. If a spawn already has a pilot on it, the server places you a few metres beside it (`respawn.o` offset).
- Netcode unchanged (ADR-0004): every state goes to every other pilot, latest state wins, no backlog; Hard rule 1 holds per pilot.
- HUD: your kills and rank plus the leader; an edge arrow for every off-screen pilot; the lead indicator on the pilot nearest your crosshair.

## Alternatives considered

- **Two teams:** needs balancing and team spawns; free-for-all is simpler and the pilots preferred it.
- **More spawns per map:** more map work; offsets beside a taken spawn cover the rare overlap.

## Consequences

- SPEC "Out of scope: more than 2 players per room" is removed. Protocol version 10.
