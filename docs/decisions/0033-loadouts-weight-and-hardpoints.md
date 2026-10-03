# ADR-0033: Loadouts: bodies with thrust, weight and hardpoints

- **Status:** Accepted
- **Date:** 2026-10-03
- **Implements:** ADR-0030 step 1 (loadout system and first content batch)
- **Supersedes:** the fixed per-class weapons and specials of ADR-0013, ADR-0014, ADR-0016, ADR-0022, ADR-0024 and ADR-0025 (each weapon and special keeps its rules; what changes is that they're modules you choose)

## Context

The pilots want depth and freedom: build your own drone, with real consequences. Weapons have weight; drones have thrust. You can bolt four rail guns onto anything, but if it weighs more than its motors can lift, it sits on the ground. Freedom first, and not every choice is a good one.

## Decision

- A **loadout** is a **body**, one weapon per **hardpoint** (empty allowed), and one **special** (or none).
- **Bodies** (`shared/drones.ts`): frame weight (kg), max thrust (kgf), hardpoints, HP, hit radius / drawn size, and flight model. Batch 1: Freestyle 5" (2 hardpoints), 3D quad (2), FPV wing (2), **3" racer** (1, light and twitchy, 70 HP), **X8 heavy lifter** (4, slow, 180 HP).
- **Weapons** (`shared/weapons.ts`), each with a weight: gun, shotgun, rotary cannon, missile pod (the flown missile, ADR-0025), and new **rail gun** (heavy, 75 dmg, near-instant) and **burst rifle** (3-round bursts).
- **Specials** (`shared/specials.ts`), with weights: smoke trail (ADR-0024), maneuver mode (wing only, ADR-0022), and new **afterburner** (hold: +60% thrust, limited fuel) and **shield** (tap: absorbs the next 40 damage for 3 s, server-side).
- **Physics:** total weight = frame + modules; thrust is fixed. Each body's **default loadout flies exactly as tuned today**; other loadouts scale the simulated mass by (total ÷ default total), so thrust-to-weight falls as you add weight. Heavier quads also respond more slowly (rate tracking slows with load), and a heavier wing stalls faster. **T/W ≤ 1: you can't take off.** No weight limit is enforced: bad builds are allowed.
- **Muzzles and projectiles:** each hardpoint fires from its own corner of your view (1 upper left, 2 upper right, 3 lower left, 4 lower right), converging on the crosshair. Every weapon has a recognizable projectile (core in the weapon's color, glow in the shooter's pilot color).
- **Controls:** Fire shoots every gun on your hardpoints at once, each at its own rate. If you carry missile pods, they're a second weapon group: **Special switches groups when your special slot is empty** (exactly today's Freestyle), otherwise a new optional **Switch weapon** binding (Q on the keyboard).
- **Server:** validates every loadout against the shared catalog (body exists, no more weapons than hardpoints, special allowed on that body) and uses the firing weapon's own stats for each shot, with a fire-rate bucket per weapon type (count × rate). Shields are server-side.
- Everything is **unlocked** while we balance; levels gate it later (ADR-0032).

## Default loadouts (unchanged play)

| Body | Weapons | Special |
|---|---|---|
| Freestyle 5" | gun + missile pod | none (Special switches guns/missile) |
| 3D quad | shotgun | smoke |
| FPV wing | rotary cannon | maneuver |
| 3" racer | gun | none |
| X8 heavy lifter | gun ×2 + burst rifle + missile pod | shield |

## Consequences

- Protocol version 12: the loadout message carries the whole loadout, shots name their weapon, match state shows each pilot's loadout (for models and sounds).
- A Loadout screen (Drone in the pause menu) shows weight, thrust, thrust-to-weight and hover throttle as you build, with warnings, but never blocks a choice.
