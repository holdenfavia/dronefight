# ADR-0023: Destructible props (explode when shot)

- **Status:** Accepted
- **Date:** 2026-10-01
- **Amends:** ADR-0020 (rounds and missiles no longer pass through moving props)

## Context

Pilots wanted Easter eggs: shoot a car enough (or hit it with a missile) and it blows up; barrels and rooftop water tanks too. It should work in solo and online, with both pilots seeing the same thing, and a blast next to the other pilot should be a usable trap.

## Decision

- **What:** every moving prop (cars, tractor, trailer, coaster cars) plus static **explosives** listed per map: parked cars, fuel barrels, propane tanks, and water tanks (rooftops, the Yard water tower). Statics are no longer part of `boxes`; they're in `MapDef.explosives`.
- **Shared rules** in `shared/props.ts` (`PropField`), used by the server and by the client in solo: per-kind HP, rounds hit a prop's box (movers at their shared-clock pose when the round arrives), missile splash damages props, a prop at 0 HP explodes, its blast damages nearby props (chain reactions, 0.15 s apart), and it **respawns after 30 s**.
- **Online:** the server is authoritative (like hits, ADR-0009). Props can be destroyed in any phase; a blast damages pilots only while a match is running: linear falloff from the kind's blast damage (fuel/car 50, propane 60) to 0 at its radius (5–9 m). Kill credit goes to whoever set it off; hurting yourself gives no credit (a recent attacker keeps theirs). Water tanks burst harmlessly.
- **Messages:** `prop` (index, position, who) when one explodes; `MatchState.props` lists destroyed props so late joiners match. Protocol version 8.
- **Solo:** the client runs the same `PropField`; blasts don't hurt you.
- A destroyed prop disappears (model hidden, collider off) until it respawns.

## Alternatives considered

- **Solo only:** simpler, but the pilots want traps in matches.
- **Wrecks that stay:** more visuals and colliders; disappearing keeps it cheap (Hard rule 2).

## Consequences

- Server bullets and missiles test props as well as pilots; client tracers stop at props.
- `maps.test` and `moverClearance.test` include explosives as solid geometry.
