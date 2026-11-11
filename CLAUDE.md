# dronefight

Browser-based side-view platform fighter for a group of friends: an original cast (ADR-0072), up to 4 fighters, one player per keyboard plus CPUs (ADR-0071). TypeScript + Canvas 2D client, deterministic fight sim in `shared/fighter/`, Node WebSocket server with room codes. The old 3D FPV game (v1) is archived on the `archive/dronefight-v1` branch; see `docs/legacy/DRONEFIGHT_V1.md` (ADR-0070).

The spec and the decision index below are loaded every session. They are the source of truth.

@docs/SPEC.md
@docs/decisions/README.md

## Before starting any task

1. Read `docs/ROADMAP.md` and work on the **Current focus** unless the user says otherwise.
2. Read the full decision file for any decision the task touches (e.g. the game's rules → `docs/decisions/0070-*.md`). ADRs marked "v1, archived" no longer apply.
3. For how to run, test or deploy, use `docs/RUNBOOK.md`.

## Conflict rule (most important)

If a request, a plan, or code you are about to write contradicts `SPEC.md` (especially **Hard rules**) or an **Accepted** decision:

- **Stop before implementing.** Do not quietly work around it or "fix" the spec to match the code.
- Tell the user in this form:
  > **Spec conflict:** this contradicts **ADR-0070 (keyboard only)** — *<one-line quote or summary>*. Options: (a) keep the decision and do X instead, (b) change the decision via `/decide`.
- Proceed only after the user picks. If they change the decision, run `/decide` first, then implement.

This applies to background agents and subagents too. If you cannot ask the user, do not implement the conflicting part. Report it in your result instead.

## Keeping the docs true

- A new or changed decision is recorded with `/decide` **in the same session** it is made. Decisions are never deleted; they are superseded.
- When a roadmap item is done, check it off in `docs/ROADMAP.md`. Update **Current focus** when a phase changes.
- If you learn a new operational fact (a command, a setup step, a gotcha), add it to `docs/RUNBOOK.md`.
- Keep `SPEC.md` short (1–2 pages). Details belong in decision files.
- Suggest `/spec-check` after substantial work or before committing work done by a background agent.

## Code conventions

- TypeScript, strict mode. Match the style of surrounding code.
- Game feel (knockback, movement, frame data, camera) lives in named config constants (`shared/fighter/config.ts`, `shared/fighter/fighters.ts`, `client/src/config.ts`), not magic numbers.
- Keep `shared/fighter/` deterministic: no `Math.random()`, `Date` or `performance.now()` there.
- Commit messages: imperative mood, reference ADRs when relevant (e.g. `Add ledge hang (ADR-0070)`).
