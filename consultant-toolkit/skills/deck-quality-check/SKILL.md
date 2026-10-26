---
name: deck-quality-check
description: "Runs a final readiness review: storyline answers the question, numbers tie out, claims are sourced, and fixes are routed. Use as the last gate."
---

# Deck Quality Check

Decide if a deck is ready to send, and route each fix to the right owner.

## Input

- The full deck, the key question (from `problem-framing`), and the audience brief.

## Method

Check each item. Rate each issue Blocker, Major, or Minor.

1. Answer: does the deck answer the key question?
2. Audience: does it meet the audience brief, including objections?
3. Storyline: do the titles, read in order, tell the story?
4. Logic: are the sections MECE?
5. Tie-out: does each figure have the same value and unit in the summary, the body, and the appendix?
6. Evidence: does every exhibit have a source and date?
7. Style: is formatting consistent?
8. Copy: are there typos or unclear words?
9. Sensitivity: is confidential or personal data removed or approved?
10. Close: are next steps and asks stated?

Route each fix to its owner: answer and logic gaps to `pyramid-structure`; missing slides, order, and next steps to `recommendation-deck`; titles to `action-titles`; body text and typos to `slide-copy-editor`; style to `visual-consistency`; missing source lines to `exhibit-builder`; weak sources to `source-validation`; figure mismatches to the skill that produced the number; confidential content to the deck owner. This skill owns the checks and the verdict.

## Output

1. Verdict: Ready, Ready after fixes, or Not ready.
2. Scorecard: Check | Pass or Fail | Notes.
3. Issue log: Slide # | Issue | Severity | Fix | Owner skill.

## Quality bar

- Every Blocker has a named fix.

## Boundaries

- Not for making the fixes: send each one to its owner skill above.
- Not for auditing a single structure: use `mece-check`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
