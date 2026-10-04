# ADR-0038: Jet engines for the wing

- **Status:** Accepted
- **Date:** 2026-10-04
- **Extends:** ADR-0035 (the propulsion slot), ADR-0010 (synthesized sound)

## Context
The wing shares the quads' propeller list, so it doesn't feel unique. The pilots want jets on it, each with its own sound.

## Decision
Three engines in the wing's propulsion slot (wing only; the stock pusher prop and the other props stay available). Each is a sidegrade:

| Engine | Weight | Thrust | Catch | Sound |
|---|---|---|---|---|
| **Micro turbine** | +0.35 kg | ×1.7 | ~1.2 s spool-up and it never fully idles (8%): plan your throttle | rising whine over a jet roar |
| **Pulse jet** | +0.2 kg | ×1.35 | can't throttle below ~45%, and the pulses shake the airframe (aim suffers) | the buzz-bomb drone, ~50 Hz putt-putt |
| **Ramjet** | +0.25 kg | ×2.4 when lit | only 30% thrust from its booster until it rams air: lights from 22 m/s, full by 45 m/s (dive to light it) | hiss when cold, a deep roar when lit |

- Numbers in `shared/propellers.ts` (`jet` on each engine); the wing model applies them (`stepWing`).
- Each jet has its own model on the wing (nacelle, tube or spiked inlet with a glowing nozzle) and its own synthesized voice, for you and positionally for other pilots.
- Flight only; the server validates the engine as part of the loadout. Protocol version 15.

## Alternatives considered
- **Jets as a separate slot:** one more slot for one body; the propulsion slot already is "what pushes you".
- **Jets for quads:** a quad can't hover on a jet.

## Consequences
The wing's Loadout bar shows the pusher props plus the three jets. Weight still raises its stall speed, so the turbine is fast but needs speed.
