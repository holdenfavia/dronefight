# dronefight — Spec

_Working title. Source of truth for what the game is **now**. Change only via `/decide`; details live in the ADRs._

## Vision

A browser FPV dogfighting game that **feels like real acro flying**. Friends open a link, share a room code, and fight using their real radios. No install, no account needed; signing in only keeps your profile and progress (ADR-0030).

## Players and platform

- A group of friends: free-for-all rooms of up to 10 pilots, two-digit room codes, no public matchmaking (ADR-0005, ADR-0026).
- Desktop browsers. Chrome/Edge are the primary targets (best Gamepad API support); Safari/Firefox best-effort. Mobile/touch is out of scope.

## Flight

- Acro (rate) mode: sticks command rotation rates, no self-levelling. **Exception:** the X8 always flies in horizon mode (ADR-0037).
- Betaflight-style rates (RC rate, super rate, expo) per axis, user-adjustable. Adjustable FPV uptilt and FOV (default 105°, ADR-0040).
- A custom flight model computes thrust (fading toward the props' pitch speed), drag, prop wash and rate commands; Rapier applies the forces with real gravity and handles motion and collisions (ADR-0008).
- **One set of numbers (ADR-0040):** the physics uses exactly the weight and thrust the Loadout screen lists, and drones collide at the size they're drawn. These are game-size drones (a 4.5 m drone weighing ~1 kg); names don't imply size. A stock 5" falls flat at ~25 m/s and tops out ~46 m/s.
- Crash = an impact over a speed-change threshold. Ducted props raise it (ADR-0035).

## Drones and loadouts (ADR-0033)

A loadout = **body** + one **weapon per hardpoint** + one **special** + **propulsion**. Everything has weight; total weight against thrust sets how it flies. Overloading is allowed and physical (T/W ≤ 1 can't take off). Each body's default build flies exactly as originally tuned. Everything is unlocked for now.

| Body | HP | Hardpoints | Drawn/collision width (hit radius) | Notes |
|---|---|---|---|---|
| Freestyle 5" (default) | 100 | 2 | 4.5 m (2.25 m) | all-rounder |
| 3D quad | 90 | 2 | 4.5 m (2.25 m) | reversible thrust; throttle center = zero |
| FPV wing | 130 | 2 | 5.5 m span (2.7 m) | fixed-wing, can't hover, launches airborne; weight raises stall speed |
| 3" racer | 70 | 1 | 2 m (1 m) | tiny and twitchy (ADR-0036) |
| X8 heavy lifter | 180 | 4 | 10.7 m (5.4 m) | huge, horizon mode (ADR-0036, ADR-0037) |

- **Weapons** (numbers in `shared/weapons.ts`): gun (34/hit, 3-hit kill on a 5", ADR-0028), choked shotgun (8 pellets), rotary cannon (50/s), rail gun (75, near-instant, very heavy), burst rifle (3-round bursts), missile pod (you fly the missile; one-shot within 5 m, ADR-0025/0027), grenade launcher (bouncing grenades, Fire again detonates, 12 m blast, ADR-0034).
- **Fire groups:** Fire shoots all guns together. Missile pods and grenade launchers are a second group; Switch weapon (Q / mapped button) changes group, and so does Special when the special slot is empty.
- **Specials:** maneuver mode (wing only, ADR-0022), smoke trail (stealth, ADR-0024), afterburner (hold, limited fuel), shield (absorbs 40 for 3 s) (ADR-0033).
- **Propulsion:** propellers for every body (tri stock, bi, quad, heavy-lift, ducted for quads, ADR-0035); jets for the wing only (micro turbine, pulse jet, ramjet, ADR-0038).
- Built on the Loadout screen (Play or pause menu). In a match a new build applies at your next respawn.

## Controls

- Real radios through the browser Gamepad API, always behind mapping and calibration (ADR-0006). Primary test device: **DJI FPV Remote Controller 2** over USB-C. Fallbacks: Xbox/PlayStation/Logitech gamepads (guessed layouts) and keyboard (testing only).
- Inputs: sticks, arm, Fire, Special, Switch weapon. Settings persist per browser. F fullscreen, M mute, Esc pause menu.
- Near the map edge an orange grid fades in on the invisible boundary wall.

## Multiplayer and hosting

- Node WebSocket server with rooms by code; one Fly.io machine (Dallas) serves the page and the rooms from one URL and **sleeps when nobody is connected** (ADR-0021).
- Netcode: **latest state wins**. Remote drones render from a fixed ~100 ms interpolation buffer; stale snapshots are dropped, never replayed (ADR-0004). On-screen ping and remote delay.
- **The server decides** hits, damage, kills, prop destruction, grenades and missile validity, with ≤ 250 ms lag compensation. Clients decide only their own flight.

## Combat (ADR-0009 as amended)

- Each hardpoint fires from its own screen corner (1 upper-left, 2 upper-right, 3 lower-left, 4 lower-right), converging ~40 m ahead along the FPV view. Each weapon has its own projectile look (ADR-0033). Rounds stop at walls.
- Other pilots are drawn at their body's enlarged size with a glow, a fading trail and a lead indicator (ADR-0011, ADR-0036); smoke hides all but the frame (ADR-0024).
- Crash = death; the kill goes to whoever damaged you in the last 5 s. Respawn after 3 s at one of 8 spawns away from other pilots (ADR-0012).
- Free-for-all, first to 10 kills, then a new match (ADR-0026). Solo has no combat except Training bots (ADR-0017).

## Maps (ADR-0012)

- **Downtown** (default), **Yard** (industrial), **Playground** (giant solid-color park, ADR-0019), **Training** (solo, with bots, ADR-0017). The room creator picks.
- Moving props from a shared clock: Downtown traffic, Playground coaster, Yard tractor (ADR-0020). Destructible props explode when shot, chain, hurt pilots in matches, and return after 30 s (ADR-0023).
- Settings can switch every map to grid textures. Distant mountains, clouds and sun glow everywhere.

## Art direction (ADR-0007)

- Inspired by the *feel* of Flight Division, never its assets. Bright sunny skies, soft clean light; orange / black / white; stylized-realistic, clean.
- Pilot colors: one per pilot, orange and lime first (ADR-0026).
- UI: bold condensed all-caps type on dark translucent panels with orange accents, on every menu (ADR-0039).
- Performance beats fidelity: baked lighting, instancing, compressed textures.

## Audio (ADR-0010)

- All sound synthesized in the browser, no audio files. Engines follow throttle (props, and a distinct voice per jet, ADR-0038); other pilots' engines and gunfire are positional.
- Master, **My drone** and **Other pilots** volumes; M mutes.

## Accounts and progression (ADR-0030, ADR-0031, ADR-0032)

- Optional Google sign-in (Supabase). Guests always play; a guest profile moves into the account on first sign-in. The account saves pilot name and paint per body; **builds are saved per browser only** for now.
- XP and levels come only from online matches and only the server awards them. **Built, switched off** until the server's secret key is set.
- Later: levels unlock sidegrade bodies, modules and paints (never straight upgrades); paint and pilot name shown to others.

## Hard rules

These must never be broken without a superseding decision:

1. **No growing delay.** Remote players are never shown more than **250 ms** behind real time (at normal ping). No code path may queue and replay a backlog of snapshots.
2. **Frame rate first.** A steady 60+ FPS on a mid-range laptop. Visual features that break this are off by default.
3. **Input goes through calibration.** Game code never reads raw gamepad axes directly.
4. **No copied assets or branding.** Nothing from Flight Division or any other game.
5. **No install, no account needed to play.** Sign-in is optional and only saves progress.

## Out of scope (for now)

Public matchmaking, mandatory accounts, pay-to-win or straight-upgrade unlocks, mobile, VR, more than 10 pilots per room, teams, angle mode, pilot-selectable flight modes.
