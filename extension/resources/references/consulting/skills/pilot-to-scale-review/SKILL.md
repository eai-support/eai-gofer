---
name: pilot-to-scale-review
description: "Decides scale, fix or stop for each AI pilot from value, adoption, data, controls and ownership gates. Use when AI pilots stall."
---

# Pilot To Scale Review

Decide what to do with each AI pilot, so effort moves to the few that can reach everyday use.

## Input

- A list of current AI pilots with their goal, business owner, results to date, users, costs, data sources, and control status.

## Method

1. List every pilot with its goal, owner, start date, spend to date, and run cost if scaled.
2. Test each pilot against five gates, each pass, partial, or fail, with evidence:
   - Value: a measured result against a baseline and target, from `ai-value-tracker` when it exists.
   - Adoption: the intended users use it in their normal work.
   - Data: the data it needs is available at full scale, with an owner and acceptable quality.
   - Controls: the required approvals and controls are in place, from `ai-governance-controls` when they exist.
   - Ownership: a business owner and a funded running budget exist.
3. Name the main reason each stalled pilot is stuck: no measured value, low adoption, data not ready, controls not cleared, no owner or budget, or the work around it was not redesigned.
4. Decide for each pilot: scale (all gates pass or close), fix (one or two gates fail with a clear fix), or stop (value is not proven and the fix costs more than it returns). Ignore money already spent.
5. For each fix, state the action, owner, date, and the gate it clears. For each stop, state what is kept, such as data or lessons.
6. Summarize the portfolio: pilots by decision, budget freed by stops, and the few pilots to back.

## Output

1. Gate table: Pilot | Owner | Value | Adoption | Data | Controls | Ownership | Main blocker.
2. Decision list: Pilot | Decision | Reason | Action | Owner | Date.
3. Portfolio summary: Scale | Fix | Stop | Budget freed.

## Quality bar

- Every gate rating cites evidence, not the sponsor's opinion alone.
- A pilot is scaled only when its value is measured, not forecast.

## Boundaries

- Not for finding new AI uses: use `ai-opportunity-scan`.
- Not for the organization's overall readiness: use `ai-readiness-assessment`.
- Not for testing a new use on client data: use `ai-bootcamp-design`.
- Not for the rollout plan of the pilots that scale: use `implementation-roadmap`.
- Not for business unit portfolio roles: use `portfolio-matrix`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
