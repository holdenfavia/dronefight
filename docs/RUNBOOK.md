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
| Special (wing: Cobra) | Mapped Special button (Controller setup), gamepad left trigger | E |
| Reset (solo only; in a match the server respawns you) | Mapped reset button | R |
| Camera FPV / chase | | C |
| Mute / unmute | | M |
| Fullscreen | | F |
| Menu / pause | | Esc |

Keyboard flight is for testing only.

### Tuning the flight feel

Every physics and feel constant lives in `client/src/config.ts` (thrust-to-weight, drag, motor spool, rate tracking, prop wash, crash threshold). Rates and camera are adjustable in-game under **Settings**. Current baseline (guarded by tests in `client/src/sim/flightModel.test.ts`): hover near 25% throttle, idle lift ~5% of weight (zero throttle drops almost like free fall), flat terminal fall ~16 m/s, full-throttle punch ~160 km/h, forward top speed ~170 km/h, full stick reaches max rate in ~25 ms, prop wash very light (max 12°/s shake, only when dropping faster than 4 m/s; set `propWash.maxDegPerSec` to 0 to remove it). Gravity is real (9.81 m/s²); fix floatiness with idle thrust and drag, not gravity.

### Combat

Rules are in ADR-0009. Tunable numbers (fire rate, round speed, damage, HP, respawn and protection times, hit radius, kills to win) are in `shared/combat.ts`, used by both client and server. Restart the server after changing them.

- Controller profiles saved before combat have no **Fire** binding. Run **Controller setup** again to map one (keyboard Space always works).
- Rounds alternate between twin guns beside the camera and converge 40 m ahead along the FPV view (uptilt included), even in chase view.
- **Aim at the lead circle**, not the drone: it shows where your rounds will meet them (ADR-0011). Other drones are drawn ~1.5 m across with a glow and a fading trail. Your own physics stay a real 5".
- Visual size, glow size and trail length/width are in `DRONE_VISUAL` in `client/src/config.ts`.
- Tracers show instantly, but only the server decides hits. You'll see the hit marker when the server confirms, one round trip later.

### Drone classes

Freestyle 5", 3D quad and FPV wing (ADR-0013). Pick with **Drone: … ▸** on the main menu. Solo switches now; in a match it applies at your next respawn.

- **3D quad:** throttle center is zero thrust. Push up for normal thrust, pull below center to reverse the motors (hover inverted, back up). It arms with the throttle **centered**. On the keyboard, throttle starts at center on respawn.
- **FPV wing:** can't hover. It spawns in the air at flying speed, facing along a street/lane. Keep your speed up: when slow, the nose drops. Camera uptilt is fixed for the wing (`WING.cameraUptiltDeg`).
- Weapons (ADR-0014): Freestyle standard gun; wing rotary cannon (50/s) plus the **Cobra** while holding Special (E): physics-based, stronger the faster you enter it, costs speed, no cooldown (ADR-0015); 3D quad double-barrel shotgun (2 blasts/s, 8 pellets). To put Special (or Fire) on your radio without redoing the sticks, use **Map buttons** on the main menu. There, Skip keeps a button's current binding.
- Combat stats per class are in `shared/drones.ts` (server and client). Quad flight tuning is in `client/src/config.ts` (`QUAD`, `QUAD_3D`); wing tuning in `client/src/sim/wingModel.ts` (`WING`).

### Class specials (ADR-0015, ADR-0016)

| Class | Special (E / mapped button) |
|---|---|
| FPV wing | **Hold** for a Cobra: physics-based, stronger the faster you enter, costs speed |
| 3D quad | **Tap** for a smoke screen: hides you (glow, trail, marker, lead) for 6 s; 10 s cooldown |
| Freestyle 5" | **Tap** to switch Guns / **guided missile**. Fire launches it; keep your crosshair on the target to steer (TOW-style). 2.5 s burn, self-destructs at 5 s, one in flight (firing again replaces it), pod of 3. **One-shot kill** if it detonates within 3 m (ADR-0018) |

Numbers: `shared/abilities.ts` (smoke), `shared/missile.ts` (missile physics, shared by server and client), `COBRA` in `client/src/sim/wingModel.ts`.

### Training ground (ADR-0017)

Pick **Map: Training** and **Fly solo**. Bots: **white** stationary (40/80/130/180 m down the lanes), **blue** fixed paths, **yellow** random, **red** evasive (they jink harder while your crosshair is on them). Hits, kills and accuracy show at the top. **R** respawns you and resets the stats. The lead circle follows the bot nearest your crosshair. Bots are solo-only; hits on them are checked locally (`client/src/training/`).

### Maps

Maps are data in `shared/maps/` (ADR-0012), used by the client and the server, so the server needs a restart after editing them.

- `downtown.ts`, `yard.ts`, `playground.ts`, `training.ts`: layout. The Playground uses the `grid*` materials (flat colors with a baked 1 m / 4 m grid, ADR-0019); other maps use the textured materials. Everything is boxes (`ArenaBox`); `boxes` collide, `decor` is scenery only.
- Each map needs exactly 8 spawns. `shared/maps/maps.test.ts` checks every spawn has open space around and above it. Run `npm test` after moving things.
- Pick the map with **Map: … ▸** on the main menu. It applies to solo flying and to rooms you create; people joining get the room's map.
- Mountains, clouds and the sun glow are in `client/src/world/scenery.ts`; building textures in `textures.ts`.

### Sound

All sound is synthesized in `client/src/audio/` (ADR-0010); there are no audio files. Motor profiles (quad, wing) are in `motorVoice.ts`, effects in `sfx.ts`. **Settings** has master volume plus **My drone** and **Other pilots** (their motors and gunfire, positioned so you can hear where they are). M toggles mute.

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
