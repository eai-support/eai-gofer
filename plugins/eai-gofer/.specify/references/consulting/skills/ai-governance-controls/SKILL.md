---
name: ai-governance-controls
description: "Sets up AI governance: risk tiers, human oversight levels and lifecycle controls with owners and evidence. Use before AI uses go live or scale."
---

# AI Governance Controls

Set the rules and controls that let an organization use AI safely, with the level of human oversight each use needs.

## Input

- The AI uses in scope, the decisions each affects, the data each uses, the jurisdictions and sector rules that apply, and current policies.

## Method

1. List the AI uses and what each does: drafts, recommends, decides, or acts.
2. For each use, list how it could fail or cause harm: wrong output, unfair treatment, privacy or security breach, over-reliance, and supplier failure.
3. Write criteria for four tiers before rating: prohibited, high, medium, and low. Base them on impact: effect on people, money, safety, or legal rights; how reversible a mistake is; how sensitive the data is; and how much the AI acts on its own. Then rate each use.
4. List the rules that apply: privacy law, sector rules, and AI-specific laws or standards in each jurisdiction. Label each [Unverified] until counsel or the compliance owner confirms it.
5. Set the human oversight level for each tier: a person decides; a person approves each AI recommendation; a person reviews samples; or AI acts within set limits under monitoring.
6. Set controls for each tier across the life of a use: approval to start, independent review before use for high tiers, data protection, checks on held-out cases before use (accuracy and fairness), monitoring (accuracy, override rate, complaints, and drift), incident response, records for audit, supplier checks, notice to affected people, re-approval after a material change, periodic revalidation, and retirement.
7. Name the forum or role that approves uses at each tier, and the escalation path.
8. Give each control an owner, the evidence that proves it works, and a review frequency.
9. Compare the controls with what exists today. List the gaps and the first actions to close them.

## Output

1. AI use register: Use | What it does | Data | Main harms | Risk tier | Oversight level | Approver | Accountable owner.
2. Control matrix: Control | Tiers | Owner | Evidence | Frequency.
3. Tier criteria and oversight levels by tier.
4. Gap list: Gap | Risk | Action | Owner | Date.

## Quality bar

- Every use has a tier and an accountable owner.
- Every control names the evidence that shows it operates, not only a policy statement.

## Boundaries

- Not for risks to delivering a plan: use `risk-assessment`.
- Not for the organization's overall readiness: use `ai-readiness-assessment`.
- Not for assigning tasks between people and AI in one workflow: use `ai-workflow-redesign`.
- Not for standing forums and decision rights: use `operating-model`.
- Not a legal opinion: refer legal questions to counsel.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
