# ADR-0085: Spamming the same special stops it launching

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0071 (stale moves)

## Context
Holden asked that using a special "three or so times in rapid succession" stops it from causing knockback and stun and makes it do half damage, rounded down. Stale moves (ADR-0071) already weaken repeats, but only down to 60%, and a spammed special still launches and stuns, so mashing one special was still a strong plan.

## Decision
- The sim counts uses of the **same special** in a row per fighter (`trackSpam` in `shared/fighter/sim.ts`). Air and ground versions are one special (`sspecialAir` counts as `sspecial`); a signature version (Knockout Punch, Flash Cut, Cook, encores) counts as the special it came from.
- A use is "in a row" if it starts within **1 s (60 frames)** of the previous use of that special ending. Using a different special, or waiting more than 1 s, starts the count over. Normal attacks in between don't reset it by themselves.
- From the **3rd use** in a row, every hit of that use (melee hitboxes, its projectiles, its follow-ups such as a slam's landing or a carry) does **half damage, rounded down**, **no knockback**, **no hitstun**, and no signature effects or meter gain. Both fighters still get a short hitlag freeze; the hit still counts for KO credit. A reflected projectile loses the flag.
- Exempt: neutral specials of fighters with ammo (Gunslinger's six-shooter, Pilgrim's blunderbuss), which their ammo and reload already limit; reload itself.
- The attacker gets a grey "SPAM" popup on a spammed hit.
- Numbers live in `SPECIAL_SPAM` (`shared/fighter/config.ts`).

## Alternatives considered
- **Any special counts toward the same streak:** would punish fighters whose kits chain different specials (Ninja's Shadow Step after marks, Chef's food then pan); the ask reads as one special used over and over.
- **Count only hits, not uses:** whiffed spam would never count, and projectiles that miss would keep it fresh.
- **Include the six-shooter:** would gut Gunslinger's hot streak and golden sixth bullet (ADR-0079).

## Consequences
CPUs that mash one special get weaker; they don't avoid the rule on purpose yet. Online needs no protocol change (the new fighter fields travel in the world snapshot).
