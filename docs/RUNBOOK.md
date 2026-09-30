# Runbook

How to run, test, deploy and troubleshoot. Add to this whenever something operational is learned.

## Prerequisites (macOS)

1. **Command Line Tools (includes git):** run `xcode-select --install` and click Install.
2. **Node.js 26** (the version in `.node-version`; 22+ works). Either `brew install node` or the installer from https://nodejs.org. Verify with `node -v`.
   - Homebrew gotcha: if `node` isn't found in a new terminal, run the "Next steps" lines the Homebrew installer printed (they add `/opt/homebrew/bin` to your PATH via `~/.zprofile`).

## Run locally

```bash
npm install        # first time, and after pulling dependency changes
npm run dev        # client at http://localhost:5173 (open in Chrome or Edge)
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (rates maths, flight model, calibration) |
| `npm run typecheck` | Type-check client and server |
| `npm run build` | Production build to `dist/client` |
| `npm run server` | Room server on port 8787 (needed for online play) |

### Playing online (local server)

Run the server and the client in two terminals:

```bash
npm run server
```

```bash
npm run dev
```

In the game: **Play online → Create room**, then read the 4-letter code to your friend (or **Copy invite link**; `?room=CODE` joins automatically).

- **Same Wi-Fi:** start the client with `npm run dev -- --host`, then your friend opens `http://<your-computer's-IP>:5173`. The client connects to the server on the same host, port 8787.
- **Different houses:** needs the server deployed (Phase 2 roadmap item).
- **Custom server address:** set `VITE_SERVER_URL=wss://your-server.example` when running or building the client.

### In-game controls

| Action | Radio | Keyboard |
|---|---|---|
| Throttle / yaw | Left stick | W/S, A/D |
| Pitch / roll | Right stick | Arrow keys |
| Arm | Arm switch (if mapped), else throttle low | Throttle low (auto) |
| Fire | Mapped fire button/switch (Controller setup) | Space |
| Reset (solo only; in a match the server respawns you) | Mapped reset button | R |
| Camera FPV / chase | | C |
| Mute / unmute | | M |
| Menu / pause | | Esc |

Keyboard flight is for testing only.

### Tuning the flight feel

Every physics and feel constant lives in `client/src/config.ts` (thrust-to-weight, drag, motor spool, rate tracking, prop wash, crash threshold). Rates and camera are adjustable in-game under **Settings**. Current baseline (guarded by tests in `client/src/sim/flightModel.test.ts`): hover near 25% throttle, idle lift ~5% of weight (zero throttle drops almost like free fall), flat terminal fall ~16 m/s, full-throttle punch ~160 km/h, forward top speed ~170 km/h, full stick reaches max rate in ~25 ms. Gravity is real (9.81 m/s²); fix floatiness with idle thrust and drag, not gravity.

### Combat

Rules are in ADR-0009. Tunable numbers (fire rate, round speed, damage, HP, respawn and protection times, hit radius, kills to win) are in `shared/combat.ts`, used by both client and server. Restart the server after changing them.

- Controller profiles saved before combat have no **Fire** binding. Run **Controller setup** again to map one (keyboard Space always works).
- Rounds alternate between twin guns beside the camera and converge 40 m ahead along the FPV view (uptilt included), even in chase view.
- **Aim at the lead circle**, not the drone: it shows where your rounds will meet them (ADR-0011). Other drones are drawn ~1.5 m across with a glow and a fading trail. Your own physics stay a real 5".
- Visual size, glow size and trail length/width are in `DRONE_VISUAL` in `client/src/config.ts`.
- Tracers show instantly, but only the server decides hits. You'll see the hit marker when the server confirms, one round trip later.

### Maps

Maps are data in `shared/maps/` (ADR-0012), used by the client and the server, so the server needs a restart after editing them.

- `downtown.ts`, `yard.ts`: layout. Everything is boxes (`ArenaBox`); `boxes` collide, `decor` is scenery only.
- Each map needs exactly 8 spawns. `shared/maps/maps.test.ts` checks every spawn has open space around and above it. Run `npm test` after moving things.
- Pick the map with **Map: … ▸** on the main menu. It applies to solo flying and to rooms you create; people joining get the room's map.
- Mountains, clouds and the sun glow are in `client/src/world/scenery.ts`; building textures in `textures.ts`.

### Sound

All sound is synthesized in `client/src/audio/` (ADR-0010); there are no audio files. Motor pitch/level/brightness constants are in `motorVoice.ts`, effects in `sfx.ts`. Volume and mute are in **Settings** (M toggles mute).

- No sound at all? Browsers only start audio after a click or key press, so click **Fly** with the mouse. Gamepad input alone doesn't count.
- Sound pauses when the tab is in the background and gets quieter while the menu is open.

### Dev console

In dev builds, `window.dronefight` exposes `renderer`, `world`, `drone`, `settings`, `physics`, `net` and `audio` for poking around in the browser console.

## Connecting a radio

### DJI FPV Remote Controller 2

1. Power on the controller.
2. Connect it to the computer with a USB-C **data** cable (some cables are charge-only).
3. Check that the OS sees it: open https://gamepad-tester.com in Chrome and move the sticks. Bars should move.
4. If nothing appears, install DJI Assistant 2 (Consumer Drones Series), connect the controller once, then retry.
5. In the game, open **Controller setup** and follow the steps. It detects each stick, its direction, and optional arm/reset switches, then saves a profile for that controller in this browser.

### Other radios (EdgeTX/OpenTX)

Connect via USB and choose **Joystick (HID)** mode when prompted. Then follow steps 3 and 5 above.

## Troubleshooting

### Remote drone looks delayed

Check the network HUD (top right). It shows ping and **delay**: how far behind real time the other drone is on your screen. Delay = the fixed 100 ms smoothing buffer + your friend's upload time, so expect **~100–200 ms**. Over 250 ms turns orange (Hard rule 1).

- If the delay **grows over time**, that is a bug (a snapshot backlog), not the internet. See ADR-0004. The buffer is capped at 8 snapshots, and the server drops (never queues) updates to a backed-up connection. The server logs `droppedSnapshots` every 30 s while players are connected.
- "Pilot signal lost" means no update for 0.6 s (their tab is in the background, or their connection stalled). When updates resume, the drone snaps to its current position. Missed time is never replayed.
- Browsers pause background tabs. If your friend switches away from the game, their drone freezes for you until they come back.

## Deploy

_To be filled in during Phase 2._
