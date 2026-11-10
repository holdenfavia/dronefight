# Roadmap

**Current focus:** Phase 1 — play it with friends on one keyboard and tune the feel. The v1 roadmap is on the `archive/dronefight-v1` branch.

Check items off as they land. Add items as they're discovered. Moving to a new phase updates **Current focus**.

## Phase 0 — Restart (ADR-0070)

- [x] Archive v1 on `archive/dronefight-v1`, write `docs/legacy/DRONEFIGHT_V1.md`
- [x] Deterministic 60 Hz fighter sim: percent, knockback, hitlag, stocks, blast zones, shields, dodges, projectiles, bombs
- [x] Four drones (Freestyle, Racer, Heavy, Flipper), three stages
- [x] CPU opponents (Easy, Normal, Hard) that recover and edge-guard
- [x] Two players on one keyboard, character select, results, pause
- [x] Canvas renderer: parallax city, framing camera, sparks, smoke, KO bursts, screen shake
- [x] Synthesized sound effects
- [x] Server trimmed to static hosting + room-code relay

## Phase 1 — Feel (now)

- [ ] Play 2-player matches with friends; note what feels off
- [ ] Tune knockback, hitstun and movement per drone (`shared/fighter/`)
- [ ] Ledge hang (instead of the automatic pull-up) if recovery feels too easy
- [ ] Smash-style charged attacks (hold attack) if tilts feel too weak to KO
- [ ] Rebindable keys, in case two players' keys clash on some keyboards

## Phase 2 — Online with friends

- [ ] Decide netcode (rollback vs delay-based lockstep; inputs only) via `/decide`
- [ ] Create/join room by two-digit code in the menu, invite link
- [ ] Each player on their own computer; mix of local and online players
- [ ] Deploy and play over the internet

## Later

- [ ] More drones (FPV wing?), more stages, items
- [ ] Gamepad support
- [ ] Team battles
