# ADR-0084: Dressed fighter looks replace the stick figures

- **Status:** Accepted
- **Date:** 2026-11-18
- **Amends:** ADR-0072 (characters drawn as placeholder stick figures)

## Context
Since the restart, the fighters have been placeholder stick figures, at the owner's request (ADR-0072). On 2026-11-18 Holden picked a look for each of the ten fighters from concept sheets (`docs/art/retexture/`) and asked for them to go into the game.

## Decision
- The ten roster fighters are drawn as their picked looks: Brawler **lucha libre** (flame mask, cape, trunks, boots), Blade **pirate captain** (long coat, tricorn, eyepatch, earring, cutlass), Spark **hourglass sage** (robe, star hat, beard, hourglass staff), Titan **iron giant** (an original riveted boiler body with a chest furnace, not any game's golem), Ninja **classic night indigo** (hood, headband, sword on the back, shuriken), Gunslinger **masked bandit** (bandana mask, flat hat, poncho, bandolier, revolver), Chef **head chef** (tall toque, mustache, jacket, pan), Ghost **phantom gentleman** (see-through, top hat, monocle, cane, coat trailing into a wisp), Yo-yo Kid **skater kid** (backwards cap, hoodie, skateboard on the back), Bard **street busker** (beanie, flannel, acoustic guitar).
- Still drawn with Canvas 2D paths in `client/src/figures.ts` (no image files), on the same skeleton and attack poses, so every move still reads and sizes still match the hitboxes.
- The slot, personal or team color (ADR-0026, ADR-0083, ADR-0081) is each look's main accent piece (for example the Brawler's mask, the Blade's coat, the Spark's robe), so you can still tell fighters apart at a glance.
- The signature meter (ADR-0079) shows on the body as it fills or when it's full: the Brawler's mask eyes burn, the Blade's cutlass glints, the Spark's hourglass glows, the Titan's furnace heats, the Ninja's eyes glow, the Gunslinger's bandolier lights up, the Chef's pan flames, the Ghost's eye glows, the Yo-yo Kid's yo-yo gets a rainbow trail, and the Bard's guitar sends notes.
- River and the seasonal fighters (Turkey, Pilgrim, Chief) keep their current figures for now. (Amended 2026-11-19 by ADR-0088: they are dressed too.)

## Alternatives considered
- **Image sprites drawn from the concept sheets:** they would need every pose drawn by hand and would scale badly. Vector paths keep the poses and stay sharp at any camera zoom.
- **Keep stick figures until later:** the owner asked for the looks now.

## Consequences
- `client/src/figures.ts` grows a dressed drawing per fighter. Frame rate still comes first (Hard rule 1): no per-frame gradients beyond the existing glows, and nothing new per frame that allocates a lot.
- Drawing only. No change to `shared/fighter/` or to the protocol.
- SPEC's Look section no longer says stick figures for the ten.
