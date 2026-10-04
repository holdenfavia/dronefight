# ADR-0035: Propellers

- **Status:** Accepted
- **Date:** 2026-10-04
- **Extends:** ADR-0033 (a propeller slot on every loadout)

## Context

The pilots want props to matter the way they do on real quads: some give great maneuverability but can't carry much, some lift a lot but handle like a truck.

## Decision

- Every loadout has a **propeller** set (default: race tri-blade). Each is a sidegrade with multipliers on the body's tuned values: **lift** (thrust), **response** (rate tracking), **spool** (motor), **drag** (top speed), **prop wash**, and a little **weight** (`shared/propellers.ts`).

  | Propeller | Lift | Response | Top speed | Other |
  |---|---|---|---|---|
  | Race tri-blade (5×4.3×3) | stock | stock | stock | the all-rounder |
  | Bi-blade freestyle (5×4.8×2) | −15% | snappier | higher | more prop wash |
  | Quad-blade cinematic (5×3×4) | +15% | slower | lower | smooth, little prop wash |
  | Heavy-lift long-pitch (5.1×5×3) | +35% | much slower | about stock | lots of prop wash |
  | Ducted (prop guards) | −20% | about stock | much lower | **bounces off walls instead of crashing** (2.5× the crash threshold); quads only |

- Lift multiplies the body's thrust, so heavy-lift props are how you get an overloaded build flying (four rail guns on an X8) and bi-blades make light builds agile.
- The tri-blade is the stock prop: every default build still flies exactly as tuned.
- The Loadout screen gets a Propellers slot and a **Top speed** stat; models show the props (lighter blur for bi-blades, denser for quad-blades, wider for heavy-lift, guard rings for ducts).
- Flight only (the server doesn't simulate flight); the server validates the propeller with the rest of the loadout. Protocol version 14.
