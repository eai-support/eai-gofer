---
name: implementation-roadmap
description: "Plans phases, workstreams, milestones, dependencies and quick wins on a timeline. Use to turn a recommendation into an executable plan."
---

# Implementation Roadmap

Turn the recommendation into a sequenced plan with clear milestones.

## Input

- The approved recommendation and its initiatives, constraints (budget, people, deadlines), and governance needs.

## Method

1. Group initiatives into 3 to 6 workstreams.
2. For each initiative, define scope, owner, start and end, deliverables, resources, and budget.
3. Set phases, for example: mobilize (0 to 3 months), scale, sustain.
4. Identify quick wins that deliver results within 90 days.
5. Map dependencies and find the critical path.
6. Set milestones and stage gates with clear exit criteria.
7. Set the governance rhythm, for example a weekly delivery meeting and a monthly steering committee.

## Output

1. Roadmap table: Workstream | Initiative | Owner | Start | End | Milestones | Depends on | Budget.
2. A text Gantt chart (a Mermaid gantt block is fine where it renders).
3. Quick wins, critical path, and stage gates.

## Quality bar

- Every initiative has one owner and dated milestones.
- Dependencies are explicit.

## Boundaries

- Not for the people side of change: use `change-plan`.
- Not for roles and decision rights: use `raci-builder`.
- Not for risks: use `risk-assessment`. Not for KPIs: use `kpi-dashboard`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
