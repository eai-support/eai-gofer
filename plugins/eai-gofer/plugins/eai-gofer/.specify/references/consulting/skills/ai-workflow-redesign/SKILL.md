---
name: ai-workflow-redesign
description: "Redesigns one process around AI: task owners, human checks, handoffs and exceptions. Use to redesign work with AI."
---

# AI Workflow Redesign

Redesign one workflow end to end so that people and AI each do the tasks they do best, and the gain reaches the whole workflow.

## Input

- The workflow and its priority AI use, a current-state map (from `process-mapping` when it exists), volumes, times, error rates, and the risk rules that apply.

## Method

1. Start from the outcome the workflow delivers, not from the current steps.
2. Find the constraint: the step that sets the pace of the whole workflow. Faster work at other steps frees capacity but does not raise throughput.
3. Group the work into four stages: capture the request and its context, prepare the decision, carry out the work with others, and resolve, explain, and learn. List the tasks and decisions in each stage. For each, choose who does it: a person, AI with a person checking, or AI alone within set limits.
4. Set the level of AI autonomy by risk, using the oversight levels from `ai-governance-controls` when they exist. High-impact or hard-to-reverse decisions keep a named person accountable.
5. Design the handoffs: what AI passes to a person, what the person checks, and how fast. Check that the review step does not become the new constraint.
6. Design the exceptions: low confidence, missing data, complaints, and errors go to a named role.
7. List the role changes in this workflow: tasks added, tasks removed, and skills needed, as input to `ai-workforce-plan`.
8. Estimate the effect on elapsed time, cost per item, quality, and net hours freed by role, as input to `ai-value-capture-plan`. Label estimates.
9. State the measures that show the workflow works: accuracy, override rate, cycle time, and volume. Take the controls each AI task needs from `ai-governance-controls` when they exist.

## Output

1. Future workflow: Step | Done by (person, AI checked, or AI alone) | Check | Handoff to | Exception route | Time.
2. Constraint analysis: Current constraint | Change | Expected elapsed time.
3. Role changes: Role | Tasks added | Tasks removed | Skills needed | Net hours freed.
4. Measures, and the controls each AI task needs.
5. Expected effect: Measure | Today | Future | Basis.

## Quality bar

- The redesign changes the constraint step, not only individual tasks.
- Every AI task has a check, or a stated reason it needs none.

## Boundaries

- Not for the current-state map and waste analysis: use `process-mapping`.
- Not for organization structure: use `operating-model`.
- Not for turning freed time into financial results: use `ai-value-capture-plan`.
- Not for helping people adopt the new way of working: use `change-plan`.
- Not for who approves each step: use `raci-builder`.
- Not for skills uplift across roles: use `ai-workforce-plan`.
- Not for the records and states the workflow changes: use `business-object-map`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
