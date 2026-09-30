# ADR-0009: Combat rules

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Phase 3 adds dogfighting. Both pilots chose the rules together: tracer rounds, a health bar, first to 5 kills, and crashes are deaths. The numbers below are starting values to tune by feel; changing a number is a tuning change, and changing a rule needs `/decide`.

## Decision

**Weapon: tracer rounds**
- Fired forward along the FPV camera's view (so where you look is where you shoot), from the quad's nose.
- Visible tracers. Starting values: 12 rounds/s, 350 m/s, 300 m range.
- Rounds stop at arena geometry. Walls are cover.
- Fire is a mapped control (radio button/switch, Space on keyboard) that goes through the input layer (ADR-0006).

**Damage: health bar**
- 100 HP. Starting value: 12 damage per hit (9 hits to kill).
- Brief spawn protection (2 s) after respawning. Firing ends it early.

**Hits are decided by the server (ADR-0004)**
- The shooter's client sends each shot (time, origin, direction). The server simulates the round against arena geometry and the target.
- Limited lag compensation: the target is tested where the shooter *saw* it (its position 100 ms behind the shot's server time, matching the interpolation buffer), rewinding no more than 250 ms.
- The shooter sees their own tracers instantly. Damage, deaths and score only come from the server.

**Crashes are deaths**
- A crash (as detected by the flight model) kills you.
- If the other pilot damaged you in the last 5 s, they get the kill. Otherwise no one scores.

**Match: first to 5 kills**
- A match starts when both pilots are in the room.
- On death: respawn after 3 s at your side's spawn pad (two pads at opposite ends of the arena).
- First to 5 kills wins. The results show for a few seconds, then a new match starts automatically.
- Solo mode (no room) keeps Phase 1 behavior: no combat, crash, then auto-respawn.

**Team colors**
- Orange (existing) and **lime `#b6f000`** as the second color. Lime reads well against both blue sky and grey concrete and stays within the bright, bold palette of ADR-0007. Each pilot's props and tracers use their color.

## Alternatives considered

- **Slower projectiles:** more arcade, and dodging becomes the main skill. Tracers feel more like a real gun.
- **Short-range tag:** most forgiving of lag, but less of a dogfight.
- **One-hit kill / 3 hits:** faster rounds, but lag and luck matter more.
- **Timed rounds / endless:** "first to 5" gives clear matches and quick rematches.
- **Crash = damage / crashes don't count:** less like real FPV, where hitting a pole ends your flight.
- **Client-decided hits:** feels perfect for the shooter but lets either client (or lag) decide unfairly. Rejected by ADR-0004.

## Consequences

- Arena layout moves to `shared/` so the server can test rounds against the same geometry the clients render and collide with.
- New protocol messages: shots, hits, deaths, respawns and match state. The protocol version bumps.
- Controller profiles gain a **Fire** binding. Existing profiles still work, but need Controller setup re-run to map fire.
- Server holds a short position history per player (bounded, ~1 s) for lag compensation.
