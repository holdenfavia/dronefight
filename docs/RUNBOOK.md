# Runbook

How to run, test, deploy and troubleshoot. Add to this whenever something operational is learned.

## Prerequisites (macOS)

1. **Command Line Tools (includes git):** run `xcode-select --install` and click Install.
2. **Node.js 22 LTS or newer:** install from https://nodejs.org (macOS installer), then verify with `node -v`.

## Run locally

_To be filled in when the project is scaffolded (Phase 0)._

## Connecting a radio

### DJI FPV Remote Controller 2

1. Power on the controller.
2. Connect it to the computer with a USB-C **data** cable (some cables are charge-only).
3. Check that the OS sees it: open https://gamepad-tester.com in Chrome and move the sticks. Bars should move.
4. If nothing appears, install DJI Assistant 2 (Consumer Drones Series), connect the controller once, then retry.
5. In the game, open the calibration screen and map the axes.

### Other radios (EdgeTX/OpenTX)

Connect via USB and choose **Joystick (HID)** mode when prompted. Then follow steps 3 and 5 above.

## Troubleshooting

### Remote drone looks delayed

Check the network HUD. Ping should be under ~150 ms and remote delay under 250 ms (Hard rule 1). If the delay **grows over time**, that is a bug (a snapshot backlog), not the internet. See ADR-0004.

## Deploy

_To be filled in during Phase 2._
