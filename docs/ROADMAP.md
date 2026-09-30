# Roadmap

**Current focus:** Phase 1 — Flight sim

Check items off as they land. Add items as they're discovered. Moving to a new phase updates **Current focus**.

## Phase 0 — Project setup

- [x] Spec, decisions, roadmap, runbook, CLAUDE.md
- [x] git repository initialized, first commit
- [ ] Node.js installed (see RUNBOOK)
- [ ] Vite + TypeScript project scaffold (client), strict mode
- [ ] Server package scaffold (Node + `ws`)

## Phase 1 — Flight sim (solo)

- [ ] Three.js scene: sky, ground, lighting, one test arena
- [ ] Gamepad input layer + mapping/calibration screen (ADR-0006)
- [ ] Verify DJI FPV Remote Controller 2 works end to end
- [ ] Keyboard fallback for testing
- [ ] Acro flight model with Betaflight-style rates (ADR-0003)
- [ ] FPV camera with adjustable uptilt and FOV
- [ ] Collisions against arena geometry (Rapier)
- [ ] Crash + reset
- [ ] Settings panel (rates, camera) persisted per browser
- [ ] FPS counter in debug HUD
- [ ] Both pilots agree it "feels right"

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
