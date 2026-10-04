# Decisions (ADRs)

One file per decision: `NNNN-short-title.md`. Never delete; supersede. Create or change decisions with `/decide`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-browser-threejs-stack.md) | Browser game rendered with Three.js (WebGPU renderer, WebGL2 fallback) | Accepted |
| [0002](0002-typescript-vite.md) | TypeScript (strict) + Vite for the client; TypeScript for the server | Accepted |
| [0003](0003-custom-flight-model-rapier.md) | Custom acro flight model; Rapier only for collisions | Superseded by 0008 |
| [0004](0004-netcode-latest-state-wins.md) | Netcode: latest state wins, ~100 ms interpolation, no backlog replay, server-side hits | Accepted |
| [0005](0005-room-codes-not-matchmaking.md) | Node WebSocket server with room codes (two digits since 2026-10-01); no matchmaking | Accepted (room size superseded by 0026) |
| [0006](0006-controller-gamepad-calibration.md) | Radios via Gamepad API behind a mapping/calibration layer | Accepted |
| [0007](0007-art-direction.md) | Art direction: bright industrial, orange/black/white, inspired by Flight Division's feel only | Accepted (Playground exception: 0019; menu style: 0039) |
| [0008](0008-rapier-integrates-flight-forces.md) | Custom flight model computes forces; Rapier applies all forces (incl. real gravity) and integrates motion | Accepted |
| [0009](0009-combat-rules.md) | Combat: tracer rounds, 100 HP, server-decided hits with limited lag compensation, crash = death, first to 5; lime second color | Accepted (amended by 0011, 0012, 0013, 0033; free-for-all and first to 10: 0026) |
| [0010](0010-procedural-audio.md) | Procedural audio (Web Audio): throttle-following motors, positional other pilots, synthesized effects; no audio files | Accepted |
| [0011](0011-combat-readability.md) | Combat readability: 1.5 m drones (visual) and hit radius, damage 20, twin converging guns, trails, glow, lead indicator | Accepted (sizes: 0029 → 0036 → 0043; damage: 0028; guns: 0033) |
| [0012](0012-maps-and-random-spawns.md) | Maps as shared data (Downtown, Yard), host picks map, 8 random spawns kept away from opponents, 0.75 m hitbox, mountains/clouds scenery | Accepted (hit sizes: 0029 → 0036) |
| [0013](0013-drone-classes.md) | Drone classes: Freestyle, 3D quad (reversible thrust), FPV wing (fixed-wing model); per-class health/damage/fire rate/round speed/size; switch at next respawn | Accepted for bodies (per-class weapons and numbers superseded by 0033) |
| [0014](0014-class-weapons-and-cobra.md) | Wing rotary cannon (50/s, continuous BRRRT) and Cobra maneuver on a Special button; 3D quad choked double-barrel shotgun (2/s, 8 pellets); per-class token-bucket rate checks | Accepted for weapon designs (Cobra: 0015 → 0022; damage: 0028; per-weapon rate checks: 0033) |
| [0015](0015-physics-cobra.md) | Cobra is physics-based: hold Special, pitch from elevator/stability/damping moments, speed-dependent, no cooldown; Map buttons quick remap | Superseded by 0022 (Map buttons stand) |
| [0016](0016-smoke-and-rockets.md) | 3D quad smoke screen (conceals, 6 s, 10 s cooldown); Freestyle switchable TOW-style guided missile (line-of-sight guidance, 2.5 s burn, 5 s self-destruct, one in flight, proximity fuse, 45 splash); server-authoritative | Superseded by 0024 (smoke) and 0025 (missile) |
| [0017](0017-training-ground.md) | Training map with practice bots (stationary, fixed-path, random, evasive); solo only, client-side hit checks, hits/kills/accuracy HUD | Accepted |
| [0018](0018-missile-one-shot.md) | Guided missile is a one-shot kill: anyone within 3 m of the blast dies (fuse is 2.5 m); 50→0 splash out to 6 m | Accepted (numbers superseded by 0027) |
| [0019](0019-playground-map.md) | Playground map: giant park (playhouse, slides, swings, monkey bars, lattice, seesaw…) in solid colors with baked grids; exception to ADR-0007 for this map | Accepted |
| [0020](0020-movers-and-grid-option.md) | Moving props from the shared clock (Downtown traffic, Playground roller coaster, Yard tractor): solid to fly into, not to rounds; Settings option for grid textures on every map | Accepted (amended by 0023) |
| [0021](0021-fly-io-hosting.md) | Host on Fly.io: one container serves the client and the room server on one port; exactly one machine in `dfw` (Dallas) that sleeps when nobody is connected | Accepted |
| [0022](0022-wing-maneuver-mode.md) | Wing maneuver mode (hold Special / switch): pitch ×2, roll ×1.3, more low-speed authority, relaxed stability so you can stall; replaces the Cobra | Accepted |
| [0023](0023-destructible-props.md) | Destructible props: movers and per-map explosives (parked cars, barrels, propane, water tanks) blow up when shot; server-authoritative online, chain reactions, blast damage in matches, 30 s respawn | Accepted |
| [0024](0024-smoke-trail-stealth.md) | 3D quad smoke is a 6 s stealth smoke trail: the other pilot sees only your frame (no glow, trail, lead dot or marker); 10 s cooldown | Accepted |
| [0025](0025-piloted-missile.md) | Freestyle missile is flown from its own camera (sticks, throttle, thrust vectoring, fuel ≤10 s); drone auto-hovers and can be shot; client flies it, server validates and decides hits | Accepted |
| [0026](0026-free-for-all-rooms.md) | Free-for-all rooms of up to 10 pilots: match starts at 2, join mid-match, first to 10 kills, 10 pilot colors, spawn offsets | Accepted |
| [0027](0027-bigger-missile-blast.md) | Missile fuse 4 m, one-shot within 5 m, splash to 10 m; hovering drone watches its missile and the blast for 1.5 s | Accepted |
| [0028](0028-fast-gun-ttk.md) | Fast gun time-to-kill: Freestyle 34/hit (3-hit kill), wing cannon 10, shotgun pellet 14 | Accepted |
| [0029](0029-triple-size-drones.md) | Drones drawn and hit at 3× size: hit radius 2.25 m (wing 2.7 m), ~4.5 m drawn; physics stay real 5" | Hit sizes accepted (drawn size superseded by 0043) |
| [0030](0030-optional-accounts-and-cosmetics.md) | Optional sign-in (Google); guests always play; progression unlocks sidegrade bodies, weapon and special modules plus cosmetics, server-decided; built in 4 steps | Accepted (Discord dropped: 0031; content and unlocks: 0033) |
| [0031](0031-supabase-auth.md) | Supabase for Google sign-in and profiles (Discord dropped for now); RLS per pilot; guests migrate on first sign-in; progression written only by the server (step 3) | Accepted |
| [0032](0032-xp-and-levels.md) | XP and levels awarded by the room server (kill 100, assist 40, prop 10, finish 100, win 300; level n at 250·n·(n−1)); server-only writes via secret key; signed-in pilots in online matches only | Accepted |
| [0033](0033-loadouts-weight-and-hardpoints.md) | Loadouts: bodies (thrust, weight, hardpoints) + weapons and specials with weight; overloading is allowed and physical; racer and X8, rail gun, burst rifle, afterburner, shield | Accepted |
| [0034](0034-grenade-launcher.md) | Grenade launcher: server-simulated bouncing grenades; Fire again detonates (8 s fuse); 95 dmg to 3 m, 0 at 12 m, hurts the shooter too | Accepted |
| [0035](0035-propellers.md) | Propellers: tri (stock), bi-blade, quad-blade, heavy-lift, ducted; lift/response/spool/drag/wash/weight multipliers; ducts bounce off walls | Accepted |
| [0036](0036-body-sizes.md) | Bodies differ in size: 3" racer ~2.5 m (hit 1 m), X8 ~13 m (hit 5.4 m); 5" and wing unchanged; preview keeps relative size | Hit sizes accepted (drawn size superseded by 0043) |
| [0037](0037-x8-horizon-mode.md) | The X8 always flies in horizon mode (self-levels near center stick, acro past 75% stick); all other bodies stay acro-only | Accepted |
| [0038](0038-wing-jets.md) | Wing jet engines in the propulsion slot: micro turbine (slow spool, never idles), pulse jet (can't throttle down, shakes), ramjet (needs speed to light); each with its own sound | Accepted |
| [0039](0039-dark-menu-style.md) | Dark translucent panels with orange accents on every menu; Loadout parts grouped and color-coded (Frame, Weapons 2×2, Propulsion, Special) | Accepted |
| [0040](0040-one-set-of-numbers.md) | One set of numbers: physics uses the listed weight and thrust; drag retuned (flat fall ~25 m/s); collision box = drawn model size; FOV default 105° | Superseded by 0041 (FOV 105° kept) |
| [0041](0041-revert-drawn-size-physics.md) | Back to real-size flight physics and colliders (gaps flyable again); keep the 105° default FOV | Accepted |
| [0042](0042-drag-from-shape.md) | Quad air resistance calculated from each body's real-size projected areas (½ρCdA); flight only, no size/weight/thrust change | Accepted |
| [0043](0043-real-size-drones-name-tags.md) | Drones drawn at real size (5" ~0.31 m); hitboxes stay big; War Thunder-style name tags (name, level, distance, health) | Accepted |
