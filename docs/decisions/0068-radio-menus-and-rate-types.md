# ADR-0068: Menus work from the radio; Betaflight rate types

- **Status:** Accepted
- **Date:** 2026-10-15
- **Amends:** ADR-0006 (a Menu input and menu navigation on the mapping layer)

## Context
Pilots hold a radio in both hands, but no menu answered to sticks or switches, and opening the menu needed the keyboard or a click. Rates offered only Betaflight's classic type, while Betaflight 4.3 and later default to Actual rates. The architecture review recommended both; Holden approved.

## Decision
- **Menu** is a mappable input (gamepad Start by default; a radio button or switch via Map buttons). It opens the pause menu and backs out of sub-screens, like Esc.
- On every menu, the calibrated sticks navigate: pitch moves focus, roll changes a value, Fire selects, Special goes back. Raw axes are still never read (Hard rule 3).
- Rates can be Betaflight, Actual or Quick, per profile, with a live curve and a box that reads a Betaflight CLI `rateprofile` dump.
- Settings are grouped into tabs: Flying, Controls, Sound, Graphics. "Reset to defaults" resets only the open tab and asks first.
- The debug readout is off by default.

## Alternatives considered
- **Mouse only:** the status quo, slow with a radio in hand.

## Consequences
- `ControlState` gains `menuPressed`; Map buttons gains a Menu row.
- Saved rates gain a `type`; old saves load as Betaflight.
