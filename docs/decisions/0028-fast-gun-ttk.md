# ADR-0028: Fast gun time-to-kill

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** the damage numbers in ADR-0011 (20 per hit) and ADR-0014 (cannon 5, pellet 8)

## Context

Guns needed many hits to kill, so fights turned into missile duels. The pilots want gunfights to be a skill contest with a really fast time-to-kill.

## Decision

Roughly double gun damage; health, fire rates, round speeds and the missile stay as they are.

| Gun | Damage | Kills a Freestyle (100 HP) / 3D (90) / wing (130) |
|---|---|---|
| Freestyle gun, 12/s | **34** | 3 / 3 / 4 hits (~0.17–0.25 s of fire) |
| Wing rotary cannon, 50/s | **10** | 10 / 9 / 13 rounds (~0.2–0.25 s) |
| 3D shotgun, 2 blasts/s × 8 pellets | **14** per pellet | 8 / 7 / 10 pellets: a full close blast one-shots quads |

## Consequences

- Numbers in `shared/drones.ts`. Props take the same rounds, so they also go down faster (a car takes 4 Freestyle hits).
