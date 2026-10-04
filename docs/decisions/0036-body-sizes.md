# ADR-0036: Bodies differ in size: tiny racer, huge X8

- **Status:** Accepted
- **Date:** 2026-10-04
- **Amends:** ADR-0029 (per-body sizes), ADR-0033 (racer and X8 hit radius)

## Context
All quad bodies were drawn at the same 3× scale (ADR-0029), so the racer, the 5" and the X8 looked nearly identical, and the Loadout preview normalized every body to the same size. The X8 (four hardpoints, 180 HP) was also too strong; a big target is its natural cost.

## Decision
- Each body has its own draw scale and a hit radius that matches it (about 0.8 of the drawn radius, like the 5"):
  - **3" racer:** ~2.5 m across, hit radius **1 m** (was 1.6).
  - **Freestyle 5" / 3D quad:** unchanged, ~4.5 m, 2.25 m.
  - **FPV wing:** unchanged, 2.7 m.
  - **X8 heavy lifter:** ~13 m across, hit radius **5.4 m** (was 3.2).
- The Loadout preview keeps relative size (square-root compressed so both extremes fit the turntable).
- Physics bodies stay real size (ADR-0029); only drawing and server hit spheres change.

## Alternatives considered
- **Only change the look, keep hit radii:** hitboxes would no longer match what you see (ADR-0012, ADR-0029).
- **Nerf X8 stats instead:** size is readable from across the map and costs nothing in feel.

## Consequences
Numbers in `shared/drones.ts` (`hitRadius`, `visualScale`). The racer is much harder to hit; the X8 is much easier. The Loadout "Target size" scale now tops out at 5.4 m.
