# Roadmap

**Current focus:** Phase 5.5 — Consolidation (from the 2026-10-14 architecture review, approved 2026-10-15), then Phase 5: turn on XP, play-test and balance loadouts, then unlocks. Play-test items remain in earlier phases.

Check items off as they land. Add items as they're discovered. Moving to a new phase updates **Current focus**.

## Phase 0 — Project setup

- [x] Spec, decisions, roadmap, runbook, CLAUDE.md
- [x] git repository initialized, first commit
- [x] Node.js installed (see RUNBOOK)
- [x] Vite + TypeScript project scaffold (client), strict mode
- [x] Server package scaffold (Node + `ws`)

## Phase 1 — Flight sim (solo)

- [x] Three.js scene: sky, ground, lighting, one test arena
- [x] Gamepad input layer + mapping/calibration screen (ADR-0006)
- [ ] Verify DJI FPV Remote Controller 2 works end to end (wizard tested with a simulated radio; needs the real one)
- [x] Keyboard fallback for testing
- [x] Acro flight model with Betaflight-style rates (ADR-0008)
- [x] FPV camera with adjustable uptilt and FOV
- [x] Collisions against arena geometry (Rapier)
- [x] Crash + reset
- [x] Settings panel (rates, camera) persisted per browser
- [x] FPS counter in debug HUD
- [ ] Both pilots agree it "feels right" (tune in `client/src/config.ts`)

## Phase 2 — Online (2 players)

- [x] WebSocket server with create/join room by code (ADR-0005)
- [x] Send local drone state at fixed rate; broadcast to peer
- [x] Snapshot interpolation, latest-state-wins (ADR-0004)
- [x] Network HUD: ping + remote delay
- [x] Background-tab / reconnect handling (no backlog replay)
- [x] Invite links (`?room=CODE`) and on-screen marker pointing to the other pilot
- [x] Same-Wi-Fi play verified by both pilots
- [ ] Deploy and phone-call test: moved to Phase 3.5 (after combat)

## Phase 3 — Combat

- [x] Decide weapon/health/scoring rules (ADR-0009)
- [x] Arena layout shared with server
- [x] Fire control in input layer + Controller setup
- [x] Firing + tracers (local, instant; remote tracers from server)
- [x] Server-side hit detection with limited lag compensation
- [x] Health, crash = death, kill credit, respawn at team pads
- [x] Match flow: first to 5, results, auto rematch
- [x] Combat HUD: health, score, hit markers, damage flash
- [x] Team colors (orange / lime)
- [x] Both pilots play a real match: too hard to hit (→ ADR-0011)
- [x] Readability pass (ADR-0011): 1.5 m visuals + hit radius, damage 20, twin guns, trails, glow, lead indicator
- [x] Replay matches with ADR-0011: much better; hitbox should match drawn size (→ ADR-0012)
- [x] Maps & polish (ADR-0012): Downtown map, map picker, 8 random anti-camp spawns, 0.75 m hitbox, mountains/clouds/skyline
- [ ] Play Downtown together and tune (building density, spawn spots, hitbox)

## Phase 3.6: Drone classes (ADR-0013)

- [x] Per-class stats shared by client and server; loadout message; server uses shooter/target class
- [x] 3D quad: reversible thrust, center deadband, arm at center
- [x] FPV wing: flight model (lift, stall, drag, weathervane), airborne launch, model, audio
- [x] Drone picker in menu; class models for other pilots
- [x] Separate volume for your drone vs other pilots; F toggles fullscreen; boundary grid fades in near the map edge
- [x] Class weapons (ADR-0014): wing rotary cannon + Cobra, 3D shotgun, Special input, token-bucket rate checks
- [x] Cobra reworked to physics (ADR-0015); Map buttons quick remap
- [x] Specials (ADR-0016): 3D smoke screen with concealment; Freestyle TOW-style guided missile; particles; sounds
- [x] Training ground (ADR-0017): map, stationary/path/random/evasive bots, local practice hits, stats HUD
- [x] Pressure test: fixed missile exploding on launch (client impact check), silent server rejections, ghost launches, departed pilots' missiles; fuzz + real-socket missile test
- [x] Guided missile is a one-shot kill (ADR-0018)
- [ ] Play-test with real hands on the sticks
- [ ] Play all three against each other and tune

## Phase 3.5 — Go online

- [x] Choose hosting and record it (ADR-0021: Fly.io)
- [x] Deploy server + client; play from two houses (https://dronefight.fly.dev, Dallas)
- [ ] Phone-call test: callouts match what you see

## Phase 4 — Polish

- [x] Structure polish: flush joints (cube frames, tower tops, decks, crane), exact Yard ramp, flush overpass rails, container rows, post footings; guarded by `shared/maps/joints.test.ts`
- [x] Texture pass: painted steel (streaks, chips, scratches), concrete walls (formwork seams, tie holes, rain streaks)
- [ ] Art pass on arena per ADR-0007 (more)
- [x] Playground map: giant park in solid-color grid style (ADR-0019)
- [x] Moving props (ADR-0020): Downtown traffic, Playground roller coaster, Yard tractor; Settings option for grid textures on every map
- [ ] Eyeball the coaster, tractor and grid toggle in play
- [x] More obstacles on Yard (gantry crane, pipe rack, water tower, guyed mast, cable, slalom), Playground (rope bridge + lookout, rocket climber, rainbow arches, spring riders), Training (slalom, rising cube hoops, ladder, tunnel)
- [ ] Eyeball the new obstacles in play
- [x] Wing maneuver mode replaces the Cobra (ADR-0022)
- [x] Destructible props: movers, parked cars, drums, propane, water tanks; server-synced, chains, blast damage (ADR-0023)
- [ ] Play-test maneuver mode and prop blasts; tune HP and blast radii
- [x] 3D smoke becomes a stealth smoke trail (ADR-0024)
- [x] Freestyle missile is flown from its own camera; drone hovers (ADR-0025)
- [ ] Play-test the flown missile; tune rates, speed and fuel
- [x] Two-digit room codes; Controller setup hub (sticks / buttons / feel, guessed gamepad layouts)
- [x] Free-for-all rooms of up to 10 pilots (ADR-0026)
- [ ] Play a free-for-all with 3+ pilots; check spawns, scoreboard, markers
- [x] Simpler start screen: Play (drone, map, solo / create / 2-digit join) and Settings (incl. controller)
- [x] Rejoin the same room code after a server restart
- [x] Bigger missile blast; hovering drone watches its missile and the blast (ADR-0027)
- [x] Add a card to Fly.io; server sleeps when idle
- [x] Fast gun time-to-kill (ADR-0028); drones drawn and hit at 3× size (ADR-0029)
- [ ] Additional maps
- [x] Sound (motors, hits, UI): procedural, ADR-0010
- [ ] Sound tuning pass after real matches
- [ ] HUD / menus in the target style
- [ ] Damage effects (video static)

## Phase 5: Accounts and progression (ADR-0030)

- [x] Decide: optional sign-in, progression unlocks sidegrade bodies and modules (ADR-0030); Supabase (ADR-0031)
- [x] Sign-in code: Google via Supabase, profiles table with row-level security, guest profile moves into a new account, Account screen, pilot name
- [x] Create the Supabase project and Google OAuth app; set the keys (Discord dropped for now)
- [ ] Sign in on two devices and check the profile follows
- [x] Step 3 code: progress table (server-only writes), token check, XP from kills/assists/props/finish/win, levels, +XP pop-up and level-ups (ADR-0032)
- [ ] Run 0002_progress.sql and set SUPABASE_SECRET_KEY on Fly (RUNBOOK); play a match signed in and check XP lands
- [x] Loadout system (ADR-0033): bodies with thrust/weight/hardpoints, weapons and specials as weighted modules, physics from weight, Loadout screen, server-validated
- [x] First content batch: rail gun, burst rifle, afterburner, shield, 3" racer, X8 heavy lifter (everything unlocked while balancing)
- [ ] Play-test builds and balance weights, damage and thrust
- [x] Loadout screen: live 3D preview with hardpoint badges; detailed weapon models
- [x] Grenade launcher: bouncing physics grenades, Fire again to detonate, 12 m blast (ADR-0034)
- [x] Gunsmith-style Loadout screen (stats, parts, option bar, hover compare)
- [x] Propellers: tri, bi-blade, quad-blade, heavy-lift, ducted (ADR-0035)
- [ ] Play-test propellers and builds; tune
- [x] Grouped, color-coded Loadout parts; dark style on every menu (ADR-0039)
- [x] Per-body sizes: tiny racer, huge X8 (ADR-0036); X8 horizon mode (ADR-0037)
- [x] Wing jets: micro turbine, pulse jet, ramjet, each with its own sound (ADR-0038)
- [ ] Listen to the jet sounds and fly each jet; tune
- [ ] Builds saved to the account (today: per browser only)
- [x] Drones drawn at real size, big hitboxes kept; War Thunder-style name tags (ADR-0043)
- [x] Drag from real-size shape (ADR-0042)
- [x] Touch controls on iPad and iPhone: floating sticks, corner triggers, second-finger fire, auto-fire, trigger lock, Touch controls screen (ADR-0044)
- [x] Flight assist (Acro / Horizon / Angle) and altitude hold; X8 always Horizon (ADR-0045)
- [x] Touch: drag-to-edit layout editor; hamburger menu button
- [ ] Touch: a "Try it" practice view
- [x] Room settings at create and from the pause menu (ADR-0046)
- [x] Surface-matched bullet impact splashes
- [ ] Play-test touch on a real iPad and iPhone (Safari and Home Screen)
- [x] Paint: pick body color, finish and accent on the Loadout screen; others see it
- [x] Teams mode and a pre-match menu (ADR-0047)
- [x] Cavern map: one huge cave with tunnels, stalactites and stalagmites (ADR-0048)
- [ ] Fly the Cavern together and tune light, formations and tunnel sizes
- [x] Maps 3x the area with landmarks (ADR-0049)
- [ ] Fly the bigger maps together; fill any empty stretches; tune spawns
- [x] Downtown buildings at level-3 detail; spatial collider grid; grid textures default (ADR-0053)
- [x] Remove the Detail test map; detailed coastal hills (ADR-0057)
- [x] Fill Downtown's empty outer areas: airport, Central Park, racetrack, megaproject pit; coastal backdrop (ADR-0054)
- [x] Racetrack recreated as the Circuit of the Americas; reversed depth buffer fixes far flicker (ADR-0055)
- [x] Fill Downtown's last bare asphalt: suburb, favela hill, sports park, airport south; no shared faces on any map (ADR-0055, ADR-0056)
- [x] Downtown flow: boulevards, sculpture garden, airport roundabout and hotel, no bare ground (ADR-0058)
- [x] Rolling terrain under Downtown, street trees in the city (ADR-0059); honest materials everywhere (ADR-0060)
- [ ] Play Downtown (main map) together: spawn spots, airliner and race car feel, pit fights, hills; check frame rate on the mid-range laptop
- [x] Touch flies like a radio: no altitude hold, Acro default (ADR-0050)
- [ ] Paint and pilot name shown to others
- [ ] Unlock track: levels unlock bodies, modules and paints
- [ ] More content: flak, laser, rocket pod, flares, mines, cinewhoop, 7" long range, X8 gunship
- [ ] Badges, challenges, friends leaderboard

## Phase 5.5 — Consolidation (architecture review, approved 2026-10-15)

Make the codebase one system before the next content batch. Decisions: ADR-0065 to ADR-0068.

- [x] GitHub Actions: typecheck, tests and build on every push; deploy only a green main
- [x] Debug readout off by default; "Reset to defaults" resets only its own tab and asks first
- [x] Physical model is the only quad model: remove `stepFlight` and the `QUAD`/`RACER`/`X8` sets; colliders, arming and hover from the specs
- [x] Propellers as real props (ADR-0065); parts add real weight to a bare frame (ADR-0066); Loadout stats from headless runs of the real model
- [x] Menu input and stick navigation on every menu; Settings tabs; Betaflight / Actual / Quick rates with CLI paste (ADR-0068)
- [ ] Behavior on the data: specials as one module each, weapon fire groups as fields, body look/sound/camera as fields; one `loadoutKey()`; drop `MatchPlayer.drone`
- [ ] Typed game event bus; split `game.ts`, `combatClient.ts`, `match.ts`; menu screen stack and one file per screen; CSS split by screen, overridden rules deleted
- [ ] Solo as a room in the page; Training bots as match pilots; host can add bots online; no XP from bots (ADR-0067)
- [x] Build maps on first use (import ~0.3 s → ~0.03 s); load Supabase only for sign-in or a saved session; split the bundle (three, rapier, supabase)
- [ ] Screens: "Solo map" on Play, pre-match button hierarchy and Add a bot, compact Loadout on iPhone, Map in the solo pause menu, battery / flight mode / armed timer on the HUD
- [ ] Protocol-version guard test; `docs/ARCHITECTURE.md`
- [ ] Play-test props, weights and bots; tune

## Later (when the player count grows)

- [ ] Binary snapshots at 20 Hz (~5× less bandwidth) and a bigger Fly machine; load-test with simulated pilots
