# ADR-0081: Team battles

- **Status:** Accepted
- **Date:** 2026-11-17
- **Amends:** ADR-0070 (win condition), ADR-0026 (colors: one per slot), ADR-0075 and ADR-0076 (character select and online lobby)

## Context

Holden asked for "a team system like Bopl Battle" (2026-11-17): fighting with friends on the same side against other players or CPUs. Only the general mechanic is taken (pick a team color, teammates can't hurt each other, last team standing wins); no names, art or UI from that game (Hard rule 3). "Team battles" was already on the roadmap under Later.

## Decision

- **Mode:** every match is a **Free-for-all** (as before) or **Teams**. Free-for-all is the default.
- **Teams:** up to four, one color each: **Red, Blue, Green, Yellow**. In a team battle each fighter is drawn, tagged, carded in the HUD and listed in the results in its **team's color** instead of its slot color. Newcomers start on the smaller of Red and Blue, so 1v1 and 2v2 need no clicks.
- **Friendly fire is off by default:** teammates' melee hits, grabs, shots and blasts pass through each other; their shots aren't reflected by teammates. A **Friendly fire** toggle turns it on. Homing shots, shadow steps and CPUs never pick a teammate as a target. A teammate's knockout gives no KO credit.
- **Win:** the **last team with stocks left** wins (fighters with no team count as a side of their own). The results say "<Team> team wins!" and show every fighter on that team. A team battle can't start with everyone on one team.
- **Offline (character select):** Mode and Friendly fire buttons beside Stage and Stocks; in Teams mode each player panel has a team pill to click through the teams.
- **Online (lobby):** each player picks their **own** team on their panel (changing team clears Ready); the **host** sets the mode, friendly fire and each CPU's team. The server checks there are at least two sides before starting and sends each fighter's team in the match start; friendly fire travels with the fight's rules.
- In the sim: `Fighter.team` (-1 in a free-for-all), `MatchRules.friendlyFire`, `World.winnerTeam`.

## Alternatives considered

- **Fixed two teams (Red vs Blue) only:** simpler, but rules out 2v1v1 and four-way pairs; four colors cost nothing more.
- **Host assigns everyone's team online:** fewer clicks for the host, but players expect to pick their own side.
- **Friendly fire always on (or always off):** groups differ; off is the friendlier default, the toggle covers the rest.

## Consequences

- Room protocol changed (team in picks and members, team settings, team per match fighter): protocol version bumped.
- Team colors replace slot colors on fighters only in team battles; the roster grid's tokens keep slot colors to tell players apart.
- Bots read teams when choosing a target; any new targeting code (homing, warps, grabs) must skip teammates, and any new hit path must check `canHurt`.
