# ADR-0089: Dressed looks for River and the Thanksgiving fighters

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0084 (River and the seasonal fighters kept their stick figures)

## Context
ADR-0084 dressed the ten roster fighters and left River (ADR-0077, ADR-0078) and the Thanksgiving fighters (ADR-0082) as stick figures. On 2026-11-19 Holden asked to improve their looks too, built straight into the game rather than as concept sheets first.

## Decision
River, Turkey, Pilgrim and Chief get dressed looks in the same vector Canvas 2D style, on the same skeleton and poses (`client/src/dressedSeasonal.ts`). The slot, own or team color is the main piece, and the signature meter shows on the body:

- **River:** striped tee in the slot color stretched over the belly (it rides up a little), cargo shorts, sneakers, his propeller beanie (spins faster when he runs), a big grin. No meter.
- **Turkey:** a bronze tom; tail fan tipped in the slot color and wing primaries in the slot color; bare blue head, red snood and wattle. The fan puffs out and the wattle swells with the Gobble meter; at full the fan glows and crackles (Thunder Gobble).
- **Pilgrim:** doublet in the slot color, wide white collar and cuffs, tall black hat with a buckled band, breeches, white stockings, buckled shoes, brass blunderbuss (held at the ready between attacks). Harvest sheaves pile up as wheat on his back; full, the muzzle glows with a cannonball in it.
- **Chief:** still drawn plainly and respectfully (ADR-0082): long dark hair, a beaded headband in the slot color with two simple feathers, fringed deerskin tunic with a beaded yoke in the slot color, wampum sash, breechcloth in the slot color, leggings and moccasins, the canoe paddle (planted upright between attacks). Corn, bean and squash charms hang from his belt as each of the Three Sisters grows; full, the paddle runs with water (Tidal Sweep).

## Alternatives considered
- **Concept sheets first:** done for the ten (ADR-0084), but Holden asked for these to go straight in.

## Consequences
- Every fighter in the game now has a dressed look; the stick figures in `figures.ts` remain only as a fallback for new fighters.
- New seasonal fighters should get a dressed look when they are added.
