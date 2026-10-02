# ADR-0027: Bigger missile blast; drone watches its missile

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** ADR-0018's numbers (the one-shot rule stands)
- **Amends:** ADR-0025 (the hover while flying the missile)

## Context

Flying the missile (ADR-0025) works, but hitting within 3 m was still hard, so pilots wanted a bigger blast when they detonate near someone. And when the missile ends, the view snapped back to the drone facing wherever it was, so you couldn't see what you hit.

## Decision

- **Proximity fuse 4 m** (was 2.5). **One-shot kill within 5 m** (was 3). Splash falls from 50 to 0 at **10 m** (was 6). The fuse stays inside the lethal radius, so a fused missile always kills. Props take the same blast (ADR-0023).
- Detonate early with **Fire again or Special** (unchanged from ADR-0025; the HUD says so).
- While you fly the missile, your hovering drone **turns to watch it** (its FPV camera pointing at the missile). When the missile ends, it keeps looking at the blast for **1.5 s**, still hovering, then your controls come back.

## Consequences

- `MISSILE.proximity`, `lethalRadius`, `splashRadius` in `shared/missile.ts`; the look-at hover in `client/src/sim/drone.ts`.
