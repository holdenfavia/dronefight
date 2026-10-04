# ADR-0039: Dark panel style for every menu

- **Status:** Accepted
- **Date:** 2026-10-04
- **Amends:** ADR-0007 (UI look)

## Context
The gunsmith-style Loadout screen (ADR-0033) introduced dark translucent panels with orange accents. The pilots liked it and asked for every menu to match, replacing the original white cards with black outlines.

## Decision
- Every menu (start, Play, pause, Settings, Controller setup, Account, room, Loadout) uses dark translucent panels, an orange top edge, orange primary buttons and outlined secondary buttons. Bold condensed all-caps type stays (ADR-0007).
- The Loadout parts list is grouped and color-coded: Frame (white), Weapons (orange, a 2×2 hardpoint grid laid out like the screen corners), Propulsion (blue), Special (purple).
- Styles: the "One look everywhere" block at the end of `client/src/ui/styles.css`.

## Alternatives considered
- **Keep the light cards:** they clashed with the new Loadout screen.

## Consequences
The in-flight HUD is not part of this; it keeps its own look. Older light-theme rules still in `styles.css` are overridden, not removed, and should be folded in when the stylesheet is split.
