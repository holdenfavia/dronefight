# dronefight

Browser-based FPV drone dogfighting game for two friends who fly real FPV. Three.js + TypeScript client, Node WebSocket server, room codes.

The spec and the decision index below are loaded every session. They are the source of truth.

@docs/SPEC.md
@docs/decisions/README.md

## Before starting any task

1. Read `docs/ROADMAP.md` and work on the **Current focus** unless the user says otherwise.
2. Read the full decision file for any decision the task touches (e.g. networking work → `docs/decisions/0004-*.md`).
3. For how to run, test or deploy, use `docs/RUNBOOK.md`.

## Conflict rule (most important)

If a request, a plan, or code you are about to write contradicts `SPEC.md` (especially **Hard rules**) or an **Accepted** decision:

- **Stop before implementing.** Do not quietly work around it or "fix" the spec to match the code.
- Tell the user in this form:
  > **Spec conflict:** this contradicts **ADR-0004 (latest state wins)** — *<one-line quote or summary>*. Options: (a) keep the decision and do X instead, (b) change the decision via `/decide`.
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
- Game feel (rates, physics constants, netcode timings) lives in named config constants, not magic numbers.
- Commit messages: imperative mood, reference ADRs when relevant (e.g. `Add snapshot interpolation (ADR-0004)`).
