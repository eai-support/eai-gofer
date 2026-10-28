---
name: ai-value-capture-plan
description: "Plans how AI time savings become P&L results: avoided hires, redeployment, growth or cost cuts. Use before counting savings."
---

# AI Value Capture Plan

Make sure the time AI saves turns into financial results, not only into capacity that nobody uses.

## Input

- The AI uses and redesigned workflows, the time each frees by role, current headcount and hiring plans, growth plans, and budgets.

## Method

1. Convert time saved into capacity: hours per role per period, net of new tasks such as checking AI output. Take net hours by role from `ai-workflow-redesign` when it exists.
2. For each role, choose how the capacity is captured:
   - Avoid planned hiring or contractor spend.
   - Absorb volume growth without new cost.
   - Redeploy people to revenue or service work, with a named target.
   - Reduce cost through natural attrition or a role change.
   - Improve quality or speed, with the financial effect stated.
3. Count each hour once across capture choices. Fractions of a full-time role spread across many people are captured only if the work is pooled; say how.
4. Put each choice into the budget: the line it changes, the amount net of capture costs such as retraining, severance, or backfill, and the period with ramp-up.
5. List the decisions needed and their owners, for example a hiring freeze or a new sales target.
6. Note the effects on people and any consultation needed. Hand off people-side actions to `change-plan`.
7. Hand the captured value to `business-case` as its benefit line. If a case already exists, reconcile with it and explain each gap.

## Output

1. Capacity table: Role | Hours freed | New tasks | Net capacity.
2. Capture plan: Role | Capture choice | Budget line | Gross amount | Capture costs | Net amount | Period | Decision owner.
3. Reconciliation: Claimed value | Captured value | Gap | Reason.

## Quality bar

- Only captured value counts as a financial result. Time saved alone is labeled capacity.
- No hour is counted twice, and each amount links to a budget line and an owner.

## Boundaries

- Not for valuing the investment: use `business-case`.
- Not for measuring results after launch: use `ai-value-tracker`.
- Not for the people-side change plan: use `change-plan`.
- Not for organization design: use `operating-model`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
