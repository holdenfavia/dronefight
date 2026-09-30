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
- [ ] Both pilots play a real match and tune combat numbers (`shared/combat.ts`)

## Phase 3.5 — Go online

- [ ] Choose hosting and record it (`/decide`)
- [ ] Deploy server + client; play from two houses
- [ ] Phone-call test: callouts match what you see

## Phase 4 — Polish

- [ ] Art pass on arena per ADR-0007
- [ ] Additional maps
- [x] Sound (motors, hits, UI): procedural, ADR-0010
- [ ] Sound tuning pass after real matches
- [ ] HUD / menus in the target style
- [ ] Damage effects (video static)
