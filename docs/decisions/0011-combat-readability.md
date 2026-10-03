# ADR-0011: Combat readability: bigger targets, trails, lead indicator, twin guns

- **Status:** Accepted, amended by ADR-0012 (hit radius now 0.75 m, matching the drawn size) (damage superseded by ADR-0028) (sizes superseded by ADR-0029)
- **Date:** 2026-09-29
- **Amends:** ADR-0009 (weapon origin, hit size, damage, how the other pilot is shown)

## Context

After real matches, both pilots found they could see each other (thanks to the box marker) but almost never hit. Real-scale 5" quads are about 0.3 m across, fast, and change direction instantly. The box marker also felt wrong. Both pilots picked the changes below together.

## Decision

- **Bigger targets:** other pilots' drones are **drawn about 1.5 m across** (roughly cinelifter size), and the server **hit radius is 1.5 m** around the drone's center.
  - **Flight physics are unchanged:** your quad still flies and collides like a real 5" (ADR-0008). Only the visuals and the hit area grow.
- **Damage 20** per hit (5 hits to kill, down from 9).
- **Twin guns:** rounds alternate between a left and a right gun beside the camera, angled to converge 40 m ahead, so both streams meet near where you're looking.
- **Trail instead of a box:** the other pilot leaves a short, fading flight-path ribbon in their team color.
  - The box marker is gone while they're on screen. An edge arrow with distance remains when they're off screen or behind you.
- **Glow:** drones carry a team-colored glow that stays visible at a distance. It is hidden by walls: no seeing through geometry.
- **Lead indicator:** a small circle shows where to aim so your rounds meet the other pilot, based on their current velocity and round speed. Aim at the circle.
  - Server hit checks are unchanged. The indicator only helps you aim.
- Round speed stays **350 m/s**.

## Alternatives considered

- **Faster rounds (600 m/s):** less lead needed. Not chosen for now, since the lead indicator addresses the same problem.
- **Growing the physics collider to 1.5 m:** matches visuals, but changes how the quad handles and makes the arena's gaps unflyable.
- **Keep the box marker:** clear, but felt artificial. Trails show direction and speed, which is what aiming needs.

## Consequences

- Visually, a big drone can overlap scaffolding when its (small) physics body threads a tight gap. Accepted.
- Protocol version bumps so both pilots run matching combat numbers.
- Hit radius, damage, gun spacing and convergence are tunable numbers in `shared/combat.ts`. The drone visual scale is in `client/src/config.ts`.
