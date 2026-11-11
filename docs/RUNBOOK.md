# Runbook

How to run, test, deploy and troubleshoot. Add to this whenever something operational is learned.

## Prerequisites (macOS)

1. **Command Line Tools (includes git):** run `xcode-select --install` and click Install.
2. **Node.js 26** (the version in `.node-version`; 22+ works). Either `brew install node` or the installer from https://nodejs.org. Verify with `node -v`.
   - Homebrew gotcha: if `node` isn't found in a new terminal, run the "Next steps" lines the Homebrew installer printed (they add `/opt/homebrew/bin` to your PATH via `~/.zprofile`).

## Run locally

```bash
npm install        # first time, and after pulling dependency changes
npm run dev        # game at http://localhost:5173 (Chrome or Edge)
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests (fighter sim, bots, rooms) |
| `npm run typecheck` | Type-check client, shared and server |
| `npm run build` | Production build to `dist/client` |
| `npm run server` | Room server on port 8787 alone (`npm run dev` already starts it) |

### Playing

The menu has four slots. Click a slot's top button to cycle **You → CPU Easy/Normal/Hard → Off**; pick your fighter with the arrows, A/D or ←/→. Pick stage and stocks, then **Fight!** or Enter. Controls are on the menu and the pause screen (Esc).

- One player per keyboard (ADR-0071): WASD move, arrows attack, Space (held, or tapped to prime the next arrow) makes arrows specials, E shield/dodge, ? grab.
- Tests in `shared/fighter/sim.test.ts` drive the sim with `Input` objects: `{ aimRight: true, attack: true }` is a right-arrow attack, `{ aimUp: true, special: true }` is Space + up.
- The old game (v1) is on the `archive/dronefight-v1` branch: `git checkout archive/dronefight-v1 && npm install && npm run dev`. See `docs/legacy/DRONEFIGHT_V1.md`.

### Tuning the feel

- Global feel (knockback scale and decay, hitstun, hitlag, shield, dodges, ledge pull-up, jump squat) is in `shared/fighter/config.ts`.
- Per fighter (weight, speeds, gravity, jumps) and every move (frames, hitbox, damage, angle, base knockback, growth) are in `shared/fighter/fighters.ts`. Angles: 0 = straight ahead, 90 = up, negative = down (spikes).
- CPU behaviour (reaction time, aggression, shielding, recovery) is in `shared/fighter/bot.ts`.
- Camera, screen shake and colors are in `client/src/config.ts`.
- Rough baseline (CPU vs CPU on Rooftop): KOs land around 60–190%, average ~115%; a 3-stock 1v1 lasts 1.5–4 minutes. (Measured with the old drone roster; re-measure for the new cast.)
- After tuning, run `npm test`: the tests check that every fighter can recover, that bots finish matches on every stage, and that the sim stays deterministic.

### Where things are

- `shared/fighter/sim.ts`: the fight (fixed 60 Hz step). No rendering, no randomness except the world's seeded generator, so the server can run it too.
- `client/src/main.ts`: game loop and modes; `render.ts`: camera, stages, effects; `figures.ts`: the stick-figure fighters; `ui.ts`: menus and HUD; `audio.ts`: synthesized sound; `input.ts`: keyboard maps.
- `server/src/`: static hosting, `/healthz`, rooms by code with their lobby (`rooms.ts`), online fights (`match.ts`, ADR-0076). `shared/online.ts`: input bits, world snapshots, online constants.

### Online fights (ADR-0076)

- Try it locally: `npm run dev`, open the game in two browser windows (or two computers on the same network: `npm run dev -- --host`, then `http://<your-ip>:5173`), Online, Make a room in one, join with the code in the other, Ready in both, Start.
- If a fight drifts (rare last-digit float differences between a browser and Node), the client takes the server's snapshot within a second; the console logs it at the Debug (Verbose) level with the field that differed.
- `World` must stay plain JSON (no Maps, class instances or Infinity), or snapshots break; `shared/online.test.ts` checks a restored world plays on identically.
- Bump `PROTOCOL_VERSION` in `shared/constants.ts` whenever `shared/protocol.ts` or `shared/online.ts` message shapes change; old pages are told to refresh.

## Deploy (Fly.io, ADR-0021)

One container serves the game page and the room server on one URL. Config: `Dockerfile`, `fly.toml`, `.dockerignore`.

First time:

1. Make a Fly.io account (needs a card; this app costs about $2/month).
2. `brew install flyctl`, then `fly auth login` (opens the browser).
3. `fly apps create <name>` (the name becomes `<name>.fly.dev`; if `dronefight` is taken, pick another and put it in `fly.toml` as `app`).
4. `npm run deploy`.

After that, every update is just `npm run deploy` (it builds in Fly's builder; no local Docker needed). Restart isn't needed separately: deploy replaces the machine. Online rooms (once online play exists) drop during a deploy; local games are unaffected after the page has loaded.

- **Sleep mode:** the server stops when nobody is connected and wakes on the next visit (first load after a quiet spell takes a second or two longer). `fly status` shows `stopped` when it's asleep; that's normal.
- **Fly trial accounts stop the machine every 5 minutes** ("Trial machine stopping… add a credit card" in `fly logs`), which ends every room. Add a card at https://fly.io/trial.
- **Always deploy with `npm run deploy`** (`--ha=false`). Plain `fly deploy` on a new app creates two machines, which splits rooms between them. Fix with `fly scale count 1`.
- Logs: `fly logs`. Status: `fly status`. Health: `https://<name>.fly.dev/healthz` returns `ok`.
- Try the production setup locally: `npm run build && PORT=8080 npm start`, then open http://localhost:8080.
- Region is `primary_region` in `fly.toml` (`dfw` = Dallas, closest to both pilots). Pick one between the two pilots (`fly platform regions` lists them); after changing it, run `fly scale count 1 --region <new>` and remove the old machine.
