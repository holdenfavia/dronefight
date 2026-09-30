---
name: decide
description: Record a new or changed project decision as an ADR and update SPEC, the decision index and the roadmap to match. Use when the user makes or changes a design decision (e.g. "/decide we're switching to 3v3"), or right after the user resolves a spec conflict by choosing to change a decision.
---

# /decide

Record a decision so future sessions (and background agents) follow it.

Input: `$ARGUMENTS` is the decision in plain words. If empty, ask what was decided.

## Steps

1. **Understand it.** Restate the decision in one sentence. If the *why* isn't clear from the conversation, ask one short question. Don't invent reasons.

2. **Find what it touches.** Read `docs/SPEC.md`, `docs/decisions/README.md`, and every Accepted ADR on the same topic.
   - If it **replaces** an existing ADR, this is a supersede.
   - If it **conflicts with a SPEC Hard rule**, say so explicitly and confirm the user wants to change that rule.

3. **Write the ADR.** Create `docs/decisions/NNNN-kebab-title.md` (next number, zero-padded) with this template:

   ```markdown
   # ADR-NNNN: <Title>

   - **Status:** Accepted
   - **Date:** <today, YYYY-MM-DD>
   - **Supersedes:** ADR-XXXX   ← only if applicable

   ## Context
   <why this came up, in 2–5 sentences>

   ## Decision
   <what we're doing; concrete and testable>

   ## Alternatives considered
   - **<option>:** <why not>

   ## Consequences
   <what this commits us to, what it rules out, what code/docs must change>
   ```

4. **Supersede, don't delete.** In each replaced ADR, change the status to `**Status:** Superseded by ADR-NNNN (<date>)`. Leave the rest of the file untouched.

5. **Update the index.** Add a row to `docs/decisions/README.md` and update the status of superseded rows.

6. **Update SPEC.md** so it states the new truth and references the new ADR. Keep it concise; details stay in the ADR.

7. **Update ROADMAP.md** if the decision adds, removes or changes work.

8. **Report back** briefly: the new ADR number and title, which files changed, and any existing **code** that now contradicts the decision (list file paths). Don't change that code unless the user asks.

9. If git is available, suggest a commit like `Record ADR-NNNN: <title>`.
