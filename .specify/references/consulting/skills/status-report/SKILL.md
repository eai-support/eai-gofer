---
name: status-report
description: "Writes a programme status report: RAG ratings, milestones, issues, actions and decisions needed. Use for steering updates."
---

# Status Report

Give the steering committee an honest one-page view of progress, and the decisions it must make.

## Input

- The roadmap (from `implementation-roadmap`), updates from workstream leads, KPI definitions and targets (from `kpi-dashboard`) with current values, and the risk register (from `risk-assessment`).

## Method

1. State the reporting period and the audience.
2. Set RAG rules before rating. For KPIs, use the thresholds from `kpi-dashboard`. For milestones and budget, use measurable rules, for example: Green is less than 2 weeks late and less than 5% over budget; Amber is 2 to 4 weeks late or 5% to 10% over, and the team can recover it; Red is worse than Amber, and the steering committee must help.
3. Rate overall status and each workstream from milestone dates, budget, and KPI results, not opinion.
4. Show milestones: planned date, forecast date, and status.
5. Show benefits and KPIs against target.
6. List the top risks from the risk register, with their trend since the last report.
7. Keep logs of issues (problems happening now), actions, and decisions. Give each item one owner and a due date.
8. For each Amber or Red item, give the path to green: action, owner, and date.
9. List each decision needed from the steering committee in one line, with owner and deadline. For a reasoned recommendation, use `decision-memo`.
10. Give the plan for the next period.

## Output

1. One-page status: Overall RAG, Workstream RAG table, Milestones, Budget (plan, actual, forecast), KPIs, Top risks, Decisions needed, Next period.
2. Log tables for Issues, Actions, and Decisions: Item | Owner | Due date | Status.

## Quality bar

- Ratings follow the stated rules. A green summary never hides red details.
- Every open item has one owner and a date.

## Boundaries

- Not for building the risk register: use `risk-assessment`. In a RAID log, take risks from it and dependencies from `implementation-roadmap`.
- Not for defining KPIs: use `kpi-dashboard`.
- Not for re-planning the programme: use `implementation-roadmap`.
- Not for a stand-alone decision request: use `decision-memo`.
- Not for an AI use's realized return: use `ai-value-tracker`; report its figures here.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
