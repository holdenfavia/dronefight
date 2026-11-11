# dronefight

A side-view platform fighter for playing with friends. Four original fighters knock each other off a rooftop: hits build up percent damage, the more damage the further you fly, and anyone knocked off the screen loses a life. One player per keyboard (WASD move, arrows attack, Q specials), plus computer opponents.

> **Status:** restarted on 2026-11-10 as a platform fighter (ADR-0070). Ten fighters (ADR-0072, ADR-0073), three stages, CPUs. Next: tuning with friends, then online rooms. See the [roadmap](docs/ROADMAP.md).
>
> **Looking for the old 3D FPV dogfighting game?** It's kept whole on the [`archive/dronefight-v1`](../../tree/archive/dronefight-v1) branch. What it was and how to bring it back: [docs/legacy/DRONEFIGHT_V1.md](docs/legacy/DRONEFIGHT_V1.md).

## Features

- **Ten fighters:** Brawler (fast fists, builds rage), Blade (sword, the tip hits hardest), Spark (caster: fireballs, homing orb, blink, rewind), Titan (huge, armored, grabs and slams), Ninja (shadow step, smoke bombs), Gunslinger (six shots, lasso), Chef (food, pan reflect, boiling pot), Ghost (swaps your controls, fades), Yo-yo Kid (returning yo-yo, tether), Bard (songs that speed up and slow down)
- **Platform-fighter rules:** percent damage, knockback, stocks, shields, dodges, spikes, recovery
- **One player per keyboard**, up to four fighters with CPU opponents (Easy, Normal, Hard)
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

| | Key |
|---|---|
| Move / jump / fast fall | A D / W / S |
| Attack that way (move key + same arrow = smash, hold to charge) | ← → ↑ ↓ |
| Special that way | hold Q, or tap Q to prime the next arrow |
| Shield / dodge | E (+ direction) |
| Grab, then an arrow throws | ? |

Each fighter has its own moveset and gimmick. **Q + ↑** gets you back to the stage. Tuning notes are in [RUNBOOK.md](docs/RUNBOOK.md).

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
