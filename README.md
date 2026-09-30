# dronefight

A browser FPV drone dogfighting game, built by pilots who fly real FPV.

Open a link, share a room code with a friend, plug in your radio, and fight in acro mode in a bright industrial arena. No install, no account.

> **Status:** Phase 3 (combat). Solo flying, 1v1 rooms and dogfighting (tracers, health, first to 5) work on a local server. Deploying so friends can play from different houses comes next. See the [roadmap](docs/ROADMAP.md).

_"dronefight" is a working title._

## Features (planned)

- **Real acro flight:** Betaflight-style rates (RC rate, super rate, expo), adjustable camera uptilt and FOV
- **Your own radio:** DJI FPV Remote Controller 2, EdgeTX/OpenTX radios, or any USB gamepad, with a mapping and calibration screen
- **1v1 online:** create a room, share the code, fly
- **Low-latency netcode:** the other pilot is shown in near real time (target 100–200 ms, never above 250 ms)
- **Dogfighting:** tracers, health, respawns, first to N wins

## Tech stack

| Part | Choice |
|---|---|
| Rendering | [Three.js](https://threejs.org) (WebGPU with WebGL2 fallback) |
| Language / build | TypeScript + [Vite](https://vite.dev) |
| Physics | Custom acro flight model + [Rapier](https://rapier.rs) for collisions |
| Multiplayer | Node.js WebSocket server with room codes |
| Input | Browser Gamepad API through a calibration layer |

The reasoning behind each choice is in [`docs/decisions/`](docs/decisions/README.md).

## Getting started

### Prerequisites

- **git**
- **Node.js 26** (see `.node-version`; 22+ works): `brew install node` or [nodejs.org](https://nodejs.org)
- **Chrome or Edge** (best gamepad support)

### Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome or Edge, run **Controller setup** once, then **Fly**. Controls, tests and tuning notes are in [RUNBOOK.md](docs/RUNBOOK.md).

### Connect your radio

Plug it in over USB-C (use a data cable), then check that the sticks move at [gamepad-tester.com](https://gamepad-tester.com). Radio-specific steps are in [RUNBOOK.md](docs/RUNBOOK.md#connecting-a-radio).

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
