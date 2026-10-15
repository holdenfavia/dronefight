# Architecture

How the code fits together. What the game *is* lives in `SPEC.md` and the ADRs; how to run it lives in `RUNBOOK.md`.

## Three folders

| Folder | Runs in | Holds |
|---|---|---|
| `shared/` | browser **and** server | Game rules as data and pure functions: bodies, weapons, specials, propellers, loadouts, maps, terrain, ray casts, missiles, grenades, bots, protocol, progression. No DOM, no Three.js. |
| `server/src/` | Node (Fly.io) **and** the browser | Rooms and the authoritative match. `match.ts` imports only `shared/`, which is why solo can run it in the page. |
| `client/src/` | browser | Everything you see, hear and touch. |

Rule of thumb: if the server must agree on it, it goes in `shared/`. If two places need the same number, it is a named constant there.

## One match, two transports (ADR-0067)

```
online:  NetClient ──WebSocket──▶ server/src/index.ts ─▶ RoomManager ─▶ Match
solo:    NetClient ──LocalSocket─▶ client/src/net/localServer.ts ─▶ RoomManager ─▶ Match
```

- `NetClient` (`client/src/net/netClient.ts`) speaks the same messages either way. `startSolo()` switches to the loopback; `createRoom` / `joinRoom` switch to the real server.
- `Match` (`server/src/match.ts`) owns phases, host, settings and joining; the pieces live in `server/src/match/`: `bullets`, `missiles`, `grenades`, `bots`, `lobby`, `spawns`, `scoring`, `history` (lag compensation) and `pilot`.
- Bots are pilots inside the match. Their snapshots reach the client like any other pilot's, so the client has no bot code.
- Netcode is latest state wins (ADR-0004): `snapshotBuffer.ts` keeps a short buffer per remote pilot and drops stale snapshots. Nothing replays a backlog (Hard rule 1).
- `shared/protocol.ts` is the wire format. Changing it means bumping `PROTOCOL_VERSION`; `shared/protocolVersion.test.ts` fails until you do.

## The client frame (`client/src/game.ts`)

`startGame()` wires everything, then runs one loop:

1. **Input**: `InputManager` turns radios, gamepads, touch and keys into one calibrated `ControlState` (Hard rule 3). Menus read the same state through `MenuNav`.
2. **Physics** at a fixed 500 Hz: `Drone` (`sim/drone.ts`) asks the flight model for force and torque, Rapier integrates. Quads fly `PhysicalQuad` (real props, motors, battery, PID; ADR-0063 to 0066); the wing flies `wingModel.ts`.
3. **Combat**: `CombatClient` fires rounds, draws tracers at once and reacts to what the server decides (hits, deaths, respawns). Prop blasts look like `combat/propEffects.ts`.
4. **Network**: send our state at `NET.sendHz`; `RemoteDrones` draws everyone else from the interpolation buffer.
5. **Draw and HUD**: `Targeting` (`ui/targeting.ts`) works out name tags, edge arrows and the lead circle; `Hud` draws the OSD.

## Data drives behaviour

- **Bodies** (`shared/drones.ts`): health, hardpoints, model, camera uptilt, mount points. Quads get their physical parts from the spec in `sim/physicalQuad.ts`.
- **Builds** (`client/src/sim/build.ts`): a loadout's real mass and the Loadout screen's stats come from short headless runs of the real flight model, cached by `loadoutKey()`.
- **Weapons** (`shared/weapons.ts`), **specials** (`shared/specials.ts`) and **propellers** (`shared/propellers.ts`) are tables; code switches on their fields, not their ids.
- **Maps** (`shared/maps/`) are built on first use by `getMap()` and shared by renderer, physics and server.

## Menus

`ui/menu.ts` is a screen stack: `show()` pushes, Back pops, and joining or leaving a room replaces the stack. Each screen is one file in `ui/screens/` (main, play, pause, room, rules, account, touch); Settings, Loadout and calibration plug in through small adapters. Styles are split by screen in `ui/styles/`, loaded in cascade order by `index.css`.

## Tests

`npm test` runs Vitest across all three folders. The flight model, rates, match rules, protocol parsing, maps and bots have tests; rendering and menus are checked by hand or with Playwright (see `RUNBOOK.md`).
