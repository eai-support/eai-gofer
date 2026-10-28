---
name: ai-value-tracker
description: "Sets an AI use's baseline and attribution before launch, then reports realized ROI. Use to prove an AI pilot's ROI."
---

# AI Value Tracker

Prove what an AI use returns, with numbers that a finance team accepts.

## Input

- The AI use, its business case or target, the measures that matter, data from before launch, and data since launch.

## Method

1. Choose 3 to 5 measures: one financial result, one or two operating measures such as cycle time, volume, or error rate, and one adoption measure.
2. Set the baseline from data before launch over a comparable period. Note seasonal effects and one-off events.
3. Before launch, choose the attribution method, strongest first: a randomized comparison group, a phased start across teams, a matched comparison group, or the trend before launch projected forward. Compare changes, not levels, and check that the groups moved together before launch. State the limits.
4. Agree the measure owners, data sources, and reporting cadence with finance.
5. Report results: actual against baseline and target, and all costs to date, one-off and running, including AI running costs.
6. Separate capacity from captured value. Use `ai-value-capture-plan` output when it exists. Count only captured value as a return.
7. Compute the return on captured value only: net value is captured value minus all costs to date; ROI is net value divided by costs; payback is the month when cumulative captured value first exceeds cumulative cost, or a forecast month.
8. State what the results mean for this use. For decisions across several pilots, use `pilot-to-scale-review`.

## Output

1. Measurement plan: Measure | Definition | Baseline | Target | Source | Owner | Cadence.
2. Value report: Measure | Baseline | Actual | Target | Change.
3. Return summary: Captured value | Capacity (not counted) | Costs | Net value | ROI | Payback month.
4. Note on what the results mean for this use.

## Quality bar

- The baseline and attribution method are fixed before launch, or the report says that only a trend method was possible.
- Costs include AI running costs, not only the first investment.

## Boundaries

- Not for a KPI tree or dashboard design: use `kpi-dashboard`.
- Not for the forecast investment case: use `business-case`.
- Not for programme progress reporting: use `status-report`.
- Not for converting capacity into financial results: use `ai-value-capture-plan`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
