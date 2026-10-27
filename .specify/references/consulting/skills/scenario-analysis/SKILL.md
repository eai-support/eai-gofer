---
name: scenario-analysis
description: "Builds 3 to 4 consistent future scenarios from key uncertainties, with signposts and impacts. Use to plan under uncertainty."
---

# Scenario Analysis

Describe a few coherent futures, test the plan in each, and find moves that work in all of them.

## Input

- The decision or plan, its time horizon, and the main external drivers (from `pestel-scan` if available).

## Method

1. List driving forces. Rate each by impact and uncertainty.
2. Choose the two most impactful and uncertain forces. Cross them in a 2x2 to get four scenarios. Low, base, and high cases are acceptable only if all drivers move together in each case.
3. Give each scenario a name and a short narrative.
4. Set the value of every key driver in each scenario so they move together consistently.
5. Define signposts: early signals that show which scenario is unfolding.
6. Estimate the impact of each scenario on the plan or the financials.
7. Classify moves: no-regret (work in all scenarios), hedges, and options to trigger later.

## Output

1. Scenario matrix with names and narratives.
2. Driver table: Driver | Scenario values.
3. Impact table and signposts.
4. No-regret moves, hedges, and options.

## Quality bar

- Drivers within a scenario are consistent with each other.
- Scenarios are plausible, distinct, and decision-relevant.

## Boundaries

- Not for changing one variable at a time: use `sensitivity-analysis`.
- Not for macro trend scanning: use `pestel-scan`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
