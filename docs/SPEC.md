# dronefight — Spec

_Working title. Source of truth for what the game is. Change only via `/decide`._

## Vision

A browser FPV dogfighting game that **feels like real acro flying**. Two pilots open a link, share a room code, and fight in a bright industrial arena using their real radios. No install, no account.

## Players and platform

- Built for two friends first (1v1). Room codes, no public matchmaking (ADR-0005).
- Desktop browsers. Chrome/Edge are the primary targets (best Gamepad API support). Safari/Firefox are best-effort.
- Mobile/touch is out of scope.

## Flight

- Acro (rate) mode only: sticks command rotation rates, no self-levelling.
- Betaflight-style rates (RC rate, super rate, expo) per axis, user-adjustable.
- Custom flight model computes thrust, drag, prop wash and rate commands. Rapier applies all forces, with real gravity (9.81 m/s²), and handles motion and collisions. Tuned by feel (ADR-0008).
- Adjustable FPV camera tilt (uptilt) and FOV.

## Controls

- Real radios via the browser Gamepad API. Primary test device: **DJI FPV Remote Controller 2** over USB-C.
- A stick mapping and calibration screen assigns axes, inverts, endpoints and deadband (ADR-0006).
- Fallbacks: Xbox/PlayStation gamepad, keyboard (for testing only).
- Settings persist per browser.

## Multiplayer

- Node.js WebSocket server; clients join by short room code (ADR-0005).
- Netcode: **latest state wins**. Remote drones render from a small fixed interpolation buffer (~100 ms). Stale snapshots are dropped, never replayed (ADR-0004).
- Server decides hits.
- On-screen network readout: ping and remote-player delay.

## Combat (Phase 3, details TBD via `/decide`)

- Forward-firing weapon with visible tracers, health, respawn, score to win.

## Art direction (ADR-0007)

Inspired by the *feel* of Flight Division, never its assets:
- Bright sunny blue skies, soft clean lighting.
- Orange / black / white palette. Orange steel scaffolding, concrete, platforms, ramps, gaps to thread.
- Stylized-realistic and clean, not gritty.
- UI: bold condensed all-caps type, with occasional hand-written accent notes.
- Performance beats fidelity: baked lighting, instancing, compressed textures.

## Hard rules

These must never be broken without a superseding decision:

1. **No growing delay.** Remote players are never shown more than **250 ms** behind real time (at normal ping). No code path may queue and replay a backlog of snapshots.
2. **Frame rate first.** Target a steady 60+ FPS on a mid-range laptop. Visual features that break this are off by default.
3. **Input goes through calibration.** Game code never reads raw gamepad axes directly.
4. **No copied assets or branding.** Nothing from Flight Division or any other game (logos, mascot, models, textures, name).
5. **No install, no account** needed to play.

## Out of scope (for now)

Public matchmaking, accounts/login, rankings, mobile, VR, more than 2 players per room, angle/horizon mode.
