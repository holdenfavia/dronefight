# dronefight — Spec

_Source of truth for what the game is **now**. Change only via `/decide`; details live in the ADRs. The old 3D FPV game (v1) is archived: see `docs/legacy/DRONEFIGHT_V1.md` (ADR-0070)._

## Vision

A **side-view drone brawler** to play with friends: little drone characters knock each other off a rooftop. Pick up and play on one keyboard, no install, no account. Fun first.

## Players and platform

- Desktop browsers (Chrome/Edge primary; Safari/Firefox best-effort), **keyboard only** (ADR-0070).
- Up to **4 drones** per match: two players share one keyboard, CPUs (Easy, Normal, Hard) fill the rest. A lone player can use either side of the keyboard.
- Online play with friends by two-digit room code comes next (ADR-0005); the server already groups players by code.

## Rules (ADR-0070)

- Hits add **percent damage**; the higher it is, the further the drone flies when hit (knockback grows with damage and shrinks with weight). Holding a direction when hit bends the launch a little.
- Knocked past a **blast zone** (off any edge of the screen) = lose a **stock**; respawn on a hovering pad with brief invincibility. Last drone with stocks wins. Default 3 stocks (1–5).
- KO credit goes to whoever last hit you within 8 s.
- Hitlag (a freeze on every hit), screen shake and sparks scale with how hard the hit was.

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump (again in the air) | W | ↑ |
| Drop through / fast fall | S | ↓ |
| Attack (+ direction) | F | K |
| Special (+ direction) | G | L |
| Shield / dodge | H | ; |

Esc pauses, M mutes, F fullscreen (menus), Enter starts or rematches. Physical keys (`event.code`), so any keyboard layout works.

## Moves

- **Attacks:** jab, side, up and down on the ground; neutral, forward, back, up and down (spike) in the air.
- **Specials:** neutral = blaster shot, side = dash (also a recovery), up = thrust boost then a helpless fall, down = bomb (Flipper: slam spike).
- **Defense:** shield (drains, breaks into a dizzy stun), roll and spot dodge from shield, one air dodge per jump.
- Recovering near a stage corner (holding toward it, or during the up special) pulls you up onto it.

## Drones (numbers in `shared/fighter/fighters.ts`)

| Drone | Weight | Air jumps | Notes |
|---|---|---|---|
| Freestyle (5") | 100 | 2 | all-rounder |
| Racer (3") | 80 | 3 | tiny, fast, quick weak hits, rapid darts |
| Heavy (X8) | 140 | 1 | huge, slow, strong, cannonball shot |
| Flipper (3D quad) | 90 | 2 | floaty, two up specials, slam spike |

## Stages

Rooftop (main platform + three pass-through girders), Helipad (one flat pad), Crane Yard (narrow deck, two high crane arms). Same blast zones on all.

## Look and sound

- Bright sky over a parallax city, orange / black / white (ADR-0007), drones in v1's style with a camera "eye" and props in the player's color (one color per slot: orange, lime, cyan, pink; ADR-0026). Purple sky 2:02–2:22 pm US Central every day (ADR-0069).
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
