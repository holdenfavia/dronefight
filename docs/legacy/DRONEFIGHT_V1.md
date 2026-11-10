# Dronefight v1 (archived)

Dronefight v1 was a browser **FPV drone dogfighting** game: friends opened a link, shared a two-digit room code and fought in first-person acro flight with their real radios. It was archived on 2026-11-10 when the project restarted as a side-view platform fighter (ADR-0070). This page says what it was, what made it good, and how to get it back, so it can be remade or reinterpreted later.

## Get it back

Everything is kept in this repo:

| What | Where |
|---|---|
| The whole game, code and docs, exactly as it was | branch **`archive/dronefight-v1`** (commit `099c963`) |
| Its spec, roadmap and runbook | `docs/SPEC.md`, `docs/ROADMAP.md`, `docs/RUNBOOK.md` on that branch |
| Every design decision, with the reasoning | `docs/decisions/0001`–`0069` (still in `main` too) |

To play it locally: `git fetch origin && git checkout archive/dronefight-v1 && npm install && npm run dev` (and `npm run server` in a second terminal for online). To put it back on Fly.io instead of the new game: deploy from that branch (`npm run deploy`). To work on both, keep using the branch, or ask Claude to restore v1 under a path (e.g. `/v1`) next to the new game.

To remake or reinterpret it, point Claude at this file and the archive branch.

## What it was

- **Flight that felt like real acro.** Rate mode by default, Betaflight-style rates (RC rate, super rate, expo) per axis, adjustable camera uptilt and FOV (105°). The final flight model was a port of Flight Division's physics (with permission, ADR-0062/0063/0064): blade-element props, electrical motors with battery sag, a Betaflight-style PID at 960 Hz, real inertia. Rapier applied the forces with real gravity and handled collisions (ADR-0008). Physics at real size (a 5" is ~0.3 m) so tight gaps were flyable; only hit spheres were big (ADR-0041, ADR-0043). Optional Horizon/Angle assist (ADR-0045).
- **Real radios.** Gamepad API behind a mapping and calibration wizard (ADR-0006); DJI FPV Remote Controller 2 as the main test device; gamepads, iPad/iPhone touch that flew like a radio (ADR-0044, ADR-0050), keyboard for testing.
- **Drones and loadouts (ADR-0033).** Body + a weapon per hardpoint + special + propulsion, all with real weight, so overloading was physical.
  - Bodies: Freestyle 5" (100 HP, 2 hardpoints), 3D quad (reversible thrust), FPV wing (fixed-wing model, maneuver mode), 3" racer (tiny, twitchy), X8 heavy lifter (4 hardpoints, always Horizon).
  - Weapons: gun (3-hit kill), choked shotgun, rotary cannon, rail gun, burst rifle, missile pod (you fly the missile from its own camera, one-shot within 5 m), grenade launcher (bouncing, Fire again detonates).
  - Specials: maneuver mode, smoke trail (stealth), afterburner, shield. Propellers (tri, bi, quad, heavy-lift, ducted) and wing jets (micro turbine, pulse jet, ramjet), each with its own synthesized sound.
- **Combat (ADR-0009 as amended).** Server-decided hits with ≤250 ms lag compensation, converging guns from screen corners, lead indicator, War Thunder-style name tags, glow and trails for readability, crash = death, kill credit for 5 s, respawn after 3 s away from others. Free-for-all or Teams (Orange vs Lime), first to 10, pre-match lobby with ready-up, host-controlled room settings (ADR-0046/0047). Training map with practice bots (ADR-0017).
- **Netcode (ADR-0004).** Latest state wins: ~100 ms interpolation buffer, stale snapshots dropped and never replayed. Hard rule: remote players never shown more than 250 ms behind.
- **Maps (ADR-0012, 0049, 0053–0059).** Downtown (1,120 m city on rolling Rio/SF hills: river, bridges, stadium, airport with a touch-and-go airliner, Central Park, the Circuit of the Americas, a megaproject pit, suburb, favela hill), Yard (harbor, container ship, cooling towers, wind farm), Playground (giant solid-color park with a fairground), Cavern (huge cave, underground lake, old mine), Training. Moving props from a shared clock, destructible props that chain and respawn.
- **Look and sound.** Bright sunny skies, orange/black/white, stylized-realistic (ADR-0007); dark translucent menu panels with orange accents and bold condensed type (ADR-0039); honest materials (ADR-0060); a purple sky every day 2:02–2:22 pm Central (ADR-0069). All audio synthesized in the browser (ADR-0010).
- **Hosting.** One Fly.io machine in Dallas serves page and rooms on one URL and sleeps when empty (ADR-0021). Optional Google sign-in through Supabase saved name, paint and (once switched on) server-awarded XP (ADR-0030–0032).

## Why it was fun (keep these if it's remade)

1. It flew like the real thing, so real pilots' skills transferred.
2. Room codes and a link: no install, no account, friends in within seconds.
3. Big hit spheres, lead circles and name tags made fights readable even though drones were drawn at real size.
4. Loadouts with honest weight: every choice changed how the drone flew.
5. The missile you fly yourself, and maps full of one-of-a-kind landmarks to chase through.

## Where the important code was (on the archive branch)

- Flight model: `client/src/sim/` (physical model, PID, rates), tuning in `client/src/config.ts`
- Calibration and input: `client/src/input/`
- Netcode and rooms: `client/src/net/`, `server/src/rooms.ts`, `server/src/match.ts`, `shared/protocol.ts`
- Loadouts, weapons, bodies: `shared/drones.ts`, `shared/weapons.ts`, `shared/loadout.ts`, `shared/propellers.ts`
- Maps: `shared/maps/`, rendering in `client/src/world/`
- Drone models: `client/src/render/droneModel.ts`
