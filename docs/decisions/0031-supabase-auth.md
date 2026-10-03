# ADR-0031: Supabase for sign-in and profiles

- **Status:** Accepted
- **Date:** 2026-10-03
- **Implements:** ADR-0030 step 2
- **Amended:** 2026-10-03: **Google only** for now; Discord isn't set up (the client shows only providers enabled in the project, so it can be added later with no code change)

## Context

ADR-0030 makes sign-in optional (Discord or Google) and needs somewhere to keep profiles. The pilots want login working before new content. We want no passwords of our own, little to run, and a free tier.

## Decision

- **Supabase** (hosted Postgres + Auth) for OAuth sign-in with **Discord** and **Google**, and for the `profiles` table.
- The browser talks to Supabase directly with the public anon key; **row-level security** lets a signed-in pilot read and write only their own profile row. The schema lives in `supabase/migrations/`.
- What a profile holds now: pilot name and drone looks (ADR-0030). Progression (XP, levels, unlocks) goes in a separate table that **only the room server** writes (service-role key as a Fly secret), added in step 3.
- **Guests stay guests**: their profile lives in the browser. On first sign-in, a guest profile moves into the new account; after that the account wins on every device.
- The Supabase client loads lazily, and only when configured (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, build-time, public). Without them the game runs as before with sign-in hidden.

## Alternatives considered

- **Fly Postgres + our own OAuth (Auth.js/Lucia):** more code and secrets to run on the room server.
- **Firebase:** fine auth, but a document store; Postgres suits stats and leaderboards later.
- **Clerk + a database:** two vendors for one job.

## Consequences

- New dependency `@supabase/supabase-js` (client only, loaded on demand).
- Setup steps (Supabase project, Google and Discord OAuth apps, redirect URLs) are in RUNBOOK.
