# ADR-0005: Room codes, not matchmaking

- **Status:** Accepted (partly superseded by ADR-0026: free-for-all, up to 10 pilots)
- **Date:** 2026-09-29
- **Amended:** 2026-10-01: codes are **two digits** (`00`–`99`), easy to read out on a call; the server picks a free one.

## Context

The initial players are two friends in different houses. They need to find each other, not strangers. Matchmaking is only useful with many players and adds large scope (queues, skill rating, accounts).

## Decision

- A small **Node.js WebSocket server** (`ws` library) hosts rooms.
- A player creates a room and gets a short code (e.g. `KX7P`). The other player enters it to join.
- Max **2 players per room** for now.
- Host on a low-cost platform (Fly.io, Render or similar). Choose at deploy time and record in RUNBOOK.

## Alternatives considered

- **Split-screen / same machine:** bad for full-screen FPV and two radios.
- **Public matchmaking:** premature; can be layered on top of rooms later.

## Consequences

- No accounts needed (SPEC Hard rule 5).
- Rooms are in memory. A server restart ends matches, which is acceptable for now.
- Expanding beyond 2 players is a future decision.
