# ADR-0066: Parts add real weight to a bare frame

- **Status:** Accepted
- **Date:** 2026-10-15
- **Supersedes:** ADR-0033's rule that each body's default build flies exactly as originally tuned (the `loadFactor` bridge)

## Context
The physical model is built from real parts, but physics flew each build at the bare model's mass scaled by build weight over default-build weight. The Loadout screen said the default 5" weighed 1.02 kg while physics flew 0.6 kg, and thrust was back-solved to match. On 2026-10-14 Holden removed the guns from his 5" and said the feel was perfect, which points at the bare drone as the feel to anchor on. The architecture review recommended real kilograms on a bare frame; Holden approved.

## Decision
- A body's mass, centre of mass and inertia are its physical spec's parts: the bare drone ready to fly (frame, motors, props, battery, electronics). Each weapon, special and prop adds its own kilograms on top, at its hardpoint.
- `frameKg` and max thrust shown on the Loadout screen are computed from the physical spec, so the screen shows what physics flies.
- Weapon and special weights are cut to 40% of their old values so default builds still have plenty of thrust (5" default ~7.5 T/W instead of 9.1). Relative weights between parts are unchanged, so the rail gun is still very heavy.
- The wing has no physical spec: its tuned airframe (1.0 kg) is its bare frame and parts add real kilograms the same way.
- Loadout stats (lift, agility, top speed) come from short headless runs of the real model, not formulas.

## Alternatives considered
- **Keep the bridge and hide kilograms:** keeps default builds identical, but the bare drone Holden liked would stay unreachable except by removing weapons.

## Consequences
- Every build flies a little differently from before; default builds are slightly heavier than the bare drone. Play-test and tune weights.
- `loadFactor` is removed; `shared/drones.ts` stops storing hand-derived thrust numbers.
