---
name: status-report
description: "Writes a programme status report with RAG ratings, milestones, issues, actions and decisions needed. Use for steering committee updates."
---

# Status Report

Give the steering committee an honest one-page view of progress, and the decisions it must make.

## Input

- The roadmap (from `implementation-roadmap`), updates from workstream leads, KPI results (from `kpi-dashboard`), and the risk register (from `risk-assessment`).

## Method

1. State the reporting period and the audience.
2. Set RAG rules before rating. Green: on track. Amber: at risk, and the team can recover it. Red: off track, and the steering committee must help.
3. Rate overall status and each workstream from milestone dates, budget, and KPI results, not opinion.
4. Show milestones: planned date, forecast date, and status.
5. Show benefits and KPIs against target.
6. List the top risks from the risk register, with their trend.
7. Keep logs of issues (problems happening now), actions, and decisions. Give each item one owner and a due date.
8. For each Amber or Red item, give the path to green: action, owner, and date.
9. State the decisions needed from the steering committee, with options and a deadline.
10. Give the plan for the next period.

## Output

1. One-page status: Overall RAG, Workstream RAG table, Milestones, KPIs, Top risks, Decisions needed, Next period.
2. Log tables for Issues, Actions, and Decisions: Item | Owner | Due date | Status.

## Quality bar

- Ratings follow the stated rules. A green summary never hides red details.
- Every open item has one owner and a date.

## Boundaries

- Not for building the risk register: use `risk-assessment`.
- Not for defining KPIs: use `kpi-dashboard`.
- Not for re-planning the programme: use `implementation-roadmap`.
- Not for a stand-alone decision request: use `decision-memo`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
