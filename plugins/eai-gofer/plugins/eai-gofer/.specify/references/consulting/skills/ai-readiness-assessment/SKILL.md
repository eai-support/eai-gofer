---
name: ai-readiness-assessment
description: "Scores AI readiness across strategy, data, technology, people, governance and operating model. Use before scaling AI."
---

# AI Readiness Assessment

Show how ready an organization is to get value from AI at scale, and what to fix first.

## Input

- The organization's goals, current AI use and pilots, data sources, core systems, skills, policies, and budget. Interview, survey, or workshop notes help.

## Method

1. Confirm the scope: the whole organization, one business unit, or one function.
2. Before scoring, write what scores of 1, 3, and 5 look like for each dimension. Then score six dimensions from 1 (not started) to 5 (scaled), with evidence for each score:
   - Strategy: an AI ambition tied to business goals, with an owner and a funded plan.
   - Data: the data that priority uses need exists, is accessible, has an owner, and is good enough.
   - Technology: approved AI tools, secure access, and links to core systems.
   - People: AI skills by role, leadership sponsorship, and capacity to change.
   - Governance: AI policy, risk tiers, human oversight, privacy, and regulatory compliance.
   - Operating model: who funds, prioritizes, builds, and runs AI work, and how value is measured.
3. Check the scale gap: count the current pilots that have an owner, a measured result, and a path to everyday use. Use `pilot-to-scale-review` for a decision on each pilot.
4. Set a target score per dimension from the ambition. The gap is the target minus the score. A low score matters only where the ambition needs that dimension.
5. Rank the gaps by effect on value and by effort to close.
6. Recommend the first 3 to 5 actions with owners.

## Output

1. Scorecard: Dimension | Score | Target | Evidence | Gap.
2. Level definitions: Dimension | What 1 looks like | What 3 looks like | What 5 looks like.
3. Pilot summary: Pilots | With owner | With measured result | With path to everyday use.
4. Ranked gaps and first actions: Action | Gap closed | Owner | Effort.
5. A one-paragraph readiness verdict.

## Quality bar

- Every score cites evidence and matches the written level definitions.
- Gaps are measured against target scores set from the ambition, not against a perfect score.

## Boundaries

- Not for finding where AI creates value: use `ai-opportunity-scan`.
- Not for the full target operating model: use `operating-model`.
- Not for general strengths and weaknesses: use `swot-analysis`.
- Not for risks to delivering a plan: use `risk-assessment`.
- Not for one group's readiness to adopt a change: use `change-plan`.
- Not for AI risk tiers and controls: use `ai-governance-controls`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
