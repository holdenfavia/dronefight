# Roadmap

**Current focus:** Phase 2 — online fights are built (ADR-0076); deploy and play them with friends, then keep tuning the feel of the cast (Phase 1). The v1 roadmap is on the `archive/dronefight-v1` branch.

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

- [x] Decide netcode: the server runs the fight and sends every frame's inputs; snapshots heal drift (ADR-0076)
- [x] Title screen, main menu, roster-grid character select, CPU tags (ADR-0075)
- [x] Create/join room by two-digit code in the menu, invite link, lobby with picks and ready (ADR-0075)
- [x] Start online fights from the lobby; host's stage, stocks and CPUs; leavers replaced by CPUs; late joiners watch (ADR-0076)
- [x] Each player on their own computer
- [ ] Play a real match over the internet and check the input delay; add prediction or rollback if it feels laggy
- [ ] Deploy and play over the internet

## Later

- [ ] More fighters, more stages, items
- [ ] Gamepad support
- [ ] Team battles
