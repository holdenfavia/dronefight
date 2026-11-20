# ADR-0091: Christmas event: six fighters and the Winter Village

- **Status:** Accepted
- **Date:** 2026-11-20
- **Amends:** ADR-0082 (a second seasonal event), ADR-0084 (dressed looks for the new six)

## Context

ADR-0082 built seasonal events with Thanksgiving and said Christmas was next. Holden asked (2026-11-19) to "start work on the christmas update". Offered three lineups (Snowman, Nutcracker, Elf / Santa, Reindeer, Elf / Gingerbread, Snowman, Nutcracker), he answered "lets do all of them": six Christmas fighters.

## Decision

- **Christmas: December 1 to 31** (US Central, as ADR-0082), one `SEASONS` entry in `shared/seasons.ts`. The SEASONS code turns it on all year.
- **Six original fighters** (no film, toy-line or mascot versions of any of them, Hard rule 3), each with a signature meter (ADR-0079):
  - **Snowman** (114, 1 air jump): slow and heavy; Snowball (slows), Belly Slide, Snow Burst, Ice Patch (a slowing hazard). **Snowpack**: each snowball that lands packs one; three, and the next Snowball is an **Avalanche** (a huge rolling snowball that slows and stuns).
  - **Nutcracker** (106): a wooden toy soldier with a saber; Toy Cannon, Saber March (armored), Wind-up Spin, Jaw Clamp (counter). **Wind-up Key**: winds while marching on the ground and a little with each hit; fully wound, the next smash is a **Crunch** (×1.35 damage, ×1.3 knockback).
  - **Elf** (80, 2 air jumps): quick; Toy Toss (train, bouncy ball, top in turn), Gift Wrap (command grab), Candy Cane Pogo, Jingle Bell (a short stun). **Sugar Rush**: fills from damage dealt; full, Jingle Bell becomes **Sugar Rush** (a burst and 7 s of haste).
  - **Santa** (118): big; Gift Bomb, Sleigh Dash (long recovery), Sleigh Bells, Chimney Drop (slam). **Naughty List**: whoever hits Santa is listed for 8 s; his next hit on a listed fighter is a **Lump of Coal** (×1.3 damage, ×1.2 knockback) and takes them off.
  - **Reindeer** (90, 2 air jumps, long hover): Nose Beam, Gallop, Sky Leap, Hoof Stomp (slam). **Glow**: each aerial that lands lights the nose; three, and the next Nose Beam is a **Beacon** (×1.9 damage, ×1.5 knockback).
  - **Gingerbread** (70, 2 air jumps, fastest walk): Gumdrop, Run Run Run (multi-hit dash), Icing Swing (tether), Cookie Cutter. **Fresh Batch**: fills from damage taken (and a little dealt); full, the down special bakes a **Fresh Batch** (a burst that also heals 15%).
- **Dressed looks from day one** (ADR-0084), in `client/src/dressedChristmas.ts`, the slot color as each look's main piece (Snowman's scarf and hat band, Nutcracker's jacket, Elf's tunic and hat, Santa's suit, Reindeer's harness, Gingerbread's bow tie); each meter shows on the body.
- **Winter Village** stage: a snowy village square at dusk with the same blast zones and an edge like the city stages; a market-stall roof (low left), a parked sleigh (low right) and a garland of lights between two lamp posts (high middle) are pass-through platforms; a big decorated tree, houses, hills and falling snow behind (`client/src/winterStage.ts`).

## Alternatives considered

- **Three fighters, like Thanksgiving:** Holden picked all six.
- **Winter Village on the ground like the Harvest Farm:** kept an edge so it plays like the main stages and differs from the fall one.
- **Slippery ice on the stage:** more sim work and hard to read; the Snowman's Ice Patch carries the ice idea instead.

## Consequences

- `FighterId` and `StageId` grew; room protocol version bumped (111).
- CPUs don't play around the new mechanics on purpose (same as the rest of the cast).
- Santa's Naughty List uses the per-slot `tags` the Ninja and Ghost use, indexed by Santa's slot.
