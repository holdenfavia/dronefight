# ADR-0030: Optional sign-in; progression unlocks bodies and modules

- **Status:** Accepted
- **Date:** 2026-10-03
- **Changes:** SPEC Hard rule 5 and "Out of scope: accounts/login, rankings"

## Context

The pilots want progression that adds depth and replayability, with loadouts that stay with them across sessions and devices. That needs some kind of identity, but anyone should still be able to open the link and fly immediately.

## Decision

- **No account is ever needed to play.** Everyone starts as a guest. Hard rule 5 becomes: *no install; no account needed to play (sign-in is optional and only saves progress)*.
- **Optional sign-in with Google** (OAuth; we never store passwords). Discord was planned and dropped for now (ADR-0031).
- **Loadouts and unlocks**: the current three drones (Freestyle, 3D quad, wing with their weapons and specials) are the **base set** everyone has. Progression unlocks **new drone bodies**, **weapon modules** and **special modules**, plus cosmetics (paint, patterns, pilot name, later trails and badges).
- **Unlocks are sidegrades, not upgrades**: each new body or module trades something away (damage vs fire rate, armor vs agility, range vs spread), so a new pilot on a base drone can still win a fight.
- **The server decides progression**: XP comes from match results the room server already referees, never from what a client reports.
- **Pilot identity in a match stays readable**: the per-match pilot color (glow, trail, props, arrows; ADR-0026) is never overridden by cosmetics.
- Built in steps: (1) loadout system (body + weapon module + special module + paint) with everything unlocked, saved in the browser and shown to other pilots, so modules can be balanced first; (2) database + sign-in, guest profile moves into the account on first sign-in; (3) server-recorded XP, levels and the unlock track; (4) badges, challenges and more.
- Storage/auth provider is chosen in step 2 (recorded then).

## Alternatives considered

- **No accounts, browser storage plus a sync code:** simplest and private, but easy to lose and no cross-device identity.
- **Mandatory accounts:** breaks "open the link and fly".
- **Cosmetic-only progression:** fair, but little depth or replayability.
- **Straight upgrades (more damage or HP with level):** unfair in a fast-TTK gunfight game (ADR-0028).

## Consequences

- Weapons and specials are decoupled from drone classes into modules; the server validates every loadout against the shared catalog and uses its stats.
- Step 1 adds `shared/cosmetics.ts`, a loadout catalog, a client profile, and a Loadout screen with a live preview.
