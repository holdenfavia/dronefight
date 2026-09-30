---
name: spec-check
description: Review recent changes (uncommitted work, a branch, or a commit range) against docs/SPEC.md, the Accepted ADRs and the roadmap, and report drift. Use after a substantial work session, before committing, or before merging work done by a background agent.
---

# /spec-check

Find places where the code has drifted from what we agreed. This is a review. **Do not fix anything unless the user asks.**

Input: `$ARGUMENTS` optionally names what to check (a branch, commit range, or path). Default: uncommitted changes plus commits since the last commit that touched `docs/` or the last 10 commits, whichever is fewer.

## Steps

1. **Load the rules.** Read `docs/SPEC.md` (especially **Hard rules**), `docs/decisions/README.md`, and the full text of every **Accepted** ADR relevant to the changed areas.

2. **Get the changes.** Use `git diff` / `git log -p` for the target. If git isn't set up, review the files the user names.

3. **Check each change against:**
   - **Hard rules:** any violation is a blocker. Specifically look for:
     - Unbounded queues or arrays of network snapshots, or replaying missed snapshots (Hard rule 1, ADR-0004)
     - Per-frame allocations, real-time shadows or heavy post-processing on by default (Hard rule 2)
     - Reads of `navigator.getGamepads()` / raw axes outside the input layer (Hard rule 3, ADR-0006)
     - Assets or names from other games (Hard rule 4, ADR-0007)
     - Login or install requirements (Hard rule 5)
   - **Accepted ADRs:** does the code do what the Decision section says?
   - **Scope:** is this work on the roadmap's Current focus? Anything from SPEC "Out of scope"?
   - **Undocumented decisions:** did the code make a real design choice (new dependency, protocol change, new gameplay rule) that has no ADR?
   - **Doc freshness:** are finished items unchecked in ROADMAP, or are there new commands missing from RUNBOOK?

4. **Report** in this format, most serious first:

   ```
   ## Spec check: <target>

   **Blockers** (break a Hard rule or Accepted ADR)
   - <file:line>: <what> — violates <Hard rule N / ADR-NNNN>. Options: fix code, or /decide to change the rule.

   **Drift** (doesn't match spec/ADR but not a hard violation)
   - ...

   **Undocumented decisions** (should become ADRs via /decide)
   - ...

   **Doc updates needed**
   - ...

   ✅ Nothing found  ← if clean
   ```

5. Offer next steps: fix code, run `/decide` for items the user wants to keep, or update docs.
