# ADR-0073: Six more fighters: Ninja, Gunslinger, Chef, Ghost, Yo-yo Kid, Bard

- **Status:** Accepted
- **Date:** 2026-11-10
- **Amends:** ADR-0072 (the roster grows from four to ten)

## Context
After the original cast (ADR-0072), the owner was offered eight more character ideas and picked six:
Ninja, Gunslinger, Chef, Ghost, Yo-yo Kid and Bard. Each had to play differently from the existing four.

## Decision
The roster is ten fighters. Matches still hold up to four. The new six (numbers in `shared/fighter/fighters.ts`):
- **Ninja:** fast and light. Throwing Stars (up to three out), **Shadow Step** (appears behind the nearest opponent
  and strikes), Vanish (teleport up), Smoke Bomb (a blast that dazes: long hitstun, almost no knockback).
- **Gunslinger:** a **six-shot revolver**; the seventh press reloads (ammo shown under the fighter). Lasso (a long grab
  that works in the air), Shotgun Jump (blast downward launches it up), Quick Draw (a counter that fires back).
- **Chef:** frying-pan normals. Food Toss **cycles** tomato, pie (dazes), meatball (heavy). **Pan Flip reflects**
  shots and throws back as the Chef's. Boiling Pot sits on the floor ~7 s and burns whoever stands in it.
- **Ghost:** floaty (three air jumps, long hover), long swipes. **Possess**: a slow homing wisp that **swaps
  left and right** for its target for 3 s. Fade: intangible for about half a second, free to drift. Drift Up.
- **Yo-yo Kid:** normals hit out and back with long reach; up hits pop gently for juggles. Yo-yo Throw **comes
  back**, Walk the Dog (multi-hit along the floor), **Tether** (latches onto the nearest stage corner in range
  and pulls up), Around the World (spins all round).
- **Bard:** a guitar. Sound Wave, **Tempo Song** (moves 35% faster for 5 s), **Lullaby** (everyone close moves
  40% slower for 4 s), Power Chord (recovery with a blast below), amp-slam smashes.

All original: no characters, names or moves copied from other games (Hard rule 3).

## Alternatives considered
- **Robot and Plant** were offered and not picked.

## Consequences
- New generic sim mechanics: stun, curse (left/right swap), slow and haste, ammo and reload, cycling throws,
  reflect, floor hazards, returning projectiles, shadow step, tether. Tuning in `shared/fighter/config.ts`
  (`REFLECT`, `STATUS`).
- New events: `reflect`, `status`; `shot` and `explode` carry a `look`.
