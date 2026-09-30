# Roadmap

**Current focus:** Phase 1 — Flight sim

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

- [ ] WebSocket server with create/join room by code (ADR-0005)
- [ ] Send local drone state at fixed rate; broadcast to peer
- [ ] Snapshot interpolation, latest-state-wins (ADR-0004)
- [ ] Network HUD: ping + remote delay
- [ ] Background-tab / reconnect handling (no backlog replay)
- [ ] Deploy server; play from two houses
- [ ] Phone-call test: callouts match what you see

## Phase 3 — Combat

- [ ] Decide weapon/health/scoring rules (`/decide`)
- [ ] Firing + tracers
- [ ] Server-side hit detection
- [ ] Health, death, respawn
- [ ] Match flow: score to win, rematch

## Phase 4 — Polish

- [ ] Art pass on arena per ADR-0007
- [ ] Additional maps
- [ ] Sound (motors, hits, UI)
- [ ] HUD / menus in the target style
- [ ] Damage effects (video static)
