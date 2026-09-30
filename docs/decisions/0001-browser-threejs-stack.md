# ADR-0001: Browser game rendered with Three.js

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

We want a game friends can play by opening a link: no install, no account. It needs smooth, high-frame-rate 3D rendering. Flight Division, an FPV sim we both like, runs on Three.js with WebGL, which shows the stack can handle an FPV sim.

## Decision

Build the game for the browser, rendering with **Three.js**. Use its **WebGPU renderer** where available, with its automatic **WebGL2 fallback**.

## Alternatives considered

- **Babylon.js:** comparable performance and more built in, but a smaller ecosystem of examples, and fewer FPV projects to learn from.
- **Unity / Godot web export:** strong editors, but large downloads, slow startup, and weaker browser gamepad and networking integration.
- **Raw WebGL/WebGPU:** maximum control but far more work for no real gain.

## Consequences

- Performance depends on our discipline: few draw calls (instancing), baked lighting, compressed assets (KTX2, Draco/meshopt), minimal per-frame allocations.
- Anything needing WebGPU-only features must still degrade gracefully on WebGL2.
