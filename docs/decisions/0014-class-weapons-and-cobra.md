# ADR-0014: Class weapons (wing rotary cannon, 3D shotgun) and the wing's Cobra

- **Status:** Accepted; Cobra section superseded by ADR-0015 (physics-based, hold Special, no cooldown)
- **Date:** 2026-09-29
- **Amends:** ADR-0013 (wing and 3D quad weapons)

## Context

After trying the classes, the pilots wanted weapons with more personality: an F-16-style gun on the wing, a Pugachev's Cobra maneuver on a button for the wing, and a heavily choked shotgun with a medium-slow fire rate on the 3D quad.

## Decision

**Wing: rotary cannon ("BRRRT")**
- 50 rounds/s at 5 damage (250 damage/s sustained, close to the old wing's 240), 480 m/s, 300 m range.
- Sound: one continuous synthesized buzz while firing, not separate shots. Other pilots hear it positionally.

**3D quad: choked double-barrel shotgun**
- 2 shots/s, alternating barrels. Each shot is 8 pellets in a tight 1.5° cone, 8 damage per pellet (64 if all hit), 320 m/s, 150 m range.
- Sound: one deep boom per shot.

**Freestyle 5"** keeps its gun (12/s, 20 damage).

**Wing Cobra (special button)**
- A scripted high-alpha pitch-up: the nose snaps up to roughly 100° to the flight path, holds briefly while broadside drag bleeds speed hard, then pitches back. Weathervaning is suspended during the maneuver.
- 3 s cooldown. Needs some airspeed to start (≥ 12 m/s).
- Input: new optional **Special** binding (button/switch) in Controller setup; **E** on keyboard; left trigger on standard gamepads. It goes through the input layer (Hard rule 3).

**Networking and fairness**
- Each pellet is sent as its own shot. The server checks shots against a **per-class token bucket** (sustained rate = rounds or pellets per second, with a small burst allowance for network jitter) instead of a fixed minimum gap, which would wrongly drop legitimate 50/s fire.
- Round range is per class, so the server stops shotgun pellets at 150 m.

## Alternatives considered

- **Hitscan cannon:** simpler, but inconsistent with tracers and lead (ADR-0011).
- **One message per shotgun blast with a random seed:** less traffic, but pellets must then be reproduced identically on the server. Separate pellets is simpler and still only 16 messages/s.
- **Per-shot sounds for the cannon:** 50 synthesized shots per second sounds like rattling, not the continuous tone of a rotary cannon.

## Consequences

- Class stats gain: pellets per shot, spread, range, and gun sound style.
- Protocol version bumps so both pilots have matching numbers.
- Server fire-rate tests move to the token bucket.
