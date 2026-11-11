# ADR-0070: Start over as a side-view drone platform fighter; archive v1

- **Status:** Accepted (drone theme and roster amended by ADR-0072, 2026-11-10)
- **Date:** 2026-11-10
- **Supersedes:** the game described by ADR-0001 through ADR-0069, except those listed under "Carried forward"

## Context
The owner was burnt out on the 3D FPV dogfighting game (v1) but still wanted to make something fun to play with friends. They asked to start over as a Super Smash Bros-style game: side view, keyboard only, little drone characters, and to keep v1 somewhere it can be restored, remade or reinterpreted later, without setting up a new project.

## Decision
- **Archive v1** on the branch `archive/dronefight-v1` (commit `099c963`), with a summary in `docs/legacy/DRONEFIGHT_V1.md`. Its ADRs stay in `docs/decisions/` for reference.
- **The game is now a 2D side-view platform fighter** in the same repo, on `main`:
  - Damage is a **percent** that makes you fly further; you lose a **stock** when knocked past a blast zone. Last drone with stocks wins. Default 3 stocks.
  - **Four drone characters** drawn in v1's style: Freestyle (5", all-rounder), Racer (3", light and fast, three air jumps), Heavy (X8, huge and strong), Flipper (3D quad, floaty, two up specials, slam spike).
  - Each has attacks in five directions on the ground and in the air, four specials (blaster, side dash, up boost to recover, down bomb or slam), shield, rolls and air dodge. Recovering near a stage corner pulls you up onto it.
  - **Three stages:** Rooftop (with pass-through girders), Helipad (flat), Crane Yard.
  - **Keyboard only.** Two players on one keyboard (WASD + F/G/H, arrows + K/L/;), up to four drones with CPUs filling the rest (Easy, Normal, Hard). A lone player can use either side.
  - **Canvas 2D** rendering; no 3D engine, no physics engine.
  - The simulation is a **deterministic fixed 60 Hz step** in `shared/fighter/`, input in and state out, so online play can later send only inputs (rollback or lockstep) using the same code on every machine.
- **Online is next, not now.** The server keeps static hosting, the health check and two-digit room codes with a message relay (ADR-0005, ADR-0021), ready for online fights.

### Carried forward
ADR-0002 (TypeScript + Vite), ADR-0005 (room codes, no matchmaking), ADR-0007 (orange/black/white, bright skies; no copied assets), ADR-0010 (synthesized audio), ADR-0021 (one Fly.io machine that sleeps), ADR-0026 (one color per pilot, orange and lime first), ADR-0039 (dark translucent menus with orange accents), ADR-0069 (daily purple sky).

## Alternatives considered
- **A new repo or folder for the new game:** the owner didn't want to set up a new project.
- **Keep v1 playable at a second URL now:** more to maintain while the new game finds its feet; it can be added later from the archive branch.
- **Three.js with an orthographic camera:** reuses the v1 models, but Canvas 2D is simpler, lighter and crisp for a side-view game.
- **Online first:** a fun local game first, then online with friends on the same rules.

## Consequences
- v1's hard rules about flight, radios and netcode no longer apply; the new SPEC has its own.
- Accounts, XP, loadouts, maps and radios are gone from `main` and only live on the archive branch.
- Balance comes from play-testing; tuning lives in `shared/fighter/config.ts` and `shared/fighter/fighters.ts`.
