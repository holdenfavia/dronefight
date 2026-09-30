# ADR-0010: Procedural audio with Web Audio

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

The game was silent. FPV flying is heavily audio-driven: pilots hear throttle, speed and prop wash, and in a dogfight you hear where the other quad is. Sounds must be original or properly licensed (SPEC Hard rule 4), should add nothing noticeable to load time, and must not cost frame rate (Hard rule 2).

## Decision

- All sound is **synthesized at runtime with the Web Audio API**. No audio files.
- **Motors:** four slightly detuned oscillators through a filter. Pitch and brightness follow motor output, so the whine tracks throttle exactly. Air/wind noise rises with speed.
- **Other pilots are positional:** their motors and shots play through a 3D panner at their drone's position, relative to your camera.
- **Effects:** gunfire, hit confirm, taking damage, crash/explosion, arm/disarm beeps, kill/death/victory/defeat stingers, UI clicks. All are short synthesized one-shots.
- **Controls:** master volume in Settings, and **M** to mute. Audio suspends when the tab is hidden and ducks while the menu is open.
- Tuning lives in `client/src/audio/` as named constants.

## Alternatives considered

- **Recorded samples (CC0 packs):** can sound more "produced," but motor loops don't follow throttle smoothly, they add download size, and every file needs license tracking. Can still be layered in later for specific one-shots, with the user's approval to download and the source noted.
- **Audio middleware (e.g. Howler.js):** convenience for sample playback we don't need.

## Consequences

- Browsers only allow audio after a click or key press. The first click (e.g. **Fly**) starts it. Gamepad input alone doesn't count as a user gesture.
- Sound design is code. Changing how something sounds means editing synthesis parameters, not swapping files.
