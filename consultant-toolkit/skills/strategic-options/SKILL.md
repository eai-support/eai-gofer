---
name: strategic-options
description: "Builds 3 to 5 mutually exclusive strategic alternatives and scores them on weighted criteria to reach a recommendation. Use to choose a strategy."
---

# Strategic Options

Define real alternatives, evaluate them fairly, and recommend one.

## Input

- The decision to make, and candidate ideas (from `growth-strategy`, `swot-analysis`, or the team).

## Method

1. State the decision and agree the criteria and weights before scoring. Typical criteria: value, feasibility, risk, fit with strategy, time to impact.
2. Build 3 to 5 options that exclude each other. Always include the base case (do nothing or current plan).
3. Describe each option: what we would do, what we would stop, and what it needs.
4. For each option, write "what would have to be true" for it to succeed.
5. Score each option 1 to 5 per criterion with evidence. Compute weighted totals.
6. Test robustness: does the winner change if weights change by plus or minus 10 points?
7. Recommend one option and name the conditions that would change the choice.

## Output

1. Option descriptions.
2. Scoring matrix: Criterion | Weight | Option scores with evidence | Weighted total.
3. Recommendation, robustness result, and decision conditions.

## Quality bar

- Options are distinct strategies, not variations of one.
- Criteria and weights are fixed before scoring.

## Boundaries

- Not for detailed financials: use `business-case`.
- Not for execution risks of the choice: use `risk-assessment`.
- Hand off to: `business-case`, `pyramid-structure`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
