# ADR-0071: One player per keyboard (arrows attack, Q special) and a deeper combat system

- **Status:** Accepted
- **Date:** 2026-11-10
- **Amends:** ADR-0070 (controls, local players, moves)

## Context
The owner wanted every drone to fight differently and the combat "upgraded a lot". He also wanted the
attacks on the arrow keys with WASD for movement, since the game is headed for online play. That
layout fits only one person on a keyboard, which contradicts ADR-0070's "two players on one keyboard".
Asked, he chose one player per keyboard everywhere (local 2-player goes away until online play).

## Decision
**Controls (one player per keyboard, physical keys):**
- W A S D: jump / move / fast fall (hold S to drop through girders).
- Arrow keys: attack in that direction. The forward arrow with no movement key held is the neutral move
  (jab, neutral aerial). Holding a movement key the same way makes it a tilt; pressing the movement key
  and the same arrow together is a **smash**, charged by holding the arrow.
- **Q makes arrows specials:** hold Q, or tap Q once to prime the next arrow (owner's design). Q + forward
  arrow = neutral special, Q + back arrow (or move key + arrow) = side special, Q + up / down = up / down special.
- **E:** shield; with a direction it rolls (A/D) or spot dodges (S); in the air, an air dodge (directional with WASD).
- **? (slash):** grab. While holding: an arrow (or WASD) throws that way, ? again pummels.

**Combat:**
- Each drone has its own moveset (frame data, reach, power, multi-hits, specials); see `shared/fighter/fighters.ts`.
  Freestyle: charge blaster, barrel roll, aimed thrust, counter. Racer: rapid jab and darts, two air dashes,
  rocket climb, proximity mine. Heavy: super armor on smashes, cannonball, bear hug command grab, ground pound.
  Flipper: hover (hold jump), reverse gust (pushes, no damage), flip kick, two flip-ups, slam spike.
- Smash attacks (charge up to 1 s, up to +40% damage), jab combos, grabs, pummels and four throws, mashing out.
- Tumble and **teching** (press E just before landing while launched), knockdown with get-up, roll and get-up attack.
- **Parry** (shield on the frame a hit lands), super armor, counters, stale moves (repeats get weaker),
  trades, and a short input buffer.
- Tuning in `shared/fighter/config.ts` (SMASH, GRAB, TECH, KNOCKDOWN, STALE, PARRY, AIRDODGE).

## Alternatives considered
- **Keep a split two-players layout as well:** recommended, but the owner chose one layout only.
- **Specials on bare arrows, attacks with Q:** normal attacks are used far more, so they get the bare keys.
- **Space for special:** replaced by Q (hold or prime), which keeps the whole moveset on the arrows.

## Consequences
- No local 2-player until online play (Phase 2); matches are you plus up to three CPUs.
- The sim's `Input` grew aim keys and a grab button; bots use the same inputs.
- The menu's slot cycle is You / CPU / Off.
