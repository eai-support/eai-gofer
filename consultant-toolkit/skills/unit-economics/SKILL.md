---
name: unit-economics
description: "Calculates per-unit or per-customer economics: contribution margin, CAC, LTV, CAC payback and breakeven volume. Use to test if a model makes money."
---

# Unit Economics

Show whether each unit or customer makes money, and which levers matter most.

## Input

- Price, variable costs, acquisition spend, retention or churn, and fixed costs.

## Method

1. Define the unit: order, customer, store, seat, or another unit.
2. Build the unit waterfall: revenue per unit, minus variable costs (goods, fulfillment, payment, support), equals contribution margin.
3. CAC = fully loaded sales and marketing spend / new customers in the same period.
4. LTV = average revenue per period x contribution margin % x expected lifetime in periods. Expected lifetime is about 1 / churn rate. Discount if periods are long. If you use gross margin instead (common in software), say so.
5. LTV to CAC ratio, and CAC payback in months = CAC / (monthly revenue per customer x the same margin %).
6. Breakeven volume = fixed costs / contribution per unit.
7. Show cohorts if the data allows, because blended averages hide decay.
8. Name the 3 levers with the biggest effect.

## Output

1. Unit waterfall table.
2. Ratio table: Metric | Value | Formula | Inputs and sources.
3. Lever summary.

## Quality bar

- Every formula is shown with its inputs.
- CAC and LTV use the same customer definition and period.

## Boundaries

- Not for multi-year projections: use `financial-model`.
- Not for flexing inputs: use `sensitivity-analysis`.
- Hand off to: `pricing-strategy`, `business-case`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
