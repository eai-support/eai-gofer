---
name: compliance-obligation-map
description: "Maps the rules a regulated process must meet to obligations, controls, evidence, owners and deadlines. Use to plan compliance for a process."
---

# Compliance Obligation Map

Show every rule a process must meet, how each is met, and the evidence that proves it, so that gaps are found before a regulator, funder, or auditor finds them.

## Input

- The process in scope, the entities, products, and jurisdictions it covers, the rule sources that apply, current policies and controls, and recent audit or inspection findings.

## Method

1. Set the scope: the process, entities, products, and jurisdictions.
2. List the rule sources: laws, regulations, licence conditions, standards, contracts, funder or accreditor terms, and internal policies, in force or with a set start date. Label each [Unverified] until counsel or the compliance owner confirms that it applies.
3. Break each source into obligations, one action or outcome each, written as who must do what, by when, and for which cases. Cite the clause, and label your reading [Unverified] until counsel or the compliance owner confirms it.
4. Link each obligation to the process step and the records it touches. Reuse `process-mapping` output when it exists.
5. For each obligation, name the control that meets it (preventive or detective, manual or automated), the evidence it produces, the owner, the frequency or deadline, and the record kept.
6. Rate each obligation met, partly met, or not met from evidence seen, not from policy alone. Rate the severity of a breach: fine, loss of licence, harm to people, or damage to reputation.
7. Build a calendar of recurring filings, reports, renewals, and owner attestations. Name who watches each source for changes and when the register is next reviewed.
8. List the gaps and first actions with owners, and the questions for counsel.

## Output

1. Obligation register: Obligation | Source and clause | Start date | Applies to | Process step | Owner.
2. Control and evidence map: Obligation | Control | Type | Evidence | Frequency | Status.
3. Compliance calendar: Obligation | Deadline | Frequency | Owner.
4. Gap list: Gap | Severity | Action | Owner | Date.
5. Questions for counsel.
6. A note that this is a working map, not legal advice or an audit opinion.

## Quality bar

- Every obligation cites its source, and every unconfirmed source is labeled.
- Every control names the evidence that shows it operates.

## Boundaries

- Not a legal opinion: refer legal questions to counsel.
- Not for controls on AI uses: use `ai-governance-controls`.
- Not for risks to delivering a plan: use `risk-assessment`.
- Not for proposed rules or regulatory trends: use `pestel-scan`.
- Not for accountability for activities: use `raci-builder`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
