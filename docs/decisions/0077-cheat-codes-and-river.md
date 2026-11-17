# ADR-0077: Cheat codes and a secret fighter, River

- **Status:** Accepted (River's moveset and knockback superseded by ADR-0078, 2026-11-17)
- **Date:** 2026-11-17

## Context
Holden asked for cheat codes with special codes, and for one of them to be the name RIVER, for a friend: a secret fighter made only for him, "really really bad but with very low knockback", and "pretty fat". He asked for the code box to pop up after three quick taps of Space, and then for the other suggested codes too (BIGHEAD, MOONJUMP, TURBO, ONEHIT, PURPLE, MIRROR).

## Decision
- **Code box:** three taps of Space within 450 ms of each other on any menu screen (title, main, select, lobby, pause, results) open a "Cheat codes" box. Type a code (letters, any case), Enter. Typing a code again turns it off. Active cheats are saved in the browser (`localStorage`) and listed in the box. Codes live in one table in `client/src/cheats.ts`, so adding one is a new row plus wherever it takes effect.
- **RIVER:** unlocks River, an 11th fighter, on the roster grid of this browser. River is a joke character: big and round (a round belly and a propeller beanie, the widest hurtbox after the Titan), the slowest walk and lowest jumps in the cast, slow tiny slaps, the weakest smashes, a pocket-lint "projectile", a Trip side special, a Little Hop recovery and a Nap down special that does nothing. His one strength: he takes **0.4× knockback** (`kbTaken` on the fighter), so a big smash only KOs him around 350%. River never comes up from Random or for CPUs. Online, River is a valid pick for anyone who has unlocked him; everyone else in the room sees him.
- **Fight rules** (in the deterministic sim, `MatchRules` on the world): **MOONJUMP** (gravity ×0.4, fall speeds ×0.55) and **ONEHIT** (every damaging hit launches with at least 340 knockback). Offline they apply to your fights. Online, the **host's** rule cheats become the room's rules (sent in the room settings and the match start) and the lobby shows them to everyone.
- **Looks and feel on your own screen only:** **BIGHEAD** (heads ×1.9), **PURPLE** (the ADR-0069 purple sky all day), **MIRROR** (the picture flips left to right and A/D and ←/→ swap so controls follow the screen; name tags stay readable), **TURBO** (offline fights run at 1.5× speed; online fights keep the server's clock).
- Room protocol bumped to 102.

## Alternatives considered
- **Type the code anywhere on the menus without a box:** Holden asked for the triple-Space box instead; it also keeps WASD menu keys from clashing with letters in codes.
- **River as a normal roster fighter:** he's a secret for a friend, so he stays hidden until the code is typed.
- **TURBO online:** would need the server to tick faster for one room; left out.

## Consequences
- The cast is ten fighters plus one secret (`SECRET_FIGHTER_IDS`); `FIGHTER_IDS` stays the public ten that Random and CPUs draw from, `ALL_FIGHTER_IDS` is what online picks may be.
- `createWorld` takes optional rules; snapshots carry them. Every client and the server must agree on them, which the match start guarantees.
- Rule cheats are a host choice in a room, like stage and stocks; guests can't turn them on for everyone.
