# ADR-0034: Grenade launcher: physics grenades you set off yourself

- **Status:** Accepted
- **Date:** 2026-10-04
- **Extends:** ADR-0033 (a new weapon module)

## Context

The pilots wanted a heavily physics-based grenade launcher with a satisfying sound, where you fire, then press the same button again to set it off, with a big splash.

## Decision

- New hardpoint weapon **Grenade launcher** (0.8 kg, one lob per second). **Fire press** lobs a grenade; the **next Fire press** sets off every grenade you have out, wherever they are. Uncollected grenades go off by themselves after an **8 s** fuse. One out per launcher you carry.
- **Physics** (`shared/grenade.ts`): launched at 42 m/s plus your drone's velocity, gravity, light drag, bounces off any surface (energy lost into the surface and a little along it; normals from `raycastArenaHit`), rolls, and comes to rest.
- **Blast:** 95 damage out to 3 m, falling to 0 at **12 m** (twice the missile's reach). It hurts everyone in range, **you included**, and sets off props (ADR-0023). Not a one-shot: a direct hit leaves a Freestyle on 5 HP.
- **Server-authoritative:** the server simulates every grenade with the shared physics (the path depends only on the launch), decides where it goes off, and sends positions ~20/s. Your client predicts your own, so the arc and bounces are instant. Detonate requests set it off where the *server* has it.
- **Feel:** a hollow tube "thoonk" on launch, metal clinks on bounces, a blinking light that speeds up as the fuse runs down, a smoke trail, and a bigger, heavier blast than the missile.

## Consequences

- Protocol version 13: weapon `grenade` (shots carry `rid`), server `grenade` position messages, `boom` with `kind: 'grenade'`, `detonate` with `w: 'grenade'`.
