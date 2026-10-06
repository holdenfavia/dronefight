# ADR-0046: Room settings chosen at create, changed by the host

- **Status:** Accepted
- **Date:** 2026-10-05
- **Amends:** ADR-0005 (creating a room), ADR-0026 (first to 10 is now the default, not fixed), ADR-0012 (the host picks the map in the settings)

## Context
The pilots want to set up each match: which map, how long, which drones and weapons are allowed. They want the same settings reachable mid-game from the Escape menu.

## Decision
- **Create room opens Room settings** (map, kills to win 5/10/15/20/30, time limit off/5/10/15/20 min, flight assist any/Acro only, allowed drones, weapons and specials). The last settings you used are remembered on your device.
- **The host** (whoever created the room; the next pilot if they leave) can change them any time from the pause menu or the room screen; Apply restarts the match with them (a new map loads for everyone). Everyone else sees them read-only.
- **The server enforces** the rules: builds that break them are swapped for the nearest allowed one (body → first allowed body's default; weapon → first allowed gun; special → none); the kill limit and time limit end the match (on time, the most kills wins; a tie is a draw). The HUD shows time left. "Acro only" is applied by each client (flight is client-side; the X8 stays Horizon).
- Settings live in `shared/roomOptions.ts`; protocol 16 adds `options` and `looks` messages and `options`/`host`/`endsAt` in the match state.
- The Loadout screen marks parts the room doesn't allow.

## Alternatives considered
- **Settings only at create:** you'd have to remake the room to change anything.
- **Changes apply at the next match only:** slower; a restart keeps it simple and fair.

## Consequences
Teams are still out of scope; they'd be a mode in these settings later. A room recreated after a server restart comes back with default settings.
