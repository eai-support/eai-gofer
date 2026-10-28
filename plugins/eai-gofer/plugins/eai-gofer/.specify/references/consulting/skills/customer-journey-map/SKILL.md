---
name: customer-journey-map
description: "Maps a customer journey and service blueprint: stages, touchpoints, pain points, moments that matter and back-office causes. Use to improve customer experience."
---

# Customer Journey Map

Show one journey as the customer lives it, find where it fails them, and trace each failure to its cause behind the scenes.

## Input

- The customer segment and the journey in scope, with customer evidence: interviews, complaints, survey comments, contact reasons, and channel data. Staff knowledge of the back office helps.

## Method

1. Choose one segment (from `customer-segmentation` when it exists) and one journey, with a start and end in the customer's words, for example from "I need to make a claim" to "I have been paid".
2. Gather the evidence. Reuse `interview-synthesis` or `survey-analysis` output when it exists.
3. Map the stages as the customer sees them. For each stage, record the customer's goal, actions, touchpoints and channels, what they think and feel, waiting time, and effort.
4. Mark the pain points and the moments that matter, where trust is won or lost. Give each its evidence and how often it happens.
5. Add the service blueprint below the customer's view: front-stage staff actions, back-stage actions, systems and data, and hand-offs. Link each pain point to its back-stage cause.
6. Add the measures per stage where data exists: drop-off, time, effort score, and satisfaction.
7. Design the future journey for the top pain points: remove steps, give proactive updates, add self-service or AI help, and meet accessibility needs.
8. List the improvements with their expected effect on the customer measures and on the cost to serve.

## Output

1. Journey table: Stage | Customer goal | Actions | Touchpoints | Thoughts and feelings | Pain points | Moment that matters.
2. Service blueprint: Stage | Front stage | Back stage | Systems and data | Cause of pain point.
3. Measures by stage.
4. Future journey and improvements: Improvement | Pain point fixed | Effect | Effort | Owner.
5. Optional: a Mermaid journey diagram where it renders.

## Quality bar

- Every pain point rests on customer evidence, not staff opinion alone.
- Every pain point links to a back-stage cause.

## Boundaries

- Not for defining customer segments: use `customer-segmentation`.
- Not for internal process steps and waste: use `process-mapping`.
- Not for redesigning a workflow around AI: use `ai-workflow-redesign`.
- Not for coding raw interview notes: use `interview-synthesis`.
- Not for a KPI tree: use `kpi-dashboard`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
