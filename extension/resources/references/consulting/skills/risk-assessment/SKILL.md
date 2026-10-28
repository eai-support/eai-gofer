---
name: risk-assessment
description: "Builds a risk register for an approved plan: likelihood, impact, mitigation, owner and trigger. Use to manage delivery risks."
---

# Risk Assessment

Find what could stop the plan from delivering, and decide how to manage it.

## Input

- The plan or recommendation, and its key assumptions and dependencies.

## Method

1. Identify risks that could stop the plan from delivering, across categories: strategic, financial, operational, people, technology, regulatory, reputational, and delivery.
2. Write each risk as cause, event, and consequence. Example: "Because vendor capacity is limited, the migration slips, which delays savings by two quarters."
3. Define both scales before rating. Likelihood: 1 rare (under 10 percent), 2 unlikely (10 to 30), 3 possible (30 to 50), 4 likely (50 to 80), 5 almost certain (over 80). Impact: 1 negligible to 5 severe, with each level set in the client's terms of cost, delay, quality, or harm, and written down. Rate each risk on both. Score = likelihood x impact.
4. Choose a response: avoid, reduce, transfer, or accept.
5. Define mitigation actions, owner, due date, and an early-warning trigger.
6. Rate residual risk after mitigation.
7. Highlight the top 5 risks.

## Output

1. Risk register: # | Risk (cause, event, consequence) | Category | L | I | Score | Response | Mitigation | Owner | Trigger | Residual.
2. Heat map positions and the top 5 risks.

## Quality bar

- Risks are specific events, not vague worries.
- Every high risk has an owner and a trigger.

## Boundaries

- Not for external trends: use `pestel-scan` or `swot-analysis`.
- Not for flexing model inputs: use `sensitivity-analysis`.
- Not for the issue, action, and decision log: use `status-report`.
- Not for controls and oversight of AI uses: use `ai-governance-controls`.
- Not for the rules a process must meet: use `compliance-obligation-map`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
