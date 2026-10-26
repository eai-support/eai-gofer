---
name: business-case
description: "Builds an investment case against a base case with costs, benefits, NPV, IRR, payback and the funding ask. Use to justify funding a decision."
---

# Business Case

Show whether an investment is worth making, compared with not making it.

## Input

- The proposed initiative, the base case, cost and benefit estimates or cash flows (from `financial-model` if one is built), the discount rate, the hurdle rate, and the time horizon.

## Method

1. State the decision and the options, including the base case.
2. Use the incremental view: project cash flows minus base case cash flows.
3. List costs: one-off (capex, implementation) and ongoing (opex).
4. List benefits: revenue, cost savings, avoided costs or risks, and non-financial benefits.
5. Phase costs and benefits over time, including ramp-up.
6. Compute NPV at the discount rate, IRR, and payback. Compare IRR with the hurdle rate. Rank exclusive options by NPV, because IRR can mislead when options differ in size or cash flows change sign.
7. State key assumptions with confidence levels.
8. Summarize the main risks and link to the risk register.
9. State the ask: amount, phasing, decision gates, and owner.

## Output

1. One-page case: Decision, Recommendation, Ask, NPV, IRR, Payback, Key assumptions, Risks, Non-financial benefits.
2. Cash flow table by period: Costs | Benefits | Net | Cumulative.

## Quality bar

- Benefits are incremental to the base case, with no double counting.
- The discount rate and its basis are stated.

## Boundaries

- Not for building the model mechanics: use `financial-model`.
- Not for the detailed risk register: use `risk-assessment`.
- Hand off to: `decision-memo`, `sensitivity-analysis`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
