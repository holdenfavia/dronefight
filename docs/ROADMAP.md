# Roadmap

**Current focus:** Phase 3 — Combat (deploy moved after combat by choice; Phase 1 open items: real-controller check and feel sign-off)

Check items off as they land. Add items as they're discovered. Moving to a new phase updates **Current focus**.

## Phase 0 — Project setup

- [x] Spec, decisions, roadmap, runbook, CLAUDE.md
- [x] git repository initialized, first commit
- [x] Node.js installed (see RUNBOOK)
- [x] Vite + TypeScript project scaffold (client), strict mode
- [x] Server package scaffold (Node + `ws`)

## Phase 1 — Flight sim (solo)

- [x] Three.js scene: sky, ground, lighting, one test arena
- [x] Gamepad input layer + mapping/calibration screen (ADR-0006)
- [ ] Verify DJI FPV Remote Controller 2 works end to end (wizard tested with a simulated radio; needs the real one)
- [x] Keyboard fallback for testing
- [x] Acro flight model with Betaflight-style rates (ADR-0008)
- [x] FPV camera with adjustable uptilt and FOV
- [x] Collisions against arena geometry (Rapier)
- [x] Crash + reset
- [x] Settings panel (rates, camera) persisted per browser
- [x] FPS counter in debug HUD
- [ ] Both pilots agree it "feels right" (tune in `client/src/config.ts`)

## Phase 2 — Online (2 players)

- [x] WebSocket server with create/join room by code (ADR-0005)
- [x] Send local drone state at fixed rate; broadcast to peer
- [x] Snapshot interpolation, latest-state-wins (ADR-0004)
- [x] Network HUD: ping + remote delay
- [x] Background-tab / reconnect handling (no backlog replay)
- [x] Invite links (`?room=CODE`) and on-screen marker pointing to the other pilot
- [x] Same-Wi-Fi play verified by both pilots
- [ ] Deploy and phone-call test: moved to Phase 3.5 (after combat)

## Phase 3 — Combat

- [x] Decide weapon/health/scoring rules (ADR-0009)
- [x] Arena layout shared with server
- [x] Fire control in input layer + Controller setup
- [x] Firing + tracers (local, instant; remote tracers from server)
- [x] Server-side hit detection with limited lag compensation
- [x] Health, crash = death, kill credit, respawn at team pads
- [x] Match flow: first to 5, results, auto rematch
- [x] Combat HUD: health, score, hit markers, damage flash
- [x] Team colors (orange / lime)
- [x] Both pilots play a real match: too hard to hit (→ ADR-0011)
- [x] Readability pass (ADR-0011): 1.5 m visuals + hit radius, damage 20, twin guns, trails, glow, lead indicator
- [x] Replay matches with ADR-0011: much better; hitbox should match drawn size (→ ADR-0012)
- [x] Maps & polish (ADR-0012): Downtown map, map picker, 8 random anti-camp spawns, 0.75 m hitbox, mountains/clouds/skyline
- [ ] Play Downtown together and tune (building density, spawn spots, hitbox)

## Phase 3.6: Drone classes (ADR-0013)

- [x] Per-class stats shared by client and server; loadout message; server uses shooter/target class
- [x] 3D quad: reversible thrust, center deadband, arm at center
- [x] FPV wing: flight model (lift, stall, drag, weathervane), airborne launch, model, audio
- [x] Drone picker in menu; class models for other pilots
- [x] Separate volume for your drone vs other pilots; F toggles fullscreen; boundary grid fades in near the map edge
- [x] Class weapons (ADR-0014): wing rotary cannon + Cobra, 3D shotgun, Special input, token-bucket rate checks
- [x] Cobra reworked to physics (ADR-0015); Map buttons quick remap
- [x] Specials (ADR-0016): 3D smoke screen with concealment; Freestyle TOW-style guided missile; particles; sounds
- [x] Training ground (ADR-0017): map, stationary/path/random/evasive bots, local practice hits, stats HUD
- [x] Pressure test: fixed missile exploding on launch (client impact check), silent server rejections, ghost launches, departed pilots' missiles; fuzz + real-socket missile test
- [x] Guided missile is a one-shot kill (ADR-0018)
- [ ] Play-test with real hands on the sticks
- [ ] Play all three against each other and tune

## Phase 3.5 — Go online

- [ ] Choose hosting and record it (`/decide`)
- [ ] Deploy server + client; play from two houses
- [ ] Phone-call test: callouts match what you see

## Phase 4 — Polish

- [x] Structure polish: flush joints (cube frames, tower tops, decks, crane), exact Yard ramp, flush overpass rails, container rows, post footings; guarded by `shared/maps/joints.test.ts`
- [x] Texture pass: painted steel (streaks, chips, scratches), concrete walls (formwork seams, tie holes, rain streaks)
- [ ] Art pass on arena per ADR-0007 (more)
- [x] Playground map: giant park in solid-color grid style (ADR-0019)
- [x] Moving props (ADR-0020): Downtown traffic, Playground roller coaster, Yard tractor; Settings option for grid textures on every map
- [ ] Eyeball the coaster, tractor and grid toggle in play
- [ ] Additional maps
- [x] Sound (motors, hits, UI): procedural, ADR-0010
- [ ] Sound tuning pass after real matches
- [ ] HUD / menus in the target style
- [ ] Damage effects (video static)
