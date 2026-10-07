# ADR-0051: Remove pilots who are away for 5 minutes

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** ADR-0005 (rooms), ADR-0026 (free-for-all rooms)

## Context
Idle pilots fill room slots, sit on spawns and count toward the pre-match start. The pilots want anyone AFK for more than five minutes kicked.

## Decision
- **The server decides.** A pilot is active when their drone moves more than 2 m from where they were last active, when they fly a missile, or when they send anything but state, pings and sign-in (shots, specials, loadout, paint, ready, team, start, room settings).
- After **4 min 30 s** idle the server warns them (`afk`); the game shows a countdown ("Away? Move within 30 s…") until they move a stick, fire or use a special.
- At **5 minutes** idle the server removes them from the room (`kicked`). Their game goes back to Play with "You were removed from room NN for being away for 5 minutes" and does not rejoin on its own. Everyone else sees them leave as usual.
- Numbers in `NET` (`afkKickMs`, `afkWarnMs`, `afkMoveM`). Protocol 18.

## Alternatives considered
- **Client-side detection:** the server can't trust it, and a closed laptop never reports anything.
- **Count only stick input:** the server never sees sticks; movement is what it can check.

## Consequences
Sitting in a menu with the drone parked counts as away; touching a menu button in the room (ready, team, settings) counts as being here.
