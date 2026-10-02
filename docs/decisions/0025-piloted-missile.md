# ADR-0025: Freestyle missile is flown, not crosshair-guided

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** ADR-0016 (the guided missile's TOW-style line-of-sight guidance and fixed burn; ADR-0018 one-shot damage stands)

## Context

Steering the missile with the crosshair (ADR-0016) worked, but the pilots wanted to *become* the missile: fly it from its own camera, with the same kind of stick controls as the wing, a throttle, and thrust vectoring, while their drone waits in a hover.

## Decision

- **Fire** (missile selected) launches it and your view **switches to the missile camera**, with a missile HUD (speed, throttle, fuel, time left, range to the nearest target, "FIRE / SPECIAL: DETONATE").
- **Controls:** sticks command roll, pitch and yaw rates; **throttle** sets thrust. Turning comes from **thrust vectoring**: more throttle means more turn authority, and the flight path follows the nose quickly. Gravity and drag act on it.
- **Fuel:** about 6 s at full throttle, longer when slow, never more than **10 s** of flight. When fuel runs out it glides, then self-destructs 1.5 s later.
- **Detonate** early with Fire or Special. It also detonates on geometry, on the proximity fuse (2.5 m: pilots, props), at the end of its flight, or if your drone dies. One-shot kill within 3 m and props as before (ADR-0018, ADR-0023).
- **Your drone auto-hovers** in place, level, while you fly the missile, and **can be shot**. Your controls come back when the missile is gone.
- **Netcode:** the shooter's client flies the missile (no input lag) and sends its position and velocity with each state update, like the drone itself. The server keeps authority: it validates speed and lifetime (clamping impossible moves), runs impact and proximity checks on the reported path (targets rewound by the interpolation delay, as for rounds), decides damage, and relays positions to others. A missile with no update for 0.5 s explodes where it was.
- Pod of 3, regen 4 s, one in flight: unchanged. Numbers in `MISSILE` (`shared/missile.ts`).

## Alternatives considered

- **Server simulates from the shooter's stick inputs:** every turn would lag by the round trip; feels bad.
- **Keep crosshair guidance:** what the pilots asked to replace.
- **Drone invulnerable while hovering:** easy to abuse; being exposed is the price.

## Consequences

- Line-of-sight guidance (`g` in the state message) is removed. Protocol version 9.
- New client message `detonate`; `DroneState` carries an optional missile pose.
