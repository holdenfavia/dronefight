# ADR-0085: Stage select screen with picks and bans

- **Status:** Accepted
- **Date:** 2026-11-19
- **Amends:** ADR-0076 (the host still sets the stage, but everyone's bans apply)

## Context
Holden asked for "a map selection screen where you can pick what maps you want to play and ban", then: "off by default and
when you start a lobby a screen comes up where you select settings for the match". Until now the
stage was one "Stage: Rooftop" button on the character select and in the online lobby, cycled by click, and only
the host's choice counted online. With four stages (one seasonal) and more coming, players want to see the stages,
pick one, and keep the ones they dislike out of the rotation.

## Decision
- **Stage pick and ban is a match setting, off by default** (Holden: "off by default"). Off, the stage is chosen as
  before (a Stage option, now with Random), and nobody's bans count.
- **On**, a **stage screen** comes after character select: Fight! (or Enter) opens it, a card per stage on offer (a
  rendered thumbnail, name, blurb, Seasonal tag) plus a **Random** card. Picking a card starts the fight. Rematch
  keeps the stage; with Random it draws again.
- **Bans:** each card has a Ban button (B on the keyboard). A banned stage is greyed out and stamped BANNED: it
  can't be picked and Random never draws it. At least one stage on offer always stays open. Bans are saved in the
  browser (`dronefight.stageBans.v1`).
- **Online:** making a room opens a **Match settings** screen for the host first (stage, stocks, mode, friendly fire,
  stage pick and ban), then the lobby; the host can reopen it from the lobby. With pick and ban on, the lobby's
  Stages button opens the stage screen for everyone: every member bans, the room shows who banned what, the host
  picks a stage or Random. When the fight starts the server plays the host's stage unless someone banned it; if
  it's banned, or Random, the server draws from the stages on offer today that nobody banned (all of them if the
  bans together leave none).
- The draw happens on the client (offline) or the server (online), never in the sim (Hard rule 2).

## Alternatives considered
- **Every player votes, the stage is drawn from the votes:** fairer to non-hosts, but takes the stage away from the
  host, which ADR-0076 gives them; can be added later as a host option.
- **Competitive striking (take turns striking stages until one is left):** too slow and fussy with three or four
  stages and a casual group.
- **Bans per room only (not saved):** players would redo them every session.

## Consequences
- `RoomSettings.stage` may be `'random'`, `RoomSettings.stagePick` turns bans on; `MatchStart.stage` is always a real stage. `pick` messages and
  `RoomMember` carry `bans`. Protocol version bumps.
- New stages show up on the screen automatically (stage ids from `availableStages`).
