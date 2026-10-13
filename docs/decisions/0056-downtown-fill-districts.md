# ADR-0056: Fill Downtown's last bare asphalt: suburb, favela hill, sports park, airport south

- **Status:** Accepted
- **Date:** 2026-10-13
- **Amends:** ADR-0054 (Downtown districts)

## Context
After the 1,120 m expansion (ADR-0055) about 24 hectares of Downtown were still bare asphalt, in four patches.
The owner wanted them filled, not necessarily densely, and suggested low-density housing; they picked all four
proposed fills.

## Decision
- **Suburb** (northeast, between Central Park and the runway): 48 family houses on three streets: gable roofs
  (a 45° gable prism plus two roof slabs), lawns, back and side fences, driveways with shootable cars, trees,
  some backyard pools, street lamps.
- **Favela** (west, between the megaproject and the edge): a ten-step terraced hill rising to 30 m at the map's
  edge, packed with small brick and painted houses on a 7 m grid (gaps of about a metre to thread), blue rooftop
  water tanks and bare rebar, stairways every 66 m, a few trees.
- **Sports park** (east of the stadium): a lit soccer pitch with bleachers and goals, a skatepark (half-pipe,
  funbox with ramps, rails, quarter pipe) and two tennis courts.
- **Airport south** (south of the hangars): a car park with a rental canopy (shootable cars), a cargo terminal,
  container stacks, three fuel tankers (tanks explode) and a parked cargo jet.
- Everything obeys the no-shared-faces rule (ADR-0055). Downtown: ~9,700 solid pieces, ~1,800 decor, 138
  destructible props.

## Alternatives considered
- **Big-box mall and parking lots:** flatter and less fun to fly through than houses and a favela.
- **More towers:** the city already has them; low buildings give new kinds of cover.

## Consequences
Rendering stays within budget (measured 2.6–8.3 ms a frame at 2048×1536 on the dev machine, including a full
overview). No new spawns; the eight stay where they are.
