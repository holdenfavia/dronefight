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
| [0007](0007-art-direction.md) | Art direction: bright industrial, orange/black/white, inspired by Flight Division's feel only | Accepted (Playground exception: 0019) |
| [0008](0008-rapier-integrates-flight-forces.md) | Custom flight model computes forces; Rapier applies all forces (incl. real gravity) and integrates motion | Accepted |
| [0009](0009-combat-rules.md) | Combat: tracer rounds, 100 HP, server-decided hits with limited lag compensation, crash = death, first to 5; lime second color | Accepted (amended by 0011, 0012) |
| [0010](0010-procedural-audio.md) | Procedural audio (Web Audio): throttle-following motors, positional other pilots, synthesized effects; no audio files | Accepted |
| [0011](0011-combat-readability.md) | Combat readability: 1.5 m drones (visual) and hit radius, damage 20, twin converging guns, trails, glow, lead indicator | Accepted (amended by 0012) |
| [0012](0012-maps-and-random-spawns.md) | Maps as shared data (Downtown, Yard), host picks map, 8 random spawns kept away from opponents, 0.75 m hitbox, mountains/clouds scenery | Accepted |
| [0013](0013-drone-classes.md) | Drone classes: Freestyle, 3D quad (reversible thrust), FPV wing (fixed-wing model); per-class health/damage/fire rate/round speed/size; switch at next respawn | Accepted (amended by 0014) |
| [0014](0014-class-weapons-and-cobra.md) | Wing rotary cannon (50/s, continuous BRRRT) and Cobra maneuver on a Special button; 3D quad choked double-barrel shotgun (2/s, 8 pellets); per-class token-bucket rate checks | Accepted (Cobra superseded by 0015) |
| [0015](0015-physics-cobra.md) | Cobra is physics-based: hold Special, pitch from elevator/stability/damping moments, speed-dependent, no cooldown; Map buttons quick remap | Accepted |
| [0016](0016-smoke-and-rockets.md) | 3D quad smoke screen (conceals, 6 s, 10 s cooldown); Freestyle switchable TOW-style guided missile (line-of-sight guidance, 2.5 s burn, 5 s self-destruct, one in flight, proximity fuse, 45 splash); server-authoritative | Accepted (damage amended by 0018) |
| [0017](0017-training-ground.md) | Training map with practice bots (stationary, fixed-path, random, evasive); solo only, client-side hit checks, hits/kills/accuracy HUD | Accepted |
| [0018](0018-missile-one-shot.md) | Guided missile is a one-shot kill: anyone within 3 m of the blast dies (fuse is 2.5 m); 50→0 splash out to 6 m | Accepted |
| [0019](0019-playground-map.md) | Playground map: giant park (playhouse, slides, swings, monkey bars, lattice, seesaw…) in solid colors with baked grids; exception to ADR-0007 for this map | Accepted |
| [0020](0020-movers-and-grid-option.md) | Moving props from the shared clock (Downtown traffic, Playground roller coaster, Yard tractor): solid to fly into, not to rounds; Settings option for grid textures on every map | Accepted |
| [0021](0021-fly-io-hosting.md) | Host on Fly.io: one container serves the client and the room server on one port; exactly one always-on machine in `ord` | Accepted |
