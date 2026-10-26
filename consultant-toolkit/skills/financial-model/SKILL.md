---
name: financial-model
description: "Designs a driver-based financial model with inputs, calculations, P&L and cash flow outputs, and checks. Use to project financial performance."
---

# Financial Model

Build a transparent, driver-based projection that others can audit and change.

## Input

- The question the model must answer, historical financials if any, and the key drivers.

## Method

1. State the questions the model answers and the time axis (months or years).
2. Separate three blocks: Inputs (all assumptions in one place, each with a source), Calculations, and Outputs.
3. Build revenue and costs from drivers, for example volume x price and headcount x cost per head.
4. Produce the P&L and cash flow. Add a balance sheet only if the question needs it.
5. Add checks: totals add up, the balance sheet balances, signs are consistent.
6. Do not hard-code numbers inside calculations.
7. Add one switch for scenarios, so `scenario-analysis` and `sensitivity-analysis` can flex inputs.
8. If a spreadsheet or code tool is available, build the model there. Otherwise give Markdown tables with each formula written out.

## Output

1. Model map: blocks and how they link.
2. Assumptions table: Driver | Value | Unit | Source.
3. Output summary: revenue, EBITDA, free cash flow by period.
4. Check results.

## Quality bar

- Any reviewer can trace an output to its inputs.
- All checks pass.

## Boundaries

- Not for the investment decision: use `business-case`.
- Not for per-unit economics: use `unit-economics`.
- Not for flexing inputs: use `sensitivity-analysis` or `scenario-analysis`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
