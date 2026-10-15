# ADR-0061: Full drag, rotor drag and a squared throttle curve (fly like a real 5")

- **Status:** Superseded for quads by ADR-0063 and ADR-0064 (2026-10-15); quads now fly the physical model
- **Date:** 2026-10-13
- **Supersedes:** ADR-0052's drag scale (its faster spool and rate response and the prop fade at 62 m/s stay)
- **Amends:** ADR-0042 (drag from shape), ADR-0008 (flight model tuning)

## Context
The owner still found the flight floaty and inaccurate, and wanted it to fly more like the Flight Division browser sim. Comparing the two: Flight Division applies full body drag (½ρ·CdA·v², 5" drag areas 0.0095 / 0.019 / 0.0085 m² side / top / front, no scale-down), and its blade-element rotor model includes **blade flapping**: air crossing a spinning disc sideways pushes back with a force of flapping × thrust × (crossing speed ÷ tip speed). Dronefight had drag at 35% (ADR-0052) and only a fixed 0.008 N per m/s of rotor drag, so a 5" coasting at 20 m/s lost ~1 m/s per second and slid through turns like on ice. Only ideas and real-quad physical parameters were taken; no code was copied (Hard rule 4 at the time; ADR-0062 now allows their flight code).

## Decision
- **Full body drag** from drag areas: the 5" freestyle uses CdA 0.0095 (side), 0.019 (top), 0.0085 (front) m²; every other quad scales those by its own projected areas (`QUAD_AREAS`). `AIR.dragScale` and the per-face Cd values are gone.
- **Rotor drag:** in-plane force = flapping × |thrust| × crossing speed ÷ tip speed, with tip speed growing as √thrust (5": flapping 2, tip speed 213 m/s at full thrust). Applied to body x and z only, so a throttle-cut drop is not slowed by it.
- **Throttle curve:** thrust ∝ throttle² (rpm ∝ throttle, thrust ∝ rpm²); idle 5.5% motor, i.e. 0.3% thrust. A 5" hovers near 35% throttle.
- **Prop fade follows rpm:** the 62 m/s pitch speed is at full rpm; at part throttle it scales with rpm (√ motor output), so thrust fades at lower airspeeds and altitude stays tied to the throttle (holding level at 50° tilt takes ~59% throttle instead of ~50%).
- **Power:** the 5" gets thrust-to-weight 10 (a 6S 1950 kV 5" on 5×4.5" tri-blades), up from 8; hover ~32%. Other bodies keep theirs.
- Every quad body (3D, racer, X8) uses the same model with its own numbers. The wing is unchanged.

| Stock build | Hover throttle | Drop after 2 s | Flat-fall terminal | Top speed | Punch-out | 20 m/s slide after 1 s at hover |
|---|---|---|---|---|---|---|
| Freestyle (before T/W 10) | 25 → **35%** | 16.7 → **15.6 m/s** | 32 → **23 m/s** | 61 → **40 m/s** (144 km/h) | 42 → **36 m/s** | 18.9 → **13.3 m/s** |
| Racer | 25 → **35%** | | 35 → **25** | 65 → **42** | 43 → **37** | 19.0 → **13.6** |
| X8 | 40 → **50%** | | 31 → **22** | 51 → **32** | 31 → **26** | 18.7 → **14.0** |

(Measured by integrating the flight model with fixed attitude; top speed is the best fixed tilt at full throttle.)

## Alternatives considered
- **Port Flight Division's whole model** (blade-element rotors, motor and battery electrics, PID with real inertia, ground effect): the biggest feel gap is drag and rotor drag; the rest can come later, one piece at a time, without copying code.
- **Keep ADR-0052's low drag and only add rotor drag:** turns would bite, but coasting and top speed (>60 m/s) would still feel unreal.

## Consequences
Quads now carve: velocity follows where the quad points, speed bleeds off when you stop pushing, top speed is ~145 km/h for a 5". Drops reach ~23 m/s instead of ~32. Hover moves up the stick (5" ~35%), which pilots will notice at first. Not yet modeled: battery sag, ground effect, motor electrics. Tuning lives in `client/src/config.ts` (`FREESTYLE_DRAG_AREA`, `QUAD_AREAS`, `rotorDrag`, `throttleExponent`); guarded by `client/src/sim/drone.test.ts` and `flightModel.test.ts`.
