# ADR-0083: Personal settings: your own tag and color

- **Status:** Accepted
- **Date:** 2026-11-18
- **Amends:** ADR-0026 (colors: one per slot), ADR-0075 (main menu items; the "P1" tag), ADR-0076 (lobby and match start carry each member's tag and color)

## Context

Holden asked (2026-11-18) for "a personal settings menu where you can configure your initial tag and color". Until now every player was tagged "P1" (or "P2"… online) and wore their slot's color, so friends online couldn't tell who was who at a glance.

## Decision

- The main menu gets a **Settings** item: Fight, Online, Controls, Settings.
- **Your tag:** up to 4 capital letters or digits (`shared/profile.ts` `cleanTag`), shown over your fighter, on your HUD card, on your roster token, in the results and the lobby. Empty = the old default ("P1" offline, your slot online). A tag can't start with "CPU", so nobody looks like a CPU (ADR-0075).
- **Your color:** one of ten (`PROFILE_COLORS`: the four slot colors, then purple, gold, teal, red, blue, silver), or **Auto** = your slot's color as before.
- Saved in this browser (`localStorage`, key `dronefight.profile.v1`); no account (Hard rule 4).
- **Online:** `create` and `join` carry your profile; the server keeps it per member and puts it in `RoomMember` and each member's `MatchFighter`, so everyone in the room, late joiners too, sees the same tags and colors.
- **Clashes** (`resolveColors`, the same on every client): a player's pick wins unless an earlier slot already has that color; everyone else (CPUs, no pick, a clash) wears their slot's color, or the first color nobody wears.
- **Team battles:** the team color still wins (ADR-0081).
- Presentation only: the fight sim never sees tags or colors (Hard rule 2).

## Alternatives considered

- **Longer names:** a name over each fighter crowds the screen; arcade-style initials fit the HUD and the tag over the head.
- **Any color (free color picker):** some colors vanish on the sky or the rooftop; a fixed set stays readable.
- **Refuse a taken color in the lobby:** more UI; an automatic fallback keeps everyone distinct with no clicks.

## Consequences

- Protocol version 108. `client/src/config.ts` `fighterColor` reads the fight's colors set by `setFightColors` at the start of each fight (reset for the attract fight behind the menus).
- Changing the tag or color happens from the main menu, so it applies to the next room you make or join.
