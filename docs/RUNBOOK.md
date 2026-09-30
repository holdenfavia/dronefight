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
| `npm run server` | Bare WebSocket server on port 8787 (Phase 2 work; not needed yet) |

### In-game controls

| Action | Radio | Keyboard |
|---|---|---|
| Throttle / yaw | Left stick | W/S, A/D |
| Pitch / roll | Right stick | Arrow keys |
| Arm | Arm switch (if mapped), else throttle low | Throttle low (auto) |
| Reset | Mapped reset button | R |
| Camera FPV / chase | | C |
| Menu / pause | | Esc |

Keyboard flight is for testing only.

### Tuning the flight feel

Every physics and feel constant lives in `client/src/config.ts` (thrust-to-weight, drag, motor spool, rate tracking, prop wash, crash threshold). Rates and camera are adjustable in-game under **Settings**. Current baseline (guarded by tests in `client/src/sim/flightModel.test.ts`): hover near 25% throttle, idle lift ~5% of weight (zero throttle drops almost like free fall), flat terminal fall ~16 m/s, full-throttle punch ~160 km/h, forward top speed ~170 km/h, full stick reaches max rate in ~25 ms. Gravity is real (9.81 m/s²); fix floatiness with idle thrust and drag, not gravity.

### Dev console

In dev builds, `window.dronefight` exposes `renderer`, `world`, `drone`, `settings` and `physics` for poking around in the browser console.

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

Check the network HUD. Ping should be under ~150 ms and remote delay under 250 ms (Hard rule 1). If the delay **grows over time**, that is a bug (a snapshot backlog), not the internet. See ADR-0004.

## Deploy

_To be filled in during Phase 2._
