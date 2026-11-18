# ADR-0082: Seasonal events, starting with Thanksgiving

- **Status:** Accepted
- **Date:** 2026-11-18
- **Amends:** ADR-0073 (roster), ADR-0070 (stages: one stage on solid ground), ADR-0077 (a new code, SEASONS)

## Context

Holden asked (2026-11-18) for Thanksgiving events: a turkey, a pilgrim and a Native American fighter, plus a new fall-themed stage, all labeled as **seasonal**, with Christmas to follow "when we get there", and a framework that makes seasonal events work. He then asked for the fall stage to be **on the ground**: you can only be knocked out off the left, the right and the top, not the bottom.

## Decision

- **Framework (`shared/seasons.ts`):** an event is an entry in `SEASONS`: a name, a banner line, a first and last day (inclusive, may wrap the new year), its fighters, its stages and its colors. Dates are read in **US Central time** (`America/Chicago`, like the purple sky, ADR-0069), so everyone sees the same event on the same day. Adding Christmas = one `SEASONS` entry plus its fighters in `SEASONAL_FIGHTER_IDS` and stages in `SEASONAL_STAGE_IDS`.
- **While an event is on:** its fighters join the roster grid and its stages join the stage list; **Random and CPUs** may draw them (never secret fighters). Out of season they are hidden, and saved picks of them fall back to Brawler / Rooftop.
- **Labeled Seasonal everywhere:** a **Seasonal** tag on the roster tile, "Seasonal · Thanksgiving" on the player panel and lobby card, "· Seasonal" on the stage button, and a banner on the main menu for each event on now.
- **The sim never reads the date** (Hard rule 2): it knows every seasonal fighter and stage all year. Menus decide what's offered; the room server uses its own clock for CPU picks; online picks of any known fighter are accepted (as with River).
- **SEASONS** cheat code (ADR-0077): turns every event on, all year, on this computer (for testing and off-season fun).
- **Thanksgiving: November 1 to 30.**
  - **Turkey** (weight 84, 2 air jumps, a short flap hover): pecks and wing slaps, Egg Lob, Turkey Trot, Flap Flap, Gobble (a stunning shout). Signature **Gobble meter**: fills from damage dealt and taken; full, Gobble becomes **Thunder Gobble**.
  - **Pilgrim** (106): a threshing flail, a one-shot **Blunderbuss** that reloads after every shot, Pitchfork Charge, Hat in Hand, Pumpkin Toss. Signature **Harvest**: landed smashes and throws gather sheaves; three, and the next shot is the **Harvest Cannon**.
  - **Chief** (96): an **original fighter inspired by the Wampanoag**, the "People of the First Light" of the coast where the 1621 harvest was shared. Drawn plainly and respectfully: long hair, a deerskin mantle, a wampum sash and a canoe paddle; **no war bonnet, war paint, tomahawk or other caricature**, and not a real historical person. Named **Chief** (2026-11-18, Holden's pick; first named First Light), and wears **a few simple feathers** in a headband (Holden's request, "like in the CGP Grey videos": two or three stylized feathers, not a full war bonnet). Paddle normals, Fishing Spear, Net Cast (long grab), Paddle Vault, Fish Weir (counter). Signature **Three Sisters**: ground hits grow corn, air hits beans, specials and throws squash; all three, and the next smash is a **Tidal Sweep**.
  - **Harvest Farm** stage: a fall farm (autumn sky and hills, barn and silo, fall trees, falling leaves, scarecrow, pumpkins). **On solid ground:** the floor runs past both side blast zones, so nobody can fall out the bottom; KOs happen only off the left, right and top. Hay bales (left), a hay wagon (right) and an oak bough (high middle) are pass-through platforms. The camera frames the middle of the field (`StageDef.view`).

## Alternatives considered

- **Seasonal content always on, just tagged:** simpler, but then it isn't an event and the roster keeps growing.
- **A stereotyped "Native American" figure (feathered headdress, tomahawk):** rejected as a caricature; a specific, respectfully drawn, culture-grounded original fighter instead.
- **Each player's own time zone for event dates:** friends in different zones could see different rosters on the boundary days; one zone keeps everyone together.
- **Harvest Farm with an edge like the other stages:** Holden asked for it on the ground.

## Consequences

- `FighterId` and `StageId` grew; room protocol version bumped (107).
- SPEC's stage line no longer says "same blast zones on all" without exception: the Harvest Farm has the same blast zones but no bottom to fall through.
- Christmas is next: add a `SEASONS` entry (for example December 1 to 31), its fighters and its stage, following this ADR.
- CPUs don't play around the new mechanics on purpose yet (same as the rest of the cast, ADR-0079).
