# ADR-0072: An original cast of fighters replaces the drones

- **Status:** Accepted
- **Date:** 2026-11-10
- **Amends:** ADR-0070 (the theme and roster: no longer drones), ADR-0071 (the per-drone movesets)

## Context
After the per-drone movesets (ADR-0071) and attack looks, the owner felt the four drones still played like
one fighter with different numbers. He wanted completely different attacks. When offered drone-themed
gimmicks, he said he doesn't want the characters based on drones: "just like a Super Smash Bros. type game".
Asked to keep the drones or change the decision, he chose to change it (option b).

## Decision
- The fighters are an **original cast**, not drones. Four to start, each with its own style and gimmick:
  - **Brawler:** a fast boxer with short reach. **Rage** fills as it deals and takes damage; at full rage its
    next smash or special hits ×1.5 damage and ×1.3 knockback, then the meter empties. Specials: Haymaker
    (chargeable, armored punch), Dash Uppercut, Spiral Kick, Counter-punch.
  - **Blade:** a swordfighter with long reach. **Sword tip**: hitting with the end of the blade is much stronger
    than up close (the tip only counts when the base of the blade misses). Specials: Sword Wave (a flying slash),
    Lunge, Rising Spin, Parry Stance (counters melee and shots with a riposte).
  - **Spark:** a light, floaty caster (hold jump to levitate), weak up close and strong from range. Specials:
    Fireball (chargeable), Homing Orb (follows the nearest opponent), **Blink** (teleport the way you hold),
    **Rewind** (snap back to where you were ¾ s ago; once per trip off the ground).
  - **Titan:** a huge, slow grappler with **super armor** on its ground attacks. Specials: Boulder Toss,
    **Sky Carry** (a command grab that catches shields and airborne fighters, leaps up and slams them down),
    Titan Leap, Earthquake (stamp on the ground, plummet in the air; the ground shakes on both sides).
- The game still plays like the genre (percent, stocks, smashes, specials, grabs). Characters, names and moves are
  our own; nothing is copied from Super Smash Bros. or any other game (Hard rule 3).
- Characters stay placeholder stick figures, each with its own silhouette: gloves and headband, sword and
  topknot, pointed hat and glowing hands, a huge boxy body. The drone art is removed.
- The game's name stays **dronefight** for now; renaming is a separate decision.

## Alternatives considered
- **Keep the drones with drone-themed gimmicks** (trick meter, race gates, cargo, invert): offered first; the owner
  didn't want drone-based characters.
- **Other original casts** (animals, elements): offered; the mixed cast was the main pitch and the owner went with (b)
  without picking another, so this cast was built. It can be swapped or extended later.

## Consequences
- `FighterId` is `brawler | blade | spark | titan`; saved menu setups from before reset (storage key v3).
- The sim gained generic mechanics: rage, tip hitboxes, homing shots, teleport, rewind (position history),
  hop (jumping moves from the ground), limited down specials in the air.
- Hit events carry `rage` and `tip` so the renderer can show them; a `warp` event shows blinks and rewinds.
- SPEC's vision, roster and look sections change; `client/src/drones.ts` is now `client/src/figures.ts`.
