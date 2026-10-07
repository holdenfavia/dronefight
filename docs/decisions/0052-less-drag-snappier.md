# ADR-0052: Much less drag, snappier response, props fade at speed

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** ADR-0042 (drag from shape), ADR-0008 (flight model tuning); brings back ADR-0040's prop pitch speed (on its own, without drawn-size collision)

## Context
The sim still felt floaty: cut the throttle and a 5" stopped speeding up at ~19 m/s (67 km/h). The pilots asked for heavily reduced drag and a snappier feel.

## Decision
- **Drag ×0.35** (`AIR.dragScale`): a flat, throttle-cut drop now keeps accelerating to ~32 m/s.
- **Snappier:** motor spool and rate tracking ~40% faster (5": spool 20 → 12 ms, rate 10 → 6 ms; the other bodies alike, the X8 still the slowest).
- **Props fade at speed** (`pitchSpeed` 62 m/s): thrust drops as air flows into the props, which is what really caps a quad. With the low drag this keeps top speed sane.

| Stock build | Drop after 2 s | Flat-fall terminal | Top speed | Punch-out |
|---|---|---|---|---|
| Freestyle | 15 → **17 m/s** | 19 → **32 m/s** | 56 → **53 m/s** (190 km/h) | 52 → **42 m/s** |
| Racer | | 21 → **35** | 61 → **56** | |
| X8 | | 19 → **31** | 39 → **45** | |

## Alternatives considered
- **More gravity:** changes everything, including projectiles; drag was the actual cause.
- **Less drag without the prop fade:** top speed would pass 300 km/h.

## Consequences
Heavier momentum and longer carries; tune `dragScale`, `pitchSpeed` and the time constants in `client/src/config.ts`. Collision and drawing stay real size (ADR-0041, ADR-0043).
