# dronefight — Spec

_Source of truth for what the game is **now**. Change only via `/decide`; details live in the ADRs. The old 3D FPV game (v1) is archived: see `docs/legacy/DRONEFIGHT_V1.md` (ADR-0070)._

## Vision

A **side-view drone brawler** to play with friends: little drone characters knock each other off a rooftop. Pick up and play on a keyboard, no install, no account. Fun first.

## Players and platform

- Desktop browsers (Chrome/Edge primary; Safari/Firefox best-effort), **keyboard only** (ADR-0070).
- Up to **4 drones** per match: **one player per keyboard** (ADR-0071), CPUs (Easy, Normal, Hard) fill the rest. No local 2-player until online play.
- Online play with friends by two-digit room code comes next (ADR-0005); the server already groups players by code.

## Rules (ADR-0070)

- Hits add **percent damage**; the higher it is, the further the drone flies when hit (knockback grows with damage and shrinks with weight). Holding a direction when hit bends the launch a little.
- Knocked past a **blast zone** (off any edge of the screen) = lose a **stock**; respawn on a hovering pad with brief invincibility. Last drone with stocks wins. Default 3 stocks (1–5).
- KO credit goes to whoever last hit you within 8 s.
- Hitlag (a freeze on every hit), screen shake and sparks scale with how hard the hit was.

## Controls (ADR-0071)

| | Key |
|---|---|
| Move / jump (again in the air) | A D / W |
| Fast fall, hold to drop through | S |
| Attack that way | ← → ↑ ↓ (forward with no move key = neutral; move key + same arrow together = smash, hold to charge) |
| Special that way | hold **Q**, or tap Q to prime the next arrow |
| Shield · roll / spot dodge / air dodge | E (+ direction) |
| Grab, then an arrow throws | ? |

Esc pauses, M mutes, F fullscreen (menus), Enter starts or rematches. Physical keys (`event.code`), so any keyboard layout works.

## Moves (ADR-0071)

- **Every drone has its own moveset:** jab (combos), tilts, charged smashes, five aerials, four specials, grab, pummel and four throws, get-up attack.
- **Defense:** shield (drains, breaks into a dizzy stun), **parry** by shielding just as a hit lands, rolls and spot dodge, one air dodge per jump (dashes if a direction is held).
- **Launched:** press E just before hitting the floor to **tech**, or get knocked down (get up, roll or attack). Mash to escape grabs.
- Super armor (Heavy smashes), counters (Freestyle), stale moves (repeats get weaker), trades, a short input buffer.
- Recovering near a stage corner (holding toward it, or during a recovery special) pulls you up onto it.

## Drones (numbers in `shared/fighter/fighters.ts`)

| Drone | Weight | Air jumps | Notes |
|---|---|---|---|
| Freestyle (5") | 100 | 2 | all-rounder: charge blaster, barrel roll, aimed thrust, counter |
| Racer (3") | 80 | 3 | tiny, fast: rapid jab and darts, two air dashes, proximity mine |
| Heavy (X8) | 140 | 1 | huge, slow: armored smashes, cannonball, bear hug, ground pound |
| Flipper (3D quad) | 90 | 2 | floaty, hovers: reverse gust, flip kick, two flip-ups, slam spike |

## Stages

Rooftop (main platform + three pass-through girders), Helipad (one flat pad), Crane Yard (narrow deck, two high crane arms). Same blast zones on all.

## Look and sound

- Bright sky over a parallax city, orange / black / white (ADR-0007), characters drawn as **placeholder stick figures** for now (owner's request; the drone art is kept behind `CHARACTER_ART` in `client/src/config.ts`), each in the player's color (one color per slot: orange, lime, cyan, pink; ADR-0026). Purple sky 2:02–2:22 pm US Central every day (ADR-0069).
- Menus: bold condensed caps on dark translucent panels with orange accents (ADR-0039).
- All sound synthesized in the browser (ADR-0010).

## Tech

- TypeScript + Vite (ADR-0002), **Canvas 2D** rendering.
- The fight is a deterministic fixed **60 Hz** simulation in `shared/fighter/` (inputs in, state out) so the same code can run everywhere for online play.
- One Fly.io machine serves the page and the room WebSocket and sleeps when idle (ADR-0021).

## Hard rules

1. **Frame rate first.** A steady 60 FPS on a mid-range laptop.
2. **The fight is deterministic.** Same inputs, same result: no `Math.random()`, wall-clock time or rendering state in `shared/fighter/`. Randomness comes from the world's seeded generator.
3. **No copied assets or branding** from Super Smash Bros., Flight Division or any other game: no characters, art, sounds, stage designs, names or UI.
4. **No install, no account needed to play.**

## Out of scope (for now)

Gamepads and radios, accounts and progression, more than 4 drones, items, story mode, mobile/touch.
