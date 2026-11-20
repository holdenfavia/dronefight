# dronefight — Spec

_Source of truth for what the game is **now**. Change only via `/decide`; details live in the ADRs. The old 3D FPV game (v1) is archived: see `docs/legacy/DRONEFIGHT_V1.md` (ADR-0070)._

## Vision

A **side-view platform fighter** to play with friends: an original cast of ten fighters knock each other off a rooftop (ADR-0072, ADR-0073). Pick up and play on a keyboard, no install, no account. Fun first.

## Players and platform

- Desktop browsers (Chrome/Edge primary; Safari/Firefox best-effort), **keyboard only** (ADR-0070).
- Up to **10 fighters** per match (ADR-0087; four panels shown until you add more): **one player per keyboard** (ADR-0071), CPUs (Easy, Normal, Hard) fill the rest. No local 2-player until online play.
- Boot to a title screen and main menu (Fight, Online, Controls, Settings), then a **roster-grid character select** with four player panels (more on demand, ADR-0087); CPUs are tagged **CPU** with their level everywhere (ADR-0075). **Settings** sets your own **tag** (up to 4 letters or digits, over your fighter) and **color**, saved in the browser and shown to the room online (ADR-0083).
- **Online** with friends by two-digit room code (ADR-0005) or invite link `?room=NN`: each player on their own computer picks and readies up in the room's lobby, the host sets the match on a **Match settings** screen when making the room (stage or Random, stocks, mode, stage pick and ban, ADR-0086) and CPUs, and starts. The **server runs the fight** and sends every frame's inputs to everyone; snapshots heal drift; late joiners watch; a leaver's fighter becomes a CPU (ADR-0076). Input queues stay short so online lag doesn't build up (ADR-0088).

## Rules (ADR-0070)

- Hits add **percent damage**; the higher it is, the further the fighter flies when hit (knockback grows with damage and shrinks with weight). Holding a direction when hit bends the launch a little.
- Knocked past a **blast zone** (off any edge of the screen) = lose a **stock**; respawn on a hovering pad with brief invincibility. Last fighter with stocks wins. Default 3 stocks (1–5).
- **Free-for-all** or **Teams** (ADR-0081): up to four teams (Red, Blue, Green, Yellow), teammates wear the team color, friendly fire off unless turned on, last team with stocks wins. Online, each player picks their own team; the host sets the mode, friendly fire and CPUs' teams.
- KO credit goes to whoever last hit you within 8 s.
- Hitlag (a freeze on every hit), screen shake and sparks scale with how hard the hit was.

## Controls (ADR-0071, ADR-0080)

| | Key |
|---|---|
| Move / jump (again in the air) | A D / W |
| Fast fall, hold to drop through | S |
| Attack that way | ← → ↑ ↓ (forward with no move key = neutral, with a move key = tilt) |
| Smash attack that way | hold **Shift** + arrow, hold the arrow to charge (ADR-0080) |
| Special that way | hold **Space**, or tap Space to prime the next arrow (ADR-0074) |
| Shield · roll / spot dodge / air dodge | E (+ direction) |
| Grab, then an arrow throws | ? |

Esc pauses, M mutes, F fullscreen (menus), Enter starts or rematches. Physical keys (`event.code`), so any keyboard layout works.

## Moves (ADR-0071)

- **Every fighter has its own moveset and gimmick** (ADR-0072, ADR-0073): jab (combos), tilts, charged smashes, five aerials, four specials, grab, pummel and four throws, get-up attack. Each also has a **signature mechanic** with a meter on its damage card (ADR-0079).
- **Defense:** shield (drains, breaks into a dizzy stun), **parry** by shielding just as a hit lands, rolls and spot dodge, one air dodge per jump (dashes if a direction is held).
- **Launched:** press E just before hitting the floor to **tech**, or get knocked down (get up, roll or attack). Mash to escape grabs.
- Super armor (Titan), counters (Brawler, Blade, Gunslinger), reflects (Chef), status effects (daze, swapped controls, slow, haste), stale moves (repeats get weaker), trades, a short input buffer.
- **Special spam** (ADR-0085): the 3rd use in a row of the same special (each within 1 s of the last) does half damage, rounded down, with no knockback or hitstun.
- Recovering near a stage corner (holding toward it, or during a recovery special) pulls you up onto it.

## Fighters (ADR-0072, ADR-0073; numbers in `shared/fighter/fighters.ts`)

| Fighter | Weight | Air jumps | Style and signature mechanic (ADR-0079) |
|---|---|---|---|
| Brawler | 100 | 1 | fast fists, short reach; **KO meter** fills from combos, full = Haymaker becomes a Knockout Punch |
| Blade | 95 | 1 | long sword reach; tip hits sharpen the **edge**, full = Flash Cut through shields; parry stance |
| Spark | 94 | 2 | floaty caster on **mana** (fizzles when empty); fireball, homing orb, blink, **rewind** that undoes damage |
| Titan | 115 | 1 | huge and slow, **armored**; soaked damage is stored as **payback** for the next smash; sky carry, earthquake |
| Ninja | 82 | 2 | fast; hits **mark** foes, Shadow Step onto a marked foe assassinates; smoke bomb dazes |
| Gunslinger | 98 | 1 | **six shots then reload**; hits in a row build a **hot streak**, the last bullet is golden; lasso, quick-draw counter |
| Chef | 104 | 1 | hits fill a **pantry** (tomato, pepper, meat); full = **Cook** a recipe; food toss, **pan flip reflects** |
| Ghost | 75 | 3 | floaty; hits **haunt** foes, a wisp on a fully haunted foe **possesses** them (the Ghost steers them) |
| Yo-yo Kid | 92 | 2 | juggles; a live **trick combo** makes each chained hit stronger; returning yo-yo, tether |
| Bard | 92 | 2 | guitar; attacks **on the beat** build groove, full = **encore** songs (long tempo, sleeping lullaby) |

**Secret:** River, unlocked by the code RIVER (ADR-0077): a big, round **glass cannon** (ADR-0078): fastest walk, hard hits, the strongest grabs and throws, a Belly Flop down special, but light and takes 1.25× knockback. Never drawn by Random or CPUs.

**Seasonal events** (ADR-0082): fighters and stages that join for part of the year (dates in US Central), tagged **Seasonal** on every menu; while on, Random and CPUs can draw them. **Thanksgiving, Nov 1–30:** Turkey (Gobble meter → Thunder Gobble), Pilgrim (one-shot blunderbuss; harvest → Harvest Cannon), Chief (an original Wampanoag-inspired fighter, a few simple feathers, no caricature; Three Sisters → Tidal Sweep), and the Harvest Farm stage. Christmas next.

## Cheat codes (ADR-0077)

Tap Space three times quickly on any menu to open the code box; type a code again to turn it off. RIVER (secret fighter), MOONJUMP, ONEHIT (fight rules; online the host's apply to the room), BIGHEAD, PURPLE, MIRROR, TURBO (offline fights only). SEASONS turns every seasonal event on, all year.

## Stages

Rooftop (main platform + three pass-through girders), Helipad (one flat pad), Crane Yard (narrow deck, two high crane arms). Same blast zones on all. Pick a stage or Random; with **stage pick and ban** on (a match setting, off by default) a **stage screen** comes after character select where you **ban** the ones you don't want (saved in the browser); online everyone's bans apply and a banned or Random pick is drawn from the unbanned ones (ADR-0086). Seasonal: Harvest Farm (Thanksgiving) is **on the ground**: the floor runs past both sides, so KOs are only off the left, right and top (ADR-0082).

## Look and sound

- Bright sky over a parallax city, orange / black / white (ADR-0007), fighters **dressed in their picked looks** (ADR-0084): lucha libre Brawler, pirate Blade, hourglass sage Spark, iron giant Titan, indigo Ninja, masked bandit Gunslinger, head chef, phantom gentleman Ghost, skater Yo-yo Kid, busker Bard; River, Turkey, Pilgrim and Chief too (ADR-0089), each with its main piece in the player's color (one color per slot: orange, lime, cyan, pink, ADR-0026, unless the player picked their own, ADR-0083; the team color in team battles, ADR-0081). Purple sky 2:02–2:22 pm US Central every day (ADR-0069).
- Menus: bold condensed caps on dark translucent panels with orange accents (ADR-0039).
- All sound synthesized in the browser (ADR-0010).

## Tech

- TypeScript + Vite (ADR-0002), **Canvas 2D** rendering.
- The fight is a deterministic fixed **60 Hz** simulation in `shared/fighter/` (inputs in, state out) so the server and every client run the same code for online play (ADR-0076).
- One Fly.io machine serves the page and the room WebSocket and sleeps when idle (ADR-0021).

## Hard rules

1. **Frame rate first.** A steady 60 FPS on a mid-range laptop.
2. **The fight is deterministic.** Same inputs, same result: no `Math.random()`, wall-clock time or rendering state in `shared/fighter/`. Randomness comes from the world's seeded generator.
3. **No copied assets or branding** from Super Smash Bros., Flight Division or any other game: no characters, art, sounds, stage designs, names or UI.
4. **No install, no account needed to play.**

## Out of scope (for now)

Gamepads and radios, accounts and progression, more than 10 fighters, items, story mode, mobile/touch.
