# ADR-0074: Specials on Space instead of Q

- **Status:** Accepted
- **Date:** 2026-11-11
- **Supersedes:** ADR-0071 (the special key only)

## Context
ADR-0071 put the specials modifier on Q: hold it, or tap it to prime the next arrow. Space was not used by anything in a match. The owner asked to move specials to Space.

## Decision
Space is the specials key, and it works exactly like Q did. Hold Space and press an arrow for a special that way, or tap Space to prime the next arrow as a special. Q no longer does anything. Everything else in ADR-0071 stays as it is.

## Alternatives considered
- **Keep Q:** it sits close to WASD but has to be reached for with the left hand, and Space is free and easier to hold.
- **Both Q and Space:** this leaves two keys for one action, and it would also keep Q from being used later.

## Consequences
`client/src/input.ts` maps the special key to `Space`, and the in-game hints, SPEC, README and RUNBOOK say Space. Space is in the game keys, so it no longer scrolls the page or presses a focused button during a match.
