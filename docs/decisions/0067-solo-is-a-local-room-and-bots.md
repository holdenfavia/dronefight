# ADR-0067: Solo runs a room in the page; bots are pilots in the match

- **Status:** Accepted
- **Date:** 2026-10-15
- **Supersedes:** ADR-0017's client-side hit checks and practice HUD (the Training map and the bot behaviours stay)

## Context
The client had its own copy of the rules for solo and Training (prop damage, splash, bot hits) that already disagreed with the server (grenade splash on bots, bot size, no shields or smoke). The server's `Match` imports only `shared/` code, so it can run in the browser. The architecture review recommended one rules engine; Holden approved, including bots in online rooms.

## Decision
- Solo creates a private room served by a `RoomManager` running in the page over a loopback transport. The client talks to it exactly as it talks to the Fly server; there is no solo-only rules code.
- Training bots (stationary, path, random, evasive) are bot pilots inside `Match`, with a loadout, HP, hits, kills and respawns like anyone else. The Training map adds its bots automatically.
- In any room the host can add and remove bots from the pre-match menu, up to the room's 10 pilots. Bots count toward the two pilots needed to start.
- Bots earn nothing and give nothing for XP (ADR-0032): no XP for killing a bot, and finish and win XP need at least two human pilots.
- Hard rule 1 is untouched: bot positions go out as server snapshots and are interpolated like any pilot's.

## Alternatives considered
- **Keep client-side Training:** two rule engines that drift apart.

## Consequences
- `client/src/training/trainingGround.ts`'s hit logic and the `net.inRoom` solo branches in `game.ts` are removed.
- Accuracy stats on Training come from the match's own hit and shot counts.
