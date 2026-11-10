# dronefight

A side-view drone brawler for playing with friends. Little drone characters knock each other off a rooftop: hits build up percent damage, the more damage the further you fly, and anyone knocked off the screen loses a life. Two players on one keyboard, plus computer opponents.

> **Status:** restarted on 2026-11-10 as a platform fighter (ADR-0070). Four drones, three stages, CPUs, local 2-player. Next: tuning with friends, then online rooms. See the [roadmap](docs/ROADMAP.md).
>
> **Looking for the old 3D FPV dogfighting game?** It's kept whole on the [`archive/dronefight-v1`](../../tree/archive/dronefight-v1) branch. What it was and how to bring it back: [docs/legacy/DRONEFIGHT_V1.md](docs/legacy/DRONEFIGHT_V1.md).

## Features

- **Four drones:** Freestyle (all-rounder), Racer (tiny and fast), Heavy (X8, huge and strong), Flipper (3D quad, floaty, slams down)
- **Platform-fighter rules:** percent damage, knockback, stocks, shields, dodges, spikes, recovery
- **Two players on one keyboard**, up to four drones with CPU opponents (Easy, Normal, Hard)
- **Three stages:** Rooftop, Helipad, Crane Yard
- No install, no account, all sound synthesized in the browser

## Tech stack

| Part | Choice |
|---|---|
| Rendering | Canvas 2D |
| Language / build | TypeScript + [Vite](https://vite.dev) |
| Game logic | Deterministic 60 Hz simulation in `shared/fighter/` (ready for online play) |
| Server | Node.js, WebSocket rooms by two-digit code, on Fly.io |

The reasoning behind each choice is in [`docs/decisions/`](docs/decisions/README.md).

## Getting started

- **Node.js 26** (see `.node-version`; 22+ works): `brew install node` or [nodejs.org](https://nodejs.org)

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome or Edge and press **Fight!**

| | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Drop / fast fall | S | ↓ |
| Attack | F | K |
| Special | G | L |
| Shield / dodge | H | ; |

Attacks and specials change with the direction you hold. **Up + Special** gets you back to the stage. Tuning notes are in [RUNBOOK.md](docs/RUNBOOK.md).

## Project docs

| Doc | What's in it |
|---|---|
| [SPEC.md](docs/SPEC.md) | What the game is, plus the **Hard rules**. The source of truth. |
| [decisions/](docs/decisions/README.md) | One record (ADR) per design decision: what, why, what else we considered |
| [ROADMAP.md](docs/ROADMAP.md) | Phases, checklists, current focus |
| [RUNBOOK.md](docs/RUNBOOK.md) | How to run, test, deploy and troubleshoot |
| [CLAUDE.md](CLAUDE.md) | Instructions Claude Code follows in every session |

## How we work

This project is built with [Claude Code](https://claude.com/claude-code), using a spec-driven workflow so the game stays consistent over time:

1. **Pull first.** Run `git pull` before starting, so your session sees the latest decisions.
2. **The spec is binding.** If a request contradicts `SPEC.md` or an accepted decision, Claude stops and flags the conflict instead of quietly working around it.
3. **Record decisions.** When you make or change a decision, run `/decide <what changed>`. It writes a new ADR, marks any old one as superseded, and updates the spec and roadmap.
4. **Check for drift.** After a work session, or before keeping work from a background agent, run `/spec-check`.
5. **Keep the roadmap current.** Check items off as they land.

Decisions are never deleted, only superseded, so the history of *why* stays readable.
