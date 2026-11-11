# Roadmap

**Current focus:** Phase 1 — tune the feel of the new cast (ADR-0071, ADR-0072), then online play so friends can fight each other. The v1 roadmap is on the `archive/dronefight-v1` branch.

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

- [ ] Play against CPUs; note what feels off
- [ ] Tune knockback, hitstun and movement per fighter (`shared/fighter/`)
- [ ] Ledge hang (instead of the automatic pull-up) if recovery feels too easy
- [x] Charged smash attacks, own moveset per drone, grabs and throws, teching, parry, armor, counters, stale moves (ADR-0071)
- [x] One player per keyboard: WASD move, arrows attack, Q specials, E shield, ? grab (ADR-0071)
- [x] Attack looks: poses, trails, colors and hit effects per kind of attack
- [x] Original cast instead of drones: Brawler, Blade, Spark, Titan, each with its own gimmick (ADR-0072)
- [x] Six more fighters: Ninja, Gunslinger, Chef, Ghost, Yo-yo Kid, Bard (ADR-0073)
- [ ] Real character art to replace the stick figures
- [x] Specials on Space instead of Q (ADR-0074)
- [ ] Rebindable keys, in case two players' keys clash on some keyboards

## Phase 2 — Online with friends

- [ ] Decide netcode (rollback vs delay-based lockstep; inputs only) via `/decide`
- [ ] Create/join room by two-digit code in the menu, invite link
- [ ] Each player on their own computer; mix of local and online players
- [ ] Deploy and play over the internet

## Later

- [ ] More fighters, more stages, items
- [ ] Gamepad support
- [ ] Team battles
