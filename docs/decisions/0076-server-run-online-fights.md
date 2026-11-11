# ADR-0076: Online fights run on the room server; clients step the same frames

- **Status:** Accepted
- **Date:** 2026-11-11
- **Amends:** ADR-0005 (the server does more than relay), ADR-0075 (the lobby lives on the server, not in the relay)

## Context
The owner asked for real online matches: friends on their own computers in one room, fighting each other with
CPUs filling the free slots, through the existing Fly.io server (ADR-0021). The netcode was the open first item of
roadmap Phase 2. The fight is already a deterministic 60 Hz sim in `shared/fighter/` (Hard rule 2), so the server
can run it and every client can run the same code.

## Decision
- **The server runs every online fight.** Each member sends their keys every frame (12 bits, `{t:'in'}`). The
  server steps the shared sim at 60 Hz with each member's next queued input (at most 4 queued; the last input
  repeats briefly when none arrived, then all keys are released), runs the CPUs itself, and sends every frame's
  inputs (one number per fighter) to everyone in the room.
- **Clients step the same frames** with the same sim, keeping about 2 frames in hand against jitter (catching up
  two at a time, or jumping ahead after a hidden tab). Sounds and effects come from each client's own stepping.
- **Snapshots heal drift.** Once a second the server sends the whole world; a client that differs takes it. Testing
  showed last-digit floating-point differences between Chrome and Node now and then; snapshots make that harmless.
  Late joiners get one at once and **watch** the fight.
- **The lobby lives on the server.** Members' fighter and Ready, and the host's stage, stocks and CPUs (levels;
  CPU fighters drawn at random when the fight starts). People take the first slots in join order, CPUs the rest,
  four fighters at most. The host (longest in the room) starts once everyone is ready and there are two fighters.
- A player who **leaves mid-fight** is replaced by a Normal CPU. When the last stock falls the room goes back to its
  lobby (Ready cleared). Esc during an online fight opens a menu (Back to the fight, Leave room); the fight never
  pauses.
- Input delay is about one round trip plus two frames. Prediction or rollback can be added later on the same
  input stream if it feels laggy.

## Alternatives considered
- **Rollback:** the best feel, but much more work (save/restore every frame, re-simulation, cross-engine
  determinism). Possible later on top of this.
- **Peer lockstep (clients wait for everyone's inputs):** the whole room stalls on the slowest player, and any
  drift is permanent.
- **Server sends only snapshots:** simple, but ~10 KB a frame at 60 Hz per player; snapshots every second are enough.
- **Keep the lobby in the client relay:** the server needs the picks and settings to start an authoritative fight.

## Consequences
- `server/src/rooms.ts` keeps lobby state and runs fights (`server/src/match.ts`); `server/src/index.ts` drives
  them at 60 Hz. `shared/online.ts` has input packing, world snapshots and the online constants; `shared/protocol.ts`
  gains `pick`, `settings`, `start`, `in` and `match`, `frames`, `snap`, `cpu`, `end` (PROTOCOL_VERSION 101).
- One server machine runs every fight (ADR-0021); a deploy ends fights in progress.
- Anything that changes the sim stays deterministic and serializable as plain JSON (no Maps, class instances or
  Infinity in `World`), or snapshots break.
