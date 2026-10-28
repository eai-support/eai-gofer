---
name: decision-memo
description: "Writes a stand-alone memo asking for one decision: options, recommendation, risks and deadline. Use when approval is needed."
---

# Decision Memo

Write a narrative memo that lets a decision forum approve, reject, or amend one decision.

## Input

- The decision needed, the options, the analysis behind them, and the forum and deadline.

## Method

1. Header: decision requested, decision maker or forum, date needed.
2. Recommendation: one paragraph.
3. Context: why this decision, why now, and the cost of delay.
4. Options considered, including do nothing, with benefits and drawbacks.
5. Rationale for the recommendation, with evidence.
6. Financial summary (from `business-case` if available).
7. Risks and mitigations. Include dissenting views fairly.
8. Implementation and next steps if approved.
9. The ask, in one sentence.
10. Write in prose for a reader with no prior context. Keep it to 1 to 4 pages.

## Output

The memo, with the sections above as headings.

## Quality bar

- One decision, stated in the first lines.
- A reader with no context can decide from the memo alone.

## Boundaries

- Not for summarizing an existing deck: use `executive-summary`.
- Not for the financial case itself: use `business-case`.
- Not for a routine progress update: use `status-report`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
