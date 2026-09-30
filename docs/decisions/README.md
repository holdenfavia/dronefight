# Decisions (ADRs)

One file per decision: `NNNN-short-title.md`. Never delete; supersede. Create or change decisions with `/decide`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-browser-threejs-stack.md) | Browser game rendered with Three.js (WebGPU renderer, WebGL2 fallback) | Accepted |
| [0002](0002-typescript-vite.md) | TypeScript (strict) + Vite for the client; TypeScript for the server | Accepted |
| [0003](0003-custom-flight-model-rapier.md) | Custom acro flight model; Rapier only for collisions | Superseded by 0008 |
| [0004](0004-netcode-latest-state-wins.md) | Netcode: latest state wins, ~100 ms interpolation, no backlog replay, server-side hits | Accepted |
| [0005](0005-room-codes-not-matchmaking.md) | Node WebSocket server with room codes; no matchmaking | Accepted |
| [0006](0006-controller-gamepad-calibration.md) | Radios via Gamepad API behind a mapping/calibration layer | Accepted |
| [0007](0007-art-direction.md) | Art direction: bright industrial, orange/black/white, inspired by Flight Division's feel only | Accepted |
| [0008](0008-rapier-integrates-flight-forces.md) | Custom flight model computes forces; Rapier applies all forces (incl. real gravity) and integrates motion | Accepted |
