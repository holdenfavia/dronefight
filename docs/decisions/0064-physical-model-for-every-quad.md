# ADR-0064: Every quad flies the physical model

- **Status:** Accepted
- **Date:** 2026-10-14
- **Supersedes:** ADR-0063's "the 3D quad, racer and X8 stay on the simple model"

## Context
Once the 5" flew the physical model (ADR-0063), the owner asked for the other quads to be fixed the same way. Flight Division has no 3", 3D quad or X8, so each one is built from real parts the way Flight Division builds its quads, borrowing its motors, props and tunes where a close match exists (allowed by ADR-0062).

## Decision
- The **3" racer**, **3D quad** and **X8** fly `client/src/sim/physicalQuad.ts`, each from its own spec in `client/src/config.ts` (`PHYSICAL_RACER`, `PHYSICAL_QUAD_3D`, `PHYSICAL_X8`; all in `PHYSICAL_SPECS`):
  - **3" racer:** 140 mm 6S quad, 3000 kV motors, 3x3.5" tri-blades, Flight Division's racer tune. 0.35 kg, static T/W 7.8, hover ~21%.
  - **3D quad:** the 5"'s frame and motors on a 3D ESC with symmetric 5x3.5" 3D props and a 0.2 kg pack. Motors run both ways: centre stick is zero thrust, the lower half reverses, with a 4% deadband around centre. The mixer flips with the thrust direction (Betaflight 3D mode), so sticks keep their meaning inverted. 0.6 kg, T/W 7.1.
  - **X8:** four 0.5 m arms with a coaxial pair at each end (lower props counter-spin and work in the upper props' wake), 975 kV 6S motors on 7" bi-blades, Flight Division's 7" long-range tune with more P and quicker I-term relax. 2.0 kg, T/W 4.1, hover ~36%. Roll and pitch reach max rate in ~90 ms; yaw tops out near 380 deg/s. Still always Horizon (ADR-0037).
- Bodies' `thrustKg` in `shared/drones.ts` follow each thrust stand, so the Loadout screen's thrust-to-weight and hover % match how it flies. Four rail guns still ground an X8; heavy-lift props still lift it.
- The simple model (`stepFlight`, ADR-0061) is no longer used to fly any quad; its parameters still feed rates, assists and the Loadout screen's handling stats.

## Alternatives considered
- **Copy the closest Flight Division profile unchanged:** none matches. Their racer is a 5", their cinewhoop is ducted, and they have nothing reversible or with eight motors.
- **Keep the simple model for these three:** they would keep flying floatier than the 5", which is what the owner asked to fix.

## Consequences
Each quad's feel is tuned through its parts and PID spec, checked by `physicalQuad.test.ts` (weight, thrust, hover, rate response, inverted 3D hover). The X8 costs more CPU than a quad (eight rotors per controller substep), but only for the pilot flying it.
