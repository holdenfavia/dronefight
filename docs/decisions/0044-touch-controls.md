# ADR-0044: Touch controls on iPad and iPhone

- **Status:** Accepted (floating-sticks default superseded by ADR-0050: fixed sticks)
- **Date:** 2026-10-05
- **Changes:** SPEC platform ("Mobile/touch is out of scope") and the out-of-scope list

## Context
Friends without FPV radios want to play on iPads and iPhones, and keyboard flying is no fun. Pressure-sensitive firing isn't available (3D Touch is gone from iPhones; iPads never had it), so firing must not need the aiming thumb.

## Decision
- **Touch is a supported input on iPad and iPhone** (Safari, landscape), alongside radios, gamepads and keyboard. A Bluetooth gamepad on an iPad still takes priority.
- **Layout B (floating sticks):** a touch on the left half places the left stick under your thumb (vertical = throttle, or climb rate with altitude hold; horizontal = yaw); the right half places the right stick (pitch and roll, springs back). Throttle stays where you leave it.
- **Firing without lifting the aim thumb:** corner triggers for the index fingers (top right Fire, top left Special), and any second finger on the right half fires while held. Optional: auto-fire while the lead circle is on a target (the server still decides hits), and trigger lock (tap Fire to keep firing). Double-tap the left half switches weapons. A pause button sits top center.
- **Touch controls screen:** on a touch device with no gamepad, a Touch controls button replaces Controller setup in the pause menu and in Settings: floating or fixed sticks, stick size, sensitivity, swap sides, flight assist, altitude hold, the four firing options, control opacity and button size. Saved per device until settings are saved to the account. A drag-to-edit layout editor comes later.
- **Hard rule 3 holds:** touch is read only by the input layer (`InputManager` via `TouchInput`), which produces the same `ControlState` as every other source.
- Home-screen install (web app manifest) gives an almost-fullscreen view; touch gestures (scroll, zoom) are disabled in game.

## Alternatives considered
- **Fixed twin sticks (layout A):** closest to a radio but hard for new pilots. Kept as the "fixed sticks" option.
- **Tilt to steer (layout C):** intuitive but imprecise and tiring.
- **Pressure to fire:** not available on current devices.

## Consequences
Touch pilots usually fly with flight assist and altitude hold (ADR-0045). The start screen hints and HUD adapt to touch. Safari can't vibrate, so there's no haptic feedback.
