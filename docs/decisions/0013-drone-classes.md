# ADR-0013: Drone classes: Freestyle, 3D quad, FPV wing

- **Status:** Accepted for the bodies; per-class weapons, damage, fire rate and round speed superseded by ADR-0033 (weapons are modules)
- **Date:** 2026-09-29
- **Amends:** ADR-0009 / ADR-0011 / ADR-0012 (combat numbers become per class)

## Context

Both pilots want more variety while keeping the existing freestyle quad. They chose a 3D-mode quad (reversible motors) and an FPV wing, with full classes: types differ in how they fly *and* in combat stats.

## Decision

**Three classes, picked per pilot in the menu:**

| | Freestyle 5" | 3D quad | FPV wing |
|---|---|---|---|
| Flight | Existing acro model (ADR-0008) | Acro quad, bidirectional thrust | Fixed-wing aerodynamics |
| Health | 100 | 90 | 130 |
| Damage per hit | 20 | 18 | 30 |
| Fire rate | 12/s | 14/s | 8/s |
| Round speed | 350 m/s | 350 m/s | 480 m/s |
| Drawn size / hit radius | ~1.5 m / 0.75 m | ~1.5 m / 0.75 m | ~1.8 m span / 0.9 m |

Hit radius still matches drawn size (ADR-0012). Numbers are starting values, tunable in `shared/drones.ts`.

**3D quad**
- Throttle center = zero thrust. Above center = normal thrust; below center = reversed thrust at ~70% strength (symmetric 3D props).
- Small deadband around center, where the motors briefly make no thrust while reversing.
- Arms with the throttle at center (the 3D "throttle low").

**FPV wing**
- Its own flight model: lift from angle of attack with a stall, induced and parasitic drag, sideslip damping, and a pusher prop along the nose.
- Sticks command roll/pitch/yaw rates (rate mode), with control authority scaled by airspeed. The nose weathervanes into the airflow, so a slow wing drops its nose and must dive to recover.
- It can't hover. It spawns airborne (~14 m up, flying speed, facing along a street/open lane) like a hand launch.
- Its camera uptilt is fixed per class (wings fly nose-forward). The user uptilt setting applies to quads.

**Rules**
- During a match, a class change takes effect at the pilot's **next respawn**. The server tracks each pilot's class, uses the *shooter's* class for damage, fire-rate checks and round speed, and the *target's* class for hit radius and health.
- Solo play switches immediately.
- Other pilots' drones are drawn with their class model. Wing audio is a single lower-pitched pusher prop.

## Alternatives considered

- **Flight-only differences:** simplest to balance, but the pilots chose full classes.
- **Racer / cinewhoop / heavy X8:** good future classes, and quicker to build since they reuse the quad model. The wing was chosen for the biggest change in play style.
- **Switch class mid-life:** invites dodging a losing fight by swapping. Next-respawn only.

## Consequences

- Combat numbers move from one global set (`shared/combat.ts`) to per-class stats. Shared rules (respawn, protection, kill credit, first to 5) stay global.
- Protocol: a loadout message, and each match player carries its class (version bump).
- The flight model splits into quad (freestyle/3D share it, with 3D options) and wing. Tests cover both.
