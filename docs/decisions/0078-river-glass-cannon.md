# ADR-0078: River is a fast glass cannon

- **Status:** Accepted
- **Date:** 2026-11-17
- **Supersedes:** ADR-0077 (River's moveset and knockback only; the cheat codes stand)

## Context
ADR-0077 made the secret fighter River "really, really bad" with very low knockback (0.4×). After trying it, Holden changed his mind: "lets actually make river a glass cannon with powerful grabs and a good down special, make him fast too".

## Decision
River (still unlocked by the code RIVER, still big and round) becomes a glass cannon:
- **Fast:** the fastest walk in the cast (500), quick air speed and normal jumps.
- **Hits hard:** strong tilts, aerials and smashes (fsmash 20 damage).
- **Strongest grabs and throws in the cast:** long grab reach (40), throws up to 16 damage with high knockback.
- **Good down special, Belly Flop:** on the ground he hops and comes down belly first; in the air he drops straight down. The landing hits both sides hard (up to 18 damage).
- Other specials: Snack Toss (a cookie), Belly Bump (a charging side special), Bounce (recovery).
- **Glass:** weight 80 and **1.25× knockback taken** (`kbTaken`), with the second-biggest hurtbox, so he gets launched early.

## Alternatives considered
- **Keep him bad but hard to launch (ADR-0077):** Holden asked for the opposite.

## Consequences
- `RIVER_KB_TAKEN` is now above 1. Tests check he's the fastest, has the strongest throws, and flies off at a percent where the Brawler survives.
- He's still secret: off Random and CPUs, pickable online by anyone who unlocked him.
