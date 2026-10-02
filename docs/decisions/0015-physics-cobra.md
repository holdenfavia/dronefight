# ADR-0015: Physics-based Cobra (hold Special) and quick button mapping

- **Status:** Superseded by ADR-0022 (2026-10-01) for the Cobra; Map buttons still stand
- **Date:** 2026-09-30
- **Amends:** ADR-0014 (the Cobra part)

## Context

The first Cobra (ADR-0014) was scripted: pressing Special rotated the nose at a fixed rate for a fixed time. In play, it felt like the nose was instantly pushed up. Pilots wanted it physics-based, and on a radio button instead of reaching for E.

## Decision

**Cobra = hold Special.** While held, the wing's pitch is integrated from moments instead of commanded:
- **Elevator moment** ∝ dynamic pressure (airspeed²). Fast entries are violent; slow ones barely lift the nose.
- **Static stability** pushes the nose back toward the airflow, stronger than the elevator at high angles, so the nose peaks and returns rather than looping. It holds full strength past 90°.
- **Pitch damping** (∝ airspeed) and **rotational drag** of the flat wing (independent of airspeed, so a slowed wing can't tumble).
- Pitch inertia means the nose **accelerates** up over a fraction of a second instead of snapping.
- Roll and yaw still follow the sticks. Broadside drag bleeds speed (the airbrake). Releasing Special returns to normal flight, which re-aligns with the airflow.
- **No cooldown**: it's self-limiting because it costs speed. The HUD shows READY / ON / LOW SPEED.

Measured envelope (0.5 s hold, 80% throttle): entry at 40 m/s peaks ~100° angle of attack and loses about half its speed; 30 m/s ~90°; 20 m/s ~70°; 12 m/s ~45°. Under 15° after the first 60 ms at any speed. Guarded by tests in `client/src/sim/wingModel.test.ts`. Constants are in `COBRA` in `client/src/sim/wingModel.ts`.

Wing broadside drag drops from 1.1 to 0.5 so a Cobra brakes hard without stalling the wing out of the sky.

**Map buttons.** The main menu gets **Map buttons**, which remaps Arm / Reset / Fire / Special on an already-calibrated controller without redoing the sticks. In this mode, Skip keeps the current binding.

## Alternatives considered

- **Keep the scripted Cobra with softer curves:** still feels canned; doesn't depend on speed.
- **Full 6-DOF aerodynamic moments for all wing flight:** most realistic, but normal flight is tuned and working. Only the Cobra needed moment-based pitch.
- **Keep a cooldown:** unnecessary once the maneuver costs speed.

## Consequences

- Special is now a held input (the input layer exposes both held and pressed).
- Specials for the other classes are still to be decided.
