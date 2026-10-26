---
name: chart-selection
description: "Chooses the chart type that best proves one message for the data's shape, and rejects weaker options. Use before building any chart."
---

# Chart Selection

Pick the chart that proves the message fastest.

## Input

- The message the chart must prove, and the data (fields, number of categories, series, and time points).

## Method

1. Classify the message, then shortlist:
   - Ranking or comparison: sorted bar (horizontal when labels are long).
   - Change over time: line; columns for few periods.
   - Part-to-whole: stacked or 100% bar; pie only for 2 to 3 parts.
   - Distribution: histogram or box plot.
   - Relationship: scatter; bubble when a third measure matters.
   - Variance from a reference: diverging bar.
   - Bridge from A to B: waterfall. Flow between stages: Sankey.
   - Position on two criteria: 2x2 scatter.
   - Location: map, only if geography drives the message.
   - Exact values for lookup: table.
2. Check the data shape: too many categories, series, or labels can rule out an option.
3. Avoid 3D, dual axes, and decoration unless they are essential.
4. Recommend one chart and one fallback. State why the others are weaker.

## Output

Table: Message type | Recommended chart | Fallback | Rejected options and why | Encoding notes (x, y, color, sort).

## Quality bar

- The choice follows from the message, not from the data alone.

## Boundaries

- Not for building or styling the chart: use `data-visualization`.
- Not for the story across several charts: use `data-storytelling`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
