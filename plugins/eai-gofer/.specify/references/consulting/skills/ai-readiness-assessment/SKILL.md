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
2. Score six dimensions from 1 (not started) to 5 (scaled), with evidence for each score:
   - Strategy: an AI ambition tied to business goals, with an owner and a funded plan.
   - Data: the data that priority uses need exists, is accessible, has an owner, and is good enough.
   - Technology: approved AI tools, secure access, and links to core systems.
   - People: AI skills by role, leadership sponsorship, and capacity to change.
   - Governance: AI policy, risk tiers, human oversight, privacy, and regulatory compliance.
   - Operating model: who funds, prioritizes, builds, and runs AI work, and how value is measured.
3. Check the scale gap: list current pilots and record whether each has an owner, a measured result, and a path to everyday use.
4. Compare the scores with the ambition. A low score matters only where the ambition needs that dimension.
5. Rank the gaps by effect on value and by effort to close.
6. Recommend the first 3 to 5 actions with owners.

## Output

1. Scorecard: Dimension | Score (1 to 5) | Evidence | Gap to ambition.
2. Pilot table: Pilot | Owner | Measured result | Path to everyday use (Y/N).
3. Ranked gaps and first actions: Action | Gap closed | Owner | Effort.
4. A one-paragraph readiness verdict.

## Quality bar

- Every score cites evidence, not opinion alone.
- Gaps are judged against the stated ambition, not against a perfect score.

## Boundaries

- Not for finding where AI creates value: use `ai-opportunity-scan`.
- Not for the full target operating model: use `operating-model`.
- Not for general strengths and weaknesses: use `swot-analysis`.
- Not for risks to delivering a plan: use `risk-assessment`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
