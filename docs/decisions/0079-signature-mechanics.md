# ADR-0079: A signature mechanic and HUD meter for every fighter

- **Status:** Accepted
- **Date:** 2026-11-17
- **Amends:** ADR-0072 (the Brawler's rage becomes the KO meter), ADR-0073 (each fighter's gimmick gets deeper)

## Context
Holden asked for more depth per fighter: "give brawler a ko meter, chef an ingredients list and more complex interactions like that", and later for more varied side smashes and basic attacks. Most fighters had a light gimmick tied to one special, and many forward smashes and tilts were the same single hitbox with different numbers.

## Decision
Every cast fighter (not River) has one signature mechanic, shown as a small meter under the stocks on its damage card. The logic is in `shared/fighter/signature.ts`, every number in `SIGNATURE` in `shared/fighter/config.ts`.

| Fighter | Mechanic | How it fills | What it does |
|---|---|---|---|
| Brawler | **KO Meter** (replaces rage) | Damage dealt, more in a combo; a little from damage taken; getting launched knocks 20 off | Full: Haymaker becomes the **Knockout Punch** (chargeable, unflinchable, huge launch) |
| Blade | **Edge** (3 levels) | Each sword-tip hit; any hit taken dulls it to 0 | +10% sword damage per level; full: Lunge becomes **Flash Cut** (dash through, pierces shields) |
| Spark | **Mana** (100) | Refills over time and from melee hits | Specials cost mana; too little and the spell fizzles (half power, short blink). **Rewind undoes the damage** taken since the point it rewinds to |
| Titan | **Payback** | Damage its armor soaks | Added (60%) to the next smash or Earthquake, with extra knockback |
| Ninja | **Marks** on foes (3) | Each Ninja hit marks the foe (fade after 6 s) | Shadow Step goes for the most-marked foe and cashes the marks in as **Assassinate** |
| Gunslinger | **Hot Streak** (5) | Each bullet that hits; a miss resets it | The last bullet in the cylinder is **golden**: stronger with the streak |
| Chef | **Pantry** (3 slots) | Ground hits gather a tomato, air hits a pepper, throws meat (one per move) | Full: Boiling Pot becomes **Cook**: one of each = Chef's Special (armor vs light hits + haste), 2 peppers = Chili (hits ×1.3), 2 meat = Stew (heals 25%), else Tomato Soup (food dazes) |
| Ghost | **Haunt** on foes (3) | Each Ghost hit (fade after 8 s) | Possess wisp on a fully haunted foe = **possession**: for ~1.7 s the foe moves with the Ghost's movement keys; mashing shakes it off |
| Yo-yo Kid | **Trick Combo** | Hits within 50 frames of each other | +6% damage per hit in the chain (to +45%); from the 4th hit on, launches grow |
| Bard | **Groove** (4) | Attacks started on the 120 BPM beat (±4 frames) +1; off-beat −1; launched −1 | +7% damage per level; full: Tempo Song and Lullaby become **encores** (10 s haste; a lullaby that puts foes to sleep) |

Most fighters also get more distinct forward smashes and forward tilts: Brawler's one-two rush and step-in body blow, Blade's step-step-thrust, Spark's fire pillar and static palm, Titan's double-fist slam with a floor crack and shoulder charge, Ninja's dash-through cut and spinning kicks, Gunslinger's point-blank blast and rope whip, Chef's rolling pin, chop-chop jab and pan flip-up, Ghost's chilling wail and phase swipe, Yo-yo Kid's rock-the-baby, Bard's amp blast and two-beat swing.

All state lives on the fighters in the world, so online snapshots carry it and the sim stays deterministic. The world's shape changed, so `PROTOCOL_VERSION` is bumped (105, after ADR-0080's 104).

### Balance pass (same day)
Holden asked which fighters were unbalanced and chose to fix all six that stood out. A round robin of Hard CPUs (every pairing 40 times, 1v1 on all three stages) started at Titan 88%, Ninja 74%, Chef 64% wins against Blade 20%, Yo-yo Kid 20%, Spark 31%. After the changes, and after Shift smashes (ADR-0080) changed how CPUs smash, every fighter wins 37% to 62% (River, tuned in ADR-0078, at 62%):
- **Titan:** weight 150 → 115, lighter armor on jab, tilts and smashes, smashes and back throw a little weaker.
- **Ninja:** walk 450 → 410, slower dash-through cut and Shadow Step with less invincibility and power, less kill power on smashes and back air; marks give +3 damage and +12% knockback each (was +4, +22%).
- **Chef:** weight 108 → 104, weaker tomato, meatball and rolling pin.
- **Blade:** walk 350 → 370, quicker jab and tilts, stronger base of the blade, more kill power on smashes and back throw.
- **Yo-yo Kid:** weight 88 → 92, walk 380 → 400, more damage and launch on jab, tilts, aerials, smashes and the yo-yo; trick finisher from the 3rd hit.
- **Spark:** weight 85 → 94, walk 300 → 330, stronger close-range attacks, smashes and back throw, closer fire pillar, Blink costs 10 mana (was 20).
- **Brawler** (rose to the top once CPUs used its new one-two rush): weight 105 → 100, slower and weaker one-two rush, KO meter fills a little slower.
- CPUs now judge a smash by its strongest hit, not its first (multi-hit smashes start with weak catching hits).

## Alternatives considered
- **Copy the Smash boxer's KO meter as is:** a meter from damage dealt/taken with one KO uppercut. Ours fills from combos, drains when launched and powers the Haymaker, to stay original (Hard rule 3).
- **Pickup items for the Chef's ingredients:** items are out of scope; ingredients come from the kind of hit instead.
- **Ghost taking full control (attacks too):** too strong and confusing; possession steers movement only.

## Consequences
- New fighter fields (`meter`, `pantry`, `buff`, `chain`, `tags`, `puppet`...) and new moves (`kopunch`, `flashcut`, `cook`, `tempoEncore`, `lullabyEncore`).
- The `hit` event's `rage` flag is replaced by `sig`; a new `signature` event drives popups.
- CPUs don't play around the mechanics deliberately yet; they trigger them by chance.
- River has no mechanic (it is its own glass cannon, ADR-0077 and ADR-0078).
