---
name: swot-analysis
description: "Consolidates findings into an evidence-based SWOT with strategic implications. Use to summarize strategic position."
---

# SWOT Analysis

Summarize the strategic position in one evidence-based view, then state what it implies.

## Input

- External findings (from `pestel-scan`, `five-forces`) and internal findings (from `value-chain`, `vrio-analysis`, `competitor-benchmark`). If absent, draft from context and label items [Assumption].

## Method

1. Strengths and weaknesses are internal and relative to competitors.
2. Opportunities and threats are external conditions, not actions.
3. Write 3 to 5 specific items per quadrant. Attach evidence to each.
4. Rank items within each quadrant by importance.
5. Cross the quadrants (TOWS) to state implications:
   - SO: use strengths to capture opportunities.
   - WO: fix weaknesses to capture opportunities.
   - ST: use strengths to blunt threats.
   - WT: reduce exposure where weak and threatened.

## Output

1. SWOT grid with evidence per item.
2. Implications table: Type (SO, WO, ST, WT) | Implication.

## Quality bar

- No item appears in two quadrants.
- No actions in the opportunities quadrant.
- Implications are themes, not a list of projects.

## Boundaries

- Not for generating or choosing strategic options: use `strategic-options`.
- Not for growth avenues: use `growth-strategy`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
