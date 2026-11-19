# ADR-0088: Short online input queues; taps between ticks count

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0076 (at most 4 inputs queued on the server; the client caught up only past 6 frames)

## Context
The owner felt his own fighter react late online. Measured with the real room server and a test client running
the game's online loop (thread "Find the online input delay"): a key press reached the client's sim about 35 ms
later with no network, 70–100 ms on a 30 ms round trip, and about 150 ms for the rest of a match after a single
150 ms hitch. Most of it was two first-in, first-out queues that only shrank once overfull: the server kept up to
4 inputs per player and the client stepped two frames a tick only past 6 waiting, so any burst added lag that never
drained. The keyboard was also read once per tick, so a tap shorter than a tick (17 ms, 33 ms at 30 FPS) could be
missed. The owner picked "drain the queues, then add prediction" on 2026-11-19.

## Decision
- **Server:** each player's input queue keeps at most one frame of backlog. When more is waiting at a step, the
  oldest inputs are merged into the next one, which keeps any key newly pressed in them, so a tap is never lost.
- **Client:** keeps about 2 frames in hand (`ONLINE.bufferFrames`) and steps two frames per tick whenever more than
  that are waiting (`ONLINE.catchUpFrames` = 2), so a burst drains in a few ticks. Jumping ahead after a hidden tab
  is unchanged.
- **Keyboard:** a key pressed and released between two ticks still counts as held for one tick (offline too).
- Prediction for your own fighter is a separate, later decision.

## Alternatives considered
- **Prediction or rollback only:** makes your own fighter instant but is a bigger job; the queues would still add
  lag to everyone else's fighters and to hits. Planned next.
- **Drop the backlog without merging:** simpler, but a quick tap inside the dropped inputs would vanish.

## Consequences
- `server/src/match.ts` merges backlog (`MAX_QUEUED_INPUTS` = 1 in `shared/online.ts`), `client/src/main.ts`
  and `client/src/config.ts` drain the frame queue, `client/src/input.ts` latches taps.
- The client steps two frames in one tick a little more often (a burst, or a server clock slightly faster than the
  browser's); that shows as an occasional one-frame skip instead of lasting lag.
