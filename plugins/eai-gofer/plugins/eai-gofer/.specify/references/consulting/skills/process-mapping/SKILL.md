---
name: process-mapping
description: "Maps one process end to end, finds waste and root causes, and designs the future state. Use to fix a slow or costly process."
---

# Process Mapping

Show how one business process works today, why it underperforms, and how it should work.

## Input

- The process to map, where it starts and ends, and data on volumes, times, errors, and costs. Interview or workshop notes help.

## Method

1. Set boundaries: the trigger that starts the process, the output that ends it, and what is out of scope.
2. Build a SIPOC: suppliers, inputs, 5 to 7 high-level steps, outputs, and customers.
3. Map the current state step by step: role, action, hand-off, and the system or document used.
4. Measure each step: volume, touch time, waiting time, and error or rework rate. Total the elapsed time and the share that adds value for the customer.
5. Find waste: waiting, rework, extra hand-offs, extra approvals, duplicate data entry, and idle capacity.
6. For the top 3 pain points, find root causes with 5 whys or a fishbone diagram.
7. Design the future state: remove, combine, and simplify steps before you automate them. Note role changes as input to `change-plan`. If AI will take on tasks, stop after the root causes and hand the current state to `ai-workflow-redesign`.
8. List improvements with their expected effect on time, cost, and quality.

## Output

1. SIPOC table.
2. Current-state table: Step | Role | Action | Hand-off to | Touch time | Wait time | Error rate | Adds value (Y/N) | Pain point.
3. Root causes for the top pain points.
4. Future-state steps and an improvement list: Improvement | Effect | Effort | Owner.
5. Optional: a Mermaid flowchart where it renders.

## Quality bar

- Times and volumes come from data or are labeled.
- Root causes are checked against data, and explain why a problem happens, not what the symptom is.

## Boundaries

- Not for firm-wide activity costs: use `value-chain`.
- Not for redesigning a workflow around AI: use `ai-workflow-redesign`.
- Not for the records, states, and actions a process uses: use `business-object-map`.
- Not for the customer's view of the journey: use `customer-journey-map`.
- Not for organization design: use `operating-model`.
- Not for valuing an improvement that needs investment: use `business-case`.
- Not for helping people adopt the new process: use `change-plan`.
- Not for sequencing improvements: use `implementation-roadmap`.
- Not for who approves each step: use `raci-builder`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
