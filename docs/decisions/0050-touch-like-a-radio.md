# ADR-0050: Touch flies like a radio; no altitude hold; Acro by default everywhere

- **Status:** Accepted
- **Date:** 2026-10-06
- **Supersedes:** ADR-0045's altitude hold and its "Horizon on touch" default; ADR-0044's floating-sticks default

## Context
The pilots want the phone and tablet controls almost one to one with a radio: no extra help unless a player turns it on in Settings.

## Decision
- **Altitude hold is removed.** The left stick's vertical is the throttle, and it stays where you leave it, like a radio's throttle stick; yaw and the right stick spring back.
- **Fixed sticks by default** (in the corners, like a radio's gimbals). Floating sticks stay an option.
- **Acro by default on every input**, touch included. Horizon and Angle stay available in Settings (the X8 is still always Horizon, ADR-0037). The "Auto" assist setting is gone.
- **No aiming help by default:** auto-fire and trigger lock are off unless turned on. Corner triggers and second-finger fire stay on (they're buttons, not assists).

## Alternatives considered
- **Keep altitude hold as an option:** the pilots asked to eliminate it.

## Consequences
New touch pilots start in pure acro; Settings → Flight assist and Touch controls offer help for those who want it.
