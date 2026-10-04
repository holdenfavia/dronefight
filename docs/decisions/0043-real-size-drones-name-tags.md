# ADR-0043: Drones drawn at real size, big hitboxes, War Thunder-style name tags

- **Status:** Accepted
- **Date:** 2026-10-04
- **Supersedes:** ADR-0029 and ADR-0036 drawn sizes (hit sizes stay); ADR-0012's "hitbox matches the drawn drone"
- **Amends:** ADR-0011 (readability)

## Context
Drones were drawn 3× or more (a 5" ~4.5 m, an X8 ~13 m) so they could be seen and hit, which made them look like slow, floaty giants next to a real-scale world. The pilots want the drones to look their real size, keep the forgiving hitboxes, and find each other at range the way War Thunder does: a name tag over each aircraft.

## Decision
- **Drawn at real size:** Freestyle and 3D ~0.31 m, racer ~0.2 m (3"), X8 ~0.5 m, wing ~0.9 m span. Hanging weapons, prop dressing and trails shrink with them; the chase camera sits closer.
- **Hitboxes unchanged** (5"/3D 2.25 m, racer 1 m, wing 2.7 m, X8 5.4 m hit radius): bigger than the drone on purpose, for fun. Physics colliders stay real size (ADR-0041).
- **Name tags:** every other pilot on screen gets a tag above them: their name (color name for now; pilot names later, ADR-0030), level if signed in, distance, and a health bar, in their pilot color. Off-screen pilots keep the edge arrows. Smoke hides the tag (ADR-0024). Training bots get tags too.
- The constant-size glow and the lead indicator stay.

## Alternatives considered
- **Keep enlarged drones:** readable but looks wrong in scale.
- **Shrink the hitboxes too:** too hard to hit at real size.

## Consequences
What you see is smaller than what you can hit; aim at the lead circle and the tag. The Loadout preview sizes bodies by their drawn width. Projectiles (grenade, missile) keep their current drawn sizes for now.
