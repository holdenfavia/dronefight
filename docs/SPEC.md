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

## Drone classes (ADR-0013)

- **Freestyle 5"** (default), **3D quad** (reversible thrust; throttle center = zero), **FPV wing** (fixed-wing; can't hover; spawns airborne).
- Full classes: health, damage, fire rate, round speed and size differ per class. Picked in the menu; in a match it applies at your next respawn.
- Weapons (ADR-0014): Freestyle standard gun; wing rotary cannon (50/s, BRRRT) plus a physics-based **Cobra** while holding Special (E or a mapped radio button, ADR-0015); 3D quad choked double-barrel shotgun (2/s, 8 pellets).
- Specials (ADR-0015/0016): wing **Cobra** (hold), 3D quad **smoke screen** (tap: hides you and blocks the enemy's lead indicator), Freestyle **guided missile** (tap to switch guns/missile; steer it with your crosshair; 5 s max flight; **one-shot kill** within 3 m, ADR-0018).

## Controls

- Real radios via the browser Gamepad API. Primary test device: **DJI FPV Remote Controller 2** over USB-C.
- A stick mapping and calibration screen assigns axes, inverts, endpoints and deadband (ADR-0006).
- Fallbacks: Xbox/PlayStation gamepad, keyboard (for testing only).
- Settings persist per browser. F toggles fullscreen.
- Near the map edge, an orange grid fades in on the invisible boundary wall so you see it before hitting it.

## Multiplayer

- Node.js WebSocket server; clients join by short room code (ADR-0005).
- Netcode: **latest state wins**. Remote drones render from a small fixed interpolation buffer (~100 ms). Stale snapshots are dropped, never replayed (ADR-0004).
- Server decides hits.
- On-screen network readout: ping and remote-player delay.

## Combat (ADR-0009)

- Tracer rounds from twin guns beside the camera, converging along the camera view. Rounds stop at walls.
- 100 HP, 20 per hit. Server decides hits (0.75 m hit radius, matching the drawn drone), with limited lag compensation (≤ 250 ms rewind).
- Other pilots are drawn ~1.5 m across with a glow and a fading trail; a lead indicator shows where to aim (ADR-0011). Physics stay real 5".
- Crash = death. The kill goes to the other pilot if they damaged you in the last 5 s.
- Respawn after 3 s at a random spawn away from your opponent (8 per map, ADR-0012). First to 5 kills wins, then a new match starts.
- Solo mode has no combat.

## Maps (ADR-0012)

- **Downtown** (default): city blocks, towers, streets, parking garage, skybridge, construction crane.
- **Yard**: the original industrial arena.
- **Playground** (ADR-0019): a giant playground park in solid colors with grid lines, plus a roller coaster.
- Moving props (ADR-0020): Downtown traffic you can chase, the Playground coaster, a Yard tractor. Solid to fly into; rounds pass through. Settings can switch every map to grid textures.
- **Training** (ADR-0017): solo practice with bots (white stationary, blue fixed paths, yellow random, red evasive), hits/kills/accuracy.
- The room creator picks the map. Distant mountains, clouds and sun glow on every map.

## Art direction (ADR-0007)

Inspired by the *feel* of Flight Division, never its assets:
- Bright sunny blue skies, soft clean lighting.
- Orange / black / white palette. Orange steel scaffolding, concrete, platforms, ramps, gaps to thread.
- Pilot colors: orange and lime `#b6f000` (ADR-0009).
- Stylized-realistic and clean, not gritty.
- UI: bold condensed all-caps type, with occasional hand-written accent notes.
- Performance beats fidelity: baked lighting, instancing, compressed textures.

## Audio (ADR-0010)

- All sound synthesized in the browser (no audio files). Motor whine follows throttle; the other pilot's motors and shots are positional.
- Master volume plus separate **My drone** and **Other pilots** volumes in Settings (other pilots' motors and gunfire are positional); M mutes.

## Hard rules

These must never be broken without a superseding decision:

1. **No growing delay.** Remote players are never shown more than **250 ms** behind real time (at normal ping). No code path may queue and replay a backlog of snapshots.
2. **Frame rate first.** Target a steady 60+ FPS on a mid-range laptop. Visual features that break this are off by default.
3. **Input goes through calibration.** Game code never reads raw gamepad axes directly.
4. **No copied assets or branding.** Nothing from Flight Division or any other game (logos, mascot, models, textures, name).
5. **No install, no account** needed to play.

## Out of scope (for now)

Public matchmaking, accounts/login, rankings, mobile, VR, more than 2 players per room, angle/horizon mode.
