# ADR-0089: Predict your own fighter online (rollback on the client)

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0076 (clients only stepped the server's frames; "prediction or rollback can be added later")

## Context
After ADR-0088 your own keys still took about one round trip plus a frame or two to show online (about 65 ms on a
30 ms connection, measured), against about 8 ms offline. The owner picked "drain the queues, then prediction" on
2026-11-19. The sim is cheap enough to re-run: one step of a four-fighter world takes about 0.02 ms and copying the
world about 0.1 ms, so re-simulating a dozen frames every tick costs well under a millisecond.

## Decision
- **The server is unchanged as the authority.** It still runs the fight and sends every frame's inputs.
- Each `in` message carries a sequence number; each `frames` batch says, per fighter, the last sequence number the
  server used (`ack`), so the client knows which of its keys the server has already applied.
- **The client keeps two worlds.** The *confirmed* world steps the server's frames as soon as they arrive (no jitter
  buffer for players). The *shown* world is a copy of the confirmed one stepped ahead with your keys the server
  hasn't used yet, and everyone else's last confirmed keys repeated. It is rebuilt every tick, so a wrong guess is
  corrected within a frame (rollback). At most `ONLINE.maxPredictFrames` are predicted.
- Sounds, effects and the HUD play once per predicted frame, the first time it is shown. Results and the end of
  the fight come from the confirmed world.
- People watching a fight (no fighter of their own) keep the buffered stepping of ADR-0076 and ADR-0088.

## Alternatives considered
- **Predict only your own fighter, freeze the others:** the same cost, but hits on others would land late.
- **Full peer rollback (no server sim):** drift would be permanent between browsers; the server keeps one truth.

## Consequences
- Your fighter reacts about as fast as offline. Other fighters can jump a little when their keys change (the guess
  was "same keys as last frame"), and a predicted hit can occasionally be undone.
- `shared/protocol.ts` (`in.s`, `frames.ack`, PROTOCOL_VERSION bump), `server/src/match.ts` (track the used
  sequence), `client/src/main.ts` (two worlds, prediction), `client/src/net.ts`, `client/src/config.ts`.
- Everything in `World` must stay cloneable (plain JSON, as ADR-0076 already requires).
