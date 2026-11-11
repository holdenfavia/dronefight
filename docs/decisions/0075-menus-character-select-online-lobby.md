# ADR-0075: Title screen, main menu, roster character select and an online lobby

- **Status:** Accepted (lobby moved to the server, online fights built: ADR-0076)
- **Date:** 2026-11-11
- **Amends:** ADR-0070 (the single select screen)

## Context
The game booted straight into one combined setup screen. The owner asked for a proper menu when the game starts,
a platform-fighter-style character select with the whole cast laid out, CPU players that are easy to tell apart
from people, and the groundwork for online play (Phase 2). The netcode itself (rollback vs lockstep) is still an
open roadmap decision, so online fights can't be built yet.

## Decision
- **Boot:** a title screen (logo, "Press Enter", CPUs fighting behind it), then a **main menu**: Fight (vs CPUs),
  Online, Controls. W/S or ↑/↓ and Enter work everywhere; Esc goes back.
- **Character select:** all fighters in a **roster grid** of animated portraits plus a Random tile, and four
  **player panels** below (You / CPU Easy·Normal·Hard / Off, each in its slot color). Your cursor (a "P1" token)
  moves over the grid with WASD or the arrows and picks as it moves; clicking a panel then a portrait sets that
  CPU's fighter. Stage and stocks sit on the same screen; Enter fights.
- **CPUs are marked:** their panels, HUD cards and in-fight tags say **CPU** with the level (e.g. "CPU 3"), drawn in
  a muted style; people keep the "P1" tag with an arrow.
- **Online lobby (framework):** create a room (the server picks a free two-digit code, ADR-0005) or join one by
  code; an invite link `?room=NN` opens the lobby and joins. Members (up to 4) see each other's slot, fighter and
  Ready state, exchanged through the server's room relay. Starting an online fight waits for the netcode decision;
  the lobby says so.
- In development `npm run dev` also starts the room server, so the lobby works with one command.

## Alternatives considered
- **Keep the single setup screen:** works, but it was what the owner asked to replace.
- **Build online fights now:** needs the netcode decision first (Phase 2, first item).
- **New server-side lobby messages:** the existing relay carries lobby state fine; the server stays a dumb relay
  until the netcode needs more.

## Consequences
- The look is our own (dark panels, orange accents, ADR-0039); no layout, art or names copied from any other game
  (Hard rule 3).
- `client/src/ui.ts` is split into screens; `client/src/net.ts` holds the room connection and lobby state.
- The Vite dev server proxies `/ws` to the room server; production serves both on one port (ADR-0021).
