# ADR-0016: Specials for the other classes: 3D smoke screen, Freestyle guided missile

- **Status:** Accepted
- **Date:** 2026-09-30
- **Amends:** ADR-0013 / ADR-0014 (class abilities)

## Context

Every class should have a special. The wing has the Cobra (ADR-0015). From the proposed options, the pilots chose a **smoke screen** for the 3D quad and a **switchable second weapon** for the Freestyle. While it was being built, they changed that weapon from an unguided rocket to a **TOW-style guided missile** with a fixed flight time, to prevent cross-map sniping.

## Decision

**3D quad: smoke screen (tap Special)**
- Deploys a cloud at the drone's position. It grows from ~2 m to ~9 m radius over the first second, lasts 6 s, then fades. 10 s cooldown, enforced by the server.
- The server relays it to everyone in the room, so all clients draw the same cloud.
- Concealment: while a pilot is inside a cloud, or the line of sight to them passes through one, other clients hide that pilot's glow, trail, edge marker and lead indicator.
- Rounds are unaffected (the smoke is visual): the server's hit checks don't change.

**Freestyle 5": guided missile (tap Special to switch Guns ↔ Missile)**
- TOW-style (SACLOS): the missile steers toward the point on the shooter's line of sight (crosshair) just beyond itself, with a limited turn rate (110°/s boosting, 30°/s coasting). Keep the crosshair on the target to hit.
- Fixed flight time: the motor burns for 2.5 s at 95 m/s; after that it coasts with no boost (drag and gravity), and it self-destructs at 5 s. Total reach stays under ~340 m, so no cross-map sniping.
- One in flight at a time: a new launch **replaces** the one in flight (the old one detonates where it is), because the shooter's client ends a missile slightly before the server does. Pod of 3, regenerating 1 per 4 s, with a small grace for clock skew. If the shooter dies, the wire is cut and it flies straight.
- Missiles fly and explode in any phase, but only do damage in a running match. A launch is relayed to other pilots only after the server accepts it, so nobody sees a ghost launch.
- Proximity fuse 2.5 m (enemies only, never the shooter); also explodes on geometry or at burnout. The impact rule is one shared function (`missileImpact`) used by both the server and the shooter's prediction. Splash: up to 45 damage at the center, 0 at 5 m. No self-damage.
- Server-authoritative: the shooter sends their line of sight with each state update while guiding; the server flies the missile with the shared physics (`shared/missile.ts`), decides the explosion (`boom`), and sends positions ~20/s. The shooter's client predicts its own missile with the same code, so steering feels immediate. Other clients draw it from the server updates.
- No lead indicator while the missile is selected: you steer it instead.

**Visuals and sound**
- One particle system (camera-facing quads in a single dynamic mesh, one draw call, Hard rule 2) for smoke clouds, missile trails and explosion smoke. Explosions add a bright flash.
- Sounds (ADR-0010): smoke hiss, missile launch whoosh, explosion boom. Positional when it's another pilot.

## Alternatives considered

- **3D reverse snap / hover lock:** the pilots preferred concealment.
- **Freestyle turbo / nothing:** the pilots preferred a second weapon.
- **Smoke that blocks rounds:** would make the 3D quad too hard to kill and needs server-side smoke geometry. Concealment only.
- **Unguided rockets (the first version):** at 120 m/s with 250 m range they could snipe across the map. Replaced by the guided missile with a fixed flight time.
- **Client-decided explosions:** inconsistent between clients and exploitable; rejected per ADR-0004.

## Consequences

- Protocol: shots can be missiles (with an id); state can carry a line of sight; new `ability`, `boom` and `missile` messages. Version bump.
- The HUD's special readout becomes per class: COBRA (wing), SMOKE (3D), WEAPON / MISSILE count (Freestyle).
