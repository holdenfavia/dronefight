# ADR-0032: XP and levels, awarded by the room server

- **Status:** Accepted
- **Date:** 2026-10-03
- **Implements:** ADR-0030 step 3

## Context

Progression must not be fakeable (ADR-0030): XP has to come from what the server referees, and be stored where only the server can write it.

## Decision

- **Who earns XP:** signed-in pilots in an online room while a match is running (2+ pilots). Guests, solo and training earn nothing (nothing there is refereed).
- **Awards** (`XP` in `shared/progression.ts`):

  | Event | XP |
  |---|---|
  | Kill (shot down, crash with credit, or prop blast) | 100 |
  | Assist (damaged the victim in the last 5 s, not the killer) | 40 |
  | Blow up a prop | 10 |
  | Be in the match when it ends | 100 |
  | Win the match | 300 |

- **Levels:** reaching level *n* takes `250 × n × (n − 1)` total XP (level 2 at 500, 3 at 1,500, 5 at 5,000, 10 at 22,500). No cap.
- **Identity:** when a client joins a room it sends its Supabase access token (`auth` message); the server asks Supabase who it belongs to (`/auth/v1/user`) and remembers the user id for that connection. A pilot whose token fails is simply a guest.
- **Storage:** table `progress` (xp, kills, deaths, wins, matches). Pilots can **read** their own row; there are **no write policies**, so only the server, using the project's secret key (`SUPABASE_SECRET_KEY`, a Fly secret), can change it, through the `award_progress` function. Awards are batched per pilot and written every few seconds, on leaving, and at match end.
- **Feedback:** the server tells a pilot what they earned (`xp` message): a `+100 XP` toast, a level-up banner, and level and progress shown on the Account screen and start menu. Other pilots' levels appear in the match state.
- If the secret key isn't set, the server runs exactly as before with progression off.

## Alternatives considered

- **Client reports its own XP:** trivially faked.
- **Verify JWTs locally (JWKS):** fewer requests, but more moving parts; one request per join is cheap at this scale.

## Consequences

- Migration `supabase/migrations/0002_progress.sql`. Protocol version 11 (`auth`, `xp`, `MatchPlayer.level`).
- Unlocks (step 1 content) will key off level; until then levels are bragging rights.
