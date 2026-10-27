---
name: ai-value-tracker
description: "Sets the baseline and attribution for an AI use, then reports realized ROI. Use to prove AI value after launch."
---

# AI Value Tracker

Prove what an AI use returns, with numbers that a finance team accepts.

## Input

- The AI use, its business case or target, the measures that matter, data from before launch, and data since launch.

## Method

1. Choose 3 to 5 measures: one financial result, one or two operating measures such as cycle time, volume, or error rate, and one adoption measure.
2. Set the baseline from data before launch over a comparable period. Note seasonal effects and one-off events.
3. Choose the attribution method, strongest first: a comparison group without the AI use, a phased start across teams, or a before-and-after trend. State its limits.
4. Agree the measure owners, data sources, and reporting cadence with finance.
5. Report results: actual against baseline and target, value realized to date, and costs to date, including AI running costs.
6. Compute the return: net value, ROI, and payback to date.
7. Separate capacity from captured value. Use `ai-value-capture-plan` output when it exists.
8. Recommend the next step: scale, fix, or stop, and why.

## Output

1. Measurement plan: Measure | Definition | Baseline | Target | Source | Owner | Cadence.
2. Value report: Measure | Baseline | Actual | Target | Value to date.
3. Return summary: Value realized | Costs | Net value | ROI | Payback.
4. Next-step recommendation.

## Quality bar

- The baseline and attribution method are fixed before results are reported.
- Costs include AI running costs, not only the first investment.

## Boundaries

- Not for a KPI tree or dashboard design: use `kpi-dashboard`.
- Not for the investment case before launch: use `business-case`.
- Not for programme progress reporting: use `status-report`.
- Not for converting capacity into financial results: use `ai-value-capture-plan`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
