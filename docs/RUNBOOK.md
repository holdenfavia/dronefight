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

The start screen is just **Play** and **Settings**. **Play** has your drone and map, then **Solo**, **Create room**, or two boxes for a friend's 2-digit code: typing the second digit joins straight away and shows the room (map, pilots) with **Start**. Free-for-all, up to 10 pilots (ADR-0026). **Copy invite link** shares `?room=CODE`, which joins automatically. Controller setup and Map buttons are under **Settings**. **Escape during a game** opens the pause menu: Resume, Drone (pick your drone; in a match it arrives at your next respawn), Room (invite), Settings, Leave game.

- **Same Wi-Fi:** start the client with `npm run dev -- --host`, then your friend opens `http://<your-computer's-IP>:5173`. The client connects to the server on the same host, port 8787.
- **Different houses:** use the deployed game (see **Deploy**).
- **Custom server address:** set `VITE_SERVER_URL=wss://your-server.example` when running or building the client.

### In-game controls

| Action | Radio | Keyboard |
|---|---|---|
| Throttle / yaw | Left stick | W/S, A/D |
| Pitch / roll | Right stick | Arrow keys |
| Arm | Arm switch (if mapped), else throttle low | Throttle low (auto) |
| Fire | Mapped fire button/switch (Controller setup) | Space |
| Special (wing: maneuver mode, hold) | Mapped Special button or switch (Map buttons), gamepad left trigger | E |
| Reset (solo only; in a match the server respawns you) | Mapped reset button | R |
| Camera FPV / chase | | C |
| Mute / unmute | | M |
| Fullscreen | | F |
| Menu / pause | | Esc |

Keyboard flight is for testing only.

### Tuning the flight feel

Every physics and feel constant lives in `client/src/config.ts` (thrust-to-weight, drag, motor spool, rate tracking, prop wash, crash threshold). Rates and camera are adjustable in-game under **Settings**. Current baseline (guarded by tests in `client/src/sim/flightModel.test.ts`): hover near 25% throttle, idle lift ~5% of weight (zero throttle drops almost like free fall), flat terminal fall ~16 m/s, full-throttle punch ~160 km/h, forward top speed ~170 km/h, full stick reaches max rate in ~25 ms, prop wash very light (max 12°/s shake, only when dropping faster than 4 m/s; set `propWash.maxDegPerSec` to 0 to remove it). Gravity is real (9.81 m/s²); fix floatiness with idle thrust and drag, not gravity.

### Combat

Rooms are **free-for-all** for up to 10 pilots (ADR-0026): everyone is an enemy, first to 10 kills wins, each pilot has their own color (named by color in toasts and the scoreboard). You can join a running match. More pilots than spawns? You spawn a few metres beside a taken one.


Rules are in ADR-0009. Match rules (respawn and protection times, kills to win, muzzle positions) are in `shared/combat.ts`; per-weapon numbers (damage, fire rate, round speed) in `shared/weapons.ts`; per-body HP and hit radius in `shared/drones.ts`. Client and server both use them. Restart the server after changing them.

- Controller profiles saved before combat have no **Fire** binding. Use **Settings → Map buttons** to map one (keyboard Space always works).
- Each hardpoint fires from its own screen corner (1 upper-left, 2 upper-right, 3 lower-left, 4 lower-right) and converges 40 m ahead along the FPV view (uptilt included), even in chase view (ADR-0033).
- **Aim at the lead circle**, not the drone: it shows where your rounds will meet them (ADR-0011). Drones are drawn at real size (ADR-0043) but hit spheres are big (5" 2.25 m radius): aim at the name tag and lead circle. Tags are built in `pilotMarkers()` (`game.ts`) and drawn by `Hud.updateMarkers`.
- Visual size, glow size and trail length/width are in `DRONE_VISUAL` in `client/src/config.ts`.
- Tracers show instantly, but only the server decides hits. You'll see the hit marker when the server confirms, one round trip later.

### Drone classes

Freestyle 5", 3D quad and FPV wing (ADR-0013). Pick with **Drone: … ▸** on the Play screen (or the pause menu / room screen while in a room). Solo switches now; in a match it applies at your next respawn.

- **3D quad:** throttle center is zero thrust. Push up for normal thrust, pull below center to reverse the motors (hover inverted, back up). It arms with the throttle **centered**. On the keyboard, throttle starts at center on respawn.
- **FPV wing:** can't hover; stalls below ~35 km/h in level flight (`clAlpha`, `stallDeg` in `WING`). It spawns in the air at flying speed, facing along a street/lane. Keep your speed up: when slow, the nose drops. Camera uptilt is fixed for the wing (`WING.cameraUptiltDeg`).
- Weapons (ADR-0014): Freestyle standard gun; wing rotary cannon (50/s); 3D quad double-barrel shotgun (2 blasts/s, 8 pellets). To put Special (or Fire) on your radio without redoing the sticks, use **Settings → Map buttons**. There, Skip keeps a button's current binding.
- Combat stats per class are in `shared/drones.ts` (server and client). Quad flight tuning is in `client/src/config.ts` (`QUAD`, `QUAD_3D`); wing tuning in `client/src/sim/wingModel.ts` (`WING`).

### Loadouts (ADR-0033)

**Play → Loadout** (or **Loadout** in the pause menu) is a gunsmith-style screen: your drone spinning up top, the **stat sheet** on the left (Health, Lift = T/W with hover throttle, Agility, Firepower, Target size; weight and thrust), the **parts list** beside it in four color-coded groups — **Frame** (white), **Weapons** (orange; hardpoints in a 2×2 grid laid out like the screen corners they fire from, with a filled/total count), **Propulsion** (blue) and **Special** (purple), and a scrolling **bar of options** along the bottom for the selected part, tinted in that group's color. Hover an option to see what it changes (green better, red worse), click to equip; keyboard ← → / Enter / ↑ ↓ work too. The verdict up top says Agile / Heavy and sluggish / Barely flies / **Too heavy to take off**. Nothing is blocked. Each body remembers its build (per browser). Code: `client/src/ui/loadoutScreen.ts`, icons in `client/src/ui/icons.ts`. Every menu uses the same dark-panel look (the "One look everywhere" block at the end of `client/src/ui/styles.css`).

- Numbers: bodies in `shared/drones.ts` (`frameKg`, `thrustKg`, `hardpoints`), weapons in `shared/weapons.ts`, specials in `shared/specials.ts`, defaults and weight math in `shared/loadout.ts`. The client scales simulated mass by (build weight ÷ default build weight) with thrust fixed, so defaults fly exactly as tuned (`loadedParams` in `client/src/sim/drone.ts`). Body flight tuning: `QUAD`, `QUAD_3D`, `RACER`, `X8` in `client/src/config.ts`, `WING` in `wingModel.ts`.
- **Fire** shoots every gun at its own rate. Each hardpoint fires from its own corner of your view: 1 upper left, 2 upper right, 3 lower left, 4 lower right (`gunSide`/`gunRise`/`gunDrop` in `shared/combat.ts`). Each weapon has its own projectile (white-hot gun streaks, chunky yellow burst bolts, orange shotgun pellets, thin red cannon needles, an instant cyan rail beam), with a glow in the shooter's pilot color (`PROJECTILE_STYLES` in `client/src/render/tracers.ts`). Missile pods are a second group: **Special** switches guns/missiles if your special slot is empty; otherwise use **Switch weapon** (Q, gamepad RB, or map it in Settings → Map buttons).
- The server checks every loadout and uses the firing weapon's stats; a weapon you don't carry can't fire.
- **Propellers (ADR-0035):** a Propellers slot on the Loadout screen. Tri-blade is stock; bi-blade = snappy but less lift; quad-blade = more lift, floaty; heavy-lift = +35% lift but sluggish (how you fly a heavy build); ducted = bounce off walls instead of crashing (quads only). Multipliers in `shared/propellers.ts`, applied in `flightParams` (`client/src/sim/drone.ts`).
- **Grenade launcher (ADR-0034):** a Fire press lobs a grenade; the next Fire press sets off every grenade you have out (or they go off after 8 s). They bounce and roll (`GRENADE` in `shared/grenade.ts`); the blast reaches 12 m and hurts you too.
- **Wing jets (ADR-0038):** in the wing's Propulsion slot: micro turbine (slow spool, never idles), pulse jet (can't throttle below ~45%, shakes), ramjet (30% booster until 22 m/s, full by 45 m/s). Behavior in `jet` in `shared/propellers.ts`, applied in `stepWing`; models in `mountJet` (`droneModel.ts`); sounds in `client/src/audio/jetVoice.ts` (`engineVoice` picks prop or jet, for you and other pilots).
- **X8 horizon mode (ADR-0037):** the X8 self-levels near center stick and is acro past 75% stick. Tuning in `X8.horizon` (`client/src/config.ts`), logic in `horizonBlend` (`flightModel.ts`).
- **Body sizes (ADR-0036, ADR-0043):** `visualScale` (1 = real-size model) and `hitRadius` per body in `shared/drones.ts`; hit spheres are deliberately bigger than the drones. Physics colliders stay real size (`halfExtents` in `config.ts`) so gaps stay flyable (ADR-0041; drawn-size colliders were tried in ADR-0040 and reverted).
- **Drag (ADR-0042):** quad drag comes from projected areas (`QUAD_AREAS`) and drag coefficients (`AIR`) in `config.ts`. To change how a quad carries speed or falls, change its areas.
- **Loadout preview:** the Loadout screen shows your build spinning on a turntable on the right, with numbered badges on each hardpoint (`client/src/render/loadoutPreview.ts`).

### Class specials (ADR-0016, ADR-0022)

| Class | Special (E / mapped button) |
|---|---|
| Afterburner (any body) | **Hold** Special: +60% thrust while the fuel bar lasts (2 s; refills in 6 s) |
| Shield (any body) | **Tap** Special: absorbs the next 40 damage for 3 s; 12 s cooldown. Others see a blue bubble |
| FPV wing | **Hold** (or flip a switch mapped to Special) for **maneuver mode**: pitch ×2, roll ×1.3, sharper when slow, weaker nose-into-wind pull, so a hard pull stalls you. HUD shows MANEUVER OFF / ON / STALL |
| 3D quad | **Tap** for a smoke trail (ADR-0024): for 6 s the other pilot sees only your frame (no glow, trail, marker or lead dot); you leave a thin smoke trail; 10 s cooldown |
| Freestyle 5" | **Tap** to switch Guns / **missile**. Fire launches it and **you fly it** from its camera (ADR-0025): sticks steer (roll/pitch/yaw), throttle sets speed (~60–120 m/s) and turn authority (thrust vectoring). Fuel ~6 s at full throttle, up to 10 s slow, then a 1.5 s glide. **Fire again or Special detonates** it right there. Your drone auto-hovers meanwhile, turns to watch the missile, then the blast for 1.5 s, and **can be shot**; if it dies the missile blows. Pod of 3, one in flight. Fuse 4 m, **one-shot kill** within 5 m, splash to 10 m (ADR-0027) |

Numbers: `shared/abilities.ts` (smoke), `shared/missile.ts` (missile flight model; the shooter's client flies it, the server validates its reported path and decides hits), `MANEUVER` in `client/src/sim/wingModel.ts`.

A switch works as Special: in **Map buttons**, flip the switch on when asked for Special. While it's on, maneuver mode stays on.

### Room settings (ADR-0046)

- **Create room** opens Room settings: map, kills to win, time limit, flight assist (Any / Acro only), allowed drones, weapons, specials. In a room, the host changes them from **Pause → Room settings** or the room screen; Apply restarts the match. Others see them read-only.
- Rules and the "nearest allowed build" swap: `shared/roomOptions.ts`; server side `Match.setOptions`.

### Teams and the pre-match menu (ADR-0047)

- Room settings → **Mode**: Free-for-all or Teams (Orange vs Lime). Teams: new pilots join the smaller team; switch with **Join Orange/Lime** in the pre-match menu; no friendly fire (your own grenade still hurts you); team kill totals win.
- The **pre-match menu** (the room screen) shows everyone, their drone, level and Ready. **Fly around** while waiting (no damage). The **host** presses **Start match** (2+ pilots; Teams: one per team); everyone's menu closes. After the results everyone returns to it.
- Server: `Match` with `lobby = true` (rooms); bare `Match` (tests) still auto-starts at 2 pilots. Messages `side`, `ready`, `start`; callsigns ride on `looks`.

### Paint (ADR-0030)

- Loadout screen → **Paint**: body color, finish (solid, racing stripes, checker, camo, carbon weave, chrome) and accent (battery and camera), per body. Saved to your profile (and account when signed in) and sent to the room (`looks` message) so others see it. Your pilot color stays on props, glow and trail.
- Drawn by `applyLook` in `client/src/render/droneModel.ts` (pattern textures drawn once and cached).

### Bullet impacts

- Rounds that stop on something splash there, by surface (`client/src/render/impacts.ts`): dirt on dirt (Playground ground, sandbox), dust and chips on concrete and sidewalks, dark grit on asphalt, sparks on steel, glints on glass, leaves on foliage, painted chips on colored blocks.

### Training ground (ADR-0017)

Pick **Map: Training** and **Fly solo**. Bots: **white** stationary (40/80/130/180 m down the lanes), **blue** fixed paths, **yellow** random, **red** evasive (they jink harder while your crosshair is on them). Hits, kills and accuracy show at the top. **R** respawns you and resets the stats. The lead circle follows the bot nearest your crosshair. Bots are solo-only; hits on them are checked locally (`client/src/training/`).

### Maps

Maps are data in `shared/maps/` (ADR-0012), used by the client and the server, so the server needs a restart after editing them.

- `downtown.ts`, `yard.ts`, `playground.ts`, `training.ts`: layout. The Playground uses the `grid*` materials (flat colors with a baked 1 m / 4 m grid, ADR-0019); other maps use the textured materials. Everything is boxes (`ArenaBox`); `boxes` collide, `decor` is scenery only.
- Thin members (cables, guy wires, braces, arches) use `strut(out, a, b, thickness, mat)` from `builders.ts`. Keep new obstacles 15 m+ from spawns, off the mover routes, and on Training off the central lanes (|x| < 28).
- Each map needs exactly 8 spawns. `shared/maps/maps.test.ts` checks every spawn has open space around and above it. Run `npm test` after moving things.
- Pick the map with **Map: … ▸** on the Play screen. It applies to solo flying and to rooms you create; people joining get the room's map.
- Mountains, clouds and the sun glow are in `client/src/world/scenery.ts`; building textures in `textures.ts`.

### Bigger maps (ADR-0049)

- Downtown, Yard, Playground and Cavern are 3x their original area. Landmarks live in their own functions per map (`outskirts`, `harbor`, `fairground`, `lake`, `mine`…). Shapes: `beam`/`polyBeam`/`hoop`/`water` in `shared/maps/builders.ts`. The drop tower is a mover with a fixed `heading` and `dropTowerTiming` (`shared/maps/movers.ts`).

### Cavern (ADR-0048)

- One huge chamber with loop tunnels (north, south, east) and a west tunnel to a crystal grotto; stalactites, stalagmites, columns, floor mounds; sunlight through three roof holes (invisible lids), glowing crystals. Built from boxes in `shared/maps/cavern.ts` (deterministic seed; `ceilingAt` gives the roof height).
- Its light and fog come from `atmosphere` on the map (applied by `applyAtmosphere` in `client/src/world/scene.ts`); materials `rock` and `crystal`, ground `rock`.

### Moving props and grid textures (ADR-0020)

- **Downtown** has 10 cars on two loops (inner at 16 m/s, outer at 20 m/s), the **Playground** a roller coaster train, the **Yard** a tractor towing a trailer. They're posed from the shared clock (server time in a room), so both pilots see them in the same place.
- They're solid to fly into (you crash), but **rounds and missiles pass through them**: the server doesn't simulate them.
- Routes and speeds are in each map file under `movers`; `shared/maps/moverClearance.test.ts` checks every lap stays clear of geometry and spawn pads.
- **Settings → Simplified grid textures** swaps every realistic texture for flat colors with 1 m grids (Playground style) on any map.

### Destructible props (ADR-0023)

Every moving prop plus each map's **explosives** (`explosives` in the map files: parked cars, fuel drums, propane tanks, water tanks) blow up when shot or hit by a missile. Nearby props chain (0.15 s apart), blasts hurt pilots within 5–9 m during a match (credit to whoever set it off; none for hurting yourself), water tanks just burst. Destroyed props come back after 30 s.

- Rules and HP: `shared/props.ts` (`PROP_STATS`, `PROPS`), run by the server in rooms and by the client in solo.
- Indices on the wire are movers first, then explosives, in map order: editing either list changes them, so restart the server and redeploy together.
- Explosives aren't in `boxes`; `shared/props.test.ts` checks they don't overlap geometry or sit near spawns.

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
5. In the game, open **Settings → Controller setup** and follow the steps. It detects each stick, its direction, and optional arm/reset switches, then saves a profile for that controller in this browser.

### Gamepads (Xbox, PlayStation, Logitech…)

**Settings → Controller setup** opens a hub for the selected controller with separate parts:

- **Calibrate sticks**: detects axes, range and center. Keeps your button bindings.
- **Map buttons**: Arm / Reset / Fire / Special. Keeps your sticks. Skip keeps a binding.
- **Stick feel**: sensitivity (30–150%, gamepads default to 80%) and deadband, saved as you slide, with a live preview.

Gamepads the browser reports as "standard" (Xbox, PlayStation, Logitech in XInput "X" mode) work without setup: left stick throttle/yaw, right stick pitch/roll, RT fire, LT special, Y reset. Other gamepads recognized by name (e.g. a Logitech in DirectInput "D" mode) get a **guessed** layout: check the preview, and Calibrate sticks if a stick is wrong. Logitech F310/F710: the X/D switch on the back picks the mode; **X** is the easier one. Radios are never guessed. **Reset to defaults** forgets your saved setup.

### iPad and iPhone (touch, ADR-0044)

- Open https://dronefight.fly.dev in Safari, hold the device sideways. For a near-fullscreen view: Share → **Add to Home Screen**, then launch from the icon.
- Left stick: throttle (stays where you leave it, like a radio) and yaw. Fixed sticks by default; floating is an option (ADR-0050). Right thumb anywhere on the right half: aim (pitch and roll). Top-right corner = Fire (index finger), top-left = Special; any second finger on the right half also fires. Double-tap the left half to switch weapons. Pause is top center.
- The hamburger button (top middle) opens the pause menu. **Edit layout** (in Touch controls) lets you drag the triggers, menu button and fixed sticks and resize the triggers from their corner handle; saved per device as screen fractions (`TouchLayout` in `settings.ts`).
- **Pause → Touch controls** (or Settings → Touch controls) replaces Controller setup on touch: floating/fixed sticks, size, sensitivity, swap sides, flight assist, altitude hold, corner trigger, second-finger fire, auto-fire on target, trigger lock, opacity, button size. Saved per device.
- A Bluetooth Xbox/PlayStation controller paired to the iPad takes over from touch automatically.
- Code: `client/src/input/touchInput.ts` (fingers → sticks, drawing), read only through `InputManager.readTouch` (Hard rule 3). Tuning in `TOUCH`.
- Testing on a computer: the Browser pane at a width under 768 px emulates touch; a connected gamepad takes priority, so hide it (`navigator.getGamepads = () => []` in the console) when testing touch.

### Flight assist (ADR-0045)

- Settings → **Flight assist**: Auto (Horizon on touch, Acro otherwise), Acro, Horizon (levels near center, flips at full stick), Angle (never flips, 45° max lean). Quads only; the X8 is always Horizon; the wing ignores it.

### Other radios (EdgeTX/OpenTX)

Connect via USB and choose **Joystick (HID)** mode when prompted. Then follow steps 3 and 5 above.

## Sign-in (Supabase, ADR-0031)

Sign-in is optional for players and optional for the build: without the two settings below, the game runs as before and the Sign in button is hidden.

**One-time setup (about 15 minutes). Live project: `xganabqltqpltzgidejq`, Google enabled.**

1. **Supabase project:** sign up at https://supabase.com, create a project (region: *Central US* or *East US*). In **Project Settings → API** copy the **Project URL** and the **anon public** key.
2. **Database:** open **SQL Editor**, paste `supabase/migrations/0001_profiles.sql`, Run.
3. **URLs:** **Authentication → URL Configuration**: Site URL `https://dronefight.fly.dev`; Redirect URLs `https://dronefight.fly.dev/**` and `http://localhost:5173/**`.
4. **Google:** in https://console.cloud.google.com create a project → **APIs & Services → OAuth consent screen** (External, app name dronefight) → **Credentials → Create OAuth client ID** (Web application). Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`. Paste the Client ID and Secret into Supabase **Authentication → Providers → Google**, enable it.
5. **Discord (not used for now):** if wanted later, create an application at https://discord.com/developers/applications, add the same redirect under **OAuth2**, and enable it in Supabase. The game shows a provider's button only when it's enabled in the project.
6. **Game settings:** put the Project URL and anon key in `fly.toml` under `[build.args]` (production) and in `client/.env.local` (local dev, gitignored):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Then `npm run deploy`. Google: while the OAuth app is in **Testing**, only accounts listed under **Audience → Test users** can sign in; **Publish app** opens it to everyone. The anon key is public by design; row-level security means a pilot can only read and write their own profile. **Never** put the `service_role` key in the client, `fly.toml` or git; when the server needs it (progression, step 3) it goes in with `fly secrets set`.

**XP and levels (ADR-0032), one-time:**

1. In the Supabase SQL editor run `supabase/migrations/0002_progress.sql` (table `progress` + `award_progress`).
2. In **Project Settings → API Keys**, create/copy a **secret key** (`sb_secret_…`; on older projects the `service_role` key). Set it on the server yourself, never in git or chat:

```
fly secrets set SUPABASE_SECRET_KEY=sb_secret_...
```

That restarts the server with progression on (`fly logs` shows `progression on`). Without it, everything works and XP is simply off. For local testing, put the same two values in your shell before `npm run server`: `SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run server`.

XP only counts for signed-in pilots in an online match with 2+ pilots: kill 100, assist 40, prop 10, finishing a match 100, winning 300. Level *n* takes 250·n·(n−1) XP. The server writes awards every few seconds and on leaving; the in-game `+XP` pop-up and level show immediately.

**How it behaves:** guests keep their profile in the browser. The first sign-in on a new account copies the guest profile into it; after that the account's profile wins on every device. Profile changes save to the account about a second after you make them.

## Troubleshooting

### Remote drone looks delayed

Check the network HUD (top right). It shows ping and **delay**: how far behind real time the other drone is on your screen. Delay = the fixed 100 ms smoothing buffer + your friend's upload time, so expect **~100–200 ms**. Over 250 ms turns orange (Hard rule 1).

- If the delay **grows over time**, that is a bug (a snapshot backlog), not the internet. See ADR-0004. The buffer is capped at 8 snapshots, and the server drops (never queues) updates to a backed-up connection. The server logs `droppedSnapshots` every 30 s while players are connected.
- "Pilot signal lost" means no update for 0.6 s (their tab is in the background, or their connection stalled). When updates resume, the drone snaps to its current position. Missed time is never replayed.
- Browsers pause background tabs. If your friend switches away from the game, their drone freezes for you until they come back.

## Deploy (Fly.io, ADR-0021)

One container serves the game page and the room server on one URL. Config: `Dockerfile`, `fly.toml`, `.dockerignore`.

First time:

1. Make a Fly.io account (needs a card; this app costs about $2/month).
2. `brew install flyctl`, then `fly auth login` (opens the browser).
3. `fly apps create <name>` (the name becomes `<name>.fly.dev`; if `dronefight` is taken, pick another and put it in `fly.toml` as `app`).
4. `npm run deploy`.

After that, every update is just `npm run deploy` (it builds in Fly's builder; no local Docker needed). Restart isn't needed separately: deploy replaces the machine. Active matches drop during a deploy.

- **Sleep mode:** the server stops when nobody is connected and wakes on the next visit (first load after a quiet spell takes a second or two longer). `fly status` shows `stopped` when it's asleep; that's normal.
- **Fly trial accounts stop the machine every 5 minutes** ("Trial machine stopping… add a credit card" in `fly logs`), which ends every room. Add a card at https://fly.io/trial.
- After any server restart (deploy, crash, trial stop) clients reconnect and rejoin their room code; the first one back recreates the room on the same map, so the group ends up together again. Scores reset (rooms live in memory, ADR-0005).
- **Always deploy with `npm run deploy`** (`--ha=false`). Plain `fly deploy` on a new app creates two machines, which splits rooms between them. Fix with `fly scale count 1`.
- Logs: `fly logs`. Status: `fly status`. Health: `https://<name>.fly.dev/healthz` returns `ok`.
- Try the production setup locally: `npm run build && PORT=8080 npm start`, then open http://localhost:8080.
- Region is `primary_region` in `fly.toml` (`dfw` = Dallas, closest to both pilots). Pick one between the two pilots (`fly platform regions` lists them); after changing it, run `fly scale count 1 --region <new>` and remove the old machine.
