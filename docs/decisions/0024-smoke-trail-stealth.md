# ADR-0024: 3D quad smoke becomes a stealth smoke trail

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** ADR-0016 (the smoke screen part; the guided missile stands)

## Context

The smoke screen (ADR-0016) dropped a cloud where you were and only hid you while you were inside or behind it. In play it was nearly useless: a 3D quad leaves the cloud in a second. The pilots wanted smoke that travels with you.

## Decision

- **Tap Special** (3D quad): for **6 s** you leave a thin grey smoke trail, and the other pilot sees **only your drone's frame**: no glow, no colored trail, no lead dot, no off-screen arrow. **10 s** cooldown from activation (unchanged).
- Concealment is per pilot (who is smoking), not per cloud. The smoke trail itself is visible to everyone, so a sharp-eyed pilot can still follow it.
- The server still checks class, alive and cooldown, and relays it (`ability` message, unchanged). No protocol change.
- Numbers in `SMOKE` (`shared/abilities.ts`).

## Alternatives considered

- **Bigger or longer cloud:** still static; a fast quad leaves it immediately.
- **Hide the frame too (full invisibility):** too strong; the frame and smoke keep it fair.

## Consequences

- `SmokeClouds` becomes `SmokeTrails` (client); the cloud-geometry concealment check is removed.
