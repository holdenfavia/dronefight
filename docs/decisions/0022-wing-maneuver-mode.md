# ADR-0022: Wing maneuver mode replaces the Cobra

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** ADR-0015 (the Cobra; its **Map buttons** part stays)

## Context

The physics Cobra (ADR-0015) pitches the nose back by itself while Special is held. In play, the pilots wanted a control they fly through themselves: more pitch authority and a bit more roll, at the price of stalling if they overdo it. They also wanted it to work from a radio switch as well as a button.

## Decision

**Maneuver mode = Special held** (a momentary button, or a switch left on, or E). While it's on, the wing's sticks keep commanding rates as in normal flight, but:
- **Pitch rate ×2** (220 → 440°/s) and **roll rate ×1.3** (420 → ~550°/s). Yaw unchanged.
- **More authority when slow** (minimum control authority 0.25 → 0.5).
- **Relaxed stability:** the nose's pull back toward the airflow (weathervane) drops to 25%, so a hard pull can push the wing past its stall angle. Stall angle is unchanged (12°, ADR-0013 tuning); a stalled wing loses lift and bleeds speed like any stall.
- No automatic pitch motion and no cooldown. Releasing Special restores normal flight.
- HUD: **MANEUVER** OFF / ON, and **STALL** while past the stall angle.

Numbers live in `MANEUVER` in `client/src/sim/wingModel.ts`, guarded by tests.

## Alternatives considered

- **Tune the Cobra (ADR-0015):** still an automatic maneuver, not what the pilots wanted.
- **Toggle on tap:** a radio switch already gives a toggle; a held button is quicker in a fight.

## Consequences

- `COBRA` and the pitch-moment integration are removed from the wing model; the Cobra sound plays when the mode engages.
- Docs and the Special button text say "maneuver mode" instead of Cobra.
