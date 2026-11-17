# ADR-0080: Smash attacks on Shift

- **Status:** Accepted
- **Date:** 2026-11-17
- **Supersedes:** ADR-0071 (how a smash is input only)

## Context
ADR-0071 made a smash "the movement key and the same arrow pressed together" (within 5 frames), held to charge. The owner asked for smash attacks on a held Shift instead, and said Shift should only count while it is held down (no tap to toggle or prime, unlike Space for specials).

## Decision
- Hold **Shift** (left or right) and press an arrow on the ground for a smash that way: ← → forward smash (facing the arrow), ↑ up smash, ↓ down smash. Keep holding the arrow to charge, as before.
- Shift does nothing on its own and only counts while held; releasing it never leaves a smash primed.
- Without Shift, a movement key with an arrow is a **forward tilt** (← → with A or D held) or the up or down tilt; pressing them together no longer smashes.
- Out of shield, the up smash also needs Shift (Shift + ↑).
- Aerials, specials (Space), grabs and throws are unchanged. Shift is a new bit in the per-frame input (`Input.smash`), so the online protocol version went up.

## Alternatives considered
- **Keep "move key + arrow" and add Shift as a second way:** the owner asked for Shift instead of it, and the old way made tilts hard to do on purpose.
- **Tap Shift to prime a smash (like Space for specials):** the owner asked for hold-only.

## Consequences
- `client/src/input.ts` reads Shift; `shared/fighter/sim.ts` picks smashes from `input.smash`; CPUs press Shift for their smashes (`shared/fighter/bot.ts`).
- Controls card, README and SPEC say Shift + arrow.
- On Windows, pressing Shift five times in a row can bring up the Sticky Keys prompt.
