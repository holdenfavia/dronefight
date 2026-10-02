# ADR-0018: Guided missile is a one-shot kill

- **Status:** Accepted (numbers superseded by ADR-0027: fuse 4 m, lethal 5 m, splash 10 m)
- **Date:** 2026-09-30
- **Amends:** ADR-0016 (missile damage)

## Context

In play, the guided missile proved hard to land: you have to hold the crosshair on a fast, dodging drone for a second or more. With up to 45 splash damage, a successful hit wasn't worth that effort. The pilots asked for missiles to be one-shot.

## Decision

- Anyone within **3 m** of a missile blast is destroyed outright, whatever their class (lethal damage, far above any class's health).
- The proximity fuse trips at 2.5 m, which is inside the lethal radius, so **a missile that fuses on you always kills**.
- Beyond 3 m, splash falls linearly from 50 damage to 0 at 6 m (e.g. a missile that hits a wall next to you).
- Still no self-damage. Kills are credited to the shooter as usual.
- Everything else from ADR-0016 is unchanged: line-of-sight guidance, 2.5 s burn, 5 s self-destruct, one in flight, pod of 3 (1 per 4 s).

## Alternatives considered

- **Keep splash damage, raise the number:** still not a kill on the 130 HP wing, and it doesn't reward the skill it takes to guide one in.
- **Bigger proximity fuse:** easier to hit, but a missile would kill from further away than it looks.

## Consequences

- Numbers are in `MISSILE` in `shared/missile.ts` (`lethalRadius`, `damage`, `splashRadius`).
- Watch the balance: with a pod of 3, a good Freestyle pilot can get three quick kills. If that's too strong, lower the pod or slow the regen.
