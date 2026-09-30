# ADR-0004: Netcode: latest state wins

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

In other browser FPV games we've seen a remote player shown about **30 seconds** behind real time. Real internet latency is 30–200 ms, so a delay that large (especially one that grows) comes from a design bug: usually a backlog of queued updates replayed in order, often after a background tab stalls. Avoiding this is a top priority (SPEC Hard rule 1).

## Decision

- Each client simulates its **own** drone locally (no input delay) and sends its state to the server at a fixed rate (~30 Hz).
- The server forwards the **newest** state per player. Old states are overwritten, never queued.
- Clients render remote drones from a **fixed interpolation buffer of ~100 ms**. Snapshots older than the buffer are **discarded**. The buffer never grows.
- If snapshots stop arriving (tab hidden, packet loss), extrapolate briefly (≤ 150 ms), then hold. On resume, **snap to the newest state**. Never replay the gap.
- Each snapshot carries a server timestamp. Clients estimate clock offset and ping continuously.
- **Hits are decided on the server** using its latest known states, with limited lag compensation (added in Phase 3).
- A network HUD shows ping and actual remote-player delay at all times in dev builds.

## Alternatives considered

- **Lockstep / input-delay:** fair but adds delay to your own drone, which is unacceptable for FPV feel.
- **Peer-to-peer WebRTC:** lower latency in theory, but NAT traversal complexity, and no neutral referee for hits.
- **Replaying every snapshot in order:** the cause of the 30-second-delay problem. Explicitly rejected.

## Consequences

- Target visible delay: **~100–200 ms** at normal ping. Anything above **250 ms** is a bug.
- Any code that queues snapshots must drop old ones. Reviewers (and `/spec-check`) should look for unbounded queues.
