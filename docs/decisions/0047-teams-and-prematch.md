# ADR-0047: Teams mode and a pre-match menu

- **Status:** Accepted
- **Date:** 2026-10-05
- **Changes:** SPEC out-of-scope ("teams"); ADR-0026 (matches no longer start or restart on their own); extends ADR-0046 (a Mode setting)

## Context
With up to 10 friends in a room, the pilots want team fights as well as free-for-all, and a pre-match menu where everyone gathers, picks a side and gets ready before the host starts.

## Decision
- **Mode** in Room settings: **Free-for-all** or **Teams** (two teams: Orange and Lime, the original pilot colors, ADR-0009).
- **Teams:** everyone on a team wears its color (glow, trail, props, tracers, name tag). New pilots join the smaller team; anyone can switch team in the pre-match menu (not mid-match). **No friendly fire** (your own grenade still hurts you). A kill scores for your team; the first team to the kill limit wins; on a time limit the higher team total wins (a tie is a draw). Spawns keep away from enemies only. The lead circle and auto-fire only pick enemies.
- **Pre-match menu** (the room screen): the mode and rules, every pilot (by team in Teams) with their drone, level and a **Ready** check; buttons for Ready, switch team, Loadout, Room settings, invite, leave. Everyone can fly around (no damage) while waiting. **The host starts the match** (at least 2 pilots; in Teams at least one per team); everyone's menu closes and the match begins. After the results, everyone comes back to the pre-match menu.
- Pilot names (callsigns) from your profile are sent to the room and shown on name tags and in the menu; guests show their color name.
- Server-authoritative: sides, friendly fire, scoring and the start are decided by the server. Protocol 17.

## Alternatives considered
- **Auto-start at 2 pilots (as before):** no time to pick teams or loadouts.
- **More than two teams:** not needed for up to 10 pilots.

## Consequences
SPEC out-of-scope loses "teams". Matches need the host to press Start; if the host leaves, the next pilot becomes host (ADR-0046).
