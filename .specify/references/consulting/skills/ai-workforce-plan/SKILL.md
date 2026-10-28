---
name: ai-workforce-plan
description: "Plans how AI changes each role and job: task mix, role profiles, skill gaps and AI training paths. Use to prepare staff for AI."
---

# AI Workforce Plan

Show how AI changes the work of each role, and plan how people gain the skills the new roles need.

## Input

- The roles in scope with headcount, their main tasks and time spent, the AI uses and redesigned workflows, hiring plans, and the training budget.

## Method

1. List the roles in scope with headcount and the main tasks of each, with the share of time each task takes.
2. Rate each task: automated, assisted (with the share of its time AI saves), or unchanged, and mark whether the change is planned or only possible. Weight by time share to get each role's share of time affected. Reuse `ai-workflow-redesign` output when it exists.
3. Show the future task mix for each role: tasks removed, tasks added such as checking AI output and handling exceptions, and time freed. Take net hours freed from `ai-workflow-redesign` when it exists; do not recount them.
4. Write a short future role profile for each role group: purpose, main tasks, and decisions it owns.
5. Find the skill gaps for each role group: AI literacy, judging and checking AI output, domain skills that grow in value, and new technical skills. Define a proficiency scale per skill, and rate the current level from a test, a manager rating, or a self-rating, naming the source.
6. Choose how to close each gap: train, hire, redeploy, or partner. Plan a learning path by role group with format, duration, cost, and timing that matches the rollout.
7. Set the measures: share of staff at target proficiency, use of AI in daily work, and retention of key people.
8. Note the people risks and any consultation needed. Hand adoption communications for one change to `change-plan`.

## Output

1. Role impact table: Role | Headcount | Share of time affected | Planned or possible | Tasks added | Time freed.
2. Future role profiles.
3. Skill gap matrix: Role group | Skill | Current level | Target level | How to close | Owner.
4. Uplift plan: Role group | Learning path | Format | Duration | Cost | Timing.
5. Measures and people risks.

## Quality bar

- Time freed comes from task data or is labeled an estimate.
- Each skill gap has a closing route and an owner.

## Boundaries

- Not for adoption communications and training on one new process: use `change-plan`.
- Not for turning freed time into financial results: use `ai-value-capture-plan`.
- Not for organization structure: use `operating-model`.
- Not for task design inside one workflow: use `ai-workflow-redesign`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
